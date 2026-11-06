import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveResponseLanguage, responseLanguageInstruction } from '../server/response-language.mjs';

test('current question language wins over Chinese history and mixed course titles', () => {
  const history = [{ role: 'user', text: '介绍机器学习课程' }, { role: 'assistant', text: '以下是课程介绍' }];
  assert.equal(resolveResponseLanguage('What is COMP4431?', history).code, 'en');
  assert.equal(resolveResponseLanguage('Tell me about “数据结构” courses.', history).code, 'en');
  assert.equal(resolveResponseLanguage('What does 数据结构 cover?', history).code, 'en');
  assert.equal(resolveResponseLanguage('我想学 machine learning，给我推荐课程。').code, 'zh');
  assert.equal(resolveResponseLanguage('請問 COMP4431 是什麼課程？').code, 'zh-Hant');
  assert.equal(resolveResponseLanguage('Tell me about English courses.').code, 'en');
  assert.equal(resolveResponseLanguage('我想找 English courses。').code, 'zh');
});

test('explicit reply-language instructions override the question language', () => {
  for (const question of ['请用英文回答，COMP4431 是什么课？', '介绍 COMP4431。English please.', '解释 COMP4431，用英语。', '介绍 COMP4431。Use English.']) {
    assert.equal(resolveResponseLanguage(question).code, 'en', question);
  }
  for (const question of ['What is COMP4431? Please answer in Chinese.', 'Please reply using simplified Chinese. What is COMP4431?']) {
    assert.equal(resolveResponseLanguage(question).code, 'zh', question);
  }
  assert.equal(resolveResponseLanguage('Please explain COMP4431 in Traditional Chinese.').code, 'zh-Hant');
  assert.equal(resolveResponseLanguage('介绍 COMP4431，请用法语回答。').code, 'fr');
  assert.equal(resolveResponseLanguage('Explain COMP4431 in Spanish.').code, 'es');
  assert.equal(resolveResponseLanguage('Explain COMP4431 in Cantonese.').code, 'yue');
  assert.equal(resolveResponseLanguage('Reply in Chinese. Actually answer in English.').code, 'en');
});

test('negative and quoted instructions do not change reply language', () => {
  assert.equal(resolveResponseLanguage('Do not reply in Chinese. Explain COMP4431.').code, 'en');
  assert.equal(resolveResponseLanguage('请不要用英文回答，介绍 COMP4431。').code, 'zh');
  assert.equal(resolveResponseLanguage('Explain the sentence "reply in Chinese".').code, 'en');
  assert.equal(resolveResponseLanguage('我想用英语学习机器学习，推荐什么课程？').code, 'zh');
});

test('code-only turns inherit user language while substantive new questions reset it', () => {
  const history = [{ role: 'user', text: '请用英文回答。' }, { role: 'assistant', text: '好的。' }];
  assert.equal(resolveResponseLanguage('COMP4431', history).code, 'en');
  assert.equal(resolveResponseLanguage('这门课学什么？', history).code, 'zh');
  assert.equal(resolveResponseLanguage('DSAI2201', [{ role: 'user', text: '請介紹課程' }]).code, 'zh-Hant');
  assert.equal(resolveResponseLanguage('COMP4431', [{ role: 'assistant', text: '中文回答' }]).code, 'en');
});

test('common non-English questions keep their own response language', () => {
  assert.equal(resolveResponseLanguage('COMP4431では何を学びますか？').code, 'ja');
  assert.equal(resolveResponseLanguage('COMP4431 呢門課教啲咩？').code, 'yue');
  assert.equal(resolveResponseLanguage('COMP4431에서는 무엇을 배우나요?').code, 'ko');
  assert.equal(resolveResponseLanguage('Quels cours pouvez vous recommander?').code, 'fr');
  assert.equal(resolveResponseLanguage('Quiero aprender machine learning.').code, 'es');
  assert.equal(resolveResponseLanguage('¿Qué es COMP4431?').code, 'es');
  assert.equal(resolveResponseLanguage('Welche Kurse kann ich lernen?').code, 'de');
  assert.match(responseLanguageInstruction(resolveResponseLanguage('What is COMP4431?')), /Write all user-facing.*in English/);
});
