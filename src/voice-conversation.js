// One recording, request and playback at a time. Tokens discard late callbacks.
export function createVoiceConversation({ createSession, requestReply, speakReply, stopSpeech, cancelReply, onState, onError, schedule = setTimeout, unschedule = clearTimeout }) {
  let active = false, generation = 0, session = null, nextTimer = null;
  const valid = token => active && token === generation;
  function clean() {
    generation++;
    unschedule(nextTimer); nextTimer = null;
    const old = session; session = null; old?.cancel();
    cancelReply(); stopSpeech();
  }
  function fail(token, error) {
    if (!valid(token)) return;
    clean(); active = false;
    onState('error'); onError(error?.message || String(error));
  }
  function listen(token) {
    if (!valid(token)) return;
    onState('starting');
    try {
      session = createSession({
        onState: state => { if (valid(token) && state !== 'idle') onState(state); },
        onError: error => fail(token, error),
        onComplete: async text => {
          if (!valid(token)) return;
          session = null;
          if (!text?.trim()) { fail(token, 'No speech was recognised. Start again when you are ready.'); return; }
          onState('thinking');
          try {
            const answer = await requestReply(text, () => valid(token));
            if (!valid(token)) return;
            if (!answer) throw new Error('The message could not be sent. Please start again.');
            onState('preparing');
            await speakReply(answer);
            if (!valid(token)) return;
            onState('waiting');
            nextTimer = schedule(() => listen(token), 500);
          } catch (error) { fail(token, error); }
        }
      });
      session.start();
    } catch (error) { fail(token, error); }
  }
  return {
    start() { clean(); active = true; listen(generation); },
    finish() { session?.stop(); },
    interrupt() { if (!active) return; clean(); listen(generation); },
    stop() { active = false; clean(); onState('off'); },
    isActive: () => active
  };
}
