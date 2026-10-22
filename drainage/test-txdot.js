// Checks that the TxDOT standard inlet picker fills values read from the sheets.
const vm=require('vm'),fs=require('fs');const ctx={window:{},document:{addEventListener(){}},S:{},mode:'grade'};ctx.window.form=()=>{};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/txdot-inlets.js','utf8'),ctx);const {TXI,TXI_apply}=ctx.window;let p=0,F=0;
const ok=(n,a,b)=>{const g=a===b;g?p++:F++;console.log((g?'PASS':'FAIL')+' | '+n+' | '+a+' | '+b);};
ok('9 standard entries',TXI.length,9);
let s=TXI_apply({it:'grate'},'PCO-0','grade');ok('PCO main: curb',s.it,'curb');ok('PCO main L=5 ft',s.cl,5);ok('PCO depression 3 in',s.ca,3);ok('PCO depr width 2 ft',s.cw,2);
s=TXI_apply({},'PCO-1','sag');ok('PCO +1 ext L=9.5',s.cl,9.5);ok('PCO throat 6 in (0.5 ft) in sag',s.h,0.5);
s=TXI_apply({},'CCO-2','space');ok('CCO +2 ext L=14',s.cl,14);ok('CCO label',s.stdName,'TxDOT CCO');
s=TXI_apply({gtype:'P-1-7/8'},'PCU-0','space');ok('PCU combo',s.it,'combo');ok('PCU grate w',s.gw,1.92);ok('PCU grate L',s.gl,4.5);ok('PCU HEC-22 map',s.gtype,'Reticuline');
s=TXI_apply({},'PCU-2','sag');ok('PCU throat 4.5 in',s.h,0.375);ok('PCU +2 L=14 (sweeper)',s.cl,14);
s=TXI_apply({it:'curb',cl:7,stdName:'x'},'custom','grade');ok('custom keeps values',s.cl,7);ok('custom clears label',s.stdName,'');
console.log(`\n${p} pass, ${F} fail`);process.exit(F?1:0);
