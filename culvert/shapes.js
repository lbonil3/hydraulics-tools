/* Barrel shapes from HY-8 8.0 (ShapeDB): catalog lookups, sections for calc.js, outline paths for drawings. */
(function(){const C=window.Culvert,DB=window.HY8DB||{};
const LIST=[['circular','Circular pipe'],['box','Concrete box (rectangular)'],['ellip','Elliptical (horizontal ellipse)'],['parch','Pipe arch'],
 ['arch','Arch, open bottom (corrugated metal)'],['lparch','Low-profile arch (open bottom)'],['hparch','High-profile arch (open bottom)'],
 ['mbox','Metal box (open bottom)'],['coba','Concrete open-bottom arch (precast 3-sided)'],['sdbox','South Dakota concrete box'],['user','User-defined shape (x, y points)']];
const isHY=k=>k!=='circular'&&k!=='box'&&!!DB[k];
const catalog=k=>k!=='sdbox'&&k!=='user'; // shapes whose sizes come from the HY-8 catalog
const mats=k=>isHY(k)?DB[k].mats:[];
function mat(k,mv){const m=mats(k);return m[+String(mv||'m0').slice(1)]||m[0];}
function sizes(k,mv){const m=mat(k,mv);return m?m.sizes:[];}
function size(k,mv,sv){const s=sizes(k,mv);return s[+String(sv||'s0').slice(1)]||s[0];}
function inlets(k,mv){const m=mat(k,mv);return m?m.inlets.map((i,j)=>({id:'h'+j,name:i.name,Ke:i.KE,obj:i})):[];}
// Resolve an inlet for analysis (Con/Span-type arches pick the 2:1 or 4:1 curve by span:rise, HY-8 §5.2.1.2.1)
function inletFor(k,mv,iv,span,rise){const L=inlets(k,mv),x=L.find(i=>i.id===iv)||L[0];if(!x)return null;let o=x.obj;
 if(o.t==='ratio'){const r=span/rise;o=Object.assign({xA:true,ratioUsed:r<=3?'2:1':'4:1'},o.byRatio[r<=3?'2':'4']);}
 return Object.assign({id:x.id,name:x.name,chart:o.t==='interp'?'HY-8 8.0 / HDS-5 Chart 52B table':'HY-8 8.0 polynomial',Ke:o.KE},o);}
function parsePoly(t){return String(t||'').split(/\n/).map(l=>l.split(/[,;\s]+/).filter(Boolean).map(Number)).filter(q=>q.length>=2&&q.every(isFinite)).map(q=>[q[0],q[1]]);}
const cache=new Map();
function section(k,o){// o:{mat,size,units,n,nb,span,rise,poly}
 const key=JSON.stringify([k,o]);if(cache.has(key))return cache.get(key);let s=null;const sc=o.units==='SI'?0.3048:1;
 if(k==='sdbox'){if(o.span>0&&o.rise>0)s=C.rectSection(o.span,o.rise,o.n);}
 else if(k==='user'){const P=parsePoly(o.poly);if(P.length>=3){s=C.polySection(P,{nWall:o.n});if(!(s.Afull>0))s=null;}}
 else{const z=size(k,o.mat,o.size);if(z){s=C.sectionFromHY8(z.g,{scale:sc,nWall:o.n,nBed:o.nb,open:DB[k].open,rise:z.r*sc});s.spanNom=z.s*sc;s.riseNom=z.r*sc;}}
 if(s){s.kind=k;}
 if(cache.size>60)cache.clear();cache.set(key,s);return s;}
// outline path of a section scaled to px (y up -> svg down); x0,yb = left, bottom in px
function path(s,sc,x0,yb){return 'M'+s.poly.map(p=>`${(x0+p[0]*sc-Math.min(...s.poly.map(q=>q[0]))*sc).toFixed(1)},${(yb-p[1]*sc).toFixed(1)}`).join('L')+'Z';}
function label(k){const e=LIST.find(x=>x[0]===k);return e?e[1]:k;}
window.Shapes={LIST,isHY,catalog,mats,mat,sizes,size,inlets,inletFor,section,path,label,parsePoly,DB};
})();
