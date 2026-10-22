// Sag vertical curve + flanking inlets.
// HEC-22 4th ed. (2024) Sec. 7.4.3 "Flanking Inlets": Eq. 7.22 X = (74 d K)^0.5, Eq. 7.23 K = L/(G2 - G1), Example 7.10;
// "located so that the depth of ponding at the flanking inlets is 63 percent of the depth of ponding at the low point".
// TxDOT HDM Ch. 10 Sec. 5: "Flanking inlets should be analyzed as inlets on-grade at some specified distance
// (usually 50 or 100 feet) away from the low point on the sag vertical curve."
(function(root){
const DR=root.DR||(typeof require!=='undefined'?require('./calc.js'):null);
const bis=(f,lo,hi)=>{let a=lo,b=hi,fa=f(a);for(let i=0;i<200;i++){const m=(a+b)/2,fm=f(m);if((fm>0)===(fa>0)){a=m;fa=fm;}else b=m;if(b-a<1e-10)break;}return (a+b)/2;};
const Kof=o=>o.kmode==='GL'?o.Lvc/(o.G2-o.G1):o.K;                       // Eq. 7.23
const Xof=(d,K)=>Math.sqrt(74*d*K);                                       // Eq. 7.22
const rise=(x,K)=>x*x/(200*K);                                            // parabola: grade changes 1 % per K ft
const gradeAt=(x,K)=>x/(100*K);                                           // local longitudinal slope, ft/ft
// depth at curb (from normal cross slope) at a sag inlet carrying Q; inlet {it,gw,gl,ratio,clog,Sw,cl,h,ca,cw,throat,theta,sl,sw}
function sagD(Q,i,Sx){if(Q<=0)return 0;
 if(i.it==='grate')return DR.grateSag(Q,{W:i.gw,L:i.gl,ratio:i.ratio,clog:i.clog||0},Sx,i.Sw||Sx).dCurb;
 if(i.it==='curb')return DR.curbSagDepth(Q,{L:i.cl,h:i.h,a:i.ca||0,W:i.cw,throat:i.throat||'vertical',theta:i.theta||0}).d;
 if(i.it==='combo')return DR.comboSag(Q,{W:i.gw,L:i.gl,ratio:i.ratio},{L:i.cl,h:i.h,a:0},Sx).clear;
 return DR.slotSag(Q,i.sl,i.sw/12).d;}
// sag capacity at depth d (inverse of sagD)
function sagCap(d,i,Sx){if(d<=0)return 0;if(i.it==='curb')return DR.curbSagCap(d,{L:i.cl,h:i.h,a:i.ca||0,W:i.cw,throat:'vertical'}).Qi;
 return bis(q=>sagD(q,i,Sx)-d,1e-9,500);}
function onGrade(Q,i,g){if(Q<=0)return {Qi:0,Qb:0,T:0};
 const c={L:i.cl,a:i.ca||0,W:i.cw,method:i.meth||'HEC22'},gr={W:i.gw,L:i.gl,Vo:i.Vo};
 return i.it==='curb'?DR.curbGrade(g,Q,c):i.it==='grate'?DR.grateGrade(g,Q,gr):DR.comboGrade(g,Q,c,gr);}
// o: {kmode,K,G1,G2,Lvc,Sx,n,Tal,QL,QR,xmode:'eq'|'user',Xu,low:inlet,fl:inlet}
function compute(o){const K=Kof(o),dA=o.Sx*o.Tal,Xeq=Xof(dA,K),X=o.xmode==='user'?o.Xu:Xeq,y=rise(X,K),SL=gradeAt(X,K);
 const g={type:'uniform',n:o.n,SL,Sx:o.Sx};const L=onGrade(o.QL,o.fl,g),R=onGrade(o.QR,o.fl,g);
 const Qt=o.QL+o.QR,Qlow=L.Qb+R.Qb;const d0=sagD(Qt,o.low,o.Sx),d1=sagD(Qlow,o.low,o.Sx);
 // main inlet clogged: both flankers act as sag inlets under the common pond; depth at flanker = d_low - y
 const capAt=dl=>2*sagCap(dl-y,o.fl,o.Sx);const dC=y+bis(df=>2*sagCap(df,o.fl,o.Sx)-Qt,1e-6,20);
 return {K,dA,Xeq,X,y,SL,G:SL*100,L,R,Qt,Qlow,without:{d:d0,T:d0/o.Sx},with:{d:d1,T:d1/o.Sx},clog:{d:dC,T:dC/o.Sx,df:dC-y,ratio:(dC-y)/dC,ok:dC/o.Sx<=o.Tal+1e-9,capAtAllow:capAt(dA)}};}
const API={Kof,Xof,rise,gradeAt,sagD,sagCap,onGrade,compute};
if(typeof module!=='undefined')module.exports=API;else root.FL=API;
})(typeof window!=='undefined'?window:globalThis);
