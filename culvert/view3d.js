/* 3D culvert crossing, drawn as high-detail isometric pixel art.
   The scene is the computed geometry (barrels, slope, headwater, tailwater, headwalls).
   It renders at half resolution with nearest-neighbor upscaling, a limited palette,
   stepped lighting and a 1px outline. three.js is imported on first use.
   Vertical exaggeration defaults to 2. Wall thickness is a visual shell, not a pipe standard. */
(function(){
const cardId='isocard';
let THREE=null, renderer, scene, camera, world, sun, raf=0;
 let theta=0.82, phi=1.02, radius=120, target=null, userMoved=false;
let vex=2, showLines=true, presetName='iso', span=80;
let latest=null, booting=false, failed=false, built=false, lastBox=null;
let zOfW=e=>e, live=null, labelPts=[], inletAim=null;
let drag=null, rt=null, composeScene=null, composeCam=null, composeMat=null, waterMap=null, sparkles=[];

function el(html){const d=document.createElement('div');d.innerHTML=html;return d.firstElementChild;}
function card(anchor){
 let host=document.getElementById(cardId);
 if(host)return host;
 host=el(`<div class="card" id="${cardId}"><h3>3D crossing <small>(orbit, scroll to zoom, right-drag to pan)</small></h3>
  <div id="v3bar">
   <button type="button" data-v3="iso">Isometric</button>
   <button type="button" data-v3="upstream">Upstream</button>
   <button type="button" data-v3="plan">Plan</button>
   <button type="button" data-v3="profile">Profile</button>
   <button type="button" data-v3="reset">Reset</button>
   <label>Vertical exaggeration <input id="v3ex" type="range" min="1" max="6" step="0.5" value="2"> <b id="v3exl">2×</b></label>
   <label><input id="v3lines" type="checkbox" checked> HGL / EGL</label>
  </div>
  <div id="v3wrap"><div id="v3fallback">Loading 3D model…</div><svg id="v3leaders"></svg><div id="v3labels"></div><div id="v3note" hidden></div></div></div>`);
 anchor.after(host);
 host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!b.dataset.v3)return;const k=b.dataset.v3;
  if(k==='reset'){vex=2;showLines=true;const s=document.getElementById('v3ex');if(s)s.value='2';const c=document.getElementById('v3lines');if(c)c.checked=true;document.getElementById('v3exl').textContent='2×';applyPreset('iso');if(latest)rebuild(latest);}
  else {presetName=k;userMoved=false;if(latest&&THREE)rebuild(latest);else applyPreset(k);}});
 host.addEventListener('input',e=>{
  if(e.target.id==='v3ex'){vex=+e.target.value||1;document.getElementById('v3exl').textContent=vex+'×';if(latest)rebuild(latest);}
  if(e.target.id==='v3lines'){showLines=e.target.checked;if(latest)rebuild(latest);}
 });
 return host;
}
function showFallback(msg){failed=true;const w=document.getElementById('v3wrap');if(!w)return;
 w.innerHTML=`<div id="v3fallback">3D view needs WebGL, which is not available here. The profile above is still drawn to the computed elevations. ${msg?('('+msg+')'):''}</div>`;}

function endKind(p){const id=(p.inlet&&p.inlet.id)||'', name=(p.inlet&&p.inlet.name)||'';
 if(/mit/.test(id)||/miter/i.test(name))return 'miter';
 if(/_pr|project/i.test(id)||/project/i.test(name))return 'project';
 return 'headwall';}
function metalOf(p){return p.material==='cmp'||p.material==='spiral'||/^(m_|hyc_)/.test((p.inlet&&p.inlet.id)||'')&&/cmp|metal|corrug/i.test((p.inlet&&p.inlet.name)||'');}
function wallOf(D,metal){return metal?Math.max(0.16,Math.min(0.45,D/14)):Math.max(0.25,Math.min(0.7,D/12));}

function barrelsOf(data){
 const p=data.p,r=data.r,L=p.length;
 if(r.crossing&&r.crossing.parts&&r.crossing.parts.length){
  return r.crossing.parts.map((pt,i)=>{
   const ex=i===0?null:(state.extras||[])[i-1];
   const shape=i===0?p.shape:(ex&&ex.shape)||'circular';
   const rr=pt.r||r;
   const len=i===0?L:+(ex&&ex.length)||L;
   const invIn=i===0?p.invIn:+(ex&&ex.invIn);
   const invOut=i===0?p.invOut:+(ex&&ex.invOut);
   return {shape,section:i===0?p.section:null,B:rr.B|| (shape==='box'?+(ex&&ex.span):+(ex&&ex.rise)),D:rr.D,length:len,invIn,invOut,profile:(rr.profile||r.profile),hgl:i===0?r.hgl:null};
  });
 }
 const N=Math.max(1,r.N||1);
 return Array.from({length:N},()=>({shape:p.shape,section:p.section,B:r.B,D:r.D,length:L,invIn:p.invIn,invOut:p.invOut,profile:r.profile,hgl:r.hgl}));
}

function pixelTex(w,h,draw,rx,ry){
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const g=c.getContext('2d');g.imageSmoothingEnabled=false;draw(g,w,h);
 const t=new THREE.CanvasTexture(c);
 t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;
 t.colorSpace=THREE.SRGBColorSpace;
 if(rx)t.repeat.set(rx,ry||rx);
 return t;
}
function shade(color,map){
 const m=new THREE.MeshToonMaterial({color,map:map||null,gradientMap:liveGrad(),side:THREE.DoubleSide});
 return m;
}
let gradTex=null;
function liveGrad(){
 if(gradTex)return gradTex;
 const c=document.createElement('canvas');c.width=3;c.height=1;
 const g=c.getContext('2d');
 ['#a3a3a3','#d4d4d4','#ffffff'].forEach((col,i)=>{g.fillStyle=col;g.fillRect(i,0,1,1);});
 gradTex=new THREE.CanvasTexture(c);
 gradTex.magFilter=THREE.NearestFilter;gradTex.minFilter=THREE.NearestFilter;gradTex.generateMipmaps=false;
 return gradTex;
}
function materials(){
 const grass=pixelTex(32,32,(g,w,h)=>{
  const cols=['#6fbf52','#5aaa42','#7dcc5c','#4b9836','#8ed468','#c6a56e'];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){g.fillStyle=cols[(x*3+y*5)%5];g.fillRect(x,y,1,1);}
  g.fillStyle='#9adf72';
  [[2,5],[9,14],[16,4],[23,20],[28,9],[6,24],[19,27],[12,8]].forEach(([x,y])=>{g.fillRect(x,y,1,3);g.fillRect(x+1,y+1,1,2);});
  g.fillStyle='#c6a56e';g.fillRect(14,11,3,2);g.fillRect(4,18,2,2);
 });
 const peb=pixelTex(24,24,(g,w,h)=>{
  g.fillStyle='#c4a06a';g.fillRect(0,0,w,h);
  const stones=[[1,2,4,3,'#8d7352'],[7,1,5,3,'#e6d2a4'],[14,3,4,3,'#6e5538'],[3,8,5,4,'#dfc48a'],[11,9,6,4,'#a48458'],[18,8,4,3,'#f0ddb4'],[2,16,4,3,'#7a6244'],[9,16,5,4,'#d2b48a'],[16,15,5,4,'#5c4630']];
  stones.forEach(([x,y,w0,h0,col])=>{g.fillStyle='#3a2c1c';g.fillRect(x,y,w0,h0);g.fillStyle=col;g.fillRect(x,y,w0-1,Math.max(1,h0-1));});
 });
 const bank=pixelTex(24,24,(g,w,h)=>{
  g.fillStyle='#b88848';g.fillRect(0,0,w,h);
  g.fillStyle='#6fbf52';
  for(let x=0;x<w;x+=3)g.fillRect(x,0,1,4);
  g.fillStyle='#dfc48a';g.fillRect(2,10,3,2);g.fillRect(12,16,4,2);g.fillRect(8,6,2,2);
 });
 const blocks=pixelTex(32,32,(g,w,h)=>{
  g.fillStyle='#e4dcc8';g.fillRect(0,0,w,h);
  g.fillStyle='#b7ad98';
  for(let y=0;y<h;y+=8)g.fillRect(0,y,w,1);
  for(let row=0;row<4;row++){const off=row%2?8:0;for(let x=off;x<w;x+=16)g.fillRect(x,row*8,1,8);}
  g.fillStyle='#f4efe4';
  for(let y=1;y<h;y+=8)g.fillRect(0,y,w,1);
  g.fillStyle='#8f8674';g.fillRect(3,3,2,2);g.fillRect(19,12,2,2);g.fillRect(10,20,3,1);
 });
 const metal=pixelTex(8,8,(g,w,h)=>{
  for(let y=0;y<h;y++)g.fillStyle=y%2?'#e7eef2':'#5d6e7c',g.fillRect(0,y,w,1);
 },2,8);
 const rock=pixelTex(24,24,(g,w,h)=>{
  g.fillStyle='#6a5e52';g.fillRect(0,0,w,h);
  [[1,1,7,5,'#a89884'],[10,2,6,4,'#4a4038'],[3,9,8,5,'#d2c2ac'],[14,8,7,6,'#7c6e60'],[2,16,6,5,'#3e342c'],[12,16,8,5,'#b5a48e']].forEach(([x,y,w0,h0,col])=>{
   g.fillStyle='#241c16';g.fillRect(x,y,w0,h0);g.fillStyle=col;g.fillRect(x,y,w0-1,h0-1);
  });
 });
 const asphalt=pixelTex(16,16,(g,w,h)=>{
  g.fillStyle='#3a4148';g.fillRect(0,0,w,h);
  g.fillStyle='#525a64';[[1,2],[6,5],[11,1],[4,9],[13,8],[8,13],[2,14]].forEach(([x,y])=>g.fillRect(x,y,1,1));
  g.fillStyle='#2a3036';[[3,4],[9,7],[12,12]].forEach(([x,y])=>g.fillRect(x,y,2,1));
 });
 const water=pixelTex(32,16,(g,w,h)=>{
  g.fillStyle='#2f8fbe';g.fillRect(0,0,w,h);
  g.fillStyle='#49aed4';g.fillRect(0,0,6,h);g.fillRect(14,0,5,h);g.fillRect(26,0,4,h);
  g.fillStyle='#e9f8ff';g.fillRect(2,3,2,2);g.fillRect(17,9,2,2);g.fillRect(28,5,1,1);
 },0.12,0.12);
 waterMap=water;
 const T=shade;
 const mats={
  grass:T(0xffffff,grass),
  slope:T(0xb7d98a,grass),
  dirt:T(0xffffff,bank),
  peb:T(0xffffff,peb),
  conc:T(0xffffff,blocks),
  head:T(0xffffff,blocks),
  metal:T(0xffffff,metal),
  rock:T(0xffffff,rock),
  asphalt:T(0xffffff,asphalt),
  water:new THREE.MeshToonMaterial({color:0xffffff,map:water,gradientMap:liveGrad(),transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide}),
  foam:T(0xe7f6ea),
  inner:new THREE.MeshToonMaterial({color:0x141c22,gradientMap:liveGrad(),side:THREE.BackSide}),
  ao:T(0x2a6a28),
  paint:T(0xf7f4ee),
  yellow:T(0xe6c84a),
  grad:liveGrad()
 };
 return mats;
}

function surfaceMesh(xs,ys,elev,skip){
 const pos=[],uv=[];
 for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){
  const pts=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([a,b])=>[xs[a],ys[b],elev[b][a]]);
  const tri=(a,b,c)=>{
   const cx=(a[0]+b[0]+c[0])/3,cy=(a[1]+b[1]+c[1])/3,cz=(a[2]+b[2]+c[2])/3;
   if(skip(cx,cy,cz))return;
   [a,b,c].forEach(p=>{pos.push(p[0],p[1],p[2]);uv.push(p[0]*0.04,p[1]*0.04);});
  };
  tri(pts[0],pts[1],pts[2]);tri(pts[0],pts[2],pts[3]);
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 g.computeVertexNormals();
 return g;
}

function label(text){
 const c=document.createElement('canvas');c.width=640;c.height=160;
 const g=c.getContext('2d');g.fillStyle='rgba(255,255,255,.92)';round(g,8,8,624,144,18);g.fill();
 g.fillStyle='#16324f';g.font='bold 64px sans-serif';g.textBaseline='middle';g.fillText(text,28,80);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));
 s.userData.label=1;return s;
}
function round(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}

function dispose(obj){obj.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=[].concat(o.material);ms.forEach(m=>{if(m.map)m.map.dispose();if(m.bumpMap)m.bumpMap.dispose();m.dispose();});}});}

const PALETTE=[[0.62,0.80,0.90],[0.45,0.68,0.82],[0.78,0.90,0.95],[0.20,0.38,0.16],[0.32,0.52,0.22],[0.48,0.68,0.28],[0.70,0.82,0.36],[0.36,0.22,0.12],[0.54,0.35,0.20],[0.74,0.58,0.38],[0.30,0.27,0.24],[0.50,0.45,0.39],[0.72,0.66,0.56],[0.62,0.59,0.54],[0.84,0.81,0.75],[0.42,0.39,0.35],[0.28,0.34,0.40],[0.52,0.60,0.66],[0.80,0.86,0.90],[0.14,0.16,0.18],[0.24,0.27,0.30],[0.93,0.93,0.90],[0.86,0.74,0.26],[0.08,0.26,0.40],[0.14,0.42,0.58],[0.45,0.75,0.86],[0.82,0.94,0.97],[0.09,0.07,0.06]];
function setupCompose(){
 composeMat=new THREE.ShaderMaterial({
  depthTest:false,depthWrite:false,
  uniforms:{tDiffuse:{value:null},texel:{value:new THREE.Vector2(1/320,1/180)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
  fragmentShader:`varying vec2 vUv;uniform sampler2D tDiffuse;uniform vec2 texel;
   float L(vec2 o){return dot(texture2D(tDiffuse,vUv+o*texel).rgb,vec3(0.299,0.587,0.114));}
   void main(){
    vec3 c=texture2D(tDiffuse,vUv).rgb;
    float gx=-L(vec2(-1.0,-1.0))-2.0*L(vec2(-1.0,0.0))-L(vec2(-1.0,1.0))+L(vec2(1.0,-1.0))+2.0*L(vec2(1.0,0.0))+L(vec2(1.0,1.0));
    float gy=-L(vec2(-1.0,-1.0))-2.0*L(vec2(0.0,-1.0))-L(vec2(1.0,-1.0))+L(vec2(-1.0,1.0))+2.0*L(vec2(0.0,1.0))+L(vec2(1.0,1.0));
    float e=step(1.15,length(vec2(gx,gy)));
    vec3 pick=mix(c,vec3(0.10,0.08,0.07),e);
    gl_FragColor=vec4(pick,1.0);
   }`
 });
 const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),composeMat);
 quad.frustumCulled=false;
 composeScene=new THREE.Scene();composeScene.add(quad);
 composeCam=new THREE.Camera();
}
function renderFrame(w,h){
 const wrap=document.getElementById('v3wrap');
 w=w||(wrap&&wrap.clientWidth)||640; h=h||(wrap&&wrap.clientHeight)||380;
 if(!renderer||!camera||!composeMat)return;
 const iw=Math.max(320,Math.min(480,Math.round(w*0.4))), ih=Math.max(180,Math.round(iw*h/Math.max(w,1)));
 renderer.setPixelRatio(1);renderer.setSize(w,h,false);
 camera.aspect=w/Math.max(h,1);
 look();
 if(!rt||rt.width!==iw||rt.height!==ih){
  if(rt)rt.dispose();
  rt=new THREE.WebGLRenderTarget(iw,ih,{depthBuffer:true});
  rt.texture.minFilter=THREE.NearestFilter;rt.texture.magFilter=THREE.NearestFilter;rt.texture.generateMipmaps=false;
  composeMat.uniforms.tDiffuse.value=rt.texture;
  composeMat.uniforms.texel.value.set(1/iw,1/ih);
 }
 renderer.setRenderTarget(rt);renderer.clear();renderer.render(scene,camera);
 renderer.setRenderTarget(null);renderer.clear();renderer.render(composeScene,composeCam);
}
function layoutLabels(w,h){
 if(!camera||!labelPts.length)return [];
 const out=[];
 labelPts.forEach(lb=>{
  const v=lb.pos.clone().project(camera);
  if(v.z<-1||v.z>1)return;
  const ax=(v.x*0.5+0.5)*w, ay=(-v.y*0.5+0.5)*h;
  if(ax<-80||ay<-80||ax>w+80||ay>h+80)return;
  const tw=Math.max(64,lb.text.length*7.6+14), th=20;
  let x=ax+16, y=ay-th-18;
  if(lb.text.indexOf('Road')===0){x=ax-tw*0.5;y=ay-th-22;}
  if(lb.text.indexOf('TW')===0){x=ax-tw-16;y=ay-th-12;}
  x=Math.max(4,Math.min(w-tw-4,x)); y=Math.max(4,Math.min(h-th-4,y));
  const box={x,y,w:tw,h:th,ax,ay,text:lb.text};
  if(out.some(o=>!(x+tw<o.x-4||o.x+o.w<x-4||y+th<o.y-4||o.y+o.h<y-4)))return;
  out.push(box);
 });
 return out;
}
function placeLabels(){
 const wrap=document.getElementById('v3wrap'); if(!wrap)return;
 const host=document.getElementById('v3labels'), svg=document.getElementById('v3leaders');
 if(!host||!svg)return;
 const w=wrap.clientWidth||1, h=wrap.clientHeight||1;
 const boxes=layoutLabels(w,h);
 host.innerHTML=boxes.map(b=>`<span style="left:${b.x|0}px;top:${b.y|0}px">${b.text}</span>`).join('');
 const lines=boxes.map(b=>{
  const cx=Math.max(b.x,Math.min(b.x+b.w,b.ax)), cy=Math.max(b.y,Math.min(b.y+b.h,b.ay));
  return `<line x1="${b.ax.toFixed(1)}" y1="${b.ay.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#1b2430" stroke-width="1"/>`;
 }).join('');
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 svg.innerHTML=lines;
}
function boot(){
 if(THREE||booting||failed)return;
 booting=true;
 import('./vendor/three.module.min.js').then(mod=>{
  THREE=mod;booting=false;
  const wrap=document.getElementById('v3wrap');if(!wrap)return;
  try{
   renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:true});
   if(!renderer.getContext())throw new Error('no context');
  }catch(e){showFallback(e.message);return;}
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  wrap.querySelector('#v3fallback')?.remove();
  wrap.appendChild(renderer.domElement);
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x8ec8ea);
  camera=new THREE.OrthographicCamera(-60,60,40,-40,0.1,4000);
  camera.aspect=1.7;
  scene.add(new THREE.HemisphereLight(0xd7ecff,0x8aaa62,1.35));
  scene.add(new THREE.AmbientLight(0xffffff,0.42));
  sun=new THREE.DirectionalLight(0xfff6e4,1.25);sun.position.set(-80,90,60);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.near=1;sun.shadow.camera.far=900;
  scene.add(sun);scene.add(sun.target);
  world=new THREE.Group();scene.add(world);
  setupCompose();
  bindInput(renderer.domElement);
  try{if(latest)rebuild(latest);}catch(err){console.error(err);showFallback(err.message);}
  (function loop(){raf=requestAnimationFrame(loop);if(!built)return;
   if(waterMap)waterMap.offset.x=(performance.now()*0.00035)%1;
   const tt=performance.now()*0.00025;
   sparkles.forEach((s,i)=>{const u=(tt+s.p)%1;s.m.position.x=s.x0+(s.x1-s.x0)*u;s.m.position.y=Math.sin(u*8+i)*s.y*0.55;s.m.visible=u>0.04&&u<0.96;});
   placeLabels();renderFrame();})();
 }).catch(e=>{booting=false;showFallback(e&&e.message);});
}

function bindInput(cv){
 const pt=e=>{const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 cv.addEventListener('pointerdown',e=>{userMoved=true;cv.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,btn:e.button,id:e.pointerId};});
 cv.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
  if(e.shiftKey||drag.btn===2||e.buttons===2)pan(dx,dy);else{theta-=dx*0.005;phi=Math.max(0.12,Math.min(1.45,phi-dy*0.004));look();}});
 cv.addEventListener('pointerup',()=>{drag=null;});
 cv.addEventListener('contextmenu',e=>e.preventDefault());
 cv.addEventListener('wheel',e=>{e.preventDefault();radius*=Math.exp(e.deltaY*0.0012);radius=Math.max(8,Math.min(span*8,radius));look();},{passive:false});
 let pinch=null;
 cv.addEventListener('touchstart',e=>{if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};}},{passive:true});
 cv.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch){const a=e.touches[0],b=e.touches[1],d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  radius*=pinch.d/d;pinch.d=d;const x=(a.clientX+b.clientX)/2,y=(a.clientY+b.clientY)/2;pan(x-pinch.x,y-pinch.y);pinch.x=x;pinch.y=y;}},{passive:true});
}
function pan(dx,dy){
 const dir=new THREE.Vector3();camera.getWorldDirection(dir);
 const right=new THREE.Vector3().crossVectors(dir,camera.up).normalize();
 const up=new THREE.Vector3().crossVectors(right,dir).normalize();
 const s=radius*0.0016;
 target.addScaledVector(right,-dx*s);target.addScaledVector(up,dy*s);look();
}
function look(){
 if(!camera||!target)return;
 camera.up.set(0,0,1);
 const dist=640;
 const horiz=dist*Math.sin(phi);
 camera.position.set(target.x+horiz*Math.sin(theta), target.y+horiz*Math.cos(theta), target.z+dist*Math.cos(phi));
 camera.lookAt(target);
 if(camera.isOrthographicCamera){
  const aspect=Math.max(0.6,camera.aspect||1.7), half=Math.max(10,radius);
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
  camera.near=0.5;camera.far=4000;camera.updateProjectionMatrix();
 }
 if(sun){sun.position.copy(target).add(new THREE.Vector3(-span*0.35, span*0.72, span*0.85));sun.target.position.copy(target);
  const sc=sun.shadow.camera;sc.left=sc.bottom=-span;sc.right=sc.top=span;sc.near=0.5;sc.far=Math.max(400,span*8);sc.updateProjectionMatrix();}
}
function applyPreset(name){
 presetName=name;
 const s=Math.max(span,36);
 if(name==='upstream'){theta=Math.PI;phi=1.12;radius=s*0.7;}
 else if(name==='plan'){theta=0.2;phi=0.18;radius=s*1.05;}
 else if(name==='profile'){theta=Math.PI/2;phi=1.22;radius=s*0.95;}
 else {theta=-0.65;phi=1.06;radius=s*0.62;}
 document.querySelectorAll('#v3bar button').forEach(b=>b.classList.toggle('on',b.dataset.v3===name));
 look();
}
function fitLabels(){placeLabels();}

function isCirc(b){return b.shape==='circular'||(b.shape!=='box'&&b.shape!=='sdbox'&&!(b.section&&b.section.poly));}
function halfOuter(b){return isCirc(b)?b.D/2+b.wall:b.B/2+b.wall;}
function tri(world,Z,a,b,c,mat){
 const g=new THREE.BufferGeometry();
 const p=[],uv=[];
 [a,b,c].forEach(v=>{p.push(v[0],v[1],Z(v[2]));uv.push(v[0]*0.22,v[1]*0.22);});
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 g.computeVertexNormals();
 const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;world.add(m);return m;
}
function quad(world,Z,a,b,c,d,mat){tri(world,Z,a,b,c,mat);tri(world,Z,a,c,d,mat);}
function solid(world,sx,sy,sz,x,y,z,mat){
 const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);
 m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;
 world.add(m);return m;
}

function rebuild(data){
 if(!THREE||!world)return;
 dispose(world);world.clear();
 const mats=materials();live=mats;
 const p=data.p,r=data.r,ro=data.ro;
 const L=Math.max(p.length,1), fillZ=Math.max(0.5,+p.fillZ||3);
 const crest=ro?C.crestMin(ro):p.invIn+r.D*1.6;
 const Lr=Math.max(8,ro&&ro.Lr?ro.Lr:(r.US?40:12));
 let roadY=90;try{const cl=+document.getElementById('crestLen').value;if(cl>20)roadY=cl;}catch(e){}
 if(ro&&ro.segs&&ro.segs.length>1){const a=ro.segs.map(s=>s[0]);roadY=Math.max(40,Math.max(...a)-Math.min(...a));}
 const bars=barrelsOf(data).filter(b=>b.D>0&&b.B>0);
 const metal=metalOf(p);
 bars.forEach(b=>{b.wall=wallOf(b.D,metal);b.x0=0;b.x1=b.length;});
 let cursor=0;const gap=Math.max(0.8,0.2*Math.max(...bars.map(b=>b.B)));
 const total=bars.reduce((s,b)=>s+b.B+2*b.wall,0)+gap*(bars.length-1);
 cursor=-total/2;
 bars.forEach(b=>{b.yc=cursor+(b.B+2*b.wall)/2;cursor+=b.B+2*b.wall+gap;});
 const zRef=Math.min(p.invOut,p.invIn,r.EL)-2;
 const Z=e=>(e-zRef)*vex;
 // Embankment is a prism from inlet face to outlet face. Toes sit on the faces so the barrels pass straight through.
 const fp=Math.max(p.invIn,p.invOut)+Math.max(1.0,r.D*0.2);
 const crownIn=Math.max(...bars.map(b=>b.invIn+b.D)), crownOut=Math.max(...bars.map(b=>b.invOut+b.D));
 const zTopIn=Math.min(crest-0.4, Math.max(crownIn+1.05, (r.EL||crownIn)+0.85));
 const twEl=p.twMode==='const'?Math.max(p.twElev,p.invOut):p.invOut;
 const zTopOut=Math.min(crest-0.4, Math.max(crownOut+1.05, twEl+0.7));
 const riseIn=Math.max(0.8,crest-zTopIn), riseOut=Math.max(0.8,crest-zTopOut);
 const wantRun=fillZ*Math.max(riseIn,riseOut);
 const roadWcap=Math.min(Lr, Math.max(12, L*0.45));
 const run=Math.min(wantRun, Math.max(5,(L-roadWcap)/2));
 const roadL=run, roadR=Math.max(roadL+6, L-run);
 const yL=bars[0].yc-halfOuter(bars[0])-1.25, yR=bars[bars.length-1].yc+halfOuter(bars[bars.length-1])+1.25;
 const paveHalf=Math.max(11, Math.min(16, (yR-yL)*0.35+8));
 const slopeRun=Math.max(18, fillZ*Math.max(3, crest-fp));
 const roadHalf=paveHalf, embHalf=paveHalf+slopeRun;
 const halfBot=Math.max(3.5, total*0.42);
 const halfTop=halfBot+Math.max(5, 2*(fp-Math.min(p.invIn,p.invOut)+0.4));
 const apron=C.riprapApron({US:r.US!==false,Q:r.Q,D:r.D,TW:p.twMode==='none'?0:Math.max(0,r.TW),yn:r.yn,supercritical:isFinite(r.dc)&&r.yout<r.dc*0.999});
 const apL=Math.max(8, Math.min(28, apron.L||r.D*3));
 const kind=endKind(p);
 const shellMat=metal?mats.metal:mats.conc;
 const stick=Math.max(2.6, r.D*0.42);
 bars.forEach(b=>{b.stick=stick;});
 zOfW=Z;
 addGround(Z,fp,halfTop,L,embHalf,mats.grass);
 addChannel(Z,fp,halfBot,halfTop,p,L,mats.peb,mats.dirt);
 bars.forEach(b=>{
  const g=new THREE.Group();
  if(b.section&&b.section.poly&&b.section.poly.length>3) addPoly(g,b,shellMat,mats.inner);
  else if(!isCirc(b)) addBox(g,b,shellMat);
  else addCirc(g,b,shellMat,mats.inner,metal);
  const dz=Z(b.invOut)-Z(b.invIn);
  g.position.set(0,b.yc,Z(b.invIn));
  g.rotation.y=Math.asin(Math.max(-0.5,Math.min(0.5,-dz/Math.max(b.length,1))));
  g.scale.set(1,1,vex);
  world.add(g);
  addBarrelWater(g,b);
 });
 if(kind!=='project') addHeadwall(0,-1,bars,zTopIn,kind,mats.head,zRef);
 else addProjecting(0,-1,bars,mats.head,zRef);
 addHeadwall(L,1,bars,zTopOut,kind==='project'?'headwall':kind,mats.head,zRef);
 addFill(Z,fp,crest,L,roadL,roadR,yL,yR,roadHalf,embHalf,zTopIn,zTopOut,Math.max(crownIn,crownOut)+0.2,bars,mats.slope,mats.ao);
 if(mats.asphalt.map) mats.asphalt.map.repeat.set(Math.max(4,(roadR-roadL)/5), 3);
 solid(world, Math.max(4,roadR-roadL), roadHalf*2, 0.22*vex, (roadL+roadR)/2, 0, Z(crest)+0.18*vex, mats.asphalt);
 const pondY=Math.min(halfTop*0.72, halfBot+6);
 addPool(Z,-22,-0.35, pondY, p.invIn, r.EL, mats.water);
 addFoam(Z,-1.1,-0.35,-Math.min(pondY, (yR-yL)*0.55), Math.min(pondY,(yR-yL)*0.55), r.EL, mats.foam);
 if(p.twMode==='const'){
  const tw=Math.max(p.twElev,p.invOut);
  addPool(Z, L+0.4, L+apL+6, pondY, p.invOut, tw, mats.water);
  addFoam(Z, L+0.4, L+2.2, -pondY*0.7, pondY*0.7, tw, mats.foam);
 }
 sparkles=[];
 [[-20,-1.2,pondY,r.EL], ...(p.twMode==='const'?[[L+1,L+apL+4,pondY,Math.max(p.twElev,p.invOut)]]:[[]])].forEach(seg=>{
  if(seg.length<4)return;
  for(let i=0;i<6;i++){
   const m=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.35,0.06*vex), mats.paint);
   m.position.set(seg[0],0,Z(seg[3])+0.12);world.add(m);
   sparkles.push({m,x0:seg[0],x1:seg[1],y:seg[2]*0.7,p:i/6});
  }
 });
 addApron(L,apL,halfBot*2.1,p.invOut,Z,mats.rock);
 if(showLines&&r.hgl) addLines(p,r,Z);
 addArrow(r.EL, halfBot);
 const unit=r.US?'ft':'m';
 const deckLen=Math.max(4,roadR-roadL), deckX=(roadL+roadR)/2;
 const zLine=Z(crest)+0.42*vex, zH=0.08*vex;
 solid(world, deckLen, 0.4, zH, deckX, roadHalf-1.1, zLine, mats.paint);
 solid(world, deckLen, 0.4, zH, deckX, -(roadHalf-1.1), zLine, mats.paint);
 for(let x=roadL+3;x<roadR-3;x+=10) solid(world, 4.2, 0.45, zH, x, 0, zLine, mats.yellow);
 solid(world, deckLen, 0.3, 0.16*vex, deckX, roadHalf-0.4, Z(crest)+1.25*vex, mats.metal);
 solid(world, deckLen, 0.3, 0.16*vex, deckX, -(roadHalf-0.4), Z(crest)+1.25*vex, mats.metal);
 for(let x=roadL+6;x<roadR;x+=18){
  solid(world, 0.4, 0.4, 1.2*vex, x, roadHalf-0.4, Z(crest)+0.6*vex, mats.metal);
  solid(world, 0.4, 0.4, 1.2*vex, x, -(roadHalf-0.4), Z(crest)+0.6*vex, mats.metal);
 }
 const tags=[['HW '+fmt(r.EL)+' '+unit,-22,halfTop*0.55,r.EL+0.8],['Road '+fmt(crest)+' '+unit,(roadL+roadR)/2,0,crest+1.6]];
 if(p.twMode==='const') tags.push(['TW '+fmt(Math.max(p.twElev,p.invOut))+' '+unit,L+Math.min(apL,16),-halfBot*0.35,Math.max(p.twElev,p.invOut)+0.7]);
 labelPts=tags.map(([t,x,y,z])=>({text:t,pos:new THREE.Vector3(x,y,Z(z))}));
 inletAim=new THREE.Vector3(1.5,0,Z((p.invIn+crownIn)*0.5));
 const bb=new THREE.Box3(new THREE.Vector3(-16,-(embHalf+4),Z(Math.min(p.invIn,p.invOut)-0.4)), new THREE.Vector3(L+apL+6,embHalf+4,Z(crest+1.4)));
 lastBox=bb;
 if(!target) target=new THREE.Vector3();
 span=fitBox(bb,presetName,!built||!userMoved);
 built=true;
 const note=document.getElementById('v3note');
 const slopeNote=run+0.05<wantRun?'slope flattened so both faces stay at the barrel ends':'side slope 1:'+fillZ+' (H:V shown with exaggeration)';
 if(note){note.hidden=false;note.textContent=(kind==='miter'?'Mitered end':kind==='project'?'Projecting inlet':'Headwall and wingwalls')+' · '+(metal?'corrugated metal':'concrete')+' · '+slopeNote+' · vertical exaggeration '+vex+'×'+(vex===1?' (true scale)':'');}
}
function fmt(x){return isFinite(x)?(+x).toFixed(2):'—';}
function addGround(Z,fp,halfTop,L,embHalf,mat){
 const y=embHalf+28, x0=-36, x1=L+36;
 const shape=new THREE.Shape();
 shape.moveTo(x0,-y);shape.lineTo(x1,-y);shape.lineTo(x1,y);shape.lineTo(x0,y);shape.closePath();
 const hole=new THREE.Path();
 hole.moveTo(x0,-halfTop);hole.lineTo(x0,halfTop);hole.lineTo(x1,halfTop);hole.lineTo(x1,-halfTop);hole.closePath();
 shape.holes.push(hole);
 const geo=new THREE.ShapeGeometry(shape);
 const pos=geo.attributes.position, uv=new Float32Array(pos.count*2);
 for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)*0.22;uv[i*2+1]=pos.getY(i)*0.22;}
 geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 const m=new THREE.Mesh(geo,mat);m.position.z=Z(fp)+0.02*vex;m.receiveShadow=true;world.add(m);
}
function addChannel(Z,fp,halfBot,halfTop,p,L,bedMat,bankMat){
 const bed=x=>x<0?p.invIn:p.invOut;
 const spans=[[-34,-0.05],[L+0.05,L+34]];
 function mesh(which){
  const pos=[],uv=[];
  const push=(x,y,z)=>{pos.push(x,y,Z(z));uv.push(x*0.35,y*0.35);};
  spans.forEach(([x0,x1])=>{
   const n=6;
   for(let i=0;i<n;i++){
    const a=x0+(x1-x0)*i/n, b=x0+(x1-x0)*(i+1)/n, za=bed(a), zb=bed(b), top=fp;
    const strip=(y1a,z1a,y2a,z2a,y1b,z1b,y2b,z2b)=>{
     push(a,y1a,z1a);push(b,y1b,z1b);push(b,y2b,z2b);
     push(a,y1a,z1a);push(b,y2b,z2b);push(a,y2a,z2a);
    };
    if(which==='bed') strip(-halfBot,za,halfBot,za,-halfBot,zb,halfBot,zb);
    else {strip(-halfTop,top,-halfBot,za,-halfTop,top,-halfBot,zb);strip(halfBot,za,halfTop,top,halfBot,zb,halfTop,top);}
   }
  });
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();
  const m=new THREE.Mesh(g,which==='bed'?bedMat:bankMat);m.receiveShadow=true;world.add(m);
 }
 mesh('bed');mesh('bank');
}
function addFill(Z,fp,crest,L,roadL,roadR,yL,yR,roadHalf,embHalf,zIn,zOut,crown,bars,slope,ao){
 quad(world,Z,[0.15,yL,zIn],[roadL,yL,crest],[roadL,yR,crest],[0.15,yR,zIn],slope);
 quad(world,Z,[L-0.15,yR,zOut],[roadR,yR,crest],[roadR,yL,crest],[L-0.15,yL,zOut],slope);
 quad(world,Z,[0.15,-embHalf,fp],[0.15,yL,zIn],[roadL,roadHalf,crest],[roadL,-embHalf,fp],slope);
 quad(world,Z,[0.15,yR,zIn],[0.15,embHalf,fp],[roadL,embHalf,fp],[roadL,roadHalf,crest],slope);
 quad(world,Z,[L-0.15,-embHalf,fp],[roadR,-embHalf,fp],[roadR,roadHalf,crest],[L-0.15,yL,zOut],slope);
 quad(world,Z,[L-0.15,embHalf,fp],[L-0.15,yR,zOut],[roadR,roadHalf,crest],[roadR,embHalf,fp],slope);
 quad(world,Z,[roadL,roadHalf,crest],[roadR,roadHalf,crest],[roadR,embHalf,fp],[roadL,embHalf,fp],slope);
 quad(world,Z,[roadR,-roadHalf,crest],[roadL,-roadHalf,crest],[roadL,-embHalf,fp],[roadR,-embHalf,fp],slope);
 quad(world,Z,[roadL,embHalf-0.2,fp+0.12],[roadR,embHalf-0.2,fp+0.12],[roadR,embHalf+1.2,fp+0.02],[roadL,embHalf+1.2,fp+0.02],ao);
 quad(world,Z,[roadR,-embHalf-1.2,fp+0.02],[roadL,-embHalf-1.2,fp+0.02],[roadL,-embHalf+0.2,fp+0.12],[roadR,-embHalf+0.2,fp+0.12],ao);
 for(let i=0;i<bars.length-1;i++){
  const a=bars[i].yc+halfOuter(bars[i]), b=bars[i+1].yc-halfOuter(bars[i+1]);
  if(b-a>0.15) solid(world, Math.max(1,L-0.8), b-a, Math.max(0.4,(crown-fp)*vex), L/2, (a+b)/2, Z((fp+crown)/2), ao);
 }
}
function addHeadwall(xFace,sign,bars,zTop,kind,mat,zRef){
 if(kind==='miter'){addMiter(xFace,sign,bars,mat,zRef);return;}
 const invs=bars.map(b=>sign<0?b.invIn:b.invOut);
 const zBot=Math.min(...invs)-0.35;
 const y0=bars[0].yc-halfOuter(bars[0])-1.25;
 const y1=bars[bars.length-1].yc+halfOuter(bars[bars.length-1])+1.25;
 const shape=new THREE.Shape();
 shape.moveTo(y0,zBot);shape.lineTo(y1,zBot);shape.lineTo(y1,zTop);shape.lineTo(y0,zTop);shape.closePath();
 bars.forEach(b=>{
  const inv=sign<0?b.invIn:b.invOut;
  const path=new THREE.Path();
  if(isCirc(b)) path.absarc(b.yc, inv+b.D/2, Math.max(0.2,b.D/2-0.02), 0, Math.PI*2, true);
  else {
   const a=b.yc-b.B/2+0.04, c=b.yc+b.B/2-0.04, z0=inv+0.04, z1=inv+b.D-0.04;
   path.moveTo(a,z0);path.lineTo(c,z0);path.lineTo(c,z1);path.lineTo(a,z1);path.closePath();
  }
  shape.holes.push(path);
 });
 const geo=new THREE.ExtrudeGeometry(shape,{depth:0.62,bevelEnabled:false});
 const pos=geo.attributes.position;
 for(let i=0;i<pos.count;i++){
  const sx=pos.getX(i), sy=pos.getY(i), sz=pos.getZ(i);
  pos.setXYZ(i, xFace+sign*sz, sx, (sy-zRef)*vex);
 }
 geo.computeVertexNormals();
 const uv=geo.attributes.uv;
 if(uv){for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getY(i)*0.32,pos.getZ(i)*0.32);}
 const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);
 if(kind==='headwall'){addWing(xFace,sign,y0,zBot,zTop,-1,mat,zRef);addWing(xFace,sign,y1,zBot,zTop,1,mat,zRef);}
}
function addWing(xFace,sign,yEdge,zBot,zTop,side,mat,zRef){
 const len=Math.min(14, Math.max(8,(zTop-zBot)*0.7));
 const h=Math.max(1.6,zTop-zBot);
 const geo=new THREE.BoxGeometry(len,0.85,h*vex);
 geo.translate(len/2, side*0.2, 0);
 const m=new THREE.Mesh(geo,mat);
 m.position.set(xFace+sign*0.15, yEdge, ( (zBot+zTop)/2 - zRef)*vex);
 const flare=0.52;
 m.rotation.z=sign<0 ? Math.PI-side*flare : side*flare;
 m.castShadow=true;m.receiveShadow=true;world.add(m);
}
function addMiter(xFace,sign,bars,mat,zRef){
 bars.forEach(b=>{
  const inv=sign<0?b.invIn:b.invOut;
  const geo=new THREE.BoxGeometry(b.D*0.9, isCirc(b)?b.D:b.B+0.6, 0.35);
  geo.rotateY(sign*0.7);
  geo.translate(0,0,(inv+b.D/2-zRef)*vex);
  const m=new THREE.Mesh(geo,mat);
  m.position.set(xFace+sign*(-0.3), b.yc, 0);
  m.castShadow=true;world.add(m);
 });
}
function addProjecting(xFace,sign,bars,mat,zRef){
 bars.forEach(b=>{
  const R=isCirc(b)?b.D/2:Math.max(b.B,b.D)/2;
  const inv=sign<0?b.invIn:b.invOut;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(R+b.wall, Math.max(0.08,b.wall*0.7), 8, 28), mat);
  ring.rotation.y=Math.PI/2;
  ring.position.set(xFace+sign*(-b.D*0.45), b.yc, (inv+ (isCirc(b)?R:b.D/2) -zRef)*vex);
  world.add(ring);
 });
}
function addBarrelWater(g,b){
 let prof=b.profile&&b.profile.length>1?b.profile:null;
 if(!prof){const d=Math.max(0.25,Math.min(b.D*0.45,b.D*0.6));prof=[[0,d],[b.length,d]];}
 const n=Math.min(14,prof.length), pts=[];
 for(let i=0;i<n;i++) pts.push(prof[Math.round(i*(prof.length-1)/(n-1))]);
 const half=d=>{
  d=Math.max(0.08,Math.min(d,b.D*0.97));
  if(!isCirc(b)) return Math.max(0.25,b.B/2-b.wall*0.6);
  const r=b.D/2, q=r-d; return Math.sqrt(Math.max(0.04, r*r-q*q))*0.94;
 };
 const pos=[],uv=[];
 for(let i=0;i<pts.length-1;i++){
  const a=pts[i], c=pts[i+1];
  const za=Math.max(0.08,Math.min(a[1],b.D*0.97)), zc=Math.max(0.08,Math.min(c[1],b.D*0.97));
  const ha=half(za), hc=half(zc);
  const P=(x,y,z)=>{pos.push(x,y,z);uv.push(x*0.28,y*0.28);};
  P(a[0],-ha,za);P(c[0],-hc,zc);P(c[0],hc,zc);P(a[0],-ha,za);P(c[0],hc,zc);P(a[0],ha,za);
 }
 if(pos.length<9||!live) return;
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geo.computeVertexNormals();
 const m=new THREE.Mesh(geo,live.water);m.renderOrder=2;g.add(m);
}
function addPool(Z,x0,x1,y,bed,elev,mat){
 if(!(elev>bed+0.05)||!(x1>x0+0.3)) return;
 quad(world,Z,[x0,-y,elev],[x1,-y,elev],[x1,y,elev],[x0,y,elev],mat);
}
function addFoam(Z,x0,x1,y0,y1,elev,mat){
 if(!(x1>x0)) return;
 quad(world,Z,[x0,y0,elev+0.05],[x1,y0,elev+0.05],[x1,y1,elev+0.05],[x0,y1,elev+0.05],mat);
}
function fitBox(bb,mode,apply){
 const c=bb.getCenter(new THREE.Vector3()), s=bb.getSize(new THREE.Vector3());
 const aspect=Math.max(0.75,camera.aspect||1.7);
 const dist=Math.max(s.x/(2*aspect), s.y/2, s.z*1.2)*1.05;
 if(apply){
  target.copy(c);
  if(mode==='plan'){theta=0.15;phi=0.18;radius=dist*1.02;}
  else if(mode==='profile'){theta=Math.PI/2;phi=1.12;radius=dist;}
  else if(mode==='upstream'){theta=Math.PI;phi=1.02;radius=dist*0.92;}
  else if(mode==='inlet'&&inletAim){target.copy(inletAim);theta=-1.42;phi=1.06;radius=Math.max(11,Math.min(20,dist*0.16));}
  else {theta=-0.7;phi=0.92;radius=dist;}
  document.querySelectorAll('#v3bar button').forEach(b=>b.classList.toggle('on',b.dataset.v3===(mode||'iso')));
 } else target.copy(c);
 camera.near=Math.max(0.15, dist/180); camera.far=dist*24; camera.updateProjectionMatrix();
 look(); return dist;
}
function addBox(g,b,mat){
 const ext=b.stick||2.6, len=b.length+2*ext, B=b.B, D=b.D, t=b.wall, x0=b.length/2;
 const piece=(sx,sy,sz,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);};
 piece(len,B+2*t,t,x0,0,t/2);
 piece(len,B+2*t,t,x0,0,D-t/2);
 piece(len,t,D,x0,-(B/2+t/2),D/2);
 piece(len,t,D,x0,(B/2+t/2),D/2);
}
function addCirc(g,b,mat,inner,metal){
 const R=b.D/2, t=b.wall, ext=b.stick||2.6, len=b.length+2*ext;
 const outer=new THREE.Mesh(new THREE.CylinderGeometry(R+t,R+t,len,48,1,true),mat);
 outer.geometry.rotateZ(-Math.PI/2);outer.position.set(b.length/2,0,R);outer.castShadow=outer.receiveShadow=true;g.add(outer);
 const inn=new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.05,R-0.02),Math.max(0.05,R-0.02),len+0.08,48,1,true),inner);
 inn.geometry.rotateZ(-Math.PI/2);inn.position.set(b.length/2,0,R);g.add(inn);
 [-ext,b.length+ext].forEach(x=>{
  const ring=new THREE.Mesh(new THREE.RingGeometry(Math.max(0.05,R-0.02),R+t,40),mat);
  ring.position.set(x,0,R);ring.rotation.y=Math.PI/2;g.add(ring);
 });
 if(metal){
  const tube=Math.max(0.16,Math.min(0.34,R*0.12));
  const n=6;
  for(let i=0;i<n;i++){
   const rib=new THREE.Mesh(new THREE.TorusGeometry(R+t*0.35, tube, 8, 36), mat);
   rib.rotation.y=Math.PI/2;
   rib.position.set(-ext+0.12+i*(ext*0.72)/n, 0, R);
   g.add(rib);
   const rib2=rib.clone();rib2.position.x=b.length+ext-0.12-i*(ext*0.72)/n;g.add(rib2);
  }
 }
}
function addPoly(g,b,mat,inner){
 const pts=b.section.poly, xs=pts.map(q=>q[0]), mid=(Math.min(...xs)+Math.max(...xs))/2;
 const shape=new THREE.Shape();shape.moveTo(pts[0][0]-mid,pts[0][1]);for(let i=1;i<pts.length;i++)shape.lineTo(pts[i][0]-mid,pts[i][1]);
 const hole=new THREE.Path(), sc=0.9, cy=b.D/2;
 hole.moveTo((pts[0][0]-mid)*sc,(pts[0][1]-cy)*sc+cy);
 for(let i=1;i<pts.length;i++)hole.lineTo((pts[i][0]-mid)*sc,(pts[i][1]-cy)*sc+cy);
 shape.holes.push(hole);
 const geo=new THREE.ExtrudeGeometry(shape,{depth:b.length,bevelEnabled:false});
 const pos=geo.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);pos.setXYZ(i,z,x,y);}
 geo.computeVertexNormals();
 const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;g.add(m);
}
function addApron(L,len,width,inv,Z,mat){
 const h=0.28*vex;
 const m=new THREE.Mesh(new THREE.BoxGeometry(len,Math.max(width,6),h),mat);
 m.position.set(L+0.2+len/2,0,Z(inv)+h*0.35);m.receiveShadow=true;m.castShadow=true;world.add(m);
}
function addLines(p,r,Z){
 const inv=x=>p.invIn+(p.invOut-p.invIn)*(x/p.length);
 const line=(idx,color)=>{
  const pts=(r.hgl||[]).filter(q=>isFinite(q[idx])).map(q=>new THREE.Vector3(q[0],0.15,Z(inv(q[0])+q[idx])));
  if(pts.length<2)return;
  const g=new THREE.BufferGeometry().setFromPoints(pts);
  const m=new THREE.LineDashedMaterial({color,dashSize:1.2,gapSize:.55});
  const ln=new THREE.Line(g,m);ln.computeLineDistances();world.add(ln);
 };
 line(1,0x1e7a46);line(2,0xb86b00);
}
function addArrow(elev){
 const z=zOfW(elev+0.35);
 const len=4.2;
 const matA=new THREE.MeshToonMaterial({color:0xf4f7fb,gradientMap:liveGrad()});
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,len,12),matA);
 shaft.rotation.z=-Math.PI/2;shaft.position.set(-8,0,z);world.add(shaft);
 const head=new THREE.Mesh(new THREE.ConeGeometry(0.55,1.5,14),matA);
 head.rotation.z=-Math.PI/2;head.position.set(-8+len/2+0.7,0,z);world.add(head);
}
function paintLabels(ctx,w,h){
 const boxes=layoutLabels(w,h);
 ctx.imageSmoothingEnabled=false;
 ctx.strokeStyle='#1b2430';ctx.lineWidth=1;ctx.fillStyle='#1b2430';
 boxes.forEach(b=>{
  const cx=Math.max(b.x,Math.min(b.x+b.w,b.ax)), cy=Math.max(b.y,Math.min(b.y+b.h,b.ay));
  ctx.beginPath();ctx.moveTo(b.ax|0,b.ay|0);ctx.lineTo(cx|0,cy|0);ctx.stroke();
  ctx.fillStyle='#f6f0e2';ctx.fillRect(b.x|0,b.y|0,b.w|0,b.h|0);
  ctx.strokeRect((b.x|0)+0.5,(b.y|0)+0.5,(b.w|0)-1,(b.h|0)-1);
  ctx.fillStyle='#1b2430';ctx.font='700 13px ui-monospace,monospace';ctx.textBaseline='middle';
  ctx.fillText(b.text,(b.x|0)+6,(b.y|0)+b.h/2+1);
 });
}
function snapshot(){
 if(!renderer||!scene||!camera)return null;
 const wrap=document.getElementById('v3wrap');
 const saved={theta,phi,radius,t:target?target.clone():null,preset:presetName};
 if(lastBox) fitBox(lastBox, presetName||'iso', true);
 renderFrame(1400,780);
 let url=null;
 try{
  const cv=document.createElement('canvas');cv.width=1400;cv.height=780;
  const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.drawImage(renderer.domElement,0,0,1400,780);
  paintLabels(ctx,1400,780);
  url=cv.toDataURL('image/jpeg',0.86);
 }catch(e){url=null;}
 theta=saved.theta;phi=saved.phi;radius=saved.radius;presetName=saved.preset;
 if(saved.t&&target) target.copy(saved.t);
 look();
 if(wrap) renderFrame(wrap.clientWidth,wrap.clientHeight);
 return url;
}
function frameInlet(){
 presetName='inlet';userMoved=false;
 if(lastBox) fitBox(lastBox,'inlet',true);
}

window.View3D={
 update(anchor,data){latest=data;card(anchor);if(failed)return;if(!THREE)boot();else rebuild(data);},
 snapshot, frameInlet,
 ready(){return !!THREE&&built;}
};
})();
