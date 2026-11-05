export const API_URL = import.meta.env.VITE_ADVISOR_API_URL?.trim() || '/api/advisor';

export async function requestAdvice({ userId, message, history, profile, documents, attachments, signal }) {
  const body = new FormData();
  body.append('message', message);
  body.append('history', JSON.stringify(history));
  body.append('profile', JSON.stringify(profile));
  documents.forEach(doc => { if (doc.file) body.append('documents', doc.file); });
  attachments.forEach(doc => body.append('attachments', doc.file));
  const endpoint = userId ? API_URL : '/api/advisor';
  const response = await fetch(endpoint, { method: 'POST', body, signal, credentials: 'same-origin', headers: userId ? { 'X-PolyPath-User': userId } : { 'X-PolyPath-Access': 'guest' } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && endpoint.startsWith('/')) window.dispatchEvent(new Event('polypath:unauthorized'));
  if (!response.ok) throw new Error(data.error || `The advisor could not respond (${response.status}). Please try again.`);
  if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('The advisor returned an empty response. Please try again.');
  return data;
}

export async function requestTranscript({ audio, language, signal }) {
  const body = new FormData();
  body.append('audio', audio);
  body.append('language', language || 'zh-CN');
  const response = await fetch('/api/transcribe', { method: 'POST', body, signal, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && response.url.startsWith('/')) window.dispatchEvent(new Event('polypath:unauthorized'));
  if (!response.ok) throw new Error(data.error || 'Qwen could not transcribe this recording. Please try again.');
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw new Error('No final transcript was returned. Try again or type your question.');
  return text;
}

export async function requestTranscript({ audio, language, signal }) {
  if (!API_URL) throw new Error('Voice input needs a connected Qwen advisor. Add QWEN_API_KEY and restart.');
  const body = new FormData();
  body.append('audio', audio);
  body.append('language', language || 'zh-CN');
  const response = await fetch('/api/transcribe', { method: 'POST', body, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Qwen could not transcribe this recording. Please try again.');
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw new Error('No final transcript was returned. Try again or type your question.');
  return text;
}
