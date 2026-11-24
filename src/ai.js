'use strict';

const instructions = {
  explain: 'Jawab pertanyaan dengan penjelasan alami, jelas, dan contoh singkat. Jangan otomatis memberi tugas. cards harus array kosong.',
  task: 'WAJIB: field answer berisi tepat 5 tugas latihan, masing-masing satu baris bernomor 1.–5. gunakan kata kerja perintah (Jelaskan, Hitung, Bandingkan, Buat, Analisis). Jangan pernah menjelaskan materi atau memberi kunci jawaban. Beri label LOTS/HOTS di awal tiap baris. cards wajib array kosong.',
  flashcards: 'Buat 6 flashcard akurat untuk topik yang diberikan, masing-masing pertanyaan singkat dan jawaban ringkas. answer berisi pengantar singkat.',
};

const SYSTEM = `Kamu tutor ExamD berbahasa Indonesia untuk SMA Kelas 10 Kurikulum Merdeka. Fokus pada materi sekolah; jika pertanyaan di luar cakupan, arahkan kembali dengan sopan. Jangan mengarang fakta atau sumber. Akui ketidakpastian. Gunakan teks biasa, tanpa HTML dan tanpa markdown.`;

function validateInput(topic, mode) {
  if (!Object.hasOwn(instructions, mode) || typeof topic !== 'string' || !topic.trim() || topic.length > 2000) {
    const error = new Error('Pertanyaan wajib berupa teks 1–2000 karakter dengan mode yang valid.');
    error.status = 400;
    throw error;
  }
}

function parseAnswer(raw, mode) {
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Jawaban AI tidak lengkap. Coba lagi.'), { status: 502 });
  }
  if (mode === 'task' && typeof result?.answer === 'string' && (result.answer.match(/^\s*\d+[.)]\s/mg) || []).length < 3) return null; // coba model lain
  if (typeof result?.answer !== 'string' || !Array.isArray(result.cards) || result.cards.length > 12 || result.cards.some(card => !card || typeof card.front !== 'string' || typeof card.back !== 'string')) {
    throw Object.assign(new Error('Format jawaban AI tidak valid. Coba lagi.'), { status: 502 });
  }
  return result;
}

// --- Gemini (Google AI Studio, kunci gratis) ---
async function viaGemini(topic, mode) {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM} ${instructions[mode]}` }] },
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
    console.error('[ExamD Gemini]', JSON.stringify({ httpStatus: response.status, model, status: failure.error?.status, reasons: failure.error?.details?.map(d => d.reason).filter(Boolean) }));
    const error = new Error(response.status === 503
      ? 'Layanan Gemini sedang sibuk atau tidak tersedia. Coba lagi sebentar lagi.'
      : response.status === 429 ? 'Batas pemakaian Gemini tercapai. Coba lagi nanti.' : 'Gemini gagal merespons. Periksa konfigurasi server atau coba lagi.');
    error.status = response.status === 503 ? 503 : response.status === 429 ? 429 : 502;
    throw error;
  }
  const data = await response.json();
  return parseAnswer(data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join(''), mode);
}

// --- OpenRouter (kunci gratis, model bebas) ---
async function viaOpenRouter(topic, mode) {
  const models = (process.env.OPENROUTER_MODELS || 'nvidia/nemotron-3-ultra-550b-a55b:free,openrouter/free,baidu/ernie-5.5-flash-preview:free,nvidia/nemotron-3.5-super-vl:free,liquid/lfm-3-1.7b:free,particle-ai/particle-1:free,recursive/flint-v1.0:free,dots-studio/dots-3-note-preview:free').split(',').map(m => m.trim()).filter(Boolean);
  let lastError;
  for (const model of models) {
    const result = await tryModel(model, topic, mode);
    if (result) return result;
    lastError = model;
  }
  throw Object.assign(new Error(`Semua model gratis sedang penuh. Coba lagi nanti. (${lastError})`), { status: 429 });
}

async function tryModel(model, topic, mode) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `${SYSTEM} ${instructions[mode]}\nBalas HANYA JSON valid tanpa markdown: {"answer": string, "cards": [{"front": string, "back": string}]}` },
        { role: 'user', content: topic.trim() },
      ],
      max_tokens: 4000,
      temperature: 0.4,
    }),
  };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', options);
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    console.error('[ExamD OpenRouter]', JSON.stringify({ httpStatus: response.status, model, error: failure.error?.message }));
    if (response.status === 429) return null; // coba model gratis berikutnya
    const error = new Error(response.status === 401 || response.status === 403
      ? 'Kunci OpenRouter tidak valid. Periksa konfigurasi server.' : 'Layanan AI gagal merespons. Coba lagi.');
    error.status = response.status === 401 || response.status === 403 ? 503 : 502;
    throw error;
  }
  const data = await response.json();
  let text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  // Model gratis kadang menyisipkan teks di luar JSON: ambil objek pertama yang seimbang.
  const start = text.indexOf('{');
  if (start !== -1) {
    let depth = 0, quote = false, escape = false, end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { quote = !quote; continue; }
      if (!quote && c === '{') depth++;
      if (!quote && c === '}' && --depth === 0) { end = i + 1; break; }
    }
    if (end !== -1) text = text.slice(start, end);
  }
  return parseAnswer(text, mode);
}

async function generateLesson(topic, mode) {
  validateInput(topic, mode);
  if (process.env.OPENROUTER_API_KEY) {
    const result = await viaOpenRouter(topic, mode);
    if (mode !== 'flashcards') result.cards = [];
    if (mode === 'flashcards' && result.cards.length === 0) {
      throw Object.assign(new Error('AI tidak mengirim kartu. Coba lagi.'), { status: 502 });
    }
    if (!result.answer.trim()) {
      throw Object.assign(new Error('AI tidak mengirim jawaban. Coba lagi.'), { status: 502 });
    }
    return result;
  }
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('AI belum dikonfigurasi. Atur OPENROUTER_API_KEY atau GEMINI_API_KEY di server.');
    error.status = 503;
    throw error;
  }
  return viaGemini(topic, mode);
}

module.exports = { generateLesson };
