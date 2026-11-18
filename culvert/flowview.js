/* Live shallow-water picture on the profile. Visualization only: the HDS-5 numbers stay the design result.
   WebGL2 draws the colored surface when it can; otherwise the same picture is a canvas. */
(function(){
const C=window.Culvert, F=window.FlowSim;
if(!C||!F) return;
const RM=matchMedia('(prefers-reduced-motion: reduce)');
let st=null, sig='', playing=!RM.matches, colorOn=true, quality='normal', glMode=false;
let raf=0, seen=true, parts=[], vmax=1;
const card=document.querySelector('#profile')&&document.querySelector('#profile').closest('.card');
if(!card) return;
const bar=document.createElement('div'); bar.id='flowbar';
bar.innerHTML='<span class="flab">Flow picture <small>(visualization, not the design result)</small></span> <button type="button" id="flowplay">Pause</button> <button type="button" id="flowreset">Reset</button> <label>Quality <select id="flowqual"><option value="draft">Draft</option><option value="normal" selected>Normal</option></select></label> <label><input type="checkbox" id="flowcolor" checked> Velocity color</label> <span id="flowread"></span>';
const ctl=document.getElementById('pctl');
(ctl||card).after? (ctl?ctl.after(bar):card.appendChild(bar)) : card.appendChild(bar);
const read=document.getElementById('flowread');
function cells(){return (quality==='draft'||matchMedia('(max-width:700px)').matches)?48:96;}
function specOf(L){
  const p=L.p, r=L.r, shape=p.shape==='circular'?'circular':'box';
  return {US:r.US!==false, shape, B:r.B, D:r.D, L:p.length, n:p.n, invIn:p.invIn, invOut:p.invOut, Q:r.Q*(p.barrels||1), barrels:p.barrels||1, tw:Math.max(0, r.TW||0), inlet:p.inlet, Ke:(r.inlet&&r.inlet.Ke)||0.5, cells:cells()};
}
function keyOf(s){return [s.shape,s.B,s.D,s.L,s.n,s.invIn,s.invOut,s.Q,s.tw,s.Ke,s.cells,s.inlet&&s.inlet.id].join('|');}
function reset(keepPlay){
  const L=window.LAST; if(!L||!L.r) return;
  const s=specOf(L); sig=keyOf(s); st=F.create(s); parts=[];
  if(RM.matches&&!keepPlay){F.advance(st, 40); playing=false;}
  paintBtns();
}
function paintBtns(){const b=document.getElementById('flowplay'); if(b) b.textContent=playing?'Pause':'Play';}
document.getElementById('flowplay').onclick=()=>{playing=!playing; paintBtns();};
document.getElementById('flowreset').onclick=()=>{reset(true); if(!RM.matches) playing=true; paintBtns();};
document.getElementById('flowqual').onchange=e=>{quality=e.target.value; reset(true);};
document.getElementById('flowcolor').onchange=e=>{colorOn=e.target.checked;};
if(card&&'IntersectionObserver' in window){new IntersectionObserver(es=>{seen=es.some(x=>x.isIntersecting);}).observe(card);}
function scene(which, L){
  const p=L.p, r=L.r, allow=L.allow, ro=L.ro;
  if(which==='phone'){
    const D=r.D, zc=ro?C.crestMin(ro):p.invIn+D*1.6, tw=p.twMode==='const'?Math.max(p.twElev,p.invOut):p.invOut;
    const zmin=Math.min(p.invOut,p.invIn)-0.45*D, zmax=Math.max(r.EL,zc,isFinite(allow)?allow:-1e9,p.invIn+D,tw)+0.3*D;
    const W=340,H=230,x0=70,x1=270;
    return {W,H,x0,x1,Y:z=>14+(zmax-z)/(zmax-zmin)*(H-28)};
  }
  const zc=ro?C.crestMin(ro):p.invIn+r.D*1.6;
  const zmin=Math.min(p.invOut,p.invIn)-r.D*0.85, zmax=Math.max(r.EL,isFinite(allow)?allow:-1e9,p.invIn+r.D*1.8,zc)+r.D*0.35;
  const W=900,H=340,x0=200,x1=700;
  return {W,H,x0,x1,Y:z=>H-30-(z-zmin)/(zmax-zmin)*(H-60)};
}
function color(v){
  const t=Math.max(0, Math.min(1, v/Math.max(vmax, 1)));
  const r=t<0.55? Math.round(20+t*80) : Math.round(64+(t-0.55)*420);
  const g=t<0.55? Math.round(90+t*280) : Math.round(244-(t-0.55)*360);
  const b=t<0.55? Math.round(210-t*80) : Math.round(40-(t-0.55)*40);
  return [Math.max(0,Math.min(255,r)), Math.max(0,Math.min(255,g)), Math.max(0,Math.min(255,b))];
}
function hostFor(svg){
  let host=svg.parentElement;
  if(!host||!host.classList.contains('flowhost')){
    host=document.createElement('div'); host.className='flowhost'; host.style.position='relative';
    svg.before(host); host.appendChild(svg);
  }
  let c=svg._flowcv;
  if(!c){c=document.createElement('canvas'); c.className='flowcv flowpic'; c.setAttribute('aria-hidden','true'); host.appendChild(c); svg._flowcv=c; document.body.classList.add('flowsim');}
  return c;
}
function glOf(c){
  if(c._gl===null) return null;
  if(c._gl) return c._gl;
  const gl=c.getContext('webgl2', {alpha:true, premultipliedAlpha:false});
  if(!gl){c._gl=null; return null;}
  const vs=gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs,'attribute vec2 p; attribute vec3 c; varying vec3 v; void main(){v=c; gl_Position=vec4(p,0.0,1.0);}'); gl.compileShader(vs);
  const fs=gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs,'precision mediump float; varying vec3 v; void main(){gl_FragColor=vec4(v,0.82);}'); gl.compileShader(fs);
  if(!gl.getShaderParameter(vs, gl.COMPILE_STATUS)||!gl.getShaderParameter(fs, gl.COMPILE_STATUS)){c._gl=null; return null;}
  const prog=gl.createProgram(); gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.bindAttribLocation(prog,0,'p'); gl.bindAttribLocation(prog,1,'c'); gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){c._gl=null; return null;}
  gl.useProgram(prog);
  const buf=gl.createBuffer();
  c._gl={gl, buf}; glMode=true; return c._gl;
}
function drawGL(c, sc, pts, dots){
  const G=glOf(c); if(!G) return false;
  const {gl,buf}=G, W=sc.W, H=sc.H, data=[];
  pts.forEach(pt=>{const x=pt.x/W*2-1, yb=1-pt.yb/H*2, ys=1-pt.ys/H*2, col=colorOn?color(pt.v):[30,120,190];
    data.push(x,ys,col[0]/255,col[1]/255,col[2]/255, x,yb,col[0]/255*0.45,col[1]/255*0.45,col[2]/255*0.55);});
  const dotsData=[];
  const sx=2.2*2/W, sy=2.2*2/H;
  (dots||[]).forEach(d=>{const x=d.x/W*2-1, y=1-d.y/H*2;
    [[-sx,-sy],[sx,-sy],[sx,sy],[-sx,-sy],[sx,sy],[-sx,sy]].forEach(o=>dotsData.push(x+o[0], y+o[1], 0.95,0.97,1));});
  gl.viewport(0,0,c.width,c.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,20,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,20,8);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, data.length/5);
  if(dotsData.length){gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dotsData), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, dotsData.length/5);}
  return true;
}
function draw2d(g, pts, dots, sx, sy){
  if(pts.length<2) return;
  g.beginPath();
  g.moveTo(pts[0].x*sx, pts[0].ys*sy);
  for(let i=1;i<pts.length;i++) g.lineTo(pts[i].x*sx, pts[i].ys*sy);
  for(let i=pts.length-1;i>=0;i--) g.lineTo(pts[i].x*sx, pts[i].yb*sy);
  g.closePath();
  if(colorOn){
    const x0=pts[0].x*sx, x1=pts[pts.length-1].x*sx;
    const grd=g.createLinearGradient(x0,0,Math.max(x1, x0+1),0);
    let prev=-0.001;
    pts.forEach(pt=>{let t=(pt.x*sx-x0)/Math.max(x1-x0,1); t=Math.max(prev+0.0008, Math.min(0.999, t)); prev=t; const c=color(pt.v); grd.addColorStop(t, `rgba(${c[0]},${c[1]},${c[2]},0.8)`);});
    g.fillStyle=grd;
  } else g.fillStyle='rgba(36,130,196,0.78)';
  g.fill();
  dots.forEach(d=>{g.beginPath(); g.fillStyle='rgba(240,248,255,0.95)'; g.strokeStyle='#0c3d66'; g.lineWidth=1; g.arc(d.x*sx, d.y*sy, d.r||2, 0, 6.3); g.fill(); g.stroke();});
}
function points(sc, s, D, invIn, invOut, length, tw){
  const pts=[], scX=(sc.x1-sc.x0)/Math.max(length,1e-6);
  const yBed=sc.Y(invIn);
  const yPool=sc.Y(invIn+Math.min(Math.max(s.hw,0.05), D*3));
  const yEnt=sc.Y(s.zb[0]+Math.min(s.h[0], D));
  const vEnt=Math.abs(s.q[0])/Math.max(s.h[0],0.2);
  const poolX=Math.max(10, sc.x0-Math.min(110, 0.22*(sc.x1-sc.x0)));
  for(let k=0;k<=8;k++){
    const t=k/8, ease=t*t;
    pts.push({x:poolX+(sc.x0-poolX)*t, ys:yPool+(yEnt-yPool)*ease, yb:yBed, v:vEnt*ease});
  }
  let vm=Math.max(1, vEnt);
  for(let i=0;i<s.N;i++){
    const hd=Math.min(s.h[i], D);
    const v=Math.abs(s.q[i])/Math.max(s.h[i],0.05);
    vm=Math.max(vm, v);
    pts.push({x:sc.x0+scX*(i+0.5)*s.dx, ys:sc.Y(s.zb[i]+hd), yb:sc.Y(s.zb[i]), v});
  }
  const yJet=sc.Y(invOut+Math.min(s.yout, D));
  const yTW=sc.Y(invOut+Math.max(tw||0, 0.15));
  const vOut=Math.abs(s.q[s.N-1])/Math.max(s.h[s.N-1],0.05);
  const apron=Math.min(36, Math.max(16, (sc.W-sc.x1)*0.25));
  for(let k=1;k<=5;k++){
    const t=k/5;
    pts.push({x:sc.x1+apron*t, ys:yJet+(yTW-yJet)*t, yb:sc.Y(invOut), v:vOut*(1-t)});
  }
  vmax=vm;
  return pts;
}
function advect(s, dt, length){
  const phone=matchMedia('(max-width:700px)').matches, rows=4, per=phone?7:12, n=rows*per;
  if(parts.length!==n){parts=[]; for(let r=0;r<rows;r++) for(let i=0;i<per;i++) parts.push({u:(i+0.35)/per, f:0.16+0.68*(r+0.5)/rows});}
  parts.forEach(p=>{
    const x=Math.max(0, Math.min(0.999, p.u))*s.N;
    const i=Math.max(0, Math.min(s.N-1, Math.floor(x)));
    const speed=Math.max(0, s.q[i]/Math.max(s.h[i],0.05))*(0.72+0.55*p.f);
    p.u+=dt*speed/Math.max(length,1);
    if(p.u>=1) p.u-=1;
  });
}
function dots(sc, s, D, length){
  const scX=(sc.x1-sc.x0)/Math.max(length,1e-6), out=[];
  parts.forEach(p=>{
    const xf=Math.max(0, Math.min(0.999, p.u))*s.N;
    const i=Math.max(0, Math.min(s.N-2, Math.floor(xf)));
    const t=xf-i;
    const bed=s.zb[i]*(1-t)+s.zb[i+1]*t;
    const top=bed+(Math.min(s.h[i],D)*(1-t)+Math.min(s.h[i+1],D)*t);
    out.push({x:sc.x0+scX*xf*s.dx, y:sc.Y(bed+p.f*(top-bed)), r:sc.W<400?1.6:2});
  });
  return out;
}
function report(s, r){
  const hwE=Math.abs(s.hw-r.HW)/Math.max(Math.abs(r.HW),1e-6), vE=Math.abs(s.vout-r.Vout)/Math.max(Math.abs(r.Vout),1e-6);
  const L=r.US?'ft':'m', V=r.US?'ft/s':'m/s';
  const settled=s.t>12;
  read.textContent=`Sim headwater ${s.hw.toFixed(2)} ${L} vs design ${r.HW.toFixed(2)} ${L} (${(hwE*100).toFixed(0)}%). Outlet velocity ${s.vout.toFixed(2)} vs ${r.Vout.toFixed(2)} ${V} (${(vE*100).toFixed(0)}%). ${settled?(hwE<=F.TOL.hw&&vE<=F.TOL.vout?'Within the 15% / 20% visualization tolerance.':'Outside the 15% / 20% visualization tolerance — the design values above are HDS-5.'):'Still filling.'} ${glMode?'WebGL2':'Canvas'} surface.`;
}
function frame(){
  raf=requestAnimationFrame(frame);
  const L=window.LAST;
  if(!L||!L.r||!seen) return;
  const want=keyOf(specOf(L));
  if(!st||want!==sig) reset(false);
  if(!st) return;
  if(playing) F.advance(st, matchMedia('(max-width:700px)').matches?0.08:0.18);
  const s=F.sample(st);
  if(playing) advect(s, matchMedia('(max-width:700px)').matches?0.1:0.18, L.p.length);
  const phone=matchMedia('(max-width:700px)').matches;
  ['desk','phone'].forEach(which=>{
    const svg=document.getElementById(which==='desk'?'profile':'mprofile');
    if(!svg||!svg.clientWidth) return;
    const sc=scene(which, L);
    const c=hostFor(svg);
    const dpr=Math.min(2, window.devicePixelRatio||1), w=svg.clientWidth, h=svg.clientHeight;
    c.style.left='0px'; c.style.top='0px';
    if(c.width!==Math.round(w*dpr)){c.width=Math.round(w*dpr); c.height=Math.round(h*dpr); c.style.width=w+'px'; c.style.height=h+'px'; c._gl=undefined;}
    const pts=points(sc, s, L.r.D, L.p.invIn, L.p.invOut, L.p.length, L.r.TW||0);
    const ds=dots(sc, s, L.r.D, L.p.length);
    const sx=w/sc.W, sy=h/sc.H;
    if(phone||!drawGL(c, sc, pts, ds)){
      const g=c.getContext('2d'); if(!g) return;
      g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
      draw2d(g, pts, ds, sx, sy);
    }
  });
  report(s, L.r);
}
paintBtns();
raf=requestAnimationFrame(frame);
window.FlowView={reset, get playing(){return playing;}};
})();
