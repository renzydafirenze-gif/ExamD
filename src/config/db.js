// ============================================
// ExamD - Konfigurasi Database PostgreSQL
// (siap deploy ke Vercel serverless)
//
// Koneksi memakai process.env.DATABASE_URL
// Semua query memakai placeholder $1, $2, ...
// ============================================

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.warn(
    '[ExamD] PERINGATAN: DATABASE_URL tidak diset. Fallback ke PostgreSQL lokal.'
  );
}

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/examd';

const pool = new Pool({
  connectionString,
  // Provider cloud (Vercel/Neon/Supabase/Railway) menuntut SSL.
  // Koneksi lokal (localhost) tanpa SSL.
  ssl: /localhost|127\.0\.0\.1/.test(connectionString)
    ? false
    : { rejectUnauthorized: false },
});

// Koneksi idle yang error di background tidak boleh membuat proses mati
pool.on('error', (err) => {
  console.error('[ExamD] PostgreSQL pool error:', err.message);
});

// ------------------------------------------------------------
// Helper query
// ------------------------------------------------------------

async function query(text, params = []) {
  return pool.query(text, params);
}

// Helper transaksi: fn menerima client khusus (BEGIN ... COMMIT otomatis)
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------
// Migrasi: buat tabel jika belum ada (idempoten, aman untuk
// cold-start serverless)
// ------------------------------------------------------------

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      username   TEXT        NOT NULL UNIQUE,
      password   TEXT        NOT NULL,
      points     INTEGER     NOT NULL DEFAULT 0 CHECK (points >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id             SERIAL PRIMARY KEY,
      subject        TEXT        NOT NULL,
      question       TEXT        NOT NULL,
      options        TEXT        NOT NULL,
      correct_answer INTEGER     NOT NULL,
      difficulty     TEXT        NOT NULL DEFAULT 'LOTS'
                     CHECK (difficulty IN ('LOTS','HOTS')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Seed akun demo (hanya jika tabel users masih kosong)
  const { rows } = await query('SELECT COUNT(*)::int AS total FROM users');
  if (rows[0].total === 0) {
    const hashed = bcrypt.hashSync('demo123', 10);
    await query(
      'INSERT INTO users (username, password, points) VALUES ($1, $2, 0)',
      ['demo', hashed]
    );
    console.log('[DB] Seed: 1 user demo dibuat (username: demo / password: demo123)');
  }

  // Tambah index untuk performa lookup yang sering dipakai
  await query(
    'CREATE INDEX IF NOT EXISTS idx_quizzes_subject ON quizzes (lower(subject))'
  );
  await query('CREATE INDEX IF NOT EXISTS idx_users_lower_username ON users (lower(username))');
}

// ------------------------------------------------------------
// Helper: ambil daftar mata pelajaran unik
// ------------------------------------------------------------

async function getSubjects() {
  const { rows } = await query(
    'SELECT DISTINCT subject FROM quizzes ORDER BY subject'
  );
  return rows.map((row) => row.subject);
}

module.exports = { pool, query, withTransaction, initDb, getSubjects };
