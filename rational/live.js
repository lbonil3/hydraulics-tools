/* Tc Studio "live" layer: animations, sliders, IDF chart, sensitivity. Presentation only — calls the existing
   compute()/render()/idfAt()/Tc.intensity(); never changes the equations. */
(function(){
const RM=matchMedia('(prefers-reduced-motion: reduce)'),NS='http://www.w3.org/2000/svg',out=$('#out');
const fx=(x,d)=>isFinite(x)?(+x).toFixed(d):'—';
const mk=(id,html)=>{const c=document.createElement('div');c.className='card live';c.id=id;c.dataset.pane='results';c.innerHTML=html;return c;};
// ---------- cards ----------
const cFlow=mk('lvflow',`<h3>Raindrop trip <small>(watch the water travel the path)</small></h3>
 <svg id="lvsvg" viewBox="0 0 360 230" data-nofit="1"></svg>
 <div class="lvrow"><button type="button" class="add" id="lvplay">▶ Replay</button><span class="lvclock">t = <b id="lvt">0.0</b> min <span id="lvseg"></span></span></div>
 <div id="lvbar" class="lvbar"></div><div id="lvdom" class="lvnote"></div>`);
const cIdf=mk('lvidf',`<h3>IDF curves <small>(tap the chart to read values)</small></h3>
 <div class="lvrow"><span class="seg2"><button type="button" data-ser="PDS">PDS</button><button type="button" data-ser="AMS">AMS</button></span><span id="lvread" class="lvnote"></span></div>
 <svg id="lvidfsvg" viewBox="0 0 360 240" data-nofit="1"></svg>`);
const cSens=mk('lvsens',`<h3>What if? <small>(same Tc, C and A)</small></h3><svg id="lvsenssvg" viewBox="0 0 360 170" data-nofit="1"></svg><div id="lvsensnote" class="lvnote"></div>`);
const sum=$('#summary');const pathCard=$('#path').closest('.card');
pathCard.before(cFlow);pathCard.after(cIdf);cIdf.after(cSens);
// ---------- number tweens on KPIs ----------
const prev={};
function tweenKPIs(){$('#summary').querySelectorAll('.kpi b').forEach((b,i)=>{const m=b.textContent.match(/^(-?[\d.]+)(.*)$/);if(!m)return;
 const to=+m[1],dec=(m[1].split('.')[1]||'').length,from=prev[i];prev[i]=to;if(RM.matches||from==null||from===to)return;
 b.classList.remove('lvpop');void b.offsetWidth;b.classList.add('lvpop');const t0=performance.now(),D=450;
 (function st(t){const k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);b.textContent=(from+(to-from)*e).toFixed(dec)+m[2];if(k<1)requestAnimationFrame(st);})(t0);});}
// ---------- raindrop path ----------
let anim=null,lastR=null;
function flow(R){lastR=R;const svg=$('#lvsvg'),rows=R.rows;if(!rows.length){svg.innerHTML='';return;}
 const tot=rows.reduce((a,r)=>a+r.L,0)||1,n=rows.length;
 // build a winding path from top-left (remote) down to the outlet; segment length ∝ ft (min 12% each)
 const share=rows.map(r=>0.12+0.88*(r.L/tot)*(1-0.12*n>0?1:0)),ss=share.reduce((a,b)=>a+b,0),P=[];
 const way=[[30,40],[300,70],[60,120],[320,150],[180,205]],wl=[];let WL=0;for(let i=1;i<way.length;i++){const d=Math.hypot(way[i][0]-way[i-1][0],way[i][1]-way[i-1][1]);wl.push(d);WL+=d;}
 const at=s=>{let d=s*WL;for(let i=0;i<wl.length;i++){if(d<=wl[i]||i===wl.length-1){const k=Math.min(1,d/wl[i]);return [way[i][0]+(way[i+1][0]-way[i][0])*k,way[i][1]+(way[i+1][1]-way[i][1])*k];}d-=wl[i];}};
 let s0=0,h=`<path d="M10 30 Q120 0 230 22 T350 34 L350 225 L10 225Z" fill="#eef6e9" stroke="#b9d3a8"/>`+
  [[60,18],[150,10],[250,16],[330,24]].map(([x,y],i)=>`<g class="lvrain" style="animation-delay:${i*0.35}s"><line x1="${x}" y1="${y-12}" x2="${x-3}" y2="${y}" stroke="#5aa0e6" stroke-width="2" stroke-linecap="round"/></g>`).join('');
 const segs=rows.map((r,i)=>{const a=s0,b=s0+share[i]/ss;s0=b;const pts=[];for(let k=0;k<=24;k++)pts.push(at(a+(b-a)*k/24));return {r,a,b,pts};});
 segs.forEach(({r,pts},i)=>{const w=r.t.match(/channel|kirpich/)?9:r.t==='shallow'?6:3,m=pts[12];
  h+=`<polyline points="${pts.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${COL[r.t]}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
  <text x="${m[0].toFixed(0)}" y="${(m[1]+(i%2?-9:18)).toFixed(0)}" font-size="11" text-anchor="middle" font-weight="700" fill="#1d2733" paint-order="stroke" stroke="#fff" stroke-width="3">${i+1}. ${fx(r.min,1)} min · ${fx(r.V,1)} ft/s</text>`;});
 const st=at(0),en=at(1);h+=`<circle cx="${st[0]}" cy="${st[1]}" r="5" fill="#1d2733"/><text x="${st[0]}" y="${st[1]-10}" font-size="11">Remote point</text>
  <path d="M${en[0]-8} ${en[1]-4}h16l-8 10z" fill="#c0392b"/><text x="${en[0]+12}" y="${en[1]+8}" font-size="11">Design point</text>
  <circle id="lvdrop" r="6" cx="${st[0]}" cy="${st[1]}" fill="#1f77b4" stroke="#fff" stroke-width="2"/>`;
 svg.innerHTML=h;svg._segs=segs;
 // contribution bar + dominant segment
 $('#lvbar').innerHTML=rows.map((r,i)=>`<span style="flex:${Math.max(r.min,0.001)};background:${COL[r.t]}" title="${i+1}">${100*r.min/R.tc>=12?`${i+1}: ${fx(100*r.min/R.tc,0)}%`:''}</span>`).join('');
 const dm=rows.reduce((a,r,i)=>r.min>rows[a].min?i:a,0),d=rows[dm];
 $('#lvdom').innerHTML=`Segment ${dm+1} (${(NAME[d.t]||d.t).toLowerCase()}) is ${fx(100*d.min/R.tc,0)}% of Tc — ${d.t==='sheet'||d.t==='kerby'?'slow, thin overland flow usually dominates; a shorter or steeper sheet-flow reach cuts Tc the most.':'improving this reach (slope, roughness) changes Tc the most.'}`;
 play();}
function play(){if(anim)cancelAnimationFrame(anim);const R=lastR,svg=$('#lvsvg'),segs=svg._segs,drop=$('#lvdrop');if(!segs||!drop)return;
 // animation time ∝ real travel time, compressed to ~6 s total; each segment's speed ∝ its velocity
 const D=6000,cum=[];let c=0;R.rows.forEach(r=>{cum.push([c,c+r.min]);c+=r.min;});
 const set=tm=>{let i=cum.findIndex(([a,b])=>tm<=b);if(i<0)i=cum.length-1;if(!cum[i]||!segs[i])return;const [a,b]=cum[i],k=Math.min(1,Math.max(0,b>a?(tm-a)/(b-a):1)),pts=segs[i].pts,f=k*(pts.length-1),j=Math.min(pts.length-2,Math.floor(f)),q=f-j;
  drop.setAttribute('cx',pts[j][0]+(pts[j+1][0]-pts[j][0])*q);drop.setAttribute('cy',pts[j][1]+(pts[j+1][1]-pts[j][1])*q);
  $('#lvt').textContent=tm.toFixed(1);$('#lvseg').textContent=`· ${NAME[R.rows[i].t]||R.rows[i].t} (${i+1}/${R.rows.length})`;};
 if(RM.matches){set(R.tc);$('#lvseg').textContent='· Tc reached';return;}
 const t0=performance.now();(function st(t){const k=Math.min(1,(t-t0)/D);set(k*R.tc);if(k<1)anim=requestAnimationFrame(st);else{$('#lvseg').textContent=`· Tc = ${fx(R.tc,1)} min ✓`;}})(t0);}
$('#lvplay').onclick=play;
// ---------- IDF chart ----------
const DUR=[5,7,10,15,20,30,45,60,90,120,180,240,360,480,720],IC=['#9ecae1','#6baed6','#4292c6','#2171b5','#08519c','#08306b'];
let idfPrev=null,idfAnim=null,curTc=10;
function idfCurves(){return RP.map(rp=>DUR.map(t=>Tc.intensity(idfAt(rp),t)));}
const X=t=>40+300*Math.log(t/5)/Math.log(720/5);
function idfDraw(cur,yMax){const svg=$('#lvidfsvg'),Y=v=>210-185*v/yMax;let h='';
 for(let k=0;k<=4;k++){const v=yMax*k/4;h+=`<line x1="40" x2="340" y1="${Y(v)}" y2="${Y(v)}" stroke="#e3e8ef"/><text x="35" y="${Y(v)+4}" font-size="10" text-anchor="end">${fx(v,v<10?1:0)}</text>`;}
 [5,10,30,60,120,360,720].forEach(t=>h+=`<text x="${X(t)}" y="224" font-size="10" text-anchor="middle">${t}</text>`);
 h+=`<text x="190" y="237" font-size="10" text-anchor="middle">Duration (min, log scale)</text><text x="6" y="14" font-size="10">in/hr</text>`;
 cur.forEach((c,j)=>{const on=RP[j]===S.rp;h+=`<polyline points="${c.map((v,i)=>X(DUR[i]).toFixed(1)+','+Y(v).toFixed(1)).join(' ')}" fill="none" stroke="${on?'#c0392b':IC[j]}" stroke-width="${on?3:1.6}"/>
  <text x="342" y="${Y(c[c.length-1])+3}" font-size="9" fill="${on?'#c0392b':IC[j]}">${RP[j]}</text>`;});
 const I=Tc.intensity(idfAt(S.rp),curTc);
 h+=`<g id="lvtc"><line x1="${X(curTc)}" x2="${X(curTc)}" y1="25" y2="210" stroke="#c0392b" stroke-dasharray="4 3"/><circle cx="${X(curTc)}" cy="${Y(I)}" r="5" fill="#c0392b"/>
  <text x="${Math.min(X(curTc)+6,250)}" y="${Math.max(Y(I)-8,34)}" font-size="11" font-weight="700" fill="#c0392b">Tc ${fx(curTc,1)} min → ${fx(I,2)} in/hr (${S.rp}-yr)</text></g><g id="lvtap"></g>`;
 svg.innerHTML=h;svg._Y=Y;svg._yMax=yMax;}
function idf(R){const to=idfCurves(),yMax=Math.ceil(Math.max(...to.flat())*1.08),tcTo=R.gov;const from=idfPrev,tcFrom=curTc;idfPrev=to;
 document.querySelectorAll('#lvidf [data-ser]').forEach(b=>b.classList.toggle('on',b.dataset.ser===S.ser));
 if(idfAnim)cancelAnimationFrame(idfAnim);
 if(RM.matches||!from){curTc=tcTo;idfDraw(to,yMax);return;}
 const t0=performance.now();(function st(t){const k=Math.min(1,(t-t0)/500),e=1-Math.pow(1-k,3);curTc=tcFrom+(tcTo-tcFrom)*e;
  idfDraw(to.map((c,j)=>c.map((v,i)=>from[j][i]+(v-from[j][i])*e)),yMax);if(k<1)idfAnim=requestAnimationFrame(st);})(t0);}
const tap=e=>{const svg=e.currentTarget,r=svg.getBoundingClientRect(),x=(e.clientX-r.left)*360/r.width;
 const t=Math.min(720,Math.max(5,5*Math.exp((x-40)/300*Math.log(720/5))));const Y=svg._Y;
 const vals=RP.map(rp=>Tc.intensity(idfAt(rp),t));
 $('#lvtap').innerHTML=`<line x1="${X(t)}" x2="${X(t)}" y1="25" y2="210" stroke="#1d2733" stroke-width="1"/>`+vals.map((v,j)=>`<circle cx="${X(t)}" cy="${Y(v)}" r="3.5" fill="${RP[j]===S.rp?'#c0392b':IC[j]}"/>`).join('');
 $('#lvread').innerHTML=`<b>${fx(t,0)} min:</b> `+vals.map((v,j)=>`${RP[j]}-yr ${fx(v,2)}`).join(' · ')+' in/hr';};$('#lvidfsvg').addEventListener('click',tap);
document.querySelectorAll('#lvidf [data-ser]').forEach(b=>b.onclick=()=>{const s=$('#ser');if(!s||s.value===b.dataset.ser)return;s.value=b.dataset.ser;s.dispatchEvent(new Event('input',{bubbles:true}));});
// ---------- what-if: Q vs design frequency ----------
function sens(R){const A=S.sub.reduce((a,u)=>a+u.A,0),C=S.sub.reduce((a,u)=>a+u.C*u.A,0)/A,Qs=RP.map(rp=>C*Tc.intensity(idfAt(rp),R.gov)*A),mx=Math.max(...Qs)*1.15||1;
 const bw=44;let h='';Qs.forEach((q,j)=>{const x=22+j*56,hh=120*q/mx,on=RP[j]===S.rp;
  h+=`<rect class="lvgrow" x="${x}" y="${140-hh}" width="${bw}" height="${hh}" rx="4" fill="${on?'#c0392b':IC[j]}" data-rp="${RP[j]}" style="cursor:pointer"/><text x="${x+bw/2}" y="${136-hh}" font-size="11" text-anchor="middle" font-weight="${on?700:400}">${fx(q,1)}</text><text x="${x+bw/2}" y="156" font-size="11" text-anchor="middle">${RP[j]}-yr</text>`;});
 $('#lvsenssvg').innerHTML=h+'<text x="4" y="12" font-size="10">Q (cfs)</text>';
 const q100=Qs[5],qd=Qs[RP.indexOf(S.rp)];$('#lvsensnote').innerHTML=`Tap a bar to switch the design frequency. The 100-yr check flow is ${fx(q100/qd,2)}× the ${S.rp}-yr design flow.`;}
$('#lvsenssvg').addEventListener('click',e=>{const rp=e.target.dataset&&e.target.dataset.rp,s=$('#rp');if(rp&&s){s.value=rp;s.dispatchEvent(new Event('input',{bubbles:true}));}});
// ---------- quick sliders (drive the real inputs, so all checks/warnings still run) ----------
const RANGE={L:[[10,300,5],[50,3000,10],[100,10000,50]],S:[0.001,0.1,0.001],C:[0.05,0.95,0.01],A:[0.5,200,0.5]};
function sliders(){const form=$('#form');if(!form||form.querySelector('#lvsl'))return;const items=[];
 if(mode==='NRCS')S.segs.forEach((s,j)=>{const r=RANGE.L[s.t==='sheet'?0:s.t==='shallow'?1:2];items.push([`L${j}`,`${j+1}. ${NAME[s.t].split(' ')[0]} length (ft)`,r],[`S${j}`,`${j+1}. slope (ft/ft)`,RANGE.S]);if(s.t==='channel')items.push([`n${j}`,`${j+1}. Manning n`,[0.011,0.08,0.001]]);});
 else items.push(['Lo','Overland length (ft)',[50,1200,10]],['So','Overland slope',RANGE.S],['Lc','Channel length (ft)',[500,30000,100]],['Sc','Channel slope',RANGE.S]);
 S.sub.forEach((u,j)=>items.push([`C${j}`,`Sub-area ${j+1} C`,RANGE.C],[`A${j}`,`Sub-area ${j+1} area (ac)`,RANGE.A]));
 const fs=document.createElement('fieldset');fs.id='lvsl';fs.innerHTML=`<legend>Quick sliders (drag to explore)</legend>`+items.filter(([id])=>$('#'+id)).map(([id,l,[a,b,st]])=>{const v=+$('#'+id).value;
  return `<div class="f lvs"><label><span>${l}</span><output id="o_${id}">${v}</output></label><input type="range" min="${a}" max="${Math.max(b,v)}" step="${st}" value="${v}" data-for="${id}"></div>`;}).join('')+'<div class="lvnote">Sliders move the matching inputs below, so every warning and the Explain steps update too.</div>';
 form.prepend(fs);}
$('#form').addEventListener('input',e=>{const id=e.target.dataset&&e.target.dataset.for;if(!id)return;e.stopPropagation();const t=$('#'+id);if(!t)return;
 t.value=e.target.value;$('#o_'+id).textContent=e.target.value;t.dispatchEvent(new Event('input',{bubbles:true}));},true);
$('#form').addEventListener('input',e=>{const t=e.target;if(t.type==='number'&&t.id){const r=document.querySelector(`#lvsl [data-for="${t.id}"]`);if(r){r.value=t.value;$('#o_'+t.id).textContent=t.value;}}});
new MutationObserver(()=>sliders()).observe($('#form'),{childList:true});
// ---------- searchable county picker ----------
function picker(){const cs=$('#county');if(!cs||$('#lvcty'))return;const box=document.createElement('div');box.className='f';box.innerHTML=`<label><span>Find county</span><input id="lvcty" list="lvctyl" placeholder="type to search…" autocomplete="off"></label><datalist id="lvctyl">${counties.map(c=>`<option value="${c}">`).join('')}</datalist><div class="lvnote" id="lvzones"></div>`;
 cs.closest('.f').before(box);const zs=()=>{$('#lvzones').innerHTML='IDF zones: '+zones(S.county).map(r=>`<span class="lvchip${r[1]===S.zone?' on':''}">${r[1]}</span>`).join(' ');};zs();
 $('#lvcty').addEventListener('change',e=>{e.stopPropagation();const v=counties.find(c=>c.toLowerCase()===e.target.value.trim().toLowerCase());if(v){cs.value=v;cs.dispatchEvent(new Event('input',{bubbles:true}));}});}
$('#form').addEventListener('input',e=>{if(e.target.id==='lvcty')e.stopPropagation();},true);
new MutationObserver(()=>picker()).observe($('#form'),{childList:true});
// ---------- hook render ----------
const orig=window.render;window.render=function(){orig.apply(this,arguments);try{const R=compute();R.gov=Math.max(R.tc,Tc.TC_MIN);flow(R);idf(R);sens(R);tweenKPIs();}catch(e){console.warn('live layer',e);}};
sliders();picker();window.render();
})();
