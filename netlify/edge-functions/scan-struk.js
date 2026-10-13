// Netlify Edge Function: terima foto struk dari app, minta AI membacanya, balikin JSON hasil bacaan.
// Urutan: Groq dulu (GROQ_API_KEY), kalau gagal/tidak dipasang lanjut ke Gemini (GEMINI_API_KEY).
// API key disimpan di environment variable Netlify, jadi nggak pernah kelihatan di browser.

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
const MAX_B64 = 6_000_000;
const BUSY = new Set([500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = (k) => (Netlify.env.get(k) || "").trim();

const reply = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function parseJson(text) {
  text = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

async function errText(res) {
  const raw = await res.text();
  try { return String(JSON.parse(raw)?.error?.message || raw).slice(0, 300); } catch { return raw.slice(0, 300); }
}

// Hasil tiap provider: {ok:true,data,by} atau {ok:false,status,code,detail}
const fail = (status, code, detail = "") => ({ ok: false, status, code, detail });

/* ---------- Groq ---------- */
function groqOnce(key, model, mime, image, signal, withReasoning) {
  const m = mime === "image/heic" || mime === "image/heif" ? "image/jpeg" : mime;
  const body = {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: `data:${m};base64,${image}` } },
      ],
    }],
  };
  if (withReasoning) body.reasoning_format = "hidden";
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
}

async function viaGroq(key, mime, image, signal) {
  const model = env("GROQ_MODEL") || "qwen/qwen3.8-27b";
  let res = await groqOnce(key, model, mime, image, signal, true);
  if (res.status === 400) {
    const d = await errText(res);
    if (/reasoning/i.test(d)) res = await groqOnce(key, model, mime, image, signal, false);
    else return fail(400, "groq", `Groq: ${d}`);
  }
  if (BUSY.has(res.status)) { await sleep(1200); res = await groqOnce(key, model, mime, image, signal, false); }
  if (res.status === 429) return fail(429, "quota", "Groq: jatah gratis lagi penuh");
  if (res.status === 401 || res.status === 403) return fail(res.status, "bad_key", `Groq: ${await errText(res)}`);
  if (!res.ok) return fail(res.status, BUSY.has(res.status) ? "busy" : "groq", `Groq ${res.status}: ${await errText(res)}`);
  const data = await res.json();
  const parsed = parseJson(data?.choices?.[0]?.message?.content);
  return parsed ? { ok: true, data: parsed, by: `groq:${model}` } : fail(422, "unreadable", "Groq: jawaban bukan JSON");
}

/* ---------- Gemini ---------- */
const GAPI = "https://generativelanguage.googleapis.com/v1beta";
let flashCache = null;
async function listFlashModels(key) {
  if (flashCache) return flashCache;
  const res = await fetch(`${GAPI}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  if (!res.ok) return [];
  const { models = [] } = await res.json();
  const ok = models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /flash/i.test(n) && !/(tts|image|live|audio|embedding|thinking|exp)/i.test(n));
  const rank = (n) => (/preview/i.test(n) ? 2 : 0) + (/lite/i.test(n) ? 1 : 0);
  return (flashCache = ok.sort((a, b) => rank(a) - rank(b)));
}
function geminiOnce(key, model, mime, image, signal) {
  return fetch(`${GAPI}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
    signal,
  });
}
async function viaGemini(key, mime, image, signal) {
  let model = env("GEMINI_MODEL") || "gemini-flash-latest";
  let res = await geminiOnce(key, model, mime, image, signal);
  if (res.status === 404) {
    const list = await listFlashModels(key);
    if (list[0] && list[0] !== model) { model = list[0]; res = await geminiOnce(key, model, mime, image, signal); }
  }
  if (BUSY.has(res.status)) {
    const others = (await listFlashModels(key)).filter((n) => n !== model).slice(0, 2);
    for (const alt of others) {
      res = await geminiOnce(key, alt, mime, image, signal);
      if (!BUSY.has(res.status) && res.status !== 404) { model = alt; break; }
    }
  }
  if (res.status === 429) return fail(429, "quota", "Gemini: jatah gratis lagi penuh");
  if (!res.ok) {
    const d = await errText(res);
    const code = /api key/i.test(d) || res.status === 401 || res.status === 403 ? "bad_key" : BUSY.has(res.status) ? "busy" : "gemini";
    return fail(res.status, code, `Gemini ${res.status}: ${d}`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const parsed = parseJson(text);
  return parsed ? { ok: true, data: parsed, by: `gemini:${model}` } : fail(422, "unreadable", "Gemini: jawaban bukan JSON");
}

/* ---------- handler ---------- */
export default async (req) => {
  if (req.method !== "POST") return reply(405, { code: "method" });

  const groqKey = env("GROQ_API_KEY"), geminiKey = env("GEMINI_API_KEY");
  if (!groqKey && !geminiKey) return reply(500, { code: "no_key" });

  let body;
  try { body = await req.json(); } catch { return reply(400, { code: "bad_request" }); }
  const { image, mime } = body || {};
  if (typeof image !== "string" || !image) return reply(400, { code: "bad_request" });
  if (!ALLOWED.includes(mime)) return reply(400, { code: "bad_type" });
  if (image.length > MAX_B64) return reply(413, { code: "too_large" });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 38_000);
  const tries = [];
  if (groqKey) tries.push(() => viaGroq(groqKey, mime, image, ctl.signal));
  if (geminiKey) tries.push(() => viaGemini(geminiKey, mime, image, ctl.signal));

  const errors = [];
  try {
    for (const t of tries) {
      let r;
      try { r = await t(); }
      catch (e) {
        if (e?.name === "AbortError") break;
        r = fail(502, "network", String(e?.message || e).slice(0, 200));
      }
      if (r.ok) {
        const out = r.data && typeof r.data === "object" ? r.data : {};
        if (!out.error) return reply(200, { ...out, _by: r.by });
        errors.push(fail(422, "unreadable", "struk tidak terbaca"));
        break; // AI sudah lihat fotonya dan bilang tidak terbaca: nggak perlu coba provider lain
      }
      console.error("scan gagal", r.status, r.detail);
      errors.push(r);
    }
  } finally {
    clearTimeout(timer);
  }

  if (!errors.length) return reply(504, { code: "timeout" });
  const pick = errors.find((e) => e.code === "unreadable") || errors.find((e) => e.code === "bad_key") || errors[errors.length - 1];
  const status = pick.code === "unreadable" ? 422 : pick.code === "quota" ? 429 : pick.code === "busy" ? 503 : 502;
  return reply(status, { code: pick.code, status: pick.status, detail: errors.map((e) => e.detail).filter(Boolean).join(" | ").slice(0, 400) });
};

export const config = { path: "/api/scan-struk" };
