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

// detailOrSpec fallback
const ds1 = L.detailOrSpec(real, '465-6001');
assert.strictEqual(ds1.kind, 'sheet');
assert.strictEqual(ds1.source, 'Houston');
const ds2 = L.detailOrSpec(real, '104-6001'); // removing concrete: no sheet
assert.strictEqual(ds2.kind, 'spec');
assert.strictEqual(ds2.url, L.specPdfUrl('104'));
assert.strictEqual(ds2.title, 'No standard sheet; spec only');
assert.strictEqual(L.detailOrSpec(real, '800-6001'), null); // 8xx: no verified spec
assert.strictEqual(L.detailOrSpec(real, '999-6001'), null);
assert.strictEqual(L.detailOrSpec(null, '420-6001').kind, 'spec');
assert.strictEqual(L.hasSpecPdf('801'), false);
assert.strictEqual(L.detailOrSpec(real, '666-6017') && L.detailOrSpec(real, '666-6017').kind, 'sheet');
assert.strictEqual(L.detailOrSpec(real, '450-6122').kind, 'spec'); // T80PP RF vs TS ambiguous

console.log('ok');

// Items without a 2024 standard spec PDF (e.g. 704, 708) must not get a header Spec link.
{
  const assert = require('assert');
  const L2 = require('./lookup.js');
  ['704', '708', '701', '800'].forEach(function (i) { assert.strictEqual(L2.hasSpecPdf(i), false, i); });
  ['700', '712', '464'].forEach(function (i) { assert.strictEqual(L2.hasSpecPdf(i), true, i); });
  const appSrc = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');
  assert.ok(/L\.hasSpecPdf\(g\.item\) \? L\.specPdfUrl/.test(appSrc), 'header spec link gated');
  console.log('ok header spec gating');
}

// item-info.json: official titles + search on title/summary
{
  const assert = require('assert');
  const L3 = require('./lookup.js');
  const info = require('./item-info.json');
  assert.strictEqual(info.items['451'].title, 'Retrofit Railing');
  assert.strictEqual(info.items['451'].source, 'spec-2024');
  assert.strictEqual(info.items['464'].title, 'Reinforced Concrete Pipe');
  assert.strictEqual(info.items['800'].source, 'bid-data');
  Object.keys(info.items).forEach(function (k) {
    const e = info.items[k];
    assert.ok(e.title && e.title.length < 80, k);
    assert.strictEqual(e.source === 'spec-2024', L3.hasSpecPdf(k), k);
    if (e.summary) assert.ok(e.summary.length <= 300, k);
  });
  const rows = [{ bid_code: '451-6001', description: 'RAIL (TY T)' }, { bid_code: '464-6001', description: 'RC PIPE' }];
  assert.strictEqual(L3.filterRows(rows, 'retrofit').length, 0);
  assert.deepStrictEqual(L3.filterRows(rows, 'retrofit', info).map(r => r.bid_code), ['451-6001']);
  assert.deepStrictEqual(L3.filterRows(rows, 'storm drain', info).map(r => r.bid_code), ['464-6001']);
  const app = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');
  assert.ok(/fetch\('\.\/item-info\.json'\)/.test(app));
  console.log('ok item-info');
}

// Example links: code rows and item headers, fail-soft, unmapped shows nothing.
{
  const assert = require('assert');
  const L = require('./lookup.js');
  const sample = {
    by_code: {
      '466-7177': [
        { type: 'Past project', url: 'https://example.com/cypress.pdf#page=14', title: 'Wingwall on the Cypress Creek estimate' }
      ],
      '110-7001': [
        { type: 'Past project', url: 'https://example.com/jones.pdf', title: 'Roadway excavation', label: 'Past project' },
        { type: 'Nope', url: 'https://example.com/bad', title: 'drop me' },
        { type: 'Photo', url: 'http://example.com/insecure', title: 'drop insecure' },
        { type: 'Photo', url: 'https://example.com/photo', title: '' },
        { type: 'Photo', url: 'https://example.com/photo', title: 'ok', label: 'Picture' }
      ],
      '000-0000': []
    },
    by_item: {
      '464': [
        { type: 'Photo', url: 'https://example.com/rcp.jpg', title: 'Concrete culvert pipe' },
        { type: 'Plan sheet', url: 'https://example.com/rcp-plan.pdf#page=5', title: '36-inch RCP callout', label: 'Plan sheet' }
      ],
      '465': [
        { type: 'Photo', url: 'https://example.com/inlet.jpg', title: 'Curb inlet', label: 'Photo · inlet' }
      ]
    }
  };

  assert.deepStrictEqual(L.resolveExamples(null, '466-7177'), []);
  assert.deepStrictEqual(L.resolveExamples(sample, 'no-such'), []);
  assert.deepStrictEqual(L.resolveExamples(sample, '000-0000'), []);
  assert.deepStrictEqual(L.resolveExamples(sample, '464-6001'), []);
  const wing = L.resolveExamples(sample, '466-7177');
  assert.strictEqual(wing.length, 1);
  assert.strictEqual(wing[0].type, 'Past project');
  assert.strictEqual(wing[0].label, 'Past project');
  assert.strictEqual(wing[0].url, 'https://example.com/cypress.pdf#page=14');

  const excav = L.resolveExamples(sample, '110-7001');
  assert.strictEqual(excav.length, 1, 'invalid type, http, empty title, and mismatched label are dropped');
  assert.strictEqual(excav[0].title, 'Roadway excavation');

  assert.deepStrictEqual(L.resolveItemExamples(null, '464'), []);
  assert.deepStrictEqual(L.resolveItemExamples(sample, '999'), []);
  assert.deepStrictEqual(L.resolveItemExamples(sample, ''), []);
  const rcp = L.resolveItemExamples(sample, '464');
  assert.strictEqual(rcp.length, 2);
  assert.strictEqual(rcp[0].type, 'Photo');
  assert.strictEqual(rcp[0].label, 'Photo');
  assert.strictEqual(rcp[1].type, 'Plan sheet');
  const inlet = L.resolveItemExamples(sample, '465');
  assert.strictEqual(inlet[0].label, 'Photo · inlet');
  assert.ok(inlet[0].label.indexOf(inlet[0].type) === 0);

  const real = require('./examples.json');
  const allowed = { Photo: 1, 'Past project': 1, 'Plan sheet': 1, Figure: 1, 'Bid tab': 1 };
  function checkList(list, where) {
    assert.ok(Array.isArray(list) && list.length > 0, where);
    list.forEach(function (e, i) {
      const got = L.resolveExamples(
        { by_code: { probe: [e] } },
        'probe'
      );
      assert.strictEqual(got.length, 1, where + ' [' + i + '] ' + JSON.stringify(e));
      assert.ok(allowed[e.type], e.type);
      assert.ok(/^https:\/\//.test(e.url), e.url);
    });
  }
  ['432', '464', '465', '466', '467', '506', '462', '460', '540', '402'].forEach(function (item) {
    checkList(real.by_item[item], 'item ' + item);
    assert.ok(L.resolveItemExamples(real, item).length > 0, item);
  });
  assert.deepStrictEqual(L.resolveItemExamples(real, '999'), []);
  assert.deepStrictEqual(L.resolveExamples(real, '999-6001'), []);
  assert.deepStrictEqual(L.resolveExamples(real, '464-6001'), [], 'item examples stay on the header');
  const wingReal = L.resolveExamples(real, '466-7177');
  assert.ok(wingReal.some(function (e) { return e.type === 'Past project' && e.url.indexOf('0050-06-108') !== -1; }));
  const channel = L.resolveExamples(real, '110-7002');
  assert.strictEqual(channel.length > 0, true);
  assert.ok(real.meta && real.meta.extend && real.meta.accessed);

  const app = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');
  assert.ok(/fetch\('\.\/examples\.json'\)/.test(app));
  assert.ok(/resolveItemExamples\(/.test(app));
  assert.ok(/resolveExamples\(/.test(app));
  assert.ok(/example-link/.test(app));
  assert.ok(/class="example-cell"/.test(app));
  const css = require('fs').readFileSync(require('path').join(__dirname, 'style.css'), 'utf8') +
    require('fs').readFileSync(require('path').join(__dirname, 'mobile.css'), 'utf8');
  assert.ok(/\.example-link\{[^}]*min-height:\s*44px/.test(css));
  console.log('ok examples');
}
