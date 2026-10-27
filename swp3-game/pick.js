// SWP3 Designer: pure screen -> tile picking (node-testable, no DOM).
(function (root) {
  'use strict';
  // Client (CSS px) -> terrain-buffer px, mirroring the exact blit transform in game.js:
  //   device = round(viewW/2 + panX*dpr) + (buf - geoW/2) * zoom*dpr
  // rect: canvas getBoundingClientRect(); viewW/viewH: backing-store size.
  function clientToBuffer(cx, cy, v) {
    var r = v.rect, kx = v.viewW / Math.max(1e-9, r.width), ky = v.viewH / Math.max(1e-9, r.height); // CSS -> device (actual, not assumed dpr)
    var dx = (cx - r.left) * kx, dy = (cy - r.top) * ky, sc = v.zoom * v.dpr;
    var ox = Math.round(v.viewW / 2 + v.panX * v.dpr), oy = Math.round(v.viewH / 2 + v.panY * v.dpr);
    return { x: (dx - ox) / sc + v.geoW / 2, y: (dy - oy) / sc + v.geoH / 2 };
  }
  // Top corner of tile (x,y) top face in buffer px.
  function tileTop(g, x, y) { return { x: g.ox + (x - y) * g.TW / 2, y: g.oy + (x + y) * g.TH / 2 - g.z[y * g.W + x] }; }
  // Exact hit test of the drawn block: top diamond + both side faces (which drop z+BASE px).
  // Returns 'top', 'side' or null.
  function hitBlock(g, x, y, bx, by) {
    var p = tileTop(g, x, y), hw = g.TW / 2, hh = g.TH / 2, dx = Math.abs(bx - p.x);
    if (dx > hw) return null;
    if (dx / hw + Math.abs(by - (p.y + hh)) / hh <= 1) return 'top';
    var edge = p.y + g.TH - dx * hh / hw; // lower outline of the diamond at this x
    var depth = g.z[y * g.W + x] + g.BASE;
    if (by >= edge && by <= edge + depth) return 'side';
    return null;
  }
  // Front-to-back (painter order reversed): first block that covers the point is the visible one.
  function pickTile(g, bx, by) {
    for (var s = g.W + g.H - 2; s >= 0; s--) {
      for (var y = 0; y < g.H; y++) {
        var x = s - y; if (x < 0 || x >= g.W) continue;
        if (hitBlock(g, x, y, bx, by)) return y * g.W + x;
      }
    }
    return -1;
  }
  // Inverse used by tests: buffer point -> client point.
  function bufferToClient(bx, by, v) {
    var sc = v.zoom * v.dpr, r = v.rect;
    var dx = Math.round(v.viewW / 2 + v.panX * v.dpr) + (bx - v.geoW / 2) * sc, dy = Math.round(v.viewH / 2 + v.panY * v.dpr) + (by - v.geoH / 2) * sc;
    return { x: r.left + dx * r.width / v.viewW, y: r.top + dy * r.height / v.viewH };
  }
  var api = { clientToBuffer: clientToBuffer, bufferToClient: bufferToClient, tileTop: tileTop, hitBlock: hitBlock, pickTile: pickTile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SWP3Pick = api;
})(this);
