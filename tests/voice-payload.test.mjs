import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoicePayload, voiceReply, VOICE_PROMPT } from '../server/voice-reply.mjs';

test('voice parsing accepts spoken text and unambiguous older answer wrappers', () => {
  const text = 'Start with COMP1011. It introduces programming.';
  for (const content of [
    text, `  ${text}\n`, JSON.stringify(text),
    ...['text', 'message', 'content', 'answer'].map(key => JSON.stringify({ [key]: text })),
    JSON.stringify([text]), JSON.stringify([{ text }]),
    `\`\`\`json\n${JSON.stringify({ text })}\n\`\`\``,
    JSON.stringify({ text, answer: text })
  ]) {
    assert.deepEqual(parseVoicePayload(content), { text });
  }
  assert.deepEqual(parseVoicePayload('这门课会介绍编程基础。'), { text: '这门课会介绍编程基础。' });
  assert.match(VOICE_PROMPT, /words to speak as plain text/);
});

test('voice parsing rejects empty, ambiguous, malformed and course-card payloads', () => {
  for (const content of [
    undefined, '', '  ', 'null', 'true', 'false', '42', '{}', '[]', '[null]', '[[]]', '""',
    '["First answer", "Different answer"]',
    '{"text":"First answer","answer":"Different answer"}',
    '{"text":null}', '{"text":{"text":"Nested answer"}}',
    '{"text":"Course details","courses":[{"code":"COMP1011"}]}',
    '[{"code":"COMP1011","title":"Programming"}]',
    '{"text":"unfinished"', '[{"text":"unfinished"}',
    '```json\n{"text":"unfinished"}\n',
    'Here is the answer:\n```json\n{"text":"Hello"}\n```',
    '```json\nPlain words\n```',
    JSON.stringify('{"text":"Nested JSON text"}')
  ]) {
    assert.throws(() => parseVoicePayload(content), error => error.status === 502, String(content));
  }
});

test('spoken text still passes through the existing short-answer limit', () => {
  assert.deepEqual(voiceReply(parseVoicePayload('Hello! How can I help?')), { text: 'Hello! How can I help?' });
  assert.throws(() => voiceReply(parseVoicePayload(JSON.stringify('long answer '.repeat(101)))), error => error.status === 502);
});
