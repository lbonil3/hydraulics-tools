/* SWP3 Builder: engineering design calculations (pure functions, US customary units).
   Screening / design aid for engineer review. NOT a sealed design.
   Every function returns its inputs, the equation used, intermediates and a source key (see SwpData.SOURCES) so a calc sheet can show the work.
   Basis precedence: TxDOT first, TCEQ TXR150000 as the regulatory floor, then named secondary sources (NCTCOG iSWM, HEC-15, USDA AH-703), then "Assumed". */
(function (root) {
  'use strict';
  var GPM_PER_CFS = 448.831;           // 1 cfs = 448.831 gal/min (unit conversion)
  var G = 32.2;                         // ft/s^2
  var AC_FT2 = 43560;
  function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function r(v, d) { var m = Math.pow(10, d == null ? 2 : d); return Math.round(v * m) / m; }
  function line(label, expr, value, unit) { return { label: label, expr: expr, value: value, unit: unit || '' }; }
  var YRS = [2, 5, 10, 25, 50, 100];

  /* ---------------- 1. Runoff ---------------- */
  // TxDOT EBDLKUP-2019 coefficients (window.IDF_PDS rows: [county, zone, [e,b,d] x 2,5,10,25,50,100 yr]); i = b/(tc+d)^e (HDM Ch.4 Eq 4-21).
  function idfLookup(rows, county, zone, yr) {
    var k = YRS.indexOf(yr); if (k < 0) return null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === county && (zone == null || rows[i][1] === zone)) { var t = rows[i][2 + k]; return { county: rows[i][0], zone: rows[i][1], yr: yr, e: t[0], b: t[1], d: t[2] }; }
    }
    return null;
  }
  function idfZones(rows, county) { var z = []; rows.forEach(function (x) { if (x[0] === county) z.push(x[1]); }); return z; }
  function idfCounties(rows) { var s = {}, o = []; rows.forEach(function (x) { if (!s[x[0]]) { s[x[0]] = 1; o.push(x[0]); } }); return o; }
  // HDM Ch.4 Sec.12 rational method: minimum tc 10 min; Q = C i A (acres, in/hr -> cfs, Z = 1 in English units).
  function rational(o) {
    var C = num(o.C), A = num(o.A), tc = num(o.tc), i = num(o.iOverride);
    var steps = [];
    var tcUsed = tc == null ? 10 : Math.max(tc, 10);
    if (i == null) {
      if (!o.k) return { error: 'Choose a county/zone and storm, or enter an intensity.' };
      i = o.k.b / Math.pow(tcUsed + o.k.d, o.k.e);
      steps.push(line('Intensity (HDM Eq 4-21)', 'i = b / (tc + d)^e = ' + r(o.k.b, 3) + ' / (' + r(tcUsed, 2) + ' + ' + r(o.k.d, 3) + ')^' + r(o.k.e, 4), r(i, 3), 'in/hr'));
    } else steps.push(line('Intensity (user override)', 'i entered', r(i, 3), 'in/hr'));
    var Q = C * i * A;
    steps.push(line('Peak flow (HDM Ch.4 Sec.12, rational)', 'Q = C i A = ' + C + ' x ' + r(i, 3) + ' x ' + A, r(Q, 2), 'cfs'));
    var warn = [];
    if (A > 200) warn.push('Drainage area over about 200 acres: the rational method is outside its usual range (HDM Ch.4 Sec.12).');
    if (tc != null && tc < 10) warn.push('Tc below 10 min; 10 min is used (HDM minimum).');
    return { C: C, A: A, tc: tc, tcUsed: tcUsed, i: i, Q: Q, steps: steps, warn: warn, src: 'HDM_HYD', eq: 'Q = C i A  (i = b/(tc+d)^e, tc >= 10 min)' };
  }
  // HDM Ch.4 Eq 4-23: composite C = sum(C_i A_i) / sum(A_i)
  function compositeC(parts) {
    var sa = 0, sc = 0; parts.forEach(function (p) { sa += p.a; sc += p.c * p.a; });
    return sa > 0 ? { C: sc / sa, area: sa, eq: 'C = sum(Ci Ai) / sum(Ai)', src: 'HDM_HYD' } : null;
  }
  // NRCS Curve Number runoff (HDM Ch.4 Sec.13): S = 1000/CN - 10, Ia = 0.2 S, Q = (P - Ia)^2 / (P - Ia + S) = (P-0.2S)^2/(P+0.8S)
  function cnRunoff(o) {
    var P = num(o.P), CN = num(o.CN), A = num(o.A);
    if (P == null || CN == null || CN <= 0 || CN > 100) return { error: 'Enter rainfall depth P (in) and a Curve Number.' };
    var S = 1000 / CN - 10, Ia = 0.2 * S, Qin = P > Ia ? Math.pow(P - Ia, 2) / (P + 0.8 * S) : 0;
    var res = { P: P, CN: CN, S: S, Ia: Ia, Qin: Qin, src: 'HDM_HYD', eq: 'S = 1000/CN - 10;  Ia = 0.2 S;  Q = (P - Ia)^2 / (P + 0.8 S)', steps: [
      line('Potential retention', 'S = 1000/' + CN + ' - 10', r(S, 3), 'in'), line('Initial abstraction', 'Ia = 0.2 x ' + r(S, 3), r(Ia, 3), 'in'),
      line('Runoff depth', 'Q = (' + P + ' - ' + r(Ia, 3) + ')^2 / (' + P + ' + 0.8 x ' + r(S, 3) + ')', r(Qin, 3), 'in')] };
    if (A != null) { res.A = A; res.volCf = Qin / 12 * A * AC_FT2; res.steps.push(line('Runoff volume', 'V = Q/12 x A x 43,560 = ' + r(Qin, 3) + '/12 x ' + A + ' x 43,560', r(res.volCf, 0), 'cu ft')); }
    return res;
  }
  // HDM Table 4-18 "newly graded areas" CN by hydrologic soil group (verified in HDM Ch.4 Sec.13)
  var CN_NEW_GRADED = { A: 77, B: 86, C: 91, D: 94 };

  /* ---------------- 2. Sediment basin / trap ---------------- */
  // Required storage. Permit: TCEQ TXR150000 Part III.F.2(c)i(A): 2-yr 24-hr runoff from each disturbed acre drained, or >= 3,600 cu ft per acre drained if it cannot be calculated.
  // TxDOT (SWP3 guidance Summary Sheet 2.2.1): 1,800 cu ft/ac (traps, basins up to 10 ac), 3,600 cu ft/ac above 10 ac; trap drainage <= 5 ac; basin drainage <= 100 ac.
  // iSWM 3.9: 2-yr 24-hr runoff volume + at least 1,000 cu ft sediment storage (informational).
  function basinStorage(o) {
    var A = num(o.A), dist = num(o.disturbed), P2 = num(o.P2), CN = num(o.CN);
    if (A == null) return { error: 'Enter the drainage area to the basin.' };
    if (dist == null) dist = A;
    var items = [], steps = [];
    var calc = null;
    if (P2 != null && CN != null) { calc = cnRunoff({ P: P2, CN: CN, A: dist }); }
    var permit = { id: 'TCEQ', label: 'TCEQ permit (2-yr, 24-hr runoff, or 3,600 cu ft/ac)', src: 'TXR', applies: A >= 10 || !!o.permitBasin };
    if (calc && !calc.error) { permit.cf = calc.volCf; permit.how = 'Calculated 2-yr 24-hr runoff: V = Q/12 x A x 43,560 = ' + r(calc.Qin, 3) + '/12 x ' + dist + ' x 43,560'; }
    else { permit.cf = 3600 * A; permit.how = 'Default 3,600 cu ft/acre x ' + A + ' ac drained (used when rainfall data or a calculation is not available)'; }
    items.push(permit);
    if (calc && !calc.error) items.push({ id: 'TCEQ_DEF', label: 'Permit default value for comparison (3,600 cu ft/ac)', src: 'TXR', cf: 3600 * A, how: '3,600 x ' + A, applies: false, ref: true });
    var perAc = A > 10 ? 3600 : 1800;
    items.push({ id: 'TXDOT', label: 'TxDOT guidance (' + (A > 10 ? '3,600' : '1,800') + ' cu ft/ac)', src: 'TXD_S21', cf: perAc * A, how: perAc + ' x ' + A + ' ac', applies: true });
    if (calc && !calc.error) items.push({ id: 'ISWM', label: 'iSWM 3.9 (2-yr runoff + 1,000 cu ft sediment)', src: 'ISWM', cf: calc.volCf + 1000, how: r(calc.volCf, 0) + ' + 1,000', applies: !!o.useISWM, ref: !o.useISWM });
    var req = 0, gov = null;
    items.forEach(function (it) { if (it.applies && it.cf > req) { req = it.cf; gov = it; } });
    var flags = [];
    var tx = items.filter(function (i) { return i.id === 'TXDOT'; })[0];
    if (permit.applies && tx && tx.cf < permit.cf - 1) flags.push('The permit value (' + Math.round(permit.cf) + ' cu ft) is larger than the TxDOT guidance value (' + Math.round(tx.cf) + ' cu ft). The permit is the floor, so it governs.');
    if (!permit.applies) flags.push('Under 10 acres drained: the permit does not require a basin, but if you use one as the alternative control it must hold the permit value (Part III.F.2(c)ii(B)).');
    if (A <= 5) flags.push('Within the TxDOT sediment-trap limit (5 acres). If a trap is used as the permit control, size it to the permit value, not 1,800 cu ft/ac.');
    if (A > 5 && A <= 100) flags.push('Over 5 acres: TxDOT traps are limited to 5 acres drained; use a basin (limit 100 acres drained) or several traps.');
    if (A > 100) flags.push('Over the TxDOT 100-acre basin drainage guideline: split into multiple basins.');
    return { A: A, disturbed: dist, calc: calc, items: items, requiredCf: req, governs: gov, flags: flags, src: gov ? gov.src : 'TXR', eq: 'Required = max(applicable criteria)', permitFloorCf: permit.applies ? permit.cf : null };
  }
  // Frustum storage with rectangular bottom Lb x Wb, side slope Z (H:V), depth D: V = Lb Wb D + (Lb + Wb) Z D^2 + (4/3) Z^2 D^3   (exact for a rectangular frustum)
  function frustumVol(Lb, Wb, Z, D) { return Lb * Wb * D + (Lb + Wb) * Z * D * D + 4 / 3 * Z * Z * D * D * D; }
  function frustumDepthForVol(Lb, Wb, Z, V) { var lo = 0, hi = 60; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (frustumVol(Lb, Wb, Z, m) < V) lo = m; else hi = m; } return (lo + hi) / 2; }
  // Dimension solver: water-surface (top) length : width ratio fixed (default 4:1; iSWM 3.9 Eq 3.3 uses effective width We = A/L, which equals Wt for a rectangle),
  // storage depth D and side slope Z. Wb = Wt - 2 Z D, Lb = rho Wt - 2 Z D. Solve Wt by bisection on V = Lb Wb D + (Lb+Wb) Z D^2 + 4/3 Z^2 D^3.
  function basinDims(o) {
    var V = num(o.V), D = num(o.D), Z = num(o.Z), rho = num(o.ratio) || 4, A = num(o.A), fb = num(o.freeboard);
    if (V == null || D == null || Z == null || D <= 0 || V <= 0) return { error: 'Enter storage volume, storage depth and side slope.' };
    if (fb == null) fb = 1;
    var lo = 2 * Z * D + 1e-6, hi = 2000;
    function vol(Wt) { return frustumVol(rho * Wt - 2 * Z * D, Wt - 2 * Z * D, Z, D); }
    if (vol(hi) < V) return { error: 'Volume is too large for these dimensions; increase depth or split into two basins.' };
    for (var i = 0; i < 100; i++) { var m = (lo + hi) / 2; if (vol(m) < V) lo = m; else hi = m; }
    var Wt = (lo + hi) / 2, Lt = rho * Wt, Wb = Wt - 2 * Z * D, Lb = Lt - 2 * Z * D;
    if (!(Wb > 0)) return { error: 'These inputs give a negative bottom width. Reduce side slope or depth.' };
    var At = Lt * Wt, Vcheck = frustumVol(Lb, Wb, Z, D);
    var cleanD = frustumDepthForVol(Lb, Wb, Z, 0.5 * V);   // sediment depth at which 50% of the design volume is filled: TCEQ III.F.6(c) removal trigger (assumes sediment fills from the floor)
    var We = At / Lt, checks = [];
    function chk(id, label, ok, detail, src) { checks.push({ id: id, label: label, ok: ok, detail: detail, src: src }); }
    chk('ratio', 'Length to effective width at least 4:1 (iSWM Eq 3.3, We = A/L)', Lt / We >= 4 - 1e-9, 'L/We = ' + r(Lt, 1) + ' / ' + r(We, 1) + ' = ' + r(Lt / We, 2), 'ISWM');
    chk('slope', 'Side slopes 3:1 or flatter (iSWM); TxDOT trap allows 2:1', Z >= 3, 'Z = ' + Z + ':1' + (Z >= 2 && Z < 3 ? ' (meets the TxDOT 2:1 minimum, not the iSWM 3:1)' : Z < 2 ? ' (steeper than 2:1)' : ''), 'ISWM');
    if (A != null) chk('area', 'Surface area at least 1% of drainage area (TxDOT sediment trap)', At >= 0.01 * A * AC_FT2, 'Top area ' + Math.round(At) + ' sq ft vs 1% of ' + A + ' ac = ' + Math.round(0.01 * A * AC_FT2) + ' sq ft', 'TXD_BMP_S');
    chk('embank', 'Embankment height (storage + freeboard) 5 ft or less (TxDOT trap)', D + fb <= 5 + 1e-9, 'D + freeboard = ' + r(D, 1) + ' + ' + r(fb, 1) + ' = ' + r(D + fb, 1) + ' ft', 'TXD_BMP_S');
    chk('vol', 'Volume provided at least required', Vcheck >= V - 1, 'Provided ' + Math.round(Vcheck) + ' cu ft vs required ' + Math.round(V), 'TXR');
    return { V: V, D: D, Z: Z, ratio: rho, Lb: Lb, Wb: Wb, Lt: Lt, Wt: Wt, At: At, We: We, provided: Vcheck, cleanoutDepth: cleanD, cleanoutVol: 0.5 * V, checks: checks, top: D + fb, src: 'ISWM',
      eq: 'V = Lb Wb D + (Lb+Wb) Z D^2 + 4/3 Z^2 D^3;  Lt = ratio x Wt;  Lb = Lt - 2 Z D;  Wb = Wt - 2 Z D',
      steps: [line('Top width (solved)', 'Wt such that V(Wt) = ' + Math.round(V) + ' cu ft', r(Wt, 2), 'ft'), line('Top length', 'Lt = ' + rho + ' x Wt', r(Lt, 2), 'ft'), line('Bottom length x width', 'Lt - 2ZD, Wt - 2ZD  (2ZD = ' + r(2 * Z * D, 1) + ')', r(Lb, 1) + ' x ' + r(Wb, 1), 'ft'),
        line('Top surface area', 'Lt Wt', Math.round(At), 'sq ft'), line('50% clean-out depth', 'depth where V(d) = 0.5 x ' + Math.round(V), r(cleanD, 2), 'ft above floor')] };
  }
  // Skimmer / dewatering rate: iSWM 3.9: Q = V / t. TxDOT basin draw-down time 40 h; iSWM >= 36 h (< 72 h preferred).
  function skimmer(o) {
    var V = num(o.V), t = num(o.hours) || 40, h = num(o.head), Co = num(o.Co) || 0.67;
    if (V == null) return { error: 'Enter the volume to dewater.' };
    var Q = V / (t * 3600);
    var res = { V: V, hours: t, Q: Q, gpm: Q * GPM_PER_CFS, src: 'ISWM', eq: 'Q = V / t', steps: [line('Dewatering rate', 'Q = ' + Math.round(V) + ' / (' + t + ' x 3600)', r(Q, 4), 'cfs'), line('Dewatering rate', 'x 448.831', r(Q * GPM_PER_CFS, 1), 'gpm')], notes: [] };
    if (h != null && h > 0) { res.orificeArea = Q / (Co * Math.sqrt(2 * G * h)); res.orificeDiaIn = Math.sqrt(4 * res.orificeArea / Math.PI) * 12; res.steps.push(line('Orifice area at head h (Assumed Co = ' + Co + ', HDM Eq 10-31 coefficient)', 'A = Q / (Co sqrt(2 g h)) = ' + r(Q, 4) + ' / (' + Co + ' x sqrt(2 x 32.2 x ' + h + '))', r(res.orificeArea * 144, 2), 'sq in')); res.steps.push(line('Equivalent diameter', 'd = sqrt(4A/pi)', r(res.orificeDiaIn, 2), 'in')); }
    if (t < 36) res.notes.push('Under the iSWM 36-hour minimum dewatering time; settling may be incomplete.');
    if (t > 72) res.notes.push('Over the iSWM 72-hour preferred maximum.');
    if (t > 40) res.notes.push('Over the TxDOT 40-hour draw-down guideline for basins.');
    res.notes.push('Pick the skimmer from manufacturer flow tables for the head and size above (Assumed: product data is not in this tool).');
    return res;
  }
  // Weir: Q = Cw L H^1.5 with Cw = 3.0 (HDM Ch.10 Sec.6 Eq 10-30 coefficient; applying it to a spillway crest is Assumed).
  function spillway(o) {
    var Q = num(o.Q), H = num(o.H), Cw = num(o.Cw) || 3.0, L = num(o.L);
    if (H == null || H <= 0) return { error: 'Enter the head over the crest.' };
    var res = { H: H, Cw: Cw, src: 'HDM_INLET', eq: 'Q = Cw L H^1.5', steps: [] };
    if (Q != null) { res.Q = Q; res.Lreq = Q / (Cw * Math.pow(H, 1.5)); res.steps.push(line('Required crest length', 'L = Q / (Cw H^1.5) = ' + r(Q, 2) + ' / (' + Cw + ' x ' + H + '^1.5)', r(res.Lreq, 2), 'ft')); }
    if (L != null) { res.L = L; res.cap = Cw * L * Math.pow(H, 1.5); res.steps.push(line('Capacity of crest length L', 'Q = ' + Cw + ' x ' + L + ' x ' + H + '^1.5', r(res.cap, 2), 'cfs')); if (Q != null) res.ok = res.cap >= Q - 1e-9; }
    res.note = 'Weir coefficient 3.0 is the HDM grate/inlet value; a broad-crested earth spillway coefficient is not sourced here (Assumed). Line the spillway and outlet for the 25-yr flow; check the 100-yr (TxDOT BMP fact sheet).';
    return res;
  }
  // Riser capacity: grate-inlet analogy, HDM Eq 10-30 (weir, perimeter x 0.5) and 10-31 (orifice, area x 0.5); lower governs. Applying this to a riser is Assumed.
  function riserCapacity(o) {
    var P = num(o.perimeter), A = num(o.area), h = num(o.head), m = num(o.mult); if (m == null) m = 0.5;
    if (P == null || A == null || h == null) return { error: 'Enter riser perimeter, open area and head.' };
    var Qw = 3.0 * (P * m) * Math.pow(h, 1.5), Qo = 0.67 * (A * m) * Math.sqrt(2 * G * h);
    return { Qw: Qw, Qo: Qo, Q: Math.min(Qw, Qo), governs: Qw <= Qo ? 'weir' : 'orifice', src: 'HDM_INLET', eq: 'Qw = 3.0 (m P) h^1.5;  Qo = 0.67 (m A) sqrt(2 g h);  Q = min', steps: [line('Weir', 'Qw = 3.0 x ' + (P * m) + ' x ' + h + '^1.5', r(Qw, 2), 'cfs'), line('Orifice', 'Qo = 0.67 x ' + (A * m) + ' x sqrt(2 x 32.2 x ' + h + ')', r(Qo, 2), 'cfs')] };
  }

  /* ---------------- 3. Silt fence, logs, rock dams ---------------- */
  // TxDOT BMP fact sheet: fence drainage <= 2 ac to one run; flow-through <= 100 gpm/sq ft. iSWM 3.10.3: <= 0.25 ac / 100 LF, <= 1 cfs to any 20 ft, flow distance <= 200 ft (< 50 ft if slope > 10%).
  function siltFence(o) {
    var A = num(o.A), Q = num(o.Q), L = num(o.L), H = num(o.H), slope = num(o.slopePct), dist = num(o.flowDist);
    if (A == null) return { error: 'Enter the area draining to the fence.' };
    if (H == null) H = 2;
    var checks = [], steps = [];
    function chk(id, label, ok, detail, src) { checks.push({ id: id, label: label, ok: ok, detail: detail, src: src }); }
    var Lreq = A / 0.0025;
    steps.push(line('Fence length for 0.25 ac / 100 LF (iSWM 3.10.3)', 'L >= A / 0.0025 = ' + A + ' / 0.0025', Math.ceil(Lreq), 'ft'));
    var Lflow = null;
    if (Q != null) { Lflow = Q * GPM_PER_CFS / (100 * H); steps.push(line('Fence length for flow-through 100 gpm/sq ft (TxDOT)', 'L >= Q x 448.831 / (100 H) = ' + Q + ' x 448.831 / (100 x ' + H + ')', Math.ceil(Lflow), 'ft (Assumed fence height H = ' + H + ' ft acts as flow area)')); }
    var Lmin = Math.max(Lreq, Lflow || 0);
    chk('area', 'Drainage to one run of fence 2 acres or less (TxDOT)', A <= 2, A + ' ac', 'TXD_BMP_S');
    if (L != null) {
      chk('apl', 'iSWM 0.25 ac per 100 LF', A / (L / 100) <= 0.25 + 1e-9, r(A / (L / 100), 3) + ' ac/100 LF with L = ' + L + ' ft', 'ISWM');
      if (Q != null) {
        var cap = 100 * H * L / GPM_PER_CFS;
        chk('thru', 'Flow-through 100 gpm/sq ft or less (TxDOT)', Q <= cap + 1e-9, 'Fence passes about ' + r(cap, 2) + ' cfs; Q = ' + r(Q, 2) + ' cfs', 'TXD_BMP_S');
        chk('per20', 'No more than 1 cfs to any 20 ft section (iSWM)', Q / (L / 20) <= 1 + 1e-9, r(Q / (L / 20), 2) + ' cfs per 20 ft', 'ISWM');
      }
    }
    if (dist != null) { var lim = slope != null && slope > 10 ? 50 : 200; chk('dist', 'Flow distance to fence ' + (lim === 50 ? 'under 50 ft (slope over 10%)' : '200 ft or less') + ' (iSWM)', lim === 50 ? dist < 50 : dist <= 200, dist + ' ft', 'ISWM'); }
    return { A: A, Lmin: Math.ceil(Lmin), Lreq: Lreq, Lflow: Lflow, checks: checks, steps: steps, src: 'TXD_BMP_S', eq: 'L >= max(A/0.0025, Q x 448.831/(100 H))' };
  }
  // Rock filter dam through-flow: TxDOT fact sheet 60 gpm per sq ft of cross-section at the 2-yr flow (cross-section taken as channel width x dam height: Assumed). Type 1 not for velocities of about 8 ft/s or more.
  function rockDam(o) {
    var Q = num(o.Q2), W = num(o.width), h = num(o.height), V = num(o.velocity), ty = num(o.type) || 1;
    if (h == null) h = ty === 3 ? 3 : 1.5;
    var min = ty === 3 ? 3 : 1.5;
    var res = { type: ty, height: h, checks: [], steps: [], src: 'TXD_506', eq: 'Q through = 60 gpm/sq ft x (W x h) / 448.831' };
    function chk(id, label, ok, detail, src) { res.checks.push({ id: id, label: label, ok: ok, detail: detail, src: src }); }
    chk('h', 'Height at least ' + (ty === 3 ? '36' : '18') + ' in. (Item 506 sec 4.4.1)', h >= min - 1e-9, h + ' ft', 'TXD_506');
    res.areaFt2 = h * (2 + 2 * h);   // trapezoid: top 2 ft (min, Item 506 4.4.1), 2:1 side slopes: bottom = 2 + 4h; A = h (2 + 2 + 4h)/2
    res.cyPerLf = res.areaFt2 / 27;
    res.steps.push(line('Dam cross-section (top 2 ft, 2:1 slopes)', 'A = h (2 + 2h) = ' + h + ' x (2 + ' + 2 * h + ')', r(res.areaFt2, 2), 'sq ft'));
    res.steps.push(line('Rock per foot of dam', 'A / 27', r(res.cyPerLf, 3), 'cu yd/LF'));
    if (Q != null && W != null) { res.cap = 60 * W * h / GPM_PER_CFS; chk('thru', 'Flow-through 60 gpm/sq ft or less at the 2-yr flow (TxDOT fact sheet)', Q <= res.cap + 1e-9, 'Passes about ' + r(res.cap, 2) + ' cfs; Q2 = ' + r(Q, 2) + ' cfs', 'TXD_BMP_S'); res.steps.push(line('Through-flow capacity', '60 x ' + W + ' x ' + h + ' / 448.831', r(res.cap, 2), 'cfs')); }
    if (V != null && ty === 1) chk('vel', 'Type 1 (non-reinforced) not for flows of about 8 ft/s or more (TxDOT fact sheet)', V < 8, V + ' ft/s', 'TXD_BMP_S');
    return res;
  }
  // Check dam spacing (iSWM 2.1.3): top of downstream dam level with toe of upstream dam => spacing L = h / S. Height 9 to 36 in. and under 1/3 of channel depth.
  function checkDams(o) {
    var h = num(o.h), S = num(o.S), D = num(o.depth), reach = num(o.reach);
    if (h == null || S == null || S <= 0) return { error: 'Enter dam height and channel slope (ft/ft).' };
    var Ls = h / S, checks = [], steps = [line('Spacing', 'L = h / S = ' + h + ' / ' + S, r(Ls, 1), 'ft')];
    function chk(id, label, ok, detail, src) { checks.push({ id: id, label: label, ok: ok, detail: detail, src: src }); }
    chk('h', 'Dam height 9 to 36 in. (iSWM 2.1.3)', h >= 0.75 && h <= 3, r(h * 12, 0) + ' in.', 'ISWM');
    if (D != null) chk('third', 'Dam height under 1/3 of channel depth (iSWM 2.1.3)', h < D / 3, 'h = ' + h + ' ft vs depth/3 = ' + r(D / 3, 2) + ' ft', 'ISWM');
    chk('flat', 'Grades flatter than 0.4%: space for pools, not by the formula (iSWM 2.1.3)', S >= 0.004, 'S = ' + r(S * 100, 2) + '%', 'ISWM');
    var res = { h: h, S: S, spacing: Ls, checks: checks, steps: steps, src: 'ISWM', eq: 'L = h / S' };
    if (reach != null) { res.count = Math.max(1, Math.ceil(reach / Ls)); steps.push(line('Dams for a reach', 'ceil(' + reach + ' / ' + r(Ls, 1) + ')', res.count, 'dams')); }
    res.note = 'Logs in ditches: TxDOT guidance spaces at about 500 ft on center (Summary Sheet guidance 2.2.1); use the closer of the two for the ditch.';
    return res;
  }

  /* ---------------- 4. Ditch lining check (HEC-15 via ditch/calc.js DT, TxDOT HDM Ch.7 Sec.3 permissible shear) ---------------- */
  var TXT_TP = { 'Retardance Class A vegetation': 3.70, 'Retardance Class B vegetation': 2.10, 'Retardance Class C vegetation': 1.00, 'Retardance Class D vegetation': 0.60, 'Retardance Class E vegetation': 0.35, 'Woven paper': 0.15, 'Jute net': 0.45, 'Single fiberglass': 0.60, 'Double fiberglass': 0.85, 'Straw w/ net': 1.45, 'Curled wood mat': 1.55, 'Synthetic mat': 2.00, 'Gravel D50 = 1 in': 0.40, 'Gravel D50 = 2 in': 0.80, 'Rock D50 = 6 in': 2.50, 'Rock D50 = 12 in': 5.00, '6-in gabions': 35.0, '4-in Geoweb': 10.0 };
  function depsDT() { if (root.DT) return root.DT; if (typeof require === 'function') { try { return require('../ditch/calc.js'); } catch (e) { return null; } } return null; }
  function ditchLining(o) {
    var DT = depsDT(); if (!DT) return { error: 'Ditch library not loaded.' };
    var Q = num(o.Q), S = num(o.S), B = num(o.B), Z = num(o.Z), n = num(o.n), tp = o.tp != null ? num(o.tp) : TXT_TP[o.lining], SF = num(o.SF) || 1;
    if (Q == null || S == null || B == null || Z == null || n == null || tp == null) return { error: 'Enter flow, slope, bottom width, side slope, Manning n and a lining.' };
    var a;
    try { a = DT.analyze({ shape: 'trap', B: B, Z1: Z, Z2: Z, S: S, Dd: num(o.ditchDepth) }, { type: 'txdot', n: n, tp: tp }, { mode: 'Q', Q: Q, SF: SF }); } catch (e) { return { error: e.message }; }
    var td = a.td, ok = tp >= SF * td - 1e-9;
    return { Q: Q, S: S, depth: a.d, V: a.V, Fr: a.Fr, regime: a.regime, td: td, tp: tp, SF: SF, ok: ok, margin: tp / td, fb: a.fb, src: 'HEC15', eq: 'Manning Q = (1.49/n) A R^(2/3) S^(1/2);  td = gamma d S;  pass if tp >= SF x td',
      steps: [line('Normal depth (Manning, HEC-15 / HDM Eq 7-1)', 'solve Q = 1.49/n A R^(2/3) S^0.5 for d', r(a.d, 3), 'ft'), line('Velocity', 'V = Q / A', r(a.V, 2), 'ft/s'), line('Froude number', 'Fr', r(a.Fr, 2), ''),
        line('Design shear (HDM Eq 7-2/7-3)', 'td = 62.4 x ' + r(a.d, 3) + ' x ' + S, r(td, 3), 'lb/sq ft'), line('Permissible shear', 'tp (HDM Ch.7 Sec.3 table)', tp, 'lb/sq ft'), line('Check', 'tp >= SF x td:  ' + tp + ' >= ' + SF + ' x ' + r(td, 3), ok ? 'PASS' : 'FAIL', '')] };
  }

  /* ---------------- 5. Slope drain, inlet protection ---------------- */
  var PSD_TABLE = [[12, 0.5], [18, 1.5], [21, 2.5], [24, 3.5], [30, 5.0]];   // iSWM Table 2.2 pipe slope drain minimum diameter vs max drainage area
  function slopeDrain(o) {
    var Q = num(o.Q), A = num(o.A), D = num(o.D), n = num(o.n) || 0.013, S = num(o.S), dike = num(o.dike);
    if (D == null) return { error: 'Enter a pipe diameter.' };
    var checks = [], steps = [];
    function chk(id, label, ok, detail, src) { checks.push({ id: id, label: label, ok: ok, detail: detail, src: src }); }
    var Dft = D / 12, Af = Math.PI * Dft * Dft / 4;
    var res = { D: D, src: 'ISWM', eq: 'Manning full: Q = (1.49/n) A R^(2/3) S^(1/2);  inlet control: Q = 0.67 A sqrt(2 g h)', checks: checks, steps: steps };
    if (A != null) {
      var minD = null; for (var i = 0; i < PSD_TABLE.length; i++) if (A <= PSD_TABLE[i][1]) { minD = PSD_TABLE[i][0]; break; }
      res.minD = minD;
      chk('area', 'Drainage area 5 acres or less per drain (iSWM 2.6; TxDOT fact sheet)', A <= 5, A + ' ac', 'ISWM');
      chk('dia', 'Pipe diameter at least iSWM Table 2.2 minimum for the area', minD != null && D >= minD, 'Table 2.2 minimum ' + (minD == null ? 'n/a (over 5 ac)' : minD + ' in.') + ' for ' + A + ' ac; using ' + D + ' in.', 'ISWM');
    }
    if (S != null && S > 0) { res.Qfull = 1.49 / n * Af * Math.pow(Dft / 4, 2 / 3) * Math.sqrt(S); steps.push(line('Barrel capacity, flowing full (Manning)', 'Q = 1.49/' + n + ' x ' + r(Af, 3) + ' x (D/4)^(2/3) x S^0.5', r(res.Qfull, 2), 'cfs')); if (Q != null) chk('barrel', 'Barrel capacity at least the design flow', res.Qfull >= Q, r(res.Qfull, 2) + ' cfs vs ' + r(Q, 2) + ' cfs', 'ISWM'); }
    if (dike != null) { var h = dike + Dft / 2; res.Qin = 0.67 * Af * Math.sqrt(2 * G * h); steps.push(line('Inlet-control capacity (orifice, Assumed; head to pipe centre, dike height + D/2)', 'Q = 0.67 x ' + r(Af, 3) + ' x sqrt(2 x 32.2 x ' + r(h, 2) + ')', r(res.Qin, 2), 'cfs')); if (Q != null) chk('inlet', 'Inlet capacity at least the design flow', res.Qin >= Q, r(res.Qin, 2) + ' cfs vs ' + r(Q, 2) + ' cfs', 'HDM_INLET'); chk('dike', 'Earth dike at least 1 ft above the top of the inlet pipe (TxDOT fact sheet)', dike >= 1, 'dike ' + dike + ' ft above inlet pipe top', 'TXD_BMP_E'); }
    res.apron = { width: 3 * D / 12, length: 6 * D / 12 }; steps.push(line('Outlet riprap apron (iSWM 2.6.3)', 'width 3D, length >= 6D', r(res.apron.width, 1) + ' x ' + r(res.apron.length, 1), 'ft'));
    return res;
  }
  // Grate / area inlet in a sump, HDM Ch.10 Sec.6 Eq 10-30, 10-31. `clog` is an extra blockage factor for inlet protection (Assumed; 1 = none).
  function inletCapacity(o) {
    var P = num(o.perimeter), A = num(o.area), h = num(o.head), Q = num(o.Q), clog = num(o.clog); if (clog == null) clog = 1;
    if (P == null || A == null || h == null) return { error: 'Enter grate perimeter, open area and allowable head.' };
    var Qw = 3.0 * (0.5 * P) * Math.pow(h, 1.5) * clog, Qo = 0.67 * (0.5 * A) * Math.sqrt(2 * G * h) * clog;
    var cap = Math.min(Qw, Qo), res = { Qw: Qw, Qo: Qo, cap: cap, governs: Qw <= Qo ? 'weir' : 'orifice', src: 'HDM_INLET', eq: 'Qw = 3.0 (0.5 P) h^1.5;  Qo = 0.67 (0.5 A) sqrt(2 g h);  capacity = min x blockage factor',
      steps: [line('Weir capacity', '3.0 x (0.5 x ' + P + ') x ' + h + '^1.5 x ' + clog, r(Qw, 2), 'cfs'), line('Orifice capacity', '0.67 x (0.5 x ' + A + ') x sqrt(2 x 32.2 x ' + h + ') x ' + clog, r(Qo, 2), 'cfs')] };
    if (Q != null) { res.Q = Q; res.bypass = Math.max(0, Q - cap); res.ok = Q <= cap + 1e-9; res.steps.push(line('Overflow / bypass', 'max(0, Q - capacity)', r(res.bypass, 2), 'cfs')); }
    res.note = 'Inlet protection that ponds water only suits sump inlets; on-grade curb inlets would bypass flow (iSWM 3.4.2). Curb-opening capacity: use the Drainage tool.';
    return res;
  }

  /* ---------------- 6. RUSLE / USLE and site rating ---------------- */
  // iSWM 1.3.3 Eq 1.2: Z = R K LS Cs P (tons/ac/yr). R = 300 is the iSWM value for North Central Texas only (user must enter R for other regions).
  function lsISWM(L, sFtFt) {
    var th = Math.atan(sFtFt), sn = Math.sin(th), M = 0.6 * (1 - Math.exp(-35.835 * sFtFt));
    return Math.pow(L / 72.6, M) * (65.41 * sn * sn + 4.56 * sn + 0.065);   // iSWM Eq 1.4
  }
  // USDA AH-703 Ch.3 LS tables (lsdata.js): bilinear interpolation in (log length, slope). The interpolation is Assumed (the tables list discrete values).
  function lsTable(LSD, kind, L, slopePct) {
    var T = LSD[kind], lens = LSD.lengths, sl = LSD.slopes;
    function idx(arr, x) { if (x <= arr[0]) return [0, 0, 0]; if (x >= arr[arr.length - 1]) return [arr.length - 1, arr.length - 1, 0]; for (var i = 0; i < arr.length - 1; i++) if (x >= arr[i] && x <= arr[i + 1]) return [i, i + 1, 0]; }
    var a = idx(sl, slopePct), b = idx(lens, L);
    function fr(arr, i, j, x, useLog) { if (i === j) return 0; var f = useLog ? Math.log : function (v) { return v; }; return (f(x) - f(arr[i])) / (f(arr[j]) - f(arr[i])); }
    var fs = fr(sl, a[0], a[1], Math.min(Math.max(slopePct, sl[0]), sl[sl.length - 1]), false), fl = fr(lens, b[0], b[1], Math.min(Math.max(L, lens[0]), lens[lens.length - 1]), true);
    var v00 = T[a[0]][b[0]], v01 = T[a[0]][b[1]], v10 = T[a[1]][b[0]], v11 = T[a[1]][b[1]];
    return (v00 * (1 - fl) + v01 * fl) * (1 - fs) + (v10 * (1 - fl) + v11 * fl) * fs;
  }
  // iSWM Table 1.1 / 1.2 efficiency ratings Fe (low, high). Fe of controls in series: FeTotal = 1 - prod(1 - Fe) (iSWM Eq 1.6). Site rating SR = retained / uncontrolled, minimum 0.70 where required.
  var FE = {
    check_dam: [0.30, 0.50, 'Check dam'], diversion_dike: [0.95, 0.95, 'Diversion dike'], erosion_blanket: [0.65, 0.90, 'Erosion control blanket (0.65 perimeter w/o vegetation, 0.90 ground cover)'], interceptor_swale: [0.95, 0.95, 'Interceptor swale'],
    mulching: [0.75, 0.90, 'Mulching'], pipe_slope_drain: [0.95, 0.95, 'Pipe slope drain'], seeding_sod: [0.90, 0.90, 'Vegetation (fully established; lower while growing)'], turf_reinforcement: [0.90, 0.90, 'Turf reinforcement mat'],
    sediment_trap: [0.50, 0.75, 'Depressed grade / small trap'], dewatering_controls: [0.50, 0.75, 'Dewatering controls'], inlet_protection: [0.35, 0.65, 'Inlet protection'], filter_tubes: [0.50, 0.75, 'Organic filter tubes / logs / berm'],
    sediment_basin: [0.50, 0.90, 'Sediment basin'], silt_fence: [0.50, 0.75, 'Silt fence'], rock_dam: [0.50, 0.85, 'Stone outlet sediment trap / rock dam'], turbidity_barrier: [0.50, 0.90, 'Turbidity barrier'], vegetated_buffer: [0.35, 0.85, 'Vegetated filter strip / buffer']
  };
  function rusle(o) {
    var R = num(o.R), K = num(o.K), LS = num(o.LS), C = num(o.C), P = num(o.P), A = num(o.A);
    if (R == null || K == null || LS == null || C == null) return { error: 'Enter R, K, LS and C.' };
    if (P == null) P = 1;
    var Z = R * K * LS * C * P, res = { R: R, K: K, LS: LS, C: C, P: P, Z: Z, src: 'ISWM', eq: 'Z = R K LS C P', steps: [line('Soil loss rate', 'Z = ' + R + ' x ' + K + ' x ' + r(LS, 3) + ' x ' + C + ' x ' + P, r(Z, 2), 'tons/ac/yr')] };
    if (A != null) { res.A = A; res.ZA = Z * A; res.steps.push(line('Soil loss for the area', 'ZA = Z x A', r(Z * A, 1), 'tons/yr')); }
    return res;
  }
  function seriesFe(list) { var p = 1; list.forEach(function (f) { p *= (1 - f); }); return 1 - p; }
  function siteRating(o) {
    var base = rusle({ R: o.R, K: o.K, LS: o.LS, C: o.C, P: 1, A: o.A });
    if (base.error) return base;
    var fe = (o.fe || []).map(Number).filter(function (x) { return isFinite(x); });
    var feT = seriesFe(fe), retained = base.ZA * feT, SR = base.ZA > 0 ? retained / base.ZA : 0, left = base.ZA - retained;
    return { uncontrolledZA: base.ZA, uncontrolledZ: base.Z, fe: fe, feTotal: feT, retained: retained, leaving: left, SR: SR, ok: SR >= 0.70 - 1e-9, src: 'ISWM', eq: 'FeTotal = 1 - prod(1 - Fe);  SR = ZA retained / ZA uncontrolled (iSWM Eq 1.1, 1.6); minimum 0.70 where the local government requires it',
      steps: base.steps.concat([line('Combined efficiency', 'FeTotal = 1 - prod(1 - Fe) = 1 - ' + fe.map(function (f) { return '(1-' + f + ')'; }).join('')  , r(feT, 3), ''), line('Soil retained', 'ZA x FeTotal', r(retained, 1), 'tons/yr'), line('Site rating', 'retained / uncontrolled', r(SR, 3), '(min 0.70)')]) };
  }

  /* ---------------- 7. Construction exit, quantities ---------------- */
  function rockExit(o) {
    var dist = num(o.disturbed), two = !!o.twoWay, wU = num(o.width), lU = num(o.length), t = num(o.thickIn);
    var iw = dist == null ? null : dist < 1 ? 15 : dist < 5 ? 25 : 30, il = dist == null ? null : dist < 1 ? 20 : 50;     // iSWM Table 3.9
    var W = Math.max(two ? 20 : 14, iw || 0, wU || 0), L = Math.max(50, il || 0, lU || 0);                              // TxDOT: >= 50 ft long (fact sheet), >= 14 ft one-way / 20 ft two-way (Item 506 4.4.4.1)
    var th = Math.max(8, t || 0);                                                                                      // TxDOT Item 506 4.4.4.1.1 Type 1 >= 8 in. (iSWM 6 in.)
    var SY = W * L / 9, CY = W * L * th / 12 / 27;
    return { W: W, L: L, thickIn: th, SY: SY, CY: CY, src: 'TXD_506', eq: 'SY = W L / 9;  CY = W L t / 27 (t in ft)',
      steps: [line('Width', 'max(TxDOT ' + (two ? 20 : 14) + ' ft, iSWM Table 3.9 ' + (iw == null ? 'n/a' : iw + ' ft') + ', entered)', W, 'ft'), line('Length', 'max(TxDOT 50 ft, iSWM ' + (il == null ? 'n/a' : il + ' ft') + ', entered)', L, 'ft'), line('Thickness (Type 1)', 'max(Item 506 4.4.4.1.1: 8 in., entered)', th, 'in.'),
        line('Surface area (pay unit SY, Item 506 sec 5.4)', 'W L / 9', r(SY, 1), 'sq yd'), line('Rock volume', 'W L t / 27', r(CY, 1), 'cu yd')],
      note: 'Use 4-8 in. aggregate for Type 1, 2-4 in. for Type 3 (Item 506 2.4.1). Entrance approach 6:1 or flatter is from the TxDOT fact sheet.' };
  }
  // Bid items (506-7xxx, current series in bid-cost/prices.json). price(code) -> {price, source, n} from BidCostLookup.resolvePrice; manual override per item.
  var BID = {
    silt_fence: [['506-7039', 'Temp sediment control fence (install)', 'LF'], ['506-7041', 'Temp sediment control fence (remove)', 'LF']],
    erosion_log: [['506-7044', 'Biodegradable erosion control logs (install) 12 in.', 'LF'], ['506-7046', 'Biodegradable erosion control logs (remove)', 'LF']],
    rock_dam: [['506-7001', 'Rock filter dams (install) Type 1', 'LF'], ['506-7011', 'Rock filter dams (remove)', 'LF']],
    rock_dam_2: [['506-7002', 'Rock filter dams (install) Type 2', 'LF'], ['506-7011', 'Rock filter dams (remove)', 'LF']],
    construction_exit: [['506-7020', 'Construction exits (install) Type 1', 'SY'], ['506-7024', 'Construction exits (remove)', 'SY']],
    inlet_protection: [['506-7040', 'Temp sediment control fence (inlet protection)', 'LF']],
    paved_flume: [['506-7018', 'Temp paved flume (install)', 'SY'], ['506-7019', 'Temp paved flume (remove)', 'SY']],
    basin_excavation: [['506-7025', 'Excavation (erosion & sediment control, in place)', 'CY']],
    basin_embankment: [['506-7026', 'Embankment (erosion & sediment control, in place)', 'CY']],
    perimeter_fence: [['506-7034', 'Construction perimeter fence', 'LF']]
  };
  function takeoff(lines, priceFn) {
    var out = [], total = 0, missing = 0;
    (lines || []).forEach(function (l) {
      var qty = num(l.qty); if (qty == null || qty <= 0) return;
      var pr = l.override != null && l.override !== '' ? { price: Number(l.override), source: 'Manual', n: null } : (priceFn ? priceFn(l.code) : null);
      var price = pr && pr.price != null ? pr.price : null, ext = price != null ? price * qty : null;
      if (ext == null) missing++; else total += ext;
      out.push({ code: l.code, desc: l.desc, unit: l.unit, qty: qty, price: price, source: pr ? pr.source : null, n: pr ? pr.n : null, ext: ext, from: l.from || '' });
    });
    return { lines: out, total: total, missing: missing, note: 'Planning-level averages of low-bid unit prices (TxDOT bid tabulations, data.texas.gov); not an engineer\'s estimate.' };
  }
  // Quantity helper: install + remove items for each BMP quantity entered.
  function quantityLines(q) {
    var L = [];
    function add(key, qty, from) { (BID[key] || []).forEach(function (b) { var qq = qty; L.push({ code: b[0], desc: b[1], unit: b[2], qty: qq, from: from }); }); }
    if (q.silt_fence) add('silt_fence', q.silt_fence, 'silt fence');
    if (q.erosion_log) add('erosion_log', q.erosion_log, 'erosion control logs');
    if (q.rock_dam) add('rock_dam', q.rock_dam, 'rock filter dam Type 1');
    if (q.rock_dam_2) add('rock_dam_2', q.rock_dam_2, 'rock filter dam Type 2');
    if (q.construction_exit) add('construction_exit', q.construction_exit, 'construction exit');
    if (q.inlet_protection) add('inlet_protection', q.inlet_protection, 'inlet protection');
    if (q.paved_flume) add('paved_flume', q.paved_flume, 'paved flume');
    if (q.basin_excavation) add('basin_excavation', q.basin_excavation, 'basin excavation');
    if (q.basin_embankment) add('basin_embankment', q.basin_embankment, 'basin embankment');
    if (q.perimeter_fence) add('perimeter_fence', q.perimeter_fence, 'construction perimeter fence');
    return L;
  }

  /* ---------------- project-level compute + outline blocks ---------------- */
  function weirHead(Q, L, Cw) { Cw = Cw || 3.0; return Math.pow(Q / (Cw * L), 2 / 3); }
  // iSWM Table 1.4 approximate soil erodibility K (assumes 2% organic matter); prefer the geotechnical report or NRCS Web Soil Survey value.
  var K_ISWM = [['Sand', 0.03], ['Fine sand', 0.14], ['Loamy sand', 0.10], ['Sandy loam', 0.24], ['Loam', 0.34], ['Silt loam', 0.42], ['Silt', 0.52], ['Sandy clay loam', 0.25], ['Clay loam', 0.25], ['Silty clay loam', 0.32], ['Sandy clay', 0.13], ['Silty clay', 0.23], ['Clay (low end)', 0.13], ['Clay (high end)', 0.29]];
  var FE_FOR_BMP = { sediment_fence: 'silt_fence', erosion_log: 'filter_tubes', rock_filter_dam: 'rock_dam', erosion_blanket: 'erosion_blanket', seeding_sod: 'seeding_sod', sediment_basin: 'sediment_basin', sediment_trap: 'sediment_trap', inlet_protection: 'inlet_protection', diversion: 'diversion_dike', slope_drain: 'pipe_slope_drain', vegetated_buffer: 'vegetated_buffer', dewatering_controls: 'dewatering_controls', turbidity_barrier: 'turbidity_barrier' };
  var QTY_FOR_BMP = { sediment_fence: 'silt_fence', erosion_log: 'erosion_log', rock_filter_dam: 'rock_dam', rock_exit: 'construction_exit', inlet_protection: 'inlet_protection', perimeter_fence: 'perimeter_fence', diversion: 'paved_flume', sediment_basin: 'basin_excavation', sediment_trap: 'basin_excavation' };
  function compute(d, env) {
    d = d || {}; env = env || {}; var o = {}, ro = d.ro || {}, ba = d.ba || {};
    var q = {}, C = num(ro.C), A = num(ro.A);
    if (C != null && A != null) {
      o.storms = [];
      if (env.idf && ro.county) YRS.forEach(function (yr) { var k = idfLookup(env.idf, ro.county, ro.zone || null, yr); if (k) { var rr = rational({ C: C, A: A, tc: ro.tc, k: k }); if (!rr.error) { o.storms.push({ yr: yr, k: k, i: rr.i, Q: rr.Q, tc: rr.tcUsed, steps: rr.steps, warn: rr.warn }); q[yr] = rr.Q; } } });
      if (num(ro.iOv) != null) { o.user = rational({ C: C, A: A, tc: ro.tc, iOverride: ro.iOv }); q.user = o.user.Q; }
      if (o.storms.length) o.rows = (ro.rows || []).filter(function (x) { return num(x.a) != null; }).map(function (x) { var a = num(x.a); return { n: x.n || 'BMP', a: a, Q2: o.storms[0].i * C * a, Q25: (o.storms.filter(function (s) { return s.yr === 25; })[0] || { i: 0 }).i * C * a }; });
    }
    var CN = num(ro.CN) != null ? num(ro.CN) : CN_NEW_GRADED[ro.hsg] || null, P2 = num(ro.P2);
    if (CN != null && P2 != null) o.cn = cnRunoff({ P: P2, CN: CN, A: A });
    o.q = q;
    // basin
    var bA = num(ba.A) != null ? num(ba.A) : A;
    if (bA != null) {
      var bP2 = num(ba.P2) != null ? num(ba.P2) : P2, bCN = num(ba.CN) != null ? num(ba.CN) : CN;
      o.storage = basinStorage({ A: bA, disturbed: ba.dist, P2: bP2, CN: bCN, permitBasin: !!ba.permit, useISWM: !!ba.iswm });
      var V = num(ba.Vo) != null ? num(ba.Vo) : o.storage.requiredCf;
      if (num(ba.D) != null && num(ba.Z) != null) o.dims = basinDims({ V: V, D: ba.D, Z: ba.Z, ratio: ba.ratio, A: bA, freeboard: ba.fb });
      if (V > 0 && (num(ba.hours) != null || num(ba.head) != null)) o.skim = skimmer({ V: V, hours: ba.hours, head: ba.head });
      var q25 = num(ba.q25) != null ? num(ba.q25) : (q[25] != null ? q[25] : null), qp = num(ba.qp) || 0;
      if (q25 != null && num(ba.H) != null) {
        var Qe = Math.max(0, q25 - qp); o.spill = spillway({ Q: Qe, H: ba.H, L: ba.Lsel }); o.spill.q25 = q25; o.spill.qp = qp; o.spill.Qe = Qe;
        var L = num(ba.Lsel) != null ? num(ba.Lsel) : o.spill.Lreq, q100 = num(ba.q100) != null ? num(ba.q100) : (q[100] != null ? q[100] : null);
        if (q100 != null && L) { var Q100e = Math.max(0, q100 - qp); o.spill.H100 = weirHead(Q100e, L); o.spill.q100 = q100; o.spill.L100 = L; }
      }
      if (num(ba.perim) != null && num(ba.area) != null && num(ba.rhead) != null) o.riser = riserCapacity({ perimeter: ba.perim, area: ba.area, head: ba.rhead });
    }
    var sf = d.sf || {}; if (num(sf.A) != null) o.sf = siltFence({ A: sf.A, Q: sf.Q, L: sf.L, H: sf.H, slopePct: sf.slope, flowDist: sf.dist });
    var rd = d.rd || {}; if (num(rd.h) != null || num(rd.Q) != null) o.rd = rockDam({ Q2: rd.Q, width: rd.W, height: rd.h, velocity: rd.v, type: rd.type });
    var cd = d.cd || {}; if (num(cd.h) != null && num(cd.S) != null) o.cd = checkDams({ h: cd.h, S: cd.S, depth: cd.depth, reach: cd.reach });
    var di = d.di || {}; if (num(di.Q) != null && num(di.S) != null && num(di.B) != null && num(di.Z) != null && num(di.n) != null && di.lining) o.di = ditchLining({ Q: di.Q, S: di.S, B: di.B, Z: di.Z, n: di.n, lining: di.lining, SF: di.SF, ditchDepth: di.dd });
    var sd = d.sd || {}; if (num(sd.D) != null) o.sd = slopeDrain({ Q: sd.Q, A: sd.A, D: sd.D, S: sd.S, n: sd.n, dike: sd.dike });
    var ic = d.ic || {}; if (num(ic.perimeter) != null && num(ic.area) != null && num(ic.head) != null) o.ic = inletCapacity({ perimeter: ic.perimeter, area: ic.area, head: ic.head, Q: ic.Q, clog: ic.clog });
    var ru = d.ru || {};
    if (num(ru.R) != null && num(ru.A) != null && num(ru.K) != null) {
      var LS = null, how = '';
      if (ru.lsm === 'manual') { LS = num(ru.LSm); how = 'entered'; }
      else if (num(ru.L) != null && num(ru.slope) != null) {
        if (ru.lsm === 'ah703' && env.ls) { LS = lsTable(env.ls, 'high', num(ru.L), num(ru.slope)); how = 'USDA AH-703 Ch.3 table (high rill), interpolated'; }
        else { LS = lsISWM(num(ru.L), num(ru.slope) / 100); how = 'iSWM Eq 1.4'; }
      }
      if (LS != null) {
        var Cc = num(ru.C) != null ? num(ru.C) : 1, fe = [], names = [];
        Object.keys(ru.fe || {}).forEach(function (k) { if (ru.fe[k] && FE[k]) { fe.push(ru.fe[k] === 'high' ? FE[k][1] : FE[k][0]); names.push(FE[k][2] + ' (' + (ru.fe[k] === 'high' ? 'high' : 'low') + ' ' + (ru.fe[k] === 'high' ? FE[k][1] : FE[k][0]) + ')'); } });
        o.ru = siteRating({ R: ru.R, K: ru.K, LS: LS, C: Cc, A: ru.A, fe: fe }); o.ru.LSused = LS; o.ru.lsHow = how; o.ru.names = names;
      }
    }
    var ex = d.ex || {}; if (num(ex.dist) != null || num(ex.w) != null) o.ex = rockExit({ disturbed: ex.dist, twoWay: !!ex.two, width: ex.w, length: ex.l, thickIn: ex.t });
    var qt = d.qt || {}, qty = {}; Object.keys(qt.q || {}).forEach(function (k) { if (num(qt.q[k]) > 0) qty[k] = num(qt.q[k]); });
    var lines = quantityLines(qty).map(function (l) { l.override = (qt.over || {})[l.code]; return l; });
    if (lines.length) o.take = takeoff(lines, env.price || null);
    return o;
  }
  function f1(v, k) { return Number(v).toLocaleString('en-US', { maximumFractionDigits: k == null ? 1 : k }); }
  // Blocks for the SWP3 outline ({k:'p'|'ul'|'kv'|'table'}); only modules with results appear.
  function outlineBlocks(o, snap) {
    var B = []; o = o || {};
    function p(b, t) { B.push({ k: 'p', b: b, t: t }); }
    if (o.storms && o.storms.length) {
      var s0 = o.storms[0];
      p('TXDOT', 'Design storms (rational method, HDM Ch.4 Sec.12; TxDOT IDF coefficients by county, EBDLKUP-2019): ' + s0.k.county + ' ' + s0.k.zone + '. Q = C i A with the entered C, Tc and area.');
      B.push({ k: 'table', head: ['Storm', 'Tc used (min)', 'i (in/hr)', 'Q (cfs)'], rows: o.storms.map(function (s) { return [s.yr + '-yr', f1(s.tc, 1), f1(s.i, 2), f1(s.Q, 2)]; }) });
    }
    if (o.cn) p('TXDOT', 'Runoff volume (NRCS Curve Number, HDM Ch.4 Sec.13): CN ' + o.cn.CN + ', P = ' + o.cn.P + ' in. gives Q = ' + f1(o.cn.Qin, 2) + ' in.' + (o.cn.volCf ? ' (' + f1(o.cn.volCf, 0) + ' cu ft over the area entered).' : '.'));
    if (o.storage) {
      var rows = [['Drainage area to basin', f1(o.storage.A, 2) + ' ac'], ['Required storage (governing: ' + (o.storage.governs ? o.storage.governs.label : 'n/a') + ')', f1(o.storage.requiredCf, 0) + ' cu ft']];
      if (o.dims) { rows.push(['Provided storage', f1(o.dims.provided, 0) + ' cu ft']); rows.push(['Basin size at water surface (L x W)', f1(o.dims.Lt, 0) + ' x ' + f1(o.dims.Wt, 0) + ' ft, bottom ' + f1(o.dims.Lb, 0) + ' x ' + f1(o.dims.Wb, 0) + ' ft, depth ' + f1(o.dims.D, 1) + ' ft, side slopes ' + o.dims.Z + ':1']); rows.push(['Sediment clean-out level (50% of design storage)', f1(o.dims.cleanoutDepth, 1) + ' ft above the floor']); }
      if (o.skim) rows.push(['Dewatering rate (' + o.skim.hours + ' h)', f1(o.skim.Q, 3) + ' cfs (' + f1(o.skim.gpm, 0) + ' gpm)']);
      if (o.spill && o.spill.Lreq) rows.push(['Emergency spillway crest length for ' + f1(o.spill.Qe, 1) + ' cfs at ' + o.spill.H + ' ft head', f1(o.spill.Lreq, 1) + ' ft']);
      B.push({ k: 'kv', rows: rows });
      o.storage.flags.forEach(function (x) { p('TCEQ', x); });
      if (o.dims) o.dims.checks.filter(function (c) { return !c.ok; }).forEach(function (c) { p('ASSUMED', 'Not met: ' + c.label + ' (' + c.detail + ').'); });
      p('ASSUMED', 'Basin hydraulic sizing uses weir and orifice coefficients from the HDM grate-inlet equations as a screening method; the final riser, spillway and outlet design is by the engineer of record.');
    }
    if (o.sf) p('TXDOT', 'Silt fence: ' + f1(o.sf.A, 2) + ' ac draining to one run needs at least ' + f1(o.sf.Lmin, 0) + ' ft of fence (iSWM 0.25 ac per 100 LF' + (o.sf.Lflow ? '; flow-through 100 gpm/sq ft' : '') + '). ' + (o.sf.checks.filter(function (c) { return !c.ok; }).length ? 'Checks not met: ' + o.sf.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.label; }).join('; ') + '.' : 'Entered length passes the checks.'));
    if (o.cd) p('ISWM', 'Check dams: spacing L = h/S = ' + f1(o.cd.spacing, 1) + ' ft for ' + o.cd.h + ' ft dams' + (o.cd.count ? ' (' + o.cd.count + ' dams in the reach)' : '') + '.');
    if (o.rd) p('TXDOT', 'Rock filter dam Type ' + o.rd.type + ': ' + f1(o.rd.cyPerLf, 3) + ' cu yd per LF (Item 506 sec 4.4.1 minimum section)' + (o.rd.cap ? '; through-flow about ' + f1(o.rd.cap, 2) + ' cfs' : '') + '.');
    if (o.di) p('TXDOT', 'Ditch lining check (HDM Ch.7, HEC-15): Q ' + f1(o.di.Q, 1) + ' cfs, depth ' + f1(o.di.depth, 2) + ' ft, design shear ' + f1(o.di.td, 2) + ' vs permissible ' + f1(o.di.tp, 2) + ' lb/sq ft: ' + (o.di.ok ? 'PASS' : 'FAIL') + '.');
    if (o.sd) p('ISWM', 'Pipe slope drain ' + o.sd.D + ' in.: ' + o.sd.checks.map(function (c) { return (c.ok ? 'PASS ' : 'FAIL ') + c.label; }).join('; ') + '.');
    if (o.ic) p('TXDOT', 'Inlet capacity (HDM Eq 10-30/10-31, with blockage factor): ' + f1(o.ic.cap, 2) + ' cfs' + (o.ic.bypass != null ? '; bypass ' + f1(o.ic.bypass, 2) + ' cfs' : '') + '.');
    if (o.ru) p('ISWM', 'Erosion estimate (USLE, iSWM 1.3): uncontrolled ' + f1(o.ru.uncontrolledZ, 1) + ' tons/ac/yr; controls entered give a site rating of ' + f1(o.ru.SR, 2) + (o.ru.ok ? ' (meets the 0.70 guideline).' : ' (below the 0.70 guideline, which applies where the local government requires it).') + ' R, K, C values are the entered inputs.');
    if (o.ex) p('TXDOT', 'Stabilized construction exit: ' + f1(o.ex.W, 0) + ' ft x ' + f1(o.ex.L, 0) + ' ft, ' + o.ex.thickIn + ' in. rock (' + f1(o.ex.SY, 0) + ' sq yd, ' + f1(o.ex.CY, 0) + ' cu yd).');
    var tk = o.take || snap;
    if (tk && tk.lines && tk.lines.length) {
      B.push({ k: 'table', head: ['Item', 'Description', 'Qty', 'Unit', 'Unit price', 'Extension'], rows: tk.lines.map(function (l) { return [l.code, l.desc, f1(l.qty, 1), l.unit, l.price != null ? '$' + f1(l.price, 2) + (l.source ? ' (' + l.source + ')' : '') : 'enter', l.ext != null ? '$' + f1(l.ext, 0) : '']; }) });
      p('ASSUMED', 'Planning total $' + f1(tk.total, 0) + (tk.missing ? ' (' + tk.missing + ' line(s) without a price). ' : '. ') + tk.note);
    }
    return B;
  }

  /* ---------------- 8. Calc sheet text ---------------- */
  function sheetMarkdown(title, res) {
    var md = ['### ' + title, ''];
    if (res.eq) md.push('Equation: `' + res.eq + '`');
    if (res.src) md.push('Source key: ' + res.src);
    md.push('');
    (res.steps || []).forEach(function (s) { md.push('- ' + s.label + ': ' + s.expr + ' = **' + s.value + '** ' + s.unit); });
    (res.checks || []).forEach(function (c) { md.push('- [' + (c.ok ? 'PASS' : 'FAIL') + '] ' + c.label + ' (' + c.detail + ')'); });
    return md.join('\n');
  }

  var API = { GPM_PER_CFS: GPM_PER_CFS, YRS: YRS, idfLookup: idfLookup, idfZones: idfZones, idfCounties: idfCounties, rational: rational, compositeC: compositeC, cnRunoff: cnRunoff, CN_NEW_GRADED: CN_NEW_GRADED,
    basinStorage: basinStorage, frustumVol: frustumVol, frustumDepthForVol: frustumDepthForVol, basinDims: basinDims, skimmer: skimmer, spillway: spillway, riserCapacity: riserCapacity,
    siltFence: siltFence, rockDam: rockDam, checkDams: checkDams, TXT_TP: TXT_TP, ditchLining: ditchLining, PSD_TABLE: PSD_TABLE, slopeDrain: slopeDrain, inletCapacity: inletCapacity,
    lsISWM: lsISWM, lsTable: lsTable, FE: FE, rusle: rusle, seriesFe: seriesFe, siteRating: siteRating, rockExit: rockExit, BID: BID, takeoff: takeoff, quantityLines: quantityLines, sheetMarkdown: sheetMarkdown, round: r, weirHead: weirHead, K_ISWM: K_ISWM, FE_FOR_BMP: FE_FOR_BMP, QTY_FOR_BMP: QTY_FOR_BMP, compute: compute, outlineBlocks: outlineBlocks };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SwpDesign = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
