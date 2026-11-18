/* Auto-size table, TxDOT panel, report rows, and undo/redo. Loaded after app.js. */
(function(){
const S=window.Studio, C=window.Culvert;
if(!S||!C)return;
let hist=[], fut=[], snap=null, pending=null, lock=false, timer=null;
const shot=()=>JSON.stringify(readForm());
function paint(){const u=document.getElementById('undoBtn'), r=document.getElementById('redoBtn'); if(u)u.disabled=!hist.length; if(r)r.disabled=!fut.length;}
function commit(){if(lock)return; const now=shot(); if(pending!=null&&pending!==now){hist.push(pending); if(hist.length>50)hist.shift(); fut=[];} pending=null; snap=now; paint();}
function restore(raw){lock=true; try{applyValues(JSON.parse(raw)); if(typeof run==='function')run();}finally{lock=false;} snap=shot(); pending=null; paint();}
function undo(){if(lock||!hist.length)return; fut.push(shot()); restore(hist.pop());}
function redo(){if(lock||!fut.length)return; hist.push(shot()); restore(fut.pop());}
document.addEventListener('input', e=>{if(lock||!e.target.closest||!e.target.closest('#form'))return; if(pending==null)pending=snap; clearTimeout(timer); timer=setTimeout(commit, 450);});
document.addEventListener('keydown', e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return; const k=e.key.toLowerCase(); if(k==='z'){e.preventDefault(); e.shiftKey?redo():undo();} else if(k==='y'){e.preventDefault(); redo();}});
const head=document.querySelector('header');
if(head&&!document.getElementById('undoBtn')){const box=document.createElement('span'); box.className='undobox'; box.innerHTML='<button type="button" id="undoBtn">Undo</button><button type="button" id="redoBtn">Redo</button>'; head.appendChild(box); undoBtn.onclick=undo; redoBtn.onclick=redo;}
const sum=document.getElementById('summary');
if(sum&&!document.getElementById('sizecard')){
  const size=document.createElement('div'); size.className='card'; size.id='sizecard';
  size.innerHTML='<h3>Auto-size <button type="button" id="sizebtn">Rank smallest that pass</button></h3><p class="muted" id="sizenote">Uses the design flow, allowable headwater, HW/D limit, freeboard and minimum cover. Only built-in circular pipes and concrete boxes are ranked. Debris blockage, if set, is included.</p><div id="sizetable"></div>';
  sum.after(size);
  const tx=document.createElement('div'); tx.className='card'; tx.id='txcard';
  tx.innerHTML='<h3>TxDOT design checks</h3><div id="txbody"></div>';
  size.after(tx);
  sizebtn.onclick=rank;
}
document.addEventListener('click', e=>{const b=e.target.closest&&e.target.closest('[data-use]'); if(!b||!window._sizes)return; useOpt(window._sizes[+b.dataset.use]);});
function num(id){const e=document.getElementById(id); return e?parseFloat(e.value):NaN;}
function crestOf(L){return L&&L.ro?C.crestMin(L.ro):NaN;}
function badge(st){return st==='pass'?'PASS':st==='fail'?'FAIL':st==='check'?'CHECK':'INFO';}
function cls(st){return st==='check'?'warn':st;}
function panel(){
  const L=window.LAST; const box=document.getElementById('txbody'); if(!L||!L.r||!box)return;
  const US=L.r.US!==false, cr=C.criteriaIn(window.state&&state.criteria, US);
  const el=L.bal&&L.bal.over?L.bal.EL:L.r.EL;
  const rows=S.txdotPanel({US, design:{EL:el, HW:el-L.p.invIn, D:L.r.D, Vout:L.r.Vout}, designOver:!!(L.bal&&L.bal.over), check:L.check?{EL:L.check.EL, HW:L.check.HW, D:L.r.D, Vout:L.check.Vout}:null, checkOver:!!(L.check&&L.check.over), allowEl:L.allow, crest:crestOf(L), cover:+L.p.cover, minCover:num('minCover'), criteria:cr});
  const sed=document.getElementById('sedOn'), fish=document.getElementById('fishOn');
  if(sed&&sed.value==='on'){const q=num('Qsed'), Qs=q>0?q:L.p.Q*0.1; try{const rs=C.analyze(Object.assign({}, L.p, {Q:Qs})); const sc=S.sedimentCheck(rs, US); rows.push({storm:'Low flow', item:'Self-cleansing', status:sc.pass?'pass':'check', text:'At '+Qs.toFixed(2)+' the outlet velocity is '+sc.V.toFixed(2)+' vs '+sc.vmin.toFixed(2)+'. '+sc.source});}catch(e){}}
  if(fish&&fish.value==='on'){const q=num('Qfish'); if(!(q>0)) rows.push({storm:'Fish', item:'Passage flow', status:'info', text:'Enter a fish-passage discharge. '+S.SOURCES.fish}); else {try{const rs=C.analyze(Object.assign({}, L.p, {Q:q})); const fc=S.fishCheck(rs); rows.push({storm:'Fish', item:'Velocity', status:fc.vPass?'pass':'fail', text:'Velocity '+fc.V.toFixed(2)+' vs '+fc.vmax.toFixed(2)+'. '+fc.source}); rows.push({storm:'Fish', item:'Depth', status:fc.dPass?'pass':'fail', text:'Controlling depth '+fc.depth.toFixed(2)+' vs '+fc.dmin.toFixed(2)+'.'});}catch(e){}}}
  box.innerHTML=rows.map(r=>`<div class="rf ${cls(r.status)}"><span class="rb">${badge(r.status)}</span><b>${r.storm} · ${r.item}.</b> ${r.text}</div>`).join('')+'<p class="muted">Sources: TxDOT HDM Ch. 8 §2 (allowable headwater and the 3 ft/s and 12 ft/s velocity rules), Ch. 4 §6 Table 4-2 (design AEP and the 1% check flood), and FHWA HDS-5 §2.2.5 and §3.2. The report lists the links.</p>';
  const R=document.getElementById('report'); if(!R||R.querySelector('.rtx'))return;
  R.insertAdjacentHTML('beforeend', '<h4 class="rtx">TxDOT screening</h4><ul class="rchk">'+rows.map(r=>`<li class="rf ${cls(r.status)}"><span class="rb">${badge(r.status)}</span><b>${r.storm} · ${r.item}.</b> ${r.text}</li>`).join('')+'</ul><p class="rnote">Same checks as the TxDOT panel. Debris, sediment and fish passage stay off until you turn them on. '+S.SOURCES.debris+' '+S.SOURCES.sediment+' '+S.SOURCES.fish+'</p>');
  if(window.ReportPDF)ReportPDF.prep();
}
function rank(){
  const L=window.LAST, note=document.getElementById('sizenote'); if(!L||!L.p){if(note)note.textContent='Run a design first.'; return;}
  note.textContent='Ranking pipe and box options…';
  setTimeout(()=>{
    const rows=S.rankOptions(L.p, {allowEl:num('allowHW'), hwDMax:(state.criteria&&state.criteria.hwDMax)||1.5, freeboard:num('freeboard')||0, minCover:num('minCover')||0, crest:crestOf(L)});
    const pass=rows.filter(r=>r.pass).slice(0,8), fail=pass.length<3?rows.filter(r=>!r.pass).slice(0,4):[];
    const show=pass.concat(fail); window._sizes=show;
    const u=L.r.US?'ft':'m', v=L.r.US?'ft/s':'m/s';
    note.textContent=pass.length?pass.length+' passing option'+(pass.length>1?'s':'')+' , smallest first.'+' '+(rows.filter(r=>r.pass).length)+' of '+rows.length+' candidates pass.':'No candidate passes. The nearest misses are listed.';
    document.getElementById('sizetable').innerHTML=show.length?`<div style="overflow-x:auto"><table class="size"><tr><th>Option</th><th>HW el (${u})</th><th>HW/D</th><th>Control</th><th>V out (${v})</th><th>Cover (${u})</th><th></th></tr>`+show.map((r,i)=>`<tr class="${r.pass?'':'fail'}"><td>${r.label}${r.pass?'':'<br><small>'+r.reasons.join('; ')+'</small>'}</td><td>${r.EL.toFixed(2)}</td><td>${r.HWD.toFixed(2)}</td><td>${r.control}</td><td>${r.Vout.toFixed(2)}</td><td>${isFinite(r.cover)?r.cover.toFixed(2):'—'}</td><td><button type="button" data-use="${i}">Use this</button></td></tr>`).join('')+'</table></div>':'';
  }, 30);
}
function useOpt(o){
  if(!o)return;
  if(pending!=null)commit();
  hist.push(shot()); fut=[]; if(hist.length>50)hist.shift();
  lock=true;
  const shape=document.getElementById('shape'); shape.value=o.shape; fill('material');
  const mat=document.getElementById('material'); if([...mat.options].some(x=>x.value===o.material))mat.value=o.material;
  fill('inlet'); const inl=document.getElementById('inlet'); if([...inl.options].some(x=>x.value===o.inletId))inl.value=o.inletId;
  document.getElementById('span').value=+o.span.toFixed(3);
  document.getElementById('rise').value=+o.rise.toFixed(3);
  document.getElementById('barrels').value=o.barrels;
  document.getElementById('n').value=o.n;
  if(typeof shapeVis==='function')shapeVis();
  lock=false; snap=shot(); pending=null; paint();
  if(typeof run==='function')run();
}
const prev=window.drawProfile;
window.drawProfile=function(){const o=prev?prev.apply(this, arguments):undefined; try{panel();}catch(e){console.warn('checks', e);} return o;};
window.StudioUI={lock:v=>{lock=!!v;}, reset:()=>{hist=[]; fut=[]; pending=null; snap=shot(); paint();}, undo, redo};
snap=shot(); paint();
if(window.LAST)panel();
})();
