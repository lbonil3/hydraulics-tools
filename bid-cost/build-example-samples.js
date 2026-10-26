#!/usr/bin/env node
/**
 * Build bid-cost/code-example-samples.json for codes that have an in-tool example.
 *
 * Reads the same Houston and statewide CSVs as build-prices.js. Those files have
 * one aggregate row per bid code (n, total quantity, min, median, max, average).
 * They do not have project, county, per-bid quantity, or letting date.
 *
 * Houston is used when houston n > 0; otherwise statewide.
 * Letting dates are the whole-extract window from data/_meta.json.
 *
 * Usage: node bid-cost/build-example-samples.js
 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
require('./lookup.js');
require('./examples.js');
const L = require('./lookup.js');

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
          if (text[i + 1] === '"') { out += '"'; i += 2; continue; }
          i++;
          break;
        }
        out += text[i++];
      }
      return out;
    }
    const start = i;
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
    headers.forEach(function (h, idx) { o[h] = cols[idx] !== undefined ? cols[idx] : ''; });
    rows.push(o);
  }
  return rows;
}

function num(v) {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isNaN(x) ? null : x;
}

function indexSide(file) {
  const rows = parseCsv(fs.readFileSync(path.join(dir, 'data', file), 'utf8'));
  const map = Object.create(null);
  rows.forEach(function (r) {
    if (r.bid_code) map[r.bid_code] = r;
  });
  return map;
}

const catalog = require('./code-examples.json');
const prices = require('./prices.json');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'data', '_meta.json'), 'utf8'));
const houston = indexSide('bid-unit-prices-houston.csv');
const statewide = indexSide('bid-unit-prices-statewide.csv');
const byCode = {};
let skipped = 0;

prices.rows.forEach(function (row) {
  if (!L.resolveExample(catalog, row.bid_code, row.description)) return;
  const h = houston[row.bid_code];
  const s = statewide[row.bid_code];
  const hn = h ? Number(h.n_observations) || 0 : 0;
  const use = hn > 0 ? h : (s && (Number(s.n_observations) || 0) > 0 ? s : null);
  if (!use) { skipped++; return; }
  byCode[row.bid_code] = {
    side: use === h ? 'Houston' : 'Statewide',
    n: Number(use.n_observations) || 0,
    total_qty: num(use.total_qty),
    min: num(use.min_unit_price),
    median: num(use.median_unit_price),
    max: num(use.max_unit_price),
    unit: row.unit || use.unit || '',
    let_date_min: meta.min_date || null,
    let_date_max: meta.max_date || null,
    let_scope: 'dataset',
    project: null,
    county: null,
    bid_qty: null
  };
});

const out = {
  meta: {
    let_date_min: meta.min_date || null,
    let_date_max: meta.max_date || null,
    let_scope: 'dataset',
    note: 'Aggregate min, median, and max from the bid-cost CSV extracts. Not individual bid lines. Project, county, per-bid quantity, and per-bid letting date are absent from those CSVs.'
  },
  by_code: byCode
};
fs.writeFileSync(path.join(dir, 'code-example-samples.json'), JSON.stringify(out));
console.log('samples', Object.keys(byCode).length, 'skipped', skipped);
