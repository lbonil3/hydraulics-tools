#!/usr/bin/env node
/**
 * Build the lazy-loaded estimator data from the raw pull (fetch-bids.js):
 *   bid-estimator/data/index.json        search index + lookups + pooled slope + meta
 *   bid-estimator/data/items/<item>.json one shard per spec item: per-code observations + stats
 *
 * Usage: node bid-estimator/scripts/build-data.js [raw=/tmp/estimator-raw/lowbid.ndjson]
 */
const fs = require('fs');
const path = require('path');
const E = require('../estimator.js');
const F = require('../flags.js');
const raw = process.argv[2] || '/tmp/estimator-raw/lowbid.ndjson';
const allRaw = raw.replace(/\.ndjson$/, '') + '-allbids.ndjson';
const outDir = path.join(__dirname, '..', 'data');
const fetchMeta = JSON.parse(fs.readFileSync(path.join(path.dirname(raw), 'fetch-meta.json'), 'utf8'));

const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const n = (x) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));

const agg = new Map();
if (fs.existsSync(allRaw)) {
  for (const a of lines(allRaw)) agg.set(a.project_id + '|' + a.bid_code + '|' + n(a.bid_item_quantity), a);
}
// Other bidders (rank >= 2) per project|code|qty -> median, for flag rule (b).
const othersRaw = raw.replace(/\.ndjson$/, '') + '-otherbids.ndjson';
const others = new Map();
if (fs.existsSync(othersRaw)) {
  for (const line of fs.readFileSync(othersRaw, 'utf8').split('\n')) {
    if (!line) continue;
    const a = JSON.parse(line);
    const k = a.project_id + '|' + a.bid_code + '|' + n(a.bid_item_quantity);
    const v = n(a.bid_item_unit_price_amount);
    if (v == null) continue;
    if (!others.has(k)) others.set(k, []);
    others.get(k).push(v);
  }
}
const counties = [], districts = [], ci = new Map(), di = new Map();
const idx = (list, map, v) => { v = v || ''; if (!map.has(v)) { map.set(v, list.length); list.push(v); } return map.get(v); };

const codes = new Map();
let rows = 0, kept = 0, dmin = '9', dmax = '0';
for (const r of lines(raw)) {
  rows++;
  const q = n(r.bid_item_quantity), p = n(r.bid_item_unit_price_amount);
  if (!r.bid_code || !(q > 0) || !(p > 0)) continue;
  kept++;
  const d = (r.project_actual_let_date || '').slice(0, 10);
  if (d && d < dmin) dmin = d;
  if (d && d > dmax) dmax = d;
  let c = codes.get(r.bid_code);
  if (!c) { c = { code: r.bid_code, descs: new Map(), units: new Map(), obs: [] }; codes.set(r.bid_code, c); }
  c.descs.set(r.bid_item_description, (c.descs.get(r.bid_item_description) || 0) + 1);
  c.units.set(r.measurement_unit, (c.units.get(r.measurement_unit) || 0) + 1);
  const a = agg.get(r.project_id + '|' + r.bid_code + '|' + q);
  const ee = n(r.engineer_s_estimate_unit);
  c.obs.push([E.r4(q), E.r4(p), ee > 0 ? E.r4(ee) : null, d, idx(counties, ci, r.county), idx(districts, di, r.district_division),
    r.project_id || '', a ? Number(a.nb) : null, a ? E.r4(n(a.av)) : null, 0, null]);
  c.rawDesc = c.rawDesc || [];
  c.rawDesc.push(r.bid_item_description);
  const ob = others.get(r.project_id + '|' + r.bid_code + '|' + q);
  c.others = c.others || [];
  c.others.push(ob ? [E.median(ob), ob.length] : [null, 0]);
}
// Possibly-unbalanced flags (flags.js holds the rules). Flagged bids are kept everywhere.
const flagRows = [];
for (const c of codes.values()) {
  const med = E.median(c.obs.map((o) => o[1]));
  c.obs.forEach((o, i) => flagRows.push({ key: c.code + '#' + i, project: o[6], code: c.code, desc: c.rawDesc[i], qty: o[0], price: o[1], othersMedian: c.others[i][0], othersN: c.others[i][1], codeMedian: med }));
}
const flagRes = F.computeFlags(flagRows);
let flaggedBids = 0;
const flagCounts = { pair: 0, vs_others: 0, placeholder: 0 };
for (const [key, f] of flagRes.flags) {
  const [code, i] = key.split('#');
  const o = codes.get(code).obs[Number(i)];
  o[9] = f.flags; o[10] = f.partner;
  flaggedBids++;
  if (f.flags & 1) flagCounts.pair++;
  if (f.flags & 2) flagCounts.vs_others++;
  if (f.flags & 4) flagCounts.placeholder++;
}
for (const c of codes.values()) { delete c.rawDesc; delete c.others; }
const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
const houIdx = districts.indexOf('Houston');

// Pooled quantity slope: median statewide log-log slope over codes with a significant fit.
const slopes = [];
for (const c of codes.values()) {
  const f = E.logLogFit(c.obs);
  if (f.significant) slopes.push(f.slope);
}
slopes.sort((a, b) => a - b);
const pooled = { slope: E.r4(E.quantile(slopes, 0.5)), p25: E.r4(E.quantile(slopes, 0.25)), p75: E.r4(E.quantile(slopes, 0.75)), n: slopes.length,
  note: 'median log10(price)/log10(qty) slope of statewide low bids across codes with n>=8 and p<0.1' };

fs.rmSync(path.join(outDir, 'items'), { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'items'), { recursive: true });
const shards = new Map();
const index = [];
for (const c of [...codes.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))) {
  const item = c.code.split('-')[0];
  const units = top(c.units);
  const hou = c.obs.filter((o) => o[5] === houIdx);
  const entry = { desc: top(c.descs)[0], unit: units[0], obs: c.obs,
    stats: { statewide: E.summarize(c.obs), houston: hou.length ? E.summarize(hou) : null } };
  if (units.length > 1) entry.units = units;
  const pt = Object.keys(flagRes.pairTypes).find((k) => k.split('|').indexOf(c.code) !== -1);
  if (pt) {
    const v = flagRes.pairTypes[pt];
    entry.pair = { codes: pt.split('|'), n: v.n, median_ratio: v.median_ratio == null ? null : E.r4(v.median_ratio), median_combined: v.median_combined == null ? null : E.r4(v.median_combined) };
  }
  entry.flagged = c.obs.filter((o) => o[9]).length;
  if (!shards.has(item)) shards.set(item, {});
  shards.get(item)[c.code] = entry;
  index.push([c.code, entry.desc, entry.unit, c.obs.length, hou.length]);
}
let bytes = 0;
for (const [item, obj] of shards) {
  // Project ids -> small integers per shard (only distinct counts are needed).
  const pids = [], pmap = new Map();
  for (const code in obj) for (const o of obj[code].obs) { if (!pmap.has(o[6])) { pmap.set(o[6], pids.length); pids.push(o[6]); } o[6] = pmap.get(o[6]); }
  const s = JSON.stringify({ item: item, pids: pids, codes: obj });
  bytes += s.length;
  fs.writeFileSync(path.join(outDir, 'items', item + '.json'), s);
}
const meta = { source_url: 'https://data.texas.gov/dataset/Bid-Tabulations/de7b-7dna', accessed: fetchMeta.accessed,
  let_date_min: dmin, let_date_max: dmax, low_bid_rows: rows, rows_used: kept, codes: codes.size, flagged_bids: flaggedBids, other_bid_rows: fetchMeta.other_bid_rows || 0, flag_counts: flagCounts,
  codes_with_flags: [...codes.values()].filter((c) => c.obs.some((o) => o[9])).length, shards: shards.size,
  note: 'Low bidder (bid_rank_sequence_number=1) rows for every letting in the dataset; all-bidder count/min/avg per project+code+qty. Planning-level only.' };
const indexJson = JSON.stringify({ meta: meta, pooled_slope: pooled, counties: counties, districts: districts, index: index });
fs.writeFileSync(path.join(outDir, 'index.json'), indexJson);
console.log(JSON.stringify(meta), 'pooled', JSON.stringify(pooled), 'index bytes', indexJson.length, 'shard bytes', bytes);
