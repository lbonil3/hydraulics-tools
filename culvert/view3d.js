/* 3D culvert crossing. three.js is imported on first use so the form can paint first.
   Elevations and lengths are the computed values. Vertical exaggeration defaults to 2 and is labeled;
   1 is true scale. Wall thickness is a visual shell (about D/12 for concrete, thinner for metal), not a structural design. */
(function(){
const cardId='isocard';
let THREE=null, renderer, scene, camera, world, sun, raf=0;
 let theta=0.82, phi=1.02, radius=120, target=null, userMoved=false;
let vex=2, showLines=true, presetName='iso', span=80;
let latest=null, booting=false, failed=false, built=false, lastBox=null;
let zOfW=e=>e, live=null;
let drag=null;

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
  <div id="v3wrap"><div id="v3fallback">Loading 3D model…</div><div id="v3note" hidden></div></div></div>`);
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

function tex(w,h,draw,repX,repY){
 const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;
 if(repX)t.repeat.set(repX,repY||repX);t.anisotropy=8;return t;
}
function noise(g,w,h,a,b){const im=g.getImageData(0,0,w,h);for(let i=0;i<im.data.length;i+=4){const n=(Math.random()*2-1);im.data[i]=a[0]+n*b;im.data[i+1]=a[1]+n*b;im.data[i+2]=a[2]+n*b;im.data[i+3]=255;}g.putImageData(im,0,0);}
function materials(){
 const grass=tex(256,256,(g,w,h)=>{g.fillStyle='#6f8f45';g.fillRect(0,0,w,h);noise(g,w,h,[96,128,62],18);
  g.strokeStyle='rgba(70,100,40,.35)';for(let i=0;i<40;i++){g.beginPath();g.moveTo(Math.random()*w,Math.random()*h);g.lineTo(Math.random()*w,Math.random()*h-8);g.stroke();}},8,8);
 const dirt=tex(256,256,(g,w,h)=>{g.fillStyle='#a68458';g.fillRect(0,0,w,h);noise(g,w,h,[150,120,78],16);},6,6);
 const conc=tex(256,256,(g,w,h)=>{g.fillStyle='#d5d8dc';g.fillRect(0,0,w,h);noise(g,w,h,[198,200,204],10);
  g.strokeStyle='rgba(120,124,128,.35)';g.lineWidth=2;for(let y=20;y<h;y+=28){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}},2,2);
 const concBump=tex(256,256,(g,w,h)=>{g.fillStyle='#808080';g.fillRect(0,0,w,h);noise(g,w,h,[128,128,128],18);},2,2);
 const metal=tex(256,64,(g,w,h)=>{for(let y=0;y<h;y++){const s=Math.sin(y/h*Math.PI*22);const v=70+150*(0.5+0.5*s);g.fillStyle=`rgb(${v*0.72|0},${v*0.76|0},${v*0.82|0})`;g.fillRect(0,y,w,1);}},2,14);
 const metalBump=tex(256,64,(g,w,h)=>{for(let y=0;y<h;y++){const s=(Math.sin(y/h*Math.PI*22)+1)/2;const v=30+210*s;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(0,y,w,1);}},2,14);
 const rock=tex(256,256,(g,w,h)=>{g.fillStyle='#8d7760';g.fillRect(0,0,w,h);noise(g,w,h,[120,100,80],20);
  for(let i=0;i<46;i++){g.fillStyle=`rgba(${70+Math.random()*80|0},${55+Math.random()*50|0},${40+Math.random()*30|0},.85)`;
   g.beginPath();g.ellipse(Math.random()*w,Math.random()*h,6+Math.random()*16,4+Math.random()*10,Math.random()*3,0,7);g.fill();}},3,3);
 const asphalt=tex(512,512,(g,w,h)=>{g.fillStyle='#2c3036';g.fillRect(0,0,w,h);noise(g,w,h,[48,50,54],12);
  g.strokeStyle='#f4f4f4';g.lineWidth=10;g.beginPath();g.moveTo(22,0);g.lineTo(22,h);g.moveTo(w-22,0);g.lineTo(w-22,h);g.stroke();
  g.strokeStyle='#e6c84a';g.lineWidth=7;g.setLineDash([36,28]);g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke();},1,8);
 const M=THREE.MeshStandardMaterial;
 return {
  grass:new M({map:grass,roughness:.95,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}),
  dirt:new M({map:dirt,roughness:.92,metalness:0,side:THREE.DoubleSide}),
  conc:new M({map:conc,bumpMap:concBump,bumpScale:.04,roughness:.82,metalness:.02,side:THREE.DoubleSide}),
  head:new M({color:0xe6e1d8,roughness:.74,metalness:.02,side:THREE.DoubleSide}),
  metal:new M({map:metal,bumpMap:metalBump,bumpScale:1.4,roughness:.38,metalness:.55,side:THREE.DoubleSide}),
  rock:new M({map:rock,roughness:.96,metalness:0,side:THREE.DoubleSide}),
  asphalt:new M({map:asphalt,roughness:.9,metalness:.04,side:THREE.DoubleSide}),
  water:new M({color:0x1a6eae,transparent:true,opacity:.42,roughness:.12,metalness:.02,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),
  inner:new M({color:0x12161a,roughness:.95,side:THREE.BackSide})
 };
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

function boot(){
 if(THREE||booting||failed)return;
 booting=true;
 import('./vendor/three.module.min.js').then(mod=>{
  THREE=mod;booting=false;
  const wrap=document.getElementById('v3wrap');if(!wrap)return;
  try{
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
   if(!renderer.getContext())throw new Error('no context');
  }catch(e){showFallback(e.message);return;}
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  wrap.querySelector('#v3fallback')?.remove();
  wrap.appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color(0xc5e4f6);
  camera=new THREE.PerspectiveCamera(38,1,0.1,8000);
  scene.add(new THREE.HemisphereLight(0xd7ecff,0x6d7a48,0.72));
  scene.add(new THREE.AmbientLight(0xffffff,0.18));
  sun=new THREE.DirectionalLight(0xfff4e0,2.15);sun.position.set(-80,70,120);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.near=1;sun.shadow.camera.far=800;
  scene.add(sun);scene.add(sun.target);
  world=new THREE.Group();scene.add(world);
  bindInput(renderer.domElement);
  const fit=()=>{const w=wrap.clientWidth||640,h=wrap.clientHeight||380;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();};
  fit();new ResizeObserver(fit).observe(wrap);
  try{if(latest)rebuild(latest);}catch(err){console.error(err);showFallback(err.message);}
  (function loop(){raf=requestAnimationFrame(loop);if(!built)return;fitLabels();renderer.render(scene,camera);})();
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
 const horiz=radius*Math.sin(phi);
 camera.position.set(target.x+horiz*Math.sin(theta), target.y+horiz*Math.cos(theta), target.z+radius*Math.cos(phi));
 camera.lookAt(target);
 if(sun){sun.position.copy(target).add(new THREE.Vector3(-span*0.55, -span*0.35, span*0.95));sun.target.position.copy(target);
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
function fitLabels(){
 if(!world)return;world.traverse(o=>{if(o.userData&&o.userData.label){const d=camera.position.distanceTo(o.position);o.scale.set(d*0.062,d*0.016,1);}});
}

function isCirc(b){return b.shape==='circular'||(b.shape!=='box'&&b.shape!=='sdbox'&&!(b.section&&b.section.poly));}
function halfOuter(b){return isCirc(b)?b.D/2+b.wall:b.B/2+b.wall;}
function tri(world,Z,a,b,c,mat){
 const g=new THREE.BufferGeometry();
 const p=[];[a,b,c].forEach(v=>p.push(v[0],v[1],Z(v[2])));
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
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
 const roadHalf=Math.max(22, Math.max(Math.abs(yL),Math.abs(yR))+14);
 const halfBot=Math.max(3.5, total*0.42);
 const halfTop=halfBot+Math.max(5, 2*(fp-Math.min(p.invIn,p.invOut)+0.4));
 const apron=C.riprapApron({US:r.US!==false,Q:r.Q,D:r.D,TW:p.twMode==='none'?0:Math.max(0,r.TW),yn:r.yn,supercritical:isFinite(r.dc)&&r.yout<r.dc*0.999});
 const apL=Math.max(8, Math.min(28, apron.L||r.D*3));
 const kind=endKind(p);
 const shellMat=metal?mats.metal:mats.conc;
 const stick=Math.max(2.6, r.D*0.42);
 bars.forEach(b=>{b.stick=stick;});
 zOfW=Z;
 addGround(Z,fp,halfTop,L,roadHalf,mats.grass);
 addChannel(Z,fp,halfBot,halfTop,p,L,mats.dirt);
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
 addFill(Z,fp,crest,L,roadL,roadR,yL,yR,roadHalf,zTopIn,zTopOut,Math.max(crownIn,crownOut)+0.2,bars,mats.grass,mats.dirt);
 solid(world, Math.max(4,roadR-roadL), roadHalf*2, 0.22*vex, (roadL+roadR)/2, 0, Z(crest)+0.18*vex, mats.asphalt);
 addPool(Z,-28,-stick+0.2, halfBot, halfTop, p.invIn, fp, r.EL, mats.water, 'hi');
 if(p.twMode==='const') addPool(Z, L+stick-0.2, L+apL+12, halfBot, halfTop, p.invOut, fp, Math.max(p.twElev,p.invOut), mats.water, 'lo');
 addApron(L,apL,halfBot*2.1,p.invOut,Z,mats.rock);
 if(showLines&&r.hgl) addLines(p,r,Z);
 addArrow(r.EL, halfBot);
 const unit=r.US?'ft':'m';
 const tags=[['HW '+fmt(r.EL)+' '+unit,-24,halfTop*0.72,r.EL+0.7],['Road '+fmt(crest)+' '+unit,(roadL+roadR)/2,0,crest+1.3]];
 if(p.twMode==='const') tags.push(['TW '+fmt(Math.max(p.twElev,p.invOut))+' '+unit,L+apL*0.45,-halfBot*0.2,Math.max(p.twElev,p.invOut)+0.45]);
 tags.forEach(([t,x,y,z])=>{const s=label(t);s.position.set(x,y,Z(z));world.add(s);});
 const pad=Math.max(26, apL);
 const bb=new THREE.Box3(new THREE.Vector3(-pad,-(roadHalf+8),Z(Math.min(p.invIn,p.invOut)-0.6)), new THREE.Vector3(L+pad,roadHalf+8,Z(crest+1.2)));
 lastBox=bb;
 if(!target) target=new THREE.Vector3();
 span=fitBox(bb,presetName,!built||!userMoved);
 built=true;
 const note=document.getElementById('v3note');
 const slopeNote=run+0.05<wantRun?'slope flattened so both faces stay at the barrel ends':'side slope 1:'+fillZ+' (H:V shown with exaggeration)';
 if(note){note.hidden=false;note.textContent=(kind==='miter'?'Mitered end':kind==='project'?'Projecting inlet':'Headwall and wingwalls')+' · '+(metal?'corrugated metal':'concrete')+' · '+slopeNote+' · vertical exaggeration '+vex+'×'+(vex===1?' (true scale)':'');}
}
function fmt(x){return isFinite(x)?(+x).toFixed(2):'—';}
function addGround(Z,fp,halfTop,L,roadHalf,mat){
 const y=roadHalf+Math.max(14,halfTop), x0=-40, x1=L+40;
 const shape=new THREE.Shape();
 shape.moveTo(x0,-y);shape.lineTo(x1,-y);shape.lineTo(x1,y);shape.lineTo(x0,y);shape.closePath();
 const hole=new THREE.Path();
 hole.moveTo(x0,-halfTop);hole.lineTo(x0,halfTop);hole.lineTo(x1,halfTop);hole.lineTo(x1,-halfTop);hole.closePath();
 shape.holes.push(hole);
 const geo=new THREE.ShapeGeometry(shape);
 const m=new THREE.Mesh(geo,mat);m.position.z=Z(fp)+0.02*vex;m.receiveShadow=true;world.add(m);
}
function addChannel(Z,fp,halfBot,halfTop,p,L,mat){
 const bed=x=>x<0?p.invIn:p.invOut;
 const spans=[[-34,-0.08],[L+0.08,L+36]];
 const pos=[];
 const push=(x,y,z)=>pos.push(x,y,Z(z));
 spans.forEach(([x0,x1])=>{
  const n=8;
  for(let i=0;i<n;i++){
   const a=x0+(x1-x0)*i/n, b=x0+(x1-x0)*(i+1)/n, za=bed(a), zb=bed(b);
   const top=fp;
   const strip=(y1a,z1a,y2a,z2a,y1b,z1b,y2b,z2b)=>{
    push(a,y1a,z1a);push(b,y1b,z1b);push(b,y2b,z2b);
    push(a,y1a,z1a);push(b,y2b,z2b);push(a,y2a,z2a);
   };
   strip(-halfTop,top,-halfBot,za,-halfTop,top,-halfBot,zb);
   strip(-halfBot,za,halfBot,za,-halfBot,zb,halfBot,zb);
   strip(halfBot,za,halfTop,top,halfBot,zb,halfTop,top);
  }
 });
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.computeVertexNormals();
 const m=new THREE.Mesh(g,mat);m.receiveShadow=true;m.castShadow=true;world.add(m);
}
function addFill(Z,fp,crest,L,roadL,roadR,yL,yR,roadHalf,zIn,zOut,crown,bars,grass,dirt){
 const side=roadHalf+Math.max(7,(crest-fp)*0.4);
 // Solid wedge from the headwall edge out to the floodplain, so the slope has thickness and no sky shows under it.
 function wedge(xFace,zFace,xCrest,yH,yO){
  tri(world,Z,[xFace,yH,zFace],[xCrest,yH,crest],[xCrest,yO,crest],grass);
  tri(world,Z,[xFace,yH,zFace],[xCrest,yO,crest],[xFace,yO,fp],grass);
  tri(world,Z,[xFace,yO,fp],[xCrest,yO,fp],[xCrest,yO,crest],grass);
  quad(world,Z,[xFace,yH,fp],[xFace,yH,zFace],[xCrest,yH,crest],[xCrest,yH,fp],dirt);
  tri(world,Z,[xFace,yO,fp],[xFace,yH,zFace],[xFace,yH,fp],dirt);
  quad(world,Z,[xCrest,yH,fp],[xCrest,yO,fp],[xCrest,yO,crest],[xCrest,yH,crest],dirt);
 }
 wedge(0.05,zIn,roadL,yL,-roadHalf);
 wedge(0.05,zIn,roadL,yR,roadHalf);
 wedge(L-0.05,zOut,roadR,yL,-roadHalf);
 wedge(L-0.05,zOut,roadR,yR,roadHalf);
 function cap(xFace,zFace,xCrest){
  quad(world,Z,[xFace,yL,zFace],[xCrest,yL,crest],[xCrest,yR,crest],[xFace,yR,zFace],grass);
  quad(world,Z,[xFace,yR,crown],[xCrest,yR,crown],[xCrest,yL,crown],[xFace,yL,crown],dirt);
  quad(world,Z,[xFace,yL,crown],[xCrest,yL,crown],[xCrest,yL,crest],[xFace,yL,zFace],dirt);
  quad(world,Z,[xCrest,yR,crown],[xFace,yR,crown],[xFace,yR,zFace],[xCrest,yR,crest],dirt);
  if(zFace>crown+0.05) quad(world,Z,[xFace,yL,crown],[xFace,yL,zFace],[xFace,yR,zFace],[xFace,yR,crown],dirt);
 }
 if(zIn>crown) cap(0.05,zIn,roadL);
 if(zOut>crown) cap(L-0.05,zOut,roadR);
 const x0=Math.min(roadL,roadR)+0.08, x1=Math.max(roadL,roadR)-0.08, xm=(x0+x1)/2, xl=x1-x0;
 if(xl>1 && crest>crown+0.3){
  solid(world, xl, (yR-yL), (crest-crown)*vex, xm, (yL+yR)/2, Z((crown+crest)/2), dirt);
  const wL=yL+roadHalf; if(wL>0.4) solid(world, xl, wL, (crest-fp)*vex, xm, (-roadHalf+yL)/2, Z((fp+crest)/2), dirt);
  const wR=roadHalf-yR; if(wR>0.4) solid(world, xl, wR, (crest-fp)*vex, xm, (roadHalf+yR)/2, Z((fp+crest)/2), dirt);
 }
 for(let i=0;i<bars.length-1;i++){
  const a=bars[i].yc+halfOuter(bars[i]), b=bars[i+1].yc-halfOuter(bars[i+1]);
  if(b-a>0.12 && crown>fp) solid(world, Math.max(1,L-0.5), b-a, (crown-fp)*vex, L/2, (a+b)/2, Z((fp+crown)/2), dirt);
 }
 quad(world,Z,[roadL,-roadHalf,crest],[roadR,-roadHalf,crest],[roadR,roadHalf,crest],[roadL,roadHalf,crest],grass);
 quad(world,Z,[roadL,roadHalf,crest],[roadR,roadHalf,crest],[roadR,side,fp],[roadL,side,fp],grass);
 quad(world,Z,[roadR,-roadHalf,crest],[roadL,-roadHalf,crest],[roadL,-side,fp],[roadR,-side,fp],grass);
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
 const pos=[];
 for(let i=0;i<pts.length-1;i++){
  const a=pts[i], c=pts[i+1];
  const za=Math.max(0.08,Math.min(a[1],b.D*0.97)), zc=Math.max(0.08,Math.min(c[1],b.D*0.97));
  const ha=half(za), hc=half(zc);
  pos.push(a[0],-ha,za, c[0],-hc,zc, c[0],hc,zc, a[0],-ha,za, c[0],hc,zc, a[0],ha,za);
 }
 if(pos.length<9||!live) return;
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 geo.computeVertexNormals();
 const m=new THREE.Mesh(geo,live.water);m.renderOrder=2;g.add(m);
}
function addPool(Z,x0,x1,halfBot,halfTop,bed,fp,elev,mat,openEdge){
 if(!(elev>bed+0.05)||!(x1>x0+0.4)) return;
 let y;
 if(elev<fp-0.08) y=Math.min(halfTop-0.25, halfBot+2*Math.max(0.25,elev-bed));
 else y=halfTop-0.2;
 y=Math.max(y, halfBot+0.3);
 quad(world,Z,[x0,-y,elev],[x1,-y,elev],[x1,y,elev],[x0,y,elev],mat);
 const skirt=(a,b,z0)=>{
  tri(world,Z,a,b,[b[0],b[1],z0],mat);
  tri(world,Z,a,[b[0],b[1],z0],[a[0],a[1],z0],mat);
 };
 const floor=Math.min(elev-0.05, elev<fp?bed:fp);
 skirt([x0,-y,elev],[x1,-y,elev],floor);
 skirt([x1,y,elev],[x0,y,elev],floor);
 if(openEdge!=='lo') skirt([x0,y,elev],[x0,-y,elev],floor);
 if(openEdge!=='hi') skirt([x1,-y,elev],[x1,y,elev],floor);
}
function fitBox(bb,mode,apply){
 const c=bb.getCenter(new THREE.Vector3()), s=bb.getSize(new THREE.Vector3());
 const fov=(camera.fov||38)*Math.PI/180, aspect=Math.max(0.8,camera.aspect||1.7);
 const distV=(s.z*0.62)/Math.tan(fov/2);
 const distH=(Math.max(s.x,s.y)*0.58)/(Math.tan(fov/2)*aspect);
 const dist=Math.max(distV,distH,24)*1.16;
 if(apply){
  target.copy(c);
  if(mode==='plan'){theta=0.22;phi=0.22;radius=dist*1.05;}
  else if(mode==='profile'){theta=Math.PI/2;phi=1.2;radius=dist*1.02;}
  else if(mode==='upstream'){theta=Math.PI;phi=1.12;radius=dist*0.98;}
  else {theta=-0.88;phi=1.15;radius=dist*0.98;}
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
 const matA=new THREE.MeshStandardMaterial({color:0xf7fbff,roughness:.3,emissive:0x1c3a55,emissiveIntensity:.35});
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,len,12),matA);
 shaft.rotation.z=-Math.PI/2;shaft.position.set(-8,0,z);world.add(shaft);
 const head=new THREE.Mesh(new THREE.ConeGeometry(0.55,1.5,14),matA);
 head.rotation.z=-Math.PI/2;head.position.set(-8+len/2+0.7,0,z);world.add(head);
}
function snapshot(){
 if(!renderer||!scene||!camera)return null;
 const wrap=document.getElementById('v3wrap');
 const prev=renderer.getSize(new THREE.Vector2());
 const saved={theta,phi,radius,aspect:camera.aspect,t:target?target.clone():null};
 renderer.setPixelRatio(1);renderer.setSize(1400,780,false);camera.aspect=1400/780;camera.updateProjectionMatrix();
 if(lastBox) fitBox(lastBox, presetName||'iso', true);
 fitLabels();renderer.render(scene,camera);
 let url=null;try{url=renderer.domElement.toDataURL('image/jpeg',0.86);}catch(e){url=null;}
 theta=saved.theta;phi=saved.phi;radius=saved.radius;
 if(saved.t&&target) target.copy(saved.t);
 renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
 renderer.setSize(prev.x,prev.y,false);camera.aspect=saved.aspect;camera.updateProjectionMatrix();
 if(wrap){renderer.setSize(wrap.clientWidth||prev.x,wrap.clientHeight||prev.y,false);camera.aspect=(wrap.clientWidth||prev.x)/Math.max(1,wrap.clientHeight||prev.y);camera.updateProjectionMatrix();}
 look();
 return url;
}

window.View3D={
 update(anchor,data){latest=data;card(anchor);if(failed)return;if(!THREE)boot();else rebuild(data);},
 snapshot,
 ready(){return !!THREE&&built;}
};
})();
