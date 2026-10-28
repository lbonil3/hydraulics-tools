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
  const DEFAULT_TEMPLATES = [
    ['Drainage Area Map', 'Drainage'],
    ['Hydrologic / Hydraulic Data Sheet', 'Drainage'],
    ['Storm Sewer Hydraulic Computations', 'Drainage'],
    ['Inlet Calculations', 'Drainage'],
    ['Culvert Layout', 'Drainage'],
    ['Culvert Hydraulic Data', 'Drainage'],
    ['Drainage Standard Details', 'Drainage'],
    ['SWP3 Summary Sheet', 'SWP3'],
    ['Erosion Control Plan', 'SWP3'],
    ['SWP3 / EC Standard Details', 'SWP3'],
  ];
  const DEFAULT_SERIES = [
    { id: 'pp-drain', name: 'Drainage Plan & Profile', discipline: 'Drainage', enabled: true, scale: null },
    { id: 'pp-storm', name: 'Storm Sewer Plan & Profile', discipline: 'Drainage', enabled: false, scale: null },
    { id: 'pp-swp3', name: 'SWP3 Layout', discipline: 'SWP3', enabled: true, scale: null },
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
      subs: ['A', 'B', 'C', 'D'].map((code) => ({ id: uid(), code, name: 'Sub-project ' + code, scale: 100, templates: defaultTemplates(), segments: [] })),
      staff: [],
      settings: { scales: clone(DEFAULT_SCALES), overlapFt: 0, qcSteps: DEFAULT_QC.slice(), series: clone(DEFAULT_SERIES) },
      milestones: DEFAULT_MILESTONES.map((name) => ({ id: uid(), name, date: '' })),
      views: [],
      log: [],
      lastBackup: null,
      created: new Date().toISOString(),
    };
  }

  /* ---- stations (feet; 10+00 = 1000 ft) ---- */
  function parseStation(s) {
    if (typeof s === 'number') return Number.isFinite(s) && s >= 0 ? s : NaN;
    const m = String(s == null ? '' : s).trim().match(/^(\d+)\s*\+\s*(\d{2}(?:\.\d+)?)$/);
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
  function validateSegment(seg, others) {
    const errs = [];
    const a = parseStation(seg.start), b = parseStation(seg.end);
    if (!String(seg.name || '').trim()) errs.push('Name is required.');
    if (Number.isNaN(a)) errs.push('Start station must look like 10+00.');
    if (Number.isNaN(b)) errs.push('End station must look like 25+50.');
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
  function segScale(sub, seg) { return seg.scale != null && seg.scale !== '' ? Number(seg.scale) : Number(sub.scale) || 100; }
  function seriesScale(sub, seg, series) { return series.scale != null && series.scale !== '' ? Number(series.scale) : segScale(sub, seg); }
  /* opts.subScale: { [subId]: scale } what-if overrides (not saved) */
  function segPP(st, sub, seg, opts) {
    const len = segLength(seg);
    const out = [];
    for (const se of st.settings.series.filter((x) => x.enabled)) {
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
      for (const seg of sub.segments) {
        const p = segPP(st, sub, seg, opts);
        subTot += p.total; subLen += p.length;
        for (const s of p.series) rows.push({ sub, seg, length: p.length, series: s.series, scale: s.scale, ft: s.ft, count: s.count });
      }
      bySub.push({ sub, total: subTot, length: subLen });
    }
    return { rows, bySub, total: bySub.reduce((a, b) => a + b.total, 0), length: bySub.reduce((a, b) => a + b.length, 0) };
  }
  function genTitle(series, r) {
    return series.name + ' – Sta ' + formatStation(r.start) + ' to ' + formatStation(r.end) + ' (PP ' + r.idx + ' of ' + r.of + ')';
  }
  function isTouched(sh) {
    return sh.status !== 'Not started' || !!sh.owner || !!sh.notes || (Number(sh.pct) || 0) > 0 || (Number(sh.hoursActual) || 0) > 0 ||
      Object.values(sh.qc || {}).some(Boolean) || !!(sh.gen && sh.gen.titleEdited);
  }
  /* Plan (no mutation): which generated sheets to create / update / remove for a segment. */
  function planGenerate(st, segId) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const { sub, seg } = hit;
    const plan = { create: [], update: [], remove: [], removeTouched: [], unchanged: 0 };
    const enabled = st.settings.series.filter((x) => x.enabled);
    for (const se of st.settings.series) {
      const existing = seg.sheets.filter((s) => s.gen && s.gen.series === se.id).sort((a, b) => a.gen.idx - b.gen.idx);
      const ranges = enabled.includes(se) ? ppRanges(parseStation(seg.start), parseStation(seg.end), ftPerSheet(st.settings, seriesScale(sub, seg, se)), st.settings.overlapFt) : [];
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
      sh.number = c.series.id.replace('pp-', '').toUpperCase() + '-' + c.range.idx;
      seg.sheets.push(sh);
    }
    for (const u of plan.update) {
      Object.assign(u.sheet.gen, { idx: u.range.idx, of: u.range.of, start: u.range.start, end: u.range.end });
      if (!u.sheet.gen.titleEdited) u.sheet.title = u.title;
      u.sheet.discipline = u.series.discipline;
      u.sheet.series = u.series.name;
    }
    const kill = new Set(plan.remove.concat(opts && opts.removeTouched ? plan.removeTouched : []));
    seg.sheets = seg.sheets.filter((s) => !kill.has(s));
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
    const seg = { id: uid(), name: String(f.name || '').trim(), road: String(f.road || '').trim(),
      start: parseStation(f.start), end: parseStation(f.end), scale: f.scale ? Number(f.scale) : null, notes: f.notes || '', sheets: [] };
    const v = validateSegment(seg, sub.segments);
    if (v.errs.length) throw new Error(v.errs.join(' '));
    sub.segments.push(seg);
    sub.segments.sort((x, y) => x.start - y.start);
    log(st, 'Added segment ' + sub.code + ' · ' + seg.name + ' (' + formatStation(seg.start) + '–' + formatStation(seg.end) + ')');
    return { seg, warns: v.warns };
  }
  function updateSegment(st, segId, f) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const next = { ...hit.seg, ...f, start: parseStation(f.start != null ? f.start : hit.seg.start), end: parseStation(f.end != null ? f.end : hit.seg.end) };
    if ('scale' in f) next.scale = f.scale === '' || f.scale == null ? null : Number(f.scale);
    const v = validateSegment(next, hit.sub.segments);
    if (v.errs.length) throw new Error(v.errs.join(' '));
    Object.assign(hit.seg, next, { name: String(next.name).trim(), road: String(next.road || '').trim() });
    hit.sub.segments.sort((x, y) => x.start - y.start);
    log(st, 'Updated segment ' + hit.sub.code + ' · ' + hit.seg.name);
    return { seg: hit.seg, warns: v.warns };
  }
  function deleteSegment(st, segId) {
    const hit = findSeg(st, segId);
    if (hit) { hit.sub.segments = hit.sub.segments.filter((s) => s !== hit.seg); log(st, 'Deleted segment ' + hit.sub.code + ' · ' + hit.seg.name); }
    return !!hit;
  }
  function newSheet(f) {
    return { id: uid(), title: String(f.title || '').trim() || 'Untitled sheet',
      discipline: DISCIPLINES.includes(f.discipline) ? f.discipline : 'Drainage',
      number: f.number || '', series: f.series || '',
      status: STATUSES.includes(f.status) ? f.status : 'Not started',
      owner: String(f.owner || '').trim(), due: f.due || '', pct: 0, hoursBudget: Number(f.hoursBudget) || 0, hoursActual: 0,
      milestone: f.milestone || '', notes: f.notes || '', qc: {}, deps: [], gen: null };
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
    if ('deps' in g) g.deps = (g.deps || []).filter((d) => d !== sh.id && findSheet(st, d));
    if ('title' in g && sh.gen && g.title !== sh.title) sh.gen.titleEdited = true;
    if (g.status === 'Done' && !('pct' in g)) g.pct = 100;
    if ('pct' in g && g.pct === 100 && !('status' in g) && sh.status !== 'Done') g.status = 'Done';
    const changed = Object.keys(g).filter((k) => JSON.stringify(sh[k]) !== JSON.stringify(g[k]));
    Object.assign(sh, g);
    if (sh.owner) addStaff(st, sh.owner);
    if (changed.length) log(st, sh.title + ': ' + changed.map((k) => k + (['notes', 'qc', 'deps'].includes(k) ? '' : ' → ' + (g[k] === '' ? '(blank)' : g[k]))).join(', '));
    return sh;
  }
  function deleteSheet(st, sheetId) {
    const hit = findSheet(st, sheetId);
    if (hit) {
      hit.seg.sheets = hit.seg.sheets.filter((s) => s !== hit.sh);
      for (const r of allSheets(st)) r.sh.deps = (r.sh.deps || []).filter((d) => d !== sheetId);
      log(st, 'Deleted sheet ' + hit.sh.title);
    }
    return !!hit;
  }
  function duplicateSheet(st, sheetId) {
    const hit = findSheet(st, sheetId);
    if (!hit) throw new Error('No such sheet');
    const copy = { ...clone(hit.sh), id: uid(), title: hit.sh.title + ' (copy)', status: 'Not started', pct: 0, hoursActual: 0, qc: {}, gen: null };
    hit.seg.sheets.splice(hit.seg.sheets.indexOf(hit.sh) + 1, 0, copy);
    log(st, 'Duplicated sheet ' + hit.sh.title);
    return copy;
  }
  function blockedBy(st, sh) { return (sh.deps || []).map((d) => findSheet(st, d)).filter((r) => r && r.sh.status !== 'Done').map((r) => r.sh); }
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
  function resetTemplates(st, subId) { findSub(st, subId).templates = defaultTemplates(); }
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
      if (q) {
        const hay = [r.sh.title, r.sh.number, r.sh.series, r.sh.owner, r.sh.notes, r.sh.status, r.sh.discipline, r.seg.name, r.seg.road, r.sub.code, r.sub.name].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
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
      const deps = (sh.deps || []).map((d) => { const h = findSheet(st, d); return h ? h.sh.title : ''; }).filter(Boolean).join('; ');
      lines.push([r.sub.code, r.seg.name, r.seg.road, formatStation(r.seg.start), formatStation(r.seg.end), sh.number, sh.title, sh.series, sh.discipline,
        sh.gen ? formatStation(sh.gen.start) : '', sh.gen ? formatStation(sh.gen.end) : '', sh.status, sh.pct, sh.owner, sh.due, ms[sh.milestone] || '',
        sh.hoursBudget, sh.hoursActual, qcDone, deps, sh.gen ? 'yes' : '', sh.notes].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  function ppCSV(st, opts) {
    const S = ppSummary(st, opts);
    const lines = [['Sub-project', 'Segment', 'Road', 'Start Sta', 'End Sta', 'Length ft', 'Series', 'Scale', 'Ft per sheet', 'Overlap ft', 'PP sheets'].join(',')];
    for (const r of S.rows) lines.push([r.sub.code, r.seg.name, r.seg.road, formatStation(r.seg.start), formatStation(r.seg.end), r.length, r.series.name, r.scale, r.ft, st.settings.overlapFt, r.count].map(csvCell).join(','));
    for (const b of S.bySub) lines.push([b.sub.code + ' total', '', '', '', '', b.length, '', '', '', '', b.total].map(csvCell).join(','));
    lines.push(['Project total', '', '', '', '', S.length, '', '', '', '', S.total].map(csvCell).join(','));
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
    st.settings = Object.assign({ scales: clone(DEFAULT_SCALES), overlapFt: 0, qcSteps: DEFAULT_QC.slice(), series: clone(DEFAULT_SERIES) }, st.settings || {});
    st.milestones = Array.isArray(st.milestones) ? st.milestones : [];
    st.views = Array.isArray(st.views) ? st.views : [];
    st.log = Array.isArray(st.log) ? st.log : [];
    for (const sub of st.subs) {
      sub.scale = Number(sub.scale) || 100;
      sub.templates = Array.isArray(sub.templates) ? sub.templates : defaultTemplates();
      sub.segments = Array.isArray(sub.segments) ? sub.segments : [];
      for (const seg of sub.segments) {
        seg.sheets = Array.isArray(seg.sheets) ? seg.sheets : [];
        for (const sh of seg.sheets) { const d = newSheet({}); for (const k of Object.keys(d)) if (sh[k] === undefined) sh[k] = k === 'id' ? uid() : d[k]; }
      }
    }
    return st;
  }
  function backupFile(st) { return { fmt: 'pm-plain-backup', v: SCHEMA, exported: new Date().toISOString(), data: st }; }
  function readBackup(obj) {
    if (obj && obj.fmt === 'pm-plain-backup') return migrate(obj.data);
    if (obj && obj.schema) return migrate(obj);
    throw new Error('Not a PM backup file');
  }
  return { SCHEMA, STATUSES, DISCIPLINES, WEIGHT, DEFAULT_TEMPLATES, DEFAULT_SCALES, DEFAULT_SERIES, DEFAULT_QC, uid, newState,
    parseStation, formatStation, segLength, validateSegment, overlaps,
    ftPerSheet, ppCount, ppRanges, segScale, seriesScale, segPP, ppSummary, genTitle, isTouched, planGenerate, applyGenerate,
    findSub, findSeg, findSheet, log, addSegment, updateSegment, deleteSegment, newSheet, addSheet, updateSheet, deleteSheet, duplicateSheet, blockedBy,
    bulkAddTemplates, addTemplate, updateTemplate, deleteTemplate, duplicateTemplate, resetTemplates, addStaff, removeStaff,
    setScale, removeScale, addMilestone, sortMilestones, removeMilestone,
    allSheets, todayISO, addDays, isOverdue, isUpcoming, progress, summary, filterRows, sortRows, saveView, csvCell, toCSV, ppCSV,
    migrate, normalize, backupFile, readBackup };
});
