/* Tests for the Summary Sheet logic: layout coverage, prefill/mapping, overrides, plan, fitting, help coverage, export text, and (when the official PDFs are available) a real PDF fill.
 * Run: node swp3-builder/test-summary.js    Optional: SWP3_PDF_DIR=/dir/with/swp3a23.pdf+swp3b23.pdf for the PDF render test. */
var assert = require('assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
var M = require('./model.js'), S = require('./summary.js'), H = require('./summary-help.js'), L = require('./summary-layout.js');
var n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error('FAIL: ' + name + '\n  ' + (e && e.stack || e)); process.exitCode = 1; } }

function proj(over) { var p = M.newProject({ name: 'Test', type: 'txdot' }); Object.assign(p.form, over || {}); return p; }
function layoutKeysFor(fd) {
  if (fd.kind === 'check') return [fd.id];
  if (fd.kind === 'tp') return [fd.id + '.T', fd.id + '.P'];
  if (fd.kind === 'tpother') return [fd.id, fd.id + '.T', fd.id + '.P'];
  if (fd.kind === 'other') return [fd.id, fd.id + '.c'];
  if (fd.kind === 'text' || fd.kind === 'area') return fd.pdf || [fd.id];
  if (fd.kind === 'table') return [fd.id];
  return [];
}

['A', 'B'].forEach(function (v) {
  t('layout covers every printed field, variant ' + v, function () {
    var F = L[v].fields, seen = {};
    S.sections(v).forEach(function (s) {
      s.fields.forEach(function (fd) {
        if (fd.local || s.local) return;
        layoutKeysFor(fd).forEach(function (k) { assert(F[k], v + ' missing layout for ' + k); seen[k] = 1; });
        if (fd.kind === 'table') { assert.strictEqual(F[fd.id].t, 'tbl'); assert.strictEqual(F[fd.id].rows.length, fd.rows, fd.id + ' row count'); assert.strictEqual(F[fd.id].cols.length, fd.cols.length, fd.id + ' col count'); assert(F[fd.id].top != null, fd.id + ' top'); }
        if (fd.id === 'nf.other') seen['nf.other.c'] = 1;
      });
    });
    Object.keys(F).forEach(function (k) { if (/^seal2\./.test(k) || /^t\..*\.[12]$/.test(k)) return; assert(seen[k], v + ': layout field not in catalog: ' + k); });
  });
  t('layout has 2 pages and sane boxes, variant ' + v, function () {
    assert.strictEqual(L[v].pages.length, 2);
    Object.keys(L[v].fields).forEach(function (k) {
      var f = L[v].fields[k]; assert(f.p === 1 || f.p === 2, k + ' page');
      var box = f.t === 'c' ? [f.x, f.y, f.x + f.w, f.y + f.h] : f.t === 'tbl' ? [f.cols[0][0], f.rows[0][0], f.cols[f.cols.length - 1][1], f.rows[f.rows.length - 1][1]] : f.t === 'a' ? [f.lines[0].x0, f.lines[0].y - 12, f.lines[0].x1, f.lines[f.lines.length - 1].y] : f.t === 'cell' ? [f.x0, f.y0, f.x1, f.y1] : [f.x0, f.y - 12, f.x1, f.y];
      assert(box[0] >= 0 && box[2] <= 1224 && box[1] >= 0 && box[3] <= 792, k + ' inside the page: ' + box);
      assert(box[2] > box[0] && box[3] > box[1], k + ' has area');
    });
  });
  t('help exists for every section and field, variant ' + v, function () {
    S.sections(v).forEach(function (s) {
      var hs = H.section(s.id); assert(hs && hs.what && hs.who, 'section help ' + s.id);
      s.fields.forEach(function (fd) { if (/\.[TP]$/.test(fd.id)) return; var h = H.field(fd); assert(h && h.what && h.what.length > 15, 'field help ' + fd.id); });
    });
  });
});

t('parsers', function () {
  assert.deepStrictEqual(S.parseCsj('0912-72-345'), ['0912', '72', '345']);
  assert.deepStrictEqual(S.parseCsj('CSJ 0912 72 345, 0912-72-346'), ['0912', '72', '345']);
  assert.deepStrictEqual(S.parseCsj('nope'), ['', '', '']);
  assert.deepStrictEqual(S.parseLimits('From: A St to B St'), ['A St', 'B St']);
  assert.deepStrictEqual(S.parseLatLon('29.7604, -95.3698'), ['29.7604', '-95.3698']);
  assert.deepStrictEqual(S.parseLatLon('x'), ['', '']);
});

t('variant follows disturbed acres unless chosen', function () {
  assert.strictEqual(S.variantFor(proj({ acres: '0.6' })), 'A');
  assert.strictEqual(S.variantFor(proj({ acres: '1' })), 'B');
  assert.strictEqual(S.variantFor(proj({ acres: '12' })), 'B');
  var p = proj({ acres: '12' }); p.summary = { variant: 'A', v: {} }; assert.strictEqual(S.variantFor(p), 'A');
});

t('prefill maps project inputs', function () {
  var p = proj({ county: 'Harris County', highway: 'FM 1960', csj: '0912-72-345', limits: 'From: Atascocita Rd to Humble Westfield Rd', coordsBegin: '29.99, -95.25', coordsEnd: '30.01, -95.21', nature: 'Widen road', acres: '12', supportAcres: '0.5', soils: 'Beaumont clay; Aldine silty clay', ms4: 'Harris County MS4', permanentNote: 'Riprap at outfalls', openAcres: '4' });
  p.form.act.dewatering = true;
  var V = S.values(p), v = V.val;
  assert.strictEqual(v['t.county'], 'Harris'); assert.strictEqual(v['t.hwy'], 'FM 1960'); assert.strictEqual(v['t.cont'], '0912'); assert.strictEqual(v['t.sect'], '72'); assert.strictEqual(v['t.job'], '345');
  assert.strictEqual(v.csj, '0912-72-345'); assert.strictEqual(v.limFrom, 'Atascocita Rd'); assert.strictEqual(v.limTo, 'Humble Westfield Rd');
  assert.strictEqual(v.bLat, '29.99'); assert.strictEqual(v.bLon, '-95.25'); assert.strictEqual(v.eLat, '30.01');
  assert.strictEqual(v.distArea, '12.5', 'disturbed + support acres'); assert.strictEqual(v.nature, 'Widen road');
  assert.strictEqual(v['soils.0.0'], 'Beaumont clay'); assert.strictEqual(v['soils.1.0'], 'Aldine silty clay'); assert.strictEqual(v['ms4.0.0'], 'Harris County MS4');
  assert.strictEqual(v['perm.0.0'], 'Riprap at outfalls'); assert.strictEqual(v['basin.notreq'], true);
  assert.strictEqual(v['rt.noi'], true, 'large site keeps NOI'); assert.strictEqual(v['rc.o1'], 'Conduct daily dewatering inspections'); assert.strictEqual(v['pol.water'], true);
  assert.strictEqual(V.src['csj'], 'prefill'); assert(V.why['csj'], 'has a reason string');
  assert(!('totalArea' in v) || v.totalArea === '', 'total project area is not invented');
  assert(!('t.proj' in v) || v['t.proj'] === '', 'project number is not invented');
});
t('small project unticks NOI lines (guidance 1.12/1.13)', function () {
  var v = S.values(proj({ acres: '2' })).val; assert.strictEqual(v['rt.noi'], false); assert.strictEqual(v['rc.noi'], false);
});
t('selected BMPs map to rows', function () {
  var p = proj({ acres: '3' }); p.sel = { sediment_fence: true, rock_exit: true, erosion_blanket: true, sediment_basin: false };
  var v = S.values(p).val; assert.strictEqual(v['sc.fence.T'], true); assert.strictEqual(v['sc.exit.T'], true); assert.strictEqual(v['veh.exit'], true); assert.strictEqual(v['ec.srb.T'], true); assert(!v['basin.T']);
});
t('user edits override prefill and blanks stay blank', function () {
  var p = proj({ county: 'Harris', acres: '3' }); p.summary = { variant: '', v: { 't.county': '', distArea: '2.5', 'act.mob': false } };
  var V = S.values(p); assert.strictEqual(V.val['t.county'], ''); assert.strictEqual(V.src['t.county'], 'user'); assert.strictEqual(V.val.distArea, '2.5'); assert.strictEqual(V.val['act.mob'], false);
  var ops = S.plan(p).ops; assert(!ops.some(function (o) { return o.id === 't.county.1'; }), 'blank text draws nothing');
  assert(!ops.some(function (o) { return o.k === 'x' && o.id === 'act.mob' && o.on; }), 'unticked box not marked');
});
t('title block follows an edited CSJ', function () {
  var p = proj({}); p.summary = { variant: '', v: { csj: '1234-56-789' } }; var v = S.values(p).val; assert.strictEqual(v['t.cont'], '1234'); assert.strictEqual(v['t.job'], '789');
  p.summary.v['t.job'] = '000'; assert.strictEqual(S.values(p).val['t.job'], '000', 'explicit title-block edit wins');
});

t('plan: ops land on the right pages and pre-checked boxes get redrawn', function () {
  var p = proj({ acres: '12', csj: '0912-72-345' }); var pl = S.plan(p); assert.strictEqual(pl.variant, 'B');
  var csj = pl.ops.filter(function (o) { return o.id === 'csj'; })[0]; assert(csj && csj.p === 1 && csj.text === '0912-72-345');
  var pre = pl.ops.filter(function (o) { return o.k === 'x' && o.pre; }); assert(pre.length >= 10, 'pre-checked boxes redrawn: ' + pre.length);
  var nsdOn = pl.ops.filter(function (o) { return o.id === 'nsd.hydrant'; })[0]; assert(nsdOn && nsdOn.pre === true, 'template pre-checked boxes are always redrawn');
  p.summary = { variant: '', v: { 'nsd.hydrant': false } }; var nsdOff = S.plan(p).ops.filter(function (o) { return o.id === 'nsd.hydrant'; })[0]; assert(nsdOff && nsdOff.on === false && nsdOff.pre === true, 'unticked pre-checked box is whited out, not marked');
  var cont = pl.ops.filter(function (o) { return o.id === 't.cont.1'; })[0]; assert(cont && cont.p === 1); assert(pl.ops.some(function (o) { return o.id === 't.cont.2' && o.p === 2; }));
});
t('plan: buffer statement wipes the table and prints the statement', function () {
  var p = proj({ acres: '3' }); p.summary = { variant: '', v: { 'buf.text': true, 'buf.why': 'No surface waters present, vegetated buffer zones are not planned.' } };
  var ops = S.plan(p).ops; assert(ops.some(function (o) { return o.k === 'wipe' && o.id === 'buf'; })); assert(ops.some(function (o) { return o.k === 'box' && o.id === 'buf.why'; }));
  assert(ops.filter(function (o) { return o.k === 'wipe' && o.id === 'buf'; })[0].y0 < L.B.fields.buf.rows[0][0], 'wipe starts at the table top (covers the header)');
});
t('plan: Other line text auto-ticks its box', function () {
  var p = proj({ acres: '3' }); p.summary = { variant: '', v: { 'act.o1': 'Install storm sewer' } };
  var ops = S.plan(p).ops; assert(ops.some(function (o) { return o.id === 'act.o1.c' && o.on; })); assert(ops.some(function (o) { return o.id === 'act.o1' && o.text === 'Install storm sewer'; }));
});
t('plan: less-than-1-acre variant uses the A layout only', function () {
  var p = proj({ acres: '0.5' }); var pl = S.plan(p); assert.strictEqual(pl.variant, 'A');
  pl.ops.forEach(function (o) { if (o.id) assert(!/^(trap|basin|nf|seal|ms4)/.test(o.id) || /^ms4$/.test(o.id) === false, 'no B-only field ' + o.id); });
  assert(!pl.ops.some(function (o) { return /^(basin|trap|nf\.|seal)/.test(o.id || ''); }));
});

t('fitLines wraps, shrinks, and reports truncation', function () {
  var m = S.approxMeasure, f = S.fitLines(m, 'one two three four five six', [60], 5, 8, 6);
  assert(f.lines.length >= 2 && !f.truncated); f.lines.forEach(function (l) { assert(m(l, f.size) <= 60 + 1e-6, l); });
  var g = S.fitLines(m, new Array(80).join('word '), [50], 2, 8, 6); assert(g.truncated && g.lines.length === 2 && /\.\.\.$/.test(g.lines[1]));
  assert.strictEqual(S.fitLines(m, '', [50], 1, 8, 6).lines.length, 0);
  var h = S.fitLines(m, 'Supercalifragilisticexpialidocious', [40], 3, 8, 6); assert(h.lines.length >= 2, 'long words break by characters');
});

t('checks flag real problems', function () {
  var p = proj({ acres: '12', openAcres: '11' }); p.summary = { variant: '', v: { 'basin.notreq': true, 'rt.noi': false } };
  var msgs = S.checks(p).map(function (c) { return c.msg; }).join('\n');
  assert(/Not required/.test(msgs) && /NOI/.test(msgs), msgs);
  var q = proj({ acres: '3' }); q.summary = { variant: '', v: { totalArea: '2', distArea: '3' } }; assert(S.checks(q).some(function (c) { return /more than the total project area/.test(c.msg); }));
  var r = proj({ acres: '3' }); r.summary = { variant: 'A', v: {} }; assert(S.checks(r).some(function (c) { return /less-than-1-acre sheet/.test(c.msg); }));
});

t('export: markdown and json carry entries and no invented data', function () {
  var p = proj({ acres: '3', csj: '0912-72-345' }); var md = S.toMarkdown(p), js = JSON.parse(S.toJson(p));
  assert(/## 1\.1 Project control section job/.test(md)); assert(/CSJ: 0912-72-345/.test(md)); assert(/\[x\] Mobilization/.test(md)); assert(/\(blank\)/.test(md));
  assert.strictEqual(js.kind, 'swp3-summary-sheet'); assert.strictEqual(js.sheet.variant, 'B'); assert.strictEqual(js.values.csj, '0912-72-345'); assert(/^[0-9a-f]{64}$/.test(js.sheet.sha256));
  assert(!('totalArea' in js.values));
});

t('model: summary is saved, sanitized and restored', function () {
  var p = M.newProject({ name: 'X' }); assert.deepStrictEqual(p.summary, { variant: '', v: {} });
  var dirty = JSON.parse(JSON.stringify(p)); dirty.summary = { variant: 'Z', v: { ok: 'x', 'bad key!': 'y', n: 5, b: true, long: new Array(2000).join('a'), '__proto__': 'p' } };
  var s = M.sanitizeProject(dirty); assert.strictEqual(s.summary.variant, ''); assert.strictEqual(s.summary.v.ok, 'x'); assert.strictEqual(s.summary.v.b, true);
  assert(!('bad key!' in s.summary.v) && !('n' in s.summary.v)); assert(s.summary.v.long.length <= 1200);
  var st = { projects: [], activeId: null }; dirty.summary = { variant: 'A', v: { csj: '0912-72-345' } }; var r = M.restore(M.backup({ projects: [dirty], activeId: dirty.id }), st);
  assert(r.ok); assert.strictEqual(st.projects[0].summary.variant, 'A'); assert.strictEqual(st.projects[0].summary.v.csj, '0912-72-345');
  assert.deepStrictEqual(M.sanitizeProject({ form: {} }).summary, { variant: '', v: {} }, 'old projects without a summary load fine');
});

t('sheets metadata', function () {
  ['A', 'B'].forEach(function (v) { var s = S.SHEETS[v]; assert(/^[0-9a-f]{64}$/.test(s.sha256)); assert(/^https:\/\/ftp\.txdot\.gov\//.test(s.url)); assert.strictEqual(L[v].file, s.file); });
  assert.strictEqual(S.BUNDLED, false, 'TxDOT PDFs are not redistributed unless permission is confirmed');
});

/* ---- real PDF fill (needs the official PDFs; skipped when absent) ---- */
var dir = [process.env.SWP3_PDF_DIR, '/workspace/swp3src/ss'].filter(Boolean).filter(function (d) { return fs.existsSync(path.join(d, 'swp3b23.pdf')) && fs.existsSync(path.join(d, 'swp3a23.pdf')); })[0];
var pdfDone = 0;
if (!dir) console.log('PDF render test skipped (set SWP3_PDF_DIR to a folder holding swp3a23.pdf and swp3b23.pdf).');
else {
  var W = require('./summary-pdf.js'), PL = require('./vendor/pdf-lib.min.js'), pending = [];
  ['A', 'B'].forEach(function (v) {
    var p = proj({ acres: v === 'A' ? '0.8' : '12', csj: '0912-72-345', county: 'Harris', nature: 'Widen FM 1960 and replace culverts', highway: 'FM 1960', limits: 'From: Atascocita Rd to Humble Westfield Rd' });
    p.summary = { variant: v, v: { 'act.o1': 'Install storm sewer', 'ec.tseed.T': true, 'soils.0.0': 'Beaumont clay', 'perm.0.0': new Array(60).join('very long text ') } };
    var src = fs.readFileSync(path.join(dir, S.SHEETS[v].file));
    pending.push(W.sha256(src).then(function (h) { assert.strictEqual(h, S.SHEETS[v].sha256, 'official file hash ' + v); return W.build(PL, src, S.plan(p)); }).then(function (r) {
      var out = path.join(require('os').tmpdir(), 'swp3-test-' + v + '.pdf'); fs.writeFileSync(out, r.bytes);
      assert(r.warnings.some(function (w) { return /perm\.0\.0/.test(w.id); }), 'overflow is reported');
      if (cp.spawnSync('pdfinfo', [out]).status === 0) {
        var info = cp.spawnSync('pdfinfo', [out]).stdout.toString(); assert(/Pages:\s+2/.test(info), 'two pages');
        var tx = cp.spawnSync('pdftotext', ['-layout', out, '-']).stdout.toString();
        ['0912-72-345', 'Atascocita Rd', 'Humble Westfield Rd', 'Widen FM 1960 and replace culverts', 'Install storm sewer', 'Beaumont clay', 'Harris', 'FM 1960'].forEach(function (s) { assert(tx.indexOf(s) >= 0, v + ': text missing from filled PDF: ' + s); });
      }
      return W.build(PL, null, S.plan(p)).then(function (o) { assert(o.bytes.length < 60000, 'values-only PDF is small (no TxDOT artwork)'); pdfDone++; });
    }));
  });
  Promise.all(pending).then(function () { n++; console.log('summary tests ok (' + n + ' checks, PDF fill ' + pdfDone + '/2)'); }).catch(function (e) { console.error('FAIL: pdf fill\n ' + (e && e.stack || e)); process.exit(1); });
}
if (!dir) console.log('summary tests ok (' + n + ' checks)');
