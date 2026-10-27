/*
 * "Possibly unbalanced" bid flags — the ONE place the rules and thresholds live.
 * Flags are information only: flagged bids stay in every statistic and in the
 * suggested price. Computed in scripts/build-data.js and stored per observation:
 *   obs[9]  = flag bitmask (0 = not flagged)
 *   obs[10] = paired item's low-bid price on the same job (pair rule), else null
 */
(function (root) {
  'use strict';
  const RULES = {
    PAIR: 1,        // (a) install/remove pair priced out of line
    VS_OTHERS: 2,   // (b) low bid far from the other bidders on the same job
    PLACEHOLDER: 4  // (c) placeholder-style price ($0.01, or ~$1 on an item that normally costs far more)
  };
  const T = {
    // (a) pairs: same project, same spec item, same description once the
    // install/remove words are stripped (e.g. 5002-7001 INSTALL FTB / 5002-7002 REMOVE FTB,
    // 506-7039 TEMP SEDMT CONT FENCE (INSTALL) / 506-7041 ... (REMOVE)).
    PAIR_RATIO_FACTOR: 3,        // remove/install ratio > 3x or < 1/3 of the pair-type median ratio
    PAIR_COMBINED_LO: 0.5,       // ... while install+remove is within 0.5x–2x of the pair-type
    PAIR_COMBINED_HI: 2,         //     median combined price (i.e. money moved between the halves)
    PAIR_MIN_JOBS: 3,            // need >= 3 jobs of the pair type for medians; otherwise only
                                 // the "remove >= install" test applies
    // (b) vs other bidders: median of the OTHER bids (rank >= 2) on the same job/code/qty.
    VS_OTHERS_LO: 0.25,          // low bid < 25% of the others' average
    VS_OTHERS_HI: 2.5,           // low bid > 250% of the others' average
    VS_OTHERS_MIN_OTHERS: 2,     // need >= 2 other bids
    // (c) placeholder prices
    PLACEHOLDER_MAX: 0.01,       // $0.01 or less always
    NEAR_ONE_MAX: 1.0,           // $1.00 or less ...
    NEAR_ONE_REL: 0.05           // ... when it is <= 5% of the code's statewide median low bid
  };
  const LABELS = {
    1: 'install/remove pair out of line',
    2: 'far from the other bidders on the job',
    3: '',
    4: 'placeholder-style price'
  };

  const INSTALL_RE = /\b(INSTALL|INSTL|INST|FURNISH AND INSTALL|FURN ?& ?INST|F&I|FURNISH)\b/;
  const REMOVE_RE = /\b(REMOVE|REMOV|REMOVAL|RMV)\b/;
  function pairRole(desc) {
    const d = String(desc || '').toUpperCase();
    const rem = REMOVE_RE.test(d), ins = INSTALL_RE.test(d);
    if (rem && !ins) return 'remove';
    if (ins && !rem) return 'install';
    return null;
  }
  function pairStem(desc) {
    return String(desc || '').toUpperCase()
      .replace(/FURNISH AND INSTALL|FURN ?& ?INST|F&I/g, ' ')
      .replace(/\b(INSTALL|INSTL|INST|FURNISH|REMOVE|REMOV|REMOVAL|RMV)\b/g, ' ')
      .replace(/\(\s*\)/g, ' ').replace(/[^A-Z0-9"]+/g, ' ').trim();
  }
  function med(a) {
    if (!a.length) return null;
    const s = a.slice().sort(function (x, y) { return x - y; });
    const h = (s.length - 1) / 2;
    return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2;
  }

  /**
   * rows: [{ key, project, code, desc, qty, price, othersMedian, othersN, codeMedian }]
   * returns Map key -> { flags, partner, why:[...] }
   */
  function computeFlags(rows) {
    const out = new Map();
    const add = function (r, bit, why, partner) {
      let f = out.get(r.key);
      if (!f) { f = { flags: 0, partner: null, why: [] }; out.set(r.key, f); }
      f.flags |= bit; f.why.push(why);
      if (partner != null) f.partner = partner;
    };
    // (b) and (c): per row
    rows.forEach(function (r) {
      if (r.othersN >= T.VS_OTHERS_MIN_OTHERS && r.othersMedian > 0) {
        const ratio = r.price / r.othersMedian;
        if (ratio < T.VS_OTHERS_LO || ratio > T.VS_OTHERS_HI) add(r, RULES.VS_OTHERS, 'low bid ' + Math.round(ratio * 100) + '% of the other bidders\' median', null);
      }
      if (r.price <= T.PLACEHOLDER_MAX || (r.price <= T.NEAR_ONE_MAX && r.codeMedian > 0 && r.price <= T.NEAR_ONE_REL * r.codeMedian)) {
        add(r, RULES.PLACEHOLDER, 'placeholder-style price', null);
      }
    });
    // (a) pairs: group by project + item + stem
    const groups = new Map();
    rows.forEach(function (r) {
      const role = pairRole(r.desc);
      if (!role) return;
      const item = String(r.code).split('-')[0];
      const g = r.project + '|' + item + '|' + pairStem(r.desc);
      if (!groups.has(g)) groups.set(g, { install: [], remove: [] });
      groups.get(g)[role].push(r);
    });
    const jobs = [];
    groups.forEach(function (g) {
      if (g.install.length !== 1 || g.remove.length !== 1) return; // only clean 1:1 pairs
      const i = g.install[0], m = g.remove[0];
      jobs.push({ type: i.code + '|' + m.code, i: i, m: m, ratio: m.price / i.price, combined: i.price + m.price });
    });
    const byType = new Map();
    jobs.forEach(function (j) { if (!byType.has(j.type)) byType.set(j.type, []); byType.get(j.type).push(j); });
    const pairTypes = {};
    byType.forEach(function (list, type) {
      const n = list.length;
      const mr = n >= T.PAIR_MIN_JOBS ? med(list.map(function (j) { return j.ratio; })) : null;
      const mc = n >= T.PAIR_MIN_JOBS ? med(list.map(function (j) { return j.combined; })) : null;
      pairTypes[type] = { n: n, median_ratio: mr, median_combined: mc };
      list.forEach(function (j) {
        const near = mc == null || (j.combined >= T.PAIR_COMBINED_LO * mc && j.combined <= T.PAIR_COMBINED_HI * mc);
        const removeHigh = j.m.price >= j.i.price;
        const ratioOff = mr != null && (j.ratio > T.PAIR_RATIO_FACTOR * mr || j.ratio < mr / T.PAIR_RATIO_FACTOR);
        if (near && (removeHigh || ratioOff)) {
          const why = removeHigh ? 'remove priced ' + (j.m.price === j.i.price ? 'equal to' : 'above') + ' install'
            : 'remove/install ratio ' + j.ratio.toFixed(2) + ' vs typical ' + mr.toFixed(2);
          add(j.i, RULES.PAIR, why, j.m.price);
          add(j.m, RULES.PAIR, why, j.i.price);
        }
      });
    });
    return { flags: out, pairTypes: pairTypes };
  }

  function describe(bits) {
    const out = [];
    [1, 2, 4].forEach(function (b) { if (bits & b) out.push(LABELS[b]); });
    return out;
  }

  const api = { RULES: RULES, T: T, pairRole: pairRole, pairStem: pairStem, computeFlags: computeFlags, describe: describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BidFlags = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
