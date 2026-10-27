const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('./estimator.js');
const C = require('./charts.js');
const dir = __dirname;
let passed = 0;
function t(name, fn) { fn(); passed++; }

// ---- statistics ----
t('quantile/median', () => {
  assert.strictEqual(E.quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.strictEqual(E.median([5, 1, 3]), 3);
  assert.strictEqual(E.quantile([7], 0.9), 7);
});
t('t p-values', () => {
  assert(Math.abs(E.tPValue(2.228, 10) - 0.05) < 0.001);
  assert(Math.abs(E.tPValue(1.812, 10) - 0.1) < 0.001);
});
t('linreg exact line', () => {
  const r = E.linreg([0, 1, 2, 3], [1, 3, 5, 7]);
  assert(Math.abs(r.slope - 2) < 1e-12 && Math.abs(r.r2 - 1) < 1e-12 && r.p < 1e-6);
});
t('log-log significance needs n>=8', () => {
  const obs = [10, 20, 40, 80, 160].map((q) => [q, 100 * Math.pow(q, -0.3), null, '2025-01-01', 0, 0, 'p' + q]);
  obs[1][1] *= 1.05;
  assert.strictEqual(E.logLogFit(obs).significant, false);
});

// ---- real data ----
const ix = JSON.parse(fs.readFileSync(path.join(dir, 'data/index.json'), 'utf8'));
const ctx = { districts: ix.districts, counties: ix.counties, pooled_slope: ix.pooled_slope, data_date_max: ix.meta.let_date_max };
const entry = (code) => {
  const sh = JSON.parse(fs.readFileSync(path.join(dir, 'data/items', code.split('-')[0] + '.json'), 'utf8'));
  return Object.assign({ code: code }, sh.codes[code]);
};
t('index meta', () => {
  assert.strictEqual(ix.meta.let_date_min, '2024-09-06');
  assert(ix.meta.codes > 10000 && ix.index.length === ix.meta.codes);
  assert(ix.pooled_slope.slope < 0 && ix.pooled_slope.n > 100);
});
t('shard stats match observations', () => {
  const e = entry('464-7005');
  const s = E.summarize(e.obs);
  assert.deepStrictEqual(s, e.stats.statewide);
  assert(s.p10 <= s.p25 && s.p25 <= s.median && s.median <= s.p75 && s.p75 <= s.p90);
});

// FTB at 12,000 LF — largest job on record is 580 LF.
const ftbI = E.estimate(entry('5002-7001'), 12000, ctx, {});
const ftbR = E.estimate(entry('5002-7002'), 12000, ctx, {});
t('FTB install 12,000 LF', () => {
  assert.strictEqual(ftbI.scope, 'statewide'); // Houston has 1 bid
  assert.strictEqual(ftbI.stats.qty_max, 580);
  assert(ftbI.extrapolated && ftbI.confidence === 'Low');
  assert(ftbI.mid >= 33 && ftbI.mid <= 45, 'install mid ' + ftbI.mid);
  assert(ftbI.low < ftbI.mid && ftbI.high > ftbI.mid);
  assert.strictEqual(ftbI.slopeSource, 'grouped');
  assert(ftbI.comments.some((c) => /grouped price-vs-quantity slope .* this code .* Item 5002 \(LF\) family .* all TxDOT items/.test(c)));
  assert(ftbI.warnings.some((w) => /Extrapolated beyond data/.test(w)));
  assert(/580 LF, Smith County/.test(ftbI.sentence) && /extrapolated/.test(ftbI.sentence));
  assert(/^Unit price based on 2024–2026 TxDOT bid tabulations/.test(ftbI.sentence));
});
t('FTB remove 12,000 LF', () => {
  assert(ftbR.extrapolated && ftbR.confidence === 'Low');
  assert(ftbR.mid >= 6 && ftbR.mid <= 10.5, 'remove mid ' + ftbR.mid);
  // its own fit rises with size (driven by one unbalanced bid) -> not used upward beyond data
  assert.strictEqual(ftbR.slopeSource, 'global');
  assert(/\(assumed\)/.test(ftbR.sentence));
  assert(ftbR.mid <= ftbR.base);
});
t('sentence numbers come from data', () => {
  const nums = (ftbI.sentence.match(/\$[\d,.]+/g) || []).map((s) => Number(s.replace(/[$,]/g, '')));
  const allowed = new Set([ftbI.mid, ftbI.low, ftbI.high].concat(ftbI.obs.map((o) => o[1])).concat(ftbI.obs.map((o) => o[8])).map((x) => Math.round(x * 100) / 100));
  nums.forEach((n) => assert(allowed.has(n), 'unexpected number ' + n));
});
t('well-populated code inside data range', () => {
  const r = E.estimate(entry('432-7001'), 300, ctx, {});
  assert.strictEqual(r.scope, 'houston');
  assert(!r.extrapolated && r.confidence !== 'Low');
  assert(r.mid >= r.p10 && r.mid <= r.p90);
});
t('n=1 code', () => {
  const r = E.estimate(entry('5033-7001'), 200, ctx, {});
  assert.strictEqual(r.stats.n, 1);
  assert.strictEqual(r.confidence, 'Low');
  assert.strictEqual(r.mid, 177);
  assert(r.low <= 177 * 0.6 + 0.01 && r.high >= 177 * 1.5 - 0.01);
  assert(r.warnings.some((w) => /Small sample/.test(w)));
});
t('never above p90 when extrapolating down', () => {
  const r = E.estimate(entry('464-7005'), 1, ctx, {});
  assert(r.extrapolated && r.mid <= r.p90 + 0.01);
});
t('grouped slope shrinkage', () => {
  assert.strictEqual(E.shrink(-0.2, 10, 0, 10), -0.1);
  assert.strictEqual(E.shrink(null, 0, -0.19, 10), -0.19);
  const g = entry('432-7001').slope;
  assert(g.code_n > 100 && Math.abs(g.final - g.code) < Math.abs(g.final - g.global));
  assert(Math.abs(ix.global_within_slope) > 0 && ix.shrink_k === 10);
});
t('escalation uses real NHCCI values and labels user %/yr', () => {
  const nh = JSON.parse(fs.readFileSync(path.join(dir, 'data/nhcci.json'), 'utf8'));
  const v = Object.fromEntries(nh.rows.map((r) => [r[0], r[2]]));
  const last = nh.rows[nh.rows.length - 1][0];
  const e1 = E.escalation('2025-08-01', '2025-11-15', 0, nh);
  assert(Math.abs(e1.factor - v['2025 Q4'] / v['2025 Q3']) < 1e-12 && e1.userYears === 0);
  const e2 = E.escalation('2025-08-01', '2028-01-15', 3, nh);
  assert.strictEqual(e2.to, last);
  assert(e2.userYears > 1 && Math.abs(e2.factor - (v[last] / v['2025 Q3']) * Math.pow(1.03, e2.userYears)) < 1e-12);
  const c2 = Object.assign({}, ctx, { nhcci: nh });
  const r = E.estimate(entry('432-7001'), 300, c2, { letDate: '2028-01-15', annualPct: 3 });
  const r0 = E.estimate(entry('432-7001'), 300, c2, {});
  assert(r.escalation && Math.abs(r.mid - E.roundPrice(r0.adjusted * r.escalation.factor)) < 0.01);
  assert(r.comments.some((c) => /FHWA NHCCI .* 3%\/yr \(user input, assumed\)/.test(c)));
  assert(/escalated .* by FHWA NHCCI and 3%\/yr \(assumed\)/.test(r.sentence));
});
t('scope forcing and bad input', () => {
  assert.strictEqual(E.estimate(entry('5002-7001'), 100, ctx, { scope: 'houston' }).scope, 'houston');
  assert.strictEqual(E.estimate(entry('5033-7001'), 100, ctx, { scope: 'houston' }).scope, 'statewide');
  assert.strictEqual(E.estimate(entry('5002-7001'), 0, ctx, {}).ok, false);
});

// ---- possibly-unbalanced flags (flagged, never removed) ----
const F = require('./flags.js');
t('flag rules: FTB 580 LF job A00027293 ($47 install / $47 remove) is a pair flag', () => {
  const rows = [];
  const pairs = [[580, 47, 47, 'A00027293'], [228, 60, 20, 'p1'], [200, 50, 10, 'p2'], [175, 50, 5, 'p3'], [136, 100, 10, 'p4'], [100, 66, 22, 'p5']];
  pairs.forEach(([q, i, r, pid]) => {
    rows.push({ key: pid + 'i', project: pid, code: '5002-7001', desc: 'INSTALL FTB', qty: q, price: i, othersN: 0, codeMedian: 55 });
    rows.push({ key: pid + 'r', project: pid, code: '5002-7002', desc: 'REMOVE FTB', qty: q, price: r, othersN: 0, codeMedian: 10 });
  });
  const res = F.computeFlags(rows);
  assert.strictEqual(res.flags.get('A00027293i').flags & F.RULES.PAIR, F.RULES.PAIR);
  assert.strictEqual(res.flags.get('A00027293r').partner, 47);
  assert(!res.flags.has('p2i') && !res.flags.has('p2r'));
  assert.strictEqual(res.pairTypes['5002-7001|5002-7002'].n, 6);
});
t('flag rules: vs other bidders and placeholder', () => {
  const base = { project: 'x', code: '432-7001', desc: 'RIPRAP', qty: 10, codeMedian: 600 };
  const r = F.computeFlags([
    Object.assign({ key: 'a', price: 100, othersMedian: 600, othersN: 4 }, base),  // 17% -> flag
    Object.assign({ key: 'b', price: 500, othersMedian: 600, othersN: 4 }, base),  // ok
    Object.assign({ key: 'c', price: 100, othersMedian: 600, othersN: 1 }, base),  // too few others
    Object.assign({ key: 'd', price: 0.01, othersN: 0 }, base),                     // placeholder
    Object.assign({ key: 'e', price: 1, othersN: 0 }, base, { codeMedian: 10 })      // $1 on a $10 item: not flagged
  ]).flags;
  assert.strictEqual(r.get('a').flags, F.RULES.VS_OTHERS);
  assert(!r.has('b') && !r.has('c') && !r.has('e'));
  assert.strictEqual(r.get('d').flags, F.RULES.PLACEHOLDER);
  assert.deepStrictEqual(F.describe(3), ['install/remove pair out of line', 'far from the other bidders on the job']);
});
t('stored data flags the real 580 LF FTB job and keeps it in the stats', () => {
  const sh = JSON.parse(fs.readFileSync(path.join(dir, 'data/items/5002.json'), 'utf8'));
  ['5002-7001', '5002-7002'].forEach((c) => {
    const o = sh.codes[c].obs.find((x) => sh.pids[x[6]] === 'A00027293' && x[0] === 580);
    assert(o && (o[9] & 1) && o[1] === 47 && o[10] === 47, c);
    assert.strictEqual(sh.codes[c].stats.statewide.n, sh.codes[c].obs.length);
  });
});
t('flags are information only: suggested price unchanged', () => {
  assert.strictEqual(ftbR.mid, 7.5);
  const strip = (e) => Object.assign({}, e, { obs: e.obs.map((o) => o.slice(0, 9).concat([0, null])) });
  assert.strictEqual(E.estimate(strip(entry('5002-7001')), 12000, ctx, {}).mid, ftbI.mid);
  assert(ftbI.comments.some((c) => /580 LF\) low bid of \$47\.00 install \/ \$47\.00 remove looks unbalanced \(remove priced equal to install; combined \$94\.00\/LF/.test(c)));
  assert(ftbI.warnings.some((w) => /similar-size bids used for the base price is flagged/.test(w)));
  assert(/\$47\.00\/LF \(flagged as possibly unbalanced\)/.test(ftbI.sentence));
  assert(ftbI.flagStats.without.median > 0 && ftbI.flagStats.n === 2);
  const r = E.estimate(entry('464-7005'), 500, ctx, {});
  assert(!/flagged/.test(r.sentence) || r.obs.slice().sort((a, b) => b[0] - a[0])[0][9] > 0);
});

// ---- search, query, export ----
t('search', () => {
  assert.strictEqual(E.search(ix.index, '5002-7001')[0][0], '5002-7001');
  assert(E.search(ix.index, 'ftb').some((r) => r[0] === '5002-7002'));
  assert(E.search(ix.index, 'rc pipe 24').length > 0);
});
t('parseQuery', () => {
  assert.deepStrictEqual(E.parseQuery('?code=5002-7001&qty=12000'), { code: '5002-7001', qty: 12000, scope: null });
  assert.strictEqual(E.parseQuery('?code=bad').code, null);
});
t('TSV / CSV export', () => {
  const rows = [E.lineRow({ code: '5002-7001', qty: 12000 }, ftbI), E.lineRow({ code: '5002-7002', qty: 12000 }, ftbR)];
  const tsv = E.toTSV(rows).split('\n');
  assert.strictEqual(tsv.length, 4);
  assert(tsv[0].startsWith('Bid code\tDescription'));
  assert(tsv.every((l) => l.split('\t').length === 11));
  const total = Number(tsv[3].split('\t')[7]);
  assert(Math.abs(total - (ftbI.mid + ftbR.mid) * 12000) < 0.01);
  const csv = E.toCSV(rows);
  assert(/"Unit price based on/.test(csv) || /,Unit price based on/.test(csv));
});
t('charts are self-contained SVG', () => {
  const s = C.scatter(ftbI, ix.districts.indexOf('Houston')) + C.boxplot(ftbI);
  assert(/^<svg/.test(s) && !/https?:\/\/(?!www\.w3)/.test(s) && !/NaN|undefined/.test(s));
  const nf = ftbI.obs.filter((o) => o[9] > 0).length;
  assert.strictEqual((s.match(/<circle/g) || []).length, (ftbI.obs.length - nf) * 2);
  assert.strictEqual((s.match(/class="pt flag"/g) || []).length, nf * 2);
});

// ---- page wiring ----
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
t('page', () => {
  assert(/flags\.js/.test(html) && /flagged, never removed/.test(html));
  ['codeSearch', 'qty', 'scope', 'addBtn', 'copyTable', 'downloadCsv', 'methodTitle'].forEach((id) => assert(html.includes('id="' + id + '"'), id));
  assert(/Sources &amp; method/.test(html) && /Planning-level/.test(html));
  assert(!/<script[^>]+src="https?:/.test(html));
});
t('data size', () => {
  const files = fs.readdirSync(path.join(dir, 'data/items'));
  const max = Math.max.apply(null, files.map((f) => fs.statSync(path.join(dir, 'data/items', f)).size));
  assert(max < 2e6, 'largest shard ' + max);
});
console.log('ok (' + passed + ' tests)');
