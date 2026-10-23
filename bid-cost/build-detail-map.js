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

/**
 * Statewide TxDOT Bridge Division culvert & drainage standards, verified as
 * listed on the official index STATEWIDE_INDEX (no Houston district versions
 * exist for these sheets on the Houston 2024 list).
 */
const STATEWIDE_INDEX =
  'https://www.dot.state.tx.us/insdtdot/orgchart/cmd/cserve/standard/bridge-e.htm';
const SW_BASE = 'https://ftp.dot.state.tx.us/pub/txdot-info/cmd/cserve/standard/bridge/';
const STATEWIDE = {};
[
  'CH-FW-0:CD-CH-FW0-20', 'CH-FW-15:CD-CH-FW15-20', 'CH-FW-30:CD-CH-FW30-20',
  'CH-FW-45:CD-CH-FW45-20', 'CH-FW-A-0:CD-CH-FWA0-20', 'CH-FW-A-15:CD-CH-FWA15-20',
  'CH-FW-A-30:CD-CH-FWA30-20', 'CH-FW-A-45:CD-CH-FWA45-20', 'CH-PW-0:CD-CH-PW0-20',
  'CH-PW-S:CD-CH-PWS-20', 'CH-PW-A-0:CD-CH-PWA0-20', 'CH-PW-A-S:CD-CH-PWAS-20',
  'SW-0:CD-SW0-20', 'FW-0:CD-FW0-20', 'FW-S:CD-FWS-20', 'PW:CD-PW-20',
  'SETB-CD:CD-SETBCD-20', 'SETB-PD:CD-SETBPD-22', 'SETP-CD:CD-SETP-CD-20',
  'SETP-PD:CD-SETP-PD-20', 'SETP-CD-A:CD-SETP-CDA-20', 'SETP-PD-A:CD-SETP-PDA-20',
  'SETP-FW-0:CD-SETP-FW0-20', 'SETP-FW-15:CD-SETP-FW15-20', 'SETP-FW-30:CD-SETP-FW30-20',
  'SCP-MD:CD-SCP-MD-20'
].forEach(function (pair) {
  const i = pair.indexOf(':');
  STATEWIDE[pair.slice(0, i)] = SW_BASE + pair.slice(i + 1) + '.pdf';
});

function swEntry(label) {
  return { houston_url: null, statewide_url: STATEWIDE[label], label: label };
}

/** Assumed sheet: description does not pin the sheet; label ends ' (assumed)'. */
function assumedEntry(label) {
  return {
    houston_url: null,
    statewide_url: STATEWIDE[label],
    label: label + ' (assumed)',
    assumed: true
  };
}

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
    if (/\bINL(?:ET|T)?\b/.test(desc)) {
      if (/\(AD\)|\bAAD\b|\bAD\b/.test(desc)) return entry('HIL-AD_AAD-25');
      return entry('HIL-C-25');
    }
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

  // 8: Item 466 headwalls / wingwalls (statewide; keyed on wing type in desc)
  const d = desc.replace(/\s+/g, '');
  if (item === '466') {
    let m = d.match(/\(CH-(FW|PW)-(A-)?(0|15|30|45|S)\)/);
    if (m) {
      const label = 'CH-' + m[1] + '-' + (m[2] || '') + m[3];
      return STATEWIDE[label] ? swEntry(label) : null;
    }
    if (d.indexOf('WINGWALL') === 0) {
      if (/\(PW-MSE\)/.test(d) || /\(SPL\)/.test(d)) return null;
      m = d.match(/\((FW|SW|PW)(?:-(0|S|\d+))?\)/);
      if (!m) return null;
      if (m[1] === 'PW') return swEntry('PW');
      const label = m[1] + '-' + m[2];
      return STATEWIDE[label] ? swEntry(label) : null;
    }
    return null;
  }

  // 9: Item 467 safety end treatments. (C)=cross, (P)=parallel drainage.
  if (item === '467') {
    const cp = /\(C\)$/.test(d) ? 'CD' : /\(P\)$/.test(d) ? 'PD' : null;
    if (!cp) return null; // pipe runners, remove/reinstall, etc.
    if (/^SET\(TYI\)\(S=/.test(d)) return swEntry('SETB-' + cp); // box SET
    if (/^SET\(TYII\)\(DES\d/.test(d)) return swEntry('SETP-' + cp + '-A'); // arch pipe
    if (/^SET\(TYII\)\(\d+(IN|")\)/.test(d)) return swEntry('SETP-' + cp);
    if (/^SET\(TYI\)\(\d+(IN|")\)/.test(d)) {
      // TY I pipe SET = SETP-FW. Use stated skew if any, else assume 0 deg.
      const sk = d.match(/(?:SKEW=?|\()(15|30)(?:DEG|°)/);
      if (sk) return swEntry('SETP-FW-' + sk[1]);
      return assumedEntry('SETP-FW-0');
    }
    return null;
  }

  // 10: Item 462 box culverts. Desc gives size only (no CIP/precast, no
  // multi-box count) → assumed precast single box misc details SCP-MD.
  if (item === '462' && /BOX/.test(desc)) return assumedEntry('SCP-MD');

  // 460 CMP, 462 box (C-I-P vs precast, single vs multi not stated),
  // 464 RCP, 432, 400, 496: no single verified sheet fits → unmapped.
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
      statewide_index: STATEWIDE_INDEX,
      note:
        'Houston-first: 465 INLET/INL/INLT→HIL-C-25 (AD/AAD→HIL-AD_AAD-25), MANH→MH-A_B-25, JB/JUNCTION/else→JB-25; ' +
        'TRENCH DRAIN→TDD-25; FLUME→FD-25; OUTFALL→OD-25. ' +
        'Statewide (Bridge Div. culvert stds, no HOU version): 466 CH-FW/CH-PW (incl. A, skew)→CD-CH-*, ' +
        'WINGWALL FW-0/FW-S/SW-0/PW→CD-FW0/FWS/SW0/PW; 467 SET TY I box (S=,HW=)→SETB-CD/PD, ' +
        'SET TY II pipe→SETP-CD/PD, arch (DES)→SETP-CD-A/PD-A by (C)/(P). ' +
        'ASSUMED links (label ends \' (assumed)\', assumed:true; verify type): 462 box→SCP-MD precast single-box misc details ' +
        '(desc lacks CIP/precast and box count); 467 SET TY I pipe with no skew→SETP-FW-0 (15/30 sheet unassumed if skew stated). ' +
        'Unmapped (no sheet): 460 CMP, 464 RCP, pipe runners, SPL/MSE wingwalls, 432/400/496'
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
