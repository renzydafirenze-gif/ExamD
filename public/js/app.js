// ============================================================
// ExamD - Frontend Logic (Vanilla JavaScript)
// Halaman: login.html, dashboard.html (quiz di quiz.js)
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
    // Response bukan JSON, biarkan data kosong
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

// Skor terbaik per mapel disimpan di perangkat ini saja.
function bestKey(subject) {
  return 'examd:best:' + subject;
}

function getBest(subject) {
  try {
    return Number(localStorage.getItem(bestKey(subject))) || 0;
  } catch {
    return 0;
  }
}

function setBest(subject, accuracy) {
  try {
    if (accuracy > getBest(subject)) localStorage.setItem(bestKey(subject), String(accuracy));
  } catch {
    // localStorage bisa diblokir; abaikan.
  }
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
  if (box) box.hidden = true;
}

// Auth guard: redirect ke login jika belum masuk.
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
    btn.textContent = 'Memproses…';

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
    btn.textContent = 'Memproses…';

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

  // ---- Soal contoh: boleh dicoba tanpa akun ----
  const demoOpts = document.querySelectorAll('.demo-opt');
  const demoFeedback = document.getElementById('demo-feedback');
  const DEMO_CORRECT = 1; // 2^3 + 2^2 = 12

  demoOpts.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pick = Number(btn.dataset.pick);
      demoOpts.forEach((b) => b.classList.remove('is-ok', 'is-bad'));
      btn.classList.add(pick === DEMO_CORRECT ? 'is-ok' : 'is-bad');
      demoFeedback.classList.toggle('is-ok', pick === DEMO_CORRECT);
      demoFeedback.classList.toggle('is-bad', pick !== DEMO_CORRECT);
      demoFeedback.textContent =
        pick === DEMO_CORRECT
          ? 'Benar. 2³ = 8, 2² = 4, jadi jawabannya 12.'
          : 'Belum tepat. Coba pilihan lain.';
    });
  });
}

// ============================================================
// HALAMAN DASHBOARD  (/dashboard.html)
// ============================================================

// Daftar mata pelajaran Kelas 10 SMA (Kurikulum Merdeka - Fase E)
const ALL_SUBJECTS = [
  { name: 'Bahasa Indonesia', desc: 'Teks, sastra, menulis kreatif', group: 'Wajib' },
  { name: 'Bahasa Inggris', desc: 'Reading, writing, conversation', group: 'Wajib' },
  { name: 'Matematika', desc: 'Eksponen, logaritma, statistik', group: 'Wajib' },
  { name: 'Pendidikan Pancasila', desc: 'Pancasila, UUD, hak & kewajiban', group: 'Wajib' },
  { name: 'Seni dan Budaya', desc: 'Seni rupa, musik, tari, teater', group: 'Wajib' },
  { name: 'PJOK', desc: 'Kebugaran, olahraga, kesehatan', group: 'Wajib' },
  { name: 'Informatika', desc: 'Algoritma, pemrograman, data', group: 'Wajib' },
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

  document.getElementById('greeting-name').textContent = ', ' + user.username;
  document.getElementById('nav-user').textContent = user.username;
  document.getElementById('user-points').textContent = user.points;
  document.getElementById('points-big').textContent = user.points;

  // ---- Logout ----
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login.html';
    }
  });

  let available = [];
  try {
    const data = await api('/api/subjects');
    available = data.subjects;
  } catch {
    // Jika gagal, anggap semua belum tersedia
  }

  // ---- Mulai cepat: satu mapel acak yang tersedia ----
  document.getElementById('quick-start').addEventListener('click', () => {
    const pool = ALL_SUBJECTS.filter((s) => available.includes(s.name));
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    window.location.href = '/quiz.html?subject=' + encodeURIComponent(pick.name);
  });

  // ---- Saring + cari ----
  const grid = document.getElementById('subject-grid');
  const search = document.getElementById('subject-search');
  const count = document.getElementById('subject-count');
  const filters = [...document.querySelectorAll('.filter')];
  let group = 'all';

  function matchesQuery(subject, query) {
    if (!query) return true;
    const hay = (subject.name + ' ' + subject.desc).toLowerCase();
    return hay.includes(query);
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const shown = ALL_SUBJECTS.filter(
      (s) => (group === 'all' || s.group === group) && matchesQuery(s, query)
    );

    count.innerHTML =
      shown.length === 0
        ? 'Tidak ada mapel yang cocok.'
        : `<strong>${shown.length}</strong> mapel ditampilkan`;

    grid.innerHTML = shown
      .map((subject, index) => {
        const isActive = available.includes(subject.name);
        const best = getBest(subject.name);
        const wide = index === 0 && shown.length > 2 ? ' is-wide' : '';
        const tag = isActive ? 'a' : 'div';
        const href = isActive
          ? ` href="/quiz.html?subject=${encodeURIComponent(subject.name)}"`
          : ' aria-disabled="true"';
        const meta = isActive ? '25 soal' : 'Segera';
        const bestLabel = best ? `<span class="subj-best">Terbaik ${best}%</span>` : '';

        return `
          <${tag}${href} class="subject rise${wide}${isActive ? '' : ' is-off'}" style="--d:${Math.min(index * 30, 240)}ms">
            <span class="subj-top">
              <span class="bubble" aria-hidden="true">${escapeHTML(subject.name[0])}</span>
              <span class="subj-meta">${meta}</span>
            </span>
            <span class="subj-name">${escapeHTML(subject.name)}</span>
            <span class="subj-desc">${escapeHTML(subject.desc)}</span>
            <span class="subj-best-line">${bestLabel}</span>
          </${tag}>`;
      })
      .join('');

    reveal(grid.querySelectorAll('.rise'));
  }

  function reveal(items) {
    if (!items.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      group = btn.dataset.filter;
      filters.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      render();
    });
  });

  search.addEventListener('input', render);
  render();
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
