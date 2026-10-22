/* Ditch Studio UI. All hydraulics in calc.js (DT). */
const $=s=>document.querySelector(s),f=(x,d=2)=>x==null||!isFinite(x)?'—':(+x).toFixed(d);
const U15='https://www.fhwa.dot.gov/engineering/hydraulics/pubs/05114/05114.pdf',UHDM='https://www.txdot.gov/manuals/des/hyd/';
const TBL21={Concrete:[0.013,'rigid'],'Grouted riprap':[0.030,'rigid'],'Stone masonry':[0.032,'rigid'],'Soil cement':[0.022,'rigid'],Asphalt:[0.016,'rigid'],'Rock cut (smooth, uniform)':[0.035,'rigid'],'Bare soil':[0.020,'soil']}; // HEC-15 Table 2.1 typical n
const TXT={'Retardance Class A vegetation':3.70,'Retardance Class B vegetation':2.10,'Retardance Class C vegetation':1.00,'Retardance Class D vegetation':0.60,'Retardance Class E vegetation':0.35,'Woven paper':0.15,'Jute net':0.45,'Single fiberglass':0.60,'Double fiberglass':0.85,'Straw w/ net':1.45,'Curled wood mat':1.55,'Synthetic mat':2.00,'Gravel D50 = 1 in':0.40,'Gravel D50 = 2 in':0.80,'Rock D50 = 6 in':2.50,'Rock D50 = 12 in':5.00,'6-in gabions':35.0,'4-in Geoweb':10.0,'Soil cement (8% cement) (>45)':45,'Dycel w/out grass (>7)':7,'Petraflex w/out grass (>32)':32,'Armorflex w/out grass (12–20, lower bound)':12}; // TxDOT HDM Ch. 7 Sec. 3 table
const S={shape:'trap',B:3,Z1:3,Z2:3,Tt:10,Dt:1.5,pts:'0,3\n4,0.5\n5,0\n7,0\n8,0.5\n12,3',S:0.03,Dd:1.5,Rc:0,mode:'Q',Q:17.5,d:1,life:'perm',SF:1,
 lt:'veg',vm:'cs',ret:'C',cond:'Good',hgt:0.25,gf:'Sod',st:'cohesive',cls:'SC',PI:16,e:0.5,D75:0.08,tps:0.05,D50:6,gs:165,phi:38,MT:0.75,
 tl:1.25,t1:0.75,t2:1.5,t3:3,n1:0.038,n2:0.034,n3:0.031,fl:'Concrete',nfix:0.013,tx:'Retardance Class C vegetation',nx:0.04};
const H={
 shape:['Ditch shape','','V (unequal side slopes), trapezoid, rectangle, parabola, V with 4-ft rounded bottom (HEC-15 App. B, US units only), or your own x-y points.','Typical section / plan cross sections.',null],
 B:['Bottom width B','ft','Flat bottom width of the ditch.','Typical section.',[0,20]],
 Z1:['Left side slope Z1 (H:1V)','','Horizontal per 1 vertical. HEC-15 3.2: slopes steeper than 1:3 are not encouraged for flexible linings other than riprap or gabions.','Typical section; TxDOT Roadway Design Manual Ch. 2 Sec. 6 (side ditch geometry).',[1,10]],
 Z2:['Right side slope Z2 (H:1V)','','Horizontal per 1 vertical for the other side.','Typical section.',[1,10]],
 Tt:['Parabola top width','ft','Top width of the parabolic ditch at the reference depth below.','Typical section.',[2,40]],
 Dt:['Parabola depth at that width','ft','Depth of the parabola where its width equals the top width above.','Typical section.',[0.3,6]],
 pts:['Section points (x, y)','ft','One "x, y" pair per line, left to right; y is elevation. Water fills from the lowest point.','Survey / cross-section sheet.',null],
 S:['Channel slope S','ft/ft','Ditch bed slope; for uniform flow it equals the energy slope (HEC-15 Eq. 2.1).','Profile; usually the roadway grade (HEC-15 2.3.3).',[0.001,0.1]],
 Dd:['Ditch depth (to top of bank)','ft','Depth available from flow line to the lowest top of bank / shoulder; used for the freeboard check.','Typical section.',[0.5,6]],
 Rc:['Bend radius Rc (0 = straight)','ft','Radius of curvature of the bend to the channel centerline; enables Kb (Eq. 3.7), length of protection (Eq. 3.8) and superelevation (Eq. 3.9).','Plan sheet.',[0,500]],
 mode:['Solve for','','Normal depth for a given flow, or capacity at a given depth.','',null],
 Q:['Design flow Q','cfs','Peak flow for the design frequency (HEC-15 2.3.1: usually 5- or 10-yr for permanent linings; ~2-yr for transitional linings).','Tc Studio (Rational method) or hydrology.',[0.1,500]],
 d:['Flow depth d','ft','Depth at which to compute capacity (e.g. ditch depth minus freeboard).','Typical section.',[0.1,6]],
 life:['Lining life','','Permanent: 0.5 ft freeboard; transitional: zero freeboard may be acceptable (HEC-15 2.3.4).','',null],
 SF:['Safety factor SF','','HEC-15 Eq. 3.2: τp ≥ SF·τd. 1.0 default; 1.0–1.5 for supercritical flow, slow vegetation, uncertain Q or high consequences. Riprap/gabion: at least the Table 6.1 value.','HEC-15 3.1.',[1,1.5]],
 lt:['Lining type','','Vegetation (HEC-15 Ch. 4), RECP (Ch. 5), riprap/gravel (Ch. 6), gabion (Ch. 7), fixed-n linings (Table 2.1) or TxDOT HDM permissible shear table.','',null],
 vm:['Grass described by','','Retardance class (Table 4.4) or cover condition + stem height (Table 4.2, Eq. 4.1).','',null],
 ret:['SCS retardance class','','Table 4.4: A/B are tall grasses not common on roadsides; C/D typical.','HEC-15 Table 4.1 / TxDOT HDM "Retardation Class for Lining Materials".',null],
 cond:['Cover condition','','Density-stiffness Cs from HEC-15 Table 4.2 ("Good cover would be the typical reference condition").','',null],
 hgt:['Stem height h','ft','Grass height; near roadways typically 0.25–0.75 ft (HEC-15 4.1).','Maintenance (mowing) practice.',[0.25,0.75]],
 gf:['Growth form','','Sod-forming, bunch or mixed grass, for the cover factor Cf (Table 4.5).','Seed mix.',null],
 st:['Underlying soil','','Permissible soil shear: fine non-cohesive (0.02 lb/ft²), coarse non-cohesive (Eq. 4.5), cohesive (Eq. 4.6), or enter it.','Geotech / soil survey.',null],
 cls:['Soil class (ASTM)','','Table 4.6 class.','Geotech report.',null],
 PI:['Plasticity index PI','','Eq. 4.6 applies for PI > 10 (CH: PI > 20).','Geotech report.',[10,40]],
 e:['Void ratio e','','Soil void ratio (HEC-15 examples use 0.5).','Geotech report.',[0.3,1.0]],
 D75:['Soil D75','in','Size where 75% is finer. For turf reinforcement with a gravel/soil mix use the gravel D75 (HEC-15 4.5).','Gradation.',[0.01,2]],
 tps:['Permissible soil shear','lb/ft²','Your value for τp,soil.','',[0.01,0.2]],
 D50:['Stone D50','in','Median stone size (riprap, gravel, cobble or gabion fill).','Riprap class / gradation.',[1,24]],
 gs:['Stone unit weight γs','lb/ft³','HEC-15 6.2: typically 165 lb/ft³; use the site value if different.','Quarry data.',[150,180]],
 phi:['Angle of repose φ','deg','For the riprap side-slope check (Eq. 6.16); read from HEC-15 Figure 6.1 for your size and angularity (the HEC-15 example uses 38°).','HEC-15 Fig. 6.1.',[30,42]],
 MT:['Mattress thickness MT','ft','Gabion mattress thickness (Eq. 7.2 valid 0.5–1.5 ft).','Product.',[0.5,1.5]],
 tl:['RECP τl (0.5 in soil loss)','lb/ft²','Manufacturer lining shear at 0.5 in of soil loss (ASTM D 6460 testing).','Manufacturer data sheet.',[0.5,10]],
 t1:['Applied shear, lower','lb/ft²','Manufacturer roughness table (Table 5.4): lower = mid / 2.','Manufacturer.',null],t2:['Applied shear, mid','lb/ft²','Middle value.','Manufacturer.',null],t3:['Applied shear, upper','lb/ft²','Upper = 2 × mid.','Manufacturer.',null],
 n1:['n at lower shear','','','Manufacturer.',null],n2:['n at mid shear','','','Manufacturer.',null],n3:['n at upper shear','','','Manufacturer.',null],
 fl:['Lining (HEC-15 Table 2.1)','','Typical Manning n; rigid linings are treated as non-erodible (no shear check). Bare soil uses the soil permissible shear.','HEC-15 Table 2.1.',null],
 nfix:['Manning n','','Edit if you have a better value (Table 2.1 gives min / typical / max).','HEC-15 Table 2.1.',[0.011,0.05]],
 tx:['TxDOT lining','','Permissible shear from TxDOT HDM Ch. 7 Sec. 3 "Permissible Shear Stresses for Various Linings". The table gives no n — enter one.','TxDOT HDM.',null],
 nx:['Manning n for this lining','','Not given by the TxDOT table: use HEC-15 Table 2.1 / Ch. 4–6 or manufacturer data.','',[0.011,0.1]]};
function warn(k,v){const h=H[k];if(!h||!h[4]||typeof v!=='number')return '';const[a,b]=h[4];return v<a||v>b?`<div class="warn">⚠ Outside typical range ${a}–${b}${h[1]?' '+h[1]:''}.</div>`:'';}
function field(k,val,input){const h=H[k];return `<div class="f" data-k="${k}"><label><span>${h[0]}${h[1]?' ('+h[1]+')':''} <button class="i" type="button" title="What is this?">i</button></span>${input||`<input data-v="${k}" type="number" inputmode="decimal" step="any" value="${val}">`}</label><div class="help"><b>What:</b> ${h[2]||'—'}${h[3]?`<br><b>Where:</b> ${h[3]}`:''}${h[4]?`<br><b>Typical:</b> ${h[4][0]}–${h[4][1]} ${h[1]}`:''}</div>${warn(k,val)}</div>`;}
const sel=(k,opts)=>field(k,null,`<select data-v="${k}">${opts.map(o=>Array.isArray(o)?o:[o,o]).map(([v,l])=>`<option value="${v}"${v==S[k]?' selected':''}>${l}</option>`).join('')}</select>`);
const num=k=>field(k,S[k]);
const EX=[['HEC-15 Grass lining (CU)',{shape:'trap',B:3,Z1:3,Z2:3,S:0.03,mode:'Q',Q:17.5,lt:'veg',vm:'cs',cond:'Good',hgt:0.25,gf:'Sod',st:'cohesive',cls:'SC',PI:16,e:0.5,SF:1}],
 ['HEC-15 Riprap, mild slope (CU)',{shape:'trap',B:2,Z1:3,Z2:3,S:0.02,mode:'Q',Q:40,Dd:2.5,lt:'rock',D50:5,gs:165,phi:38,SF:1}],
 ['HEC-15 RECP product A (CU)',{shape:'trap',B:3,Z1:3,Z2:3,S:0.03,mode:'Q',Q:10,lt:'recp',tl:1.25,t1:0.75,t2:1.5,t3:3,n1:0.038,n2:0.034,n3:0.031,st:'cohesive',cls:'SC',PI:16,e:0.5,SF:1}],
 ['HEC-15 Gabion (CU)',{shape:'trap',B:2,Z1:3,Z2:3,S:0.09,mode:'Q',Q:10,lt:'gabion',D50:6,gs:165,MT:0.75,SF:1}],
 ['HEC-15 Max discharge, riprap (CU)',{shape:'trap',B:3.3,Z1:4,Z2:4,S:0.015,mode:'d',d:2.56,Dd:3,lt:'rock',D50:6,gs:165,SF:1}],
 ['HEC-15 Max discharge, grass (CU)',{shape:'trap',B:3,Z1:3,Z2:3,S:0.05,mode:'d',d:0.59,lt:'veg',vm:'cs',cond:'Good',hgt:0.5,gf:'Sod',st:'coarse',D75:0.08,SF:1}],
 ['HEC-15 Channel bend (CU)',{shape:'trap',B:3.9,Z1:3,Z2:3,S:0.015,mode:'Q',Q:20,Rc:33,Dd:2,lt:'rock',D50:6,gs:165,SF:1}]];
function form(){let h=`<fieldset><legend>Flow</legend>${field('mode',null,`<select data-v="mode"><option value="Q"${S.mode==='Q'?' selected':''}>Normal depth for Q</option><option value="d"${S.mode==='d'?' selected':''}>Capacity at depth d</option></select>`)}${S.mode==='Q'?num('Q'):num('d')}<div id="qsrc"></div>
 <div class="f"><label><span>Worked examples</span><select id="ex"><option value="">— load an HEC-15 example —</option>${EX.map((e,i)=>`<option value="${i}">${e[0]}</option>`).join('')}</select></label></div></fieldset>`;
 h+=`<fieldset><legend>Ditch shape</legend>${sel('shape',[['v','V-ditch'],['trap','Trapezoidal'],['rect','Rectangular'],['para','Parabolic'],['round','V with rounded bottom (4 ft)'],['irr','Irregular x-y section']])}`;
 if(S.shape==='trap'||S.shape==='rect')h+=num('B');if(S.shape==='trap'||S.shape==='v')h+=num('Z1')+num('Z2');if(S.shape==='round')h+=num('Z1');
 if(S.shape==='para')h+=num('Tt')+num('Dt');if(S.shape==='irr')h+=field('pts',null,`<textarea data-t="pts" spellcheck="false">${S.pts}</textarea>`);
 h+=num('S')+num('Dd')+num('Rc')+'</fieldset>';
 h+=`<fieldset><legend>Lining</legend>${sel('lt',[['veg','Vegetation (grass)'],['recp','RECP (manufacturer data)'],['rock','Riprap / gravel / cobble'],['gabion','Gabion mattress'],['fixed','Rigid / bare soil (Table 2.1 n)'],['txdot','TxDOT HDM permissible shear table']])}`;
 if(S.lt==='veg'){h+=sel('vm',[['cs','Cover condition + stem height'],['ret','SCS retardance class']])+(S.vm==='ret'?sel('ret',['A','B','C','D','E']):sel('cond',Object.keys(DT.CS))+num('hgt'))+sel('gf',['Sod','Bunch','Mixed'])+(S.vm==='ret'?sel('cond',Object.keys(DT.CS)):'');}
 if(S.lt==='recp')h+=num('tl')+num('t1')+num('n1')+num('t2')+num('n2')+num('t3')+num('n3');
 if(S.lt==='rock'||S.lt==='gabion')h+=num('D50')+num('gs')+(S.lt==='rock'?num('phi'):num('MT'));
 if(S.lt==='fixed')h+=sel('fl',Object.keys(TBL21))+num('nfix');
 if(S.lt==='txdot')h+=sel('tx',Object.keys(TXT))+num('nx');
 h+=num('SF')+sel('life',[['perm','Permanent'],['trans','Transitional / temporary']])+'</fieldset>';
 const needSoil=S.lt==='veg'||S.lt==='recp'||(S.lt==='fixed'&&TBL21[S.fl][1]==='soil');
 if(needSoil){h+=`<fieldset><legend>Underlying soil</legend>${sel('st',[['fine','Fine non-cohesive (D75 < 0.05 in)'],['coarse','Coarse non-cohesive (Eq. 4.5)'],['cohesive','Cohesive (Eq. 4.6)'],['direct','Enter permissible soil shear']])}`;
  if(S.st==='cohesive')h+=sel('cls',Object.keys(DT.T46))+num('PI')+num('e');if(S.st==='coarse')h+=num('D75');if(S.st==='direct')h+=num('tps')+num('D75');h+='</fieldset>';}
 $('#form').innerHTML=h;qsrc();}
// ---- Q from Tc Studio ----
let HO=null;try{const q=new URLSearchParams(location.search);if(q.get('from')==='rational'){HO=JSON.parse(localStorage.getItem('hydro.handoff')||'null');if(!HO&&q.has('Q'))HO={Q:+q.get('Q'),Qcheck:+q.get('Qcheck'),rp:q.get('rp'),tc:q.get('tc'),C:q.get('C'),A:q.get('A'),i:q.get('i')};if(q.has('Q'))HO.Q=+q.get('Q');if(HO&&HO.Q>0){S.Q=HO.Q;S.mode='Q';}}}catch(e){}
function qsrc(){const el=$('#qsrc');if(!el)return;if(!HO){el.innerHTML='<div class="srcnote">Flow source: manual. Tip: use <b>Send to ditch tool</b> in <a href="../rational/">Tc Studio</a> to bring a Rational-method Q here.</div>';return;}
 el.innerHTML=`<div class="srcnote">From Tc Studio: Q = <b>${f(HO.Q,2)} cfs</b> (${HO.rp||'?'}-yr; C ${HO.C||'?'}, i ${HO.i||'?'} in/hr, A ${HO.A||'?'} ac, Tc ${HO.tc||'?'} min)${HO.Qcheck?` · 100-yr check ${f(HO.Qcheck,2)} cfs <button type="button" class="add" id="use100">Use 100-yr</button>`:''} <button type="button" class="add" id="useman">Type my own</button></div>`;
 const u=$('#use100');if(u)u.onclick=()=>{S.Q=HO.Qcheck;S.mode='Q';full();};$('#useman').onclick=()=>{HO=null;full();};}
function shapeObj(){const s={shape:S.shape,B:S.B,Z1:S.Z1,Z2:S.shape==='round'?S.Z1:S.Z2,Tt:S.Tt,Dt:S.Dt,S:S.S,Dd:S.Dd,Rc:S.Rc};
 if(S.shape==='irr'){s.pts=S.pts.split(/\n|;/).map(l=>l.split(/[ ,\t]+/).filter(Boolean).map(Number)).filter(p=>p.length===2&&p.every(isFinite));if(s.pts.length<3)throw new Error('Enter at least 3 x, y points.');for(let i=1;i<s.pts.length;i++)if(s.pts[i][0]<s.pts[i-1][0])throw new Error('x must increase left to right.');s.Dd=Math.min(s.pts[0][1],s.pts[s.pts.length-1][1])-Math.min(...s.pts.map(p=>p[1]));}
 return s;}
function soilObj(){return S.st==='cohesive'?{type:'cohesive',cls:S.cls,PI:S.PI,e:S.e}:S.st==='coarse'?{type:'coarse',D75:S.D75}:S.st==='direct'?{type:'direct',tp:S.tps,D75:S.D75}:{type:'fine'};}
function liningObj(){const L={type:S.lt};
 if(S.lt==='veg'){const Cs=S.vm==='ret'?DT.RET[S.ret].Cs:DT.CS[S.cond];L.Cn=S.vm==='ret'?DT.RET[S.ret].Cn:DT.Cn41(Cs,S.hgt);L.Cs=Cs;L.Cf=DT.CF[S.gf][S.cond];L.soil=soilObj();}
 if(S.lt==='recp')Object.assign(L,{tl:S.tl,tlow:S.t1,tmid:S.t2,tup:S.t3,nlow:S.n1,nmid:S.n2,nup:S.n3,soil:soilObj()});
 if(S.lt==='rock'||S.lt==='gabion')Object.assign(L,{D50:S.D50/12,gs:S.gs,phi:S.phi,MT:S.MT});
 if(S.lt==='fixed'){L.n=S.nfix;if(TBL21[S.fl][1]==='soil')L.tp=DT.soil(soilObj()).tp;}
 if(S.lt==='txdot'){L.type='txdot';L.n=S.nx;L.tp=TXT[S.tx];}
 return L;}
const badge=(ok,t)=>`<span class="badge ${ok==null?'na':ok?'ok':'no'}">${ok==null?'N/A':ok?'PASS':'FAIL'}</span>${t}`;
// ---- drawings ----
let anim={d:0,raf:0};
function profileOf(s,dTop){ // boundary polyline [[x,y]] (y = height above invert)
 if(s.shape==='irr'){const y0=Math.min(...s.pts.map(p=>p[1]));return s.pts.map(([x,y])=>[x,y-y0]);}
 if(s.shape==='para'){const k=s.Dt/Math.pow(s.Tt/2,2),a=Math.sqrt(dTop/k),out=[];for(let i=0;i<=40;i++){const x=-a+2*a*i/40;out.push([x,k*x*x]);}return out;}
 if(s.shape==='round'){const Z=s.Z1,out=[],xa=2;const y=x=>Math.abs(x)<=2?x*x/(4*Z):1/Z+(Math.abs(x)-2)/Z;const xm=2+Math.max(0,dTop-1/Z)*Z;for(let i=0;i<=40;i++){const x=-xm+2*xm*i/40;out.push([x,y(x)]);}return out;}
 const B=s.shape==='v'?0:s.B,z1=s.shape==='rect'?0:s.Z1,z2=s.shape==='rect'?0:s.Z2;return [[-B/2-z1*dTop,dTop],[-B/2,0],[B/2,0],[B/2+z2*dTop,dTop]];}
function drawXS(s,r,dd){const W=360,Hh=230,dTop=Math.max(s.Dd||0,r.d*1.25,0.5),pr=profileOf(s,dTop),xs=pr.map(p=>p[0]),x0=Math.min(...xs),x1=Math.max(...xs),ymax=Math.max(dTop,...pr.map(p=>p[1]));
 const sc=Math.min((W-40)/(x1-x0||1),(Hh-70)/ymax),X=x=>20+(x-x0)*sc+((W-40)-(x1-x0)*sc)/2,Y=y=>Hh-30-y*sc;
 const wl=dd,seg=[];// water polygon: clip boundary below wl
 const wpts=[];for(let i=0;i<pr.length-1;i++){let [a,b]=pr[i],[c,e]=pr[i+1];if(b>=wl&&e>=wl)continue;if(b>wl){const t=(b-wl)/(b-e);a=a+t*(c-a);b=wl;}if(e>wl){const t=(wl-b)/(e-b);c=a+t*(c-a);e=wl;}if(!wpts.length)wpts.push([a,wl]);wpts.push([a,b],[c,e]);}
 if(wpts.length)wpts.push([wpts[wpts.length-1][0],wl]);
 // shear distribution: normal arrows ∝ local depth (τ = γ y S, HEC-15 3.2 for rounded shapes; K1 reduction noted for trapezoid sides)
 let sh='';const tmax=DT.GAM*Math.max(dd,1e-6)*s.S,L=34;
 for(let i=0;i<pr.length-1;i++){const [a,b]=pr[i],[c,e]=pr[i+1],len=Math.hypot(c-a,e-b);if(!(len>1e-9))continue;const nseg=Math.max(1,Math.round(len*sc/14));for(let j=0;j<nseg;j++){const t=(j+0.5)/nseg,x=a+t*(c-a),y=b+t*(e-b);if(y>=wl)continue;const loc=wl-y,nx=-(e-b)/len,ny=(c-a)/len,l=L*loc/Math.max(dd,1e-6);
  sh+=`<line x1="${X(x)}" y1="${Y(y)}" x2="${X(x)+nx*l*0.6}" y2="${Y(y)-ny*l*0.6}" stroke="#c0392b" stroke-width="1.4" marker-end="url(#ar)"/>`;}}
 const bank=s.Dd!=null?`<line x1="10" x2="${W-10}" y1="${Y(s.Dd)}" y2="${Y(s.Dd)}" stroke="#2e7d32" stroke-dasharray="6 3"/><text x="12" y="${Y(s.Dd)-3}" font-size="10" fill="#2e7d32">top of ditch (${f(s.Dd,2)} ft)</text>`:'';
 const fbt=r.fb?`<line x1="${W-30}" x2="${W-30}" y1="${Y(dd)}" y2="${Y(s.Dd)}" stroke="#9a6b00" stroke-width="2"/><text x="${W-34}" y="${(Y(dd)+Y(s.Dd))/2+3}" font-size="10" text-anchor="end" fill="#9a6b00">freeboard ${f(s.Dd-dd,2)} ft</text>`:'';
 return `<defs><marker id="ar" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L6,3L0,6z" fill="#c0392b"/></marker></defs>
 ${wpts.length?`<polygon class="wat" points="${wpts.map(([x,y])=>`${X(x)},${Y(y)}`).join(' ')}" fill="#9cc9f0" stroke="#1f77b4"/>`:''}
 <polyline points="${pr.map(([x,y])=>`${X(x)},${Y(y)}`).join(' ')}" fill="none" stroke="#333" stroke-width="3"/>${sh}${bank}${fbt}
 <text x="12" y="16" font-size="11" fill="#1f77b4">d = ${f(dd,3)} ft · T = ${f(r.g.T,2)} ft</text><text x="12" y="30" font-size="11" fill="#c0392b">→ shear γ·y·S (max τd = ${f(tmax,3)} lb/ft² at the deepest point)</text>
 <text x="${W/2}" y="${Hh-10}" font-size="10" text-anchor="middle" fill="#555">${r.K1!=null?`side slopes: τs = K1·τd = ${f(r.K1,2)}·τd (Eq. 3.3–3.4)`:'shear on sides follows local depth (HEC-15 3.2)'}</text>`;}
function animate(s,r){cancelAnimationFrame(anim.raf);const from=anim.d||0,to=r.d,t0=performance.now(),dur=matchMedia('(prefers-reduced-motion: reduce)').matches?0:600;
 const step=t=>{const k=dur?Math.min(1,(t-t0)/dur):1,e=1-Math.pow(1-k,3),d=from+(to-from)*e;anim.d=d;$('#xs').innerHTML=drawXS(s,r,d);if(k<1)anim.raf=requestAnimationFrame(step);};anim.raf=requestAnimationFrame(step);}
function drawRC(s,L,r){const W=360,Hh=230,dmax=Math.max(s.Dd||0,r.d*1.3,0.3),pts=DT.rating(s,L,dmax,36).filter(p=>isFinite(p[1])&&p[1]>0),qmax=Math.max(...pts.map(p=>p[1]),r.Q)*1.08;
 const X=q=>44+q/qmax*(W-60),Y=d=>Hh-30-d/dmax*(Hh-50);let ax='';for(let i=0;i<=4;i++){const q=qmax*i/4,d=dmax*i/4;ax+=`<text x="${X(q)}" y="${Hh-16}" font-size="9" text-anchor="middle">${f(q,q<10?1:0)}</text><text x="40" y="${Y(d)+3}" font-size="9" text-anchor="end">${f(d,2)}</text><line x1="44" x2="${W-16}" y1="${Y(d)}" y2="${Y(d)}" stroke="#eef1f5"/>`;}
 return `${ax}<line x1="44" x2="44" y1="20" y2="${Hh-30}" stroke="#333"/><line x1="44" x2="${W-16}" y1="${Hh-30}" y2="${Hh-30}" stroke="#333"/>
 <polyline points="${pts.map(([d,q])=>`${X(q)},${Y(d)}`).join(' ')}" fill="none" stroke="#1f77b4" stroke-width="2.5"/>
 ${s.Dd?`<line x1="44" x2="${W-16}" y1="${Y(s.Dd)}" y2="${Y(s.Dd)}" stroke="#2e7d32" stroke-dasharray="6 3"/><text x="${W-18}" y="${Y(s.Dd)-3}" font-size="9" text-anchor="end" fill="#2e7d32">top of ditch</text>`:''}
 <line x1="44" x2="${W-16}" y1="${Y(r.dc)}" y2="${Y(r.dc)}" stroke="#9a6b00" stroke-dasharray="3 3"/><text x="48" y="${Y(r.dc)-3}" font-size="9" fill="#9a6b00">critical depth at design Q</text>
 <circle cx="${X(r.Q)}" cy="${Y(r.d)}" r="5" fill="#c0392b"/><text x="${X(r.Q)>W/2?X(r.Q)-8:X(r.Q)+8}" y="${Y(r.d)+(Math.abs(r.d-r.dc)<dmax*0.08?16:-8)}" font-size="10" text-anchor="${X(r.Q)>W/2?'end':'start'}" fill="#c0392b">design ${f(r.Q,1)} cfs @ ${f(r.d,2)} ft</text>
 <text x="${W/2}" y="${Hh-2}" font-size="10" text-anchor="middle">Q (cfs)</text><text x="10" y="14" font-size="10">depth (ft)${L.type==='fixed'||L.type==='txdot'?'':' · n varies with depth'}</text>`;}
function drawPF(s,r){const W=360,ang=Math.atan(Math.min(s.S*8,0.35)),y0=20,y1=y0+Math.tan(ang)*(W-40);const dpx=Math.min(24,8+r.d*10);
 return `<line x1="20" y1="${y0+30}" x2="${W-20}" y2="${y1+30}" stroke="#333" stroke-width="3"/><polygon points="20,${y0+30} ${W-20},${y1+30} ${W-20},${y1+30-dpx} 20,${y0+30-dpx}" fill="#9cc9f0" opacity=".85"/>
 <text x="24" y="${y0+44}" font-size="10">S = ${f(s.S*100,2)} % (exaggerated)</text><text x="${W-24}" y="${y1+18-dpx}" font-size="10" text-anchor="end" fill="#1f77b4">normal depth ${f(r.d,2)} ft · V ${f(r.V,2)} ft/s · ${r.regime}</text>`;}
function render(){let r,s,L;try{s=shapeObj();L=liningObj();r=DT.analyze(s,L,{mode:S.mode,Q:S.Q,d:S.d,SF:S.SF,life:S.life});if(!isFinite(r.d)||!isFinite(r.Q))throw new Error('No solution for these inputs.');}
 catch(e){$('#summary').innerHTML=`<div class="kpi gov">Error<b>—</b><span>${e.message}</span></div>`;['#checks','#table','#explain'].forEach(i=>$(i).innerHTML='');$('#xs').innerHTML='';$('#rc').innerHTML='';$('#pf').innerHTML='';return;}
 const stab=r.rigid?null:r.tp==null?null:r.bottomOk&&(r.sideOk!==false)&&(!r.bend||r.bend.ok!==false);
 $('#summary').innerHTML=`<div class="kpi gov">${S.mode==='Q'?'Normal depth d':'Capacity Q'}<b>${S.mode==='Q'?f(r.d,3)+' ft':f(r.Q,2)+' cfs'}</b><span>${S.mode==='Q'?`Q ${f(r.Q,2)} cfs`:`at d ${f(r.d,2)} ft`} · V ${f(r.V,2)} ft/s · Fr ${f(r.Fr,2)} ${r.regime}</span></div>
 <div class="kpi">Lining<b>${stab==null?(r.rigid?'rigid':'n/a'):stab?'✓ stable':'✗ unstable'}</b><span>τd ${f(r.td,3)}${r.tp!=null?` vs τp ${f(r.tp,2)}`:''} lb/ft²</span></div>
 <div class="kpi">Freeboard<b>${r.fb?(r.fb.ok?'✓ ':'✗ ')+f(r.fb.avail,2)+' ft':'—'}</b><span>${r.fb?'needs '+f(r.fb.req,2)+' ft':''}</span></div><div class="kpi">Critical depth<b>${f(r.dc,3)} ft</b></div>`;
 const C=[];C.push(['Capacity / depth',r.fb?r.fb.avail>=0:null,r.fb?`Flow depth ${f(r.d,3)} ft ${r.fb.avail>=0?'≤':'>'} ditch depth ${f(s.Dd,2)} ft${r.fb.avail<0?' — the ditch overtops':''}.`:'Enter a ditch depth.']);
 C.push(['Freeboard (HEC-15 2.3.4)',r.fb?r.fb.ok:null,r.fb?`Available ${f(r.fb.avail,2)} ft; required ${f(r.fb.req,2)} ft = ${r.fb.steep?'flow depth (supercritical — "steep gradient channels should have a freeboard height equal to the flow depth")':S.life==='trans'?'0 (transitional lining: "zero freeboard may be acceptable")':'0.5 ft (permanent channel)'}${r.bend?` + bend superelevation Δd ${f(r.bend.dd,3)} ft (Eq. 3.9)`:''}. TxDOT HDM Ch. 7 Sec. 3 asks for the "maximum allowable depth of channel including freeboard" but gives no number, so the HEC-15 value is used.`:'—']);
 C.push(['Bottom shear (Eq. 3.1/3.2)',r.rigid?null:r.bottomOk,r.rigid?'Rigid lining treated as non-erodible (no shear check).':r.tp==null?'No permissible shear for this lining.':`τd = γ·d·S = 62.4·${f(r.d,3)}·${S.S} = ${f(r.td,3)} lb/ft²; SF·τd = ${f(r.SF*r.td,3)} ${r.bottomOk?'≤':'>'} τp = ${f(r.tp,3)} lb/ft².`]);
 if(r.K1!=null&&!r.rigid&&r.tp!=null)C.push(['Side shear',r.sideOk,S.lt==='rock'&&r.side?`Riprap side slope (Eq. 6.15–6.17): K1 = ${f(r.K1,3)}, θ = ${f(r.side.th,1)}°, K2 = ${f(r.side.K2,3)} → D50,side = K1/K2·D50,bottom = ${f(r.side.D50s*12,2)} in vs ${S.D50} in provided.`:`τs = K1·τd = ${f(r.K1,3)}·${f(r.td,3)} = ${f(r.ts,3)} lb/ft² (Eq. 3.3–3.4) vs τp ${f(r.tp,3)}.`]);
 if(r.bend)C.push(['Bend (Eq. 3.6–3.9)',r.bend.ok==null?null:r.bend.ok,`Rc/T = ${f(r.bend.x,2)} → Kb = ${f(r.bend.Kb,3)}; τb = Kb·τd = ${f(r.bend.tb,3)} lb/ft²${r.tp!=null?` vs τp/SF ${f(r.tp/r.SF,3)}`:''}. Protect ${f(r.bend.Lp,1)} ft downstream of the bend (Eq. 3.8); extra freeboard Δd = ${f(r.bend.dd,3)} ft (Eq. 3.9).`]);
 C.push(['TxDOT allowable velocity',null,`TxDOT HDM Ch. 7 Sec. 3 uses the tractive-force (shear) method and its "Permissible Shear Stresses for Various Linings" table; no allowable-velocity table was found there, so no velocity pass/fail is applied. V = ${f(r.V,2)} ft/s for reference.`]);
 if(r.Fr>0.86&&r.Fr<1.13)C.push(['Near-critical flow',false,`Fr = ${f(r.Fr,2)}: flow near critical depth is unstable (waves); consider changing slope or section.`]);
 $('#checks').innerHTML=C.map(([t,ok,x])=>`<div class="ck">${badge(ok,'')}<div><b>${t}.</b> ${x}</div></div>`).join('');
 const lin=r.lining,R=[['Flow depth d',f(r.d,3),'ft'],['Discharge Q',f(r.Q,3),'cfs'],['Area A',f(r.g.A,3),'ft²'],['Wetted perimeter P',f(r.g.P,3),'ft'],['Hydraulic radius R',f(r.R,3),'ft'],['Top width T',f(r.g.T,3),'ft'],['Manning n ('+r.nn.how+')',f(r.n,4),''],['Velocity V',f(r.V,3),'ft/s'],['Froude Fr = V/√(gA/T)',f(r.Fr,3),r.regime],['Critical depth dc',f(r.dc,3),'ft'],['Mean shear τo = γRS',f(r.to,3),'lb/ft²'],['Max shear τd = γdS',f(r.td,3),'lb/ft²'],['Permissible τp',r.tp==null?'—':f(r.tp,3),'lb/ft²'],['Safety factor used',f(r.SF,2),'']];
 if(lin.soil)R.push(['Permissible soil shear τp,soil',f(lin.soil.tp,4),'lb/ft²'],['Soil grain roughness ns',f(lin.soil.ns,4),'']);
 if(lin.Re!=null)R.push(['Shear velocity V* = √(gdS)',f(lin.Vs,3),'ft/s'],['Particle Reynolds Re',lin.Re.toExponential(2),''],["Shields' F* / table SF",`${f(lin.F,3)} / ${f(lin.SFtab,2)}`,''],['Minimum stable D50 (Eq. 6.8)',f(lin.D50req*12,2),'in']);
 if(lin.tpM!=null)R.push(['Gabion τp by fill / by thickness',`${f(lin.tpR,2)} / ${f(lin.tpM,2)}`,'lb/ft²']);
 $('#table').innerHTML=`<table><tbody>${R.map(([a,b,c])=>`<tr><td>${a}</td><td>${b}</td><td>${c||''}</td></tr>`).join('')}</tbody></table>`;
 $('#explain').innerHTML='<ol>'+explain(s,L,r).map(x=>`<li>${x}</li>`).join('')+'</ol>';
 $('#refs').innerHTML=`<b>Sources:</b> FHWA HEC-15 3rd ed., "Design of Roadside Channels with Flexible Linings" (FHWA-NHI-05-114, Sept 2005), Ch. 2–7 and App. B — <a href="${U15}" target="_blank" rel="noopener">PDF</a>. TxDOT Hydraulic Design Manual (rev. 9/2019) Ch. 7 "Channels", Sec. 3 "Roadside Channel Design" (Eq. 7-1–7-3, retardance and permissible shear tables) — <a href="${UHDM}" target="_blank" rel="noopener">TxDOT manuals</a>. US customary units. Engineering aid — verify with your own judgment and the governing criteria.`;
 animate(s,r);$('#rc').innerHTML=drawRC(s,L,r);$('#pf').innerHTML=drawPF(s,r);}
function explain(s,L,r){const E=[],g=r.g;
 E.push(`Geometry at d = ${f(r.d,3)} ft (HEC-15 App. B${s.shape==='irr'?'; irregular section integrated segment by segment':''}): A = ${f(g.A,3)} ft², P = ${f(g.P,3)} ft, R = A/P = ${f(r.R,3)} ft, T = ${f(g.T,3)} ft.`);
 if(L.type==='veg')E.push(`Grass roughness: Cn = ${S.vm==='ret'?`${f(L.Cn,3)} (Table 4.4, class ${S.ret})`:`0.237·Cs<sup>0.10</sup>·h<sup>0.528</sup> = 0.237·${L.Cs}<sup>0.10</sup>·${S.hgt}<sup>0.528</sup> = ${f(L.Cn,3)} (Eq. 4.1, Cs from Table 4.2 "${S.cond}")`}; τo = γRS = ${f(r.to,3)} lb/ft²; n = 0.213·Cn·τo<sup>−0.4</sup> = ${f(r.n,4)} (Eq. 4.2). n changes with depth, so the depth is found by iteration (HEC-15 Fig. 3.1).`);
 if(L.type==='recp')E.push(`RECP roughness (Eq. 5.1–5.3): b = ln(n<sub>upper</sub>/n<sub>lower</sub>)/ln(τ<sub>upper</sub>/τ<sub>lower</sub>) = ${f(r.nn.b,3)}, a = n<sub>mid</sub>/τ<sub>mid</sub><sup>b</sup> = ${f(r.nn.a,4)}; n = a·τo<sup>b</sup> = ${f(r.n,4)} at τo = ${f(r.to,3)} lb/ft².`);
 if(L.type==='rock'||L.type==='gabion')E.push(`Stone roughness: da = A/T = ${f(r.nn.da,3)} ft, da/D50 = ${f(r.nn.r,2)} → ${r.nn.how}: n = ${f(r.n,4)}${r.nn.Fr!=null?` (Fr = ${f(r.nn.Fr,3)}, b = ${f(r.nn.b,3)}, f(Fr) = ${f(r.nn.fFr,3)}, f(REG) = ${f(r.nn.fREG,2)}, f(CG) = ${f(r.nn.fCG,3)})`:''}.`);
 if(L.type==='fixed'||L.type==='txdot')E.push(`Constant Manning n = ${L.n}${L.type==='fixed'?` (HEC-15 Table 2.1 typical for ${S.fl})`:' (your value; the TxDOT table gives only τp)'}.`);
 E.push(S.mode==='Q'?`Normal depth from Manning (HEC-15 Eq. 2.1/2.2; TxDOT HDM Eq. 7-1): Q = (1.49/n)·A·R<sup>2/3</sup>·S<sup>1/2</sup> = ${f(r.Q,3)} cfs at d = ${f(r.d,3)} ft (solved by bisection).`:`Capacity at d = ${f(r.d,3)} ft: Q = (1.49/n)·A·R<sup>2/3</sup>·S<sup>1/2</sup> = ${f(r.Q,3)} cfs.`);
 E.push(`V = Q/A = ${f(r.V,3)} ft/s; Fr = V/√(g·A/T) = ${f(r.Fr,3)} → ${r.regime}. Critical depth dc = ${f(r.dc,3)} ft (Q²T/(gA³) = 1).`);
 if(r.tp!=null||r.rigid)E.push(`Shear: τd = γ·d·S = ${f(r.td,3)} lb/ft² (HEC-15 Eq. 3.1; TxDOT Eq. 7-3). ${r.rigid?'Rigid lining: non-erodible.':`Check τp ≥ SF·τd (Eq. 3.2): ${f(r.tp,3)} ${r.bottomOk?'≥':'<'} ${f(r.SF*r.td,3)} → ${r.bottomOk?'stable':'not stable'}.`}`);
 if(r.lining.soil&&L.type==='veg')E.push(`Vegetation permissible shear (Eq. 4.7): τp = τp,soil/(1 − Cf)·(n/ns)² = ${f(r.lining.soil.tp,4)}/(1 − ${L.Cf})·(${f(r.n,4)}/${f(r.lining.soil.ns,4)})² = ${f(r.tp,3)} lb/ft². Soil: ${r.lining.soil.how}; Cf from Table 4.5 (${S.gf}, ${S.cond}). Effective soil shear τe = ${f(r.lining.te,4)} lb/ft² (Eq. 4.3).`);
 if(r.lining.soil&&L.type==='recp')E.push(`RECP permissible shear (Eq. 5.5): τp = (τl/0.14)·(τp,soil + 0.14/4.3) = (${S.tl}/0.14)·(${f(r.lining.soil.tp,4)} + 0.0326) = ${f(r.tp,3)} lb/ft². Soil: ${r.lining.soil.how}.`);
 if(r.lining.Re!=null)E.push(`${L.type==='gabion'?'Gabion':'Riprap'}: V* = √(g·d·S) = ${f(r.lining.Vs,3)} ft/s, Re = V*·D50/ν = ${r.lining.Re.toExponential(2)} → F* = ${f(r.lining.F,3)}, SF ≥ ${f(r.lining.SFtab,2)} (Table 6.1${L.type==='gabion'?'; gabion F* = 0.10 with SF 1.25, Sec. 7.2':''}). τp = F*(γs − γ)D50 = ${f(r.lining.tpR,3)} lb/ft² (Eq. ${L.type==='gabion'?'7.1':'6.7'})${r.lining.tpM!=null?`; by thickness 0.0091(γs − γ)(MT + 4.07) = ${f(r.lining.tpM,3)} (Eq. 7.2); larger governs`:''}. Minimum stable D50 = SF·d·S/(F*(SG − 1)) = ${f(r.lining.D50req*12,2)} in (Eq. 6.8).${S.S>0.05?' <span class="warn">HEC-15 6.2: for slopes over 10% use Eq. 6.11 (5–10%: both, take the larger) — not implemented here.</span>':''}`);
 return E;}
function full(){form();render();}
$('#form').addEventListener('input',e=>{const k=e.target.dataset.v,t=e.target.dataset.t;if(t==='pts'){S.pts=e.target.value;render();return;}if(!k||e.target.tagName==='SELECT')return;const v=parseFloat(e.target.value);if(isFinite(v)){S[k]=v;render();const w=e.target.closest('.f'),o=w.querySelector('.warn');if(o)o.remove();w.insertAdjacentHTML('beforeend',warn(k,v));}});
$('#form').addEventListener('change',e=>{if(e.target.id==='ex'){const x=EX[+e.target.value];if(x){Object.assign(S,{Rc:0,Dd:1.5},x[1]);HO=null;full();}return;}const k=e.target.dataset.v;if(k&&e.target.tagName==='SELECT'){S[k]=e.target.value;if(k==='fl')S.nfix=TBL21[S.fl][0];full();}});
$('#form').addEventListener('click',e=>{if(e.target.classList.contains('i')){e.preventDefault();e.target.closest('.f').classList.toggle('open');}});
full();
