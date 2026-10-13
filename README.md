# Patungan Asik

Web app split bill buat jalan bareng teman: tol, bensin, makan, GoFood, Gojek, main.
Bisa foto struk dan isinya kebaca otomatis lewat Gemini.

## Isi folder

```
patungan-asik/
├─ public/index.html                     ← aplikasinya
├─ netlify/edge-functions/scan-struk.js  ← perantara ke Gemini (API key aman di sini)
└─ netlify.toml                          ← pengaturan Netlify
```

## 1. Ambil API key Gemini (gratis)

1. Buka https://aistudio.google.com/apikey dan login pakai akun Google.
2. Klik **Create API key**, lalu salin key-nya.
3. Jangan pernah taruh key ini di `index.html` atau di-commit ke GitHub.

## 2. Deploy ke Netlify

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

- Data patungan tersimpan di browser HP masing-masing (localStorage). Hasilnya dibagikan lewat tombol **Salin buat WhatsApp**.
- Free tier Gemini punya batas request per menit/hari. Kalau kena, app bakal bilang jatahnya lagi penuh.
- Di free tier, Google bisa memakai isi foto untuk mengembangkan produknya. Aman buat struk makan, jangan dipakai buat dokumen pribadi.
- Siapa pun yang tahu link app-mu bisa memakai jatah Gemini-mu. Jangan sebar link-nya ke publik.
