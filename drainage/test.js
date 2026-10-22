const D=require('./calc.js');let pass=0,fail=0;const rows=[];
function info(name,got,exp,why){rows.push(`INFO | ${name} | ${(+got).toFixed(3)} | ${exp} | ${why}`);}
function chk(name,got,exp,tol){const ok=Math.abs(got-exp)<=tol;ok?pass++:fail++;rows.push(`${ok?'PASS':'FAIL'} | ${name} | ${(+got).toFixed(3)} | ${exp} | ±${tol}`);}
const g51={type:'uniform',n:0.016,SL:0.01,Sx:0.02};
chk('Ex5.1A T @Q1.8',D.gutterT(1.8,g51),9.0,0.1);
chk('Ex5.1B Q @T8.2',D.gutterQ(8.2,g51).Q,1.4,0.05);
const g52={type:'composite',n:0.016,SL:0.01,Sx:0.02,W:2,a:2};
const r52=D.gutterQ(8.2,g52);chk('Ex5.2A Eo @T8.2',r52.Eo,0.70,0.015);chk('Ex5.2A Qs',r52.Qs,0.66,0.02);chk('Ex5.2A Q',r52.Q,2.3,0.1);
chk('Ex5.2B T @Q4.2',D.gutterT(4.2,g52),11.1,0.1);
chk('Ex5.3 V-gutter T @Q1.77',D.gutterT(1.77,{type:'v3',n:0.016,SL:0.01,Sx1:0.25,Sx2:0.04,Sx3:0.02,TBC:2}),8.3,0.1);
chk('TxDOT Eq10-4 vs HEC Eq5.4 T',D.txGutter(1.8,0.02,0.01,0.016).T,D.gutterT(1.8,g51),0.1);
const c61=D.chanQ(1.6,{B:2.6,z1:3,n:0.03,S:0.01});chk('Ex6.1 A',c61.A,11.8,0.05);chk('Ex6.1 P',c61.P,12.7,0.05);chk('Ex6.1 Q',c61.Q,55.7,0.6);chk('Ex6.1 V',c61.V,4.7,0.05);
chk('Ex6.1 normal depth @55.7',D.chanDepth(55.7,{B:2.6,z1:3,n:0.03,S:0.01}).d,1.6,0.01);
const g71={type:'uniform',n:0.016,SL:0.04,Sx:0.025},Q71=D.gutterQ(9.84,g71).Q;chk('Ex7.1 Q',Q71,6.62,0.03);
[['P-1-7/8 2x2',2,8.2,1.0,0.038,3.15],['Reticuline 2x2',2,4.07,0.88,0.038,2.80],['P-1-7/8 2x4',4,8.2,1.0,0.163,3.60],['Reticuline 2x4',4,5.5,1.0,0.163,3.60]].forEach(([nm,L,Vo,Rf,Rs,Qi])=>{
 const r=D.grateGrade(g71,Q71,{W:2,L,Vo});if(nm==='P-1-7/8 2x2'){chk('Ex7.1 Eo',r.Eo,0.45,0.01);chk('Ex7.1 V',r.V,5.4,0.05);}
 chk(`Ex7.1 ${nm} Rf`,r.Rf,Rf,0.01);chk(`Ex7.1 ${nm} Rs`,r.Rs,Rs,0.002);chk(`Ex7.1 ${nm} Qi`,r.Qi,Qi,0.03);});
const g72={type:'uniform',n:0.016,SL:0.01,Sx:0.02};
let r=D.curbGrade(g72,1.77,{L:9.84,a:0});chk('Ex7.2 undepr LT',r.LT,23.9,0.2);chk('Ex7.2 undepr E',r.E,0.61,0.01);chk('Ex7.2 undepr Qi',r.Qi,1.08,0.02);
r=D.curbGrade(g72,1.77,{L:9.84,a:1,W:2});chk('Ex7.2 depr Eo',r.Eo,0.64,0.01);chk('Ex7.2 depr Se',r.Se,0.047,0.001);chk('Ex7.2 depr LT',r.LT,14.3,0.15);chk('Ex7.2 depr E',r.E,0.88,0.01);chk('Ex7.2 depr Qi',r.Qi,1.56,0.03);
const LT73=0.6*Math.pow(2.26,0.42)*Math.pow(0.01,0.3)*Math.pow(1/(0.016*(0.02+(2/12)/2*0.70)),0.6);chk('Ex7.3 LT (Eo 0.70 given)',LT73,11.7,0.1);
r=D.curbGrade(g72,2.26,{L:20,a:2,W:2});chk('Ex7.3 Eo from Q2.26 (5.2A gives 0.70)',r.Eo,0.70,0.02);chk('Ex7.3 LT computed',r.LT,11.7,0.15);
r=D.comboGrade(g72,1.77,{L:9.84,a:1,W:2},{W:2,L:2,Vo:6});chk('Ex7.4 curb part Qic',r.curb.Qi,1.35,0.02);info('Ex7.4 grate Eo',r.grate.Eo,0.97,'book iterates on Qs rounded to 0.01 cfs');info('Ex7.4 grate T',r.grate.T,3.2,'same');info('Ex7.4 grate V',r.grate.V,2.27,'follows T');info('Ex7.4 grate Rs',r.grate.Rs,0.13,'follows V');chk('Ex7.4 grate Qig',r.grate.Qi,0.41,0.01);chk('Ex7.4 total Qi',r.Qi,1.76,0.02);
const SQ=Math.sqrt(64.4);chk('Ex7.5 req P @d0.442 (unrounded)',6.71/(0.37*SQ*Math.pow(0.442,1.5)),7.66,0.05);
r=D.grateSag(6.71,{W:2,L:6,ratio:0.9,clog:0.5},0.05,0.05);chk('Ex7.5 double 2x3, 50% clog P',r.P,8,1e-9);chk('Ex7.5 weir d',r.dw,0.43,0.005);
info('Ex7.5 req Ag @d0.44',6.71/(0.67*Math.sqrt(64.4*0.44)),2.15,'book arithmetic: 6.71/(0.67*sqrt(64.4*0.44)) = 1.88');chk('Ex7.5 orifice check d (Ag 3.0)',Math.pow(6.71/(0.67*3.0),2)/64.4,0.17,0.005);
r=D.curbSagCap(0.164,{L:8.2,h:0.43,a:0});chk('Ex7.6 undepressed Qi',r.Qi,1.6,0.05);
r=D.curbSagCap(0.16,{L:8.2,h:0.43,a:1,W:2});info('Ex7.6 depressed Qi (d=0.16)',r.Qi,1.7,'0.29*8.025*11.8*0.16^1.5 = 1.76; book shows 1.7');chk('Ex7.6 depressed di',r.di,0.25,0.01);chk('Ex7.6 depressed regime weir',r.regime==='weir'?1:0,1,0);
r=D.slotLen(4.9,0.3,1.75/12);chk('Ex7.7 weir L',r.Lw,12.0,0.1);chk('Ex7.7 orifice L',r.Lo,9.6,0.1);
r=D.comboSag(5.3,{W:2,L:4,ratio:0.9},{L:4,h:0.325,a:0},0.03);chk('Ex7.8 grate weir davg (Cw 0.37 vs 3.0)',r.dav,0.36,0.01);chk('Ex7.8 curb depth',r.dcW,0.39,0.01);chk('Ex7.8 T clear',r.Tclear,13,0.3);
chk('Ex7.8 clogged do',r.clog.do,0.576,0.005);chk('Ex7.8 clogged di',r.clog.diO,0.74,0.005);chk('Ex7.8 clogged T',r.Tclog,24.7,0.2);
// TxDOT method consistency checks
r=D.curbGrade(g72,1.77,{L:9.84,a:0,method:'TxDOT'});chk('TxDOT undepr LT = HEC LT',r.LT,D.curbGrade(g72,1.77,{L:9.84,a:0}).LT,0.05);
r=D.curbGrade(g72,1.77,{L:9.84,a:1,W:2,method:'TxDOT'});chk('TxDOT Eo (Eq10-5) in [0,1]',r.Eo>0&&r.Eo<1?1:0,1,0);
console.log(rows.join('\n'));console.log(`\n${pass} pass, ${fail} fail`);
if(typeof process!=='undefined'&&fail)process.exit(1);
