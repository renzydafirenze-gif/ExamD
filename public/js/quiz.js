// ============================================================
// ExamD - Halaman Quiz (/quiz.html?subject=...)
// Satu soal per layar. Umpan balik langsung, skor hidup di rail,
// pintasan papan tombol, lalu rekap akhir.
// ============================================================

'use strict';

(function () {
  // ---- Elemen DOM ----
  const elTitle = document.getElementById('quiz-title');
  const elSubtitle = document.getElementById('quiz-subtitle');
  const elLoading = document.getElementById('quiz-loading');
  const elError = document.getElementById('quiz-error');
  const elErrorMsg = document.getElementById('quiz-error-msg');
  const elShell = document.getElementById('quiz-content');
  const elGauge = document.getElementById('gauge');
  const elCard = document.getElementById('question-card');
  const elQuestion = document.getElementById('question-text');
  const elQMeta = document.getElementById('question-num');
  const elOptions = document.getElementById('options');
  const elSubmitBtn = document.getElementById('submit-btn');
  const elNextBtn = document.getElementById('next-btn');
  const elSummary = document.getElementById('summary');
  const elToast = document.getElementById('toast');
  const elLiveCorrect = document.getElementById('live-correct');
  const elLiveStreak = document.getElementById('live-streak');
  const elLivePoints = document.getElementById('live-points');

  // ---- State ----
  let quizzes = [];
  let current = 0;
  let selected = null;
  let correctCount = 0;
  let streak = 0;
  let sessionPoints = 0;
  let submitting = false;
  let subject = null;
  const results = []; // true/false per soal yang sudah dijawab

  const LETTERS = ['A', 'B', 'C', 'D'];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function showToast(text, kind = 'ok') {
    elToast.textContent = text;
    elToast.className = 'toast ' + (kind === 'bad' ? 'is-bad' : 'is-ok') + ' is-on';

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      elToast.classList.remove('is-on');
      showToast._timer = setTimeout(() => {
        elToast.className = 'toast';
      }, 240);
    }, 1400);
  }

  // ------------------------------------------------------------
  // Lembar jawaban: 25 gelembung
  // ------------------------------------------------------------
  function buildGauge() {
    elGauge.innerHTML = quizzes.map((_, i) => `<i style="animation-delay:${Math.min(i * 22, 300)}ms"></i>`).join('');
  }

  function updateGauge() {
    const dots = elGauge.querySelectorAll('i');
    dots.forEach((dot, i) => {
      const answered = typeof results[i] === 'boolean';
      dot.classList.toggle('is-right', answered && results[i] === true);
      dot.classList.toggle('is-wrong', answered && results[i] === false);
      dot.classList.toggle('is-now', i === current && !answered);
    });
  }

  function updateStats() {
    elLiveCorrect.textContent = String(correctCount);
    elLiveStreak.textContent = String(streak);
    elLivePoints.textContent = String(sessionPoints);
  }

  // ------------------------------------------------------------
  // Pilih opsi
  // ------------------------------------------------------------
  function selectOption(index) {
    if (submitting) return;
    const btn = elOptions.querySelector(`.opt[data-answer="${index}"]`);
    if (!btn || btn.disabled) return;
    elOptions.querySelectorAll('.opt').forEach((b) => b.classList.remove('is-sel'));
    btn.classList.add('is-sel');
    selected = index;
    elSubmitBtn.disabled = false;
    btn.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------
  // Render soal aktif
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
    elQMeta.textContent = `Soal ${current + 1} dari ${quizzes.length} · ${q.difficulty || 'LOTS'}`;

    elOptions.innerHTML = q.options
      .map(
        (opt, i) => `
        <button type="button" data-answer="${i}" class="opt" style="animation-delay:${40 + i * 50}ms">
          <span class="bubble" aria-hidden="true">${LETTERS[i]}</span>
          <span class="opt-text">${escapeHTML(opt)}</span>
        </button>`
      )
      .join('');

    if (reduce.matches) {
      elOptions.querySelectorAll('.opt').forEach((btn) => (btn.style.animation = 'none'));
    }

    elOptions.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => selectOption(Number(btn.dataset.answer)));
    });

    elCard.style.opacity = '0';
    elCard.style.transform = 'translateY(14px)';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        elCard.style.opacity = '1';
        elCard.style.transform = 'translateY(0)';
      })
    );
  }

  // ------------------------------------------------------------
  // Kirim jawaban soal aktif
  // ------------------------------------------------------------
  async function submitCurrentAnswer() {
    if (selected === null || submitting) return;
    submitting = true;
    elSubmitBtn.disabled = true;

    const q = quizzes[current];
    elOptions.querySelectorAll('.opt').forEach((b) => (b.disabled = true));

    try {
      const data = await api('/api/submit-quiz', {
        method: 'POST',
        body: {
          subject,
          answers: [{ id: q.id, answer: selected }],
        },
      });

      const result = data.results.find((r) => r && r.id === q.id) || data.results[0];
      const isCorrect = Boolean(result && result.valid && result.correct);
      results[current] = isCorrect;

      const elSelected = elOptions.querySelector(`.opt[data-answer="${selected}"]`);
      elOptions.querySelectorAll('.opt').forEach((b) => {
        if (b !== elSelected) b.classList.add('is-dim');
      });

      if (isCorrect) {
        correctCount++;
        streak++;
        sessionPoints += data.pointsPerCorrect;
        elSelected.classList.add('is-ok');
        showToast(`Benar, +${data.pointsPerCorrect} poin. Tepat ${streak} kali berturut.`, 'ok');
      } else {
        streak = 0;
        elSelected.classList.add('is-bad');
        showToast('Belum tepat. Cek lagi materinya.', 'bad');
        elCard.classList.remove('shake');
        void elCard.offsetWidth;
        elCard.classList.add('shake');
      }

      updateGauge();
      updateStats();

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
      results[current] = undefined;
    } finally {
      submitting = false;
    }
  }

  function goNext() {
    if (current >= quizzes.length - 1) return;
    current++;
    renderQuestion();
  }

  // ------------------------------------------------------------
  // Layar hasil
  // ------------------------------------------------------------
  async function showSummary() {
    let totalPoints = sessionPoints;
    try {
      const data = await api('/api/user');
      totalPoints = data.user.points;
      document.getElementById('nav-points').textContent = totalPoints;
    } catch {
      // Abaikan: pakai poin sesi saja
    }

    elShell.hidden = true;
    elSummary.hidden = false;

    const total = quizzes.length;
    const wrong = total - correctCount;
    const accuracy = Math.round((correctCount / total) * 100);
    const perfect = correctCount === total;

    setBest(subject, accuracy);

    document.getElementById('sum-title').textContent = perfect
      ? 'Semua benar.'
      : correctCount >= total / 2
        ? 'Kerja bagus.'
        : 'Jangan menyerah.';
    document.getElementById('sum-sub').textContent = `${subject}, ${total} soal selesai.`;

    document.getElementById('ledger-wrong').textContent = String(wrong);
    document.getElementById('ledger-total').textContent = String(totalPoints);

    countUp(document.getElementById('sum-score'), correctCount, 900, (v) => v + '/' + total);
    countUp(document.getElementById('sum-accuracy'), accuracy, 1000, (v) => v + '%');
    countUp(document.getElementById('ledger-points'), sessionPoints, 900, (v) => '+' + v);

    const ring = document.getElementById('acc-ring');
    ring.style.strokeDashoffset = '263.9';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ring.style.strokeDashoffset = String(263.9 * (1 - accuracy / 100));
      })
    );

    document.getElementById('retry-btn').addEventListener('click', () => window.location.reload());
  }

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
  // Pintasan papan tombol
  // ------------------------------------------------------------
  document.addEventListener('keydown', (event) => {
    if (elSummary.hidden === false) return;
    const tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      selectOption(Number(event.key) - 1);
      return;
    }

    const letter = LETTERS.indexOf(event.key.toUpperCase());
    if (letter !== -1 && event.key.length === 1) {
      event.preventDefault();
      selectOption(letter);
      return;
    }

    if (event.key === 'Enter') {
      if (event.target === elSubmitBtn || event.target === elNextBtn) return; // kontrol menangani sendiri
      event.preventDefault();
      if (!elNextBtn.hidden) goNext();
      else if (!elSubmitBtn.hidden && !elSubmitBtn.disabled) submitCurrentAnswer();
    }
  });

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  async function init() {
    const user = await requireLogin();
    if (!user) return;
    document.getElementById('nav-points').textContent = user.points;

    subject = new URLSearchParams(window.location.search).get('subject');

    if (!subject) {
      elLoading.hidden = true;
      elShell.hidden = true;
      elErrorMsg.textContent = 'Mata pelajaran tidak ditentukan.';
      elError.hidden = false;
      return;
    }

    try {
      const data = await api('/api/quizzes/' + encodeURIComponent(subject));
      quizzes = data.quizzes;
    } catch (err) {
      elLoading.hidden = true;
      elShell.hidden = true;
      elErrorMsg.textContent = err.message;
      elError.hidden = false;
      return;
    }

    elTitle.textContent = subject;
    elSubtitle.textContent = `Latihan · ${quizzes.length} soal · +10 poin tiap jawaban benar`;
    elLoading.hidden = true;
    elShell.hidden = false;

    buildGauge();
    updateStats();
    elSubmitBtn.addEventListener('click', submitCurrentAnswer);
    elNextBtn.addEventListener('click', goNext);

    renderQuestion();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
