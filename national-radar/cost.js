/* National Radar: construction cost BASE for roadway records.
   Everything here is separate from fees. A stated cost is a figure the source gives. An estimate is computed from scope the source gives
   (length, lanes, type) with TxDOT low-bid averages from bid-cost/prices.json. Estimates are labeled "Estimate (not from source)" and never
   feed any fee filter. Shared by the build script, the browser and the tests. */
(function (root) {
  'use strict';
  var LABEL = 'Estimate (not from source)';
  // bid items used (TxDOT 2024+ bid codes in bid-cost/prices.json). group: earth | pavement | drainage | other
  var ITEMS = {
    prepRow: { code: '100-7002', group: 'earth' }, excavation: { code: '110-7001', group: 'earth' }, embankment: { code: '132-7006', group: 'earth' }, topsoil: { code: '160-7002', group: 'earth' },
    base: { code: '247-7125', group: 'pavement' }, prime: { code: '310-7004', group: 'pavement' }, tack: { code: '341-7082', group: 'pavement' }, hmaBase: { code: '341-7001', group: 'pavement' }, hmaSurf: { code: '341-7050', group: 'pavement' }, repair: { code: '351-7005', group: 'pavement' },
    rcp: { code: '464-7005', group: 'drainage' }, endTreat: { code: '467-7328', group: 'drainage' }, inlet: { code: '465-7126', group: 'drainage' }, curb: { code: '529-7009', group: 'drainage' },
    stripe: { code: '666-7024', group: 'other' }, sediment: { code: '506-7039', group: 'other' }
  };
  var PRICE_CODES = Object.keys(ITEMS).map(function (k) { return ITEMS[k].code; });
  var TYPES = { newloc: 'New location', widen: 'Widening (added lanes)', recon: 'Reconstruction', rehab: 'Rehabilitation / overlay' };
  // every assumption is editable. source: 'Assumed' unless a citation is given.
  var DEFAULTS = {
    laneWidthFt: 12, shoulderFt: 8, flexBaseNote: '12 in flexible base (bid item 247-7125 is priced per SY at 12 in)', hmaBaseIn: 6, hmaSurfIn: 2, hmaTonPerSyIn: 0.04125, // 110 lb per cu ft
    fillHeightFt: 3, sideSlope: 4, pavementDepthFt: 1.67, crossDrainsPerMile: 4, endTreatPerCulvert: 2, inletsPerMileUrban: 17.6, repairPct: 5, primeGalPerSy: 0.2, tackGalPerSy: 0.1, section: 'rural',
    trafficControlPct: 5, mobilizationPct: 8, contingencyLowPct: 10, contingencyBasePct: 20, contingencyHighPct: 30, priceLowPct: 15, priceHighPct: 25, escalationPct: 0, basis: 'statewide'
  };
  var ASSUMED_NOTE = {
    trafficControlPct: 'Assumed. TxDOT guidance (PS&E manual 5.5, estimate input) states no fixed traffic-control percentage; TxDOT prices it by quantity.',
    mobilizationPct: 'Assumed. TxDOT pays mobilization as a lump-sum bid item (Item 500) and states no fixed percentage.',
    contingencyBasePct: 'Assumed. TxDOT district estimating SOP describes letting contingency as a set percentage but this repo has no verified TxDOT value.',
    priceLowPct: 'Assumed band around the bid-tab average (the data holds averages only).', escalationPct: 'User input, default 0. Bid-tab prices are low-bidder averages for lettings 2024-09 to 2026-10; no published index is applied.'
  };

  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }
  function priceOf(row, basis, override) {
    if (override !== undefined && override !== null && override !== '' && isFinite(parseFloat(override))) return { p: parseFloat(override), n: null, src: 'User override' };
    if (!row) return { p: null, n: null, src: 'missing' };
    var hn = +row.houston_n || 0, sn = +row.statewide_n || 0;
    if (basis === 'houston' && hn > 0 && row.houston_avg != null) return { p: +row.houston_avg, n: hn, src: 'Houston bid-tab avg' };
    if (sn > 0 && row.statewide_avg != null) return { p: +row.statewide_avg, n: sn, src: basis === 'houston' ? 'Statewide bid-tab avg (no Houston data)' : 'Statewide bid-tab avg' };
    if (hn > 0 && row.houston_avg != null) return { p: +row.houston_avg, n: hn, src: 'Houston bid-tab avg' };
    return { p: null, n: null, src: 'missing' };
  }

  // quantities for one scenario-independent bill. in: { type, lengthMi, lanes (total for newloc/recon/rehab, ADDED for widen), + assumption overrides }
  function bill(inp, prices, overrides) {
    var A = {}; Object.keys(DEFAULTS).forEach(function (k) { A[k] = inp[k] !== undefined && inp[k] !== null && inp[k] !== '' && typeof DEFAULTS[k] === 'number' ? num(inp[k], DEFAULTS[k]) : (inp[k] !== undefined && inp[k] !== null && inp[k] !== '' && typeof DEFAULTS[k] === 'string' ? inp[k] : DEFAULTS[k]); });
    var L = num(inp.lengthMi, 0), N = num(inp.lanes, 0), t = inp.type, ft = 5280 * L, lines = [];
    function add(key, label, qty, unit, note) {
      if (!(qty > 0)) return; var it = ITEMS[key], row = prices && prices[it.code], pr = priceOf(row, A.basis, overrides && overrides[it.code]);
      lines.push({ key: key, code: it.code, desc: row ? row.description : label, label: label, unit: row ? row.unit : unit, qty: qty, price: pr.p, n: pr.n, priceSrc: pr.src, group: it.group, note: note || '', amount: pr.p === null ? null : qty * pr.p });
    }
    var wPave = (t === 'widen' ? N * A.laneWidthFt + A.shoulderFt : N * A.laneWidthFt + 2 * A.shoulderFt), syPerMi = 5280 * wPave / 9, sy = L * syPerMi, tons = function (inch) { return sy * inch * A.hmaTonPerSyIn; };
    if (t === 'newloc') {
      add('prepRow', 'Preparing right of way', 52.8 * L, 'STA', '1 station per 100 ft of alignment');
      add('embankment', 'Embankment', L * 5280 * (wPave + A.sideSlope * A.fillHeightFt) * A.fillHeightFt / 27, 'CY', 'avg fill ' + A.fillHeightFt + ' ft, ' + A.sideSlope + ':1 slopes, width ' + wPave + ' ft');
      add('topsoil', 'Topsoil on slopes', ft * (2 * A.sideSlope * A.fillHeightFt) / 9, 'SY');
    } else if (t === 'widen' || t === 'recon') {
      add('excavation', 'Pavement-depth excavation', ft * wPave * A.pavementDepthFt / 27, 'CY', 'remove to ' + A.pavementDepthFt + ' ft depth over ' + wPave + ' ft width');
    }
    if (t !== 'rehab') {
      add('base', 'Flexible base (12 in)', sy, 'SY', 'paved width ' + wPave + ' ft');
      add('prime', 'Prime coat', sy * A.primeGalPerSy, 'GAL');
      add('tack', 'Tack coat (2 lifts)', sy * A.tackGalPerSy * 2, 'GAL');
      add('hmaBase', 'HMA base course, ' + A.hmaBaseIn + ' in', tons(A.hmaBaseIn), 'TON');
      add('hmaSurf', 'HMA surface course, ' + A.hmaSurfIn + ' in', tons(A.hmaSurfIn), 'TON');
    } else {
      add('tack', 'Tack coat (1 lift)', sy * A.tackGalPerSy, 'GAL');
      add('hmaSurf', 'HMA overlay, ' + A.hmaSurfIn + ' in', tons(A.hmaSurfIn), 'TON');
      add('repair', 'Flexible pavement structure repair (' + A.repairPct + '% of area)', sy * A.repairPct / 100, 'SY');
    }
    if (t !== 'rehab') {
      if (A.section === 'urban') {
        add('curb', 'Concrete curb and gutter, both sides', 2 * ft, 'LF');
        add('inlet', 'Storm inlets (proxy: complete inlet item)', A.inletsPerMileUrban * L, 'EA', A.inletsPerMileUrban + ' per mile');
        add('rcp', 'Storm sewer, 24 in RCP', ft, 'LF', 'one trunk line along the corridor');
      } else {
        var culv = A.crossDrainsPerMile * L; add('rcp', 'Cross-drain culverts, 24 in RCP', culv * (wPave + 2 * A.sideSlope * A.fillHeightFt), 'LF', A.crossDrainsPerMile + ' per mile, length = paved width + slopes');
        add('endTreat', 'Culvert safety end treatments', culv * A.endTreatPerCulvert, 'EA');
      }
      add('sediment', 'Erosion control (sediment fence)', 2 * ft, 'LF');
    }
    add('stripe', 'Pavement markings (solid, 8 in, ' + (N + 1) + ' lines)', ft * (N + 1), 'LF');
    return { lines: lines, A: A, widthFt: wPave, areaSY: sy };
  }

  function scenario(lines, A, priceFactor, contPct) {
    var direct = 0, groups = { earth: 0, pavement: 0, drainage: 0, other: 0 }, missing = [];
    lines.forEach(function (l) { if (l.amount === null) { missing.push(l.code); return; } var a = l.amount * priceFactor; direct += a; groups[l.group] += a; });
    var tc = direct * A.trafficControlPct / 100, mob = direct * A.mobilizationPct / 100, sub = direct + tc + mob, cont = sub * contPct / 100, esc = (sub + cont) * (num(A.escalationPct, 0) / 100);
    return { direct: direct, groups: groups, trafficControl: tc, mobilization: mob, contingency: cont, escalation: esc, total: sub + cont + esc, missing: missing };
  }

  // -> { status: 'estimated' | 'insufficient', reason, label, lines, low, base, high, scenarios, assumptions }
  function estimate(inp, prices, overrides) {
    var why = [];
    if (!TYPES[inp.type]) why.push('project type not given or not supported (supported: ' + Object.keys(TYPES).map(function (k) { return TYPES[k]; }).join(', ') + ')');
    if (!(num(inp.lengthMi, 0) > 0)) why.push('no length in the scope');
    if (TYPES[inp.type] && !(num(inp.lanes, 0) > 0)) why.push(inp.type === 'widen' ? 'number of added lanes not given' : 'lane count not given');
    if (why.length) return { status: 'insufficient', reason: 'insufficient scope: ' + why.join('; '), label: LABEL };
    var b = bill(inp, prices, overrides), A = b.A;
    if (!b.lines.length) return { status: 'insufficient', reason: 'insufficient scope: no priced items could be built', label: LABEL };
    var lo = scenario(b.lines, A, 1 - A.priceLowPct / 100, A.contingencyLowPct), ba = scenario(b.lines, A, 1, A.contingencyBasePct), hi = scenario(b.lines, A, 1 + A.priceHighPct / 100, A.contingencyHighPct);
    return { status: 'estimated', label: LABEL, lines: b.lines, widthFt: b.widthFt, areaSY: b.areaSY, low: lo.total, base: ba.total, high: hi.total, scenarios: { low: lo, base: ba, high: hi }, assumptions: A, missingPrices: ba.missing,
      priceNote: 'Unit prices are TxDOT low-bidder averages (bid-cost/prices.json, lettings 2024-09-06 to 2026-10-22), planning level. They are Texas prices.' };
  }

  // ---- scope text -> inputs (only what the text actually says)
  var WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10 };
  function lanesFrom(text) {
    var m, ev = [];
    var rx = /(?:from\s+)?(\d{1,2}|one|two|three|four|five|six|eight|ten)[\s-]*(?:lanes?)?\s*(?:to|-)\s*(\d{1,2}|two|three|four|five|six|seven|eight|ten)[\s-]*lanes?/i;
    if ((m = rx.exec(text))) { var a = WORDNUM[m[1].toLowerCase()] || +m[1], b = WORDNUM[m[2].toLowerCase()] || +m[2]; if (b > a && b <= 12) return { added: b - a, total: b, ev: m[0] }; }
    if ((m = /(?:add(?:ing)?|additional|new)\s+(\d{1,2}|one|two|three|four)\s+(?:general[- ]purpose\s+|travel\s+|through\s+)?lanes?/i.exec(text))) { var n = WORDNUM[m[1].toLowerCase()] || +m[1]; return { added: n, total: null, ev: m[0] }; }
    if ((m = /\b(\d{1,2}|two|three|four|five|six|eight|ten)[\s-]*lane\b/i.exec(text))) { var t = WORDNUM[m[1].toLowerCase()] || +m[1]; if (t >= 1 && t <= 12) return { added: null, total: t, ev: m[0] }; }
    return null;
  }
  function parseScope(title, desc) {
    var text = String(title || '') + '. ' + String(desc || '').slice(0, 3000), out = { evidence: [] }, m;
    if ((m = /(\d+(?:\.\d+)?)\s*(?:-|\s)?\s*(?:miles?|mi)\b/i.exec(text))) { out.lengthMi = parseFloat(m[1]); out.evidence.push('length: "' + m[0] + '"'); }
    else if ((m = /(\d{1,3}(?:,\d{3})+|\d{3,6})\s*(?:linear\s+feet|lin\.?\s*ft|lf)\b/i.exec(text))) { var ft = parseFloat(m[1].replace(/,/g, '')); if (ft >= 500) { out.lengthMi = ft / 5280; out.evidence.push('length: "' + m[0] + '"'); } }
    var ln = lanesFrom(text); if (ln) { out.lanesAdded = ln.added; out.lanesTotal = ln.total; out.evidence.push('lanes: "' + ln.ev + '"'); }
    var type = null;
    if (/\b(bridge|interchange|intersection|tunnel|viaduct|overpass|grade separation|ITS|signal)\b/i.test(title) && !/\b(widen|reconstruct|resurfac|overlay|new location)/i.test(title)) type = 'unsupported';
    else if (/new[\s-]location|new alignment|new roadway|new highway|construct(?:ion of)? a new/i.test(text)) type = 'newloc';
    else if (/widen|add(?:ing)?\s+(?:\w+\s+){0,2}lanes?|expan(?:d|sion)|from\s+\d+\s+to\s+\d+\s+lanes?/i.test(text)) type = 'widen';
    else if (/reconstruct|rebuild|full[- ]depth/i.test(text)) type = 'recon';
    else if (/resurfac|overlay|rehabilitat|mill(?:ing)?\s+and|preventive maintenance|pavement preservation/i.test(text)) type = 'rehab';
    if (type) { out.type = type; var tm = /new[\s-]location|new alignment|widen|expan(?:d|sion)|reconstruct|rebuild|resurfac|overlay|rehabilitat|bridge|interchange|intersection/i.exec(text); out.evidence.push('type: "' + (tm ? tm[0] : type) + '"'); }
    if (/\b(curb|urban|storm (?:drain|sewer)|sidewalk|street)\b/i.test(text)) out.section = 'urban';
    return out;
  }
  function inputsFromScope(sc) {
    var inp = { type: sc.type === 'unsupported' ? null : sc.type, lengthMi: sc.lengthMi };
    if (inp.type === 'widen') inp.lanes = sc.lanesAdded; else inp.lanes = sc.lanesTotal || sc.lanesAdded;
    if (sc.section) inp.section = sc.section;
    return inp;
  }
  // rec/cand: { title, desc, amts / amounts, projectCost, dates, url }. Returns { stated, est, scope }
  function baseFor(rec, prices, asOf) {
    var stated = null;
    if (rec.projectCost && typeof rec.projectCost.v === 'number') stated = { v: rec.projectCost.v, field: rec.projectCost.field, ctx: rec.projectCost.ctx || null, label: 'Stated by source (project / construction cost, not a fee)', asOf: (rec.dates && (rec.dates.posted || rec.dates.est)) || asOf || null };
    var sc = parseScope(rec.title, rec.desc), est;
    if (stated) est = null;
    else if (sc.type === 'unsupported') est = { status: 'insufficient', reason: 'insufficient scope: bridge / interchange / intersection / signal work has no unit-cost basis in the bid-cost data', label: LABEL };
    else est = estimate(inputsFromScope(sc), prices);
    return { stated: stated, est: est, scope: sc, status: stated ? 'stated' : est.status === 'estimated' ? 'estimated' : 'insufficient' };
  }

  var api = { LABEL: LABEL, ITEMS: ITEMS, PRICE_CODES: PRICE_CODES, TYPES: TYPES, DEFAULTS: DEFAULTS, ASSUMED_NOTE: ASSUMED_NOTE, priceOf: priceOf, bill: bill, estimate: estimate, parseScope: parseScope, inputsFromScope: inputsFromScope, baseFor: baseFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NationalCost = api;
})(typeof self !== 'undefined' ? self : this);
