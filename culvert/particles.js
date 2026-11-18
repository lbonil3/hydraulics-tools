/* Particles along the computed water-surface profile. Canvas overlay, capped count.
   Pauses for the Motion button (body.still), the Particles button, and prefers-reduced-motion. */
(function(){
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const bag=new WeakMap();
if(RM.matches)document.body.classList.add('noparts');
function atSta(pts, sta, u){let i=1; while(i<sta.length-1&&sta[i]<u)i++; const a=sta[i-1], b=sta[Math.min(i, sta.length-1)], t=b>a?(u-a)/(b-a):0; const p0=pts[Math.max(0,i-1)], p1=pts[Math.min(i, pts.length-1)]; return [p0[0]+(p1[0]-p0[0])*t, p0[1]+(p1[1]-p0[1])*t];}
function seed(svg, n){const a=[]; for(let i=0;i<n;i++){const inlet=Math.random()<0.5; a.push({u:inlet?Math.pow(Math.random(),1.7)*0.3:Math.random(), f:0.16+0.68*Math.random(), ph:Math.random()*6.28});} bag.set(svg, a);}
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
    const flow=svg._flow; if(!flow)return;
    const c=svg._cv||canvasFor(svg); if(!c)return;
    const w=svg.clientWidth, h=svg.clientHeight;
    const surf=flow.surf||flow.pts, bed=flow.bed||flow.pts, sta=flow.sta;
    if(!w||!h||!surf||surf.length<2||!bed||!sta){c.width=0; return;}
    const dpr=Math.min(2, window.devicePixelRatio||1);
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr); c.height=Math.round(h*dpr); c.style.width=w+'px'; c.style.height=h+'px';}
    c.style.left='0px'; c.style.top='0px';
    const g=c.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
    if(off)return;
    const sx=w/flow.vbW, sy=h/flow.vbH;
    const cap=w<500?32:64;
    let parts=bag.get(svg); if(!parts||parts.length!==cap)seed(svg, cap);
    parts=bag.get(svg);
    parts.forEach(p=>{
      let i=1; while(i<sta.length-1&&sta[i]<p.u)i++;
      const a=sta[i-1], b=sta[Math.min(i,sta.length-1)], tv=b>a?(p.u-a)/(b-a):0;
      const v0=(flow.vel&&flow.vel[Math.max(0,i-1)])||4, v1=(flow.vel&&flow.vel[Math.min(i,(flow.vel||[]).length-1)])||v0;
      const V=Math.max(0.3, v0+(v1-v0)*tv);
      const turb=flow.jumpU!=null&&Math.abs(p.u-flow.jumpU)<0.04;
      p.u+=dt*Math.max(0.12, Math.min(0.85, V/8))/2.4*(p.u<0.12?1.35:1); if(p.u>1)p.u-=1;
      p.ph+=dt*(turb?12:2);
      const sxy=atSta(surf, sta, p.u), bxy=atSta(bed, sta, p.u);
      let f=p.f; if(turb) f=0.2+0.6*(0.5+0.5*Math.sin(p.ph));
      const x=sxy[0], y=sxy[1]+f*(bxy[1]-sxy[1]);
      const rad=w<500?1.8:2.3;
      g.beginPath(); g.fillStyle='rgba(232,246,255,0.95)'; g.strokeStyle='#0c3d66'; g.lineWidth=1;
      g.ellipse(x*sx, y*sy, rad*1.7, rad, 0, 0, 6.3); g.fill(); g.stroke();
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
