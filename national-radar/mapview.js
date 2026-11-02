/* National Radar: map encoding and layout helpers (pure functions, shared by app.js and the tests).
   - aggregate(): per-state counts, how many records carry a stated value, and the sum of stated values (the same value app.js already shows: a fee, or the
     design-build value / project cost in those tabs, which are labelled NOT a fee). Nothing is estimated here.
   - Bubble sizes are in SCREEN pixels (converted to map units by the caller), so labels and tap targets keep their size at any width or zoom.
   - Small Northeast / Mid-Atlantic states get "callout" bubbles in the Atlantic with a leader line, so DC, MD, DE, NJ, CT, RI and MA never sit on top of each other. */
(function (root) {
  'use strict';
  var VIEW = { w: 1040, h: 610 };            // us-geo.js draws into 975 x 610; the extra 65 units on the right hold the callout column
  var CALLOUT = ['MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];
  var CALLOUT_IF_NEEDED = ['VT', 'NH'];

  // list: records; valueOf(r) -> number (0 when the record states no value)
  function aggregate(list, valueOf) {
    var by = {}, none = { n: 0, nv: 0, v: 0 };
    list.forEach(function (r) {
      var o = r.state ? (by[r.state] = by[r.state] || { n: 0, nv: 0, v: 0 }) : none, v = +valueOf(r) || 0;
      o.n++; if (v > 0) { o.nv++; o.v += v; }
    });
    var maxV = 0, maxN = 0; Object.keys(by).forEach(function (k) { maxV = Math.max(maxV, by[k].v); maxN = Math.max(maxN, by[k].n); });
    return { by: by, none: none, maxV: maxV, maxN: maxN };
  }
  // what the bubble size means in this tab
  function encodingFor(mode, scope) {
    if (mode === 'pse' && scope === 'advance') return { kind: 'count', valueWord: null, noValueWhy: 'advance notices state no fee' };
    if (mode === 'pse' && scope === 'db') return { kind: 'value', valueWord: 'design-build values (NOT fees)' };
    if (mode === 'pse' && scope === 'pipeline') return { kind: 'value', valueWord: 'project costs (NOT fees)' };
    if (mode === 'pse' && scope === 'watch') return { kind: 'value', valueWord: 'stated values' };
    if (mode === 'pse') return { kind: 'value', valueWord: 'stated fees' };
    if (mode === 'road' && scope === 'nofee') return { kind: 'count', valueWord: null, noValueWhy: 'these records state no fee' };
    if (mode === 'water' && scope === 'nofee') return { kind: 'count', valueWord: null, noValueWhy: 'these records state no fee' };
    return { kind: 'value', valueWord: 'stated values' };
  }
  // Screen-pixel sizes. mapScale (optional) = screen px per map unit at zoom 1; on large desktop maps bubbles grow up to 1.45x.
  function sizes(phone, mapScale) {
    if (phone) return { rMin: 9, rMax: 24, font: 11, hit: 22 };
    var f = mapScale > 0 ? Math.max(1, Math.min(1.45, mapScale / 0.75)) : 1;
    return { rMin: 11 * f, rMax: 36 * f, font: 12.5 * Math.min(f, 1.15), hit: 16 };
  }
  function radiusPx(x, max, phone) { var s = typeof phone === 'object' && phone ? phone : sizes(phone); if (!(max > 0) || !(x > 0)) return s.rMin; return s.rMin + (s.rMax - s.rMin) * Math.sqrt(Math.min(1, x / max)); }
  // per-state bubble: value scale when the state has a stated value and the tab uses values, else count scale. sqrt scales, no cap.
  function bubbleFor(o, agg, enc, phone) {
    if (enc.kind === 'value' && o.v > 0) return { kind: 'value', r: radiusPx(o.v, agg.maxV, phone) };
    return { kind: 'count', r: radiusPx(o.n, agg.maxN, phone) };
  }
  // state shading by record count (0..1, sqrt)
  function shade(n, maxN) { return n > 0 && maxN > 0 ? Math.sqrt(n / maxN) : 0; }
  function compactMoney(v) {
    if (!(v > 0)) return '';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }
  // items: [{ st, cx, cy, r }] in map units (all bubbles in the view). Returns { ST: { x, y } } for the states moved to the callout column.
  // opts: { right (x of the column's right edge), top, bottom, gap }
  function layoutCallouts(items, opts) {
    opts = opts || {}; var right = opts.right === undefined ? VIEW.w - 4 : opts.right, top = opts.top === undefined ? 6 : opts.top, bottom = opts.bottom === undefined ? VIEW.h - 6 : opts.bottom, gap = opts.gap === undefined ? 4 : opts.gap;
    var byId = {}; items.forEach(function (it) { byId[it.st] = it; });
    var overlaps = function (a) { return items.some(function (b) { return b !== a && CALLOUT.indexOf(b.st) < 0 && Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r; }); };
    var chosen = items.filter(function (it) { return CALLOUT.indexOf(it.st) >= 0 || (CALLOUT_IF_NEEDED.indexOf(it.st) >= 0 && (overlaps(it) || items.some(function (b) { return CALLOUT.indexOf(b.st) >= 0 && Math.hypot(it.cx - b.cx, it.cy - b.cy) < it.r + b.r; }))); });
    chosen.sort(function (a, b) { return a.cy - b.cy || (a.st < b.st ? -1 : 1); });
    var out = {}; if (!chosen.length) return out;
    var place = function (list, x) {
      var ys = [], prev = null;
      list.forEach(function (it) { var y = Math.max(it.cy, top + it.r); if (prev) y = Math.max(y, prev.y + prev.r + it.r + gap); ys.push(y); prev = { y: y, r: it.r }; });
      var over = ys.length ? ys[ys.length - 1] + list[list.length - 1].r - bottom : 0;
      if (over > 0) { var room = ys[0] - list[0].r - top, shift = Math.min(over, Math.max(0, room)); ys = ys.map(function (y) { return y - shift; }); over -= shift; }
      return { ys: ys, over: over, x: x };
    };
    var maxR = Math.max.apply(null, chosen.map(function (c) { return c.r; }));
    var col1 = place(chosen, right - maxR);
    if (col1.over <= 0) { chosen.forEach(function (it, i) { out[it.st] = { x: col1.x, y: col1.ys[i] }; }); return out; }
    // two columns: alternate so neighbours sit side by side
    var a = chosen.filter(function (_, i) { return i % 2 === 0; }), b = chosen.filter(function (_, i) { return i % 2 === 1; });
    var ca = place(a, right - maxR), cb = place(b, right - 3 * maxR - gap);
    a.forEach(function (it, i) { out[it.st] = { x: ca.x, y: ca.ys[i] }; }); b.forEach(function (it, i) { out[it.st] = { x: cb.x, y: cb.ys[i] }; });
    return out;
  }
  // legend entries for this tab: [{ cls, text }]
  function legendFor(enc, info) {
    info = info || {}; var e = [];
    if (enc.kind === 'value' && info.hasValue) e.push({ cls: 'val', text: 'Blue bubble size = sum of ' + enc.valueWord + ' in the state (as stated by the source)' });
    if (info.hasCount) e.push({ cls: 'cnt', text: enc.kind === 'count' ? 'Amber bubble size = number of records (' + (enc.noValueWhy || 'no stated value') + ')' : 'Amber bubble = state whose records state no value; size = number of records' });
    if (info.shade) e.push({ cls: 'shd', text: 'State shade = number of records' });
    if (info.callouts) e.push({ cls: 'co', text: 'Small Northeast states are drawn off the coast, with a line to the state' });
    if (info.pinned > 0) e.push({ cls: 'pin', text: 'Pin = city named in the source (' + info.pinned + ')' });
    return e;
  }
  function tooltipLines(name, o, enc, fmtFull) {
    var lines = [name, o.n + ' record' + (o.n === 1 ? '' : 's')];
    if (enc.kind === 'value') { lines.push(o.nv ? 'Sum of ' + enc.valueWord + ': ' + fmtFull(o.v) : 'No ' + enc.valueWord.replace(/ \(NOT fees\)/, '') + ' stated'); lines.push(o.nv + ' of ' + o.n + ' with a stated value'); }
    else lines.push('No fee stated (' + (enc.noValueWhy || 'count only') + ')');
    return lines;
  }
  var api = { VIEW: VIEW, CALLOUT: CALLOUT, CALLOUT_IF_NEEDED: CALLOUT_IF_NEEDED, aggregate: aggregate, encodingFor: encodingFor, sizes: sizes, radiusPx: radiusPx, bubbleFor: bubbleFor, shade: shade, compactMoney: compactMoney, layoutCallouts: layoutCallouts, legendFor: legendFor, tooltipLines: tooltipLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NationalMapView = api;
})(typeof self !== 'undefined' ? self : this);
