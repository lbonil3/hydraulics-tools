(function (root) {
  function pathFromOutfall(analyzed, endNodeId) {
    if (!analyzed || !analyzed.outfallId || !endNodeId) return [];
    const parent = Object.create(null);
    (analyzed.pipes || []).forEach(function (p) {
      parent[p.fromId] = p.toId;
    });
    const up = [];
    let cur = endNodeId;
    const guard = Object.create(null);
    while (cur && !guard[cur]) {
      guard[cur] = true;
      up.push(cur);
      if (cur === analyzed.outfallId) break;
      cur = parent[cur];
    }
    if (up[up.length - 1] !== analyzed.outfallId) return [];
    return up.reverse();
  }

  function pipesAlong(analyzed, pathNodeIds) {
    const out = [];
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const dn = pathNodeIds[i];
      const up = pathNodeIds[i + 1];
      const p = (analyzed.pipes || []).find(function (x) {
        return x.fromId === up && x.toId === dn;
      });
      if (p) out.push(p);
    }
    return out;
  }

  function crownOf(p) {
    if (p.shape === 'box') return Number(p.rise) || 0;
    return Number(p.diameter) || 0;
  }

  function renderProfile(el, analyzed, pathNodeIds) {
    if (!el) return;
    if (!analyzed) {
      el.innerHTML = '<p class="viz-empty">No network</p>';
      return;
    }
    if (analyzed.warnings && analyzed.warnings.some(function (w) { return /TW|outfall/i.test(w); }) &&
        (analyzed.pipes || []).every(function (p) { return p.HGLup == null; })) {
      el.innerHTML = '<p class="viz-empty">Set outfall water-surface elevation (TW) to draw HGL</p>';
      return;
    }
    pathNodeIds = pathNodeIds || [];
    if (pathNodeIds.length < 2) {
      el.innerHTML = '<p class="viz-empty">Select a path end node to sketch the profile</p>';
      return;
    }
    const segs = pipesAlong(analyzed, pathNodeIds);
    if (!segs.length) {
      el.innerHTML = '<p class="viz-empty">Incomplete connectivity along selected path</p>';
      return;
    }
    const nodeById = Object.create(null);
    (analyzed.nodes || []).forEach(function (n) { nodeById[n.id] = n; });

    let x = 0;
    const inv = [];
    const crown = [];
    const rim = [];
    const hgl = [];
    const labels = [];
    const of = nodeById[pathNodeIds[0]];
    inv.push({ x: 0, y: of && of.invert != null ? Number(of.invert) : segs[0].ieDn });
    rim.push({ x: 0, y: of && of.rim != null ? Number(of.rim) : null });
    hgl.push({
      x: 0,
      y: of && of.HGL != null ? Number(of.HGL) : (segs[0].HGLdn != null ? Number(segs[0].HGLdn) : null)
    });
    crown.push({ x: 0, y: inv[0].y != null ? inv[0].y + crownOf(segs[0]) : null });
    labels.push({ x: 0, name: (of && of.name) || pathNodeIds[0] });

    segs.forEach(function (p) {
      const L = Number(p.length) || 0;
      x += L;
      const upN = nodeById[p.fromId];
      inv.push({
        x: x,
        y: p.ieUp != null ? Number(p.ieUp) : (upN && upN.invert != null ? Number(upN.invert) : null)
      });
      crown.push({ x: x, y: inv[inv.length - 1].y != null ? inv[inv.length - 1].y + crownOf(p) : null });
      rim.push({ x: x, y: upN && upN.rim != null ? Number(upN.rim) : null });
      hgl.push({
        x: x,
        y: p.HGLup != null ? Number(p.HGLup) : (upN && upN.HGL != null ? Number(upN.HGL) : null)
      });
      labels.push({ x: x, name: (upN && upN.name) || p.fromId });
    });

    const ys = [];
    [inv, crown, rim, hgl].forEach(function (arr) {
      arr.forEach(function (pt) {
        if (pt.y != null && Number.isFinite(pt.y)) ys.push(pt.y);
      });
    });
    if (!ys.length) {
      el.innerHTML = '<p class="viz-empty">Enter invert / rim elevations to see the profile</p>';
      return;
    }
    let xmin = 0, xmax = x, ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    if (ymax - ymin < 0.5) { ymax += 0.25; ymin -= 0.25; }
    const W = 360, H = 200, padL = 44, padR = 12, padT = 28, padB = 36;
    const sx = function (v) {
      return padL + ((v - xmin) / Math.max(xmax - xmin, 1e-6)) * (W - padL - padR);
    };
    const sy = function (v) {
      return H - padB - ((v - ymin) / Math.max(ymax - ymin, 1e-6)) * (H - padT - padB);
    };
    function poly(arr, stroke, width, dash) {
      const pts = arr.filter(function (pt) { return pt.y != null; });
      if (pts.length < 2) return '';
      let d = 'M' + sx(pts[0].x) + ',' + sy(pts[0].y);
      for (let i = 1; i < pts.length; i++) d += ' L' + sx(pts[i].x) + ',' + sy(pts[i].y);
      return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + width + '"' +
        (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
    }
    const legend =
      '<text x="' + padL + '" y="14" font-size="11" fill="#1f4e79">Invert</text>' +
      '<line x1="' + (padL + 40) + '" y1="10" x2="' + (padL + 62) + '" y2="10" stroke="#1f4e79" stroke-width="2"/>' +
      '<text x="' + (padL + 70) + '" y="14" font-size="11" fill="#6b7280">Crown</text>' +
      '<line x1="' + (padL + 112) + '" y1="10" x2="' + (padL + 134) + '" y2="10" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<text x="' + (padL + 142) + '" y="14" font-size="11" fill="#2b6ea3">HGL</text>' +
      '<line x1="' + (padL + 172) + '" y1="10" x2="' + (padL + 194) + '" y2="10" stroke="#4a9fe0" stroke-width="2.5"/>' +
      '<text x="' + (padL + 202) + '" y="14" font-size="11" fill="#15803d">Rim</text>' +
      '<line x1="' + (padL + 230) + '" y1="10" x2="' + (padL + 252) + '" y2="10" stroke="#15803d" stroke-width="1.5" stroke-dasharray="2 2"/>';
    const lab = labels.map(function (L) {
      return '<text x="' + sx(L.x) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#556">' +
        String(L.name).replace(/</g, '') + '</text>';
    }).join('');
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Storm sewer HGL profile">' +
      legend +
      poly(rim, '#15803d', 1.5, '2 2') +
      poly(crown, '#6b7280', 1.5, '4 3') +
      poly(inv, '#1f4e79', 2) +
      poly(hgl, '#4a9fe0', 2.5) +
      lab +
      '</svg>';
  }

  const API = { renderProfile: renderProfile, pathFromOutfall: pathFromOutfall, pipesAlong: pipesAlong };
  if (typeof module !== 'undefined') module.exports = API;
  else root.StormViz = API;
})(typeof window !== 'undefined' ? window : globalThis);
