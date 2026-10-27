// Capture file tests. Run: node national-radar/test-capture.js (also run by test.js)
const assert = require('assert');
const C = require('./capture.js');

// ---- clean(): old data and hand-edited data become safe, complete entries
let c = C.clean({});
assert.deepStrictEqual([c.decision, c.due, c.incumbent, c.notes], ['Undecided', '', '', '']);
assert.strictEqual(C.clean(null).decision, 'Undecided');
assert.strictEqual(C.clean({ decision: 'go' }).decision, 'Go');
assert.strictEqual(C.clean({ decision: 'No go' }).decision, 'No-go');
assert.strictEqual(C.clean({ decision: 'NO-GO' }).decision, 'No-go');
assert.strictEqual(C.clean({ decision: 'maybe' }).decision, 'Undecided');
assert.strictEqual(C.clean({ due: '2026-02-30' }).due, '', 'impossible date is dropped');
assert.strictEqual(C.clean({ due: '11/05/2026' }).due, '', 'only YYYY-MM-DD is kept');
assert.strictEqual(C.clean({ due: '2028-02-29' }).due, '2028-02-29', 'leap day is valid');
assert.strictEqual(C.clean({ notes: 'x'.repeat(9000) }).notes.length, 5000, 'notes are length-limited');
assert.strictEqual(C.clean({ snap: { url: 'javascript:alert(1)', title: 't' } }).snap.url, '', 'only http(s) links are kept');
assert.ok(C.isEmpty(C.blank()) && !C.isEmpty(C.clean({ notes: 'hi' })) && !C.isEmpty(C.clean({ decision: 'Go' })));

// ---- due-date flag: within 14 days of today (US Central today supplied by the caller)
const T = '2026-10-26';
const flag = (d) => C.dueInfo(d, T).flag;
assert.strictEqual(flag(''), 'none');
assert.strictEqual(flag('2026-10-25'), 'overdue');
assert.strictEqual(flag('2026-10-26'), 'soon', 'due today is flagged');
assert.strictEqual(flag('2026-11-09'), 'soon', 'day 14 is flagged');
assert.strictEqual(flag('2026-11-10'), 'later', 'day 15 is not');
assert.strictEqual(C.dueInfo('2026-11-09', T).days, 14);
assert.strictEqual(C.dueInfo('2027-01-05', '2026-12-30').days, 6, 'across a year end');
assert.strictEqual(C.dueText('2026-10-27', T), 'Due tomorrow'); assert.strictEqual(C.dueText('2026-10-26', T), 'Due today');
assert.strictEqual(C.dueText('2026-10-20', T), 'Overdue by 6 days'); assert.strictEqual(C.dueText('', T), 'No due date');

// ---- sorting
const rows = [
  { id: 'a', cap: C.clean({ decision: 'No-go', due: '2026-11-01' }) },
  { id: 'b', cap: C.clean({ decision: 'Go' }) },
  { id: 'c', cap: C.clean({ decision: 'Undecided', due: '2026-10-30' }) },
  { id: 'd', cap: C.clean({ decision: 'Go', due: '2026-12-01' }) },
  { id: 'e', cap: C.clean({ decision: 'Go', due: '2026-11-15' }) },
  { id: 'f' } // no capture file at all
];
assert.deepStrictEqual(C.sortRows(rows, 'due').map((r) => r.id), ['c', 'a', 'e', 'd', 'b', 'f'], 'soonest due first, undated last in original order');
assert.deepStrictEqual(C.sortRows(rows, 'decision').map((r) => r.id), ['e', 'd', 'b', 'c', 'f', 'a'], 'Go, then Undecided, then No-go; due date inside each group');
assert.deepStrictEqual(rows.map((r) => r.id), ['a', 'b', 'c', 'd', 'e', 'f'], 'sorting does not reorder the input');

// ---- snapshot of a record: only a source-stated fee is called a fee
const feeRec = { id: 'x1', title: 'Drainage PS&E', agency: 'TxDOT', state: 'TX', stage: 'open', src: 'sam', url: 'https://example.test/x1', amt: { v: 6500000, kind: 'maxvalue', field: 'Award$' } };
let sn = C.snapOf(feeRec, '2026-10-26');
assert.strictEqual(sn.fee, 6500000); assert.strictEqual(sn.feeKind, 'maxvalue'); assert.strictEqual(sn.notFee, null); assert.strictEqual(sn.status, 'open');
const dbRec = { id: 'x2', title: 'DB', agency: 'A', dbValue: { v: 90000000, field: 'f' }, projectCost: { v: 1, field: 'g' }, url: 'https://example.test/x2' };
sn = C.snapOf(dbRec, '2026-10-26'); assert.strictEqual(sn.fee, null, 'a design-build value is never the fee'); assert.strictEqual(sn.notFee, 90000000); assert.ok(/NOT a fee/.test(sn.notFeeKind));
sn = C.snapOf({ id: 'x3', title: 'P', projectCost: { v: 75000000, field: 'cost' } }, ''); assert.strictEqual(sn.fee, null); assert.strictEqual(sn.notFee, 75000000);

// ---- CSV
const csvRows = [
  { id: 'x1', cap: C.clean({ decision: 'Go', reason: 'Strong "fit", H&H', due: '2026-10-30', incumbent: 'ACME Eng', team: 'Sub A; Sub B', contact: 'Pat 555-0100', next: 'Call PM', notes: 'line1\nline2', updated: '2026-10-26T12:00:00Z' }), snap: C.snapOf(feeRec, '2026-10-26') },
  { id: 'x2', cap: C.blank(), snap: C.snapOf(dbRec, '2026-10-26') },
  { id: 'gone', cap: C.clean({ notes: '=HYPERLINK("http://bad")' }), snap: null }
];
const csv = C.toCSV(csvRows, T);
const lines = csv.split('\r\n');
assert.strictEqual(lines[0], C.CSV_COLS.join(','));
['go_no_go', 'proposal_or_soq_due', 'incumbent_consultant', 'teaming_partners_subs', 'key_contact', 'next_action', 'notes', 'stated_consultant_fee', 'status', 'source_url'].forEach((k) => assert.ok(C.CSV_COLS.indexOf(k) >= 0, 'column ' + k));
assert.ok(csv.indexOf('"Strong ""fit"", H&H"') > 0, 'quotes are escaped');
assert.ok(csv.indexOf('"line1\nline2"') > 0, 'newlines stay inside the quoted cell');
assert.ok(csv.indexOf('6500000') > 0 && csv.indexOf('https://example.test/x1') > 0 && csv.indexOf(',soon,4,') > 0, 'fee, link, due flag and days');
assert.ok(/'=HYPERLINK/.test(csv), 'a note starting with = cannot run as a spreadsheet formula');
// x2: DB value sits in the "NOT a fee" column and the fee column is empty
const x2 = lines[2].split(','); assert.strictEqual(x2[C.CSV_COLS.indexOf('stated_consultant_fee')], ''); assert.strictEqual(x2[C.CSV_COLS.indexOf('value_that_is_NOT_a_fee')], '90000000');
assert.strictEqual(lines[3].split(',')[0], 'gone', 'a starred record missing from the snapshot still exports');

// ---- backup / restore
const watch = { x1: true, x2: true }; const caps = { x1: csvRows[0].cap };
const bk = C.makeBackup(watch, caps, '2026-10-26T13:00:00Z');
assert.strictEqual(bk.app, C.BACKUP_APP); assert.strictEqual(bk.version, 1);
let p = C.parseBackup(JSON.stringify(bk));
assert.ok(p.ok); assert.deepStrictEqual(Object.keys(p.watch).sort(), ['x1', 'x2']); assert.strictEqual(p.capture.x1.incumbent, 'ACME Eng'); assert.strictEqual(p.capture.x1.decision, 'Go');
assert.strictEqual(C.parseBackup('{not json').ok, false);
assert.strictEqual(C.parseBackup('{"app":"other","version":1}').ok, false);
assert.strictEqual(C.parseBackup(JSON.stringify(Object.assign({}, bk, { version: 9 }))).ok, false);
assert.strictEqual(C.parseBackup('[]').ok, false);
p = C.parseBackup(JSON.stringify({ app: C.BACKUP_APP, version: 1, watch: {}, capture: { y: { decision: 'GO', due: 'junk', notes: 5 }, z: 'bad', '': {} } }));
assert.ok(p.ok); assert.strictEqual(p.capture.y.decision, 'Go'); assert.strictEqual(p.capture.y.due, ''); assert.strictEqual(p.capture.y.notes, '5'); assert.strictEqual(p.skipped, 2, 'bad entries are skipped and counted'); assert.ok(p.watch.y, 'a capture file implies a star');
// merge: newer edit wins, stars are unioned, nothing is lost
const cur = { watch: { x1: true, k: true }, capture: { x1: C.clean({ notes: 'phone', updated: '2026-10-27T00:00:00Z' }), k: C.clean({ notes: 'keep' }) } };
const inc = { watch: { x1: true, x2: true }, capture: { x1: C.clean({ notes: 'older backup', updated: '2026-10-20T00:00:00Z' }), x2: C.clean({ notes: 'new from backup', updated: '2026-10-21T00:00:00Z' }) } };
let m = C.applyBackup(cur, inc, 'merge');
assert.strictEqual(m.capture.x1.notes, 'phone', 'newer edit on the device wins'); assert.strictEqual(m.capture.x2.notes, 'new from backup'); assert.strictEqual(m.capture.k.notes, 'keep');
assert.deepStrictEqual(Object.keys(m.watch).sort(), ['k', 'x1', 'x2']);
inc.capture.x1.updated = '2026-11-01T00:00:00Z'; m = C.applyBackup(cur, inc, 'merge'); assert.strictEqual(m.capture.x1.notes, 'older backup', 'newer backup wins');
m = C.applyBackup(cur, inc, 'replace'); assert.deepStrictEqual(Object.keys(m.watch).sort(), ['x1', 'x2']); assert.ok(!m.capture.k, 'replace drops what is not in the backup');
// round trip through JSON text
const rt = C.parseBackup(JSON.stringify(C.makeBackup(m.watch, m.capture, 'now'))); assert.deepStrictEqual(rt.capture, m.capture);

// ---- migration: an old watchlist ({ id: true } and no capture data) works unchanged
const old = { 'abc': true, 'def': true };
assert.deepStrictEqual(Object.keys(C.makeBackup(old, {}, '').watch).sort(), ['abc', 'def']);
assert.strictEqual(C.toCSV(Object.keys(old).map((id) => ({ id, cap: undefined, snap: undefined })), T).split('\r\n').length, 4, 'header + 2 rows + trailing newline');

// ---- the app wires it in (static checks: files, service worker, script order)
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8'), app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
assert.ok(html.indexOf('capture.js') > 0 && html.indexOf('capture.js') < html.indexOf('app.js'), 'capture.js loads before app.js');
assert.ok(sw.indexOf('./capture.js') > 0, 'service worker caches capture.js');
assert.ok(/national-radar-v([4-9]|\d\d)/.test(sw), 'service worker cache version was bumped past v3');
assert.ok(app.indexOf("'nr.watch'") > 0, 'existing nr.watch key is still read'); assert.ok(app.indexOf("'nr.capture'") > 0);
['capBar', 'btnCapCsv', 'btnBackup', 'btnRestore', 'btnRestoreAll', 'restoreFile', 'capSort'].forEach((id) => assert.ok(html.indexOf('id="' + id + '"') > 0, id + ' exists in the page'));
console.log('national-radar capture tests passed');
