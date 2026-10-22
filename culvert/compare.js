/* Phase 3: side-by-side comparison of culvert options (size, shape, barrels, inlet). Options are input snapshots kept in localStorage. */
(function(){const KEY='culvert.options',f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
const ids=()=>F.map(r=>r[0]).filter(id=>document.getElementById(id));
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]}},store=a=>localStorage.setItem(KEY,JSON.stringify(a));
function evalNow(){state.Qtot=val('Q');const p=params();p.S=(p.invIn-p.invOut)/p.length;if(!p.inlet||!(p.Q>0))return null;
 const ro=roadObj(p),Qt=p.Q;let bal=null;if(ro&&!ro.bad){bal=balQ(Qt,elOf,ro);p.Q=bal.Qc;}const r=C.analyze(p);const ck=checkFlood(ro);
 const EL=bal&&bal.over?bal.EL:r.EL;
 const desc=(p.section?Shapes.label(p.shape)+' '+f(p.span,1)+'×'+f(p.rise,1):p.shape==='box'?'Box '+f(p.span,1)+'×'+f(p.rise,1):'Pipe '+f(p.rise*(state.units==='US'?12:1000),0)+(state.units==='US'?'in':'mm'));
 const inl=$('#inlet');return{desc,N:p.barrels,inlet:inl&&inl.selectedOptions[0]?inl.selectedOptions[0].text.split(' — ')[0]:'',Q:Qt,EL,HWD:(EL-p.invIn)/r.D,control:r.control,Vout:r.Vout,Qr:bal?bal.Qr:0,ckEL:ck?ck.EL:null,ckOver:ck?ck.over:false,units:state.units,allow:val('allowHW')};}
function snap(){const o={};ids().forEach(id=>o[id]=document.getElementById(id).value);return o;}
function apply(v){['shape','material','size','inlet'].concat(ids()).forEach(id=>{const e=document.getElementById(id);if(e&&id in v){e.value=v[id];e.dispatchEvent(new Event('input',{bubbles:true}));}});
 ids().forEach(id=>{const e=document.getElementById(id);if(e&&id in v)e.value=v[id];});run();}
function draw(){const a=load(),box=document.getElementById('cmpbody');if(!box)return;const L=state.units==='US'?'ft':'m',V=state.units==='US'?'ft/s':'m/s';
 if(!a.length){box.innerHTML='<p class="muted">No options saved yet. Set up a barrel, then tap <b>Save current as option</b>. Change the size, shape, barrels or inlet and save again to compare.</p>';return;}
 const best=a.reduce((b,o,i)=>o.r&&(b<0||o.r.EL<a[b].r.EL)?i:b,-1);
 box.innerHTML=`<div class="cmpwrap" style="overflow-x:auto"><table class="cmp"><thead><tr><th>Option</th><th>Barrel</th><th>N</th><th>Inlet</th><th>HW el (${L})</th><th>HW/D</th><th>Control</th><th>V out (${V})</th><th>Overtop Q</th><th>Check-flood HW el</th><th></th></tr></thead><tbody>${a.map((o,i)=>{const r=o.r||{};const bad=(isFinite(r.allow)&&r.EL>r.allow)||r.HWD>1.2;
 return`<tr${i===best?' style="background:#eaf6ea"':''}><td><b>${o.name}</b></td><td>${r.desc||''}</td><td>${r.N||''}</td><td style="white-space:normal;min-width:120px">${r.inlet||''}</td><td${bad?' style="color:#b00"':''}>${f(r.EL)}</td><td>${f(r.HWD)}</td><td>${r.control||''}</td><td>${f(r.Vout)}</td><td>${r.Qr>0?f(r.Qr,1):'none'}</td><td>${r.ckEL!=null?f(r.ckEL)+(r.ckOver?' (overtops)':''):'—'}</td><td><button data-ld="${i}">Load</button> <button data-rm="${i}">✕</button></td></tr>`}).join('')}</tbody></table></div>
 <p class="muted">Green row: lowest design headwater. Red: above the allowable headwater or HW/D &gt; 1.2. Values are from when each option was saved; Load to edit and re-save.</p>`;}
function init(){const anchor=document.getElementById('inletcard');if(!anchor||document.getElementById('cmpcard'))return;
 const c=document.createElement('div');c.className='card';c.id='cmpcard';
 c.innerHTML='<h3>Compare options <small>(size, shape, barrels, inlet)</small></h3><p class="muted">Each barrel of a multi-barrel culvert carries an equal share of the flow (HY-8 identical barrels). Save several options to see headwater, control and outlet velocity side by side.</p><button id="cmpsave">Save current as option</button> <button id="cmpclear">Clear all</button><div id="cmpbody"></div>';
 anchor.after(c);
 c.addEventListener('click',e=>{const t=e.target,a=load();
  if(t.id==='cmpsave'){const r=evalNow();if(!r)return;a.push({name:'Option '+String.fromCharCode(65+a.length%26),v:snap(),r});store(a);draw();run();}
  else if(t.id==='cmpclear'){store([]);draw();run();}
  else if(t.dataset.rm!=null){a.splice(+t.dataset.rm,1);a.forEach((o,i)=>o.name='Option '+String.fromCharCode(65+i));store(a);draw();run();}
  else if(t.dataset.ld!=null){apply(a[+t.dataset.ld].v);}});
 draw();window.CMP={evalNow,load,draw};}

function report(){const R=document.getElementById('report');if(!R||!R.innerHTML||R.querySelector('.rcmp'))return;const a=load();if(!a.length)return;const L=state.units==='US'?'ft':'m',V=state.units==='US'?'ft/s':'m/s';
 const h=`<h4 class="rcmp">Options compared</h4><table class="rt">${a.map(o=>{const r=o.r||{};return`<tr><th>${o.name}</th><td>${r.desc}, ${r.N} barrel${r.N>1?'s':''}, ${r.inlet}: HW El. ${f(r.EL)} ${L} (HW/D ${f(r.HWD)}, ${r.control} control), V<sub>out</sub> ${f(r.Vout)} ${V}, overtopping ${r.Qr>0?f(r.Qr,1):'none'}${r.ckEL!=null?`, check flood El. ${f(r.ckEL)} ${L}`:''}</td></tr>`}).join('')}</table><p class="rnote">Saved option snapshots; each barrel of a multi-barrel option carries an equal share of the flow.</p>`;
 const an=[...R.querySelectorAll('h4')].find(x=>/Design checks/.test(x.textContent));if(an)an.insertAdjacentHTML('beforebegin',h);else R.insertAdjacentHTML('beforeend',h);if(window.ReportPDF)ReportPDF.prep();}
const prevDP=window.drawProfile;window.drawProfile=function(...x){const o=prevDP?prevDP.apply(this,x):undefined;try{report();}catch(e){}return o;};
init();})();
