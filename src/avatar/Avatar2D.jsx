import React, { useId } from 'react';
import Face2D from './Face2D';

export default function Avatar2D({ state = 'idle', motion = true, gaze = {}, activityKey = 0 }) {
  const id = useId().replace(/:/g, '');
  const metal = `metal-${id}`, glass = `glass-${id}`;
  return <svg className={`pear-avatar-svg avatar-${state}`} viewBox="0 0 360 340" aria-hidden="true">
    <defs>
      <linearGradient id={metal} x1="0" y1="0" x2=".9" y2="1"><stop stopColor="#fafbfc"/><stop offset=".26" stopColor="#c7cdd1"/><stop offset=".5" stopColor="#f4f6f7"/><stop offset=".77" stopColor="#9da6af"/><stop offset="1" stopColor="#dfe4e7"/></linearGradient>
      <radialGradient id={glass} cx=".3" cy=".2" r=".9"><stop stopColor="#35423d"/><stop offset=".4" stopColor="#111c19"/><stop offset="1" stopColor="#040c0a"/></radialGradient>
    </defs>
    <ellipse className="avatar-shadow" cx="180" cy="299" rx="66" ry="9" fill="#182b27" opacity=".12"/>
    <Face2D state={state} motion={motion} gaze={gaze} activityKey={activityKey}>
      <circle cx="180" cy="165" r="86" fill={`url(#${glass})`} stroke="#5e7168" strokeWidth="1"/>
      <path d="M121 116 Q142 83 180 88 Q213 94 204 105 Q157 98 137 133Z" fill="#fff" opacity=".11"/>
      <g className="avatar-shell shell-top">
        <path d="M91 133 C91 67 156 35 211 50 C248 59 275 82 272 101 C247 119 232 110 206 97 C165 76 127 103 91 133Z" fill={`url(#${metal})`} stroke="#adb7bd" strokeWidth="1"/>
        <path d="M194 91 Q229 103 257 99" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        <path d="M100 120 Q151 63 207 64" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".8"/>
      </g>
      <g className="avatar-shell shell-left">
        <path d="M96 188 C74 171 62 178 69 218 C77 268 127 291 180 278 C200 270 207 254 193 248 C147 240 118 228 96 188Z" fill={`url(#${metal})`} stroke="#adb7bd" strokeWidth="1"/>
        <path d="M82 190 Q89 216 107 228" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
      </g>
      <g className="avatar-shell shell-right">
        <path d="M259 124 C272 106 286 132 290 164 C301 217 262 265 217 273 C202 273 207 257 221 238 C247 207 256 165 259 124Z" fill={`url(#${metal})`} stroke="#adb7bd" strokeWidth="1"/>
        <path d="M254 218 Q244 242 225 253" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        <g transform="translate(268 211) rotate(18) scale(.65)">
          <path d="M0 -10 C-3 -10 -3 -3 -6 1 C-14 13 -5 18 0 17 C6 18 14 12 6 1 C3 -3 3 -10 0 -10Z" fill="#b4d4a5" fillOpacity=".65" stroke="#b99b52" strokeWidth="2"/>
          <path d="M0 -10 L1 -15 M1 -13 Q8 -19 10 -13 Q6 -10 1 -13" fill="none" stroke="#b99b52" strokeWidth="1.7"/>
        </g>
      </g>
    </Face2D>
  </svg>;
}
