'use strict';

const instructions = {
  explain: 'Jawab pertanyaan dengan penjelasan alami, jelas, dan contoh singkat. Jangan otomatis memberi tugas. cards harus array kosong.',
  task: 'Tulis 5 tugas latihan bervariasi (LOTS dan HOTS) sebagai daftar bernomor di dalam field answer. Jangan sertakan kunci jawaban. cards wajib array kosong.',
  flashcards: 'Buat 6 flashcard akurat untuk topik yang diberikan, masing-masing pertanyaan singkat dan jawaban ringkas. answer berisi pengantar singkat.',
};

async function generateLesson(topic, mode) {
  if (!Object.hasOwn(instructions, mode) || typeof topic !== 'string' || !topic.trim() || topic.length > 2000) {
    const error = new Error('Pertanyaan wajib berupa teks 1–2000 karakter dengan mode yang valid.');
    error.status = 400;
    throw error;
  }
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('Gemini belum dikonfigurasi. Atur GEMINI_API_KEY di server.');
    error.status = 503;
    throw error;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `Kamu tutor ExamD berbahasa Indonesia untuk SMA Kelas 10 Kurikulum Merdeka. Fokus pada materi sekolah; jika pertanyaan di luar cakupan, arahkan kembali dengan sopan. Jangan mengarang fakta atau sumber. Akui ketidakpastian. Gunakan teks biasa, bukan HTML. ${instructions[mode]}` }] },
      contents: [{ role: 'user', parts: [{ text: topic.trim() }] }],
      generationConfig: {
        maxOutputTokens: 6000,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT', required: ['answer', 'cards'],
          properties: {
            answer: { type: 'STRING' },
            cards: { type: 'ARRAY', items: { type: 'OBJECT', required: ['front', 'back'], properties: { front: { type: 'STRING' }, back: { type: 'STRING' } } } },
          },
        },
      },
    }),
  };
  let response = await fetch(url, options);
  if (response.status === 503) {
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, 1000));
    response = await fetch(url, options);
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    console.error('[ExamD Gemini]', JSON.stringify({ httpStatus: response.status, model, status: failure.error?.status, reasons: failure.error?.details?.map(detail => detail.reason).filter(Boolean) }));
    const error = new Error(response.status === 503
      ? 'Layanan Gemini sedang sibuk atau tidak tersedia. Coba lagi sebentar lagi.'
      : response.status === 429 ? 'Batas pemakaian Gemini tercapai. Coba lagi nanti.' : 'Gemini gagal merespons. Periksa konfigurasi server atau coba lagi.');
    error.status = response.status === 503 ? 503 : response.status === 429 ? 429 : 502;
    throw error;
  }
  const data = await response.json();
  let result;
  try {
    result = JSON.parse(data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join(''));
  } catch {
    throw Object.assign(new Error('Jawaban Gemini tidak lengkap. Coba lagi.'), { status: 502 });
  }
  if (typeof result?.answer !== 'string' || !Array.isArray(result.cards) || result.cards.length > 12 || result.cards.some(card => !card || typeof card.front !== 'string' || typeof card.back !== 'string')) {
    throw Object.assign(new Error('Format jawaban Gemini tidak valid. Coba lagi.'), { status: 502 });
  }
  // Mode explain/task menyimpan isi di `answer`; kartu hanya untuk mode flashcards.
  if (mode !== 'flashcards') result.cards = [];
  if (mode === 'flashcards' && result.cards.length === 0) {
    throw Object.assign(new Error('Gemini tidak mengirim kartu. Coba lagi.'), { status: 502 });
  }
  if (!result.answer.trim()) {
    throw Object.assign(new Error('Gemini tidak mengirim jawaban. Coba lagi.'), { status: 502 });
  }
  return result;
}

module.exports = { generateLesson };
