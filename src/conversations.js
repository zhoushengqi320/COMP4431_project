export const MAX_CONVERSATIONS = 50;
export const MAX_MESSAGES = 100;
export const SNAPSHOT_VERSION = 1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const textArray = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : undefined;

function pick(source, fields) {
  if (!record(source)) return null;
  return Object.fromEntries(fields.filter(field => typeof source[field] === 'string' || (typeof source[field] === 'number' && Number.isFinite(source[field]))).map(field => [field, source[field]]));
}

/** Only renderable data is stored; File objects, raw evidence and UI state stay transient. */
export function storedMessage(message) {
  if (!record(message) || !['user', 'assistant'].includes(message.role) || typeof message.id !== 'string' || !message.id || typeof message.text !== 'string') return null;
  const result = { id: message.id, role: message.role, text: message.text };
  for (const field of ['mode', 'language', 'providerWarning']) if (typeof message[field] === 'string') result[field] = message[field];
  for (const field of ['checks', 'followUps', 'warnings', 'documentWarnings']) {
    const values = textArray(message[field]);
    if (values?.length) result[field] = values;
  }
  const arrays = {
    attachments: ['name', 'size'],
    courses: ['code', 'title', 'credits', 'tag', 'reason', 'prerequisite'],
    sources: ['id', 'title', 'detail', 'url', 'kind'],
  };
  for (const [field, keys] of Object.entries(arrays)) {
    if (Array.isArray(message[field])) {
      const values = message[field].map(item => pick(item, keys)).filter(item => item && Object.keys(item).length);
      if (values.length) result[field] = values;
    }
  }
  if (Array.isArray(message.semesters)) {
    const values = message.semesters.filter(record).map(item => ({ ...pick(item, ['title', 'credits']), courses: textArray(item.courses) || [] }));
    if (values.length) result.semesters = values;
  }
  return result;
}

export function conversationTitle(messages) {
  const first = messages.find(message => message.role === 'user' && message.text.trim());
  if (!first) return 'New chat';
  const characters = Array.from(first.text.replace(/\s+/g, ' ').trim());
  return characters.length > 60 ? `${characters.slice(0, 59).join('')}…` : characters.join('');
}

export function blankConversation(id, updatedAt) {
  return { id, title: 'New chat', messages: [], updatedAt, revision: 0 };
}

export function normalizeConversation(value) {
  if (!record(value) || typeof value.id !== 'string' || !UUID.test(value.id) || !Array.isArray(value.messages) || value.messages.length > MAX_MESSAGES) return null;
  const messages = value.messages.map(storedMessage);
  if (messages.some(message => !message) || new Set(messages.map(message => message.id)).size !== messages.length) return null;
  return {
    id: value.id,
    title: typeof value.title === 'string' && value.title.trim() ? value.title.slice(0, 120) : conversationTitle(messages),
    messages,
    updatedAt: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : '1970-01-01T00:00:00.000Z',
    revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
  };
}

export function sortConversations(threads) {
  return [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
}

export function sameConversationContent(left, right) {
  const stable = value => Array.isArray(value) ? value.map(stable) : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return Boolean(left && right && left.title === right.title && JSON.stringify(stable(left.messages)) === JSON.stringify(stable(right.messages)));
}

/** Append to an explicit id, never whichever chat happens to be active later. */
export function appendConversationMessage(threads, id, message, updatedAt) {
  const previous = threads.find(thread => thread.id === id);
  if (!previous) return { threads, changed: false, error: 'This chat is no longer available.' };
  const stored = storedMessage(message);
  if (!stored) return { threads, changed: false, error: 'This message could not be saved.' };
  if (previous.messages.some(item => item.id === stored.id)) return { threads, thread: previous, changed: false, duplicate: true };
  if (previous.messages.length >= MAX_MESSAGES) return { threads, changed: false, error: 'This chat has reached 100 messages. Start a new chat to continue.' };
  const messages = [...previous.messages, stored];
  const thread = { ...previous, messages, title: previous.messages.some(item => item.role === 'user') ? previous.title : conversationTitle(messages), updatedAt };
  return { threads: sortConversations(threads.map(item => item.id === id ? thread : item)), thread, changed: true };
}

/** A save acknowledgement updates the revision but cannot replace newer local messages. */
export function acknowledgeConversation(threads, id, submitted, saved) {
  return sortConversations(threads.map(thread => thread.id !== id ? thread : {
    ...thread,
    revision: saved.revision,
    ...(sameConversationContent(thread, submitted) ? { updatedAt: saved.updatedAt } : {}),
  }));
}

export function conversationStorageKey(owner = null) {
  return `polypath-conversations-v1:${owner === null ? 'guest' : `account:${encodeURIComponent(owner)}`}`;
}

export function makeSnapshot(owner, threads, dirtyIds, activeId) {
  const dirty = new Set(dirtyIds);
  return { version: SNAPSHOT_VERSION, owner, activeId, dirtyIds: [...dirty], threads: owner === null ? threads : threads.filter(thread => dirty.has(thread.id) || !thread.messages.length) };
}

export function readSnapshot(serialized, owner = null) {
  if (!serialized) return { threads: [], dirtyIds: [], activeId: null };
  const data = JSON.parse(serialized);
  if (!record(data) || data.version !== SNAPSHOT_VERSION || data.owner !== owner || !Array.isArray(data.threads)) throw new Error('Saved chat data could not be read for this account.');
  const unique = new Map();
  for (const value of data.threads.slice(0, MAX_CONVERSATIONS)) {
    const thread = normalizeConversation(value);
    if (thread && !unique.has(thread.id)) unique.set(thread.id, thread);
  }
  const threads = sortConversations([...unique.values()]);
  return { threads, dirtyIds: Array.isArray(data.dirtyIds) ? data.dirtyIds.filter(id => unique.has(id)) : [], activeId: typeof data.activeId === 'string' && UUID.test(data.activeId) ? data.activeId : null };
}

/** Reconcile only acknowledged-equivalent drafts; differing server revisions remain conflicts. */
export function mergeConversationHistory(remoteValues, snapshot) {
  const remote = new Map((Array.isArray(remoteValues) ? remoteValues : []).map(normalizeConversation).filter(Boolean).map(thread => [thread.id, thread]));
  const remoteCount = remote.size;
  const dirtyIds = [];
  const conflictIds = [];
  for (const local of snapshot.threads || []) {
    const server = remote.get(local.id);
    const dirty = snapshot.dirtyIds.includes(local.id);
    if (!local.messages.length && !server && remote.size < MAX_CONVERSATIONS) remote.set(local.id, local);
    if (!dirty || !local.messages.length) continue;
    if (server && sameConversationContent(local, server)) continue;
    remote.set(local.id, local);
    dirtyIds.push(local.id);
    if (server ? server.revision !== local.revision : local.revision > 0 || remoteCount >= MAX_CONVERSATIONS) conflictIds.push(local.id);
  }
  // Unsaved drafts take display priority. Omitted clean chats remain intact on the server.
  const ordered = sortConversations([...remote.values()]);
  const retained = new Set(dirtyIds);
  for (const thread of ordered) if (retained.size < MAX_CONVERSATIONS) retained.add(thread.id);
  const threads = ordered.filter(thread => retained.has(thread.id));
  return { threads, dirtyIds, conflictIds, activeId: threads.some(thread => thread.id === snapshot.activeId) ? snapshot.activeId : threads[0]?.id || null };
}

/** A per-id serialized, coalescing queue; conflicts are blocked until explicitly discarded. */
export function createConversationSaveQueue({ save, onSaved = () => {}, onError = () => {}, onPendingChange = () => {} }) {
  const entries = new Map();
  let disposed = false;
  const pending = () => { if (!disposed) onPendingChange([...entries.values()].some(entry => entry.running)); };

  function start(entry) {
    if (disposed || entry.running || entry.blocked || !entry.latest) return;
    entry.running = true;
    pending();
    entry.promise = (async () => {
      while (!disposed && entry.latest && !entry.blocked) {
        const submitted = entry.latest;
        entry.latest = null;
        try {
          const saved = await save(entry.id, { title: submitted.title, messages: submitted.messages, revision: entry.revision });
          if (disposed) return;
          if (!saved || !Number.isSafeInteger(saved.revision) || saved.revision <= entry.revision) throw new Error('The server returned an invalid chat revision.');
          entry.revision = saved.revision;
          onSaved(entry.id, saved, submitted);
        } catch (error) {
          if (disposed) return;
          entry.latest ||= submitted;
          entry.blocked = { error, conflict: error?.status === 409 || error?.status === 404 };
          onError(entry.id, error, entry.blocked.conflict);
        }
      }
    })().finally(() => { entry.running = false; pending(); });
  }

  return {
    enqueue(thread) {
      if (disposed || !thread?.messages?.length) return;
      let entry = entries.get(thread.id);
      if (!entry) { entry = { id: thread.id, revision: thread.revision, latest: null, running: false, blocked: null, promise: null }; entries.set(thread.id, entry); }
      entry.latest = { ...thread, messages: thread.messages.map(storedMessage) };
      start(entry);
    },
    retry(id) {
      for (const entry of entries.values()) if ((!id || entry.id === id) && !entry.blocked?.conflict) { entry.blocked = null; start(entry); }
    },
    discard(id) {
      const entry = entries.get(id);
      if (entry?.running) return false;
      entries.delete(id); return true;
    },
    async flush() {
      while (!disposed) {
        const running = [...entries.values()].filter(entry => entry.running).map(entry => entry.promise);
        if (!running.length) return [...entries.values()].every(entry => !entry.latest && !entry.blocked);
        await Promise.all(running);
      }
      return false;
    },
    dispose() { disposed = true; },
  };
}
