#!/usr/bin/env node
/**
 * Build bid-cost/detail-map.json from prices.json using Houston-first rules.
 *
 * Prefer fewer correct Houston links over guessed statewide URLs (v1 skips
 * unverified Design Division PDFs for pipe/box/SET items).
 *
 * Usage: node bid-cost/build-detail-map.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const dir = __dirname;
const HOUSTON_INDEX = 'https://www.dot.state.tx.us/hou/specinfo/specs.htm';

/** Houston 2024 standard detail PDFs (absolute URLs from district page). */
const HOUSTON = {
  'HIL-C-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/HIL-C-25%20(HOU).pdf',
  'HIL-A-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/HIL-A-25%20(HOU).pdf',
  'HIL-AD_AAD-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/HIL-AD_AAD-25%20(HOU).pdf',
  'MH-A_B-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/MH-A_B-25%20(HOU).pdf',
  'JB-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/JB-25%20(HOU).pdf',
  'TDD-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/TDD-25%20(HOU).pdf',
  'FD-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/FD-25%20(HOU).pdf',
  'OD-25':
    'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/OD-25%20(HOU).pdf'
};

function entry(label) {
  return {
    houston_url: HOUSTON[label],
    statewide_url: null,
    label: label
  };
}

/**
 * First-match-wins rules from the Houston-first plan.
 * Item = first 3 digits of bid_code; desc = uppercase description.
 */
function matchDetail(bidCode, description) {
  const item = String(bidCode || '').slice(0, 3);
  const desc = String(description || '').toUpperCase();

  // 1–4: Item 465 inlet / manhole / junction family
  if (item === '465') {
    if (desc.includes('INLET')) return entry('HIL-C-25');
    if (desc.includes('MANH') || desc.includes('MANHOLE')) return entry('MH-A_B-25');
    if (desc.includes('JB') || desc.includes('JUNCTION')) return entry('JB-25');
    return entry('JB-25'); // remaining 465 → JB family fallback
  }

  // 5: trench drain (keyword; avoid bare TRENCH excavation/panel)
  if (desc.includes('TRENCH DRAIN') || (desc.includes('TRENCH') && desc.includes('DRAIN'))) {
    return entry('TDD-25');
  }

  // 6: flume
  if (desc.includes('FLUME')) return entry('FD-25');

  // 7: outfall
  if (desc.includes('OUTFALL')) return entry('OD-25');

  // 8: Item 466 headwalls — leave unmapped (no clear HOU PDF invented)
  // 9: 460/462/464/467 pipe/box/SET — skip statewide unless verified (v1: skip)
  return null;
}

function headOk(url) {
  return new Promise(function (resolve) {
    const req = https.request(
      url,
      { method: 'HEAD', timeout: 8000 },
      function (res) {
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', function () {
      resolve(false);
    });
    req.on('timeout', function () {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function verifyHoustonUrls() {
  const labels = Object.keys(HOUSTON);
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const ok = await headOk(HOUSTON[label]);
    if (!ok) {
      console.warn('WARN: HEAD not 200 for', label, HOUSTON[label]);
    }
  }
}

async function main() {
  const prices = JSON.parse(fs.readFileSync(path.join(dir, 'prices.json'), 'utf8'));
  const rows = prices.rows || [];
  const by_code = Object.create(null);
  let houstonMapped = 0;
  let statewideMapped = 0;

  rows.forEach(function (row) {
    const matched = matchDetail(row.bid_code, row.description);
    if (!matched) return;
    by_code[row.bid_code] = matched;
    if (matched.houston_url) houstonMapped++;
    if (matched.statewide_url) statewideMapped++;
  });

  const today = new Date();
  const iso = today.toISOString().slice(0, 10);

  const out = {
    meta: {
      accessed: iso,
      houston_index: HOUSTON_INDEX,
      note:
        'Houston-first: 465 INLET→HIL-C-25, MANH→MH-A_B-25, JB/JUNCTION/else→JB-25; ' +
        'TRENCH DRAIN→TDD-25; FLUME→FD-25; OUTFALL→OD-25; 466/pipe-family left unmapped in v1'
    },
    by_code: by_code
  };

  // Optional live check; hardcoded table remains source of truth if scrape fails.
  try {
    await verifyHoustonUrls();
  } catch (err) {
    console.warn('WARN: Houston URL verify skipped:', err && err.message ? err.message : err);
  }

  const outPath = path.join(dir, 'detail-map.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  const totalCodes = Object.keys(by_code).length;
  console.log('wrote', outPath);
  console.log('mapped Houston:', houstonMapped);
  console.log('mapped statewide:', statewideMapped);
  console.log('total codes:', totalCodes);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
