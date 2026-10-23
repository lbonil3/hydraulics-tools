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

assert.strictEqual(L.itemFromBidCode('464-6001'), '464');
assert.strictEqual(L.itemFromBidCode('100-6001'), '100');
assert.strictEqual(L.itemFromBidCode('bad'), null);

const grouped = L.groupByItem([
  { bid_code: '465-6001' },
  { bid_code: '464-6001' },
  { bid_code: '464-6002' },
  { bid_code: 'nope' }
]);
assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].item, '464');
assert.strictEqual(grouped[0].rows.length, 2);
assert.strictEqual(grouped[1].item, '465');

assert.strictEqual(
  L.specPdfUrl('464'),
  'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s464.pdf'
);

const b1 = L.barPercents(100, 50);
assert.strictEqual(b1.houston, 100);
assert.strictEqual(b1.statewide, 50);
const b2 = L.barPercents(null, 80);
assert.strictEqual(b2.houston, 0);
assert.strictEqual(b2.statewide, 100);
const b3 = L.barPercents(null, null);
assert.strictEqual(b3.houston, 0);
assert.strictEqual(b3.statewide, 0);

const detailMap = {
  by_code: {
    '465-6001': {
      houston_url: 'https://example.com/hil.pdf',
      statewide_url: 'https://example.com/sw.pdf',
      label: 'HIL-C-25'
    },
    '464-6001': {
      houston_url: null,
      statewide_url: 'https://example.com/pipe.pdf',
      label: 'SCP'
    },
    '999-6001': {
      houston_url: '',
      statewide_url: null
    }
  }
};

const d1 = L.resolveDetail(detailMap, '465-6001');
assert.strictEqual(d1.source, 'Houston');
assert.strictEqual(d1.url, 'https://example.com/hil.pdf');
assert.strictEqual(d1.label, 'HIL-C-25');

const d2 = L.resolveDetail(detailMap, '464-6001');
assert.strictEqual(d2.source, 'Statewide');
assert.strictEqual(d2.url, 'https://example.com/pipe.pdf');

assert.strictEqual(L.resolveDetail(detailMap, '999-6001'), null);
assert.strictEqual(L.resolveDetail(detailMap, 'no-such'), null);
assert.strictEqual(L.resolveDetail(null, '465-6001'), null);
assert.strictEqual(L.resolveDetail(detailMap, '465-6001').label.length > 0, true);

// Real generated map: statewide drainage sheets keyed on description
const real = require('./detail-map.json');
const pick = function (c) { return L.resolveDetail(real, c); };
assert.strictEqual(pick('465-6001').source, 'Houston');
assert.strictEqual(pick('466-6024').label, 'CH-FW-15');
assert.strictEqual(pick('466-6024').source, 'Statewide');
assert.strictEqual(pick('466-6143').label, 'FW-0');
assert.strictEqual(pick('467-6045').label, 'SETB-CD');
assert.strictEqual(pick('467-6110').label, 'SETB-PD');
assert.strictEqual(pick('467-7001'), null); // pipe runner
assert.strictEqual(pick('467-6006').label, 'SETP-FW-0 (assumed)');
assert.strictEqual(pick('462-6001').label, 'SCP-MD (assumed)');
assert.strictEqual(pick('460-6001'), null); // CMP: no sheet
Object.keys(real.by_code).forEach(function (c) {
  const e = real.by_code[c];
  if (e.assumed) assert.ok(/ \(assumed\)$/.test(e.label), c);
  if (/assumed/.test(e.label)) assert.ok(e.assumed, c);
});
Object.keys(real.by_code).forEach(function (c) {
  const e = real.by_code[c];
  const u = e.houston_url || e.statewide_url;
  assert.ok(/^https:\/\/ftp\.dot\.state\.tx\.us\/pub\/txdot-info\//.test(u), c);
});

console.log('ok');
