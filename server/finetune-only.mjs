import { appendFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { RequestError, upstreamRequest } from './request-safety.mjs';

// Deliberately excludes system prompts, retrieval, history, JSON constraints and normalization.
export async function observeFinetunedModel(message, env, res) {
  const model = env.QWEN_MODEL?.trim();
  if (!model) throw new RequestError(503, 'Set QWEN_MODEL explicitly before using finetune-only mode.');
  const baseUrl = (env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
  const payload = { model, stream: false, max_tokens: 8192, enable_thinking: false,
    messages: [{ role: 'user', content: message }] };
  const record = { recordedAt: new Date().toISOString(), mode: 'finetune-only', requestedModel: model,
    systemPromptApplied: false, retrievalApplied: false, historyApplied: false,
    jsonConstraintApplied: false, normalizationApplied: false, message };
  const started = performance.now();
  let completion;
  let failure;
  try {
    completion = await upstreamRequest(`${baseUrl}/chat/completions`, env.QWEN_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim(), payload, res);
    const content = completion.choices?.[0]?.message?.content;
    Object.assign(record, { returnedModel: completion.model, requestId: completion.id,
      usage: completion.usage, finishReason: completion.choices?.[0]?.finish_reason, content });
    if (typeof content !== 'string' || !content.trim()) throw new RequestError(502, 'The model returned an empty raw response.');
  } catch (error) {
    failure = error;
    record.error = error instanceof RequestError ? error.message : 'Could not observe the model response.';
  }
  record.latencyMs = Math.round(performance.now() - started);
  let observationSaved = true;
  try {
    const directory = resolve(env.QWEN_OBSERVATIONS_DIR || 'finetuning/observations');
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, 'finetune-only.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    observationSaved = false;
  }
  if (failure) throw failure;
  return { text: record.content, rawMode: true, model, latencyMs: record.latencyMs,
    usage: record.usage, finishReason: record.finishReason, observationSaved };
}
