/* TxDOT statewide standard inlets (Bridge Division standards). Values read from the sheets only.
   Sources: CD-PCO-23, CD-CCO-23, CD-PCU-23, CD-CGT-PCO-23, CD-CGT-PCU-23 (rev. 06-2023)
   https://ftp.dot.state.tx.us/pub/txdot-info/cmd/cserve/standard/bridge/ */
(function(){
const U='https://ftp.dot.state.tx.us/pub/txdot-info/cmd/cserve/standard/bridge/';
const mk=(code,base,ext,o)=>Object.assign({id:code+'-'+ext,code,ext,name:`${code} ${['main only','+1 ext','+2 ext'][ext]} (${5+4.5*ext} ft)`,cl:5+4.5*ext,ca:3,cw:2},base,o||{});
const PCO={it:'curb',h:0.5,sheet:'PCO — Precast Curb Inlet Outside Roadway (06-2023)',url:U+'CD-PCO-23.pdf',dep:U+'CD-CGT-PCO-23.pdf'};
const CCO={it:'curb',h:0.5,sheet:'CCO — Curb Inlet Outside Roadway, cast-in-place (06-2023)',url:U+'CD-CCO-23.pdf',dep:U+'CD-CGT-PCO-23.pdf'};
const PCU={it:'combo',h:0.375,gw:1.92,gl:4.5,gtype:'Reticuline',hec:'Reticuline',sheet:'PCU — Precast Curb Inlet Under Roadway (06-2023)',url:U+'CD-PCU-23.pdf',dep:U+'CD-CGT-PCU-23.pdf'};
const L=[];for(const b of [PCO,CCO,PCU])for(const e of [0,1,2])L.push(mk(b===PCO?'PCO':b===CCO?'CCO':'PCU',b,e));
window.TXI=L;
window.TXI_apply=function(s,id,mode){const x=L.find(i=>i.id===id);s.std=id;if(!x){s.stdName='';return s;}
 s.it=x.it;s.cl=x.cl;s.ca=x.ca;s.cw=x.cw;s.stdName='TxDOT '+x.code;
 if(mode==='sag')s.h=x.h;
 if(x.it==='combo'){s.gw=x.gw;s.gl=x.gl;if('gtype' in s||mode==='space')s.gtype=x.gtype;}
 if(mode==='sag'&&s.it==='curb'){s.throat='vertical';}
 return s;};
const note=x=>x?`<div class="txnote"><b>${x.sheet}</b> · curb opening ${x.cl} ft (main throat 5'-0"${x.ext?`, ${x.ext}× 4'-6" extension`:''}) · throat ${x.h*12} in · gutter depression 3 in over 2'-0" (CGT sheet)${x.it==='combo'?` · cast-iron grate under main throat ≈ ${x.gw} × ${x.gl} ft clear; mapped to HEC-22 <b>${x.hec}</b> (ASSUMPTION — sheet shows rectangular cast openings, bars not dimensioned; read Vo / Rf for that type and check the open-area ratio)`:''} · <a href="${x.url}" target="_blank" rel="noopener">sheet PDF</a> · <a href="${x.dep}" target="_blank" rel="noopener">depression sheet</a>. You can still edit any value below.</div>`:'';
const oForm=window.form;
window.form=function(){oForm();if(!['grade','sag','space'].includes(mode))return;const s=S[mode];const x=L.find(i=>i.id===s.std);
 const opts=[['custom','Custom / HEC-22 (type my own)'],...L.map(i=>[i.id,i.name])];
 const h=`<fieldset class="txpick"><legend>TxDOT standard inlet</legend><div class="f" data-k="std"><label><span>Standard sheet</span><select id="txstd">${opts.map(([v,l])=>`<option value="${v}"${v===(s.std||'custom')?' selected':''}>${l}</option>`).join('')}</select></label></div>${note(x)}</fieldset>`;
 const fm=document.getElementById('form');const fs=fm.querySelector('fieldset');fs?fs.insertAdjacentHTML('beforebegin',h):fm.insertAdjacentHTML('afterbegin',h);};
document.addEventListener('change',e=>{if(e.target.id!=='txstd')return;TXI_apply(S[mode],e.target.value,mode);form();render();});
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.v;if(!k||!S[mode]||!S[mode].std||S[mode].std==='custom')return;
 if(['cl','cl2','ca','cw','h','gw','gl'].includes(k)){S[mode].stdName=S[mode].stdName&&!/edited/.test(S[mode].stdName)?S[mode].stdName+' (edited)':S[mode].stdName;}});
})();
