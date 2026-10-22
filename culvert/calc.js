// Culvert hydraulics per FHWA HDS-5 (3rd ed., 2012). Shared by browser and node.
(function(root){
const INLETS = {
 circular:[
  {id:'c_sq_hw',name:'Concrete pipe, square edge w/ headwall',chart:'Chart 1, scale 1',form:1,K:0.0098,M:2.0,c:0.0398,Y:0.67,Ks:-0.5,Ke:0.5},
  {id:'c_gr_hw',name:'Concrete pipe, groove end w/ headwall',chart:'Chart 1, scale 2',form:1,K:0.0018,M:2.0,c:0.0292,Y:0.74,Ks:-0.5,Ke:0.2},
  {id:'c_gr_pr',name:'Concrete pipe, groove end projecting',chart:'Chart 1, scale 3',form:1,K:0.0045,M:2.0,c:0.0317,Y:0.69,Ks:-0.5,Ke:0.2},
  {id:'m_hw',name:'CMP, headwall',chart:'Chart 2, scale 1',form:1,K:0.0078,M:2.0,c:0.0379,Y:0.69,Ks:-0.5,Ke:0.5},
  {id:'m_mit',name:'CMP, mitered to slope',chart:'Chart 2, scale 2',form:1,K:0.0210,M:1.33,c:0.0463,Y:0.75,Ks:0.7,Ke:0.7},
  {id:'m_pr',name:'CMP, projecting',chart:'Chart 2, scale 3',form:1,K:0.0340,M:1.50,c:0.0553,Y:0.54,Ks:-0.5,Ke:0.9}],
 box:[
  {id:'b_30',name:'Box, 30°–75° wingwall flares, square edge',chart:'Chart 8, scale 1',form:1,K:0.026,M:1.0,c:0.0347,Y:0.81,Ks:-0.5,Ke:0.4},
  {id:'b_90',name:'Box, 90° headwall / 15° wingwalls, square edge',chart:'Chart 8, scale 2',form:1,K:0.061,M:0.75,c:0.0400,Y:0.80,Ks:-0.5,Ke:0.5},
  {id:'b_0',name:'Box, 0° wingwalls (sides extended), square edge',chart:'Chart 8, scale 3',form:1,K:0.061,M:0.75,c:0.0423,Y:0.82,Ks:-0.5,Ke:0.5}]
};
const MANNING = {concrete:0.012, cmp:0.024, hdpe:0.012};
function geom(shape,B,D,y){ // area, top width, wetted perimeter for depth y
  y=Math.max(1e-9,Math.min(y,D));
  if(shape==='box') return {A:B*y,T:B,P:B+2*y};
  const r=D/2, th=2*Math.acos(1-2*y/D);
  return {A:r*r*(th-Math.sin(th))/2, T:D*Math.sin(th/2)||1e-9, P:r*th};
}
function bisect(f,a,b){let fa=f(a);for(let i=0;i<200;i++){const m=(a+b)/2,fm=f(m);if((fm>0)===(fa>0)){a=m;fa=fm}else b=m}return (a+b)/2}
function critical(shape,B,D,Q,g){
  const f=y=>{const G=geom(shape,B,D,y);return Q*Q/g - G.A**3/G.T};
  const top = shape==='box'?D:0.999*D;
  if(f(top)>0) return top; return bisect(f,1e-6*D,top);
}
function normal(shape,B,D,Q,n,S,k){
  if(S<=0) return Infinity;
  const q=y=>{const G=geom(shape,B,D,y);return k/n*G.A*Math.pow(G.A/G.P,2/3)*Math.sqrt(S)};
  const top = shape==='box'?D:0.938*D; // max capacity for circle occurs ~0.938D
  if(q(top)<Q) return Infinity; // flows full
  return bisect(y=>q(y)-Q,1e-6*D,top);
}
function analyze(p){
  const US=p.units!=='SI', g=US?32.174:9.81, Ku=US?1.0:1.811, kM=US?1.486:1.0, kf=US?29:19.63;
  const D=p.rise, B=p.shape==='box'?p.span:p.rise, N=p.barrels||1, Q=p.Q/N;
  const S=(p.invIn-p.invOut)/p.length, inl=p.inlet;
  const full=geom(p.shape,B,D,D), A=full.A, R=A/full.P;
  const dc=critical(p.shape,B,D,Q,g), Gc=geom(p.shape,B,D,dc), Vc=Q/Gc.A, Hc=dc+Vc*Vc/2/g;
  const yn=normal(p.shape,B,D,Q,p.n,S,kM);
  const X=Ku*Q/(A*Math.sqrt(D));
  const unsub=x=> inl.form===1 ? Hc/D + inl.K*Math.pow(x,inl.M) + inl.Ks*S : inl.K*Math.pow(x,inl.M);
  const sub=x=> inl.c*x*x + inl.Y + inl.Ks*S;
  let ratio, regime;
  if(X<=3.5){ratio=unsub(X);regime='unsubmerged';}
  else if(X>=4.0){ratio=sub(X);regime='submerged';}
  else {const u=unsub(3.5/Ku*Ku), s=sub(4.0);ratio=u+(s-u)*(X-3.5)/0.5;regime='transition';}
  // transition uses equation values at the bounds (X expressed in US-equivalent scale)
  const HWi=ratio*D;
  const TW = p.twMode==='const' ? Math.max(0,p.twElev-p.invOut) : 0;
  const ho=Math.max(TW,(dc+D)/2);
  const V=Q/A, hv=V*V/2/g;
  const Hf=kf*p.n*p.n*p.length/Math.pow(R,4/3)*hv;
  const He=inl.Ke*hv, Ho=hv, H=He+Hf+Ho;
  const ELho=p.invOut+ho+H, HWo=ELho-p.invIn;
  const ELhi=p.invIn+HWi;
  const control=HWi>=HWo?'Inlet':'Outlet';
  const HW=Math.max(HWi,HWo);
  // outlet depth & velocity
  let yout;
  if(control==='Inlet') yout=Math.min(isFinite(yn)?yn:D,D);
  else yout=Math.min(D,Math.max(dc,TW));
  const Vout=Q/geom(p.shape,B,D,yout).A;
  return {US,g,D,B,N,Q,S,A,R,dc,Vc,Hc,yn,X,regime,ratio,HWi,ELhi,TW,ho,V,hv,Hf,He,Ho,H,ELho,HWo,control,HW,EL:p.invIn+HW,yout,Vout,inlet:inl};
}
root.Culvert={INLETS,MANNING,analyze,geom,critical,normal};
})(typeof module!=='undefined'?module.exports:window);
