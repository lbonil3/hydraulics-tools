/* PS&E Tracker UI. Logic lives in model.js; defaults + sources in defaults.js. */
(function () {
  'use strict';
  var M = window.PseModel, D = window.PseDefaults, Bid = window.BidCostLookup;
  var KEY = 'pse-tracker.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------- state ---------- */
  var state = load();
  var ui = {
    tab: 'status',
    openStages: {}, openItems: {}, focus: null,
    rows: [], index: null, itemInfo: null, dataMsg: 'Loading Bid Cost prices…', dataOk: false,
    estItem: '', estQuery: '', showCustom: false
  };
  // Drainage-related spec Items offered as a quick filter. This grouping is an ASSUMED convenience list, not a TxDOT list.
  var DRAIN_ITEMS = ['110', '400', '401', '402', '403', '432', '460', '462', '464', '465', '466', '467', '468', '556'];

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || !Array.isArray(s.projects) || !s.projects.length) {
      var p = M.newProject({ name: 'My drainage project' });
      s = { projects: [p], activeId: p.id };
    } else {
      s.projects = s.projects.map(M.sanitizeProject).filter(Boolean);
      if (!s.projects.length) { var q = M.newProject({}); s.projects = [q]; }
      if (!s.projects.some(function (x) { return x.id === s.activeId; })) s.activeId = s.projects[0].id;
    }
    return s;
  }
  var saveFailed = false;
  function save() {
    var p = cur(); if (p) p.updated = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify({ projects: state.projects, activeId: state.activeId })); saveFailed = false; }
    catch (e) { if (!saveFailed) toast('Could not save on this device (storage full or blocked).'); saveFailed = true; }
  }
  function cur() { return state.projects.filter(function (p) { return p.id === state.activeId; })[0]; }
  function findStage(id) { return cur().stages.filter(function (s) { return s.id === id; })[0]; }
  function findItem(sid, iid) { var s = findStage(sid); return s && s.items.filter(function (i) { return i.id === iid; })[0]; }
  function findLine(id) { return cur().estimate.lines.filter(function (l) { return l.id === id; })[0]; }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return Bid.formatMoney(n); }
  function money0(n) { return n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(s) { if (!s) return ''; var d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function badge(b) {
    var t = b === 'S' ? 'TxDOT' : b === 'P' ? 'Stage assumed' : 'Assumed';
    return '<span class="badge ' + b + '" title="' + esc(M.BASIS_LABEL[b] || '') + '">' + t + '</span>';
  }
  function srcLink(it) {
    var s = it.src && D.SOURCES[it.src];
    return s ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>' : 'No source (added by you).';
  }

  /* ---------- render: top ---------- */
  function renderProjSel() {
    var sel = $('#projSel');
    sel.innerHTML = state.projects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === state.activeId ? ' selected' : '') + '>' + esc(p.name) + (p.csj ? ' · ' + esc(p.csj) : '') + '</option>'; }).join('');
  }
  function setTab(t) {
    ui.tab = t; document.body.setAttribute('data-tab', t);
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
    renderPane(t); window.scrollTo(0, 0);
  }
  function renderPane(t) {
    t = t || ui.tab;
    if (t === 'status') renderStatus(); else if (t === 'checklist') renderChecklist(); else if (t === 'estimate') renderEstimate(); else renderProject();
  }
  function renderAll() { renderProjSel(); renderPane(); }

  /* ---------- render: status ---------- */
  function estTotals() { return M.estimateTotals(cur().estimate, ui.index); }
  function renderStatus() {
    var p = cur(), o = M.overall(p), t = estTotals();
    var d = M.daysUntil(p.letting);
    var meta = [p.csj && 'CSJ ' + p.csj, p.county && p.county + ' Co.', p.pm && 'PM ' + p.pm].filter(Boolean).join(' · ');
    var lettingTxt = p.letting ? 'Letting ' + fmtDate(p.letting) + (d == null ? '' : d >= 0 ? ' · ' + d + ' day' + (d === 1 ? '' : 's') + ' away' : ' · ' + (-d) + ' day' + (d === -1 ? '' : 's') + ' ago') : 'No letting date set';
    var h = '<div class="card"><h2>' + esc(p.name) + '</h2><div class="muted">' + esc(meta || 'Add CSJ, county and PM on the Project tab.') + '</div><div class="muted">' + esc(lettingTxt) + '</div></div>';
    h += '<div class="kpis">' +
      '<div class="kpi' + (o.pct === 100 ? ' ok' : '') + '"><b>' + o.done + ' / ' + o.total + '</b>deliverables done (' + o.pct + '%)</div>' +
      '<div class="kpi' + (o.overdue ? ' bad' : '') + '"><b>' + o.overdue + '</b>overdue items</div>' +
      '<div class="kpi"><b>' + o.readyStages + ' / ' + o.stages.length + '</b>submittals ready</div>' +
      '<div class="kpi' + (t.unpriced ? ' bad' : '') + '"><b>' + t.unpriced + '</b>estimate lines with no price</div></div>';
    if (o.next) {
      var n = o.next, st = n.stats;
      h += '<div class="card"><h2>Next submittal: ' + esc(n.stage.name) + '</h2>' +
        '<div class="muted"><b>' + st.done + ' of ' + st.total + '</b> items ready to submit · ' + st.open + ' blocking' + (st.overdue ? ' · <span style="color:#b42318">' + st.overdue + ' overdue</span>' : '') + '</div>' +
        '<div class="bar' + (st.overdue ? ' warn' : '') + '" style="margin:8px 0"><i style="width:' + st.pct + '%"></i></div>' +
        '<h3>Blockers</h3>';
      st.blockers.slice(0, 8).forEach(function (b) {
        h += '<button type="button" class="blocker" data-act="goitem" data-sid="' + esc(n.stage.id) + '" data-iid="' + esc(b.item.id) + '"><div class="t">' + esc(b.item.title) + '</div><div class="m">' +
          '<span class="pill ' + (b.item.status === 'review' ? 'mid' : b.item.status === 'doing' ? 'info' : '') + '">' + esc(M.statusLabel(b.item.status)) + '</span> ' +
          (b.item.owner ? esc(b.item.owner) + ' · ' : '') + (b.item.due ? (b.overdue ? '<span style="color:#b42318;font-weight:600">overdue ' : 'due ') + esc(fmtDate(b.item.due)) + (b.overdue ? '</span>' : '') : '') + '</div></button>';
      });
      if (st.blockers.length > 8) h += '<button type="button" class="btn sec block" data-act="gostage" data-sid="' + esc(n.stage.id) + '" style="margin-top:8px">Show all ' + st.blockers.length + ' blockers</button>';
      h += '</div>';
    } else {
      h += '<div class="card"><h2>All submittals ready</h2><div class="muted">Every stage has all applicable items done.</div></div>';
    }
    h += '<div class="card"><h2>All submittals</h2>';
    o.stages.forEach(function (x) {
      var st = x.stats;
      h += '<button type="button" class="stagerow" data-act="gostage" data-sid="' + esc(x.stage.id) + '"><span><b>' + esc(x.stage.name) + '</b></span><span>' +
        (st.ready ? '<span class="pill ok">Ready</span>' : '<span class="pill ' + (st.overdue ? 'bad' : 'mid') + '">' + st.open + ' open</span>') + ' <span class="muted">' + st.done + '/' + st.total + '</span></span>' +
        '<div class="bar' + (st.overdue ? ' warn' : '') + '"><i style="width:' + st.pct + '%"></i></div></button>';
    });
    h += '</div>';
    h += '<button type="button" class="card" data-act="goest" style="display:block;width:100%;text-align:left;cursor:pointer"><h2>Drainage estimate</h2><div class="totals"><span>Subtotal (priced lines)</span><span class="r">' + money0(t.subtotal) + '</span><span>With ' + t.contingencyPct + '% contingency</span><span class="r big">' + money0(t.total) + '</span></div>' +
      (t.unpriced ? '<div class="warnbox">' + t.unpriced + ' line' + (t.unpriced === 1 ? ' has' : 's have') + ' no price and ' + (t.unpriced === 1 ? 'is' : 'are') + ' not in the total.</div>' : '') + '</button>';
    $('#paneStatus').innerHTML = h;
  }

  /* ---------- render: checklist ---------- */
  function itemHtml(it, sid) {
    var open = !!ui.openItems[it.id];
    var od = M.isOverdue(it);
    var mark = it.status === 'done' ? '✓' : it.status === 'na' ? 'N/A' : '';
    var h = '<div class="item' + (open ? ' open' : '') + '" data-iid="' + esc(it.id) + '" data-sid="' + esc(sid) + '" data-st="' + it.status + '">' +
      '<button type="button" class="tick" data-act="tick" aria-label="' + (it.status === 'done' ? 'Mark not started: ' : 'Mark done: ') + esc(it.title) + '"><span>' + mark + '</span></button>' +
      '<div class="tx" data-act="more"><div class="ititle">' + esc(it.title) + '</div><div class="imeta"><span class="pill ' + (it.status === 'done' ? 'ok' : it.status === 'review' ? 'mid' : it.status === 'doing' ? 'info' : '') + '">' + esc(M.statusLabel(it.status)) + '</span>' +
      badge(it.basis) + (it.owner ? '<span>' + esc(it.owner) + '</span>' : '') + (it.due ? '<span style="' + (od ? 'color:#b42318;font-weight:600' : '') + '">' + (od ? 'overdue ' : 'due ') + esc(fmtDate(it.due)) + '</span>' : '') + '</div></div>' +
      '<button type="button" class="more" data-act="more" aria-label="Details for ' + esc(it.title) + '" aria-expanded="' + open + '">' + (open ? '−' : '⋯') + '</button>';
    if (open) {
      h += '<div class="det">' +
        '<label class="f"><span>Status</span><select data-if="status">' + M.STATUSES.map(function (s) { return '<option value="' + s.key + '"' + (s.key === it.status ? ' selected' : '') + '>' + s.label + '</option>'; }).join('') + '</select></label>' +
        '<label class="f"><span>Item</span><input type="text" data-if="title" value="' + esc(it.title) + '"></label>' +
        '<div class="grid2"><label class="f"><span>Owner</span><input type="text" data-if="owner" value="' + esc(it.owner) + '" placeholder="Name / firm"></label>' +
        '<label class="f"><span>Due</span><input type="date" data-if="due" value="' + esc(it.due) + '"></label></div>' +
        '<label class="f"><span>Notes</span><textarea data-if="notes">' + esc(it.notes) + '</textarea></label>' +
        '<div class="src">' + badge(it.basis) + ' ' + esc(M.BASIS_LABEL[it.basis] || '') + '<br>' + (it.srcNote ? esc(it.srcNote) + '<br>' : '') + srcLink(it) + '</div>' +
        '<button type="button" class="btn danger" data-act="rmitem">Remove item</button></div>';
    }
    return h + '</div>';
  }
  function renderChecklist() {
    var p = cur(), h = '<p class="muted" style="margin:0 2px 10px">Tap the circle to mark an item done. Tap the item for status, owner, due date, notes and source. <b>TxDOT</b> = item and stage come from the cited manual; <b>Stage assumed</b> = item is from TxDOT but which submittal it belongs to is not stated; <b>Assumed</b> = yours or unsourced.</p>';
    p.stages.forEach(function (s) {
      var st = M.stageStats(s), open = !!ui.openStages[s.id];
      h += '<section class="stage' + (open ? ' open' : '') + '" data-sid="' + esc(s.id) + '"><button type="button" class="sh" data-act="stage" aria-expanded="' + open + '"><span class="nm">' + esc(s.name) + '</span><span>' + (st.ready ? '<span class="pill ok">Ready</span> ' : '') + '<span class="muted">' + st.done + '/' + st.total + '</span></span><i class="chev"></i>' +
        '<div class="bar' + (st.overdue ? ' warn' : '') + '"><i style="width:' + st.pct + '%"></i></div></button><div class="sb">';
      var lastG = null;
      s.items.forEach(function (it) {
        if (it.group !== lastG) { h += '<div class="grp">' + esc(it.group || 'Other') + '</div>'; lastG = it.group; }
        h += itemHtml(it, s.id);
      });
      if (!s.items.length) h += '<p class="muted">No items in this stage.</p>';
      h += '<div class="stagefoot"><label class="f"><span>Stage name (editable)</span><input type="text" data-sf="name" value="' + esc(s.name) + '"></label>' +
        '<div class="row"><button type="button" class="btn" data-act="additem">+ Add item</button><button type="button" class="btn danger" data-act="rmstage">Delete stage</button></div></div></div></section>';
    });
    h += '<button type="button" class="btn sec block" data-act="addstage">+ Add stage</button>';
    $('#paneChecklist').innerHTML = h;
  }

  /* ---------- render: estimate ---------- */
  function priceNote(p) {
    if (p.source === 'Manual') return '<b>Manual override</b>' + (p.autoPrice != null ? ' (data: ' + money(p.autoPrice) + ' ' + esc(p.autoSource) + ')' : '');
    if (p.price == null) return '<b style="color:#b42318">No price</b>';
    return '<b>' + esc(p.source) + '</b> average' + (p.n ? ' · n=' + p.n : '');
  }
  function lineInfoHtml(x) {
    var p = x.p;
    return (p.price == null ? '' : money(p.price) + ' / ' + esc(x.line.unit || 'unit') + ' · ') + priceNote(p);
  }
  function lineHtml(x) {
    var l = x.line, p = x.p;
    return '<div class="line' + (p.unpriced ? ' nop' : '') + '" data-lid="' + esc(l.id) + '">' +
      '<div class="lh"><div class="d"><b>' + esc(l.code || '(no code)') + '</b> ' + esc(l.desc) + ' <span class="muted">· ' + esc(l.unit || '—') + '</span></div>' +
      '<button type="button" class="x" data-act="rmline" aria-label="Remove ' + esc(l.code) + '">✕</button></div>' +
      '<div class="li" data-lp>' + lineInfoHtml(x) + (!p.inData && l.code && p.source !== 'Manual' ? ' <span class="pill bad">code not in Bid Cost data</span>' : '') + '</div>' +
      (p.unpriced ? '<div class="warnbox" data-lw>No price found. Enter a manual unit price below or it is left out of the total.</div>' : '<div data-lw></div>') +
      '<div class="grid2"><label class="f"><span>Quantity (' + esc(l.unit || 'unit') + ')</span><input type="number" inputmode="decimal" step="any" min="0" data-lf="qty" value="' + esc(l.qty) + '" placeholder="0"></label>' +
      '<label class="f"><span>Manual $/unit (override)</span><input type="number" inputmode="decimal" step="any" min="0" data-lf="manualPrice" value="' + esc(l.manualPrice) + '" placeholder="' + (p.autoPrice != null ? p.autoPrice.toFixed(2) : 'optional') + '"></label></div>' +
      '<div class="lt"><span>Line total</span><b data-lt>' + (p.total == null ? '—' : money0(p.total)) + '</b></div></div>';
  }
  function renderEstimate() {
    var p = cur(), t = estTotals();
    var h = '<div class="card"><h2>Add drainage quantities</h2><p class="muted" style="margin:0 0 8px">' + esc(ui.dataMsg) + '</p>' +
      '<label class="f"><span>Spec Item (assumed list of common drainage Items)</span><select id="estItem"><option value="">Search all bid codes…</option>' +
      DRAIN_ITEMS.map(function (it) { var inf = ui.itemInfo && ui.itemInfo.items && ui.itemInfo.items[it]; return '<option value="' + it + '"' + (ui.estItem === it ? ' selected' : '') + '>' + it + (inf && inf.title ? ' – ' + esc(inf.title) : '') + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Search bid code or description</span><input type="search" id="estQ" inputmode="search" autocomplete="off" placeholder="e.g. 464 or RC PIPE 24" value="' + esc(ui.estQuery) + '"></label>' +
      '<div class="res" id="estRes"></div>' +
      '<button type="button" class="btn sec block" data-act="togglecustom" style="margin-top:8px">' + (ui.showCustom ? 'Hide' : '+ Add') + ' manual line (not in Bid Cost data)</button>' +
      (ui.showCustom ? '<div style="margin-top:8px"><div class="grid2"><label class="f"><span>Bid code</span><input type="text" id="cuCode" placeholder="e.g. 6001"></label><label class="f"><span>Unit</span><input type="text" id="cuUnit" placeholder="LF, EA, CY"></label></div>' +
        '<label class="f"><span>Description</span><input type="text" id="cuDesc"></label>' +
        '<div class="grid2"><label class="f"><span>Quantity</span><input type="number" inputmode="decimal" step="any" min="0" id="cuQty"></label><label class="f"><span>Unit price ($)</span><input type="number" inputmode="decimal" step="any" min="0" id="cuPrice"></label></div>' +
        '<button type="button" class="btn block" data-act="addcustom">Add line</button></div>' : '') + '</div>';
    h += '<div class="card" id="estSummary"><h2>Estimate rollup</h2><div class="totals">' +
      '<span>Subtotal (priced lines)</span><span class="r" id="estSub">' + money0(t.subtotal) + '</span>' +
      '<label for="estPct" style="font-size:14px">Contingency % <span class="badge A">assumed, editable</span></label><span><input type="number" inputmode="decimal" step="any" min="0" id="estPct" value="' + esc(p.estimate.contingencyPct) + '"></span>' +
      '<span>Contingency</span><span class="r" id="estCont">' + money0(t.contingency) + '</span>' +
      '<span class="big">Total</span><span class="r big" id="estTot">' + money0(t.total) + '</span></div>' +
      '<div id="estWarn">' + estWarnHtml(t) + '</div>' +
      '<p class="muted small" style="margin:8px 0 0" id="estSrc">' + estSrcText(t) + '</p></div>';
    h += '<div id="estLines">' + (t.lines.length ? t.lines.map(lineHtml).join('') : '<p class="muted">No lines yet. Pick an Item or search above, then tap Add.</p>') + '</div>';
    h += '<p class="muted small">Unit prices are averages of low-bid TxDOT Bid Tabulations from the Bid Cost tool (Houston first, statewide when Houston has no data). Planning-level only; ESBD / EBS remain official. The contingency default is a rule of thumb, not a TxDOT value.</p>';
    $('#paneEstimate').innerHTML = h;
    renderResults();
  }
  function estWarnHtml(t) {
    var s = '';
    if (t.unpriced) s += '<div class="warnbox"><b>' + t.unpriced + ' line' + (t.unpriced === 1 ? '' : 's') + ' with no price</b> — not included in the total. Enter a manual price.</div>';
    if (t.noQty) s += '<div class="warnbox">' + t.noQty + ' line' + (t.noQty === 1 ? '' : 's') + ' with no quantity.</div>';
    return s;
  }
  function estSrcText(t) {
    return 'Priced from: Houston ' + money0(t.bySource.Houston) + ' · Statewide ' + money0(t.bySource.Statewide) + ' · Manual ' + money0(t.bySource.Manual);
  }
  function renderResults() {
    var box = $('#estRes'); if (!box) return;
    if (!ui.rows.length) { box.innerHTML = ''; return; }
    var q = ui.estQuery.trim();
    if (!ui.estItem && !q) { box.innerHTML = ''; return; }
    var base = ui.estItem ? M.rowsForItem(ui.rows, ui.estItem) : ui.rows;
    var res = q ? M.searchRows(base, q, 50) : base.slice(0, 50);
    var moreNote = (!q && base.length > 50) ? '<div class="rrow"><div class="p">Showing 50 of ' + base.length + '. Type to narrow (e.g. a size).</div></div>' : '';
    box.innerHTML = res.length ? res.map(function (r) {
      var pr = Bid.resolvePrice(r);
      return '<div class="rrow"><div class="d"><b>' + esc(r.bid_code) + '</b> ' + esc(r.description) + ' <span class="muted">· ' + esc(r.unit) + '</span><div class="p">' + (pr.price == null ? 'No price' : money(pr.price) + ' ' + esc(pr.source) + ' · n=' + pr.n) + '</div></div>' +
        '<button type="button" class="btn" data-act="addrow" data-code="' + esc(r.bid_code) + '">Add</button></div>';
    }).join('') + moreNote : '<div class="rrow"><div class="d muted">No matches.</div></div>';
  }
  function liveEstimate() {
    var t = estTotals();
    var set = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    set('#estSub', money0(t.subtotal)); set('#estCont', money0(t.contingency)); set('#estTot', money0(t.total));
    var w = $('#estWarn'); if (w) w.innerHTML = estWarnHtml(t);
    var s = $('#estSrc'); if (s) s.textContent = estSrcText(t);
    t.lines.forEach(function (x) {
      var el = document.querySelector('.line[data-lid="' + x.line.id + '"]'); if (!el) return;
      $('[data-lt]', el).textContent = x.p.total == null ? '—' : money0(x.p.total);
      $('[data-lp]', el).innerHTML = lineInfoHtml(x) + (!x.p.inData && x.line.code && x.p.source !== 'Manual' ? ' <span class="pill bad">code not in Bid Cost data</span>' : '');
      el.classList.toggle('nop', x.p.unpriced);
      $('[data-lw]', el).innerHTML = x.p.unpriced ? '<div class="warnbox">No price found. Enter a manual unit price below or it is left out of the total.</div>' : '';
    });
  }

  /* ---------- render: project / export ---------- */
  function renderProject() {
    var p = cur();
    var h = '<div class="card"><h2>Project details</h2>' +
      '<label class="f"><span>Project name</span><input type="text" data-pf="name" value="' + esc(p.name) + '"></label>' +
      '<div class="grid2"><label class="f"><span>CSJ (optional)</span><input type="text" data-pf="csj" value="' + esc(p.csj) + '" placeholder="0912-72-345" inputmode="numeric"></label>' +
      '<label class="f"><span>County</span><input type="text" data-pf="county" value="' + esc(p.county) + '"></label></div>' +
      '<div class="grid2"><label class="f"><span>PM</span><input type="text" data-pf="pm" value="' + esc(p.pm) + '"></label>' +
      '<label class="f"><span>Letting date</span><input type="date" data-pf="letting" value="' + esc(p.letting) + '"></label></div></div>';
    h += '<div class="card"><h2>Projects on this device</h2>';
    state.projects.forEach(function (x) {
      h += '<div class="projrow" data-pid="' + esc(x.id) + '"><div class="nm">' + (x.id === state.activeId ? '<b>' + esc(x.name) + '</b> <span class="pill ok">open</span>' : esc(x.name)) + '<div class="muted small">' + esc([x.csj, x.county].filter(Boolean).join(' · ')) + '</div></div>' +
        '<span class="row" style="flex-wrap:nowrap">' + (x.id === state.activeId ? '' : '<button type="button" class="btn sec" data-act="openproj">Open</button>') + '<button type="button" class="btn danger" data-act="rmproj" aria-label="Delete ' + esc(x.name) + '">Delete</button></span></div>';
    });
    h += '<div style="margin-top:10px"><label class="f"><span>New project name</span><input type="text" id="newName" placeholder="e.g. FM 1960 widening"></label>' +
      '<div class="row"><button type="button" class="btn" data-act="newproj">+ Create project</button><button type="button" class="btn sec" data-act="dupproj">Duplicate open project</button></div></div></div>';
    h += '<div class="card"><h2>Export</h2><p class="muted" style="margin:0 0 8px">CSV opens in Excel / Numbers. Print view → Share → Save as PDF on iPhone.</p><div class="row">' +
      '<button type="button" class="btn" data-act="csvcl">Checklist CSV</button><button type="button" class="btn" data-act="csvest">Estimate CSV</button>' +
      '<button type="button" class="btn" data-act="print">Print / PDF</button></div></div>';
    h += '<div class="card"><h2>Backup &amp; restore</h2><p class="muted" style="margin:0 0 8px">Projects live only in this browser. Back up to a JSON file; restoring merges projects (same project id is replaced).</p><div class="row">' +
      '<button type="button" class="btn sec" data-act="backup">Backup all projects (JSON)</button><button type="button" class="btn sec" data-act="restore">Restore from JSON</button></div>' +
      '<input type="file" id="restoreFile" accept="application/json,.json" style="display:none"></div>';
    h += '<div class="card"><h2>Sources</h2><p class="muted" style="margin:0">Default deliverables come from these TxDOT pages:</p><ul class="srcs">' +
      Object.keys(D.SOURCES).map(function (k) { return '<li><a href="' + esc(D.SOURCES[k].url) + '" target="_blank" rel="noopener noreferrer">' + esc(D.SOURCES[k].label) + '</a></li>'; }).join('') + '</ul>' +
      '<ul class="legend srcs"><li>' + badge('S') + ' item and stage placement are stated in the source.</li><li>' + badge('P') + ' item is from the source, but which submittal it belongs to is <b>assumed</b>; check your District\'s PS&amp;E QC Milestone Checklist (not readable here).</li><li>' + badge('A') + ' assumed / added by you.</li></ul>' +
      '<p class="muted small">Districts may combine or drop milestones (PS&amp;E Manual Table 6-1). Rename, add or delete stages and items to match your project.</p></div>';
    $('#paneProject').innerHTML = h;
  }

  /* ---------- files ---------- */
  function fname(base, ext) { return (cur().name || 'project').replace(/[^\w\-]+/g, '_').slice(0, 40) + '_' + base + '.' + ext; }
  function saveFile(name, text, mime) {
    var blob = new Blob([mime === 'text/csv' ? '\ufeff' + text : text], { type: mime }); // BOM so Excel reads UTF-8
    try {
      var file = new File([blob], name, { type: mime });
      if (window.matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') dl(); });
        return;
      }
    } catch (e) { /* fall through */ }
    dl();
    function dl() {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('Downloaded ' + name);
    }
  }
  function buildPrint() {
    var p = cur(), o = M.overall(p), t = estTotals();
    var h = '<h1>' + esc(p.name) + ' — Drainage PS&amp;E Tracker</h1><p class="meta">' + esc([p.csj && 'CSJ ' + p.csj, p.county && p.county + ' County', p.pm && 'PM: ' + p.pm, p.letting && 'Letting: ' + fmtDate(p.letting), 'Printed ' + new Date().toLocaleDateString('en-US')].filter(Boolean).join('  |  ')) + '</p>';
    h += '<p class="meta">Overall: ' + o.done + ' of ' + o.total + ' applicable deliverables done (' + o.pct + '%); ' + o.overdue + ' overdue; ' + o.readyStages + ' of ' + o.stages.length + ' submittals ready.</p>';
    o.stages.forEach(function (x) {
      h += '<h2>' + esc(x.stage.name) + ' — ' + x.stats.done + '/' + x.stats.total + (x.stats.ready ? ' (ready)' : ' (' + x.stats.open + ' open)') + '</h2><table><thead><tr><th>Item</th><th>Status</th><th>Owner</th><th>Due</th><th>Notes</th><th>Basis</th></tr></thead><tbody>';
      x.stage.items.forEach(function (it) { h += '<tr><td>' + esc(it.title) + '</td><td>' + esc(M.statusLabel(it.status)) + '</td><td>' + esc(it.owner) + '</td><td>' + esc(it.due ? fmtDate(it.due) : '') + '</td><td>' + esc(it.notes) + '</td><td>' + (it.basis === 'S' ? 'TxDOT' : it.basis === 'P' ? 'Stage assumed' : 'Assumed') + '</td></tr>'; });
      h += '</tbody></table>';
    });
    h += '<h2>Drainage estimate (planning level)</h2>';
    if (t.lines.length) {
      h += '<table><thead><tr><th>Bid code</th><th>Description</th><th>Unit</th><th class="n">Qty</th><th class="n">Unit price</th><th>Source</th><th class="n">Total</th></tr></thead><tbody>';
      t.lines.forEach(function (x) { h += '<tr><td>' + esc(x.line.code) + '</td><td>' + esc(x.line.desc) + '</td><td>' + esc(x.line.unit) + '</td><td class="n">' + (x.p.qty == null ? '' : x.p.qty) + '</td><td class="n">' + (x.p.price == null ? 'NO PRICE' : money0(x.p.price)) + '</td><td>' + (x.p.source === 'none' ? '' : esc(x.p.source)) + '</td><td class="n">' + (x.p.total == null ? '' : money0(x.p.total)) + '</td></tr>'; });
      h += '<tr><td colspan="6"><b>Subtotal</b></td><td class="n">' + money0(t.subtotal) + '</td></tr><tr><td colspan="6">Contingency ' + t.contingencyPct + '% (editable; not a TxDOT value)</td><td class="n">' + money0(t.contingency) + '</td></tr><tr><td colspan="6"><b>Total</b></td><td class="n"><b>' + money0(t.total) + '</b></td></tr></tbody></table>';
      if (t.unpriced) h += '<p class="note"><b>' + t.unpriced + ' line(s) have no price and are excluded from the total.</b></p>';
    } else h += '<p class="note">No estimate lines.</p>';
    h += '<p class="note">Unit prices: averages of low-bid TxDOT Bid Tabulations (Houston first, statewide fallback) unless marked Manual. Planning-level only; not an official estimate. Deliverables follow TxDOT PS&amp;E Preparation Manual, PDP Manual 7.7 and HDM Ch. 3; items marked "Stage assumed" or "Assumed" must be confirmed against the District PS&amp;E QC Milestone Checklist.</p>';
    $('#printArea').innerHTML = h;
  }

  /* ---------- actions ---------- */
  function goChecklist(sid, iid) {
    ui.openStages[sid] = true; if (iid) ui.openItems[iid] = true; setTab('checklist');
    if (iid) { var e = document.querySelector('.item[data-iid="' + iid + '"]'); if (e) e.scrollIntoView({ block: 'center' }); }
  }
  function addLineFromRow(code) {
    var r = ui.index && ui.index[code]; if (!r) return;
    var ex = cur().estimate.lines.filter(function (l) { return l.code === code; })[0];
    if (ex) { toast(code + ' is already in the estimate.'); focusLine(ex.id); return; }
    var l = { id: D.uid('l'), code: r.bid_code, desc: r.description, unit: r.unit, qty: '', manualPrice: '', note: '' };
    cur().estimate.lines.push(l); save(); renderEstimate(); toast('Added ' + code); focusLine(l.id);
  }
  function focusLine(id) {
    var el = document.querySelector('.line[data-lid="' + id + '"]'); if (!el) return;
    el.scrollIntoView({ block: 'center' }); var q = $('[data-lf=qty]', el); if (q) q.focus({ preventScroll: true });
  }
  function onClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    var itemEl = b.closest('.item'), stageEl = b.closest('.stage');
    var p = cur();
    switch (act) {
      case 'goitem': goChecklist(b.getAttribute('data-sid'), b.getAttribute('data-iid')); break;
      case 'gostage': goChecklist(b.getAttribute('data-sid')); break;
      case 'goest': setTab('estimate'); break;
      case 'stage': var sid = stageEl.getAttribute('data-sid'); ui.openStages[sid] = !ui.openStages[sid]; stageEl.classList.toggle('open', ui.openStages[sid]); b.setAttribute('aria-expanded', !!ui.openStages[sid]); break;
      case 'tick': var it = findItem(itemEl.getAttribute('data-sid'), itemEl.getAttribute('data-iid')); it.status = it.status === 'done' ? 'todo' : 'done'; save(); renderChecklist(); break;
      case 'more': var iid = itemEl.getAttribute('data-iid'); ui.openItems[iid] = !ui.openItems[iid]; renderChecklist(); break;
      case 'rmitem':
        if (confirm('Remove this item?')) { var s = findStage(itemEl.getAttribute('data-sid')); s.items = s.items.filter(function (i) { return i.id !== itemEl.getAttribute('data-iid'); }); save(); renderChecklist(); } break;
      case 'additem':
        var st = findStage(stageEl.getAttribute('data-sid')); var ni = M.newItem(st, 'New item'); st.items.push(ni); ui.openItems[ni.id] = true; save(); renderChecklist();
        var f = document.querySelector('.item[data-iid="' + ni.id + '"] [data-if=title]'); if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); f.select(); } break;
      case 'rmstage':
        var rs = findStage(stageEl.getAttribute('data-sid'));
        if (confirm('Delete stage "' + rs.name + '" and its ' + rs.items.length + ' items?')) { p.stages = p.stages.filter(function (x) { return x !== rs; }); save(); renderChecklist(); } break;
      case 'addstage': var ns = { id: D.uid('s'), name: 'New stage', items: [] }; p.stages.push(ns); ui.openStages[ns.id] = true; save(); renderChecklist(); toast('Stage added: rename it at the bottom of the stage.'); break;
      case 'togglecustom': ui.showCustom = !ui.showCustom; renderEstimate(); break;
      case 'addrow': addLineFromRow(b.getAttribute('data-code')); break;
      case 'addcustom':
        var code = $('#cuCode').value.trim(), desc = $('#cuDesc').value.trim(), unit = $('#cuUnit').value.trim();
        if (!code && !desc) { toast('Enter a code or description.'); break; }
        var nl = { id: D.uid('l'), code: code, desc: desc, unit: unit, qty: M.num($('#cuQty').value) == null ? '' : M.num($('#cuQty').value), manualPrice: M.num($('#cuPrice').value) == null ? '' : M.num($('#cuPrice').value), note: '' };
        p.estimate.lines.push(nl); ui.showCustom = false; save(); renderEstimate(); focusLine(nl.id); break;
      case 'rmline':
        var lid = b.closest('.line').getAttribute('data-lid'); p.estimate.lines = p.estimate.lines.filter(function (l) { return l.id !== lid; }); save(); renderEstimate(); break;
      case 'openproj': state.activeId = b.closest('.projrow').getAttribute('data-pid'); save(); renderAll(); toast('Opened ' + cur().name); break;
      case 'rmproj':
        var pid = b.closest('.projrow').getAttribute('data-pid'), pr = state.projects.filter(function (x) { return x.id === pid; })[0];
        if (confirm('Delete project "' + pr.name + '" from this device? This cannot be undone (back up first).')) {
          state.projects = state.projects.filter(function (x) { return x !== pr; });
          if (!state.projects.length) { var np0 = M.newProject({ name: 'My drainage project' }); state.projects.push(np0); }
          if (state.activeId === pid) state.activeId = state.projects[0].id;
          save(); renderAll(); toast('Project deleted');
        } break;
      case 'newproj':
        var nm = $('#newName').value.trim(); if (!nm) { toast('Enter a project name.'); $('#newName').focus(); break; }
        var np = M.newProject({ name: nm }); state.projects.push(np); state.activeId = np.id; save(); renderAll(); toast('Created ' + nm); break;
      case 'dupproj':
        var cp = M.sanitizeProject(JSON.parse(JSON.stringify(p))); cp.id = D.uid('p'); cp.name = p.name + ' (copy)'; state.projects.push(cp); state.activeId = cp.id; save(); renderAll(); toast('Duplicated'); break;
      case 'csvcl': saveFile(fname('checklist', 'csv'), M.checklistCsv(p), 'text/csv'); break;
      case 'csvest': saveFile(fname('estimate', 'csv'), M.estimateCsv(p, ui.index), 'text/csv'); break;
      case 'print': buildPrint(); setTimeout(function () { window.print(); }, 50); break;
      case 'backup': saveFile('pse-tracker-backup-' + M.todayStr() + '.json', JSON.stringify(M.backup(state), null, 1), 'application/json'); break;
      case 'restore': $('#restoreFile').click(); break;
    }
  }
  function onInput(e) {
    var t = e.target, p = cur();
    if (t.id === 'estQ') { ui.estQuery = t.value; renderResults(); return; }
    if (t.id === 'estPct') { p.estimate.contingencyPct = t.value; save(); liveEstimate(); return; }
    var pf = t.getAttribute('data-pf');
    if (pf) { p[pf] = t.value; save(); if (pf === 'name' || pf === 'csj') { var o = document.querySelector('#projSel option[value="' + p.id + '"]'); if (o) o.textContent = p.name + (p.csj ? ' · ' + p.csj : ''); } return; }
    var sf = t.getAttribute('data-sf');
    if (sf) { var s = findStage(t.closest('.stage').getAttribute('data-sid')); s.name = t.value; save(); var nmEl = t.closest('.stage').querySelector('.sh .nm'); if (nmEl) nmEl.textContent = s.name; return; }
    var fi = t.getAttribute('data-if');
    if (fi) {
      var itemEl = t.closest('.item'), it = findItem(itemEl.getAttribute('data-sid'), itemEl.getAttribute('data-iid'));
      if (fi === 'status' || fi === 'due') return; // handled on change
      it[fi] = t.value; save();
      if (fi === 'title') { itemEl.querySelector('.ititle').textContent = it.title; }
      return;
    }
    var lf = t.getAttribute('data-lf');
    if (lf) { var l = findLine(t.closest('.line').getAttribute('data-lid')); var v = t.value; l[lf] = (lf === 'qty' || lf === 'manualPrice') ? (M.num(v) == null ? '' : M.num(v)) : v; save(); liveEstimate(); }
  }
  function onChange(e) {
    var t = e.target;
    if (t.id === 'estItem') { ui.estItem = t.value; renderResults(); return; }
    if (t.id === 'projSel') { state.activeId = t.value; save(); renderPane(); return; }
    if (t.id === 'restoreFile') {
      var f = t.files && t.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var n = M.restore(state, JSON.parse(txt)); save(); renderAll(); toast('Restored ' + n + ' project' + (n === 1 ? '' : 's'));
      }).catch(function (err) { toast('Restore failed: ' + err.message); });
      t.value = ''; return;
    }
    var fi = t.getAttribute('data-if');
    if (fi === 'status' || fi === 'due') {
      var itemEl = t.closest('.item'), it = findItem(itemEl.getAttribute('data-sid'), itemEl.getAttribute('data-iid'));
      it[fi] = t.value; save(); renderChecklist();
    }
  }

  /* ---------- boot ---------- */
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTab(b.getAttribute('data-t')); });
  window.addEventListener('beforeprint', buildPrint);
  window.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'estQ') e.target.blur(); });

  renderAll();
  // Open the first not-ready stage in the checklist by default.
  (function () { var o = M.overall(cur()); if (o.next) ui.openStages[o.next.stage.id] = true; })();

  fetch('../bid-cost/prices.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (data) {
    ui.rows = data.rows || []; ui.index = M.indexRows(ui.rows); ui.dataOk = true;
    var m = data.meta || {};
    ui.dataMsg = 'Bid Cost data accessed ' + (m.accessed || '—') + ' (lettings ' + (m.let_date_min || '—') + ' → ' + (m.let_date_max || '—') + '). Houston price first, statewide fallback.';
    renderPane();
  }).catch(function () {
    ui.dataMsg = 'Could not load ../bid-cost/prices.json. Lines can still be added manually with a manual price.'; renderPane();
  });
  fetch('../bid-cost/item-info.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { ui.itemInfo = d; if (ui.tab === 'estimate') renderEstimate(); }).catch(function () {});
})();
