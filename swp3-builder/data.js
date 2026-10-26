/* SWP3 Builder: sources, BMP library and static rule text.
 *
 * Precedence (set by the owner): (1) TxDOT  ->  (2) TCEQ TXR150000 as the regulatory floor (the permit wins where TxDOT
 * is less strict; flagged in FLAGS)  ->  (3) City of Houston / Harris County / iSWM (secondary)  ->  (4) rule of thumb / assumed.
 *
 * Every SOURCES entry records what was actually done with it when this file was written (field `status`):
 *   'read'    = the document was downloaded/opened and the cited passage was read.
 *   'linked'  = the URL loads (HTTP 200) but its contents were NOT read in detail; only cited as a pointer.
 * Section numbers below were checked against the fetched text. Where a number could not be confirmed the document is cited without one.
 * Text lines are [badge, text] pairs so each generated item can show where it came from.
 */
(function (root) {
  var TXD = 'https://www.txdot.gov/content/dam/docs/division/env/stormwater/';
  function sheet(n) { return TXD + '075-' + n + '-bmp.docx'; }

  var BADGES = {
    TXDOT: { label: 'TxDOT', cls: 'tx' },
    TCEQ: { label: 'TCEQ', cls: 'tc' },
    ISWM: { label: 'iSWM', cls: 'sw' },
    HOU: { label: 'Houston', cls: 'ho' },
    HC: { label: 'Harris Co.', cls: 'hc' },
    ROT: { label: 'Rule of thumb', cls: 'rt' },
    ASSUMED: { label: 'Assumed', cls: 'as' }
  };

  var PERMIT = {
    id: 'TXR150000',
    title: 'TPDES Construction General Permit TXR150000 (2023 CGP)',
    effective: 'March 5, 2023',
    expires: 'March 5, 2028',
    expiresIso: '2028-03-05'
  };

  var SOURCES = {
    TXR: { badge: 'TCEQ', status: 'read', label: PERMIT.title + ' (permit text)', url: 'https://www.tceq.texas.gov/downloads/permitting/stormwater/general/construction/2023-cgp-txr150000.pdf',
      note: 'Read in full for Parts I-IV, VI, VII and Appendix A. TCEQ page states effective date March 5, 2023; permit text (Part II.E.5(d)) states it expires March 5, 2028. The older 2018 permit PDF at txr150000-cgp.pdf is superseded and was NOT used.' },
    TCEQ_PAGE: { badge: 'TCEQ', status: 'read', label: 'TCEQ: Stormwater General Permit for Construction Activities (page)', url: 'https://www.tceq.texas.gov/permitting/stormwater/construction',
      note: 'Read: 2023 CGP effective March 5, 2023, expires March 5, 2028; renewal stakeholder process begun (June 2026 meeting); large >= 5 acres, small 1 to < 5 acres, < 1 acre not regulated; forms 20961/20962/20963/20964; NOI/NOT via STEERS ePermits.' },
    TCEQ_20961: { badge: 'TCEQ', status: 'linked', label: 'TCEQ Form 20961: Large Construction Site Notice (primary operators)', url: 'https://www.tceq.texas.gov/downloads/permitting/stormwater/forms-tools/20961.pdf', note: 'Link loads; form wording not read. Form numbers are taken from the TCEQ page and permit text.' },
    TCEQ_20963: { badge: 'TCEQ', status: 'linked', label: 'TCEQ Form 20963: Small Construction Site Notice', url: 'https://www.tceq.texas.gov/downloads/permitting/stormwater/forms-tools/20963.pdf', note: 'Link loads; form wording not read.' },
    TCEQ_FACT: { badge: 'TCEQ', status: 'linked', label: '2023 CGP Fact Sheet', url: 'https://www.tceq.texas.gov/downloads/permitting/stormwater/general/construction/2023-cgp-factsheet.pdf', note: 'Link loads; not read.' },

    TXD_SWP3: { badge: 'TXDOT', status: 'read', label: 'TxDOT: Stormwater Pollution Prevention Plan (SWP3) guidance document (index page)', url: 'https://www.txdot.gov/business/resources/environmental/stormwater/stormwater-pollution-prevention-plan.html',
      note: 'Read. Lists the SWP3 Summary Sheets, Binder template and Appendices A-C with revision dates (Section 1 05/26; Section 2.1 04/26; Binder 10/26 as shown on the page). Projects letting from March 2023 follow these templates. SWP3 is required for every TxDOT project with soil disturbance, including < 1 acre.' },
    TXD_S1: { badge: 'TXDOT', status: 'read', label: 'TxDOT SWP3 Guidance, Section 1: Administrative Requirements', url: TXD + '915-02-gui.docx', note: 'Read: 1.2 Department requirements, 1.4 coverage limitations, 2.1-2.2 authorization (small/large), co-permittee shared SWP3.' },
    TXD_S21: { badge: 'TXDOT', status: 'read', label: 'TxDOT SWP3 Guidance, Section 2.1: SWP3 Summary Sheets (Part 1)', url: TXD + '915-08-gui.docx', note: 'Read (Version 3, April 2026): Summary Sheet 1 items 1.1-1.14 and Summary Sheet 2 items 2.1-2.11 including sediment trap/basin criteria.' },
    TXD_S22: { badge: 'TXDOT', status: 'read', label: 'TxDOT SWP3 Guidance, Section 2.2: SWP3 Binder (Part 2)', url: TXD + '915-07-gui.docx', note: 'Read the inspection (Form 2118), inspection-cycle, dewatering (Form 2675), inspector-qualification and delegation passages.' },
    TXD_TEMP: { badge: 'TXDOT', status: 'read', label: 'TxDOT SWP3 Binder template (projects >= 1 acre)', url: TXD + '915-01-tem.docx', note: 'Read: attachment list 1.1-1.3 and 2.1-2.12.' },
    TXD_SS_PAGE: { badge: 'TXDOT', status: 'read', label: 'TxDOT Roadway Standards (English): SWP3 Summary Sheets (Environmental, rdwylse.htm)', url: 'https://www.dot.state.tx.us/insdtdot/orgchart/cmd/cserve/standard/rdwylse.htm', note: 'Read 2026-10-26. Lists the two Summary Sheet PDFs (swp3b23 for 1 acre or more, swp3a23 for less than 1 acre; "July 2023" template, list updated 09/11/2026).' },
    TXD_SS_B: { badge: 'TXDOT', status: 'read', label: 'TxDOT SWP3 Summary Sheets, 1 acre or more (swp3b23.pdf, 2 pages)', url: 'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/swp3b23.pdf', note: 'Downloaded 2026-10-26 (SHA-256 b973a8e3...aaa25). A flat PDF with no form fields, and its text is outlined, so entries are drawn at measured positions. Not bundled in this repo (see the TxDOT CAD disclaimer); load your own copy in the Summary tab.' },
    TXD_SS_A: { badge: 'TXDOT', status: 'read', label: 'TxDOT SWP3 Summary Sheets, less than 1 acre (swp3a23.pdf, 2 pages)', url: 'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/swp3a23.pdf', note: 'Downloaded 2026-10-26 (SHA-256 70d4fa73...fc205). Flat PDF, same approach as the 1-acre-or-more sheet. Not bundled.' },
    TXD_CAD: { badge: 'TXDOT', status: 'read', label: 'TxDOT CAD disclaimer (terms for standards files)', url: 'https://www.txdot.gov/inside-txdot/division/design/cad-disclaimer.html', note: 'Read 2026-10-26: "The design files standards are copyrighted by the Texas Department of Transportation and may not be resold." No grant to redistribute was found, so the PDFs are not bundled here.' },
    PDFLIB: { badge: 'ROT', status: 'read', label: 'pdf-lib 1.17.1 (MIT license), vendored for the filled-PDF export', url: 'https://github.com/Hopding/pdf-lib', note: 'Software library, not a standard. Vendored in swp3-builder/vendor with its license so export works offline.' },
    TXD_APPC: { badge: 'TXDOT', status: 'read', label: 'TxDOT Appendix C: Completing Form 2118 (inspection report)', url: TXD + '915-06-gui.docx', note: 'Read the introduction: TxDOT inspects every 7 days (recommended); alternative cycles need rainfall records.' },
    TXD_APPAB: { badge: 'TXDOT', status: 'linked', label: 'TxDOT Appendix A (CSN/NOI/NOC/NOT) and Appendix B (MS4 notification)', url: TXD + '915-03-gui.docx', note: 'Headings only were read; Appendix B: ' + TXD + '915-04-gui.docx' },
    TXD_506: { badge: 'TXDOT', status: 'read', label: 'TxDOT 2024 Standard Specifications, Item 506 Temporary Erosion, Sedimentation, and Environmental Controls', url: 'https://www.txdot.gov/content/dam/docs/specifications/2024/2024-spec-rewrite-500-series.pdf',
      note: 'Read from the 2024 500-series specification PDF (section numbers 2.1, 2.4, 2.9, 2.10, 3.1, 4.3.2-4.3.4, 4.4.x, 4.5 verified in that text). The fact sheets below cite the same sections of the "September 1, 2024" book.' },
    TXD_EC: { badge: 'TXDOT', status: 'linked', label: 'TxDOT Roadway Standards (English): EC(1)-16 to EC(9)-16 temporary erosion control sheets', url: 'https://www.dot.state.tx.us/insdtdot/orgchart/cmd/cserve/standard/rdwylse.htm', note: 'Page loads and lists EC(1)-16 through EC(9)-16. The sheet drawings were not opened; EC numbers are taken from the TxDOT BMP fact sheets (e.g. EC(1)-16 fence & vertical tracking, EC(2)-16 rock filter dams, EC(3)-16 construction exits, EC(6)-16 sediment basins/traps, EC(7)-16 pipe slope drain, EC(9)-16 erosion control log).' },
    TXD_BMP_E: { badge: 'TXDOT', status: 'read', label: 'TxDOT construction BMPs: Erosion control devices and practices', url: 'https://www.txdot.gov/business/resources/environmental/stormwater/bmp-resources/erosion-control.html', note: 'Read; design and inspection fact sheets (075-xx-bmp) were downloaded and read for each BMP that cites them.' },
    TXD_BMP_S: { badge: 'TXDOT', status: 'read', label: 'TxDOT construction BMPs: Sediment control devices and practices', url: 'https://www.txdot.gov/business/resources/environmental/stormwater/bmp-resources/sediment-control.html', note: 'Read.' },
    TXD_BMP_P: { badge: 'TXDOT', status: 'read', label: 'TxDOT construction BMPs: Pollution prevention and housekeeping practices', url: 'https://www.txdot.gov/business/resources/environmental/stormwater/bmp-resources/pollution-prevention.html', note: 'Read.' },

    HOU_IDM: { badge: 'HOU', status: 'read', label: 'City of Houston 2026 Infrastructure Design Manual (Chapter 9, section 9.5.01.D Regulated Construction Activity)', url: 'https://www.houstonpermittingcenter.org/media/6371/download?inline=',
      note: 'Read 9.5.01.D (page dated 03-02-2026): SWPPPs/BMPs per the Stormwater Management Handbook for Construction Activities; site-specific SWPPP must include Standard Drawing 01570-01; plans carry a note that the contractor gives the Site Notice, NOI and maintenance checklist to the City Engineer/Building Official five (5) workdays before construction. The Handbook itself was not found/read.' },
    HOU_PAGE: { badge: 'HOU', status: 'linked', label: 'Houston Permitting Center: Design and Construction Standards', url: 'https://www.houstonpermittingcenter.org/office-city-engineer/design-and-construction-standards', note: 'Page loads; IDM edition effective date not re-read here.' },
    HC_FAQ: { badge: 'HC', status: 'read', label: 'Harris County Office of the County Engineer: Stormwater Quality FAQ', url: 'https://oce.harriscountytx.gov/Divisions/Watershed-Protection/Stormwater-Quality/Stormwater-Quality-FAQ', note: 'Read: SWPPP required for projects that could disturb a one-acre or larger parcel; SWPPP = construction-phase pollutants, SWQMP = post-construction treatment; both accompany plan submittal.' },
    HC_WELCOME: { badge: 'HC', status: 'read', label: 'Harris County: Welcome to Stormwater Quality (regulations overview)', url: 'https://oce.harriscountytx.gov/Services/Consultants-Resources-and-Specifications/Watershed-Protection/Storm-Water-Quality-Plan-Review/Welcome-to-Stormwater-Quality', note: 'Read: new development/significant redevelopment in unincorporated Harris County needs a Stormwater Quality (SWQ) Permit. The regulation text (Part C, construction) was only seen in a third-party copy, so no section is cited.' },
    ISWM: { badge: 'ISWM', status: 'read', label: 'NCTCOG iSWM Technical Manual: Construction Controls (Revised 04/10)', url: 'https://iswm.nctcog.org/Documents/technical_manual/Construction_Controls_4-2010b.pdf', note: 'Read section 3.4 Inlet Protection. Other iSWM sections appear only as pointers (no values taken).' },
    HDM_HYD: { badge: 'TXDOT', status: 'read', label: 'TxDOT Hydraulic Design Manual (Sept. 2019), Chapter 4 Hydrology: Sec. 11 time of concentration, Sec. 12 rational method (Eq 4-21 IDF, Eq 4-23 composite C), Sec. 13 NRCS curve number (Table 4-18)', url: 'https://www.txdot.gov/manuals/des/hyd/',
      note: 'Read from the HDM PDF (Revised September 2019); the HTML manual pages returned a server error during the check. Equations 4-20, 4-21 and 4-34/4-35 are images in the PDF, so their forms are taken from the variable definitions and notes (Ia = 0.2 S). IDF coefficients come from TxDOT EBDLKUP-2019 as already used in the Rational tool.' },
    HDM_INLET: { badge: 'TXDOT', status: 'read', label: 'TxDOT Hydraulic Design Manual, Chapter 10 Sec. 6: grate inlet in a sump, Eq 10-30 (weir, Cw = 3, perimeter x 0.5) and Eq 10-31 (orifice, Co = 0.67, area x 0.5)', url: 'https://www.txdot.gov/manuals/des/hyd/',
      note: 'Read from the HDM PDF. Using these coefficients for a basin riser, spillway crest, pipe slope drain inlet or protected inlet is this tool\'s judgment (Assumed); the manual gives them for grate inlets.' },
    HDM_CH7: { badge: 'TXDOT', status: 'read', label: 'TxDOT Hydraulic Design Manual, Chapter 7 Sec. 3: roadside channel design and permissible shear stress table', url: 'https://www.txdot.gov/manuals/des/hyd/',
      note: 'Read from the HDM PDF; the permissible shear values were compared line by line with the table used in the Ditch tool (they match).' },
    HEC15: { badge: 'ROT', status: 'linked', label: 'FHWA HEC-15 (3rd ed., FHWA-NHI-05-114): Design of Roadside Channels with Flexible Linings', url: 'https://www.fhwa.dot.gov/engineering/hydraulics/pubs/05114/05114.pdf',
      note: 'Link loads. Not re-read for this release; the equations are the ones implemented and tested against the HEC-15 worked examples in this repository (ditch/calc.js, ditch/test.js).' },
    AH703: { badge: 'ISWM', status: 'read', label: 'USDA-ARS Agriculture Handbook 703 (RUSLE), Chapter 3 slope length and steepness (LS) tables (NRCS eFOTG copy)', url: 'https://efotg.sc.egov.usda.gov/references/Agency/OK/RUSLE_Chap3_LS_Factors.pdf',
      note: 'Read: the three LS tables (labeled Table 1-1, 1-2, 1-3 in this copy; the chapter text calls them 2-1 to 2-3). The high rill-to-interrill table is described as for freshly prepared construction and other highly disturbed soil with little or no cover. Interpolating between table values is this tool\'s assumption. The rest of AH-703 (R maps, K nomograph, C subfactors) was not read.' },
  };

  /* ---- TxDOT vs permit: places where TxDOT guidance is less strict than (or can be misread against) the permit. Permit wins. ---- */
  var FLAGS = [
    { id: 'stab', title: 'Stabilization timing', bmps: ['seeding_sod', 'erosion_blanket', 'vertical_tracking'],
      txdot: 'TxDOT Item 506 section 4.3.2 and the Soil Stabilization fact sheet: initiate stabilization no more than 14 days after construction in that portion has temporarily or permanently ceased.',
      tceq: 'Permit Part III.F.2(b)iii and Part IV.B: initiate stabilization immediately (no later than the end of the next work day) where activity has ceased and will not resume for more than 14 days, or has permanently ceased; complete within 14 days after initiation.',
      resolution: 'Use the permit timing. The TxDOT 14-day wording is looser than the permit.' },
    { id: 'basin', title: 'Sediment basin storage volume', bmps: ['sediment_basin', 'sediment_trap'],
      txdot: 'TxDOT Summary Sheet guidance 2.2.1 gives 1,800 cu ft/acre (0.5 in.) for traps and for basins up to 10 acres drained, 3,600 cu ft/acre (1.0 in.) above 10 acres. Item 506 section 4.4.5.1 uses 3,600 cu ft/acre for 10 or more disturbed acres.',
      tceq: 'Permit Part III.F.2(c)i(A)(1)-(2): where feasible, a basin for 10 or more acres disturbed at one time in a common drainage location, sized for the 2-yr, 24-hr runoff from each disturbed acre, or 3,600 cu ft/acre when that cannot be calculated; calculations go in the SWP3. Part III.F.2(c)ii(B): the alternative basin for under 10 acres is likewise 2-yr/24-hr or 3,600 cu ft/acre.',
      resolution: 'If you claim a basin as the permit control, size it to the permit value, not 1,800 cu ft/acre.' },
    { id: 'trapclean', title: 'Sediment removal trigger (traps)', bmps: ['sediment_trap', 'sediment_basin'],
      txdot: 'TxDOT sediment trap inspection job aid asks whether capacity has been reduced or sediment is 1 ft deep.',
      tceq: 'Permit Part III.F.6(c): remove sediment from traps and basins no later than when design capacity has been reduced by 50%.',
      resolution: 'Clean out at whichever comes first: 50% of design capacity or the TxDOT depth trigger.' },
    { id: 'accept', title: 'Contract acceptance vs final stabilization', bmps: ['seeding_sod'],
      txdot: 'Item 506 section 4.3.3 lets the Engineer accept the work before 70% vegetative cover is reached.',
      tceq: 'Permit Part III.F.2(b)iv and Part II.F: final stabilization (70% of native background cover or equivalent) is required before termination of coverage; inspections and the site notice continue until then.',
      resolution: 'Acceptance does not end permit duties. Keep inspecting and keep the notice posted until final stabilization and (large sites) the NOT.' },
    { id: 'cycle', title: 'Alternative inspection cycle', bmps: [],
      txdot: 'TxDOT recommends a 7-day cycle; some Districts use 14-day or other cycles only where climate warrants and must keep rainfall records (Section 2.2 and Appendix C).',
      tceq: 'Permit Part III.F.8(c)i: 14 calendar days AND within 24 hours of the end of a 0.5 in. or greater storm; 7-day is the alternative that needs no rain trigger (III.F.8(c)v).',
      resolution: 'If you pick the 14-day option you must also meet the 0.5 in. storm inspection.' },
    { id: 'daily', title: 'Contractor daily monitoring (TxDOT stricter)', bmps: [], stricter: true,
      txdot: 'Item 506 section 4.5 and 3.1: the Contractor monitors control measures daily while BMPs are in place or soil-disturbing activity is evident, with written daily records (not required on non-work days unless it rained).',
      tceq: 'Permit inspections are 7 or 14 days (plus storm) and daily only for dewatering (III.F.7).',
      resolution: 'On TxDOT contracts the stricter Item 506 daily monitoring applies in addition to the permit inspections.' }
  ];

  var ACTIVITIES = [
    { key: 'slopes', label: 'Slopes, embankment or cut slopes disturbed' },
    { key: 'ditches', label: 'Roadside ditches / channels carry flow through the work' },
    { key: 'outfalls', label: 'New or modified outfalls, culverts or pipe outlets' },
    { key: 'inlets', label: 'Existing or new storm drain inlets in or next to the work' },
    { key: 'trees', label: 'Trees / vegetation to be preserved' },
    { key: 'surfaceWater', label: 'Surface water (stream, pond, wetland) on or adjacent to the site' },
    { key: 'concrete', label: 'Concrete work (placing, saw cutting, washout)' },
    { key: 'dewatering', label: 'Dewatering of trenches or excavations expected' },
    { key: 'stockpiles', label: 'Stockpiles (soil, aggregate, spoil)' },
    { key: 'exits', label: 'Vehicles leave the site onto a paved road' },
    { key: 'fueling', label: 'Fuel, oil or chemical storage / vehicle maintenance on site' },
    { key: 'sanitary', label: 'Portable toilets / sanitary facilities' },
    { key: 'demolition', label: 'Demolition of structures or pavement' },
    { key: 'support', label: 'Support activities (staging, borrow, batch plant, wash area)' }
  ];

  var NSD = [
    { key: 'fire', label: 'Fire-fighting activities' },
    { key: 'hydrant', label: 'Uncontaminated fire hydrant flushing (dechlorinate if hyperchlorinated)' },
    { key: 'wash', label: 'Routine external washing of vehicles/structures/pavement without detergents or soaps, to remove mud, dirt or dust' },
    { key: 'dust', label: 'Uncontaminated water used to control dust' },
    { key: 'potable', label: 'Potable water sources including waterline flushing (dechlorinate if hyperchlorinated)' },
    { key: 'ac', label: 'Uncontaminated air-conditioning condensate' },
    { key: 'groundwater', label: 'Uncontaminated groundwater or spring water, including foundation/footing drains' },
    { key: 'irrigation', label: 'Lawn watering and similar irrigation drainage' }
  ];

  var PROJECT_TYPES = [
    { key: 'txdot', label: 'TxDOT roadway / drainage' },
    { key: 'municipal', label: 'Municipal / public works' },
    { key: 'private', label: 'Private development' },
    { key: 'linear', label: 'Linear utility / pipeline' }
  ];

  var EDWARDS_COUNTIES = ['Comal', 'Bexar', 'Medina', 'Uvalde', 'Kinney', 'Williamson', 'Travis', 'Hays'];

  var CATS = { erosion: 'Erosion control & stabilization', sediment: 'Sediment control', tracking: 'Vehicle tracking & dust', pollution: 'Pollution prevention & housekeeping', water: 'Dewatering & concentrated flow', permanent: 'Permanent controls' };

  function T(t) { return ['TXDOT', t]; }
  function P(t) { return ['TCEQ', t]; }
  function I(t) { return ['ISWM', t]; }
  function R(t) { return ['ROT', t]; }

  /* ---- BMP library. level/applicability is decided in model.js (recommendBmps) ---- */
  var BMPS = [
    { id: 'sediment_fence', cat: 'sediment', name: 'Sediment control fence (silt fence)', ec: 'EC(1)-16', tp: 'T', fs: '15', ins: '16', badge: 'TXDOT',
      purpose: [T('Temporary woven-geotextile barrier that filters sheet flow and holds runoff briefly before it leaves the project.')],
      where: [T('Down-slope perimeter of disturbed areas, below the toe of exposed slopes, along streams/channels, around temporary stockpiles. Sheet flow only, parallel to contours, not in concentrated flow.'),
        P('Perimeter control: silt fence, vegetative buffer strips or equivalent is required on all down-slope boundaries of the construction area and on side-slope boundaries as site conditions dictate (Part III.F.2(c)i(B) and ii(A)).'),
        T('Fact sheet: not recommended where the contributing drainage exceeds 2 acres; add other controls.')],
      install: [T('Posts embedded at least 18 in. (or anchored in rock), 6-8 ft apart, angled slightly toward the runoff source (Item 506 section 4.4.8.1).'),
        T('Trench on the uphill side at least 6 x 6 in.; anchor 6-8 in. of fabric, backfill and tamp (Item 506 section 4.4.8.2).'),
        T('Splices at a post with at least 6 in. lap; none in concentrated-flow areas (Item 506 section 4.4.8.4).'),
        T('Select the product from TxDOT Approved Products (Item 506 section 1).')],
      maint: [P('Remove trapped sediment before it reaches 50% of the above-ground height (Part III.F.6(c)).'),
        P('Controls that are run over, removed or ineffective must be replaced or corrected immediately on discovery (Part III.F.6(a)).'),
        T('Repair splits, tears, slumping or weathered fabric (TxDOT inspection job aid).')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm (Part III.F.8(c)i).'), T('Sediment build-up, erosion around or behind the fence, undercutting, run-over or torn sections, posts no longer embedded.')] },

    { id: 'erosion_log', cat: 'sediment', name: 'Biodegradable erosion control log', ec: 'EC(9)-16', tp: 'T', fs: '11', ins: '12', badge: 'TXDOT',
      purpose: [T('Biodegradable log that intercepts sheet-flow sediment; works as a perimeter barrier, ditch dam, slope check or inlet protection where silt fence is unsuitable (e.g. paved surfaces).')],
      where: [T('Perimeter and slope protection, stockpile controls, curb/drop/grade inlet protection, ditch dams (space at least 500 ft on center in ditches), before drainage leaves the ROW or enters a water course.')],
      install: [T('Log sediment trap: drainage area no more than 5 acres; capacity 1,800 cu ft/acre (0.5 in. over the drainage area).'),
        T('Logs must not impede traffic or flood the roadway when used at inlets.'), T('Slope spacing by log diameter and slope: see sheet 2 of 3 of EC(9)-16.'), T('Item 506 sections 2.10 and 4.4.9 (core material, mesh, securing against displacement; no flow under the log).')],
      maint: [T('Job aid: check sediment depth against the 1/2-diameter threshold and remove sediment; check stakes, displacement and damage.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), T('Displaced or undercut logs, damaged mesh, sediment depth at or above the job-aid threshold.')] },

    { id: 'rock_exit', cat: 'tracking', name: 'Stabilized (rock) construction exit', ec: 'EC(3)-16', tp: 'T', fs: '17', ins: '18', badge: 'TXDOT',
      purpose: [T('Designated stabilized entrance/exit that knocks sediment off tires and keeps it off public roads.'), P('The permit requires minimizing off-site vehicle tracking of sediment and dust (Part III.F.4(a)) and mapping designated exits onto paved roads (III.F.1(g)x).')],
      where: [T('TxDOT: must be used on sites that disturb one acre or more; recommended on smaller sites where tracking is likely, where soils are poor, near water, on steep grades.')],
      install: [T('Type 1 rock: at least 8 in. deep, 4-8 in. aggregate; Type 3 short-term: 2-4 in. aggregate (Item 506 sections 2.4.1, 4.4.4.1.1).'),
        T('Width at least 14 ft one-way, 20 ft two-way, full width of exit (Item 506 section 4.4.4.1).'),
        T('Types 1 and 2: length at least 50 ft, approach no steeper than 6:1, graded to a sediment trapping device (TxDOT fact sheet).')],
      maint: [T('Replace/top-dress aggregate when voids or clogs appear; sweep tracked sediment (see street sweeping).')],
      triggers: [P('Check every inspection for off-site tracking at exits (Part III.F.8(b)v).'), T('Sediment visible on the public road, clogged aggregate, timber planks loose.')] },

    { id: 'street_sweeping', cat: 'tracking', name: 'Street sweeping / vacuuming', ec: '', tp: 'T', fs: '26', ins: '27', badge: 'TXDOT',
      purpose: [T('Removes tracked sediment from public and private roads before it reaches storm drains.')],
      where: [T('Wherever construction exits meet a public roadway; use with a stabilized exit. Wash-down with water to move sediment is prohibited (see exit fact sheet).')],
      install: [T('Show on the plans where and when sweeping is required; limit the number of ingress/egress points.')],
      maint: [T('TxDOT job aid: sweep at the end of every working day and during all phases.')],
      triggers: [T('Sediment or debris visible on adjacent roadway.')] },

    { id: 'inlet_protection', cat: 'sediment', name: 'Storm drain inlet protection', ec: 'EC(9)-16 / EC(2)-16', tp: 'T', fs: '51', ins: '52', badge: 'TXDOT',
      purpose: [T('Keeps sediment out of existing and new inlets: curb-inlet and drop-inlet sediment traps, erosion control logs at curb/drop/grade inlets, Type 1 rock filter dams around inlets.'), P('The permit requires storm drain inlets on and near the site to be shown on the site map (Part III.F.1(m)).')],
      where: [T('Immediately preceding drain inlets; before drainage enters a water course or leaves the ROW.'), I('iSWM: best at low-point (sump) inlets; protection that ponds water is not applicable at on-grade curb inlets because it causes bypass; never block the entire inlet opening; include a flow bypass.')],
      install: [T('Trap drainage area no more than 5 acres at 1,800 cu ft/acre; do not impede traffic or flood the roadway (TxDOT fact sheets).'), I('Evaluate drainage patterns so protection does not flood roadway, property or structures (iSWM Construction Controls section 3.4).')],
      maint: [I('iSWM section 3.4: check and clear blockage after every storm; remove sediment before it reaches half the design height or volume (more often at curb inlets).'), P('TCEQ 50% capacity/height rule for removing sediment applies to traps and perimeter controls (Part III.F.6(c)).')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), I('Blocked inlet after any storm.')] },

    { id: 'sediment_basin', cat: 'sediment', name: 'Sediment basin', ec: 'EC(6)-16', tp: 'T/P', fs: '', ins: '', badge: 'TCEQ',
      purpose: [P('Required, where feasible, for a common drainage location serving 10 or more acres disturbed at one time (Part III.F.2(c)i(A)).')],
      where: [P('Common drainage location with 10 or more disturbed acres at one time; offsite and undisturbed/stabilized flows may be excluded from the volume if diverted around the disturbed area and the basin. Existing detention ponds may not be appropriate.'),
        T('TxDOT: basin drainage area should not exceed 100 acres (Summary Sheet guidance 2.2.1).')],
      install: [P('Storage = calculated 2-yr, 24-hr runoff from each disturbed acre drained; if rainfall data are not available or it cannot be calculated, at least 3,600 cu ft per acre drained until final stabilization. Put the calculations in the SWP3 (Part III.F.2(c)i(A)(1)-(2); TxDOT Binder Attachment 1.3).'),
        P('Unless infeasible, use an outlet that withdraws from the surface (Part III.F.2(c)i(A)(4) and Part IV.F).'),
        T('40-hour draw-down with an emergency spillway; spillway may pass the 25-year peak runoff, investigate the 100-year for flooding; length-to-width at least 4:1 (TxDOT Summary Sheet guidance 2.2.1).'),
        P('If not feasible, document why and provide equivalent controls (e.g. a series of smaller basins) until final stabilization (Part III.F.2(c)i(A)(3)). TxDOT: examples are smaller basins, silt fence, vegetative buffer strips, sediment traps, rock filter dams.')],
      maint: [P('Remove sediment no later than when design capacity has been reduced by 50% (Part III.F.6(c)).')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm; observe discharges and document color, odor, floating or suspended solids, foam or sheen when discharging (Part III.F.8(b)vi).')], seal: true },

    { id: 'sediment_trap', cat: 'sediment', name: 'Sediment trap', ec: 'EC(6)-16', tp: 'T', fs: '51', ins: '52', badge: 'TXDOT',
      purpose: [T('Small excavated area contained by a stone embankment; slows concentrated flow so particles settle before discharge. Allowed for drainage locations under 10 acres (Part III.F.2(c)ii(A)).')],
      where: [T('In ditches, ahead of ditch inlets, before drainage enters a water course, before drainage leaves the ROW; substitute where a basin is not feasible. Ditch spacing about 500 ft on center (Summary Sheet guidance 2.2.1).')],
      install: [T('Drainage area no more than 5 acres; 1,800 cu ft/acre (0.5 in.); surface area at least 1% of the drainage area.'),
        T('Embankment at most 5 ft high, 4 ft top width max, side slopes 2:1 or flatter; well-graded stone; filter stone on the upstream face if the runoff has fines.'),
        T('Outlet: perforated riser/pipe for a 40-hour draw-down, or a level stabilized overflow (EC(6)-16).')],
      maint: [P('Remove sediment when design capacity is reduced by 50% (Part III.F.6(c)).'), T('TxDOT job aid also uses a 1 ft sediment depth.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), T('Clogged embankment, reduced filter-stone efficiency, trash in the trap.')], seal: true },

    { id: 'rock_filter_dam', cat: 'water', name: 'Rock filter dam (check dam)', ec: 'EC(2)-16', tp: 'T', fs: '35', ins: '36', badge: 'TXDOT',
      purpose: [T('Small aggregate barrier that slows concentrated flow in ditches, swales and dike outlets, and traps some sediment.')],
      where: [T('Toe of slopes, at sediment traps, in ditches, dike and swale outlets, stream flow (Type 3), around inlets (Type 1). Perpendicular to flow. iSWM Check Dam (Construction Controls section 2.1) is an alternate reference.')],
      install: [T('Type 1: 18 in. high, no mesh, 3-6 in. rock; Type 2: 18 in. with wire mesh; Type 3: 36 in. with mesh, 4-8 in. rock; Type 4: sack gabions (Item 506 section 2.1; EC(2)-16).'),
        T('Size for 60 gpm per sq ft of cross-section at the 2-yr flow; side slopes 2:1 or flatter (6:1 or flatter inside the clear zone); Type 1 not for flows of about 8 ft/s or more.')],
      maint: [T('Replace washed-out rock, repair mesh, remove accumulated sediment; maintain after heavy or high-velocity flows.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), T('Aggregate washed out, edge erosion, clogged or damaged mesh.')] },

    { id: 'vertical_tracking', cat: 'erosion', name: 'Vertical tracking (slope tracking)', ec: 'EC(1)-16', tp: 'T', fs: '07', ins: '06', badge: 'TXDOT',
      purpose: [T('Temporary stabilization of bare, uncompacted slopes by tracked-machine impressions perpendicular to runoff.'), T('Item 506 section 4.4.10 and the fact sheet: required where soil-disturbing activity occurs on slopes unless otherwise approved.')],
      where: [T('Entire face of disturbed slopes; indicate on the plans where required.')],
      install: [T('Track impressions at least 12 in. long, 2-4 in. wide, 1/2-2 in. deep, no more than 12 in. apart, continuous linear, perpendicular to the slope; limit passes to avoid compaction (Item 506 section 4.4.10).')],
      maint: [T('Re-track areas washed out by heavy rain; use with other controls where it cannot stand alone.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), T('Tracking washed out, erosion on slope face, blowing dust.')] },

    { id: 'erosion_blanket', cat: 'erosion', name: 'Erosion control blanket / soil retention blanket', ec: '', tp: 'T/P', fs: '29', ins: '30', badge: 'TXDOT',
      purpose: [T('Soil stabilization on slopes, ditches and near water: TxDOT Item 169 Soil Retention Blanket; select products from the TxDOT Approved Products List (Summary Sheet guidance 2.1).')],
      where: [T('Exposed soil, slopes, fill transitions, ditches, sediment traps, areas adjacent to surface water.'), R('Consider a blanket or mat where finished slopes are about 3:1 or steeper or soils are very erosive. This threshold is a rule of thumb only, not from TxDOT, TCEQ or iSWM text read for this tool.')],
      install: [T('Install per manufacturer specifications (TxDOT soil stabilization fact sheet); use wildlife-friendly products where possible.'), P('Stabilization must be initiated immediately and completed within 14 days as described in Part III.F.2(b)iii.')],
      maint: [T('Repair eroded or exposed areas; limit traffic on stabilized areas.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), T('Erosion near the blanket, standing water, exposed soil after installation.')] },

    { id: 'seeding_sod', cat: 'erosion', name: 'Seeding, hydroseed / hydromulch, or sod', ec: '', tp: 'T/P', fs: '29', ins: '30', badge: 'TXDOT',
      purpose: [T('Temporary and permanent vegetative stabilization (TxDOT Items 162 Sodding for Erosion Control and 164 Seeding for Erosion Control; also Items 160 topsoil and 161 compost per the soil stabilization fact sheet).'), P('Final stabilization: uniform perennial cover at least 70% of the native background cover on all unpaved areas, or equivalent permanent stabilization such as riprap (permit Part I.B definition).')],
      where: [T('Every disturbed area not paved or built over, once earthwork in that area is done.')],
      install: [P('Initiate immediately (next work day) where work has stopped for more than 14 days, and complete within 14 days after initiation (Part III.F.2(b)iii).'), T('Keep dated records of grading, cessation and stabilization start (TxDOT Form 2118 stabilization section).')],
      maint: [T('Re-seed bare areas; keep traffic off establishing vegetation.')],
      triggers: [P('Inspect stabilized areas at least monthly; inspect after 0.5 in. storms (Part III.F.8(c)).'), T('Bare patches, rills, uneven cover below 70%.')] },

    { id: 'preserve_vegetation', cat: 'erosion', name: 'Tree protection / preservation of existing vegetation', ec: '', tp: 'T', fs: '13', ins: '14', badge: 'TXDOT',
      purpose: [T('Most effective erosion control is leaving vegetation in place; mark preserved areas before clearing.'), P('Site plans must preserve existing vegetation where possible (Part III.F.2(b)).')],
      where: [T('Slopes, forested areas, natural water features; trenching and tunneling as far from trunks as feasible; keep materials, equipment and parking out of preserved areas.')],
      install: [T('Mark with high-visibility construction perimeter fence before clearing and grubbing; preserve in blocks.')],
      maint: [T('Repair damaged fence; no vehicle traffic in preserved areas.')],
      triggers: [T('Missing or damaged fence, vehicle traffic or trenching near trunks.')] },

    { id: 'perimeter_fence', cat: 'erosion', name: 'Construction perimeter fence', ec: '', tp: 'T', fs: '24', ins: '25', badge: 'TXDOT',
      purpose: [T('High-visibility fence around areas where construction is not allowed (sensitive areas, water, wetlands, preserved vegetation, tree protection).')],
      where: [T('Install before soil-disturbing activity; determine access routes first.')],
      install: [T('Posts embedded 18 in. (or anchored in rock) at 8-10 ft; top wire at least 3 ft above ground; flagging on both wires (Item 506 section 4.4.6).')],
      maint: [T('Re-secure displaced fence; remove sediment and trash along the fence line.')],
      triggers: [T('Displaced or damaged fence.')] },

    { id: 'slope_drain', cat: 'water', name: 'Temporary pipe slope drain', ec: 'EC(7)-16', tp: 'T', fs: '55', ins: '56', badge: 'TXDOT',
      purpose: [T('Pipe that carries concentrated runoff down an unstabilized slope without eroding it. It does not treat sediment; route the outlet to a sediment trap or dissipator.')],
      where: [T('Large berms, steep or disturbed slopes, roadway embankments, levees, significant grade changes.')],
      install: [T('Contributing drainage no more than 5 acres; earth dike over the inlet at least 1 ft above the top of the inlet pipe; hold-downs at most 10 ft on center; inlet pipe slope 3% or greater, outlet 1% or less to an energy dissipator or trap; 25-yr flow may be used for sizing (TxDOT fact sheet; Item 506 section 4.4.2).')],
      maint: [T('Clear clogs, repair joints and hold-downs, repair the entrance embankment.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), T('Clogging, leaks, pipe no longer secured, erosion around the pipe.')] },

    { id: 'outlet_protection', cat: 'water', name: 'Outlet protection / velocity dissipation', ec: 'EC(8)-16', tp: 'T/P', fs: '39', ins: '40', badge: 'TCEQ',
      purpose: [P('Permittees must place velocity dissipation devices at discharge locations and along the length of any outfall channel to give a non-erosive velocity (Part III.F.4(d)).')],
      where: [T('Pipe, culvert, flume and dike outlets, concentrated flow to streams, locations where soil is scour-prone. TxDOT: install where design-storm velocity exceeds 4 ft/s and discharges to an unlined or natural channel.')],
      install: [T('Riprap apron aligned with flow: length 4.5 x pipe diameter, width 4.0 x pipe diameter; do not use riprap where outlets discharge to channels at different elevations; calculations for velocity, stone size and apron (TxDOT fact sheet; Item 432 Riprap).'), T('Use permanent dissipation devices early in construction where possible.')],
      maint: [T('Re-key displaced riprap, remove clogs and sediment, repair scour.')],
      triggers: [P('Inspect discharge points at every inspection (Part III.F.8(a)).'), T('Displaced riprap, scour, clogged outfall, flooding or traffic effects.')] },

    { id: 'diversion', cat: 'water', name: 'Diversion dike / interceptor swale / paved flume', ec: 'EC(4)/(5)/(8)-16', tp: 'T', fs: '49', ins: '50', badge: 'TXDOT',
      purpose: [T('Intercepts or diverts run-on and runoff around disturbed areas to a stabilized outlet; permit Part IV.A requires controlling stormwater volume and velocity within the site.')],
      where: [T('Top of slopes, below steep grades, along paved edges; contributing drainage no more than 5 acres per swale/dike/ditch; outlet to a stabilized area; side slopes 6:1 in the safety clear zone.')],
      install: [T('Compacted soil; evaluate velocity, soil, overtopping risk; paved flume with rock/rubble energy dissipator at the outlet, sized for the 25-year flow (TxDOT fact sheet; Item 506 section 4.4.3).')],
      maint: [T('Repair breaches, keep outlets stable.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.')] },

    { id: 'vegetated_buffer', cat: 'sediment', name: 'Vegetated buffer / filter strip', ec: '', tp: 'T/P', fs: '57', ins: '58', badge: 'TCEQ',
      purpose: [P('Provide and maintain natural buffers around surface water in the state and direct stormwater to vegetated areas unless infeasible; if infeasible, document why and add erosion and sediment controls (Part IV.A.(6)). Stormwater control features are not "surface water" for this purpose (IV.A.(9)).')],
      where: [T('TxDOT Summary Sheet 2.6: locate the buffer where surface waters are on or adjacent to the ROW; if infeasible, state the reason and the equivalent controls with stationing (PE seal needed if buffers are required but infeasible).')],
      install: [T('As primary sediment control: contributing disturbed area no more than 2 acres, flow length 150 ft or less, contributing slope under 15%, strip slope 5% or less, at least 80% vegetative cover, access prohibited; use along contours (TxDOT fact sheet).')],
      maint: [T('Remove sediment, trash and debris; re-establish bare areas; repair rills.')],
      triggers: [T('Bare areas, rill erosion, sediment accumulation in the strip.')], seal: true },

    { id: 'stockpile', cat: 'erosion', name: 'Stockpile management', ec: '', tp: 'T', fs: '20', ins: '19', badge: 'TXDOT',
      purpose: [T('Prevents air and stormwater pollution from soil, sand, aggregate, mulch, asphalt and similar stockpiles. Inactive stockpile = not scheduled for use within 14 days.')],
      where: [T('Designated stockpile area on the SWP3 layout sheets, away from concentrated flow, drainage, inlets, water bodies and sensitive areas.')],
      install: [T('Typical controls: duration limit (state it in a plan note), plastic cover, sediment control fence, runoff diversion, erosion control logs, soil stabilization; list permitted materials.')],
      maint: [T('Job aid: remove sediment when it reaches 1/3 of the sediment-control BMP height; cover and secure at end of day; replace damaged covers before rain.')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), T('Inactive stockpile past its allowed time, damaged cover, sediment build-up.')] },

    { id: 'concrete_washout', cat: 'pollution', name: 'Concrete washout and concrete waste management', ec: '', tp: 'T', fs: '41', ins: '42', badge: 'TCEQ',
      purpose: [P('Discharge of concrete truck wash-out to surface water or storm sewers is prohibited; wash-out must go to areas with structural controls and be shown on the SWP3 site map (Part VI.A, B and E; Part IV.E.1).')],
      where: [T('Predetermined washout areas shown on the SWP3 layout sheets, at least 50 ft from storm drains, open ditches and surface waters, with solid (gravel/rock) approaches; more than one may be needed. The CRPE is responsible.')],
      install: [T('Dig in or build above grade; about 10 ft x 10 ft bermed area lined with tear-free plastic sheeting, or a vinyl washout container with filter bags.'), T('Vacuum or recover saw-cut slurry continuously; contain sandblasting grit.'), P('Minimize wash-out during rainfall; BMPs must prevent discharge from rainfall or runoff (Part VI.C).')],
      maint: [T('Job aid: empty the washout when it is half full; fix leaks and torn lining.')],
      triggers: [T('Washout half full, torn lining, runoff contacting concrete waste.')] },

    { id: 'dewatering_controls', cat: 'water', name: 'Dewatering controls', ec: '', tp: 'T', fs: '45', ins: '46', badge: 'TCEQ',
      purpose: [P('Dewatering discharges are prohibited unless managed by appropriate controls that address sediment and prevent erosion (Part IV.C).')],
      where: [T('Wherever water is pumped from trenches, excavations, vaults or foundations. Show planned locations on the environmental layout sheets.')],
      install: [T('Dewatering bag must pass at least 2x the pump peak flow (TxDOT Special Specification 4000 Dewatering Bags); sediment tank should hold discharge at least 2 hours; or discharge to a vegetated area, filter tubes, trap or basin.'), P('Use controls that minimize off-site transport of suspended sediment when pumping or channeling standing water (Part III.F.4(e)).')],
      maint: [T('Replace a dewatering bag when trapped sediment reaches 50% of the bag (TxDOT job aid). The job aid also asks whether the local MS4 operator was notified about the dewatering.')],
      triggers: [P('Observe and evaluate controls at least once per day on days that dewatering discharge occurs; report within 24 hours (Part III.F.7).'), T('TxDOT Contractor daily dewatering form 2675.')] },

    { id: 'spill_response', cat: 'pollution', name: 'Spill and leak prevention and response', ec: '', tp: 'T', fs: '05', ins: '04', badge: 'TCEQ',
      purpose: [P('Minimize discharge from spills and leaks; implement chemical spill and leak prevention and response procedures (Part IV.D.5).')],
      where: [T('All sites that use or store fuel, chemicals or hazardous materials; keep a spill kit on site (Item 506 section 4.3.4); show kit locations on the plans.')],
      install: [P('If a release containing a hazardous substance or oil at or above a reportable quantity occurs in 24 hours, notify the National Response Center at (800) 424-8802 as soon as known and, within 7 calendar days, provide a description of the release, circumstances and date (Part IV.D.5).'),
        T('TxDOT: designate the CRPE for spill coordination; post emergency contacts; train personnel; the TCEQ spill/release reporting hotline listed in the fact sheet is 1-800-832-8224.')],
      maint: [T('Restock spill kits; keep procedures posted.')],
      triggers: [T('Any spill or leak; stained soil or sheen at discharge points.')] },

    { id: 'chemical_material', cat: 'pollution', name: 'Chemical, material, waste and equipment management', ec: '', tp: 'T', fs: '43', ins: '44', badge: 'TCEQ',
      purpose: [P('Minimize exposure of building materials, wastes, fertilizers, pesticides, detergents and other materials to rain; close waste container lids at end of day and during storms; clean up wastes daily; clean up overflowing containers immediately (Part IV.D.2-4).'), P('Describe construction and waste materials stored on site and their controls (Part III.F.4(b)).')],
      where: [T('Material and equipment storage at least 50 ft from inlets, channels and surface waters; designate chemical storage away from runoff paths; only store chemicals needed for scheduled work.')],
      install: [T('Identify storage areas on plan sheets; assign responsible site personnel; store indoors where possible.'), P('Wash waters from vehicle/equipment washing must be treated in a sediment basin or equivalent before discharge (Part IV.D.1).')],
      maint: [T('Keep areas orderly; cover or contain materials before rain.')],
      triggers: [T('Open or leaking containers, uncovered materials before rain.')] },

    { id: 'sanitary_waste', cat: 'pollution', name: 'Sanitary waste (portable toilets)', ec: '', tp: 'T', fs: '28', ins: '23', badge: 'TCEQ',
      purpose: [P('Position portable toilets so they are secure and not tipped, away from surface water and stormwater inlets or conveyances (Part IV.D.6).')],
      where: [T('At least 50 ft from inlets, channels or surface waters; if not possible, at least 20 ft with secondary containment; accessible to service trucks without damaging controls.')],
      install: [T('One toilet per 10 workers for a 40-hour week; fully enclosed and anchored for wind; licensed hauler only.')],
      maint: [T('Service on schedule; show locations on the plans for spill response.')],
      triggers: [T('Tipped or leaking unit; unit moved near an inlet.')] },

    { id: 'turbidity_barrier', cat: 'sediment', name: 'Turbidity barrier (floating silt curtain)', ec: '', tp: 'T', fs: '', ins: '', badge: 'ISWM',
      purpose: [I('Floating geotextile or PVC curtain that controls sediment within a body of water; used when work disturbs the bank of a perennial stream, river, pond or lake, or for a coffer dam, low-water crossing or other work that disturbs soil within a water body (iSWM Construction Controls section 3.14).')],
      where: [I('Most applicable where wetlands, spring-fed water bodies, TMDL waters or protected-species waters need protection (iSWM 3.14.2). Not a TxDOT fact-sheet BMP: confirm with the TxDOT area office and any Corps/TCEQ authorization for the in-water work.')],
      install: [I('Specify manufacturer, type, length and anchoring for the depths, velocities, wave height and duration; curtain height 10% greater than design water depth; purchased length 10 to 20% longer than design length; panels at most 100 ft in water under 13 ft deep (50 ft if 13 ft or deeper) (iSWM 3.14.3).'),
        I('Fabric grab tensile strength at least 202 lb (ASTM D4632) for velocities of 0.5 ft/s or less; higher velocities need an engineered design (iSWM 3.14.3).')],
      maint: [I('Inspect regularly; repair or replace fabric; re-anchor if dislodged; limited use at high velocities and may be damaged by large storms (iSWM 3.14).')],
      triggers: [P('Inspect within 24 h after a 0.5 in. or greater storm.'), I('Dislodged anchors, torn curtain, sediment build-up that blocks the barrier.')] },

    { id: 'permanent_controls', cat: 'permanent', name: 'Permanent stormwater controls (installed during construction)', ec: '', tp: 'P', fs: '', ins: '', badge: 'TCEQ',
      purpose: [P('The SWP3 must describe stormwater controls installed during construction that treat discharges after construction; permittees install and maintain them before final stabilization (small) or before final stabilization and NOT (large) (Part III.F.3).'), T('TxDOT Summary Sheet 2.3: list permanent controls with stationing; long-term post-construction inspection and maintenance requirements must be developed.')],
      where: [HC_NOTE(), HOU_NOTE()],
      install: [T('Permanent velocity dissipators, rock filter dams, vegetated channels and similar items identified in the final design.')],
      maint: [T('Define long-term inspection/maintenance responsibility (TxDOT Summary Sheet 2.3).')],
      triggers: [] }
  ];

  function HC_NOTE() { return ['HC', 'Harris County separates the construction SWPPP from the post-construction SWQMP (stormwater quality management plan) that addresses treatment after construction; new development in unincorporated Harris County needs an SWQ Permit (Harris County Stormwater Quality pages).']; }
  function HOU_NOTE() { return ['HOU', 'City of Houston: confirm whether a post-construction SWQMP is required for this project under the current Infrastructure Design Manual, Chapter 9 (only section 9.5.01.D, construction, was read for this tool).']; }

  BMPS.forEach(function (b) {
    if (b.fs) { b.designUrl = sheet(b.fs); }
    if (b.ins) { b.inspUrl = sheet(b.ins); }
  });

  var api = { BADGES: BADGES, PERMIT: PERMIT, SOURCES: SOURCES, FLAGS: FLAGS, ACTIVITIES: ACTIVITIES, NSD: NSD, PROJECT_TYPES: PROJECT_TYPES,
    EDWARDS_COUNTIES: EDWARDS_COUNTIES, CATS: CATS, BMPS: BMPS, sheetUrl: sheet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SwpData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
