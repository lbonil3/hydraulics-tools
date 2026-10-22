// Validation of ditch/calc.js against FHWA HEC-15 (2005) worked examples (US customary).
const DT=require('./calc.js');let n=0,bad=0;
const ck=(name,v,ref,tol)=>{n++;const ok=Math.abs(v-ref)<=tol;if(!ok)bad++;console.log((ok?'ok  ':'FAIL')+` ${name}: ${(+v).toFixed(4)} vs ${ref} (±${tol})`);};
const trap=(B,Z,S,extra)=>Object.assign({shape:'trap',B,Z1:Z,Z2:Z,S,Dd:3},extra||{});
const coh={type:'cohesive',cls:'SC',PI:16,e:0.5};
// 1 Grass lining (Example 4.? CU): B3 Z3 S0.03 Q17.5, good cover h 0.25? sod
let L={type:'veg',Cn:DT.Cn41(DT.CS.Good,0.25),Cs:DT.CS.Good,Cf:DT.CF.Sod.Good,soil:coh};
let r=DT.analyze(trap(3,3,0.03),L,{mode:'Q',Q:17.5,SF:1});
ck('grass d',r.d,0.70,0.015);ck('grass n',r.n,0.032,0.0008);ck('grass τd',r.td,1.31,0.02);ck('grass τp,soil',r.lining.soil.tp,0.068,0.001);ck('grass τp',r.tp,2.7,0.05);
ck('Cn Eq4.1 (Cs 9? h0.5)',DT.Cn41(9,0.5),0.205,0.001);
// 2 RECP A
L={type:'recp',tl:1.25,tlow:0.75,tmid:1.5,tup:3,nlow:0.038,nmid:0.034,nup:0.031,soil:coh};
r=DT.analyze(trap(3,3,0.03),L,{mode:'Q',Q:10});ck('RECP A d',r.d,0.57,0.01);ck('RECP A n',r.n,0.037,0.0008);ck('RECP A τp',r.tp,0.90,0.01);
let ab=DT.recpAB(L);ck('RECP A b',ab.b,-0.146,0.002);ck('RECP A a',ab.a,0.0361,0.0003);
// 3 Riprap mild slope: B2 Z3 S0.02 Q40 D50 5in? 
L={type:'rock',D50:5/12,gs:165,phi:38};r=DT.analyze(trap(2,3,0.02),L,{mode:'Q',Q:40});
ck('riprap d',r.d,1.72,0.02);ck('riprap n',r.n,0.062,0.001);ck('riprap Re',r.lining.Re/1e4,3.6,0.05);ck('riprap D50req ft',r.lining.D50req,0.45,0.01);ck('riprap K2',r.side.K2,0.86,0.01);
// 4 Gabion
L={type:'gabion',D50:0.5,gs:165,MT:0.75};r=DT.analyze(trap(2,3,0.09),L,{mode:'Q',Q:10});
ck('gabion d',r.d,0.609,0.01);ck('gabion n',r.n,0.055,0.001);ck('gabion τp',r.tp,5.1,0.05);ck('gabion τd',r.td,3.4,0.05);ck('gabion SF',r.SF,1.25,1e-9);
// 5 Max discharge riprap d=2.56
r=DT.analyze(trap(3.3,4,0.015),{type:'rock',D50:0.5,gs:165},{mode:'d',d:2.56});ck('maxQ riprap Q',r.Q,133,1.5);ck('maxQ riprap n',r.n,0.060,0.001);
// 6 Max discharge grass d=0.59
r=DT.analyze(trap(3,3,0.05),{type:'veg',Cn:DT.Cn41(DT.CS.Good,0.5),Cf:DT.CF.Sod.Good,soil:{type:'coarse',D75:0.08}},{mode:'d',d:0.59});ck('maxQ grass Q',r.Q,13.5,0.2);ck('maxQ grass n',r.n,0.039,0.001);
// 7 Bend
// geometric sanity
ck('rect area',DT.geom({shape:'rect',B:4},2).A,8,1e-9);ck('V area Z1 2 Z2 4',DT.geom({shape:'v',Z1:2,Z2:4},1).A,3,1e-9);
const gr=DT.geom({shape:'round',Z1:4},0.25),gr2=DT.geom({shape:'round',Z1:4},0.2501);ck('rounded continuity',gr2.A-gr.A,0,0.001);
const ir=DT.geom({shape:'irr',pts:[[0,2],[2,0],[6,0],[8,2]]},1),tz=DT.geom({shape:'trap',B:4,Z1:1,Z2:1},1);ck('irregular = trapezoid A',ir.A,tz.A,1e-6);ck('irregular = trapezoid P',ir.P,tz.P,1e-6);
const fx=DT.analyze(trap(4,3,0.01),{type:'fixed',n:0.013},{mode:'Q',Q:50});ck('Manning closure',DT.analyze(trap(4,3,0.01),{type:'fixed',n:0.013},{mode:'d',d:fx.d}).Q,50,0.01);
{const g=DT.geom(trap(4,3,0.01),fx.dc);ck('critical depth: Q²T/(gA³)=1',50*50*g.T/(32.2*g.A**3),1,0.005);}
{const rb=DT.analyze(trap(3.9,3,0.015,{Rc:33}),{type:'rock',D50:0.5,gs:165},{mode:'Q',Q:20});ck('bend Kb',rb.bend.Kb,1.84,0.01);ck('bend Lp',rb.bend.Lp,6.2,0.1);ck('bend Δd',rb.bend.dd,0.048,0.002);}
console.log(`${n-bad}/${n} passed`);process.exit(bad?1:0);
