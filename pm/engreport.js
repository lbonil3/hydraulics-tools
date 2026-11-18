/* Project Tracker v3.27: Engineering Report (drainage design report style), derived from the tracker data.
   A carried sheet counts in every package that has it. Unique plan sheets are labeled separately.
   Sheets carried into a package are listed in the same section and group as the original.
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
    ['length', 'Road Length by Sub-project'],
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
  /* Official document pages only. A reference with no entry here stays plain text until someone types a URL. */
  const KNOWN_REFS = [
    ['TxDOT Hydraulic Design Manual (current edition)', 'https://www.txdot.gov/manuals/des/hyd/'],
    ['TxDOT PS&E Preparation Manual, Chapter 6, Section 2 — Engineering Reviews (Table 6-1 Milestone Submittals)', 'https://www.txdot.gov/manuals/des/pse/chapter-6--ps-e-submission--review-and-processing/section-2--engineering-reviews.html'],
    ['TxDOT Roadway Design Manual (current edition)', 'https://www.txdot.gov/manuals/des/rdw/index.html'],
    ['TxDOT Standard Specifications for Construction and Maintenance of Highways, Streets, and Bridges (edition adopted for the project)', 'https://www.txdot.gov/business/resources/txdot-specifications.html'],
    ['FHWA HEC-22, Urban Drainage Design Manual', 'https://www.fhwa.dot.gov/engineering/hydraulics/pubs/hif24006.pdf'],
    ['FHWA HDS-5, Hydraulic Design of Highway Culverts', 'https://www.fhwa.dot.gov/engineering/hydraulics/pubs/12026/hif12026.pdf'],
    ['NOAA Atlas 14, Volume 11 (Texas) precipitation-frequency estimates', 'https://hdsc.nws.noaa.gov/pfds/?bkmrk=tx'],
    ['TCEQ TPDES Construction General Permit TXR150000', 'https://www.tceq.texas.gov/permitting/stormwater/construction'],
  ];
  const DEFAULT_REFS = KNOWN_REFS.map((r) => r[0]);
  const MAXT = 20000;
  const PH = {
    length: '',
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
  const fmtMi = (ft) => { const mi = ft / 5280; return (Math.abs(mi) >= 10 ? mi.toFixed(1) : mi.toFixed(2)) + ' mi'; };
  const fmtPct = (ft, total) => { if (!(total > 0)) return '0%'; const p = ft / total * 100; return (Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1)) + '%'; };
  /* One palette for the report graphics. The same hex values are the CSS variables in style.css. */
  const BRAND = { navy: '#002856', blue: '#0085CA', light: '#E6E6E6', gray: '#999999', dark: '#666666', charcoal: '#333333', black: '#000000', white: '#ffffff' };
  /* Navy, process blue, dark gray, gray, then charcoal and light gray. White type only on the dark fills. */
  const PIE_COLORS = [
    { fill: BRAND.navy, ink: BRAND.white },
    { fill: BRAND.blue, ink: BRAND.white },
    { fill: BRAND.dark, ink: BRAND.white },
    { fill: BRAND.gray, ink: BRAND.charcoal },
    { fill: BRAND.charcoal, ink: BRAND.white },
    { fill: BRAND.light, ink: BRAND.charcoal, stroke: BRAND.charcoal },
  ];
  const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function asDay(iso) { return new Date(iso + 'T12:00:00'); }
  function plusDays(iso, n) { const d = asDay(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function dayDiff(a, b) { return Math.round((asDay(b) - asDay(a)) / 86400000); }
  function mondayOf(iso) { const d = asDay(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); }
  function monthStart(iso) { const d = asDay(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }
  function plusMonths(iso, n) { const d = asDay(iso); d.setMonth(d.getMonth() + n); return isoOf(d); }
  function shortDate(iso) { const d = asDay(iso); return MONS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function isISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  /* Plan and profile roads only. Trunk lines live on the Trunkline section and are not roads. */
  function reportRoadSec(sec) { return M.isPPSec(sec) && !M.isTrunkSec(sec); }
  /* Same station lengths as the roads table: each range is counted once. A range that is
     tracked in more than one sub-project is split evenly across those sub-projects. */
  function lengthSplit(st) {
    const subs = M.orderedSubs(st);
    const acc = new Map(subs.map((s) => [s.id, 0]));
    const seen = new Map();
    let split = false;
    for (const sub of subs) for (const d of M.DISCIPLINES) for (const sec of M.sectionsOf(sub, d)) {
      if (!reportRoadSec(sec)) continue;
      for (const g of M.roadGroups(sub, sec)) for (const e of g.entries) {
        const ft = M.segLength(e);
        if (!(ft > 0) || !M.hasSta(e)) continue;
        const key = g.slug + '\t' + M.parseStation(e.start) + '|' + M.parseStation(e.end);
        if (!seen.has(key)) seen.set(key, { ft, subs: [] });
        const rec = seen.get(key);
        if (!rec.subs.includes(sub.id)) rec.subs.push(sub.id);
      }
    }
    for (const rec of seen.values()) {
      if (rec.subs.length > 1) split = true;
      const share = rec.ft / rec.subs.length;
      for (const id of rec.subs) acc.set(id, (acc.get(id) || 0) + share);
    }
    const total = [...acc.values()].reduce((a, n) => a + n, 0);
    const rows = subs.map((s, i) => {
      const ft = acc.get(s.id) || 0;
      const c = PIE_COLORS[i % PIE_COLORS.length];
      return { code: s.code, label: M.subLabel(s), ft, miles: ft / 5280, pct: total > 0 ? ft / total : 0, color: c.fill, ink: c.ink, stroke: c.stroke || BRAND.white, ftText: fmtFt(ft), miText: fmtMi(ft), pctText: fmtPct(ft, total) };
    });
    return { rows, total, totalText: fmtFt(total), totalMi: fmtMi(total), totalPct: total > 0 ? '100%' : '0%', split };
  }
  const sta = (r) => M.hasSta(r) ? 'Sta ' + M.formatStation(r.start) + ' to ' + M.formatStation(r.end) : 'stations not yet set';
  /* One row per sub-project. The cell is only the package letter. A station range that is
     identical in more than one sub-project is listed under each, marked, and the length on
     the row is that sub-project's share. */
  function roadSheet(st) {
    const subs = M.orderedSubs(st);
    const order = new Map(subs.map((s, i) => [s.id, i]));
    const byRoad = new Map();
    for (const sub of subs) for (const d of M.DISCIPLINES) for (const sec of M.sectionsOf(sub, d)) {
      if (!reportRoadSec(sec)) continue;
      for (const g of M.roadGroups(sub, sec)) {
        if (!byRoad.has(g.slug)) byRoad.set(g.slug, { name: g.name, ranges: new Map(), subs: new Map() });
        const road = byRoad.get(g.slug);
        if (!road.subs.has(sub.id)) road.subs.set(sub.id, { sub, aligns: [] });
        const bucket = road.subs.get(sub.id);
        for (const e of g.entries) {
          const align = M.roadAlign(e);
          if (align && !bucket.aligns.includes(align)) bucket.aligns.push(align);
          const key = M.hasSta(e) ? M.parseStation(e.start) + '|' + M.parseStation(e.end) : 'open:' + (e.id || sec.id);
          if (!road.ranges.has(key)) road.ranges.set(key, { text: M.hasSta(e) ? M.formatStation(e.start) + ' to ' + M.formatStation(e.end) : 'stations not yet set', ft: M.segLength(e), subs: [] });
          const rec = road.ranges.get(key);
          if (!rec.subs.some((s) => s.id === sub.id)) rec.subs.push(sub);
        }
      }
    }
    let shared = false;
    const rows = [], bodies = [];
    for (const road of byRoad.values()) {
      const ids = [...road.subs.keys()].sort((a, b) => order.get(a) - order.get(b));
      const lines = ids.map((id) => {
        const bucket = road.subs.get(id);
        const ranges = [...road.ranges.values()].filter((rec) => rec.subs.some((s) => s.id === id));
        let ft = 0;
        const staLines = ranges.map((rec) => {
          const many = rec.subs.length > 1 && rec.ft > 0;
          if (many) shared = true;
          ft += many ? rec.ft / rec.subs.length : rec.ft;
          return rec.text + (many ? ' †' : '');
        });
        return { aligns: bucket.aligns.join('\n') || '—', sta: staLines.join('\n') || '—', ft, label: bucket.sub.code };
      });
      const n = lines.length;
      const body = lines.map((line, i) => {
        const cells = [i === 0 ? road.name : '', line.aligns, line.sta, line.ft ? fmtFt(line.ft) : '—', line.label];
        if (n === 1) return cells;
        const row = { cells, cls: i === 0 ? 'rmid' : (i === n - 1 ? 'rcont rlast' : 'rcont') };
        if (i === 0) row.span = { 0: n };
        else row.skip = [0];
        return row;
      });
      bodies.push(body);
      rows.push(...body);
    }
    return { rows, bodies, note: shared ? '† This station range is tracked in more than one sub-project, so it is listed under each. The length on the row is that sub-project’s share. The range is counted once, the same way as the road-length chart.' : '' };
  }
  /* ---- stored edits (tolerant reads; writes keep the data small) ---- */
  function data(st) { const e = st.engReport; return e && typeof e === 'object' && !Array.isArray(e) ? e : {}; }
  function meta(st) { const m = data(st).meta || {}; return Object.fromEntries(META.map(([k]) => [k, typeof m[k] === 'string' ? m[k] : ''])); }
  function secState(st, id) { const s = (data(st).secs || {})[id] || {}; return { on: s.on !== false, text: typeof s.text === 'string' ? s.text : '', mode: s.mode === 'replace' ? 'replace' : 'add' }; }
  function refs(st) { const r = data(st).refs; return typeof r === 'string' ? r.split('\n').map((x) => x.trim()).filter(Boolean) : DEFAULT_REFS.slice(); }
  function refsText(st) { return refs(st).join('\n'); }
  function safeRefUrl(u) {
    const s = String(u || '').trim();
    if (!/^https?:\/\/\S+$/i.test(s)) return '';
    try { const url = new URL(s); return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : ''; } catch (e) { return ''; }
  }
  function knownRefUrl(text) { const hit = KNOWN_REFS.find((r) => r[0] === text); return hit ? hit[1] : ''; }
  function parseRefLine(line) {
    let text = String(line || '').trim(), url = '';
    const split = text.match(/^(.*?)\s+\|\s+(https?:\/\/\S+)$/i) || text.match(/^(.*?)\s*:\s*(https?:\/\/\S+)$/i);
    if (split && split[1].trim()) { text = split[1].trim(); url = safeRefUrl(split[2]); }
    if (!url) url = knownRefUrl(text);
    return { text, url };
  }
  function refItems(st) { return refs(st).map(parseRefLine).filter((r) => r.text); }
  function serializeRefs(items) {
    return (items || []).map((it) => {
      const text = String(it.text || '').replace(/\s+/g, ' ').trim();
      const url = safeRefUrl(it.url);
      if (!text) return '';
      if (url && url !== knownRefUrl(text)) return text + ' | ' + url;
      return text;
    }).filter(Boolean).join('\n');
  }
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
  function setRefs(st, text) {
    const e = ensure(st);
    const t = String(text == null ? '' : text).replace(/\r\n?/g, '\n').slice(0, MAXT);
    const canon = serializeRefs(DEFAULT_REFS.map(parseRefLine));
    if (t.trim() === DEFAULT_REFS.join('\n') || t.trim() === canon.trim()) delete e.refs;
    else e.refs = t;
    tidy(st);
  }
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
  const carryOn = (sh) => typeof M.isCarryOn === 'function' && M.isCarryOn(sh);
  function pkgCode(sub) { return sub.code + (M.subCustom(sub) ? ' (' + M.subName(sub) + ')' : ''); }
  function carryCell(st, sheets) {
    const cs = (sheets || []).filter(carryOn);
    if (!cs.length) return '—';
    const by = new Map();
    for (const sh of cs) {
      const o = typeof M.carryOrigin === 'function' ? M.carryOrigin(st, sh) : null;
      const code = o && o.sub ? o.sub.code : '?';
      by.set(code, (by.get(code) || 0) + 1);
    }
    return [...by.entries()].map(([c, n]) => n + ' from ' + c).join('; ');
  }
  function pondSheetList(sec, g) {
    const slots = M.unitSlots(sec);
    return g.sheets.map((sh) => {
      if (!sh.unit) return sh.title;
      const slot = slots.find((s) => s.slot === sh.unit.slot);
      const label = slot ? slot.label : sh.title;
      return sh.unit.title && sh.title !== sh.unit.title ? label + ' (' + sh.title + ')' : label;
    }).join(', ');
  }
  function stdIdentity(title, disc) {
    const t = String(title || '').trim();
    const list = (M.STANDARD_SHEETS || []).filter((s) => s.discipline === disc);
    const pair = /^(.*)\s+\((\d+)\s+of\s+(\d+)\)$/i.exec(t);
    const base = pair ? pair[1].trim() : t;
    const known = list.find((s) => s.name.toLowerCase() === base.toLowerCase());
    if (known) return { name: known.name, known: true };
    if (pair && Number(pair[3]) > 1) return { name: base, known: false };
    return { name: t, known: false };
  }
  function standardGroups(st) {
    const groups = [];
    for (const r of M.allSheets(st)) {
      if (!M.isStdSec(r.seg)) continue;
      const disc = r.seg.discipline === 'SWP3' ? 'SWP3' : 'Drainage';
      const info = stdIdentity(r.sh.title, disc);
      let g = groups.find((x) => x.disc === disc && x.name.toLowerCase() === info.name.toLowerCase());
      if (!g) { g = { name: info.name, disc, known: info.known, n: 0, subs: new Set(), carried: new Set() }; groups.push(g); }
      g.n++; g.subs.add(r.sub.code);
      if (carryOn(r.sh)) g.carried.add(r.sub.code);
      else if (typeof M.carriersOf === 'function') for (const c of M.carriersOf(st, r.sh.id)) g.carried.add(c.sub.code);
    }
    return groups;
  }
  function standardTable(groups, disc) {
    const list = (M.STANDARD_SHEETS || []).filter((s) => s.discipline === disc);
    const rows = [], used = new Set();
    for (const s of list) {
      const g = groups.find((x) => x.disc === disc && x.name.toLowerCase() === s.name.toLowerCase());
      if (!g) continue;
      rows.push(g); used.add(g);
    }
    for (const g of groups.filter((x) => x.disc === disc && !used.has(x)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))) rows.push(g);
    if (!rows.length) return null;
    const data = rows.map((g) => {
      let who = [...g.subs].sort().join(', ');
      const carried = [...g.carried].sort();
      if (carried.length) who += ' (carried on by ' + carried.join(', ') + ')';
      return [g.name, String(g.n), who || '—', g.known ? 'Pick list' : 'Custom'];
    });
    const built = data.length > 1 ? { rows: data.concat([['Total', String(rows.reduce((a, g) => a + g.n, 0)), '', '']]), kinds: data.map(() => '').concat(['total']) } : { rows: data, kinds: data.map(() => '') };
    return { table: { head: ['Standard', 'Sheets', 'Sub-projects', 'Source'], rows: built.rows, kinds: built.kinds, cls: disc === 'SWP3' ? 'std-sw' : 'std-dr' } };
  }
  /* Milestones only. Each dated milestone falls in one month column, or one week column when the
     whole span is about twelve weeks or less. A blank date stays on the row as TBD. */
  function scheduleChart(today, milestones) {
    const dated = milestones.map((x) => isISO(x.m.date) ? x.m.date : null).filter(Boolean).sort();
    let unit = 'none', axisStart = null, axisEnd = null;
    const ticks = [];
    if (dated.length) {
      const lo = dated[0], hi = dated[dated.length - 1];
      if (dayDiff(lo, hi) <= 84) {
        unit = 'week';
        axisStart = mondayOf(lo);
        axisEnd = plusDays(mondayOf(hi), 7);
        for (let t = axisStart; t < axisEnd; t = plusDays(t, 7)) {
          const d = asDay(t);
          ticks.push({ t, end: plusDays(t, 7), mon: MONS[d.getMonth()], day: d.getDate(), year: d.getFullYear() });
        }
      } else {
        unit = 'month';
        axisStart = monthStart(lo);
        axisEnd = plusMonths(monthStart(hi), 1);
        for (let t = axisStart; t < axisEnd; t = plusMonths(t, 1)) {
          const d = asDay(t);
          ticks.push({ t, end: plusMonths(t, 1), mon: MONS[d.getMonth()], day: null, year: d.getFullYear() });
        }
      }
      let prev = null;
      for (const tk of ticks) { tk.showYear = prev !== tk.year; prev = tk.year; }
    }
    const place = (iso) => {
      const i = ticks.findIndex((tk) => iso >= tk.t && iso < tk.end);
      if (i < 0) return { col: -1, frac: 0 };
      const days = Math.max(1, dayDiff(ticks[i].t, ticks[i].end));
      const off = Math.min(days - 1, Math.max(0, dayDiff(ticks[i].t, iso)));
      return { col: i, frac: (off + 0.5) / days };
    };
    const rows = milestones.map((x) => {
      const date = isISO(x.m.date) ? x.m.date : null;
      const pos = date ? place(date) : { col: -1, frac: 0 };
      return { kind: 'milestone', label: x.m.name, date, dateText: date ? shortDate(date) : 'TBD', tbd: !date, done: x.total ? x.done + ' of ' + x.total : '—', col: pos.col, frac: pos.frac };
    });
    const todayIn = !!(axisStart && today >= axisStart && today < axisEnd);
    const here = todayIn ? place(today) : { col: -1, frac: 0 };
    return { unit, start: axisStart, end: axisEnd, today, todayIn, todayCol: here.col, todayFrac: here.frac, ticks, rows };
  }
  /* ---- the sections: blocks = [{ p } | { ul } | { table:{ head, rows } }]; ph = the placeholder shown when the engineer adds nothing ---- */
  function build(st, today) {
    today = today || M.todayISO();
    const F = facts(st), R = M.report(st, today), rm = M.reportMeta(st), m = meta(st);
    const pname = st.project.name || 'the project';
    const ownCount = (g) => g.sheets.length;
    const out = {};
    const subNames = F.subs.map((s) => M.subLabel(s));
    const nSheets = F.all.length;
    /* 1 road length, then the narrative */
    const split = lengthSplit(st);
    const lengthNote = split.split ? 'Where the same station range is tracked in more than one sub-project, that length is counted once, as in the roads table, and split evenly across those sub-projects.' : '';
    out.length = split.total > 0
      ? [{ p: 'Road length is the station length tracked on plan and profile roads, not trunk lines. It matches the roads table in Project Description and Location.' }, { pie: split }, lengthNote ? { p: lengthNote } : null].filter(Boolean)
      : [{ p: 'No roadway length is tracked yet. Add stations to a plan and profile road and the chart will split that length by sub-project.' }, { pie: split }];
    /* 2 */
    out.intro = [{ p: 'This report documents the drainage design for ' + pname + (m.csj ? ' (CSJ ' + m.csj + ')' : '') + (m.highway ? ' on ' + m.highway : '') + (m.county ? ' in ' + m.county + ' County' : '') + (m.district ? ', TxDOT ' + m.district + ' District' : '') + '.' +
      (rm.preparedFor ? ' It is prepared for ' + rm.preparedFor + (rm.preparedBy ? ' by ' + rm.preparedBy : '') + '.' : rm.preparedBy ? ' It is prepared by ' + rm.preparedBy + '.' : '') },
      { p: 'It describes the project, the scope of the drainage' + (F.all.some((r) => r.seg.discipline === 'SWP3') ? ' and storm water pollution prevention (SWP3)' : '') + ' work, the design criteria and references, existing conditions and the proposed drainage improvements, and lists the plan sheets and schedule as tracked on ' + today + '.' }];
    /* 2 */
    const desc = [];
    if (m.limits) desc.push({ p: 'Project limits: ' + m.limits + '.' });
    desc.push({ p: 'The project is organized into ' + pl(F.subs.length, 'sub-project') + ': ' + list(subNames) + '.' });
    const sheet = roadSheet(st);
    if (sheet.rows.length) {
      desc.push({ p: 'Roadway drainage work is tracked on ' + pl(sheet.bodies.length, 'road') + ':' });
      desc.push({ table: { cls: 'roads', cols: [
        { w: '20%', cls: 'c-road' },
        { w: '24%', stack: true, cls: 'c-align' },
        { w: '26%', stack: true, cls: 'c-sta' },
        { w: '14%', align: 'right', cls: 'c-len' },
        { w: '16%', align: 'center', cls: 'c-sp' },
      ], head: ['Road', 'Alignment', 'Stations', 'Length', 'Sub-project'], rows: sheet.rows, bodies: sheet.bodies, note: sheet.note } });
    } else desc.push({ p: 'No road entries are tracked yet.' });
    out.desc = desc;
    /* 3 */
    const scope = [];
    for (const d of M.DISCIPLINES) {
      const rows = F.subs.flatMap((sub) => M.sectionsOf(sub, d).map((g) => ({ sub, g }))).filter((x) => ownCount(x.g));
      if (!rows.length) continue;
      const bySec = new Map(); for (const x of rows) { const k = x.g.title; bySec.set(k, (bySec.get(k) || 0) + ownCount(x.g)); }
      const n = rows.reduce((a, x) => a + ownCount(x.g), 0);
      scope.push({ p: (d === 'SWP3' ? 'SWP3' : 'Drainage') + ' scope: ' + pl(n, 'plan sheet') + ' in ' + pl(bySec.size, 'section') + ':' });
      scope.push({ ul: [...bySec.entries()].map(([k, v]) => k + ' — ' + pl(v, 'sheet')) });
    }
    const pkgRows = [], pkgKinds = [];
    const pushPkg = (row, kind) => { pkgRows.push(row); pkgKinds.push(kind); };
    const detail = [];
    let grandS = 0, grandC = 0;
    for (const sub of F.subs) {
      let ps = 0, pc = 0;
      for (const d of M.DISCIPLINES) for (const g of M.sectionsOf(sub, d)) {
        const leaves = [];
        for (const b of M.packageBuckets(st, sub, g)) {
          const c = b.sheets.filter(carryOn).length;
          if (!b.sheets.length) continue;
          leaves.push({ sheets: b.sheets.length, carry: c });
          pushPkg([pkgCode(sub), d, g.title, b.name, String(b.sheets.length), String(c)], '');
          detail.push({ pkg: sub.code, sec: g.title, sheets: b.sheets.length, carry: c });
        }
        if (leaves.length > 1) pushPkg([pkgCode(sub), d, g.title, 'Section subtotal', String(leaves.reduce((a, x) => a + x.sheets, 0)), String(leaves.reduce((a, x) => a + x.carry, 0))], 'sub');
        ps += leaves.reduce((a, x) => a + x.sheets, 0); pc += leaves.reduce((a, x) => a + x.carry, 0);
      }
      if (ps || pc) pushPkg([pkgCode(sub), '', 'All sections', '', String(ps), String(pc)], 'pkg');
      grandS += ps; grandC += pc;
    }
    const bySec = new Map();
    for (const x of detail) { if (!bySec.has(x.sec)) bySec.set(x.sec, []); bySec.get(x.sec).push(x); }
    for (const [sec, xs] of bySec) {
      const pkgs = new Set(xs.map((x) => x.pkg));
      if (pkgs.size < 2) continue;
      pushPkg(['', '', sec, 'All packages', String(xs.reduce((a, x) => a + x.sheets, 0)), String(xs.reduce((a, x) => a + x.carry, 0))], 'sec');
    }
    if (pkgRows.length) pushPkg(['Total', '', '', '', String(grandS), String(grandC)], 'total');
    if (!scope.length && !pkgRows.length) scope.push({ p: 'No plan sheets are tracked yet.' });
    if (pkgRows.length) {
      const uniqN = M.allSheets(st).filter((r) => !carryOn(r.sh)).length;
      scope.push({ h: 'Sheets by package' });
      scope.push({ p: 'Sheet counts include every sheet in that package, including sheets carried on from an earlier package. The Carry-on sheets column is how many of those are carried on. The total row adds the packages, so a carried sheet is counted in each package that has it. Unique plan sheets, counted once, are ' + uniqN + '.' });
      scope.push({ table: { head: ['Package', 'Discipline', 'Section', 'Group', 'Sheets', 'Carry-on sheets'], rows: pkgRows, kinds: pkgKinds, cls: 'pkgs' } });
    }
    if (R.pp && R.pp.total) scope.push({ p: 'Plan and profile sheets are counted from the road stations and plan scale: ' + R.pp.total + ' in total (Drainage ' + R.pp.byDisc.Drainage + ', SWP3 ' + R.pp.byDisc.SWP3 + ').' });
    out.scope = scope;
    /* 4 */
    out.criteria = [{ p: 'The design follows the references listed below. Editions and applicability are to be confirmed by the engineer of record.' }, { refs: true }];
    /* 5 */
    out.existing = F.roads.length ? [{ p: 'The project area includes ' + list(F.roads.map((r) => r.name + (r.aligns.length ? ' (' + r.aligns.join(', ') + ')' : ''))) + '.' }] : [];
    /* 6 */
    const prop = [];
    const ppSecs = F.secsWith((g) => M.isPPSec(g) && g.discipline === 'Drainage');
    const ppRows = ppSecs.flatMap(({ sub, g }) => M.viewRoadGroups(st, sub, g).filter((rg) => rg.sheets.length || (rg.entries && rg.entries.length)).map((rg) => ({ sub, g, rg, n: rg.sheets.length })));
    if (ppRows.length) {
      prop.push({ h: 'Storm sewer and roadway drainage (plan and profile)' });
      prop.push({ p: 'Drainage plan and profile sheets are being prepared for:' });
      prop.push({ ul: ppRows.map((x) => M.subTag(x.sub) + ' · ' + x.g.title + ' — ' + x.rg.name + (M.groupAligns(x.rg.entries).length ? ' (' + M.groupAligns(x.rg.entries).join(', ') + ')' : '') + ', ' + (x.rg.entries.length ? x.rg.entries.map(sta).join('; ') : 'carried on') + ' — ' + pl(x.n, 'sheet')) });
    }
    const hds = F.secsWith((g) => isHds(g) && ownCount(g));
    if (hds.length) {
      prop.push({ h: 'Hydraulic computations (hydraulic data sheets)' });
      const by = new Map(); for (const x of hds) by.set(x.g.title, (by.get(x.g.title) || 0) + ownCount(x.g));
      prop.push({ p: 'Hydraulic computations are documented on hydraulic data sheets: ' + list([...by.entries()].map(([k, v]) => pl(v, 'sheet') + ' of ' + k.replace(/^Hydraulic Data Sheet\s*-\s*/i, ''))) + '.' });
      const cross = hds.filter((x) => /crossing|culvert/i.test(x.g.title)).flatMap((x) => x.g.sheets.filter((s) => s.road || !/^hydraulic data sheet/i.test(s.title)).map((s) => M.subTag(x.sub) + ' · ' + s.title + (s.road ? ' (' + s.road + ')' : '')));
      if (cross.length) prop.push({ p: 'Crossings tracked:' }, { ul: cross });
    }
    const dams = F.subs.map((sub) => ({ sub, g: M.damSection(sub) })).filter((x) => x.g && ownCount(x.g));
    const odam = F.secsWith((g) => g.key === 'dr-odam' && ownCount(g));
    if (dams.length || odam.length) {
      prop.push({ h: 'Drainage area maps' });
      prop.push({ p: (odam.length ? pl(odam.reduce((a, x) => a + ownCount(x.g), 0), 'overall drainage area map') + ' and ' : '') + pl(dams.reduce((a, x) => a + ownCount(x.g), 0), 'drainage area map sheet') + ' are tracked' + (dams.some((x) => (M.damBranches ? M.damBranches(x.g) : []).length) ? ', following the plan and profile sheet breaks of ' + list([...new Set(dams.flatMap((x) => (M.damBranches ? M.damBranches(x.g) : []).map((b) => b.road)))]) : '') + '.' });
    }
    const lats = F.secsWith((g) => typeof M.isLatSec === 'function' && M.isLatSec(g) && ownCount(g));
    if (lats.length) {
      prop.push({ h: 'Drainage laterals' });
      prop.push({ p: 'Drainage laterals are double-banked profile sheets. ' + pl(lats.reduce((a, x) => a + ownCount(x.g), 0), 'sheet') + ' are tracked, counted by how many sheets are needed rather than by road.' });
      const latRows = lats.map((x) => [M.subTag(x.sub), String(ownCount(x.g))]);
      const latBuilt = latRows.length > 1 ? { rows: latRows.concat([['Total', String(latRows.reduce((a, r) => a + Number(r[1]), 0))]]), kinds: latRows.map(() => '').concat(['total']) } : { rows: latRows, kinds: latRows.map(() => '') };
      prop.push({ table: { head: ['Sub-project', 'Sheets'], rows: latBuilt.rows, kinds: latBuilt.kinds, cls: 'lats' } });
    }
    const ponds = F.secsWith((g) => typeof M.isPondSec === 'function' && M.isPondSec(g) && M.viewUnitGroups(st, g).some((x) => x.sheets.length));
    if (ponds.length) {
      const views = ponds.map((x) => ({ sub: x.sub, g: x.g, groups: M.viewUnitGroups(st, x.g).filter((gg) => gg.sheets.length) }));
      const ng = views.reduce((a, x) => a + x.groups.length, 0), ns = views.reduce((a, x) => a + x.groups.reduce((b, gg) => b + gg.sheets.length, 0), 0);
      prop.push({ h: 'Detention basins' });
      prop.push({ p: pl(ng, 'detention pond') + ' (' + pl(ns, 'sheet') + '). Each pond has a Layout, Cross Sections, and two Geometric Layout sheets.' });
      const pondRows = [], pondKinds = [];
      for (const x of views) {
        for (const gg of x.groups) { pondRows.push([M.subTag(x.sub), gg.name, pondSheetList(x.g, gg), String(gg.sheets.length)]); pondKinds.push(''); }
        if (x.groups.length > 1) { pondRows.push([M.subTag(x.sub), 'Subtotal', '', String(x.groups.reduce((a, gg) => a + gg.sheets.length, 0))]); pondKinds.push('sub'); }
      }
      const pondData = pondRows.filter((_, i) => !pondKinds[i]);
      if (pondData.length > 1) { pondRows.push(['Total', '', '', String(pondData.reduce((a, r) => a + Number(r[3]), 0))]); pondKinds.push('total'); }
      prop.push({ table: { head: ['Sub-project', 'Pond', 'Sheets', 'Count'], rows: pondRows, kinds: pondKinds, cls: 'ponds' } });
    }
    const boxes = F.secsWith((g) => typeof M.isBoxSec === 'function' && M.isBoxSec(g) && M.viewUnitGroups(st, g).some((x) => x.sheets.length));
    if (boxes.length) {
      const views = boxes.map((x) => ({ sub: x.sub, groups: M.viewUnitGroups(st, x.g).filter((gg) => gg.sheets.length) }));
      const ng = views.reduce((a, x) => a + x.groups.length, 0), ns = views.reduce((a, x) => a + x.groups.reduce((b, gg) => b + gg.sheets.length, 0), 0);
      prop.push({ h: 'Special junction boxes' });
      prop.push({ p: ng + ' special junction box' + (ng === 1 ? '' : 'es') + ', 3 sheets each (' + pl(ns, 'sheet') + ').' });
      const boxRows = [], boxKinds = [];
      for (const x of views) {
        for (const gg of x.groups) { boxRows.push([M.subTag(x.sub), gg.name, String(gg.sheets.length)]); boxKinds.push(''); }
        if (x.groups.length > 1) { boxRows.push([M.subTag(x.sub), 'Subtotal', String(x.groups.reduce((a, gg) => a + gg.sheets.length, 0))]); boxKinds.push('sub'); }
      }
      const boxData = boxRows.filter((_, i) => !boxKinds[i]);
      if (boxData.length > 1) { boxRows.push(['Total', '', String(boxData.reduce((a, r) => a + Number(r[2]), 0))]); boxKinds.push('total'); }
      prop.push({ table: { head: ['Sub-project', 'Box', 'Sheets'], rows: boxRows, kinds: boxKinds, cls: 'boxes' } });
    }
    const deck = [['dr-bd-welded', 'Bridge deck drawing details (welded)'], ['dr-bd-det', 'Bridge deck drain details'], ['dr-bd-sum', 'Bridge deck drain summary']];
    const deckRows = [], deckKinds = [];
    for (const [k, lab] of deck) {
      const hits = F.secsWith((g) => g.key === k && ownCount(g));
      if (!hits.length) continue;
      for (const x of hits) { deckRows.push([M.subTag(x.sub), lab, String(ownCount(x.g))]); deckKinds.push(''); }
      if (hits.length > 1) { deckRows.push(['', lab + ' subtotal', String(hits.reduce((a, x) => a + ownCount(x.g), 0))]); deckKinds.push('sub'); }
    }
    if (deckRows.length) {
      const deckData = deckRows.filter((_, i) => !deckKinds[i]);
      if (deckData.length > 1) { deckRows.push(['Total', '', String(deckData.reduce((a, r) => a + Number(r[2]), 0))]); deckKinds.push('total'); }
      prop.push({ h: 'Bridge deck drainage' });
      prop.push({ table: { head: ['Sub-project', 'Item', 'Sheets'], rows: deckRows, kinds: deckKinds, cls: 'deck' } });
    }
    out.proposed = prop;
    /* 7 */
    const sw = F.subs.flatMap((sub) => M.sectionsOf(sub, 'SWP3').filter((g) => ownCount(g)).map((g) => ({ sub, g })));
    out.swp3 = sw.length ? [{ p: 'SWP3 sheets are tracked for ' + list([...new Set(sw.map((x) => M.subLabel(x.sub)))]) + ': ' + list([...new Set(sw.map((x) => x.g.title))]) + ' (' + pl(sw.reduce((a, x) => a + ownCount(x.g), 0), 'sheet') + ').' }] : null;
    /* 8 */
    const rows = M.orderedRows(st);
    const stdGroups = standardGroups(st);
    const sheetBlocks = [];
    if (rows.length) sheetBlocks.push({ p: pl(rows.length, 'plan sheet') + ' are tracked (' + R.overall.done + ' done). Sheet numbers are as assigned in the tracker.' });
    for (const [disc, title] of [['Drainage', 'Drainage standards'], ['SWP3', 'SWP3 standards']]) {
      const tab = standardTable(stdGroups, disc);
      if (tab) sheetBlocks.push({ h: title }, tab);
    }
    if (rows.length) sheetBlocks.push({ table: { head: ['No.', 'Sheet title', 'Sub-project', 'Section', 'Status'], rows: rows.map((x) => {
      const from = carryOn(x.sh) && M.carryOrigin(st, x.sh);
      const by = !from && typeof M.carriersOf === 'function' ? M.carriersOf(st, x.sh.id) : [];
      const title = x.sh.title + (from ? ' (carried from ' + from.sub.code + ')' : '') + (by.length ? ' (carried on by ' + by.map((c) => c.sub.code).join(', ') + ')' : '');
      return [M.sheetNumberText(st, x.sh) || '—', title, x.sub.code, x.seg.title, x.sh.status];
    }), cls: 'eidx' } });
    out.sheets = sheetBlocks.length ? sheetBlocks : [{ p: 'No plan sheets are tracked yet.' }];
    /* 9 */
    const sch = [{ p: 'As of ' + today + ', the plan sheets are ' + Math.round(R.overall.pct) + '% complete (weighted by status): ' + R.overall.done + ' of ' + pl(R.overall.total, 'sheet') + ' done.' }];
    const ms = R.milestones.filter((x) => x.m.name);
    const gantt = scheduleChart(today, ms);
    if (gantt.rows.length) sch.push({ gantt });
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
    if (b.refs) return refItems(st).map((r, i) => '  ' + (i + 1) + '. ' + r.text + (r.url ? ' ' + r.url : '')).join('\n');
    if (b.table) return [b.table.head.join(' | ')].concat(b.table.rows.map((r) => { const cells = Array.isArray(r) ? r : r.cells; const skip = new Set((r && r.skip) || []); return cells.filter((c, i) => !skip.has(i)).join(' | '); })).join('\n') + (b.table.note ? '\n' + b.table.note : '');
    if (b.pie) {
      const L = b.pie.rows.map((r) => r.label + ' | ' + r.ftText + ' | ' + r.miText + ' | ' + r.pctText);
      L.push('Total | ' + b.pie.totalText + ' | ' + b.pie.totalMi + ' | ' + b.pie.totalPct);
      return L.join('\n');
    }
    if (b.gantt) return b.gantt.rows.map((r) => r.label + ' — ' + (r.tbd ? 'TBD' : r.date) + ' — ' + r.done).join('\n');
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
  return { SECS, META, DEFAULT_REFS, KNOWN_REFS, PH, meta, secState, refs, refsText, refItems, serializeRefs, setMeta, setSec, setRefs, resetRefs, build, outline, text };
});
