/* Summary tab: one page, edited in place. PDF stays a secondary action. */
(function () {
  'use strict';
  var A, S = window.SwpSummary, P = window.SwpSummaryPdf;
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var st = { mem: {}, status: {}, warnings: null, busy: false };
  var WSS = '<a href="https://websoilsurvey.nrcs.usda.gov" target="_blank" rel="noopener noreferrer">USDA Web Soil Survey</a>';
  var SEG = '<a href="https://www.tceq.texas.gov/gis/segments-viewer" target="_blank" rel="noopener noreferrer">TCEQ Surface Water Quality Segments Viewer</a>';
  var CGP = '<a href="https://www.tceq.texas.gov/permitting/stormwater/construction" target="_blank" rel="noopener noreferrer">TCEQ construction general permit (TXR150000)</a>';
  var STEERS = '<a href="https://www3.tceq.texas.gov/steers/" target="_blank" rel="noopener noreferrer">TCEQ STEERS</a>';
  var SWP = '<a href="https://www.txdot.gov/business/resources/environmental/stormwater/stormwater-pollution-prevention-plan.html" target="_blank" rel="noopener noreferrer">TxDOT SWP3 guidance</a>';
  var SPEC = '<a href="https://www.txdot.gov/business/resources/txdot-specifications.html" target="_blank" rel="noopener noreferrer">TxDOT specifications</a>';
  var BMP = '<a href="https://www.txdot.gov/business/resources/environmental/stormwater/bmp-resources/sediment-control.html" target="_blank" rel="noopener noreferrer">TxDOT sediment-control pages</a>';
  var HINT = {
    name: 'The name you will recognize in the project list. The official name is on the plan sheets title block. Ask the project engineer if you do not have the plans.',
    't.county': 'County on the plan title block.',
    't.hwy': 'Highway number on the plan title block, such as FM 1960 or IH 10.',
    distArea: 'Acres of soil that will actually be disturbed, including project specific locations such as plants, storage, and disposal that count toward this job. Take the number from the plans. Ask the project engineer if it is not on the sheets. This is the acreage the permit check uses.',
    csj: 'Control-section-job number, usually four digits, two digits, then three (for example 0912-72-345). Copy it from the plan title block or TxDOTCONNECT so it matches the other sheets. Ask the project engineer if the plans are not in hand.',
    't.dist': 'TxDOT district shown on the plan title block, such as HOU. The district or area office can confirm the code.',
    limFrom: 'Where the work starts, from the title sheet or TxDOTCONNECT. If several CSJs are covered, use the furthest start.',
    limTo: 'Where the work ends, from the title sheet or TxDOTCONNECT. If several CSJs are covered, use the furthest end.',
    totalArea: 'Acres of the whole project, disturbed and undisturbed, plus project specific locations. The plans have it. This tool does not guess undisturbed right of way.',
    nature: 'Short description of the work, matching the title sheet or TxDOTCONNECT.',
    soils: 'Predominant soils: name, slope, and where they occur along the job. Look them up in the ' + WSS + ' for an area that matches the project, or copy them from the TxDOT geotechnical report. Ask the project engineer which source the plan set uses.',
    'recv.0.0': 'The creek, bayou, or ditch that receives runoff from the site. Follow it downstream to the first classified segment. Use the ' + SEG + '. Ask district environmental staff if you cannot find the flow path.',
    'recv.0.1': 'TCEQ classified segment, a four-digit number such as 1009. A number with a letter is unclassified. Confirm it in the ' + SEG + ', or ask district environmental staff.',
    ms4: 'The city or county storm-sewer system that receives this site\'s runoff. If none does, write that. Questions go to the District MS4 Coordinator. This line is only on the 1-acre-or-more sheet.',
    'buf.why': 'If a creek or pond is on or next to the right of way, note the vegetated buffer and the stations. If there is no surface water, the usual statement is that no buffer is planned. The project engineer decides when a buffer will not work and what replaces it.',
    'x.preparer': 'Who prepared this summary, name and firm. It stays on this device with the project.',
    'x.prepared': 'The date this summary was prepared.',
    'x.contact': 'Who to call: the project engineer or TxDOT area office, the contractor, and district environmental staff or the MS4 coordinator.',
    bLat: 'Latitude of the beginning of the job, in decimal degrees. TxDOTCONNECT or the title sheet is the source. It should cover the whole area of the authorization.',
    bLon: 'Longitude of the beginning of the job, in decimal degrees. The sheet often labels it W. Type it the way the plans show it.',
    eLat: 'Latitude of the end of the job, in decimal degrees. It should cover the whole area of the authorization, from TxDOTCONNECT or the title sheet.',
    eLon: 'Longitude of the end of the job, in decimal degrees. Type it the way the plans show it.',
    't.proj': 'Project number printed in the plan title block. Copy it from the other sheets. This is separate from the CSJ.',
    'nf.other': 'Why a sediment basin will not fit. The permit expects that reason written down. The project engineer makes that call.',
    noi: 'Notice of Intent to TCEQ. The status line on this card follows the permit check already in this tool. File an NOI through ' + STEERS + ' under the ' + CGP + '. TxDOT guidance clears this line when that check is not large construction. District environmental staff or the project engineer confirms who files it.'
  };

  function sm() {
    var p = A.cur();
    if (!p.summary || typeof p.summary !== 'object') p.summary = { variant: '', v: {} };
    if (!p.summary.v || typeof p.summary.v !== 'object') p.summary.v = {};
    return p.summary;
  }
  function setV(id, v) { sm().v[id] = v; A.save(); }
  function vals() { return S.values(A.cur()).val; }
  function hid(id) { return 'h-' + String(id).replace(/[^A-Za-z0-9]+/g, '-'); }

  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var r = indexedDB.open('swp3-builder', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('pdf'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('pdf', mode), q = fn(tx.objectStore('pdf'));
        tx.oncomplete = function () { res(q && q.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function getOfficial(v) {
    var info = S.SHEETS[v];
    if (st.mem[v]) return Promise.resolve(st.mem[v]);
    return idbDo('readonly', function (s) { return s.get(info.file); }).catch(function () { return null; }).then(function (rec) {
      if (rec && rec.bytes) { st.mem[v] = { bytes: rec.bytes, sha: rec.sha, ok: rec.sha === info.sha256, from: 'saved on this device' }; return st.mem[v]; }
      return null;
    });
  }
  function useFile(v, file) {
    var info = S.SHEETS[v], other = S.SHEETS[v === 'A' ? 'B' : 'A'];
    return file.arrayBuffer().then(function (buf) {
      return P.sha256(buf).then(function (h) {
        if (h === other.sha256) { A.toast('That file is the other summary sheet. Load it on the matching version.'); return; }
        if (h !== info.sha256 && !window.confirm('This file is not the 2023 TxDOT sheet this tool was measured against, so text may land in the wrong place. Use it anyway?')) return;
        st.mem[v] = { bytes: buf, sha: h, ok: h === info.sha256, from: 'file you loaded' };
        idbDo('readwrite', function (s) { return s.put({ bytes: buf, sha: h, saved: new Date().toISOString() }, info.file); }).catch(function () {});
        A.toast(h === info.sha256 ? 'Official sheet saved on this device.' : 'Loaded, but it does not match the expected file.');
        render();
      });
    });
  }

  function soilsText(v) {
    var lines = [], i, a, b;
    for (i = 0; i < 8; i++) {
      a = S.textOf(v, 'soils.' + i + '.0'); b = S.textOf(v, 'soils.' + i + '.1');
      if (a || b) lines.push(b ? a + ' — ' + b : a);
    }
    return lines.join('\n');
  }
  function writeSoils(text) {
    var lines = String(text || '').split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8), i, parts;
    for (i = 0; i < 8; i++) {
      parts = (lines[i] || '').split(/\s+—\s+/);
      setV('soils.' + i + '.0', parts[0] || '');
      setV('soils.' + i + '.1', parts.slice(1).join(' — '));
    }
    A.cur().form.soils = lines.join('; ');
    A.save();
  }
  function writeMs4(text) {
    var lines = String(text || '').split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6), i;
    for (i = 0; i < 6; i++) setV('ms4.' + i + '.0', lines[i] || '');
    A.cur().form.ms4 = lines.join('\n');
    A.save();
  }

  function hintBtn(id, label) {
    if (!HINT[id]) return '';
    var h = hid(id);
    return '<button type="button" class="ihint" aria-expanded="false" aria-controls="' + h + '" aria-label="What ' + esc(label) + ' is and where to find it">i</button>';
  }
  function hintText(id) {
    if (!HINT[id]) return '';
    return '<p id="' + hid(id) + '" class="hinttext" hidden>' + HINT[id] + '</p>';
  }
  function control(id, value, area, decimal, empty) {
    var fid = 'f-' + hid(id);
    if (area) return '<textarea id="' + fid + '" data-sv="' + esc(id) + '" data-empty="' + (empty ? '1' : '0') + '" rows="3" autocomplete="off">' + esc(value || '') + '</textarea>';
    return '<input id="' + fid + '" type="text" data-sv="' + esc(id) + '" data-empty="' + (empty ? '1' : '0') + '" value="' + esc(value || '') + '" autocomplete="off"' + (decimal ? ' inputmode="decimal"' : '') + '>';
  }
  function fieldBlock(f) {
    var fid = 'f-' + hid(f.id);
    return '<div class="f"><div class="flab"><label for="' + fid + '">' + esc(f.label) + '</label>' + hintBtn(f.id, f.label) + '</div>' +
      control(f.id, f.value, f.area, f.decimal, f.empty) + hintText(f.id) + '</div>';
  }
  function glanceField(id, label, value, decimal) {
    var empty = !String(value || '').trim();
    var fid = 'f-' + hid(id);
    return '<div class="f"><div class="flab"><label for="' + fid + '">' + esc(label) + '</label>' + hintBtn(id, label) + '</div>' +
      control(id, value, false, decimal, empty) + hintText(id) + '</div>';
  }

  function checklistHtml(view, v) {
    var labels = {}, h = '';
    S.EDIT_GROUPS.forEach(function (g) { g.items.forEach(function (it) { labels[it.label] = 1; }); });
    h += '<section class="card controls"><h2>Controls</h2><p class="lede">Tap Temporary or Permanent to mark it on the sheet. The name opens that control in Design.</p>';
    S.EDIT_GROUPS.forEach(function (g) {
      h += '<h3>' + esc(g.title) + '</h3>';
      g.items.forEach(function (item) {
        var name = item.guide
          ? '<a class="cn" href="#design/' + esc(item.guide) + '"><span>' + esc(item.label) + '</span><span class="golink">Design</span></a>'
          : '<span class="cn">' + esc(item.label) + '</span>';
        if (item.mode === 'on') {
          var on = (item.on || []).some(function (k) { return v[k] === true; });
          h += '<div class="crow">' + name + '<button type="button" data-on="' + esc(item.id) + '"' + pressed(on) + '>On this job</button></div>';
          return;
        }
        var t = (item.keys || []).some(function (k) { return v[k + '.T'] === true; });
        var perm = (item.keys || []).some(function (k) { return v[k + '.P'] === true; });
        h += '<div class="crow">' + name +
          '<button type="button" data-tp="' + esc(item.id) + '" data-side="T"' + pressed(t) + '>Temporary</button>' +
          '<button type="button" data-tp="' + esc(item.id) + '" data-side="P"' + pressed(perm) + '>Permanent</button></div>';
        if (item.id === 'basin' && view.variant === 'B') h += basinHtml(view, v);
      });
    });
    var house = (view.housekeeping || []).filter(function (label) { return !labels[label]; });
    if (house.length) h += '<p class="lede">Also on the sheet: ' + esc(house.join(', ')) + '.</p>';
    h += '</section>';
    return h;
  }
  function pressed(on) { return on ? ' aria-pressed="true" class="chip on"' : ' aria-pressed="false" class="chip"'; }
  function basinHtml(view, v) {
    var bstate = v['basin.nf'] === true ? 'nf' : v['basin.req'] === true ? 'req' : v['basin.notreq'] === true ? 'not' : '';
    var h = '<div class="basinbox"><p id="basinLine" class="basin">' + esc(view.basin.text) + '</p><div class="radios">';
    [['', 'Not marked'], ['not', 'Not required'], ['req', 'Required and used'], ['nf', 'Required, will not fit']].forEach(function (o) {
      h += '<label class="chk"><input type="radio" name="basin" data-basin="' + o[0] + '"' + (bstate === o[0] ? ' checked' : '') + '><span>' + esc(o[1]) + '</span></label>';
    });
    h += '</div>';
    if (bstate === 'nf' || S.textOf(v, 'nf.other')) {
      h += '<div class="f"><div class="flab"><label for="f-' + hid('nf.other') + '">Why it will not fit</label>' + hintBtn('nf.other', 'Why it will not fit') + '</div>' +
        control('nf.other', S.textOf(v, 'nf.other'), true, false, !S.textOf(v, 'nf.other')) + hintText('nf.other') + '</div>';
    }
    h += '</div>';
    return h;
  }

  function pageHtml(view) {
    var v = vals(), p = A.cur(), fields = view.fields || [], filled = [], empty = [], h = '';
    fields.forEach(function (f) { (f.empty ? empty : filled).push(f); });
    h += '<div class="sumpage" data-variant="' + esc(view.variant) + '">';
    h += '<section class="card glance" aria-label="Project at a glance"><p class="kicker" id="sumKicker">' + esc(view.sheetLabel) + '</p>';
    h += glanceField('name', 'Project name', p.name, false);
    h += '<div class="gplace">' + glanceField('t.county', 'County', v['t.county'], false) + glanceField('t.hwy', 'Highway', v['t.hwy'], false) + '</div>';
    h += glanceField('distArea', 'Acres disturbed', v.distArea, true);
    h += '<p class="sumstatus" id="sumStatus" aria-live="polite">' + esc(view.status.line) + '</p>';
    h += '<div id="sumWarns"' + (view.warnings.length ? '' : ' hidden') + '>' + warnBox(view) + '</div>';
    h += '<div class="seg" role="group" aria-label="Which sheet">';
    [['', 'Match acres'], ['B', '1 acre or more'], ['A', 'Under 1 acre']].forEach(function (x) {
      h += '<button type="button" data-var="' + x[0] + '"' + ((sm().variant || '') === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>';
    });
    h += '</div>';
    if (view.variant === 'B') {
      h += '<label class="chk"><input type="checkbox" data-noi="1"' + (view.people.noi ? ' checked' : '') + '><span>NOI on this summary</span></label>';
      h += hintBtn('noi', 'NOI') + hintText('noi');
    }
    h += '</section>';

    h += '<details class="card more start" id="sumStart"><summary>What you need before you start</summary><div class="secbody"><ul class="startlist">' +
      '<li>Plan title block or TxDOTCONNECT: project name, CSJ, highway, county, district, from and to limits, and project number.</li>' +
      '<li>Disturbed acres and total project acres, including project specific locations. The plans have them. Ask the project engineer if you do not have the sheets.</li>' +
      '<li>Soils from the ' + WSS + ', or from the TxDOT geotechnical report.</li>' +
      '<li>Receiving water and the classified segment from the ' + SEG + '. Ask district environmental staff about impairments.</li>' +
      '<li>MS4 operator from the District MS4 Coordinator, or from the city or county.</li>' +
      '<li>Permit path: the ' + CGP + '. When an NOI applies, it is filed in ' + STEERS + '.</li>' +
      '<li>Controls from the plan set and the ' + SWP + '. Practices are also described on the ' + BMP + '. Build from the current EC sheet in the plan set, and from the ' + SPEC + '. Ask the project engineer which sheet revision this job uses.</li>' +
      '</ul></div></details>';

    if (filled.length) {
      h += '<section class="card fields" id="sumFilled"><h2>On this summary</h2>' + filled.map(fieldBlock).join('') + '</section>';
    }
    if (empty.length) {
      h += '<details class="card more todo" id="sumTodo"><summary>Still to fill in (' + empty.length + ')</summary><div class="secbody">' +
        empty.map(fieldBlock).join('') + '</div></details>';
    }

    h += checklistHtml(view, v);
    h += '<section class="card people"><h2>Who does what</h2>' + view.people.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</section>';

    h += '<section class="card remind"><h2>While the job is open</h2>' + view.reminders.map(function (r, i) {
      return '<h3>' + esc(r.title) + '</h3><p class="short">' + esc(r.short || r.text) + '</p>' +
        '<details class="why" id="why-' + i + '"><summary>Why?</summary><p>' + esc(r.text) + '</p></details>';
    }).join('') + '</section>';

    h += '<div class="actions"><button type="button" class="btn block" data-copy="1">Copy summary</button>' +
      exportHtml(view) +
      '<button type="button" class="btn sec block" data-reset="1">Clear my edits and use the saved project fields</button></div>';
    h += '</div>';
    return h;
  }
  function warnBox(view) {
    if (!view.warnings.length) return '';
    return '<div class="warnbox"><b>Look at this</b><ul>' + view.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';
  }

  function exportHtml(view) {
    var v = S.variantFor(A.cur()), info = S.SHEETS[v];
    return '<details class="card export" id="sumExport"><summary>Download a PDF</summary><div class="secbody">' +
      '<p class="lede">Optional. Copy summary is the text to paste into an email. A PDF is for the plan set. Nothing is uploaded.</p>' +
      '<p class="pdfstatus">' + pdfStatus(v) + '</p>' +
      '<p class="lede">The filled PDF is drawn on the official TxDOT sheet (' + esc(info.title) + '). The first time, download that sheet from TxDOT and choose the file here. It stays on this device.</p>' +
      '<p><a href="' + esc(info.url) + '" target="_blank" rel="noopener noreferrer">Download the ' + esc(info.label) + ' sheet from TxDOT</a></p>' +
      '<label class="btn sec block filebtn">Choose the TxDOT PDF<input type="file" accept="application/pdf,.pdf" data-pdf="' + esc(v) + '" class="sr"></label>' +
      '<div class="row"><button type="button" class="btn" data-exp="pdf">Filled official PDF</button><button type="button" class="btn sec" data-exp="overlay">Values-only PDF</button></div>' +
      '<div class="row"><button type="button" class="btn sec" data-exp="print">Print this summary</button></div>' +
      '<div id="sumWarn" role="status">' + warnHtml() + '</div>' +
      '<p class="small muted">A PE reviews the sheet and seals it where the note requires a seal. This app cannot seal.</p>' +
      '</div></details>';
  }
  function pdfStatus(v) {
    var m = st.mem[v];
    if (m) return '<span class="pill ' + (m.ok ? 'ok' : 'bad') + '">' + (m.ok ? 'Sheet ready' : 'Not the expected file') + '</span>';
    return '<span class="pill mid">Official PDF not on this device yet</span>';
  }
  function warnHtml() {
    var w = st.warnings;
    if (!w) return '';
    if (!w.length) return '<p class="pill ok">Exported with no text cut off.</p>';
    return '<ul class="checks">' + w.map(function (x) { return '<li><span class="pill bad">Cut off</span> ' + esc(x.id) + ': ' + esc(x.msg) + '</li>'; }).join('') + '</ul>';
  }

  function render() {
    if (!A) return;
    var pane = document.getElementById('paneSummary');
    if (!pane || A.ui.tab !== 'summary') return;
    var view = S.screenView(A.cur());
    pane.innerHTML = pageHtml(view);
    pane.setAttribute('data-variant', view.variant);
    if (!st.status[S.variantFor(A.cur())]) refreshStatus();
  }
  function captureUi() {
    var open = {}, hints = {}, y = window.scrollY;
    document.querySelectorAll('#paneSummary details[id]').forEach(function (d) { open[d.id] = d.open; });
    document.querySelectorAll('#paneSummary .ihint[aria-expanded="true"]').forEach(function (b) { hints[b.getAttribute('aria-controls')] = true; });
    return { open: open, hints: hints, y: y };
  }
  function restoreUi(ui) {
    if (!ui) return;
    Object.keys(ui.open).forEach(function (id) { var d = document.getElementById(id); if (d) d.open = ui.open[id]; });
    Object.keys(ui.hints).forEach(function (id) {
      var t = document.getElementById(id);
      if (t) t.hidden = false;
      var b = document.querySelector('#paneSummary [aria-controls="' + id + '"]');
      if (b) b.setAttribute('aria-expanded', 'true');
    });
    window.scrollTo(0, ui.y);
  }
  function renderKeep(focusId, selStart, selEnd) {
    var ui = captureUi();
    render();
    restoreUi(ui);
    if (!focusId) return;
    var again = findSv(focusId);
    if (!again) return;
    again.focus();
    if (selStart != null && again.setSelectionRange) {
      try { again.setSelectionRange(selStart, selEnd); } catch (e) {}
    }
  }
  function findSv(id) {
    var nodes = document.querySelectorAll('#paneSummary [data-sv]'), i;
    for (i = 0; i < nodes.length; i++) if (nodes[i].getAttribute('data-sv') === id) return nodes[i];
    return null;
  }
  function paintStatus() {
    var view = S.screenView(A.cur());
    var status = document.getElementById('sumStatus');
    if (status) status.textContent = view.status.line;
    var kicker = document.getElementById('sumKicker');
    if (kicker) kicker.textContent = view.sheetLabel;
    var box = document.getElementById('sumWarns');
    if (box) { box.innerHTML = warnBox(view); box.hidden = !view.warnings.length; }
    var basin = document.getElementById('basinLine');
    if (basin) basin.textContent = view.basin.text;
    var noi = document.querySelector('#paneSummary [data-noi]');
    if (noi && document.activeElement !== noi) noi.checked = !!view.people.noi;
    var pane = document.getElementById('paneSummary');
    if (pane) pane.setAttribute('data-variant', view.variant);
  }
  function refreshStatus() {
    var v = S.variantFor(A.cur());
    st.status[v] = true;
    getOfficial(v).then(function () {
      var host = document.querySelector('#paneSummary .pdfstatus');
      if (host && A.ui.tab === 'summary') host.innerHTML = pdfStatus(S.variantFor(A.cur()));
    });
  }

  function onInput(e) {
    var t = e.target;
    if (!t.closest || !t.closest('#paneSummary')) return;
    var id = t.getAttribute && t.getAttribute('data-sv');
    if (!id) return;
    var p = A.cur(), val = t.value, wasEmpty = t.getAttribute('data-empty') === '1';
    if (id === 'name') {
      p.name = val || 'Untitled';
      A.save();
      var sel = document.getElementById('projSel');
      if (sel) Array.prototype.forEach.call(sel.options, function (o) { if (o.value === p.id) o.textContent = p.name; });
      afterEdit(id, wasEmpty, val);
      return;
    }
    if (id === 'soils') { writeSoils(val); afterEdit(id, wasEmpty, val); return; }
    if (id === 'ms4') { writeMs4(val); afterEdit(id, wasEmpty, val); return; }
    if (id === 'csj') { setV('csj', val); p.form.csj = val; A.save(); afterEdit(id, wasEmpty, val); return; }
    if (id === 't.hwy') { setV('t.hwy', val); p.form.highway = val; A.save(); afterEdit(id, wasEmpty, val); return; }
    if (id === 't.county') { setV('t.county', val); p.form.county = val; A.save(); afterEdit(id, wasEmpty, val); return; }
    if (id === 'distArea') { setV('distArea', val); p.form.acres = val; p.form.supportAcres = ''; A.save(); afterEdit(id, wasEmpty, val); return; }
    if (id === 'nature') { setV('nature', val); p.form.nature = val; A.save(); afterEdit(id, wasEmpty, val); return; }
    if (id === 'recv.0.0') { setV('recv.0.0', val); p.form.receiving = val; A.save(); afterEdit(id, wasEmpty, val); return; }
    if (id === 'recv.0.1') { setV('recv.0.1', val); p.form.segment = val; A.save(); afterEdit(id, wasEmpty, val); return; }
    if (id === 'buf.why') { setV('buf.why', val); setV('buf.text', !!String(val).trim()); afterEdit(id, wasEmpty, val); return; }
    if (id === 'limFrom' || id === 'limTo') {
      setV(id, val);
      var lim = vals();
      p.form.limits = 'From: ' + (id === 'limFrom' ? val : S.textOf(lim, 'limFrom')) + ' to ' + (id === 'limTo' ? val : S.textOf(lim, 'limTo'));
      A.save();
      afterEdit(id, wasEmpty, val);
      return;
    }
    if (id === 'bLat' || id === 'bLon' || id === 'eLat' || id === 'eLon') {
      setV(id, val);
      var vv = vals();
      p.form.coordsBegin = [S.textOf(vv, 'bLat'), S.textOf(vv, 'bLon')].filter(Boolean).join(', ');
      p.form.coordsEnd = [S.textOf(vv, 'eLat'), S.textOf(vv, 'eLon')].filter(Boolean).join(', ');
      A.save();
      afterEdit(id, wasEmpty, val);
      return;
    }
    setV(id, val);
    afterEdit(id, wasEmpty, val);
  }
  function afterEdit(id, wasEmpty, val) {
    var pane = document.getElementById('paneSummary');
    var variantChanged = pane && S.variantFor(A.cur()) !== pane.getAttribute('data-variant');
    var nowEmpty = !String(val || '').trim();
    var moved = wasEmpty !== nowEmpty && id !== 'name' && id !== 't.county' && id !== 't.hwy' && id !== 'distArea';
    var node = findSv(id);
    if (variantChanged || moved) renderKeep(id, node && node.selectionStart, node && node.selectionEnd);
    else {
      var node = findSv(id);
      if (node) node.setAttribute('data-empty', nowEmpty ? '1' : '0');
      paintStatus();
    }
  }
  function itemById(id) {
    var found = null;
    S.EDIT_GROUPS.forEach(function (g) { g.items.forEach(function (it) { if (it.id === id) found = it; }); });
    return found;
  }
  function setSide(item, side, on) {
    (item.keys || []).forEach(function (k) { setV(k + '.' + side, on); });
    var v = vals();
    var any = (item.keys || []).some(function (k) { return v[k + '.T'] === true || v[k + '.P'] === true; });
    (item.link || []).forEach(function (k) { setV(k, any); });
  }
  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !b.closest('#paneSummary')) return;
    if (b.classList.contains('ihint')) {
      var open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      var panel = document.getElementById(b.getAttribute('aria-controls'));
      if (panel) panel.hidden = open;
      return;
    }
    if (b.hasAttribute('data-copy')) { copySummary(); return; }
    if (b.hasAttribute('data-var')) { sm().variant = b.getAttribute('data-var'); A.save(); renderKeep(); return; }
    if (b.hasAttribute('data-tp')) {
      var item = itemById(b.getAttribute('data-tp'));
      if (!item) return;
      setSide(item, b.getAttribute('data-side'), b.getAttribute('aria-pressed') !== 'true');
      renderKeep();
      return;
    }
    if (b.hasAttribute('data-on')) {
      var it = itemById(b.getAttribute('data-on'));
      var next = b.getAttribute('aria-pressed') !== 'true';
      (it.on || []).forEach(function (k) { setV(k, next); });
      renderKeep();
      return;
    }
    if (b.hasAttribute('data-reset')) {
      if (window.confirm('Clear the edits you typed on this summary and go back to the saved project fields?')) { sm().v = {}; A.save(); render(); A.toast('Edits cleared.'); }
      return;
    }
    var exp = b.getAttribute('data-exp');
    if (exp === 'pdf') doPdf(false);
    else if (exp === 'overlay') doPdf(true);
    else if (exp === 'print') A.printHtml(printModel(A.cur()));
  }
  function onChange(e) {
    var t = e.target;
    if (!t.closest || !t.closest('#paneSummary')) return;
    if (t.hasAttribute('data-basin')) {
      var which = t.getAttribute('data-basin');
      setV('basin.notreq', which === 'not');
      setV('basin.req', which === 'req');
      setV('basin.nf', which === 'nf');
      if (which === 'req') setV('basin.T', true);
      renderKeep();
      return;
    }
    if (t.hasAttribute('data-noi')) {
      setV('rt.noi', t.checked);
      setV('rc.noi', t.checked);
      renderKeep();
      return;
    }
    if (t.hasAttribute('data-pdf') && t.files && t.files[0]) {
      useFile(t.getAttribute('data-pdf'), t.files[0]).catch(function () { A.toast('Could not read that file.'); });
      t.value = '';
    }
  }
  function copySummary() {
    var text = S.plainSummary(A.cur());
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { A.toast('Summary copied.'); }, function () { fallbackCopy(text); });
      return;
    }
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); A.toast('Summary copied.'); }
    catch (err) { A.toast('Could not copy from this browser.'); }
    document.body.removeChild(ta);
  }

  function stamp(p) { return (p.name || 'swp3').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }
  function doPdf(overlay) {
    var p = A.cur(), pl = S.plan(p), PL = window.PDFLib;
    if (!PL) { A.toast('The PDF library did not load.'); return; }
    if (st.busy) return;
    st.busy = true;
    var go = overlay ? Promise.resolve({ bytes: null }) : getOfficial(pl.variant);
    go.then(function (m) {
      if (!overlay && !m) {
        st.busy = false;
        var d = document.getElementById('sumExport');
        if (d) d.open = true;
        A.toast('Load the official TxDOT PDF first. The link is under Download a PDF.');
        return;
      }
      return P.build(PL, overlay ? null : m.bytes, pl).then(function (r) {
        st.busy = false;
        st.warnings = r.warnings;
        var w = document.getElementById('sumWarn'); if (w) w.innerHTML = warnHtml();
        A.download('swp3-summary-' + pl.variant + (overlay ? '-values-' : '-') + stamp(p) + '.pdf', r.bytes, 'application/pdf');
        A.toast(r.warnings.length ? 'PDF saved. Some text was cut off.' : 'PDF saved.');
      });
    }).catch(function () { st.busy = false; A.toast('Could not make the PDF.'); });
  }
  function printModel(p) {
    var view = S.screenView(p);
    function line(label, value) { return '<tr><th>' + esc(label) + '</th><td>' + esc(value || '—') + '</td></tr>'; }
    var h = '<h1>' + esc(view.name) + '</h1><p>' + esc(view.status.line) + '</p><p>' + esc(view.sheetLabel) + '. ' + esc(view.disclaimer) + '</p>';
    h += '<h2>Project</h2><table>' + line('CSJ', view.project.csj) + line('Highway', view.project.highway) + line('County', view.project.county) + line('From', view.project.from) + line('To', view.project.to) + line('Disturbed acres', view.site.disturbed) + '</table>';
    h += '<h2>The site</h2><table>' + line('Work', view.site.nature) + line('Soils', view.site.soils.join('; ')) + line('Receiving water', view.site.receiving) + '</table>';
    h += '<h2>Controls</h2><ul>' + (view.controls.length ? view.controls.map(function (c) { return '<li>' + esc(c.label) + ' — ' + esc(c.use) + '</li>'; }).join('') : '<li>None marked</li>') + '</ul>';
    h += '<p>' + esc(view.basin.text) + '</p><h2>Who does what</h2>' + view.people.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    view.reminders.forEach(function (r) { h += '<h2>' + esc(r.title) + '</h2><p>' + esc(r.short || r.text) + '</p>'; });
    return h;
  }

  function init(app) {
    if (A) return;
    A = app;
    var pane = document.getElementById('paneSummary');
    pane.addEventListener('input', onInput);
    pane.addEventListener('change', onChange);
    pane.addEventListener('click', onClick);
    if (A.ui.tab === 'summary') render();
  }
  window.SwpSummaryUI = { init: init, render: render };
  if (window.SwpApp) window.SwpSummaryUI.init(window.SwpApp);
})();
