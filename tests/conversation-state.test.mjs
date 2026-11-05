import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MESSAGES, acknowledgeConversation, appendConversationMessage, blankConversation, conversationStorageKey, conversationTitle, createConversationSaveQueue, makeSnapshot, mergeConversationHistory, readSnapshot, sameConversationContent, storedMessage, textChatMessages } from '../src/conversations.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const T0 = '2026-11-03T10:00:00.000Z';
const T1 = '2026-11-03T10:01:00.000Z';
const message = (id, text = `Message ${id}`, role = 'user') => ({ id, role, text });
const thread = (id = ID_A, messages = [message('u1')], revision = 0) => ({ id, title: conversationTitle(messages), messages, updatedAt: T0, revision });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('late assistant result is appended to its original chat after selection changes', () => {
  const first = thread();
  const second = blankConversation(ID_B, T1);
  const response = appendConversationMessage([second, first], ID_A, message('a1', 'Answer to the first chat', 'assistant'), T1);
  assert.equal(response.threads.find(item => item.id === ID_A).messages.length, 2);
  assert.equal(response.threads.find(item => item.id === ID_B).messages.length, 0);
  assert.equal(first.messages.length, 1, 'previous state must be immutable');
});

test('creating a blank record does not erase existing history and title follows the first question', () => {
  const blank = blankConversation(ID_B, T0);
  const result = appendConversationMessage([thread(), blank], ID_B, message('u2', '  Compare\n COMP4431 and COMP4432  '), T1);
  assert.equal(result.thread.title, 'Compare COMP4431 and COMP4432');
  assert.equal(result.threads.find(item => item.id === ID_A).messages.length, 1);
  assert.equal(conversationTitle([message('long', 'a'.repeat(100))]).length, 60);
});

test('repeated response ids are idempotent and message limit never drops history', () => {
  const full = thread(ID_A, Array.from({ length: MAX_MESSAGES }, (_, i) => message(`m${i}`)));
  const duplicate = appendConversationMessage([full], ID_A, message('m0'), T1);
  assert.equal(duplicate.duplicate, true);
  const overLimit = appendConversationMessage([full], ID_A, message('overflow'), T1);
  assert.equal(overLimit.changed, false);
  assert.match(overLimit.error, /100 messages/);
  assert.equal(overLimit.threads[0].messages[0].id, 'm0');
});

test('stored messages preserve visible structured answers and remove raw files or evidence', () => {
  const result = storedMessage({ ...message('a1', 'Answer', 'assistant'), courses: [{ code: 'COMP4431', title: 'AI', credits: 3, prerequisite: 'COMP2011' }], checks: ['Check your cohort'], sources: [{ id: 'course-comp4431', title: 'Official description', url: 'https://www.polyu.edu.hk/example.pdf' }], followUps: ['What next?'], warnings: ['Older source'], attachments: [{ name: 'notes.txt', size: 123, file: { secret: 'raw bytes' } }], evidence: [{ text: 'large private raw document' }], feedback: 'liked' });
  assert.equal(result.courses[0].code, 'COMP4431');
  assert.equal(result.sources[0].url, 'https://www.polyu.edu.hk/example.pdf');
  assert.deepEqual(result.attachments, [{ name: 'notes.txt', size: 123 }]);
  assert.deepEqual(result.warnings, ['Older source']);
  assert.equal(result.evidence, undefined);
  assert.equal(result.feedback, undefined);
});

test('stored messages keep yucan course-introduction cards, overview and more-course prompts', () => {
  const result = storedMessage({
    ...message('a2', '本次推荐ABCT1700。', 'assistant'),
    overview: '本次推荐2门课程。',
    followUps: ['ABCT1700主要讲什么？'],
    moreCourses: { available: true, prompt: '请继续推荐更多相关课程，避开之前介绍过的课程。' },
    recommendationContext: { query: '推荐化学课', seenCodes: ['ABCT1700'], reserveCodes: ['ABCT1741'] },
    courses: [{
      format: 'course-introduction-v1', language: 'zh', code: 'ABCT1700', title: 'Introduction to Chemistry',
      department: 'ABCT', level: '1', credits: 3, objectives: '化学入门。', summary: '介绍化学基本原理。',
      rating: 4.6, ratingSource: 'simulated', learningOutcomes: ['解释化学基本原理。'],
      requiredPrerequisites: '无（课程库明确注明）', recommendedPrerequisites: '资料未提供，需核实',
      prerequisiteLevels: [{ level: 1, courses: ['ABCT1D14'] }],
      preparation: { description: '无', note: '以上课程可作为提前学习的参考。', levels: [{ level: 1, courses: ['ABCT1D14'] }] }
    }]
  });
  assert.equal(result.courses[0].format, 'course-introduction-v1');
  assert.equal(result.courses[0].objectives, '化学入门。');
  assert.deepEqual(result.courses[0].learningOutcomes, ['解释化学基本原理。']);
  assert.equal(result.overview, '本次推荐2门课程。');
  assert.equal(result.moreCourses.available, true);
  assert.deepEqual(result.recommendationContext.seenCodes, ['ABCT1700']);
});

test('guest/account snapshots have distinct storage keys and reject a mismatched owner', () => {
  assert.notEqual(conversationStorageKey(null), conversationStorageKey('alice'));
  assert.notEqual(conversationStorageKey('alice'), conversationStorageKey('bob'));
  const snapshot = makeSnapshot('alice', [thread()], [ID_A], ID_A);
  assert.throws(() => readSnapshot(JSON.stringify(snapshot), 'bob'), /this account/);
  assert.throws(() => readSnapshot('{broken', null));
  assert.equal(readSnapshot(JSON.stringify(snapshot), 'alice').threads[0].id, ID_A);
});

test('guest chats survive a snapshot round trip but account storage retains only unsaved drafts', () => {
  const saved = thread(ID_A, [message('u1')], 2);
  const unsaved = thread(ID_B, [message('u2')]);
  const guest = readSnapshot(JSON.stringify(makeSnapshot(null, [saved, unsaved], [], ID_B)), null);
  assert.equal(guest.threads.length, 2);
  assert.equal(guest.activeId, ID_B);
  const account = makeSnapshot('alice', [saved, unsaved], [ID_B], ID_A);
  assert.deepEqual(account.threads.map(item => item.id), [ID_B]);
  assert.equal(account.activeId, ID_A, 'active saved id is restored from remote history');
});

test('save acknowledgements cannot replace messages added while the request was running', () => {
  const submitted = thread();
  const current = appendConversationMessage([submitted], ID_A, message('a1', 'Later response', 'assistant'), T1).threads;
  const result = acknowledgeConversation(current, ID_A, submitted, { ...submitted, revision: 1, updatedAt: T0 });
  assert.equal(result[0].messages.length, 2);
  assert.equal(result[0].revision, 1);
  assert.equal(result[0].updatedAt, T1);
});

test('reload recognises a completed server save whose acknowledgement was lost', () => {
  const local = thread();
  const remote = { ...local, revision: 1, updatedAt: T1, messages: [{ text: local.messages[0].text, role: 'user', id: 'u1' }] };
  assert.ok(sameConversationContent(local, remote), 'object key order is not a content difference');
  const result = mergeConversationHistory([remote], makeSnapshot('alice', [local], [ID_A], ID_A));
  assert.equal(result.threads[0].revision, 1);
  assert.deepEqual(result.dirtyIds, []);
  assert.deepEqual(result.conflictIds, []);
});

test('different remote revision preserves the local draft as a conflict instead of overwriting', () => {
  const local = thread(ID_A, [message('local', 'Unsaved local changes')], 2);
  const remote = thread(ID_A, [message('remote', 'Changes from another tab')], 3);
  const result = mergeConversationHistory([remote], makeSnapshot('alice', [local], [ID_A], ID_A));
  assert.equal(result.threads[0].messages[0].id, 'local');
  assert.deepEqual(result.conflictIds, [ID_A]);
  assert.deepEqual(result.dirtyIds, [ID_A]);
});

test('unchanged remote revision resumes an unsaved draft and clean chats come from server', () => {
  const server = thread(ID_A, [message('remote')], 2);
  const local = thread(ID_A, [message('remote'), message('local')], 2);
  const other = thread(ID_B, [message('other')], 1);
  const result = mergeConversationHistory([server, other], makeSnapshot('alice', [local], [ID_A], ID_A));
  assert.equal(result.threads.length, 2);
  assert.deepEqual(result.conflictIds, []);
  assert.deepEqual(result.dirtyIds, [ID_A]);
});

test('full remote history preserves an unsaved local draft without exceeding the visible limit', () => {
  const remote = Array.from({ length: 50 }, (_, index) => thread(`aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, [message(`r${index}`)], 1));
  const local = thread(ID_A, [message('local-only')]);
  const result = mergeConversationHistory(remote, makeSnapshot('alice', [local], [ID_A], ID_A));
  assert.equal(result.threads.length, 50);
  assert.ok(result.threads.some(item => item.id === ID_A && item.messages[0].id === 'local-only'));
  assert.deepEqual(result.conflictIds, [ID_A]);
  assert.equal(remote.length, 50, 'all clean remote history remains untouched');
});

test('save queue serializes the same chat and advances revisions without losing a later answer', async () => {
  const firstSave = deferred();
  const calls = [];
  let simultaneous = 0;
  let maximum = 0;
  const queue = createConversationSaveQueue({ save: async (id, body) => {
    simultaneous++; maximum = Math.max(maximum, simultaneous); calls.push({ id, body });
    if (calls.length === 1) await firstSave.promise;
    simultaneous--;
    return { ...thread(id, body.messages), title: body.title, revision: body.revision + 1, updatedAt: T1 };
  } });
  queue.enqueue(thread());
  queue.enqueue(thread(ID_A, [message('u1'), message('a1', 'Answer', 'assistant')]));
  assert.equal(calls.length, 1);
  firstSave.resolve();
  assert.equal(await queue.flush(), true);
  assert.equal(maximum, 1);
  assert.deepEqual(calls.map(call => call.body.revision), [0, 1]);
  assert.equal(calls[1].body.messages.length, 2);
});

test('queue coalesces pending changes, while independent chats may save concurrently', async () => {
  const pending = deferred();
  const calls = [];
  const queue = createConversationSaveQueue({ save: async (id, body) => { calls.push({ id, body }); if (id === ID_A && body.revision === 0) await pending.promise; return { revision: body.revision + 1, updatedAt: T1 }; } });
  queue.enqueue(thread(ID_A));
  queue.enqueue(thread(ID_A, [message('u1'), message('a1')]));
  queue.enqueue(thread(ID_A, [message('u1'), message('a1'), message('u2')]));
  queue.enqueue(thread(ID_B));
  await tick();
  assert.equal(calls.length, 2);
  assert.ok(calls.some(call => call.id === ID_B));
  pending.resolve();
  await queue.flush();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].body.messages.length, 3);
});

test('transient failures retain the latest payload and retry at the same revision', async () => {
  const calls = [];
  const queue = createConversationSaveQueue({ save: async (id, body) => { calls.push(body); if (calls.length === 1) throw new Error('Offline'); return { revision: body.revision + 1, updatedAt: T1 }; } });
  queue.enqueue(thread());
  assert.equal(await queue.flush(), false);
  queue.enqueue(thread(ID_A, [message('u1'), message('a1')]));
  assert.equal(calls.length, 1, 'a failed queue does not silently retry on each append');
  queue.retry();
  assert.equal(await queue.flush(), true);
  assert.deepEqual(calls.map(call => call.revision), [0, 0]);
  assert.equal(calls[1].messages.length, 2);
});

test('409 conflicts cannot be retried into a blind overwrite', async () => {
  let calls = 0;
  let reportedConflict = false;
  const queue = createConversationSaveQueue({ save: async () => { calls++; throw Object.assign(new Error('Revision conflict'), { status: 409 }); }, onError: (id, error, conflict) => { reportedConflict = conflict; } });
  queue.enqueue(thread(ID_A, [message('u1')], 2));
  assert.equal(await queue.flush(), false);
  queue.retry();
  queue.enqueue(thread(ID_A, [message('u1'), message('a1')], 2));
  assert.equal(await queue.flush(), false);
  assert.equal(calls, 1);
  assert.equal(reportedConflict, true);
  assert.equal(queue.discard(ID_A), true);
});

test('disposal suppresses stale callbacks and never starts queued work for a departed account', async () => {
  const request = deferred();
  let calls = 0;
  let callbacks = 0;
  const queue = createConversationSaveQueue({ save: async () => { calls++; await request.promise; return { revision: 1, updatedAt: T1 }; }, onSaved: () => callbacks++, onError: () => callbacks++ });
  queue.enqueue(thread());
  queue.enqueue(thread(ID_A, [message('u1'), message('a1')]));
  queue.dispose();
  request.resolve();
  await tick();
  assert.equal(calls, 1);
  assert.equal(callbacks, 0);
  assert.equal(await queue.flush(), false);
});

test('empty conversations are never sent to the server', async () => {
  let calls = 0;
  const queue = createConversationSaveQueue({ save: async () => { calls++; return { revision: 1 }; } });
  queue.enqueue(blankConversation(ID_A, T0));
  assert.equal(await queue.flush(), true);
  assert.equal(calls, 0);
});


test('voice turns retain context after storage but never become text chat bubbles', () => {
  const spoken = [ { ...message('voice-user', 'Spoken question'), channel: 'voice' }, { ...message('voice-answer', 'Spoken answer', 'assistant'), channel: 'voice' } ];
  const typed = message('typed', 'Typed question');
  const saved = thread(ID_A, [...spoken, typed]);
  const restored = readSnapshot(JSON.stringify(makeSnapshot(null, [saved], [], ID_A)), null).threads[0];
  assert.deepEqual(restored.messages, [...spoken, typed]);
  assert.deepEqual(textChatMessages(restored.messages), [typed]);
  assert.equal(conversationTitle(spoken), 'Voice conversation');
  assert.deepEqual(textChatMessages(spoken), []);
  assert.deepEqual(textChatMessages([message('old')]), [message('old')], 'existing text chats stay visible');
});
