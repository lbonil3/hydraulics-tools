/* Profile presentation layer: animation overlay (desktop+phone), phone-specific profile, Q sweep.
   Calls the original drawProfile untouched; never changes calc.js or results. */
(function(){
const MQ=matchMedia('(max-width:700px)'),RM=matchMedia('(prefers-reduced-motion: reduce)');
const orig=window.drawProfile,NS='http://www.w3.org/2000/svg';let last=null,cur=null,tw0=0;
if(RM.matches)document.body.classList.add('still');
// ---------- controls under the profile card ----------
const card=document.querySelector('#profile').closest('.card');
const mp=document.createElement('div');mp.id='mprof';mp.innerHTML='<svg id="mprofile" data-nofit="1" viewBox="0 0 340 230" role="img" aria-label="Culvert profile"></svg><table id="mkey"></table>';
card.querySelector('#profile').after(mp);
const ctl=document.createElement('div');ctl.id='pctl';
ctl.innerHTML='<button type="button" id="pSweep">▶ Sweep Q</button><input type="range" id="pQ" min="0" max="1000" step="1" aria-label="Discharge"><button type="button" id="pMotion" aria-pressed="false"></button><div id="pStat" aria-live="polite"></div>';
mp.after(ctl);
const motionLbl=()=>{const s=document.body.classList.contains('still');pMotion.textContent=s?'▶ Motion':'⏸ Motion';pMotion.setAttribute('aria-pressed',s);};motionLbl();
pMotion.onclick=()=>{document.body.classList.toggle('still');motionLbl();};
const Qin=()=>document.getElementById('Q'),num=id=>parseFloat(document.getElementById(id).value);
function setQ(q){const e=Qin();e.value=(+q).toFixed(q<10?2:1);e.dispatchEvent(new Event('input',{bubbles:true}));}
function rng(){const a=num('Qmin'),b=num('Qmax');return [Math.min(a,b),Math.max(a,b)];}
function syncSlider(){const [a,b]=rng(),q=num('Q');pQ.value=Math.round(1000*Math.max(0,Math.min(1,(q-a)/((b-a)||1))));}
pQ.oninput=()=>{const [a,b]=rng();stopSweep(false);setQ(a+(b-a)*pQ.value/1000);};
let sweep=null;
pSweep.onclick=()=>{if(sweep){stopSweep(true);return;}const q0=num('Q'),t0=performance.now();let lastT=0;pSweep.textContent='■ Stop';
 sweep={q0,raf:0};const step=t=>{if(!sweep)return;if(t-lastT>90){lastT=t;const [a,b]=rng(),ph=((t-t0)/9000)%1;setQ(a+(b-a)*(0.5-0.5*Math.cos(2*Math.PI*ph)));}sweep.raf=requestAnimationFrame(step);};sweep.raf=requestAnimationFrame(step);};
function stopSweep(restore){if(!sweep)return;cancelAnimationFrame(sweep.raf);const q0=sweep.q0;sweep=null;pSweep.textContent='▶ Sweep Q';if(restore)setQ(q0);}
// ---------- helpers ----------
const fmt=x=>isFinite(x)?(+x).toFixed(2):'—';
const flowDur=V=>Math.max(0.25,Math.min(6,12/Math.max(V,0.5))).toFixed(2)+'s'; // faster for higher velocity
function el(tag,a){return `<${tag} ${Object.entries(a).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`;}
// ---------- desktop overlay (same coordinates as original drawProfile) ----------
function overlay(p,r,allow,ro,bal){const svg=document.getElementById('profile');
 const zc=ro?C.crestMin(ro):p.invIn+r.D*1.6,W=900,H=340,x0=200,x1=700;
 const zmin=Math.min(p.invOut,p.invIn)-r.D*0.6,zmax=Math.max(r.EL,isFinite(allow)?allow:0,p.invIn+r.D*1.8,zc)+r.D*0.3;
 const Y=z=>H-30-(z-zmin)/(zmax-zmin)*(H-60),yi=Y(p.invIn),yo=Y(p.invOut),road=Y(zc);
 const twEl=p.twMode==='const'?Math.max(p.twElev,p.invOut):p.invOut;
 const wsIn=Math.min(r.D,r.profile?r.profile[0][1]:r.dc),wsOut=Math.min(r.D,r.yout);
 const ma=(yi+Y(p.invIn+wsIn))/2,mb=(yo+Y(p.invOut+wsOut))/2,d=flowDur(r.V);
 let g=`<g class="anim" pointer-events="none">
 <line class="flow" x1="${x0+4}" y1="${ma}" x2="${x1-4}" y2="${mb}" style="animation-duration:${d}"/>
 <line class="flow f2" x1="${x0+4}" y1="${(ma+Y(p.invIn+wsIn))/2+2}" x2="${x1-4}" y2="${(mb+Y(p.invOut+wsOut))/2+2}" style="animation-duration:${d}"/>
 <line class="ripple" x1="42" x2="${x0-2}" y1="${Y(r.EL)+3}" y2="${Y(r.EL)+3}"/>`;
 if(p.twMode==='const'&&twEl>p.invOut+0.01)g+=`<line class="ripple" x1="${x1+4}" x2="858" y1="${Y(twEl)+3}" y2="${Y(twEl)+3}"/>`;
 if(bal&&bal.over){const yw=(Y(r.EL)+road)/2;g+=`<path class="spill" d="M${x0+60} ${yw} L${x1-60} ${road-3} L${x1+40} ${yo-3}" style="animation-duration:${flowDur(Math.sqrt(bal.road.hmax)*3)}"/>`;}
 svg.insertAdjacentHTML('beforeend',g+'</g>');}
// ---------- phone profile ----------
function geom(p,r,allow,ro,bal){const zc=ro?C.crestMin(ro):p.invIn+r.D*1.6,tw=p.twMode==='const'?Math.max(p.twElev,p.invOut):p.invOut;
 return {EL:r.EL,tw,zc,allow:isFinite(allow)?allow:NaN,invIn:p.invIn,invOut:p.invOut,D:r.D,
  wsIn:Math.min(r.D,r.profile?r.profile[0][1]:r.dc),wsOut:Math.min(r.D,r.yout),L:p.length,prof:r.profile||null,jump:r.jump||null,US:r.US,h:bal&&bal.over?bal.road.hmax:0,V:r.V,
  hasTw:p.twMode==='const',road:!!ro};}
function drawPhone(g){const W=340,H=230,svg=document.getElementById('mprofile');
 const zmin=Math.min(g.invOut,g.invIn)-0.45*g.D,zmax=Math.max(g.EL,g.zc+g.h,isFinite(g.allow)?g.allow:-1e9,g.invIn+g.D,g.tw)+0.3*g.D;
 const Y=z=>14+(zmax-z)/(zmax-zmin)*(H-28),xi=70,xo=270,c0=128,c1=212;
 const yi=Y(g.invIn),yo=Y(g.invOut),ti=Y(g.invIn+g.D),to=Y(g.invOut+g.D),road=Y(g.zc),yE=Y(g.EL),yT=Y(g.tw);
 // upstream embankment face line from (xi,ti) up to (c0,road); pool reaches it at the HW level
 const xs=yE<ti?Math.min(c0,xi+(c0-xi)*(ti-yE)/(ti-road)):xi;
 const ws1=Y(g.invIn+g.wsIn),ws2=Y(g.invOut+g.wsOut);
 const PX=x=>xi+(xo-xi)*x/g.L,PZ=(x,y)=>Y(g.invIn-(g.invIn-g.invOut)*x/g.L+Math.min(y,g.D));
 const wsP=g.prof?g.prof.map((q,i)=>`${i?'L':'M'}${PX(q[0]).toFixed(1)} ${PZ(q[0],q[1]).toFixed(1)}`).join(' '):`M${xi} ${ws1} L${xo} ${ws2}`;
 const jm=g.jump?(()=>{const jx=PX(g.jump.x),a=PZ(g.jump.x,g.jump.y1),b=PZ(g.jump.x,g.jump.y2),lx=Math.max(xi+34,Math.min(xo-34,jx));return `<line x1="${jx}" x2="${jx}" y1="${b-3}" y2="${a+3}" stroke="#c0392b" stroke-width="2.5"/><circle cx="${jx}" cy="${b}" r="3" fill="#c0392b"/><text x="${lx}" y="${Math.max(11,PZ(g.jump.x,g.D)-6)}" text-anchor="middle" font-size="11" font-weight="700" fill="#c0392b">Jump @ ${fmt(g.jump.x)} ${g.US?'ft':'m'}</text>`;})():'';
 let s=`<rect width="${W}" height="${H}" fill="#eaf4fb"/>
 <path d="M0 ${yi} L${xi} ${yi} L${xi} ${ti} L${c0} ${road} L${c1} ${road} L${xo} ${to} L${xo} ${yo} L${W} ${yo} L${W} ${H} L0 ${H}Z" fill="#cdb98f" stroke="#8a7550" stroke-width="1.5"/>
 <path d="M0 ${yi} L${xi} ${yi} L${xo} ${yo} L${W} ${yo} L${W} ${H} L0 ${H}Z" fill="#b39c6e"/>
 <path d="M${xi} ${yi} L${xo} ${yo} L${xo} ${to} L${xi} ${ti}Z" fill="#fff"/>
 <path d="${wsP} L${xo} ${yo} L${xi} ${yi}Z" fill="#3d8fdc" opacity=".8"/>${jm}
 <line class="flow" x1="${xi+4}" y1="${(yi+ws1)/2}" x2="${xo-4}" y2="${(yo+ws2)/2}" style="animation-duration:${flowDur(g.V)}"/>
 <path d="M${xi} ${yi} L${xo} ${yo} M${xi} ${ti} L${xo} ${to}" stroke="#4a4f57" stroke-width="3" fill="none"/>
 <line x1="${xi}" y1="${yi+2}" x2="${xi}" y2="${ti-6}" stroke="#2b2f36" stroke-width="5"/><line x1="${xo}" y1="${yo+2}" x2="${xo}" y2="${to-6}" stroke="#2b2f36" stroke-width="5"/>
 <line x1="${c0}" x2="${c1}" y1="${road}" y2="${road}" stroke="#333" stroke-width="4"/>`;
 if(yE<yi-0.5)s+=`<path d="M0 ${yE} L${xs} ${yE} L${xi} ${ti} L${xi} ${yi} L0 ${yi}Z" fill="#3d8fdc" opacity=".75"/><line x1="0" x2="${xs}" y1="${yE}" y2="${yE}" stroke="#1659a3" stroke-width="2"/><line class="ripple" x1="2" x2="${xs-4}" y1="${yE+3}" y2="${yE+3}"/>`;
 if(g.h>0.001){const yw=Math.min(Y(g.zc+g.h),road-5);s+=`<path d="M${c0-(road-yw)*(c0-xi)/(road-ti)} ${yw} L${c1} ${Y(g.zc+g.h*0.6)} L${xo} ${Math.min(yT,to)-2} L${xo} ${to} L${c1} ${road} L${c0} ${road}Z" fill="#3d8fdc" opacity=".7"/><path class="spill" d="M${c0} ${(yw+road)/2} L${c1} ${(Y(g.zc+g.h*0.6)+road)/2} L${xo} ${to-3}" style="animation-duration:${flowDur(Math.sqrt(g.h)*3)}"/>`;}
 if(g.hasTw&&yT<yo-0.5)s+=`<path d="M${xo} ${yT} L${W} ${yT} L${W} ${yo} L${xo} ${yo}Z" fill="#3d8fdc" opacity=".65"/><line x1="${xo}" x2="${W}" y1="${yT}" y2="${yT}" stroke="#1659a3" stroke-width="2"/><line class="ripple" x1="${xo+4}" x2="${W-2}" y1="${yT+3}" y2="${yT+3}"/>`;
 if(isFinite(g.allow))s+=`<line x1="0" x2="${xi+30}" y1="${Y(g.allow)}" y2="${Y(g.allow)}" stroke="#c0392b" stroke-width="2" stroke-dasharray="6 4"/>`;
 const cl=v=>Math.max(12,Math.min(H-12,v)),mk=(n,x,y,c)=>`<g class="mk"><circle cx="${x}" cy="${cl(y)}" r="10" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${cl(y)+4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#fff">${n}</text></g>`;
 s+=mk(1,14,yE,'#1659a3')+mk(2,W-14,g.hasTw?yT:yo-12,'#0f7b8a')+mk(3,xi+14,yi+14,'#4a4f57')+mk(4,xo-14,yo+14,'#4a4f57')+(g.road?mk(5,(c0+c1)/2,road-13,'#6b5428'):'')+(isFinite(g.allow)?mk(6,isFinite(g.allow)&&Math.abs(Y(g.allow)-yE)<22?40:14,Y(g.allow),'#c0392b'):'');
 svg.innerHTML=s;}
function keyTable(p,r,allow,ro,bal,g){const L=r.US?'ft':'m',Q=r.US?'cfs':'m³/s',dot=(n,c)=>`<span class="kd" style="background:${c}">${n}</span>`;
 const rows=[[dot(1,'#1659a3'),'Headwater El.',`${fmt(r.EL)} ${L}`,`HW ${fmt(r.HW)} · ${r.control} ctrl`],
  [dot(2,'#0f7b8a'),'Tailwater El.',g.hasTw?`${fmt(g.tw)} ${L}`:'Free outfall',g.hasTw?`TW ${fmt(r.TW)}`:''],
  [dot(3,'#4a4f57'),'Inlet invert',`${fmt(p.invIn)} ${L}`,''],[dot(4,'#4a4f57'),'Outlet invert',`${fmt(p.invOut)} ${L}`,`S ${fmt(r.S*100)}% · L ${p.length}`]];
 if(ro)rows.push([dot(5,'#6b5428'),'Road crest El.',`${fmt(g.zc)} ${L}`,'']);
 if(isFinite(allow))rows.push([dot(6,'#c0392b'),'Allowable HW El.',`${fmt(allow)} ${L}`,r.EL>allow?'<span class="bad">exceeded</span>':'OK']);
 rows.push(['','Depth over road',ro?(bal&&bal.over?`${fmt(bal.road.hmax)} ${L}`:'none'):'off',bal&&bal.over?`Qr ${fmt(bal.Qr)} ${Q}`:''],
  ['','Barrel rise D',`${fmt(r.D)} ${L}`,''],['','Critical depth d<sub>c</sub>',`${fmt(r.dc)} ${L}`,''],['','Normal depth d<sub>n</sub>',isFinite(r.yn)?`${fmt(r.yn)} ${L}`:'—',''],['','Outlet depth',`${fmt(r.yout)} ${L}`,`V ${fmt(r.Vout)} ${r.US?'ft/s':'m/s'}`]);
 if(r.jump)rows.push(['','Hydraulic jump',`${fmt(r.jump.x)} ${L} in`,`y₁ ${fmt(r.jump.y1)} → y₂ ${fmt(r.jump.y2)}`]);
 document.getElementById('mkey').innerHTML=rows.map(x=>`<tr><td>${x[0]}</td><th>${x[1]}</th><td><b>${x[2]}</b></td><td class="n">${x[3]}</td></tr>`).join('');}
// smooth level transitions on the phone drawing
const TK=['EL','tw','zc','allow','invIn','invOut','D','wsIn','wsOut','h'];let tw=null;
function tween(to){if(!cur||document.body.classList.contains('still')||!MQ.matches){cur=to;drawPhone(cur);return;}
 const from={...cur},t0=performance.now();cancelAnimationFrame(tw);
 const step=t=>{const k=Math.min(1,(t-t0)/320),e=1-Math.pow(1-k,3),g={...to};TK.forEach(n=>{if(isFinite(from[n])&&isFinite(to[n]))g[n]=from[n]+(to[n]-from[n])*e;});
  cur=g;drawPhone(g);if(k<1)tw=requestAnimationFrame(step);else cur=to;};tw=requestAnimationFrame(step);}
window.drawProfile=function(p,r,allow,ro,bal){orig(p,r,allow,ro,bal);overlay(p,r,allow,ro,bal);
 const g=geom(p,r,allow,ro,bal);last=[p,r,allow,ro,bal];keyTable(p,r,allow,ro,bal,g);tween(g);
 pStat.innerHTML=`Q ${fmt(bal?bal.Qc+bal.Qr:p.Q)} → HW El. ${fmt(r.EL)} · <b>${r.control} control</b>${bal&&bal.over?' · <b class="bad">overtopping</b>':''}`;if(!sweep||true)syncSlider();};
MQ.addEventListener('change',()=>{if(last)drawProfile(...last);});
run();
})();
