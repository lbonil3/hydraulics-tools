/* SWP3 Builder: Summary Sheet tab. A guided form that mirrors the TxDOT SWP3 Summary Sheets, with "What this means" for every part,
 * and export to the filled official PDF, a values-only PDF, print, Markdown and JSON. Logic: summary.js, summary-help.js, summary-pdf.js. */
(function () {
  'use strict';
  var A, M, D, S = window.SwpSummary, H = window.SwpSummaryHelp, P = window.SwpSummaryPdf;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var st = { help: {}, rows: {}, openSec: {}, mem: {}, status: {}, warnings: null, busy: false };
  var EXCL = [['psl.pre', 'psl.con', 'psl.none'], ['basin.notreq', 'basin.req', 'basin.nf']];
  var $ = function (s) { return document.querySelector(s); };

  /* ---------- project data ---------- */
  function sm() { var p = A.cur(); if (!p.summary || typeof p.summary !== 'object') p.summary = { variant: '', v: {} }; if (!p.summary.v) p.summary.v = {}; return p.summary; }
  function setV(id, v) { sm().v[id] = v; A.save(); }
  function delV(id) { delete sm().v[id]; }
  function keysOf(fd) {
    var id = fd.id, o = sm().v;
    if (fd.kind === 'tp' || fd.kind === 'tpother') return [id + '.T', id + '.P'].concat(fd.kind === 'tpother' ? [id] : []);
    if (fd.kind === 'table') return Object.keys(o).filter(function (k) { return k.indexOf(id + '.') === 0 && /^\d+\.\d+$/.test(k.slice(id.length + 1)); });
    if (fd.kind === 'other') return [id, fd.check];
    return [id];
  }
  function userCount(fd) { var o = sm().v; return keysOf(fd).filter(function (k) { return Object.prototype.hasOwnProperty.call(o, k); }).length; }

  /* ---------- official PDF storage (IndexedDB, with in-memory fallback) ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var r = indexedDB.open('swp3-builder', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('pdf'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idbDo(mode, fn) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction('pdf', mode), q = fn(tx.objectStore('pdf')); tx.oncomplete = function () { res(q && q.result); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  function getOfficial(v) {
    var info = S.SHEETS[v];
    if (st.mem[v]) return Promise.resolve(st.mem[v]);
    return idbDo('readonly', function (s) { return s.get(info.file); }).catch(function () { return null; }).then(function (rec) {
      if (rec && rec.bytes) { st.mem[v] = { bytes: rec.bytes, sha: rec.sha, ok: rec.sha === info.sha256, from: 'saved on this device' }; return st.mem[v]; }
      if (!S.BUNDLED || typeof fetch !== 'function' || location.protocol === 'file:') return null;
      return fetch('assets/' + info.file).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; }).then(function (buf) {
        if (!buf) return null;
        return P.sha256(buf).then(function (h) { st.mem[v] = { bytes: buf, sha: h, ok: h === info.sha256, from: 'bundled copy' }; return st.mem[v]; });
      });
    });
  }
  function useFile(v, file) {
    var info = S.SHEETS[v], other = S.SHEETS[v === 'A' ? 'B' : 'A'];
    return file.arrayBuffer().then(function (buf) {
      return P.sha256(buf).then(function (h) {
        if (h === other.sha256) { A.toast('That is the ' + (v === 'A' ? '1-acre-or-more' : 'less-than-1-acre') + ' sheet. Choose it for the other version.'); return; }
        if (h !== info.sha256 && !window.confirm('This file is not the 2023 TxDOT sheet this tool was measured against, so text may land in the wrong place. Use it anyway?')) return;
        st.mem[v] = { bytes: buf, sha: h, ok: h === info.sha256, from: 'file you loaded' };
        idbDo('readwrite', function (s) { return s.put({ bytes: buf, sha: h, saved: new Date().toISOString() }, info.file); }).catch(function () {});
        A.toast(h === info.sha256 ? 'Official sheet loaded and verified.' : 'Loaded, but it does not match the expected file.');
        render();
      });
    });
  }
  function forget(v) { delete st.mem[v]; return idbDo('readwrite', function (s) { return s['delete'](S.SHEETS[v].file); }).catch(function () {}).then(function () { render(); }); }

  /* ---------- html ---------- */
  function srcLink(key) { var s = D.SOURCES[key]; return s ? A.bd(s.badge) + '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>' : ''; }
  function helpHtml(h, extra) {
    if (!h) return '';
    var o = '<div class="shelp"><p>' + esc(h.what) + '</p><dl>';
    if (h.who) o += '<dt>Who fills it in</dt><dd>' + esc(h.who) + '</dd>';
    if (h.enter) o += '<dt>What to enter</dt><dd>' + esc(h.enter) + '</dd>';
    if (h.ex) o += '<dt>Example</dt><dd>' + esc(h.ex) + '</dd>';
    if (extra) o += '<dt>Where the value came from</dt><dd>' + esc(extra) + '</dd>';
    o += '</dl>';
    if (h.tx && h.tx.length) o += '<div class="hl">' + A.bd('TXDOT') + h.tx.map(esc).join(' ') + '</div>';
    if (h.tc && h.tc.length) o += '<div class="hl">' + A.bd('TCEQ') + '<b>Related permit part' + (h.tc.length > 1 ? 's' : '') + ':</b><ul>' + h.tc.map(function (c) { return '<li><b>' + esc(c[0]) + '</b>: ' + esc(c[1]) + '</li>'; }).join('') + '</ul></div>';
    if (h.as) o += '<div class="hl">' + A.bd('ASSUMED') + esc(h.as) + '</div>';
    return o + '<p class="muted small">Sources: ' + srcLink('TXD_S21') + ' ' + srcLink('TXR') + '</p></div>';
  }
  function qbtn(key, label) { return '<button type="button" class="qbtn" data-help="' + esc(key) + '" aria-expanded="' + (st.help[key] ? 'true' : 'false') + '" aria-label="What this means: ' + esc(label) + '">?</button>'; }
  function pfPill(id, V) { return V.src[id] === 'prefill' && V.val[id] !== '' && V.val[id] !== false && V.val[id] !== undefined ? '<span class="pill info pf">prefilled</span>' : ''; }
  function resetBtn(fd, id) { return userCount(fd) ? '<button type="button" class="rst" data-reset="' + esc(id) + '">Reset</button>' : '<button type="button" class="rst" data-reset="' + esc(id) + '" hidden>Reset</button>'; }
  function helpBox(fd, V) { if (!st.help[fd.id]) return ''; var h = H.field(fd); var w = V.why[fd.id] || (fd.kind === 'tp' ? V.why[fd.id + '.T'] || V.why[fd.id + '.P'] : ''); return '<div data-hbox="' + esc(fd.id) + '">' + helpHtml(h, w) + '</div>'; }

  function fieldHtml(fd, V) {
    var id = fd.id, v = V.val, o = '';
    if (fd.hidden) return '';
    if (fd.kind === 'text' || fd.kind === 'area') {
      var tag = fd.kind === 'area' ? '<textarea data-sv="' + esc(id) + '" rows="3">' + esc(v[id] || '') + '</textarea>' : '<input type="text" data-sv="' + esc(id) + '" value="' + esc(v[id] || '') + '"' + (/Lat|Lon/.test(id) || /Area/.test(id) ? ' inputmode="decimal"' : '') + '>';
      o = '<div class="sf"><div class="sfh"><label class="slab"><span>' + esc(fd.label) + '</span>' + tag + '</label>' + qbtn(id, fd.label) + '</div><div class="sfm">' + pfPill(id, V) + resetBtn(fd, id) + '</div>' + helpBox(fd, V) + '</div>';
    } else if (fd.kind === 'check') {
      var on = S.checkValue(v, id);
      o = '<div class="sf"><div class="sfh"><label class="chk"><input type="checkbox" data-sc="' + esc(id) + '"' + (on ? ' checked' : '') + '><span>' + esc(fd.label) + '</span></label>' + qbtn(id, fd.label) + '</div>' +
        '<div class="sfm">' + pfPill(id, V) + (fd.pre ? '<span class="pill">pre-checked on the official sheet</span>' : '') + resetBtn(fd, id) + '</div>' + helpBox(fd, V) + '</div>';
    } else if (fd.kind === 'tp') {
      o = '<div class="sf"><div class="sfh tpr"><span class="tpl">' + esc(fd.label) + '</span>' + ['T', 'P'].map(function (k) { return '<label class="tpb"><input type="checkbox" data-sc="' + esc(id + '.' + k) + '"' + (v[id + '.' + k] === true ? ' checked' : '') + '><span>' + k + '</span></label>'; }).join('') + qbtn(id, fd.label) + '</div>' +
        '<div class="sfm">' + (V.src[id + '.T'] === 'prefill' || V.src[id + '.P'] === 'prefill' ? '<span class="pill info pf">prefilled</span>' : '') + resetBtn(fd, id) + '</div>' + helpBox(fd, V) + '</div>';
    } else if (fd.kind === 'other' || fd.kind === 'tpother') {
      var tp = fd.kind === 'tpother';
      o = '<div class="sf"><div class="sfh"><label class="slab"><span>Other (describe)</span><input type="text" data-sv="' + esc(id) + '" value="' + esc(v[id] || '') + '"></label>' + (tp ? ['T', 'P'].map(function (k) { return '<label class="tpb"><input type="checkbox" data-sc="' + esc(id + '.' + k) + '"' + (v[id + '.' + k] === true ? ' checked' : '') + '><span>' + k + '</span></label>'; }).join('') : '') + qbtn(id, 'Other line') + '</div>' +
        '<div class="sfm">' + pfPill(id, V) + resetBtn(fd, id) + '</div>' + helpBox({ id: id, kind: fd.kind, label: 'Other' }, V) + '</div>';
    } else if (fd.kind === 'table') {
      var last = -1, r, c;
      for (r = 0; r < fd.rows; r++) for (c = 0; c < fd.cols.length; c++) if (v[id + '.' + r + '.' + c]) last = r;
      var show = Math.min(fd.rows, Math.max(last + 2, 2, st.rows[id] || 0));
      o = '<div class="sf"><div class="sfh"><b class="tlabel">' + esc(fd.label) + '</b>' + qbtn(id, fd.label) + '</div>';
      for (r = 0; r < show; r++) {
        o += '<div class="trow" style="--c:' + fd.cols.length + '"><span class="rn">' + (r + 1) + '</span>';
        for (c = 0; c < fd.cols.length; c++) o += '<label class="slab"><span>' + esc(fd.cols[c]) + '</span><input type="text" data-sv="' + esc(id + '.' + r + '.' + c) + '" value="' + esc(v[id + '.' + r + '.' + c] || '') + '"></label>';
        o += '</div>';
      }
      o += '<div class="sfm">' + (show < fd.rows ? '<button type="button" class="btn sec sm" data-addrow="' + esc(id) + '">Add a row (' + show + ' of ' + fd.rows + ' shown)</button>' : '<span class="muted small">All ' + fd.rows + ' rows of the sheet are shown.</span>') + resetBtn(fd, id) + '</div>' + helpBox(fd, V) + '</div>';
    }
    return o;
  }
  function filledCount(s, V) {
    var n = 0;
    s.fields.forEach(function (fd) {
      if (fd.hidden) return;
      if (fd.kind === 'check') { if (S.checkValue(V.val, fd.id)) n++; }
      else if (fd.kind === 'tp') { if (V.val[fd.id + '.T'] === true || V.val[fd.id + '.P'] === true) n++; }
      else if (fd.kind === 'table') { for (var r = 0; r < fd.rows; r++) if (fd.cols.some(function (c, ci) { return V.val[fd.id + '.' + r + '.' + ci]; })) n++; }
      else if (fd.kind === 'tpother' || fd.kind === 'other') { if (V.val[fd.id]) n++; }
      else if (V.val[fd.id]) n++;
    });
    return n;
  }
  function sectionHtml(s, V) {
    var key = 's:' + s.id, h = H.section(s.id), openAttr = st.openSec[s.id] ? ' open' : '';
    var title = (s.num ? s.num + ' ' : '') + s.title;
    var o = '<details class="sec ssec" data-sec="' + esc(s.id) + '"' + openAttr + '><summary><span class="stt">' + esc(title) + '</span><span class="pill ' + (s.local ? 'mid' : '') + '">' + (s.local ? 'not printed' : s.sheet ? 'sheet ' + s.sheet : 'both sheets') + '</span>' + (s.fixed ? '' : '<span class="pill ok">' + filledCount(s, V) + ' filled</span>') + '</summary><div class="sbody">';
    o += '<button type="button" class="btn sec sm shbtn" data-help="' + esc(key) + '" aria-expanded="' + (st.help[key] ? 'true' : 'false') + '">What this means</button>';
    if (st.help[key]) o += '<div data-hbox="' + esc(key) + '">' + helpHtml(h) + '</div>';
    if (s.fixed) o += '<p class="muted">This part of the official sheet is fixed text. There is nothing to type. ' + (s.id === '2.9' ? 'The tool cannot edit the 7-day inspection wording.' : '') + '</p>';
    else s.fields.forEach(function (fd) { o += fieldHtml(fd, V); });
    if (!s.fixed && s.fields.length) o += '<button type="button" class="btn sec sm" data-resetsec="' + esc(s.id) + '">Reset this section to project values</button>';
    return o + '</div></details>';
  }
  function statusHtml(v) {
    var info = S.SHEETS[v], m = st.mem[v], label = v === 'A' ? 'Less than 1 acre' : '1 acre or more';
    var o = '<div class="pdfrow"><b>' + label + '</b> <span class="muted small">' + esc(info.file) + '</span><br>';
    if (m) o += '<span class="pill ' + (m.ok ? 'ok' : 'bad') + '">' + (m.ok ? 'verified' : 'not the expected file') + '</span> <span class="muted small">' + esc(m.from) + '</span> <button type="button" class="rst" data-forget="' + v + '">Remove</button>';
    else o += '<span class="pill mid">not loaded</span> <span class="muted small">checking this device...</span>';
    o += '<label class="btn sec sm filebtn">Choose the downloaded PDF<input type="file" accept="application/pdf,.pdf" data-pdf="' + v + '" class="sr"></label> <a class="small" href="' + esc(info.url) + '" target="_blank" rel="noopener noreferrer">Download from TxDOT</a></div>';
    return o;
  }
  function render() {
    if (!A) return;
    var pane = $('#paneSummary'); if (!pane) return;
    var p = A.cur(), V = S.values(p), v = S.variantFor(p), info = S.SHEETS[v], s = sm(), secs = S.sections(v), tot = M.totals(p.form).total;
    var h = '<div class="card"><h2>Summary Sheet</h2><p class="muted small">' + A.bd('TXDOT') + 'Fill in the TxDOT SWP3 Summary Sheets (sheet 1 and sheet 2) from your project. Everything marked <span class="pill info">prefilled</span> comes from your other tabs and follows them until you change it. Anything you type is saved with this project on this device. Blank stays blank. Tap <b>?</b> on any part for what it means.</p>' +
      '<div class="seg" role="group" aria-label="Which sheet">' + [['', 'Auto'], ['B', '1 acre or more'], ['A', 'Under 1 acre']].map(function (x) { return '<button type="button" data-var="' + x[0] + '" class="' + ((s.variant || '') === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted small">Using <b>' + esc(info.title) + '</b>' + (s.variant ? ' (your choice).' : ' because the project disturbs ' + (tot > 0 ? (Math.round(tot * 100) / 100) + ' acres.' : 'an unknown area (the 1-acre-or-more sheet is the default).')) + '</p></div>';
    var cs = S.checks(p);
    if (cs.length) h += '<div class="card"><h3>Checks</h3><ul class="checks">' + cs.map(function (c) { return '<li><span class="pill ' + (c.level === 'warn' ? 'bad' : 'info') + '">' + (c.level === 'warn' ? 'Check' : 'Note') + '</span> ' + A.bd(c.src === 'TCEQ' ? 'TCEQ' : 'TXDOT') + esc(c.msg) + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="card"><h3>Export</h3><div class="row"><button type="button" class="btn" data-exp="pdf">Filled official PDF</button><button type="button" class="btn sec" data-exp="overlay">Values-only PDF</button></div>' +
      '<div class="row"><button type="button" class="btn sec" data-exp="print">Print</button><button type="button" class="btn sec" data-exp="md">Markdown</button><button type="button" class="btn sec" data-exp="json">JSON</button></div>' +
      '<div id="sumWarn" role="status" aria-live="polite">' + warnHtml() + '</div>' +
      '<p class="muted small">The filled PDF is drawn on top of the official TxDOT sheet in your browser. Nothing is uploaded. A PE must review it, and sign and seal it where required. This tool cannot seal.</p>' +
      '<details class="wk"><summary>Official TxDOT sheets on this device</summary><p class="muted small">' + A.bd('TXDOT') + 'The TxDOT sheets are copyrighted by TxDOT and this repository does not redistribute them. Download the PDF from the TxDOT <a href="' + esc(S.PAGE_URL) + '" target="_blank" rel="noopener noreferrer">Roadway Standards page</a> (SWP3 Summary Sheets, July 2023 template) and choose it here once. It is checked against the expected file and kept on this device for offline use.</p>' +
      '<div id="sumPdf">' + statusHtml('B') + statusHtml('A') + '</div></details>' +
      '<details class="wk"><summary>Values-only PDF and other exports</summary><p class="muted small">The values-only PDF has just your entries, positioned like the official sheet, so you can print it onto the official sheet or use it when you do not have the PDF. Print, Markdown and JSON list every entry in sheet order.</p></details></div>';
    secs.forEach(function (sec) { h += sectionHtml(sec, V); });
    h += '<div class="card"><button type="button" class="btn danger block" data-resetall="1">Reset every Summary Sheet edit to project values</button></div>';
    pane.innerHTML = h;
    refreshStatus();
  }
  function warnHtml() { var w = st.warnings; if (!w) return ''; if (!w.length) return '<p class="pill ok">Exported with no text cut off.</p>'; return '<ul class="checks">' + w.map(function (x) { return '<li><span class="pill bad">Cut off</span> ' + esc(x.id) + ': ' + esc(x.msg) + '</li>'; }).join('') + '</ul>'; }
  function refreshStatus() {
    ['B', 'A'].forEach(function (v) { if (!st.status[v]) { st.status[v] = true; getOfficial(v).then(function () { var el = $('#sumPdf'); if (el && A.ui.tab === 'summary' && !document.activeElement.matches('[data-pdf]')) el.innerHTML = statusHtml('B') + statusHtml('A'); }); } });
  }

  /* ---------- export ---------- */
  function stamp(p) { return (p.name || 'swp3').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }
  function doPdf(overlay) {
    var p = A.cur(), pl = S.plan(p), PL = window.PDFLib;
    if (!PL) { A.toast('The PDF library did not load.'); return; }
    if (st.busy) return; st.busy = true;
    var go = overlay ? Promise.resolve({ bytes: null }) : getOfficial(pl.variant);
    go.then(function (m) {
      if (!m) { st.busy = false; var d = document.querySelector('#paneSummary details.wk'); if (d) d.open = true; A.toast('Load the official ' + (pl.variant === 'A' ? 'less-than-1-acre' : '1-acre-or-more') + ' sheet first (Official TxDOT sheets on this device).'); if (d) d.scrollIntoView(); return; }
      return P.build(PL, overlay ? null : m.bytes, pl).then(function (r) {
        st.busy = false; st.warnings = r.warnings; var w = $('#sumWarn'); if (w) w.innerHTML = warnHtml();
        A.download('swp3-summary-sheet-' + pl.variant + (overlay ? '-values-only-' : '-') + stamp(p) + '.pdf', r.bytes, 'application/pdf');
        A.toast(r.warnings.length ? 'PDF exported. Some text was cut off; see the list.' : 'PDF exported.');
      });
    }).catch(function (e) { st.busy = false; A.toast('Could not make the PDF: ' + (e && e.message ? e.message : e)); });
  }
  function printModel(p) {
    var v = S.variantFor(p), h = '<h1>SWP3 Summary Sheet answers: ' + esc(p.name) + '</h1><p>' + esc(S.SHEETS[v].title) + '. Draft for engineer review; not signed or sealed.</p>';
    S.exportModel(p).forEach(function (s) {
      h += '<h2>' + esc((s.num ? s.num + ' ' : '') + s.title) + '</h2>';
      if (s.fixed) { h += '<p><i>Fixed language on the sheet.</i></p>'; return; }
      h += '<table style="border-collapse:collapse;width:100%;font-size:12px">' + s.rows.map(function (r) { var val = r[2] === 'c' ? (r[1] === 'X' ? '[x]' : '[ ]') : r[1] || (r[2] === 'tp' ? 'not used' : ''); return '<tr><td style="border:1px solid #999;padding:3px 6px;width:62%">' + esc(r[0]) + '</td><td style="border:1px solid #999;padding:3px 6px">' + esc(val) + '</td></tr>'; }).join('') + '</table>';
    });
    return h;
  }

  /* ---------- events ---------- */
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }
  function onInput(e) {
    var t = e.target; if (!t.hasAttribute || !t.hasAttribute('data-sv')) return;
    setV(t.getAttribute('data-sv'), t.value);
    var w = t.closest('.sf'); if (w) { var r = w.querySelector('.rst[data-reset]'); if (r) r.hidden = false; var pf = w.querySelector('.pf'); if (pf) pf.remove(); }
  }
  function onChange(e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-sc')) {
      var id = t.getAttribute('data-sc'); setV(id, t.checked);
      if (t.checked) EXCL.forEach(function (g) { if (g.indexOf(id) >= 0) g.forEach(function (o) { if (o !== id) setV(o, false); }); });
      keepScroll(render); return;
    }
    if (t.hasAttribute && t.hasAttribute('data-pdf') && t.files && t.files[0]) { useFile(t.getAttribute('data-pdf'), t.files[0]).catch(function () { A.toast('Could not read that file.'); }); t.value = ''; }
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    var k;
    if ((k = b.getAttribute('data-help'))) { st.help[k] = !st.help[k]; keepScroll(render); return; }
    if (b.hasAttribute('data-var')) { sm().variant = b.getAttribute('data-var'); A.save(); keepScroll(render); return; }
    if ((k = b.getAttribute('data-addrow'))) { st.rows[k] = (st.rows[k] || 2) + 1; var fdA = findField(k); if (fdA) { var cur = 0; for (var r = 0; r < fdA.rows; r++) for (var c = 0; c < fdA.cols.length; c++) if (S.values(A.cur()).val[k + '.' + r + '.' + c]) cur = r + 1; st.rows[k] = Math.max(st.rows[k], cur + 2); } keepScroll(render); return; }
    if ((k = b.getAttribute('data-reset'))) { var fd = findField(k); if (fd) { keysOf(fd).forEach(delV); A.save(); keepScroll(render); } return; }
    if ((k = b.getAttribute('data-resetsec'))) { var sec = S.sections(S.variantFor(A.cur())).filter(function (x) { return x.id === k; })[0]; if (sec) { sec.fields.forEach(function (f) { keysOf(f).forEach(delV); }); A.save(); keepScroll(render); A.toast('Section reset.'); } return; }
    if (b.hasAttribute('data-resetall')) { if (window.confirm('Remove every Summary Sheet edit on this project and go back to the project values?')) { sm().v = {}; A.save(); render(); A.toast('Reset.'); } return; }
    if ((k = b.getAttribute('data-forget'))) { forget(k); return; }
    if ((k = b.getAttribute('data-exp'))) {
      var p = A.cur();
      if (k === 'pdf') doPdf(false); else if (k === 'overlay') doPdf(true);
      else if (k === 'print') A.printHtml(printModel(p));
      else if (k === 'md') A.download(A.fileName(p, 'md').replace('-swp3.', '-swp3-summary-sheet.'), S.toMarkdown(p), 'text/markdown');
      else if (k === 'json') A.download(A.fileName(p, 'json').replace('-swp3.', '-swp3-summary-sheet.'), S.toJson(p), 'application/json');
    }
  }
  function findField(id) {
    var secs = S.sections(S.variantFor(A.cur())), out = null;
    secs.forEach(function (s) { s.fields.forEach(function (f) { if (f.id === id) out = f; }); });
    return out;
  }
  function onToggle(e) { var d = e.target; if (d && d.matches && d.matches('details.ssec')) st.openSec[d.getAttribute('data-sec')] = d.open; }

  function init(app) {
    if (A) return;
    A = app; M = app.M; D = app.D;
    var pane = $('#paneSummary');
    pane.addEventListener('input', onInput); pane.addEventListener('change', onChange); pane.addEventListener('click', onClick);
    pane.addEventListener('toggle', onToggle, true);
    if (A.ui.tab === 'summary') render();
  }
  window.SwpSummaryUI = { init: init, render: render };
  if (window.SwpApp) window.SwpSummaryUI.init(window.SwpApp);
})();
