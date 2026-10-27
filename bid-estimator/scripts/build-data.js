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

// Grouped quantity slopes (item 1): within-code log-log slopes pooled by Item family
// (spec item number + unit) and across all codes, then shrunk code -> family -> global.
const K = E.METHOD.SHRINK_K;
const fam = new Map();
let gx = 0, gy = 0, gn = 0;
const codeSums = new Map();
for (const c of codes.values()) {
  const unit = top(c.units)[0];
  const ss = E.slopeSums(c.obs);
  codeSums.set(c.code, ss);
  if (!ss.n || ss.sxx <= 0) continue;
  const fk = c.code.split('-')[0] + '|' + unit;
  if (!fam.has(fk)) fam.set(fk, { sxx: 0, sxy: 0, n: 0 });
  const f = fam.get(fk); f.sxx += ss.sxx; f.sxy += ss.sxy; f.n += ss.n;
  gx += ss.sxx; gy += ss.sxy; gn += ss.n;
}
const globalSlope = gy / gx;
function groupedSlope(c) {
  const unit = top(c.units)[0];
  const item = c.code.split('-')[0];
  const f = fam.get(item + '|' + unit);
  const famB = f && f.sxx > 0 ? f.sxy / f.sxx : null;
  const famShr = E.shrink(famB, f ? f.n : 0, globalSlope, K);
  const ss = codeSums.get(c.code);
  const codeB = ss.n && ss.sxx > 0 ? ss.sxy / ss.sxx : null;
  return { code: codeB == null ? null : E.r4(codeB), code_n: codeB == null ? 0 : ss.n, family: famB == null ? null : E.r4(famB), family_n: f ? f.n : 0,
    family_key: item + ' (' + unit + ')', family_shrunk: E.r4(famShr), global: E.r4(globalSlope), final: E.r4(E.shrink(codeB, codeB == null ? 0 : ss.n, famShr, K)) };
}

// "Often bid with" (item 5): co-occurrence in the same projects. For code A, related B are
// ranked by the share of A's projects that also bid B, keeping only pairs that co-occur
// in >= 3 projects and at least 2x as often as chance (lift >= 2) so that items on nearly
// every job (mobilization, barricades) do not crowd out specific companions.
const REL = { MIN_BOTH: 3, MIN_LIFT: 2, TOP: 6 };
const projCodes = new Map(); // pid -> Map(code -> qty sum)
for (const c of codes.values()) for (const o of c.obs) {
  if (!projCodes.has(o[6])) projCodes.set(o[6], new Map());
  const m = projCodes.get(o[6]); m.set(c.code, (m.get(c.code) || 0) + o[0]);
}
const nProj = projCodes.size;
const codeProj = new Map();
for (const [, m] of projCodes) for (const code of m.keys()) codeProj.set(code, (codeProj.get(code) || 0) + 1);
const related = new Map();
for (const [, m] of projCodes) {
  const list = [...m.keys()];
  for (const a of list) {
    if (!related.has(a)) related.set(a, new Map());
    const ra = related.get(a), qa = m.get(a);
    for (const b of list) {
      if (a === b) continue;
      let r = ra.get(b); if (!r) { r = []; ra.set(b, r); }
      r.push(m.get(b) / qa);
    }
  }
}
function relatedFor(code) {
  const ra = related.get(code); if (!ra) return [];
  const na = codeProj.get(code);
  const out = [];
  for (const [b, ratios] of ra) {
    if (ratios.length < REL.MIN_BOTH) continue;
    const share = ratios.length / na;
    const lift = share / (codeProj.get(b) / nProj);
    if (lift < REL.MIN_LIFT) continue;
    out.push([b, E.r4(share), ratios.length, E.r4(E.median(ratios)), E.r4(lift)]);
  }
  out.sort((x, y) => y[1] - x[1] || y[4] - x[4]);
  return out.slice(0, REL.TOP);
}

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
  entry.slope = groupedSlope(c);
  const rel = relatedFor(c.code);
  if (rel.length) entry.related = rel; // [code, share of this code's projects, n projects with both, median qty ratio B/A, lift]
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
  mixed_unit_codes: [...codes.values()].filter((c) => c.units.size > 1).length,
  codes_with_flags: [...codes.values()].filter((c) => c.obs.some((o) => o[9])).length, shards: shards.size,
  note: 'Low bidder (bid_rank_sequence_number=1) rows for every letting in the dataset; all-bidder count/min/avg per project+code+qty. Planning-level only.' };
meta.projects = nProj;
meta.related_rule = REL;
const indexJson = JSON.stringify({ meta: meta, pooled_slope: pooled, global_within_slope: E.r4(globalSlope), shrink_k: K, counties: counties, districts: districts, index: index });
fs.writeFileSync(path.join(outDir, 'index.json'), indexJson);
console.log(JSON.stringify(meta), 'pooled', JSON.stringify(pooled), 'index bytes', indexJson.length, 'shard bytes', bytes);
