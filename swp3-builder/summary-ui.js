/* Summary tab: a short page you can read, with edit underneath, and PDF as a secondary action. */
(function () {
  'use strict';
  var A, S = window.SwpSummary, P = window.SwpSummaryPdf;
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var st = { edit: false, mem: {}, status: {}, warnings: null, busy: false };
  var EXCL = [['basin.notreq', 'basin.req', 'basin.nf']];

  function sm() {
    var p = A.cur();
    if (!p.summary || typeof p.summary !== 'object') p.summary = { variant: '', v: {} };
    if (!p.summary.v || typeof p.summary.v !== 'object') p.summary.v = {};
    return p.summary;
  }
  function setV(id, v) { sm().v[id] = v; A.save(); }
  function vals() { return S.values(A.cur()).val; }

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

  function blank(v) { return v ? esc(v) : '<span class="empty">Not entered yet</span>'; }
  function row(label, value) { return '<div><dt>' + esc(label) + '</dt><dd>' + blank(value) + '</dd></div>'; }
  function field(label, id, value, opts) {
    opts = opts || {};
    var tag = opts.area
      ? '<textarea data-sv="' + esc(id) + '" rows="3">' + esc(value || '') + '</textarea>'
      : '<input type="text" data-sv="' + esc(id) + '" value="' + esc(value || '') + '"' + (opts.decimal ? ' inputmode="decimal"' : '') + '>';
    return '<label class="f"><span>' + esc(label) + '</span>' + tag + '</label>';
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

  function readHtml(view) {
    var p = view.project, site = view.site, h = '';
    h += '<div class="card readhead"><p class="kicker">' + esc(view.sheetLabel) + '</p><h2>' + esc(view.name) + '</h2><p class="lede">This is the summary, on the screen. You do not need a PDF to read it. The official TxDOT sheet is still what goes in the plans.</p></div>';
    if (view.warnings.length) h += '<div class="warnbox"><b>Look at this</b><ul>' + view.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';
    h += '<section class="card"><h2>Project</h2><dl class="kv">' +
      row('CSJ', p.csj) + row('Highway', p.highway) + row('County', p.county) + row('District', p.district) +
      row('From', p.from) + row('To', p.to) +
      (p.begin || p.end ? row('Begin', p.begin) + row('End', p.end) : '') +
      (p.projectNo ? row('Project number', p.projectNo) : '') +
      '</dl></section>';
    h += '<section class="card"><h2>The site</h2><dl class="kv">' +
      row('Acres disturbed', site.disturbed) + row('Total project acres', site.total) +
      row('What is being built', site.nature) +
      row('Soils', site.soils.join('\n')) +
      row('Receiving water', site.receiving) + row('Classified segment', site.segment) +
      (view.variant === 'B' ? row('MS4', site.ms4.join('\n')) : '') +
      (site.buffer ? row('Buffer', site.buffer) : '') +
      '</dl></section>';
    h += '<section class="card sum-wide"><h2>Controls</h2>';
    if (view.starter) h += '<p class="lede">A new project starts with silt fence and seeding marked, because those are the usual minimum. Turn off anything this job will not use.</p>';
    if (!view.controls.length) h += '<p class="empty">No controls marked yet.</p>';
    else h += '<ul class="clist">' + view.controls.map(function (c) {
      return '<li><span>' + esc(c.label) + '</span><span class="use">' + esc(c.use) + '</span></li>';
    }).join('') + '</ul>';
    h += '<p class="basin">' + esc(view.basin.text) + '</p>';
    if (view.housekeeping.length) h += '<p class="lede">Also marked for housekeeping: ' + esc(view.housekeeping.join(', ')) + '.</p>';
    h += '</section>';
    h += '<section class="card"><h2>Who does what</h2>' + view.people.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') +
      '<dl class="kv">' + row('Prepared by', view.people.preparer) + row('Date', view.people.prepared) + row('Contacts', view.people.contacts) + '</dl></section>';
    h += '<section class="card"><h2>While the job is open</h2>' + view.reminders.map(function (r) {
      return '<h3>' + esc(r.title) + '</h3><p>' + esc(r.text) + '</p>';
    }).join('') + '</section>';
    h += '<button type="button" class="btn block" data-edit="1">Edit this summary</button>';
    h += exportHtml(view);
    return h;
  }

  function pressed(on) { return on ? ' aria-pressed="true" class="chip on"' : ' aria-pressed="false" class="chip"'; }
  function editHtml(view) {
    var v = vals(), p = A.cur(), f = p.form, h = '';
    h += '<div class="card sum-wide"><h2>Edit summary</h2><p class="lede">Short labels for the same TxDOT summary sheet. What you type is saved on this device and shows up in the reading view.</p>' +
      '<div class="seg" role="group" aria-label="Which sheet">' +
      [['', 'Match the acres'], ['B', '1 acre or more'], ['A', 'Under 1 acre']].map(function (x) {
        return '<button type="button" data-var="' + x[0] + '"' + ((sm().variant || '') === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>';
      }).join('') + '</div></div>';
    h += '<section class="card"><h2>Project</h2>' +
      field('Project name', 'name', p.name) +
      field('CSJ', 'csj', v.csj) +
      field('Highway', 't.hwy', v['t.hwy']) +
      field('County', 't.county', v['t.county']) +
      field('District', 't.dist', v['t.dist']) +
      field('From', 'limFrom', v.limFrom) +
      field('To', 'limTo', v.limTo) +
      '</section>';
    h += '<section class="card"><h2>The site</h2>' +
      field('Acres disturbed, including staging', 'distArea', v.distArea, { decimal: true }) +
      field('Total project acres', 'totalArea', v.totalArea, { decimal: true }) +
      field('What is being built', 'nature', v.nature, { area: true }) +
      '<label class="f"><span>Soils, one per line</span><textarea data-sv="soils" rows="3">' + esc(soilsText(v)) + '</textarea></label>' +
      field('Receiving water', 'recv.0.0', v['recv.0.0']) +
      field('Classified segment', 'recv.0.1', v['recv.0.1']) +
      (view.variant === 'B' ? '<label class="f"><span>MS4 operator, one per line</span><textarea data-sv="ms4" rows="2">' + esc((view.site.ms4 || []).join('\n')) + '</textarea></label>' : '') +
      '</section>';
    h += '<section class="card sum-wide"><h2>Controls</h2><p class="lede">Temporary means during construction. Permanent means it stays. Street sweeping is just on or off.</p>';
    S.EDIT_GROUPS.forEach(function (g) {
      h += '<h3>' + esc(g.title) + '</h3>';
      g.items.forEach(function (item) {
        if (item.mode === 'on') {
          var on = (item.on || []).some(function (k) { return v[k] === true; });
          h += '<div class="crow"><span class="cn">' + esc(item.label) + '</span><button type="button" data-on="' + esc(item.id) + '"' + pressed(on) + '>On this job</button></div>';
          return;
        }
        var t = (item.keys || []).some(function (k) { return v[k + '.T'] === true; });
        var perm = (item.keys || []).some(function (k) { return v[k + '.P'] === true; });
        h += '<div class="crow"><span class="cn">' + esc(item.label) + '</span>' +
          '<button type="button" data-tp="' + esc(item.id) + '" data-side="T"' + pressed(t) + '>Temporary</button>' +
          '<button type="button" data-tp="' + esc(item.id) + '" data-side="P"' + pressed(perm) + '>Permanent</button></div>';
      });
    });
    if (view.variant === 'B') {
      var bstate = v['basin.nf'] === true ? 'nf' : v['basin.req'] === true ? 'req' : v['basin.notreq'] === true ? 'not' : '';
      h += '<h3>Is a sediment basin required?</h3><div class="radios">';
      [['', 'Not marked'], ['not', 'Not required'], ['req', 'Required and used'], ['nf', 'Required, but it will not fit']].forEach(function (o) {
        h += '<label class="chk"><input type="radio" name="basin" data-basin="' + o[0] + '"' + (bstate === o[0] ? ' checked' : '') + '><span>' + esc(o[1]) + '</span></label>';
      });
      h += '</div>' + field('If it will not fit, why', 'nf.other', v['nf.other'], { area: true });
    }
    h += '</section>';
    h += '<section class="card"><h2>People</h2>' +
      '<label class="chk"><input type="checkbox" data-noi="1"' + (view.people.noi ? ' checked' : '') + '><span>NOI is required (5 acres or more)</span></label>' +
      field('Prepared by', 'x.preparer', v['x.preparer']) +
      field('Date prepared', 'x.prepared', v['x.prepared']) +
      field('Contacts', 'x.contact', v['x.contact'], { area: true }) +
      '</section>';
    h += '<details class="card more"><summary>Coordinates and project number</summary><div class="secbody">' +
      field('Begin latitude', 'bLat', v.bLat, { decimal: true }) + field('Begin longitude', 'bLon', v.bLon, { decimal: true }) +
      field('End latitude', 'eLat', v.eLat, { decimal: true }) + field('End longitude', 'eLon', v.eLon, { decimal: true }) +
      field('Project number', 't.proj', v['t.proj']) +
      '</div></details>';
    h += '<button type="button" class="btn block" data-edit="0">Done</button>';
    h += '<button type="button" class="btn sec block" data-reset="1">Clear my edits and use the saved project fields</button>';
    h += exportHtml(view);
    return h;
  }

  function exportHtml(view) {
    var v = S.variantFor(A.cur()), info = S.SHEETS[v];
    return '<details class="card export"><summary>Download a PDF</summary><div class="secbody">' +
      '<p class="lede">Optional. The page above is the copy to read. A PDF is only for the plan set. Nothing is uploaded.</p>' +
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
    pane.innerHTML = st.edit ? editHtml(view) : readHtml(view);
    if (!st.status[S.variantFor(A.cur())]) refreshStatus();
  }
  function refreshStatus() {
    var v = S.variantFor(A.cur());
    st.status[v] = true;
    getOfficial(v).then(function () {
      var host = document.querySelector('#paneSummary .pdfstatus');
      if (host && A.ui.tab === 'summary') host.innerHTML = pdfStatus(S.variantFor(A.cur()));
    });
  }

  function syncPair(fromId, toId, formKey, formVal) {
    setV(fromId, formVal);
    if (toId) setV(toId, formVal);
    if (formKey) A.cur().form[formKey] = formVal;
  }
  function onInput(e) {
    var t = e.target;
    if (!t.closest || !t.closest('#paneSummary')) return;
    var id = t.getAttribute && t.getAttribute('data-sv');
    if (!id) return;
    var p = A.cur(), val = t.value;
    if (id === 'name') {
      p.name = val || 'Untitled';
      A.save();
      var sel = document.getElementById('projSel');
      if (sel) Array.prototype.forEach.call(sel.options, function (o) { if (o.value === p.id) o.textContent = p.name; });
      return;
    }
    if (id === 'soils') { writeSoils(val); return; }
    if (id === 'ms4') { writeMs4(val); return; }
    if (id === 'csj') { setV('csj', val); p.form.csj = val; A.save(); return; }
    if (id === 't.hwy') { setV('t.hwy', val); p.form.highway = val; A.save(); return; }
    if (id === 't.county') { setV('t.county', val); p.form.county = val; A.save(); return; }
    if (id === 'distArea') { setV('distArea', val); p.form.acres = val; p.form.supportAcres = ''; A.save(); return; }
    if (id === 'nature') { setV('nature', val); p.form.nature = val; A.save(); return; }
    if (id === 'recv.0.0') { setV('recv.0.0', val); p.form.receiving = val; A.save(); return; }
    if (id === 'recv.0.1') { setV('recv.0.1', val); p.form.segment = val; A.save(); return; }
    if (id === 'limFrom' || id === 'limTo') {
      setV(id, val);
      var v = vals();
      p.form.limits = 'From: ' + (id === 'limFrom' ? val : S.textOf(v, 'limFrom')) + ' to ' + (id === 'limTo' ? val : S.textOf(v, 'limTo'));
      A.save();
      return;
    }
    if (id === 'bLat' || id === 'bLon' || id === 'eLat' || id === 'eLon') {
      setV(id, val);
      var vv = vals();
      p.form.coordsBegin = [S.textOf(vv, 'bLat'), S.textOf(vv, 'bLon')].filter(Boolean).join(', ');
      p.form.coordsEnd = [S.textOf(vv, 'eLat'), S.textOf(vv, 'eLon')].filter(Boolean).join(', ');
      A.save();
      return;
    }
    setV(id, val);
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
    if (b.hasAttribute('data-edit')) {
      st.edit = b.getAttribute('data-edit') === '1';
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (b.hasAttribute('data-var')) { sm().variant = b.getAttribute('data-var'); A.save(); render(); return; }
    if (b.hasAttribute('data-tp')) {
      var item = itemById(b.getAttribute('data-tp'));
      if (!item) return;
      setSide(item, b.getAttribute('data-side'), b.getAttribute('aria-pressed') !== 'true');
      keep(render);
      return;
    }
    if (b.hasAttribute('data-on')) {
      var it = itemById(b.getAttribute('data-on'));
      var next = b.getAttribute('aria-pressed') !== 'true';
      (it.on || []).forEach(function (k) { setV(k, next); });
      keep(render);
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
      return;
    }
    if (t.hasAttribute('data-noi')) {
      setV('rt.noi', t.checked);
      setV('rc.noi', t.checked);
      keep(render);
      return;
    }
    if (t.hasAttribute('data-pdf') && t.files && t.files[0]) {
      useFile(t.getAttribute('data-pdf'), t.files[0]).catch(function () { A.toast('Could not read that file.'); });
      t.value = '';
    }
  }
  function keep(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

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
        var d = document.querySelector('#paneSummary details.export');
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
    }).catch(function (e) { st.busy = false; A.toast('Could not make the PDF.'); });
  }
  function printModel(p) {
    var view = S.screenView(p);
    function line(label, value) { return '<tr><th>' + esc(label) + '</th><td>' + esc(value || '—') + '</td></tr>'; }
    var h = '<h1>' + esc(view.name) + '</h1><p>' + esc(view.sheetLabel) + '. ' + esc(view.disclaimer) + '</p>';
    h += '<h2>Project</h2><table>' + line('CSJ', view.project.csj) + line('Highway', view.project.highway) + line('County', view.project.county) + line('From', view.project.from) + line('To', view.project.to) + '</table>';
    h += '<h2>The site</h2><table>' + line('Disturbed acres', view.site.disturbed) + line('Work', view.site.nature) + line('Soils', view.site.soils.join('; ')) + line('Receiving water', view.site.receiving) + '</table>';
    h += '<h2>Controls</h2><ul>' + (view.controls.length ? view.controls.map(function (c) { return '<li>' + esc(c.label) + ' — ' + esc(c.use) + '</li>'; }).join('') : '<li>None marked</li>') + '</ul>';
    h += '<p>' + esc(view.basin.text) + '</p><h2>Who does what</h2>' + view.people.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
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
