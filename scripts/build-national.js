#!/usr/bin/env node
/* Builds national-radar/data/national.json from public sources. No API keys needed (an optional SAM_API_KEY is wired in but not required).
   Run by hand (`node scripts/build-national.js`) or from the scheduled workflow (national-radar/workflow/refresh-national.yml). Node 18+.
   Each source is isolated: if one fails, its last records are kept and marked "stale". Every figure is a figure a source states;
   nothing is estimated. All rules live in national-radar/model.js. Raw downloads are cached in scripts/.cache-national/ (git-ignored). */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { StringDecoder } = require('string_decoder');
const M = require('../national-radar/model.js');
const P = require('../national-radar/proj.js');
const RM = require('../opportunity-radar/model.js');
const { xlsxRows, unzip } = require('./build-opportunities.js');
const R = require('../national-radar/roadway.js');
const CM = require('../national-radar/cost.js');
const PS = require('../national-radar/pse.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'national-radar', 'data', 'national.json');
const OUT_RW = path.join(ROOT, 'national-radar', 'data', 'roadway.json');
const OUT_PSE = path.join(ROOT, 'national-radar', 'data', 'pse.json');
const OUT_PRICES = path.join(ROOT, 'national-radar', 'data', 'cost-prices.json');
const CACHE = path.join(__dirname, '.cache-national');
const SKIP = new Set((process.env.NR_SKIP || '').split(',').filter(Boolean)); // developer switch: skip slow sources; the main national.json is then NOT written
const UA = 'hydraulics-tools-national-radar (+https://github.com/lbonil3/hydraulics-tools)'; // not sent by default: USAspending's and Census's firewalls answer HTTP 500 / "Request Rejected" to unfamiliar user agents, so the runtime's default agent is used
const ARGS = new Set(process.argv.slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });

let lastCall = 0;
async function get(url, opts) {
  opts = opts || {};
  const gap = opts.gap === undefined ? 350 : opts.gap; let err;
  for (let i = 0; i < 3; i++) {
    const wait = lastCall + gap - Date.now(); if (wait > 0) await sleep(wait); lastCall = Date.now();
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opts.timeout || 120000);
      const headers = Object.assign({ accept: opts.accept || '*/*' }, opts.ua ? { 'user-agent': UA } : {}, opts.headers || {});
      const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body, signal: ctl.signal, redirect: 'follow' });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) { const e = new Error('HTTP ' + res.status + ' for ' + url.slice(0, 140)); e.fatal = true; throw e; }
      return opts.binary ? Buffer.from(await res.arrayBuffer()) : opts.raw ? res : await res.text();
    } catch (e) { err = e; if (e.fatal) throw e; await sleep(2000 * (i + 1)); }
  }
  throw err;
}
const getJson = async (url, opts) => JSON.parse(await get(url, Object.assign({ accept: 'application/json' }, opts)));
const qs = (o) => Object.keys(o).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');

// ---------- streaming CSV reader (RFC 4180: quoted fields, doubled quotes, newlines inside quotes) ----------
function readCsv(file, onRow) {
  return new Promise((resolve, reject) => {
    const dec = new StringDecoder('utf8'); let header = null, row = [], field = '', inQ = false, pendingQuote = false, n = 0;
    const push = () => { row.push(field); field = ''; };
    const endRow = () => { push(); if (!header) header = row.map((h) => h.replace(/^\ufeff/, '')); else if (row.length >= header.length - 1 && !(row.length === 1 && row[0] === '')) { const o = {}; for (let i = 0; i < header.length; i++) o[header[i]] = row[i] === undefined ? '' : row[i]; n++; onRow(o); } row = []; };
    const feed = (s) => {
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQ) { if (pendingQuote) { pendingQuote = false; if (c === '"') { field += '"'; continue; } inQ = false; } else if (c === '"') { pendingQuote = true; continue; } else { field += c; continue; } }
        if (pendingQuote) { pendingQuote = false; inQ = false; }
        if (c === '"' && field === '') inQ = true;
        else if (c === ',') push();
        else if (c === '\n') endRow();
        else if (c !== '\r') field += c;
      }
    };
    const rs = fs.createReadStream(file, { highWaterMark: 1 << 22 });
    rs.on('data', (b) => feed(dec.write(b))); rs.on('error', reject);
    rs.on('end', () => { feed(dec.end()); if (field !== '' || row.length) endRow(); resolve(n); });
  });
}

// ---------- context ----------
const asOfDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // US Central calendar date
const AS_OF = asOfDate();
const stats = {}; // per source funnel
function st(id) { return (stats[id] = stats[id] || { fetched: 0, evaluated: 0, byBucket: {}, excl: {}, eng: {}, sector: {}, fee: {}, samples: {} }); }
const kept = []; // evaluated records with bucket in opp/review/award/closed

function record(cand, ev) {
  rwRecord(cand);
  const s = st(cand.src);
  s.evaluated++; s.byBucket[ev.bucket] = (s.byBucket[ev.bucket] || 0) + 1; if (ev.primary && ev.bucket === 'excluded') s.primary = Object.assign(s.primary || {}, { [ev.primary]: ((s.primary || {})[ev.primary] || 0) + 1 });
  s.eng[ev.flags.eng] = (s.eng[ev.flags.eng] || 0) + 1; s.sector[ev.flags.sector] = (s.sector[ev.flags.sector] || 0) + 1; s.fee[ev.flags.fee] = (s.fee[ev.flags.fee] || 0) + 1;
  ev.excl.forEach((c) => { s.excl[c] = (s.excl[c] || 0) + 1; });
  if (ev.flags.exact20) s.exact20 = (s.exact20 || 0) + 1;
  if (ev.bucket === 'excluded') {
    const reason = ev.excl[0]; const lst = (s.samples[reason] = s.samples[reason] || []);
    const v = ev.amt ? ev.amt.v : (ev.projectCost ? ev.projectCost.v : 0);
    // keep the most interesting few: those with the largest stated figure and a sector or engineering match
    const interesting = ev.flags.eng !== 'none' || ev.flags.sector !== 'none';
    if (interesting) { lst.push({ title: cand.title.slice(0, 140), agency: cand.agency, v: v || null, url: cand.url, why: ev.excl.join(', ') }); lst.sort((a, b) => (b.v || 0) - (a.v || 0)); if (lst.length > 6) lst.length = 6; }
    return null;
  }
  const rec = M.toRecord(cand, ev, AS_OF);
  kept.push(rec); return rec;
}


// ---------- roadway lane (national-radar/roadway.js): evaluated on every candidate any source produces, separate output ----------
const rwStats = {}; const rwKept = [];
function rst(id) { return (rwStats[id] = rwStats[id] || { fetched: 0, evaluated: 0, byBucket: {}, excl: {}, rw: {}, eng: {}, road: {}, exact5: 0, drainSpecific: 0, near: [] }); }
let PRICES = {};
// ---------- PS&E / H&H lens + design-build + pipeline (national-radar/pse.js) ----------
const pseStats = {}; const pseKept = [];
function pst(id) { return (pseStats[id] = pseStats[id] || { evaluated: 0, byLens: {}, excl: {}, stage: {}, conf: {}, exact5: 0, textParsed: 0, near: [], constrNear: [] }); }
function pseRecord(cand) {
  const ev = PS.evaluatePse(cand, { asOf: AS_OF }); const s = pst(cand.src); s.evaluated++;
  if (!ev.lens) {
    ev.excl.forEach((c) => { s.excl[c] = (s.excl[c] || 0) + 1; }); s.byLens.excluded = (s.byLens.excluded || 0) + 1;
    const v = ev.amt ? ev.amt.v : null;
    if (ev.excl.indexOf('fee-below-5m') >= 0 && v >= 1000000 && ev.excl.length === 1) { s.near.push({ title: cand.title.slice(0, 120), v, why: 'fee-below-5m', url: cand.url }); s.near.sort((a, b) => b.v - a.v); if (s.near.length > 6) s.near.length = 6; }
    if (ev.excl.indexOf('construction') >= 0) { const cv = (cand.amounts || []).reduce((m, a) => Math.max(m, a.v || 0), 0); if (cv >= PS.FEE_FLOOR && ev.scope && (ev.scope.hh || ev.scope.sec.ids.length)) { s.constrNear.push({ title: cand.title.slice(0, 120), v: cv, why: 'construction', url: cand.url }); s.constrNear.sort((a, b) => b.v - a.v); if (s.constrNear.length > 6) s.constrNear.length = 6; } }
    return null;
  }
  s.byLens[ev.lens] = (s.byLens[ev.lens] || 0) + 1; s.stage[ev.stage] = (s.stage[ev.stage] || 0) + 1; if (ev.conf) s.conf[ev.conf] = (s.conf[ev.conf] || 0) + 1; if (ev.flags && ev.flags.exact5) s.exact5++; if (ev.flags && ev.flags.textParsed) s.textParsed++;
  const rec = PS.toRecordPse(cand, ev, AS_OF); pseKept.push(rec);
  if (ev.lens === 'db') { const fr = PS.designFeeRecord(cand, ev, AS_OF); if (fr) { pseKept.push(fr); s.byLens.fee = (s.byLens.fee || 0) + 1; } }
  return rec;
}
function rwRecord(cand) {
  R.decorateRw(cand);
  pseRecord(cand);
  const ev = R.evaluateRoadway(cand, { asOf: AS_OF }); const s = rst(cand.src);
  s.evaluated++; s.byBucket[ev.bucket] = (s.byBucket[ev.bucket] || 0) + 1; s.eng[ev.flags.eng] = (s.eng[ev.flags.eng] || 0) + 1; s.road[ev.flags.road || 'n/a'] = (s.road[ev.flags.road || 'n/a'] || 0) + 1;
  ev.excl.forEach((c) => { s.excl[c] = (s.excl[c] || 0) + 1; });
  if (ev.flags.exact5) { s.exact5++; (s.exact5Rows = s.exact5Rows || []).push({ title: cand.title.slice(0, 120), url: cand.url, v: ev.amt && ev.amt.v }); }
  if (ev.flags.drainSpecific) { s.drainSpecific++; if (ev.excl.length && (ev.flags.eng === 'strong' || ev.flags.eng === 'weak') && ev.flags.road !== 'none') { s.near.push({ title: cand.title.slice(0, 120), v: ev.amt ? ev.amt.v : null, why: ev.excl.join(', '), url: cand.url }); s.near.sort((a, b) => (b.v || 0) - (a.v || 0)); if (s.near.length > 8) s.near.length = 8; } }
  if (ev.rw) s.rw[ev.rw + ':' + ev.bucket] = (s.rw[ev.rw + ':' + ev.bucket] || 0) + 1;
  if (ev.bucket === 'excluded') return null;
  const rec = R.toRecordRw(cand, ev, AS_OF, PRICES); rwKept.push(rec); return rec;
}

// ---------- sources ----------
const SOURCES = [];
const meta = {}; // per-source page / description
function source(def) { SOURCES.push(def); meta[def.id] = def; }

source({
  id: 'sam', name: 'SAM.gov Contract Opportunities, public data extract (no key)', agency: 'Federal (all agencies)', page: 'https://sam.gov/data-services/Contract%20Opportunities/datagov',
  type: 'Daily CSV extract (~210 MB) of all ACTIVE notices; no API key; not CORS-open, so snapshot only',
  async run(ctx) {
    const url = 'https://s3.amazonaws.com/falextracts/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv';
    const file = path.join(CACHE, 'sam.csv'); const metaFile = file + '.etag';
    const head = await get(url, { method: 'HEAD', raw: true, gap: 0 }); const etag = head.headers.get('etag'), lm = head.headers.get('last-modified');
    if (!(fs.existsSync(file) && fs.existsSync(metaFile) && fs.readFileSync(metaFile, 'utf8') === etag)) {
      const res = await get(url, { raw: true, timeout: 900000 }); const buf = Buffer.from(await res.arrayBuffer()); fs.writeFileSync(file, buf); fs.writeFileSync(metaFile, String(etag));
    }
    const s = st('sam'); const groups = new Map(); let rows = 0;
    const asOfExtract = lm ? new Date(lm).toISOString() : null;
    await readCsv(file, (row) => {
      rows++;
      const naics = M.clean(row.NaicsCode), psc = M.clean(row.ClassificationCode);
      const eng = M.engineering(naics, psc);
      if (eng.level === 'none' && !(/^23/.test(naics))) { s.excl['not-engineering'] = (s.excl['not-engineering'] || 0) + 1; return; }
      const c = M.normSam(row); if (!c) { s.excl['notice-type-not-used'] = (s.excl['notice-type-not-used'] || 0) + 1; return; }
      // one record per solicitation: keep the latest notice (a Sources Sought, Presolicitation and Solicitation often share a Sol#)
      const key = (c.solNum ? 'S:' + c.solNum.toUpperCase() : 'T:' + c.title.toUpperCase().slice(0, 80) + '|' + c.office) + (c.status === 'awarded' ? '|A' : '|O');
      const prev = groups.get(key);
      if (!prev) groups.set(key, { c, n: 1, ids: [c.srcId] });
      else { prev.n++; prev.ids.push(c.srcId); if ((c.dates.posted || '') >= (prev.c.dates.posted || '')) { const keepIds = prev.ids, n = prev.n; groups.set(key, { c, n, ids: keepIds }); } }
    });
    s.fetched = rows; s.note = 'Extract Last-Modified ' + lm + '; ' + rows + ' active notice rows; ' + groups.size + ' distinct solicitations/awards among engineering-type NAICS/PSC or construction NAICS.';
    let n = 0;
    for (const g of groups.values()) {
      const c = g.c; if (g.n > 1) { c.fields['Notices for this Sol# in the extract'] = g.n; }
      // never let an old, long-expired notice into the main views: the deadline test handles open ones; awards need a recent award date
      const ev = M.evaluate(c, { asOf: AS_OF }); n++;
      if (c.status === 'awarded') { const ad = c.dates.award || c.dates.posted; if (ad && ad < M.addMonths(AS_OF, -24)) { s.excl['award-older-than-24-months'] = (s.excl['award-older-than-24-months'] || 0) + 1; continue; } }
      if (c.status !== 'awarded' && !c.dates.due && c.dates.posted && c.dates.posted < M.addMonths(AS_OF, -12)) { // no response date and posted > 12 months ago: treat as stale
        ev.bucket = ev.bucket === 'opp' || ev.bucket === 'review' ? 'excluded' : ev.bucket; ev.excl.push('stale-no-deadline');
      }
      if (ev.bucket === 'closed') { const due = c.dates.due; if (due && due < M.addMonths(AS_OF, -12)) { s.excl['closed-older-than-12-months'] = (s.excl['closed-older-than-12-months'] || 0) + 1; continue; } }
      record(c, ev);
    }
    s.asOf = asOfExtract; ctx.asOf.sam = asOfExtract;
    return { fetched: rows, note: s.note };
  }
});

source({
  id: 'usaspending', name: 'USAspending.gov API: awarded federal contracts (engineering PSC/NAICS, water keywords, obligated ≥ $20M)', agency: 'Federal (all agencies)', page: 'https://api.usaspending.gov/docs/endpoints',
  type: 'REST API, no key, CORS-open (snapshot only here: awards are not opportunities)',
  async run(ctx) {
    const kw = ['drainage', 'stormwater', 'storm water', 'flood', 'wastewater', 'sewer', 'hydrologic', 'hydraulic', 'levee', 'dam safety', 'coastal', 'watershed', 'reservoir', 'water treatment', 'water resources', 'civil works', 'water supply', 'water system', 'water infrastructure', 'stormwater'];
    const fields = ['Award ID', 'Recipient Name', 'Award Amount', 'Total Outlays', 'Description', 'Start Date', 'Awarding Agency', 'Awarding Sub Agency', 'NAICS', 'PSC', 'Place of Performance State Code', 'Place of Performance Country Code', 'generated_internal_id', 'Contract Award Type', 'Base Obligation Date'];
    const groups = { contracts: ['A', 'B', 'C', 'D'], idv: ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'] };
    const sets = [['PSC family C (architect-engineer services)', { psc_codes: { require: [['Service', 'C']] } }], ['NAICS 541330/541620/541690/541370', { naics_codes: { require: ['541330', '541620', '541690', '541370'] } }]];
    const all = new Map(); const s = st('usaspending'); const start = M.addMonths(AS_OF, -60);
    for (const [g, codes] of Object.entries(groups)) for (const [label, extra] of sets) {
      const filters = Object.assign({ award_type_codes: codes, time_period: [{ start_date: start, end_date: AS_OF }], award_amounts: [{ lower_bound: M.FEE_THRESHOLD }], keywords: kw }, extra);
      for (let page = 1; page <= 15; page++) {
        const j = await getJson('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filters, fields: fields.concat(g === 'idv' ? ['Last Date to Order'] : ['End Date']), limit: 100, page, sort: 'Award Amount', order: 'desc' }) });
        (j.results || []).forEach((r) => all.set(r.generated_internal_id, r));
        if (!j.page_metadata || !j.page_metadata.hasNext) break;
      }
    }
    s.fetched = all.size; s.note = 'Search = (PSC family C OR NAICS 541330/541620/541690/541370) AND description keyword (drainage, stormwater, flood, wastewater, sewer, hydrologic, levee, dam safety, coastal, watershed, reservoir, water treatment/supply/system, civil works…) AND Award Amount ≥ $20M, action dates ' + start + '..' + AS_OF + '. The API filters on the OBLIGATED amount, so an IDIQ with a ≥$20M ceiling but under $20M obligated is not returned.';
    const cands = [...all.values()].map((r) => M.normUsa(r, null));
    for (const c of cands) {
      let ev = M.evaluate(c, { asOf: AS_OF });
      if (ev.bucket !== 'excluded' || (ev.flags.eng !== 'none' && ev.flags.sector !== 'none')) { // fetch the award detail only for plausible rows (adds the base-and-all-options ceiling and the awarding office)
        try {
          const d = await getJson('https://api.usaspending.gov/api/v2/awards/' + encodeURIComponent(c.srcId) + '/');
          const lt = d.latest_transaction_contract_data || {};
          const detail = { base_and_all_options: d.base_and_all_options, office: d.awarding_agency && d.awarding_agency.office_agency_name, solicitation: lt.solicitation_identifier };
          const r = all.get(c.srcId); const c2 = M.normUsa(r, detail); c2.fields['Total obligation (detail)'] = d.total_obligation; Object.assign(c, c2);
          ev = M.evaluate(c, { asOf: AS_OF });
        } catch (e) { c.fields['Detail fetch'] = 'failed: ' + String(e.message).slice(0, 80); }
      }
      record(c, ev);
    }
    ctx.asOf.usaspending = new Date().toISOString();
    return { fetched: all.size, note: s.note };
  }
});

source({
  id: 'txdot-pcl', name: 'TxDOT Projected Contracts List (anticipated consultant contracts, with TxDOT maximum contract value)', agency: 'TxDOT', page: 'https://www.txdot.gov/business/peps/opportunities/fiscal-year-procurement-plan.html',
  type: 'XLSX download (no CORS); snapshot only',
  async run(ctx) {
    const s = st('txdot-pcl'); const now = new Date(); const fy0 = now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(); const tried = []; let n = 0;
    for (const fy of [fy0, fy0 + 1]) {
      const url = 'https://www.txdot.gov/content/dam/docs/division/ppd/projected-contracts/projected-contracts-list-' + fy + '.xlsx';
      try {
        const rows = xlsxRows(await get(url, { binary: true })); const recs = RM.parseProjectedContracts(rows, url, 'FY' + fy);
        recs.forEach((r) => { n++; const c = M.normPcl(r); const ev = M.evaluate(c, { asOf: AS_OF }); record(c, ev); });
        tried.push('FY' + fy + ': ' + recs.length + ' rows');
      } catch (e) { tried.push('FY' + fy + ': ' + String(e.message).slice(0, 60)); }
    }
    if (!n) throw new Error('no projected contracts list could be read (' + tried.join('; ') + ')');
    s.fetched = n; s.note = tried.join('; ') + '. TxDOT lists a maximum contract value for each planned consultant contract.'; ctx.asOf['txdot-pcl'] = new Date().toISOString();
    return { fetched: n, note: s.note };
  }
});

source({
  id: 'nyc', name: 'NYC City Record Online (NYC Open Data): procurement award notices with contract amounts', agency: 'City of New York', page: 'https://data.cityofnewyork.us/City-Government/City-Record-Online/dg92-zbpx',
  type: 'Socrata API, no key, CORS-open (snapshot only: these are awards)',
  async run(ctx) {
    const s = st('nyc'); const since = M.addMonths(AS_OF, -24);
    const where = "section_name='Procurement' AND type_of_notice_description='Award' AND category_description='Construction Related Services' AND contract_amount>20000000 AND start_date>'" + since + "'";
    const rows = await getJson('https://data.cityofnewyork.us/resource/dg92-zbpx.json?' + qs({ $where: where, $limit: 5000, $order: 'start_date DESC' }));
    rows.forEach((r) => { const c = M.normNyc(r); record(c, M.evaluate(c, { asOf: AS_OF })); });
    s.fetched = rows.length; s.note = 'Query: Award notices, category "Construction Related Services", contract_amount > $20M, notice date since ' + since + '. NYC solicitation / intent-to-award notices in this dataset carry no contract_amount over $20M (checked), so only awards appear.';
    ctx.asOf.nyc = new Date().toISOString(); return { fetched: rows.length, note: s.note };
  }
});

source({
  id: 'chicago', name: 'City of Chicago contracts (Chicago Data Portal): contract awards with amounts', agency: 'City of Chicago', page: 'https://data.cityofchicago.org/Administration-Finance/Contracts/rsxa-ify5',
  type: 'Socrata API, no key, CORS-open (snapshot only: these are awards)',
  async run(ctx) {
    const s = st('chicago');
    const where = "award_amount>20000000 AND (end_date>'" + AS_OF + "' OR approval_date>'" + M.addMonths(AS_OF, -24) + "')";
    const rows = await getJson('https://data.cityofchicago.org/resource/rsxa-ify5.json?' + qs({ $where: where, $limit: 5000, $order: 'award_amount DESC' }));
    // one row per contract: keep the highest revision
    const best = {}; rows.forEach((r) => { const k = r.purchase_order_contract_number; if (!best[k] || +(r.revision_number || 0) > +(best[k].revision_number || 0)) best[k] = r; });
    Object.values(best).forEach((r) => { const c = M.normChicago(r); record(c, M.evaluate(c, { asOf: AS_OF })); });
    s.fetched = rows.length; s.note = 'Query: award_amount > $20M and (end date in the future or approved in the last 24 months); highest revision per contract.'; ctx.asOf.chicago = new Date().toISOString();
    return { fetched: rows.length, note: s.note };
  }
});

source({
  id: 'dhs-apfs', name: 'DHS Acquisition Planning Forecast System (APFS): forecast procurements with dollar range', agency: 'DHS', page: 'https://apfs-cloud.dhs.gov/forecast/',
  type: 'JSON from the APFS site (undocumented, public, no key); not used live in the browser',
  async run(ctx) {
    const s = st('dhs-apfs'); const rows = await getJson('https://apfs-cloud.dhs.gov/api/forecast/', { timeout: 180000 });
    if (!Array.isArray(rows)) throw new Error('unexpected APFS response');
    rows.forEach((x) => { const c = M.normApfs(x); record(c, M.evaluate(c, { asOf: AS_OF })); });
    s.fetched = rows.length; s.note = rows.length + ' forecast rows. The only amount is a dollar RANGE; the lower bound is used for the fee test.'; ctx.asOf['dhs-apfs'] = new Date().toISOString(); return { fetched: rows.length, note: s.note };
  }
});

source({
  id: 'ag-forecast', name: 'GSA Acquisition Gateway Forecast Tool: forecast procurements (DOI/Reclamation, VA, Commerce, GSA, HHS and others) with estimated contract value range', agency: 'Federal (forecast)', page: 'https://acquisitiongateway.gov/forecast',
  type: 'Public JSON API behind the Forecast Tool (ag-dashboard.acquisitiongateway.gov/api/v3.0, no key, robots.txt allows /api); snapshot only',
  async run(ctx) {
    const s = st('ag-forecast'); const tids = { 1435: '541330', 1439: '541370', 1454: '541620', 1455: '541690' }; const rows = new Map(); let total = 0;
    for (const tid of Object.keys(tids)) for (let page = 0; page < 40; page++) {
      const j = await getJson('https://ag-dashboard.acquisitiongateway.gov/api/v3.0/resources/forecast?' + qs({ page: page, 'filter[field_naics_code_target_id][]': tid }), { timeout: 180000 });
      const L = j.listing || {}; if (page === 0) total += +L.total || 0;
      (L.data || []).forEach((d) => rows.set(String(d.nid), d.render));
      if (!(L.data || []).length || (L.data || []).length < 25) break;
    }
    rows.forEach((x) => { const c = M.normAg(x); record(c, M.evaluate(c, { asOf: AS_OF })); });
    s.fetched = rows.size; s.note = rows.size + ' forecast rows for NAICS 541330, 541370, 541620, 541690 (the filter is applied by the API; ' + total + ' before de-duplication). The only amount is an estimated-value RANGE; its lower bound is used for the fee test. Statuses other than Acquisition Planning / Drafting Solicitation / Solicitation Issued are dropped.'; ctx.asOf['ag-forecast'] = new Date().toISOString();
    return { fetched: rows.size, note: s.note };
  }
});

source({
  id: 'caltrans', statIds: ['caltrans-lar', 'caltrans-awards'], name: 'Caltrans A&E Look Ahead Report and A&E awarded contracts (xlsx)', agency: 'Caltrans', page: M.CALTRANS_PAGE,
  type: 'XLSX downloads, no key (no CORS); dot.ca.gov serves no robots.txt (404)',
  async run(ctx) {
    const s = st('caltrans-lar'); const s2 = st('caltrans-awards');
    const lar = xlsxRows(await get(M.CALTRANS_LAR_URL, { binary: true })); let a = 0;
    lar.forEach((r) => { const c = M.normCaltransLar(r); if (c) { a++; record(c, M.evaluate(c, { asOf: AS_OF })); } });
    const aw = xlsxRows(await get(M.CALTRANS_AWARD_URL, { binary: true })); let b = 0;
    aw.forEach((r) => { const c = M.normCaltransAward(r); if (c) { b++; record(c, M.evaluate(c, { asOf: AS_OF })); } });
    if (!a) throw new Error('Caltrans look-ahead rows not found (layout may have changed)');
    s.fetched = a; s2.fetched = b; s.note = a + ' planned A&E contracts (look-ahead) and ' + b + ' awarded A&E contracts. Amounts are Caltrans\' own "Amount" / "Total Contract Value" columns.'; ctx.asOf.caltrans = new Date().toISOString();
    return { fetched: a + b, note: s.note };
  }
});

source({
  id: 'sam-api', name: 'SAM.gov Opportunities API v2 (needs SAM_API_KEY)', agency: 'Federal (all agencies)', page: 'https://open.gsa.gov/api/get-opportunities-public-api/',
  type: 'REST API; enabled only when the SAM_API_KEY environment variable is set (GitHub Actions secret)', optional: true,
  async run() { throw new Error('SAM_API_KEY not set'); }
});


// ---------- roadway-lane-only sources (not used by the main water/drainage > $20M output) ----------
const RW_SOURCES = [];
RW_SOURCES.push({
  id: 'usaspending-rw', name: 'USAspending.gov API: prime awards with a drainage/hydraulics description (engineering PSC/NAICS, ≥ $5M), roadway lane', agency: 'Federal (all agencies)', page: 'https://api.usaspending.gov/docs/endpoints',
  type: 'REST API, no key (snapshot only)',
  async run(ctx) {
    const kw = ['drainage', 'hydraulic', 'hydraulics', 'hydrology', 'hydrologic', 'stormwater', 'storm water', 'storm drain', 'culvert'];
    const fields = ['Award ID', 'Recipient Name', 'Award Amount', 'Total Outlays', 'Description', 'Start Date', 'Awarding Agency', 'Awarding Sub Agency', 'NAICS', 'PSC', 'Place of Performance State Code', 'Place of Performance Country Code', 'generated_internal_id', 'Contract Award Type', 'Base Obligation Date'];
    const groups = { contracts: ['A', 'B', 'C', 'D'], idv: ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'] };
    const sets = [['PSC family C', { psc_codes: { require: [['Service', 'C']] } }], ['NAICS 5413xx/5416xx', { naics_codes: { require: ['541330', '541620', '541690', '541370'] } }]];
    const all = new Map(); const s = rst('usaspending-rw'); const start = M.addMonths(AS_OF, -60);
    for (const [g, codes] of Object.entries(groups)) for (const [label, extra] of sets) {
      const filters = Object.assign({ award_type_codes: codes, time_period: [{ start_date: start, end_date: AS_OF }], award_amounts: [{ lower_bound: R.DRAIN_MIN }], keywords: kw }, extra);
      for (let page = 1; page <= 10; page++) {
        const j = await getJson('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filters, fields: fields.concat(g === 'idv' ? ['Last Date to Order'] : ['End Date']), limit: 100, page, sort: 'Award Amount', order: 'desc' }) });
        (j.results || []).forEach((r) => all.set(r.generated_internal_id, r));
        if (!j.page_metadata || !j.page_metadata.hasNext) break;
      }
    }
    s.fetched = all.size;
    for (const r of all.values()) {
      let c = M.normUsa(r, null); R.decorateRw(c); let ev = R.evaluateRoadway(c, { asOf: AS_OF });
      if (ev.bucket !== 'excluded' || (ev.flags.drainSpecific && (ev.flags.eng === 'strong' || ev.flags.eng === 'weak') && ev.flags.road !== 'none')) {
        try { const d = await getJson('https://api.usaspending.gov/api/v2/awards/' + encodeURIComponent(c.srcId) + '/'); const lt = d.latest_transaction_contract_data || {}; const c2 = M.normUsa(r, { base_and_all_options: d.base_and_all_options, office: d.awarding_agency && d.awarding_agency.office_agency_name, solicitation: lt.solicitation_identifier }); c2.fields['Total obligation (detail)'] = d.total_obligation; c = c2; } catch (e) { c.fields['Detail fetch'] = 'failed: ' + String(e.message).slice(0, 80); }
      }
      c.src = 'usaspending-rw'; rwRecord(c);
    }
    ctx.asOf['usaspending-rw'] = new Date().toISOString();
    return { fetched: all.size, note: 'Search = (PSC family C OR NAICS 541330/541620/541690/541370) AND keyword (drainage, hydraulic(s), hydrology, stormwater, storm drain, culvert) AND Award Amount ≥ $5M, action dates ' + start + '..' + AS_OF + '. Prime awards only; the amount is the whole award, which is drainage-specific only when the award title/description is.' };
  }
});
RW_SOURCES.push({
  id: 'usaspending-sub', name: 'USAspending.gov subawards: line items with a drainage/hydraulics description (≥ $5M), roadway lane', agency: 'Federal (all agencies)', page: 'https://api.usaspending.gov/docs/endpoints',
  type: 'REST API, no key (FFATA subaward reports; snapshot only)',
  async run(ctx) {
    const kw = ['drainage', 'hydraulic', 'hydraulics', 'hydrology', 'hydrologic', 'stormwater', 'storm water', 'storm drain', 'culvert'];
    const fields = ['Sub-Award ID', 'Sub-Award Amount', 'Sub-Awardee Name', 'Sub-Award Description', 'Sub-Award Date', 'Prime Award ID', 'Prime Recipient Name', 'Awarding Agency', 'Awarding Sub Agency', 'Prime Award Description', 'Place of Performance State Code', 'NAICS', 'PSC', 'prime_award_generated_internal_id'];
    const all = new Map(); const s = rst('usaspending-sub'); const start = M.addMonths(AS_OF, -60);
    for (let page = 1; page <= 10; page++) {
      const filters = { keywords: kw, award_type_codes: ['A', 'B', 'C', 'D'], award_amounts: [{ lower_bound: R.DRAIN_MIN }], time_period: [{ start_date: start, end_date: AS_OF }] };
      const j = await getJson('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filters, fields, subawards: true, limit: 100, page, sort: 'Sub-Award Amount', order: 'desc' }) });
      (j.results || []).forEach((r) => all.set(String(r.prime_award_generated_internal_id) + '|' + r['Sub-Award ID'], r));
      if (!j.page_metadata || !j.page_metadata.hasNext) break;
    }
    s.fetched = all.size; let over = 0;
    for (const r of all.values()) {
      const amount = r['Sub-Award Amount']; if (typeof amount !== 'number') continue; if (amount > R.DRAIN_MIN) over++;
      const prime = { piid: r['Prime Award ID'], recipient: r['Prime Recipient Name'], title: r['Prime Award Description'], agency: r['Awarding Agency'], subagency: r['Awarding Sub Agency'], naics: r.NAICS && r.NAICS.code, psc: r.PSC && r.PSC.code };
      const c = R.normUsaSub({ id: r['Sub-Award ID'], amount, description: M.clean(r['Sub-Award Description']), subawardee: r['Sub-Awardee Name'], date: r['Sub-Award Date'], state: r['Place of Performance State Code'], url: 'https://www.usaspending.gov/award/' + encodeURIComponent(r.prime_award_generated_internal_id) }, prime);
      rwRecord(c);
    }
    ctx.asOf['usaspending-sub'] = new Date().toISOString();
    return { fetched: all.size, note: 'Subaward search: keyword (drainage, hydraulic(s), hydrology, stormwater, storm drain, culvert) in the prime or subaward text, prime award ≥ $5M, ' + start + '..' + AS_OF + '. ' + all.size + ' subawards returned, ' + over + ' with a subaward amount > $5M. The subaward amount is the one line item, so it IS a per-task figure, but it is reported by the prime and often has a generic description.' };
  }
});
RW_SOURCES.push({
  id: 'wsdot-proj', name: 'WSDOT Projected Design Opportunities for Consultants (xlsx)', agency: 'Washington State DOT', page: 'https://wsdot.wa.gov/business-wsdot/contracts/contract-services',
  type: 'Semi-annual xlsx forecast of A&E consultant design opportunities with "Potential Value"; snapshot only',
  async run(ctx) {
    const s = rst('wsdot-proj'); const page = await get('https://wsdot.wa.gov/business-wsdot/contracts/contract-services');
    const m = /href="([^"]*WSDOT-Projected-Design-Opportunities-for-Consultants[^"]*\.xlsx)"/i.exec(page); if (!m) throw new Error('forecast xlsx link not found on the WSDOT contract services page');
    const url = new URL(m[1], 'https://wsdot.wa.gov').href; const rows = xlsxRows(await get(url, { binary: true }));
    const hi = rows.findIndex((r) => r && r[0] === 'Project' && r[8] === 'Potential Value'); if (hi < 0) throw new Error('header row not found in the WSDOT xlsx');
    let n = 0;
    rows.slice(hi + 1).forEach((r, i) => {
      if (!r || !r[0]) return; n++;
      const pv = String(r[8] || '').replace(/,/g, ''); const mm = /\$\s*([\d.]+)\s*(M|K|B)?/i.exec(pv); const v = mm ? parseFloat(mm[1]) * ({ M: 1e6, K: 1e3, B: 1e9 }[(mm[2] || '').toUpperCase()] || 1) : null;
      const c = { src: 'wsdot-proj', srcId: 'row-' + (i + 1) + '-' + String(r[0]).slice(0, 30).replace(/\W+/g, '-'), url, title: M.clean(r[0]), desc: M.clean(r[1]), agency: 'Washington State DOT', subagency: M.clean(r[7]), state: 'WA', city: null, naics: '', psc: '',
        roadAgency: 'WSDOT consultant design list (highway agency)', engOverride: { level: 'strong', why: 'WSDOT "Projected Design Opportunities for Consultants" = planned A&E consultant contracts (source category)' },
        status: 'upcoming', noticeType: 'Projected design opportunity', noticeLabel: 'Projected WSDOT consultant design opportunity', amounts: v ? [{ v, kind: 'estvalue', field: 'Potential Value (WSDOT Projected Design Opportunities xlsx)' }] : [], dates: { est: null, estLabel: 'Advertisement: ' + M.clean(r[2]) },
        fields: { 'Advertisement': M.clean(r[2]), 'Delivery method': M.clean(r[3]), 'Region': M.clean(r[7]), 'Potential value': M.clean(r[8]), 'Confidence rating': M.clean(r[9]) } };
      rwRecord(c);
    });
    s.fetched = n; ctx.asOf['wsdot-proj'] = new Date().toISOString();
    return { fetched: n, note: n + ' rows (report dated by the file name ' + url.split('/').slice(-2, -1)[0] + '); fields: Project, Description, Advertisement, Delivery Method, Region, Potential Value, Confidence Rating. Total values only: no per-discipline amounts.' };
  }
});

// Sources probed for the roadway lane that are NOT in the build, with what each was measured to expose (probed 2026-10-26, US Central).
const RW_TESTED = [
  { name: 'WisDOT SFY25 consultant contracts / work orders by project (PDF)', url: 'https://wisconsindot.gov/Documents/doing-bus/eng-consultants/selections/projectlist25.pdf', works: true, integrated: false,
    fields: 'Region, Project ID, WO, Highway, Project limit, County, Contract function (e.g. Design Services, Hydraulic Analysis and Design S…), Auth date, Vendor, Project costs (the authorized amount).',
    finding: '1,055 awarded work orders, $308,373,601 total. 26 lines mention drainage / hydraulic / storm / culvert; the largest drainage-named amount is $285,591 (Storm Water Management Statewide / Drainage Studies work orders). Far below $5M. Awards only, so it could only feed the awards tab. Not built in: needs pdftotext (poppler) in the workflow.' },
  { name: 'FDOT Internet Reports (Consultant Acquisition Plan, Active and Expired Contracts, Final Selections)', url: 'https://www.fdot.gov/procurement/internetreports.shtm', works: false, integrated: false,
    fields: 'Report pages are SQL Server Reporting Services reports (ssrs.fdot.gov).',
    finding: 'Direct export URLs (rs:Format=CSV) returned HTTP 500 without the interactive report parameters, and the report viewer is a script-driven page. Not usable without a browser session; not built in.' },
  { name: 'WSDOT Professional Services Forecast (xlsx)', url: 'https://wsdot.wa.gov/sites/default/files/2024-08/Professional-Services-Forecast.xlsx', works: true, integrated: false,
    fields: 'Contract number, current vendor, description, procurement method, start / end dates, estimated value, estimated advertisement date.',
    finding: '31 agency-wide professional-services rows (not roadway design specific); 1 mentions stormwater ($100,000). File is dated 2024-08. Not built in.' },
  { name: 'More state DOT consultant pages (NYSDOT, NCDOT, GDOT, PennDOT, Louisiana DOTD, FDOT advertisements)', url: '', works: false, integrated: false, fields: '', finding: 'Tested earlier for the water lane; none exposes a consultant fee in a machine-readable list. See "Sources tested, not used" in the main Data tab.' }
];

// ---------- PS&E / H&H lens: extra sources (not used by the older lanes) ----------
const PSE_SOURCES = [];
const PSE_KW = ['PS&E', 'plans and specifications', 'final design', 'detailed design', 'design services', 'drainage', 'hydrology', 'hydrologic', 'hydraulic', 'hydraulics', 'stormwater', 'storm water', 'storm drain', 'culvert', 'flood', 'floodplain', 'coastal', 'resilience', 'levee', 'watershed'];
PSE_SOURCES.push({
  id: 'pse-usaspending', name: 'USAspending.gov API: prime awards and IDIQ ceilings (engineering PSC/NAICS, PS&E / H&H wording, obligated ≥ $1M, then base-and-all-options from the award detail); design-build awards', agency: 'Federal (all agencies)', page: 'https://api.usaspending.gov/docs/endpoints',
  type: 'REST API, no key (snapshot only)',
  async run(ctx) {
    const fields = ['Award ID', 'Recipient Name', 'Award Amount', 'Total Outlays', 'Description', 'Start Date', 'Awarding Agency', 'Awarding Sub Agency', 'NAICS', 'PSC', 'Place of Performance State Code', 'Place of Performance Country Code', 'generated_internal_id', 'Contract Award Type', 'Base Obligation Date'];
    const groups = { contracts: ['A', 'B', 'C', 'D'], idv: ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'] };
    const sets = [['PSC family C', { psc_codes: { require: [['Service', 'C']] } }], ['NAICS 541330/541370/541620/541690', { naics_codes: { require: ['541330', '541370', '541620', '541690'] } }]];
    const all = new Map(); const s = pst('pse-usaspending'); const start = M.addMonths(AS_OF, -36);
    for (const [g, codes] of Object.entries(groups)) for (const [label, extra] of sets) {
      const filters = Object.assign({ award_type_codes: codes, time_period: [{ start_date: start, end_date: AS_OF }], award_amounts: [{ lower_bound: 1000000 }], keywords: PSE_KW }, extra);
      for (let page = 1; page <= 8; page++) {
        const j = await getJson('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filters, fields: fields.concat(g === 'idv' ? ['Last Date to Order'] : ['End Date']), limit: 100, page, sort: 'Award Amount', order: 'desc' }) });
        (j.results || []).forEach((r) => all.set(r.generated_internal_id, r));
        if (!j.page_metadata || !j.page_metadata.hasNext) break;
      }
    }
    // design-build awards (competitor intel for the Design-build lens): construction NAICS, DB wording, ≥ $10M
    const dbAll = new Map();
    for (const page of [1, 2, 3]) {
      const j = await getJson('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filters: { award_type_codes: ['A', 'B', 'C', 'D'], time_period: [{ start_date: start, end_date: AS_OF }], award_amounts: [{ lower_bound: 10000000 }], keywords: ['design-build', 'design build', 'progressive design-build'], naics_codes: { require: ['237110', '237310', '237990', '237120', '541330'] } }, fields: fields.concat(['End Date']), limit: 100, page, sort: 'Award Amount', order: 'desc' }) });
      (j.results || []).forEach((r) => dbAll.set(r.generated_internal_id, r)); if (!j.page_metadata || !j.page_metadata.hasNext) break;
    }
    s.fetched = all.size + dbAll.size; let details = 0, detailFail = 0;
    const order = [...all.values()].sort((a, b) => (b['Award Amount'] || 0) - (a['Award Amount'] || 0));
    for (const r of order) {
      let c = M.normUsa(r, null); let ev = PS.evaluatePse(c, { asOf: AS_OF });
      const plausible = ev.scope && (ev.scope.hh || ev.scope.sec.ids.length || ev.scope.pse) && ev.flags.eng !== 'none' && ev.flags.eng !== 'construction';
      if (plausible && details < 450) {
        details++;
        try { const d = await getJson('https://api.usaspending.gov/api/v2/awards/' + encodeURIComponent(c.srcId) + '/'); const lt = d.latest_transaction_contract_data || {}; const c2 = M.normUsa(r, { base_and_all_options: d.base_and_all_options, office: d.awarding_agency && d.awarding_agency.office_agency_name, solicitation: lt.solicitation_identifier }); c2.fields['Total obligation (detail)'] = d.total_obligation; c = c2; } catch (e) { detailFail++; c.fields['Detail fetch'] = 'failed: ' + String(e.message).slice(0, 80); }
      }
      pseRecord(c);
    }
    for (const r of dbAll.values()) { const c = M.normUsa(r, null); c.src = 'pse-usaspending'; pseRecord(c); }
    ctx.asOf['pse-usaspending'] = new Date().toISOString();
    return { fetched: s.fetched, note: all.size + ' prime awards / IDVs (obligated ≥ $1M, last 36 months, PSC family C or NAICS 541330/541370/541620/541690, description keyword for PS&E / design / H&H) plus ' + dbAll.size + ' design-build awards (construction NAICS, ≥ $10M). Award detail (base_and_all_options = ceiling incl. options) fetched for ' + details + ' plausible rows' + (detailFail ? ' (' + detailFail + ' failed)' : '') + '; the rest use the obligated amount only, which understates IDIQ ceilings.' };
  }
});
PSE_SOURCES.push({
  id: 'pse-nyc', name: 'NYC City Record Online: Construction Related Services award notices ≥ $5M', agency: 'City of New York', page: 'https://data.cityofnewyork.us/City-Government/City-Record-Online/dg92-zbpx', type: 'Socrata API, no key (snapshot only)',
  async run(ctx) {
    const s = pst('nyc'); const since = M.addMonths(AS_OF, -24);
    const rows = await getJson('https://data.cityofnewyork.us/resource/dg92-zbpx.json?' + qs({ $where: "section_name='Procurement' AND type_of_notice_description='Award' AND category_description='Construction Related Services' AND contract_amount>5000000 AND start_date>'" + since + "'", $limit: 5000, $order: 'start_date DESC' }));
    rows.forEach((r) => { const c = M.normNyc(r); c.src = 'nyc'; pseRecord(c); });
    ctx.asOf['pse-nyc'] = new Date().toISOString();
    return { fetched: rows.length, note: 'Same dataset as the water lane but with a $5M floor (awards since ' + since + '). Duplicates of the water-lane rows are merged by award PIN.' };
  }
});
PSE_SOURCES.push({
  id: 'pse-chicago', name: 'City of Chicago contracts ≥ $5M (architect / engineering / professional services types)', agency: 'City of Chicago', page: 'https://data.cityofchicago.org/Administration-Finance/Contracts/rsxa-ify5', type: 'Socrata API, no key (snapshot only)',
  async run(ctx) {
    const rows = await getJson('https://data.cityofchicago.org/resource/rsxa-ify5.json?' + qs({ $where: "award_amount>5000000 AND (end_date>'" + AS_OF + "' OR approval_date>'" + M.addMonths(AS_OF, -24) + "')", $limit: 5000, $order: 'award_amount DESC' }));
    const best = {}; rows.forEach((r) => { const k = r.purchase_order_contract_number; if (!best[k] || +(r.revision_number || 0) > +(best[k].revision_number || 0)) best[k] = r; });
    Object.values(best).forEach((r) => { const c = M.normChicago(r); c.src = 'chicago'; pseRecord(c); });
    ctx.asOf['pse-chicago'] = new Date().toISOString();
    return { fetched: rows.length, note: 'award_amount > $5M, end date in the future or approved in the last 24 months; highest revision per contract.' };
  }
});
PSE_SOURCES.push({
  id: 'austin', name: 'City of Austin contracts (master agreements, Professional Services, purchase limit ≥ $5M)', agency: 'City of Austin', page: 'https://datahub.austintexas.gov/d/84ih-p28j', type: 'Socrata API, no key (snapshot only)',
  async run(ctx) {
    const rows = await getJson('https://datahub.austintexas.gov/resource/84ih-p28j.json?' + qs({ $where: "ma_prch_lmt_am>5000000 AND cat_dscr='Professional Services'", $select: 'doc_id,doc_dscr,ma_prch_lmt_am,lgl_nm,efbgn_dt,efend_dt,cat_dscr,doc_dept_cd', $limit: 5000, $order: 'ma_prch_lmt_am DESC' }));
    const by = new Map(); rows.forEach((r) => { const o = by.get(r.doc_id) || { r, vendors: [] }; o.vendors.push(M.clean(r.lgl_nm)); by.set(r.doc_id, o); });
    for (const { r, vendors } of by.values()) {
      const t = M.clean(r.doc_dscr), eng = /engineer|design|architect|survey|hydro|drain|flood|storm|study|planning/i.test(t);
      const c = { src: 'austin', srcId: r.doc_id, url: 'https://datahub.austintexas.gov/resource/84ih-p28j.json?doc_id=' + encodeURIComponent(r.doc_id), title: t, desc: t + ' (vendors: ' + vendors.join('; ') + ')', agency: 'City of Austin', subagency: null, office: null, state: 'TX', city: 'Austin', naics: '', psc: '',
        engOverride: eng ? { level: 'strong', why: 'Austin category "Professional Services" and the title has engineering / design wording (inferred from words; Austin gives no NAICS)' } : { level: 'weak', why: 'Austin category "Professional Services" but the title has no engineering wording' },
        status: 'awarded', noticeType: 'Master agreement', noticeLabel: 'Awarded master agreement (rotation list / on-call)', amounts: [{ v: parseFloat(r.ma_prch_lmt_am), kind: 'maxvalue', field: 'ma_prch_lmt_am (Austin master agreement purchase limit; shared by the listed vendors)' }],
        dates: { start: M.isoDate(r.efbgn_dt), end: M.isoDate(r.efend_dt), award: M.isoDate(r.efbgn_dt) }, awardee: vendors.slice(0, 6).join('; ') + (vendors.length > 6 ? ' +' + (vendors.length - 6) : ''), awardNum: r.doc_id,
        fields: { 'doc_id': r.doc_id, 'Category': r.cat_dscr, 'Purchase limit': r.ma_prch_lmt_am, 'Effective': r.efbgn_dt, 'Ends': r.efend_dt, 'Vendors listed': vendors.length } };
      pseRecord(c);
    }
    ctx.asOf.austin = new Date().toISOString();
    return { fetched: by.size, note: by.size + ' Professional Services master agreements with a purchase limit over $5M. The limit is the agreement ceiling and is shared by all vendors on a rotation list, so it is not one firm\'s fee.' };
  }
});
PSE_SOURCES.push({
  id: 'txdot-pi', name: 'TxDOT Project Information (data.texas.gov, hourly): design-phase projects with a stated construction cost, and Design Build / Alternative Delivery projects', agency: 'TxDOT', page: 'https://data.texas.gov/dataset/Project-Information/drau-zphx', type: 'Socrata API, no key (snapshot only here)',
  async run(ctx) {
    const sel = 'project_id,project_stage,project_status,project_type,project_sub_type_description,let_type_description,type_of_work,short_description,project_description,project_name,project_classification,highway,county,district_division,city,project_estimate_low_bid,project_estimated_let_date,project_limits_from,project_limits_to';
    const base = 'https://data.texas.gov/resource/drau-zphx.json?';
    const pipe = await getJson(base + qs({ $select: sel, $where: "project_stage in ('PE','PS&E') AND project_estimate_low_bid>" + PS.PIPE_FLOOR, $limit: 50000 }), { timeout: 120000 });
    const dbq = await getJson(base + qs({ $select: sel, $where: "(let_type_description='Design Build' OR project_sub_type_description like '%Design Build%' OR project_type='Alternative Delivery') AND project_stage not in ('Closed')", $limit: 5000 }), { timeout: 120000 });
    const seen = new Set(); let n = 0;
    const mk = (r, db) => {
      const cost = parseFloat(r.project_estimate_low_bid); const from = M.clean(r.project_limits_from), to = M.clean(r.project_limits_to);
      const title = [M.clean(r.highway), M.clean(r.project_name) || M.clean(r.short_description) || M.clean(r.type_of_work)].filter(Boolean).join(' · ') + (from ? ' (' + from + (to && to !== from ? ' to ' + to : '') + ')' : '');
      const desc = [r.type_of_work, r.short_description, r.project_classification, r.project_description, r.project_name].map(M.clean).filter(Boolean).join('. ');
      const stage = M.clean(r.project_stage);
      return { src: 'txdot-pi', srcId: r.project_id + (db ? '#db' : ''), url: 'https://data.texas.gov/resource/drau-zphx.json?project_id=' + encodeURIComponent(r.project_id), title: title || r.project_id, desc: db ? 'Design Build. ' + desc : desc, agency: 'TxDOT', subagency: M.clean(r.district_division) || null, office: null, state: 'TX', city: null, naics: '', psc: '',
        projectList: true, roadAgency: 'TxDOT Project Information (state highway agency project list)', dbSource: db, status: stage === 'Construction' ? 'awarded' : 'upcoming', noticeType: 'TxDOT project (' + stage + ')', noticeLabel: 'TxDOT project, stage ' + stage + (db ? ', Design Build' : ''),
        amounts: isFinite(cost) && cost > 0 ? [{ v: cost, kind: 'project_cost', field: 'project_estimate_low_bid (TxDOT Project Information: estimated construction cost, NOT a fee)' }] : [], dates: { est: M.isoDate(r.project_estimated_let_date), estLabel: 'Est. letting (TxDOT)' },
        fields: { 'Project ID': r.project_id, 'Project stage': stage, 'Project type': r.project_type, 'Sub type': r.project_sub_type_description, 'Let type': r.let_type_description, 'County': r.county, 'Type of work': r.type_of_work, 'project_estimate_low_bid': r.project_estimate_low_bid } };
    };
    dbq.forEach((r) => { if (!seen.has(r.project_id)) { seen.add(r.project_id); n++; pseRecord(mk(r, true)); } });
    pipe.forEach((r) => { n++; pseRecord(mk(r, false)); });
    ctx.asOf['txdot-pi'] = new Date().toISOString();
    return { fetched: pipe.length + dbq.length, note: pipe.length + ' projects in stage PE or PS&E with a stated estimate over $25M (pipeline lens keeps only those whose text names drainage / H&H words) and ' + dbq.length + ' Design Build / Alternative Delivery projects (design-build lens). The only dollar field is project_estimate_low_bid, an estimated construction cost.' };
  }
});

// ---------- enrichment: city centroids for pins (Census Gazetteer; only for records whose source names a city AND state) ----------
async function cityCentroids(recs) {
  const want = recs.filter((r) => r.city && r.state && !r.lat);
  if (!want.length) return 0;
  const file = path.join(CACHE, 'gaz-place.zip'); const url = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip';
  if (!fs.existsSync(file)) fs.writeFileSync(file, await get(url, { binary: true }));
  const z = unzip(fs.readFileSync(file)); const name = Object.keys(z).find((k) => /\.txt$/.test(k)); const lines = z[name].toString('utf8').split(/\r?\n/);
  const hdr = lines[0].split('\t').map((h) => h.trim()); const iU = hdr.indexOf('USPS'), iN = hdr.indexOf('NAME'), iLat = hdr.indexOf('INTPTLAT'), iLon = hdr.findIndex((h) => /^INTPTLONG/.test(h));
  const idx = {}; const norm = (s) => s.toLowerCase().replace(/\b(city|town|village|cdp|municipality|borough|urban county|metropolitan government|consolidated government|unified government)\b/g, ' ').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  for (let i = 1; i < lines.length; i++) { const f = lines[i].split('\t'); if (f.length < 8) continue; const k = f[iU].trim() + '|' + norm(f[iN]); (idx[k] = idx[k] || []).push([parseFloat(f[iLat]), parseFloat(f[iLon])]); }
  let n = 0;
  want.forEach((r) => { const hit = idx[r.state + '|' + norm(M.clean(r.city))]; if (hit && hit.length === 1 && isFinite(hit[0][0])) { r.lat = +hit[0][0].toFixed(4); r.lon = +hit[0][1].toFixed(4); r.geo = 'city-centroid'; n++; } });
  return n;
}

function mergeStats(list) {
  const out = { fetched: 0, evaluated: 0, exact20: 0, byBucket: {}, excl: {}, eng: {}, sector: {}, fee: {}, primary: {}, samples: {} };
  list.forEach((s) => { ['fetched', 'evaluated', 'exact20'].forEach((k) => { out[k] += s[k] || 0; }); ['byBucket', 'excl', 'eng', 'sector', 'fee', 'primary'].forEach((k) => Object.keys(s[k] || {}).forEach((x) => { out[k][x] = (out[k][x] || 0) + s[k][x]; })); Object.keys(s.samples || {}).forEach((x) => { out.samples[x] = (out.samples[x] || []).concat(s.samples[x]).slice(0, 6); }); });
  return out;
}
const PS_count = (list, f) => list.reduce((o, r) => { const k = f(r); o[k] = (o[k] || 0) + 1; return o; }, {});
function mergePse(list) {
  const o = { evaluated: 0, exact5: 0, textParsed: 0, byLens: {}, excl: {}, stage: {}, conf: {}, near: [], constrNear: [] };
  list.forEach((p) => { o.evaluated += p.evaluated; o.exact5 += p.exact5; o.textParsed += p.textParsed; ['byLens', 'excl', 'stage', 'conf'].forEach((k) => Object.keys(p[k]).forEach((z) => { o[k][z] = (o[k][z] || 0) + p[k][z]; })); o.near = o.near.concat(p.near); o.constrNear = o.constrNear.concat(p.constrNear); });
  o.near.sort((a, b) => b.v - a.v); o.near.length = Math.min(o.near.length, 6); o.constrNear.sort((a, b) => b.v - a.v); o.constrNear.length = Math.min(o.constrNear.length, 6); return o;
}
const PSE_TESTED = [
  { name: 'NYC Capital Projects forecast (City Record / DDC)', result: 'tested, not used: forecast rows carry no dollar amounts.' },
  { name: 'NYC GOSR / NY Rising contracts', result: 'tested, not used: contract rows date from 2014 to 2022, nothing current.' },
  { name: 'San Francisco, Seattle, Washington DC, Maryland, Houston / Harris County open-data contract catalogs', result: 'quick API probes found no dataset that pairs an engineering-services category with a contract amount and can be queried without a key. Not used; more careful probing could still find one.' },
  { name: 'Texas LBB contracts database', result: 'NOT integrated in this version (not tested). Listed as a gap.' },
  { name: 'USACE / FEMA / TWDB / state flood programs with stated project costs', result: 'NOT integrated as a separate feed. Federal awards and IDIQ ceilings come through USAspending and SAM; state flood-program project lists are a gap.' },
  { name: 'TxDOT PEPS selected-consultant announcements', result: 'NOT integrated in this version (not tested for fee amounts). Listed as a gap.' }
];
async function main() {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const prevPse = fs.existsSync(OUT_PSE) ? JSON.parse(fs.readFileSync(OUT_PSE, 'utf8')) : null;
  const prevRw = fs.existsSync(OUT_RW) ? JSON.parse(fs.readFileSync(OUT_RW, 'utf8')) : null;
  // unit prices for the roadway cost base: a subset of bid-cost/prices.json (TxDOT low-bid averages), the items cost.js uses
  const bid = JSON.parse(fs.readFileSync(path.join(ROOT, 'bid-cost', 'prices.json'), 'utf8')); PRICES = {};
  bid.rows.forEach((r) => { if (CM.PRICE_CODES.indexOf(r.bid_code) >= 0) PRICES[r.bid_code] = r; });
  const missingCodes = CM.PRICE_CODES.filter((c) => !PRICES[c]); if (missingCodes.length) throw new Error('bid-cost/prices.json lacks bid codes used by cost.js: ' + missingCodes.join(', '));
  fs.mkdirSync(path.dirname(OUT_PRICES), { recursive: true });
  fs.writeFileSync(OUT_PRICES, JSON.stringify({ meta: Object.assign({}, bid.meta, { file: 'bid-cost/prices.json', note: bid.meta.note + '. Subset used by national-radar/cost.js; these are TEXAS prices.' }), rows: PRICES }));
  const ctx = { asOf: {} }; const statuses = [];
  for (const s of SOURCES) {
    if (SKIP.has(s.id)) { statuses.push({ id: s.id, name: s.name, agency: s.agency, page: s.page, type: s.type, status: 'skipped', note: 'NR_SKIP developer switch', fetched: 0, kept: 0 }); continue; }
    const t0 = Date.now(); const rec0 = kept.length; const status = { id: s.id, name: s.name, agency: s.agency, page: s.page, type: s.type, status: 'ok', error: null, fetchedAt: new Date().toISOString() };
    if (s.id === 'sam-api' && process.env.SAM_API_KEY) { status.status = 'skipped'; status.note = 'SAM_API_KEY is set but the API adapter is not implemented in this version; the public extract is used instead.'; statuses.push(status); continue; }
    if (s.id === 'sam-api') { status.status = 'disabled'; status.note = 'No SAM_API_KEY. Add one as a GitHub Actions secret named SAM_API_KEY to enable this path (see national-radar/workflow/refresh-national.yml). The public SAM.gov extract above covers active notices without a key.'; statuses.push(status); continue; }
    try { const r = await s.run(ctx); status.fetched = r.fetched; status.note = r.note; }
    catch (e) {
      status.status = prev && prev.records.some((x) => (s.statIds || [s.id]).indexOf(x.src) >= 0) ? 'stale' : 'failed'; status.error = String(e.message).slice(0, 300);
      const ost = prev && (prev.sources || []).find((x) => x.id === s.id);
      if (prev) { prev.records.filter((x) => (s.statIds || [s.id]).indexOf(x.src) >= 0).forEach((x) => kept.push(x)); status.stats = ost && ost.stats; status.fetchedAt = ost ? ost.fetchedAt : null; status.fetched = ost ? ost.fetched : 0; }
      status.note = 'Last fetch failed: ' + status.error + (status.status === 'stale' ? ' Showing records from the previous successful run.' : '');
      statuses.splice(statuses.length, 0);
    }
    const ids = s.statIds || [s.id];
    if (status.status === 'ok') status.stats = ids.length === 1 ? stats[s.id] : mergeStats(ids.map((i) => stats[i]).filter(Boolean));
    status.kept = kept.filter((x) => ids.indexOf(x.src) >= 0).length; status.asOf = ctx.asOf[s.id] || status.fetchedAt;
    console.log((status.status + '      ').slice(0, 8), s.id.padEnd(12), 'fetched', String(status.fetched || 0).padStart(6), 'kept', String(status.kept).padStart(4), ((Date.now() - t0) / 1000).toFixed(1) + 's', status.error ? ' ERR ' + status.error : '');
    statuses.push(status);
  }
  // ---- roadway lane: roadway-only sources, then assemble national-radar/data/roadway.json
  const rwStatuses = [];
  for (const s of RW_SOURCES) {
    const t0 = Date.now(); const status = { id: s.id, name: s.name, agency: s.agency, page: s.page, type: s.type, status: 'ok', error: null, fetchedAt: new Date().toISOString(), roadwayOnly: true };
    try { const r = await s.run(ctx); status.fetched = r.fetched; status.note = r.note; }
    catch (e) {
      status.status = prevRw && prevRw.records.some((x) => x.src === s.id) ? 'stale' : 'failed'; status.error = String(e.message).slice(0, 300);
      if (prevRw) { prevRw.records.filter((x) => x.src === s.id).forEach((x) => rwKept.push(x)); const o = (prevRw.sources || []).find((x) => x.id === s.id); status.stats = o && o.stats; status.fetchedAt = o ? o.fetchedAt : null; status.fetched = o ? o.fetched : 0; }
      status.note = 'Last fetch failed: ' + status.error + (status.status === 'stale' ? ' Showing records from the previous successful run.' : '');
    }
    if (status.status === 'ok') status.stats = rwStats[s.id];
    status.kept = rwKept.filter((x) => x.src === s.id).length; status.asOf = ctx.asOf[s.id] || status.fetchedAt;
    console.log('rw ' + status.status.padEnd(6), s.id.padEnd(16), 'fetched', String(status.fetched || 0).padStart(6), 'kept', String(status.kept).padStart(4), ((Date.now() - t0) / 1000).toFixed(1) + 's', status.error ? ' ERR ' + status.error : '');
    rwStatuses.push(status);
  }
  // main sources that failed this run: bring their previous roadway records back so a failed fetch does not erase them
  statuses.forEach((st0) => { const sd = SOURCES.find((x) => x.id === st0.id); if (!sd || !prevRw || (st0.status !== 'stale' && st0.status !== 'failed' && st0.status !== 'skipped')) return; const ids = sd.statIds || [sd.id]; prevRw.records.filter((x) => ids.indexOf(x.src) >= 0).forEach((x) => rwKept.push(x)); });
  const rwSources = statuses.filter((x) => x.id !== 'sam-api').map((x) => { const sd = SOURCES.find((y) => y.id === x.id); const ids = sd.statIds || [sd.id]; const parts = ids.map((i) => rwStats[i]).filter(Boolean);
    const m = { evaluated: 0, exact5: 0, drainSpecific: 0, byBucket: {}, excl: {}, rw: {}, eng: {}, road: {}, near: [], exact5Rows: [] };
    parts.forEach((p) => { m.evaluated += p.evaluated; m.exact5 += p.exact5; m.drainSpecific += p.drainSpecific; ['byBucket', 'excl', 'rw', 'eng', 'road'].forEach((k) => Object.keys(p[k]).forEach((z) => { m[k][z] = (m[k][z] || 0) + p[k][z]; })); m.near = m.near.concat(p.near || []); m.exact5Rows = m.exact5Rows.concat(p.exact5Rows || []); });
    m.near.sort((a, b) => (b.v || 0) - (a.v || 0)); m.near.length = Math.min(m.near.length, 8);
    return { id: x.id, name: x.name, agency: x.agency, page: x.page, type: x.type, status: x.status, error: x.error, fetched: x.fetched, fetchedAt: x.fetchedAt, asOf: x.asOf, stats: m, kept: rwKept.filter((r) => ids.indexOf(r.src) >= 0).length }; });
  const rwDd = M.dedupe(rwKept); const rwMerged = rwDd._merged; const rwOrdered = rwDd.slice().sort((a, b) => (b.amt ? b.amt.v : 0) - (a.amt ? a.amt.v : 0));
  const rwCounts = { total: rwOrdered.length, beforeDedupe: rwKept.length, mergedDuplicates: rwMerged, byBucket: M.countBy(rwOrdered, (r) => r.bucket), byType: M.countBy(rwOrdered, (r) => r.rw + ':' + r.bucket), byStatus: M.countBy(rwOrdered, (r) => r.bucket + ':' + r.rw + ':' + r.status), byState: M.countBy(rwOrdered, (r) => r.state || '??'), byCost: M.countBy(rwOrdered, (r) => r.cost.status),
    drainOpen: rwOrdered.filter((r) => r.bucket === 'opp' && r.rw === 'drain').length, totalOpen: rwOrdered.filter((r) => r.bucket === 'opp' && r.rw === 'total').length, review: rwOrdered.filter((r) => r.bucket === 'review').length, awards: rwOrdered.filter((r) => r.bucket === 'award' || r.bucket === 'closed').length, recompete: rwOrdered.filter((r) => r.recompete).length };
  const rwOut = { generatedAt: new Date().toISOString(), asOfDate: AS_OF, generator: 'scripts/build-national.js', thresholds: { drain: R.DRAIN_MIN, total: R.TOTAL_MIN }, priceMeta: bid.meta, counts: rwCounts, sources: rwSources.concat(rwStatuses), tested: RW_TESTED, records: rwOrdered };
  const rwSlim = JSON.stringify(rwOut, (k, v) => (v === null || v === undefined || (Array.isArray(v) && !v.length) ? undefined : v));
  if (!rwOut.sources.some((x) => x.status === 'ok')) { console.error('Roadway: nothing usable fetched; keeping the existing file.'); }
  else { fs.writeFileSync(OUT_RW, rwSlim); console.log('wrote', OUT_RW, rwOrdered.length, 'roadway records', (rwSlim.length / 1024).toFixed(0) + ' KB', JSON.stringify(rwCounts.byType), 'cost', JSON.stringify(rwCounts.byCost)); }
  // ---- PS&E / H&H lens: extra sources, then assemble national-radar/data/pse.json (the new default view)
  const pseStatuses = [];
  for (const s of PSE_SOURCES) {
    if (SKIP.has(s.id)) { pseStatuses.push({ id: s.id, name: s.name, agency: s.agency, page: s.page, type: s.type, status: 'skipped', note: 'NR_SKIP developer switch', fetched: 0 }); continue; }
    const t0 = Date.now(); const status = { id: s.id, name: s.name, agency: s.agency, page: s.page, type: s.type, status: 'ok', error: null, fetchedAt: new Date().toISOString() };
    try { const r = await s.run(ctx); status.fetched = r.fetched; status.note = r.note; }
    catch (e) {
      status.status = prevPse && prevPse.records.some((x) => x.src === s.id) ? 'stale' : 'failed'; status.error = String(e.message).slice(0, 300);
      if (prevPse) { prevPse.records.filter((x) => x.src === s.id).forEach((x) => pseKept.push(x)); const o = (prevPse.sources || []).find((x) => x.id === s.id); status.stats = o && o.stats; status.fetchedAt = o ? o.fetchedAt : null; status.fetched = o ? o.fetched : 0; }
      status.note = 'Last fetch failed: ' + status.error + (status.status === 'stale' ? ' Showing records from the previous successful run.' : '');
    }
    if (status.status === 'ok') status.stats = (s.id === 'pse-nyc' || s.id === 'pse-chicago') ? undefined : pseStats[s.id];
    const keepSrc = s.id === 'pse-nyc' ? 'nyc' : s.id === 'pse-chicago' ? 'chicago' : s.id; status.kept = pseKept.filter((x) => x.src === keepSrc).length; status.asOf = ctx.asOf[s.id] || status.fetchedAt; if (keepSrc !== s.id) status.note += ' Kept counts include rows from the water-lane query of the same dataset.';
    console.log('pse ' + status.status.padEnd(6), s.id.padEnd(16), 'fetched', String(status.fetched || 0).padStart(6), 'kept', String(status.kept).padStart(4), ((Date.now() - t0) / 1000).toFixed(1) + 's', status.error ? ' ERR ' + status.error : '');
    pseStatuses.push(status);
  }
  statuses.forEach((st0) => { const sd = SOURCES.find((x) => x.id === st0.id); if (!sd || !prevPse || (st0.status !== 'stale' && st0.status !== 'failed')) return; const ids = sd.statIds || [sd.id]; prevPse.records.filter((x) => ids.indexOf(x.src) >= 0).forEach((x) => pseKept.push(x)); });
  RW_SOURCES.forEach((sd) => { const ss = rwStatuses.find((x) => x.id === sd.id); if (!ss || !prevPse || (ss.status !== 'stale' && ss.status !== 'failed')) return; prevPse.records.filter((x) => x.src === sd.id).forEach((x) => pseKept.push(x)); });
  if (!SKIP.size || process.env.NR_WRITE_PSE) {
    const mainPse = statuses.filter((x) => x.id !== 'sam-api').map((x) => { const sd = SOURCES.find((y) => y.id === x.id); const ids = sd.statIds || [sd.id]; return { id: x.id, name: x.name, agency: x.agency, page: x.page, type: x.type, status: x.status, error: x.error, fetched: x.fetched, fetchedAt: x.fetchedAt, asOf: x.asOf, stats: mergePse(ids.map((i) => pseStats[i]).filter(Boolean)), kept: pseKept.filter((r) => ids.indexOf(r.src) >= 0).length }; });
    const rwPse = rwStatuses.map((x) => ({ id: x.id, name: x.name, agency: x.agency, page: x.page, type: x.type, status: x.status, error: x.error, fetched: x.fetched, fetchedAt: x.fetchedAt, asOf: x.asOf, stats: mergePse([pseStats[x.id]].filter(Boolean)), kept: pseKept.filter((r) => r.src === x.id).length }));
    // dedupe within each lens (a design-build notice and its separately stated design fee share ids but are different lenses)
    const byLens = { fee: [], db: [], pipeline: [] }; pseKept.forEach((r) => { (byLens[r.lens] = byLens[r.lens] || []).push(r); });
    let pMerged = 0; const dedup = []; Object.keys(byLens).forEach((l) => { const d = M.dedupe(byLens[l]); pMerged += d._merged; d.forEach((r) => dedup.push(r)); });
    const val = (r) => (r.amt ? r.amt.v : r.dbValue ? r.dbValue.v : r.projectCost ? r.projectCost.v : 0);
    const pOrdered = dedup.sort((a, b) => ((b.confRank || 0) - (a.confRank || 0)) || (val(b) - val(a)));
    try { await cityCentroids(pOrdered); } catch (e) { console.warn('pse city centroids skipped:', e.message); }
    const feeR = pOrdered.filter((r) => r.lens === 'fee'), dbR = pOrdered.filter((r) => r.lens === 'db'), plR = pOrdered.filter((r) => r.lens === 'pipeline');
    const pc = { total: pOrdered.length, beforeDedupe: pseKept.length, mergedDuplicates: pMerged, byLens: PS_count(pOrdered, (r) => r.lens),
      fee: { total: feeR.length, byStage: PS_count(feeR, (r) => r.stage), byConf: PS_count(feeR, (r) => r.conf), byState: PS_count(feeR, (r) => r.state || '??'), bySrc: PS_count(feeR, (r) => r.src), byDomain: PS_count(feeR, (r) => (r.domains[0] || 'none')), strictGt5: feeR.filter((r) => r.amt.v > 5000000).length, exact5: feeR.filter((r) => r.amt.v === 5000000).length, textParsed: feeR.filter((r) => r.textParsed).length, confirmedGt5: feeR.filter((r) => r.conf === 'confirmed' && r.amt.v > 5000000).length, gt20: feeR.filter((r) => r.amt.v > 20000000).length },
      db: { total: dbR.length, byStage: PS_count(dbR, (r) => r.stage), byRole: PS_count(dbR, (r) => r.dbRole), byType: PS_count(dbR, (r) => r.dbType), byState: PS_count(dbR, (r) => r.state || '??'), bySrc: PS_count(dbR, (r) => r.src), withValue: dbR.filter((r) => r.dbValue).length, withDesignFee: dbR.filter((r) => r.designFee).length },
      pipeline: { total: plR.length, byState: PS_count(plR, (r) => r.state || '??'), bySrc: PS_count(plR, (r) => r.src), gt50: plR.filter((r) => r.projectCost.v > 50000000).length, gt100: plR.filter((r) => r.projectCost.v > 100000000).length },
      excludedConstruction: Object.keys(pseStats).reduce((n, k) => n + ((pseStats[k].excl || {}).construction || 0), 0), excludedByReason: Object.keys(pseStats).reduce((o, k) => { Object.keys(pseStats[k].excl || {}).forEach((c) => { o[c] = (o[c] || 0) + pseStats[k].excl[c]; }); return o; }, {}) };
    const pseOut = { generatedAt: new Date().toISOString(), asOfDate: AS_OF, generator: 'scripts/build-national.js', thresholds: { feeFloor: PS.FEE_FLOOR, feeDefault: PS.DEFAULT_FEE, pipeFloor: PS.PIPE_FLOOR, pipeDefault: PS.PIPE_DEFAULT, illustrative: PS.ILLUSTRATIVE }, counts: pc, sources: mainPse.concat(rwPse, pseStatuses), tested: PSE_TESTED, records: pOrdered };
    const pSlim = JSON.stringify(pseOut, (k, v) => (v === null || v === undefined || (Array.isArray(v) && !v.length) ? undefined : v));
    if (!pseOut.sources.some((x) => x.status === 'ok') || !pOrdered.length) console.error('PS&E: nothing usable fetched; keeping the existing file.');
    else { fs.writeFileSync(OUT_PSE, pSlim); console.log('wrote', OUT_PSE, pOrdered.length, 'records', (pSlim.length / 1024).toFixed(0) + ' KB', JSON.stringify(pc.byLens), 'fee>5M strict', pc.fee.strictGt5, 'exact5', pc.fee.exact5); }
  }
  if (SKIP.size) { console.log('NR_SKIP set: national.json NOT written.'); return; }
  // sector for forced TxDOT hydraulics discipline is already in the keyword rules via the title; nothing to add here.
  // dedupe across sources (award number, solicitation number, or identical title+agency+amount)
  const before = kept.length; const dd = M.dedupe(kept); const merged = dd._merged;
  const ordered = dd.slice().sort((a, b) => (b.amt ? b.amt.v : 0) - (a.amt ? a.amt.v : 0));
  let located = 0;
  try { located = await cityCentroids(ordered); } catch (e) { console.warn('city centroids skipped:', e.message); }
  const counts = { total: ordered.length, mergedDuplicates: merged, beforeDedupe: before, byBucket: M.countBy(ordered, (r) => r.bucket), byStatus: M.countBy(ordered, (r) => r.bucket + ':' + r.status), recompete: ordered.filter((r) => r.recompete).length, pinned: located };
  const out = { generatedAt: new Date().toISOString(), asOfDate: AS_OF, generator: 'scripts/build-national.js', feeThreshold: M.FEE_THRESHOLD, counts, sources: statuses, records: ordered };
  const okc = statuses.filter((s) => s.status === 'ok').length;
  if (!ordered.length || okc === 0) { console.error('Nothing usable fetched; keeping the existing file.'); process.exit(1); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // drop empty values to keep the file small
  const slim = JSON.stringify(out, (k, v) => (v === null || v === undefined || (Array.isArray(v) && !v.length) ? undefined : v));
  fs.writeFileSync(OUT, slim);
  console.log('wrote', OUT, ordered.length, 'records', (slim.length / 1024).toFixed(0) + ' KB', JSON.stringify(counts.byBucket), 'merged', merged, 'pinned', located);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { readCsv, SOURCES, record, stats };
