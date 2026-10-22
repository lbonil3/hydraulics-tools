/* Inlet spacing on grade: Rational Q for a pavement strip + carryover, then gutter spread/depth and inlet
   interception using the HEC-22-validated functions in calc.js (DR). TxDOT HDM Ch. 10 Sec. 4 "Ponding";
   Rational Method TxDOT HDM Ch. 4 Sec. 12 (Q = CiA, Tc >= 10 min). */
(function(root){
const DR=root.DR||(typeof require!=='undefined'?require('./calc.js'):null);
// p: {W (ft pavement width), C, i (in/hr), Qco (cfs in), gutter g {type,n,SL,Sx,W,a}, inlet {type:'curb'|'grate'|'combo', cl,ca,cw,meth, gw,gl,Vo},
//     lim {Qb, T, d}}
function evalL(p,L){
 const A=p.W*L/43560,Qr=p.C*p.i*A,Q=Qr+(p.Qco||0);
 if(!(Q>0))return {L,A,Qr,Q:0,T:0,d:0,Qi:0,Qb:0,ok:true,pass:{Qb:true,T:true,d:true}};
 const gs=DR.gutter(p.g,{Q}),inl=p.inlet,gu={type:'uniform',n:p.g.n,SL:p.g.SL,Sx:p.g.Sx};let r;
 if(inl.type==='grate')r=DR.grateGrade(p.g,Q,{W:inl.gw,L:inl.gl,Vo:inl.Vo});
 else if(inl.type==='combo')r=DR.comboGrade(gu,Q,{L:inl.cl,a:inl.ca,W:inl.cw,method:inl.meth},{W:inl.gw,L:inl.gl,Vo:inl.Vo});
 else r=DR.curbGrade(gu,Q,{L:inl.cl,a:inl.ca,W:inl.cw,method:inl.meth});
 const pass={Qb:r.Qb<=p.lim.Qb+1e-12,T:gs.T<=p.lim.T+1e-12,d:gs.d<=p.lim.d+1e-12};
 return {L,A,Qr,Q,T:gs.T,d:gs.d,V:gs.V,Qi:r.Qi,Qb:r.Qb,E:r.Qi/Q,inlet:r,pass,ok:pass.Qb&&pass.T&&pass.d};}
// longest L meeting each criterion (all three grow monotonically with L) by bisection
function maxL(p,Lmax=20000){
 const crit=['Qb','T','d'],out={};
 crit.forEach(k=>{const okAt=L=>evalL(p,L).pass[k];
  if(!okAt(1e-6)){out[k]=0;return;} if(okAt(Lmax)){out[k]=Infinity;return;}
  let lo=1e-6,hi=Lmax;for(let i=0;i<60;i++){const m=(lo+hi)/2;okAt(m)?lo=m:hi=m;}out[k]=lo;});
 const L=Math.min(out.Qb,out.T,out.d),gov=crit.reduce((a,k)=>out[k]<out[a]?k:a,'Qb');
 return {L,gov,each:out,at:isFinite(L)?evalL(p,L):null};}
// chain of inlets down a street: each inlet's bypass becomes the next inlet's carryover
function chain(p,n,mode,Lfix){const rows=[];let co=p.Qco||0,sta=0;
 for(let k=0;k<n;k++){const q=Object.assign({},p,{Qco:co});let L=Lfix;
  if(mode==='auto'){const m=maxL(q);L=isFinite(m.L)?Math.floor(m.L):20000;if(L<=0){rows.push({k,L:0,sta,fail:true,gov:m.gov,Qco:co});break;}}
  const r=evalL(q,L);sta+=L;rows.push(Object.assign(r,{k,sta,Qco:co}));co=r.Qb;}
 return rows;}
// roadway width builder: (lanes x lane width + shoulder/parking + extra) x (0.5 if crowned: half drains here)
function roadWidth(o){const full=o.nl*o.lw+(o.sh||0)+(o.ex||0);return o.crown==='half'?full/2:full;}
const acres=(W,L)=>W*L/43560;
const LABEL={Qb:'bypass limit',T:'allowable spread',d:'allowable depth'};
const API={evalL,maxL,chain,LABEL,roadWidth,acres};
if(typeof module!=='undefined')module.exports=API;else root.SP=API;
})(typeof window!=='undefined'?window:globalThis);
