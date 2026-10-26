#!/usr/bin/env node
/**
 * Build bid-cost/prices.json from Houston + statewide CSV extracts in ./data/.
 * Uses a quoted-field CSV parser (descriptions often contain commas).
 *
 * Inputs (copied from /workspace/txdot-bid-prices/):
 *   data/bid-unit-prices-houston.csv
 *   data/bid-unit-prices-statewide.csv
 *   data/_meta.json
 *
 * Usage: node bid-cost/build-prices.js
 *
 * This file keeps one average per bid code. It does not keep project_name,
 * project_id, county, bid_item_quantity, or project_actual_let_date from
 * Bid Tabulations (data.texas.gov de7b-7dna). The Houston and statewide CSVs
 * in data/ also lack those columns; they only have n, total quantity, and
 * price statistics. code-example-samples.json therefore shows min, median,
 * and max, not bid lines. To show real lines, aggregate from rank-1 rows
 * that still carry those fields and point the example panel at that file.
 * See docs/superpowers/specs/2026-10-26-bid-cost-code-examples-design.md.
 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const dataDir = path.join(dir, 'data');

/** Minimal RFC4180-ish CSV parse: handles quoted fields with commas. */
function parseCsv(text) {
  const rows = [];
  let i = 0;
  const n = text.length;
  function readField() {
    if (text[i] === '"') {
      i++;
      let out = '';
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            out += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += text[i++];
      }
      return out;
    }
    let start = i;
    while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
    return text.slice(start, i);
  }
  function readRow() {
    if (i >= n) return null;
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    if (i >= n) return null;
    const cols = [];
    while (true) {
      cols.push(readField());
      if (i >= n || text[i] === '\n' || text[i] === '\r') break;
      if (text[i] === ',') i++;
      else break;
    }
    return cols;
  }
  const headers = readRow();
  if (!headers) return [];
  let cols;
  while ((cols = readRow()) !== null) {
    if (cols.length === 1 && cols[0] === '') continue;
    const o = {};
    headers.forEach(function (h, idx) {
      o[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    rows.push(o);
  }
  return rows;
}

function loadSide(file) {
  const rows = parseCsv(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const map = Object.create(null);
  rows.forEach(function (r) {
    const code = r.bid_code;
    if (!code) return;
    map[code] = {
      bid_code: code,
      description: r.description || '',
      unit: r.unit || '',
      avg: r.avg_unit_price === '' || r.avg_unit_price == null ? null : Number(r.avg_unit_price),
      n: Number(r.n_observations) || 0
    };
  });
  return map;
}

const houston = loadSide('bid-unit-prices-houston.csv');
const statewide = loadSide('bid-unit-prices-statewide.csv');
const metaIn = JSON.parse(fs.readFileSync(path.join(dataDir, '_meta.json'), 'utf8'));
const codes = Object.keys(Object.assign({}, statewide, houston)).sort();
const outRows = [];
codes.forEach(function (code) {
  const h = houston[code];
  const s = statewide[code];
  const houston_n = h ? h.n : 0;
  const statewide_n = s ? s.n : 0;
  if (houston_n <= 0 && statewide_n <= 0) return;
  outRows.push({
    bid_code: code,
    description: (h && h.description) || (s && s.description) || '',
    unit: (h && h.unit) || (s && s.unit) || '',
    houston_avg: h && houston_n > 0 ? h.avg : null,
    houston_n: houston_n,
    statewide_avg: s && statewide_n > 0 ? s.avg : null,
    statewide_n: statewide_n
  });
});

const out = {
  meta: {
    accessed: metaIn.access_date || '',
    let_date_min: metaIn.min_date || '',
    let_date_max: metaIn.max_date || '',
    source_url: 'https://data.texas.gov/dataset/Bid-Tabulations/de7b-7dna',
    note: 'Low bidder (rank=1) averages; planning-level only'
  },
  rows: outRows
};
fs.writeFileSync(path.join(dir, 'prices.json'), JSON.stringify(out));
console.log('wrote', outRows.length, 'rows');
