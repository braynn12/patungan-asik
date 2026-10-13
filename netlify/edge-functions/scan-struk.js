// Netlify Edge Function: terima foto struk dari app, kirim ke Gemini, balikin JSON hasil bacaan.
// API key disimpan di environment variable Netlify (GEMINI_API_KEY), jadi nggak pernah kelihatan di browser.

const PROMPT = `Kamu membaca foto struk/nota pembelian dari Indonesia (restoran, kafe, warung, GoFood, GrabFood, ShopeeFood, minimarket).
Ekstrak isinya dan balas HANYA satu objek JSON dengan bentuk persis:
{"store":string|null,"items":[{"name":string,"qty":number,"unit_price":number}],"discount_amount":number,"discount_percent":number|null,"service_amount":number,"service_percent":number|null,"tax_amount":number,"tax_percent":number|null,"fee_amount":number,"total":number|null}
Aturan:
- Semua uang dalam Rupiah sebagai angka bulat tanpa titik/koma (contoh "25.000" -> 25000).
- unit_price adalah harga SATUAN. Kalau struk hanya menulis harga baris untuk qty lebih dari 1, bagi dengan qty.
- Jangan masukkan subtotal, pajak/PB1, service charge, diskon, promo, voucher, ongkir, biaya layanan, pembulatan, atau total sebagai item.
- Topping/tambahan yang tercetak di bawah sebuah menu dan punya harga sendiri dijadikan item terpisah.
- discount_amount = jumlah semua diskon/promo/voucher sebagai angka positif (0 kalau tidak ada). discount_percent diisi hanya kalau tertulis persennya dan berlaku ke seluruh belanja.
- service_amount/tax_amount = nominal yang tertera (0 kalau tidak ada); *_percent diisi kalau persennya tertulis.
- fee_amount = ongkir + biaya layanan/aplikasi/kemasan/platform/penanganan (0 kalau tidak ada).
- total = total akhir yang dibayar menurut struk.
- Nama menu ditulis rapi seperti di struk, singkatan boleh dibiarkan.
Kalau gambar bukan struk atau tidak terbaca, balas {"error":"tidak terbaca"}.`;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_B64 = 6_000_000; // ~4.5 MB foto

const reply = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

const API = "https://generativelanguage.googleapis.com/v1beta";
let autoModel = null; // model hasil pencarian otomatis, disimpan selama function hidup

// Daftar model Flash yang tersedia untuk API key ini, urut dari yang paling cocok.
let flashCache = null;
async function listFlashModels(key) {
  if (flashCache) return flashCache;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  if (!res.ok) return [];
  const { models = [] } = await res.json();
  const ok = models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /flash/i.test(n) && !/(tts|image|live|audio|embedding|thinking|exp)/i.test(n));
  const rank = (n) => (/preview/i.test(n) ? 2 : 0) + (/lite/i.test(n) ? 1 : 0);
  flashCache = ok.sort((a, b) => rank(a) - rank(b));
  return flashCache;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUSY = new Set([500, 503, 504]);

async function callGemini(model, key, mime, image, signal) {
  return fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
    signal,
  });
}

async function geminiError(res) {
  const raw = await res.text();
  let msg = raw;
  try { msg = JSON.parse(raw)?.error?.message || raw; } catch {}
  return String(msg).slice(0, 300);
}

export default async (req) => {
  if (req.method !== "POST") return reply(405, { code: "method" });

  const key = (Netlify.env.get("GEMINI_API_KEY") || "").trim();
  if (!key) return reply(500, { code: "no_key" });
  let model = (Netlify.env.get("GEMINI_MODEL") || "").trim() || autoModel || "gemini-flash-latest";

  let body;
  try { body = await req.json(); } catch { return reply(400, { code: "bad_request" }); }
  const { image, mime } = body || {};
  if (typeof image !== "string" || !image) return reply(400, { code: "bad_request" });
  if (!ALLOWED.includes(mime)) return reply(400, { code: "bad_type" });
  if (image.length > MAX_B64) return reply(413, { code: "too_large" });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 38_000);
  try {
    let res = await callGemini(model, key, mime, image, ctl.signal);

    // Model tidak dikenal: pakai model Flash pertama yang tersedia.
    if (res.status === 404) {
      const list = await listFlashModels(key);
      if (list[0] && list[0] !== model) {
        model = autoModel = list[0];
        res = await callGemini(model, key, mime, image, ctl.signal);
      }
    }

    // Server Gemini lagi penuh: tunggu sebentar, coba lagi, lalu pindah ke model Flash lain.
    if (BUSY.has(res.status)) {
      await sleep(1500);
      res = await callGemini(model, key, mime, image, ctl.signal);
    }
    if (BUSY.has(res.status)) {
      const others = (await listFlashModels(key)).filter((n) => n !== model).slice(0, 3);
      for (const alt of others) {
        res = await callGemini(alt, key, mime, image, ctl.signal);
        if (!BUSY.has(res.status) && res.status !== 404) { model = alt; break; }
      }
    }
    if (BUSY.has(res.status)) return reply(503, { code: "busy" });

    if (res.status === 429) return reply(429, { code: "quota" });
    if (!res.ok) {
      const detail = await geminiError(res);
      console.error("Gemini error", res.status, model, detail);
      const code = /api key/i.test(detail) || res.status === 401 || res.status === 403 ? "bad_key" : "gemini";
      return reply(502, { code, status: res.status, model, detail });
    }
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const parsed = parseJson(text);
    if (!parsed) return reply(422, { code: "unreadable" });
    return reply(200, parsed);
  } catch (e) {
    if (e?.name === "AbortError") return reply(504, { code: "timeout" });
    console.error(e);
    return reply(502, { code: "gemini", detail: String(e?.message || e).slice(0, 300) });
  } finally {
    clearTimeout(timer);
  }
};

export const config = { path: "/api/scan-struk" };
