import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, FileText, GraduationCap, LayoutGrid, LoaderCircle, Mic, Square, Menu, MessageSquare, Paperclip, Plus, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload, UserRound, X, AlertCircle } from 'lucide-react';
import { DEMO, requestAdvice } from './advisor';
import { createVoiceSession, speechSupport } from './voice';
import './styles.css';

const STORAGE = 'polypath-profile-v1';
const emptyProfile = { programme: '', year: '', semester: '', graduation: '', interests: '' };
function readProfile() { try { return { ...emptyProfile, ...JSON.parse(localStorage.getItem(STORAGE) || '{}') }; } catch { return emptyProfile; } }
const prompts = [
  { icon: Sparkles, title: 'Find my direction', text: 'Explore courses that match your interests.', question: 'I want to focus on machine learning. Which courses should I consider?' },
  { icon: LayoutGrid, title: 'Plan my semesters', text: 'Build a pathway from now to graduation.', question: 'Help me plan my remaining semesters.' },
  { icon: ShieldCheck, title: 'Check my progress', text: 'Understand prerequisites and requirements.', question: 'What prerequisites and graduation requirements should I check?' }
];
const categories = ['Completed courses / transcript', 'Graduation requirements', 'Course information / offerings'];
const uid = () => crypto.randomUUID();
function makeFiles(files, category) { return Array.from(files).map(file => ({ id: uid(), name: file.name, size: file.size, category, file })); }
function sizeLabel(size) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }

function App() {
  const [page, setPage] = useState('advisor');
  const [mobileNav, setMobileNav] = useState(false);
  const [profile, setProfile] = useState(readProfile);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceState, setVoiceState] = useState('idle');
  const [voicePreview, setVoicePreview] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState('en-US');
  const voiceSession = useRef(null);
  const voiceTimer = useRef(null);
  const voiceActive = voiceState !== 'idle';
  const Recognition = speechSupport(window);
  const bottom = useRef(null);
  const input = useRef(null);
  const controller = useRef(null);
  const activeRequest = useRef(0);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading]);
  useEffect(() => () => { controller.current?.abort(); voiceSession.current?.cancel(); clearTimeout(voiceTimer.current); }, []);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(timer); }, [saved]);
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') { setHelp(false); setMobileNav(false); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);

  function addFiles(files, target, category) {
    const accepted = [];
    let issue = '';
    for (const file of files) {
      if (!/\.(pdf|csv|txt|docx|xlsx)$/i.test(file.name)) { issue = 'Please choose PDF, CSV, TXT, DOCX or XLSX files.'; continue; }
      if (file.size > 10 * 1024 * 1024) { issue = 'Each file must be 10 MB or smaller.'; continue; }
      accepted.push(file);
    }
    setFileError(issue);
    const setter = target === 'documents' ? setDocuments : setAttachments;
    setter(previous => [...previous, ...makeFiles(accepted, category)].filter((item, index, all) => all.findIndex(other => other.name === item.name && other.size === item.size && other.category === item.category) === index));
  }
  function cancelVoice() {
    clearTimeout(voiceTimer.current);
    voiceSession.current?.cancel(); voiceSession.current = null;
    setVoiceState('idle'); setVoicePreview('');
  }
  function startVoice() {
    if (!Recognition || voiceSession.current || loading) return;
    setVoiceError(''); setVoicePreview('');
    const session = createVoiceSession({ Recognition, language: voiceLanguage,
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
    if (next !== 'advisor') { cancelVoice(); setVoiceOpen(false); }
    setPage(next); setMobileNav(false); setFileError('');
  }
  function newChat() {
    cancelVoice(); setVoiceOpen(false); setVoiceError('');
    activeRequest.current += 1; controller.current?.abort(); setLoading(false);
    setMessages([]); setAttachments([]); setDraft(''); setError(''); setFileError(''); navigate('advisor');
  }
  async function send(value = draft) {
    const text = value.trim();
    if (!text || loading || voiceSession.current) return;
    const requestId = ++activeRequest.current;
    const currentAttachments = attachments;
    const user = { id: uid(), role: 'user', text, attachments: currentAttachments.map(({ name, size }) => ({ name, size })) };
    setMessages(previous => [...previous, user]); setDraft(''); setAttachments([]); setError(''); setLoading(true); navigate('advisor');
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 60000);
    try {
      const result = await requestAdvice({ message: text, history: messages, profile, documents, attachments: currentAttachments, signal: controller.current.signal });
      if (requestId === activeRequest.current) setMessages(previous => [...previous, { ...result, id: uid(), role: 'assistant' }]);
    } catch (err) {
      if (requestId === activeRequest.current) { setError(err.name === 'AbortError' ? 'The request timed out. Please try again.' : err.message); setDraft(text); setAttachments(currentAttachments); }
    } finally { clearTimeout(timeout); if (requestId === activeRequest.current) setLoading(false); }
  }
  function saveProfile(e) {
    e.preventDefault();
    try { localStorage.setItem(STORAGE, JSON.stringify(profile)); setSaved(true); setStorageError(''); }
    catch { setStorageError('Your browser could not save this profile. It remains available in this session.'); }
  }
  const profileComplete = Boolean(profile.programme && profile.year);

  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`} aria-label="Main navigation">
      <a className="brand" href="#advisor" onClick={e => { e.preventDefault(); navigate('advisor'); }}><span className="brand-icon"><GraduationCap size={25}/></span><span>PolyPath<span className="brand-dot">.</span></span></a>
      <div className="brand-subtitle">YOUR ACADEMIC COMPASS</div>
      <button className="new-chat" onClick={newChat}><Plus size={18}/> New chat <span>↗</span></button>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        <button className={`nav-item ${page === 'advisor' ? 'active' : ''}`} onClick={() => navigate('advisor')} aria-current={page === 'advisor' ? 'page' : undefined}><MessageSquare size={18}/> AI Advisor <ChevronRight size={15}/></button>
        <button className={`nav-item ${page === 'profile' ? 'active' : ''}`} onClick={() => navigate('profile')} aria-current={page === 'profile' ? 'page' : undefined}><UserRound size={18}/> My Profile & Documents</button>
      </nav>
      <div className="sidebar-note"><span className="note-icon"><BookOpen size={18}/></span><strong>A little context. A better path.</strong><p>Add your courses and programme requirements to prepare for personalised guidance.</p><button onClick={() => navigate('profile')}>Set up my profile <ArrowUpRight size={15}/></button></div>
      <div className="sidebar-bottom"><button className="help-button" onClick={() => setHelp(true)}><CircleHelp size={17}/> How PolyPath works</button><div className="student"><span className="student-avatar"><UserRound size={18}/></span><div><strong>Student workspace</strong><span>Made for PolyU students</span></div><span className="online-dot"/></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={21}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{page === 'advisor' ? 'AI Advisor' : 'My Profile & Documents'}</strong></div><div className="topbar-right"><span className="mode-badge"><span/>{DEMO ? 'UI demo' : 'Connected advisor'}</span><span className="university">THE HONG KONG<br/><b>POLYTECHNIC UNIVERSITY</b></span></div></header>

      {page === 'advisor' ? <main className={`advisor-page ${messages.length ? 'has-messages' : ''}`}>
        <div className="advisor-toolbar"><span><span className="small-spark"><Sparkles size={14}/></span> Your academic planning companion</span><button className="text-button" onClick={() => navigate('profile')}><FileText size={14}/>{documents.length} context {documents.length === 1 ? 'file' : 'files'}<ChevronRight size={14}/></button></div>
        <div className="chat-scroll">
          {!messages.length ? <div className="welcome">
            <div className="eyebrow"><span/> A CLEARER PATH THROUGH UNIVERSITY</div>
            <h1>Your ambitions.<br/>Your courses. <span>Your path.</span></h1>
            <p className="hero-description">Turn what you want to learn into a plan for what comes next.<br className="desktop-break"/> Explore courses, connect your interests and map your academic journey.</p>
            <div className="welcome-actions"><span className="red-line"/><span>Where would you like to go?</span></div>
            <div className="prompt-grid">{prompts.map(({ icon: Icon, title, text, question }) => <button className="prompt-card" key={title} onClick={() => send(question)}><span className="prompt-icon"><Icon size={21}/></span><ArrowUpRight className="prompt-arrow" size={18}/><strong>{title}</strong><span>{text}</span></button>)}</div>
            <div className="context-tip"><span className="tip-symbol"><FileText size={19}/></span><div><strong>Start with your story</strong><p>Add your academic background for a more informed conversation.</p></div><button onClick={() => navigate('profile')}>Add my documents <ArrowUpRight size={15}/></button></div>
            <div className="path-decoration" aria-hidden="true"><span>EXPLORE</span><i/><span>CONNECT</span><i/><span>PLAN</span></div>
          </div> : <div className="message-list">{messages.map(message => <Message key={message.id} message={message} onFollowUp={send} disabled={loading || voiceActive}/>)}{loading && <div className="loading-message" role="status"><span className="assistant-avatar"><Sparkles size={17}/></span><LoaderCircle className="spin" size={16}/> Preparing a response…</div>}<div ref={bottom}/></div>}
        </div>
        <div className="composer-zone">{error && <div className="error-notice" role="alert"><AlertCircle size={16}/>{error}</div>}{fileError && <div className="error-notice" role="alert">{fileError}</div>}
          <form className={`composer ${voiceActive ? 'voice-active' : ''}`} onSubmit={e => { e.preventDefault(); send(); }}>
            {attachments.length > 0 && <div className="attachment-list">{attachments.map(file => <span className="attachment-chip" key={file.id}><FileText size={14}/><span>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(previous => previous.filter(item => item.id !== file.id))}><X size={14}/></button></span>)}</div>}
            {voiceOpen && <section className="voice-panel" aria-label="Voice input controls">
              <div className="voice-heading"><span><Mic size={17}/> Voice input</span><button type="button" className="icon-button" aria-label="Close voice input" onClick={() => { cancelVoice(); setVoiceOpen(false); }}><X size={16}/></button></div>
              <p className="voice-disclosure">Your browser’s speech service may process audio online. Transcribed text stays in the input until you send it.</p>
              <div className="voice-controls"><label className="sr-only" htmlFor="voice-language">Voice language</label><select id="voice-language" disabled={voiceActive} value={voiceLanguage} onChange={e => setVoiceLanguage(e.target.value)}><option value="en-US">English</option><option value="zh-HK">Cantonese</option><option value="zh-CN">Mandarin</option></select>{voiceActive ? <button className="voice-start" type="button" disabled={voiceState === 'stopping'} onClick={() => voiceSession.current?.stop()}><Square size={12}/>{voiceState === 'stopping' ? 'Finishing…' : 'Stop listening'}</button> : <button className="voice-start" type="button" disabled={!Recognition || loading} onClick={startVoice}><Mic size={14}/> Start microphone</button>}</div>
              {!Recognition && <p className="voice-error" role="status">Voice recognition is not supported in this browser. Try a current browser with speech recognition on localhost or HTTPS. You can still type your question.</p>}
              {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
              {voiceActive && <div className="voice-live" role="status"><span className="recording-dot"/>{voiceState === 'starting' ? 'Waiting for microphone permission…' : voiceState === 'stopping' ? 'Finishing transcription…' : 'Listening… speak your question.'}</div>}
              {voicePreview && <p className="voice-transcript" aria-live="polite">{voicePreview}</p>}
            </section>}
            <textarea ref={input} readOnly={voiceActive} aria-label="Message AI Advisor" placeholder="Ask about courses, your interests, or your next semester…" rows={2} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/>
            <div className="composer-bottom"><div className="composer-tools"><label className="attach-button" title="Attach files to this message"><Paperclip size={18}/><span>Attach files</span><input aria-label="Attach files to your message" type="file" multiple accept=".pdf,.csv,.txt,.docx,.xlsx" onChange={e => { addFiles(e.target.files, 'attachments'); e.target.value = ''; }}/></label><span className="composer-divider"/><span className="context-status"><span className={profileComplete ? 'green-dot' : 'neutral-dot'}/>{profileComplete ? 'Profile added' : 'Profile optional'}</span></div><div className="composer-right"><button className={`voice-button ${voiceActive ? 'recording' : ''}`} type="button" aria-label={voiceActive ? 'Stop voice input' : 'Open voice input'} aria-expanded={voiceOpen} title={voiceActive ? 'Stop listening' : 'Voice input'} disabled={loading || voiceState === 'stopping'} onClick={() => { if (voiceActive) voiceSession.current?.stop(); else { setVoiceError(''); setVoiceOpen(!voiceOpen); } }}>{voiceActive ? <Square size={16}/> : <Mic size={19}/>}</button><button className="send-button" aria-label="Send message" disabled={!draft.trim() || loading || voiceActive} type="submit">{loading ? <LoaderCircle size={20} className="spin"/> : <ArrowUp size={21}/>}</button></div></div>
          </form>
          <p className="composer-footnote">{DEMO ? 'Demo mode · Illustrative responses only. Files are not analysed or uploaded.' : 'Review recommendations against official programme requirements.'}<span className="footnote-divider">·</span>Student project, independently developed.</p>
        </div>
      </main> : <main className="profile-page">
        <div className="page-heading"><div className="eyebrow"><span/> THE STARTING POINT</div><h1>A plan begins with you<span>.</span></h1><p>Keep your academic background and reference documents in one place.</p></div>
        <form onSubmit={saveProfile} className="profile-card"><div className="section-heading"><span className="section-icon"><UserRound size={20}/></span><div><h2>My academic profile</h2><p>A little context to help shape your next steps.</p></div><span className="optional-label">No sign-in required</span></div><div className="profile-fields">
          <label>Programme / Major<input placeholder="e.g. BSc (Hons) in Computing" value={profile.programme} onChange={e => setProfile({ ...profile, programme: e.target.value })}/></label>
          <label>Current year<div className="select-wrap"><select aria-label="Current year" value={profile.year} onChange={e => setProfile({ ...profile, year: e.target.value })}><option value="">Select your year</option>{[1,2,3,4,5,6].map(year => <option key={year}>Year {year}</option>)}</select><ChevronDown size={16}/></div></label>
          <label>Current semester<div className="select-wrap"><select aria-label="Current semester" value={profile.semester} onChange={e => setProfile({ ...profile, semester: e.target.value })}><option value="">Select a semester</option><option>Semester 1</option><option>Semester 2</option><option>Summer Term</option></select><ChevronDown size={16}/></div></label>
          <label>Expected graduation<input type="text" placeholder="YYYY-MM, e.g. 2028-06" pattern="[0-9]{4}-(0[1-9]|1[0-2])" title="Use YYYY-MM, for example 2028-06." value={profile.graduation} onChange={e => setProfile({ ...profile, graduation: e.target.value })}/></label>
          <label className="full-width">Academic interests <span className="field-optional">Optional</span><input placeholder="e.g. Machine learning, software engineering, data science" value={profile.interests} onChange={e => setProfile({ ...profile, interests: e.target.value })}/></label>
        </div><div className="profile-save-row"><span><ShieldCheck size={15}/> Profile fields are saved in this browser.</span><button className="primary-button" type="submit">{saved ? <><Check size={16}/> Profile saved</> : 'Save profile'}</button></div>{saved && <span className="sr-only" role="status">Profile saved in this browser.</span>}{storageError && <p className="error-notice" role="alert">{storageError}</p>}</form>
        <section className="documents-section"><div className="documents-title"><div><h2>My documents <span>{documents.length}</span></h2><p>Your reference library for future conversations.</p></div><span className="session-label">Files stay in this session</span></div>
          <div className="upload-grid">{categories.map((category, index) => <label className={`upload-card ${dragging === category ? 'dragging' : ''}`} key={category} onDragOver={e => { e.preventDefault(); setDragging(category); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files, 'documents', category); }}><span className="document-number">0{index + 1}</span><span className="upload-icon">{index === 0 ? <GraduationCap size={23}/> : index === 1 ? <ShieldCheck size={23}/> : <BookOpen size={23}/>}</span><strong>{['Completed courses', 'Graduation requirements', 'Course information'][index]}</strong><p>{['Transcripts or a list of courses you have taken.', 'Programme handbooks and credit requirements.', 'Course syllabi and semester offerings.'][index]}</p><span className="upload-link"><Upload size={15}/> Choose files or drop here</span><input type="file" multiple accept=".pdf,.csv,.txt,.docx,.xlsx" aria-label={`Upload ${category.toLowerCase()}`} onChange={e => { addFiles(e.target.files, 'documents', category); e.target.value = ''; }}/></label>)}</div>
          <p className="file-hint">PDF, CSV, TXT, DOCX or XLSX · Up to 10 MB per file · Select only information needed for course planning.</p>{fileError && <p className="error-notice" role="alert">{fileError}</p>}
          {documents.length > 0 && <div className="document-list">{documents.map(doc => <div className="document-row" key={doc.id}><span className="file-icon"><FileText size={20}/></span><div><strong>{doc.name}</strong><span>{doc.category} · {sizeLabel(doc.size)}</span></div><span className="file-status">{DEMO ? 'Selected locally' : 'Ready to send'}</span><button className="icon-button" aria-label={`Remove ${doc.name}`} onClick={() => setDocuments(previous => previous.filter(item => item.id !== doc.id))}><Trash2 size={17}/></button></div>)}</div>}
        </section><div className="profile-bottom-note"><Sparkles size={20}/><p>{DEMO ? 'Add documents to prepare for the next step. The team’s AI integration will enable document analysis and source-based recommendations.' : 'Selected documents will be sent to the connected advisor when you send a message.'}</p><button className="text-button" onClick={() => navigate('advisor')}>Go to AI Advisor <ArrowUpRight size={16}/></button></div>
      </main>}
    </div>
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close icon-button" aria-label="Close help" onClick={() => setHelp(false)}><X size={20}/></button><span className="modal-symbol"><GraduationCap size={30}/></span><h2 id="help-title">Your next steps, made clearer.</h2><ol><li><strong>Add your background</strong><p>Fill in your profile and select your reference documents.</p></li><li><strong>Start a conversation</strong><p>Ask about interests, courses, prerequisites or semester planning. Add extra files directly to a message, or use the microphone to dictate and review your question.</p></li><li><strong>Explore your pathway</strong><p>Review course recommendations, semester plans and supporting sources in the conversation.</p></li></ol><div className="help-note">{DEMO ? 'This is a frontend demo. Responses are fixed examples, not AI-generated advice. Documents remain in memory and are cleared on refresh; saved profile fields stay in this browser. Feedback stays in the current chat. Voice input uses your browser’s speech service, which may process audio online; it is separate from the demo AI.' : 'Messages, profile fields and selected files are sent to the team’s configured advisor service. Check official course information before enrolling.'}</div><button className="primary-button" onClick={() => setHelp(false)}>Got it <Check size={16}/></button></section></div>}
  </div>;
}

function Message({ message, onFollowUp, disabled }) {
  const [feedback, setFeedback] = useState(null);
  if (message.role === 'user') return <article className="user-message"><div><p>{message.text}</p>{message.attachments?.length > 0 && <div className="user-files">{message.attachments.map((file, index) => <span key={index}><Paperclip size={13}/>{file.name}</span>)}</div>}</div><span className="user-avatar"><UserRound size={17}/></span></article>;
  return <article className="assistant-message"><span className="assistant-avatar"><Sparkles size={18}/></span><div className="assistant-body"><div className="message-author">PolyPath <span>{DEMO ? 'EXAMPLE RESPONSE' : 'AI ADVISOR'}</span></div><p className="answer-text">{message.text}</p>
    {message.courses?.length > 0 && <div className="course-grid">{message.courses.map((course, index) => <section className="course-card" key={index}><div className="course-top"><span>{course.code}</span><span>{course.credits} credits</span></div><h3>{course.title}</h3><span className="course-tag">{course.tag}</span><p>{course.reason}</p><details><summary>Prerequisites <ChevronDown size={14}/></summary><p>{course.prerequisite}</p></details></section>)}</div>}
    {message.semesters?.length > 0 && <div className="semester-grid">{message.semesters.map((semester, index) => <section className="semester-card" key={index}><div><h3>{semester.title}</h3><span>{semester.credits} credits</span></div><ul>{semester.courses.map((course, i) => <li key={i}><BookOpen size={14}/>{course}</li>)}</ul></section>)}</div>}
    {message.checks?.length > 0 && <div className="checks-panel"><strong><ShieldCheck size={16}/> Planning checks</strong>{message.checks.map((check, i) => <span key={i}><AlertCircle size={13}/>{check}</span>)}</div>}
    {message.sources?.length > 0 && <details className="sources-panel"><summary><FileText size={15}/> Sources & supporting information <ChevronDown size={14}/></summary>{message.sources.map((source, index) => <div key={index}><strong>{source.title}</strong><p>{source.detail}</p>{source.url && /^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={13}/></a>}</div>)}</details>}
    <div className="answer-actions"><span>Was this helpful?</span><button className={`icon-button ${feedback === 'yes' ? 'selected' : ''}`} aria-label="Helpful response" aria-pressed={feedback === 'yes'} onClick={() => setFeedback(feedback === 'yes' ? null : 'yes')}><ThumbsUp size={14}/></button><button className={`icon-button ${feedback === 'no' ? 'selected' : ''}`} aria-label="Unhelpful response" aria-pressed={feedback === 'no'} onClick={() => setFeedback(feedback === 'no' ? null : 'no')}><ThumbsDown size={14}/></button>{feedback && <span role="status">Feedback noted for this session</span>}</div>
    {message.followUps?.length > 0 && <div className="follow-ups">{message.followUps.map((text, index) => <button disabled={disabled} key={index} onClick={() => onFollowUp(text)}>{text}<ArrowUpRight size={13}/></button>)}</div>}
  </div></article>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
