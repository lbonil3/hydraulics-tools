/* SWP3 Builder: TxDOT SWP3 Summary Sheet model (pure logic, no DOM). Browser: window.SwpSummary. Node: require().
 * The two official sheets (2023 template, "July 2023" on the form) are flat PDFs. summary-layout.js holds the measured field geometry;
 * this file holds the field catalog (labels copied from the sheet), the prefill rules, validation, and the draw plan used by summary-pdf.js. */
(function (root) {
  var isNode = typeof module !== 'undefined' && module.exports;
  var M = isNode ? require('./model.js') : root.SwpModel;
  var LAYOUT = isNode ? require('./summary-layout.js') : root.SwpSummaryLayout;

  /* Known-good files the layout was measured on (SHA-256 of the unmodified PDFs from ftp.txdot.gov, retrieved 2026-10-26). */
  var SHEETS = {
    B: { label: '1 acre or more', file: 'swp3b23.pdf', sha256: 'b973a8e3bcd002ed5dc8598c3b146f7e1ee63ae45d091f545c94eeb8ddeaaa25',
         url: 'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/swp3b23.pdf', title: 'SWP3 Summary Sheets (1 Acre or more)' },
    A: { label: 'less than 1 acre', file: 'swp3a23.pdf', sha256: '70d4fa738f7105423b035f04276f0061896b19c914dffab5cc3716eed2cfc205',
         url: 'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/swp3a23.pdf', title: 'SWP3 Summary Sheets (Less than 1 acre)' }
  };
  var BUNDLED = false;   // set true only if TxDOT permission to redistribute the PDFs is confirmed and they are placed in assets/
  var PAGE_URL = 'https://www.dot.state.tx.us/insdtdot/orgchart/cmd/cserve/standard/rdwylse.htm';

  /* ---------- labels copied from the sheets ---------- */
  var ACT = ['Mobilization', 'Install sediment and erosion controls', 'Blade existing topsoil into windrows, prep ROW, clear and grub', 'Remove existing pavement', 'Grading operations, excavation, and embankment', 'Excavate and prepare subgrade for proposed pavement widening', 'Remove existing culverts, safety end treatments (SETs)', 'Remove existing metal beam guard fence (MBGF), bridge rail', 'Install proposed pavement per plans', 'Install culverts, culvert extensions, SETs', 'Install mow strip, MBGF, bridge rail', 'Place flex base', 'Rework slopes, grade ditches', 'Blade windrowed material back across slopes', 'Revegetation of unpaved areas', 'Achieve site stabilization and remove sediment and erosion control measures'];
  var ACT_K = ['mob', 'sed', 'clear', 'pave', 'grade', 'subgrade', 'culrem', 'mbgf', 'paveinst', 'culinst', 'mow', 'flex', 'slopes', 'windrow', 'reveg', 'stab'];
  var POL = { sed: 'Sediment laden stormwater from stormwater conveyance over disturbed area', fuel: 'Fuels, oils, and lubricants from construction vehicles, equipment, and storage', solv: 'Solvents, paints, adhesives, etc. from various construction activities', track: 'Transported soils from offsite vehicle tracking', debris: 'Construction debris and waste from various construction activities', water: 'Contaminated water from excavation or dewatering pump-out water', sanit: 'Sanitary waste from onsite restroom facilities', trash: 'Trash from various construction activities/receptacles', stock: 'Long-term stockpiles of material and waste', concwash: 'Discharges from concrete washout activities, runoff from concrete cutting activities, and other concrete related activities' };
  var POL_B = ['sed', 'fuel', 'solv', 'track', 'debris', 'water', 'sanit', 'trash', 'stock'], POL_A = POL_B.concat(['concwash']);
  var RT = { plans: 'Development of plans and specifications', noi: 'Submit Notice of Intent (NOI) to TCEQ (\u22655 acres)', csn: 'Post Construction Site Notice', ms4: 'Submit NOI/CSN to local MS4', insp: 'Perform SWP3 inspections', records: 'Maintain SWP3 records and update to reflect daily operations', not: 'Complete and submit Notice of Termination to TCEQ', keep3: 'Maintain SWP3 records for 3 years' };
  var RC = { ops: 'Day To Day Operational Control', noi: 'Submit Notice of Intent (NOI) to TCEQ (\u22655 acres)', csn: 'Post Construction Site Notice', ms4: 'Submit NOI/CSN to local MS4', sched: 'Maintain schedule of major construction activities', bmps: 'Install, maintain and modify BMPs', not: 'Complete and submit Notice of Termination to TCEQ', keep3: 'Maintain SWP3 records for 3 years' };
  var RT_B = ['plans', 'noi', 'csn', 'ms4', 'insp', 'records', 'not', 'keep3'], RT_A = ['plans', 'insp', 'records'];
  var RC_B = ['ops', 'noi', 'csn', 'ms4', 'sched', 'bmps', 'not', 'keep3'], RC_A = ['ops', 'sched', 'bmps'];
  var EC = { pev: 'Protection of Existing Vegetation', vbz: 'Vegetated Buffer Zones', srb: 'Soil Retention Blankets', geo: 'Geotextiles', mulch: 'Mulching/ Hydromulching', sst: 'Soil Surface Treatments', tseed: 'Temporary Seeding', pplant: 'Permanent Planting, Sodding or Seeding', ecl: 'Biodegradable Erosion Control Logs', rfd: 'Rock Filter Dams/ Rock Check Dams', vtrack: 'Vertical Tracking', swale: 'Interceptor Swale', riprap: 'Riprap', dike: 'Diversion Dike', tpsd: 'Temporary Pipe Slope Drain', embank: 'Embankment for Erosion Control', flume: 'Paved Flumes' };
  var EC_K = Object.keys(EC);
  var SC = { ecl: 'Biodegradable Erosion Control Logs', dewater: 'Dewatering Controls', inlet: 'Inlet Protection', rfd: 'Rock Filter Dams/ Rock Check Dams', sandbag: 'Sandbag Berms', fence: 'Sediment Control Fence', exit: 'Stabilized Construction Exit', turb: 'Floating Turbidity Barrier', vbz: 'Vegetated Buffer Zones', vfs: 'Vegetated Filter Strips' };
  var SC_K = Object.keys(SC);
  var VEH = { mud: 'Excess dirt/mud on road removed daily', haul: 'Haul roads dampened for dust control', tarp: 'Loaded haul trucks to be covered with tarpaulin', exit: 'Stabilized construction exit', sweep: 'Daily street sweeping' };
  var PP = { chem: 'Chemical Management', concrete: 'Concrete and Materials Waste Management', debris: 'Debris and Trash Management', dust: 'Dust Control', sanitary: 'Sanitary Facilities' };
  var NSD = { hydrant: 'Fire hydrant flushings', irrig: 'Irrigation drainage', pavewash: 'Pavement washwater (where spills or leaks have not occurred, and detergents are not used)', potable: 'Potable water sources', springs: 'Springs', gw: 'Uncontaminated groundwater', vehwash: 'Water used to wash vehicles or control dust', other: 'Other allowable non-stormwater discharges as allowed by TPDES GP TXR150000.' };
  var NSD_K = Object.keys(NSD);

  function keys(o) { return Object.keys(o); }
  function L(id) { return LAYOUT; }
  function has(v, id) { return !!(LAYOUT[v] && LAYOUT[v].fields[id]); }
  function nrows(v, id) { var f = LAYOUT[v].fields[id]; return f ? f.rows.length : 0; }

  /* ---------- field catalog (sheet order). kind: text | area | check | tp | table | radio ---------- */
  function sections(v) {
    var B = v === 'B', S = [];
    function sec(o) { S.push(o); return o; }
    function chk(id, label, extra) { var o = { id: id, label: label, kind: 'check' }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
    function others(prefix, n, tp) { var a = []; for (var i = 1; i <= n; i++) a.push({ id: prefix + '.o' + i, label: 'Other', kind: tp ? 'tpother' : 'other', check: tp ? null : prefix + '.o' + i + '.c' }); return a; }
    sec({ id: 'title', sheet: 0, num: '', title: 'Title block (both sheets)', fields: [
      { id: 't.proj', label: 'Project No.', kind: 'text', pdf: ['t.proj.1', 't.proj.2'] },
      { id: 't.fed', label: 'Fed. Rd. Div. No.', kind: 'text', pdf: ['t.fed.1', 't.fed.2'] },
      { id: 't.dist', label: 'State Dist.', kind: 'text', pdf: ['t.dist.1', 't.dist.2'] },
      { id: 't.county', label: 'County', kind: 'text', pdf: ['t.county.1', 't.county.2'] },
      { id: 't.hwy', label: 'Highway No.', kind: 'text', pdf: ['t.hwy.1', 't.hwy.2'] },
      { id: 't.cont', label: 'Cont. (control, 4 digits)', kind: 'text', pdf: ['t.cont.1', 't.cont.2'] },
      { id: 't.sect', label: 'Sect. (section, 2 digits)', kind: 'text', pdf: ['t.sect.1', 't.sect.2'] },
      { id: 't.job', label: 'Job (3 digits)', kind: 'text', pdf: ['t.job.1', 't.job.2'] },
      { id: 't.sheet.1', label: 'Sheet No. on sheet 1', kind: 'text', pdf: ['t.sheet.1'] },
      { id: 't.sheet.2', label: 'Sheet No. on sheet 2', kind: 'text', pdf: ['t.sheet.2'] }] });
    sec({ id: '1.1', sheet: 1, num: '1.1', title: 'Project control section job (CSJ)', fields: [{ id: 'csj', label: 'CSJ', kind: 'text' }] });
    sec({ id: '1.2', sheet: 1, num: '1.2', title: 'Project limits', fields: [{ id: 'limFrom', label: 'From', kind: 'text' }, { id: 'limTo', label: 'To', kind: 'text' }] });
    sec({ id: '1.3', sheet: 1, num: '1.3', title: 'Project coordinates (decimal degrees)', fields: [{ id: 'bLat', label: 'Begin (Lat)', kind: 'text' }, { id: 'bLon', label: 'Begin (Long)', kind: 'text' }, { id: 'eLat', label: 'End (Lat)', kind: 'text' }, { id: 'eLon', label: 'End (Long)', kind: 'text' }] });
    sec({ id: '1.4', sheet: 1, num: '1.4', title: 'Total project area (acres)', fields: [{ id: 'totalArea', label: 'Total project area (acres)', kind: 'text' }] });
    sec({ id: '1.5', sheet: 1, num: '1.5', title: 'Total area to be disturbed (acres)', fields: [{ id: 'distArea', label: 'Total area to be disturbed (acres)', kind: 'text' }] });
    sec({ id: '1.6', sheet: 1, num: '1.6', title: 'Nature of construction activity', fields: [{ id: 'nature', label: 'Nature of construction activity', kind: 'area' }] });
    sec({ id: '1.7', sheet: 1, num: '1.7', title: 'Major soil types', fields: [{ id: 'soils', label: 'Soil types', kind: 'table', cols: ['Soil Type', 'Description'], rows: nrows(v, 'soils') }] });
    sec({ id: '1.8', sheet: 1, num: '1.8', title: 'Project specific locations (PSLs)', fields: [
      chk('psl.pre', 'PSLs determined during preconstruction meeting', { group: 'psl' }), chk('psl.con', 'PSLs determined during construction', { group: 'psl' }), chk('psl.none', 'No PSLs planned for construction', { group: 'psl' }),
      { id: 'psl', label: 'PSL type and sheet numbers', kind: 'table', cols: ['Type', 'Sheet #s'], rows: nrows(v, 'psl') }] });
    sec({ id: '1.9', sheet: 1, num: '1.9', title: 'Construction activities', fields: ACT_K.map(function (k, i) { return chk('act.' + k, ACT[i]); }).concat(others('act', 3)) });
    sec({ id: '1.10', sheet: 1, num: '1.10', title: 'Potential pollutants and sources', fields: (B ? POL_B : POL_A).map(function (k) { return chk('pol.' + k, POL[k]); }).concat(others('pol', 3)) });
    sec({ id: '1.11', sheet: 1, num: '1.11', title: 'Receiving waters', fields: [{ id: 'recv', label: 'Receiving waters (flow path to a TCEQ classified segment)', kind: 'table', cols: ['Tributaries', 'Classified Waterbody'], rows: nrows(v, 'recv') }] });
    sec({ id: '1.12', sheet: 1, num: '1.12', title: 'Roles and responsibilities: TxDOT', fields: (B ? RT_B : RT_A).map(function (k) { return chk('rt.' + k, RT[k], { pre: true }); }).concat(others('rt', B ? 3 : 2)) });
    sec({ id: '1.13', sheet: 1, num: '1.13', title: 'Roles and responsibilities: Contractor', fields: (B ? RC_B : RC_A).map(function (k) { return chk('rc.' + k, RC[k], { pre: true }); }).concat(others('rc', B ? 3 : 2)) });
    if (B) sec({ id: '1.14', sheet: 1, num: '1.14', title: 'Local MS4 operator coordination', fields: [{ id: 'ms4', label: 'MS4 entity', kind: 'table', cols: ['MS4 Entity'], rows: nrows(v, 'ms4') }] });
    sec({ id: '2.1', sheet: 2, num: '2.1', title: 'Erosion control and soil stabilization BMPs', fields: EC_K.map(function (k) { return { id: 'ec.' + k, label: EC[k], kind: 'tp' }; }).concat(others('ec', 4, true)) });
    sec({ id: '2.2', sheet: 2, num: '2.2', title: 'Sediment control BMPs', fields: SC_K.map(function (k) { return { id: 'sc.' + k, label: SC[k], kind: 'tp' }; }).concat(others('sc', 4, true)) });
    if (B) sec({ id: '2.2.1', sheet: 2, num: '2.2 (design capacity)', title: 'Sediment traps and sedimentation basins', fields: [
      { id: 'trap', label: 'Sediment Trap', kind: 'tp' }, chk('trap.calc', 'Trap: calculated volume runoff from 2-year, 24-hour storm for each acre of disturbed area'), chk('trap.3600', 'Trap: 3,600 cubic feet of storage per acre drained'),
      { id: 'basin', label: 'Sedimentation Basin', kind: 'tp' }, chk('basin.notreq', 'Not required (<10 acres disturbed)'), chk('basin.req', 'Required (>10 acres) and implemented.'),
      chk('basin.calc', 'Basin: calculated volume runoff from 2-year, 24-hour storm for each acre of disturbed area'), chk('basin.3600', 'Basin: 3,600 cubic feet of storage per acre drained'),
      chk('basin.nf', 'Required (>10 acres), but not feasible due to:'), chk('nf.area', 'Available area/Site geometry'), chk('nf.slope', 'Site slope/Drainage patterns'), chk('nf.soils', 'Site soils/Geotechnical factors'), chk('nf.safety', 'Public safety'),
      chk('nf.other.c', 'Other (specify)', { hidden: true }), { id: 'nf.other', label: 'Other (not feasible due to)', kind: 'text' }] });
    sec({ id: '2.3', sheet: 2, num: '2.3', title: 'Permanent controls', fields: [{ id: 'perm', label: 'BMPs to be left in place post construction', kind: 'table', cols: ['Type', 'Stationing From', 'Stationing To'], rows: nrows(v, 'perm') }] });
    sec({ id: '2.4', sheet: 2, num: '2.4', title: 'Offsite vehicle tracking controls', fields: keys(VEH).map(function (k) { return chk('veh.' + k, VEH[k]); }).concat(others('veh', 4)) });
    sec({ id: '2.5', sheet: 2, num: '2.5', title: 'Pollution prevention measures', fields: keys(PP).map(function (k) { return chk('pp.' + k, PP[k]); }).concat(others('pp', 4)) });
    sec({ id: '2.6', sheet: 2, num: '2.6', title: 'Vegetated buffer zones', fields: [
      chk('buf.text', 'Use a written statement instead of the table (erases the table on the PDF, as the guidance directs)', { local: true }),
      { id: 'buf.why', label: 'Statement (no surface waters present, or why buffers are infeasible and the equivalent controls with stationing)', kind: 'area', local: true },
      { id: 'buf', label: 'Vegetated buffer zones and stationing', kind: 'table', cols: ['Type', 'Stationing From', 'Stationing To'], rows: nrows(v, 'buf') }] });
    sec({ id: '2.7', sheet: 2, num: '2.7', title: 'Allowable non-stormwater discharges', fields: NSD_K.map(function (k) { return chk('nsd.' + k, NSD[k], { pre: true }); }) });
    sec({ id: '2.8', sheet: 2, num: '2.8', title: 'Dewatering', fields: [], fixed: true });
    sec({ id: '2.9', sheet: 2, num: '2.9', title: 'Inspections', fields: [], fixed: true });
    sec({ id: '2.10', sheet: 2, num: '2.10', title: 'Maintenance', fields: [], fixed: true });
    if (B) sec({ id: '2.11', sheet: 1, num: 'Design engineer note', title: 'Signing and sealing the sheets', fields: [
      chk('seal.nolay', 'No signed/sealed SWP3 Layout (or "Erosion Control Layout") is provided for the project.'), chk('seal.calc', 'Calculations for a sediment trap or sediment basin are included in the SWP3.'),
      chk('seal.nofeas', 'The third box is checked under Sedimentation Basin of Section 2.0: "Required (>10 acres), but not feasible due to:"')] });
    sec({ id: 'x', sheet: 0, num: '', title: 'Notes kept with the project (not printed on the sheet)', local: true, fields: [
      { id: 'x.preparer', label: 'SWP3 summary sheet preparer (name, firm)', kind: 'text', local: true }, { id: 'x.prepared', label: 'Date prepared', kind: 'text', local: true },
      { id: 'x.txdotAuth', label: 'TxDOT TPDES authorization no. / NOI date', kind: 'text', local: true }, { id: 'x.contrAuth', label: 'Contractor TPDES authorization no. / NOI date', kind: 'text', local: true },
      { id: 'x.contact', label: 'Contacts (TxDOT area engineer, contractor, MS4 coordinator)', kind: 'area', local: true }] });
    return S;
  }

  /* ---------- prefill ---------- */
  function str(x) { return x == null ? '' : String(x).trim(); }
  function fixN(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false }); }
  function splitLines(s) { return str(s).split(/\r?\n|;/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function parseLimits(t) {
    t = str(t); if (!t) return ['', ''];
    var m = /^\s*(?:from[:\s]+)?([\s\S]+?)\s*(?:\r?\n|\s)\s*to[:\s]+([\s\S]+)$/i.exec(t);
    if (m && /^from/i.test(t)) return [m[1].trim(), m[2].trim()];
    var m2 = /([\s\S]+?)\s+to\s+([\s\S]+)/i.exec(t);
    if (/^from\b/i.test(t) && m2) return [m2[1].replace(/^from[:\s]+/i, '').trim(), m2[2].trim()];
    var ls = t.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (ls.length >= 2) return [ls[0].replace(/^from[:\s]+/i, ''), ls.slice(1).join(' ').replace(/^to[:\s]+/i, '')];
    return [t, ''];
  }
  function parseLatLon(t) { var m = str(t).match(/-?\d+(?:\.\d+)?/g); return m && m.length >= 2 ? [m[0], m[1]] : ['', '']; }
  function parseCsj(t) { var m = /(\d{4})\s*-?\s*(\d{2})\s*-?\s*(\d{3})/.exec(str(t)); return m ? [m[1], m[2], m[3]] : ['', '', '']; }

  var BMP_MAP = {
    sediment_fence: [['sc.fence.T']], erosion_log: [['ec.ecl.T'], ['sc.ecl.T']], rock_exit: [['sc.exit.T'], ['veh.exit']], inlet_protection: [['sc.inlet.T']],
    rock_filter_dam: [['ec.rfd.T'], ['sc.rfd.T']], vertical_tracking: [['ec.vtrack.T']], erosion_blanket: [['ec.srb.T']], seeding_sod: [['ec.tseed.T'], ['ec.mulch.T'], ['ec.pplant.P']],
    preserve_vegetation: [['ec.pev.T']], slope_drain: [['ec.tpsd.T']], outlet_protection: [['ec.riprap.P']], diversion: [['ec.dike.T'], ['ec.swale.T']],
    vegetated_buffer: [['ec.vbz.T'], ['sc.vbz.T'], ['sc.vfs.T']], dewatering_controls: [['sc.dewater.T']], turbidity_barrier: [['sc.turb.T']], street_sweeping: [['veh.sweep']],
    concrete_washout: [['pp.concrete']], spill_response: [['pp.chem']], chemical_material: [['pp.chem'], ['pp.debris']], sanitary_waste: [['pp.sanitary']],
    sediment_trap: [['trap.T']], sediment_basin: [['basin.T']]
  };

  function variantFor(project) {
    var s = project.summary || {};
    if (s.variant === 'A' || s.variant === 'B') return s.variant;
    var t = M.totals(project.form).total;
    return t > 0 && t < 1 ? 'A' : 'B';
  }

  /* prefill: returns { v: {id: value}, why: {id: short reason} } from the project form, selected BMPs and design results */
  function prefill(project) {
    var f = project.form || {}, a = f.act || {}, ns = f.nsd || {}, perm = M.permitDetermination(f), tot = perm.totals;
    var ids = M.selectedIds(f, project.sel || {}), on = {}; ids.forEach(function (i) { on[i] = true; });
    var v = {}, why = {};
    function put(id, val, w) { v[id] = val; if (w) why[id] = w; }
    var cs = parseCsj(f.csj), lim = parseLimits(f.limits), bg = parseLatLon(f.coordsBegin), en = parseLatLon(f.coordsEnd);
    put('t.county', str(f.county).replace(/\s*county\s*$/i, ''), 'Project tab: County');
    if (str(f.highway)) put('t.hwy', str(f.highway), 'Project tab: Highway / roadway');
    if (cs[0]) { put('t.cont', cs[0], 'Parsed from the CSJ (4-2-3 digit pattern, Assumed)'); put('t.sect', cs[1], 'Parsed from the CSJ'); put('t.job', cs[2], 'Parsed from the CSJ'); }
    if (str(f.csj)) put('csj', str(f.csj), 'Project tab: CSJ(s)');
    if (lim[0]) put('limFrom', lim[0], 'Project tab: Project limits (split at "to")'); if (lim[1]) put('limTo', lim[1], 'Project tab: Project limits');
    if (bg[0]) { put('bLat', bg[0], 'Project tab: Begin lat, long'); put('bLon', bg[1], 'Project tab: Begin lat, long'); }
    if (en[0]) { put('eLat', en[0], 'Project tab: End lat, long'); put('eLon', en[1], 'Project tab: End lat, long'); }
    if (tot.total > 0) put('distArea', fixN(tot.total), 'Project tab: disturbed acres + support-activity (PSL) acres, as guidance 1.5 sums them');
    if (str(f.nature)) put('nature', str(f.nature), 'Project tab: Nature of the construction activity');
    splitLines(f.soils).slice(0, nrows('B', 'soils') || 7).forEach(function (s, i) { put('soils.' + i + '.0', s, 'Project tab: Soil types'); });
    if (tot.support === 0 && !a.support) put('psl.none', true, 'No support-activity acres or support activities entered on the Project tab');
    // 1.9 construction activities (typical roadway list; every box is editable)
    put('act.mob', true, 'Assumed: mobilization occurs on every project');
    put('act.sed', true, 'Assumed: controls are installed before soil disturbance (Part III.C)');
    if (a.demolition) put('act.pave', true, 'Project tab: demolition of structures or pavement');
    if (a.slopes) { put('act.grade', true, 'Project tab: slopes, embankment or cut slopes'); put('act.slopes', true, 'Project tab: slopes'); }
    if (a.ditches) put('act.slopes', true, 'Project tab: roadside ditches / channels');
    if (a.outfalls) put('act.culinst', true, 'Project tab: new or modified outfalls, culverts or pipe outlets');
    if (on.seeding_sod) put('act.reveg', true, 'A seeding / sod BMP is selected');
    put('act.stab', true, 'Assumed: final stabilization is needed before the permit ends (Part III.F.2(b)iv)');
    // 1.10 pollutants and sources
    put('pol.sed', true, 'Every project that disturbs soil (sediment is the main pollutant)');
    if (a.fueling) { put('pol.fuel', true, 'Project tab: fuel, oil or chemical storage'); put('pol.solv', true, 'Project tab: fuel, oil or chemical storage'); }
    if (a.exits) put('pol.track', true, 'Project tab: vehicles leave onto a paved road');
    put('pol.debris', true, 'Construction waste is covered at every site (Part IV.D.2-4)'); put('pol.trash', true, 'Trash is covered at every site (Part IV.D.2-4)');
    if (a.dewatering) put('pol.water', true, 'Project tab: dewatering expected');
    if (a.sanitary) put('pol.sanit', true, 'Project tab: portable toilets / sanitary facilities');
    if (a.stockpiles) put('pol.stock', true, 'Project tab: stockpiles');
    if (a.concrete) put('pol.concwash', true, 'Project tab: concrete work');
    // 1.11 receiving waters
    if (str(f.receiving) || str(f.segment)) {
      var seg = str(f.segment);
      if (f.tmdl === 'yes') seg += (seg ? ' ' : '') + '* (' + (str(f.tmdlNote) || 'pollutant') + ')';
      put('recv.0.0', str(f.receiving), 'Project tab: Nearest receiving water'); put('recv.0.1', seg, 'Project tab: Flow path to first classified segment' + (f.tmdl === 'yes' ? ' plus the impairment note' : ''));
    }
    // 1.12 / 1.13 roles: the template ships with every role ticked; the guidance says to untick the NOI lines under 5 acres
    var large = perm.tier === 'large';
    RT_B.forEach(function (k) { put('rt.' + k, true, 'Template default (guidance 1.12 and 1.13: standard condition)'); });
    RC_B.forEach(function (k) { put('rc.' + k, true, 'Template default (guidance 1.12 and 1.13: standard condition)'); });
    if (perm.tier !== 'unknown') { put('rt.noi', large, large ? 'Permit check: large construction activity (5 acres or more): NOI required' : 'Guidance 1.12: deselect the NOI line for 1 to less than 5 acres'); put('rc.noi', large, large ? 'Permit check: large construction activity: NOI required' : 'Guidance 1.13: deselect the NOI line for 1 to less than 5 acres'); }
    if (a.dewatering) { put('rc.o1', 'Conduct daily dewatering inspections', 'Guidance 1.13 note: add this line when dewatering is needed'); }
    // 1.14 MS4
    splitLines(String(f.ms4 || '').replace(/\n+/g, ';')).slice(0, 5).forEach(function (s, i) { put('ms4.' + i + '.0', s, 'Project tab: MS4 operator(s)'); });
    // 2.1 / 2.2 BMPs
    ids.forEach(function (id) { (BMP_MAP[id] || []).forEach(function (m) { put(m[0], true, 'BMP selected: ' + (M.bmpById(id) || { name: id }).name); }); });
    // 2.2 trap and basin
    var open = M.num(f.openAcres);
    if (open != null) {
      if (open >= 10) { if (f.basinInfeasible) { put('basin.nf', true, 'Project tab: basin required but not feasible'); put('seal.nofeas', true, 'The "not feasible" box is checked, so the sheet note says a seal may be needed'); } else if (on.sediment_basin) put('basin.req', true, 'Largest open area is 10 acres or more and a basin is selected'); }
      else put('basin.notreq', true, 'Largest open area is under 10 acres (Project tab)');
    }
    if (f.basinInfeasible && str(f.basinWhy)) put('nf.other', str(f.basinWhy).replace(/\s+/g, ' '), 'Project tab: why the basin is not feasible');
    if (f.basinInfeasible && str(f.basinWhy)) put('nf.other.c', true);
    var d = project.design || {};
    if (d.ba && d.ba.A != null && d.ba.A !== '') put('seal.calc', true, 'Design tab holds basin or trap storage calculations');
    // 2.3 permanent controls
    if (str(f.permanentNote)) put('perm.0.0', str(f.permanentNote).replace(/\s+/g, ' '), 'Project tab: Permanent stormwater controls');
    // 2.4 / 2.5
    if (a.exits) put('veh.mud', true, 'Project tab: vehicles leave onto a paved road');
    if (ns.dust) put('pp.dust', true, 'Project tab: water used to control dust');
    if (a.fueling) put('pp.chem', true, 'Project tab: fuel, oil or chemical storage');
    if (a.concrete) put('pp.concrete', true, 'Project tab: concrete work');
    put('pp.debris', true, 'Debris and trash are covered at every site (Part IV.D.2-4)');
    if (a.sanitary) put('pp.sanitary', true, 'Project tab: portable toilets');
    // 2.6 buffers
    if (f.bufferInfeasible) { put('buf.text', true, 'Project tab: buffer not feasible'); if (str(f.bufferWhy)) put('buf.why', str(f.bufferWhy), 'Project tab: why the buffer is not feasible'); }
    else if (!a.surfaceWater) { put('buf.text', true, 'No surface water on or adjacent to the site (Project tab)'); put('buf.why', 'No surface waters present, vegetated buffer zones are not planned.', 'Guidance 2.6 wording for sites with no surface waters'); }
    // 2.7 allowable non-stormwater discharges
    var anyNsd = D_NSD_KEYS.some(function (k) { return ns[k]; });
    NSD_K.forEach(function (k) { put('nsd.' + k, true, 'Template default (standard condition)'); });
    if (anyNsd) {
      var m = { hydrant: ns.hydrant, irrig: ns.irrigation, pavewash: ns.wash, potable: ns.potable, springs: ns.groundwater, gw: ns.groundwater, vehwash: ns.wash || ns.dust, other: ns.fire || ns.ac };
      NSD_K.forEach(function (k) { put('nsd.' + k, !!m[k], 'Project tab: allowable non-stormwater discharges'); });
    }
    if (project.summary && project.summary.meta) {}
    return { v: v, why: why };
  }
  var D_NSD_KEYS = ['fire', 'hydrant', 'wash', 'dust', 'potable', 'ac', 'groundwater', 'irrigation'];

  /* effective values = prefill, then the user's saved edits on top */
  function values(project) {
    var p = prefill(project), over = (project.summary && project.summary.v) || {}, out = {}, src = {};
    Object.keys(p.v).forEach(function (k) { out[k] = p.v[k]; src[k] = 'prefill'; });
    Object.keys(over).forEach(function (k) { out[k] = over[k]; src[k] = 'user'; });
    // title-block control/section/job follow the CSJ as it stands now (including an edit made on the Summary tab)
    var cp = parseCsj(textOf(out, 'csj'));
    if (cp[0]) ['t.cont', 't.sect', 't.job'].forEach(function (k, i) { if (src[k] !== 'user') { out[k] = cp[i]; src[k] = 'prefill'; p.why[k] = 'Parsed from the CSJ in 1.1 (4-2-3 digit pattern, Assumed)'; } });
    return { val: out, src: src, why: p.why };
  }
  function truthy(x) { return x === true; }
  function textOf(vals, id) { var x = vals[id]; return x == null || x === true || x === false ? '' : String(x).trim(); }

  /* ---------- text fitting (pure; the caller supplies measure(text, size) -> width in points) ---------- */
  function wrapWords(measure, text, size, widths) {
    var words = String(text).replace(/\s+/g, ' ').trim().split(' '), lines = [], cur = '', li = 0;
    function w() { return widths[Math.min(li, widths.length - 1)]; }
    for (var i = 0; i < words.length; i++) {
      var wd = words[i], t = cur ? cur + ' ' + wd : wd;
      if (measure(t, size) <= w()) { cur = t; continue; }
      if (cur) { lines.push(cur); li++; cur = ''; }
      while (measure(wd, size) > w() && wd.length > 1) {          // break an over-long word by characters
        var k = wd.length; while (k > 1 && measure(wd.slice(0, k), size) > w()) k--;
        lines.push(wd.slice(0, k)); li++; wd = wd.slice(k);
      }
      cur = wd;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  /* Fits text into maxLines lines of the given widths, shrinking the font from size to minSize. Returns { lines, size, truncated }. */
  function fitLines(measure, text, widths, maxLines, size, minSize) {
    text = String(text || '').trim(); if (!text) return { lines: [], size: size, truncated: false };
    var s = size, lines;
    for (; s >= minSize - 1e-9; s -= 0.25) { lines = wrapWords(measure, text, s, widths); if (lines.length <= maxLines) return { lines: lines, size: s, truncated: false }; }
    s = minSize; lines = wrapWords(measure, text, s, widths).slice(0, maxLines);
    var last = lines[maxLines - 1], w = widths[Math.min(maxLines - 1, widths.length - 1)];
    while (last.length && measure(last + '...', s) > w) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '...';
    return { lines: lines, size: s, truncated: true };
  }
  function approxMeasure(text, size) { return String(text).length * size * 0.5; }   // Helvetica averages about 0.5 em per character

  /* ---------- draw plan for the PDF writer ---------- */
  function checkValue(vals, id) {
    var m;
    if ((m = /^(.*\.o\d)\.c$/.exec(id))) return textOf(vals, m[1]) !== '';
    if (id === 'nf.other.c') return textOf(vals, 'nf.other') !== '';
    if (/^seal2\./.test(id)) return truthy(vals['seal.' + id.slice(6)]);
    return truthy(vals[id]);
  }
  function plan(project, opts) {
    opts = opts || {}; var v = opts.variant || variantFor(project), vals = values(project).val, Fl = LAYOUT[v].fields, ops = [], warn = [];
    Object.keys(Fl).forEach(function (id) {
      var f = Fl[id], text, m;
      if (f.t === 'c') { var on = checkValue(vals, id); if (on || f.pre) ops.push({ k: 'x', p: f.p, x: f.x, y: f.y, w: f.w, h: f.h, on: on, pre: !!f.pre, id: id }); }
      else if (f.t === 't') { text = textOf(vals, id); if (text) ops.push({ k: 'text', p: f.p, x0: f.x0, x1: f.x1, y: f.y, size: f.size + 1, text: text, id: id }); }
      else if (f.t === 'a') { text = textOf(vals, id); if (text) ops.push({ k: 'para', p: f.p, lines: f.lines, size: f.size, text: text, id: id }); }
      else if (f.t === 'cell') { var base = id.replace(/\.[12]$/, ''); if (/^t\.sheet\.[12]$/.test(id)) base = id; text = textOf(vals, base); if (text) ops.push({ k: 'cell', p: f.p, x0: f.x0, x1: f.x1, y0: f.y0, y1: f.y1, size: f.size, text: text, id: id }); }
      else if (f.t === 'tbl') {
        if (id === 'buf' && truthy(vals['buf.text'])) {
          var x0 = f.cols[0][0], x1 = f.cols[f.cols.length - 1][1], y0 = f.top != null ? f.top : f.rows[0][0], y1 = f.rows[f.rows.length - 1][1];
          ops.push({ k: 'wipe', p: f.p, x0: x0 - 1.5, y0: y0 - 1.5, x1: x1 + 1.5, y1: y1 + 1.5, id: id });
          text = textOf(vals, 'buf.why'); if (text) ops.push({ k: 'box', p: f.p, x0: x0 + 3, x1: x1 - 3, y0: y0 + 4, y1: y1 - 3, size: 8, text: text, id: 'buf.why' });
        } else {
          f.rows.forEach(function (r, ri) { f.cols.forEach(function (c, ci) { text = textOf(vals, id + '.' + ri + '.' + ci); if (text) ops.push({ k: 'box', p: f.p, x0: c[0] + 2, x1: c[1] - 2, y0: r[0] + 1.5, y1: r[1] - 1.5, size: f.size, text: text, id: id + '.' + ri + '.' + ci }); }); });
        }
      }
    });
    return { variant: v, ops: ops, warnings: warn };
  }

  /* ---------- checks shown to the user ---------- */
  function checks(project) {
    var f = project.form || {}, vals = values(project).val, v = variantFor(project), perm = M.permitDetermination(f), out = [];
    function add(level, msg, src) { out.push({ level: level, msg: msg, src: src || 'TXDOT' }); }
    var dist = M.num(textOf(vals, 'distArea')), total = M.num(textOf(vals, 'totalArea'));
    if (dist != null && total != null && dist > total + 1e-9) add('warn', 'Total area to be disturbed (' + dist + ' ac) is more than the total project area (' + total + ' ac). The guidance says disturbed area may be less than or equal to, never more than, the total project area (1.5).');
    if (total == null && dist != null) add('info', 'Total project area (1.4) is blank. It includes undisturbed ROW and easements plus PSLs, so it is not filled automatically.');
    if (v === 'A' && perm.totals.total >= 1) add('warn', 'You chose the less-than-1-acre sheet, but this project disturbs ' + fixN(perm.totals.total) + ' acres. The guidance uses the 1-acre-or-more sheet for 1 acre or more.');
    if (v === 'B' && perm.totals.total > 0 && perm.totals.total < 1) add('info', 'This project disturbs less than 1 acre. The guidance provides the shorter less-than-1-acre sheet for that case (a Summary Sheet is still needed when EPICs depend on stormwater controls).');
    if (perm.tier !== 'unknown') {
      var noi = truthy(vals['rt.noi']);
      if (perm.tier === 'large' && v === 'B' && !noi) add('warn', 'The permit check says large construction activity (5 acres or more): the NOI lines under 1.12 and 1.13 should stay ticked.', 'TCEQ');
      if (perm.tier !== 'large' && v === 'B' && noi) add('warn', 'Under 5 acres of disturbance, the guidance says to untick "Submit Notice of Intent (NOI) to TCEQ (>=5 acres)" under both TxDOT and Contractor (1.12 and 1.13).');
    }
    if (f.act && f.act.dewatering && !/dewater/i.test(textOf(vals, 'rc.o1') + textOf(vals, 'rc.o2') + textOf(vals, 'rc.o3'))) add('info', 'Dewatering is expected: the guidance asks you to add "conduct daily dewatering inspections" under the Contractor roles (1.13).');
    var open = M.num(f.openAcres);
    if (v === 'B' && open != null) {
      if (open >= 10 && truthy(vals['basin.notreq'])) add('warn', 'Sedimentation Basin is marked "Not required (<10 acres disturbed)" but the largest open area is ' + open + ' acres. A basin is required where feasible (Part III.F.2(c)i(A)).', 'TCEQ');
      if (open < 10 && truthy(vals['basin.req'])) add('info', 'Basin marked "Required (>10 acres)" but the largest open area is ' + open + ' acres.');
    }
    if (v === 'B' && truthy(vals['basin.nf']) && !['nf.area', 'nf.slope', 'nf.soils', 'nf.safety'].some(function (k) { return truthy(vals[k]); }) && !textOf(vals, 'nf.other')) add('warn', '"Required but not feasible" is ticked but no reason is ticked. The permit requires the reason to be documented (Part III.F.2(c)i(A)(3)).', 'TCEQ');
    if (v === 'B' && (truthy(vals['basin.nf']) || truthy(vals['seal.calc'])) && !truthy(vals['seal.calc']) && !truthy(vals['seal.nofeas'])) add('info', 'The sheet note says a signed and sealed SWP3 is needed when basin or trap calculations are included, or when the basin is "not feasible".');
    if (v === 'B' && (truthy(vals['seal.nolay']) || truthy(vals['seal.calc']) || truthy(vals['seal.nofeas']))) add('info', 'A seal-trigger box is ticked. This tool cannot sign or seal. A licensed engineer must sign and seal both sheets in the bottom right corner (guidance 2.11).');
    if (f.type === 'txdot' && f.inspMode && f.inspMode !== 'd7') add('info', 'Your Project tab uses an inspection cycle other than every 7 days. Sheet text 2.9 prints "at least once every seven (7) days" and this tool cannot change that text. The guidance lets designers make limited district-specific changes to 2.9 after talking with construction staff.');
    if (f.act && f.act.surfaceWater && !truthy(vals['buf.text']) && !['buf.0.0', 'buf.1.0'].some(function (k) { return textOf(vals, k); })) add('info', 'Surface water is on or next to the site but 2.6 has no buffer rows or explanation. Guidance 2.6: show the buffer location, or give the reason it is infeasible and the equivalent controls.');
    if (f.secondary && String(f.secondary).trim()) add('info', 'A secondary operator is entered. Guidance 1.12/1.13: where TxDOT is the secondary operator (design-build, some local-let on-system projects) the roles on this sheet must be adjusted.');
    if (!textOf(vals, 'csj')) add('info', 'CSJ (1.1) is blank. List the controlling CSJ and every CSJ covered by the authorization.');
    return out;
  }

  /* ---------- readable export (Markdown / print) ---------- */
  function exportModel(project) {
    var v = variantFor(project), S = sections(v), vals = values(project).val, out = [];
    S.forEach(function (s) {
      var rows = [];
      s.fields.forEach(function (fd) {
        if (fd.hidden) return;
        if (fd.kind === 'check' || fd.kind === 'radio') rows.push([fd.label, truthy(vals[fd.id]) ? 'X' : '', 'c']);
        else if (fd.kind === 'tp') rows.push([fd.label, ['T', 'P'].filter(function (k) { return truthy(vals[fd.id + '.' + k]); }).join(' + ') || '', 'tp']);
        else if (fd.kind === 'tpother') { var t = ['T', 'P'].filter(function (k) { return truthy(vals[fd.id + '.' + k]); }).join(' + '); var tx = textOf(vals, fd.id); if (t || tx) rows.push(['Other: ' + tx, t, 'tp']); }
        else if (fd.kind === 'other') { var tx2 = textOf(vals, fd.id); if (tx2) rows.push(['Other', tx2, 't']); }
        else if (fd.kind === 'table') { for (var r = 0; r < fd.rows; r++) { var cells = fd.cols.map(function (c, ci) { return textOf(vals, fd.id + '.' + r + '.' + ci); }); if (cells.some(Boolean)) rows.push(['Row ' + (r + 1) + (fd.cols.length > 1 ? ' (' + fd.cols.join(' | ') + ')' : ''), cells.join(' | '), 't']); } }
        else rows.push([fd.label, textOf(vals, fd.id), 't']);
      });
      out.push({ id: s.id, num: s.num, title: s.title, sheet: s.sheet, fixed: !!s.fixed, local: !!s.local, rows: rows });
    });
    return out;
  }
  function toMarkdown(project) {
    var v = variantFor(project), n = M.todayStr(), md = ['# TxDOT SWP3 Summary Sheet answers: ' + (project.name || 'Project'), '',
      'Sheet version: ' + SHEETS[v].title + ', 2023 template ("July 2023" on the form). Generated ' + n + ' by SWP3 Builder. Draft for engineer review; not signed or sealed. Fill the official sheet from TxDOT: ' + PAGE_URL, ''];
    exportModel(project).forEach(function (s) {
      md.push('## ' + (s.num ? s.num + ' ' : '') + s.title);
      if (s.fixed) md.push('_Fixed language on the sheet. Nothing to enter._');
      s.rows.forEach(function (r) {
        if (r[2] === 'c') md.push('- [' + (r[1] === 'X' ? 'x' : ' ') + '] ' + r[0]);
        else if (r[2] === 'tp') md.push('- ' + r[0] + ': ' + (r[1] || 'not used'));
        else md.push('- ' + r[0] + ': ' + (r[1] || '(blank)'));
      });
      md.push('');
    });
    return md.join('\n');
  }
  function toJson(project) {
    var v = variantFor(project), vals = values(project).val, flat = {};
    Object.keys(vals).forEach(function (k) { if (vals[k] !== '' && vals[k] !== false) flat[k] = vals[k]; });
    return JSON.stringify({ app: 'SWP3 Builder', kind: 'swp3-summary-sheet', sheet: { variant: v, title: SHEETS[v].title, file: SHEETS[v].file, sha256: SHEETS[v].sha256, source: SHEETS[v].url, template: 'July 2023' }, project: project.name, exported: new Date().toISOString(), values: flat, note: 'Draft for engineer review; not signed or sealed.' }, null, 1);
  }

  var api = { BUNDLED: BUNDLED, SHEETS: SHEETS, PAGE_URL: PAGE_URL, LAYOUT: LAYOUT, sections: sections, prefill: prefill, values: values, variantFor: variantFor, plan: plan, checks: checks,
    fitLines: fitLines, wrapWords: wrapWords, approxMeasure: approxMeasure, parseLimits: parseLimits, parseLatLon: parseLatLon, parseCsj: parseCsj, exportModel: exportModel, toMarkdown: toMarkdown, toJson: toJson,
    textOf: textOf, checkValue: checkValue, BMP_MAP: BMP_MAP };
  if (isNode) module.exports = api;
  root.SwpSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
