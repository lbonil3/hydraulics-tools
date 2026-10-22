/* Phone flow-path diagram: vertical, full width, labels beside each segment. Presentation only. */
(function(){const MQ=matchMedia('(max-width:700px)'),orig=window.draw,svgD=document.getElementById('path');
const m=document.createElementNS('http://www.w3.org/2000/svg','svg');m.id='mpath';m.dataset.nofit=1;svgD.after(m);let last=null;
function phone(R){const n=Math.max(R.rows.length,1),rh=54,H=40+n*rh+30,W=340,tot=R.tc||1;m.setAttribute('viewBox',`0 0 ${W} ${H}`);
 let s=`<text x="10" y="20" font-size="13" font-weight="600">● Remote point</text>`,y=32;
 R.rows.forEach((r,i)=>{const y2=y+rh,w=r.t.match(/channel|kirpich/)?10:r.t==='shallow'?6:3;
  s+=`<line x1="24" y1="${y}" x2="24" y2="${y2}" stroke="${COL[r.t]}" stroke-width="${w}" stroke-linecap="round"/><circle cx="24" cy="${y2}" r="4" fill="#1d2733"/>
  <text x="44" y="${y+22}" font-size="14" font-weight="700">${i+1}. ${NAME[r.t]||r.t}</text>
  <text x="44" y="${y+40}" font-size="13" fill="#556">${r.L} ft · ${f(r.V)} ft/s</text>
  <text x="${W-8}" y="${y+22}" font-size="15" font-weight="700" text-anchor="end">${f(r.min,1)} min</text>
  <rect x="${W-88}" y="${y+31}" width="80" height="7" rx="3" fill="#e3e8ef"/><rect x="${W-88}" y="${y+31}" width="${(80*r.min/tot).toFixed(1)}" height="7" rx="3" fill="${COL[r.t]}"/>`;y=y2;});
 s+=`<text x="10" y="${y+24}" font-size="13" font-weight="600">▼ Design point · Tc ${f(R.tc,1)} min</text>`;m.innerHTML=s;}
window.draw=function(R){orig(R);last=R;phone(R);};MQ.addEventListener("change",()=>last&&phone(last));render();})();
