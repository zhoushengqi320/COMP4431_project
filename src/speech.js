// Read-aloud uses the browser's speech service. No Qwen key or audio backend is needed.
export function narrationFor(message) {
  const parts = [message.text];
  for (const course of message.courses || []) {
    parts.push(`${course.code || ''}. ${course.title || ''}. ${course.credits ?? ''} credits.`, course.reason);
    if (course.prerequisite) parts.push(`Prerequisites: ${course.prerequisite}`);
  }
  for (const semester of message.semesters || []) {
    parts.push(`${semester.title}. ${semester.credits ?? ''} credits.`, ...(semester.courses || []));
  }
  if (message.checks?.length) parts.push('Planning checks.', ...message.checks);
  return parts.filter(part => typeof part === 'string' && part.trim()).join('\n')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(^|\n)\s*#{1,6}\s+/g, '$1')
    .replace(/[*`]/g, '').trim();
}

export function speechChunks(text, limit = 220) {
  const chunks = [];
  let rest = text.replace(/\s+/g, ' ').trim();
  while (rest.length > limit) {
    const part = rest.slice(0, limit + 1);
    let cut = -1;
    for (const match of part.matchAll(/[.!?。！？;；]\s*|\s+/g)) {
      if (match.index > limit / 3 && match.index + match[0].length <= limit) cut = match.index + match[0].length;
    }
    if (cut < 1) cut = limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function createSpeechPlayer({ synthesis, Utterance, onState, onError }) {
  let generation = 0;
  let current = null;
  let startTimer = null;
  const idle = () => onState({ messageId: null, status: 'idle' });
  function stop() {
    generation += 1;
    clearTimeout(startTimer);
    current = null;
    // Invalidate before cancel: browsers may immediately dispatch an interrupted error.
    synthesis?.cancel();
    idle();
  }
  function fail(message) { stop(); onError(message); }
  return {
    speak({ messageId, text, language = 'en-US', rate = 1, voiceURI = '' }) {
      stop();
      if (!synthesis || !Utterance) { onError('Read aloud is not supported in this browser. Please read the text or try another browser.'); return; }
      const chunks = speechChunks(text);
      if (!chunks.length) return;
      const token = generation;
      const voices = synthesis.getVoices();
      const voice = voices.find(item => item.voiceURI === voiceURI)
        || voices.find(item => item.default && item.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()))
        || voices.find(item => item.lang.toLowerCase() === language.toLowerCase())
        || voices.find(item => item.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));
      const active = { messageId, paused: false, index: 0, utterance: null };
      current = active;
      function next() {
        if (generation !== token) return;
        if (active.index === chunks.length) { current = null; generation += 1; idle(); return; }
        const utterance = new Utterance(chunks[active.index++]);
        // Retain the utterance until completion (some engines otherwise drop long speech).
        active.utterance = utterance;
        utterance.lang = voice?.lang || language;
        utterance.rate = rate;
        if (voice) utterance.voice = voice;
        utterance.onstart = () => {
          if (generation !== token || active.utterance !== utterance) return;
          clearTimeout(startTimer);
          onState({ messageId, status: active.paused ? 'paused' : 'speaking' });
        };
        utterance.onend = () => {
          if (generation !== token || active.utterance !== utterance) return;
          clearTimeout(startTimer);
          next();
        };
        utterance.onerror = event => {
          if (generation !== token || active.utterance !== utterance) return;
          const errors = {
            'not-allowed': 'Your browser blocked read aloud. Click Read aloud again, or check your browser’s audio settings.',
            'voice-unavailable': 'This voice is unavailable. Choose Automatic in Voice settings and try again.',
            'language-unavailable': 'No voice is available for this language. Choose another voice in Voice settings.',
            network: 'The speech service could not connect. Check your connection or select an installed voice.'
          };
          fail(errors[event.error] || 'Read aloud was interrupted or could not play. You can try again or read the text.');
        };
        onState({ messageId, status: active.paused ? 'paused' : 'starting' });
        clearTimeout(startTimer);
        startTimer = setTimeout(() => {
          if (generation === token && !active.paused) fail('The browser did not start playback. Try another installed voice or browser.');
        }, 15000);
        try {
          synthesis.speak(utterance);
          if (active.paused) synthesis.pause();
        } catch { fail('Could not start read aloud. Please try another voice or browser.'); }
      }
      next();
    },
    pause() {
      if (!current || current.paused) return;
      current.paused = true;
      clearTimeout(startTimer);
      try { synthesis.pause(); onState({ messageId: current.messageId, status: 'paused' }); }
      catch { fail('Could not pause playback. Please start read aloud again.'); }
    },
    resume() {
      if (!current?.paused) return;
      current.paused = false;
      try { synthesis.resume(); onState({ messageId: current.messageId, status: 'speaking' }); }
      catch { fail('Could not resume playback. Please start read aloud again.'); }
    },
    stop
  };
}
