import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceSession, pickRecorderMime, speechSupport } from '../src/voice.js';

function flush() { return new Promise(resolve => setTimeout(resolve, 0)); }

function fixture({ transcribe, getUserMedia, blobSize = 400 } = {}) {
  const tracks = [{ stop() { this.stopped = true; } }];
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('audio/webm'); }
    constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['x'.repeat(blobSize)], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }
  const states = [], previews = [], completed = [], errors = [];
  const session = createVoiceSession({
    language: 'zh-CN',
    MediaRecorder: Recorder,
    getUserMedia: getUserMedia || (async () => ({ getTracks: () => tracks })),
    transcribe: transcribe || (async () => '我想选机器学习'),
    onState: x => states.push(x),
    onPreview: x => previews.push(x),
    onComplete: x => completed.push(x),
    onError: x => errors.push(x)
  });
  return { session, tracks, states, previews, completed, errors };
}

test('uses MediaRecorder rather than the browser SpeechRecognition API', () => {
  assert.equal(speechSupport({ MediaRecorder: class {}, navigator: { mediaDevices: { getUserMedia() {} } } }), true);
  assert.equal(speechSupport({}), false);
  assert.equal(pickRecorderMime({ isTypeSupported: type => type === 'audio/webm' }), 'audio/webm');
});

test('records locally then transcribes through the Qwen callback', async () => {
  const f = fixture();
  f.session.start();
  await flush();
  assert.equal(f.states.at(-1), 'listening');
  f.session.stop();
  await flush();
  assert.deepEqual(f.completed, ['我想选机器学习']);
  assert.equal(f.states.at(-1), 'idle');
  assert.equal(f.tracks[0].stopped, true);
});

test('cancel drops an in-flight transcript so a new chat cannot receive old dictation', async () => {
  let resolveTranscript;
  const f = fixture({
    transcribe: () => new Promise(resolve => { resolveTranscript = resolve; })
  });
  f.session.start();
  await flush();
  f.session.stop();
  await flush();
  f.session.cancel();
  resolveTranscript('旧的问题');
  await flush();
  assert.deepEqual(f.completed, []);
  assert.equal(f.states.at(-1), 'idle');
});

test('denied microphone permission resets to idle', async () => {
  const error = new Error('Permission denied');
  error.name = 'NotAllowedError';
  const f = fixture({ getUserMedia: async () => { throw error; } });
  f.session.start();
  await flush();
  assert.match(f.errors[0], /access was denied/);
  assert.equal(f.states.at(-1), 'idle');
  assert.deepEqual(f.completed, []);
});

test('a near-empty recording is treated as no speech', async () => {
  const f = fixture({ blobSize: 1 });
  f.session.start();
  await flush();
  f.session.stop();
  await flush();
  assert.match(f.errors[0], /No speech was detected/);
  assert.deepEqual(f.completed, []);
});
