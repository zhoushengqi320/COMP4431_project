import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { states } from './state';
import { drawFace, faceFrame, motionFrame } from './expressions';

// Three curved, closed shell pieces built locally; no remote model or texture assets.
function shellGeometry() {
  const positions = [], indices = [], rows = 28, cols = 40;
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i <= rows; i++) {
      const v = i / rows;
      for (let j = 0; j <= cols; j++) {
        const u = j / cols * 2 - 1;
        const theta = .64 + Math.pow(Math.abs(u), 1.7) * .38 + v * (1.24 - Math.abs(u) * .31);
        const phi = u * .87;
        const r = layer ? 1.14 : 1.22;
        positions.push(r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta));
      }
    }
  }
  const size = (rows + 1) * (cols + 1);
  for (let l = 0; l < 2; l++) for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = l * size + i * (cols + 1) + j, b = a + cols + 1;
    indices.push(...(l ? [a,b,a+1,b,b+1,a+1] : [a,a+1,b,b,a+1,b+1]));
  }
  const bridge = (a,b) => indices.push(a,b,a+size,b,b+size,a+size);
  for (let j = 0; j < cols; j++) { bridge(j,j+1); bridge(rows*(cols+1)+j+1,rows*(cols+1)+j); }
  for (let i = 0; i < rows; i++) { bridge((i+1)*(cols+1),i*(cols+1)); bridge(i*(cols+1)+cols,(i+1)*(cols+1)+cols); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function pearShape(scale = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, .14 * scale);
  s.bezierCurveTo(-.06*scale,.15*scale,-.04*scale,.04*scale,-.1*scale,-.025*scale);
  s.bezierCurveTo(-.2*scale,-.17*scale,-.07*scale,-.23*scale,0,-.2*scale);
  s.bezierCurveTo(.09*scale,-.23*scale,.2*scale,-.14*scale,.1*scale,-.025*scale);
  s.bezierCurveTo(.04*scale,.04*scale,.06*scale,.15*scale,0,.14*scale);
  return s;
}

export function createAvatarScene(host, { onFailure, onInteract, initialState = 'idle', motion = true }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D Pear companion. Drag or use arrow keys to rotate. Enter to say hello.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.tabIndex = 0;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 40);
  camera.position.set(0, .05, 5.9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xf4fff4, 0x7e8792, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3.5); light.position.set(-3, 4, 4); scene.add(light);
  const rim = new THREE.DirectionalLight(0xd9f2fa, 2); rim.position.set(4, 1, 2); scene.add(rim);
  const robot = new THREE.Group(); scene.add(robot);
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xd2d8dc, metalness: .92, roughness: .28, clearcoat: .3, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x07100c, metalness: .05, roughness: .28, clearcoat: .35, clearcoatRoughness: .3, envMapIntensity: .2 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(.93, 64, 40), glass); robot.add(core);
  const lamp = new THREE.MeshStandardMaterial({ color: '#b9ef88', emissive: '#b9ef88', emissiveIntensity: 1.3, roughness: .4 });
  const faceCanvas = document.createElement('canvas'); faceCanvas.width=600; faceCanvas.height=420;
  const faceContext = faceCanvas.getContext('2d');
  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  const facePositions=[], faceUV=[], faceIndices=[], segments=32;
  for(let row=0;row<=segments;row++)for(let col=0;col<=segments;col++){
    const u=col/segments,v=row/segments,x=(u-.5)*1.34,y=(.5-v)*.94;
    facePositions.push(x,y,Math.sqrt(.946*.946-x*x-y*y)); faceUV.push(u,1-v);
  }
  for(let row=0;row<segments;row++)for(let col=0;col<segments;col++){
    const a=row*(segments+1)+col,b=a+segments+1;faceIndices.push(a,b,a+1,b,b+1,a+1);
  }
  const faceGeometry=new THREE.BufferGeometry();
  faceGeometry.setAttribute('position',new THREE.Float32BufferAttribute(facePositions,3));
  faceGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(faceUV,2));faceGeometry.setIndex(faceIndices);faceGeometry.computeVertexNormals();
  const faceMaterial=new THREE.MeshBasicMaterial({map:faceTexture,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const faceSurface=new THREE.Mesh(faceGeometry,faceMaterial);robot.add(faceSurface);
  const petals = [];
  const geometry = shellGeometry();
  [Math.PI / 2 + .15, Math.PI * 7/6 + .15, -Math.PI/6 + .15].forEach((angle, index) => {
    const pivot = new THREE.Group(); pivot.rotation.z = angle;
    const shell = new THREE.Mesh(geometry, metal); pivot.add(shell);
    const points = [];
    for (let j=0; j<=32; j++) {
      const u = -.55 + j/32 * 1.1, theta = .64 + Math.pow(Math.abs(u),1.7)*.38;
      points.push(new THREE.Vector3(1.225*Math.sin(theta)*Math.cos(u*.87), 1.225*Math.sin(theta)*Math.sin(u*.87), 1.225*Math.cos(theta)));
    }
    const strip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, .014, 6, false), lamp); pivot.add(strip);
    if (index === 2) {
      const badge = new THREE.Group();
      badge.position.set(.99, 0, .78); badge.rotation.y = .85; badge.rotation.z = -angle;
      const gold = new THREE.MeshStandardMaterial({ color: 0xd7b968, metalness: .85, roughness: .23, side: THREE.DoubleSide });
      const outline = pearShape(); outline.holes.push(pearShape(.77));
      const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: .012, bevelEnabled: false, curveSegments: 20 }), gold);
      badge.add(frame);
      const inset = new THREE.Mesh(new THREE.ShapeGeometry(pearShape(.73)), new THREE.MeshPhysicalMaterial({ color: 0xb6d899, metalness: .1, roughness: .2, clearcoat: 1 })); inset.position.z = .005; badge.add(inset);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.08,8), gold); stem.position.set(.012,.17,.01); stem.rotation.z = -.2; badge.add(stem);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(.035,12,8), gold); leaf.scale.set(1.5,.55,.2); leaf.position.set(.055,.17,.012); leaf.rotation.z = .4; badge.add(leaf);
      badge.scale.setScalar(.46); pivot.add(badge);
    }
    robot.add(pivot); petals.push({ pivot, angle });
  });
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width=128; shadowCanvas.height=128;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,0,64,64,64); gradient.addColorStop(0,'rgba(28,48,36,.22)'); gradient.addColorStop(1,'rgba(28,48,36,0)'); ctx.fillStyle=gradient; ctx.fillRect(0,0,128,128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3,.35), new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false})); shadow.position.set(0,-1.42,-.2); scene.add(shadow);
  let state=initialState, animate=motion, disposed=false, visible=true, dragging=false, lastX=0, lastY=0, moved=0, yaw=-.15, pitch=.08;
  let canDraw = false;
  const resize = () => { const {width,height}=host.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width,height); camera.aspect=width/height; camera.updateProjectionMatrix(); if (canDraw && !animate) render(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const canvas=renderer.domElement;
  const down=e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;moved=0;canvas.setPointerCapture(e.pointerId);};
  const move=e=>{if(!dragging)return; const dx=e.clientX-lastX,dy=e.clientY-lastY; moved+=Math.abs(dx)+Math.abs(dy);yaw+=dx*.008;pitch=THREE.MathUtils.clamp(pitch+dy*.006,-.5,.5);lastX=e.clientX;lastY=e.clientY;};
  const up=e=>{if(!dragging)return;dragging=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(moved<6)onInteract?.();};
  const cancel=()=>{dragging=false;};
  const key=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;else if(e.key==='ArrowRight')yaw+=.12;else if(e.key==='ArrowUp')pitch=Math.max(-.5,pitch-.1);else if(e.key==='ArrowDown')pitch=Math.min(.5,pitch+.1);else onInteract?.();render();};
  const lost=e=>{e.preventDefault();stopLoop();onFailure?.();};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('keydown',key);canvas.addEventListener('webglcontextlost',lost);
  const start = performance.now();
  let stateStarted = start, gaze = {}, activityKey = 0, lastFaceDraw = -Infinity, forceFace = true;
  function render(now=performance.now()) {
    if(disposed)return;
    const clock=(now-start)/1000, elapsed=Math.max(0,(now-stateStarted)/1000);
    const pose=motionFrame(state,elapsed,clock,gaze,animate);
    const color=states[state]?.color || states.idle.color;
    lamp.color.set(color);lamp.emissive.set(color);
    robot.position.set(pose.x,pose.y,0);
    robot.rotation.set(pitch+pose.nod,yaw+pose.yaw,pose.roll);
    if(forceFace || now-lastFaceDraw>65){
      drawFace(faceContext,faceFrame({state,elapsed,clock,motion:animate,gaze}),color);
      faceTexture.needsUpdate=true;lastFaceDraw=now;forceFace=false;
    }
    const isThinking=['thinking','transcribing','connecting','preparing'].includes(state);
    petals.forEach(({pivot,angle},i)=>{
      const spread=pose.spread+(animate?Math.sin(clock*1.1+i*2.1)*.009:0);
      pivot.position.set(Math.cos(angle)*spread,Math.sin(angle)*spread,0);
      pivot.rotation.z=angle+(isThinking&&animate?Math.sin(clock*1.1)*.045:0);
    });
    renderer.render(scene,camera);
  }
  function stopLoop(){renderer.setAnimationLoop(null);}
  function updateLoop(){stopLoop();if(!visible||document.hidden||disposed)return;if(animate)renderer.setAnimationLoop(render);else render();}
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;updateLoop();});intersection.observe(host);
  const pageVisibility=()=>updateLoop();document.addEventListener('visibilitychange',pageVisibility);
  // Pointer movement must still render when motion is disabled.
  const redraw=()=>{if(!animate)render();};canvas.addEventListener('pointermove',redraw);
  canDraw = true; updateLoop();
  return {
    update(nextState,nextMotion,nextGaze={},nextActivityKey=0){
      if(nextState!==state || nextActivityKey!==activityKey)stateStarted=performance.now();
      const loopChanged=animate!==nextMotion;
      state=nextState;animate=nextMotion;gaze=nextGaze;activityKey=nextActivityKey;forceFace=true;
      if(loopChanged)updateLoop();else if(!animate&&visible&&!document.hidden)render();
    },
    reset(){yaw=-.15;pitch=.08;render();},
    dispose(){disposed=true;stopLoop();observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',pageVisibility);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointermove',redraw);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);
      const geometries=new Set(),materials=new Set();scene.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);if(obj.material)materials.add(obj.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());shadowTexture.dispose();faceTexture.dispose();environment.dispose();renderer.dispose();canvas.remove();
    }
  };
}
