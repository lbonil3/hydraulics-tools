/* National Radar: shared model (browser + Node).
   One place for every rule that decides whether a record is shown, so the build script, the UI and the tests agree.
   Nothing here estimates a fee. A dollar figure is used for the fee test only when the source states it as a fee-type amount
   (capacity, ceiling, maximum value, not-to-exceed, award amount, obligated). A project / construction cost never counts. */
(function (root) {
  'use strict';

  var FEE_THRESHOLD = 20000000;               // "fee > $20M" means STRICTLY greater: $20,000,000.00 fails, $20,000,000.01 passes
  var RECOMPETE_MONTHS = 18;

  // ---------- dollar figures ----------
  function passesFee(v) { return typeof v === 'number' && isFinite(v) && v > FEE_THRESHOLD; }

  // What a figure IS. basis 'fee' can satisfy the fee test; 'cost' never can.
  var AMOUNT_KINDS = {
    capacity: { label: 'Contract capacity / ceiling (stated in notice text)', basis: 'fee', rank: 5 },
    maxvalue: { label: 'Maximum contract value', basis: 'fee', rank: 5 },
    nte: { label: 'Not-to-exceed amount (stated in notice text)', basis: 'fee', rank: 4 },
    estvalue: { label: 'Estimated contract value (stated in notice text)', basis: 'fee', rank: 3 },
    pricerange: { label: 'Price range (stated in notice text)', basis: 'fee', rank: 3 },
    options: { label: 'Base + all options value (ceiling)', basis: 'fee', rank: 5 },
    award: { label: 'Award amount', basis: 'fee', rank: 4 },
    obligated: { label: 'Obligated to date', basis: 'fee', rank: 2 },
    range: { label: 'Forecast dollar range (lower bound)', basis: 'fee', rank: 1 },
    project_cost: { label: 'Project cost (NOT a consultant fee)', basis: 'cost', rank: 0 }
  };
  function isFeeKind(k) { return !!(AMOUNT_KINDS[k] && AMOUNT_KINDS[k].basis === 'fee'); }

  function decodeEntities(s) {
    return String(s).replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function stripHtml(s) { return decodeEntities(String(s || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(); }
  function clean(s) { return String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/g, ' ').replace(/\s+/g, ' ').trim(); }

  var UNIT = { million: 1e6, mil: 1e6, mm: 1e6, m: 1e6, billion: 1e9, b: 1e9, bn: 1e9, thousand: 1e3, k: 1e3 };
  // Context words that decide what a figure in free text is. The nearest preceding keyword wins.
  var IGNORE_RE = /size standard|small business size|annual (?:revenue|receipts)|average annual|\breceipts\b|\bSBA\b|employees|standard (?:is|of)|bid (?:bond|guarantee)|performance (?:and|&) payment|per (?:day|hour|diem|month)|liquidated damages/ig;
  var COST_RE = /magnitude of construction|magnitude of the (?:project|construction)|construction (?:cost|value|budget|amount|estimate|contract)|(?:estimated|anticipated|programmed) (?:construction|project) (?:cost|value|budget|amount)|project (?:cost|budget|value|amount|estimate)|total project cost|cost of construction|estimated magnitude|magnitude/ig;
  var FEE_RES = [
    ['capacity', /(?:shared |total |aggregate |combined |overall |maximum |max )?capacity|shared (?:among|between|by)/ig],
    ['capacity', /contract ceiling|total ceiling|ceiling (?:value|amount|price)|\bceiling\b/ig],
    ['maxvalue', /max(?:imum)? (?:total |aggregate |contract |ordering |order |dollar |program )?(?:value|amount|price|dollar)/ig],
    ['nte', /not[- ]to[- ]exceed|(?:will|shall|may|must) not exceed|\bNTE\b/ig],
    ['pricerange', /price range/ig],
    ['estvalue', /(?:estimated|anticipated|approximate|total|aggregate) (?:contract |total |award |program )?(?:value|amount|price)|contract (?:value|amount|price)|dollar value|value of (?:all|the) (?:task|delivery) orders/ig]
  ];
  var NOT_TOTAL_RE = /\b(?:each|per (?:task|delivery|order|contract|award)|individual|minimum|guaranteed|guarantee|task order (?:maximum|limit)|initial (?:task )?order)\b/i;

  function lastIndexOfRe(re, s) { var last = -1, m; re.lastIndex = 0; while ((m = re.exec(s))) { last = m.index + m[0].length; if (m.index === re.lastIndex) re.lastIndex++; } return last; }

  // Find every $ figure in free text and say what each one is. Returns [{ v, raw, ctx, cls: 'fee'|'cost'|'ignore'|'other', kind }]
  function extractAmounts(text) {
    text = String(text || '');
    var out = [], re = /(?:US|USD)?\s?\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)\s*(million|billion|thousand|mil\b|mm\b|bn\b|m\b|b\b|k\b)?/gi, m;
    while ((m = re.exec(text))) {
      var num = parseFloat(m[1].replace(/,/g, ''));
      if (!isFinite(num)) continue;
      var u = (m[2] || '').toLowerCase(), v = num * (UNIT[u] || 1);
      if (num >= 1000 && u) v = num; // "$5,000,000 million" is a typo in the notice: the digits are already full dollars, so the unit word is ignored
      var idx = m.index, before = text.slice(Math.max(0, idx - 110), idx), after = text.slice(idx + m[0].length, idx + m[0].length + 40);
      // a figure like "$25.5M" followed by sentence text: keep as is. A bare "$5" (price per unit) is too small to matter.
      var cls = 'other', kind = null;
      var ig = lastIndexOfRe(IGNORE_RE, before.slice(-70)), co = lastIndexOfRe(COST_RE, before), fe = -1, fk = null;
      FEE_RES.forEach(function (p) { var i = lastIndexOfRe(p[1], before); if (i > fe) { fe = i; fk = p[0]; } });
      var igPos = ig < 0 ? -1 : before.length - 70 + ig;
      if (/^\s*(?:small business|annual|in annual|employees|per (?:year|hour|day))/i.test(after)) igPos = Math.max(igPos, before.length);
      var best = Math.max(igPos, co, fe);
      if (best >= 0) {
        if (best === igPos) cls = 'ignore';
        else if (best === co) cls = 'cost';
        else if (!NOT_TOTAL_RE.test(before.slice(Math.max(0, fe - 40)))) { cls = 'fee'; kind = fk; }
      }
      out.push({ v: v, raw: m[0].trim(), ctx: clean(before.slice(-70) + m[0] + after).slice(0, 190), cls: cls, kind: cls === 'fee' ? kind : cls === 'cost' ? 'project_cost' : null });
    }
    return out;
  }

  // ---------- sector (drainage / stormwater / flood / hydraulics / water resources / coastal / water / wastewater) ----------
  // A hit is a keyword match and is labeled "inferred" in the UI. "strong" words are specific enough to stand alone.
  var SECTORS = [
    { id: 'drainage', label: 'Drainage / stormwater', color: '#38bdf8', re: /\bdrainage\b|\bstorm ?water\b|\bstorm ?sewers?\b|\bstorm ?drains?\b|\bculverts?\b|\bMS4\b|\bdetention (?:basin|pond)s?\b|\bgreen infrastructure\b/i },
    { id: 'flood', label: 'Flood / hydraulics', color: '#60a5fa', re: /\bflood(?!light)\w*|\blevees?\b|\bhydrolog\w*|\bH&H\b|\bhydraulics\b(?!\s+(?:cylinder|fluid|press|pump|hose|lift|jack|tool|system))|\bhydraulic (?:model|design|engineering|analys[ie]s|structure)s?\b|\bdam safety\b|\bstream (?:restoration|stabilization)\b/i, weak: /\bdams?\b(?!age)|\bspillways?\b|\bwatersheds?\b|\bwater resources?\b|\bcivil works\b/i },
    { id: 'coastal', label: 'Coastal', color: '#2dd4bf', re: /\bcoastal (?:storm|flood|resilien\w*|protection|erosion|restoration|engineering|management|risk)\b|\bshoreline\b|\bbeach (?:nourishment|renourishment|restoration|fill)\b|\bstorm surge\b|\bsea[- ]?level\b/i, weak: /\bcoastal\b/i },
    { id: 'water', label: 'Water supply / treatment', color: '#22d3ee', re: /\bwater (?:treatment|supply|distribution|utility|utilities|infrastructure|quality|plant|reclamation|reuse|storage|tank|pipeline|conveyance|purification|works)\b|\bwaterlines?\b|\bwatermains?\b|\bdrinking water\b|\bpotable\b|\bWTP\b|\bdesalination\b|\blead service lines?\b|\baqueduct\b|\bwater (?:and|&) sewer\b/i, weak: /\breservoirs?\b|\bpump(?:ing)? station\b|\bwater (?:system|main|line)s?\b|\bpenstock\b/i },
    { id: 'wastewater', label: 'Wastewater / sewer', color: '#a78bfa', re: /\bwaste ?water\b|\bsewers?\b|\bsewage\b|\bsewerage\b|\bCSO\b|\bcombined sewer\b|\bWRRF\b|\bWWTP\b|\bbiosolids\b/i }
  ];
  // contexts that make a keyword hit something else (HVAC chilled water, vessels, etc.). They are removed before matching.
  var NOISE_RE = /chilled water|hot water|domestic water heater|water heater|water bottle|water jet|hydrostatic|sewer(?:ed)? (?:gloves|machine)|dam(?:age|aged)\b|\bAdam\b/ig;
  var NONCIVIL_TITLE_RE = /\b(?:vessels?|ships?(?!\s+channel)|submarines?|missiles?|aircraft|cyber\w*|unmanned|embassy|consulate|helicopters?|software|spectrum|rescue 21|ESPC|energy savings)\b/i;
  var DESC_WINDOW = 3000;
  function sectorHits(title, desc) {
    var t = String(title || '').replace(NOISE_RE, ' '), d = String(desc || '').slice(0, DESC_WINDOW).replace(NOISE_RE, ' ');
    var hits = [];
    SECTORS.forEach(function (s) {
      var mt = s.re.exec(t) || (s.weak && s.weak.exec(t)); if (mt) hits.push({ id: s.id, where: 'title', match: mt[0], strength: s.re.test(t) ? 'strong' : 'weak' });
      [['strong', s.re], ['weak', s.weak]].forEach(function (p) {
        if (!p[1]) return;
        var re = new RegExp(p[1].source, 'ig'), n = 0, first = null, mm;
        while ((mm = re.exec(d))) { n++; if (!first) first = mm[0]; if (mm.index === re.lastIndex) re.lastIndex++; }
        if (n) hits.push({ id: s.id, where: 'description', match: first, count: n, strength: p[0] });
      });
    });
    return hits;
  }
  // -> { level: 'title' | 'strong' | 'weak' | 'none', ids: [...], hits }
  // title = a sector word in the title; strong = description only, but 2+ sector groups or 3+ mentions of STRONG words (first 3,000 characters);
  // weak = anything less (a passing or generic-word mention) -> goes to Needs review, never the main list
  function classifySector(title, desc) {
    var hits = sectorHits(title, desc), ids = [], tIds = [], sIds = [], sCount = 0, anyDesc = false;
    hits.forEach(function (h) {
      if (ids.indexOf(h.id) < 0) ids.push(h.id);
      if (h.where === 'title' && tIds.indexOf(h.id) < 0) tIds.push(h.id);
      if (h.where === 'description') { anyDesc = true; if (h.strength === 'strong') { if (sIds.indexOf(h.id) < 0) sIds.push(h.id); sCount += h.count; } }
    });
    var level = tIds.length ? 'title' : (sIds.length >= 2 || sCount >= 3) ? 'strong' : anyDesc ? 'weak' : 'none';
    var blocked = (level !== 'title') && NONCIVIL_TITLE_RE.test(String(title || ''));
    if (blocked && level !== 'none') level = 'weak';
    if (NONCIVIL_TITLE_RE.test(String(title || '')) && /ESPC|energy savings/i.test(String(title || ''))) blocked = true;
    return { level: level, ids: ids, hits: hits, blocked: blocked };
  }
  function sectorLabel(id) { for (var i = 0; i < SECTORS.length; i++) if (SECTORS[i].id === id) return SECTORS[i].label; return id; }

  // ---------- engineering consultant services ----------
  var ENG_NAICS = { '541330': 'Engineering Services', '541370': 'Surveying and Mapping Services', '541620': 'Environmental Consulting Services', '541690': 'Other Scientific and Technical Consulting Services' };
  var WEAK_NAICS = { '541310': 'Architectural Services', '541320': 'Landscape Architectural Services', '541350': 'Building Inspection Services', '541380': 'Testing Laboratories', '541611': 'Administrative Management Consulting', '541990': 'All Other Professional Services', '562910': 'Remediation Services' };
  function isAEPsc(psc) { return /^C[12]/i.test(String(psc || '')); }
  // -> { level: 'strong' | 'weak' | 'construction' | 'none', why }
  var ENG_STRICT_RE = /engineering|\bdesign\b|architect|\bstudy\b|\bstudies\b|planning|\bPS&E\b|surveying|hydrolog|hydraul|modeling|\bA[-/]E\b/i;
  function engineering(naics, psc, text) {
    naics = String(naics || '').trim(); psc = String(psc || '').trim().toUpperCase();
    if (/^23\d{4}$/.test(naics)) return { level: 'construction', why: 'NAICS ' + naics + ' is a construction code' };
    if ((naics === '541620' || naics === '541690') && text !== undefined && !ENG_STRICT_RE.test(text.slice(0, text.indexOf('\u0001') < 0 ? 0 : text.indexOf('\u0001'))) && !isAEPsc(psc)) return { level: 'weak', why: 'NAICS ' + naics + ' ' + ENG_NAICS[naics] + ' is consulting, and the title has no engineering / design / study / planning words' };
    if ((naics === '541330' || naics === '541370') && psc && !isAEPsc(psc) && text !== undefined) { var ti = text.indexOf('\u0001'); var title0 = ti < 0 ? text : text.slice(0, ti); if (!ENG_STRICT_RE.test(title0)) return { level: 'weak', why: 'NAICS ' + naics + ' ' + ENG_NAICS[naics] + ', but PSC ' + psc + ' is not architect-engineer services and the title has no engineering / design / study / planning words' }; }
    if (ENG_NAICS[naics]) return { level: 'strong', why: 'NAICS ' + naics + ' ' + ENG_NAICS[naics] + (isAEPsc(psc) ? '; PSC ' + psc + ' (architect-engineer services)' : '') };
    if (isAEPsc(psc)) return { level: 'weak', why: 'PSC ' + psc + ' is architect-engineer services but NAICS ' + (naics || 'is missing') + ' is not an engineering-services code' };
    if (WEAK_NAICS[naics]) return { level: 'weak', why: 'NAICS ' + naics + ' ' + WEAK_NAICS[naics] + ' (not clearly engineering)' };
    return { level: 'none', why: 'NAICS ' + (naics || 'missing') + (psc ? ', PSC ' + psc : '') + ' is not an engineering-services code' };
  }
  var CONSTRUCTION_TITLE_RE = /\b(?:invitation for bids?|IFB|construction (?:contract|services?) for|design[- ]build|repair|replace(?:ment)? (?:of )?(?:roof|water ?line|sewer line)|remediation|dredging|beach fill)\b/i;
  var ENG_WORDS_RE = /architect[- ]?engineer|\bA[-/]E\b|engineering|design services|professional services|\bstudy\b|planning|\bPS&E\b|survey|program management|technical services|consult/i;

  // ---------- dates ----------
  function isoDate(s) {
    s = String(s || '').trim(); if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    return null;
  }
  function addMonths(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  // ---------- evaluation: one function decides bucket + the exact rules ----------
  // cand: { src, title, desc, naics, psc, status ('upcoming'|'open'|'awarded'), noticeType, amounts: [{v, kind, field, cls?}], dates: {due, end}, engOverride }
  // -> { bucket: 'opp'|'review'|'award'|'closed'|'excluded', rules: [..], review: [..], excl: [codes], flags: {...}, amt, projectCost, sector }
  function evaluate(cand, opts) {
    opts = opts || {}; var asOf = opts.asOf || new Date().toISOString().slice(0, 10);
    var rules = [], review = [], excl = [], flags = {};
    var eng = cand.engOverride || engineering(cand.naics, cand.psc, (cand.title || '') + '\u0001' + (cand.desc || ''));
    flags.eng = eng.level;
    if (eng.level === 'strong') rules.push({ k: 'eng', t: 'Engineering services: ' + eng.why });
    else if (eng.level === 'weak') review.push('Engineering status unclear: ' + eng.why);
    else excl.push(eng.level === 'construction' ? 'construction-naics' : 'not-engineering');
    if (cand.titleSuggestsConstruction && eng.level !== 'none') { excl.push('construction-title'); }
    if (cand.foreign) excl.push('outside-us');

    var sec = classifySector(cand.title, cand.desc); flags.sector = sec.level;
    if (sec.blocked) excl.push('non-civil-context');
    if (sec.level === 'title') rules.push({ k: 'sector', t: 'Sector keyword in the title: ' + sec.hits.filter(function (h) { return h.where === 'title'; }).map(function (h) { return '"' + h.match + '" (' + sectorLabel(h.id) + ')'; }).join(', ') + ' (inferred from words)' });
    else if (sec.level === 'strong') rules.push({ k: 'sector', t: 'Sector keywords in the description: ' + sec.hits.filter(function (h) { return h.where === 'description'; }).map(function (h) { return '"' + h.match + '" x' + h.count + ' (' + sectorLabel(h.id) + ')'; }).join(', ') + ' (inferred from words)' });
    else if (sec.level === 'weak') review.push('Only a passing sector mention' + (sec.blocked ? ' (title looks non-civil)' : '') + ': ' + sec.hits.map(function (h) { return '"' + h.match + '" in ' + h.where; }).join(', '));
    else excl.push('no-sector');

    // fee: only fee-basis amounts can pass
    var am = (cand.amounts || []).filter(function (a) { return typeof a.v === 'number' && isFinite(a.v); });
    var fees = am.filter(function (a) { return isFeeKind(a.kind); }), costs = am.filter(function (a) { return a.kind === 'project_cost'; });
    var bestFee = null; fees.forEach(function (a) { if (!bestFee || AMOUNT_KINDS[a.kind].rank > AMOUNT_KINDS[bestFee.kind].rank || (AMOUNT_KINDS[a.kind].rank === AMOUNT_KINDS[bestFee.kind].rank && a.v > bestFee.v)) bestFee = a; });
    var bestCost = null; costs.forEach(function (a) { if (!bestCost || a.v > bestCost.v) bestCost = a; });
    // the figure that decides: the highest-ranked fee kind; if a lower-ranked kind is above the threshold while the top one is not, send to review
    if (bestFee && !passesFee(bestFee.v)) { var alt = fees.filter(function (a) { return passesFee(a.v); })[0]; if (alt) { review.push('Fee figures disagree: ' + AMOUNT_KINDS[bestFee.kind].label + ' $' + bestFee.v.toLocaleString('en-US') + ' vs ' + AMOUNT_KINDS[alt.kind].label + ' $' + alt.v.toLocaleString('en-US')); bestFee = alt; flags.feeConflict = true; } }
    // a forecast range that STARTS at exactly $20M (e.g. "$20M to $50M") may be above or below the threshold: review, never a silent pass or drop
    var rangeEdge = !!(bestFee && bestFee.kind === 'range' && bestFee.v === FEE_THRESHOLD);
    if (rangeEdge) review.push('Forecast range starts at exactly $20,000,000 (' + bestFee.field + '); the real value may be above or below the threshold');
    flags.exact20 = !!(bestFee && bestFee.v === FEE_THRESHOLD);
    var feeOk = !!(bestFee && passesFee(bestFee.v)); flags.fee = bestFee ? (feeOk ? 'above' : 'at-or-below') : (bestCost ? 'cost-only' : 'none');
    if (feeOk) rules.push({ k: 'fee', t: AMOUNT_KINDS[bestFee.kind].label + ' = $' + bestFee.v.toLocaleString('en-US') + ' (source field: ' + bestFee.field + ') is strictly greater than $20,000,000' });
    else if (!bestFee) excl.push(bestCost ? 'project-cost-only' : 'no-stated-fee');
    else if (!rangeEdge) excl.push('fee-not-above-20m');

    // status
    var st = cand.status, due = cand.dates && cand.dates.due;
    if (st === 'awarded') { rules.push({ k: 'status', t: 'Awarded contract (not an open solicitation)' }); }
    else if (st === 'open' || st === 'upcoming') {
      if (due && due < asOf) { flags.deadlinePassed = true; excl.push('deadline-passed'); }
      else rules.push({ k: 'status', t: (st === 'open' ? 'Open solicitation' : 'Upcoming / pre-solicitation') + (due ? '; response date ' + due + ' is on or after the snapshot date' : '; no response date in the source') });
    } else excl.push(st === 'inactive' ? 'not-active-status' : 'status-unknown');

    // bucket
    var hard = excl.filter(function (c) { return c !== 'deadline-passed'; });
    var bucket;
    var noFeeOnly = hard.length === 1 && (hard[0] === 'no-stated-fee' || hard[0] === 'project-cost-only') && (st === 'open' || st === 'upcoming') && excl.indexOf('deadline-passed') < 0 && !review.length && flags.eng === 'strong' && flags.sector === 'title';
    if (noFeeOnly) bucket = 'nofee';
    else if (hard.length) bucket = 'excluded';
    else if (review.length) bucket = 'review';
    else if (excl.indexOf('deadline-passed') >= 0) bucket = 'closed';
    else bucket = st === 'awarded' ? 'award' : 'opp';
    return { bucket: bucket, primary: excl[0] || null, rules: rules, review: review, excl: excl, flags: flags, amt: feeOk || bestFee ? bestFee : null, projectCost: bestCost, sector: sec, eng: eng };
  }

  // ---------- normalizers ----------
  var SAM_STATUS = { 'Solicitation': 'open', 'Combined Synopsis/Solicitation': 'open', 'Presolicitation': 'upcoming', 'Sources Sought': 'upcoming', 'Special Notice': 'upcoming', 'Award Notice': 'awarded' };
  var SAM_TYPE_LABEL = { 'Solicitation': 'Solicitation', 'Combined Synopsis/Solicitation': 'Combined synopsis / solicitation', 'Presolicitation': 'Presolicitation (solicitation not yet issued)', 'Sources Sought': 'Sources sought (market research, not a solicitation)', 'Special Notice': 'Special notice (not a solicitation)', 'Award Notice': 'Award notice' };
  function samAmounts(row, text) {
    var out = [];
    var a = parseFloat(String(row['Award$'] || '').replace(/[^0-9.]/g, ''));
    if (row.Type === 'Award Notice' && isFinite(a) && a > 0) out.push({ v: a, kind: 'award', field: 'Award$ (SAM.gov extract column)' });
    extractAmounts(text).forEach(function (x) { if (x.cls === 'fee') out.push({ v: x.v, kind: x.kind, field: 'Description text', ctx: x.ctx }); else if (x.cls === 'cost') out.push({ v: x.v, kind: 'project_cost', field: 'Description text', ctx: x.ctx }); });
    return out;
  }
  function normSam(row) {
    var typ = row.Type, status = SAM_STATUS[typ]; if (!status) return null;
    var desc = stripHtml(row.Description), title = clean(row.Title);
    var amounts = samAmounts(row, title + '\n' + desc);
    var naics = clean(row.NaicsCode), psc = clean(row.ClassificationCode);
    var url = clean(row.Link) || null;
    return {
      src: 'sam', srcId: clean(row.NoticeId), url: url, title: title, desc: desc, agency: clean(row['Department/Ind.Agency']).replace(/, DEPARTMENT OF$/, ''), subagency: clean(row['Sub-Tier']), office: clean(row.Office),
      state: clean(row.PopState) || null, city: clean(row.PopCity) || null, naics: naics, psc: psc, status: status, noticeType: typ, noticeLabel: SAM_TYPE_LABEL[typ],
      amounts: amounts, dates: { posted: isoDate(row.PostedDate), due: status === 'awarded' ? null : isoDate(row.ResponseDeadLine), award: isoDate(row.AwardDate) },
      solNum: clean(row['Sol#']) || null, awardNum: clean(row.AwardNumber) || null, awardee: clean(row.Awardee) || null, foreign: !!(clean(row.PopCountry) && clean(row.PopCountry) !== 'USA'),
      titleSuggestsConstruction: CONSTRUCTION_TITLE_RE.test(title) && !ENG_WORDS_RE.test(title),
      fields: { 'Notice ID': clean(row.NoticeId), 'Solicitation #': clean(row['Sol#']), 'Type': typ, 'Posted': clean(row.PostedDate), 'Response deadline': clean(row.ResponseDeadLine), 'NAICS': naics, 'PSC (ClassificationCode)': psc, 'Set-aside': clean(row.SetASide), 'Office': clean(row.Office), 'Place of performance': [clean(row.PopCity), clean(row.PopState)].filter(Boolean).join(', '), 'Award number': clean(row.AwardNumber), 'Award$ field': clean(row['Award$']), 'Awardee': clean(row.Awardee) }
    };
  }

  function normUsa(r, detail) {
    var psc = r.PSC && r.PSC.code, naics = r.NAICS && r.NAICS.code, id = r['Award ID'];
    var amounts = [];
    if (typeof r['Award Amount'] === 'number') amounts.push({ v: r['Award Amount'], kind: 'obligated', field: 'Award Amount (USAspending total obligation)' });
    var bo = detail && detail.base_and_all_options; if (typeof bo === 'number' && bo > 0) amounts.push({ v: bo, kind: 'options', field: 'base_and_all_options (USAspending award detail)' });
    var isIdv = /IDV|INDEFINITE|GWAC|FSS|BOA|BPA/i.test(r['Contract Award Type'] || '') && !/DELIVERY ORDER|DEFINITIVE/i.test(r['Contract Award Type'] || '');
    var end = isoDate(r['End Date']) || isoDate(r['Last Date to Order']);
    return {
      src: 'usaspending', srcId: r.generated_internal_id, url: 'https://www.usaspending.gov/award/' + encodeURIComponent(r.generated_internal_id) + '/', title: clean(r.Description) || ('Award ' + id), desc: clean(r.Description),
      agency: clean(r['Awarding Agency']), subagency: clean(r['Awarding Sub Agency']), office: detail && detail.office || null, state: clean(r['Place of Performance State Code']) || null, city: null,
      naics: naics || '', psc: psc || '', status: 'awarded', noticeType: clean(r['Contract Award Type']), noticeLabel: 'Awarded ' + clean(r['Contract Award Type']).toLowerCase(),
      amounts: amounts, dates: { start: isoDate(r['Start Date']), end: end, award: isoDate(r['Base Obligation Date']) }, awardNum: id, solNum: detail && detail.solicitation || null, awardee: clean(r['Recipient Name']) || null,
      isIdv: isIdv, foreign: !!(r['Place of Performance Country Code'] && r['Place of Performance Country Code'] !== 'USA'),
      fields: { 'Award ID (PIID)': id, 'Recipient': clean(r['Recipient Name']), 'Award Amount (obligated)': r['Award Amount'], 'Base and all options': detail ? detail.base_and_all_options : undefined, 'Start': r['Start Date'], 'End': r['End Date'], 'Last date to order': r['Last Date to Order'], 'NAICS': (r.NAICS ? r.NAICS.code + ' ' + (r.NAICS.description || '') : ''), 'PSC': (r.PSC ? r.PSC.code + ' ' + (r.PSC.description || '') : ''), 'Awarding office': detail && detail.office || '', 'Solicitation ID': detail && detail.solicitation || '' }
    };
  }

  var NYC_ENG_RE = /design|engineer|architect|study|planning|survey|program management|construction management|resident engineer|inspection|consult|\bCM\b|\bREI\b|owner'?s rep/i;
  function normNyc(r) {
    var amt = parseFloat(r.contract_amount); var title = clean(r.short_title), vend = clean(r.vendor_name);
    var cat = clean(r.category_description), desc = stripHtml([r.additional_description_1, r.additional_description_2, r.additional_description_3].filter(Boolean).join('\n')).slice(0, 4000);
    var consult = cat === 'Construction Related Services';
    var designWords = /design|engineer|architect|study|planning|survey|resident engineer|\bREI\b|inspection/i.test(title + ' ' + vend);
    return {
      src: 'nyc', srcId: r.request_id, url: 'https://data.cityofnewyork.us/resource/dg92-zbpx.json?request_id=' + encodeURIComponent(r.request_id), title: title, desc: desc, agency: 'NYC ' + clean(r.agency_name), subagency: null, office: null, state: 'NY', city: 'New York',
      naics: '', psc: '', engOverride: consult && designWords ? { level: 'strong', why: 'City Record category "Construction Related Services" and the title/vendor name has design / engineering words (inferred from words; NYC gives no NAICS)' } : consult ? { level: 'weak', why: 'City Record category "Construction Related Services" but the title has only construction-management wording or no engineering wording; not clearly engineering design' } : { level: 'none', why: 'City Record category "' + cat + '" is not clearly consultant engineering' },
      status: /^award$/i.test(r.type_of_notice_description) ? 'awarded' : /intent to award/i.test(r.type_of_notice_description) ? 'awarded' : 'open', noticeType: clean(r.type_of_notice_description) + ' notice', noticeLabel: 'City Record ' + clean(r.type_of_notice_description).toLowerCase() + ' notice',
      amounts: isFinite(amt) && amt > 0 ? [{ v: amt, kind: 'award', field: 'contract_amount (City Record Online dataset)' }] : [], dates: { posted: isoDate(r.start_date), award: isoDate(r.start_date), due: isoDate(r.due_date) }, awardee: vend || null, awardNum: clean(r.pin) || null,
      fields: { 'Request ID': r.request_id, 'PIN': r.pin, 'Notice type': r.type_of_notice_description, 'Category': cat, 'Selection method': r.selection_method_description, 'Vendor': vend, 'contract_amount': r.contract_amount, 'Notice date': r.start_date }
    };
  }

  function normChicago(r) {
    var amt = parseFloat(r.award_amount), ct = clean(r.contract_type), pt = clean(r.procurement_type), title = clean(r.purchase_order_description);
    var isAE = /^ARCH\/ENG|ENGINEER|^PRO SERV/i.test(ct) || /^RFQ$/i.test(pt) && /ARCH|ENG/i.test(ct);
    return {
      src: 'chicago', srcId: r.purchase_order_contract_number + '#' + (r.revision_number || '0'), url: 'https://data.cityofchicago.org/resource/rsxa-ify5.json?purchase_order_contract_number=' + encodeURIComponent(r.purchase_order_contract_number), title: title, desc: title, agency: 'City of Chicago ' + clean(r.department).replace(/^CHICAGO /, ''), subagency: null, office: null, state: 'IL', city: 'Chicago',
      naics: '', psc: '', engOverride: isAE ? { level: 'strong', why: 'Chicago contract_type "' + ct + '" is an architect / engineering / professional-services category (stated by the City; Chicago gives no NAICS)' } : { level: 'none', why: 'Chicago contract_type "' + ct + '" is not an engineering services category' },
      status: 'awarded', noticeType: ct || pt, noticeLabel: 'Chicago contract (' + (pt || ct) + ')', amounts: isFinite(amt) && amt > 0 ? [{ v: amt, kind: 'award', field: 'award_amount (Chicago contracts dataset)' }] : [],
      dates: { start: isoDate(r.start_date), end: isoDate(r.end_date), award: isoDate(r.approval_date) }, awardee: clean(r.vendor_name) || null, awardNum: clean(r.purchase_order_contract_number),
      fields: { 'Contract number': r.purchase_order_contract_number, 'Revision': r.revision_number, 'Contract type': ct, 'Procurement type': pt, 'Vendor': clean(r.vendor_name), 'award_amount': r.award_amount, 'Start': r.start_date, 'End': r.end_date, 'Department': clean(r.department) }
    };
  }

  function normPcl(rec) { // rec = opportunity-radar parseProjectedContracts() record
    var ex = {}; (rec.extra || []).forEach(function (e) { ex[e[0]] = e[1]; });
    var disc = rec.work || '', hh = /hydraul|hydrolog/i.test(disc);
    return {
      src: 'txdot-pcl', srcId: rec.id, url: rec.url, title: rec.title, desc: rec.desc || '', agency: 'TxDOT', subagency: rec.district || null, office: ex['Procuring PEPS service center'] || null, state: 'TX', city: null,
      naics: '', psc: '', engOverride: { level: 'strong', why: 'TxDOT Projected Contracts List = anticipated architectural/engineering/surveying consultant contracts (source category)' },
      status: 'upcoming', noticeType: 'Projected A/E/S contract', noticeLabel: 'Projected consultant contract (TxDOT list; not yet advertised)',
      amounts: typeof rec.cost === 'number' ? [{ v: rec.cost, kind: 'maxvalue', field: 'Estimated max contract value (TxDOT xlsx column)' }] : [], dates: { due: null, est: rec.date }, sourceDiscipline: disc,
      fields: ex, forceSector: hh ? 'flood' : null
    };
  }

  var APFS_STATUS = { upcoming: 'upcoming' };
  function rangeLow(name) { // "Over $100M" -> 100e6; "$20M to $50M" -> 20e6 ; returns null if unparsable
    var m = /Over \$([0-9.]+)\s*([MK])/i.exec(name) || /\$([0-9.]+)\s*([MK]) to/i.exec(name); if (!m) return null; return parseFloat(m[1]) * (m[2].toUpperCase() === 'M' ? 1e6 : 1e3);
  }
  // "$20M - $49M" -> 20e6 (lower bound of an Acquisition Gateway estimated-contract-value range)
  function rangeLowText(label) {
    var m = /^\s*\$([0-9]+(?:\.[0-9]+)?)\s*([KMB])?\b/i.exec(String(label || '')); if (!m) return null;
    return parseFloat(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1);
  }
  var AG_STATUS = { 'Acquisition Planning': 'upcoming', 'Drafting Solicitation': 'upcoming', 'Solicitation Issued': 'open' };
  function normAg(x) { // x = one listing.data[].render object from the Acquisition Gateway forecast API
    var naics = (/field--name-name[^>]*>\s*(\d{6})\s*</.exec(x.field_naics_code || '') || [])[1] || '';
    var states = []; String(x.field_place_of_performance || '').replace(/administrative-area">([A-Z]{2})</g, function (_, a) { if (states.indexOf(a) < 0) states.push(a); return ''; });
    var label = clean(x.field_estimated_contract_v_max), low = rangeLowText(label), title = clean(x.title), desc = stripHtml(x.body);
    var fy = x.field_estimated_award_fy ? clean(x.field_estimated_award_fy) : null;
    return {
      src: 'ag-forecast', srcId: String(x.nid), url: 'https://ag-dashboard.acquisitiongateway.gov/api/v3.0/resources/forecast/details/' + encodeURIComponent(x.nid), title: title, desc: desc, agency: clean(x.field_result_id), subagency: clean(x.field_funding_organization) || null, office: null,
      state: states.length === 1 ? states[0] : null, city: null, naics: naics, psc: '', status: AG_STATUS[clean(x.field_award_status)] || 'inactive', noticeType: 'Forecast: ' + clean(x.field_award_status), noticeLabel: 'Agency procurement forecast (' + clean(x.field_award_status) + ')',
      amounts: low !== null ? [{ v: low, kind: 'range', field: 'Estimated Contract Value range "' + label + '" (lower bound) in the Acquisition Gateway forecast' }] : [], dates: { est: fy ? fy + '-09-30' : null, estLabel: fy ? 'Estimated award FY' + fy : null },
      solNum: clean(x.field_source_listing_id) || null,
      fields: { 'Forecast listing ID': clean(x.field_source_listing_id), 'Node ID': x.nid, 'Award status': clean(x.field_award_status), 'Estimated contract value range': label, 'Estimated award FY': fy, 'Contract type': clean(x.field_contract_type), 'Acquisition strategy': clean(x.field_acquisition_strategy), 'NAICS': naics, 'Places of performance': states.join(', ') }
    };
  }
  function xlDate(n) { return typeof n === 'number' && n > 25569 ? new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10) : null; }
  var CALTRANS_PAGE = 'https://dot.ca.gov/programs/procurement-and-contracts/ae-contract-information';
  var CALTRANS_LAR_URL = 'https://dot.ca.gov/-/media/dot-media/programs/procurement-contracts/documents/ae-lar/lookahead.xlsx';
  var CALTRANS_AWARD_URL = 'https://dot.ca.gov/-/media/dot-media/programs/procurement-contracts/documents/ae-award/aeaward.xlsx';
  // Caltrans A&E Look Ahead Report row (planned architect/engineer contracts, with the estimated contract amount)
  function normCaltransLar(r) {
    if (!r || !r[1] || typeof r[9] !== 'number') return null;
    var title = clean(r[8]), desc = clean(r[10]), adv = !!(r[5] || r[6]);
    return {
      src: 'caltrans-lar', srcId: String(r[1]), url: CALTRANS_LAR_URL, title: title, desc: desc, agency: 'Caltrans', subagency: 'District ' + clean(r[0]), office: null, state: 'CA', city: null, naics: clean(r[15]), psc: '',
      engOverride: { level: 'strong', why: 'Caltrans A&E Look Ahead Report = planned architect-engineer contracts (source category)' },
      status: adv ? 'open' : 'upcoming', noticeType: 'A&E look-ahead (' + clean(r[4]) + ')', noticeLabel: 'Planned Caltrans A&E contract (' + clean(r[4]) + ')',
      amounts: [{ v: r[9], kind: 'estvalue', field: 'Amount (Caltrans A&E Look Ahead Report, column "Amount")' }], dates: { est: xlDate(r[3]), estLabel: 'Est. Cal eProcure advertisement begins', due: null, posted: xlDate(r[2]) },
      fields: { 'Temp ID': clean(r[1]), 'District': clean(r[0]), 'Status': clean(r[4]), 'RFQ number': clean(r[5]), 'Term (years)': r[7], 'Type of work': title, 'Amount': r[9], 'New or replacement': clean(r[11]), 'Current/expired contract': clean(r[12]), 'NAICS codes': clean(r[15]) }
    };
  }
  function normCaltransAward(r) {
    if (!r || !/^\d{2}A\d{4}/.test(String(r[1] || '')) || typeof r[7] !== 'number') return null;
    var title = clean(r[3]), award = xlDate(r[4]), yrs = parseFloat(String(r[5] || '')); var end = award && isFinite(yrs) ? addMonths(award, Math.round(yrs * 12)) : null;
    return {
      src: 'caltrans-awards', srcId: String(r[1]), url: CALTRANS_AWARD_URL, title: title, desc: title, agency: 'Caltrans', subagency: null, office: null, state: 'CA', city: null, naics: '', psc: '',
      engOverride: { level: 'strong', why: 'Caltrans A&E awarded contracts list (source category: architect-engineer contracts)' },
      status: 'awarded', noticeType: 'A&E award', noticeLabel: 'Awarded Caltrans A&E contract', amounts: [{ v: r[7], kind: 'award', field: 'Total Contract Value (Caltrans A&E awarded contracts report)' }],
      dates: { award: award, end: end, endInferred: true }, awardee: clean(r[2]), awardNum: String(r[1]),
      fields: { 'Contract number': String(r[1]), 'Prime': clean(r[2]), 'Award date': award, 'Term of contract': clean(r[5]), 'Funding': clean(r[6]), 'Total contract value': r[7], 'End date (INFERRED = award date + term)': end }
    };
  }
  function normApfs(x) {
    var dr = x.dollar_range && x.dollar_range.display_name, low = dr ? rangeLow(dr) : null, naics = String(x.naics || '').slice(0, 6);
    var title = clean(x.requirements_title), desc = clean(x.requirement);
    return {
      src: 'dhs-apfs', srcId: x.apfs_number, url: 'https://apfs-cloud.dhs.gov/forecast/', title: title, desc: desc, agency: 'DHS', subagency: clean(x.organization), office: clean(x.contracting_office) || null, state: clean(x.place_of_performance_state) || null, city: clean(x.place_of_performance_city) || null,
      naics: naics, psc: '', status: 'upcoming', noticeType: 'Procurement forecast', noticeLabel: 'DHS procurement forecast (APFS)',
      amounts: low !== null ? [{ v: low, kind: 'range', field: 'dollar_range = "' + dr + '" (lower bound)' }] : [], dates: { due: null, est: isoDate(x.estimated_solicitation_release_date) || null, award: isoDate(x.anticipated_award_date) },
      fields: { 'APFS number': x.apfs_number, 'Dollar range': dr, 'Award quarter': x.award_quarter, 'Contract vehicle': x.contract_vehicle, 'NAICS': x.naics, 'Contract type': x.contract_type, 'Competitive': x.competitive, 'Published': x.published_date || x.publish_date }
    };
  }

  // ---------- dedupe ----------
  function nkey(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function titleKey(r) { return nkey(r.title).slice(0, 80) + '|' + nkey(r.agency).slice(0, 12); }
  // Merge records that are the same contract or notice. Keys: award number (PIID), solicitation number, or identical title+agency+amount.
  function dedupeKeys(r) {
    var ks = [];
    if (r.awardNum && nkey(r.awardNum).length >= 6) ks.push('A:' + nkey(r.awardNum));
    if (r.solNum && nkey(r.solNum).length >= 6) { ks.push('S:' + nkey(r.solNum)); ks.push('A:' + nkey(r.solNum)); } // a SAM solicitation number often becomes the PIID
    var a = r.amt && r.amt.v; if (a && r.title && r.title.length > 12) ks.push('T:' + titleKey(r) + '|' + Math.round(a));
    return ks;
  }
  function dedupeRank(x) { return (x.bucket === 'opp' ? 4 : x.bucket === 'award' ? 3 : x.bucket === 'review' ? 2 : 1) + (x.amt ? 1 : 0); }
  // Union-find over the keys: two records sharing any key are the same contract/notice. The best one is kept; the rest are listed in .also.
  function dedupe(recs) {
    var parent = recs.map(function (_, i) { return i; }), seen = {};
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    recs.forEach(function (r, i) { dedupeKeys(r).forEach(function (k) { if (seen[k] === undefined) seen[k] = i; else { var a = find(i), b = find(seen[k]); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); } }); });
    var groups = {}, order = [];
    recs.forEach(function (r, i) { var g = find(i); if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(r); });
    var out = [], merged = 0;
    order.forEach(function (g) {
      var list = groups[g], pick = list[0];
      list.forEach(function (r) { if (dedupeRank(r) > dedupeRank(pick) || (dedupeRank(r) === dedupeRank(pick) && ((r.dates && r.dates.posted) || '') > ((pick.dates && pick.dates.posted) || ''))) pick = r; });
      var also = [], have = {};
      list.forEach(function (r) { if (r === pick) return; merged++; [{ src: r.src, id: r.srcId, url: r.url, status: r.status, type: r.noticeType }].concat(r.also || []).forEach(function (x) { var k = x.src + ':' + x.id; if (!have[k] && !(x.src === pick.src && x.id === pick.srcId)) { have[k] = 1; also.push(x); } }); });
      (pick.also || []).forEach(function (x) { var k = x.src + ':' + x.id; if (!have[k]) { have[k] = 1; also.push(x); } });
      if (also.length) pick.also = also;
      out.push(pick);
    });
    out._merged = merged; return out;
  }

  // Shape a candidate + its evaluation into the stored record (shared by the build script and the in-browser live refresh)
  function toRecord(cand, ev, asOf) {
    var rec = {
      id: cand.src + ':' + cand.srcId, src: cand.src, srcId: cand.srcId, url: cand.url, bucket: ev.bucket, status: cand.status, noticeType: cand.noticeType, noticeLabel: cand.noticeLabel,
      title: cand.title.slice(0, 300), agency: cand.agency, subagency: cand.subagency || null, office: cand.office || null, state: cand.state || null, city: cand.city || null,
      sectors: ev.sector.ids, rules: ev.rules.slice(), review: ev.review, naics: cand.naics || null, psc: cand.psc || null,
      amt: ev.amt ? { v: ev.amt.v, kind: ev.amt.kind, field: ev.amt.field, ctx: ev.amt.ctx || null } : null,
      amts: (cand.amounts || []).filter(function (a) { return a.ctx || a.kind === 'project_cost' || a !== ev.amt; }).map(function (a) { return { v: a.v, kind: a.kind, field: a.field, ctx: a.ctx || null }; }).slice(0, 8),
      projectCost: ev.projectCost ? { v: ev.projectCost.v, field: ev.projectCost.field, ctx: ev.projectCost.ctx || null } : null,
      dates: cand.dates || {}, awardee: cand.awardee || null, awardNum: cand.awardNum || null, solNum: cand.solNum || null, fields: cand.fields || {},
      desc: (cand.desc || '').slice(0, 900) || null, sectorHits: ev.sector.hits.slice(0, 8), flags: ev.flags, isIdv: cand.isIdv || undefined
    };
    if (cand.lat) { rec.lat = cand.lat; rec.lon = cand.lon; rec.geo = cand.geo; }
    if (rec.bucket === 'award') {
      var end = cand.dates && cand.dates.end;
      if (end && end >= asOf && end <= addMonths(asOf, RECOMPETE_MONTHS)) { rec.recompete = true; rec.rules.push({ k: 'recompete', t: 'INFERRED recompete watch: ' + (cand.dates.endInferred ? 'the end date ' + end + ' is computed here as award date + stated term' : 'the source gives an end date of ' + end) + ', within ' + RECOMPETE_MONTHS + ' months of the snapshot. The agency has not announced a new solicitation.' }); }
    }
    return rec;
  }

  // ---------- UI helpers ----------
  function fmtMoney(v) { if (v === null || v === undefined || !isFinite(v)) return 'n/a'; if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 2).replace(/\.?0+$/, '') + 'B'; if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'; return '$' + Math.round(v).toLocaleString('en-US'); }
  function fmtMoneyFull(v) { return v === null || v === undefined ? 'n/a' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function fmtDate(iso) { if (!iso) return 'n/a'; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso; return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1]; }
  function monthKey(iso) { return iso ? iso.slice(0, 7) : null; }

  var STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };

  // filters: f = { q, tab ('opp'|'review'|'recompete'|'awards'), states[], agencies[], statuses[], sectors[], sources[], feeMin, feeMax, costToggle, costMin, watchOnly }
  function matchText(r, q) {
    if (!q) return true; var hay = [r.title, r.agency, r.subagency, r.state, r.city, r.awardee, r.awardNum, r.solNum, r.naics, r.psc].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function filterRecords(recs, f, watch) {
    f = f || {}; watch = watch || {};
    return recs.filter(function (r) {
      if (f.tab === 'opp' && r.bucket !== 'opp') return false;
      if (f.tab === 'review' && r.bucket !== 'review') return false;
      if (f.tab === 'nofee' && r.bucket !== 'nofee') return false;
      if (f.tab === 'recompete' && !r.recompete) return false;
      if (f.tab === 'awards' && !(r.bucket === 'award' || r.bucket === 'closed')) return false;
      if (f.states && f.states.length && f.states.indexOf(r.state || '??') < 0) return false;
      if (f.agencies && f.agencies.length && f.agencies.indexOf(r.agency) < 0) return false;
      if (f.statuses && f.statuses.length && f.statuses.indexOf(r.status) < 0) return false;
      if (f.sources && f.sources.length && f.sources.indexOf(r.src) < 0) return false;
      if (f.sectors && f.sectors.length && !(r.sectors || []).some(function (s) { return f.sectors.indexOf(s) >= 0; })) return false;
      var v = r.amt ? r.amt.v : null;
      if (f.feeMin !== undefined && f.feeMin !== null && !(v !== null && v > f.feeMin)) return false;   // strictly greater, like the main rule
      if (f.feeMax !== undefined && f.feeMax !== null && !(v !== null && v <= f.feeMax)) return false;
      if (f.costMin !== undefined && f.costMin !== null && !(r.projectCost && r.projectCost.v > f.costMin)) return false;
      if (f.watchOnly && !watch[r.id]) return false;
      return matchText(r, f.q);
    });
  }
  function sortRecords(recs, key) {
    var a = recs.slice();
    var fee = function (r) { return r.amt ? r.amt.v : -1; }, dd = function (r) { return r.dates && (r.dates.due || r.dates.est || r.dates.end || r.dates.award || r.dates.posted) || '9999'; };
    if (key === 'date') a.sort(function (x, y) { return dd(x) < dd(y) ? -1 : dd(x) > dd(y) ? 1 : fee(y) - fee(x); });
    else if (key === 'agency') a.sort(function (x, y) { return x.agency < y.agency ? -1 : x.agency > y.agency ? 1 : fee(y) - fee(x); });
    else a.sort(function (x, y) { return fee(y) - fee(x) || (x.title < y.title ? -1 : 1); });
    return a;
  }
  function countBy(recs, fn) { var m = {}; recs.forEach(function (r) { var ks = [].concat(fn(r)); ks.forEach(function (k) { if (k === null || k === undefined) return; m[k] = (m[k] || 0) + 1; }); }); return m; }
  function sumBy(recs, fn, val) { var m = {}; recs.forEach(function (r) { var k = fn(r); if (k === null || k === undefined) return; m[k] = (m[k] || 0) + (val(r) || 0); }); return m; }

  var CSV_COLS = ['id', 'bucket', 'status', 'title', 'agency', 'subagency', 'state', 'city', 'fee_or_value', 'fee_kind', 'fee_source_field', 'project_cost_not_fee', 'sectors', 'notice_type', 'posted', 'response_due', 'est_date', 'award_date', 'end_date', 'recompete_inferred', 'naics', 'psc', 'awardee', 'rules', 'review_reasons', 'source', 'source_url', 'snapshot_as_of'];
  function csvCell(v) { v = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(recs, asOf) {
    var lines = [CSV_COLS.join(',')];
    recs.forEach(function (r) {
      var d = r.dates || {};
      lines.push([r.id, r.bucket, r.status, r.title, r.agency, r.subagency, r.state, r.city, r.amt ? r.amt.v : '', r.amt ? (AMOUNT_KINDS[r.amt.kind] || {}).label : '', r.amt ? r.amt.field : '', r.projectCost ? r.projectCost.v : '', (r.sectors || []).join('; '), r.noticeType, d.posted, d.due, d.est, d.award, d.end, r.recompete ? 'yes' : '', r.naics, r.psc, r.awardee, (r.rules || []).map(function (x) { return x.t; }).join(' | '), (r.review || []).join(' | '), r.src, r.url, asOf].map(csvCell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  var api = {
    FEE_THRESHOLD: FEE_THRESHOLD, RECOMPETE_MONTHS: RECOMPETE_MONTHS, AMOUNT_KINDS: AMOUNT_KINDS, SECTORS: SECTORS, ENG_NAICS: ENG_NAICS, STATE_NAMES: STATE_NAMES, CSV_COLS: CSV_COLS,
    passesFee: passesFee, isFeeKind: isFeeKind, extractAmounts: extractAmounts, classifySector: classifySector, sectorLabel: sectorLabel, engineering: engineering, isAEPsc: isAEPsc, evaluate: evaluate,
    normSam: normSam, normUsa: normUsa, normNyc: normNyc, normChicago: normChicago, normPcl: normPcl, normApfs: normApfs, normAg: normAg, normCaltransLar: normCaltransLar, normCaltransAward: normCaltransAward, xlDate: xlDate, CALTRANS_PAGE: CALTRANS_PAGE, CALTRANS_LAR_URL: CALTRANS_LAR_URL, CALTRANS_AWARD_URL: CALTRANS_AWARD_URL, rangeLow: rangeLow, rangeLowText: rangeLowText, dedupe: dedupe, toRecord: toRecord,
    stripHtml: stripHtml, decodeEntities: decodeEntities, clean: clean, isoDate: isoDate, addMonths: addMonths, daysBetween: daysBetween,
    fmtMoney: fmtMoney, fmtMoneyFull: fmtMoneyFull, fmtDate: fmtDate, monthKey: monthKey, filterRecords: filterRecords, sortRecords: sortRecords, countBy: countBy, sumBy: sumBy, toCSV: toCSV
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NationalModel = api;
})(typeof self !== 'undefined' ? self : this);
