import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, CircleHelp, Compass, FileText, GraduationCap, LayoutGrid, LoaderCircle, LockKeyhole, LogOut, Mic, Square, Volume2, Pause, Play, Settings2, Menu, MessageSquare, Paperclip, Plus, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload, UserRound, X, AlertCircle } from 'lucide-react';
import { requestAdvice, requestTranscript } from './advisor';
import { createVoiceSession, speechSupport } from './voice';
import { createSpeechPlayer, narrationFor } from './speech';
import Companion from './avatar/Companion';
import { AuthScreen, AuthLoading } from './Auth.jsx';
import { apiRequest } from './auth.js';
import { useConversations } from './useConversations.js';
import './styles.css';
import './course-guide.css';

const emptyProfile = { programme: '', year: '', semester: '', graduation: '', interests: '' };
const prompts = [
  { icon: Compass, title: 'Explore courses', question: 'I want to focus on machine learning. Which courses should I consider?' },
  { icon: LayoutGrid, title: 'Plan my semesters', question: 'Help me plan my remaining semesters.' },
  { icon: ShieldCheck, title: 'Check requirements', question: 'What prerequisites and graduation requirements should I check?' }
];
const categories = ['Completed courses / transcript', 'Graduation requirements', 'Course information / offerings'];
const uid = () => crypto.randomUUID();
function makeFiles(files, category) { return Array.from(files).map(file => ({ id: uid(), name: file.name, size: file.size, category, file })); }
function sizeLabel(size) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }

function App({ user, initialProfile, onLogout, onSignIn }) {
  const guest = !user;
  const { threads, activeId, messages, ready, historyError, saving: historySaving, conflictIds, createConversation, selectConversation, appendMessage, retrySave, flush, recoverConflict } = useConversations(user?.id || null);
  const currentChat = useRef(activeId);
  currentChat.current = activeId;
  const [page, setPage] = useState('advisor');
  const [advisorInfo, setAdvisorInfo] = useState({ mode: 'loading' });
  useEffect(() => { const abort = new AbortController(); apiRequest('/api/advisor/status', { signal: abort.signal, expectedUserId: user?.id, guest }).then(setAdvisorInfo).catch(error => { if (error.name !== 'AbortError') setAdvisorInfo({ mode: 'unavailable' }); }); return () => abort.abort(); }, [guest, user?.id]);
  const [mobileNav, setMobileNav] = useState(false);
  const [profile, setProfile] = useState(() => ({ ...emptyProfile, ...initialProfile }));
  const [documents, setDocuments] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [pendingChats, setPendingChats] = useState({});
  const [chatErrors, setChatErrors] = useState({});
  const loading = Boolean(pendingChats[activeId]);
  const error = chatErrors[activeId] || '';
  const [fileError, setFileError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [allowUnsavedLogout, setAllowUnsavedLogout] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceState, setVoiceState] = useState('idle');
  const [voicePreview, setVoicePreview] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState('zh-CN');
  const voiceSession = useRef(null);
  const voiceTimer = useRef(null);
  const voiceActive = voiceState !== 'idle';
  const voiceReady = speechSupport(window);
  const [speechState, setSpeechState] = useState({ messageId: null, status: 'idle' });
  const [speechError, setSpeechError] = useState('');
  const [speechSettings, setSpeechSettings] = useState(false);
  const [speechVoices, setSpeechVoices] = useState([]);
  const [speechVoice, setSpeechVoice] = useState('');
  const [speechRate, setSpeechRate] = useState(1);
  const speechPlayer = useRef(null);
  const playbackSupported = Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
  const playbackActive = speechState.status !== 'idle';
  const bottom = useRef(null);
  const input = useRef(null);
  const controllers = useRef(new Map());

  useEffect(() => {
    const synthesis = window.speechSynthesis;
    const player = createSpeechPlayer({ synthesis, Utterance: window.SpeechSynthesisUtterance, onState: setSpeechState, onError: setSpeechError });
    speechPlayer.current = player;
    const refreshVoices = () => setSpeechVoices(synthesis?.getVoices() || []);
    refreshVoices();
    synthesis?.addEventListener('voiceschanged', refreshVoices);
    const leave = () => { player.stop(); voiceSession.current?.cancel(); };
    window.addEventListener('pagehide', leave);
    return () => { player.stop(); synthesis?.removeEventListener('voiceschanged', refreshVoices); window.removeEventListener('pagehide', leave); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading, activeId]);
  useEffect(() => () => { for (const controller of controllers.current.values()) controller.abort(); controllers.current.clear(); voiceSession.current?.cancel(); clearTimeout(voiceTimer.current); }, []);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(timer); }, [saved]);
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') { setHelp(false); setMobileNav(false); setSpeechSettings(false); speechPlayer.current?.stop(); cancelVoice(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);

  function addFiles(files, target, category) {
    if (guest) { onSignIn(); return; }
    const accepted = [];
    let issue = '';
    const existing = [...documents, ...attachments];
    let selectedSize = existing.reduce((sum, file) => sum + file.size, 0);
    for (const file of files) {
      if (!/\.(pdf|csv|txt|docx|md)$/i.test(file.name)) { issue = 'Please choose PDF, CSV, TXT, DOCX or Markdown files.'; continue; }
      if (file.size > 10 * 1024 * 1024) { issue = 'Each file must be 10 MB or smaller.'; continue; }
      if (existing.some(item => item.name === file.name && item.size === file.size && item.category === category)) continue;
      if (existing.length + accepted.length >= 8) { issue = 'Select up to 8 files in total, including message attachments.'; continue; }
      if (selectedSize + file.size > 24 * 1024 * 1024) { issue = 'Selected files must total 24 MB or less.'; continue; }
      selectedSize += file.size; accepted.push(file);
    }
    setFileError(issue);
    const setter = target === 'documents' ? setDocuments : setAttachments;
    setter(previous => [...previous, ...makeFiles(accepted, category)].filter((item, index, all) => all.findIndex(other => other.name === item.name && other.size === item.size && other.category === item.category) === index));
  }
  function stopPlayback() { speechPlayer.current?.stop(); }
  function readAnswer(message) {
    if (guest) { onSignIn(); return; }
    cancelVoice(); setVoiceOpen(false); setSpeechError('');
    const text = narrationFor(message);
    const language = /[\u3400-\u9fff]/.test(text) ? (voiceLanguage.startsWith('zh') ? voiceLanguage : 'zh-CN') : 'en-US';
    speechPlayer.current?.speak({ messageId: message.id, text, language, rate: speechRate, voiceURI: speechVoice });
  }
  function cancelVoice() {
    clearTimeout(voiceTimer.current);
    voiceSession.current?.cancel(); voiceSession.current = null;
    setVoiceState('idle'); setVoicePreview('');
  }
  function startVoice() {
    if (guest) { onSignIn(); return; }
    if (!voiceReady || voiceSession.current || loading) return;
    stopPlayback(); setSpeechError('');
    setVoiceError(''); setVoicePreview('');
    const session = createVoiceSession({ language: voiceLanguage, transcribe: requestTranscript,
      onState: state => {
        setVoiceState(state);
        if (state === 'idle') { clearTimeout(voiceTimer.current); voiceSession.current = null; }
      },
      onPreview: setVoicePreview,
      onComplete: text => { setDraft(previous => previous ? `${previous.trimEnd()} ${text}` : text); setVoiceOpen(false); input.current?.focus(); },
      onError: setVoiceError
    });
    voiceSession.current = session;
    voiceTimer.current = setTimeout(() => {
      session.cancel(); voiceSession.current = null;
      setVoiceError('Voice input timed out. Please try again.');
    }, 60000);
    session.start();
  }
  function navigate(next) {
    if (guest && next === 'profile') { setMobileNav(false); onSignIn(); return; }
    if (next !== 'advisor') { cancelVoice(); stopPlayback(); setVoiceOpen(false); setSpeechSettings(false); }
    setPage(next); setMobileNav(false); setFileError('');
  }
  function resetComposer() {
    cancelVoice(); stopPlayback(); setSpeechError(''); setVoiceOpen(false); setVoiceError('');
    setAttachments([]); setDraft(''); setFileError(''); navigate('advisor');
  }
  function newChat() {
    if (!ready || signingOut) return;
    if (createConversation()) resetComposer();
  }
  function openChat(id) {
    if (id === activeId) { navigate('advisor'); return; }
    if (selectConversation(id)) resetComposer();
  }
  async function send(value = draft) {
    const text = value.trim();
    const chatId = activeId;
    if (!text || !ready || !chatId || controllers.current.has(chatId) || voiceSession.current || signingOut) return;
    if (messages.length >= 99) { setChatErrors(previous => ({ ...previous, [chatId]: 'This conversation is full. Start a new conversation to continue; your history will be kept.' })); return; }
    stopPlayback(); setSpeechError('');
    const currentAttachments = attachments;
    const userMessage = { id: uid(), role: 'user', text, attachments: currentAttachments.map(({ name, size }) => ({ name, size })) };
    if (!appendMessage(chatId, userMessage)) return;
    setDraft(''); setAttachments([]); setChatErrors(previous => ({ ...previous, [chatId]: '' }));
    setPendingChats(previous => ({ ...previous, [chatId]: true })); navigate('advisor');
    const controller = new AbortController();
    controllers.current.set(chatId, controller);
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const result = await requestAdvice({ userId: user?.id, message: text, history: messages, profile: guest ? {} : profile, documents: guest ? [] : documents, attachments: currentAttachments, signal: controller.signal });
      if (controllers.current.get(chatId) === controller) {
        appendMessage(chatId, { ...result, id: uid(), role: 'assistant' });
        if (guest && Number.isFinite(result.guestRemaining)) setAdvisorInfo(previous => ({ ...previous, guestRemaining: result.guestRemaining }));
      }
    } catch (err) {
      if (controllers.current.get(chatId) === controller) {
        setChatErrors(previous => ({ ...previous, [chatId]: err.name === 'AbortError' ? 'The request timed out. Please send your question again.' : err.message }));
        if (currentChat.current === chatId) { setDraft(previous => previous || text); setAttachments(previous => previous.length ? previous : currentAttachments); }
      }
    } finally {
      clearTimeout(timeout);
      if (controllers.current.get(chatId) === controller) {
        controllers.current.delete(chatId);
        setPendingChats(previous => ({ ...previous, [chatId]: false }));
      }
    }
  }
  async function saveProfile(e) {
    e.preventDefault();
    if (guest) { onSignIn(); return; }
    if (saving) return;
    setSaving(true); setSaved(false); setStorageError('');
    try { await apiRequest('/api/profile', { method: 'PUT', body: profile, expectedUserId: user.id }); setSaved(true); }
    catch (error) { setStorageError(error.message); }
    finally { setSaving(false); }
  }
  async function signOut(skipSave = false) {
    if (signingOut) return;
    setSigningOut(true); setAccountError('');
    try {
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear(); setPendingChats({});
      if (!skipSave && !await flush()) { setAccountError('Some chats have not synced. Retry saving, or sign out anyway. Unsynced chats may be lost if browser storage is unavailable.'); setAllowUnsavedLogout(true); return; }
      await apiRequest('/api/auth/logout', { method: 'POST', expectedUserId: user.id }); onLogout();
    }
    catch (error) { setAccountError(error.message); }
    finally { setSigningOut(false); }
  }
  const profileComplete = Boolean(profile.programme && profile.year);
  const firstName = user?.name.split(' ')[0];
  const initials = user?.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`} aria-label="Main navigation">
      <a className="brand" href="#advisor" onClick={e => { e.preventDefault(); navigate('advisor'); }}><GraduationCap size={25}/><span>PolyPath</span></a>
      <button className="new-chat" onClick={newChat} disabled={!ready || signingOut}><Plus size={18}/> New conversation</button>
      <nav aria-label="Workspace">
        <button className={`nav-item ${page === 'advisor' ? 'active' : ''}`} onClick={() => navigate('advisor')} aria-current={page === 'advisor' ? 'page' : undefined}><MessageSquare size={18}/> AI Advisor</button>
        <button className={`nav-item ${page === 'profile' ? 'active' : ''}`} onClick={() => navigate('profile')} aria-current={page === 'profile' ? 'page' : undefined}><UserRound size={18}/> Profile & documents {guest && <LockKeyhole size={13}/>}</button>
      </nav>
      <section className="history-section" aria-label="Conversation history">
        <div className="history-heading"><h2>Recent chats</h2>{historySaving && <LoaderCircle size={13} className="spin" aria-label="Saving conversations"/>}</div>
        {!ready ? <p className="history-empty" role="status">Loading history…</p> : threads.some(thread => thread.messages.length) ? <div className="history-list">{threads.filter(thread => thread.messages.length).map(thread => <button key={thread.id} className={`history-item ${activeId === thread.id ? 'active' : ''}`} aria-label={`Conversation: ${thread.title}`} aria-pressed={activeId === thread.id} title={thread.title} disabled={signingOut} onClick={() => openChat(thread.id)}><MessageSquare size={14}/><span>{thread.title}</span>{pendingChats[thread.id] && <LoaderCircle size={12} className="spin"/>}</button>)}</div> : <p className="history-empty">Your conversations will appear here.</p>}
        <p className="history-retention">{guest ? 'Guest history stays in this tab.' : 'Conversations saved to your account.'}</p>
      </section>
      <div className="sidebar-bottom"><button className="help-button" onClick={() => { setHelp(true); setMobileNav(false); }}><CircleHelp size={17}/> Help & information</button><p>PolyU academic planning</p></div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={21}/></button><strong>{page === 'advisor' ? 'AI Advisor' : 'Profile & documents'}</strong></div>
        <div className="topbar-right">{guest ? <><span className="guest-label">Guest</span><button className="primary-button" onClick={onSignIn}>Sign in</button></> : <><button className="account-button" onClick={() => navigate('profile')} title={`Signed in as ${user.email}`}><span className="topbar-avatar">{initials}</span><span>Account</span></button><button className="signout-button" onClick={() => signOut()} disabled={signingOut}>{signingOut ? <LoaderCircle className="spin" size={15}/> : <LogOut size={15}/>}<span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button></>}</div>
      </header>
      {accountError && <div className="account-error" role="alert"><span>{accountError}</span>{allowUnsavedLogout && <><button onClick={retrySave} disabled={signingOut}>Retry saving</button><button onClick={() => signOut(true)} disabled={signingOut}>Sign out anyway</button></>}</div>}

      {page === 'advisor' ? <main className={`advisor-page ${messages.length ? 'has-messages' : ''}`}>
        <div className="advisor-toolbar"><span className={`mode-badge ${advisorInfo.mode === 'llm' ? 'connected' : ''}`}><span/>{advisorInfo.mode === 'llm' ? (advisorInfo.provider === 'qwen' || String(advisorInfo.model || '').toLowerCase().includes('qwen') ? 'Qwen' : 'AI advisor') : advisorInfo.mode === 'knowledge' ? 'Knowledge assistant' : advisorInfo.mode === 'loading' ? 'Connecting…' : 'Check connection'}</span><div className="toolbar-actions"><button className="text-button" onClick={() => guest ? onSignIn() : setSpeechSettings(!speechSettings)} aria-expanded={speechSettings}><Settings2 size={15}/> Voice settings {guest && <LockKeyhole size={12}/>}</button><button className="text-button context-files" onClick={() => navigate('profile')}><Paperclip size={15}/>{documents.length} {documents.length === 1 ? 'file' : 'files'}</button></div></div>
        {speechSettings && <section className="speech-settings" aria-label="Read-aloud settings"><div><strong><Volume2 size={16}/> Read-aloud settings</strong><p>Choose a voice and speed. Playback starts only when you click Read aloud.</p></div><div className="speech-setting-fields"><label>Voice<select value={speechVoice} disabled={playbackActive} onChange={e => setSpeechVoice(e.target.value)}><option value="">Automatic (match answer language)</option>{speechVoices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label><label>Speed<select value={speechRate} disabled={playbackActive} onChange={e => setSpeechRate(Number(e.target.value))}><option value={0.8}>0.8× · Slower</option><option value={1}>1× · Normal</option><option value={1.2}>1.2× · Faster</option></select></label><button className="icon-button" aria-label="Close read-aloud settings" onClick={() => setSpeechSettings(false)}><X size={17}/></button></div><p className="speech-settings-note">{!playbackSupported ? 'Read aloud is unavailable in this browser. You can still use text chat.' : playbackActive ? 'Stop playback to change voice or speed.' : 'Available voices depend on your browser and device; some voices may use an online service.'}</p></section>}
        <div className="chat-scroll">
          {!messages.length ? <div className="welcome">
            <p className="personal-greeting">{guest ? 'Welcome to PolyPath' : `Hi, ${firstName}`}</p>
            <h1>What would you like to plan?</h1>
            <p className="hero-description">Explore courses, plan your semesters, and check requirements.</p>
          </div> : <div className="message-list">{messages.map(message => <Message key={message.id} message={message} onFollowUp={send} disabled={loading || voiceActive || !ready || signingOut} speechState={speechState} playbackSupported={playbackSupported} guest={guest} onSignIn={onSignIn} onRead={() => readAnswer(message)} onPause={() => speechPlayer.current?.pause()} onResume={() => speechPlayer.current?.resume()} onStop={stopPlayback}/>)}{loading && <div className="loading-message" role="status"><span className="assistant-avatar"><Sparkles size={17}/></span><LoaderCircle className="spin" size={16}/> Preparing a response…</div>}<div ref={bottom}/></div>}
        </div>
        <div className="composer-zone">
          {historyError && <div className="history-error" role="alert"><span>{historyError}</span><button type="button" onClick={retrySave}>Retry saving</button>{threads.filter(thread => conflictIds.includes(thread.id)).map(thread => <button key={thread.id} type="button" disabled={Boolean(pendingChats[thread.id])} onClick={async () => { if (await recoverConflict(thread.id)) resetComposer(); }}>Save a copy of “{thread.title}”</button>)}</div>}
          {guest && <p className="guest-access-note">Course Q&amp;A · 20 questions / 15 min. <button onClick={onSignIn}>Sign in for saved history and more.</button></p>}
          {speechError && <div className="error-notice" role="alert"><Volume2 size={16}/>{speechError}<button className="icon-button" aria-label="Dismiss read-aloud error" onClick={() => setSpeechError('')}><X size={14}/></button></div>}{error && <div className="error-notice" role="alert"><AlertCircle size={16}/>{error}</div>}{fileError && <div className="error-notice" role="alert">{fileError}</div>}
          <form className={`composer ${voiceActive ? 'voice-active' : ''}`} onSubmit={e => { e.preventDefault(); send(); }}>
            {attachments.length > 0 && <div className="attachment-list">{attachments.map(file => <span className="attachment-chip" key={file.id}><FileText size={14}/><span>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(previous => previous.filter(item => item.id !== file.id))}><X size={14}/></button></span>)}</div>}
            {voiceOpen && <section className="voice-panel" aria-label="Voice input controls">
              <div className="voice-heading"><span><Mic size={17}/> Voice input</span><button type="button" className="icon-button" aria-label="Close voice input" onClick={() => { cancelVoice(); setVoiceOpen(false); }}><X size={16}/></button></div>
              <p className="voice-disclosure">Your browser records audio locally. Qwen transcribes it after you stop. Choose Mandarin, Cantonese or English before you start.</p>
              <div className="voice-controls"><label className="sr-only" htmlFor="voice-language">Voice language</label><select id="voice-language" disabled={voiceActive} value={voiceLanguage} onChange={e => setVoiceLanguage(e.target.value)}><option value="zh-CN">Mandarin 普通话</option><option value="zh-HK">Cantonese 粤语</option><option value="en-US">English</option></select>{voiceActive ? <button className="voice-start" type="button" disabled={voiceState === 'stopping'} onClick={() => voiceSession.current?.stop()}><Square size={12}/>{voiceState === 'stopping' ? 'Transcribing…' : 'Stop listening'}</button> : <button className="voice-start" type="button" disabled={!voiceReady || loading} onClick={startVoice}><Mic size={14}/> Start microphone</button>}</div>
              {!voiceReady && <p className="voice-error" role="status">This browser cannot record audio. Try a current browser on localhost or HTTPS. You can still type your question.</p>}
              {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
              {voiceActive && <div className="voice-live" role="status"><span className="recording-dot"/>{voiceState === 'starting' ? 'Waiting for microphone permission…' : voiceState === 'stopping' ? 'Sending audio to Qwen…' : 'Listening… speak your question.'}</div>}
              {voicePreview && <p className="voice-transcript" aria-live="polite">{voicePreview}</p>}
            </section>}
            <textarea ref={input} readOnly={voiceActive || !ready || signingOut} aria-label="Message AI Advisor" placeholder="Ask about courses, your interests, or your next semester…" rows={2} maxLength={6000} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/>
            <div className="composer-bottom"><div className="composer-tools"><>{guest ? <button type="button" className="attach-button" onClick={onSignIn} title="Sign in to upload documents"><Paperclip size={18}/><span>Attach files</span><LockKeyhole size={12}/></button> : <label className="attach-button" title="Attach files to this message"><Paperclip size={18}/><span>Attach files</span><input aria-label="Attach files to your message" type="file" multiple accept=".pdf,.csv,.txt,.docx,.md" onChange={e => { addFiles(e.target.files, 'attachments'); e.target.value = ''; }}/></label>}</><span className="composer-divider"/><span className="context-status"><span className={profileComplete ? 'green-dot' : 'neutral-dot'}/>{guest ? 'Sign in for profile' : profileComplete ? 'Profile added' : 'Add your background'}</span></div><div className="composer-right"><button className={`voice-button ${voiceActive ? 'recording' : ''}`} type="button" aria-label={voiceActive ? 'Stop voice input' : 'Open voice input'} aria-expanded={voiceOpen} title={voiceActive ? 'Stop listening' : 'Voice input'} disabled={loading || voiceState === 'stopping'} onClick={() => { if (guest) { onSignIn(); return; } if (voiceActive) voiceSession.current?.stop(); else { setVoiceError(''); setVoiceOpen(!voiceOpen); } }}>{voiceActive ? <Square size={16}/> : <Mic size={19}/>}</button><button className="send-button" aria-label="Send message" disabled={!draft.trim() || loading || voiceActive || !ready || signingOut} type="submit">{loading ? <LoaderCircle size={20} className="spin"/> : <ArrowUp size={21}/>}</button></div></div>
          </form>
          {!messages.length && <div className="prompt-list" aria-label="Suggested questions">{prompts.map(({ icon: Icon, title, question }) => <button key={title} disabled={loading || voiceActive} onClick={() => { setDraft(question); input.current?.focus(); }}><Icon size={15}/>{title}</button>)}</div>}
          <p className="composer-footnote">{advisorInfo.mode === 'llm' ? 'Qwen can make mistakes. Check the linked sources.' : 'Confirm requirements with your programme handbook.'}</p>
        </div>
      </main><Companion loading={loading} voiceState={voiceState} speechState={speechState} error={error || (voiceOpen ? voiceError : '') || speechError}/> : <main className="profile-page">
        <div className="page-heading"><h1>Profile & documents</h1><p>Add your academic background for more relevant advice.</p></div><div className="profile-overview"><span className="student-avatar">{initials}</span><div><strong>{user.name}</strong><span>{user.email}</span></div><span className="account-status"><Check size={14}/> Signed in</span></div>
        <form onSubmit={saveProfile} className="profile-card"><div className="section-heading"><span className="section-icon"><UserRound size={20}/></span><div><h2>My academic profile</h2><p>Your programme, year and interests.</p></div><span className="optional-label"><ShieldCheck size={13}/> Linked to your account</span></div><fieldset className="profile-fields" disabled={saving}>
          <label>Programme / Major<input placeholder="e.g. BSc (Hons) in Computing" maxLength={160} value={profile.programme} onChange={e => setProfile({ ...profile, programme: e.target.value })}/></label>
          <label>Current year<div className="select-wrap"><select aria-label="Current year" value={profile.year} onChange={e => setProfile({ ...profile, year: e.target.value })}><option value="">Select your year</option>{[1,2,3,4,5,6].map(year => <option key={year}>Year {year}</option>)}</select><ChevronDown size={16}/></div></label>
          <label>Current semester<div className="select-wrap"><select aria-label="Current semester" value={profile.semester} onChange={e => setProfile({ ...profile, semester: e.target.value })}><option value="">Select a semester</option><option>Semester 1</option><option>Semester 2</option><option>Summer Term</option></select><ChevronDown size={16}/></div></label>
          <label>Expected graduation<input type="text" placeholder="YYYY-MM, e.g. 2028-06" pattern="[0-9]{4}-(0[1-9]|1[0-2])" title="Use YYYY-MM, for example 2028-06." value={profile.graduation} onChange={e => setProfile({ ...profile, graduation: e.target.value })}/></label>
          <label className="full-width">Academic interests <span className="field-optional">Optional</span><input placeholder="e.g. Machine learning, software engineering, data science" maxLength={1000} value={profile.interests} onChange={e => setProfile({ ...profile, interests: e.target.value })}/></label>
        </fieldset><div className="profile-save-row"><span><ShieldCheck size={15}/> Saved securely to your account.</span><button className="primary-button" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16}/> Saving…</> : saved ? <><Check size={16}/> Profile saved</> : 'Save changes'}</button></div>{saved && <span className="sr-only" role="status">Profile saved to your account.</span>}{storageError && <p className="error-notice" role="alert">{storageError}</p>}</form>
        <section className="documents-section"><div className="documents-title"><div><h2>My documents <span>{documents.length}</span></h2><p>Add reference files to use in this conversation.</p></div><span className="session-label">Files stay in this session</span></div>
          <div className="upload-grid">{categories.map((category, index) => <label className={`upload-card ${dragging === category ? 'dragging' : ''}`} key={category} onDragOver={e => { e.preventDefault(); setDragging(category); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files, 'documents', category); }}><span className="document-number">0{index + 1}</span><span className="upload-icon">{index === 0 ? <GraduationCap size={23}/> : index === 1 ? <ShieldCheck size={23}/> : <BookOpen size={23}/>}</span><strong>{['Completed courses', 'Graduation requirements', 'Course information'][index]}</strong><p>{['Transcripts or a list of courses you have taken.', 'Programme handbooks and credit requirements.', 'Course syllabi and semester offerings.'][index]}</p><span className="upload-link"><Upload size={15}/> Choose files or drop here</span><input type="file" multiple accept=".pdf,.csv,.txt,.docx,.md" aria-label={`Upload ${category.toLowerCase()}`} onChange={e => { addFiles(e.target.files, 'documents', category); e.target.value = ''; }}/></label>)}</div>
          <p className="file-hint">PDF, CSV, TXT, DOCX or Markdown · 10 MB per file · 8 files / 24 MB total · Select only information needed for course planning.</p>{fileError && <p className="error-notice" role="alert">{fileError}</p>}
          {documents.length > 0 && <div className="document-list">{documents.map(doc => <div className="document-row" key={doc.id}><span className="file-icon"><FileText size={20}/></span><div><strong>{doc.name}</strong><span>{doc.category} · {sizeLabel(doc.size)}</span></div><span className="file-status">Ready to send</span><button className="icon-button" aria-label={`Remove ${doc.name}`} onClick={() => setDocuments(previous => previous.filter(item => item.id !== doc.id))}><Trash2 size={17}/></button></div>)}</div>}
        </section><div className="profile-bottom-note"><Sparkles size={20}/><p>Selected files are analysed when you send a message. Text-based PDFs, DOCX, TXT, CSV and Markdown are supported; scanned documents need a text version.</p><button className="text-button" onClick={() => navigate('advisor')}>Go to AI Advisor <ArrowUpRight size={16}/></button></div>
      </main>}
    </div>
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close icon-button" aria-label="Close help" onClick={() => setHelp(false)}><X size={20}/></button><span className="modal-symbol"><GraduationCap size={30}/></span><h2 id="help-title">Using PolyPath</h2><ol><li><strong>Add your background</strong><p>Fill in your profile and select your reference documents.</p></li><li><strong>Start a conversation</strong><p>Ask about interests, courses, prerequisites or semester planning. Add extra files directly to a message, or use the microphone to dictate and review your question.</p></li><li><strong>Explore your pathway</strong><p>Review course recommendations, semester plans and supporting sources. Use Read aloud on an answer to listen, pause, resume or stop. Voice settings controls the voice and speed.</p></li></ol><div className="help-note">Your saved profile belongs to your account. Member conversations are saved to your account. Guest conversations stay in this browser tab until it closes. Selected files must be reattached after a page reload. Guest access includes course Q&A; sign in for documents, your profile, voice tools and the configured AI model. Knowledge mode retrieves from the included source library; it does not use a language model. With an AI model connected, your question, profile and relevant document extracts are sent to that service. Voice services depend on your browser. Always confirm requirements with your programme handbook.</div><button className="primary-button" onClick={() => setHelp(false)}>Got it <Check size={16}/></button></section></div>}
  </div>;
}

function CourseIntroduction({ course }) {
  const zh = course.language === 'zh';
  const groups = course.preparation?.levels || course.prerequisiteLevels || [];
  return (
    <section className="course-card course-introduction">
      <header className="course-identity">
        <div className="course-kicker">
          <span className="course-code-badge">{course.code}</span>
          <span>{zh ? '课程指南' : 'COURSE GUIDE'}</span>
        </div>
        <h3>{course.title}</h3>
        <div className="course-facts">
          <span>{course.department?.toUpperCase()}</span>
          <span>Level {course.level}</span>
          <span>{course.credits ?? '—'} credits</span>
        </div>
      </header>
      <div className="course-objective">
        <span className="section-number">01</span>
        <div>
          <h4>{zh ? '学习目标' : 'What you will learn'}</h4>
          <p>{course.objectives}</p>
          {course.learningOutcomes?.length > 0 && (
            <div className="learning-outcomes">
              <h5>{zh ? '学完后，你将能够' : 'By the end, you will be able to'}</h5>
              <ul>
                {course.learningOutcomes.map((outcome, index) => (
                  <li key={index}>
                    <span className="outcome-check"><Check size={13} /></span>
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="course-rating">
        <span>{zh ? '课程评价' : 'Course rating'}</span>
        <div>
          <span className="rating-stars" aria-hidden="true">★★★★★</span>
          <strong>{Number(course.rating).toFixed(1)}<small> / 5</small></strong>
          {course.ratingSource === 'simulated' && <span className="rating-example">{zh ? '示例' : 'Example'}</span>}
        </div>
      </div>
      <div className="course-section">
        <span className="section-number">02</span>
        <div>
          <h4>{zh ? '这门课学什么？' : 'What is this course about?'}</h4>
          <p>{course.summary}</p>
        </div>
      </div>
      <div className="course-section course-prerequisites">
        <span className="section-number">03</span>
        <div>
          <h4>{zh ? '建议先修' : 'Suggested preparation'}</h4>
          {groups.length > 0 ? (
            <div className="prerequisite-levels">
              {groups.map(group => (
                <div className="prerequisite-level" key={group.level}>
                  <span className="level-badge">Level {group.level}</span>
                  <div className="prerequisite-chips">{group.courses.map(code => <span key={code}>{code}</span>)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p>{course.preparation?.description || course.prerequisite}</p>
          )}
          {groups.length > 0 && (
            <p className="prerequisite-relation">{zh ? '以上课程可作为提前学习的参考，实际选课要求请以官方课程说明为准。' : 'Use these courses as preparation references. Please check the official course description for actual enrolment requirements.'}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Message({ message, onFollowUp, disabled, speechState, playbackSupported, guest, onSignIn, onRead, onPause, onResume, onStop }) {
  const [feedback, setFeedback] = useState(null);
  const reading = speechState.messageId === message.id;
  const paused = reading && speechState.status === 'paused';
  const audioBar = <div className={`read-aloud-bar ${reading ? 'is-reading' : ''}`}>
    {guest ? <button onClick={onSignIn}><LockKeyhole size={14}/> Sign in for audio</button> : reading ? <><span className="playback-state" role="status"><Volume2 size={15}/>{paused ? 'Paused' : speechState.status === 'starting' ? 'Preparing audio…' : 'Reading aloud'}</span><button onClick={paused ? onResume : onPause} aria-label={paused ? 'Resume read aloud' : 'Pause read aloud'}>{paused ? <Play size={14}/> : <Pause size={14}/>}<span>{paused ? 'Resume' : 'Pause'}</span></button><button onClick={onStop} aria-label="Stop read aloud"><Square size={13}/><span>Stop</span></button></> : <button onClick={onRead} disabled={disabled || !playbackSupported} title={playbackSupported ? 'Read this answer and its course recommendations aloud' : 'Read aloud is not supported in this browser'}><Volume2 size={15}/> Read aloud</button>}
    {!guest && !playbackSupported && <span className="playback-unavailable">Unavailable in this browser</span>}
  </div>;
  const feedbackBar = <div className="answer-actions"><span>Was this helpful?</span><button className={`icon-button ${feedback === 'yes' ? 'selected' : ''}`} aria-label="Helpful response" aria-pressed={feedback === 'yes'} onClick={() => setFeedback(feedback === 'yes' ? null : 'yes')}><ThumbsUp size={14}/></button><button className={`icon-button ${feedback === 'no' ? 'selected' : ''}`} aria-label="Unhelpful response" aria-pressed={feedback === 'no'} onClick={() => setFeedback(feedback === 'no' ? null : 'no')}><ThumbsDown size={14}/></button>{feedback && <span role="status">Feedback noted for this session</span>}</div>;
  if (message.role === 'user') return <article className="user-message"><div><p>{message.text}</p>{message.attachments?.length > 0 && <div className="user-files">{message.attachments.map((file, index) => <span key={index}><Paperclip size={13}/>{file.name}</span>)}</div>}</div><span className="user-avatar"><UserRound size={17}/></span></article>;
  if (message.rawMode) return <article className="assistant-message"><span className="assistant-avatar"><Sparkles size={18}/></span><div className="assistant-body"><div className="message-author">PolyPath <span>微调原始输出</span></div><p className="raw-mode-note">仅发送当前问题；未使用系统提示词、课程资料、历史回答或自动排版。</p><pre className="raw-model-output">{message.text}</pre><p className="raw-mode-note">{message.model} · {message.latencyMs} ms{message.usage && ` · 输入 ${message.usage.prompt_tokens ?? '?'} / 输出 ${message.usage.completion_tokens ?? '?'} tokens`}{message.finishReason === 'length' && ' · 达到输出长度上限，回答可能不完整'} · {message.observationSaved ? '观察记录已保存' : '观察记录保存失败'}</p></div></article>;
  if (message.courses?.some(course => course.format === 'course-introduction-v1')) {
    const zh = message.courses.some(course => course.language === 'zh');
    return <article className="assistant-message course-only-message"><span className="assistant-avatar"><Sparkles size={18}/></span><div className="assistant-body"><div className="message-author">PolyPath <span>COURSE GUIDE</span></div>{message.decisionNotice && <p className="course-missing-notice" role="status">{message.decisionNotice}</p>}{message.unavailableCourses?.length > 0 && <p className="course-missing-notice" role="status">{zh ? '未找到课程资料，请核对编号：' : 'No course records found; please check: '}{message.unavailableCourses.join('、')}</p>}{message.overview && <section className="recommendation-overview"><div className="overview-heading"><Sparkles size={16}/><h4>{zh ? '选课建议' : 'Your course recommendations'}</h4></div><p>{message.overview}</p><span>{zh ? '下面逐门了解' : 'Explore each course below'} <span aria-hidden="true">↓</span></span></section>}<div className="course-grid course-introduction-list">{message.courses.filter(course => course.format === 'course-introduction-v1').map(course => <CourseIntroduction key={course.code} course={course}/>)}</div>{message.followUps?.length > 0 && <section className="course-follow-ups"><h4><MessageSquare size={15}/>{zh ? '可能的继续提问' : 'Keep exploring'}</h4><div>{message.followUps.map((question, index) => <button type="button" key={index} disabled={disabled} onClick={() => onFollowUp(question)}><span>{question}</span><ArrowUpRight size={16}/></button>)}</div></section>}{message.moreCourses?.available && <section className="more-course-prompt"><p>{zh ? '还有其他相关课程可以继续了解。' : 'There are more related courses to explore.'}</p><button type="button" disabled={disabled} onClick={() => onFollowUp(message.moreCourses.prompt)}>{zh ? '查看更多相关课程' : 'Explore more courses'}<ArrowUpRight size={16}/></button></section>}{audioBar}{feedbackBar}</div></article>;
  }
  return <article className="assistant-message"><span className="assistant-avatar"><Sparkles size={18}/></span><div className="assistant-body"><div className="message-author">PolyPath <span>{message.mode === 'llm' ? 'QWEN' : 'KNOWLEDGE ASSISTANT'}</span></div><p className="answer-text">{message.text}</p>{message.warnings?.length > 0 && <div className="response-notes" role="status">{message.warnings.map((note, index) => <p key={index}><AlertCircle size={14}/>{note}</p>)}</div>}
    {message.courses?.length > 0 && <div className="course-grid">{message.courses.map((course, index) => <section className="course-card" key={index}><div className="course-top"><span>{course.code}</span>{Number.isFinite(course.credits) && <span>{course.credits} credits</span>}</div><h3>{course.title}</h3><span className="course-tag">{course.tag}</span><p>{course.reason}</p><details><summary>Prerequisites <ChevronDown size={14}/></summary><p>{course.prerequisite}</p></details></section>)}</div>}
    {message.semesters?.length > 0 && <div className="semester-grid">{message.semesters.map((semester, index) => <section className="semester-card" key={index}><div><h3>{semester.title}</h3>{Number.isFinite(semester.credits) && <span>{semester.credits} credits</span>}</div><ul>{semester.courses.map((course, i) => <li key={i}><BookOpen size={14}/>{course}</li>)}</ul></section>)}</div>}
    {message.checks?.length > 0 && <div className="checks-panel"><strong><ShieldCheck size={16}/> Planning checks</strong>{message.checks.map((check, i) => <span key={i}><AlertCircle size={13}/>{check}</span>)}</div>}
    {message.sources?.length > 0 && <details className="sources-panel"><summary><FileText size={15}/> Sources & supporting information <ChevronDown size={14}/></summary>{message.sources.map((source, index) => <div key={index}><strong>{source.title}</strong><p>{source.detail}</p>{source.url && /^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={13}/></a>}</div>)}</details>}
    {audioBar}
    {feedbackBar}
    {message.followUps?.length > 0 && <div className="follow-ups">{message.followUps.map((text, index) => <button disabled={disabled} key={index} onClick={() => onFollowUp(text)}>{text}<ArrowUpRight size={13}/></button>)}</div>}
  </div></article>;
}

function AuthRoot() {
  const [session, setSession] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const sessionChannel = useRef(null);
  const generation = useRef(0);
  async function refreshSession() {
    const request = ++generation.current;
    setVerifying(true);
    try {
      const result = await apiRequest('/api/auth/session');
      if (request === generation.current) { setSession(result.user ? result : null); if (result.user) setShowAuth(false); setError(''); }
    } catch (error) { if (request === generation.current) setError(error.message); }
    finally { if (request === generation.current) { setChecking(false); setVerifying(false); } }
  }
  useEffect(() => {
    refreshSession();
    const expired = () => { refreshSession(); };
    window.addEventListener('polypath:unauthorized', expired);
    window.addEventListener('focus', refreshSession);
    if (typeof BroadcastChannel !== 'undefined') {
      sessionChannel.current = new BroadcastChannel('polypath-auth');
      sessionChannel.current.onmessage = refreshSession;
    }
    return () => { generation.current++; window.removeEventListener('polypath:unauthorized', expired); window.removeEventListener('focus', refreshSession); sessionChannel.current?.close(); };
  }, []);
  function authenticated(result) { generation.current++; setShowAuth(false); setSession(result); setError(''); setVerifying(false); sessionChannel.current?.postMessage('changed'); }
  function loggedOut() { generation.current++; setShowAuth(false); setSession(null); setError(''); setVerifying(false); sessionChannel.current?.postMessage('changed'); }
  if (checking || (error && !session)) return <AuthLoading error={error} onRetry={() => { setError(''); setChecking(true); refreshSession(); }}/>;
  return <>
    <div style={{ display: showAuth && !session?.user ? 'none' : undefined }} inert={verifying || undefined}><App key={session?.user?.id || 'guest'} user={session?.user || null} initialProfile={session?.profile} onLogout={loggedOut} onSignIn={() => setShowAuth(true)}/></div>
    {showAuth && !session?.user && <AuthScreen onAuthenticated={authenticated} onContinueAsGuest={() => setShowAuth(false)}/>}
    {verifying && <div className="session-verifying" role="status"><LoaderCircle className="spin" size={16}/> Checking your session…</div>}
  </>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AuthRoot/></React.StrictMode>);
