global.window={};require(__dirname+'/hy8shapes.js');const DB=window.HY8DB;const C=require(__dirname+'/calc.js').Culvert;
const runs=require(__dirname+'/hy8-shape-runs.js');
function analyzeRun(R,Q){const m=DB[R.key].mats.find(x=>x.name===R.mat);let S,sp,ri,n;
 if(R.key==='sdbox'){S=C.rectSection(R.span,R.rise,m.n);sp=R.span;ri=R.rise;n=m.n;}
 else{const z=m.sizes.find(R.size);if(!z)throw new Error('size '+R.key);n=z.n??m.n;S=C.sectionFromHY8(z.g,{nWall:n,nBed:R.nb??m.nb,open:DB[R.key].open,rise:z.r});sp=z.s;ri=z.r;}
 let i=m.inlets.find(x=>x.name.startsWith(R.inlet));if(i.t==='ratio')i=Object.assign({name:i.name,xA:true},i.byRatio[sp/ri<=3?'2':'4']);
 return C.analyze({units:'US',section:S,spanNom:sp,riseNom:ri,barrels:1,length:200,invIn:100,invOut:98,n,inlet:i,Q,twMode:'const',twElev:99});}
module.exports={runs,analyzeRun};
if(require.main===module){let md='';
 for(const R of runs){md+=`\n### ${R.label}\n\n| Q (cfs) | HW El HY-8 | HW El ours | Δ ft | IC depth HY-8/ours | OC depth HY-8/ours | yc HY-8/ours | yout HY-8/ours | Vout HY-8/ours |\n|---|---|---|---|---|---|---|---|---|\n`;
  let mx=0,mxi=0;for(const h of R.rows){const r=analyzeRun(R,h[0]);const d=r.EL-h[1];if(!R.icOnly)mx=Math.max(mx,Math.abs(d));mxi=Math.max(mxi,Math.abs(r.HWi-h[2])/h[2]);
   md+=`| ${h[0]} | ${h[1].toFixed(2)} | ${r.EL.toFixed(2)} | ${R.icOnly?'—':d.toFixed(2)} | ${h[2].toFixed(2)} / ${r.HWi.toFixed(2)} | ${h[3]==null?'—':h[3].toFixed(2)} / ${r.HWo.toFixed(2)} | ${h[5].toFixed(2)} / ${r.dc.toFixed(2)} | ${h[6].toFixed(2)} / ${r.yout.toFixed(2)} | ${h[7].toFixed(2)} / ${r.Vout.toFixed(2)} |\n`;}
  md+=`\nMax |ΔHW El| = ${R.icOnly?'n/a':mx.toFixed(2)+' ft'}; max inlet-control depth error = ${(mxi*100).toFixed(1)}%\n`;console.log(R.key,'maxHW',mx.toFixed(3),'maxIC%',(mxi*100).toFixed(1));}
 require('fs').writeFileSync(__dirname+'/HY8-SHAPES-VALIDATION.md','# HY-8 8.0 barrel-shape validation\n\nAll runs: L = 200 ft, S = 0.01 (inverts 100 → 98), tailwater El. 99.0, one barrel, no overtopping. HY-8 8.00.2 under Wine; values read from the Culvert Summary Table.\n'+md);}
