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
 await new Promise(r=>setTimeout(r,600));
 await set('twElev','104');
 await new Promise(r=>setTimeout(r,400));
 await p.evaluate(()=>document.getElementById('profile').closest('.card').scrollIntoView({block:'start'}));
 await new Promise(r=>setTimeout(r,700));
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
  errs:[]
 }));
 console.log('desktop', JSON.stringify(desk), 'pageerrors', errs);
 await p.emulate(pp.KnownDevices['iPhone 13']);
 await p.goto('http://localhost:8766/culvert/?v='+Date.now(),{waitUntil:'networkidle0'});
 await set('twElev','104');
 await new Promise(r=>setTimeout(r,800));
 await p.evaluate(()=>{const t=[...document.querySelectorAll('#mtabs button')].find(e=>/Results/.test(e.innerText)); if(t)t.click();});
 await new Promise(r=>setTimeout(r,500));
 await p.evaluate(()=>{const e=document.getElementById('mprofile')||document.getElementById('profile'); e.scrollIntoView({block:'center'});});
 await new Promise(r=>setTimeout(r,600));
 await p.screenshot({path:path.join(out,'culvert-profile-mobile.png')});
 const phone=await p.evaluate(()=>({w:document.documentElement.scrollWidth, parts:!!document.querySelector('#mprofile'), flow:!!(document.getElementById('mprofile')&&document.getElementById('mprofile')._flow)}));
 console.log('phone', phone, 'pageerrors', errs);
 if(errs.length) {console.error(errs); process.exitCode=1;}
 await b.close();
})().catch(e=>{console.error(e); process.exit(1);});
