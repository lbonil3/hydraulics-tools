/* 3D culvert crossing. three.js is imported on first use so the form can paint first.
   Elevations and lengths are the computed values. Vertical exaggeration defaults to 2 and is labeled;
   1 is true scale. Wall thickness is a visual shell (about D/12 for concrete, thinner for metal), not a structural design. */
(function(){
const cardId='isocard';
let THREE=null, renderer, scene, camera, world, sun, raf=0;
 let theta=0.82, phi=1.02, radius=120, target=null, userMoved=false;
let vex=2, showLines=true, presetName='iso', span=80;
let latest=null, booting=false, failed=false, built=false;
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
function wallOf(D,metal){return metal?Math.max(0.06,Math.min(0.2,D*0.03)):Math.max(0.2,Math.min(0.7,D/12));}

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
 const metal=tex(256,64,(g,w,h)=>{for(let y=0;y<h;y++){const s=Math.sin(y/h*Math.PI*10);const v=150+70*s;g.fillStyle=`rgb(${v},${v+4},${v+8})`;g.fillRect(0,y,w,1);}
  noise(g,w,h,[170,174,180],8);},1,6);
 const metalBump=tex(256,64,(g,w,h)=>{for(let y=0;y<h;y++){const s=(Math.sin(y/h*Math.PI*10)+1)/2;const v=40+200*s;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(0,y,w,1);}},1,6);
 const rock=tex(256,256,(g,w,h)=>{g.fillStyle='#8d7760';g.fillRect(0,0,w,h);noise(g,w,h,[120,100,80],20);
  for(let i=0;i<46;i++){g.fillStyle=`rgba(${70+Math.random()*80|0},${55+Math.random()*50|0},${40+Math.random()*30|0},.85)`;
   g.beginPath();g.ellipse(Math.random()*w,Math.random()*h,6+Math.random()*16,4+Math.random()*10,Math.random()*3,0,7);g.fill();}},3,3);
 const asphalt=tex(512,512,(g,w,h)=>{g.fillStyle='#2c3036';g.fillRect(0,0,w,h);noise(g,w,h,[48,50,54],12);
  g.strokeStyle='#f4f4f4';g.lineWidth=10;g.beginPath();g.moveTo(22,0);g.lineTo(22,h);g.moveTo(w-22,0);g.lineTo(w-22,h);g.stroke();
  g.strokeStyle='#e6c84a';g.lineWidth=7;g.setLineDash([36,28]);g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke();},1,8);
 const M=THREE.MeshStandardMaterial;
 return {
  grass:new M({map:grass,roughness:.95,metalness:0}),
  dirt:new M({map:dirt,roughness:.92,metalness:0}),
  conc:new M({map:conc,bumpMap:concBump,bumpScale:.04,roughness:.82,metalness:.02}),
  head:new M({color:0xc8c2b8,roughness:.78,metalness:.02}),
  metal:new M({map:metal,bumpMap:metalBump,bumpScale:.35,roughness:.42,metalness:.62}),
  rock:new M({map:rock,roughness:.96,metalness:0}),
  asphalt:new M({map:asphalt,roughness:.9,metalness:.04}),
  water:new THREE.MeshPhysicalMaterial({color:0x2f86c4,transparent:true,opacity:.62,roughness:.12,metalness:.04,transmission:.25,thickness:.6,depthWrite:false,side:THREE.DoubleSide}),
  inner:new M({color:0x22262b,roughness:.9,side:THREE.BackSide})
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
  const sc=sun.shadow.camera;sc.left=sc.bottom=-span;sc.right=sc.top=span;sc.updateProjectionMatrix();}
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
 if(!world)return;world.traverse(o=>{if(o.userData&&o.userData.label){const d=camera.position.distanceTo(o.position);o.scale.set(d*0.22,d*0.055,1);}});
}

function rebuild(data){
 if(!THREE||!world)return;
 dispose(world);world.clear();
 const mats=materials();live=mats;zOfW=e=>(e-zRef)*vex;
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
 const bedAt=x=>x<=0?p.invIn:x>=L?p.invOut:p.invIn+(p.invOut-p.invIn)*x/L;
 const fpLift=Math.max(2.2,(r.D||4)*0.45);
 roadY=Math.max(70, Math.min(roadY, 96));
 const roadL=L/2-Lr/2, roadR=L/2+Lr/2, roadHalf=roadY/2;
 function embank(x,y){
  const dx=x<roadL?roadL-x:x>roadR?x-roadR:0, dy=Math.abs(y)>roadHalf?Math.abs(y)-roadHalf:0;
  const dist=Math.hypot(dx,dy), z=crest-dist/fillZ, fp=bedAt(x)+fpLift;
  if(dist>0&&z<fp)return null;return z;
 }
 function surf(x,y){
  const bed=bedAt(x), fp=bed+fpLift, ad=Math.abs(y), half=Math.max(4,total*0.25);
  let gnd;if(ad<=half)gnd=bed;else if(ad<=half+2*(fp-bed))gnd=bed+(ad-half)/2;else gnd=fp;
  if(x<roadL-2){const d=Math.hypot(roadL-x,y*0.35);if(d>28)gnd+= (d-28)*0.22;}
  if(x>roadR+2){const d=Math.hypot(x-roadR,y*0.35);if(d>28)gnd+= (d-28)*0.22;}
  if(x>=roadL&&x<=roadR&&Math.abs(y)<=roadHalf)return crest-0.6;
  const top=embank(x,y);return top==null?gnd:Math.max(gnd,top);
 }
 function inVoid(x,y,z){
  if(x<-0.4||x>L+0.4)return false;
  for(const b of bars){
   const inv=b.invIn+(b.invOut-b.invIn)*Math.min(1,Math.max(0,x/b.length));
   if(b.shape==='circular'||(b.shape!=='box'&&!(b.section&&b.section.poly)&&b.shape!=='sdbox')){
    const rad=b.D/2-b.wall*0.4, cz=inv+b.D/2;
    if((y-b.yc)**2+(z-cz)**2<rad*rad)return true;
   } else if(Math.abs(y-b.yc)<b.B/2-b.wall*0.3&&z>inv+b.wall*0.3&&z<inv+b.D-b.wall*0.3)return true;
  }
  return false;
 }
 const x0=Math.min(-18,roadL-fillZ*(crest-p.invIn)-12), x1=Math.max(L+18,roadR+fillZ*(crest-p.invOut)+12)+(C.riprapApron?0:0);
 const apron=C.riprapApron({US:r.US!==false,Q:r.Q,D:r.D,TW:p.twMode==='none'?0:r.TW,yn:r.yn,supercritical:isFinite(r.dc)&&r.yout<r.dc*0.999});
 const apL=apron.L||r.D*4, xMax=x1+apL;
 const yMax=Math.max(roadHalf+fillZ*(crest-p.invIn)+16, total+30);
 const nx=90, ny=56, xs=[], ys=[], elev=[];
 for(let i=0;i<=nx;i++)xs.push(x0+(xMax-x0)*i/nx);
 for(let j=0;j<=ny;j++)ys.push(-yMax+(2*yMax)*j/ny);
 for(let j=0;j<=ny;j++){elev[j]=[];for(let i=0;i<=nx;i++)elev[j][i]=Z(surf(xs[i],ys[j]));}
 const ground=new THREE.Mesh(surfaceMesh(xs,ys,elev,(x,y,z)=>inVoid(x,y,zRef+z/vex)),mats.grass);
 ground.receiveShadow=true;ground.castShadow=true;world.add(ground);
 const onRoad=(x,y)=>x>=roadL&&x<=roadR&&Math.abs(y)<=roadHalf;
 // asphalt deck slightly above the fill
 const deck=new THREE.Mesh(new THREE.BoxGeometry(Lr,roadY,0.45*vex),mats.asphalt);
 deck.position.set(L/2,0,Z(crest)-0.2*vex);deck.castShadow=true;deck.receiveShadow=true;world.add(deck);
 const shellMat=metal?mats.metal:mats.conc;
 bars.forEach(b=>{
  const g=new THREE.Group();
  const len=b.length, t=b.wall;
  if(b.section&&b.section.poly&&b.section.poly.length>3) addPoly(g,b,shellMat,mats.inner);
  else if(b.shape==='box'||b.shape==='sdbox') addBox(g,b,shellMat,mats.inner);
  else addCirc(g,b,shellMat,mats.inner);
  g.position.set(0,b.yc,Z(b.invIn));
  g.rotation.y=Math.atan2(-(b.invOut-b.invIn)*vex,len);
  world.add(g);
  addWater(b);
 });
 addEnds(bars,shellMat,mats.head,metal);
 addPools(p,r,Z,surf,x0,xMax,yMax,mats.water);
 addApron(L,apL,apron.W||r.D*3,p.invOut,Z,mats.rock);
 if(showLines&&r.hgl) addLines(p,r,Z);
 addArrow(p,r,Z);
 const unit=r.US?'ft':'m';
 const tags=[['HW '+fmt(r.EL)+' '+unit,-8,0,r.EL+1.2],['Road '+fmt(crest)+' '+unit,L/2,roadHalf*0.3,crest+1.4]];
 if(p.twMode==='const')tags.push(['TW '+fmt(Math.max(p.twElev,p.invOut))+' '+unit,L+12,0,Math.max(p.twElev,p.invOut)+1.2]);
 tags.forEach(([t,x,y,z])=>{const s=label(t);s.position.set(x,y,Z(z)+2);world.add(s);});
 span=Math.max(80, Math.min(Math.max(L, roadY)*0.85, 150));
 if(!target)target=new THREE.Vector3();
 if(!built||!userMoved)applyPreset(presetName||'iso');
 built=true;
 const aim=presetName==='profile'||presetName==='plan'?L*0.5:L*0.22;
 target.set(aim,0,Z((crest+Math.min(p.invIn,p.invOut))/2));
 look();
 const note=document.getElementById('v3note');
 if(note){note.hidden=false;note.textContent=(endKind(p)==='miter'?'Mitered end':endKind(p)==='project'?'Projecting end':'Headwall')+' · '+(metal?'corrugated metal':'concrete')+' · exaggeration '+vex+'×'+(vex===1?' (true scale)':'');}
}
function fmt(x){return isFinite(x)?(+x).toFixed(2):'—';}
function addBox(g,b,mat,inner){
 const len=b.length,B=b.B,D=b.D,t=b.wall;
 const piece=(sx,sy,sz,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);};
 piece(len,B+2*t,t,len/2,0,t/2);
 piece(len,B+2*t,t,len/2,0,D-t/2);
 piece(len,t,D,len/2,-(B/2+t/2),D/2);
 piece(len,t,D,len/2,(B/2+t/2),D/2);
}
function addCirc(g,b,mat,inner){
 const R=b.D/2,t=b.wall,len=b.length;
 const outer=new THREE.Mesh(new THREE.CylinderGeometry(R+t,R+t,len,48,1,true),mat);
 outer.geometry.rotateZ(Math.PI/2);outer.position.set(len/2,0,R);outer.castShadow=outer.receiveShadow=true;g.add(outer);
 const inn=new THREE.Mesh(new THREE.CylinderGeometry(R,R,len+0.05,48,1,true),inner);
 inn.geometry.rotateZ(Math.PI/2);inn.position.set(len/2,0,R);g.add(inn);
 [0,len].forEach(x=>{const ring=new THREE.Mesh(new THREE.RingGeometry(R*0.98,R+t,40),mat);ring.position.set(x,0,R);ring.rotation.y=Math.PI/2;ring.castShadow=true;g.add(ring);});
}
function addPoly(g,b,mat,inner){
 const pts=b.section.poly, xs=pts.map(q=>q[0]), mid=(Math.min(...xs)+Math.max(...xs))/2;
 const shape=new THREE.Shape();shape.moveTo(pts[0][0]-mid,pts[0][1]);for(let i=1;i<pts.length;i++)shape.lineTo(pts[i][0]-mid,pts[i][1]);
 const hole=new THREE.Path(), sc=0.86, cx=0, cy=b.D/2;
 hole.moveTo((pts[0][0]-mid)*sc,(pts[0][1]-cy)*sc+cy);
 for(let i=1;i<pts.length;i++)hole.lineTo((pts[i][0]-mid)*sc,(pts[i][1]-cy)*sc+cy);
 shape.holes.push(hole);
 const geo=new THREE.ExtrudeGeometry(shape,{depth:b.length,bevelEnabled:false});
 const pos=geo.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);pos.setXYZ(i,z,x,y);}
 geo.computeVertexNormals();
 const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;g.add(m);
}
function addWater(b){
 const prof=b.profile&&b.profile.length?b.profile:[[0,Math.min(b.D*0.5,1)],[b.length,Math.min(b.D*0.5,1)]];
 const n=Math.min(24,prof.length), pts=[];
 for(let i=0;i<n;i++){const q=prof[Math.round(i*(prof.length-1)/(n-1))];pts.push(q);}
 const pos=[];
 const inv=x=>b.invIn+(b.invOut-b.invIn)*x/b.length;
 for(let i=0;i<pts.length-1;i++){
  const a=pts[i],c=pts[i+1];
  [a,c].forEach(()=>{});
  const seg=(x,d)=>{
   const z=inv(x)+Math.max(0.05,Math.min(d,b.D*0.98));
   let hw;
   if(b.shape==='box'||b.shape==='sdbox') hw=b.B/2-b.wall;
   else {const r=b.D/2, yy=Math.max(0.05,Math.min(d,b.D-0.02));hw=Math.sqrt(Math.max(0,r*r-(r-yy)*(r-yy)))*0.96;}
   return {x,z,hw};
  };
  const A=seg(a[0],a[1]),B=seg(c[0],c[1]);
  const push=(x,y,z)=>pos.push(x,b.yc+y,zOfW(z));
  // top
  push(A.x,-A.hw,A.z);push(B.x,-B.hw,B.z);push(B.x,B.hw,B.z);
  push(A.x,-A.hw,A.z);push(B.x,B.hw,B.z);push(A.x,A.hw,A.z);
 }
 if(pos.length<9)return;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,live.water);
 mesh.renderOrder=2;world.add(mesh);
}
 let zOfW=e=>e, live=null;
function addPools(p,r,Z,surf,x0,xMax,yMax,mat){
 zOfW=Z;
 const pool=(xA,xB,elev)=>{
  if(!(elev>0))return;const pos=[];const nx=18,ny=14;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
   const xa=xA+(xB-xA)*i/nx,xb=xA+(xB-xA)*(i+1)/nx,ya=-yMax*0.55+2*yMax*0.55*j/ny,yb=-yMax*0.55+2*yMax*0.55*(j+1)/ny;
   const corners=[[xa,ya],[xb,ya],[xb,yb],[xa,yb]];
   const midY=(ya+yb)/2, midX=(xa+xb)/2;
   const chan=Math.max(8, 14)+Math.max(0,elev- (typeof bedAt==='function'?0:0))*0;
   if(Math.abs(midY)>Math.max(18, (elev-(p.invIn||elev))*3+10))continue;
   if(corners.some(([x,y])=>surf(x,y)>elev+0.15))continue;
   const t=(a,b,c)=>{[a,b,c].forEach(q=>pos.push(q[0],q[1],Z(elev)));};
   t(corners[0],corners[1],corners[2]);t(corners[0],corners[2],corners[3]);
  }
  if(pos.length<9)return;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.renderOrder=2;world.add(m);
 };
 pool(Math.max(x0,-40),0.2,r.EL);
 if(p.twMode==='const')pool(p.length,xMax,Math.max(p.twElev,p.invOut));
 if(r.EL> (surf(p.length/2,0)+0.2) && document.getElementById('crestEl')){
  const crest=+document.getElementById('crestEl').value;if(r.EL>crest)pool(p.length/2-20,p.length/2+20,r.EL);
 }
}
function addEnds(bars,shell,head,metal){
 const kind=endKind(latest.p);
 const face=(x,sign)=>{
  if(kind==='project'&&sign<0)return;
  if(kind==='miter'&&sign<0){miter(x,sign);return;}
  const yL=bars[0].yc-bars[0].B/2-1.4, yR=bars[bars.length-1].yc+bars[bars.length-1].B/2+1.4;
  const z0=Math.min(...bars.map(b=>sign<0?b.invIn:b.invOut))-1.1;
  const z1=Math.max(...bars.map(b=> (sign<0?b.invIn:b.invOut)+b.D))+1.3;
  const t=0.7, xf=x+sign*(-0.35);
  const beam=(w,h,px,py,pz)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(t,w,h*vex),head);m.position.set(px,py,zOfW(pz));m.castShadow=true;world.add(m);};
  beam(yR-yL,1.1,xf,(yL+yR)/2,z0+0.55);
  beam(yR-yL,1.3,xf,(yL+yR)/2,z1-0.65);
  beam(1.3,(z1-z0),xf,yL+0.65,(z0+z1)/2);
  beam(1.3,(z1-z0),xf,yR-0.65,(z0+z1)/2);
  for(let i=0;i<bars.length-1;i++){const pierY=(bars[i].yc+bars[i].B/2+bars[i+1].yc-bars[i+1].B/2)/2;beam(Math.max(0.6,bars[i].wall*2),(z1-z0)*0.7,xf,pierY,(z0+z1)/2);}
  if(sign<0){wing(xf,yL,z0,z1,-1);wing(xf,yR,z0,z1,1);}
 };
 const wing=(x,y,z0,z1,side)=>{
  const h=Math.max(2,(z1-z0)*0.72);
  const m=new THREE.Mesh(new THREE.BoxGeometry(7,0.55,h*vex),head);
  m.position.set(x-2.6, y+side*3.4, zOfW(z0+h*0.45));
  m.rotation.z=side*0.42;m.castShadow=true;world.add(m);
 };
 const miter=(x,sign)=>{
  bars.forEach(b=>{const inv=sign<0?b.invIn:b.invOut;const m=new THREE.Mesh(new THREE.BoxGeometry(0.4,b.B+1,b.D*vex),head);
   m.position.set(x+sign*(-0.2),b.yc,zOfW(inv+b.D/2));m.rotation.y=sign*0.6;world.add(m);});
 };
 face(0,-1);face(latest.p.length,1);
}
function addApron(L,len,width,inv,Z,mat){
 const m=new THREE.Mesh(new THREE.BoxGeometry(len,Math.max(width,8),0.35*vex),mat);
 m.position.set(L+len/2,0,Z(inv)+0.15*vex);m.receiveShadow=true;m.castShadow=true;world.add(m);
}
function addLines(p,r,Z){
 const inv=x=>p.invIn+(p.invOut-p.invIn)*(x/p.length);
 const line=(idx,color)=>{
  const pts=(r.hgl||[]).filter(q=>isFinite(q[idx])).map(q=>new THREE.Vector3(q[0],0.2,Z(inv(q[0])+q[idx])));
  if(pts.length<2)return;
  const g=new THREE.BufferGeometry().setFromPoints(pts);
  const m=new THREE.LineDashedMaterial({color,dashSize:1.2,gapSize:.6});
  const ln=new THREE.Line(g,m);ln.computeLineDistances();world.add(ln);
 };
 line(1,0x1e7a46);line(2,0xb86b00);
}
function addArrow(p,r,Z){
 const y=0,z=Z(r.EL+0.4);
 const len=Math.max(5,Math.min(9,r.D*1.1));
 const matA=new THREE.MeshStandardMaterial({color:0xf4f8fc,roughness:.35,emissive:0x223040,emissiveIntensity:.25});
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,len,10),matA);
 shaft.rotation.z=-Math.PI/2;shaft.position.set(-10-len/2,y,z);world.add(shaft);
 const head=new THREE.Mesh(new THREE.ConeGeometry(0.85,2.1,14),matA);
 head.rotation.z=-Math.PI/2;head.position.set(-9,y,z);world.add(head);
}

function snapshot(){
 if(!renderer||!scene||!camera)return null;
 const wrap=document.getElementById('v3wrap');
 const prev=renderer.getSize(new THREE.Vector2());
 const aspect=camera.aspect;
 renderer.setPixelRatio(1);renderer.setSize(1400,780,false);camera.aspect=1400/780;camera.updateProjectionMatrix();
 fitLabels();renderer.render(scene,camera);
 let url=null;try{url=renderer.domElement.toDataURL('image/jpeg',0.86);}catch(e){url=null;}
 renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
 renderer.setSize(prev.x,prev.y,false);camera.aspect=aspect;camera.updateProjectionMatrix();
 if(wrap)renderer.setSize(wrap.clientWidth||prev.x,wrap.clientHeight||prev.y,false);
 return url;
}

window.View3D={
 update(anchor,data){latest=data;card(anchor);if(failed)return;if(!THREE)boot();else rebuild(data);},
 snapshot,
 ready(){return !!THREE&&built;}
};
})();
