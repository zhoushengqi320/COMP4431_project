// A small shared face rig, in a 200 x 140 coordinate space. SVG and WebGL use
// these exact paths, so expressions stay consistent without remote assets.
const roundedEye = 'M-8 -5 Q-8 -13 0 -13 Q8 -13 8 -5 L8 5 Q8 13 0 13 Q-8 13 -8 5Z';
const eyeShapes = {
  open: { d: roundedEye, fill: true },
  happy: { d: 'M-11 4 Q-5 -6 0 -9 Q5 -6 11 4', width: 3.7 },
  wink: { d: 'M-10 0 Q0 4 10 0', width: 3.5 },
  squintLeft: { d: 'M-10 -9 L2 0 L-10 9', width: 3.5 },
  squintRight: { d: 'M10 -9 L-2 0 L10 9', width: 3.5 },
  half: { d: 'M-10 -3 L10 -3 L10 1 Q9 8 0 8 Q-9 8 -10 1Z', fill: true },
  sleepy: { d: 'M-10 0 L10 0', width: 3.4 },
  round: { d: 'M0 -11 A9 11 0 1 1 0 11 A9 11 0 1 1 0 -11', width: 3 }
};
const mouths = {
  smile: { d: 'M93 90 Q100 96 107 90', width: 2.5 },
  cat: { d: 'M91 90 Q93 99 100 92 Q107 99 109 90', width: 2.5 },
  flat: { d: 'M95 93 L105 93', width: 2.5 },
  pout: { d: 'M94 95 Q100 89 106 95', width: 2.5 },
  small: { d: 'M95 91 Q100 93 105 91 Q104 99 100 99 Q96 99 95 91Z', fill: true },
  talk: { d: 'M92 90 Q100 93 108 90 Q107 101 100 102 Q93 101 92 90Z', width: 2.5 },
  wide: { d: 'M90 89 Q100 92 110 89 L105 100 Q100 104 95 100Z', width: 2.5 }
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
export function interactionReaction(now, previous = { time: -Infinity, count: 0 }) {
  const count = now - previous.time < 1800 ? previous.count + 1 : 1;
  return { time: now, count, state: count >= 3 ? 'pout' : count === 2 ? 'playful' : 'greeting' };
}

export function faceFrame({ state = 'idle', elapsed = 0, clock = 0, motion = true, gaze = {} } = {}) {
  const t = motion ? Math.max(0, elapsed) : 0;
  const x = clamp(gaze.x, -1, 1) * 4.5, y = clamp(gaze.y, -1, 1) * 2.8;
  let left = 'open', right = 'open', mouth = 'smile', lx = x, rx = x, ly = y, ry = y, ls = 1, rs = 1;
  const thinking = ['thinking','transcribing','connecting','preparing'].includes(state);
  if (state === 'greeting') { left = right = 'happy'; mouth = 'cat'; }
  else if (state === 'playful') { left = 'squintLeft'; right = 'squintRight'; mouth = 'cat'; }
  else if (state === 'pout') { left = right = 'half'; mouth = 'pout'; lx = rx = -5; ly = ry = 1; }
  else if (state === 'sleepy' || state === 'paused') { left = right = 'sleepy'; mouth = 'flat'; }
  else if (state === 'curious') { ls = .78; rs = 1.12; lx = rx = 5; ly = -2; ry = -4; mouth = 'small'; }
  else if (thinking) { left = 'half'; right = 'open'; ls = 1; rs = .8; lx = rx = 4; ly = -2; ry = -5; mouth = 'pout'; }
  else if (state === 'listening') { ls = .95; rs = 1.08; ly -= 2; ry -= 3; mouth = 'smile'; }
  else if (state === 'error') { left = 'round'; right = 'half'; mouth = 'flat'; }
  else if (state === 'speaking') {
    // Uneven phrase-like beats, with closed smiles between syllable groups.
    // These are stylized speaking gestures, not audio amplitude/phoneme analysis.
    const beat = t % 1.73;
    mouth = !motion ? 'talk' : beat < .17 ? 'smile' : beat < .35 ? 'small' : beat < .52 ? 'talk' : beat < .66 ? 'smile' : beat < .83 ? 'wide' : beat < 1.01 ? 'small' : beat < 1.18 ? 'talk' : beat < 1.4 ? 'cat' : 'smile';
    if (motion && t % 5.3 > 3.8 && t % 5.3 < 4.6) left = right = 'happy';
    ly += motion ? Math.sin(t * 3.1) * .9 : 0; ry = ly;
  }
  // Natural double blinks are not synchronized with every shell movement.
  const blinkTime = Math.max(0, clock) % 6.7;
  const blink = motion && (blinkTime > 5.92 && blinkTime < 6.06 || blinkTime > 6.22 && blinkTime < 6.31);
  if (blink && !['greeting','playful','sleepy','paused'].includes(state)) { ls *= .08; rs *= .08; }
  const eyes = [
    { ...eyeShapes[left], x: 64 + lx, y: 51 + ly, scaleY: ls, kind: left },
    { ...eyeShapes[right], x: 136 + rx, y: 51 + ry, scaleY: rs, kind: right }
  ];
  return { eyes, mouth: { ...mouths[mouth], kind: mouth }, mood: state };
}

export function motionFrame(state, elapsed, clock, gaze = {}, motion = true) {
  if (!motion) return { x: 0, y: 0, roll: 0, yaw: 0, nod: 0, spread: 0 };
  const t = Math.max(0, elapsed), cx = clamp(gaze.x,-1,1), cy = clamp(gaze.y,-1,1);
  let x = 0, y = Math.sin(clock * 1.4) * .035, roll = Math.sin(clock * .7) * .014, yaw = cx * .1, nod = cy * .045, spread = 0;
  if (state === 'greeting') { roll += t < .7 ? Math.sin(t * 29) * .045 * (1-t/.7) : 0; spread = .065; }
  if (state === 'playful') { y += Math.sin(Math.min(t,1.2)/1.2*Math.PI)*.12; roll += Math.sin(t*6)*.045*Math.max(0,1-t/2); spread = .09; }
  if (state === 'pout') { yaw -= .18; roll -= .045; spread = -.035; }
  if (state === 'curious') { roll += .09; yaw += .07; y += .035; spread = .07; }
  if (state === 'sleepy') { nod += .07; y -= .025; spread = -.025; }
  if (state === 'listening') { roll += .045; nod -= .04; spread = .08; }
  if (state === 'speaking') { nod += Math.sin(t*3.1)*.018; spread = .025 + Math.sin(t*2.7)*.012; }
  return { x, y, roll, yaw, nod, spread };
}

export function drawFace(context, frame, color) {
  const { canvas } = context;
  context.clearRect(0,0,canvas.width,canvas.height);
  context.save(); context.scale(canvas.width/200, canvas.height/140);
  context.fillStyle = color; context.strokeStyle = color;
  context.lineCap = 'round'; context.lineJoin = 'round';
  function draw(part) {
    const path = new Path2D(part.d);
    if (part.fill) context.fill(path);
    else { context.lineWidth = part.width || 3; context.stroke(path); }
  }
  frame.eyes.forEach(eye => { context.save(); context.translate(eye.x,eye.y); context.scale(1,eye.scaleY); draw(eye); context.restore(); });
  draw(frame.mouth);
  context.restore();
}
