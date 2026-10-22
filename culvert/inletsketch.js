/* Inlet configuration sketch: plan + side section of the selected inlet, updates with inlet & barrel shape. */
(function(){const prev=window.drawProfile;
function classify(inl,shape){const n=((inl&&inl.name)||'')+' '+((inl&&inl.id)||''),L=n.toLowerCase();
 const f={wall:'headwall',flare:null,edge:'square',proj:false,miter:false,taper:false};
 if(/mitered|m_mit/.test(L)){f.wall='none';f.miter=true;f.edge='thin';}
 if(/projecting|m_pr|c_gr_pr/.test(L)){f.wall='none';f.proj=true;f.edge=/groove/.test(L)?'groove':'thin';}
 if(/thin edge/.test(L)){f.edge='thin';}
 if(/groove|c_gr/.test(L))f.edge='groove';
 if(/bevel/.test(L))f.edge='bevel';
 if(/taper/.test(L))f.taper=true;
 let m=L.match(/(\d+)\s*°?\s*(?:-|to|–)\s*(\d+)\s*°/);if(m)f.flare=(+m[1]+ +m[2])/2;
 else if((m=L.match(/(\d+(?:\.\d+)?)\s*°\s*(?:flared\s*)?wing/))||(m=L.match(/(\d+(?:\.\d+)?)\s*°?\s*wingwall/)))f.flare=+m[1];
 if(/b_30/.test(L))f.flare=45; if(/b_90/.test(L))f.flare=15; if(/b_0/.test(L))f.flare=0;
 if(/90°\)?\s*headwall|\(90°\)/.test(L)&&f.flare==null)f.flare=90;
 if(/sides extended/.test(L))f.flare=0;
 if(/headwall/.test(L)&&!f.proj)f.wall='headwall';
 if(f.flare!=null&&f.flare<90)f.wall='wing';
 return f;}
function describe(f,inl){const edge={square:'square (sharp) edge',groove:'groove / socket end (bell) that smooths the entry',bevel:'beveled (chamfered) edge that eases flow in',thin:'thin wall edge'}[f.edge];
 if(f.miter)return `Barrel end cut to match the embankment slope (mitered), ${edge}. Cheap and tidy, but the thin cut edge contracts the flow.`;
 if(f.proj)return `Barrel simply sticks out of the fill with no headwall — ${edge}. Simplest end; the most entrance loss.`;
 if(f.wall==='wing')return `Headwall with wingwalls flared ${f.flare===0?'0° (straight, parallel to the barrel)':f.flare+'° from the barrel line'}, ${edge}. Flared wingwalls guide water in and hold the fill.`;
 return `Vertical headwall across the barrel end${f.flare===90?' (wingwalls parallel to the road, 90°)':''}, ${edge}. Holds the fill and protects the barrel end.`;}
function coef(inl){if(!inl)return '';const Ke=inl.Ke??inl.KE;
 if(inl.t==='poly')return `Ke = ${Ke} · HY-8 5th-degree polynomial, slope term SR = ${inl.SR}${inl.ratioUsed?' · '+inl.ratioUsed+' span:rise curve':''}`;
 if(inl.t==='interp')return `Ke = ${Ke} · HY-8 / HDS-5 Chart 52B table (HW/D at X = 0.5…9), SR = ${inl.SR}`;
 return `Ke = ${Ke} · HDS-5 ${inl.chart||''}: K = ${inl.K}, M = ${inl.M}, c = ${inl.c}, Y = ${inl.Y}`;}
function svg(p){const f=classify(p.inlet,p.shape),W=360,H=210;let s='';
 const sec=p.section,cw=sec?Math.min(70,70*sec.B/Math.max(sec.B,sec.D)):p.shape==='box'?70*Math.min(1,p.span/p.rise):60;
 // ---- PLAN (left, flow left->right toward the barrel) ----
 const bx=110,by=78,bh=Math.max(26,Math.min(56,cw*0.8)),bl=70; s+=`<text x="90" y="16" text-anchor="middle" font-size="12" font-weight="700">Plan</text>`;
 s+=`<rect x="${bx}" y="${by}" width="${bl}" height="${bh}" fill="#eef2f6" stroke="#444" stroke-width="2"/>`;
 s+=`<path d="M30 ${by+bh/2}h55" stroke="#2b6cb0" stroke-width="2" marker-end="url(#ia)"/><text x="30" y="${by+bh/2-6}" font-size="10" fill="#2b6cb0">flow</text>`;
 if(f.wall!=='none'){s+=`<rect x="${bx-8}" y="${by-22}" width="8" height="${bh+44}" fill="#bbb" stroke="#444"/>`;
  if(f.wall==='wing'||f.flare===90){const a=(f.flare??90)*Math.PI/180,L=36,dx=-Math.cos(a)*L,dy=Math.sin(a)*L;
   s+=`<path d="M${bx-8} ${by-22}l${dx.toFixed(1)} ${(-dy).toFixed(1)}M${bx-8} ${by+bh+22}l${dx.toFixed(1)} ${dy.toFixed(1)}" stroke="#666" stroke-width="7" stroke-linecap="round"/>`;
   s+=`<text x="${bx+bl/2}" y="${by+bh+40}" font-size="10" text-anchor="middle">wingwalls ${f.flare??90}° flare</text>`;}}
 else if(f.miter){s+=`<path d="M${bx-22} ${by}L${bx} ${by}L${bx} ${by+bh}L${bx-22} ${by+bh}Z" fill="#eef2f6" stroke="#444" stroke-width="2" stroke-dasharray="4 2"/><text x="${bx-11}" y="${by+bh+16}" font-size="10" text-anchor="middle">mitered</text>`;}
 else s+=`<rect x="${bx-20}" y="${by}" width="20" height="${bh}" fill="#eef2f6" stroke="#444" stroke-width="2"/><text x="${bx-10}" y="${by+bh+16}" font-size="10" text-anchor="middle">projects</text>`;
 // ---- SIDE SECTION (right): embankment, barrel, end treatment ----
 const ox=200,gy=185,rh=62,X1=352,top=gy-rh-38;s+=`<text x="280" y="16" text-anchor="middle" font-size="12" font-weight="700">Side section</text>`;
 const slope=(y)=>ox+20+(gy-y)*1.4; // embankment face x at height y (fill toe at ox+20)
 let xe,endLine,fillP;
 if(f.wall!=='none'){xe=ox+46;fillP=`M${xe} ${top}H${X1}V${gy-rh}H${xe}Z`;endLine=`<rect x="${xe-7}" y="${top}" width="7" height="${gy-top}" fill="#bbb" stroke="#444"/>`;}
 else if(f.miter){fillP=`M${slope(gy-rh)} ${gy-rh}L${slope(top)} ${top}H${X1}V${gy-rh}Z`;endLine=`<path d="M${slope(gy)} ${gy}L${slope(gy-rh)} ${gy-rh}" stroke="#444" stroke-width="3"/>`;xe=slope(gy);}
 else{xe=ox+6;fillP=`M${slope(gy-rh)} ${gy-rh}L${slope(top)} ${top}H${X1}V${gy-rh}Z`;endLine=`<path d="M${xe} ${gy}V${gy-rh}" stroke="#444" stroke-width="${f.edge==='thin'?1.5:4}"/>`;}
 s+=`<path d="M${ox} ${gy}H${X1}" stroke="#8d6e3f" stroke-width="3"/>`;
 s+=`<path d="${fillP}" fill="#d9c9a3" stroke="#b49a6a"/>`;
 const xtop=f.miter?slope(gy-rh):xe;
 s+=`<rect x="${Math.min(xe,xtop)}" y="${gy-rh}" width="0" height="0"/><path d="M${xe} ${gy}H${X1}M${xtop} ${gy-rh}H${X1}" stroke="#444" stroke-width="3"/>`+endLine;
 // edge detail at the crown entrance corner
 const cx=xtop,cy=gy-rh;
 if(f.edge==='bevel')s+=`<path d="M${cx} ${cy-9}L${cx+9} ${cy}" stroke="#c0392b" stroke-width="3"/><text x="${cx+12}" y="${cy+16}" font-size="10" fill="#c0392b">beveled edge</text>`;
 else if(f.edge==='groove')s+=`<path d="M${cx} ${cy-8}q0 8 10 8" fill="none" stroke="#c0392b" stroke-width="3"/><rect x="${cx}" y="${cy-5}" width="16" height="${rh+10}" fill="none" stroke="#444" stroke-width="2"/><text x="${cx+20}" y="${cy+16}" font-size="10" fill="#c0392b">groove (bell) end</text>`;
 else if(f.edge==='thin')s+=`<text x="${cx+8}" y="${cy+16}" font-size="10" fill="#c0392b">thin edge</text>`;
 else s+=`<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="#c0392b" stroke-width="1.5"/><text x="${cx+8}" y="${cy+16}" font-size="10" fill="#c0392b">square edge</text>`;
 s+=`<path d="M${ox} ${gy-rh*1.15}H${Math.max(ox+8,xe-12)}" stroke="#2b6cb0" stroke-width="2"/><text x="${ox}" y="${gy-rh*1.15-5}" font-size="10" fill="#2b6cb0">HW</text><path d="M${X1-60} ${gy-12}h40" stroke="#2b6cb0" stroke-width="2" marker-end="url(#ia)"/>`;
 if(f.taper)s+=`<text x="280" y="${gy+18}" font-size="10" text-anchor="middle">tapered inlet (sketch simplified)</text>`;
 return `<svg viewBox="0 0 ${W} ${H}" data-nofit="1" role="img" aria-label="Inlet sketch" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ia" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#2b6cb0"/></marker></defs><rect width="${W}" height="${H}" fill="#fff"/>${s}</svg>`;}
function html(p){const f=classify(p.inlet,p.shape);
 return `<div class="isk">${svg(p)}</div><p class="idesc"><b>${(p.inlet&&p.inlet.name)||''}</b> — ${describe(f,p.inlet)}</p><p class="icoef">${coef(p.inlet)}</p>`;}
function render(p){const el=document.getElementById('inletsk');if(el)el.innerHTML=html(p);
 const R=document.getElementById('report');if(R&&R.innerHTML&&!R.querySelector('.rinlet')){const t=R.querySelector('table');
  const blk=`<h4>Inlet configuration</h4><div class="rinlet">${svg(p)}</div><p>${(p.inlet&&p.inlet.name)||''}: ${describe(f0(p),p.inlet)} ${coef(p.inlet)}.</p>`;
  if(t)t.insertAdjacentHTML('afterend',blk);else R.insertAdjacentHTML('beforeend',blk);
  if(window.ReportPDF)ReportPDF.prep();}}
const f0=p=>classify(p.inlet,p.shape);
window.drawProfile=function(p,r,...a){const o=prev?prev.call(this,p,r,...a):undefined;try{render(p);}catch(e){console.warn('inlet sketch',e);}return o;};
window.InletSketch={classify,describe,coef,svg,html};
if(typeof window.run==="function")try{window.run();}catch(e){}
})();
