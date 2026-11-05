import { RequestError, upstreamRequest } from './request-safety.mjs';

export const SEARCH_PLAN_PROMPT = `You turn a PolyU student's question into a catalogue search plan. Do not answer the academic question.
Return a JSON object only (no markdown fences) with this shape:
{"keywords":["search terms in English and Chinese that appear in course titles or descriptions"],"courseCodes":["COMP4431"],"noPrerequisite":false,"department":""}
Rules:
- Put subject words in keywords. Include English equivalents for Chinese subjects, e.g. 化学 → chemistry, 历史 → history, 机器学习 → machine learning.
- Set noPrerequisite to true when the student wants courses with no prerequisite / 无先修 / 没有先修课要求.
- courseCodes only if the student named specific course codes.
- department is an optional short catalogue department code such as abct, comp, ama.
- If the student only asked for no-prerequisite courses and named no subject, use keywords [] and noPrerequisite true.`;

function parseJsonContent(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const data = JSON.parse(candidate);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function parseSearchPlan(content) {
  const data = parseJsonContent(content);
  if (!data || Array.isArray(data.courses) || typeof data.text === 'string' && !('keywords' in data) && !('noPrerequisite' in data)) return null;
  const keywords = Array.isArray(data.keywords) ? data.keywords.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).slice(0, 20) : [];
  const courseCodes = Array.isArray(data.courseCodes) ? data.courseCodes.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).slice(0, 12) : [];
  const noPrerequisite = data.noPrerequisite === true || data.no_prerequisite === true;
  const department = typeof data.department === 'string' ? data.department.trim().slice(0, 20) : '';
  if (!keywords.length && !courseCodes.length && !noPrerequisite && !department) return null;
  return { keywords, courseCodes, noPrerequisite, department };
}

export async function planCourseSearch({ message, profile = {}, env, apiKey, res }) {
  const baseUrl = (env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
  const model = env.QWEN_PLANNER_MODEL?.trim() || 'qwen-plus';
  const payload = {
    model,
    stream: false,
    max_tokens: 512,
    enable_thinking: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SEARCH_PLAN_PROMPT },
      { role: 'user', content: `Student question JSON:\n${JSON.stringify({ question: message, profile }, null, 2)}` }
    ]
  };
  const completion = await upstreamRequest(`${baseUrl}/chat/completions`, apiKey, payload, res, { timeoutMs: 20000 });
  const plan = parseSearchPlan(completion.choices?.[0]?.message?.content);
  if (!plan) throw new RequestError(502, 'Qwen did not return a usable search plan.');
  return plan;
}
