const assert = require('assert');
const L = require('./lookup.js');

const houstonRow = {
  bid_code: '464-7005',
  description: 'RC PIPE (CL III)(24 IN)',
  unit: 'LF',
  houston_avg: 130.5,
  houston_n: 12,
  statewide_avg: 123.64,
  statewide_n: 371
};
const statewideOnly = {
  bid_code: '999-6001',
  description: 'FAKE ITEM STATEWIDE ONLY',
  unit: 'EA',
  houston_avg: null,
  houston_n: 0,
  statewide_avg: 50,
  statewide_n: 3
};
const none = {
  bid_code: '000-0000',
  description: 'NO DATA',
  unit: 'LF',
  houston_avg: null,
  houston_n: 0,
  statewide_avg: null,
  statewide_n: 0
};

const r1 = L.resolvePrice(houstonRow);
assert.strictEqual(r1.source, 'Houston');
assert.strictEqual(r1.price, 130.5);
assert.strictEqual(r1.n, 12);

const r2 = L.resolvePrice(statewideOnly);
assert.strictEqual(r2.source, 'Statewide');
assert.strictEqual(r2.price, 50);
assert.strictEqual(r2.n, 3);

const r3 = L.resolvePrice(none);
assert.strictEqual(r3.source, null);
assert.strictEqual(r3.price, null);

const rows = [houstonRow, statewideOnly, none];
assert.strictEqual(L.filterRows(rows, '').length, 3);
assert.strictEqual(L.filterRows(rows, '  ').length, 3);
assert.strictEqual(L.filterRows(rows, '464').length, 1);
assert.strictEqual(L.filterRows(rows, 'pipe').length, 1);
assert.strictEqual(L.filterRows(rows, 'PIPE').length, 1);
assert.strictEqual(L.filterRows(rows, 'no-match-xyz').length, 0);

assert.strictEqual(L.formatMoney(1234.5), '$1,234.50');
assert.strictEqual(L.formatMoney(null), '—');

console.log('ok');
