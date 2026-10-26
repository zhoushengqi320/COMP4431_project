// Browser speech input is independent of the AI backend.
export function speechSupport(browser = globalThis) {
  return browser.SpeechRecognition || browser.webkitSpeechRecognition || null;
}

export function createVoiceSession({ Recognition, language = 'en-US', onState, onPreview, onComplete, onError }) {
  const recognition = new Recognition();
  recognition.lang = language;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let closed = false;
  let failed = false;
  let stopped = false;
  let finalText = '';
  const errors = {
    'not-allowed': 'Microphone access was denied. Allow it in your browser’s site settings, then try again.',
    'service-not-allowed': 'Your browser’s speech service is unavailable. Try a compatible browser on localhost or HTTPS.',
    'audio-capture': 'No microphone is available. Check your microphone connection and system permissions.',
    'no-speech': 'No speech was detected. Try again and speak clearly near your microphone.',
    network: 'The speech service could not connect. Check your internet connection and try again.',
    'language-not-supported': 'This speech service does not support the selected language. Try another language.'
  };
  function fail(message) { failed = true; onError(message); }
  recognition.onstart = () => { if (!closed) onState(stopped ? 'stopping' : 'listening'); };
  recognition.onresult = event => {
    if (closed || failed) return;
    // Results are a cumulative list. Rebuild it so interim revisions never duplicate words.
    const final = [], interim = [];
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      (result.isFinal ? final : interim).push(result[0].transcript.trim());
    }
    finalText = final.join(' ');
    onPreview([...final, ...interim].join(' '));
  };
  recognition.onerror = event => {
    if (closed) return;
    fail(errors[event.error] || (event.error === 'aborted' ? 'Voice input was interrupted. Please try again.' : 'Speech recognition failed. Please try again or type your question.'));
    // Some implementations delay or omit onend after errors. Release the UI immediately.
    closed = true;
    recognition.abort();
    onPreview('');
    onState('idle');
  };
  recognition.onend = () => {
    if (closed) return;
    closed = true;
    onPreview('');
    onState('idle');
    if (!failed && finalText) onComplete(finalText);
    else if (!failed) onError('No final transcript was returned. Try again or type your question.');
  };
  return {
    start() {
      if (closed) return;
      onState('starting');
      try { recognition.start(); }
      catch { closed = true; onState('idle'); onError('Could not start voice input. Check browser support and microphone permissions.'); }
    },
    stop() {
      if (closed || stopped) return;
      stopped = true;
      onState('stopping');
      try { recognition.stop(); }
      catch { this.cancel(); onError('Could not finish voice input. Please try again.'); }
    },
    cancel() {
      if (closed) return;
      closed = true;
      recognition.abort();
      onPreview('');
      onState('idle');
    }
  };
}
