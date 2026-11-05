import React, { useEffect, useRef, useState } from 'react';
import { faceFrame, motionFrame } from './expressions';

export default function Face2D({ state, motion, gaze, activityKey, children }) {
  const [time, setTime] = useState({ elapsed: 0, clock: 0 });
  const origin = useRef(performance.now());
  useEffect(() => {
    let frame, last = 0; const started = performance.now();
    setTime({ elapsed: 0, clock: (started-origin.current)/1000 });
    if (!motion) return;
    const tick = now => {
      if (now-last > 65 && !document.hidden) { setTime({ elapsed: (now-started)/1000, clock: (now-origin.current)/1000 }); last = now; }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state,motion,activityKey]);
  const face=faceFrame({state,motion,gaze,...time});
  const pose=motionFrame(state,time.elapsed,time.clock,gaze,motion);
  return <g className="avatar-rig" style={{ transformOrigin:'180px 165px', transform:`translate(${pose.x*65}px,${-pose.y*65}px) rotate(${pose.roll*180/Math.PI}deg)` }}>
    {children}
    <g className="avatar-face" data-mouth={face.mouth.kind} transform="translate(100 116) scale(.8)" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {face.eyes.map((eye,i)=><g key={i} className="avatar-eye" data-eye={eye.kind} transform={`translate(${eye.x} ${eye.y}) scale(1 ${eye.scaleY})`}><path d={eye.d} fill={eye.fill?'currentColor':'none'} stroke={eye.fill?'none':'currentColor'} strokeWidth={eye.width}/></g>)}
      <path className="avatar-mouth" d={face.mouth.d} fill={face.mouth.fill?'currentColor':'none'} stroke={face.mouth.fill?'none':'currentColor'} strokeWidth={face.mouth.width}/>
    </g>
  </g>;
}
