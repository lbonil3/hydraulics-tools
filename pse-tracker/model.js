/* PS&E Tracker: pure logic (no DOM). Works in browser (window.PseModel) and Node (tests). */
(function (root) {
  var D = (typeof module !== 'undefined' && module.exports) ? require('./defaults.js') : root.PseDefaults;
  var Bid = (typeof module !== 'undefined' && module.exports) ? require('../bid-cost/lookup.js') : root.BidCostLookup;

  var STATUSES = [
    { key: 'todo', label: 'Not started' },
    { key: 'doing', label: 'In progress' },
    { key: 'review', label: 'In review' },
    { key: 'done', label: 'Done' },
    { key: 'na', label: 'N/A' }
  ];
  var STATUS_KEYS = STATUSES.map(function (s) { return s.key; });
  // Contingency has no TxDOT-sourced value here. Default is an editable rule of thumb.
  var DEFAULT_CONTINGENCY_PCT = 10;
  var APP_ID = 'PS&E Tracker';
  var VERSION = 1;

  function newProject(fields) {
    fields = fields || {};
    var now = new Date().toISOString();
    return {
      id: D.uid('p'),
      name: String(fields.name || 'New project').trim() || 'New project',
      csj: String(fields.csj || '').trim(),
      county: String(fields.county || '').trim(),
      pm: String(fields.pm || '').trim(),
      letting: String(fields.letting || '').trim(),
      created: now,
      updated: now,
      stages: D.buildDefaultStages(),
      estimate: { contingencyPct: DEFAULT_CONTINGENCY_PCT, lines: [] }
    };
  }

  function newItem(stage, title) {
    return { id: D.uid('i'), title: String(title || 'New item'), group: 'Custom', status: 'todo', owner: '', due: '', notes: '', src: '', basis: 'A', srcNote: 'Added by you (not from a TxDOT source).' };
  }

  /* ---------- progress ---------- */
  function stageStats(stage, today) {
    var total = 0, done = 0, review = 0, doing = 0, todo = 0, overdue = 0, na = 0;
    var blockers = [];
    (stage.items || []).forEach(function (it) {
      if (it.status === 'na') { na++; return; }
      total++;
      if (it.status === 'done') done++;
      else {
        if (it.status === 'review') review++;
        else if (it.status === 'doing') doing++;
        else todo++;
        var od = isOverdue(it, today);
        if (od) overdue++;
        blockers.push({ item: it, overdue: od });
      }
    });
    return {
      total: total, done: done, review: review, doing: doing, todo: todo, na: na, overdue: overdue,
      open: total - done,
      pct: total ? Math.round(done / total * 100) : 100,
      ready: total === 0 ? true : done === total,
      blockers: blockers
    };
  }

  function isOverdue(item, today) {
    if (!item.due || item.status === 'done' || item.status === 'na') return false;
    return item.due < (today || todayStr());
  }

  function todayStr(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function overall(project, today) {
    var stages = project.stages.map(function (s) { return { stage: s, stats: stageStats(s, today) }; });
    var total = 0, done = 0, overdue = 0;
    stages.forEach(function (x) { total += x.stats.total; done += x.stats.done; overdue += x.stats.overdue; });
    var next = null;
    for (var i = 0; i < stages.length; i++) { if (!stages[i].stats.ready) { next = stages[i]; break; } }
    return {
      stages: stages, total: total, done: done, overdue: overdue,
      pct: total ? Math.round(done / total * 100) : 100,
      readyStages: stages.filter(function (x) { return x.stats.ready; }).length,
      next: next
    };
  }

  function daysUntil(dateStr, today) {
    if (!dateStr) return null;
    var a = Date.parse(dateStr + 'T00:00:00'), b = Date.parse((today || todayStr()) + 'T00:00:00');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((a - b) / 86400000);
  }

  /* ---------- estimate (same price logic as Bid Cost: Houston first, statewide fallback) ---------- */
  function indexRows(rows) {
    var m = Object.create(null);
    (rows || []).forEach(function (r) { m[r.bid_code] = r; });
    return m;
  }

  function num(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /** Resolve one estimate line against an index (code -> bid-cost row). */
  function priceLine(line, index) {
    var qty = num(line.qty);
    var manual = num(line.manualPrice);
    var row = index ? index[line.code] : null;
    var auto = row ? Bid.resolvePrice(row) : { price: null, n: null, source: null };
    var price = null, source = 'none';
    if (manual != null) { price = manual; source = 'Manual'; }
    else if (auto.price != null) { price = auto.price; source = auto.source; }
    var total = (price != null && qty != null) ? round2(price * qty) : null;
    return {
      price: price, source: source, n: manual != null ? null : auto.n,
      autoPrice: auto.price, autoSource: auto.source,
      qty: qty, total: total,
      unpriced: price == null,
      noQty: qty == null || qty === 0,
      inData: !!row
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  function estimateTotals(estimate, index) {
    var subtotal = 0, unpriced = 0, noQty = 0, bySource = { Houston: 0, Statewide: 0, Manual: 0 };
    var priced = (estimate.lines || []).map(function (l) {
      var p = priceLine(l, index);
      if (p.unpriced) unpriced++;
      if (p.noQty) noQty++;
      if (p.total != null) { subtotal += p.total; if (bySource[p.source] != null) bySource[p.source] += p.total; }
      return { line: l, p: p };
    });
    subtotal = round2(subtotal);
    var pct = num(estimate.contingencyPct);
    if (pct == null || pct < 0) pct = 0;
    var contingency = round2(subtotal * pct / 100);
    return { lines: priced, subtotal: subtotal, contingencyPct: pct, contingency: contingency, total: round2(subtotal + contingency), unpriced: unpriced, noQty: noQty, bySource: bySource };
  }

  /** Search the bid-cost rows. Matches code prefix/substring or all words in description. Limit results. */
  function searchRows(rows, query, limit, itemInfo) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var words = q.split(/\s+/);
    var out = [];
    for (var i = 0; i < rows.length && out.length < (limit || 40); i++) {
      var r = rows[i];
      var code = r.bid_code.toLowerCase(), desc = (r.description || '').toLowerCase();
      var hay = code + ' ' + desc;
      var ok = true;
      for (var w = 0; w < words.length; w++) { if (hay.indexOf(words[w]) === -1) { ok = false; break; } }
      if (ok) out.push(r);
    }
    return out;
  }

  /** Rows for a given spec Item number (e.g. '464'). */
  function rowsForItem(rows, item) {
    return (rows || []).filter(function (r) { return r.bid_code.slice(0, 3) === String(item); });
  }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    // neutralize spreadsheet formula injection for free-text cells
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function csvRows(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }

  function statusLabel(k) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].key === k) return STATUSES[i].label;
    return k;
  }
  var BASIS_LABEL = { S: 'TxDOT-sourced (item + stage)', P: 'TxDOT-sourced item; stage assumed/editable', A: 'Assumed/editable (unsourced)' };

  function checklistCsv(project) {
    var rows = [['Project', 'CSJ', 'County', 'PM', 'Letting date', 'Stage', 'Group', 'Item', 'Status', 'Owner', 'Due', 'Notes', 'Basis', 'Source']];
    project.stages.forEach(function (s) {
      s.items.forEach(function (it) {
        var src = it.src && D.SOURCES[it.src] ? D.SOURCES[it.src].url : '';
        rows.push([project.name, project.csj, project.county, project.pm, project.letting, s.name, it.group, it.title, statusLabel(it.status), it.owner, it.due, it.notes, BASIS_LABEL[it.basis] || '', src]);
      });
    });
    return csvRows(rows);
  }

  function estimateCsv(project, index) {
    var t = estimateTotals(project.estimate, index);
    var rows = [['Project', 'CSJ', 'Bid code', 'Description', 'Unit', 'Quantity', 'Unit price', 'Price source', 'n (bids)', 'Line total', 'Flag', 'Note']];
    t.lines.forEach(function (x) {
      var l = x.line, p = x.p;
      var flag = p.unpriced ? 'NO PRICE' : (p.noQty ? 'NO QUANTITY' : '');
      rows.push([project.name, project.csj, l.code, l.desc, l.unit, p.qty == null ? '' : p.qty, p.price == null ? '' : p.price, p.source === 'none' ? '' : p.source, p.n == null ? '' : p.n, p.total == null ? '' : p.total, flag, l.note || '']);
    });
    rows.push([]);
    rows.push(['', '', '', 'Subtotal (priced lines)', '', '', '', '', '', t.subtotal]);
    rows.push(['', '', '', 'Contingency ' + t.contingencyPct + '% (editable; not a TxDOT value)', '', '', '', '', '', t.contingency]);
    rows.push(['', '', '', 'Total with contingency', '', '', '', '', '', t.total]);
    rows.push(['', '', '', 'Lines with no price', '', '', '', '', '', t.unpriced]);
    rows.push(['Planning-level only. Unit prices are averages of low-bid TxDOT Bid Tabulations (Houston first, statewide fallback) unless marked Manual. Not an official estimate.']);
    return csvRows(rows);
  }

  /* ---------- backup / restore ---------- */
  function backup(state) {
    return { app: APP_ID, version: VERSION, exported: new Date().toISOString(), projects: state.projects };
  }

  function sanitizeProject(p) {
    if (!p || typeof p !== 'object') return null;
    var out = newProject({ name: p.name, csj: p.csj, county: p.county, pm: p.pm, letting: p.letting });
    if (typeof p.id === 'string' && p.id) out.id = p.id;
    if (typeof p.created === 'string') out.created = p.created;
    if (typeof p.updated === 'string') out.updated = p.updated;
    if (Array.isArray(p.stages)) {
      out.stages = p.stages.map(function (s) {
        return {
          id: typeof s.id === 'string' && s.id ? s.id : D.uid('s'),
          name: String(s.name || 'Stage'),
          items: (Array.isArray(s.items) ? s.items : []).map(function (it) {
            return {
              id: typeof it.id === 'string' && it.id ? it.id : D.uid('i'),
              title: String(it.title || 'Item'), group: String(it.group || ''),
              status: STATUS_KEYS.indexOf(it.status) >= 0 ? it.status : 'todo',
              owner: String(it.owner || ''), due: /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : '',
              notes: String(it.notes || ''), src: D.SOURCES[it.src] ? it.src : '',
              basis: ['S', 'P', 'A'].indexOf(it.basis) >= 0 ? it.basis : 'A', srcNote: String(it.srcNote || '')
            };
          })
        };
      });
    }
    if (p.estimate && typeof p.estimate === 'object') {
      var pct = num(p.estimate.contingencyPct);
      out.estimate.contingencyPct = pct == null ? DEFAULT_CONTINGENCY_PCT : pct;
      out.estimate.lines = (Array.isArray(p.estimate.lines) ? p.estimate.lines : []).map(function (l) {
        return {
          id: typeof l.id === 'string' && l.id ? l.id : D.uid('l'),
          code: String(l.code || ''), desc: String(l.desc || ''), unit: String(l.unit || ''),
          qty: num(l.qty) == null ? '' : num(l.qty), manualPrice: num(l.manualPrice) == null ? '' : num(l.manualPrice),
          note: String(l.note || '')
        };
      });
    }
    return out;
  }

  /** Merge a parsed backup into state. Same id => replaced. Returns count imported. */
  function restore(state, data) {
    if (!data || data.app !== APP_ID || !Array.isArray(data.projects)) throw new Error('Not a PS&E Tracker backup file');
    var n = 0, first = null;
    data.projects.forEach(function (raw) {
      var p = sanitizeProject(raw);
      if (!p) return;
      if (!first) first = p.id;
      var i = state.projects.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) state.projects[i] = p; else state.projects.push(p);
      n++;
    });
    if (n) state.activeId = first; // open the first restored project
    return n;
  }

  var api = {
    STATUSES: STATUSES, STATUS_KEYS: STATUS_KEYS, DEFAULT_CONTINGENCY_PCT: DEFAULT_CONTINGENCY_PCT, APP_ID: APP_ID, VERSION: VERSION, BASIS_LABEL: BASIS_LABEL,
    newProject: newProject, newItem: newItem, stageStats: stageStats, overall: overall, isOverdue: isOverdue, todayStr: todayStr, daysUntil: daysUntil,
    indexRows: indexRows, priceLine: priceLine, estimateTotals: estimateTotals, searchRows: searchRows, rowsForItem: rowsForItem,
    csvCell: csvCell, checklistCsv: checklistCsv, estimateCsv: estimateCsv, statusLabel: statusLabel,
    backup: backup, restore: restore, sanitizeProject: sanitizeProject, num: num
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PseModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
