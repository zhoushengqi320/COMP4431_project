const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

export function speechSupport(browser = globalThis) {
  return Boolean(browser.MediaRecorder && browser.navigator?.mediaDevices?.getUserMedia);
}

export function pickRecorderMime(Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) return '';
  return MIME_CANDIDATES.find(type => Recorder.isTypeSupported(type)) || '';
}

function permissionMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was denied. Allow it in your browser’s site settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone is available. Check your microphone connection and system permissions.';
  }
  return error?.message || 'Could not start voice input. Check microphone permissions and try again.';
}

export function createVoiceSession({
  language = 'zh-CN',
  transcribe,
  getUserMedia,
  MediaRecorder: Recorder,
  onState,
  onPreview,
  onComplete,
  onError
}) {
  const requestMic = getUserMedia || (constraints => globalThis.navigator.mediaDevices.getUserMedia(constraints));
  const RecorderClass = Recorder || globalThis.MediaRecorder;
  let closed = false;
  let stopping = false;
  let stream;
  let recorder;
  let chunks = [];
  let abort;

  function finishIdle() {
    closed = true;
    abort?.abort();
    recorder = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    onPreview('');
    onState('idle');
  }

  return {
    start() {
      if (closed) return;
      onState('starting');
      onPreview('');
      requestMic({ audio: true }).then(media => {
        if (closed) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        stream = media;
        chunks = [];
        const mimeType = pickRecorderMime(RecorderClass);
        recorder = mimeType ? new RecorderClass(stream, { mimeType }) : new RecorderClass(stream);
        recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
        recorder.onerror = () => {
          if (closed) return;
          onError('Voice recording failed. Please try again or type your question.');
          finishIdle();
        };
        recorder.onstop = async () => {
          stream?.getTracks().forEach(track => track.stop());
          stream = null;
          if (closed || !stopping) return;
          const type = recorder?.mimeType || chunks[0]?.type || 'audio/webm';
          const blob = new Blob(chunks, { type });
          if (blob.size < 256) {
            onError('No speech was detected. Try again and speak clearly near your microphone.');
            finishIdle();
            return;
          }
          abort = new AbortController();
          onPreview('Transcribing with Qwen…');
          try {
            const text = await transcribe({
              audio: new File([blob], type.includes('mp4') ? 'clip.m4a' : 'clip.webm', { type }),
              language,
              signal: abort.signal
            });
            if (closed) return;
            finishIdle();
            if (text) onComplete(text);
            else onError('No final transcript was returned. Try again or type your question.');
          } catch (error) {
            if (closed || error?.name === 'AbortError') { if (!closed) finishIdle(); return; }
            onError(error.message || 'Qwen could not transcribe this recording. Please try again.');
            finishIdle();
          }
        };
        recorder.start(200);
        onState('listening');
      }).catch(error => {
        if (closed) return;
        onError(permissionMessage(error));
        finishIdle();
      });
    },
    stop() {
      if (closed || stopping) return;
      stopping = true;
      onState('stopping');
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        else finishIdle();
      } catch {
        onError('Could not finish voice input. Please try again.');
        finishIdle();
      }
    },
    cancel() {
      if (closed) return;
      stopping = false;
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      finishIdle();
    }
  };
}
