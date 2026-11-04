import test from 'node:test';
import assert from 'node:assert/strict';
import { narrationFor, speechChunks, createSpeechPlayer } from '../src/speech.js';

function fixture() {
  const states = [], errors = [], spoken = [];
  const voices = [{ voiceURI: 'english', lang: 'en-US', name: 'English' }, { voiceURI: 'cantonese', lang: 'zh-HK', name: 'Cantonese' }];
  const engine = { cancels: 0, pauses: 0, resumes: 0,
    getVoices: () => voices, speak: u => spoken.push(u),
    cancel() { this.cancels++; }, pause() { this.pauses++; }, resume() { this.resumes++; }
  };
  class Utterance { constructor(text) { this.text = text; } }
  const player = createSpeechPlayer({ synthesis: engine, Utterance, onState: state => states.push(state), onError: error => errors.push(error) });
  return { states, errors, spoken, engine, player };
}

test('narration includes structured recommendations and checks without reading URLs', () => {
  const text = narrationFor({ text: 'Read [handbook](https://example.org/book).', courses: [{ code: 'DEMO301', title: 'ML', credits: 3, reason: 'Your interests.', prerequisite: 'Maths' }], semesters: [{ title: 'Next term', credits: 3, courses: ['DEMO301 ML'] }], checks: ['Availability unknown'] });
  assert.match(text, /Read handbook/); assert.match(text, /Prerequisites: Maths/);
  assert.match(text, /Next term/); assert.match(text, /Availability unknown/);
  assert.doesNotMatch(text, /https/);
});

test('long English and Chinese answers are chunked without losing text', () => {
  for (const text of ['Read course descriptions carefully. '.repeat(40), '大学课程规划需要检查先修课。'.repeat(60)]) {
    const chunks = speechChunks(text);
    assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.length <= 220));
    assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  }
});

test('read aloud waits for each chunk and returns to idle after completion', () => {
  const f = fixture(); f.player.speak({ messageId: 'a', text: 'A course plan. '.repeat(40) });
  assert.equal(f.spoken.length, 1);
  let i = 0;
  while (i < f.spoken.length) { const u = f.spoken[i++]; u.onstart(); u.onend(); }
  assert.ok(i > 1); assert.equal(f.states.at(-1).status, 'idle');
  assert.deepEqual(f.errors, []);
});

test('voice and rate preferences are applied; pause and resume preserve the answer', () => {
  const f = fixture(); f.player.speak({ messageId: 'a', text: 'Hello', voiceURI: 'cantonese', rate: 0.8 });
  const u = f.spoken[0]; assert.equal(u.lang, 'zh-HK'); assert.equal(u.rate, 0.8);
  f.player.pause(); u.onstart(); assert.equal(f.states.at(-1).status, 'paused');
  f.player.resume(); assert.equal(f.states.at(-1).status, 'speaking');
  assert.equal(f.engine.pauses, 1); assert.equal(f.engine.resumes, 1); f.player.stop();
});

test('switching answers invalidates stale events and stops overlapping speech', () => {
  const f = fixture(); f.player.speak({ messageId: 'a', text: 'Old answer' });
  const old = f.spoken[0]; f.player.speak({ messageId: 'b', text: 'New answer' });
  old.onstart(); old.onend(); old.onerror({ error: 'interrupted' });
  assert.equal(f.states.at(-1).messageId, 'b'); assert.equal(f.spoken.length, 2);
  assert.deepEqual(f.errors, []); f.player.stop();
});

test('stop invalidates callbacks from navigation, microphone and new-chat cancellation', () => {
  const f = fixture(); f.player.speak({ messageId: 'a', text: 'Current answer' });
  f.player.stop(); f.spoken[0].onerror({ error: 'canceled' }); f.spoken[0].onend();
  assert.equal(f.states.at(-1).status, 'idle'); assert.deepEqual(f.errors, []);
});

test('blocked playback gives a recoverable error', () => {
  const f = fixture(); f.player.speak({ messageId: 'a', text: 'Hello' });
  f.spoken[0].onerror({ error: 'not-allowed' });
  assert.equal(f.states.at(-1).status, 'idle'); assert.match(f.errors[0], /blocked read aloud/);
});

test('missing browser support keeps text chat usable', () => {
  const errors = [];
  const player = createSpeechPlayer({ synthesis: null, Utterance: null, onState() {}, onError: e => errors.push(e) });
  player.speak({ messageId: 'a', text: 'Hello' }); assert.match(errors[0], /not supported/);
});

test('an engine that never starts times out instead of leaving controls stuck', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); f.player.speak({ messageId: 'a', text: 'Hello' });
  context.mock.timers.tick(15001);
  assert.equal(f.states.at(-1).status, 'idle'); assert.match(f.errors[0], /did not start/);
});
