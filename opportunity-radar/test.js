const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M = require('./model.js');
const B = require('../scripts/build-opportunities.js');
const dir = __dirname;
const T = '2026-10-25';

// ---- keywords and relevance
assert.deepStrictEqual(M.matchKeywords('Replace culvert and drainage ditch'), ['drainage', 'culvert', 'ditch']);
assert.deepStrictEqual(M.matchKeywords('Bridge-class culvert at Cedar Creek'), ['culvert', 'bridge-class']);
assert.deepStrictEqual(M.matchKeywords('Channelized right turn lane'), [], 'channelized is traffic, not a channel');
assert.ok(M.matchKeywords('HYDRAULIC CEMENT').indexOf('hydraulics') < 0, 'hydraulic cement is not hydraulics work');
assert.ok(M.matchKeywords('Storm sewer improvements').indexOf('storm-sewer') >= 0 && M.matchKeywords('Storm sewer improvements').indexOf('stormwater') < 0);
assert.ok(M.matchKeywords('stormwater detention basin').indexOf('detention') >= 0);
assert.strictEqual(M.classify(['Widen Road - Add Lanes']).rel, 'likely');
assert.strictEqual(M.classify(['Seal Coat']).rel, 'none');
assert.strictEqual(M.classify(['CULVERT REPAIR']).rel, 'direct');
assert.strictEqual(M.classify(['anything'], { sourceDirect: 'layer' }).rel, 'direct');

// ---- TxDOT Project Information
const row = { project_id: 'A00123456', control_section_job_csj: '0912-34-567', project_stage: 'PS&E', project_status: 'Active', type_of_work: 'Drainage Improvements', short_description: 'Drainage Improvements', project_description: 'Replace culverts', highway: 'FM 521', project_limits_from: 'SH 6', project_limits_to: 'CR 12', county: 'BRAZORIA', district_division: 'Houston', latitude_line_begin: '29.40', longitude_line_begin: '-95.50', latitude_line_end: '29.42', longitude_line_end: '-95.48', project_estimated_let_date: '2027-09-03T00:00:00.000', project_estimate_low_bid: '1500000.0', local_agency_name: 'FORT BEND (COUNTY)', let_type_description: 'Local Agency Let' };
const rec = M.normTxdotPI(row);
assert.strictEqual(rec.id, 'txdot:A00123456');
assert.strictEqual(rec.agency, 'TxDOT'); assert.strictEqual(rec.phase, 'design'); assert.strictEqual(rec.rel, 'direct');
assert.strictEqual(rec.county, 'Brazoria'); assert.strictEqual(rec.date, '2027-09-03'); assert.strictEqual(rec.cost, 1500000);
assert.strictEqual(rec.lat, 29.41); assert.strictEqual(rec.lon, -95.49);
assert.strictEqual(rec.sponsor, 'Fort Bend County');
assert.ok(rec.title.indexOf('SH 6 to CR 12') > 0);
assert.ok(rec.url.indexOf('data.texas.gov/resource/drau-zphx.json?project_id=A00123456') > 0);
assert.strictEqual(M.normTxdotPI(Object.assign({}, row, { project_stage: 'Construction' })), null, 'construction stage dropped');
assert.strictEqual(M.normTxdotPI(Object.assign({}, row, { type_of_work: 'Seal Coat', short_description: 'Seal Coat', project_description: 'seal coat', project_name: 'x' })), null, 'non-drainage dropped');
assert.strictEqual(M.normTxdotPI(Object.assign({}, row, { latitude_line_begin: '0', longitude_line_begin: '0' })).lat, null, 'bad coordinates become unknown, not guessed');
assert.strictEqual(M.normTxdotPI(Object.assign({}, row, { project_estimate_low_bid: '0.0' })).cost, null, 'zero cost = unknown');
assert.ok(M.mergeTracker(rec, { PROJ_ID: 'A00123456', PSE_30_ACTL_DT: Date.UTC(2026, 2, 1), TXDOT_CNTCT_NM: 'Pat Doe' }));
assert.ok(rec.extra.some((e) => e[0] === 'PS&E 30% (actual)' && e[1] === '2026-03-01') && rec.tracker === true);

// ---- City of Houston
const stormLayer = M.COH_LAYERS.find((l) => l.id === 7), streetLayer = M.COH_LAYERS.find((l) => l.id === 2);
const coh = M.normCohCip({ OBJECTID: 5, CIP_NO: 'M-410008-0001', PROJ_NO: 'M-410008-0001', PRO_TYPE: 'MSD', PRO_DESC: 'Freeway Manor South Area: Storm Sewer Improvements ', STAGE: 'E', CONST_STAR: Date.UTC(2027, 0, 15), COUN_DIST: 'E' }, { paths: [[[-95.2, 29.6], [-95.4, 29.8]]] }, stormLayer);
assert.strictEqual(coh.phase, 'design'); assert.strictEqual(coh.rel, 'direct'); assert.strictEqual(coh.lat, 29.7); assert.strictEqual(coh.date, '2027-01-15'); assert.strictEqual(coh.cost, null);
assert.ok(coh.stage.indexOf('Design [E]') === 0);
assert.strictEqual(M.normCohCip({ OBJECTID: 6, CIP_NO: 'X', PRO_DESC: 'Sidewalk', STAGE: 'E' }, null, streetLayer), null, 'street layer needs a drainage keyword');
assert.ok(M.normCohCip({ OBJECTID: 7, CIP_NO: 'Y', PRO_DESC: 'Street and Drainage Improvements', STAGE: 'F' }, null, streetLayer), 'street layer with drainage keyword kept');
assert.strictEqual(M.normCohCip({ OBJECTID: 8, CIP_NO: 'Z', PRO_DESC: 'Storm Sewer', STAGE: 'CP' }, null, stormLayer), null, 'complete dropped');
const sw = M.normSwmb({ OBJECTID: 9, ProjectID: 'SWAT-26-1', PROJECTNAME: '1 Main St', STATUS: 'In Design', XCENTER: -95.4, YCENTER: 29.7, PROJECTSCOPE: 'Storm Sewer Improvement', STARTDATE: Date.UTC(2026, 11, 1) });
assert.strictEqual(sw.phase, 'design'); assert.strictEqual(sw.date, '2026-12-01'); assert.strictEqual(sw.lat, 29.7);
assert.strictEqual(M.normSwmb({ OBJECTID: 10, STATUS: 'Construction Complete', PROJECTNAME: 'x' }), null);
assert.strictEqual(M.normSwmb({ OBJECTID: 11, STATUS: 'In Design', PROJECTNAME: 'x', XCENTER: 0, YCENTER: 0 }).lat, null);

// ---- HCFCD maintenance (LJA-hosted)
const hm = M.normHcfcdMaint({ project_id: 'K124-00-00-X041', med_stage: 'Design', med_type_of_work: 'NSCD Channel Repairs', med_cost_estimate: 3000000, first_advert_or_oncall_transfer: '2026-07-10', watershed_name: 'Cypress Creek', med_designer: 'JMT' }, { x: -95.47, y: 30.05 });
assert.strictEqual(hm.phase, 'design'); assert.strictEqual(hm.date, '2026-07-10'); assert.strictEqual(hm.cost, 3000000); assert.ok(hm.extra.some((e) => e[1] === 'JMT'));
assert.strictEqual(M.normHcfcdMaint({ project_id: 'A', med_stage: 'Completed' }, null), null);
assert.strictEqual(M.normHcfcdMaint({ project_id: 'A', med_stage: 'Design', first_advert_or_oncall_transfer: 'Task Complete' }, null).date, null, 'non-date text is not turned into a date');

// ---- HCFCD bid page
const bidHtml = '<table><tr><th>SN</th><th>Job #</th><th>Request for Qualifications (RFQ)</th><th>Weblinks</th></tr>' +
  '<tr><td>1</td><td>26/0159</td><td>RFSQ - Professional Engineering/Architectural Services for Halls Bayou Channel Conveyance Improvements Phase II</td><td><a href="https://harriscountytx.bonfirehub.com/opportunities/237384">WEB LINK</a></td></tr>' +
  '<tr><td>2</td><td>25/0397</td><td>ITB - Supply of Various Species of Native Seed</td><td><a href="https://harriscountytx.bonfirehub.com/opportunities/213108">WEB LINK</a></td></tr>' +
  '<tr><td>3</td><td>25/0218</td><td>P118-26-00-E001 - Helms Stormwater Detention Basin and Conveyance Improvements</td><td><a href="https://harriscountytx.bonfirehub.com/opportunities/192214">WEB LINK</a></td></tr>' +
  '<tr><td>3</td><td>25/0167</td><td>Z100-00-00-Y153 - Deferred Maintenance Portfolio Management</td><td><a href="https://harriscountytx.bonfirehub.com/opportunities/186543">WEB LINK</a></td></tr></table>';
const bids = M.parseHcfcdBids(bidHtml);
assert.strictEqual(bids.length, 3, 'seed ITB dropped (no drainage words, no HCFCD unit prefix); others kept');
assert.strictEqual(bids[0].url, 'https://harriscountytx.bonfirehub.com/opportunities/237384');
assert.strictEqual(bids[0].date, undefined === bids[0].date ? undefined : null, 'no due date invented'); assert.ok(!bids[0].date);
assert.strictEqual(bids[0].kind, 'procurement');
assert.ok(bids.some((b) => b.id === 'hcfcd-bid:25/0167' && b.rel === 'direct'));

// ---- TxDOT PEPS pages
const pepsHtml = '<table><tr><td>Project ID</td><td>Closing Date</td><td>Fiscal Year</td><td>Wave</td><td>Work Type</td><td>Service Center</td></tr><tr><td>601CT0000006465</td><td>06/25/2026</td><td>2026</td><td>4</td><td>PS&amp;E</td><td>Central Service Center</td></tr><tr><td>601CT0000006468</td><td>06/23/2026</td><td>2026</td><td>4</td><td>ENGR</td><td>Service Center for Divisions</td></tr><tr><td>601CT0000006208</td><td>03/24/25</td><td>2025</td><td>3</td><td>H&amp;H</td><td>Houston Service Center</td></tr></table>';
const peps = M.parsePepsSelected(pepsHtml, 2026);
assert.strictEqual(peps.length, 1); assert.strictEqual(peps[0].date, '2026-06-25'); assert.strictEqual(peps[0].work, 'PS&E'); assert.strictEqual(peps[0].rel, 'likely');
assert.strictEqual(M.parsePepsSelected(pepsHtml, 2025).length, 2);
const mtgHtml = '<table><tbody><tr><td>Date</td><td>Description</td><td>Location</td></tr><tr><td>03/13/2026</td><td><a href="/business/peps/opportunities/meetings/x.html">Pre-Wave Project Information Meeting – Hamilton Relief Route – US 281/SH 36 PS&amp;E – Waco District</a></td><td>Waco</td></tr><tr><td>08/12/2026</td><td><a href="/b/y.html">Pre-RFP Meeting – Routine Bridge Inspection – Bridge Division</a></td><td>Virtual</td></tr></tbody></table>';
const mtg = M.parsePepsMeetings(mtgHtml);
assert.strictEqual(mtg.length, 1); assert.strictEqual(mtg[0].date, '2026-03-13'); assert.strictEqual(mtg[0].district, 'Waco District');
assert.strictEqual(mtg[0].url, 'https://www.txdot.gov/business/peps/opportunities/meetings/x.html');

// ---- xlsx reader + projected contracts (fixture is a real .xlsx written with openpyxl)
const rows = B.xlsxRows(fs.readFileSync(path.join(dir, 'test-fixtures', 'mini-projected-contracts.xlsx')));
assert.ok(rows.length >= 5);
assert.ok(/Wave 3/.test(rows[2][0]) && rows[2][1] === 'Hydraulics / Hydrological' && rows[2][12] === 5000000);
assert.ok(rows[2][7].indexOf('& more <test>.') > 0, 'xml entities decoded');
const pcl = M.parseProjectedContracts(rows, 'https://example.test/pcl.xlsx', 'FY2099');
assert.strictEqual(pcl.length, 3);
assert.strictEqual(pcl[0].rel, 'direct'); assert.strictEqual(pcl[0].date, '2099-03-01'); assert.strictEqual(pcl[0].cost, 5000000); assert.strictEqual(pcl[0].district, 'Houston District');
assert.strictEqual(pcl[1].rel, 'direct', 'PS&E with drainage words in the description'); assert.strictEqual(pcl[1].county, 'Hamilton');
assert.strictEqual(pcl[2].rel, 'none'); assert.strictEqual(pcl[2].cost, null, 'TBD value stays unknown');

// ---- TWDB FIF
const fif = M.normFif({ Project_ID: 61000438, Name: 'Greens Bayou Drainage Mitigation', Project_Sponsor: 'Harris County', FIF_Project_Type: 'FME', Estimated_Costs: 30000, TWDB_Flood_Planning_Region: 6, Community_Cost_Share_Estimate: 7500 });
assert.strictEqual(fif.kind, 'funding'); assert.strictEqual(fif.cost, 30000); assert.ok(!fif.lat && !fif.date); assert.strictEqual(fif.sponsor, 'Harris County');

// ---- geography
global.window = {}; eval(fs.readFileSync(path.join(dir, 'texas-geo.js'), 'utf8').replace('window.TX_GEO=', 'global.TX_GEO='));
assert.strictEqual(TX_GEO.counties.length, 254, 'Texas has 254 counties');
const cent = M.countyCentroids(TX_GEO);
assert.ok(cent.harris[0] > -95.8 && cent.harris[0] < -95.0 && cent.harris[1] > 29.5 && cent.harris[1] < 30.2, 'Harris County centroid near Houston');
const ap = [{ src: 'txdot-pi', county: 'Harris', id: 'a' }, { src: 'coh-swmb', county: 'Harris', id: 'b' }, { src: 'txdot-pi', county: 'Harris', lat: 29.7, lon: -95.3, id: 'c' }];
assert.strictEqual(M.applyApprox(ap, cent), 1, 'centroid only for TxDOT rows that name a county but have no coordinates');
assert.ok(ap[0].alat && !ap[1].alat && !ap[2].alat);

// ---- filters, aggregation, CSV
const recs = [
  { id: '1', agency: 'TxDOT', kind: 'project', phase: 'design', rel: 'direct', kw: ['culvert'], title: 'Culvert on FM 1', county: 'Harris', date: '2026-11-05', lat: 29.7, lon: -95.3, src: 'txdot-pi', url: 'u' },
  { id: '2', agency: 'HCFCD', kind: 'procurement', phase: 'procure', rel: 'direct', kw: [], title: 'Halls Bayou RFSQ', county: 'Harris', src: 'hcfcd-bids' },
  { id: '3', agency: 'TxDOT', kind: 'project', phase: 'early', rel: 'likely', kw: [], title: 'Widen SH 99, "quoted"', county: 'Waller', date: '2027-02-01', alat: 30, alon: -96, src: 'txdot-pi' },
  { id: '4', agency: 'TxDOT', kind: 'procurement', phase: 'procure', rel: 'none', kw: [], title: 'CEI services', src: 'txdot-pcl' }
];
const ids = (f, w) => M.filterRecords(recs, f, w).map((r) => r.id).join(',');
assert.strictEqual(ids({}), '1,2,3', 'default hides non-drainage');
assert.strictEqual(ids({ rel: 'all' }), '1,2,3,4');
assert.strictEqual(ids({ rel: 'direct' }), '1,2');
assert.strictEqual(ids({ agencies: ['HCFCD'] }), '2');
assert.strictEqual(ids({ kinds: ['procurement'] }), '2');
assert.strictEqual(ids({ kw: ['culvert'] }), '1');
assert.strictEqual(ids({ q: 'halls bayou' }), '2');
assert.strictEqual(ids({ q: 'harris culvert' }), '1');
assert.strictEqual(ids({ houston: true }), '1,2,3', 'Harris and Waller are both Houston-area');
assert.ok(!M.inHoustonArea({ src: 'txdot-pi', county: 'Dallas', agency: 'TxDOT' }), 'Dallas is not Houston-area');
assert.strictEqual(ids({ located: true }), '1,3');
assert.strictEqual(ids({ month: '2026-11' }), '1');
assert.strictEqual(ids({ watchOnly: true }, { 3: 1 }), '3');
assert.deepStrictEqual(M.sortedCounts(M.countBy(recs, (r) => r.agency)), [['TxDOT', 3], ['HCFCD', 1]]);
assert.strictEqual(M.daysUntil('2026-11-01', T), 7);
assert.strictEqual(M.fmtMoney(null), 'unknown'); assert.strictEqual(M.fmtMoney(1250000), '$1.25M'); assert.strictEqual(M.fmtMoney(450000), '$450K');
assert.strictEqual(M.fmtDate('2026-11-05'), 'Nov 5, 2026'); assert.strictEqual(M.fmtDate(null), 'unknown');
const csv = M.toCSV(recs.slice(0, 3), [{ id: 'txdot-pi', name: 'TxDOT PI' }]);
const lines = csv.trim().split('\r\n');
assert.strictEqual(lines.length, 4); assert.ok(lines[0].startsWith('agency,kind,title'));
assert.ok(lines[3].indexOf('"Widen SH 99, ""quoted"""') > 0, 'CSV quoting');
assert.ok(lines[3].indexOf('county centroid (inferred)') > 0, 'approx location flagged in CSV');
assert.ok(lines[3].indexOf('likely (inferred)') > 0);

// ---- shipped data file
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'opportunities.json'), 'utf8'));
assert.ok(!isNaN(Date.parse(data.generatedAt)), 'generatedAt');
assert.ok(data.records.length > 500, 'snapshot has real records');
const srcIds = {}; data.sources.forEach((s) => { srcIds[s.id] = s; assert.ok(['ok', 'stale', 'failed'].includes(s.status), 'status ' + s.id); assert.ok(s.name && s.page && s.type, 'source meta ' + s.id); });
const seen = {};
data.records.forEach((r) => {
  assert.ok(r.id && r.src && r.agency && r.title && r.phase && r.kind, 'required fields ' + r.id);
  assert.ok(!seen[r.id], 'unique id ' + r.id); seen[r.id] = 1;
  assert.ok(srcIds[r.src], 'known source ' + r.id);
  assert.ok(M.PHASES.some((p) => p.id === r.phase), 'known phase ' + r.id);
  assert.ok(/^https:\/\//.test(r.url), 'https url ' + r.id);
  if (r.lat !== undefined) assert.ok(r.lat > 25.5 && r.lat < 36.8 && r.lon > -106.8 && r.lon < -93.3, 'coords in Texas ' + r.id);
  if (r.date !== undefined) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date), 'iso date ' + r.id);
  if (r.cost !== undefined) assert.ok(typeof r.cost === 'number' && r.cost > 0, 'cost positive ' + r.id);
  if (r.alat !== undefined) assert.ok(r.src === 'txdot-pi' && r.lat === undefined, 'approx only for TxDOT rows without coordinates ' + r.id);
  assert.ok(['direct', 'likely', 'none'].includes(r.rel), 'rel ' + r.id);
  if (r.rel !== 'none') assert.ok(r.why, 'relevance basis stated ' + r.id);
  if (r.rel === 'none') assert.strictEqual(r.src, 'txdot-pcl', 'only the projected-contracts list keeps non-relevant rows');
});
['txdot-pi', 'coh-cip', 'coh-swmb', 'hcfcd-maint'].forEach((s) => assert.ok(data.records.some((r) => r.src === s), 'has records from ' + s));

// ---- page wiring
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
['style.css', 'texas-geo.js', 'model.js', 'map.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png', '../home-btn.css'].forEach((f) => {
  assert.ok(html.includes(f), 'index.html references ' + f);
  assert.ok(fs.existsSync(path.join(dir, f)), 'file exists ' + f);
});
assert.ok(html.includes('width=device-width') && html.includes('href="../"'));
JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8')).icons.forEach((i) => assert.ok(fs.existsSync(path.join(dir, i.src)), 'manifest icon ' + i.src));
assert.ok(!/sample data|fake|dummy|lorem/i.test(fs.readFileSync(path.join(dir, 'app.js'), 'utf8').replace(/no sample data is substituted/g, '')), 'no sample data in the app');
console.log('ok ' + data.records.length + ' records, ' + data.sources.length + ' sources');
