/* Capture file model for the Radar watchlists. Pure functions (no DOM), shared by the browser and node tests.
   A capture file is the user's own notes on a starred record. Nothing here is read from a source and nothing here ever changes a fee test. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RadarCapture = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DECISIONS = ['Undecided', 'Go', 'No-go'];
  var SOON_DAYS = 14;
  var TEXT_FIELDS = ['incumbent', 'team', 'reason', 'contact', 'next', 'notes'];
  var LIMIT = { incumbent: 300, team: 1000, reason: 1000, contact: 500, next: 500, notes: 5000 };

  function blank() { return { incumbent: '', team: '', decision: 'Undecided', reason: '', due: '', contact: '', next: '', notes: '', updated: '' }; }
  function validDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function str(v, n) { return v === null || v === undefined ? '' : String(v).slice(0, n); }
  function decisionOf(v) { var s = String(v || '').toLowerCase().replace(/[^a-z]/g, ''); return s === 'go' ? 'Go' : s === 'nogo' ? 'No-go' : 'Undecided'; }
  // Accepts anything (old data, hand-edited JSON) and returns a safe, complete capture entry.
  function clean(e) {
    var o = blank(); e = e && typeof e === 'object' ? e : {};
    TEXT_FIELDS.forEach(function (k) { o[k] = str(e[k], LIMIT[k]); });
    o.decision = decisionOf(e.decision); o.due = validDate(e.due) ? e.due : ''; o.updated = typeof e.updated === 'string' ? e.updated.slice(0, 40) : '';
    if (e.snap && typeof e.snap === 'object') o.snap = cleanSnap(e.snap);
    return o;
  }
  function cleanSnap(s) {
    var o = { title: str(s.title, 400), agency: str(s.agency, 200), state: str(s.state, 40), status: str(s.status, 40), src: str(s.src, 60), url: /^https?:\/\//.test(s.url || '') ? String(s.url).slice(0, 1000) : '', asOf: str(s.asOf, 10) };
    o.fee = typeof s.fee === 'number' && isFinite(s.fee) ? s.fee : null; o.feeKind = str(s.feeKind, 80);
    o.notFee = typeof s.notFee === 'number' && isFinite(s.notFee) ? s.notFee : null; o.notFeeKind = str(s.notFeeKind, 120);
    return o;
  }
  // The small summary of a record kept next to the capture file, so the CSV still works if a later snapshot drops the record.
  // fee is ONLY a source-stated consultant fee (r.amt). Design-build values and project costs go to notFee and are labeled as not fees.
  function snapOf(r, asOf) {
    var s = { title: r.title || '', agency: r.agency || '', state: r.state || '', status: r.stage || r.status || '', src: r.src || '', url: r.url || '', asOf: asOf || '', fee: null, feeKind: '', notFee: null, notFeeKind: '' };
    if (r.amt && typeof r.amt.v === 'number') { s.fee = r.amt.v; s.feeKind = r.amt.kind || ''; }
    else if (r.dbValue && typeof r.dbValue.v === 'number') { s.notFee = r.dbValue.v; s.notFeeKind = 'design-build value (NOT a fee)'; }
    else if (r.projectCost && typeof r.projectCost.v === 'number') { s.notFee = r.projectCost.v; s.notFeeKind = 'project cost (NOT a fee)'; }
    return cleanSnap(s);
  }
  function isEmpty(e) { var b = blank(); return TEXT_FIELDS.concat(['decision', 'due']).every(function (k) { return e[k] === b[k]; }); }

  // ---- due dates. today is a YYYY-MM-DD string (the caller supplies US Central today).
  function dayNum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000; }
  // flag: none (no date) | overdue (before today) | soon (today through 14 days out) | later
  function dueInfo(due, today) {
    if (!validDate(due) || !validDate(today)) return { flag: 'none', days: null };
    var d = dayNum(due) - dayNum(today);
    return { flag: d < 0 ? 'overdue' : d <= SOON_DAYS ? 'soon' : 'later', days: d };
  }
  function dueText(due, today) {
    var i = dueInfo(due, today); if (i.flag === 'none') return 'No due date';
    if (i.days === 0) return 'Due today'; if (i.days === 1) return 'Due tomorrow';
    return i.days < 0 ? 'Overdue by ' + (-i.days) + ' day' + (i.days === -1 ? '' : 's') : 'Due in ' + i.days + ' days';
  }

  // ---- sorting. rows: [{ id, cap, title }]. Stable. due: soonest first, no date last. decision: Go, Undecided, No-go.
  var DEC_RANK = { 'Go': 0, 'Undecided': 1, 'No-go': 2 };
  function sortRows(rows, key) {
    var a = rows.map(function (r, i) { return { r: r, i: i }; });
    a.sort(function (x, y) {
      var cx = x.r.cap || blank(), cy = y.r.cap || blank(), c = 0;
      if (key === 'decision') c = DEC_RANK[cx.decision] - DEC_RANK[cy.decision];
      if (key === 'decision' || key === 'due') { var dx = cx.due || '9999-99-99', dy = cy.due || '9999-99-99'; if (!c) c = dx < dy ? -1 : dx > dy ? 1 : 0; }
      return c || x.i - y.i;
    });
    return a.map(function (x) { return x.r; });
  }

  // ---- CSV (UTF-8; the caller adds the BOM). rows: [{ id, cap, snap }]
  var CSV_COLS = ['id', 'title', 'agency', 'state', 'status', 'stated_consultant_fee', 'fee_kind', 'value_that_is_NOT_a_fee', 'not_fee_kind', 'go_no_go', 'go_no_go_reason', 'proposal_or_soq_due', 'due_flag', 'days_until_due', 'incumbent_consultant', 'teaming_partners_subs', 'key_contact', 'next_action', 'notes', 'capture_last_edited', 'source', 'source_url', 'snapshot_as_of'];
  function cell(v) { v = v === null || v === undefined ? '' : String(v); var raw = v; if (/^[=+@\t\r]/.test(v) || /^-[^0-9.]/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) || v !== raw ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows, today) {
    var lines = [CSV_COLS.join(',')];
    rows.forEach(function (r) {
      var c = r.cap || blank(), s = r.snap || {}, d = dueInfo(c.due, today);
      lines.push([r.id, s.title, s.agency, s.state, s.status, s.fee === null || s.fee === undefined ? '' : s.fee, s.feeKind, s.notFee === null || s.notFee === undefined ? '' : s.notFee, s.notFeeKind, c.decision, c.reason, c.due, d.flag === 'none' ? '' : d.flag, d.days === null ? '' : d.days, c.incumbent, c.team, c.contact, c.next, c.notes, c.updated, s.src, s.url, s.asOf].map(cell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  // ---- backup / restore. The backup holds the star list and every capture file.
  var BACKUP_APP = 'hydraulics-tools-radar-capture';
  function makeBackup(watch, caps, nowIso, appId) {
    var w = {}, c = {}; Object.keys(watch || {}).forEach(function (id) { w[id] = true; });
    Object.keys(caps || {}).forEach(function (id) { c[id] = clean(caps[id]); });
    return { app: appId || BACKUP_APP, version: 1, exportedAt: nowIso || '', watch: w, capture: c };
  }
  // Returns { ok, error, watch, capture, skipped } without touching storage.
  function parseBackup(text, appId) {
    var j; try { j = JSON.parse(String(text).replace(/^\ufeff/, '')); } catch (e) { return { ok: false, error: 'That file is not valid JSON.' }; }
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.app !== (appId || BACKUP_APP)) return { ok: false, error: 'That is not a Radar capture backup file.' };
    if (j.version !== 1) return { ok: false, error: 'This backup is version ' + j.version + ', which this page does not understand.' };
    var w = {}, c = {}, skipped = 0, wi = j.watch && typeof j.watch === 'object' ? j.watch : {}, ci = j.capture && typeof j.capture === 'object' ? j.capture : {};
    Object.keys(wi).forEach(function (id) { if (id && id.length <= 200 && id !== '__proto__') w[id] = true; else skipped++; });
    Object.keys(ci).forEach(function (id) { if (id && id.length <= 200 && id !== '__proto__' && ci[id] && typeof ci[id] === 'object') { c[id] = clean(ci[id]); w[id] = true; } else skipped++; });
    return { ok: true, watch: w, capture: c, skipped: skipped, exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt : '' };
  }
  // mode 'merge': stars are unioned; for a record in both, the capture file with the newer "updated" stamp wins (a file with a stamp beats one without).
  // mode 'replace': the backup becomes the whole state.
  function applyBackup(cur, inc, mode) {
    if (mode === 'replace') return { watch: Object.assign({}, inc.watch), capture: Object.assign({}, inc.capture) };
    var w = Object.assign({}, cur.watch, inc.watch), c = Object.assign({}, cur.capture);
    Object.keys(inc.capture).forEach(function (id) { var a = c[id], b = inc.capture[id]; if (!a || (b.updated || '') > (a.updated || '')) c[id] = b; });
    return { watch: w, capture: c };
  }

  return { DECISIONS: DECISIONS, SOON_DAYS: SOON_DAYS, TEXT_FIELDS: TEXT_FIELDS, CSV_COLS: CSV_COLS, BACKUP_APP: BACKUP_APP, OPP_BACKUP_APP: 'hydraulics-tools-opportunity-radar-capture', blank: blank, clean: clean, snapOf: snapOf, isEmpty: isEmpty, validDate: validDate, dueInfo: dueInfo, dueText: dueText, sortRows: sortRows, toCSV: toCSV, makeBackup: makeBackup, parseBackup: parseBackup, applyBackup: applyBackup };
});
