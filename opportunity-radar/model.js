/* Opportunity Radar: shared model (browser + Node).
   Normalizes records from public feeds into one shape, classifies drainage relevance, filters, aggregates, exports CSV.
   Nothing here invents data: a field the source does not give stays null/absent and the UI shows "unknown". */
(function (root) {
  'use strict';

  // ---- keywords (drainage relevance). A hit on these is a keyword match, labeled "inferred" in the UI. ----
  var KEYWORDS = [
    { id: 'drainage', label: 'drainage', re: /drain/i },
    { id: 'storm-sewer', label: 'storm sewer', re: /storm\s*sewer|storm\s*drain/i },
    { id: 'stormwater', label: 'stormwater', re: /storm\s*water|\bstorms?\b(?!\s*(sewer|drain))/i },
    { id: 'culvert', label: 'culvert', re: /culvert/i },
    { id: 'flood', label: 'flood', re: /flood/i },
    { id: 'channel', label: 'channel', re: /channel(?!iz)/i },
    { id: 'detention', label: 'detention', re: /detention|retention basin/i },
    { id: 'ditch', label: 'ditch', re: /ditch/i },
    { id: 'bridge-class', label: 'bridge-class', re: /bridge[\s-]*class/i },
    { id: 'outfall-inlet', label: 'outfall / inlet', re: /outfall|\binlets?\b/i },
    { id: 'pump-station', label: 'pump station', re: /pump\s*station/i },
    { id: 'hydraulics', label: 'hydraulics / H&H', re: /hydraul(?!ic cement)|hydrolog|\bH&H\b/i },
    { id: 'erosion', label: 'erosion / scour', re: /erosion|scour|rip[\s-]?rap|slope (failure|repair)/i }
  ];
  // Roadway/bridge work that usually carries drainage design. This is an INFERENCE from type of work, not something the agency states.
  var LIKELY_RE = /widen road|construct new road|reconstruct|bridge replacement|construct bridge|highway improvement|intersection improvement|rehabilitate existing roadway|new location|interchange|grade separation|frontage|add lanes|overpass/i;

  function matchKeywords(text) {
    var out = [];
    if (!text) return out;
    for (var i = 0; i < KEYWORDS.length; i++) if (KEYWORDS[i].re.test(text)) out.push(KEYWORDS[i].id);
    return out;
  }
  function kwLabel(id) {
    for (var i = 0; i < KEYWORDS.length; i++) if (KEYWORDS[i].id === id) return KEYWORDS[i].label;
    return id;
  }

  // ---- phases (common stage groups the Radar assigns; the source's own stage text is always kept in `stage`) ----
  var PHASES = [
    { id: 'early', label: 'Planning / early', color: '#8aa0b8' },
    { id: 'design', label: 'Design / PS&E', color: '#fbbf24' },
    { id: 'letting', label: 'Ready / letting', color: '#34d399' },
    { id: 'construction', label: 'Construction', color: '#fb7185' },
    { id: 'procure', label: 'Consultant procurement', color: '#c084fc' },
    { id: 'funding', label: 'Funding commitment', color: '#38bdf8' },
    { id: 'other', label: 'Other / unknown', color: '#64748b' }
  ];
  function phaseLabel(id) { for (var i = 0; i < PHASES.length; i++) if (PHASES[i].id === id) return PHASES[i].label; return id; }
  function phaseColor(id) { for (var i = 0; i < PHASES.length; i++) if (PHASES[i].id === id) return PHASES[i].color; return '#64748b'; }
  var TXDOT_PHASE = {
    'Planning': 'early', 'Initiate': 'early', 'Feasibility Study': 'early',
    'PE': 'design', 'PS&E': 'design',
    'Ready to Let': 'letting', 'Letting': 'letting', 'Procurement': 'letting',
    'Construction': 'construction', 'Design and Construction': 'construction',
    'Execute': 'other'
  };
  // City of Houston CIP stage codes, from the legend text on the HPW CIP layer ("Future (F), Future Programmed (FP), Programmed (P), Design (E), Pending Construction (PC), Construction (C), Complete (CP)").
  var COH_STAGE = {
    'F': ['Future (unfunded/unscheduled)', 'early'], 'FP': ['Future programmed', 'early'], 'P': ['Programmed', 'early'],
    'E': ['Design', 'design'], 'PC': ['Pending construction', 'letting'], 'C': ['Construction', 'construction'], 'CP': ['Complete', 'construction']
  };
  var SWMB_PHASE = {
    'Nomination': 'early', 'Qualifies': 'early', 'Planned': 'early', 'Under Study': 'early', 'Screening': 'early', 'Proposed Location': 'early', 'To Be Determined': 'early', 'Received': 'early',
    'In Design': 'design', 'Construction NTP Pending': 'letting', 'In Construction': 'construction', 'On Hold': 'other', 'On-hold': 'other'
  };

  // ---- agencies ----
  var AGENCIES = {
    'TxDOT': { color: '#38bdf8', full: 'Texas Department of Transportation' },
    'City of Houston': { color: '#fbbf24', full: 'City of Houston (Houston Public Works)' },
    'HCFCD': { color: '#34d399', full: 'Harris County Flood Control District' },
    'TWDB': { color: '#c084fc', full: 'Texas Water Development Board' }
  };
  function agencyColor(a) { return (AGENCIES[a] && AGENCIES[a].color) || '#94a3b8'; }

  // ---- small helpers ----
  function str(v) { if (v === null || v === undefined) return null; v = String(v).replace(/\s+/g, ' ').trim(); return v === '' || v === '.' || v === '-' ? null : v; }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(String(v).replace(/[$,]/g, '')); return isFinite(n) ? n : null; }
  function pos(v) { var n = num(v); return n !== null && n > 0 ? n : null; }
  function isoFromMs(ms) { if (ms === null || ms === undefined || ms === '') return null; var d = new Date(Number(ms)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  function isoFromText(s) { // 2027-09-03T00:00:00.000 or 2027-09-03
    if (!s) return null; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }
  function isoFromMDY(s) { // 06/25/2026 or 06/25/26
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s || '').trim()); if (!m) return null;
    var y = +m[3]; if (y < 100) y += 2000; return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  }
  function titleCase(s) { return s ? s.toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }) : s; }
  function prettySponsor(s) { // "FORT BEND (COUNTY)" -> "Fort Bend County"
    if (!s) return null; var m = /^(.*?)\s*\((CITY|COUNTY)\)\s*$/i.exec(s);
    return m ? titleCase(m[1]) + (m[2].toUpperCase() === 'COUNTY' ? ' County' : ' (city)') : titleCase(s);
  }
  function round(n, d) { var p = Math.pow(10, d); return Math.round(n * p) / p; }
  function validLL(lat, lon) { return typeof lat === 'number' && typeof lon === 'number' && lat > 25.5 && lat < 36.8 && lon > -106.8 && lon < -93.3; }

  function classify(texts, opts) {
    // returns { rel: 'direct'|'likely'|'none', kw: [..], why: string }
    opts = opts || {};
    var joined = texts.filter(Boolean).join(' | ');
    var kw = matchKeywords(joined);
    if (opts.sourceDirect) return { rel: 'direct', kw: kw, why: opts.sourceDirect };
    if (kw.length) return { rel: 'direct', kw: kw, why: 'Keyword match in source text: ' + kw.map(kwLabel).join(', ') };
    if (opts.likely !== false && LIKELY_RE.test(joined)) return { rel: 'likely', kw: [], why: 'Inferred from type of work (' + (joined.match(LIKELY_RE) || [''])[0].toLowerCase() + '); roadway/bridge projects usually carry drainage design. Not stated by the agency.' };
    return { rel: 'none', kw: [], why: '' };
  }

  // ---- TxDOT Project Information (data.texas.gov drau-zphx) ----
  var TXDOT_KEEP_STAGES = ['Planning', 'Initiate', 'Execute', 'PE', 'PS&E', 'Ready to Let', 'Letting', 'Procurement', 'Design and Construction'];
  var TXDOT_SELECT = ['project_id', 'control_section_job_csj', 'project_stage', 'project_status', 'project_type', 'let_type_description', 'type_of_work', 'short_description', 'project_description', 'project_name', 'project_classification', 'project_sub_type_description', 'highway', 'project_limits_from', 'project_limits_to', 'contract_limits_from', 'contract_limits_to', 'county', 'district_division', 'city', 'latitude_line_begin', 'longitude_line_begin', 'latitude_line_end', 'longitude_line_end', 'project_estimated_let_date', 'project_estimate_low_bid', 'local_agency_name', 'mpo_description', 'letting_status_description', 'tip_year', 'construction_manager'];
  var TXDOT_DATASET = 'https://data.texas.gov/dataset/Project-Information/drau-zphx';

  function normTxdotPI(r) {
    if (!r || !r.project_id) return null;
    var stage = str(r.project_stage);
    if (TXDOT_KEEP_STAGES.indexOf(stage) < 0) return null;
    var st = str(r.project_status); if (st && st !== 'Active') return null;
    var texts = [r.type_of_work, r.short_description, r.project_description, r.project_name, r.project_classification, r.project_sub_type_description];
    var c = classify(texts);
    if (c.rel === 'none') return null;
    var la = num(r.latitude_line_begin), lo = num(r.longitude_line_begin), la2 = num(r.latitude_line_end), lo2 = num(r.longitude_line_end);
    var lat = null, lon = null;
    if (validLL(la, lo)) { if (validLL(la2, lo2)) { lat = round((la + la2) / 2, 5); lon = round((lo + lo2) / 2, 5); } else { lat = round(la, 5); lon = round(lo, 5); } }
    var hw = str(r.highway), from = str(r.project_limits_from) || str(r.contract_limits_from), to = str(r.project_limits_to) || str(r.contract_limits_to);
    var limits = (from && to) ? (from === to ? from : from + ' to ' + to) : (from || to || null);
    var title = [hw, str(r.short_description) || str(r.type_of_work)].filter(Boolean).join(' · ');
    if (limits) title += ' (' + limits + ')';
    var sponsor = prettySponsor(str(r.local_agency_name));
    var county = str(r.county);
    var rec = {
      id: 'txdot:' + r.project_id, src: 'txdot-pi', agency: 'TxDOT', kind: 'project',
      title: title || r.project_id, phase: TXDOT_PHASE[stage] || 'other', stage: stage,
      county: county ? titleCase(county) : null, district: str(r.district_division),
      lat: lat, lon: lon, date: isoFromText(r.project_estimated_let_date), dateLabel: 'Est. letting (TxDOT)',
      cost: pos(r.project_estimate_low_bid), costLabel: 'Est. construction cost (TxDOT low-bid estimate)',
      work: str(r.type_of_work), desc: str(r.project_description),
      url: 'https://data.texas.gov/resource/drau-zphx.json?project_id=' + encodeURIComponent(r.project_id),
      rel: c.rel, kw: c.kw, why: c.why, extra: []
    };
    var ex = rec.extra;
    ex.push(['TxDOT project ID', r.project_id]);
    if (str(r.control_section_job_csj)) ex.push(['CSJ', str(r.control_section_job_csj)]);
    if (str(r.let_type_description)) ex.push(['Let type', str(r.let_type_description)]);
    if (sponsor) { ex.push(['Local agency named by TxDOT', sponsor]); rec.sponsor = sponsor; }
    if (str(r.mpo_description)) ex.push(['MPO', str(r.mpo_description)]);
    if (str(r.letting_status_description)) ex.push(['Letting status', str(r.letting_status_description)]);
    if (str(r.tip_year)) ex.push(['TIP year', str(r.tip_year)]);
    return rec;
  }

  // TxDOT Project Tracker (ArcGIS) enrichment: actual PS&E milestone dates and TxDOT contact name, joined by project ID.
  var TRACKER_FIELDS = ['PROJ_ID', 'PSE_30_ACTL_DT', 'PSE_60_ACTL_DT', 'PSE_100_ACTL_DT', 'DSGN_START_ACTL_DT', 'ENVCLR_ACTL_DT', 'ROW_ACTL_DT', 'RTL_ACTL_DT', 'TXDOT_CNTCT_NM', 'LAST_PROJ_UPDATE_DT'];
  function mergeTracker(rec, t) {
    if (!rec || !t) return false;
    var any = false;
    var items = [['Design start (actual)', t.DSGN_START_ACTL_DT], ['PS&E 30% (actual)', t.PSE_30_ACTL_DT], ['PS&E 60% (actual)', t.PSE_60_ACTL_DT], ['PS&E 100% (actual)', t.PSE_100_ACTL_DT], ['Environmental clearance (actual)', t.ENVCLR_ACTL_DT], ['ROW (actual)', t.ROW_ACTL_DT], ['Ready to let (actual)', t.RTL_ACTL_DT]];
    for (var i = 0; i < items.length; i++) { var d = isoFromMs(items[i][1]); if (d) { rec.extra.push([items[i][0], d]); any = true; } }
    if (str(t.TXDOT_CNTCT_NM)) { rec.extra.push(['TxDOT contact (Project Tracker)', str(t.TXDOT_CNTCT_NM)]); any = true; }
    var lu = isoFromMs(t.LAST_PROJ_UPDATE_DT); if (lu) rec.extra.push(['Tracker last updated', lu]);
    if (any) rec.tracker = true;
    return any;
  }

  // ---- City of Houston CIP (HPW CIPProgramming MapServer) ----
  var COH_BASE = 'https://geoprocessor2.houstontx.gov/arcgis/rest/services/CP/CIPProgramming/MapServer';
  // layer id -> {label, direct (whole layer is stormwater/drainage), cls}
  var COH_LAYERS = [
    { id: 7, label: 'Active - Stormwater', direct: 'Source category: Houston CIP "Stormwater" layer' },
    { id: 11, label: 'Active - Benefit Drainage Area', direct: 'Source category: Houston CIP "Benefit Drainage Area" layer' },
    { id: 65, label: 'Unfunded/Unscheduled - Stormwater', direct: 'Source category: Houston CIP "Stormwater" layer (unfunded/unscheduled)' },
    { id: 68, label: 'Unfunded/Unscheduled - Benefit Drainage Area', direct: 'Source category: Houston CIP "Benefit Drainage Area" layer (unfunded/unscheduled)' },
    { id: 2, label: 'Active - Street and Traffic', direct: null },
    { id: 10, label: 'Active - Interagency', direct: null }
  ];
  function geomCenter(g) { // ArcGIS JSON geometry (outSR 4326): rings / paths / x,y -> [lon, lat] by vertex average
    if (!g) return null;
    if (typeof g.x === 'number') return [g.x, g.y];
    var parts = g.rings || g.paths; if (!parts || !parts.length) return null;
    var sx = 0, sy = 0, n = 0;
    for (var i = 0; i < parts.length; i++) for (var j = 0; j < parts[i].length; j++) { sx += parts[i][j][0]; sy += parts[i][j][1]; n++; }
    return n ? [sx / n, sy / n] : null;
  }
  function normCohCip(a, geom, layer) {
    if (!a) return null;
    var code = str(a.STAGE);
    var st = COH_STAGE[code] || [code || 'unknown', 'other'];
    if (code === 'CP') return null;
    var desc = str(a.PRO_DESC);
    var c = classify([desc, str(a.PRO_SCOPE), str(a.PRO_TYPE)], { sourceDirect: layer.direct, likely: false });
    if (c.rel === 'none') return null;
    var ctr = geomCenter(geom), lat = null, lon = null;
    if (ctr && validLL(ctr[1], ctr[0])) { lat = round(ctr[1], 5); lon = round(ctr[0], 5); }
    var cip = str(a.CIP_NO) || str(a.PROJ_NO);
    var rec = {
      id: 'coh:' + cip + ':' + (code || ''), src: 'coh-cip', agency: 'City of Houston', kind: 'project',
      title: (desc || cip) + (cip ? ' (' + cip + ')' : ''), phase: st[1], stage: st[0] + (code ? ' [' + code + ']' : ''),
      county: null, lat: lat, lon: lon,
      date: isoFromMs(a.CONST_STAR), dateLabel: 'Construction start (City CIP)',
      cost: pos(a.COST), costLabel: 'Est. cost (City CIP)', work: str(a.PRO_TYPE) ? 'CIP type ' + str(a.PRO_TYPE) : null, desc: str(a.PRO_SCOPE),
      url: COH_BASE + '/' + layer.id + '/query?where=OBJECTID%3D' + a.OBJECTID + '&outFields=*&f=pjson',
      rel: c.rel, kw: c.kw, why: c.why, extra: [], _layer: layer.id, _cip: cip
    };
    var ex = rec.extra;
    if (cip) ex.push(['CIP number', cip]);
    if (str(a.PROJ_NO) && str(a.PROJ_NO) !== cip) ex.push(['Project number', str(a.PROJ_NO)]);
    ex.push(['CIP layer', layer.label]);
    if (str(a.DES_ENGR)) ex.push(['Design engineer of record (per City CIP)', str(a.DES_ENGR)]);
    if (str(a.DPRO_MAN)) ex.push(['City design project manager', str(a.DPRO_MAN)]);
    if (str(a.CPRO_MAN)) ex.push(['City construction project manager', str(a.CPRO_MAN)]);
    if (str(a.CONTR)) ex.push(['Contractor', str(a.CONTR)]);
    if (str(a.KEY_MAP)) ex.push(['Key map', str(a.KEY_MAP)]);
    if (str(a.COUN_DIST)) ex.push(['Council district', str(a.COUN_DIST)]);
    var ce = isoFromMs(a.CONST_END); if (ce) ex.push(['Construction end (City CIP)', ce]);
    var md = isoFromMs(a.MOD_DATE); if (md) ex.push(['City CIP last modified', md]);
    return rec;
  }

  // ---- City of Houston stormwater maintenance branch projects (SWMB_Projects) ----
  var COH_SWMB_BASE = 'https://geoprocessor2.houstontx.gov/arcgis/rest/services/SWMB_Projects/FeatureServer/0';
  function normSwmb(a) {
    if (!a) return null;
    var status = str(a.STATUS); if (!status || !(status in SWMB_PHASE)) return null;
    var lat = num(a.YCENTER), lon = num(a.XCENTER); if (!validLL(lat, lon)) { lat = null; lon = null; }
    var name = str(a.PROJECTNAME) || str(a.ProjectID);
    var rec = {
      id: 'coh-swmb:' + (str(a.ProjectID) || a.OBJECTID), src: 'coh-swmb', agency: 'City of Houston', kind: 'project',
      title: name + (str(a.ProjectID) ? ' (' + str(a.ProjectID) + ')' : ''), phase: SWMB_PHASE[status], stage: status,
      county: null, lat: lat ? round(lat, 5) : null, lon: lon ? round(lon, 5) : null,
      date: isoFromMs(a.STARTDATE), dateLabel: 'Start date (City SWMB)',
      cost: pos(a.ConstructionCost) || pos(a.DesignCost), costLabel: pos(a.ConstructionCost) ? 'Construction cost (City SWMB)' : 'Design cost (City SWMB)',
      work: str(a.PROJECTSCOPE) || str(a.ASSETTYPE), desc: [str(a.DESCRIPTION), str(a.DRAINAGEISSUE) ? 'Issue: ' + str(a.DRAINAGEISSUE) : null].filter(Boolean).join(' · ') || null,
      url: COH_SWMB_BASE + '/query?where=OBJECTID%3D' + a.OBJECTID + '&outFields=*&f=pjson',
      rel: 'direct', kw: matchKeywords([a.PROJECTNAME, a.DESCRIPTION, a.DRAINAGEISSUE, a.PROJECTSCOPE].join(' ')), why: 'Source category: City of Houston stormwater maintenance (SWMB) project list', extra: []
    };
    var ex = rec.extra;
    if (str(a.PROJECTTYPE)) ex.push(['Program', str(a.PROJECTTYPE)]);
    if (str(a.ASSETTYPE)) ex.push(['Asset type', str(a.ASSETTYPE)]);
    if (str(a.PRIORITY)) ex.push(['Priority / FY', str(a.PRIORITY)]);
    if (str(a.COUNCILDISTRICT)) ex.push(['Council district', str(a.COUNCILDISTRICT)]);
    var ds = isoFromMs(a.DesignStartDate); if (ds) ex.push(['Design start', ds]);
    var dc = isoFromMs(a.DesignCompleteDate); if (dc) ex.push(['Design complete', dc]);
    var le = isoFromMs(a.last_edited_date); if (le) ex.push(['City SWMB last edited', le]);
    return rec;
  }

  // ---- HCFCD maintenance projects (ArcGIS layer hosted by LJA Engineering; NOT an official HCFCD service) ----
  var HCFCD_LJA = 'https://gis.lja.com/arcgis/rest/services/Hosted/hcfcd_maintenance_projects/FeatureServer/0';
  var HCFCD_PAGE = 'https://www.hcfcd.org/Resources/Interactive-Mapping-Tools/Active-Construction-Projects';
  function normHcfcdMaint(a, geom) {
    if (!a || !a.project_id) return null;
    var med = str(a.med_stage), fy = str(a.fy26_stage), hs = str(a.hcfcd_status);
    if (med === 'Completed' || hs === 'Complete' || hs === 'Canceled') return null;
    var stageRaw = med || fy || hs || null;
    var phase = stageRaw === 'Design' ? 'design' : stageRaw === 'Bid' ? 'letting' : stageRaw === 'Construction' ? 'construction' : (hs === 'Future' ? 'early' : 'other');
    var lat = geom && typeof geom.y === 'number' ? geom.y : null, lon = geom && typeof geom.x === 'number' ? geom.x : null;
    if (!validLL(lat, lon)) { lat = null; lon = null; }
    var adv = isoFromText(a.first_advert_or_oncall_transfer);
    var title = (str(a.med_type_of_work) || str(a.project_type) || 'Maintenance project') + ' · ' + a.project_id + (str(a.watershed_name) ? ' (' + str(a.watershed_name) + ')' : '');
    var rec = {
      id: 'hcfcd-m:' + a.project_id, src: 'hcfcd-maint', agency: 'HCFCD', kind: 'project',
      title: title, phase: phase, stage: stageRaw || 'unknown', county: 'Harris', lat: lat !== null ? round(lat, 5) : null, lon: lon !== null ? round(lon, 5) : null,
      date: adv, dateLabel: 'First advertised / on-call transfer (HCFCD)',
      cost: pos(a.med_cost_estimate), costLabel: 'Est. cost (HCFCD maintenance schedule)',
      work: str(a.med_type_of_work) || str(a.project_type), desc: str(a.hcfcd_location),
      url: HCFCD_LJA + '/query?where=project_id%3D%27' + encodeURIComponent(a.project_id) + '%27&outFields=*&f=html',
      rel: 'direct', kw: matchKeywords([a.med_type_of_work, a.project_type, a.hcfcd_location].join(' ')), why: 'Source category: HCFCD channel/basin maintenance project', extra: []
    };
    var ex = rec.extra;
    ex.push(['HCFCD project ID', a.project_id]);
    if (str(a.med_designer)) ex.push(['Designer (per HCFCD sheet)', str(a.med_designer)]);
    if (str(a.project_team)) ex.push(['Project team', str(a.project_team)]);
    if (str(a.med_project_manager)) ex.push(['HCFCD project manager', str(a.med_project_manager)]);
    if (str(a.watershed_name)) ex.push(['Watershed', str(a.watershed_name)]);
    if (str(a.precinct)) ex.push(['Precinct', str(a.precinct)]);
    if (num(a.med_pct_design_complete) !== null) ex.push(['Design % complete (as reported, 1 = 100%)', String(num(a.med_pct_design_complete))]);
    if (str(a.med_status_comments)) ex.push(['HCFCD status comment', str(a.med_status_comments)]);
    if (str(a.comments_fy26)) ex.push(['FY26 comment', str(a.comments_fy26)]);
    if (str(a.first_advert_or_oncall_transfer) && !adv) ex.push(['First advert / on-call transfer (as written)', str(a.first_advert_or_oncall_transfer)]);
    return rec;
  }

  // ---- minimal HTML helpers (regex; the source pages are plain tables) ----
  function decodeHtml(s) {
    return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); });
  }
  function htmlTables(html) {
    var tables = [], tm, tre = /<table[\s\S]*?<\/table>/gi;
    while ((tm = tre.exec(html))) {
      var rows = [], rm, rre = /<tr[\s\S]*?<\/tr>/gi;
      while ((rm = rre.exec(tm[0]))) {
        var cells = [], cm, cre = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, hrefs = [];
        while ((cm = cre.exec(rm[0]))) {
          var h = /href="([^"]+)"/i.exec(cm[1]); if (h) hrefs.push(decodeHtml(h[1]));
          cells.push(decodeHtml(cm[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
        }
        if (cells.length) rows.push({ cells: cells, href: hrefs[0] || null });
      }
      tables.push(rows);
    }
    return tables;
  }

  // ---- HCFCD "Current & Past Bid Opportunities" page (HTML tables; no dates or locations on the page) ----
  var HCFCD_BIDS_PAGE = 'https://www.hcfcd.org/Community/Work-With-Us/Current-Past-Bid-Opportunities';
  function parseHcfcdBids(html) {
    var out = [], seen = {};
    htmlTables(html).forEach(function (rows) {
      if (!rows.length) return;
      var head = rows[0].cells.join(' ').toLowerCase();
      var table = /request for qualifications|rfq/.test(head) ? 'Request for Qualifications (professional services)' : /invitation to bid|itb/.test(head) ? 'Invitation to Bid / construction' : /description/.test(head) ? 'Current list' : null;
      if (!table || rows[0].cells.length < 3) return;
      rows.slice(1).forEach(function (r) {
        var job = str(r.cells[1]), title = str(r.cells[2]);
        if (!job || !title || !/^\d{2}\/\d{4}$/.test(job)) return;
        var key = job; if (seen[key]) return; seen[key] = 1;
        var prof = /^(RFSQ|RFQ)\b|Professional|Engineering Services|Study|Feasibility|Staff Augmentation|Program Management|Program Implementation/i.test(title) && !/^ITB\b|^CSP\b/i.test(title);
        var c = classify([title], { likely: false });
        if (c.rel === 'none' && !/^[A-Z]\d{3}-\d{2}-\d{2}/.test(title)) return; // HCFCD unit/project IDs (e.g. P118-26-00-E001) are channel/basin projects
        if (c.rel === 'none') c = { rel: 'direct', kw: [], why: 'HCFCD project-ID prefix in title (HCFCD unit numbers identify channel/basin projects)' };
        out.push({
          id: 'hcfcd-bid:' + job, src: 'hcfcd-bids', agency: 'HCFCD', kind: 'procurement',
          title: title, phase: 'procure', stage: table, status: 'Listed on HCFCD page (open/closed not shown there)', county: 'Harris', lat: null, lon: null, date: null, dateLabel: 'Due date not shown on HCFCD page',
          cost: null, costLabel: null, work: prof ? 'Professional services (inferred from title)' : 'Construction / other (inferred from title)', desc: null,
          url: r.href || HCFCD_BIDS_PAGE, rel: c.rel, kw: c.kw, why: c.why,
          extra: [['HCFCD job #', job], ['Listed under', table], ['Status', 'Listed on HCFCD "Current & Past" page; open/closed status and due date are not shown there. Check the Bonfire link.']]
        });
      });
    });
    return out;
  }

  // ---- TxDOT PEPS pages ----
  var PEPS_SELECTED_PAGE = 'https://www.txdot.gov/business/peps/opportunities/consultants-selected-for-negotiations.html';
  var PEPS_MEETINGS_PAGE = 'https://www.txdot.gov/business/peps/opportunities/meetings.html';
  var PEPS_WORK = { 'PS&E': ['likely', 'PS&E consultant procurement (TxDOT work-type code PS&E)'], 'H&H': ['direct', 'Hydraulics & hydrology consultant procurement (TxDOT work-type code H&H)'], 'BRGD': ['likely', 'Bridge design consultant procurement (TxDOT work-type code BRGD)'] };
  function parsePepsSelected(html, maxFY) {
    var out = [], seen = {};
    htmlTables(html).forEach(function (rows) {
      if (!rows.length || !/project id/i.test(rows[0].cells[0] || '')) return;
      var head = rows[0].cells.map(function (c) { return c.toLowerCase(); });
      var iClose = 1, iWave = head.indexOf('wave'), iFY = head.indexOf('fiscal year'), iType = head.findIndex(function (h) { return /work type|type of work/.test(h); }), iSC = head.findIndex(function (h) { return /service center/.test(h); });
      rows.slice(1).forEach(function (r) {
        var id = str(r.cells[0]); if (!id || !/^\d{3}CT\d+/.test(id) || seen[id]) return;
        var type = str(r.cells[iType]); var w = PEPS_WORK[(type || '').replace(/&amp;/g, '&')]; if (!w) return;
        var closing = str(r.cells[iClose]); var d = isoFromMDY(closing);
        var wave = iWave >= 0 ? str(r.cells[iWave]) : null, fy = iFY >= 0 ? str(r.cells[iFY]) : null;
        if (!fy && wave) { var mm = /FY-?(\d{4})/.exec(wave); if (mm) fy = mm[1]; }
        if (maxFY && fy && +fy < maxFY) return;
        seen[id] = 1;
        var sc = iSC >= 0 ? str(r.cells[iSC]) : null;
        out.push({
          id: 'peps:' + id, src: 'txdot-peps', agency: 'TxDOT', kind: 'procurement',
          title: 'TxDOT PEPS ' + type + ' procurement ' + id + (sc ? ' · ' + sc : ''), phase: 'procure', stage: 'Listed on TxDOT "Consultants selected for negotiations" page',
          county: null, lat: null, lon: null, date: d, dateLabel: 'Solicitation closing date (TxDOT PEPS)', cost: null, costLabel: null,
          work: type, desc: 'The TxDOT page gives only project ID, closing date, wave, work type and service center. No scope, location or award value is listed.',
          url: PEPS_SELECTED_PAGE, rel: w[0] === 'direct' ? 'direct' : 'likely', kw: [], why: w[1] + '. Relevance inferred from the work-type code only.',
          extra: [['PEPS project ID', id], ['Closing date (as listed)', closing || 'not listed'], ['Wave', wave || 'not listed'], ['Fiscal year', fy || 'not listed'], ['Service center', sc || 'not listed']]
        });
      });
    });
    return out;
  }
  function parsePepsMeetings(html) {
    var out = [], seen = {};
    htmlTables(html).forEach(function (rows) {
      if (!rows.length || !/^date$/i.test(rows[0].cells[0] || '')) return;
      rows.slice(1).forEach(function (r) {
        var date = isoFromMDY(r.cells[0]), desc = str(r.cells[1]), loc = str(r.cells[2]);
        if (!date || !desc) return;
        var psE = /PS&E|plans,? specifications|hydraulic|drainage|bridge design/i.test(desc);
        var c = classify([desc]);
        if (!psE && c.rel === 'none') return;
        var rel = c.rel !== 'none' ? c.rel : 'likely';
        var why = c.rel !== 'none' ? c.why : 'Consultant meeting title mentions PS&E; relevance inferred from the title only.';
        var key = date + desc; if (seen[key]) return; seen[key] = 1;
        var dm = /–\s*([A-Za-z .]+(?:District|Division))\s*$/.exec(desc) || /-\s*([A-Za-z .]+(?:District|Division))\s*$/.exec(desc);
        out.push({
          id: 'peps-mtg:' + date + ':' + desc.slice(0, 60).replace(/\W+/g, '-'), src: 'txdot-meetings', agency: 'TxDOT', kind: 'procurement',
          title: desc, phase: 'procure', stage: 'Consultant information meeting', county: null, district: dm ? dm[1].trim() : null, lat: null, lon: null,
          date: date, dateLabel: 'Meeting date (TxDOT)', cost: null, costLabel: null, work: 'Consultant meeting', desc: loc ? 'Location: ' + loc : null,
          url: r.href ? (/^https?:/.test(r.href) ? r.href : 'https://www.txdot.gov' + r.href) : PEPS_MEETINGS_PAGE, rel: rel, kw: c.kw, why: why, extra: [['Location', loc || 'not listed']]
        });
      });
    });
    return out;
  }

  // ---- TxDOT Projected Contracts List (xlsx; rows = arrays of cell values) ----
  function parseProjectedContracts(rows, url, fyLabel) {
    var out = [], hdr = -1, i;
    for (i = 0; i < rows.length; i++) if (/estimated date/i.test(String(rows[i][0] || ''))) { hdr = i; break; }
    if (hdr < 0) return out;
    for (i = hdr + 1; i < rows.length; i++) {
      var r = rows[i]; var adv = str(r[0]), disc = str(r[1]), mgr = str(r[2]), sc = str(r[3]), proc = str(r[6]), desc = str(r[7]), loc = str(r[8]), ct = str(r[9]), fund = str(r[10]), n = str(r[11]), val = str(r[12]), pre = str(r[13]);
      if (!adv || !disc || !desc) continue;
      var d = null, mon = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(adv);
      if (mon) { var mi = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(mon[1].toLowerCase()) + 1; d = mon[2] + '-' + ('0' + mi).slice(-2) + '-01'; }
      var isPSE = /PS&E|plans, specifications/i.test(disc), isHH = /hydraul|hydrolog/i.test(disc), isBr = /bridge design|BRGD/i.test(disc);
      var c = classify([desc]);
      var rel = isHH ? 'direct' : (c.rel === 'direct' && (isPSE || isBr || /engineering|design/i.test(disc))) ? 'direct' : (isPSE || isBr) ? 'likely' : 'none';
      var why = isHH ? 'Discipline is Hydraulics/Hydrological (stated by TxDOT).' : rel === 'direct' ? c.why : rel === 'likely' ? 'Discipline is ' + disc + '; PS&E/bridge design usually includes drainage design. Inferred, not stated.' : '';
      var cost = pos(val);
      var dist = (/([A-Za-z .]+ District)/.exec(mgr || '') || [])[1] || null, county = (/([A-Za-z .]+) County/.exec(loc || '') || [])[1] || null;
      out.push({
        id: 'pcl:' + (fyLabel || '') + ':' + i, src: 'txdot-pcl', agency: 'TxDOT', kind: 'procurement',
        title: disc + ' · ' + (desc.length > 140 ? desc.slice(0, 137) + '...' : desc), phase: 'procure', stage: 'Projected A/E contract (' + adv.replace(/\s+/g, ' ') + ')',
        county: county ? county.trim() : null, district: dist ? dist.trim() : null, lat: null, lon: null, date: d, dateLabel: 'Est. advertisement wave (TxDOT)',
        cost: cost, costLabel: 'Est. max contract value (consultant, TxDOT)', work: disc, desc: desc,
        url: url, rel: rel, kw: c.kw, why: why,
        extra: [['Estimated advertisement', adv.replace(/\s+/g, ' ')], ['Managing district/division', mgr || 'not listed'], ['Procuring PEPS service center', sc || 'not listed'], ['Selection process', proc || 'not listed'], ['Project location', loc || 'not listed'], ['Contract type (SD specific / ID indefinite)', ct || 'not listed'], ['Anticipated funding', fund || 'not listed'], ['Number of contracts', n || 'not listed'], ['Estimated max contract value', val || 'not listed'], ['Pre-solicitation meeting', pre || 'not listed']]
      });
    }
    return out;
  }

  // ---- TWDB Flood Infrastructure Fund commitments (table mirrored on a Pape-Dawson ArcGIS server; no coordinates) ----
  var FIF_URL = 'https://maps.pape-dawson.com/server1/rest/services/Hydrology/HYDROLOGY__TWDB_FIF_Projects/MapServer/6';
  var FIF_PAGE = 'https://www.twdb.texas.gov/financial/programs/fif/dashboard.asp';
  function normFif(a) {
    if (!a || !a.Project_ID) return null;
    var name = str(a.Name), c = classify([name, str(a.FIF_Project_Type)], { sourceDirect: 'Source category: TWDB Flood Infrastructure Fund (flood mitigation) project', likely: false });
    var types = { FME: 'Flood management evaluation', FMP: 'Flood management project', FMS: 'Flood management strategy' };
    var t = str(a.FIF_Project_Type);
    return {
      id: 'fif:' + a.Project_ID, src: 'twdb-fif', agency: 'TWDB', kind: 'funding',
      title: (name || ('FIF project ' + a.Project_ID)) + (str(a.Project_Sponsor) ? ' (sponsor: ' + str(a.Project_Sponsor) + ')' : ''), phase: 'funding', stage: 'In TWDB FIF project list' + (t ? ' (' + (types[t] || t) + ')' : ''),
      county: null, lat: null, lon: null, date: null, dateLabel: 'Date not provided', cost: pos(a.Estimated_Costs), costLabel: 'Estimated cost (TWDB FIF list)',
      work: t ? (types[t] || t) : null, desc: null, url: FIF_PAGE, rel: 'direct', kw: c.kw, why: c.why, sponsor: str(a.Project_Sponsor),
      extra: [['TWDB project ID', String(a.Project_ID)], ['Sponsor', str(a.Project_Sponsor) || 'not listed'], ['TWDB flood planning region', a.TWDB_Flood_Planning_Region !== null && a.TWDB_Flood_Planning_Region !== undefined ? String(a.TWDB_Flood_Planning_Region) : 'not listed'], ['Community cost share estimate', num(a.Community_Cost_Share_Estimate) !== null ? '$' + Math.round(num(a.Community_Cost_Share_Estimate)).toLocaleString('en-US') : 'not listed']]
    };
  }

  // ---- Consultant-services solicitations (engineering/design/professional services) ----
  // Nothing here judges fit. A record is flagged `svc` by a stated rule (see isConsultant) and `eng` lists the engineering words found in the title,
  // shown as "match". Status, type and due date are copied from the source as given.
  var ENG_KEYWORDS = [
    { id: 'engineering', label: 'engineering', re: /engineer/i },
    { id: 'design', label: 'design', re: /\bdesign(?!\s*[-/]?\s*build)|\bPS&E\b|plans,? specifications/i },
    { id: 'architect', label: 'architect', re: /architect/i },
    { id: 'civil', label: 'civil', re: /\bcivil\b/i },
    { id: 'survey', label: 'survey', re: /land survey|surveying|topograph|subsurface utility|\bSUE\b|\bsurveyor/i },
    { id: 'geotech', label: 'geotechnical', re: /geotech|materials testing/i },
    { id: 'professional', label: 'professional services', re: /professional (engineering|services|consult)|\bconsultants?\b|consulting services|on[- ]call|rotation list/i },
    { id: 'cm-inspect', label: 'construction mgmt / inspection', re: /construction management|\bCMI\b|\bCMEI\b|inspection services|program management|project management services/i },
    { id: 'study', label: 'study / planning', re: /\bstud(y|ies)\b|master plan|feasibility|needs assessment|planning services|corridor/i }
  ];
  function matchEng(text) {
    var out = []; if (!text) return out;
    for (var i = 0; i < ENG_KEYWORDS.length; i++) if (ENG_KEYWORDS[i].re.test(text)) out.push(ENG_KEYWORDS[i].id);
    return out;
  }
  function engLabel(id) { for (var i = 0; i < ENG_KEYWORDS.length; i++) if (ENG_KEYWORDS[i].id === id) return ENG_KEYWORDS[i].label; return id; }
  // Solicitation type as written in the title / reference / type column. RFQ "t" (Fort Worth "RFQt") means a price quote, not qualifications.
  function solType(text) {
    var t = String(text || '');
    if (/\bRFQt\b/.test(t)) return { code: 'RFQt', label: 'Request for quote (price quote)', cls: 'bid' };
    if (/request for (statements? of )?qualifications?|\bRFQS\b|\bRFQ[uU]?\b|\bRFSQ\b|\bSOQ\b|statements? of qualifications?|\bRFQ\b/i.test(t) && !/\bRFQt\b/.test(t)) return { code: 'RFQ', label: 'Request for qualifications', cls: 'qual' };
    if (/request for (competitive sealed )?proposals?|\bRFC?SP\b|\bRFP\b/i.test(t)) return { code: 'RFP', label: 'Request for proposals', cls: 'prop' };
    if (/\bIFB\b|\bITB\b|invitation (for|to) bids?|\bIFQ\b|\bCSP\b|\bCB-\d|\bCMAR\b/i.test(t)) return { code: 'Bid', label: 'Bid / construction-type', cls: 'bid' };
    return { code: null, label: 'Type not stated', cls: 'unk' };
  }
  // The rule behind the "Consultant services" focus. Stated, not a judgment of fit:
  //   (a) qualifications-type solicitation (RFQ / RFQS / RFSQ / SOQ), or
  //   (b) proposal-type (RFP) solicitation whose title contains an engineering word, or
  //   (c) the source itself categorizes it as professional services / consultant procurement (Austin contracts "Professional Services",
  //       TxDOT Projected Contracts List, TxDOT PEPS, HCFCD "Request for Qualifications" table).
  function isConsultant(r) {
    if (!r) return false;
    if (r.svc === true) return true;
    if (r.src === 'txdot-pcl' || r.src === 'txdot-peps' || r.src === 'txdot-meetings') return true;
    if (r.src === 'hcfcd-bids' && /Request for Qualifications/.test(r.stage || '')) return true;
    return false;
  }
  function svcRule(type, eng, srcCat) {
    if (srcCat) return { svc: true, basis: 'Source category: ' + srcCat };
    if (type.cls === 'qual') return { svc: true, basis: 'Qualifications-type solicitation (' + type.code + ' in the title/type as published)' };
    if (type.cls === 'prop' && eng.length) return { svc: true, basis: 'Proposal-type solicitation whose title has engineering words: ' + eng.map(engLabel).join(', ') };
    return { svc: false, basis: '' };
  }
  function isoFromSerial(n) { n = Number(n); if (!isFinite(n) || n < 20000) return null; var d = new Date(Math.round((Math.floor(n) - 25569) * 86400000)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  function lastMDY(s) { var m = String(s || '').match(/\d{1,2}\/\d{1,2}\/\d{4}/g); return m ? m[m.length - 1] : null; }

  var SOL_AGENCIES = {
    'Harris County': { color: '#f97316', full: 'Harris County (Bonfire portal; includes HCFCD, County Engineer, Precincts)' },
    'Fort Bend County': { color: '#a3e635', full: 'Fort Bend County' },
    'Galveston County': { color: '#2dd4bf', full: 'Galveston County' },
    'Brazoria County': { color: '#f472b6', full: 'Brazoria County' },
    'METRO': { color: '#e879f9', full: 'Metropolitan Transit Authority of Harris County' },
    'City of Austin': { color: '#fb923c', full: 'City of Austin' },
    'City of San Antonio': { color: '#4ade80', full: 'City of San Antonio' },
    'City of Dallas': { color: '#60a5fa', full: 'City of Dallas' },
    'City of Fort Worth': { color: '#f87171', full: 'City of Fort Worth' },
    'DART': { color: '#22d3ee', full: 'Dallas Area Rapid Transit' },
    'DFW Airport': { color: '#facc15', full: 'Dallas Fort Worth International Airport' }
  };
  Object.keys(SOL_AGENCIES).forEach(function (k) { AGENCIES[k] = SOL_AGENCIES[k]; });

  // Bonfire public portals (the portal's own public "open opportunities" list; no login). agency/county are the portal owner's.
  var BONFIRE_PORTALS = [
    { sub: 'harriscountytx', agency: 'Harris County', county: 'Harris' },
    { sub: 'fortbendcountytx', agency: 'Fort Bend County', county: 'Fort Bend' },
    { sub: 'galvestoncountytx', agency: 'Galveston County', county: 'Galveston' },
    { sub: 'brazoriacounty', agency: 'Brazoria County', county: 'Brazoria' },
    { sub: 'ridemetro', agency: 'METRO', county: 'Harris' },
    { sub: 'txdot', agency: 'TxDOT', county: null },
    { sub: 'dallascityhall', agency: 'City of Dallas', county: 'Dallas' },
    { sub: 'fortworthtexas', agency: 'City of Fort Worth', county: 'Tarrant' },
    { sub: 'dart', agency: 'DART', county: 'Dallas' },
    { sub: 'dfwairport', agency: 'DFW Airport', county: null }
  ];
  function bonfireRecord(p, portal) {
    if (!p || !p.ProjectID || !p.ProjectName) return null;
    var title = str(p.ProjectName).replace(/\s*-\s*\*\d+\s*$/, ''), ref = str(p.ReferenceID);
    var type = solType(title + ' ' + (ref || '')), eng = matchEng(title), kw = matchKeywords(title), rule = svcRule(type, eng, null);
    var close = str(p.DateClose);
    var url = 'https://' + portal.sub + '.bonfirehub.com/opportunities/' + p.ProjectID;
    return {
      id: 'bf:' + portal.sub + ':' + p.ProjectID, src: 'bonfire-' + portal.sub, agency: portal.agency, kind: 'solicitation', phase: 'procure',
      title: title, stage: 'Open solicitation (as listed on the agency Bonfire portal)', status: 'Open', solType: type.label, svc: rule.svc, eng: eng, county: portal.county,
      lat: null, lon: null, date: isoFromText(close), dateLabel: 'Close date (as given by portal; time zone not stated)', cost: null, costLabel: null,
      work: type.label, desc: null, url: url, rel: kw.length ? 'direct' : 'none', kw: kw,
      why: (rule.svc ? 'In the Consultant services focus: ' + rule.basis + '. ' : 'Not in the Consultant services focus (type: ' + type.label + '). ') + (kw.length ? 'Drainage keyword match in title: ' + kw.map(kwLabel).join(', ') + '.' : 'No drainage keyword in the title.'),
      extra: [['Solicitation number', ref || 'not listed'], ['Status (as listed)', 'Open'], ['Close date/time (raw, as given)', close || 'not listed'], ['Type (read from title/number)', type.label], ['Engineering words in title', eng.length ? eng.map(engLabel).join(', ') : 'none'], ['Note', 'Bonfire pages answer scripts with HTTP 403; the link opens fine in a normal browser. The portal list gives no description.']]
    };
  }

  // Austin Finance Online "Active Solicitations" xlsx export (Austin purchasing; no login).
  var AUSTIN_SOL_PAGE = 'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm';
  var AUSTIN_SOL_XLSX = 'https://financeonline.austintexas.gov/afo/account_services/solicitation/excel_solicitations.cfm?ccat=View%20All';
  function parseAustinActive(rows) {
    var out = [], hdr = -1, i;
    for (i = 0; i < rows.length; i++) if (/^solicitation id$/i.test(String(rows[i][0] || ''))) { hdr = i; break; }
    if (hdr < 0) return out;
    for (i = hdr + 1; i < rows.length; i++) {
      var r = rows[i], sid = str(r[0]), no = str(r[1]), desc = str(r[2]);
      if (!sid || !no || !desc) continue;
      var type = solType(no), eng = matchEng(desc), kw = matchKeywords(desc), rule = svcRule(type, eng, null);
      var pub = isoFromSerial(r[3]), due = isoFromSerial(r[4]);
      out.push({
        id: 'austin-sol:' + sid, src: 'austin-active', agency: 'City of Austin', kind: 'solicitation', phase: 'procure',
        title: desc + ' (' + no + ')', stage: 'Active solicitation (Austin Finance Online)', status: 'Open', solType: type.label, svc: rule.svc, eng: eng, county: 'Travis',
        lat: null, lon: null, date: due, dateLabel: 'Closing date (Austin Finance Online, Central time)', cost: null, costLabel: null, work: type.label, desc: null,
        url: 'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitation_details.cfm?sid=' + encodeURIComponent(sid),
        rel: kw.length ? 'direct' : 'none', kw: kw,
        why: (rule.svc ? 'In the Consultant services focus: ' + rule.basis + '. ' : 'Not in the Consultant services focus (type: ' + type.label + '). ') + (kw.length ? 'Drainage keyword match in title: ' + kw.map(kwLabel).join(', ') + '.' : 'No drainage keyword in the title.'),
        extra: [['Solicitation number', no], ['Status (as listed)', 'Active / open'], ['Published', pub || 'not listed'], ['Type (read from number)', type.label], ['Engineering words in title', eng.length ? eng.map(engLabel).join(', ') : 'none']]
      });
    }
    return out;
  }

  // Austin "Contracts" open dataset (data.austintexas.gov 84ih-p28j): active master agreements. We keep the Professional Services category only,
  // one record per agreement, listing the vendors on it. Awarded work: shows who holds the agreement and when it ends (recompete signal, inferred).
  var AUSTIN_CONTRACTS_URL = 'https://data.austintexas.gov/resource/84ih-p28j.json';
  var AUSTIN_CONTRACTS_PAGE = 'https://data.austintexas.gov/d/84ih-p28j';
  function normAustinContracts(rows) {
    var by = {}, order = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.doc_id || !/^professional services$/i.test(str(r.cat_dscr) || '')) return;
      var k = r.doc_id; if (!by[k]) { by[k] = { r: r, vendors: [] }; order.push(k); }
      var v = str(r.lgl_nm); if (v && by[k].vendors.indexOf(v) < 0) by[k].vendors.push(v);
    });
    return order.map(function (k) {
      var r = by[k].r, vendors = by[k].vendors, desc = str(r.doc_dscr) || k, eng = matchEng(desc), kw = matchKeywords(desc);
      var end = isoFromText(r.efend_dt), begin = isoFromText(r.efbgn_dt), lim = pos(r.ma_prch_lmt_am), so = str(r.so_doc_cd) ? str(r.so_doc_cd) + (str(r.so_doc_id) ? ' ' + str(r.so_doc_id) : '') : null;
      return {
        id: 'austin-contract:' + k, src: 'austin-contracts', agency: 'City of Austin', kind: 'contract', phase: 'other',
        title: desc + ' (' + k + ')', stage: 'Awarded: active professional-services agreement per Austin Contracts dataset', status: 'Awarded (active agreement per source)', solType: so || 'Master agreement', svc: true, eng: eng, county: 'Travis',
        lat: null, lon: null, date: end, dateLabel: 'Agreement end date (as given; may already have passed)', cost: lim, costLabel: 'Authorized spending limit (Austin)', work: 'Professional Services (Austin category)', desc: null,
        url: AUSTIN_CONTRACTS_URL + '?doc_id=' + encodeURIComponent(k), rel: kw.length ? 'direct' : 'none', kw: kw,
        why: 'In the Consultant services focus: Source category: Professional Services. Awarded contract, not an open solicitation. Agreement end date can signal a future recompete (inferred).',
        extra: [['Agreement', k], ['Original solicitation (per source)', so || 'not listed'], ['Effective', begin && end ? begin + ' to ' + end : 'not listed'], ['Vendors on agreement (' + vendors.length + ')', vendors.join('; ')], ['Engineering words in title', eng.length ? eng.map(engLabel).join(', ') : 'none']]
      };
    });
  }

  // City of San Antonio "Bidding & Contracting" list (webapp1.sanantonio.gov/BidContractOpps; HTML grid, paged by form postback).
  var SA_PAGE = 'https://webapp1.sanantonio.gov/BidContractOpps/Default.aspx';
  function parseSanAntonio(html) {
    var out = [];
    htmlTables(html).forEach(function (rows) {
      if (!rows.length || !/^description$/i.test(rows[0].cells[0] || '') || rows[0].cells.length < 6) return;
      rows.slice(1).forEach(function (r) {
        if (r.cells.length < 6 || !r.href) return;
        var title = str(r.cells[0]), typeTxt = str(r.cells[1]), dept = str(r.cells[2]), rel = isoFromMDY(r.cells[3]), dueRaw = str(r.cells[5]), due = isoFromMDY(lastMDY(dueRaw));
        if (!title || !due) return;
        var m = /(?:content\.aspx\?id=)(\d+)/i.exec(r.href), idn = m ? m[1] : null; if (!idn) return;
        var type = solType((typeTxt || '') + ' ' + title); if (/request for offer/i.test(typeTxt || '')) type = { code: 'Offer', label: 'Request for offer', cls: 'bid' };
        if (/competitive sealed proposals/i.test(typeTxt || '')) type = { code: 'RFCSP', label: 'Request for competitive sealed proposals', cls: 'prop' };
        var eng = matchEng(title), kw = matchKeywords(title), rule = svcRule(type, eng, null);
        out.push({
          id: 'sa-sol:' + idn, src: 'sa-bids', agency: 'City of San Antonio', kind: 'solicitation', phase: 'procure',
          title: title, stage: 'Listed on City of San Antonio Bidding & Contracting', status: 'Open (listed)', solType: typeTxt || type.label, svc: rule.svc, eng: eng, county: 'Bexar',
          lat: null, lon: null, date: due, dateLabel: 'Solicitation deadline (as listed' + (/extended/i.test(dueRaw) ? ', extended' : '') + ')', cost: null, costLabel: null, work: typeTxt, desc: null,
          url: 'https://webapp1.sanantonio.gov/BidContractOpps/' + r.href.replace(/&amp;/g, '&').replace(/^\.?\//, ''), rel: kw.length ? 'direct' : 'none', kw: kw,
          why: (rule.svc ? 'In the Consultant services focus: ' + rule.basis + '. ' : 'Not in the Consultant services focus (type: ' + (typeTxt || type.label) + '). ') + (kw.length ? 'Drainage keyword match in title: ' + kw.map(kwLabel).join(', ') + '.' : 'No drainage keyword in the title.'),
          extra: [['Type (as listed)', typeTxt || 'not listed'], ['Department', dept || 'not listed'], ['Released', rel || 'not listed'], ['Deadline text (raw)', dueRaw || 'not listed'], ['Engineering words in title', eng.length ? eng.map(engLabel).join(', ') : 'none'], ['Note', 'Documents are on the City SAePS / CivCast portals and need registration. This list shows title, type, department and dates only.']]
        });
      });
    });
    return out;
  }

  // ---- county centroids for approximate placement (only when a source gives a county but no coordinates) ----
  function countyCentroids(geo) {
    var out = {};
    ((geo && geo.counties) || []).forEach(function (c) {
      var best = null, bestA = -1;
      c.r.forEach(function (ring) {
        var a = 0, cx = 0, cy = 0;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          var f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
        }
        a /= 2; if (Math.abs(a) > bestA && a !== 0) { bestA = Math.abs(a); best = [cx / (6 * a), cy / (6 * a)]; }
      });
      if (best) out[c.n.toLowerCase()] = best;
    });
    return out;
  }
  function applyApprox(records, centroids) {
    var n = 0;
    records.forEach(function (r) {
      // only where the SOURCE names the county (TxDOT Project Information); never for records whose county we would have to assume
      if (r.src === 'txdot-pi' && (r.lat === null || r.lat === undefined)) {
        var k = r.county ? String(r.county).toLowerCase().replace(/ county$/, '') : null;
        if (k && centroids[k]) { r.alat = round(centroids[k][1], 4); r.alon = round(centroids[k][0], 4); n++; }
      }
    });
    return n;
  }

  // ---- filtering / aggregation ----
  var HOUSTON_AREA = ['harris', 'fort bend', 'montgomery', 'brazoria', 'galveston', 'waller']; // TxDOT Houston District counties
  function inHoustonArea(r) {
    if (r.agency === 'City of Houston' || r.agency === 'HCFCD' || r.agency === 'Harris County' || r.agency === 'METRO') return true; // Houston / Harris County bodies
    if (r.county && HOUSTON_AREA.indexOf(String(r.county).toLowerCase().replace(/ county$/, '')) >= 0) return true;
    return r.district === 'Houston District' || r.district === 'Houston';
  }
  function searchText(r) { return (r.title + ' ' + (r.desc || '') + ' ' + (r.work || '') + ' ' + (r.county || '') + ' ' + (r.sponsor || '') + ' ' + (r.stage || '') + ' ' + r.agency + ' ' + r.id).toLowerCase(); }
  function filterRecords(recs, f, watch) {
    f = f || {};
    var q = f.q ? String(f.q).toLowerCase().split(/\s+/).filter(Boolean) : [];
    return recs.filter(function (r) {
      if (f.consult) { // Consultant services focus: stated rule in isConsultant(); drainage relevance only applies if "Direct" is picked
        if (!isConsultant(r)) return false;
        if (f.rel === 'direct' && r.rel !== 'direct') return false;
        if (f.eng && !((r.eng && r.eng.length) || (r.kw && r.kw.length))) return false;
      } else if (f.rel === 'direct') { if (r.rel !== 'direct') return false; }
      else if (f.rel !== 'all' && r.rel === 'none') return false; // default: direct + likely
      if (f.agencies && f.agencies.length && f.agencies.indexOf(r.agency) < 0) return false;
      if (f.phases && f.phases.length && f.phases.indexOf(r.phase) < 0) return false;
      if (f.kinds && f.kinds.length && f.kinds.indexOf(r.kind) < 0) return false;
      if (f.kw && f.kw.length) { var ok = false; for (var i = 0; i < f.kw.length; i++) if (r.kw && r.kw.indexOf(f.kw[i]) >= 0) { ok = true; break; } if (!ok) return false; }
      if (f.houston && !inHoustonArea(r)) return false;
      if (f.located && !(typeof r.lat === 'number' || typeof r.alat === 'number')) return false;
      if (f.watchOnly && !(watch && watch[r.id])) return false;
      if (f.from && (!r.date || r.date < f.from)) return false;
      if (f.to && (!r.date || r.date > f.to)) return false;
      if (f.month && (!r.date || r.date.slice(0, 7) !== f.month)) return false;
      if (q.length) { var t = r._t || (r._t = searchText(r)); for (var j = 0; j < q.length; j++) if (t.indexOf(q[j]) < 0) return false; }
      return true;
    });
  }
  function countBy(recs, fn) { var m = {}; recs.forEach(function (r) { var k = fn(r); if (k === null || k === undefined) return; m[k] = (m[k] || 0) + 1; }); return m; }
  function sortedCounts(m, limit) { var a = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (x, y) { return y[1] - x[1] || (x[0] < y[0] ? -1 : 1); }); return limit ? a.slice(0, limit) : a; }
  function monthKey(d) { return d ? d.slice(0, 7) : null; }
  function daysUntil(iso, today) { if (!iso) return null; var a = Date.parse(iso + 'T00:00:00Z'), b = Date.parse(today + 'T00:00:00Z'); return Math.round((a - b) / 86400000); }

  // ---- display helpers ----
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'unknown';
    if (n >= 1e9) return '$' + round(n / 1e9, 2) + 'B'; if (n >= 1e6) return '$' + round(n / 1e6, 2) + 'M'; if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K'; return '$' + Math.round(n);
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) { if (!iso) return 'unknown'; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : iso; }
  function fmtMonth(k) { var m = /^(\d{4})-(\d{2})/.exec(k || ''); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : 'no date'; }

  // ---- CSV ----
  function csvCell(v) { if (v === null || v === undefined) return ''; v = String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var CSV_COLS = ['agency', 'kind', 'title', 'phase', 'stage', 'county', 'date', 'dateLabel', 'cost', 'costLabel', 'relevance', 'keywords', 'relevance_basis', 'lat', 'lon', 'location_approx', 'source', 'url', 'id', 'status', 'solicitation_type', 'engineering_words', 'consultant_focus'];
  function toCSV(recs, sources) {
    var nameOf = {}; (sources || []).forEach(function (s) { nameOf[s.id] = s.name; });
    var lines = [CSV_COLS.join(',')];
    recs.forEach(function (r) {
      var vals = [r.agency, r.kind, r.title, phaseLabel(r.phase), r.stage, r.county, r.date, r.dateLabel, r.cost, r.costLabel, r.rel === 'direct' ? 'direct' : r.rel === 'none' ? 'no drainage keyword' : 'likely (inferred)', (r.kw || []).map(kwLabel).join('; '), r.why,
        typeof r.lat === 'number' ? r.lat : (typeof r.alat === 'number' ? r.alat : ''), typeof r.lon === 'number' ? r.lon : (typeof r.alon === 'number' ? r.alon : ''), typeof r.lat !== 'number' && typeof r.alat === 'number' ? 'county centroid (inferred)' : '', nameOf[r.src] || r.src, r.url, r.id, r.status || '', r.solType || '', (r.eng || []).map(engLabel).join('; '), isConsultant(r) ? 'yes' : ''];
      lines.push(vals.map(csvCell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  var api = {
    KEYWORDS: KEYWORDS, PHASES: PHASES, AGENCIES: AGENCIES, HOUSTON_AREA: HOUSTON_AREA, TXDOT_KEEP_STAGES: TXDOT_KEEP_STAGES, TXDOT_SELECT: TXDOT_SELECT, TXDOT_DATASET: TXDOT_DATASET, TRACKER_FIELDS: TRACKER_FIELDS,
    COH_LAYERS: COH_LAYERS, COH_BASE: COH_BASE, COH_SWMB_BASE: COH_SWMB_BASE, HCFCD_LJA: HCFCD_LJA, HCFCD_PAGE: HCFCD_PAGE, HCFCD_BIDS_PAGE: HCFCD_BIDS_PAGE, PEPS_SELECTED_PAGE: PEPS_SELECTED_PAGE, PEPS_MEETINGS_PAGE: PEPS_MEETINGS_PAGE, FIF_URL: FIF_URL, FIF_PAGE: FIF_PAGE,
    matchKeywords: matchKeywords, kwLabel: kwLabel, ENG_KEYWORDS: ENG_KEYWORDS, matchEng: matchEng, engLabel: engLabel, solType: solType, isConsultant: isConsultant, svcRule: svcRule, isoFromSerial: isoFromSerial, BONFIRE_PORTALS: BONFIRE_PORTALS, bonfireRecord: bonfireRecord, AUSTIN_SOL_PAGE: AUSTIN_SOL_PAGE, AUSTIN_SOL_XLSX: AUSTIN_SOL_XLSX, parseAustinActive: parseAustinActive, AUSTIN_CONTRACTS_URL: AUSTIN_CONTRACTS_URL, AUSTIN_CONTRACTS_PAGE: AUSTIN_CONTRACTS_PAGE, normAustinContracts: normAustinContracts, SA_PAGE: SA_PAGE, parseSanAntonio: parseSanAntonio, classify: classify, phaseLabel: phaseLabel, phaseColor: phaseColor, agencyColor: agencyColor,
    normTxdotPI: normTxdotPI, mergeTracker: mergeTracker, normCohCip: normCohCip, normSwmb: normSwmb, normHcfcdMaint: normHcfcdMaint, normFif: normFif, geomCenter: geomCenter,
    htmlTables: htmlTables, decodeHtml: decodeHtml, parseHcfcdBids: parseHcfcdBids, parsePepsSelected: parsePepsSelected, parsePepsMeetings: parsePepsMeetings, parseProjectedContracts: parseProjectedContracts,
    countyCentroids: countyCentroids, applyApprox: applyApprox, inHoustonArea: inHoustonArea,
    filterRecords: filterRecords, countBy: countBy, sortedCounts: sortedCounts, monthKey: monthKey, daysUntil: daysUntil,
    fmtMoney: fmtMoney, fmtDate: fmtDate, fmtMonth: fmtMonth, toCSV: toCSV, CSV_COLS: CSV_COLS, isoFromMs: isoFromMs, isoFromMDY: isoFromMDY, prettySponsor: prettySponsor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RadarModel = api;
})(typeof self !== 'undefined' ? self : this);
