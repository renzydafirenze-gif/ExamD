// ============================================================
// ExamD - seed.js (PostgreSQL)
// Mengisi tabel quizzes dengan bank soal Kelas 10 SMA
// (Kurikulum Merdeka - Fase E) dari src/data/*.js
//
// Pemakaian :  node seed.js
// Perilaku  :  mengosongkan tabel quizzes, lalu memasukkan
//              seluruh soal dari file data per mapel.
//              Data user & poin tidak terpengaruh.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');

const { query, withTransaction, initDb, pool } = require('./src/config/db');

// ------------------------------------------------------------
// Muat semua file data soal dari src/data/
// Setiap file mengekspor { subject, items: [{ q, o, a, d }] }
// ------------------------------------------------------------

const dataDir = path.join(__dirname, 'src', 'data');

const banks = fs
  .readdirSync(dataDir)
  .filter((file) => file.endsWith('.js'))
  .sort()
  .map((file) => {
    const bank = require(path.join(dataDir, file));

    // Validasi struktur tiap bank soal
    if (!bank.subject || typeof bank.subject !== 'string') {
      throw new Error(`${file}: properti "subject" tidak valid`);
    }
    if (!Array.isArray(bank.items) || bank.items.length === 0) {
      throw new Error(`${file}: "items" kosong atau bukan array`);
    }
    bank.items.forEach((it, i) => {
      if (typeof it.q !== 'string' || !it.q.trim()) {
        throw new Error(`${file} item #${i}: "q" tidak valid`);
      }
      if (!Array.isArray(it.o) || it.o.length !== 4) {
        throw new Error(`${file} item #${i}: "o" harus 4 opsi`);
      }
      if (!Number.isInteger(it.a) || it.a < 0 || it.a > 3) {
        throw new Error(`${file} item #${i}: "a" harus 0-3`);
      }
      if (it.d !== 'LOTS' && it.d !== 'HOTS') {
        throw new Error(`${file} item #${i}: "d" harus LOTS/HOTS`);
      }
    });

    return bank;
  });

// ------------------------------------------------------------
// Eksekusi seed
// ------------------------------------------------------------

async function run() {
  try {
    // Pastikan tabel ada (membuat + seed user demo jika perlu)
    await initDb();

    await withTransaction(async (client) => {
      await client.query('DELETE FROM quizzes');

      for (const bank of banks) {
        for (const it of bank.items) {
          await client.query(
            'INSERT INTO quizzes (subject, question, options, correct_answer, difficulty) VALUES ($1, $2, $3, $4, $5)',
            [bank.subject, it.q, JSON.stringify(it.o), it.a, it.d]
          );
        }
      }
    });

    // ------------------------------------------------------------
    // Verifikasi & laporan
    // ------------------------------------------------------------

    const total = await query('SELECT COUNT(*)::int AS total FROM quizzes');
    const perSubject = await query(
      `SELECT subject,
              COUNT(*)::int AS jumlah,
              COUNT(*) FILTER (WHERE difficulty = 'HOTS')::int AS hots
       FROM quizzes GROUP BY subject ORDER BY subject`
    );

    const width = Math.max(...perSubject.rows.map((r) => r.subject.length));
    console.log('=================================================');
    console.log(' ExamD - Seed database berhasil!');
    console.log('=================================================');
    console.log(` Total soal : ${total.rows[0].total} (${banks.length} mapel)`);
    console.log('-------------------------------------------------');
    for (const row of perSubject.rows) {
      const name = row.subject.padEnd(width);
      const bar = '\u2588'.repeat(row.jumlah);
      console.log(` ${name}  ${String(row.jumlah).padStart(3)} soal  ${bar}  (${row.hots} HOTS)`);
    }
    console.log('=================================================');

    // Peringatan mapel yang soalnya kurang dari target
    const kurang = perSubject.rows.filter((r) => r.jumlah < 25);
    if (kurang.length > 0) {
      console.log(' PERINGATAN: mapel berikut < 25 soal:');
      kurang.forEach((r) => console.log(`   - ${r.subject}: ${r.jumlah} soal`));
    }
  } catch (err) {
    console.error('[ExamD] Seed gagal:', err.code || err.message || err.name);
    for (const cause of err.errors || []) {
      console.error(' ', cause.code, cause.address, cause.port);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
