// Flanking inlets (HEC-22 4th ed. Sec. 7.4.3, Example 7.10) and TxDOT picker Vo handling.
global.window=undefined;const FL=require('./flank.js'),DR=require('./calc.js');let p=0,F=0;
const ck=(n,a,b,tol)=>{const g=Math.abs(a-b)<=tol;g?p++:F++;console.log(`${g?'PASS':'FAIL'} | ${n} | ${typeof a==='number'?a.toFixed(4):a} | ${b} | ±${tol}`);};
// Example 7.10: G1 -2.5 %, G2 +2.5 %, L 500 ft, Sx 0.02, T 9.84 ft -> K 100, d 0.2, X 38.5
const K=FL.Kof({kmode:'GL',Lvc:500,G1:-2.5,G2:2.5});ck('Ex 7.10 K = L/(G2-G1)',K,100,1e-9);
ck('Ex 7.10 d = Sx*T',0.02*9.84,0.2,0.0035);ck('Ex 7.10 X with d = 0.2 (published 38.5 ft)',FL.Xof(0.2,K),38.5,0.05);
ck('Eq 7.22 puts flanker at 63% ponding depth (rise = 0.37 d)',FL.rise(FL.Xof(0.2,K),K)/0.2,0.37,1e-9);
ck('local grade at X = x/K (%)',FL.gradeAt(38.5,100)*100,0.385,1e-9);
// sagCap inverts sagD for each inlet type
const Sx=0.02,types={curb:{it:'curb',cl:5,h:0.5,ca:3,cw:2},grate:{it:'grate',gw:2,gl:3,ratio:0.5,clog:0},combo:{it:'combo',gw:1.92,gl:4.5,ratio:0.5,cl:5,h:0.375}};
for(const [k,i] of Object.entries(types)){const d=FL.sagD(2,i,Sx);ck(`sagCap(sagD(2 cfs)) = 2 (${k})`,FL.sagCap(d,i,Sx),2,0.02);}
// full computation, symmetric curb flankers = low point inlet
const fl=types.curb,o={kmode:'K',K:100,Sx,n:0.016,Tal:9.84,QL:3,QR:3,xmode:'eq',low:fl,fl},r=FL.compute(o);
const g={type:'uniform',n:0.016,SL:r.SL,Sx};const ref=DR.curbGrade(g,3,{L:5,a:3,W:2,method:'HEC22'});
ck('flanker Qi equals curbGrade at local grade',r.L.Qi,ref.Qi,1e-12);ck('low point flow = sum of bypasses',r.Qlow,2*ref.Qb,1e-12);
ck('spread with flankers < without (1=true)',r.with.T<r.without.T?1:0,1,0);
ck('clogged: 2 flankers in sag carry total Q',2*FL.sagCap(r.clog.df,fl,Sx),6,0.01);
ck('clogged pond depth minus rise = flanker depth',r.clog.d-r.y,r.clog.df,1e-12);
ck('user distance used (TxDOT 50 ft)',FL.compute(Object.assign({},o,{xmode:'user',Xu:50})).X,50,0);
ck('without flankers depth = curbSagDepth(Qt)',r.without.d,DR.curbSagDepth(6,{L:5,h:0.5,a:3,W:2,throat:'vertical'}).d,1e-12);
// TxDOT picker no longer leaves a stale Vo for grates on grade/spacing
const vm=require('vm'),fs=require('fs');const ctx={window:{},document:{addEventListener(){},getElementById(){return null},querySelector(){return null}},S:{},mode:'grade'};ctx.window.form=()=>{};ctx.window.render=()=>{};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/txdot-inlets.js','utf8'),ctx);
let s=ctx.window.TXI_apply({Vo:8.2,gtype:'P-1-7/8'},'PCU-0','space');ck('PCU in spacing clears stale Vo (blank = needs input)',s.Vo===''?1:0,1,0);
s=ctx.window.TXI_apply({Vo:8.2},'PCU-1','grade');ck('PCU on grade clears stale Vo',s.Vo===''?1:0,1,0);
s=ctx.window.TXI_apply({Vo:8.2},'PCO-0','grade');ck('curb inlet leaves Vo alone',s.Vo,8.2,0);
console.log(`\n${p} pass, ${F} fail`);process.exit(F?1:0);
