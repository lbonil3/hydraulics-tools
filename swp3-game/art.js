/* SWP3 Designer - programmatic pixel art (no external assets). Terrain is rasterized per pixel into an
 * ImageData (dithered 4-tone ramps, AO on walls); sprites are drawn with fillRect at 1 art pixel = 1 buffer px.
 * Geometry MUST match pick.js: top diamond |dx|/(TW/2) + |dy-TH/2|/(TH/2) <= 1, walls drop z+BASE px. */
(function (root) {
  'use strict';
  var TW = 64, TH = 32, BASE = 20;
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function ramp(a) { return a.map(hex); }
  // 4-tone ramps: [light, base, mid, dark]
  var R = {
    G: ramp(['#8fcf5f', '#6aae45', '#4f8f36', '#3a6e2a']),
    S: ramp(['#c99062', '#a87444', '#8d5e36', '#6c4527']),
    A: ramp(['#c3946a', '#a57a50', '#89623f', '#684a2f']),
    R: ramp(['#8e8e95', '#76767d', '#606067', '#4a4a50']),
    D: ramp(['#9a7a4a', '#7e623a', '#634c2d', '#4a3820']),
    C: ramp(['#5aa0dc', '#3f80c0', '#336aa3', '#27558a']),
    I: ramp(['#8e8e95', '#76767d', '#606067', '#4a4a50']),
    wallSoil: ramp(['#8a6038', '#74502e', '#5e4024', '#47301b']),
    wallSoil2: ramp(['#94683e', '#7d5733', '#664628', '#4e351e']),
    wallCreek: ramp(['#3a74ad', '#2f6194', '#264f7a', '#1d3e61']),
    wallRoad: ramp(['#6e6e74', '#5b5b61', '#4a4a50', '#38383d'])
  };
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function hash(x, y, s) { var h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function tone(n, b, bias) { var s = 0.4 * n + 0.3 * b + 0.15 + bias; return s < 0.24 ? 0 : s < 0.6 ? 1 : s < 0.78 ? 2 : 3; }
  function cn(x, y, s) { return 0.65 * hash(x >> 1, y >> 1, s) + 0.35 * hash(x, y, s + 100); } // clustered noise (2x2 pixel clumps)

  // Rasterize the whole terrain. g: {W,H,types,z,ox,oy,w,h}
  function drawTerrain(ctx, g) {
    var img = ctx.createImageData(g.w, g.h), d = new Uint32Array(img.data.buffer), W = g.W, H = g.H;
    function put(x, y, c, k) { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return; k = k == null ? 1 : k; d[y * g.w + x] = (255 << 24) | ((c[2] * k) << 16) | ((c[1] * k) << 8) | (c[0] * k); }
    function T(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? null : g.types[y * W + x]; }
    for (var s = 0; s <= W + H - 2; s++) for (var ty = 0; ty < H; ty++) {
      var tx = s - ty; if (tx < 0 || tx >= W) continue;
      var i = ty * W + tx, t = g.types[i], px0 = g.ox + (tx - ty) * TW / 2, py0 = g.oy + (tx + ty) * TH / 2 - g.z[i];
      var depth = g.z[i] + BASE, wall = t === 'C' ? R.wallCreek : (t === 'R' || t === 'I') ? R.wallRoad : null;
      // ---- walls (left lit, right shaded), strata + AO ----
      for (var side = 0; side < 2; side++) for (var c = 0; c < TW / 2; c++) {
        var x = side ? px0 + c : px0 - TW / 2 + c, yTop = side ? py0 + TH - (c + 0.5) * 0.5 : py0 + TH / 2 + (c + 0.5) * 0.5;
        var y0 = Math.ceil(yTop - 0.5), lit = side ? 0.78 : 1.0;
        for (var y = y0; y + 0.5 <= yTop + depth; y++) {
          var dd = y - yTop, n = cn(x, y, 7), b = BAYER[(y & 3) * 4 + (x & 3)] / 16, col;
          if (dd < 3 && (t === 'G' || t === 'D')) col = R.G[dd < 1.5 ? 2 : 3];
          else if (wall) col = wall[tone(n, b, dd < 4 ? 0.25 : 0)];
          else { var layer = Math.floor((y - py0 + (side ? -c : c) * 0.5 + g.z[i]) / 7) & 1; col = (layer ? R.wallSoil2 : R.wallSoil)[tone(n, b, 0.05)]; if (n > 0.965) col = R.S[0]; }
          var k = lit;
          if (dd < 4 && dd >= 1) k *= 0.82 + dd * 0.04;            // shadow under the lip
          if (dd > depth - 5) k *= 0.8 + (depth - dd) * 0.04;      // AO at the base
          if (side && c === 0) k *= 1.1; if (!side && c === TW / 2 - 1) k *= 1.12; // front corner edge light
          put(x, y, col, Math.min(1.15, k));
        }
      }
      // ---- top face ----
      var along = (T(tx, ty - 1) === t || T(tx, ty + 1) === t) && !(T(tx - 1, ty) === t && T(tx + 1, ty) === t); // channel/road runs along y
      var zi = g.z[i], Z = function (x, y) { return x < 0 || y < 0 || x >= W || y >= H ? -1e9 : g.z[y * W + x]; };
      var stepR = Z(tx + 1, ty) < zi - 0.5, stepB = Z(tx, ty + 1) < zi - 0.5, stepL = Z(tx - 1, ty) < zi - 0.5, stepT = Z(tx, ty - 1) < zi - 0.5;
      var diffR = T(tx + 1, ty) !== t, diffB = T(tx, ty + 1) !== t;
      for (var py = 0; py < TH; py++) for (var px = -TW / 2; px < TW / 2; px++) {
        var dx = px + 0.5, dy = py + 0.5, u = dy / TH + dx / TW, v = dy / TH - dx / TW;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        var X = px0 + px, Y = py0 + py, nn = cn(X, Y, 1), bb = BAYER[(Y & 3) * 4 + (X & 3)] / 16, rp = R[t], bias = (u + v) * 0.08 - 0.04, cc;
        var a = along ? u : v, l = along ? v : u; // a = across the channel, l = along
        if (t === 'G') { cc = rp[tone(nn, bb, bias)]; var bl = hash(X, Y, 3); if (bl > 0.94) cc = rp[0]; else if (hash(X, Y - 1, 3) > 0.94) cc = rp[3]; if (bl > 0.997) cc = hash(X, Y, 4) > 0.5 ? [240, 220, 90] : [240, 240, 240]; }
        else if (t === 'S') { cc = rp[tone(nn, bb, bias + (Math.floor(u * 10) % 2 ? 0.06 : -0.04))]; if (hash(X, Y, 5) > 0.97) cc = rp[3]; if (hash(X, Y, 6) > 0.985) cc = rp[0]; }
        else if (t === 'A') { var tr = Math.abs(v - 0.32) < 0.07 || Math.abs(v - 0.68) < 0.07; cc = rp[tone(nn, bb, bias + (tr ? 0.25 + ((Math.floor(u * 22)) % 2 ? 0.1 : 0) : 0))]; }
        else if (t === 'R' || t === 'I') { cc = rp[tone(nn, bb, bias * 0.5)]; if (nn > 0.97) cc = rp[0];
          if (Math.abs(a - 0.5) < 0.035 && (Math.floor(l * 4) % 2 === 0) && t === 'R') cc = [217, 195, 90];
          if (a < 0.04 || a > 0.96) cc = [150, 150, 150]; }
        else if (t === 'D') { var m = Math.abs(a - 0.5) * 2; // 0 centre .. 1 bank
          if (m > 0.86) cc = R.G[tone(nn, bb, -0.1)]; else if (m > 0.8) cc = [196, 170, 112]; else if (m > 0.34) cc = rp[tone(nn, bb, (0.8 - m) * 0.35 - 0.12)]; else if (m > 0.28) cc = [60, 46, 30]; else cc = (hash(X, Y, 8) > 0.55 ? [96, 140, 176] : [74, 112, 150]); if (m <= 0.28 && hash(X, Y, 9) > 0.93) cc = [190, 220, 240]; }
        else if (t === 'C') { cc = rp[tone(nn, bb, 0.1 + (Math.abs(a - 0.5) < 0.3 ? 0.15 : 0))]; }
        else cc = rp[1];
        if (t === 'I') { var gu = Math.abs(u - 0.5), gv = Math.abs(v - 0.5);
          if (gu < 0.24 && gv < 0.24) { cc = (gu > 0.2 || gv > 0.2) ? [176, 176, 182] : ((Math.floor(u * 40) % 2) ? [40, 40, 44] : [96, 96, 104]); } }
        // edges only where there is a step (clean cliff edges, no grid lines on flat ground)
        if (u < 0.035 && stepL) cc = t === 'G' ? [168, 220, 120] : rp[0];
        else if (v < 0.035 && stepT) cc = rp[0];
        else if ((u > 0.965 && stepR) || (v > 0.965 && stepB)) cc = rp[3];
        else if ((u > 0.965 && diffR) || (v > 0.965 && diffB)) cc = rp[2];
        put(X, Y, cc, 1);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- sprite helpers ----------
  function r(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  // Tile local -> buffer: u along +x tile axis, v along +y, from top corner p.
  function at(p, u, v) { return { x: p.x + (u - v) * TW / 2, y: p.y + (u + v) * TH / 2 }; }
  function diamond(ctx, p, inset, col) {
    var a = at(p, inset, inset), b = at(p, 1 - inset, inset), c = at(p, 1 - inset, 1 - inset), d = at(p, inset, 1 - inset);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
  }

  // Draw a control. p = tile top corner; edge = [[x0,y0],[x1,y1]] for fences; prog 0..1 build progress; st = sim status or null; t ms; age (storms)
  function drawControl(ctx, type, p, o) {
    var prog = o.prog == null ? 1 : o.prog, t = o.t || 0, cx = p.x, cy = p.y + TH / 2, q, k;
    if (type === 'fence') {
      var e = o.edge, x0 = e[0][0], y0 = e[0][1], x1 = e[1][0], y1 = e[1][1];
      var mx = cx - (x0 + x1) / 2, my = cy - (y0 + y1) / 2; x0 += mx * 0.22; x1 += mx * 0.22; y0 += my * 0.22; y1 += my * 0.22;
      var n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)), shown = Math.round(n * prog);
      for (q = 0; q <= shown; q++) { var fx = x0 + (x1 - x0) * q / n, fy = y0 + (y1 - y0) * q / n, sag = Math.sin(q / n * Math.PI * 3) * 0.6;
        r(ctx, fx, fy - 12 + sag, 2, 12 - sag, q % 2 ? '#26262a' : '#38383e');           // geotextile fabric
        r(ctx, fx, fy - 12 + sag, 2, 1, '#6a6a74');                                  // top hem
        if (q % 3 === 0) r(ctx, fx, fy - 8 + sag, 1, 1, '#55555e');                 // stitching
        r(ctx, fx, fy, 1, 1, '#5e4024'); }                                           // trenched toe
      var posts = Math.max(2, Math.round(n / 9));
      for (q = 0; q <= posts; q++) { if (q / posts > prog + 1e-6) break; var px = x0 + (x1 - x0) * q / posts, py = y0 + (y1 - y0) * q / posts;
        r(ctx, px - 1, py - 16, 3, 17, '#8a5e2c'); r(ctx, px - 1, py - 16, 1, 17, '#c08a4a'); r(ctx, px - 1, py - 17, 3, 1, '#5a3a1a'); }
    } else if (type === 'dam') {
      var rocks = 90, sh = Math.round(rocks * prog);
      if (sh) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(cx - 26, cy + 2, 54, 4); }
      for (q = 0; q < sh; q++) { var hu = hash(q, 3, 11), hv = hash(q, 5, 11), ax = cx + (hu - 0.5) * 50 - 2, ay = cy - 2 + (hv - 0.5) * 8 - (1 - Math.abs(hu - 0.5) * 2) * 12 * hash(q, 9, 2);
        var tones = ['#e4e4de', '#b4b4ae', '#8e8e88', '#55554f'], sz = 3 + ((q * 7) % 3);
        r(ctx, ax, ay, sz + 1, sz, tones[1 + (q % 2)]); r(ctx, ax, ay, sz, 1, tones[0]); r(ctx, ax + sz, ay + 1, 1, sz - 1, tones[3]); r(ctx, ax, ay + sz, sz + 1, 1, tones[3]); }
      if (prog >= 1) for (q = 0; q < 12; q++) r(ctx, cx - 22 + q * 4, cy - 12 + (q % 2) + Math.abs(q - 6) , 1, 1, '#f0f0f0'); // wire mesh glints
    } else if (type === 'inlet') {
      for (k = 0; k < 4; k++) { if (k / 4 > prog) break;  // 4 coir logs boxing the grate
        var s0 = [[-0.0, 0.18], [0.0, 0.82], [0.18, 0], [0.82, 0]][k];
        for (q = 0; q <= 26; q++) { var f = 0.12 + q / 26 * 0.76, lp = k < 2 ? at(p, f, s0[1]) : at(p, s0[0], f);
          r(ctx, lp.x - 1, lp.y - 6, 3, 7, '#c99a4a'); r(ctx, lp.x - 1, lp.y - 6, 3, 1, '#ecc884'); r(ctx, lp.x - 1, lp.y, 3, 1, '#7a5428'); if (q % 4 === 0) r(ctx, lp.x, lp.y - 5, 1, 5, '#9a7038'); } }
    } else if (type === 'exit') {
      diamond(ctx, p, 0.06, '#9a9a9a');
      var dots = Math.round(140 * prog);
      for (q = 0; q < dots; q++) { var gu = 0.08 + 0.84 * hash(q, 1, 21), gv = 0.08 + 0.84 * hash(q, 2, 21), gp = at(p, gu, gv), tc = ['#e2e2de', '#bdbdb8', '#7a7a76', '#5c5c58'][q % 4]; r(ctx, gp.x, gp.y, 2, 1, tc); }
      if (prog < 1) { ctx.globalAlpha = 1 - prog; diamond(ctx, p, 0.06, '#a87444'); ctx.globalAlpha = 1; }
    } else if (type === 'seed') {
      var age = Math.min(2, o.age || 0);
      if (age > 0) diamond(ctx, p, 0.08, age > 1 ? 'rgba(106,174,69,.85)' : 'rgba(106,174,69,.45)');
      var st = Math.round((110 + age * 40) * prog);
      for (q = 0; q < st; q++) { var su = 0.1 + 0.8 * hash(q, 1, 31), sv = 0.1 + 0.8 * hash(q, 2, 31), sp = at(p, su, sv);
        if (q % 3 || age === 0) { r(ctx, sp.x, sp.y, 3, 1, q % 2 ? '#e6cf7a' : '#cdb35a'); if (q % 5 === 0) r(ctx, sp.x + 1, sp.y - 1, 1, 1, '#f3e3a0'); }
        else { var hgt = 1 + age * 2; r(ctx, sp.x, sp.y - hgt, 1, hgt, '#5fa83f'); r(ctx, sp.x, sp.y - hgt, 1, 1, '#9cdc6a'); } }
    } else if (type === 'basin') {
      var dig = Math.min(1, prog * 1.4), fill = Math.max(0, (prog - 0.5) * 2);
      diamond(ctx, p, 0.0, '#b48654'); diamond(ctx, p, 0.07, '#8a6038'); diamond(ctx, p, 0.13, '#5c3e22');
      if (dig > 0.3) diamond(ctx, p, 0.16 + (1 - dig) * 0.2, '#3f2a17');
      if (fill > 0) { diamond(ctx, p, 0.2 + (1 - fill) * 0.25, '#3c78ad'); diamond(ctx, p, 0.3 + (1 - fill) * 0.2, '#4a88bf');
        for (q = 0; q < 4; q++) { var wp = at(p, 0.35 + 0.3 * hash(q, 1, 41), 0.35 + 0.3 * hash(q, 2, 41)); var ph = ((t / 700 + q * 0.25) % 1); r(ctx, wp.x - 2 + ph * 4, wp.y, 3, 1, '#a8d4f4'); } }
      // berm crest + riser pipe
      for (q = 0; q < 14; q++) { var bp = at(p, 0.03 + q * 0.07, 0.03); r(ctx, bp.x, bp.y, 3, 1, '#d4a674'); var bq = at(p, 0.03, 0.03 + q * 0.07); r(ctx, bq.x - 2, bq.y, 3, 1, '#d4a674'); }
      if (prog >= 1) { var rp = at(p, 0.72, 0.72); r(ctx, rp.x - 2, rp.y - 12, 5, 13, '#8c8c90'); r(ctx, rp.x - 2, rp.y - 12, 5, 2, '#d8d8dc'); r(ctx, rp.x + 2, rp.y - 10, 1, 11, '#5c5c60'); r(ctx, rp.x - 1, rp.y - 12, 3, 1, '#2a2a2e'); }
    } else if (type === 'dike') {
      // compacted earth berm (EC(4): 18 in. high, 2 ft top) running along the downslope edge, built from one end
      var de = o.edge || [[p.x - TW / 2, p.y + TH / 2], [p.x, p.y + TH]], dx0 = de[0][0], dy0 = de[0][1], dx1 = de[1][0], dy1 = de[1][1];
      var dmx = cx - (dx0 + dx1) / 2, dmy = cy - (dy0 + dy1) / 2; dx0 += dmx * 0.35; dx1 += dmx * 0.35; dy0 += dmy * 0.35; dy1 += dmy * 0.35;
      var dn = Math.ceil(Math.hypot(dx1 - dx0, dy1 - dy0)), dsh = Math.round(dn * prog);
      for (q = 0; q <= dsh; q++) { var bx = dx0 + (dx1 - dx0) * q / dn, by = dy0 + (dy1 - dy0) * q / dn, bh = 5 + (hash(q, 2, 61) > 0.7 ? 1 : 0);
        r(ctx, bx - 1, by - bh + 3, 3, 3, 'rgba(0,0,0,.22)');                    // shadow
        r(ctx, bx, by - bh, 2, bh + 1, q % 2 ? '#8a6038' : '#9a6c40');            // side slope
        r(ctx, bx, by - bh, 2, 2, '#c49460');                                      // compacted crown
        if (q % 5 === 0) r(ctx, bx, by - bh - 1, 1, 1, '#7fbf5f'); }               // sod tufts
    } else if (type === 'blanket') {
      // straw blanket with photodegradable netting, unrolled downslope, stapled
      var bn = 14, bs = Math.round(bn * prog);
      for (q = 0; q < bs; q++) for (k = 0; k < 14; k++) { var bp2 = at(p, 0.04 + q * 0.066, 0.04 + k * 0.066); r(ctx, bp2.x - 2, bp2.y, 5, 2, (q + k) % 3 ? '#d9bd6a' : '#c7a654'); if ((q * 7 + k * 3) % 11 === 0) r(ctx, bp2.x, bp2.y, 2, 1, '#f1dc96'); }
      for (q = 0; q <= bs; q += 3) for (k = 0; k < 28; k++) { var np = at(p, 0.04 + q * 0.066, 0.02 + k * 0.034); r(ctx, np.x, np.y, 1, 1, '#9fd06c'); }   // green netting
      for (k = 0; k < 4; k++) { var npp = at(p, 0.04, 0.1 + k * 0.25), nq = at(p, 0.04 + bs * 0.066, 0.1 + k * 0.25); if (bs) { r(ctx, npp.x, npp.y, 1, 1, '#555'); r(ctx, nq.x, nq.y, 1, 1, '#555'); } }   // staples
      if (prog < 1 && bs > 0) { var rl = at(p, 0.04 + bs * 0.066, 0.5); r(ctx, rl.x - 14, rl.y - 4, 28, 5, '#b8963e'); r(ctx, rl.x - 14, rl.y - 4, 28, 1, '#e6cc80'); }   // the roll
    } else if (type === 'psd') {
      // corrugated pipe from the flared inlet down the slope to the outlet (o.to), with hold-downs every ~10 ft
      var to = o.to || { x: cx, y: cy + 40 }, len = Math.hypot(to.x - cx, to.y - cy), pn = Math.max(2, Math.round(len)), psh = Math.round(pn * prog);
      r(ctx, cx - 7, cy - 6, 14, 7, '#7a5a34'); r(ctx, cx - 7, cy - 6, 14, 2, '#a07a48');  // earth dike over the inlet (1 ft above pipe)
      for (q = 0; q <= psh; q++) { var tx = cx + (to.x - cx) * q / pn, ty = cy + (to.y - cy) * q / pn;
        r(ctx, tx - 3, ty - 3, 7, 6, '#2a2a2e'); r(ctx, tx - 3, ty - 3, 7, 1, q % 3 ? '#6a6a72' : '#9a9aa4'); r(ctx, tx - 3, ty + 2, 7, 1, '#141416'); }
      r(ctx, cx - 6, cy - 4, 12, 7, '#b8b8c0'); r(ctx, cx - 5, cy - 3, 10, 5, '#1a1a1c'); r(ctx, cx - 6, cy - 4, 12, 1, '#e8e8f0');  // flared end section
      for (q = 1; q < 5; q++) { if (q / 5 > prog) break; var hx = cx + (to.x - cx) * q / 5, hy = cy + (to.y - cy) * q / 5; r(ctx, hx - 5, hy - 5, 2, 9, '#8a5e2c'); r(ctx, hx + 4, hy - 5, 2, 9, '#8a5e2c'); r(ctx, hx - 5, hy - 5, 11, 1, '#c08a4a'); }
    } else if (type === 'apron') {
      // riprap energy dissipator pad (EC(7) Detail A), stone placed one by one
      diamond(ctx, p, 0.1, 'rgba(0,0,0,.2)');
      var ns = Math.round(70 * prog);
      for (q = 0; q < ns; q++) { var au = 0.12 + 0.76 * hash(q, 1, 81), av = 0.12 + 0.76 * hash(q, 2, 81), ap = at(p, au, av), as = 3 + (q % 3), tn = ['#d6d6d0', '#a8a8a2', '#86867f', '#5a5a54'];
        r(ctx, ap.x, ap.y - as, as + 1, as, tn[1 + (q % 2)]); r(ctx, ap.x, ap.y - as, as, 1, tn[0]); r(ctx, ap.x, ap.y, as + 1, 1, tn[3]); }
    } else if (type === 'washout') {
      var hgt2 = Math.round(10 * prog);
      diamond(ctx, p, 0.12, 'rgba(0,0,0,.25)');
      r(ctx, cx - 17, cy - hgt2 + 1, 34, hgt2 + 4, '#141416'); r(ctx, cx - 16, cy - hgt2 + 2, 32, hgt2 + 2, '#2c2c30'); r(ctx, cx - 16, cy - hgt2 + 2, 32, 1, '#4a4a50');
      if (prog >= 1) { r(ctx, cx - 14, cy - 6, 28, 7, '#9c9c98'); r(ctx, cx - 14, cy - 6, 28, 1, '#d0d0cc'); for (q = 0; q < 7; q++) r(ctx, cx - 13 + q * 4, cy - 3 + (q % 2), 2, 1, '#74746f');
        r(ctx, cx + 15, cy - 22, 2, 16, '#6a4a2a'); r(ctx, cx + 8, cy - 27, 16, 9, '#1c1c1e'); r(ctx, cx + 9, cy - 26, 14, 7, '#ffd400'); r(ctx, cx + 10, cy - 25, 12, 1, '#222'); r(ctx, cx + 10, cy - 23, 9, 1, '#222'); r(ctx, cx + 10, cy - 21, 11, 1, '#222'); }
    }
  }

  // ---------- crew & machines ----------
  // Worker ~6x12 px. f = walk frame, act: 'walk'|'hammer'|'idle', facing -1/1
  function drawWorker(ctx, x, y, f, act, facing, vest) {
    x = Math.round(x); y = Math.round(y);
    r(ctx, x - 3, y - 1, 7, 2, 'rgba(0,0,0,.25)');                               // shadow
    var step = act === 'walk' ? (f % 2) : 0;
    r(ctx, x - 2, y - 4, 2, 4 - step, '#2b3a66'); r(ctx, x + 1, y - 4, 2, 4 - (1 - step) * (act === 'walk' ? 1 : 0), '#2b3a66'); // jeans
    r(ctx, x - 2, y - 1, 2, 1, '#3a2614'); r(ctx, x + 1, y - 1, 2, 1, '#3a2614');  // boots
    r(ctx, x - 3, y - 9, 7, 5, vest || '#ff7a1a'); r(ctx, x - 3, y - 7, 7, 1, '#f4f06a'); // hi-vis vest + reflective stripe
    r(ctx, x - 1, y - 12, 4, 3, '#e0a878'); r(ctx, x + (facing > 0 ? 2 : -1), y - 11, 1, 1, '#3a2614'); // head + eye
    r(ctx, x - 2, y - 14, 6, 2, '#ffd400'); r(ctx, x - 3, y - 12, 8, 1, '#e0b800'); // hard hat + brim
    if (act === 'hammer') { var up = f % 2; r(ctx, x + facing * 4, y - 9 - up * 3, 1, 4, '#6a4a2a'); r(ctx, x + facing * 4 - 1, y - 10 - up * 3, 3, 2, '#707078'); }
    else r(ctx, x + facing * 4, y - 8, 1, 3, '#e0a878');
  }
  function drawExcavator(ctx, x, y, ph) {
    x = Math.round(x); y = Math.round(y);
    r(ctx, x - 14, y - 2, 28, 4, 'rgba(0,0,0,.25)');
    r(ctx, x - 12, y - 5, 24, 4, '#2c2c30'); for (var q = 0; q < 6; q++) r(ctx, x - 11 + q * 4, y - 4, 2, 2, '#55555a'); // tracks
    r(ctx, x - 9, y - 13, 16, 8, '#f2b417'); r(ctx, x - 9, y - 13, 16, 1, '#ffd65a'); r(ctx, x - 9, y - 6, 16, 1, '#b07e0a'); // body
    r(ctx, x - 7, y - 19, 7, 6, '#f2b417'); r(ctx, x - 6, y - 18, 5, 4, '#9fd2f0'); r(ctx, x - 6, y - 18, 5, 1, '#d8f0ff'); // cab
    var a = Math.sin(ph) * 0.35, bx = x + 6, by = y - 12, ex = bx + Math.cos(-0.9 + a) * 13, ey = by + Math.sin(-0.9 + a) * 13;
    for (q = 0; q <= 10; q++) r(ctx, bx + (ex - bx) * q / 10, by + (ey - by) * q / 10, 2, 2, '#e0a412');
    var sx = ex + Math.cos(0.9 + a * 2) * 10, sy = ey + Math.sin(0.9 + a * 2) * 10;
    for (q = 0; q <= 8; q++) r(ctx, ex + (sx - ex) * q / 8, ey + (sy - ey) * q / 8, 2, 2, '#d09a10');
    r(ctx, sx - 2, sy - 1, 5, 4, '#4a4a50'); r(ctx, sx - 2, sy + 3, 5, 1, '#2a2a2e');
  }
  function drawTruck(ctx, x, y, dir, mud) { // dir: +1 faces screen-right/down
    x = Math.round(x); y = Math.round(y); var s = dir >= 0 ? 1 : -1;
    r(ctx, x - 14, y - 1, 28, 4, 'rgba(0,0,0,.25)');
    r(ctx, x - 12 * s - (s < 0 ? 12 : 0), y - 13, 15, 10, '#d0451b'); r(ctx, x - 12 * s - (s < 0 ? 12 : 0), y - 13, 15, 1, '#f06a3a'); // dump bed
    r(ctx, x - 12 * s - (s < 0 ? 12 : 0) + 1, y - 14, 13, 2, mud ? '#7a5228' : '#8a8a8a');
    r(ctx, x + (s > 0 ? 4 : -12), y - 12, 8, 9, '#e8e8e0'); r(ctx, x + (s > 0 ? 7 : -11), y - 11, 4, 3, '#8fc8ee'); // cab + window
    r(ctx, x - 12, y - 4, 24, 2, '#3a3a3e');
    [-9, -4, 7].forEach(function (wx) { r(ctx, x + wx * s - 2, y - 3, 4, 4, '#1c1c1e'); r(ctx, x + wx * s - 1, y - 2, 2, 2, '#8a8a90'); if (mud) r(ctx, x + wx * s - 2, y, 4, 1, '#6a4422'); });
  }
  function drawCone(ctx, x, y) { x = Math.round(x); y = Math.round(y); r(ctx, x - 3, y, 7, 1, '#d9601a'); r(ctx, x - 2, y - 2, 5, 2, '#ff7a1a'); r(ctx, x - 2, y - 3, 5, 1, '#fff'); r(ctx, x - 1, y - 5, 3, 2, '#ff7a1a'); r(ctx, x, y - 6, 1, 1, '#ffa04a'); r(ctx, x - 1, y - 4, 1, 3, '#ffb070'); }

  var api = { TW: TW, TH: TH, BASE: BASE, drawTerrain: drawTerrain, drawControl: drawControl, drawWorker: drawWorker, drawExcavator: drawExcavator,
    drawTruck: drawTruck, drawCone: drawCone, at: at, diamond: diamond, hash: hash, rect: r };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SWP3Art = api;
})(this);
