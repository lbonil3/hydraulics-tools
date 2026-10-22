const {INLETS,analyze,normal,roadFlow,balance,weirCoef,ktFactor,conj,momentum}=require('./calc.js').Culvert;
const pick=(s,id)=>INLETS[s].find(i=>i.id===id);
let ok=true;
function chk(name,got,ref,tol){const e=Math.abs(got-ref)/ref*100;const pass=e<=tol;ok=ok&&pass;
 console.log(`${pass?'PASS':'FAIL'}  ${name}: computed ${got.toFixed(3)} vs published ${ref} (${e.toFixed(1)}% diff, tol ${tol}%)`);}
// 1) HDS-5-style design example (reproduced in Nashville SWMM Vol.2 Ex. 5-2, nomograph Chart 8 based):
//    6x5 ft concrete box, Q=300 cfs, S=1%, L=200 ft, inlet invert 100 -> HWi/D = 1.58, ELhi = 107.9
let r=analyze({units:'US',shape:'box',span:6,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:pick('box','b_90'),Q:300,twMode:'const',twElev:101.5});
chk('6x5 box 300 cfs HWi/D',r.ratio,1.58,2); chk('6x5 box ELhi (ft)',r.ELhi,107.9,0.5);
// 2) Same example: 5x5 box ELhi = 109.6
r=analyze({units:'US',shape:'box',span:5,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:pick('box','b_90'),Q:300,twMode:'none'});
chk('5x5 box 300 cfs ELhi (ft)',r.ELhi,109.6,0.5);
// 3) Nashville SWMM Ex. 5-1: 72-in CMP, Q=200 cfs, S=0.01, normal depth 4.32 ft (n=0.024)
chk('72-in CMP normal depth (ft)',normal('circular',6,6,200,0.024,0.01,1.486),4.32,3);
// 4) Equation form check vs published calculator (HDS-5 Chart 8 30-75 flare, Form 1): 6x4 box,150 cfs,S=1% HW=4.336
r=analyze({units:'US',shape:'box',span:6,rise:4,barrels:1,length:100,invIn:100,invOut:99,n:0.012,inlet:pick('box','b_30'),Q:150,twMode:'none'});
chk('6x4 box 150 cfs HWi (ft)',r.HWi,4.336,0.5);
// ---- Roadway overtopping ----
// 5) TxDOT Hydraulic Design Manual, Ch.8 Roadway Overtopping example: C=3.0, L=10 ft, HWr=2 ft -> Q = 84.8 cfs
chk('Weir eq. TxDOT example Q (cfs)',roadFlow(102,{segs:[[0,100],[10,100]],Lr:10,surface:'custom',Cd:3.0,twElev:null,US:true}).Q,84.8,0.2);
// 6) Same in SI via HDS-5 Eq 3.9 SI factor 0.552: Cd=3.0*0.552, L=3.048 m, HWr=0.6096 m -> 84.8 cfs = 2.401 m3/s
chk('Weir eq. SI conversion (m3/s)',roadFlow(0.6096,{segs:[[0,0],[3.048,0]],Lr:3.048,surface:'custom',Cd:3.0,twElev:null,US:false}).Q,2.401,0.5);
// 7) Coefficients vs values read from HDS-5 Fig. 3.11 (at labelled gridlines; reading accuracy ~±0.01)
chk('Fig 3.11B gravel Cr at HWr=0',weirCoef(0,40,'gravel'),2.50,0.5);
chk('Fig 3.11B paved Cr at HWr=2 ft',weirCoef(2,40,'paved'),3.03,0.5);
chk('Fig 3.11B gravel Cr at HWr=2 ft',weirCoef(2,40,'gravel'),2.96,0.7);
chk('Fig 3.11A paved Cr at HWr/Lr=0.32',weirCoef(3.2,10,'paved'),3.09,0.5);
chk('Fig 3.11C paved kt at ht/HWr=0.90',ktFactor(0.90,'paved'),0.93,2);
chk('Fig 3.11C kt free flow at 0.6',ktFactor(0.6,'gravel'),1.0,0.1);
// 8) Balance conservation: culvert + road = total, HW above crest
{const base={units:'US',shape:'box',span:6,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:pick('box','b_90'),twMode:'const',twElev:101.5};
 const el=q=>analyze({...base,Q:q}).EL, road={segs:[[0,110],[300,110]],Lr:40,surface:'paved',twElev:101.5,US:true};
 const b=balance(450,el,road);console.log(`  balance @450 cfs: culvert ${b.Qc.toFixed(2)} + road ${b.Qr.toFixed(2)} = ${(b.Qc+b.Qr).toFixed(2)}, HW El ${b.EL.toFixed(3)}, ${b.iter} iterations`);
 chk('Balance continuity (cfs)',b.Qc+b.Qr,450,0.02);
 chk('Balance: culvert HW at Qc equals weir HW',el(b.Qc),b.EL,0.001);}
// 9) HY-8 8.0.1.2 comparison (/workspace/hy8-video/comparison.md): 6x5 box, road crest 108, length 100, Lr 30, paved
{const base={units:'US',shape:'box',span:6,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:pick('box','b_90'),twMode:'const',twElev:101.5};
 const el=q=>analyze({...base,Q:q}).EL, road={segs:[[0,108],[100,108]],Lr:30,surface:'paved',twElev:101.5,US:true};
 let a=analyze({...base,Q:300}); chk('HY-8 OC HW @300',a.HWo,5.82,2); chk('HY-8 outlet depth @300',a.yout,3.24,2); chk('HY-8 outlet V @300',a.Vout,15.43,2);
 a=analyze({...base,Q:323.61}); chk('HY-8 OC HW @323.6',a.HWo,6.45,2); chk('HY-8 outlet depth @323.6',a.yout,3.43,2); chk('HY-8 outlet V @323.6',a.Vout,15.71,2);
 chk('HY-8 HW El @300',balance(300,el,road).EL-100,7.90,2);
 const b=balance(450,el,road); chk('HY-8 HW El @450',b.EL-100,8.56,2); chk('HY-8 culvert Q @450',b.Qc,323.61,2); chk('HY-8 road Q @450',b.Qr,126.31,2);
 let lo=200,hi=400;for(let i=0;i<60;i++){const m=(lo+hi)/2;if(el(m)>108)hi=m;else lo=m} chk('HY-8 overtopping start Q',lo,303.73,2);}
// 10) Hydraulic jump in barrel (momentum balance)
{const g=32.174; const y1=4.0,F2=(50/y1)**2/g/y1; chk('Box sequent depth = Belanger',conj('box',6,5,300,g,y1).y,y1/2*(Math.sqrt(1+8*F2)-1),0.01);
 // circular momentum function vs numerical integration of segment area & first moment
 let A=0,Ay=0;const N=20000,y=2;for(let i=0;i<N;i++){const z=(i+.5)*y/N,w=2*Math.sqrt(6.25-(z-2.5)**2);A+=w*y/N;Ay+=w*y/N*(y-z);}
 chk('Circular momentum function (exact segment centroid)',momentum('circular',5,5,150,g,y),150*150/g/A+Ay,0.01);
 const base={units:'US',shape:'box',span:6,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:pick('box','b_90'),twMode:'const',Q:300}; let r0;
 // HY-8 8.0.1.2 runs (constant TW, Outlet Control: Full Flow, Exit Loss: Standard), Water Surface Profile Data:
 // box 300 cfs: TW 103.5 -> jump starts 112.09 ft (y1 3.378); TW 104.0 -> 5.31 ft (y1 3.998); TW 104.5 -> 46.58 ft (y1 3.599);
 // all: HWi 7.90, outlet depth 5.00, outlet V 10.00, flow type 5-JS1f; HWo 6.69 / 7.19 / 7.69
 const hy=[[103.5,112.09,3.378,6.69,2],[104.5,46.58,3.599,7.69,5]];
 for(const [tw,xj,y1,hwo,tol] of hy){const r=analyze({...base,twElev:tw}),j=r.jump;
  console.log(`  box TW ${tw}: jump at ${j&&j.x.toFixed(2)} ft (HY-8 ${xj}), y1 ${j&&j.y1.toFixed(3)} -> y2 ${j&&j.y2.toFixed(3)}`);
  chk(`HY-8 box TW ${tw} jump station`,j?j.x:0,xj,tol); chk(`HY-8 box TW ${tw} supercritical depth at jump`,j.y1,y1,1);
  chk(`HY-8 box TW ${tw} outlet-control HW`,r.HWo,hwo,1); chk(`HY-8 box TW ${tw} outlet depth`,r.yout,5.00,1); chk(`HY-8 box TW ${tw} outlet velocity`,r.Vout,10.00,1);
  chk(`HY-8 box TW ${tw} profile has vertical step at jump`,r.profile.filter(q=>Math.abs(q[0]-j.x)<1e-9).length,2,0);}
 {const r=analyze({...base,twElev:104}); chk('HY-8 box TW 104 jump within 2% of barrel length of HY-8 (5.31 ft)',100+(r.jump.x-5.31)/200*100,100,2); chk('HY-8 box TW 104 outlet-control HW',r.HWo,7.19,1);}
 r0=analyze({...base,twElev:101.5}); chk('Low TW: jump swept out, outlet = S2 depth',r0.jump===null&&r0.jumpType==='swept'?r0.yout:0,3.24,2);
 r0=analyze({...base,twElev:106}); chk('Very high TW: outlet control governs, no jump',r0.control==='Outlet'&&!r0.jump?1:0,1,0);
 // HY-8: 60-in concrete pipe, sq. edge headwall, L 250, inverts 100/96, Q 150, TW El 102.5 -> jump starts 120.14 ft (y1 2.535),
 // HW El 105.66, HWo 4.56, outlet depth 5.00, V 7.64, flow type 5-JS1f
 const cb={units:'US',shape:'circular',span:5,rise:5,barrels:1,length:250,invIn:100,invOut:96,n:0.012,inlet:pick('circular','c_sq_hw'),twMode:'const',Q:150};
 const rc=analyze({...cb,twElev:102.5}),jc=rc.jump; console.log(`  60-in pipe TW 102.5: jump at ${jc&&jc.x.toFixed(2)} ft (HY-8 120.14), y1 ${jc&&jc.y1.toFixed(3)} -> y2 ${jc&&jc.y2.toFixed(3)}`);
 chk('HY-8 pipe jump station',jc?jc.x:0,120.14,2); chk('HY-8 pipe supercritical depth at jump',jc.y1,2.535,1);
 chk('Pipe jump momentum balance (free-surface jump)',momentum('circular',5,5,150,g,jc.y1),momentum('circular',5,5,150,g,jc.y2),0.01);
 chk('HY-8 pipe HW (inlet control)',rc.HW,5.66,1); chk('HY-8 pipe outlet-control HW',rc.HWo,4.56,1); chk('HY-8 pipe outlet depth',rc.yout,5.00,1); chk('HY-8 pipe outlet velocity',rc.Vout,7.64,1);}

// ---- HY-8 8.0 barrel shapes (data from HY-8 ShapeDB; HY-8 runs in hy8-shape-runs.js) ----
{const val=require('./hy8-shape-validate.js');
 for(const R of val.runs){let mx=0,mi=0;for(const h of R.rows){const r=val.analyzeRun(R,h[0]);if(!R.icOnly)mx=Math.max(mx,Math.abs(r.EL-h[1]));if(h[2]/r.D>=0.2||R.key==='sdbox')mi=Math.max(mi,Math.abs(r.HWi-h[2])/h[2]*100);}
  if(!R.icOnly)chk(`HY-8 ${R.key}: max |HW El error| over ${R.rows.length} flows (ft, vs 0)`,1+mx,1,25/1); // reported as 1+error vs 1 -> % = error*100
  chk(`HY-8 ${R.key}: max inlet-control depth error (%) [HW/D>=0.2]`,100+mi,100,4);}
 const {rectSection,polySection,analyze:an,INLETS:IN}=require('./calc.js').Culvert;
 const b={units:'US',shape:'box',span:6,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:IN.box.find(i=>i.id==='b_90'),Q:300,twMode:'const',twElev:104.5};
 chk('Generic section = box (rectSection) outlet-control HW',an(Object.assign({},b,{section:rectSection(6,5,0.012)})).HWo,an(b).HWo,0.1);
 chk('Generic section = box jump location',an(Object.assign({},b,{section:rectSection(6,5,0.012)})).jump.x,an(b).jump.x,0.5);
 const up=polySection([[0,0],[6,0],[6,5],[0,5]],{nWall:0.012});chk('User-defined polygon area (6x5 rectangle)',up.Afull,30,0.01);
 chk('User-defined polygon = box outlet-control HW',an(Object.assign({},b,{section:up})).HWo,an(b).HWo,0.1);}

// ---- Phase 2: downstream-channel tailwater (HY-8 8.0, trapezoidal b=10 ft, 2H:1V, S=0.005, n=0.035, invert 98) ----
{const {channelTW,ratingTW}=require('./calc.js').Culvert;const ch={type:'trap',b:10,z1:2,z2:2,S:0.005,n:0.035,inv:98};
 for(const [Q,y,V] of [[50,1.29,3.07],[125,2.15,4.06],[275,3.27,5.08],[400,3.97,5.62],[575,4.75,6.20],[800,5.59,6.76]]){const r=channelTW(ch,Q,true);chk(`HY-8 trapezoidal channel TW depth @${Q} cfs`,r.y,y,0.8);chk(`HY-8 trapezoidal channel velocity @${Q} cfs`,r.V,V,0.8);}
 const ir=channelTW({type:'irreg',S:0.005,n:0.035,pts:[[0,108],[10,98],[20,98],[30,108]]},300,true),tr=channelTW({type:'trap',b:10,z1:1,z2:1,S:0.005,n:0.035,inv:98},300,true);
 chk('Irregular section = equivalent trapezoid (depth)',ir.y,tr.y,0.1);
 chk('Rectangular channel: Manning closed form q check',channelTW({type:'rect',b:20,S:0.001,n:0.03,inv:0},100,true).A*1.486/0.03*Math.pow(channelTW({type:'rect',b:20,S:0.001,n:0.03,inv:0},100,true).A/(20+2*channelTW({type:'rect',b:20,S:0.001,n:0.03,inv:0},100,true).y),2/3)*Math.sqrt(0.001),100,0.1);
 chk('Rating curve interpolation',ratingTW([[0,98],[100,100],[300,101.8]],200).el,100.9,0.01);}

{console.log('\n-- Phase 3: multiple barrels --');const b={units:'US',shape:'box',span:6,rise:5,length:200,invIn:100,invOut:98,n:0.012,inlet:pick('box','b_90'),twMode:'const',twElev:101.5};
 for(const [N,Q] of [[2,600],[3,900],[4,400]]){const a=analyze({...b,barrels:N,Q}),s=analyze({...b,barrels:1,Q:Q/N});chk(`${N} barrels at ${Q} cfs = 1 barrel at ${Q/N} cfs (HW el)`,a.EL,s.EL,1e-9);chk(`${N} barrels: per-barrel Q`,a.Q,Q/N,1e-9);}
 const c={units:'US',shape:'circular',span:4,rise:4,length:150,invIn:100,invOut:99,n:0.012,inlet:pick('circular','c_sq_hw'),twMode:'none'};
 if(c.inlet){const a=analyze({...c,barrels:2,Q:200}),s=analyze({...c,barrels:1,Q:100});chk('2 pipes at 200 cfs = 1 pipe at 100 cfs (Vout)',a.Vout,s.Vout,1e-9);}}

{console.log('\n-- Phase 4: HEC-14 riprap apron (Sec. 10.2 design examples) --');const {riprapApron:ra,dissipatorsFor:df}=require('./calc.js').Culvert;
 const a=ra({US:true,Q:85,D:5,TW:1.6});chk('HEC-14 CU example D50 (ft)',a.D50,0.43,1.5);chk('CU class',a.cls,2,0);chk('CU length L=4D (ft)',a.L,20,0.01);chk('CU depth 3.3 D50 (ft)',a.depth,1.65,0.01);chk('CU end width (ft)',a.W,28.3,0.2);chk('CU TW raised to 0.4D',a.TW,2.0,0.01);
 const b=ra({US:false,Q:2.33,D:1.5,TW:0.5});chk('HEC-14 SI example D50 (m)',b.D50,0.13,3);chk('SI class',b.cls,2,0);chk('SI length (m)',b.L,6,0.01);chk('SI depth (m)',b.depth,0.50,1.5);chk('SI end width (m)',b.W,8.5,0.01);
 chk('Supercritical D\' = (D+yn)/2',ra({US:true,Q:85,D:5,TW:3,supercritical:true,yn:2}).Dp,3.5,1e-9);
 chk('SG 2.40 scales D50 by 2.65/2.40',ra({US:true,Q:85,D:5,TW:1.6,SG:2.4}).D50/a.D50,2.65/2.4,1e-6);
 const d=df(4).filter(x=>x.ok).map(x=>x.name);chk('Table 1.1 at Fr=4 includes USBR IV, excludes USBR III',(d.includes('USBR Type IV stilling basin')&&!d.includes('USBR Type III stilling basin'))?1:0,1,0);}

{console.log('\n-- Phase 6: tapered inlets vs HDS-5 Example Problem No. 1 (5x5 RCB, design forms DG 3.4.5-3.4.7) --');const {taperIC:ti,analyze:an}=require('./calc.js').Culvert;
 for(const [Q,hw] of [[300,1.48],[400,1.9],[500,2.4]])chk(`Throat control HWt/D @${Q} cfs (S=0.043)`,ti({type:'side',Bf:9,taper:4},Q,0.043,1,5,5).HWt/5,hw,3);
 for(const [Q,hw] of [[300,1.25],[400,1.59],[500,2.04]])chk(`Side-tapered face HWf/E @${Q} cfs, Bf=9 ft (nomograph value)`,ti({type:'side',Bf:9,taper:4},Q,0.043,1,5,5).HWf/5,hw,10);
 for(const [Q,hw] of [[300,1.14],[400,1.5],[500,2.0]])chk(`Slope-tapered face HWf/E @${Q} cfs, Bf=8 ft`,ti({type:'slope',Bf:8,taper:4,St:2,T:2},Q,0.044,1,5,5).HWf/5,hw,5);
 const s=ti({type:'side',Bf:9,taper:4},400,0.043,1,5,5);chk('Side-tapered L1 = (Bf-B)/2 x taper',s.L1,8,0.01);chk('Side-tapered face invert rise L1·S (185.8-185.5)',s.faceRise,0.344,1);
 const sl=ti({type:'slope',Bf:8,taper:4,St:2,T:2},400,0.044,1,5,5);chk('Slope-tapered L2 = T·St',sl.L2,4,0.01);chk('Slope-tapered L3 = max(B/2, (Bf-B)/2·taper - L2)',sl.L3,2.5,0.01);
 const r=an({units:'US',shape:'box',span:5,rise:5,barrels:1,length:200,invIn:185.5,invOut:176.9,n:0.012,inlet:pick('box','b_90'),Q:400,twMode:'const',twElev:176.9+4.9,taper:{type:'side',Bf:9,taper:4}});
 chk('analyze(): tapered inlet Ke = 0.2',r.inlet.Ke,0.2,0);chk('analyze(): throat-controlled HW el vs example ELhi 195.0',r.EL,195.0,0.5);}

{console.log('\n-- Phase 6: side-tapered 5x5 box vs HY-8 8.0 (Bf 9 ft, 4:1, square edge 26-90 wingwall, S 0.01, trapezoidal TW channel) --');const C=require('./calc.js').Culvert;
 const H=[[100,103.37,102.79,103.37],[140,104.25,103.49,104.25],[180,105.05,104.13,105.05],[220,105.81,104.72,105.81],[260,106.54,105.69,106.54],[300,107.29,106.18,107.29],[340,108.06,106.75,108.06],[380,108.89,107.38,108.89],[400,109.34,107.72,109.34],[460,112.57,108.86,110.78],[500,114.31,109.71,111.85]];
 for(const [Q,hw,fe,te] of H){const tw=C.channelTW({type:'trap',b:10,z1:2,z2:2,S:0.005,n:0.035,inv:98},Q,true),tp={type:'side',Bf:9,taper:4};
  const r=C.analyze({units:'US',shape:'box',span:5,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:pick('box','b_90'),Q,twMode:'const',twElev:tw.el,taper:tp});
  chk(`HY-8 HW depth @${Q} cfs (face ${fe}, throat ${te})`,r.EL-100,hw-100,6);chk(`HY-8 throat-control depth @${Q}`,r.taper.HWt,te-100,6);chk(`HY-8 face-control depth @${Q}`,r.taper.HWfT,fe-100,8);}}

{console.log('\n-- Phase 6: HY-8 database inlet "1:1 Bevel Headwall" on a 5x5 concrete box vs HY-8 8.0 (S 0.01, trapezoidal TW) --');const C=require('./calc.js').Culvert;global.window=global.window||{};require('./hy8shapes.js');C.extendInlets(window.HY8DB);
 const inl=C.INLETS.box.find(i=>i.name.startsWith('1:1 Bevel Headwall'));chk('Ke from HY-8 database',inl.Ke,0.2,0);
 const H=[[50,102.36,2.36,1.01],[95,103.52,3.52,1.61],[140,104.56,4.56,2.15],[185,105.57,5.57,2.65],[230,106.66,6.66,3.13],[275,107.86,7.86,3.60],[300,108.60,8.60,3.85],[365,110.78,10.78,4.48],[410,112.53,12.53,4.75],[455,114.48,14.48,5.00],[500,116.89,16.89,5.00]];
 for(const [Q,el,ic,yo] of H){const tw=C.channelTW({type:'trap',b:10,z1:2,z2:2,S:0.005,n:0.035,inv:98},Q,true);
  const r=C.analyze({units:'US',shape:'box',span:5,rise:5,barrels:1,length:200,invIn:100,invOut:98,n:0.012,inlet:inl,Q,twMode:'const',twElev:tw.el});
  const tl=ic/5>3?2:1;chk(`HY-8 HW El @${Q} cfs${tl>1?" (HW/D>3, beyond polynomial range)":""}`,r.EL-100,el-100,tl);chk(`HY-8 inlet-control depth @${Q}`,r.HWi,ic,tl);}
 chk('Circular gets 3 HY-8 inlets (bevel 1:1, 1.5:1, mitered)',C.INLETS.circular.filter(i=>/^hyc_/.test(i.id)).length,3,0);}
console.log(ok?'\nALL CHECKS PASSED':'\nSOME CHECKS FAILED'); process.exit(ok?0:1);
