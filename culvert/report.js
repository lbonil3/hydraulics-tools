/* Design Report: plain-language summary of the current design. Wraps drawProfile (called by run() with p,r,allow,ro,bal). */
(function(){const C=window.Culvert,prev=window.drawProfile;
const f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
const v=id=>{const e=document.getElementById(id);return e?((e.tagName==='SELECT'||e.tagName==='TEXTAREA')?e.value:parseFloat(e.value)):null;};
const st=(id)=>{const e=document.getElementById(id);return e&&e.tagName==='SELECT'?e.options[e.selectedIndex].text:'';};
const flag=(c,t)=>`<li class="rf ${c}"><span class="rb">${{pass:'PASS',warn:'CHECK',fail:'FAIL',info:'INFO'}[c]}</span>${t}</li>`;
function report(p,r,allow,ro,bal){const el=document.getElementById('report');if(!el)return;
 const US=r.US,L=US?'ft':'m',Q=US?'cfs':'m³/s',V=US?'ft/s':'m/s',Qt=v('Q'),i=r.inlet,box=p.shape==='box';
 const size=p.section&&window.Shapes?`${Shapes.label(p.shape)}, ${f(p.span,2)} × ${f(p.rise,2)} ${L} (span × rise${p.section.open?', natural streambed floor':''})`:box?`${f(p.span,1)} × ${f(p.rise,1)} ${L} box`:`${f(p.rise*(US?12:1000),0)}-${US?'in':'mm'} diameter pipe`;
 const zc=ro&&!ro.bad?C.crestMin(ro):NaN,HWD=r.HW/r.D;
 const ctrlWhy=r.control==='Inlet'
  ?`Inlet control governs because the headwater needed to push ${f(r.Q)} ${Q} through the entrance (${f(r.HWi)} ${L}) is higher than the headwater needed to overcome the barrel friction, entrance and exit losses against the tailwater (${f(r.HWo)} ${L}). The barrel can carry more water than the entrance lets in, so improving the inlet (bevels, flared wingwalls, a different end treatment) is what would lower the headwater; changing barrel roughness or length would not.`
  :`Outlet control governs because the headwater needed to overcome barrel friction, entrance and exit losses against the tailwater (${f(r.HWo)} ${L}) is higher than what the entrance alone needs (${f(r.HWi)} ${L}). Barrel size, length, roughness (n) and tailwater all matter here; a larger or smoother barrel would lower the headwater.`;
 const slope=!isFinite(r.yn)?'Normal depth is undefined (zero/adverse slope or the barrel would flow full), so the barrel is treated as hydraulically mild.'
  :r.steep?`Normal depth d<sub>n</sub> = ${f(r.yn)} ${L} is below critical depth d<sub>c</sub> = ${f(r.dc)} ${L}, so the barrel is <b>steep</b>: flow passes through critical depth near the entrance and runs fast and shallow (supercritical) downstream.`
  :`Normal depth d<sub>n</sub> = ${f(r.yn)} ${L} is above critical depth d<sub>c</sub> = ${f(r.dc)} ${L}, so the barrel is <b>mild</b>: flow is slow and deep (subcritical) and is controlled from downstream.`;
 const full=r.yout>=r.D-1e-6;const flowType=r.HW>r.D*1.2&&r.control==='Outlet'&&full?'Barrel flowing full (pressure flow) at the outlet':r.HW>r.D?'Inlet submerged (headwater above the top of the barrel)':'Free-surface (open-channel) flow; inlet not submerged';
 const jump=r.jump?`A <b>hydraulic jump</b> forms ${f(r.jump.x,1)} ${L} into the barrel (depth jumps from ${f(r.jump.y1)} to ${f(r.jump.y2)} ${L}). Jumps inside a barrel cause turbulence and pressure fluctuation; check the joints and that the barrel has the strength for this.`
  :r.jumpType==='drowned'?'Tailwater is high enough to push the hydraulic jump up to the inlet (drowned inlet) — the barrel runs in the subcritical/outlet regime.'
  :r.steep&&p.twMode==='const'?'No hydraulic jump forms inside the barrel; the supercritical flow leaves the outlet, and a jump (if any) forms downstream in the channel.':'No hydraulic jump in the barrel.';
 const over=bal&&bal.over;
 // ---- checks (TxDOT HDM first; FHWA where TxDOT gives no value; generic rules labelled) ----
 const TX='https://www.txdot.gov/manuals/des/hyd/',
  aHW=`<a href="${TX}chapter-8--culverts/section-2--design-considerations/allowable-headwater.html" target="_blank" rel="noopener">TxDOT HDM Ch. 8 §2, Allowable Headwater</a>`,
  aOV=`<a href="${TX}chapter-8--culverts/section-2--design-considerations/outlet-velocity.html" target="_blank" rel="noopener">TxDOT HDM Ch. 8 §2, Outlet Velocity</a>`,
  aDG=`<a href="${TX}chapter-8--culverts/section-2--design-considerations/design-guidelines-and-procedure-for-culverts.html" target="_blank" rel="noopener">TxDOT HDM Ch. 8 §2, Design Guidelines and Procedure for Culverts</a>`,
  aT42=`<a href="${TX}chapter-4--hydrology/section-6--design-flood-and-check-flood-standards.html" target="_blank" rel="noopener">TxDOT HDM Ch. 4 §6, Table 4-2</a>`,
  aHDS5=`<a href="https://www.fhwa.dot.gov/engineering/hydraulics/pubs/12026/hif12026.pdf" target="_blank" rel="noopener">FHWA HDS-5 (2012) §2.2.5 Allowable Headwater</a>`,
  aHEC14=`<a href="https://www.fhwa.dot.gov/engineering/hydraulics/pubs/06086/hec14.pdf" target="_blank" rel="noopener">FHWA HEC-14 (FHWA-NHI-06-086)</a>`;
 const ck=[];
 if(isFinite(zc))ck.push(r.EL<zc?flag('pass',`Headwater El. ${f(r.EL)} ${L} is below the road crest low point El. ${f(zc)} ${L} (${f(zc-r.EL)} ${L} margin). TxDOT: the allowable headwater for the design discharge "must also be below the roadway, that is, the roadway must be passable"; also check edge of pavement, sub-grade crown and top of headwall (${aHW}). TxDOT gives no numeric freeboard for culverts — use your district/project criteria.`)
  :flag('fail',`Headwater El. ${f(r.EL)} ${L} is above the road crest El. ${f(zc)} ${L}; ${f(bal?bal.Qr:NaN)} ${Q} overtops. If ${f(Qt)} ${Q} is the design-AEP flow, this fails TxDOT's requirement that the design headwater be below the roadway (${aHW}).`));
 else ck.push(flag('info','Roadway overtopping is off — headwater cannot be checked against the road (TxDOT requires the design headwater to be below the roadway).'));
 if(isFinite(allow))ck.push(r.EL<=allow?flag('pass',`Headwater El. ${f(r.EL)} ${L} ≤ the allowable El. ${f(allow)} ${L} you entered (TxDOT: set it from potential damage to adjacent property, the roadway and the culvert — ${aHW}).`):flag('fail',`Headwater El. ${f(r.EL)} ${L} exceeds the allowable El. ${f(allow)} ${L} you entered.`));
 ck.push(flag('info',`TxDOT: the change in 1% AEP (100-yr) headwater should be limited to 1.0 ft "if at all practicable" (${aHW}). Run the 1% AEP flow for existing and proposed conditions to check this.`));
 ck.push(HWD>1.5?flag('warn',`HW/D = ${f(HWD)}. TxDOT gives no HW/D limit; FHWA HDS-5 notes agency limits "commonly range from 1.0 to 1.5" (${aHDS5}). This is above that range — confirm your agency allows it.`)
  :HWD>=1.0?flag('pass',`HW/D = ${f(HWD)}, within the 1.0–1.5 range FHWA HDS-5 cites as common for agency limits (${aHDS5}); TxDOT sets no HW/D limit.`)
  :flag('info',`HW/D = ${f(HWD)} < 1. TxDOT: "If the headwater is less than the depth, the configuration may not be efficient" — a smaller culvert may work (${aDG}).`));
 const vx=US?12:3.66,vmin=US?3:0.91;
 ck.push(r.Vout>vx?flag('fail',`Outlet velocity ${f(r.Vout)} ${V} > ${vx} ${V}. TxDOT: excessive velocity "is usually an engineering judgment … but as a general rule, anything over 12 fps is considered excessive" (${aDG}). Provide outlet protection or energy dissipation (${aOV}; TxDOT HDM Ch. 8 §5 Velocity Protection and Control Devices; ${aHEC14}).`)
  :flag('pass',`Outlet velocity ${f(r.Vout)} ${V} ≤ ${vx} ${V}, TxDOT's general rule for "excessive" (${aDG}). TxDOT still asks you to set an allowable outlet velocity for each site and compare it with the erosive velocity of the downstream channel (${aOV}).`));
 ck.push(r.Vout<vmin?flag('warn',`Outlet velocity ${f(r.Vout)} ${V} < ${vmin} ${V}. TxDOT: "Velocities of less than about 3 fps usually foster deposition of sediments. Therefore, 3 fps is recommended as a minimum for culvert design and operation" (${aOV}).`)
  :flag('pass',`Outlet velocity ${f(r.Vout)} ${V} ≥ ${vmin} ${V}, the TxDOT recommended minimum for sediment (${aOV}). This is at the design flow; also check frequent, smaller flows.`));
 ck.push(flag('info',`Design frequency (${aT42}): freeway main lanes culverts 2% AEP (50-yr); principal arterials 10–2% AEP, 4% (25-yr) recommended; minor arterials and collectors incl. frontage roads 20–4% AEP, 10% (10-yr) recommended; local roads and streets 50–10% AEP; off-system: FHWA "same or slightly better" than existing. "All facilities must be evaluated to the 1% AEP flood event." Make sure ${f(Qt)} ${Q} is the right AEP flow for this road class.`));
 ck.push(flag('info','Minimum culvert size: the TxDOT HDM culvert chapter gives no minimum size. The 18-in minimum in the HDM applies to storm drain trunk lines and laterals, not culverts. Use your district/project criteria.'));
 if(r.jump)ck.push(flag('warn',`Hydraulic jump inside the barrel at ${f(r.jump.x,1)} ${L} (located HY-8-style). Check the joints and the structure for turbulence and uplift; HEC-14 covers jumps used for energy dissipation (${aHEC14}).`));
 if(r.S<=0)ck.push(flag('warn','Zero or adverse barrel slope — sediment and ponding risk; results use outlet-control assumptions.'));
 // ---- narrative ----
 const nar=`This ${p.barrels>1?p.barrels+'-barrel ':''}${size} ${st('material').split(' (')[0].toLowerCase()} culvert, ${f(p.length,0)} ${L} long on a ${f(r.S*100)}% slope, has to pass a design flow of ${f(Qt)} ${Q}. `+
  (over?`The culvert cannot pass all of it below the road: about ${f(bal.Qc)} ${Q} goes through the barrel and ${f(bal.Qr)} ${Q} flows over the road. `:`All of the flow goes through the culvert. `)+
  `Water will pond upstream to elevation ${f(r.EL)} ${L}, ${f(r.HW)} ${L} above the inlet invert (${f(HWD)} times the barrel height). ${r.control} control governs${r.control==='Inlet'?', so the entrance shape limits capacity':', so barrel losses and tailwater limit capacity'}. `+
  `The barrel is ${r.steep?'steep, so flow is fast and shallow':'hydraulically mild'}, and water leaves the outlet about ${f(r.yout)} ${L} deep at ${f(r.Vout)} ${V}`+(r.jump?`, after a hydraulic jump ${f(r.jump.x,0)} ${L} into the barrel`:'')+`. `+
  (r.Vout>(US?12:3.66)?'That exit velocity is above the 12 ft/s TxDOT treats as excessive, so outlet protection or energy dissipation needs to be designed. ':'')+
  `Check the PASS/CHECK/FAIL items above against your project's design criteria before finalizing.`;
 const tw=p.twMode==='const'?`El. ${f(p.twElev)} ${L} (depth ${f(r.TW)} ${L} above outlet invert)`:'none / free outfall';
 const road=ro&&!ro.bad?`crest low point El. ${f(zc)} ${L}, top width ${f(ro.Lr)} ${L}, ${ro.surface}`:'not modelled';
 const row=(a,b)=>`<tr><th>${a}</th><td>${b}</td></tr>`;
 el.innerHTML=`<div class="rhead"><div><b>Culvert design report</b><br><small>Generated ${new Date().toLocaleString()} · Culvert Studio (FHWA HDS-5 methods, HY-8-style profile)</small></div><span class="rbtns"><button type="button" class="rprint rpdf" data-act="pdf">Save / Share PDF</button><button type="button" class="rprint rprt" data-act="print">Print</button></span></div>
 <h4>1. Inputs</h4><table class="rt">${row('Culvert',`${p.barrels} × ${size}, ${st('material')}, Manning n = ${p.n}`)}${row('Inlet',`${i.name} (${i.t?i.chart:"HDS-5 "+i.chart}); entrance loss K<sub>e</sub> = ${i.Ke}`)}
 ${row('Length / slope',`${f(p.length,1)} ${L}; S = ${f(r.S*100)}%`)}${row('Inverts',`inlet El. ${f(p.invIn)} ${L}, outlet El. ${f(p.invOut)} ${L}`)}${row('Design flow',`${f(Qt)} ${Q}`)}${row('Tailwater',tw)}${row('Roadway',road)}${isFinite(allow)?row('Allowable HW',`El. ${f(allow)} ${L}`):''}</table>
 <h4>2. Results</h4><table class="rt">${row('Headwater',`El. <b>${f(r.EL)} ${L}</b>; depth HW = ${f(r.HW)} ${L}; HW/D = ${f(HWD)}`)}${row('Control',`<b>${r.control} control</b> (inlet HW ${f(r.HWi)} ${L}, outlet HW ${f(r.HWo)} ${L})`)}
 ${row('Flow type',flowType)}${row('Critical / normal depth',`d<sub>c</sub> = ${f(r.dc)} ${L}; d<sub>n</sub> = ${isFinite(r.yn)?f(r.yn)+' '+L:'—'} → ${!isFinite(r.yn)?'mild/undefined':r.steep?'steep':'mild'} barrel`)}
 ${row('Outlet',`depth ${f(r.yout)} ${L}, velocity <b>${f(r.Vout)} ${V}</b>`)}${row('Hydraulic jump',r.jump?`${f(r.jump.x,1)} ${L} from inlet (${f(r.jump.y1)} → ${f(r.jump.y2)} ${L})`:r.jumpType==='drowned'?'at/above inlet (drowned)':'none in barrel')}
 ${row('Flow split',ro&&!ro.bad?(over?`culvert ${f(bal.Qc)} + road ${f(bal.Qr)} = ${f(Qt)} ${Q} (max depth over road ${f(bal.road.hmax)} ${L})`:`all ${f(Qt)} ${Q} through culvert; no overtopping`):'overtopping not modelled')}</table>
 <h4>Why ${r.control.toLowerCase()} control?</h4><p>${ctrlWhy}</p><p>${slope} ${jump}</p>
 <h4>3. Design checks</h4><ul class="rchk">${ck.join('')}</ul>
 <h4>4. Summary</h4><p class="rnar">${nar}</p>
 <p class="rnote"><small>References: TxDOT Hydraulic Design Manual (online edition, txdot.gov/manuals/des/hyd), Ch. 4 §6 and Ch. 8 §2; FHWA HDS-5 <i>Hydraulic Design of Highway Culverts</i>, 3rd ed. (FHWA-HIF-12-026 / FHWA-NHI-12-029, 2012) §2.2.5; FHWA HEC-14 <i>Hydraulic Design of Energy Dissipators for Culverts and Channels</i>, 3rd ed. (FHWA-NHI-06-086, 2006); FHWA HY-8 8.0 User Manual §5.2.7. Values are quoted from those sources. Where they give no number (freeboard, minimum culvert size), the report says so instead of making one up. Check your district's criteria too. This is a screening tool, not a sealed design.</small></p>`;}
window.drawProfile=function(p,r,allow,ro,bal){const o=prev.apply(this,arguments);try{report(p,r,allow,ro,bal);if(window.ReportPDF)ReportPDF.prep();}catch(e){console.error(e);}return o;};
try{if(typeof run==="function")run();}catch(e){console.error(e);}
})();
