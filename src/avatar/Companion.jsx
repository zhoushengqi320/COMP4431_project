import React, { useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronUp, RotateCcw, Sparkles } from 'lucide-react';
import Avatar2D from './Avatar2D';
import { createAvatarScene } from './scene';
import { companionState, states } from './state';
import { interactionReaction } from './expressions';
import './avatar.css';

function preference(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function remember(key, value) { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } }

function Avatar3D({ state, motion, gaze, activityKey, onFailure, onInteract, resetRef }) {
  const host = useRef(null), scene = useRef(null);
  const latest = useRef({ state, motion }); latest.current = { state, motion };
  useEffect(() => {
    let active = true;
    try {
      scene.current = createAvatarScene(host.current, {
        initialState: latest.current.state, motion: latest.current.motion,
        onFailure: () => { if (active) onFailure(); }, onInteract
      });
      resetRef.current = () => scene.current?.reset();
    } catch { if (active) onFailure(); }
    return () => { active = false; scene.current?.dispose(); scene.current = null; resetRef.current = null; };
  }, [onFailure, onInteract, resetRef]);
  useEffect(() => { scene.current?.update(state, motion, gaze, activityKey); }, [state, motion, gaze, activityKey]);
  return <div className="pear-avatar-webgl" ref={host}/>;
}

export default function Companion(props) {
  const [mode, setMode] = useState(() => preference('polypath-avatar-mode', '3d') === '2d' ? '2d' : '3d');
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1199px)').matches);
  const [motion, setMotion] = useState(() => preference('polypath-avatar-motion', 'on') !== 'off');
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [failure, setFailure] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [gaze, setGaze] = useState({x:0,y:0});
  const [activityKey, setActivityKey] = useState(0);
  const [surprises, setSurprises] = useState(() => preference('polypath-avatar-surprises', 'on') !== 'off');
  const [onscreen, setOnscreen] = useState(true);
  const [pageActive,setPageActive]=useState(()=>!document.hidden);
  const [previewSource, setPreviewSource] = useState('preview');
  const timer = useRef(null), resetRef = useRef(null);
  const stageRef=useRef(null), clicks=useRef(), ambientCount=useRef(0);
  const live = companionState(props);
  const state = live === 'idle' && preview ? preview : live;
  const animated = motion && !reduced;
  const meta = states[state];
  // Stable callbacks keep the WebGL scene alive across chat and playback updates.
  const failureHandler = useRef(() => { setFailure(true); setMode('2d'); }).current;
  const greet = useRef(() => {
    clearTimeout(timer.current);
    clicks.current=interactionReaction(performance.now(),clicks.current);
    setPreviewSource('interaction');setPreview(clicks.current.state);setActivityKey(n=>n+1);
    timer.current=setTimeout(()=>setPreview(null),2600);
  }).current;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches); media.addEventListener('change', update);
    const visibility=()=>setPageActive(!document.hidden);document.addEventListener('visibilitychange',visibility);
    return () => { media.removeEventListener('change', update);document.removeEventListener('visibilitychange',visibility); clearTimeout(timer.current); };
  }, []);
  useEffect(() => { setPreview(null); clearTimeout(timer.current); }, [live]);
  useEffect(() => {
    if(!stageRef.current)return;
    const observer=new IntersectionObserver(entries=>setOnscreen(entries[0].isIntersecting));
    observer.observe(stageRef.current);return()=>observer.disconnect();
  }, [collapsed]);
  useEffect(() => {
    if(live!=='idle'||preview||collapsed||!surprises||!animated||!onscreen||!pageActive)return;
    const delay=ambientCount.current===0?9000+Math.random()*5000:22000+Math.random()*12000;
    const timeout=setTimeout(()=>{
      if(document.hidden)return;
      const mood=['curious','playful','sleepy'][ambientCount.current++%3];
      setPreviewSource('ambient');setPreview(mood);setActivityKey(n=>n+1);
      clearTimeout(timer.current);timer.current=setTimeout(()=>setPreview(null),2800);
    },delay);
    return()=>clearTimeout(timeout);
  },[live,preview,collapsed,surprises,animated,onscreen,pageActive]);
  function changeMode(next) { setMode(next); remember('polypath-avatar-mode', next); }
  function tryState(next) { clearTimeout(timer.current);setPreviewSource('preview');setActivityKey(n=>n+1);setPreview(next);timer.current=setTimeout(()=>setPreview(null),4500); }
  function followPointer(event) {
    if(event.buttons||event.pointerType==='touch')return;
    const bounds=event.currentTarget.getBoundingClientRect();
    const x=(event.clientX-bounds.left)/bounds.width*2-1,y=(event.clientY-bounds.top)/bounds.height*2-1;
    setGaze({x,y});
  }

  return <aside className={`pear-companion ${collapsed ? 'is-collapsed' : ''} ${animated ? '' : 'is-still'}`} aria-label="Pear virtual companion" style={{ '--avatar-color': meta.color }}>
    <div className="pear-companion-heading"><div><span className="pear-overline">YOUR LITTLE CO-PILOT</span><h2>Pear<span> / 派尔</span></h2></div><button className="pear-icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand companion' : 'Collapse companion'} aria-expanded={!collapsed}>{collapsed ? <ChevronDown size={17}/> : <ChevronUp size={17}/>}</button></div>
    {collapsed ? <button className="pear-collapsed-status" onClick={() => setCollapsed(false)}><span/>{states[live].label}<ChevronDown size={14}/></button> : <>
      <div className="pear-view-tabs" role="group" aria-label="Avatar display mode">
        <button aria-pressed={mode === '2d'} onClick={() => changeMode('2d')}><Sparkles size={13}/>2D</button>
        <button aria-pressed={mode === '3d'} onClick={() => changeMode('3d')} disabled={failure}><Box size={13}/>3D</button>
        <span>{mode === '3d' ? 'INTERACTIVE' : 'ILLUSTRATED'}</span>
      </div>
      <div className={`pear-stage avatar-${state}`} ref={stageRef} onPointerMove={followPointer} onPointerLeave={()=>setGaze({x:0,y:0})}>
        <div className="pear-stage-grid" aria-hidden="true"/>
        {mode === '3d' ? <Avatar3D state={state} motion={animated && onscreen && pageActive} gaze={gaze} activityKey={activityKey} onFailure={failureHandler} onInteract={greet} resetRef={resetRef}/> : <button className="pear-avatar-2d-button" onClick={greet} aria-label="Say hello to Pear"><Avatar2D state={state} motion={animated && onscreen && pageActive} gaze={gaze} activityKey={activityKey}/></button>}
        {['thinking','transcribing','connecting','preparing'].includes(state) && <svg className="pear-thinking-bubbles" viewBox="0 0 360 340" aria-hidden="true"><g fill="#f5fbea" stroke="currentColor" strokeWidth="1.7"><circle cx="263" cy="131" r="3"/><circle cx="279" cy="113" r="5.5"/><circle cx="299" cy="90" r="10"/></g></svg>}
        <span className="pear-stage-corner" aria-hidden="true">P / 01</span>
        {mode === '3d' && <button className="pear-reset pear-icon" aria-label="Reset 3D view" onClick={() => resetRef.current?.()}><RotateCcw size={14}/></button>}
      </div>
      <div className="pear-status" role="status" aria-live="polite"><span className="pear-status-dot"/><strong>{meta.label}</strong>{preview && previewSource==='preview' && live === 'idle' && <small>PREVIEW</small>}</div>
      <p className="pear-detail">{meta.detail}</p>
      <div className="pear-interaction-hint">{mode === '3d' ? 'Drag to orbit · tap to say hello' : 'Tap your companion to say hello'}</div>
      {failure && <p className="pear-fallback" role="status">3D is unavailable on this device. Pear is here in 2D.</p>}
      <div className="pear-options"><label><input type="checkbox" checked={motion && !reduced} disabled={reduced} onChange={e => { setMotion(e.target.checked); remember('polypath-avatar-motion', e.target.checked ? 'on' : 'off'); }}/>{reduced ? 'System: reduced motion' : 'Gentle motion'}</label><button onClick={() => setPreviewOpen(!previewOpen)} aria-expanded={previewOpen}>Try expressions {previewOpen ? '−' : '+'}</button></div>
      <label className="pear-surprises"><input type="checkbox" checked={surprises} onChange={e=>{setSurprises(e.target.checked);remember('polypath-avatar-surprises',e.target.checked?'on':'off');if(!e.target.checked&&previewSource==='ambient'){clearTimeout(timer.current);setPreview(null);}}}/>Little surprises<span>Occasional playful moments</span></label>
      {previewOpen && <div className="pear-previews"><p>Animation preview · no microphone or AI request</p><div>{['idle','listening','thinking','speaking','paused','greeting','curious','playful','pout','sleepy'].map(item => <button key={item} disabled={live !== 'idle'} aria-pressed={preview === item} onClick={() => tryState(item)}>{item === 'idle' ? 'Reset' : item === 'greeting' ? 'Hello' : item[0].toUpperCase()+item.slice(1)}</button>)}</div>{live !== 'idle' && <p>Live conversation takes priority.</p>}</div>}
      <div className="pear-footer"><span className="pear-footer-symbol">✧</span><p>A small spark for<br/><strong>your next big step.</strong></p></div>
    </>}
  </aside>;
}
