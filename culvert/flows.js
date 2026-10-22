/* Design + check flood (1% AEP) display, and flows handed over from the Rational Method tool. */
(function(){const prev=window.drawProfile,f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
const q=new URLSearchParams(location.search);let src=null;
try{if(q.get('from')==='rational'){src=JSON.parse(localStorage.getItem('hydro.handoff')||'null');
  if(src&&!q.has('Q')){const set=(id,v)=>{const e=document.getElementById(id);if(e&&v>0)e.value=(+v).toFixed(2);};set('Q',src.Q);set('Qcheck',src.Qcheck);}}}catch(e){}
if(!src&&q.get('from')==='rational')src={Q:+q.get('Q'),Qcheck:+q.get('Qcheck'),rp:+q.get('rp'),county:q.get('county')||'',zone:q.get('zone')||'',tc:+q.get('tc'),C:+q.get('C'),A:+q.get('A'),i:+q.get('i'),i100:+q.get('i100'),ser:q.get('ser')||''};
// keep rating-curve range covering the check flood
(()=>{const k=document.getElementById('Qcheck'),mx=document.getElementById('Qmax');if(k&&mx&&+k.value>+mx.value)mx.value=(1.1*k.value).toFixed(1);})();
function srcLine(US){if(!src)return '';return `Flows sent from the Rational Method tool: design ${f(src.Q,1)} cfs (${src.rp}-yr) and check ${f(src.Qcheck,1)} cfs (100-yr, 1% AEP), ${src.county} County${src.zone?' · '+src.zone:''} ${src.ser||''} IDF, Tc ${f(src.tc,1)} min, C ${f(src.C,3)}, A ${f(src.A,2)} ac, i ${f(src.i,2)} / ${f(src.i100,2)} in/hr.${US?'':' (Converted to SI in the culvert tool only if you switch units — re-enter flows.)'}`;}
function render(p,r){const K=window.CHECK,US=r.US,L=US?'ft':'m',Qu=US?'cfs':'m³/s',V=US?'ft/s':'m/s';
 const sm=document.getElementById('summary');
 if(sm&&K&&!sm.querySelector('.kchk'))sm.insertAdjacentHTML('beforeend',`<div class="kpi kchk">Check flood (1% AEP) HW<b>${f(K.HW)} ${L}</b>El. ${f(K.EL)} ${L} · Q ${f(K.Qt,1)} ${Qu}${K.over?' · road overtops '+f(K.Qr,1)+' '+Qu:''}</div>`);
 const R=document.getElementById('report');if(!R||!R.innerHTML||R.querySelector('.rchkf'))return;
 const allow=parseFloat((document.getElementById('allowHW')||{}).value);
 const T42='<a href="https://www.txdot.gov/manuals/des/hyd/chapter-4--hydrology/section-6--design-flood-and-check-flood-standards.html" target="_blank" rel="noopener">TxDOT HDM Ch. 4 §6</a>';
 let h=`<h4 class="rchkf">Design flood and check flood</h4><table class="rt"><tr><th>Flow</th><td><b>Design:</b> ${f(p.Q+(0),1)} ${Qu} through the culvert${K?` · <b>Check (1% AEP):</b> ${f(K.Qt,1)} ${Qu} total (${f(K.Qc,1)} culvert${K.over?', '+f(K.Qr,1)+' over the road':''})`:''}</td></tr>`;
 if(K)h+=`<tr><th>Check-flood headwater</th><td>El. ${f(K.EL)} ${L} (HW ${f(K.HW)} ${L}, ${K.control} control); outlet velocity ${f(K.Vout)} ${V}</td></tr>`;
 h+=`</table>`;
 const li=[];
 if(K){li.push(`<li class="rf ${K.over?'warn':'pass'}"><span class="rb">${K.over?'CHECK':'PASS'}</span>${T42}: "All facilities must be evaluated to the 1% AEP flood event." At ${f(K.Qt,1)} ${Qu} the headwater reaches El. ${f(K.EL)} ${L}${K.over?` and ${f(K.Qr,1)} ${Qu} flows over the roadway — confirm this is acceptable (roadway serviceability is required only up to the design flood; check upstream property and safety).`:', below the road crest — no overtopping.'}</li>`);
  if(isFinite(allow))li.push(`<li class="rf ${K.EL<=allow?'pass':'warn'}"><span class="rb">${K.EL<=allow?'PASS':'CHECK'}</span>Check-flood headwater El. ${f(K.EL)} ${L} vs the allowable headwater you entered (El. ${f(allow)} ${L}).</li>`);}
 else li.push(`<li class="rf warn"><span class="rb">CHECK</span>No check-flood flow entered. ${T42}: "All facilities must be evaluated to the 1% AEP flood event." Enter the 100-yr flow in Flows → Check flood discharge.</li>`);
 h+=`<ul class="rchk">${li.join('')}</ul>`;
 const sl=srcLine(US);if(sl)h+=`<p class="rnote">${sl}</p>`;
 const anchor=[...R.querySelectorAll('h4')].find(x=>/Design checks/.test(x.textContent));
 if(anchor)anchor.insertAdjacentHTML('beforebegin',h);else R.insertAdjacentHTML('beforeend',h);
 if(window.ReportPDF)ReportPDF.prep();}
window.drawProfile=function(p,r,...a){const o=prev?prev.call(this,p,r,...a):undefined;try{render(p,r);}catch(e){console.warn('flows',e);}return o;};
if(typeof window.run==='function')try{window.run();}catch(e){}
})();
