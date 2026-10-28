// ============================================================
// ExamD - Logika Halaman Quiz (/quiz.html?subject=...)
// Satu soal per layar: lembar jawaban dengan gelembung A-D,
// garis gelembung live, poin tiap jawaban benar, hasil akhir.
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
  const elGauge = document.getElementById('gauge');
  const elCard = document.getElementById('question-card');
  const elQuestion = document.getElementById('question-text');
  const elQMeta = document.getElementById('question-num');
  const elOptions = document.getElementById('options');
  const elSubmitBtn = document.getElementById('submit-btn');
  const elNextBtn = document.getElementById('next-btn');
  const elSummary = document.getElementById('summary');
  const elToast = document.getElementById('toast');

  // ---- State ----
  let quizzes = [];      // daftar soal dari API
  let current = 0;       // index soal aktif
  let selected = null;   // index opsi yang dipilih user
  let correctCount = 0;  // jawaban benar sejauh ini
  let sessionPoints = 0; // poin didapat sejauh ini (untuk hasil)
  let submitting = false;
  let subject = null;

  const LETTERS = ['A', 'B', 'C', 'D'];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ------------------------------------------------------------
  // Notifikasi (float, durasi singkat)
  // ------------------------------------------------------------
  function showToast(text, kind = 'ok') {
    elToast.textContent = text;
    elToast.className = 'toast ' + (kind === 'bad' ? 'is-bad' : 'is-ok') + ' is-on';

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      elToast.classList.remove('is-on');
      showToast._timer = setTimeout(() => {
        elToast.className = 'toast';
      }, 260);
    }, 1400);
  }

  // ------------------------------------------------------------
  // Garis gelembung: progres 25 lingkaran
  // ------------------------------------------------------------
  function buildGauge() {
    elGauge.innerHTML = quizzes.map(() => '<i></i>').join('');
  }

  function updateGauge(answered = true) {
    const dots = elGauge.querySelectorAll('i');
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-done', i < current);
      dot.classList.toggle('is-now', i === current);
    });
    elProgressLabel.textContent = `Soal ${current + 1} dari ${quizzes.length}`;
  }

  // ------------------------------------------------------------
  // Render soal aktif (masuk lembut, opsi berjeda)
  // ------------------------------------------------------------
  function renderQuestion() {
    const q = quizzes[current];
    selected = null;

    updateGauge();
    elSubmitBtn.disabled = true;
    elSubmitBtn.hidden = false;
    elNextBtn.hidden = true;
    elSubmitBtn.textContent =
      current === quizzes.length - 1 ? 'Lihat Hasil' : 'Kirim Jawaban';

    elQuestion.textContent = q.question;
    elQMeta.textContent =
      `Soal ${current + 1} dari ${quizzes.length}, ${q.difficulty || 'LOTS'}`;

    elOptions.innerHTML = q.options
      .map((opt, i) => `
        <button type="button" data-answer="${i}" class="opt" style="animation-delay: ${60 + i * 60}ms">
          <span class="bubble" aria-hidden="true">${LETTERS[i]}</span>
          <span class="opt-text">${escapeHTML(opt)}</span>
        </button>`)
      .join('');

    if (reduce.matches) {
      elOptions.querySelectorAll('.opt').forEach((btn) => (btn.style.animation = 'none'));
    }

    // Interaksi pilih opsi: satu gelembung terisi per soal
    elOptions.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (submitting || btn.disabled) return;
        elOptions.querySelectorAll('.opt').forEach((b) => b.classList.remove('is-sel'));
        btn.classList.add('is-sel');
        selected = Number(btn.dataset.answer);
        elSubmitBtn.disabled = false;
      });
    });

    // Masuk: kartu naik dari bawah
    elCard.style.opacity = '0';
    elCard.style.transform = 'translateY(18px)';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        elCard.style.opacity = '1';
        elCard.style.transform = 'translateY(0)';
      })
    );
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
    elOptions.querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
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

      const result = data.results.find((r) => r && r.id === q.id) || data.results[0];
      const isCorrect = Boolean(result && result.valid && result.correct);

      const elSelected = elOptions.querySelector(`.opt[data-answer="${selected}"]`);
      if (isCorrect) {
        correctCount++;
        sessionPoints += data.pointsPerCorrect;
        showToast('Benar, +' + data.pointsPerCorrect + ' poin.', 'ok');
        elSelected.classList.add('is-ok');
      } else {
        showToast('Belum tepat.', 'bad');
        elSelected.classList.add('is-bad');
        elCard.classList.remove('shake');
        void elCard.offsetWidth; // restart animasi getar
        elCard.classList.add('shake');
      }

      // Gelembung soal ini dianggap terisi
      const dots = elGauge.querySelectorAll('i');
      if (dots[current]) dots[current].classList.add('is-done');

      // Sambungkan ke soal berikutnya atau tampilkan hasil
      elSubmitBtn.hidden = true;
      if (current < quizzes.length - 1) {
        elNextBtn.hidden = false;
        elNextBtn.focus();
      } else {
        setTimeout(showSummary, 900);
      }
    } catch (err) {
      showToast(err.message, 'bad');
      elSubmitBtn.disabled = false;
      elOptions.querySelectorAll('.opt').forEach((b) => (b.disabled = false));
    } finally {
      submitting = false;
    }
  }

  // ------------------------------------------------------------
  // Layar hasil
  // ------------------------------------------------------------
  async function showSummary() {
    // Ambil data user terbaru (total poin dari server)
    let totalPoints = sessionPoints;
    try {
      const data = await api('/api/user');
      totalPoints = data.user.points;
      document.getElementById('nav-points').textContent = totalPoints;
    } catch {
      // Abaikan: pakai poin sesi saja
    }

    elContent.hidden = true;
    elSummary.hidden = false;

    // Reveal + mulai crossfade galeri hasil
    document.querySelectorAll('#summary .rise, #summary .pop').forEach((el) => el.classList.add('is-in'));
    const gallery = document.querySelector('#summary [data-crossfade]');
    if (gallery && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frames = gallery.querySelectorAll('img');
      let gi = 0;
      if (gallery._fade) clearInterval(gallery._fade);
      gallery._fade = setInterval(() => {
        if (document.hidden) return;
        gi = (gi + 1) % frames.length;
        frames.forEach((f, k) => f.classList.toggle('is-on', k === gi));
      }, 5600);
    }

    const total = quizzes.length;
    const wrong = total - correctCount;
    const accuracy = Math.round((correctCount / total) * 100);
    const perfect = correctCount === total;

    document.getElementById('sum-title').textContent = perfect
      ? 'Sempurna, semua benar.'
      : correctCount > 0
        ? 'Kerja bagus.'
        : 'Jangan menyerah.';
    document.getElementById('sum-sub').textContent =
      `Quiz ${subject}, ${total} soal selesai.`;
    document.getElementById('sum-title').classList.add('pop', 'is-in');
    document.getElementById('sum-sub').classList.add('pop', 'is-in');

    document.getElementById('ledger-wrong').textContent = String(wrong);
    document.getElementById('ledger-points').textContent = '+' + sessionPoints;
    document.getElementById('ledger-total').textContent = String(totalPoints);

    // Reveal: angka berjalan naik + ring akurasi menyapu
    countUp(document.getElementById('sum-score'), correctCount, 1000,
      (v) => v + '/' + total);
    countUp(document.getElementById('sum-accuracy'), accuracy, 1100,
      (v) => v + '%');
    countUp(document.getElementById('ledger-points'), sessionPoints, 1000,
      (v) => '+' + v);

    // Ring akurasi: penuhi sesuai persentase (dasharray = 263.9 untuk r=42)
    const ring = document.getElementById('acc-ring');
    ring.style.strokeDashoffset = '263.9';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ring.style.strokeDashoffset = String(263.9 * (1 - accuracy / 100));
      })
    );
  }

  // Angka berjalan naik dengan easing cubic-out
  function countUp(el, target, duration, format) {
    if (reduce.matches) {
      el.textContent = format(target);
      return;
    }
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
  async function init() {
    const user = await requireLogin(); // dari app.js
    if (!user) return;
    document.getElementById('nav-points').textContent = user.points;

    subject = new URLSearchParams(window.location.search).get('subject');

    if (!subject) {
      elTitle.textContent = 'Quiz';
      elLoading.hidden = true;
      elContent.hidden = true;
      elErrorMsg.textContent = 'Mata pelajaran tidak ditentukan.';
      elError.hidden = false;
      return;
    }

    try {
      const data = await api('/api/quizzes/' + encodeURIComponent(subject));
      quizzes = data.quizzes;
    } catch (err) {
      elTitle.textContent = 'Quiz ' + subject;
      elLoading.hidden = true;
      elContent.hidden = true;
      elErrorMsg.textContent = err.message;
      elError.hidden = false;
      return;
    }

    elTitle.textContent = 'Quiz ' + subject;
    elSubtitle.textContent = `${quizzes.length} soal, +10 poin tiap jawaban benar`;
    elLoading.hidden = true;
    elContent.hidden = false;

    buildGauge();
    elSubmitBtn.addEventListener('click', submitCurrentAnswer);
    elNextBtn.addEventListener('click', () => {
      current++;
      renderQuestion();
    });

    renderQuestion();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
