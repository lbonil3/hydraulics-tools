/* Plan view of the street + inlets for the Inlet spacing tab (presentation only). */
(function(){
const card=document.createElement('div');card.className='card';card.id='plancard';card.dataset.pane='results';
card.innerHTML=`<h3>Plan view <small>(flow left → right; tap an inlet for its detail)</small></h3><svg id="plansvg" viewBox="0 0 360 236" data-nofit="1"></svg>
<h3 id="detT" style="margin-top:8px">Inlet detail</h3><svg id="detsvg" viewBox="0 0 360 200" data-nofit="1"></svg><div class="lvnote" id="plannote"></div>`;
const tableCard=document.getElementById('table').closest('.card');tableCard.before(card);
let sel=0;const NAMES={curb:'Curb opening',grate:'Grate',combo:'Combination'};
// grate bar pattern inside rect (x,y,w,h); flow along x
function pattern(t,x,y,w,h,detail){let s='';const L=(x1,y1,x2,y2,c='#444',sw=detail?1:0.7)=>`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${sw}"/>`;
 const nb=detail?(t==='P-1-1/8'?18:12):(t==='P-1-1/8'?6:4);
 if(/^P-1/.test(t)){for(let k=1;k<nb;k++){const yy=y+h*k/nb;s+=L(x,yy,x+w,yy);} if(t==='P-1-7/8-4'){const nc=detail?8:3;for(let k=1;k<nc;k++)s+=L(x+w*k/nc,y,x+w*k/nc,y+h,'#888',0.6);}}
 else if(t==='Reticuline'){const n=detail?10:4;for(let k=-n;k<=2*n;k++){const xx=x+w*k/n;s+=L(xx,y,xx+h,y+h,'#444',0.6)+L(xx+h,y,xx,y+h,'#444',0.6);}}
 else if(t==='Curved vane'){const n=detail?9:4,m=detail?5:2;for(let i=0;i<n;i++)for(let j=0;j<m;j++){const cx=x+w*(i+0.5)/n,cy=y+h*(j+0.5)/m,r=Math.min(w/n,h/m)*0.4;s+=`<path d="M${(cx-r).toFixed(1)} ${(cy+r).toFixed(1)} Q${cx.toFixed(1)} ${(cy-r).toFixed(1)} ${(cx+r).toFixed(1)} ${(cy+r).toFixed(1)}" fill="none" stroke="#444" stroke-width="0.7"/>`;}}
 else{const n=detail?14:5;for(let k=0;k<=n;k++){const xx=x+w*k/n;s+=L(xx,y,xx-w/n*0.8,y+h);}}
 return `<clipPath id="cp${(x*10|0)}${(y*10|0)}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#cp${(x*10|0)}${(y*10|0)})">${s}</g>`;}
// inlet symbol: xb = downstream end px, kx px/ft along curb, ky px/ft across, yc = curb line
function sym(s,xb,yc,kx,ky,detail){const t=s.it,a=s.ca||0;let h='';const lc=s.cl*kx,lg=s.gl*kx,wg=s.gw*ky,wd=s.cw*ky,tr=Math.max(detail?8:3,lc*0.12);
 const curb=(xa,xe)=>{h+=a>0?`<polygon points="${xa-tr},${yc} ${xa},${yc+wd} ${xe},${yc+wd} ${xe+tr},${yc}" fill="#f3e2b3" stroke="#9a6b00" stroke-dasharray="3 2" stroke-width="${detail?1.2:0.8}"/>`:'';
  h+=`<rect x="${xa}" y="${yc-(detail?14:6)}" width="${xe-xa}" height="${detail?14:6}" fill="url(#hatch)" stroke="#333" stroke-width="0.8"/><line x1="${xa}" y1="${yc}" x2="${xe}" y2="${yc}" stroke="#c0392b" stroke-width="${detail?4:3}"/>`;};
 const grate=(xa,xe)=>{h+=`<rect x="${xa}" y="${yc}" width="${xe-xa}" height="${wg}" fill="#ddd" stroke="#222" stroke-width="${detail?1.4:1}"/>`+pattern(s.gtype,xa,yc,xe-xa,wg,detail);};
 if(t==='curb')curb(xb-lc,xb);else if(t==='grate')grate(xb-lg,xb);else{curb(xb-Math.max(lc,lg),xb);grate(xb-lg,xb);}
 return h;}
const label=s=>(s.stdName?s.stdName+' — ':'')+(s.it==='curb'?`Curb ${s.cl} ft${s.ca>0?`, ${s.ca} in depr.`:''}`:s.it==='grate'?`${s.gtype} ${s.gw}×${s.gl} ft`:`Combo: ${s.gtype} ${s.gw}×${s.gl} + curb ${s.cl} ft${s.cl>s.gl?' (sweeper)':''}`);
const defs=`<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#777" stroke-width="1"/></pattern><marker id="fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#1f77b4"/></marker></defs>`;
function plan(){const X=window.SPLAST;if(!X)return;const {s,p,ch,Tal,Wd,ac}=X,rows=ch.filter(c=>!c.fail);if(!rows.length){$('#plansvg').innerHTML='';return;}
 const Ls=rows.map(c=>ac?c.L*43560/Math.max(Wd,1):c.L),Lt=Ls.reduce((a,b)=>a+b,0)||1,x0=18,x1=342,kx=(x1-x0)/Lt;
 const maxT=Math.max(...rows.map(c=>c.T),Tal),Wsh=Math.max(Wd,maxT*1.15,12),yc=34,ky=96/Wsh,yE=yc+Wd*ky;
 let h=defs+`<rect x="${x0}" y="${yc}" width="${x1-x0}" height="${(Wd*ky).toFixed(1)}" fill="#e9ecef"/><line x1="${x0}" y1="${yE}" x2="${x1}" y2="${yE}" stroke="#999" stroke-dasharray="8 6"/>
 <rect x="${x0}" y="${yc-12}" width="${x1-x0}" height="12" fill="#cfd6dd"/><line x1="${x0}" y1="${yc}" x2="${x1}" y2="${yc}" stroke="#333" stroke-width="2"/><text x="${x0+2}" y="${yc-3}" font-size="9">curb</text><text x="${x1-2}" y="${yE-3}" font-size="9" text-anchor="end">${s.crown==='half'&&!ac?'crown':'edge'} (W = ${f(Wd,0)} ft)</text>`;
 // spread along each reach
 let xs=x0;rows.forEach((c,k)=>{const L=Ls[k],pts=[];for(let j=0;j<=20;j++){const q=c.Qco+(c.Q-c.Qco)*j/20,T=q>1e-6?DR.gutterT(q,p.g):0;pts.push([xs+L*kx*j/20,yc+T*ky]);}
  h+=`<polygon points="${xs},${yc} ${pts.map(q=>q.map(v=>v.toFixed(1)).join(',')).join(' ')} ${xs+L*kx},${yc}" fill="#9cc9f0" opacity=".85"/>`;xs+=L*kx;});
 h+=`<line x1="${x0}" x2="${x1}" y1="${yc+Tal*ky}" y2="${yc+Tal*ky}" stroke="#1f77b4" stroke-dasharray="4 3"/><text x="${x1-2}" y="${yc+Tal*ky+10}" font-size="9" text-anchor="end" fill="#1f77b4">allowable spread ${f(Tal,1)} ft</text>
 <line x1="${x0+6}" y1="${yc+Wd*ky*0.75}" x2="${x0+46}" y2="${yc+Wd*ky*0.75}" stroke="#1f77b4" stroke-width="1.5" marker-end="url(#fa)"/>`;
 // inlets (symbol exaggerated so it is visible; detail below is to scale)
 xs=x0;rows.forEach((c,k)=>{xs+=Ls[k]*kx;const ex=Math.max(1,14/(Math.max(s.cl,s.gl)*kx));const on=k===sel;
  h+=`<g data-i="${k}" style="cursor:pointer">${on?`<rect x="${xs-Math.max(s.cl,s.gl)*kx*ex-4}" y="${yc-10}" width="${Math.max(s.cl,s.gl)*kx*ex+8}" height="${Math.max(s.gw,s.cw)*ky+14}" fill="none" stroke="#d4a017" stroke-width="2" rx="3"/>`:''}${sym(s,xs,yc,kx*ex,ky*Math.max(1,10/(Math.max(s.gw,s.cw)*ky)),false)}
  <text x="${xs}" y="${yE+12+(k%2)*11}" font-size="10" text-anchor="end" font-weight="${on?700:400}">${k+1}: ${f(c.Qb,2)} cfs bypass</text><rect x="${xs-30}" y="${yc-12}" width="34" height="${yE-yc+30}" fill="transparent"/></g>`;});
 h+=`<text x="${x0}" y="${yE+38}" font-size="10">Total ${ac?f(rows.reduce((a,c)=>a+c.A,0),3)+' ac':f(Lt,0)+' ft'} · ${rows.length} inlet${rows.length>1?'s':''} · symbols enlarged</text>`;
 // legend
 const ly=yE+50,lg=(t,lx,txt)=>{const ss=Object.assign({},s,{it:t,cl:4,gl:t==='combo'?2:3,gw:1.4,cw:1.4,ca:t==='grate'?0:1});return sym(ss,lx+30,ly,5,7,false)+`<text x="${lx+34}" y="${ly+8}" font-size="10">${txt}</text>`;};
 h+=lg('curb',x0,'Curb opening')+lg('grate',x0+110,'Grate')+lg('combo',x0+210,'Combination');
 $('#plansvg').setAttribute('viewBox',`0 0 360 ${ly+22}`);$('#plansvg').innerHTML=h;
 detail(rows[Math.min(sel,rows.length-1)],Math.min(sel,rows.length-1));}
function detail(c,k){const X=window.SPLAST,s=X.s,p=X.p;$('#detT').textContent=`Inlet ${k+1} detail — ${label(s)}`;
 const Lx=Math.max(s.cl,s.gl),span=Lx*1.35+2,kx=200/span,ky=Math.min(kx,70/Math.max(s.gw,s.cw,2)),yc=40,xb=10+kx*(span-(span-Lx)/2);
 let h=defs+`<rect x="6" y="${yc}" width="214" height="${(Math.max(s.gw,s.cw)+1.5)*ky}" fill="#e9ecef"/><rect x="6" y="${yc-16}" width="214" height="16" fill="#cfd6dd"/><line x1="6" y1="${yc}" x2="220" y2="${yc}" stroke="#333" stroke-width="2"/>`;
 const Tpx=Math.min(c.T,Math.max(s.gw,s.cw)+1.5)*ky;h+=`<rect x="6" y="${yc}" width="${xb-6}" height="${Tpx}" fill="#9cc9f0" opacity=".5"/>`;
 h+=sym(s,xb,yc,kx,ky,true);
 const dl=(xa,xe,y,t)=>`<line x1="${xa}" y1="${y}" x2="${xe}" y2="${y}" stroke="#1d2733" stroke-width="0.8" marker-start="url(#fa)" marker-end="url(#fa)"/><text x="${(xa+xe)/2}" y="${y-3}" font-size="10" text-anchor="middle">${t}</text>`;
 if(s.it!=='grate')h+=dl(xb-Math.max(s.cl,s.it==='combo'?s.gl:0)*kx,xb,yc-22,`L = ${s.cl} ft${s.it==='combo'&&s.cl>s.gl?` (sweeper ${f(s.cl-s.gl,1)} ft upstream)`:''}`);
 if(s.it!=='curb')h+=`<text x="${xb-s.gl*kx/2}" y="${yc+s.gw*ky+12}" font-size="10" text-anchor="middle">${s.gtype} ${s.gw} × ${s.gl} ft</text>`;
 if(s.it!=='grate'&&s.ca>0)h+=`<text x="${xb+4}" y="${yc+s.cw*ky-2}" font-size="9" fill="#9a6b00">depression ${s.ca} in × ${s.cw} ft</text>`;
 h+=`<text x="10" y="${yc+(Math.max(s.gw,s.cw)+1.5)*ky+28}" font-size="10">Plan (to scale) · flow →</text>`;
 // cross-section at inlet (vertical exaggerated)
 const a=(s.ca||0)/12*(s.it==='grate'?0:1),Sx=p.g.Sx,T=c.T,cx=350,hs=100/Math.max(T*1.1,s.cw+1,4),dmax=T*Sx+a,vv=60/Math.max(dmax,0.1),yi=150,el=x=>x*Sx+(x<s.cw&&a>0?a*(x/s.cw):a>0?a:0);
 const xmax=Math.max(T*1.1,s.cw+1,4),pts=[];for(let j=0;j<=30;j++){const x=xmax*j/30;pts.push([cx-x*hs,yi-el(x)*vv]);}
 const wl=yi-(a+T*Sx)*vv;const wet=pts.filter(q=>q[1]>=wl-0.01);
 h+=`<polygon points="${cx},${wl} ${wet.map(q=>q.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="#9cc9f0"/><polyline points="${cx},${yi-dmax*vv-24} ${pts.map(q=>q.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#333" stroke-width="2"/>
 <text x="${cx-4}" y="${wl-4}" font-size="9" text-anchor="end">T = ${f(T,1)} ft · d = ${f(c.d*12,1)} in</text><text x="${cx}" y="${yi+16}" font-size="10" text-anchor="end">Section at inlet (vert. exag.)</text>`;
 h+=`<text x="10" y="${yi+40}" font-size="10">Q ${f(c.Q,2)} cfs · Qi ${f(c.Qi,2)} cfs · bypass ${f(c.Qb,2)} cfs · ${c.ok?'✓ meets criteria':'✗ check criteria'}</text>`;
 $('#detsvg').innerHTML=h;
 $('#plannote').innerHTML='Per-inlet types: the chain uses the same inlet for every location (calculations assume identical inlets). Slotted drains are not part of the on-grade inlet calculation, so they are not drawn.';}
$('#plansvg').addEventListener('click',e=>{const g=e.target.closest('[data-i]');if(g){sel=+g.dataset.i;plan();}});
const prev=window.render;window.render=function(){prev.apply(this,arguments);card.style.display=mode==='space'?'':'none';if(mode==='space')try{plan();}catch(err){console.warn('plan',err);}};
window.render();
})();
