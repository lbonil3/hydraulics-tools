/* SWP3 Builder: Design tab and "By situation" BMP recommender UI. Logic lives in design.js and recommend.js. */
(function () {
  'use strict';
  var A, M, D, DS = window.SwpDesign, RC = window.SwpRecommend;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var st = { sub: 'ro', prices: null, pricesErr: false, situOpen: {} };
  var SUBS = [['ro', 'Runoff'], ['ba', 'Basin'], ['fd', 'Fence & dams'], ['di', 'Ditch'], ['dr', 'Drains'], ['ru', 'Erosion'], ['qt', 'Exit & qty'], ['su', 'Summary']];
  var QLABEL = { silt_fence: ['Silt fence', 'LF'], erosion_log: ['Erosion control logs', 'LF'], rock_dam: ['Rock filter dam Type 1', 'LF'], rock_dam_2: ['Rock filter dam Type 2', 'LF'], construction_exit: ['Construction exit Type 1', 'SY'], inlet_protection: ['Fence inlet protection', 'LF'], paved_flume: ['Temporary paved flume', 'SY'], basin_excavation: ['Basin excavation', 'CY'], basin_embankment: ['Basin embankment', 'CY'], perimeter_fence: ['Construction perimeter fence', 'LF'] };

  /* ---------- data access ---------- */
  function dd() { var p = A.cur(); if (!p.design || typeof p.design !== 'object') p.design = {}; return p.design; }
  function gv(m, k) { var d = dd(); return d[m] && d[m][k] != null ? d[m][k] : ''; }
  function sv(m, k, v) { var d = dd(); if (!d[m]) d[m] = {}; d[m][k] = v; A.save(); }
  function priceFn(code) { if (!st.prices) return null; var row = st.prices[code]; return row ? window.BidCostLookup.resolvePrice(row) : null; }
  function env() { return { idf: window.IDF_PDS, ls: window.SwpLS, price: priceFn }; }
  function compute() { return DS.compute(dd(), env()); }
  function loadPrices() {
    if (st.prices || st.pricesErr || typeof fetch !== 'function') return;
    fetch('../bid-cost/prices.json').then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); }).then(function (j) {
      var by = {}; (j.rows || []).forEach(function (x) { by[x.bid_code] = x; }); st.prices = by; st.pricesMeta = j.meta || {};
      if (A.ui.tab === 'design' && (st.sub === 'qt' || st.sub === 'su')) renderDesign();
    }).catch(function () { st.pricesErr = true; });
  }

  /* ---------- html helpers ---------- */
  function inp(m, k, label, o) {
    o = o || {}; var v = gv(m, k);
    return '<label class="f"><span>' + esc(label) + '</span><input type="text" inputmode="decimal" data-d="' + m + '.' + k + '" value="' + esc(v) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' +
      (o.fill ? '<button type="button" class="btn sec sm fillbtn" data-fill="' + m + '.' + k + '" data-from="' + o.fill[0] + '">' + esc(o.fill[1]) + '</button>' : '') + (o.help ? '<small class="help">' + o.help + '</small>' : '') + '</label>';
  }
  function selD(m, k, label, opts, help) {
    var v = gv(m, k);
    return '<label class="f"><span>' + esc(label) + '</span><select data-d="' + m + '.' + k + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + (help ? '<small class="help">' + help + '</small>' : '') + '</label>';
  }
  function chkD(m, k, label) { return '<label class="chk"><input type="checkbox" data-dc="' + m + '.' + k + '"' + (gv(m, k) ? ' checked' : '') + '><span>' + esc(label) + '</span></label>'; }
  function srcLink(key) { var s = D.SOURCES[key]; if (!s) return ''; return A.bd(s.badge) + '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label.length > 90 ? s.label.slice(0, 88) + '...' : s.label) + '</a>' + (s.status === 'read' ? '' : ' <i class="muted small">(link checked, not read)</i>'); }
  function f2(v, k) { return v == null || !isFinite(v) ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: k == null ? 2 : k }); }
  function pill(ok) { return '<span class="pill ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'PASS' : 'CHECK') + '</span> '; }
  function stepsHtml(steps) { return steps && steps.length ? '<div class="work">' + steps.map(function (s) { return '<div class="ws"><b>' + esc(s.label) + '</b><code>' + esc(s.expr) + '</code><span class="wv">= ' + esc(s.value) + ' ' + esc(s.unit) + '</span></div>'; }).join('') + '</div>' : ''; }
  function checksHtml(cs) { return cs && cs.length ? '<ul class="checks">' + cs.map(function (c) { return '<li>' + pill(c.ok) + esc(c.label) + '<br><small class="muted">' + esc(c.detail) + (c.src && D.SOURCES[c.src] ? ' ' + A.bd(D.SOURCES[c.src].badge) : '') + '</small></li>'; }).join('') + '</ul>' : ''; }
  // One calc block: title, verdict line, equation, source, work, checks
  function block(title, r, o) {
    o = o || {}; if (!r) return '';
    if (r.error) return '<div class="card calc"><h3>' + esc(title) + '</h3><p class="muted small">' + esc(r.error) + '</p></div>';
    return '<div class="card calc"><h3>' + esc(title) + '</h3>' + (o.head ? o.head : '') + (r.eq ? '<p class="eq"><b>Equation:</b> <code>' + esc(r.eq) + '</code></p>' : '') + (r.src ? '<p class="srcl">' + srcLink(r.src) + '</p>' : '') +
      '<details class="wk"' + (o.open ? ' open' : '') + '><summary>Show the work</summary>' + stepsHtml(r.steps) + '</details>' + checksHtml(r.checks) +
      (r.notes && r.notes.length ? '<ul class="notes">' + r.notes.map(function (n) { return '<li>' + A.bd('ASSUMED') + esc(n) + '</li>'; }).join('') + '</ul>' : '') + (r.note ? '<p class="muted small">' + A.bd('ASSUMED') + esc(r.note) + '</p>' : '') + '</div>';
  }
  function scroll(html) { return '<div class="scrollx">' + html + '</div>'; }
  function mdBlock(title, r) { return r && !r.error ? DS.sheetMarkdown(title, r) + '\n' : ''; }

  /* ---------- module forms ---------- */
  function formRO() {
    var rows = window.IDF_PDS || [], counties = DS.idfCounties(rows), cty = gv('ro', 'county'), zones = cty ? DS.idfZones(rows, cty) : [];
    var h = '<div class="card"><h2>1. Runoff</h2><p class="muted small">' + A.bd('TXDOT') + 'Rational method (HDM Ch.4 Sec.12) with TxDOT IDF coefficients by county (EBDLKUP-2019). Tc and C: use the <a href="../rational/">Rational tool</a> and type the results here.</p>' +
      selD('ro', 'county', 'County', [['', 'Choose county']].concat(counties.map(function (c) { return [c, c]; }))) +
      (zones.length > 1 ? selD('ro', 'zone', 'IDF zone', [['', 'Choose zone']].concat(zones.map(function (z) { return [z, z]; }))) : '') +
      '<div class="grid2">' + inp('ro', 'C', 'Runoff coefficient C', { help: 'HDM Table 4-10 ranges are in the Rational tool.' }) + inp('ro', 'A', 'Drainage area (ac)') + '</div>' +
      '<div class="grid2">' + inp('ro', 'tc', 'Time of concentration (min)', { help: 'Under 10 min is raised to 10 (HDM).' }) + inp('ro', 'iOv', 'Intensity override (in/hr, optional)') + '</div>' +
      '<button type="button" class="btn sec sm" data-act="useproj">Use largest open area from the Project tab</button></div>' +
      '<div class="card"><h3>Runoff volume for basin sizing (NRCS CN)</h3><p class="muted small">' + A.bd('TXDOT') + 'HDM Ch.4 Sec.13. The 2-yr 24-hr rainfall depth P2 is yours to enter (NOAA Atlas 14); this tool does not store it.</p><div class="grid2">' +
      selD('ro', 'hsg', 'Hydrologic soil group', [['', 'Choose'], ['A', 'A (newly graded CN 77)'], ['B', 'B (newly graded CN 86)'], ['C', 'C (newly graded CN 91)'], ['D', 'D (newly graded CN 94)']]) + inp('ro', 'CN', 'CN override (optional)') + '</div>' + inp('ro', 'P2', '2-yr 24-hr rainfall P2 (in)') + '</div>';
    var rowsH = (dd().ro && dd().ro.rows || []).map(function (r, i) { return '<div class="rowline" data-ri="' + i + '"><input type="text" data-rn="' + i + '" value="' + esc(r.n) + '" placeholder="BMP name" aria-label="BMP name"><input type="text" inputmode="decimal" data-ra="' + i + '" value="' + esc(r.a) + '" placeholder="ac" aria-label="Drainage area, acres"><button type="button" class="btn danger sm" data-act="delrow" data-i="' + i + '" aria-label="Remove row">&times;</button></div>'; }).join('');
    h += '<div class="card"><h3>Drainage area per BMP</h3><p class="muted small">Uses the C and Tc above: Q = C i A for each area.</p>' + rowsH + '<button type="button" class="btn sec block" data-act="addrow">+ Add BMP area</button></div>';
    return h;
  }
  function formBA() {
    return '<div class="card"><h2>2. Sediment basin / trap</h2><p class="muted small">' + A.bd('TCEQ') + 'permit floor, ' + A.bd('TXDOT') + 'guidance, ' + A.bd('ISWM') + 'dimensions. Blank area, P2 and CN fall back to the Runoff entries.</p>' +
      '<div class="grid2">' + inp('ba', 'A', 'Area drained (ac)') + inp('ba', 'dist', 'Disturbed area (ac)') + '</div><div class="grid2">' + inp('ba', 'P2', 'P2 (in)') + inp('ba', 'CN', 'CN') + '</div>' +
      chkD('ba', 'permit', 'Basin or trap is the permit control (under 10 ac: alternative to fence)') + chkD('ba', 'iswm', 'Also size to iSWM (2-yr runoff + 1,000 cu ft)') + '</div>' +
      '<div class="card"><h3>Dimension solver</h3><div class="grid2">' + inp('ba', 'Vo', 'Volume override (cu ft)', { help: 'Blank = required storage' }) + inp('ba', 'D', 'Storage depth (ft)') + '</div><div class="grid2">' + inp('ba', 'Z', 'Side slope (H:1V)', { ph: '3' }) + inp('ba', 'ratio', 'Surface L:W', { ph: '4' }) + '</div>' + inp('ba', 'fb', 'Freeboard (ft)', { ph: '1' }) + '</div>' +
      '<div class="card"><h3>Dewatering</h3><div class="grid2">' + inp('ba', 'hours', 'Dewatering time (h)', { ph: '40' }) + inp('ba', 'head', 'Skimmer head (ft)', { help: 'Optional' }) + '</div></div>' +
      '<div class="card"><h3>Emergency spillway and riser</h3><div class="grid2">' + inp('ba', 'q25', '25-yr peak (cfs)', { fill: ['q25', 'Use Runoff 25-yr'] }) + inp('ba', 'qp', 'Principal outlet flow (cfs)') + '</div><div class="grid2">' + inp('ba', 'H', 'Head over crest (ft)') + inp('ba', 'Lsel', 'Crest length chosen (ft)') + '</div>' + inp('ba', 'q100', '100-yr peak (cfs)', { fill: ['q100', 'Use Runoff 100-yr'] }) +
      '<div class="grid3">' + inp('ba', 'perim', 'Riser perimeter (ft)') + inp('ba', 'area', 'Open area (sq ft)') + inp('ba', 'rhead', 'Head (ft)') + '</div></div>';
  }
  function formFD() {
    return '<div class="card"><h2>3. Silt fence</h2><p class="muted small">' + A.bd('TXDOT') + 'fact sheet limits, ' + A.bd('ISWM') + 'iSWM 3.10.3.</p><div class="grid2">' + inp('sf', 'A', 'Area to one run (ac)') + inp('sf', 'Q', 'Flow (cfs)', { fill: ['q2', 'Use Runoff 2-yr'] }) + '</div><div class="grid2">' + inp('sf', 'L', 'Fence length (ft, optional)') + inp('sf', 'H', 'Fence height (ft)', { ph: '2' }) + '</div><div class="grid2">' + inp('sf', 'slope', 'Slope (%)') + inp('sf', 'dist', 'Flow distance (ft)') + '</div></div>' +
      '<div class="card"><h2>4. Rock filter dam</h2><div class="grid2">' + inp('rd', 'Q', '2-yr flow (cfs)', { fill: ['q2', 'Use Runoff 2-yr'] }) + inp('rd', 'W', 'Channel width at dam (ft)') + '</div><div class="grid2">' + inp('rd', 'h', 'Dam height (ft)', { ph: '1.5' }) + inp('rd', 'v', 'Velocity (ft/s)') + '</div>' + selD('rd', 'type', 'Type', [['1', 'Type 1 (18 in.)'], ['2', 'Type 2 (18 in., reinforced)'], ['3', 'Type 3 (36 in., reinforced)']]) + '</div>' +
      '<div class="card"><h2>5. Check dam spacing</h2><div class="grid2">' + inp('cd', 'h', 'Dam height (ft)') + inp('cd', 'S', 'Channel slope (ft/ft)') + '</div><div class="grid2">' + inp('cd', 'depth', 'Channel depth (ft)') + inp('cd', 'reach', 'Reach length (ft)') + '</div></div>';
  }
  function formDI() {
    var opts = [['', 'Choose lining']].concat(Object.keys(DS.TXT_TP).map(function (k) { return [k, k + ' (tp ' + DS.TXT_TP[k] + ' lb/sq ft)']; }));
    return '<div class="card"><h2>6. Ditch lining check</h2><p class="muted small">' + A.bd('TXDOT') + 'HDM Ch.7 Sec.3 permissible shear; Manning and shear per HEC-15 via the Ditch tool library. For RECP/TRM products use the <a href="../ditch/">Ditch tool</a> with manufacturer data.</p>' +
      '<div class="grid2">' + inp('di', 'Q', 'Design flow (cfs)', { fill: ['q2', 'Use Runoff 2-yr'] }) + inp('di', 'S', 'Slope (ft/ft)') + '</div><div class="grid2">' + inp('di', 'B', 'Bottom width (ft)') + inp('di', 'Z', 'Side slope (H:1V)') + '</div><div class="grid2">' + inp('di', 'n', 'Manning n') + inp('di', 'SF', 'Safety factor', { ph: '1' }) + '</div>' + selD('di', 'lining', 'Lining', opts) + inp('di', 'dd', 'Ditch depth (ft, optional freeboard check)') + '</div>';
  }
  function formDR() {
    return '<div class="card"><h2>7. Pipe slope drain</h2><p class="muted small">' + A.bd('ISWM') + 'Table 2.2 sizes; ' + A.bd('TXDOT') + 'fact sheet: 5 ac, 25-yr flow, dike 1 ft above inlet pipe.</p><div class="grid2">' + inp('sd', 'Q', 'Design flow (cfs)', { fill: ['q25', 'Use Runoff 25-yr'] }) + inp('sd', 'A', 'Area to drain (ac)') + '</div><div class="grid2">' + inp('sd', 'D', 'Pipe diameter (in.)') + inp('sd', 'S', 'Pipe slope (ft/ft)') + '</div><div class="grid2">' + inp('sd', 'n', 'Manning n', { ph: '0.013' }) + inp('sd', 'dike', 'Dike above pipe top (ft)') + '</div></div>' +
      '<div class="card"><h2>8. Inlet protection capacity</h2><p class="muted small">' + A.bd('TXDOT') + 'HDM Eq 10-30 and 10-31 for a grate in a sump. Blockage factor is yours (1 = none).</p><div class="grid2">' + inp('ic', 'perimeter', 'Grate perimeter (ft)') + inp('ic', 'area', 'Clear open area (sq ft)') + '</div><div class="grid3">' + inp('ic', 'head', 'Allowable head (ft)') + inp('ic', 'Q', 'Flow (cfs)', { fill: ['q2', 'Use 2-yr'] }) + inp('ic', 'clog', 'Blockage factor', { ph: '1' }) + '</div></div>';
  }
  function formRU() {
    var ru = dd().ru || {}, fe = ru.fe || {};
    var ctl = Object.keys(DS.FE).map(function (k) { var c = DS.FE[k], v = fe[k] || ''; return '<label class="f ctl"><span>' + esc(c[2]) + '</span><select data-fe="' + k + '"><option value="">Not used</option><option value="low"' + (v === 'low' ? ' selected' : '') + '>Fe ' + c[0] + (c[0] === c[1] ? '' : ' (low end)') + '</option>' + (c[0] !== c[1] ? '<option value="high"' + (v === 'high' ? ' selected' : '') + '>Fe ' + c[1] + ' (high end)</option>' : '') + '</select></label>'; }).join('');
    return '<div class="card"><h2>9. Erosion estimate and site rating</h2><p class="muted small">' + A.bd('ISWM') + 'USLE and site rating (iSWM Construction Controls 1.3): Z = R K LS C P; controls in series by efficiency Fe; rating = soil retained / uncontrolled (guideline 0.70 where the local government requires it). R = 300 is iSWM\'s value for North Central Texas only; enter the value for your site.</p>' +
      '<div class="grid2">' + inp('ru', 'R', 'R (rainfall erosivity)') + inp('ru', 'A', 'Area (ac)') + '</div>' +
      selD('ru', 'kpick', 'Soil texture (iSWM Table 1.4 K)', [['', 'Choose to fill K']].concat(DS.K_ISWM.map(function (x) { return [x[1], x[0] + ' (K ' + x[1] + ')']; })), 'About 2% organic matter. Prefer the geotechnical report or NRCS Web Soil Survey K.') + inp('ru', 'K', 'K (soil erodibility)') +
      selD('ru', 'lsm', 'LS method', [['iswm', 'iSWM Eq 1.4'], ['ah703', 'USDA AH-703 table (high rill, construction)'], ['manual', 'Enter LS']]) + '<div class="grid2">' + inp('ru', 'L', 'Flow length (ft)') + inp('ru', 'slope', 'Slope (%)') + '</div>' + (ru.lsm === 'manual' ? inp('ru', 'LSm', 'LS') : '') +
      inp('ru', 'C', 'C (cover factor)', { ph: '1', help: 'Bare or stripped ground = 1.0 (iSWM). Table 1.6 values are yours to enter.' }) + '</div>' +
      '<div class="card"><h3>Controls in series</h3><p class="muted small">Efficiency ratings from iSWM Tables 1.1 and 1.2 (designed for the 2-yr, 24-hr storm and installed to the manual).</p><button type="button" class="btn sec sm block" data-act="usesel">Use my selected BMPs (low end)</button>' + ctl + '</div>';
  }
  function formQT() {
    var p = A.cur(), ids = A.M.selectedIds(p.form, p.sel), q = (dd().qt && dd().qt.q) || {}, over = (dd().qt && dd().qt.over) || {};
    var fromSel = {}; ids.forEach(function (id) { var k = DS.QTY_FOR_BMP[id]; if (k) fromSel[k] = (fromSel[k] ? fromSel[k] + ', ' : '') + A.M.bmpById(id).name; });
    var keys = Object.keys(QLABEL).sort(function (a, b) { return (fromSel[b] ? 1 : 0) - (fromSel[a] ? 1 : 0); });
    var h = '<div class="card"><h2>10. Rock construction exit</h2><p class="muted small">' + A.bd('TXDOT') + 'Item 506 sec 4.4.4 and fact sheet; ' + A.bd('ISWM') + 'iSWM Table 3.9 by disturbed area (the larger value governs).</p><div class="grid2">' + inp('ex', 'dist', 'Disturbed area (ac)') + inp('ex', 't', 'Rock thickness (in.)', { ph: '8' }) + '</div>' + chkD('ex', 'two', 'Two-way traffic') + '<div class="grid2">' + inp('ex', 'w', 'Width, if larger (ft)') + inp('ex', 'l', 'Length, if larger (ft)') + '</div></div>';
    h += '<div class="card"><h2>11. Quantities and cost</h2><p class="muted small">' + A.bd('TXDOT') + 'Item 506 pay items from the bid tabulations (planning averages). Houston average where available, else statewide; type a price to override. Items for BMPs you selected are listed first.</p><button type="button" class="btn sec sm block" data-act="seedqty">Seed from design results</button>';
    keys.forEach(function (k) {
      var items = DS.BID[k] || [];
      h += '<div class="qrow"><div class="qh"><b>' + esc(QLABEL[k][0]) + '</b>' + (fromSel[k] ? ' <span class="pill mid">selected: ' + esc(fromSel[k]) + '</span>' : '') + '</div><label class="f"><span>Quantity (' + QLABEL[k][1] + ')</span><input type="text" inputmode="decimal" data-qk="' + k + '" value="' + esc(q[k] || '') + '"></label>' +
        items.map(function (b) { var pr = priceFn(b[0]); return '<label class="f sm"><span>' + esc(b[0]) + ' ' + esc(b[1]) + ' ($/' + b[2] + ')</span><input type="text" inputmode="decimal" data-qo="' + b[0] + '" value="' + esc(over[b[0]] || '') + '" placeholder="' + (pr && pr.price != null ? f2(pr.price, 2) + ' ' + pr.source + ' avg' : st.pricesErr ? 'enter price' : 'loading...') + '"></label>'; }).join('') + '</div>';
    });
    return h + '</div>';
  }

  /* ---------- results ---------- */
  function resRO(o) {
    var h = '';
    if (o.storms && o.storms.length) {
      h += '<div class="card calc"><h3>Peak flows (rational)</h3><p class="eq"><b>Equation:</b> <code>Q = C i A;  i = b/(tc + d)^e</code></p><p class="srcl">' + srcLink('HDM_HYD') + '</p>' +
        scroll('<table class="rt"><thead><tr><th>Storm</th><th>Tc (min)</th><th>i (in/hr)</th><th>Q (cfs)</th></tr></thead><tbody>' + o.storms.map(function (s) { return '<tr><td>' + s.yr + '-yr</td><td>' + f2(s.tc, 1) + '</td><td>' + f2(s.i, 2) + '</td><td><b>' + f2(s.Q, 1) + '</b></td></tr>'; }).join('') + '</tbody></table>') +
        '<p class="muted small">IDF: ' + esc(o.storms[0].k.county) + ', ' + esc(o.storms[0].k.zone) + '. Coefficients (e, b, d) at 25-yr: ' + o.storms.filter(function (s) { return s.yr === 25; }).map(function (s) { return f2(s.k.e, 4) + ', ' + f2(s.k.b, 2) + ', ' + f2(s.k.d, 2); }).join('') + '.</p>' +
        '<details class="wk"><summary>Show the work (2-yr and 25-yr)</summary>' + [0, 3].map(function (i) { return o.storms[i] ? '<p class="muted small"><b>' + o.storms[i].yr + '-yr</b></p>' + stepsHtml(o.storms[i].steps) : ''; }).join('') + '</details>' +
        (o.storms[0].warn && o.storms[0].warn.length ? '<ul class="notes">' + o.storms[0].warn.map(function (w) { return '<li>' + A.bd('TXDOT') + esc(w) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    } else if (!o.user) h += '<div class="card"><p class="muted small">Enter county, C, area and Tc to see the design storms.</p></div>';
    if (o.user) h += block('Rational with your intensity', o.user);
    if (o.cn) h += block('Runoff depth and volume (CN)', o.cn);
    if (o.rows && o.rows.length) h += '<div class="card calc"><h3>Per-BMP drainage areas</h3>' + scroll('<table class="rt"><thead><tr><th>BMP</th><th>Area (ac)</th><th>Q2 (cfs)</th><th>Q25 (cfs)</th></tr></thead><tbody>' + o.rows.map(function (r) { return '<tr><td>' + esc(r.n) + '</td><td>' + f2(r.a, 2) + '</td><td>' + f2(r.Q2, 2) + '</td><td>' + f2(r.Q25, 2) + '</td></tr>'; }).join('') + '</tbody></table>') + '</div>';
    return h;
  }
  function resBA(o) {
    var h = '';
    if (o.storage) {
      var s = o.storage;
      h += '<div class="card calc"><h3>Required storage</h3><div class="verdict ok"><b>' + f2(s.requiredCf, 0) + ' cu ft</b>' + (s.governs ? 'governed by: ' + esc(s.governs.label) : '') + '</div><p class="srcl">' + srcLink('TXR') + '<br>' + srcLink('TXD_S21') + '</p>' +
        '<div class="scrollx"><table class="rt"><thead><tr><th>Criterion</th><th>Volume (cu ft)</th><th>Basis</th></tr></thead><tbody>' + s.items.map(function (i) { return '<tr' + (i === s.governs ? ' class="gov"' : '') + '><td>' + A.bd(D.SOURCES[i.src] ? D.SOURCES[i.src].badge : 'ASSUMED') + esc(i.label) + (i.applies ? '' : ' <i class="muted small">(reference)</i>') + '</td><td>' + f2(i.cf, 0) + '</td><td class="muted small">' + esc(i.how) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        (s.flags.length ? '<ul class="notes">' + s.flags.map(function (x) { return '<li>' + A.bd('TCEQ') + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      if (s.calc && s.calc.steps) h += block('2-yr 24-hr runoff used for the permit value', s.calc);
    }
    if (o.dims) h += block('Basin dimensions', o.dims, { head: '<div class="verdict ' + (o.dims.checks.every(function (c) { return c.ok; }) ? 'ok' : 'mid') + '"><b>Top ' + f2(o.dims.Lt, 0) + ' x ' + f2(o.dims.Wt, 0) + ' ft, bottom ' + f2(o.dims.Lb, 0) + ' x ' + f2(o.dims.Wb, 0) + ' ft</b>depth ' + f2(o.dims.D, 1) + ' ft, side slopes ' + o.dims.Z + ':1, clean out at ' + f2(o.dims.cleanoutDepth, 1) + ' ft of sediment (50% of storage, permit III.F.6(c))</div>', open: true });
    if (o.skim) h += block('Dewatering / skimmer', o.skim);
    if (o.spill) h += block('Emergency spillway', o.spill, { head: '<p class="muted small">Qe = Q25 - Qp = ' + f2(o.spill.q25, 1) + ' - ' + f2(o.spill.qp, 1) + ' = ' + f2(o.spill.Qe, 1) + ' cfs (iSWM 3.9).' + (o.spill.H100 != null ? ' 100-yr check: head over this crest is about ' + f2(o.spill.H100, 2) + ' ft for ' + f2(o.spill.q100, 1) + ' cfs (TxDOT: check the 100-yr for flooding).' : '') + '</p>' });
    if (o.riser) h += block('Riser capacity', o.riser);
    return h || '<div class="card"><p class="muted small">Enter the drainage area (or complete Runoff) to size storage.</p></div>';
  }
  function resFD(o) { return (o.sf ? block('Silt fence', o.sf, { head: '<div class="verdict ok"><b>At least ' + f2(o.sf.Lmin, 0) + ' ft of fence</b></div>', open: true }) : '') + (o.rd ? block('Rock filter dam', o.rd, { open: true }) : '') + (o.cd ? block('Check dam spacing', o.cd, { head: '<div class="verdict ok"><b>Spacing ' + f2(o.cd.spacing, 1) + ' ft</b>' + (o.cd.count ? o.cd.count + ' dams in the reach' : '') + '</div>', open: true }) : '') || '<div class="card"><p class="muted small">Enter values above to see the checks.</p></div>'; }
  function resDI(o) { return o.di ? block('Lining check', o.di, { head: '<div class="verdict ' + (o.di.ok ? 'ok' : 'bad') + '"><b>' + (o.di.ok ? 'PASS' : 'FAIL') + ': design shear ' + f2(o.di.td, 2) + ' vs permissible ' + f2(o.di.tp, 2) + ' lb/sq ft</b>depth ' + f2(o.di.depth, 2) + ' ft, V ' + f2(o.di.V, 1) + ' ft/s, ' + esc(o.di.regime) + '</div>', open: true }) + '<div class="card"><p class="muted small">' + A.bd('TXDOT') + 'Permissible shear table: HDM Ch.7 Sec.3 (' + srcLink('HDM_CH7') + '). Vegetation values are for established cover.</p></div>' : '<div class="card"><p class="muted small">Enter flow, slope, geometry, n and a lining.</p></div>'; }
  function resDR(o) { return (o.sd ? block('Pipe slope drain', o.sd, { open: true }) : '') + (o.ic ? block('Inlet capacity', o.ic, { head: '<div class="verdict ' + (o.ic.ok === false ? 'bad' : 'ok') + '"><b>Capacity ' + f2(o.ic.cap, 2) + ' cfs (' + o.ic.governs + ' governs)</b>' + (o.ic.bypass != null ? 'bypass ' + f2(o.ic.bypass, 2) + ' cfs' : '') + '</div>', open: true }) : '') || '<div class="card"><p class="muted small">Enter a pipe diameter or grate dimensions.</p></div>'; }
  function resRU(o) {
    var ru = dd().ru || {}, h = '';
    if (num(ru.L) != null && num(ru.slope) != null) {
      var a = DS.lsISWM(num(ru.L), num(ru.slope) / 100), b = window.SwpLS ? DS.lsTable(window.SwpLS, 'high', num(ru.L), num(ru.slope)) : null;
      h += '<div class="card"><h3>LS cross-check</h3><p class="muted small">' + A.bd('ISWM') + 'iSWM Eq 1.4: <b>' + f2(a, 2) + '</b>. ' + A.bd('ISWM') + 'USDA AH-703 table (high rill, freshly graded, interpolated): <b>' + f2(b, 2) + '</b>. Pick the method above; they differ, so state which one you used.</p><p class="srcl">' + srcLink('AH703') + '</p></div>';
    }
    if (o.ru) h += block('Soil loss and site rating', o.ru, { head: '<div class="verdict ' + (o.ru.ok ? 'ok' : 'bad') + '"><b>Site rating ' + f2(o.ru.SR, 2) + (o.ru.ok ? ' (meets 0.70)' : ' (below 0.70)') + '</b>uncontrolled ' + f2(o.ru.uncontrolledZA, 1) + ' tons/yr; with controls about ' + f2(o.ru.leaving, 1) + ' tons/yr leave the site (' + f2(o.ru.uncontrolledZ, 1) + ' tons/ac/yr uncontrolled; LS ' + f2(o.ru.LSused, 2) + ' by ' + esc(o.ru.lsHow) + ')</div>', open: true });
    return h || '<div class="card"><p class="muted small">Enter R, area, K, and a length and slope (or LS).</p></div>';
  }
  function num(v) { return M.num(v); }
  function resQT(o) {
    var h = '';
    if (o.ex) h += block('Rock construction exit', o.ex, { head: '<div class="verdict ok"><b>' + f2(o.ex.W, 0) + ' ft x ' + f2(o.ex.L, 0) + ' ft, ' + o.ex.thickIn + ' in. rock</b>' + f2(o.ex.SY, 0) + ' sq yd; ' + f2(o.ex.CY, 0) + ' cu yd of rock</div>', open: true });
    if (o.take) {
      var t = o.take; t = { lines: t.lines, total: t.total, missing: t.missing, note: t.note };
      var d = dd(); if (!d.qt) d.qt = {}; d.qt.snap = { lines: t.lines.map(function (l) { return { code: l.code, desc: l.desc, qty: l.qty, unit: l.unit, price: l.price, source: l.source || '', ext: l.ext }; }), total: t.total, missing: t.missing, note: t.note }; A.save();
      h += '<div class="card calc"><h3>Takeoff</h3>' + scroll('<table class="rt"><thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit $</th><th>Ext.</th></tr></thead><tbody>' + t.lines.map(function (l) { return '<tr><td>' + esc(l.code) + '</td><td>' + esc(l.desc) + '</td><td>' + f2(l.qty, 1) + ' ' + esc(l.unit) + '</td><td>' + (l.price != null ? '$' + f2(l.price, 2) + '<br><small class="muted">' + esc(l.source || '') + (l.n ? ' n=' + l.n : '') + '</small>' : 'enter') + '</td><td>' + (l.ext != null ? '$' + f2(l.ext, 0) : '') + '</td></tr>'; }).join('') + '</tbody></table>') +
        '<div class="verdict ok"><b>Planning total $' + f2(t.total, 0) + '</b>' + (t.missing ? t.missing + ' line(s) have no price yet. ' : '') + '</div><p class="muted small">' + A.bd('TXDOT') + esc(t.note) + (st.pricesMeta && st.pricesMeta.accessed ? ' Data accessed ' + esc(st.pricesMeta.accessed) + '.' : '') + ' <a href="../bid-cost/">Bid cost lookup</a></p></div>';
    } else if (dd().qt && dd().qt.snap) { delete dd().qt.snap; A.save(); }
    return h || '<div class="card"><p class="muted small">Enter a disturbed area for the exit, and quantities for the takeoff.</p></div>';
  }
  function resSU(o) {
    var blocks = DS.outlineBlocks(o, dd().qt && dd().qt.snap), p = A.cur();
    var h = '<div class="card"><h2>12. Design summary</h2><p class="muted small">These results feed the SWP3 outline (section "Design basis and quantities"). Screening and design aid for engineer review; not a sealed design.</p>' +
      (blocks.length ? '<div class="doc sum">' + M.blocksToHtml(blocks) + '</div>' : '<p class="muted small">Nothing calculated yet. Fill in the modules.</p>') +
      '<div class="row"><button type="button" class="btn" data-act="printcalc">Print calc package</button><button type="button" class="btn sec" data-act="calcmd">Download Markdown</button><button type="button" class="btn sec" data-act="calcjson">Download JSON</button></div></div>';
    return h;
  }
  function results() {
    var o = compute(), s = st.sub;
    return s === 'ro' ? resRO(o) : s === 'ba' ? resBA(o) : s === 'fd' ? resFD(o) : s === 'di' ? resDI(o) : s === 'dr' ? resDR(o) : s === 'ru' ? resRU(o) : s === 'qt' ? resQT(o) : '';
  }

  /* ---------- calc package (print, markdown, json) ---------- */
  function sheets(o) {
    var S = [['Runoff: peak flows', o.storms && o.storms.length ? { eq: 'Q = C i A; i = b/(tc+d)^e', src: 'HDM_HYD', steps: o.storms.reduce(function (a, s) { return a.concat([{ label: s.yr + '-yr', expr: '', value: f2(s.Q, 2), unit: 'cfs' }], s.steps); }, []) } : null], ['Runoff volume (CN)', o.cn], ['Basin storage', o.storage ? { eq: 'Required = max(applicable criteria)', src: o.storage.src, steps: o.storage.items.map(function (i) { return { label: i.label, expr: i.how, value: f2(i.cf, 0), unit: 'cu ft' + (i === o.storage.governs ? ' (governs)' : '') }; }) } : null],
      ['Basin dimensions', o.dims], ['Dewatering', o.skim], ['Emergency spillway', o.spill], ['Riser capacity', o.riser], ['Silt fence', o.sf], ['Rock filter dam', o.rd], ['Check dams', o.cd], ['Ditch lining', o.di], ['Pipe slope drain', o.sd], ['Inlet capacity', o.ic], ['Soil loss and site rating', o.ru], ['Rock construction exit', o.ex]];
    return S.filter(function (x) { return x[1] && !x[1].error; });
  }
  function sheetsHtml(o) {
    var p = A.cur();
    return '<div class="doc calcpkg"><h1>Design calculations: ' + esc(p.name) + '</h1><p class="draftbar"><b>Screening and design aid for engineer review. Not a sealed design.</b></p><p class="meta">' + esc(new Date().toLocaleDateString('en-US')) + ' &middot; SWP3 Builder Design tab</p>' +
      sheets(o).map(function (x) { var r = x[1]; return '<div class="sheet"><h2>' + esc(x[0]) + '</h2>' + (r.eq ? '<p><b>Equation:</b> ' + esc(r.eq) + '</p>' : '') + (r.src && D.SOURCES[r.src] ? '<p>' + A.bd(D.SOURCES[r.src].badge) + esc(D.SOURCES[r.src].label) + ' &mdash; ' + esc(D.SOURCES[r.src].url) + '</p>' : '') +
        (r.steps && r.steps.length ? '<table><thead><tr><th>Step</th><th>Calculation</th><th>Result</th></tr></thead><tbody>' + r.steps.map(function (s) { return '<tr><td>' + esc(s.label) + '</td><td>' + esc(s.expr) + '</td><td>' + esc(s.value) + ' ' + esc(s.unit) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
        (r.checks && r.checks.length ? '<ul>' + r.checks.map(function (c) { return '<li><b>' + (c.ok ? 'PASS' : 'CHECK') + '</b> ' + esc(c.label) + ' &mdash; ' + esc(c.detail) + '</li>'; }).join('') + '</ul>' : '') + '</div>'; }).join('') +
      '<h2>Inputs</h2><pre>' + esc(JSON.stringify(dd(), function (k, v) { return k === 'snap' ? undefined : v; }, 1)) + '</pre><p class="foot">Sources: ' + ['TXR', 'TXD_S21', 'TXD_506', 'HDM_HYD', 'HDM_INLET', 'HDM_CH7', 'HEC15', 'ISWM', 'AH703'].map(function (k) { return D.SOURCES[k] ? esc(D.SOURCES[k].label) + ' (' + esc(D.SOURCES[k].url) + ')' : ''; }).join('; ') + '</p></div>';
  }
  function calcMd(o) {
    var p = A.cur(), md = ['# Design calculations: ' + p.name, '', '_Screening and design aid for engineer review. Not a sealed design._', ''];
    sheets(o).forEach(function (x) { md.push(DS.sheetMarkdown(x[0], x[1]), ''); });
    var bl = DS.outlineBlocks(o, dd().qt && dd().qt.snap); if (bl.length) { md.push('## Summary', ''); bl.forEach(function (b) { if (b.k === 'p') md.push(b.t, ''); else if (b.k === 'table') { md.push('| ' + b.head.join(' | ') + ' |', '| ' + b.head.map(function () { return '---'; }).join(' | ') + ' |'); b.rows.forEach(function (r) { md.push('| ' + r.join(' | ') + ' |'); }); md.push(''); } else if (b.k === 'kv') { b.rows.forEach(function (r) { md.push('- ' + r[0] + ': ' + r[1]); }); md.push(''); } }); }
    return md.join('\n');
  }

  /* ---------- Design pane ---------- */
  function formFor(s) { return s === 'ro' ? formRO() : s === 'ba' ? formBA() : s === 'fd' ? formFD() : s === 'di' ? formDI() : s === 'dr' ? formDR() : s === 'ru' ? formRU() : s === 'qt' ? formQT() : ''; }
  function renderDesign() {
    loadPrices();
    var h = '<div class="card"><h2>Design calculations</h2><p class="muted small">For the engineer. Every result shows the equation, source and work. TxDOT first, TCEQ permit as the floor; judgment items are tagged Assumed. Screening aid, not a sealed design.</p>' +
      '<div class="chips" role="tablist">' + SUBS.map(function (x) { return '<button type="button" role="tab" data-sub="' + x[0] + '"' + (st.sub === x[0] ? ' class="on" aria-selected="true"' : '') + '>' + esc(x[1]) + '</button>'; }).join('') + '</div></div>';
    if (st.sub === 'su') h += resSU(compute());
    else h += '<div id="dform">' + formFor(st.sub) + '</div><div id="dres">' + results() + '</div>';
    $('#paneDesign').innerHTML = h;
  }
  function refreshResults() { var el = $('#dres'); if (el) el.innerHTML = results(); }

  /* ---------- By situation (recommender) ---------- */
  var TOOLNAME = { fence: 'Fence & dams', dam: 'Fence & dams', basin: 'Basin', ditch: 'Ditch', drain: 'Drains', rusle: 'Erosion', qty: 'Exit & qty' };
  var TOOLSUB = { fence: 'fd', dam: 'fd', basin: 'ba', ditch: 'di', drain: 'dr', rusle: 'ru', qty: 'qt' };
  function situ() { var p = A.cur(); if (!p.situ || typeof p.situ !== 'object') p.situ = {}; if (!p.situ.inputs) p.situ.inputs = {}; if (!p.situ.picked) p.situ.picked = {}; if (!p.situ.id) p.situ.id = 'steep'; return p.situ; }
  function sin(k, label, o) { o = o || {}; return '<label class="f"><span>' + esc(label) + '</span><input type="text" inputmode="decimal" data-si="' + k + '" value="' + esc(situ().inputs[k] || '') + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '></label>'; }
  function ssel(k, label, opts) { var v = situ().inputs[k] || opts[0][0]; return '<label class="f"><span>' + esc(label) + '</span><select data-si="' + k + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; }
  function isPicked(r, id, rank) { var pk = situ().picked, key = r.situation + ':' + id; return pk[key] !== undefined ? !!pk[key] : rank !== 'also'; }
  function sitResults() {
    var s = situ(), r = RC.recommend(s.id, s.inputs);
    if (r.error) return '<div class="card"><p class="muted small">' + esc(r.error) + '</p></div>';
    var selIds = A.M.selectedIds(A.cur().form, A.cur().sel), pickedIds = r.items.filter(function (x) { return isPicked(r, x.id, x.rank); }).map(function (x) { return x.id; });
    var h = '<div class="card"><button type="button" class="btn block" data-act="sitadd">Add ' + pickedIds.length + ' selected to my SWP3 list and takeoff</button><p class="muted small">Ranking weights are this tool\'s judgment (' + A.bd('ASSUMED') + '); each reason below carries its own source. Tap a card to see install and maintenance notes.</p></div>';
    r.items.forEach(function (x) {
      var on = isPicked(r, x.id, x.rank), inList = selIds.indexOf(x.id) >= 0;
      h += '<div class="card rec ' + x.rank + '"><div class="rhead"><label class="chk"><input type="checkbox" data-sp="' + esc(x.id) + '"' + (on ? ' checked' : '') + '><span><b>' + esc(x.name) + '</b></span></label><span class="pill ' + (x.rank === 'primary' ? 'ok' : x.rank === 'alternate' ? 'mid' : '') + '">' + (x.rank === 'primary' ? 'Primary' : x.rank === 'alternate' ? 'Alternate' : 'Also consider') + '</span>' + (inList ? ' <span class="pill info">in my list</span>' : '') + '</div>' +
        '<p class="muted small ref">' + (x.item ? 'Reference: ' + esc(x.item) : '') + '</p>' +
        '<div class="why"><b>Why</b><ul>' + x.why.map(function (w) { return '<li>' + A.bd(w[0]) + esc(w[1]) + '</li>'; }).join('') + '</ul></div>' +
        (x.avoid.length ? '<div class="avoid"><b>Do not use when</b><ul>' + x.avoid.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '') +
        (x.limits.length ? '<div class="lims"><b>Key design limits</b><ul>' + x.limits.map(function (l) { return '<li>' + esc(l.text) + ' <button type="button" class="btn sec sm" data-goto="' + l.tool + '">Open ' + esc(TOOLNAME[l.tool] || 'design') + ' calc</button></li>'; }).join('') + '</ul></div>' : '') +
        ((x.install.length || x.maint.length) ? '<details class="wk"><summary>Install and maintenance notes</summary><ul>' + x.install.concat(x.maint).map(function (w) { return '<li>' + A.bd(w[0]) + esc(w[1]) + '</li>'; }).join('') + '</ul></details>' : '') + '</div>';
    });
    if (r.excluded.length) h += '<div class="card"><h3>Left out for these inputs</h3><ul class="notes">' + r.excluded.map(function (e) { return '<li><b>' + esc(e.name) + '</b>: ' + esc(e.reason) + '</li>'; }).join('') + '</ul></div>';
    if (r.companions.length) h += '<div class="card"><h3>Applies on every site</h3><ul class="notes">' + r.companions.map(function (c) { return '<li><b>' + esc(c.name) + '</b>: ' + esc(c.note) + '</li>'; }).join('') + '</ul></div>';
    return h;
  }
  function situationHtml() {
    var s = situ(), cur = RC.SITUATIONS.filter(function (x) { return x.id === s.id; })[0];
    return '<div class="card"><h2>Pick the situation</h2><p class="muted small">Ranked BMPs for one place on the site: primary plus alternates, with the criterion behind each, when not to use it, and design limits. TxDOT first, then the TCEQ permit, then iSWM, then labeled rule of thumb.</p>' +
      '<label class="f"><span>Situation</span><select data-sitsel="1">' + RC.SITUATIONS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === s.id ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select><small class="help">' + esc(cur ? cur.hint : '') + '</small></label>' +
      '<div class="grid2">' + sin('slope', 'Slope (%)') + sin('len', 'Slope / flow length (ft)') + '</div><div class="grid2">' + sin('area', 'Drainage area (ac)') + sin('Q', 'Flow (cfs)') + '</div><div class="grid2">' + sin('dur', 'Duration (days)') +
      ssel('soil', 'Soil', [['unknown', 'Not sure'], ['sandy', 'Sandy'], ['silty', 'Silty'], ['clayey', 'Clayey']]) + '</div><div class="grid2">' + ssel('recv', 'Receiving water', [['none', 'No water nearby'], ['stream', 'Stream or lake'], ['wetland', 'Wetland'], ['impaired', 'Impaired water / TMDL']]) +
      ssel('season', 'Season', [['growing', 'Growing season'], ['dormant', 'Dormant season']]) + '</div>' + (s.id === 'inlet' ? ssel('inletMode', 'Inlet type', [['sump', 'Sump / low-point grate'], ['ongrade', 'On-grade curb inlet'], ['area', 'Area or ditch inlet']]) : '') +
      '<button type="button" class="btn sec sm block" data-act="sitproj">Fill from the Project tab</button></div><div id="sitres">' + sitResults() + '</div>';
  }
  function goto(tool) { A.ui.tab = 'design'; st.sub = TOOLSUB[tool] || 'ro'; A.render(); window.scrollTo(0, 0); }

  /* ---------- seeds ---------- */
  function seedQty(ids) {
    var o = compute(), d = dd(); if (!d.qt) d.qt = {}; if (!d.qt.q) d.qt.q = {};
    function setIf(k, v) { if (v > 0 && !(num(d.qt.q[k]) > 0)) d.qt.q[k] = String(Math.ceil(v)); }
    (ids || Object.keys(DS.QTY_FOR_BMP)).forEach(function (id) {
      var k = DS.QTY_FOR_BMP[id]; if (!k) return;
      if (k === 'silt_fence' && o.sf) setIf(k, o.sf.Lmin);
      if (k === 'construction_exit' && o.ex) setIf(k, o.ex.SY);
      if (k === 'basin_excavation' && o.dims) setIf(k, o.dims.provided / 27);
      if (k === 'rock_dam' && o.cd && o.cd.count && num(dd().cd && dd().cd.reach)) setIf(k, num(dd().cd.reach));
    });
    A.save();
  }

  /* ---------- events ---------- */
  function setPath(path, val) { var a = path.split('.'); sv(a[0], a[1], val); }
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('#paneDesign')) {
      if (t.hasAttribute('data-d') && t.tagName === 'INPUT') { setPath(t.getAttribute('data-d'), t.value); refreshResults(); }
      else if (t.hasAttribute('data-rn') || t.hasAttribute('data-ra')) { var d = dd(); if (!d.ro) d.ro = {}; var i = Number(t.getAttribute('data-rn') != null ? t.getAttribute('data-rn') : t.getAttribute('data-ra')); if (d.ro.rows && d.ro.rows[i]) { d.ro.rows[i][t.hasAttribute('data-rn') ? 'n' : 'a'] = t.value; A.save(); refreshResults(); } }
      else if (t.hasAttribute('data-qk')) { var q = dd(); if (!q.qt) q.qt = {}; if (!q.qt.q) q.qt.q = {}; q.qt.q[t.getAttribute('data-qk')] = t.value; A.save(); refreshResults(); }
      else if (t.hasAttribute('data-qo')) { var o2 = dd(); if (!o2.qt) o2.qt = {}; if (!o2.qt.over) o2.qt.over = {}; o2.qt.over[t.getAttribute('data-qo')] = t.value; A.save(); refreshResults(); }
    } else if (t.hasAttribute('data-si') && t.tagName === 'INPUT') { situ().inputs[t.getAttribute('data-si')] = t.value; A.save(); var el = $('#sitres'); if (el) el.innerHTML = sitResults(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('#paneDesign')) {
      if (t.hasAttribute('data-d') && t.tagName === 'SELECT') {
        var path = t.getAttribute('data-d'); setPath(path, t.value);
        if (path === 'ro.county') sv('ro', 'zone', '');
        if (path === 'ru.kpick') sv('ru', 'K', t.value);
        renderDesign();
      } else if (t.hasAttribute('data-dc')) { setPath(t.getAttribute('data-dc'), t.checked); refreshResults(); }
      else if (t.hasAttribute('data-fe')) { var d = dd(); if (!d.ru) d.ru = {}; if (!d.ru.fe) d.ru.fe = {}; d.ru.fe[t.getAttribute('data-fe')] = t.value; A.save(); refreshResults(); }
    } else if (t.hasAttribute('data-sitsel')) { situ().id = t.value; A.save(); A.renderBmps(); }
    else if (t.hasAttribute('data-si') && t.tagName === 'SELECT') { situ().inputs[t.getAttribute('data-si')] = t.value; A.save(); var el = $('#sitres'); if (el) el.innerHTML = sitResults(); }
    else if (t.hasAttribute('data-sp')) { var s = situ(); s.picked[s.id + ':' + t.getAttribute('data-sp')] = t.checked; A.save(); var el2 = $('#sitres'); if (el2) { var y = window.scrollY; el2.innerHTML = sitResults(); window.scrollTo(0, y); } }
  });
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var sb = t.closest('[data-sub]'); if (sb && sb.closest('#paneDesign')) { st.sub = sb.getAttribute('data-sub'); renderDesign(); window.scrollTo(0, 0); return; }
    var gt = t.closest('[data-goto]'); if (gt) { goto(gt.getAttribute('data-goto')); return; }
    var fb = t.closest('[data-fill]'); if (fb) { var o = compute(), from = fb.getAttribute('data-from'), v = from === 'q2' ? o.q[2] : from === 'q25' ? o.q[25] : o.q[100]; if (v == null) { A.toast('Complete the Runoff module first.'); return; } setPath(fb.getAttribute('data-fill'), String(Math.round(v * 100) / 100)); renderDesign(); return; }
    var b = t.closest('[data-act]'); if (!b) return; var act = b.getAttribute('data-act'), p = A.cur();
    if (act === 'useproj') { sv('ro', 'A', String(p.form.openAcres || p.form.acres || '')); renderDesign(); }
    else if (act === 'addrow') { var d = dd(); if (!d.ro) d.ro = {}; if (!d.ro.rows) d.ro.rows = []; d.ro.rows.push({ n: '', a: '' }); A.save(); renderDesign(); }
    else if (act === 'delrow') { var d2 = dd(); d2.ro.rows.splice(Number(b.getAttribute('data-i')), 1); A.save(); renderDesign(); }
    else if (act === 'usesel') { var ids = A.M.selectedIds(p.form, p.sel), d3 = dd(); if (!d3.ru) d3.ru = {}; d3.ru.fe = {}; ids.forEach(function (id) { var k = DS.FE_FOR_BMP[id]; if (k) d3.ru.fe[k] = 'low'; }); A.save(); renderDesign(); A.toast('Controls set from your BMP list (low end).'); }
    else if (act === 'seedqty') { seedQty(null); renderDesign(); A.toast('Quantities seeded where design results exist.'); }
    else if (act === 'printcalc') A.printHtml(sheetsHtml(compute()));
    else if (act === 'calcmd') A.download(A.fileName(p, 'md').replace('-swp3.md', '-design.md'), calcMd(compute()), 'text/markdown');
    else if (act === 'calcjson') A.download(A.fileName(p, 'json').replace('-swp3.json', '-design.json'), JSON.stringify({ app: 'SWP3 Builder design', project: p.name, exported: new Date().toISOString(), inputs: dd(), note: 'Screening aid for engineer review; not a sealed design.' }, null, 1), 'application/json');
    else if (act === 'sitproj') {
      var s = situ(), f = p.form, steep = M.num(f.steepest); if (steep) s.inputs.slope = String(Math.round(10000 / steep) / 100); if (f.openAcres) s.inputs.area = String(f.openAcres); s.inputs.recv = (f.act && f.act.surfaceWater) ? 'stream' : 'none'; A.save(); A.renderBmps();
    }
    else if (act === 'sitadd') {
      var s2 = situ(), r = RC.recommend(s2.id, s2.inputs), pick = r.items.filter(function (x) { return isPicked(r, x.id, x.rank); }).map(function (x) { return x.id; });
      if (!pick.length) { A.toast('Select at least one BMP.'); return; }
      p.sel = RC.applyToSelection(p.sel, pick); seedQty(pick); A.save(); A.renderBmps();
      var nq = pick.filter(function (id) { return DS.QTY_FOR_BMP[id]; }).length;
      A.toast('Added ' + pick.length + ' to your SWP3 list' + (nq ? '; ' + nq + ' carried to the takeoff (Design > Exit & qty).' : '.'));
    }
  });

  window.SwpDesignUI = { init: function (app) { A = app; M = app.M; D = app.D; if (app.ui.tab === 'design') renderDesign(); }, renderDesign: renderDesign, situationHtml: situationHtml };
  if (window.SwpApp) window.SwpDesignUI.init(window.SwpApp);
})();
