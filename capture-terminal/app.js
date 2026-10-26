/* Capture Terminal UI. Logic lives in model.js; sources in sources.js. No network requests; data stays in localStorage. */
(function () {
  'use strict';
  var M = window.CaptureModel;
  var KEY = 'capture-terminal.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------- tiny DOM helper (never uses innerHTML with data) ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function stageClass(s) { return 'st-' + s; }
  function badge(text, cls) { return el('span', { class: 'badge ' + cls, text: text.toUpperCase() }); }

  /* ---------- state ---------- */
  var storageOk = true;
  var state = load();
  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    try { localStorage.setItem(KEY + '.probe', '1'); localStorage.removeItem(KEY + '.probe'); } catch (e) { storageOk = false; }
    return M.sanitizeState(raw);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ app: M.APP_ID, version: M.VERSION, seq: state.seq, opps: state.opps, view: state.view })); storageOk = true; }
    catch (e) { if (storageOk) toast('Could not save on this device (storage full or blocked).'); storageOk = false; }
    paintStatus();
  }
  function paintStatus() { $('#dot').className = 'dot' + (storageOk ? '' : ' bad'); $('#statusTxt').textContent = storageOk ? 'LOCAL' : 'NOT SAVING'; }
  function today() { return M.todayStr(); }

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  /* ---------- number count-up ---------- */
  var lastVals = {};
  function countTo(node, to, fmt, memo) {
    fmt = fmt || String; var from = node._v != null ? node._v : (memo && lastVals[memo] != null ? lastVals[memo] : 0); node._v = to; if (memo) lastVals[memo] = to;
    cancelAnimationFrame(node._raf);
    if (reduced || from === to) { node.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = 650;
    (function step(t) {
      var k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) node._raf = requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- dashboard ---------- */
  var seenFeed = {};
  function renderDash() {
    var td = today(), st = M.stats(state.opps, td), empty = state.opps.length === 0;
    // gauge
    var C = 2 * Math.PI * 50, arc = $('#garc'), g = $('#gnum');
    $('#gsvg').setAttribute('aria-label', st.winRate == null ? 'Win rate not available yet' : 'Win rate ' + Math.round(st.winRate * 100) + ' percent');
    if (st.winRate == null) { g.textContent = '--'; g._v = null; lastVals.win = 0; arc.style.strokeDashoffset = C; $('#gcap').textContent = 'NEEDS A WON OR LOST RESULT'; }
    else { arc.style.strokeDashoffset = C * (1 - st.winRate); countTo(g, Math.round(st.winRate * 100), function (n) { return n + '%'; }, 'win'); $('#gcap').textContent = 'WON ' + st.won + ' / LOST ' + st.lost + (st.nobid ? ' / NO-BID ' + st.nobid : ''); }
    // weighted pipeline + chart
    countTo($('#wpNum'), Math.round(st.weightedActive), M.fmtMoneyFull, 'wp');
    $('#wpCap').textContent = 'EST. FEE IN PLAY ' + M.fmtMoneyFull(st.feeActive) + ' \u00b7 ' + st.active + ' ACTIVE';
    drawChart(M.monthSeries(state.opps, td, 6));
    // pipeline boxes
    $('#pipeTag').textContent = st.active + ' ACTIVE \u00b7 ' + st.closed + ' CLOSED';
    var bx = $('#boxes'); clear(bx);
    M.pipelineBoxes(state.opps).forEach(function (b) {
      var n = el('div', { class: 'n', text: '0' });
      var pills = el('div', { class: 'pills' });
      b.opps.slice(0, 5).forEach(function (o) {
        pills.appendChild(el('span', { class: 'pill ' + stageClass(o.stage), title: o.stage + ': ' + o.title, text: '#' + o.id + ' ' + o.title.replace(/^\[EXAMPLE\]\s*/, '').slice(0, 18) }));
      });
      if (b.opps.length > 5) pills.appendChild(el('span', { class: 'pill more-pill', text: '+' + (b.opps.length - 5) + ' MORE' }));
      bx.appendChild(el('div', { class: 'box' + (b.n ? ' tap' : ''), 'data-box': b.k, role: b.n ? 'button' : null, tabindex: b.n ? '0' : null, 'data-cmd': b.n ? 'filter stage=' + b.stages.join(',') : null,
        'aria-label': b.label + ': ' + b.n + (b.n ? '. Tap to list.' : '') }, [el('h3', { text: b.label }), n, pills]));
      countTo(n, b.n, null, 'box' + b.k);
    });
    // feed
    renderFeed(td, empty, st);
    // opportunities table
    renderTable(td, empty);
    // big panel
    countTo($('#mega'), st.active, null, 'mega');
    var bs = $('#bigStats'); clear(bs);
    var rows = [['EST. FEE IN PLAY', M.fmtMoneyFull(st.feeActive)], ['WON (EST. FEE)', M.fmtMoneyFull(st.wonFee)], ['PAST DUE', String(st.past)], ['DUE <=7 DAYS', String(st.d7)], ['DUE <=14 DAYS', String(st.d14)], ['NO DUE DATE', String(st.undated)]];
    var kv = el('div', { class: 'kv2' }); rows.forEach(function (r) { kv.appendChild(el('span', { text: r[0] })); kv.appendChild(el('span', { text: r[1] })); }); bs.appendChild(kv);
    if (st.byAgency.length) {
      var mx = st.byAgency[0].w, bars = el('div', { class: 'bars' }, [el('span', { class: 'bl', text: 'WEIGHTED FEE BY AGENCY' })]);
      st.byAgency.slice(0, 5).forEach(function (a) { bars.appendChild(el('div', { class: 'br' }, [el('span', { class: 'bl', text: a.agency.toUpperCase() + ' \u00b7 ' + a.n }), el('span', { text: M.bar(a.w, mx, 14) + ' ' + M.fmtMoney(a.w) })])); });
      bs.appendChild(bars);
    }
    paintStatus();
  }

  var lastSig = null;
  function drawChart(s) {
    var host = $('#chart'); clear(host);
    var sig = JSON.stringify(s), animate = !reduced && sig !== lastSig; lastSig = sig;
    var W = 300, H = 70, top = 16, n = s.values.length, max = Math.max.apply(null, s.values.concat([0]));
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + (top + H + 18), role: 'img' });
    var labelTxt = s.any ? 'Weighted fee by due month: ' + s.labels.map(function (l, i) { return l + ' ' + M.fmtMoney(s.values[i]); }).join(', ') : 'No dated opportunities yet';
    root.setAttribute('aria-label', labelTxt);
    var xs = s.values.map(function (_, i) { return 10 + i * ((W - 20) / (n - 1)); });
    var ys = s.values.map(function (v) { return top + H - (max > 0 ? v / max * H : 0); });
    root.appendChild(svg('line', { x1: 0, x2: W, y1: top + H, y2: top + H, stroke: '#2e2e2c', 'stroke-width': 1 }));
    [0.5, 1].forEach(function (f) { root.appendChild(svg('line', { x1: 0, x2: W, y1: top + H - H * f, y2: top + H - H * f, stroke: '#8d8d86', 'stroke-width': .6, 'stroke-dasharray': '2 3' })); });
    var clipId = 'clip' + Math.floor(Math.random() * 1e6);
    var cp = svg('clipPath', { id: clipId }), cr = svg('rect', { x: 0, y: 0, width: animate ? 0 : W, height: top + H + 2 }); cp.appendChild(cr); root.appendChild(cp);
    var g = svg('g', { 'clip-path': 'url(#' + clipId + ')' });
    var pts = xs.map(function (x, i) { return x.toFixed(1) + ',' + ys[i].toFixed(1); }).join(' ');
    g.appendChild(svg('polygon', { points: xs[0].toFixed(1) + ',' + (top + H) + ' ' + pts + ' ' + xs[n - 1].toFixed(1) + ',' + (top + H), fill: 'rgba(46,46,44,.16)' }));
    g.appendChild(svg('polyline', { points: pts, fill: 'none', stroke: '#2e2e2c', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
    s.values.forEach(function (v, i) {
      g.appendChild(svg('rect', { x: xs[i] - 2.5, y: ys[i] - 2.5, width: 5, height: 5, fill: '#e8e8e6', stroke: '#2e2e2c', 'stroke-width': 1.2 }));
      if (v > 0) { var t = svg('text', { x: Math.min(W - 20, Math.max(20, xs[i])), y: Math.max(9, ys[i] - 6), 'text-anchor': 'middle', class: 'axis' }); t.textContent = M.fmtMoney(v); g.appendChild(t); }
    });
    root.appendChild(g);
    s.labels.forEach(function (l, i) { var t = svg('text', { x: xs[i], y: top + H + 13, 'text-anchor': 'middle', class: 'axis' }); t.textContent = l; root.appendChild(t); });
    if (!s.any) { var nt = svg('text', { x: W / 2, y: top + H / 2, 'text-anchor': 'middle', class: 'none' }); nt.textContent = 'NO DUE DATES YET'; root.appendChild(nt); }
    host.appendChild(root);
    var note = [];
    if (s.earlier > 0) note.push(M.fmtMoney(s.earlier) + ' DUE EARLIER');
    if (s.later > 0) note.push(M.fmtMoney(s.later) + ' LATER');
    if (s.undated > 0) note.push(s.undated + ' UNDATED');
    $('#wpTag').textContent = note.length ? note.join(' \u00b7 ') : 'WEIGHTED FEE BY DUE MONTH';
    if (animate) { var t0 = performance.now(); (function step(t) { var k = Math.max(0, Math.min(1, (t - t0) / 800)); cr.setAttribute('width', (W * (1 - Math.pow(1 - k, 3))).toFixed(1)); if (k < 1) requestAnimationFrame(step); })(t0); }
  }

  function dayWord(d) { return d === 0 ? 'today' : d > 0 ? 'in ' + d + ' day' + (d === 1 ? '' : 's') : Math.abs(d) + ' day' + (d === -1 ? '' : 's') + ' ago'; }
  function renderFeed(td, empty, st) {
    var f = $('#feed'); clear(f);
    var stampHost = $('#feedStamp'); clear(stampHost);
    if (st.past > 0) stampHost.appendChild(el('span', { class: 'badge fl-past', text: st.past + ' PAST DUE' }));
    var entries = M.dueEntries(state.opps, td);
    if (!entries.length) {
      f.appendChild(el('div', { class: 'empty', text: empty ? 'no deadlines yet. add an opportunity with a due date or next action date.' : 'nothing dated. set a due date or next action date on an active opportunity.' }));
      return;
    }
    var fresh = 0, nextSeen = {};
    entries.slice(0, 8).forEach(function (e) {
      var fl = M.dueFlag(e.days), key = e.o.id + '|' + e.kind + '|' + e.date + '|' + e.label;
      nextSeen[key] = 1;
      var isNew = !seenFeed[key];
      var title = e.o.title.replace(/^\[EXAMPLE\]\s*/, '');
      var row = el('button', { type: 'button', class: 'frow' + (isNew && !reduced ? ' new' : ''), 'data-cmd': 'show ' + e.o.id, style: '--i:' + (fresh++) }, [
        badge(fl.label, 'fl-' + fl.key),
        el('div', { class: 't' }, [el('b', { text: '#' + e.o.id + ' ' }), (e.kind === 'deadline' ? e.label.toLowerCase() + ' due: ' : 'next: ') + (e.kind === 'action' ? e.label : '') + (e.kind === 'deadline' ? title : ' (' + title + ')')]),
        el('div', { class: 'd', text: e.date + ' \u00b7 ' + dayWord(e.days) + (e.o.example ? ' \u00b7 EXAMPLE' : '') })
      ]);
      f.appendChild(row);
    });
    seenFeed = nextSeen;
    if (entries.length > 8) f.appendChild(el('button', { type: 'button', class: 'mini', 'data-cmd': 'due', text: 'ALL ' + entries.length + ' \u2192' }));
  }

  function renderTable(td, empty) {
    var vl = $('#viewLine'), tb = $('#otable'); clear(vl); clear(tb);
    if (empty) {
      vl.hidden = true;
      tb.appendChild(el('div', { class: 'emptyhero' }, [
        el('h3', { text: 'NO OPPORTUNITIES YET' }),
        el('p', { text: 'add your first opportunity. nothing is pre-loaded.' }),
        el('div', { class: 'chiprow', style: 'justify-content:center' }, [
          el('button', { type: 'button', class: 'chip', 'data-cmd': 'add', text: 'ADD YOUR FIRST OPPORTUNITY' }),
          el('button', { type: 'button', class: 'chip', 'data-cmd': 'sources', text: 'WHERE TO LOOK' }),
          el('button', { type: 'button', class: 'chip', 'data-cmd': 'example', text: 'LOAD EXAMPLE DATA' })
        ])
      ]));
      return;
    }
    vl.hidden = false;
    var vis = M.visible(state), v = state.view;
    vl.appendChild(el('span', { text: vis.length + ' OF ' + state.opps.length + ' \u00b7 FILTER: ' + M.describeFilter(v.filter).toUpperCase() + ' \u00b7 SORT: ' + v.sort.toUpperCase() + ' ' + v.dir.toUpperCase() }));
    vl.appendChild(el('button', { type: 'button', 'data-cmd': 'filter', text: 'FILTER' }));
    vl.appendChild(el('button', { type: 'button', 'data-cmd': 'sort', text: 'SORT' }));
    if (Object.keys(v.filter).length) vl.appendChild(el('button', { type: 'button', 'data-cmd': 'filter off', text: 'RESET' }));
    if (!vis.length) { tb.appendChild(el('div', { class: 'empty', text: 'no opportunity matches this filter.' })); return; }
    var th = el('div', { class: 'thead', 'aria-hidden': 'true' }); ['ID', 'TITLE', 'AGENCY', 'STAGE', 'DUE', 'EST. FEE', 'PWIN'].forEach(function (h) { th.appendChild(el('span', { text: h })); });
    tb.appendChild(th);
    vis.slice(0, 100).forEach(function (o) {
      var days = o.due ? M.daysUntil(o.due, td) : null, fl = o.due ? M.dueFlag(days) : { key: 'none', label: '' };
      var preSubmit = M.ACTIVE.indexOf(o.stage) < M.ACTIVE.indexOf('Submitted');
      if (!preSubmit) fl = { key: 'none', label: '' };
      var dueKids = [o.due ? o.due : '--']; if (fl.label) dueKids.push(badge(fl.label, 'fl-' + fl.key));
      tb.appendChild(el('button', { type: 'button', class: 'orow', 'data-cmd': 'show ' + o.id }, [
        el('span', { class: 'c c-id', text: '#' + o.id }),
        el('span', { class: 'c-title', text: o.title }),
        el('span', { class: 'c c-ag', 'data-l': 'AGENCY', text: (o.agency || '--') + (o.district ? ' \u00b7 ' + o.district : '') }),
        el('span', { class: 'c c-st' }, [badge(o.stage, stageClass(o.stage))]),
        el('span', { class: 'c c-du', 'data-l': 'DUE' }, dueKids),
        el('span', { class: 'c c-fe r', 'data-l': 'EST. FEE', text: M.fmtMoney(o.fee) }),
        el('span', { class: 'c c-pw r', 'data-l': 'PWIN', text: o.pwin + '%' })
      ]));
    });
    if (vis.length > 100) tb.appendChild(el('div', { class: 'empty', text: 'showing 100 of ' + vis.length + '. use filter to narrow.' }));
  }

  /* ---------- terminal output ---------- */
  function renderBlocks(blocks) {
    var out = $('#out'); clear(out);
    blocks.forEach(function (b) {
      switch (b.k) {
        case 'line': out.appendChild(el('div', { class: 'ln ' + b.c, text: b.s })); break;
        case 'kv': b.rows.forEach(function (r) { out.appendChild(el('div', { class: 'kv' }, [el('span', { class: 'k', text: String(r[0]).toUpperCase() === r[0] ? r[0] : r[0] }), el('span', { class: 'v', text: r[1] })])); }); break;
        case 'chips': out.appendChild(el('div', { class: 'chiprow' }, b.chips.map(function (c) { return el('button', { type: 'button', class: 'chip' + (/^(delete|wipe)/.test(c.cmd) ? ' danger' : ''), 'data-cmd': c.cmd, text: c.label }); }))); break;
        case 'opp': out.appendChild(oppCard(b.o, b.today, b.cmd)); break;
        case 'due': out.appendChild(dueRow(b.e, b.cmd)); break;
        case 'bars': b.rows.forEach(function (r) { out.appendChild(el('div', { class: 'brow' }, [el('div', { class: 'bl', text: r.label }), el('div', { class: 'bb', text: r.bar + '  ' + r.text })])); }); break;
        case 'source': out.appendChild(sourceBlock(b.it)); break;
        case 'detail': out.appendChild(detailBlock(b.o, b.today)); break;
      }
    });
  }
  function oppCard(o, td, cmd) {
    var kids = [badge(o.stage, stageClass(o.stage))];
    if (o.example) kids.push(badge('EXAMPLE', 'b-ex'));
    if (o.due && M.ACTIVE.indexOf(o.stage) >= 0 && M.ACTIVE.indexOf(o.stage) < M.ACTIVE.indexOf('Submitted')) { var fl = M.dueFlag(M.daysUntil(o.due, td)); kids.push(badge(fl.label, 'fl-' + fl.key)); }
    kids.push(el('b', { text: '#' + o.id }));
    return el('button', { type: 'button', class: 'ocard', 'data-cmd': cmd }, [
      el('div', { class: 'l1' }, kids), el('div', { class: 'ttl', text: o.title }),
      el('div', { class: 'l3', text: [o.agency, o.district, o.due && 'due ' + o.due, 'fee ' + M.fmtMoney(o.fee), 'pwin ' + o.pwin + '%', 'wtd ' + M.fmtMoney(M.weighted(o))].filter(Boolean).join(' \u00b7 ') })
    ]);
  }
  function dueRow(e, cmd) {
    var fl = M.dueFlag(e.days);
    return el('button', { type: 'button', class: 'drow', 'data-cmd': cmd }, [
      el('div', { class: 'l1' }, [badge(fl.label, 'fl-' + fl.key), badge(e.kind === 'deadline' ? (e.label || 'due') : 'next action', 'fl-none'), el('span', { text: e.date + ' \u00b7 ' + dayWord(e.days) })]),
      el('div', { class: 'l2', text: '#' + e.o.id + ' ' + e.o.title + (e.kind === 'action' ? ' \u2014 ' + e.label : '') })
    ]);
  }
  function sourceBlock(it) {
    return el('p', { class: 'src' }, [
      el('b', { text: it.n }),
      el('a', { href: it.u, target: '_blank', rel: 'noopener noreferrer', text: it.u }),
      el('div', { class: 'ds', text: it.d }),
      el('div', { class: 'ds', text: (it.v === 'curl' ? 'CHECKED: HTTP 200' : 'CHECKED: LOADED VIA FETCH TOOL (BLOCKS CURL)') + ' \u00b7 ' + window.CaptureSources.VERIFIED_ON })
    ]);
  }
  function detailBlock(o, td) {
    var d = el('div', { class: 'detail' }); var rows = [];
    var days = o.due ? M.daysUntil(o.due, td) : null, nd = o.nextDate ? M.daysUntil(o.nextDate, td) : null;
    d.appendChild(el('div', { class: 'dt', text: '#' + o.id + ' ' + o.title }));
    var head = el('div', { class: 'l1' }, [badge(o.stage, stageClass(o.stage))]); if (o.example) head.appendChild(badge('EXAMPLE', 'b-ex')); d.appendChild(head);
    if (o.stage === 'No-bid' || o.stage === 'Lost') d.appendChild(el('div', { class: 'rstamp', text: o.stage.toUpperCase() }));
    function add(label, val) { if (val !== '' && val != null) rows.push([label, String(val)]); }
    add('AGENCY', o.agency); add('TXDOT DISTRICT', o.district); add('CSJ / SOLICITATION #', o.csj); add('TYPE', o.type); add('COUNTY', o.county); add('ROLE', o.role);
    add('EST. CONSTRUCTION COST', o.cost == null ? '' : M.fmtMoneyFull(o.cost)); add('EST. FEE', o.fee == null ? '' : M.fmtMoneyFull(o.fee));
    add('PWIN', o.pwin + '%'); add('WEIGHTED FEE', o.fee == null ? '' : M.fmtMoneyFull(M.weighted(o)));
    add((o.dueKind || 'DUE').toUpperCase() + ' DATE', o.due ? o.due + ' (' + dayWord(days) + ')' : ''); add('LETTING DATE', o.letting);
    add('NEXT ACTION', o.next); add('NEXT ACTION DATE', o.nextDate ? o.nextDate + ' (' + dayWord(nd) + ')' : '');
    add('TEAMING PARTNERS', o.partners); add('INCUMBENT / COMPETITORS', o.competitors); add('STRATEGIC FIT', o.fit); add('NOTES', o.notes);
    add('LAST UPDATED', o.updated ? o.updated.slice(0, 10) : '');
    rows.forEach(function (r) { d.appendChild(el('div', { class: 'kv' }, [el('span', { class: 'k', text: r[0] }), el('span', { class: 'v', text: r[1] })])); });
    if (o.url && /^https?:\/\//i.test(o.url)) d.appendChild(el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'SOURCE URL' }), el('span', { class: 'v' }, [el('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer', text: o.url })])]));
    return d;
  }
  function showOut(echo, blocks) {
    $('#outPanel').hidden = false; $('#echo').textContent = echo; renderBlocks(blocks);
    var p = $('#outPanel'); if (p.scrollIntoView) p.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }
  function closeOut() { $('#outPanel').hidden = true; window.scrollTo(0, 0); }

  /* ---------- commands ---------- */
  function exec(line) {
    line = String(line || '').trim(); if (!line) return;
    var r = M.run(state, line, { today: today(), now: new Date().toISOString() });
    var fx = r.fx || {};
    if (r.changed) save();
    renderDash();
    if (fx.clearScreen) { closeOut(); }
    else if (r.out.length || (!fx.openForm && !fx.openFilter && !fx.openImport)) showOut(line, r.out);
    if (fx.download) saveFile(fx.download.name, fx.download.text, fx.download.mime);
    if (fx.openForm != null) openForm(fx.openForm === 'new' ? null : M.find(state, fx.openForm));
    if (fx.openFilter) openFilter();
    if (fx.openImport) openImport();
    if (fx.stamp) stampIt(fx.stamp);
    collapseMore();
  }
  function stampIt(text) {
    var s = $('#stamp'); s.textContent = text; s.classList.remove('on'); void s.offsetWidth; s.classList.add('on');
    if (!reduced) { var w = $('#win'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); setTimeout(function () { w.classList.remove('shake'); }, 400); }
  }
  function saveFile(name, text, mime) {
    var blob = new Blob([mime === 'text/csv' ? '\ufeff' + text : text], { type: mime });
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

  /* ---------- dock ---------- */
  var PRIMARY = ['add', 'list', 'due', 'stats'];
  var MORE = ['help', 'show', 'edit', 'stage', 'delete', 'filter', 'sort', 'sources', 'export csv', 'export json', 'import', 'example', 'purge example', 'undo', 'clear', 'wipe'];
  function buildDock() {
    var c = $('#chips'), m = $('#more');
    PRIMARY.forEach(function (x) { c.appendChild(el('button', { type: 'button', class: 'chip', 'data-cmd': x, text: x })); });
    c.appendChild(el('button', { type: 'button', class: 'chip', id: 'moreBtn', 'aria-expanded': 'false', 'aria-controls': 'more', text: 'more' }));
    MORE.forEach(function (x) { m.appendChild(el('button', { type: 'button', class: 'chip' + (x === 'wipe' ? ' danger' : ''), 'data-cmd': x, text: x })); });
    $('#moreBtn').addEventListener('click', function () { var open = $('#more').hidden; $('#more').hidden = !open; this.setAttribute('aria-expanded', String(open)); this.textContent = open ? 'less' : 'more'; sizeDock(); });
  }
  function collapseMore() { var b = $('#moreBtn'); if (!$('#more').hidden) { $('#more').hidden = true; b.setAttribute('aria-expanded', 'false'); b.textContent = 'more'; sizeDock(); } }
  function sizeDock() { document.documentElement.style.setProperty('--dock-h', $('#dock').offsetHeight + 'px'); }

  /* ---------- modals ---------- */
  var lastFocus = null;
  function openModal(id) { lastFocus = document.activeElement; var m = $(id); m.hidden = false; document.body.style.overflow = 'hidden'; return m; }
  function closeModals() { document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; }); document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function fld(label, input, opt) { return el('label', { class: 'fl' }, [el('span', { text: label }), input]); }
  function inp(name, type, val, extra) { var a = { type: type || 'text', name: name, value: val == null ? '' : val }; Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; }); return el('input', a); }
  function sel(name, opts, val, blank) {
    var s = el('select', { name: name }); if (blank != null) s.appendChild(el('option', { value: '', text: blank }));
    opts.forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); if (o[0] === val) op.selected = true; s.appendChild(op); }); if (val != null && !s.value && val === '') s.value = ''; return s;
  }
  function dl(id, items) { return el('datalist', { id: id }, items.map(function (i) { return el('option', { value: i }); })); }
  var editing = null;
  function openForm(o) {
    editing = o || null; var v = o || M.blankOpp();
    $('#mFormT').textContent = o ? 'EDIT #' + o.id : 'NEW OPPORTUNITY'; $('#fErr').textContent = '';
    var b = $('#fBody'); clear(b);
    var ags = M.AGENCIES.slice(); state.opps.forEach(function (x) { if (x.agency && ags.indexOf(x.agency) < 0) ags.push(x.agency); });
    var pw = inp('pwin', 'range', v.pwin, { min: 0, max: 100, step: 5 }), out = el('output', { text: v.pwin + '%' });
    pw.addEventListener('input', function () { out.textContent = pw.value + '%'; });
    var money = function (k) { return v[k] == null ? '' : String(v[k]); };
    var stageOpts = M.STAGES.map(function (s) { return [s, s]; });
    b.appendChild(el('fieldset', { class: 'fs' }, [el('legend', { text: 'OPPORTUNITY' }),
      fld('TITLE *', inp('title', 'text', v.title, { maxlength: 200, required: true, autocomplete: 'off' })),
      fld('AGENCY', inp('agency', 'text', v.agency, { list: 'dlAgency', maxlength: 80, autocomplete: 'off' })), dl('dlAgency', ags),
      el('div', { class: 'g2' }, [fld('TXDOT DISTRICT', inp('district', 'text', v.district, { list: 'dlDist', maxlength: 60, autocomplete: 'off' })), dl('dlDist', M.DISTRICTS), fld('COUNTY', inp('county', 'text', v.county, { maxlength: 80, autocomplete: 'off' }))]),
      fld('CSJ OR SOLICITATION # (OPTIONAL)', inp('csj', 'text', v.csj, { maxlength: 60, autocomplete: 'off', autocapitalize: 'characters' })),
      fld('TYPE', inp('type', 'text', v.type, { list: 'dlType', maxlength: 80, autocomplete: 'off' })), dl('dlType', M.TYPES),
      fld('PRIME / SUB ROLE', sel('role', M.ROLES.map(function (r) { return [r, r]; }), v.role, '(not set)'))]));
    b.appendChild(el('fieldset', { class: 'fs' }, [el('legend', { text: 'MONEY AND ODDS' }),
      el('div', { class: 'g2' }, [fld('EST. CONSTRUCTION COST', inp('cost', 'text', money('cost'), { inputmode: 'decimal', placeholder: 'e.g. 12m', autocomplete: 'off' })), fld('EST. FEE', inp('fee', 'text', money('fee'), { inputmode: 'decimal', placeholder: 'e.g. 450k', autocomplete: 'off' }))]),
      el('label', { class: 'fl' }, [el('span', { text: 'PWIN (YOUR ESTIMATE)' }), el('div', { class: 'pw' }, [pw, out])])]));
    b.appendChild(el('fieldset', { class: 'fs' }, [el('legend', { text: 'STAGE AND DATES' }),
      fld('CAPTURE STAGE', sel('stage', stageOpts, v.stage)),
      fld('DEADLINE KIND', sel('dueKind', M.DUE_KINDS.map(function (r) { return [r, r]; }), v.dueKind, '(not set)')),
      el('div', { class: 'g2' }, [fld('DUE DATE', inp('due', 'date', v.due)), fld('ANTICIPATED LETTING', inp('letting', 'date', v.letting))]),
      fld('NEXT ACTION', inp('next', 'text', v.next, { maxlength: 300, autocomplete: 'off' })), fld('NEXT ACTION DATE', inp('nextDate', 'date', v.nextDate))]));
    b.appendChild(el('fieldset', { class: 'fs' }, [el('legend', { text: 'TEAM AND NOTES' }),
      fld('TEAMING PARTNERS', inp('partners', 'text', v.partners, { maxlength: 300, autocomplete: 'off' })),
      fld('INCUMBENT / COMPETITORS', inp('competitors', 'text', v.competitors, { maxlength: 300, autocomplete: 'off' })),
      fld('STRATEGIC FIT', el('textarea', { name: 'fit', maxlength: 1000, rows: 3, text: v.fit })),
      fld('SOURCE URL', inp('url', 'url', v.url, { maxlength: 500, inputmode: 'url', placeholder: 'https://...', autocomplete: 'off' })),
      fld('NOTES', el('textarea', { name: 'notes', maxlength: 4000, rows: 4, text: v.notes }))]));
    openModal('#mForm'); $('#fBody').scrollTop = 0;
    if (!o) setTimeout(function () { var t = $('#fForm [name=title]'); if (t) t.focus({ preventScroll: true }); }, 50);
  }
  function submitForm(ev) {
    ev.preventDefault();
    var f = $('#fForm'), td = today(), vals = {}, errs = [];
    M.FIELDS.forEach(function (fd) {
      var n = f.elements[fd.k]; if (!n) return;
      var raw = n.value; var r = M.parseField(fd.k, raw, td);
      if (r.err) errs.push(r.err); else vals[fd.k] = r.v;
    });
    if (!vals.title) errs.unshift('TITLE is required');
    if (errs.length) { $('#fErr').textContent = errs[0]; return; }
    var wasStage = editing ? editing.stage : null, o, echo;
    if (editing) { Object.keys(vals).forEach(function (k) { editing[k] = vals[k]; }); editing.updated = new Date().toISOString(); o = editing; echo = 'edit ' + o.id + ' (form)'; }
    else { o = M.addOpp(state, vals, new Date().toISOString()); echo = 'add (form)'; }
    save(); closeModals(); renderDash();
    showOut(echo, [{ k: 'line', c: 'ok', s: (editing ? 'UPDATED #' : 'ADDED #') + o.id + ' ' + o.title }, { k: 'detail', o: o, today: td },
      { k: 'chips', chips: [{ label: 'edit ' + o.id, cmd: 'edit ' + o.id }, { label: 'list', cmd: 'list' }, { label: 'add another', cmd: 'add' }] }]);
    if ((o.stage === 'No-bid' || o.stage === 'Lost') && wasStage !== o.stage) stampIt(o.stage.toUpperCase());
    editing = null;
  }
  function openFilter() {
    var f = state.view.filter, b = $('#flBody'); clear(b);
    var ags = M.AGENCIES.slice(); state.opps.forEach(function (x) { if (x.agency && ags.indexOf(x.agency) < 0) ags.push(x.agency); });
    var stv = f.stage && f.stage.length === 1 ? f.stage[0] : '';
    var stOpts = [['active', 'ACTIVE (IDENTIFIED TO SHORTLISTED)'], ['closed', 'CLOSED (WON, LOST, NO-BID)']].concat(M.STAGES.map(function (s) { return [s.toLowerCase(), s.toUpperCase()]; }));
    b.appendChild(fld('AGENCY', sel('agency', ags.map(function (a) { return [a, a]; }), f.agency || '', 'ALL AGENCIES')));
    b.appendChild(fld('STAGE', sel('stage', stOpts, stv, 'ALL STAGES')));
    b.appendChild(fld('ROLE', sel('role', M.ROLES.map(function (r) { return [r, r]; }), f.role || '', 'ANY ROLE')));
    b.appendChild(el('div', { class: 'g2' }, [fld('COUNTY', inp('county', 'text', f.county || '', { autocomplete: 'off' })), fld('TXDOT DISTRICT', inp('district', 'text', f.district || '', { autocomplete: 'off' }))]));
    b.appendChild(fld('SEARCH TEXT', inp('q', 'search', f.q || '', { autocomplete: 'off' })));
    openModal('#mFilter');
  }
  function applyFilter(ev) {
    ev.preventDefault(); var f = $('#fFilter'), parts = [];
    ['agency', 'stage', 'role', 'county', 'district', 'q'].forEach(function (k) { var v = f.elements[k].value.trim().replace(/"/g, ''); if (v) parts.push(k + '="' + v + '"'); });
    closeModals(); exec(parts.length ? 'filter ' + parts.join(' ') : 'filter off');
  }
  var imp = { opps: null };
  function openImport() { $('#impText').value = ''; $('#impFile').value = ''; imp.opps = null; $('#impMsg').textContent = 'Nothing loaded yet.'; $('#impMerge').disabled = $('#impReplace').disabled = true; openModal('#mImport'); }
  function parseImpText() {
    var r = M.parseImport($('#impText').value);
    if (r.error) { imp.opps = null; $('#impMsg').textContent = $('#impText').value.trim() ? 'Cannot import: ' + r.error + '.' : 'Nothing loaded yet.'; }
    else { imp.opps = r.opps; $('#impMsg').textContent = 'Ready: ' + r.opps.length + ' opportunities (' + r.format.toUpperCase() + '). Replace all, or add to what you have.'; }
    $('#impMerge').disabled = $('#impReplace').disabled = !imp.opps || !imp.opps.length;
  }
  function doImport(mode) {
    if (!imp.opps || !imp.opps.length) return;
    if (mode === 'replace' && state.opps.length && !window.confirm('Replace all ' + state.opps.length + ' current opportunities? You can undo right after.')) return;
    M.snap(state); var n = M.applyImport(state, imp.opps, mode, new Date().toISOString());
    save(); closeModals(); renderDash();
    showOut('import (' + mode + ')', [{ k: 'line', c: 'ok', s: 'IMPORTED ' + n + ' opportunities (' + (mode === 'replace' ? 'replaced all' : 'added to existing') + ').' }, { k: 'chips', chips: [{ label: 'undo', cmd: 'undo' }, { label: 'list', cmd: 'list' }, { label: 'stats', cmd: 'stats' }] }]);
  }

  /* ---------- clock ---------- */
  var lastDay = '';
  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], MONS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function tick() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    $('#clk').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    var ds = DAYS[d.getDay()] + ' ' + MONS[d.getMonth()] + ' ' + p(d.getDate()) + ' ' + d.getFullYear();
    $('#clkDate').textContent = ds;
    var t = M.todayStr(d); if (lastDay && t !== lastDay) renderDash(); lastDay = t;
  }

  /* ---------- wiring ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-cmd]');
    if (t && !t.closest('.modal')) { ev.preventDefault(); exec(t.getAttribute('data-cmd')); return; }
    if (ev.target.closest && ev.target.closest('[data-close]')) closeModals();
    else if (ev.target.classList && ev.target.classList.contains('modal')) closeModals();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeModals();
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.box.tap')) { ev.preventDefault(); exec(ev.target.getAttribute('data-cmd')); }
  });
  $('#cl').addEventListener('submit', function (ev) { ev.preventDefault(); var i = $('#cmd'), v = i.value; i.value = ''; exec(v); });
  $('#fForm').addEventListener('submit', submitForm);
  $('#fFilter').addEventListener('submit', applyFilter);
  $('#flReset').addEventListener('click', function () { closeModals(); exec('filter off'); });
  $('#impText').addEventListener('input', parseImpText);
  $('#impFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { $('#impMsg').textContent = 'File is too large (max 5 MB).'; return; }
    var r = new FileReader(); r.onload = function () { $('#impText').value = String(r.result || ''); parseImpText(); }; r.onerror = function () { $('#impMsg').textContent = 'Could not read that file.'; }; r.readAsText(f);
  });
  $('#impReplace').addEventListener('click', function () { doImport('replace'); });
  $('#impMerge').addEventListener('click', function () { doImport('merge'); });
  if (window.visualViewport) {
    var vv = window.visualViewport, fit = function () { var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)); document.documentElement.style.setProperty('--kb', kb + 'px'); };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
  }
  buildDock(); sizeDock();
  if (window.ResizeObserver) new ResizeObserver(sizeDock).observe($('#dock')); else window.addEventListener('resize', sizeDock);
  renderDash(); tick(); setInterval(tick, 1000);
})();
