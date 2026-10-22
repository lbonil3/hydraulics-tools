/* Design Report: plain-language summary of the current design. Wraps drawProfile (called by run() with p,r,allow,ro,bal). */
(function(){const C=window.Culvert,prev=window.drawProfile;
const f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
const v=id=>{const e=document.getElementById(id);return e?((e.tagName==='SELECT'||e.tagName==='TEXTAREA')?e.value:parseFloat(e.value)):null;};
const st=(id)=>{const e=document.getElementById(id);return e&&e.tagName==='SELECT'?e.options[e.selectedIndex].text:'';};
const flag=(c,t)=>`<li class="rf ${c}"><span class="rb">${{pass:'PASS',warn:'CHECK',fail:'FAIL',info:'INFO'}[c]}</span>${t}</li>`;
function report(p,r,allow,ro,bal){const el=document.getElementById('report');if(!el)return;
 const US=r.US,L=US?'ft':'m',Q=US?'cfs':'m³/s',V=US?'ft/s':'m/s',Qt=v('Q'),i=r.inlet,box=p.shape==='box';
 const size=box?`${f(p.span,1)} × ${f(p.rise,1)} ${L} box`:`${f(p.rise*(US?12:1000),0)}-${US?'in':'mm'} diameter pipe`;
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
 // ---- checks ----
 const ck=[];
 if(isFinite(zc))ck.push(r.EL<zc?flag('pass',`Headwater El. ${f(r.EL)} ${L} is below the road crest low point El. ${f(zc)} ${L} (${f(zc-r.EL)} ${L} below). Compare this margin with the freeboard your project/agency criteria require for the design frequency.`)
  :flag('fail',`Headwater El. ${f(r.EL)} ${L} is above the road crest El. ${f(zc)} ${L}: the road overtops at the design flow (${f(bal?bal.Qr:NaN)} ${Q} over the road). TxDOT HDM Ch. 8 sets design-frequency criteria for roadway overtopping — confirm this is acceptable for the road class.`));
 else ck.push(flag('info','Roadway overtopping is off — the report cannot check headwater against the road crest.'));
 if(isFinite(allow))ck.push(r.EL<=allow?flag('pass',`Headwater El. ${f(r.EL)} ${L} ≤ allowable El. ${f(allow)} ${L} (the limit you entered, e.g. from adjacent property, upstream structures or freeboard).`):flag('fail',`Headwater El. ${f(r.EL)} ${L} exceeds the allowable El. ${f(allow)} ${L} that you entered.`));
 ck.push(HWD<=1.2?flag('pass',`HW/D = ${f(HWD)}. Many agencies limit HW/D for the design flood (values around 1.2–1.5 are common); check the limit your agency uses — this tool does not assume a TxDOT number.`)
  :flag('warn',`HW/D = ${f(HWD)} is high. Many agencies cap HW/D for the design flood (commonly in the 1.2–1.5 range); verify against your project criteria and consider a larger or additional barrel.`));
 const vh=US?15:4.5,vm=US?10:3,vlo=US?2.5:0.75;
 ck.push(r.Vout>vh?flag('fail',`Outlet velocity ${f(r.Vout)} ${V} is high — scour at the outlet is likely. Evaluate outlet protection / energy dissipation per FHWA HEC-14 (TxDOT HDM Ch. 8 discusses outlet velocity and protection). Threshold ${vh} ${V} is this tool's screening value.`)
  :r.Vout>vm?flag('warn',`Outlet velocity ${f(r.Vout)} ${V} is moderately high; compare with the natural channel velocity and check whether riprap or other outlet protection is needed (FHWA HEC-14).`)
  :flag('pass',`Outlet velocity ${f(r.Vout)} ${V} is moderate; still compare it with the downstream channel's natural velocity.`));
 ck.push(r.Vout<vlo?flag('warn',`Outlet velocity ${f(r.Vout)} ${V} is low — sediment may deposit in the barrel. A rule of thumb (not a TxDOT value) is to keep around ${vlo} ${V} or more at frequent flows; check at a low flow too.`)
  :flag('pass',`Velocity is high enough that sediment deposition at the design flow is unlikely (rule-of-thumb screen ≈ ${vlo} ${V}; check self-cleaning at frequent, smaller flows too).`));
 if(r.jump)ck.push(flag('warn',`Hydraulic jump inside barrel at ${f(r.jump.x,1)} ${L} — check the joints and the structure for turbulence and uplift.`));
 if(r.S<=0)ck.push(flag('warn','Zero or adverse barrel slope — sediment and ponding risk; results use outlet-control assumptions.'));
 // ---- narrative ----
 const nar=`This ${p.barrels>1?p.barrels+'-barrel ':''}${size} ${st('material').split(' (')[0].toLowerCase()} culvert, ${f(p.length,0)} ${L} long on a ${f(r.S*100)}% slope, has to pass a design flow of ${f(Qt)} ${Q}. `+
  (over?`The culvert cannot pass all of it below the road: about ${f(bal.Qc)} ${Q} goes through the barrel and ${f(bal.Qr)} ${Q} flows over the road. `:`All of the flow goes through the culvert. `)+
  `Water will pond upstream to elevation ${f(r.EL)} ${L}, ${f(r.HW)} ${L} above the inlet invert (${f(HWD)} times the barrel height). ${r.control} control governs${r.control==='Inlet'?', so the entrance shape limits capacity':', so barrel losses and tailwater limit capacity'}. `+
  `The barrel is ${r.steep?'steep, so flow is fast and shallow':'hydraulically mild'}, and water leaves the outlet about ${f(r.yout)} ${L} deep at ${f(r.Vout)} ${V}`+(r.jump?`, after a hydraulic jump ${f(r.jump.x,0)} ${L} into the barrel`:'')+`. `+
  (r.Vout>vm?'That exit velocity is high enough that outlet scour protection should be designed. ':'')+
  `Check the PASS/CHECK/FAIL items above against your project's design criteria before finalizing.`;
 const tw=p.twMode==='const'?`El. ${f(p.twElev)} ${L} (depth ${f(r.TW)} ${L} above outlet invert)`:'none / free outfall';
 const road=ro&&!ro.bad?`crest low point El. ${f(zc)} ${L}, top width ${f(ro.Lr)} ${L}, ${ro.surface}`:'not modelled';
 const row=(a,b)=>`<tr><th>${a}</th><td>${b}</td></tr>`;
 el.innerHTML=`<div class="rhead"><div><b>Culvert design report</b><br><small>Generated ${new Date().toLocaleString()} · Culvert Studio (FHWA HDS-5 methods, HY-8-style profile)</small></div><button type="button" class="rprint" onclick="window.print()">Print / Save PDF</button></div>
 <h4>1. Inputs</h4><table class="rt">${row('Culvert',`${p.barrels} × ${size}, ${st('material')}, Manning n = ${p.n}`)}${row('Inlet',`${i.name} (HDS-5 ${i.chart}); entrance loss K<sub>e</sub> = ${i.Ke}`)}
 ${row('Length / slope',`${f(p.length,1)} ${L}; S = ${f(r.S*100)}%`)}${row('Inverts',`inlet El. ${f(p.invIn)} ${L}, outlet El. ${f(p.invOut)} ${L}`)}${row('Design flow',`${f(Qt)} ${Q}`)}${row('Tailwater',tw)}${row('Roadway',road)}${isFinite(allow)?row('Allowable HW',`El. ${f(allow)} ${L}`):''}</table>
 <h4>2. Results</h4><table class="rt">${row('Headwater',`El. <b>${f(r.EL)} ${L}</b>; depth HW = ${f(r.HW)} ${L}; HW/D = ${f(HWD)}`)}${row('Control',`<b>${r.control} control</b> (inlet HW ${f(r.HWi)} ${L}, outlet HW ${f(r.HWo)} ${L})`)}
 ${row('Flow type',flowType)}${row('Critical / normal depth',`d<sub>c</sub> = ${f(r.dc)} ${L}; d<sub>n</sub> = ${isFinite(r.yn)?f(r.yn)+' '+L:'—'} → ${!isFinite(r.yn)?'mild/undefined':r.steep?'steep':'mild'} barrel`)}
 ${row('Outlet',`depth ${f(r.yout)} ${L}, velocity <b>${f(r.Vout)} ${V}</b>`)}${row('Hydraulic jump',r.jump?`${f(r.jump.x,1)} ${L} from inlet (${f(r.jump.y1)} → ${f(r.jump.y2)} ${L})`:r.jumpType==='drowned'?'at/above inlet (drowned)':'none in barrel')}
 ${row('Flow split',ro&&!ro.bad?(over?`culvert ${f(bal.Qc)} + road ${f(bal.Qr)} = ${f(Qt)} ${Q} (max depth over road ${f(bal.road.hmax)} ${L})`:`all ${f(Qt)} ${Q} through culvert; no overtopping`):'overtopping not modelled')}</table>
 <h4>Why ${r.control.toLowerCase()} control?</h4><p>${ctrlWhy}</p><p>${slope} ${jump}</p>
 <h4>3. Design checks</h4><ul class="rchk">${ck.join('')}</ul>
 <h4>4. Summary</h4><p class="rnar">${nar}</p>
 <p class="rnote"><small>References: TxDOT Hydraulic Design Manual, Chapter 8 (Culverts); FHWA HDS-5 <i>Hydraulic Design of Highway Culverts</i> (3rd ed., 2012); FHWA HEC-14 (energy dissipators); FHWA HY-8. The screening thresholds above are this tool's generic values, not TxDOT limits. Confirm design frequency, allowable headwater, freeboard and velocity criteria in the current TxDOT HDM and your district's requirements. This is a screening tool, not a sealed design.</small></p>`;}
window.drawProfile=function(p,r,allow,ro,bal){const o=prev.apply(this,arguments);try{report(p,r,allow,ro,bal);}catch(e){console.error(e);}return o;};
try{if(typeof run==="function")run();}catch(e){console.error(e);}
})();
