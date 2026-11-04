import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from './auth.js';
import { MAX_CONVERSATIONS, acknowledgeConversation, appendConversationMessage, blankConversation, conversationStorageKey, createConversationSaveQueue, makeSnapshot, mergeConversationHistory, normalizeConversation, readSnapshot, sameConversationContent, sortConversations } from './conversations.js';

const now = () => new Date().toISOString();
const conflictMessage = 'This chat changed in another tab, or the account history is full. Your local draft is preserved. Use Save a copy to keep it separately.';

export function useConversations(userId = null) {
  const owner = typeof userId === 'string' && userId ? userId : null;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const current = useRef(null);
  const [view, setView] = useState({ owner, threads: [], activeId: null, ready: false, historyError: '', saving: false, conflictIds: [] });

  useEffect(() => {
    const runtime = { owner, alive: true, threads: [], activeId: null, dirty: new Set(), conflicts: new Set(), errors: new Map(), storageError: '', storageReadError: '', actionError: '', loadError: '', loaded: owner === null, ready: false, saving: false, controllers: new Set(), recovering: new Set(), queue: null, loadPromise: null };
    current.current = runtime;
    const alive = () => runtime.alive && current.current === runtime && ownerRef.current === runtime.owner;
    const publish = () => {
      if (!alive()) return;
      setView({ owner, threads: runtime.threads, activeId: runtime.activeId, ready: runtime.ready, historyError: runtime.loadError || [...runtime.errors.values()][0] || runtime.storageReadError || runtime.storageError || runtime.actionError, saving: runtime.saving, conflictIds: [...runtime.conflicts] });
    };
    const persist = () => {
      if (!alive()) return;
      try {
        sessionStorage.setItem(conversationStorageKey(owner), JSON.stringify(makeSnapshot(owner, runtime.threads, runtime.dirty, runtime.activeId)));
        runtime.storageError = '';
      } catch {
        runtime.storageError = owner === null ? 'Your browser could not keep this chat in tab storage. It remains in memory but may be lost when you close or refresh this tab.' : 'Your browser could not keep a local chat draft. Keep this tab open until your account history is saved.';
      }
    };
    const commit = (threads = runtime.threads, activeId = runtime.activeId) => {
      if (!alive()) return;
      runtime.threads = threads; runtime.activeId = activeId;
      persist(); publish();
    };
    const ensureActive = () => {
      if (runtime.threads.some(thread => thread.id === runtime.activeId)) return;
      if (runtime.threads.length) runtime.activeId = runtime.threads[0].id;
      else { const blank = blankConversation(crypto.randomUUID(), now()); runtime.threads = [blank]; runtime.activeId = blank.id; }
    };
    const ownedRequest = async (path, options = {}) => {
      const controller = new AbortController();
      runtime.controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 20000);
      try { return await apiRequest(path, { ...options, expectedUserId: owner, signal: controller.signal }); }
      finally { clearTimeout(timeout); runtime.controllers.delete(controller); }
    };

    Object.assign(runtime, { aliveCheck: alive, publish, persist, commit, ensureActive, ownedRequest });
    runtime.queue = createConversationSaveQueue({
      save: async (id, body) => (await ownedRequest(`/api/conversations/${encodeURIComponent(id)}`, { method: 'PUT', body })).conversation,
      onSaved: (id, saved, submitted) => {
        if (!alive()) return;
        const local = runtime.threads.find(thread => thread.id === id);
        if (sameConversationContent(local, submitted)) runtime.dirty.delete(id);
        runtime.errors.delete(id); runtime.conflicts.delete(id);
        commit(acknowledgeConversation(runtime.threads, id, submitted, saved));
      },
      onError: (id, error, conflict) => {
        if (!alive()) return;
        if (conflict) runtime.conflicts.add(id);
        runtime.errors.set(id, conflict ? conflictMessage : `Your chat has not synced yet. ${error.name === 'AbortError' ? 'The save timed out.' : error.message} Your local draft is preserved.`);
        commit();
      },
      onPendingChange: saving => { if (alive()) { runtime.saving = saving; publish(); } },
    });

    try {
      const snapshot = readSnapshot(sessionStorage.getItem(conversationStorageKey(owner)), owner);
      runtime.threads = snapshot.threads; runtime.activeId = snapshot.activeId;
      runtime.dirty = new Set(owner === null ? [] : snapshot.dirtyIds);
    } catch {
      runtime.storageReadError = owner === null ? 'Previous guest chats could not be read from this tab’s storage.' : 'Saved chat drafts could not be read in this browser. Account history will still be loaded from the server.';
    }

    runtime.load = async () => {
      if (runtime.loadPromise) return runtime.loadPromise;
      runtime.loadPromise = (async () => {
        try {
          const response = await ownedRequest('/api/conversations');
          if (!alive()) return false;
          if (!Array.isArray(response.conversations)) throw new Error('The server returned an invalid chat history.');
          const merged = mergeConversationHistory(response.conversations, makeSnapshot(owner, runtime.threads, runtime.dirty, runtime.activeId));
          runtime.threads = merged.threads; runtime.activeId = merged.activeId;
          runtime.dirty = new Set(merged.dirtyIds); runtime.conflicts = new Set(merged.conflictIds);
          runtime.errors.clear();
          for (const id of merged.conflictIds) runtime.errors.set(id, conflictMessage);
          runtime.loaded = true; runtime.loadError = ''; runtime.ready = true;
          ensureActive(); commit();
          for (const thread of runtime.threads) if (runtime.dirty.has(thread.id) && !runtime.conflicts.has(thread.id)) runtime.queue.enqueue(thread);
          return true;
        } catch (error) {
          if (!alive()) return false;
          runtime.loadError = `Chat history could not be loaded. ${error.name === 'AbortError' ? 'The request timed out.' : error.message} New messages will stay in this tab until you retry.`;
          runtime.ready = true; ensureActive(); commit(); return false;
        } finally { runtime.loadPromise = null; }
      })();
      return runtime.loadPromise;
    };

    if (owner === null) { runtime.ready = true; ensureActive(); commit(); }
    else { publish(); void runtime.load(); }

    return () => {
      runtime.alive = false;
      runtime.queue.dispose();
      for (const controller of runtime.controllers) controller.abort();
    };
  }, [owner]);

  const activeRuntime = useCallback(() => {
    const runtime = current.current;
    return runtime?.aliveCheck() && runtime.ready ? runtime : null;
  }, []);

  const createConversation = useCallback(() => {
    const runtime = activeRuntime();
    if (!runtime) return null;
    const existing = runtime.threads.find(thread => !thread.messages.length);
    if (existing) { runtime.actionError = ''; runtime.commit(runtime.threads, existing.id); return existing.id; }
    if (runtime.threads.length >= MAX_CONVERSATIONS) { runtime.actionError = 'Your history has reached 50 chats. Open an existing chat to continue.'; runtime.publish(); return null; }
    const blank = blankConversation(crypto.randomUUID(), now());
    runtime.actionError = ''; runtime.commit(sortConversations([...runtime.threads, blank]), blank.id);
    return blank.id;
  }, [activeRuntime]);

  const selectConversation = useCallback(id => {
    const runtime = activeRuntime();
    if (!runtime || !runtime.threads.some(thread => thread.id === id)) return false;
    runtime.actionError = ''; runtime.commit(runtime.threads, id); return true;
  }, [activeRuntime]);

  const appendMessage = useCallback((id, message) => {
    const runtime = activeRuntime();
    if (!runtime) return false;
    const result = appendConversationMessage(runtime.threads, id, message, now());
    if (!result.changed) {
      if (result.error) { runtime.actionError = result.error; runtime.publish(); }
      return Boolean(result.duplicate);
    }
    runtime.actionError = '';
    if (runtime.owner !== null) runtime.dirty.add(id);
    runtime.commit(result.threads);
    if (runtime.owner !== null && runtime.loaded && !runtime.conflicts.has(id)) runtime.queue.enqueue(result.thread);
    return true;
  }, [activeRuntime]);

  const retrySave = useCallback(async () => {
    const runtime = activeRuntime();
    if (!runtime) return false;
    runtime.actionError = ''; runtime.storageReadError = ''; runtime.persist(); runtime.publish();
    if (runtime.owner === null) return !runtime.storageError;
    if (!runtime.loaded) { if (!await runtime.load()) return false; }
    for (const [id] of runtime.errors) if (!runtime.conflicts.has(id)) runtime.errors.delete(id);
    runtime.queue.retry(); runtime.publish();
    return await runtime.queue.flush() && runtime.dirty.size === 0;
  }, [activeRuntime]);

  const flush = useCallback(async () => {
    const runtime = activeRuntime();
    if (!runtime) return false;
    runtime.persist(); runtime.publish();
    if (runtime.owner === null) return !runtime.storageError;
    if (!runtime.loaded) return false;
    return await runtime.queue.flush() && runtime.dirty.size === 0;
  }, [activeRuntime]);

  const recoverConflict = useCallback(async id => {
    const runtime = activeRuntime();
    if (!runtime || runtime.owner === null || !runtime.conflicts.has(id) || runtime.recovering.has(id)) return null;
    const draft = runtime.threads.find(thread => thread.id === id);
    if (!draft?.messages.length) return null;
    runtime.recovering.add(id);
    try {
      const response = await runtime.ownedRequest('/api/conversations');
      if (!runtime.aliveCheck()) return null;
      if (!Array.isArray(response.conversations)) throw new Error('Could not read the latest chat history.');
      if (response.conversations.length >= MAX_CONVERSATIONS || runtime.threads.length >= MAX_CONVERSATIONS) {
        runtime.actionError = 'The account already has 50 chats, so a copy cannot be saved. Your local draft is still preserved.'; runtime.errors.set(id, runtime.actionError); runtime.publish(); return null;
      }
      if (!runtime.queue.discard(id)) return null;
      const original = normalizeConversation(response.conversations.find(thread => thread.id === id));
      const latestDraft = runtime.threads.find(thread => thread.id === id) || draft;
      const copy = { ...latestDraft, id: crypto.randomUUID(), title: `${latestDraft.title.slice(0, 110)} (copy)`, revision: 0, updatedAt: now() };
      runtime.dirty.delete(id); runtime.conflicts.delete(id); runtime.errors.delete(id); runtime.dirty.add(copy.id); runtime.actionError = '';
      runtime.commit(sortConversations([...runtime.threads.filter(thread => thread.id !== id), ...(original ? [original] : []), copy]), copy.id);
      runtime.queue.enqueue(copy); return copy.id;
    } catch (error) {
      if (runtime.aliveCheck()) { runtime.errors.set(id, `The draft is still preserved, but a copy could not be prepared. ${error.message}`); runtime.publish(); }
      return null;
    } finally { runtime.recovering.delete(id); }
  }, [activeRuntime]);

  const visible = view.owner === owner ? view : { owner, threads: [], activeId: null, ready: false, historyError: '', saving: false, conflictIds: [] };
  return { ...visible, messages: visible.threads.find(thread => thread.id === visible.activeId)?.messages || [], createConversation, selectConversation, appendMessage, retrySave, flush, recoverConflict };
}

export default useConversations;
