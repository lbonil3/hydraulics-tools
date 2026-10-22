const T=window.Tc,$=s=>document.querySelector(s);
const f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
const COL={sheet:'#2e8b57',shallow:'#d4a017',channel:'#1f77b4',kerby:'#2e8b57',kirpich:'#1f77b4'};
const NAME={sheet:'Sheet flow',shallow:'Shallow concentrated flow',channel:'Channel / pipe flow'};
let mode='NRCS';
const S={P2:4.0,segs:[{t:'sheet',L:100,S:0.01,nk:'Grass: dense grasses',n:0.24},{t:'shallow',L:600,S:0.01,paved:false},{t:'channel',L:1500,S:0.005,n:0.035,A:12,P:12.5}],
 kk:{Lo:500,No:'Pasture, average grass',So:0.02,Lc:4780,Sc:0.0095,adj:false},sub:[{use:'Residential: Single-family areas',C:0.40,A:8},{use:'Streets: Asphaltic',C:0.90,A:2}],county:'Travis',zone:'',rp:25,ser:'PDS'};
const RP=[2,5,10,25,50,100];const CTAB={'Business: Downtown areas':[0.70,0.95],'Business: Neighborhood areas':[0.30,0.70],'Residential: Single-family areas':[0.30,0.50],'Residential: Multi-units, detached':[0.40,0.60],'Residential: Multi-units, attached':[0.60,0.75],'Residential: Suburban':[0.35,0.40],'Apartment dwelling areas':[0.30,0.70],'Industrial: Light areas':[0.30,0.80],'Industrial: Heavy areas':[0.60,0.90],'Parks, cemeteries':[0.10,0.25],'Playgrounds':[0.30,0.40],'Railroad yards':[0.30,0.40],'Unimproved: Sand or sandy loam soil, 0-3%':[0.15,0.20],'Unimproved: Sand or sandy loam soil, 3-5%':[0.20,0.25],'Unimproved: Black or loessial soil, 0-3%':[0.18,0.25],'Unimproved: Black or loessial soil, 3-5%':[0.25,0.30],'Unimproved: Black or loessial soil, > 5%':[0.70,0.80],'Unimproved: Deep sand area':[0.05,0.15],'Unimproved: Steep grassed slopes':[0.70,0.70],'Lawns: Sandy soil, flat 2%':[0.05,0.10],'Lawns: Sandy soil, average 2-7%':[0.10,0.15],'Lawns: Sandy soil, steep 7%':[0.15,0.20],'Lawns: Heavy soil, flat 2%':[0.13,0.17],'Lawns: Heavy soil, average 2-7%':[0.18,0.22],'Lawns: Heavy soil, steep 7%':[0.25,0.35],'Streets: Asphaltic':[0.85,0.95],'Streets: Concrete':[0.90,0.95],'Streets: Brick':[0.70,0.85],'Drives and walks':[0.75,0.95],'Roofs':[0.75,0.95],'Custom / rural (Table 4-11: C = Cr+Ci+Cv+Cs)':[0.1,0.95]};
const DATA=()=>S.ser==='AMS'?IDF_AMS:IDF_PDS;const counties=[...new Set(IDF_PDS.map(r=>r[0]))];const zones=c=>DATA().filter(r=>r[0]===c);
// Field help: [label, unit, what it means, where to get it, typical range [min,max]]
const H={
 P2:['2-yr, 24-hr rainfall P2','in','Rain depth that falls in 24 hours with a 50% chance each year. Used only in the sheet-flow equation.','TxDOT HDM Eq. 4-17 points to NOAA Atlas 14 Precipitation Frequency Data Server (hdsc.nws.noaa.gov/pfds). Use the PDS (partial duration series) table — PFDS shows PDS by default — and read the 24-hr / 2-yr depth (in). TR-55 itself does not specify PDS vs AMS; PDS is used here for consistency with the IDF data. This app does not store P2 values.',[2,6]],
 sL:['Sheet flow length','ft','Distance water travels as a thin film over a plane surface at the top of the flow path.','Topo/aerial. TxDOT: "100 ft maximum" (Eq. 4-17 notes); beyond that it becomes shallow concentrated flow.',[10,100]],
 sS:['Sheet flow slope','ft/ft','Average land slope along the sheet-flow length (drop ÷ length).','Contours or survey. 0.01 = 1%.',[0.002,0.10]],
 sN:['Surface (n for sheet flow)','','Effective roughness for very shallow flow, including raindrop impact. NOT the channel Manning n.','TxDOT HDM Table 4-6 (from NRCS 1986). Pick the cover; you may type a custom value.',[0.011,0.8]],
 hL:['Shallow concentrated length','ft','Length where flow has gathered into rills/gutters/swales but is not yet a defined channel.','Topo/aerial, from end of sheet flow to start of the defined channel or inlet.',[50,3000]],
 hS:['Shallow concentrated slope','ft/ft','Watercourse slope of this reach.','Contours or survey.',[0.002,0.15]],
 hP:['Surface','','Paved (K = 20.32) or unpaved (K = 16.13) in V = K·√S.','TxDOT HDM Eq. 4-18. Curb gutters and paved ditches → paved.',null],
 cL:['Channel / pipe length','ft','Length of this channel or conduit reach.','Plans, survey, aerial. Channels begin where blue lines / visible channels appear (TxDOT HDM).',[50,20000]],
 cS:['Channel slope','ft/ft','Friction (bed) slope of the reach.','Profile or survey.',[0.0005,0.05]],
 cn:['Manning n','','Channel or pipe roughness.','TxDOT HDM Tables 4-7 to 4-9. Concrete pipe 0.012–0.013, earth channel 0.022–0.035, natural stream 0.03–0.05.',[0.010,0.10]],
 cA:['Flow area a','ft²','Bank-full cross-section area (TxDOT: main channel full, no overbank). For a full circular pipe, a = πD²/4.','Typical section from plans or survey.',[0.5,500]],
 cP:['Wetted perimeter pw','ft','Length of channel boundary in contact with water at bank-full. Full circular pipe: pw = πD.','Typical section.',[1,200]],
 Lo:['Overland flow length (Kerby)','ft','Length of overland flow before it enters the main channel.','Topo map. Kerby equation developed for up to 1,200 ft (upper limit).',[50,1200]],
 No:['Retardance N (Kerby)','','Dimensionless retardance; larger than Manning n. Do not interpolate (Roussel et al. 2005).','TxDOT HDM Table 4-5.',null],
 So:['Overland slope','ft/ft','Slope of the overland flow surface.','Topo map.',[0.002,0.10]],
 Lc:['Main channel length (Kirpich)','ft','Channel length from the end of overland flow to the outlet (total main channel length minus overland length).','Topo map / GIS.',[5280,264000]],
 Sc:['Main channel slope','ft/ft','(Elevation at divide − elevation at outlet) ÷ curvilinear main-channel length.','Topo map. Kerby-Kirpich valid for 0.002–0.02.',[0.002,0.02]],
 adj:['Apply low-slope adjustment (+0.0005)','','Cleveland et al. 2012: S = S0 + 0.0005. TxDOT: use if S < 0.002; judgment if 0.002–0.003.','TxDOT HDM Sec. 11 intro.',null],
 C:['Runoff coefficient C','','Fraction of rain that becomes runoff for this sub-area. Picking a land use fills the mid-point of the TxDOT range; edit within the range by judgment.','TxDOT HDM Ch. 4 Sec. 12 "Runoff Coefficients", Table 4-10 (urban). For rural areas use Table 4-11: C = Cr + Ci + Cv + Cs (relief + infiltration + vegetal cover + surface storage).',[0.05,0.95]],
 Aac:['Sub-area A','acres','Area of this land use draining to the design point. Total A = sum of sub-areas; composite C = Σ(C·A)/ΣA.','Drainage area map / GIS. TxDOT limits the Rational Method to 200 acres total.',[0.01,200]],
 use:['Land use','','Sets the TxDOT Table 4-10 C range.','TxDOT HDM Table 4-10.',null],
 county:['County','','Texas county of the design point (254 counties).','TxDOT EBDLKUP-2019 (PDS sheet).',null],
 zone:['Rainfall zone','','Some counties are split into sub-county IDF zones (often by river basin).','EBDLKUP-2019 static maps or TxDOT_IDF_Zones.kmz (txdot.gov Design tools → Atlas 14 rainfall intensity tools).',null],
 ser:['Rainfall series','','PDS (partial duration series, default) or AMS (annual maximum series). TxDOT\'s EBDLKUP-2019 user manual says AMS is currently the TxDOT standard; PDS gives slightly higher intensities for frequent storms (e.g., 2–10 yr) and nearly identical values for rare ones.','Both from TxDOT EBDLKUP-2019.xlsm (sheets ebd_Partial / ebd_Annual). Check your agency/project criteria.',null],
 rp:['Design frequency','yr','Return period of the design storm.','TxDOT HDM Ch. 4 "Design Frequency" table for your facility type (e.g., storm drains, culverts).',null]};
function warn(k,v){const r=H[k][4];if(!r||v==='' )return '';v=+v;if(!(v>0))return `<div class="warn">⚠ Needs a positive number.</div>`;
 if(v<r[0]||v>r[1])return `<div class="warn">⚠ ${v} is outside the usual range (${r[0]}–${r[1]} ${H[k][1]}). Double-check — it may still be right for your site.</div>`;return '';}
function field(k,id,val,input){const h=H[k];return `<div class="f" data-k="${k}"><label><span>${h[0]}${h[1]?' ('+h[1]+')':''} <button class="i" type="button" title="What is this?">i</button></span>${input||`<input id="${id}" type="number" inputmode="decimal" step="any" value="${val}">`}</label>
 <div class="help"><b>What:</b> ${h[2]}<br><b>Where:</b> ${h[3]}${h[4]?`<br><b>Typical:</b> ${h[4][0]}–${h[4][1]} ${h[1]}`:''}</div>${warn(k,val)}</div>`;}
function sel(id,obj,cur){return `<select id="${id}">${Object.keys(obj).map(k=>`<option ${k===cur?'selected':''}>${k}</option>`).join('')}</select>`;}
function form(){let h='';
 if(mode==='NRCS'){h+=`<fieldset><legend>Rainfall</legend>${field('P2','P2',S.P2)}</fieldset><fieldset><legend>Flow segments (upstream → downstream)</legend>`;
  S.segs.forEach((s,j)=>{h+=`<div class="seg ${s.t}"><h4>${j+1}. ${NAME[s.t]} <button class="del" data-j="${j}">✕ remove</button></h4>`;
   if(s.t==='sheet')h+=field('sL',`L${j}`,s.L)+field('sS',`S${j}`,s.S)+field('sN',`nk${j}`,'',sel(`nk${j}`,{...T.SHEET_N,'Custom':0},s.nk))+field('sN',`n${j}`,s.n);
   if(s.t==='shallow')h+=field('hL',`L${j}`,s.L)+field('hS',`S${j}`,s.S)+field('hP',`pv${j}`,'',`<select id="pv${j}"><option value="0">Unpaved (K=16.13)</option><option value="1" ${s.paved?'selected':''}>Paved (K=20.32)</option></select>`);
   if(s.t==='channel')h+=field('cL',`L${j}`,s.L)+field('cS',`S${j}`,s.S)+field('cn',`n${j}`,s.n)+field('cA',`A${j}`,s.A)+field('cP',`P${j}`,s.P)+`<div class="f">Pipe flowing full? D (ft) <input id="D${j}" type="number" inputmode="decimal" step="any" style="width:70px"> <button class="add" data-pipe="${j}">fill a &amp; pw</button></div>`;
   h+='</div>';});
  h+=`<button class="add" data-add="sheet">+ Sheet</button><button class="add" data-add="shallow">+ Shallow conc.</button><button class="add" data-add="channel">+ Channel/pipe</button></fieldset>`;}
 else{const k=S.kk;h+=`<fieldset><legend>Kerby (overland)</legend>${field('Lo','Lo',k.Lo)}${field('No','No','',sel('No',T.KERBY_N,k.No))}${field('So','So',k.So)}</fieldset>
  <fieldset><legend>Kirpich (main channel)</legend>${field('Lc','Lc',k.Lc)}${field('Sc','Sc',k.Sc)}${field('adj','adj','',`<input id="adj" type="checkbox" ${k.adj?'checked':''} style="width:auto">`)}</fieldset>`;}
 const zs=zones(S.county);if(!zs.some(r=>r[1]===S.zone))S.zone=zs[0][1];
 let top=`<fieldset><legend>1. Rainfall intensity (TxDOT EBDLKUP-2019, ${S.ser})</legend>${field('ser','ser','',`<select id="ser"><option value="PDS" ${S.ser==='PDS'?'selected':''}>PDS – partial duration (default)</option><option value="AMS" ${S.ser==='AMS'?'selected':''}>AMS – annual maximum (TxDOT standard)</option></select>`)}${field('county','county','',`<select id="county">${counties.map(c=>`<option ${c===S.county?'selected':''}>${c}</option>`).join('')}</select>`)}${field('zone','zone','',`<select id="zone">${zs.map(r=>`<option ${r[1]===S.zone?'selected':''}>${r[1]}</option>`).join('')}</select>`)}${field('rp','rp','',`<select id="rp">${RP.map(r=>`<option value="${r}" ${r==S.rp?'selected':''}>${r}-year</option>`).join('')}</select>`)}</fieldset>`;
 let c=`<fieldset><legend>2. Runoff coefficient &amp; area (required)</legend>`;
 S.sub.forEach((u,j)=>{c+=`<div class="seg"><h4>Sub-area ${j+1} ${S.sub.length>1?`<button class="del" data-u="${j}">✕ remove</button>`:''}</h4>${field('use','use'+j,'',sel('use'+j,CTAB,u.use))}${field('C','C'+j,u.C)}${field('Aac','A'+j,u.A)}</div>`;});
 c+=`<button class="add" data-addu="1">+ Sub-area (composite C)</button></fieldset>`;
 $('#form').innerHTML=top+c+`<fieldset><legend>3. Time of concentration — ${mode==='NRCS'?'NRCS velocity method (default)':'Kerby-Kirpich (secondary)'}</legend>${mode==='KK'?'<div class="flag">Kerby-Kirpich was developed for 0.25–150 sq mi (160–96,000 ac); its minimum exceeds TxDOT\'s 200-acre (0.31 sq mi) Rational Method limit, so it is offered only as a cross-check. TxDOT suggests running both methods and comparing.</div>':''}</fieldset>`+h.replace(/<\/?fieldset>/g,m=>m).replace('<legend>Rainfall</legend>','<legend>Sheet-flow rainfall</legend>');}
function read(){const v=id=>{const e=$('#'+id);return e?e.value:undefined};
 if(mode==='NRCS'){S.P2=+v('P2');S.segs.forEach((s,j)=>{s.L=+v('L'+j);s.S=+v('S'+j);
  if(s.t==='sheet'){const nk=v('nk'+j);if(nk!==s.nk&&nk!=='Custom'){s.n=T.SHEET_N[nk];}else s.n=+v('n'+j);s.nk=nk;}
  if(s.t==='shallow')s.paved=v('pv'+j)==='1';if(s.t==='channel'){s.n=+v('n'+j);s.A=+v('A'+j);s.P=+v('P'+j);}});}
 else{const k=S.kk;k.Lo=+v('Lo');k.No=v('No');k.So=+v('So');k.Lc=+v('Lc');k.Sc=+v('Sc');k.adj=$('#adj').checked;}
 S.ser=v('ser');S.county=v('county');S.zone=v('zone');S.rp=+v('rp');S.sub.forEach((u,j)=>{const nu=v('use'+j);if(nu!==u.use){u.use=nu;const r=CTAB[nu];u.C=+((r[0]+r[1])/2).toFixed(3);}else u.C=+v('C'+j);u.A=+v('A'+j);});}
function idfAt(rp){const r=zones(S.county).find(r=>r[1]===S.zone);const [e,b,d]=r[2+RP.indexOf(rp)];return {e,b,d};}
function idf(){const r=zones(S.county).find(r=>r[1]===S.zone);const [e,b,d]=r[2+RP.indexOf(S.rp)];return {e,b,d};}
function compute(){const rows=[],steps=[],flags=[];
 if(mode==='NRCS'){let sheetTot=0;S.segs.forEach((s,j)=>{let hr,V,eq;
  if(s.t==='sheet'){hr=T.sheet(s.n,s.L,S.P2,s.S);V=s.L/(hr*3600);sheetTot+=s.L;
   eq=`Sheet flow (TxDOT Eq. 4-17): t = 0.007(nL)<sup>0.8</sup> / (P2<sup>0.5</sup> S<sup>0.4</sup>) = 0.007(${s.n}×${s.L})<sup>0.8</sup> / (${S.P2}<sup>0.5</sup> × ${s.S}<sup>0.4</sup>) = <b>${f(hr,3)} hr = ${f(hr*60,1)} min</b>`;}
  if(s.t==='shallow'){V=T.shallowV(s.paved,s.S);hr=T.shallow(s.paved,s.L,s.S);
   eq=`Shallow concentrated, ${s.paved?'paved':'unpaved'} (TxDOT Eq. 4-18): V = ${T.shallowK(s.paved)}×√${s.S} = ${f(V)} ft/s; t = L/(3600V) = ${s.L}/(3600×${f(V)}) = <b>${f(hr,3)} hr = ${f(hr*60,1)} min</b>`;}
  if(s.t==='channel'){V=T.chanV(s.n,s.A,s.P,s.S);hr=T.channel(s.n,s.A,s.P,s.L,s.S);
   eq=`Channel/pipe (TxDOT Eq. 4-19, Manning): R = a/pw = ${s.A}/${s.P} = ${f(s.A/s.P,3)} ft; V = (1.486/${s.n})×${f(s.A/s.P,3)}<sup>2/3</sup>×√${s.S} = ${f(V)} ft/s; t = ${s.L}/(3600×${f(V)}) = <b>${f(hr,3)} hr = ${f(hr*60,1)} min</b>`;}
  if(s.S<0.002)flags.push(`Segment ${j+1}: slope ${s.S} &lt; 0.002 is a TxDOT "low slope condition". Consider an adjusted slope (Sec. 11 intro).`);
  if(V>20)flags.push(`Segment ${j+1}: velocity ${f(V)} ft/s is very high — check inputs.`);
  rows.push({t:s.t,L:s.L,V,min:hr*60});steps.push(eq);});
  if(sheetTot>100)flags.push(`Total sheet-flow length is ${sheetTot} ft. TxDOT limits sheet flow to 100 ft maximum (Eq. 4-17); "sheet flow usually becomes shallow concentrated flow after around 100 feet." Move the extra length to a shallow concentrated segment.`);
  if(S.segs.findIndex(s=>s.t==='sheet')>0)flags.push('A sheet-flow segment is not first. Sheet flow normally occurs only at the top (headwater) of the flow path.');}
 else{const k=S.kk,so=k.adj?T.lowSlope(k.So):k.So,sc=k.adj?T.lowSlope(k.Sc):k.Sc,N=T.KERBY_N[k.No];
  const a=T.kerby(k.Lo,N,so),b=T.kirpich(k.Lc,sc);
  rows.push({t:'kerby',L:k.Lo,V:k.Lo/(a*60),min:a},{t:'kirpich',L:k.Lc,V:k.Lc/(b*60),min:b});
  steps.push(`Overland (Kerby, TxDOT Eq. 4-14): t<sub>ov</sub> = 0.828(L·N)<sup>0.467</sup> S<sup>−0.235</sup> = 0.828(${k.Lo}×${N})<sup>0.467</sup>×${f(so,4)}<sup>−0.235</sup> = <b>${f(a,1)} min</b>`,
   `Channel (Kirpich, TxDOT Eq. 4-15): t<sub>ch</sub> = 0.0078 L<sup>0.77</sup> S<sup>−0.385</sup> = 0.0078×${k.Lc}<sup>0.77</sup>×${f(sc,4)}<sup>−0.385</sup> = <b>${f(b,1)} min</b>`);
  if(k.Lo>1200)flags.push('Overland length exceeds 1,200 ft, the upper limit of data used to develop the Kerby equation.');
  if(k.Lc<5280||k.Lc>264000)flags.push('Main channel length is outside 1–50 miles, the Kerby-Kirpich applicability range (Roussel et al. 2005).');
  if(k.Sc<0.002||k.Sc>0.02)flags.push('Main channel slope is outside 0.002–0.02, the Kerby-Kirpich applicability range.');
  if(!k.adj&&(k.Sc<0.002||k.So<0.002))flags.push('Slope &lt; 0.002: TxDOT says a low slope condition exists and the adjusted slope (S + 0.0005) should be used. Tick the box.');
  if(!k.adj&&k.Sc>=0.002&&k.Sc<0.003)flags.push('Channel slope 0.002–0.003 is "transitional": use judgment on the low-slope adjustment.');
  flags.push('Kerby-Kirpich applies to watersheds of 0.25–150 sq mi; the Rational Method is limited to 200 acres (0.31 sq mi), so for Rational work the NRCS method is usually the right tool.');}
 const tc=rows.reduce((a,r)=>a+r.min,0);return {rows,steps,flags,tc,gov:Math.max(tc,T.TC_MIN)};}
function draw(R){const W=900,x0=30,x1=870,tot=R.rows.reduce((a,r)=>a+r.L,0)||1;let x=x0,s='';const y=(i)=>40+i*(100/Math.max(R.rows.length,1));
 s+=`<text x="${x0}" y="22" font-size="12">● Remote point</text><text x="${x1}" y="190" font-size="12" text-anchor="end">Design point ▼</text>`;
 R.rows.forEach((r,i)=>{const w=Math.max(40,(x1-x0)*r.L/tot*0.85+(x1-x0)*0.15/R.rows.length),xa=x,xb=Math.min(x1,x+w),ya=y(i),yb=y(i+1);x=xb;
  s+=`<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="${COL[r.t]}" stroke-width="${r.t.match(/channel|kirpich/)?10:r.t==='shallow'?6:3}" stroke-linecap="round"/>
  <circle cx="${xb}" cy="${yb}" r="4" fill="#1d2733"/><text x="${(xa+xb)/2}" y="${(ya+yb)/2-12}" text-anchor="middle" font-size="12" font-weight="700">${f(r.min,1)} min</text>
  <text x="${(xa+xb)/2}" y="${(ya+yb)/2+22}" text-anchor="middle" font-size="11" fill="#556">${i+1}. ${(NAME[r.t]||r.t[0].toUpperCase()+r.t.slice(1)).split(' ')[0]} · ${r.L} ft</text>`;});
 let lx=x0;[['sheet','Sheet / Kerby'],['shallow','Shallow concentrated'],['channel','Channel / pipe / Kirpich']].forEach(([k,n])=>{s+=`<rect x="${lx}" y="180" width="14" height="8" fill="${COL[k]}"/><text x="${lx+18}" y="188" font-size="11">${n}</text>`;lx+=170;});
 $('#path').innerHTML=s;}
// Hand design + check (1% AEP) flows to the culvert tool. TxDOT HDM Ch. 4 §6 (Table 4-2 notes): "All facilities must be evaluated to the 1% AEP flood event."
function sendBox(Q,I,C,A,tc){const I100=T.intensity(idfAt(100),tc),Q100=C*I100*A;
 const d={Q:+Q.toFixed(2),Qcheck:+Q100.toFixed(2),rp:S.rp,county:S.county,zone:S.zone,ser:S.ser,tc:+tc.toFixed(2),C:+C.toFixed(3),A:+A.toFixed(3),i:+I.toFixed(3),i100:+I100.toFixed(3),t:Date.now()};
 const url='../culvert/?'+new URLSearchParams({from:'rational',Q:d.Q,Qcheck:d.Qcheck,rp:d.rp,county:d.county,zone:d.zone,ser:d.ser,tc:d.tc,C:d.C,A:d.A,i:d.i,i100:d.i100}).toString();
 let el=$('#sendc');if(!el){el=document.createElement('div');el.id='sendc';el.className='card';$('#summary').after(el);}
 el.innerHTML=`<h3>Send to culvert tool</h3><p style="margin:4px 0 8px">Design flow <b>${f(Q,1)} cfs</b> (${S.rp}-yr) and check flood <b>${f(Q100,1)} cfs</b> (100-yr, 1% AEP: same county IDF, Tc = ${f(tc,1)} min and C = ${f(C,3)}; i<sub>100</sub> = ${f(I100,2)} in/hr). TxDOT HDM Ch. 4 §6: “All facilities must be evaluated to the 1% AEP flood event.” Pick the design frequency from HDM Table 4-2 for your facility (e.g., freeway main-lane culverts: 2% AEP, 50-yr).</p><a class="sendbtn" href="${url}" style="display:inline-block;background:#1f4e79;color:#fff;padding:10px 16px;border-radius:8px;font-weight:600;text-decoration:none">Send to culvert tool →</a>`;
 el.querySelector('a').onclick=()=>{try{localStorage.setItem('hydro.handoff',JSON.stringify(d));}catch(e){}};
 window.HANDOFF=d;}
function render(){const R=compute();draw(R);const below=R.tc<T.TC_MIN;
 const K=idf(),I=T.intensity(K,R.gov),A=S.sub.reduce((a,u)=>a+u.A,0),C=S.sub.reduce((a,u)=>a+u.C*u.A,0)/A,Q=C*I*A;
 $('#summary').innerHTML=`<div class="kpi gov" style="font-size:15px">Peak flow Q = C·i·A (${S.rp}-yr)<b style="font-size:30px">${f(Q,1)} cfs</b></div><div class="kpi">Intensity i<b>${f(I,2)} in/hr</b>${S.county} · ${S.zone} · ${S.ser}</div><div class="kpi">Composite C<b>${f(C,3)}</b></div><div class="kpi">Area A<b>${f(A,2)} ac</b></div><div class="kpi">Tc used<b>${f(R.gov,1)} min</b>${below?'10-min minimum governs (computed '+f(R.tc,1)+')':'computed Tc governs'}</div>`;
 sendBox(Q,I,C,A,R.gov);
 $('#table').innerHTML=`<table><tr><th>#</th><th>Type</th><th>Length (ft)</th><th>Velocity (ft/s)</th><th>Travel time (min)</th><th>Share</th></tr>${R.rows.map((r,i)=>`<tr><td>${i+1}</td><td><span style="color:${COL[r.t]}">■</span> ${NAME[r.t]||r.t}</td><td>${r.L}</td><td>${f(r.V)}</td><td>${f(r.min,2)}</td><td>${f(100*r.min/R.tc,0)}%</td></tr>`).join('')}<tr><th colspan="4">Total</th><th>${f(R.tc,2)}</th><th></th></tr></table>`;
 const st=[...R.steps,`Add the travel times: Tc = ${R.rows.map(r=>f(r.min,1)).join(' + ')} = <b>${f(R.tc,1)} min</b>.`,
  below?`${f(R.tc,1)} min is less than TxDOT's 10-minute minimum for Rational Method intensity (Sec. 12, "Rainfall Intensity"), so <b>use Tc = 10 min</b> to read i from the IDF curve.`:`${f(R.tc,1)} min exceeds the 10-minute minimum, so <b>use the computed Tc</b> as the storm duration when reading i.`];
 st.push(`Rainfall intensity (TxDOT HDM Eq. 4-21, EBDLKUP-2019 ${S.ser==='AMS'?'AMS (annual maximum series)':'PDS (partial duration series)'} coefficients for ${S.county} County, ${S.zone}, ${S.rp}-yr: e = ${f(K.e,6)}, b = ${f(K.b,4)}, d = ${f(K.d,4)}): i = b/(Tc+d)<sup>e</sup> = ${f(K.b,4)}/(${f(R.gov,1)}+${f(K.d,4)})<sup>${f(K.e,4)}</sup> = <b>${f(I,2)} in/hr</b>.`);
 st.push(`Composite C = Σ(C·A)/ΣA = (${S.sub.map(u=>u.C+'×'+u.A).join(' + ')}) / ${f(A,2)} = <b>${f(C,3)}</b>.`);
 st.push(`Peak flow (Rational Method, TxDOT HDM Ch. 4 Sec. 12): Q = C·i·A = ${f(C,3)} × ${f(I,2)} in/hr × ${f(A,2)} ac = <b>${f(Q,1)} cfs</b> (1 ac·in/hr ≈ 1.008 cfs, taken as 1).`);
 st.unshift('<b>Time of concentration (feeds the intensity):</b>');
 S.sub.forEach((u,j)=>{const r=CTAB[u.use];if(u.C<r[0]-1e-9||u.C>r[1]+1e-9)R.flags.push(`Sub-area ${j+1}: C = ${u.C} is outside the TxDOT Table 4-10 range ${r[0]}–${r[1]} for "${u.use}".`);});
 if(R.gov>720)R.flags.push('Tc exceeds 720 min, the EBDLKUP-2019 maximum.');
 if(A>200)R.flags.push('Total drainage area exceeds 200 acres, TxDOT\'s Rational Method limit.');
 $('#explain').innerHTML=R.flags.map(t=>`<div class="flag">⚠ ${t}</div>`).join('')+(R.flags.length?'':'<div class="flag ok">✓ No range issues found.</div>')+`<ol>${st.map(t=>`<li>${t}</li>`).join('')}</ol>`;
 $('#refs').innerHTML=`<b>Sources:</b> TxDOT Hydraulic Design Manual (online ed., txdot.gov/manuals/des/hyd), Chapter 4 Hydrology — Section 11 "Time of Concentration" (low-slope adjustment; subsections "Kerby-Kirpich Method", "The Kerby Method" Eq. 4-14 &amp; Table 4-5, "The Kirpich Method" Eq. 4-15, "Natural Resources Conservation Service (NRCS) Method for Estimating tc" Eq. 4-16, "Sheet Flow Time Calculation" Eq. 4-17 &amp; Table 4-6, "Shallow Concentrated Flow" Eq. 4-18, "Channel Flow" Eq. 4-19, "Manning's Roughness Coefficient Values" Tables 4-7–4-9); Section 12 "Rational Method" — "Runoff Coefficients" (Tables 4-10, 4-11), "Rainfall Intensity" (Eq. 4-21; 10-min minimum Tc; 200-acre limit). IDF coefficients: TxDOT EBDLKUP-2019.xlsm, sheet ${S.ser==='AMS'?'ebd_Annual (<b>Annual Maximum Series</b>)':'ebd_Partial (<b>Partial Duration Series</b>)'}, txdot.gov/content/dam/docs/division/des/h-h/ebdlkup-2019.xlsm, based on NOAA Atlas 14 Vol. 11 v2.0 (2018) and TTI Report 0-6980-R1 (2019). Note: the EBDLKUP-2019 user manual says AMS is currently the TxDOT standard; this app defaults to PDS by user preference; AMS is selectable. Series used: <b>${S.ser}</b>. NRCS TR-55 (1986) Ch. 3. Engineering judgment and the current manual govern; verify before sealing.`;}
function full(){form();render();}
$('#form').addEventListener('input',e=>{if(e.target.matches('input,select')){read();if(e.target.tagName==='SELECT'){form();}render();
 const fb=e.target.closest('.f');if(fb&&e.target.tagName==='INPUT'){const w=fb.querySelector('.warn');const k=fb.dataset.k;const nw=warn(k,e.target.value);if(w)w.remove();if(nw)fb.insertAdjacentHTML('beforeend',nw);}}});
$('#form').addEventListener('click',e=>{const b=e.target;if(b.classList.contains('i')){b.closest('.f').classList.toggle('open');return;}
 if(b.dataset.add){read();S.segs.push(b.dataset.add==='sheet'?{t:'sheet',L:100,S:0.01,nk:'Grass: dense grasses',n:0.24}:b.dataset.add==='shallow'?{t:'shallow',L:500,S:0.01,paved:false}:{t:'channel',L:1000,S:0.005,n:0.013,A:3.14,P:6.28});full();}
 if(b.dataset.addu){read();S.sub.push({use:'Lawns: Heavy soil, average 2-7%',C:0.2,A:1});full();}
 if(b.dataset.u){read();S.sub.splice(+b.dataset.u,1);full();}
 if(b.dataset.j){read();S.segs.splice(+b.dataset.j,1);full();}
 if(b.dataset.pipe){read();const j=+b.dataset.pipe,D=+$('#D'+j).value;if(D>0){S.segs[j].A=+(Math.PI*D*D/4).toFixed(3);S.segs[j].P=+(Math.PI*D).toFixed(3);full();}}});
$('#tNRCS').onclick=()=>{mode='NRCS';$('#tNRCS').className='on';$('#tKK').className='';full();};
$('#tKK').onclick=()=>{mode='KK';$('#tKK').className='on';$('#tNRCS').className='';full();};
full();
