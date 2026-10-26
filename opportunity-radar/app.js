/* Opportunity Radar app. Static page; data comes from data/opportunities.json (snapshot) plus an optional live TxDOT refresh. */
(function () {
  'use strict';
  var M = window.RadarModel;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WATCH_KEY = 'opportunityRadar.watch.v1';

  var state = {
    data: null, recs: [], byId: {}, sources: [], watch: {}, live: null,
    f: { q: '', rel: 'relevant', consult: true, eng: false, agencies: [], phases: [], kinds: [], kw: [], houston: false, located: false, watchOnly: false, month: null },
    tab: 'radar', colorBy: 'agency', sort: 'date', rows: 100, filtered: [], today: new Date().toISOString().slice(0, 10)
  };
  try { state.watch = JSON.parse(localStorage.getItem(WATCH_KEY) || '{}') || {}; } catch (e) { state.watch = {}; }
  function saveWatch() { try { localStorage.setItem(WATCH_KEY, JSON.stringify(state.watch)); } catch (e) { toast('Could not save the watchlist (browser storage is blocked).'); } }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3500); }

  var KIND_LABEL = { solicitation: 'Open solicitation', contract: 'Awarded contract (incumbent info)', procurement: 'Consultant procurement signal', project: 'Project', funding: 'Funding commitment' };
  var NOT_USED = [
    ['Texas SmartBuy ESBD (state solicitations)', 'https://www.txsmartbuy.gov/esbd', 'No machine-readable feed found. The only data route is an undocumented internal API (it returned 405 to a plain request), and txsmartbuy.gov/robots.txt says "Disallow: /". Not scraped. Search it by hand.'],
    ['TxDOT TxDOT_Projects official ArcGIS layer', 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/TxDOT_Projects/FeatureServer', 'Now requires a token (error 499) and maps.txdot.gov MapServer reports "not started". The Project Tracker layer (TxDOT_Projects_Info) and data.texas.gov are used instead.'],
    ['H-GAC Transportation Improvement Program', 'https://www.h-gac.com/transportation-improvement-program/2027-2030', 'The only public REST layer found is a 2024 draft of the 2025-2028 TIP (superseded). The current 2027-2030 TIP is published as documents and an interactive viewer, not as a feed. Not used to avoid showing stale data.'],
    ['City of Houston open data portal (CIP)', 'https://data.houstontx.gov/dataset/city-of-houston-capital-improvement-plan', 'CKAN API works, but the CIP files there are old FY2016-2021 spreadsheets. The live Houston CIP layers (HPW ArcGIS) are used instead.'],
    ['Harris County Engineering / County Engineer CIP', 'https://oce.harriscountytx.gov/Divisions/Capital-Projects-Infrastructure', 'No public project feed found (a search hit turned out to be an unrelated BC, Canada service). Not used.'],
    ['HCFCD capital / 2018 bond program projects', 'https://www.hcfcd.org/bondprogram', 'Dashboard only; no public REST layer found. The only machine-readable HCFCD project data found is the maintenance layer hosted by LJA Engineering (used, flagged unofficial).'],
    ['Fort Bend County Drainage District', 'https://gisportal.fortbendcountytx.gov/arcgis/rest/services/Drainage/Drainage_Public/FeatureServer', 'ArcGIS service responds but holds gauges, dams, rivers, levees and floodplains: no project list.'],
    ['Montgomery County (solicitations)', 'https://www.mctx.org/departments/departments_l_-_p/purchasing/bid_proposal_opening_date.php', 'mctx.org/robots.txt disallows all generic crawlers ("User-agent: *  Disallow: /"). Not scraped. Check the bid page by hand.'],
    ['Port Houston (solicitations)', 'https://porthouston.com/business/strategic-sourcing/strategic-sourcing-overview/', 'Bids are on a Workday Strategic Sourcing public portal that is built in the browser (the page the server returns is a 1.5 KB shell, no data feed). Not used.'],
    ['City of Houston solicitations (Beacon Bid)', 'https://www.beaconbid.com/solicitations/city-of-houston/open', 'Houston posts all solicitations on Beacon Bid, which answers scripts with an AWS WAF human-verification (captcha) page. Not bypassed. Houston\'s own Procurement Plan page is a stale FY25 Q2 table (2023 dates) and the open-data "Archived Solicitations" file ends December 2023. Check Beacon by hand and use the Houston engineering RFQs there.'],
    ['HCTRA (Harris County Toll Road Authority) consultant RFQs', 'https://www.hctra.org/BusinessOpportunities', 'The page is a single-page app (5 KB shell); its data comes from an internal API that is not documented. Not used. HCTRA RFQs did not appear in the Harris County Bonfire list.'],
    ['Texas SmartBuy / TxDOT ESBD', 'https://www.txsmartbuy.gov/esbd', 'robots.txt says "Disallow: /". Not scraped.'],
    ['TWDB Flood Infrastructure Fund (official)', 'https://www.twdb.texas.gov/financial/programs/fif/dashboard.asp', 'Official source is a dashboard. The only feed found is a table mirrored by Pape-Dawson (used, flagged as a mirror).'],
    ['GLO CDBG-MIT / Regional Mitigation awards', 'https://www.glo.texas.gov/disaster-recovery/mitigation/regional-mitigation', 'Published as PDF award tables, not a feed. Not used.'],
    ['SAM.gov opportunities', 'https://sam.gov/', 'API needs a key. Skipped as instructed.'],
    ['Bonfire portals not found', 'https://www.bonfirehub.com/', 'No Bonfire portal was found for City of Houston, Port Houston, Montgomery County or HCTRA (tested likely sub-domains). Brazoria County has a portal with zero open items at snapshot time.'],
    ['Upcoming (pre-advertisement) lists', '', 'None of the agencies above publishes a machine-readable "upcoming consultant solicitations" list except TxDOT\'s Projected Contracts List (already used). Everything new in this view is OPEN or AWARDED, as the source states.']
  ];

  // ---------- load ----------
  function loadData() {
    return fetch('data/opportunities.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function ingest(data) {
    state.data = data; state.sources = data.sources || []; state.recs = data.records || [];
    state.recs.forEach(function (r) { r._t = null; });
    reindex();
  }
  function reindex() { state.byId = {}; state.recs.forEach(function (r) { state.byId[r.id] = r; }); }

  // ---------- derived ----------
  function colorOf(r) { return state.colorBy === 'phase' ? M.phaseColor(r.phase) : M.agencyColor(r.agency); }
  function hasLoc(r) { return typeof r.lat === 'number' || typeof r.alat === 'number'; }
  function ghosts() { // watched items no longer in the data
    var out = [];
    Object.keys(state.watch).forEach(function (id) { if (!state.byId[id]) { var w = state.watch[id]; out.push({ id: id, agency: w.a || 'unknown', kind: 'project', title: w.t || id, phase: 'other', stage: 'Not in the latest snapshot (it was starred earlier)', rel: 'direct', url: w.u, ghost: true, extra: [] }); } });
    return out;
  }
  function apply() {
    var base = state.recs; if (state.f.watchOnly) base = base.concat(ghosts());
    state.filtered = M.filterRecords(base, state.f, state.watch);
    sortList(state.filtered);
    renderAll();
  }
  function sortList(a) {
    var s = state.sort;
    function dkey(r, desc) { return r.date || (desc ? '0000' : '9999-99'); }
    a.sort(function (x, y) {
      if (s === 'date') { // upcoming first (soonest), then undated, then past (most recent first)
        var gx = !x.date ? 1 : x.date >= state.today ? 0 : 2, gy = !y.date ? 1 : y.date >= state.today ? 0 : 2;
        if (gx !== gy) return gx - gy; if (gx === 0) return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.title < y.title ? -1 : 1);
        if (gx === 2) return x.date > y.date ? -1 : x.date < y.date ? 1 : (x.title < y.title ? -1 : 1); return x.title < y.title ? -1 : 1; }
      if (s === 'dateAsc') return dkey(x) < dkey(y) ? -1 : dkey(x) > dkey(y) ? 1 : (x.title < y.title ? -1 : 1);
      if (s === 'dateDesc') return dkey(x, 1) > dkey(y, 1) ? -1 : dkey(x, 1) < dkey(y, 1) ? 1 : (x.title < y.title ? -1 : 1);
      if (s === 'cost') return (y.cost || -1) - (x.cost || -1);
      if (s === 'agency') return x.agency < y.agency ? -1 : x.agency > y.agency ? 1 : (x.title < y.title ? -1 : 1);
      return x.title < y.title ? -1 : 1;
    });
  }

  // ---------- rendering ----------
  function tagsFor(r) {
    var h = '';
    if (r.kind === 'solicitation' || r.kind === 'contract') {
      h += '<span class="tag dir">' + esc(r.status || 'status not given') + '</span>';
      if (r.solType) h += '<span class="tag">' + esc(r.solType) + '</span>';
      if (r.eng && r.eng.length) h += '<span class="tag inf">match: ' + esc(r.eng.map(M.engLabel).join(', ')) + '</span>';
      if (r.kw && r.kw.length) h += '<span class="tag inf">drainage match: ' + esc(r.kw.map(M.kwLabel).join(', ')) + '</span>';
      return h;
    }
    if (r.rel === 'none') return '<span class="tag">no drainage keyword</span>';
    return '<span class="tag ' + (r.rel === 'direct' ? 'dir' : 'inf') + '">' + (r.rel === 'direct' ? 'drainage: direct' : 'drainage: likely (inferred)') + '</span>';
  }
  function card(r) {
    var star = state.watch[r.id] ? ' on' : '';
    var d = r.date ? M.fmtDate(r.date) : 'date unknown';
    var du = r.date ? M.daysUntil(r.date, state.today) : null;
    var when = r.date ? (du === 0 ? 'today' : du > 0 ? 'in ' + du + ' d' : Math.abs(du) + ' d ago') : '';
    return '<div class="card" style="--c:' + colorOf(r) + '" data-id="' + esc(r.id) + '" role="button" tabindex="0">' +
      '<button type="button" class="star' + star + '" data-star="' + esc(r.id) + '" aria-label="' + (star ? 'Remove from' : 'Add to') + ' watchlist">' + (star ? '&#9733;' : '&#9734;') + '</button>' +
      '<div class="b"><div class="t">' + esc(r.title) + '</div>' +
      '<div class="m"><span>' + esc(r.agency) + '</span><span>' + esc(M.phaseLabel(r.phase)) + '</span><span>' + esc(d) + (when ? ' (' + when + ')' : '') + '</span><span>' + esc(r.cost ? M.fmtMoney(r.cost) : 'cost unknown') + '</span>' + (r.county ? '<span>' + esc(r.county) + '</span>' : '') + '</div>' +
      '<div class="m" style="margin-top:4px">' + (r.ghost ? '<span class="tag inf">no longer in snapshot</span>' : tagsFor(r)) + (hasLoc(r) ? '' : '<span class="tag">no map location</span>') + (typeof r.lat !== 'number' && typeof r.alat === 'number' ? '<span class="tag inf">approx. location (county, inferred)</span>' : '') + '</div></div></div>';
  }
  function renderKpis() {
    var f = state.filtered, n = f.length;
    var direct = f.filter(function (r) { return r.rel === 'direct'; }).length;
    var design = f.filter(function (r) { return r.phase === 'design'; }).length;
    var proc = f.filter(function (r) { return r.kind === 'procurement'; }).length;
    var mapped = f.filter(hasLoc).length;
    var soon = f.filter(function (r) { var d = r.date ? M.daysUntil(r.date, state.today) : null; return d !== null && d >= 0 && d <= 90; }).length;
    var wc = Object.keys(state.watch).length;
    var open_ = f.filter(function (r) { return r.kind === 'solicitation'; }).length;
    var due30 = f.filter(function (r) { var d = r.kind === 'solicitation' && r.date ? M.daysUntil(r.date, state.today) : null; return d !== null && d >= 0 && d <= 30; }).length;
    var engm = f.filter(function (r) { return (r.eng && r.eng.length) || (r.kw && r.kw.length); }).length;
    var agn = Object.keys(M.countBy(f, function (r) { return r.agency; })).length;
    var k = state.f.consult ? [[n, 'showing'], [open_, 'open solicitations'], [due30, 'closing in 30 days'], [engm, 'engineering / drainage word match'], [proc, 'TxDOT / HCFCD consultant signals'], [agn, 'agencies'], [wc, 'on watchlist']] : [[n, 'showing'], [direct, 'direct drainage'], [design, 'in design / PS&E'], [proc, 'consultant signals'], [soon, 'dated next 90 days'], [mapped, 'on the map'], [wc, 'on watchlist']];
    $('kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><b>' + x[0].toLocaleString('en-US') + '</b><span>' + x[1] + '</span></div>'; }).join('');
  }
  function chip(label, on, attrs, sw, small) {
    return '<button type="button" class="chip' + (on ? ' on' : '') + '" ' + attrs + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + (sw ? '<span class="sw" style="background:' + sw + '"></span>' : '') + esc(label) + (small !== undefined ? ' <small>' + small + '</small>' : '') + '</button>';
  }
  function countsOf(fn, ignoreKey) {
    // counts over records that pass every filter except the one being counted
    var f = Object.assign({}, state.f); if (ignoreKey) f[ignoreKey] = Array.isArray(f[ignoreKey]) ? [] : null;
    return M.countBy(M.filterRecords(state.recs, f, state.watch), fn);
  }
  function renderFilters() {
    var wc = Object.keys(state.watch).length;
    $('quick').innerHTML = chip('Consultant services', state.f.consult, 'data-q="consult"') + (state.f.consult ? chip('Engineering / drainage word match only', state.f.eng, 'data-q="eng"') : '') + chip('Houston area', state.f.houston, 'data-q="houston"') + chip('★ Watchlist (' + wc + ')', state.f.watchOnly, 'data-q="watch"') + chip('Mapped only', state.f.located, 'data-q="located"') + (state.f.month ? chip('Month: ' + M.fmtMonth(state.f.month) + ' ✕', true, 'data-q="month"') : '');
    var ca = countsOf(function (r) { return r.agency; }, 'agencies');
    $('fAgency').innerHTML = Object.keys(Object.assign({}, M.AGENCIES, ca)).map(function (a) { return chip(a, state.f.agencies.indexOf(a) >= 0, 'data-agency="' + esc(a) + '"', M.agencyColor(a), ca[a] || 0); }).join('');
    var cp = countsOf(function (r) { return r.phase; }, 'phases');
    $('fPhase').innerHTML = M.PHASES.map(function (p) { return chip(p.label, state.f.phases.indexOf(p.id) >= 0, 'data-phase="' + p.id + '"', p.color, cp[p.id] || 0); }).join('');
    var ck = countsOf(function (r) { return r.kind; }, 'kinds');
    $('fKind').innerHTML = Object.keys(KIND_LABEL).map(function (k) { return chip(KIND_LABEL[k], state.f.kinds.indexOf(k) >= 0, 'data-kind="' + k + '"', null, ck[k] || 0); }).join('');
    var kwc = {}; M.filterRecords(state.recs, Object.assign({}, state.f, { kw: [] }), state.watch).forEach(function (r) { (r.kw || []).forEach(function (k) { kwc[k] = (kwc[k] || 0) + 1; }); });
    $('fKw').innerHTML = M.KEYWORDS.map(function (k) { return chip(k.label, state.f.kw.indexOf(k.id) >= 0, 'data-kw="' + k.id + '"', null, kwc[k.id] || 0); }).join('');
    var n = state.f.agencies.length + state.f.phases.length + state.f.kinds.length + state.f.kw.length;
    n += (state.f.rel !== 'relevant' ? 1 : 0) + (state.f.consult ? 0 : 1);
    $('advCount').textContent = n ? '(' + n + ')' : '';
    var notes = [];
    if (state.f.month) notes.push('month ' + M.fmtMonth(state.f.month));
    if (state.f.q) notes.push('search "' + state.f.q + '"');
    $('activeNote').hidden = !notes.length; $('activeNote').textContent = notes.length ? 'Active: ' + notes.join(', ') : '';
    Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (b) { b.classList.toggle('on', b.getAttribute('data-rel') === state.f.rel); });
  }
  function renderLegend() {
    var items;
    if (state.colorBy === 'phase') items = M.PHASES.map(function (p) { return [p.label, p.color]; });
    else { var seen = {}; state.recs.forEach(function (r) { seen[r.agency] = 1; }); items = Object.keys(seen).map(function (a) { return [a, M.agencyColor(a)]; }); }
    $('legend').innerHTML = items.map(function (i) { return '<span><i style="background:' + i[1] + '"></i>' + esc(i[0]) + '</span>'; }).join('') + '<span>size = known cost</span><span>dashed ring = approx. (county)</span><span style="color:#fbbf24">gold ring = watchlist</span>';
  }
  function mapPoints() {
    var pts = [];
    state.filtered.forEach(function (r) {
      var exact = typeof r.lat === 'number'; if (!exact && typeof r.alat !== 'number') return;
      var rr = r.cost ? Math.max(3, Math.min(9, 3 + Math.log10(r.cost / 1e5) * 1.6)) : 3;
      pts.push({ id: r.id, lat: exact ? r.lat : r.alat, lon: exact ? r.lon : r.alon, color: colorOf(r), r: rr, approx: !exact, watch: !!state.watch[r.id] });
    });
    return pts;
  }
  function renderMap() {
    var pts = mapPoints(); if (map) map.setPoints(pts);
    var unmapped = state.filtered.filter(function (r) { return !hasLoc(r); }).length;
    $('unmapped').textContent = pts.length.toLocaleString('en-US') + ' of ' + state.filtered.length.toLocaleString('en-US') + ' shown records are on the map. ' + unmapped.toLocaleString('en-US') + ' have no location in their source (consultant procurements, funding lists, some projects); find them in the List and Timeline tabs. ' + pts.filter(function (p) { return p.approx; }).length + ' are placed at their county centroid (inferred, dashed ring).';
    var top = state.filtered.filter(function (r) { var d = r.date ? M.daysUntil(r.date, state.today) : null; return d !== null && d >= -30; });
    var chosen = top.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).slice(0, 8);
    $('nearHint').textContent = 'soonest dated items';
    $('mapTop').innerHTML = chosen.length ? chosen.map(card).join('') : '<p class="note">No dated records match the filters.</p>';
  }
  function barRow(label, n, max, segs, on, attrs) {
    var w = max ? Math.max(2, Math.round(100 * n / max)) : 0;
    var inner = segs ? segs.map(function (s) { return '<i style="width:' + (max ? (100 * s[0] / max) : 0) + '%;background:' + s[1] + '"></i>'; }).join('') : '<i style="width:' + w + '%;background:var(--acc)"></i>';
    return '<button type="button" class="brow' + (on ? ' on' : '') + '" ' + attrs + '><span class="l">' + esc(label) + '</span><span class="tr">' + inner + '</span><span class="n">' + n.toLocaleString('en-US') + '</span></button>';
  }
  function renderAgencies() {
    var f = state.filtered;
    var byA = M.sortedCounts(M.countBy(f, function (r) { return r.agency; })), mx = byA.length ? byA[0][1] : 0;
    $('bAgency').innerHTML = byA.map(function (x) { var d = f.filter(function (r) { return r.agency === x[0] && r.rel === 'direct'; }).length; return barRow(x[0], x[1], mx, [[d, M.agencyColor(x[0])], [x[1] - d, 'rgba(148,163,184,.5)']], state.f.agencies.indexOf(x[0]) >= 0, 'data-agency="' + esc(x[0]) + '"'); }).join('') + '<p class="note" style="margin:0">Solid color = direct drainage match; gray = likely (inferred).</p>';
    var byP = M.countBy(f, function (r) { return r.phase; }), mp = Math.max.apply(null, [0].concat(Object.keys(byP).map(function (k) { return byP[k]; })));
    $('bPhase').innerHTML = M.PHASES.filter(function (p) { return byP[p.id]; }).map(function (p) { return barRow(p.label, byP[p.id], mp, [[byP[p.id], p.color]], state.f.phases.indexOf(p.id) >= 0, 'data-phase="' + p.id + '"'); }).join('') || '<p class="note">Nothing to show.</p>';
    var byK = M.countBy(f, function (r) { return r.kind; }), mk = Math.max.apply(null, [0].concat(Object.keys(byK).map(function (k) { return byK[k]; })));
    $('bKind').innerHTML = Object.keys(KIND_LABEL).filter(function (k) { return byK[k]; }).map(function (k) { return barRow(KIND_LABEL[k], byK[k], mk, null, state.f.kinds.indexOf(k) >= 0, 'data-kind="' + k + '"'); }).join('');
    var kc = {}; f.forEach(function (r) { (r.kw || []).forEach(function (k) { kc[k] = (kc[k] || 0) + 1; }); });
    var kl = M.sortedCounts(kc), mkw = kl.length ? kl[0][1] : 0;
    $('bKw').innerHTML = kl.map(function (x) { return barRow(M.kwLabel(x[0]), x[1], mkw, null, state.f.kw.indexOf(x[0]) >= 0, 'data-kw="' + x[0] + '"'); }).join('') || '<p class="note">No keyword matches in the current selection.</p>';
    var cl = M.sortedCounts(M.countBy(f, function (r) { return r.county || null; }), 12), mc = cl.length ? cl[0][1] : 0;
    $('bCounty').innerHTML = cl.map(function (x) { return barRow(x[0], x[1], mc, null, false, 'data-search="' + esc(x[0]) + '"'); }).join('') || '<p class="note">None.</p>';
    var sl = M.sortedCounts(M.countBy(f, function (r) { return r.sponsor || null; }), 12), ms = sl.length ? sl[0][1] : 0;
    $('bSponsor').innerHTML = sl.map(function (x) { return barRow(x[0], x[1], ms, null, false, 'data-search="' + esc(x[0]) + '"'); }).join('') || '<p class="note">None.</p>';
  }
  function renderTimeline() {
    var f = state.filtered, months = {}, undated = 0, later = 0, earlier = 0;
    var startK = '2025-01', endK = '2030-12';
    f.forEach(function (r) {
      if (!r.date) { undated++; return; } var k = r.date.slice(0, 7);
      if (k < startK) { earlier++; return; } if (k > endK) { later++; return; }
      var m = months[k] || (months[k] = {}); m[r.agency] = (m[r.agency] || 0) + 1;
    });
    var keys = []; for (var y = 2025; y <= 2030; y++) for (var mo = 1; mo <= 12; mo++) keys.push(y + '-' + ('0' + mo).slice(-2));
    var totals = keys.map(function (k) { var m = months[k] || {}, t = 0; Object.keys(m).forEach(function (a) { t += m[a]; }); return t; });
    var mx = Math.max.apply(null, [1].concat(totals)), bw = 26, H = 190, padL = 6, padB = 34, W = keys.length * bw + padL + 10, ph = H - padB - 12;
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Records per month">';
    svg += '<line x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" stroke="#1f3d36"/>';
    keys.forEach(function (k, i) {
      var x = padL + i * bw, m = months[k] || {}, y0 = H - padB, h = 0, bh = 0;
      var agencies = Object.keys(m).sort();
      agencies.forEach(function (a) { bh = ph * m[a] / mx; y0 -= bh; svg += '<rect x="' + (x + 2) + '" y="' + y0 + '" width="' + (bw - 4) + '" height="' + bh + '" fill="' + M.agencyColor(a) + '"' + (state.f.month === k ? ' stroke="#fff"' : '') + '/>'; });
      svg += '<rect class="bar" data-month="' + k + '" x="' + x + '" y="0" width="' + bw + '" height="' + (H - padB) + '" fill="transparent"><title>' + M.fmtMonth(k) + ': ' + totals[i] + '</title></rect>';
      if (totals[i]) svg += '<text x="' + (x + bw / 2) + '" y="' + (y0 - 3) + '" font-size="10" fill="#93aaa4" text-anchor="middle">' + totals[i] + '</text>';
      if (k.slice(5) === '01') svg += '<text x="' + (x + 2) + '" y="' + (H - 6) + '" font-size="12" fill="#e6f1ee" font-weight="700">' + k.slice(0, 4) + '</text>';
      else if (['04', '07', '10'].indexOf(k.slice(5)) >= 0) svg += '<text x="' + (x + 2) + '" y="' + (H - 6) + '" font-size="10" fill="#93aaa4">' + M.MONTHS_SHORT[+k.slice(5) - 1] + '</text>';
    });
    var ti = keys.indexOf(state.today.slice(0, 7));
    if (ti >= 0) { var tx = padL + ti * bw + bw * (+state.today.slice(8, 10) / 31); svg += '<line x1="' + tx + '" x2="' + tx + '" y1="4" y2="' + (H - padB) + '" stroke="#fbbf24" stroke-dasharray="4 3"/><text x="' + (tx + 3) + '" y="12" font-size="11" fill="#fbbf24">today</text>'; }
    svg += '</svg>';
    $('tl').innerHTML = svg;
    $('tlNote').textContent = 'Not drawn: ' + undated.toLocaleString('en-US') + ' records with no date in their source, ' + earlier + ' dated before 2025, ' + later + ' dated after 2030. Colors are agencies (' + Object.keys(M.AGENCIES).join(', ') + '). Date meaning differs by source (TxDOT = estimated letting; consultant signals = closing/meeting/wave); open a record to see which.';
    var list, title;
    if (state.f.month) { list = f.filter(function (r) { return r.date && r.date.slice(0, 7) === state.f.month; }); title = M.fmtMonth(state.f.month) + ' (' + list.length + ')'; }
    else { list = f.filter(function (r) { var d = r.date ? M.daysUntil(r.date, state.today) : null; return d !== null && d >= 0 && d <= 120; }); title = 'Next 120 days (' + list.length + ')'; }
    $('tlSel').textContent = title; scrollTimeline();
    $('tlList').innerHTML = list.slice(0, 60).map(card).join('') + (list.length > 60 ? '<p class="note">Showing 60 of ' + list.length + '. Use the List tab for all.</p>' : '') || '';
    if (!list.length) $('tlList').innerHTML = '<p class="note">Nothing dated in this window for the current filters.</p>';
  }
  function scrollTimeline() {
    var sc = $('tlScroll'); if (!sc || $('v-timeline').hidden) return;
    var keys = []; for (var y = 2025; y <= 2030; y++) for (var mo = 1; mo <= 12; mo++) keys.push(y + '-' + ('0' + mo).slice(-2));
    var i = Math.max(0, keys.indexOf(state.today.slice(0, 7))); if (!sc._done) { sc.scrollLeft = Math.max(0, i * 26 - 70); sc._done = true; }
  }
  function renderList() {
    var f = state.filtered;
    $('listCount').textContent = f.length.toLocaleString('en-US') + ' records';
    $('list').innerHTML = f.slice(0, state.rows).map(card).join('') || '<p class="note">No records match. Loosen the filters.</p>';
    $('btnMoreRows').hidden = f.length <= state.rows;
  }
  function srcOf(id) { for (var i = 0; i < state.sources.length; i++) if (state.sources[i].id === id) return state.sources[i]; return null; }
  function fmtDT(iso) { if (!iso) return 'unknown'; try { return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } }
  function renderSources() {
    var d = state.data; if (!d) return;
    var ageH = (Date.now() - Date.parse(d.generatedAt)) / 3600000;
    var live = state.live ? '<p><b>TxDOT live refresh:</b> ' + esc(fmtDT(state.live.at)) + ' (' + state.live.rows.toLocaleString('en-US') + ' rows fetched straight from data.texas.gov in this browser).</p>' : '<p>No live refresh yet in this session. Tap "Refresh TxDOT live" at the top to pull TxDOT Project Information straight from data.texas.gov.</p>';
    $('srcFresh').innerHTML = '<p><b>Snapshot built:</b> ' + esc(fmtDT(d.generatedAt)) + ' (' + (ageH < 48 ? Math.round(ageH) + ' hours ago' : Math.round(ageH / 24) + ' days ago') + ').</p>' + live +
      '<p><b>Records in snapshot:</b> ' + state.recs.length.toLocaleString('en-US') + ' from ' + state.sources.filter(function (s) { return s.status === 'ok' || s.status === 'stale'; }).length + ' of ' + state.sources.length + ' feeds.</p>' +
      '<p>The snapshot is rebuilt by <code>node scripts/build-opportunities.js</code>. The workflow in <code>opportunity-radar/workflow/refresh-opportunities.yml</code> does this daily once it is installed under <code>.github/workflows/</code>. Until then the snapshot only updates when someone runs the script and commits the result.</p>';
    $('srcList').innerHTML = state.sources.map(function (s) {
      var n = state.recs.filter(function (r) { return r.src === s.id; }).length;
      return '<div class="src" style="--c:' + M.agencyColor(s.agency) + '"><h3>' + esc(s.name) + '</h3><p><span class="st ' + esc(s.status) + '">' + esc((s.status || '').toUpperCase()) + '</span> · ' + esc(s.agency) + ' · ' + esc(s.type) + '</p>' +
        '<p>Fetched ' + esc(fmtDT(s.fetchedAt)) + ' · rows read ' + (s.fetched || 0).toLocaleString('en-US') + ' · records on the radar ' + n.toLocaleString('en-US') + (s.joined !== undefined ? ' · joined to ' + s.joined + ' projects' : '') + '</p>' +
        (s.note ? '<p>' + esc(s.note) + '</p>' : '') + (s.page ? '<p><a href="' + esc(s.page) + '" target="_blank" rel="noopener noreferrer">Open the source ↗</a></p>' : '') + '</div>';
    }).join('');
    $('srcNo').innerHTML = NOT_USED.map(function (x) { return '<div class="src"><h3>' + esc(x[0]) + '</h3><p>' + esc(x[2]) + '</p>' + (x[1] ? '<p><a href="' + esc(x[1]) + '" target="_blank" rel="noopener noreferrer">Open ↗</a></p>' : '') + '</div>'; }).join('');
    $('srcHow').innerHTML = '<ul><li><b>Real data only.</b> Every record comes from one of the feeds above. If a source does not give a field (date, cost, location), the tool shows "unknown".</li>' +
      '<li><b>Inferred</b> (labeled in orange): (1) "drainage: likely" means the project is roadway or bridge work whose type usually carries drainage design; (2) keyword matches on drainage words in the source text; (3) county-centroid map placement when a source names a county but no coordinates; (4) work-type codes used to flag PS&amp;E, H&amp;H or bridge-design consultant procurements.</li>' +
      '<li><b>TxDOT dates are estimated letting dates</b> (construction bids), not PS&amp;E deadlines. A project in the PS&amp;E stage is already being designed; the data does not say who the design consultant is or whether a procurement is still open.</li>' +
      '<li><b>Consultant procurement signals</b> (TxDOT PEPS list, meetings, projected contracts; HCFCD bid page) are the closest thing to an open PS&amp;E pursuit. They carry little detail: check the linked page.</li>' +
      '<li><b>Consultant services view</b> (default). A record is included by a stated rule, not a judgment of fit: (a) a qualifications-type solicitation (RFQ, RFQS, RFSQ, SOQ), or (b) a proposal-type solicitation (RFP) with an engineering word in the title, or one whose title states no type but has engineering / architect / civil / survey / geotechnical / design words, or (c) the source itself labels it professional services / consultant procurement (Austin Contracts category, TxDOT consultant lists, HCFCD RFQ table). The orange "match" tags list the engineering and drainage words found in the title. Status, type and due date are copied as the source gives them. <b>Open solicitations</b> are open now; <b>Awarded contract</b> rows (Austin) show who holds an agreement and when it ends, which may signal a recompete (inferred). No agency here publishes a machine-readable list of solicitations that have not yet been advertised, except TxDOT\'s Projected Contracts List.</li>' +
      '<li><b>Funding commitments</b> (TWDB FIF) show sponsors with flood money; no stage, date or location is given.</li>' +
      '<li>Costs are what the agency lists (usually construction cost, not design fee). The label on each record says which.</li></ul>';
  }
  function renderAll() {
    renderKpis(); renderFilters(); renderLegend(); renderMap(); renderAgencies(); renderTimeline(); renderList(); renderSources();
    var fresh = state.data ? state.data.generatedAt : null;
    if (fresh) {
      var ageH = (Date.now() - Date.parse(fresh)) / 3600000;
      $('freshDot').className = 'dot ' + (state.live ? 'ok' : ageH < 48 ? 'ok' : ageH < 24 * 7 ? 'warn' : 'bad');
      var bad = state.sources.filter(function (s) { return s.status !== 'ok'; }).length;
      $('freshTxt').innerHTML = 'Snapshot ' + esc(fmtDT(fresh)) + ' (' + (ageH < 48 ? Math.round(ageH) + ' h old' : Math.round(ageH / 24) + ' days old') + ')' + (state.live ? ' · TxDOT live ' + esc(fmtDT(state.live.at)) : '') + ' · ' + state.recs.length.toLocaleString('en-US') + ' records from ' + (state.sources.length - bad) + '/' + state.sources.length + ' feeds' + (bad ? ' · <b>' + bad + ' feed(s) stale or failed (see Sources)</b>' : '') + (ageH > 24 * 7 ? ' · <b>snapshot is old: the daily refresh may not be running</b>' : '');
    }
  }

  // ---------- detail sheet ----------
  var curId = null;
  function openSheet(id, siblings) {
    var r = state.byId[id] || ghosts().filter(function (g) { return g.id === id; })[0]; if (!r) return;
    curId = id; if (map) { map.focus = typeof r.lat === 'number' ? r : (typeof r.alat === 'number' ? { lat: r.alat, lon: r.alon } : null); map.dirty = true; map._schedule(); }
    var s = srcOf(r.src), exact = typeof r.lat === 'number';
    var h = '';
    if (siblings && siblings.length > 1) h += '<p class="note" style="margin:0">' + siblings.length + ' records are under your tap. Others:</p><div class="pick">' + siblings.filter(function (x) { return x !== id; }).slice(0, 6).map(function (x) { var q = state.byId[x]; return q ? '<button type="button" class="chip" data-open="' + esc(x) + '">' + esc(q.title.slice(0, 70)) + '</button>' : ''; }).join('') + '</div>';
    h += '<h2>' + esc(r.title) + '</h2><div><span class="tag" style="border-color:' + M.agencyColor(r.agency) + '">' + esc(r.agency) + '</span><span class="tag">' + esc(KIND_LABEL[r.kind] || r.kind) + '</span><span class="tag">' + esc(M.phaseLabel(r.phase)) + '</span>' + (r.ghost ? '' : tagsFor(r)) + '</div>';
    var kv = [];
    kv.push(['Stage (as the source states it)', r.stage || 'unknown']);
    if (r.status) kv.push(['Status (as the source gives it)', r.status]);
    if (r.solType) kv.push(['Solicitation type', r.solType]);
    kv.push([r.dateLabel || 'Date', r.date ? M.fmtDate(r.date) : 'unknown']);
    kv.push([r.costLabel || 'Cost', r.cost ? M.fmtMoney(r.cost) + ' (' + '$' + Math.round(r.cost).toLocaleString('en-US') + ')' : 'unknown']);
    kv.push(['County / district', [r.county, r.district].filter(Boolean).join(' / ') || 'unknown']);
    kv.push(['Map location', exact ? 'From source: ' + r.lat + ', ' + r.lon : typeof r.alat === 'number' ? 'Approximate (INFERRED): center of ' + r.county + ' County. The source gave no coordinates.' : 'None given by the source']);
    if (r.work) kv.push(['Type of work', r.work]);
    if (r.desc) kv.push(['Description (source)', r.desc]);
    if (r.rel) kv.push([(r.kind === 'solicitation' || r.kind === 'contract') ? 'Why it is in this view (rule + keyword matches, not a fit judgment)' : 'Why it is on the radar' + (r.rel === 'likely' ? ' (INFERRED)' : ''), r.why || '']);
    (r.extra || []).forEach(function (e) { kv.push(e); });
    h += '<dl class="kv">' + kv.map(function (e) { return '<dt>' + esc(e[0]) + '</dt><dd>' + esc(e[1]) + '</dd>'; }).join('') + '</dl>';
    h += '<p>' + (r.url ? '<a class="linkbtn" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">Open source record ↗</a>' : '') + (s && s.page ? '<a class="linkbtn alt" href="' + esc(s.page) + '" target="_blank" rel="noopener noreferrer">Source page ↗</a>' : '') + (exact ? '<a class="linkbtn alt" href="https://www.google.com/maps/search/?api=1&query=' + r.lat + ',' + r.lon + '" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>' : '') + '</p>';
    h += '<p class="note" style="margin:6px 0 0">Source: ' + esc(s ? s.name : r.src) + (s && s.fetchedAt ? ', fetched ' + esc(fmtDT(s.fetchedAt)) : '') + '. Record ID: ' + esc(r.id) + '</p>';
    $('shBody').innerHTML = h; setStar($('shStar'), !!state.watch[id]);
    $('sheet').hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeSheet() { $('sheet').hidden = true; document.body.style.overflow = ''; curId = null; if (map) { map.focus = null; map.dirty = true; map._schedule(); } }
  function setStar(btn, on) { btn.classList.toggle('on', on); btn.innerHTML = on ? '&#9733;' : '&#9734;'; btn.setAttribute('aria-label', on ? 'Remove from watchlist' : 'Add to watchlist'); }
  function toggleWatch(id) {
    var r = state.byId[id] || ghosts().filter(function (g) { return g.id === id; })[0];
    if (state.watch[id]) { delete state.watch[id]; toast('Removed from watchlist'); }
    else if (r) { state.watch[id] = { t: r.title, a: r.agency, u: r.url || null, at: new Date().toISOString() }; toast('Added to watchlist (saved on this device)'); }
    saveWatch(); apply(); if (curId === id) setStar($('shStar'), !!state.watch[id]);
  }

  // ---------- CSV ----------
  function exportCsv() {
    var list = state.f.watchOnly ? state.filtered : state.filtered; if (!list.length) { toast('Nothing to export for the current filters.'); return; }
    var csv = M.toCSV(list, state.sources), blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'opportunity-radar-' + state.today + (state.f.watchOnly ? '-watchlist' : '') + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Exported ' + list.length.toLocaleString('en-US') + ' records');
  }

  // ---------- live TxDOT refresh (data.texas.gov SODA; CORS open) ----------
  function liveRefresh() {
    var btn = $('btnLive'); btn.disabled = true; btn.textContent = 'Refreshing…';
    var stages = M.TXDOT_KEEP_STAGES.map(function (s) { return "'" + s.replace(/'/g, "''") + "'"; }).join(',');
    var url = 'https://data.texas.gov/resource/drau-zphx.json?' + ['$select=' + encodeURIComponent(M.TXDOT_SELECT.join(',')), '$where=' + encodeURIComponent('project_stage in (' + stages + ')'), '$limit=50000', '$order=project_id'].join('&');
    fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (rows) {
      var fresh = rows.map(M.normTxdotPI).filter(Boolean), old = {};
      state.recs.forEach(function (r) { if (r.src === 'txdot-pi') old[r.id] = r; });
      fresh.forEach(function (r) { var o = old[r.id]; if (o && o.tracker) { // keep Project Tracker milestone rows from the snapshot
        o.extra.forEach(function (e) { if (/\((actual)\)|Tracker|contact/.test(e[0])) r.extra.push(e); }); r.tracker = true; } });
      var added = fresh.filter(function (r) { return !old[r.id]; }).length, gone = Object.keys(old).filter(function (id) { return !fresh.some(function (r) { return r.id === id; }); }).length;
      var cen = M.countyCentroids(window.TX_GEO); M.applyApprox(fresh, cen);
      state.recs = state.recs.filter(function (r) { return r.src !== 'txdot-pi'; }).concat(fresh); reindex();
      state.live = { at: new Date().toISOString(), rows: rows.length, kept: fresh.length };
      var s = srcOf('txdot-pi'); if (s) { s.fetched = rows.length; s.kept = fresh.length; s.fetchedAt = state.live.at; s.status = 'ok'; s.note = 'Refreshed live in this browser from data.texas.gov. ' + (s.note || ''); }
      apply(); toast('TxDOT live: ' + fresh.length.toLocaleString('en-US') + ' projects (' + added + ' new, ' + gone + ' no longer listed vs snapshot)');
    }).catch(function (e) { toast('Live refresh failed (' + e.message + '). Showing the snapshot.'); }).then(function () { btn.disabled = false; btn.textContent = 'Refresh TxDOT live'; });
  }

  // ---------- events ----------
  var map = null;
  function switchTab(t) {
    state.tab = t;
    ['radar', 'timeline', 'agencies', 'list', 'sources'].forEach(function (k) { $('v-' + k).hidden = k !== t; });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    if (map) { map.setVisible(t === 'radar'); }
    if (t === 'timeline') scrollTimeline();
    window.scrollTo(0, 0);
  }
  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function onClick(e) {
    var t = e.target, el;
    if ((el = t.closest('[data-star]'))) { e.stopPropagation(); toggleWatch(el.getAttribute('data-star')); return; }
    if ((el = t.closest('[data-open]'))) { openSheet(el.getAttribute('data-open')); return; }
    if ((el = t.closest('.card[data-id]'))) { openSheet(el.getAttribute('data-id')); return; }
    if ((el = t.closest('[data-month]'))) { var k = el.getAttribute('data-month'); state.f.month = state.f.month === k ? null : k; apply(); return; }
    if ((el = t.closest('[data-q]'))) { var q = el.getAttribute('data-q'); if (q === 'houston') { state.f.houston = !state.f.houston; if (map) map.fit(state.f.houston ? 'hou' : 'tx'); } else if (q === 'watch') state.f.watchOnly = !state.f.watchOnly; else if (q === 'located') state.f.located = !state.f.located; else if (q === 'consult') { state.f.consult = !state.f.consult; if (!state.f.consult) state.f.eng = false; } else if (q === 'eng') state.f.eng = !state.f.eng; else if (q === 'month') state.f.month = null; apply(); return; }
    if ((el = t.closest('[data-agency]'))) { toggleIn(state.f.agencies, el.getAttribute('data-agency')); apply(); return; }
    if ((el = t.closest('[data-phase]'))) { toggleIn(state.f.phases, el.getAttribute('data-phase')); apply(); return; }
    if ((el = t.closest('[data-kind]'))) { toggleIn(state.f.kinds, el.getAttribute('data-kind')); apply(); return; }
    if ((el = t.closest('[data-kw]'))) { toggleIn(state.f.kw, el.getAttribute('data-kw')); apply(); return; }
    if ((el = t.closest('[data-search]'))) { state.f.q = el.getAttribute('data-search'); $('q').value = state.f.q; apply(); switchTab('list'); return; }
    if ((el = t.closest('.seg button'))) { state.f.rel = el.getAttribute('data-rel'); apply(); return; }
    if ((el = t.closest('.tabs button'))) { switchTab(el.getAttribute('data-tab')); return; }
    if ((el = t.closest('[data-view]'))) { if (map) map.fit(el.getAttribute('data-view')); return; }
  }
  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.card[data-id]')) { e.preventDefault(); openSheet(e.target.getAttribute('data-id')); } if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
    $('q').addEventListener('input', function () { clearTimeout(init._t); init._t = setTimeout(function () { state.f.q = $('q').value.trim(); apply(); }, 200); });
    $('btnMore').addEventListener('click', function () { var o = $('adv').hidden; $('adv').hidden = !o; this.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    $('btnCsv2').addEventListener('click', exportCsv);
    $('btnClear').addEventListener('click', function () { state.f = { q: '', rel: 'relevant', consult: true, eng: false, agencies: [], phases: [], kinds: [], kw: [], houston: false, located: false, watchOnly: false, month: null }; $('q').value = ''; apply(); });
    $('btnColor').addEventListener('click', function () { state.colorBy = state.colorBy === 'agency' ? 'phase' : 'agency'; this.textContent = 'Color: ' + (state.colorBy === 'agency' ? 'agency' : 'stage'); renderLegend(); apply(); });
    $('btnSweep').addEventListener('click', function () { var on = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', on ? 'true' : 'false'); this.textContent = 'Sweep: ' + (on ? 'on' : 'off'); if (map) map.setSweep(on); });
    $('btnCsv').addEventListener('click', exportCsv); $('btnLive').addEventListener('click', liveRefresh);
    $('sort').addEventListener('change', function () { state.sort = this.value; apply(); });
    $('btnMoreRows').addEventListener('click', function () { state.rows += 100; renderList(); });
    $('shClose').addEventListener('click', closeSheet); $('shBg').addEventListener('click', closeSheet);
    $('shStar').addEventListener('click', function () { if (curId) toggleWatch(curId); });
    var canvas = $('map');
    map = new window.RadarMap(canvas, window.TX_GEO, { sweep: true, onPick: function (ids, n) { if (ids.length) openSheet(ids[0], ids); }, onMove: function () { $('maphint').style.opacity = 0; } });
    var cen = M.countyCentroids(window.TX_GEO), named = {}; (window.TX_GEO.counties || []).forEach(function (c) { named[c.n] = cen[c.n.toLowerCase()]; }); window.TX_GEO._cent = named;
    map.fit('tx'); renderLegend();
    if (map.reduced) { $('btnSweep').setAttribute('aria-pressed', 'false'); $('btnSweep').textContent = 'Sweep: off'; }
    document.addEventListener('visibilitychange', function () { map.setVisible(!document.hidden && state.tab === 'radar'); });
    loadData().then(function (d) { ingest(d); apply(); if (state.f.consult) switchTab('list'); setTimeout(function () { map.resize(); map.fit('tx'); map.dirty = true; map._schedule(); }, 50); })
      .catch(function (e) { $('freshDot').className = 'dot bad'; $('freshTxt').textContent = 'Could not load data/opportunities.json (' + e.message + '). Nothing is shown; no sample data is substituted.'; });
  }
  M.MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  window.RadarApp = state;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
