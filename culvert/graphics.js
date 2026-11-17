/* Engineering profile, inlet section and isometric view. Elevations and the barrel length use the computed geometry.
   The embankment side slope is the drawing input fillZ (default 3H:1V) and is not a hydraulic coefficient.
   Wall thickness is drawn at about 8% of the rise so the material reads; it is not a structural design thickness. */
(function(){
const fx=(x,d)=>isFinite(x)?(+x).toFixed(d==null?2:d):'—';
function scene(p,r,allow,ro){
 const zc=ro?C.crestMin(ro):p.invIn+r.D*1.6;
 const zmin=Math.min(p.invOut,p.invIn)-r.D*0.85, zmax=Math.max(r.EL,isFinite(allow)?allow:-1e9,p.invIn+r.D*1.8,zc)+r.D*0.35;
 const W=900,H=340,x0=200,x1=700;
 const Y=z=>H-30-(z-zmin)/(zmax-zmin)*(H-60);
 const scX=(x1-x0)/Math.max(p.length,1e-6), scY=(H-60)/Math.max(zmax-zmin,1e-6);
 return {zc,zmin,zmax,W,H,x0,x1,Y,scX,scY,vex:scY/scX};
}
function endKind(p){const id=(p.inlet&&p.inlet.id)||'', name=(p.inlet&&p.inlet.name)||'';
 if(/mit/.test(id)||/miter/i.test(name)) return 'miter';
 if(/_pr|project/i.test(id)||/project/i.test(name)) return 'project';
 return 'headwall';}
function drawProfile(p,r,allow,ro,bal){
 const S=scene(p,r,allow,ro), Y=S.Y, x0=S.x0, x1=S.x1, L=r.US?'ft':'m';
 const fillZ=Math.max(0.5,+p.fillZ||3), zc=S.zc;
 const yi=Y(p.invIn), yo=Y(p.invOut), ti=Y(p.invIn+r.D), to=Y(p.invOut+r.D), road=Y(zc);
 const twEl=p.twMode==='const'?Math.max(p.twElev,p.invOut):p.invOut;
 const invAt=x=>p.invIn-(p.invIn-p.invOut)*x/p.length;
 const PX=x=>x0+S.scX*x, PZ=(x,y)=>Y(invAt(x)+Math.min(y,r.D));
 const prof=r.profile||[[0,Math.min(r.D,r.dc)],[p.length,Math.min(r.D,r.yout)]];
 const ws=prof.map((q,i)=>`${i?'L':'M'}${PX(q[0]).toFixed(1)} ${PZ(q[0],q[1]).toFixed(1)}`).join(' ');
 const hgl=(r.hgl||[]).map((q,i)=>`${i?'L':'M'}${PX(q[0]).toFixed(1)} ${Y(invAt(q[0])+q[1]).toFixed(1)}`).join(' ');
 const egl=(r.hgl||[]).map((q,i)=>`${i?'L':'M'}${PX(q[0]).toFixed(1)} ${Y(invAt(q[0])+q[2]).toFixed(1)}`).join(' ');
 const t=Math.max(3.5,Math.min(12,r.D*S.scY*0.08));
 const kind=endKind(p), metal=p.material==='cmp'||p.material==='spiral'||/cmp|m_/.test((p.inlet&&p.inlet.id)||'');
 const Lr=ro&&ro.Lr?ro.Lr:(r.US?40:12);
 let roadL=x0+Math.max(24,(x1-x0-Lr*S.scX)/2), roadR=Math.min(x1-8,roadL+Lr*S.scX);
 if(roadR-roadL<36){roadL=x0+70; roadR=x1-70;}
 const upRun=fillZ*(zc-p.invIn)*S.scX, dnRun=fillZ*(zc-p.invOut)*S.scX;
 const toeU=Math.max(28,roadL-upRun), toeD=Math.min(872,roadR+dnRun);
 const apron=C.riprapApron({US:r.US,Q:r.Q,D:r.D,TW:p.twMode==='none'?0:r.TW,yn:r.yn,supercritical:isFinite(r.dc)&&r.yout<r.dc});
 const apx=Math.max(18,Math.min(160,(apron.L||r.D*4)*S.scX));
 let s=`<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7ebf8"/><stop offset="1" stop-color="#eef6ea"/></linearGradient>
  <linearGradient id="wpool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec8ef"/><stop offset="1" stop-color="#1d5f99"/></linearGradient>
  <pattern id="conc" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#c5c8cc"/><circle cx="2" cy="3" r="0.7" fill="#9aa0a6"/><circle cx="6" cy="6" r="0.6" fill="#dedfe2"/></pattern>
  <pattern id="cmp" width="8" height="6" patternUnits="userSpaceOnUse"><rect width="8" height="6" fill="#b7bcc2"/><path d="M0 4 Q2 1 4 4 T8 4" fill="none" stroke="#6d737a" stroke-width="1"/></pattern>
  <pattern id="grass" width="10" height="6" patternUnits="userSpaceOnUse"><rect width="10" height="6" fill="#8fa86a"/><path d="M2 6 L3 2 M6 6 L6 1 M8 6 L9 3" stroke="#5f7a3a" stroke-width="0.7"/></pattern>
  <pattern id="rock" width="14" height="10" patternUnits="userSpaceOnUse"><rect width="14" height="10" fill="#b9a48a"/><ellipse cx="4" cy="6" rx="3" ry="2" fill="#8d7760"/><ellipse cx="11" cy="4" rx="2.4" ry="1.6" fill="#6f5b48"/></pattern>
  <marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z"/></marker>
  <marker id="flow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L9 5 L0 9 Z" fill="#0c3f73"/></marker>
 </defs>
 <rect width="${S.W}" height="${S.H}" fill="url(#sky)"/>
 <path d="M0 ${Y(p.invIn)} L${toeU} ${yi} L${roadL} ${road} L${roadR} ${road} L${toeD} ${yo} L${S.W} ${yo} L${S.W} ${S.H} L0 ${S.H} Z" fill="#c4a574"/>
 <path d="M0 ${yi+8} L${x0} ${yi} L${x1} ${yo} L${S.W} ${yo+6} L${S.W} ${S.H} L0 ${S.H} Z" fill="#a48458"/>
 <path d="M${toeU} ${yi} L${roadL} ${road} L${roadR} ${road} L${toeD} ${yo} L${x1} ${yo} L${x0} ${yi} Z" fill="url(#grass)" opacity=".55"/>
 <rect x="${roadL}" y="${road-7}" width="${roadR-roadL}" height="7" fill="#3c4148"/>
 <line x1="${roadL+4}" x2="${roadR-4}" y1="${road-4}" y2="${road-4}" stroke="#e6c84a" stroke-width="1.4" stroke-dasharray="10 7"/>
 <line x1="${roadL}" x2="${roadR}" y1="${road-1}" y2="${road-1}" stroke="#f2f2f2" stroke-width="1"/>
 <text x="${(roadL+roadR)/2}" y="${road-12}" text-anchor="middle" fill="#243" font-size="12">${ro?'Road crest El. '+fx(zc):'Roadway (overtopping off)'} · ${fx(fillZ,1)}H:1V side slopes</text>`;
 if(bal&&bal.over){const yE=Y(r.EL);s+=`<path d="M${roadL} ${yE} L${roadR} ${Math.min(road-1,(yE+road)/2)} L${roadR} ${road} L${roadL} ${road} Z" fill="url(#wpool)" opacity=".55"/>
  <text x="${(roadL+roadR)/2}" y="${yE-6}" text-anchor="middle" font-weight="700" fill="#0c3f73">Overtopping ${fx(bal.Qr)} ${r.US?'cfs':'m³/s'}</text>`;}
 const wall=metal?'url(#cmp)':'url(#conc)';
 s+=`<path d="M${x0} ${yi+t} L${x1} ${yo+t} L${x1} ${to-t} L${x0} ${ti-t} Z" fill="${wall}" stroke="${metal?'#5c636a':'#8b9096'}" stroke-width="1"/>
 <path d="M${x0} ${yi} L${x1} ${yo} L${x1} ${to} L${x0} ${ti} Z" fill="#f7f8f9"/>
 <path data-part="hw" d="M18 ${Y(r.EL)} L${x0} ${Y(r.EL)} L${x0} ${yi} L18 ${yi} Z" fill="url(#wpool)" opacity=".72"/>
 <path data-part="ws" d="${ws} L${x1} ${yo} L${x0} ${yi} Z" fill="url(#wpool)" opacity=".78"/>
 <path d="${ws}" fill="none" stroke="#0c3f73" stroke-width="1.6" marker-end="url(#flow)"/>
 <path d="${hgl}" fill="none" stroke="#083" stroke-width="1.2" stroke-dasharray="5 3"/>
 <path d="${egl}" fill="none" stroke="#a15c00" stroke-width="1" stroke-dasharray="2 3"/>
 <path data-part="barrel" d="M${x0} ${yi} L${x1} ${yo} M${x0} ${ti} L${x1} ${to}" fill="none" stroke="#2c3136" stroke-width="${t.toFixed(1)}"/>`;
 if(kind==='headwall') s+=`<rect data-part="inlet" x="${x0-7}" y="${ti-10}" width="10" height="${yi-ti+16}" fill="#d9d4cc" stroke="#4a463f"/>
  <path d="M${x0-7} ${ti-10} L${x0-28} ${ti+8} L${x0-7} ${ti+18} Z" fill="#d9d4cc" stroke="#4a463f"/>
  <path d="M${x0+3} ${ti-10} L${x0+26} ${ti+8} L${x0+3} ${ti+18} Z" fill="#e4dfd6" stroke="#4a463f"/>`;
 else if(kind==='miter') s+=`<path data-part="inlet" d="M${x0} ${ti} L${x0-18} ${yi} L${x0} ${yi} Z" fill="${wall}" stroke="#333"/>`;
 else s+=`<path data-part="inlet" d="M${x0} ${ti} L${x0-16} ${ti} L${x0-16} ${yi} L${x0} ${yi}" fill="none" stroke="#333" stroke-width="${Math.max(2,t*0.6)}"/>`;
 s+=`<path data-part="tw" d="M${x1} ${Y(twEl)} L${S.W-16} ${Y(twEl)} L${S.W-16} ${yo} L${x1} ${yo} Z" fill="url(#wpool)" opacity=".62"/>
 <path d="M${x1} ${yo} L${x1+apx} ${yo} L${x1+apx} ${yo+11} L${x1} ${yo+11} Z" fill="url(#rock)" stroke="#6b5344"/>
 <text x="${x1+apx/2}" y="${yo+24}" text-anchor="middle" font-size="11" fill="#4a3728">Riprap apron ~${fx(apron.L,0)} ${L}</text>`;
 if(r.jump) s+=`<line x1="${PX(r.jump.x)}" x2="${PX(r.jump.x)}" y1="${PZ(r.jump.x,r.jump.y1)}" y2="${PZ(r.jump.x,r.jump.y2)}" stroke="#c0392b" stroke-width="2.5"/>
  <text x="${PX(r.jump.x)}" y="${PZ(r.jump.x,r.D)-8}" text-anchor="middle" font-size="12" fill="#c0392b" font-weight="700">Jump @ ${fx(r.jump.x)} ${L}</text>`;
 s+=`<line data-part="length" x1="${x0}" y1="${yo+36}" x2="${x1}" y2="${yo+36}" stroke="#333" marker-end="url(#a)" marker-start="url(#a)"/>
 <text x="${(x0+x1)/2}" y="${yo+50}" text-anchor="middle">L = ${fx(p.length,1)} ${L} · S = ${fx(r.S*100)}% · vertical scale ×${fx(S.vex,1)}</text>
 <text x="56" y="${(Y(r.EL)+yi)/2}" font-weight="700">HW ${fx(r.HW)} ${L}</text>
 <text x="24" y="${Y(r.EL)-6}" font-size="12">El. ${fx(r.EL)} (${r.control})</text>
 <text x="${x0+8}" y="${ti+14}" font-size="12">D = ${fx(r.D)} ${L}${metal?' · corrugated wall':' · concrete wall'}</text>
 <text x="${x1+8}" y="${Y(twEl)-6}" font-size="12">${p.twMode==='const'?'TW El. '+fx(twEl):'Free outfall'}</text>
 <text x="24" y="16" font-size="11" fill="#245">HGL dashed · EGL dotted · flow to the right</text>`;
 if(isFinite(allow)) s+=`<line data-part="allow" x1="20" x2="${x0+30}" y1="${Y(allow)}" y2="${Y(allow)}" stroke="#c0392b" stroke-dasharray="6 4"/><text x="${x0-70}" y="${Y(allow)-4}" fill="#c0392b" font-size="12">Allowable ${fx(allow)}</text>`;
 document.getElementById('profile').innerHTML=s;
 drawIso(p,r,allow,ro,bal,kind,metal);
}
function drawX(p,r){
 const W=300,H=320, barrels=r.crossing?r.crossing.parts:(null);
 const list=barrels?barrels.map(pt=>({B:pt.r?pt.r.B:r.B,D:pt.r?pt.r.D:r.D,shape:pt.r&&pt.r.B!==pt.r.D?'box':'circular',HW:pt.HW,Q:pt.Q})):null;
 const N=list?list.length:(r.N||1);
 const Bs=list?list.map(b=>b.B):Array(N).fill(r.B), Ds=list?list.map(b=>b.D):Array(N).fill(r.D);
 const gap0=Math.max.apply(null,Bs)*0.28, totW=Bs.reduce((s,b)=>s+b,0)+(N-1)*gap0, maxD=Math.max.apply(null,Ds);
 const sc=Math.min(250/Math.max(totW,1e-6),190/Math.max(maxD,1e-6)), yb=250;
 let x=(W-totW*sc)/2, hw0=Math.min((list?list[0].HW:r.HW), maxD*1.5)*sc;
 let s=`<rect width="${W}" height="${H}" fill="#e7eef2"/><rect x="0" y="${yb-hw0}" width="${W}" height="${hw0}" fill="#8ec8ef" opacity=".28"/>`;
 const metal=p.material==='cmp'||p.material==='spiral';
 for(let k=0;k<N;k++){const B=Bs[k]*sc, Dh=Ds[k]*sc, hw=Math.min((list?list[k].HW:r.HW),Ds[k]*1.5)*sc, wall=Math.max(3,Dh*0.08);
  if((list?list[k].shape:p.shape)==='box'||(!list&&p.shape==='box')){
   s+=`<rect x="${x-wall}" y="${yb-Dh-wall}" width="${B+2*wall}" height="${Dh+wall}" fill="${metal?'#b7bcc2':'#c5c8cc'}" stroke="#333"/>
    <rect x="${x}" y="${yb-Dh}" width="${B}" height="${Dh}" fill="#f4f7f8" stroke="#333"/>
    <rect x="${x}" y="${yb-Math.min(hw,Dh)}" width="${B}" height="${Math.min(hw,Dh)}" fill="#4a90d9" opacity=".55"/>`;
  } else {
   s+=`<circle cx="${x+B/2}" cy="${yb-Dh/2}" r="${Dh/2+wall}" fill="${metal?'#b7bcc2':'#d5d8dc'}" stroke="#333"/>
    <circle cx="${x+B/2}" cy="${yb-Dh/2}" r="${Dh/2}" fill="#f4f7f8" stroke="#333"/>
    <clipPath id="w${k}"><circle cx="${x+B/2}" cy="${yb-Dh/2}" r="${Dh/2-0.5}"/></clipPath>
    <rect clip-path="url(#w${k})" x="${x}" y="${yb-Math.min(hw,Dh)}" width="${B}" height="${Dh}" fill="#4a90d9" opacity=".6"/>`;
   if(metal) s+=`<circle cx="${x+B/2}" cy="${yb-Dh/2}" r="${Dh/2-2}" fill="none" stroke="#6d737a" stroke-width="1.2" stroke-dasharray="2 2"/>`;
  }
  x+=B+gap0*sc;}
 s+=`<line x1="8" x2="${W-8}" y1="${yb-(list?list[0].HW:r.HW)*sc}" y2="${yb-(list?list[0].HW:r.HW)*sc}" stroke="#0c3f73" stroke-width="1.5"/>
  <text x="8" y="${yb-(list?list[0].HW:r.HW)*sc-4}" font-size="12" fill="#0c3f73">HW ${fx(list?list[0].HW:r.HW)}</text>
  <text x="${W/2}" y="${yb+28}" text-anchor="middle" font-size="12">${N} barrel${N>1?'s':''} · ${metal?'corrugated metal':'concrete'} · wall shown schematically</text>`;
 document.getElementById('xsec').innerHTML=s;
}
function drawIso(p,r,allow,ro,bal){
 const anchor=document.getElementById('profile')&&document.getElementById('profile').closest('.card');
 if(anchor&&window.View3D)View3D.update(anchor,{p,r,allow,ro,bal});
}
window.drawProfile=drawProfile; window.drawX=drawX;
})();
