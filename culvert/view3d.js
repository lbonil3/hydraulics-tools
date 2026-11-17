/* Dimetric (2:1) tile view of the culvert, in the style of a RollerCoaster Tycoon park tile.
   The road centerline follows CrossingFrame: at zero skew it is perpendicular to the barrel.
   Along-barrel is the stream and the culvert; along-road is the embankment crest.
   Sprites are drawn on a 2D canvas. There is no 3D mesh. */
(function(){
const cardId='isocard';
const TILE=8, HW=8, HH=4, INK='#1c140e';
let canvas, ctx, built=false, failed=false, latest=null;
let zoom=2, rot=0, panX=0, panY=0, focus=null, showLines=true, vex=2, presetName='rot0';
let model=null, raf=0, drag=null, axes=null;

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
function metalOf(p){return p.material==='cmp'||p.material==='spiral'||/^(m_|hyc_)/.test((p.inlet&&p.inlet.id)||'')&&/cmp|metal|corrug/i.test((p.inlet&&p.inlet.name)||'');}
function barrelsOf(data){
 const p=data.p,r=data.r,L=p.length;
 if(r.crossing&&r.crossing.parts&&r.crossing.parts.length){
  return r.crossing.parts.map((pt,i)=>{
   const ex=i===0?null:(state.extras||[])[i-1];
   const shape=i===0?p.shape:(ex&&ex.shape)||'circular';
   const rr=pt.r||r;
   return {shape,B:rr.B||(shape==='box'?+(ex&&ex.span):+(ex&&ex.rise)),D:rr.D,invIn:i===0?p.invIn:+(ex&&ex.invIn),invOut:i===0?p.invOut:+(ex&&ex.invOut),t:0};
  });
 }
 const N=Math.max(1,r.N||1);
 return Array.from({length:N},()=>({shape:p.shape,B:r.B,D:r.D,invIn:p.invIn,invOut:p.invOut,t:0}));
}
function hash(x,y){let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=(n^n>>>13)>>>0;return n;}
function qElev(e){return Math.round(e/2)*2;}

function rebuild(data){
 const p=data.p, r=data.r, ro=data.ro;
 const L=Math.max(p.length,1);
 const bars=barrelsOf(data).filter(b=>b.D>0&&b.B>0);
 if(!bars.length)return;
 const gap=Math.max(1,0.25*Math.max(...bars.map(b=>b.B)));
 const widths=bars.map(b=>Math.max(b.B,b.D)+1.2);
 const total=widths.reduce((s,w)=>s+w,0)+gap*(bars.length-1);
 let cursor=-total/2;
 bars.forEach((b,i)=>{b.t=cursor+widths[i]/2;cursor+=widths[i]+gap;b.circ=b.shape==='circular'||(b.shape!=='box'&&b.shape!=='sdbox');});
 const crest=ro?window.Culvert.crestMin(ro):(p.invIn+r.D*1.6);
 let crestLen=300;try{const cl=+document.getElementById('crestLen').value;if(cl>30)crestLen=cl;}catch(e){}
 if(ro&&ro.segs&&ro.segs.length>1){const a=ro.segs.map(s=>s[0]);crestLen=Math.max(crestLen,Math.max(...a)-Math.min(...a));}
 const paveW=Math.max(16,Math.min(L*0.8,ro&&ro.Lr?ro.Lr:40));
 const fp=Math.max(p.invIn,p.invOut)+1;
 const bedIn=p.invIn, bedOut=p.invOut;
 axes=(window.CrossingFrame?CrossingFrame.crossingAxes(p.skewDeg||0):{road:{x:0,y:1},barrel:{x:1,y:0}});
 model={p,r,ro,L,bars,crest,crestLen,paveW,fp,bedIn,bedOut,kind:endKind(p),metal:metalOf(p),
  halfBot:Math.max(4,total*0.45),halfTop:Math.max(8,total*0.45+8),
  apron:Math.max(8,Math.min(24,(r.D||4)*3)),
  zRef:Math.min(p.invIn,p.invOut,r.EL)-1};
 focus=null;panX=panY=0;zoom=0;
 const note=document.getElementById('v3note');
 if(note){note.hidden=false;note.textContent=(model.kind==='headwall'?'Headwall and wingwalls':model.kind)+' · '+(model.metal?'corrugated metal':'concrete')+' · road across the barrel'+(Math.abs(axes.road.x*axes.barrel.x+axes.road.y*axes.barrel.y)<1e-6?' · perpendicular':' · skew '+(p.skewDeg||0)+'°')+' · exaggeration '+vex+'×';}
 built=true;
}

function bedAt(s){return s<model.L*0.5?model.bedIn:model.bedOut;}
function ground(s,t){
 const M=model, ad=Math.abs(t);
 let base=M.fp;
 if(ad<=M.halfBot) base=bedAt(s);
 else if(ad<M.halfTop) base=bedAt(s)+(ad-M.halfBot)/(M.halfTop-M.halfBot)*(M.fp-bedAt(s));
 const ridge=M.crestLen/2;
 if(s>=-4 && s<=M.L+4 && ad<=ridge+28){
  const toe=Math.min(28, Math.max(12, (M.L-M.paveW)/2));
  let top=M.crest;
  if(s<toe) top=M.fp+(Math.max(0,s)/toe)*(M.crest-M.fp);
  else if(s>M.L-toe) top=M.fp+(Math.max(0,M.L-s)/toe)*(M.crest-M.fp);
  const edge=ridge, run=22;
  if(ad<=edge) base=Math.max(base,top);
  else if(ad<edge+run) base=Math.max(base, M.fp+(top-M.fp)*(1-(ad-edge)/run));
 }
 return qElev(base);
}
function waterElev(s,t){
 const M=model, r=M.r;
 if(Math.abs(t)>M.halfTop+2) return null;
 if(s<1 && s>-70 && r.EL>ground(s,t)+0.4) return r.EL;
 if(M.p.twMode==='const' && s>M.L-1 && s<M.L+70){
  const tw=Math.max(M.p.twElev,M.bedOut);
  if(tw>ground(s,t)+0.4) return tw;
 }
 return null;
}
function isRoad(s,t){
 const M=model, c0=M.L/2-M.paveW/2, c1=M.L/2+M.paveW/2;
 return s>=c0&&s<=c1&&Math.abs(t)<=M.crestLen/2;
}
function isRiprap(s,t){return s>model.L&&s<model.L+model.apron&&Math.abs(t)<model.halfBot+3;}
function isChannel(s,t){return Math.abs(t)<model.halfBot&&(s<2||s>model.L-2);}

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
 const zpx=(z-model.zRef)*4*vex;
 return {x:(v.x-v.y)/TILE*HW, y:(v.x+v.y)/TILE*HH-zpx};
}
function nearDirs(){
 if(rot===1) return [[-1,0],[0,1]];
 if(rot===2) return [[1,0],[0,1]];
 if(rot===3) return [[1,0],[0,-1]];
 return [[-1,0],[0,-1]];
}
function edgePts(tx,ty,dx,dy,z){
 const s=tx*TILE, t=ty*TILE;
 if(dx===-1&&dy===0) return [project(s,t,z),project(s,t+TILE,z)];
 if(dx===1&&dy===0) return [project(s+TILE,t,z),project(s+TILE,t+TILE,z)];
 if(dx===0&&dy===-1) return [project(s,t,z),project(s+TILE,t,z)];
 return [project(s,t+TILE,z),project(s+TILE,t+TILE,z)];
}

function poly(g,pts,fill){
 g.beginPath();
 g.moveTo(pts[0].x|0,pts[0].y|0);
 for(let i=1;i<pts.length;i++) g.lineTo(pts[i].x|0,pts[i].y|0);
 g.closePath();
 g.fillStyle=fill;g.fill();
 g.strokeStyle=INK;g.lineWidth=1;g.stroke();
}
function grassColor(tx,ty){return ['#3e8c30','#4c9a3a','#367a28','#58a844'][hash(tx,ty)%4];}
function stampTop(g,cx,cy,tx,ty){
 const h=hash(tx,ty);
 if(h%3===0){g.fillStyle='#8ed060';g.fillRect((cx-1)|0,(cy-2)|0,1,2);}
 if(h%5===0){g.fillStyle='#c4a06a';g.fillRect(cx|0,cy|0,2,1);}
 if(h%7===0){g.fillStyle='#2f6e22';g.fillRect((cx+2)|0,(cy+1)|0,1,1);}
}
function drawDiamond(g,pts,color,tx,ty,kind){
 poly(g,pts,color);
 if(kind==='grass') stampTop(g,((pts[0].x+pts[2].x)/2)|0,((pts[0].y+pts[2].y)/2)|0,tx,ty);
 if(kind==='road'){
  const M=model, c0=M.L/2-M.paveW/2, c1=M.L/2+M.paveW/2;
  const s=tx*TILE+TILE/2;
  g.lineWidth=1;
  if(s<c0+TILE){g.strokeStyle='#f4f4f0';g.beginPath();g.moveTo(pts[0].x|0,pts[0].y|0);g.lineTo(pts[3].x|0,pts[3].y|0);g.stroke();}
  if(s>c1-TILE){g.strokeStyle='#f4f4f0';g.beginPath();g.moveTo(pts[1].x|0,pts[1].y|0);g.lineTo(pts[2].x|0,pts[2].y|0);g.stroke();}
  if(Math.abs(s-M.L/2)<TILE && ((ty|0)%2)===0){g.strokeStyle='#e6c040';
   const a={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}, b={x:(pts[3].x+pts[2].x)/2,y:(pts[3].y+pts[2].y)/2};
   g.beginPath();g.moveTo(a.x|0,a.y|0);g.lineTo(b.x|0,b.y|0);g.stroke();}
 }
 if(kind==='rock'){
  g.fillStyle='#d9cbb6';g.fillRect(((pts[0].x+pts[2].x)/2-2)|0,((pts[0].y+pts[2].y)/2)|0,3,2);
  g.fillStyle='#4a4038';g.fillRect(((pts[0].x+pts[2].x)/2+2)|0,((pts[0].y+pts[2].y)/2+1)|0,2,2);
 }
 if(kind==='water'){
  const f=Math.floor(performance.now()/180)%3;
  g.fillStyle=f===1?'#7ec8e0':'#d8f4ff';
  const cx=((pts[0].x+pts[2].x)/2)|0, cy=((pts[0].y+pts[2].y)/2)|0;
  g.fillRect(cx-3+(f),cy,2,1);g.fillRect(cx+2,cy+2,2,1);
 }
}
function drawCliff(g,a,b,drop,shade){
 if(drop<2)return;
 poly(g,[{x:a.x,y:a.y},{x:b.x,y:b.y},{x:b.x,y:b.y+drop},{x:a.x,y:a.y+drop}],shade);
 g.strokeStyle='#3a2416';g.beginPath();
 const steps=Math.max(1,Math.floor(drop/4));
 for(let i=1;i<steps;i++){const y1=(a.y+drop*i/steps)|0,y2=(b.y+drop*i/steps)|0;g.moveTo(a.x|0,y1);g.lineTo(b.x|0,y2);}
 g.stroke();
}

function tileKind(s,t){
 const w=waterElev(s,t);
 if(w!=null && w>ground(s,t)+0.3 && !isRoad(s,t)) return 'water';
 if(isRoad(s,t)) return 'road';
 if(isRiprap(s,t)) return 'rock';
 if(isChannel(s,t)) return 'pebble';
 return 'grass';
}
function topColor(kind,tx,ty){
 if(kind==='road') return '#32383e';
 if(kind==='water') return '#2a86b4';
 if(kind==='rock') return '#7a6e60';
 if(kind==='pebble') return '#c4a06e';
 return grassColor(tx,ty);
}

function bounds(){
 const M=model;
 if(focus){
  return {s0:focus.s-focus.span,s1:focus.s+focus.span,t0:focus.t-focus.span*0.8,t1:focus.t+focus.span*0.8};
 }
 return {s0:-64,s1:M.L+48,t0:-M.crestLen/2-12,t1:M.crestLen/2+12};
}
function tiles(){
 const b=bounds(), out=[];
 const tx0=Math.floor(b.s0/TILE), tx1=Math.ceil(b.s1/TILE);
 const ty0=Math.floor(b.t0/TILE), ty1=Math.ceil(b.t1/TILE);
 for(let ty=ty0;ty<ty1;ty++)for(let tx=tx0;tx<tx1;tx++){
  const s=tx*TILE+TILE/2, t=ty*TILE+TILE/2;
  out.push({tx,ty,s,t,h:ground(s,t)});
 }
 out.sort((a,c)=>{
  const pa=viewOf(a.tx,a.ty), pb=viewOf(c.tx,c.ty);
  return (pa.x+pa.y)-(pb.x+pb.y);
 });
 return out;
}

function paint(g,origin){
 const list=tiles();
 const dirs=nearDirs();
 list.forEach(tile=>{
  const z=tile.h;
  const N=project(tile.tx*TILE,tile.ty*TILE,z);
  const E=project(tile.tx*TILE+TILE,tile.ty*TILE,z);
  const S=project(tile.tx*TILE+TILE,tile.ty*TILE+TILE,z);
  const W=project(tile.tx*TILE,tile.ty*TILE+TILE,z);
  [N,E,S,W].forEach(p=>{p.x+=origin.x;p.y+=origin.y;});
  dirs.forEach((d,i)=>{
   const nb=ground((tile.tx+d[0])*TILE+TILE/2,(tile.ty+d[1])*TILE+TILE/2);
   const drop=(z-nb)*4*vex;
   const edge=edgePts(tile.tx,tile.ty,d[0],d[1],z);
   edge.forEach(p=>{p.x+=origin.x;p.y+=origin.y;});
   drawCliff(g,edge[0],edge[1],drop,i?'#8d6240':'#6a452c');
  });
  const kind=tileKind(tile.s,tile.t);
  const wz=waterElev(tile.s,tile.t);
  if(kind==='water' && wz!=null){
   const lift=(wz-z);
   const pts=[N,E,S,W].map(p=>({x:p.x,y:p.y-lift*2*vex}));
   drawDiamond(g,pts,topColor('water',tile.tx,tile.ty),tile.tx,tile.ty,'water');
   if(Math.abs(tile.s)<TILE || Math.abs(tile.s-model.L)<TILE){
    g.fillStyle='#e9f7ff';g.fillRect(pts[0].x|0,(pts[0].y+2)|0,2,1);
   }
  } else drawDiamond(g, [N,E,S,W], topColor(kind,tile.tx,tile.ty), tile.tx,tile.ty, kind);
  if(kind==='grass' && hash(tile.tx,tile.ty)%11===0 && !isRoad(tile.s,tile.t)){
   const c={x:(N.x+S.x)/2,y:(N.y+S.y)/2};
   drawTree(g,c.x,c.y,hash(tile.tx,tile.ty)%3);
  } else if(kind==='grass' && hash(tile.tx,tile.ty)%17===0){
   const c={x:(N.x+S.x)/2,y:(N.y+S.y)/2};
   g.fillStyle=['#e85d8c','#f2d24a','#ffffff'][hash(tile.ty,tile.tx)%3];
   g.fillRect(c.x|0,(c.y-2)|0,2,2);
  }
  if(kind==='road' && (tile.ty%4)===0){
   const M=model, c0=M.L/2-M.paveW/2, c1=M.L/2+M.paveW/2;
   if(tile.s<c0+TILE){const c={x:(N.x+W.x)/2,y:(N.y+W.y)/2};g.fillStyle='#d9d3c8';g.fillRect((c.x-1)|0,(c.y-7)|0,2,7);g.fillStyle='#f7f4ee';g.fillRect((c.x-2)|0,(c.y-8)|0,4,2);}
   if(tile.s>c1-TILE){const c={x:(E.x+S.x)/2,y:(E.y+S.y)/2};g.fillStyle='#d9d3c8';g.fillRect((c.x-1)|0,(c.y-7)|0,2,7);g.fillStyle='#f7f4ee';g.fillRect((c.x-2)|0,(c.y-8)|0,4,2);}
  }
 });
 const lim=bounds();
 model.bars.forEach(b=>{
  if(0>=lim.s0-8&&0<=lim.s1+8) drawPortal(g,origin,0,b,true);
  if(model.L>=lim.s0-8&&model.L<=lim.s1+8) drawPortal(g,origin,model.L,b,false);
 });
 drawCars(g,origin);
 if(showLines&&model.r.hgl&&!focus) drawHGL(g,origin);
}
function drawTree(g,x,y,k){
 g.fillStyle='#5c3a22';g.fillRect((x-1)|0,(y-5)|0,2,5);
 g.fillStyle=k?'#2f6a24':'#3e8a30';g.fillRect((x-4)|0,(y-9)|0,8,5);
 g.fillStyle='#6fbf48';g.fillRect((x-3)|0,(y-11)|0,6,3);
 g.fillStyle='#c5e87a';g.fillRect((x-1)|0,(y-12)|0,2,2);
}
function drawPortal(g,origin,s,b,inlet){
 const half=(b.circ?b.D/2:b.B/2)+1.6;
 const z0=inlet?b.invIn:b.invOut, z1=z0+b.D+1.4;
 const t=b.t;
 const corners=[[s,t-half,z0],[s,t+half,z0],[s,t+half,z1],[s,t-half,z1]].map(p=>{
  const q=project(p[0],p[1],p[2]);q.x+=origin.x;q.y+=origin.y;return q;
 });
 poly(g,corners,inlet&&model.kind==='project'?'#8aa0b0':'#d9d0bc');
 g.fillStyle='#b7ad98';
 for(let i=0;i<4;i++){const y=(corners[0].y+(corners[3].y-corners[0].y)*i/4)|0;g.fillRect(Math.min(corners[0].x,corners[1].x)|0,y,Math.abs(corners[1].x-corners[0].x)|0,1);}
 const cz=z0+b.D/2;
 const left=project(s,t-(b.circ?b.D/2:b.B/2),cz), right=project(s,t+(b.circ?b.D/2:b.B/2),cz);
 const top=project(s,t,z0+b.D), bot=project(s,t,z0);
 left.x+=origin.x;right.x+=origin.x;top.y+=origin.y;bot.y+=origin.y;left.y+=origin.y;right.y+=origin.y;top.x+=origin.x;bot.x+=origin.x;
 const cx=(left.x+right.x)/2, cy=(top.y+bot.y)/2;
 const rw=Math.max(3,Math.abs(right.x-left.x)/2), rh=Math.max(3,Math.abs(bot.y-top.y)/2);
 g.fillStyle='#12181e';g.beginPath();
 if(b.circ) g.ellipse(cx|0,cy|0,rw,rh,0,0,6.3);
 else g.rect((cx-rw)|0,(cy-rh)|0,rw*2,rh*2);
 g.fill();g.strokeStyle=INK;g.stroke();
 if(model.metal&&b.circ){g.strokeStyle='#d5dee6';g.beginPath();g.ellipse(cx|0,cy|0,rw+1,rh+1,0,0,6.3);g.stroke();}
 if(model.kind==='headwall'){
  const flare=inlet?-7:7, out=inlet?-1:1;
  [[-1,1],[1,-1]].forEach(side=>{
   const t0=t+side[0]*half, t1=t+side[0]*(half+6);
   const s1=s+out*0+side[1]*0;
   const w0=project(s,t0,z0), w1=project(s+flare,t1,z0), w2=project(s+flare,t1,z0+(z1-z0)*0.72), w3=project(s,t0,z0+(z1-z0)*0.72);
   [w0,w1,w2,w3].forEach(p=>{p.x+=origin.x;p.y+=origin.y;});
   poly(g,[w0,w1,w2,w3],'#cfc6b2');
  });
 }
}
function drawCars(g,origin){
 const M=model, s=M.L/2;
 const span=M.crestLen*0.42;
 const t1=((performance.now()*0.012)%(span*2))-span;
 const t2=span-((performance.now()*0.009)%(span*2));
 [[t1,'#c0392b'],[t2,'#2c6eaa']].forEach(([t,col])=>{
  const p=project(s,t,M.crest+0.4);p.x+=origin.x;p.y+=origin.y;
  g.fillStyle=col;g.fillRect((p.x-5)|0,(p.y-5)|0,10,4);
  g.fillStyle='#d6f2ff';g.fillRect((p.x-2)|0,(p.y-7)|0,4,2);
  g.fillStyle='#1c140e';g.fillRect((p.x-4)|0,(p.y-2)|0,2,2);g.fillRect((p.x+2)|0,(p.y-2)|0,2,2);
 });
}
function drawHGL(g,origin){
 const M=model, inv=x=>M.p.invIn+(M.p.invOut-M.p.invIn)*(x/M.L);
 g.strokeStyle='#1e7a46';g.setLineDash([2,2]);g.beginPath();
 (M.r.hgl||[]).forEach((q,i)=>{
  if(!isFinite(q[1]))return;
  const p=project(q[0],0.4,inv(q[0])+q[1]);
  const x=p.x+origin.x, y=p.y+origin.y;
  if(i)g.lineTo(x,y);else g.moveTo(x,y);
 });
 g.stroke();g.setLineDash([]);
}

function sceneBox(){
 const b=bounds();
 const zs=[model.fp,model.crest,model.r.EL];
 let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
 [[b.s0,b.t0],[b.s1,b.t0],[b.s0,b.t1],[b.s1,b.t1]].forEach(([s,t])=>{
  zs.forEach(z=>{const p=project(s,t,z);if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;});
 });
 return {minX,minY,maxX,maxY,w:maxX-minX+24,h:maxY-minY+24};
}
function renderAt(iw,ih){
 const box=sceneBox();
 const ox=iw/2-(box.minX+box.maxX)/2+panX;
 const oy=ih/2-(box.minY+box.maxY)/2+panY+8;
 ctx.save();
 ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#7ec4ea';ctx.fillRect(0,0,iw,ih);
 paint(ctx,{x:ox,y:oy});
 ctx.restore();
 return {ox,oy,box};
}
function resize(){
 const wrap=document.getElementById('v3wrap');if(!wrap||!canvas)return;
 const z=zoom||1;
 const iw=Math.max(160,Math.floor((wrap.clientWidth||640)/z));
 const ih=Math.max(120,Math.floor((wrap.clientHeight||360)/z));
 if(canvas.width!==iw||canvas.height!==ih){canvas.width=iw;canvas.height=ih;}
 canvas.style.width=(iw*z)+'px';canvas.style.height=(ih*z)+'px';
}
function chooseZoom(){
 if(zoom) return;
 const wrap=document.getElementById('v3wrap');
 const box=sceneBox();
 const W=wrap.clientWidth||800, H=wrap.clientHeight||420;
 zoom=1;
 if(box.w*2<=W-16 && box.h*2<=H-16) zoom=2;
 if(box.w*3<=W-16 && box.h*3<=H-16) zoom=3;
 markZoom();
}
function frame(){
 if(!model||!ctx)return;
 chooseZoom();resize();
 renderAt(canvas.width,canvas.height);
 placeLabels();
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
 const M=model, unit=M.r.US!==false?'ft':'m';
 const fmt=x=>isFinite(x)?(+x).toFixed(2):'—';
 const out=[{text:'Road '+fmt(M.crest)+' '+unit,s:M.L/2,t:0,z:M.crest+1.2}];
 out.push({text:'HW '+fmt(M.r.EL)+' '+unit,s:-10,t:M.halfBot*0.3,z:M.r.EL+0.6});
 if(M.p.twMode==='const') out.push({text:'TW '+fmt(Math.max(M.p.twElev,M.bedOut))+' '+unit,s:M.L+8,t:-M.halfBot*0.3,z:Math.max(M.p.twElev,M.bedOut)+0.6});
 return out;
}
function layoutLabels(w,h,origin){
 const boxes=[];
 labelAnchors().forEach(lb=>{
  const p=project(lb.s,lb.t,lb.z);const ax=p.x+origin.x, ay=p.y+origin.y;
  if(ax<-40||ay<-40||ax>w+40||ay>h+40)return;
  const tw=Math.max(72,lb.text.length*7.5+12), th=18;
  let x=ax+10, y=ay-th-14;
  if(lb.text.indexOf('Road')===0){x=ax-tw/2;y=ay-th-16;}
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
 const origin=lastOrigin();
 const boxes=layoutLabels(canvas.width,canvas.height,origin);
 const z=zoom||1;
 host.innerHTML=boxes.map(b=>`<span style="left:${(b.x*z)|0}px;top:${(b.y*z)|0}px">${b.text}</span>`).join('');
 svg.setAttribute('viewBox',`0 0 ${canvas.width} ${canvas.height}`);
 svg.setAttribute('width',canvas.width*z);svg.setAttribute('height',canvas.height*z);
 svg.innerHTML=boxes.map(b=>{
  const cx=Math.max(b.x,Math.min(b.x+b.w,b.ax)), cy=Math.max(b.y,Math.min(b.y+b.h,b.ay));
  return `<line x1="${b.ax|0}" y1="${b.ay|0}" x2="${cx|0}" y2="${cy|0}" stroke="#1c140e" stroke-width="1"/>`;
 }).join('');
}
let originCache={x:0,y:0};
function lastOrigin(){return originCache;}
function frame(){
 if(!model||!ctx)return;
 if(!zoom) chooseZoom();
 resize();
 originCache=renderAt(canvas.width,canvas.height);
 placeLabels();
 markRot();
}
function renderAt(iw,ih){
 const box=sceneBox();
 const ox=iw/2-(box.minX+box.maxX)/2+panX/(zoom||1);
 const oy=ih/2-(box.minY+box.maxY)/2+panY/(zoom||1);
 ctx.save();
 ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#7ec4ea';ctx.fillRect(0,0,iw,ih);
 paint(ctx,{x:ox,y:oy});
 ctx.restore();
 return {x:ox,y:oy};
}

function snapshot(){
 if(!model)return null;
 const saved={zoom,panX,panY,focus,rot};
 if(presetName==='inlet'){focus={s:4,t:model.bars[0]?model.bars[0].t:0,span:36};}
 else focus=null;
 const box=sceneBox();
 const fitW=presetName==='inlet'?1320:1360, fitH=presetName==='inlet'?700:740;
 const sc=Math.max(1,Math.min(presetName==='inlet'?6:4, Math.floor(Math.min(fitW/Math.max(40,box.w), fitH/Math.max(40,box.h)))));
 const bw=Math.ceil(box.w)+8, bh=Math.ceil(box.h)+8;
 const buf=document.createElement('canvas');buf.width=bw;buf.height=bh;
 const g=buf.getContext('2d');g.imageSmoothingEnabled=false;
 const ox=4-box.minX, oy=4-box.minY;
 g.fillStyle='#7ec4ea';g.fillRect(0,0,bw,bh);
 paint(g,{x:ox,y:oy});
 const out=document.createElement('canvas');out.width=1400;out.height=780;
 const o=out.getContext('2d');o.imageSmoothingEnabled=false;o.fillStyle='#7ec4ea';o.fillRect(0,0,1400,780);
 const dw=bw*sc, dh=bh*sc, dx=(1400-dw)/2, dy=(780-dh)/2;
 o.drawImage(buf,0,0,bw,bh,dx,dy,dw,dh);
 const boxes=layoutLabels(bw,bh,{x:ox,y:oy});
 o.strokeStyle='#1c140e';o.lineWidth=sc;o.font='700 '+ (13*sc) +'px ui-monospace,monospace';o.textBaseline='middle';
 boxes.forEach(b=>{
  const x=dx+b.x*sc, y=dy+b.y*sc, ax=dx+b.ax*sc, ay=dy+b.ay*sc;
  o.beginPath();o.moveTo(ax,ay);o.lineTo(x,y+b.h*sc/2);o.stroke();
  o.fillStyle='#f6f0e2';o.fillRect(x,y,b.w*sc,b.h*sc);
  o.strokeRect(x,y,b.w*sc,b.h*sc);
  o.fillStyle='#1b2430';o.fillText(b.text,x+4*sc,y+b.h*sc/2);
 });
 zoom=saved.zoom;panX=saved.panX;panY=saved.panY;focus=saved.focus;rot=saved.rot;
 let url=null;try{url=out.toDataURL('image/jpeg',0.86);}catch(e){url=null;}
 return url;
}
function frameInlet(){presetName='inlet';focus={s:4,t:0,span:36};zoom=3;panX=panY=0;}

window.View3D={
 update(anchor,data){latest=data;card(anchor);if(failed)return;if(!canvas)boot();rebuild(data);},
 snapshot, frameInlet,
 ready(){return !!canvas&&built;}
};
})();
