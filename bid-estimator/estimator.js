/*
 * Bid Price Estimator — pure statistics + estimation logic.
 * Used by the browser (window.BidEstimator) and by node (build + tests).
 *
 * Observation tuple (one low-bid row, as stored in data/items/<item>.json):
 *   [qty, lowBidUnitPrice, engEstUnit|null, letDate 'YYYY-MM-DD', countyIdx,
 *    districtIdx, projectIdx (into shard.pids), nBidders|null, avgAllBids|null,
 *    flagBits (flags.js; 0 = not flagged), pairedItemPrice|null]
 */
(function (root) {
  'use strict';
  const O = { Q: 0, P: 1, EE: 2, DATE: 3, CTY: 4, DIST: 5, PID: 6, NB: 7, AVG: 8, FLAG: 9, PARTNER: 10 };

  // Method constants (stated on the page; change here only).
  const METHOD = {
    MIN_HOUSTON_N: 5,          // use Houston only with >= 5 low bids
    NEAR_FACTOR: 3,            // "similar size" = within 3x of entered qty
    MIN_NEIGHBORS: 5,          // widen to the nearest 5 when fewer
    SIG_MIN_N: 8,              // regression trusted only with n >= 8 ...
    SIG_P: 0.1,                // ... and p < 0.1
    MAX_DISCOUNT: 0.25,        // quantity adjustment never lowers price > 25% below base
    MAX_PREMIUM: 0.25,         // ... nor raises it > 25% (and never above p90)
    EXTRAP_FACTOR: 2,          // beyond 2x max (or below min/2) = extrapolated
    EXTRAP_WIDEN: 0.15,        // widen the range 15% each way when extrapolating
    SHRINK_K: 10               // grouped slope: a level's own slope counts like n bids vs 10 "prior" bids from the level above
  };

  /** Within-group log-log sums (demeaned per code) for pooled slopes: returns {sxx, sxy, n}. */
  function slopeSums(obs) {
    const pts = obs.filter(function (o) { return o[0] > 0 && o[1] > 0; });
    if (pts.length < 3) return { sxx: 0, sxy: 0, n: 0 };
    const xs = pts.map(function (o) { return Math.log10(o[0]); }), ys = pts.map(function (o) { return Math.log10(o[1]); });
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, sxy = 0;
    for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) * (xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
    return { sxx: sxx, sxy: sxy, n: pts.length };
  }
  /** Shrink a level's slope toward the level above: (n*b + K*prior)/(n + K). */
  function shrink(b, n, prior, k) {
    if (b == null || !(n > 0)) return prior;
    return (n * b + k * prior) / (n + k);
  }

  function num(x) { return x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x); }

  function quantile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    const h = (sorted.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
  }
  function sortNum(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function median(a) { return quantile(sortNum(a), 0.5); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

  // Regularized incomplete beta (Numerical Recipes betacf) for Student t p-values.
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  /** Two-sided p-value for t with df degrees of freedom. */
  function tPValue(t, df) {
    if (!(df > 0) || !Number.isFinite(t)) return t === Infinity || t === -Infinity ? 0 : null;
    return ibeta(df / 2, 0.5, df / (df + t * t));
  }

  /** Ordinary least squares y = a + b x with slope t-test. */
  function linreg(xs, ys) {
    const n = xs.length;
    if (n < 3) return { n: n, slope: null, intercept: null, r2: null, p: null };
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (xs[i] - mx) * (xs[i] - mx);
      sxy += (xs[i] - mx) * (ys[i] - my);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    if (sxx === 0) return { n: n, slope: null, intercept: null, r2: null, p: null };
    const slope = sxy / sxx, intercept = my - slope * mx;
    const sse = Math.max(0, syy - slope * sxy);
    const r2 = syy > 0 ? 1 - sse / syy : 0;
    const se = Math.sqrt(sse / (n - 2) / sxx);
    const t = se > 0 ? slope / se : (slope === 0 ? 0 : Infinity);
    return { n: n, slope: slope, intercept: intercept, r2: r2, p: tPValue(t, n - 2) };
  }

  /** log10(price) vs log10(qty) regression; significant only with n>=8 and p<0.1. */
  function logLogFit(obs) {
    const pts = obs.filter(function (o) { return o[O.Q] > 0 && o[O.P] > 0; });
    const r = linreg(pts.map(function (o) { return Math.log10(o[O.Q]); }),
      pts.map(function (o) { return Math.log10(o[O.P]); }));
    r.significant = r.slope != null && r.n >= METHOD.SIG_MIN_N && r.p != null && r.p < METHOD.SIG_P;
    return r;
  }

  function yearFrac(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 + (Number(m[3]) - 1) / 365 : null;
  }

  /** Far-outlier flags on log price (Tukey 3xIQR fence). */
  function outlierFence(prices) {
    const lp = sortNum(prices.filter(function (p) { return p > 0; }).map(Math.log10));
    if (lp.length < 5) return null;
    const q1 = quantile(lp, 0.25), q3 = quantile(lp, 0.75), iqr = q3 - q1;
    return { lo: Math.pow(10, q1 - 3 * iqr), hi: Math.pow(10, q3 + 3 * iqr) };
  }
  function isOutlier(fence, p) { return !!fence && (p < fence.lo || p > fence.hi); }

  function r4(x) {
    if (x == null || !Number.isFinite(x)) return null;
    const a = Math.abs(x);
    const d = a >= 100 ? 2 : a >= 1 ? 3 : 4;
    return Number(x.toFixed(d));
  }

  /** Per-scope statistics stored in the data shard (also recomputable here). */
  function summarize(obs) {
    if (!obs.length) return null;
    const prices = sortNum(obs.map(function (o) { return o[O.P]; }));
    const qtys = sortNum(obs.map(function (o) { return o[O.Q]; }));
    const totalQty = qtys.reduce(function (s, x) { return s + x; }, 0);
    const wsum = obs.reduce(function (s, o) { return s + o[O.Q] * o[O.P]; }, 0);
    const pids = {};
    obs.forEach(function (o) { pids[o[O.PID]] = 1; });
    const q33 = quantile(qtys, 1 / 3), q67 = quantile(qtys, 2 / 3);
    const band = function (f) {
      const ps = obs.filter(f).map(function (o) { return o[O.P]; });
      return { n: ps.length, median: r4(median(ps)) };
    };
    const ee = obs.filter(function (o) { return o[O.EE] > 0; });
    const fit = logLogFit(obs);
    const fence = outlierFence(prices);
    const dated = obs.filter(function (o) { return yearFrac(o[O.DATE]) != null && o[O.P] > 0; });
    let trend = null;
    if (dated.length >= 8) {
      const tr = linreg(dated.map(function (o) { return yearFrac(o[O.DATE]); }),
        dated.map(function (o) { return Math.log10(o[O.P]); }));
      if (tr.slope != null) {
        trend = { pct_per_year: r4((Math.pow(10, tr.slope) - 1) * 100), p: r4(tr.p), n: tr.n,
          significant: tr.p != null && tr.p < METHOD.SIG_P && tr.n >= METHOD.SIG_MIN_N };
      }
    }
    const dates = obs.map(function (o) { return o[O.DATE]; }).filter(Boolean).sort();
    return {
      n: obs.length,
      n_projects: Object.keys(pids).length,
      total_qty: r4(totalQty),
      min: r4(prices[0]), p10: r4(quantile(prices, 0.1)), p25: r4(quantile(prices, 0.25)),
      median: r4(quantile(prices, 0.5)), p75: r4(quantile(prices, 0.75)), p90: r4(quantile(prices, 0.9)),
      max: r4(prices[prices.length - 1]),
      mean: r4(mean(prices)),
      wmean: totalQty > 0 ? r4(wsum / totalQty) : null,
      qty_min: r4(qtys[0]), qty_median: r4(quantile(qtys, 0.5)), qty_max: r4(qtys[qtys.length - 1]),
      bands: {
        small_max_qty: r4(q33), large_min_qty: r4(q67),
        small: band(function (o) { return o[O.Q] <= q33; }),
        medium: band(function (o) { return o[O.Q] > q33 && o[O.Q] <= q67; }),
        large: band(function (o) { return o[O.Q] > q67; })
      },
      ee_n: ee.length,
      ee_median: r4(median(ee.map(function (o) { return o[O.EE]; }))),
      low_to_ee_median: r4(median(ee.map(function (o) { return o[O.P] / o[O.EE]; }))),
      regression: {
        slope: r4(fit.slope), intercept: r4(fit.intercept), r2: r4(fit.r2), p: r4(fit.p), n: fit.n,
        significant: fit.significant
      },
      trend: trend,
      flagged: obs.filter(function (o) { return o[O.FLAG] > 0; }).length,
      outliers: fence ? obs.filter(function (o) { return isOutlier(fence, o[O.P]); }).length : 0,
      date_min: dates[0] || null, date_max: dates[dates.length - 1] || null
    };
  }

  function isHouston(o, districts) { return districts[o[O.DIST]] === 'Houston'; }

  /** Pick similar-size bids: within NEAR_FACTOR of qty, else the nearest MIN_NEIGHBORS. */
  function neighbors(obs, qty) {
    const within = obs.filter(function (o) {
      return o[O.Q] >= qty / METHOD.NEAR_FACTOR && o[O.Q] <= qty * METHOD.NEAR_FACTOR;
    });
    if (within.length >= METHOD.MIN_NEIGHBORS || within.length === obs.length) {
      return { rows: within, how: 'within ' + METHOD.NEAR_FACTOR + 'x of your quantity' };
    }
    const lq = Math.log(qty);
    const near = obs.slice().sort(function (a, b) {
      return Math.abs(Math.log(a[O.Q]) - lq) - Math.abs(Math.log(b[O.Q]) - lq);
    }).slice(0, Math.min(obs.length, METHOD.MIN_NEIGHBORS));
    return { rows: near, how: 'closest in size (fewer than ' + METHOD.MIN_NEIGHBORS + ' were within ' + METHOD.NEAR_FACTOR + 'x of your quantity)' };
  }

  /** Plain words for where a grouped slope came from (weights are the shrinkage shares). */
  function slopeWords(g) {
    const k = METHOD.SHRINK_K;
    const wc = g.code_n > 0 && g.code != null ? g.code_n / (g.code_n + k) : 0;
    const wf = (1 - wc) * (g.family_n > 0 && g.family != null ? g.family_n / (g.family_n + k) : 0);
    const wg = 1 - wc - wf;
    const parts = [];
    parts.push(Math.round(wc * 100) + '% this code (' + (g.code == null ? 'no fit' : g.code.toFixed(3) + ', n=' + g.code_n) + ')');
    parts.push(Math.round(wf * 100) + '% Item ' + g.family_key + ' family (' + (g.family == null ? 'no fit' : g.family.toFixed(3) + ', n=' + g.family_n) + ')');
    parts.push(Math.round(wg * 100) + '% all TxDOT items (' + g.global.toFixed(3) + ')');
    const lead = wc >= wf && wc >= wg ? 'mostly this code' : wf >= wg ? 'mostly the Item ' + g.family_key + ' family' : 'mostly all TxDOT items (assumed)';
    return lead + ': ' + parts.join(', ');
  }

  function fmtMoney(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtQty(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 });
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function roundPrice(x) {
    if (x == null || !Number.isFinite(x)) return null;
    if (x >= 1000) return Math.round(x / 10) * 10;
    if (x >= 100) return Math.round(x);
    if (x >= 10) return Math.round(x * 2) / 2;
    return Math.round(x * 100) / 100;
  }

  /**
   * Main estimate.
   * entry: { code, desc, unit, units?:[], obs:[...], stats?:{houston,statewide} }
   * ctx:   { districts:[], counties:[], pooled_slope:{slope,n,...}, data_date_max }
   * opts:  { scope:'auto'|'houston'|'statewide' }
   */
  function estimate(entry, qtyIn, ctx, opts) {
    opts = opts || {};
    ctx = ctx || {};
    const qty = num(qtyIn);
    const districts = ctx.districts || [];
    const counties = ctx.counties || [];
    const unit = entry.unit || '';
    const warnings = [];
    const comments = [];
    const all = (entry.obs || []).filter(function (o) { return o[O.Q] > 0 && o[O.P] > 0; });
    const hou = all.filter(function (o) { return isHouston(o, districts); });
    if (!all.length) return { ok: false, reason: 'No low-bid prices on record for ' + entry.code + '.' };
    if (!(qty > 0)) return { ok: false, reason: 'Enter a quantity greater than zero.' };

    let scope = 'statewide';
    const want = opts.scope || 'auto';
    if (want === 'houston') {
      if (hou.length) scope = 'houston';
      else warnings.push('No Houston District bids for this code, so statewide bids are used.');
      if (hou.length && hou.length < METHOD.MIN_HOUSTON_N) warnings.push('Only ' + hou.length + ' Houston bid' + (hou.length === 1 ? '' : 's') + ' — you forced Houston; treat as a very small sample.');
    } else if (want === 'auto') {
      scope = hou.length >= METHOD.MIN_HOUSTON_N ? 'houston' : 'statewide';
    }
    const obs = scope === 'houston' ? hou : all;
    const scopeLabel = scope === 'houston' ? 'Houston District' : 'statewide';
    const st = summarize(obs);
    const fence = outlierFence(obs.map(function (o) { return o[O.P]; }));
    const clean = obs.filter(function (o) { return !isOutlier(fence, o[O.P]); });
    const nOut = obs.length - clean.length;
    const prices = sortNum(clean.map(function (o) { return o[O.P]; }));
    const p10 = quantile(prices, 0.1), p25 = quantile(prices, 0.25), p50 = quantile(prices, 0.5),
      p75 = quantile(prices, 0.75), p90 = quantile(prices, 0.9);

    // 1. Base: median low bid of similar-size jobs.
    const nb = neighbors(clean, qty);
    const nbPrices = nb.rows.map(function (o) { return o[O.P]; });
    const base = median(nbPrices);
    const anchorQty = median(nb.rows.map(function (o) { return o[O.Q]; }));

    // 2. Quantity coverage.
    const qmin = st.qty_min, qmax = st.qty_max;
    const above = qty > qmax * METHOD.EXTRAP_FACTOR;
    const below = qty < qmin / METHOD.EXTRAP_FACTOR;
    const extrapolated = above || below;
    const outside = qty > qmax || qty < qmin;

    // 3. Quantity adjustment from anchorQty to qty.
    const fit = logLogFit(clean);
    let slope = null, slopeSource = null, adj = base, capped = null, wrongWay = false;
    // Grouped (shrinkage) slope from the data build: code slope shrunk toward its
    // Item-family+unit slope, which is shrunk toward the all-items slope.
    const g = entry.slope || null;
    if (g && g.final != null) {
      slope = g.final; slopeSource = 'grouped';
      // Beyond the data, never extrapolate a slope that says bigger jobs cost more (or smaller jobs less).
      if (outside && slope > 0) { wrongWay = true; slope = g.family != null && g.family <= 0 ? g.family : Math.min(0, g.global); slopeSource = g.family != null && g.family <= 0 ? 'family' : 'global'; }
    } else if (fit.significant) { slope = fit.slope; slopeSource = 'this code'; }
    else if (outside && ctx.pooled_slope && ctx.pooled_slope.slope != null) { slope = ctx.pooled_slope.slope; slopeSource = 'pooled'; }
    if (slope != null && anchorQty > 0) {
      const raw = base * Math.pow(qty / anchorQty, slope);
      adj = raw;
      const lo = base * (1 - METHOD.MAX_DISCOUNT), hi = Math.min(base * (1 + METHOD.MAX_PREMIUM), p90);
      if (adj < lo) { adj = lo; capped = 'discount'; }
      if (adj > Math.max(hi, base)) { adj = Math.max(hi, base); capped = 'premium'; }
      // Interpolating inside the data: never below p10.
      if (!outside && adj < p10) { adj = p10; capped = 'p10'; }
    }
    if (adj > p90 && adj > base) { adj = Math.max(base, p90); capped = capped || 'p90'; }
    const mid = roundPrice(adj);

    // 4. Range from the scope's spread around its median.
    const r25 = p50 > 0 ? p25 / p50 : 1, r75 = p50 > 0 ? p75 / p50 : 1;
    let low = adj * Math.min(1, r25), high = adj * Math.max(1, r75);
    if (extrapolated) { low *= 1 - METHOD.EXTRAP_WIDEN; high *= 1 + METHOD.EXTRAP_WIDEN; }
    // Fewer than 5 bids: the spread itself is unknown, so use at least -40% / +50%.
    if (st.n < 5) { low = Math.min(low, adj * 0.6); high = Math.max(high, adj * 1.5); }
    low = roundPrice(Math.min(low, mid)); high = roundPrice(Math.max(high, mid));

    // 5. Confidence.
    const iqrRel = p50 > 0 ? (p75 - p25) / p50 : 9;
    const dataMax = ctx.data_date_max || st.date_max;
    const lastDate = st.date_max;
    const recent = lastDate && dataMax ? (yearFrac(dataMax) - yearFrac(lastDate)) <= 1 : false;
    const pts = { n: st.n >= 20 ? 2 : st.n >= 8 ? 1 : 0,
      coverage: !outside ? 2 : !extrapolated ? 1 : 0,
      spread: iqrRel < 0.5 ? 2 : iqrRel < 1 ? 1 : 0,
      recency: recent ? 1 : 0 };
    const score = pts.n + pts.coverage + pts.spread + pts.recency;
    let confidence = score >= 6 ? 'High' : score >= 3 ? 'Medium' : 'Low';
    if (extrapolated || st.n < 3) confidence = 'Low';
    else if (st.n < 8 && confidence === 'High') confidence = 'Medium';

    // Context numbers.
    const years = (st.date_min || '').slice(0, 4) + (st.date_max && st.date_max.slice(0, 4) !== st.date_min.slice(0, 4) ? '–' + st.date_max.slice(0, 4) : '');
    const big = obs.slice().sort(function (a, b) { return b[O.Q] - a[O.Q] || a[O.P] - b[O.P]; })[0];
    const bigCounty = counties[big[O.CTY]] || null;
    const houMed = hou.length ? median(hou.map(function (o) { return o[O.P]; })) : null;
    const swMed = median(all.map(function (o) { return o[O.P]; }));
    const ees = obs.filter(function (o) { return o[O.EE] > 0; });
    const eeMed = ees.length ? median(ees.map(function (o) { return o[O.EE]; })) : null;
    const lowToEe = ees.length ? median(ees.map(function (o) { return o[O.P] / o[O.EE]; })) : null;

    // Possibly-unbalanced flags: information only — never removed or down-weighted.
    const flagged = obs.filter(function (o) { return o[O.FLAG] > 0; });
    const unflaggedP = sortNum(obs.filter(function (o) { return !(o[O.FLAG] > 0); }).map(function (o) { return o[O.P]; }));
    const allP = sortNum(obs.map(function (o) { return o[O.P]; }));
    const flagStats = {
      n: flagged.length,
      with: { n: allP.length, median: quantile(allP, 0.5), p25: quantile(allP, 0.25), p75: quantile(allP, 0.75), min: allP[0], max: allP[allP.length - 1] },
      without: unflaggedP.length ? { n: unflaggedP.length, median: quantile(unflaggedP, 0.5), p25: quantile(unflaggedP, 0.25), p75: quantile(unflaggedP, 0.75), min: unflaggedP[0], max: unflaggedP[unflaggedP.length - 1] } : null
    };
    const nbFlagged = nb.rows.filter(function (o) { return o[O.FLAG] > 0; }).length;

    // Comments (plain language, real numbers only).
    comments.push('Where it comes from: ' + st.n + ' low bid' + (st.n === 1 ? '' : 's') + ' on ' + st.n_projects + ' project' + (st.n_projects === 1 ? '' : 's') + ' (' + scopeLabel + '), let ' + (st.date_min === st.date_max ? st.date_min : st.date_min + ' to ' + st.date_max) + '. The base is the median low bid of the ' + nb.rows.length + ' job' + (nb.rows.length === 1 ? '' : 's') + ' ' + nb.how + ': ' + fmtMoney(base) + '/' + unit + (nb.rows.length > 1 ? ' (sizes ' + fmtQty(Math.min.apply(null, nb.rows.map(function (o) { return o[O.Q]; }))) + '–' + fmtQty(Math.max.apply(null, nb.rows.map(function (o) { return o[O.Q]; }))) + ' ' + unit + ')' : '') + '.');
    if (st.n > 1) {
      comments.push('Spread: half of the low bids fall between ' + fmtMoney(p25) + ' and ' + fmtMoney(p75) + ' (median ' + fmtMoney(p50) + '; full range ' + fmtMoney(st.min) + '–' + fmtMoney(st.max) + '). ' +
        (iqrRel < 0.5 ? 'That is a fairly tight spread.' : iqrRel < 1 ? 'That is a moderate spread.' : 'That is a wide spread — prices vary a lot job to job.'));
    }
    const b = st.bands;
    if (fit.slope != null) {
      const per = Math.pow(10, fit.slope) - 1; // price change per 10x quantity
      const bandTxt = b.small.n && b.large.n ? ' Small jobs (≤' + fmtQty(b.small_max_qty) + ' ' + unit + ') median ' + fmtMoney(b.small.median) + ' vs large jobs (>' + fmtQty(b.large_min_qty) + ' ' + unit + ') median ' + fmtMoney(b.large.median) + '.' : '';
      comments.push('Bigger jobs vs price: ' + (fit.significant
        ? 'yes — prices change about ' + pct(per) + ' for each 10x in quantity (log-log fit, n=' + fit.n + ', R²=' + fit.r2.toFixed(2) + ', p=' + fit.p.toFixed(3) + ').'
        : 'no clear pattern in this data (log-log fit n=' + fit.n + ', R²=' + (fit.r2 == null ? '—' : fit.r2.toFixed(2)) + ', p=' + (fit.p == null ? '—' : fit.p.toFixed(2)) + ' — not significant).') + bandTxt);
    } else {
      comments.push('Bigger jobs vs price: too few bids (' + st.n + ') to test.');
    }
    let where;
    if (qty > qmax) where = 'Your ' + fmtQty(qty) + ' ' + unit + ' is ' + (qty / qmax).toFixed(qty / qmax >= 10 ? 0 : 1) + 'x the largest job on record (' + fmtQty(qmax) + ' ' + unit + ').';
    else if (qty < qmin) where = 'Your ' + fmtQty(qty) + ' ' + unit + ' is smaller than any job on record (smallest ' + fmtQty(qmin) + ' ' + unit + ').';
    else {
      const below = obs.filter(function (o) { return o[O.Q] <= qty; }).length;
      where = 'Your ' + fmtQty(qty) + ' ' + unit + ' is inside the range on record (' + fmtQty(qmin) + '–' + fmtQty(qmax) + ' ' + unit + '); ' + pct(below / obs.length) + ' of jobs were this size or smaller.';
    }
    comments.push('Your quantity: ' + where);
    if (slope != null && Math.abs(adj - base) > 1e-9) {
      comments.push('Quantity adjustment: ' + fmtMoney(base) + ' at a typical ' + fmtQty(anchorQty) + ' ' + unit + ' → ' + fmtMoney(adj) + ' at ' + fmtQty(qty) + ' ' + unit + ' using ' +
        (slopeSource === 'grouped' ? 'a grouped price-vs-quantity slope of ' + slope.toFixed(3) + ' — ' + slopeWords(g) :
         slopeSource === 'family' || slopeSource === 'global' ? 'the ' + (slopeSource === 'family' ? 'Item ' + g.family_key + ' family' : 'all-items') + ' slope ' + slope.toFixed(3) + ' (assumed), because the grouped slope for this code points the wrong way for extrapolation (+' + g.final.toFixed(3) + ')' :
         slopeSource === 'this code' ? 'this code\'s own price-vs-quantity fit (slope ' + fit.slope.toFixed(3) + ')'
          : 'the typical TxDOT price-vs-quantity slope ' + ctx.pooled_slope.slope.toFixed(3) + ' (assumed; median of ' + ctx.pooled_slope.n + ' codes with a significant fit), because ' + (wrongWay ? 'this code\'s own fit points the wrong way for extrapolation (price rising with size, likely driven by a few jobs)' : 'this code has no significant fit of its own')) +
        (capped === 'discount' ? '; the discount is capped at ' + pct(METHOD.MAX_DISCOUNT) + ' below the base' : capped === 'premium' ? '; the increase is capped at ' + pct(METHOD.MAX_PREMIUM) + ' and the 90th percentile' : capped === 'p10' ? '; held at the 10th percentile floor' : capped === 'p90' ? '; held at the 90th percentile' : '') + '.');
    } else if (outside && slope == null) {
      comments.push('Quantity adjustment: none — no price-vs-quantity slope available, so the base is used as is.');
    }
    if (houMed != null && scope === 'statewide') {
      comments.push('Houston vs statewide: Houston has ' + hou.length + ' low bid' + (hou.length === 1 ? '' : 's') + ' (median ' + fmtMoney(houMed) + ') vs statewide median ' + fmtMoney(swMed) + (hou.length < METHOD.MIN_HOUSTON_N ? '; too few to use on their own.' : '.'));
    } else if (houMed != null) {
      comments.push('Houston vs statewide: Houston median ' + fmtMoney(houMed) + ' vs statewide ' + fmtMoney(swMed) + ' (' + (houMed >= swMed ? '+' : '') + pct(houMed / swMed - 1) + ').');
    } else {
      comments.push('Houston vs statewide: no Houston District bids for this code.');
    }
    if (eeMed != null) {
      comments.push('Engineer\'s estimate: median ' + fmtMoney(eeMed) + '/' + unit + ' on ' + ees.length + ' job' + (ees.length === 1 ? '' : 's') + '; the low bid was a median ' + pct(lowToEe) + ' of the estimate.');
    }
    const allb = obs.filter(function (o) { return o[O.NB] > 1 && o[O.AVG] > 0; });
    if (allb.length) {
      const nbids = allb.reduce(function (s, o) { return s + o[O.NB]; }, 0);
      comments.push('All bidders: ' + nbids + ' bids on ' + allb.length + ' of these jobs; the average of all bids was a median ' + pct(median(allb.map(function (o) { return o[O.AVG] / o[O.P]; }))) + ' of the low bid.');
    }
    if (st.trend && st.trend.significant) comments.push('Trend: low bids moved about ' + st.trend.pct_per_year + '% per year over ' + years + ' (p=' + st.trend.p + ').');

    if (flagged.length) {
      const pr = entry.pair && entry.pair.codes ? entry.pair : null;
      const isInstall = pr && pr.codes[0] === entry.code;
      const describeOne = function (o) {
        const bits = o[O.FLAG];
        const why = [];
        if (bits & 1 && o[O.PARTNER] != null && pr) {
          const ins = isInstall ? o[O.P] : o[O.PARTNER], rem = isInstall ? o[O.PARTNER] : o[O.P];
          why.push((rem >= ins ? 'remove priced ' + (rem === ins ? 'equal to' : 'above') + ' install' : 'remove/install ratio ' + (rem / ins).toFixed(2) + (pr.median_ratio != null ? ' vs typical ' + pr.median_ratio.toFixed(2) : '')) +
            '; combined ' + fmtMoney(ins + rem) + '/' + unit + (pr.median_combined != null ? ' vs typical ' + fmtMoney(pr.median_combined) + '/' + unit : ''));
          return { lead: 'low bid of ' + fmtMoney(ins) + ' install / ' + fmtMoney(rem) + ' remove', why: why };
        }
        if (bits & 2) why.push('far from the other bidders on that job');
        if (bits & 4) why.push('placeholder-style price');
        return { lead: 'low bid of ' + fmtMoney(o[O.P]) + '/' + unit, why: why };
      };
      const lead = flagged.slice().sort(function (a, b) { return b[O.Q] - a[O.Q]; })[0];
      const d = describeOne(lead);
      comments.push('Possibly unbalanced: ' + flagged.length + ' of ' + obs.length + ' low bids flagged. ' +
        (lead === big ? 'The largest job' : 'The largest flagged job') + ' (' + fmtQty(lead[O.Q]) + ' ' + unit + ') ' + d.lead + ' looks unbalanced (' + d.why.join('; ') + '); kept in the statistics but flagged. ' +
        'Median with flagged bids ' + fmtMoney(flagStats.with.median) + (flagStats.without ? ', without ' + fmtMoney(flagStats.without.median) : '') + ' (information only; the suggested price uses all bids).');
      if (nbFlagged) warnings.push(nbFlagged + ' of the ' + nb.rows.length + ' similar-size bids used for the base price ' + (nbFlagged === 1 ? 'is' : 'are') + ' flagged as possibly unbalanced (kept, not removed).');
    }
    if (st.n < 5) warnings.push('Small sample: only ' + st.n + ' low bid' + (st.n === 1 ? '' : 's') + '. Range set to at least −40% / +50% because the spread cannot be measured.');
    if (extrapolated) warnings.push('Extrapolated beyond data: your quantity is more than ' + METHOD.EXTRAP_FACTOR + 'x outside the sizes on record. Range widened ' + pct(METHOD.EXTRAP_WIDEN) + ' each way; confidence set to Low.');
    else if (outside) warnings.push('Slightly outside the sizes on record (within ' + METHOD.EXTRAP_FACTOR + 'x).');
    if (nOut) warnings.push(nOut + ' outlier bid' + (nOut === 1 ? '' : 's') + ' (beyond 3x IQR on a log scale) left out of the base and range.');
    if (entry.units && entry.units.length > 1) warnings.push('Unit mismatch: this code was bid in more than one unit (' + entry.units.join(', ') + '); prices assume ' + unit + '.');
    if (slopeSource === 'pooled' || slopeSource === 'global') warnings.push('Quantity discount is assumed from other TxDOT items, not measured for this code.');
    if (slopeSource === 'grouped' && g && (g.code_n || 0) < METHOD.SHRINK_K && outside) warnings.push('Quantity discount mostly borrowed from related items (shrinkage), not measured for this code alone.');

    // Backup sentence.
    const allBig = big[O.NB] > 1 && big[O.AVG] > 0;
    const sentence = 'Unit price based on ' + years + ' TxDOT bid tabulations (low bidder) for bid code ' + entry.code + ' ' + (entry.desc || '') + ' (' + st.n_projects + ' project' + (st.n_projects === 1 ? '' : 's') + ' ' + scopeLabel + '), where the largest job (' + fmtQty(big[O.Q]) + ' ' + unit + (bigCounty ? ', ' + bigCounty + ' County' : '') + ') had a low bid of ' + fmtMoney(big[O.P]) + '/' + unit + (big[O.FLAG] > 0 ? ' (flagged as possibly unbalanced)' : '') +
      (allBig ? ' and an average of ' + fmtMoney(big[O.AVG]) + '/' + unit + ' across ' + big[O.NB] + ' bids' : '') +
      '; ' + fmtMoney(mid) + '/' + unit + ' used for ' + fmtQty(qty) + ' ' + unit +
      (slope != null && Math.abs(adj - base) > 1e-9 ? ' after a ' + (adj < base ? 'quantity discount' : 'small-quantity premium') + (slopeSource === 'pooled' || slopeSource === 'global' || (slopeSource === 'grouped' && g && (g.code_n || 0) < METHOD.SHRINK_K) ? ' (assumed)' : '') + (capped === 'discount' ? ' capped at ' + pct(METHOD.MAX_DISCOUNT) : '') : '') +
      (extrapolated ? ', extrapolated beyond the data' : '') + ' (' + confidence.toLowerCase() + ' confidence; range ' + fmtMoney(low) + '–' + fmtMoney(high) + ').';

    return {
      ok: true, code: entry.code, desc: entry.desc, unit: unit, qty: qty,
      scope: scope, scopeLabel: scopeLabel,
      base: base, anchorQty: anchorQty, adjusted: adj,
      low: low, mid: mid, high: high,
      total: { low: low * qty, mid: mid * qty, high: high * qty },
      confidence: confidence, score: pts,
      extrapolated: extrapolated, outside: outside, capped: capped,
      slope: slope, slopeSource: slopeSource, fit: fit,
      neighbors: nb.rows.length, outliers: nOut, flagStats: flagStats, neighborsFlagged: nbFlagged,
      stats: st, p10: p10, p25: p25, p50: p50, p75: p75, p90: p90,
      houstonMedian: houMed, statewideMedian: swMed, eeMedian: eeMed, lowToEe: lowToEe,
      comments: comments, warnings: warnings, sentence: sentence, obs: obs, years: years
    };
  }

  // ---- line items / export ----
  function lineRow(it, res) {
    return {
      code: it.code, desc: res && res.ok ? res.desc : (it.desc || ''), unit: res && res.ok ? res.unit : '',
      qty: num(it.qty), unit_price: res && res.ok ? res.mid : null,
      low: res && res.ok ? res.low : null, high: res && res.ok ? res.high : null,
      extension: res && res.ok && num(it.qty) ? res.mid * num(it.qty) : null,
      confidence: res && res.ok ? res.confidence : '', scope: res && res.ok ? res.scopeLabel : '',
      backup: res && res.ok ? res.sentence : (res && res.reason) || ''
    };
  }
  const COLS = [['code', 'Bid code'], ['desc', 'Description'], ['unit', 'Unit'], ['qty', 'Qty'], ['unit_price', 'Unit price'],
    ['low', 'Low'], ['high', 'High'], ['extension', 'Extension'], ['confidence', 'Confidence'], ['scope', 'Scope'], ['backup', 'Backup']];
  function cell(v) { return v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v); }
  function toTSV(rows) {
    const total = rows.reduce(function (s, r) { return s + (r.extension || 0); }, 0);
    const lines = [COLS.map(function (c) { return c[1]; }).join('\t')];
    rows.forEach(function (r) {
      lines.push(COLS.map(function (c) { return cell(r[c[0]]).replace(/[\t\r\n]+/g, ' '); }).join('\t'));
    });
    lines.push(['', 'TOTAL', '', '', '', '', '', cell(total), '', '', ''].join('\t'));
    return lines.join('\n');
  }
  function csvCell(s) { s = String(s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(rows) {
    const total = rows.reduce(function (s, r) { return s + (r.extension || 0); }, 0);
    const lines = [COLS.map(function (c) { return csvCell(c[1]); }).join(',')];
    rows.forEach(function (r) { lines.push(COLS.map(function (c) { return csvCell(cell(r[c[0]])); }).join(',')); });
    lines.push(['', 'TOTAL', '', '', '', '', '', cell(total), '', '', ''].join(','));
    return lines.join('\r\n');
  }

  /** Search the index rows [code, desc, unit, nState, nHouston]. */
  function search(index, q, itemInfo, limit) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    const items = (itemInfo && itemInfo.items) || {};
    const words = q.split(/\s+/);
    const out = [];
    for (let i = 0; i < index.length; i++) {
      const r = index[i];
      const info = items[r[0].split('-')[0]];
      const hay = (r[0] + ' ' + r[1] + ' ' + (info ? info.title + ' ' + (info.summary || '') : '')).toLowerCase();
      if (words.every(function (w) { return hay.indexOf(w) !== -1; })) {
        const exact = r[0].toLowerCase() === q ? 0 : r[0].toLowerCase().indexOf(q) === 0 ? 1 : (r[0] + ' ' + r[1]).toLowerCase().indexOf(q) !== -1 ? 2 : 3;
        out.push({ r: r, rank: exact });
      }
    }
    out.sort(function (a, b) { return a.rank - b.rank || b.r[3] - a.r[3]; });
    return out.slice(0, limit || 30).map(function (x) { return x.r; });
  }

  /** Parse ?code=XXXX-XXXX&qty=N&scope=... */
  function parseQuery(qs) {
    const p = new URLSearchParams(String(qs || '').replace(/^\?/, ''));
    const code = (p.get('code') || '').trim().toUpperCase();
    return { code: /^\d{3,4}-\d{4}$/.test(code) ? code : null, qty: num(p.get('qty')), scope: p.get('scope') || null };
  }

  const api = {
    O: O, METHOD: METHOD, slopeSums: slopeSums, shrink: shrink, quantile: quantile, median: median, mean: mean, linreg: linreg, tPValue: tPValue,
    logLogFit: logLogFit, summarize: summarize, outlierFence: outlierFence, neighbors: neighbors,
    estimate: estimate, roundPrice: roundPrice, fmtMoney: fmtMoney, fmtQty: fmtQty,
    lineRow: lineRow, toTSV: toTSV, toCSV: toCSV, search: search, parseQuery: parseQuery, r4: r4
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BidEstimator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
