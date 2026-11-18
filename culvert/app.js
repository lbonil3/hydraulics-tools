const C=window.Culvert;const $=s=>document.querySelector(s);
const U={US:{L:'ft',Q:'cfs',V:'ft/s'},SI:{L:'m',Q:'m³/s',V:'m/s'}};
// Each field: id, step, label, unit type, default US/SI, help text, source, typical range [min,max] (US,SI), diagram highlight
const F=[
 ['invIn','Site','Inlet invert elevation','L',[100,30.48],'Elevation of the culvert bottom (flowline) at the upstream end.','Plans profile sheet or topographic survey of the channel flowline.',null,'invin'],
 ['invOut','Site','Outlet invert elevation','L',[98,29.87],'Elevation of the culvert bottom at the downstream end. Slope = (inlet − outlet) ÷ length.','Plans or survey. Usually follows the natural streambed slope.',null,'invout'],
 ['length','Site','Culvert length','L',[200,61],'Length of the barrel measured along the flowline, end to end.','Plans: roadway width + side slopes. Often 40–300 ft.',[20,500,6,150],'length'],
 ['allowHW','Site','Allowable headwater elevation','L',[108,32.9],'Highest water level you can accept upstream (e.g., road shoulder minus freeboard, or a building floor).','Design criteria in agency drainage manual; roadway plans.',null,'allow'],
 ['shape','Culvert','Barrel shape','sel',['circular'],'All barrel shapes offered by FHWA HY-8 8.0: circular, box, elliptical, pipe arch, open-bottom arches, metal box, concrete open-bottom arch, South Dakota box, or your own x-y outline.','Product selection / existing structure inspection.',null,'barrel'],
 ['size','Culvert','Standard size (HY-8 catalog)','sel',[''],'Standard sizes from the HY-8 8.0 shape database for the chosen shape and material (span × rise). The geometry, area and default Manning n come from the catalog.','Manufacturer catalog / plans. Pick the nominal size.',null,'xs'],
 ['span','Culvert','Span (inside width)','L',[6,1.83],'Inside width of a box culvert (concrete or South Dakota box). Set by the catalog size for other shapes; ignored for circular pipes.','Plans or standard box sizes (3–12 ft).',[2,20,0.6,6],'xs'],
 ['rise','Culvert','Rise / diameter (D)','L',[5,1.52],'Inside height of a box, or inside diameter of a pipe. All HW/D ratios use this.','Plans, manufacturer catalog. Pipes 1.5–12 ft typical.',[1,15,0.3,4.5],'xs'],
 ['barrels','Culvert','Number of barrels','int',[1,1],'Identical barrels side by side. Flow is split equally.','Plans. 1–4 typical.',[1,6,1,6],'xs'],
 ['material','Culvert','Material (sets Manning n)','sel',['concrete'],'Roughness of the barrel wall. Concrete and the Chart 6 CMP value stay 0.012 and 0.024. CMP can also follow corrugation and diameter. For HY-8 shapes the list and n come from the HY-8 database.','HDS-5 Appendix B Table B.1 and Chart 6; HEC-RAS Table 6-2 for helical CMP by diameter.',null,'barrel'],
 ['corrugation','Culvert','CMP corrugation','sel',['ann_2_5'],'Corrugation used to pick Manning n for circular CMP. Annular 2⅔×½ in stays at the Chart 6 value 0.024. Helical 2⅔×½ in varies with diameter.','HDS-5 Appendix B and §B.4.2; diameter rows from USACE HEC-RAS Table 6-2.',null,'barrel'],
 ['n','Culvert','Manning n','num',[0.012,0.012],'Friction coefficient used in outlet-control losses. Edit for a custom value.','HDS-5 Table 3.1. Range 0.009–0.033.',[0.009,0.035,0.009,0.035],'barrel'],
 ['blockage','Culvert','Debris blockage (0 = off)','num',[0,0],'Percent of the opening treated as blocked (HEC-9 screening). Hydraulics use the design flow through the open fraction, Q/(1 − blockage/100). Leave 0 unless you are screening debris.','FHWA HEC-9 (3rd ed., 2005).',[0,50,0,50],'xs'],
 ['nBed','Culvert','Manning n of open bottom (streambed)','num',[0.035,0.035],'Open-bottom shapes have a natural streambed floor. HY-8 asks for its own n; a composite n (Horton: equal velocity in each part) is used for the wet perimeter.','Streambed material: gravel 0.025–0.035, cobbles 0.035–0.05.',[0.015,0.07,0.015,0.07],'barrel'],
 ['udPoly','Culvert','User-defined shape: x, y per line (closed outline)','txt',['0, 0\n8, 0\n8, 3\n6.5, 4.5\n1.5, 4.5\n0, 3','0, 0\n2.44, 0\n2.44, 0.91\n1.98, 1.37\n0.46, 1.37\n0, 0.91'],'Inside outline of the barrel, points in order around the shape (x across, y up from the invert). The polygon closes itself. Rise and span are taken from the outline.','Shop drawings or field measurements. 6–40 points is typical.',null,'xs'],
 ['inlet','Inlet','Inlet configuration','sel',[''],'How the upstream end is built. Sets the HDS-5 inlet-control coefficients (K, M, c, Y) and the entrance loss coefficient Ke.','Plans / standard drawings, or field inspection of the inlet.',null,'inlet'],
 ['taperType','Inlet','Tapered inlet (HDS-5 §3.4)','sel',['none'],'Side-tapered: enlarged face with flared side walls. Slope-tapered: also drops the throat below the streambed. Both move control to the efficient throat; Ke = 0.2. Circular barrels use Chart 55/56 (side) or a rectangular slope-tapered face (Chart 59) with the circular throat checked.','Plans / standard drawings of the inlet structure.',null,'inlet'],
 ['taperEdge','Inlet','Tapered inlet face edges','sel',['less'],'Less favorable: square edges, 26°–90° wingwalls. More favorable: bevelled edges or 15°–26° wingwalls (HDS-5 Table A.1).','Plans / standard drawings.',null,'inlet'],
 ['taperBf','Inlet','Face width Bf','L',[9,2.74],'Width of the enlarged face (wider than the barrel span). Increase until the throat controls.','Plans; HDS-5 tapered inlet design form.',null,'inlet'],
 ['taperRatio','Inlet','Side taper (_:1)','num',[4,4],'Wall length per unit of flare, 4:1 to 6:1.','Plans.',[4,6,4,6],'inlet'],
 ['taperSt','Inlet','Depression slope St (_:1)','num',[2,2],'Slope of the floor between face and throat, 2:1 to 3:1 (slope-tapered only).','Plans.',[2,3,2,3],'inlet'],
 ['taperT','Inlet','Throat depression T','L',[2,0.61],'Streambed at the face minus throat invert (slope-tapered only). The barrel inlet invert above is the throat invert.','Plans.',null,'inlet'],
 ['bendDeg','Inlet','Bend angle (deg, 0 = straight)','num',[0,0],'Horizontal bend in the barrel. 0 ignores bend loss. Table 5.1 covers 22.5°, 45° and 90° at R/D of 1, 2, 4, 6 and 8; other values are interpolated and flagged.','HDS-5 §5.2.3 Table 5.1 (full-flow conduits).',[0,90,0,90],'inlet'],
 ['bendRD','Inlet','Bend radius / diameter','num',[1,1],'Centerline radius of the bend divided by the barrel rise. Used with Table 5.1.','HDS-5 Table 5.1.',[1,8,1,8],'inlet'],
 ['Kj','Inlet','Junction loss Kj (0 = none)','num',[0,0],'Extra loss Hj = Kj·V²/2g added with the bend loss in outlet control. HDS-5 §5.2.4 does not publish a Kj; it points to HEC-22. Enter a coefficient you computed, or leave 0.','HDS-5 §5.2.4; FHWA HEC-22 for the junction itself.',[0,2,0,2],'inlet'],
 ['skewDeg','Inlet','Inlet skew (deg from normal)','num',[0,0],'Angle from the culvert face to a line normal to the barrel. HDS-5 says the effect is small and is already in Charts 11 and 12. This angle is reported either way.','HDS-5 §5.4.2.',[0,45,0,45],'inlet'],
 ['skewApply','Inlet','Apply Table 5.2a skew screening?','sel',['off'],'Optional. Scales the inlet-control discharge by the 6×6 ft box, Chart 11 capacity ratio in HDS-5 Table 5.2a. Off by default because that table is not a general coefficient.','HDS-5 Table 5.2a.',null,'inlet'],
 ['cover','Site','Cover over crown (0 = unknown)','L',[0,0],'Fill from the outside crown to the finished grade. Negative cover means the crown sticks out of the fill. 0 means you have not entered it.','Roadway typical section. HDS-5 §5.5.2 names the concern and does not give one cover depth.',[-2,30,-0.6,9],'embank'],
 ['freeboard','Site','Freeboard below road crest (0 = not applied)','L',[0,0],'Extra depth required between the design headwater and the road crest when auto-sizing. 0 does not apply a freeboard test. TxDOT publishes no culvert freeboard number.','Project drainage criteria.',[0,3,0,1],'road'],
 ['minCover','Site','Minimum cover required (0 = not applied)','L',[0,0],'Project minimum fill over the crown, used by auto-size and the TxDOT panel. 0 does not apply a numeric cover test. The TxDOT HDM culvert chapter gives no single cover depth.','District or project criteria.',[0,10,0,3],'embank'],
 ['Q','Flows','Design discharge','Q',[300,8.5],'Peak flow the culvert must pass (e.g., 25-yr or 50-yr storm).','Hydrology report (Rational method, USGS regression, TR-55, HEC-HMS).',[1,5000,0.03,140],'hw'],
 ['Qcheck','Flows','Check flood discharge (1% AEP, 100-yr)','Q',[0,0],'TxDOT HDM Ch. 4 §6: "All facilities must be evaluated to the 1% AEP flood event." Enter the 100-yr peak flow to see headwater, overtopping and outlet velocity at that flow. 0 = skip.','Hydrology report, or send it from the Rational Method tool (same county IDF, Tc and C at the 1% AEP intensity).',null,'hw'],
 ['Qmin','Flows','Rating curve minimum flow','Q',[30,0.85],'Lowest flow plotted on the performance curve.','Your choice; often 10% of design.',null,'hw'],
 ['Qmax','Flows','Rating curve maximum flow','Q',[450,12.7],'Highest flow plotted (often 1.5× design, to check the 100-yr / check flood).','Hydrology report or your choice.',null,'hw'],
 ['sedOn','Flows','Low-flow sediment check','sel',['off'],'Off by default. When on, the outlet velocity at the sediment-check discharge is compared with the TxDOT 3 ft/s minimum.','TxDOT HDM Ch. 8 §2. Not a sediment-transport model.',null,'hw'],
 ['Qsed','Flows','Sediment-check discharge (0 = 10% of design)','Q',[0,0],'Low flow used for the self-cleansing check. 0 uses 10% of the design discharge.','A frequent flow, or about 10% of the design peak.',null,'hw'],
 ['fishOn','Flows','Fish / aquatic-organism passage check','sel',['off'],'Off by default. When on, barrel velocity and depth at the fish-passage flow are compared with the screening limits (2 ft/s and 0.5 ft). Those limits are not a species design.','FHWA HEC-26 (2010) hydraulic option. USFS stream simulation is not computed.',null,'hw'],
 ['Qfish','Flows','Fish-passage discharge','Q',[0,0],'Discharge at which passage is judged. Required when the fish check is on.','Agency high or low passage flow (HEC-26). Often well below the design flood.',null,'hw'],
 ['twMode','Tailwater','Tailwater condition','sel',['const'],'Water level downstream that can back up into the culvert. "None" = free outfall.','Hydraulic model of the downstream channel, normal-depth calc, or a known pond/river level.',null,'tw'],
 ['twElev','Tailwater','Tailwater elevation','L',[101.5,30.94],'Water surface elevation just downstream of the outlet at the design flow.','Downstream channel normal-depth calc (Manning) or a HEC-RAS model.',null,'tw'],
 ['chB','Tailwater','Channel bottom width','L',[10,3.05],'Bottom width of the downstream channel (rectangular or trapezoidal).','Survey / plans typical section of the outfall channel.',null,'tw'],
 ['chZ1','Tailwater','Left side slope (H:V)','num',[2,2],'Horizontal run per 1 vertical on the left bank (e.g., 2 = 2H:1V). Trapezoidal and triangular channels.','Survey / plans. 2:1 to 4:1 typical.',[0,10,0,10],'tw'],
 ['chZ2','Tailwater','Right side slope (H:V)','num',[2,2],'Horizontal run per 1 vertical on the right bank.','Survey / plans.',[0,10,0,10],'tw'],
 ['chS','Tailwater','Channel slope','num',[0.005,0.005],'Longitudinal slope of the downstream channel (ft/ft). Normal depth assumes uniform flow (Manning).','Survey profile of the channel downstream of the outlet.',[0.0001,0.1,0.0001,0.1],'tw'],
 ['chN','Tailwater','Channel Manning n','num',[0.035,0.035],'Roughness of the downstream channel. Grass 0.030–0.035, natural stream 0.035–0.05, concrete 0.013–0.015.','TxDOT HDM / Chow; field inspection.',[0.01,0.15,0.01,0.15],'tw'],
 ['chInv','Tailwater','Channel invert elevation','L',[98,29.87],'Lowest elevation of the channel just downstream of the outlet (HY-8 "Channel Invert Elevation"). Usually equal to the outlet invert.','Survey.',null,'tw'],
 ['chPts','Tailwater','Irregular cross-section (station, elevation per line)','txt',['0, 104\n10, 100\n18, 98\n24, 98\n32, 100\n45, 104','0, 31.7\n3.05, 30.48\n5.49, 29.87\n7.32, 29.87\n9.75, 30.48\n13.7, 31.7'],'Surveyed cross-section of the downstream channel, left to right looking downstream. Normal depth is found with Manning on this section (single n).','Field survey or HEC-RAS cross-section.',null,'tw'],
 ['chRating','Tailwater','Rating curve (Q, tailwater elevation per line)','txt',['0, 98\n100, 100\n300, 101.8\n600, 103.2','0, 29.87\n2.83, 30.48\n8.5, 31.03\n17, 31.46'],'Known tailwater elevation versus total discharge (e.g., from a HEC-RAS model or gauge). Linearly interpolated.','Hydraulic model or gauge rating.',null,'tw'],
 ['roadOn','Roadway','Model roadway overtopping?','sel',['on'],'When the headwater rises above the road, water flows over the road like a broad-crested weir. Turning this on splits the total flow between culvert and road (as HY-8 does).','Turn on whenever the road could flood during the check storm.',null,'road'],
 ['roadMode','Roadway','Road crest described by','sel',['const'],'"Constant crest" = a flat low section of road with a single elevation and length. "Profile" = station/elevation points along the road centerline (e.g., a sag vertical curve), split into segments and summed (HDS-5 Fig. 3.12A).','Roadway plans profile sheet, or survey shots along the road crown/shoulder.',null,'road'],
 ['crestEl','Roadway','Crest elevation (low point)','L',[110,33.53],'Elevation of the lowest point of the road surface where water would first spill over (usually the shoulder or crown at the sag).','Roadway plans profile or survey of the road low point.',null,'road'],
 ['crestLen','Roadway','Crest length','L',[300,91.4],'Length along the road (perpendicular to flow) over which overtopping happens at the crest elevation.','Plans: length of the flat/sag section. Typical 50–2000 ft.',[20,3000,6,900],'road'],
 ['roadProfile','Roadway','Road profile (station, elevation per line)','txt',['0, 113\n100, 111\n200, 110\n300, 110.5\n400, 113','0, 34.44\n30.5, 33.83\n61, 33.53\n91.4, 33.68\n122, 34.44'],'Points along the road centerline, one per line: station, elevation. Each pair of points forms a segment; flow over each is computed and summed.','Plans profile sheet (PVI stations/elevations) or survey. Use 3–15 points across the sag.',null,'road'],
 ['topWidth','Roadway','Roadway top width (Lr)','L',[40,12.2],'Width of the embankment top in the direction of flow (pavement + shoulders). Used to choose deep vs shallow weir coefficients (HWr/Lr).','Typical section on roadway plans. Typical 24–150 ft.',[10,200,3,60],'road'],
 ['surface','Roadway','Road surface','sel',['paved'],'Paved or gravel changes the weir coefficient Cr (HDS-5 Fig. 3.11, from HDS-1 / HY-7). Choose "custom" to type your own Cd.','Roadway plans / site visit.',null,'road'],
 ['roadCd','Roadway','Custom weir coefficient Cd','num',[3.0,1.66],'Only used when surface = custom. Discharge coefficient in Q = Cd·L·HWr^1.5. HY-8 allows 2.5–3.095 (US).','Agency manual; 3.0 US (1.66 SI) is a common value.',[2.5,3.1,1.38,1.71],'road'],
 ['fillZ','Roadway','Embankment side slope (H:V, drawing)','num',[3,3],'Horizontal run per 1 vertical, used to draw the embankment. It does not change the hydraulics. 3 is a drawing default, not a TxDOT requirement.','Roadway typical section.',[2,6,2,6],'embank']
];
const state={units:'US',criteria:Object.assign({},C.CRITERIA),extras:[]};window.state=state;
try{const cu=localStorage.getItem('culvert.units');if(cu==='US'||cu==='SI')state.units=cu;
 const cc=JSON.parse(localStorage.getItem('culvert.criteria')||'null');if(cc&&isFinite(+cc.hwDMax))state.criteria=Object.assign({},C.CRITERIA,cc);
 const ex=JSON.parse(localStorage.getItem('culvert.extras')||'null');if(Array.isArray(ex))state.extras=ex;}catch(e){}
function savePrefs(){try{localStorage.setItem('culvert.units',state.units);localStorage.setItem('culvert.criteria',JSON.stringify({hwDMax:state.criteria.hwDMax,vExcessFt:state.criteria.vExcessFt,vMinFt:state.criteria.vMinFt}));localStorage.setItem('culvert.extras',JSON.stringify(state.extras));}catch(e){}}
function fieldSpec(){const s={};F.forEach(f=>{if(f[3]==='L')s[f[0]]='L';else if(f[3]==='Q')s[f[0]]='Q';else if(f[3]==='txt')s[f[0]]=f[0]==='chRating'?'txt:Q,L':'txt:L,L';else s[f[0]]='num';});return s;}
function readForm(){const o={};F.forEach(f=>{const e=document.getElementById(f[0]);if(e)o[f[0]]=e.value;});return o;}
function applyValues(v){['shape','material','corrugation','size','inlet','twMode','roadOn','roadMode','surface','taperType','taperEdge','skewApply','sedOn','fishOn'].forEach(id=>{const e=document.getElementById(id);if(e&&id in v){e.value=v[id];e.dispatchEvent(new Event('input',{bubbles:true}));}});
 F.forEach(f=>{const e=document.getElementById(f[0]);if(e&&f[0] in v)e.value=v[f[0]];});}
function opts(id){
 if(id==='shape')return Shapes.LIST;
 const sk=val('shape');
 if(id==='size')return Shapes.catalog(sk)&&Shapes.isHY(sk)?Shapes.sizes(sk,val('material')).map((z,i)=>['s'+i,z.l+' · A '+z.A+' ft²']):[['','— not used for this shape —']];
 if(id==='material'&&Shapes.isHY(sk))return Shapes.mats(sk).map((m,i)=>['m'+i,`${m.name} (n=${m.n}${m.nb!=null&&Shapes.DB[sk].open?', bottom '+m.nb:''})`]);
 if(id==='material')return[['concrete','Concrete (n=0.012, chart value)'],['cmp','Corrugated metal'],['spiral','Spiral rib metal (n=0.013)'],['hdpe','HDPE / PE smooth interior (n=0.012)'],['cpe','Corrugated PE (n=0.025)'],['pvc','PVC (n=0.011)'],['custom','Custom n']];
 if(id==='corrugation')return[['ann_2_5','Annular 2⅔×½ in (n=0.024, Chart 6)'],['hel_2_5','Helical 2⅔×½ in (n by diameter)'],['hel_3_1','Helical 3×1 in (n by diameter)'],['hel_6_1','Helical 6×1 in (n=0.025)'],['ann_5_1','Annular 5×1 in (n=0.026)'],['ann_3_1','Annular 3×1 in (n=0.028)'],['sp_6_2','Structural plate 6×2 in (n by diameter)'],['sp_9','Structural plate 9×2½ in (n=0.037)']];
 if(id==='skewApply')return[['off','No — report the angle only'],['on','Yes — apply the 6×6 box Table 5.2a ratio']];
 if(id==='sedOn'||id==='fishOn')return [['off','Off'],['on','On']];
 if(id==='taperType')return[['none','None (straight inlet)'],['side','Side-tapered'],['slope','Slope-tapered (vertical face)']];
 if(id==='taperEdge')return val('shape')==='circular'?[['more','Beveled face (Chart 56 scale 1 / slope-taper more favorable)'],['less','Square-edged face (Chart 56 scale 2 / slope-taper less favorable)'],['thin','Thin-edge projecting face (Chart 56 scale 3)']]:[['less','Less favorable edges (square, 26°–90° wingwalls)'],['more','More favorable edges (bevels or 15°–26° wingwalls)']];
 if(id==='roadOn')return[['on','Yes – include flow over the road'],['off','No – culvert only']];
 if(id==='roadMode')return[['const','Constant crest (one elevation)'],['profile','Roadway profile (points)']];
 if(id==='surface')return[['paved','Paved'],['gravel','Gravel'],['custom','Custom Cd']];
 if(id==='twMode')return[['const','Constant elevation'],['rect','Rectangular channel (normal depth)'],['trap','Trapezoidal channel (normal depth)'],['tri','Triangular channel (normal depth)'],['irreg','Irregular channel (x, elevation points)'],['rating','Rating curve (Q, TW elevation)'],['none','None (free outfall)']];
 if(id==='inlet'){if(Shapes.isHY(sk))return Shapes.inlets(sk,val('material')).map(i=>[i.id,`${i.name} (Ke=${i.Ke}) — HY-8`]);return C.INLETS[sk||'box'].map(i=>[i.id,/^HY-8/.test(i.chart)?`${i.name} (Ke=${i.Ke}) — HY-8 database`:`${i.name} — HDS-5 ${i.chart}`]);}
}
function val(id){const e=document.getElementById(id);if(!e)return null;return (e.tagName==='SELECT'||e.tagName==='TEXTAREA')?e.value:parseFloat(e.value)}
function roadObj(p){if(val('roadOn')!=='on')return null;let segs;
 if(val('roadMode')==='profile'){segs=val('roadProfile').split(/\n/).map(l=>l.split(/[,;\s]+/).filter(Boolean).map(Number)).filter(q=>q.length>=2&&q.every(isFinite)).map(q=>[q[0],q[1]]).sort((x,y)=>x[0]-y[0]);if(segs.length<2)return {bad:true};}
 else segs=[[0,val('crestEl')],[val('crestLen'),val('crestEl')]];
 return {segs,Lr:val('topWidth'),surface:val('surface'),Cd:val('roadCd'),twElev:p.twMode==='const'?p.twElev:null,US:state.units==='US'};}
function balQ(q,e,ro){const k=state.Qtot;state.Qtot=q;try{return C.balance(q,e,ro);}finally{state.Qtot=k;}}
function inletById(shape,id){const key=shape==='box'?'box':'circular';return (C.INLETS[key]||[]).find(i=>i.id===id)||C.INLETS[key][0];}
function groupOf(p){if(!state.extras||!state.extras.length)return null;
 const rest=state.extras.map(e=>{const shape=e.shape==='box'?'box':'circular';return {units:p.units,shape,span:+e.span,rise:+e.rise,barrels:1,length:+e.length||p.length,invIn:+e.invIn,invOut:+e.invOut,n:+e.n||p.n,inlet:inletById(shape,e.inlet),twMode:p.twMode,twElev:p.twElev};}).filter(b=>b.rise>0&&b.length>0&&b.inlet&&isFinite(b.invIn)&&isFinite(b.invOut));
 return rest.length?[Object.assign({},p,{barrels:1})].concat(rest):null;}
function solve(p){const g=groupOf(p);if(!g)return C.analyze(p);
 const sp=C.splitFlow(g,p.Q,{twMode:p.twMode,twElev:p.twElev}),main=sp.parts[0],base=main.r||C.analyze(Object.assign({},p,{barrels:1}));
 return Object.assign({},base,{EL:sp.EL,HW:sp.EL-p.invIn,crossing:sp,Q:main.Q,N:g.length});}
function elOf(Qc){return Qc<=1e-9?val('invIn'):solve(params(Qc)).EL;}
function build(){
 let h='',step='';const steps={Site:'1. Site',Culvert:'2. Culvert barrel',Inlet:'3. Inlet',Flows:'4. Flows',Tailwater:'5. Tailwater',Roadway:'6. Roadway overtopping'};
 F.forEach(f=>{ if(f[1]!==step){if(step)h+='</fieldset>';step=f[1];h+=`<fieldset><legend>${steps[step]}</legend>`;}
  const u=f[3]==='L'?U[state.units].L:f[3]==='Q'?U[state.units].Q:'';
  const inp=f[3]==='txt'?`<textarea id="${f[0]}" rows="5">${(f[4][state.units==='US'?0:1]).replace(/\\n/g,'\n')}</textarea>`:f[3]==='sel'?`<select id="${f[0]}"></select>`:`<input id="${f[0]}" type="number" inputmode="decimal" step="any" value="${f[4][state.units==='US'?0:1]??f[4][0]}">`;
  const rg=f[7]?`<br><b>Typical range:</b> ${state.units==='US'?f[7][0]+'–'+f[7][1]:f[7][2]+'–'+f[7][3]} ${u}`:'';
  h+=`<div class="f" data-hl="${f[8]}" id="f_${f[0]}"><label><span>${f[2]} ${u?'('+u+')':''}</span><span style="display:flex;gap:4px">${inp}<button class="i" type="button" title="What is this?">i</button></span></label>
  <div class="help"><b>What it is:</b> ${f[5]}<br><b>Where to get it:</b> ${f[6]}${rg}</div><div class="warn" id="w_${f[0]}"></div></div>`;});
 $('#form').innerHTML=h+'</fieldset>';
 ['shape','material','corrugation','twMode','roadOn','roadMode','surface','taperType','taperEdge','skewApply','sedOn','fishOn'].forEach(id=>fill(id));fill('inlet');
 $('#shape').value='box';fill('inlet');fill('size');$('#inlet').value='b_90';
 document.querySelectorAll('.i').forEach(b=>b.onclick=()=>b.closest('.f').classList.toggle('open'));
 document.querySelectorAll('.f').forEach(d=>{const on=()=>hl(d.dataset.hl),off=()=>hl(null);d.onmouseenter=on;d.onmouseleave=off;d.addEventListener('focusin',on);d.addEventListener('focusout',off);});
 $('#form').oninput=e=>{const id=e.target.id;
  if(id==='shape'){fill('material');fill('size');pickSize();fill('inlet');fill('taperEdge');shapeDefaults();}
  else if(id==='material'||id==='corrugation'){if(Shapes.isHY(val('shape'))){fill('size');pickSize();fill('inlet');shapeDefaults();}else syncN();}
  else if(id==='size')shapeDefaults();
  else if((id==='rise'||id==='span')&&val('material')==='cmp'&&!Shapes.isHY(val('shape')))syncN();
  if(id==='n'&&!Shapes.isHY(val('shape')))$('#material').value='custom';run();};
 shapeVis();criteriaBox();if(window.Barrels)Barrels.draw();
}
// Shape-specific defaults & field visibility
function pickSize(){const k=val('shape');if(!Shapes.catalog(k)||!Shapes.isHY(k))return;const L=Shapes.sizes(k,val('material'));let b=0;L.forEach((z,i)=>{if(Math.abs(Math.log(z.A/32))<Math.abs(Math.log(L[b].A/32)))b=i;});$('#size').value='s'+b;}
function syncN(){const mat=val('material');if(!mat||mat==='custom'||Shapes.isHY(val('shape')))return;
 if(mat==='cmp'){const rise=+val('rise')||0, Din=rise*(state.units==='US'?12:39.3701)||48; const m=C.manningN({material:'cmp',corrugation:val('corrugation')||'ann_2_5',Din}); const e=$('#n'); if(e)e.value=+m.n.toFixed(4); return;}
 const m=C.manningN({material:mat}); const e=$('#n'); if(e&&m)e.value=m.n;}
function shapeDefaults(){const k=val('shape');if(!Shapes.isHY(k)){syncN();shapeVis();return;}
 const m=Shapes.mat(k,val('material')),z=Shapes.catalog(k)?Shapes.size(k,val('material'),val('size')):null,si=state.units==='SI'?0.3048:1;
 $('#n').value=(z&&z.n)||m.n; if(m.nb!=null&&Shapes.DB[k].open)$('#nBed').value=m.nb;
 if(z){$('#span').value=+(z.s*si).toFixed(3);$('#rise').value=+(z.r*si).toFixed(3);}
 shapeVis();}
function shapeVis(){const k=val('shape'),show=(id,on)=>{const d=document.getElementById('f_'+id);if(d)d.style.display=on?'':'none';};
 show('size',Shapes.catalog(k)&&Shapes.isHY(k));show('nBed',Shapes.isHY(k)&&Shapes.DB[k]&&Shapes.DB[k].open);show('udPoly',k==='user');
 show('corrugation',k==='circular'&&val('material')==='cmp');
 show('span',k!=='circular'&&k!=='user');show('rise',k!=='user');
 ['span','rise'].forEach(id=>{const e=document.getElementById(id);if(e)e.readOnly=Shapes.isHY(k)&&Shapes.catalog(k);});}
function secFor(){const k=val('shape');if(!Shapes.isHY(k))return null;
 return Shapes.section(k,{mat:val('material'),size:val('size'),units:state.units,n:val('n'),nb:val('nBed'),span:val('span'),rise:val('rise'),poly:val('udPoly')});}
function fill(id){const e=document.getElementById(id),v=e.value;e.innerHTML=opts(id).map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('');if([...e.options].some(o=>o.value===v))e.value=v;}
let hlTarget=null;function hl(t){hlTarget=t;document.querySelectorAll('[data-part]').forEach(e=>e.classList.toggle('hl',e.dataset.part===t));}
function lines(id){return (val(id)||'').split(/\n/).map(l=>l.split(/[,;\s]+/).filter(Boolean).map(Number)).filter(q=>q.length>=2&&q.every(isFinite)).map(q=>[q[0],q[1]]);}
function chObj(){const m=val('twMode');if(!['rect','trap','tri','irreg'].includes(m))return null;const o={type:m,b:val('chB'),z1:val('chZ1'),z2:val('chZ2'),S:val('chS'),n:val('chN'),inv:val('chInv')};if(m==='irreg')o.pts=lines('chPts').sort((a,b)=>a[0]-b[0]);return o;}
// Tailwater from the downstream channel, at the TOTAL crossing discharge (as HY-8 does)
function twFor(Qtot){const m=val('twMode');if(m==='const'||m==='none')return null;
 try{if(m==='rating'){const t=lines('chRating');if(t.length<2)return {error:'Rating curve needs at least two lines of discharge, elevation.'};return {el:C.ratingTW(t,Qtot).el,mode:m};}
  const ch=chObj();if(m==='irreg'&&(!ch.pts||ch.pts.length<3))return {error:'Irregular channel needs at least 3 station, elevation points.'};if(!(ch.S>0&&ch.n>0))return {error:'Channel slope and Manning n must both be greater than zero.'};const r=C.channelTW(ch,Qtot,state.units==='US');r.mode=m;return r;}catch(e){return {error:(e&&e.message)||'Tailwater calculation failed.'};}}
function params(Q){const k=val('shape'),sec=secFor();
 const inl=Shapes.isHY(k)?Shapes.inletFor(k,val('material'),val('inlet'),sec?(sec.spanNom||sec.B):1,sec?(sec.riseNom||sec.D):1):C.INLETS[k].find(i=>i.id===val('inlet'));
 const mode=val('twMode'), raw=twFor(state.Qtot??(Q??val('Q'))), tw=C.resolveTW(mode, raw, val('twElev'));
 const taperOn=(k==='box'||k==='circular')&&val('taperType')&&val('taperType')!=='none';
 const blk=Math.max(0,Math.min(85,+val('blockage')||0))/100;
 return{units:state.units,shape:k,section:sec,spanNom:sec&&sec.spanNom,riseNom:sec&&sec.riseNom,span:sec?(sec.spanNom||sec.B):val('span'),rise:sec?(sec.riseNom||sec.D):val('rise'),barrels:Math.max(1,Math.round(val('barrels')||1)),length:val('length'),invIn:val('invIn'),invOut:val('invOut'),n:val('n'),inlet:inl,Q:Q??val('Q'),twMode:tw.twMode,twElev:tw.twElev,twError:tw.error||null,twCh:tw.twCh||null,cover:val('cover'),fillZ:val('fillZ')||3,bendDeg:val('bendDeg')||0,bendRD:val('bendRD')||1,Kj:val('Kj')||0,skewDeg:val('skewDeg')||0,skewApply:val('skewApply')==='on',blockage:blk,material:val('material'),corrugation:val('corrugation'),taper:taperOn?{type:val('taperType'),edge:val('taperEdge'),Bf:val('taperBf'),taper:val('taperRatio'),St:val('taperSt'),T:val('taperT'),pipe:k==='circular',rough:val('material')==='cmp'}:null};}
function validate(p){const w={},us=state.units==='US';
 F.forEach(f=>{const v=val(f[0]);if(f[7]&&isFinite(v)){const lo=us?f[7][0]:f[7][2],hi=us?f[7][1]:f[7][3];if(v<lo||v>hi)w[f[0]]=`⚠ ${v} is outside the usual ${lo}–${hi}. Double-check the value and units.`;}
  if(f[3]!=='sel'&&f[3]!=='txt'&&!isFinite(v)&&!(f[1]==='Roadway'&&val('roadOn')!=='on'))w[f[0]]='⚠ Please enter a number.';});
 if(p.invOut>=p.invIn)w.invOut='⚠ Outlet is not lower than the inlet (zero or adverse slope). Normal depth is undefined. The result note states whether the profile method or full-flow energy was used.';
 else if(p.S>0.1)w.invOut='⚠ Slope over 10% is unusually steep.';
 if(val('Qmin')>=val('Qmax'))w.Qmax='⚠ Maximum must be greater than minimum.';
 if(p.twMode==='const'&&p.twElev<p.invOut)w.twElev='ℹ Tailwater is below the outlet invert — it will have no effect.';
 {const m=val('twMode'),sh=(id,on)=>{const d=document.getElementById('f_'+id);if(d)d.style.display=on?'':'none';};
  {const pipe=val('shape')==='circular',box=val('shape')==='box',tt=(pipe||box)?val('taperType'):'none';sh('taperType',pipe||box);['taperEdge','taperBf','taperRatio'].forEach(x=>sh(x,tt&&tt!=='none'));['taperSt','taperT'].forEach(x=>sh(x,tt==='slope'));
   sh('corrugation',pipe&&val('material')==='cmp');sh('bendRD',val('bendDeg')>0);sh('Qsed',val('sedOn')==='on');sh('Qfish',val('fishOn')==='on');
   const bRef=pipe?val('rise'):val('span');
   if(tt&&tt!=='none'&&!(val('taperBf')>bRef))w.taperBf='⚠ Face width should be larger than the barrel '+(pipe?'diameter':'span')+'.';}
  if(p.twError)w[m==='rating'?'chRating':m==='irreg'?'chPts':'chS']='⚠ '+p.twError;
  sh('twElev',m==='const');sh('chB',m==='rect'||m==='trap');sh('chZ1',m==='trap'||m==='tri');sh('chZ2',m==='trap'||m==='tri');['chS','chN'].forEach(x=>sh(x,['rect','trap','tri','irreg'].includes(m)));sh('chInv',['rect','trap','tri'].includes(m));sh('chPts',m==='irreg');sh('chRating',m==='rating');
  const t=p.twCh;if(t&&t.y!=null)w[m==='irreg'?'chPts':'chN']=`ℹ Normal depth ${fx(t.y)} → tailwater El. ${fx(t.el)}; channel velocity ${fx(t.V)}, Froude ${fx(t.Fr)}${t.Fr>1?' (supercritical channel — normal depth may not control)':''}.`;
  else if(t&&m==='rating')w.chRating=`ℹ Tailwater El. ${fx(t.el)} at ${fx(state.Qtot)} (interpolated).`;
  else if(!['const','none'].includes(m)&&!p.twError)w[m==='rating'?'chRating':m==='irreg'?'chPts':'chS']='⚠ Tailwater could not be computed — check the channel data.';}
 if(p.twMode==='none')w.twElev='ℹ Ignored (tailwater set to none).';
 if(Shapes.isHY(p.shape)&&!p.section)w[p.shape==='user'?'udPoly':'span']='⚠ Shape could not be built — check the size / points.';
 if(p.shape==='user'&&p.section)w.udPoly=`ℹ Outline: span ${p.section.B.toFixed(2)}, rise ${p.section.D.toFixed(2)}, area ${p.section.Afull.toFixed(2)}. Inlet uses HY-8 / HDS-5 Chart 52B coefficients (arch/embedded shapes).`;
 if(p.shape==='coba'&&p.inlet&&p.inlet.ratioUsed){const r=p.span/p.rise;w.inlet=`ℹ Span:rise ${r.toFixed(2)}:1 → HY-8 uses the ${p.inlet.ratioUsed} curves${r<2||r>4?' (outside the tested 2:1–4:1 range)':''}.`;}
 if(val('roadOn')==='on'){const ro=roadObj(p);
  if(val('roadMode')==='const'){w.roadProfile='ℹ Ignored (constant crest selected).';}else{w.crestEl=w.crestLen='ℹ Ignored (profile selected).';if(ro.bad)w.roadProfile='⚠ Need at least 2 lines of "station, elevation".';}
  if(val('surface')!=='custom')w.roadCd='ℹ Ignored (Cr comes from HDS-5 Fig. 3.11 curves).';
  if(!ro.bad){const zc=C.crestMin(ro);if(zc<=p.invIn+p.rise)w[val('roadMode')==='const'?'crestEl':'roadProfile']='⚠ Road crest is at or below the top of the barrel inlet — check elevations.';
   if(p.twMode==='const'&&p.twElev>zc)w.twElev='⚠ Tailwater is above the road crest — submergence is severe; results uncertain.';}}
 if(window.Studio){let crest=NaN;if(val('roadOn')==='on'){const ro=roadObj(p);if(ro&&!ro.bad)crest=C.crestMin(ro);}
  Studio.inputWarnings({Q:p.Q,Qcheck:val('Qcheck'),cover:p.cover,crest,twMode:p.twMode,twElev:p.twElev,invIn:p.invIn,invOut:p.invOut,length:p.length,allowHW:val('allowHW'),barrels:p.barrels}).forEach(x=>{if(!w[x.id])w[x.id]=(x.level==='bad'?'⚠ ':'ℹ ')+x.text;});}
 F.forEach(f=>$('#w_'+f[0]).textContent=w[f[0]]||'');return Object.keys(w).filter(k=>w[k].startsWith('⚠')).length;}
const fx=(x,d=2)=>isFinite(x)?x.toFixed(d):'—';
function checkFlood(ro){const Qk=val('Qcheck');if(!(Qk>0))return null;const keep=state.Qtot;state.Qtot=Qk;const p=params(Qk);p.S=(p.invIn-p.invOut)/p.length;if(!p.inlet)return null;
 let bal=null;if(ro&&!ro.bad){bal=balQ(Qk,elOf,ro);p.Q=bal.Qc;}if(p.twError){state.Qtot=keep;return null;}const r=solve(p);state.Qtot=keep;
 return {Qt:Qk,Qc:p.Q,Qr:bal?bal.Qr:0,over:!!(bal&&bal.over),EL:bal&&bal.over?bal.EL:r.EL,HW:(bal&&bal.over?bal.EL:r.EL)-p.invIn,Vout:r.Vout,control:r.control,r};}
function run(){
 state.Qtot=val('Q');const p=params();p.S=(p.invIn-p.invOut)/p.length;const bad=validate(p);
 if(!p.inlet||!(p.rise>0)||!(p.Q>0)||!(p.length>0)){$('#explain').textContent='Enter valid inputs to see results.';return;}
 if(p.twError){$('#summary').innerHTML='';$('#explain').innerHTML=`<div class="flag">⚠ ${p.twError} No headwater is reported until this is fixed. The hidden tailwater elevation is not used.</div>`;return;}
 const ro=roadObj(p),Qt=p.Q;let bal=null;state.Qtot=Qt;
 if(ro&&!ro.bad){bal=balQ(Qt,elOf,ro);p.Q=bal.Qc;}
 const r=solve(p),u=U[state.units],L=u.L,allow=val('allowHW'),cr=C.criteriaIn(state.criteria,state.units==='US');
 window.CHECK=checkFlood(ro);
 const flags=[];
 if(r.HW/r.D>cr.hwDMax)flags.push(`HW/D = ${fx(r.HW/r.D)} exceeds the project limit ${fx(cr.hwDMax,2)}. ${C.CRITERIA.sources.hwDMax}`);
 if(isFinite(allow)&&r.EL>allow)flags.push(`Headwater elevation ${fx(r.EL)} ${L} exceeds the allowable ${fx(allow)} ${L}.`);
 if(r.Vout>cr.vExcess)flags.push(`Outlet velocity ${fx(r.Vout)} ${u.V} exceeds ${fx(cr.vExcess)} ${u.V}. ${C.CRITERIA.sources.vExcessFt}`);
 else if(r.Vout<cr.vMin)flags.push(`Outlet velocity ${fx(r.Vout)} ${u.V} is below ${fx(cr.vMin)} ${u.V}. ${C.CRITERIA.sources.vMinFt}`);
 if(r.regime==='transition')flags.push('Inlet flow is in the transition zone between unsubmerged and submerged equations (interpolated).');
 if(p.S<=0)flags.push(C.slopeWarning(p.S,r.ocMethod));
 C.flotationCheck({material:p.material,inletId:p.inlet&&p.inlet.id,HW:r.HW,D:r.D,cover:p.cover}).filter(n=>n.level==='warn').forEach(n=>flags.push(n.text));
 if(r.bend&&r.bend.interpolated)flags.push('Bend loss coefficient was interpolated between HDS-5 Table 5.1 nodes.');
 if(p.skewApply&&r.skew)flags.push(r.skew.note+` Factor ${fx(r.skew.factor,3)} at the unskewed HW/D.`);
 if(r.blockage>0)flags.push(`Debris blockage ${(r.blockage*100).toFixed(0)}% is on. Hydraulics use the design flow through the open fraction (HEC-9 screening).`);
 if(bal&&bal.over){flags.push(`Roadway overtops: ${fx(bal.Qr)} ${u.Q} (${fx(bal.Qr/Qt*100,0)}% of the total) flows over the road, ${fx(bal.road.hmax)} ${L} deep at the low point. Most agencies do not allow overtopping at the design flood — check criteria, traffic safety and embankment erosion (HDS-5 §5.4.5).`);
  if(bal.road.ktMin<1)flags.push(`Tailwater submerges the road weir (k<sub>t</sub> down to ${fx(bal.road.ktMin,3)}).`);}
 if(ro&&ro.bad)flags.push('Roadway profile is incomplete — overtopping skipped.');
 if(bad)flags.push(`${bad} input(s) have warnings — see the form.`);
 $('#summary').innerHTML=`<div class="kpi gov">Controlling headwater<b>${fx(r.HW)} ${L}</b>El. ${fx(r.EL)} ${L} · ${r.control} control</div>
  <div class="kpi">HW/D<b>${fx(r.HW/r.D)}</b>limit ${fx(cr.hwDMax,2)}</div><div class="kpi">Inlet control HW<b>${fx(r.HWi)} ${L}</b></div><div class="kpi">Outlet HW, HY-8 profile<b>${fx(r.HWo)} ${L}</b>used for the design headwater</div><div class="kpi">Outlet HW, HDS-5 full flow<b>${fx(r.HWoHDS)} ${L}</b>ho = max(TW, (dc+D)/2)</div>
  <div class="kpi">Outlet velocity<b>${fx(r.Vout)} ${u.V}</b></div><div class="kpi">Slope<b>${fx(r.S*100,2)} %</b></div>${bal?`<div class="kpi ${bal.over?'gov':''}">Roadway overtopping Q<b>${fx(bal.Qr)} ${u.Q}</b>Culvert ${fx(bal.Qc)} of ${fx(Qt)} ${u.Q}</div>`:''}`;
 const i=r.inlet,ku=r.US?'1.0':'1.811';
 $('#explain').innerHTML=`<ol>
 <li><b>Geometry.</b> Barrel ${p.section?Shapes.label(p.shape)+' '+fx(p.span)+' × '+fx(p.rise):p.shape==='box'?fx(r.B)+' × '+fx(r.D):fx(r.D)+' diameter'} ${L}, full area A = ${fx(r.A)} ${L}², hydraulic radius R = ${fx(r.R,3)} ${L}. Slope S = (${p.invIn} − ${p.invOut}) / ${p.length} = ${fx(r.S,4)}. Flow per barrel Q = ${fx(r.Q)} ${u.Q} (${r.N} barrel${r.N>1?'s':''}).${r.blockage>0?` Debris blockage ${(r.blockage*100).toFixed(0)}% (HEC-9 screening): losses and the water-surface profile use Q/(1−blockage) = ${fx(r.Qhyd)} ${u.Q} per barrel.`:''}</li>
 <li><b>Critical depth</b> d<sub>c</sub> = ${fx(r.dc)} ${L} (solves Q²/g = A³/T). Specific head at critical H<sub>c</sub> = d<sub>c</sub> + V<sub>c</sub>²/2g = ${fx(r.dc)} + ${fx(r.Vc)}²/(2·${fx(r.g,2)}) = ${fx(r.Hc)} ${L}.</li>
 <li><b>Normal depth</b> y<sub>n</sub> = ${isFinite(r.yn)?fx(r.yn)+' '+L+' (Manning, n = '+p.n+')':'— (barrel would flow full or slope ≤ 0)'}. ${isFinite(r.yn)?(r.yn<r.dc?'y<sub>n</sub> &lt; d<sub>c</sub>: steep (supercritical) barrel.':'y<sub>n</sub> &gt; d<sub>c</sub>: mild (subcritical) barrel.'):''}</li>
 <li><b>Inlet control</b> (HDS-5 ${i.chart}: K=${i.K}, M=${i.M}, c=${i.c}, Y=${i.Y}, K<sub>s</sub>=${i.Ks}). Discharge factor K<sub>u</sub>Q/(A·D<sup>0.5</sup>) = ${ku}·${fx(r.Q)}/(${fx(r.A)}·${fx(Math.sqrt(r.D),3)}) = ${fx(r.X,3)} → <b>${r.regime}</b> (unsubmerged ≤ 3.5, submerged ≥ 4.0).
  ${r.regime==='unsubmerged'?`HW/D = H<sub>c</sub>/D + K·X<sup>M</sup> + K<sub>s</sub>S = ${fx(r.Hc/r.D,3)} + ${i.K}·${fx(r.X,3)}<sup>${i.M}</sup> + (${i.Ks})(${fx(r.S,4)})`:r.regime==='submerged'?`HW/D = c·X² + Y + K<sub>s</sub>S = ${i.c}·${fx(r.X,3)}² + ${i.Y} + (${i.Ks})(${fx(r.S,4)})`:'HW/D interpolated linearly between the unsubmerged value at X=3.5 and submerged value at X=4.0'} = ${fx(r.ratio,3)}. HW<sub>i</sub> = ${fx(r.ratio,3)} × ${fx(r.D)} = <b>${fx(r.HWi)} ${L}</b> (El. ${fx(r.ELhi)}).</li>
 <li><b>Outlet control</b> (${r.ocMethod==='steep-full'?'steep barrel with low tailwater — no subcritical profile can form, so HY-8/HDS-5 full-barrel losses are used':r.ocMethod==='full'?'outlet submerged — pressure flow':'HY-8-style standard-step water-surface profile traced upstream from max(d<sub>c</sub>, TW) at the outlet'+(r.ocMethod==='profile+full'?', with pressure flow where it reaches the crown':'')+'; HW = inlet depth + (1+K<sub>e</sub>)·V²/2g'}). V = Q/A = ${fx(r.V)} ${u.V}, velocity head = ${fx(r.hv,3)} ${L}. Entrance loss K<sub>e</sub>·V²/2g = ${i.Ke}·${fx(r.hv,3)} = ${fx(r.He,3)}; friction ${r.US?29:19.63}·n²·L/R<sup>1.33</sup>·V²/2g = ${fx(r.Hf,3)}; exit loss 1.0·V²/2g = ${fx(r.Ho,3)}; total H = ${fx(r.H,3)} ${L}.
  Tailwater depth TW = ${fx(r.TW)} ${L}; (d<sub>c</sub>+D)/2 = ${fx((r.dc+r.D)/2)} → profile h<sub>o</sub> = ${fx(r.ho)} ${L}. HY-8 profile HW<sub>o</sub> = <b>${fx(r.HWo)} ${L}</b> (this is the outlet-control depth used to decide control). HDS-5 full-flow HW<sub>o</sub> = outlet invert + max(TW, (d<sub>c</sub>+D)/2) + H − inlet invert = <b>${fx(r.HWoHDS)} ${L}</b> (El. ${fx(r.ELhoHDS)}). The two are shown together; the design headwater still follows the profile method when a free-surface profile can be computed.${r.Hb||r.Hj?` Bend loss ${fx(r.Hb,3)} ${L} and junction loss ${fx(r.Hj,3)} ${L} are included in H.`:''}</li>
 ${r.crossing?`<li><b>Flow split.</b> ${r.crossing.parts.map((pt,i)=>`Barrel ${i+1}: ${fx(pt.Q)} ${u.Q}${pt.idle?' (invert above the pool)':', '+pt.r.control+' control, outlet '+fx(pt.r.Vout)+' '+u.V}`).join('; ')}. Common upstream elevation ${fx(r.crossing.EL)} ${L}.</li>`:''}
 <li><b>Which governs?</b> The larger headwater controls: <b>${r.control} control</b> (${fx(Math.max(r.HWi,r.HWo))} vs ${fx(Math.min(r.HWi,r.HWo))} ${L}). ${r.control==='Inlet'?'The entrance is the bottleneck — improving the inlet edge (bevels, wingwalls) helps; barrel roughness does not.':'The barrel/tailwater is the bottleneck — a smoother, shorter, larger barrel or lower tailwater helps; inlet improvements only reduce the small entrance loss.'}</li>
 ${r.jump?`<li><b>Hydraulic jump</b> forms ${fx(r.jump.x)} ${L} into the barrel: supercritical depth y<sub>1</sub> = ${fx(r.jump.y1)} ${L} jumps to sequent depth y<sub>2</sub> = ${fx(r.jump.y2)} ${L}${r.jump.y2>=r.D-1e-6?' (barrel full downstream)':''}, located as in HY-8: where the sequent depth of the S2 profile from the inlet reaches the subcritical profile traced upstream from the outlet (or the crown, where that profile is pressurised). Jump length is not modelled (HY-8 adds one).</li>`:r.jumpType==='drowned'?`<li><b>Hydraulic jump</b> would sit upstream of the inlet — tailwater drowns the inlet, so the barrel runs in the outlet-control (subcritical) regime.</li>`:''}<li><b>Outlet velocity</b> ≈ ${fx(r.Vout)} ${u.V} at depth ${fx(r.yout)} ${L} (${r.outMethod}).</li>${bal?roadExplain(bal,ro,Qt,u):''}</ol>
 ${flags.length?flags.map(f=>`<div class="flag">⚠ ${f}</div>`).join(''):'<div class="flag ok">✓ No warnings.</div>'}`;
 window.LAST={p,r,allow,ro:ro&&!ro.bad?ro:null,bal,check:window.CHECK};
 drawProfile(p,r,allow,ro&&!ro.bad?ro:null,bal);drawRating(p,r);drawSplit(p,ro&&!ro.bad?ro:null);drawX(p,r);hl(hlTarget);
}
function drawProfile(p,r,allow,ro,bal){
 const zc=ro?C.crestMin(ro):p.invIn+r.D*1.6;
 const W=900,H=340,x0=200,x1=700,L=r.US?'ft':'m';
 const zmin=Math.min(p.invOut,p.invIn)-r.D*0.6,zmax=Math.max(r.EL,isFinite(allow)?allow:0,p.invIn+r.D*1.8,zc)+r.D*0.3;
 const Y=z=>H-30-(z-zmin)/(zmax-zmin)*(H-60);
 const yi=Y(p.invIn),yo=Y(p.invOut),ti=Y(p.invIn+r.D),to=Y(p.invOut+r.D),road=Y(zc);
 const twEl=p.twMode==='const'?Math.max(p.twElev,p.invOut):p.invOut;
 const wsIn=Math.min(r.D,r.profile?r.profile[0][1]:r.dc),wsOut=Math.min(r.D,r.yout);
 const PX=x=>x0+(x1-x0)*x/p.length,PZ=(x,y)=>Y(p.invIn-(p.invIn-p.invOut)*x/p.length+Math.min(y,r.D));
 const prof=(r.profile||[[0,wsIn],[p.length,wsOut]]),wsPath=prof.map((q,i)=>`${i?'L':'M'}${PX(q[0]).toFixed(1)} ${PZ(q[0],q[1]).toFixed(1)}`).join(' ');
 let s=`<rect width="${W}" height="${H}" fill="#eaf4fb"/>
 <path data-part="embank" d="M60 ${yi} L${x0-40} ${yi} L${x0+60} ${road} L${x1-60} ${road} L${x1+40} ${yo} L840 ${yo} L840 ${H} L60 ${H}Z" fill="#c9b48a" stroke="#8a7550"/>
 <text x="${(x0+x1)/2}" y="${road+18}" text-anchor="middle" fill="#5a4a2c">${ro?'Road crest El. '+fx(zc):'Roadway embankment (overtopping off)'}</text>
 <line data-part="road" x1="${x0+60}" x2="${x1-60}" y1="${road}" y2="${road}" stroke="#444" stroke-width="4"/>
 ${bal&&bal.over?`<path d="M${x0+60-(road-Y(r.EL))} ${Y(r.EL)} L${x1-60} ${Y(r.EL)+(road-Y(r.EL))*0.45} L${x1-60} ${road} L${x0+60} ${road}Z" fill="#4a90d9" opacity=".6"/><text x="${(x0+x1)/2}" y="${Y(r.EL)-8}" text-anchor="middle" font-weight="700" fill="#174a7c">Overtopping ${fx(bal.Qr)} ${r.US?'cfs':'m³/s'} · HWr = ${fx(bal.road.hmax)} ${L}</text>`:''}
 <path d="M${x0} ${yi} L${x1} ${yo} L${x1} ${to} L${x0} ${ti}Z" fill="#fff" stroke="none"/>
 <path data-part="hw" d="M40 ${Y(r.EL)} L${x0+ (Y(r.EL)>ti? 0:0)} ${Y(r.EL)} L${x0} ${yi} L40 ${yi}Z" fill="#4a90d9" opacity=".55"/>
 <path data-part="ws" d="${wsPath} L${x1} ${yo} L${x0} ${yi}Z" fill="#4a90d9" opacity=".55"/><path d="${wsPath}" fill="none" stroke="#1659a3" stroke-width="1.5"/>
 ${r.jump?`<line x1="${PX(r.jump.x)}" x2="${PX(r.jump.x)}" y1="${PZ(r.jump.x,r.jump.y2)-4}" y2="${PZ(r.jump.x,r.jump.y1)+4}" stroke="#c0392b" stroke-width="2.5"/><text x="${PX(r.jump.x)}" y="${PZ(r.jump.x,r.D)-8}" text-anchor="middle" font-size="12" fill="#c0392b" font-weight="700">Hydraulic jump @ ${fx(r.jump.x)} ${L}</text>`:''}
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
function roadExplain(b,ro,Qt,u){const L=u.L,us=ro.US,zc=C.crestMin(ro);
 return `<li><b>Roadway overtopping</b> (HDS-5 Eq. 3.9: Q<sub>r</sub> = C<sub>d</sub>·L·HW<sub>r</sub><sup>1.5</sup>, C<sub>d</sub> = k<sub>t</sub>·C<sub>r</sub>${us?'':' × 0.552 for SI'}). Road crest low point El. ${fx(zc)} ${L}, top width L<sub>r</sub> = ${ro.Lr} ${L}, ${ro.surface} surface; ${ro.segs.length-1} profile segment(s), each split into 40 slices and summed (HDS-5 Fig. 3.12A).
 ${b.over?`The culvert alone would need headwater El. ${fx(elOf(Qt))} ${L} to pass ${fx(Qt)} ${u.Q}, which is above the crest, so flow splits. By bisection on culvert flow (${b.iter} iterations, tolerance 0.01% of Q) the balance is: culvert ${fx(b.Qc)} + road ${fx(b.Qr)} = ${fx(b.Qc+b.Qr)} ${u.Q} at headwater El. <b>${fx(b.EL)} ${L}</b>. Max depth over road HW<sub>r</sub> = ${fx(b.road.hmax)} ${L} over ${fx(b.road.wet)} ${L} of road; C<sub>r</sub> = ${fx(b.road.crMin,3)}${b.road.crMax-b.road.crMin>0.001?'–'+fx(b.road.crMax,3):''}${ro.surface==='custom'?' (custom)':` (Fig. 3.11${b.road.hmax/ro.Lr>0.15?'A, deep':'B, shallow'})`}, k<sub>t</sub> min = ${fx(b.road.ktMin,3)} (Fig. 3.11C). Steps 1–7 above are for the culvert's share, ${fx(b.Qc)} ${u.Q}.`:`Headwater El. ${fx(b.EL)} ${L} stays below the road crest, so no flow goes over the road at the design discharge.`}</li>`;}
function drawSplit(p,ro){const box=$('#split');if(!ro){box.innerHTML='<p>Roadway overtopping is turned off (step 6).</p>';$('#splitchart').innerHTML='';return;}
 const q0=val('Qmin'),q1=val('Qmax'),u=U[state.units];if(!(q1>q0&&q0>=0))return;
 const rows=[];for(let k=0;k<=10;k++){const q=Math.max(q0+(q1-q0)*k/10,1e-6);rows.push([q,balQ(q,elOf,ro)]);}
 const qd=val('Q');rows.push([qd,balQ(qd,elOf,ro),1]);rows.sort((a,b)=>a[0]-b[0]);
 let t=`<div style="overflow-x:auto"><table class="split"><tr><th>Total Q (${u.Q})</th><th>Culvert Q</th><th>Roadway Q</th><th>HW elev (${u.L})</th><th>Iterations</th></tr>`+rows.map(([q,b,d])=>`<tr class="${d?'des':''}${b.over?' ov':''}"><td>${fx(q)}${d?' (design)':''}</td><td>${fx(b.Qc)}</td><td>${fx(b.Qr)}</td><td>${fx(b.EL)}</td><td>${b.iter}</td></tr>`).join('')+'</table></div>';
 const zc=C.crestMin(ro);let a=0,bq=Math.max(q1,qd)*4;
 if(elOf(bq)<zc)t+='<p>No overtopping up to '+fx(bq)+' '+u.Q+'.</p>';
 else{for(let i=0;i<60;i++){const m=(a+bq)/2;if(elOf(m)<zc)a=m;else bq=m;}t+=`<p><b>Overtopping discharge: overtopping begins at about ${fx(a)} ${u.Q}</b> (culvert headwater reaches road crest El. ${fx(zc)} ${u.L}). Shaded rows overtop.</p>`;}
 box.innerHTML=t;
 const pts=[];for(let k=0;k<=40;k++){const q=Math.max(q0+(q1-q0)*k/40,1e-6),b=balQ(q,elOf,ro);pts.push([b.EL,b.Qc,b.Qr,q]);}
 const W=600,H=320,m=50,e0=Math.min(...pts.map(t=>t[0])),e1=Math.max(...pts.map(t=>t[0]),zc)+0.3,qm=q1;
 const X=q=>m+q/qm*(W-m-15),Y=e=>H-35-(e-e0)/(e1-e0)*(H-55);
 const line=(i,c,d)=>`<polyline fill="none" stroke="${c}" stroke-width="2.5" ${d||''} points="${pts.filter(t=>i!==2||t[2]>0||t[0]>=zc-1e-9).map(t=>X(t[i])+','+Y(t[0])).join(' ')}"/>`;
 let g='';for(let k=0;k<=5;k++){const e=e0+(e1-e0)*k/5,q=qm*k/5;g+=`<line x1="${m}" x2="${W-15}" y1="${Y(e)}" y2="${Y(e)}" stroke="#eee"/><text x="${m-5}" y="${Y(e)+4}" text-anchor="end" font-size="11">${e.toFixed(1)}</text><text x="${X(q)}" y="${H-20}" text-anchor="middle" font-size="11">${q.toFixed(0)}</text>`;}
 $('#splitchart').innerHTML=g+`<line data-part="road" x1="${m}" x2="${W-15}" y1="${Y(zc)}" y2="${Y(zc)}" stroke="#8a7550" stroke-dasharray="5 4"/><text x="${W-20}" y="${Y(zc)-4}" text-anchor="end" font-size="11" fill="#5a4a2c">Road crest ${fx(zc)}</text>
 ${line(1,'#2b6cb0')}${line(2,'#c0392b','stroke-dasharray="6 4"')}${line(3,'#111')}
 <line x1="${m}" y1="${H-35}" x2="${W-15}" y2="${H-35}" stroke="#333"/><line x1="${m}" y1="10" x2="${m}" y2="${H-35}" stroke="#333"/>
 <text x="${W/2}" y="${H-3}" text-anchor="middle">Discharge (${u.Q})</text><text transform="rotate(-90)" x="${-H/2+10}" y="12" text-anchor="middle">Headwater elevation (${u.L})</text>
 <rect x="${m+10}" y="14" width="150" height="62" fill="#fff" stroke="#ccc"/>${[['Culvert','#2b6cb0',''],['Roadway','#c0392b','6 4'],['Total','#111','']].map((l,i)=>`<line x1="${m+18}" x2="${m+45}" y1="${28+i*18}" y2="${28+i*18}" stroke="${l[1]}" stroke-width="2.5" stroke-dasharray="${l[2]}"/><text x="${m+50}" y="${32+i*18}" font-size="12">${l[0]}</text>`).join('')}`;
}

function drawRating(p,r){
 const q0=val('Qmin'),q1=val('Qmax');if(!(q1>q0&&q0>=0))return;
 const steps=state.extras&&state.extras.length?16:40, pts=[];for(let k=0;k<=steps;k++){const q=q0+(q1-q0)*k/steps;if(q<=0)continue;const k0=state.Qtot;state.Qtot=q;const a=solve(params(q));state.Qtot=k0;pts.push([q,a.HWi,a.HWo,a.HWoHDS]);}
 const W=600,H=320,m=45,hmax=Math.max(...pts.map(t=>Math.max(t[1],t[2],t[3])))*1.1;
 const X=q=>m+(q-q0)/(q1-q0)*(W-m-15),Y=h=>H-m+10-(h/hmax)*(H-m-20);
 const line=(i,c,d)=>`<polyline fill="none" stroke="${c}" stroke-width="2.5" ${d?'stroke-dasharray="6 4"':''} points="${pts.map(t=>X(t[0])+','+Y(t[i])).join(' ')}"/>`;
 let g='';for(let k=0;k<=5;k++){const h=hmax*k/5,q=q0+(q1-q0)*k/5;g+=`<line x1="${m}" x2="${W-15}" y1="${Y(h)}" y2="${Y(h)}" stroke="#eee"/><text x="${m-5}" y="${Y(h)+4}" text-anchor="end" font-size="11">${h.toFixed(1)}</text><text x="${X(q)}" y="${H-m+26}" text-anchor="middle" font-size="11">${q.toFixed(0)}</text>`;}
 const u=U[state.units];
 $('#rating').innerHTML=g+`<line x1="${m}" y1="${H-m+10}" x2="${W-15}" y2="${H-m+10}" stroke="#333"/><line x1="${m}" y1="10" x2="${m}" y2="${H-m+10}" stroke="#333"/>
 ${line(1,'#2b6cb0')}${line(2,'#d35400',1)}${line(3,'#6c3483','2 3')}<polyline fill="none" stroke="#111" stroke-width="1" points="${pts.map(t=>X(t[0])+','+Y(Math.max(t[1],t[2]))).join(' ')}"/>
 <line x1="${m}" x2="${W-15}" y1="${Y(r.D)}" y2="${Y(r.D)}" stroke="#888" stroke-dasharray="2 3"/><text x="${W-20}" y="${Y(r.D)-3}" text-anchor="end" font-size="11">HW = D</text>
 <circle cx="${X(p.Q)}" cy="${Y(r.HW)}" r="5" fill="#c0392b"/><text x="${X(p.Q)+7}" y="${Y(r.HW)-7}" font-size="12">Design</text>
 <text x="${W/2}" y="${H-4}" text-anchor="middle">Total discharge (${u.Q})</text><text transform="rotate(-90)" x="${-H/2}" y="12" text-anchor="middle">Headwater depth (${u.L})</text>
 <rect x="${m+10}" y="14" width="230" height="66" fill="#fff" stroke="#ccc"/><line x1="${m+18}" x2="${m+45}" y1="28" y2="28" stroke="#2b6cb0" stroke-width="2.5"/><text x="${m+50}" y="32" font-size="12">Inlet control</text>
 <line x1="${m+18}" x2="${m+45}" y1="46" y2="46" stroke="#d35400" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${m+50}" y="50" font-size="12">Outlet, HY-8 profile</text>
 <line x1="${m+18}" x2="${m+45}" y1="64" y2="64" stroke="#6c3483" stroke-width="2.5" stroke-dasharray="2 3"/><text x="${m+50}" y="68" font-size="12">Outlet, HDS-5 full flow</text>`;
 window._curve=pts;
}
function drawX(p,r){
 const W=300,H=320,N=r.N,sc=Math.min(240/(N*r.B+(N-1)*r.B*0.25),200/r.D),bw=r.B*sc,bh=r.D*sc,gap=r.B*0.25*sc,tot=N*bw+(N-1)*gap,x0=(W-tot)/2,yb=270;
 const wl=Math.min(r.HW,r.D*1.6)*sc;let s=`<rect x="0" y="${yb-wl}" width="${W}" height="${wl}" fill="#4a90d9" opacity=".25" data-part="hw"/>`;
 for(let k=0;k<N;k++){const x=x0+k*(bw+gap);
  s+=p.section?`<path data-part="xs" d="${Shapes.path(p.section,sc,x,yb)}" fill="#fff" stroke="#444" stroke-width="3"/>${p.section.open?`<line x1="${x-4}" x2="${x+bw+4}" y1="${yb}" y2="${yb}" stroke="#8d6e3f" stroke-width="4" stroke-dasharray="3 2"/>`:''}`:p.shape==='box'?`<rect data-part="xs" x="${x}" y="${yb-bh}" width="${bw}" height="${bh}" fill="#fff" stroke="#444" stroke-width="3"/>`:`<circle data-part="xs" cx="${x+bw/2}" cy="${yb-bh/2}" r="${bh/2}" fill="#fff" stroke="#444" stroke-width="3"/>`;}
 s+=`<line x1="0" x2="${W}" y1="${yb-r.HW*sc}" y2="${yb-r.HW*sc}" stroke="#2b6cb0" stroke-width="2"/><text x="6" y="${yb-r.HW*sc-5}" font-size="12">HW ${fx(r.HW)}</text>
 <text x="${W/2}" y="${yb+20}" text-anchor="middle" font-size="12">${N} × ${p.section?fx(p.span)+' × '+fx(p.rise):p.shape==='box'?fx(r.B)+' × '+fx(r.D):'Ø '+fx(r.D)} ${U[state.units].L}</text>`;
 $('#xsec').innerHTML=s;
}
function criteriaBox(){let box=document.getElementById('critbox');if(!box){box=document.createElement('fieldset');box.id='critbox';$('#form').appendChild(box);}
 const US=state.units==='US',cr=state.criteria,vf=US?1:C.FT,vu=US?'ft/s':'m/s';
 box.innerHTML=`<legend>Design criteria</legend><p class="muted" style="margin:2px 0 6px">Saved with this browser and with each project. Velocity defaults are the TxDOT HDM numbers. HW/D defaults to 1.5, the top of the range HDS-5 §2.2.5 says agencies commonly use. TxDOT sets no HW/D limit.</p>
 <div class="f"><label><span>HW/D limit</span><input id="crHWD" type="number" step="0.05" value="${cr.hwDMax}"></label></div>
 <div class="f"><label><span>Excessive outlet velocity (${vu})</span><input id="crVex" type="number" step="0.1" value="${+(cr.vExcessFt*vf).toFixed(3)}"></label></div>
 <div class="f"><label><span>Minimum outlet velocity (${vu})</span><input id="crVmin" type="number" step="0.1" value="${+(cr.vMinFt*vf).toFixed(3)}"></label></div>`;
 const pull=()=>{const h=+document.getElementById('crHWD').value,vx=+document.getElementById('crVex').value,vn=+document.getElementById('crVmin').value;
  if(h>0)state.criteria.hwDMax=h; if(vx>0)state.criteria.vExcessFt=vx/(US?1:C.FT); if(vn>=0)state.criteria.vMinFt=vn/(US?1:C.FT); savePrefs();};
 ['crHWD','crVex','crVmin'].forEach(id=>{const e=document.getElementById(id);e.oninput=()=>{pull();run();};});}
function exportCSV(){const pts=window._curve||[];if(!pts.length)return;const u=U[state.units];
 const lines=['Q_'+u.Q+',inlet_HW_'+u.L+',outlet_HW_HY8_profile_'+u.L+',outlet_HW_HDS5_fullflow_'+u.L];
 pts.forEach(t=>lines.push(t.map(x=>isFinite(x)?(+x).toFixed(4):'').join(',')));
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));a.download='culvert-performance.csv';document.body.appendChild(a);a.click();a.remove();}
document.addEventListener('click',e=>{if(e.target&&e.target.id==='csvbtn')exportCSV();});
$('#units').value=state.units;
$('#units').onchange=e=>{const next=e.target.value,prev=state.units;if(next===prev)return;const conv=C.convertSnapshot(readForm(),fieldSpec(),prev,next);
 const lf=next==='SI'?C.FT:1/C.FT;state.extras=(state.extras||[]).map(ex=>Object.assign({},ex,{span:+ex.span*lf,rise:+ex.rise*lf,length:+ex.length*lf,invIn:+ex.invIn*lf,invOut:+ex.invOut*lf}));
 state.units=next;savePrefs();if(window.StudioUI)StudioUI.lock(true);build();applyValues(conv);run();if(window.StudioUI){StudioUI.reset();StudioUI.lock(false);}};
build();(()=>{const q=new URLSearchParams(location.search),set=k=>{const e=document.getElementById(k);if(e&&q.has(k))e.value=q.get(k);};
 set('shape');if(q.has('shape')){fill('material');set('material');fill('size');if(q.has('size'))set('size');else pickSize();fill('inlet');shapeDefaults();}
 q.forEach((v,k)=>{if(!['shape','material','size'].includes(k))set(k);});})();run();
