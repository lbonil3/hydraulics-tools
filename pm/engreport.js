/* Project Tracker v3.11: Engineering Report (drainage design report style), derived from the tracker data.
   Browser: window.PMEng (needs window.PMModel). Node: require('./engreport.js').
   Stored in the optional st.engReport = { meta: { csj, highway, limits, county, district, title }, secs: { <id>: { on, text, mode } }, refs }.
   Generated text only restates tracker data (names, roads, stations, sheet counts, dates). Anything an engineer must supply
   (conditions, criteria values, sizes, findings) is a bracketed placeholder — never an invented value. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.PMEng = factory(root.PMModel);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  const SECS = [
    ['intro', 'Introduction and Purpose'],
    ['desc', 'Project Description and Location'],
    ['scope', 'Scope of Work'],
    ['criteria', 'Design Criteria and References'],
    ['existing', 'Existing Conditions'],
    ['proposed', 'Proposed Drainage Improvements'],
    ['swp3', 'Storm Water Pollution Prevention (SWP3)'],
    ['sheets', 'Deliverables and Plan Sheet Index'],
    ['schedule', 'Schedule and Milestones'],
    ['concl', 'Conclusions and Recommendations'],
  ];
  const META = [['title', 'Report title'], ['csj', 'CSJ'], ['highway', 'Highway / road'], ['limits', 'Project limits'], ['county', 'County'], ['district', 'TxDOT district']];
  /* real, widely used references; names only (no URLs except the one already in the app), the engineer confirms editions */
  const DEFAULT_REFS = [
    'TxDOT Hydraulic Design Manual (current edition)',
    'TxDOT PS&E Preparation Manual, Chapter 6, Section 2 — Engineering Reviews (Table 6-1 Milestone Submittals): https://www.txdot.gov/manuals/des/pse/chapter-6--ps-e-submission--review-and-processing/section-2--engineering-reviews.html',
    'TxDOT Roadway Design Manual (current edition)',
    'TxDOT Standard Specifications for Construction and Maintenance of Highways, Streets, and Bridges (edition adopted for the project)',
    'FHWA HEC-22, Urban Drainage Design Manual',
    'FHWA HDS-5, Hydraulic Design of Highway Culverts',
    'NOAA Atlas 14, Volume 11 (Texas) precipitation-frequency estimates',
    'TCEQ TPDES Construction General Permit TXR150000',
  ];
  const MAXT = 20000;
  const PH = {
    intro: '[Engineer to state who authorized this report, its purpose and the design phase it supports.]',
    desc: '[Engineer to describe the project location (city, county, nearby landmarks), the existing roadway section and the proposed roadway improvements.]',
    scope: '[Engineer to confirm the drainage scope and list any work by others.]',
    criteria: '[Engineer to state the design criteria: design storm frequencies for inlets, storm sewers and culverts, allowable spread / ponding, hydraulic grade line and tailwater assumptions, rainfall source and runoff method.]',
    existing: '[Engineer to describe existing drainage conditions: drainage areas and outfalls, existing storm sewers, culverts, ditches and channels, known flooding or maintenance issues, floodplain status and field observations.]',
    proposed: '[Engineer to describe the proposed system: pipe and inlet types and sizes, culvert sizes, outfalls, detention, and how the design meets the criteria. Summarize the hydraulic results.]',
    swp3: '[Engineer to describe the SWP3 approach: disturbed area, permit coverage, temporary and permanent BMPs, and phasing.]',
    sheets: '',
    schedule: '[Engineer to confirm the submittal schedule with the TxDOT project manager.]',
    concl: '[Engineer to state conclusions and recommendations, open issues and any design exceptions or waivers.]',
  };
  const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const list = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const fmtFt = (n) => Math.round(n).toLocaleString('en-US') + ' ft';
  const sta = (r) => M.hasSta(r) ? 'Sta ' + M.formatStation(r.start) + ' to ' + M.formatStation(r.end) : 'stations not yet set';
  /* ---- stored edits (tolerant reads; writes keep the data small) ---- */
  function data(st) { const e = st.engReport; return e && typeof e === 'object' && !Array.isArray(e) ? e : {}; }
  function meta(st) { const m = data(st).meta || {}; return Object.fromEntries(META.map(([k]) => [k, typeof m[k] === 'string' ? m[k] : ''])); }
  function secState(st, id) { const s = (data(st).secs || {})[id] || {}; return { on: s.on !== false, text: typeof s.text === 'string' ? s.text : '', mode: s.mode === 'replace' ? 'replace' : 'add' }; }
  function refs(st) { const r = data(st).refs; return typeof r === 'string' ? r.split('\n').map((x) => x.trim()).filter(Boolean) : DEFAULT_REFS.slice(); }
  function refsText(st) { return refs(st).join('\n'); }
  function ensure(st) { if (!st.engReport || typeof st.engReport !== 'object' || Array.isArray(st.engReport)) st.engReport = {}; return st.engReport; }
  function tidy(st) { const e = st.engReport; if (!e) return; if (e.meta && !Object.keys(e.meta).length) delete e.meta; if (e.secs) { for (const k of Object.keys(e.secs)) if (!Object.keys(e.secs[k]).length) delete e.secs[k]; if (!Object.keys(e.secs).length) delete e.secs; } if (!Object.keys(e).length) delete st.engReport; }
  function setMeta(st, k, v) {
    if (!META.some(([x]) => x === k)) throw new Error('Unknown report field');
    const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 200), e = ensure(st);
    e.meta = Object.assign({}, e.meta); if (t) e.meta[k] = t; else delete e.meta[k]; tidy(st);
  }
  function setSec(st, id, f) {
    if (!SECS.some(([x]) => x === id)) throw new Error('Unknown report section');
    const e = ensure(st); e.secs = Object.assign({}, e.secs); const s = Object.assign({}, e.secs[id]);
    if ('on' in f) { if (f.on === false) s.on = false; else delete s.on; }
    if ('text' in f) { const t = String(f.text == null ? '' : f.text).replace(/\r\n?/g, '\n').slice(0, MAXT); if (t.trim()) s.text = t; else delete s.text; }
    if ('mode' in f) { if (f.mode === 'replace') s.mode = 'replace'; else delete s.mode; }
    e.secs[id] = s; tidy(st);
  }
  function setRefs(st, text) { const e = ensure(st); const t = String(text == null ? '' : text).replace(/\r\n?/g, '\n').slice(0, MAXT); if (t.trim() === DEFAULT_REFS.join('\n')) delete e.refs; else e.refs = t; tidy(st); }
  function resetRefs(st) { const e = ensure(st); delete e.refs; tidy(st); }
  /* ---- tracker facts ---- */
  function facts(st) {
    const subs = M.orderedSubs(st), all = M.allSheets(st);
    const roadGroupsAll = [];
    for (const sub of subs) for (const d of M.DISCIPLINES) for (const sec of M.sectionsOf(sub, d)) if (M.isPPSec(sec)) for (const g of M.roadGroups(sub, sec)) roadGroupsAll.push({ sub, sec, g });
    const byRoad = new Map();
    for (const x of roadGroupsAll) { const k = x.g.slug; if (!byRoad.has(k)) byRoad.set(k, { name: x.g.name, aligns: new Set(), entries: [], subs: new Set(), secs: new Set() }); const r = byRoad.get(k); M.groupAligns(x.g.entries).forEach((a) => r.aligns.add(a)); x.g.entries.forEach((e) => { const dk = M.hasSta(e) ? M.parseStation(e.start) + '|' + M.parseStation(e.end) : null; if (dk && r.entries.some((y) => M.hasSta(y.e) && M.parseStation(y.e.start) + '|' + M.parseStation(y.e.end) === dk)) return; r.entries.push({ e, sub: x.sub, sec: x.sec }); }); r.subs.add(x.sub.code); r.secs.add(x.sec.title); }
    const roads = [...byRoad.values()].map((r) => { const ok = r.entries.filter((x) => M.hasSta(x.e)); const lo = ok.length ? Math.min(...ok.map((x) => M.parseStation(x.e.start))) : null, hi = ok.length ? Math.max(...ok.map((x) => M.parseStation(x.e.end))) : null;
      return { name: r.name, aligns: [...r.aligns], subs: [...r.subs], secs: [...r.secs], entries: r.entries, lo, hi, length: r.entries.reduce((a, x) => a + M.segLength(x.e), 0) }; });
    const secsWith = (pred) => subs.flatMap((sub) => sub.segments.filter((g) => pred(g)).map((g) => ({ sub, g })));
    return { subs, all, roads, secsWith };
  }
  const isHds = (g) => typeof M.isHydSec === 'function' ? M.isHydSec(g) : /^dr-hds/.test(String(g.key || '')) || /hydraulic data/i.test(String(g.title || ''));
  /* ---- the sections: blocks = [{ p } | { ul } | { table:{ head, rows } }]; ph = the placeholder shown when the engineer adds nothing ---- */
  function build(st, today) {
    today = today || M.todayISO();
    const F = facts(st), R = M.report(st, today), rm = M.reportMeta(st), m = meta(st);
    const pname = st.project.name || 'the project';
    const out = {};
    const subNames = F.subs.map((s) => M.subLabel(s));
    const nSheets = F.all.length;
    /* 1 */
    out.intro = [{ p: 'This report documents the drainage design for ' + pname + (m.csj ? ' (CSJ ' + m.csj + ')' : '') + (m.highway ? ' on ' + m.highway : '') + (m.county ? ' in ' + m.county + ' County' : '') + (m.district ? ', TxDOT ' + m.district + ' District' : '') + '.' +
      (rm.preparedFor ? ' It is prepared for ' + rm.preparedFor + (rm.preparedBy ? ' by ' + rm.preparedBy : '') + '.' : rm.preparedBy ? ' It is prepared by ' + rm.preparedBy + '.' : '') },
      { p: 'It describes the project, the scope of the drainage' + (F.all.some((r) => r.seg.discipline === 'SWP3') ? ' and storm water pollution prevention (SWP3)' : '') + ' work, the design criteria and references, existing conditions and the proposed drainage improvements, and lists the plan sheets and schedule as tracked on ' + today + '.' }];
    /* 2 */
    const desc = [];
    if (m.limits) desc.push({ p: 'Project limits: ' + m.limits + '.' });
    desc.push({ p: 'The project is organized into ' + pl(F.subs.length, 'sub-project') + ': ' + list(subNames) + '.' });
    if (F.roads.length) {
      desc.push({ p: 'Roadway drainage work is tracked on ' + pl(F.roads.length, 'road') + ':' });
      desc.push({ table: { head: ['Road', 'Alignment', 'Stations', 'Length', 'Sub-projects'], rows: F.roads.map((r) => [r.name, r.aligns.join(', ') || '—', r.entries.map((x) => sta(x.e).replace(/^Sta /, '')).join('; '), r.length ? fmtFt(r.length) : '—', r.subs.join(', ')]) } });
    } else desc.push({ p: 'No road entries are tracked yet.' });
    out.desc = desc;
    /* 3 */
    const scope = [];
    for (const d of M.DISCIPLINES) {
      const rows = F.subs.flatMap((sub) => M.sectionsOf(sub, d).map((g) => ({ sub, g }))).filter((x) => x.g.sheets.length);
      if (!rows.length) continue;
      const bySec = new Map(); for (const x of rows) { const k = x.g.title; bySec.set(k, (bySec.get(k) || 0) + x.g.sheets.length); }
      const n = rows.reduce((a, x) => a + x.g.sheets.length, 0);
      scope.push({ p: (d === 'SWP3' ? 'SWP3' : 'Drainage') + ' scope: ' + pl(n, 'plan sheet') + ' in ' + pl(bySec.size, 'section') + ':' });
      scope.push({ ul: [...bySec.entries()].map(([k, v]) => k + ' — ' + pl(v, 'sheet')) });
    }
    if (!scope.length) scope.push({ p: 'No plan sheets are tracked yet.' });
    if (R.pp && R.pp.total) scope.push({ p: 'Plan and profile sheets are counted from the road stations and plan scale: ' + R.pp.total + ' in total (Drainage ' + R.pp.byDisc.Drainage + ', SWP3 ' + R.pp.byDisc.SWP3 + ').' });
    out.scope = scope;
    /* 4 */
    out.criteria = [{ p: 'The design follows the references listed below. Editions and applicability are to be confirmed by the engineer of record.' }, { refs: true }];
    /* 5 */
    out.existing = F.roads.length ? [{ p: 'The project area includes ' + list(F.roads.map((r) => r.name + (r.aligns.length ? ' (' + r.aligns.join(', ') + ')' : ''))) + '.' }] : [];
    /* 6 */
    const prop = [];
    const ppSecs = F.secsWith((g) => M.isPPSec(g) && g.discipline === 'Drainage');
    const ppRows = ppSecs.flatMap(({ sub, g }) => M.roadGroups(sub, g).map((rg) => ({ sub, g, rg, n: M.sheetsOfGroup(sub, g, rg).length })));
    if (ppRows.length) {
      prop.push({ h: 'Storm sewer and roadway drainage (plan and profile)' });
      prop.push({ p: 'Drainage plan and profile sheets are being prepared for:' });
      prop.push({ ul: ppRows.map((x) => M.subTag(x.sub) + ' · ' + x.g.title + ' — ' + x.rg.name + (M.groupAligns(x.rg.entries).length ? ' (' + M.groupAligns(x.rg.entries).join(', ') + ')' : '') + ', ' + x.rg.entries.map(sta).join('; ') + ' — ' + pl(x.n, 'sheet')) });
    }
    const hds = F.secsWith((g) => isHds(g) && g.sheets.length);
    if (hds.length) {
      prop.push({ h: 'Hydraulic computations (hydraulic data sheets)' });
      const by = new Map(); for (const x of hds) by.set(x.g.title, (by.get(x.g.title) || 0) + x.g.sheets.length);
      prop.push({ p: 'Hydraulic computations are documented on hydraulic data sheets: ' + list([...by.entries()].map(([k, v]) => pl(v, 'sheet') + ' of ' + k.replace(/^Hydraulic Data Sheet\s*-\s*/i, ''))) + '.' });
      const cross = hds.filter((x) => /crossing|culvert/i.test(x.g.title)).flatMap((x) => x.g.sheets.filter((s) => s.road || !/^hydraulic data sheet/i.test(s.title)).map((s) => M.subTag(x.sub) + ' · ' + s.title + (s.road ? ' (' + s.road + ')' : '')));
      if (cross.length) prop.push({ p: 'Crossings tracked:' }, { ul: cross });
    }
    const dams = F.subs.map((sub) => ({ sub, g: M.damSection(sub) })).filter((x) => x.g && x.g.sheets.length);
    const odam = F.secsWith((g) => g.key === 'dr-odam' && g.sheets.length);
    if (dams.length || odam.length) {
      prop.push({ h: 'Drainage area maps' });
      prop.push({ p: (odam.length ? pl(odam.reduce((a, x) => a + x.g.sheets.length, 0), 'overall drainage area map') + ' and ' : '') + pl(dams.reduce((a, x) => a + x.g.sheets.length, 0), 'drainage area map sheet') + ' are tracked' + (dams.some((x) => (M.damBranches ? M.damBranches(x.g) : []).length) ? ', following the plan and profile sheet breaks of ' + list([...new Set(dams.flatMap((x) => (M.damBranches ? M.damBranches(x.g) : []).map((b) => b.road)))]) : '') + '.' });
    }
    const lats = F.secsWith((g) => typeof M.isLatSec === 'function' && M.isLatSec(g) && g.sheets.length);
    if (lats.length) {
      prop.push({ h: 'Drainage laterals' });
      prop.push({ p: 'Drainage laterals are double-banked profile sheets. ' + pl(lats.reduce((a, x) => a + x.g.sheets.length, 0), 'sheet') + ' are tracked, counted by how many sheets are needed rather than by road.' });
    }
    const ponds = F.secsWith((g) => typeof M.isPondSec === 'function' && M.isPondSec(g) && M.unitSheets(g).length);
    if (ponds.length) {
      const ng = ponds.reduce((a, x) => a + M.unitGroups(x.g).length, 0), ns = ponds.reduce((a, x) => a + M.unitSheets(x.g).length, 0);
      prop.push({ h: 'Detention basins' });
      prop.push({ p: pl(ng, 'detention pond') + ' (' + pl(ns, 'sheet') + '). Each pond has a Layout, Cross Sections, and two Geometric Layout sheets.' });
    }
    const boxes = F.secsWith((g) => typeof M.isBoxSec === 'function' && M.isBoxSec(g) && M.unitSheets(g).length);
    if (boxes.length) {
      const ng = boxes.reduce((a, x) => a + M.unitGroups(x.g).length, 0), ns = boxes.reduce((a, x) => a + M.unitSheets(x.g).length, 0);
      prop.push({ h: 'Special junction boxes' });
      prop.push({ p: ng + ' special junction box' + (ng === 1 ? '' : 'es') + ', 3 sheets each (' + pl(ns, 'sheet') + ').' });
    }
    const other = [['dr-bd-welded', 'Bridge deck drainage'], ['dr-bd-det', 'Bridge deck drainage'], ['dr-bd-sum', 'Bridge deck drainage']];
    const og = new Map(); for (const [k, lab] of other) for (const x of F.secsWith((g) => g.key === k && g.sheets.length)) { if (!og.has(lab)) og.set(lab, new Set()); og.get(lab).add(x.g.title); }
    if (og.size) { prop.push({ h: 'Other drainage elements' }); prop.push({ ul: [...og.entries()].map(([lab, s]) => lab + ': ' + list([...s])) }); }
    out.proposed = prop;
    /* 7 */
    const sw = F.subs.flatMap((sub) => M.sectionsOf(sub, 'SWP3').filter((g) => g.sheets.length).map((g) => ({ sub, g })));
    out.swp3 = sw.length ? [{ p: 'SWP3 sheets are tracked for ' + list([...new Set(sw.map((x) => M.subLabel(x.sub)))]) + ': ' + list([...new Set(sw.map((x) => x.g.title))]) + ' (' + pl(sw.reduce((a, x) => a + x.g.sheets.length, 0), 'sheet') + ').' }] : null;
    /* 8 */
    const rows = M.orderedRows(st);
    out.sheets = rows.length ? [{ p: pl(rows.length, 'plan sheet') + ' are tracked (' + R.overall.done + ' done). Sheet numbers are as assigned in the tracker.' },
      { table: { head: ['No.', 'Sheet title', 'Sub-project', 'Section', 'Status'], rows: rows.map((x) => [String(x.sh.number || '—'), x.sh.title, x.sub.code, x.seg.title, x.sh.status]), cls: 'eidx' } }] : [{ p: 'No plan sheets are tracked yet.' }];
    /* 9 */
    const sch = [{ p: 'As of ' + today + ', the plan sheets are ' + Math.round(R.overall.pct) + '% complete (weighted by status): ' + R.overall.done + ' of ' + pl(R.overall.total, 'sheet') + ' done.' }];
    const ms = R.milestones.filter((x) => x.m.name);
    if (ms.length) sch.push({ table: { head: ['Milestone', 'Date', 'Sheets done'], rows: ms.map((x) => [x.m.name, x.m.date || '[date]', x.total ? x.done + ' of ' + x.total : '—']) } });
    sch.push({ p: 'TxDOT lists milestone submittals of Initial (30%), Detailed (60%), Final (90/95%), Sealed (100%) and Ready to Let (PS&E Preparation Manual, Table 6-1).' });
    out.schedule = sch;
    /* 10 */
    const open = R.overall.total - R.overall.done;
    out.concl = [{ p: open ? pl(open, 'plan sheet') + ' remain open' + (R.overdue.length ? ', ' + R.overdue.length + ' past their due date' : '') + '.' : R.overall.total ? 'All tracked plan sheets are done.' : '' }].filter((b) => b.p);
    return SECS.map(([id, title]) => ({ id, title, blocks: out[id], ph: PH[id], present: out[id] !== null }));
  }
  /* the report as printed: on sections only, numbered, engineer text added or replacing */
  function outline(st, today) {
    let n = 0;
    return build(st, today).map((s) => { const e = secState(st, s.id); return Object.assign(s, { on: e.on && s.present, text: e.text, mode: e.mode, hidden: !s.present }); })
      .filter((s) => s.on).map((s) => Object.assign(s, { no: ++n, auto: s.mode === 'replace' && s.text.trim() ? [] : s.blocks || [], showPh: !s.text.trim() && !!s.ph }));
  }
  function blockText(b, st) {
    if (b.p) return b.p;
    if (b.h) return b.h.toUpperCase();
    if (b.ul) return b.ul.map((x) => '  • ' + x).join('\n');
    if (b.refs) return refs(st).map((x, i) => '  ' + (i + 1) + '. ' + x).join('\n');
    if (b.table) return [b.table.head.join(' | ')].concat(b.table.rows.map((r) => r.join(' | '))).join('\n');
    return '';
  }
  function text(st, today) {
    today = today || M.todayISO();
    const m = meta(st), rm = M.reportMeta(st), L = [];
    const lab = (k, v) => v ? k + ': ' + v : '';
    L.push(...[(m.title || 'Drainage Design Report').toUpperCase(), st.project.name || '', lab('CSJ', m.csj), lab('Highway', m.highway), lab('Limits', m.limits), lab('County', m.county), lab('District', m.district),
      lab('Prepared for', rm.preparedFor), lab('Prepared by', rm.preparedBy), 'Date: ' + today].filter(Boolean), 'PRELIMINARY — NOT SEALED. For review only.', '');
    for (const s of outline(st, today)) {
      L.push(s.no + '. ' + s.title.toUpperCase());
      for (const b of s.auto) L.push(blockText(b, st));
      if (s.text.trim()) L.push(s.text.trim());
      else if (s.showPh) L.push(s.ph);
      L.push('');
    }
    return L.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').replace(/\n+$/, '') + '\n';
  }
  return { SECS, META, DEFAULT_REFS, PH, meta, secState, refs, refsText, setMeta, setSec, setRefs, resetRefs, build, outline, text };
});
