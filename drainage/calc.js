/* Drainage Studio calculations (US customary units).
   Gutter flow: FHWA HEC-22 4th ed. (2024) Ch. 5 Eq. 5.2-5.9; TxDOT HDM Ch. 10 Sec. 6 Eq. 10-1..10-4.
   Inlets: HEC-22 Ch. 7 Eq. 7.3-7.21; TxDOT HDM Ch. 10 Sec. 6 Eq. 10-5..10-18.
   Channels: HEC-22 Ch. 6 Eq. 6.5-6.9; TxDOT HDM Ch. 6 Sec. 1 Eq. 6-2/6-3. */
(function(root){
const G=32.2,SQ2G=Math.sqrt(2*G),Ku=0.56;
const bis=(f,lo,hi,it=200)=>{let flo=f(lo);for(let i=0;i<it;i++){const m=(lo+hi)/2,fm=f(m);if((fm>0)===(flo>0)){lo=m;flo=fm;}else hi=m;if(hi-lo<1e-10)break;}return (lo+hi)/2;};
// ---------- gutter ----------
// g: {type:'uniform'|'composite'|'v'|'v3', n, SL, Sx, W, a (in), Sx1,Sx2,Sx3,TBC}
function qUniform(T,Sx,SL,n){return Ku/n*Math.pow(Sx,1.67)*Math.sqrt(SL)*Math.pow(T,2.67);}            // Eq 5.2
function tUniform(Q,Sx,SL,n){return Math.pow(Q*n/(Ku*Math.pow(Sx,1.67)*Math.sqrt(SL)),0.375);}         // Eq 5.4
function vUniform(T,Sx,SL,n){return 1.11/n*Math.sqrt(SL)*Math.pow(Sx,0.67)*Math.pow(T,0.67);}          // Eq 5.3
function Eo57(T,W,Sx,Sw){if(T<=W)return 1;const r=Sw/Sx;return 1/(1+r/(Math.pow(1+r/(T/W-1),2.67)-1));} // Eq 5.7
function Eo73(T,W){return W>=T?1:1-Math.pow(1-W/T,2.67);}                                                  // Eq 7.3
function vSx(g){return g.Sx1*g.Sx2/(g.Sx1+g.Sx2);}                                                         // Eq 5.9
function v3T(Q,g){ // HEC-22 Example 5.3 procedure
 const Sx=vSx(g),Tp=tUniform(Q,Sx,g.SL,g.n),TAC=g.TBC*g.Sx2/g.Sx1+g.TBC;
 if(Tp<=TAC)return {T:Tp,Sx,inV:true,TAC};
 let TBD=Tp,Sxc=Sx;for(let i=0;i<100;i++){const Sw=(g.TBC*g.Sx2+(TBD-g.TBC)*g.Sx3)/TBD;Sxc=g.Sx1*Sw/(g.Sx1+Sw);const T=tUniform(Q,Sxc,g.SL,g.n);if(Math.abs(T-TBD)<1e-7){TBD=T;break;}TBD=0.5*(TBD+T);}
 return {T:TBD,Sx:Sxc,inV:false,TAC};}
function gutterQ(T,g){
 if(g.type==='composite'){const a=g.a/12,Sw=g.Sx+a/g.W;
  if(T<=g.W)return {Q:qUniform(T,Sw,g.SL,g.n),Eo:1,Sw,Qs:0};
  const Qs=qUniform(T-g.W,g.Sx,g.SL,g.n),Eo=Eo57(T,g.W,g.Sx,Sw);return {Q:Qs/(1-Eo),Eo,Sw,Qs};}         // Eq 5.7/5.8
 if(g.type==='v')return {Q:qUniform(T,vSx(g),g.SL,g.n),Sx:vSx(g)};
 if(g.type==='v3'){const Q=bis(q=>v3T(q,g).T-T,1e-9,1e5);return {Q,Sx:v3T(Q,g).Sx};}
 return {Q:qUniform(T,g.Sx,g.SL,g.n)};}
function gutterT(Q,g){
 if(g.type==='uniform')return tUniform(Q,g.Sx,g.SL,g.n);
 if(g.type==='v')return tUniform(Q,vSx(g),g.SL,g.n);
 if(g.type==='v3')return v3T(Q,g).T;
 return bis(T=>gutterQ(T,g).Q-Q,1e-6,500);}
function gutter(g,inp){ // inp {Q} or {T}
 const T=inp.T!=null?inp.T:gutterT(inp.Q,g),r=gutterQ(T,g),Q=inp.Q!=null?inp.Q:r.Q;let A,d,V;
 if(g.type==='composite'){const a=g.a/12;A=0.5*T*T*g.Sx+0.5*a*g.W;d=T*g.Sx+a;V=Q/A;}
 else if(g.type==='uniform'){A=0.5*T*T*g.Sx;d=T*g.Sx;V=vUniform(T,g.Sx,g.SL,g.n);}
 else{const Sx=r.Sx;A=0.5*T*T*Sx;d=T*Sx;V=Q/A;}
 const o={Q,T,d,A,V,Eo:r.Eo,Sw:r.Sw,Qs:r.Qs,SxEff:r.Sx};if(g.type==='v3')Object.assign(o,{v3:v3T(Q,g)});return o;}
// TxDOT HDM Eq 10-1..10-4 (uniform section, vertical curb)
function txGutter(Q,Sx,SL,n){const y=1.24*Math.pow(Q*n*Sx/Math.sqrt(SL),0.375);return {y,T:y/Sx};}
// ---------- grate on grade ----------
// p: {gutter g, Q, grate:{W,L,Vo}}
function grateGrade(g,Q,gr){
 const s=gutter(g,{Q});const Sx=g.type==='uniform'||g.type==='composite'?g.Sx:s.SxEff;
 const Eo=g.type==='composite'&&Math.abs(gr.W-g.W)<1e-9?s.Eo:Eo73(s.T,gr.W);
 const Rf=Math.min(1,1-0.09*(s.V-gr.Vo));                                                                 // Eq 7.5
 const Rs=1/(1+0.15*Math.pow(s.V,1.8)/(Sx*Math.pow(gr.L,2.3)));                                         // Eq 7.6
 const Qi=Q*(Rf*Eo+Rs*(1-Eo));return {Q,T:s.T,V:s.V,d:s.d,Eo,Rf:Math.max(0,Rf),Rs,Qi:Math.min(Q,Math.max(0,Qi)),Qb:Q-Math.min(Q,Math.max(0,Qi)),E:Math.min(Q,Qi)/Q,gut:s};} // Eq 7.7/7.9
// ---------- curb opening on grade ----------
// c:{L, a (in, local depression), W, method:'HEC22'|'TxDOT'}
function curbGrade(g,Q,c){
 const n=g.n,SL=g.SL,Sx=g.Sx,a=(c.a||0)/12;let T,Eo=null,Se=Sx,tx=null;
 if(c.method==='TxDOT'){const t=txGutter(Q,Sx,SL,n);T=t.T;
  if(a>0&&c.W>0){const W=Math.min(c.W,T),Aw=W*Sx*(T-W/2)+0.5*a*W,Pw=Math.sqrt(Math.pow(W*Sx+a,2)+W*W),A0=Sx/2*Math.pow(T-W,2),P0=T-W;
   const K=(A,P)=>P>0?1.486*Math.pow(A,5/3)/(n*Math.pow(P,2/3)):0,Kw=K(Aw,Pw),K0=K(A0,P0);Eo=Kw/(Kw+K0);Se=Sx+a/c.W*Eo;tx={y:t.y,Aw,Pw,A0,P0,Kw,K0};} // Eq 10-5..10-11
  else tx={y:t.y};}
 else{if(a>0&&c.W>0){const s=gutter({type:'composite',n,SL,Sx,W:c.W,a:c.a},{Q});T=s.T;Eo=s.Eo;Se=Sx+a/c.W*Eo;} // Eq 7.11
  else T=tUniform(Q,Sx,SL,n);}
 const LT=0.6*Math.pow(Q,0.42)*Math.pow(SL,0.3)*Math.pow(1/(n*Se),0.6);                                   // Eq 7.10/7.12, TxDOT 10-12
 const E=c.L>=LT?1:1-Math.pow(1-c.L/LT,1.8);                                                               // Eq 7.13, TxDOT 10-13
 return {Q,T,Eo,Se,LT,E,Qi:E*Q,Qb:Q-E*Q,tx};}
// ---------- combination on grade (sweeper if curb longer than grate) ----------
function comboGrade(g,Q,c,gr){
 const Lc=Math.max(0,c.L-gr.L);let cu=null,Qg=Q;
 if(Lc>0){cu=curbGrade(g,Q,Object.assign({},c,{L:Lc}));Qg=Q-cu.Qi;}
 const gg=c.a>0&&c.W>0?{type:'composite',n:g.n,SL:g.SL,Sx:g.Sx,W:c.W,a:c.a}:g;
 const gt=Qg>1e-9?grateGrade(gg,Qg,Object.assign({},gr,{W:c.a>0&&c.W>0?c.W:gr.W})):{Qi:0,Eo:1,Rf:1,Rs:0,V:0,T:0};
 const Qi=(cu?cu.Qi:0)+gt.Qi;return {Q,Lc,curb:cu,Qg,grate:gt,Qi,Qb:Q-Qi,E:Qi/Q};}
// ---------- sag ----------
const wD=(Q,Cw,L)=>Math.pow(Q/(Cw*SQ2G*L),2/3), oD=(Q,Co,A)=>Math.pow(Q/(Co*A),2)/(2*G);
// grate in sag: gr {W,L,ratio,clog (0-1), curb:true}, Sx cross slope, Sw gutter slope
function grateSag(Q,gr,Sx,Sw){
 const c=gr.clog||0,P=gr.curb===false?2*(gr.L+gr.W)*(1-c):gr.L+(1-c)*2*gr.W,Ag=gr.L*gr.W*gr.ratio*(1-c);
 const dw=wD(Q,0.37,P),dor=oD(Q,0.67,Ag),d=Math.max(dw,dor),dc=d+(gr.W/2)*(Sw||Sx);                      // Eq 7.14/7.15
 return {P,Ag,dw,dor,d,regime:dw>=dor?'weir':'orifice',dCurb:dc,T:dc/Sx};}
// curb opening in sag: c {L,h,a(in),W,throat:'vertical'|'inclined',theta(deg)}
function curbSagDepth(Q,c){
 const a=(c.a||0)/12,dep=a>0&&c.W>0&&c.L<=12;
 const dW=dep?wD(Q,0.29,c.L+1.8*c.W):wD(Q,0.37,c.L);const diW=dW+a;                                       // Eq 7.16/7.17
 const off=c.throat==='inclined'?(c.h/2)*Math.sin((c.theta||0)*Math.PI/180):c.h/2;
 const dO=oD(Q,0.67,c.L*c.h),diO=dO+off;                                                                   // Eq 7.19 / TxDOT 10-17
 let regime,di;if(diW<=c.h){regime='weir';di=diW;}else if(diO>=1.4*c.h){regime='orifice';di=diO;}else{regime='transition';di=Math.max(diW,diO);}
 return {dep,dW,diW,do:dO,diO,di,d:di-a,regime,h:c.h};}
function curbSagCap(d,c){ // capacity at depth d measured from normal cross slope
 const a=(c.a||0)/12,dep=a>0&&c.W>0&&c.L<=12,di=d+a;
 const Qw=dep?0.29*SQ2G*(c.L+1.8*c.W)*Math.pow(d,1.5):0.37*SQ2G*c.L*Math.pow(d,1.5);
 const off=c.throat==='inclined'?(c.h/2)*Math.sin((c.theta||0)*Math.PI/180):c.h/2,dO=Math.max(0,di-off);
 const Qo=0.67*c.L*c.h*Math.sqrt(2*G*dO);let regime,Qi;
 if(di<=c.h){regime='weir';Qi=Qw;}else if(di>=1.4*c.h){regime='orifice';Qi=Qo;}else{regime='transition';Qi=Math.min(Qw,Qo);}
 return {di,Qw,Qo,Qi,regime,dep};}
// slotted in sag
function slotSag(Q,L,w){const dw=wD(Q,0.31,L),dor=Math.pow(Q/(0.8*L*w),2)/(2*G);return {dw,dor,d:Math.max(dw,dor)};}          // Eq 7.20/7.21
function slotLen(Q,d,w){return {Lw:Q/(0.31*SQ2G*Math.pow(d,1.5)),Lo:Q/(0.8*w*Math.sqrt(2*G*d))};}
// combination in sag: grate weir controls when clear; clogged grate -> curb alone; orifice -> sum
function comboSag(Q,gr,c,Sx){
 const P=gr.L+2*gr.W,dav=wD(Q,0.37,P),dcW=dav+Sx*gr.W/2;
 const Ag=gr.L*gr.W*gr.ratio,off=c.h/2;
 const dOr=bis(d=>0.67*Ag*Math.sqrt(2*G*Math.max(0,d-Sx*gr.W/2))+0.67*c.L*c.h*Math.sqrt(2*G*Math.max(0,d-off))-Q,1e-6,50);
 const clear=Math.max(dcW,dOr),clog=curbSagDepth(Q,c);
 return {P,dav,dcW,dOr,clear,Tclear:clear/Sx,regime:dcW>=dOr?'grate weir':'grate + curb orifice',clog,Tclog:clog.di/Sx};}
// ---------- channel (trapezoid, z1/z2 side slopes H:V) ----------
function chanGeom(d,ch){const z1=ch.z1,z2=ch.z2==null?ch.z1:ch.z2,A=ch.B*d+0.5*(z1+z2)*d*d,P=ch.B+d*(Math.sqrt(z1*z1+1)+Math.sqrt(z2*z2+1)),Tw=ch.B+(z1+z2)*d;return {A,P,R:A/P,Tw};} // Eq 6.7-6.9
function chanQ(d,ch){const g=chanGeom(d,ch),Q=1.486/ch.n*g.A*Math.pow(g.R,2/3)*Math.sqrt(ch.S);return Object.assign(g,{d,Q,V:Q/g.A,Fr:(Q/g.A)/Math.sqrt(G*g.A/g.Tw)});} // Eq 6.5 / TxDOT 6-3
function chanDepth(Q,ch){const d=bis(x=>chanQ(x,ch).Q-Q,1e-6,200);return chanQ(d,ch);}
function chanCrit(Q,ch){return bis(x=>{const g=chanGeom(x,ch);return Q*Q*g.Tw/(G*Math.pow(g.A,3))-1;},1e-6,200)*1;}
const API={G,qUniform,tUniform,vUniform,Eo57,Eo73,vSx,v3T,gutterQ,gutterT,gutter,txGutter,grateGrade,curbGrade,comboGrade,grateSag,curbSagDepth,curbSagCap,slotSag,slotLen,comboSag,chanGeom,chanQ,chanDepth,chanCrit};
if(typeof module!=='undefined')module.exports=API;else root.DR=API;
})(this);
