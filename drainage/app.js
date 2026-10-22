const $=s=>document.querySelector(s),f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
let mode='gutter';
const S={
 gutter:{gt:'uniform',inp:'Q',Q:1.8,T:8.2,SL:0.01,Sx:0.02,n:0.016,W:2,a:2,Sx1:0.25,Sx2:0.04,Sx3:0.02,TBC:2},
 grade:{it:'grate',Q:6.62,SL:0.04,Sx:0.025,n:0.016,gw:2,gl:2,Vo:8.2,cl:9.84,ca:0,cw:2,meth:'HEC22'},
 sag:{it:'grate',inp:'Q',Q:6.71,Tg:8.2,Sx:0.05,Sw:0.05,gw:2,gl:6,ratio:0.9,clog:0.5,cl:4,h:0.325,ca:0,cw:2,throat:'vertical',theta:0,sl:12,sw:1.75},
 chan:{inp:'d',Q:55.7,d:1.6,B:2.6,z1:3,z2:3,n:0.030,S:0.01}};
// Field help: [label, unit, what, where, typical]
const H={
 Q:['Design flow Q','cfs','Gutter (or channel) flow arriving at the section or inlet.','Rational Method Q = CiA for the inlet drainage area (see Tc Studio) plus any bypass from the inlet upstream. TxDOT HDM Ch. 10 Sec. 6 "Carryover Design Approach".',[0.1,20]],
 T:['Spread T','ft','Width of flow measured from the curb face out into the roadway.','For checking: the allowable spread (design criterion) or a field-measured ponded width. TxDOT HDM Eq. 10-2: T = y/Sx.',[2,20]],
 SL:['Longitudinal slope SL','ft/ft','Grade of the gutter along the road.','Roadway profile at the inlet. 0.01 = 1%. HEC-22 Eq. 5.2 term SL^0.5.',[0.001,0.08]],
 Sx:['Cross slope Sx','ft/ft','Pavement cross slope toward the curb.','Typical section / superelevation diagram. 0.02 = 2%.',[0.01,0.08]],
 n:['Manning n (gutter)','','Roughness of the gutter and pavement.','HEC-22 Table 5.3 / TxDOT HDM Ch. 10 Sec. 6 "Gutter Flow" table, e.g. concrete gutter troweled 0.012; asphalt smooth 0.013, rough 0.016; concrete pavement float 0.014, broom 0.016. HEC-22 examples use 0.016.',[0.011,0.02]],
 gt:['Gutter section','','Uniform: one cross slope to the curb. Composite: depressed gutter of width W and depression a (HEC-22 Eq. 5.7/5.8). V: shallow V swale (Eq. 5.9). V + shoulder: Example 5.3 three-slope roadside V gutter.','Typical section sheets.',null],
 W:['Gutter width W','ft','Width of the depressed gutter section.','Standard curb & gutter detail (2 ft typical).',[1,3]],
 a:['Gutter depression a','in','Vertical drop of the gutter lip below the pavement cross-slope line.','Curb & gutter detail. HEC-22 Example 5.2 uses 2 in.',[0,3]],
 Sx1:['Sx1 (steep side of V)','ft/ft','Cross slope of the curb/foreslope side of the V.','Typical section. Example 5.3: 0.25.',[0.04,0.33]],
 Sx2:['Sx2 (shoulder side of V)','ft/ft','Cross slope of the other side of the V.','Typical section. Example 5.3: 0.04.',[0.01,0.1]],
 Sx3:['Sx3 (pavement)','ft/ft','Pavement slope beyond the V (three-slope case only).','Example 5.3: 0.02.',[0.01,0.05]],
 TBC:['V width TBC','ft','Horizontal width of the Sx2 side from the V bottom (B) to the break (C).','Example 5.3: 2 ft.',[1,6]],
 inp:['Solve for','','Choose what you know.','',null],
 it:['Inlet type','','Grate, curb opening, or combination (grate + curb opening). On grade, a curb opening longer than the grate is a "sweeper" combination (HEC-22 Example 7.4).','Inlet standard sheets.',null],
 gw:['Grate width W','ft','Grate width perpendicular to the curb.','Grate catalog / standard. 2 ft typical.',[1,3]],
 gl:['Grate length L','ft','Grate length along the curb (sum of grates for a multiple grate).','Grate catalog. In sag, a double 2×3 ft grate has L = 6 ft.',[1,12]],
 Vo:['Splash-over velocity Vo','ft/s','Gutter velocity above which water starts to skip over the grate (frontal efficiency drops, Eq. 7.5).','Read from HEC-22 Figure 7.8 for the grate type and length (graph — not tabulated, so you must enter it). Examples: P-1-7/8, 2 ft ≈ 8.2 (Ex. 7.1); curved vane, 2 ft ≈ 6.0 (Ex. 7.4).',[3,15]],
 cl:['Curb opening length L','ft','Length of the curb opening throat.','Inlet standard (TxDOT curb inlets typically 5, 10, 15 ft…). For a sweeper combination this is the total curb length including the part beside the grate.',[3,30]],
 ca:['Local depression a','in','Extra local depression at the inlet (0 = undepressed).','Inlet standard. TxDOT HDM Ch. 10 Sec. 5: 0–1 in in a traffic lane, 1–3 in outside the lane/parking lane, 1–5 in on lightly traveled city streets.',[0,5]],
 cw:['Depression width W','ft','Width of the local depression perpendicular to the curb.','Inlet standard; 2 ft in HEC-22 examples.',[1,4]],
 meth:['Equivalent-slope method','','HEC-22: Eo from composite-gutter Eq. 5.7 at the spread in the depressed section. TxDOT HDM: spread from uniform gutter Eq. 10-4, then Eo from conveyance ratio Eq. 10-5…10-10. Both use Se = Sx + (a/W)Eo and the same LT and efficiency equations.','Use TxDOT for TxDOT projects.',null],
 Tg:['Spread T (for capacity)','ft','Allowable spread at the sag; depth at curb d = T·Sx.','Design spread criterion.',[4,20]],
 Sw:['Gutter slope over grate Sw','ft/ft','Cross slope across the grate width (= Sx for a uniform gutter).','Gutter detail.',[0.01,0.1]],
 ratio:['Grate opening ratio','','Clear opening area ÷ total grate area, used in the orifice equation.','HEC-22 Table 7.5: P-1-7/8-4 0.80; P-1-7/8 0.90; P-1-1/8 0.60; Reticuline 0.80; Curved vane 0.35; 30° tilt-bar 0.34.',[0.3,0.9]],
 clog:['Grate clogging','fraction','Fraction of the grate assumed blocked (from the curb side) — reduces perimeter and area.','Designer judgment. HEC-22 Example 7.5 assumes 0.5.',[0,1]],
 h:['Curb opening height h','ft','Height of the curb opening throat.','Inlet standard (e.g. 3.9 in = 0.325 ft in HEC-22 Ex. 7.8; 0.43 ft in Ex. 7.6).',[0.25,0.6]],
 throat:['Throat','','Vertical/horizontal: orifice head at mid-height (di − h/2, HEC-22 Fig. 7.17). Inclined (e.g. TxDOT Type C): do = y + a − (h/2)·sin θ (TxDOT HDM Eq. 10-17).','Inlet standard.',null],
 theta:['Throat angle θ','deg','Inclination of the throat (inclined throat only).','Inlet standard.',[0,90]],
 sl:['Slot length L','ft','Length of the slotted drain.','Product data.',[5,40]],
 sw:['Slot width','in','Clear slot width.','Product data; HEC-22 Example 7.7 uses 1.75 in.',[1,3]],
 B:['Bottom width B','ft','Channel bottom width (0 = V ditch).','Typical section.',[0,20]],
 z1:['Side slope z1 (H:V)','','Left side slope, horizontal per 1 vertical.','Typical section; 3 = 3H:1V. 0 = vertical (rectangular).',[0,6]],
 z2:['Side slope z2 (H:V)','','Right side slope.','Typical section.',[0,6]],
 cn:['Manning n (lining)','','Roughness of the channel lining.','HEC-22 Ch. 6 / lining manufacturer; Example 6.1 uses 0.030 (turf reinforcement mat).',[0.012,0.08]],
 S:['Channel slope S','ft/ft','Channel bed slope (= energy slope for uniform flow).','Profile. TxDOT HDM Eq. 6-2 note.',[0.0005,0.1]],
 d:['Flow depth d','ft','Depth of flow (or ditch depth for full capacity).','Typical section.',[0.2,6]]};
function warn(k,v){const h=H[k];if(!h||!h[4]||typeof v!=='number')return '';const[a,b]=h[4];return v<a||v>b?`<div class="warn">⚠ Outside typical range ${a}–${b}${h[1]&&h[1]!=='fraction'?' '+h[1]:''}.</div>`:'';}
function field(k,val,input,key){key=key||k;const h=H[k];return `<div class="f" data-k="${key}"><label><span>${h[0]}${h[1]?' ('+h[1]+')':''} <button class="i" type="button" title="What is this?">i</button></span>${input||`<input data-v="${key}" type="number" inputmode="decimal" step="any" value="${val}">`}</label>
 <div class="help"><b>What:</b> ${h[2]}${h[3]?`<br><b>Where:</b> ${h[3]}`:''}${h[4]?`<br><b>Typical:</b> ${h[4][0]}–${h[4][1]} ${h[1]}`:''}</div>${warn(k,val)}</div>`;}
const sel=(key,val,opts,k)=>field(k||key,null,`<select data-v="${key}">${opts.map(([v,l])=>`<option value="${v}"${v==val?' selected':''}>${l}</option>`).join('')}</select>`,key);
const num=(k,s,key)=>field(k,s[key||k],null,key);
function form(){const s=S[mode];let h='';
 if(mode==='gutter'){h+=`<fieldset><legend>Flow</legend>${sel('inp',s.inp,[['Q','Spread T from flow Q'],['T','Flow Q from spread T']])}${s.inp==='Q'?num('Q',s):num('T',s)}</fieldset>`;
  h+=`<fieldset><legend>Gutter section</legend>${sel('gt',s.gt,[['uniform','Uniform cross slope'],['composite','Composite (depressed gutter)'],['v','V swale (2 slopes)'],['v3','V gutter + shoulder (3 slopes)']])}${num('SL',s)}${num('n',s)}`;
  if(s.gt==='uniform'||s.gt==='composite')h+=num('Sx',s);if(s.gt==='composite')h+=num('W',s)+num('a',s);
  if(s.gt==='v'||s.gt==='v3')h+=num('Sx1',s)+num('Sx2',s);if(s.gt==='v3')h+=num('Sx3',s)+num('TBC',s);h+='</fieldset>';}
 if(mode==='grade'){h+=`<fieldset><legend>Inlet</legend>${sel('it',s.it,[['grate','Grate'],['curb','Curb opening'],['combo','Combination (grate + curb)']])}${num('Q',s)}</fieldset>`;
  h+=`<fieldset><legend>Gutter</legend>${num('SL',s)}${num('Sx',s)}${num('n',s)}</fieldset>`;
  if(s.it!=='curb')h+=`<fieldset><legend>Grate</legend>${num('gw',s)}${num('gl',s)}${num('Vo',s)}</fieldset>`;
  if(s.it!=='grate')h+=`<fieldset><legend>Curb opening</legend>${num('cl',s)}${num('ca',s)}${num('cw',s)}${sel('meth',s.meth,[['HEC22','HEC-22 (Eq. 5.7 / 7.11)'],['TxDOT','TxDOT HDM (Eq. 10-5…10-11)']])}</fieldset>`;}
 if(mode==='sag'){h+=`<fieldset><legend>Inlet</legend>${sel('it',s.it,[['grate','Grate'],['curb','Curb opening'],['combo','Combination (grate + curb)'],['slot','Slotted drain']])}${s.it==='curb'?sel('inp',s.inp,[['Q','Ponded depth/spread from Q'],['T','Capacity at spread T']]):''}${s.it==='curb'&&s.inp==='T'?num('Tg',s):num('Q',s)}${num('Sx',s)}</fieldset>`;
  if(s.it==='grate'||s.it==='combo')h+=`<fieldset><legend>Grate</legend>${num('gw',s)}${num('gl',s)}${num('ratio',s)}${s.it==='grate'?num('clog',s)+num('Sw',s):''}</fieldset>`;
  if(s.it==='curb'||s.it==='combo')h+=`<fieldset><legend>Curb opening</legend>${num('cl',s)}${num('h',s)}${s.it==='curb'?num('ca',s)+num('cw',s)+sel('throat',s.throat,[['vertical','Vertical / horizontal'],['inclined','Inclined (TxDOT Eq. 10-17)']])+(s.throat==='inclined'?num('theta',s):''):''}</fieldset>`;
  if(s.it==='slot')h+=`<fieldset><legend>Slotted drain</legend>${num('sl',s)}${num('sw',s)}</fieldset>`;}
 if(mode==='chan'){h+=`<fieldset><legend>Solve for</legend>${sel('inp',s.inp,[['d','Capacity Q at depth d'],['Q','Normal depth for flow Q']])}${s.inp==='d'?num('d',s):num('Q',s)}</fieldset>`;
  h+=`<fieldset><legend>Channel (trapezoid)</legend>${num('B',s)}${num('z1',s)}${num('z2',s)}${field('cn',s.n,null,'n')}${num('S',s)}</fieldset>`;}
 h+=`<fieldset><legend>Examples</legend><div class="f">Load a HEC-22 worked example: <select id="ex"><option value="">—</option>${EX.filter(e=>e.m===mode).map((e,i)=>`<option value="${EX.indexOf(e)}">${e.l}</option>`).join('')}</select></div></fieldset>`;
 $('#form').innerHTML=h;}
const EX=[
 {m:'gutter',l:'Ex. 5.1 uniform gutter, Q 1.8 cfs',s:{gt:'uniform',inp:'Q',Q:1.8,SL:0.01,Sx:0.02,n:0.016}},
 {m:'gutter',l:'Ex. 5.2 composite gutter, T 8.2 ft',s:{gt:'composite',inp:'T',T:8.2,SL:0.01,Sx:0.02,n:0.016,W:2,a:2}},
 {m:'gutter',l:'Ex. 5.2 composite gutter, Q 4.2 cfs',s:{gt:'composite',inp:'Q',Q:4.2,SL:0.01,Sx:0.02,n:0.016,W:2,a:2}},
 {m:'gutter',l:'Ex. 5.3 V gutter + shoulder, Q 1.77',s:{gt:'v3',inp:'Q',Q:1.77,SL:0.01,n:0.016,Sx1:0.25,Sx2:0.04,Sx3:0.02,TBC:2}},
 {m:'grade',l:'Ex. 7.1 P-1-7/8 grate 2×2',s:{it:'grate',Q:6.62,SL:0.04,Sx:0.025,n:0.016,gw:2,gl:2,Vo:8.2}},
 {m:'grade',l:'Ex. 7.2 curb 9.84 ft undepressed',s:{it:'curb',Q:1.77,SL:0.01,Sx:0.02,n:0.016,cl:9.84,ca:0,cw:2,meth:'HEC22'}},
 {m:'grade',l:'Ex. 7.2 curb 9.84 ft depressed 1 in',s:{it:'curb',Q:1.77,SL:0.01,Sx:0.02,n:0.016,cl:9.84,ca:1,cw:2,meth:'HEC22'}},
 {m:'grade',l:'Ex. 7.4 sweeper combination',s:{it:'combo',Q:1.77,SL:0.01,Sx:0.02,n:0.016,cl:9.84,ca:1,cw:2,gw:2,gl:2,Vo:6,meth:'HEC22'}},
 {m:'sag',l:'Ex. 7.5 double 2×3 grate, 50% clogged',s:{it:'grate',Q:6.71,Sx:0.05,Sw:0.05,gw:2,gl:6,ratio:0.8,clog:0.5}},
 {m:'sag',l:'Ex. 7.6 curb 8.2 ft at T 8.2 ft (depressed)',s:{it:'curb',inp:'T',Tg:8.2,Sx:0.02,cl:8.2,h:0.43,ca:1,cw:2,throat:'vertical'}},
 {m:'sag',l:'Ex. 7.8 combination, Q 5.3 cfs',s:{it:'combo',Q:5.3,Sx:0.03,gw:2,gl:4,ratio:0.9,cl:4,h:0.325}},
 {m:'sag',l:'Ex. 7.7 slotted 12 ft, Q 4.9',s:{it:'slot',Q:4.9,Sx:0.02,sl:12,sw:1.75}},
 {m:'chan',l:'Ex. 6.1 trapezoid, d 1.6 ft',s:{inp:'d',d:1.6,B:2.6,z1:3,z2:3,n:0.03,S:0.01}}];
const kpi=(l,v,u,sub,gov)=>`<div class="kpi${gov?' gov':''}">${l}<b>${v} ${u||''}</b>${sub?`<span>${sub}</span>`:''}</div>`;
const tbl=r=>`<table><tbody>${r.map(([a,b,c])=>`<tr><td>${a}</td><td>${b}</td><td>${c||''}</td></tr>`).join('')}</tbody></table>`;
function gObj(s){return {type:s.gt,n:s.n,SL:s.SL,Sx:s.Sx,W:s.W,a:s.a,Sx1:s.Sx1,Sx2:s.Sx2,Sx3:s.Sx3,TBC:s.TBC};}
function svgGutter(T,Sx,o={}){ // curb at right, pavement rising away from curb, water wedge (vertical exaggerated)
 const W=o.W||0,a=o.a||0,dC=T*Sx+a,Xm=Math.max(T*1.25,4),hs=780/Xm,vs=Math.min(130/Math.max(dC,0.05),400),base=60+vs*dC;
 const X=x=>860-x*hs,Y=e=>(base-vs*e).toFixed(1);
 const pts=(W>0?[[0,0],[W,a+W*Sx],[Xm,a+Xm*Sx]]:[[0,0],[Xm,Xm*Sx]]);
 const wet=pts.filter(p=>p[0]<T).concat([[T,dC]]);
 const wedge=wet.map(([x,e])=>`${X(x)},${Y(e)}`).join(' ')+` ${X(0)},${Y(dC)}`;
 const ln=pts.map(([x,e])=>`${X(x)},${Y(e)}`).join(' '),yt=+Y(dC);
 return `<polygon points="${wedge}" fill="#9cc9f0" stroke="#1f77b4"/><polyline points="${X(0)},${yt-40} ${ln}" fill="none" stroke="#333" stroke-width="3"/>
 <line x1="${X(T)}" y1="${yt-12}" x2="${X(0)}" y2="${yt-12}" stroke="#c0392b" marker-end="url(#ar)" marker-start="url(#ar)"/><text x="${(X(T)+X(0))/2}" y="${yt-20}" font-size="15" text-anchor="middle" fill="#c0392b">T = ${f(T)} ft</text>
 <text x="${X(0)-8}" y="${(yt+base)/2+5}" font-size="14" text-anchor="end">d = ${f(dC,3)} ft</text><text x="${X(0)+6}" y="${yt-28}" font-size="13">curb</text>${W>0?`<text x="${X(W/2)}" y="${base+18}" font-size="12" text-anchor="middle">W = ${W} ft, a = ${f(a*12,1)} in</text>`:''}
 <defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#c0392b"/></marker></defs>`;}
function render(){const s=S[mode];let K='',R=[],E=[],svg='',ttl='Cross section',refs='';
 const REF={g:'FHWA HEC-22 Urban Drainage Design Manual, 4th ed. (2024), Ch. 5 Eq. 5.2–5.9 and Examples 5.1–5.3; TxDOT Hydraulic Design Manual Ch. 10 Sec. 6 "Gutter Flow" Eq. 10-1–10-4 (txdot.gov/manuals/des/hyd).',
  i:'FHWA HEC-22 4th ed. (2024) Ch. 7 Eq. 7.3–7.21 and Examples 7.1–7.8; TxDOT HDM Ch. 10 Sec. 6 "Curb Inlets On-Grade" Eq. 10-5–10-13 and "Curb Inlets in Sag Configuration" Eq. 10-14–10-18; TxDOT HDM Ch. 10 Sec. 5 "Curb Opening Inlets" (depression guidance).',
  c:'FHWA HEC-22 4th ed. (2024) Ch. 6 Eq. 6.5–6.9 and Example 6.1; TxDOT HDM Ch. 6 Sec. 1 "Channel Capacity" Eq. 6-2/6-3 (Manning, z = 1.486).'};
 try{
 if(mode==='gutter'){const g=gObj(s),r=DR.gutter(g,s.inp==='Q'?{Q:s.Q}:{T:s.T});
  K=kpi(s.inp==='Q'?'Spread T':'Gutter flow Q',s.inp==='Q'?f(r.T):f(r.Q),s.inp==='Q'?'ft':'cfs',`depth at curb ${f(r.d,3)} ft · V ${f(r.V)} ft/s`,1)+kpi('Depth at curb d',f(r.d,3),'ft')+kpi('Velocity',f(r.V),'ft/s');
  R=[['Flow Q',f(r.Q,3),'cfs'],['Spread T',f(r.T,2),'ft'],['Depth at curb d',f(r.d,3),'ft'],['Flow area A',f(r.A,3),'ft²'],['Mean velocity V',f(r.V,2),'ft/s']];
  if(g.type==='composite')R.push(['Sw = Sx + a/W (Eq. 5.8)',f(r.Sw,4),'ft/ft'],['Eo frontal flow ratio (Eq. 5.7)',f(r.Eo,3),''],['Qs flow outside gutter',f(r.Qs,3),'cfs']);
  if(g.type!=='uniform'&&g.type!=='composite')R.push(['Equivalent Sx (Eq. 5.9)',f(r.SxEff,4),'ft/ft']);
  E.push(g.type==='uniform'?`Uniform gutter, HEC-22 Eq. 5.2: Q = (0.56/n)·Sx<sup>1.67</sup>·SL<sup>0.5</sup>·T<sup>2.67</sup>; solved for T it is Eq. 5.4 (TxDOT HDM Eq. 10-3/10-4, same equation with z = 0.56 and 1.24).`:'');
  if(g.type==='composite')E.push(`Composite gutter: Sw = Sx + a/W = ${f(g.Sx,3)} + ${f(g.a/12,3)}/${g.W} = ${f(r.Sw,4)} (Eq. 5.8).`,`Flow outside the gutter Qs uses Eq. 5.2 on width Ts = T − W = ${f(r.T-g.W)} ft → Qs = ${f(r.Qs,3)} cfs.`,`Eo = 1/{1 + (Sw/Sx)/[(1 + (Sw/Sx)/(T/W − 1))<sup>2.67</sup> − 1]} = ${f(r.Eo,3)} (Eq. 5.7); Q = Qs/(1 − Eo) = ${f(r.Q,3)} cfs. ${s.inp==='Q'?'T is found by iterating T until Q matches (the book does the same by trial on Qs).':''}`);
  if(g.type==='v')E.push(`V swale: Sx = Sx1·Sx2/(Sx1+Sx2) = ${f(r.SxEff,4)} (Eq. 5.9), then Eq. 5.2/5.4 with that Sx; T is the full top width.`);
  if(g.type==='v3'){const v=r.v3;E.push(`Try all flow inside the V: Sx = ${f(DR.vSx(g),4)} (Eq. 5.9). V width TAC = TBC·Sx2/Sx1 + TBC = ${f(v.TAC)} ft.`,v.inV?'Spread stays inside the V; done.':`Spread exceeds the V, so (HEC-22 Example 5.3) weight Sx2 over TBC and Sx3 over the rest of the spread, recompute Sx with Eq. 5.9 and iterate until T converges: Sx = ${f(v.Sx,4)}, T = ${f(v.T)} ft.`);}
  E.push(`Depth at curb d = ${g.type==='composite'?'T·Sx + a':'T·Sx'} = ${f(r.d,3)} ft; V = Q/A${g.type==='uniform'?' (HEC-22 Eq. 5.3 for uniform section)':''} = ${f(r.V)} ft/s.`);
  const Sxd=g.type==='uniform'||g.type==='composite'?g.Sx:r.SxEff;svg=svgGutter(r.T,Sxd,g.type==='composite'?{W:g.W,a:g.a/12}:{});ttl='Gutter cross section (not to scale vertically)';refs=REF.g;}
 if(mode==='grade'){const g={type:'uniform',n:s.n,SL:s.SL,Sx:s.Sx},gr={W:s.gw,L:s.gl,Vo:s.Vo},c={L:s.cl,a:s.ca,W:s.cw,method:s.meth};let r;
  if(s.it==='grate'){r=DR.grateGrade(g,s.Q,gr);
   R=[['Spread at inlet T',f(r.T),'ft'],['Velocity V (Eq. 5.3)',f(r.V),'ft/s'],['Frontal flow ratio Eo (Eq. 7.3)',f(r.Eo,3),''],['Frontal efficiency Rf (Eq. 7.5)',f(r.Rf,3),''],['Side efficiency Rs (Eq. 7.6)',f(r.Rs,3),''],['Intercepted Qi (Eq. 7.7)',f(r.Qi,3),'cfs'],['Bypass',f(r.Qb,3),'cfs'],['Efficiency E',f(r.E*100,1),'%']];
   E=[`Spread at the inlet from Eq. 5.4: T = ${f(r.T)} ft; velocity V = ${f(r.V)} ft/s (Eq. 5.3).`,`Frontal flow ratio Eo = 1 − (1 − W/T)<sup>2.67</sup> = ${f(r.Eo,3)} (Eq. 7.3).`,`Rf = 1 − 0.09(V − Vo) = 1 − 0.09(${f(r.V)} − ${s.Vo}) ${1-0.09*(r.V-s.Vo)>1?'> 1 → Rf = 1.0':'= '+f(r.Rf,3)} (Eq. 7.5). Vo is read from HEC-22 Figure 7.8.`,`Rs = 1/[1 + 0.15V<sup>1.8</sup>/(Sx·L<sup>2.3</sup>)] = ${f(r.Rs,3)} (Eq. 7.6).`,`Qi = Q[Rf·Eo + Rs(1 − Eo)] = ${s.Q}·[${f(r.Rf,3)}·${f(r.Eo,3)} + ${f(r.Rs,3)}·${f(1-r.Eo,3)}] = ${f(r.Qi,3)} cfs (Eq. 7.7). Bypass ${f(r.Qb,3)} cfs carries to the next inlet.`];
   svg=svgGutter(r.T,s.Sx,{});}
  else if(s.it==='curb'){r=DR.curbGrade(g,s.Q,c);
   R=[['Spread at inlet T',f(r.T),'ft'],['Eo (depressed section)',r.Eo==null?'— (undepressed)':f(r.Eo,3),''],['Equivalent slope Se',f(r.Se,4),'ft/ft'],['Length for 100% capture LT',f(r.LT),'ft'],['L / LT',f(s.cl/r.LT,3),''],['Efficiency E (Eq. 7.13)',f(r.E*100,1),'%'],['Intercepted Qi',f(r.Qi,3),'cfs'],['Bypass / carryover',f(r.Qb,3),'cfs']];
   E=[s.meth==='TxDOT'?`Spread from TxDOT HDM Eq. 10-1/10-2 (uniform gutter): y = ${f(r.tx.y,3)} ft, T = y/Sx = ${f(r.T)} ft.`:`Spread at the inlet: ${s.ca>0?'composite gutter with the local depression (HEC-22 Eq. 5.7/5.8, iterated as in Example 5.2B)':'uniform gutter Eq. 5.4'}: T = ${f(r.T)} ft.`];
   if(s.ca>0)E.push(s.meth==='TxDOT'?`Conveyance split (Eq. 10-6…10-10): Aw = ${f(r.tx.Aw,3)} ft², Pw = ${f(r.tx.Pw,3)} ft, A0 = ${f(r.tx.A0,3)} ft², P0 = ${f(r.tx.P0,2)} ft; Kw = ${f(r.tx.Kw,1)}, K0 = ${f(r.tx.K0,1)}; Eo = Kw/(Kw+K0) = ${f(r.Eo,3)} (Eq. 10-5).`:`Eo = ${f(r.Eo,3)} from Eq. 5.7 in the depressed section.`,`Se = Sx + (a/W)·Eo = ${s.Sx} + (${f(s.ca/12,4)}/${s.cw})·${f(r.Eo,3)} = ${f(r.Se,4)} (HEC-22 Eq. 7.11 / TxDOT Eq. 10-11).`);
   E.push(`LT = 0.6·Q<sup>0.42</sup>·SL<sup>0.3</sup>·(1/(n·${s.ca>0?'Se':'Sx'}))<sup>0.6</sup> = ${f(r.LT)} ft (HEC-22 Eq. 7.10/7.12; TxDOT Eq. 10-12).`,s.cl>=r.LT?`L = ${s.cl} ft ≥ LT → full interception.`:`E = 1 − (1 − L/LT)<sup>1.8</sup> = ${f(r.E,3)} (Eq. 7.13); carryover Qco = Q(1 − L/LT)<sup>1.8</sup> = ${f(r.Qb,3)} cfs (TxDOT Eq. 10-13).`);
   if(s.cl>=10)E.push('<span class="warn">Note: HEC-22 4th ed. cites FHWA (2022a) research indicating Eq. 7.10 can overestimate interception for long curb openings (about 10 ft and longer). Use judgment.</span>');
   svg=svgGutter(r.T,s.Sx,s.ca>0?{W:s.cw,a:s.ca/12}:{});}
  else{r=DR.comboGrade(g,s.Q,c,gr);
   R=[['Curb length upstream of grate',f(r.Lc),'ft'],['Curb part intercepted',r.curb?f(r.curb.Qi,3):'0','cfs'],['Flow reaching grate',f(r.Qg,3),'cfs'],['Grate Eo / Rf / Rs',`${f(r.grate.Eo,3)} / ${f(r.grate.Rf,2)} / ${f(r.grate.Rs,3)}`,''],['Grate intercepted',f(r.grate.Qi,3),'cfs'],['Total Qi',f(r.Qi,3),'cfs'],['Bypass',f(r.Qb,3),'cfs'],['Efficiency',f(r.E*100,1),'%']];
   E=[r.Lc>0?`Sweeper combination (HEC-22 Example 7.4): only the curb length upstream of the grate counts, L = ${s.cl} − ${s.gl} = ${f(r.Lc)} ft. Curb part (Eq. 7.10–7.13): LT = ${f(r.curb.LT)} ft, E = ${f(r.curb.E,3)}, Qic = ${f(r.curb.Qi,3)} cfs.`:'Curb opening equal in length to the grate: HEC-22 neglects the curb opening on grade, so capacity = grate alone.',
    `Flow reaching the grate Qg = ${f(r.Qg,3)} cfs; spread there T = ${f(r.grate.T)} ft${s.ca>0?' in the depressed (composite) section, Eo from Eq. 5.7':''}; V = Q/A = ${f(r.grate.V)} ft/s.`,`Grate (Eq. 7.5–7.9): Rf = ${f(r.grate.Rf,2)}, Rs = ${f(r.grate.Rs,3)}, Qig = ${f(r.grate.Qi,3)} cfs. Total Qi = ${f(r.Qi,3)} cfs.`];
   svg=svgGutter(r.grate.T||0.01,s.Sx,s.ca>0?{W:s.cw,a:s.ca/12}:{});}
  K=kpi('Intercepted Qi',f(r.Qi,2),'cfs',`${f(r.E*100,0)}% of ${s.Q} cfs · bypass ${f(r.Qb,2)} cfs`,1)+kpi('Bypass',f(r.Qb,2),'cfs')+kpi('Approach spread',f(r.T!=null?r.T:DR.gutterT(s.Q,g)),'ft');ttl='Gutter at the inlet';refs=REF.i;}
 if(mode==='sag'){let r;
  if(s.it==='grate'){r=DR.grateSag(s.Q,{W:s.gw,L:s.gl,ratio:s.ratio,clog:s.clog},s.Sx,s.Sw);
   K=kpi('Depth at curb',f(r.dCurb,3),'ft',`spread ${f(r.T)} ft · ${r.regime} controls`,1)+kpi('Spread T',f(r.T),'ft')+kpi('Avg depth over grate',f(r.d,3),'ft');
   R=[['Effective perimeter P',f(r.P,2),'ft'],['Effective open area Ag',f(r.Ag,2),'ft²'],['Weir depth (Eq. 7.14)',f(r.dw,3),'ft'],['Orifice depth (Eq. 7.15)',f(r.dor,3),'ft'],['Controlling',r.regime,''],['Depth at curb',f(r.dCurb,3),'ft'],['Spread T',f(r.T),'ft']];
   E=[`Clogging ${s.clog*100}% from the curb side: P = L + (1 − c)·2W = ${f(r.P)} ft (as in HEC-22 Example 7.5); Ag = L·W·ratio·(1 − c) = ${f(r.Ag,2)} ft².`,`Weir: d = [Q/(0.37·√(2g)·P)]<sup>2/3</sup> = ${f(r.dw,3)} ft (Eq. 7.14). Orifice: d = [Q/(0.67·Ag)]²/(2g) = ${f(r.dor,3)} ft (Eq. 7.15).`,`HEC-22 7.3.3: use the higher depth → ${r.regime}, average depth over grate ${f(r.d,3)} ft.`,`Depth at curb = d + (W/2)·Sw = ${f(r.dCurb,3)} ft; spread T = d<sub>curb</sub>/Sx = ${f(r.T)} ft (TxDOT Eq. 10-2).`];
   svg=svgGutter(r.T,s.Sx,{});}
  else if(s.it==='curb'){const c={L:s.cl,h:s.h,a:s.ca,W:s.cw,throat:s.throat,theta:s.theta};
   if(s.inp==='T'){const d=s.Tg*s.Sx;r=DR.curbSagCap(d,c);
    K=kpi('Inlet capacity Qi',f(r.Qi,2),'cfs',`at spread ${s.Tg} ft (d ${f(d,3)} ft) · ${r.regime}`,1)+kpi('Depth at curb di',f(r.di,3),'ft')+kpi('Regime',r.regime,'');
    R=[['Depth from cross slope d = T·Sx',f(d,3),'ft'],['Depth at curb di = d + a',f(r.di,3),'ft'],['Weir capacity',f(r.Qw,3),'cfs'],['Orifice capacity',f(r.Qo,3),'cfs'],['Regime (h = '+s.h+' ft)',r.regime,''],['Capacity Qi',f(r.Qi,3),'cfs']];
    E=[`d = T·Sx = ${f(d,3)} ft; di = d + a = ${f(r.di,3)} ft; opening height h = ${s.h} ft.`,r.dep?`Depressed, L ≤ 12 ft: Qi = 0.29·√(2g)·(L + 1.8W)·d<sup>1.5</sup> = ${f(r.Qw,3)} cfs (HEC-22 Eq. 7.17; TxDOT Eq. 10-14 with Cw = 2.3).`:`Undepressed (or L > 12 ft): Qi = 0.37·√(2g)·L·d<sup>1.5</sup> = ${f(r.Qw,3)} cfs (HEC-22 Eq. 7.16; TxDOT Cw 3.0).`,`Orifice: Qi = 0.67·L·h·√(2g·do) = ${f(r.Qo,3)} cfs (Eq. 7.19).`,`Weir if di ≤ h, orifice if di ≥ 1.4h, otherwise the lower of the two (HEC-22 7.3.2; TxDOT): ${r.regime} → Qi = ${f(r.Qi,3)} cfs.`];
    svg=svgGutter(s.Tg,s.Sx,s.ca>0?{W:s.cw,a:s.ca/12}:{});}
   else{r=DR.curbSagDepth(s.Q,c);const T=r.d/s.Sx;
    K=kpi('Depth at curb di',f(r.di,3),'ft',`spread ${f(T)} ft · ${r.regime}`,1)+kpi('Spread T',f(T),'ft')+kpi('Regime',r.regime,'');
    R=[['Weir depth (curb) di',f(r.diW,3),'ft'],['Orifice head do',f(r.do,3),'ft'],['Orifice depth di',f(r.diO,3),'ft'],['Regime',r.regime,''],['Depth at curb di',f(r.di,3),'ft'],['Depth from cross slope d',f(r.d,3),'ft'],['Spread T = d/Sx',f(T),'ft']];
    E=[r.dep?`Weir (depressed, Eq. 7.17): d = [Q/(0.29·√(2g)·(L + 1.8W))]<sup>2/3</sup> = ${f(r.dW,3)} ft, di = d + a = ${f(r.diW,3)} ft.`:`Weir (Eq. 7.16): d = [Q/(0.37·√(2g)·L)]<sup>2/3</sup> = ${f(r.dW,3)} ft.`,`Orifice (Eq. 7.19): do = [Q/(0.67·L·h·√(2g))]² = ${f(r.do,3)} ft; di = do + ${s.throat==='inclined'?'(h/2)·sin θ (TxDOT Eq. 10-17)':'h/2'} = ${f(r.diO,3)} ft.`,`di ≤ h → weir; di ≥ 1.4h → orifice; between → higher depth (conservative): ${r.regime}, di = ${f(r.di,3)} ft, spread ${f(T)} ft.`];
    svg=svgGutter(T,s.Sx,s.ca>0?{W:s.cw,a:s.ca/12}:{});}}
  else if(s.it==='combo'){r=DR.comboSag(s.Q,{W:s.gw,L:s.gl,ratio:s.ratio},{L:s.cl,h:s.h,a:0},s.Sx);
   K=kpi('Depth at curb (clear grate)',f(r.clear,3),'ft',`spread ${f(r.Tclear)} ft · grate clogged: ${f(r.clog.di,3)} ft / ${f(r.Tclog)} ft`,1)+kpi('Spread (clear)',f(r.Tclear),'ft')+kpi('Spread (grate clogged)',f(r.Tclog),'ft');
   R=[['Grate perimeter P = L + 2W',f(r.P),'ft'],['Grate weir avg depth',f(r.dav,3),'ft'],['→ depth at curb',f(r.dcW,3),'ft'],['Grate + curb orifice depth at curb',f(r.dOr,3),'ft'],['Design depth (clear), '+r.regime,f(r.clear,3),'ft'],['Spread (clear)',f(r.Tclear),'ft'],['Grate 100% clogged: curb alone di ('+r.clog.regime+')',f(r.clog.di,3),'ft'],['Spread (clogged)',f(r.Tclog),'ft']];
   E=[`Grate weir controls with the grate clear (HEC-22 7.3.4): davg = [Q/(0.37·√(2g)·P)]<sup>2/3</sup> = ${f(r.dav,3)} ft; depth at curb = davg + Sx·W/2 = ${f(r.dcW,3)} ft.`,`Checked against both openings in orifice flow (sum of Eq. 7.15 and 7.19): ${f(r.dOr,3)} ft. Higher depth used: ${f(r.clear,3)} ft, T = ${f(r.Tclear)} ft.`,`Grate fully clogged → curb opening alone (Eq. 7.16/7.19): weir di ${f(r.clog.diW,3)} ft, orifice di = do + h/2 = ${f(r.clog.do,3)} + ${f(s.h/2,3)} = ${f(r.clog.diO,3)} ft; ${r.clog.regime} → ${f(r.clog.di,3)} ft, T = ${f(r.Tclog)} ft.`];
   svg=svgGutter(r.Tclear,s.Sx,{});}
  else{const w=s.sw/12;r=DR.slotSag(s.Q,s.sl,w);const T=r.d/s.Sx;
   K=kpi('Depth at slot',f(r.d,3),'ft',`spread ${f(T)} ft · ${r.dw>=r.dor?'weir':'orifice'} controls`,1)+kpi('Spread T',f(T),'ft');
   R=[['Weir depth (Eq. 7.20, Cw 0.31)',f(r.dw,3),'ft'],['Orifice depth (Eq. 7.21, Co 0.8)',f(r.dor,3),'ft'],['Design depth (higher)',f(r.d,3),'ft'],['Spread T',f(T),'ft']];
   E=[`Weir: d = [Q/(0.31·√(2g)·L)]<sup>2/3</sup> = ${f(r.dw,3)} ft. Orifice: d = [Q/(0.8·L·w)]²/(2g) = ${f(r.dor,3)} ft.`,'HEC-22 7.3.3: use the higher depth. Slotted drains in sags clog easily; HEC-22 advises generally avoiding them there.'];
   svg=svgGutter(T,s.Sx,{});}
  ttl='Ponding at the sag inlet';refs=REF.i;}
 if(mode==='chan'){const ch={B:s.B,z1:s.z1,z2:s.z2,n:s.n,S:s.S};const r=s.inp==='d'?DR.chanQ(s.d,ch):DR.chanDepth(s.Q,ch);const dc=DR.chanCrit(r.Q,ch);
  K=kpi(s.inp==='d'?'Capacity Q':'Normal depth',s.inp==='d'?f(r.Q,1):f(r.d,3),s.inp==='d'?'cfs':'ft',`V ${f(r.V)} ft/s · Fr ${f(r.Fr)}`,1)+kpi('Velocity',f(r.V),'ft/s')+kpi('Froude',f(r.Fr),r.Fr<1?'subcritical':'supercritical');
  R=[['Depth d',f(r.d,3),'ft'],['Area A = Bd + ½(z1+z2)d²',f(r.A,2),'ft²'],['Wetted perimeter P',f(r.P,2),'ft'],['Hydraulic radius R',f(r.R,3),'ft'],['Top width',f(r.Tw,2),'ft'],['Flow Q',f(r.Q,2),'cfs'],['Velocity V',f(r.V,2),'ft/s'],['Froude number',f(r.Fr,2),''],['Critical depth',f(dc,3),'ft']];
  E=[`Geometry (HEC-22 Eq. 6.7–6.9): A = ${f(r.A,2)} ft², P = B + d(√(z1²+1) + √(z2²+1)) = ${f(r.P,2)} ft, R = A/P = ${f(r.R,3)} ft.`,`Manning (HEC-22 Eq. 6.5; TxDOT HDM Eq. 6-3): Q = (1.486/n)·A·R<sup>2/3</sup>·S<sup>1/2</sup> = ${f(r.Q,2)} cfs${s.inp==='Q'?' — depth found by iteration (TxDOT: "an indirect solution … is necessary")':''}.`,`V = Q/A = ${f(r.V,2)} ft/s; Froude = V/√(gA/T<sub>w</sub>) = ${f(r.Fr,2)}; critical depth ${f(dc,3)} ft.`,'Check lining stability (shear/velocity) separately — not covered by this tool.'];
  const sc=Math.min(700/Math.max(r.Tw*1.3,1),140/Math.max(r.d*1.4,0.5)),cx=450,yb=185,top=r.d*1.4,L=x=>cx+x*sc;
  const p=[[-s.B/2-s.z1*top,top],[-s.B/2,0],[s.B/2,0],[s.B/2+s.z2*top,top]],w=[[-s.B/2-s.z1*r.d,r.d],[-s.B/2,0],[s.B/2,0],[s.B/2+s.z2*r.d,r.d]];
  svg=`<polygon points="${w.map(([x,y])=>`${L(x)},${yb-y*sc}`).join(' ')}" fill="#9cc9f0" stroke="#1f77b4"/><polyline points="${p.map(([x,y])=>`${L(x)},${yb-y*sc}`).join(' ')}" fill="none" stroke="#333" stroke-width="3"/><text x="${cx}" y="${yb-r.d*sc-8}" font-size="15" text-anchor="middle" fill="#c0392b">d = ${f(r.d,2)} ft · Q = ${f(r.Q,1)} cfs</text><text x="${cx}" y="${yb+16}" font-size="13" text-anchor="middle">B = ${s.B} ft · ${s.z1}H:1V / ${s.z2}H:1V</text>`;
  ttl='Channel section';refs=REF.c;}
 }catch(e){K=kpi('Error','—','',e.message);}
 $('#summary').innerHTML=K;$('#table').innerHTML=tbl(R);$('#explain').innerHTML='<ol>'+E.filter(Boolean).map(x=>`<li>${x}</li>`).join('')+'</ol>';$('#xs').innerHTML=svg;$('#sxT').textContent=ttl;
 $('#refs').innerHTML=`<b>Sources:</b> ${refs}<br>US customary units. Engineering aid — verify with your own judgment and the governing agency criteria.`;}
function full(){form();render();}
$('#form').addEventListener('input',e=>{const k=e.target.dataset.v;if(!k||e.target.tagName==='SELECT')return;const v=parseFloat(e.target.value);if(isFinite(v)){S[mode][k]=v;render();const w=e.target.closest('.f'),old=w.querySelector('.warn');if(old)old.remove();w.insertAdjacentHTML('beforeend',warn(w.dataset.k==='n'&&mode==='chan'?'cn':w.dataset.k,v));}});
$('#form').addEventListener('change',e=>{if(e.target.id==='ex'){const x=EX[+e.target.value];if(x){Object.assign(S[mode],x.s);full();}return;}const k=e.target.dataset.v;if(k&&e.target.tagName==='SELECT'){S[mode][k]=e.target.value;full();}});
$('#form').addEventListener('click',e=>{if(e.target.classList.contains('i')){e.preventDefault();e.target.closest('.f').classList.toggle('open');}});
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));full();});
full();
