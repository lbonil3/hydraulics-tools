/* "Inlet spacing" mode for Drainage Studio. Uses SP (spacing.js) -> DR (calc.js) and the Tc Studio IDF data. */
(function(){
const RPS=[2,5,10,25,50,100],IDF=()=>S.space.ser==='AMS'?window.IDF_AMS:window.IDF_PDS;
const COUNTIES=[...new Set(window.IDF_PDS.map(r=>r[0]))];
S.space={wmode:'lanes',nl:4,ex:0,crown:'half',amode:'wl',Aac:0.25,xax:'len',pw:24,L:300,C:0.9,imode:'idf',county:'Travis',zone:'Zone-1',ser:'PDS',rp:'10',tc:10,i:6,Qco:0,
 gt:'uniform',SL:0.01,Sx:0.02,n:0.016,W:2,a:2,it:'curb',cl:10,ca:3,cw:2,meth:'TxDOT',gw:2,gl:3,Vo:8.2,
 road:'txmaj',lane:12,sh:0,Tc:10,curb:6,Qblim:0.5,chainN:'4',chainMode:'auto'};
const ROAD={txi:['TxDOT: interstate / controlled-access main lanes — ½ outer lane',(s)=>s.sh+0.5*s.lane],
 txmaj:['TxDOT: major highway (2+ lanes each direction) — outer lane',(s)=>s.sh+s.lane],
 txmin:['TxDOT: minor highway — keep one lane open each direction (enter T)',null],
 hpa1:['HEC-22 Table 5.1: principal arterial < 45 mph — shoulder + 3 ft',(s)=>s.sh+3],
 hpa2:['HEC-22 Table 5.1: principal arterial > 45 mph — shoulder',(s)=>s.sh],
 hco1:['HEC-22 Table 5.1: collector < 45 mph — ½ driving lane',(s)=>s.sh+0.5*s.lane],
 hco2:['HEC-22 Table 5.1: collector > 45 mph — shoulder',(s)=>s.sh],
 hloc:['HEC-22 Table 5.1: local street — ½ driving lane',(s)=>s.sh+0.5*s.lane],
 custom:['Custom allowable spread (enter T)',null]};
Object.assign(H,{
 wmode:['Roadway width','','Type the width directly, or build it from lanes.','Typical section.',null],
 nl:['Number of lanes','','Crowned: total lanes of the roadway (half drains to this gutter). Full width: lanes that slope to this gutter.','Typical section.',[1,8]],
 lw:['Lane width','ft','Travel lane width (also used for the spread criterion).','Typical section (12 ft typical).',[10,12]],
 shw:['Shoulder / parking width','ft','Paved width between the outer lane and the curb (also counted in the allowable spread).','Typical section.',[0,10]],
 ex:['Extra width (sidewalk, median)','ft','Any other paved width that drains to this gutter.','Typical section.',[0,20]],
 crown:['Cross slope','','Crowned: half of the built width drains to this gutter. Full width: superelevated or one-way cross slope, all of it drains here.','Typical section / superelevation diagram.',null],
 amode:['Area input','','Width × length (normal), or type the drainage area in acres. In acres mode the max solver finds the maximum area instead of length.','',null],
 Aac:['Drainage area A','ac','Area draining to this inlet.','Drainage area map.',[0.01,5]],
 xax:['Chart x-axis','','Plot against length (ft) or drainage area (ac).','',null],
 pw:['Pavement width draining to gutter','ft','Width of roadway (lanes + shoulder) that sheds water toward this gutter.','Typical section: crown to curb (one side), or full width if superelevated toward this curb.',[10,80]],
 L:['Roadway length to inlet','ft','Length of the pavement strip upstream of the inlet. Drainage area A = width × length.','Trial value — drag the slider or press "Find max length".',[50,1500]],
 Cp:['Runoff coefficient C','','Rational Method C for the pavement strip.','TxDOT HDM Table 4-10: streets, asphaltic 0.85–0.95, concrete 0.90–0.95 (as listed in Tc Studio).',[0.7,0.95]],
 imode:['Rainfall intensity','','From the TxDOT EBDLKUP-2019 IDF coefficients (same data as Tc Studio) or typed in.','',null],
 county:['County','','IDF coefficients by county.','TxDOT EBDLKUP-2019.',null],zone:['IDF zone','','Some counties have several zones.','EBDLKUP-2019.',null],
 ser:['IDF series','','PDS (partial duration) or AMS (annual maximum).','Same choice as Tc Studio.',null],
 rp:['Design frequency','yr','Return period of the design storm.','TxDOT HDM Ch. 4 Table 4-2: storm drain inlets on interstate / controlled-access main lanes 20% AEP (5-yr); other highways and frontage roads 10% AEP (10-yr) recommended.',null],
 tcI:['Time of concentration','min','Inlet Tc; TxDOT uses a 10-minute minimum for Rational intensity.','Tc Studio, or 10 min for short pavement strips.',[10,60]],
 iI:['Intensity i','in/hr','Design rainfall intensity.','IDF curve at Tc.',[1,15]],
 Qco:['Carryover from upstream inlet','cfs','Bypass flow arriving from the inlet upstream (0 for the first inlet).','Bypass result of the upstream inlet.',[0,3]],
 cl2:['Curb opening length L','ft','Curb opening length of the inlet.','TxDOT curb inlet standards (5, 10, 15, 20 ft …).',[5,30]],
 road:['Road type (spread criterion)','','Sets the allowable ponded width.','TxDOT HDM Ch. 10 Sec. 4 "Ponding" (txdot.gov/manuals/des/hyd/chapter-10--storm-drains/section-4--pavement-drainage/ponding.html); HEC-22 4th ed. Table 5.1 (example minimums).',null],
 lane:['Outer lane width','ft','Width of the travel lane next to the gutter.','Typical section (12 ft typical).',[10,12]],
 sh:['Shoulder / parking width','ft','Width between curb and the outer lane line (0 if none). Ponded width is measured from the curb, so it includes this.','Typical section.',[0,10]],
 Tc2:['Allowable spread T (custom)','ft','Your allowable ponded width measured from the curb.','Project criteria.',[4,20]],
 curb:['Curb height (depth limit)','in','TxDOT: "Depth of flow should not exceed the curb height." Enter your curb height.','Curb & gutter detail (check your standard).',[4,8]],
 Qblim:['Bypass limit','cfs','Maximum carryover you accept past this inlet.','Your design rule (default 0.5 cfs).',[0,2]],
 chainN:['Inlets in chain','','Number of successive inlets down the street.','',null],
 chainMode:['Chain spacing','','Auto: each inlet placed at its own maximum length (with carryover from the one above). Fixed: every inlet uses the slider length.','',null]});
function P(){const s=S.space;let i=s.i,K=null;
 if(s.imode==='idf'){const rows=IDF().filter(r=>r[0]===s.county);const row=rows.find(r=>r[1]===s.zone)||rows[0];s.zone=row[1];const [e,b,d]=row[2+RPS.indexOf(+s.rp)];K={e,b,d};i=Tc.intensity(K,Math.max(10,s.tc));}
 const Tal=ROAD[s.road][1]?ROAD[s.road][1](s):s.Tc;
 const Wd=s.wmode==='lanes'?SP.roadWidth({nl:s.nl,lw:s.lane,sh:s.sh,ex:s.ex,crown:s.crown}):s.pw;s._W=Wd;
 return {p:{W:s.amode==='ac'?43560:Wd,C:s.C,i,Qco:s.Qco,g:{type:s.gt,n:s.n,SL:s.SL,Sx:s.Sx,W:s.W,a:s.a},inlet:{type:s.it,cl:s.cl,ca:s.ca,cw:s.cw,meth:s.meth,gw:s.gw,gl:s.gl,Vo:s.Vo},lim:{Qb:s.Qblim,T:Tal,d:s.curb/12}},K,i,Tal};}
const oForm=window.form,oRender=window.render;
window.form=function(){if(mode!=='space')return oForm();const s=S.space;let h='';
 const ac=s.amode==='ac';
 h+=`<fieldset><legend>1. Drainage area</legend>${sel('amode',s.amode,[['wl','Roadway width × length'],['ac','Enter area directly (ac)']])}`;
 if(!ac){h+=sel('wmode',s.wmode,[['lanes','Build from lanes'],['direct','Type width directly']]);
  if(s.wmode==='lanes')h+=field('nl',s.nl,null,'nl')+field('lw',s.lane,null,'lane')+field('shw',s.sh,null,'sh')+num('ex',s)+sel('crown',s.crown,[['half','Crowned — half width drains here'],['full','Full width (superelevated / one-way)']]);
  else h+=field('pw',s.pw,null,'pw');
  h+=`<div class="f" data-k="L"><label><span>${H.L[0]} (ft) <button class="i" type="button">i</button></span><input data-v="L" type="number" inputmode="decimal" step="any" value="${s.L}"></label><div class="help"><b>What:</b> ${H.L[2]}<br><b>Where:</b> ${H.L[3]}</div>
  <input class="sprange" data-v="L" type="range" min="10" max="2000" step="5" value="${s.L}" aria-label="Length slider"></div>`;}
 else h+=`<div class="f" data-k="Aac"><label><span>${H.Aac[0]} (ac) <button class="i" type="button">i</button></span><input data-v="Aac" type="number" inputmode="decimal" step="any" value="${s.Aac}"></label><div class="help"><b>What:</b> ${H.Aac[2]}</div>
  <input class="sprange" data-v="Aac" type="range" min="0.01" max="5" step="0.01" value="${s.Aac}" aria-label="Area slider"></div>`;
 h+=`<div class="spArea" id="spArea"></div><button type="button" class="add" id="spmax">${ac?'Find max area':'Find max length'}</button> <button type="button" class="add" id="spuse">${ac?'Use max area':'Use max length'}</button></fieldset>`;
 h+=`<fieldset><legend>2. Runoff &amp; rainfall</legend>${field('Cp',s.C,null,'C')}${sel('imode',s.imode,[['idf','County IDF (EBDLKUP-2019)'],['manual','Type i manually']])}`;
 if(s.imode==='idf'){const zs=IDF().filter(r=>r[0]===s.county).map(r=>r[1]);h+=sel('county',s.county,COUNTIES.map(c=>[c,c]))+(zs.length>1?sel('zone',s.zone,zs.map(z=>[z,z])):'')+sel('ser',s.ser,[['PDS','PDS'],['AMS','AMS']])+sel('rp',s.rp,RPS.map(r=>[r,r+'-yr']))+field('tcI',s.tc,null,'tc');}
 else h+=field('iI',s.i,null,'i');
 h+=num('Qco',s)+'</fieldset>';
 h+=`<fieldset><legend>Gutter</legend>${sel('gt',s.gt,[['uniform','Uniform cross slope'],['composite','Composite (depressed gutter)']])}${num('SL',s)}${num('Sx',s)}${num('n',s)}${s.gt==='composite'?num('W',s)+num('a',s):''}</fieldset>`;
 h+=`<fieldset><legend>Inlet on grade</legend>${sel('it',s.it,[['curb','Curb opening'],['grate','Grate'],['combo','Combination (grate + curb)']])}`;
 if(s.it!=='grate')h+=field('cl2',s.cl,null,'cl')+num('ca',s)+num('cw',s)+sel('meth',s.meth,[['TxDOT','TxDOT HDM (Eq. 10-5…10-13)'],['HEC22','HEC-22 (Eq. 5.7/7.11)']]);
 if(s.it!=='curb')h+=num('gw',s)+num('gl',s)+num('Vo',s);h+='</fieldset>';
 h+=`<fieldset><legend>Design criteria</legend>${sel('road',s.road,Object.entries(ROAD).map(([k,v])=>[k,v[0]]))}${s.wmode==='lanes'&&s.amode!=='ac'?'<div class="lvnote" style="font-size:12.5px;color:#556">Lane and shoulder widths come from section 1.</div>':num('lane',s)+num('sh',s)}${ROAD[s.road][1]?'':field('Tc2',s.Tc,null,'Tc')}${num('curb',s)}${num('Qblim',s)}</fieldset>`;
 h+=`<fieldset><legend>Chain of inlets &amp; chart</legend>${s.amode==='ac'?'':sel('xax',s.xax,[['len','Chart vs length (ft)'],['ac','Chart vs area (ac)']])}${sel('chainN',s.chainN,[1,2,3,4,5,6,8,10].map(n=>[n,n]))}${sel('chainMode',s.chainMode,[['auto','Auto (each at max length)'],['fixed','Fixed (slider length)']])}</fieldset>`;
 $('#form').innerHTML=h;
 $('#spmax').onclick=()=>{const m=SP.maxL(P().p);$('#spmaxout')&&$('#spmaxout').scrollIntoView({block:'nearest'});flash(m);};
 $('#spuse').onclick=()=>{const m=SP.maxL(P().p);if(isFinite(m.L)&&m.L>0){if(s.amode==='ac')s.Aac=Math.floor(m.L*1000)/1000;else s.L=Math.floor(m.L);form();render();}};};
function flash(m){const el=$('#spmaxout');if(el){el.classList.remove('spflash');void el.offsetWidth;el.classList.add('spflash');}}
const badge=(ok,t)=>`<span class="spb ${ok?'ok':'no'}">${ok?'✓':'✗'} ${t}</span>`;
function chart(p,L,m,ax){ax=ax||{k:1,u:'Length to inlet (ft)',d:0};const Lm=Math.max(isFinite(m.L)?m.L*1.8:L*2,L*1.3,100),N=60,pts=[];for(let k=0;k<=N;k++){const x=Lm*k/N;pts.push(SP.evalL(p,x));}
 const X=x=>40+300*x/Lm,pan=[['Qb','Bypass (cfs)',p.lim.Qb,'#c0392b'],['T','Spread T (ft)',p.lim.T,'#1f77b4'],['d','Depth d (ft)',p.lim.d,'#2e8b57']];let h='';
 pan.forEach(([k,l,lim,col],j)=>{const y0=10+j*92,H=70,mx=Math.max(lim*1.4,...pts.map(r=>r[k]))||1,Y=v=>y0+H-H*Math.min(v,mx)/mx;
  h+=`<rect x="40" y="${y0}" width="300" height="${H}" fill="#f8fafc" stroke="#e3e8ef"/><text x="44" y="${y0+12}" font-size="11" font-weight="700">${l}</text>
  <polyline points="${pts.map(r=>X(r.L).toFixed(1)+','+Y(r[k]).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="2.2"/>
  <line x1="40" x2="340" y1="${Y(lim)}" y2="${Y(lim)}" stroke="${col}" stroke-dasharray="5 3"/><text x="338" y="${Y(lim)-3}" font-size="10" text-anchor="end" fill="${col}">limit ${f(lim,2)}</text>
  <text x="36" y="${y0+H}" font-size="9" text-anchor="end">0</text><text x="36" y="${y0+10}" font-size="9" text-anchor="end">${f(mx,mx<2?2:1)}</text>`;});
 h+=`<line x1="${X(L)}" x2="${X(L)}" y1="8" y2="268" stroke="#1d2733" stroke-width="1.5"/><text x="${Math.min(X(L)+3,300)}" y="282" font-size="10">${f(L*ax.k,ax.d)}</text>`;
 if(isFinite(m.L))h+=`<line x1="${X(m.L)}" x2="${X(m.L)}" y1="8" y2="268" stroke="#d4a017" stroke-width="2" stroke-dasharray="3 2"/><text x="${Math.max(X(m.L)-3,60)}" y="294" font-size="10" text-anchor="end" fill="#9a6b00">max ${f(m.L*ax.k,ax.d)} ${ax.d?"ac":"ft"}</text>`;
 h+=`<text x="190" y="306" font-size="10" text-anchor="middle">${ax.u} · 0 – ${f(Lm*ax.k,ax.d)}</text>`;return h;}
window.render=function(){if(mode!=='space'){const x=$('#xs');x.setAttribute('viewBox','0 0 900 220');delete x.dataset.nofit;return oRender();}const s=S.space,{p,K,i,Tal}=P(),ac=s.amode==='ac',xv=ac?s.Aac:s.L,r=SP.evalL(p,xv),m=SP.maxL(p),Wd=s._W;
 document.querySelectorAll(ac?'[data-v=Aac]':'[data-v=L]').forEach(e=>{if(document.activeElement!==e)e.value=xv;});
 const ae=$('#spArea');if(ae)ae.innerHTML=ac?`Drainage area <b>A = ${f(s.Aac,3)} ac</b> = ${Math.round(s.Aac*43560).toLocaleString()} sq ft`:`Width W = ${f(Wd,1)} ft${s.wmode==='lanes'?` = (${s.nl} × ${s.lane} + ${s.sh} + ${s.ex})${s.crown==='half'?' ÷ 2 (crowned)':''}`:''}<br>Drainage area = W × L / 43,560 = ${f(Wd,1)} × ${s.L} / 43,560 = <b>${f(r.A,3)} ac</b> (${Math.round(Wd*s.L).toLocaleString()} sq ft)`;
 const ch=SP.chain(p,+s.chainN,s.chainMode,xv);let cum=0;ch.forEach(c=>{cum+=c.A||0;c.cum=cum;});const MX=ac?'Max area':'Max length',mxs=v=>isFinite(v)?(ac?f(v,3)+' ac':f(v,0)+' ft'):(ac?'> 20,000 ac':'> 20,000 ft');
 $('#summary').innerHTML=`<div class="kpi gov">Bypass at inlet<b>${f(r.Qb,2)} cfs</b><span>${r.ok?'✓ meets all criteria':'✗ '+['Qb','T','d'].filter(k=>!r.pass[k]).map(k=>SP.LABEL[k]).join(', ')+' exceeded'} · Q ${f(r.Q,2)} cfs · T ${f(r.T,1)} ft</span></div>
 <div class="kpi">Gutter flow Q<b>${f(r.Q,2)} cfs</b><span>${f(r.Qr,2)} runoff + ${f(s.Qco,2)} carryover</span></div><div class="kpi">Intercepted Qi<b>${f(r.Qi,2)} cfs</b><span>${f(r.E*100,0)}%</span></div>
 <div class="kpi">Drainage area<b>${f(r.A,3)} ac</b><span>${Math.round(r.A*43560).toLocaleString()} sq ft</span></div><div class="kpi" id="spmaxout">${MX}<b>${mxs(m.L)}</b><span>governed by ${SP.LABEL[m.gov]}</span></div>
 <div class="spbadges">${badge(r.pass.Qb,`Bypass ${f(r.Qb,2)} ≤ ${s.Qblim} cfs`)}${badge(r.pass.T,`Spread ${f(r.T,1)} ≤ ${f(Tal,1)} ft`)}${badge(r.pass.d,`Depth ${f(r.d*12,1)} ≤ ${s.curb} in`)}</div>`;
 $('#xs').setAttribute('viewBox','0 0 360 312');$('#xs').dataset.nofit=1;$('#xs').innerHTML=chart(p,xv,m,ac?{k:1,u:'Drainage area (ac)',d:3}:s.xax==='ac'?{k:Wd/43560,u:'Drainage area (ac)',d:3}:null);$('#sxT').textContent=`Bypass, spread and depth vs ${ac||s.xax==='ac'?'area':'length'} (dashed = limits)`;
 const R=[...(ac?[]:[['Roadway width W',f(Wd,1),'ft'],['Length L',f(s.L,0),'ft']]),['Drainage area A'+(ac?'':' = W × L / 43,560'),f(r.A,4),'ac'],['Drainage area',Math.round(r.A*43560).toLocaleString(),'sq ft'],['Intensity i',f(i,2),'in/hr'],['Runoff C·i·A',f(r.Qr,3),'cfs'],['Carryover in',f(s.Qco,3),'cfs'],['Gutter flow Q',f(r.Q,3),'cfs'],['Spread T',f(r.T,2),'ft'],['Depth at curb d',f(r.d,3)+' ('+f(r.d*12,1)+' in)','ft'],['Intercepted Qi',f(r.Qi,3),'cfs'],['Bypass',f(r.Qb,3),'cfs'],
  [MX+' — bypass',mxs(m.each.Qb),''],[MX+' — spread',mxs(m.each.T),''],[MX+' — depth',mxs(m.each.d),'']];
 $('#table').innerHTML=tbl(R)+`<h3 style="margin-top:10px">Chain of inlets (${s.chainMode==='auto'?'auto-spaced':'fixed '+(ac?xv+' ac':xv+' ft')})</h3><div style="overflow-x:auto"><table class="spchain"><thead><tr><th>#</th>${ac?'':'<th>L (ft)</th><th>Station (ft)</th>'}<th>A (ac)</th><th>Cum. A (ac)</th><th>Carry in</th><th>Q</th><th>T (ft)</th><th>Qi</th><th>Bypass</th><th></th></tr></thead><tbody>${ch.map(c=>c.fail?`<tr><td>${c.k+1}</td><td colspan="10">Carryover ${f(c.Qco,2)} cfs alone exceeds the ${SP.LABEL[c.gov]} — use a longer/bigger inlet.</td></tr>`:`<tr><td>${c.k+1}</td>${ac?'':`<td>${f(c.L,0)}</td><td>${f(c.sta,0)}</td>`}<td>${f(c.A,3)}</td><td>${f(c.cum,3)}</td><td>${f(c.Qco,2)}</td><td>${f(c.Q,2)}</td><td>${f(c.T,1)}</td><td>${f(c.Qi,2)}</td><td>${f(c.Qb,2)}</td><td>${c.ok?'✓':'✗'}</td></tr>`).join('')}</tbody></table></div>`;
 const E=[ac?`Drainage area entered: A = ${f(s.Aac,3)} ac (${Math.round(s.Aac*43560).toLocaleString()} sq ft).`:`Roadway width W = ${f(Wd,1)} ft${s.wmode==='lanes'?` (${s.nl} lanes × ${s.lane} ft + ${s.sh} ft shoulder/parking + ${s.ex} ft extra${s.crown==='half'?', crowned so half drains here':', full width drains here'})`:''}. Area A = W × L / 43,560 = ${f(Wd,1)} × ${s.L} / 43,560 = ${f(r.A,4)} ac.`,
  s.imode==='idf'?`Intensity (TxDOT HDM Eq. 4-21, EBDLKUP-2019 ${s.ser}, ${s.county} ${s.zone}, ${s.rp}-yr): i = b/(Tc+d)<sup>e</sup> with Tc = max(${s.tc}, 10) min = ${f(i,2)} in/hr (TxDOT 10-minute minimum).`:`Intensity entered: ${s.i} in/hr.`,
  `Rational Method (TxDOT HDM Ch. 4 Sec. 12): Q = C·i·A (A in acres) = ${s.C} × ${f(i,2)} in/hr × ${f(r.A,4)} ac = ${f(r.Qr,3)} cfs; plus carryover ${s.Qco} cfs → Q = ${f(r.Q,3)} cfs.`,
  `Gutter (HEC-22 Eq. 5.2–5.8 / TxDOT Eq. 10-1–10-4): T = ${f(r.T,2)} ft, d = ${f(r.d,3)} ft.`,
  `Inlet (${s.it==='curb'?'curb opening, '+(s.meth==='TxDOT'?'TxDOT Eq. 10-5…10-13':'HEC-22 Eq. 7.10–7.13'):s.it==='grate'?'grate, HEC-22 Eq. 7.3–7.9':'combination, HEC-22 Ex. 7.4 method'}): Qi = ${f(r.Qi,3)} cfs, bypass = ${f(r.Qb,3)} cfs — same functions validated in the inlet tabs.`,
  `Criteria: bypass ≤ ${s.Qblim} cfs (your rule); spread ≤ ${f(Tal,1)} ft (${ROAD[s.road][0]}); depth ≤ curb height ${s.curb} in (TxDOT HDM Ch. 10 Sec. 4 "Ponding").`,
  `${MX}: each check grows with ${ac?'area':'L'}, so bisection finds the longest L for each; the smallest governs → ${mxs(m.L)} (${SP.LABEL[m.gov]}).`,
  'Chain: each inlet’s bypass is added to the next inlet’s gutter flow (TxDOT HDM Ch. 10 Sec. 6 "Carryover Design Approach").'];
 $('#explain').innerHTML='<ol>'+E.map(x=>`<li>${x}</li>`).join('')+'</ol>';
 $('#refs').innerHTML=`<b>Sources:</b> TxDOT HDM Ch. 10 Sec. 4 "Ponding" — depth ≤ curb height; ponded width ½ outer lane (interstate / controlled-access main lanes), outer lane (major highways, 2+ lanes each direction), one lane open per direction (minor highways): <a href="https://www.txdot.gov/manuals/des/hyd/chapter-10--storm-drains/section-4--pavement-drainage/ponding.html">txdot.gov … /ponding.html</a>. TxDOT HDM Ch. 4 Sec. 6 Table 4-2 design AEP for storm drain inlets: <a href="https://onlinemanuals.txdot.gov/TxDOTOnlineManuals/txdotmanuals/hyd/design_flood_and_check_flood_standards.htm">design flood standards</a>. HEC-22 4th ed. (2024) Table 5.1 (example spreads by speed), Ch. 5 and Ch. 7. TxDOT HDM Ch. 10 Sec. 6 curb inlet equations. Rainfall: TxDOT EBDLKUP-2019. Limits are editable — follow your district/project criteria.`;};
document.querySelector('.tabs button[data-m=space]').addEventListener('click',()=>{});
})();
