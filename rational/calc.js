// Tc equations per TxDOT Hydraulic Design Manual, Ch. 4 Hydrology, Section 11 "Time of Concentration" (US customary units).
(function(g){
const SHEET_N={ 'Smooth surfaces (concrete, asphalt, gravel, bare soil)':0.011,'Fallow (no residue)':0.05,'Cultivated soils: residue ≤ 20%':0.06,'Cultivated soils: residue > 20%':0.17,'Grass: short grass prairie':0.15,'Grass: dense grasses':0.24,'Grass: Bermuda':0.41,'Range (natural)':0.13,'Woods: light underbrush':0.40,'Woods: dense underbrush':0.80};
const KERBY_N={'Pavement':0.02,'Smooth, bare, packed soil':0.10,'Poor grass, cultivated row crops, or moderately rough packed surfaces':0.20,'Pasture, average grass':0.40,'Deciduous forest':0.60,'Dense grass, coniferous forest, or deciduous forest with deep litter':0.80};
// Eq 4-17: t_sh (hr) = 0.007 (n L)^0.8 / (P2^0.5 S^0.4)
const sheet=(n,L,P2,S)=>0.007*Math.pow(n*L,0.8)/(Math.sqrt(P2)*Math.pow(S,0.4));
// Eq 4-18: t_sc (hr) = L / (3600 K S^0.5), K = 16.13 unpaved, 20.32 paved
const shallowK=p=>p?20.32:16.13;
const shallowV=(paved,S)=>shallowK(paved)*Math.sqrt(S);
const shallow=(paved,L,S)=>L/(3600*shallowV(paved,S));
// Eq 4-19: t_ch (hr) = L / (3600 * (1.486/n) R^(2/3) S^0.5), R = a/pw
const chanV=(n,A,P,S)=>1.486/n*Math.pow(A/P,2/3)*Math.sqrt(S);
const channel=(n,A,P,L,S)=>L/(3600*chanV(n,A,P,S));
// Eq 4-14 Kerby: t_ov (min) = 0.828 (L N)^0.467 S^-0.235 ; Eq 4-15 Kirpich: t_ch (min) = 0.0078 L^0.77 S^-0.385
const kerby=(L,N,S)=>0.828*Math.pow(L*N,0.467)*Math.pow(S,-0.235);
const kirpich=(L,S)=>0.0078*Math.pow(L,0.77)*Math.pow(S,-0.385);
const lowSlope=S=>S+0.0005; // Cleveland et al. 2012 adjustment
const TC_MIN=10;
// Eq 4-21: i (in/hr) = b / (tc + d)^e, tc in minutes
const intensity=(k,tc)=>k.b/Math.pow(tc+k.d,k.e); // Section 12 Rational Method, Rainfall Intensity: minimum tc 10 min
g.Tc={SHEET_N,KERBY_N,sheet,shallow,shallowV,shallowK,chanV,channel,kerby,kirpich,lowSlope,TC_MIN,intensity};
})(typeof window!=='undefined'?window:globalThis);
