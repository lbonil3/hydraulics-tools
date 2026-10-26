/* Opportunity Radar: self-contained canvas map (no external libraries or tiles).
   Draws Texas county outlines, project pins (color by agency or stage, size by known cost), an optional radar sweep,
   drag / pinch / wheel zoom, and tap-to-pick. */
(function (root) {
  'use strict';
  var COS0 = Math.cos(31 * Math.PI / 180);
  function RadarMap(canvas, geo, opts) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.geo = geo || { counties: [], state: [] };
    this.pts = []; this.cx = -99.3; this.cy = 31.2; this.s = 30; this.dpr = 1; this.W = 0; this.H = 0;
    this.sweep = opts && opts.sweep !== false; this.angle = -Math.PI / 2; this.ptr = {}; this.last = 0; this.dirty = true; this.visible = true;
    this.onPick = (opts && opts.onPick) || function () {}; this.onMove = (opts && opts.onMove) || function () {};
    this.reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (this.reduced) this.sweep = false;
    this._bind(); this.resize(); var self = this; this._raf = null; this._tick = function (t) { self._frame(t); };
    this._schedule();
  }
  var P = RadarMap.prototype;
  P.setPoints = function (pts) { this.pts = pts; this.dirty = true; this._schedule(); };
  P.setSweep = function (on) { this.sweep = !!on; this.dirty = true; this._schedule(); };
  P.setVisible = function (v) { this.visible = v; if (v) { this.resize(); this._schedule(); } };
  P.resize = function () {
    var r = this.c.getBoundingClientRect(); if (!r.width || !r.height) return;
    this.dpr = Math.min(2, root.devicePixelRatio || 1); this.W = r.width; this.H = r.height;
    this.c.width = Math.round(r.width * this.dpr); this.c.height = Math.round(r.height * this.dpr); this.dirty = true;
  };
  P.fit = function (name) {
    if (name === 'hou') { this.cx = -95.4; this.cy = 29.75; this.s = Math.max(60, this.H / 1.7); }
    else { this.cx = -99.3; this.cy = 31.2; this.s = Math.max(14, Math.min(this.W / 11.6, this.H / 11.4)); }
    this.dirty = true; this._schedule();
  };
  P.proj = function (lon, lat) { return [this.W / 2 + (lon - this.cx) * this.s * COS0, this.H / 2 - (lat - this.cy) * this.s]; };
  P.unproj = function (x, y) { return [this.cx + (x - this.W / 2) / (this.s * COS0), this.cy - (y - this.H / 2) / this.s]; };
  P.zoomAt = function (x, y, k) {
    var ll = this.unproj(x, y); var ns = Math.max(12, Math.min(9000, this.s * k)); this.s = ns;
    this.cx = ll[0] - (x - this.W / 2) / (ns * COS0); this.cy = ll[1] + (y - this.H / 2) / ns; this.dirty = true; this._schedule(); this.onMove();
  };
  P._bind = function () {
    var self = this, c = this.c;
    function pos(e) { var r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    c.addEventListener('pointerdown', function (e) { c.setPointerCapture(e.pointerId); var p = pos(e); self.ptr[e.pointerId] = { x: p[0], y: p[1], sx: p[0], sy: p[1], t: Date.now() }; self.moved = 0; self.pinch = null; });
    c.addEventListener('pointermove', function (e) {
      var o = self.ptr[e.pointerId]; if (!o) return; var p = pos(e), ids = Object.keys(self.ptr);
      if (ids.length === 1) { var dx = p[0] - o.x, dy = p[1] - o.y; self.moved += Math.abs(dx) + Math.abs(dy); self.cx -= dx / (self.s * COS0); self.cy += dy / self.s; o.x = p[0]; o.y = p[1]; self.dirty = true; self._schedule(); self.onMove(); }
      else if (ids.length === 2) {
        o.x = p[0]; o.y = p[1]; var a = self.ptr[ids[0]], b = self.ptr[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (self.pinch) { self.zoomAt(mx, my, d / self.pinch.d); self.cx -= (mx - self.pinch.mx) / (self.s * COS0); self.cy += (my - self.pinch.my) / self.s; }
        self.pinch = { d: d, mx: mx, my: my }; self.moved += 20;
      }
    });
    function up(e) {
      var o = self.ptr[e.pointerId]; if (!o) return; var p = pos(e), wasOne = Object.keys(self.ptr).length === 1; delete self.ptr[e.pointerId]; if (Object.keys(self.ptr).length < 2) self.pinch = null;
      if (wasOne && self.moved < 8 && Date.now() - o.t < 600) self._tap(p[0], p[1]);
    }
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', function (e) { delete self.ptr[e.pointerId]; self.pinch = null; });
    c.addEventListener('wheel', function (e) { e.preventDefault(); var p = pos(e); self.zoomAt(p[0], p[1], e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    c.addEventListener('dblclick', function (e) { var p = pos(e); self.zoomAt(p[0], p[1], 2); });
    root.addEventListener('resize', function () { self.resize(); self._schedule(); });
    if (root.ResizeObserver) new ResizeObserver(function () { self.resize(); self._schedule(); }).observe(c);
  };
  P._tap = function (x, y) {
    var hits = [], rad = 18;
    for (var i = 0; i < this.pts.length; i++) {
      var q = this.pts[i], p = this.proj(q.lon, q.lat), d = Math.hypot(p[0] - x, p[1] - y);
      if (d <= Math.max(rad, q.r + 8)) hits.push([d, q]);
    }
    hits.sort(function (a, b) { return a[0] - b[0]; });
    this.onPick(hits.slice(0, 12).map(function (h) { return h[1].id; }), hits.length);
  };
  P._schedule = function () { if (this._raf === null && this.visible) this._raf = root.requestAnimationFrame(this._tick); };
  P._frame = function (t) {
    this._raf = null; if (!this.visible || !this.W) return;
    if (this.sweep) { if (this.last) this.angle += ((t - this.last) / 7000) * Math.PI * 2; this.last = t; if (t - (this._lt || 0) < 30) { this._schedule(); return; } this._lt = t; }
    else this.last = 0;
    this.draw();
    if (this.sweep) this._schedule();
  };
  P.draw = function () {
    var ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr, self = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, '#0a1f1a'); g.addColorStop(1, '#040807'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // range rings + crosshair
    ctx.strokeStyle = 'rgba(94,234,212,.10)'; ctx.lineWidth = 1;
    for (var k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, k * Math.min(W, H) * 0.2, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    // counties
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(94,234,212,' + (this.s > 120 ? '.28' : '.14') + ')';
    var cs = this.geo.counties || [], i, j, r, p;
    ctx.beginPath();
    for (i = 0; i < cs.length; i++) for (r = 0; r < cs[i].r.length; r++) { var ring = cs[i].r[r]; for (j = 0; j < ring.length; j++) { p = this.proj(ring[j][0], ring[j][1]); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,255,214,.7)'; ctx.lineWidth = 1.6; ctx.beginPath();
    (this.geo.state || []).forEach(function (ring) { for (var j = 0; j < ring.length; j++) { var p = self.proj(ring[j][0], ring[j][1]); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.closePath(); });
    ctx.stroke();
    // county labels when zoomed in
    if (this.s > 150) {
      ctx.fillStyle = 'rgba(147,170,164,.55)'; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center';
      for (i = 0; i < cs.length; i++) { var cc = this.geo._cent && this.geo._cent[cs[i].n]; if (!cc) continue; p = this.proj(cc[0], cc[1]); if (p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H) ctx.fillText(cs[i].n, p[0], p[1]); }
    }
    // sweep wedge
    var sa = this.angle, R = Math.hypot(W, H) / 2;
    if (this.sweep) {
      if (ctx.createConicGradient) {
        var cg = ctx.createConicGradient(sa - 1.1, W / 2, H / 2); cg.addColorStop(0, 'rgba(94,234,212,0)'); cg.addColorStop(1.1 / (Math.PI * 2), 'rgba(94,234,212,.22)'); cg.addColorStop(1.1 / (Math.PI * 2) + 0.001, 'rgba(94,234,212,0)'); cg.addColorStop(1, 'rgba(94,234,212,0)');
        ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
      }
      ctx.strokeStyle = 'rgba(94,234,212,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + Math.cos(sa) * R, H / 2 + Math.sin(sa) * R); ctx.stroke();
    }
    // pins
    var pts = this.pts, zf = Math.max(0.55, Math.min(1.9, 0.75 + Math.log(this.s / 40) * 0.35)), TWO = Math.PI * 2;
    for (i = 0; i < pts.length; i++) {
      var q = pts[i]; p = this.proj(q.lon, q.lat); var x = p[0], y = p[1]; if (x < -12 || x > W + 12 || y < -12 || y > H + 12) continue;
      var rr = q.r * zf, glow = 0;
      if (this.sweep) { var a = Math.atan2(y - H / 2, x - W / 2), d = (sa - a) % TWO; if (d < 0) d += TWO; if (d < 1.3) glow = 1 - d / 1.3; }
      ctx.fillStyle = q.color; ctx.globalAlpha = (q.approx ? 0.4 : 0.72); ctx.beginPath(); ctx.arc(x, y, rr, 0, TWO); ctx.fill();
      if (glow > 0.02) { ctx.globalAlpha = 0.45 * glow; ctx.beginPath(); ctx.arc(x, y, rr + 3 + glow * 6, 0, TWO); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < pts.length; i++) {
      q = pts[i]; if (!q.watch && !q.approx) continue; p = this.proj(q.lon, q.lat); if (p[0] < -12 || p[0] > W + 12 || p[1] < -12 || p[1] > H + 12) continue;
      ctx.lineWidth = q.watch ? 2.2 : 1; ctx.strokeStyle = q.watch ? '#fbbf24' : q.color; ctx.setLineDash(q.watch ? [] : [3, 3]); ctx.beginPath(); ctx.arc(p[0], p[1], q.r * zf + (q.watch ? 4 : 2.5), 0, TWO); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (this.focus) { p = this.proj(this.focus.lon, this.focus.lat); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, TWO); ctx.stroke(); }
  };
  RadarMap.centroids = function (geo) { return geo; };
  root.RadarMap = RadarMap;
})(typeof self !== 'undefined' ? self : this);
