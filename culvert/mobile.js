/* iPhone / narrow-screen shell. Pure presentation: never touches calculations. */
(function(){
const MQ=matchMedia('(max-width:700px)'),cfg=window.MOBILE_CFG||{},$=s=>document.querySelector(s);
const out=$('#out'),form=$('#form');if(!out||!form)return;
// tag panes
form.dataset.pane='inputs';
[...out.children].forEach(el=>{el.dataset.pane=(el.querySelector('#explain')||el.id==='refs'||el.querySelector('#refs'))?'explain':'results';});
// key-result bar + tab bar
const bar=document.createElement('div');bar.id='mbar';bar.setAttribute('role','status');document.querySelector('header').after(bar);
bar.onclick=()=>setTab('results');
const tabs=document.createElement('nav');tabs.id='mtabs';
tabs.innerHTML=[['inputs','Inputs','M4 6h16M4 12h10M4 18h13'],['results','Results','M4 20V10M10 20V4M16 20v-7M22 20H2'],['explain','Explain','M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5']]
 .map(([k,l,d])=>`<button type="button" data-t="${k}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="${d}"/></svg>${l}</button>`).join('');
document.body.appendChild(tabs);
tabs.onclick=e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.t);};
function setTab(t){document.body.dataset.tab=t;tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));window.scrollTo(0,0);if(t!=='inputs')requestAnimationFrame(fitAll);}
setTab('inputs');
function upBar(){const k=document.querySelector('#summary .kpi');if(!k){bar.textContent='';return;}
 const b=k.querySelector('b'),lbl=(cfg.barLabel||k.firstChild.textContent||'').trim(),sub=[...k.childNodes].slice(2).map(n=>n.textContent).join(' ').trim();
 bar.innerHTML=`<span class="l">${lbl}</span><b>${b?b.textContent:''}</b><span class="s">${sub}</span>`;}
// accordion: one fieldset open at a time
let openKey=null;
function accordion(){const fs=[...form.querySelectorAll('fieldset')];if(!fs.length)return;
 if(openKey===null||!fs.some(f=>key(f)===openKey))openKey=key(fs[0]);
 fs.forEach(f=>{const lg=f.querySelector('legend');if(lg&&!lg.dataset.acc){lg.dataset.acc=1;lg.setAttribute('role','button');lg.tabIndex=0;
   lg.onclick=()=>{if(!MQ.matches)return;openKey=key(f)===openKey&&!f.classList.contains('shut')?'__none':key(f);paint();if(openKey===key(f))f.scrollIntoView({block:'start',behavior:'smooth'});};}});
 paint();}
function key(f){return (f.querySelector('legend')||{}).textContent||'';}
function paint(){form.querySelectorAll('fieldset').forEach(f=>f.classList.toggle('shut',MQ.matches&&key(f)!==openKey));}
// SVG label fitting for narrow widths: enlarge labels to >=12px on screen, keep inside viewBox, de-overlap
function fit(svg){if(svg.dataset.nofit)return;const vb=svg.viewBox.baseVal;if(!vb||!vb.width)return;const w=svg.getBoundingClientRect().width;if(!w)return;
 const s=w/vb.width,texts=[...svg.querySelectorAll('text')];
 texts.forEach(t=>{if(!t.dataset.fs){t.dataset.fs=parseFloat(t.getAttribute('font-size')||getComputedStyle(t).fontSize)||12;}
   t.removeAttribute('transform');const o=+t.dataset.fs;t.setAttribute('font-size',MQ.matches?Math.max(o,Math.min(12.5/s,o*2.2)).toFixed(1):o);});
 if(!MQ.matches)return;const placed=[];
 texts.forEach(t=>{let bb;try{bb=t.getBBox();}catch(e){return;}if(!bb.width)return;let dx=0,dy=0;
   if(bb.x<vb.x+2)dx=vb.x+2-bb.x;if(bb.x+bb.width>vb.x+vb.width-2)dx=vb.x+vb.width-2-bb.x-bb.width;
   if(bb.y<vb.y)dy=vb.y-bb.y;if(bb.y+bb.height>vb.y+vb.height)dy=vb.y+vb.height-bb.y-bb.height;
   let r={x:bb.x+dx,y:bb.y+dy,w:bb.width,h:bb.height};
   const d0=dy;for(let i=0;i<6;i++){const hit=placed.find(p=>r.x<p.x+p.w&&r.x+r.w>p.x&&r.y<p.y+p.h&&r.y+r.h>p.y);if(!hit)break;
     const down=hit.y+hit.h-r.y+1;dy+=(r.y+down+r.h<=vb.y+vb.height)?down:-(r.y+r.h-hit.y+1);r.y=bb.y+dy;}if(Math.abs(dy-d0)>r.h*2.5){dy=d0;r.y=bb.y+dy;}
   if(dx||dy)t.setAttribute('transform',`translate(${dx.toFixed(1)},${dy.toFixed(1)})`);placed.push(r);});}
let busy=false;function fitAll(){if(busy)return;busy=true;out.querySelectorAll('svg[viewBox]').forEach(fit);busy=false;}
// observers
new MutationObserver(()=>{upBar();}).observe($('#summary'),{childList:true,subtree:true,characterData:true});
new MutationObserver(m=>{if(m.some(r=>[...r.addedNodes].some(n=>n.nodeName==='FIELDSET'||n.querySelector&&n.querySelector('fieldset'))))accordion();}).observe(form,{childList:true,subtree:true});
out.querySelectorAll('svg[viewBox]').forEach(svg=>new MutationObserver(()=>{if(!busy)requestAnimationFrame(()=>fit(svg));}).observe(svg,{childList:true}));
const re=()=>{paint();fitAll();};MQ.addEventListener('change',re);addEventListener('resize',()=>requestAnimationFrame(fitAll));
const hd=document.querySelector('header'),setH=()=>document.documentElement.style.setProperty('--hh',hd.offsetHeight+'px');setH();addEventListener('resize',setH);
upBar();accordion();requestAnimationFrame(fitAll);
})();
