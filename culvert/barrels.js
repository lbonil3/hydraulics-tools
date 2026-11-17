/* Dissimilar barrels at one crossing. Barrel 1 is the form. Extras share the upstream water surface and the tailwater elevation; calc.splitFlow divides the discharge. */
(function(){
function persist(){try{localStorage.setItem('culvert.extras',JSON.stringify(state.extras||[]));}catch(e){}}
function blank(){const shape=val('shape')==='box'?'box':'circular';
 return {shape,span:+val('span')||+val('rise'),rise:+val('rise'),length:+val('length'),invIn:+val('invIn'),invOut:+val('invOut'),n:+val('n'),inlet:val('inlet')};}
function draw(){const form=document.getElementById('form');if(!form)return;
 let c=document.getElementById('barrelcard');
 if(!c){c=document.createElement('fieldset');c.id='barrelcard';const crit=document.getElementById('critbox');if(crit)crit.before(c);else form.appendChild(c);}
 const L=state.units==='US'?'ft':'m';
 const rows=(state.extras||[]).map((e,i)=>{const key=e.shape==='box'?'box':'circular';
  const opts=(Culvert.INLETS[key]||[]).map(inl=>`<option value="${inl.id}"${inl.id===e.inlet?' selected':''}>${inl.name}</option>`).join('');
  return `<div class="xb" data-i="${i}"><b>Barrel ${i+2}</b>
   <label>Shape <select data-k="shape"><option value="circular"${e.shape!=='box'?' selected':''}>Circular</option><option value="box"${e.shape==='box'?' selected':''}>Box</option></select></label>
   <label>${e.shape==='box'?'Span':'Diameter'} (${L}) <input data-k="${e.shape==='box'?'span':'rise'}" type="number" step="any" value="${e.shape==='box'?e.span:e.rise}"></label>
   ${e.shape==='box'?`<label>Rise (${L}) <input data-k="rise" type="number" step="any" value="${e.rise}"></label>`:''}
   <label>Length (${L}) <input data-k="length" type="number" step="any" value="${e.length}"></label>
   <label>Invert in <input data-k="invIn" type="number" step="any" value="${e.invIn}"></label>
   <label>Invert out <input data-k="invOut" type="number" step="any" value="${e.invOut}"></label>
   <label>n <input data-k="n" type="number" step="0.001" value="${e.n}"></label>
   <label>Inlet <select data-k="inlet">${opts}</select></label>
   <button type="button" data-del="${i}">Remove</button></div>`;}).join('');
 c.innerHTML=`<legend>Additional barrels at this crossing</legend><p class="muted">Barrel 1 is the form above. Each extra barrel can differ in size, shape and invert. They share one upstream water surface and the tailwater elevation; discharge is split so those elevations match. A count of identical barrels on barrel 1 still divides flow equally and does not use this list.</p>${rows}<button type="button" id="addbarrel">Add a different barrel</button>`;}
document.addEventListener('click',e=>{
 if(e.target.id==='addbarrel'){state.extras=state.extras||[];state.extras.push(blank());persist();draw();if(window.run)run();}
 else if(e.target.dataset&&e.target.dataset.del!=null){state.extras.splice(+e.target.dataset.del,1);persist();draw();if(window.run)run();}});
document.addEventListener('change',e=>{const row=e.target.closest&&e.target.closest('#barrelcard [data-i]');if(!row)return;
 const i=+row.dataset.i,k=e.target.dataset.k,ex=state.extras[i];if(!ex||!k)return;
 ex[k]=k==='shape'||k==='inlet'?e.target.value:+e.target.value;
 if(k==='shape'){ex.inlet=(Culvert.INLETS[ex.shape==='box'?'box':'circular'][0]||{}).id||ex.inlet;if(ex.shape==='circular')ex.span=ex.rise;draw();}
 persist();if(window.run)run();});
window.Barrels={draw};draw();
})();
