// ============================================================
// ExamD - REST API (Express.js) - PostgreSQL Edition
// Autentikasi : express-session (cookie-based session)
// Database    : PostgreSQL (pg) - siap deploy Vercel serverless
// ============================================================

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');

const { pool, query, withTransaction, initDb } = require('./src/config/db');
const { generateLesson } = require('./src/gemini');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serverless tidak menjalankan cabang app.listen; siapkan DB sebelum API dipakai.
let databaseReady;
app.use('/api', (req, res, next) => {
  if (!databaseReady) {
    databaseReady = initDb().catch(error => {
      databaseReady = undefined;
      throw error;
    });
  }
  databaseReady.then(() => next(), next);
});

if (process.env.NODE_ENV === 'production') {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET wajib diatur di produksi.');
  }
  app.set('trust proxy', 1);
}

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
      // ponytail: tanpa timer serverless; sesi kedaluwarsa ditolak saat dibaca.
      // Tambahkan pembersihan terjadwal jika tabel sesi membesar.
      pruneSessionInterval: false,
    }),
    secret: process.env.SESSION_SECRET || 'examd-dev-secret-ganti-di-produksi',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24, // 1 hari
    },
  })
);

// Folder public/ untuk frontend
app.use(express.static(path.join(__dirname, 'public')));

// Bungkus handler async agar error tertangkap error handler terpusat
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Middleware: pastikan user sudah login
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  }
  next();
}

// Poin yang didapat per jawaban benar
const POINTS_PER_CORRECT = 10;

app.post('/api/learn', requireAuth, asyncHandler(async (req, res, next) => {
  try {
    const result = await generateLesson(req.body?.topic, req.body?.mode || 'explain');
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.name === 'TimeoutError' || err instanceof TypeError) {
      return res.status(502).json({ error: 'Koneksi Gemini gagal atau terlalu lama. Coba lagi.' });
    }
    next(err);
  }
}));

// ============================================================
// AUTH: Register
// POST /api/register  body: { username, password }
// ============================================================

app.post(
  '/api/register',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    // Validasi input
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username dan password wajib diisi.' });
    }
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.trim().length < 3 ||
      username.trim().length > 30
    ) {
      return res.status(400).json({
        error: 'Username harus berupa teks 3-30 karakter.',
      });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }

    const cleanUsername = username.trim();

    // Cek username sudah dipakai (case-insensitive)
    const existing = await query(
      'SELECT id FROM users WHERE lower(username) = lower($1)',
      [cleanUsername]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username sudah terdaftar.' });
    }

    // Simpan user baru dengan poin awal 0 (password di-hash)
    const hashed = bcrypt.hashSync(password, 10);
    const inserted = await query(
      'INSERT INTO users (username, password, points) VALUES ($1, $2, 0) RETURNING id, username, points',
      [cleanUsername, hashed]
    );
    const user = inserted.rows[0];

    // Langsung login setelah register
    req.session.user = { id: user.id, username: user.username };

    res.status(201).json({
      message: 'Registrasi berhasil.',
      user,
    });
  })
);

// ============================================================
// AUTH: Login
// POST /api/login  body: { username, password }
// ============================================================

app.post(
  '/api/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username dan password wajib diisi.' });
    }

    const result = await query(
      'SELECT id, username, password, points FROM users WHERE lower(username) = lower($1)',
      [String(username).trim()]
    );
    const user = result.rows[0];

    // Pesan error sama untuk username/password salah (jangan bocorkan mana yang salah)
    if (!user || !bcrypt.compareSync(String(password), user.password)) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    req.session.user = { id: user.id, username: user.username };

    res.json({
      message: 'Login berhasil.',
      user: { id: user.id, username: user.username, points: user.points },
    });
  })
);

// ============================================================
// AUTH: Logout
// POST /api/logout
// ============================================================

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Gagal logout.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout berhasil.' });
  });
});

// ============================================================
// USER: Profil & poin user yang sedang login
// GET /api/user
// ============================================================

app.get(
  '/api/user',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      'SELECT id, username, points, created_at FROM users WHERE id = $1',
      [req.session.user.id]
    );
    const user = result.rows[0];

    if (!user) {
      // User terhapus tapi session masih ada
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang.' });
    }

    res.json({
      user,
      greeting: `Selamat datang di ExamD, ${user.username}!`,
    });
  })
);

// ============================================================
// QUIZ: Daftar pertanyaan per mata pelajaran
// GET /api/quizzes/:subject
// ============================================================

app.get(
  '/api/quizzes/:subject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const subject = req.params.subject.trim();

    const result = await query(
      'SELECT id, subject, question, options, difficulty FROM quizzes WHERE lower(subject) = lower($1) ORDER BY id',
      [subject]
    );
    const quizzes = result.rows;

    if (quizzes.length === 0) {
      return res
        .status(404)
        .json({ error: `Mata pelajaran "${subject}" tidak ditemukan.` });
    }

    // Parse kolom options (JSON string) menjadi array
    // PENTING: correct_answer TIDAK dikirim ke client (anti-curang)
    const data = quizzes.map((q) => ({
      id: q.id,
      subject: q.subject,
      question: q.question,
      options: JSON.parse(q.options),
      difficulty: q.difficulty || 'LOTS',
    }));

    res.json({ subject, total: data.length, quizzes: data });
  })
);

// ============================================================
// QUIZ: Submit jawaban & tambah poin
// POST /api/submit-quiz
// body: { subject: "Fisika", answers: [{ id: 5, answer: 2 }, ...] }
// ============================================================

app.post(
  '/api/submit-quiz',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { subject, answers } = req.body || {};

    // Validasi struktur input
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ error: 'Field "subject" wajib diisi.' });
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      return res
        .status(400)
        .json({ error: 'Field "answers" harus berisi daftar jawaban.' });
    }

    // Ambil semua soal untuk subject tersebut dalam satu query
    const rowsResult = await query(
      'SELECT id, correct_answer FROM quizzes WHERE lower(subject) = lower($1)',
      [subject.trim()]
    );
    const rows = rowsResult.rows;

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: `Mata pelajaran "${subject}" tidak ditemukan.` });
    }

    // Map id -> kunci jawaban
    const answerKey = new Map(rows.map((row) => [row.id, row.correct_answer]));

    // Hitung jawaban benar
    let correctCount = 0;
    const results = [];

    for (const item of answers) {
      const quizId = Number(item && item.id);
      const userAnswer = Number(item && item.answer);

      if (!Number.isInteger(quizId) || !answerKey.has(quizId)) {
        results.push({ id: item && item.id, valid: false, correct: false });
        continue;
      }
      if (!Number.isInteger(userAnswer) || userAnswer < 0 || userAnswer > 3) {
        results.push({ id: quizId, valid: false, correct: false });
        continue;
      }

      const isCorrect = userAnswer === answerKey.get(quizId);
      if (isCorrect) correctCount++;
      results.push({ id: quizId, valid: true, correct: isCorrect });
    }

    const earnedPoints = correctCount * POINTS_PER_CORRECT;

    // Update poin user secara atomik (transaksi)
    const updatedUser = await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET points = points + $1 WHERE id = $2',
        [earnedPoints, req.session.user.id]
      );
      const { rows } = await client.query(
        'SELECT id, username, points FROM users WHERE id = $1',
        [req.session.user.id]
      );
      return rows[0];
    });

    res.json({
      message: 'Quiz berhasil disubmit.',
      subject: subject.trim(),
      totalQuestions: rows.length,
      answered: results.filter((r) => r.valid).length,
      correctCount,
      wrongCount: results.filter((r) => r.valid && !r.correct).length,
      pointsEarned: earnedPoints,
      pointsPerCorrect: POINTS_PER_CORRECT,
      results,
      user: updatedUser,
    });
  })
);

// ============================================================
// Health check & daftar mapel
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'ExamD' });
});

app.get('/api/subjects', asyncHandler(async (req, res) => {
  const subjects = await query(
    'SELECT DISTINCT subject FROM quizzes ORDER BY subject'
  );
  res.json({ subjects: subjects.rows.map((row) => row.subject) });
}));

// ============================================================
// Error Handling Terpusat
// ============================================================

// 404 untuk route API yang tidak ada
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

// Error handler terpusat
app.use((err, req, res, next) => {
  // Error JSON body tidak valid (dari express.json)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Format JSON tidak valid.' });
  }

  // Error unik PostgreSQL (duplicate key) -> username sudah dipakai
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Username sudah terdaftar.' });
  }

  console.error('[ExamD Error]', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

// ============================================================
// Start Server (lokal) / Export (serverless Vercel)
// ============================================================

if (require.main === module) {
  // Jalankan migrasi & seed ringan lalu start server (mode lokal)
  initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`ExamD API berjalan di http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[ExamD] Gagal inisialisasi database:', err.code || err.message || err.name);
      for (const cause of err.errors || []) {
        console.error(' ', cause.code, cause.address, cause.port);
      }
      process.exit(1);
    });
}

module.exports = app;
