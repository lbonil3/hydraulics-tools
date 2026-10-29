/* PM data model v2: pure functions, no DOM, no storage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SCHEMA = 2;
  const STATUSES = ['Not started', 'In progress', 'In review', 'Done'];
  const WEIGHT = { 'Not started': 0, 'In progress': 0.4, 'In review': 0.8, 'Done': 1 };
  const DISCIPLINES = ['Drainage', 'SWP3'];
  const DEFAULT_SCALES = [{ scale: 20, ft: 240 }, { scale: 40, ft: 480 }, { scale: 50, ft: 600 }, { scale: 100, ft: 1200 }];
  const DEFAULT_QC = ['Design check', 'Drafting check', 'QC review', 'Back-check'];
  /* v2.4 TxDOT-style PS&E sheet set (non-PP sheets). Length-based PP series (Drainage P&P, Storm Sewer P&P, SWP3 Layout) are in DEFAULT_SERIES. */
  const DEFAULT_TEMPLATES = [
    ['Drainage Area Map', 'Drainage'],
    ['Hydrologic / Hydraulic Data Sheet', 'Drainage'],
    ['Inlet / Manhole Schedule', 'Drainage'],
    ['Culvert Layout', 'Drainage'],
    ['Cross Culvert Profile', 'Drainage'],
    ['Ditch / Channel Details', 'Drainage'],
    ['Outfall / Detention / Pond Layout', 'Drainage'],
    ['Standard & Miscellaneous Drainage Details', 'Drainage'],
    ['Culvert & Storm Sewer Quantity Summary', 'Drainage'],
    ['SWP3 Summary & Notes', 'SWP3'],
    ['SWP3 Standard Details', 'SWP3'],
  ];
  /* v2.6 sheet-number ranges: key = series:<id> | tpl:<title lowercase> | disc:<discipline> (fallback) */
  const DEFAULT_NUMBERING = [
    { key: 'tpl:drainage area map', label: 'Drainage Area Map', from: 1, to: 9 },
    { key: 'series:pp-drain', label: 'Drainage Plan & Profile', from: 10, to: 49 },
    { key: 'series:pp-storm', label: 'Storm Sewer Plan & Profile', from: 50, to: 69 },
    { key: 'disc:Drainage', label: 'Other Drainage sheets', from: 70, to: 99 },
    { key: 'series:pp-swp3', label: 'SWP3 Layout', from: 100, to: 129 },
    { key: 'disc:SWP3', label: 'Other SWP3 sheets', from: 130, to: 149 },
  ];
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
  function defaultTemplates() { return DEFAULT_TEMPLATES.map(([title, discipline]) => ({ id: uid(), title, discipline })); }
  function newState(projectName) {
    return {
      schema: SCHEMA,
      project: { name: projectName || 'PSE Drainage & SWP3 Project' },
      subs: ['A', 'B', 'C', 'D'].map((code) => ({ id: uid(), code, name: 'Sub-project ' + code, order: ['A', 'B', 'C', 'D'].indexOf(code) + 1, scale: 100, templates: defaultTemplates(), segments: [] })),
      staff: [],
      index: defaultTemplates(),
      settings: { scales: clone(DEFAULT_SCALES), overlapFt: 0, qcSteps: DEFAULT_QC.slice(), series: clone(DEFAULT_SERIES), numbering: clone(DEFAULT_NUMBERING) },
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
  function segLength(seg) { const a = parseStation(seg.start), b = parseStation(seg.end); return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) * 100) / 100 : 0; }
  /* v2.3: segments have no separate name; the label is "<Road> Sta <start>–<end>" */
  function segLabel(seg) { return String(seg.road || '').trim() + ' Sta ' + formatStation(parseStation(seg.start)) + '–' + formatStation(parseStation(seg.end)); }
  function validateSegment(seg, others) {
    const errs = [];
    const a = parseStation(seg.start), b = parseStation(seg.end);
    if (!String(seg.road || '').trim()) errs.push('Road name is required.');
    if (Number.isNaN(a)) errs.push('Start station must look like 10+00, 1000 or 10+00.50.');
    if (Number.isNaN(b)) errs.push('End station must look like 25+50, 2550 or 25+50.50.');
    if (!errs.length && b <= a) errs.push('End station must be after start station.');
    if (seg.scale != null && seg.scale !== '' && !(Number(seg.scale) > 0)) errs.push('Scale must be a positive number.');
    const warns = [];
    if (!errs.length) for (const o of overlaps({ ...seg, start: a, end: b }, others || [])) {
      warns.push('Overlaps ' + o.name + ' (' + formatStation(o.start) + ' to ' + formatStation(o.end) + ')' + (o.road ? ' on ' + o.road : '') + '.');
    }
    return { errs, warns };
  }
  function overlaps(seg, others) {
    const road = String(seg.road || '').trim().toLowerCase();
    return others.filter((o) => o.id !== seg.id && String(o.road || '').trim().toLowerCase() === road &&
      Math.max(seg.start, o.start) < Math.min(seg.end, o.end));
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
  function seriesScale(sub, seg, series) { return series.scale != null && series.scale !== '' ? Number(series.scale) : segScale(sub, seg); }
  /* opts.subScale: { [subId]: scale } what-if overrides (not saved) */
  function segPP(st, sub, seg, opts) {
    const len = segLength(seg);
    const out = [];
    for (const se of st.settings.series.filter((x) => x.enabled && (!opts || !opts.discipline || x.discipline === opts.discipline))) {
      let scale = seriesScale(sub, seg, se);
      if (opts && opts.subScale && opts.subScale[sub.id] && (se.scale == null || se.scale === '') && (seg.scale == null || seg.scale === '')) scale = Number(opts.subScale[sub.id]);
      const ft = ftPerSheet(st.settings, scale);
      out.push({ series: se, scale, ft, count: ppCount(len, ft, st.settings.overlapFt) });
    }
    return { length: len, series: out, total: out.reduce((a, b) => a + (b.count || 0), 0) };
  }
  function ppSummary(st, opts) {
    const rows = [];
    const bySub = [];
    for (const sub of st.subs) {
      let subTot = 0, subLen = 0;
      const disc = {}; for (const d of DISCIPLINES) disc[d] = 0;
      for (const seg of sub.segments) {
        const p = segPP(st, sub, seg, opts);
        subTot += p.total; subLen += p.length;
        for (const s of p.series) { rows.push({ sub, seg, length: p.length, series: s.series, discipline: s.series.discipline, scale: s.scale, ft: s.ft, count: s.count }); disc[s.series.discipline] = (disc[s.series.discipline] || 0) + s.count; }
      }
      bySub.push({ sub, total: subTot, length: subLen, disc });
    }
    const byDisc = {}; for (const d of DISCIPLINES) byDisc[d] = bySub.reduce((a, b) => a + (b.disc[d] || 0), 0);
    return { rows, bySub, byDisc, total: bySub.reduce((a, b) => a + b.total, 0), length: bySub.reduce((a, b) => a + b.length, 0) };
  }
  function genTitle(series, r) {
    return series.name + ' – Sta ' + formatStation(r.start) + ' to ' + formatStation(r.end) + ' (PP ' + r.idx + ' of ' + r.of + ')';
  }
  function isTouched(sh) {
    return sh.status !== 'Not started' || !!sh.owner || !!sh.notes || (Number(sh.pct) || 0) > 0 || (Number(sh.hoursActual) || 0) > 0 ||
      Object.values(sh.qc || {}).some(Boolean) || !!(sh.gen && sh.gen.titleEdited);
  }
  /* Plan (no mutation): which generated sheets to create / update / remove for a segment. */
  /* opts.discipline: only that discipline's series (e.g. Drainage → Drainage P&P, SWP3 → SWP3 Layout); other series untouched */
  function planGenerate(st, segId, opts) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const { sub, seg } = hit;
    const plan = { create: [], update: [], remove: [], removeTouched: [], unchanged: 0 };
    const enabled = st.settings.series.filter((x) => x.enabled);
    for (const se of st.settings.series.filter((x) => !opts || !opts.discipline || x.discipline === opts.discipline)) {
      const existing = seg.sheets.filter((s) => s.gen && s.gen.series === se.id).sort((a, b) => a.gen.idx - b.gen.idx);
      let ranges = enabled.includes(se) ? ppRanges(parseStation(seg.start), parseStation(seg.end), ftPerSheet(st.settings, seriesScale(sub, seg, se)), st.settings.overlapFt) : [];
      if (seg.reverse) ranges = ranges.slice().reverse().map((r, i) => Object.assign({}, r, { idx: i + 1 })); /* v2.12: PP 1 at the high-station end */
      ranges.forEach((r, i) => {
        const title = genTitle(se, r);
        const ex = existing.find((s) => s.gen.idx === r.idx);
        if (!ex) plan.create.push({ series: se, range: r, title });
        else if (ex.gen.start !== r.start || ex.gen.end !== r.end || ex.gen.of !== r.of || (!ex.gen.titleEdited && ex.title !== title) || ex.discipline !== se.discipline) plan.update.push({ sheet: ex, series: se, range: r, title });
        else plan.unchanged++;
      });
      for (const ex of existing.filter((s) => s.gen.idx > ranges.length)) (isTouched(ex) ? plan.removeTouched : plan.remove).push(ex);
    }
    return plan;
  }
  function applyGenerate(st, segId, plan, opts) {
    const { seg } = findSeg(st, segId);
    for (const c of plan.create) {
      const sh = newSheet({ title: c.title, discipline: c.series.discipline, series: c.series.name });
      sh.gen = { series: c.series.id, idx: c.range.idx, of: c.range.of, start: c.range.start, end: c.range.end };
      seg.sheets.push(sh);
      sh.number = suggestNumber(st, sh) || c.series.id.replace('pp-', '').toUpperCase() + '-' + c.range.idx; /* v2.6: next free number in the series range */
    }
    for (const u of plan.update) {
      Object.assign(u.sheet.gen, { idx: u.range.idx, of: u.range.of, start: u.range.start, end: u.range.end });
      if (!u.sheet.gen.titleEdited) u.sheet.title = u.title;
      u.sheet.discipline = u.series.discipline;
      u.sheet.series = u.series.name;
    }
    const kill = new Set(plan.remove.concat(opts && opts.removeTouched ? plan.removeTouched : []));
    seg.sheets = seg.sheets.filter((s) => !kill.has(s));
    if (kill.size) pruneLinks(st);
    seg.sheets.sort((a, b) => (a.gen ? 0 : 1) - (b.gen ? 0 : 1) || (a.gen && b.gen ? String(a.gen.series).localeCompare(b.gen.series) || a.gen.idx - b.gen.idx : 0));
    const keptTouched = opts && opts.removeTouched ? 0 : plan.removeTouched.length;
    log(st, 'Generated PP sheets for ' + seg.name + ': +' + plan.create.length + ' new, ' + plan.update.length + ' updated, ' + kill.size + ' removed' + (keptTouched ? ', ' + keptTouched + ' edited extra kept' : ''));
    return { created: plan.create.length, updated: plan.update.length, removed: kill.size, keptTouched };
  }

  /* ---- lookups & ops ---- */
  function findSub(st, id) { return st.subs.find((s) => s.id === id); }
  function findSeg(st, id) {
    for (const sub of st.subs) for (const seg of sub.segments) if (seg.id === id) return { sub, seg };
    return null;
  }
  function findSheet(st, sheetId) {
    for (const sub of st.subs) for (const seg of sub.segments) for (const sh of seg.sheets) if (sh.id === sheetId) return { sub, seg, sh };
    return null;
  }
  function log(st, msg) {
    st.log.unshift({ t: new Date().toISOString(), msg });
    if (st.log.length > 500) st.log.length = 500;
  }
  function addSegment(st, subId, f) {
    const sub = findSub(st, subId);
    if (!sub) throw new Error('No such sub-project');
    const seg = { id: uid(), name: '', road: String(f.road || f.name || '').trim(),
      start: parseStation(f.start), end: parseStation(f.end), scale: f.scale ? Number(f.scale) : null, notes: f.notes || '', revs: [], sheets: [] };
    const v = validateSegment(seg, allSegs(st));
    if (v.errs.length) throw new Error(v.errs.join(' '));
    seg.name = segLabel(seg);
    sub.segments.push(seg);
    sub.segments.sort((x, y) => x.start - y.start);
    log(st, 'Added segment ' + sub.code + ' · ' + seg.name + ' (' + formatStation(seg.start) + '–' + formatStation(seg.end) + ')');
    return { seg, warns: v.warns };
  }
  function updateSegment(st, segId, f) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    if (!('road' in f) && f.name && !hit.seg.road) f = { ...f, road: f.name };
    const next = { ...hit.seg, ...f, start: parseStation(f.start != null ? f.start : hit.seg.start), end: parseStation(f.end != null ? f.end : hit.seg.end) };
    if ('scale' in f) next.scale = f.scale === '' || f.scale == null ? null : Number(f.scale);
    const v = validateSegment(next, allSegs(st));
    if (v.errs.length) throw new Error(v.errs.join(' '));
    next.road = String(next.road || '').trim();
    Object.assign(hit.seg, next, { name: segLabel(next) });
    hit.sub.segments.sort((x, y) => x.start - y.start);
    log(st, 'Updated segment ' + hit.sub.code + ' · ' + hit.seg.name);
    return { seg: hit.seg, warns: v.warns };
  }
  function deleteSegment(st, segId) {
    const hit = findSeg(st, segId);
    if (hit) { hit.sub.segments = hit.sub.segments.filter((s) => s !== hit.seg); pruneLinks(st); log(st, 'Deleted segment ' + hit.sub.code + ' · ' + hit.seg.name); }
    return !!hit;
  }
  function newSheet(f) {
    return { id: uid(), title: String(f.title || '').trim() || 'Untitled sheet',
      discipline: DISCIPLINES.includes(f.discipline) ? f.discipline : guessDiscipline(f.title, f.series),
      number: f.number || '', series: f.series || '',
      status: STATUSES.includes(f.status) ? f.status : 'Not started',
      owner: String(f.owner || '').trim(), due: f.due || '', pct: 0, hoursBudget: Number(f.hoursBudget) || 0, hoursActual: 0,
      milestone: f.milestone || '', notes: f.notes || '', qc: {}, revs: [], gen: null };
  }
  function addSheet(st, segId, f) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const sh = newSheet(f);
    hit.seg.sheets.push(sh);
    log(st, 'Added sheet ' + sh.title + ' to ' + hit.sub.code + ' · ' + hit.seg.name);
    return sh;
  }
  const NUMERIC = ['pct', 'hoursBudget', 'hoursActual'];
  function updateSheet(st, sheetId, f) {
    const hit = findSheet(st, sheetId);
    if (!hit) throw new Error('No such sheet');
    const sh = hit.sh;
    if ('status' in f && !STATUSES.includes(f.status)) throw new Error('Bad status');
    if ('discipline' in f && !DISCIPLINES.includes(f.discipline)) throw new Error('Bad discipline');
    const g = { ...f };
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
    const reopened = sh.status === 'Done' && 'status' in g && g.status !== 'Done';
    if ('title' in g && sh.gen && g.title !== sh.title) sh.gen.titleEdited = true;
    if (g.status === 'Done' && !('pct' in g)) g.pct = 100;
    if ('pct' in g && g.pct === 100 && !('status' in g) && sh.status !== 'Done') g.status = 'Done';
    const changed = Object.keys(g).filter((k) => JSON.stringify(sh[k]) !== JSON.stringify(g[k]));
    Object.assign(sh, g);
    if (sh.owner) addStaff(st, sh.owner);
    if (reopened) markRevised(st, { t: 'sheet', id: sh.id }, 'Re-opened (was Done)');
    if (changed.length) log(st, sh.title + ': ' + changed.map((k) => k + (['notes', 'qc'].includes(k) ? '' : ' → ' + (g[k] === '' ? '(blank)' : g[k]))).join(', '));
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
    log(st, 'Duplicated sheet ' + hit.sh.title);
    return copy;
  }
  function blockedBy(st, sh) { return blockers(st, { t: 'sheet', id: sh.id }).map((r) => resolve(st, r)).filter(Boolean).map((r) => r.obj); }
  function bulkAddTemplates(st, segId, opts) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const have = new Set(hit.seg.sheets.map((s) => s.title.toLowerCase()));
    const disc = opts && opts.discipline;
    const added = [];
    for (const t of hit.sub.templates) {
      if (disc && t.discipline !== disc) continue;
      if (have.has(t.title.toLowerCase())) continue;
      const sh = newSheet({ title: t.title, discipline: t.discipline, owner: opts && opts.owner, due: opts && opts.due, milestone: opts && opts.milestone });
      hit.seg.sheets.push(sh);
      have.add(t.title.toLowerCase());
      added.push(sh);
    }
    if (opts && opts.owner) addStaff(st, opts.owner);
    if (added.length) log(st, 'Added ' + added.length + ' standard sheets to ' + hit.sub.code + ' · ' + hit.seg.name);
    return added;
  }
  /* templates */
  function addTemplate(st, subId, f) {
    const sub = findSub(st, subId);
    const t = { id: uid(), title: String(f.title || '').trim() || 'Untitled sheet', discipline: DISCIPLINES.includes(f.discipline) ? f.discipline : 'Drainage' };
    sub.templates.push(t);
    return t;
  }
  function updateTemplate(st, subId, tid, f) {
    const t = findSub(st, subId).templates.find((x) => x.id === tid);
    if (f.title != null) t.title = String(f.title).trim() || t.title;
    if (DISCIPLINES.includes(f.discipline)) t.discipline = f.discipline;
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
  function resetTemplates(st, subId) { const sub = findSub(st, subId); sub.templates = defaultTemplates(); log(st, sub.code + ' sheet templates reset to defaults'); }
  function resetAllTemplates(st) { for (const sub of st.subs) sub.templates = defaultTemplates(); log(st, 'All sheet templates reset to defaults'); }
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
      /* % complete, when entered, refines the status weight for unfinished sheets */
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
    return { overall: progress(rows.map((r) => r.sh)), subs, overdue, upcoming, milestones,
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
        const hay = [r.sh.title, r.sh.number, r.sh.series, r.sh.owner, r.sh.notes, r.sh.status, r.sh.discipline, r.seg.name, r.seg.road, r.sub.code, r.sub.name].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  /* flag filters need the state: pass it as f.st (non-enumerable-safe) */
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
    const head = ['Sub-project', 'Segment', 'Road', 'Seg Start', 'Seg End', 'Sheet No', 'Sheet', 'Series', 'Discipline', 'Sheet Sta From', 'Sheet Sta To', 'Status', '% Complete', 'Owner', 'Due', 'Milestone', 'Hours Budget', 'Hours Actual', 'QC Done', 'Depends On', 'Generated', 'Notes'];
    const lines = [head.join(',')];
    for (const r of rows) {
      const sh = r.sh;
      const qcDone = st.settings.qcSteps.filter((q) => sh.qc && sh.qc[q]).length + '/' + st.settings.qcSteps.length;
      const deps = linksOf(st, { t: 'sheet', id: sh.id }).in.filter((l) => l.kind === 'dep').map((l) => refLabel(st, l.src)).join('; ');
      lines.push([r.sub.code, r.seg.name, r.seg.road, formatStation(r.seg.start), formatStation(r.seg.end), sh.number, sh.title, sh.series, sh.discipline,
        sh.gen ? formatStation(sh.gen.start) : '', sh.gen ? formatStation(sh.gen.end) : '', sh.status, sh.pct, sh.owner, sh.due, ms[sh.milestone] || '',
        sh.hoursBudget, sh.hoursActual, qcDone, deps, sh.gen ? 'yes' : '', sh.notes].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  function ppCSV(st, opts) {
    const S = ppSummary(st, opts);
    const lines = [['Sub-project', 'Discipline', 'Segment', 'Road', 'Start Sta', 'End Sta', 'Length ft', 'Series', 'Scale', 'Ft per sheet', 'Overlap ft', 'PP sheets'].join(',')];
    for (const r of S.rows) lines.push([r.sub.code, r.discipline, r.seg.name, r.seg.road, formatStation(r.seg.start), formatStation(r.seg.end), r.length, r.series.name, r.scale, r.ft, st.settings.overlapFt, r.count].map(csvCell).join(','));
    for (const b of S.bySub) for (const d of DISCIPLINES) lines.push([b.sub.code + ' total', d, '', '', '', '', '', '', '', '', '', b.disc[d]].map(csvCell).join(','));
    for (const b of S.bySub) lines.push([b.sub.code + ' total', 'All', '', '', '', '', b.length, '', '', '', '', b.total].map(csvCell).join(','));
    for (const d of DISCIPLINES) lines.push(['Project total', d, '', '', '', '', '', '', '', '', '', S.byDisc[d]].map(csvCell).join(','));
    lines.push(['Project total', 'All', '', '', '', '', S.length, '', '', '', '', S.total].map(csvCell).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  /* ---- schema: v1 (encrypted era) -> v2 ---- */
  function migrate(old) {
    if (!old || !Array.isArray(old.subs)) throw new Error('Data is not a PM project');
    if (old.schema === SCHEMA) return normalize(old);
    if (old.schema !== 1) throw new Error('Unknown data version ' + old.schema);
    const st = newState(old.project && old.project.name);
    st.created = old.created || st.created;
    st.lastBackup = old.lastBackup || null;
    st.staff = (old.staff || []).map((n) => ({ name: String(n), role: '' }));
    st.subs = old.subs.map((s) => ({ id: s.id, code: s.code, name: s.name, scale: 100,
      templates: Array.isArray(s.templates) ? s.templates.map((t) => ({ id: t.id, title: t.title, discipline: t.discipline })) : defaultTemplates(),
      segments: (s.segments || []).map((g) => ({ id: g.id, name: g.name, road: g.road || '', start: g.start, end: g.end, scale: null, notes: g.notes || '',
        sheets: (g.sheets || []).map((h) => ({ ...newSheet(h), id: h.id, pct: h.status === 'Done' ? 100 : 0 })) })) }));
    log(st, 'Migrated from v1 encrypted vault');
    return normalize(st);
  }
  function normalize(st) {
    if (!st || st.schema !== SCHEMA || !Array.isArray(st.subs)) throw new Error('Data is not a PM v2 project');
    st.staff = Array.isArray(st.staff) ? st.staff.map((s) => (typeof s === 'string' ? { name: s, role: '' } : s)) : [];
    st.settings = Object.assign({ scales: clone(DEFAULT_SCALES), overlapFt: 0, qcSteps: DEFAULT_QC.slice(), series: clone(DEFAULT_SERIES), numbering: clone(DEFAULT_NUMBERING) }, st.settings || {});
    st.milestones = Array.isArray(st.milestones) ? st.milestones : [];
    if (!Array.isArray(st.settings.numbering)) st.settings.numbering = clone(DEFAULT_NUMBERING);
    st.views = Array.isArray(st.views) ? st.views : [];
    st.links = Array.isArray(st.links) ? st.links : [];
    st.index = Array.isArray(st.index) ? st.index : defaultTemplates();
    st.log = Array.isArray(st.log) ? st.log : [];
    for (const sub of st.subs) {
      sub.scale = Number(sub.scale) || 100;
      if (!Number.isFinite(Number(sub.order))) sub.order = st.subs.indexOf(sub) + 1;
      sub.templates = Array.isArray(sub.templates) ? sub.templates : defaultTemplates();
      sub.segments = Array.isArray(sub.segments) ? sub.segments : [];
      for (const seg of sub.segments) {
        seg.sheets = Array.isArray(seg.sheets) ? seg.sheets : [];
        seg.revs = Array.isArray(seg.revs) ? seg.revs : [];
        if (!String(seg.road || '').trim()) seg.road = String(seg.name || '').trim() || 'Road';
        seg.name = segLabel(seg);
        for (const sh of seg.sheets) { if (!DISCIPLINES.includes(sh.discipline)) sh.discipline = guessDiscipline(sh.title, sh.series); const d = newSheet({}); for (const k of Object.keys(d)) if (sh[k] === undefined) sh[k] = k === 'id' ? uid() : d[k]; }
      }
    }
    /* v2.0 kept prerequisites in sheet.deps (same sub-project only) → convert to 'dep' links */
    const ids = new Set(allSheets(st).map((r) => r.sh.id));
    for (const r of allSheets(st)) {
      if (Array.isArray(r.sh.deps)) {
        for (const d of r.sh.deps) if (ids.has(d) && d !== r.sh.id && !st.links.some((l) => l.kind === 'dep' && l.src.id === d && l.dst.id === r.sh.id))
          st.links.push({ id: uid(), src: { t: 'sheet', id: d }, dst: { t: 'sheet', id: r.sh.id }, kind: 'dep', ack: 0, created: new Date().toISOString() });
        delete r.sh.deps;
      }
    }
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
    if (ref.t === 'seg') { const x = findSeg(st, ref.id); return x && { t: 'seg', ref, sub: x.sub, seg: x.seg, obj: x.seg, name: x.seg.name }; }
    return null;
  }
  function refLabel(st, ref) {
    const r = resolve(st, ref);
    if (!r) return '(missing)';
    return r.sub.code + ' · ' + r.seg.name + (r.t === 'sheet' ? ' · ' + r.sh.title : ' (segment)');
  }
  function isDone(st, ref) {
    const r = resolve(st, ref);
    if (!r) return true;
    if (r.t === 'sheet') return r.sh.status === 'Done';
    return r.seg.sheets.length > 0 && r.seg.sheets.every((s) => s.status === 'Done');
  }
  function revCount(st, ref) { const r = resolve(st, ref); return r && Array.isArray(r.obj.revs) ? r.obj.revs.length : 0; }
  function subOrder(st, sub) { return Number.isFinite(Number(sub.order)) ? Number(sub.order) : st.subs.indexOf(sub) + 1; }
  function orderedSubs(st) { return st.subs.slice().sort((a, b) => subOrder(st, a) - subOrder(st, b) || a.code.localeCompare(b.code)); }
  function setOrder(st, ids) { ids.forEach((id, i) => { const s = findSub(st, id); if (s) s.order = i + 1; }); log(st, 'Build order → ' + orderedSubs(st).map((s) => s.code).join(' → ')); }
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
    if (rk(src) === rk(dst)) throw new Error('A sheet cannot be linked to itself.');
    if (st.links.some((l) => l.kind === kind && rk(l.src) === rk(src) && rk(l.dst) === rk(dst))) throw new Error('That connector already exists.');
    if (kind === 'dep' && depPath(st, dst, src)) throw new Error('Not added: this would create a circular dependency (' + refLabel(st, src) + ' already depends on ' + refLabel(st, dst) + ').');
    const link = { id: uid(), src: { t: src.t, id: src.id }, dst: { t: dst.t, id: dst.id }, kind, ack: revCount(st, src), created: new Date().toISOString() };
    st.links.push(link);
    const warns = [];
    if (wrongWay(st, link)) warns.push('Points upstream: ' + a.sub.code + ' is built after ' + b.sub.code + ', but ' + b.sub.code + ' ' + (kind === 'dep' ? 'depends on' : 'is updated from') + ' it.');
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
    for (const sub of st.subs) for (const seg of sub.segments) { out.push({ t: 'seg', id: seg.id }); for (const sh of seg.sheets) out.push({ t: 'sheet', id: sh.id }); }
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
    const lines = [['Type', 'From sub', 'From segment', 'From item', 'To sub', 'To segment', 'To item', 'Meaning', 'Cross-project', 'Wrong direction', 'From done', 'Update needed'].join(',')];
    for (const l of st.links) {
      const a = resolve(st, l.src), b = resolve(st, l.dst);
      if (!a || !b) continue;
      lines.push([l.kind, a.sub.code, a.seg.name, a.t === 'sheet' ? a.sh.title : '(segment)', b.sub.code, b.seg.name, b.t === 'sheet' ? b.sh.title : '(segment)',
        l.kind === 'dep' ? 'To depends on From (From first)' : 'Update To when From changes', isCross(st, l) ? 'yes' : '', wrongWay(st, l) ? 'yes' : '',
        isDone(st, l.src) ? 'yes' : '', revCount(st, l.src) > (l.ack || 0) ? 'yes' : ''].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  /* one discipline branch of a sub-project (optionally one segment): progress, sheets, PP, flags */
  function branchStats(st, sub, disc, seg, today) {
    today = today || todayISO();
    const segs = seg ? [seg] : sub.segments;
    const sheets = segs.flatMap((g) => g.sheets.filter((x) => x.discipline === disc));
    const p = progress(sheets);
    const pp = segs.reduce((a, g) => a + segPP(st, sub, g, { discipline: disc }).total, 0);
    const overdue = sheets.filter((x) => isOverdue(x, today)).length;
    const blocked = sheets.filter((x) => x.status !== 'Done' && blockers(st, { t: 'sheet', id: x.id }).length).length;
    const update = sheets.filter((x) => needsUpdate(st, { t: 'sheet', id: x.id }).length).length;
    return { disc, sheets, total: sheets.length, done: p.done, pct: p.pct, pp, overdue, blocked, update, length: segs.reduce((a, g) => a + segLength(g), 0) };
  }
  function roads(st) { return [...new Set(st.subs.flatMap((s) => s.segments.map((g) => g.road)).filter(Boolean))].sort(); }
  /* ---- v2.5 project sheet index: one list for the whole project, bulk-applied to every segment (skips titles a segment already has) ---- */
  function addIndexItem(st, f) {
    const title = String((f && f.title) || '').trim();
    if (!title) throw new Error('Sheet title is required.');
    if (st.index.some((x) => x.title.toLowerCase() === title.toLowerCase())) throw new Error('“' + title + '” is already in the sheet index.');
    const it = { id: uid(), title, discipline: DISCIPLINES.includes(f.discipline) ? f.discipline : guessDiscipline(title) };
    st.index.push(it); return it;
  }
  function updateIndexItem(st, id, f) {
    const it = st.index.find((x) => x.id === id); if (!it) throw new Error('Not found');
    if (f.title != null) { const t = String(f.title).trim(); if (!t) throw new Error('Sheet title is required.'); it.title = t; }
    if (DISCIPLINES.includes(f.discipline)) it.discipline = f.discipline;
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
        const items = st.index.filter((t) => (!opts || !opts.discipline || t.discipline === opts.discipline) && !have.has(t.title.toLowerCase()));
        if (items.length) out.push({ sub, seg, items });
      }
    }
    return { rows: out, count: out.reduce((a, r) => a + r.items.length, 0), segments: out.length };
  }
  function applyIndex(st, opts) {
    const plan = planIndex(st, opts);
    for (const r of plan.rows) for (const t of r.items) r.seg.sheets.push(newSheet({ title: t.title, discipline: t.discipline }));
    log(st, 'Applied project sheet index: ' + plan.count + ' sheet(s) added to ' + plan.segments + ' segment(s)');
    return plan.count;
  }
  function indexToTemplates(st) { for (const sub of st.subs) sub.templates = st.index.map((t) => ({ id: uid(), title: t.title, discipline: t.discipline })); log(st, 'Sheet index copied to every sub-project’s standard set'); }
  /* ---- v2.6 sheet numbers ---- */
  function numVal(n) { const m = /^\s*(\d+)\s*$/.exec(String(n == null ? '' : n)); return m ? Number(m[1]) : null; }
  function rangeFor(st, sh) {
    const R = st.settings.numbering || [];
    return (sh.gen && R.find((r) => r.key === 'series:' + sh.gen.series)) || R.find((r) => r.key === 'tpl:' + String(sh.title).trim().toLowerCase()) || R.find((r) => r.key === 'disc:' + sh.discipline) || null;
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
    if (dup.length) out.push('Duplicate sheet number — also on ' + dup.map((x) => x.sub.code + ' · ' + x.sh.title).join(', '));
    const v = numVal(num), r = rangeFor(st, sh);
    if (r && v != null && (v < r.from || v > r.to)) out.push('Out of range: ' + r.label + ' uses ' + r.from + '–' + r.to);
    return out;
  }
  function allNumberIssues(st) { return allSheets(st).map((r) => ({ r, issues: numberIssues(st, r.sh) })).filter((x) => x.issues.length); }
  /* fill numbers in project order (build order, station, generated index); opts.all also replaces existing numbers */
  function autoNumber(st, opts) {
    const rows = orderedSubs(st).flatMap((sub) => sub.segments.slice().sort((a, b) => a.start - b.start).flatMap((seg) => seg.sheets.map((sh) => ({ sub, seg, sh }))));
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
  /* v2.10 one-page status report data */
  function report(st, today) {
    today = today || todayISO();
    const S = summary(st, today), PP = ppSummary(st), w = weekView(st, {}, today);
    const subs = st.subs.map((sub) => ({ sub, pct: S.subs.find((x) => x.sub === sub).pct, discs: DISCIPLINES.map((d) => branchStats(st, sub, d, null, today)), pp: PP.bySub.find((b) => b.sub === sub).total }));
    const counts = Object.fromEntries(STATUSES.map((x) => [x, allSheets(st).filter((r) => r.sh.status === x).length]));
    const mil = S.milestones.map((m) => Object.assign({ late: !!m.m.date && m.m.date < today && m.pct < 100 }, m));
    return { today, project: st.project, overall: S.overall, counts, subs, pp: { total: PP.total, byDisc: PP.byDisc }, overdue: S.overdue, blocked: w.blocked, due7: w.due7, milestones: mil };
  }
  /* v2.11 tree collapse maps (UI keys: root, sub:<id>, disc:<sub>:<disc>, seg:<id>, seg:<id>@<disc>) */
  const TREE_LEVELS = ['Project', 'Sub-projects', 'Disciplines', 'Segments', 'Sheets'];
  function collapseLevel(st, level) {
    const c = { root: level < 1 };
    for (const sub of st.subs) {
      c['sub:' + sub.id] = level < 2;
      for (const d of DISCIPLINES) c['disc:' + sub.id + ':' + d] = level < 3;
      for (const g of sub.segments) c['seg:' + g.id] = level < 4;
    }
    return c;
  }
  /* collapse everything except the path to (and the children of) one node */
  function focusBranch(st, p) {
    const c = collapseLevel(st, 1);
    if (!p || !p.sub) return c;
    c['sub:' + p.sub] = false;
    if (p.disc) c['disc:' + p.sub + ':' + p.disc] = false;
    else if (!p.seg) for (const d of DISCIPLINES) c['disc:' + p.sub + ':' + d] = false;
    if (p.seg) { for (const d of (p.disc ? [p.disc] : DISCIPLINES)) { c['disc:' + p.sub + ':' + d] = false; c['seg:' + p.seg + '@' + d] = false; } }
    return c;
  }
  /* v2.12 stations */
  function allSegs(st) { return st.subs.flatMap((s) => s.segments); }
  /* preview a station / scale / direction change: validation, live length, PP per discipline, what regenerating would do */
  function previewStations(st, segId, f) {
    const c = clone(st), hit = findSeg(c, segId); if (!hit) throw new Error('No such segment');
    const next = Object.assign({}, hit.seg, f, { start: parseStation(f.start != null ? f.start : hit.seg.start), end: parseStation(f.end != null ? f.end : hit.seg.end) });
    if ('scale' in f) next.scale = f.scale === '' || f.scale == null ? null : Number(f.scale);
    const v = validateSegment(next, allSegs(c));
    if (v.errs.length) return { errs: v.errs, warns: [] };
    Object.assign(hit.seg, next);
    const pp = Object.fromEntries(DISCIPLINES.map((d) => [d, segPP(c, hit.sub, hit.seg, { discipline: d }).total]));
    const plan = planGenerate(c, segId);
    const hasGen = hit.seg.sheets.some((x) => x.gen);
    return { errs: [], warns: v.warns, length: segLength(hit.seg), pp, hasGen,
      plan: { create: plan.create.map((x) => x.title), update: plan.update.map((x) => x.sheet.title + ' → ' + x.title), remove: plan.remove.map((x) => x.title), keep: plan.removeTouched.map((x) => x.title) } };
  }
  /* apply a station change and (if the segment has generated PP sheets) regenerate them, keeping user-edited extras */
  function setStations(st, segId, f, opts) {
    const r = updateSegment(st, segId, f);
    if ('reverse' in f) r.seg.reverse = !!f.reverse;
    let gen = null;
    if ((!opts || opts.regen !== false) && r.seg.sheets.some((x) => x.gen)) gen = applyGenerate(st, segId, planGenerate(st, segId), { removeTouched: false });
    return { seg: r.seg, warns: r.warns, gen };
  }
  function shiftStations(st, segId, offset, opts) {
    const hit = findSeg(st, segId), d = Number(offset);
    if (!hit) throw new Error('No such segment'); if (!Number.isFinite(d) || !d) throw new Error('Offset must be a non-zero number of feet.');
    if (hit.seg.start + d < 0) throw new Error('Shift would make the start station negative.');
    const r = setStations(st, segId, { start: hit.seg.start + d, end: hit.seg.end + d }, opts);
    for (const sh of hit.seg.sheets) if (sh.gen && !r.gen) { sh.gen.start += d; sh.gen.end += d; }
    log(st, 'Shifted ' + hit.seg.name + ' by ' + (d > 0 ? '+' : '') + d + ' ft');
    return r;
  }
  /* rows: [{ segId?, subId?, road, start, end, scale }] from the table / clipboard. All-or-nothing. */
  function applyStationRows(st, rows) {
    const out = { updated: 0, added: 0, warns: [] };
    rows.forEach((r, i) => {
      try {
        const f = {}; for (const k of ['road', 'start', 'end', 'scale']) if (r[k] != null && r[k] !== '') f[k] = k === 'scale' ? Number(String(r[k]).replace(/^1"\s*=\s*|'$/g, '')) : r[k];
        const x = r.segId ? updateSegment(st, r.segId, f) : addSegment(st, r.subId, f);
        r.segId ? out.updated++ : out.added++; out.warns.push(...x.warns);
      } catch (e) { throw new Error('Row ' + (i + 1) + ': ' + e.message); }
    });
    return out;
  }
  function parseTSV(text) { return String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t').map((c) => c.trim())); }
  return { SCHEMA, allSegs, previewStations, setStations, shiftStations, applyStationRows, parseTSV, TREE_LEVELS, collapseLevel, focusBranch, report, history, weekView, DEFAULT_NUMBERING, rangeFor, suggestNumber, numberIssues, allNumberIssues, autoNumber, setRange, addRange, removeRange, rangeOverlaps, addIndexItem, updateIndexItem, removeIndexItem, moveIndexItem, planIndex, applyIndex, indexToTemplates, segLabel, roads, guessDiscipline, branchStats, LINK_KINDS, rk, resolve, refLabel, isDone, revCount, subOrder, orderedSubs, setOrder, wrongWay, isCross, linksOf, depPath, addLink, removeLink, pruneLinks, blockers, needsUpdate, markRevised, markUpdated, impact, allRefs, flags, depsCSV, STATUSES, DISCIPLINES, WEIGHT, DEFAULT_TEMPLATES, DEFAULT_SCALES, DEFAULT_SERIES, DEFAULT_QC, uid, newState,
    parseStation, formatStation, segLength, validateSegment, overlaps,
    ftPerSheet, ppCount, ppRanges, segScale, seriesScale, segPP, ppSummary, genTitle, isTouched, planGenerate, applyGenerate,
    findSub, findSeg, findSheet, log, addSegment, updateSegment, deleteSegment, newSheet, addSheet, updateSheet, deleteSheet, duplicateSheet, blockedBy,
    bulkAddTemplates, addTemplate, updateTemplate, deleteTemplate, duplicateTemplate, resetTemplates, resetAllTemplates, DEFAULT_TEMPLATES, addStaff, removeStaff,
    setScale, removeScale, addMilestone, sortMilestones, removeMilestone,
    allSheets, todayISO, addDays, isOverdue, isUpcoming, progress, summary, filterRows, sortRows, saveView, csvCell, toCSV, ppCSV,
    migrate, normalize, backupFile, readBackup };
});
