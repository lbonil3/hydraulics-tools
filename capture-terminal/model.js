/* Capture Terminal: pure logic (no DOM). Browser: window.CaptureModel. Node: require('./model.js').
   Planning aid for drainage PS&E pursuit capture. Ships with NO opportunity data. */
(function (root) {
  'use strict';
  var Src = (typeof module !== 'undefined' && module.exports) ? require('./sources.js') : root.CaptureSources;

  var APP_ID = 'Capture Terminal';
  var VERSION = 1;
  var STAGES = ['Identified', 'Qualifying', 'Pursue', 'Teaming', 'Proposal', 'Submitted', 'Shortlisted', 'Won', 'Lost', 'No-bid'];
  var ACTIVE = STAGES.slice(0, 7);
  var CLOSED = STAGES.slice(7);
  var ROLES = ['Prime', 'Sub', 'JV', 'TBD'];
  var DUE_KINDS = ['SOQ/RFQ', 'Proposal', 'Shortlist', 'Interview', 'Other'];
  var AGENCIES = ['TxDOT', 'Harris County', 'HCFCD', 'City of Houston', 'Fort Bend County', 'Montgomery County', 'Brazoria County', 'Galveston County', 'H-GAC', 'METRO', 'Port Houston'];
  // The 25 TxDOT districts.
  var DISTRICTS = ['Abilene', 'Amarillo', 'Atlanta', 'Austin', 'Beaumont', 'Brownwood', 'Bryan', 'Childress', 'Corpus Christi', 'Dallas', 'El Paso', 'Fort Worth', 'Houston', 'Laredo', 'Lubbock', 'Lufkin', 'Odessa', 'Paris', 'Pharr', 'San Angelo', 'San Antonio', 'Tyler', 'Waco', 'Wichita Falls', 'Yoakum'];
  var TYPES = ['Drainage PS&E', 'Hydrology/hydraulics', 'Storm sewer', 'Culvert', 'Ditch/channel', 'Detention', 'Roadway PS&E', 'Other'];

  // key: canonical field. s: kind. max: length cap. a: command aliases. l: label for CSV/UI.
  var FIELDS = [
    { k: 'title', s: 'text', max: 200, a: ['title', 't'], l: 'TITLE' },
    { k: 'agency', s: 'text', max: 80, a: ['agency', 'a'], l: 'AGENCY' },
    { k: 'district', s: 'text', max: 60, a: ['district', 'dist'], l: 'TXDOT DISTRICT' },
    { k: 'csj', s: 'text', max: 60, a: ['csj', 'sol', 'solicitation'], l: 'CSJ / SOLICITATION #' },
    { k: 'type', s: 'text', max: 80, a: ['type'], l: 'TYPE' },
    { k: 'county', s: 'text', max: 80, a: ['county'], l: 'COUNTY' },
    { k: 'cost', s: 'money', a: ['cost', 'construction'], l: 'EST. CONSTRUCTION COST' },
    { k: 'fee', s: 'money', a: ['fee'], l: 'EST. FEE' },
    { k: 'pwin', s: 'pwin', a: ['pwin', 'p'], l: 'PWIN' },
    { k: 'stage', s: 'stage', a: ['stage', 's'], l: 'STAGE' },
    { k: 'dueKind', s: 'text', max: 40, a: ['duekind', 'kind'], l: 'DUE KIND' },
    { k: 'due', s: 'date', a: ['due'], l: 'DUE DATE' },
    { k: 'letting', s: 'date', a: ['letting', 'let'], l: 'LETTING DATE' },
    { k: 'role', s: 'role', a: ['role'], l: 'ROLE' },
    { k: 'partners', s: 'text', max: 300, a: ['partners', 'team'], l: 'TEAMING PARTNERS' },
    { k: 'competitors', s: 'text', max: 300, a: ['competitors', 'comp', 'incumbent'], l: 'INCUMBENT / COMPETITORS' },
    { k: 'fit', s: 'text', max: 1000, a: ['fit'], l: 'STRATEGIC FIT' },
    { k: 'next', s: 'text', max: 300, a: ['next', 'action'], l: 'NEXT ACTION' },
    { k: 'nextDate', s: 'date', a: ['nextdate', 'by', 'nextby'], l: 'NEXT ACTION DATE' },
    { k: 'url', s: 'url', max: 500, a: ['url', 'src', 'source'], l: 'SOURCE URL' },
    { k: 'notes', s: 'text', max: 4000, a: ['notes', 'note'], l: 'NOTES' }
  ];
  var FIELD_BY_KEY = {}, ALIAS = {};
  FIELDS.forEach(function (f) { FIELD_BY_KEY[f.k] = f; f.a.forEach(function (a) { ALIAS[a] = f.k; }); });
  var FILTER_ALIAS = { agency: 'agency', a: 'agency', stage: 'stage', s: 'stage', district: 'district', dist: 'district', county: 'county', type: 'type', role: 'role', q: 'q', search: 'q' };

  /* ---------- dates & money ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function validDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function dayNum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000); }
  function daysUntil(date, today) { return (validDate(date) && validDate(today)) ? dayNum(date) - dayNum(today) : null; }
  function addDays(s, n) { var d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  // Accepts YYYY-MM-DD, today, tomorrow, +N, -N, +Nd, +Nw. Returns '' for clear, null for invalid.
  function parseDate(v, today) {
    v = String(v == null ? '' : v).trim().toLowerCase();
    if (v === '' || v === '-' || v === 'none') return '';
    if (validDate(v)) return v;
    if (v === 'today') return today;
    if (v === 'tomorrow') return addDays(today, 1);
    var m = /^([+-])(\d{1,4})([dw]?)$/.exec(v);
    if (m) return addDays(today, (m[1] === '-' ? -1 : 1) * +m[2] * (m[3] === 'w' ? 7 : 1));
    return null;
  }
  // 450k, 1.2m, $1,200,000, 2500. '' or '-' clears (returns ''). Invalid returns null.
  function parseMoney(v) {
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : null;
    v = String(v == null ? '' : v).trim().toLowerCase().replace(/[$,\s]/g, '');
    if (v === '' || v === '-' || v === 'none') return '';
    var m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(v); if (!m) return null;
    var n = parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
    return Math.round(n);
  }
  function fmtMoney(n) {
    if (n == null || n === '' || !isFinite(n)) return '--';
    n = Math.round(n);
    if (n >= 1e6) return '$' + (Math.round(n / 1e4) / 100).toString().replace(/\.?0+$/, function (x) { return x.indexOf('.') >= 0 ? '' : x; }) + 'M';
    if (n >= 1e4) return '$' + Math.round(n / 1e3) + 'K';
    if (n >= 1e3) return '$' + (Math.round(n / 100) / 10) + 'K';
    return '$' + n;
  }
  function fmtMoneyFull(n) { return (n == null || n === '' || !isFinite(n)) ? '--' : '$' + Math.round(n).toLocaleString('en-US'); }

  /* ---------- stages ---------- */
  function stageKey(v) {
    var s = String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return null;
    var exact = STAGES.filter(function (x) { return x.toLowerCase().replace(/[^a-z]/g, '') === s; });
    if (exact.length) return exact[0];
    if (s === 'nobid' || s === 'nb') return 'No-bid';
    var pre = STAGES.filter(function (x) { return x.toLowerCase().replace(/[^a-z]/g, '').indexOf(s) === 0; });
    return pre.length === 1 ? pre[0] : null;
  }
  function isActive(o) { return ACTIVE.indexOf(o.stage) >= 0; }
  function stageIndex(st) { return STAGES.indexOf(st); }

  /* ---------- records ---------- */
  function clip(s, n) { s = String(s == null ? '' : s).replace(/\r/g, '').trim(); return s.length > n ? s.slice(0, n) : s; }
  function roleKey(v) {
    var s = String(v || '').trim().toLowerCase(); if (!s) return '';
    if (s === 'prime') return 'Prime'; if (s === 'sub' || s === 'subconsultant') return 'Sub';
    if (s === 'jv' || s === 'joint venture') return 'JV'; if (s === 'tbd') return 'TBD';
    return null;
  }
  // Validate one field value from user text. Returns {v} or {err}.
  function parseField(key, raw, today) {
    var f = FIELD_BY_KEY[key]; if (!f) return { err: 'unknown field ' + key };
    switch (f.s) {
      case 'text': return { v: clip(raw, f.max) };
      case 'money': var m = parseMoney(raw); return m === null ? { err: f.l + ': use a number like 450k, 1.2m or 250000' } : { v: m === '' ? null : m };
      case 'pwin': var t = String(raw).trim().replace(/%$/, ''); if (!/^\d{1,3}$/.test(t) || +t > 100) return { err: 'PWIN: use 0 to 100' }; return { v: +t };
      case 'date': var d = parseDate(raw, today); return d === null ? { err: f.l + ': use YYYY-MM-DD, today, +7 or +2w' } : { v: d };
      case 'stage': var sk = stageKey(raw); return sk ? { v: sk } : { err: 'STAGE: one of ' + STAGES.join(', ') };
      case 'role': var r = roleKey(raw); return r === null ? { err: 'ROLE: Prime, Sub, JV or TBD' } : { v: r };
      case 'url': var u = String(raw || '').trim(); if (u === '' || u === '-') return { v: '' }; if (!/^https?:\/\/[^\s]+$/i.test(u) || u.length > f.max) return { err: 'URL: must start with http:// or https://' }; return { v: u };
    }
    return { v: raw };
  }
  function blankOpp() {
    return { id: 0, title: '', agency: '', district: '', csj: '', type: '', county: '', cost: null, fee: null, pwin: 0, stage: 'Identified',
      dueKind: '', due: '', letting: '', role: '', partners: '', competitors: '', fit: '', next: '', nextDate: '', url: '', notes: '', example: false, created: '', updated: '' };
  }
  // Lenient sanitize for stored/imported data. Invalid values become blank instead of throwing.
  function sanitizeOpp(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var o = blankOpp(), today = '1970-01-01';
    FIELDS.forEach(function (f) {
      if (raw[f.k] == null) return;
      if (f.s === 'date' && raw[f.k] !== '' && !validDate(String(raw[f.k]))) return; // stored dates are ISO only
      var r = parseField(f.k, f.s === 'money' && typeof raw[f.k] === 'number' ? raw[f.k] : raw[f.k], today);
      if (!r.err) o[f.k] = r.v;
    });
    if (o.cost === '') o.cost = null; if (o.fee === '') o.fee = null;
    if (raw.dueKind != null && !o.dueKind) o.dueKind = '';
    o.title = o.title || 'Untitled';
    o.example = raw.example === true || raw.example === 'true' || raw.example === 'TRUE' || raw.example === 'yes';
    var id = parseInt(raw.id, 10); o.id = id > 0 ? id : 0;
    o.created = isIso(raw.created) ? raw.created : ''; o.updated = isIso(raw.updated) ? raw.updated : '';
    return o;
  }
  function isIso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(s); }

  function newState() { return { app: APP_ID, version: VERSION, seq: 1, opps: [], view: { filter: {}, sort: 'due', dir: 'asc' } }; }
  function sanitizeState(raw) {
    var s = newState();
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.opps)) return s;
    var used = {}, list = [];
    raw.opps.slice(0, 5000).forEach(function (r) { var o = sanitizeOpp(r); if (o) list.push(o); });
    list.forEach(function (o) { if (o.id && !used[o.id]) used[o.id] = 1; else o.id = 0; });
    var max = list.reduce(function (m, o) { return Math.max(m, o.id); }, 0);
    list.forEach(function (o) { if (!o.id) o.id = ++max; });
    s.opps = list; s.seq = Math.max(max + 1, parseInt(raw.seq, 10) || 1);
    var v = raw.view || {};
    s.view.filter = cleanFilter(v.filter || {});
    s.view.sort = SORT_KEYS.indexOf(v.sort) >= 0 ? v.sort : 'due';
    s.view.dir = v.dir === 'desc' ? 'desc' : 'asc';
    return s;
  }
  function addOpp(state, fields, now) {
    var o = blankOpp(); Object.keys(fields || {}).forEach(function (k) { o[k] = fields[k]; });
    o.title = clip(o.title, 200) || 'Untitled';
    o.id = state.seq++; o.created = o.updated = now || new Date().toISOString();
    state.opps.push(o); return o;
  }
  function find(state, id) { id = parseInt(String(id).replace(/^#/, ''), 10); return state.opps.filter(function (o) { return o.id === id; })[0] || null; }
  function weighted(o) { return (o.fee || 0) * (o.pwin || 0) / 100; }

  /* ---------- filter & sort ---------- */
  var SORT_KEYS = ['due', 'next', 'fee', 'pwin', 'weighted', 'updated', 'stage', 'agency', 'title', 'id'];
  function cleanFilter(f) {
    var out = {};
    ['agency', 'district', 'county', 'type', 'role', 'q'].forEach(function (k) { if (f[k] != null && String(f[k]).trim()) out[k] = String(f[k]).trim().slice(0, 80); });
    if (f.stage != null) {
      var arr = (Array.isArray(f.stage) ? f.stage : String(f.stage).split(',')).map(function (x) {
        var t = String(x).trim().toLowerCase(); if (t === 'active' || t === 'closed') return t; return stageKey(t);
      }).filter(Boolean);
      if (arr.length) out.stage = arr;
    }
    return out;
  }
  function describeFilter(f) {
    var p = Object.keys(f).map(function (k) { return k + '=' + (Array.isArray(f[k]) ? f[k].join(',') : f[k]); });
    return p.length ? p.join(' ') : 'none';
  }
  function matches(o, f) {
    var has = function (v, q) { return String(v || '').toLowerCase().indexOf(String(q).toLowerCase()) >= 0; };
    if (f.agency && !has(o.agency, f.agency)) return false;
    if (f.district && !has(o.district, f.district)) return false;
    if (f.county && !has(o.county, f.county)) return false;
    if (f.type && !has(o.type, f.type)) return false;
    if (f.role && !has(o.role, f.role)) return false;
    if (f.stage) {
      var ok = f.stage.some(function (s) { return s === 'active' ? isActive(o) : s === 'closed' ? !isActive(o) : s === o.stage; });
      if (!ok) return false;
    }
    if (f.q) {
      var hay = [o.title, o.agency, o.district, o.csj, o.type, o.county, o.partners, o.competitors, o.fit, o.next, o.notes].join(' ').toLowerCase();
      if (f.q.toLowerCase().split(/\s+/).some(function (w) { return hay.indexOf(w) < 0; })) return false;
    }
    return true;
  }
  function sortOpps(list, key, dir) {
    var mul = dir === 'desc' ? -1 : 1;
    var val = {
      due: function (o) { return o.due || null; }, next: function (o) { return o.nextDate || null; },
      fee: function (o) { return o.fee; }, pwin: function (o) { return o.pwin; }, weighted: function (o) { return o.fee == null ? null : weighted(o); },
      updated: function (o) { return o.updated || null; }, stage: function (o) { return stageIndex(o.stage); },
      agency: function (o) { return o.agency ? o.agency.toLowerCase() : null; }, title: function (o) { return o.title.toLowerCase(); }, id: function (o) { return o.id; }
    }[key] || function (o) { return o.id; };
    return list.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x == null && y == null) return a.id - b.id;
      if (x == null) return 1; if (y == null) return -1; // blanks always last
      if (x < y) return -1 * mul; if (x > y) return 1 * mul;
      return a.id - b.id;
    });
  }
  function visible(state) { var v = state.view; return sortOpps(state.opps.filter(function (o) { return matches(o, v.filter); }), v.sort, v.dir); }

  /* ---------- deadlines ---------- */
  function dueFlag(days) {
    if (days == null) return { key: 'none', label: '' };
    if (days < 0) return { key: 'past', label: 'PAST DUE' };
    if (days <= 7) return { key: 'd7', label: 'DUE <=7D' };
    if (days <= 14) return { key: 'd14', label: 'DUE <=14D' };
    return { key: 'ok', label: 'ON TRACK' };
  }
  // Submitted/Shortlisted opportunities are past their submission deadline by definition, so only
  // pre-submission stages produce deadline entries. Next-action dates count for every active stage.
  function dueEntries(opps, today, windowDays) {
    var out = [];
    opps.forEach(function (o) {
      if (!isActive(o)) return;
      if (o.due && stageIndex(o.stage) < stageIndex('Submitted')) out.push({ o: o, kind: 'deadline', label: (o.dueKind || 'due'), date: o.due, days: daysUntil(o.due, today) });
      if (o.nextDate) out.push({ o: o, kind: 'action', label: o.next || 'next action', date: o.nextDate, days: daysUntil(o.nextDate, today) });
    });
    out = out.filter(function (e) { return windowDays == null || e.days <= windowDays; });
    out.sort(function (a, b) { return a.days - b.days || a.o.id - b.o.id; });
    return out;
  }

  /* ---------- dashboard numbers ---------- */
  function stats(opps, today) {
    var s = { total: opps.length, active: 0, closed: 0, byStage: {}, byAgency: [], feeActive: 0, weightedActive: 0, wonFee: 0, won: 0, lost: 0, nobid: 0, winRate: null,
      past: 0, d7: 0, d14: 0, undated: 0 };
    STAGES.forEach(function (st) { s.byStage[st] = { n: 0, fee: 0, w: 0 }; });
    var ag = {};
    opps.forEach(function (o) {
      var b = s.byStage[o.stage]; b.n++; b.fee += o.fee || 0; b.w += weighted(o);
      if (isActive(o)) {
        s.active++; s.feeActive += o.fee || 0; s.weightedActive += weighted(o);
        var key = (o.agency || '(none)').toLowerCase();
        var a = ag[key] || (ag[key] = { agency: o.agency || '(none)', n: 0, fee: 0, w: 0 });
        a.n++; a.fee += o.fee || 0; a.w += weighted(o);
        if (!o.due) s.undated++;
      } else s.closed++;
      if (o.stage === 'Won') { s.won++; s.wonFee += o.fee || 0; }
      if (o.stage === 'Lost') s.lost++;
      if (o.stage === 'No-bid') s.nobid++;
    });
    s.byAgency = Object.keys(ag).map(function (k) { return ag[k]; }).sort(function (a, b) { return b.w - a.w || b.fee - a.fee || (a.agency < b.agency ? -1 : 1); });
    s.winRate = (s.won + s.lost) > 0 ? s.won / (s.won + s.lost) : null;
    dueEntries(opps, today).forEach(function (e) {
      if (e.kind !== 'deadline') return;
      if (e.days < 0) s.past++; else if (e.days <= 7) s.d7++; else if (e.days <= 14) s.d14++;
    });
    return s;
  }
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // Weighted fee of active opportunities by month of their due date, current month + (n-1) following.
  function monthSeries(opps, today, n) {
    n = n || 6;
    var y = +today.slice(0, 4), m = +today.slice(5, 7) - 1, base = y * 12 + m;
    var r = { labels: [], values: [], fees: [], earlier: 0, later: 0, undated: 0, any: false };
    for (var i = 0; i < n; i++) { r.labels.push(MONTHS[(m + i) % 12]); r.values.push(0); r.fees.push(0); }
    opps.forEach(function (o) {
      if (!isActive(o)) return;
      if (!o.due) { r.undated++; return; }
      var idx = (+o.due.slice(0, 4)) * 12 + (+o.due.slice(5, 7) - 1) - base;
      if (idx < 0) r.earlier += weighted(o); else if (idx >= n) r.later += weighted(o);
      else { r.values[idx] += weighted(o); r.fees[idx] += o.fee || 0; r.any = true; }
    });
    return r;
  }
  var BOXES = [
    { k: 'identified', label: 'IDENTIFIED', stages: ['Identified'] }, { k: 'qualifying', label: 'QUALIFYING', stages: ['Qualifying'] },
    { k: 'pursue', label: 'PURSUE', stages: ['Pursue'] }, { k: 'teaming', label: 'TEAMING', stages: ['Teaming'] },
    { k: 'proposal', label: 'PROPOSAL', stages: ['Proposal'] }, { k: 'submitted', label: 'SUBMITTED', stages: ['Submitted', 'Shortlisted'] },
    { k: 'result', label: 'RESULT', stages: ['Won', 'Lost', 'No-bid'] }
  ];
  function pipelineBoxes(opps) {
    return BOXES.map(function (b) {
      var list = opps.filter(function (o) { return b.stages.indexOf(o.stage) >= 0; }).sort(function (x, y) { return x.id - y.id; });
      return { k: b.k, label: b.label, stages: b.stages, opps: list, n: list.length };
    });
  }
  function bar(v, max, w) { w = w || 12; var n = max > 0 ? Math.round(v / max * w) : 0; if (v > 0 && n === 0) n = 1; return new Array(n + 1).join('\u2588') + new Array(w - n + 1).join('\u2591'); }

  /* ---------- CSV / JSON ---------- */
  var CSV_COLS = [['id', 'id'], ['title', 'title'], ['agency', 'agency'], ['district', 'district'], ['csj', 'csj_or_solicitation'], ['type', 'type'], ['county', 'county'],
    ['cost', 'est_construction_cost'], ['fee', 'est_fee'], ['pwin', 'pwin_pct'], ['_w', 'weighted_fee'], ['stage', 'stage'], ['dueKind', 'due_kind'], ['due', 'due_date'],
    ['letting', 'letting_date'], ['role', 'role'], ['partners', 'teaming_partners'], ['competitors', 'incumbent_competitors'], ['fit', 'strategic_fit'],
    ['next', 'next_action'], ['nextDate', 'next_action_date'], ['url', 'source_url'], ['notes', 'notes'], ['example', 'example'], ['created', 'created'], ['updated', 'updated']];
  function csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s; // spreadsheet formula guard
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(opps) {
    var rows = [CSV_COLS.map(function (c) { return c[1]; }).join(',')];
    opps.forEach(function (o) {
      rows.push(CSV_COLS.map(function (c) { return csvCell(c[0] === '_w' ? Math.round(weighted(o)) : c[0] === 'example' ? (o.example ? 'yes' : '') : o[c[0]]); }).join(','));
    });
    return rows.join('\r\n') + '\r\n';
  }
  function parseCSV(text) {
    text = String(text).replace(/^\ufeff/, '');
    var rows = [], row = [], cur = '', q = false, i = 0, c;
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }
  function toJSON(state, now) { return JSON.stringify({ app: APP_ID, version: VERSION, exported: now || new Date().toISOString(), seq: state.seq, opps: state.opps }, null, 1); }
  // Returns {opps:[sanitized], format, error?}. Does not touch state.
  function parseImport(text) {
    text = String(text || '').trim();
    if (!text) return { opps: [], error: 'nothing to import' };
    try {
      if (text[0] === '{' || text[0] === '[') {
        var j = JSON.parse(text), arr = Array.isArray(j) ? j : j && j.opps;
        if (!Array.isArray(arr)) return { opps: [], error: 'JSON has no "opps" list' };
        var list = arr.slice(0, 5000).map(sanitizeOpp).filter(Boolean);
        return { opps: list, format: 'json', seq: j && j.seq };
      }
      var rows = parseCSV(text); if (rows.length < 2) return { opps: [], error: 'CSV needs a header row and at least one row' };
      var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
      var map = {}; CSV_COLS.forEach(function (c) { var ix = head.indexOf(c[1]); if (ix >= 0 && c[0] !== '_w') map[c[0]] = ix; });
      if (map.title == null) return { opps: [], error: 'CSV has no "title" column (use a Capture Terminal export)' };
      var out = rows.slice(1, 5001).map(function (r) {
        var raw = {}; Object.keys(map).forEach(function (k) { var v = r[map[k]]; if (v != null) raw[k] = v.replace(/^'(?=[=+\-@\t\r])/, ''); });
        return sanitizeOpp(raw);
      }).filter(Boolean);
      return { opps: out, format: 'csv' };
    } catch (e) { return { opps: [], error: 'could not read that text: ' + e.message }; }
  }
  function applyImport(state, opps, mode, now) {
    now = now || new Date().toISOString();
    if (mode === 'replace') {
      var tmp = sanitizeState({ opps: opps, seq: 1, view: state.view });
      tmp.opps.forEach(function (o) { if (!o.created) o.created = now; if (!o.updated) o.updated = now; });
      state.opps = tmp.opps; state.seq = tmp.seq;
    } else {
      opps.forEach(function (o) { var c = JSON.parse(JSON.stringify(o)); c.id = state.seq++; c.created = c.created || now; c.updated = c.updated || now; state.opps.push(c); });
    }
    return opps.length;
  }

  /* ---------- example data (clearly fake, deletable) ---------- */
  function makeExamples(state, today, now) {
    var d = function (n) { return addDays(today, n); };
    var tag = '[EXAMPLE] ';
    var note = 'EXAMPLE ROW, not a real solicitation. Remove all example rows with: purge example';
    var rows = [
      { title: tag + 'Sample drainage PS&E, past-due qualifier', agency: 'TxDOT', district: 'Houston', type: 'Drainage PS&E', county: 'Harris', fee: 800000, pwin: 40, stage: 'Qualifying', dueKind: 'SOQ/RFQ', due: d(-2), next: 'Example: confirm teaming', nextDate: d(-1), role: 'Prime' },
      { title: tag + 'Sample storm sewer design, due this week', agency: 'City of Houston', type: 'Storm sewer', county: 'Harris', fee: 450000, pwin: 60, stage: 'Pursue', dueKind: 'Proposal', due: d(5), next: 'Example: draft approach', nextDate: d(3), role: 'Prime' },
      { title: tag + 'Sample culvert H&H, due in two weeks', agency: 'HCFCD', type: 'Hydrology/hydraulics', county: 'Harris', fee: 1200000, pwin: 30, stage: 'Teaming', dueKind: 'SOQ/RFQ', due: d(12), next: 'Example: call sub partner', nextDate: d(9), role: 'Sub' },
      { title: tag + 'Sample county drainage on-call, later', agency: 'Fort Bend County', type: 'Drainage PS&E', county: 'Fort Bend', fee: 300000, pwin: 50, stage: 'Identified', dueKind: 'SOQ/RFQ', due: d(45), role: 'TBD' },
      { title: tag + 'Sample submitted proposal', agency: 'TxDOT', district: 'Houston', type: 'Drainage PS&E', county: 'Brazoria', fee: 950000, pwin: 55, stage: 'Submitted', dueKind: 'Proposal', due: d(-10), next: 'Example: follow up', nextDate: d(6), role: 'Prime' },
      { title: tag + 'Sample win', agency: 'TxDOT', district: 'Houston', type: 'Ditch/channel', county: 'Harris', fee: 600000, pwin: 100, stage: 'Won', role: 'Prime' },
      { title: tag + 'Sample loss', agency: 'Harris County', type: 'Detention', county: 'Harris', fee: 500000, pwin: 0, stage: 'Lost', role: 'Sub' },
      { title: tag + 'Sample no-bid', agency: 'METRO', type: 'Other', fee: 200000, pwin: 0, stage: 'No-bid', role: 'TBD' }
    ];
    rows.forEach(function (r) { r.notes = note; r.example = true; addOpp(state, r, now); });
    return rows.length;
  }

  /* ---------- command language ---------- */
  var HELP = [
    ['help', 'this list'],
    ['add [title] [k=v ...]', 'new opportunity (no args opens the form)'],
    ['list', 'opportunities, filtered and sorted'],
    ['show <id>', 'full detail'],
    ['edit <id> [k=v ...]', 'change fields (no k=v opens the form)'],
    ['stage <id> <stage>', 'move stage: ' + STAGES.join(', ').toLowerCase()],
    ['delete <id>', 'remove (undo brings it back)'],
    ['filter k=v ...', 'agency stage district county type role q; stage=active|closed; filter off'],
    ['sort <key> [desc]', SORT_KEYS.join(' ')],
    ['due [days]', 'past-due and upcoming deadlines and next actions'],
    ['stats', 'pipeline by stage and agency, weighted fee'],
    ['sources', 'where to find opportunities'],
    ['export csv|json', 'download your data'],
    ['import', 'restore JSON backup or CSV'],
    ['example', 'load clearly marked EXAMPLE rows'],
    ['purge example', 'delete every EXAMPLE row'],
    ['undo', 'undo last delete, import, wipe, purge'],
    ['clear', 'close this output'],
    ['wipe', 'erase ALL data (undo available)']
  ];
  var KV_KEYS = 'k=v keys: title agency district csj type county cost fee pwin stage duekind due letting role partners comp fit next nextdate url notes. Dates: 2026-12-01, today, +7, +2w. Money: 450k, 1.2m.';

  function tokenize(line) {
    var out = [], cur = '', q = null, has = false, i, c;
    for (i = 0; i < line.length; i++) {
      c = line[i];
      if (q) { if (c === q) q = null; else cur += c; }
      else if (c === '"' || c === "'") { q = c; has = true; }
      else if (/\s/.test(c)) { if (cur !== '' || has) { out.push(cur); cur = ''; has = false; } }
      else cur += c;
    }
    if (cur !== '' || has) out.push(cur);
    return out;
  }
  function parseCommand(line) {
    var toks = tokenize(String(line || '').trim());
    var r = { cmd: (toks.shift() || '').toLowerCase(), args: [], kv: {}, rawKv: [], rest: [] };
    toks.forEach(function (t) {
      var m = /^([A-Za-z]+)=(.*)$/.exec(t);
      if (m) { r.rawKv.push([m[1].toLowerCase(), m[2]]); } else r.rest.push(t);
    });
    r.args = r.rest;
    return r;
  }
  var CMD_ALIAS = { '?': 'help', ls: 'list', rm: 'delete', del: 'delete', cls: 'clear', dash: 'clear', ex: 'export', pipeline: 'stats', sum: 'stats', src: 'sources', new: 'add' };

  function L(s, c) { return { k: 'line', s: s, c: c || '' }; }
  function chips(list) { return { k: 'chips', chips: list }; }

  function setFields(o, rawKv, today) {
    var errs = [], changed = [];
    rawKv.forEach(function (p) {
      var key = ALIAS[p[0]];
      if (!key) { errs.push('unknown field "' + p[0] + '"'); return; }
      var r = parseField(key, p[1], today);
      if (r.err) errs.push(r.err); else { o[key] = r.v; changed.push(key); }
    });
    return { errs: errs, changed: changed };
  }
  function snap(state) { state._undo = JSON.stringify({ opps: state.opps, seq: state.seq }); }

  // run(state, line, ctx) -> { out:[blocks], fx:{}, changed:bool }. ctx: { today, now }
  function run(state, line, ctx) {
    ctx = ctx || {}; var today = ctx.today || todayStr(), now = ctx.now || new Date().toISOString();
    var p = parseCommand(line), cmd = CMD_ALIAS[p.cmd] || p.cmd, out = [], fx = {}, changed = false;
    function err(m) { out.push(L('ERR ' + m, 'err')); }
    function need(idArg) {
      if (idArg == null) { err('give an id, e.g. ' + cmd + ' 1'); return null; }
      var o = find(state, idArg); if (!o) { err('no opportunity #' + String(idArg).replace(/^#/, '')); return null; }
      return o;
    }
    function listOut(list, title, rowCmd) {
      if (!list.length) { out.push(L(state.opps.length ? 'No match. Try: filter off' : 'No opportunities yet. Tap add, or type: example', 'dim')); return; }
      if (title) out.push(L(title, 'head'));
      list.forEach(function (o) { out.push({ k: 'opp', o: o, today: today, cmd: (rowCmd || 'show') + ' ' + o.id }); });
    }
    switch (cmd) {
      case '':
        break;
      case 'help':
        out.push(L('COMMANDS', 'head'));
        HELP.forEach(function (h) { out.push({ k: 'kv', rows: [[h[0], h[1]]] }); });
        out.push(L(KV_KEYS, 'dim'));
        out.push(L('Every command also has a button; you never have to type.', 'dim'));
        break;
      case 'add': {
        if (!p.rawKv.length && !p.rest.length) { fx.openForm = 'new'; break; }
        var f = { title: p.rest.join(' ') };
        var o = blankOpp(); var r = setFields(o, p.rawKv, today);
        if (r.errs.length) { r.errs.forEach(err); break; }
        r.changed.forEach(function (k) { f[k] = o[k]; });
        if (!f.title) { err('add needs a title, e.g. add "Sample title" agency=TxDOT'); break; }
        var n = addOpp(state, f, now); changed = true;
        out.push(L('ADDED #' + n.id + ' ' + n.title, 'ok'));
        out.push(chips([{ label: 'show ' + n.id, cmd: 'show ' + n.id }, { label: 'edit ' + n.id, cmd: 'edit ' + n.id }]));
        break;
      }
      case 'list': {
        if (p.rawKv.length || p.rest.length) { // list accepts filter terms for one-off use
          var tmp = state.view.filter; var fkv = {};
          p.rawKv.forEach(function (kv) { var k = FILTER_ALIAS[kv[0]]; if (k) fkv[k] = kv[1]; });
          if (p.rest.length && !fkv.q) fkv.q = p.rest.join(' ');
          var cf = cleanFilter(fkv), lst = sortOpps(state.opps.filter(function (o) { return matches(o, cf); }), state.view.sort, state.view.dir);
          out.push(L(lst.length + ' of ' + state.opps.length + ' match (' + describeFilter(cf) + ')', 'dim')); listOut(lst); break;
        }
        var vis = visible(state);
        out.push(L(vis.length + ' of ' + state.opps.length + ' shown | filter: ' + describeFilter(state.view.filter) + ' | sort: ' + state.view.sort + ' ' + state.view.dir, 'dim'));
        listOut(vis);
        break;
      }
      case 'show': {
        if (!p.args.length) { listOut(visible(state), 'PICK ONE', 'show'); break; }
        var s1 = need(p.args[0]); if (!s1) break;
        out.push({ k: 'detail', o: s1, today: today });
        var cs = [{ label: 'edit', cmd: 'edit ' + s1.id }, { label: 'delete', cmd: 'delete ' + s1.id }];
        STAGES.forEach(function (st) { if (st !== s1.stage) cs.push({ label: '> ' + st, cmd: 'stage ' + s1.id + ' ' + st }); });
        out.push(chips(cs));
        break;
      }
      case 'edit':
      case 'set': {
        if (!p.args.length) { listOut(visible(state), 'PICK ONE TO EDIT', 'edit'); break; }
        var e = need(p.args[0]); if (!e) break;
        if (!p.rawKv.length && p.args.length < 2) { fx.openForm = e.id; break; }
        var tryO = JSON.parse(JSON.stringify(e)); var rr = setFields(tryO, p.rawKv, today);
        if (p.args.length > 1 && !p.rawKv.length) { err('use k=v pairs, e.g. edit ' + e.id + ' fee=500k'); break; }
        if (rr.errs.length) { rr.errs.forEach(err); break; }
        Object.keys(tryO).forEach(function (k) { e[k] = tryO[k]; }); e.updated = now; changed = true;
        out.push(L('UPDATED #' + e.id + ': ' + rr.changed.join(', '), 'ok'));
        break;
      }
      case 'stage': {
        if (!p.args.length) { listOut(visible(state), 'PICK ONE TO MOVE', 'stage'); break; }
        var g = need(p.args[0]); if (!g) break;
        if (p.args.length < 2) {
          out.push(L('#' + g.id + ' is ' + g.stage.toUpperCase() + '. Move to:', 'head'));
          out.push(chips(STAGES.filter(function (st) { return st !== g.stage; }).map(function (st) { return { label: st, cmd: 'stage ' + g.id + ' ' + st }; })));
          break;
        }
        var sk = stageKey(p.args.slice(1).join(' ')); if (!sk) { err('unknown stage. Use: ' + STAGES.join(', ')); break; }
        g.stage = sk; g.updated = now; changed = true;
        out.push(L('#' + g.id + ' -> ' + sk.toUpperCase(), 'ok'));
        if (sk === 'No-bid' || sk === 'Lost') fx.stamp = sk.toUpperCase();
        break;
      }
      case 'delete': {
        if (!p.args.length) { listOut(visible(state), 'PICK ONE TO DELETE (undo available)', 'delete'); break; }
        var d = need(p.args[0]); if (!d) break;
        snap(state); state.opps = state.opps.filter(function (x) { return x !== d; }); changed = true;
        out.push(L('DELETED #' + d.id + ' ' + d.title, 'warn'));
        out.push(chips([{ label: 'undo', cmd: 'undo' }]));
        break;
      }
      case 'filter': {
        if (p.rest.length === 1 && !p.rawKv.length && /^(off|reset|none|clear)$/i.test(p.rest[0])) { state.view.filter = {}; changed = true; out.push(L('FILTER cleared', 'ok')); break; }
        if (!p.rawKv.length && !p.rest.length) { fx.openFilter = true; out.push(L('filter: ' + describeFilter(state.view.filter), 'dim')); break; }
        var fkv2 = {}, bad = [];
        p.rawKv.forEach(function (kv) { var k = FILTER_ALIAS[kv[0]]; if (!k) bad.push(kv[0]); else fkv2[k] = kv[1]; });
        if (bad.length) { err('unknown filter key ' + bad.join(', ') + '. Keys: agency stage district county type role q'); break; }
        if (p.rest.length) fkv2.q = (fkv2.q ? fkv2.q + ' ' : '') + p.rest.join(' ');
        if (fkv2.stage) {
          var badSt = String(fkv2.stage).split(',').filter(function (x) { x = x.trim().toLowerCase(); return x && x !== 'active' && x !== 'closed' && !stageKey(x); });
          if (badSt.length) { err('unknown stage ' + badSt.join(', ')); break; }
        }
        state.view.filter = cleanFilter(fkv2); changed = true;
        out.push(L('FILTER ' + describeFilter(state.view.filter), 'ok'));
        listOut(visible(state));
        break;
      }
      case 'sort': {
        if (!p.rest.length) {
          out.push(L('sort: ' + state.view.sort + ' ' + state.view.dir + '. Pick a key:', 'head'));
          out.push(chips(SORT_KEYS.map(function (k) { return { label: k, cmd: 'sort ' + k }; }).concat([{ label: 'reverse', cmd: 'sort ' + state.view.sort + ' ' + (state.view.dir === 'asc' ? 'desc' : 'asc') }])));
          break;
        }
        var key = p.rest[0].toLowerCase();
        if (SORT_KEYS.indexOf(key) < 0) { err('sort keys: ' + SORT_KEYS.join(' ')); break; }
        var dir = (p.rest[1] || '').toLowerCase();
        if (dir && dir !== 'asc' && dir !== 'desc') { err('direction: asc or desc'); break; }
        state.view.sort = key; state.view.dir = dir || (['fee', 'pwin', 'weighted', 'updated'].indexOf(key) >= 0 ? 'desc' : 'asc'); changed = true;
        out.push(L('SORT ' + key + ' ' + state.view.dir, 'ok'));
        listOut(visible(state));
        break;
      }
      case 'due': {
        var win = null;
        if (p.args.length) { if (!/^\d{1,4}$/.test(p.args[0])) { err('due takes a number of days, e.g. due 14'); break; } win = +p.args[0]; }
        var de = dueEntries(state.opps, today, win);
        out.push(L('DEADLINES AND NEXT ACTIONS' + (win != null ? ' (within ' + win + ' days)' : '') + ' | today ' + today, 'head'));
        if (!de.length) { out.push(L(state.opps.length ? 'Nothing dated. Set due= or nextdate= on an active opportunity.' : 'No opportunities yet.', 'dim')); break; }
        de.forEach(function (x) { out.push({ k: 'due', e: x, cmd: 'show ' + x.o.id }); });
        break;
      }
      case 'stats': {
        var st = stats(state.opps, today);
        out.push(L('PIPELINE | ' + st.active + ' active, ' + st.closed + ' closed | est. fee ' + fmtMoneyFull(st.feeActive) + ' | weighted ' + fmtMoneyFull(st.weightedActive), 'head'));
        if (!state.opps.length) { out.push(L('No opportunities yet.', 'dim')); break; }
        out.push(L('WEIGHTED FEE BY STAGE (est. fee x Pwin, active only)', 'sub'));
        var maxW = Math.max.apply(null, ACTIVE.map(function (s) { return st.byStage[s].w; }));
        out.push({ k: 'bars', rows: ACTIVE.map(function (s) { var b = st.byStage[s]; return { label: s.toUpperCase(), bar: bar(b.w, maxW), text: b.n + ' | ' + fmtMoney(b.w) + ' of ' + fmtMoney(b.fee) }; }) });
        out.push(L('WEIGHTED FEE BY AGENCY (active only)', 'sub'));
        var maxA = Math.max.apply(null, st.byAgency.map(function (a) { return a.w; }).concat([0]));
        out.push({ k: 'bars', rows: st.byAgency.map(function (a) { return { label: a.agency.toUpperCase(), bar: bar(a.w, maxA), text: a.n + ' | ' + fmtMoney(a.w) + ' of ' + fmtMoney(a.fee) }; }) });
        out.push(L('RESULTS', 'sub'));
        out.push({ k: 'kv', rows: [['WON', st.won + ' (' + fmtMoneyFull(st.wonFee) + ' est. fee)'], ['LOST', String(st.lost)], ['NO-BID', String(st.nobid)],
          ['WIN RATE', st.winRate == null ? '-- (needs a won or lost result)' : Math.round(st.winRate * 100) + '% = won / (won + lost)'],
          ['PAST DUE', String(st.past)], ['DUE <=7D', String(st.d7)], ['DUE <=14D', String(st.d14)], ['NO DUE DATE', String(st.undated) + ' active']] });
        out.push(L('Weighted = est. fee x Pwin. Pwin is your own estimate.', 'dim'));
        break;
      }
      case 'sources': {
        out.push(L('WHERE TO LOOK (opened and checked ' + Src.VERIFIED_ON + ')', 'head'));
        Src.SOURCES.forEach(function (g) {
          out.push(L(g.g.toUpperCase(), 'sub'));
          g.items.forEach(function (it) { out.push({ k: 'source', it: it }); });
        });
        out.push(L('NOT VERIFIED / NOT INCLUDED', 'sub'));
        Src.NOT_VERIFIED.forEach(function (t) { out.push(L('- ' + t, 'dim')); });
        out.push(L('Links open the agency site. This tool never reads them. Verify solicitation details at the source.', 'dim'));
        break;
      }
      case 'export': {
        var fmt = (p.args[0] || '').toLowerCase();
        if (fmt !== 'csv' && fmt !== 'json') { out.push(L('Export which format?', 'head')); out.push(chips([{ label: 'export csv', cmd: 'export csv' }, { label: 'export json', cmd: 'export json' }])); break; }
        if (!state.opps.length) { out.push(L('Nothing to export yet.', 'dim')); break; }
        var stamp = today.replace(/-/g, '');
        fx.download = fmt === 'csv' ? { name: 'capture-terminal-' + stamp + '.csv', mime: 'text/csv', text: toCSV(state.opps) } : { name: 'capture-terminal-' + stamp + '.json', mime: 'application/json', text: toJSON(state, now) };
        out.push(L('EXPORT ' + fmt.toUpperCase() + ': ' + state.opps.length + ' rows -> ' + fx.download.name, 'ok'));
        break;
      }
      case 'import': fx.openImport = true; out.push(L('Import: paste text or choose a file in the window that opened.', 'dim')); break;
      case 'example': {
        if (state.opps.some(function (o) { return o.example; })) { err('example rows are already loaded. Remove with: purge example'); break; }
        snap(state); var cnt = makeExamples(state, today, now); changed = true;
        out.push(L('LOADED ' + cnt + ' EXAMPLE rows (fake, for trying the tool). Remove them: purge example', 'warn'));
        out.push(chips([{ label: 'purge example', cmd: 'purge example' }, { label: 'stats', cmd: 'stats' }, { label: 'due', cmd: 'due' }]));
        break;
      }
      case 'purge': {
        if ((p.args[0] || '').toLowerCase() !== 'example') { err('purge example removes example rows'); break; }
        var before = state.opps.length; snap(state); state.opps = state.opps.filter(function (o) { return !o.example; }); changed = true;
        out.push(L('PURGED ' + (before - state.opps.length) + ' example rows', 'ok'));
        if (before !== state.opps.length) out.push(chips([{ label: 'undo', cmd: 'undo' }]));
        break;
      }
      case 'undo': {
        if (!state._undo) { err('nothing to undo'); break; }
        var u = JSON.parse(state._undo); state.opps = u.opps; state.seq = Math.max(u.seq, state.seq); state._undo = null; changed = true;
        out.push(L('UNDONE. ' + state.opps.length + ' opportunities.', 'ok'));
        break;
      }
      case 'clear': fx.clearScreen = true; break;
      case 'wipe': {
        snap(state); var nn = state.opps.length; state.opps = []; state.view.filter = {}; changed = true;
        out.push(L('WIPED ' + nn + ' opportunities.', 'warn')); out.push(chips([{ label: 'undo', cmd: 'undo' }]));
        break;
      }
      default:
        err('unknown command "' + p.cmd + '". Type help');
        out.push(chips([{ label: 'help', cmd: 'help' }]));
    }
    return { out: out, fx: fx, changed: changed };
  }

  var api = {
    APP_ID: APP_ID, VERSION: VERSION, STAGES: STAGES, ACTIVE: ACTIVE, CLOSED: CLOSED, ROLES: ROLES, DUE_KINDS: DUE_KINDS, AGENCIES: AGENCIES, DISTRICTS: DISTRICTS, TYPES: TYPES,
    FIELDS: FIELDS, SORT_KEYS: SORT_KEYS, HELP: HELP, BOXES: BOXES,
    todayStr: todayStr, validDate: validDate, daysUntil: daysUntil, addDays: addDays, parseDate: parseDate, parseMoney: parseMoney, fmtMoney: fmtMoney, fmtMoneyFull: fmtMoneyFull,
    stageKey: stageKey, isActive: isActive, parseField: parseField, blankOpp: blankOpp, sanitizeOpp: sanitizeOpp, newState: newState, sanitizeState: sanitizeState,
    addOpp: addOpp, find: find, weighted: weighted, cleanFilter: cleanFilter, describeFilter: describeFilter, matches: matches, sortOpps: sortOpps, visible: visible,
    dueFlag: dueFlag, dueEntries: dueEntries, stats: stats, monthSeries: monthSeries, pipelineBoxes: pipelineBoxes, bar: bar,
    toCSV: toCSV, parseCSV: parseCSV, toJSON: toJSON, parseImport: parseImport, applyImport: applyImport, makeExamples: makeExamples,
    tokenize: tokenize, parseCommand: parseCommand, run: run, snap: snap
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CaptureModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
