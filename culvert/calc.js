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
function taperIC(t,Q,S,Ku,B,D){const type=t.type==='slope'?'slope':'side',edge=t.edge==='more'?'more':'less';
  const taper=t.taper||4,Bf=Math.max(t.Bf||B,B),E=D,L1s=(Bf-B)/2*taper;
  let L1,L2=0,L3=0,faceRise;
  if(type==='slope'){const St=t.St||2,T=Math.max(0,t.T||0);L2=T*St;L3=Math.max(0.5*B,L1s-L2);L1=L2+L3;faceRise=T+L3*S;}
  else{L1=L1s;faceRise=L1*S;}
  const th=form2(TAPER_K.throat,Q,B*D,D,S,Ku),fc=form2(TAPER_K[type+'_'+edge],Q,Bf*E,E,S,Ku);
  const HWt=th.r*D,HWf=fc.r*E,HWfT=HWf+faceRise;
  return {type,edge,Bf,E,taper,L1,L2,L3,faceRise,HWt,HWf,HWfT,xt:th.x,xf:fc.x,HW:Math.max(HWt,HWfT),ctrl:HWfT>HWt?'face':'throat'};}
// Extra inlet types from the HY-8 8.0 shape database (polynomial curves) for the built-in circular and box shapes.
function extendInlets(db){if(!db||extendInlets.done)return;extendInlets.done=true;
  const add=(key,mat,names,pre)=>{const m=db[key]&&db[key].mats.find(x=>x.name===mat);if(!m)return;
    m.inlets.forEach((i,k)=>{if(!names.includes(i.name)||i.t!=='poly')return;INLETS[key==='circular'?'circular':'box'].push(Object.assign({id:pre+k,name:i.name+' (HY-8 database)',chart:'HY-8 8.0 polynomial',Ke:i.KE},i));});};
  add('circular','Concrete',['Beveled Edge (1:1)','Beveled Edge (1.5:1)','Mitered to Conform to Slope'],'hyc_');
  add('box','Concrete',['Square Edge (90°) Headwall','1.5:1 Bevel (90°) Headwall','1:1 Bevel Headwall','1.5:1 Bevel (18-34° flare) Wingwall','1:1 Bevel (45° flare) Wingwall'],'hyb_');}
function analyze(p){
  const US=p.units!=='SI', g=US?32.174:9.81, Ku=US?1.0:1.811, kM=US?1.486:1.0, kf=US?29:19.63;
  const SEC=p.section&&p.section.sec?p.section:null; if(SEC)p=Object.assign({},p,{shape:SEC});
  const D=SEC?SEC.D:p.rise, B=SEC?SEC.B:(p.shape==='box'?p.span:p.rise), N=p.barrels||1, Q=p.Q/N;
  const S=(p.invIn-p.invOut)/p.length; let inl=p.inlet;
  const full=geom(p.shape,B,D,D), A=SEC?SEC.Afull:full.A, Pf=SEC?SEC.Pfull:(p.shape==='box'?2*(B+D):Math.PI*D), R=A/Pf; // full barrel: wetted perimeter includes the crown
  const nFull=SEC?secN(SEC,D,p.n):p.n;
  const dc=critical(p.shape,B,D,Q,g), Gc=geom(p.shape,B,D,dc), Vc=Q/Gc.A, Hc=dc+Vc*Vc/2/g;
  const yn=normal(p.shape,B,D,Q,p.n,S,kM);
  const Di=SEC&&p.riseNom?p.riseNom:D, Bi=SEC&&p.spanNom?p.spanNom:B; // HY-8 uses the nominal span/rise for inlet control
  const X=Ku*Q/(A*Math.sqrt(Di)), Xb=Ku*Q/(Bi*Math.pow(Di,1.5)); // HY-8 database inlets use X = Q/(B·D^1.5)
  const hy8=inl.t==='poly'||inl.t==='interp';
  const unsub=x=> inl.form===1 ? Hc/D + inl.K*Math.pow(x,inl.M) + inl.Ks*S : inl.K*Math.pow(x,inl.M);
  const sub=x=> inl.c*x*x + inl.Y + inl.Ks*S;
  let ratio, regime;
  if(hy8)regime=inl.t==='poly'?'HY-8 polynomial':'HY-8 interpolation table';
  if(hy8){const Xh=inl.t==='interp'||inl.xA?X:Xb; ratio=hy8Ratio(inl,Xh)-inl.SR*S;
    if(ratio<0.5){ // HY-8 low-flow branch (calibrated to HY-8 8.0 runs): below HW/D = 0.5 the headwater follows the
      // critical specific energy curve, scaled so it joins the inlet curve at HW/D = 0.5.
      let a=0;while(a<10&&hy8Ratio(inl,a+0.01)-inl.SR*S<0.5)a+=0.01;let b=a+0.01;for(let k=0;k<40;k++){const m=(a+b)/2;(hy8Ratio(inl,m)-inl.SR*S<0.5)?a=m:b=m;}
      const Qs=a*(inl.t==='interp'||inl.xA?A*Math.sqrt(Di):Bi*Math.pow(Di,1.5))/Ku,ys=critical(p.shape,B,D,Qs,g),As=geom(p.shape,B,D,ys).A,Hs=ys+Qs*Qs/As/As/2/g;
      ratio=Hc/Hs*0.5; regime+=' (low-flow: scaled critical energy)';}}
  else if(X<=3.5){ratio=unsub(X);regime='unsubmerged';}
  else if(X>=4.0){ratio=sub(X);regime='submerged';}
  else {const u=unsub(3.5/Ku*Ku), s=sub(4.0);ratio=u+(s-u)*(X-3.5)/0.5;regime='transition';}
  // transition uses equation values at the bounds (X expressed in US-equivalent scale)
  let HWi=ratio*Di, taper=null;
  if(p.taper&&p.shape==='box'){taper=taperIC(p.taper,Q,S,Ku,B,D);HWi=taper.HW;ratio=HWi/D;regime='tapered inlet, '+taper.ctrl+' control';}
  const TW = p.twMode==='const' ? Math.max(0,p.twElev-p.invOut) : 0;
  const V=Q/A, hv=V*V/2/g;
  const Hf=kf*nFull*nFull*p.length/Math.pow(R,4/3)*hv;
  const Ke=taper?0.2:(inl.Ke??inl.KE); inl=Object.assign({},inl,{Ke});
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
  return {taper,jump,jumpType,US,g,D,B,N,Q,S,A,R,dc,Vc,Hc,yn,X,regime,ratio,HWi,ELhi,TW,ho,V,hv,Hf,He,Ho,H,ELho,HWo,control,HW,EL:p.invIn+HW,yout,Vout,inlet:inl,steep,ocMethod,outMethod,profile,yinO,hoHDS,ELhoHDS};
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
root.Culvert={extendInlets,taperIC,TAPER_K,riprapApron,dissipatorsFor,RIPRAP_T101,chGeom,channelTW,ratingTW,makeSection,sectionFromHY8,rectSection,polySection,hy8Ratio,secN,momentum,conj,findJump,traceSub,traceSuper,INLETS,MANNING,analyze,geom,critical,normal,roadFlow,balance,crestMin,weirCoef,ktFactor,CR_DEEP,CR_SHALLOW,KT};

})(typeof module!=='undefined'?module.exports:window);
