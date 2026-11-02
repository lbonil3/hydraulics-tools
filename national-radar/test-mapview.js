// National Radar map helpers: scaling, callout layout, legend. Run: node national-radar/test-mapview.js (also run by test.js)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const V = require('./mapview.js');

// ---- aggregate: counts, how many carry a value, sum of stated values, records with no state kept apart
const recs = [{ state: 'TX', v: 10 }, { state: 'TX', v: 0 }, { state: 'DC', v: 5 }, { state: '', v: 7 }, { v: 0 }];
const agg = V.aggregate(recs, (r) => r.v);
assert.deepStrictEqual(agg.by.TX, { n: 2, nv: 1, v: 10 });
assert.deepStrictEqual(agg.none, { n: 2, nv: 1, v: 7 }, 'no-state records are counted for the Nationwide chip, not put on a state');
assert.strictEqual(agg.maxV, 10); assert.strictEqual(agg.maxN, 2);

// ---- count scale: sqrt, no cap (the old map capped at 8, so 8 and 16 looked the same)
const r1 = V.radiusPx(1, 16, false), r8 = V.radiusPx(8, 16, false), r16 = V.radiusPx(16, 16, false), s = V.sizes(false);
assert.ok(r1 < r8 && r8 < r16, 'count scale is monotonic');
assert.ok(r16 - r8 > 5, '8 and 16 records are visibly different sizes');
assert.strictEqual(r16, s.rMax); assert.strictEqual(V.radiusPx(0, 16, false), s.rMin);
assert.ok(Math.abs((r8 - s.rMin) / (r16 - s.rMin) - Math.sqrt(0.5)) < 1e-9, 'area-true sqrt scale');
// phone bubbles stay readable but small; tap targets are padded separately
const ph = V.sizes(true); assert.ok(ph.rMax <= 24 && ph.hit >= 22, 'phone hit radius >= 22px (44px target)');
// large desktop maps scale bubbles up, but never past 1.45x
assert.strictEqual(V.sizes(false, 0.5).rMax, 36); assert.ok(Math.abs(V.sizes(false, 5).rMax - 36 * 1.45) < 1e-9);

// ---- per-tab encoding
assert.strictEqual(V.encodingFor('pse', 'advance').kind, 'count', 'advance notices state no fee -> count scale');
assert.strictEqual(V.encodingFor('pse', 'all').kind, 'value');
assert.ok(/NOT fees/.test(V.encodingFor('pse', 'db').valueWord), 'design-build values are labelled as not fees');
assert.ok(/NOT fees/.test(V.encodingFor('pse', 'pipeline').valueWord));
assert.strictEqual(V.encodingFor('road', 'nofee').kind, 'count');
// a state whose records carry no value falls back to the count scale even in a value tab
const enc = V.encodingFor('pse', 'db'), a2 = V.aggregate([{ state: 'TX', v: 100 }, { state: 'NM', v: 0 }, { state: 'NM', v: 0 }], (r) => r.v);
assert.strictEqual(V.bubbleFor(a2.by.TX, a2, enc, false).kind, 'value');
assert.strictEqual(V.bubbleFor(a2.by.NM, a2, enc, false).kind, 'count');

// ---- callouts: real us-geo centroids for the crowded Northeast
const geo = fs.readFileSync(path.join(__dirname, 'us-geo.js'), 'utf8');
const G = new Function('window', geo + '\nreturn window.US_GEO;')({});
assert.ok(G && G.states && G.states.DC && G.states.MD, 'us-geo exposes state centroids');
const it = (st, r) => ({ st, cx: G.states[st].cx, cy: G.states[st].cy, r });
const ovl = (p, q, r1, r2) => Math.hypot(p.x - q.x, p.y - q.y) < r1 + r2;
let items = [it('DC', 20), it('MD', 14), it('VA', 25), it('NY', 25)];
let co = V.layoutCallouts(items, { right: V.VIEW.w - 3, gap: 3 });
assert.ok(co.DC && co.MD, 'DC and MD get callouts');
assert.ok(!co.VA && !co.NY, 'big states stay in place');
assert.ok(!ovl(co.DC, co.MD, 20, 14), 'DC no longer covers MD');
assert.ok(co.DC.x + 20 <= V.VIEW.w && co.MD.x + 20 <= V.VIEW.w, 'callouts stay inside the view');
assert.ok(co.DC.x > 975 - 40, 'callouts sit in the Atlantic column');
// all seven + overflow -> two columns, still no overlaps, all inside the view
items = V.CALLOUT.map((st) => it(st, 45)); // 7 x 90 > 610: one column cannot hold them
co = V.layoutCallouts(items, { right: V.VIEW.w - 3, gap: 3 });
assert.strictEqual(Object.keys(co).length, 7);
const xs = new Set(Object.values(co).map((p) => p.x.toFixed(1))); assert.strictEqual(xs.size, 2, 'overflow splits into two columns');
const ks = Object.keys(co);
ks.forEach((k, i) => { const p = co[k]; assert.ok(p.y - 45 >= 0 && p.y + 45 <= V.VIEW.h && p.x + 45 <= V.VIEW.w, k + ' inside view'); ks.slice(i + 1).forEach((q) => assert.ok(!ovl(p, co[q], 45, 45), k + ' vs ' + q + ' overlap')); });
// VT / NH only when they would collide
co = V.layoutCallouts([it('VT', 8), it('NH', 8), it('NY', 10), it('MA', 10)], {}); assert.ok(!co.VT && !co.NH, 'small VT/NH stay on the map');
co = V.layoutCallouts([it('VT', 30), it('NH', 30), it('MA', 20)], {}); assert.ok(co.VT && co.NH, 'VT/NH move out when they collide');
assert.deepStrictEqual(V.layoutCallouts([it('TX', 30)], {}), {});

// ---- legend: per tab, and no pin entry while nothing has coordinates
const lg = (e, i) => V.legendFor(e, i).map((x) => x.cls);
assert.deepStrictEqual(lg(V.encodingFor('pse', 'advance'), { hasValue: false, hasCount: true, shade: true, callouts: 2, pinned: 0 }), ['cnt', 'shd', 'co']);
assert.ok(!lg(V.encodingFor('pse', 'all'), { hasValue: true, pinned: 0 }).includes('pin'), 'no pin legend with 0 pins');
assert.ok(lg(V.encodingFor('pse', 'all'), { hasValue: true, pinned: 3 }).includes('pin'));
assert.ok(V.legendFor(V.encodingFor('pse', 'advance'), { hasCount: true }).every((x) => !/sum/i.test(x.text)), 'advance legend never mentions a sum');
// tooltip
const tip = V.tooltipLines('Texas', { n: 3, nv: 2, v: 1500000 }, V.encodingFor('pse', 'all'), (v) => '$' + v);
assert.deepStrictEqual(tip, ['Texas', '3 records', 'Sum of stated fees: $1500000', '2 of 3 with a stated value']);
assert.strictEqual(V.compactMoney(33060000), '$33.1M'); assert.strictEqual(V.compactMoney(2810000000), '$2.8B');
console.log('national-radar map helper tests passed');
