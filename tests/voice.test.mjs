import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceSession, speechSupport } from '../src/voice.js';

function fixture() {
  let engine;
  class Recognition {
    constructor() { engine = this; }
    start() { this.onstart?.(); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }
  const states = [], previews = [], completed = [], errors = [];
  const session = createVoiceSession({ Recognition, language: 'zh-HK', onState: x => states.push(x), onPreview: x => previews.push(x), onComplete: x => completed.push(x), onError: x => errors.push(x) });
  return { engine, session, states, previews, completed, errors };
}
const result = (transcript, isFinal) => Object.assign([{ transcript }], { isFinal });

test('recognises standard/prefixed browser APIs and the unsupported case', () => {
  class Recognition {}
  assert.equal(speechSupport({ SpeechRecognition: Recognition }), Recognition);
  assert.equal(speechSupport({ webkitSpeechRecognition: Recognition }), Recognition);
  assert.equal(speechSupport({}), null);
});

test('revised interim results are not duplicated or committed before completion', () => {
  const f = fixture(); f.session.start();
  assert.equal(f.engine.lang, 'zh-HK');
  f.engine.onresult({ results: [result('Plan my', false)] });
  f.engine.onresult({ results: [result('Plan my semester', true), result('please', false)] });
  f.engine.onresult({ results: [result('Plan my semester', true), result('please', true)] });
  assert.equal(f.previews.at(-1), 'Plan my semester please');
  assert.deepEqual(f.completed, []);
  f.engine.onend();
  assert.deepEqual(f.completed, ['Plan my semester please']);
  assert.equal(f.states.at(-1), 'idle');
});

test('stop waits for final results rather than dropping them', () => {
  const f = fixture(); f.session.start(); f.session.stop();
  assert.equal(f.engine.stopped, true);
  assert.equal(f.states.at(-1), 'stopping');
  f.engine.onresult({ results: [result('Check prerequisites', true)] }); f.engine.onend();
  assert.deepEqual(f.completed, ['Check prerequisites']);
});

test('cancel ignores late results so a new chat cannot receive old dictation', () => {
  const f = fixture(); f.session.start(); f.session.cancel();
  f.engine.onresult({ results: [result('Old question', true)] }); f.engine.onend();
  assert.equal(f.engine.aborted, true);
  assert.deepEqual(f.completed, []);
  assert.deepEqual(f.errors, []);
});

test('denied permission resets state even if the browser never sends onend', () => {
  const f = fixture(); f.session.start(); f.engine.onerror({ error: 'not-allowed' });
  assert.match(f.errors[0], /access was denied/);
  assert.equal(f.states.at(-1), 'idle');
  assert.equal(f.engine.aborted, true);
  f.engine.onend(); assert.deepEqual(f.completed, []);
});

test('no final speech and network failures are recoverable errors', () => {
  const empty = fixture(); empty.session.start(); empty.engine.onend();
  assert.match(empty.errors[0], /No final transcript/);
  const failed = fixture(); failed.session.start(); failed.engine.onerror({ error: 'network' });
  assert.match(failed.errors[0], /could not connect/);
  assert.equal(failed.states.at(-1), 'idle');
});
