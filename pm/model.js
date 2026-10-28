/* PM data model: pure functions, no DOM, no storage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STATUSES = ['Not started', 'In progress', 'In review', 'Done'];
  const WEIGHT = { 'Not started': 0, 'In progress': 0.4, 'In review': 0.8, 'Done': 1 };
  const DISCIPLINES = ['Drainage', 'SWP3'];
  const DEFAULT_TEMPLATES = [
    ['Drainage Area Map', 'Drainage'],
    ['Hydrologic / Hydraulic Data Sheet', 'Drainage'],
    ['Drainage Plan and Profile', 'Drainage'],
    ['Storm Sewer Plan and Profile', 'Drainage'],
    ['Storm Sewer Hydraulic Computations', 'Drainage'],
    ['Inlet Calculations', 'Drainage'],
    ['Culvert Layout', 'Drainage'],
    ['Culvert Hydraulic Data', 'Drainage'],
    ['Drainage Standard Details', 'Drainage'],
    ['SWP3 Summary Sheet', 'SWP3'],
    ['SWP3 Layout', 'SWP3'],
    ['Erosion Control Plan', 'SWP3'],
    ['SWP3 / EC Standard Details', 'SWP3'],
  ];
  let seq = 0;
  function uid() {
    seq = (seq + 1) % 1e6;
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + seq.toString(36);
  }
  function defaultTemplates() { return DEFAULT_TEMPLATES.map(([title, discipline]) => ({ id: uid(), title, discipline })); }
  function newState(projectName) {
    return {
      schema: 1,
      project: { name: projectName || 'PSE Drainage & SWP3 Project' },
      subs: ['A', 'B', 'C', 'D'].map((code) => ({ id: uid(), code, name: 'Sub-project ' + code, templates: defaultTemplates(), segments: [] })),
      staff: [],
      settings: { autoLockMin: 5, lockOnHide: false },
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
  function validateSegment(seg, others) {
    const errs = [];
    const a = parseStation(seg.start), b = parseStation(seg.end);
    if (!String(seg.name || '').trim()) errs.push('Name is required.');
    if (Number.isNaN(a)) errs.push('Start station must look like 10+00.');
    if (Number.isNaN(b)) errs.push('End station must look like 25+50.');
    if (!errs.length && b <= a) errs.push('End station must be after start station.');
    const warns = [];
    if (!errs.length) for (const o of overlaps({ ...seg, start: a, end: b }, others || [])) {
      warns.push('Overlaps ' + o.name + ' (' + formatStation(o.start) + ' to ' + formatStation(o.end) + ')' + (o.road ? ' on ' + o.road : '') + '.');
    }
    return { errs, warns };
  }
  /* Overlap only counts on the same road (case-insensitive; blank road matches blank). Touching ends are fine. */
  function overlaps(seg, others) {
    const road = String(seg.road || '').trim().toLowerCase();
    return others.filter((o) => o.id !== seg.id && String(o.road || '').trim().toLowerCase() === road &&
      Math.max(seg.start, o.start) < Math.min(seg.end, o.end));
  }

  /* ---- lookups & ops ---- */
  function findSub(st, id) { return st.subs.find((s) => s.id === id); }
  function findSeg(st, id) {
    for (const sub of st.subs) for (const seg of sub.segments) if (seg.id === id) return { sub, seg };
    return null;
  }
  function addSegment(st, subId, f) {
    const sub = findSub(st, subId);
    if (!sub) throw new Error('No such sub-project');
    const seg = { id: uid(), name: String(f.name || '').trim(), road: String(f.road || '').trim(),
      start: parseStation(f.start), end: parseStation(f.end), notes: f.notes || '', sheets: [] };
    const v = validateSegment(seg, sub.segments);
    if (v.errs.length) throw new Error(v.errs.join(' '));
    sub.segments.push(seg);
    sub.segments.sort((x, y) => x.start - y.start);
    return { seg, warns: v.warns };
  }
  function updateSegment(st, segId, f) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const next = { ...hit.seg, ...f, start: parseStation(f.start != null ? f.start : hit.seg.start), end: parseStation(f.end != null ? f.end : hit.seg.end) };
    const v = validateSegment(next, hit.sub.segments);
    if (v.errs.length) throw new Error(v.errs.join(' '));
    Object.assign(hit.seg, next, { name: String(next.name).trim(), road: String(next.road || '').trim() });
    hit.sub.segments.sort((x, y) => x.start - y.start);
    return { seg: hit.seg, warns: v.warns };
  }
  function deleteSegment(st, segId) {
    const hit = findSeg(st, segId);
    if (hit) hit.sub.segments = hit.sub.segments.filter((s) => s !== hit.seg);
    return !!hit;
  }
  function newSheet(f) {
    return { id: uid(), title: String(f.title || '').trim() || 'Untitled sheet',
      discipline: DISCIPLINES.includes(f.discipline) ? f.discipline : 'Drainage',
      status: STATUSES.includes(f.status) ? f.status : 'Not started',
      owner: String(f.owner || '').trim(), due: f.due || '', notes: f.notes || '' };
  }
  function addSheet(st, segId, f) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const sh = newSheet(f);
    hit.seg.sheets.push(sh);
    return sh;
  }
  function findSheet(st, sheetId) {
    for (const sub of st.subs) for (const seg of sub.segments) for (const sh of seg.sheets) if (sh.id === sheetId) return { sub, seg, sh };
    return null;
  }
  function updateSheet(st, sheetId, f) {
    const hit = findSheet(st, sheetId);
    if (!hit) throw new Error('No such sheet');
    if ('status' in f && !STATUSES.includes(f.status)) throw new Error('Bad status');
    if ('discipline' in f && !DISCIPLINES.includes(f.discipline)) throw new Error('Bad discipline');
    Object.assign(hit.sh, f);
    if (hit.sh.owner) addStaff(st, hit.sh.owner);
    return hit.sh;
  }
  function deleteSheet(st, sheetId) {
    const hit = findSheet(st, sheetId);
    if (hit) hit.seg.sheets = hit.seg.sheets.filter((s) => s !== hit.sh);
    return !!hit;
  }
  function duplicateSheet(st, sheetId) {
    const hit = findSheet(st, sheetId);
    if (!hit) throw new Error('No such sheet');
    const copy = { ...hit.sh, id: uid(), title: hit.sh.title + ' (copy)', status: 'Not started' };
    hit.seg.sheets.splice(hit.seg.sheets.indexOf(hit.sh) + 1, 0, copy);
    return copy;
  }
  /* Adds the sub-project's template set to a segment; skips titles already on the segment. */
  function bulkAddTemplates(st, segId, opts) {
    const hit = findSeg(st, segId);
    if (!hit) throw new Error('No such segment');
    const have = new Set(hit.seg.sheets.map((s) => s.title.toLowerCase()));
    const disc = opts && opts.discipline;
    const added = [];
    for (const t of hit.sub.templates) {
      if (disc && t.discipline !== disc) continue;
      if (have.has(t.title.toLowerCase())) continue;
      const sh = newSheet({ title: t.title, discipline: t.discipline, owner: opts && opts.owner, due: opts && opts.due });
      hit.seg.sheets.push(sh);
      have.add(t.title.toLowerCase());
      added.push(sh);
    }
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
  function deleteTemplate(st, subId, tid) {
    const sub = findSub(st, subId);
    sub.templates = sub.templates.filter((x) => x.id !== tid);
  }
  function duplicateTemplate(st, subId, tid) {
    const sub = findSub(st, subId);
    const i = sub.templates.findIndex((x) => x.id === tid);
    const c = { ...sub.templates[i], id: uid(), title: sub.templates[i].title + ' (copy)' };
    sub.templates.splice(i + 1, 0, c);
    return c;
  }
  function resetTemplates(st, subId) { findSub(st, subId).templates = defaultTemplates(); }
  /* staff */
  function addStaff(st, name) {
    const n = String(name || '').trim();
    if (n && !st.staff.some((s) => s.toLowerCase() === n.toLowerCase())) { st.staff.push(n); st.staff.sort((a, b) => a.localeCompare(b)); }
    return n;
  }
  function removeStaff(st, name) { st.staff = st.staff.filter((s) => s !== name); }

  /* ---- queries ---- */
  function allSheets(st) {
    const out = [];
    for (const sub of st.subs) for (const seg of sub.segments) for (const sh of seg.sheets) out.push({ sub, seg, sh });
    return out;
  }
  function isOverdue(sh, today) { return !!sh.due && sh.status !== 'Done' && sh.due < today; }
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function progress(sheets) {
    const counts = { 'Not started': 0, 'In progress': 0, 'In review': 0, 'Done': 0 };
    let w = 0;
    for (const sh of sheets) { counts[sh.status] = (counts[sh.status] || 0) + 1; w += WEIGHT[sh.status] || 0; }
    const total = sheets.length;
    return { total, counts, done: counts.Done, pct: total ? Math.round((w / total) * 1000) / 10 : 0, donePct: total ? Math.round((counts.Done / total) * 1000) / 10 : 0 };
  }
  function summary(st, today) {
    today = today || todayISO();
    const rows = allSheets(st);
    const subs = st.subs.map((sub) => ({ sub, ...progress(rows.filter((r) => r.sub === sub).map((r) => r.sh)) }));
    const overdue = rows.filter((r) => isOverdue(r.sh, today)).sort((a, b) => a.sh.due.localeCompare(b.sh.due));
    const byOwner = {};
    for (const r of rows) {
      const k = r.sh.owner || '(unassigned)';
      byOwner[k] = byOwner[k] || { owner: k, open: 0, done: 0, overdue: 0 };
      if (r.sh.status === 'Done') byOwner[k].done++; else byOwner[k].open++;
      if (isOverdue(r.sh, today)) byOwner[k].overdue++;
    }
    return { overall: progress(rows.map((r) => r.sh)), subs, overdue, workload: Object.values(byOwner).sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner)) };
  }
  function filterRows(rows, f, today) {
    f = f || {};
    const q = String(f.q || '').trim().toLowerCase();
    return rows.filter((r) => {
      if (f.status && r.sh.status !== f.status) return false;
      if (f.owner && (f.owner === '(unassigned)' ? r.sh.owner : r.sh.owner !== f.owner)) return false;
      if (f.discipline && r.sh.discipline !== f.discipline) return false;
      if (f.sub && r.sub.id !== f.sub) return false;
      if (f.overdue && !isOverdue(r.sh, today || todayISO())) return false;
      if (q) {
        const hay = [r.sh.title, r.sh.owner, r.sh.notes, r.sh.status, r.sh.discipline, r.seg.name, r.seg.road, r.sub.code, r.sub.name].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; /* spreadsheet formula injection guard */
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    const head = ['Sub-project', 'Segment', 'Road', 'Start Sta', 'End Sta', 'Sheet', 'Discipline', 'Status', 'Owner', 'Due', 'Notes'];
    const lines = [head.join(',')];
    for (const r of rows) lines.push([r.sub.code, r.seg.name, r.seg.road, formatStation(r.seg.start), formatStation(r.seg.end),
      r.sh.title, r.sh.discipline, r.sh.status, r.sh.owner, r.sh.due, r.sh.notes].map(csvCell).join(','));
    return lines.join('\r\n') + '\r\n';
  }
  /* Validate/normalize a decrypted state (import or unlock). */
  function normalize(st) {
    if (!st || st.schema !== 1 || !Array.isArray(st.subs)) throw new Error('Data is not a PM project');
    st.staff = Array.isArray(st.staff) ? st.staff : [];
    st.settings = Object.assign({ autoLockMin: 5, lockOnHide: false }, st.settings || {});
    for (const sub of st.subs) {
      sub.templates = Array.isArray(sub.templates) ? sub.templates : defaultTemplates();
      sub.segments = Array.isArray(sub.segments) ? sub.segments : [];
      for (const seg of sub.segments) seg.sheets = Array.isArray(seg.sheets) ? seg.sheets : [];
    }
    return st;
  }
  return { STATUSES, DISCIPLINES, WEIGHT, DEFAULT_TEMPLATES, uid, newState, parseStation, formatStation, validateSegment, overlaps,
    findSub, findSeg, findSheet, addSegment, updateSegment, deleteSegment, addSheet, updateSheet, deleteSheet, duplicateSheet,
    bulkAddTemplates, addTemplate, updateTemplate, deleteTemplate, duplicateTemplate, resetTemplates, addStaff, removeStaff,
    allSheets, isOverdue, todayISO, progress, summary, filterRows, toCSV, csvCell, normalize };
});
