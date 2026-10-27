/* Guide content and the two-tab shell. Run: node swp3-builder/test-guide.js */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var G = require('./guide.js');
var M = require('./model.js');
var S = require('./summary.js');

var ids = {};
G.MEASURES.forEach(function (m) {
  assert.ok(!ids[m.id], 'dup ' + m.id);
  ids[m.id] = 1;
  assert.ok(G.CATS.some(function (c) { return c.id === m.cat; }), 'cat ' + m.id);
  assert.ok(m.name && m.one && m.what && m.sheet, 'name ' + m.id);
  ['where', 'install', 'maintain', 'mistakes'].forEach(function (k) {
    var need = (k === 'install' || k === 'mistakes') ? 3 : 2;
    assert.ok(Array.isArray(m[k]) && m[k].length >= need, k + ' ' + m.id);
  });
  assert.ok(m.confirm && /current|TxDOT|permit|sheet|Item/i.test(m.confirm), 'confirm ' + m.id);
  assert.ok(m.svg.indexOf('<svg') === 0 && m.svg.indexOf('</svg>') > 0, 'svg ' + m.id);
  assert.ok(/aria-label="/.test(m.svg), 'svg label ' + m.id);
  assert.ok(!/\b\d{3,}-\d{4}\b/.test(JSON.stringify(m)), 'no bid item number ' + m.id);
});
G.CATS.forEach(function (c) {
  assert.ok(G.inCat(c.id).length >= 2, 'empty cat ' + c.id);
  assert.ok(c.title && c.blurb, 'cat text ' + c.id);
});
['silt-fence', 'rock-filter-dam', 'check-dam', 'inlet-protection', 'construction-exit', 'seeding-mulch', 'blanket', 'sediment-basin', 'sandbag-berm', 'rock-berm', 'floating-turbidity', 'stream-crossing', 'concrete-washout'].forEach(function (id) {
  assert.ok(G.byId(id), 'missing ' + id);
});
assert.ok(/floating silt curtain|turbidity curtain/i.test(G.byId('floating-turbidity').what));
assert.ok(/>Section</.test(G.byId('silt-fence').svg) && />Plan</.test(G.byId('silt-fence').svg));
assert.ok(/Floats/.test(G.byId('floating-turbidity').svg));
assert.ok(/Drive up and down the slope/.test(G.byId('vertical-tracking').install.join(' ')));
assert.ok(!/Drive along the contour so the grooves/.test(G.byId('vertical-tracking').install.join(' ')));
assert.strictEqual(G.byId('nope'), null);

var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.ok(html.indexOf('data-t="summary"') > 0 && html.indexOf('data-t="design"') > 0);
['project', 'permit', 'bmps', 'outline', 'inspect', 'more'].forEach(function (t) {
  assert.ok(html.indexOf('data-t="' + t + '"') < 0, 'tab still present ' + t);
  assert.ok(html.indexOf('data-pane="' + t + '"') < 0, 'pane still present ' + t);
});
assert.ok(html.indexOf('design.js') < 0 && html.indexOf('recommend.js') < 0 && html.indexOf('lsdata.js') < 0);
assert.ok(html.indexOf('guide.js') > 0);
assert.ok(/erosion and sediment controls|erosion control guide/i.test(html));

var css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
assert.ok(css.indexOf('prefers-color-scheme: dark') > 0);
assert.ok(css.indexOf('prefers-reduced-motion: reduce') > 0);
assert.ok(css.indexOf('safe-area-inset') > 0);
assert.ok(css.indexOf('min-height:44px') > 0);
assert.ok(css.indexOf('min-width:1024px') > 0);

var home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(home.indexOf('Summary sheet and erosion control guide') > 0);
assert.ok(home.indexOf('Outline, design calcs') < 0);

assert.ok(!fs.existsSync(path.join(__dirname, 'design.js')));
assert.ok(!fs.existsSync(path.join(__dirname, 'recommend.js')));
assert.ok(!fs.existsSync(path.join(__dirname, 'lsdata.js')));
assert.ok(!fs.existsSync(path.join(__dirname, 'test-design.js')));

var junk = M.sanitizeProject({ id: 'old', name: 'Old job', form: { acres: '3', type: 'txdot', inspMode: 'nope' }, design: { ro: { C: '0.5' }, bad: undefined }, summary: { variant: 'B', v: { csj: '0001-02-003' } }, sel: null, inspLog: 'x' });
assert.strictEqual(junk.form.inspMode, 'd7');
assert.strictEqual(junk.summary.v.csj, '0001-02-003');
assert.doesNotThrow(function () { S.screenView(junk); G.byId('silt-fence'); });

console.log('ok ' + G.MEASURES.length + ' controls');
