// Deliberately wait for sustained speech, then a pause; never submit an empty room.
export function createTurnDetector({ silenceMs = 1500, noSpeechMs = 15000, maxMs = 45000, threshold = .018 } = {}) {
  let started, lastVoice, voiceMs = 0, previous;
  return (rms, now) => {
    started ??= now; previous ??= now;
    const delta = Math.min(150, Math.max(0, now - previous)); previous = now;
    if (rms >= threshold) { voiceMs += delta; lastVoice = now; }
    if (voiceMs >= 250 && now - lastVoice >= silenceMs) return 'finish';
    if (now - started >= noSpeechMs && voiceMs < 250) return 'empty';
    if (now - started >= maxMs) return voiceMs >= 250 ? 'finish' : 'empty';
    return null;
  };
}

export function monitorSilence(stream, { onFinish, onEmpty, onUnavailable }) {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  let context, interval, disposed = false;
  const dispose = () => { disposed = true; clearInterval(interval); context?.close().catch(() => {}); };
  try {
    if (!Audio) throw new Error('Audio monitoring unavailable');
    context = new Audio();
    const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
    analyser.fftSize = 1024; source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize), detect = createTurnDetector();
    context.resume().then(() => {
      if (disposed) return;
      if (context.state !== 'running') throw new Error('Audio monitoring unavailable');
      interval = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        const result = detect(rms, performance.now());
        if (result) { dispose(); result === 'finish' ? onFinish() : onEmpty(); }
      }, 100);
    }).catch(() => { if (!disposed) { dispose(); onUnavailable?.(); } });
  } catch { dispose(); onUnavailable?.(); }
  return dispose;
}
