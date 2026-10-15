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
  buttons.forEach(button => { button.disabled = true; });
  learnStatus.textContent = 'ExamD sedang menyiapkan jawaban…';
  try {
    const result = await api('/api/learn', { method: 'POST', body: { topic, mode } });
    document.getElementById('learn-answer').textContent = result.answer;
    const cards = document.getElementById('learn-cards');
    cards.replaceChildren();
    for (const card of result.cards) {
      const details = document.createElement('details');
      details.className = 'rounded-xl border border-stone-200 p-4 open:bg-teal-50';
      const summary = document.createElement('summary');
      summary.className = 'cursor-pointer font-semibold text-sm focus-visible:outline-teal-700';
      summary.textContent = card.front;
      const answer = document.createElement('p');
      answer.className = 'mt-3 whitespace-pre-wrap text-sm leading-6';
      answer.textContent = card.back;
      details.append(summary, answer);
      cards.append(details);
    }
    lessonTopic = topic;
    learnActions.classList.remove('hidden');
    learnStatus.textContent = mode === 'flashcards' ? 'Klik kartu untuk membuka jawaban.' : 'Selesai. Lanjut berlatih dengan tugas atau flashcard.';
  } catch (err) {
    learnStatus.textContent = err.message;
  } finally {
    lessonBusy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

learnForm.addEventListener('submit', event => {
  event.preventDefault();
  const topic = document.getElementById('learn-topic').value.trim();
  if (topic) requestLesson('explain', topic);
});
learnActions.addEventListener('click', event => {
  const button = event.target.closest('[data-learn-mode]');
  if (button && lessonTopic) requestLesson(button.dataset.learnMode, lessonTopic);
});
