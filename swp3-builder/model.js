/* SWP3 Builder: pure logic (no DOM). Works in the browser (window.SwpModel) and Node (tests).
 * Citations are [badge, text] pairs. Section references (e.g. "Part III.F.8(c)i") were checked against the fetched 2023 CGP text. */
(function (root) {
  var D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.SwpData;
  var DS = (typeof module !== 'undefined' && module.exports) ? require('./design.js') : root.SwpDesign;

  var APP_ID = 'SWP3 Builder';
  var VERSION = 1;
  var DISCLAIMER = 'Draft for engineer review. Not a substitute for the TCEQ permit text (TXR150000) or TxDOT requirements.';

  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : null; }
  function n0(v) { var n = num(v); return n == null ? 0 : n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T00:00:00Z')); }
  function addDays(iso, k) {
    if (!isoOk(iso)) return '';
    var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
  function fmtDate(s) { if (!isoOk(s)) return ''; var d = new Date(s + 'T00:00:00Z'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
  function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function blank(v, label) { v = String(v == null ? '' : v).trim(); return v || '____________' + (label ? ' (' + label + ')' : ''); }
  function bmpById(id) { for (var i = 0; i < D.BMPS.length; i++) if (D.BMPS[i].id === id) return D.BMPS[i]; return null; }
  function typeLabel(k) { for (var i = 0; i < D.PROJECT_TYPES.length; i++) if (D.PROJECT_TYPES[i].key === k) return D.PROJECT_TYPES[i].label; return k; }
  function fix(n, k) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: k == null ? 2 : k }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- project ---------- */
  function defaultForm(type) {
    type = type || 'txdot';
    return {
      type: type, csj: '', highway: '', owner: '', contractor: '', secondary: '',
      county: 'Harris', city: '', limits: '', coordsBegin: '', coordsEnd: '', nature: '',
      acres: '', supportAcres: '', commonPlan: false, planAcres: '', routine: false, openAcres: '',
      receiving: '', segment: '', ms4: '',
      tmdl: 'unknown', tmdlNote: '', edwards: 'unknown', edwardsNote: '',
      soils: '', steepest: '', erosive: false, rainNote: '',
      start: '', end: '', phases: [],
      act: {}, nsd: {},
      basinInfeasible: false, basinWhy: '', bufferInfeasible: false, bufferWhy: '',
      permanentNote: '', dewaterNote: '', inspMode: type === 'txdot' ? 'd7' : 'd14'
    };
  }
  function newProject(fields) {
    fields = fields || {};
    var now = new Date().toISOString();
    var f = defaultForm(fields.type);
    Object.keys(fields).forEach(function (k) { if (k !== 'name') f[k] = fields[k]; });
    return { id: uid('p'), name: String(fields.name || 'New SWP3 project').trim() || 'New SWP3 project', created: now, updated: now,
      form: f, sel: {}, design: {}, situ: null, inspLog: [], rainLog: [] };
  }
  // Design inputs: plain objects of strings/numbers/booleans (depth <= 4); anything else is dropped.
  function cleanDesign(v, depth) {
    if (v == null) return undefined;
    if (typeof v === 'string') return v.slice(0, 200);
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    if (typeof v === 'boolean') return v;
    if (depth > 5 && typeof v === 'object') return undefined;
    if (Array.isArray(v)) return v.slice(0, 60).map(function (x) { return cleanDesign(x, depth + 1); }).filter(function (x) { return x !== undefined; });
    if (typeof v === 'object') { var o = {}; Object.keys(v).slice(0, 80).forEach(function (k) { if (/^[A-Za-z0-9_.-]{1,40}$/.test(k)) { var c = cleanDesign(v[k], depth + 1); if (c !== undefined) o[k] = c; } }); return o; }
    return undefined;
  }
  function sanitizeProject(p) {
    if (!p || typeof p !== 'object') return null;
    var inF = (p.form && typeof p.form === 'object') ? p.form : {};
    var f = defaultForm(typeof inF.type === 'string' && D.PROJECT_TYPES.some(function (x) { return x.key === inF.type; }) ? inF.type : 'txdot');
    Object.keys(f).forEach(function (k) { if (k !== 'type' && inF[k] !== undefined && typeof inF[k] === typeof f[k]) f[k] = inF[k]; });
    f.act = inF.act && typeof inF.act === 'object' ? clone(inF.act) : {};
    f.nsd = inF.nsd && typeof inF.nsd === 'object' ? clone(inF.nsd) : {};
    f.phases = Array.isArray(inF.phases) ? inF.phases.map(function (x) { x = x || {}; return { id: String(x.id || uid('ph')), name: String(x.name || ''), start: String(x.start || ''), end: String(x.end || ''), acres: String(x.acres == null ? '' : x.acres) }; }) : [];
    if (!INSP_MODES[f.inspMode]) f.inspMode = f.type === 'txdot' ? 'd7' : 'd14';
    var sel = {}; if (p.sel && typeof p.sel === 'object') Object.keys(p.sel).forEach(function (k) { if (bmpById(k)) sel[k] = !!p.sel[k]; });
    var now = new Date().toISOString();
    return { id: String(p.id || uid('p')), name: String(p.name || 'Imported project'), created: String(p.created || now), updated: String(p.updated || now),
      form: f, sel: sel, design: (p.design && typeof p.design === 'object') ? (cleanDesign(p.design, 0) || {}) : {}, situ: (p.situ && typeof p.situ === 'object') ? (cleanDesign(p.situ, 0) || null) : null,
      inspLog: Array.isArray(p.inspLog) ? p.inspLog.filter(function (x) { return x && isoOk(x.date); }).map(function (x) { return { id: String(x.id || uid('i')), date: x.date, kind: String(x.kind || 'routine'), by: String(x.by || ''), notes: String(x.notes || '') }; }) : [],
      rainLog: Array.isArray(p.rainLog) ? p.rainLog.filter(function (x) { return x && isoOk(x.date) && num(x.inches) != null; }).map(function (x) { return { id: String(x.id || uid('r')), date: x.date, inches: num(x.inches) }; }) : [] };
  }
  function backup(state) { return JSON.stringify({ app: APP_ID, version: VERSION, exported: new Date().toISOString(), activeId: state.activeId, projects: state.projects }, null, 1); }
  function restore(text, state) {
    var j; try { j = JSON.parse(text); } catch (e) { return { ok: false, n: 0, msg: 'Not valid JSON.' }; }
    var list = j && j.app === APP_ID && Array.isArray(j.projects) ? j.projects : (j && j.form ? [j] : null);
    if (!list) return { ok: false, n: 0, msg: 'This file is not an SWP3 Builder backup.' };
    var n = 0, first = null;
    list.forEach(function (x) {
      var s = sanitizeProject(x); if (!s) return;
      if (state.projects.some(function (q) { return q.id === s.id; })) s.id = uid('p');
      state.projects.push(s); if (!first) first = s.id; n++;
    });
    if (n) state.activeId = first;
    return { ok: n > 0, n: n, msg: n ? 'Imported ' + n + ' project(s).' : 'No projects found in file.' };
  }

  /* ---------- permit determination (TCEQ TXR150000) ---------- */
  function totals(f) {
    var disturbed = n0(f.acres), support = n0(f.supportAcres), total = disturbed + support;
    var plan = f.commonPlan ? Math.max(n0(f.planAcres), total) : total;
    return { disturbed: disturbed, support: support, total: total, plan: plan };
  }
  function isHouston(f) { return /houston/i.test(String(f.city || '')); }
  function edwardsCounty(f) {
    var c = String(f.county || '').replace(/county/i, '').trim().toLowerCase();
    return D.EDWARDS_COUNTIES.some(function (x) { return x.toLowerCase() === c; });
  }
  function largeSteps(txdot) {
    var s = [
      ['TCEQ', 'Prepare the SWP3 before submitting the NOI; implement it before any soil disturbance (Part II.E.3(a); Part III.C).'],
      ['TCEQ', 'Primary operators submit an NOI through TCEQ ePermits (accessed with STEERS) before commencing construction; coverage starts when TCEQ confirms receipt. With an electronic-reporting waiver the paper NOI is due at least 7 days before and coverage is provisional 48 hours after postmark (Part II.E.3(b); II.E.5(b)).'],
      ['TCEQ', 'Every operator posts the TCEQ Large Construction Site Notice (Form 20961; secondary operators Form 20962) where the public and agencies can see it, before construction starts, and keeps it until final stabilization. Linear sites: near where work is underway, movable (Part II.E.3(c),(g); Part III.D.2).'],
      ['TCEQ', 'Two days before construction starts: give a signed copy of the NOI to each receiving MS4 operator and to any secondary operator, and list the names and addresses of the MS4 operators in the SWP3 (Part II.E.3(d)).'],
      ['TCEQ', 'If signature authority is delegated, submit the Delegation of Signatories through STEERS (paper only with a waiver) (Part II.E.3(e)).'],
      ['TCEQ', 'File a Notice of Termination through ePermits within 30 days after final stabilization, transfer of operational control, or alternative authorization, with a copy to the MS4 operators; the permit applies until the NOT is submitted and approved (Part II.F.1).']
    ];
    if (txdot) s.push(['TXDOT', 'TxDOT and the Contractor are co-permittee primary operators under a shared SWP3 and each obtains authorization independently; the SWP3 records each NOI date. NOI/NOC/NOT go through STEERS; there is no programmatic delegation of signatories for large sites (Section 1, 2.1 and 2.2.3).']);
    return s;
  }
  function smallSteps(txdot) {
    var s = [
      ['TCEQ', 'No NOI. Develop the SWP3 for the whole site (or your portion) and implement it before construction (Part II.E.2(a)).'],
      ['TCEQ', 'Post a signed and certified Small Construction Site Notice (Form 20963) at least 2 days before construction starts, where it is safely visible to the public and agencies, and keep it posted until final stabilization (Part II.E.2(b)-(c)). Linear sites: near the active work, movable.'],
      ['TCEQ', 'Give a copy of the signed notice to each receiving MS4 operator at least 2 days before construction starts (Part II.E.2(d)).'],
      ['TCEQ', 'If signature authority is delegated, mail the TCEQ Delegation of Signatories form (Part II.E.2(e)).'],
      ['TCEQ', 'Possible alternatives, not modeled here: automatic authorization during periods of low erosion potential (Appendix A county date ranges; I did not find Harris, Fort Bend, Brazoria, Galveston or Montgomery counties listed) and the Low Rainfall Erosivity Waiver (Part II.G).']
    ];
    if (txdot) s.push(['TXDOT', 'TxDOT: deselect the "Submit NOI to TCEQ (5 acres or more)" roles on Summary Sheet 1 (items 1.12/1.13) for 1 to under 5 acres. TxDOT sends one hard-copy delegation of signatories for small projects and keeps a copy in Attachment 2.7 (Section 1, 2.2.2; Summary Sheet guidance 1.12-1.13).']);
    return s;
  }
  function finishPermit(out, f) {
    var txdot = f.type === 'txdot';
    if (txdot && (out.tier === 'small' || out.tier === 'large')) out.txdotSwp3 = true;
    if (isHouston(f)) out.notes.push(['HOU', 'City of Houston IDM 9.5.01.D.1 (2026): SWPPPs and BMPs follow the Stormwater Management Handbook for Construction Activities for all construction in the City limits, and the site-specific SWPPP must include Standard Drawing 01570-01. 9.5.01.D.2: the plans carry a note that the contractor gives the Site Notice, NOI and maintenance checklist to the City Engineer or Building Official 5 workdays before construction.']);
    if (/harris/i.test(String(f.county || '')) && !isHouston(f)) out.notes.push(['HC', 'Harris County FAQ: an SWPPP is required for projects that could disturb a one-acre or larger parcel, and plan submittals include the SWPPP (and SWQMP where applicable).']);
    if (f.edwards === 'yes' || (edwardsCounty(f) && f.edwards !== 'no')) out.notes.push(['TCEQ', 'Edwards Aquifer: construction may not begin until the applicable Edwards Aquifer Protection Plan (30 TAC Chapter 213) is approved; discharges within 10 stream miles upstream of the recharge zone also need a copy of the NOI sent to the TCEQ regional office (Part II.C.5(a)-(c); Part II.E.5(b)). TxDOT: EAPP review is 90 days by rule (Section 1, 1.4.5).' + (edwardsCounty(f) ? ' Your county is one of the counties named in the permit/TxDOT guidance (' + D.EDWARDS_COUNTIES.join(', ') + '); only the mapped recharge/contributing zone is regulated.' : '')]);
    if (f.tmdl === 'yes') out.notes.push(['TCEQ', 'Impaired water / TMDL: new sources or discharges of the pollutant of concern to an impaired water are not authorized unless allowable under 30 TAC Chapter 305; if a TMDL exists the SWP3 must be consistent with the TMDL and any I-Plan conditions (Part II.C.4).']);
    if (f.tmdl === 'unknown') out.notes.push(['TCEQ', 'Determine whether the discharge reaches a water on the latest 303(d) list or Texas Integrated Report categories 4 and 5 (Part II.C.4). TxDOT: use the TCEQ Surface Water Quality Segment Viewer to follow the flow path to a classified segment (Summary Sheet guidance 1.11).']);
    if (isoOk(f.end) && f.end > D.PERMIT.expiresIso) out.notes.push(['TCEQ', 'The permit expires ' + D.PERMIT.expires + '. If coverage is active then, a 90-day interim period starts on the effective date of the next permit (Part II.E.5(d)).']);
    if (f.commonPlan) out.notes.push(['TCEQ', 'Discrete projects at least 1/4 mile apart with undisturbed land between can each be treated as their own plan, unless an interconnecting road, pipeline or utility part of the same plan is included in the disturbed area (Part I.B, Common Plan of Development; TxDOT Section 1, 1.2).']);
    return out;
  }
  function permitDetermination(f) {
    var t = totals(f), txdot = f.type === 'txdot';
    var out = { tier: 'unknown', totals: t, label: '', headline: '', steps: [], notes: [], txdotSwp3: false, noi: false, siteNotice: '', basis: [] };
    if (f.routine) {
      out.tier = 'exempt'; out.label = 'Routine maintenance (not construction activity)';
      out.headline = 'Routine maintenance that keeps the original line and grade, hydraulic capacity or original purpose is not "construction activity" under the permit.';
      out.basis.push(['TCEQ', 'Part I.B definitions of Construction Activity and Large Construction Activity (routine maintenance exclusion).']);
      out.notes.push(['TCEQ', 'Confirm the work really is routine maintenance. New ditches, regrading that changes line/grade or capacity, and added outfalls are not.']);
      if (txdot) out.notes.push(['TXDOT', 'TxDOT SWP3 requirements apply to Construction and Maintenance projects that meet the permit definition of construction activity, and to projects with EPICs that depend on stormwater controls (Section 1, 1.2). Check the EPIC sheet.']);
      return finishPermit(out, f);
    }
    if (!(t.total > 0)) { out.label = 'Enter disturbed acres'; out.headline = 'Enter total disturbed acres to see the determination.'; return finishPermit(out, f); }
    out.basis.push(['TCEQ', 'Acreage tested = disturbed acres + support-activity acres' + (f.commonPlan ? ', or the total acres of the larger common plan of development or sale if that is bigger' : '') + ' (Part I.B: Large/Small Construction Activity).']);
    if (t.plan >= 5) {
      out.tier = 'large'; out.noi = true; out.siteNotice = 'Form 20961';
      out.label = 'Large construction activity: NOI required';
      out.headline = fix(t.plan) + ' acres tested (5 or more). Primary operators submit an NOI to TCEQ and every operator posts a Large Construction Site Notice.';
      if (t.total < 5) out.notes.push(['TCEQ', 'This project is under 5 acres but is part of a common plan that will ultimately disturb 5 or more acres, so it is a large construction activity (Part I.B).']);
      out.steps = largeSteps(txdot);
    } else if (t.plan >= 1) {
      out.tier = 'small'; out.siteNotice = 'Form 20963';
      out.label = 'Small construction activity: site notice, no NOI';
      out.headline = fix(t.plan) + ' acres tested (1 to under 5). No NOI. Develop the SWP3 and post a signed Small Construction Site Notice at least 2 days before starting.';
      if (t.total < 1) out.notes.push(['TCEQ', 'Under 1 acre by itself, but the common plan reaches 1 acre or more, so it is regulated (Part I.B).']);
      out.steps = smallSteps(txdot);
    } else {
      out.tier = 'none';
      out.label = 'Under 1 acre: no TCEQ authorization';
      if (txdot) {
        out.txdotSwp3 = true;
        out.headline = fix(t.plan) + ' acres. No CGP authorization or TCEQ coordination, but TxDOT still requires an SWP3 for projects with soil disturbance.';
        out.steps.push(['TXDOT', 'Complete the SWP3 Summary Sheets (the version for projects under one acre) and a SWP3 Binder; no CGP authorization or TCEQ coordination is needed (Section 1, 2.2.1; Summary Sheet guidance, Introduction).']);
      } else {
        out.headline = fix(t.plan) + ' acres. Not regulated by the construction general permit when under 1 acre and not part of a larger common plan of 1 acre or more.';
        out.steps.push(['TCEQ', 'TCEQ construction page: construction that disturbs less than 1 acre and is not part of a larger common plan that would disturb 1 acre or more is not regulated by the general permit.']);
      }
      out.notes.push(['TCEQ', 'Local entities may impose more stringent requirements (Part II.C.7).']);
    }
    return finishPermit(out, f);
  }
  function deadlines(f, perm) {
    perm = perm || permitDetermination(f);
    var out = [], s = f.start, e = f.end;
    if (!isoOk(s)) return out;
    if (perm.tier === 'large') {
      out.push({ date: s, label: 'NOI submitted (electronic) and Large Construction Site Notice posted, before construction starts', b: 'TCEQ', ref: 'Part II.E.3(b)-(c)' });
      out.push({ date: addDays(s, -7), label: 'Paper NOI postmarked (only with an electronic-reporting waiver)', b: 'TCEQ', ref: 'Part II.E.3(b)' });
      out.push({ date: addDays(s, -2), label: 'Copy of signed NOI to each MS4 operator and secondary operator', b: 'TCEQ', ref: 'Part II.E.3(d)' });
    } else if (perm.tier === 'small') {
      out.push({ date: addDays(s, -2), label: 'Small Construction Site Notice posted and copy given to MS4 operator(s)', b: 'TCEQ', ref: 'Part II.E.2(b),(d)' });
    }
    if (perm.tier === 'large' || perm.tier === 'small') {
      out.push({ date: s, label: 'SWP3 implemented before soil disturbance', b: 'TCEQ', ref: 'Part III.C' });
      if (perm.tier === 'large') {
        if (isoOk(e)) out.push({ date: addDays(e, 30), label: 'Latest NOT if final stabilization is reached on your anticipated end date (30 days after)', b: 'TCEQ', ref: 'Part II.F.1' });
        else out.push({ date: '', label: 'NOT within 30 days after final stabilization', b: 'TCEQ', ref: 'Part II.F.1' });
      }
      if (isHouston(f)) out.push({ date: addDays(s, -7), label: 'Houston: Site Notice, NOI and maintenance checklist to City Engineer/Building Official 5 workdays before start (about 7 calendar days)', b: 'HOU', ref: 'IDM 9.5.01.D.2' });
    }
    return out.sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : 1; });
  }

  /* ---------- sediment basin / trap numbers ---------- */
  function basinCheck(f) {
    var open = num(f.openAcres);
    var r = { open: open, required: false, band: 'unknown', permitNoCalcCf: null, txdotTrapCf: null, notes: [] };
    if (open == null) return r;
    r.required = open >= 10;
    r.band = open >= 10 ? 'basin' : 'under10';
    r.permitNoCalcCf = Math.round(open * 3600);
    if (open <= 5) r.txdotTrapCf = Math.round(open * 1800);
    if (open >= 10) {
      r.notes.push(['TCEQ', 'A sediment basin (or similar impoundment) is required where feasible for a common drainage location with 10 or more acres disturbed at one time. Storage: 2-yr, 24-hr runoff from each disturbed acre drained, or at least 3,600 cu ft/acre if that cannot be calculated: about ' + fix(r.permitNoCalcCf, 0) + ' cu ft for ' + fix(open) + ' acres. Put the calculation in the SWP3 (Part III.F.2(c)i(A)).']);
      r.notes.push(['TXDOT', 'Item 506 section 4.4.5.1 also uses 3,600 cu ft/acre for 10 or more disturbed acres. Basin drainage area should not exceed 100 acres (Summary Sheet guidance 2.2.1).']);
      if (open > 100) r.notes.push(['TXDOT', 'Open area exceeds the TxDOT 100-acre basin drainage guideline; split into multiple basins.']);
    } else {
      r.notes.push(['TCEQ', 'Under 10 acres at one time: traps or basins may be used; a basin is not required. At minimum silt fence, vegetative buffer strips or equivalent on all down-slope boundaries (Part III.F.2(c)ii(A)).']);
      if (open <= 5) r.notes.push(['TXDOT', 'TxDOT sediment trap: drainage area up to 5 acres, 1,800 cu ft/acre (0.5 in.), about ' + fix(r.txdotTrapCf, 0) + ' cu ft for ' + fix(open) + ' acres (Summary Sheet guidance 2.2.1; BMP fact sheet).']);
      else r.notes.push(['TXDOT', 'TxDOT limits a sediment trap to 5 acres of drainage; for ' + fix(open) + ' acres use several traps or a basin (Summary Sheet guidance 2.2.1).']);
      r.notes.push(['TCEQ', 'If a basin is used as the alternative here the permit says it must hold the 2-yr, 24-hr runoff per disturbed acre, or 3,600 cu ft/acre if not calculable (about ' + fix(r.permitNoCalcCf, 0) + ' cu ft), not the 1,800 cu ft/acre TxDOT trap value (Part III.F.2(c)ii(B)).']);
    }
    return r;
  }

  /* ---------- BMP recommendation ---------- */
  var LEVEL_ORDER = { required: 0, recommended: 1, optional: 2 };
  function recommendBmps(f) {
    var perm = permitDetermination(f), txdot = f.type === 'txdot';
    var a = f.act || {}, t = perm.totals, open = num(f.openAcres), steep = num(f.steepest);
    var regulated = perm.tier === 'large' || perm.tier === 'small' || (txdot && perm.txdotSwp3);
    var out = {};
    function set(id, level, why) { out[id] = { level: level, why: why || [] }; }
    function reg(id, why) { set(id, regulated ? 'required' : 'recommended', why); }

    reg('sediment_fence', [['TCEQ', 'Silt fence, vegetative buffer strips or equivalent sediment controls on all down-slope boundaries (Part III.F.2(c)). Use another equivalent control where flow is concentrated or the drainage exceeds the TxDOT 2-acre fence guideline.']]);
    set('erosion_log', (a.inlets || a.slopes) ? 'recommended' : 'optional', (a.inlets || a.slopes) ? [['TXDOT', 'Alternative to silt fence at inlets, on slopes and on paved edges (TxDOT erosion control log fact sheet).']] : []);
    if (a.exits) {
      if (txdot && t.total >= 1) set('rock_exit', 'required', [['TXDOT', 'TxDOT fact sheet: stabilized construction exits must be used on sites disturbing one acre or more.'], ['TCEQ', 'Minimize off-site vehicle tracking (Part III.F.4(a)).']]);
      else set('rock_exit', 'recommended', [['TCEQ', 'Minimize off-site vehicle tracking of sediment and dust (Part III.F.4(a)).']]);
      set('street_sweeping', 'recommended', [['TXDOT', 'Use with the stabilized exit wherever exits enter a public roadway.']]);
    } else {
      set('rock_exit', 'optional', [['TCEQ', 'Vehicle tracking controls still apply if vehicles ever leave onto paved roads (Part III.F.4(a)).']]);
      set('street_sweeping', 'optional', []);
    }
    set('inlet_protection', a.inlets ? 'recommended' : 'optional', a.inlets ? [['TCEQ', 'Show storm drain inlets on and near the site on the SWP3 map (Part III.F.1).'], ['TXDOT', 'Sediment trap or log at inlets; rock filter dam Type 1 around inlets.']] : []);
    if (open != null && open >= 10) set('sediment_basin', 'required', [['TCEQ', fix(open) + ' acres disturbed at one time in a common drainage location (10 or more): basin required where feasible; if not feasible document why and provide equivalent controls (Part III.F.2(c)i(A)).']]);
    else set('sediment_basin', 'optional', [['TCEQ', 'Not required under 10 acres at one time' + (open == null ? ' (enter the largest area disturbed at one time to test this)' : '') + '.']]);
    if (open != null && open >= 10) set('sediment_trap', f.basinInfeasible ? 'recommended' : 'optional', f.basinInfeasible ? [['TCEQ', 'Basin marked infeasible: provide equivalent control measures, which may include a series of smaller basins or traps (Part III.F.2(c)i(A)(3)).']] : []);
    else if (a.ditches || a.outfalls || a.inlets) set('sediment_trap', (open != null && open > 5) ? 'optional' : 'recommended', (open != null && open > 5) ? [['TXDOT', 'More than 5 acres of drainage exceeds the TxDOT trap limit; use several traps or a basin.']] : [['TXDOT', 'Traps go in ditches, ahead of inlets and before drainage leaves the ROW or enters a water course.']]);
    else set('sediment_trap', 'optional', []);
    set('rock_filter_dam', (a.ditches || a.slopes) ? 'recommended' : 'optional', (a.ditches || a.slopes) ? [['TXDOT', 'Toe of slopes, ditches, swale and dike outlets.']] : []);
    if (a.slopes) set('vertical_tracking', txdot ? 'required' : 'recommended', [['TXDOT', 'Item 506 section 4.4.10: required where soil-disturbing activity occurs on slopes unless otherwise approved.']]);
    else set('vertical_tracking', 'optional', []);
    var why = [];
    if (a.slopes && steep != null && steep > 0 && steep <= 3) why.push(['ROT', 'Rule of thumb (not from the cited standards): slopes about ' + fix(steep, 1) + 'H:1V or steeper often get a blanket or mat.']);
    if (a.slopes && f.erosive) why.push(['ASSUMED', 'You marked the soils as erosive (your judgment).']);
    if (a.ditches) why.push(['TXDOT', 'Soil stabilization fact sheet lists ditches and sediment traps as blanket locations.']);
    set('erosion_blanket', why.length ? 'recommended' : 'optional', why);
    reg('seeding_sod', [['TCEQ', 'Final stabilization (70% of native background cover or equivalent) is required before coverage ends; temporary stabilization must start within the permit time frames (Part III.F.2(b)).']]);
    if (a.trees) set('preserve_vegetation', 'required', [['TCEQ', 'Site plans must preserve existing vegetation where possible (Part III.F.2(b)).'], ['TXDOT', 'Mark preserved areas with construction perimeter fence before clearing.']]);
    else set('preserve_vegetation', 'optional', []);
    set('perimeter_fence', (a.trees || a.surfaceWater) ? 'recommended' : 'optional', (a.trees || a.surfaceWater) ? [['TXDOT', 'Keeps equipment out of preserved vegetation, water bodies and wetlands.']] : []);
    if (a.slopes) set('slope_drain', (steep != null && steep > 0 && steep <= 3) ? 'recommended' : 'optional', [['TXDOT', 'For concentrated runoff on long unstabilized slopes and embankments.'], ['ROT', 'Whether a drain is needed depends on slope length and flow; the 3H:1V cut-off used here is a rule of thumb.']]);
    else set('slope_drain', 'optional', []);
    if (a.outfalls) set('outlet_protection', 'required', [['TCEQ', 'Velocity dissipation devices are required at discharge locations and along outfall channels (Part III.F.4(d)).']]);
    else set('outlet_protection', a.surfaceWater ? 'recommended' : 'optional', a.surfaceWater ? [['TXDOT', 'Protect channels receiving concentrated flow, especially next to streams.']] : []);
    set('diversion', a.slopes ? 'recommended' : 'optional', a.slopes ? [['TXDOT', 'Divert run-on above slopes; the permit also asks you to control stormwater volume and velocity on site (Part IV.A).']] : []);
    if (a.surfaceWater) set('vegetated_buffer', 'required', [['TCEQ', 'Provide and maintain natural buffers around surface water, or document why infeasible and add sediment controls (Part IV.A.(6)).']]);
    else set('vegetated_buffer', 'optional', [['TXDOT', 'With no surface water on or adjacent to the ROW, Summary Sheet 2.6 states "No surface waters present, vegetated buffer zones are not planned."']]);
    if (a.stockpiles) set('stockpile', 'required', [['TCEQ', 'Describe materials stored on site and the controls (Part III.F.4(b)).'], ['TXDOT', 'Designate the stockpile area on the layout sheets.']]);
    else set('stockpile', 'optional', []);
    if (a.concrete) set('concrete_washout', 'required', [['TCEQ', 'Concrete wash-out to surface water or storm sewers is prohibited; show wash-out areas on the SWP3 site map (Part VI.A,E; Part IV.E.1).']]);
    else set('concrete_washout', 'optional', []);
    if (a.dewatering) set('dewatering_controls', 'required', [['TCEQ', 'Dewatering discharges are prohibited unless controlled; daily observation and 24-hour report on discharge days (Part IV.C; Part III.F.7).']]);
    else set('dewatering_controls', 'optional', [['TXDOT', 'Dewatering may become necessary during construction; the designer should consider it where practicable (Summary Sheet 2.8).']]);
    set('turbidity_barrier', 'optional', a.surfaceWater ? [['ISWM', 'Use if work disturbs a stream or lake bank or occurs in the water (iSWM section 3.14); not a TxDOT fact-sheet BMP.']] : []);
    reg('spill_response', [['TCEQ', 'Spill and leak prevention and response procedures (Part IV.D.5).']]);
    reg('chemical_material', [['TCEQ', 'Minimize exposure of materials and wastes to rain; waste container lids; housekeeping (Part IV.D.1-4).']]);
    set('sanitary_waste', a.sanitary ? 'required' : 'optional', a.sanitary ? [['TCEQ', 'Portable toilets secure, away from surface water and inlets (Part IV.D.6).']] : []);
    set('permanent_controls', regulated ? 'recommended' : 'optional', [['TCEQ', 'Describe any stormwater controls installed during construction to treat post-construction discharge (Part III.F.3).']]);
    D.BMPS.forEach(function (b) { if (!out[b.id]) out[b.id] = { level: 'optional', why: [] }; });
    return out;
  }
  function selectedIds(f, sel) {
    var rec = recommendBmps(f), ids = [];
    D.BMPS.forEach(function (b) {
      var on = sel && sel[b.id] !== undefined ? !!sel[b.id] : (rec[b.id].level === 'required' || rec[b.id].level === 'recommended');
      if (on) ids.push(b.id);
    });
    return ids;
  }
  function applySuggestions(project) {
    var rec = recommendBmps(project.form);
    D.BMPS.forEach(function (b) { project.sel[b.id] = rec[b.id].level !== 'optional'; });
    return project;
  }
  function checkSelection(f, sel) {
    var ids = selectedIds(f, sel), has = function (id) { return ids.indexOf(id) >= 0; };
    var rec = recommendBmps(f), warn = [], a = f.act || {}, open = num(f.openAcres);
    D.BMPS.forEach(function (b) {
      if (rec[b.id].level === 'required' && !has(b.id)) {
        if (b.id === 'sediment_basin' && f.basinInfeasible) return;
        if (b.id === 'vegetated_buffer' && f.bufferInfeasible) return;
        warn.push({ bmp: b.id, b: rec[b.id].why[0] ? rec[b.id].why[0][0] : 'TCEQ', t: b.name + ' is marked required by your inputs but is not selected. ' + (rec[b.id].why[0] ? rec[b.id].why[0][1] : '') });
      }
    });
    if (open != null && open >= 10 && f.basinInfeasible && !String(f.basinWhy || '').trim()) warn.push({ bmp: 'sediment_basin', b: 'TCEQ', t: 'Basin marked infeasible but no reason is written. The permit requires you to document the reason.' });
    if (a.surfaceWater && f.bufferInfeasible && !String(f.bufferWhy || '').trim()) warn.push({ bmp: 'vegetated_buffer', b: 'TCEQ', t: 'Buffer marked infeasible but no reason is written (Part IV.A.(6)).' });
    if (has('sediment_trap') && open != null && open > 5 && open < 10) warn.push({ bmp: 'sediment_trap', b: 'TXDOT', t: 'A single TxDOT sediment trap is limited to 5 acres of drainage; ' + fix(open) + ' acres needs multiple traps or a basin.' });
    if (has('sediment_fence') && open != null && open > 2) warn.push({ bmp: 'sediment_fence', b: 'TXDOT', t: 'TxDOT fact sheet: silt fence is not recommended where the area draining to one run of fence exceeds 2 acres (your open area is ' + fix(open) + ' acres); add other controls where that applies.' });
    return warn;
  }
  function sealFlags(f, sel) {
    if (f.type !== 'txdot') return [];
    var ids = selectedIds(f, sel), out = [];
    if (ids.indexOf('sediment_basin') >= 0 || ids.indexOf('sediment_trap') >= 0) out.push('Sediment trap/basin calculations are included in the SWP3.');
    if (f.basinInfeasible) out.push('A required sediment basin is marked not feasible.');
    if (f.bufferInfeasible) out.push('A vegetated buffer is required but not feasible.');
    return out;
  }
  function flagsFor(f, sel) {
    var ids = selectedIds(f, sel);
    return D.FLAGS.filter(function (x) {
      if (x.id === 'daily') return f.type === 'txdot';
      if (x.id === 'cycle') return f.inspMode !== 'd7';
      return !x.bmps || !x.bmps.length || x.bmps.some(function (b) { return ids.indexOf(b) >= 0; });
    });
  }

  /* ---------- inspections (Part III.F.8; TxDOT Section 2.2 / Appendix C; Item 506) ---------- */
  var INSP_MODES = {
    d7: { key: 'd7', label: 'Every 7 calendar days', short: '7-day cycle', cite: [['TXDOT', 'TxDOT standard cycle: inspect at least every 7 calendar days, same weekday, regardless of rain (Section 2.2; Appendix C).'], ['TCEQ', 'This matches the permit\'s alternative schedule: at least once every 7 calendar days, whether or not it has rained (Part III.F.8(c)v).']] },
    d14: { key: 'd14', label: 'Every 14 days + within 24 h after a 0.5 in. storm', short: '14-day + storm', cite: [['TCEQ', 'At least once every 14 calendar days AND within 24 hours of the end of a storm of 0.5 in. or more (Part III.F.8(c)i).'], ['TXDOT', 'TxDOT allows other cycles only where climate warrants and requires up-to-date rainfall records with the Form 2118s (Section 2.2).']] },
    d14lin: { key: 'd14lin', label: 'Linear site: 14 days + 0.5 in. storm, representative', short: '14-day + storm (linear)', cite: [['TCEQ', 'Linear sites (pipeline, highway, utility) with limited access: at least every 14 calendar days and within 24 hours after a 0.5 in. storm; representative inspections cover 0.25 mile above and below each access point (Part III.F.8(d)).'], ['TCEQ', 'The 7-day alternative is also allowed for linear sites (Part III.F.8(d)ii).']] }
  };
  function inspectionPlan(f) {
    var m = INSP_MODES[f.inspMode] || INSP_MODES.d14;
    var rules = m.cite.slice();
    rules.push(['TCEQ', 'Storm trigger details: several small storms totaling 0.5 in. or more in 24 hours count; when the 24-hour window falls entirely outside normal working hours, inspect by the end of the next business day; for a multi-day storm inspect within 24 hours of the first day and within 24 hours after the last day (Part III.F.8(c)i(A)-(B)).']);
    rules.push(['TCEQ', 'Areas that are finally stabilized or temporarily stabilized: at least once a month (Part III.F.8(c)ii).']);
    rules.push(['TCEQ', 'Schedule changes: at most once per calendar month, implemented within the first five business days of the month (linear sites: at the beginning of the month), with the reason written in the SWP3 (Part III.F.8(c)vi; III.F.8(d)iii).']);
    rules.push(['TCEQ', 'Report within 24 hours of each inspection listing erosion/discharge locations, BMPs needing maintenance, failed BMPs and where more BMPs are needed; certify compliance when no non-compliance is found; signed per 30 TAC 305.128 (Part III.F.8(f)).']);
    rules.push(['TCEQ', 'Revise the SWP3 within 7 calendar days after an inspection; implement BMP changes before the next storm where practicable (Part III.F.8(g); Part III.E).']);
    rules.push(['TCEQ', 'Inspections may be suspended for dangerous or inaccessible conditions (document date/time, witnesses, narrative) and resume as soon as access is practicable (Part III.F.8(e)-(f)).']);
    if (f.act && f.act.dewatering) rules.push(['TCEQ', 'Dewatering: observe and evaluate controls at least once per day on days a dewatering discharge occurs; report within 24 hours (Part III.F.7). TxDOT: Contractor uses Form 2675 daily (Section 2.2).']);
    if (f.type === 'txdot') {
      rules.push(['TXDOT', 'Contractor monitors controls daily while BMPs are in place or soil disturbance is evident, with written records (not required on non-work days unless it rained); corrections before the next rain or within 7 calendar days (Item 506 sections 4.4 and 4.5).']);
      rules.push(['TXDOT', 'TxDOT or CEI inspectors record each inspection on Form 2118 and file it in Binder Attachment 2.5 within one week; inspectors must have the qualifications form on file (Section 2.2).']);
    }
    rules.push(['TCEQ', 'Inspections continue until final stabilization is achieved and, for large sites, the NOT is filed and site notices removed (Part II.F).']);
    return { mode: m, rules: rules };
  }
  function inspectionDue(mode, lastIso, rainLog, today) {
    today = today || todayStr();
    if (!isoOk(lastIso)) return { due: '', reason: 'No inspection logged yet', overdue: false, daysLeft: null };
    var due, reason;
    if (mode === 'd7') { due = addDays(lastIso, 7); reason = '7 days after last inspection'; }
    else {
      due = addDays(lastIso, 14); reason = '14 days after last inspection';
      (rainLog || []).forEach(function (r) {
        if (r && isoOk(r.date) && r.date >= lastIso && num(r.inches) != null && num(r.inches) >= 0.5) {
          var sd = addDays(r.date, 1);
          if (sd < due) { due = sd; reason = 'within 24 h of the ' + fix(num(r.inches), 2) + ' in. storm ending ' + fmtDate(r.date) + ' (next business day if outside work hours)'; }
        }
      });
    }
    return { due: due, reason: reason, overdue: due < today, daysLeft: daysBetween(today, due) };
  }

  /* ---------- outline ---------- */
  function P_(b, t) { return { k: 'p', b: b, t: t }; }
  function UL(items) { return { k: 'ul', items: items }; }
  function KV(rows) { return { k: 'kv', rows: rows }; }
  function TB(head, rows) { return { k: 'table', head: head, rows: rows }; }
  function SIG(lines) { return { k: 'sig', lines: lines }; }

  function bmpItems(ids, cats) {
    var items = [];
    ids.forEach(function (id) {
      var b = bmpById(id); if (!b || cats.indexOf(b.cat) < 0) return;
      items.push([b.badge, b.name + (b.ec ? ' (' + b.ec + ')' : '') + ' [' + (b.tp === 'T' ? 'temporary' : b.tp === 'P' ? 'permanent' : 'temporary/permanent') + ']']);
    });
    return items;
  }
  function pollutants(f) {
    var a = f.act || {}, l = [];
    l.push(['TXDOT', 'Sediment from erosion of disturbed soils.']);
    l.push(['TXDOT', 'Petroleum products, fluids and fuel from equipment (listed by TxDOT as typical sources, Summary Sheet 1.10).']);
    l.push(['TCEQ', 'Trash, litter, construction debris and materials stored on site (Part III.F.1(b), III.F.4(b); Part IV.D.2-4).']);
    if (a.concrete) l.push(['TCEQ', 'Concrete wash-out water, saw-cutting slurry (high pH) and concrete waste (Part VI; Part IV.E.1).']);
    if (a.dewatering) l.push(['TCEQ', 'Sediment-laden dewatering discharges (Part IV.C).']);
    if (a.fueling) l.push(['TCEQ', 'Fuels, oils, chemicals, paints, solvents and vehicle/equipment wash water (Part IV.D.1, IV.E).']);
    if (a.sanitary) l.push(['TCEQ', 'Sanitary waste from portable toilets (Part IV.D.6).']);
    if (a.exits) l.push(['TCEQ', 'Sediment and dust tracked onto paved roads (Part III.F.4(a)).']);
    if (a.stockpiles) l.push(['TXDOT', 'Stockpiled soil, aggregate, asphalt and similar loose materials (stockpile fact sheet).']);
    if (a.demolition) l.push(['TCEQ', 'Demolition debris. Demolition of a structure with 10,000 sq ft or more of floor space built or renovated before 1980, where the receiving water is impaired for PCBs, needs controls to keep PCB-containing materials out of rain and stormwater (Part III.F.4(g)).']);
    if (a.support) l.push(['TCEQ', 'Support activities (staging, borrow, batch plants, wash areas); they must be directly related to the site and within 1 mile to be covered (Part II.A.2).']);
    return l;
  }
  function phaseRows(f) { return (f.phases || []).map(function (p) { return [p.name || '(unnamed)', fmtDate(p.start) || '', fmtDate(p.end) || '', p.acres || '']; }); }

  function designBlocks(project) {
    var d = project.design;
    if (!d || !Object.keys(d).length || !DS) return [];
    var env = { idf: root.IDF_PDS || (typeof window !== 'undefined' && window.IDF_PDS) || null, ls: root.SwpLS || null, price: null };
    var o = DS.compute(d, env);
    return DS.outlineBlocks(o, d.qt && d.qt.snap);
  }
  function generateOutline(project) {
    var f = project.form, perm = permitDetermination(f), t = perm.totals, txdot = f.type === 'txdot';
    var sel = project.sel, ids = selectedIds(f, sel);
    var basin = basinCheck(f), insp = inspectionPlan(f), dl = deadlines(f, perm), seal = sealFlags(f, sel);
    var S = [], n = 0;
    function sec(title, refs, blocks) { n++; S.push({ n: n, id: 's' + n, title: title, refs: refs, blocks: blocks }); }
    var roleRows = txdot
      ? [['TxDOT (District / Area Office)', blank(f.owner, 'owner'), 'Primary operator with control over plans and specifications', blank('', 'TPDES no. / NOI date')],
         ['Contractor', blank(f.contractor, 'contractor'), 'Primary operator with day-to-day operational control', blank('', 'TPDES no. / NOI date')]]
      : [['Owner / operator with control of plans and specs', blank(f.owner, 'owner'), 'Primary operator (control over plans and specifications)', blank('', 'TPDES no. / NOI date')],
         ['Contractor', blank(f.contractor, 'contractor'), 'Primary operator with day-to-day operational control', blank('', 'TPDES no. / NOI date')]];
    if (String(f.secondary || '').trim()) roleRows.push(['Secondary operator', f.secondary, 'Controls plans/specs but not day-to-day work (Part II.E.3(f))', blank('', 'TPDES no. / NOI date')]);

    var kv1 = [['Project', blank(project.name)], ['Project type', typeLabel(f.type)]];
    if (txdot) kv1.push(['CSJ(s) / highway', blank((f.csj || '') + (f.csj && f.highway ? ' / ' : '') + (f.highway || ''), 'CSJ / highway')]);
    kv1 = kv1.concat([
      ['County / city', blank((f.county || '') + (f.county && f.city ? ' / ' : '') + (f.city || ''))],
      ['Project limits', blank(f.limits)],
      ['Begin / end coordinates (decimal degrees)', blank((f.coordsBegin || '') + ' / ' + (f.coordsEnd || ''), 'lat, long')],
      ['Disturbed acres', t.disturbed ? fix(t.disturbed) : '____'],
      ['Support-activity acres', t.support ? fix(t.support) : '0 / ____'],
      ['Total project acres', t.total ? fix(t.total) : '____'],
      ['Common plan of development', f.commonPlan ? 'Yes; total plan ' + (f.planAcres ? f.planAcres + ' acres' : '____ acres') : 'No'],
      ['Anticipated start / completion', (fmtDate(f.start) || '____') + ' / ' + (fmtDate(f.end) || '____')]
    ]);
    sec('Project and site description', [['TXDOT', 'Summary Sheet 1, items 1.1-1.6'], ['TCEQ', 'Part III.F.1']],
      [KV(kv1),
       P_('TCEQ', 'Nature of the construction activity: ' + blank(f.nature)),
       P_('ASSUMED', 'Soils: ' + blank(f.soils, 'major soil types') + '. Steepest finished slope: ' + (f.steepest ? f.steepest + 'H:1V' : '____') + (f.erosive ? ' (soils marked erosive by the user)' : '') + '. Rainfall/erosion factors (user entries, not computed here): ' + blank(f.rainNote) + '.'),
       P_('TCEQ', 'Attach a general location map and detailed site map(s) showing (Part III.F.1):'),
       UL([['TCEQ', 'property boundaries; drainage patterns and approximate slopes before and after major grading'],
         ['TCEQ', 'areas of soil disturbance and phasing; locations of planned or existing controls and buffers; locations of temporary or permanent stabilization'],
         ['TCEQ', 'construction support activities including off-site ones; surface waters (including wetlands) at, adjacent to or within one mile downstream of discharge points and whether they are impaired'],
         ['TCEQ', 'points where stormwater leaves the site; storm drain inlets on and near the site; vehicle wash areas; designated vehicle exits onto paved roads; concrete, paint and stucco washout, solid waste storage and dewatering locations']]),
       P_('TXDOT', txdot ? 'Include the SWP3 Summary Sheets in the plans and mark up the Environmental Layout Sheets (Binder Attachments 1.1 and 1.2).' : 'If this work becomes a TxDOT project, use the TxDOT SWP3 Summary Sheet and Binder templates.')]);

    var ph = phaseRows(f);
    sec('Construction sequence and schedule', [['TXDOT', 'Summary Sheet 1.9'], ['TCEQ', 'Part III.F.1(c); III.F.2(b)']],
      [P_('TCEQ', 'Describe the intended schedule or sequence of soil-disturbing activities for major portions of the site with estimated start dates and durations. Keep records of dates of major grading, dates when construction temporarily or permanently ceases on a portion of the site, and dates when stabilization starts.'),
       ph.length ? TB(['Phase / activity', 'Start', 'End', 'Acres'], ph) : P_('ASSUMED', 'No phases entered. Add phases on the Project tab.'),
       P_('TXDOT', 'TxDOT documents ceasing and stabilization dates on Form 2118.')]);

    sec('Potential pollutants and their sources', [['TXDOT', 'Summary Sheet 1.10'], ['TCEQ', 'Part III.F.1(b)']], [UL(pollutants(f))]);

    var recvNotes = perm.notes.filter(function (x) { return /^(Edwards|Impaired|Determine whether)/.test(x[1]); }).map(function (x) { return P_(x[0], x[1]); });
    sec('Receiving waters, impairments and MS4s', [['TXDOT', 'Summary Sheet 1.11, 1.14'], ['TCEQ', 'Part II.C.4-5; III.F.1; II.E.3(d)']],
      [KV([
        ['Nearest receiving water', blank(f.receiving)],
        ['Flow path to TCEQ classified segment', blank(f.segment, 'TxDOT 1.11')],
        ['MS4 operator(s) receiving discharge', blank(f.ms4, 'names and addresses')],
        ['Impaired water (303(d)) / TMDL', (f.tmdl === 'yes' ? 'YES. ' : f.tmdl === 'no' ? 'No. ' : 'Not yet determined. ') + (f.tmdlNote || '')],
        ['Edwards Aquifer recharge / contributing zone', (f.edwards === 'yes' ? 'YES. ' : f.edwards === 'no' ? 'No. ' : 'Not yet determined. ') + (f.edwardsNote || '')]]),
       P_('TCEQ', 'The SWP3 lists the names and addresses of every MS4 operator that receives a copy of the NOI (large sites) or site notice (small sites) (Part II.E.3(d); II.E.2(d)).')].concat(recvNotes));

    sec('Operators, roles and shared SWP3', [['TXDOT', 'Summary Sheet 1.12-1.13; Binder Attachment 2.11'], ['TCEQ', 'Part III.A-B']],
      [TB(['Party', 'Name', 'Role', 'TPDES authorization no. / NOI date'], roleRows),
       P_('TCEQ', 'Operators may share one SWP3; it names each participating operator, gives authorization numbers (large sites), says which operator is responsible for each shared requirement, and is signed by each operator (Part III.A).'),
       P_('TXDOT', txdot ? 'TxDOT bid-build projects: by bidding the Contractor accepts the SWP3 and is bound by it through the contract documents and Item 506. The Contractor names a Contractor Responsible Person (CRPE) and alternate at the preconstruction conference (Item 506).' : 'If this becomes a TxDOT project, the Item 506 Contractor roles (CRPE and alternate) apply.'),
       P_('TCEQ', 'If signature authority is delegated, keep the delegation in the SWP3 (Part III.F.1).' + (txdot ? ' TxDOT: see Binder Attachment 2.7 and Section 2.2 for who can sign reports.' : ''))]);

    var authBlocks = [P_('TCEQ', perm.label + '. ' + perm.headline)];
    if (perm.steps.length) authBlocks.push(UL(perm.steps));
    if (perm.tier === 'large' || perm.tier === 'small') authBlocks.push(P_('TCEQ', 'Place a copy of the NOI and acknowledgement (primary operators of large sites) or the site notice (small sites and secondary operators) in the SWP3, post the notice where the public can see it, and keep it until final stabilization (Part III.D.2; III.F.1).'));
    if (dl.length) authBlocks.push(TB(['Date', 'Action', 'Source'], dl.map(function (d) { return [d.date ? fmtDate(d.date) : '(after final stabilization)', d.label, badgeLabel(d.b) + ' ' + d.ref]; })));
    sec('Authorization and notices', [['TCEQ', 'Part II.E; III.D.2'], ['TXDOT', 'Section 1, 2.0']], authBlocks);

    var eros = bmpItems(ids, ['erosion']);
    sec('Erosion control and stabilization practices', [['TXDOT', 'Summary Sheet 2.1; Item 506'], ['TCEQ', 'Part III.F.2(a)-(b); IV.A-B']],
      [P_('TCEQ', 'Erosion and sediment controls retain sediment on site to the extent practicable, are designed for topography, soil and rainfall, and are installed and maintained per good engineering practice and the manufacturer\'s or designer\'s specifications (Part III.F.2(a)). Minimize soil exposure and steep-slope disturbance and preserve topsoil (Part IV.A).'),
       eros.length ? UL(eros) : P_('ASSUMED', 'No erosion-control BMPs selected.'),
       P_('TCEQ', 'Stabilization: where work has temporarily ceased for more than 14 calendar days, or has permanently ceased, initiate stabilization immediately and complete it as soon as practicable (Part III.F.2(b); Part IV.B). Final stabilization is required before termination.'),
       P_('TXDOT', 'Select erosion-control BMPs from the TxDOT items and Approved Products List; mark each T (temporary) or P (permanent); quantities match the Summary Sheets.')]);

    var sed = bmpItems(ids.filter(function (id) { return ['vegetated_buffer', 'outlet_protection', 'dewatering_controls'].indexOf(id) < 0; }), ['sediment', 'water']);
    var sb = [P_('TCEQ', 'Perimeter controls: at minimum silt fence, vegetative buffer strips or equivalent sediment controls on all down-slope boundaries and the side-slope boundaries that site conditions call for (Part III.F.2(c)).')];
    var kv2 = [['Largest area disturbed at one time in a common drainage location', f.openAcres ? fix(f.openAcres) + ' acres' : '____ acres'],
      ['Basin required by permit', basin.open == null ? 'Not tested (enter the area)' : basin.required ? 'Yes, where feasible' : 'No (under 10 acres)']];
    if (basin.permitNoCalcCf) kv2.push(['Permit storage if no rainfall calculation (3,600 cu ft/acre)', fix(basin.permitNoCalcCf, 0) + ' cu ft']);
    if (basin.txdotTrapCf) kv2.push(['TxDOT sediment trap volume (1,800 cu ft/acre, 5 acres or less)', fix(basin.txdotTrapCf, 0) + ' cu ft']);
    sb.push(KV(kv2));
    basin.notes.forEach(function (x) { sb.push(P_(x[0], x[1])); });
    if (f.basinInfeasible) sb.push(P_('TCEQ', 'Basin not feasible. Reason: ' + blank(f.basinWhy) + '. Equivalent controls until final stabilization: ____________ (Part III.F.2(c)).'));
    sb.push(sed.length ? UL(sed) : P_('ASSUMED', 'No sediment-control BMPs selected.'));
    sb.push(P_('TXDOT', 'Attach sediment trap/basin capacity calculations or the justification for none (Binder Attachment 1.3).'));
    sec('Sediment control practices', [['TXDOT', 'Summary Sheet 2.2; EC standard sheets'], ['TCEQ', 'Part III.F.2(c); IV.F']], sb);

    var dsn = designBlocks(project);
    if (dsn.length) sec('Design basis and quantities', [['TXDOT', 'HDM Ch.4, 7, 10; Item 506'], ['TCEQ', 'Part III.F.2(c)i(A) (calculations go in the SWP3)'], ['ISWM', 'Construction Controls']], dsn.concat([P_('ASSUMED', 'Results come from the Design tab of this tool (screening aid). Inputs, equations and sources are on the printed calc sheets. Engineer of record to verify before use.')]));

    sec('Permanent (post-construction) stormwater controls', [['TXDOT', 'Summary Sheet 2.3'], ['TCEQ', 'Part III.F.3']],
      [P_('TCEQ', 'Describe stormwater controls installed during construction that will control pollutants in discharges after construction, and install them before final stabilization (Part III.F.3).'),
       P_('ASSUMED', 'Permanent controls for this project: ' + blank(f.permanentNote, 'list with stationing')),
       P_('TXDOT', 'List permanent controls with stationing and give long-term inspection and maintenance requirements.'),
       P_('HC', 'Harris County keeps the construction SWPPP separate from the post-construction SWQMP; confirm needs with the County Engineer.'),
       P_('HOU', 'City of Houston: confirm any post-construction water-quality requirements in the current IDM.')]);

    var trk = bmpItems(ids, ['tracking']);
    sec('Off-site vehicle tracking and dust', [['TXDOT', 'Summary Sheet 2.4'], ['TCEQ', 'Part III.F.4(a)']],
      [P_('TCEQ', 'Minimize off-site tracking of sediment and dust and describe the controls used (Part III.F.4(a)).'), trk.length ? UL(trk) : P_('ASSUMED', 'No tracking controls selected.')]);

    var pol = bmpItems(ids, ['pollution']);
    sec('Pollution prevention, housekeeping and spill response', [['TXDOT', 'Summary Sheet 2.5'], ['TCEQ', 'Part IV.D-E; III.F.4']],
      [UL([['TCEQ', 'Treat vehicle/equipment wash water in a sediment basin or equivalent before discharge (Part IV.D.1).'],
        ['TCEQ', 'Minimize exposure of building materials, wastes, fertilizers, pesticides, detergents and sanitary waste to rain; close waste-container lids at end of day and during storms; clean up wastes daily and overflow immediately (Part IV.D.2-4).'],
        ['TCEQ', 'Spills/leaks: prevention and response procedures (Part IV.D.5). Reportable quantity releases: call the National Response Center, (800) 424-8802, and follow the permit for the written report.'],
        ['TCEQ', 'Portable toilets secured, away from surface water and inlets (Part IV.D.6).'],
        ['TCEQ', 'Prohibited discharges include concrete wash-out wastewater (unless managed), paint, form-release-oil and curing-compound wash-out, fuels, oils, soaps and solvents (Part IV.E).']]),
       pol.length ? UL(pol) : P_('ASSUMED', 'No pollution-prevention BMPs selected.'),
       P_('TXDOT', 'Concrete: truck wash-out only in lined pits or enclosed containers away from water bodies and storm sewers; document locations in the SWP3. Keep a spill kit on site (Summary Sheet guidance 2.5; Item 506).')]);

    var vel = ids.filter(function (id) { return id === 'vegetated_buffer' || id === 'outlet_protection'; }).map(function (id) { var b = bmpById(id); return [b.badge, b.name]; });
    sec('Vegetated buffers and velocity dissipation', [['TXDOT', 'Summary Sheet 2.6'], ['TCEQ', 'Part IV.A.(6); III.F.4(d)']],
      [P_('TCEQ', 'Maintain natural buffers around surface water where feasible and place velocity dissipation devices at discharge locations and along outfall channels (Part IV.A.(6); III.F.4(d)).'),
       (f.act && f.act.surfaceWater) ? P_('TCEQ', f.bufferInfeasible ? 'Buffer not feasible. Reason: ' + blank(f.bufferWhy) + '. Equivalent controls and stationing: ____________.' : 'Buffer location(s)/stationing: ____________.') : P_('TXDOT', 'No surface waters present, vegetated buffer zones are not planned. (Summary Sheet 2.6 wording; confirm.)'),
       vel.length ? UL(vel) : P_('ASSUMED', 'None selected.')]);

    var nsd = D.NSD.filter(function (x) { return f.nsd && f.nsd[x.key]; });
    sec('Allowable non-stormwater discharges', [['TXDOT', 'Summary Sheet 2.7'], ['TCEQ', 'Part II.A.3; III.F.9']],
      [P_('TCEQ', 'Only uncontaminated discharges that will not adversely affect surface water, and for which the SWP3 identifies pollution-prevention measures, are allowed (Part II.A.3; III.F.9).'),
       nsd.length ? UL(nsd.map(function (x) { return ['TXDOT', x.label]; })) : P_('ASSUMED', 'None selected. Select any that may occur on the Project tab.')]);

    sec('Dewatering', [['TXDOT', 'Summary Sheet 2.8; Form 2675'], ['TCEQ', 'Part IV.C; III.F.7']],
      f.act && f.act.dewatering ? [P_('TCEQ', 'Dewatering discharges are prohibited unless managed by controls that address sediment and prevent erosion. Observe and evaluate the controls at least once per day on days a dewatering discharge occurs; the report within 24 hours covers date, personnel, approximate start/stop times, estimated discharge rate, any signs of pollutant discharge (foam, sheen, odor, floating solids, suspended sediment) and major observations (Part III.F.7).'),
         UL(ids.filter(function (id) { return id === 'dewatering_controls'; }).map(function (id) { return [bmpById(id).badge, bmpById(id).name]; })),
         P_('TXDOT', 'Show planned dewatering locations and BMPs on the layout sheets; keep dewatering records and Form 2675 in the Binder.'),
         P_('ASSUMED', 'Dewatering locations/discharge method: ' + blank(f.dewaterNote))]
        : [P_('TXDOT', 'No dewatering anticipated. If it becomes necessary, the controls, daily observation and 24-hour reports above apply (Part IV.C; Part III.F.7).')]);

    sec('Inspections', [['TXDOT', 'Section 2.2; Form 2118; Appendix C'], ['TCEQ', 'Part III.F.8']],
      [KV([['Selected schedule', insp.mode.label]]), UL(insp.rules),
       P_('TCEQ', 'Inspect disturbed areas not finally stabilized, stabilized locations, support-activity areas, stormwater controls, areas where stormwater flows and discharge points; check vehicle exits for off-site tracking; when discharging record color, odor, solids, foam and sheen (Part III.F.8(a)-(b)).'),
       P_('ASSUMED', 'Inspector(s) and qualifications: ____________________________')]);

    sec('Maintenance', [['TXDOT', 'Item 506'], ['TCEQ', 'Part III.F.6']],
      [UL([['TCEQ', 'Keep all controls effective. When a control is not working, maintain it before the next rain if feasible; if not feasible, document why and schedule it as soon as practicable (Part III.F.6).'],
        ['TCEQ', 'Controls that are disabled, run over or removed are replaced or corrected immediately on discovery (Part III.F.6).'],
        ['TCEQ', 'Remove sediment from traps and ponds no later than when design capacity is down 50%; from silt fence and berms before it reaches 50% of the above-ground height (Part III.F.6).'],
        ['TCEQ', 'If sediment leaves the site, remove it at a frequency that limits off-site impact, before the next rain if feasible (Part III.F.6).'],
        ['TXDOT', 'Contractor corrects deficiencies before the next anticipated rain or within 7 calendar days of being able to enter the site; critical ones immediately (Item 506).']])]);

    sec('Final stabilization and termination', [['TCEQ', 'Part I.B (Final Stabilization); II.F'], ['TXDOT', 'Item 506']],
      [P_('TCEQ', 'Final stabilization: all soil disturbance complete and uniform perennial vegetative cover with at least 70% of the native background cover on all unpaved areas not covered by permanent structures, or equivalent permanent stabilization such as riprap or gabions (Part I.B).'),
       P_('TCEQ', perm.tier === 'large' ? 'Large site: file the NOT within 30 days of final stabilization (or transfer of control), copy MS4 operators, remove the site notice (Part II.F.1).' : 'Keep any posted notice up until final stabilization, then remove it (Part II.E.2(c)).'),
       P_('TXDOT', 'Remove temporary controls after the vegetative cover or other stabilization is accepted unless directed otherwise (Item 506).')]);

    sec('Compliance with other federal, state and local requirements', [['TCEQ', 'Part III.F.5; II.C'], ['TXDOT', 'Binder Attachments 2.9-2.10']],
      [UL([['TCEQ', 'Keep the SWP3 consistent with approved sediment and erosion plans, grading plans or stormwater management plans, and update it when they change (Part III.F.5).'],
        ['TCEQ', 'If an Edwards Aquifer plan is required, include or reference the approval in the SWP3 (Part III.F.5).'],
        ['TXDOT', 'Include the EPIC sheet (Environmental Permits, Issues and Commitments) and list additional permits (Binder Attachments 2.9, 2.10).'],
        ['TCEQ', 'Discharges cannot adversely affect listed threatened or endangered aquatic species or critical habitat unless Endangered Species Act requirements are met (Part II.C.11).']]),
       isHouston(f) ? P_('HOU', 'City of Houston: SWPPP per the Stormwater Management Handbook for Construction Activities (not read for this tool) and Standard Drawing 01570-01 (IDM 9.5.01.D).') : P_('HC', 'Harris County / HCFCD and other local MS4s may have separate submittal rules; confirm with the MS4 operator listed above.'),
       P_('ISWM', 'iSWM Construction Controls (NCTCOG) can be a secondary reference for BMP details.')]);

    sec('Revisions and updates', [['TCEQ', 'Part III.E'], ['TXDOT', 'Binder Attachment 2.8']],
      [P_('TCEQ', 'Revise the SWP3, including the site map, within 7 days after a significant change in design, construction, operation or maintenance not already addressed; changing site conditions, operators or BMPs; or inspections showing the SWP3 is ineffective (Part III.E; III.F.8(g)).'),
       P_('TXDOT', 'Keep a SWP3 revisions log (Attachment 2.8). Contractor-proposed changes need approval and incorporation (Item 506).'),
       TB(['Date', 'Change made', 'By', 'Reason'], [['', '', '', ''], ['', '', '', ''], ['', '', '', '']])]);

    sec('Record keeping', [['TCEQ', 'Part VII; III.D.1'], ['TXDOT', 'SWP3 Binder template']],
      [UL([['TCEQ', 'Retain the SWP3, all reports and actions required by the permit (including the site notice), data used for the NOI, and records of submittals to MS4 and secondary operators for at least 3 years from the NOT or termination of coverage (Part VII).'],
        ['TCEQ', 'Keep the SWP3 on site, or post a notice of its location if the site is inactive; make it available to TCEQ, local officials and the MS4 operator. It may be electronic if equivalent to paper (Part III.D.1).'],
        ['TXDOT', 'Binder attachments: 1.1 Summary Sheets; 1.2 layout markup; 1.3 basin/trap calculations; 2.1-2.4 NOI/NOC/NOT/CSN and MS4 notices; 2.5 Form 2118 inspections; 2.6 inspector qualifications; 2.7 delegation; 2.8 revisions log; 2.9-2.10 compliance documentation; 2.11 shared SWP3 statement.'],
        ['TCEQ', 'Include a copy of the permit or a current link in the SWP3 (Part III.F.1).']])]);

    var sigLines = ['Primary operator with control of plans/specs (' + (f.owner || 'owner') + ')', 'Primary operator with day-to-day control (' + (f.contractor || 'contractor') + ')'];
    if (f.secondary) sigLines.push('Secondary operator (' + f.secondary + ')');
    if (seal.length) sigLines.push('Professional Engineer (name, P.E. no., seal, date)');
    var sb2 = [];
    if (seal.length) sb2.push(P_('TXDOT', 'A Professional Engineer seal on the Summary Sheets may be required because: ' + seal.join(' ') + ' (Summary Sheet guidance 2.11).'));
    sb2.push(P_('TCEQ', 'Each operator participating in the SWP3 signs it (Part III.A). Use the certification statement printed on the applicable TCEQ form (20961, 20962 or 20963) for notices; inspection reports are signed per 30 TAC 305.128 (Part III.F.8). Signature blocks are left blank on purpose.'));
    sb2.push(SIG(sigLines));
    sec('Responsible parties and certifications', [['TCEQ', 'Part III.A; 30 TAC 305.128'], ['TXDOT', 'Summary Sheet 2.11']], sb2);
    return S;
  }

  /* ---------- exports ---------- */
  function badgeLabel(k) { return D.BADGES[k] ? D.BADGES[k].label : k; }
  function bd(k) { return '<span class="bd ' + (D.BADGES[k] ? D.BADGES[k].cls : 'as') + '">' + esc(badgeLabel(k)) + '</span> '; }
  function blocksToHtml(blocks) {
    return blocks.map(function (b) {
      if (b.k === 'p') return '<p>' + bd(b.b) + esc(b.t) + '</p>';
      if (b.k === 'ul') return '<ul>' + b.items.map(function (i) { return '<li>' + bd(i[0]) + esc(i[1]) + '</li>'; }).join('') + '</ul>';
      if (b.k === 'kv') return '<table class="kv"><tbody>' + b.rows.map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
      if (b.k === 'table') return '<table><thead><tr>' + b.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      if (b.k === 'sig') return '<div class="sig">' + b.lines.map(function (l) { return '<div class="sigline"><span>' + esc(l) + '</span><i>Signature ______________________  Date __________</i></div>'; }).join('') + '</div>';
      return '';
    }).join('');
  }
  function outlineToHtml(project, sections) {
    var f = project.form;
    var h = '<div class="doc"><h1>Stormwater Pollution Prevention Plan (SWP3): DRAFT OUTLINE</h1>' +
      '<p class="draftbar"><b>' + esc(DISCLAIMER) + '</b></p>' +
      '<p class="meta">' + esc(project.name) + ' &middot; ' + esc(typeLabel(f.type)) + ' &middot; Permit basis: ' + esc(D.PERMIT.title) + ', effective ' + esc(D.PERMIT.effective) + ', expires ' + esc(D.PERMIT.expires) + ' &middot; Generated ' + esc(todayStr()) + '</p>' +
      '<p class="legend">Source tags: ' + ['TXDOT', 'TCEQ', 'HOU', 'HC', 'ISWM', 'ROT', 'ASSUMED'].map(bd).join('') + ' TxDOT first; the TCEQ permit is the floor and wins where TxDOT is less strict.</p>';
    sections.forEach(function (s) {
      h += '<h2>' + s.n + '. ' + esc(s.title) + '</h2><p class="refs">' + s.refs.map(function (r) { return bd(r[0]) + esc(r[1]); }).join(' ') + '</p>' + blocksToHtml(s.blocks);
    });
    h += '<h2>Appendix A. Where TxDOT guidance and the permit differ</h2>' + flagsFor(f, project.sel).map(function (x) { return '<div class="flag"><b>' + esc(x.title) + '</b><p>' + bd('TXDOT') + esc(x.txdot) + '</p><p>' + bd('TCEQ') + esc(x.tceq) + '</p><p><b>' + esc(x.resolution) + '</b></p></div>'; }).join('');
    h += '<h2>Appendix B. Sources</h2><ul>' + Object.keys(D.SOURCES).map(function (k) { var s = D.SOURCES[k]; return '<li>' + bd(s.badge) + esc(s.label) + ' &mdash; ' + esc(s.url) + ' <i>(' + (s.status === 'read' ? 'read' : 'link only') + ')</i></li>'; }).join('') + '</ul>';
    h += '<p class="foot"><b>' + esc(DISCLAIMER) + '</b></p></div>';
    return h;
  }
  function mdc(s) { return String(s == null ? '' : s).replace(/\|/g, '/').replace(/\n/g, ' '); }
  function outlineToMarkdown(project, sections) {
    var f = project.form, L = [];
    function bt(k) { return '[' + badgeLabel(k) + '] '; }
    L.push('# SWP3 draft outline: ' + project.name, '', '> **' + DISCLAIMER + '**', '',
      '- Type: ' + typeLabel(f.type), '- Permit basis: ' + D.PERMIT.title + ', effective ' + D.PERMIT.effective + ', expires ' + D.PERMIT.expires,
      '- Precedence: TxDOT first, TCEQ permit as the floor (permit wins where TxDOT is less strict), then Houston/Harris/iSWM, then rule of thumb', '- Generated: ' + todayStr(), '');
    sections.forEach(function (s) {
      L.push('## ' + s.n + '. ' + s.title, '', '*Refs:* ' + s.refs.map(function (r) { return bt(r[0]) + r[1]; }).join('; '), '');
      s.blocks.forEach(function (b) {
        if (b.k === 'p') L.push(bt(b.b) + b.t, '');
        else if (b.k === 'ul') { b.items.forEach(function (i) { L.push('- ' + bt(i[0]) + i[1]); }); L.push(''); }
        else if (b.k === 'kv') { L.push('| Item | Value |', '|---|---|'); b.rows.forEach(function (r) { L.push('| ' + mdc(r[0]) + ' | ' + mdc(r[1]) + ' |'); }); L.push(''); }
        else if (b.k === 'table') { L.push('| ' + b.head.map(mdc).join(' | ') + ' |', '|' + b.head.map(function () { return '---'; }).join('|') + '|'); b.rows.forEach(function (r) { L.push('| ' + r.map(mdc).join(' | ') + ' |'); }); L.push(''); }
        else if (b.k === 'sig') { b.lines.forEach(function (l) { L.push('- ' + l + ': Signature ______________________  Date __________'); }); L.push(''); }
      });
    });
    L.push('## Appendix A. Where TxDOT guidance and the permit differ', '');
    flagsFor(f, project.sel).forEach(function (x) { L.push('**' + x.title + '**', '', '- [TxDOT] ' + x.txdot, '- [TCEQ] ' + x.tceq, '- **' + x.resolution + '**', ''); });
    L.push('## Appendix B. Sources', '');
    Object.keys(D.SOURCES).forEach(function (k) { var s = D.SOURCES[k]; L.push('- [' + badgeLabel(s.badge) + '] ' + s.label + ' - ' + s.url + ' (' + (s.status === 'read' ? 'read' : 'link only') + ')'); });
    L.push('', '**' + DISCLAIMER + '**', '');
    return L.join('\n');
  }
  function outlineToDoc(project, sections) {
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>SWP3 draft outline</title>' +
      '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:18pt}h2{font-size:14pt;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3pt;vertical-align:top;font-size:10pt}.bd{font-size:8pt;font-weight:bold;border:1px solid #666;padding:0 2pt}.draftbar{border:2px solid #b42318;padding:4pt}</style></head><body>' +
      outlineToHtml(project, sections) + '</body></html>';
  }

  /* ---------- printable inspection checklist ---------- */
  function checklistModel(project) {
    var f = project.form, ids = selectedIds(f, project.sel), insp = inspectionPlan(f);
    var general = [
      ['TCEQ', 'Disturbed areas not finally stabilized, stabilized locations, support-activity areas and points of discharge inspected (Part III.F.8(a))'],
      ['TCEQ', 'All stormwater controls installed properly, appear operational and are minimizing pollutants (Part III.F.8(b))'],
      ['TCEQ', 'Locations needing new or modified controls identified (Part III.F.8(b))'],
      ['TCEQ', 'Visible erosion and sedimentation at discharge points and in adjacent surface water checked (Part III.F.8(b))'],
      ['TCEQ', 'Vehicle entrances/exits checked for off-site sediment tracking (Part III.F.8(b))'],
      ['TCEQ', 'If discharging: all discharge points identified; color, odor, floating/settled/suspended solids, foam and sheen recorded (Part III.F.8(b))'],
      ['TCEQ', 'Incidents of non-compliance identified (Part III.F.8(b))'],
      ['TCEQ', 'Maintenance completed or scheduled, before next rain if feasible (Part III.F.6)'],
      ['TCEQ', 'Stabilization started where work has ceased more than 14 days or permanently; dates recorded (Part III.F.2(b))'],
      ['TCEQ', 'Concrete wash-out, waste containers, spill kit and portable toilets checked (Part IV.D, VI)']
    ];
    var per = ids.map(function (id) { var b = bmpById(id); return { id: id, name: b.name, items: b.triggers.concat(b.maint.slice(0, 2)) }; }).filter(function (x) { return x.items.length; });
    return { mode: insp.mode, general: general, perBmp: per, txdot: f.type === 'txdot' };
  }
  function checklistToHtml(project) {
    var m = checklistModel(project);
    return '<div class="doc"><h1>SWP3 Inspection Checklist</h1><p class="draftbar"><b>' + esc(DISCLAIMER) + '</b></p>' +
      '<p class="meta">' + esc(project.name) + ' &middot; ' + esc(m.mode.label) + (m.txdot ? ' &middot; TxDOT: record on Form 2118 and file in Binder Attachment 2.5' : '') + '</p>' +
      '<table class="kv"><tbody><tr><th>Date / time</th><td></td><th>Inspector</th><td></td></tr><tr><th>Rainfall since last inspection (in.)</th><td></td><th>Weather / site access</th><td></td></tr><tr><th>Storm event &ge; 0.5 in.?</th><td>Yes / No</td><th>Discharging now?</th><td>Yes / No</td></tr></tbody></table>' +
      '<h2>General (permit Part III.F.8)</h2><table><thead><tr><th>Check</th><th>Y</th><th>N</th><th>NA</th><th>Notes</th></tr></thead><tbody>' +
      m.general.map(function (g) { return '<tr><td>' + bd(g[0]) + esc(g[1]) + '</td><td>&#9744;</td><td>&#9744;</td><td>&#9744;</td><td></td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>Selected BMPs</h2>' + m.perBmp.map(function (x) {
        return '<h3>' + esc(x.name) + '</h3><table><tbody>' + x.items.map(function (i) { return '<tr><td>' + bd(i[0]) + esc(i[1]) + '</td><td>&#9744; Y</td><td>&#9744; N</td><td>&#9744; NA</td></tr>'; }).join('') + '</tbody></table>';
      }).join('') +
      '<h2>Corrective actions</h2><table><thead><tr><th>Location / BMP</th><th>Action</th><th>Responsible</th><th>Due</th><th>Done</th></tr></thead><tbody>' + [1, 2, 3, 4].map(function () { return '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>Certification</h2><p>' + bd('TCEQ') + 'If no non-compliance is found, the report includes a certification that the site is in compliance with the SWP3 and the permit, signed per 30 TAC 305.128 (Part III.F.8(f)). Use your own wording or the TxDOT Form 2118 certification.</p>' +
      '<div class="sig"><div class="sigline"><span>Inspector / certifying signatory</span><i>Signature ______________________  Date __________</i></div></div>' +
      '<p class="foot"><b>' + esc(DISCLAIMER) + '</b></p></div>';
  }

  var api = {
    APP_ID: APP_ID, VERSION: VERSION, DISCLAIMER: DISCLAIMER, INSP_MODES: INSP_MODES, LEVEL_ORDER: LEVEL_ORDER,
    num: num, todayStr: todayStr, addDays: addDays, daysBetween: daysBetween, fmtDate: fmtDate, isoOk: isoOk, esc: esc, uid: uid, fix: fix, typeLabel: typeLabel, bmpById: bmpById,
    defaultForm: defaultForm, newProject: newProject, sanitizeProject: sanitizeProject, backup: backup, restore: restore,
    totals: totals, permitDetermination: permitDetermination, deadlines: deadlines, basinCheck: basinCheck, edwardsCounty: edwardsCounty,
    recommendBmps: recommendBmps, selectedIds: selectedIds, applySuggestions: applySuggestions, checkSelection: checkSelection, sealFlags: sealFlags, flagsFor: flagsFor,
    inspectionPlan: inspectionPlan, inspectionDue: inspectionDue,
    generateOutline: generateOutline, outlineToHtml: outlineToHtml, outlineToMarkdown: outlineToMarkdown, outlineToDoc: outlineToDoc,
    checklistModel: checklistModel, checklistToHtml: checklistToHtml, blocksToHtml: blocksToHtml, badgeHtml: bd, badgeLabel: badgeLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SwpModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
