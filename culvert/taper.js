/* Phase 6: tapered inlet results (HDS-5 3rd ed. Sec. 3.4, Appendix A Form 2 / Table A.1) in the report and summary. */
(function(){const prev=window.drawProfile,f=(x,d=2)=>isFinite(x)?(+x).toFixed(d):'—';
function render(p,r){const t=r.taper;const R=document.getElementById('report');if(!t||!R||!R.innerHTML||R.querySelector('.rtap'))return;const L=r.US?'ft':'m';
 const h=`<h4 class="rtap">Tapered inlet (HDS-5 §3.4)</h4><table class="rt"><tr><th>Type</th><td>${t.type==='slope'?'Slope-tapered, vertical face':'Side-tapered'}; ${t.edge==='more'?'more':'less'} favorable face edges; Ke = 0.2</td></tr>
 <tr><th>Geometry</th><td>Face ${f(t.Bf)} × ${f(t.E)} ${L}, taper ${f(t.taper,1)}:1, L1 = ${f(t.L1)} ${L}${t.type==='slope'?`, L2 = ${f(t.L2)} ${L}, L3 = ${f(t.L3)} ${L}`:''}; face invert ${f(t.faceRise)} ${L} above the throat invert</td></tr>
 <tr><th>Throat control</th><td>HW<sub>t</sub> = ${f(t.HWt)} ${L} (El. ${f(p.invIn+t.HWt)} ${L}), Q/AD<sup>0.5</sup> = ${f(t.xt)}</td></tr>
 <tr><th>Face control</th><td>HW<sub>f</sub> = ${f(t.HWf)} ${L} above the face invert (El. ${f(p.invIn+t.HWfT)} ${L}), Q/AD<sup>0.5</sup> = ${f(t.xf)}</td></tr>
 <tr><th>Governs</th><td><b>${t.ctrl==='face'?'Face — widen the face until the throat controls (HDS-5: "The tapered inlet throat should be designed to be the primary control section")':'Throat'}</b></td></tr></table>
 <p class="rnote">FHWA HDS-5 (3rd ed., 2012) Sec. 3.4 and Appendix A Eq. A.2/A.3 (Form 2) with Table A.1 constants for rectangular concrete tapered inlets; transition between Q/AD<sup>0.5</sup> 3.5 and 4.0 interpolated. Crest control (depressed side-tapered or mitered slope-tapered) is not computed.</p>`;
 const an=[...R.querySelectorAll('h4')].find(x=>/Design checks/.test(x.textContent));if(an)an.insertAdjacentHTML('beforebegin',h);else R.insertAdjacentHTML('beforeend',h);if(window.ReportPDF)ReportPDF.prep();}
window.drawProfile=function(p,r,...x){const o=prev?prev.call(this,p,r,...x):undefined;try{render(p,r);}catch(e){console.warn('taper',e);}return o;};
if(typeof window.run==='function')try{window.run();}catch(e){}})();
