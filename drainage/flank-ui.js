// UI: "Sag + flanking inlets" on the Inlet in sag tab and (street ends at a sag) on the Inlet spacing tab.
(function(){
const FD={fl:'off',kmode:'K',Kv:100,G1:-2.5,G2:2.5,Lvc:500,Tfl:9.84,QL:3,QR:3,nfl:0.016,xmode:'eq',Xu:50,fstd:'PCO-0',fcl:5,fca:3,fcw:2,fh:0.5,fVo:'',fratio:0.5,fmeth:'HEC22',QRs:0};
Object.keys(FD).forEach(k=>{if(!(k in S.sag))S.sag[k]=FD[k];});if(!('endsag' in S.space))S.space.endsag='no';
Object.assign(H,{
 fl:['Flanking inlets','','HEC-22 7.4.3: good practice adds flanking inlets on one or both sides of a low point inlet in a sag with no other outlet.','Profile / drainage layout.',null],
 kmode:['Vertical curve input','','Enter K directly, or grades in/out and curve length (K = L/(G2 − G1)).','Profile sheet.',null],
 xmode:['Flanking location','','HEC-22 Eq. 7.22, or your own distance (TxDOT HDM: usually 50 or 100 ft).','HEC-22 7.4.3; TxDOT HDM Ch. 10 Sec. 5.',null],
 fstd:['Flanking inlet type','','Same TxDOT standard list as the picker, or a custom curb opening.','TxDOT Bridge Division standards.',null],
 fmeth:['Flanking on-grade method','','Method for the flanking inlets analyzed on grade.','HEC-22 / TxDOT HDM.',null],
 endsag:['Street ends at a sag?','','If the chain ends at a sag, analyze the low point with flanking inlets (settings on the Inlet in sag tab).','Profile sheet.',null],
 Kv:['Vertical curve K','ft/%','Horizontal distance for a 1 % change in grade (K = L / (G2 − G1), HEC-22 Eq. 7.23). AASHTO drainage maximum 167 ft/% (HEC-22 7.4.3).','Profile sheet (vertical curve data).',[10,300]],
 G1:['Grade in G1','%','Approach grade entering the sag (negative, falling).','Profile sheet.',[-10,0]],
 G2:['Grade out G2','%','Grade leaving the sag (positive, rising).','Profile sheet.',[0,10]],
 Lvc:['Vertical curve length L','ft','Horizontal length of the sag vertical curve.','Profile sheet.',[50,2000]],
 Tfl:['Allowable spread at sag','ft','Design spread criterion; d = Sx·T sets the flanking distance (HEC-22 Example 7.10).','TxDOT HDM Ch. 10 Sec. 3 / design criteria.',[4,20]],
 QL:['Flow approaching from left','cfs','Gutter flow arriving at the left flanking inlet (include bypass from upstream inlets).','Rational method + upstream bypass.',[0,20]],
 QR:['Flow approaching from right','cfs','Gutter flow arriving at the right flanking inlet.','Rational method + upstream bypass.',[0,20]],
 QRs:['Flow from the other side','cfs','Gutter flow approaching the sag from the opposite side of the chain.','Rational method + upstream bypass.',[0,20]],
 nfl:['Manning n (gutter)','','Gutter roughness used for the flanking inlets on grade.','HEC-22 Table 5.1.',[0.011,0.02]],
 Xu:['Flanking distance from low point','ft','TxDOT HDM: analyze flanking inlets on grade "usually 50 or 100 feet" from the low point.','Your layout.',[5,300]],
 fcl:['Flanking curb opening length','ft','Curb opening length of each flanking inlet.','Inlet standard sheet.',[2,30]],
 fca:['Flanking local depression a','in','Local gutter depression at the flanking inlet.','Inlet standard sheet.',[0,6]],
 fcw:['Flanking depression width W','ft','Width of the local depression.','Inlet standard sheet.',[0,4]],
 fh:['Flanking throat height h','ft','Curb opening height (sag check when the main inlet clogs).','Inlet standard sheet.',[0.2,1]],
 fVo:['Flanking grate Vo (splash-over)','ft/s','REQUIRED for grates: read from HEC-22 Figure 7.8 for the grate type and length.','HEC-22 Fig. 7.8.',[1,20]],
 fratio:['Flanking grate open-area ratio','fraction','Open area / total grate area, for the sag (clogged main inlet) check.','Grate catalog.',[0.2,0.9]]});
const esc=x=>String(x);
function flInlet(s){if(s.fstd&&s.fstd!=='custom'&&window.TXI){const x=TXI.find(i=>i.id===s.fstd);if(x)return Object.assign({},x,{Vo:+s.fVo,ratio:s.fratio,meth:s.fmeth,name:'TxDOT '+x.name});}
 return {it:'curb',cl:s.fcl,ca:s.fca,cw:s.fcw,h:s.fh,meth:s.fmeth,name:`Custom curb ${s.fcl} ft`};}
const lowInlet=s=>({it:s.it,gw:s.gw,gl:s.gl,ratio:s.ratio,clog:s.clog,Sw:s.Sw,cl:s.cl,h:s.h,ca:s.ca,cw:s.cw,throat:s.throat,theta:s.theta,sl:s.sl,sw:s.sw,name:s.stdName||({grate:'Grate',curb:'Curb opening',combo:'Combination',slot:'Slotted drain'})[s.it]});
function fields(s,space){let h=`<fieldset class="flk"><legend>Sag + flanking inlets</legend>`;
 if(space){h+=sel('endsag',S.space.endsag,[['no','No — chain only'],['yes','Yes — street ends at a sag (flanking analysis)']]);if(S.space.endsag!=='yes')return h+'</fieldset>';
  h+=`<div class="txnote">Last inlet's bypass from this chain feeds one side. The low-point inlet and flanking settings come from the <b>Inlet in sag</b> tab.</div>`+field('QRs',S.space.QRs==null?0:S.space.QRs)+'</fieldset>';return h;}
 h+=sel('fl',s.fl,[['off','Off — single sag inlet'],['on','On — add flanking inlets']]);if(s.fl!=='on')return h+'</fieldset>';
 h+=sel('kmode',s.kmode,[['K','Enter K'],['GL','Grades in/out + curve length']]);
 h+=s.kmode==='K'?num('Kv',s):num('G1',s)+num('G2',s)+num('Lvc',s);
 h+=num('Tfl',s)+num('QL',s)+num('QR',s)+num('nfl',s);
 h+=sel('xmode',s.xmode,[['eq','HEC-22 Eq. 7.22 (63 % ponding depth)'],['user','My distance (TxDOT: 50 or 100 ft)']])+(s.xmode==='user'?num('Xu',s):'');
 const opts=[['custom','Custom curb opening'],...(window.TXI||[]).map(i=>[i.id,'TxDOT '+i.name])];
 h+=sel('fstd',s.fstd,opts)+sel('fmeth',s.fmeth,[['HEC22','HEC-22 (Eq. 7.10–7.13)'],['TxDOT','TxDOT HDM (Eq. 10-5…10-13)']]);
 const fi=flInlet(s);if(s.fstd==='custom')h+=num('fcl',s)+num('fca',s)+num('fcw',s)+num('fh',s);
 if(fi.it!=='curb')h+=`<div class="f need" data-k="fVo"><label><span>${H.fVo[0]} (ft/s) <b class="req">needs your input</b></span><input data-v="fVo" type="number" inputmode="decimal" step="any" value="${s.fVo}" placeholder="from HEC-22 Fig. 7.8"></label></div>`+num('fratio',s);
 return h+'</fieldset>';}
function opts(s,space){const sp=S.space,X=window.SPLAST;let QL=s.QL,QR=s.QR;
 if(space){const last=X&&X.ch&&X.ch.length?X.ch[X.ch.length-1]:null;QL=last?last.Qb:0;QR=+sp.QRs||0;}
 return {kmode:s.kmode,K:s.Kv,G1:s.G1,G2:s.G2,Lvc:s.Lvc,Sx:space?sp.Sx:s.Sx,n:space?sp.n:s.nfl,Tal:space&&X?X.Tal:s.Tfl,QL,QR,xmode:s.xmode,Xu:s.Xu,low:lowInlet(s),fl:flInlet(s)};}
function profile(o,r){const W=360,Hh=150,K=r.K,span=Math.max(r.X*1.6,60),sx=(W-40)/(2*span),ymax=Math.max(r.y*1.8,rise(span),r.clog.d,r.without.d)*1.1||1,sy=70/ymax,X0=W/2,Y0=110;
 const yy=e=>Y0-e*sy,xx=x=>X0+x*sx;let pts='';for(let i=0;i<=60;i++){const x=-span+2*span*i/60;pts+=`${xx(x)},${yy(rise(x))} `;}
 const wl=(d,c,t,dy)=>{const half=Math.sqrt(200*K*d);return `<line x1="${xx(-Math.min(half,span))}" x2="${xx(Math.min(half,span))}" y1="${yy(d)}" y2="${yy(d)}" stroke="${c}" stroke-width="2" stroke-dasharray="${t?'5 3':''}"/><text x="${xx(Math.min(half,span))+3}" y="${yy(d)+dy}" font-size="9" fill="${c}">${t||''}</text>`;};
 const mk=(x,c,l,dy)=>`<rect x="${xx(x)-5}" y="${yy(rise(x))-4}" width="10" height="8" fill="${c}" stroke="#333"/><text x="${xx(x)}" y="${yy(rise(x))+dy}" font-size="9" text-anchor="middle">${l}</text>`;
 return `<svg viewBox="0 0 ${W} ${Hh}" data-nofit="1" class="flsvg" role="img" aria-label="Sag vertical curve profile with inlets">
 <text x="6" y="12" font-size="10" fill="#555">Profile (vert. exaggerated) · K = ${f(K,1)} ft/% · X = ${f(r.X,1)} ft</text>
 <polyline points="${pts}" fill="none" stroke="#333" stroke-width="2"/>
 <polygon points="${xx(-Math.sqrt(200*K*r.with.d))},${yy(r.with.d)} ${pts.split(' ').filter(p=>{const v=p.split(',');return v.length==2&&+v[1]>=yy(r.with.d);}).join(' ')} ${xx(Math.sqrt(200*K*r.with.d))},${yy(r.with.d)}" fill="#9cc9f0" opacity=".8"/>
 ${wl(r.with.d,'#1f77b4','',0)}${wl(r.without.d,'#c0392b','no flankers',-2)}${wl(r.clog.d,'#9a6b00','main clogged',9)}
 ${mk(0,'#c0392b','low point',14)}${mk(-r.X,'#f2c94c','flank',14)}${mk(r.X,'#f2c94c','flank',14)}
 <text x="${xx(-r.X)}" y="${Hh-8}" font-size="9" text-anchor="middle">−${f(r.X,1)} ft</text><text x="${xx(r.X)}" y="${Hh-8}" font-size="9" text-anchor="middle">+${f(r.X,1)} ft</text></svg>`;}
const rise=x=>FL.rise(x,curK);let curK=100;
const sh=i=>(i.code?i.code+' '+i.cl+' ft':i.name||'').replace(/^TxDOT /,'').slice(0,18);
function plan(o,r){const W=360,cx=W/2,sx=(W-40)/(2*Math.max(r.X*1.6,60)),y=30,sym=(x,c,l)=>`<rect x="${cx+x*sx-7}" y="${y-9}" width="14" height="9" fill="${c}" stroke="#333"/><text x="${cx+x*sx}" y="${y+16}" font-size="8.5" text-anchor="middle">${l}</text>`;
 return `<svg viewBox="0 0 ${W} 60" data-nofit="1" class="flsvg" role="img" aria-label="Plan of sag with flanking inlets"><line x1="10" x2="${W-10}" y1="${y}" y2="${y}" stroke="#333" stroke-width="2"/><text x="12" y="${y-4}" font-size="9">curb</text>
 <text x="14" y="52" font-size="9" fill="#1f4e79">→ ${f(o.QL,2)} cfs</text><text x="${W-14}" y="52" font-size="9" text-anchor="end" fill="#1f4e79">${f(o.QR,2)} cfs ←</text>
 ${sym(-r.X,'#f2c94c',sh(o.fl))}${sym(0,'#c0392b',sh(o.low))}${sym(r.X,'#f2c94c',sh(o.fl))}</svg>`;}
function card(space){const s=S.sag,o=opts(s,space);let el=document.getElementById('flcard');
 const show=space?S.space.endsag==='yes':s.fl==='on';if(!show){if(el)el.remove();return;}
 if(!el){el=document.createElement('div');el.className='card';el.id='flcard';el.dataset.pane='results';const sm=document.getElementById('summary');sm.parentNode.insertBefore(el,sm.nextSibling);}
 if(o.fl.it!=='curb'&&!(o.fl.Vo>0)){el.innerHTML=`<h3>Sag + flanking inlets</h3><div class="warn">⚠ The flanking inlet has a grate: enter its splash-over velocity Vo (HEC-22 Figure 7.8 for the mapped grate type) in the Sag + flanking inlets inputs${space?' on the Inlet in sag tab':''}. No result is shown until you do — a stale Vo would give a wrong answer.</div>`;return;}
 let r;try{r=FL.compute(o);}catch(e){el.innerHTML=`<h3>Sag + flanking inlets</h3><div class="warn">${e.message}</div>`;return;}curK=r.K;
 if(!(r.K>0)){el.innerHTML='<h3>Sag + flanking inlets</h3><div class="warn">⚠ K must be positive (G2 must be greater than G1 for a sag).</div>';return;}
 const ok=r.with.T<=o.Tal+1e-9;
 el.innerHTML=`<h3>Sag + flanking inlets${space?' (end of chain)':''}</h3>
 <div class="kpis">${kpi('Spread at low point with flankers',f(r.with.T),'ft',`without flankers ${f(r.without.T)} ft · allowable ${f(o.Tal,2)} ft`,1)}${kpi('Main inlet clogged',f(r.clog.T),'ft',r.clog.ok?'✓ flankers keep spread within allowable':'✗ exceeds allowable spread')}${kpi('Flanking distance X',f(r.X,1),'ft',o.xmode==='eq'?'HEC-22 Eq. 7.22':'your distance')}</div>
 ${plan(o,r)}${profile(o,r)}
 ${tbl([['K (Eq. 7.23)',f(r.K,1),'ft/%'],['Allowable depth d = Sx·T',f(r.dA,3),'ft'],['X = (74·d·K)^0.5 (Eq. 7.22)',f(r.Xeq,1),'ft'],['Flanking station used (each side)',f(r.X,1),'ft'],['Rise of profile at flanker x²/(200K)',f(r.y,3),'ft'],['Local grade at flanker x/K',f(r.G,3),'%'],['Left flanker: Q / Qi / bypass',`${f(o.QL,2)} / ${f(r.L.Qi,2)} / ${f(r.L.Qb,2)}`,'cfs'],['Right flanker: Q / Qi / bypass',`${f(o.QR,2)} / ${f(r.R.Qi,2)} / ${f(r.R.Qb,2)}`,'cfs'],['Flow to low-point inlet (with flankers)',f(r.Qlow,2),'cfs'],['Low point depth / spread with flankers',`${f(r.with.d,3)} / ${f(r.with.T)}`,'ft'],['Low point depth / spread without flankers',`${f(r.without.d,3)} / ${f(r.without.T)}`,'ft'],['Main inlet clogged: pond depth / spread',`${f(r.clog.d,3)} / ${f(r.clog.T)}`,'ft'],['Depth at flankers ÷ depth at low point (clogged)',f(r.clog.ratio*100,0),'%']])}
 <ol class="flex"><li>K = ${o.kmode==='GL'?`L/(G2 − G1) = ${o.Lvc}/(${o.G2} − (${o.G1}))`:'entered'} = ${f(r.K,1)} ft/% (HEC-22 Eq. 7.23).</li>
 <li>Design depth d = Sx·T = ${o.Sx}·${f(o.Tal,2)} = ${f(r.dA,3)} ft; X = (74·d·K)<sup>0.5</sup> = ${f(r.Xeq,1)} ft (HEC-22 Eq. 7.22, Example 7.10). The 74 places the flanker where the curb profile is 0.37·d above the low point, so ponding there is 63 % of the low-point depth (HEC-22 7.4.3).</li>
 <li>Flanking inlets analyzed on grade at their station (TxDOT HDM Ch. 10 Sec. 5): local grade = x/K = ${f(r.G,3)} % → ${o.fl.name}: left Qi ${f(r.L.Qi,2)}, right Qi ${f(r.R.Qi,2)} cfs.</li>
 <li>Low-point inlet (${o.low.name}, Inlet in sag inputs) carries the bypass ${f(r.Qlow,2)} cfs → spread ${f(r.with.T)} ft ${ok?'≤':'>'} allowable; without flankers it carries ${f(r.Qt,2)} cfs → ${f(r.without.T)} ft.</li>
 <li>Clogged check (HEC-22 7.4.3: flankers "receive the design flow when the primary inlet … is clogged without exceeding the allowable spread"): the common pond rises until both flankers, acting as sag inlets at depth (d<sub>low</sub> − ${f(r.y,3)}) ft, take ${f(r.Qt,2)} cfs → d<sub>low</sub> = ${f(r.clog.d,3)} ft, spread ${f(r.clog.T)} ft ${r.clog.ok?'✓':'✗'}.</li>
 <li class="muted">Assumptions: symmetric parabolic curve with the low point at the curve's lowest station; flankers at equal distance each side; on-grade gutter is uniform (Sx); flanker local depression is used on grade; sag capacity of combination flankers ignores the depression (as in the sag tab).${o.fl.hec?` Grate mapped to HEC-22 ${o.fl.hec} — assumption.`:''}</li></ol>
 <div class="cite"><b>Sources:</b> FHWA HEC-22 4th ed. (2024) Sec. 7.4.3 Flanking Inlets, Eq. 7.22–7.23, Example 7.10, Sec. 7.4.4; TxDOT Hydraulic Design Manual (9/2019) Ch. 10 Sec. 5 "Inlets in Sag".</div>`;}
const oForm=window.form,oRender=window.render;
window.form=function(){oForm();if(mode==='sag'||mode==='space'){const fm=document.getElementById('form');fm.insertAdjacentHTML('beforeend',fields(S.sag,mode==='space'));}};
window.render=function(){oRender();if(mode==='sag')card(false);else if(mode==='space')card(true);else{const e=document.getElementById('flcard');if(e)e.remove();}};
window.FLUI={opts,flInlet};
})();
