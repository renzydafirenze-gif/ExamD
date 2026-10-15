'use strict';

const assert = require('node:assert/strict');
const { generateLesson } = require('./gemini');

(async () => {
  await assert.rejects(generateLesson('', 'explain'), { status: 400 });
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only';
  try {
    global.fetch = async (url, options) => {
      assert.match(url, /generativelanguage\.googleapis\.com/);
      assert.equal(options.headers['x-goog-api-key'], 'test-only');
      assert.equal(JSON.parse(options.body).contents[0].parts[0].text, 'Eksponen');
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'Eksponen adalah pangkat.', cards: [] }) }] } }] }) };
    };
    assert.equal((await generateLesson('Eksponen', 'explain')).answer, 'Eksponen adalah pangkat.');
    global.fetch = async () => ({ ok: false, status: 429 });
    await assert.rejects(generateLesson('Eksponen', 'task'), { status: 429 });
    console.log('Gemini: validasi, request, respons, dan batas kuota lolos (mock).');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
