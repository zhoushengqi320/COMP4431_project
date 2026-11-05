import test from 'node:test';
import assert from 'node:assert/strict';
import { faceFrame, motionFrame, interactionReaction } from '../src/avatar/expressions.js';

test('greeting keeps both happy eyes; playful and pretend-pout coordinate eyes and mouth',()=>{
  const hello=faceFrame({state:'greeting',clock:6});
  assert.deepEqual(hello.eyes.map(e=>e.kind),['happy','happy']);
  assert.equal(hello.mouth.kind,'cat');
  const playful=faceFrame({state:'playful'});
  assert.deepEqual(playful.eyes.map(e=>e.kind),['squintLeft','squintRight']);
  assert.equal(playful.mouth.kind,'cat');
  assert.equal(faceFrame({state:'pout'}).mouth.kind,'pout');
});
test('stylized speech includes varied mouth shapes and closed rests rather than a periodic circle',()=>{
  const shapes=new Set(Array.from({length:40},(_,i)=>faceFrame({state:'speaking',elapsed:i*.05}).mouth.kind));
  assert.ok(shapes.size>=5);
  assert.ok(shapes.has('smile'));
  assert.ok(shapes.has('talk'));
  assert.equal(faceFrame({state:'paused'}).mouth.kind,'flat');
  assert.equal(faceFrame({state:'idle'}).mouth.kind,'smile');
});
test('nearby clicks escalate playfully and a later click starts a fresh greeting',()=>{
  const a=interactionReaction(10000),b=interactionReaction(10500,a),c=interactionReaction(11000,b);
  assert.deepEqual([a.state,b.state,c.state],['greeting','playful','pout']);
  assert.equal(interactionReaction(14000,c).state,'greeting');
});
test('reduced motion freezes speaking and blinking, and disables all body motion',()=>{
  assert.deepEqual(faceFrame({state:'speaking',motion:false,elapsed:1,clock:6}),faceFrame({state:'speaking',motion:false,elapsed:300,clock:99}));
  for(const state of ['greeting','speaking','playful','pout','curious'])assert.deepEqual(motionFrame(state,1,20,{x:1,y:1},false),{x:0,y:0,roll:0,yaw:0,nod:0,spread:0});
});
test('gaze is bounded, malformed input stays finite, and greeting jiggle decays',()=>{
  const near=faceFrame({gaze:{x:1,y:-1}}),far=faceFrame({gaze:{x:999,y:-999}});
  assert.deepEqual(near,far);
  const invalid=faceFrame({gaze:{x:NaN,y:Infinity}});
  invalid.eyes.forEach(e=>{assert.ok(Number.isFinite(e.x));assert.ok(Number.isFinite(e.y));});
  assert.equal(motionFrame('greeting',3,0).roll,0);
});
