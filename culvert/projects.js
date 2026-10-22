/* Phase 5: named projects in localStorage (save / load / delete) and JSON export (iOS share sheet) / import. */
(function(){const KEY='culvert.projects';
const all=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}},put=o=>localStorage.setItem(KEY,JSON.stringify(o));
const ids=()=>F.map(r=>r[0]).filter(id=>document.getElementById(id));
function snap(name){const v={};ids().forEach(id=>v[id]=document.getElementById(id).value);let opts=[];try{opts=JSON.parse(localStorage.getItem('culvert.options')||'[]')}catch(e){}
 return{app:'Culvert Studio',version:1,name,saved:new Date().toISOString(),units:state.units,values:v,options:opts};}
function apply(pr){const u=document.getElementById('units');if(u&&pr.units&&u.value!==pr.units){u.value=pr.units;u.dispatchEvent(new Event('change',{bubbles:true}));}
 const v=pr.values||{};const order=['shape','material','size','inlet','twMode','roadOn'];
 for(const pass of [order,Object.keys(v)])for(const id of pass){const e=document.getElementById(id);if(e&&id in v){e.value=v[id];e.dispatchEvent(new Event('input',{bubbles:true}));}}
 const last=document.getElementById('Q');
 Object.keys(v).forEach(id=>{const e=document.getElementById(id);if(e)e.value=v[id];});
 if(Array.isArray(pr.options))localStorage.setItem('culvert.options',JSON.stringify(pr.options));if(window.CMP)CMP.draw();
 const n=document.getElementById('pjname');if(n)n.value=pr.name||'';run();let again=false;Object.keys(v).forEach(id=>{const e=document.getElementById(id);if(e&&e.value!==v[id]){e.value=v[id];again=true;}});if(again)run();if(last)last.dispatchEvent(new Event('input',{bubbles:true}));}
function list(){const s=document.getElementById('pjlist');if(!s)return;const a=all(),k=Object.keys(a).sort((x,y)=>(a[y].saved||'').localeCompare(a[x].saved||''));
 s.innerHTML=k.length?k.map(n=>`<option value="${n.replace(/"/g,'&quot;')}">${n.replace(/</g,'&lt;')} — ${new Date(a[n].saved).toLocaleString()}</option>`).join(''):'<option value="">(no saved projects)</option>';}
function msg(t){const m=document.getElementById('pjmsg');if(m)m.textContent=t;}
async function exportJSON(){const n=(document.getElementById('pjname').value||'culvert-project').trim(),pr=snap(n),txt=JSON.stringify(pr,null,1),fn=n.replace(/[^\w\-]+/g,'_')+'.json';
 try{const file=new File([txt],fn,{type:'application/json'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:n});msg('Shared '+fn);return;}}catch(e){if(e&&e.name==='AbortError')return;}
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));a.download=fn;document.body.appendChild(a);a.click();a.remove();msg('Downloaded '+fn);}
function mount(){const form=document.getElementById('form');if(!form||document.getElementById('pjcard'))return;
 const c=document.createElement('div');c.className='card';c.id='pjcard';
 c.innerHTML=`<h3>Project</h3><p class="muted" style="margin:2px 0 6px">Save all inputs (and compared options) under a name on this device, or export a JSON file to share or back up.</p>
 <div style="display:flex;gap:6px;flex-wrap:wrap"><input id="pjname" placeholder="Project name, e.g. FM 123 at Cedar Ck" style="flex:1 1 180px;min-width:0"><button id="pjsave">Save</button></div>
 <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><select id="pjlist" style="flex:1 1 180px;min-width:0"></select><button id="pjload">Load</button><button id="pjdel">Delete</button></div>
 <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button id="pjexp">Export / share JSON</button><label class="btn" style="display:inline-flex;align-items:center;gap:4px"><button type="button" id="pjimpb">Import JSON</button><input id="pjimp" type="file" accept="application/json,.json" style="display:none"></label></div><p id="pjmsg" class="muted" style="margin:4px 0 0"></p>`;
 form.prepend(c);list();}
document.addEventListener('click',e=>{const id=e.target.id;if(!/^pj/.test(id))return;const a=all(),sel=document.getElementById('pjlist').value;
 if(id==='pjsave'){const n=document.getElementById('pjname').value.trim();if(!n){msg('Enter a project name first.');return;}a[n]=snap(n);put(a);list();document.getElementById('pjlist').value=n;msg('Saved "'+n+'".');}
 else if(id==='pjload'){if(a[sel]){apply(a[sel]);msg('Loaded "'+sel+'".');}}
 else if(id==='pjdel'){if(a[sel]&&confirm('Delete project "'+sel+'" from this device?')){delete a[sel];put(a);list();msg('Deleted "'+sel+'".');}}
 else if(id==='pjexp')exportJSON();else if(id==='pjimpb')document.getElementById('pjimp').click();});
document.addEventListener('change',e=>{if(e.target.id!=='pjimp')return;const fl=e.target.files[0];if(!fl)return;fl.text().then(t=>{const pr=JSON.parse(t);if(pr.app!=='Culvert Studio'||!pr.values)throw new Error('not a Culvert Studio project');
 const a=all();const n=pr.name||fl.name.replace(/\.json$/,'');a[n]=Object.assign(pr,{name:n});put(a);list();apply(pr);msg('Imported "'+n+'".');}).catch(err=>msg('Import failed: '+err.message));e.target.value='';});
const prev=window.drawProfile;window.drawProfile=function(...x){const o=prev?prev.apply(this,x):undefined;try{mount();}catch(e){}return o;};
window.Projects={snap,apply,all,exportJSON};mount();})();
