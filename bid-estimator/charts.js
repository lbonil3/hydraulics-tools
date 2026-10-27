/* Inline SVG charts for the Bid Estimator (no external libraries). Pure string builders. */
(function (root) {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function niceMoney(v) {
    if (v === 0) return '$0';
    if (v >= 1000) return '$' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
    if (v >= 10) return '$' + Math.round(v);
    return '$' + v.toFixed(v >= 1 ? 1 : 2);
  }
  function niceQty(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
    return String(Math.round(v * 100) / 100);
  }
  function log10(x) { return Math.log(x) / Math.LN10; }
  function decadeTicks(lo, hi) {
    const out = [];
    for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
      [1, 2, 5].forEach(function (m) { const v = m * Math.pow(10, e); if (log10(v) >= lo - 1e-9 && log10(v) <= hi + 1e-9) out.push(v); });
    }
    if (out.length > 7) return out.filter(function (v) { return Math.abs(log10(v) - Math.round(log10(v))) < 1e-9; });
    return out;
  }

  /**
   * Scatter of low-bid unit price vs quantity (log x; log y when prices span > 20x).
   * res: estimator result (obs, qty, low, mid, high, unit). houstonIdx: district index of Houston.
   */
  function scatter(res, houstonIdx, opts) {
    opts = opts || {};
    const W = opts.width || 560, H = opts.height || 260, L = 54, R = 14, T = 14, B = 40;
    const obs = res.obs || [];
    const qs = obs.map(function (o) { return o[0]; }).concat([res.qty]);
    const ps = obs.map(function (o) { return o[1]; }).concat([res.low, res.high]);
    let x0 = log10(Math.min.apply(null, qs)), x1 = log10(Math.max.apply(null, qs));
    if (x1 - x0 < 0.5) { x0 -= 0.25; x1 += 0.25; }
    const pad = (x1 - x0) * 0.06; x0 -= pad; x1 += pad;
    const pmin = Math.min.apply(null, ps), pmax = Math.max.apply(null, ps);
    const logY = pmax / Math.max(pmin, 1e-9) > 20;
    let y0, y1;
    if (logY) { y0 = log10(pmin) - 0.08; y1 = log10(pmax) + 0.08; } else { y0 = 0; y1 = pmax * 1.1; }
    const X = function (q) { return L + (log10(q) - x0) / (x1 - x0) * (W - L - R); };
    const Y = function (p) { const v = logY ? log10(Math.max(p, 1e-9)) : p; return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); };
    const s = [];
    s.push('<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Unit price vs quantity for ' + res.code + ': ' + obs.length + ' low bids, your quantity marked') + '">');
    // y grid
    let yt = [];
    if (logY) yt = decadeTicks(y0, y1);
    else { const step = Math.pow(10, Math.floor(log10(y1 / 4))); const m = [1, 2, 5, 10].find(function (k) { return y1 / (k * step) <= 5; }) * step; for (let v = 0; v <= y1; v += m) yt.push(v); }
    yt.forEach(function (v) {
      const y = Y(v).toFixed(1);
      s.push('<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="tick" x="' + (L - 6) + '" y="' + y + '" dy="4" text-anchor="end">' + niceMoney(v) + '</text>');
    });
    decadeTicks(x0, x1).forEach(function (v) {
      const x = X(v).toFixed(1);
      s.push('<line class="grid" x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="tick" x="' + x + '" y="' + (H - B + 15) + '" text-anchor="middle">' + niceQty(v) + '</text>');
    });
    // suggested range band (horizontal) and your-qty line
    s.push('<rect class="band" x="' + L + '" width="' + (W - L - R) + '" y="' + Y(res.high).toFixed(1) + '" height="' + Math.max(1, Y(res.low) - Y(res.high)).toFixed(1) + '"/>');
    s.push('<line class="mid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(res.mid).toFixed(1) + '" y2="' + Y(res.mid).toFixed(1) + '"/>');
    const xq = X(res.qty).toFixed(1);
    s.push('<line class="yourq" x1="' + xq + '" x2="' + xq + '" y1="' + T + '" y2="' + (H - B) + '"/>');
    obs.forEach(function (o) {
      const h = o[5] === houstonIdx;
      s.push('<circle class="pt' + (h ? ' hou' : '') + '" cx="' + X(o[0]).toFixed(1) + '" cy="' + Y(o[1]).toFixed(1) + '" r="' + (h ? 4.5 : 3.5) + '"><title>' + esc(niceQty(o[0]) + ' ' + res.unit + ' @ $' + o[1] + ' (' + o[3] + ')') + '</title></circle>');
    });
    const ym = Y(res.mid);
    s.push('<path class="you" d="M' + xq + ' ' + (ym - 7).toFixed(1) + 'l7 7-7 7-7-7z"/>');
    const lx = Number(xq) > W - 120 ? Number(xq) - 6 : Number(xq) + 6;
    s.push('<text class="lbl" x="' + lx + '" y="' + (T + 11) + '" text-anchor="' + (Number(xq) > W - 120 ? 'end' : 'start') + '">your qty ' + niceQty(res.qty) + '</text>');
    s.push('<text class="axis" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Quantity (' + esc(res.unit) + ', log scale)</text>');
    s.push('<text class="axis" transform="translate(12 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">Low-bid $/' + esc(res.unit) + (logY ? ' (log)' : '') + '</text>');
    s.push('</svg>');
    return s.join('');
  }

  /** Box plot of low-bid unit prices (p10–p90 whiskers, IQR box, median) with all bids as dots and the suggestion marked. */
  function boxplot(res, opts) {
    opts = opts || {};
    const W = opts.width || 560, H = 88, L = 14, R = 14;
    const ps = (res.obs || []).map(function (o) { return o[1]; });
    const all = ps.concat([res.low, res.high]);
    const pmin = Math.min.apply(null, all), pmax = Math.max.apply(null, all);
    const logX = pmax / Math.max(pmin, 1e-9) > 20;
    const f = function (v) { return logX ? log10(Math.max(v, 1e-9)) : v; };
    const a = f(pmin) - (f(pmax) - f(pmin)) * 0.04 - (pmax === pmin ? 1 : 0), b = f(pmax) + (f(pmax) - f(pmin)) * 0.04 + (pmax === pmin ? 1 : 0);
    const X = function (v) { return L + (f(v) - a) / (b - a) * (W - L - R); };
    const s = ['<svg class="chart box" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Spread of ' + ps.length + ' low-bid unit prices') + '">'];
    s.push('<rect class="band" x="' + X(res.low).toFixed(1) + '" y="8" width="' + Math.max(1, X(res.high) - X(res.low)).toFixed(1) + '" height="50"/>');
    if (ps.length >= 3) {
      const yc = 33;
      s.push('<line class="whisk" x1="' + X(res.p10).toFixed(1) + '" x2="' + X(res.p90).toFixed(1) + '" y1="' + yc + '" y2="' + yc + '"/>');
      s.push('<rect class="iqr" x="' + X(res.p25).toFixed(1) + '" y="' + (yc - 12) + '" width="' + Math.max(1, X(res.p75) - X(res.p25)).toFixed(1) + '" height="24"/>');
      s.push('<line class="med" x1="' + X(res.p50).toFixed(1) + '" x2="' + X(res.p50).toFixed(1) + '" y1="' + (yc - 12) + '" y2="' + (yc + 12) + '"/>');
    }
    ps.forEach(function (p, i) { s.push('<circle class="pt" cx="' + X(p).toFixed(1) + '" cy="' + (50 - (i % 3) * 3) + '" r="2.6"/>'); });
    const xm = X(res.mid).toFixed(1);
    s.push('<path class="you" d="M' + xm + ' 4l6 7h-12z"/>');
    // axis ticks (log or linear), clamped inside the plot
    const ticks = logX ? decadeTicks(a, b) : (function () {
      const span = b - a, step0 = Math.pow(10, Math.floor(log10(span / 4)));
      const m = [1, 2, 5, 10].find(function (k) { return span / (k * step0) <= 5; }) * step0;
      const out = []; for (let v = Math.ceil(a / m) * m; v <= b; v += m) if (v >= 0) out.push(v); return out;
    })();
    s.push('<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="64" y2="64"/>');
    ticks.forEach(function (v) {
      const x = X(v);
      if (x < L - 0.5 || x > W - R + 0.5) return;
      s.push('<line class="grid" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="64" y2="68"/><text class="tick" x="' + Math.min(Math.max(x, L + 14), W - R - 14).toFixed(1) + '" y="80" text-anchor="middle">' + niceMoney(v) + '</text>');
    });
    s.push('</svg>');
    return s.join('');
  }

  const api = { scatter: scatter, boxplot: boxplot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BidEstimatorCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
