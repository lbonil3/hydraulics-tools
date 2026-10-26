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

// In-tool drainage examples: diagram + what the unit price covers + extract prices.
// No external example links. Unmapped codes and a missing catalog add nothing.
{
  const assert = require('assert');
  const fs = require('fs');
  const path = require('path');
  const L = require('./lookup.js');
  require('./examples.js');

  const catalog = {
    rules: [
      { item: '464', diagram: '', unit_how: 'skip me', included: ['no'], separate: ['no'], spec: 'x' },
      {
        item: '464',
        diagram: 'rcp',
        unit_how: 'Foot along the flow line of the barrel.',
        included: ['Furnish and join the pipe.'],
        separate: ['Excavation, bedding, and backfill are Item 400.'],
        spec: 'TxDOT 2024 Item 464, Measurement and Payment'
      },
      {
        item: '467',
        when: 'PIPE RUNNER',
        diagram: 'runners',
        unit_how: 'Each runner or assembly on one structure end.',
        included: ['Install the runners.'],
        separate: ['The pipe run is not this bid.'],
        spec: 'TxDOT 2024 Item 467, Payment'
      },
      {
        item: '467',
        diagram: 'set',
        unit_how: 'Each barrel at one structure end.',
        included: ['The sloped end treatment.'],
        separate: ['Riprap outside the plan limits is Item 432.'],
        spec: 'TxDOT 2024 Item 467, Payment'
      },
      {
        item: '496',
        when: 'PIPE',
        diagram: 'remove',
        unit_how: 'Foot of pipe removed.',
        included: ['Remove and dispose of the pipe.'],
        separate: ['The replacement pipe is its own item.'],
        spec: 'TxDOT 2024 Item 496, Payment'
      }
    ]
  };

  assert.strictEqual(L.resolveExample(null, '464-6001', 'RC PIPE'), null);
  assert.strictEqual(L.resolveExample({}, '464-6001', 'RC PIPE'), null);
  assert.strictEqual(L.resolveExample(catalog, '100-6001', 'PREPARING ROW'), null);
  assert.strictEqual(L.resolveExample(catalog, 'bad', 'RC PIPE'), null);

  const pipe = L.resolveExample(catalog, '464-6001', 'RC PIPE (CL III)(24 IN)');
  assert.strictEqual(pipe.diagram, 'rcp');
  assert.ok(pipe.separate.some(s => /Item 400/.test(s)));
  assert.ok(/Item 464/.test(pipe.spec));

  const runner = L.resolveExample(catalog, '467-7001', 'SET (PIPE RUNNER ASSEMBLY)');
  assert.strictEqual(runner.diagram, 'runners');
  const set = L.resolveExample(catalog, '467-6390', 'SET (TY II) (24 IN) (RCP) (4: 1) (C)');
  assert.strictEqual(set.diagram, 'set');

  assert.strictEqual(L.resolveExample(catalog, '496-6009', 'REMOV STR (BRIDGE 0 - 99 FT LENGTH)'), null);
  assert.strictEqual(L.resolveExample(catalog, '496-6007', 'REMOV STR (PIPE)').diagram, 'remove');

  const one = L.sampleFacts({
    side: 'Houston', n: 1, total_qty: 40, min: 10, median: 10, max: 10, unit: 'LF',
    let_date_min: '2024-09-06', let_date_max: '2026-10-22'
  });
  assert.strictEqual(one.lines.length, 1);
  assert.strictEqual(one.lines[0].price, 10);
  assert.strictEqual(one.lines[0].project, null);
  assert.strictEqual(one.lines[0].county, null);
  assert.strictEqual(one.lines[0].bid_qty, null);
  assert.strictEqual(one.lines[0].let_scope, 'dataset');
  assert.ok(/project/i.test(one.gap) && /county/i.test(one.gap) && /build-prices\.js/.test(one.gap));

  const two = L.sampleFacts({ side: 'Statewide', n: 2, total_qty: 5, min: 8, median: 9, max: 11, unit: 'EA' });
  assert.strictEqual(two.lines.length, 2);
  assert.strictEqual(two.lines[0].price, 8);
  assert.strictEqual(two.lines[1].price, 11);

  const three = L.sampleFacts({ side: 'Houston', n: 12, total_qty: 1000, min: 70, median: 120, max: 400, unit: 'LF' });
  assert.strictEqual(three.lines.length, 3);
  assert.deepStrictEqual(three.lines.map(l => l.price), [70, 120, 400]);
  assert.ok(three.lines.every(l => l.project == null && l.county == null && l.bid_qty == null));

  assert.strictEqual(L.sampleFacts(null).lines.length, 0);
  assert.strictEqual(L.sampleFacts({ n: 0, min: 5 }).lines.length, 0);

  const svg = L.exampleSvg('rcp', 'LF');
  assert.ok(svg.indexOf('<svg') === 0);
  assert.ok(svg.indexOf('LF') !== -1);
  assert.ok(/pipe/i.test(svg));
  assert.ok(!/https?:|<(image|img|script)\b/i.test(svg));
  const unk = L.exampleSvg('not-a-diagram', 'CY');
  assert.ok(unk.indexOf('CY') !== -1);
  assert.ok(/No diagram/.test(unk));
  assert.ok(unk.indexOf('<svg') === 0);

  const html = L.examplePanelHtml(pipe, 'LF', three);
  assert.ok(html.indexOf('LF') !== -1);
  assert.ok(html.indexOf('Item 400') !== -1);
  assert.ok(html.indexOf('$70.00') !== -1);
  assert.ok(html.indexOf('not in this repo') !== -1);
  assert.ok(!/<a\b/i.test(html));
  assert.ok(!/https?:/i.test(html));
  const bare = L.examplePanelHtml(pipe, 'LF', L.sampleFacts(null));
  assert.ok(/no project name/i.test(bare));
  assert.ok(!/<a\b/i.test(bare));

  const shipped = require('./code-examples.json');
  const samples = require('./code-example-samples.json');
  assert.ok(shipped.rules.length > 10);
  const known = new Set();
  shipped.rules.forEach(function (rule) {
    assert.ok(rule.diagram && rule.unit_how && rule.spec, rule.item);
    assert.ok(Array.isArray(rule.included) && rule.included.length, rule.item);
    assert.ok(Array.isArray(rule.separate) && rule.separate.length, rule.item);
    known.add(rule.diagram);
    const drawn = L.exampleSvg(rule.diagram, 'LF');
    assert.ok(drawn.indexOf('<svg') === 0, rule.diagram);
    assert.ok(!/https?:|<(image|img|script)\b/i.test(drawn), rule.diagram);
  });
  assert.ok(known.has('rcp') && known.has('set') && known.has('riprap-stone'));

  const prices = require('./prices.json');
  function row(code) {
    return prices.rows.find(function (r) { return r.bid_code === code; });
  }
  function ex(code) {
    const r = row(code);
    assert.ok(r, code);
    return L.resolveExample(shipped, code, r.description);
  }
  assert.strictEqual(ex('464-6001').diagram, 'rcp');
  assert.ok(/Item 400/.test(ex('464-6001').separate.join(' ')));
  assert.ok(/shaping the bed/i.test(ex('464-6001').included.join(' ')));
  assert.strictEqual(ex('460-6001').diagram, 'cmp');
  assert.strictEqual(ex('462-6001').diagram, 'box');
  assert.strictEqual(ex('467-7001').diagram, 'runners');
  assert.strictEqual(ex('467-6390').diagram, 'set');
  assert.ok(ex('432-6031'));
  assert.strictEqual(ex('432-6031').diagram, 'riprap-stone');
  assert.strictEqual(ex('432-6001').diagram, 'riprap-conc');
  assert.strictEqual(ex('400-6003').diagram, 'struct-ex-pipe');
  assert.strictEqual(ex('496-6007').diagram, 'remove');
  assert.strictEqual(ex('496-6009'), null);
  assert.strictEqual(ex('479-6002').diagram, 'adjust');
  assert.strictEqual(ex('479-6005'), null);
  assert.strictEqual(L.resolveExample(shipped, '100-6001', 'PREPARING ROW'), null);
  assert.strictEqual(L.resolveExample(shipped, '666-6017', 'REFL PAV MRKR TY I-C'), null);
  assert.strictEqual(ex('400-6025'), null);
  // Four-digit special specs share the first three digits but are not that Item.
  assert.strictEqual(L.resolveExample(shipped, '4021-6001', 'TIP TESTING(DRILL SHAFT)'), null);
  assert.strictEqual(L.resolveExample(shipped, '4008-6001', 'TRENCH DRAIN'), null);
  assert.strictEqual(L.resolveExample(shipped, '5061-7001', 'SUBSURFACE UTIL LOCATE (NON-PAVED AREA)'), null);

  // Samples are the CSV min/median/max, Houston first. Not invented bid lines.
  function csvIndex(file) {
    const text = fs.readFileSync(path.join(__dirname, 'data', file), 'utf8');
    const lines = text.split(/\r?\n/);
    const head = lines[0].split(',');
    const idx = {};
    head.forEach(function (h, i) { idx[h] = i; });
    const map = Object.create(null);
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const cols = lines[i].split(',');
      if (cols.length < head.length) continue;
      map[cols[0]] = cols;
    }
    return { idx: idx, map: map };
  }
  const hou = csvIndex('bid-unit-prices-houston.csv');
  const sw = csvIndex('bid-unit-prices-statewide.csv');
  function csvNum(cols, idx, name) { return Number(cols[idx[name]]); }
  ['464-6001', '465-6001', '402-6001', '506-6038'].forEach(function (code) {
    const sample = samples.by_code[code];
    const r = row(code);
    assert.ok(sample, code);
    assert.strictEqual(sample.project, null, code);
    assert.strictEqual(sample.county, null, code);
    assert.strictEqual(sample.bid_qty, null, code);
    assert.strictEqual(sample.let_scope, 'dataset', code);
    const preferHou = hou.map[code] && Number(hou.map[code][hou.idx.n_observations]) > 0;
    const src = preferHou ? hou : sw;
    const cols = src.map[code];
    assert.ok(cols, code);
    assert.strictEqual(sample.side, preferHou ? 'Houston' : 'Statewide', code);
    assert.strictEqual(sample.n, csvNum(cols, src.idx, 'n_observations'), code);
    assert.strictEqual(sample.min, csvNum(cols, src.idx, 'min_unit_price'), code);
    assert.strictEqual(sample.median, csvNum(cols, src.idx, 'median_unit_price'), code);
    assert.strictEqual(sample.max, csvNum(cols, src.idx, 'max_unit_price'), code);
    assert.strictEqual(sample.total_qty, csvNum(cols, src.idx, 'total_qty'), code);
    assert.strictEqual(sample.unit, r.unit, code);
    const facts = L.sampleFacts(sample);
    assert.ok(facts.lines.length >= 1 && facts.lines.length <= 3, code);
    facts.lines.forEach(function (line) {
      assert.strictEqual(line.project, null);
      assert.strictEqual(line.county, null);
    });
  });
  assert.strictEqual(samples.by_code['496-6009'], undefined);
  assert.strictEqual(samples.by_code['100-6001'], undefined);

  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8') +
    fs.readFileSync(path.join(__dirname, 'mobile.css'), 'utf8');
  assert.ok(/fetch\('\.\/code-examples\.json'\)/.test(app));
  assert.ok(/fetch\('\.\/code-example-samples\.json'\)/.test(app));
  assert.ok(/example-toggle/.test(app));
  assert.ok(/type="button"/.test(app));
  assert.ok(!/example\.json/.test(app));
  assert.ok(/\.example-toggle\{[^}]*min-height:\s*44px/.test(css));
  console.log('ok code examples');
}
