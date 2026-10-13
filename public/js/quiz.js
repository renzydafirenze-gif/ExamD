// ============================================================
// ExamD - Logika Halaman Quiz (/quiz.html?subject=...)
// Satu soal per layar, notifikasi poin, ringkasan skor akhir
// ============================================================

'use strict';

(function () {
  // ---- Elemen DOM ----
  const elTitle = document.getElementById('quiz-title');
  const elSubtitle = document.getElementById('quiz-subtitle');
  const elLoading = document.getElementById('quiz-loading');
  const elError = document.getElementById('quiz-error');
  const elErrorMsg = document.getElementById('quiz-error-msg');
  const elContent = document.getElementById('quiz-content');
  const elProgressLabel = document.getElementById('progress-label');
  const elProgressPct = document.getElementById('progress-pct');
  const elProgressBar = document.getElementById('progress-bar');
  const elCard = document.getElementById('question-card');
  const elQuestion = document.getElementById('question-text');
  const elOptions = document.getElementById('options');
  const elSubmitBtn = document.getElementById('submit-btn');
  const elNextBtn = document.getElementById('next-btn');
  const elSummary = document.getElementById('summary');
  const elToast = document.getElementById('toast');
  const elToastInner = document.getElementById('toast-inner');

  // ---- State ----
  let quizzes = [];      // daftar soal dari API
  let current = 0;       // index soal aktif
  let selected = null;   // index opsi yang dipilih user
  let correctCount = 0;  // jawaban benar sejauh ini
  let sessionPoints = 0; // poin didapat sejauh ini (untuk toast)
  let submitting = false;

  const LETTERS = ['A', 'B', 'C', 'D'];

  // ------------------------------------------------------------
  // Toast notifikasi (hijau: benar / merah: salah)
  // ------------------------------------------------------------
  function showToast(text, type) {
    elToastInner.textContent = text;
    elToastInner.className =
      'px-6 py-3 rounded-full shadow-lg font-semibold text-white text-sm toast-show ' +
      (type === 'success' ? 'bg-green-500' : 'bg-red-500');

    elToast.classList.remove('hidden');

    // Hancurkan toast setelah 1.4 detik
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      elToastInner.classList.add('toast-hide');
      setTimeout(() => {
        elToast.classList.add('hidden');
        elToastInner.classList.remove('toast-hide');
      }, 300);
    }, 1400);
  }

  // ------------------------------------------------------------
  // Progress bar
  // ------------------------------------------------------------
  function updateProgress() {
    elProgressLabel.textContent = `Soal ${current + 1} dari ${quizzes.length}`;
    const pct = Math.round((current / quizzes.length) * 100);
    elProgressPct.textContent = pct + '%';
    elProgressBar.style.width = pct + '%';
  }

  // ------------------------------------------------------------
  // Render soal aktif (dengan transisi slide halus)
  // ------------------------------------------------------------
  function renderQuestion() {
    const q = quizzes[current];
    selected = null;

    updateProgress();
    elSubmitBtn.disabled = true;
    elSubmitBtn.classList.remove('hidden');
    elNextBtn.classList.add('hidden');
    elSubmitBtn.textContent =
      current === quizzes.length - 1 ? 'Lihat Hasil' : 'Submit Jawaban';

    elQuestion.textContent = q.question;

    // Badge kesulitan & nomor soal
    const elBadge = document.getElementById('question-badge');
    elBadge.textContent = q.difficulty || 'LOTS';
    elBadge.className =
      'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ' +
      (q.difficulty === 'HOTS'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-teal-50 text-teal-700');
    document.getElementById('question-num').textContent =
      `Soal ${current + 1} dari ${quizzes.length}`;

    elOptions.innerHTML = q.options
      .map(
        (opt, i) => `
      <button type="button" data-answer="${i}"
        class="option-btn flex items-center gap-3 text-left text-sm font-medium px-4 py-3.5 rounded-xl
               border border-stone-200 bg-white transition-all duration-200 active:scale-[0.99]
               hover:border-teal-600/40 hover:bg-teal-50/50 hover:shadow-soft">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xs font-bold text-stone-500 transition-colors duration-200">${LETTERS[i]}</span>
        <span class="opt-text">${escapeHTML(opt)}</span>
      </button>`
      )
      .join('');

    // Interaksi pilih opsi: highlight indigo, satu pilihan per soal
    elOptions.querySelectorAll('.option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        elOptions.querySelectorAll('.option-btn').forEach((b) => {
          b.classList.remove('bg-teal-700', 'border-teal-700', 'text-white');
          const tag = b.querySelector('span');
          tag.className = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xs font-bold text-stone-500 transition-colors duration-200';
        });
        btn.classList.add('bg-teal-700', 'border-teal-700', 'text-white');
        btn.querySelector('span').className = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 text-xs font-bold text-white transition-colors duration-200';
        btn.classList.remove('select-pulse');
        void btn.offsetWidth; // restart animasi
        btn.classList.add('select-pulse');
        selected = Number(btn.dataset.answer);
        elSubmitBtn.disabled = false;
      });
    });

    // Transisi masuk: fade + slide up, opsi muncul berurutan (stagger)
    elCard.style.opacity = '0';
    elCard.style.transform = 'translateY(24px)';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        elCard.style.opacity = '1';
        elCard.style.transform = 'translateY(0)';
      })
    );
    elOptions.querySelectorAll('.option-btn').forEach((btn, i) => {
      btn.classList.add('opt-in');
      btn.style.animationDelay = 100 + i * 70 + 'ms';
    });
  }

  // ------------------------------------------------------------
  // Submit jawaban soal aktif -> cek ke API
  // ------------------------------------------------------------
  async function submitCurrentAnswer() {
    if (selected === null || submitting) return;
    submitting = true;
    elSubmitBtn.disabled = true;

    const q = quizzes[current];

    // Nonaktifkan semua opsi agar tidak bisa diubah
    elOptions.querySelectorAll('.option-btn').forEach((b) => {
      b.disabled = true;
      b.classList.add('cursor-not-allowed');
    });

    try {
      // Kirim jawaban 1 soal; server mengembalikan correctness
      const data = await api('/api/submit-quiz', {
        method: 'POST',
        body: {
          subject: subject,
          answers: [{ id: q.id, answer: selected }],
        },
      });

      const result = data.results[0];
      const isCorrect = result && result.valid && result.correct;

      if (isCorrect) {
        correctCount++;
        sessionPoints += data.pointsPerCorrect;
        elCard.classList.remove('shake');
        showToast('Poin +' + data.pointsPerCorrect + ' 🎉', 'success');
        markSelected('bg-emerald-500', 'border-emerald-500');
      } else {
        // Jawaban salah: kartu bergetar + opsi terpilih merah
        elCard.classList.remove('shake');
        void elCard.offsetWidth; // restart animasi shake
        elCard.classList.add('shake');
        showToast('Jawaban belum tepat 😅', 'error');
        markSelected('bg-rose-500', 'border-rose-500');
      }

      // Sambungkan ke soal berikutnya atau tampilkan ringkasan
      elSubmitBtn.classList.add('hidden');
      if (current < quizzes.length - 1) {
        elNextBtn.classList.remove('hidden');
        elNextBtn.focus();
      } else {
        setTimeout(showSummary, 900);
      }
    } catch (err) {
      showToast(err.message, 'error');
      elSubmitBtn.disabled = false;
      elOptions.querySelectorAll('.option-btn').forEach((b) => (b.disabled = false));
    } finally {
      submitting = false;
    }
  }

  // Ganti highlight opsi terpilih setelah dinilai (emerald / rose)
  function markSelected(bgClass, borderClass) {
    elOptions.querySelectorAll('.option-btn').forEach((btn) => {
      if (Number(btn.dataset.answer) === selected) {
        btn.classList.remove('bg-teal-700', 'border-teal-700');
        btn.classList.add(bgClass, borderClass, 'text-white', 'shadow-soft');
        const tag = btn.querySelector('span');
        tag.className = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 text-xs font-bold text-white transition-colors duration-200';
      }
    });
  }

  // ------------------------------------------------------------
  // Layar ringkasan akhir
  // ------------------------------------------------------------
  async function showSummary() {
    // Update progress ke 100%
    elProgressBar.style.width = '100%';
    elProgressPct.textContent = '100%';

    // Ambil data user terbaru (total poin dari server)
    let totalPoints = null;
    try {
      const data = await api('/api/user');
      totalPoints = data.user.points;
      document.getElementById('nav-points').textContent = totalPoints;
    } catch {
      // Abaikan: tampilkan poin sesi saja
    }

    elContent.classList.add('hidden');

    const perfect = correctCount === quizzes.length;
    const accuracy = Math.round((correctCount / quizzes.length) * 100);
    document.getElementById('sum-emoji').textContent =
      perfect ? '🏆' : correctCount > 0 ? '🎉' : '💪';
    document.getElementById('sum-title').textContent = perfect
      ? 'Sempurna! Semua jawaban benar!'
      : correctCount > 0
        ? 'Kerja bagus!'
        : 'Jangan menyerah, coba lagi!';
    document.getElementById('sum-sub').textContent =
      `Quiz ${subject} • ${quizzes.length} soal selesai`;

    // Score reveal: angka berjalan naik (count-up) + ring akurasi menyapu
    elSummary.classList.remove('hidden');

    countUp(document.getElementById('sum-score'), correctCount, 1000,
      (v) => v + '/' + quizzes.length);
    countUp(document.getElementById('sum-accuracy'), accuracy, 1100,
      (v) => v + '%');
    countUp(document.getElementById('sum-points'), sessionPoints, 1200,
      (v) => '+' + v + ' poin');

    // Ring akurasi: penuhi sesuai persentase (dasharray = 263.9 untuk r=42)
    const ring = document.getElementById('acc-ring');
    ring.style.strokeDashoffset = '263.9'; // reset
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ring.style.strokeDashoffset = String(263.9 * (1 - accuracy / 100));
      })
    );
  }

  // Angka berjalan naik dengan easing cubic-out
  function countUp(el, target, duration, format) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  let subject = null;

  async function init() {
    const user = await requireLogin(); // dari app.js
    if (!user) return;
    document.getElementById('nav-points').textContent = user.points;

    subject = new URLSearchParams(window.location.search).get('subject');

    if (!subject) {
      elTitle.textContent = 'Quiz';
      elLoading.classList.add('hidden');
      elErrorMsg.textContent = 'Mata pelajaran tidak ditentukan.';
      elError.classList.remove('hidden');
      return;
    }

    try {
      const data = await api('/api/quizzes/' + encodeURIComponent(subject));
      quizzes = data.quizzes;
    } catch (err) {
      elTitle.textContent = subject;
      elLoading.classList.add('hidden');
      elErrorMsg.textContent = err.message;
      elError.classList.remove('hidden');
      return;
    }

    elTitle.textContent = 'Quiz ' + subject;
    elSubtitle.textContent = `${quizzes.length} soal • 10 poin per jawaban benar`;
    elLoading.classList.add('hidden');
    elContent.classList.remove('hidden');

    elSubmitBtn.addEventListener('click', submitCurrentAnswer);
    elNextBtn.addEventListener('click', () => {
      current++;
      renderQuestion();
    });

    renderQuestion();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
