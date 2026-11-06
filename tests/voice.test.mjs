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

test('conversation recording stops on detected silence and transcribes exactly once', async () => {
  let detector, calls = 0, disposed = 0;
  const f = fixture({ transcribe: async () => { calls++; return 'A short question'; } });
  // Use a separate session with an injected monitor so no microphone is accessed.
  const tracks = [{ stop() {} }];
  class Recorder { constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; } stop() { if (this.state === 'inactive') return; this.state = 'inactive'; this.ondataavailable({ data: new Blob(['a'.repeat(400)]) }); this.onstop(); } }
  const completed = [];
  const session = createVoiceSession({ MediaRecorder: Recorder, getUserMedia: async () => ({ getTracks: () => tracks }), autoStop: true,
    silenceMonitor: (_, callbacks) => { detector = callbacks; return () => disposed++; }, transcribe: async () => { calls++; return 'A short question'; },
    onState() {}, onPreview() {}, onError: assert.fail, onComplete: text => completed.push(text) });
  session.start(); await flush(); detector.onFinish(); session.stop(); await flush();
  assert.equal(calls, 1); assert.deepEqual(completed, ['A short question']); assert.ok(disposed > 0);
  f.session.cancel();
});

test('late microphone permission after cancellation closes the stream without recording', async () => {
  let allow, closed = 0, recorded = 0;
  class Recorder { constructor() { recorded++; } }
  const session = createVoiceSession({ MediaRecorder: Recorder, getUserMedia: () => new Promise(resolve => { allow = resolve; }),
    transcribe: assert.fail, onState() {}, onPreview() {}, onComplete: assert.fail, onError: assert.fail });
  session.start(); session.cancel(); allow({ getTracks: () => [{ stop() { closed++; } }] }); await flush();
  assert.equal(recorded, 0); assert.equal(closed, 1);
});

test('repeated start while permission is pending opens only one recording session', async () => {
  let allow, requests = 0, stopped = 0;
  const f = fixture({ getUserMedia: () => { requests++; return new Promise(resolve => { allow = resolve; }); } });
  f.session.start();
  f.session.start();
  assert.equal(requests, 1);
  f.session.cancel();
  allow({ getTracks: () => [{ stop() { stopped++; } }] });
  await flush();
  assert.equal(stopped, 1);
  assert.equal(f.states.filter(state => state === 'idle').length, 1);
});
