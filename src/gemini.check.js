'use strict';

const assert = require('node:assert/strict');
const { generateLesson } = require('./ai');

(async () => {
  await assert.rejects(generateLesson('', 'explain'), { status: 400 });
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalGemini = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-only';
  process.env.OPENROUTER_MODELS = 'test/model-a,test/model-b';
  try {
    let calls = 0;
    global.fetch = async (url, options) => {
      assert.match(url, /openrouter\.ai/);
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      calls++;
      if (calls === 1) return { ok: false, status: 429, json: async () => ({}) }; // fallback model
      return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n{"answer":"Eksponen adalah pangkat.","cards":[]}\n```' } }] }) };
    };
    assert.equal((await generateLesson('Eksponen', 'explain')).answer, 'Eksponen adalah pangkat.');
    assert.equal(calls, 2);
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await assert.rejects(generateLesson('Eksponen', 'task'), { status: 503 });
    console.log('AI: validasi, fallback model, respons JSON, dan kunci invalid lolos (mock).');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalGemini !== undefined) process.env.GEMINI_API_KEY = originalGemini;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
