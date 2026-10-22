global.window=globalThis;const DR=require('./calc.js');globalThis.DR=DR;const SP=require('./spacing.js');
let pass=0,fail=0;const chk=(n,g,e,t)=>{const ok=Math.abs(g-e)<=t;ok?pass++:fail++;console.log(`${ok?'PASS':'FAIL'} | ${n} | ${(+g).toFixed(4)} | ${(+e).toFixed(4)} | ±${t}`);};
const g={type:'uniform',n:0.016,SL:0.01,Sx:0.02};
const p={W:40,C:0.9,i:6,Qco:0.2,g,inlet:{type:'curb',cl:10,ca:0,cw:2,meth:'TxDOT'},lim:{Qb:0.5,T:10,d:0.5}};
let r=SP.evalL(p,300);const Q=0.9*6*40*300/43560+0.2;
chk('Q = C i W L/43560 + Qco',r.Q,Q,1e-12);chk('T = HEC-22 Eq 5.4',r.T,DR.tUniform(Q,0.02,0.01,0.016),1e-9);chk('d = T Sx',r.d,r.T*0.02,1e-9);
chk('Qi = curbGrade TxDOT',r.Qi,DR.curbGrade(g,Q,{L:10,a:0,W:2,method:'TxDOT'}).Qi,1e-12);chk('Qb = Q - Qi',r.Qb,Q-r.Qi,1e-12);
// HEC-22 Ex 7.2 reproduced through the spacing path: Q 1.77 with no carryover
const L72=1.77/(1*1*1)*43560/(1*1);r=SP.evalL({W:1,C:1,i:1,Qco:0,g,inlet:{type:'curb',cl:9.84,ca:0,cw:2,meth:'HEC22'},lim:{Qb:9,T:99,d:9}},L72);chk('Ex7.2 via spacing Qi',r.Qi,1.08,0.02);
// grate path = Ex 7.1
const g71={type:'uniform',n:0.016,SL:0.04,Sx:0.025};r=SP.evalL({W:1,C:1,i:1,Qco:6.62,g:g71,inlet:{type:'grate',gw:2,gl:2,Vo:8.2},lim:{Qb:9,T:99,d:9}},0);chk('Ex7.1 via spacing Qi',r.Qi,3.15,0.03);
// solver: at returned L the governing criterion is at its limit and all pass; slightly longer fails
const m=SP.maxL(p);r=SP.evalL(p,m.L);const r2=SP.evalL(p,m.L*1.001);
chk('solver: all pass at Lmax',r.ok?1:0,1,0);chk('solver: fails just beyond',r2.ok?1:0,0,0);
chk('solver: governing value at limit',m.gov==='Qb'?r.Qb:m.gov==='T'?r.T:r.d,p.lim[m.gov],1e-6*(p.lim[m.gov]+1));
console.log('governing',m.gov,'L',m.L.toFixed(1),JSON.stringify(m.each));
// brute-force cross-check of solver
let Lb=0;for(let L=0;L<5000;L+=0.5){if(SP.evalL(p,L).ok)Lb=L;else break;}chk('solver vs brute force (0.5 ft)',m.L,Lb,0.5);
// spread governs when bypass limit relaxed
const p2=Object.assign({},p,{lim:{Qb:99,T:8,d:9}});const m2=SP.maxL(p2);chk('spread-governed: T at limit',SP.evalL(p2,m2.L).T,8,1e-6);chk('governing = T',m2.gov==='T'?1:0,1,0);
// chain: carryover passes down
const ch=SP.chain(p,3,'fixed',200);chk('chain: inlet 2 carryover = inlet 1 bypass',ch[1].Qco,ch[0].Qb,1e-12);chk('chain: inlet 3 Q',ch[2].Q,0.9*6*40*200/43560+ch[1].Qb,1e-12);
const ca=SP.chain(p,3,'auto');chk('auto chain: every inlet passes',ca.every(x=>x.ok)?1:0,1,0);
console.log(`\n${pass} pass, ${fail} fail`);if(fail)process.exit(1);
