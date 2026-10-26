const assert = require('assert');
const fs = require('fs');
const M = require('./model.js');
const S = require('./sources.js');
const T = '2026-10-25';
const ctx = { today: T, now: '2026-10-25T12:00:00.000Z' };
const run = (st, line) => M.run(st, line, ctx);
const text = (r) => r.out.map((b) => b.s || (b.o && b.o.title) || '').join('\n');

// ---- dates, money, stage keys
assert.strictEqual(M.parseDate('+7', T), '2026-11-01');
assert.strictEqual(M.parseDate('+2w', T), '2026-11-08');
assert.strictEqual(M.parseDate('tomorrow', T), '2026-10-26');
assert.strictEqual(M.parseDate('2026-02-30', T), null);
assert.strictEqual(M.parseDate('-', T), '');
assert.strictEqual(M.daysUntil('2026-11-01', T), 7);
assert.strictEqual(M.daysUntil('2026-10-20', T), -5);
assert.strictEqual(M.daysUntil('2027-01-01', '2026-12-31'), 1);
assert.strictEqual(M.parseMoney('450k'), 450000);
assert.strictEqual(M.parseMoney('$1,200,000'), 1200000);
assert.strictEqual(M.parseMoney('1.2M'), 1200000);
assert.strictEqual(M.parseMoney('abc'), null);
assert.strictEqual(M.parseMoney('-5'), null);
assert.strictEqual(M.fmtMoney(450000), '$450K');
assert.strictEqual(M.fmtMoney(1250000), '$1.25M');
assert.strictEqual(M.fmtMoney(2000000), '$2M');
assert.strictEqual(M.fmtMoney(null), '--');
assert.strictEqual(M.stageKey('pursue'), 'Pursue');
assert.strictEqual(M.stageKey('NO-BID'), 'No-bid');
assert.strictEqual(M.stageKey('nobid'), 'No-bid');
assert.strictEqual(M.stageKey('short'), 'Shortlisted');
assert.strictEqual(M.stageKey('p'), null); // ambiguous
assert.strictEqual(M.stageKey('zzz'), null);
assert.deepStrictEqual(M.dueFlag(-1), { key: 'past', label: 'PAST DUE' });
assert.strictEqual(M.dueFlag(7).key, 'd7');
assert.strictEqual(M.dueFlag(8).key, 'd14');
assert.strictEqual(M.dueFlag(14).key, 'd14');
assert.strictEqual(M.dueFlag(15).key, 'ok');

// ---- ships empty
let st = M.newState();
assert.strictEqual(st.opps.length, 0);
let r = run(st, 'list');
assert.ok(/No opportunities yet/.test(text(r)));
const s0 = M.stats([], T);
assert.strictEqual(s0.winRate, null);
assert.strictEqual(s0.active, 0);
assert.strictEqual(M.pipelineBoxes([]).length, 7);
assert.ok(M.pipelineBoxes([]).every((b) => b.n === 0));
assert.ok(/Nothing|No opportunities/.test(text(run(st, 'due'))));
assert.ok(/No opportunities/.test(text(run(st, 'stats'))));
assert.ok(run(st, 'export csv').fx.download === undefined);
assert.ok(run(st, 'add').fx.openForm === 'new');

// ---- add via command
r = run(st, 'add "Sample A" agency=TxDOT fee=500k pwin=60 due=+7 stage=pursue district=Houston');
assert.ok(r.changed);
assert.strictEqual(st.opps.length, 1);
let a = st.opps[0];
assert.strictEqual(a.id, 1); assert.strictEqual(a.title, 'Sample A'); assert.strictEqual(a.fee, 500000);
assert.strictEqual(a.pwin, 60); assert.strictEqual(a.due, '2026-11-01'); assert.strictEqual(a.stage, 'Pursue');
assert.strictEqual(M.weighted(a), 300000);
r = run(st, 'add Plain title words');
assert.strictEqual(st.opps[1].title, 'Plain title words'); assert.strictEqual(st.opps[1].stage, 'Identified');
r = run(st, 'add Bad fee=xyz');
assert.ok(/ERR/.test(text(r))); assert.strictEqual(st.opps.length, 2);
r = run(st, 'add agency=TxDOT');
assert.ok(/needs a title/.test(text(r)));
r = run(st, 'add X url=javascript:alert(1)');
assert.ok(/URL/.test(text(r))); assert.strictEqual(st.opps.length, 2);
r = run(st, 'add Y pwin=101');
assert.ok(/PWIN/.test(text(r)));
r = run(st, 'add Z bogus=1');
assert.ok(/unknown field/.test(text(r)));

// ---- edit / stage / show / delete / undo
r = run(st, 'edit 2 agency=HCFCD fee=1.2m pwin=30 due=2026-10-20 dueKind=Proposal next="call partner" nextdate=+3');
assert.ok(r.changed, text(r));
let b = M.find(st, 2);
assert.strictEqual(b.agency, 'HCFCD'); assert.strictEqual(b.fee, 1200000); assert.strictEqual(b.next, 'call partner'); assert.strictEqual(b.nextDate, '2026-10-28');
assert.ok(run(st, 'edit 2').fx.openForm === 2);
assert.ok(/no opportunity #99/.test(text(run(st, 'edit 99 fee=1'))));
assert.ok(/ERR/.test(text(run(st, 'edit 2 fee=oops'))));
assert.strictEqual(M.find(st, 2).fee, 1200000, 'failed edit must not change data');
r = run(st, 'stage 2 teaming'); assert.strictEqual(b.stage, 'Teaming');
r = run(st, 'stage 2 nonsense'); assert.ok(/unknown stage/.test(text(r)));
r = run(st, 'stage 1'); assert.ok(r.out.some((x) => x.k === 'chips'));
r = run(st, 'show 1'); assert.ok(r.out.some((x) => x.k === 'detail'));
assert.ok(r.out.find((x) => x.k === 'chips').chips.some((c) => c.cmd === 'stage 1 Teaming'));
r = run(st, 'stage 1 no-bid'); assert.strictEqual(r.fx.stamp, 'NO-BID');
r = run(st, 'stage 1 pursue');
r = run(st, 'delete 1'); assert.strictEqual(st.opps.length, 1);
r = run(st, 'undo'); assert.strictEqual(st.opps.length, 2);
assert.ok(/nothing to undo/.test(text(run(st, 'undo'))));
r = run(st, 'add Third'); assert.strictEqual(st.opps[2].id, 3);
run(st, 'delete 3'); run(st, 'add Fourth'); assert.strictEqual(st.opps[st.opps.length - 1].id, 4, 'ids are never reused');

// ---- filter / sort
st = M.newState();
run(st, 'add "A one" agency=TxDOT fee=100k pwin=50 stage=pursue due=+10');
run(st, 'add "B two" agency=HCFCD fee=300k pwin=20 stage=teaming due=+3');
run(st, 'add "C three" agency=TxDOT fee=200k pwin=90 stage=won');
run(st, 'add "D four" agency="City of Houston" stage=lost due=2026-01-01');
r = run(st, 'filter agency=txdot stage=pursue');
assert.deepStrictEqual(M.visible(st).map((o) => o.id), [1]);
run(st, 'filter stage=active'); assert.deepStrictEqual(M.visible(st).map((o) => o.id).sort(), [1, 2]);
run(st, 'filter stage=closed'); assert.deepStrictEqual(M.visible(st).map((o) => o.id).sort(), [3, 4]);
run(st, 'filter stage=pursue,teaming'); assert.strictEqual(M.visible(st).length, 2);
run(st, 'filter q=three'); assert.deepStrictEqual(M.visible(st).map((o) => o.id), [3]);
assert.ok(/unknown filter key/.test(text(run(st, 'filter foo=1'))));
assert.ok(/unknown stage/.test(text(run(st, 'filter stage=wat'))));
run(st, 'filter off'); assert.strictEqual(M.visible(st).length, 4);
run(st, 'sort due');
assert.deepStrictEqual(M.visible(st).map((o) => o.id), [4, 2, 1, 3], 'dated first ascending; undated last');
run(st, 'sort due desc');
assert.deepStrictEqual(M.visible(st).map((o) => o.id), [1, 2, 4, 3], 'undated stay last when descending');
run(st, 'sort fee'); assert.deepStrictEqual(M.visible(st).map((o) => o.id).slice(0, 3), [2, 3, 1]);
run(st, 'sort weighted'); assert.strictEqual(M.visible(st)[0].id, 3);
assert.ok(/sort keys/.test(text(run(st, 'sort bogus'))));
assert.ok(/direction/.test(text(run(st, 'sort fee sideways'))));

// ---- due / flags
st = M.newState();
run(st, 'add Past stage=proposal due=-3');
run(st, 'add Soon stage=pursue due=+5');
run(st, 'add Mid stage=pursue due=+12');
run(st, 'add Far stage=identified due=+40');
run(st, 'add Subm stage=submitted due=-20 next="follow up" nextdate=+2');
run(st, 'add Closed stage=lost due=-30');
const de = M.dueEntries(st.opps, T);
assert.deepStrictEqual(de.map((e) => e.o.title), ['Past', 'Subm', 'Soon', 'Mid', 'Far']);
assert.ok(!de.some((e) => e.o.title === 'Subm' && e.kind === 'deadline'), 'submitted deadlines are not flagged');
assert.ok(!de.some((e) => e.o.title === 'Closed'));
assert.strictEqual(M.dueEntries(st.opps, T, 14).length, 4);
const s1 = M.stats(st.opps, T);
assert.strictEqual(s1.past, 1); assert.strictEqual(s1.d7, 1); assert.strictEqual(s1.d14, 1);
assert.ok(/ERR/.test(text(run(st, 'due abc'))));
assert.ok(run(st, 'due 7').out.some((x) => x.k === 'due'));

// ---- stats: weighted, win rate, boxes, series
st = M.newState();
run(st, 'add A agency=TxDOT fee=1m pwin=50 stage=pursue due=2026-10-30');
run(st, 'add B agency=txdot fee=500k pwin=20 stage=proposal due=2026-12-05');
run(st, 'add C agency=HCFCD fee=200k pwin=100 stage=won');
run(st, 'add D agency=HCFCD fee=100k pwin=0 stage=lost');
run(st, 'add E fee=300k pwin=10 stage=identified');
run(st, 'add F agency=METRO stage=no-bid');
const s2 = M.stats(st.opps, T);
assert.strictEqual(s2.active, 3); assert.strictEqual(s2.closed, 3);
assert.strictEqual(s2.feeActive, 1800000);
assert.strictEqual(s2.weightedActive, 500000 + 100000 + 30000);
assert.strictEqual(s2.winRate, 0.5);
assert.strictEqual(s2.wonFee, 200000);
assert.strictEqual(s2.byAgency[0].agency, 'TxDOT'); assert.strictEqual(s2.byAgency[0].n, 2, 'agency grouping is case-insensitive');
assert.strictEqual(s2.byAgency.length, 2 + 1 - 1 + 0 || 2); // TxDOT + (none)
const boxes = M.pipelineBoxes(st.opps);
assert.strictEqual(boxes.find((x) => x.k === 'result').n, 3);
assert.strictEqual(boxes.find((x) => x.k === 'pursue').n, 1);
const ms = M.monthSeries(st.opps, T, 6);
assert.deepStrictEqual(ms.labels, ['OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR']);
assert.strictEqual(ms.values[0], 500000); assert.strictEqual(ms.values[2], 100000);
assert.strictEqual(ms.undated, 1);
const txt = text(run(st, 'stats'));
assert.ok(/WIN RATE/.test(JSON.stringify(run(st, 'stats').out)));
assert.ok(M.bar(5, 10, 10).length === 10);
assert.ok(M.bar(0, 0, 10) === '\u2591'.repeat(10));

// ---- CSV / JSON round trip, formula guard, quotes, import modes
st = M.newState();
run(st, 'add "Comma, title" agency=TxDOT fee=250k pwin=45 stage=teaming due=2026-12-01 notes="line1"');
M.find(st, 1).title = 'Comma, "quote" title'; M.find(st, 1).notes = 'multi\nline, with "quotes"';
run(st, 'add "=HYPERLINK(1)" fee=1k');
run(st, 'add Plain url=https://example.com/x');
const csv = M.toCSV(st.opps);
assert.ok(csv.includes("'=HYPERLINK(1)"), 'formula guard');
const pc = M.parseImport(csv);
assert.strictEqual(pc.format, 'csv'); assert.strictEqual(pc.opps.length, 3);
assert.strictEqual(pc.opps[0].title, 'Comma, "quote" title'); assert.strictEqual(pc.opps[0].notes, 'multi\nline, with "quotes"');
assert.strictEqual(pc.opps[1].title, '=HYPERLINK(1)'); assert.strictEqual(pc.opps[0].fee, 250000); assert.strictEqual(pc.opps[0].pwin, 45);
assert.strictEqual(pc.opps[0].due, '2026-12-01'); assert.strictEqual(pc.opps[2].url, 'https://example.com/x');
const json = M.toJSON(st, ctx.now);
const pj = M.parseImport(json); assert.strictEqual(pj.format, 'json'); assert.deepStrictEqual(pj.opps.map((o) => o.title), st.opps.map((o) => o.title));
const st2 = M.newState();
M.applyImport(st2, pj.opps, 'replace', ctx.now);
assert.deepStrictEqual(st2.opps.map((o) => o.id), [1, 2, 3]); assert.strictEqual(st2.seq, 4);
M.applyImport(st2, pj.opps, 'merge', ctx.now);
assert.strictEqual(st2.opps.length, 6); assert.deepStrictEqual(st2.opps.map((o) => o.id), [1, 2, 3, 4, 5, 6]);
assert.ok(M.parseImport('').error); assert.ok(M.parseImport('{"x":1}').error); assert.ok(M.parseImport('a,b\n1,2').error); assert.ok(M.parseImport('{bad').error);
// hostile import: bad stage, bad date, bad url, huge pwin, wrong types
const hostile = M.parseImport(JSON.stringify([{ title: 'H', stage: 'Hacked', due: 'x', url: 'javascript:1', pwin: 900, fee: 'abc', cost: -1, id: 'zz' }, null, 5, 'str']));
assert.strictEqual(hostile.opps.length, 1);
const h = hostile.opps[0];
assert.strictEqual(h.stage, 'Identified'); assert.strictEqual(h.due, ''); assert.strictEqual(h.url, ''); assert.strictEqual(h.pwin, 0); assert.strictEqual(h.fee, null); assert.strictEqual(h.cost, null);
// sanitizeState tolerates garbage and duplicate ids
const g = M.sanitizeState({ opps: [{ title: 'a', id: 1 }, { title: 'b', id: 1 }, { title: 'c' }], seq: 'x', view: { sort: 'zzz', filter: { stage: 'bogus' } } });
assert.deepStrictEqual(g.opps.map((o) => o.id), [1, 2, 3]); assert.strictEqual(g.view.sort, 'due'); assert.deepStrictEqual(g.view.filter, {});
assert.strictEqual(M.sanitizeState(null).opps.length, 0);
assert.strictEqual(M.sanitizeState({ opps: 'no' }).opps.length, 0);

// ---- example data: loud labels, deletable in one command, no URLs/CSJs
st = M.newState();
r = run(st, 'example');
assert.ok(st.opps.length >= 5);
assert.ok(st.opps.every((o) => o.example && /^\[EXAMPLE\] /.test(o.title) && /EXAMPLE ROW/.test(o.notes) && o.csj === '' && o.url === ''));
assert.ok(/already loaded/.test(text(run(st, 'example'))));
const sx = M.stats(st.opps, T); assert.ok(sx.past >= 1 && sx.d7 >= 1 && sx.d14 >= 1 && sx.winRate !== null);
run(st, 'add "Real one" agency=TxDOT');
r = run(st, 'purge example'); assert.strictEqual(st.opps.length, 1); assert.strictEqual(st.opps[0].title, 'Real one');
run(st, 'undo'); assert.ok(st.opps.length > 5);
run(st, 'wipe'); assert.strictEqual(st.opps.length, 0); run(st, 'undo'); assert.ok(st.opps.length > 5);

// ---- misc commands
assert.ok(run(st, 'help').out.length > 10);
assert.ok(run(st, 'bogus').out.some((x) => /unknown command/.test(x.s || '')));
assert.ok(run(st, 'clear').fx.clearScreen);
assert.ok(run(st, 'import').fx.openImport);
assert.ok(run(st, 'filter').fx.openFilter);
const ex = run(st, 'export json'); assert.ok(ex.fx.download && JSON.parse(ex.fx.download.text).opps.length === st.opps.length);
assert.ok(/csv$/.test(run(st, 'export csv').fx.download.name));
assert.deepStrictEqual(M.tokenize('add "a b" c=\'d e\' f'), ['add', 'a b', 'c=d e', 'f']);
assert.ok(run(st, 'show').out.some((x) => x.k === 'opp'));
assert.ok(run(st, 'sources').out.some((x) => x.k === 'source'));

// ---- sources: https only, no duplicates, no aggregators, every item documented
const urls = [];
S.SOURCES.forEach((g) => g.items.forEach((i) => {
  assert.ok(/^https:\/\//.test(i.u), i.u); assert.ok(i.n && i.d && ['curl', 'fetch'].includes(i.v), i.n); urls.push(i.u);
}));
assert.strictEqual(new Set(urls).size, urls.length);
assert.ok(urls.length >= 20);
assert.ok(!urls.some((u) => /contractradar|texasbids|starbridge|demandstar|bidscope|supabase/.test(u)));
assert.ok(S.NOT_VERIFIED.length >= 3);

// ---- app files exist & follow rules
const root = __dirname;
['index.html', 'style.css', 'app.js', 'model.js', 'sources.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].forEach((f) => assert.ok(fs.existsSync(root + '/' + f), f));
const html = fs.readFileSync(root + '/index.html', 'utf8');
assert.ok(/Planning aid - verify solicitation details at the source/i.test(html));
assert.ok(/viewport-fit=cover/.test(html));
['style.css', 'model.js', 'sources.js', 'app.js', '../home-btn.css'].forEach((f) => assert.ok(html.includes(f), f));
assert.ok(!/['"]https?:\/\/(?!www\.w3\.org)[a-z0-9]/i.test(fs.readFileSync(root + '/app.js', 'utf8')), 'app.js has no hard-coded URLs');
assert.ok(!/<script[^>]+src="https?:/.test(html) && !/@import|fonts\.googleapis/.test(fs.readFileSync(root + '/style.css', 'utf8')), 'no network assets');
console.log('capture-terminal tests ok');
