import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { localizeResponse, translationCourseCodes } from '../server/localize-response.mjs';
import { normalizeCourseResponse } from '../server/course-response.mjs';

test('English course cards localize Chinese database fields without changing source evidence or metadata', async t => {
  let calls = 0;
  let invalid = false;
  const translations = new Map([
    ['人工智能', 'Artificial Intelligence'], ['学习搜索方法', 'Learn search methods'],
    ['介绍', 'Course introduction'], ['先修 COMP1011', 'Prerequisite COMP1011'],
    ['香港从1841年至1997年的历史', 'Hong Kong history from 1841 to 1997'],
    ['中国自1949年以来的历史', 'China since 1949'],
    ['中国1911年的历史', 'China 1911 history']
  ]);
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    const payload = JSON.parse(body); calls++;
    assert.match(payload.messages[0].content, /Translate display strings into English/);
    const { strings } = JSON.parse(payload.messages[1].content);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations: strings.map(text => invalid ? 'Invented COMP9999' : translations.get(text)) }) } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const options = { env: { QWEN_BASE_URL: `http://127.0.0.1:${server.address().port}/v1` }, apiKey: 'test-only', res: new EventEmitter() };
  const answer = { text: '介绍', courses: [{ code: 'COMP4431', title: '人工智能', objectives: '学习搜索方法',
    rating: 4.2, credits: 3, summary: 'Learn practical methods.', learningOutcomes: ['学习搜索方法'],
    preparation: { description: '先修 COMP1011', sourceText: '先修 COMP1011', levels: [{ level: 1, courses: ['COMP1011'] }] } }] };
  const localized = await localizeResponse(answer, { code: 'en', name: 'English' }, options);
  assert.equal(localized.courses[0].objectives, 'Learn search methods');
  assert.equal(localized.courses[0].learningOutcomes[0], 'Learn search methods');
  assert.equal(localized.courses[0].preparation.sourceText, '先修 COMP1011');
  assert.equal(localized.courses[0].rating, 4.2);
  assert.equal(localized.courses[0].credits, 3);
  assert.equal(localized.courses[0].code, 'COMP4431');
  assert.equal(calls, 1);
  await localizeResponse(localized, { code: 'en', name: 'English' }, options);
  assert.equal(calls, 1, 'already English text does not trigger another call');
  for (const text of ['香港从1841年至1997年的历史', '中国自1949年以来的历史', '中国1911年的历史']) {
    const historyAnswer = await localizeResponse({ text }, { code: 'en', name: 'English' }, options);
    assert.equal(historyAnswer.text, translations.get(text));
  }
  invalid = true;
  await assert.rejects(localizeResponse({ text: '先修 COMP1011' }, { code: 'en', name: 'English' }, options), error => error.status === 502);
});

test('translation validation distinguishes historical dates from compact and spaced course identifiers', () => {
  const prefixes = new Set(['COMP', 'CHC', 'DSAI']);
  assert.deepEqual(translationCourseCodes('from 1841 to 1997; China 1911; Since 1949; FROM 1841 TO 1997', prefixes), []);
  assert.deepEqual(translationCourseCodes('comp 1011 and CHC 1D01, DSAI2201', prefixes), ['COMP1011', 'CHC1D01', 'DSAI2201']);
  assert.deepEqual(translationCourseCodes('New COMP 9999 or FAKE9999', prefixes), ['COMP9999', 'FAKE9999']);
});

test('explicit language overrides the script of the question for course card labels and fallbacks', () => {
  const row = { code: 'COMP4431', name: 'Artificial Intelligence', objectives: '学习搜索方法', prerequisites: '' };
  const english = normalizeCourseResponse({ text: 'Details' }, [row], '请介绍 COMP4431，用英文回答');
  assert.equal(english.courses[0].language, 'en');
  assert.ok(english.followUps.every(text => !/\p{Script=Han}/u.test(text)));
  const chinese = normalizeCourseResponse({ text: '介绍' }, [row], 'Tell me about COMP4431. Please reply in Chinese.');
  assert.equal(chinese.courses[0].language, 'zh');
  assert.ok(chinese.followUps.every(text => /\p{Script=Han}/u.test(text)));
});
