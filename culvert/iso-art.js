/* Isometric pixel art for the culvert crossing, adapted from flow-game/art.js
   (Storm Designer) and the SWP3Art helpers it uses (swp3-game/art.js).
   Those files are not modified. Tile size is 64×32, the same 2:1 diamond. */
(function (root) {
  'use strict';
  var TW = 64, TH = 32, BASE = 20;
  function hash(x, y, s) { var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s || 0) | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function ramp(a) { return a.map(hex); }
  function r(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function at(p, u, v) { return { x: p.x + (u - v) * TW / 2, y: p.y + (u + v) * TH / 2 }; }
  function diamond(ctx, p, inset, col) {
    var a = at(p, inset, inset), b = at(p, 1 - inset, inset), c = at(p, 1 - inset, 1 - inset), d = at(p, inset, 1 - inset);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
  }
  function shadow(ctx, x, y, rx, ry, a) { ctx.save(); ctx.translate(x + rx * 0.15, y + ry * 0.3); ctx.scale(1, ry / rx); var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, 'rgba(20,14,8,' + a + ')'); gr.addColorStop(1, 'rgba(20,14,8,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.2832); ctx.fill(); ctx.restore(); }
  var R = {
    G: ramp(['#94d063', '#72b44a', '#589739', '#41742b']),
    T: ramp(['#7cb854', '#5e9a3e', '#4a7f31', '#365f24']),
    H: ramp(['#8fcb5e', '#6daf47', '#548f37', '#3e6d29']),
    P: ramp(['#7a7a80', '#66666c', '#55555a', '#444449']),
    R: ramp(['#6c6c73', '#5a5a61', '#4b4b51', '#3c3c41']),
    Q: ramp(['#707076', '#5e5e64', '#4e4e54', '#3e3e43']),
    X: ramp(['#6c6c73', '#5a5a61', '#4b4b51', '#3c3c41']),
    C: ramp(['#5aa0dc', '#3f80c0', '#336aa3', '#27558a']),
    wallSoil: ramp(['#8a6038', '#74502e', '#5e4024', '#47301b']),
    wallSoil2: ramp(['#94683e', '#7d5733', '#664628', '#4e351e']),
    wallCreek: ramp(['#3a74ad', '#2f6194', '#264f7a', '#1d3e61']),
    wallRoad: ramp(['#8a8a90', '#76767c', '#606066', '#4a4a50'])
  };
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function tone(n, b, bias) { var s = 0.4 * n + 0.3 * b + 0.15 + bias; return s < 0.24 ? 0 : s < 0.6 ? 1 : s < 0.78 ? 2 : 3; }
  function cn(x, y, s) { return 0.65 * hash(x >> 1, y >> 1, s) + 0.35 * hash(x, y, s + 100); }
  var ROAD = { R: 1, Q: 1, X: 1, P: 0 };
  function drawTerrain(ctx, g) {
    var TW = g.TW || 64, TH = g.TH || TW / 2, BASE = g.BASE != null ? g.BASE : 20, Q = TW / 64;
    var img = ctx.createImageData(g.w, g.h), d = new Uint32Array(img.data.buffer), W = g.W, H = g.H;
    function put(x, y, c, k) { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return; k = k == null ? 1 : k; d[y * g.w + x] = (255 << 24) | (Math.min(255, c[2] * k) << 16) | (Math.min(255, c[1] * k) << 8) | Math.min(255, c[0] * k); }
    function T(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? null : g.types[y * W + x]; }
    function isRoad(t) { return !!ROAD[t]; }
    for (var s = 0; s <= W + H - 2; s++) for (var ty = 0; ty < H; ty++) {
      var tx = s - ty; if (tx < 0 || tx >= W) continue;
      var i = ty * W + tx, t = g.types[i], px0 = g.ox + (tx - ty) * TW / 2, py0 = g.oy + (tx + ty) * TH / 2 - g.z[i];
      var depth = g.z[i] + BASE, wall = t === 'C' ? R.wallCreek : isRoad(t) || t === 'P' ? R.wallRoad : null;
      for (var side = 0; side < 2; side++) for (var c = 0; c < TW / 2; c++) {
        var x = side ? px0 + c : px0 - TW / 2 + c, yTop = side ? py0 + TH - (c + 0.5) * 0.5 : py0 + TH / 2 + (c + 0.5) * 0.5;
        var y0 = Math.ceil(yTop - 0.5), lit = side ? 0.78 : 1.0;
        for (var y = y0; y + 0.5 <= yTop + depth; y++) {
          var dd = y - yTop, n = cn(x, y, 7), b = BAYER[(y & 3) * 4 + (x & 3)] / 16, col;
          if (dd < 3 * Q && (t === 'G' || t === 'T' || t === 'H')) col = R.G[dd < 1.5 * Q ? 2 : 3];
          else if (wall) col = wall[tone(n, b, dd < 4 * Q ? 0.25 : 0)];
          else { var layer = Math.floor((y - py0 + (side ? -c : c) * 0.5 + g.z[i]) / (7 * Q)) & 1; col = (layer ? R.wallSoil2 : R.wallSoil)[tone(n, b, 0.05)]; }
          var k = lit;
          if (dd < 4 * Q && dd >= Q) k *= 0.82 + dd / Q * 0.04;
          if (dd > depth - 5 * Q) k *= 0.8 + (depth - dd) / Q * 0.04;
          if (side && c === 0) k *= 1.1; if (!side && c === TW / 2 - 1) k *= 1.12;
          put(x, y, col, Math.min(1.15, k));
        }
      }
      var rn = function (x2, y2) { return isRoad(T(x2, y2)); };
      var alongY = (rn(tx, ty - 1) || rn(tx, ty + 1)) && !(rn(tx - 1, ty) || rn(tx + 1, ty));
      var inter = (rn(tx, ty - 1) || rn(tx, ty + 1)) && (rn(tx - 1, ty) || rn(tx + 1, ty));
      var zi = g.z[i], Z = function (x2, y2) { return x2 < 0 || y2 < 0 || x2 >= W || y2 >= H ? -1e9 : g.z[y2 * W + x2]; };
      var stepR = Z(tx + 1, ty) < zi - 0.5, stepB = Z(tx, ty + 1) < zi - 0.5, stepL = Z(tx - 1, ty) < zi - 0.5, stepT = Z(tx, ty - 1) < zi - 0.5;
      var diffR = T(tx + 1, ty) !== t, diffB = T(tx, ty + 1) !== t;
      for (var py = 0; py < TH; py++) for (var px = -TW / 2; px < TW / 2; px++) {
        var dx = px + 0.5, dy = py + 0.5, u = dy / TH + dx / TW, v = dy / TH - dx / TW;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        var X = px0 + px, Y = py0 + py, nn = cn(X, Y, 1), bb = BAYER[(Y & 3) * 4 + (X & 3)] / 16, rp = R[t] || R.G, bias = (u + v) * 0.08 - 0.04, cc;
        var a = alongY ? u : v, l = alongY ? v : u;
        if (t === 'G' || t === 'T' || t === 'H') { cc = rp[tone(nn, bb, bias)]; if (hash(X, Y, 3) > 0.95) cc = rp[0]; else if (hash(X, Y - 1, 3) > 0.95) cc = rp[3];
          if (t === 'G' && hash(X, Y, 4) > 0.996) cc = hash(X, Y, 5) > 0.5 ? [240, 220, 90] : [240, 240, 240];
          if (t === 'T' && hash(X >> 2, Y >> 2, 6) > 0.8) cc = [86, 70, 44]; }
        else if (t === 'P') { cc = rp[tone(nn, bb, bias * 0.5)]; }
        else if (t === 'R' || t === 'X') { cc = rp[tone(nn, bb, bias * 0.4)]; if (nn > 0.975) cc = rp[0];
          if (!inter) {
            if (a < 0.07 || a > 0.93) cc = a < 0.035 || a > 0.965 ? [206, 204, 196] : [168, 166, 160];
            else if (a < 0.17 || a > 0.83) cc = (Math.floor(l * 8) % 2) ? [150, 148, 144] : [142, 140, 136];
            else if (Math.abs(a - 0.5) < 0.025 && Math.floor(l * 4) % 2 === 0) cc = [232, 196, 72];
          } else if (Math.min(u, v, 1 - u, 1 - v) < 0.1) cc = [150, 148, 144]; }
        else if (t === 'Q') { cc = rp[tone(nn, bb, bias * 0.4)]; }
        else if (t === 'C') { cc = rp[tone(nn, bb, 0.1 + (Math.abs(a - 0.5) < 0.3 ? 0.15 : 0))]; }
        else cc = rp[1];
        if (u < 0.035 && stepL) cc = rp[0];
        else if (v < 0.035 && stepT) cc = rp[0];
        else if ((u > 0.965 && stepR) || (v > 0.965 && stepB)) cc = rp[3];
        else if ((u > 0.965 && diffR) || (v > 0.965 && diffB)) cc = rp[2];
        put(X, Y, cc, 1);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function shade(h, k) { var c = hex(h); return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')'; }
  function drawTree(ctx, x, y, seed, t) {
    x = Math.round(x); y = Math.round(y); var s = 0.8 + 0.4 * hash(seed, 1, 9);
    shadow(ctx, x, y, 9 * s, 3.5 * s, 0.3);
    r(ctx, x - 1, y - 8 * s, 3, 8 * s, '#6a4a2a');
    var g = ['#2f6a2a', '#3f8a35', '#55a845', '#7cc860'];
    [[0, -18, 8], [-5, -13, 6], [5, -13, 6], [0, -11, 7]].forEach(function (b, k) {
      var bx = x + b[0] * s, by = y + b[1] * s, rr = b[2] * s;
      ctx.fillStyle = g[k === 3 ? 0 : 1]; ctx.beginPath(); ctx.arc(bx, by, rr, 0, 6.283); ctx.fill();
      ctx.fillStyle = g[2]; ctx.beginPath(); ctx.arc(bx - rr * 0.3, by - rr * 0.3, rr * 0.55, 0, 6.283); ctx.fill();
    });
  }
  var CARS = ['#d83a2a', '#2a6ad8', '#e8e8e8', '#f0c020', '#2a2a2a', '#3aa860'];
  function drawCar(ctx, x, y, dirX, seed) {
    x = Math.round(x); y = Math.round(y); var col = CARS[seed % CARS.length];
    shadow(ctx, x, y + 1, 10, 4, 0.35);
    var ax = dirX > 0 ? 1 : -1, k;
    for (k = -6; k <= 6; k++) { var yy = y + Math.round(k * 0.5) * ax; r(ctx, x + k, yy - 5, 1, 5, k > 3 || k < -3 ? shade(col, 0.85) : col); }
    for (k = -3; k <= 2; k++) { var y2 = y + Math.round(k * 0.5) * ax; r(ctx, x + k, y2 - 8, 1, 3, k === -3 || k === 2 ? '#2a3440' : '#8ab8d8'); }
    r(ctx, x - 5, y - 1 - 3 * ax, 2, 2, '#1a1a1a'); r(ctx, x + 4, y - 1 + 3 * ax, 2, 2, '#1a1a1a');
  }
  function culvertFace(p, axis) {
    return axis === 'u'
      ? { a: at(p, 1, 0), b: at(p, 1, 1), out: { x: TW / 2, y: TH / 2 }, fa: at(p, 0, 0), fb: at(p, 0, 1) }
      : { a: at(p, 0, 1), b: at(p, 1, 1), out: { x: -TW / 2, y: TH / 2 }, fa: at(p, 0, 0), fb: at(p, 1, 0) };
  }
  function quad(ctx, pts, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y); ctx.closePath(); ctx.fill(); }
  function culvertBarrels(o, len) {
    var n = Math.max(1, o.barrels || 1), Dft = (o.dia || 48) / 12, rv = Math.min(Dft * (o.zs || 3) / 2, (o.drop - 3) / 2), rh = o.shape === 'box' ? rv * 1.15 : rv * 0.95, gap = Math.max(1.5, rh * 0.35);
    var tot = n * 2 * rh + (n - 1) * gap, sc = tot > len * 0.82 ? len * 0.82 / tot : 1;
    rh *= sc; rv *= sc; gap *= sc; tot *= sc; rv = Math.max(2, rv); rh = Math.max(2, rh);
    var c = []; for (var k = 0; k < n; k++) c.push((len - tot) / 2 + rh + k * (2 * rh + gap));
    return { rh: rh, rv: rv, c: c };
  }
  /* One headwall face. side 'near' is the +axis face (downstream when the barrel runs along +x).
     side 'far' is the opposite face, so both toes show a mouth in the wall, not a hatch on top. */
  function drawHeadwall(ctx, p, o) {
    var f = culvertFace(p, o.axis || 'u'), far = o.side === 'far';
    var a = far ? f.fa : f.a, b = far ? f.fb : f.b, out = far ? { x: -f.out.x, y: -f.out.y } : f.out;
    var drop = Math.max(8, o.drop || 12);
    var ex = b.x - a.x, ey = b.y - a.y, len = Math.max(1, Math.sqrt(ex * ex + ey * ey)), ux = ex / len, uy = ey / len;
    var dn = function (q, d) { return { x: q.x, y: q.y + d }; };
    [a, b].forEach(function (q, s2) {
      var flare = s2 ? 1 : -1;
      var side = { x: q.x + out.x * 0.28 + ux * flare * 6, y: q.y + out.y * 0.28 + uy * flare * 6 };
      quad(ctx, [dn(q, drop * 0.28), dn(q, drop), dn(side, drop), dn(side, drop * 0.72)], s2 ? '#a3a39c' : '#b3b3ac');
    });
    quad(ctx, [a, b, dn(b, drop), dn(a, drop)], '#c4c4bd');
    quad(ctx, [a, b, dn(b, 3), dn(a, 3)], '#e2e2dc');
    quad(ctx, [dn(a, drop - 2), dn(b, drop - 2), dn(b, drop), dn(a, drop)], '#8d8d86');
    var g = culvertBarrels(o, len);
    g.c.forEach(function (d) {
      var cx = a.x + ux * d, cy = a.y + uy * d + drop - g.rv - 1;
      ctx.save(); ctx.translate(cx, cy); ctx.transform(ux, uy, 0, 1, 0, 0);
      ctx.fillStyle = o.metal ? '#9aa3aa' : '#8a8a84';
      if (o.shape === 'box') ctx.fillRect(-g.rh - 1, -g.rv - 1, (g.rh + 1) * 2, (g.rv + 1) * 2);
      else { ctx.beginPath(); ctx.ellipse(0, 0, g.rh + 1.2, g.rv + 1.2, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#14181d';
      if (o.shape === 'box') ctx.fillRect(-g.rh, -g.rv, g.rh * 2, g.rv * 2);
      else { ctx.beginPath(); ctx.ellipse(0, 0, g.rh, g.rv, 0, 0, Math.PI * 2); ctx.fill(); }
      if (o.metal && o.shape !== 'box') {
        ctx.strokeStyle = '#c5ced6'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 0, g.rh * 0.72, g.rv * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, g.rh * 0.42, g.rv * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.ellipse(-g.rh * 0.25, -g.rv * 0.35, g.rh * 0.4, g.rv * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      if (o.flow) { var t = o.t || 0; for (var k = 0; k < 4; k++) { var ph = (t / 260 + k / 4) % 1; ctx.fillStyle = 'rgba(205,235,255,' + (0.85 * (1 - ph)).toFixed(2) + ')'; ctx.fillRect(-g.rh * 0.7 + k * g.rh * 0.4, g.rv * 0.15 + ph * 3, Math.max(1, g.rh * 0.28), 1); } }
      ctx.restore();
    });
  }
  function drawCreekWater(ctx, p, depth, t, seed) {
    if (depth <= 0.3) return;
    var q = { x: p.x, y: p.y - depth };
    diamond(ctx, q, 0.0, 'rgba(78,128,178,.92)');
    for (var k = 0; k < 3; k++) {
      var ph = ((t || 0) / 900 + hash(k, seed || 0, 9)) % 1, w = at(q, 0.2 + 0.6 * ph, 0.25 + 0.5 * hash(k, 3, seed || 0));
      ctx.fillStyle = 'rgba(225,242,255,' + (0.65 * Math.sin(ph * 3.14)).toFixed(2) + ')';
      ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y), 6, 1);
    }
  }
  function drawRiprap(ctx, p) {
    for (var k = 0; k < 8; k++) {
      var rp = at(p, 0.2 + 0.6 * hash(k, 1, 4), 0.2 + 0.6 * hash(k, 2, 4));
      r(ctx, Math.round(rp.x) - 1, Math.round(rp.y), 3, 2, k % 2 ? '#8d8a82' : '#a8a59c');
    }
  }
  root.CulvertIso = {
    TW: TW, TH: TH, BASE: BASE, hash: hash, at: at, diamond: diamond,
    drawTerrain: drawTerrain, drawTree: drawTree, drawCar: drawCar,
    drawHeadwall: drawHeadwall, drawCreekWater: drawCreekWater, drawRiprap: drawRiprap
  };
})(typeof window !== 'undefined' ? window : globalThis);
