/* Phase 7: auto-size, TxDOT checks, an input warning, and the profile with particles.
   Same idea as the other e2e-phase scripts. Uses puppeteer, or puppeteer-core with CHROME_PATH. */
const pp=(()=>{try{return require('puppeteer');}catch(e){return require('puppeteer-core');}})();
const path=require('path');
const out=process.env.SHOT_DIR||'/opt/cursor/artifacts';
(async()=>{
 const exe=process.env.CHROME_PATH||(typeof pp.executablePath==='function'?undefined:'/usr/bin/google-chrome');
 const b=await pp.launch({args:['--no-sandbox','--disable-dev-shm-usage'], executablePath:exe, defaultViewport:{width:1280,height:900}});
 const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 const set=async(id,v)=>p.evaluate((id,v)=>{const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));},id,v);
 await p.goto('http://localhost:8766/culvert/?v='+Date.now(),{waitUntil:'networkidle0'});
 const legendState=()=>p.evaluate(()=>{
  const legs=[...document.querySelectorAll('.flowlegend')].filter(e=>e.offsetParent&&!e.hidden);
  const leg=legs[0]; if(!leg) return null;
  const title=(leg.querySelector('.flowleg-title')||{}).textContent||'';
  const ticks=[...leg.querySelectorAll('.flowticks span')].map(s=>s.textContent);
  const nums=ticks.map(parseFloat);
  const bar=leg.querySelector('canvas.flowscale');
  const g=bar&&bar.getContext('2d');
  const pix=g?g.getImageData(Math.round(bar.width*0.55),0,1,1).data:null;
  const left=g?g.getImageData(0,0,1,1).data:null;
  const right=g?g.getImageData(bar.width-1,0,1,1).data:null;
  const box=leg.getBoundingClientRect();
  const svg=leg.parentElement.querySelector('svg').getBoundingClientRect();
  const host=leg.parentElement.getBoundingClientRect();
  return {title, ticks, n:ticks.length,
   grad:!!(left&&right&&pix&&left[2]>150&&left[0]<40&&right[0]>200&&Math.abs(pix[0]-64)<12&&Math.abs(pix[1]-244)<12),
   rising:nums.length>=4&&nums[0]===0&&nums.every((v,i)=>i===0||v+1e-6>=nums[i-1])&&nums[nums.length-1]>1,
   clear:box.top>=svg.bottom-2&&box.bottom<=host.bottom+1&&box.left>=svg.left-1&&box.right<=svg.right+1,
   w:document.documentElement.clientWidth, max:nums[nums.length-1]};
 });
 await p.waitForFunction(()=>{
  const legs=[...document.querySelectorAll('.flowlegend')].filter(e=>e.offsetParent&&!e.hidden);
  const leg=legs[0]; if(!leg) return false;
  const ticks=[...leg.querySelectorAll('.flowticks span')].map(s=>parseFloat(s.textContent));
  return /Velocity \(ft\/s\)/.test(leg.textContent)&&ticks.length>=5&&ticks[ticks.length-1]>5;
 },{timeout:20000});
 const legendDesk=await legendState();
 console.log('legend desktop', JSON.stringify(legendDesk));
 if(!legendDesk||legendDesk.title!=='Velocity (ft/s)'||!legendDesk.grad||!legendDesk.rising||!legendDesk.clear){console.error('desktop legend failed', legendDesk); process.exitCode=1;}
 const maxFast=legendDesk.max;
 await set('Q','40');
 await p.waitForFunction(prev=>{
  const leg=[...document.querySelectorAll('.flowlegend')].find(e=>e.offsetParent&&!e.hidden);
  if(!leg) return false;
  const ticks=[...leg.querySelectorAll('.flowticks span')].map(s=>parseFloat(s.textContent));
  return ticks.length>=5&&ticks[ticks.length-1]>0.5&&ticks[ticks.length-1]<prev*0.75;
 },{timeout:20000}, maxFast);
 await set('Q','300');
 await p.waitForFunction(()=>{
  const leg=[...document.querySelectorAll('.flowlegend')].find(e=>e.offsetParent&&!e.hidden);
  const ticks=leg?[...leg.querySelectorAll('.flowticks span')].map(s=>parseFloat(s.textContent)):[];
  return ticks.length>=5&&ticks[ticks.length-1]>5;
 },{timeout:20000});
 await p.evaluate(()=>document.getElementById('profile').closest('.card').scrollIntoView({block:'start'}));
 await new Promise(r=>setTimeout(r,400));
 await p.screenshot({path:path.join(out,'culvert-profile-desktop.png')});
 await p.evaluate(()=>document.getElementById('sizebtn').click());
 await p.waitForFunction(()=>document.querySelectorAll('#sizetable tr').length>2,{timeout:20000});
 await p.evaluate(()=>document.getElementById('sizecard').scrollIntoView({block:'start'}));
 await p.screenshot({path:path.join(out,'culvert-autosize-desktop.png')});
 await p.evaluate(()=>document.getElementById('txcard').scrollIntoView({block:'start'}));
 await p.screenshot({path:path.join(out,'culvert-txdot-desktop.png')});
 await set('cover','-1');
 await new Promise(r=>setTimeout(r,300));
 await p.evaluate(()=>document.getElementById('f_cover').scrollIntoView({block:'center'}));
 await p.screenshot({path:path.join(out,'culvert-warning-desktop.png')});
 const desk=await p.evaluate(()=>({
  iso:/drawIso|isocard|Isometric view/.test(document.documentElement.innerHTML+document.querySelector('script')?.src),
  parts:document.getElementById('pParts')&&document.getElementById('pParts').textContent,
  rows:document.querySelectorAll('#sizetable tr').length,
  tx:/Allowable headwater/.test(document.getElementById('txbody').innerText),
  warn:document.getElementById('w_cover').textContent,
  pdf:/TxDOT screening/.test(JSON.stringify((window.ReportPDF.build().internal||{}).pages||[])),
  profile:(document.getElementById('profile').textContent||'').replace(/\s+/g,' ').slice(0,280),
  jump:/Jump @/.test(document.getElementById('profile').textContent||''),
  errs:[]
 }));
 console.log('desktop', JSON.stringify(desk), 'pageerrors', errs);
 await p.emulate(pp.KnownDevices['iPhone 13']);
 await p.goto('http://localhost:8766/culvert/?v='+Date.now(),{waitUntil:'networkidle0'});
 await p.evaluate(()=>{const t=[...document.querySelectorAll('#mtabs button')].find(e=>/Results/.test(e.innerText)); if(t)t.click();});
 await p.evaluate(()=>{const e=document.getElementById('mprofile')||document.getElementById('profile'); e.scrollIntoView({block:'center'});});
 await p.waitForFunction(()=>{
  const leg=[...document.querySelectorAll('.flowlegend')].find(e=>e.offsetParent&&!e.hidden);
  if(!leg) return false;
  const ticks=[...leg.querySelectorAll('.flowticks span')].map(s=>parseFloat(s.textContent));
  const box=leg.getBoundingClientRect();
  const svg=leg.parentElement.querySelector('svg').getBoundingClientRect();
  return document.documentElement.clientWidth<=400&&/Velocity \(ft\/s\)/.test(leg.textContent)&&ticks.length>=5&&ticks[0]===0&&ticks[ticks.length-1]>5&&box.width>=80&&box.top>=svg.bottom-2&&box.right<=svg.right+1;
 },{timeout:20000});
 const legendPhone=await legendState();
 console.log('legend phone', JSON.stringify(legendPhone));
 if(!legendPhone||legendPhone.w>400||!legendPhone.grad||!legendPhone.rising||!legendPhone.clear){console.error('phone legend failed', legendPhone); process.exitCode=1;}
 await p.evaluate(()=>{const e=document.getElementById('mprofile')||document.getElementById('profile'); e.scrollIntoView({block:'center'});});
 await new Promise(r=>setTimeout(r,400));
 await p.screenshot({path:path.join(out,'culvert-profile-mobile.png')});
 const phone=await p.evaluate(()=>({w:document.documentElement.scrollWidth, parts:!!document.querySelector('#mprofile'), flow:!!(document.getElementById('mprofile')&&document.getElementById('mprofile')._flow)}));
 console.log('phone', phone, 'pageerrors', errs);
 if(errs.length) {console.error(errs); process.exitCode=1;}
 await b.close();
})().catch(e=>{console.error(e); process.exit(1);});
