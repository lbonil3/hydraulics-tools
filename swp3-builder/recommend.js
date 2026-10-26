/* SWP3 Builder: BMP recommender by situation. Pure rule-based selection (no network). Each recommendation carries the cited criterion (WHY), when NOT to use it,
   design limits (linked to the Design calcs), and the TxDOT item / EC sheet. Badge order in text: TxDOT first, then the TCEQ permit floor, then iSWM / Houston / Harris, then labeled rule of thumb.
   Only criteria already read in the cited documents are stated; the ranking weights themselves are this tool's judgment (labeled Assumed). */
(function (root) {
  'use strict';
  var D = (typeof require === 'function' && typeof module !== 'undefined') ? require('./data.js') : root.SwpData;
  function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function T(t) { return ['TXDOT', t]; } function P(t) { return ['TCEQ', t]; } function I(t) { return ['ISWM', t]; } function R(t) { return ['ROT', t]; } function A(t) { return ['ASSUMED', t]; }

  var SITUATIONS = [
    { id: 'steep', label: 'Steep slope (cut or fill)', hint: 'Exposed cut/fill face' },
    { id: 'long', label: 'Long slope length', hint: 'Runoff concentrates down a long slope' },
    { id: 'perimeter', label: 'Perimeter, downslope boundary', hint: 'Sheet flow leaves the work area' },
    { id: 'inlet', label: 'Drainage inlet (curb, grate, area)', hint: 'Storm drain inlet that receives site runoff' },
    { id: 'ditch', label: 'Roadside ditch or swale', hint: 'Concentrated flow in a channel' },
    { id: 'culvert', label: 'Culvert inlet or outlet', hint: 'Pipe or box culvert ends' },
    { id: 'water', label: 'Stream or wetland next to the work', hint: 'Work near, but not in, the water' },
    { id: 'stockpile', label: 'Stockpile', hint: 'Soil, base or material piles' },
    { id: 'exit', label: 'Site entrance or exit (track-out)', hint: 'Vehicles leave onto a public road' },
    { id: 'washout', label: 'Concrete washout', hint: 'Concrete trucks, pumps, tools' },
    { id: 'fuel', label: 'Fueling and materials storage', hint: 'Fuel, chemicals, equipment' },
    { id: 'dewater', label: 'Dewatering', hint: 'Pumping out excavations or ponded water' },
    { id: 'inwater', label: 'Bridge or in-water work', hint: 'Bank or in-channel disturbance' },
    { id: 'trench', label: 'Utility trench', hint: 'Open trench with spoil pile' },
    { id: 'staging', label: 'Borrow or staging area', hint: 'Support activity off the main footprint' },
    { id: 'winter', label: 'Inactive or winter shutdown', hint: 'Work paused; soil exposed' },
    { id: 'final', label: 'Final stabilization', hint: 'Finishing and closing out' }
  ];

  // Item 506 / EC references (section numbers verified in the 2024 Item 506 text; EC numbers from the TxDOT BMP fact sheets).
  var ITEM = {
    sediment_fence: 'Item 506 sec 2.9, 4.4.8; pay 506-7039 (LF)', erosion_log: 'Item 506 sec 2.10, 4.4.9; pay 506-7042 to 7045 (LF)', rock_exit: 'Item 506 sec 2.4, 4.4.4; pay 506-7020 (SY)',
    rock_filter_dam: 'Item 506 sec 2.1, 4.4.1; pay 506-7001 to 7004 (LF)', slope_drain: 'Item 506 sec 2.2, 4.4.2 (measured by the foot)', diversion: 'Item 506 sec 2.3, 4.4.3 paved flume (SY); earthwork sec 4.4.5',
    vertical_tracking: 'Item 506 sec 4.4.10', perimeter_fence: 'Item 506 sec 2.7, 4.4.6; pay 506-7034 (LF)', sediment_basin: 'EC(6)-16; earthwork Item 506 sec 4.4.5 (506-7025 to 7029)', sediment_trap: 'EC(6)-16; earthwork Item 506 sec 4.4.5',
    inlet_protection: 'EC(9)-16 / EC(2)-16; pay 506-7040 (LF) for fence inlet protection', outlet_protection: 'EC(8)-16'
  };
  var DESIGN = { sediment_fence: 'fence', erosion_log: 'dam', rock_filter_dam: 'dam', rock_exit: 'qty', slope_drain: 'drain', diversion: 'ditch', erosion_blanket: 'ditch', sediment_basin: 'basin', sediment_trap: 'basin', inlet_protection: 'drain', outlet_protection: 'drain', seeding_sod: 'rusle', vertical_tracking: 'rusle', vegetated_buffer: 'fence' };

  // Candidate rule: id, s = base score (assumed weight), why, avoid, lim [[text, tool]], adj(i, c) may change c.s / add text / set c.drop
  function C(id, s, why, avoid, lim, adj) { return { id: id, s: s, why: why || [], avoid: avoid || [], lim: lim || [], adj: adj || null }; }
  var FENCE_LIM = [['Drainage to one run of fence 2 ac or less (TxDOT); 0.25 ac per 100 LF, 1 cfs per 20 ft, flow distance 200 ft or less (50 ft if slope over 10%) (iSWM 3.10.3)', 'fence']];
  var FENCE_AVOID = ['Concentrated flow (ditches, swales, pipe outlets): fence is for sheet flow.', 'More than 2 acres draining to one run: use a trap, basin or several runs (TxDOT fact sheet).'];
  var LOG_LIM = [['Ditch dams at least 500 ft on center; log trap 5 ac or less at 1,800 cu ft/ac (TxDOT fact sheet); slope spacing by diameter: EC(9)-16 sheet 2 and iSWM Table 3.2 (9 to 24 in. tubes, 10 to 60 ft by slope)', 'dam']];

  var RULES = {
    steep: function () { return [
      C('vertical_tracking', 70, [T('Vertical tracking is required where soil-disturbing activity occurs on slopes unless approved otherwise (Item 506 sec 4.4.10).')], ['Check the plan first if the face is already specified for a blanket or mat.'], [['Track up and down the slope face (Item 506 sec 4.4.10)', 'rusle']]),
      C('erosion_blanket', 62, [T('TxDOT soil stabilization fact sheet lists ditches and traps as blanket locations; iSWM efficiency Fe 0.90 as ground cover (Table 1.1).'), R('Slopes about 3H:1V or steeper commonly get a blanket or mat (rule of thumb, not from the cited standards).')], ['Rocky or unprepared surface that prevents contact with soil; blanket must be keyed and stapled per the manufacturer.'], [['Compare RECP/TRM permissible shear for channels in the Ditch lining check', 'ditch']],
        function (i, c) { if (i.slope != null && i.slope >= 33) { c.s += 12; c.why.push(A('Slope input is 3H:1V or steeper, so the blanket is ranked higher.')); } if (i.soil === 'clayey' || i.soil === 'silty') { c.s += 6; c.why.push(I('Fine silt and clay settle poorly in sediment controls, so keep soil in place (iSWM 1.2.2).')); } }),
      C('seeding_sod', 56, [P('Final stabilization requires 70% of native background cover or equivalent; start temporary stabilization within the permit time (Part III.F.2(b)).')], ['Dormant season with no mulch or blanket: seed may not establish in time (rule of thumb).'], [['Compare erosion with and without cover in RUSLE', 'rusle']],
        function (i, c) { if (i.season === 'dormant') { c.s -= 12; c.avoid.push('Season input is dormant: pair with mulch or blanket.'); } }),
      C('slope_drain', 50, [T('Pipe slope drain carries concentrated runoff down an unstabilized slope or embankment (TxDOT fact sheet, Item 506 sec 4.4.2).')], ['More than 5 acres to one drain; inlet slope under 3%; no stabilized outlet.'], [['5 ac or less per drain, 25-yr flow, dike 1 ft above inlet pipe (TxDOT); iSWM Table 2.2 minimum diameter by area', 'drain']],
        function (i, c) { if (i.len != null && i.len >= 150) { c.s += 10; c.why.push(R('Slope length input is 150 ft or more; long slopes concentrate flow (rule of thumb).')); } }),
      C('erosion_log', 46, [T('Logs on slopes as slope checks and perimeter barrier (TxDOT erosion control log fact sheet, EC(9)-16).')], ['Concentrated flow.'], LOG_LIM),
      C('sediment_fence', 52, [P('Sediment controls on down-slope boundaries (Part III.F.2(c)).'), T('Fence at the toe of the slope for sheet flow (Item 506 sec 4.4.8).')], FENCE_AVOID, FENCE_LIM,
        function (i, c) { if (i.slope != null && i.slope > 10 && i.len != null && i.len >= 50) { c.s -= 15; c.avoid.unshift('Slope over 10% and flow distance 50 ft or more: iSWM limits flow distance to under 50 ft, so a fence alone is not enough (iSWM 3.10.3).'); } })
    ]; },
    long: function () { return [
      C('slope_drain', 72, [T('Concentrated runoff on long unstabilized slopes and embankments (TxDOT fact sheet).')], ['More than 5 acres per drain (iSWM 2.6.3, TxDOT).'], [['5 ac or less, 25-yr flow, iSWM Table 2.2 diameter', 'drain']]),
      C('diversion', 64, [T('Divert run-on above slopes (TxDOT fact sheet); iSWM Fe 0.95 for diversion dikes and interceptor swales (Table 1.1).'), P('Control stormwater volume and velocity to limit erosion (Part IV.A).')], ['Where the diverted flow has no stable outlet.'], [['Size the swale lining: shear check', 'ditch']]),
      C('erosion_log', 58, [T('Logs as slope checks at spacing by diameter and slope (EC(9)-16 sheet 2; iSWM Table 3.2 gives 10 to 60 ft by slope for 9 to 24 in. tubes).')], ['Concentrated flow.'], LOG_LIM),
      C('vertical_tracking', 54, [T('Required on slopes where soil-disturbing activity occurs unless approved otherwise (Item 506 sec 4.4.10).')], [], []),
      C('sediment_fence', 50, [P('Sediment controls on down-slope boundaries (Part III.F.2(c)).')], FENCE_AVOID, FENCE_LIM, function (i, c) { if (i.len != null && i.len > 200) { c.s -= 20; c.avoid.unshift('Flow distance over 200 ft to the fence (iSWM 3.10.3): break the slope with drains, dikes or logs first.'); } }),
      C('erosion_blanket', 48, [T('Blanket on the exposed face where seeding alone will not hold (TxDOT soil stabilization fact sheet).')], [], [])
    ]; },
    perimeter: function () { return [
      C('sediment_fence', 80, [P('Silt fence, vegetative buffer strips or equivalent on all down-slope boundaries (Part III.F.2(c)); TxDOT places fence near the downstream limit (Item 506 sec 4.4.8).')], FENCE_AVOID, FENCE_LIM,
        function (i, c) { if (i.area != null && i.area > 2) { c.s -= 30; c.avoid.unshift('Area input is over 2 ac to one run (TxDOT 2-acre fence guideline): use a trap or basin, or several fence runs each under 2 ac.'); } if (i.Q != null && i.Q > 1) { c.s -= 12; c.avoid.unshift('Flow input over 1 cfs: iSWM allows 1 cfs to any 20 ft section, so check the length.'); } }),
      C('erosion_log', 66, [T('Alternative to silt fence at paved edges and on slopes where fence is unsuitable (TxDOT fact sheet).')], ['Concentrated flow.'], LOG_LIM),
      C('vegetated_buffer', 54, [P('Vegetated buffer strips are a permitted down-slope alternative (Part III.F.2(c)ii(A)).'), I('Buffer: 2 ac or less disturbed area; at least 15 ft wide, 30 ft at 10% slope, 50 ft at 15%; buffer slope 5% maximum if the primary control (iSWM Table 3.10).')], ['High groundwater, shallow bedrock or low-permeability soil (iSWM).'], [['Buffer sizing follows iSWM Table 3.10', 'fence']]),
      C('sediment_trap', 52, [T('Trap before drainage leaves the ROW (TxDOT fact sheet).')], ['More than 5 ac drained.'], [['5 ac or less, 1,800 cu ft/ac; permit value governs if used as the permit control', 'basin']], function (i, c) { if (i.area != null && i.area > 2 && i.area <= 5) { c.s += 18; c.why.push(A('Area input is 2 to 5 ac, so a trap ranks above a single fence run.')); } if (i.area != null && i.area > 5) { c.drop = 'Area input is over 5 ac (TxDOT trap limit).'; } }),
      C('sediment_basin', 20, [P('Required where feasible for 10 or more disturbed acres draining to a common location (Part III.F.2(c)i(A)).')], ['Under 10 ac at one time (not required; permit value still applies if used as the alternative).'], [['Volume, dimensions, dewatering, spillway', 'basin']], function (i, c) { if (i.area != null && i.area >= 10) { c.s = 95; c.why.push(P('Area input is 10 ac or more.')); } else if (i.area == null || i.area < 5) c.drop = 'Under 5 ac: a trap or fence run is the usual choice.'; })
    ]; },
    inlet: function (i) {
      var ongrade = i.inletMode === 'ongrade';
      return [
        C('inlet_protection', ongrade ? 38 : 78, [T('Sediment trap or log at inlets; rock filter dam Type 1 around inlets (TxDOT fact sheet).'), I('Best at low-point (sump) inlets; protection that ponds water is not applicable to on-grade curb inlets because it causes bypass; never block the whole opening (iSWM 3.4.2).')], ['On-grade curb inlets with a ponding-type device (bypass floods the next inlet).', 'Where ponding would flood the roadway or a structure.'], [['Grate capacity with blockage, bypass check (HDM Eq 10-30, 10-31)', 'drain']],
          function (iN, c) { if (ongrade) { c.why.push(I('Input says on-grade: use only devices that keep the opening usable (inlet inserts) (iSWM 3.4.2).')); } }),
        C('erosion_log', ongrade ? 66 : 60, [T('Log inlet protection for curb, drop and grade inlets; must not impede traffic or flood the roadway (EC(9)-16).')], ['Where it blocks the inlet throat on grade.'], LOG_LIM),
        C('rock_filter_dam', 54, [T('Rock filter dam Type 1 around inlets (TxDOT fact sheet).')], ['Velocity of about 8 ft/s or more for Type 1.'], [['Through-flow 60 gpm/sq ft at the 2-yr flow', 'dam']]),
        C('sediment_trap', 50, [T('Trap drainage 5 ac or less, 1,800 cu ft/ac, ahead of the inlet (TxDOT fact sheets).')], ['More than 5 ac drained.'], [['Storage and dimensions', 'basin']], function (iN, c) { if (iN.area != null && iN.area > 5) c.drop = 'Area input is over 5 ac (TxDOT trap limit).'; }),
        C('sediment_fence', 40, [T('Fence-style inlet protection (pay 506-7040).')], ['Concentrated flow at the inlet.'], FENCE_LIM)
      ]; },
    ditch: function () { return [
      C('erosion_blanket', 72, [T('Blankets or mats in ditches (TxDOT soil stabilization fact sheet); lining chosen by permissible shear vs design shear (HDM Ch.7 Sec.3, HEC-15).')], ['Where shear exceeds the product permissible shear: use a TRM, rock or a rigid lining.'], [['Shear check with the HDM permissible shear table', 'ditch']]),
      C('rock_filter_dam', 66, [T('Rock filter dams in ditches, swales and at dike outlets (TxDOT fact sheet, Item 506 sec 4.4.1).'), I('Spacing so the top of the downstream dam is level with the toe of the upstream dam: L = h / S (iSWM 2.1.3).')], ['Velocity of about 8 ft/s or more for Type 1.', 'Channel grade flatter than 0.4%: space for pools, not by the formula (iSWM 2.1.3).'], [['Spacing and through-flow', 'dam']],
        function (i, c) { if (i.slope != null && i.slope < 0.4) { c.s -= 10; c.avoid.unshift('Slope input is flatter than 0.4%: iSWM places dams for small pools rather than by the spacing rule.'); } }),
      C('erosion_log', 60, [T('Ditch dams at least 500 ft on center (TxDOT fact sheet).')], ['Flow above the log through-capacity.'], LOG_LIM),
      C('sediment_trap', 52, [T('Traps in ditches, ahead of ditch inlets, before drainage enters a water course (TxDOT fact sheet).')], ['More than 5 ac drained.'], [['Volume and dimensions', 'basin']], function (i, c) { if (i.area != null && i.area > 5) c.drop = 'Area input is over 5 ac (TxDOT trap limit).'; }),
      C('seeding_sod', 50, [P('Stabilize as soon as practicable; final stabilization at 70% cover (Part III.F.2(b)).')], ['Not by itself for high-shear channels before establishment.'], [['Check the lining while vegetation is young', 'ditch']])
    ]; },
    culvert: function () { return [
      C('outlet_protection', 82, [P('Velocity dissipation devices are required at discharge locations and along outfall channels (Part III.F.4(d)).'), T('EC(8)-16 outlet protection.')], ['Ending the apron short of a stable channel.'], [['Pipe slope drain outlet apron: width 3D, length 6D minimum (iSWM 2.6.3); size riprap with the Ditch tool', 'drain']]),
      C('rock_filter_dam', 62, [T('Rock filter dam before drainage enters a water course and at pipe outlets (TxDOT fact sheet).')], ['Velocity of about 8 ft/s or more for Type 1.'], [['Through-flow 60 gpm/sq ft', 'dam']]),
      C('erosion_blanket', 50, [T('Blankets in ditches and at traps near culvert ends (TxDOT soil stabilization fact sheet).')], [], [['Shear check', 'ditch']]),
      C('sediment_trap', 48, [T('Trap ahead of culvert inlets and before drainage enters a water course.')], ['More than 5 ac drained.'], [['Volume', 'basin']], function (i, c) { if (i.area != null && i.area > 5) c.drop = 'Area input is over 5 ac (TxDOT trap limit).'; }),
      C('inlet_protection', 40, [A('Protect the culvert inlet from sediment with a log, fence or Type 1 rock dam (this tool\'s judgment; the TxDOT fact sheets describe these devices at drain inlets).')], ['Where headwater rise would flood the road.'], [])
    ]; },
    water: function () { return [
      C('vegetated_buffer', 80, [P('Provide and maintain natural buffers around surface water, or document why infeasible and add sediment controls (Part IV.A).'), I('Existing buffer: mark it before clearing; herbaceous cover at least 80% (iSWM 3.15).')], ['Buffer that is graded through or driven on.'], [['Buffer sizing', 'fence']]),
      C('perimeter_fence', 66, [T('Keeps equipment out of preserved vegetation, water bodies and wetlands (TxDOT fact sheet, Item 506 sec 4.4.6).')], [], []),
      C('sediment_fence', 62, [P('Down-slope sediment control (Part III.F.2(c)).')], FENCE_AVOID.concat(['Placed in the channel or in standing water.']), FENCE_LIM),
      C('erosion_log', 54, [T('Alternative perimeter barrier next to water (TxDOT fact sheet).')], [], LOG_LIM),
      C('turbidity_barrier', 36, [I('For bank disturbance or in-water work next to a perennial water body (iSWM 3.14.1).')], ['Not for velocities above what the manufacturer allows; higher than 0.5 ft/s needs an engineered design (iSWM 3.14.3).'], [['Engineered design', 'qty']], function (i, c) { if (i.recv === 'wetland' || i.recv === 'impaired') { c.s += 12; c.why.push(I('Wetland, TMDL or sensitive water: turbidity barriers are most applicable (iSWM 3.14.2).')); } }),
      C('outlet_protection', 48, [P('Velocity dissipation at discharge points and outfalls (Part III.F.4(d)).')], [], [['Apron sizing', 'drain']])
    ]; },
    stockpile: function () { return [
      C('stockpile', 78, [P('Describe materials stored on site and the controls (Part III.F.4(b)); TxDOT: designate the stockpile area on the layout sheets.')], [], []),
      C('sediment_fence', 70, [T('Fence or log around the stockpile perimeter (TxDOT stockpile practice and fence fact sheet).')], FENCE_AVOID, FENCE_LIM),
      C('erosion_log', 62, [T('Logs are a listed stockpile control (EC(9)-16).')], [], LOG_LIM),
      C('seeding_sod', 50, [I('Tarps, seeding or hydromulching of stockpiles are primary erosion goals (iSWM 1.3.2).'), P('Initiate stabilization where activity will not resume for more than 14 days (Part III.F.2(b)).')], ['Dormant season seeding alone.'], [], function (i, c) { if (i.dur != null && i.dur > 14) { c.s += 20; c.why.push(P('Duration input is over 14 days, so the stabilization rule applies.')); } if (i.season === 'dormant') { c.s -= 8; c.avoid.push('Dormant season: use a tarp or mulch as well.'); } })
    ]; },
    exit: function () { return [
      C('rock_exit', 90, [T('Stabilized exits must be used on sites disturbing one acre or more (TxDOT fact sheet); Type 1: 8 in. deep, 4-8 in. rock, 14 ft one-way / 20 ft two-way, 50 ft long (Item 506 sec 4.4.4).'), P('Minimize off-site vehicle tracking (Part III.F.4(a)).')], ['Exit that drains straight to a storm drain without a trap.'], [['Dimensions and rock quantity (Item 506); iSWM Table 3.9 by disturbed area', 'qty']]),
      C('street_sweeping', 62, [T('Use with the stabilized exit wherever exits enter a public roadway (TxDOT fact sheet).')], ['Not a substitute for the exit.'], []),
      C('sediment_fence', 30, [A('Fence down-gradient of the exit to catch wash-off (this tool\'s judgment; fence criteria in Item 506 sec 4.4.8).')], FENCE_AVOID, FENCE_LIM)
    ]; },
    washout: function () { return [
      C('concrete_washout', 95, [P('Concrete wash-out to surface water or storm sewers is prohibited; show wash-out areas on the SWP3 site map (Part VI, Part IV.E.1).')], ['Washing out in ditches, inlets or on bare soil.'], []),
      C('chemical_material', 52, [P('Manage waste and chemicals so they do not reach storm water (Part IV.D).')], [], []),
      C('sediment_fence', 30, [A('Perimeter barrier down-slope of the washout area (this tool\'s judgment).')], [], FENCE_LIM)
    ]; },
    fuel: function () { return [
      C('chemical_material', 86, [P('Chemical, material, waste and equipment management; identify storage areas on the plan sheets (Part IV.D; TxDOT Summary Sheet).')], ['Storing within a drainage path or near an inlet.'], []),
      C('spill_response', 82, [P('Spill and leak prevention and response procedures (Part IV.D.5).')], [], []),
      C('sediment_fence', 28, [A('Perimeter barrier down-slope of the storage area (this tool\'s judgment; general down-slope control Part III.F.2(c)).')], [], FENCE_LIM)
    ]; },
    dewater: function () { return [
      C('dewatering_controls', 92, [P('Dewatering discharges are prohibited unless controlled; daily observation and a 24-hour report on discharge days (Part IV.C; Part III.F.7).'), T('Dewatering bag must pass at least 2x the pump peak flow (TxDOT SS 4000); sediment tank holds at least 2 hours (iSWM 3.3).')], ['Pumping directly to a storm drain or surface water.'], [['Tank volume 1 cu ft per gpm of pump capacity (iSWM 3.3); sizing in the quantity helper', 'qty']]),
      C('sediment_trap', 48, [T('Discharge to a trap or basin (TxDOT dewatering guidance).')], ['More than 5 ac drained.'], [['Volume', 'basin']]),
      C('vegetated_buffer', 42, [T('Discharge to a vegetated area where it can infiltrate (TxDOT dewatering guidance).')], ['High groundwater, shallow bedrock or low-permeability soil (iSWM).'], [])
    ]; },
    inwater: function () { return [
      C('turbidity_barrier', 84, [I('Used when work disturbs a stream or lake bank or requires a coffer dam or low-water crossing (iSWM 3.14.1).')], ['High velocities; above 0.5 ft/s needs an engineered design (iSWM 3.14.3).'], [['Height 10% over design depth; length 10 to 20% over design length', 'qty']]),
      C('perimeter_fence', 62, [T('Keep equipment out of water bodies and wetlands (TxDOT fact sheet).')], [], []),
      C('vegetated_buffer', 56, [P('Natural buffers around surface water or documented alternative (Part IV.A).')], [], []),
      C('dewatering_controls', 52, [P('Dewatering discharges must be controlled (Part IV.C).')], ['Direct discharge to the water.'], []),
      C('concrete_washout', 50, [P('No concrete wash-out to surface water (Part VI, Part IV.E.1).')], [], []),
      C('sediment_fence', 40, [T('Bank-top fence for sheet flow (Item 506 sec 4.4.8).')], ['In the water or in concentrated flow.'], FENCE_LIM)
    ]; },
    trench: function () { return [
      C('sediment_fence', 74, [P('Down-slope sediment control for spoil and the open cut (Part III.F.2(c)); Item 506 sec 4.4.8.')], FENCE_AVOID, FENCE_LIM),
      C('erosion_log', 66, [T('Logs where fence is unsuitable, including paved edges (TxDOT fact sheet).')], [], LOG_LIM),
      C('inlet_protection', 60, [T('Protect inlets down-gradient of the trench (TxDOT fact sheet).')], ['On-grade curb inlets with a ponding device (iSWM 3.4.2).'], [['Inlet capacity', 'drain']]),
      C('stockpile', 52, [P('Spoil piles are stored materials: describe controls (Part III.F.4(b)).')], [], []),
      C('dewatering_controls', 40, [P('If the trench holds water, pumped discharge must be controlled (Part IV.C).')], [], []),
      C('seeding_sod', 38, [P('Stabilize disturbed ground where work will not resume for more than 14 days (Part III.F.2(b)).')], [], [])
    ]; },
    staging: function () { return [
      C('perimeter_fence', 60, [T('Mark and limit the work area (Item 506 sec 4.4.6).')], [], []),
      C('sediment_fence', 78, [P('Support activities are covered by the permit; sediment controls on down-slope boundaries (Part III.F.2(c)).')], FENCE_AVOID, FENCE_LIM),
      C('rock_exit', 70, [T('Stabilized exit where vehicles leave onto a public road (Item 506 sec 4.4.4).')], [], [['Dimensions', 'qty']]),
      C('stockpile', 56, [P('Material and stockpile management (Part III.F.4(b)).')], [], []),
      C('sediment_trap', 52, [T('Trap before drainage leaves the area.')], ['More than 5 ac drained.'], [['Volume', 'basin']], function (i, c) { if (i.area != null && i.area > 5) { c.drop = 'Area input is over 5 ac (TxDOT trap limit).'; } }),
      C('sediment_basin', 20, [P('Required where feasible for 10 or more disturbed acres at one location (Part III.F.2(c)i(A)).')], [], [['Volume and dimensions', 'basin']], function (i, c) { if (i.area != null && i.area >= 10) { c.s = 92; } else c.drop = 'Under 10 ac.'; }),
      C('seeding_sod', 44, [P('Stabilize when work stops for more than 14 days (Part III.F.2(b)).')], [], [])
    ]; },
    winter: function () { return [
      C('seeding_sod', 76, [P('Initiate stabilization immediately (by the end of the next work day) where activity has ceased and will not resume for more than 14 days (Part III.F.2(b)iii and Part IV.B).')], ['Seed alone in the dormant season.'], [['Cover and erosion estimate', 'rusle']],
        function (i, c) { if (i.season === 'dormant') { c.s -= 14; c.why.push(R('Dormant season: seed may not germinate; use mulch or a blanket for cover now (rule of thumb).')); } }),
      C('erosion_blanket', 70, [T('Blanket gives immediate cover on slopes and ditches (TxDOT fact sheet); iSWM Fe 0.90 (Table 1.1).')], [], [],
        function (i, c) { if (i.season === 'dormant') { c.s += 14; c.why.push(A('Dormant season input: immediate cover ranks higher.')); } }),
      C('sediment_fence', 58, [P('Keep perimeter controls maintained through shutdown; repair run-over or ineffective controls immediately (Part III.F.6(a)).')], [], FENCE_LIM),
      C('erosion_log', 50, [T('Slope checks and ditch dams hold during inactive periods (EC(9)-16).')], [], LOG_LIM),
      C('vertical_tracking', 46, [T('Temporary stabilization of slopes (Item 506 sec 4.4.10).')], [], [])
    ]; },
    final: function () { return [
      C('seeding_sod', 84, [P('Final stabilization requires uniform vegetative cover of at least 70% of native background cover, or equivalent permanent stabilization (Part III.F.2(b)).')], ['Declaring stabilization before cover is established.'], [['Check cover assumptions in the RUSLE comparison', 'rusle']]),
      C('erosion_blanket', 64, [T('Blanket or mat in ditches and on slopes until cover establishes (TxDOT soil stabilization fact sheet).')], [], [['Shear check', 'ditch']]),
      C('outlet_protection', 56, [P('Permanent velocity dissipation at discharge points (Part III.F.4(d)).')], [], [['Apron sizing', 'drain']]),
      C('permanent_controls', 52, [P('Install and maintain permanent stormwater controls before final stabilization (Part III.F.3).')], [], [])
    ]; }
  };
  // Common companions added to any situation (shown separately, not ranked)
  var COMPANION = { spill_response: 'Spill prevention applies on every site (Part IV.D.5).' };

  function normalize(inp) {
    inp = inp || {};
    return { slope: num(inp.slope), len: num(inp.len), area: num(inp.area), Q: num(inp.Q), dur: num(inp.dur), soil: inp.soil || 'unknown', recv: inp.recv || 'none', season: inp.season || 'growing', inletMode: inp.inletMode || 'sump' };
  }
  function recommend(situationId, inputs) {
    var i = normalize(inputs), rule = RULES[situationId];
    if (!rule) return { error: 'Unknown situation.' };
    var cands = rule(i), out = [], excluded = [];
    var byId = {}; D.BMPS.forEach(function (b) { byId[b.id] = b; });
    cands.forEach(function (c) {
      if (!byId[c.id]) return;
      if (c.adj) c.adj(i, c);
      // soil: fine soils reduce settling/filtering controls
      if ((i.soil === 'clayey') && ['sediment_fence', 'erosion_log', 'sediment_trap', 'sediment_basin', 'vegetated_buffer'].indexOf(c.id) >= 0) { c.s -= 4; c.avoid.push('Clay soils: suspended fines settle and filter poorly in this control, so pair it with cover (iSWM 1.2.2, 3.9).'); }
      if (i.recv !== 'none' && ['vegetated_buffer', 'turbidity_barrier', 'outlet_protection'].indexOf(c.id) >= 0 && situationId !== 'water') { c.s += 6; c.why.push(A('Receiving water input is ' + i.recv + ', so this control ranks higher.')); }
      if (c.drop) { excluded.push({ id: c.id, name: byId[c.id].name, reason: c.drop }); return; }
      out.push({ id: c.id, name: byId[c.id].name, score: Math.round(c.s), why: c.why, avoid: c.avoid, limits: c.lim.map(function (l) { return { text: l[0], tool: l[1] }; }), item: ITEM[c.id] || (byId[c.id].ec ? byId[c.id].ec : ''), ec: byId[c.id].ec || '', design: DESIGN[c.id] || '', badge: byId[c.id].badge, install: (byId[c.id].install || []).slice(0, 3), maint: (byId[c.id].maint || []).slice(0, 2) });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    out.forEach(function (x, k) { x.rank = k === 0 ? 'primary' : (k <= 3 ? 'alternate' : 'also'); });
    return { situation: situationId, inputs: i, items: out, excluded: excluded, companions: Object.keys(COMPANION).filter(function (id) { return !out.some(function (x) { return x.id === id; }) && byId[id]; }).map(function (id) { return { id: id, name: byId[id].name, note: COMPANION[id] }; }) };
  }
  // Selection helper: merge chosen BMP ids into a project's sel map (true), leaving others unchanged.
  function applyToSelection(sel, ids) { var o = {}; Object.keys(sel || {}).forEach(function (k) { o[k] = sel[k]; }); (ids || []).forEach(function (id) { o[id] = true; }); return o; }
  // Suggested quantity seeds for the takeoff from selected recommendations (LF/SY from inputs the user has typed; returns {} where unknown)
  function takeoffSeeds(ids, ctx) {
    var q = {}; ctx = ctx || {};
    (ids || []).forEach(function (id) {
      if (id === 'sediment_fence' && num(ctx.fenceLf)) q.silt_fence = num(ctx.fenceLf);
      if (id === 'erosion_log' && num(ctx.logLf)) q.erosion_log = num(ctx.logLf);
      if (id === 'rock_filter_dam' && num(ctx.damLf)) q.rock_dam = num(ctx.damLf);
      if (id === 'rock_exit' && num(ctx.exitSy)) q.construction_exit = num(ctx.exitSy);
      if (id === 'inlet_protection' && num(ctx.inletLf)) q.inlet_protection = num(ctx.inletLf);
      if (id === 'perimeter_fence' && num(ctx.perimLf)) q.perimeter_fence = num(ctx.perimLf);
    });
    return q;
  }
  var API = { SITUATIONS: SITUATIONS, recommend: recommend, applyToSelection: applyToSelection, takeoffSeeds: takeoffSeeds, ITEM: ITEM, DESIGN: DESIGN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SwpRecommend = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
