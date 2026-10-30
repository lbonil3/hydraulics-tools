/* PM data model v3: pure functions, no DOM, no storage.
   v3 structure: Project → discipline (Drainage | SWP3) → sub-project (A–D) → section → sheets.
   In code a section lives in sub.segments (kind 'section', it holds the sheets). Roads are data: sub.roads[]
   entries (road name + stations + scale) that belong to a Plan & Profile section and drive its PP sheet count. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SCHEMA = 3;
  const STATUSES = ['Not started', 'In progress', 'In review', 'Done'];
  const WEIGHT = { 'Not started': 0, 'In progress': 0.4, 'In review': 0.8, 'Done': 1 };
  const DISCIPLINES = ['Drainage', 'SWP3'];
  const DEFAULT_SCALES = [{ scale: 20, ft: 240 }, { scale: 40, ft: 480 }, { scale: 50, ft: 600 }, { scale: 100, ft: 1200 }];
  const DEFAULT_QC = ['Design check', 'Drafting check', 'QC review', 'Back-check'];
  /* v3 sections (Luis's list, in his order). series = PP series id: the section holds road entries and generated PP sheets. */
  const DEFAULT_SECTIONS = [
    ['dr-odam', 'Overall Drainage Area Map', 'Drainage'],
    ['dr-dam', 'Drainage Area Map', 'Drainage'],
    ['dr-hds-runoff', 'Hydraulic Data Sheet - Runoff Computations', 'Drainage'],
    ['dr-hds-inlet', 'Hydraulic Data Sheet - Inlet Computations', 'Drainage'],
    ['dr-hds-ss', 'Hydraulic Data Sheet - Storm Sewer Computations', 'Drainage'],
    ['dr-hds-x', 'Hydraulic Data Sheet - Crossing', 'Drainage'],
    ['dr-pp', 'Drainage Plan & Profile', 'Drainage', 'pp-drain'],
    ['dr-trunk', 'Trunkline Plan & Profile', 'Drainage', 'pp-storm'],
    ['dr-lat', 'Drainage Laterals', 'Drainage', 'pp-lat'],
    ['dr-det', 'Detention Basin Layout', 'Drainage'],
    ['dr-det-xs', 'Detention Basin Cross Section', 'Drainage'],
    ['dr-jb', 'Special Junction Box Details', 'Drainage'],
    ['dr-bd-welded', 'Bridge Deck Drawing Details (Welded)', 'Drainage'],
    ['dr-bd-det', 'Bridge Deck Drain Details', 'Drainage'],
    ['dr-bd-sum', 'Bridge Deck Drain Summary', 'Drainage'],
    ['dr-std', 'Standards', 'Drainage'],
    ['sw-layout', 'SWP3 Layout', 'SWP3', 'pp-swp3'],
    ['sw-sum', 'SWP3 Summary & Notes', 'SWP3'],
    ['sw-std', 'SWP3 Standard Details', 'SWP3'],
    ['sw-other', 'Other SWP3', 'SWP3'],
  ];
  const OTHER = { Drainage: ['dr-other', 'Other Drainage'], SWP3: ['sw-other', 'Other SWP3'] };
  /* v2 PP series → v3 section */
  const SERIES_SEC = { 'pp-drain': 'dr-pp', 'pp-storm': 'dr-trunk', 'pp-lat': 'dr-lat', 'pp-swp3': 'sw-layout' };
  /* v2.6 sheet-number ranges: key = series:<id> | tpl:<title lowercase> | disc:<discipline> (fallback) */
  const DEFAULT_NUMBERING = [
    { key: 'tpl:drainage area map', label: 'Drainage Area Map', from: 1, to: 9 },
    { key: 'series:pp-drain', label: 'Drainage Plan & Profile', from: 10, to: 49 },
    { key: 'series:pp-storm', label: 'Trunkline Plan & Profile', from: 50, to: 69 },
    { key: 'disc:Drainage', label: 'Other Drainage sheets', from: 70, to: 99 },
    { key: 'series:pp-swp3', label: 'SWP3 Layout', from: 100, to: 129 },
    { key: 'disc:SWP3', label: 'Other SWP3 sheets', from: 130, to: 149 },
  ];
  /* v2 series list: kept only to read v2 data (enabled series decided which PP were counted) */
  const DEFAULT_SERIES = [
    { id: 'pp-drain', name: 'Drainage Plan & Profile', discipline: 'Drainage', enabled: true, scale: null },
    { id: 'pp-storm', name: 'Storm Sewer Plan & Profile', discipline: 'Drainage', enabled: false, scale: null },
    { id: 'pp-swp3', name: 'SWP3 Layout (Erosion & Sediment Control)', discipline: 'SWP3', enabled: true, scale: null },
  ];
  const DEFAULT_MILESTONES = ['30% submittal', '60% submittal', '90% submittal', 'Final PS&E'];
  let seq = 0;
  function uid() {
    seq = (seq + 1) % 1e6;
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + seq.toString(36);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function defaultSectionDefs() { return DEFAULT_SECTIONS.map(([key, title, discipline, series]) => ({ key, title, discipline, series: series || null })); }
  /* standard (non-PP) sheet set: one sheet per non-PP section, titled like the section (Other… sections excluded) */
  function defaultTemplates(defs) { return (defs || defaultSectionDefs()).filter((d) => !d.series && !/^other /i.test(d.title)).map((d) => ({ id: uid(), title: d.title, discipline: d.discipline, sec: d.key })); }
  function newSection(d) { return { id: uid(), kind: 'section', key: d.key, title: d.title, name: d.title, discipline: d.discipline, series: d.series || null, notes: '', revs: [], sheets: [] }; }
  function newState(projectName) {
    const defs = defaultSectionDefs();
    return {
      schema: SCHEMA, v32: { at: null, fresh: true },
      project: { name: projectName || 'PSE Drainage & SWP3 Project' },
      subs: ['A', 'B', 'C', 'D'].map((code, i) => ({ id: uid(), code, name: 'Sub-project ' + code, order: i + 1, scale: 100, templates: defaultTemplates(defs), segments: defs.map(newSection), roads: [] })),
      staff: [],
      index: defaultTemplates(defs),
      reportNotes: {}, settings: { scales: clone(DEFAULT_SCALES), overlapFt: 0, qcSteps: DEFAULT_QC.slice(), sections: defs, numbering: clone(DEFAULT_NUMBERING) },
      milestones: DEFAULT_MILESTONES.map((name) => ({ id: uid(), name, date: '' })),
      links: [],
      views: [],
      log: [],
      lastBackup: null,
      created: new Date().toISOString(),
    };
  }
  /* ---- stations (feet; 10+00 = 1000 ft) ---- */
  function parseStation(s) {
    if (typeof s === 'number') return Number.isFinite(s) && s >= 0 ? s : NaN;
    const t = String(s == null ? '' : s).trim().replace(/^sta\.?\s*/i, '').replace(/,/g, '');
    if (/^\d+(?:\.\d+)?$/.test(t)) return parseFloat(t); /* plain feet: 1000 → 10+00 */
    const m = t.match(/^(\d+)\s*\+\s*(\d{2}(?:\.\d+)?)$/);
    if (!m) return NaN;
    const ft = parseFloat(m[2]);
    if (ft >= 100) return NaN;
    return parseInt(m[1], 10) * 100 + ft;
  }
  function formatStation(v) {
    if (!Number.isFinite(v) || v < 0) return '';
    const r = Math.round(v * 100) / 100;
    let hund = Math.floor(r / 100);
    let rest = Math.round((r - hund * 100) * 100) / 100;
    if (rest >= 100) { hund += 1; rest -= 100; }
    const whole = Math.floor(rest);
    const frac = Math.round((rest - whole) * 100);
    return hund + '+' + String(whole).padStart(2, '0') + (frac ? '.' + String(frac).padStart(2, '0').replace(/0$/, '') : '');
  }
  function hasSta(x) { return x.start != null && x.start !== '' && x.end != null && x.end !== '' && Number.isFinite(parseStation(x.start)) && Number.isFinite(parseStation(x.end)); }
  function segLength(seg) { const a = parseStation(seg.start), b = parseStation(seg.end); return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) * 100) / 100 : 0; }
  /* label: a section → its title; a road entry → "<Road> Sta <start>–<end>" (just the road name while it has no stations) */
  function segLabel(x) {
    if (x && x.kind === 'section') return x.title;
    const r = String((x && x.road) || '').trim();
    return hasSta(x) ? r + ' Sta ' + formatStation(parseStation(x.start)) + '–' + formatStation(parseStation(x.end)) : r;
  }
  const blank = (v) => v == null || String(v).trim() === '';
  function validateSegment(seg, others) {
    const errs = [];
    if (!String(seg.road || '').trim()) errs.push('Road name is required.');
    const noSta = blank(seg.start) && blank(seg.end);
    const a = parseStation(seg.start), b = parseStation(seg.end);
    if (!noSta) {
      if (Number.isNaN(a)) errs.push('Start station must look like 10+00, 1000 or 10+00.50.');
      if (Number.isNaN(b)) errs.push('End station must look like 25+50, 2550 or 25+50.50.');
      if (!errs.length && b <= a) errs.push('End station must be after start station.');
    }
    if (seg.scale != null && seg.scale !== '' && !(Number(seg.scale) > 0)) errs.push('Scale must be a positive number.');
    const warns = [];
    if (!errs.length && !noSta) for (const o of overlaps({ ...seg, start: a, end: b }, others || [])) {
      warns.push('Overlaps ' + o.name + ' (' + formatStation(o.start) + ' to ' + formatStation(o.end) + ')' + (o.road ? ' on ' + o.road : '') + '.');
    }
    return { errs, warns };
  }
  /* overlap = same road name, same kind of section (key), station ranges intersect */
  function overlaps(seg, others) {
    const road = String(seg.road || '').trim().toLowerCase();
    return others.filter((o) => o.id !== seg.id && String(o.road || '').trim().toLowerCase() === road && (!seg.secKey || !o.secKey || seg.secKey === o.secKey) &&
      Number.isFinite(o.start) && Number.isFinite(o.end) && Math.max(seg.start, o.start) < Math.min(seg.end, o.end));
  }
  /* ---- PP sheet math ---- */
  function ftPerSheet(settings, scale) {
    const s = Number(scale);
    const row = (settings.scales || []).find((r) => Number(r.scale) === s);
    if (row) return Number(row.ft);
    return s > 0 ? s * 12 : NaN; /* custom scale: 1 in = scale ft, 12 in of sheet length */
  }
  function ppCount(length, ft, overlap) {
    overlap = Number(overlap) || 0;
    if (!(length > 0) || !(ft > 0)) return 0;
    const adv = ft - overlap;
    if (!(adv > 0)) return NaN;
    if (length <= ft) return 1;
    return Math.ceil((length - overlap) / adv - 1e-9);
  }
  /* Station ranges each PP sheet covers; last sheet ends at the segment end (shorter). */
  function ppRanges(start, end, ft, overlap) {
    overlap = Number(overlap) || 0;
    const n = ppCount(end - start, ft, overlap);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = start + i * (ft - overlap);
      out.push({ idx: i + 1, of: n, start: Math.round(a * 100) / 100, end: Math.round(Math.min(end, a + ft) * 100) / 100 });
    }
    return out;
  }
  /* sheets with no (valid) discipline: SWP3 / erosion / stormwater keywords → SWP3, else Drainage */
  const SWP3_RX = /swp3|swppp|erosion|storm ?water|sediment|silt fence|\bbmps?\b|pollution prevention/i;
  function guessDiscipline(title, series) { return SWP3_RX.test(String(title || '') + ' ' + String(series || '')) ? 'SWP3' : 'Drainage'; }
  function segScale(sub, seg) { return seg.scale != null && seg.scale !== '' ? Number(seg.scale) : Number(sub.scale) || 100; }
  function seriesScale(sub, seg) { return segScale(sub, seg); }
  /* ---- sections ---- */
  function secDefs(st, disc) { return st.settings.sections.filter((d) => !disc || d.discipline === disc); }
  function secDef(st, key) { return st.settings.sections.find((d) => d.key === key) || null; }
  function secOf(sub, key) { return sub.segments.find((s) => s.key === key) || null; }
  function sectionsOf(sub, disc) { return sub.segments.filter((s) => !disc || s.discipline === disc); }
  function isPPSec(sec) { return !!(sec && sec.series); }
  function roadsOf(sub, sec) { return sub.roads.filter((r) => r.sec === sec.id); }
  /* make every sub-project carry exactly the configured sections, in the configured order */
  function syncSections(st) {
    for (const sub of st.subs) {
      const out = [];
      for (const d of st.settings.sections) {
        let s = secOf(sub, d.key);
        if (!s) s = newSection(d);
        Object.assign(s, { kind: 'section', key: d.key, title: d.title, name: d.title, discipline: d.discipline, series: d.series || null });
        out.push(s);
      }
      for (const s of sub.segments) if (!out.includes(s)) { /* unknown key: keep it, add its definition */ st.settings.sections.push({ key: s.key, title: s.title, discipline: s.discipline, series: s.series || null }); out.push(s); }
      sub.segments = out;
    }
  }
  function ensureSection(st, key) {
    if (secDef(st, key)) return secDef(st, key);
    const disc = /^sw-/.test(key) ? 'SWP3' : 'Drainage';
    const title = key === OTHER[disc][0] ? OTHER[disc][1] : key;
    st.settings.sections.push({ key, title, discipline: disc, series: null });
    syncSections(st);
    return secDef(st, key);
  }
  /* closest section for a sheet title (v2 migration, CSV import, discipline change). Unmatched → Other <discipline>. */
  const SEC_RULES = [
    ['dr-odam', /overall.*(drainage )?area map|overall dam/i], ['dr-dam', /drainage area map|\bdams?\b|area map/i],
    ['dr-hds-runoff', /runoff|hydrolog/i], ['dr-hds-inlet', /inlet/i], ['dr-hds-ss', /storm ?sewer (comp|calc)|hgl|storm sewer computations/i],
    ['dr-trunk', /trunk ?line|trunkline/i], ['dr-lat', /lateral/i],
    ['dr-bd-welded', /welded/i], ['dr-bd-sum', /bridge deck.*summary|deck drain summary/i], ['dr-bd-det', /bridge deck|deck drain/i],
    ['dr-jb', /junction box/i], ['dr-det-xs', /detention.*(cross ?section|x-?sec|section)/i], ['dr-det', /detention|pond|outfall/i],
    ['dr-other', /quantit|ditch|channel/i],
    ['dr-hds-x', /crossing|cross culvert|culvert/i], ['dr-pp', /plan (&|and) profile|\bp ?& ?p\b|\bpp\b/i],
    ['dr-hds-runoff', /hydraulic data|data sheet/i], ['dr-std', /standard|misc/i],
  ];
  const SW_RULES = [['sw-layout', /layout|erosion control plan|\bescp?\b/i], ['sw-sum', /summary|notes|narrative/i], ['sw-std', /standard|detail/i]];
  function mapSection(st, title, discipline, series) {
    const disc = DISCIPLINES.includes(discipline) ? discipline : guessDiscipline(title, series);
    if (series) { const k = SERIES_SEC[series] || (st.settings.sections.find((d) => d.series === series) || {}).key; if (k && secDef(st, k)) return k; }
    const t = String(title || '');
    /* a user-made section with the exact title wins */
    const exact = secDefs(st, disc).find((d) => d.title.toLowerCase() === t.trim().toLowerCase()); if (exact) return exact.key;
    for (const [k, rx] of disc === 'SWP3' ? SW_RULES : SEC_RULES) if (rx.test(t) && (secDef(st, k) || k === OTHER[disc][0])) return k;
    return OTHER[disc][0];
  }
  function addSectionDef(st, f) {
    const title = String((f && f.title) || '').trim(); if (!title) throw new Error('Section name is required.');
    const disc = DISCIPLINES.includes(f.discipline) ? f.discipline : 'Drainage';
    if (secDefs(st, disc).some((d) => d.title.toLowerCase() === title.toLowerCase())) throw new Error('“' + title + '” is already a ' + disc + ' section.');
    const key = 'u-' + uid();
    const d = { key, title, discipline: disc, series: f.pp ? 'pp-' + key : null };
    const at = f.after ? st.settings.sections.findIndex((x) => x.key === f.after) + 1 : st.settings.sections.filter((x) => DISCIPLINES.indexOf(x.discipline) <= DISCIPLINES.indexOf(disc)).length;
    st.settings.sections.splice(at > 0 ? at : st.settings.sections.length, 0, d);
    syncSections(st); log(st, 'Added ' + disc + ' section “' + title + '” to every sub-project');
    return d;
  }
  function renameSectionDef(st, key, title) {
    const d = secDef(st, key); if (!d) throw new Error('No such section');
    const t = String(title || '').trim(); if (!t) throw new Error('Section name is required.');
    if (secDefs(st, d.discipline).some((x) => x !== d && x.title.toLowerCase() === t.toLowerCase())) throw new Error('“' + t + '” is already a ' + d.discipline + ' section.');
    const old = d.title; d.title = t; syncSections(st);
    for (const sub of st.subs) { const s = secOf(sub, key); for (const sh of s.sheets) if (sh.gen && !sh.gen.titleEdited && sh.title.startsWith(old + ' – ')) sh.title = t + sh.title.slice(old.length); }
    log(st, 'Renamed section “' + old + '” → “' + t + '”');
    return d;
  }
  function moveSectionDef(st, key, dir) {
    const L = st.settings.sections, i = L.findIndex((x) => x.key === key); if (i < 0) return false;
    let j = i + dir; while (j >= 0 && j < L.length && L[j].discipline !== L[i].discipline) j += dir;
    if (j < 0 || j >= L.length) return false;
    [L[i], L[j]] = [L[j], L[i]]; syncSections(st); return true;
  }
  function sectionInUse(st, key) { return st.subs.reduce((a, sub) => { const s = secOf(sub, key); return a + (s ? s.sheets.length + roadsOf(sub, s).length : 0); }, 0); }
  function removeSectionDef(st, key) {
    const d = secDef(st, key); if (!d) return false;
    const n = sectionInUse(st, key);
    if (n) throw new Error('“' + d.title + '” still has ' + n + ' sheet(s) / road(s) in some sub-project. Move or delete them first.');
    if (secDefs(st, d.discipline).length < 2) throw new Error('Keep at least one ' + d.discipline + ' section.');
    st.settings.sections = st.settings.sections.filter((x) => x !== d);
    const ids = new Set(st.subs.map((sub) => (secOf(sub, key) || {}).id));
    for (const sub of st.subs) { sub.segments = sub.segments.filter((s) => s.key !== key); sub.templates = sub.templates.filter((t) => t.sec !== key); }
    st.index = st.index.filter((t) => t.sec !== key);
    st.links = st.links.filter((l) => !ids.has(l.src.id) && !ids.has(l.dst.id));
    log(st, 'Removed section “' + d.title + '”');
    return true;
  }
  /* turn road entries / PP on or off for a section (off only when it has no roads) */
  function setSectionPP(st, key, on) {
    const d = secDef(st, key); if (!d) throw new Error('No such section');
    if (!on && st.subs.some((sub) => roadsOf(sub, secOf(sub, key)).length)) throw new Error('Remove the road entries of “' + d.title + '” first.');
    d.series = on ? d.series || (Object.keys(SERIES_SEC).find((s) => SERIES_SEC[s] === key) || 'pp-' + key) : null;
    syncSections(st); return d;
  }
  /* ---- road entries + PP ---- */
  function roadPP(st, sub, road, opts) {
    let scale = segScale(sub, road);
    if (opts && opts.subScale && opts.subScale[sub.id] && (road.scale == null || road.scale === '')) scale = Number(opts.subScale[sub.id]);
    const ft = ftPerSheet(st.settings, scale), length = segLength(road);
    return { length, scale, ft, count: ppCount(length, ft, st.settings.overlapFt) };
  }
  /* PP for a section (sum of its roads) or for one road entry. Shape kept from v2: { length, series:[{series, scale, ft, count}], total } */
  function segPP(st, sub, x, opts) {
    if (x && x.kind === 'section') {
      if (!isPPSec(x) || (opts && opts.discipline && opts.discipline !== x.discipline)) return { length: 0, series: [], total: 0, roads: [] };
      const rs = roadsOf(sub, x).map((road) => Object.assign({ road }, roadPP(st, sub, road, opts)));
      const total = rs.reduce((a, b) => a + (b.count || 0), 0);
      return { length: rs.reduce((a, b) => a + b.length, 0), series: [{ series: { id: x.series, name: x.title, discipline: x.discipline }, scale: rs.length ? rs[0].scale : sub.scale, ft: rs.length ? rs[0].ft : ftPerSheet(st.settings, sub.scale), count: total }], total, roads: rs };
    }
    const hit = x && findRoad(st, x.id), sec = hit ? hit.sec : null;
    if (sec && opts && opts.discipline && opts.discipline !== sec.discipline) return { length: segLength(x), series: [], total: 0 };
    const p = roadPP(st, sub, x, opts);
    return { length: p.length, series: [{ series: sec ? { id: sec.series, name: sec.title, discipline: sec.discipline } : { id: '', name: 'PP', discipline: 'Drainage' }, scale: p.scale, ft: p.ft, count: p.count }], total: p.count };
  }
  function roadKey(sub, r) { return sub.id + '|' + String(r.road).trim().toLowerCase() + '|' + r.start + '|' + r.end; }
  function ppSummary(st, opts) {
    const rows = [], bySub = [];
    for (const sub of st.subs) {
      let subTot = 0; const seen = new Set(); let subLen = 0;
      const disc = {}; for (const d of DISCIPLINES) disc[d] = 0;
      for (const sec of sub.segments.filter(isPPSec)) for (const road of roadsOf(sub, sec)) {
        const p = roadPP(st, sub, road, opts);
        rows.push({ sub, sec, seg: road, road, length: p.length, series: { id: sec.series, name: sec.title, discipline: sec.discipline }, discipline: sec.discipline, scale: p.scale, ft: p.ft, count: p.count });
        subTot += p.count; disc[sec.discipline] += p.count;
        const k = roadKey(sub, road); if (!seen.has(k)) { seen.add(k); subLen += p.length; }
      }
      bySub.push({ sub, total: subTot, length: subLen, disc });
    }
    const byDisc = {}; for (const d of DISCIPLINES) byDisc[d] = bySub.reduce((a, b) => a + (b.disc[d] || 0), 0);
    return { rows, bySub, byDisc, total: bySub.reduce((a, b) => a + b.total, 0), length: bySub.reduce((a, b) => a + b.length, 0) };
  }
  /* title of a generated PP sheet; road is optional (v2 titles had no road) */
  function genTitle(series, r, road) {
    return (series.title || series.name) + ' – ' + (road && road.road ? road.road + ' ' : '') + 'Sta ' + formatStation(r.start) + ' to ' + formatStation(r.end) + ' (PP ' + r.idx + ' of ' + r.of + ')';
  }
  function isTouched(sh) {
    return sh.status !== 'Not started' || !!sh.owner || !!sh.notes || (Number(sh.pct) || 0) > 0 || (Number(sh.hoursActual) || 0) > 0 ||
      Object.values(sh.qc || {}).some(Boolean) || !!(sh.gen && sh.gen.titleEdited) || !!sh.sta;
  }
  /* Plan (no mutation): which generated sheets to create / update / remove for one road entry */
  function planGenerate(st, roadId) {
    const hit = findRoad(st, roadId);
    if (!hit) throw new Error('No such road entry');
    const { sub, road, sec } = hit;
    const plan = { create: [], update: [], remove: [], removeTouched: [], unchanged: 0 };
    const existing = sec.sheets.filter((s) => s.gen && s.gen.road === road.id).sort((a, b) => a.gen.idx - b.gen.idx);
    let ranges = hasSta(road) ? ppRanges(parseStation(road.start), parseStation(road.end), ftPerSheet(st.settings, segScale(sub, road)), st.settings.overlapFt) : [];
    if (road.reverse) ranges = ranges.slice().reverse().map((r, i) => Object.assign({}, r, { idx: i + 1 })); /* v2.12: PP 1 at the high-station end */
    ranges.forEach((r) => {
      const ex = existing.find((s) => s.gen.idx === r.idx);
      const title = genTitle(sec, ex && ex.sta ? Object.assign({}, r, { start: ex.sta.start, end: ex.sta.end }) : r, road);
      if (!ex) plan.create.push({ series: sec, range: r, title });
      else if (ex.gen.start !== r.start || ex.gen.end !== r.end || ex.gen.of !== r.of || (!ex.gen.titleEdited && ex.title !== title) || ex.discipline !== sec.discipline || ex.gen.series !== sec.series) plan.update.push({ sheet: ex, series: sec, range: r, title });
      else plan.unchanged++;
    });
    for (const ex of existing.filter((s) => s.gen.idx > ranges.length)) (isTouched(ex) ? plan.removeTouched : plan.remove).push(ex);
    return plan;
  }
  function sortSecSheets(sub, sec) {
    const order = new Map(roadsOf(sub, sec).map((r, i) => [r.id, i]));
    sec.sheets.sort((a, b) => (a.gen ? 0 : 1) - (b.gen ? 0 : 1) || (a.gen && b.gen ? (order.get(a.gen.road) ?? 1e9) - (order.get(b.gen.road) ?? 1e9) || a.gen.idx - b.gen.idx : 0));
  }
  function applyGenerate(st, roadId, plan, opts) {
    const { sub, road, sec } = findRoad(st, roadId);
    for (const c of plan.create) {
      const sh = newSheet({ title: c.title, discipline: sec.discipline, series: sec.title, road: road.road });
      sh.gen = { series: sec.series, road: road.id, idx: c.range.idx, of: c.range.of, start: c.range.start, end: c.range.end };
      sec.sheets.push(sh);
      sh.number = suggestNumber(st, sh) || String(sec.series || 'PP').replace('pp-', '').toUpperCase() + '-' + c.range.idx; /* v2.6: next free number in the series range */
    }
    for (const u of plan.update) {
      Object.assign(u.sheet.gen, { series: sec.series, road: road.id, idx: u.range.idx, of: u.range.of, start: u.range.start, end: u.range.end });
      if (!u.sheet.gen.titleEdited) u.sheet.title = u.title;
      u.sheet.discipline = sec.discipline; u.sheet.series = sec.title; u.sheet.road = road.road;
    }
    const kill = new Set(plan.remove.concat(opts && opts.removeTouched ? plan.removeTouched : []));
    sec.sheets = sec.sheets.filter((s) => !kill.has(s));
    if (kill.size) pruneLinks(st);
    sortSecSheets(sub, sec);
    const keptTouched = opts && opts.removeTouched ? 0 : plan.removeTouched.length;
    if (!(opts && opts.quiet)) log(st, 'Generated PP sheets for ' + subTag(sub) + ' · ' + sec.title + ' · ' + segLabel(road) + ': +' + plan.create.length + ' new, ' + plan.update.length + ' updated, ' + kill.size + ' removed' + (keptTouched ? ', ' + keptTouched + ' edited extra kept' : ''), { t: 'seg', id: sec.id });
    return { created: plan.create.length, updated: plan.update.length, removed: kill.size, keptTouched };
  }
  /* whole section (all its road entries) */
  function planSection(st, secId) {
    const hit = findSeg(st, secId); if (!hit) throw new Error('No such section');
    const out = { create: [], update: [], remove: [], removeTouched: [], unchanged: 0, roads: [] };
    for (const r of roadsOf(hit.sub, hit.seg)) { const p = planGenerate(st, r.id); out.roads.push({ road: r, plan: p }); for (const k of ['create', 'update', 'remove', 'removeTouched']) out[k].push(...p[k]); out.unchanged += p.unchanged; }
    return out;
  }
  function generateSection(st, secId, opts) {
    const P = planSection(st, secId), tot = { created: 0, updated: 0, removed: 0, keptTouched: 0 };
    for (const x of P.roads) { const r = applyGenerate(st, x.road.id, x.plan, opts); for (const k in tot) tot[k] += r[k]; }
    return tot;
  }

  /* ---- v3.2: road nodes, per-sheet station ranges ---- */
  function rgSlug(name) { return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'road'; }
  function rgKey(sec, name) { return 'rd:' + sec.id + ':' + rgSlug(name); }
  /* road entries of a section grouped by road name (one tree node per road; a road may have several station ranges) */
  function roadGroups(sub, sec) {
    const m = new Map();
    for (const r of roadsOf(sub, sec)) { const k = rgSlug(r.road); if (!m.has(k)) m.set(k, { key: 'rd:' + sec.id + ':' + k, slug: k, name: String(r.road || '').trim() || 'Road', entries: [] }); m.get(k).entries.push(r); }
    return [...m.values()];
  }
  /* station range of a sheet: manual (sh.sta) wins, else the computed range of a generated PP sheet, else null */
  function sheetRange(sh) {
    if (sh.sta && Number.isFinite(sh.sta.start) && Number.isFinite(sh.sta.end)) return { start: sh.sta.start, end: sh.sta.end, manual: true };
    if (sh.gen && Number.isFinite(sh.gen.start) && Number.isFinite(sh.gen.end)) return { start: sh.gen.start, end: sh.gen.end, manual: false };
    return null;
  }
  function rangeText(rg) { return rg ? 'Sta ' + formatStation(rg.start) + ' – ' + formatStation(rg.end) : 'no range'; }
  /* which road group a sheet of a road section belongs to (null → "Other sheets") */
  function sheetGroupSlug(sub, sec, sh) {
    if (sh.gen && sh.gen.road) { const r = sub.roads.find((x) => x.id === sh.gen.road); if (r) return rgSlug(r.road); }
    if (sh.road && roadsOf(sub, sec).some((r) => rgSlug(r.road) === rgSlug(sh.road))) return rgSlug(sh.road);
    return null;
  }
  function sheetsOfGroup(sub, sec, g) {
    const ids = new Map(g.entries.map((r, i) => [r.id, i]));
    return sec.sheets.filter((sh) => sheetGroupSlug(sub, sec, sh) === g.slug).sort((a, b) => {
      const ra = sheetRange(a), rb = sheetRange(b);
      return (a.gen ? 0 : 1) - (b.gen ? 0 : 1) || (a.gen && b.gen ? (ids.get(a.gen.road) - ids.get(b.gen.road)) || a.gen.idx - b.gen.idx : 0) || ((ra ? ra.start : 1e12) - (rb ? rb.start : 1e12));
    });
  }
  function otherSheets(sub, sec) { return sec.sheets.filter((sh) => sheetGroupSlug(sub, sec, sh) == null); }
  function sheetScale(st, sub, sh) { if (sh.gen && sh.gen.road) { const r = sub.roads.find((x) => x.id === sh.gen.road); if (r) return segScale(sub, r); } return null; }
  /* computed range of a generated sheet (ignores the manual override) */
  function computedRange(sh) { return sh.gen && Number.isFinite(sh.gen.start) ? { start: sh.gen.start, end: sh.gen.end } : null; }
  function setSheetRange(st, sheetId, start, end) {
    const hit = findSheet(st, sheetId); if (!hit) throw new Error('No such sheet');
    const blankA = blank(start), blankB = blank(end);
    if (blankA !== blankB) throw new Error('Give both stations or neither.');
    const { sub, seg, sh } = hit;
    if (blankA) { delete sh.sta; refreshGenTitle(st, sub, seg, sh); log(st, 'Cleared station range of ' + sh.title, { t: 'sheet', id: sh.id }); return { sh, warns: [] }; }
    const a = parseStation(start), b = parseStation(end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Stations look like 10+00 or 1000.');
    if (!(b > a)) throw new Error('End station must be after the start station.');
    const c = computedRange(sh);
    if (c && Math.abs(c.start - a) < 0.005 && Math.abs(c.end - b) < 0.005) delete sh.sta; else sh.sta = { start: a, end: b };
    refreshGenTitle(st, sub, seg, sh);
    log(st, 'Station range of ' + sh.title + ' → ' + formatStation(a) + '–' + formatStation(b) + (sh.sta && c ? ' (manual)' : ''), { t: 'sheet', id: sh.id });
    return { sh, warns: rangeWarnings(st, sub, seg).filter((w) => w.sheet === sh.id).map((w) => w.msg) };
  }
  function resetSheetRange(st, sheetId) {
    const hit = findSheet(st, sheetId); if (!hit) throw new Error('No such sheet');
    delete hit.sh.sta; refreshGenTitle(st, hit.sub, hit.seg, hit.sh);
    log(st, 'Station range of ' + hit.sh.title + ' reset to computed', { t: 'sheet', id: hit.sh.id });
    return hit.sh;
  }
  function refreshGenTitle(st, sub, sec, sh) {
    if (!sh.gen || sh.gen.titleEdited) return;
    const road = sub.roads.find((x) => x.id === sh.gen.road); if (!road) return;
    const rg = sheetRange(sh); if (!rg) return;
    sh.title = genTitle(sec, { idx: sh.gen.idx, of: sh.gen.of, start: rg.start, end: rg.end }, road);
  }
  /* warnings for a road section: manual ranges that differ from the computed one, outside the road, overlapping, or extra sheets kept after a recount */
  function rangeWarnings(st, sub, sec) {
    const out = [];
    for (const g of roadGroups(sub, sec)) {
      const shs = sheetsOfGroup(sub, sec, g);
      for (const sh of shs) {
        const rg = sheetRange(sh); if (!rg) continue;
        const road = sh.gen ? sub.roads.find((x) => x.id === sh.gen.road) : null;
        const cnt = road ? (hasSta(road) ? roadPP(st, sub, road).count : 0) : null;
        if (sh.gen && cnt != null && sh.gen.idx > cnt) out.push({ sheet: sh.id, msg: 'PP ' + sh.gen.idx + ' is past the computed count (' + cnt + ') — kept because it was edited. Delete it or reset it.' });
        if (rg.manual && sh.gen) { const c = computedRange(sh); if (c) out.push({ sheet: sh.id, msg: 'PP ' + sh.gen.idx + ' has a manual range ' + formatStation(rg.start) + '–' + formatStation(rg.end) + ' (computed ' + formatStation(c.start) + '–' + formatStation(c.end) + ').' }); }
        if (road && hasSta(road) && (rg.start < parseStation(road.start) - 0.005 || rg.end > parseStation(road.end) + 0.005)) out.push({ sheet: sh.id, msg: sh.title + ' runs outside the road stations (' + formatStation(road.start) + '–' + formatStation(road.end) + ').' });
      }
      const ranged = shs.map((sh) => ({ sh, rg: sheetRange(sh) })).filter((x) => x.rg && x.sh.gen).sort((p, q) => p.rg.start - q.rg.start);
      const ov = Number(st.settings.overlapFt) || 0;
      for (let i = 1; i < ranged.length; i++) if (ranged[i].rg.start < ranged[i - 1].rg.end - ov - 0.005 && ranged[i].sh.gen.road === ranged[i - 1].sh.gen.road) out.push({ sheet: ranged[i].sh.id, msg: ranged[i].sh.title + ' overlaps ' + ranged[i - 1].sh.title + '.' });
    }
    return out;
  }
  /* keep every road's generated PP sheets in step with its stations / scale (edited extras are kept and warned about, never deleted) */
  function syncPP(st, opts) {
    const tot = { created: 0, updated: 0, removed: 0, keptTouched: 0 };
    for (const sub of st.subs) for (const road of sub.roads.slice()) {
      const p = planGenerate(st, road.id);
      if (!p.create.length && !p.update.length && !p.remove.length) { tot.keptTouched += p.removeTouched.length; continue; }
      const r = applyGenerate(st, road.id, p, { removeTouched: false, quiet: true });
      for (const k in tot) tot[k] += r[k];
    }
    if ((tot.created || tot.updated || tot.removed) && !(opts && opts.quiet)) log(st, 'PP sheets follow the road stations: +' + tot.created + ' new, ' + tot.updated + ' updated, ' + tot.removed + ' removed' + (tot.keptTouched ? ' (' + tot.keptTouched + ' edited extra kept)' : ''));
    return tot;
  }
  /* v3.1 → v3.2 (same key, same schema): compute every PP sheet's station range from its road; manual sheets get none */
  function upgrade32(st) {
    if (st.v32 && st.v32.at !== undefined) return null;
    const info = { roads: 0, groups: 0, pp: 0, manualInRoad: 0, manualOther: 0 };
    for (const sub of st.subs) for (const sec of sub.segments.filter(isPPSec)) {
      info.roads += roadsOf(sub, sec).length; info.groups += roadGroups(sub, sec).length;
      for (const sh of sec.sheets) { if (sh.gen) continue; if (sheetGroupSlug(sub, sec, sh)) info.manualInRoad++; else info.manualOther++; }
    }
    const t = syncPP(st, { quiet: true });
    info.updated = t.updated; info.created = t.created; info.removed = t.removed;
    for (const sub of st.subs) for (const sec of sub.segments) info.pp += sec.sheets.filter((sh) => sh.gen && sheetRange(sh)).length;
    st.v32 = { at: new Date().toISOString(), ...info };
    log(st, 'Upgraded to v3.2: ' + info.pp + ' PP sheets have station ranges; ' + info.groups + ' roads are now tree branches');
    return info;
  }
  function pendingCount(p) { return p.create.length + p.update.length + p.remove.length + p.removeTouched.length; }

  /* ---- lookups & ops ---- */
  function findSub(st, id) { return st.subs.find((s) => s.id === id); }
  /* v3.1: sub-project display names. code (A–D) stays the stable letter badge; id is the key; order drives the build order. */
  function subDefault(sub) { return 'Sub-project ' + sub.code; }
  function subName(sub) { const n = String(sub && sub.name || '').trim(); return n || subDefault(sub); }
  function subCustom(sub) { return subName(sub) !== subDefault(sub); }
  function subTag(sub) { return subCustom(sub) ? subName(sub) : sub.code; }
  function subLabel(sub) { return subCustom(sub) ? sub.code + ' · ' + subName(sub) : subDefault(sub); }
  function checkSubName(st, id, name) {
    const v = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!v) return { ok: false, error: 'Name cannot be empty.' };
    if (v.length > 60) return { ok: false, error: 'Keep the name to 60 characters or fewer.' };
    const lo = v.toLowerCase();
    const clash = st.subs.find((s) => s.id !== id && (subName(s).toLowerCase() === lo || s.code.toLowerCase() === lo));
    if (clash) return { ok: false, error: 'Another sub-project (' + clash.code + ') already uses “' + v + '”.' };
    return { ok: true, name: v };
  }
  function renameSub(st, id, name) {
    const sub = findSub(st, id); if (!sub) return { ok: false, error: 'Sub-project not found.' };
    const c = checkSubName(st, id, name); if (!c.ok) return c;
    const old = subName(sub); if (old === c.name) return { ok: true, name: c.name, same: true };
    sub.name = c.name; log(st, 'Renamed sub-project ' + sub.code + ': ' + old + ' → ' + c.name);
    return { ok: true, name: c.name };
  }
  function findSeg(st, id) {
    for (const sub of st.subs) for (const seg of sub.segments) if (seg.id === id) return { sub, seg };
    return null;
  }
  function findRoad(st, id) {
    for (const sub of st.subs) for (const road of sub.roads) if (road.id === id) return { sub, road, seg: road, sec: sub.segments.find((s) => s.id === road.sec) };
    return null;
  }
  function findSheet(st, sheetId) {
    for (const sub of st.subs) for (const seg of sub.segments) for (const sh of seg.sheets) if (sh.id === sheetId) return { sub, seg, sh };
    return null;
  }
  /* road name shown for a sheet: generated → its road entry, else the sheet's road tag */
  function sheetRoad(st, sub, sh) { if (sh.gen && sh.gen.road) { const r = sub.roads.find((x) => x.id === sh.gen.road); if (r) return r.road; } return sh.road || ''; }
  function log(st, msg, ref) {
    st.log.unshift(ref ? { t: new Date().toISOString(), msg, ref: { t: ref.t, id: ref.id } } : { t: new Date().toISOString(), msg });
    if (st.log.length > 500) st.log.length = 500;
  }
  function roadsInKey(st, key) { return st.subs.flatMap((sub) => sub.roads.map((r) => ({ r, sub }))).filter((x) => { const s = x.sub.segments.find((q) => q.id === x.r.sec); return !key || (s && s.key === key); }).map((x) => Object.assign({}, x.r, { secKey: key, name: subTag(x.sub) + ' · ' + segLabel(x.r) })); }
  function stationsOf(f, cur) {
    const pick = (k) => (k in f ? f[k] : cur ? cur[k] : null);
    const a = pick('start'), b = pick('end');
    return { start: blank(a) ? null : parseStation(a), end: blank(b) ? null : parseStation(b) };
  }
  /* add a road entry to a Plan & Profile section. Only the road name is required; stations can come later. */
  function addRoad(st, secId, f) {
    const hit = findSeg(st, secId);
    if (!hit) throw new Error('No such section');
    if (!isPPSec(hit.seg)) throw new Error('“' + hit.seg.title + '” has no road entries. Use a Plan & Profile section (or turn on roads for it in Settings → Sections).');
    const s = stationsOf(f);
    const road = { id: uid(), kind: 'road', name: '', road: String(f.road || f.name || '').trim(), start: s.start, end: s.end, scale: f.scale ? Number(f.scale) : null, reverse: !!f.reverse, sec: hit.seg.id, notes: f.notes || '', revs: [] };
    const v = validateSegment({ ...road, secKey: hit.seg.key }, roadsInKey(st, hit.seg.key));
    if (v.errs.length) throw new Error(v.errs.join(' '));
    road.name = segLabel(road);
    hit.sub.roads.push(road);
    sortRoads(hit.sub);
    log(st, 'Added road ' + subTag(hit.sub) + ' · ' + hit.seg.title + ' · ' + road.name, { t: 'road', id: road.id });
    return { road, seg: road, warns: v.warns };
  }
  function sortRoads(sub) { sub.roads.sort((x, y) => (Number.isFinite(x.start) ? x.start : 1e12) - (Number.isFinite(y.start) ? y.start : 1e12) || String(x.road).localeCompare(String(y.road))); }
  function updateRoad(st, roadId, f) {
    const hit = findRoad(st, roadId);
    if (!hit) throw new Error('No such road entry');
    const s = stationsOf(f, hit.road);
    const next = { ...hit.road, ...f, start: s.start, end: s.end };
    if ('scale' in f) next.scale = f.scale === '' || f.scale == null ? null : Number(f.scale);
    const v = validateSegment({ ...next, secKey: hit.sec.key }, roadsInKey(st, hit.sec.key));
    if (v.errs.length) throw new Error(v.errs.join(' '));
    next.road = String(next.road || '').trim();
    Object.assign(hit.road, next, { name: segLabel(next) });
    for (const sh of hit.sec.sheets) if (sh.gen && sh.gen.road === roadId) sh.road = hit.road.road;
    sortRoads(hit.sub);
    log(st, 'Updated road ' + subTag(hit.sub) + ' · ' + hit.sec.title + ' · ' + hit.road.name, { t: 'road', id: roadId });
    return { road: hit.road, seg: hit.road, warns: v.warns };
  }
  /* delete a road entry and its generated PP sheets (other sheets are not touched) */
  function deleteRoad(st, roadId) {
    const hit = findRoad(st, roadId);
    if (!hit) return false;
    hit.sub.roads = hit.sub.roads.filter((r) => r !== hit.road);
    const n = hit.sec.sheets.filter((s) => s.gen && s.gen.road === roadId).length;
    hit.sec.sheets = hit.sec.sheets.filter((s) => !(s.gen && s.gen.road === roadId));
    pruneLinks(st); log(st, 'Deleted road ' + subTag(hit.sub) + ' · ' + hit.sec.title + ' · ' + hit.road.name + (n ? ' and its ' + n + ' PP sheets' : ''));
    return true;
  }
  function newSheet(f) {
    return { id: uid(), title: String(f.title || '').trim() || 'Untitled sheet',
      discipline: DISCIPLINES.includes(f.discipline) ? f.discipline : guessDiscipline(f.title, f.series),
      number: f.number || '', series: f.series || '', road: String(f.road || '').trim(),
      status: STATUSES.includes(f.status) ? f.status : 'Not started',
      owner: String(f.owner || '').trim(), due: f.due || '', pct: 0, hoursBudget: Number(f.hoursBudget) || 0, hoursActual: 0,
      milestone: f.milestone || '', notes: f.notes || '', qc: {}, revs: [], gen: null };
  }
  function addSheet(st, secId, f) {
    const hit = findSeg(st, secId);
    if (!hit) throw new Error('No such section');
    const sh = newSheet(Object.assign({}, f, { discipline: hit.seg.discipline }));
    hit.seg.sheets.push(sh);
    log(st, 'Added sheet ' + sh.title + ' to ' + subTag(hit.sub) + ' · ' + hit.seg.title, { t: 'sheet', id: sh.id });
    return sh;
  }
  /* move a sheet to another section of the same sub-project (its discipline follows the section) */
  function moveSheet(st, sheetId, secId) {
    const hit = findSheet(st, sheetId), to = findSeg(st, secId);
    if (!hit || !to) throw new Error('No such sheet / section');
    if (to.sub !== hit.sub) throw new Error('Sheets move within their sub-project.');
    if (hit.sh.gen) throw new Error('Generated PP sheets belong to their road entry; edit the road instead.');
    if (to.seg === hit.seg) return hit.sh;
    hit.seg.sheets = hit.seg.sheets.filter((s) => s !== hit.sh);
    to.seg.sheets.push(hit.sh); hit.sh.discipline = to.seg.discipline;
    log(st, hit.sh.title + ': section → ' + to.seg.title, { t: 'sheet', id: hit.sh.id });
    return hit.sh;
  }
  const NUMERIC = ['pct', 'hoursBudget', 'hoursActual'];
  function updateSheet(st, sheetId, f) {
    const hit = findSheet(st, sheetId);
    if (!hit) throw new Error('No such sheet');
    const sh = hit.sh;
    if ('status' in f && !STATUSES.includes(f.status)) throw new Error('Bad status');
    if ('discipline' in f && !DISCIPLINES.includes(f.discipline)) throw new Error('Bad discipline');
    const g = { ...f };
    if ('sec' in g) { moveSheet(st, sh.id, g.sec); delete g.sec; }
    if ('discipline' in g) { /* v3: discipline = branch; changing it moves the sheet to the closest section of that branch */
      if (g.discipline !== hit.seg.discipline) { const key = mapSection(st, sh.title, g.discipline); ensureSection(st, key); moveSheet(st, sh.id, secOf(hit.sub, key).id); }
      delete g.discipline;
    }
    for (const k of NUMERIC) if (k in g) {
      const v = Number(g[k]);
      if (!Number.isFinite(v) || v < 0) throw new Error(k + ' must be a number ≥ 0');
      g[k] = k === 'pct' ? Math.min(100, Math.round(v)) : Math.round(v * 10) / 10;
    }
    if ('deps' in g) { /* compat: set this sheet's prerequisite sheets */
      const want = new Set((g.deps || []).filter((d) => d !== sh.id && findSheet(st, d)));
      for (const l of st.links.filter((x) => x.kind === 'dep' && x.dst.t === 'sheet' && x.dst.id === sh.id && x.src.t === 'sheet' && !want.has(x.src.id))) removeLink(st, l.id);
      for (const d of want) if (!st.links.some((x) => x.kind === 'dep' && x.dst.id === sh.id && x.src.id === d)) addLink(st, { t: 'sheet', id: d }, { t: 'sheet', id: sh.id }, 'dep');
      delete g.deps;
    }
    if ('road' in g) g.road = String(g.road || '').trim();
    const reopened = sh.status === 'Done' && 'status' in g && g.status !== 'Done';
    if ('title' in g && sh.gen && g.title !== sh.title) sh.gen.titleEdited = true;
    if (g.status === 'Done' && !('pct' in g)) g.pct = 100;
    if ('pct' in g && g.pct === 100 && !('status' in g) && sh.status !== 'Done') g.status = 'Done';
    const changed = Object.keys(g).filter((k) => JSON.stringify(sh[k]) !== JSON.stringify(g[k]));
    Object.assign(sh, g);
    if (sh.owner) addStaff(st, sh.owner);
    if (reopened) markRevised(st, { t: 'sheet', id: sh.id }, 'Re-opened (was Done)');
    if (changed.length) log(st, sh.title + ': ' + changed.map((k) => k + (['notes', 'qc'].includes(k) ? '' : ' → ' + (g[k] === '' ? '(blank)' : g[k]))).join(', '), { t: 'sheet', id: sh.id });
    return sh;
  }
  function deleteSheet(st, sheetId) {
    const hit = findSheet(st, sheetId);
    if (hit) {
      hit.seg.sheets = hit.seg.sheets.filter((s) => s !== hit.sh);
      pruneLinks(st);
      log(st, 'Deleted sheet ' + hit.sh.title);
    }
    return !!hit;
  }
  function duplicateSheet(st, sheetId) {
    const hit = findSheet(st, sheetId);
    if (!hit) throw new Error('No such sheet');
    const copy = { ...clone(hit.sh), id: uid(), title: hit.sh.title + ' (copy)', status: 'Not started', pct: 0, hoursActual: 0, qc: {}, revs: [], gen: null };
    hit.seg.sheets.splice(hit.seg.sheets.indexOf(hit.sh) + 1, 0, copy);
    log(st, 'Duplicated sheet ' + hit.sh.title, { t: 'sheet', id: copy.id });
    return copy;
  }
  function blockedBy(st, sh) { return blockers(st, { t: 'sheet', id: sh.id }).map((r) => resolve(st, r)).filter(Boolean).map((r) => r.obj); }
  /* standard (non-PP) sheets of one section from the sub-project's templates; skips titles the section already has */
  function bulkAddTemplates(st, secId, opts) {
    const hit = findSeg(st, secId);
    if (!hit) throw new Error('No such section');
    const have = new Set(hit.seg.sheets.map((s) => s.title.toLowerCase()));
    const added = [];
    for (const t of hit.sub.templates) {
      if (t.sec !== hit.seg.key || have.has(t.title.toLowerCase())) continue;
      const sh = newSheet({ title: t.title, discipline: hit.seg.discipline, owner: opts && opts.owner, due: opts && opts.due, milestone: opts && opts.milestone });
      hit.seg.sheets.push(sh); have.add(t.title.toLowerCase()); added.push(sh);
    }
    if (opts && opts.owner) addStaff(st, opts.owner);
    if (added.length && !(opts && opts.quiet)) log(st, 'Added ' + added.length + ' standard sheets to ' + subTag(hit.sub) + ' · ' + hit.seg.title);
    return added;
  }
  /* the whole standard set of a sub-project (optionally one discipline) */
  function addStandardSet(st, subId, opts) {
    const sub = findSub(st, subId); if (!sub) throw new Error('No such sub-project');
    const disc = opts && opts.discipline;
    const added = [];
    for (const sec of sub.segments) if (!disc || sec.discipline === disc) added.push(...bulkAddTemplates(st, sec.id, Object.assign({}, opts, { quiet: true })));
    if (added.length) log(st, 'Added ' + added.length + ' standard sheets to ' + subTag(sub) + (disc ? ' · ' + disc : ''));
    return added;
  }
  /* templates: { id, title, discipline, sec } */
  function addTemplate(st, subId, f) {
    const sub = findSub(st, subId);
    const title = String(f.title || '').trim() || 'Untitled sheet';
    const sec = f.sec && secDef(st, f.sec) ? f.sec : mapSection(st, title, f.discipline);
    ensureSection(st, sec);
    const t = { id: uid(), title, discipline: secDef(st, sec).discipline, sec };
    sub.templates.push(t);
    return t;
  }
  function updateTemplate(st, subId, tid, f) {
    const t = findSub(st, subId).templates.find((x) => x.id === tid);
    if (f.title != null) t.title = String(f.title).trim() || t.title;
    if (f.sec && secDef(st, f.sec)) { t.sec = f.sec; t.discipline = secDef(st, f.sec).discipline; }
    else if (DISCIPLINES.includes(f.discipline) && f.discipline !== t.discipline) { t.discipline = f.discipline; t.sec = mapSection(st, t.title, f.discipline); ensureSection(st, t.sec); }
    return t;
  }
  function deleteTemplate(st, subId, tid) { const sub = findSub(st, subId); sub.templates = sub.templates.filter((x) => x.id !== tid); }
  function duplicateTemplate(st, subId, tid) {
    const sub = findSub(st, subId);
    const i = sub.templates.findIndex((x) => x.id === tid);
    const c = { ...sub.templates[i], id: uid(), title: sub.templates[i].title + ' (copy)' };
    sub.templates.splice(i + 1, 0, c);
    return c;
  }
  function resetTemplates(st, subId) { const sub = findSub(st, subId); sub.templates = defaultTemplates(st.settings.sections); log(st, subTag(sub) + ' sheet templates reset to defaults'); }
  function resetAllTemplates(st) { for (const sub of st.subs) sub.templates = defaultTemplates(st.settings.sections); log(st, 'All sheet templates reset to defaults'); }
  /* staff: [{ name, role }] */
  function addStaff(st, name, role) {
    const n = String(name || '').trim();
    if (!n) return '';
    const ex = st.staff.find((s) => s.name.toLowerCase() === n.toLowerCase());
    if (!ex) { st.staff.push({ name: n, role: role || '' }); st.staff.sort((a, b) => a.name.localeCompare(b.name)); }
    else if (role != null && role !== '') ex.role = role;
    return n;
  }
  function removeStaff(st, name) { st.staff = st.staff.filter((s) => s.name !== name); }
  /* scales */
  function setScale(st, scale, ft) {
    const s = Number(scale), f = Number(ft);
    if (!(s > 0) || !(f > 0)) throw new Error('Scale and feet per sheet must be positive numbers.');
    const ex = st.settings.scales.find((r) => Number(r.scale) === s);
    if (ex) ex.ft = f; else st.settings.scales.push({ scale: s, ft: f });
    st.settings.scales.sort((a, b) => a.scale - b.scale);
  }
  function removeScale(st, scale) { st.settings.scales = st.settings.scales.filter((r) => Number(r.scale) !== Number(scale)); }
  /* milestones */
  function addMilestone(st, name, date) { const m = { id: uid(), name: String(name || '').trim() || 'Milestone', date: date || '' }; st.milestones.push(m); sortMilestones(st); return m; }
  function sortMilestones(st) { st.milestones.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')); }
  function removeMilestone(st, id) { st.milestones = st.milestones.filter((m) => m.id !== id); for (const r of allSheets(st)) if (r.sh.milestone === id) r.sh.milestone = ''; }

  /* ---- queries ---- */
  function allSheets(st) {
    const out = [];
    for (const sub of st.subs) for (const seg of sub.segments) for (const sh of seg.sheets) out.push({ sub, seg, sh });
    return out;
  }
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return todayISO(d); }
  function isOverdue(sh, today) { return !!sh.due && sh.status !== 'Done' && sh.due < today; }
  function isUpcoming(sh, today, days) { return !!sh.due && sh.status !== 'Done' && sh.due >= today && sh.due <= addDays(today, days == null ? 14 : days); }
  function progress(sheets) {
    const counts = { 'Not started': 0, 'In progress': 0, 'In review': 0, 'Done': 0 };
    let w = 0, hb = 0, ha = 0;
    for (const sh of sheets) {
      counts[sh.status] = (counts[sh.status] || 0) + 1;
      const p = sh.status === 'Done' ? 1 : Math.max(WEIGHT[sh.status] || 0, (Number(sh.pct) || 0) / 100);
      w += Math.min(1, p);
      hb += Number(sh.hoursBudget) || 0; ha += Number(sh.hoursActual) || 0;
    }
    const total = sheets.length;
    return { total, counts, done: counts.Done, pct: total ? Math.round((w / total) * 1000) / 10 : 0, donePct: total ? Math.round((counts.Done / total) * 1000) / 10 : 0, hoursBudget: hb, hoursActual: ha };
  }
  function summary(st, today) {
    today = today || todayISO();
    const rows = allSheets(st);
    const subs = st.subs.map((sub) => ({ sub, ...progress(rows.filter((r) => r.sub === sub).map((r) => r.sh)) }));
    const discs = DISCIPLINES.map((d) => ({ disc: d, ...progress(rows.filter((r) => r.seg.discipline === d).map((r) => r.sh)) }));
    const overdue = rows.filter((r) => isOverdue(r.sh, today)).sort((a, b) => a.sh.due.localeCompare(b.sh.due));
    const upcoming = rows.filter((r) => isUpcoming(r.sh, today, 14)).sort((a, b) => a.sh.due.localeCompare(b.sh.due));
    const byOwner = {};
    for (const s of st.staff) byOwner[s.name] = { owner: s.name, role: s.role, open: 0, done: 0, overdue: 0, hoursBudget: 0, hoursActual: 0 };
    for (const r of rows) {
      const k = r.sh.owner || '(unassigned)';
      byOwner[k] = byOwner[k] || { owner: k, role: '', open: 0, done: 0, overdue: 0, hoursBudget: 0, hoursActual: 0 };
      const o = byOwner[k];
      if (r.sh.status === 'Done') o.done++; else o.open++;
      if (isOverdue(r.sh, today)) o.overdue++;
      o.hoursBudget += Number(r.sh.hoursBudget) || 0; o.hoursActual += Number(r.sh.hoursActual) || 0;
    }
    const milestones = st.milestones.map((m) => ({ m, ...progress(rows.filter((r) => r.sh.milestone === m.id).map((r) => r.sh)) }));
    return { overall: progress(rows.map((r) => r.sh)), subs, discs, overdue, upcoming, milestones,
      workload: Object.values(byOwner).sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner)) };
  }
  function filterRows(rows, f, today) {
    f = f || {};
    today = today || todayISO();
    const q = String(f.q || '').trim().toLowerCase();
    return rows.filter((r) => {
      if (f.status && r.sh.status !== f.status) return false;
      if (f.owner && (f.owner === '(unassigned)' ? r.sh.owner : r.sh.owner !== f.owner)) return false;
      if (f.discipline && r.sh.discipline !== f.discipline) return false;
      if (f.sub && r.sub.id !== f.sub) return false;
      if (f.section && r.seg.key !== f.section) return false;
      if (f.milestone && (f.milestone === '(none)' ? r.sh.milestone : r.sh.milestone !== f.milestone)) return false;
      if (f.kind === 'pp' && !r.sh.gen) return false;
      if (f.kind === 'other' && r.sh.gen) return false;
      if (f.when === 'overdue' && !isOverdue(r.sh, today)) return false;
      if (f.when === 'upcoming' && !isUpcoming(r.sh, today, 14)) return false;
      if (f.when === 'open' && r.sh.status === 'Done') return false;
      if (f.flag) {
        const ref = { t: 'sheet', id: r.sh.id };
        if (f.flag === 'blocked' && (r.sh.status === 'Done' || !blockers(st0(f), ref).length)) return false;
        if (f.flag === 'update' && !needsUpdate(st0(f), ref).length) return false;
        if (f.flag === 'ready' && !(r.sh.status === 'Not started' && !blockers(st0(f), ref).length && linksOf(st0(f), ref).in.some((l) => l.kind === 'dep'))) return false;
        if (f.flag === 'linked') { const lo = linksOf(st0(f), ref); if (!lo.in.length && !lo.out.length) return false; }
      }
      if (q) {
        const roadName = r.sh.gen && r.sh.gen.road ? (r.sub.roads.find((x) => x.id === r.sh.gen.road) || {}).road : '';
        const hay = [r.sh.title, r.sh.number, r.sh.series, r.sh.owner, r.sh.notes, r.sh.status, r.sh.discipline, r.seg.title, r.sh.road, roadName, subTag(r.sub), r.sub.name, sheetRange(r.sh) ? rangeText(sheetRange(r.sh)) + ' ' + formatStation(sheetRange(r.sh).start) + '-' + formatStation(sheetRange(r.sh).end) : ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function st0(f) { if (!f.st) throw new Error('flag filter needs f.st'); return f.st; }
  function sortRows(rows, key, dir, getter) {
    const m = dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const x = getter(a, key), y = getter(b, key);
      if (x === y) return 0;
      if (x === '' || x == null) return 1;
      if (y === '' || y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * m;
    });
  }
  function saveView(st, name, filt, extra) {
    const n = String(name || '').trim();
    if (!n) throw new Error('Name the view.');
    st.views = st.views.filter((v) => v.name !== n);
    st.views.push({ id: uid(), name: n, filt: clone(filt), ...(extra ? clone(extra) : {}) });
    return st.views[st.views.length - 1];
  }
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(st, rows) {
    const ms = Object.fromEntries(st.milestones.map((m) => [m.id, m.name]));
    const head = ['Sub-project', 'Discipline', 'Section', 'Road', 'Sheet No', 'Sheet', 'Series', 'Sheet Sta From', 'Sheet Sta To', 'Status', '% Complete', 'Owner', 'Due', 'Milestone', 'Hours Budget', 'Hours Actual', 'QC Done', 'Depends On', 'Generated', 'Notes'];
    const lines = [head.join(',')];
    for (const r of rows) {
      const sh = r.sh;
      const qcDone = st.settings.qcSteps.filter((q) => sh.qc && sh.qc[q]).length + '/' + st.settings.qcSteps.length;
      const deps = linksOf(st, { t: 'sheet', id: sh.id }).in.filter((l) => l.kind === 'dep').map((l) => refLabel(st, l.src)).join('; ');
      lines.push([subTag(r.sub), r.seg.discipline, r.seg.title, sheetRoad(st, r.sub, sh), sh.number, sh.title, sh.series,
        sh.gen ? formatStation(sh.gen.start) : '', sh.gen ? formatStation(sh.gen.end) : '', sh.status, sh.pct, sh.owner, sh.due, ms[sh.milestone] || '',
        sh.hoursBudget, sh.hoursActual, qcDone, deps, sh.gen ? 'yes' : '', sh.notes].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  function ppCSV(st, opts) {
    const S = ppSummary(st, opts);
    const L = [['Sub-project', 'Discipline', 'Section', 'Road', 'Start Sta', 'End Sta', 'Length ft', 'Scale', 'Ft per sheet', 'Overlap ft', 'PP sheets'].join(',')];
    const row = (a) => L.push(a.map(csvCell).join(','));
    for (const r of S.rows) row([subTag(r.sub), r.discipline, r.sec.title, r.road.road, formatStation(r.road.start), formatStation(r.road.end), r.length, r.scale, r.ft, st.settings.overlapFt, r.count]);
    for (const sub of st.subs) for (const sec of sub.segments.filter(isPPSec)) { const n = S.rows.filter((r) => r.sec === sec).reduce((a, b) => a + b.count, 0); if (n) row([subTag(sub) + ' total', sec.discipline, sec.title, '', '', '', '', '', '', '', n]); }
    for (const b of S.bySub) for (const d of DISCIPLINES) row([subTag(b.sub) + ' total', d, '', '', '', '', '', '', '', '', b.disc[d]]);
    for (const b of S.bySub) row([subTag(b.sub) + ' total', 'All', '', '', '', '', b.length, '', '', '', b.total]);
    for (const d of DISCIPLINES) row(['Project total', d, '', '', '', '', '', '', '', '', S.byDisc[d]]);
    row(['Project total', 'All', '', '', '', '', S.length, '', '', '', S.total]);
    return L.join('\r\n') + '\r\n';
  }

  /* ---- schema: v1 (encrypted era) → v2 → v3 ---- */
  const V2_TEMPLATE_TITLES = ['Drainage Area Map', 'Hydrologic / Hydraulic Data Sheet', 'Inlet / Manhole Schedule', 'Culvert Layout', 'Cross Culvert Profile', 'Ditch / Channel Details', 'Outfall / Detention / Pond Layout', 'Standard & Miscellaneous Drainage Details', 'Culvert & Storm Sewer Quantity Summary', 'SWP3 Summary & Notes', 'SWP3 Standard Details'];
  function migrate(old) {
    if (!old || !Array.isArray(old.subs)) throw new Error('Data is not a PM project');
    if (old.schema === SCHEMA) return normalize(old);
    if (old.schema === 2) return migrate2to3(old);
    if (old.schema !== 1) throw new Error('Unknown data version ' + old.schema);
    const v2 = { schema: 2, project: { name: (old.project && old.project.name) || 'PSE Drainage & SWP3 Project' }, created: old.created || new Date().toISOString(), lastBackup: old.lastBackup || null,
      staff: (old.staff || []).map((n) => ({ name: String(n), role: '' })), links: [], views: [], log: [], milestones: [],
      subs: old.subs.map((s, i) => ({ id: s.id, code: s.code, name: s.name, order: i + 1, scale: 100,
        templates: Array.isArray(s.templates) ? s.templates.map((t) => ({ id: t.id, title: t.title, discipline: t.discipline })) : null,
        segments: (s.segments || []).map((g) => ({ id: g.id, name: g.name, road: g.road || g.name || 'Road', start: g.start, end: g.end, scale: null, notes: g.notes || '',
          sheets: (g.sheets || []).map((h) => ({ ...newSheet(h), id: h.id, pct: h.status === 'Done' ? 100 : 0, deps: h.deps })) })) })) };
    const st = migrate2to3(v2);
    st.log = st.log.filter((l) => !/^Migrated to v3/.test(l.msg)); log(st, 'Migrated from v1 encrypted vault');
    return st;
  }
  /* v2 (roads as tree nodes) → v3 (sections). Non-destructive: every sheet, road, link, status, owner, date and note is kept. */
  function migrate2to3(old) {
    const o = clone(old);
    const st = newState(o.project && o.project.name);
    for (const k of ['created', 'lastBackup', 'views', 'log']) if (o[k] !== undefined) st[k] = o[k];
    st.staff = Array.isArray(o.staff) ? o.staff.map((s) => (typeof s === 'string' ? { name: s, role: '' } : s)) : [];
    st.milestones = Array.isArray(o.milestones) ? o.milestones : st.milestones;
    st.links = Array.isArray(o.links) ? o.links : [];
    st.log = Array.isArray(st.log) ? st.log : [];
    st.views = Array.isArray(st.views) ? st.views : [];
    const os = o.settings || {};
    st.settings = Object.assign(st.settings, { scales: Array.isArray(os.scales) ? os.scales : st.settings.scales, overlapFt: Number(os.overlapFt) || 0,
      qcSteps: Array.isArray(os.qcSteps) ? os.qcSteps : st.settings.qcSteps, numbering: Array.isArray(os.numbering) ? os.numbering : st.settings.numbering });
    const series = Array.isArray(os.series) ? os.series : clone(DEFAULT_SERIES);
    const enabled = series.filter((x) => x.enabled).map((x) => x.id);
    const seriesSec = (id) => SERIES_SEC[id] || (((series.find((x) => x.id === id) || {}).discipline === 'SWP3') ? 'sw-layout' : 'dr-pp');
    st.subs = o.subs.map((s, i) => ({ id: s.id || uid(), code: s.code, name: s.name || 'Sub-project ' + s.code, order: Number.isFinite(Number(s.order)) ? Number(s.order) : i + 1, scale: Number(s.scale) || 100,
      templates: [], segments: st.settings.sections.map(newSection), roads: [] }));
    const R = { sheets: 0, roads: 0, segments: 0, generated: 0, bySection: {}, other: 0, segLinks: 0 };
    const segMap = {};
    o.subs.forEach((os2, i) => {
      const sub = st.subs[i];
      for (const g of os2.segments || []) {
        R.segments++;
        const gs = Array.isArray(g.sheets) ? g.sheets : [];
        const want = [...new Set(['pp-drain'].concat(enabled, gs.filter((x) => x.gen).map((x) => x.gen.series)))].filter((id) => enabled.includes(id) || gs.some((x) => x.gen && x.gen.series === id));
        if (!want.length) want.push('pp-drain');
        const roadBy = {};
        const mk = (key, first) => {
          if (roadBy[key]) return roadBy[key];
          ensureSection(st, key);
          const sec = secOf(sub, key);
          const r = { id: first ? g.id : uid(), kind: 'road', name: '', road: String(g.road || g.name || 'Road').trim() || 'Road', start: Number.isFinite(parseStation(g.start)) ? parseStation(g.start) : null, end: Number.isFinite(parseStation(g.end)) ? parseStation(g.end) : null,
            scale: g.scale != null && g.scale !== '' ? Number(g.scale) : null, reverse: !!g.reverse, sec: sec.id, notes: first ? g.notes || '' : '', revs: first && Array.isArray(g.revs) ? g.revs : [] };
          r.name = segLabel(r); sub.roads.push(r); R.roads++;
          return (roadBy[key] = r);
        };
        want.map(seriesSec).forEach((key, j) => mk(key, j === 0));
        const firstRoad = Object.values(roadBy)[0];
        segMap[g.id] = (sub.segments.find((x) => x.id === firstRoad.sec) || {}).id;
        for (const sh0 of gs) {
          const sh = sh0; R.sheets++;
          for (const [k, v] of Object.entries(newSheet({}))) if (sh[k] === undefined) sh[k] = k === 'id' ? uid() : v;
          sh.road = String(g.road || '').trim();
          let key;
          if (sh.gen) { key = seriesSec(sh.gen.series); const r = mk(key, false); sh.gen.road = r.id; R.generated++; }
          else { key = mapSection(st, sh.title, sh.discipline, sh.series); ensureSection(st, key); }
          const sec = secOf(sub, key);
          sh.discipline = sec.discipline;
          sec.sheets.push(sh);
          R.bySection[sec.title] = (R.bySection[sec.title] || 0) + 1;
          if (/^(dr|sw)-other$/.test(key)) R.other++;
        }
      }
      sortRoads(sub);
      for (const sec of sub.segments) if (isPPSec(sec)) sortSecSheets(sub, sec);
    });
    /* templates / index: the untouched v2 defaults become the new section list; anything Luis edited is kept and mapped */
    const isDefaultList = (L) => Array.isArray(L) && L.length === V2_TEMPLATE_TITLES.length && L.every((t, i) => t.title === V2_TEMPLATE_TITLES[i]);
    const mapT = (t) => { const sec = mapSection(st, t.title, t.discipline); ensureSection(st, sec); return { id: t.id || uid(), title: t.title, discipline: secDef(st, sec).discipline, sec }; };
    o.subs.forEach((os2, i) => { st.subs[i].templates = !Array.isArray(os2.templates) || isDefaultList(os2.templates) ? defaultTemplates(st.settings.sections) : os2.templates.map(mapT); });
    st.index = !Array.isArray(o.index) || isDefaultList(o.index) ? defaultTemplates(st.settings.sections) : o.index.map(mapT);
    /* v2.0 kept prerequisites in sheet.deps → 'dep' links */
    const ids = new Set(allSheets(st).map((r) => r.sh.id));
    for (const r of allSheets(st)) if (Array.isArray(r.sh.deps)) {
      for (const d of r.sh.deps) if (ids.has(d) && d !== r.sh.id && !st.links.some((l) => l.kind === 'dep' && l.src.id === d && l.dst.id === r.sh.id))
        st.links.push({ id: uid(), src: { t: 'sheet', id: d }, dst: { t: 'sheet', id: r.sh.id }, kind: 'dep', ack: 0, created: new Date().toISOString() });
      delete r.sh.deps;
    }
    /* whole-road connectors → the section that took the road's Drainage Plan & Profile entry */
    for (const l of st.links) for (const e of [l.src, l.dst]) if (e.t === 'seg' && segMap[e.id]) { e.id = segMap[e.id]; R.segLinks++; }
    const seenL = new Set();
    st.links = st.links.filter((l) => { const k = l.kind + rk(l.src) + '>' + rk(l.dst); if (rk(l.src) === rk(l.dst) || seenL.has(k)) return false; seenL.add(k); return true; });
    for (const l of st.log) if (l.ref && l.ref.t === 'seg' && segMap[l.ref.id]) l.ref = { t: 'road', id: l.ref.id };
    /* report notes: a v2 sub-project note goes to that sub-project's Drainage branch */
    const notes = (o.reportNotes && typeof o.reportNotes === 'object') ? o.reportNotes : {};
    for (const [k, v] of Object.entries(notes)) {
      const m = /^sub:(.+)$/.exec(k);
      if (m) { const dk = 'disc:' + m[1] + ':Drainage'; st.reportNotes[dk] = (notes[dk] ? notes[dk] + '\n' : '') + v; }
      else if (!st.reportNotes[k]) st.reportNotes[k] = v;
    }
    pruneLinks(st);
    /* refresh generated titles (they now carry the road name) — no PP sheet is created or removed here */
    for (const sub of st.subs) for (const road of sub.roads) { const p = planGenerate(st, road.id); if (p.update.length) applyGenerate(st, road.id, { create: [], update: p.update, remove: [], removeTouched: [], unchanged: 0 }, { quiet: true }); }
    st.migration = { from: 2, at: new Date().toISOString(), ...R };
    st.v32 = { at: new Date().toISOString(), fromV2: true };
    log(st, 'Migrated to v3 sections: ' + R.sheets + ' sheets and ' + R.segments + ' roads kept (' + R.roads + ' road entries' + (R.other ? ', ' + R.other + ' sheets in Other' : '') + ')');
    return normalize(st);
  }
  function normalize(st) {
    if (!st || st.schema !== SCHEMA || !Array.isArray(st.subs)) throw new Error('Data is not a PM v3 project');
    st.staff = Array.isArray(st.staff) ? st.staff.map((s) => (typeof s === 'string' ? { name: s, role: '' } : s)) : [];
    st.settings = Object.assign({ scales: clone(DEFAULT_SCALES), overlapFt: 0, qcSteps: DEFAULT_QC.slice(), sections: defaultSectionDefs(), numbering: clone(DEFAULT_NUMBERING) }, st.settings || {});
    if (!Array.isArray(st.settings.sections) || !st.settings.sections.length) st.settings.sections = defaultSectionDefs();
    for (const d of DISCIPLINES) if (!secDefs(st, d).length) st.settings.sections.push(...defaultSectionDefs().filter((x) => x.discipline === d));
    st.milestones = Array.isArray(st.milestones) ? st.milestones : [];
    if (!Array.isArray(st.settings.numbering)) st.settings.numbering = clone(DEFAULT_NUMBERING);
    st.views = Array.isArray(st.views) ? st.views : [];
    st.reportNotes = st.reportNotes && typeof st.reportNotes === 'object' && !Array.isArray(st.reportNotes) ? st.reportNotes : {};
    st.links = Array.isArray(st.links) ? st.links : [];
    st.index = Array.isArray(st.index) ? st.index : defaultTemplates(st.settings.sections);
    st.log = Array.isArray(st.log) ? st.log : [];
    for (const sub of st.subs) {
      sub.scale = Number(sub.scale) || 100;
      if (!Number.isFinite(Number(sub.order))) sub.order = st.subs.indexOf(sub) + 1;
      sub.templates = Array.isArray(sub.templates) ? sub.templates : defaultTemplates(st.settings.sections);
      sub.segments = Array.isArray(sub.segments) ? sub.segments : [];
      sub.roads = Array.isArray(sub.roads) ? sub.roads : [];
    }
    syncSections(st);
    for (const sub of st.subs) {
      for (const sec of sub.segments) {
        sec.sheets = Array.isArray(sec.sheets) ? sec.sheets : [];
        sec.revs = Array.isArray(sec.revs) ? sec.revs : [];
        for (const sh of sec.sheets) { const d = newSheet({}); for (const k of Object.keys(d)) if (sh[k] === undefined) sh[k] = k === 'id' ? uid() : d[k]; sh.discipline = sec.discipline; }
      }
      const secIds = new Set(sub.segments.map((s) => s.id));
      for (const r of sub.roads) {
        r.kind = 'road'; r.revs = Array.isArray(r.revs) ? r.revs : [];
        if (!secIds.has(r.sec)) r.sec = (secOf(sub, 'dr-pp') || sub.segments.find(isPPSec) || sub.segments[0]).id;
        r.name = segLabel(r);
      }
      for (const t of sub.templates) if (!t.sec || !secDef(st, t.sec)) { t.sec = mapSection(st, t.title, t.discipline); ensureSection(st, t.sec); }
    }
    for (const t of st.index) if (!t.sec || !secDef(st, t.sec)) { t.sec = mapSection(st, t.title, t.discipline); ensureSection(st, t.sec); }
    pruneLinks(st);
    return st;
  }
  function backupFile(st) { return { fmt: 'pm-plain-backup', v: SCHEMA, exported: new Date().toISOString(), data: st }; }
  function readBackup(obj) {
    if (obj && obj.fmt === 'pm-plain-backup') return migrate(obj.data);
    if (obj && obj.schema) return migrate(obj);
    throw new Error('Not a PM backup file');
  }
  /* ---- connectors (cross-project links) ----
     link = { id, src:{t,id}, dst:{t,id}, kind:'dep'|'update', ack, created }
     src is upstream: for 'dep' the dst depends on src (src must be done first); for 'update' dst needs an update when src is revised.
     Both kinds flag "update needed" on dst when src gets a new revision; ack = src revision count already acknowledged. */
  const LINK_KINDS = { dep: 'Depends on (must be done first)', update: 'Update needed when this changes' };
  const rk = (r) => r.t + ':' + r.id;
  function resolve(st, ref) {
    if (!ref) return null;
    if (ref.t === 'sheet') { const x = findSheet(st, ref.id); return x && { t: 'sheet', ref, sub: x.sub, seg: x.seg, sh: x.sh, obj: x.sh, name: x.sh.title }; }
    if (ref.t === 'seg') { const x = findSeg(st, ref.id); return x && { t: 'seg', ref, sub: x.sub, seg: x.seg, obj: x.seg, name: x.seg.title }; }
    if (ref.t === 'road') { const x = findRoad(st, ref.id); return x && x.sec && { t: 'road', ref, sub: x.sub, seg: x.sec, road: x.road, obj: x.road, name: segLabel(x.road) }; }
    return null;
  }
  function refLabel(st, ref) {
    const r = resolve(st, ref);
    if (!r) return '(missing)';
    return subTag(r.sub) + ' · ' + r.seg.title + (r.t === 'sheet' ? ' · ' + r.sh.title : r.t === 'road' ? ' · ' + r.name : ' (section)');
  }
  function isDone(st, ref) {
    const r = resolve(st, ref);
    if (!r) return true;
    if (r.t === 'sheet') return r.sh.status === 'Done';
    const sheets = r.t === 'road' ? r.seg.sheets.filter((s) => s.gen && s.gen.road === r.road.id) : r.seg.sheets;
    return sheets.length > 0 && sheets.every((s) => s.status === 'Done');
  }
  function revCount(st, ref) { const r = resolve(st, ref); return r && Array.isArray(r.obj.revs) ? r.obj.revs.length : 0; }
  function subOrder(st, sub) { return Number.isFinite(Number(sub.order)) ? Number(sub.order) : st.subs.indexOf(sub) + 1; }
  function orderedSubs(st) { return st.subs.slice().sort((a, b) => subOrder(st, a) - subOrder(st, b) || a.code.localeCompare(b.code)); }
  function setOrder(st, ids) { ids.forEach((id, i) => { const s = findSub(st, id); if (s) s.order = i + 1; }); log(st, 'Build order → ' + orderedSubs(st).map((s) => subTag(s)).join(' → ')); }
  function wrongWay(st, link) {
    const a = resolve(st, link.src), b = resolve(st, link.dst);
    return !!(a && b && subOrder(st, a.sub) > subOrder(st, b.sub));
  }
  function isCross(st, link) { const a = resolve(st, link.src), b = resolve(st, link.dst); return !!(a && b && a.sub !== b.sub); }
  function linksOf(st, ref) {
    const k = rk(ref);
    return { in: st.links.filter((l) => rk(l.dst) === k), out: st.links.filter((l) => rk(l.src) === k) };
  }
  /* would adding src→dst (dep) create a cycle? i.e. can src already be reached from dst following dep links */
  function depPath(st, fromRef, toRef) {
    const target = rk(toRef), seen = new Set(), stack = [rk(fromRef)];
    while (stack.length) {
      const k = stack.pop();
      if (k === target) return true;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const l of st.links) if (l.kind === 'dep' && rk(l.src) === k) stack.push(rk(l.dst));
    }
    return false;
  }
  function addLink(st, src, dst, kind) {
    kind = kind === 'update' ? 'update' : 'dep';
    const a = resolve(st, src), b = resolve(st, dst);
    if (!a || !b) throw new Error('Both ends of a connector must exist.');
    if (rk(src) === rk(dst)) throw new Error('An item cannot be linked to itself.');
    if (st.links.some((l) => l.kind === kind && rk(l.src) === rk(src) && rk(l.dst) === rk(dst))) throw new Error('That connector already exists.');
    if (kind === 'dep' && depPath(st, dst, src)) throw new Error('Not added: this would create a circular dependency (' + refLabel(st, src) + ' already depends on ' + refLabel(st, dst) + ').');
    const link = { id: uid(), src: { t: src.t, id: src.id }, dst: { t: dst.t, id: dst.id }, kind, ack: revCount(st, src), created: new Date().toISOString() };
    st.links.push(link);
    const warns = [];
    if (wrongWay(st, link)) warns.push('Points upstream: ' + subTag(a.sub) + ' is built after ' + subTag(b.sub) + ', but ' + subTag(b.sub) + ' ' + (kind === 'dep' ? 'depends on' : 'is updated from') + ' it.');
    log(st, 'Connector ' + refLabel(st, src) + ' → ' + refLabel(st, dst) + ' (' + (kind === 'dep' ? 'depends on' : 'update') + ')');
    return { link, warns };
  }
  function removeLink(st, id) {
    const l = st.links.find((x) => x.id === id);
    if (!l) return false;
    st.links = st.links.filter((x) => x !== l);
    log(st, 'Removed connector ' + refLabel(st, l.src) + ' → ' + refLabel(st, l.dst));
    return true;
  }
  function pruneLinks(st) {
    st.links = st.links.filter((l) => resolve(st, l.src) && resolve(st, l.dst));
  }
  function blockers(st, ref) { return linksOf(st, ref).in.filter((l) => l.kind === 'dep' && !isDone(st, l.src)).map((l) => l.src); }
  function needsUpdate(st, ref) { return linksOf(st, ref).in.filter((l) => revCount(st, l.src) > (l.ack || 0)); }
  function markRevised(st, ref, note, date) {
    const r = resolve(st, ref);
    if (!r) throw new Error('Not found');
    r.obj.revs = Array.isArray(r.obj.revs) ? r.obj.revs : [];
    r.obj.revs.push({ t: date || new Date().toISOString(), note: String(note || '').trim() });
    const n = linksOf(st, ref).out.length;
    log(st, 'Revised ' + refLabel(st, ref) + (note ? ': ' + note : '') + (n ? ' → ' + n + ' linked item(s) flagged' : ''));
    return r.obj.revs.length;
  }
  function markUpdated(st, ref) {
    const ls = needsUpdate(st, ref);
    for (const l of ls) l.ack = revCount(st, l.src);
    if (ls.length) log(st, 'Marked updated: ' + refLabel(st, ref));
    return ls.length;
  }
  /* transitive upstream / downstream over all links */
  function impact(st, ref) {
    const walk = (dir) => {
      const out = new Set(), stack = [rk(ref)];
      while (stack.length) {
        const k = stack.pop();
        for (const l of st.links) {
          const from = dir === 'down' ? l.src : l.dst, to = dir === 'down' ? l.dst : l.src;
          if (rk(from) === k && !out.has(rk(to)) && rk(to) !== rk(ref)) { out.add(rk(to)); stack.push(rk(to)); }
        }
      }
      return out;
    };
    return { up: walk('up'), down: walk('down') };
  }
  function allRefs(st) {
    const out = [];
    for (const sub of st.subs) for (const seg of sub.segments) { out.push({ t: 'seg', id: seg.id }); for (const r of sub.roads) if (r.sec === seg.id) out.push({ t: 'road', id: r.id }); for (const sh of seg.sheets) out.push({ t: 'sheet', id: sh.id }); }
    return out;
  }
  function flags(st) {
    const blocked = [], update = [], ready = [];
    for (const ref of allRefs(st)) {
      const b = blockers(st, ref);
      if (b.length && !isDone(st, ref)) blocked.push({ ref, by: b });
      const u = needsUpdate(st, ref);
      if (u.length) update.push({ ref, from: u.map((l) => l.src) });
      if (ref.t === 'sheet') {
        const deps = linksOf(st, ref).in.filter((l) => l.kind === 'dep');
        if (deps.length && !b.length && resolve(st, ref).sh.status === 'Not started') ready.push({ ref });
      }
    }
    return { blocked, update, ready };
  }
  function depsCSV(st) {
    const lines = [['Type', 'From sub', 'From section', 'From item', 'To sub', 'To section', 'To item', 'Meaning', 'Cross-project', 'Wrong direction', 'From done', 'Update needed'].join(',')];
    for (const l of st.links) {
      const a = resolve(st, l.src), b = resolve(st, l.dst);
      if (!a || !b) continue;
      const item = (x) => (x.t === 'sheet' ? x.sh.title : x.t === 'road' ? x.name : '(section)');
      lines.push([l.kind, subTag(a.sub), a.seg.title, item(a), subTag(b.sub), b.seg.title, item(b),
        l.kind === 'dep' ? 'To depends on From (From first)' : 'Update To when From changes', isCross(st, l) ? 'yes' : '', wrongWay(st, l) ? 'yes' : '',
        isDone(st, l.src) ? 'yes' : '', revCount(st, l.src) > (l.ack || 0) ? 'yes' : ''].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  /* one discipline branch of a sub-project (optionally one section): progress, sheets, PP, flags */
  function branchStats(st, sub, disc, sec, today) {
    today = today || todayISO();
    const secs = sec ? [sec] : sectionsOf(sub, disc);
    const sheets = secs.flatMap((g) => g.sheets);
    const p = progress(sheets);
    const pp = secs.reduce((a, g) => a + segPP(st, sub, g).total, 0);
    const overdue = sheets.filter((x) => isOverdue(x, today)).length;
    const blocked = sheets.filter((x) => x.status !== 'Done' && blockers(st, { t: 'sheet', id: x.id }).length).length;
    const update = sheets.filter((x) => needsUpdate(st, { t: 'sheet', id: x.id }).length).length;
    const rs = secs.filter(isPPSec).flatMap((g) => roadsOf(sub, g));
    return { disc, sheets, total: sheets.length, done: p.done, pct: p.pct, pp, overdue, blocked, update, roads: rs.length, length: rs.reduce((a, g) => a + segLength(g), 0) };
  }
  /* a whole discipline across A–D */
  function discStats(st, disc, today) {
    const B = st.subs.map((sub) => branchStats(st, sub, disc, null, today));
    const sheets = B.flatMap((b) => b.sheets), p = progress(sheets);
    return { disc, subs: B, sheets, total: sheets.length, done: p.done, pct: p.pct, pp: B.reduce((a, b) => a + b.pp, 0), overdue: B.reduce((a, b) => a + b.overdue, 0), blocked: B.reduce((a, b) => a + b.blocked, 0), update: B.reduce((a, b) => a + b.update, 0), roads: B.reduce((a, b) => a + b.roads, 0) };
  }
  function roads(st) { return [...new Set(st.subs.flatMap((s) => s.roads.map((g) => g.road).concat(s.segments.flatMap((x) => x.sheets.map((q) => q.road)))).filter(Boolean))].sort(); }
  /* ---- v2.5 project sheet index: one list for the whole project, bulk-applied to the matching section of every sub-project ---- */
  function addIndexItem(st, f) {
    const title = String((f && f.title) || '').trim();
    if (!title) throw new Error('Sheet title is required.');
    if (st.index.some((x) => x.title.toLowerCase() === title.toLowerCase())) throw new Error('“' + title + '” is already in the sheet index.');
    const disc = DISCIPLINES.includes(f.discipline) ? f.discipline : f.sec && secDef(st, f.sec) ? secDef(st, f.sec).discipline : guessDiscipline(title);
    const sec = f.sec && secDef(st, f.sec) ? f.sec : mapSection(st, title, disc); ensureSection(st, sec);
    const it = { id: uid(), title, discipline: secDef(st, sec).discipline, sec };
    st.index.push(it); return it;
  }
  function updateIndexItem(st, id, f) {
    const it = st.index.find((x) => x.id === id); if (!it) throw new Error('Not found');
    if (f.title != null) { const t = String(f.title).trim(); if (!t) throw new Error('Sheet title is required.'); it.title = t; }
    if (f.sec && secDef(st, f.sec)) { it.sec = f.sec; it.discipline = secDef(st, f.sec).discipline; }
    else if (DISCIPLINES.includes(f.discipline) && f.discipline !== it.discipline) { it.discipline = f.discipline; it.sec = mapSection(st, it.title, f.discipline); ensureSection(st, it.sec); }
    return it;
  }
  function removeIndexItem(st, id) { st.index = st.index.filter((x) => x.id !== id); }
  function moveIndexItem(st, id, d) { const i = st.index.findIndex((x) => x.id === id), j = i + d; if (i < 0 || j < 0 || j >= st.index.length) return; [st.index[i], st.index[j]] = [st.index[j], st.index[i]]; }
  function planIndex(st, opts) {
    const out = [];
    for (const sub of st.subs) {
      if (opts && opts.subIds && !opts.subIds.includes(sub.id)) continue;
      for (const seg of sub.segments) {
        const have = new Set(seg.sheets.map((x) => x.title.toLowerCase()));
        const items = st.index.filter((t) => t.sec === seg.key && (!opts || !opts.discipline || t.discipline === opts.discipline) && !have.has(t.title.toLowerCase()));
        if (items.length) out.push({ sub, seg, items });
      }
    }
    return { rows: out, count: out.reduce((a, r) => a + r.items.length, 0), segments: out.length, sections: out.length };
  }
  function applyIndex(st, opts) {
    const plan = planIndex(st, opts);
    for (const r of plan.rows) for (const t of r.items) r.seg.sheets.push(newSheet({ title: t.title, discipline: r.seg.discipline }));
    log(st, 'Applied project sheet index: ' + plan.count + ' sheet(s) added to ' + plan.segments + ' section(s)');
    return plan.count;
  }
  function indexToTemplates(st) { for (const sub of st.subs) sub.templates = st.index.map((t) => ({ id: uid(), title: t.title, discipline: t.discipline, sec: t.sec })); log(st, 'Sheet index copied to every sub-project’s standard set'); }
  /* ---- v2.6 sheet numbers ---- */
  function numVal(n) { const m = /^\s*(\d+)\s*$/.exec(String(n == null ? '' : n)); return m ? Number(m[1]) : null; }
  function rangeFor(st, sh) {
    const R = st.settings.numbering || [];
    const hit = findSheet(st, sh.id), sk = hit && hit.seg && hit.seg.key;
    return (sk && R.find((r) => r.key === 'sec:' + sk)) || (sh.gen && R.find((r) => r.key === 'series:' + sh.gen.series)) || R.find((r) => r.key === 'tpl:' + String(sh.title).trim().toLowerCase()) || R.find((r) => r.key === 'disc:' + sh.discipline) || null;
  }
  function suggestNumber(st, sh, taken) {
    const r = rangeFor(st, sh); if (!r) return null;
    const used = taken || new Set(allSheets(st).filter((x) => x.sh !== sh).map((x) => String(x.sh.number).trim().toLowerCase()).filter(Boolean));
    for (let n = Number(r.from); n <= Number(r.to); n++) if (!used.has(String(n))) return String(n);
    return null;
  }
  function numberIssues(st, sh) {
    const out = [];
    const num = String(sh.number || '').trim();
    if (!num) return out;
    const dup = allSheets(st).filter((x) => x.sh !== sh && String(x.sh.number || '').trim().toLowerCase() === num.toLowerCase());
    if (dup.length) out.push('Duplicate sheet number — also on ' + dup.map((x) => subTag(x.sub) + ' · ' + x.sh.title).join(', '));
    const v = numVal(num), r = rangeFor(st, sh);
    if (r && v != null && (v < r.from || v > r.to)) out.push('Out of range: ' + r.label + ' uses ' + r.from + '–' + r.to);
    return out;
  }
  function allNumberIssues(st) { return allSheets(st).map((r) => ({ r, issues: numberIssues(st, r.sh) })).filter((x) => x.issues.length); }
  /* fill numbers in project order (build order, discipline, section order, road/station, generated index); opts.all also replaces existing numbers */
  function orderedRows(st) {
    return orderedSubs(st).flatMap((sub) => DISCIPLINES.flatMap((d) => sectionsOf(sub, d).flatMap((seg) => seg.sheets.map((sh) => ({ sub, seg, sh })))));
  }
  function autoNumber(st, opts) {
    const rows = orderedRows(st);
    const all = !!(opts && opts.all);
    const used = new Set(all ? [] : rows.map((x) => String(x.sh.number).trim().toLowerCase()).filter(Boolean));
    let n = 0;
    for (const x of rows) {
      if (!all && String(x.sh.number || '').trim()) continue;
      const v = suggestNumber(st, x.sh, used);
      if (v) { x.sh.number = v; used.add(v); n++; }
    }
    log(st, (all ? 'Renumbered ' : 'Numbered ') + n + ' sheet(s) from the number ranges');
    return n;
  }
  function setRange(st, key, f) {
    const r = st.settings.numbering.find((x) => x.key === key); if (!r) throw new Error('No such range');
    const from = f.from != null ? Math.floor(Number(f.from)) : r.from, to = f.to != null ? Math.floor(Number(f.to)) : r.to;
    if (!(from >= 0) || !(to >= from)) throw new Error('Range must be numbers with “to” ≥ “from”.');
    r.from = from; r.to = to; if (f.label) r.label = String(f.label).trim() || r.label;
    return r;
  }
  function addRange(st, title, from, to) {
    const key = 'tpl:' + String(title || '').trim().toLowerCase();
    if (key === 'tpl:') throw new Error('Sheet title is required.');
    if (st.settings.numbering.some((x) => x.key === key)) throw new Error('That sheet already has a range.');
    const r = { key, label: String(title).trim(), from: 0, to: 0 };
    st.settings.numbering.unshift(r);
    try { return setRange(st, key, { from, to }); } catch (e) { st.settings.numbering.shift(); throw e; }
  }
  function removeRange(st, key) { st.settings.numbering = st.settings.numbering.filter((x) => x.key !== key); }
  function rangeOverlaps(st) {
    const R = st.settings.numbering, out = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (R[i].from <= R[j].to && R[j].from <= R[i].to) out.push(R[i].label + ' / ' + R[j].label);
    return out;
  }
  /* v2.7 'This week': open sheets bucketed for a weekly look-ahead. f: { sub, discipline, owner } */
  function weekView(st, f, today) {
    today = today || todayISO(); f = f || {};
    const rows = filterRows(allSheets(st), { sub: f.sub, discipline: f.discipline, owner: f.owner }, today).filter((r) => r.sh.status !== 'Done');
    const byDue = (a, b) => (a.sh.due || '9999').localeCompare(b.sh.due || '9999');
    const out = { overdue: [], due7: [], blocked: [], update: [], ready: [] };
    for (const r of rows) {
      const ref = { t: 'sheet', id: r.sh.id }, blk = blockers(st, ref);
      if (isOverdue(r.sh, today)) out.overdue.push(r);
      else if (isUpcoming(r.sh, today, 7)) out.due7.push(r);
      if (blk.length) out.blocked.push(Object.assign({ by: blk }, r));
      const u = needsUpdate(st, ref); if (u.length) out.update.push(Object.assign({ from: u.map((l) => l.src) }, r));
      const hasDep = linksOf(st, ref).in.some((l) => l.kind === 'dep');
      if (r.sh.status === 'Not started' && !blk.length && (hasDep || isUpcoming(r.sh, today, 14))) out.ready.push(r);
    }
    for (const k in out) out[k].sort(byDue);
    return out;
  }
  /* v2.9 undo/redo history of JSON snapshots. record(json, {hard, now}) after each save; soft records within ms of the last coalesce. */
  function history(max, ms) {
    const H = { undo: [], redo: [], cur: null, t: 0, soft: false, max: max || 50, ms: ms == null ? 800 : ms };
    H.reset = (json) => { H.cur = json; H.soft = false; };
    H.record = (json, o) => {
      o = o || {}; const now = o.now == null ? Date.now() : o.now;
      if (H.cur === null || json === H.cur) { H.cur = json; return false; }
      const merge = !o.hard && H.soft && H.undo.length && now - H.t < H.ms;
      if (!merge) { H.undo.push(H.cur); if (H.undo.length > H.max) H.undo.shift(); }
      H.redo = []; H.cur = json; H.t = now; H.soft = !o.hard;
      return true;
    };
    H.step = (dir) => {
      const from = dir < 0 ? H.undo : H.redo, to = dir < 0 ? H.redo : H.undo;
      if (!from.length) return null;
      to.push(H.cur); H.cur = from.pop(); H.soft = false; return H.cur;
    };
    return H;
  }
  /* v2.10 status report data */
  function report(st, today) {
    today = today || todayISO();
    const S = summary(st, today), PP = ppSummary(st), w = weekView(st, {}, today);
    const subs = st.subs.map((sub) => ({ sub, pct: S.subs.find((x) => x.sub === sub).pct, discs: DISCIPLINES.map((d) => branchStats(st, sub, d, null, today)), pp: PP.bySub.find((b) => b.sub === sub).total }));
    const counts = Object.fromEntries(STATUSES.map((x) => [x, allSheets(st).filter((r) => r.sh.status === x).length]));
    const mil = S.milestones.map((m) => Object.assign({ late: !!m.m.date && m.m.date < today && m.pct < 100 }, m));
    return { today, project: st.project, overall: S.overall, counts, subs, discs: DISCIPLINES.map((d) => discStats(st, d, today)), pp: { total: PP.total, byDisc: PP.byDisc }, overdue: S.overdue, blocked: w.blocked, due7: w.due7, milestones: mil };
  }
  /* v3 tree collapse maps (UI keys: root, dtop:<disc>, disc:<sub>:<disc>, seg:<section id>) */
  const TREE_LEVELS = ['Project', 'Disciplines', 'Sub-projects', 'Sections', 'Roads', 'Sheets'];
  function collapseLevel(st, level) {
    const c = { root: level < 1 };
    for (const d of DISCIPLINES) c['dtop:' + d] = level < 2;
    for (const sub of st.subs) {
      for (const d of DISCIPLINES) c['disc:' + sub.id + ':' + d] = level < 3;
      for (const g of sub.segments) { c['seg:' + g.id] = level < 4; if (isPPSec(g)) { for (const rg of roadGroups(sub, g)) c[rg.key] = level < 5; c['oth:' + g.id] = level < 5; } }
    }
    return c;
  }
  /* collapse everything except the path to (and the children of) one node. p: { disc, sub, seg } */
  function focusBranch(st, p) {
    const c = collapseLevel(st, 1);
    if (!p) return c;
    if (p.disc) c['dtop:' + p.disc] = false;
    if (p.sub && p.disc) c['disc:' + p.sub + ':' + p.disc] = false;
    if (p.sub && !p.disc) for (const d of DISCIPLINES) { c['dtop:' + d] = false; c['disc:' + p.sub + ':' + d] = false; }
    if (p.seg) c['seg:' + p.seg] = false;
    if (p.rg) c[p.rg] = false;
    return c;
  }
  /* v2.12 stations (now on road entries) */
  function allSegs(st) { return st.subs.flatMap((s) => s.roads); }
  function previewStations(st, roadId, f) {
    const c = clone(st), hit = findRoad(c, roadId); if (!hit) throw new Error('No such road entry');
    const s = stationsOf(f, hit.road);
    const next = Object.assign({}, hit.road, f, s);
    if ('scale' in f) next.scale = f.scale === '' || f.scale == null ? null : Number(f.scale);
    const v = validateSegment({ ...next, secKey: hit.sec.key }, roadsInKey(c, hit.sec.key));
    if (v.errs.length) return { errs: v.errs, warns: [] };
    Object.assign(hit.road, next);
    const pp = Object.fromEntries(DISCIPLINES.map((d) => [d, d === hit.sec.discipline ? roadPP(c, hit.sub, hit.road).count : 0]));
    const plan = planGenerate(c, roadId);
    const hasGen = hit.sec.sheets.some((x) => x.gen && x.gen.road === roadId);
    return { errs: [], warns: v.warns, length: segLength(hit.road), pp, count: roadPP(c, hit.sub, hit.road).count, hasGen,
      plan: { create: plan.create.map((x) => x.title), update: plan.update.map((x) => x.sheet.title + ' → ' + x.title), remove: plan.remove.map((x) => x.title), keep: plan.removeTouched.map((x) => x.title) } };
  }
  /* apply a station change and (if the road already has generated PP sheets) regenerate them, keeping user-edited extras */
  function setStations(st, roadId, f, opts) {
    const r = updateRoad(st, roadId, f);
    if ('reverse' in f) r.road.reverse = !!f.reverse;
    let gen = null;
    const { sec } = findRoad(st, roadId);
    if ((!opts || opts.regen !== false) && sec.sheets.some((x) => x.gen && x.gen.road === roadId)) gen = applyGenerate(st, roadId, planGenerate(st, roadId), { removeTouched: false });
    return { road: r.road, seg: r.road, warns: r.warns, gen };
  }
  function shiftStations(st, roadId, offset, opts) {
    const hit = findRoad(st, roadId), d = Number(offset);
    if (!hit) throw new Error('No such road entry'); if (!Number.isFinite(d) || !d) throw new Error('Offset must be a non-zero number of feet.');
    if (!hasSta(hit.road)) throw new Error('Enter stations first.');
    if (hit.road.start + d < 0) throw new Error('Shift would make the start station negative.');
    const r = setStations(st, roadId, { start: hit.road.start + d, end: hit.road.end + d }, opts);
    for (const sh of hit.sec.sheets) if (sh.gen && sh.gen.road === roadId && !r.gen) { sh.gen.start += d; sh.gen.end += d; }
    log(st, 'Shifted ' + hit.road.name + ' by ' + (d > 0 ? '+' : '') + d + ' ft', { t: 'road', id: roadId });
    return r;
  }
  /* rows: [{ roadId?, secId?, road, start, end, scale }] from the table / clipboard. All-or-nothing. */
  function applyStationRows(st, rows) {
    const out = { updated: 0, added: 0, warns: [] };
    const before = clone(st);
    try {
      rows.forEach((r, i) => {
        try {
          const f = {}; for (const k of ['road', 'start', 'end', 'scale']) if (k in r && r[k] != null) f[k] = k === 'scale' ? (r[k] === '' ? null : Number(String(r[k]).replace(/^1"\s*=\s*|'$/g, ''))) : r[k];
          const id = r.roadId || r.segId;
          const x = id ? updateRoad(st, id, f) : addRoad(st, r.secId, f);
          id ? out.updated++ : out.added++; out.warns.push(...x.warns);
        } catch (e) { throw new Error('Row ' + (i + 1) + ': ' + e.message); }
      });
    } catch (e) { for (const k of Object.keys(st)) delete st[k]; Object.assign(st, before); throw e; }
    return out;
  }
  function parseTSV(text) { return String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t').map((c) => c.trim())); }
  /* v2.13 split / merge road entries */
  function splitSegment(st, roadId, station, opts) {
    const hit = findRoad(st, roadId); if (!hit) throw new Error('No such road entry');
    const { sub, road, sec } = hit, x = parseStation(station);
    if (!hasSta(road)) throw new Error('Enter stations first.');
    if (!Number.isFinite(x)) throw new Error('Split station must look like 10+00, 1000 or 10+00.50.');
    if (!(x > road.start && x < road.end)) throw new Error('Split station must be between ' + formatStation(road.start) + ' and ' + formatStation(road.end) + '.');
    const b = { id: uid(), kind: 'road', name: '', road: road.road, start: x, end: road.end, scale: road.scale, reverse: !!road.reverse, sec: road.sec, notes: road.notes || '', revs: [] };
    b.name = segLabel(b);
    const moving = sec.sheets.filter((sh) => sh.gen && sh.gen.road === road.id && sh.gen.start >= x);
    for (const sh of moving) sh.gen.road = b.id;
    road.end = x; road.name = segLabel(road);
    sub.roads.push(b); sortRoads(sub);
    const hadGen = moving.length || sec.sheets.some((q) => q.gen && q.gen.road === road.id);
    if (hadGen) for (const g of [road, b]) applyGenerate(st, g.id, planGenerate(st, g.id), { removeTouched: false, quiet: true });
    log(st, 'Split ' + road.road + ' at ' + formatStation(x) + ' → ' + road.name + ' + ' + b.name, { t: 'road', id: b.id });
    return { a: road, b, moved: moving.length, copied: 0 };
  }
  function touching(st, roadId) {
    const hit = findRoad(st, roadId); if (!hit || !hasSta(hit.road)) return [];
    const r = String(hit.road.road).trim().toLowerCase();
    return hit.sub.roads.filter((o) => o !== hit.road && o.sec === hit.road.sec && hasSta(o) && String(o.road).trim().toLowerCase() === r && (Math.abs(o.start - hit.road.end) < 0.01 || Math.abs(o.end - hit.road.start) < 0.01));
  }
  function mergeSegments(st, aId, bId) {
    const A = findRoad(st, aId), B = findRoad(st, bId);
    if (!A || !B) throw new Error('No such road entry');
    if (A.sub !== B.sub || A.sec !== B.sec) throw new Error('Road entries are in different sections or sub-projects.');
    if (!touching(st, aId).includes(B.road)) throw new Error('Road entries must be on the same road and touch end-to-start.');
    const [a, b] = A.road.start < B.road.start ? [A.road, B.road] : [B.road, A.road];
    const sec = A.sec;
    const off = Math.max(0, ...sec.sheets.filter((q) => q.gen && q.gen.road === a.id).map((q) => q.gen.idx));
    for (const sh of sec.sheets) if (sh.gen && sh.gen.road === b.id) { sh.gen.idx += off; sh.gen.road = a.id; }
    for (const l of st.links) for (const e of [l.src, l.dst]) if (e.t === 'road' && e.id === b.id) e.id = a.id;
    st.links = st.links.filter((l) => !(l.src.t === l.dst.t && l.src.id === l.dst.id));
    a.end = b.end; a.name = segLabel(a);
    A.sub.roads = A.sub.roads.filter((g) => g !== b);
    if (sec.sheets.some((q) => q.gen && q.gen.road === a.id)) applyGenerate(st, a.id, planGenerate(st, a.id), { removeTouched: false, quiet: true });
    log(st, 'Merged into ' + a.name, { t: 'road', id: a.id });
    return a;
  }
  /* v2.14 copy a road entry (optionally with its PP sheets, reset to Not started) to the same section of another sub-project */
  function copySegment(st, roadId, toSubId, opts) {
    const hit = findRoad(st, roadId), to = findSub(st, toSubId);
    if (!hit) throw new Error('No such road entry'); if (!to) throw new Error('No such sub-project');
    const tsec = secOf(to, hit.sec.key);
    const r = addRoad(st, tsec.id, { road: hit.road.road, start: hit.road.start, end: hit.road.end, scale: hit.road.scale, notes: hit.road.notes, reverse: hit.road.reverse });
    const src = hit.sec.sheets.filter((sh) => sh.gen && sh.gen.road === roadId);
    if (opts && opts.sheets) for (const sh of src) {
      const c = { ...clone(sh), id: uid(), status: 'Not started', pct: 0, hoursActual: 0, qc: {}, revs: [], number: '' };
      c.gen = { ...c.gen, road: r.road.id, titleEdited: !!sh.gen.titleEdited };
      tsec.sheets.push(c); c.number = suggestNumber(st, c) || '';
    }
    sortSecSheets(to, tsec);
    log(st, 'Copied ' + hit.road.name + ' (' + hit.sec.title + ') from ' + subTag(hit.sub) + ' to ' + subTag(to) + (opts && opts.sheets ? ' with ' + src.length + ' PP sheets' : ''), { t: 'road', id: r.road.id });
    return Object.assign(r, { sheets: opts && opts.sheets ? src.length : 0 });
  }
  /* v2.15 command palette ranking: every query word must appear; label prefix / word-start matches rank first */
  function paletteSearch(items, q, limit) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    items.forEach((it, i) => {
      const L = String(it.label).toLowerCase(), hay = L + ' ' + String(it.hint || '').toLowerCase() + ' ' + String(it.kw || '').toLowerCase();
      if (!words.every((w) => hay.includes(w))) return;
      let sc = (it.rank || 0);
      for (const w of words) { if (L.startsWith(w)) sc += 30; else if (new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(L)) sc += 15; else if (L.includes(w)) sc += 5; }
      out.push({ it, sc, i });
    });
    return out.sort((a, b) => b.sc - a.sc || a.i - b.i).slice(0, limit || 40).map((x) => x.it);
  }
  /* v2.16 bulk edits (all-or-nothing) */
  function bulkUpdate(st, ids, f) {
    const g = {}; for (const k of ['status', 'owner', 'due', 'discipline', 'sec']) if (f[k] != null) g[k] = f[k];
    if (!Object.keys(g).length) throw new Error('Nothing to change.');
    const before = clone(st), L0 = st.log.slice(); const n = ids.length;
    try { for (const id of ids) { const hit = findSheet(st, id); const gg = Object.assign({}, g); if (gg.sec) { const k = (findSeg(st, gg.sec) || {}).seg; gg.sec = k ? secOf(hit.sub, k.key).id : gg.sec; } updateSheet(st, id, gg); } }
    catch (e) { for (const k of Object.keys(st)) delete st[k]; Object.assign(st, before); throw e; }
    st.log = L0; log(st, 'Bulk edit ' + n + ' sheets: ' + Object.entries(g).map(([k, v]) => (k === 'sec' ? 'section → ' + ((findSeg(st, v) || {}).seg || {}).title : k + ' → ' + (v || '(none)'))).join(', '));
    return n;
  }
  function bulkDelete(st, ids) {
    const L0 = st.log.slice(); let n = 0; for (const id of ids) if (findSheet(st, id)) { deleteSheet(st, id); n++; }
    st.log = L0; log(st, 'Deleted ' + n + ' sheets');
    return n;
  }
  /* v2.17 recently changed items, from the activity log (newest first, one entry per item) */
  function recentChanges(st, n) {
    const seen = new Set(), out = [];
    for (const l of st.log) {
      if (!l.ref || seen.has(l.ref.t + ':' + l.ref.id)) continue;
      seen.add(l.ref.t + ':' + l.ref.id);
      const r = resolve(st, l.ref); if (!r) continue;
      out.push({ ref: l.ref, t: l.t, msg: l.msg, r });
      if (out.length >= (n || 8)) break;
    }
    return out;
  }
  /* v2.19 / v3 written narrative: project → discipline → sub-project → section. Deterministic sentences; notes (st.reportNotes) kept separately. */
  function listing(a, max) { max = max || 4; const x = a.slice(0, max); const more = a.length - x.length; const s = x.length < 2 ? x.join('') : x.slice(0, -1).join(', ') + ' and ' + x[x.length - 1]; return more > 0 ? s + ' (+' + more + ' more)' : s; }
  function pl(n, w, ws) { return n + ' ' + (n === 1 ? w : ws || w + 's'); }
  function pctTxt(p) { return Math.round(p) + '%'; }
  function topOwners(sheets) {
    const c = {}; for (const x of sheets) if (x.status !== 'Done') { const k = x.owner || 'unassigned'; c[k] = (c[k] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([k, v]) => k + ' (' + v + ' open)');
  }
  function roadTxt(st, sub, r) {
    const p = roadPP(st, sub, r);
    return hasSta(r) ? r.road + ' Sta ' + formatStation(r.start) + '–' + formatStation(r.end) + ' (' + Math.round(p.length).toLocaleString('en-US') + ' ft at 1"=' + p.scale + "', " + pl(p.count, 'PP sheet') + ')' : r.road + ' (stations not set yet)';
  }
  function narrative(st, today) {
    today = today || todayISO();
    const R = report(st, today), all = allSheets(st), notes = st.reportNotes || {};
    const lab = (ref) => refLabel(st, ref);
    const nextMs = R.milestones.filter((m) => m.m.date && m.m.date >= today && m.pct < 100)[0];
    const lateMs = R.milestones.filter((m) => m.late);
    const nRoads = allSegs(st).length;
    let P;
    if (!all.length && !nRoads) P = (st.project.name || 'This project') + ' has no sheets yet. Open a section (Drainage or SWP3 › sub-project › section) to add sheets, or add roads to a Plan & Profile section to count PP sheets.';
    else {
      const risks = [];
      if (R.overdue.length) risks.push(pl(R.overdue.length, 'overdue sheet'));
      if (R.blocked.length) risks.push(pl(R.blocked.length, 'blocked sheet'));
      const upd = flags(st).update.length; if (upd) risks.push(pl(upd, 'item') + ' needing an update after a linked revision');
      if (lateMs.length) risks.push('late milestone' + (lateMs.length > 1 ? 's ' : ' ') + listing(lateMs.map((m) => m.m.name)));
      const unassigned = all.filter((r) => r.sh.status !== 'Done' && !r.sh.owner).length; if (unassigned) risks.push(pl(unassigned, 'open sheet') + ' without an owner');
      P = (st.project.name || 'The project') + ' is ' + pctTxt(R.overall.pct) + ' complete (weighted), with ' + R.overall.done + ' of ' + pl(R.overall.total, 'sheet') + ' done, ' + R.counts['In review'] + ' in review and ' + R.counts['In progress'] + ' in progress. ' +
        R.discs.map((d) => d.disc + ' is ' + pctTxt(d.pct) + ' (' + d.done + ' of ' + d.total + ' sheets)').join('; ') + '. ' +
        (nRoads ? 'The Plan & Profile sections list ' + pl(nRoads, 'road entry', 'road entries') + ' and need ' + pl(R.pp.total, 'PP sheet') + ' (' + R.pp.byDisc.Drainage + ' Drainage, ' + R.pp.byDisc.SWP3 + ' SWP3). ' : 'No roads are entered in the Plan & Profile sections yet. ') +
        (R.overdue.length || R.blocked.length ? 'There ' + (R.overdue.length === 1 ? 'is ' : 'are ') + pl(R.overdue.length, 'overdue sheet') + ' and ' + pl(R.blocked.length, 'blocked sheet') + '. ' : 'Nothing is overdue or blocked. ') +
        (nextMs ? 'The next milestone is ' + nextMs.m.name + ' on ' + nextMs.m.date + ' (' + pctTxt(nextMs.pct) + ' of its ' + pl(nextMs.total, 'sheet') + ' done). ' : R.milestones.length ? 'No upcoming dated milestone. ' : 'No milestones are set. ') +
        (risks.length ? 'Biggest risks: ' + listing(risks, 5) + '.' : 'No significant risks flagged.');
    }
    const discs = R.discs.map((D) => {
      const d = D.disc;
      const behind = orderedSubs(st).map((sub) => ({ sub, b: D.subs[st.subs.indexOf(sub)] })).filter((x) => x.b.total);
      const dtext = !D.total && !D.roads ? d + ' has no sheets yet.' : d + ' is ' + pctTxt(D.pct) + ' complete: ' + D.done + ' of ' + pl(D.total, 'sheet') + ' done' + (D.pp ? ', ' + pl(D.pp, 'PP sheet') + ' counted from ' + pl(D.roads, 'road entry', 'road entries') : '') + '.' +
        (behind.length ? ' By sub-project: ' + behind.map((x) => subTag(x.sub) + ' ' + pctTxt(x.b.pct)).join(', ') + '.' : '') + (D.overdue ? ' ' + pl(D.overdue, 'sheet') + ' overdue.' : '') + (D.blocked ? ' ' + pl(D.blocked, 'sheet') + ' blocked.' : '');
      const subs = orderedSubs(st).map((sub) => {
        const b = branchStats(st, sub, d, null, today), sh = b.sheets, key = 'disc:' + sub.id + ':' + d;
        const nm = '';
        const secs = sectionsOf(sub, d).map((sec) => {
          const rs = isPPSec(sec) ? roadsOf(sub, sec) : [], p = progress(sec.sheets), note = notes['sec:' + sec.id] || '';
          if (!sec.sheets.length && !rs.length) return { sec, text: '', empty: true, note };
          const parts = [sec.title + ': ' + (sec.sheets.length ? p.done + ' of ' + pl(sec.sheets.length, 'sheet') + ' done (' + pctTxt(p.pct) + ')' : 'no sheets yet')];
          if (isPPSec(sec)) parts.push(rs.length ? 'roads ' + listing(rs.map((r) => roadTxt(st, sub, r)), 6) + ' — ' + pl(segPP(st, sub, sec).total, 'PP sheet') + ' in total' : 'no roads entered');
          if (isPPSec(sec)) for (const g of roadGroups(sub, sec)) {
            const shs = sheetsOfGroup(sub, sec, g).filter((q) => sheetRange(q));
            if (shs.length) parts.push(g.name + ' sheets: ' + listing(shs.map((q) => (q.gen ? 'PP ' + q.gen.idx : q.title) + ' ' + formatStation(sheetRange(q).start) + '–' + formatStation(sheetRange(q).end) + (q.status === 'Done' ? ' (done)' : q.status !== 'Not started' ? ' (' + q.status.toLowerCase() + ')' : '')), 8));
          }
          const od = sec.sheets.filter((q) => isOverdue(q, today)); if (od.length) parts.push(pl(od.length, 'overdue sheet'));
          return { sec, text: parts.join('; ') + '.', empty: false, note };
        });
        const empty = secs.filter((x) => x.empty).map((x) => x.sec.title);
        let text;
        if (!sh.length && !b.roads) text = subTag(sub) + nm + ' — ' + d + ': nothing started yet; no sheets or roads.';
        else {
          const done = sh.filter((q) => q.status === 'Done').map((q) => q.title), prog = sh.filter((q) => q.status === 'In progress' || q.status === 'In review').map((q) => q.title + (q.status === 'In review' ? ' (in review)' : ''));
          const rows = all.filter((r) => r.sub === sub && r.seg.discipline === d);
          const od = rows.filter((r) => isOverdue(r.sh, today)).map((r) => r.sh.title + ' (due ' + r.sh.due + ')');
          const bl = rows.filter((r) => r.sh.status !== 'Done' && blockers(st, { t: 'sheet', id: r.sh.id }).length).map((r) => r.sh.title + ' waiting on ' + listing(blockers(st, { t: 'sheet', id: r.sh.id }).map(lab), 2));
          const up = rows.filter((r) => needsUpdate(st, { t: 'sheet', id: r.sh.id }).length).map((r) => r.sh.title);
          const nx = rows.filter((r) => isUpcoming(r.sh, today, 7)).map((r) => r.sh.title + ' (' + r.sh.due + (r.sh.owner ? ', ' + r.sh.owner : '') + ')');
          const own = topOwners(sh);
          const parts = [subTag(sub) + nm + ' — ' + d + ': ' + pctTxt(b.pct) + ' complete, ' + b.done + ' of ' + pl(b.total, 'sheet') + ' done' + (b.pp ? ', ' + pl(b.pp, 'PP sheet') : '') + '.'];
          if (done.length) parts.push('Done: ' + listing(done) + '.');
          if (prog.length) parts.push('In progress / review: ' + listing(prog) + '.');
          if (od.length) parts.push('Overdue: ' + listing(od) + '.');
          if (bl.length) parts.push('Blocked: ' + listing(bl, 3) + '.');
          if (up.length) parts.push('Needs update: ' + listing(up) + '.');
          if (own.length) parts.push('Most open sheets: ' + listing(own) + '.');
          parts.push(nx.length ? 'Next 7 days: ' + listing(nx) + '.' : 'Nothing due in the next 7 days.');
          if (empty.length) parts.push(pl(empty.length, 'section') + ' not started: ' + listing(empty, 3) + '.');
          text = parts.join(' ');
        }
        return { sub, disc: d, text, note: notes[key] || '', key, secs: secs.filter((x) => !x.empty || x.note) };
      });
      return { disc: d, text: dtext, note: notes['dtop:' + d] || '', subs };
    });
    return { today, project: P, note: notes.project || '', discs };
  }

  /* v3.3 printable report data: header meta, executive metrics, per-branch tree with roads / station ranges, dependencies, workload, recent changes */
  const REPORT_META = ['preparedFor', 'preparedBy', 'scope', 'reportNo'];
  function setReportMeta(st, k, v) {
    if (REPORT_META.indexOf(k) < 0) throw new Error('Bad report field');
    const t = String(v == null ? '' : v).trim().slice(0, 200);
    st.project.report = Object.assign({}, st.project.report); if (t) st.project.report[k] = t; else delete st.project.report[k];
  }
  function reportMeta(st) { const m = (st.project && st.project.report) || {}; return { preparedFor: m.preparedFor || '', preparedBy: m.preparedBy || '', scope: m.scope || '', reportNo: m.reportNo || '' }; }
  function printReport(st, today) {
    today = today || todayISO();
    const R = report(st, today), F = flags(st), all = allSheets(st);
    const owners = {};
    for (const r of all) {
      const k = r.sh.owner || 'Unassigned';
      const o = owners[k] || (owners[k] = { owner: k, total: 0, open: 0, overdue: 0, due7: 0, hb: 0, ha: 0, by: Object.fromEntries(STATUSES.map((x) => [x, 0])) });
      o.total++; o.by[r.sh.status]++; if (r.sh.status !== 'Done') o.open++;
      if (isOverdue(r.sh, today)) o.overdue++; if (isUpcoming(r.sh, today, 7)) o.due7++;
      o.hb += Number(r.sh.hoursBudget) || 0; o.ha += Number(r.sh.hoursActual) || 0;
    }
    const workload = Object.values(owners).sort((a, b) => (a.owner === 'Unassigned') - (b.owner === 'Unassigned') || b.open - a.open || a.owner.localeCompare(b.owner));
    const tree = DISCIPLINES.map((d) => ({ disc: d, stats: R.discs.find((x) => x.disc === d), subs: orderedSubs(st).map((sub) => ({ sub, stats: branchStats(st, sub, d, null, today),
      secs: sectionsOf(sub, d).map((sec) => {
        const p = progress(sec.sheets), pp = isPPSec(sec);
        const roads = pp ? roadGroups(sub, sec).map((g) => ({ name: g.name, spans: g.entries.map((r) => hasSta(r) ? formatStation(r.start) + ' – ' + formatStation(r.end) : 'stations not set'),
          pp: g.entries.reduce((a, r) => a + roadPP(st, sub, r).count, 0), sheets: sheetsOfGroup(sub, sec, g).map((sh) => ({ sh, range: sheetRange(sh) })) })) : [];
        return { sec, pp, total: sec.sheets.length, done: p.done, pct: p.pct, ppTotal: pp ? segPP(st, sub, sec).total : 0, roads, other: (pp ? otherSheets(sub, sec) : sec.sheets).map((sh) => ({ sh, range: sheetRange(sh) })) };
      }) })) }));
    const lab = (ref) => refLabel(st, ref);
    const deps = { blocked: F.blocked.map((x) => ({ item: lab(x.ref), by: x.by.map(lab) })), update: F.update.map((x) => ({ item: lab(x.ref), from: x.from.map(lab) })), ready: F.ready.map((x) => lab(x.ref)) };
    const recent = recentChanges(st, 12).map((c) => ({ t: c.t, msg: c.msg, item: lab(c.ref) }));
    return { today, meta: reportMeta(st), R, tree, deps, workload, recent, N: narrative(st, today) };
  }
  /* v3.4 bullet outline of the printed report (derived only; the data model is unchanged) */
  function reportOutline(st, today) {
    today = today || todayISO();
    const P = printReport(st, today), R = P.R, all = allSheets(st), F = flags(st);
    const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const pairLab = (ref) => { const r = resolve(st, ref); if (!r) return '(missing)'; return subTag(r.sub) + ' / ' + (r.t === 'sheet' ? (r.sh.number ? '#' + r.sh.number + ' ' : '') + r.sh.title : r.t === 'road' ? r.seg.title + ' · ' + r.name : r.seg.title); };
    const shLab = (x) => subTag(x.sub) + ' / ' + (x.sh.number ? '#' + x.sh.number + ' ' : '') + x.sh.title;
    const updSet = new Set(F.update.map((x) => rk(x.ref)));
    const secState = (sec) => { const p = progress(sec.sheets); return !sec.sheets.length || !p.done && !sec.sheets.some((x) => x.status !== 'Not started') ? 'Not started' : p.done === sec.sheets.length ? 'Done' : 'In progress'; };
    const secNeedsUpd = (sec) => updSet.has(rk({ t: 'seg', id: sec.id })) || sec.sheets.some((x) => updSet.has(rk({ t: 'sheet', id: x.id })));
    const GROUPS = ['Done', 'In progress', 'Not started', 'Needs update'];
    const groupSecs = (secs) => { const g = Object.fromEntries(GROUPS.map((k) => [k, []])); for (const x of secs) { const lab = x.sec.title + (x.total ? ' (' + x.done + '/' + x.total + ')' : ''); g[secState(x.sec)].push(lab); if (secNeedsUpd(x.sec)) g['Needs update'].push(x.sec.title); } return g; };
    const nextDue = (rows) => rows.filter((x) => x.sh.due && x.sh.status !== 'Done' && x.sh.due >= today).sort((a, b) => a.sh.due < b.sh.due ? -1 : 1).slice(0, 3).map((x) => x.sh.due + ' — ' + shLab(x));
    const facts = (S, rows, extra) => { const c = Object.fromEntries(STATUSES.map((k) => [k, rows.filter((x) => x.sh.status === k).length])); const od = rows.filter((x) => isOverdue(x.sh, today)).length, bl = rows.filter((x) => F.blocked.some((b) => b.ref.t === 'sheet' && b.ref.id === x.sh.id)).length, nu = rows.filter((x) => updSet.has(rk({ t: 'sheet', id: x.sh.id }))).length;
      const nd = nextDue(rows);
      return [Math.round(S.pct) + '% complete — ' + S.done + ' of ' + pl(S.total, 'sheet') + ' done', 'Status: ' + STATUSES.map((k) => c[k] + ' ' + k.toLowerCase()).join(' · '), extra != null ? 'PP sheets: ' + extra : null,
        nd.length ? 'Next due: ' + nd.join('; ') : 'Next due: none scheduled', od ? pl(od, 'overdue sheet') : null, bl ? pl(bl, 'blocked sheet') : null, nu ? pl(nu, 'sheet') + ' flagged needs update' : null].filter(Boolean); };
    const branches = P.tree.map((T) => { const rows = all.filter((x) => x.sh.discipline === T.disc), N = P.N.discs.find((d) => d.disc === T.disc);
      const allSecs = T.subs.flatMap((S) => S.secs);
      return { disc: T.disc, lead: String(N ? N.text : '').split(/(?<=\.)\s/)[0], facts: facts(T.stats, rows, R.pp.byDisc[T.disc]), groups: Object.fromEntries(Object.entries(groupSecs(allSecs)).map(([k, v]) => [k, v.length])), note: N && N.note,
        subs: T.subs.map((S) => { const r2 = rows.filter((x) => x.sub === S.sub), n2 = N && N.subs.find((y) => y.sub === S.sub);
          return { sub: S.sub, lead: String(n2 ? n2.text.replace(/^[^—]*— \w+: /, '') : '').split(/(?<=\.)\s/)[0], facts: facts(S.stats, r2, S.stats.pp || 0), groups: groupSecs(S.secs), note: n2 && n2.note,
            roads: S.secs.filter((x) => x.pp).flatMap((x) => x.roads.map((g) => ({ sec: x.sec.title, name: g.name, spans: g.spans, pp: g.pp,
              scale: [...new Set(g.sheets.map((y) => sheetScale(st, S.sub, y.sh)).filter(Boolean))].map((v) => '1" = ' + v + "'").join(', '),
              sheets: g.sheets.map((y) => ({ label: y.sh.gen ? 'PP ' + y.sh.gen.idx : y.sh.title, number: y.sh.number || '', range: y.range ? formatStation(y.range.start) + ' – ' + formatStation(y.range.end) + (y.range.manual ? ' *' : '') : 'stations not set', status: y.sh.status })) }))) }; }) }; });
    /* attention */
    const unassigned = all.filter((x) => !x.sh.owner && x.sh.status !== 'Done');
    const attention = [];
    if (R.overdue.length) attention.push({ kind: 'overdue', text: pl(R.overdue.length, 'sheet') + ' overdue', items: R.overdue.slice(0, 8).map((x) => shLab(x) + ' — due ' + x.sh.due + (x.sh.owner ? ' (' + x.sh.owner + ')' : '')) });
    if (R.due7.length) attention.push({ kind: 'due7', text: pl(R.due7.length, 'sheet') + ' due within 7 days', items: R.due7.slice(0, 8).map((x) => shLab(x) + ' — due ' + x.sh.due + (x.sh.owner ? ' (' + x.sh.owner + ')' : '')) });
    if (F.blocked.length) attention.push({ kind: 'blocked', text: pl(F.blocked.length, 'dependency conflict') + ' (waiting on unfinished work)', items: F.blocked.slice(0, 8).map((x) => pairLab(x.ref) + ' waits on ' + x.by.map(pairLab).join(', ')) });
    if (F.update.length) attention.push({ kind: 'update', text: pl(F.update.length, 'item') + ' flagged needs update', items: F.update.slice(0, 8).map((x) => pairLab(x.ref) + ' — changed upstream: ' + x.from.map(pairLab).join(', ')) });
    if (unassigned.length) attention.push({ kind: 'unassigned', text: pl(unassigned.length, 'open sheet') + ' unassigned', items: unassigned.slice(0, 8).map(shLab) });
    const late = R.milestones.filter((m) => m.late); if (late.length) attention.push({ kind: 'milestone', text: pl(late.length, 'milestone') + ' past date and not complete', items: late.map((m) => m.m.name + ' — ' + m.m.date + ' (' + Math.round(m.pct) + '%)') });
    const takeaways = [Math.round(R.overall.pct) + '% complete overall (' + R.overall.done + ' of ' + pl(R.overall.total, 'sheet') + ' done)', R.pp.total + ' PP sheets — Drainage ' + R.pp.byDisc.Drainage + ', SWP3 ' + R.pp.byDisc.SWP3].concat(branches.map((b) => b.disc + ': ' + b.facts[0]));
    /* next steps */
    const next = [];
    R.overdue.slice(0, 3).forEach((x) => next.push('Finish ' + shLab(x) + ' (overdue since ' + x.sh.due + ')' + (x.sh.owner ? ' — ' + x.sh.owner : '')));
    F.update.slice(0, 3).forEach((x) => next.push('Revise ' + pairLab(x.ref) + ' for the change in ' + x.from.map(pairLab).join(', ')));
    R.due7.slice(0, 3).forEach((x) => next.push('Complete ' + shLab(x) + ' by ' + x.sh.due + (x.sh.owner ? ' — ' + x.sh.owner : '')));
    F.ready.slice(0, 3).forEach((x) => next.push('Start ' + pairLab(x.ref) + ' (its dependencies are done)'));
    if (unassigned.length) next.push('Assign owners to ' + pl(unassigned.length, 'open sheet'));
    const upm = R.milestones.filter((m) => !m.late && m.pct < 100 && m.m.date).sort((a, b) => a.m.date < b.m.date ? -1 : 1)[0]; if (upm) next.push('Next milestone: ' + upm.m.name + ' on ' + upm.m.date + ' (' + Math.round(upm.pct) + '% of its sheets done)');
    if (!next.length) next.push(R.overall.total && R.overall.done === R.overall.total ? 'All sheets are done — prepare the submittal.' : 'Set due dates and owners so the next steps can be listed.');
    /* dependency pairs */
    const deps = [];
    for (const ref of allRefs(st)) for (const l of linksOf(st, ref).in) if (l.kind === 'dep') deps.push({ text: pairLab(ref) + ' depends on ' + pairLab(l.src), done: isDone(st, l.src), update: revCount(st, l.src) > (l.ack || 0) });
    /* workload bullets */
    const work = P.workload.map((w) => { const mine = all.filter((x) => (x.sh.owner || 'Unassigned') === w.owner && x.sh.status !== 'Done');
      return { owner: w.owner, open: w.open, bullets: [w.open + ' open of ' + w.total, w.overdue ? pl(w.overdue, 'overdue') : null, w.due7 ? w.due7 + ' due in 7 days' : null, nextDue(mine)[0] ? 'Next: ' + nextDue(mine)[0] : null].filter(Boolean) }; });
    return { today, takeaways, attention, next, branches, deps, work, GROUPS };
  }
  function narrativeText(st, today) {
    const N = narrative(st, today), L = [(st.project.name || 'Project') + ' — status summary as of ' + N.today, '', N.project];
    if (N.note) L.push('Notes: ' + N.note);
    for (const D of N.discs) {
      L.push('', D.disc.toUpperCase(), D.text); if (D.note) L.push('Notes: ' + D.note);
      for (const x of D.subs) {
        L.push('', '  ' + subLabel(x.sub), '  ' + x.text); if (x.note) L.push('  Notes: ' + x.note);
        for (const s of x.secs) { if (s.text) L.push('    – ' + s.text); if (s.note) L.push('      ' + s.sec.title + ' notes: ' + s.note); }
      }
    }
    return L.join('\n') + '\n';
  }
  function setReportNote(st, key, text) {
    if (!/^(project|dtop:(Drainage|SWP3)|sub:[^:]+|sec:[^:]+|disc:[^:]+:(Drainage|SWP3))$/.test(key)) throw new Error('Bad note key');
    const v = String(text || '').trim(); if (v) st.reportNotes[key] = v; else delete st.reportNotes[key];
  }
  /* ---- v2.20 / v3 CSV import / export ---- */
  const CSV_FIELDS = [
    ['sub', 'Sub-project', ['sub', 'subproject', 'sub-project', 'sub project', 'project part', 'part']],
    ['discipline', 'Discipline', ['discipline', 'disc', 'type', 'branch']],
    ['section', 'Section', ['section', 'drainage section', 'sheet group', 'group', 'category']],
    ['road', 'Road', ['road', 'road name', 'roadway', 'street', 'segment', 'route']],
    ['start', 'Start station', ['start', 'start station', 'begin', 'begin station', 'from', 'from station', 'sta start', 'start sta']],
    ['end', 'End station', ['end', 'end station', 'to', 'to station', 'sta end', 'end sta', 'stop']],
    ['scale', 'Scale', ['scale', 'plan scale', 'horizontal scale']],
    ['title', 'Sheet title', ['sheet title', 'sheet', 'title', 'sheet name', 'name', 'description']],
    ['series', 'Series', ['series', 'pp series']],
    ['ppidx', 'PP index', ['pp index', 'pp #', 'pp no', 'pp number']],
    ['number', 'Sheet number', ['sheet number', 'sheet no', 'sheet #', 'number', 'no', '#']],
    ['status', 'Status', ['status', 'state']],
    ['owner', 'Owner', ['owner', 'assigned to', 'assignee', 'designer', 'engineer']],
    ['due', 'Due date', ['due', 'due date', 'deadline', 'date']],
    ['notes', 'Notes', ['notes', 'note', 'comments', 'comment', 'remarks']],
    ['depends', 'Depends on', ['depends on', 'depends', 'prerequisite', 'prerequisites', 'after']],
    ['sstart', 'Sheet start station', ['sheet start station', 'sheet start', 'sheet from', 'sheet sta start']],
    ['send', 'Sheet end station', ['sheet end station', 'sheet end', 'sheet to', 'sheet sta end']],
  ];
  function parseCSV(text) {
    let t = String(text || '').replace(/^\uFEFF/, '');
    const first = t.split(/\r?\n/)[0] || '';
    const count = (c) => { let n = 0, q = false; for (const ch of first) { if (ch === '"') q = !q; else if (ch === c && !q) n++; } return n; };
    const delim = ['\t', ';', ','].map((c) => [c, count(c)]).sort((a, b) => b[1] - a[1])[0];
    const D = delim[1] ? delim[0] : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"' && cell === '') q = true;
      else if (ch === D) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return { delim: D, rows: rows.filter((r) => r.some((c) => String(c).trim() !== '')).map((r) => r.map((c) => String(c).trim().replace(/^'(?=[=+\-@])/, ''))) };
  }
  function detectMapping(header) {
    const norm = (x) => String(x || '').toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
    const H = header.map(norm), map = {}, used = new Set();
    for (const [k, , al] of CSV_FIELDS) { const i = H.findIndex((h, j) => !used.has(j) && al.includes(h)); if (i >= 0) { map[k] = i; used.add(i); } }
    for (const [k, , al] of CSV_FIELDS) if (!(k in map)) { const i = H.findIndex((h, j) => !used.has(j) && !(/^sheet (start|end|from|to)/.test(h) && k !== 'sstart' && k !== 'send') && al.some((a) => a.length > 3 && h.includes(a))); if (i >= 0) { map[k] = i; used.add(i); } }
    return map;
  }
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function parseDate(s) {
    const t = String(s || '').trim(); if (!t) return '';
    const p2 = (n) => String(n).padStart(2, '0');
    const ok = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? y + '-' + p2(m) + '-' + p2(d) : null; };
    let m;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(t))) return ok(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) { let y = +m[3]; if (y < 100) y += 2000; return ok(y, +m[1], +m[2]); }
    if ((m = /^(\d{1,2})[ -]([a-z]{3})[a-z]*\.?[ ,-]*(\d{4})$/i.exec(t))) { const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; return mo ? ok(+m[3], mo, +m[1]) : null; }
    if ((m = /^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/i.exec(t))) { const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; return mo ? ok(+m[3], mo, +m[2]) : null; }
    if (/^\d{5}$/.test(t) && +t > 30000 && +t < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + +t * 864e5); return d.toISOString().slice(0, 10); } /* Excel serial */
    return null;
  }
  function normStatus(s) {
    const t = String(s || '').trim().toLowerCase().replace(/[_-]+/g, ' '); if (!t) return '';
    const m = { 'not started': 'Not started', 'todo': 'Not started', 'to do': 'Not started', 'new': 'Not started', 'in progress': 'In progress', 'wip': 'In progress', 'started': 'In progress', 'in review': 'In review', 'review': 'In review', 'qc': 'In review', 'done': 'Done', 'complete': 'Done', 'completed': 'Done', 'final': 'Done' };
    return m[t] || null;
  }
  function normDisc(s) { const t = String(s || '').trim().toLowerCase(); if (!t || t === 'both' || t === 'all') return ''; if (/^(dr|drain|drainage|hydraulics?)$/.test(t)) return 'Drainage'; if (/^(sw|swp3|swppp|erosion|esc)$/.test(t)) return 'SWP3'; return null; }
  function normScale(s) { const t = String(s == null ? '' : s).trim(); if (!t) return null; const m = /^(?:1"?\s*=\s*)?(\d+(?:\.\d+)?)\s*'?$/.exec(t); return m && +m[1] > 0 ? +m[1] : NaN; }
  function findSecDef(st, txt, disc) {
    const t = String(txt || '').trim().toLowerCase(); if (!t) return null;
    const L = st.settings.sections.filter((d) => !disc || d.discipline === disc);
    const norm = (x) => x.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    return L.find((d) => d.key === t || d.title.toLowerCase() === t) || L.find((d) => norm(d.title) === norm(t)) || L.find((d) => norm(d.title).includes(norm(t)) && norm(t).length > 3) || null;
  }
  /* plan an import. Row kinds: road (road, no sheet title → a road entry in a Plan & Profile section), pp (series + PP index), sheet (title).
     opts: { mode: 'merge'|'new', defaults: bool (road rows also add the standard sheet set + PP) }. Old v2 road-based CSVs import as is. */
  function planCSV(st, rows, map, opts) {
    opts = opts || {}; const mode = opts.mode === 'new' ? 'new' : 'merge';
    const get = (r, k) => (k in map && map[k] != null && map[k] !== '' ? String(r[map[k]] == null ? '' : r[map[k]]).trim() : '');
    const items = [], groups = new Map(), nums = new Map(), sheetKeys = new Set();
    for (const sh of allSheets(st)) if (sh.sh.number) nums.set(String(sh.sh.number), 'existing ' + subTag(sh.sub) + ' · ' + sh.sh.title);
    const ppDefault = (disc) => (secDefs(st, disc).find((d) => d.key === (disc === 'SWP3' ? 'sw-layout' : 'dr-pp')) || secDefs(st, disc).find((d) => d.series) || null);
    rows.forEach((r, i) => {
      const it = { line: i + 1, errors: [], warns: [], raw: r };
      const subTxt = get(r, 'sub');
      const sub = subTxt ? st.subs.find((x) => x.code.toLowerCase() === subTxt.toLowerCase() || subName(x).toLowerCase() === subTxt.toLowerCase() || ('sub-project ' + x.code).toLowerCase() === subTxt.toLowerCase()) : st.subs[0];
      if (!sub) it.errors.push('Unknown sub-project “' + subTxt + '” (use A–D).');
      const road = get(r, 'road');
      const sa = get(r, 'start'), sb = get(r, 'end');
      const a = sa ? parseStation(sa) : null, b = sb ? parseStation(sb) : null;
      if (sa && !Number.isFinite(a)) it.errors.push('Bad start station “' + sa + '”.');
      if (sb && !Number.isFinite(b)) it.errors.push('Bad end station “' + sb + '”.');
      if (!!sa !== !!sb) it.errors.push('Give both stations or neither.');
      if (Number.isFinite(a) && Number.isFinite(b) && b <= a) it.errors.push('End station must be after start.');
      const scale = normScale(get(r, 'scale')); if (Number.isNaN(scale)) it.errors.push('Bad scale “' + get(r, 'scale') + '”.');
      let disc = normDisc(get(r, 'discipline')); if (disc === null) { it.errors.push('Discipline must be Drainage, SWP3 or Both.'); disc = ''; }
      const status = normStatus(get(r, 'status')); if (status === null) it.errors.push('Unknown status “' + get(r, 'status') + '”.');
      const due = parseDate(get(r, 'due')); if (due === null) it.errors.push('Bad due date “' + get(r, 'due') + '”.');
      const ssa = get(r, 'sstart'), ssb = get(r, 'send');
      const sa2 = ssa ? parseStation(ssa) : null, sb2 = ssb ? parseStation(ssb) : null;
      if (ssa && !Number.isFinite(sa2)) it.errors.push('Bad sheet start station “' + ssa + '”.');
      if (ssb && !Number.isFinite(sb2)) it.errors.push('Bad sheet end station “' + ssb + '”.');
      if (!!ssa !== !!ssb) it.errors.push('Give both sheet stations or neither.');
      if (Number.isFinite(sa2) && Number.isFinite(sb2) && sb2 <= sa2) it.errors.push('Sheet end station must be after its start.');
      const title = get(r, 'title'), series = get(r, 'series'), ppidx = parseInt(get(r, 'ppidx'), 10), secTxt = get(r, 'section');
      let sdef = secTxt ? findSecDef(st, secTxt, disc || null) || findSecDef(st, secTxt) : null;
      if (secTxt && !sdef) it.errors.push('Unknown section “' + secTxt + '”.');
      const serDef = series ? st.settings.sections.find((d) => d.series === series) || secDef(st, SERIES_SEC[series] || '') : null;
      const isPP = !!serDef && ppidx > 0;
      it.kind = isPP ? 'pp' : title ? 'sheet' : 'road';
      let targets = [];
      if (it.kind === 'pp') { sdef = sdef && sdef.series ? sdef : serDef; targets = [sdef]; if (!road) it.errors.push('PP rows need the road name.'); if (!Number.isFinite(a)) it.errors.push('PP rows need the road stations.'); }
      else if (it.kind === 'road') {
        if (!road) it.errors.push('Row needs a road name or a sheet title.');
        if (sdef && !sdef.series) it.errors.push('Section “' + sdef.title + '” has no road entries — use a Plan & Profile section.');
        targets = sdef ? [sdef] : (disc ? [disc] : DISCIPLINES).map(ppDefault).filter(Boolean);
      } else {
        const key = sdef ? sdef.key : mapSection(st, title, disc || guessDiscipline(title, series));
        sdef = secDef(st, key) || { key, title: OTHER[/^sw-/.test(key) ? 'SWP3' : 'Drainage'][1], discipline: /^sw-/.test(key) ? 'SWP3' : 'Drainage', series: null, pending: true };
        if (disc && sdef.discipline !== disc) it.warns.push('Section “' + sdef.title + '” is ' + sdef.discipline + '; the sheet goes there.');
        if (!secTxt) it.warns.push('→ section “' + sdef.title + '”.');
        targets = [sdef];
      }
      it.f = { sub, road, start: a, end: b, scale, disc, status, due, title, series, ppidx, number: get(r, 'number'), owner: get(r, 'owner'), notes: get(r, 'notes'), depends: get(r, 'depends'), sheetStart: Number.isFinite(sa2) ? sa2 : null, sheetEnd: Number.isFinite(sb2) ? sb2 : null, sec: targets[0] || null };
      if (it.f.number && it.kind !== 'road') { if (nums.has(it.f.number)) it.warns.push('Duplicate sheet number ' + it.f.number + ' (also ' + nums.get(it.f.number) + ').'); else nums.set(it.f.number, 'row ' + it.line); }
      if (!it.errors.length && it.kind === 'sheet') {
        const sk = sub.id + '|' + sdef.key + '|' + title.toLowerCase();
        const exSec = secOf(sub, sdef.key);
        if (mode === 'merge' && exSec && exSec.sheets.some((q) => q.title.toLowerCase() === title.toLowerCase())) { it.warns.push('Sheet “' + title + '” already in ' + subTag(sub) + ' · ' + sdef.title + ' — kept as is (not overwritten).'); it.skip = true; }
        sheetKeys.add(sk);
      }
      if (!it.errors.length && it.kind !== 'sheet') {
        it.groups = [];
        for (const sd of targets) {
          const key = sub.id + '|' + sd.key + '|' + road.toLowerCase() + '|' + a + '|' + b;
          let g = groups.get(key);
          if (!g) {
            const exSec = secOf(sub, sd.key);
            const ex = exSec ? sub.roads.find((x) => x.sec === exSec.id && String(x.road).toLowerCase() === road.toLowerCase() && (Number.isFinite(a) ? Math.abs(x.start - a) < 0.01 && Math.abs(x.end - b) < 0.01 : !hasSta(x))) : null;
            g = { key, sub, sdef: sd, road, start: a, end: b, scale, existing: mode === 'merge' ? ex || null : null, rows: [] };
            g.warns = Number.isFinite(a) ? overlaps({ id: g.existing ? g.existing.id : '_', road, start: a, end: b, secKey: sd.key }, roadsInKey(st, sd.key).concat([...groups.values()].filter((x) => !x.existing && x.sdef.key === sd.key && Number.isFinite(x.start)).map((x) => ({ id: x.key, road: x.road, start: x.start, end: x.end, secKey: sd.key, name: x.road + ' ' + formatStation(x.start) + '–' + formatStation(x.end) })))).map((o) => 'Overlaps ' + o.name + '.') : [];
            groups.set(key, g);
          }
          it.groups.push(g); g.rows.push(it); if (g.rows.length === 1) it.warns.push(...g.warns);
          if (g.existing && it.kind === 'road' && scale != null && g.existing.scale !== scale) it.warns.push('Existing road keeps its scale (' + (g.existing.scale || sub.scale) + '); not overwritten.');
        }
        it.group = it.groups[0];
      }
      items.push(it);
    });
    const G = [...groups.values()];
    const summary = { rows: items.length, errors: items.filter((x) => x.errors.length).length, warnings: items.filter((x) => x.warns.length).length,
      newRoads: G.filter((g) => !g.existing).length, mergedRoads: G.filter((g) => g.existing).length,
      sheets: items.filter((x) => !x.errors.length && !x.skip && x.kind === 'sheet').length, ppRows: items.filter((x) => !x.errors.length && x.kind === 'pp').length,
      skipped: items.filter((x) => x.skip).length };
    return { items, groups: G, summary, opts: { mode, defaults: !!opts.defaults } };
  }
  function applyCSV(st, plan, opts) {
    const bad = plan.items.filter((x) => x.errors.length);
    if (bad.length && !(opts && opts.skipBad)) throw new Error(bad.length + ' row(s) have errors. Fix them or choose “Skip rows with errors”.');
    const L0 = st.log.slice(), made = { roads: 0, sheets: 0, pp: 0, links: 0 }, touched = [];
    const pre = new Set(allSheets(st).map((r) => r.sh.id));
    /* standard set once per sub-project + discipline that has road rows */
    if (plan.opts.defaults) {
      const done = new Set();
      for (const x of plan.items.filter((y) => !y.errors.length && y.kind === 'road')) for (const g of x.groups) {
        const k = g.sub.id + '|' + g.sdef.discipline; if (done.has(k)) continue; done.add(k);
        made.sheets += addStandardSet(st, g.sub.id, { discipline: g.sdef.discipline }).length;
      }
    }
    const roadOf = new Map();
    for (const g of plan.groups) {
      const rows = g.rows.filter((x) => !x.errors.length); if (!rows.length) continue;
      let road = g.existing;
      if (!road) { const sec = secOf(g.sub, g.sdef.key); road = addRoad(st, sec.id, { road: g.road, start: g.start, end: g.end, scale: g.scale || undefined, notes: (rows.find((x) => x.kind === 'road') || {}).f ? rows.find((x) => x.kind === 'road').f.notes : '' }).road; made.roads++; }
      roadOf.set(g, road);
      const wantPP = hasSta(road) && (rows.some((x) => x.kind === 'pp') || (plan.opts.defaults && rows.some((x) => x.kind === 'road')));
      if (wantPP) { const p = planGenerate(st, road.id); applyGenerate(st, road.id, p, { removeTouched: false, quiet: true }); made.pp += p.create.length; }
    }
    for (const x of plan.items.filter((y) => !y.errors.length)) {
      const f = x.f, fields = {};
      if (f.status) fields.status = f.status; if (f.owner) fields.owner = f.owner; if (f.due) fields.due = f.due; if (f.notes) fields.notes = f.notes; if (f.number) fields.number = f.number;
      let sh = null, sec = null;
      if (x.kind === 'pp') { const road = roadOf.get(x.group); sec = road && findRoad(st, road.id).sec; sh = sec && sec.sheets.find((q) => q.gen && q.gen.road === road.id && q.gen.idx === f.ppidx); if (sh && Object.keys(fields).length) updateSheet(st, sh.id, fields); }
      else if (x.kind === 'sheet' && !x.skip) {
        ensureSection(st, f.sec.key); sec = secOf(f.sub, f.sec.key);
        sh = sec.sheets.find((q) => !pre.has(q.id) && !q.gen && q.title.toLowerCase() === f.title.toLowerCase());
        if (sh) { if (Object.keys(fields).length) updateSheet(st, sh.id, fields); if (f.road) sh.road = f.road; }
        else { sh = addSheet(st, sec.id, Object.assign({ title: f.title, series: f.series, road: f.road }, fields)); if (fields.status || fields.number) updateSheet(st, sh.id, fields); made.sheets++; }
      }
      if (sh && f.sheetStart != null) { const c = computedRange(sh); if (!c || Math.abs(c.start - f.sheetStart) > 0.005 || Math.abs(c.end - f.sheetEnd) > 0.005) setSheetRange(st, sh.id, f.sheetStart, f.sheetEnd); }
      if (sh) { touched.push({ sh, sub: f.sub, seg: sec, depends: f.depends }); if (f.owner) addStaff(st, f.owner); }
    }
    const pool = touched.slice();
    for (const sub of new Set(touched.map((x) => x.sub))) for (const seg of sub.segments) for (const q of seg.sheets) if (!pool.some((y) => y.sh === q)) pool.push({ sh: q, sub, seg });
    for (const x of touched) if (x.depends) for (const name of x.depends.split(/[;|]/).map((q) => q.trim().toLowerCase()).filter(Boolean)) {
      const cand = pool.filter((y) => y.sh.title.toLowerCase() === name).sort((p, q) => (p.seg === x.seg ? 0 : p.sub === x.sub ? 1 : 2) - (q.seg === x.seg ? 0 : q.sub === x.sub ? 1 : 2))[0];
      if (cand && cand.sh !== x.sh) { try { addLink(st, { t: 'sheet', id: cand.sh.id }, { t: 'sheet', id: x.sh.id }, 'dep'); made.links++; } catch (e) { /* duplicate / cycle: skip */ } }
    }
    st.log = L0; log(st, 'CSV import: ' + made.roads + ' new roads, ' + made.sheets + ' sheets, ' + made.pp + ' PP sheets, ' + made.links + ' links' + (bad.length ? ', ' + bad.length + ' rows skipped' : ''));
    return made;
  }
  function csvLine(a) { return a.map(csvCell).join(','); }
  const CSV_HEAD = ['Sub-project', 'Discipline', 'Section', 'Road', 'Start station', 'End station', 'Scale', 'Sheet title', 'Series', 'PP index', 'Sheet number', 'Status', 'Owner', 'Due date', 'Notes', 'Depends on', 'Sheet start station', 'Sheet end station'];
  function exportImportCSV(st) {
    const L = [csvLine(CSV_HEAD)];
    const deps = (sh) => linksOf(st, { t: 'sheet', id: sh.id }).in.filter((l) => l.kind === 'dep' && l.src.t === 'sheet').map((l) => { const r = resolve(st, l.src); return r ? r.sh.title : ''; }).filter(Boolean).join('; ');
    for (const sub of st.subs) for (const sec of sub.segments) {
      const rs = roadsOf(sub, sec), byId = new Map(rs.map((r) => [r.id, r]));
      for (const g of rs) L.push(csvLine([subTag(sub), sec.discipline, sec.title, g.road, formatStation(g.start), formatStation(g.end), g.scale == null ? '' : g.scale, '', '', '', '', '', '', '', g.notes || '', '', '', '']));
      for (const sh of sec.sheets) {
        const g = sh.gen && byId.get(sh.gen.road), rg = sheetRange(sh), rs2 = rg ? [formatStation(rg.start), formatStation(rg.end)] : ['', ''];
        if (g) L.push(csvLine([subTag(sub), sec.discipline, sec.title, g.road, formatStation(g.start), formatStation(g.end), g.scale == null ? '' : g.scale, '', sh.gen.series, sh.gen.idx, sh.number || '', sh.status, sh.owner || '', sh.due || '', sh.notes || '', deps(sh)].concat(rs2)));
        else L.push(csvLine([subTag(sub), sec.discipline, sec.title, sh.road || '', '', '', '', sh.title, sh.gen ? '' : sh.series || '', '', sh.number || '', sh.status, sh.owner || '', sh.due || '', sh.notes || '', deps(sh)].concat(rs2)));
      }
    }
    return '\uFEFF' + L.join('\r\n') + '\r\n';
  }
  function csvTemplate() {
    return '\uFEFF' + [csvLine(CSV_HEAD),
      csvLine(['A', 'Drainage', 'Drainage Plan & Profile', 'FM 1960', '10+00', '34+00', '100', '', '', '', '', '', '', '', 'Road row: a road entry; PP sheets are counted from its stations', '']),
      csvLine(['A', 'Drainage', 'Trunkline Plan & Profile', 'FM 1960', '', '', '', '', '', '', '', '', '', '', 'Road name only is fine — add stations later', '']),
      csvLine(['A', 'Drainage', 'Hydraulic Data Sheet - Crossing', 'FM 1960', '', '', '', 'Culvert Hydraulics Sta 22+40', '', '', '72', 'In progress', 'Ana Ruiz', '11/15/2026', 'Sheet row; Road is optional (a tag)', '']),
      csvLine(['A', 'Drainage', 'Drainage Area Map', '', '', '', '', 'Drainage Area Map 1 of 2', '', '', '', 'Not started', 'Ana Ruiz', '2026-11-30', '', 'Culvert Hydraulics Sta 22+40']),
      csvLine(['B', 'SWP3', 'SWP3 Layout', 'Kuykendahl Rd', '1000', '1480', '40', '', '', '', '', '', '', '', 'Stations as 1000 / 10+00 / 10+00.50 all work', '']),
      csvLine(['B', 'SWP3', '', '', '', '', '', 'SWP3 Summary & Notes', '', '', '', '', '', 'Dec 5, 2026', 'No section? It is picked from the title', ''])].join('\r\n') + '\r\n';
  }
  return { reportOutline, setReportMeta, reportMeta, printReport, rgSlug, rgKey, roadGroups, sheetRange, rangeText, sheetGroupSlug, sheetsOfGroup, otherSheets, sheetScale, computedRange, setSheetRange, resetSheetRange, rangeWarnings, syncPP, upgrade32, subName, subTag, subLabel, subCustom, checkSubName, renameSub, SCHEMA, CSV_FIELDS, CSV_HEAD, parseCSV, detectMapping, parseDate, normStatus, normDisc, normScale, findSecDef, planCSV, applyCSV, exportImportCSV, csvTemplate, narrative, narrativeText, setReportNote, recentChanges, bulkUpdate, bulkDelete, paletteSearch,
    copySegment, copyRoad: copySegment, splitSegment, splitRoad: splitSegment, touching, mergeSegments, mergeRoads: mergeSegments, allSegs, allRoads: allSegs, previewStations, setStations, shiftStations, applyStationRows, parseTSV,
    TREE_LEVELS, collapseLevel, focusBranch, report, history, weekView, DEFAULT_NUMBERING, rangeFor, suggestNumber, numberIssues, allNumberIssues, autoNumber, orderedRows, setRange, addRange, removeRange, rangeOverlaps,
    addIndexItem, updateIndexItem, removeIndexItem, moveIndexItem, planIndex, applyIndex, indexToTemplates, segLabel, roads, guessDiscipline, branchStats, discStats,
    LINK_KINDS, rk, resolve, refLabel, isDone, revCount, subOrder, orderedSubs, setOrder, wrongWay, isCross, linksOf, depPath, addLink, removeLink, pruneLinks, blockers, needsUpdate, markRevised, markUpdated, impact, allRefs, flags, depsCSV,
    STATUSES, DISCIPLINES, WEIGHT, DEFAULT_SECTIONS, DEFAULT_SCALES, DEFAULT_SERIES, DEFAULT_QC, SERIES_SEC, uid, newState, defaultSectionDefs, defaultTemplates,
    parseStation, formatStation, segLength, hasSta, validateSegment, overlaps,
    ftPerSheet, ppCount, ppRanges, segScale, seriesScale, segPP, roadPP, ppSummary, genTitle, isTouched, planGenerate, applyGenerate, planSection, generateSection, pendingCount,
    secDefs, secDef, secOf, sectionsOf, isPPSec, roadsOf, syncSections, ensureSection, mapSection, addSectionDef, renameSectionDef, moveSectionDef, removeSectionDef, setSectionPP, sectionInUse,
    findSub, findSeg, findRoad, findSheet, sheetRoad, log, addRoad, updateRoad, deleteRoad, newSheet, addSheet, moveSheet, updateSheet, deleteSheet, duplicateSheet, blockedBy,
    bulkAddTemplates, addStandardSet, addTemplate, updateTemplate, deleteTemplate, duplicateTemplate, resetTemplates, resetAllTemplates, addStaff, removeStaff,
    setScale, removeScale, addMilestone, sortMilestones, removeMilestone,
    allSheets, todayISO, addDays, isOverdue, isUpcoming, progress, summary, filterRows, sortRows, saveView, csvCell, toCSV, ppCSV,
    migrate, migrate2to3, normalize, backupFile, readBackup };
});
