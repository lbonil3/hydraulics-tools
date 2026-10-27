#!/usr/bin/env node
/**
 * Pull low-bidder rows (bid_rank_sequence_number = '1') from TxDOT Open Data
 * Bid Tabulations (data.texas.gov, Socrata de7b-7dna) into a local NDJSON file.
 * The raw file is NOT committed (large); build-data.js turns it into the
 * compact shards under bid-estimator/data/.
 *
 * Usage: node bid-estimator/scripts/fetch-bids.js [out=/tmp/estimator-raw/lowbid.ndjson]
 * Also writes <out>-allbids.ndjson (all-bidder count/min/avg/max per project+code+qty).
 * Optional env SOCRATA_APP_TOKEN (otherwise unauthenticated, throttled).
 * Engineer's estimate comes from each row's engineer_s_estimate_unit field.
 */
const fs = require('fs');
const path = require('path');
const out = process.argv[2] || '/tmp/estimator-raw/lowbid.ndjson';
const BASE = 'https://data.texas.gov/resource/de7b-7dna.json';
const FIELDS = ['bid_code', 'bid_item_description', 'measurement_unit', 'bid_item_quantity',
  'bid_item_unit_price_amount', 'engineer_s_estimate_unit', 'project_id', 'county',
  'district_division', 'project_actual_let_date'];
const PAGE = 50000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// All-bidder spread, aggregated server-side per project/code/quantity
// (SoQL has no median, so count/min/avg/max of every non-EE bid).
const AGG = {
  select: 'project_id,bid_code,bid_item_quantity,count(*) as nb,min(bid_item_unit_price_amount) as mn,' +
    'avg(bid_item_unit_price_amount) as av,max(bid_item_unit_price_amount) as mx',
  where: "bid_rank_sequence_number!='EE'",
  group: 'project_id,bid_code,bid_item_quantity',
  order: 'project_id,bid_code,bid_item_quantity'
};
const LOW = { select: FIELDS.join(','), where: "bid_rank_sequence_number='1'", order: ':id' };

async function page(q, offset) {
  const u = new URL(BASE);
  u.searchParams.set('$select', q.select);
  u.searchParams.set('$where', q.where);
  if (q.group) u.searchParams.set('$group', q.group);
  u.searchParams.set('$order', q.order);
  u.searchParams.set('$limit', String(PAGE));
  u.searchParams.set('$offset', String(offset));
  const headers = {};
  if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(u, { headers });
    if (res.ok) return res.json();
    console.error('HTTP ' + res.status + ' at offset ' + offset + ', retrying');
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('failed at offset ' + offset);
}

async function pull(q, file) {
  const fd = fs.openSync(file, 'w');
  let offset = 0, total = 0;
  for (;;) {
    const rows = await page(q, offset);
    for (const r of rows) fs.writeSync(fd, JSON.stringify(r) + '\n');
    total += rows.length;
    console.error('rows ' + total);
    if (rows.length < PAGE) break;
    offset += PAGE;
    if (!process.env.SOCRATA_APP_TOKEN) await sleep(1500);
  }
  fs.closeSync(fd);
  return total;
}

(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const total = await pull(LOW, out);
  const agg = await pull(AGG, out.replace(/\.ndjson$/, '') + '-allbids.ndjson');
  fs.writeFileSync(path.join(path.dirname(out), 'fetch-meta.json'),
    JSON.stringify({ accessed: new Date().toISOString().slice(0, 10), rows: total, allbid_groups: agg }, null, 1));
})();
