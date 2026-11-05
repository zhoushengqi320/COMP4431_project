import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { states } from './state';

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
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: states.idle.color, toneMapped: false });
  const lamp = new THREE.MeshStandardMaterial({ color: '#b9ef88', emissive: '#b9ef88', emissiveIntensity: 1.3, roughness: .4 });
  const eyeGroups = [];
  const happyEyes = [];
  [-1, 1].forEach(side => {
    const eye = new THREE.Group();
    eye.position.set(side * .29, .09, .94);
    eye.rotation.y = side * .28;
    [-1,1].forEach(y => [-1,1].forEach(x => {
      const pixel = new THREE.Mesh(new THREE.BoxGeometry(.105, .105, .018), eyeMaterial);
      pixel.position.set(x * .068, y * .068, 0); eye.add(pixel);
    }));
    robot.add(eye); eyeGroups.push(eye);
    const happy = new THREE.Group(); happy.position.copy(eye.position); happy.rotation.copy(eye.rotation);
    const points = [new THREE.Vector3(-.12,-.035,0),new THREE.Vector3(0,.085,0),new THREE.Vector3(.12,-.035,0)];
    for (let i=0;i<2;i++) happy.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(points[i],points[i+1]),1,.018,8,false),eyeMaterial));
    happy.visible = false; robot.add(happy); happyEyes.push(happy);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.068,.014,8,32),eyeMaterial);
  mouth.position.set(0,-.27,.925); mouth.visible=false; robot.add(mouth);
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
  let start = performance.now();
  let stateStarted = start;
  function render(now=performance.now()) {
    if(disposed)return;
    const t=animate?(now-start)/1000:0;
    const elapsed = Math.max(0,(now-stateStarted)/1000);
    const greeting = state === 'greeting';
    const jiggle = animate && greeting && elapsed < .65 ? Math.sin(elapsed*32)*.045*(1-elapsed/.65) : 0;
    const isThinking=['thinking','transcribing','connecting','preparing'].includes(state);
    const color=states[state]?.color || states.idle.color; eyeMaterial.color.set(color);lamp.color.set(color);lamp.emissive.set(color);
    robot.position.y=animate?Math.sin(t*1.7)*.065:0;
    robot.rotation.set(pitch+(animate?Math.sin(t*.7)*.025:0),yaw+(jiggle*.3),(animate?Math.sin(t*.8)*.025:0)+jiggle);
    const blink=animate && t%4.7>4.52 ? .12:1;
    eyeGroups.forEach((eye,i)=>{eye.visible=!greeting;eye.scale.y=blink*(state==='paused'?.4:1);eye.rotation.z=state==='error'?(i===0?-.2:.2):0;eye.position.y=.09+(isThinking&&animate?Math.sin(t*2.4+i*.7)*.04:0);});
    happyEyes.forEach(eye=>{eye.visible=greeting;});
    mouth.visible=state==='speaking';
    mouth.scale.y=animate?.3+Math.abs(Math.sin(elapsed*9))*.9:.8;
    petals.forEach(({pivot,angle},i)=>{
      const spread=(state==='listening'?.1:state==='greeting'?.14:state==='speaking'?.04:0)+(animate?Math.sin(t*1.3+i*2.1)*.015:0);
      pivot.position.set(Math.cos(angle)*spread,Math.sin(angle)*spread,0);
      pivot.rotation.z=angle+(isThinking&&animate?Math.sin(t*1.2)*.09:0);
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
    update(nextState,nextMotion){if(nextState!==state)stateStarted=performance.now();state=nextState;animate=nextMotion;updateLoop();},
    reset(){yaw=-.15;pitch=.08;render();},
    dispose(){disposed=true;stopLoop();observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',pageVisibility);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointermove',redraw);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);
      const geometries=new Set(),materials=new Set();scene.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);if(obj.material)materials.add(obj.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());shadowTexture.dispose();environment.dispose();renderer.dispose();canvas.remove();
    }
  };
}
