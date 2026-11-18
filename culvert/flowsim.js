/* 1D shallow-water visualization along the culvert profile.
   The barrel is a Saint-Venant channel with Manning friction and the design slope.
   The pool fills until the HDS-5 inlet rating and the barrel entrance energy can pass
   the design discharge. Steady headwater and outlet velocity are compared with
   Culvert.analyze; those engine numbers remain the design result. This file does not draw. */
(function(root){
const C=(typeof window!=='undefined'&&window.Culvert)?window.Culvert:require('./calc.js').Culvert;
const TOL={hw:0.15, vout:0.20};
function geom(shape,B,D,y){const yy=Math.max(1e-4, Math.min(y, D)); return C.geom(shape==='circular'?'circular':'box', B, D, yy);}
function area(shape,B,D,y){if(y>=D-1e-6) return geom(shape,B,D,D).A; return geom(shape,B,D,y).A;}
function radius(shape,B,D,y){const G=geom(shape,B,D,Math.min(y,D)); return Math.max(G.A/Math.max(G.P,1e-6), 1e-3);}
function inletHead(spec, Q){
  const US=spec.US!==false, g=US?32.174:9.81, Ku=US?1:1.811;
  const A=area(spec.shape, spec.B, spec.D, spec.D);
  const S=(spec.invIn-spec.invOut)/spec.L;
  const ic=C.inletControl({inlet:spec.inlet}, spec.shape==='circular'?'circular':'box', spec.B, spec.D, A, spec.D, spec.B, Math.max(Q,1e-6), S, Ku, g);
  return Math.max(0, ic.HWi);
}
function ratingQ(spec, h, qHi){
  let lo=0, hi=Math.max(qHi, 1e-6);
  for(let k=0;k<16;k++){const m=(lo+hi)/2; if(inletHead(spec, m)<h) lo=m; else hi=m;}
  return lo;
}
function create(spec){
  spec=Object.assign({US:true, shape:'box', barrels:1, cells:96, Ke:0.5, tw:0}, spec);
  const US=spec.US!==false, g=US?32.174:9.81;
  const B=spec.B, D=spec.D, L=spec.L, N=Math.max(24, spec.cells|0);
  const dx=L/N, S0=(spec.invIn-spec.invOut)/L;
  const h=new Array(N), q=new Array(N), zb=new Array(N);
  for(let i=0;i<N;i++){zb[i]=spec.invIn-S0*(i+0.5)*dx; h[i]=0.05; q[i]=0;}
  const poolA=Math.max(4*B, 8)*Math.max(0.12*L, US?15:5);
  const shape=spec.shape==='circular'?'circular':'box';
  const kM=US?1.486:1;
  const Qb=spec.Q/Math.max(1, spec.barrels||1);
  const yn=C.normal(shape, B, D, Qb, spec.n, Math.abs(S0), kM);
  const dc0=C.critical(shape, B, D, Math.max(Qb,1e-6), g);
  const steep=isFinite(yn)&&yn<dc0;
  const uN=Qb/Math.max(area(shape,B,D,isFinite(yn)?yn:dc0),1e-4);
  const FrN=uN/Math.sqrt(g*Math.max(isFinite(yn)?yn:dc0,1e-3));
  const ySeq=(isFinite(yn)?yn:dc0)*0.5*(-1+Math.sqrt(1+8*FrN*FrN));
  const st={spec, g, B, D, L, N, dx, S0, h, q, zb, hP:0.08, t:0, Qpass:0, poolA, shape, steep, ySeq, kM};
  return st;
}
function manning(st, i){
  const hh=Math.max(st.h[i], 1e-3);
  const u=st.q[i]/hh;
  const R=radius(st.shape, st.B, st.D, Math.min(hh, st.D));
  const kM=st.spec.US===false?1:1.486;
  const Sf=st.spec.n*st.spec.n*u*Math.abs(u)/Math.pow(kM, 2)/Math.pow(R, 4/3);
  return Math.max(-0.5, Math.min(0.5, Sf));
}
function cfl(st){
  let s=1;
  for(let i=0;i<st.N;i++){const hh=Math.max(st.h[i], 1e-3); s=Math.max(s, Math.abs(st.q[i]/hh)+Math.sqrt(st.g*hh));}
  return Math.max(0.002, Math.min(0.05, 0.35*st.dx/s));
}
function flux(h, q, g){const hh=Math.max(h,1e-6), u=q/hh; return [q, q*u+0.5*g*hh*hh];}
function step(st, dt){
  const {h,q,N,dx,g,B,D}=st, spec=st.spec, Qdesign=spec.Q/Math.max(1, spec.barrels||1);
  const Ke=isFinite(spec.Ke)?spec.Ke:0.5;
  const hForRating=Math.max(st.hP, h[0]+(1+Ke)*Math.pow(q[0]/Math.max(h[0],1e-3),2)/(2*g));
  let Qpass=Math.min(Qdesign, ratingQ(spec, Math.max(hForRating, 0.05), Qdesign*3));
  st.hP+=dt*(Qdesign-Qpass)/st.poolA;
  if(hForRating>st.hP) st.hP+=Math.min(dt*1.5, 1)*(hForRating-st.hP);
  st.hP=Math.max(0.04, Math.min(st.hP, D*6));
  const dc=C.critical(st.shape, B, D, Math.max(Qpass,1e-6), g);
  const u0=q[0]/Math.max(h[0],1e-3);
  const hEnergy=st.hP-(1+Ke)*u0*u0/(2*g);
  const hEnt=hEnergy>dc&&hEnergy<D?hEnergy:Math.min(Math.max(dc,0.05), D*0.98);
  const qEnt=Qpass/B;
  const FH=new Array(N+1), FQ=new Array(N+1);
  for(let i=0;i<=N;i++){
    let hl,ql,hr,qr;
    if(i===0){hl=hEnt; ql=qEnt; hr=h[0]; qr=q[0];}
    else if(i===N){
      hl=Math.max(h[N-1], 1e-3); ql=q[N-1];
      const freeSup=st.steep&&(spec.tw||0)<st.ySeq;
      hr=freeSup?hl:Math.min(D, Math.max(spec.tw||0, 0.05));
      qr=ql;
    } else {hl=h[i-1]; ql=q[i-1]; hr=h[i]; qr=q[i];}
    const ul=ql/Math.max(hl,1e-6), ur=qr/Math.max(hr,1e-6);
    const a=Math.max(Math.abs(ul)+Math.sqrt(g*hl), Math.abs(ur)+Math.sqrt(g*hr), 1e-3);
    const fl=flux(hl,ql,g), fr=flux(hr,qr,g);
    const nu=0.28;
    FH[i]=0.5*(fl[0]+fr[0])-nu*a*(hr-hl);
    FQ[i]=0.5*(fl[1]+fr[1])-nu*a*(qr-ql);
  }
  for(let i=0;i<N;i++){
    const Sf=manning(st, i);
    const hh=h[i];
    h[i]-=dt/dx*(FH[i+1]-FH[i]);
    q[i]-=dt/dx*(FQ[i+1]-FQ[i]);
    q[i]+=dt*g*Math.max(hh,0)* (st.S0-Sf);
    if(h[i]<0.03){h[i]=0.03; q[i]*=0.2;}
    if(h[i]>D){h[i]=D; const u=q[i]/D; if(Math.abs(u)*B>Qdesign*1.4) q[i]=Math.sign(u||1)*Qdesign*1.4/B;}
  }
  st.Qpass=Qpass; st.t+=dt;
}
function advance(st, seconds){
  let left=seconds, guard=0;
  while(left>1e-6&&guard<50000){const dt=Math.min(cfl(st), left); step(st, dt); left-=dt; guard++;}
  return guard;
}
function sample(st){
  const {h,q,B,D,zb,N}=st;
  const yOut=h[N-1], uOut=(q[N-1]*B)/Math.max(area(st.shape,B,D,yOut),1e-6);
  return {hw:st.hP, vout:Math.abs(uOut), yout:yOut, t:st.t, h:h.slice(), q:q.slice(), zb:zb.slice(), Qpass:st.Qpass, dx:st.dx, N};
}
function runToSteady(spec, opt){
  opt=opt||{};
  const st=create(spec); st.poolA=Math.max(4*spec.B, 8)*Math.max(0.12*spec.L, spec.US===false?5:15);
  advance(st, opt.seconds||25);
  const s=sample(st);
  s.steps=opt.seconds||25;
  return s;
}
function compare(spec, opt){
  const ref=C.analyze(Object.assign({units:spec.US===false?'SI':'US', barrels:spec.barrels||1, span:spec.B, rise:spec.D, length:spec.L, twMode:(spec.tw||0)>0?'const':'none', twElev:spec.invOut+(spec.tw||0)}, spec));
  const sim=runToSteady(spec, opt);
  const hwErr=Math.abs(sim.hw-ref.HW)/Math.max(Math.abs(ref.HW),1e-6);
  const vErr=Math.abs(sim.vout-ref.Vout)/Math.max(Math.abs(ref.Vout),1e-6);
  return {sim, ref, hwErr, vErr, ok:hwErr<=TOL.hw&&vErr<=TOL.vout, tol:TOL};
}
const api={TOL, create, advance, sample, runToSteady, compare, inletHead, cfl, step};
root.FlowSim=api;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:global);
