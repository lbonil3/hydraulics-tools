#!/usr/bin/env node
/* Builds opportunity-radar/data/opportunities.json from public feeds. No API keys. Node 18+ (global fetch).
   Run by hand (`node scripts/build-opportunities.js`) or from the scheduled workflow.
   Each source is isolated: if one fails, its previous records are kept (status "stale") and the others still update.
   Nothing is invented: only fields the sources return are used. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const M = require('../opportunity-radar/model.js');

const OUT = path.join(__dirname, '..', 'opportunity-radar', 'data', 'opportunities.json');
const GEO = path.join(__dirname, '..', 'opportunity-radar', 'texas-geo.js');
const UA = 'hydraulics-tools-opportunity-radar (+https://github.com/lbonil3/hydraulics-tools)';

async function get(url, opts) {
  opts = opts || {};
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), opts.timeout || 90000);
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: opts.accept || '*/*' }, signal: ctl.signal, redirect: 'follow' });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url.slice(0, 120));
      return opts.binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw lastErr;
}
async function getJson(url) {
  const body = await get(url, { accept: 'application/json' });
  const j = JSON.parse(body);
  if (j && j.error) throw new Error('API error ' + JSON.stringify(j.error).slice(0, 200) + ' for ' + url.slice(0, 120));
  return j;
}
const qs = (o) => Object.keys(o).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');

async function arcgisAll(base, params, pageSize) {
  pageSize = pageSize || 1000;
  let feats = [], offset = 0, fields = null;
  for (;;) {
    const j = await getJson(base + '/query?' + qs(Object.assign({ f: 'json', resultOffset: offset, resultRecordCount: pageSize }, params)));
    fields = fields || j.fields;
    feats = feats.concat(j.features || []);
    if (!j.exceededTransferLimit || !(j.features || []).length) break;
    offset += (j.features || []).length;
  }
  return feats;
}

// ---- minimal xlsx reader (zip central directory + zlib), first worksheet only ----
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(off + 26), lelen = buf.readUInt16LE(off + 28), start = off + 30 + lnlen + lelen;
    const data = buf.subarray(start, start + csize);
    files[name] = method === 0 ? data : zlib.inflateRawSync(data);
    p += 46 + nlen + elen + clen;
  }
  return files;
}
function xlsxRows(buf) {
  const z = unzip(buf), dec = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const ss = [];
  if (z['xl/sharedStrings.xml']) {
    const x = z['xl/sharedStrings.xml'].toString('utf8'); const re = /<si>([\s\S]*?)<\/si>/g; let m;
    while ((m = re.exec(x))) { let t = ''; const tr = /<t[^>]*>([\s\S]*?)<\/t>/g; let tm; while ((tm = tr.exec(m[1]))) t += tm[1]; ss.push(dec(t)); }
  }
  const sheetName = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const x = z[sheetName].toString('utf8'), rows = []; const rre = /<row [^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g; let rm;
  const colIdx = (ref) => { const l = /^[A-Z]+/.exec(ref)[0]; let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  while ((rm = rre.exec(x))) {
    const row = []; if (rm[1]) {
      const cre = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
      while ((cm = cre.exec(rm[1]))) {
        const attrs = cm[1], body = cm[2] || ''; const ref = /r="([A-Z]+\d+)"/.exec(attrs); if (!ref) continue;
        const type = (/t="([^"]+)"/.exec(attrs) || [])[1]; const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        let val = null;
        if (type === 's' && v !== undefined) val = ss[+v]; else if (type === 'inlineStr') val = dec(((/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)) || [, ''])[1]); else if (v !== undefined) val = type === 'str' || type === 'e' ? dec(v) : Number(v);
        row[colIdx(ref[1])] = val === undefined ? null : val;
      }
    }
    rows.push(row);
  }
  return rows;
}

// ---- sources ----
const SOURCES = [
  { id: 'txdot-pi', name: 'TxDOT Project Information (data.texas.gov / Socrata, refreshed hourly by TxDOT)', agency: 'TxDOT', type: 'API (CORS open; also refreshable live in the browser)', page: M.TXDOT_DATASET,
    run: async (ctx) => {
      const stages = M.TXDOT_KEEP_STAGES.map((s) => "'" + s.replace(/'/g, "''") + "'").join(',');
      const url = 'https://data.texas.gov/resource/drau-zphx.json?' + qs({ $select: M.TXDOT_SELECT.join(','), $where: 'project_stage in (' + stages + ")", $limit: 50000, $order: 'project_id' });
      const rows = JSON.parse(await get(url, { timeout: 180000 }));
      const total = JSON.parse(await get('https://data.texas.gov/resource/drau-zphx.json?$select=count(*)'))[0].count;
      const recs = rows.map(M.normTxdotPI).filter(Boolean);
      return { fetched: rows.length, recs, note: 'Dataset has ' + total + ' rows in all stages; kept projects in pre-construction stages (' + M.TXDOT_KEEP_STAGES.join(', ') + ') that match drainage keywords or roadway/bridge types likely to carry drainage design.' };
    } },
  { id: 'txdot-tracker', name: 'TxDOT Project Tracker, PS&E milestone dates (ArcGIS TxDOT_Projects_Info)', agency: 'TxDOT', type: 'API (CORS open); enrichment only, joined by project ID', page: 'https://www.txdot.gov/projects/project-tracker.html',
    run: async (ctx) => {
      const base = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/TxDOT_Projects_Info/FeatureServer/0';
      const stages = M.TXDOT_KEEP_STAGES.map((s) => "'" + s + "'").join(',');
      const feats = await arcgisAll(base, { where: 'PROJ_STG in (' + stages + ')', outFields: M.TRACKER_FIELDS.join(','), returnGeometry: false }, 1000);
      const map = {}; feats.forEach((f) => { map[f.attributes.PROJ_ID] = f.attributes; });
      let joined = 0; ctx.records.forEach((r) => { if (r.src === 'txdot-pi') { const id = r.id.slice(6); if (map[id] && M.mergeTracker(r, map[id])) joined++; } });
      return { fetched: feats.length, recs: [], joined, note: 'Enrichment only (adds actual PS&E 30/60/100% dates and TxDOT contact where the Tracker has them). Joined to ' + joined + ' radar records.' };
    } },
  { id: 'txdot-pcl', name: 'TxDOT Projected Contracts List: anticipated A/E/S consultant contracts (xlsx)', agency: 'TxDOT', type: 'Snapshot (file download, no CORS)', page: 'https://www.txdot.gov/business/peps/opportunities/fiscal-year-procurement-plan.html',
    run: async () => {
      const now = new Date(); const fy0 = now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(); const recs = []; const tried = []; let fetched = 0;
      for (const fy of [fy0, fy0 + 1]) {
        const url = 'https://www.txdot.gov/content/dam/docs/division/ppd/projected-contracts/projected-contracts-list-' + fy + '.xlsx';
        try { const rows = xlsxRows(await get(url, { binary: true })); const rs = M.parseProjectedContracts(rows, url, 'FY' + fy); fetched += rs.length; recs.push(...rs); tried.push('FY' + fy + ': ' + rs.length + ' rows'); } catch (e) { tried.push('FY' + fy + ': ' + String(e.message).slice(0, 60)); }
      }
      if (!recs.length) throw new Error('no projected contracts list could be read (' + tried.join('; ') + ')');
      return { fetched, recs, note: 'All rows kept (including non-drainage disciplines, flagged as not relevant). ' + tried.join('; ') };
    } },
  { id: 'txdot-peps', name: 'TxDOT PEPS "Consultants selected for negotiations" (HTML table: PS&E, H&H, bridge design only)', agency: 'TxDOT', type: 'Snapshot (HTML scrape of a public page; txdot.gov has no robots.txt)', page: M.PEPS_SELECTED_PAGE,
    run: async () => {
      const html = await get(M.PEPS_SELECTED_PAGE); const fyMin = new Date().getUTCFullYear() - 1;
      const recs = M.parsePepsSelected(html, fyMin);
      if (!recs.length) throw new Error('no PS&E/H&H/BRGD rows parsed (page layout may have changed)');
      return { fetched: recs.length, recs, note: 'Keeps work types PS&E, H&H and BRGD from fiscal year ' + fyMin + ' onward. The page lists only ID, closing date, wave, work type, service center.' };
    } },
  { id: 'txdot-meetings', name: 'TxDOT PEPS consultant information meetings (HTML table)', agency: 'TxDOT', type: 'Snapshot (HTML scrape of a public page)', page: M.PEPS_MEETINGS_PAGE,
    run: async () => {
      const html = await get(M.PEPS_MEETINGS_PAGE); const recs = M.parsePepsMeetings(html);
      const total = M.htmlTables(html).reduce((n, t) => n + (t.length && /^date$/i.test(t[0].cells[0]) ? t.length - 1 : 0), 0);
      if (!total) throw new Error('meetings table not found (page layout may have changed)');
      return { fetched: total, recs, note: 'Kept meetings whose title mentions PS&E/hydraulics/drainage/bridge design or matches drainage keywords.' };
    } },
  { id: 'coh-cip', name: 'City of Houston CIP: stormwater and drainage layers (HPW CIPProgramming MapServer)', agency: 'City of Houston', type: 'Snapshot (ArcGIS REST; CORS reflects origin)', page: 'https://geoprocessor2.houstontx.gov/arcgis/rest/services/CP/CIPProgramming/MapServer?f=pjson',
    run: async () => {
      const byKey = {}; let fetched = 0;
      for (const layer of M.COH_LAYERS) {
        const feats = await arcgisAll(M.COH_BASE + '/' + layer.id, { where: '1=1', outFields: '*', outSR: 4326, returnGeometry: true, maxAllowableOffset: 0.001 }, 1000);
        fetched += feats.length;
        feats.forEach((f) => {
          const r = M.normCohCip(f.attributes, f.geometry, layer); if (!r) return;
          const k = r._cip + '|' + r.stage; const prev = byKey[k];
          // prefer the Benefit Drainage Area record (richer attributes) over the plain stormwater line
          if (!prev || (layer.id === 11 || layer.id === 68)) byKey[k] = r;
        });
      }
      const recs = Object.keys(byKey).map((k) => { const r = byKey[k]; delete r._cip; delete r._layer; return r; });
      return { fetched, recs, note: 'Layers 7, 11, 65, 68 (stormwater/drainage) kept whole; layers 2 and 10 (street/traffic, interagency) kept only when the description matches drainage keywords. Same CIP number+stage across layers is merged. Completed (CP) projects dropped.' };
    } },
  { id: 'coh-swmb', name: 'City of Houston stormwater maintenance (SWMB) project list (FeatureServer)', agency: 'City of Houston', type: 'Snapshot (ArcGIS REST)', page: 'https://geoprocessor2.houstontx.gov/arcgis/rest/services/SWMB_Projects/FeatureServer?f=pjson',
    run: async () => {
      const feats = await arcgisAll(M.COH_SWMB_BASE, { where: '1=1', outFields: '*', returnGeometry: false }, 1000);
      const recs = feats.map((f) => M.normSwmb(f.attributes)).filter(Boolean);
      return { fetched: feats.length, recs, note: 'Kept pre-construction and in-progress statuses only (nomination, qualifies, planned, study, screening, in design, NTP pending, in construction, on hold). Completed, cancelled, closed, transferred and archived dropped.' };
    } },
  { id: 'hcfcd-maint', name: 'HCFCD maintenance project schedule (ArcGIS layer hosted by LJA Engineering; unofficial mirror)', agency: 'HCFCD', type: 'Snapshot (ArcGIS REST)', page: M.HCFCD_PAGE,
    run: async () => {
      const feats = await arcgisAll(M.HCFCD_LJA, { where: '1=1', outFields: '*', outSR: 4326, returnGeometry: true }, 1000);
      const recs = feats.map((f) => M.normHcfcdMaint(f.attributes, f.geometry)).filter(Boolean);
      return { fetched: feats.length, recs, note: 'Hosted by a consulting firm, not by HCFCD; only FY26 maintenance projects (not the capital/bond program). Completed and cancelled dropped.' };
    } },
  { id: 'hcfcd-bids', name: 'HCFCD "Current & Past Bid Opportunities" (HTML tables, links to Bonfire)', agency: 'HCFCD', type: 'Snapshot (HTML scrape; hcfcd.org robots.txt does not disallow this path)', page: M.HCFCD_BIDS_PAGE,
    run: async () => {
      const html = await get(M.HCFCD_BIDS_PAGE); const recs = M.parseHcfcdBids(html);
      if (!recs.length) throw new Error('no bid rows parsed (page layout may have changed)');
      return { fetched: recs.length, recs, note: 'The page lists job number, title and a Bonfire link only: no due dates, no open/closed flag, no location. Links are copied from HCFCD\'s page; Bonfire answers automated requests with 403 (bot protection), so they were not click-tested.' };
    } },
  { id: 'twdb-fif', name: 'TWDB Flood Infrastructure Fund project list (table hosted by Pape-Dawson Engineers; mirror of TWDB data)', agency: 'TWDB', type: 'Snapshot (ArcGIS REST table, no coordinates)', page: M.FIF_PAGE,
    run: async () => {
      const feats = await arcgisAll(M.FIF_URL, { where: '1=1', outFields: '*', returnGeometry: false }, 1000);
      const recs = feats.map((f) => M.normFif(f.attributes)).filter(Boolean);
      return { fetched: feats.length, recs, note: 'Mirror hosted by a consulting firm. Rows have sponsor, name, estimated cost and FIF type; no stage, date or coordinates.' };
    } }
];

async function main() {
  let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
  const ctx = { records: [] }; const statuses = [];
  for (const s of SOURCES) {
    const t0 = Date.now(); const st = { id: s.id, name: s.name, agency: s.agency, type: s.type, page: s.page };
    try {
      const r = await s.run(ctx);
      st.status = 'ok'; st.fetched = r.fetched; st.kept = r.recs.length; st.note = r.note; st.fetchedAt = new Date().toISOString();
      if (r.joined !== undefined) st.joined = r.joined;
      ctx.records.push(...r.recs);
    } catch (e) {
      const old = prev ? prev.records.filter((x) => x.src === s.id) : [];
      const ost = prev ? (prev.sources || []).find((x) => x.id === s.id) : null;
      st.status = old.length || s.id === 'txdot-tracker' ? 'stale' : 'failed'; st.error = String(e.message).slice(0, 300);
      st.fetched = ost ? ost.fetched : 0; st.kept = old.length; st.fetchedAt = ost ? ost.fetchedAt : null; st.note = 'Last fetch failed: ' + st.error + (old.length ? ' Showing records from the previous successful run.' : '');
      if (s.id === 'txdot-tracker') { // keep prior enrichment: re-carry extras from previous txdot-pi records
        const pm = {}; if (prev) prev.records.forEach((x) => { if (x.src === 'txdot-pi') pm[x.id] = x; });
        ctx.records.forEach((r) => { const o = pm[r.id]; if (o && o.tracker) { r.extra = o.extra; r.tracker = true; } });
      } else ctx.records.push(...old);
    }
    console.log((st.status + '      ').slice(0, 7), s.id.padEnd(15), 'fetched', String(st.fetched).padStart(6), 'kept', String(st.kept).padStart(5), ((Date.now() - t0) / 1000).toFixed(1) + 's', st.error ? ' ERR ' + st.error : '');
    statuses.push(st);
  }
  // county-centroid fallback location (inferred), only when a source names a county but gives no coordinates
  let approx = 0;
  try { const g = fs.readFileSync(GEO, 'utf8'); const geo = JSON.parse(g.slice(g.indexOf('{'), g.lastIndexOf('}') + 1)); ctx.records.forEach((r) => { delete r.alat; delete r.alon; }); approx = M.applyApprox(ctx.records, M.countyCentroids(geo)); } catch (e) { console.warn('no county centroids', e.message); }
  // stable ordering and id uniqueness
  const seen = {}; const records = ctx.records.filter((r) => { if (seen[r.id]) return false; seen[r.id] = 1; return true; });
  records.sort((a, b) => (a.agency < b.agency ? -1 : a.agency > b.agency ? 1 : a.id < b.id ? -1 : 1));
  records.forEach((r) => { Object.keys(r).forEach((k) => { if (r[k] === null || r[k] === undefined || (Array.isArray(r[k]) && !r[k].length)) delete r[k]; }); delete r._t; });
  const out = { generatedAt: new Date().toISOString(), generator: 'scripts/build-opportunities.js', approxLocated: approx, sources: statuses, records };
  const ok = statuses.filter((s) => s.status === 'ok').length;
  if (!records.length || ok === 0) { console.error('Nothing usable fetched; keeping existing file.'); process.exit(1); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, records.length, 'records,', (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB,', ok + '/' + statuses.length, 'sources ok');
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { xlsxRows, unzip, SOURCES };
