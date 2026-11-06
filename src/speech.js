// Read-aloud uses the browser's speech service. No Qwen key or audio backend is needed.
export function narrationFor(message) {
  const parts = [message.text];
  for (const course of message.courses || []) {
    if (course.format === 'course-introduction-v1') {
      const zh = course.language === 'zh';
      parts.push(`${course.code}. ${course.title}. ${course.credits ?? ''} credits.`,
        `${zh ? '目标' : 'Objectives'}: ${course.objectives}`,
        `${zh ? '评价' : 'Rating'}: ${Number(course.rating).toFixed(1)}/5. ${course.ratingSource === 'simulated' ? (zh ? '模拟评分，非真实学生评价' : 'Simulated, not student reviews') : ''}`,
        course.summary, `${zh ? '必要先修' : 'Required prerequisites'}: ${course.requiredPrerequisites}`,
        `${zh ? '建议先修' : 'Recommended prerequisites'}: ${course.recommendedPrerequisites}`);
      continue;
    }
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
    const previous = current; current = null;
    previous?.onCancel?.();
    // Invalidate before cancel: browsers may immediately dispatch an interrupted error.
    synthesis?.cancel();
    idle();
  }
  function fail(message) { const failure = current?.onFailure; if (current) current.onCancel = null; stop(); failure?.(new Error(message)); onError(message); }
  return {
    speak({ messageId, text, language = 'en-US', rate = 1, voiceURI = '', matchLanguage = false, onComplete, onCancel, onFailure }) {
      stop();
      if (!synthesis || !Utterance) { onFailure?.(new Error('Read aloud is unavailable.')); onError('Read aloud is not supported in this browser. Please read the text or try another browser.'); return; }
      const chunks = speechChunks(text);
      if (!chunks.length) { onComplete?.(); return; }
      const token = generation;
      const voices = synthesis.getVoices();
      const matchesLanguage = item => item.lang.split('-')[0].toLowerCase() === language.split('-')[0].toLowerCase();
      const voice = voices.find(item => item.voiceURI === voiceURI && (!matchLanguage || matchesLanguage(item)))
        || voices.find(item => item.lang.toLowerCase() === language.toLowerCase())
        || voices.find(item => item.default && matchesLanguage(item))
        || voices.find(matchesLanguage);
      const active = { messageId, paused: false, started: false, index: 0, utterance: null, onCancel, onFailure };
      current = active;
      active.watchStart = () => {
        clearTimeout(startTimer);
        startTimer = setTimeout(() => {
          if (generation === token && !active.paused && !active.started) fail('The browser did not start playback. Try another installed voice or browser.');
        }, 15000);
      };
      function next() {
        if (generation !== token) return;
        if (active.index === chunks.length) { current = null; generation += 1; idle(); onComplete?.(); return; }
        const utterance = new Utterance(chunks[active.index++]);
        // Retain the utterance until completion (some engines otherwise drop long speech).
        active.utterance = utterance;
        active.started = false;
        utterance.lang = voice?.lang || language;
        utterance.rate = rate;
        if (voice) utterance.voice = voice;
        utterance.onstart = () => {
          if (generation !== token || active.utterance !== utterance) return;
          active.started = true;
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
        active.watchStart();
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
      if (!current.started) current.watchStart();
      try { synthesis.resume(); onState({ messageId: current.messageId, status: 'speaking' }); }
      catch { fail('Could not resume playback. Please start read aloud again.'); }
    },
    stop
  };
}
