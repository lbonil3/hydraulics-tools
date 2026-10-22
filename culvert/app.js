const C=window.Culvert;const $=s=>document.querySelector(s);
const U={US:{L:'ft',Q:'cfs',V:'ft/s'},SI:{L:'m',Q:'m³/s',V:'m/s'}};
// Each field: id, step, label, unit type, default US/SI, help text, source, typical range [min,max] (US,SI), diagram highlight
const F=[
 ['invIn','Site','Inlet invert elevation','L',[100,30.48],'Elevation of the culvert bottom (flowline) at the upstream end.','Plans profile sheet or topographic survey of the channel flowline.',null,'invin'],
 ['invOut','Site','Outlet invert elevation','L',[98,29.87],'Elevation of the culvert bottom at the downstream end. Slope = (inlet − outlet) ÷ length.','Plans or survey. Usually follows the natural streambed slope.',null,'invout'],
 ['length','Site','Culvert length','L',[200,61],'Length of the barrel measured along the flowline, end to end.','Plans: roadway width + side slopes. Often 40–300 ft.',[20,500,6,150],'length'],
 ['allowHW','Site','Allowable headwater elevation','L',[108,32.9],'Highest water level you can accept upstream (e.g., road shoulder minus freeboard, or a building floor).','Design criteria in agency drainage manual; roadway plans.',null,'allow'],
 ['shape','Culvert','Barrel shape','sel',['circular'],'Circular pipe or rectangular box.','Product selection / existing structure inspection.',null,'barrel'],
 ['span','Culvert','Span (box width)','L',[6,1.83],'Inside width of a box culvert. Ignored for circular pipes.','Plans or standard box sizes (3–12 ft).',[2,20,0.6,6],'xs'],
 ['rise','Culvert','Rise / diameter (D)','L',[5,1.52],'Inside height of a box, or inside diameter of a pipe. All HW/D ratios use this.','Plans, manufacturer catalog. Pipes 1.5–12 ft typical.',[1,15,0.3,4.5],'xs'],
 ['barrels','Culvert','Number of barrels','int',[1,1],'Identical barrels side by side. Flow is split equally.','Plans. 1–4 typical.',[1,6,1,6],'xs'],
 ['material','Culvert','Material (sets Manning n)','sel',['concrete'],'Roughness of the barrel wall. Concrete 0.012, corrugated metal 0.024, smooth HDPE 0.012.','HDS-5 Table 3.1 / manufacturer data.',null,'barrel'],
 ['n','Culvert','Manning n','num',[0.012,0.012],'Friction coefficient used in outlet-control losses. Edit for a custom value.','HDS-5 Table 3.1. Range 0.009–0.033.',[0.009,0.035,0.009,0.035],'barrel'],
 ['inlet','Inlet','Inlet configuration','sel',[''],'How the upstream end is built. Sets the HDS-5 inlet-control coefficients (K, M, c, Y) and the entrance loss coefficient Ke.','Plans / standard drawings, or field inspection of the inlet.',null,'inlet'],
 ['Q','Flows','Design discharge','Q',[300,8.5],'Peak flow the culvert must pass (e.g., 25-yr or 50-yr storm).','Hydrology report (Rational method, USGS regression, TR-55, HEC-HMS).',[1,5000,0.03,140],'hw'],
 ['Qmin','Flows','Rating curve minimum flow','Q',[30,0.85],'Lowest flow plotted on the performance curve.','Your choice; often 10% of design.',null,'hw'],
 ['Qmax','Flows','Rating curve maximum flow','Q',[450,12.7],'Highest flow plotted (often 1.5× design, to check the 100-yr / check flood).','Hydrology report or your choice.',null,'hw'],
 ['twMode','Tailwater','Tailwater condition','sel',['const'],'Water level downstream that can back up into the culvert. "None" = free outfall.','Hydraulic model of the downstream channel, normal-depth calc, or a known pond/river level.',null,'tw'],
 ['twElev','Tailwater','Tailwater elevation','L',[101.5,30.94],'Water surface elevation just downstream of the outlet at the design flow.','Downstream channel normal-depth calc (Manning) or a HEC-RAS model.',null,'tw']
];
const state={units:'US'};
function opts(id){
 if(id==='shape')return[['circular','Circular pipe'],['box','Box (rectangular)']];
 if(id==='material')return[['concrete','Concrete (n=0.012)'],['cmp','Corrugated metal (n=0.024)'],['hdpe','HDPE smooth (n=0.012)'],['custom','Custom n']];
 if(id==='twMode')return[['const','Constant elevation'],['none','None (free outfall)']];
 if(id==='inlet')return C.INLETS[val('shape')||'box'].map(i=>[i.id,`${i.name} — HDS-5 ${i.chart}`]);
}
function val(id){const e=document.getElementById(id);if(!e)return null;return e.tagName==='SELECT'?e.value:parseFloat(e.value)}
function build(){
 let h='',step='';const steps={Site:'1. Site',Culvert:'2. Culvert barrel',Inlet:'3. Inlet',Flows:'4. Flows',Tailwater:'5. Tailwater'};
 F.forEach(f=>{ if(f[1]!==step){if(step)h+='</fieldset>';step=f[1];h+=`<fieldset><legend>${steps[step]}</legend>`;}
  const u=f[3]==='L'?U[state.units].L:f[3]==='Q'?U[state.units].Q:'';
  const inp=f[3]==='sel'?`<select id="${f[0]}"></select>`:`<input id="${f[0]}" type="number" inputmode="decimal" step="any" value="${f[4][state.units==='US'?0:1]??f[4][0]}">`;
  const rg=f[7]?`<br><b>Typical range:</b> ${state.units==='US'?f[7][0]+'–'+f[7][1]:f[7][2]+'–'+f[7][3]} ${u}`:'';
  h+=`<div class="f" data-hl="${f[8]}" id="f_${f[0]}"><label><span>${f[2]} ${u?'('+u+')':''}</span><span style="display:flex;gap:4px">${inp}<button class="i" type="button" title="What is this?">i</button></span></label>
  <div class="help"><b>What it is:</b> ${f[5]}<br><b>Where to get it:</b> ${f[6]}${rg}</div><div class="warn" id="w_${f[0]}"></div></div>`;});
 $('#form').innerHTML=h+'</fieldset><p style="font-size:12px;color:#556">Roadway overtopping is not modeled in this version.</p>';
 ['shape','material','twMode'].forEach(id=>fill(id));fill('inlet');
 $('#shape').value='box';fill('inlet');$('#inlet').value='b_90';
 document.querySelectorAll('.i').forEach(b=>b.onclick=()=>b.closest('.f').classList.toggle('open'));
 document.querySelectorAll('.f').forEach(d=>{const on=()=>hl(d.dataset.hl),off=()=>hl(null);d.onmouseenter=on;d.onmouseleave=off;d.addEventListener('focusin',on);d.addEventListener('focusout',off);});
 $('#form').oninput=e=>{if(e.target.id==='shape'){fill('inlet');}if(e.target.id==='material'&&e.target.value!=='custom')$('#n').value=C.MANNING[e.target.value];if(e.target.id==='n')$('#material').value='custom';run();};
}
function fill(id){const e=document.getElementById(id),v=e.value;e.innerHTML=opts(id).map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('');if([...e.options].some(o=>o.value===v))e.value=v;}
let hlTarget=null;function hl(t){hlTarget=t;document.querySelectorAll('[data-part]').forEach(e=>e.classList.toggle('hl',e.dataset.part===t));}
function params(Q){return{units:state.units,shape:val('shape'),span:val('span'),rise:val('rise'),barrels:Math.max(1,Math.round(val('barrels')||1)),length:val('length'),invIn:val('invIn'),invOut:val('invOut'),n:val('n'),inlet:C.INLETS[val('shape')].find(i=>i.id===val('inlet')),Q:Q??val('Q'),twMode:val('twMode'),twElev:val('twElev')};}
function validate(p){const w={},us=state.units==='US';
 F.forEach(f=>{const v=val(f[0]);if(f[7]&&isFinite(v)){const lo=us?f[7][0]:f[7][2],hi=us?f[7][1]:f[7][3];if(v<lo||v>hi)w[f[0]]=`⚠ ${v} is outside the usual ${lo}–${hi}. Double-check the value and units.`;}
  if(f[3]!=='sel'&&!isFinite(v))w[f[0]]='⚠ Please enter a number.';});
 if(p.invOut>=p.invIn)w.invOut='⚠ Outlet is not lower than inlet — zero/adverse slope. Results assume full-flow outlet control; check carefully.';
 else if(p.S>0.1)w.invOut='⚠ Slope over 10% is unusually steep.';
 if(val('Qmin')>=val('Qmax'))w.Qmax='⚠ Maximum must be greater than minimum.';
 if(p.twMode==='const'&&p.twElev<p.invOut)w.twElev='ℹ Tailwater is below the outlet invert — it will have no effect.';
 if(p.twMode==='none')w.twElev='ℹ Ignored (tailwater set to none).';
 if(p.shape!=='box')w.span='ℹ Ignored for circular pipe.';
 F.forEach(f=>$('#w_'+f[0]).textContent=w[f[0]]||'');return Object.keys(w).filter(k=>w[k].startsWith('⚠')).length;}
const fx=(x,d=2)=>isFinite(x)?x.toFixed(d):'—';
function run(){
 const p=params();p.S=(p.invIn-p.invOut)/p.length;const bad=validate(p);
 if(!p.inlet||!(p.rise>0)||!(p.Q>0)||!(p.length>0)){$('#explain').textContent='Enter valid inputs to see results.';return;}
 const r=C.analyze(p),u=U[state.units],L=u.L,allow=val('allowHW');
 const flags=[];
 if(r.HW/r.D>1.2)flags.push(`HW/D = ${fx(r.HW/r.D)} exceeds 1.2 (common agency limit for pipes/boxes). Consider a larger or additional barrel, or a better inlet.`);
 if(isFinite(allow)&&r.EL>allow)flags.push(`Headwater elevation ${fx(r.EL)} ${L} exceeds the allowable ${fx(allow)} ${L}.`);
 const vlim=state.units==='US'?15:4.5;if(r.Vout>vlim)flags.push(`Outlet velocity ${fx(r.Vout)} ${u.V} is high (> ${vlim}) — scour likely; consider energy dissipation / riprap (HEC-14).`);
 else if(r.Vout>(state.units==='US'?10:3))flags.push(`Outlet velocity ${fx(r.Vout)} ${u.V} is moderately high — check outlet protection.`);
 if(r.regime==='transition')flags.push('Inlet flow is in the transition zone between unsubmerged and submerged equations (interpolated).');
 if(p.S<=0)flags.push('Zero or adverse slope — normal depth undefined.');
 if(bad)flags.push(`${bad} input(s) have warnings — see the form.`);
 $('#summary').innerHTML=`<div class="kpi gov">Controlling headwater<b>${fx(r.HW)} ${L}</b>El. ${fx(r.EL)} ${L} · ${r.control} control</div>
  <div class="kpi">HW/D<b>${fx(r.HW/r.D)}</b></div><div class="kpi">Inlet control HW<b>${fx(r.HWi)} ${L}</b></div><div class="kpi">Outlet control HW<b>${fx(r.HWo)} ${L}</b></div>
  <div class="kpi">Outlet velocity<b>${fx(r.Vout)} ${u.V}</b></div><div class="kpi">Slope<b>${fx(r.S*100,2)} %</b></div>`;
 const i=r.inlet,ku=r.US?'1.0':'1.811';
 $('#explain').innerHTML=`<ol>
 <li><b>Geometry.</b> Barrel ${p.shape==='box'?fx(r.B)+' × '+fx(r.D):fx(r.D)+' diameter'} ${L}, full area A = ${fx(r.A)} ${L}², hydraulic radius R = ${fx(r.R,3)} ${L}. Slope S = (${p.invIn} − ${p.invOut}) / ${p.length} = ${fx(r.S,4)}. Flow per barrel Q = ${fx(r.Q)} ${u.Q} (${r.N} barrel${r.N>1?'s':''}).</li>
 <li><b>Critical depth</b> d<sub>c</sub> = ${fx(r.dc)} ${L} (solves Q²/g = A³/T). Specific head at critical H<sub>c</sub> = d<sub>c</sub> + V<sub>c</sub>²/2g = ${fx(r.dc)} + ${fx(r.Vc)}²/(2·${fx(r.g,2)}) = ${fx(r.Hc)} ${L}.</li>
 <li><b>Normal depth</b> y<sub>n</sub> = ${isFinite(r.yn)?fx(r.yn)+' '+L+' (Manning, n = '+p.n+')':'— (barrel would flow full or slope ≤ 0)'}. ${isFinite(r.yn)?(r.yn<r.dc?'y<sub>n</sub> &lt; d<sub>c</sub>: steep (supercritical) barrel.':'y<sub>n</sub> &gt; d<sub>c</sub>: mild (subcritical) barrel.'):''}</li>
 <li><b>Inlet control</b> (HDS-5 ${i.chart}: K=${i.K}, M=${i.M}, c=${i.c}, Y=${i.Y}, K<sub>s</sub>=${i.Ks}). Discharge factor K<sub>u</sub>Q/(A·D<sup>0.5</sup>) = ${ku}·${fx(r.Q)}/(${fx(r.A)}·${fx(Math.sqrt(r.D),3)}) = ${fx(r.X,3)} → <b>${r.regime}</b> (unsubmerged ≤ 3.5, submerged ≥ 4.0).
  ${r.regime==='unsubmerged'?`HW/D = H<sub>c</sub>/D + K·X<sup>M</sup> + K<sub>s</sub>S = ${fx(r.Hc/r.D,3)} + ${i.K}·${fx(r.X,3)}<sup>${i.M}</sup> + (${i.Ks})(${fx(r.S,4)})`:r.regime==='submerged'?`HW/D = c·X² + Y + K<sub>s</sub>S = ${i.c}·${fx(r.X,3)}² + ${i.Y} + (${i.Ks})(${fx(r.S,4)})`:'HW/D interpolated linearly between the unsubmerged value at X=3.5 and submerged value at X=4.0'} = ${fx(r.ratio,3)}. HW<sub>i</sub> = ${fx(r.ratio,3)} × ${fx(r.D)} = <b>${fx(r.HWi)} ${L}</b> (El. ${fx(r.ELhi)}).</li>
 <li><b>Outlet control</b> (full-barrel losses). V = Q/A = ${fx(r.V)} ${u.V}, velocity head = ${fx(r.hv,3)} ${L}. Entrance loss K<sub>e</sub>·V²/2g = ${i.Ke}·${fx(r.hv,3)} = ${fx(r.He,3)}; friction ${r.US?29:19.63}·n²·L/R<sup>1.33</sup>·V²/2g = ${fx(r.Hf,3)}; exit loss 1.0·V²/2g = ${fx(r.Ho,3)}; total H = ${fx(r.H,3)} ${L}.
  Tailwater depth TW = ${fx(r.TW)} ${L}; (d<sub>c</sub>+D)/2 = ${fx((r.dc+r.D)/2)} → h<sub>o</sub> = ${fx(r.ho)} ${L}. Headwater El. = outlet invert + h<sub>o</sub> + H = ${p.invOut} + ${fx(r.ho)} + ${fx(r.H,3)} = ${fx(r.ELho)}, so HW<sub>o</sub> = <b>${fx(r.HWo)} ${L}</b>.</li>
 <li><b>Which governs?</b> The larger headwater controls: <b>${r.control} control</b> (${fx(Math.max(r.HWi,r.HWo))} vs ${fx(Math.min(r.HWi,r.HWo))} ${L}). ${r.control==='Inlet'?'The entrance is the bottleneck — improving the inlet edge (bevels, wingwalls) helps; barrel roughness does not.':'The barrel/tailwater is the bottleneck — a smoother, shorter, larger barrel or lower tailwater helps; inlet improvements only reduce the small entrance loss.'}</li>
 <li><b>Outlet velocity</b> ≈ ${fx(r.Vout)} ${u.V} at depth ${fx(r.yout)} ${L} (${r.control==='Inlet'?'normal depth':'larger of d<sub>c</sub> and TW, capped at D'}).</li></ol>
 ${flags.length?flags.map(f=>`<div class="flag">⚠ ${f}</div>`).join(''):'<div class="flag ok">✓ No warnings.</div>'}`;
 drawProfile(p,r,allow);drawRating(p,r);drawX(p,r);hl(hlTarget);
}
function drawProfile(p,r,allow){
 const W=900,H=340,x0=200,x1=700,L=r.US?'ft':'m';
 const zmin=Math.min(p.invOut,p.invIn)-r.D*0.6,zmax=Math.max(r.EL,isFinite(allow)?allow:0,p.invIn+r.D*1.8)+r.D*0.3;
 const Y=z=>H-30-(z-zmin)/(zmax-zmin)*(H-60);
 const yi=Y(p.invIn),yo=Y(p.invOut),ti=Y(p.invIn+r.D),to=Y(p.invOut+r.D),road=Y(p.invIn+r.D*1.6);
 const twEl=p.twMode==='const'?Math.max(p.twElev,p.invOut):p.invOut;
 const wsIn=Math.min(r.D,r.control==='Inlet'?r.dc:Math.max(r.dc,r.D)),wsOut=Math.min(r.D,r.yout);
 let s=`<rect width="${W}" height="${H}" fill="#eaf4fb"/>
 <path data-part="embank" d="M60 ${yi} L${x0-40} ${yi} L${x0+60} ${road} L${x1-60} ${road} L${x1+40} ${yo} L840 ${yo} L840 ${H} L60 ${H}Z" fill="#c9b48a" stroke="#8a7550"/>
 <text x="${(x0+x1)/2}" y="${road-6}" text-anchor="middle" fill="#5a4a2c">Roadway embankment (overtopping not modeled)</text>
 <path d="M${x0} ${yi} L${x1} ${yo} L${x1} ${to} L${x0} ${ti}Z" fill="#fff" stroke="none"/>
 <path data-part="hw" d="M40 ${Y(r.EL)} L${x0+ (Y(r.EL)>ti? 0:0)} ${Y(r.EL)} L${x0} ${yi} L40 ${yi}Z" fill="#4a90d9" opacity=".55"/>
 <path d="M${x0} ${Y(p.invIn+wsIn)} L${x1} ${Y(p.invOut+wsOut)} L${x1} ${yo} L${x0} ${yi}Z" fill="#4a90d9" opacity=".55"/>
 <path data-part="tw" d="M${x1} ${Y(twEl)} L860 ${Y(twEl)} L860 ${yo} L${x1} ${yo}Z" fill="#4a90d9" opacity=".45" stroke="#2b6cb0"/>
 <path data-part="barrel" d="M${x0} ${yi} L${x1} ${yo} M${x0} ${ti} L${x1} ${to}" stroke="#555" stroke-width="3" fill="none"/>
 <line data-part="inlet" x1="${x0}" y1="${yi}" x2="${x0}" y2="${ti-8}" stroke="#333" stroke-width="5"/>
 <line data-part="length" x1="${x0}" y1="${yo+18}" x2="${x1}" y2="${yo+18}" stroke="#333" marker-end="url(#a)" marker-start="url(#a)"/>
 <text x="${(x0+x1)/2}" y="${yo+32}" text-anchor="middle">L = ${p.length} ${L}, S = ${fx(r.S*100)}%</text>
 <circle data-part="invin" cx="${x0}" cy="${yi}" r="5" fill="#333"/><text x="${x0+6}" y="${yi+16}">Inv in ${p.invIn}</text>
 <circle data-part="invout" cx="${x1}" cy="${yo}" r="5" fill="#333"/><text x="${x1-90}" y="${yo+14}">Inv out ${p.invOut}</text>
 <line x1="50" y1="${Y(r.EL)}" x2="50" y2="${yi}" stroke="#123" /><text x="56" y="${(Y(r.EL)+yi)/2}" font-weight="700">HW = ${fx(r.HW)} ${L}</text>
 <text x="44" y="${Y(r.EL)-6}">El. ${fx(r.EL)} (${r.control})</text>
 <text x="${x0+10}" y="${Y(p.invIn+r.D)+16}" font-size="12">D = ${fx(r.D)}</text>
 <text x="${x1+20}" y="${Y(twEl)-6}">${p.twMode==='const'?'TW El. '+fx(twEl):'Free outfall'}</text>
 <text x="${x1-150}" y="${Y(p.invOut+wsOut)-6}" font-size="12">outlet depth ${fx(r.yout)}</text>`;
 if(isFinite(allow))s+=`<line data-part="allow" x1="30" x2="${x0+40}" y1="${Y(allow)}" y2="${Y(allow)}" stroke="#c0392b" stroke-dasharray="6 4"/><text x="${x0-60}" y="${Y(allow)-4}" fill="#c0392b" font-size="12">Allowable ${allow}</text>`;
 $('#profile').innerHTML=`<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`+s;
}
function drawRating(p,r){
 const q0=val('Qmin'),q1=val('Qmax');if(!(q1>q0&&q0>=0))return;
 const pts=[];for(let k=0;k<=40;k++){const q=q0+(q1-q0)*k/40;if(q<=0)continue;const a=C.analyze(params(q));pts.push([q,a.HWi,a.HWo]);}
 const W=600,H=320,m=45,hmax=Math.max(...pts.map(t=>Math.max(t[1],t[2])))*1.1;
 const X=q=>m+(q-q0)/(q1-q0)*(W-m-15),Y=h=>H-m+10-(h/hmax)*(H-m-20);
 const line=(i,c,d)=>`<polyline fill="none" stroke="${c}" stroke-width="2.5" ${d?'stroke-dasharray="6 4"':''} points="${pts.map(t=>X(t[0])+','+Y(t[i])).join(' ')}"/>`;
 let g='';for(let k=0;k<=5;k++){const h=hmax*k/5,q=q0+(q1-q0)*k/5;g+=`<line x1="${m}" x2="${W-15}" y1="${Y(h)}" y2="${Y(h)}" stroke="#eee"/><text x="${m-5}" y="${Y(h)+4}" text-anchor="end" font-size="11">${h.toFixed(1)}</text><text x="${X(q)}" y="${H-m+26}" text-anchor="middle" font-size="11">${q.toFixed(0)}</text>`;}
 const u=U[state.units];
 $('#rating').innerHTML=g+`<line x1="${m}" y1="${H-m+10}" x2="${W-15}" y2="${H-m+10}" stroke="#333"/><line x1="${m}" y1="10" x2="${m}" y2="${H-m+10}" stroke="#333"/>
 ${line(1,'#2b6cb0')}${line(2,'#d35400',1)}<polyline fill="none" stroke="#111" stroke-width="1" points="${pts.map(t=>X(t[0])+','+Y(Math.max(t[1],t[2]))).join(' ')}"/>
 <line x1="${m}" x2="${W-15}" y1="${Y(r.D)}" y2="${Y(r.D)}" stroke="#888" stroke-dasharray="2 3"/><text x="${W-20}" y="${Y(r.D)-3}" text-anchor="end" font-size="11">HW = D</text>
 <circle cx="${X(p.Q)}" cy="${Y(r.HW)}" r="5" fill="#c0392b"/><text x="${X(p.Q)+7}" y="${Y(r.HW)-7}" font-size="12">Design</text>
 <text x="${W/2}" y="${H-4}" text-anchor="middle">Total discharge (${u.Q})</text><text transform="rotate(-90)" x="${-H/2}" y="12" text-anchor="middle">Headwater depth (${u.L})</text>
 <rect x="${m+10}" y="14" width="190" height="48" fill="#fff" stroke="#ccc"/><line x1="${m+18}" x2="${m+45}" y1="28" y2="28" stroke="#2b6cb0" stroke-width="2.5"/><text x="${m+50}" y="32" font-size="12">Inlet control</text>
 <line x1="${m+18}" x2="${m+45}" y1="48" y2="48" stroke="#d35400" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${m+50}" y="52" font-size="12">Outlet control</text>`;
}
function drawX(p,r){
 const W=300,H=320,N=r.N,sc=Math.min(240/(N*r.B+(N-1)*r.B*0.25),200/r.D),bw=r.B*sc,bh=r.D*sc,gap=r.B*0.25*sc,tot=N*bw+(N-1)*gap,x0=(W-tot)/2,yb=270;
 const wl=Math.min(r.HW,r.D*1.6)*sc;let s=`<rect x="0" y="${yb-wl}" width="${W}" height="${wl}" fill="#4a90d9" opacity=".25" data-part="hw"/>`;
 for(let k=0;k<N;k++){const x=x0+k*(bw+gap);
  s+=p.shape==='box'?`<rect data-part="xs" x="${x}" y="${yb-bh}" width="${bw}" height="${bh}" fill="#fff" stroke="#444" stroke-width="3"/>`:`<circle data-part="xs" cx="${x+bw/2}" cy="${yb-bh/2}" r="${bh/2}" fill="#fff" stroke="#444" stroke-width="3"/>`;}
 s+=`<line x1="0" x2="${W}" y1="${yb-r.HW*sc}" y2="${yb-r.HW*sc}" stroke="#2b6cb0" stroke-width="2"/><text x="6" y="${yb-r.HW*sc-5}" font-size="12">HW ${fx(r.HW)}</text>
 <text x="${W/2}" y="${yb+20}" text-anchor="middle" font-size="12">${N} × ${p.shape==='box'?fx(r.B)+' × '+fx(r.D):'Ø '+fx(r.D)} ${U[state.units].L}</text>`;
 $('#xsec').innerHTML=s;
}
$('#units').onchange=e=>{state.units=e.target.value;build();run();};
build();run();
