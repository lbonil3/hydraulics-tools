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

function sfr(shape,B,D,Q,n,kM,y){const G=geom(shape,B,D,y),V=Q/G.A;return Math.pow(n*V/kM,2)/Math.pow(G.A/G.P,4/3);}
function spE(shape,B,D,Q,g,y){const V=Q/geom(shape,B,D,y).A;return y+V*V/2/g;}
// Momentum function M = Q²/(gA) + A·ȳ (ȳ = centroid depth below water surface). Exact for box and circular segment.
// head > D means pressurised section with piezometric head 'head' above invert (centroid of full section at D/2).
function momentum(shape,B,D,Q,g,y,head){
  if(head!=null&&head>=D-1e-9){const A=geom(shape,B,D,D).A;return Q*Q/g/A+A*(head-D/2);}
  y=Math.max(1e-9,Math.min(y,D));
  if(shape==='box'){const A=B*y;return Q*Q/g/A+A*y/2;}
  const r=D/2,th=2*Math.acos(1-2*y/D),A=r*r*(th-Math.sin(th))/2;
  const d=4*r*Math.pow(Math.sin(th/2),3)/(3*(th-Math.sin(th))); // centroid distance below pipe centre
  const zc=r-d; return Q*Q/g/A+A*(y-zc);
}
function conj(shape,B,D,Q,g,y1){ // sequent (subcritical) depth; returns {y,head} (head>D if pressurised)
  const m1=momentum(shape,B,D,Q,g,y1),yc=critical(shape,B,D,Q,g);
  if(momentum(shape,B,D,Q,g,D)>=m1) return {y:bisect(y=>momentum(shape,B,D,Q,g,y)-m1,yc,D),head:null};
  const A=geom(shape,B,D,D).A; return {y:D,head:(m1-Q*Q/g/A)/A+D/2};
}
function interpPts(pts,x,k){k=k||1;for(let i=1;i<pts.length;i++)if(x<=pts[i][0]){const a=pts[i-1],b=pts[i],t=(x-a[0])/((b[0]-a[0])||1);return a[k]+(b[k]-a[k])*t;}return pts[pts.length-1][k];}
// Locate hydraulic jump between supercritical profile sup (from inlet) and subcritical profile sub (from outlet).
function findJump(shape,B,D,Q,g,L,sup,sub){
  const F=x=>{const y1=interpPts(sup,x),y2=interpPts(sub,x),h2=interpPts(sub,x,2);
    return momentum(shape,B,D,Q,g,y1)-momentum(shape,B,D,Q,g,y2,h2>=D-1e-9?h2:null);};
  if(F(L)>=0) return {type:'swept'};       // supercritical flow stronger all the way: jump pushed out of barrel
  if(F(0)<=0) return {type:'drowned'};     // subcritical stronger even at inlet: inlet drowned
  const x=bisect(F,0,L); return {type:'inside',x,y1:interpPts(sup,x),y2:interpPts(sub,x),head2:interpPts(sub,x,2)};
}
// Direct step, supercritical: start at y0 (>= yn) at inlet, march downstream until length L.
function traceSuper(shape,B,D,Q,n,S,kM,g,L,y0){
  const yn=normal(shape,B,D,Q,n,S,kM),N=400; let x=0,y=Math.min(y0,D)*0.9999,pts=[[0,y]];
  const yEnd=isFinite(yn)?yn:0; if(y<=yEnd*1.0001) return {pts:[[0,y],[L,y]],yOut:y};
  for(let i=0;i<N&&x<L;i++){const y2=y-(y-yEnd)/ (N-i) *1; const dE=spE(shape,B,D,Q,g,y2)-spE(shape,B,D,Q,g,y);
    const Sf=(sfr(shape,B,D,Q,n,kM,y)+sfr(shape,B,D,Q,n,kM,y2))/2,dx=dE/(S-Sf);
    if(!(dx>0)||x+dx>=L){ // interpolate within step (sub-step bisection on remaining length)
      const rem=L-x; const yy=bisect(z=>{const Sf2=(sfr(shape,B,D,Q,n,kM,y)+sfr(shape,B,D,Q,n,kM,z))/2;return (spE(shape,B,D,Q,g,z)-spE(shape,B,D,Q,g,y))-(S-Sf2)*rem;},y2,y);
      pts.push([L,yy]);return {pts,yOut:yy};}
    x+=dx;y=y2;pts.push([x,y]);}
  pts.push([L,y]);return {pts,yOut:y};
}
// Standard step, subcritical: start at outlet with depth yd, march upstream distance L. Pressure flow where depth reaches crown.
function traceSub(shape,B,D,Q,n,S,kM,g,L,yd,Rf,Pf){
  const N=200,dx=L/N,yc=critical(shape,B,D,Q,g),Af=geom(shape,B,D,D).A,Vf=Q/Af,Sff=Math.pow(n*Vf/kM,2)/Math.pow(Rf,4/3);
  let choked=false,y=Math.min(yd,D),pts=[[L,y,Math.max(yd,y)]],full=y>=D-1e-9,HGL=full?yd:null,fullAt=full?L:null; // HGL head above local invert
  for(let i=1;i<=N;i++){const x=L-i*dx;
    if(full){HGL=HGL+Sff*dx-S*dx; // pressure flow: HGL rises by friction, invert rises by S
      if(HGL<D){full=false;y=D;} else {pts.push([x,D,HGL]);continue;}}
    const E1=spE(shape,B,D,Q,g,y),S1=sfr(shape,B,D,Q,n,kM,y);
    const f=z=>spE(shape,B,D,Q,g,z)+S*dx-E1-(S1+sfr(shape,B,D,Q,n,kM,z))/2*dx; // E_up + z_up = E_dn + z_dn + hf
    let z;
    if(f(D)<0){full=true;fullAt=x;HGL=D+(-f(D));pts.push([x,D,HGL]);continue;} // profile hits crown -> pressure flow
    if(f(yc*1.0001)>0){z=yc;choked=true;} else z=bisect(f,yc*1.0001,D); // choke -> critical
    y=z;pts.push([x,y,y]);}
  pts.reverse();

  return {pts,choked,yIn:full?D:y,headIn:full?HGL:null,fullAt};
}
function analyze(p){
  const US=p.units!=='SI', g=US?32.174:9.81, Ku=US?1.0:1.811, kM=US?1.486:1.0, kf=US?29:19.63;
  const D=p.rise, B=p.shape==='box'?p.span:p.rise, N=p.barrels||1, Q=p.Q/N;
  const S=(p.invIn-p.invOut)/p.length, inl=p.inlet;
  const full=geom(p.shape,B,D,D), A=full.A, Pf=p.shape==='box'?2*(B+D):Math.PI*D, R=A/Pf; // full barrel: wetted perimeter includes the crown
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
  const V=Q/A, hv=V*V/2/g;
  const Hf=kf*p.n*p.n*p.length/Math.pow(R,4/3)*hv;
  const He=inl.Ke*hv, Ho=hv, H=He+Hf+Ho;
  // HDS-5 full-flow energy method (used when barrel flows full or no subcritical profile can form)
  const hoHDS=Math.max(TW,(dc+D)/2), ELhoHDS=p.invOut+hoHDS+H;
  const steep=isFinite(yn)&&yn<dc;
  // ---- Outlet control: HY-8-style subcritical profile from downstream control ----
  let ho=hoHDS, ELho=ELhoHDS, ocMethod='full', ocProf=null, yinO=null;
  const yd=Math.max(TW,dc);
  if(TW>=D){ // outlet submerged: pressure flow, HDS-5 Eq. with ho=TW
    ho=TW; ELho=p.invOut+TW+H; ocMethod='full';
  } else if(!(steep&&TW<dc)){ // mild/horizontal, or steep with TW above dc
    const tr=traceSub(p.shape,B,D,Q,p.n,S,kM,g,p.length,yd,R,Pf);
    ocProf=tr.pts; ocMethod=tr.fullAt!=null?'profile+full':'profile';
    if(tr.choked&&steep){ocMethod='steep-full';} else {
    const yi=tr.yIn; yinO=yi; const Vi=Q/geom(p.shape,B,D,yi).A;
    // HW = inlet water depth + velocity head + entrance loss (Ke on barrel velocity at inlet)
    const ELp=p.invIn+(tr.headIn!=null?tr.headIn:yi)+(1+inl.Ke)*Vi*Vi/2/g;
    ELho=ELp; ho=yd;}
  } else ocMethod='steep-full'; // steep, low TW: no subcritical profile possible -> HDS-5 / HY-8 full-flow method
  const HWo=ELho-p.invIn;
  const ELhi=p.invIn+HWi;
  let control=HWi>=HWo?'Inlet':'Outlet';
  const HW=Math.max(HWi,HWo);
  // ---- outlet depth & velocity from profile ----
  let yout, profile=null, outMethod;
  let jump=null, jumpType=null;
  if(control==='Inlet' && steep){ // S2 profile from dc at inlet downstream
    const tr=traceSuper(p.shape,B,D,Q,p.n,S,kM,g,p.length,dc);
    profile=tr.pts; yout=tr.yOut; outMethod='S2 profile from d<sub>c</sub> at inlet'; jumpType='swept';
    if(TW>yout){ // tailwater may force a hydraulic jump inside the barrel
      const sb=ocProf||traceSub(p.shape,B,D,Q,p.n,S,kM,g,p.length,yd,R,Pf).pts;
      const j=findJump(p.shape,B,D,Q,g,p.length,tr.pts,sb); jumpType=j.type;
      if(j.type==='inside'){jump={x:j.x,y1:j.y1,y2:j.y2,head2:j.head2};
        profile=tr.pts.filter(q=>q[0]<j.x).concat([[j.x,j.y1],[j.x,j.y2]],sb.filter(q=>q[0]>j.x).map(q=>[q[0],q[1]]));
        yout=Math.min(D,yd); outMethod=`hydraulic jump in barrel ${j.x.toFixed(1)} from inlet; tailwater-controlled max(d<sub>c</sub>, TW) at outlet`;}
      else if(j.type==='drowned'){profile=sb.map(q=>[q[0],q[1]]);yout=Math.min(D,yd);outMethod='jump drowns inlet — subcritical/outlet-control profile through barrel';}
      else outMethod='S2 profile from d<sub>c</sub> at inlet (jump swept out of barrel)';
    }
  } else if(control==='Inlet'){ // inlet control on mild slope (uncommon): subcritical profile from outlet
    const tr=traceSub(p.shape,B,D,Q,p.n,S,kM,g,p.length,yd,R,Pf); profile=tr.pts.map(q=>[q[0],q[1]]); yout=Math.min(D,yd); outMethod='max(d<sub>c</sub>, TW) at outlet';
  } else { profile=ocProf&&ocProf.map(q=>[q[0],q[1]]); yout=Math.min(D,yd); outMethod=TW>=D?'barrel full (TW ≥ D)':'max(d<sub>c</sub>, TW) at outlet'; }
  if(jumpType==='drowned') control='Outlet'; // inlet submerged by the jump: outlet (subcritical) regime governs the barrel
  if(!profile){profile=[[0,Math.min(D,control==='Inlet'?dc:D)],[p.length,yout]];}
  const Vout=Q/geom(p.shape,B,D,yout).A;
  return {jump,jumpType,US,g,D,B,N,Q,S,A,R,dc,Vc,Hc,yn,X,regime,ratio,HWi,ELhi,TW,ho,V,hv,Hf,He,Ho,H,ELho,HWo,control,HW,EL:p.invIn+HW,yout,Vout,inlet:inl,steep,ocMethod,outMethod,profile,yinO,hoHDS,ELhoHDS};
}

// ---- Roadway overtopping (HDS-5 Eq. 3.9, Fig. 3.11; curves from HDS-1 / HY-7, as used in HY-8) ----
// Curves digitized from HDS-5 (2012) Figure 3.11 A/B/C. Units for curve lookups: ft.
const CR_DEEP={paved:[[0.15,3.05],[0.20,3.065],[0.24,3.075],[0.28,3.085],[0.32,3.09]],
               gravel:[[0.15,2.945],[0.20,2.98],[0.24,3.01],[0.28,3.05],[0.32,3.09]]}; // Fig 3.11A: Cr vs HWr/Lr (>0.15)
const CR_SHALLOW={paved:[[0,2.92],[0.15,2.98],[0.3,3.01],[0.6,3.03],[1,3.03],[2,3.035],[4,3.04]],
               gravel:[[0,2.50],[0.2,2.60],[0.5,2.70],[0.9,2.80],[1.5,2.90],[2,2.96],[2.6,3.00],[3.2,3.03],[4,3.04]]}; // Fig 3.11B: Cr vs HWr ft (HWr/Lr<=0.15)
const KT={paved:[[0,1],[0.77,1],[0.85,0.97],[0.90,0.93],[0.94,0.85],[0.96,0.70],[0.975,0.50],[1,0]],
          gravel:[[0,1],[0.75,1],[0.80,0.97],[0.87,0.90],[0.91,0.80],[0.94,0.70],[0.96,0.60],[0.97,0.50],[1,0]]}; // Fig 3.11C: kt vs ht/HWr (below 0.5 extrapolated to 0 at 1.0)
function interp(t,x){if(x<=t[0][0])return t[0][1];for(let i=1;i<t.length;i++)if(x<=t[i][0]){const a=t[i-1],b=t[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return t[t.length-1][1];}
function weirCoef(hFt,LrFt,surface){ // returns Cr (US)
  return (LrFt>0&&hFt/LrFt>0.15)?interp(CR_DEEP[surface],hFt/LrFt):interp(CR_SHALLOW[surface],hFt);}
function ktFactor(ratio,surface){return ratio<=0?1:interp(KT[surface],Math.min(ratio,1));}
// road: {segs:[[sta,elev],...], Lr, surface:'paved'|'gravel'|'custom', Cd(custom, US), twElev|null, US}
function roadFlow(EL,road){
  const US=road.US,f=US?1:3.28084,Lr=road.Lr*f; let Q=0,wet=0,hmax=0,crMin=Infinity,crMax=0,ktMin=1;
  const P=road.segs;
  for(let i=1;i<P.length;i++){const [s1,z1]=P[i-1],[s2,z2]=P[i],n=40,dx=(s2-s1)/n;
    for(let k=0;k<n;k++){const z=z1+(z2-z1)*(k+0.5)/n,h=EL-z;if(h<=0)continue;
      let Cr,kt=1;
      if(road.surface==='custom')Cr=road.Cd; else{Cr=weirCoef(h*f,Lr,road.surface);
        if(road.twElev!=null&&road.twElev>z)kt=ktFactor((road.twElev-z)/h,road.surface);}
      const Cd=kt*Cr*(US?1:0.552);Q+=Cd*Math.abs(dx)*Math.pow(h,1.5);wet+=Math.abs(dx);hmax=Math.max(hmax,h);
      crMin=Math.min(crMin,Cr);crMax=Math.max(crMax,Cr);ktMin=Math.min(ktMin,kt);}}
  return {Q,wet,hmax,crMin,crMax,ktMin};
}
function crestMin(road){return Math.min(...road.segs.map(p=>p[1]));}
// Balance: find culvert flow Qc so that Qc + Qroad(HW(Qc)) = Qt. elOf(Qc) returns culvert HW elevation.
function balance(Qt,elOf,road){
  const zc=crestMin(road),EL0=elOf(Qt);
  if(EL0<=zc) return {Qc:Qt,Qr:0,EL:EL0,iter:1,over:false,road:roadFlow(EL0,road)};
  let a=0,b=Qt,it=0,Qc,EL,rf;
  for(;it<100;it++){Qc=(a+b)/2;EL=elOf(Qc);rf=roadFlow(EL,road);const err=Qc+rf.Q-Qt;
    if(Math.abs(err)<=1e-4*Qt)break; if(err>0)b=Qc;else a=Qc;}
  return {Qc,Qr:rf.Q,EL,iter:it+1,over:true,road:rf};
}
root.Culvert={momentum,conj,findJump,traceSub,traceSuper,INLETS,MANNING,analyze,geom,critical,normal,roadFlow,balance,crestMin,weirCoef,ktFactor,CR_DEEP,CR_SHALLOW,KT};

})(typeof module!=='undefined'?module.exports:window);
