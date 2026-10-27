/* National Radar: "Roadway + drainage" lane. Separate from the main water/drainage > $20M rules in model.js (which are not touched).
   Two buckets only:
     drain  = consultant ENGINEERING services on a roadway/highway/bridge/corridor project where the SOURCE states a DRAINAGE-SPECIFIC fee strictly > $5,000,000
     total  = the source states only a TOTAL roadway engineering fee strictly > $20,000,000 AND the scope text explicitly names drainage / hydraulics / stormwater / storm drain / culvert / flood.
              Always labeled "total fee, drainage share unknown". A drainage share is NEVER estimated here.
   A construction-cost estimate (cost.js) is display only and cannot reach any fee test in this file. */
(function (root) {
  'use strict';
  var M = typeof require !== 'undefined' ? require('./model.js') : root.NationalModel;
  var C = typeof require !== 'undefined' ? require('./cost.js') : root.NationalCost;
  var DRAIN_MIN = 5000000, TOTAL_MIN = 20000000;                 // both comparisons are STRICT
  function passesDrain(v) { return typeof v === 'number' && isFinite(v) && v > DRAIN_MIN; }
  function passesTotal(v) { return typeof v === 'number' && isFinite(v) && v > TOTAL_MIN; }

  var ROAD_RE = /\b(?:highways?|roadways?|roads?|bridges?|corridors?|interstate|freeways?|parkways?|turnpike|expressways?|I-\d{1,3}|IH[- ]?\d{1,3}|US[- ]?\d{1,3}|SH[- ]?\d{1,3}|FM[- ]?\d{1,4}|SR[- ]?\d{1,3}|state route|streets?|avenue|boulevard)\b/i;
  var ROAD_STRONG_RE = /\b(?:highways?|roadways?|roads?|interstate|freeways?|parkways?|turnpike|expressways?|I-\d{1,3}|IH[- ]?\d{1,3}|US[- ]?\d{1,3}|SH[- ]?\d{1,3}|FM[- ]?\d{1,4}|SR[- ]?\d{1,3}|state route|streets?|avenue|boulevard)\b/i;
  var NONROAD_TITLE_RE = /\b(?:airports?|airfield|runway|taxiway|aircraft|vessels?|harbor|port of|railroad|rail yard|light rail|transit|pipelines?|dams?|levees?|canals?|reservoirs?|treatment plant|wastewater|water main|trails?|watershed|locks?)\b/i;
  var DRAIN_RE = /drainage|hydraul(?:ic|ics)|hydrolog(?:y|ic|ical)|storm ?water|storm drain(?:s|age)?|storm sewer|culverts?/i;
  var DRAIN_NOISE_RE = /hydraulic (?:hose|fluid|pump|cylinder|motor|press|lift|jack|brake|tool|power unit|crane|excavator|system for|actuator|hammer)|hydraulics? (?:equipment|repair kit)|water-?proof/i;
  var SCOPE_RE = /drainage|hydraul(?:ic|ics)|hydrolog(?:y|ic|ical)|storm ?water|storm drain(?:s|age)?|storm sewer|culverts?|flood/i;
  var PROGRAM_RE = /regulatory|permit|compliance|NPDES|\bMS4\b|monitoring|statewide program|outreach|training/i;
  var DOT_AGENCY_RE = /transportation|\bDOT\b|highway/i;

  function drainWord(s) { return DRAIN_RE.test(s || '') && !DRAIN_NOISE_RE.test(s || ''); }
  function sc(s) { return SCOPE_RE.test(s || '') && !DRAIN_NOISE_RE.test(s || ''); }
  function fmt(v) { return '$' + Number(v).toLocaleString('en-US'); }

  // $ figures that sit directly on a drainage phrase in free text ("$6,000,000 for drainage design", "drainage design NTE $6,000,000"). Heuristic: used for REVIEW only.
  function extractDrainageAmounts(text) {
    var out = [], t = String(text || ''), all = M.extractAmounts(t), rx = /\$\s?[\d,]+(?:\.\d+)?/g, m, seen = {};
    all.forEach(function (a) { if (a.kind === 'project_cost') return; seen[a.v] = a; });
    while ((m = rx.exec(t))) {
      var v = parseFloat(m[0].replace(/[$,\s]/g, '')); if (!isFinite(v) || !seen[v]) continue;
      var before = t.slice(Math.max(0, m.index - 110), m.index), cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; '), before.lastIndexOf('\n')); if (cut >= 0) before = before.slice(cut + 2);
      var after = t.slice(m.index + m[0].length, m.index + m[0].length + 70);
      var tail = /^\s*(?:million\b)?[^.;]{0,12}?(?:for|of|toward|towards|in)\s+(?:the\s+)?(?:\w+\s+){0,3}?(drainage|hydraul\w*|storm ?water|storm drain\w*|culverts?)/i.exec(after);
      var head = drainWord(before) && !/\b(?:total|overall|aggregate|entire|capacity|all task|MATOC|combined)\b/i.test(before.slice(before.search(DRAIN_RE))) ;
      if (head || (tail && !DRAIN_NOISE_RE.test(after))) out.push({ v: v, ctx: (before + m[0] + after).replace(/\s+/g, ' ').trim().slice(-190), kind: 'drain_text', field: 'Parsed from notice text near a drainage phrase (heuristic)' });
    }
    return out;
  }

  function roadContext(c) {
    var title = c.title || '', desc = String(c.desc || '').slice(0, 3000);
    if (ROAD_RE.test(title)) return { level: 'strong', why: 'roadway term in the title: "' + ROAD_RE.exec(title)[0] + '"' };
    if (c.roadAgency) return { level: 'strong', why: c.roadAgency };
    var n = (desc.match(new RegExp(ROAD_RE.source, 'gi')) || []).length;
    if (n >= 2) return { level: 'strong', why: 'roadway terms in the description (' + n + ' mentions, e.g. "' + ROAD_RE.exec(desc)[0] + '")' };
    if (n === 1) return { level: 'weak', why: 'one passing roadway term in the description: "' + ROAD_RE.exec(desc)[0] + '"' };
    if (DOT_AGENCY_RE.test((c.agency || '') + ' ' + (c.subagency || ''))) return { level: 'weak', why: 'transportation agency but no roadway term in the title or description' };
    return { level: 'none' };
  }

  function evaluateRoadway(cand, opts) {
    opts = opts || {}; var asOf = opts.asOf || new Date().toISOString().slice(0, 10);
    var rules = [], review = [], excl = [], flags = {}, rwType = null;
    var eng = cand.engOverride || M.engineering(cand.naics, cand.psc, (cand.title || '') + '\u0001' + (cand.desc || ''));
    flags.eng = eng.level;
    if (eng.level === 'strong') rules.push({ k: 'eng', t: 'Engineering services: ' + eng.why });
    else if (eng.level === 'weak') review.push('Engineering status unclear: ' + eng.why);
    else excl.push(eng.level === 'construction' ? 'construction-naics' : 'not-engineering');
    if (cand.titleSuggestsConstruction && eng.level !== 'none') excl.push('construction-title');
    if (cand.foreign) excl.push('outside-us');

    var road = roadContext(cand); flags.road = road.level;
    if (road.level === 'strong') rules.push({ k: 'road', t: 'Roadway context: ' + road.why });
    else if (road.level === 'weak') review.push('Roadway context is weak: ' + road.why);
    else excl.push('no-roadway-context');
    if (NONROAD_TITLE_RE.test(cand.title || '') && !ROAD_STRONG_RE.test(cand.title || '')) excl.push('non-roadway-title');

    var title = cand.title || '', text = title + '\n' + String(cand.desc || '').slice(0, 3000);
    var drainSpecific = !!(cand.drainScope || drainWord(title)); flags.drainSpecific = drainSpecific;
    var am = (cand.amounts || []).filter(function (a) { return typeof a.v === 'number' && isFinite(a.v); });
    var fees = am.filter(function (a) { return M.isFeeKind(a.kind); }), costs = am.filter(function (a) { return a.kind === 'project_cost'; });
    var best = null; fees.forEach(function (a) { var r = M.AMOUNT_KINDS[a.kind].rank; if (!best || r > M.AMOUNT_KINDS[best.kind].rank || (r === M.AMOUNT_KINDS[best.kind].rank && a.v > best.v)) best = a; });
    var bestCost = null; costs.forEach(function (a) { if (!bestCost || a.v > bestCost.v) bestCost = a; });
    var deciding = null, feeBasis = null;

    if (drainSpecific) {
      var why = cand.drainScope ? cand.drainScope.why : 'drainage word in the title: "' + DRAIN_RE.exec(title)[0] + '"';
      if (best) {
        if (!passesDrain(best.v)) { var alt = fees.filter(function (a) { return passesDrain(a.v); })[0]; if (alt) review.push('Fee figures disagree: ' + M.AMOUNT_KINDS[best.kind].label + ' ' + fmt(best.v) + ' vs ' + M.AMOUNT_KINDS[alt.kind].label + ' ' + fmt(alt.v) + ' (' + alt.field + ')'); }
        var edge = best.kind === 'range' && best.v === DRAIN_MIN; if (edge) review.push('Forecast range starts at exactly $5,000,000 (' + best.field + '); the real value may be above or below');
        flags.exact5 = best.v === DRAIN_MIN; flags.fee = passesDrain(best.v) ? 'above' : 'at-or-below'; deciding = best; feeBasis = 'drain';
        if (passesDrain(best.v)) { rwType = 'drain'; rules.push({ k: 'fee', t: 'DRAINAGE-SPECIFIC fee: ' + M.AMOUNT_KINDS[best.kind].label + ' = ' + fmt(best.v) + ' (source field: ' + best.field + ') is strictly greater than $5,000,000. Why it is drainage-specific: ' + why }); if (cand.drainScope && cand.drainScope.program) review.push(cand.drainScope.program); else if (PROGRAM_RE.test(title)) review.push('Title reads like a stormwater program / permit-support contract rather than a roadway project: verify it is engineering design work'); }
        else if (!edge) excl.push('drain-fee-not-above-5m');
      } else excl.push(bestCost ? 'project-cost-only' : 'no-stated-fee');
    } else {
      var dt = extractDrainageAmounts(text).filter(function (a) { return passesDrain(a.v); });
      if (dt.length) { deciding = dt.sort(function (a, b) { return b.v - a.v; })[0]; feeBasis = 'drain-text'; flags.fee = 'text'; rwType = 'drain'; review.push('Drainage-specific figure found by text parsing, not in a structured field (' + fmt(deciding.v) + ': "' + deciding.ctx + '"). Verify in the source.'); }
      else if (best) {
        flags.exact20 = best.v === TOTAL_MIN; deciding = best; feeBasis = 'total';
        var named = sc(title) ? title.match(SCOPE_RE)[0] : sc(String(cand.desc || '').slice(0, 3000)) ? String(cand.desc).slice(0, 3000).match(SCOPE_RE)[0] : null; flags.scopeNamesDrain = !!named;
        if (!passesTotal(best.v)) { flags.fee = 'at-or-below'; excl.push('total-fee-not-above-20m'); }
        else if (!named) { flags.fee = 'above'; excl.push('scope-does-not-name-drainage'); }
        else { flags.fee = 'above'; rwType = 'total'; rules.push({ k: 'fee', t: 'TOTAL roadway engineering fee (total fee, drainage share unknown): ' + M.AMOUNT_KINDS[best.kind].label + ' = ' + fmt(best.v) + ' (source field: ' + best.field + ') is strictly greater than $20,000,000. The scope text names "' + named + '". The source does not state how much of the fee is drainage.' }); }
      } else excl.push(bestCost ? 'project-cost-only' : 'no-stated-fee');
    }
    flags.rwType = rwType;

    var st = cand.status, due = cand.dates && cand.dates.due;
    if (st === 'awarded') rules.push({ k: 'status', t: 'Awarded contract (not an open solicitation)' });
    else if (st === 'open' || st === 'upcoming') {
      if (due && due < asOf) { flags.deadlinePassed = true; excl.push('deadline-passed'); }
      else rules.push({ k: 'status', t: (st === 'open' ? 'Open solicitation' : 'Upcoming / pre-solicitation') + (due ? '; response date ' + due + ' is on or after the snapshot date' : '; no response date in the source') });
    } else excl.push(st === 'inactive' ? 'not-active-status' : 'status-unknown');

    var hard = excl.filter(function (c) { return c !== 'deadline-passed'; }), bucket;
    if (hard.length) bucket = 'excluded'; else if (review.length) bucket = 'review'; else if (excl.indexOf('deadline-passed') >= 0) bucket = 'closed'; else bucket = st === 'awarded' ? 'award' : 'opp';
    return { bucket: bucket, primary: excl[0] || null, rules: rules, review: review, excl: excl, flags: flags, rw: rwType, feeBasis: feeBasis, amt: deciding, projectCost: bestCost, eng: eng, road: road };
  }

  var FEE_BASIS_LABEL = { drain: 'Drainage-specific fee (stated by the source)', 'drain-text': 'Drainage-specific figure parsed from notice text (verify)', total: 'Total fee, drainage share unknown' };
  function toRecordRw(cand, ev, asOf, prices) {
    var ids = ['roadway']; if (SCOPE_RE.test(cand.title || '') || ev.rw === 'drain') ids.push('drainage');
    var rec = M.toRecord(cand, { bucket: ev.bucket, rules: ev.rules, review: ev.review, flags: ev.flags, amt: ev.amt, projectCost: ev.projectCost, sector: { ids: ids, hits: [] } }, asOf);
    rec.rw = ev.rw || 'unknown'; rec.feeBasis = ev.feeBasis; rec.feeBasisLabel = FEE_BASIS_LABEL[ev.feeBasis] || null;
    if (ev.feeBasis === 'drain-text' && ev.amt) rec.amt = { v: ev.amt.v, kind: 'estvalue', field: ev.amt.field, ctx: ev.amt.ctx || null };
    var cb = C.baseFor({ title: cand.title, desc: cand.desc, projectCost: rec.projectCost, dates: cand.dates }, prices || {}, asOf);
    rec.cost = { status: cb.status, stated: cb.stated, scope: cb.scope, est: cb.est && cb.est.status === 'estimated' ? { low: cb.est.low, base: cb.est.base, high: cb.est.high, inputs: C.inputsFromScope(cb.scope), label: C.LABEL } : cb.est ? { reason: cb.est.reason, label: C.LABEL } : null };
    if (ev.flags.exact5) rec.flags = Object.assign({}, rec.flags, { exact5: true });
    return rec;
  }

  // ---- extra source normalizers (roadway lane only)
  function normUsaSub(s, prime) { // one USAspending subaward row (+ prime fields from the same row)
    return {
      src: 'usaspending-sub', srcId: String(s.id), url: s.url, title: (s.description || prime.title || '').slice(0, 300), desc: (s.description || '') + ' (prime award: ' + (prime.title || '') + ')', agency: prime.agency, subagency: prime.subagency || null, state: s.state || null, city: null,
      naics: prime.naics || '', psc: prime.psc || '', status: 'awarded', noticeType: 'Subaward', noticeLabel: 'Subaward under prime ' + prime.piid, awardee: s.subawardee, awardNum: String(s.id),
      drainScope: drainWord(s.description || '') ? { why: 'USAspending subaward description names drainage/hydraulics work: "' + DRAIN_RE.exec(s.description)[0] + '" (subaward amount is for this line item)' } : null,
      engOverride: /\b(?:construct\w*|excavat\w*|grading|clearing|paving|install\w*|erect\w*|reconstruction|trail)\b/i.test(s.description || '') ? { level: 'construction', why: 'Subaward description reads as construction work' } : /\b(?:engineering|design|survey\w*|hydrolog\w*|hydraulic (?:analysis|engineer|design|modeling)|A[-/]E|study)\b/i.test(s.description || '') ? { level: 'strong', why: 'Subaward description states engineering / design work' } : { level: 'none', why: 'Subaward description does not state engineering work' },
      amounts: [{ v: s.amount, kind: 'award', field: 'Sub-Award Amount (USAspending subaward search)' }], dates: { award: s.date }, fields: { 'Prime award': prime.piid, 'Prime recipient': prime.recipient, 'Subawardee': s.subawardee, 'Sub-award date': s.date, 'Prime NAICS': prime.naics, 'Prime PSC': prime.psc }
    };
  }

  // flags the roadway lane needs on candidates that the shared normalizers (model.js) produced
  function decorateRw(c) {
    if (c.src === 'txdot-pcl') { c.roadAgency = 'TxDOT Projected Contracts List (anticipated highway-agency consultant contracts)'; if (/hydraul|hydrolog/i.test(c.sourceDiscipline || '')) c.drainScope = { why: 'TxDOT list discipline = "' + c.sourceDiscipline + '" (structured field "Work" / discipline); the amount is the max value for that discipline contract' }; }
    else if (c.src === 'caltrans-lar' || c.src === 'caltrans-awards') { c.roadAgency = 'Caltrans A&E list (state highway agency)'; if (drainWord(c.title)) { c.drainScope = { why: 'Caltrans "Type of work" names it: "' + DRAIN_RE.exec(c.title)[0] + '" (structured field)' }; if (PROGRAM_RE.test(c.title)) c.drainScope.program = 'Caltrans type of work reads like a statewide stormwater regulatory / permit-support program, not a roadway project: verify before relying on it'; } }
    return c;
  }
  var RW_CSV_COLS = ['id', 'tab_bucket', 'fee_basis', 'status', 'title', 'agency', 'subagency', 'state', 'fee_or_value', 'fee_kind', 'fee_source_field', 'construction_cost_status', 'stated_construction_cost', 'stated_cost_field', 'estimated_cost_low_NOT_FROM_SOURCE', 'estimated_cost_base_NOT_FROM_SOURCE', 'estimated_cost_high_NOT_FROM_SOURCE', 'estimate_basis_or_reason', 'posted', 'response_due', 'est_date', 'award_date', 'end_date', 'recompete_inferred', 'awardee', 'rules', 'review_reasons', 'source', 'source_url', 'snapshot_as_of'];
  function cell(v) { v = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSVRoadway(recs, asOf) {
    var lines = [RW_CSV_COLS.join(',')];
    recs.forEach(function (r) {
      var d = r.dates || {}, c = r.cost || {}, e = c.est || {}, sc0 = c.scope || {}, inp = e.inputs || {};
      lines.push([r.id, r.bucket + (r.rw ? ':' + r.rw : ''), r.feeBasisLabel || '', r.status, r.title, r.agency, r.subagency, r.state, r.amt ? r.amt.v : '', r.amt ? (M.AMOUNT_KINDS[r.amt.kind] || {}).label : '', r.amt ? r.amt.field : '', c.status || '',
        c.stated ? c.stated.v : '', c.stated ? c.stated.field : '', e.low !== undefined ? Math.round(e.low) : '', e.base !== undefined ? Math.round(e.base) : '', e.high !== undefined ? Math.round(e.high) : '', e.base !== undefined ? 'Estimate (not from source): ' + inp.type + ', ' + (+inp.lengthMi).toFixed(2) + ' mi, ' + inp.lanes + ' lanes; ' + (sc0.evidence || []).join('; ') : (e.reason || ''),
        d.posted, d.due, d.est, d.award, d.end, r.recompete ? 'yes' : '', r.awardee, (r.rules || []).map(function (x) { return x.t; }).join(' | '), (r.review || []).join(' | '), r.src, r.url, asOf].map(cell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  // tabs: drain | total | review | awards   (default view is open/upcoming; awards are separate)
  function filterRoadway(recs, f, watch) {
    f = f || {}; var base = Object.assign({}, f); delete base.tab;
    return M.filterRecords(recs, base, watch).filter(function (r) {
      if (f.tab === 'drain') return r.bucket === 'opp' && r.rw === 'drain';
      if (f.tab === 'total') return r.bucket === 'opp' && r.rw === 'total';
      if (f.tab === 'review') return r.bucket === 'review';
      if (f.tab === 'awards') return r.bucket === 'award' || r.bucket === 'closed';
      if (f.tab === 'recompete') return !!r.recompete;
      return true;
    });
  }

  var api = { DRAIN_MIN: DRAIN_MIN, TOTAL_MIN: TOTAL_MIN, passesDrain: passesDrain, passesTotal: passesTotal, ROAD_RE: ROAD_RE, DRAIN_RE: DRAIN_RE, extractDrainageAmounts: extractDrainageAmounts, roadContext: roadContext, evaluateRoadway: evaluateRoadway, toRecordRw: toRecordRw,
    normUsaSub: normUsaSub, decorateRw: decorateRw, toCSVRoadway: toCSVRoadway, RW_CSV_COLS: RW_CSV_COLS, filterRoadway: filterRoadway, FEE_BASIS_LABEL: FEE_BASIS_LABEL, drainWord: drainWord };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NationalRoadway = api;
})(typeof self !== 'undefined' ? self : this);
