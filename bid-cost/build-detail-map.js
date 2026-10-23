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

  // 11+: non-drainage groups (traffic, roadway, bridge rail). See matchGeneral.
  return matchGeneral(item, desc, d);
}

/* ---- Non-drainage standards (all hrefs copied from official index pages) ---- */
const TRAFFIC_INDEX = 'https://www.dot.state.tx.us/insdtdot/orgchart/cmd/cserve/standard/toc.htm';
const ROADWAY_INDEX = 'https://www.dot.state.tx.us/insdtdot/orgchart/cmd/cserve/standard/rdwylse.htm';
const STD = 'https://ftp.dot.state.tx.us/pub/txdot-info/cmd/cserve/standard/';
const HOU24 = 'https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/';
const GEN = {
  // traffic (Traffic Safety Division index)
  'RID (set)': STD + 'traffic/RID-20.pdf',
  'ED(1)-25': STD + 'traffic/ed1-25.pdf',
  'ED(3)-25': STD + 'traffic/ed3-25.pdf',
  'ED(4)-25': STD + 'traffic/ed4-25.pdf',
  'ED(12)-25': STD + 'traffic/ed12-25.pdf',
  'ED (set)': STD + 'traffic/ED.pdf',
  'SMD (set)': STD + 'traffic/SMD.pdf',
  'SMD(2) (set)': STD + 'traffic/SMD(2)-24.pdf',
  'D&OM (set)': STD + 'traffic/D%26OM-25.pdf',
  'PM (set)': STD + 'traffic/PM-22.pdf',
  'PM(2)-22': STD + 'traffic/pm2-22.pdf',
  'RRPM-24': STD + 'traffic/rrpm-24.pdf',
  'WZ(STPM)-23': STD + 'traffic/wz(stpm)-23.pdf',
  'BC (set)': STD + 'traffic/bcsm-21.pdf',
  'TS-BP-20': STD + 'traffic/ts-bp-20.pdf',
  'LD(1)-03': STD + 'traffic/ld-03.pdf',
  // roadway (Design Division roadway index)
  'EC(1)-16': STD + 'roadway/ec116.pdf',
  'EC(2)-16': STD + 'roadway/ec216.pdf',
  'EC(3)-16': STD + 'roadway/ec316.pdf',
  'EC(9)-16': STD + 'roadway/ec916.pdf',
  'CCCG-22': STD + 'roadway/cccg22.pdf',
  'PED-18': STD + 'roadway/ped18.pdf',
  'REPCP-25': STD + 'roadway/repcp25.pdf',
  'CPCD-24': STD + 'roadway/cpcd24.pdf',
  'TRANS-20': STD + 'roadway/transitslab20.pdf',
  'GF(31)-19': STD + 'roadway/gf3119.pdf',
  'GF(31)LS-19': STD + 'roadway/gf31ls19.pdf',
  'GF(31)DAT-19': STD + 'roadway/gf31dat19.pdf',
  'GF(31)TRTL3-20': STD + 'roadway/gf31trtl320.pdf',
  'SRG(TL-2)-21': STD + 'roadway/srgtl221.pdf',
  'SRG(TL-3)-21': STD + 'roadway/srgtl321.pdf',
  'LPCB-26': STD + 'roadway/lpcb26.pdf',
  'CSB(1)-10': STD + 'roadway/csb110.pdf',
  'CSB(4)-19': STD + 'roadway/csb419.pdf',
  'CSB(6)-10': STD + 'roadway/csb610.pdf',
  'SSCB(1)-16': STD + 'roadway/sscb116.pdf',
  'SSCB(3)-10': STD + 'roadway/sscb310.pdf',
  'SSCB(4)-19': STD + 'roadway/sscb419.pdf',
  'SSCHEB-21': STD + 'roadway/sscheb21.pdf',
  'SSCHEB2-21': STD + 'roadway/sscheb221.pdf'
};
// Houston District 2024 list (name match only)
const GEN_HOU = {
  'SSCB(2)-25': HOU24 + 'SSCB(2)-25%20(HOU).pdf',
  'CRCP-HS-25': HOU24 + 'CRCP-HS-25%20(HOU).pdf',
  'JRCP-25': HOU24 + 'JRCP-25%20(HOU).pdf',
  'CLF-25': HOU24 + 'CLF-25%20(HOU).pdf'
};
// Bridge rail sheets listed on bridge-e.htm (type → file stem)
const RAIL = {};
['C-RAIL-R-20', 'C1W-19', 'C221-19', 'C223-19', 'C2P-19', 'C402-19', 'C411-20', 'C412-19', 'C66-19',
  'CLF-RO-19', 'PR11-19', 'PR22-19', 'PR3-19', 'SSTR-19', 'T1F-19', 'T1W-19', 'T221-19', 'T221P-19',
  'T222-19', 'T223-19', 'T224-19', 'T2P-19', 'T402-19', 'T411-20', 'T551-19', 'T552-19', 'T631-23',
  'T631LS-23', 'T66-19', 'T80HT-19', 'T80PP-RF-20', 'T80PP-TS-20', 'T80SS-19'
].forEach(function (f) {
  RAIL[f.replace(/-\d\d$/, '')] = f;
});

function gen(label, assumed) {
  const e = { houston_url: null, statewide_url: GEN[label], label: label };
  if (assumed) { e.label += ' (assumed)'; e.assumed = true; }
  return e;
}
function genHou(label) {
  return { houston_url: GEN_HOU[label], statewide_url: null, label: label };
}

function matchGeneral(item, desc, d) {
  switch (item) {
    case '360':
      if (/JCT|TERMINAL/.test(desc)) return null;
      if (/TRANSITION/.test(desc)) return gen('TRANS-20');
      if (/CPCD/.test(desc)) return gen('CPCD-24');
      if (/CRCP|CONT REINF/.test(desc)) return genHou('CRCP-HS-25');
      if (/JOINT REINF|CPJR|JRCP/.test(desc)) return genHou('JRCP-25');
      return null;
    case '361':
      return /DEPTH REP/.test(desc) ? gen('REPCP-25') : null;
    case '450': {
      if (/CLF-RO/.test(d)) return railEntry('CLF-RO');
      const m = d.match(/\(TY([A-Z0-9]+(?:-[A-Z]+)?)\)/);
      const r = m ? railEntry(m[1]) : null;
      if (r && /\(MOD\)/.test(d)) { r.label += ' (assumed)'; r.assumed = true; }
      return r;
    }
    case '502':
      return /BARR.*SIGN.*TRAF/.test(desc) ? gen('BC (set)') : null;
    case '506':
      if (/ROCK FILTER DAM/.test(desc)) return gen('EC(2)-16');
      if (/CONSTRUCTION EXIT/.test(desc)) return gen('EC(3)-16');
      if (/SEDMT CONT FENCE|SEDIMENT CONTROL FENCE/.test(desc)) return gen('EC(1)-16');
      if (/EROSN CONT LOG|EROSION CONTROL LOG/.test(desc)) return gen('EC(9)-16');
      return null;
    case '512':
      if (/CONNECT/.test(desc) || /OR\s*\(STL\)|SSCB OR CSB/.test(desc)) return null;
      if (/LOW PROF/.test(desc)) return gen('LPCB-26');
      if (/F-?\s?SHAPE/.test(desc)) return gen('CSB(1)-10');
      if (/SGL SL|SINGLE SLOPE/.test(desc)) return genHou('SSCB(2)-25');
      return null;
    case '514':
      if (/MOD|TRAN|SPECIAL|SPLIT/.test(desc)) return null;
      if (/HEB/.test(desc)) return /RGD/.test(desc) ? gen('SSCHEB-21') : /FLEX/.test(desc) ? gen('SSCHEB2-21') : null;
      if (/SGL SLOPE|SSCB/.test(desc)) {
        if (/\(TY3\)/.test(d)) return gen('SSCB(3)-10');
        if (/\(TY4\)/.test(d)) return gen('SSCB(4)-19');
        if (/\(TY1\)/.test(d)) return gen('SSCB(1)-16', true); // CIP TY1 rigid vs flexible (1F) not stated
        return null;
      }
      if (/F-SHAPE/.test(desc)) {
        if (/\(TY2\)/.test(d)) return gen('CSB(4)-19');
        if (/\(TY3\)/.test(d)) return gen('CSB(6)-10');
        return null;
      }
      return null;
    case '529':
      return /CURB|GUTTER|C&G/.test(desc) && !/U-TURN/.test(desc) ? gen('CCCG-22') : null;
    case '531':
      return /CURB RAMP/.test(desc) ? gen('PED-18') : null;
    case '540':
      if (/ADJUST|SPECIAL|LOW FILL|NESTED|CONNECTOR|DRIVEWAY/.test(desc)) return null;
      if (/SHORT RADIUS/.test(desc)) {
        if (/TL-?3/.test(desc)) return gen('SRG(TL-3)-21');
        if (/TL-?2/.test(desc)) return gen('SRG(TL-2)-21');
        return null;
      }
      if (/DOWNSTREAM ANCHOR/.test(desc)) return gen('GF(31)DAT-19');
      if (/TRANS/.test(desc)) return /THRIE/.test(desc) ? gen('GF(31)TRTL3-20', true) : null;
      if (/LONG SPAN/.test(desc)) return gen('GF(31)LS-19', true);
      if (/W\s?-\s?BEAM GD FEN/.test(desc)) return gen('GF(31)-19', true); // 31" vs 28" MBGF not stated
      return null;
    case '550':
      return /CHAIN LINK|CL FENCE/.test(desc) ? genHou('CLF-25') : null;
    case '610':
      return /\bRD IL\b/.test(desc) ? gen('RID (set)') : null;
    case '618':
      return /^CONDT|^CONDUIT/.test(desc) ? gen('ED(1)-25') : null;
    case '620':
      return /ELEC CONDR/.test(desc) ? gen('ED(3)-25') : null;
    case '624':
      if (/GROUND BOX TY BATTERY/.test(desc)) return gen('ED(12)-25');
      return /GROUND BOX TY [A-E]\b/.test(desc) ? gen('ED(4)-25') : null;
    case '628':
      return /ELC SRV TY/.test(desc) ? gen('ED (set)') : null;
    case '644':
      return /SM RD SN SUP|SRSS/.test(desc) ? gen('SMD (set)') : null;
    case '647':
      return /LRSS|LRSA/.test(desc) ? gen('SMD(2) (set)') : null;
    case '658':
      return /DEL|OM |OBJECT MARKER/.test(desc) ? gen('D&OM (set)') : null;
    case '662':
      return /SHT TERM/.test(desc) ? gen('WZ(STPM)-23') : null;
    case '666':
      if (/SEALER|SLER|ELIM/.test(desc)) return null;
      return /PAV MRK|\bPM\b/.test(desc) ? gen('PM (set)') : null;
    case '672':
      if (/RECESSED/.test(desc)) return gen('RRPM-24');
      return /REFL PAV MRKR/.test(desc) ? gen('PM(2)-22') : null;
    case '682':
      return /BACK\s?PLATE/.test(desc) ? gen('TS-BP-20') : null;
    case '688':
      return /VEH LP DETECT/.test(desc) ? gen('LD(1)-03') : null;
    default:
      return null;
  }
}

function railEntry(type) {
  const f = RAIL[type];
  if (!f) return null;
  return { houston_url: null, statewide_url: SW_BASE + 'RL-' + f + '.pdf', label: 'RL-' + f };
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
      traffic_index: TRAFFIC_INDEX,
      roadway_index: ROADWAY_INDEX,
      note:
        'Houston-first: 465 INLET/INL/INLT→HIL-C-25 (AD/AAD→HIL-AD_AAD-25), MANH→MH-A_B-25, JB/JUNCTION/else→JB-25; ' +
        'TRENCH DRAIN→TDD-25; FLUME→FD-25; OUTFALL→OD-25. ' +
        'Statewide (Bridge Div. culvert stds, no HOU version): 466 CH-FW/CH-PW (incl. A, skew)→CD-CH-*, ' +
        'WINGWALL FW-0/FW-S/SW-0/PW→CD-FW0/FWS/SW0/PW; 467 SET TY I box (S=,HW=)→SETB-CD/PD, ' +
        'SET TY II pipe→SETP-CD/PD, arch (DES)→SETP-CD-A/PD-A by (C)/(P). ' +
        'ASSUMED links (label ends \' (assumed)\', assumed:true; verify type): 462 box→SCP-MD precast single-box misc details ' +
        '(desc lacks CIP/precast and box count); 467 SET TY I pipe with no skew→SETP-FW-0 (15/30 sheet unassumed if skew stated). ' +
        'Non-drainage (statewide traffic/roadway/bridge-rail indexes; HOU 2024 where same sheet exists): ' +
        '360 CRCP→CRCP-HS-25(HOU), JRCP→JRCP-25(HOU), CPCD→CPCD-24, transition→TRANS-20; 361→REPCP-25; 450 RAIL (TY x)→RL-x; ' +
        '502 BC set; 506 EC(1/2/3/9); 512 low prof→LPCB, F-shape→CSB(1), single slope→SSCB(2)-25(HOU); 514 by type (TY1 SSCB assumed); ' +
        '529→CCCG; 531 curb ramps→PED-18; 540 W-beam/long span/thrie trans→GF(31) (assumed), DAT, SRG TL-2/3; 550 chain link→CLF-25(HOU); ' +
        '610→RID set; 618→ED(1); 620→ED(3); 624→ED(4)/ED(12); 628→ED set; 644→SMD set; 647→SMD(2); 658→D&OM; 662 short term→WZ(STPM); ' +
        '666→PM set; 672→PM(2)/RRPM; 682 backplate→TS-BP; 688 loop→LD. UI falls back to Item spec PDF when no sheet. ' +
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
