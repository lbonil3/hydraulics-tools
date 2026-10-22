/* Ditch Studio calculations (US customary units: ft, cfs, lb/ft²).
   Sources: FHWA HEC-15 3rd ed. (FHWA-NHI-05-114, Sept 2005) "Design of Roadside Channels with Flexible Linings";
   TxDOT Hydraulic Design Manual (9/2019) Ch. 7 Sec. 3 "Roadside Channel Design". */
(function(root){
const G=32.2,GAM=62.4,NU=1.217e-5,ALPHA=1.49,log10=Math.log10;
const bis=(f,lo,hi,it=200)=>{let a=lo,b=hi,fa=f(a);for(let i=0;i<it;i++){const m=(a+b)/2,fm=f(m);if((fm>0)===(fa>0)){a=m;fa=fm;}else b=m;if(b-a<1e-12)break;}return (a+b)/2;};
// ---------- geometry: returns {A,P,T,d} at depth d (max depth) ----------
function geom(s,d){d=Math.max(d,0);
 if(s.shape==='trap'||s.shape==='v'||s.shape==='rect'){const B=s.shape==='v'?0:s.B,z1=s.shape==='rect'?0:s.Z1,z2=s.shape==='rect'?0:s.Z2;
  return {A:B*d+0.5*(z1+z2)*d*d,P:B+d*(Math.hypot(1,z1)+Math.hypot(1,z2)),T:B+(z1+z2)*d,d};}            // HEC-15 App. B
 if(s.shape==='para'){const k=s.Dt/Math.pow(s.Tt/2,2),a=Math.sqrt(d/k),T=2*a,arc=x=>x/2*Math.sqrt(1+4*k*k*x*x)+Math.asinh(2*k*x)/(4*k); // y = k x², exact arc length
  return {A:2/3*T*d,P:d>0?2*arc(a):0,T,d};}
 if(s.shape==='round'){const Z=s.Z1,ln=Math.log;                                                          // HEC-15 App. B, 4-ft rounded bottom (CU only)
  if(d<=1/Z){const r=Math.sqrt(d/Z);return {A:8/3*d*Math.sqrt(d*Z),P:d>0?2*Z*ln(r+Math.sqrt(1+d/Z))+2*Math.sqrt(d*d+d*Z):0,T:4*Math.sqrt(d*Z),d};}
  const e=d-1/Z;return {A:8/3/Z+4*e+Z*e*e,P:2*Z*ln((1+Math.sqrt(Z*Z+1))/Z)+2*Math.sqrt(Z*Z+1)/Z+2*e*Math.sqrt(1+Z*Z),T:4+2*Z*e,d};}
 if(s.shape==='irr')return irr(s.pts,d);throw new Error('unknown shape');}
// irregular x-y section (x increasing, y = elevation): water level = min(y) + d
function irr(pts,d){const ymin=Math.min(...pts.map(p=>p[1])),wl=ymin+d;let A=0,P=0,T=0;
 for(let i=0;i<pts.length-1;i++){let [x1,y1]=pts[i],[x2,y2]=pts[i+1];if(y1>=wl&&y2>=wl)continue;
  if(y1>wl){const t=(y1-wl)/(y1-y2);x1=x1+t*(x2-x1);y1=wl;}else if(y2>wl){const t=(wl-y1)/(y2-y1);x2=x1+t*(x2-x1);y2=wl;}
  const dx=x2-x1;A+=dx*((wl-y1)+(wl-y2))/2;P+=Math.hypot(dx,y2-y1);T+=Math.abs(dx);}
 return {A,P,T,d};}
const maxDepthGeom=s=>s.shape==='irr'?Math.max(...s.pts.map(p=>p[1]))-Math.min(...s.pts.map(p=>p[1])):null;
// ---------- linings: Manning n ----------
const nBlodgett=(da,D50)=>0.262*Math.pow(da,1/6)/(2.25+5.23*log10(da/D50));                               // Eq 6.1 (CU)
function nBathurst(da,D50,T,Fr){const b=1.14*Math.pow(D50/T,0.453)*Math.pow(da/D50,0.814);                  // Eq 6.2–6.6
 const fFr=Math.pow(0.28*Fr/b,log10(0.755/b)),fREG=13.434*Math.pow(T/D50,0.492)*Math.pow(b,1.025*Math.pow(T/D50,0.118)),fCG=Math.pow(T/da,-b);
 return {n:ALPHA*Math.pow(da,1/6)/(Math.sqrt(G)*fFr*fREG*fCG),b,fFr,fREG,fCG};}
const recpAB=L=>{const b=Math.log(L.nup/L.nlow)/Math.log(L.tup/L.tlow);return {b,a:L.nmid/Math.pow(L.tmid,b)};};  // Eq 5.1–5.3: log-log slope through the 3 points (tup = 4·tlow → ln4 = 2·0.693); reproduces b = −0.146, a = 0.0361 of the CU example
const CS={Excellent:49,'Very good':25,Good:9.0,Fair:2.0,Poor:0.73};                                     // Table 4.2 (CU)
const RET={A:{h:36,Cs:33,Cn:0.605},B:{h:24,Cs:7.1,Cn:0.418},C:{h:8.0,Cs:3.9,Cn:0.220},D:{h:4.0,Cs:2.7,Cn:0.147},E:{h:1.6,Cs:3.8,Cn:0.093}}; // Table 4.4 (CU)
const CF={Sod:{Excellent:0.98,'Very good':0.95,Good:0.90,Fair:0.84,Poor:0.75},Bunch:{Excellent:0.55,'Very good':0.53,Good:0.50,Fair:0.47,Poor:0.41},Mixed:{Excellent:0.82,'Very good':0.79,Good:0.75,Fair:0.70,Poor:0.62}}; // Table 4.5
const Cn41=(Cs,h)=>0.237*Math.pow(Cs,0.10)*Math.pow(h,0.528);                                            // Eq 4.1 (CU, h in ft)
// ---------- soils (permissible soil shear) ----------
const T46={GM:[[1.07,14.3,47.7,1.42,-0.61,1e-4],[0,0,0.076,1.42,-0.61,1.0]],GC:[[0.0477,2.86,42.9,1.42,-0.61,1e-3],[0,0,0.119,1.42,-0.61,1.0]],
 SM:[[1.07,7.15,11.9,1.42,-0.61,1e-4],[0,0,0.058,1.42,-0.61,1.0]],SC:[[1.07,14.3,47.7,1.42,-0.61,1e-4],[0,0,0.076,1.42,-0.61,1.0]],
 ML:[[1.07,7.15,11.9,1.48,-0.57,1e-4],[0,0,0.058,1.48,-0.57,1.0]],CL:[[1.07,14.3,47.7,1.48,-0.57,1e-4],[0,0,0.076,1.48,-0.57,1.0]],
 MH:[[0.0477,1.43,10.7,1.38,-0.373,1e-3],[0,0,0.058,1.38,-0.373,1.0]],CH:[null,[0,0,0.097,1.38,-0.373,1.0]]};   // Table 4.6 (CU c6)
function soil(o){ // o:{type:'fine'|'coarse'|'cohesive'|'direct', D75 (in), cls, PI, e, tp}
 if(o.type==='direct')return {tp:o.tp,ns:o.D75>0.05?0.026*Math.pow(o.D75,1/6):0.016,how:'entered'};
 const ns=(o.type==='coarse'&&o.D75>0.05)?0.026*Math.pow(o.D75,1/6):0.016;                                 // Eq 4.4 / 0.016
 if(o.type==='fine')return {tp:0.02,ns,how:'fine non-cohesive (D75 < 0.05 in): 0.02 lb/ft² (HEC-15 4.3.2.1)'};
 if(o.type==='coarse')return {tp:0.4*o.D75,ns,how:`coarse non-cohesive: τp,soil = 0.4·D75 = 0.4·${o.D75} (Eq. 4.5)`};
 const row=T46[o.cls][o.PI>20?1:0];if(!row||o.PI<=10)throw new Error('Eq. 4.6 applies for PI > 10 (CH: PI > 20). Use a non-cohesive option or enter τp,soil.');
 const [c1,c2,c3,c4,c5,c6]=row;return {tp:(c1*o.PI*o.PI+c2*o.PI+c3)*Math.pow(c4+c5*o.e,2)*c6,ns,how:`cohesive ${o.cls}, PI ${o.PI}, e ${o.e} (Eq. 4.6, Table 4.6)`,row};}
// ---------- lining model: n at depth d, permissible shear ----------
function nAt(s,L,d,Q){const g=geom(s,d),R=g.A/g.P,to=GAM*R*s.S;
 if(L.type==='fixed'||L.type==='txdot')return {n:L.n,to,how:'constant n'};
 if(L.type==='veg'){const Cn=L.Cn;return {n:0.213*Cn*Math.pow(to,-0.4),to,Cn,how:'Eq. 4.2'};}
 if(L.type==='recp'){const {a,b}=recpAB(L);return {n:a*Math.pow(to,b),to,a,b,how:'Eq. 5.1'};}
 // riprap / gravel / gabion fill
 const da=g.A/g.T,r=da/L.D50;
 if(r>=1.5)return {n:nBlodgett(da,L.D50),to,da,r,how:'Eq. 6.1 (Blodgett)'};
 const V=Q/g.A,Fr=V/Math.sqrt(G*da),B=nBathurst(da,L.D50,g.T,Fr);return Object.assign(B,{to,da,r,Fr,how:'Eq. 6.2 (Bathurst)'});}
function qAt(s,L,d,Qh){if(d<=0)return 0;const g=geom(s,d);let Q=Qh||1,n;
 for(let i=0;i<60;i++){n=nAt(s,L,d,Q).n;const q=ALPHA/n*g.A*Math.pow(g.A/g.P,2/3)*Math.sqrt(s.S);if(Math.abs(q-Q)<1e-9*Math.max(1,q))return q;Q=L.type==='rock'||L.type==='gabion'?q:q;if(!(L.type==='rock'||L.type==='gabion'))return q;}
 return Q;}
function normalDepth(s,L,Q){const top=s.shape==='irr'?maxDepthGeom(s):Math.max(50,(s.Dd||5)*5);const f=d=>{const g=geom(s,d);const nn=nAt(s,L,d,Q),n=nn.n;if(nn.r!=null&&nn.r<0.3)return NaN;return ALPHA/n*g.A*Math.pow(g.A/g.P,2/3)*Math.sqrt(s.S)-Q;};
 const ff=d=>{const v=f(d);return isFinite(v)?v:-1;};let lo=1e-4,hi=null;for(let d=1e-4;d<=top*1.0001;d*=1.08){if(ff(d)>=0){hi=d;break;}lo=d;}
 if(hi==null){if(ff(top)<0)return {d:NaN,over:true};hi=top;}return {d:bis(ff,lo,hi)};}
function critDepth(s,Q){const top=s.shape==='irr'?maxDepthGeom(s):60;return bis(d=>{const g=geom(s,d);return Q*Q*g.T/(G*Math.pow(g.A,3))-1;},1e-6,top);}
const K1of=Z=>Z<=1.5?0.77:Z<5?0.066*Z+0.67:1.0;                                                            // Eq 3.4
const Kbof=x=>x<=2?2.0:x<10?2.38-0.206*x+0.0073*x*x:1.05;                                                  // Eq 3.7
function shields(Re){if(Re<=4e4)return {F:0.047,SF:1.0};if(Re>=2e5)return {F:0.15,SF:1.5};const t=(Re-4e4)/(2e5-4e4);return {F:0.047+t*(0.15-0.047),SF:1.0+t*0.5};} // Table 6.1
// ---------- full analysis ----------
// s: shape {shape,B,Z1,Z2,Tt,Dt,pts,S,Dd(ditch depth),Rc}, L: lining, o: {mode:'Q'|'d', Q, d, SF, life:'perm'|'trans'}
function analyze(s,L,o){let d,Q;
 if(o.mode==='d'){d=o.d;Q=qAt(s,L,d,o.Qh);}else{Q=o.Q;const r=normalDepth(s,L,Q);if(r.over)throw new Error('Flow exceeds the capacity of the irregular section (water above the highest point).');d=r.d;}
 const g=geom(s,d),R=g.A/g.P,nn=nAt(s,L,d,Q),n=nn.n,V=Q/g.A,Dh=g.A/g.T,Fr=V/Math.sqrt(G*Dh),dc=critDepth(s,Q);
 const td=GAM*d*s.S,to=GAM*R*s.S;let SF=o.SF||1,tp=null,lining={},K1=null,ts=null,side=null;
 const zs=s.shape==='trap'||s.shape==='v'?[s.Z1,s.Z2]:s.shape==='rect'?[0,0]:null;
 if(zs){K1=K1of(Math.min(...zs));ts=K1*td;}
 if(L.type==='veg'||L.type==='recp'){const so=soil(L.soil);
  if(L.type==='veg'){const Cf=L.Cf;tp=so.tp/(1-Cf)*Math.pow(n/so.ns,2);lining={soil:so,Cf,Cn:L.Cn,te:td*(1-Cf)*Math.pow(so.ns/n,2)};}   // Eq 4.7, 4.3
  else{tp=L.tl/0.14*(so.tp+0.14/4.3);lining={soil:so,te:(td-L.tl/4.3)*(0.14/L.tl),a:nn.a,b:nn.b};}}                            // Eq 5.5, 5.4
 else if(L.type==='rock'||L.type==='gabion'){const Vs=Math.sqrt(G*d*s.S),Re=Vs*L.D50/NU,sh=shields(Re),F=L.type==='gabion'?0.10:sh.F;
  const tpR=F*(L.gs-GAM)*L.D50;let tpM=null;if(L.type==='gabion'){tpM=0.0091*(L.gs-GAM)*(L.MT+4.07);}                              // Eq 6.7/7.1, 7.2
  tp=L.type==='gabion'?Math.max(tpR,tpM):tpR;SF=Math.max(SF,L.type==='gabion'?1.25:sh.SF);
  const D50req=SF*d*s.S/(F*(L.gs/GAM-1));lining={Vs,Re,F,SFtab:L.type==='gabion'?1.25:sh.SF,tpR,tpM,D50req,da:nn.da,r:nn.r};       // Eq 6.8
  if(zs&&L.type==='rock'){const Z=Math.min(...zs),th=Math.atan(1/Z),K2=Math.sqrt(Math.max(0,1-Math.pow(Math.sin(th)/Math.sin(L.phi*Math.PI/180),2))); /* Eq 6.16; square root as in the worked example (K2 = 0.86 for Z 3, φ 38°) */side={K2,th:th*180/Math.PI,D50s:K1/K2*D50req,ok:K2>0&&K1/K2*D50req<=L.D50};}} // Eq 6.15–6.17
 else if(L.type==='txdot'||L.type==='fixed'&&L.tp!=null)tp=L.tp;
 const rigid=L.type==='fixed'&&L.tp==null;
 let bend=null;if(s.Rc>0){const x=s.Rc/g.T,Kb=Kbof(x);bend={x,Kb,tb:Kb*td,Lp:0.60*Math.pow(R,7/6)/n,dd:V*V*g.T/(G*s.Rc)};if(tp!=null)bend.ok=tp>=SF*bend.tb;} // Eq 3.6–3.9
 const fbReq=(Fr>1?Math.max(d,o.life==='trans'?0:0.5):(o.life==='trans'?0:0.5))+(bend?bend.dd:0);            // HEC-15 2.3.4 + Eq 3.9
 const fb=s.Dd!=null?{avail:s.Dd-d,req:fbReq,ok:s.Dd-d>=fbReq-1e-9,steep:Fr>1}:null;
 const bottomOk=tp==null?null:tp>=SF*td,sideOk=tp==null||ts==null?null:(L.type==='rock'?(side?side.ok:null):tp>=SF*ts);
 return {d,Q,g,R,n,nn,V,Fr,dc,regime:Math.abs(Fr-1)<0.02?'critical':Fr<1?'subcritical':'supercritical',td,to,K1,ts,tp,SF,rigid,lining,side,bend,fb,bottomOk,sideOk};}
function rating(s,L,dmax,N=40){const out=[];for(let i=1;i<=N;i++){const d=dmax*i/N;out.push([d,qAt(s,L,d)]);}return out;}
const API={G,GAM,NU,geom,irr,nBlodgett,nBathurst,recpAB,CS,RET,CF,Cn41,T46,soil,nAt,qAt,normalDepth,critDepth,K1of,Kbof,shields,analyze,rating};
if(typeof module!=='undefined')module.exports=API;else root.DT=API;
})(typeof window!=='undefined'?window:globalThis);
