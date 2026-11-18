/* Particles along the computed water-surface profile. Canvas overlay, capped count.
   Pauses for the Motion button (body.still), the Particles button, and prefers-reduced-motion. */
(function(){
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const bag=new WeakMap();
if(RM.matches)document.body.classList.add('noparts');
function meta(pts){const seg=[0]; let L=0; for(let i=1;i<pts.length;i++){L+=Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); seg.push(L);} return {seg, L:L||1};}
function at(pts, m, u){const d=Math.max(0, Math.min(0.999, u))*m.L; let i=1; while(i<m.seg.length-1&&m.seg[i]<d)i++; const a=m.seg[i-1], b=m.seg[i]||a+1, t=(d-a)/(b-a||1); const p0=pts[i-1], p1=pts[Math.min(i, pts.length-1)]; return [p0[0]+(p1[0]-p0[0])*t, p0[1]+(p1[1]-p0[1])*t];}
function seed(svg, n){const a=[]; for(let i=0;i<n;i++)a.push({u:Math.random()<0.45?Math.random()*0.2:Math.random(), y:(Math.random()-0.5)*5, ph:Math.random()*6.28}); bag.set(svg, a);}
function canvasFor(svg){
 let c=svg._cv; if(c)return c;
 let host=svg.parentElement;
 if(!host||!host.classList.contains('flowhost')){
  host=document.createElement('div'); host.className='flowhost'; host.style.position='relative';
  svg.before(host); host.appendChild(svg);
 }
 c=document.createElement('canvas'); c.className='flowcv'; c.setAttribute('aria-hidden','true');
 host.appendChild(c); svg._cv=c; return c;
}
let last=0, raf=0;
function frame(t){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(0.05, last? (t-last)/1000 : 0.016); last=t;
  const off=document.body.classList.contains('still')||document.body.classList.contains('noparts');
  document.querySelectorAll('#profile,#mprofile').forEach(svg=>{
    const flow=svg._flow, c=svg._cv||canvasFor(svg); if(!c)return;
    const w=svg.clientWidth, h=svg.clientHeight;
    if(!w||!h||!flow||!flow.pts||flow.pts.length<2){c.width=0; return;}
    const dpr=Math.min(2, window.devicePixelRatio||1);
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr); c.height=Math.round(h*dpr); c.style.width=w+'px'; c.style.height=h+'px';}
    c.style.left='0px'; c.style.top='0px';
    const g=c.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
    if(off)return;
    const sx=w/flow.vbW, sy=h/flow.vbH, m=meta(flow.pts);
    const cap=w<500?28:56;
    let parts=bag.get(svg); if(!parts||parts.length!==cap)seed(svg, cap);
    parts=bag.get(svg);
    const V=Math.max(0.4, flow.V||flow.Vout||1);
    parts.forEach(p=>{
      const fast=p.u<0.18?1.65:1;
      const turb=(flow.jumpX!=null&&Math.abs(at(flow.pts,m,p.u)[0]-flow.jumpX)<18)||p.u>0.9;
      p.u+=dt*(0.22+0.04*Math.min(V, 20))*fast; if(p.u>1)p.u-=1;
      p.ph+=dt*(turb?14:3);
      const xy=at(flow.pts, m, p.u);
      const jy=turb?Math.sin(p.ph)*3.2:0;
      const rad=w<500?2.1:2.6;
      g.beginPath(); g.fillStyle='#f7fbff'; g.strokeStyle='#0b3a66'; g.lineWidth=1.1;
      g.arc(xy[0]*sx, (xy[1]+p.y*0.35+jy)*sy, rad, 0, 6.3); g.fill(); g.stroke();
    });
  });
}
function arm(){
  const ctl=document.getElementById('pctl');
  if(ctl&&!document.getElementById('pParts')){
    const b=document.createElement('button'); b.type='button'; b.id='pParts';
    const sync=()=>{const on=!document.body.classList.contains('noparts'); b.textContent=on?'Particles on':'Particles off'; b.setAttribute('aria-pressed', on?'true':'false');};
    b.onclick=()=>{document.body.classList.toggle('noparts'); sync();}; ctl.insertBefore(b, ctl.firstChild); sync();
  }
  if(!raf)raf=requestAnimationFrame(frame);
}
const prev=window.drawProfile;
window.drawProfile=function(){const o=prev?prev.apply(this, arguments):undefined; arm(); return o;};
arm();
})();
