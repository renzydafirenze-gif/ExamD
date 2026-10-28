# ExamD 📚

Website belajar **Quiz interaktif** untuk materi **Kelas 10 SMA** (Kurikulum Merdeka - Fase E).

## Tech Stack

- **Frontend** : HTML, Vanilla JavaScript, CSS token sendiri (`public/styles.css`), font Bebas Neue + EB Garamond
- **Backend**  : Node.js + Express.js
- **Database** : **PostgreSQL** (library `pg`) — siap deploy Vercel serverless

## Struktur Folder

```
ExamD/
├── server.js            # Entry point Express + REST API (juga export untuk Vercel)
├── api/[...path].js     # Fungsi serverless Vercel: teruskan /api/* ke server.js
├── seed.js              # Seed 350 soal dari src/data/ ke PostgreSQL
├── vercel.json          # Deploy Vercel: region, cache header (static via CDN)
├── package.json
├── .env.example         # Contoh environment variables
├── src/
│   ├── config/
│   │   └── db.js        # Pool PostgreSQL, helper query & transaksi, migrasi
│   ├── data/            # Bank soal per mapel (14 file x 25 soal)
│   └── routes/          # (dicadangkan untuk refactor lanjutan)
└── public/              # Frontend (login, dashboard, quiz)
    ├── index.html       # Pengalih ke dashboard
    ├── login.html
    ├── dashboard.html
    ├── quiz.html
    ├── styles.css       # Token warna/tipe + seluruh gaya halaman
    ├── assets/          # Foto arsip (kredit di footer tiap halaman)
    └── js/ (app.js, quiz.js, learn.js, ui.js)
```

## Skema Database (PostgreSQL)

### Tabel `users`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | SERIAL | Primary key |
| username | TEXT | Unique (lookup case-insensitive) |
| password | TEXT | Hash bcrypt |
| points | INTEGER | Total poin, default 0 |
| created_at | TIMESTAMPTZ | Default now() |

### Tabel `quizzes`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | SERIAL | Primary key |
| subject | TEXT | Mata pelajaran (14 mapel Kelas X) |
| question | TEXT | Teks pertanyaan |
| options | TEXT | JSON string 4 opsi |
| correct_answer | INTEGER | Index 0-3 (tidak pernah dikirim ke client) |
| difficulty | TEXT | `LOTS` / `HOTS` |
| created_at | TIMESTAMPTZ | Default now() |

## Menjalankan Lokal

```bash
# 1. Install dependencies
npm install

# 2. Siapkan environment
cp .env.example .env
# edit .env -> DATABASE_URL & SESSION_SECRET

# 3. Buat tabel + seed 350 soal
npm run seed

# 4. Jalankan server
npm run dev
```

Buka http://localhost:3000 — akun demo: `demo` / `demo123`.

## Deploy ke Vercel

1. **Buat database PostgreSQL cloud** — [Neon](https://neon.tech) (gratis, cocok serverless) atau Supabase/Railway. Salin connection string-nya.

2. **Push repo ke GitHub**, lalu import di [vercel.com](https://vercel.com/new).

3. **Set Environment Variables** di Vercel (Project Settings → Environment Variables):
   | Nama | Nilai |
   |---|---|
   | `DATABASE_URL` | connection string dari Neon/Supabase |
   | `SESSION_SECRET` | string acak panjang (`openssl rand -base64 32`) |
   | `NODE_ENV` | `production` |

4. **Deploy** — `vercel.json` menyajikan `public/` langsung dari CDN Vercel; hanya `/api/*` yang masuk ke fungsi (`api/[...path].js` → `server.js`).

5. **Seed database** sekali dari komputer lokal (arahkan ke DB cloud):
   ```bash
   DATABASE_URL="postgresql://...neon.tech/examd?sslmode=require" npm run seed
   ```
   Alternatif: set env `DB_AUTOINIT=1` agar fungsi membuat tabel + seed sendiri saat request pertama, lalu hapus lagi setelah deploy sukses (lebih lambat, hanya untuk sekali jalan).

### Catatan Serverless

- Static (HTML/CSS/JS/gambar) disajikan Vercel, bukan fungsi; cache diatur di `vercel.json`.
- `initDb()` **tidak** jalan di produksi kecuali `DB_AUTOINIT=1` — supaya cold start ringan.
- `regions: ["sin1"]` (Singapura) di `vercel.json`. Ganti ke region terdekat dengan **database** kalau latensi DB masih tinggi.
- Pakai connection string **pooled** (`...-pooler.neon.tech`) agar tiap invocation tak membuka koneksi TCP/TLS baru.
- Session memakai `connect-pg-simple`; tabel `user_sessions` dibuat otomatis. Produksi wajib `SESSION_SECRET` + HTTPS.
- Pool `pg` dengan SSL otomatis aktif untuk host cloud (bukan localhost).

## API Endpoints

| Method | Endpoint | Auth | Fungsi |
|---|---|---|---|
| POST | `/api/register` | — | Daftar user (poin awal 0) |
| POST | `/api/login` | — | Login (bcrypt + session) |
| POST | `/api/logout` | — | Logout |
| GET | `/api/user` | ✅ | Profil + poin + sapaan |
| GET | `/api/quizzes/:subject` | ✅ | Soal per mapel (dengan difficulty) |
| POST | `/api/submit-quiz` | ✅ | Validasi jawaban + tambah poin |
| GET | `/api/subjects` | — | Daftar mapel yang punya soal |
| GET | `/api/health` | — | Health check |
