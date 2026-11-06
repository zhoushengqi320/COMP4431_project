import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceConversation } from '../src/voice-conversation.js';
import { createTurnDetector } from '../src/silence.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const recordings = [], states = [], errors = [], calls = [], queued = [];
  let completeSpeech;
  const f = { recordings, states, errors, calls, queued, stops: 0, cancellations: 0 };
  const conversation = createVoiceConversation({
    createSession(callbacks) {
      const session = { ...callbacks, cancelled: false, start() { callbacks.onState('listening'); }, stop() { callbacks.onState('stopping'); }, cancel() { this.cancelled = true; } };
      recordings.push(session); return session;
    },
    requestReply: options.requestReply || (async text => { calls.push(text); return { id: 'answer', text: 'Have you studied programming?' }; }),
    speakReply: options.speakReply || (() => new Promise(resolve => { completeSpeech = resolve; })),
    stopSpeech: () => { f.stops++; }, cancelReply: () => { f.cancellations++; },
    onState: value => states.push(value), onError: value => errors.push(value),
    schedule: callback => { queued.push(callback); return callback; }, unschedule: callback => { const i = queued.indexOf(callback); if (i >= 0) queued.splice(i, 1); }
  });
  return { ...f, conversation, completeSpeech: () => completeSpeech() };
}

test('voice turns wait for transcription, answer and completed audio before recording again', async () => {
  const f = fixture(); f.conversation.start();
  assert.equal(f.recordings.length, 1);
  const answer = f.recordings[0].onComplete('I want to learn AI.');
  await tick(); assert.deepEqual(f.calls, ['I want to learn AI.']);
  assert.equal(f.states.at(-1), 'preparing'); assert.equal(f.queued.length, 0);
  f.completeSpeech(); await answer;
  assert.equal(f.queued.length, 1); f.queued.shift()();
  assert.equal(f.recordings.length, 2); assert.equal(f.states.at(-1), 'listening');
  f.conversation.stop();
});

test('end and interrupt invalidate in-flight answers and do not play late responses', async () => {
  let reply, spoken = 0;
  const f = fixture({ requestReply: () => new Promise(resolve => { reply = resolve; }), speakReply: () => { spoken++; } });
  f.conversation.start(); const pending = f.recordings[0].onComplete('Old question');
  await tick(); f.conversation.interrupt();
  assert.equal(f.recordings.length, 2);
  reply({ text: 'Old answer' }); await pending; assert.equal(spoken, 0);
  f.conversation.stop(); assert.equal(f.recordings[1].cancelled, true);
  f.recordings[1].onComplete('Late transcript'); assert.equal(f.states.at(-1), 'off');
});

test('recognition, model and playback errors pause the loop without automatic paid retries', async () => {
  for (const stage of ['recognition', 'model', 'playback']) {
    const failure = async () => { throw new Error(`${stage} failed`); };
    const f = fixture(stage === 'model' ? { requestReply: failure } : stage === 'playback' ? { speakReply: failure } : {});
    f.conversation.start();
    if (stage === 'recognition') f.recordings[0].onError('Permission denied');
    else await f.recordings[0].onComplete('Question');
    assert.equal(f.states.at(-1), 'error'); assert.equal(f.conversation.isActive(), false);
    assert.equal(f.queued.length, 0); assert.equal(f.errors.length, 1);
  }
});

test('stopping after playback cancels the scheduled next microphone turn', async () => {
  const f = fixture({ speakReply: async () => {} }); f.conversation.start();
  await f.recordings[0].onComplete('Question');
  assert.equal(f.queued.length, 1); f.conversation.stop();
  assert.equal(f.queued.length, 0); assert.equal(f.recordings.length, 1);
});

test('silence detection ignores a brief noise, allows a natural pause, and ends sustained speech', () => {
  const detect = createTurnDetector();
  for (let t = 0; t < 600; t += 100) assert.equal(detect(t === 100 ? .1 : 0, t), null);
  for (let t = 600; t <= 1100; t += 100) assert.equal(detect(.05, t), null);
  assert.equal(detect(0, 2100), null); assert.equal(detect(0, 2600), 'finish');
  const empty = createTurnDetector(); empty(0, 0); assert.equal(empty(0, 15000), 'empty');
  const continuous = createTurnDetector({ maxMs: 2000 });
  for (let t = 0; t < 2000; t += 100) assert.equal(continuous(.1, t), null);
  assert.equal(continuous(.1, 2000), 'finish');
});
