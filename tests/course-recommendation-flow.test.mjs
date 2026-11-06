import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleAdvisorRequest } from '../server/qwen-advisor.mjs';

test('English history requests offer more courses even when the model proposes only two, and continue without repeats', async t => {
  const plans = [];
  const catalogues = [];
  let translations = 0;
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const instruction = payload.messages[0].content;
    let answer;
    if (instruction.includes('catalogue search plan')) {
      plans.push(payload);
      answer = { keywords: ['history'], courseCodes: [], noPrerequisite: false, department: '' };
    } else if (instruction.startsWith('Translate display strings')) {
      translations++;
      const { strings } = JSON.parse(payload.messages.at(-1).content);
      // Keep all original identifiers while replacing Chinese display prose.
      answer = { translations: strings.map(value => `Course information ${value.replace(/\p{Script=Han}/gu, '')}`) };
    } else {
      const content = payload.messages.at(-1).content;
      const codes = [...content.matchAll(/^([A-Z0-9/]+) \| /gm)].map(match => match[1]);
      catalogues.push(codes);
      // Deliberately omit moreCourseCodes and never propose over three cards.
      answer = { text: 'Here are two history courses.', courses: codes.slice(0, 2).map(code => ({ code, summary: 'Explore historical developments.' })) };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const env = {
    QWEN_API_KEY: 'test-only',
    QWEN_MODEL: 'test-course-model',
    QWEN_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`
  };
  const app = createServer((req, res) => handleAdvisorRequest(req, res, env));
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    app.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise(resolve => app.close(resolve)),
      new Promise(resolve => upstream.close(resolve))
    ]);
  });
  const url = `http://127.0.0.1:${app.address().port}/api/advisor`;
  async function ask(message, history = []) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history })
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  }

  const question = 'give me some course about history';
  const first = await ask(question);
  assert.equal(first.replyLanguage, 'en-US');
  assert.equal(first.courses.length, 2);
  assert.ok(catalogues[0].length > first.courses.length, 'retrieval found further grounded history courses');
  assert.equal(first.moreCourses?.available, true);
  assert.match(first.moreCourses.prompt, /more.*courses/i);
  assert.doesNotMatch(first.moreCourses.prompt, /\p{Script=Han}/u);
  assert.equal(first.recommendationContext.query, question);
  assert.ok(first.recommendationContext.reserveCodes.length > 0);
  assert.ok(translations > 0, 'actual catalogue fields pass through the English localization route');

  const second = await ask(first.moreCourses.prompt, [
    { role: 'user', text: question }, { ...first, role: 'assistant' }
  ]);
  const seen = new Set(first.courses.map(course => course.code));
  assert.equal(second.replyLanguage, 'en-US');
  assert.ok(second.courses.length > 0 && second.courses.length <= 3);
  assert.ok(second.courses.every(course => !seen.has(course.code)));
  assert.ok(catalogues[1].every(code => !seen.has(code)), 'seen courses are excluded before model generation');
  assert.equal(second.recommendationContext.query, question);
  assert.equal(catalogues.length, 2);
  assert.equal(plans.length, 2);
  for (const plan of plans) {
    const content = plan.messages.at(-1).content;
    assert.equal(JSON.parse(content.slice(content.indexOf('{'))).question, question);
  }
});
