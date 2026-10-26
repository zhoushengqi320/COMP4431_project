import { formatCatalogue, getCourses, retrieveCourses } from './course-knowledge.mjs';

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'json']);
const FILE_CHAR_LIMIT = 6000;
const HISTORY_LIMIT = 12;

const SYSTEM_PROMPT = `You are PolyPath, an academic planning advisor for students at The Hong Kong Polytechnic University (PolyU).
You are grounded in a retrieved subset of the team's PolyU course catalogue (Supabase table public.courses). This is retrieval-augmented generation, not a trained fine-tune.
Reply in the same language as the student's latest question.
Return a single JSON object only (no markdown fences) with this shape:
{
  "text": "Required nonempty explanation. Be specific, cautious, and useful.",
  "courses": [{"code":"","title":"","credits":3,"tag":"","reason":"","prerequisite":""}],
  "semesters": [{"title":"","credits":0,"courses":["CODE · Title"]}],
  "checks": ["Short planning checks. Mark unverified items clearly."],
  "sources": [{"title":"","detail":"","url":""}],
  "followUps": ["Short follow-up the student could ask next"]
}
Rules:
- text is required. Omit empty arrays rather than inventing placeholders.
- Recommend only courses that appear in the attached catalogue excerpts. Copy codes, titles, credits and prerequisites from those excerpts.
- Never invent course codes (including DEMO codes) or unofficial titles.
- If the excerpts do not contain a suitable course, say so in text and checks.
- Do not claim official eligibility verification unless the student's documents support it.
- Put matching catalogue course codes in sources, with title "PolyU course catalogue".
- urls must be real http(s) links or omitted.`;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function extensionOf(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

function clip(text, limit = FILE_CHAR_LIMIT) {
  const value = String(text || '').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n[truncated]`;
}

async function describeFiles(formData, field) {
  const items = [];
  for (const entry of formData.getAll(field)) {
    if (typeof entry === 'string' || !entry) continue;
    const name = entry.name || 'file';
    if (TEXT_EXTENSIONS.has(extensionOf(name))) {
      items.push({ name, text: clip(await entry.text()) });
    } else {
      items.push({
        name,
        text: `[Binary file not parsed in this demo. Filename and size only: ${name}, ${entry.size || 0} bytes.]`
      });
    }
  }
  return items;
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function historyMessages(history) {
  return history
    .filter(item => item && (item.role === 'user' || item.role === 'assistant') && item.text)
    .slice(-HISTORY_LIMIT)
    .map(item => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: clip(item.text, 2000)
    }));
}

function parseAdvisorPayload(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const data = JSON.parse(candidate);
    if (typeof data.text === 'string' && data.text.trim()) return data;
    if (data && typeof data === 'object') {
      const text = data.message || data.content || data.answer;
      if (typeof text === 'string' && text.trim()) return { ...data, text };
    }
  } catch {
    // Fall through to plain text.
  }
  if (!trimmed) throw new Error('The advisor returned an empty response. Please try again.');
  return { text: trimmed };
}

function buildUserContent({ message, profile, documents, attachments, catalogue }) {
  const parts = [`Student question:\n${message}`];
  parts.push(`Student profile:\n${JSON.stringify(profile || {}, null, 2)}`);
  parts.push(`PolyU course catalogue excerpts (answer using only these records):\n${catalogue}`);
  if (documents.length) {
    parts.push('Reference documents:\n' + documents.map(file => `### ${file.name}\n${file.text}`).join('\n\n'));
  } else {
    parts.push('Reference documents: none uploaded.');
  }
  if (attachments.length) {
    parts.push('Message attachments:\n' + attachments.map(file => `### ${file.name}\n${file.text}`).join('\n\n'));
  }
  return parts.join('\n\n');
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function handleAdvisorRequest(req, res, env) {
  try {
    const apiKey = env.QWEN_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) {
      json(res, 503, { error: 'Missing QWEN_API_KEY in .env. Copy .env.example to .env and add your key.' });
      return;
    }

    const body = await readRequestBody(req);
    const request = new Request('http://127.0.0.1/api/advisor', {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] || 'application/json' },
      body
    });

    let message = '';
    let history = [];
    let profile = {};
    let documents = [];
    let attachments = [];
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      message = String(formData.get('message') || '').trim();
      history = parseJsonField(formData.get('history'), []);
      profile = parseJsonField(formData.get('profile'), {});
      documents = await describeFiles(formData, 'documents');
      attachments = await describeFiles(formData, 'attachments');
    } else {
      const data = JSON.parse(body.toString('utf8') || '{}');
      message = String(data.message || '').trim();
      history = Array.isArray(data.history) ? data.history : [];
      profile = data.profile || {};
    }

    if (!message) {
      json(res, 400, { error: 'A question is required.' });
      return;
    }

    const baseUrl = (env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
    const model = env.QWEN_MODEL?.trim() || 'qwen-plus';
    const catalogueRows = retrieveCourses(await getCourses(env), { message, profile });
    const catalogue = formatCatalogue(catalogueRows);
    const payload = {
      model,
      stream: false,
      enable_thinking: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages(history),
        { role: 'user', content: buildUserContent({ message, profile, documents, attachments, catalogue }) }
      ]
    };

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      let detail = raw.slice(0, 300);
      try { detail = JSON.parse(raw).error?.message || detail; } catch { /* keep text */ }
      json(res, 502, { error: `Qwen request failed (${upstream.status}): ${detail}` });
      return;
    }

    const completion = JSON.parse(raw);
    const content = completion.choices?.[0]?.message?.content;
    json(res, 200, parseAdvisorPayload(content));
  } catch (error) {
    json(res, 500, { error: error.message || 'The advisor could not respond. Please try again.' });
  }
}

const ASR_LANGUAGE = { 'zh-CN': 'zh', 'zh-HK': 'yue', 'en-US': 'en' };

function transcriptText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => typeof part === 'string' ? part : part?.text || '').join('').trim();
  }
  return '';
}

export async function handleTranscribeRequest(req, res, env) {
  try {
    const apiKey = env.QWEN_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) {
      json(res, 503, { error: 'Missing QWEN_API_KEY in .env. Copy .env.example to .env and add your key.' });
      return;
    }

    const body = await readRequestBody(req);
    const request = new Request('http://127.0.0.1/api/transcribe', {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] || 'application/json' },
      body
    });
    const formData = await request.formData();
    const audio = formData.get('audio');
    const language = String(formData.get('language') || 'zh-CN');
    if (!audio || typeof audio === 'string') {
      json(res, 400, { error: 'An audio recording is required.' });
      return;
    }

    const bytes = Buffer.from(await audio.arrayBuffer());
    if (bytes.length < 256) {
      json(res, 400, { error: 'No speech was detected. Try again and speak clearly near your microphone.' });
      return;
    }
    if (bytes.length > 7 * 1024 * 1024) {
      json(res, 400, { error: 'Recording is too long. Please try a shorter clip.' });
      return;
    }

    const mime = audio.type || 'audio/webm';
    const asrLanguage = ASR_LANGUAGE[language];
    const baseUrl = (env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
    const model = env.QWEN_ASR_MODEL?.trim() || 'qwen3-asr-flash';
    const payload = {
      model,
      stream: false,
      asr_options: { enable_itn: true, ...(asrLanguage ? { language: asrLanguage } : {}) },
      messages: [{
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: `data:${mime};base64,${bytes.toString('base64')}` } }]
      }]
    };

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      let detail = raw.slice(0, 300);
      try { detail = JSON.parse(raw).error?.message || detail; } catch { /* keep text */ }
      json(res, 502, { error: `Qwen speech recognition failed (${upstream.status}): ${detail}` });
      return;
    }

    const completion = JSON.parse(raw);
    const text = transcriptText(completion.choices?.[0]?.message?.content);
    if (!text) {
      json(res, 502, { error: 'Qwen returned an empty transcript. Please try again.' });
      return;
    }
    json(res, 200, { text });
  } catch (error) {
    json(res, 500, { error: error.message || 'Qwen could not transcribe this recording. Please try again.' });
  }
}
