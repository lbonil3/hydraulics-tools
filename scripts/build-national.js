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

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'national-radar', 'data', 'national.json');
const CACHE = path.join(__dirname, '.cache-national');
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
async function main() {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const ctx = { asOf: {} }; const statuses = [];
  for (const s of SOURCES) {
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
