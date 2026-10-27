#!/usr/bin/env node
/**
 * Pull FHWA's National Highway Construction Cost Index (NHCCI) from data.transportation.gov
 * (dataset r94d-n4f9, https://data.transportation.gov/d/r94d-n4f9; landing page
 * https://www.fhwa.dot.gov/policy/otps/nhcci/) into bid-estimator/data/nhcci.json.
 * Keeps quarter, NHCCI and seasonally adjusted NHCCI only. No values are typed by hand.
 * Usage: node bid-estimator/scripts/fetch-nhcci.js
 */
const fs = require('fs');
const path = require('path');
(async () => {
  const url = 'https://data.transportation.gov/resource/r94d-n4f9.json?$select=quarter,nhcci,nhcci_seasonally_adjusted&$limit=5000';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const rows = (await res.json()).map((r) => [r.quarter, Number(Number(r.nhcci).toFixed(6)), Number(Number(r.nhcci_seasonally_adjusted).toFixed(6))])
    .filter((r) => /^\d{4} Q[1-4]$/.test(r[0]) && r[2] > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const out = { source: 'FHWA National Highway Construction Cost Index (NHCCI), data.transportation.gov dataset r94d-n4f9',
    source_url: 'https://data.transportation.gov/d/r94d-n4f9', landing: 'https://www.fhwa.dot.gov/policy/otps/nhcci/',
    accessed: new Date().toISOString().slice(0, 10), columns: ['quarter', 'nhcci', 'nhcci_seasonally_adjusted'], rows: rows };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'nhcci.json'), JSON.stringify(out));
  console.log(rows.length + ' quarters, ' + rows[0][0] + ' to ' + rows[rows.length - 1][0]);
})();
