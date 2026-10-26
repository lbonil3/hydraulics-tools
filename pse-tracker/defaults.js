/* PS&E Tracker: default submittal stages and drainage deliverables checklist.
 *
 * Every item carries `src` (key into SOURCES) and `basis`:
 *   'S' = deliverable AND the stage it is placed at come from the cited TxDOT page.
 *   'P' = deliverable is from the cited TxDOT page, but the stage it is placed at is ASSUMED (editable).
 *   'A' = not sourced; assumed/editable.
 * All URLs below were opened and read when this file was written (see PR description).
 * The TxDOT "PS&E QC Milestone Checklist" portfolio (the authoritative per-milestone list) was NOT readable,
 * so stage placement marked 'P' must be confirmed against it / the District's own checklist.
 */
(function (root) {
  var SOURCES = {
    PSE62: { label: 'PS&E Preparation Manual 6.2 Engineering Reviews (Table 6-1, 6.2.2.3, 6.2.3)', url: 'https://www.txdot.gov/manuals/des/pse/chapter-6--ps-e-submission--review-and-processing/section-2--engineering-reviews.html' },
    PSE311: { label: 'PS&E Preparation Manual 3.1.1 General Plan Sheets (Table 3-1, E&Q, Quantity Summary)', url: 'https://www.txdot.gov/manuals/des/pse/chapter-3--plan-set-development/section-1--standard-traditional-plan-sheets/general-plan-sheets.html' },
    PSE315: { label: 'PS&E Preparation Manual 3.1.5 Drainage Plan Sheets', url: 'https://www.txdot.gov/manuals/des/pse/chapter-3--plan-set-development/section-1--standard-traditional-plan-sheets/-drainage-plan-sheets---for-culverts--storm-sewer-.html' },
    PDP77: { label: 'Project Development Process Manual 7.7 Drainage Design (7.7.1-7.7.9)', url: 'https://www.txdot.gov/manuals/des/pdp/chapter-7--final-design/7-7-drainage-design.html' },
    HDM: { label: 'Hydraulic Design Manual, Ch. 3 Sec. 5 Documentation Reference Tables (Tables 3-1 to 3-10)', url: 'https://www.txdot.gov/manuals/des/hyd/chapter-3--processes-and-procedures-in-txdot-hydro/section-5--documentation-and-deliverables/documentation-reference-tables.html' },
    PRESUB: { label: 'TxDOT 100% PS&E pre-submittal preparation (estimate, speclist, SWP3, seals)', url: 'https://www.txdot.gov/business/resources/design-tools-training/electronic-plan-set-guidance/pse-pre-submittal-preparation.html' }
  };

  /* Milestone names/descriptions: PS&E Preparation Manual Table 6-1 (PSE62). Districts may combine or drop milestones. */
  var STAGES = [
    { name: 'Initial (30%)', key: 'initial' },
    { name: 'Detailed (60%)', key: 'detailed' },
    { name: 'Final (90/95%)', key: 'final' },
    { name: 'Sealed (100%)', key: 'sealed' },
    { name: 'Ready to Let (RTL)', key: 'rtl' }
  ];

  // [stageKey, group, title, src, basis, note]
  var ITEMS = [
    // ---- Initial (30%) ----
    ['initial', 'Data & hydrology', 'Field survey data, vertical datum, historical data (HDM Table 3-1)', 'HDM', 'S', 'HDM Table 3-1 marks these for Preliminary Review and PS&E Review.'],
    ['initial', 'Data & hydrology', 'FEMA FIS summary data/maps, soil maps, land use maps, stream gauge data (where applicable)', 'HDM', 'S', 'HDM Table 3-1.'],
    ['initial', 'Data & hydrology', 'Drainage area map(s) showing boundaries, outfalls, flow paths', 'HDM', 'S', 'HDM Table 3-2 (Preliminary Review + PS&E Review). Sheet content: PS&E Manual 3.1.5.1.'],
    ['initial', 'Data & hydrology', 'Watershed parameters (areas, runoff coefficients, slopes), assumptions, hydrologic method(s) and calculations', 'HDM', 'S', 'HDM Table 3-2.'],
    ['initial', 'Data & hydrology', 'Peak discharges for design and check floods (hydrographs where applicable)', 'HDM', 'S', 'HDM Table 3-2.'],
    ['initial', 'Data & hydrology', 'Coordinate with local FEMA floodplain administrator (if floodplain / NFIP applies)', 'PDP77', 'P', 'PDP 7.7.1-7.7.2 say coordinate early; exact milestone not stated.'],
    ['initial', 'Culverts', 'Culvert design criteria (allowable headwater, outlet velocities, FEMA) and preliminary hydraulic computations', 'HDM', 'S', 'HDM Table 3-4. Culverts with total span >= 20 ft are bridge-class (PDP 7.7.5).'],
    ['initial', 'Channels / ditches', 'Channel/ditch cross sections, thalweg profile, n-values, WSE and velocities (design and check)', 'HDM', 'S', 'HDM Table 3-3. Ditch shape per Roadway Design Manual (PDP 7.7.4).'],
    ['initial', 'Storm drain', 'Storm drain schematic/layout (trunklines, laterals, inlets, outfall, flow arrows) and hydraulic computations', 'HDM', 'S', 'HDM Table 3-7 (Preliminary Review + PS&E Review).'],
    ['initial', 'Storm drain', 'Evaluation of existing storm drain facility (if present)', 'HDM', 'S', 'HDM Table 3-7.'],
    ['initial', 'Storm drain', 'Optional: preliminary storm drain H&H submitted to DES-H&H for review (if District wants help)', 'PSE62', 'P', 'PS&E Manual 6.2.2.3 lists Preliminary Storm Drain Layouts as an optional DES review; timing not stated for this item.'],
    ['initial', 'Bridge-class', 'Preliminary Bridge Layout with scour and hydraulic analysis to BRG (bridge / bridge-class crossings)', 'PSE62', 'S', 'PS&E Manual 6.2.2.3: typically with Initial (30%) or between Initial and Detailed (60%). Delete if not applicable.'],
    ['initial', 'Pump stations', 'Pump station hydrology/hydraulics documentation (stage/storage, pump capacity, TDH) if a pump station is needed', 'HDM', 'S', 'HDM Table 3-6; PDP 7.7.8.1. Delete if not applicable.'],
    ['initial', 'Coordination', 'Identify utility conflicts with drainage elements (clash detection)', 'PDP77', 'P', 'PDP 7.7.7 and 7.7.9.1.'],
    ['initial', 'Coordination', 'Identify drainage easement / ROW needs', 'PDP77', 'P', 'PDP 7.7.2.'],

    // ---- Detailed (60%) ----
    ['detailed', 'Design refinement', 'Refine hydrology/hydraulics for final alignment and profile; verify design frequency, allowable velocities/headwater, FEMA/NFIP', 'PDP77', 'P', 'PDP 7.7.1-7.7.2 (final design).'],
    ['detailed', 'Design refinement', 'Hydraulic calculations previously approved (as verified in the engineering review)', 'PSE62', 'S', 'PS&E Manual 6.2.3 lists approval of hydraulic calculations among items verified at review.'],
    ['detailed', 'Plan sheets', 'Drainage area map sheet(s)', 'PSE315', 'P', 'PS&E Manual 3.1.5.1. Per-milestone content is in the QC Milestone Checklist.'],
    ['detailed', 'Plan sheets', 'Hydraulic calculation sheets (runoff computation table + hydraulic calculation table)', 'PSE315', 'P', 'PS&E Manual 3.1.5.2.'],
    ['detailed', 'Plan sheets', 'Cross-drainage culvert layouts (plan and cross section)', 'PSE315', 'P', 'PS&E Manual 3.1.5.3.'],
    ['detailed', 'Plan sheets', 'Storm drain plan and profile layouts with hydraulic grade line', 'HDM', 'S', 'HDM Table 3-7: plan/profile with HGL is marked for PS&E Review (not Preliminary). PS&E Manual 3.1.5.4.'],
    ['detailed', 'Plan sheets', 'Special ditch plan and profile sheets (may be on roadway P&P sheets)', 'PDP77', 'P', 'PDP 7.7.9.1.'],
    ['detailed', 'Plan sheets', 'Hydraulic Data Sheet for each bridge and bridge-class culvert', 'PDP77', 'P', 'PDP 7.7.9.3; PS&E Manual 3.1.5.2 / 3.1.7.1. Delete if not applicable.'],
    ['detailed', 'Plan sheets', 'Junction box and detention/retention facility details (if used)', 'PDP77', 'P', 'PDP 7.7.9.1.'],
    ['detailed', 'Plan sheets', 'Pump station detail sheets (if used)', 'HDM', 'S', 'HDM Table 3-6: pump station details marked for PS&E Review. PDP 7.7.9.2.'],
    ['detailed', 'Quantities', 'Draft drainage quantities and bid items (Drainage Quantity Summary)', 'PSE311', 'P', 'PS&E Manual 3.1.1.7 lists a Drainage Quantity Summary; draft timing assumed.'],
    ['detailed', 'Review', 'District multi-discipline review at Detailed (60%) - drainage comments addressed', 'PSE62', 'S', 'PS&E Manual 6.2.1: full review at minimum at Detailed (60%) and Final (90/95%).'],
    ['detailed', 'Review', 'Drainage section of PS&E QC Milestone Checklist completed and filed', 'PSE62', 'S', 'PS&E Manual 6.2.3 (retain in ProjectWise project record).'],

    // ---- Final (90/95%) ----
    ['final', 'Drainage report', 'Final drainage report (signed and sealed) + finalized H&H calc sheets to District, then DES-H&H approval, BEFORE the 90% submittal', 'PDP77', 'S', 'PDP 7.7.3.'],
    ['final', 'Plan sheets', 'Miscellaneous drainage details (inlet mods, pipe bedding, rebar/non-standard designs, support slabs, concrete collars, RC pipe connections, flume/channel details)', 'PSE315', 'P', 'PS&E Manual 3.1.5.5.'],
    ['final', 'Plan sheets', 'Drainage standards selected (box culverts, wingwalls, pipe headwalls, safety end treatments, etc.) and listed on Index of Sheets; modified standards marked (MOD)', 'PSE315', 'P', 'PS&E Manual 3.1.5.6 and 3.1.1.2.'],
    ['final', 'Plan sheets', 'Resolve utility conflicts; interim drainage for construction phasing; local-agency coordination if tying into their system', 'PDP77', 'P', 'PDP 7.7.9.1.'],
    ['final', 'Plan sheets', 'SWP3 layouts / summary: drainage patterns and discharge points consistent with drainage design', 'HDM', 'P', 'HDM Tables 3-9 and 3-10; PRESUB (SWP3 sheets required for 1+ acre disturbed).'],
    ['final', 'Quantities', 'Drainage Quantity Summary sheet complete; all quantities checked item by item', 'PSE62', 'P', 'PS&E Manual 6.2.3 (quantities checked item-by-item) and 3.1.1.7. Quantity Summary sheets are NOT sealed.'],
    ['final', 'Quantities', 'Estimate: correct bid codes and measurement methods; drainage quantities match plan sheets', 'PSE62', 'P', 'PS&E Manual 6.2.3 "Use of correct bid codes and method of measurements".'],
    ['final', 'Specs', 'Speclist reflects drainage specifications / special provisions', 'PRESUB', 'P', 'PRESUB "Speclist": ensure required special provisions are included prior to 100% submittal.'],
    ['final', 'Review', 'District multi-discipline review at Final (90/95%) - drainage comments addressed', 'PSE62', 'S', 'PS&E Manual 6.2.1.'],

    // ---- Sealed (100%) ----
    ['sealed', 'Plan sheets', 'Drainage plan sheets signed, sealed, dated; engineer approval note for standards used', 'PSE311', 'P', 'PS&E Manual 3.1.1.2 (approval note per engineer). Seal timing: Sealed (100%) per Table 6-1.'],
    ['sealed', 'Quantities', 'Estimate and Quantity (E&Q) sheet matches Quantity Summary tables and TxDOTCONNECT estimate', 'PSE311', 'S', 'PS&E Manual 3.1.1.6: Sealed (100%) E&Q generated at District.'],
    ['sealed', 'Quantities', 'Engineer\'s estimate sealed in TxDOTCONNECT', 'PSE62', 'S', 'PS&E Manual 6.2.3: estimate must be sealed or the proposal cannot be built. See also PRESUB.'],
    ['sealed', 'Specs', 'Speclist and General Notes final for drainage items', 'PRESUB', 'S', 'PRESUB: review speclist prior to 100% PS&E submittal.'],
    ['sealed', 'Records', 'Drainage report and H&H calculations filed in District project File of Record (permanent retention)', 'PDP77', 'P', 'PDP 7.7.3; HDM Ch. 3 Sec. 5.'],
    ['sealed', 'Review', 'Final engineering review documented (QC Milestone Checklist) and retained', 'PSE62', 'S', 'PS&E Manual 6.2 and 6.2.3.'],

    // ---- Ready to Let ----
    ['rtl', 'Letting package', 'Drainage bid items and quantities match between plan set and TxDOTCONNECT', 'PRESUB', 'S', 'PRESUB "Engineer\'s estimate".'],
    ['rtl', 'Letting package', 'Final engineering review complete before RTL (100%) submittal to DES-FPP', 'PSE62', 'S', 'PS&E Manual 6.2: required prior to RTL submittal.']
  ];

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function buildDefaultStages() {
    return STAGES.map(function (s) {
      return {
        id: uid('s'),
        name: s.name,
        items: ITEMS.filter(function (it) { return it[0] === s.key; }).map(function (it) {
          return { id: uid('i'), title: it[2], group: it[1], status: 'todo', owner: '', due: '', notes: '', src: it[3], basis: it[4], srcNote: it[5] };
        })
      };
    });
  }

  var api = { SOURCES: SOURCES, STAGES: STAGES, ITEMS: ITEMS, buildDefaultStages: buildDefaultStages, uid: uid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PseDefaults = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
