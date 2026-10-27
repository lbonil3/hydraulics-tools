/* National Radar: normalizers for ADVANCE-NOTICE sources (agency forecasts, projected advertisements, tentative advertisement schedules).
   Each function turns one row of a public page or open-data feed into the candidate shape that pse.js evaluates. Pure functions (no network, no DOM),
   shared by scripts/build-national.js and the tests.
   Rules kept here:
   - A dollar figure is read only from a column that states a contract value, estimate, fee or range. Nothing is computed. If the source has no such column (or the cell is empty) the candidate has NO amounts.
   - Dates are copied as the source gives them. A quarter or a month is never turned into a day (month-only becomes YYYY-MM, a quarter stays text in dates.estText).
   - Every candidate carries advance: true, so pse.js can place it in the "Advance notices" lens (never in a fee filter unless the source states a fee of $5M or more). */
(function (root) {
  'use strict';
  var M = typeof require !== 'undefined' ? require('./model.js') : root.NationalModel;
  var clean = M.clean;

  // ---------- small HTML helpers ----------
  function cellText(h) { return clean(M.stripHtml(h).replace(/[\u200b\u200c\u200d\ufeff]/g, '')); }
  // every <table> in a page as an array of rows, each row an array of cell texts
  function parseTables(html) {
    var out = [], tm, tre = /<table[\s\S]*?<\/table>/gi;
    while ((tm = tre.exec(html))) {
      var rows = [], rm, rre = /<tr[\s\S]*?<\/tr>/gi;
      while ((rm = rre.exec(tm[0]))) { var cells = [], cm, cre = /<t[dh][\s\S]*?<\/t[dh]>/gi; while ((cm = cre.exec(rm[0]))) cells.push(cellText(cm[0])); if (cells.length) rows.push(cells); }
      out.push(rows);
    }
    return out;
  }
  // first table whose header row has every wanted column (case-insensitive substring); returns { head: {name: index}, rows: [[...]] } or null
  function tableWith(html, wanted) {
    var tabs = parseTables(html);
    for (var i = 0; i < tabs.length; i++) {
      for (var r = 0; r < Math.min(3, tabs[i].length); r++) {
        var hdr = tabs[i][r].map(function (c) { return c.toLowerCase(); }), idx = {}, ok = true;
        wanted.forEach(function (w) { var lw = w.toLowerCase(), j = hdr.indexOf(lw); if (j < 0) hdr.forEach(function (c, k) { if (j < 0 && c.indexOf(lw) >= 0) j = k; }); if (j < 0) ok = false; idx[w] = j; });
        if (ok) return { head: idx, rows: tabs[i].slice(r + 1) };
      }
    }
    return null;
  }
  function slug(s) { return clean(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160); }
  function money(s) { var m = /^\$\s?([\d,]+(?:\.\d+)?)$/.exec(clean(s)); if (!m) return null; var v = parseFloat(m[1].replace(/,/g, '')); return isFinite(v) && v > 0 ? v : null; }
  // mm/dd/yyyy -> YYYY-MM-DD; mm/yyyy -> YYYY-MM; anything else (TBD, a season, a quarter) -> null
  function dateOf(s) {
    s = clean(s); var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) { var mo = +m[1], d = +m[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return m[3] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2); }
    m = /^(\d{1,2})\/(\d{4})$/.exec(s); if (m && +m[1] >= 1 && +m[1] <= 12) return m[2] + '-' + ('0' + m[1]).slice(-2);
    return null;
  }

  // ---------- WSSC Water: Projected Solicitations (HTML table; Projected Contract Value is stated) ----------
  var WSSC_PAGE = 'https://www.wsscwater.com/work-with-us/contracting/solicitation-list';
  function wsscAsOf(html) { var m = /Projected WSSC Water Solicitations as of ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(cellText(html)); if (!m) return null; var d = new Date(m[1] + ' 12:00:00 UTC'); return isFinite(d) ? d.toISOString().slice(0, 10) : null; }
  function normWsscRow(row, head, asOf) {
    var title = clean(row[head['Solicitation Title']]), type = clean(row[head['Type']]), prog = clean(row[head['Program Code']]), ad = clean(row[head['Projected Advertisement Date']]), val = money(row[head['Projected Contract Value']]);
    if (!title) return null;
    var aeStrong = /^Architecture and Engineering Services$/i.test(prog), prof = /^Professional Services$/i.test(prog);
    if (!aeStrong && !prof) return { skip: 'program-not-professional-services', title: title, prog: prog };
    return { src: 'wssc', srcId: slug(title), url: WSSC_PAGE, title: title, desc: type + '. WSSC program code: ' + prog + '.', agency: 'WSSC Water', subagency: null, office: null, state: 'MD', city: null, naics: '', psc: '',
      advance: true, status: 'upcoming', noticeType: 'Projected solicitation (agency forecast)', noticeLabel: 'WSSC Water projected solicitation list' + (asOf ? ', as of ' + asOf : ''),
      engOverride: aeStrong ? { level: 'strong', why: 'WSSC program code is "Architecture and Engineering Services" (structured column)' } : { level: 'weak', why: 'WSSC program code is "Professional Services", not "Architecture and Engineering Services"; engineering is not stated' },
      amounts: val ? [{ v: val, kind: 'estvalue', field: 'Projected Contract Value (WSSC Water projected solicitation list)' }] : [],
      dates: { est: dateOf(ad), estLabel: 'Projected advertisement (WSSC)', posted: asOf || null },
      fields: { 'Solicitation type': type, 'Program code': prog, 'Projected advertisement date': ad, 'Projected contract value': row[head['Projected Contract Value']], 'List as of': asOf } };
  }
  function normWssc(html) {
    var t = tableWith(html, ['Solicitation Title', 'Type', 'Program Code', 'Projected Advertisement Date', 'Projected Contract Value']); if (!t) throw new Error('WSSC table not found (page layout changed)');
    var asOf = wsscAsOf(html); return { asOf: asOf, rows: t.rows.length, cands: t.rows.map(function (r) { return normWsscRow(r, t.head, asOf); }).filter(Boolean) };
  }

  // ---------- Colorado DOT: Tentative Advertisement Schedule (consultant solicitations; no fee column) ----------
  var CDOT_PAGE = 'https://www.codot.gov/business/consultants/schedule';
  function normCdotRow(row, head) {
    var desc = clean(row[head['Project Description']]), ad = clean(row[head['1st Ad Date']]), due = clean(row[head['Proposal Due Date']]), reg = clean(row[head['Region']]);
    if (!desc) return null;
    var num = /\((\d{4,6})\)\s*$/.exec(desc);
    return { src: 'cdot-sched', srcId: num ? num[1] : slug(desc), url: CDOT_PAGE, title: desc, desc: 'Colorado DOT consultant solicitation, Tentative Advertisement Schedule. Region: ' + (reg || 'not stated') + '.', agency: 'Colorado DOT', subagency: reg ? 'Region ' + reg : null, office: null, state: 'CO', city: null, naics: '', psc: '',
      advance: true, roadAgency: 'Colorado DOT consultant advertisement schedule (state highway agency)', status: 'upcoming', noticeType: 'Tentative advertisement schedule (forecast)', noticeLabel: 'CDOT tentative consultant advertisement schedule',
      engOverride: { level: 'strong', why: 'Colorado DOT Tentative Advertisement Schedule lists consultant (professional services) solicitations by definition' }, amounts: [],
      dates: { est: dateOf(ad), estLabel: 'First advertisement (CDOT)', due: dateOf(due) },
      fields: { 'Region(s)': reg, '1st Ad Date': ad, 'Proposal Due Date': due } };
  }
  function normCdot(html) {
    var t = tableWith(html, ['Region', '1st Ad Date', 'Project Description', 'Proposal Due Date']); if (!t) throw new Error('CDOT table not found (page layout changed)');
    return { rows: t.rows.length, cands: t.rows.map(function (r) { return normCdotRow(r, t.head); }).filter(Boolean) };
  }

  // ---------- Louisiana DOTD: Projected Advertisements (consultant contracts; no fee column) ----------
  var LA_PAGE = 'https://dotd.la.gov/about/office-of-project-delivery/engineering/contract-services/consultant-contracts/projected-advertisements/';
  function normLaRow(row, head) {
    var num = clean(row[head['Project Number']]), name = clean(row[head['Project Name']]), scope = clean(row[head['Brief Scope']]), added = clean(row[head['Date Added']]), upd = clean(row[head['Last Updated']]), q = clean(row[head['Quarter']]);
    if (!name) return null;
    var ceI = /\bCE\s*&\s*I\b|\bCEI\b|\bCE&amp;I\b|construction engineering (?:and|&) inspection/i.test(scope + ' ' + name);
    return { src: 'la-dotd', srcId: (num && !/^TBD$/i.test(num) ? num.replace(/\bENTITY\b/g, '').trim().replace(/\s+/g, '-') : 'tbd-' + slug(name)), url: LA_PAGE, title: name, desc: scope, agency: 'Louisiana DOTD', subagency: null, office: null, state: 'LA', city: null, naics: '', psc: '',
      advance: true, roadAgency: 'Louisiana DOTD consultant contracts (state highway agency)', nonDesign: ceI ? 'CE&I (construction engineering and inspection) services, not design' : null, status: 'upcoming', noticeType: 'Projected advertisement (agency forecast)', noticeLabel: 'Louisiana DOTD projected consultant advertisement',
      engOverride: { level: 'strong', why: 'Louisiana DOTD Projected Advertisements lists consultant contracts by definition' }, amounts: [],
      dates: { posted: dateOf(added), estText: q || null, estLabel: 'Projected advertisement quarter (DOTD)' },
      fields: { 'Project number': num, 'Projected advertisement quarter': q, 'Date added to site': added, 'Date last updated': upd } };
  }
  function normLa(html) {
    var t = tableWith(html, ['Project Number', 'Project Name', 'Date Added', 'Quarter', 'Brief Scope']); if (!t) throw new Error('DOTD table not found (page layout changed)');
    return { rows: t.rows.length, cands: t.rows.map(function (r) { return normLaRow(r, t.head); }).filter(Boolean) };
  }

  // ---------- District of Columbia OCP: PASS Forecast (ArcGIS REST, open data). The amount fields are empty in the feed; FUNDINGSOURCE is a mislabeled value bucket and is NOT read. ----------
  var DC_LAYER = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Government_Operations/MapServer/18';
  var DC_ENG_RE = /ENGINEER|ARCHITECT|SURVEY(?:ING|OR)/i, DC_WEAK_RE = /ENVIRONMENTAL CONSULT|PLANNING|SCIENTIF/i;
  function epochDate(ms) { if (typeof ms !== 'number' || !isFinite(ms)) return null; return new Date(ms).toISOString().slice(0, 10); }
  function normDcPass(a) {
    var title = clean(a.PROJECTTITLE || a.NAME), desc = clean(a.DESCRIPTION), code = clean(a.COMMODITYCODENAME); if (!title) return null;
    var eng = DC_ENG_RE.test(code) ? { level: 'strong', why: 'DC commodity code name is "' + code + '" (structured field)' } : DC_WEAK_RE.test(code) ? { level: 'weak', why: 'DC commodity code name is "' + code + '"; engineering is not stated' } : { level: 'none', why: 'DC commodity code name is "' + code + '"' };
    var amt = [], v = typeof a.ESTIMATEDAMOUNT === 'number' && a.ESTIMATEDAMOUNT > 0 ? a.ESTIMATEDAMOUNT : (typeof a.AMOUNT === 'number' && a.AMOUNT > 0 ? a.AMOUNT : null);
    if (v) amt.push({ v: v, kind: 'estvalue', field: (typeof a.ESTIMATEDAMOUNT === 'number' && a.ESTIMATEDAMOUNT > 0 ? 'ESTIMATEDAMOUNT' : 'AMOUNT') + ' (DC OCP PASS Forecast)' });
    var id = a.OBJECTID !== undefined ? a.OBJECTID : a.ROW_ID;
    return { src: 'dc-pass', srcId: String(a.OAPTLINENO || id), url: DC_LAYER + '/query?where=OBJECTID%3D' + encodeURIComponent(id) + '&outFields=*&returnGeometry=false&f=json', title: title, desc: desc, agency: 'District of Columbia: ' + clean(a.AGENCY_NAME || a.AGENCYNAME || a.AGENCY_ACRONYM), subagency: null, office: null, state: 'DC', city: 'Washington',
      naics: '', psc: '', advance: true, status: 'upcoming', noticeType: 'Procurement forecast (agency forecast)', noticeLabel: 'DC OCP PASS Forecast, ' + clean(a.FISCALYEAR),
      engOverride: eng, amounts: amt, dates: { est: epochDate(a.LINENEEDBYDATE), estLabel: 'Line need-by date (DC)', estText: clean(a.LINEQUATER) ? clean(a.FISCALYEAR) + ' ' + clean(a.LINEQUATER) : null, posted: epochDate(a.DCS_LAST_MOD_DTTM) },
      fields: { 'OAPT line': a.OAPTLINENO, 'Fiscal year': a.FISCALYEAR, 'Quarter': a.LINEQUATER, 'Commodity code name': code, 'Agency': a.AGENCY_NAME || a.AGENCYNAME } };
  }

  // ---------- County of San Diego: Procurement Forecast (Socrata; no amount column) ----------
  var SD_PAGE = 'https://data.sandiegocounty.gov/dataset/Procurement-Forecast/rrhp-9sw9';
  var SD_ENG_RE = /engineering (?:services|design)|design services|civil engineer|architect|hydrolog|hydraul|drainage|storm ?water|geotechnical|surveying|\bA\/E\b|professional engineer/i;
  var SD_NOT_DESIGN_RE = /\b(?:maintenance|repair|inspection|construction management|janitorial|supplies|equipment|software|licens)/i;
  function normSdForecast(r, updatedIso) {
    var t0 = clean(r.current_contract_title), desc = clean(r.description_of_goods_services), dept = clean(r.county_department_seeking);
    var title = !t0 || /^No Existing Contract$/i.test(t0) ? clean(desc.split(/(?<=\.)\s/)[0]).slice(0, 160) : t0; if (!title) return null;
    var date = M.isoDate(r.anticipated_posting_date), text = title + ' ' + desc;
    return { src: 'sd-forecast', srcId: slug(title) + '-' + (date || 'nodate'), url: SD_PAGE, title: title, desc: desc, agency: 'County of San Diego', subagency: dept || null, office: null, state: 'CA', city: null, naics: '', psc: '',
      advance: true, roadAgency: /public works/i.test(dept) ? 'County of San Diego Department of Public Works' : undefined, status: 'upcoming', noticeType: 'Procurement forecast (agency forecast)', noticeLabel: 'County of San Diego Procurement Forecast',
      engOverride: SD_ENG_RE.test(text) && !SD_NOT_DESIGN_RE.test(title) ? { level: 'strong', why: 'The forecast description names engineering / design / survey work (inferred from words; the feed has no NAICS)' } : { level: 'none', why: 'The forecast description names no engineering or design work' }, amounts: [],
      dates: { est: date, estLabel: 'Anticipated posting date (County)', posted: updatedIso ? updatedIso.slice(0, 10) : null },
      fields: { 'Department': dept, 'Current contract': t0, 'Anticipated posting date': r.anticipated_posting_date } };
  }

  var api = { parseTables: parseTables, tableWith: tableWith, slug: slug, money: money, dateOf: dateOf, WSSC_PAGE: WSSC_PAGE, CDOT_PAGE: CDOT_PAGE, LA_PAGE: LA_PAGE, DC_LAYER: DC_LAYER, SD_PAGE: SD_PAGE, wsscAsOf: wsscAsOf, normWssc: normWssc, normCdot: normCdot, normLa: normLa, normDcPass: normDcPass, normSdForecast: normSdForecast };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NationalAdvance = api;
})(typeof self !== 'undefined' ? self : this);
