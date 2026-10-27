/* National Radar: PS&E / H&H lens (the default view) plus the Design-build lens and the "Large projects, fee not published" pipeline lens.
   The older water (> $20M) and roadway (> $5M drainage) lanes in model.js / roadway.js are untouched and stay reachable as presets.
   Honesty rules in this file:
   - lens "fee": consultant engineering services (PS&E, final / detailed design, H&H, drainage, stormwater, flood, culvert, coastal, resilience) whose SOURCE states a fee / contract value.
     The strict logic is a badge ("Confirmed"), not a gate. Data floor is $5,000,000 (>=); the visible threshold is applied with strict > (or >= when the toggle is on).
   - lens "db": design-build / progressive DB / CMGC / P3 procurements. The only figure is a design-build CONTRACT VALUE or project cost (construction-dominated). It is never a fee.
     Only a separately stated design fee / design portion (found in the text) can count toward the fee test, and it is shown as its own text-parsed record.
   - lens "pipeline": design-phase projects with a STATED construction cost and no stated fee. Project cost is never a fee. Any fee range shown is an Estimate with a cited source. */
(function (root) {
  'use strict';
  var M = typeof require !== 'undefined' ? require('./model.js') : root.NationalModel;
  var R = typeof require !== 'undefined' ? require('./roadway.js') : root.NationalRoadway;
  var FEE_FLOOR = 5000000;          // lowest fee kept in the data
  var DEFAULT_FEE = 5000000;        // default visible threshold
  var PIPE_FLOOR = 25000000;        // lowest stated project cost kept in the data for the pipeline lens
  var PIPE_DEFAULT = 50000000;      // default cost threshold: $5M / 10% (top of the cited 6% to 10% range)
  var ILLUSTRATIVE = { low: 0.06, high: 0.10, label: 'Illustrative fee range (Estimate)', cite: 'Arkansas State Highway and Transportation Department, Design-Build Procurement Manual, Appendix H (Sept 2015): "In DB-B, design firms typically receive a fee of 6% to 10% of anticipated construction costs for design services."', url: 'https://codeofarrules.arkansas.gov/Rules/AppendixDocument?appendixID=239&partID=1037' };
  var FORECAST_SRC = ['txdot-pcl', 'dhs-apfs', 'ag-forecast', 'caltrans-lar', 'wsdot-proj'];

  var HH_RE = /hydrolog\w*|hydraul(?:ic|ics)\b|\bH&H\b|drainage|storm ?water|storm drain\w*|storm sewer|culverts?|flood(?:plain|ing)?s?\b|coastal|(?:flood|storm|shoreline|climate|coastal) resilien(?:ce|cy|t)|levees?|detention (?:basin|pond)s?|watershed|outfalls?|stream (?:restoration|stabilization)|storm surge|erosion control/i;
  var HH_NOISE_RE = /hydraulic (?:hose|fluid|pump|cylinder|motor|press|lift|jack|brake|tool|power unit|crane|excavator|actuator|hammer)|hydraulics? (?:equipment|repair kit)|chilled water|water heater|flood ?light|resilient (?:flooring|floor|tile|seat)|coastal systems station|thermal[- ]hydraulic|\bAWIPS\b|weather interactive/i;
  var BUILDING_RE = /barracks|courthouse|facade|hospital|dormitor|dorm\b|housing|hvac|elevator|office building|embassy|consulate|laborator|clinic|ammunition|magazine|check ?point|port of entry|child development|galley|firehouse|training facility|agrivoltaic|solar array|security fenc|barrier fenc|ready building|asset integration/i;
  var PSE_RE = /\bPS&E\b|\bPSE\b|plans,? (?:specifications|specs)|plans and specifications|specifications (?:and|&) estimates?|final design|detailed design|design services|design phase|engineering design|design engineering|design[- ]bid[- ]build|full design|\d+% design|construction documents|design package|preliminary (?:design|engineering)/i;
  var DB_RE = /design[- ]?build|progressive design|\bPDB\b|\bCMGC\b|CM[- ]at[- ]risk|construction manager[- ]at[- ]risk|public[- ]private partnership|\bP3\b|comprehensive development agreement|\bCDA\b/i;
  var NOT_DESIGN_RE = /\bESPC\b|energy savings|call center|customer service|\bbilling\b|software|help ?desk|test and evaluation|knowledge management|technical,? (?:and |& )?administrative|administrative support|program support|programmatic support|acquisition support|\bIT services|cyber|training services|analytical support/i;
  var CM_RE = /construction (?:management|engineering|inspection|administration|observation)|\bCM\b|resident engineer|inspection services|quality assurance|\bQA\b|\bCEI\b|oversight|program management/i;
  var DESIGN_WORD_RE = /design|PS&E|plans (?:and|&) spec|hydrolog|hydraul|H&H|\bstud(?:y|ies)\b|master plan|modell?ing|architect/i;
  var TITLE_CONSTR_RE = /\b(?:construction|repairs?|replacement|rehabilitation|reconstruction|installation|maintenance|dredging|demolition|renovation|upgrades?|wharf)\b/i;
  var PROGRAM_RE = /regulatory|permit|compliance|NPDES|\bMS4\b|monitoring|outreach|training|technical (?:and administrative )?support/i;

  function fmt(v) { return '$' + Number(v).toLocaleString('en-US'); }
  function hh(s) { s = String(s || ''); var m = HH_RE.exec(s); return m && !HH_NOISE_RE.test(s) ? m[0] : null; }

  // $ amounts that sit directly on a design-fee phrase or a stipend phrase in free text (heuristic; text-parsed)
  var DESIGN_PART_RE = /design (?:fee|portion|component|cost|contract (?:value|amount))|design services? (?:fee|cost|value|amount)|fee for (?:the )?design|A\/E (?:fee|portion)|engineering (?:fee|portion)/i;
  function amountsNear(text, phraseRe, notRe) {
    var out = [], t = String(text || ''), all = M.extractAmounts(t), seen = {}, rx = /\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|M)\b)?/gi, m;
    all.forEach(function (a) { seen[a.v] = a; });
    while ((m = rx.exec(t))) {
      var raw = m[0], num = parseFloat(raw.replace(/[$,\s]|million|M/gi, '')); if (/million|M\b/i.test(raw)) num *= 1e6;
      if (!isFinite(num) || !seen[num]) continue;
      var before = t.slice(Math.max(0, m.index - 100), m.index), cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; '), before.lastIndexOf('\n')); if (cut >= 0) before = before.slice(cut + 2);
      var after = t.slice(m.index + raw.length, m.index + raw.length + 60), ctx = (before + raw + after).replace(/\s+/g, ' ').trim();
      var hitB = phraseRe.exec(before), hitA = /^[^.;]{0,25}?(?:for|toward)\s+(?:the\s+)?(?:\w+\s+){0,2}?(?:design|stipend)/i.exec(after);
      if ((hitB && !(notRe && notRe.test(before.slice(hitB.index)))) || (hitA && phraseRe === DESIGN_PART_RE && /design/i.test(hitA[0])) || (hitA && phraseRe !== DESIGN_PART_RE && /stipend/i.test(hitA[0]))) out.push({ v: num, ctx: ctx.slice(-200) });
    }
    return out;
  }
  function extractDesignFee(text) { return amountsNear(text, DESIGN_PART_RE, /\b(?:total|overall|construction|aggregate|entire)\b/i).sort(function (a, b) { return b.v - a.v; })[0] || null; }
  function extractStipend(text) { return amountsNear(text, /stipend|honorari(?:um|a)/i, null).sort(function (a, b) { return b.v - a.v; })[0] || null; }

  function scopeOf(cand) {
    var NG = new RegExp(HH_NOISE_RE.source, 'gi'), title = (cand.title || '').replace(NG, ' '), desc = String(cand.desc || '').slice(0, 3000).replace(NG, ' '), sec = M.classifySector(title, desc);
    var hT = hh(title), hD = hh(desc), pT = PSE_RE.exec(title), pD = PSE_RE.exec(desc);
    var road = R.ROAD_RE.test(title) || !!cand.roadAgency || (desc.match(new RegExp(R.ROAD_RE.source, 'gi')) || []).length >= 2;
    var ag = String(cand.agency || '') + ' ' + String(cand.subagency || ''), agRoad = /transportation|highway|\bDOT\b|public works|department of streets/i.test(ag), agWater = /water management|water (?:department|utilit|resources|authority|district)|sewer|wastewater|drainage|flood control/i.test(ag);
    var agencyOnly = !!(pT || pD) && !(hT || hD) && !road && sec.ids.length === 0 && (agRoad || agWater);
    if (agencyOnly) { if (agRoad) road = true; }
    var domains = []; if (road) domains.push('road'); if (agencyOnly && agWater) domains.push('water'); sec.ids.forEach(function (i) { if (domains.indexOf(i) < 0) domains.push(i); });
    var inTitle = !!(hT || (sec.level === 'title')), level = inTitle ? 'title' : (hD || agencyOnly || sec.level === 'strong' || sec.level === 'weak') ? 'desc' : 'none';
    return { hh: hT || hD || null, pse: (pT && pT[0]) || (pD && pD[0]) || null, level: level, domains: domains, road: road, sec: sec, blocked: sec.blocked };
  }
  function dbTypeOf(text) {
    if (/progressive design[- ]?build|\bPDB\b/i.test(text)) return 'Progressive design-build';
    if (/\bCMGC\b|CM[- ]at[- ]risk|construction manager[- ]at[- ]risk/i.test(text)) return 'CMGC / CM at risk (design included only if stated)';
    if (/comprehensive development agreement|\bCDA\b|public[- ]private|\bP3\b/i.test(text)) return 'P3 / CDA';
    return 'Design-build';
  }
  function dbRoleOf(cand, text) {
    var naics = String(cand.naics || '');
    if (/^5413|^541620|^541690/.test(naics)) return { role: 'prime', label: 'DB prime opportunity (inferred)', why: 'inferred: the notice carries an engineering NAICS (' + naics + '), so an engineering firm can propose as the design-builder' };
    if (/engineer[- ]led|A\/E[- ]led|architect[- ]engineer[- ]led|design[- ]builder (?:may|can|could) be (?:an? )?(?:engineering|A\/E)/i.test(text)) return { role: 'prime', label: 'DB prime opportunity (inferred)', why: 'inferred: the text says the design-builder may be engineer-led' };
    return { role: 'sub', label: 'Design-subconsultant to DB team (inferred)', why: 'inferred: design-build contracts like this are normally awarded to contractor-led teams' + (naics ? ' (NAICS ' + naics + ')' : '') + ', and the engineering firm is typically the team\'s design subconsultant. Not stated by the owner.' };
  }

  function evaluatePse(cand, opts) {
    opts = opts || {}; var asOf = opts.asOf || new Date().toISOString().slice(0, 10);
    var title = cand.title || '', desc = String(cand.desc || '').slice(0, 3000), text = title + '\n' + desc;
    var excl = [], why = [], badges = [], rules = [], flags = {};
    var eng = cand.engOverride || M.engineering(cand.naics, cand.psc, title + '\u0001' + (cand.desc || ''));
    flags.eng = eng.level;
    var sc = scopeOf(cand); flags.scope = sc.level;
    var isDb = !!cand.dbSource || DB_RE.test(title) || (eng.level !== 'strong' && DB_RE.test(desc.slice(0, 1500)) && /design[- ]?build|progressive/i.test(desc.slice(0, 1500)));
    var am = (cand.amounts || []).filter(function (a) { return typeof a.v === 'number' && isFinite(a.v) && a.v > 0; });
    var fees = am.filter(function (a) { return M.isFeeKind(a.kind); }), costs = am.filter(function (a) { return a.kind === 'project_cost'; });
    var st = cand.status, due = cand.dates && cand.dates.due, stage;
    if (st === 'awarded') stage = 'awarded';
    else if ((st === 'open' || st === 'upcoming') && due && due < asOf) stage = 'closed';
    else if (st === 'open' || st === 'upcoming') stage = (FORECAST_SRC.indexOf(cand.src) >= 0 || /forecast|projected|look-ahead/i.test(cand.noticeType || '')) ? 'forecast' : 'open';
    else stage = 'unclear';
    if (cand.foreign) excl.push('outside-us');
    if ((st === 'open' || st === 'upcoming') && !due && cand.dates && cand.dates.posted && cand.dates.posted < M.addMonths(asOf, -12) && !cand.projectList) excl.push('stale-no-deadline');

    // ---------------- design-build lens ----------------
    if (isDb) {
      var naicsCivil = /^237/.test(String(cand.naics || '')), hT = hh(title), roadT = R.ROAD_RE.test(title) || !!cand.roadAgency, secT = sc.sec.level === 'title';
      var civil = hT || secT || roadT || (naicsCivil && (sc.hh || sc.sec.ids.length || sc.road)); if (!civil) excl.push('db-not-civil-scope');
      if (BUILDING_RE.test(title) && !hT) excl.push('non-civil-context');
      if (sc.blocked) excl.push('non-civil-context');
      var all = fees.concat(costs), val = null; all.forEach(function (a) { var rk = a.kind === 'project_cost' ? 0 : M.AMOUNT_KINDS[a.kind].rank; if (!val || rk > val._r || (rk === val._r && a.v > val.v)) val = { v: a.v, kind: a.kind, field: a.field, ctx: a.ctx || null, _r: rk }; });
      var df = extractDesignFee(text), stp = extractStipend(text), type = dbTypeOf(text), role = dbRoleOf(cand, text);
      badges.push('Design-build'); if (sc.hh) badges.push('Drainage / H&H named'); if (stage === 'awarded') badges.push('Awarded'); if (stage === 'forecast') badges.push('Forecast'); if (stage === 'closed') badges.push('Closed'); if (stage === 'unclear') badges.push('Status unclear');
      if (!val) badges.push('Value not stated');
      rules.push({ k: 'db', t: type + ' procurement: "' + (DB_RE.exec(title) || DB_RE.exec(desc) || ['design-build'])[0] + '" in the ' + (DB_RE.test(title) ? 'title' : 'description') + '. Design is part of the contract, so PS&E-type design is in scope; drainage / H&H ' + (sc.hh ? 'is named ("' + sc.hh + '")' : 'is not named in the text') + '.' });
      if (val) rules.push({ k: 'value', t: 'Stated value = ' + fmt(val.v) + ' (source field: ' + val.field + '). For design-build this is the contract value / estimated project cost and includes construction. It is NOT a design fee and is never tested against the fee threshold.' });
      var hard = excl;
      return { lens: hard.length ? null : 'db', excl: excl, stage: stage, rules: rules, badges: badges, why: why, flags: flags, scope: sc, eng: eng, dbValue: val ? { v: val.v, kind: 'db_value', srcKind: val.kind, field: val.field, ctx: val.ctx } : null, designFee: df, stipend: stp, dbType: type, dbRole: role };
    }

    // ---------------- fee lens ----------------
    if (cand.titleSuggestsConstruction && eng.level !== 'strong') excl.push('construction'); // IFB / construction-contract titles stay out
    var t600 = title + ' ' + desc.slice(0, 1500), tDesign = DESIGN_WORD_RE.test(title);
    if (BUILDING_RE.test(title) && !hh(title)) excl.push('non-civil-context');
    else if (/software|call center|\bbilling\b|help ?desk|cyber|\bESPC\b|energy savings/i.test(title)) excl.push('not-design-services');
    else if (NOT_DESIGN_RE.test(title) && !tDesign) excl.push('not-design-services');
    else if (CM_RE.test(title) && !tDesign) excl.push('not-design-services');
    else if (TITLE_CONSTR_RE.test(title) && !tDesign && !/engineer|architect|\bA[-\/]E\b/i.test(title)) excl.push('construction');
    else if (!DESIGN_WORD_RE.test(t600) && !/engineer|\bA[-\/]E\b/i.test(t600) && !cand.projectList) excl.push('not-design-services');
    if (eng.level === 'construction') excl.push('construction'); else if (eng.level === 'none' && !cand.projectList) excl.push('not-engineering');
    if (sc.blocked && sc.level !== 'title') excl.push('non-civil-context');
    var hasScope = !!(sc.hh || ((sc.pse || DESIGN_WORD_RE.test(title) || /engineer/i.test(title)) && (sc.road || sc.sec.ids.length || sc.domains.length)) || sc.sec.level === 'title' || sc.sec.level === 'strong');
    if (!hasScope) excl.push('no-scope-match');
    if (cand.nonDesign) excl.push('not-design-services');
    var best = null; fees.forEach(function (a) { var rk = M.AMOUNT_KINDS[a.kind].rank; if (!best || rk > M.AMOUNT_KINDS[best.kind].rank || (rk === M.AMOUNT_KINDS[best.kind].rank && a.v > best.v)) best = a; });
    var bestCost = null; costs.forEach(function (a) { if (!bestCost || a.v > bestCost.v) bestCost = a; });
    if (best && best.v < FEE_FLOOR) { var alt = fees.filter(function (a) { return a.v >= FEE_FLOOR; })[0]; if (alt) { best = alt; why.push('Fee figures differ between fields; the larger one is shown (' + alt.field + ')'); } }
    var hardNonFee = excl.length;
    // advance notices (agency forecasts / projected advertisements) with no stated fee, or a stated value below the $5M data floor, go to their own lens. They never reach a fee filter.
    if (cand.advance && !hardNonFee && (!best || best.v < FEE_FLOOR) && (stage === 'forecast' || stage === 'open')) return advanceResult(cand, sc, eng, stage, best, rules, why);
    if (!best) { if (bestCost && !hardNonFee && bestCost.v >= PIPE_FLOOR && sc.hh && (stage === 'open' || stage === 'forecast')) return pipelineResult(cand, sc, eng, stage, bestCost, rules); excl.push(bestCost ? 'project-cost-only' : 'no-stated-fee'); }
    else if (best.v < FEE_FLOOR) excl.push('fee-below-5m');
    if (excl.length) return { lens: null, excl: excl, stage: stage, flags: flags, scope: sc, eng: eng, amt: best || null };

    var textParsed = best.field === 'Description text' || /notice text|description text/i.test(best.field || ''); if (best.kind === 'range') flags.range = true;
    flags.exact5 = best.v === FEE_FLOOR; flags.textParsed = textParsed;
    if (textParsed) { badges.push('Text-parsed'); why.push('The fee comes from free text in the notice, not a structured field'); }
    if (eng.level === 'weak') why.push('Engineering status is unclear: ' + eng.why);
    if (sc.level !== 'title') { badges.push('Inferred sector'); why.push('Scope keywords appear only in the description (' + (sc.hh || sc.pse || 'sector words') + '), not the title'); }
    if (best.kind === 'range') { badges.push('Range lower bound'); why.push('The figure is the lower bound of a forecast dollar range'); }
    if (stage === 'unclear') { badges.push('Status unclear'); why.push('The source status is not open, upcoming or awarded'); }
    if (stage === 'closed') { badges.push('Closed'); why.push('Response date already passed'); }
    if (cand.drainScope && cand.drainScope.program) why.push(cand.drainScope.program);
    else if (PROGRAM_RE.test(title) && !/design|engineering/i.test(title)) why.push('Title reads like a program / permit-support contract rather than design work');
    if (stage === 'awarded') badges.push('Awarded'); if (stage === 'forecast') badges.push('Forecast');
    if (flags.exact5) badges.push('Exactly $5M');
    var conf = (eng.level === 'strong' && sc.level === 'title' && !textParsed && best.kind !== 'range' && (stage === 'open' || stage === 'forecast' || stage === 'awarded') && !why.length) ? 'confirmed' : 'unconfirmed';
    badges.unshift(conf === 'confirmed' ? 'Confirmed' : 'Unconfirmed');
    rules.push({ k: 'eng', t: 'Engineering services: ' + eng.why });
    rules.push({ k: 'scope', t: 'Scope: ' + [sc.pse ? 'PS&E / design wording "' + sc.pse + '"' : null, sc.hh ? 'H&H wording "' + sc.hh + '"' : null, sc.sec.ids.length ? 'sector ' + sc.sec.ids.join(', ') : null].filter(Boolean).join('; ') + ' (' + (sc.level === 'title' ? 'in the title' : 'description only') + '; keyword match, inferred)' });
    rules.push({ k: 'fee', t: M.AMOUNT_KINDS[best.kind].label + ' = ' + fmt(best.v) + ' (source field: ' + best.field + '); data floor $5,000,000 (>=), visible threshold applied separately' });
    return { lens: 'fee', excl: [], stage: stage, rules: rules, badges: badges, why: why, conf: conf, flags: flags, scope: sc, eng: eng, amt: best, projectCost: bestCost };
  }
  function advanceResult(cand, sc, eng, stage, val, rules, why) {
    var badges = ['Advance notice', val ? 'Stated value below $5M' : 'Fee not stated'], reasons = (why || []).slice();
    if (sc.level !== 'title') { badges.push('Inferred sector'); reasons.push('Scope keywords appear only in the description (' + (sc.hh || sc.pse || 'sector words') + '), not the title'); }
    if (eng.level === 'weak') { badges.push('Engineering unclear'); reasons.push('Engineering status is unclear: ' + eng.why); }
    badges.push(stage === 'forecast' ? 'Forecast' : 'Upcoming / open');
    rules = rules.concat([
      { k: 'eng', t: 'Engineering services: ' + eng.why },
      { k: 'scope', t: 'Scope: ' + [sc.pse ? 'PS&E / design wording "' + sc.pse + '"' : null, sc.hh ? 'H&H wording "' + sc.hh + '"' : null, sc.sec.ids.length ? 'sector ' + sc.sec.ids.join(', ') : null, sc.road ? 'roadway context' : null].filter(Boolean).join('; ') + ' (' + (sc.level === 'title' ? 'in the title' : 'description only') + '; keyword match, inferred)' },
      { k: 'advance', t: 'Advance notice from an agency forecast or projected-advertisement list. ' + (val ? 'The source states ' + fmt(val.v) + ' (' + val.field + '), below the $5,000,000 fee floor, so it is shown here for information only and is never tested by a fee filter.' : 'The source states no fee, so no dollar figure is shown and no fee filter can include it.') + ' This is an early lead before the solicitation is issued.' }
    ]);
    return { lens: 'advance', excl: [], stage: stage, rules: rules, badges: badges, why: reasons, flags: { scope: sc.level }, scope: sc, eng: eng, amt: null, projectCost: null, statedValue: val || null };
  }
  function pipelineResult(cand, sc, eng, stage, cost, rules) {
    var badges = ['Fee not published', 'Project cost (not fee)']; if (sc.level !== 'title') badges.push('Inferred sector'); badges.push(stage === 'forecast' ? 'Forecast' : 'Upcoming / open');
    rules = rules.concat([{ k: 'pipeline', t: 'No fee is stated. The source states a project cost of ' + fmt(cost.v) + ' (' + cost.field + '), the scope names "' + sc.hh + '", and the item is ' + (cand.projectList ? 'a design-phase project (' + (cand.fields && cand.fields['Project stage'] || 'PE / PS&E') + ')' : 'an engineering notice not yet awarded') + '. This is a research lead, not a fee.' }]);
    return { lens: 'pipeline', excl: [], stage: stage, rules: rules, badges: badges, why: [], flags: { scope: sc.level }, scope: sc, eng: eng, amt: null, projectCost: cost };
  }

  var CONF_RANK = { confirmed: 3, unconfirmed: 1 };
  function toRecordPse(cand, ev, asOf) {
    var bucket = ev.stage === 'awarded' ? 'award' : 'opp';
    var amtIn = ev.lens === 'fee' ? ev.amt : null, costIn = ev.lens === 'pipeline' ? ev.projectCost : (ev.lens === 'fee' ? ev.projectCost : null);
    var rec = M.toRecord(cand, { bucket: bucket, rules: ev.rules, review: ev.why || [], flags: ev.flags || {}, amt: amtIn, projectCost: costIn || null, sector: { ids: ev.scope.sec.ids.concat(ev.scope.road ? ['roadway'] : []), hits: [] } }, asOf);
    rec.title = M.decodeEntities(rec.title); if (rec.desc) rec.desc = M.decodeEntities(rec.desc);
    rec.lens = ev.lens; rec.stage = ev.stage; rec.badges = ev.badges; rec.reasons = ev.why || []; rec.domains = ev.scope.domains; rec.scopeWords = { hh: ev.scope.hh, pse: ev.scope.pse, level: ev.scope.level };
    rec.bucket = bucket; rec.id = cand.src + ':' + cand.srcId + (cand.idSuffix || '');
    if (ev.lens === 'fee') { rec.conf = ev.conf; rec.confRank = CONF_RANK[ev.conf]; rec.textParsed = !!ev.flags.textParsed; rec.exact5 = !!ev.flags.exact5; }
    if (ev.lens === 'db') {
      rec.amt = null; rec.projectCost = null; rec.dbValue = ev.dbValue; rec.designFee = ev.designFee; rec.stipend = ev.stipend; rec.dbType = ev.dbType; rec.dbRole = ev.dbRole.role; rec.dbRoleLabel = ev.dbRole.label; rec.dbRoleWhy = ev.dbRole.why;
      rec.amts = (cand.amounts || []).map(function (a) { return { v: a.v, kind: a.kind, field: a.field, ctx: a.ctx || null }; }).slice(0, 8);
    }
    if (ev.lens === 'advance') { rec.amt = null; rec.projectCost = null; rec.statedValue = ev.statedValue ? { v: ev.statedValue.v, kind: ev.statedValue.kind, field: ev.statedValue.field, ctx: ev.statedValue.ctx || null } : null; }
    if (ev.lens === 'pipeline') { rec.amt = null; rec.projectCost = { v: ev.projectCost.v, field: ev.projectCost.field, ctx: ev.projectCost.ctx || null }; rec.illustrative = { low: Math.round(ev.projectCost.v * ILLUSTRATIVE.low), high: Math.round(ev.projectCost.v * ILLUSTRATIVE.high), label: ILLUSTRATIVE.label, pct: [ILLUSTRATIVE.low * 100, ILLUSTRATIVE.high * 100], cite: ILLUSTRATIVE.cite, url: ILLUSTRATIVE.url }; }
    return rec;
  }
  // a text-parsed design fee inside a DB record becomes its own fee-lens record (Unconfirmed, Text-parsed)
  function designFeeRecord(cand, ev, asOf) {
    if (!ev.designFee || ev.designFee.v < FEE_FLOOR) return null;
    var c2 = Object.assign({}, cand, { idSuffix: ':design-fee', amounts: [{ v: ev.designFee.v, kind: 'estvalue', field: 'Design fee / design portion stated in the notice text (text-parsed)', ctx: ev.designFee.ctx }] });
    var fr = { lens: 'fee', excl: [], stage: ev.stage, rules: [{ k: 'fee', t: 'A design fee / design portion of ' + fmt(ev.designFee.v) + ' is stated separately in the design-build notice text: "' + ev.designFee.ctx + '". This is the only figure here that counts toward the fee test.' }], badges: ['Unconfirmed', 'Text-parsed', 'Design-build'], why: ['The design fee comes from free text in a design-build notice'], conf: 'unconfirmed', flags: { textParsed: true, exact5: ev.designFee.v === FEE_FLOOR }, scope: ev.scope, eng: ev.eng, amt: c2.amounts[0] };
    if (ev.stage === 'awarded') fr.badges.push('Awarded'); if (ev.stage === 'forecast') fr.badges.push('Forecast');
    var rec = toRecordPse(c2, fr, asOf); rec.amt = { v: ev.designFee.v, kind: 'design_fee', field: c2.amounts[0].field, ctx: ev.designFee.ctx }; rec.fromDb = true; return rec;
  }

  // ---------- filtering, sorting, CSV ----------
  // f.tab: all | open | forecast | awarded | pipeline | db | (null for watch). Fee tabs use r.amt only. DB value and project cost are never read by the fee test.
  function filterPse(recs, f, watch) {
    f = f || {}; var base = Object.assign({}, f); ['tab', 'feeMin', 'feeMax', 'costMin'].forEach(function (k) { delete base[k]; });
    var thr = f.feeMin === undefined || f.feeMin === null ? DEFAULT_FEE : f.feeMin;
    return M.filterRecords(recs, base, watch).filter(function (r) {
      if (f.watchOnly) return true;
      if (f.tab === 'advance') return r.lens === 'advance';
      if (f.tab === 'pipeline') return r.lens === 'pipeline' && r.projectCost && (f.costMin === undefined || f.costMin === null || r.projectCost.v > f.costMin);
      if (f.tab === 'db') {
        if (r.lens !== 'db') return false;
        if (f.dbMin !== undefined && f.dbMin !== null && !(r.dbValue && r.dbValue.v > f.dbMin)) return false;
        if (f.dbRoles && f.dbRoles.length && f.dbRoles.indexOf(r.dbRole) < 0) return false;
        if (f.dbTypes && f.dbTypes.length && f.dbTypes.indexOf(r.dbType) < 0) return false;
        if (f.dbStages && f.dbStages.length && f.dbStages.indexOf(r.stage) < 0) return false;
        return true;
      }
      if (!f.tab && r.lens !== 'fee') return false;
      if (f.tab && r.lens !== 'fee') return false;
      if (f.tab === 'open' && r.stage !== 'open') return false;
      if (f.tab === 'forecast' && r.stage !== 'forecast') return false;
      if (f.tab === 'awarded' && !(r.stage === 'awarded' || r.stage === 'closed')) return false;
      if (f.hideUnconfirmed && r.conf !== 'confirmed') return false;
      if (f.noText && r.textParsed) return false;
      if (r.lens === 'fee') { var v = r.amt ? r.amt.v : null; if (v === null) return false; if (f.inclusive ? !(v >= thr) : !(v > thr)) return false; }
      return true;
    });
  }
  // fee rows exactly at the threshold that the strict > hides (shown in the note)
  function exactAtThreshold(recs, f, watch) {
    var thr = f.feeMin === undefined || f.feeMin === null ? DEFAULT_FEE : f.feeMin; if (f.inclusive) return [];
    var g = Object.assign({}, f, { feeMin: thr - 0.005, inclusive: false });
    return filterPse(recs, g, watch).filter(function (r) { return r.amt && r.amt.v === thr; });
  }
  function sortPse(list, key) {
    var val = function (r) { return r.amt ? r.amt.v : r.dbValue ? r.dbValue.v : r.projectCost ? r.projectCost.v : 0; };
    return list.slice().sort(function (a, b) {
      if (key === 'fee') return val(b) - val(a);
      if (key === 'date') { var d = function (r) { var x = r.dates || {}; return x.due || x.est || x.award || x.posted || '9999'; }; return d(a) < d(b) ? -1 : d(a) > d(b) ? 1 : 0; }
      return ((b.confRank || 0) - (a.confRank || 0)) || (val(b) - val(a));
    });
  }
  var CSV_COLS = ['id', 'lens', 'confidence', 'badges', 'stage', 'title', 'agency', 'subagency', 'state', 'fee_value', 'fee_kind', 'fee_source_field', 'design_build_contract_value_NOT_A_FEE', 'db_value_field', 'db_type', 'db_role_INFERRED', 'design_fee_stated_in_text', 'stipend_NOT_A_FEE', 'project_cost_NOT_A_FEE', 'project_cost_field', 'advance_stated_value_NOT_IN_FEE_FILTERS', 'advance_value_field', 'illustrative_fee_low_ESTIMATE', 'illustrative_fee_high_ESTIMATE', 'illustrative_fee_source', 'posted', 'response_due', 'est_date', 'award_date', 'end_date', 'awardee', 'rules', 'reasons_unconfirmed', 'source', 'source_url', 'snapshot_as_of'];
  function cell(v) { v = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSVPse(recs, asOf) {
    var lines = [CSV_COLS.join(',')];
    recs.forEach(function (r) {
      var d = r.dates || {}, il = r.illustrative;
      lines.push([r.id, r.lens, r.conf || '', (r.badges || []).join('; '), r.stage, r.title, r.agency, r.subagency, r.state, r.amt ? r.amt.v : '', r.amt ? (r.amt.kind === 'design_fee' ? 'Design fee stated in notice text' : (M.AMOUNT_KINDS[r.amt.kind] || {}).label) : '', r.amt ? r.amt.field : '',
        r.dbValue ? r.dbValue.v : '', r.dbValue ? r.dbValue.field : '', r.dbType || '', r.dbRoleLabel || '', r.designFee ? r.designFee.v : '', r.stipend ? r.stipend.v : '', r.projectCost ? r.projectCost.v : '', r.projectCost ? r.projectCost.field : '', r.statedValue ? r.statedValue.v : '', r.statedValue ? r.statedValue.field : '', il ? il.low : '', il ? il.high : '', il ? il.cite : '',
        d.posted, d.due, d.est, d.award, d.end, r.awardee, (r.rules || []).map(function (x) { return x.t; }).join(' | '), (r.reasons || []).join(' | '), r.src, r.url, asOf].map(cell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }
  var api = { FEE_FLOOR: FEE_FLOOR, DEFAULT_FEE: DEFAULT_FEE, PIPE_FLOOR: PIPE_FLOOR, PIPE_DEFAULT: PIPE_DEFAULT, ILLUSTRATIVE: ILLUSTRATIVE, HH_RE: HH_RE, PSE_RE: PSE_RE, DB_RE: DB_RE, evaluatePse: evaluatePse, toRecordPse: toRecordPse, designFeeRecord: designFeeRecord, filterPse: filterPse, exactAtThreshold: exactAtThreshold, sortPse: sortPse, toCSVPse: toCSVPse, CSV_COLS: CSV_COLS, extractDesignFee: extractDesignFee, extractStipend: extractStipend, dbTypeOf: dbTypeOf, dbRoleOf: dbRoleOf, scopeOf: scopeOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NationalPse = api;
})(typeof self !== 'undefined' ? self : this);
