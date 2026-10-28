// ============================================================
// ExamD - Tanya ExamD (penjelas materi, tugas, flashcard)
// ============================================================
'use strict';

const learnForm = document.getElementById('learn-form');
const learnStatus = document.getElementById('learn-status');
const learnActions = document.getElementById('learn-actions');
let lessonTopic = '';
let lessonBusy = false;

async function requestLesson(mode, topic) {
  if (lessonBusy) return;
  lessonBusy = true;
  const buttons = [...learnForm.querySelectorAll('button'), ...learnActions.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  learnStatus.textContent = 'ExamD sedang menyiapkan jawaban\u2026';
  try {
    const result = await api('/api/learn', { method: 'POST', body: { topic, mode } });
    document.getElementById('learn-answer').textContent = result.answer;
    const cards = document.getElementById('learn-cards');
    cards.replaceChildren();
    for (const card of result.cards) {
      const details = document.createElement('details');
      details.className = 'flash';
      const summary = document.createElement('summary');
      summary.textContent = card.front;
      const answer = document.createElement('p');
      answer.textContent = card.back;
      details.append(summary, answer);
      cards.append(details);
    }
    lessonTopic = topic;
    learnStatus.textContent =
      mode === 'flashcards'
        ? 'Klik kartu untuk membuka jawabannya.'
        : mode === 'task'
          ? 'Tugas siap. Kerjakan dulu, minta kunci setelah selesai.'
          : 'Selesai. Kamu bisa minta versi tugas atau flashcard lewat tombol di bawah.';
  } catch (err) {
    learnStatus.textContent = err.message;
  } finally {
    lessonBusy = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

learnForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const topic = document.getElementById('learn-topic').value.trim();
  if (topic) requestLesson('explain', topic);
});

learnActions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-learn-mode]');
  if (!button) return;
  const topic = document.getElementById('learn-topic').value.trim() || lessonTopic;
  if (!topic) {
    learnStatus.textContent = 'Tulis dulu materi yang ingin dipelajari di kotak atas, lalu coba lagi.';
    document.getElementById('learn-topic').focus();
    return;
  }
  requestLesson(button.dataset.learnMode, topic);
});
