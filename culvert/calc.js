// Culvert hydraulics per FHWA HDS-5 (3rd ed., 2012). Shared by browser and node.
(function(root){
const INLETS = {
 circular:[
  {id:'c_sq_hw',name:'Concrete pipe, square edge w/ headwall',chart:'Chart 1, scale 1',form:1,K:0.0098,M:2.0,c:0.0398,Y:0.67,Ks:-0.5,Ke:0.5},
  {id:'c_gr_hw',name:'Concrete pipe, groove end w/ headwall',chart:'Chart 1, scale 2',form:1,K:0.0018,M:2.0,c:0.0292,Y:0.74,Ks:-0.5,Ke:0.2},
  {id:'c_gr_pr',name:'Concrete pipe, groove end projecting',chart:'Chart 1, scale 3',form:1,K:0.0045,M:2.0,c:0.0317,Y:0.69,Ks:-0.5,Ke:0.2},
  {id:'m_hw',name:'CMP, headwall',chart:'Chart 2, scale 1',form:1,K:0.0078,M:2.0,c:0.0379,Y:0.69,Ks:-0.5,Ke:0.5},
  {id:'m_mit',name:'CMP, mitered to slope',chart:'Chart 2, scale 2',form:1,K:0.0210,M:1.33,c:0.0463,Y:0.75,Ks:0.7,Ke:0.7},
  {id:'m_pr',name:'CMP, projecting',chart:'Chart 2, scale 3',form:1,K:0.0340,M:1.50,c:0.0553,Y:0.54,Ks:-0.5,Ke:0.9},
  // HDS-5 Appendix A Table A.1 Chart 3. Ke from Table C.2 (beveled edges, 33.7° or 45°).
  {id:'c_bv45',name:'Circular pipe, beveled ring, 45° bevels',chart:'Chart 3, scale A',form:1,K:0.0018,M:2.50,c:0.0300,Y:0.74,Ks:-0.5,Ke:0.2},
  {id:'c_bv34',name:'Circular pipe, beveled ring, 33.7° bevels',chart:'Chart 3, scale B',form:1,K:0.0018,M:2.50,c:0.0243,Y:0.83,Ks:-0.5,Ke:0.2}],
 box:[
  {id:'b_30',name:'Box, 30°–75° wingwall flares, square edge',chart:'Chart 8, scale 1',form:1,K:0.026,M:1.0,c:0.0347,Y:0.81,Ks:-0.5,Ke:0.4},
  {id:'b_90',name:'Box, 90° headwall / 15° wingwalls, square edge',chart:'Chart 8, scale 2',form:1,K:0.061,M:0.75,c:0.0400,Y:0.80,Ks:-0.5,Ke:0.5},
  {id:'b_0',name:'Box, 0° wingwalls (sides extended), square edge',chart:'Chart 8, scale 3',form:1,K:0.061,M:0.75,c:0.0423,Y:0.82,Ks:-0.5,Ke:0.5}]
};
const MANNING = {concrete:0.012, cmp:0.024, hdpe:0.012};
// ---- Generic cross-sections (HY-8 shapes): polygon -> depth tables ----
// sec = {poly:[[x,y],...] closed, bed:[edge indices with bed roughness], nWall, nBed}; y measured up from invert.
function clipBelow(P,z){const o=[];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],ia=a[1]<=z,ib=b[1]<=z;
  if(ia)o.push(a); if(ia!==ib){const t=(z-a[1])/(b[1]-a[1]);o.push([a[0]+t*(b[0]-a[0]),z]);}}return o;}
function makeSection(poly,opt){opt=opt||{};
  let P=poly.filter((p,i)=>i===0||p[0]!==poly[i-1][0]||p[1]!==poly[i-1][1]);
  if(P.length>2&&P[0][0]===P[P.length-1][0]&&P[0][1]===P[P.length-1][1])P.pop();
  const y0=Math.min(...P.map(p=>p[1]));P=P.map(p=>[p[0],p[1]-y0]);
  const D=Math.max(...P.map(p=>p[1])),xs=P.map(p=>p[0]),B=Math.max(...xs)-Math.min(...xs);
  const bed=opt.bed||(()=>false),nW=opt.nWall,nB=opt.nBed??opt.nWall,NL=400,tab=[];
  for(let k=0;k<=NL;k++){const z=D*k/NL,C=clipBelow(P,z);let A=0,Sy=0;
    for(let i=0;i<C.length;i++){const a=C[i],b=C[(i+1)%C.length],cr=a[0]*b[1]-b[0]*a[1];A+=cr;Sy+=cr*(a[1]+b[1]);}
    A=Math.abs(A)/2;Sy=Math.abs(Sy)/6;
    let T=0;const xi=[];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];if((a[1]<=z)!==(b[1]<=z))xi.push(a[0]+(z-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
    xi.sort((p,q)=>p-q);for(let i=0;i+1<xi.length;i+=2)T+=xi[i+1]-xi[i];
    let Pw=0,Pb=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const lo=Math.min(a[1],b[1]),hi=Math.max(a[1],b[1]);let f;
      if(hi-lo<1e-12)f=lo<z||(lo===0&&z>0)?1:0; else f=Math.max(0,Math.min(1,(z-lo)/(hi-lo)));
      if(bed(i,a,b))Pb+=f*L; else Pw+=f*L;}
    tab.push([z,A,T,Pw,Pb,Sy]);}
  let Pfull=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];Pfull+=Math.hypot(b[0]-a[0],b[1]-a[1]);}
  return {sec:true,poly:P,D,B,tab,nWall:nW,nBed:nB,Pfull,Afull:tab[NL][1]};}
function secAt(s,y){const N=s.tab.length-1,f=Math.max(0,Math.min(N,y/s.D*N)),i=Math.min(N-1,Math.floor(f)),t=f-i,a=s.tab[i],b=s.tab[i+1],r=[];for(let k=0;k<6;k++)r.push(a[k]+(b[k]-a[k])*t);return r;}
function secN(s,y,n){if(!s||!s.sec||s.nBed==null||s.nBed===s.nWall)return n; // Horton/Einstein composite n
  const r=secAt(s,y),Pw=r[3],Pb=r[4],P=Pw+Pb; if(P<=0)return n; const nw=n; return Math.pow((Pw*Math.pow(nw,1.5)+Pb*Math.pow(s.nBed,1.5))/P,2/3);}
function geom(shape,B,D,y){ // area, top width, wetted perimeter for depth y
  y=Math.max(1e-9,Math.min(y,D));
  if(shape&&shape.sec){const r=secAt(shape,y);return {A:Math.max(r[1],1e-12),T:shape.flatTop?Math.max(secAt(shape,Math.min(y,shape.D*0.99999))[2],1e-9):(y>=shape.D?1e-9:Math.max(r[2],1e-9)),P:r[3]+r[4],Sy:r[5]};}
  if(shape==='box') return {A:B*y,T:B,P:B+2*y};
  const r=D/2, th=2*Math.acos(1-2*y/D);
  return {A:r*r*(th-Math.sin(th))/2, T:D*Math.sin(th/2)||1e-9, P:r*th};
}
function bisect(f,a,b){let fa=f(a);for(let i=0;i<200;i++){const m=(a+b)/2,fm=f(m);if((fm>0)===(fa>0)){a=m;fa=fm}else b=m}return (a+b)/2}
function critical(shape,B,D,Q,g){
  const f=y=>{const G=geom(shape,B,D,y);return Q*Q/g - G.A**3/G.T};
  const top = shape==='box'||(shape&&shape.sec&&shape.flatTop)?D:0.999*D;
  if(f(top)>0) return top; return bisect(f,1e-6*D,top);
}
function normal(shape,B,D,Q,n,S,k){
  if(S<=0) return Infinity;
  const q=y=>{const G=geom(shape,B,D,y);return k/secN(shape,y,n)*G.A*Math.pow(G.A/G.P,2/3)*Math.sqrt(S)};
  let top = shape==='box'?D:0.938*D; // max capacity for circle occurs ~0.938D
  if(shape&&shape.sec){let best=0;for(let i=1;i<=200;i++){const y=D*i/200,v=q(i===200?D*0.99999:y);if(v>=best){best=v;top=y;}}}
  if(q(top)<Q) return Infinity; // flows full
  return bisect(y=>q(y)-Q,1e-6*D,top);
}

function sfr(shape,B,D,Q,n,kM,y){const G=geom(shape,B,D,y),V=Q/G.A;n=secN(shape,y,n);return Math.pow(n*V/kM,2)/Math.pow(G.A/G.P,4/3);}
function spE(shape,B,D,Q,g,y){const V=Q/geom(shape,B,D,y).A;return y+V*V/2/g;}
// Momentum function M = Q²/(gA) + A·ȳ (ȳ = centroid depth below water surface). Exact for box and circular segment.
// head > D means pressurised section with piezometric head 'head' above invert (centroid of full section at D/2).
function momentum(shape,B,D,Q,g,y,head){
  if(shape&&shape.sec){const yc0=shape.tab[shape.tab.length-1];const Af=yc0[1],zf=yc0[5]/Af;
    if(head!=null&&head>=D-1e-9)return Q*Q/g/Af+Af*(head-zf);
    y=Math.max(1e-9,Math.min(y,D));const G=geom(shape,B,D,y);return Q*Q/g/G.A+(G.A*y-G.Sy);}
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
  const A=geom(shape,B,D,D).A,zf=shape&&shape.sec?shape.tab[shape.tab.length-1][5]/A:D/2; return {y:D,head:(m1-Q*Q/g/A)/A+zf};
}
function interpPts(pts,x,k){k=k||1;for(let i=1;i<pts.length;i++)if(x<=pts[i][0]){const a=pts[i-1],b=pts[i],t=(x-a[0])/((b[0]-a[0])||1);return a[k]+(b[k]-a[k])*t;}return pts[pts.length-1][k];}
// Locate hydraulic jump between supercritical profile sup (from inlet) and subcritical profile sub (from outlet).
// Locate hydraulic jump the way HY-8 does (HY-8 8.0 User Manual §5.2.7.1): compare the sequent depth of the
// supercritical (S2) profile with the subcritical profile traced from the outlet. Behaviour calibrated against
// HY-8 8.0.1.2 runs (see test.js): scanning upstream from the outlet over the free-surface part of the
// subcritical profile, the jump sits at the first point where the sequent depth reaches the subcritical depth
// (momentum M(y_super) >= M(y_sub)); if that happens right where the subcritical profile leaves a pressurised
// reach, the jump sits at that crown point. If the barrel is pressurised all the way to the inlet, the jump
// sits where the S2 sequent depth first reaches the crown, M(y_super) = M(D).
function findJump(shape,B,D,Q,g,L,sup,sub){
  const Ms=x=>momentum(shape,B,D,Q,g,interpPts(sup,x)), Mo=y=>momentum(shape,B,D,Q,g,Math.min(D,y));
  const pts=sub.slice().sort((p,q)=>q[0]-p[0]); // outlet -> inlet
  const isFull=p=>p[1]>=D-1e-9, out=(x,t)=>({type:t||(x<=1e-6?'drowned':'inside'),x,y1:interpPts(sup,x),y2:Math.min(D,interpPts(sub,x)),head2:interpPts(sub,x,2)});
  let prev=null,anyFree=false;
  for(const p of pts){const x=p[0];
    if(isFull(p)){prev=p;continue;}
    if(p[3]){ if(anyFree) return out(x); break; } // free reach ends in a choke: jump at its upstream end
    anyFree=true;
    if(Ms(x)>=Mo(p[1])){
      if(!prev) return {type:'swept'};                     // already satisfied at the outlet
      if(isFull(prev)) return out(x);                      // crown point
      const F=z=>Ms(z)-Mo(interpPts(sub,z)); return out(bisect(F,x,prev[0]));
    }
    prev=p;}
  if(!anyFree){ // pressurised to the inlet
    const F=x=>Ms(x)-Mo(D); if(F(0)>=0) return out(0,'drowned'); if(F(L)<0) return {type:'drowned'};
    return out(bisect(F,0,L)); }
  return {type:'drowned'};
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
  const N=200,dx=L/N,yc=critical(shape,B,D,Q,g),Af=geom(shape,B,D,D).A,Vf=Q/Af,nF=secN(shape,D,n),Sff=Math.pow(nF*Vf/kM,2)/Math.pow(Rf,4/3);
  let choked=false,y=Math.min(yd,D),pts=[[L,y,Math.max(yd,y)]],full=y>=D-1e-9,HGL=full?yd:null,fullAt=full?L:null; // HGL head above local invert
  for(let i=1;i<=N;i++){const x=L-i*dx;
    if(full){HGL=HGL+Sff*dx-S*dx; // pressure flow: HGL rises by friction, invert rises by S
      if(HGL<D){full=false;y=D;} else {pts.push([x,D,HGL]);continue;}}
    const E1=spE(shape,B,D,Q,g,y),S1=sfr(shape,B,D,Q,n,kM,y);
    const f=z=>spE(shape,B,D,Q,g,z)+S*dx-E1-(S1+sfr(shape,B,D,Q,n,kM,z))/2*dx; // E_up + z_up = E_dn + z_dn + hf
    let z;
    if(f(D)<0){full=true;fullAt=x;HGL=D+(-f(D));pts.push([x,D,HGL]);continue;} // profile hits crown -> pressure flow
    if(f(yc*1.0001)>0){z=yc;choked=true;y=z;pts.push([x,y,y,1]);continue;} else z=bisect(f,yc*1.0001,D); // choke -> critical
    y=z;pts.push([x,y,y]);}
  pts.reverse();

  return {pts,choked,yIn:full?D:y,headIn:full?HGL:null,fullAt};
}
// HY-8 8.0 inlet control (User Manual §5.2.1): HW/D = A + B·X + C·X² + D·X³ + E·X⁴ + F·X⁵ (polynomial), or linear
// interpolation in a table of HW/D at X = 0.5,1,2,...,9 (HDS-5 Chart 52B style), X = Q/(A·D^0.5) in US units; minus SR·S.
const IX=[0.5,1,2,3,4,5,6,7,8,9];
function hy8Ratio(inl,X){const c=inl.c;
  if(inl.t==='poly')return c[0]+c[1]*X+c[2]*X*X+c[3]*X**3+c[4]*X**4+c[5]*X**5;
  if(X<=IX[0])return c[0]*X/IX[0];
  for(let i=1;i<IX.length;i++)if(X<=IX[i])return c[i-1]+(c[i]-c[i-1])*(X-IX[i-1])/(IX[i]-IX[i-1]);
  const k=IX.length-1;return c[k]+(c[k]-c[k-1])*(X-IX[k]);}
// HY-8 ShapeDB geometry: rows [x, yTop, yBottom] (ft). open=true -> bottom edges at the invert use the bed n.
function sectionFromHY8(g,o){o=o||{};const sc=o.scale||1;let r=g.slice();while(r.length>2&&r[r.length-1][0]===0&&r[r.length-1][1]===0&&r[r.length-1][2]===0)r.pop();
  let bot=r.map(q=>[q[0]*sc,q[2]*sc]),top=r.map(q=>[q[0]*sc,q[1]*sc]).reverse();
  if(o.rise){const y0=Math.min(...bot.map(p=>p[1])),cap=y0+o.rise; top=top.map(p=>[p[0],Math.min(p[1],cap)]);} // HY-8 clips the shape at the nominal rise
  const poly=bot.concat(top),nb=bot.length;
  const ymin=Math.min(...poly.map(p=>p[1]));
  const s=makeSection(poly,{nWall:o.nWall,nBed:o.open?o.nBed:o.nWall,bed:o.open?((i,a,b)=>i<nb-1&&Math.abs(a[1])<1e-6&&Math.abs(b[1])<1e-6):null});
  s.open=!!o.open; if(o.rise&&s.poly.filter(p=>Math.abs(p[1]-s.D)<1e-9).length>1)s.flatTop=true; return s;}
function rectSection(B,D,n){const s=makeSection([[0,0],[B,0],[B,D],[0,D]],{nWall:n});s.flatTop=true;return s;}
function polySection(pts,o){o=o||{};const s=makeSection(pts,{nWall:o.nWall,nBed:o.nBed,bed:o.nBed!=null?((i,a,b)=>Math.abs(a[1])<1e-9&&Math.abs(b[1])<1e-9):null});return s;}
// HDS-5 (3rd ed.) Sec. 3.4 tapered inlets: throat and face control, Appendix A Form 2 equations (Eq. A.2/A.3) with
// Table A.1 constants (rectangular concrete: tapered inlet throat; side-/slope-tapered faces). Ke = 0.2 (Sec. 3.4.5).
const TAPER_K={throat:{K:0.475,M:0.667,c:0.0179,Y:0.97},side_less:{K:0.56,M:0.667,c:0.0446,Y:0.85},side_more:{K:0.56,M:0.667,c:0.0378,Y:0.87},slope_less:{K:0.50,M:0.667,c:0.0446,Y:0.65},slope_more:{K:0.50,M:0.667,c:0.0378,Y:0.71}};
function form2(k,Q,A,D,S,Ku){const x=Ku*Q/(A*Math.sqrt(D)),u=z=>k.K*Math.pow(z,k.M),sb=z=>k.c*z*z+k.Y;
  const r=x<=3.5?u(x):x>=4?sb(x):u(3.5)+(sb(4)-u(3.5))*(x-3.5)/0.5;return {x,r:r-0.5*S,reg:x<=3.5?'unsubmerged':x>=4?'submerged':'transition'};}
// HDS-5 Appendix A Table A.1, Charts 55 and 56: circular (and circular-throat) tapered inlets.
// Chart 55 throat — smooth (concrete) and rough (CMP). Chart 56 elliptical / non-rectangular face.
const CIRC_TH={smooth:{K:0.534,M:0.555,c:0.0196,Y:0.90},rough:{K:0.519,M:0.64,c:0.0210,Y:0.90}};
const CIRC_FACE={bevel:{K:0.536,M:0.622,c:0.0368,Y:0.83},square:{K:0.5035,M:0.719,c:0.0478,Y:0.80},thin:{K:0.547,M:0.80,c:0.0598,Y:0.75}};
function pipeTaper(t,Q,S,Ku,D){
  const type=t.type==='slope'?'slope':'side', rough=t.rough===true||t.throat==='rough';
  const edge=t.edge==='thin'?'thin':(t.edge==='less'||t.edge==='square')?'square':'bevel';
  const taper=t.taper||4, Bf=Math.max(+t.Bf||D,D), E=+t.E>0?+t.E:D, At=Math.PI*D*D/4;
  const thC=form2(CIRC_TH[rough?'rough':'smooth'],Q,At,D,S,Ku);
  const limits=[];
  if(taper<4||taper>6)limits.push('HDS-5 DG 3.3: side taper should be between 4:1 and 6:1.');
  let L1,L2=0,L3=0,faceRise,faceK,Af,th=thC,faceChart;
  if(type==='slope'){
    const St=+t.St||2, T=Math.max(0,+t.T||0), L1s=(Bf-D)/2*taper;
    L2=T*St; L3=Math.max(0.5*D,L1s-L2); L1=L2+L3; faceRise=T+L3*S;
    const sq=form2(TAPER_K.throat,Q,D*D,D,S,Ku); // square throat of side D; HDS-5 DG 3.5.2: the circular throat is smaller and usually governs
    th=sq.r>thC.r?sq:thC;
    faceK=TAPER_K['slope_'+(edge==='bevel'?'more':'less')]; Af=Bf*E; faceChart='Chart 59 rectangular face (only slope-tapered face chart; square-to-round transition)';
    if(!(T>D/4&&T<1.5*D))limits.push('HDS-5 DG 3.3.2: slope-tapered throat depression T should be between D/4 and 1.5D.');
  }else{
    L1=(Bf-D)/2*taper; faceRise=L1*S; faceK=CIRC_FACE[edge]; Af=t.Af>0?t.Af:Math.PI/4*Bf*E; faceChart='Chart 56 non-rectangular face';
    if(E<D-1e-9||E>1.1*D+1e-9)limits.push('HDS-5 DG 3.3.1: side-tapered circular face height E should be between D and 1.1D.');
  }
  const fc=form2(faceK,Q,Af,E,S,Ku), HWt=th.r*D, HWf=fc.r*E, HWfT=HWf+faceRise;
  return {pipe:true,type,edge,rough,Bf,E,Af,taper,L1,L2,L3,faceRise,HWt,HWf,HWfT,xt:th.x,xf:fc.x,HW:Math.max(HWt,HWfT),ctrl:HWfT>HWt+1e-9?'face':'throat',limits,chart:'HDS-5 Chart 55 throat + '+faceChart};
}
function taperIC(t,Q,S,Ku,B,D){if(t&&t.pipe)return pipeTaper(t,Q,S,Ku,D);
  const type=t.type==='slope'?'slope':'side',edge=t.edge==='more'?'more':'less';
  const taper=t.taper||4,Bf=Math.max(t.Bf||B,B),E=D,L1s=(Bf-B)/2*taper;
  let L1,L2=0,L3=0,faceRise;
  if(type==='slope'){const St=t.St||2,T=Math.max(0,t.T||0);L2=T*St;L3=Math.max(0.5*B,L1s-L2);L1=L2+L3;faceRise=T+L3*S;}
  else{L1=L1s;faceRise=L1*S;}
  const th=form2(TAPER_K.throat,Q,B*D,D,S,Ku),fc=form2(TAPER_K[type+'_'+edge],Q,Bf*E,E,S,Ku);
  const HWt=th.r*D,HWf=fc.r*E,HWfT=HWf+faceRise;
  return {type,edge,Bf,E,taper,L1,L2,L3,faceRise,HWt,HWf,HWfT,xt:th.x,xf:fc.x,HW:Math.max(HWt,HWfT),ctrl:HWfT>HWt?'face':'throat'};}
// Extra inlet types from the HY-8 8.0 shape database (polynomial curves) for the built-in circular and box shapes.
function extendInlets(db){if(!db||!db.circular||extendInlets.done)return;extendInlets.done=true;
  const add=(key,mat,names,pre)=>{const m=db[key]&&db[key].mats.find(x=>x.name===mat);if(!m)return;
    m.inlets.forEach((i,k)=>{if(!names.includes(i.name)||i.t!=='poly')return;INLETS[key==='circular'?'circular':'box'].push(Object.assign({id:pre+k,name:i.name+' (HY-8 database)',chart:'HY-8 8.0 polynomial',Ke:i.KE},i));});};
  add('circular','Concrete',['Beveled Edge (1:1)','Beveled Edge (1.5:1)','Mitered to Conform to Slope'],'hyc_');
  add('box','Concrete',['Square Edge (90°) Headwall','1.5:1 Bevel (90°) Headwall','1:1 Bevel Headwall','1.5:1 Bevel (18-34° flare) Wingwall','1:1 Bevel (45° flare) Wingwall'],'hyb_');}
// Inlet-control headwater for one discharge. Hc is recomputed at Qin so a skew adjustment (Q/factor) stays consistent with Form 1.
function inletControl(p,shape,B,D,A,Di,Bi,Qin,S,Ku,g){
  const dc=critical(shape,B,D,Qin,g), Gc=geom(shape,B,D,dc), Vc=Qin/Gc.A, Hc=dc+Vc*Vc/2/g;
  const inl=p.inlet, X=Ku*Qin/(A*Math.sqrt(Di)), Xb=Ku*Qin/(Bi*Math.pow(Di,1.5));
  const hy8=inl.t==='poly'||inl.t==='interp';
  const unsub=x=> inl.form===1 ? Hc/D + inl.K*Math.pow(x,inl.M) + inl.Ks*S : inl.K*Math.pow(x,inl.M);
  const sub=x=> inl.c*x*x + inl.Y + inl.Ks*S;
  let ratio, regime;
  if(hy8)regime=inl.t==='poly'?'HY-8 polynomial':'HY-8 interpolation table';
  if(hy8){const Xh=inl.t==='interp'||inl.xA?X:Xb; ratio=hy8Ratio(inl,Xh)-inl.SR*S;
    if(ratio<0.5){
      let a=0;while(a<10&&hy8Ratio(inl,a+0.01)-inl.SR*S<0.5)a+=0.01;let b=a+0.01;for(let k=0;k<40;k++){const m=(a+b)/2;(hy8Ratio(inl,m)-inl.SR*S<0.5)?a=m:b=m;}
      const Qs=a*(inl.t==='interp'||inl.xA?A*Math.sqrt(Di):Bi*Math.pow(Di,1.5))/Ku,ys=critical(shape,B,D,Qs,g),As=geom(shape,B,D,ys).A,Hs=ys+Qs*Qs/As/As/2/g;
      ratio=Hc/Hs*0.5; regime+=' (low-flow: scaled critical energy)';}}
  else if(X<=3.5){ratio=unsub(X);regime='unsubmerged';}
  else if(X>=4.0){ratio=sub(X);regime='submerged';}
  else {const u=unsub(3.5), s=sub(4.0);ratio=u+(s-u)*(X-3.5)/0.5;regime='transition';}
  let HWi=ratio*Di, taper=null;
  if(p.taper&&(shape==='box'||shape==='circular')){
    const tp=shape==='circular'?Object.assign({pipe:true},p.taper):p.taper;
    taper=taperIC(tp,Qin,S,Ku,shape==='circular'?D:B,D);HWi=taper.HW;ratio=HWi/(shape==='circular'?D:D);regime='tapered inlet, '+taper.ctrl+' control';}
  return {X,ratio,regime,HWi,taper};
}
function analyze(p){
  const US=p.units!=='SI', g=US?32.174:9.81, Ku=US?1.0:1.811, kM=US?1.486:1.0, kf=US?29:19.63;
  const SEC=p.section&&p.section.sec?p.section:null; if(SEC)p=Object.assign({},p,{shape:SEC});
  const D=SEC?SEC.D:p.rise, B=SEC?SEC.B:(p.shape==='box'?p.span:p.rise), N=p.barrels||1;
  // HEC-9 screening: a blockage fraction closes that share of the opening. The same barrel is analyzed at Q/(1−blockage). 0 leaves every result unchanged.
  const blk=Math.max(0, Math.min(0.85, +p.blockage||0)), Qact=p.Q/N, Q=blk>0?Qact/(1-blk):Qact;
  const S=(p.invIn-p.invOut)/p.length; let inl=p.inlet;
  const full=geom(p.shape,B,D,D), A=SEC?SEC.Afull:full.A, Pf=SEC?SEC.Pfull:(p.shape==='box'?2*(B+D):Math.PI*D), R=A/Pf; // full barrel: wetted perimeter includes the crown
  const nFull=SEC?secN(SEC,D,p.n):p.n;
  const dc=critical(p.shape,B,D,Q,g), Gc=geom(p.shape,B,D,dc), Vc=Q/Gc.A, Hc=dc+Vc*Vc/2/g;
  const yn=normal(p.shape,B,D,Q,p.n,S,kM);
  const Di=SEC&&p.riseNom?p.riseNom:D, Bi=SEC&&p.spanNom?p.spanNom:B; // HY-8 uses the nominal span/rise for inlet control
  let ic=inletControl(p,p.shape,B,D,A,Di,Bi,Q,S,Ku,g), skew=null;
  // HDS-5 §5.4.2 / Table 5.2a: inlet skew trims inlet-control capacity. Applied only when the user asks; the table is a 6×6 box, Chart 11 screening ratio, not a general coefficient.
  if(p.skewApply&&+p.skewDeg>0){skew=skewRatio(ic.ratio,+p.skewDeg); if(skew.factor>0&&skew.factor<0.999)ic=inletControl(p,p.shape,B,D,A,Di,Bi,Q/skew.factor,S,Ku,g);}
  const X=ic.X, ratio=ic.ratio, regime=ic.regime, HWi=ic.HWi, taper=ic.taper;
  const TW = p.twMode==='const' ? Math.max(0,p.twElev-p.invOut) : 0;
  const V=Q/A, hv=V*V/2/g;
  const Hf=kf*nFull*nFull*p.length/Math.pow(R,4/3)*hv;
  const Ke=taper?0.2:(inl.Ke??inl.KE); inl=Object.assign({},inl,{Ke});
  // HDS-5 Eq. 3.1 and §5.2.3: bend loss Hb = Kb·V²/2g (Table 5.1, full-flow conduits) and a user-supplied junction coefficient.
  // HDS-5 §5.2.4 does not publish a numeric Kj; it points at HEC-22. Kj is therefore only what the user enters.
  const bend=bendKb(p.bendRD, p.bendDeg), Kj=isFinite(+p.Kj)?+p.Kj:0;
  const Hb=bend.k*hv, Hj=Kj*hv;
  const He=inl.Ke*hv, Ho=hv, H=He+Hf+Ho+Hb+Hj;
  // HDS-5 full-flow energy method (used when barrel flows full or no subcritical profile can form)
  const hoHDS=Math.max(TW,(dc+D)/2), ELhoHDS=p.invOut+hoHDS+H, HWoHDS=ELhoHDS-p.invIn;
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
    const ELp=p.invIn+(tr.headIn!=null?tr.headIn:yi)+(1+inl.Ke+bend.k+Kj)*Vi*Vi/2/g;
    ELho=ELp; ho=yd;}
  } else ocMethod='steep-full'; // steep, low TW: no subcritical profile possible -> HDS-5 / HY-8 full-flow method
  const HWo=ELho-p.invIn;
  const ELhi=p.invIn+HWi;
  let control=HWi>=HWo?'Inlet':'Outlet';
  // HY-8: steep barrel, free outlet (TW < dc) and normal depth below the crown -> partly full S2 flow; full-flow outlet control does not govern
  if(control==='Outlet'&&ocMethod==='steep-full'&&steep&&TW<dc&&yn<D*0.999)control='Inlet';
  const HW=control==='Inlet'?HWi:Math.max(HWi,HWo);
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
  const hgl=buildHGL(p.shape,B,D,Q,g,p.length,S,profile,ocProf,control==='Outlet'||jumpType==='drowned');
  return {taper,jump,jumpType,US,g,D,B,N,Q:Qact,Qhyd:Q,blockage:blk,S,A,R,dc,Vc,Hc,yn,X,regime,ratio,HWi,ELhi,TW,ho,V,hv,Hf,He,Ho,Hb,Hj,H,ELho,HWo,HWoHDS,control,HW,EL:p.invIn+HW,yout,Vout,inlet:inl,steep,ocMethod,outMethod,profile,hgl,yinO,hoHDS,ELhoHDS,skew,bend};
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
// ---- Downstream channel tailwater (HY-8 8.0 "Channel Type" options): Manning normal depth in the outlet channel ----
// ch = {type:'rect'|'trap'|'tri'|'irreg', b, z1, z2, S, n, inv, pts:[[x,el],...]} ; returns {y, el, A, V, T, Fr, tau}
function chGeom(ch,y){const t=ch.type;
  if(t==='irreg'){const P=ch.pts,el=ch.inv+y;let A=0,Pw=0,T=0;
    for(let i=1;i<P.length;i++){const [x1,z1]=P[i-1],[x2,z2]=P[i];const d1=el-z1,d2=el-z2;if(d1<=0&&d2<=0)continue;
      let xa=x1,xb=x2,da=d1,db=d2;if(d1<0){xa=x1+(x2-x1)*(-d1)/(d2-d1);da=0;}if(d2<0){xb=x1+(x2-x1)*d1/(d1-d2);db=0;}
      const w=xb-xa;A+=w*(da+db)/2;T+=w;Pw+=Math.hypot(w,db-da);}
    return {A,P:Pw,T};}
  const b=t==='tri'?0:ch.b,z1=t==='rect'?0:ch.z1,z2=t==='rect'?0:(ch.z2??ch.z1);
  return {A:y*(b+(z1+z2)*y/2),P:b+y*(Math.hypot(1,z1)+Math.hypot(1,z2)),T:b+(z1+z2)*y};}
function channelTW(ch,Q,US){const kM=US?1.486:1,g=US?32.174:9.81,gw=US?62.4:9810;
  if(ch.type==='irreg'){ch=Object.assign({},ch);ch.inv=Math.min(...ch.pts.map(p=>p[1]));}
  const q=y=>{const G=chGeom(ch,y);return G.A>0?kM/ch.n*G.A*Math.pow(G.A/G.P,2/3)*Math.sqrt(ch.S):0;};
  let hi=1;while(q(hi)<Q&&hi<1e4)hi*=2;const y=bisect(z=>q(z)-Q,1e-9,hi),G=chGeom(ch,y),V=Q/G.A;
  return {y,el:ch.inv+y,A:G.A,V,T:G.T,Fr:V/Math.sqrt(g*G.A/G.T),tau:gw*(G.A/G.P)*ch.S,inv:ch.inv};}
function ratingTW(tab,Q){const t=tab.slice().sort((a,b)=>a[0]-b[0]);return {el:interp(t,Q)};}
// FHWA HEC-14 (2006) Sec. 10.2: riprap apron, Eq. 10.4 (Fletcher & Grace), Eq. 10.5, Table 10.1 (FLHD example classes).
const RIPRAP_T101=[[1,125,5,4,3.5],[2,150,6,4,3.3],[3,250,10,5,2.4],[4,350,14,6,2.2],[5,500,20,7,2.0],[6,550,22,8,2.0]];
function riprapApron(o){const US=o.US!==false,g=US?32.2:9.81,D=o.D,SG=o.SG||2.65;
  const Dp=o.supercritical&&o.yn>0?(D+o.yn)/2:D;let TW=o.TW,twNote='';
  if(!(TW>0)){TW=0.4*D;twNote='unknown';}else if(TW<0.4*D){TW=0.4*D;twNote='raised';}else if(TW>D){twNote='high';TW=D;}
  const D50=0.2*Dp*Math.pow(o.Q/(Math.sqrt(g)*Math.pow(Dp,2.5)),4/3)*(Dp/TW)*(2.65/SG);
  const d50u=US?D50*12:D50*1000,row=RIPRAP_T101.find(r=>(US?r[2]:r[1])>=d50u-1e-9);
  const out={D,Dp,TW,twNote,D50,d50u,SG};if(!row){out.over=true;return out;}
  const cd=US?row[2]/12:row[1]/1000,L=row[3]*D;Object.assign(out,{cls:row[0],D50c:cd,L,depth:row[4]*cd,W:3*D+2/3*L,kL:row[3],kd:row[4]});return out;}
// HEC-14 Table 1.1 (Froude number at the release point; TW requirement).
const DISSIPATORS=[[4,'Flow transitions',null,null,'Desirable'],[5,'Scour hole',null,null,'Desirable'],[6,'Hydraulic jump',1,null,'Required'],[7,'Tumbling flow (4% < So < 25%)',1,null,'Not needed'],[7,'Increased resistance',null,null,'Not needed'],[7,'USBR Type IX baffled apron',null,1,'Not needed'],[7,'Broken-back culvert',1,null,'Desirable'],[7,'Outlet weir',2,7,'Not needed'],[7,'Outlet drop/weir',3.5,6,'Not needed'],[8,'USBR Type III stilling basin',4.5,17,'Required'],[8,'USBR Type IV stilling basin',2.5,4.5,'Required'],[8,'SAF stilling basin',1.7,17,'Required'],[9,'CSU rigid boundary basin',null,3,'Not needed'],[9,'Contra Costa basin',null,3,'< 0.5D'],[9,'Hook basin',1.8,3,'Not needed'],[9,'USBR Type VI impact basin (Q < 400 cfs, V < 50 ft/s)',null,null,'Desirable'],[10,'Riprap basin',null,3,'Not needed'],[10,'Riprap apron (rise <= 60 in)',null,null,'Not needed'],[11,'Straight drop structure (drop < 15 ft)',null,1,'Required'],[11,'Box inlet drop structure (drop < 12 ft)',null,1,'Required'],[12,'USACE stilling well',null,null,'Desirable']];
function dissipatorsFor(Fr){return DISSIPATORS.map(([ch,name,lo,hi,tw])=>({ch,name,lo,hi,tw,range:lo==null&&hi==null?'na':lo!=null&&hi!=null?lo+' to '+hi:lo!=null?'> '+lo:'< '+hi,ok:(lo==null||Fr>lo)&&(hi==null||Fr<hi)}));}
// Piezometric depth and energy depth above the local invert, for the profile drawing. Pressure head from the outlet-control trace is used only when that trace is the governing water surface.
function buildHGL(shape,B,D,Q,g,L,S,profile,ocProf,usePress){
  const pts=profile||[];
  return pts.map(q=>{
    const y=Math.max(1e-8,Math.min(q[1],D));
    const G=geom(shape,B,D,y), V=Q/Math.max(G.A,1e-12);
    let piez=y;
    if(usePress&&ocProf){const h=interpPts(ocProf,q[0],2); if(isFinite(h)&&h>piez)piez=h;}
    return [q[0], piez, piez+V*V/2/g];
  });
}
// HDS-5 Table 5.1 (Linsley & Franzini), bend loss coefficients for conduits flowing full. Exact nodes are published; in-between angles are linear and flagged.
const BEND_KB=[[1,90,0.50],[1,45,0.37],[1,22.5,0.25],[2,90,0.30],[2,45,0.22],[2,22.5,0.15],[4,90,0.25],[4,45,0.19],[4,22.5,0.12],[6,90,0.15],[6,45,0.11],[6,22.5,0.08],[8,90,0.15],[8,45,0.11],[8,22.5,0.08]];
function bendKb(rOverD, deg){
  const d=+deg, rd=+rOverD;
  if(!(d>0)) return {k:0, interpolated:false, note:''};
  const rds=[1,2,4,6,8], angs=[22.5,45,90];
  const rdUse=rd>0?Math.max(1,Math.min(8,rd)):1, dUse=Math.max(22.5,Math.min(90,d));
  const at=(R,A)=>{const row=BEND_KB.find(x=>x[0]===R&&x[1]===A); return row?row[2]:0;};
  const lerp=(a,b,t)=>a+(b-a)*t;
  let iR=0; while(iR<rds.length-1&&rds[iR+1]<rdUse)iR++; if(rds[iR+1]===rdUse)iR++;
  const r0=rds[Math.min(iR,rds.length-1)], r1=rds[Math.min(iR+1,rds.length-1)];
  let iA=0; while(iA<angs.length-1&&angs[iA+1]<dUse)iA++;
  const a0=angs[iA], a1=angs[Math.min(iA+1,angs.length-1)];
  const k00=at(r0,a0), k01=at(r0,a1), k10=at(r1,a0), k11=at(r1,a1);
  const ta=a1===a0?0:(dUse-a0)/(a1-a0), tr=r1===r0?0:(rdUse-r0)/(r1-r0);
  const k=lerp(lerp(k00,k01,ta), lerp(k10,k11,ta), tr);
  const exact=BEND_KB.some(x=>x[0]===rd&&x[1]===d);
  return {k, interpolated:!exact, rd:rdUse, deg:dUse, note:exact?'HDS-5 Table 5.1':'HDS-5 Table 5.1, linearly interpolated between published R/D and angle nodes'};
}
// HDS-5 Table 5.2a: 6 ft × 6 ft box, Chart 11, inlet-control discharge at a given headwater divided by the 0° value.
function skewRatio(hwd, deg){
  const rows=[[0.5,[1,1,82/85,80/85]],[1.0,[1,234/240,228/240,222/240]],[1.5,[1,396/396,390/396,384/396]]];
  const angs=[0,15,30,45], d=Math.max(0,Math.min(45,+deg||0));
  const h=isFinite(hwd)?Math.max(0.5,Math.min(1.5,hwd)):1;
  const col=i=>{let a=0;while(a<rows.length-1&&rows[a+1][0]<h)a++; const b=Math.min(a+1,rows.length-1), t=rows[b][0]===rows[a][0]?0:(h-rows[a][0])/(rows[b][0]-rows[a][0]); return rows[a][1][i]+(rows[b][1][i]-rows[a][1][i])*t;};
  let j=0; while(j<angs.length-1&&angs[j+1]<d)j++;
  const t=angs[j+1]===angs[j]?0:(d-angs[j])/(angs[Math.min(j+1,angs.length-1)]-angs[j]);
  const factor=col(j)+(col(Math.min(j+1,angs.length-1))-col(j))*t;
  return {factor, deg:d, note:'Screening ratio from HDS-5 Table 5.2a (one 6×6 ft box on Chart 11). Not a general skew coefficient; Charts 11 and 12 already include skew for those inlet edges.'};
}
function slopeWarning(S, ocMethod){
  if(!(S<=0)) return '';
  const how=ocMethod==='full'
    ?'the outlet is submerged, so the full-flow energy balance is used'
    :'outlet control is traced with the water-surface profile from the tailwater. Full-flow losses are used only where that profile reaches the crown, or if the outlet is submerged — not by assuming the whole barrel is in full-flow outlet control';
  return 'Zero or adverse slope — normal depth is undefined. '+how+'.';
}
// Lengths in ft↔m (exact 0.3048). Discharge in cfs↔m³/s (0.3048³). Dimensionless fields are unchanged.
const FT=0.3048, CFS=FT*FT*FT;
function convertValue(v, kind, from, to){
  if(from===to||!isFinite(+v)) return v;
  const toSI=to==='SI', f=kind==='Q'?(toSI?CFS:1/CFS):kind==='L'?(toSI?FT:1/FT):1;
  if(kind!=='Q'&&kind!=='L') return v;
  return +v*f;
}
function convertText(text, kinds, from, to){
  if(from===to) return text;
  return String(text||'').split(/\n/).map(line=>{
    const parts=line.split(/([,;\s]+)/);
    let col=0;
    return parts.map(tok=>{
      if(/[,;\s]+/.test(tok)||tok==='') return tok;
      const kind=kinds[col++]||kinds[kinds.length-1];
      const n=+tok;
      if(!isFinite(n)) return tok;
      const c=convertValue(n, kind, from, to);
      const d=Math.abs(c)>=100?2:Math.abs(c)>=1?4:6;
      return String(+c.toFixed(d));
    }).join('');
  }).join('\n');
}
function convertSnapshot(values, spec, from, to){
  const out={};
  Object.keys(values||{}).forEach(id=>{
    const k=spec[id]||'num', v=values[id];
    if(String(k).indexOf('txt:')===0) out[id]=convertText(v, k.slice(4).split(','), from, to);
    else if(k==='L'||k==='Q'){const c=convertValue(v,k,from,to); out[id]=isFinite(+c)?String(+((+c).toPrecision(12))):v;}
    else out[id]=v;
  });
  return out;
}
// Channel / rating tailwater must not fall back to a hidden constant-elevation field.
function resolveTW(mode, computed, hiddenElev){
  if(mode==='none') return {twMode:'none', twElev:null};
  if(mode==='const') return {twMode:'const', twElev:hiddenElev};
  if(!computed||computed.error||!isFinite(+computed.el)) return {error:(computed&&computed.error)||'Tailwater could not be computed from the channel or rating data.', twMode:mode, twElev:null};
  return {twMode:'const', twElev:+computed.el, twCh:computed};
}
// One criteria object. TxDOT HDM sets the velocity numbers. TxDOT sets no HW/D limit; 1.5 is the top of the range HDS-5 §2.2.5 says agencies commonly use.
const CRITERIA={hwDMax:1.5, vExcessFt:12, vMinFt:3,
  sources:{hwDMax:'FHWA HDS-5 (2012) §2.2.5: agency HW/D limits commonly range from 1.0 to 1.5. TxDOT HDM sets no HW/D number.',
    vExcessFt:'TxDOT HDM Ch. 8 §2: as a general rule, outlet velocity over 12 ft/s is excessive.',
    vMinFt:'TxDOT HDM Ch. 8 §2 Outlet Velocity: 3 ft/s is recommended as a minimum so the barrel does not deposit sediment.'}};
function criteriaIn(c, US){
  const x=Object.assign({}, CRITERIA, c||{});
  const f=US!==false?1:FT;
  return {hwDMax:+x.hwDMax||CRITERIA.hwDMax, vExcess:(+x.vExcessFt||CRITERIA.vExcessFt)*f, vMin:(+x.vMinFt||CRITERIA.vMinFt)*f, vExcessFt:+x.vExcessFt||CRITERIA.vExcessFt, vMinFt:+x.vMinFt||CRITERIA.vMinFt, sources:CRITERIA.sources};
}
// Manning n. Diameter rows for helical 2⅔×½ and 3×1 are USACE HEC-RAS Hydraulic Reference Table 6-2 (the table usually read from the FHWA 1980 chart that HDS-5 Figure B.3 summarizes). HDS-5 Appendix B Table B.1 gives the ranges. Figure B.3 itself was not re-digitized.
const N_HEL_2_5=[[12,0.011],[18,0.014],[24,0.016],[36,0.019],[48,0.020],[60,0.021],[72,0.024]]; // 72 in: HDS-5 §B.4.2, above about 6 ft helical n matches annular; Chart 6 design value 0.024
const N_HEL_3_1=[[48,0.023],[54,0.023],[60,0.024],[66,0.025],[72,0.026],[78,0.027]];
const N_SP_6_2=[[60,0.033],[72,0.032],[120,0.030],[180,0.028]]; // HEC-RAS Table 6-2; HDS-5 range 0.033–0.035. Smaller n at large size is the published table, not an extrapolation.
function nInterp(tab, Din){
  if(Din<=tab[0][0]) return {n:tab[0][1], interpolated:false, clamped:Din<tab[0][0]};
  if(Din>=tab[tab.length-1][0]) return {n:tab[tab.length-1][1], interpolated:false, clamped:Din>tab[tab.length-1][0]};
  for(let i=1;i<tab.length;i++) if(Din<=tab[i][0]){
    const a=tab[i-1], b=tab[i], exact=Din===a[0]||Din===b[0];
    const t=(Din-a[0])/(b[0]-a[0]);
    return {n:a[1]+(b[1]-a[1])*t, interpolated:!exact&&Din!==b[0], clamped:false};
  }
  return {n:tab[tab.length-1][1], interpolated:false, clamped:false};
}
function manningN(o){
  o=o||{}; const mat=o.material||'concrete', corr=o.corrugation||'ann_2_5', Din=o.Din>0?o.Din:(o.Dft>0?o.Dft*12:o.Dm>0?o.Dm/0.0254:48);
  let n, range, source, interpolated=false, clamped=false, partialNote='';
  if(mat==='concrete'||mat==='box'){n=0.012; range=[0.010,0.015]; source='Design charts in HDS-5 Appendix C use n = 0.012 (Chart 5 pipe, Chart 15 box). Table B.1 lab range is 0.010–0.011 for concrete pipe and 0.012–0.015 for concrete boxes.';}
  else if(mat==='hdpe'){n=0.012; range=[0.009,0.015]; source='HDS-5 Table B.1, corrugated polyethylene with a smooth interior, 0.009–0.015. 0.012 is inside that range (same value the tool has always used).';}
  else if(mat==='cpe'){n=0.025; range=[0.018,0.025]; source='HDS-5 Table B.1 corrugated polyethylene 0.018–0.025. Default is the upper end of the published range.';}
  else if(mat==='pvc'){n=0.011; range=[0.009,0.011]; source='HDS-5 Table B.1 PVC 0.009–0.011. Default is the upper end of the published range.';}
  else if(mat==='spiral'){n=0.013; range=[0.012,0.013]; source='HDS-5 §B.5 / Table B.1 spiral rib metal pipe 0.012–0.013. Default is the upper end.';}
  else if(corr==='hel_2_5'){const r=nInterp(N_HEL_2_5,Din); n=r.n; interpolated=r.interpolated; clamped=r.clamped; range=[0.011,0.024];
    source='Helical 2⅔×½ in: HEC-RAS Table 6-2 at the tabulated diameters; 72 in uses 0.024 because HDS-5 §B.4.2 says helical n matches annular above about 6 ft, and Chart 6 uses 0.024. HDS-5 Table B.1 range for this helix is 0.011–0.023.';
    if(o.partial){n=n*1.11; partialNote=' HDS-5 §B.4.2: partial flow in a circular 2⅔×½ helical pipe, n is 11% higher than the full-flow value.';}}
  else if(corr==='hel_3_1'){const r=nInterp(N_HEL_3_1,Din); n=r.n; interpolated=r.interpolated; clamped=r.clamped; range=[0.022,0.028]; source='Helical 3×1 in: HEC-RAS Table 6-2. HDS-5 Table B.1 lists 3×1 annular as 0.027–0.028; a separate helical 3×1 range is not in Table B.1.';}
  else if(corr==='hel_6_1'){n=0.025; range=[0.022,0.025]; source='HDS-5 Table B.1 helical 6×1 in, 0.022–0.025. No per-diameter table was verified, so the upper end is used for every size.';}
  else if(corr==='ann_5_1'){n=0.026; range=[0.025,0.026]; source='HDS-5 Table B.1 annular 5×1 in, 0.025–0.026. Figure B.3 was not re-digitized, so size variation inside the range is not applied. Default is the upper end.';}
  else if(corr==='ann_3_1'){n=0.028; range=[0.027,0.028]; source='HDS-5 Table B.1 annular 3×1 in, 0.027–0.028. Upper end; Figure B.3 not re-digitized.';}
  else if(corr==='sp_6_2'){const r=nInterp(N_SP_6_2,Din); n=r.n; interpolated=r.interpolated; clamped=r.clamped; range=[0.033,0.035]; source='Structural plate 6×2 in: HEC-RAS Table 6-2 by diameter (n falls as diameter grows in that table). HDS-5 Table B.1 range is 0.033–0.035. Diameters outside 60–180 in are clamped to the nearest published row and flagged.';}
  else if(corr==='sp_9'){n=0.037; range=[0.033,0.037]; source='HDS-5 Table B.1 structural plate 9×2½ in, 0.033–0.037. No size table verified. Upper end.';}
  else {n=0.024; range=[0.022,0.027]; source='Annular 2⅔×½ in: HDS-5 Chart 6 design value n = 0.024, inside Table B.1 range 0.022–0.027. Figure B.3 was not re-digitized, so this does not vary with diameter.';}
  return {n, range, source:source+partialNote, interpolated, clamped, corrugation:corr, material:mat};
}
// Parallel barrels that are not identical. Each barrel is rated from 0 to Qtot, then one upstream elevation is found so the flows sum to Qtot. Barrels share a tailwater elevation and an upstream water-surface elevation; a barrel whose inlet invert is above that elevation carries nothing.
function splitFlow(barrels, Qtot, tw){
  tw=tw||{}; const twMode=tw.twMode==='none'?'none':'const', twElev=tw.twElev;
  const n=12;
  const rated=barrels.map(b=>{
    const pts=[[0, b.invIn]];
    for(let i=1;i<=n;i++){
      const q=Qtot*i/n;
      const r=analyze(Object.assign({}, b, {Q:q, barrels:1, twMode, twElev, skewApply:false}));
      pts.push([q, r.EL]);
    }
    return pts;
  });
  const qAt=(pts,EL)=>{
    if(!(EL>pts[0][1]+1e-8)) return 0;
    for(let i=1;i<pts.length;i++) if(pts[i][1]>=EL-1e-9){
      const a=pts[i-1], c=pts[i], dz=c[1]-a[1];
      const t=dz>1e-9?Math.max(0,Math.min(1,(EL-a[1])/dz)):1;
      return a[0]+t*(c[0]-a[0]);
    }
    return pts[pts.length-1][0];
  };
  const sum=EL=>rated.reduce((s,pts)=>s+qAt(pts,EL),0);
  let lo=Math.min.apply(null, barrels.map(b=>b.invIn)), hi=Math.max.apply(null, rated.map(pts=>pts[pts.length-1][1]));
  if(!(hi>lo)) hi=lo+1;
  for(let i=0;i<48;i++){const m=(lo+hi)/2; if(sum(m)<Qtot) lo=m; else hi=m;}
  const EL=(lo+hi)/2;
  const parts=barrels.map((b,i)=>{
    const q=qAt(rated[i], EL);
    const r=q>1e-6?analyze(Object.assign({}, b, {Q:q, barrels:1, twMode, twElev})):null;
    return {Q:q, r, EL:r?r.EL:b.invIn, HW:r?r.EL-b.invIn:0, idle:!(q>1e-4)};
  });
  return {EL, Q:parts.reduce((s,p)=>s+p.Q,0), parts, twMode, twElev};
}
// HEC-14 (2006) Eq. 5.1, cohesionless outlet scour. Tables 5.1, 5.2 (Ch, drop height) and 5.3 (Cs, slope). Time defaults to 30 min when unknown (§5.1.2).
const SCOUR_ABT={hs:[2.27,0.39,0.06],ws:[6.94,0.53,0.08],ls:[17.10,0.47,0.10],vs:[127.08,1.24,0.18]};
const SCOUR_CH=[[0,[1,1,1,1]],[1,[1.22,1.51,0.73,1.28]],[2,[1.26,1.54,0.73,1.47]],[4,[1.34,1.66,0.73,1.55]]]; // Hd in diameters: depth, width, length, volume
const SCOUR_CS=[[0,[1,1,1,1]],[2,[1.03,1.28,1.17,1.30]],[5,[1.08,1.28,1.17,1.30]],[7,[1.12,1.28,1.17,1.30]]]; // slope in percent; >7 uses the 7% row
function scourLerp(tab, x){
  if(x<=tab[0][0]) return {v:tab[0][1].slice(), interpolated:x!==tab[0][0]&&x<tab[0][0], clamped:x<tab[0][0]};
  const last=tab[tab.length-1];
  if(x>=last[0]) return {v:last[1].slice(), interpolated:false, clamped:x>last[0]};
  for(let i=1;i<tab.length;i++) if(x<=tab[i][0]){
    const a=tab[i-1], b=tab[i], t=(x-a[0])/(b[0]-a[0]), exact=x===a[0]||x===b[0];
    return {v:a[1].map((y,k)=>y+(b[1][k]-y)*t), interpolated:!exact, clamped:false};
  }
}
function scourHole(o){
  o=o||{}; const US=o.US!==false, g=US?32.2:9.81, Q=+o.Q, D=+o.D;
  const Rc=o.Rc>0?+o.Rc:(o.shape==='box'&&o.B>0?(o.B*D)/(2*(o.B+D)):D/4);
  const sigma=+o.sigma>0?+o.sigma:1.87, t=+o.tMin>0?+o.tMin:30, tDefault=!(o.tMin>0);
  const Hd=Math.max(0,+o.Hd||0), Spct=(+o.S||0)*100;
  const Ch=scourLerp(SCOUR_CH, Hd), Cs=scourLerp(SCOUR_CS, Math.min(Spct,7));
  const keys=['hs','ws','ls','vs'], out={Rc,sigma,t,tDefault,Hd,S:Spct/100,US,interpolated:Ch.interpolated||Cs.interpolated,clamped:Ch.clamped||Cs.clamped,gUsed:g};
  keys.forEach((k,i)=>{
    const ab=SCOUR_ABT[k], term=Cs.v[i]*Ch.v[i]*(ab[0]/Math.pow(sigma,1/3))*Math.pow(Q/(Math.sqrt(g)*Math.pow(Rc,2.5)),ab[1])*Math.pow(t/316,ab[2]);
    out[k]=term*(k==='vs'?Rc*Rc*Rc:Rc);
  });
  out.Lm=0.4*out.ls; // Fletcher & Grace: max depth about 0.4 Ls downstream
  out.source='FHWA HEC-14 (2006) Eq. 5.1 and Tables 5.1–5.3. Cohesionless soils only. Does not include long-term channel degradation (HEC-14 Ch. 2). σ defaults to 1.87 (the graded-sand example) when the user does not enter D84/D16.';
  return out;
}
// TxDOT Item 432 Table 1 protection riprap is a weight gradation by mattress thickness, not a D50 class.
// Stone diameter from the 50% weight uses W = 0.0275·D³·Sg (NCHRP Report 568, D in inches, W in lb). That conversion is not in the TxDOT HDM.
const TX432=[[12,30,75],[15,60,165],[18,105,220],[21,175,300],[24,200,325],[30,400,900]];
function txdotRiprap(D50ft, SG){
  const sg=+SG>1?+SG:2.65, dIn=(+D50ft||0)*12;
  const dOf=W=>Math.pow(W/(0.0275*sg),1/3);
  const rows=TX432.map(r=>({thicknessIn:r[0], w50:[r[1],r[2]], d50in:[dOf(r[1]),dOf(r[2])]}));
  const hit=rows.find(r=>r.d50in[0]+1e-9>=dIn);
  return {dIn, SG:sg, rows, thicknessIn:hit?hit.thicknessIn:null, over:!hit&&dIn>0,
    source:'Required D50 is from HEC-14. TxDOT Item 432 Table 1 (protection riprap) is selected by comparing that D50 with the stone size implied by the 50% weight band using W = 0.0275·D³·Sg (NCHRP Report 568). The low end of the band is used, so the pick is conservative. TxDOT publishes no official crosswalk from HEC-14 Table 10.1 classes to Item 432. Confirm the gradation with the district.'};
}
// HDS-5 §5.5.2 describes flotation of light barrels but does not give a cover depth or a buoyant-force formula with pipe weights. No numeric minimum cover is invented.
function flotationCheck(o){
  o=o||{}; const notes=[];
  const flex=o.material==='cmp'||o.material==='spiral'||o.material==='cpe'||o.material==='hdpe';
  const end=(o.inletId==='m_pr'||o.inletId==='m_mit'||o.inletId==='c_gr_pr');
  if(flex&&end&&o.HW>o.D) notes.push({level:'warn', text:'HDS-5 §5.5.2: large projecting or mitered flexible barrels are the installations most often damaged by uplift when the inlet is submerged. Headwalls, cutoff walls, or end anchorage are the measures the manual names. This tool does not compute buoyant force, because no pipe weight is assumed.'});
  if(isFinite(o.cover)&&o.cover<o.D) notes.push({level:'info', text:'Cover over the crown ('+o.cover+') is less than one barrel rise. HDS-5 §3.2 says the barrel must have adequate cover, and §5.5.2 says large skews under shallow fill should be avoided. Neither HDS-5 nor the TxDOT HDM culvert chapter states a single minimum cover in this tool, so no numeric limit is applied.'});
  if(!notes.length) notes.push({level:'info', text:'HDS-5 §5.5.2: uplift is a concern mainly for light, unanchored projecting or mitered metal barrels with a submerged inlet. No numeric minimum cover is applied.'});
  return notes;
}
function performanceRows(base, q0, q1, n){
  const rows=[], N=Math.max(1,n|0);
  for(let k=0;k<=N;k++){
    const q=q0+(q1-q0)*k/N; if(!(q>0)) continue;
    const r=analyze(Object.assign({}, base, {Q:q}));
    rows.push({Q:q, HWi:r.HWi, HWo:r.HWo, HWoHDS:r.HWoHDS, HW:r.HW, EL:r.EL, control:r.control, yout:r.yout, Vout:r.Vout});
  }
  return rows;
}

root.Culvert={extendInlets,taperIC,pipeTaper,TAPER_K,CIRC_TH,CIRC_FACE,riprapApron,dissipatorsFor,RIPRAP_T101,chGeom,channelTW,ratingTW,makeSection,sectionFromHY8,rectSection,polySection,hy8Ratio,secN,momentum,conj,findJump,traceSub,traceSuper,INLETS,MANNING,analyze,inletControl,geom,critical,normal,roadFlow,balance,crestMin,weirCoef,ktFactor,CR_DEEP,CR_SHALLOW,KT,buildHGL,bendKb,skewRatio,slopeWarning,FT,CFS,convertValue,convertText,convertSnapshot,resolveTW,CRITERIA,criteriaIn,manningN,splitFlow,scourHole,txdotRiprap,flotationCheck,performanceRows};

})(typeof module!=='undefined'?module.exports:window);
