# Patungan Asik

Web app split bill buat jalan bareng teman: tol, bensin, makan, GoFood, Gojek, main.
Bisa foto struk dan isinya kebaca otomatis lewat AI (Groq dulu, Gemini sebagai cadangan).

Halaman utamanya "Laci Struk": tiap acara jadi satu struk kecil, yang belum lunas di paling atas.
Fitur bantuan: porsi beda per orang untuk satu menu, "Pesan yang sama" buat nyalin menu teman,
rekening/e-wallet di tiap transfer, dan catat cepat tol/bensin/parkir pakai nominal terakhir.

## Isi folder

```
patungan-asik/
  public/index.html                     aplikasinya
  public/firebase-config.js             config Firebase buat patungan bareng (opsional)
  lib/scan-core.js                      inti pembaca struk (dipakai Vercel & Netlify)
  api/scan-struk.js                     pembungkus untuk Vercel
  netlify/edge-functions/scan-struk.js  pembungkus untuk Netlify
  vercel.json, netlify.toml             pengaturan hosting
```

API key AI cuma disimpan di pengaturan hosting, nggak pernah ada di kode atau di browser.

## 1. Ambil API key AI (gratis)

Groq dicoba duluan, Gemini jadi cadangan. Cukup salah satu, lebih aman dua-duanya.

**Groq:** buka https://console.groq.com/keys, login, klik **Create API Key**, salin key-nya.

**Gemini:**

1. Buka https://aistudio.google.com/apikey dan login pakai akun Google.
2. Klik **Create API key**, lalu salin key-nya.
3. Jangan pernah taruh key ini di `index.html` atau di-commit ke GitHub.

## 2a. Deploy ke Vercel (gratis, otomatis tiap push)

1. Buka https://vercel.com, login pakai akun GitHub.
2. **Add New → Project**, pilih repo `patungan-asik`, klik **Import**.
3. Framework Preset: **Other**. Build Command dan Install Command biarkan kosong.
   Output Directory sudah diatur `public` lewat `vercel.json`.
4. Buka **Environment Variables**, tambahkan `GROQ_API_KEY` dan/atau `GEMINI_API_KEY`
   (opsional: `GROQ_MODEL`, `GEMINI_MODEL`).
5. Klik **Deploy**. Alamatnya jadi `nama-proyek.vercel.app`.
6. Kalau API key ditambah/diganti setelah deploy: **Deployments → ⋯ → Redeploy** supaya kepakai.

Catatan Vercel: paket Hobby untuk pemakaian pribadi/non-komersial. Batas waktu fungsi diatur 60 detik
di `vercel.json` (baca struk biasanya 5–20 detik). Foto dikecilkan dulu di HP sebelum dikirim,
jadi aman di bawah batas ukuran request Vercel.

## 2b. Deploy ke Netlify

Netlify Drop (drag & drop folder) **tidak** menjalankan function, jadi pakai salah satu cara ini.

### Cara A: lewat GitHub (paling gampang buat update)

1. Upload folder `patungan-asik` ke repo GitHub baru.
2. Di Netlify: **Add new site → Import an existing project → GitHub**, pilih repo-nya.
3. Build command dikosongkan aja. Publish directory otomatis kebaca `public` dari `netlify.toml`.
4. Klik **Deploy**.

### Cara B: lewat Netlify CLI

```bash
npm install -g netlify-cli
cd patungan-asik
netlify login
netlify init          # buat site baru, misal patungan-asik
netlify deploy --prod
```

## 3. Pasang API key di Netlify

Pasang `GROQ_API_KEY` (dicoba duluan) dan/atau `GEMINI_API_KEY` (cadangan). Langkahnya sama untuk keduanya.

1. Buka site-nya di Netlify → **Site configuration → Environment variables**.
2. Tambah variabel:
   - Key: `GEMINI_API_KEY`
   - Value: key dari langkah 1
3. **Deploys → Trigger deploy → Deploy site** supaya key-nya kepakai.

Opsional: `GEMINI_MODEL` buat ganti model (default `gemini-flash-latest`).
Nama model yang tersedia bisa dicek di AI Studio.

## Coba di laptop dulu

Bikin file `.env` di folder `patungan-asik` (jangan di-commit):

```
GEMINI_API_KEY=isi_key_kamu
```

Lalu jalankan:

```bash
netlify dev
```

Buka alamat yang muncul (biasanya http://localhost:8888).
Kalau `index.html` dibuka langsung dari file, fitur foto struk nggak jalan karena butuh server.

## Catatan

- Semua acara di laci tersimpan di browser HP masing-masing (localStorage). Hasilnya dibagikan lewat tombol **Salin buat WhatsApp**.
- Patungan bareng (satu link diedit ramai-ramai) baru aktif setelah `public/firebase-config.js` diisi config Firebase.
- Free tier Gemini punya batas request per menit/hari. Kalau kena, app bakal bilang jatahnya lagi penuh.
- Di free tier, Google bisa memakai isi foto untuk mengembangkan produknya. Aman buat struk makan, jangan dipakai buat dokumen pribadi.
- Siapa pun yang tahu link app-mu bisa memakai jatah Gemini-mu. Jangan sebar link-nya ke publik.
