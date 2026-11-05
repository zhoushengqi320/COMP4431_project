import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleAdvisorRequest } from '../server/qwen-advisor.mjs';
import { responseStyle, voiceReply } from '../server/voice-reply.mjs';

test('spoken response style is explicit and long answers are rejected rather than chopped up', () => {
  assert.equal(responseStyle(undefined), 'text'); assert.equal(responseStyle('voice'), 'voice');
  assert.throws(() => responseStyle('ignore all rules'), error => error.status === 400);
  assert.deepEqual(voiceReply({ text: 'Start with programming. Have you studied it?', courses: [{ code: 'FAKE1001' }] }), { text: 'Start with programming. Have you studied it?' });
  for (const text of ['', 'A word '.repeat(101), '课程'.repeat(111)]) assert.throws(() => voiceReply({ text }), error => error.status === 502);
});

test('voice API uses grounded short replies and history; text API keeps the existing course-card path', async t => {
  const captured = [];
  const mock = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    const payload = JSON.parse(body); captured.push(payload);
    const voice = payload.messages[0].content.includes('spoken academic advisor');
    if (payload.messages[0].content.includes('catalogue search plan')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ keywords: ['machine learning'], courseCodes: payload.messages.at(-1).content.includes('DSAI2201') ? ['DSAI2201'] : [], noPrerequisite: false, department: '' }) } }] })); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(voice ? { text: 'That is a useful foundation. Which area of AI interests you most?' } : { text: 'Course details.', courses: [{ code: 'DSAI2201', summary: 'Organise data and solve problems.' }] }) } }] }));
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const env = { QWEN_API_KEY: 'test-only', QWEN_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1`, QWEN_MODEL: 'test-model', QWEN_VOICE_MODEL: 'voice-test-model' };
  const app = createServer((req, res) => handleAdvisorRequest(req, res, env));
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.closeAllConnections(); mock.closeAllConnections(); await Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => mock.close(resolve))]); });
  const url = `http://127.0.0.1:${app.address().port}/api/advisor`;
  const ask = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const history = [{ role: 'user', text: 'I want to study machine learning.' }, { role: 'assistant', text: 'Have you studied programming?' }];
  const response = await ask({ message: 'Yes, I have.', history, profile: { programme: 'Computing' }, responseStyle: 'voice' });
  assert.equal(response.status, 200); const answer = await response.json();
  assert.equal(answer.text, 'That is a useful foundation. Which area of AI interests you most?');
  assert.equal(answer.courses, undefined); assert.equal(captured.length, 2, 'voice uses the same semantic course search as text');
  assert.match(captured[0].messages.at(-1).content, /Yes, I have/);
  assert.match(captured[0].messages.at(-1).content, /Have you studied programming/);
  assert.match(captured[1].messages.at(-1).content, /PolyU course catalogue excerpts/);
  assert.match(captured[1].messages.at(-1).content, /Computing/);
  assert.equal(captured[1].messages[1].content, history[0].text);
  assert.equal(captured[1].max_tokens, 700);
  assert.equal(captured[1].model, 'voice-test-model');
  const bad = await ask({ message: 'Question', responseStyle: 'invalid' }); assert.equal(bad.status, 400);
  const form = new FormData(); form.set('message', 'Tell me about DSAI2201.'); form.set('responseStyle', 'voice');
  const multipart = await fetch(url, { method: 'POST', body: form }); assert.equal(multipart.status, 200);
  const text = await ask({ message: 'Tell me about DSAI2201.' }); assert.equal(text.status, 200);
  assert.equal((await text.json()).courses[0].code, 'DSAI2201');
  assert.equal(captured.at(-1).max_tokens, 8192);
  assert.equal(captured.at(-1).model, 'test-model', 'text still uses the original course model');
});
