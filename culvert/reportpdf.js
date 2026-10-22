/* Client-side PDF of the Design Report (vendored jsPDF; no CDN). Works in iOS home-screen apps where window.print() is a no-op. */
(function(){
let img=null,imgKey='';
const W2A={'≤':'<=','≥':'>=','→':'->','←':'<-','≈':'~','₁':'1','₂':'2','ₙ':'n','ᶜ':'c','√':'sqrt','−':'-','\u00a0':' ','\u2009':' ','\u202f':' '};
function clean(t){return String(t||'').replace(/[\s\S]/g,ch=>{if(W2A[ch]!=null)return W2A[ch];const c=ch.charCodeAt(0);
  if(c<256||'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.includes(ch))return ch;return '?';}).replace(/[ \t]+/g,' ').trim();}
// Rasterise the desktop profile SVG once per render so the click handler stays synchronous (keeps iOS user activation for share()).
function prep(){const svg=document.getElementById('profile');if(!svg||!svg.innerHTML)return;const key=svg.innerHTML.length+':'+svg.innerHTML.slice(-200);if(key===imgKey)return;imgKey=key;
  const c=svg.cloneNode(true);c.setAttribute('xmlns','http://www.w3.org/2000/svg');c.setAttribute('width','900');c.setAttribute('height','340');
  c.querySelectorAll('.anim').forEach(e=>e.remove());
  c.insertAdjacentHTML('afterbegin','<style>text{font-family:Helvetica,Arial,sans-serif;font-size:13px}</style>');
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(c));const im=new Image();
  im.onload=()=>{try{const cv=document.createElement('canvas');cv.width=1800;cv.height=680;const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1800,680);g.drawImage(im,0,0,1800,680);img=cv.toDataURL('image/jpeg',0.9);}catch(e){console.warn('profile raster failed',e);img=null;}};
  im.onerror=()=>{img=null;};im.src=url;}
function build(){const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'pt',format:'letter'});
  const PW=612,PH=792,M=48,CW=PW-2*M;let y=M;
  const need=h=>{if(y+h>PH-M){doc.addPage();y=M;}};
  const text=(t,size,style,color,indent)=>{t=clean(t);if(!t)return;indent=indent||0;doc.setFont('helvetica',style||'normal');doc.setFontSize(size);doc.setTextColor(...(color||[20,20,20]));
    const lines=doc.splitTextToSize(t,CW-indent),lh=size*1.3;for(const l of lines){need(lh);doc.text(l,M+indent,y+size);y+=lh;}};
  const R=document.getElementById('report');if(!R)throw new Error('no report');
  text('Culvert design report',18,'bold',[31,78,121]);
  const sm=R.querySelector('.rhead small');if(sm)text(sm.innerText,9,'normal',[90,90,90]);y+=6;
  if(img){const h=CW*340/900;need(h+8);doc.addImage(img,'JPEG',M,y,CW,h);y+=h+10;}
  for(const el of R.children){if(el.classList.contains('rhead'))continue;
    const tag=el.tagName;
    if(tag==='H4'){y+=6;need(30);text(el.innerText,13,'bold',[31,78,121]);y+=2;}
    else if(tag==='TABLE'){for(const tr of el.querySelectorAll('tr')){const th=clean(tr.querySelector('th')?.innerText),td=clean(tr.querySelector('td')?.innerText);
        doc.setFontSize(10);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(td,CW-150),h=Math.max(1,lines.length)*13+4;need(h);
        doc.setFont('helvetica','bold');doc.setTextColor(60,60,60);doc.text(doc.splitTextToSize(th,140),M,y+10);
        doc.setFont('helvetica','normal');doc.setTextColor(20,20,20);doc.text(lines,M+150,y+10);
        doc.setDrawColor(225);doc.line(M,y+h-1,M+CW,y+h-1);y+=h;}}
    else if(tag==='UL'){for(const li of el.querySelectorAll('li')){const b=li.querySelector('.rb'),bt=b?b.innerText:'';const body=clean(li.innerText.replace(bt,''));
        const col={PASS:[46,125,50],CHECK:[214,138,0],FAIL:[192,57,43],INFO:[96,125,139]}[bt]||[96,125,139];
        doc.setFontSize(10);const lines=doc.splitTextToSize(body,CW-58),h=lines.length*13+6;need(h);
        doc.setFillColor(...col);doc.roundedRect(M,y+1,48,13,2,2,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(bt,M+24,y+10.5,{align:'center'});
        doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(20,20,20);doc.text(lines,M+58,y+11);y+=h;}}
    else if(tag==='P'){text(el.innerText,el.classList.contains('rnote')?8.5:10.5,'normal',el.classList.contains('rnote')?[90,90,90]:[20,20,20]);y+=5;}
  }
  const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(120);doc.text(`Culvert Studio · page ${i} of ${n}`,PW/2,PH-24,{align:'center'});}
  return doc;}
function deliver(doc){const blob=doc.output('blob'),name='culvert-design-report.pdf';
  let file=null;try{file=new File([blob],name,{type:'application/pdf'});}catch(e){}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){
    return navigator.share({files:[file],title:'Culvert design report'}).catch(e=>{if(e&&e.name!=='AbortError')fallback(blob,name);});}
  fallback(blob,name);}
function fallback(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  const box=document.querySelector('#report .rhead');if(box&&!box.querySelector('.rlink')){box.insertAdjacentHTML('beforeend',`<a class="rlink" href="${url}" target="_blank" rel="noopener">Open PDF</a>`);}
  setTimeout(()=>{},0);}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#report [data-act]');if(!b)return;e.preventDefault();
  if(b.dataset.act==='print'){window.print();return;}
  try{deliver(build());}catch(err){console.error(err);alert('Could not create PDF: '+err.message);}});
window.ReportPDF={prep,build,deliver};
prep();
})();
