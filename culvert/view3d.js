/* Dimetric (2:1) tile view of one culvert crossing, drawn like a RollerCoaster Tycoon park.
   s runs along the barrel (0 at the inlet face, L at the outlet face). t runs along the road.
   The embankment base is that full barrel length and the crest is centered on s = L/2.
   Sprites are canvas pixels. There is no 3D mesh. */
(function(){
const cardId='isocard';
const TILE=4, HW=8, HH=4, INK='#1c140e';
const GRASS='#3f7d34';
let canvas, ctx, built=false, failed=false, latest=null;
let zoom=2, rot=0, panX=0, panY=0, focus=null, showLines=true, vex=2, presetName='rot0';
let model=null, raf=0, drag=null, axes=null, originCache={x:0,y:0};

function el(html){const d=document.createElement('div');d.innerHTML=html;return d.firstElementChild;}
function card(anchor){
 let host=document.getElementById(cardId);
 if(host)return host;
 host=el(`<div class="card" id="${cardId}"><h3>3D crossing <small>(dimetric tiles, drag to pan)</small></h3>
  <div id="v3bar">
   <button type="button" data-v3="rot0">North</button>
   <button type="button" data-v3="rot1">East</button>
   <button type="button" data-v3="rot2">South</button>
   <button type="button" data-v3="rot3">West</button>
   <button type="button" data-v3="z1">1×</button>
   <button type="button" data-v3="z2">2×</button>
   <button type="button" data-v3="z3">3×</button>
   <button type="button" data-v3="reset">Reset</button>
   <label>Vertical exaggeration <input id="v3ex" type="range" min="1" max="6" step="0.5" value="2"> <b id="v3exl">2×</b></label>
   <label><input id="v3lines" type="checkbox" checked> HGL / EGL</label>
  </div>
  <div id="v3wrap"><div id="v3fallback">Loading crossing…</div><svg id="v3leaders"></svg><div id="v3labels"></div><div id="v3note" hidden></div></div></div>`);
 anchor.after(host);
 host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!b.dataset.v3)return;const k=b.dataset.v3;
  if(k==='reset'){vex=2;zoom=0;rot=0;panX=panY=0;focus=null;presetName='rot0';showLines=true;const s=document.getElementById('v3ex');if(s)s.value='2';const c=document.getElementById('v3lines');if(c)c.checked=true;document.getElementById('v3exl').textContent='2×';if(latest)rebuild(latest);}
  else if(k[0]==='z'){zoom=+k.slice(1);markZoom();}
  else if(k.slice(0,3)==='rot'){rot=+k.slice(3);focus=null;panX=panY=0;presetName=k;markRot();}
 });
 host.addEventListener('input',e=>{
  if(e.target.id==='v3ex'){vex=+e.target.value||1;document.getElementById('v3exl').textContent=vex+'×';if(latest)rebuild(latest);}
  if(e.target.id==='v3lines'){showLines=e.target.checked;}
 });
 return host;
}
function markRot(){document.querySelectorAll('#v3bar button').forEach(b=>b.classList.toggle('on',b.dataset.v3===('rot'+rot)));}
function markZoom(){document.querySelectorAll('#v3bar [data-v3^="z"]').forEach(b=>b.classList.toggle('on',b.dataset.v3==='z'+zoom));}
function showFallback(msg){failed=true;const w=document.getElementById('v3wrap');if(!w)return;
 w.innerHTML=`<div id="v3fallback">The crossing view needs a canvas, which is not available here. The profile above is still drawn to the computed elevations. ${msg?('('+msg+')'):''}</div>`;}
function endKind(p){const id=(p.inlet&&p.inlet.id)||'', name=(p.inlet&&p.inlet.name)||'';
 if(/mit/.test(id)||/miter/i.test(name))return 'miter';
 if(/_pr|project/i.test(id)||/project/i.test(name))return 'project';
 return 'headwall';}
function metalOf(p){return p.material==='cmp'||p.material==='spiral'||(/^(m_|hyc_)/.test((p.inlet&&p.inlet.id)||'')&&/cmp|metal|corrug/i.test((p.inlet&&p.inlet.name)||''));}
function barrelsOf(data){
 const p=data.p,r=data.r;
 if(r.crossing&&r.crossing.parts&&r.crossing.parts.length){
  const extras=(typeof state!=='undefined'&&state.extras)||[];
  return r.crossing.parts.map((pt,i)=>{
   const ex=i===0?null:extras[i-1];
   const shape=i===0?p.shape:(ex&&ex.shape)||'circular';
   const rr=pt.r||r;
   return {shape,B:rr.B||(shape==='box'?+(ex&&ex.span):+(ex&&ex.rise)),D:rr.D,invIn:i===0?p.invIn:+(ex&&ex.invIn),invOut:i===0?p.invOut:+(ex&&ex.invOut),t:0};
  });
 }
 const N=Math.max(1,r.N||1);
 return Array.from({length:N},()=>({shape:p.shape,B:r.B,D:r.D,invIn:p.invIn,invOut:p.invOut,t:0}));
}
function hash(x,y){let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=(n^n>>>13)>>>0;return n;}

function rebuild(data){
 const p=data.p, r=data.r, ro=data.ro;
 const L=Math.max(p.length,1);
 const bars=barrelsOf(data).filter(b=>b.D>0&&b.B>0);
 if(!bars.length||!window.CrossingFrame)return;
 const gap=Math.max(1.5,0.35*Math.max.apply(null,bars.map(b=>b.B)));
 const widths=bars.map(b=>Math.max(b.B,b.D)+1.4);
 const total=widths.reduce((s,w)=>s+w,0)+gap*(bars.length-1);
 let cursor=-total/2;
 bars.forEach((b,i)=>{b.t=cursor+widths[i]/2;cursor+=widths[i]+gap;b.circ=b.shape==='circular'||(b.shape!=='box'&&b.shape!=='sdbox');});
 const rise=Math.max.apply(null,bars.map(b=>b.D));
 let crest=Math.max(p.invIn,p.invOut)+rise*1.8+2;
 if(ro&&window.Culvert&&Culvert.crestMin) crest=Culvert.crestMin(ro);
 const bedIn=p.invIn, bedOut=p.invOut;
 const fp=Math.min(crest-3, Math.max(bedIn,bedOut)+Math.max(4, rise*0.85));
 let roadLen=150;
 try{const cl=+document.getElementById('crestLen').value;if(cl>48)roadLen=cl;}catch(e){}
 roadLen=Math.max(88, Math.min(roadLen, Math.max(112, Math.min(190, L*1.15))));
 let pave=32;
 if(ro&&ro.Lr>12) pave=Math.max(18, Math.min(42, ro.Lr));
 let fillZ=3;
 try{const z=+document.getElementById('fillZ').value;if(z>=1.5&&z<=8)fillZ=z;}catch(e){}
 const lay=CrossingFrame.crossingLayout({
  L:L, crest:crest, fp:fp, bedIn:bedIn, bedOut:bedOut, crestLen:roadLen, paveW:pave,
  halfBot:Math.max(8, total*0.55+2), halfBank:Math.max(16, total*0.55+rise*1.4),
  sideRun:Math.max(14, (crest-fp)*fillZ)
 });
 const approach=Math.max(36, lay.halfBank+6);
 const plot={s0:-approach,s1:L+approach,t0:-(lay.halfRoad+lay.sideRun+12),t1:lay.halfRoad+lay.sideRun+12,foundation:Math.min(bedIn,bedOut)-5};
 const ck=CrossingFrame.layoutCheck(lay);
 axes=CrossingFrame.crossingAxes(p.skewDeg||0);
 const dot=axes.road.x*axes.barrel.x+axes.road.y*axes.barrel.y;
 model={p,r,ro,L,bars,lay,plot,gap,kind:endKind(p),metal:metalOf(p),ck,
  hw:r.EL, tw:p.twMode==='const'?Math.max(p.twElev, bedOut+0.15):bedOut+0.55,
  apron:Math.max(10, Math.min(28, rise*3)), zRef:plot.foundation, zScale:4*vex};
 focus=null;panX=panY=0;zoom=0;
 const note=document.getElementById('v3note');
 if(note){note.hidden=false;note.textContent=(model.kind==='headwall'?'Headwall and wingwalls':model.kind)+' · '+(model.metal?'corrugated metal':'concrete')+' · road across the barrel'+(Math.abs(dot)<1e-6?' · perpendicular':' · skew '+(p.skewDeg||0)+'°')+(ck.ok?' · crest centered':'')+' · exaggeration '+vex+'×';}
 built=true;
}

function outside(s,t){const b=model.plot;return s<b.s0||s>b.s1||t<b.t0||t>b.t1;}
function groundRaw(s,t){if(outside(s,t))return model.plot.foundation;return CrossingFrame.groundAt(model.lay,s,t);}
function tileH(s,t){return Math.round(groundRaw(s,t));}
function waterElev(s,t){
 if(outside(s,t))return null;
 const lay=model.lay, g=groundRaw(s,t), hw=model.hw, tw=model.tw;
 if(s<lay.sMid && hw>g+0.35 && (s<lay.sCrest0||hw>lay.crest)) return hw;
 if(s>lay.sMid && tw>g+0.25 && (s>lay.sCrest1||tw>lay.crest)) return tw;
 return null;
}
function visibleZ(s,t){
 if(outside(s,t))return model.plot.foundation;
 const g=tileH(s,t), w=waterElev(s,t);
 return w!=null&&w>g?w:g;
}
function isRoad(s,t){const lay=model.lay;return s>=lay.sCrest0-0.2&&s<=lay.sCrest1+0.2&&Math.abs(t)<=lay.halfRoad+0.2;}
function isRiprap(s,t){return s>model.L&&s<model.L+model.apron&&Math.abs(t)<model.lay.halfBot+4;}

function viewOf(s,t){
 const b=axes.barrel, rd=axes.road;
 let x=s*b.x+t*rd.x, y=s*b.y+t*rd.y;
 if(rot===1){const a=x;x=-y;y=a;}
 else if(rot===2){x=-x;y=-y;}
 else if(rot===3){const a=x;x=y;y=-a;}
 return {x,y};
}
function project(s,t,z){
 const v=viewOf(s,t);
 return {x:(v.x-v.y)/TILE*HW, y:(v.x+v.y)/TILE*HH-(z-model.zRef)*model.zScale};
}
function frontDirs(){
 if(rot===1) return [[1,0],[0,-1]];
 if(rot===2) return [[-1,0],[0,-1]];
 if(rot===3) return [[-1,0],[0,1]];
 return [[1,0],[0,1]];
}
function edgeAt(tx,ty,dx,dy,z){
 const s=tx*TILE, t=ty*TILE;
 if(dx===1) return [project(s+TILE,t,z),project(s+TILE,t+TILE,z)];
 if(dx===-1) return [project(s,t,z),project(s,t+TILE,z)];
 if(dy===1) return [project(s,t+TILE,z),project(s+TILE,t+TILE,z)];
 return [project(s,t,z),project(s+TILE,t,z)];
}
function poly(g,pts,fill){
 g.beginPath();
 g.moveTo(pts[0].x|0,pts[0].y|0);
 for(let i=1;i<pts.length;i++) g.lineTo(pts[i].x|0,pts[i].y|0);
 g.closePath();
 g.fillStyle=fill;g.fill();
 g.strokeStyle=INK;g.lineWidth=1;g.stroke();
}
function band(g,a,b,y0,y1,fill){
 poly(g,[{x:a.x,y:a.y+y0},{x:b.x,y:b.y+y0},{x:b.x,y:b.y+y1},{x:a.x,y:a.y+y1}],fill);
 g.strokeStyle='#5a3a28';g.beginPath();g.moveTo(a.x|0,(a.y+y1)|0);g.lineTo(b.x|0,(b.y+y1)|0);g.stroke();
}
function grassColor(tx,ty){return ['#3e8c30','#4c9a3a','#367a28','#58a844'][hash(tx,ty)%4];}
function drawTop(g,pts,kind,tx,ty){
 const col=kind==='road'?'#32383e':kind==='water'?'#2a86b4':kind==='rock'?'#7a6e60':kind==='pebble'?'#c4a06e':kind==='bank'?'#9a7048':grassColor(tx,ty);
 poly(g,pts,col);
 const cx=((pts[0].x+pts[2].x)/2)|0, cy=((pts[0].y+pts[2].y)/2)|0;
 if(kind==='grass'||kind==='bank'){
  const h=hash(tx,ty);
  if(h%3===0){g.fillStyle=kind==='bank'?'#c49a6a':'#8ed060';g.fillRect(cx-1,cy-2,1,2);}
  if(h%5===0){g.fillStyle=kind==='bank'?'#6b4a30':'#2f6e22';g.fillRect(cx+2,cy+1,1,1);}
 }
 if(kind==='road'){
  const lay=model.lay, s=tx*TILE+TILE/2;
  g.lineWidth=1;
  if(Math.abs(s-lay.sCrest0)<TILE){g.strokeStyle='#f4f4f0';g.beginPath();g.moveTo(pts[0].x|0,pts[0].y|0);g.lineTo(pts[3].x|0,pts[3].y|0);g.stroke();}
  if(Math.abs(s-lay.sCrest1)<TILE){g.strokeStyle='#f4f4f0';g.beginPath();g.moveTo(pts[1].x|0,pts[1].y|0);g.lineTo(pts[2].x|0,pts[2].y|0);g.stroke();}
  if(Math.abs(s-lay.sMid)<TILE*0.8 && ((ty|0)%2)===0){
   g.strokeStyle='#e6c040';
   const a={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}, b={x:(pts[3].x+pts[2].x)/2,y:(pts[3].y+pts[2].y)/2};
   g.beginPath();g.moveTo(a.x|0,a.y|0);g.lineTo(b.x|0,b.y|0);g.stroke();
  }
 }
 if(kind==='rock'||kind==='pebble'){
  g.fillStyle='#efe6d6';g.fillRect(cx-2,cy,2,1);
  g.fillStyle='#4a4038';g.fillRect(cx+2,cy+1,2,1);
 }
 if(kind==='water'){
  const f=(model.wave|0);
  g.fillStyle=(hash(tx+f,ty)%3)?'#d8f4ff':'#8fd0ea';
  g.fillRect(cx-3+((tx+f)%4),cy,3,1);
  g.fillRect(cx+2,cy+2,2,1);
 }
}

function tileKind(s,t){
 const w=waterElev(s,t), g=tileH(s,t);
 if(w!=null&&w>g+0.2&&!isRoad(s,t)) return 'water';
 if(isRoad(s,t)&&Math.abs(groundRaw(s,t)-model.lay.crest)<1.2) return 'road';
 if(isRiprap(s,t)) return 'rock';
 const lay=model.lay;
 if((s<lay.toeIn+TILE||s>lay.toeOut-TILE)&&Math.abs(t)<=lay.halfBot) return 'pebble';
 if((s<lay.toeIn||s>lay.toeOut)&&Math.abs(t)>lay.halfBot&&Math.abs(t)<lay.halfBank) return 'bank';
 return 'grass';
}
function bounds(){
 const M=model;
 if(focus) return {s0:focus.s-focus.span,s1:focus.s+focus.span,t0:focus.t-focus.span,t1:focus.t+focus.span};
 return {s0:M.plot.s0,s1:M.plot.s1,t0:M.plot.t0,t1:M.plot.t1};
}
function tiles(){
 const b=bounds(), out=[];
 const tx0=Math.floor(b.s0/TILE), tx1=Math.ceil(b.s1/TILE);
 const ty0=Math.floor(b.t0/TILE), ty1=Math.ceil(b.t1/TILE);
 for(let ty=ty0;ty<ty1;ty++)for(let tx=tx0;tx<tx1;tx++){
  const s=tx*TILE+TILE/2, t=ty*TILE+TILE/2;
  if(outside(s,t)) continue;
  out.push({tx,ty,s,t});
 }
 out.sort((a,c)=>{
  const pa=viewOf(a.tx*TILE,a.ty*TILE), pb=viewOf(c.tx*TILE,c.ty*TILE);
  return (pa.x+pa.y)-(pb.x+pb.y);
 });
 return out;
}
function paint(g,origin){
 const list=tiles(), dirs=frontDirs(), sc=model.zScale;
 list.forEach(tile=>{
  const gnd=tileH(tile.s,tile.t);
  const wet=waterElev(tile.s,tile.t);
  const topZ=wet!=null&&wet>gnd?wet:gnd;
  dirs.forEach((d,i)=>{
   const ns=tile.s+d[0]*TILE, nt=tile.t+d[1]*TILE;
   const nb=visibleZ(ns,nt);
   if(topZ-nb<0.2) return;
   const lit=i===0?'#c4895c':'#8d5e3c';
   const edge=edgeAt(tile.tx,tile.ty,d[0],d[1],topZ);
   edge.forEach(p=>{p.x+=origin.x;p.y+=origin.y;});
   const waterCut=wet!=null&&wet>gnd?Math.max(0,(wet-Math.max(gnd,nb))*sc):0;
   const dirtTop=wet!=null&&wet>gnd?Math.min(wet,Math.max(gnd,nb)):topZ;
   const dirtDrop=Math.max(0,(dirtTop-nb)*sc);
   if(waterCut>1) band(g,edge[0],edge[1],0,waterCut+1,'#1d6f99');
   if(dirtDrop>1) band(g,edge[0],edge[1],(topZ-dirtTop)*sc,((topZ-dirtTop)*sc)+dirtDrop+1,lit);
  });
  const z=topZ;
  const N=project(tile.tx*TILE,tile.ty*TILE,z);
  const E=project(tile.tx*TILE+TILE,tile.ty*TILE,z);
  const S=project(tile.tx*TILE+TILE,tile.ty*TILE+TILE,z);
  const W=project(tile.tx*TILE,tile.ty*TILE+TILE,z);
  [N,E,S,W].forEach(p=>{p.x+=origin.x;p.y+=origin.y;});
  const kind=tileKind(tile.s,tile.t);
  drawTop(g,[N,E,S,W],kind,tile.tx,tile.ty);
  const flat=!(kind==='road'||kind==='water'||kind==='rock')&&groundRaw(tile.s,tile.t)<model.lay.fp+0.8;
  if(kind==='grass'&&flat&&hash(tile.tx,tile.ty)%11===0) drawTree(g,(N.x+S.x)/2,(N.y+S.y)/2,hash(tile.tx,tile.ty)%3);
  else if(kind==='grass'&&flat&&hash(tile.tx,tile.ty)%17===0){
   g.fillStyle=['#e85d8c','#f2d24a','#ffffff'][hash(tile.ty,tile.tx)%3];
   g.fillRect(((N.x+S.x)/2)|0,((N.y+S.y)/2-2)|0,2,2);
  }
  if(kind==='road'&&(tile.ty%5)===0){
   const lay=model.lay;
   if(Math.abs(tile.s-lay.sCrest0)<TILE){const c={x:(N.x+W.x)/2,y:(N.y+W.y)/2};post(g,c.x,c.y);}
   if(Math.abs(tile.s-lay.sCrest1)<TILE){const c={x:(E.x+S.x)/2,y:(E.y+S.y)/2};post(g,c.x,c.y);}
  }
 });
 const lim=bounds();
 const ends=[];
 model.bars.forEach(b=>{
  if(0>=lim.s0-8&&0<=lim.s1+8) ends.push({s:model.lay.toeIn-0.2,b:b,inlet:true});
  if(model.L>=lim.s0-8&&model.L<=lim.s1+8) ends.push({s:model.lay.toeOut+0.2,b:b,inlet:false});
 });
 ends.sort((a,c)=>(viewOf(a.s,a.b.t).x+viewOf(a.s,a.b.t).y)-(viewOf(c.s,c.b.t).x+viewOf(c.s,c.b.t).y));
 ends.forEach(e=>drawPortal(g,origin,e.s,e.b,e.inlet));
 drawCars(g,origin);
 if(showLines&&model.r.hgl&&!focus) drawHGL(g,origin);
}
function post(g,x,y){g.fillStyle='#d9d3c8';g.fillRect((x-1)|0,(y-8)|0,2,8);g.fillStyle='#f7f4ee';g.fillRect((x-3)|0,(y-9)|0,6,2);}
function drawTree(g,x,y,k){
 g.fillStyle='#5c3a22';g.fillRect((x-1)|0,(y-6)|0,2,6);
 g.fillStyle=k?'#2f6a24':'#3e8a30';g.fillRect((x-5)|0,(y-12)|0,10,6);
 g.fillStyle='#6fbf48';g.fillRect((x-3)|0,(y-15)|0,6,4);
 g.fillStyle='#d5f0a0';g.fillRect((x-1)|0,(y-16)|0,2,2);
}
function worldPoly(g,origin,pts,fill){
 poly(g,pts.map(p=>{const q=project(p[0],p[1],p[2]);q.x+=origin.x;q.y+=origin.y;return q;}),fill);
}
function drawPortal(g,origin,s,b,inlet){
 const into=inlet?1:-1;
 const z0=inlet?b.invIn:b.invOut;
 const crown=z0+b.D, top=crown+1.15;
 const half=b.circ?b.D/2:b.B/2;
 const face=half+2.4;
 const courses=5;
 for(let i=0;i<courses;i++){
  const za=z0-0.25+(top-(z0-0.25))*i/courses;
  const zb=z0-0.25+(top-(z0-0.25))*(i+1)/courses;
  const lit=i%2?'#e7dcc8':'#f4ecdf';
  const sh=i%2?'#b7a890':'#cfc3aa';
  worldPoly(g,origin,[[s,b.t-face,za],[s,b.t,za],[s,b.t,zb],[s,b.t-face,zb]],inlet?lit:sh);
  worldPoly(g,origin,[[s,b.t,za],[s,b.t+face,za],[s,b.t+face,zb],[s,b.t,zb]],inlet?sh:lit);
 }
 worldPoly(g,origin,[
  [s-0.35*into,b.t-face-0.7,top],
  [s-0.35*into,b.t+face+0.7,top],
  [s+0.85*into,b.t+face+0.7,top+0.55],
  [s+0.85*into,b.t-face-0.7,top+0.55]
 ],'#f7f1e4');
 if(model.kind==='headwall'){
  const wLen=Math.min(14, Math.max(7, model.L*0.12));
  const reach=Math.min(face+7, face+Math.max(3, model.gap*0.45));
  [-1,1].forEach(side=>{
   const t0=b.t+side*face, t1=b.t+side*reach;
   const tipS=s+into*wLen;
   const gz=groundRaw(tipS,t1);
   const tipTop=Math.max(z0+1.1, Math.min(top-0.4, gz+1.3));
   worldPoly(g,origin,[
    [s,t0,z0-0.1],[tipS,t1,z0-0.1],[tipS,t1,tipTop],[s,t0,top-0.15]
   ],side<0?'#efe4d2':'#cbbba2');
  });
 }
 const rim=openingPts(s,b.t,z0,b,1.16);
 const hole=openingPts(s,b.t,z0,b,1);
 worldPoly(g,origin,rim,model.metal?'#d5dee6':'#f3efe6');
 worldPoly(g,origin,hole,'#101418');
 if(model.metal&&b.circ){
  g.strokeStyle='#9aa7b2';g.lineWidth=1;
  trace(g,origin,openingPts(s,b.t,z0,b,0.72),false);
  trace(g,origin,openingPts(s,b.t,z0,b,0.46),false);
 }
}
function openingPts(s,t,z0,b,k){
 if(!b.circ){
  const hw=b.B/2*k, h=b.D*k, zc=z0+b.D/2;
  return [[s,t-hw,zc-h/2],[s,t+hw,zc-h/2],[s,t+hw,zc+h/2],[s,t-hw,zc+h/2]];
 }
 const pts=[], n=16, rad=b.D/2*k, zc=z0+b.D/2;
 for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pts.push([s, t+Math.cos(a)*rad, zc+Math.sin(a)*rad]);}
 return pts;
}
function trace(g,origin,pts,close){
 g.beginPath();
 pts.forEach((p,i)=>{const q=project(p[0],p[1],p[2]);const x=q.x+origin.x,y=q.y+origin.y;if(i)g.lineTo(x,y);else g.moveTo(x,y);});
 if(close)g.closePath();
 g.stroke();
}
function drawCars(g,origin){
 const lay=model.lay, s=lay.sMid, span=lay.halfRoad*0.72;
 const t1=((performance.now()*0.012)%(span*2))-span;
 const t2=span-((performance.now()*0.009)%(span*2));
 [[t1,'#c0392b'],[t2,'#2c6eaa']].forEach(([t,col])=>{
  if(Math.abs(t)>lay.halfRoad-4) return;
  const p=project(s,t,lay.crest+0.35);p.x+=origin.x;p.y+=origin.y;
  g.fillStyle=col;g.fillRect((p.x-5)|0,(p.y-5)|0,10,4);
  g.fillStyle='#d6f2ff';g.fillRect((p.x-2)|0,(p.y-7)|0,4,2);
  g.fillStyle=INK;g.fillRect((p.x-4)|0,(p.y-2)|0,2,2);g.fillRect((p.x+2)|0,(p.y-2)|0,2,2);
 });
}
function drawHGL(g,origin){
 const inv=x=>model.p.invIn+(model.p.invOut-model.p.invIn)*(x/model.L);
 g.strokeStyle='#1e7a46';g.lineWidth=1;g.setLineDash([3,2]);g.beginPath();
 let pen=false;
 (model.r.hgl||[]).forEach(q=>{
  if(!isFinite(q[1])){pen=false;return;}
  const z=inv(q[0])+q[1];
  const buried=q[0]>1&&q[0]<model.L-1&&z<groundRaw(q[0],0)-0.35;
  if(buried){pen=false;return;}
  const p=project(q[0],0,z);
  const x=p.x+origin.x, y=p.y+origin.y;
  if(!pen){g.moveTo(x,y);pen=true;}else g.lineTo(x,y);
 });
 g.stroke();g.setLineDash([]);
}
function sceneBox(){
 const b=bounds();
 const zs=[model.plot.foundation, model.lay.fp, model.lay.crest, model.hw, model.tw];
 let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
 [[b.s0,b.t0],[b.s1,b.t0],[b.s0,b.t1],[b.s1,b.t1]].forEach(([s,t])=>{
  zs.forEach(z=>{const p=project(s,t,z);
   if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;});
 });
 return {minX,minY,maxX,maxY,w:maxX-minX+8,h:maxY-minY+8};
}
function chooseZoom(){
 if(zoom) return;
 const wrap=document.getElementById('v3wrap');
 const box=sceneBox();
 const W=wrap.clientWidth||800, H=wrap.clientHeight||420;
 let z=1;
 while(z<4 && box.w*(z+1)<=W-4 && box.h*(z+1)<=H-4) z++;
 if(box.w*z<W*0.86 && box.h*z<H*0.86 && z<4) z++;
 zoom=z; markZoom();
}
function resize(){
 const wrap=document.getElementById('v3wrap');if(!wrap||!canvas)return;
 const z=zoom||1;
 const iw=Math.max(160,Math.floor((wrap.clientWidth||640)/z));
 const ih=Math.max(120,Math.floor((wrap.clientHeight||360)/z));
 if(canvas.width!==iw||canvas.height!==ih){canvas.width=iw;canvas.height=ih;}
 canvas.style.width=(iw*z)+'px';canvas.style.height=(ih*z)+'px';
}
function renderAt(iw,ih){
 const box=sceneBox();
 const ox=iw/2-(box.minX+box.maxX)/2+panX/(zoom||1);
 const oy=ih/2-(box.minY+box.maxY)/2+panY/(zoom||1);
 ctx.save();
 ctx.imageSmoothingEnabled=false;
 ctx.fillStyle=GRASS;ctx.fillRect(0,0,iw,ih);
 paint(ctx,{x:ox,y:oy});
 ctx.restore();
 return {x:ox,y:oy};
}
function frame(){
 if(!model||!ctx)return;
 model.zScale=4*vex;
 model.wave=(performance.now()/180)|0;
 if(!zoom) chooseZoom();
 resize();
 originCache=renderAt(canvas.width,canvas.height);
 placeLabels();
 markRot();
}
function boot(){
 if(canvas||failed)return;
 const wrap=document.getElementById('v3wrap');if(!wrap)return;
 canvas=document.createElement('canvas');
 ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx){showFallback('no canvas');return;}
 wrap.querySelector('#v3fallback')?.remove();
 wrap.appendChild(canvas);
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;panX+=e.clientX-drag.x;panY+=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;});
 canvas.addEventListener('pointerup',()=>{drag=null;});
 new ResizeObserver(()=>{}).observe(wrap);
 (function loop(){raf=requestAnimationFrame(loop);if(built)frame();})();
}
function labelAnchors(){
 if(!model)return [];
 const M=model, lay=M.lay, unit=M.r.US!==false?'ft':'m';
 const fmt=x=>isFinite(x)?(+x).toFixed(2):'—';
 const out=[{text:'Road '+fmt(lay.crest)+' '+unit,s:lay.sMid,t:0,z:lay.crest+1.4}];
 out.push({text:'HW '+fmt(M.hw)+' '+unit,s:Math.max(M.plot.s0+4,-12),t:lay.halfBot*0.2,z:M.hw+0.8});
 if(M.p.twMode==='const') out.push({text:'TW '+fmt(Math.max(M.p.twElev,lay.bedOut))+' '+unit,s:Math.min(M.plot.s1-4,M.L+12),t:-lay.halfBot*0.15,z:Math.max(M.p.twElev,lay.bedOut)+0.8});
 return out;
}
function layoutLabels(w,h,origin){
 const boxes=[];
 labelAnchors().forEach(lb=>{
  const p=project(lb.s,lb.t,lb.z);const ax=p.x+origin.x, ay=p.y+origin.y;
  if(ax<-30||ay<-30||ax>w+30||ay>h+30)return;
  const tw=Math.max(68,lb.text.length*7.4+12), th=18;
  let x=ax+10, y=ay-th-12;
  if(lb.text.indexOf('Road')===0){x=ax-tw/2;y=ay-th-14;}
  if(lb.text.indexOf('TW')===0){x=ax-tw-8;}
  x=Math.max(2,Math.min(w-tw-2,x));y=Math.max(2,Math.min(h-th-2,y));
  if(boxes.some(o=>!(x+tw<o.x||o.x+o.w<x||y+th<o.y||o.y+o.h<y)))return;
  boxes.push({x,y,w:tw,h:th,ax,ay,text:lb.text});
 });
 return boxes;
}
function placeLabels(){
 const host=document.getElementById('v3labels'), svg=document.getElementById('v3leaders');
 if(!host||!svg||!canvas)return;
 const boxes=layoutLabels(canvas.width,canvas.height,originCache);
 const z=zoom||1;
 host.innerHTML=boxes.map(b=>`<span style="left:${(b.x*z)|0}px;top:${(b.y*z)|0}px;font-size:13px;line-height:16px">${b.text}</span>`).join('');
 svg.setAttribute('viewBox',`0 0 ${canvas.width} ${canvas.height}`);
 svg.setAttribute('width',canvas.width*z);svg.setAttribute('height',canvas.height*z);
 svg.innerHTML=boxes.map(b=>{
  const cx=Math.max(b.x,Math.min(b.x+b.w,b.ax)), cy=Math.max(b.y,Math.min(b.y+b.h,b.ay));
  return `<line x1="${b.ax|0}" y1="${b.ay|0}" x2="${cx|0}" y2="${cy|0}" stroke="#1c140e" stroke-width="1"/>`;
 }).join('');
}
function snapshot(){
 if(!model)return null;
 const saved={zoom,panX,panY,focus,rot,preset:presetName};
 if(presetName==='inlet'){const b0=model.bars[0];focus={s:2,t:b0?b0.t:0,span:Math.max(26,(b0?b0.D:5)*5)};}
 else focus=null;
 model.zScale=4*vex;
 model.wave=1;
 const box=sceneBox();
 const bw=Math.max(8,Math.ceil(box.w)), bh=Math.max(8,Math.ceil(box.h));
 const buf=document.createElement('canvas');buf.width=bw;buf.height=bh;
 const g=buf.getContext('2d');g.imageSmoothingEnabled=false;
 const ox=4-box.minX, oy=4-box.minY;
 g.fillStyle=GRASS;g.fillRect(0,0,bw,bh);
 paint(g,{x:ox,y:oy});
 const fitW=1400, fitH=780;
 const contain=Math.max(1,Math.floor(Math.min(fitW/bw,fitH/bh)));
 const cover=Math.max(contain, Math.round(Math.max(fitW/bw,fitH/bh)));
 const sc=Math.max(1,Math.min(8,cover));
 const out=document.createElement('canvas');out.width=fitW;out.height=fitH;
 const o=out.getContext('2d');o.imageSmoothingEnabled=false;o.fillStyle=GRASS;o.fillRect(0,0,fitW,fitH);
 const dw=bw*sc, dh=bh*sc, dx=(fitW-dw)/2, dy=(fitH-dh)/2;
 o.drawImage(buf,0,0,bw,bh,dx,dy,dw,dh);
 const boxes=layoutLabels(bw,bh,{x:ox,y:oy});
 o.font='700 13px ui-monospace,Menlo,Consolas,monospace';o.textBaseline='middle';o.lineWidth=1;o.strokeStyle=INK;
 boxes.forEach(b=>{
  const ax=dx+b.ax*sc, ay=dy+b.ay*sc;
  const tw=Math.max(72,b.text.length*7.4+12), th=18;
  let x=ax+12, y=ay-th-12;
  if(b.text.indexOf('Road')===0){x=ax-tw/2;y=ay-th-14;}
  if(b.text.indexOf('TW')===0) x=ax-tw-12;
  x=Math.max(4,Math.min(fitW-tw-4,x));y=Math.max(4,Math.min(fitH-th-4,y));
  o.beginPath();o.moveTo(ax,ay);o.lineTo(x+8,y+th/2);o.stroke();
  o.fillStyle='#f6f0e2';o.fillRect(x,y,tw,th);o.strokeRect(x+0.5,y+0.5,tw-1,th-1);
  o.fillStyle='#1b2430';o.fillText(b.text,x+5,y+th/2+0.5);
 });
 zoom=saved.zoom;panX=saved.panX;panY=saved.panY;focus=saved.focus;rot=saved.rot;presetName=saved.preset;
 let url=null;try{url=out.toDataURL('image/jpeg',0.86);}catch(e){url=null;}
 return url;
}
function frameInlet(){
 presetName='inlet';
 const b0=model&&model.bars[0];
 focus={s:2,t:b0?b0.t:0,span:Math.max(26,(b0?b0.D:5)*5)};
 zoom=3;panX=panY=0;
}

window.View3D={
 update(anchor,data){latest=data;card(anchor);if(failed)return;if(!canvas)boot();rebuild(data);},
 snapshot, frameInlet,
 ready(){return !!canvas&&built;}
};
})();
