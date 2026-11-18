/* Auto-size, TxDOT screening, debris / sediment / fish passage, and input warnings.
   Uses Culvert.analyze. Does not draw and does not change a result when blockage is 0.
   Sources are named in SOURCES and on each check. */
(function(root){
const C=(typeof window!=='undefined'&&window.Culvert)?window.Culvert:require('./calc.js').Culvert;
const SOURCES={
  hw:'TxDOT Hydraulic Design Manual, Ch. 8 §2 Allowable Headwater: design headwater must stay below the roadway, and the allowable elevation comes from damage to property, the road and the culvert. https://www.txdot.gov/manuals/des/hyd/chapter-8--culverts/section-2--design-considerations/allowable-headwater.html',
  hwd:'FHWA HDS-5 (2012) §2.2.5: agency HW/D limits commonly range from 1.0 to 1.5. TxDOT sets no HW/D number.',
  vel:'TxDOT HDM Ch. 8 §2 Outlet Velocity: about 3 ft/s is a recommended minimum so the barrel does not deposit sediment, and anything over 12 ft/s is a general rule for excessive velocity. https://www.txdot.gov/manuals/des/hyd/chapter-8--culverts/section-2--design-considerations/outlet-velocity.html',
  freq:'TxDOT HDM Ch. 4 §6 and Table 4-2: pick the design AEP from the roadway class, and evaluate every facility at the 1% AEP (100-year) check flood. Roadway serviceability is required at the design flood. https://www.txdot.gov/manuals/des/hyd/chapter-4--hydrology/section-6--design-flood-and-check-flood-standards.html',
  cover:'TxDOT HDM culvert chapter does not publish one minimum cover. HDS-5 §3.2 and §5.5.2 require adequate cover and warn about shallow fill, without a single depth. The pass/fail uses the minimum cover you enter.',
  debris:'FHWA HEC-9 Debris Control Structures (3rd ed., 2005, FHWA-IF-04-016) asks for the portion of the waterway debris can block. This percent is that estimate. It is 0 unless you set it. Hydraulics then use Q/(1−blockage) through the same barrel.',
  sediment:'The 3 ft/s floor is the TxDOT HDM Ch. 8 §2 sediment minimum, applied at the low flow you enter. FHWA HEC-22 uses a similar 3 ft/s self-cleansing velocity for storm drains. This is not a sediment-transport equation.',
  fish:'FHWA HEC-26 Culvert Design for Aquatic Organism Passage (2010, FHWA-HIF-11-008), hydraulic design option: compare velocity and depth at a fish-passage flow with species limits. The 2 ft/s and 0.5 ft defaults are a weak-swimmer screen, not a species design. USFS Stream Simulation (2008; also HEC-26 Ch. 6) — embedment and bankfull width — is not computed.'
};
const PIPES_IN=[18,24,30,36,42,48,54,60,72,84,96];
const BOXES=[[4,3],[4,4],[5,3],[5,4],[5,5],[6,4],[6,5],[6,6],[8,5],[8,6],[8,8],[10,6],[10,8],[12,6],[12,8],[12,10]];
function inletFor(shape, material){
  if(shape==='box') return C.INLETS.box.find(i=>i.id==='b_90');
  if(material==='cmp') return C.INLETS.circular.find(i=>i.id==='m_hw');
  return C.INLETS.circular.find(i=>i.id==='c_sq_hw');
}
function catalog(US){
  const ft=US?1:C.FT, rows=[];
  PIPES_IN.forEach(inch=>{
    const D=inch/12*ft;
    ['concrete','cmp'].forEach(material=>{
      [1,2,3].forEach(barrels=>{
        const n=material==='cmp'?0.024:0.012;
        rows.push({shape:'circular', material, n, span:D, rise:D, barrels, inlet:inletFor('circular', material), label:(US?inch+'-in':Math.round(inch*25.4)+'-mm')+' '+(material==='cmp'?'CMP':'concrete pipe')});
      });
    });
  });
  BOXES.forEach(([Bft,Dft])=>{
    const B=Bft*ft, D=Dft*ft;
    [1,2,3].forEach(barrels=>{
      rows.push({shape:'box', material:'concrete', n:0.012, span:B, rise:D, barrels, inlet:inletFor('box','concrete'), label:(US?Bft+'×'+Dft+' ft':(Bft*C.FT).toFixed(2)+'×'+(Dft*C.FT).toFixed(2)+' m')+' box'});
    });
  });
  return rows;
}
function rankOptions(base, opt){
  opt=opt||{};
  const US=base.units!=='SI';
  const list=opt.catalog||catalog(US);
  const allowEl=+opt.allowEl, hwDMax=opt.hwDMax>0?+opt.hwDMax:0, freeboard=+opt.freeboard||0, minCover=+opt.minCover||0;
  const crest=isFinite(+opt.crest)?+opt.crest:NaN, invIn=+base.invIn;
  const rows=[];
  list.forEach(c=>{
    let r;
    try{
      r=C.analyze(Object.assign({}, base, {shape:c.shape, span:c.span, rise:c.rise, barrels:c.barrels, n:c.n, inlet:c.inlet, material:c.material, section:null, taper:null, skewApply:false}));
    }catch(e){return;}
    if(!r||!isFinite(r.EL)) return;
    const reasons=[];
    if(isFinite(allowEl)&&r.EL>allowEl+1e-3) reasons.push('headwater above the allowable elevation');
    if(hwDMax>0&&r.HW/r.D>hwDMax+1e-3) reasons.push('HW/D above '+hwDMax);
    const cover=isFinite(crest)?crest-(invIn+c.rise):NaN;
    if(isFinite(cover)&&cover<-1e-3) reasons.push('crown above the road');
    else if(minCover>0&&isFinite(cover)&&cover+1e-3<minCover) reasons.push('cover under the minimum');
    if(freeboard>0&&isFinite(crest)&&crest-r.EL+1e-3<freeboard) reasons.push('freeboard under the minimum');
    const area=r.A*c.barrels;
    rows.push({shape:c.shape, material:c.material, n:c.n, span:c.span, rise:c.rise, barrels:c.barrels, inletId:c.inlet.id, label:c.barrels+' × '+c.label, area, cover, pass:!reasons.length, reasons, EL:r.EL, HW:r.HW, HWD:r.HW/r.D, control:r.control, Vout:r.Vout, D:r.D});
  });
  rows.sort((a,b)=>(a.pass===b.pass?0:(a.pass?-1:1)) || a.area-b.area || a.rise-b.rise || a.barrels-b.barrels);
  return rows;
}
function stormRow(storm, item, status, text){return {storm, item, status, text};}
function txdotPanel(o){
  o=o||{};
  const d=o.design, k=o.check, cr=o.criteria||C.criteriaIn(null, o.US!==false);
  const allow=o.allowEl, crest=o.crest, cover=o.cover, minCover=+o.minCover||0;
  const rows=[];
  function hw(storm, x, over){
    if(!x){rows.push(stormRow(storm,'Allowable headwater','info','No result for this storm.'));return;}
    if(isFinite(allow)) rows.push(stormRow(storm,'Allowable headwater', x.EL<=allow+1e-3?'pass':'fail', 'Headwater El. '+x.EL.toFixed(2)+' vs allowable El. '+allow.toFixed(2)+'.'));
    else rows.push(stormRow(storm,'Allowable headwater','info','No allowable headwater elevation entered.'));
    if(isFinite(crest)) rows.push(stormRow(storm,'Roadway headwater', x.EL<crest-1e-3?'pass':'fail', 'Headwater El. '+x.EL.toFixed(2)+' vs road crest El. '+crest.toFixed(2)+'.'));
    rows.push(stormRow(storm,'HW/D', x.HW/x.D<=cr.hwDMax+1e-6?'pass':'check', 'HW/D = '+(x.HW/x.D).toFixed(2)+' vs project limit '+cr.hwDMax+'.'));
    rows.push(stormRow(storm,'Outlet velocity', x.Vout>cr.vExcess?'fail':x.Vout+1e-6<cr.vMin?'check':'pass', 'Outlet velocity '+x.Vout.toFixed(2)+' vs '+cr.vMin.toFixed(2)+'–'+cr.vExcess.toFixed(2)+'.'));
    rows.push(stormRow(storm,'Overtopping', over?'fail':'pass', over?'Flow overtops the roadway.':'Headwater stays below the crest; no overtopping.'));
  }
  hw('Design', d, !!o.designOver);
  if(!k){
    rows.push(stormRow('Check','Allowable headwater','info','No 1% AEP check-flood discharge entered.'));
    rows.push(stormRow('Check','Overtopping','info','Check flood was not run. Table 4-2 still requires a 1% AEP evaluation.'));
  } else {
    if(isFinite(allow)) rows.push(stormRow('Check','Allowable headwater', k.EL<=allow+1e-3?'pass':'check', 'Check-flood headwater El. '+k.EL.toFixed(2)+' vs allowable El. '+allow.toFixed(2)+'.'));
    else rows.push(stormRow('Check','Allowable headwater','info','No allowable headwater elevation entered.'));
    rows.push(stormRow('Check','Outlet velocity', k.Vout>cr.vExcess?'check':k.Vout+1e-6<cr.vMin?'check':'pass', 'Check-flood outlet velocity '+k.Vout.toFixed(2)+'.'));
    rows.push(stormRow('Check','Overtopping', o.checkOver?'check':'pass', o.checkOver?'The 1% AEP flood overtops. TxDOT requires the evaluation; roadway serviceability is required at the design flood, not automatically at the check flood.':'The 1% AEP headwater stays below the crest.'));
  }
  if(!(cover>0)||!isFinite(+cover)) rows.push(stormRow('Site','Minimum cover','info','Cover was not entered (0 means unknown). No numeric TxDOT culvert cover is applied.'));
  else if(cover<0) rows.push(stormRow('Site','Minimum cover','fail','Cover is negative.'));
  else if(minCover>0) rows.push(stormRow('Site','Minimum cover', cover+1e-6>=minCover?'pass':'fail', 'Cover '+cover.toFixed(2)+' vs the project minimum '+minCover.toFixed(2)+'.'));
  else rows.push(stormRow('Site','Minimum cover','info','Cover '+cover.toFixed(2)+' is recorded. Set a project minimum to turn this into pass/fail. TxDOT publishes no single culvert cover depth.'));
  return rows;
}
function sedimentCheck(r, US){
  const vmin=(US!==false?3:3*C.FT);
  const V=r&&isFinite(r.Vout)?r.Vout:NaN;
  return {V, vmin, pass:isFinite(V)&&V+1e-6>=vmin, source:SOURCES.sediment};
}
function fishCheck(r, lim){
  lim=lim||{};
  const US=!r||r.US!==false;
  const vmax=isFinite(+lim.vmax)?+lim.vmax:(US?2:2*C.FT);
  const dmin=isFinite(+lim.dmin)?+lim.dmin:(US?0.5:0.5*C.FT);
  const depth=r?Math.min(r.yout, r.profile&&r.profile[0]?r.profile[0][1]:r.yout):NaN;
  const V=r?Math.max(r.Vout, r.V):NaN;
  return {V, depth, vmax, dmin, vPass:isFinite(V)&&V<=vmax+1e-6, dPass:isFinite(depth)&&depth+1e-6>=dmin, source:SOURCES.fish};
}
function inputWarnings(p){
  p=p||{}; const out=[];
  const S=p.length>0?(p.invIn-p.invOut)/p.length:NaN;
  if(!(p.Q>0)) out.push({id:'Q', level:'bad', text:'Design discharge is zero or blank. Enter the design-storm peak flow.'});
  else if(p.Q>50000) out.push({id:'Q', level:'bad', text:'Design discharge is far above a highway culvert. Check the units.'});
  if(p.Qcheck<0) out.push({id:'Qcheck', level:'bad', text:'Check-flood discharge is negative.'});
  if(isFinite(p.cover)&&p.cover<0) out.push({id:'cover', level:'bad', text:'Cover is negative. The crown would stick out of the fill.'});
  if(isFinite(p.crest)&&p.twMode==='const'&&isFinite(p.twElev)&&p.twElev>p.crest) out.push({id:'twElev', level:'bad', text:'Tailwater elevation is above the roadway crest.'});
  if(isFinite(S)&&S<0) out.push({id:'invOut', level:'bad', text:'Inverts and length imply an adverse slope of '+(S*100).toFixed(2)+'%. The outlet is above the inlet, so those three inputs do not describe a draining barrel.'});
  else if(isFinite(S)&&S>0.15) out.push({id:'length', level:'bad', text:'Inverts and length imply a slope of '+(S*100).toFixed(1)+'%, which is extreme. Check that the inverts and the length are for the same barrel.'});
  if(isFinite(p.allowHW)&&isFinite(p.invIn)&&p.allowHW<p.invIn) out.push({id:'allowHW', level:'bad', text:'Allowable headwater is below the inlet invert.'});
  if(p.barrels>12) out.push({id:'barrels', level:'bad', text:'More than 12 barrels is outside normal highway practice. Check the count.'});
  return out;
}
const api={SOURCES, catalog, rankOptions, txdotPanel, sedimentCheck, fishCheck, inputWarnings, inletFor};
root.Studio=api;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:global);
