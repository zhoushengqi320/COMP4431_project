import test from 'node:test';
import assert from 'node:assert/strict';
import { companionState, states } from '../src/avatar/state.js';

test('real recording and transcription take priority over stale playback/errors', () => {
  assert.equal(companionState({ voiceState: 'listening', speechState: { status: 'speaking' }, error: 'old error' }), 'listening');
  assert.equal(companionState({ voiceState: 'starting' }), 'connecting');
  assert.equal(companionState({ voiceState: 'stopping' }), 'transcribing');
});
test('chat wait and actual playback events map independently, including pauses', () => {
  assert.equal(companionState({ loading: true, speechState: { status: 'idle' } }), 'thinking');
  assert.equal(companionState({ speechState: { status: 'starting' } }), 'preparing');
  assert.equal(companionState({ speechState: { status: 'speaking' } }), 'speaking');
  assert.equal(companionState({ speechState: { status: 'paused' } }), 'paused');
  assert.equal(companionState({ speechState: { status: 'idle' } }), 'idle');
});
test('error recovery returns to idle and every lifecycle result has display metadata', () => {
  assert.equal(companionState({ error: 'Unavailable' }), 'error');
  assert.equal(companionState({ error: '' }), 'idle');
  for (const voiceState of ['idle','starting','listening','stopping']) {
    for (const status of ['idle','starting','speaking','paused']) {
      assert.ok(states[companionState({ voiceState, speechState: { status } })]);
    }
  }
});
