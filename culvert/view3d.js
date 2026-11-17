/* Isometric crossing built from Kenney's CC0 landscape tiles (see ASSETS.md).
   s runs along the barrel (0 at the inlet face, L at the outlet face).
   t runs along the road. The crest is centered on s = L/2 and both faces step down to the channel.
   Culvert pieces (headwalls, wings, mouths) are sprites drawn to the same grid. */
(function(){
const cardId='isocard';
const TILE=8;
const GRASS='#7cb342';
let canvas, ctx, built=false, failed=false, latest=null;
let zoom=0, rot=0, panX=0, panY=0, focus=null, showLines=true, vex=2, presetName='rot0';
let model=null, drag=null, axes=null, originCache={x:0,y:0,sc:0.5};
let atlas=null, sheet=null, atlasP=null;
const DRAW=0.5;

function el(html){const d=document.createElement('div');d.innerHTML=html;return d.firstElementChild;}
function card(anchor){
 let host=document.getElementById(cardId);
 if(host)return host;
 host=el(`<div class="card" id="${cardId}"><h3>3D crossing <small>(isometric tiles, drag to pan)</small></h3>
  <div id="v3bar">
   <button type="button" data-v3="rot0">North</button>
   <button type="button" data-v3="rot1">East</button>
   <button type="button" data-v3="rot2">South</button>
   <button type="button" data-v3="rot3">West</button>
   <button type="button" data-v3="z1">1×</button>
   <button type="button" data-v3="z2">2×</button>
   <button type="button" data-v3="z3">3×</button>
   <button type="button" data-v3="reset">Reset</button>
   <label>Vertical exaggeration <input id="v3ex" type="range" min="1" max="3" step="1" value="2"> <b id="v3exl">2×</b></label>
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
  if(e.target.id==='v3ex'){vex=+e.target.value||1;document.getElementById('v3exl').textContent=vex+'×';}
  if(e.target.id==='v3lines'){showLines=e.target.checked;}
 });
 return host;
}
function markRot(){document.querySelectorAll('#v3bar button').forEach(b=>b.classList.toggle('on',b.dataset.v3===('rot'+rot)));}
function markZoom(){document.querySelectorAll('#v3bar [data-v3^="z"]').forEach(b=>b.classList.toggle('on',b.dataset.v3==='z'+zoom));}
function showFallback(msg){failed=true;const w=document.getElementById('v3wrap');if(!w)return;
 w.innerHTML=`<div id="v3fallback">The crossing view needs the tile atlas, which did not load. The profile above is still drawn to the computed elevations. ${msg?('('+msg+')'):''}</div>`;}
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
   const shape=i===0?p.shape:(ex&&ex.shape)||p.shape;
   const rr=pt.r||r;
   return {shape,B:rr.B||p.span,D:rr.D||p.rise,invIn:i===0?p.invIn:+(ex&&ex.invIn),invOut:i===0?p.invOut:+(ex&&ex.invOut),t:0};
  });
 }
 const N=Math.max(1,r.N||1);
 return Array.from({length:N},()=>({shape:p.shape,B:r.B,D:r.D,invIn:p.invIn,invOut:p.invOut,t:0}));
}
function hash(x,y){let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=(n^n>>>13)>>>0;return n;}
function loadAtlas(){
 if(atlasP)return atlasP;
 atlasP=fetch('assets/iso-atlas.json').then(r=>{if(!r.ok)throw new Error('atlas');return r.json();}).then(meta=>new Promise((res,rej)=>{
  const im=new Image();
  im.onload=()=>{atlas=meta;sheet=im;res();};
  im.onerror=()=>rej(new Error('png'));
  im.src='assets/'+meta.image;
 })).catch(e=>{showFallback(e&&e.message);throw e;});
 return atlasP;
}

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
 let fp=Math.min(crest-3.5, Math.max(bedIn,bedOut)+Math.max(rise+2, 6));
 if(!(fp>Math.max(bedIn,bedOut)+1)) fp=Math.max(bedIn,bedOut)+1.5;
 if(!(crest>fp+2)) fp=crest-2.5;
 let roadLen=150;
 try{const cl=+document.getElementById('crestLen').value;if(cl>48)roadLen=cl;}catch(e){}
 roadLen=Math.max(88, Math.min(roadLen, Math.max(112, Math.min(190, L*1.15))));
 let pave=32;
 if(ro&&ro.Lr>12) pave=Math.max(18, Math.min(42, ro.Lr));
 let fillZ=4;
 try{const z=+document.getElementById('fillZ').value;if(z>=2&&z<=6)fillZ=z;}catch(e){}
 const lay=CrossingFrame.crossingLayout({
  L:L, crest:crest, fp:fp, bedIn:bedIn, bedOut:bedOut, crestLen:roadLen, paveW:pave,
  halfBot:Math.max(22, total*0.7+6), halfBank:Math.max(36, total*0.7+rise+14),
  sideRun:Math.max(14, (crest-fp)*fillZ)
 });
 const slopeTiles=Math.max(2, Math.floor(((lay.L-lay.paveW)/2)/TILE));
 const nUp=Math.max(2, Math.min(4, Math.floor(slopeTiles/Math.max(1, Math.round(fillZ)))||2));
 const approach=Math.max(32, lay.halfBank+8);
 const plot={s0:-approach,s1:L+approach,t0:-(lay.halfRoad+lay.sideRun+8),t1:lay.halfRoad+lay.sideRun+8};
 const ck=CrossingFrame.layoutCheck(lay);
 axes=CrossingFrame.crossingAxes(p.skewDeg||0);
 const dot=axes.road.x*axes.barrel.x+axes.road.y*axes.barrel.y;
 model={p,r,ro,L,bars,lay,plot,gap,kind:endKind(p),metal:metalOf(p),ck,nUp,crestLvl:1+nUp,fillZ,
  hw:r.EL, tw:p.twMode==='const'?Math.max(p.twElev, bedOut+0.15):bedOut+0.55,
  apron:Math.max(12, Math.min(28, rise*3))};
 focus=null;panX=panY=0;zoom=0;
 const note=document.getElementById('v3note');
 if(note){note.hidden=false;note.textContent=(model.kind==='headwall'?'Headwall and wingwalls':model.kind)+' · '+(model.metal?'corrugated metal':'concrete')+' · road across the barrel'+(Math.abs(dot)<1e-6?' · perpendicular':' · skew '+(p.skewDeg||0)+'°')+(ck.ok?' · crest centered':'')+' · '+fillZ+':1 slope';}
 built=true;
}
function levelOf(z){
 const lay=model.lay, bed=Math.min(lay.bedIn,lay.bedOut), n=model.nUp;
 if(z<=bed+0.3) return 0;
 if(z>=lay.crest-0.35) return 1+n;
 if(z<=lay.fp+0.35) return 1;
 const u=(z-lay.fp)/Math.max(0.5, lay.crest-lay.fp);
 return 1+Math.max(1, Math.min(n, Math.ceil(u*n-1e-6)));
}
function isWet(s,t,z){
 const lay=model.lay;
 if(Math.abs(t)>lay.halfBank) return false;
 if(s<lay.toeIn+TILE*0.6) return model.hw>z+0.25;
 if(s>lay.toeOut-TILE*0.6 && !(s>lay.toeOut && s<lay.toeOut+model.apron && Math.abs(t)<lay.halfBot+6)) return model.tw>z+0.2;
 return false;
}
function isRoad(s,t){
 const lay=model.lay;
 return Math.abs(s-lay.sMid)<TILE*0.9 && Math.abs(t)<=lay.halfRoad;
}
function isRiprap(s,t){const lay=model.lay;return s>lay.toeOut && s<lay.toeOut+model.apron && Math.abs(t)<lay.halfBot+6;}
function viewIJ(i,j){
 if(rot===1) return [j,-i];
 if(rot===2) return [-i,-j];
 if(rot===3) return [-j,i];
 return [i,j];
}
function project(i,j,level){
 const hw=atlas.hw, hh=atlas.hh, lv=atlas.lv*Math.max(1,vex)/2;
 const v=viewIJ(i,j);
 return {x:(v[0]-v[1])*hw, y:(v[0]+v[1])*hh - level*lv};
}
function wallName(inlet,b){
 const tag=b.circ?(model.metal?'cmp':'round'):'box';
 return (inlet?'in':'out')+tag;
}
function buildItems(){
 const items=[], lay=model.lay, plot=model.plot;
 const i0=Math.floor(plot.s0/TILE), i1=Math.ceil(plot.s1/TILE);
 const j0=Math.floor(plot.t0/TILE), j1=Math.ceil(plot.t1/TILE);
 const lim=focus?{s0:focus.s-focus.span,s1:focus.s+focus.span,t0:focus.t-focus.span,t1:focus.t+focus.span}:null;
 for(let j=j0;j<j1;j++){
  for(let i=i0;i<i1;i++){
   const s=(i+0.5)*TILE, t=(j+0.5)*TILE;
   if(s<plot.s0||s>plot.s1||t<plot.t0||t>plot.t1) continue;
   if(lim&&(s<lim.s0||s>lim.s1||t<lim.t0||t>lim.t1)) continue;
   const gz=CrossingFrame.groundAt(lay,s,t);
   const channel=Math.abs(t)<lay.halfBot+TILE && (s<lay.toeIn+TILE || s>lay.toeOut-TILE);
   const top=channel?0:levelOf(gz);
   const wet=channel && !isRiprap(s,t) && ((s<lay.toeIn+TILE && model.hw>lay.bedIn)||(s>lay.toeOut-TILE && model.tw>lay.bedOut));
   const rip=isRiprap(s,t);
   const road=!channel && isRoad(s,t)&&top===model.crestLvl;
   for(let lv=0;lv<=top;lv++){
    let name='grass';
    if(lv===top){
     if(wet) name='water'+((model.wave+i+j)%3);
     else if(rip) name='riprap';
     else if(road) name='road';
     else name=(hash(i,j)%5)===0?'grass2':'grass';
    }
    items.push({i,j,lv,name,ord:0});
   }
   if(road&&(Math.abs(j)%4)===0){
    items.push({i:i-0.05,j,lv:top,name:'rail',ord:2});
    items.push({i:i+0.05,j,lv:top,name:'rail',ord:2});
   }
   if(!wet&&!road&&!rip&&top<=1&&hash(i,j)%14===0&&Math.abs(t)>lay.halfBank+8)
    items.push({i,j,lv:top,name:hash(j,i)%2?'tree':'tree2',ord:2});
  }
 }
 model.bars.forEach((b,bi)=>{
  const j=b.t/TILE-0.5;
  const iIn=-0.85, iOut=lay.L/TILE-0.15;
  items.push({i:iIn,j,lv:0,name:wallName(true,b),ord:5});
  items.push({i:iOut,j,lv:0,name:wallName(false,b),ord:5});
  [-1.15,1.15].forEach(side=>{
   items.push({i:iIn+0.7,j:j+side,lv:1,name:'wing',ord:4});
   items.push({i:iOut-0.7,j:j+side,lv:1,name:'wing',ord:4});
  });
  items.push({i:iOut+0.95,j,lv:0,name:'flow'+(model.wave%3),ord:6});
 });
 const iRoad=lay.sMid/TILE-0.5;
 const span=Math.max(2, lay.halfRoad/TILE-1);
 const c1=((model.tick||0)%(span*2))-span;
 const c2=span-(((model.tick||0)*0.8)%(span*2));
 items.push({i:iRoad,j:c1,lv:model.crestLvl,name:'carRed',ord:4});
 items.push({i:iRoad,j:c2,lv:model.crestLvl,name:'carBlue',ord:4});
 items.sort((a,b)=>{
  const da=depth(a.i,a.j), db=depth(b.i,b.j);
  if(Math.abs(da-db)>0.01) return da-db;
  if(a.lv!==b.lv) return a.lv-b.lv;
  return a.ord-b.ord;
 });
 return items;
}
function depth(i,j){const v=viewIJ(i,j);return v[0]+v[1];}
function blit(g,name,i,j,lv){
 const fr=atlas.frames[name]; if(!fr)return;
 const p=project(i,j,lv);
 g.drawImage(sheet, fr.x,fr.y,fr.w,fr.h, p.x-fr.ax, p.y-fr.ay, fr.w, fr.h);
}
function paint(g){
 buildItems().forEach(it=>blit(g,it.name,it.i,it.j,it.lv));
 if(showLines&&model.r.hgl&&!focus) drawHGL(g);
}
function drawHGL(g){
 const inv=x=>model.p.invIn+(model.p.invOut-model.p.invIn)*(x/model.L);
 g.strokeStyle='#1e7a46';g.lineWidth=3;g.setLineDash([10,8]);g.beginPath();
 let pen=false;
 (model.r.hgl||[]).forEach(q=>{
  if(!isFinite(q[1])){pen=false;return;}
  const z=inv(q[0])+q[1];
  if(q[0]>2&&q[0]<model.L-2){pen=false;return;}
  const p=project(q[0]/TILE-0.5, 0, levelOf(z));
  if(!pen){g.moveTo(p.x,p.y);pen=true;}else g.lineTo(p.x,p.y);
 });
 g.stroke();g.setLineDash([]);
}
function sceneBox(){
 const b=focus?{s0:focus.s-focus.span,s1:focus.s+focus.span,t0:focus.t-focus.span,t1:focus.t+focus.span}:model.plot;
 const lv=focus?1:0;
 let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
 [[b.s0,b.t0],[b.s1,b.t0],[b.s0,b.t1],[b.s1,b.t1]].forEach(([s,t])=>{
  [lv, model.crestLvl].forEach(level=>{
   const p=project(s/TILE, t/TILE, level);
   if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
  });
 });
 return {minX:minX-80,minY:minY-80,maxX:maxX+80,maxY:maxY+140};
}
function chooseZoom(){
 if(zoom) return;
 const wrap=document.getElementById('v3wrap');
 const box=sceneBox();
 const W=wrap.clientWidth||800, H=wrap.clientHeight||420;
 const bw=(box.maxX-box.minX)*DRAW, bh=(box.maxY-box.minY)*DRAW;
 let z=1;
 while(z<3 && bw*(z+1)<=W-8 && bh*(z+1)<=H-8) z++;
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
 const sc=DRAW;
 const ox=iw/2-(box.minX+box.maxX)/2*sc+panX/(zoom||1);
 const oy=ih/2-(box.minY+box.maxY)/2*sc+panY/(zoom||1);
 ctx.setTransform(1,0,0,1,0,0);
 ctx.fillStyle=GRASS;ctx.fillRect(0,0,iw,ih);
 ctx.setTransform(sc,0,0,sc,ox,oy);
 ctx.imageSmoothingEnabled=true;
 paint(ctx);
 ctx.setTransform(1,0,0,1,0,0);
 originCache={x:ox,y:oy,sc:sc};
 return originCache;
}
function frame(){
 if(!model||!ctx||!sheet)return;
 model.wave=(performance.now()/220)|0;
 model.tick=(performance.now()/280);
 if(!zoom) chooseZoom();
 resize();
 renderAt(canvas.width,canvas.height);
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
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;panX+=e.clientX-drag.x;panY+=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;});
 canvas.addEventListener('pointerup',()=>{drag=null;});
 new ResizeObserver(()=>{}).observe(wrap);
 (function loop(){requestAnimationFrame(loop);if(built&&sheet)frame();})();
}
function labelAnchors(){
 if(!model)return [];
 const M=model, lay=M.lay, unit=M.r.US!==false?'ft':'m';
 const fmt=x=>isFinite(x)?(+x).toFixed(2):'—';
 const out=[{text:'Road '+fmt(lay.crest)+' '+unit,s:lay.sMid,t:0,lv:M.crestLvl}];
 out.push({text:'HW '+fmt(M.hw)+' '+unit,s:-TILE*2,t:lay.halfBot*0.3,lv:1});
 if(M.p.twMode==='const') out.push({text:'TW '+fmt(Math.max(M.p.twElev,lay.bedOut))+' '+unit,s:M.L+TILE*2,t:-lay.halfBot*0.2,lv:0});
 return out;
}
function layoutLabels(w,h,origin){
 const boxes=[];
 labelAnchors().forEach(lb=>{
  const p=project(lb.s/TILE, lb.t/TILE, lb.lv);
  const ax=p.x*origin.sc+origin.x, ay=p.y*origin.sc+origin.y;
  if(ax<-40||ay<-40||ax>w+40||ay>h+40)return;
  const tw=Math.max(68,lb.text.length*7.4+12), th=18;
  let x=ax+8, y=ay-th-10;
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
 if(!model||!sheet)return null;
 const saved={zoom,panX,panY,focus,rot,preset:presetName};
 if(presetName==='inlet'){const b0=model.bars[0];focus={s:0,t:b0?b0.t:0,span:Math.max(36,(b0?b0.D:5)*5)};}
 else focus=null;
 model.wave=1; model.tick=4;
 const box=sceneBox();
 const bw=Math.max(8,Math.ceil((box.maxX-box.minX)*DRAW)), bh=Math.max(8,Math.ceil((box.maxY-box.minY)*DRAW));
 const buf=document.createElement('canvas');buf.width=bw;buf.height=bh;
 const g=buf.getContext('2d');
 g.fillStyle=GRASS;g.fillRect(0,0,bw,bh);
 g.setTransform(DRAW,0,0,DRAW, -box.minX*DRAW, -box.minY*DRAW);
 g.imageSmoothingEnabled=true;
 paint(g);
 const fitW=1400, fitH=780;
 const sc=Math.max(1, Math.min(4, Math.max(fitW/bw, fitH/bh)));
 const out=document.createElement('canvas');out.width=fitW;out.height=fitH;
 const o=out.getContext('2d');o.imageSmoothingEnabled=true;o.fillStyle=GRASS;o.fillRect(0,0,fitW,fitH);
 const dw=bw*sc, dh=bh*sc, dx=(fitW-dw)/2, dy=(fitH-dh)/2;
 o.drawImage(buf,dx,dy,dw,dh);
 const origin={x:-box.minX*DRAW, y:-box.minY*DRAW, sc:DRAW};
 const boxes=layoutLabels(bw,bh,origin);
 o.font='700 13px ui-monospace,Menlo,Consolas,monospace';o.textBaseline='middle';o.lineWidth=1;o.strokeStyle='#1c140e';
 boxes.forEach(b=>{
  const ax=dx+b.ax*sc, ay=dy+b.ay*sc;
  const tw=Math.max(72,b.text.length*7.4+12), th=18;
  let x=ax+10, y=ay-th-12;
  if(b.text.indexOf('Road')===0){x=ax-tw/2;y=ay-th-16;}
  if(b.text.indexOf('TW')===0) x=ax-tw-12;
  x=Math.max(4,Math.min(fitW-tw-4,x));y=Math.max(4,Math.min(fitH-th-4,y));
  o.beginPath();o.moveTo(ax,ay);o.lineTo(x+6,y+th/2);o.stroke();
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
 focus={s:0,t:b0?b0.t:0,span:Math.max(36,(b0?b0.D:5)*5)};
 zoom=2;panX=panY=0;
}

window.View3D={
 update(anchor,data){latest=data;card(anchor);if(failed)return;loadAtlas().then(()=>{if(!canvas)boot();rebuild(data);}).catch(()=>{});},
 snapshot, frameInlet,
 ready(){return !!canvas&&built&&!!sheet;}
};
})();
