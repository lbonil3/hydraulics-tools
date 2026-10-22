/* Phase 4: outlet protection per FHWA HEC-14 (2006): riprap apron (Sec. 10.2, Eq. 10.4/10.5, Table 10.1) and dissipator screening (Table 1.1). */
(function(){const prev=window.drawProfile,f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
const H14='<a href="https://www.fhwa.dot.gov/engineering/hydraulics/pubs/06086/hec14.pdf" target="_blank" rel="noopener">FHWA HEC-14</a>';
function sg(){const e=document.getElementById('opSG');const v=e?parseFloat(e.value):2.65;return v>1?v:2.65;}
function calc(p,r){const US=r.US,g=US?32.174:9.81,y=r.yout,Fr=y>0?r.Vout/Math.sqrt(g*y):NaN,sup=isFinite(r.dc)&&y<r.dc*0.999;
 const a=Culvert.riprapApron({US,Q:r.Q,D:r.D,TW:p.twMode==='none'?0:r.TW,supercritical:sup,yn:r.yn,SG:sg()});return{a,Fr,sup,circ:p.shape==='circular'&&!p.section};}
function card(p,r,o){let c=document.getElementById('opcard');const anchor=document.getElementById('cmpcard')||document.getElementById('inletcard');if(!anchor)return;
 if(!c){c=document.createElement('div');c.className='card';c.id='opcard';anchor.after(c);
  c.innerHTML=`<h3>Outlet protection <small>(${H14})</small></h3><label style="display:flex;gap:8px;align-items:center;margin:4px 0">Rock specific gravity <input id="opSG" type="number" step="0.05" value="2.65" style="width:80px"></label><div id="opbody"></div>`;
  c.querySelector('#opSG').addEventListener('input',()=>{if(window.run)run();});}
 const US=r.US,L=US?'ft':'m',a=o.a,u=US?'in':'mm';
 const list=Culvert.dissipatorsFor(o.Fr).filter(x=>x.ok);
 c.querySelector('#opbody').innerHTML=(a.over?`<p class="warn">Required D<sub>50</sub> ${f(a.d50u,1)} ${u} exceeds the largest Table 10.1 class (22 in / 550 mm). An apron is not adequate — consider a riprap basin or another energy dissipator below.</p>`:
 `<p><b>Riprap apron: Class ${a.cls}</b> (D<sub>50</sub> ${US?[0,5,6,10,14,20,22][a.cls]+' in':[0,125,150,250,350,500,550][a.cls]+' mm'}; required ${f(a.d50u,1)} ${u}). Length ${f(a.L,1)} ${L} (${a.kL}D), thickness ${f(a.depth,2)} ${L} (${a.kd}D<sub>50</sub>), end width ${f(a.W,1)} ${L} (3D + ⅔L). Place at zero grade with a filter blanket (HEC-11).</p>`)+
 `<p class="muted">Outlet velocity ${f(r.Vout)} ${US?'ft/s':'m/s'}, depth ${f(r.yout)} ${L}, Froude number Fr = V/√(g·y) = ${f(o.Fr)}. HEC-14 Table 1.1 dissipators suited to this Froude number: ${list.map(x=>x.name+' (Ch. '+x.ch+', TW '+(x.tw[0]==='<'?x.tw:x.tw.toLowerCase())+')').join('; ')}.</p>`;}
function notes(r,o){const a=o.a,US=r.US,L=US?'ft':'m',li=[];
 li.push(`<li class="rf info"><span class="rb">INFO</span>Eq. 10.4: D<sub>50</sub> = 0.2·D′·[Q/(√g·D′<sup>2.5</sup>)]<sup>4/3</sup>·(D′/TW)·(2.65/S<sub>s</sub>) with Q per barrel ${f(r.Q,1)} ${US?'cfs':'m³/s'}, D′ = ${f(a.Dp)} ${L}${o.sup?' (supercritical outlet: Eq. 10.5, D′ = (D + y<sub>n</sub>)/2)':''}, TW = ${f(a.TW)} ${L}, S<sub>s</sub> = ${f(a.SG)} → ${f(a.D50,3)} ${L}.</li>`);
 if(a.twNote==='raised'||a.twNote==='unknown')li.push(`<li class="rf info"><span class="rb">INFO</span>HEC-14: "Tailwater depth for Equation 10.4 should be limited to between 0.4D and 1.0D. If tailwater is unknown, use 0.4D." TW set to 0.4D = ${f(a.TW)} ${L}.</li>`);
 if(a.twNote==='high')li.push(`<li class="rf warn"><span class="rb">CHECK</span>Tailwater exceeds 1.0D. HEC-14 says to use Figure 10.3 (velocity decay downstream of the outlet) and Sec. 10.3 for sizing; this tool evaluated Eq. 10.4 at TW = 1.0D only as a screening value.</li>`);
 if(!o.circ)li.push(`<li class="rf warn"><span class="rb">CHECK</span>HEC-14 recommends Eq. 10.4 "for circular culverts". For this barrel shape it is applied with D = culvert rise (Table 10.1 note: "D is the culvert rise") as an approximation — verify with the owning agency.</li>`);
 if(r.D>(US?5:1.5)+1e-9)li.push(`<li class="rf warn"><span class="rb">CHECK</span>HEC-14 uses riprap aprons "primarily for culverts 1500 mm (60 in) or smaller"; rise is ${f(r.D)} ${L}. Consider a riprap basin or another dissipator.</li>`);
 if(a.over)li.push(`<li class="rf fail"><span class="rb">FAIL</span>Required D<sub>50</sub> is larger than Table 10.1 class 6 (22 in). Use a riprap basin or energy dissipator.</li>`);
 return li.join('');}
function render(p,r){const o=calc(p,r);window.OUTLET=o;card(p,r,o);
 const sm=document.getElementById('summary');if(sm&&!sm.querySelector('.kop'))sm.insertAdjacentHTML('beforeend',`<div class="kpi kop">Outlet protection<b>${o.a.over?'Dissipator':'Class '+o.a.cls+' apron'}</b>${o.a.over?'D50 beyond Table 10.1':`L ${f(o.a.L,1)} × W ${f(o.a.W,1)} ${r.US?'ft':'m'}`} · Fr ${f(o.Fr)}</div>`);
 const R=document.getElementById('report');if(!R||!R.innerHTML||R.querySelector('.rop'))return;const a=o.a,US=r.US,L=US?'ft':'m';
 const cl=a.over?'None in Table 10.1 (required D50 '+f(a.d50u,1)+(US?' in':' mm')+')':`Class ${a.cls}, D50 ${US?[0,5,6,10,14,20,22][a.cls]+' in':[0,125,150,250,350,500,550][a.cls]+' mm'} (required ${f(a.d50u,1)} ${US?'in':'mm'})`;
 let h=`<h4 class="rop">Outlet protection (FHWA HEC-14)</h4><table class="rt"><tr><th>Outlet flow</th><td>V ${f(r.Vout)} ${US?'ft/s':'m/s'}, depth ${f(r.yout)} ${L}, Fr ${f(o.Fr)}${o.sup?' (supercritical)':''}</td></tr><tr><th>Riprap class (Table 10.1)</th><td>${cl}</td></tr>`;
 if(!a.over)h+=`<tr><th>Apron dimensions</th><td>Length ${f(a.L,1)} ${L}, thickness ${f(a.depth,2)} ${L}, end width ${f(a.W,1)} ${L}, zero grade, filter blanket per HEC-11</td></tr>`;
 h+=`<tr><th>Dissipators for this Fr (Table 1.1)</th><td>${Culvert.dissipatorsFor(o.Fr).filter(x=>x.ok).map(x=>x.name).join('; ')}</td></tr></table><ul class="rchk">${notes(r,o)}</ul><p class="rnote">Source: FHWA HEC-14, Hydraulic Design of Energy Dissipators for Culverts and Channels (3rd ed., 2006), Sec. 10.2 Eq. 10.4–10.5, Table 10.1 (FHWA Federal Lands Highway Division example classes), Table 1.1. Inspect aprons after major floods.</p>`;
 const an=[...R.querySelectorAll('h4')].find(x=>/Design checks/.test(x.textContent));if(an)an.insertAdjacentHTML('beforebegin',h);else R.insertAdjacentHTML('beforeend',h);if(window.ReportPDF)ReportPDF.prep();}
window.drawProfile=function(p,r,...x){const o=prev?prev.call(this,p,r,...x):undefined;try{render(p,r);}catch(e){console.warn('outlet',e);}return o;};
if(typeof window.run==='function')try{window.run();}catch(e){}})();
