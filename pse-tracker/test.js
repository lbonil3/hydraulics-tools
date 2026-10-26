const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('./defaults.js');
const M = require('./model.js');

// --- defaults: every item has a known source (or is explicitly assumed) and a valid basis
D.ITEMS.forEach(function (it) {
  assert.ok(['initial', 'detailed', 'final', 'sealed', 'rtl'].includes(it[0]), 'stage key ' + it[2]);
  assert.ok(['S', 'P', 'A'].includes(it[4]), 'basis ' + it[2]);
  if (it[4] !== 'A') assert.ok(D.SOURCES[it[3]] && /^https:\/\/www\.txdot\.gov\//.test(D.SOURCES[it[3]].url), 'source ' + it[2]);
});
assert.strictEqual(D.buildDefaultStages().length, 5);

// --- project, stats
const p = M.newProject({ name: 'FM 1 test', csj: '0000-00-000' });
assert.strictEqual(p.stages.length, 5);
assert.strictEqual(p.estimate.contingencyPct, M.DEFAULT_CONTINGENCY_PCT);
let st = M.stageStats(p.stages[0], '2026-10-25');
assert.strictEqual(st.done, 0);
assert.strictEqual(st.ready, false);
p.stages[0].items.forEach(function (i) { i.status = 'done'; });
st = M.stageStats(p.stages[0]);
assert.strictEqual(st.ready, true);
assert.strictEqual(st.pct, 100);
// N/A is excluded from counts
p.stages[1].items[0].status = 'na';
st = M.stageStats(p.stages[1]);
assert.strictEqual(st.total, p.stages[1].items.length - 1);
// overdue
const it = p.stages[1].items[1];
it.due = '2026-01-01'; it.status = 'doing';
assert.strictEqual(M.isOverdue(it, '2026-10-25'), true);
it.status = 'done';
assert.strictEqual(M.isOverdue(it, '2026-10-25'), false);
// overall.next is first non-ready stage
p.stages[1].items.forEach(function (i) { i.status = 'done'; });
const ov = M.overall(p);
assert.strictEqual(ov.next.stage.id, p.stages[2].id);
assert.strictEqual(ov.readyStages, 2);
assert.strictEqual(M.daysUntil('2026-11-01', '2026-10-25'), 7);

// --- pricing: Houston first, statewide fallback, manual override, none
const rows = [
  { bid_code: '464-6001', description: 'RC PIPE (CL III)(12 IN)', unit: 'LF', houston_avg: 100, houston_n: 4, statewide_avg: 120, statewide_n: 50 },
  { bid_code: '464-6002', description: 'RC PIPE (CL III)(15 IN)', unit: 'LF', houston_avg: null, houston_n: 0, statewide_avg: 150, statewide_n: 20 },
  { bid_code: '999-0001', description: 'NO DATA', unit: 'EA', houston_avg: null, houston_n: 0, statewide_avg: null, statewide_n: 0 }
];
const idx = M.indexRows(rows);
let r = M.priceLine({ code: '464-6001', qty: 10 }, idx);
assert.deepStrictEqual([r.source, r.price, r.total, r.n], ['Houston', 100, 1000, 4]);
r = M.priceLine({ code: '464-6002', qty: 10 }, idx);
assert.deepStrictEqual([r.source, r.price, r.total], ['Statewide', 150, 1500]);
r = M.priceLine({ code: '464-6002', qty: 10, manualPrice: 175.5 }, idx);
assert.deepStrictEqual([r.source, r.price, r.total], ['Manual', 175.5, 1755]);
r = M.priceLine({ code: '999-0001', qty: 3 }, idx);
assert.strictEqual(r.unpriced, true); assert.strictEqual(r.total, null);
r = M.priceLine({ code: 'SPECIAL', qty: 2, manualPrice: 10 }, idx);
assert.strictEqual(r.inData, false); assert.strictEqual(r.total, 20);
r = M.priceLine({ code: '464-6001', qty: '' }, idx);
assert.strictEqual(r.total, null); assert.strictEqual(r.noQty, true);

// --- totals with contingency
const est = { contingencyPct: 10, lines: [
  { id: 'a', code: '464-6001', qty: 10 }, { id: 'b', code: '464-6002', qty: 10 }, { id: 'c', code: '999-0001', qty: 5 }, { id: 'd', code: 'X', qty: 1, manualPrice: 50 } ] };
let t = M.estimateTotals(est, idx);
assert.strictEqual(t.subtotal, 1000 + 1500 + 50);
assert.strictEqual(t.unpriced, 1);
assert.strictEqual(t.contingency, 255);
assert.strictEqual(t.total, 2805);
assert.deepStrictEqual(t.bySource, { Houston: 1000, Statewide: 1500, Manual: 50 });
est.contingencyPct = 'abc'; assert.strictEqual(M.estimateTotals(est, idx).contingency, 0);

// --- search
assert.strictEqual(M.searchRows(rows, '464 15').length, 1);
assert.strictEqual(M.searchRows(rows, 'rc pipe').length, 2);
assert.strictEqual(M.searchRows(rows, '').length, 0);
assert.strictEqual(M.rowsForItem(rows, '464').length, 2);

// --- CSV escaping and formula-injection guard
assert.strictEqual(M.csvCell('a,b'), '"a,b"');
assert.strictEqual(M.csvCell('say "hi"'), '"say ""hi"""');
assert.strictEqual(M.csvCell('=1+1'), "'=1+1");
assert.strictEqual(M.csvCell(-5), '-5');
const proj = M.newProject({ name: 'T, "q"' });
proj.estimate.lines.push({ id: 'a', code: '464-6001', desc: 'RC PIPE', unit: 'LF', qty: 10, manualPrice: '', note: '' });
const ccsv = M.checklistCsv(proj);
assert.ok(ccsv.split('\r\n')[0].startsWith('Project,CSJ'));
assert.strictEqual(ccsv.trim().split('\r\n').length, 1 + D.ITEMS.length);
const ecsv = M.estimateCsv(proj, idx);
assert.ok(/464-6001,RC PIPE,LF,10,100,Houston,4,1000/.test(ecsv));
assert.ok(/Total with contingency/.test(ecsv));

// --- backup / restore round trip, merge by id, rejects foreign files
const state = { projects: [M.newProject({ name: 'A' })], activeId: null };
state.activeId = state.projects[0].id;
state.projects[0].estimate.lines.push({ id: 'z', code: '1', desc: 'd', unit: 'EA', qty: 2, manualPrice: 3, note: '' });
const json = JSON.stringify(M.backup(state));
const other = { projects: [M.newProject({ name: 'B' })], activeId: null }; other.activeId = other.projects[0].id;
assert.strictEqual(M.restore(other, JSON.parse(json)), 1);
assert.strictEqual(other.projects.length, 2);
assert.strictEqual(other.projects[1].estimate.lines[0].manualPrice, 3);
assert.strictEqual(M.restore(other, JSON.parse(json)), 1);
assert.strictEqual(other.projects.length, 2); // same id replaced, not duplicated
assert.throws(function () { M.restore(other, { app: 'Culvert Studio', projects: [] }); });
// sanitize bad status/dates
const sp = M.sanitizeProject({ name: 'x', stages: [{ name: 's', items: [{ title: 't', status: 'weird', due: 'nope', basis: 'Q', src: 'nope' }] }] });
assert.strictEqual(sp.stages[0].items[0].status, 'todo');
assert.strictEqual(sp.stages[0].items[0].due, '');
assert.strictEqual(sp.stages[0].items[0].basis, 'A');

// --- real bid-cost data: reuse works and common drainage codes resolve
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bid-cost', 'prices.json'), 'utf8'));
const ridx = M.indexRows(real.rows);
const rr = ridx['464-6001'];
assert.ok(rr, '464-6001 present');
const pr = M.priceLine({ code: '464-6001', qty: 100 }, ridx);
assert.ok(pr.price > 0 && (pr.source === 'Houston' || pr.source === 'Statewide'));
console.log('ok');
