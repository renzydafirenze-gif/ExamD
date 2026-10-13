// ============================================================
// ExamD - Frontend Logic (Vanilla JavaScript)
// Halaman: login.html, dashboard.html, quiz.html
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
  box.textContent = message;
  box.className =
    'mb-4 text-sm rounded-lg px-4 py-3 transition-all duration-200 ' +
    (type === 'error'
      ? 'bg-red-50 text-red-600'
      : 'bg-green-50 text-green-700');
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  box.className = 'hidden';
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

  const ACTIVE_TAB = 'flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200 bg-white text-indigo-600 shadow-sm';
  const INACTIVE_TAB = 'flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200 text-gray-500 hover:text-gray-700';

  function switchTab(showRegister) {
    hideAlert();
    formRegister.classList.toggle('hidden', !showRegister);
    formLogin.classList.toggle('hidden', showRegister);
    tabRegister.className = showRegister ? ACTIVE_TAB : INACTIVE_TAB;
    tabLogin.className = showRegister ? INACTIVE_TAB : ACTIVE_TAB;
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
      btn.textContent = 'Daftar Sekarang';
    }
  });
}

// ============================================================
// HALAMAN DASHBOARD  (/dashboard.html)
// ============================================================

// Daftar mata pelajaran Kelas 10 SMA (Kurikulum Merdeka - Fase E),
// dikelompokkan berdasarkan: wajib & peminatan/pilihan.
// Ketersediaan quiz dicek lewat /api/subjects.
const ALL_SUBJECTS = [
  // ---- Kelompok Wajib ----
  { name: 'Bahasa Indonesia', icon: '📖', desc: 'Teks, sastra, menulis kreatif', group: 'Wajib' , accent: '#C2410C' },
  { name: 'Bahasa Inggris', icon: '🌐', desc: 'Reading, writing, conversation', group: 'Wajib' , accent: '#0284C7' },
  { name: 'Matematika', icon: '📐', desc: 'Eksponen, logaritma, statistik', group: 'Wajib' , accent: '#7C3AED' },
  { name: 'Pendidikan Pancasila', icon: '🇮🇩', desc: 'Pancasila, UUD, hak & kewajiban', group: 'Wajib' , accent: '#DC2626' },
  { name: 'Seni dan Budaya', icon: '🎨', desc: 'Seni rupa, musik, tari, teater', group: 'Wajib' , accent: '#DB2777' },
  { name: 'PJOK', icon: '⚽', desc: 'Kebugaran, olahraga, kesehatan', group: 'Wajib' , accent: '#16A34A' },
  { name: 'Informatika', icon: '💻', desc: 'Algoritma, pemrograman, data', group: 'Wajib' , accent: '#0F766E' },

  // ---- Kelompok Peminatan / Pilihan ----
  { name: 'Fisika', icon: '⚛️', desc: 'Gerak, gaya, hukum Newton', group: 'Peminatan' , accent: '#2563EB' },
  { name: 'Kimia', icon: '🧪', desc: 'Zat, atom, ikatan kimia', group: 'Peminatan' , accent: '#9333EA' },
  { name: 'Biologi', icon: '🧬', desc: 'Makhluk hidup, sel, ekosistem', group: 'Peminatan' , accent: '#059669' },
  { name: 'Sejarah', icon: '🏛️', desc: 'Ilmu sejarah & peradaban', group: 'Peminatan' , accent: '#B45309' },
  { name: 'Geografi', icon: '🗺️', desc: 'Ruang, peta, fenomena bumi', group: 'Peminatan' , accent: '#0891B2' },
  { name: 'Ekonomi', icon: '💰', desc: 'Pasar, kebutuhan, ekonomi digital', group: 'Peminatan' , accent: '#CA8A04' },
  { name: 'Sosiologi', icon: '👥', desc: 'Masyarakat, interaksi sosial', group: 'Peminatan' , accent: '#4F46E5' },
];

async function initDashboardPage() {
  const user = await requireLogin();
  if (!user) return;

  // Sapaan selamat datang + data user
  document.getElementById('greeting').innerHTML =
    'Selamat datang di <span class="text-indigo-600">ExamD</span>, ' +
    escapeHTML(user.username) + '!';
  document.getElementById('nav-username').textContent = user.username;
  document.getElementById('user-points').textContent = user.points;

  // ---- Logout ----
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login.html';
    }
  });

  // ---- Render grid mata pelajaran ----
  const grid = document.getElementById('subject-grid');

  let available = [];
  try {
    const data = await api('/api/subjects');
    available = data.subjects;
  } catch {
    // Jika gagal, anggap semua belum tersedia
  }

  grid.innerHTML = ALL_SUBJECTS.map((subject, idx) => {
    const isActive = available.includes(subject.name);
    const acc = subject.accent;
    const base =
      'group relative flex flex-col rounded-2xl bg-white p-6 text-left ring-1 transition-all duration-300 ease-out ';
    const card = isActive
      ? base +
        'ring-stone-900/5 shadow-soft cursor-pointer hover:shadow-lift hover:-translate-y-1.5 hover:scale-[1.02] hover:ring-2 hover:ring-[color:var(--acc)] active:translate-y-0 active:scale-[0.99]'
      : base + 'ring-stone-900/5 opacity-50 cursor-not-allowed';

    const badge = subject.group === 'Wajib'
      ? '<span class="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-700">Wajib</span>'
      : '<span class="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Peminatan</span>';

    return `
      <${isActive ? 'a' : 'div'}
        ${isActive ? `href="/quiz.html?subject=${encodeURIComponent(subject.name)}"` : ''}
        class="${card} fade-up" style="--acc:${acc}; animation-delay: ${idx * 45}ms"
        ${isActive ? '' : 'aria-disabled="true"'}
      >
        <div class="mb-4 flex items-start justify-between">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6" style="background: ${acc}14; color: ${acc}">${subject.icon}</div>
          ${badge}
        </div>
        <h3 class="font-bold tracking-tight text-stone-900 transition-colors duration-300 group-hover:text-[color:var(--acc)]">
          ${escapeHTML(subject.name)}
        </h3>
        <p class="mt-1 text-[13px] leading-relaxed text-stone-500">${escapeHTML(subject.desc)}</p>
        <div class="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
          ${
            isActive
              ? '<span class="text-xs font-semibold text-stone-500 transition-colors duration-300 group-hover:text-[color:var(--acc)]">Mulai Quiz</span>'
              : '<span class="text-xs font-semibold text-stone-400">Segera</span>'
          }
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-stone-400 transition-all duration-300 group-hover:bg-[color:var(--acc)] group-hover:text-white group-hover:translate-x-0.5">→</span>
        </div>
      </${isActive ? 'a' : 'div'}>`;
  }).join('');
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
