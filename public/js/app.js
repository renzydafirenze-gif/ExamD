// ============================================================
// ExamD - Frontend Logic (Vanilla JavaScript)
// Halaman: login.html, dashboard.html, quiz.html (quiz di quiz.js)
// ============================================================

'use strict';

// ------------------------------------------------------------
// Helper: fetch API dengan JSON + penanganan error
// ------------------------------------------------------------
async function api(path, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  let res;
  try {
    res = await fetch(path, config);
  } catch {
    throw new Error('Tidak dapat terhubung ke server.');
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // Response bukan JSON — biarkan data kosong
  }

  if (!res.ok) {
    throw new Error(data.error || 'Terjadi kesalahan pada server.');
  }
  return data;
}

// Escape teks agar aman dimasukkan ke HTML
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Tampilkan pesan di kotak alert (halaman login)
function showAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  box.hidden = false;
  box.textContent = message;
  box.className = 'alert ' + (type === 'error' ? 'is-error' : 'is-ok');
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  box.hidden = true;
}

// Auth guard: redirect ke login jika belum masuk.
// Mengembalikan data user jika valid.
async function requireLogin() {
  try {
    const data = await api('/api/user');
    return data.user;
  } catch {
    window.location.href = '/login.html';
    return null;
  }
}

// ============================================================
// HALAMAN LOGIN  (/login.html)
// ============================================================
function initLoginPage() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  function switchTab(showRegister) {
    hideAlert();
    formRegister.hidden = !showRegister;
    formLogin.hidden = showRegister;
    tabRegister.setAttribute('aria-pressed', String(showRegister));
    tabLogin.setAttribute('aria-pressed', String(!showRegister));
    if (showRegister) {
      document.getElementById('reg-username').focus();
    } else {
      document.getElementById('login-username').focus();
    }
  }

  tabLogin.addEventListener('click', () => switchTab(false));
  tabRegister.addEventListener('click', () => switchTab(true));

  // ---- Submit Login ----
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Memproses\u2026';

    try {
      await api('/api/login', {
        method: 'POST',
        body: {
          username: document.getElementById('login-username').value,
          password: document.getElementById('login-password').value,
        },
      });
      window.location.href = '/dashboard.html';
    } catch (err) {
      showAlert(err.message);
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });

  // ---- Submit Register ----
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    // Validasi sederhana di sisi client
    if (username.length < 3 || username.length > 30) {
      return showAlert('Username harus 3-30 karakter.');
    }
    if (password.length < 6) {
      return showAlert('Password minimal 6 karakter.');
    }
    if (password !== confirm) {
      return showAlert('Konfirmasi password tidak sama.');
    }

    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = 'Memproses\u2026';

    try {
      await api('/api/register', {
        method: 'POST',
        body: { username, password },
      });
      window.location.href = '/dashboard.html';
    } catch (err) {
      showAlert(err.message);
      btn.disabled = false;
      btn.textContent = 'Daftar';
    }
  });
}

// ============================================================
// HALAMAN DASHBOARD  (/dashboard.html)
// ============================================================

// Daftar mata pelajaran Kelas 10 SMA (Kurikulum Merdeka - Fase E),
// dikelompokkan: wajib & peminatan/pilihan.
// Ketersediaan quiz dicek lewat /api/subjects.
const ALL_SUBJECTS = [
  // ---- Kelompok Wajib ----
  { name: 'Bahasa Indonesia', desc: 'Teks, sastra, menulis kreatif', group: 'Wajib' },
  { name: 'Bahasa Inggris', desc: 'Reading, writing, conversation', group: 'Wajib' },
  { name: 'Matematika', desc: 'Eksponen, logaritma, statistik', group: 'Wajib' },
  { name: 'Pendidikan Pancasila', desc: 'Pancasila, UUD, hak & kewajiban', group: 'Wajib' },
  { name: 'Seni dan Budaya', desc: 'Seni rupa, musik, tari, teater', group: 'Wajib' },
  { name: 'PJOK', desc: 'Kebugaran, olahraga, kesehatan', group: 'Wajib' },
  { name: 'Informatika', desc: 'Algoritma, pemrograman, data', group: 'Wajib' },

  // ---- Kelompok Peminatan / Pilihan ----
  { name: 'Fisika', desc: 'Gerak, gaya, hukum Newton', group: 'Peminatan' },
  { name: 'Kimia', desc: 'Zat, atom, ikatan kimia', group: 'Peminatan' },
  { name: 'Biologi', desc: 'Makhluk hidup, sel, ekosistem', group: 'Peminatan' },
  { name: 'Sejarah', desc: 'Ilmu sejarah & peradaban', group: 'Peminatan' },
  { name: 'Geografi', desc: 'Ruang, peta, fenomena bumi', group: 'Peminatan' },
  { name: 'Ekonomi', desc: 'Pasar, kebutuhan, ekonomi digital', group: 'Peminatan' },
  { name: 'Sosiologi', desc: 'Masyarakat, interaksi sosial', group: 'Peminatan' },
];

async function initDashboardPage() {
  const user = await requireLogin();
  if (!user) return;

  // Sapaan + identitas + poin
  document.getElementById('greeting-name').textContent = ', ' + user.username;
  document.getElementById('nav-user').textContent = user.username;
  document.getElementById('user-points').textContent = user.points;

  // ---- Logout ----
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login.html';
    }
  });

  // ---- Render lajurof mata pelajaran ----
  const grid = document.getElementById('subject-grid');

  let available = [];
  try {
    const data = await api('/api/subjects');
    available = data.subjects;
  } catch {
    // Jika gagal, anggap semua belum tersedia
  }

  const rowHTML = (subject) => {
    const isActive = available.includes(subject.name);
    const tagOpen = isActive ? 'a' : 'div';
    const tagClose = isActive ? 'a' : 'div';
    const href = isActive
      ? ` href="/quiz.html?subject=${encodeURIComponent(subject.name)}"`
      : '';
    const meta = isActive
      ? '<span class="row-meta"><span class="num">25</span><span>soal</span></span>'
      : '<span class="row-meta">Segera</span>';

    return `
      <${tagOpen}${href} class="row rise${isActive ? '' : ' is-off'}" ${isActive ? '' : 'aria-disabled="true"'}>
        <span class="bubble" aria-hidden="true"></span>
        <span class="row-id">
          <span class="row-name">${escapeHTML(subject.name)}</span>
          <span class="row-desc">${escapeHTML(subject.desc)}</span>
        </span>
        ${meta}
      </${tagClose}>`;
  };

  const groups = ['Wajib', 'Peminatan'];
  grid.innerHTML = groups
    .map((group) => {
      const list = ALL_SUBJECTS.filter((s) => s.group === group);
      return `<p class="group rise">${group}</p><div class="rows">${list.map(rowHTML).join('')}</div>`;
    })
    .join('');

  // Amati elemen hasil render JS untuk lapisan masuk
  const rises = grid.querySelectorAll('.rise');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    rises.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    rises.forEach((el) => io.observe(el));
  }
}

// ============================================================
// Deteksi halaman berdasarkan path URL
// (quiz.html ditangani oleh quiz.js terpisah)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  if (path.includes('login.html')) {
    initLoginPage();
  } else if (path.includes('dashboard.html')) {
    initDashboardPage();
  }
});
