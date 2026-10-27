/* National Radar: map projection shared by the geometry builder (Node) and the browser.
   Albers equal-area conic with three insets (Alaska, Hawaii, Puerto Rico), the usual way to draw all states on one phone-sized map.
   Parameters live in us-geo.js (PROJ) so the pins and the state shapes always use the same maths. */
(function (root) {
  'use strict';
  var D = Math.PI / 180;
  function albers(p) {
    var p1 = p.lat1 * D, p2 = p.lat2 * D, p0 = p.lat0 * D, l0 = p.lon0 * D;
    var n = (Math.sin(p1) + Math.sin(p2)) / 2;
    var C = Math.cos(p1) * Math.cos(p1) + 2 * n * Math.sin(p1);
    var r0 = Math.sqrt(C - 2 * n * Math.sin(p0)) / n;
    return function (lon, lat) {
      var r = Math.sqrt(C - 2 * n * Math.sin(lat * D)) / n, t = n * (lon * D - l0);
      return [r * Math.sin(t), -(r0 - r * Math.cos(t))];
    };
  }
  // proj: { w, h, parts: [{ id, lat1, lat2, lat0, lon0, k, tx, ty }], stateTo: { AK: 'AK', ... } (default part 'L48') }
  function make(proj) {
    var fns = {};
    proj.parts.forEach(function (p) { fns[p.id] = { f: albers(p), p: p }; });
    return function (lon, lat, state) {
      var id = (proj.stateTo && proj.stateTo[state]) || 'L48', e = fns[id] || fns.L48, xy = e.f(lon, lat);
      return [xy[0] * e.p.k + e.p.tx, xy[1] * e.p.k + e.p.ty];
    };
  }
  var api = { albers: albers, make: make };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NationalProj = api;
})(typeof self !== 'undefined' ? self : this);
