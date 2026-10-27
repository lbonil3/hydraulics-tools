/* Storm Designer - stored solutions, alternate 3-star plans and naive plans.
   Plans use tile coordinates [x, y]; build() turns them into sim controls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlowSolutions = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var HDM = 'TxDOT HDM (9/2019)';
  function inl(x, y, len) { return { type: 'inlet', x: x, y: y, len: len }; }
  function pipe(pts, dia) { return { type: 'pipe', pts: pts, dia: dia }; }
  function ditch(x, y, lining) { return { type: 'ditch', x: x, y: y, lining: lining }; }
  function ditchRun(x, y0, y1, f) { var o = []; for (var y = y0; y <= y1; y++) o.push(ditch(x, y, f(y))); return o; }
  function culvert(dia, barrels) { return { type: 'culvert', dia: dia, barrels: barrels }; }
  function pond(blocks) { return blocks.map(function (b) { return { type: 'pond', x: b[0], y: b[1] }; }); }
  function outlet(orif, weir) { return { type: 'outlet', orif: orif, weir: weir }; }
  var P7 = [[11, 5], [12, 5], [11, 6], [12, 6], [11, 7], [12, 7], [11, 8], [12, 8], [9, 7], [10, 7]];
  var P8 = []; [9, 8, 7, 6].forEach(function (y) { [8, 7, 9, 10].forEach(function (x) { P8.push([x, y]); }); });
  var L8inl = [inl(2, 2, 10), inl(5, 2, 10), inl(8, 2, 10), inl(11, 2, 15), inl(5, 5, 10), inl(5, 7, 10), inl(5, 8, 5)];
  var L8pipes = [pipe([[2, 2], [3, 2], [4, 2], [5, 2]], 18), pipe([[11, 2], [10, 2], [9, 2], [8, 2]], 18), pipe([[8, 2], [7, 2], [6, 2], [5, 2]], 24),
    pipe([[5, 2], [5, 3], [5, 4], [5, 5]], 30), pipe([[5, 5], [5, 6], [5, 7], [5, 8]], 36), pipe([[5, 8], [6, 8], [7, 8]], 36)];
  var L8ditch = ditchRun(13, 0, 9, function () { return 'grass'; });

  var SOL = {
    1: { steps: [
      { place: [inl(5, 3, 10)], why: 'Spread grows downhill; it first passes 12 ft around the middle of the block, so the first inlet goes there.', basis: HDM + ' Ch.10 Sec.4 Ponding: spread limit; TxDOT curb inlet on grade (HEC-22 method in the Drainage tool).' },
      { place: [inl(9, 3, 15)], why: 'The lower half collects the bypass plus new runoff; a 15-ft (14-ft) inlet at the end keeps the spread in limits and lets almost nothing run off the project.', basis: 'Game rule: bypass leaving the project under ~0.5 cfs.(game target).' }],
      alt: [inl(3, 3, 5), inl(6, 3, 5), inl(9, 3, 10)], naive: [inl(9, 3, 5)] },
    2: { steps: [
      { place: [inl(3, 3, 10)], why: 'Catch the upper block before its spread passes the limit.', basis: HDM + ' Ch.10 Sec.4 spread limit.' },
      { place: [inl(9, 3, 5)], why: 'A short inlet is fine where the gutter flow is still small; its bypass carries over to the next inlet.', basis: 'HEC-22 / TxDOT on-grade curb inlet efficiency (Drainage tool curbGrade).' },
      { place: [inl(14, 3, 15)], why: 'The last inlet takes the carryover plus the lower block; a long inlet keeps the bypass leaving the project under 0.5 cfs.', basis: 'Game rule: bypass leaving the project under ~0.5 cfs.' }],
      alt: [inl(6, 3, 10), inl(9, 3, 10), inl(14, 3, 10)], naive: [inl(5, 3, 5), inl(9, 3, 5), inl(12, 3, 5), inl(14, 3, 5)] },
    3: { steps: [
      { place: [inl(5, 2, 15)], why: 'The low point: TxDOT says put inlets at all low points. A 15-ft sag inlet keeps the ponded spread inside the limit.', basis: HDM + ' Ch.10 Sec.4 Ponding (inlets at low points); sag inlet weir/orifice (Drainage tool curbSag).' },
      { place: [pipe([[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]], 24)], why: 'All of the sag flow goes into this pipe; with the creek high, 18 in surcharges. A 24-in RCP keeps the HGL below the inlet throat.', basis: HDM + ' Ch.10 Sec.2 (d) HGL below critical elevations; Storm Drain tool HGL (HEC-22).' }],
      alt: [inl(4, 2, 10), inl(5, 2, 10), pipe([[4, 2], [5, 2]], 18), pipe([[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]], 24)],
      naive: [inl(5, 2, 5), pipe([[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]], 18)] },
    4: { steps: [
      { place: [inl(2, 2, 10), inl(5, 3, 10), inl(7, 2, 10), inl(10, 2, 15)], why: 'Inlets where each street\u2019s spread reaches the limit, and before the side street joins the main street.', basis: HDM + ' Ch.10 Sec.4.' },
      { place: [pipe([[2, 2], [3, 2], [4, 2], [5, 2]], 18), pipe([[5, 3], [5, 2]], 18)], why: 'Two 18-in branches meet at a junction box at (5,2).', basis: 'Junction losses: HEC-22 (Storm Drain tool).' },
      { place: [pipe([[5, 2], [6, 2], [7, 2]], 24)], why: 'Below the junction the trunk carries both branches: go up to 24 in.', basis: HDM + ' Ch.10 Sec.2 (c) non-pressure flow.' },
      { place: [pipe([[7, 2], [7, 3], [8, 3], [9, 3], [9, 2], [10, 2], [11, 2]], 30)], why: 'A buried utility sits under (8,2): detour the 30-in trunk around it to the outfall.', basis: 'Game rule: utility conflict; HDM Ch.10 Sec.2 cover and HGL checks.' }],
      alt: [inl(2, 2, 15), inl(5, 3, 10), inl(7, 2, 10), inl(10, 2, 10), pipe([[2, 2], [3, 2], [4, 2], [5, 2]], 18), pipe([[5, 3], [5, 2]], 18), pipe([[5, 2], [6, 2], [7, 2]], 30), pipe([[7, 2], [7, 3], [8, 3], [9, 3], [9, 2], [10, 2], [11, 2]], 30)],
      naive: [inl(2, 2, 10), inl(5, 3, 10), inl(7, 2, 10), inl(10, 2, 15), pipe([[2, 2], [3, 2], [4, 2], [5, 2]], 18), pipe([[5, 3], [5, 2]], 18), pipe([[5, 2], [6, 2], [7, 2]], 18), pipe([[7, 2], [7, 3], [8, 3], [9, 3], [9, 2], [10, 2], [11, 2]], 18)] },
    5: { steps: [
      { place: ditchRun(3, 0, 4, function () { return 'grass'; }), why: 'Upper reach is flat: grass holds.', basis: HDM + ' Ch.7 Sec.3: permissible shear, retardance D grass 0.60 lb/sf.' },
      { place: ditchRun(3, 5, 9, function () { return 'mat'; }), why: 'The steep reach (3%+) scours grass; a synthetic mat (2.00 lb/sf) holds.', basis: HDM + ' Ch.7 Sec.3 Eq 7-2 shear = 62.4 d S; HEC-15.' },
      { place: ditchRun(3, 10, 13, function () { return 'grass'; }), why: 'Flat again toward the creek: back to cheap grass.', basis: HDM + ' Ch.7 Sec.3.' }],
      alt: ditchRun(3, 0, 13, function (y) { return y >= 5 && y < 10 ? 'rock' : 'grass'; }), naive: ditchRun(3, 0, 13, function () { return 'grass'; }) },
    6: { steps: [
      { place: [culvert(54, 2)], why: 'Two 54-in barrels pass 225 cfs with headwater below the road edge (El. 96.0), and still fit the budget after the cut.', basis: HDM + ' Ch.8 Sec.2 allowable headwater; Table 4-2 25-yr design; HDS-5 (Culvert tool).' }],
      alt: [culvert(60, 2)], naive: [culvert(48, 1)] },
    7: { steps: [
      { place: pond(P7.slice(0, 8)), why: 'Eight blocks around the outfall store the extra runoff.', basis: HDM + ' Ch.10 Sec.3: detention changes the rate, not the volume.' },
      { place: [outlet(12, 4)], why: 'A 12-in orifice releases less than the 5.3 cfs pre-development peak; the weir is a safety spill.', basis: 'Game rule: post peak <= pre peak; orifice/weir equations (HEC-22 Ch.10).' }],
      alt: pond(P7.slice(0, 7)).concat([outlet(9, 4)]), naive: pond(P7.slice(0, 3)).concat([outlet(12, 4)]) },
    8: { steps: [
      { place: L8inl, why: 'Inlets on both streets at the spread limit, plus the end tiles.', basis: HDM + ' Ch.10 Sec.4.' },
      { place: L8pipes, why: 'Branches grow into a 36-in trunk down the side street to the pond outfall.', basis: HDM + ' Ch.10 Sec.2; Storm Drain tool HGL.' },
      { place: L8ditch, why: 'Ditch the collector road so its runoff doesn\u2019t cross the east lots.', basis: HDM + ' Ch.7 Sec.3.' },
      { place: [culvert(60, 2)], why: 'Crossing: 2 x 60 in for the 25-yr storm and the 100-yr check.', basis: HDM + ' Table 4-2 note: evaluate to the 1% AEP; Ch.8 Sec.2.' },
      { place: pond(P8.slice(0, 10)).concat([outlet(12, 4)]), why: 'Ten pond blocks with a 12-in orifice keep the post-development peak under pre-development.', basis: HDM + ' Ch.10 Sec.3.' }],
      alt: L8inl.concat(L8pipes, L8ditch, [culvert(72, 1)], pond(P8.slice(0, 8)), [outlet(9, 4)]),
      naive: L8inl.concat(L8pipes, L8ditch, [culvert(60, 2)]) }
  };

  function build(L, plan) {
    var out = [], W = L.W;
    plan.forEach(function (p) {
      if (p.type === 'pipe') { for (var k = 0; k + 1 < p.pts.length; k++) out.push({ type: 'pipe', a: p.pts[k][1] * W + p.pts[k][0], b: p.pts[k + 1][1] * W + p.pts[k + 1][0], dia: p.dia }); }
      else if (p.type === 'inlet') out.push({ type: 'inlet', tile: p.y * W + p.x, len: p.len });
      else if (p.type === 'ditch') out.push({ type: 'ditch', tile: p.y * W + p.x, lining: p.lining });
      else if (p.type === 'culvert') out.push({ type: 'culvert', tile: L.culvert.tile, dia: p.dia, barrels: p.barrels });
      else if (p.type === 'pond') out.push({ type: 'pond', tile: p.y * W + p.x });
      else if (p.type === 'outlet') out.push({ type: 'outlet', tile: L.pondSite, orif: p.orif, weir: p.weir });
    });
    return out;
  }
  function solutionPlan(n) { var s = SOL[n], o = []; s.steps.forEach(function (st) { o = o.concat(st.place); }); return o; }
  return { SOL: SOL, build: build, solutionPlan: solutionPlan };
}));
