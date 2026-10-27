/* SWP3 Designer - recommended 3-star plans, stored as data. Each step: why (rule basis) + controls [type, x, y].
 * test.js runs every solution through the sim and requires 3 stars, so a retune cannot silently break them. */
(function (root) {
  'use strict';
  function row(t, y, x0, x1) { var r = []; for (var x = x0; x <= x1; x++) r.push([t, x, y]); return r; }
  function col(t, x, y0, y1, step) { var r = []; for (var y = y0; y <= y1; y += (step || 1)) r.push([t, x, y]); return r; }
  var SOL = {
    1: [
      { why: 'Silt fence along the bottom of the pad, across the sheet flow and along the contour. Each fence drains well under 2 ac.', basis: 'TxDOT EC(1)-16', place: row('fence', 14, 4, 15) },
      { why: 'Construction exit on the access tile so trucks do not track mud onto the road.', basis: 'TxDOT Item 506 / EC(3)-16', place: [['exit', 9, 2]] }
    ],
    2: [
      { why: 'Rock filter dams in the ditch every 2 tiles (100 ft). At 1.5% ditch slope an 18 in. dam backs water 1.5 ÷ 0.015 = 100 ft, so the next dam starts where the last pool ends.', basis: 'TxDOT EC(2)-16 Type 2; spacing = game rule', place: col('dam', 15, 2, 18, 2) },
      { why: 'Construction exit where trucks leave the pad.', basis: 'TxDOT Item 506 / EC(3)-16', place: [['exit', 14, 9]] }
    ],
    3: [
      { why: 'Silt fence along the toe of the pad, where flow is still sheet flow and each fence drains under 2 ac even in a 10-yr storm.', basis: 'TxDOT EC(1)-16', place: row('fence', 12, 3, 15) },
      { why: 'The east swale collects more than 2 ac at its toe in a 10-yr storm, so a fence there would overtop. Put the swale fence high up (row 5) where its drainage area is still small.', basis: 'TxDOT EC(1)-16 (2 ac limit)', place: [['fence', 16, 5]] },
      { why: 'Inlet protection: this inlet drains under 5 ac even in the 10-yr storm.', basis: 'TxDOT EC(9)-16', place: [['inlet', 10, 14]] },
      { why: 'Construction exit on the access tile, and a concrete washout at least 50 ft from the inlet, ditch and creek.', basis: 'TxDOT Item 506; EPA concrete washout BMP', place: [['exit', 6, 12], ['washout', 5, 5]] }
    ],
    4: [
      { why: 'The pad sits on a ridge: sheet flow leaves to the WEST. Silt fence along the whole west edge of the pad.', basis: 'TxDOT EC(1)-16', place: col('fence', 2, 3, 14) },
      { why: '…and to the EAST. Silt fence along the whole east edge too. Each fence drains about 0.5 ac.', basis: 'TxDOT EC(1)-16', place: col('fence', 17, 3, 14) },
      { why: 'Stabilized construction exit on the haul road, and a washout in the middle of the pad, far from any drainage.', basis: 'TxDOT Item 506 / EC(3)-16; EPA concrete washout BMP', place: [['exit', 9, 16], ['washout', 12, 10]] }
    ],
    5: [
      { why: 'Upper ditch reach (about 1.4%): rock filter dams every 2 tiles (≈107 ft max spacing).', basis: 'TxDOT EC(2)-16; spacing = game rule', place: col('dam', 13, 1, 7, 2) },
      { why: 'Middle reach (about 2.8%): spacing drops to ≈54 ft, so a dam on every tile.', basis: 'TxDOT EC(2)-16; spacing = game rule', place: col('dam', 13, 8, 13) },
      { why: 'Steep 7% reach: rock dams would wash out, so trap the sediment on the cut slope above it with silt fence instead.', basis: 'TxDOT EC(2)-16 high-velocity note; game rule blowout > 6%', place: col('fence', 11, 14, 19) },
      { why: 'Construction exit on the access tile.', basis: 'TxDOT Item 506', place: [['exit', 12, 4]] }
    ],
    6: [
      { why: 'Silt fence across the whole bottom of the pad: the middle inlet drains far more than 5 ac in a 10-yr storm, so stop the sediment at the source.', basis: 'TxDOT EC(1)-16; EC(9)-16 5 ac limit', place: row('fence', 8, 1, 18) },
      { why: 'Inlet protection only on the two small inlets (under 5 ac). Logs on the big middle inlet would be bypassed.', basis: 'TxDOT EC(9)-16', place: [['inlet', 2, 11], ['inlet', 17, 11]] },
      { why: 'Construction exit on the access tile.', basis: 'TxDOT Item 506', place: [['exit', 13, 9]] }
    ],
    7: [
      { why: 'The central swale drains about 8 ac in the 5-yr storm: 8 × 3,600 cf = about 29,000 cf. Three basin blocks (32,400 cf) stacked on the swale outlet.', basis: 'TxDOT Item 506 (3,600 cf/ac, 10+ ac disturbed); block size = game rule', place: [['basin', 9, 15], ['basin', 9, 15], ['basin', 9, 15]] },
      { why: 'Everywhere else the pad still sheds sheet flow: silt fence along the bottom edge, about 0.8 ac per fence.', basis: 'TxDOT EC(1)-16', place: row('fence', 14, 1, 5).concat(row('fence', 14, 13, 18)) },
      { why: 'Construction exit on the access tile.', basis: 'TxDOT Item 506', place: [['exit', 18, 1]] }
    ],
    8: [
      { why: 'Diversion dikes on the clean grass row just above the pad. They catch the hillside run-on and carry it around the site, so the pad low point drains about 3.2 ac instead of about 6.0 ac in the 5-yr storm.', basis: 'TxDOT EC(4)-16 (5 ac per dike; outlet to a stabilized area)', place: row('dike', 4, 6, 14) },
      { why: 'Pipe slope drain at the pad-edge low point, carrying the concentrated flow down the fill instead of letting it cut a gully. At about 3.2 ac EC(7) calls for a 24 in. pipe (3.5 ac max).', basis: 'TxDOT EC(7)-16 design criteria (5 ac max)', place: [['psd', 10, 9]] },
      { why: 'Riprap energy dissipator on the bench where the pipe discharges, so the jet does not scour the toe into the creek.', basis: 'TxDOT EC(7)-16 Detail A; Item 432 riprap', place: [['apron', 10, 11]] },
      { why: 'Soil retention blankets over seed on every tile of the fill face. The face is steeper than 3:1, so seed alone would wash off and silt fence would be undercut.', basis: 'TxDOT Item 169 Class 1 Type C/D (steeper than 3:1); Item 164 seeding', place: [].concat(row('blanket', 9, 6, 14), row('blanket', 10, 6, 14), [6, 7, 8, 12, 13, 14].map(function (x) { return ['blanket', x, 11]; }), row('seed', 9, 6, 14), row('seed', 10, 6, 14), [6, 7, 8, 12, 13, 14].map(function (x) { return ['seed', x, 11]; })) },
      { why: 'Silt fence on each side of the pad centre line. The pad sheet-flows sideways to the low point, and each fence drains well under 2 ac.', basis: 'TxDOT EC(1)-16', place: [].concat(col('fence', 9, 5, 8), col('fence', 11, 5, 8)) },
      { why: 'Construction exit on the access tile.', basis: 'TxDOT Item 506 / EC(3)-16', place: [['exit', 14, 5]] }
    ]
  };
  function controlsFor(n, W) { var out = []; (SOL[n] || []).forEach(function (s) { s.place.forEach(function (p) { out.push({ type: p[0], tile: p[2] * W + p[1] }); }); }); return out; }
  var api = { SOL: SOL, controlsFor: controlsFor, row: row, col: col };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SWP3Solutions = api;
})(this);
