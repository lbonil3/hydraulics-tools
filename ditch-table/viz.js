(function (root) {
  function renderSection(el, row) {
    if (!el) return;
    if (!row || row.Dd == null || !(Number(row.Dd) > 0)) {
      el.innerHTML = '<p class="viz-empty">Enter section dimensions (Dd, Z, B)</p>';
      return;
    }
    const B = Number(row.B) || 0;
    const Z1 = Number(row.Z1) || 0;
    const Z2 = Number(row.Z2) || 0;
    const Dd = Number(row.Dd);
    const yd = row.flowDepth != null && Number(row.flowDepth) > 0 ? Number(row.flowDepth) : null;
    const left = Z1 * Dd;
    const right = Z2 * Dd;
    const topW = B + left + right;
    const pad = 24;
    const W = 320;
    const H = 180;
    const scale = Math.min((W - 2 * pad) / Math.max(topW, 1), (H - 2 * pad) / Math.max(Dd, 1));
    const midX = W / 2;
    const bedY = H - pad;
    const BL = { x: midX - (B * scale) / 2, y: bedY };
    const BR = { x: midX + (B * scale) / 2, y: bedY };
    const TL = { x: BL.x - left * scale, y: bedY - Dd * scale };
    const TR = { x: BR.x + right * scale, y: bedY - Dd * scale };
    let water = '';
    if (yd != null) {
      const yW = bedY - yd * scale;
      const leftX = BL.x - Z1 * yd * scale;
      const rightX = BR.x + Z2 * yd * scale;
      water =
        '<polygon fill="#4a9fe0" fill-opacity="0.35" stroke="#2b6ea3" stroke-width="1" points="' +
        leftX + ',' + yW + ' ' + BL.x + ',' + bedY + ' ' + BR.x + ',' + bedY + ' ' + rightX + ',' + yW +
        '"/>';
    }
    const poly =
      '<polygon fill="#eef5ff" stroke="#1f4e79" stroke-width="2" points="' +
      TL.x + ',' + TL.y + ' ' + BL.x + ',' + BL.y + ' ' + BR.x + ',' + BR.y + ' ' + TR.x + ',' + TR.y +
      '"/>';
    const labels =
      '<text x="' + midX + '" y="' + (bedY + 16) + '" text-anchor="middle" font-size="11" fill="#556">B=' + B +
      ' · Z1=' + Z1 + ' · Z2=' + Z2 + ' · Dd=' + Dd +
      (yd != null ? ' · yd=' + yd.toFixed(2) : '') + '</text>';
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ditch cross-section">' +
      poly + water + labels + '</svg>';
  }

  function parseSta(s) {
    const M = typeof window !== 'undefined' ? window.DitchTableModel : null;
    if (M && M.parseStation) return M.parseStation(s);
    if (s == null || s === '') return null;
    const m = String(s).trim().match(/^(\d+)\+(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function renderProfile(el, rows) {
    if (!el) return;
    rows = rows || [];
    const segs = [];
    const wselPts = [];
    rows.forEach(function (r) {
      const x0 = parseSta(r.staFrom);
      const x1 = parseSta(r.staTo);
      if (x0 == null || x1 == null) return;
      if (r.flFrom != null && r.flTo != null) {
        segs.push({ x0: x0, y0: Number(r.flFrom), x1: x1, y1: Number(r.flTo) });
      }
      if (r.WSEL != null && Number.isFinite(Number(r.WSEL))) {
        wselPts.push({ x: x1, y: Number(r.WSEL) });
      }
    });
    if (!segs.length) {
      el.innerHTML = '<p class="viz-empty">Enter flow-line elevations to see the profile</p>';
      return;
    }
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    segs.forEach(function (s) {
      xmin = Math.min(xmin, s.x0, s.x1);
      xmax = Math.max(xmax, s.x0, s.x1);
      ymin = Math.min(ymin, s.y0, s.y1);
      ymax = Math.max(ymax, s.y0, s.y1);
    });
    wselPts.forEach(function (p) {
      ymin = Math.min(ymin, p.y);
      ymax = Math.max(ymax, p.y);
    });
    if (ymax - ymin < 0.5) { ymax += 0.25; ymin -= 0.25; }
    const W = 320, H = 180, pad = 36;
    const sx = function (x) { return pad + ((x - xmin) / Math.max(xmax - xmin, 1e-6)) * (W - 2 * pad); };
    const sy = function (y) { return H - pad - ((y - ymin) / Math.max(ymax - ymin, 1e-6)) * (H - 2 * pad); };
    let path = '';
    segs.forEach(function (s, i) {
      path += (i === 0 ? 'M' : 'L') + sx(s.x0) + ',' + sy(s.y0) + ' L' + sx(s.x1) + ',' + sy(s.y1) + ' ';
    });
    const dots = wselPts.map(function (p) {
      return '<circle cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="3.5" fill="#4a9fe0" stroke="#1f4e79"/>';
    }).join('');
    const legend =
      '<text x="' + pad + '" y="14" font-size="11" fill="#1f4e79">FL</text>' +
      '<line x1="' + (pad + 18) + '" y1="10" x2="' + (pad + 40) + '" y2="10" stroke="#1f4e79" stroke-width="2"/>' +
      '<text x="' + (pad + 50) + '" y="14" font-size="11" fill="#2b6ea3">WSEL</text>' +
      '<circle cx="' + (pad + 92) + '" cy="10" r="3.5" fill="#4a9fe0"/>';
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ditch profile">' +
      legend +
      '<path d="' + path + '" fill="none" stroke="#1f4e79" stroke-width="2"/>' +
      dots +
      '</svg>';
  }

  const API = { renderSection, renderProfile };
  if (typeof module !== 'undefined') module.exports = API;
  else root.DitchTableViz = API;
})(typeof window !== 'undefined' ? window : globalThis);
