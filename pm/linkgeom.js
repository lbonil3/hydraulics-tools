/* Project Tracker: connector geometry (pure functions, no DOM). Browser: window.PMLinkGeom. Node: require('./linkgeom.js').
   Dependency connectors are drawn on the LEFT side of the nodes (where the drag handle is), behind the nodes:
   out of the source's left edge (upper port), along a vertical lane in the gutter, into the target's left edge (lower port)
   with an arrowhead. Lanes are assigned so vertical runs never sit on top of each other: shorter spans hug the nodes,
   longer spans go further out. Corners are rounded. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMLinkGeom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OPT = { gutter: 22, laneGap: 11, maxLanes: 9, radius: 9, portInset: 0.27, portStep: 5 };
  /* port on the node's left edge. role 'out' sits in the upper part, 'in' in the lower part, so the centred drag handle
     stays clear. j / m = this port's slot among m ports of that role on the node (slots are spread by portStep around the base). */
  function port(n, role, j, m, o) {
    o = Object.assign({}, OPT, o);
    const base = role === 'out' ? n.y + n.h * o.portInset : n.y + n.h * (1 - o.portInset);
    const cnt = Math.max(1, m || 1), step = Math.min(o.portStep, (n.h * 0.4) / cnt);
    return { x: n.x, y: base + ((j || 0) - (cnt - 1) / 2) * step };
  }
  /* items: [{ id, x (lane reference: left edge the lane runs beside), y1, y2 }] → { id: lane index }.
     Greedy interval colouring, shortest spans first, per x column. Lanes past maxLanes wrap around. */
  function assignLanes(items, o) {
    o = Object.assign({}, OPT, o);
    const pad = 6, out = {}, cols = new Map();
    const sorted = items.slice().sort((a, b) => Math.abs(a.y2 - a.y1) - Math.abs(b.y2 - b.y1) || Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2) || String(a.id).localeCompare(String(b.id)));
    for (const it of sorted) {
      const lo = Math.min(it.y1, it.y2) - pad, hi = Math.max(it.y1, it.y2) + pad, key = Math.round(it.x);
      const lanes = cols.get(key) || []; cols.set(key, lanes);
      let k = 0;
      while (k < lanes.length && lanes[k].some((s) => lo < s[1] && hi > s[0])) k++;
      if (k >= o.maxLanes) { k = lanes.reduce((best, l, i) => (l.length < lanes[best].length ? i : best), 0); }
      (lanes[k] = lanes[k] || []).push([lo, hi]);
      out[it.id] = k;
    }
    return out;
  }
  function laneX(xRef, lane, o) { o = Object.assign({}, OPT, o); return xRef - o.gutter - lane * o.laneGap; }
  const f = (v) => Math.round(v * 10) / 10;
  /* rounded orthogonal route: (x1,y1) left → lane X → vertical → right into (x2,y2). Returns an SVG path string. */
  function route(p1, p2, X, o) {
    o = Object.assign({}, OPT, o);
    const dy = p2.y - p1.y, s = dy >= 0 ? 1 : -1;
    const r = Math.max(0, Math.min(o.radius, Math.abs(dy) / 2, (p1.x - X) - 1, (p2.x - X) - 1));
    if (Math.abs(dy) < 0.5) return 'M' + f(p1.x) + ' ' + f(p1.y) + ' H' + f(X) + ' H' + f(p2.x);
    return 'M' + f(p1.x) + ' ' + f(p1.y) +
      ' H' + f(X + r) + ' Q' + f(X) + ' ' + f(p1.y) + ' ' + f(X) + ' ' + f(p1.y + s * r) +
      ' V' + f(p2.y - s * r) + ' Q' + f(X) + ' ' + f(p2.y) + ' ' + f(X + r) + ' ' + f(p2.y) +
      ' H' + f(p2.x);
  }
  /* full layout for a set of links between laid-out nodes.
     links: [{ id, a: node, b: node }] (node = { key, x, y, w, h }). Returns [{ id, d, lane, p1, p2, X }].
     1) lanes from the nominal ports; 2) port slots per node ordered so that a stub never crosses a vertical run of the
     same node: out-ports top→bottom = upward links (inner lanes first), then downward links (outer lanes first);
     in-ports top→bottom = links arriving from above (inner first), then links arriving from below (outer first). */
  function layout(links, o) {
    o = Object.assign({}, OPT, o);
    const L = links.map((l) => { const p1 = port(l.a, 'out', 0, 1, o), p2 = port(l.b, 'in', 0, 1, o); return { l, p1, p2, xRef: Math.min(p1.x, p2.x), down: p2.y >= p1.y }; });
    const lanes = assignLanes(L.map((p) => ({ id: p.l.id, x: p.xRef, y1: p.p1.y, y2: p.p2.y })), o);
    L.forEach((p) => { p.lane = lanes[p.l.id]; });
    const slots = (role) => {
      const by = new Map();
      for (const p of L) { const k = role === 'out' ? p.l.a.key : p.l.b.key; (by.get(k) || by.set(k, []).get(k)).push(p); }
      for (const arr of by.values()) {
        const first = arr.filter((p) => (role === 'out' ? !p.down : p.down)).sort((x, y) => x.lane - y.lane);
        const second = arr.filter((p) => (role === 'out' ? p.down : !p.down)).sort((x, y) => y.lane - x.lane);
        first.concat(second).forEach((p, j) => { const n = role === 'out' ? p.l.a : p.l.b; p[role === 'out' ? 'p1' : 'p2'] = port(n, role, j, arr.length, o); });
      }
    };
    slots('out'); slots('in');
    return L.map((p) => { const X = laneX(p.xRef, p.lane, o); return { id: p.l.id, lane: p.lane, p1: p.p1, p2: p.p2, X, d: route(p.p1, p.p2, X, o) }; });
  }
  /* live drag preview: a smooth curve from the handle that bows out to the left and follows the pointer */
  function preview(x0, y0, px, py) {
    const dx = Math.max(40, Math.min(140, Math.abs(px - x0) * 0.5 + Math.abs(py - y0) * 0.15));
    return 'M' + f(x0) + ' ' + f(y0) + ' C' + f(x0 - dx) + ' ' + f(y0) + ',' + f(Math.min(px, x0) - dx) + ' ' + f(py) + ',' + f(px) + ' ' + f(py);
  }
  return { OPT, port, assignLanes, laneX, route, layout, preview };
});
