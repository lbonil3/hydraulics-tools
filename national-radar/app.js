/* National Radar UI. Vanilla JS, no build. Reads data/national.json (a snapshot built by scripts/build-national.js).
   Every record already carries the rule that included it, the source field of each dollar figure, and a source link. */
(function () {
  'use strict';
  var M = window.NationalModel, RW = window.NationalRoadway, CO = window.NationalCost, G = window.US_GEO, TX = window.NATIONAL_TEXT || { notUsed: [], rules: [] }, TXR = window.NATIONAL_ROAD_TEXT || { rules: [] };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SRC_SHORT = { 'sam': 'SAM.gov', 'usaspending': 'USAspending', 'txdot-pcl': 'TxDOT projected contracts', 'nyc': 'NYC City Record', 'chicago': 'Chicago contracts', 'dhs-apfs': 'DHS forecast (APFS)', 'ag-forecast': 'Acquisition Gateway forecasts', 'caltrans-lar': 'Caltrans A&E look-ahead', 'caltrans-awards': 'Caltrans A&E awards', 'usaspending-rw': 'USAspending prime awards (roadway lane)', 'usaspending-sub': 'USAspending subawards', 'wsdot-proj': 'WSDOT projected design list' };
  var SCOPES_W = [
    { id: 'opp', label: 'Upcoming & open', sub: 'confirmed, fee > $20M' },
    { id: 'review', label: 'Needs review', sub: 'uncertain, not confirmed' },
    { id: 'nofee', label: 'Fee not stated', sub: 'open/upcoming, no fee' },
    { id: 'recompete', label: 'Recompete watch', sub: 'inferred from end dates' },
    { id: 'awards', label: 'Awards / competitors', sub: 'awarded or closed' },
    { id: 'watch', label: 'Watchlist', sub: 'starred on this device' }
  ];
  var SCOPES_R = [
    { id: 'drain', label: 'Drainage fee > $5M', sub: 'drainage-specific fee stated by the source, upcoming/open' },
    { id: 'total', label: 'Roadway fee stated (drainage share not stated)', sub: 'total fee > $20M, scope names drainage, share unknown' },
    { id: 'review', label: 'Needs review', sub: 'uncertain, not confirmed' },
    { id: 'awards', label: 'Awards / competitors', sub: 'awarded or closed' },
    { id: 'watch', label: 'Watchlist', sub: 'starred on this device' }
  ];
  var SCOPES = SCOPES_W;
  var COLOR = { opp: '#34d399', review: '#fbbf24', nofee: '#94a3b8', award: '#7cb7ff', closed: '#64748b', recompete: '#fb7185' };
  var STATUS_LABEL = { open: 'Open', upcoming: 'Upcoming', awarded: 'Awarded' };
  var EXCL_LABEL = { 'not-engineering': 'Not an engineering-services notice (NAICS / PSC)', 'construction-naics': 'Construction NAICS (23xxxx)', 'construction-title': 'Title reads as a construction contract', 'no-sector': 'No drainage / water / wastewater / flood / coastal wording', 'no-stated-fee': 'No fee stated by the source', 'project-cost-only': 'Only a project or construction cost stated (never counts as a fee)', 'fee-not-above-20m': 'Stated fee is $20,000,000 or less', 'deadline-passed': 'Response date already passed', 'outside-us': 'Place of performance outside the US', 'non-civil-context': 'Title looks non-civil (vessel, ESPC, cyber and similar)', 'stale-no-deadline': 'No deadline and posted over 12 months ago', 'award-older-than-24-months': 'Award older than 24 months', 'closed-older-than-12-months': 'Closed more than 12 months ago', 'notice-type-not-used': 'Notice type not used (justification, amendment only, etc.)', 'not-active-status': 'Not an active status', 'status-unknown': 'Status unknown', 'no-roadway-context': 'No roadway / highway / bridge / corridor wording', 'non-roadway-title': 'Title names a dam, canal, trail, airport, rail, vessel or similar, not a road', 'drain-fee-not-above-5m': 'Drainage-specific fee is $5,000,000 or less', 'total-fee-not-above-20m': 'Total fee is $20,000,000 or less', 'scope-does-not-name-drainage': 'Total fee above $20M but the scope does not name drainage / hydraulics / stormwater / culvert / flood' };

  var DATA = null, RECS = [], ASOF = '', LIVE = {}, DATA_W = null, DATA_R = null, PRICES = null;
  var secLabel = function (k) { return k === 'roadway' ? 'Roadway' : k === 'drainage' ? 'Drainage named in the title' : M.sectorLabel(k); };
  var WATCH = {}; try { WATCH = JSON.parse(localStorage.getItem('nr.watch') || '{}') || {}; } catch (e) { WATCH = {}; }
  var S = { mode: 'water', scope: 'opp', tab: 'map', sort: 'fee', rows: 50, tlMonth: null, f: { q: '', states: [], agencies: [], statuses: [], sectors: [], sources: [], feeMin: null, costMin: null } };
  var SYNTH = { sectors: M.SECTORS.map(function (s) { return s.id; }) };

  function toast(t) { var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3500); }
  function saveWatch() { try { localStorage.setItem('nr.watch', JSON.stringify(WATCH)); } catch (e) { toast('Could not save the watchlist on this device.'); } }
  function todayCentral() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }

  // ---------- filtering ----------
  function filterFor(scope, f, skip) {
    var o = Object.assign({}, f); (skip || []).forEach(function (k) { o[k] = Array.isArray(o[k]) ? [] : null; });
    o.tab = scope === 'watch' ? null : scope; o.watchOnly = scope === 'watch';
    if (scope === 'nofee') o.feeMin = null; else o.costMin = null;
    return o;
  }
  function scoped(scope, skip) { return (S.mode === 'road' ? RW.filterRoadway : M.filterRecords)(RECS, filterFor(scope || S.scope, S.f, skip), WATCH); }
  function fee(r) { return r.amt ? r.amt.v : 0; }
  function sum(list) { return list.reduce(function (a, r) { return a + fee(r); }, 0); }

  // ---------- small renderers ----------
  function moneyLabel(a) { return (M.AMOUNT_KINDS[a.kind] ? M.AMOUNT_KINDS[a.kind].label : a.kind) + ' · source field: ' + a.field; }
  function dateText(r) {
    var d = r.dates || {}, out = [];
    if (r.status !== 'awarded' && d.due) out.push('Response due ' + M.fmtDate(d.due));
    if (d.est) out.push((d.estLabel || 'Forecast date') + ' ' + M.fmtDate(d.est));
    if (d.award) out.push('Award ' + M.fmtDate(d.award));
    if (d.end) out.push('End ' + M.fmtDate(d.end) + (d.endInferred ? ' (inferred)' : ''));
    if (!out.length && d.posted) out.push('Posted ' + M.fmtDate(d.posted));
    return out.join(' · ');
  }
  function tagsFor(r) {
    var t = [];
    t.push('<span class="tag ' + (r.bucket === 'review' ? 'rev' : 'dir') + '">' + esc(r.bucket === 'closed' ? 'Closed (deadline passed)' : r.bucket === 'review' ? 'Needs review' : r.bucket === 'nofee' ? 'Fee not stated' : STATUS_LABEL[r.status] || r.status) + '</span>');
    if (S.mode === 'road' && r.rw === 'drain') t.push('<span class="tag dir">Drainage-specific fee</span>');
    if (S.mode === 'road' && r.rw === 'total') t.push('<span class="tag rev">Total fee, drainage share unknown</span>');
    if (r.recompete) t.push('<span class="tag inf">Recompete (inferred)</span>');
    (r.sectors || []).forEach(function (s) { t.push('<span class="tag inf" title="Inferred from keywords">' + esc(secLabel(s)) + '</span>'); });
    if (r.also && r.also.length) t.push('<span class="tag">+' + r.also.length + ' same record</span>');
    return t.join('');
  }
  function colorOf(r) { return r.recompete && S.scope === 'recompete' ? COLOR.recompete : COLOR[r.bucket] || '#64748b'; }
  function cardHtml(r) {
    var money;
    if (r.amt) money = '<span class="lbl">' + esc(moneyLabel(r.amt)) + '</span><span class="big">' + esc(M.fmtMoneyFull(r.amt.v)) + '</span>';
    else money = '<span class="lbl">No fee stated by the source</span>' + (r.projectCost ? '<span class="big" style="font-size:16px">project cost (not fee): ' + esc(M.fmtMoney(r.projectCost.v)) + '</span><span class="lbl">' + esc(r.projectCost.field) + '</span>' : '');
    if (S.mode === 'road' && r.amt) money = '<span class="lbl"><b class="basis ' + (r.feeBasis === 'total' ? 'tot' : 'dr') + '">' + esc(r.feeBasisLabel || '') + '</b> ' + esc(moneyLabel(r.amt)) + '</span><span class="big">' + esc(M.fmtMoneyFull(r.amt.v)) + '</span>';
    var where = [r.agency, r.subagency && r.subagency !== r.agency ? r.subagency : null, r.city ? r.city + ', ' + (r.state || '') : r.state ? (M.STATE_NAMES[r.state] || r.state) : 'state not stated'].filter(Boolean).join(' · ');
    return '<div class="card" style="--c:' + colorOf(r) + '"><button type="button" class="star' + (WATCH[r.id] ? ' on' : '') + '" data-star="' + esc(r.id) + '" aria-label="' + (WATCH[r.id] ? 'Remove from watchlist' : 'Add to watchlist') + '">' + (WATCH[r.id] ? '&#9733;' : '&#9734;') + '</button>' +
      '<button type="button" class="b" data-open="' + esc(r.id) + '">' + money + '<span class="t">' + esc(r.title) + '</span><span class="m"><span>' + esc(where) + '</span></span><span class="m"><span>' + esc(dateText(r)) + '</span><span>' + esc(SRC_SHORT[r.src] || r.src) + '</span></span><span>' + tagsFor(r) + '</span>' + (S.mode === 'road' ? '<span class="costline">' + esc(costBrief(r)) + '</span>' : '') + '</button></div>';
  }
  function costBrief(r) {
    var c = r.cost; if (!c) return '';
    if (c.status === 'stated') return 'Construction cost (stated by the source): ' + M.fmtMoney(c.stated.v);
    if (c.status === 'estimated') return 'Construction cost, ' + CO.LABEL + ': ' + M.fmtMoney(c.est.low) + ' to ' + M.fmtMoney(c.est.high) + ' (base ' + M.fmtMoney(c.est.base) + ')';
    return 'Construction cost: insufficient scope to estimate';
  }
  function cardsInto(el, list, emptyHtml) {
    el.innerHTML = list.length ? list.map(cardHtml).join('') : (emptyHtml || '');
  }
  function emptyScopeHtml() {
    var counts = {}; SCOPES.forEach(function (s) { counts[s.id] = scoped(s.id).length; });
    var filtered = activeCount() > 0;
    if (filtered && RECS.length) return '<div class="empty"><b>Nothing matches these filters in this tab.</b> Clear filters to see the full tab.</div>';
    if (S.mode === 'road') {
      var rb = { drain: '<b>0 confirmed upcoming or open records</b> in this snapshot. A record needs a consultant engineering notice on a roadway / highway / bridge / corridor project AND a <b>drainage-specific fee that the source itself states</b> as strictly more than $5,000,000, while still upcoming or open. No source checked states such a fee for an open or upcoming roadway project. Nothing was estimated to fill the tab. See <b>Needs review (' + counts.review + ')</b>, <b>Awards / competitors (' + counts.awards + ')</b>, and the Data tab for each source and its closest misses.', total: '<b>0 records</b>: no open or upcoming roadway engineering notice states a total fee over $20,000,000 and also names drainage, hydraulics, stormwater, culverts or flood in its scope. The source would not state the drainage share either way.', review: '<b>0 records need review</b> in this snapshot.', awards: '<b>0 awards</b> in this snapshot.', watch: '<b>Your watchlist is empty.</b> Tap the star on any record to keep it here. It is saved on this device only.' };
      return '<div class="empty">' + rb[S.scope] + '</div>';
    }
    var base = { opp: '<b>0 confirmed upcoming or open records</b> in this snapshot. A record needs all of these: a consultant engineering notice, a drainage / water / wastewater sector, and a fee that the source itself states as strictly more than $20,000,000, while still upcoming or open. Most agencies do not publish a consultant fee before award. This is the true count, nothing has been added to fill it. Try <b>Needs review (' + counts.review + ')</b> and <b>Fee not stated (' + counts.nofee + ')</b>, or <b>Awards / competitors (' + counts.awards + ')</b>.', review: '<b>0 records need review</b> in this snapshot.', nofee: '<b>0 records</b>: no open or upcoming engineering notice in a water sector without a stated fee.', recompete: '<b>0 recompete candidates.</b> No awarded record with a stated fee over $20M has an end date within 18 months of the snapshot. Recompete dates are inferred.', awards: '<b>0 awards</b> in this snapshot.', watch: '<b>Your watchlist is empty.</b> Tap the star on any record to keep it here. It is saved on this device only.' };
    return '<div class="empty">' + base[S.scope] + '</div>';
  }
  function activeCount() { var f = S.f; return (f.q ? 1 : 0) + f.states.length + f.agencies.length + f.statuses.length + f.sectors.length + f.sources.length + (f.feeMin !== null ? 1 : 0) + (f.costMin !== null ? 1 : 0); }

  // ---------- header, scopes, kpis ----------
  function renderFresh() {
    if (!DATA) return;
    var gen = new Date(DATA.generatedAt), age = Math.max(0, (Date.now() - gen.getTime()) / 86400000);
    var bad = DATA.sources.filter(function (s) { return s.status === 'failed' || s.status === 'stale'; });
    var cls = bad.length || age > 7 ? (age > 7 ? 'bad' : 'warn') : age > 2 ? 'warn' : 'ok';
    $('freshDot').className = 'dot ' + cls;
    $('freshTxt').textContent = 'Snapshot as of ' + M.fmtDate(DATA.asOfDate) + ' (built ' + gen.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + ', ' + (age < 1 ? 'today' : Math.floor(age) + ' day' + (Math.floor(age) === 1 ? '' : 's') + ' old') + ')' + (bad.length ? '. ' + bad.length + ' source(s) stale or failed.' : '.') + (LIVE.at ? ' Live awards refreshed ' + LIVE.at + '.' : '') + (S.mode === 'road' ? ' Roadway lane: drainage-specific fee strictly > $5M, or total fee strictly > $20M with drainage named; as stated by the source.' : ' Fee filter: strictly > $20M, as stated by the source.');
  }
  function renderScopes() {
    $('scopes').innerHTML = SCOPES.map(function (s) { return '<button type="button" class="scope' + (S.scope === s.id ? ' on' : '') + '" data-scope="' + s.id + '" aria-pressed="' + (S.scope === s.id) + '"><b>' + scoped(s.id).length + '</b><span>' + esc(s.label) + '</span></button>'; }).join('');
  }
  function renderKpis(list) {
    var states = {}, ag = {}; list.forEach(function (r) { if (r.state) states[r.state] = 1; ag[r.agency] = 1; });
    var scope = SCOPES.filter(function (s) { return s.id === S.scope; })[0];
    var total = sum(list), withFee = list.filter(function (r) { return r.amt; }).length;
    var k = [[list.length, 'records · ' + scope.sub], [withFee ? M.fmtMoney(total) : 'n/a', 'sum of stated values (' + withFee + ')'], [Object.keys(states).length, 'states'], [Object.keys(ag).length, 'agencies']];
    $('kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('');
  }

  // ---------- filter chips ----------
  function chipSet(elId, key, items, selected) {
    var el = $(elId);
    el.innerHTML = items.length ? items.map(function (it) { return '<button type="button" class="chip' + (selected.indexOf(it.k) >= 0 ? ' on' : '') + '" data-f="' + key + '" data-k="' + esc(it.k) + '" aria-pressed="' + (selected.indexOf(it.k) >= 0) + '">' + esc(it.label) + ' <small>' + it.n + '</small></button>'; }).join('') : '<span class="hint">none in this tab</span>';
  }
  function itemsFor(skipKey, fn, labelFn) {
    var list = scoped(S.scope, [skipKey]), m = M.countBy(list, fn);
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || (a < b ? -1 : 1); }).map(function (k) { return { k: k, label: labelFn ? labelFn(k) : k, n: m[k] }; });
  }
  function renderFilters() {
    var f = S.f;
    chipSet('fState', 'states', itemsFor('states', function (r) { return r.state || '??'; }, function (k) { return k === '??' ? 'State not stated' : k + ' · ' + (M.STATE_NAMES[k] || k); }), f.states);
    chipSet('fAgency', 'agencies', itemsFor('agencies', function (r) { return r.agency; }), f.agencies);
    chipSet('fStatus', 'statuses', itemsFor('statuses', function (r) { return r.status; }, function (k) { return STATUS_LABEL[k] || k; }), f.statuses);
    chipSet('fSector', 'sectors', itemsFor('sectors', function (r) { return r.sectors || []; }, function (k) { return secLabel(k); }), f.sectors);
    chipSet('fSource', 'sources', itemsFor('sources', function (r) { return r.src; }, function (k) { return SRC_SHORT[k] || k; }), f.sources);
    var fees = S.mode === 'road' ? [[null, 'Any'], [5e6, '> $5M'], [10e6, '> $10M'], [20e6, '> $20M'], [50e6, '> $50M'], [100e6, '> $100M']] : [[null, 'Any'], [20e6, '> $20M'], [50e6, '> $50M'], [100e6, '> $100M'], [250e6, '> $250M'], [500e6, '> $500M']];
    $('fFee').innerHTML = S.scope === 'nofee' ? '<span class="hint">not applicable: these records state no fee</span>' : fees.map(function (x) { return '<button type="button" class="chip' + (f.feeMin === x[0] ? ' on' : '') + '" data-fee="' + x[0] + '" aria-pressed="' + (f.feeMin === x[0]) + '">' + x[1] + '</button>'; }).join('');
    $('costBox').hidden = S.scope !== 'nofee';
    var costs = [[null, 'Off'], [20e6, 'Project cost > $20M'], [50e6, 'Project cost > $50M'], [100e6, 'Project cost > $100M']];
    $('fCost').innerHTML = costs.map(function (x) { return '<button type="button" class="chip' + (f.costMin === x[0] ? ' on' : '') + '" data-cost="' + x[0] + '" aria-pressed="' + (f.costMin === x[0]) + '">' + x[1] + '</button>'; }).join('');
    var n = activeCount() - (f.q ? 1 : 0); $('advCount').textContent = n ? '(' + n + ')' : '';
    var a = $('activeNote'); a.hidden = !activeCount(); a.textContent = activeCount() ? activeCount() + ' filter' + (activeCount() === 1 ? '' : 's') + ' on. Counts above reflect them.' : '';
  }

  // ---------- map ----------
  var mapBuilt = false, project = null;
  function buildMap() {
    if (mapBuilt || !G) return; mapBuilt = true; project = window.NationalProj.make(G.proj);
    var html = '<g id="gSt">'; Object.keys(G.states).forEach(function (k) { html += '<path class="st" data-st="' + k + '" d="' + G.states[k].d + '"><title>' + esc(G.states[k].n) + '</title></path>'; });
    $('usmap').innerHTML = html + '</g><g id="gBub"></g><g id="gPin"></g>';
  }
  function renderMap(list) {
    buildMap(); if (!G) { $('usmap').innerHTML = ''; return; }
    var byState = {}; list.forEach(function (r) { if (!r.state) return; var o = byState[r.state] = byState[r.state] || { n: 0, v: 0 }; o.n++; o.v += fee(r); });
    var max = 0; Object.keys(byState).forEach(function (k) { max = Math.max(max, byState[k].v); });
    document.querySelectorAll('#gSt .st').forEach(function (p) { p.classList.toggle('sel', S.f.states.indexOf(p.getAttribute('data-st')) >= 0); });
    var b = '';
    Object.keys(byState).forEach(function (k) {
      var g = G.states[k]; if (!g) return; var o = byState[k], cnt = !o.v, r = cnt ? 16 + Math.min(8, o.n) : 20 + 28 * Math.sqrt(o.v / max);
      b += '<g data-st="' + k + '"><circle class="bub' + (cnt ? ' cnt' : '') + '" data-st="' + k + '" cx="' + g.cx + '" cy="' + g.cy + '" r="' + r.toFixed(1) + '"><title>' + esc((M.STATE_NAMES[k] || k) + ': ' + o.n + ' record(s)' + (o.v ? ', ' + M.fmtMoney(o.v) + ' stated' : '')) + '</title></circle><text class="bubt" x="' + g.cx + '" y="' + (g.cy + 7) + '">' + esc(cnt ? o.n : M.fmtMoney(o.v)) + '</text></g>';
    });
    $('gBub').innerHTML = b;
    var pins = ''; list.forEach(function (r) { if (r.lat && r.lon) { var xy = project(r.lon, r.lat, r.state); pins += '<circle class="pin" data-open="' + esc(r.id) + '" cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="6"><title>' + esc(r.title) + '</title></circle>'; } });
    $('gPin').innerHTML = pins;
    var nostate = list.filter(function (r) { return !r.state; }).length, pinned = list.filter(function (r) { return r.lat; }).length;
    $('legend').innerHTML = '<span><i style="background:rgba(124,183,255,.5)"></i>Bubble size = sum of stated values in this view</span><span><i style="background:rgba(251,191,36,.5)"></i>Amber = count only (no stated value)</span><span><i style="background:#fb7185"></i>Pin = city named in the source (' + pinned + ')</span>';
    $('mapNote').textContent = (list.length ? 'Tap a state to filter by it. ' : '') + (nostate ? nostate + ' record(s) name no state (for example nationwide contracts) and are not on the map; they are in the List. ' : '') + 'Pins appear only when the source names a city that matches one place; otherwise only the state bubble is shown.';
    var top = M.sortRecords(list, 'fee').slice(0, 5);
    $('topHint').textContent = list.length > 5 ? '(5 of ' + list.length + ', by stated value)' : '';
    cardsInto($('mapTop'), top, emptyScopeHtml());
  }

  // ---------- list ----------
  function renderList(list) {
    var sorted = M.sortRecords(list, S.sort), shown = sorted.slice(0, S.rows);
    $('listCount').textContent = list.length + ' record' + (list.length === 1 ? '' : 's');
    cardsInto($('list'), shown, emptyScopeHtml());
    $('btnMoreRows').hidden = sorted.length <= S.rows;
  }

  // ---------- timeline ----------
  function dateKey(r) { var d = r.dates || {}; return S.scope === 'recompete' ? d.end : (r.status === 'awarded' || r.bucket === 'closed') ? (d.award || d.posted) : (d.due || d.est || d.posted); }
  function mlabel(k) { var m = /^(\d{4})-(\d{2})/.exec(k); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + " '" + m[1].slice(2); }
  function renderTimeline(list) {
    var by = {}, none = 0; list.forEach(function (r) { var k = M.monthKey(dateKey(r)); if (!k) { none++; return; } (by[k] = by[k] || []).push(r); });
    var keys = Object.keys(by).sort(), max = 1; keys.forEach(function (k) { max = Math.max(max, by[k].length); });
    $('tl').innerHTML = keys.length ? keys.map(function (k) { return '<button type="button" class="tlb' + (S.tlMonth === k ? ' on' : '') + '" data-month="' + k + '" aria-label="' + mlabel(k) + ': ' + by[k].length + ' records"><b>' + by[k].length + '</b><i style="height:' + Math.max(6, 120 * by[k].length / max) + 'px"></i>' + mlabel(k) + '</button>'; }).join('') : '<span class="hint">no dated records in this view</span>';
    $('tlNote').textContent = 'Dates used: ' + (S.scope === 'recompete' ? 'contract end date (inferred recompete)' : S.scope === 'awards' ? 'award date' : 'response due date, else the agency forecast date, else posted date') + (none ? '. ' + none + ' record(s) have no date.' : '.');
    var sel = S.tlMonth && by[S.tlMonth] ? by[S.tlMonth] : M.sortRecords(list, 'date').slice(0, 12);
    $('tlSel').textContent = S.tlMonth && by[S.tlMonth] ? mlabel(S.tlMonth) + ' (' + sel.length + ')' : 'Soonest dates';
    cardsInto($('tlList'), sel, emptyScopeHtml());
  }

  // ---------- breakdown ----------
  function bars(elId, key, groups, labelFn, toggle) {
    var ks = Object.keys(groups).sort(function (a, b) { return (groups[b].v - groups[a].v) || (groups[b].n - groups[a].n) || (a < b ? -1 : 1); }).slice(0, 25), max = 1;
    ks.forEach(function (k) { max = Math.max(max, groups[k].v || groups[k].n); });
    $(elId).innerHTML = ks.length ? ks.map(function (k) { var g = groups[k]; return '<button type="button" class="bar" ' + (toggle ? 'data-f="' + key + '" data-k="' + esc(k) + '"' : '') + '><span class="n">' + esc(labelFn(k)) + '</span><span class="tr"><i style="width:' + Math.max(3, 100 * (g.v || g.n) / max) + '%"></i></span><span class="v">' + (g.v ? esc(M.fmtMoney(g.v)) + ' · ' : '') + g.n + '</span></button>'; }).join('') : '<p class="note">Nothing in this view.</p>';
  }
  function group(list, fn) { var m = {}; list.forEach(function (r) { [].concat(fn(r)).forEach(function (k) { if (k === null || k === undefined) return; var o = m[k] = m[k] || { n: 0, v: 0 }; o.n++; o.v += fee(r); }); }); return m; }
  function renderBreak(list) {
    bars('bState', 'states', group(list, function (r) { return r.state || '??'; }), function (k) { return k === '??' ? 'State not stated' : (M.STATE_NAMES[k] || k); }, true);
    bars('bAgency', 'agencies', group(list, function (r) { return r.agency; }), function (k) { return k; }, true);
    bars('bSector', 'sectors', group(list, function (r) { return r.sectors || []; }), function (k) { return secLabel(k); }, true);
    bars('bSource', 'sources', group(list, function (r) { return r.src; }), function (k) { return SRC_SHORT[k] || k; }, true);
  }

  // ---------- data quality ----------
  function td(v) { return '<td>' + (v === undefined || v === null ? '0' : esc(typeof v === 'number' ? v.toLocaleString('en-US') : v)) + '</td>'; }
  function renderDataRoad() {
    var gen = new Date(DATA.generatedAt), C = DATA.counts, cs = C.byCost || {};
    $('dqFresh').innerHTML = '<p><b>Roadway snapshot as of ' + esc(M.fmtDate(DATA.asOfDate)) + '</b> (US Central date), built ' + esc(gen.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })) + '. ' + C.total + ' records kept after removing ' + C.mergedDuplicates + ' duplicates (' + C.beforeDedupe + ' before).</p><p>Tabs: drainage-specific fee &gt; $5M, open/upcoming: <b>' + C.drainOpen + '</b>; total fee &gt; $20M with drainage named: <b>' + C.totalOpen + '</b>; needs review: <b>' + C.review + '</b>; awards: <b>' + C.awards + '</b>.</p><p>Construction cost base on kept records: stated by the source <b>' + (cs.stated || 0) + '</b>, estimated (not from source) <b>' + (cs.estimated || 0) + '</b>, insufficient scope <b>' + (cs.insufficient || 0) + '</b>. Unit prices: TxDOT low-bid averages, lettings ' + esc((DATA.priceMeta || {}).let_date_min || '') + ' to ' + esc((DATA.priceMeta || {}).let_date_max || '') + '.</p>';
    function sm(t, f) { var n = 0; Object.keys(t.rw || {}).forEach(function (k) { if (f(k)) n += t.rw[k]; }); return n; }
    var rows = DATA.sources.filter(function (s) { return s.stats; }).map(function (s) {
      var t = s.stats, b = t.byBucket || {};
      return '<tr><td>' + esc(SRC_SHORT[s.id] || s.id) + '</td>' + td(s.fetched) + td(t.evaluated) + td((t.eng || {}).strong) + td((t.road || {}).strong) + td(t.drainSpecific) + td(sm(t, function (k) { return k.indexOf('drain:') === 0; })) + td(sm(t, function (k) { return k.indexOf('total:') === 0; })) + td(b.opp) + td(b.review) + td(b.award) + td(b.excluded) + td(t.exact5) + '</tr>';
    }).join('');
    $('dqFunnel').innerHTML = '<table class="t"><thead><tr><th>Source</th><th>Rows read</th><th>Evaluated</th><th>Engineering</th><th>Roadway context</th><th>Drainage-specific</th><th>Drain fee &gt; $5M (any stage)</th><th>Total &gt; $20M + drainage named (any stage)</th><th>Open/upcoming kept</th><th>Review</th><th>Award</th><th>Excluded</th><th>At exactly $5M</th></tr></thead><tbody>' + rows + '</tbody></table><p class="note">Columns count rows passing each rule on its own (not cumulative). "Any stage" counts rows that passed the fee test before status and other rules; they may still be excluded or awards. "Drainage-specific" = the title or a structured field names drainage/hydraulics/stormwater/culvert. "At exactly $5M" rows are excluded: the drainage fee must be strictly greater.</p>';
    var ex = {}, e5 = [], tot = 0; DATA.sources.forEach(function (s) { if (!s.stats) return; Object.keys(s.stats.excl || {}).forEach(function (k) { ex[k] = (ex[k] || 0) + s.stats.excl[k]; }); (s.stats.exact5Rows || []).forEach(function (x) { e5.push(x); }); tot += (s.stats.byBucket || {}).excluded || 0; });
    $('dqExcl').innerHTML = '<p>' + tot.toLocaleString('en-US') + ' evaluated rows were excluded. Rows failing each rule (a row can fail several):</p><ul>' + Object.keys(ex).sort(function (a, b) { return ex[b] - ex[a]; }).map(function (k) { return '<li><b>' + ex[k].toLocaleString('en-US') + '</b> ' + esc(EXCL_LABEL[k] || k) + '</li>'; }).join('') + '</ul><p>Rows whose drainage-specific fee is <b>exactly $5,000,000</b> (excluded by the strict rule): <b>' + e5.length + '</b>' + (e5.length ? '. ' + e5.map(function (x) { return esc(x.title) + (x.url ? ' (<a href="' + esc(x.url) + '" target="_blank" rel="noopener">source</a>)' : ''); }).join('; ') : '') + '.</p>';
    var miss = []; DATA.sources.forEach(function (s) { if (s.stats) (s.stats.near || []).forEach(function (x) { miss.push(Object.assign({ src: s.id }, x)); }); });
    miss.sort(function (a, b) { return (b.v || 0) - (a.v || 0); }); miss = miss.slice(0, 12);
    $('dqMiss').innerHTML = miss.length ? miss.map(function (x) { return '<div class="card static" style="--c:#64748b"><span class="lbl">Drainage-specific, excluded: ' + esc(x.why.split(', ').map(function (k) { return EXCL_LABEL[k] || k; }).join('; ')) + '</span><span class="big" style="font-size:17px">' + esc(x.v ? M.fmtMoneyFull(x.v) : 'no amount stated') + '</span><div class="t">' + esc(x.title) + '</div><div class="m"><span>' + esc(SRC_SHORT[x.src] || x.src) + '</span></div>' + (x.url ? '<div><a href="' + esc(x.url) + '" target="_blank" rel="noopener">Source link</a></div>' : '') + '</div>'; }).join('') : '<p class="note">None.</p>';
    $('dqSrc').innerHTML = DATA.sources.map(function (s) { return '<div class="card static" style="--c:' + (s.status === 'ok' ? '#34d399' : s.status === 'skipped' || s.status === 'disabled' ? '#94a3b8' : '#fb7185') + '"><div class="t">' + esc(s.name) + (s.roadwayOnly ? ' (roadway lane only)' : '') + '</div><div class="m"><span>Status: <b>' + esc(s.status) + '</b></span><span>Rows read: ' + (s.fetched === undefined ? 'n/a' : s.fetched.toLocaleString('en-US')) + '</span><span>Kept: ' + (s.kept === undefined ? 'n/a' : s.kept) + '</span></div><div class="m"><span>' + esc(s.type || '') + '</span></div>' + (s.note ? '<p class="note" style="margin:6px 0">' + esc(s.note) + '</p>' : '') + (s.page ? '<a href="' + esc(s.page) + '" target="_blank" rel="noopener">Source page</a>' : '') + '</div>'; }).join('');
    $('dqNo').innerHTML = (DATA.tested || []).map(function (x) { return '<div class="card static" style="--c:#64748b"><div class="t">' + esc(x.name) + '</div><div class="m"><span>Reachable and readable: <b>' + (x.works ? 'yes' : 'no') + '</b></span><span>In the build: <b>no</b></span></div>' + (x.fields ? '<p class="note" style="margin:4px 0">Fields: ' + esc(x.fields) + '</p>' : '') + '<p class="note" style="margin:4px 0">' + esc(x.finding) + '</p>' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">Page</a>' : '') + '</div>'; }).join('');
    $('dqRules').innerHTML = '<ul>' + TXR.rules.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
  }
  function renderData() {
    if (!DATA) return;
    if (S.mode === 'road') { renderDataRoad(); return; }
    var gen = new Date(DATA.generatedAt);
    $('dqFresh').innerHTML = '<p><b>Snapshot as of ' + esc(M.fmtDate(DATA.asOfDate)) + '</b> (US Central date), built ' + esc(gen.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })) + '. Deadlines are compared against that date. ' + DATA.counts.total + ' records kept after removing ' + DATA.counts.mergedDuplicates + ' duplicates (' + DATA.counts.beforeDedupe + ' before).</p><p>Kept records: ' + Object.keys(DATA.counts.byBucket).map(function (k) { return esc(({ opp: 'confirmed upcoming/open', review: 'needs review', nofee: 'fee not stated', award: 'awards', closed: 'closed solicitations' })[k] || k) + ' ' + DATA.counts.byBucket[k]; }).join(', ') + '. <b>Recompete watch</b>: ' + DATA.counts.recompete + ' (inferred).</p>';
    var rows = DATA.sources.filter(function (s) { return s.stats; }).map(function (s) {
      var t = s.stats, b = t.byBucket || {}, sc = t.sector || {}, per = SRC_SHORT[s.id] || s.id;
      return '<tr><td>' + esc(per) + '</td>' + td(t.fetched) + td(t.evaluated) + td((t.eng || {}).strong) + td((sc.title || 0) + (sc.strong || 0)) + td((t.fee || {}).above) + td(b.opp) + td(b.review) + td(b.nofee) + td(b.award) + td(b.closed) + td(b.excluded) + td(t.exact20) + '</tr>';
    }).join('');
    $('dqFunnel').innerHTML = '<table class="t"><thead><tr><th>Source</th><th>Rows read</th><th>Evaluated</th><th>Engineering</th><th>Sector</th><th>Fee &gt; $20M</th><th>Open/upcoming</th><th>Review</th><th>Fee n/s</th><th>Award</th><th>Closed</th><th>Excluded</th><th>At exactly $20M</th></tr></thead><tbody>' + rows + '</tbody></table><p class="note">Engineering, Sector and Fee columns count rows that pass each rule on its own (not cumulative). "Evaluated" is after a cheap pre-filter (for SAM.gov: engineering or construction NAICS/PSC only). "At exactly $20M" rows are excluded: the fee must be strictly greater.</p>';
    var prim = {}, ex = 0; DATA.sources.forEach(function (s) { if (!s.stats) return; Object.keys(s.stats.primary || {}).forEach(function (k) { prim[k] = (prim[k] || 0) + s.stats.primary[k]; }); ex += s.stats.exact20 || 0; });
    var tot = Object.keys(prim).reduce(function (a, k) { return a + prim[k]; }, 0);
    $('dqExcl').innerHTML = '<p>' + tot.toLocaleString('en-US') + ' evaluated rows were excluded. First failing rule per row (a row can fail several):</p><ul>' + Object.keys(prim).sort(function (a, b) { return prim[b] - prim[a]; }).map(function (k) { return '<li><b>' + prim[k].toLocaleString('en-US') + '</b> ' + esc(EXCL_LABEL[k] || k) + '</li>'; }).join('') + '</ul><p>Rows whose stated fee is <b>exactly $20,000,000</b> (excluded by the strict rule): <b>' + ex + '</b>.</p>';
    var miss = []; DATA.sources.forEach(function (s) { if (s.stats) Object.keys(s.stats.samples || {}).forEach(function (reason) { (s.stats.samples[reason] || []).forEach(function (x) { miss.push(Object.assign({ reason: reason, src: s.id }, x)); }); }); });
    miss.sort(function (a, b) { return (b.v || 0) - (a.v || 0); }); miss = miss.filter(function (x) { return x.v; }).slice(0, 12);
    $('dqMiss').innerHTML = miss.length ? miss.map(function (x) { return '<div class="card static" style="--c:#64748b"><span class="lbl">Excluded: ' + esc(EXCL_LABEL[x.reason] || x.reason) + '</span><span class="big" style="font-size:17px">' + esc(M.fmtMoneyFull(x.v)) + '</span><div class="t">' + esc(x.title) + '</div><div class="m"><span>' + esc(x.agency || '') + '</span><span>' + esc(SRC_SHORT[x.src] || x.src) + '</span></div>' + (x.url ? '<div><a href="' + esc(x.url) + '" target="_blank" rel="noopener">Source link</a></div>' : '') + '</div>'; }).join('') : '<p class="note">None.</p>';
    $('dqSrc').innerHTML = DATA.sources.map(function (s) { return '<div class="card static" style="--c:' + (s.status === 'ok' ? '#34d399' : s.status === 'disabled' ? '#94a3b8' : '#fb7185') + '"><div class="t">' + esc(s.name) + '</div><div class="m"><span>Status: <b>' + esc(s.status) + '</b></span><span>Rows read: ' + (s.fetched === undefined ? 'n/a' : s.fetched.toLocaleString('en-US')) + '</span><span>Kept: ' + (s.kept === undefined ? 'n/a' : s.kept) + '</span></div><div class="m"><span>' + esc(s.type || '') + '</span></div><p class="note" style="margin:6px 0">' + esc(s.note || '') + (s.error ? ' Error: ' + esc(s.error) : '') + '</p>' + (s.page ? '<a href="' + esc(s.page) + '" target="_blank" rel="noopener">Source page</a>' : '') + '</div>'; }).join('');
    $('dqNo').innerHTML = TX.notUsed.map(function (x) { return '<div class="card static" style="--c:#64748b"><div class="t">' + esc(x[0]) + '</div><p class="note" style="margin:4px 0">' + esc(x[2]) + '</p>' + (x[1] ? '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener">Page</a>' : '') + '</div>'; }).join('');
    $('dqRules').innerHTML = '<ul>' + TX.rules.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
  }
  function renderHow() {
    if (S.mode === 'road') { $('how').innerHTML = '<p>' + TXR.rules.join('</p><p>') + '</p>'; return; }
    $('how').innerHTML = '<p>' + TX.rules.join('</p><p>') + '</p><p><b>Not counted:</b> construction contracts, supply contracts, project or construction costs standing in for a fee, fees estimated by percentage, and anything outside the United States.</p>';
  }

  // ---------- detail sheet ----------
  function openSheet(id) {
    var r = RECS.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var h = '<h2>' + esc(r.title) + '</h2><div>' + tagsFor(r) + '</div>';
    if (r.url) h += '<a class="srclink" href="' + esc(r.url) + '" target="_blank" rel="noopener">Open the source record</a>';
    h += '<h3>Dollar figures</h3>';
    if (S.mode === 'road' && r.amt) h += '<div class="money"><span class="lbl"><b class="basis ' + (r.feeBasis === 'total' ? 'tot' : 'dr') + '">' + esc(r.feeBasisLabel || '') + '</b> · decides the fee rule</span><b>' + esc(M.fmtMoneyFull(r.amt.v)) + '</b><div>' + esc(moneyLabel(r.amt)) + '</div>' + (r.feeBasis === 'total' ? '<div class="hint">The source states only this total. How much of it is drainage is not stated, and no share is estimated here.</div>' : '') + (r.amt.ctx ? '<div class="hint">"…' + esc(r.amt.ctx) + '…"</div>' : '') + '</div>';
    else if (r.amt) h += '<div class="money"><span class="lbl">Stated fee / value (decides the fee rule)</span><b>' + esc(M.fmtMoneyFull(r.amt.v)) + '</b><div>' + esc(moneyLabel(r.amt)) + '</div>' + (r.amt.ctx ? '<div class="hint">"…' + esc(r.amt.ctx) + '…"</div>' : '') + '</div>';
    else h += '<div class="money"><b style="font-size:16px">No fee stated by the source</b></div>';
    (r.amts || []).filter(function (a) { return a.kind !== 'project_cost' && !(r.amt && a.v === r.amt.v && a.kind === r.amt.kind); }).forEach(function (a) { h += '<div class="money"><span class="lbl">Other figure</span><b style="font-size:17px">' + esc(M.fmtMoneyFull(a.v)) + '</b><div>' + esc(moneyLabel(a)) + '</div>' + (a.ctx ? '<div class="hint">"…' + esc(a.ctx) + '…"</div>' : '') + '</div>'; });
    if (r.projectCost) h += '<div class="money cost"><span class="lbl">Project cost (NOT a fee, never used for the fee rule)</span><b style="font-size:17px">' + esc(M.fmtMoneyFull(r.projectCost.v)) + '</b><div>' + esc(r.projectCost.field) + '</div>' + (r.projectCost.ctx ? '<div class="hint">"…' + esc(r.projectCost.ctx) + '…"</div>' : '') + '</div>';
    if (S.mode === 'road') h += costSectionHtml(r);
    h += '<h3>Why it is in this list (the exact rules)</h3><ul>' + (r.rules || []).map(function (x) { return '<li>' + esc(x.t) + '</li>'; }).join('') + '</ul>';
    if (r.review && r.review.length) h += '<h3>Why it needs review</h3><ul>' + r.review.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (r.bucket === 'nofee') h += '<h3>Why it is under "Fee not stated"</h3><p class="note" style="margin:0">Engineering notice with a water-sector title that is open or upcoming, but the source states no fee. It is not counted as over $20M.</p>';
    h += '<h3>Details</h3><dl>' + [['Status', (STATUS_LABEL[r.status] || r.status) + ' · ' + (r.noticeLabel || r.noticeType || '')], ['Agency', [r.agency, r.subagency, r.office].filter(Boolean).join(' / ')], ['Place', [r.city, r.state].filter(Boolean).join(', ') || 'not stated'], ['Dates', dateText(r)], ['Awardee', r.awardee], ['Award #', r.awardNum], ['Solicitation #', r.solNum], ['NAICS / PSC', [r.naics, r.psc].filter(Boolean).join(' / ')], ['Sector (inferred)', (r.sectors || []).map(secLabel).join(', ')], ['Source', SRC_SHORT[r.src] || r.src], ['Snapshot as of', ASOF]].filter(function (x) { return x[1]; }).map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>';
    var fk = Object.keys(r.fields || {}).filter(function (k) { return r.fields[k] !== '' && r.fields[k] !== null && r.fields[k] !== undefined; });
    if (fk.length) h += '<h3>All source fields</h3><dl>' + fk.map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(r.fields[k]) + '</dd>'; }).join('') + '</dl>';
    if (r.desc) h += '<h3>Description (from the source, shortened)</h3><p style="font-size:13px;overflow-wrap:anywhere">' + esc(r.desc) + '</p>';
    if (r.also && r.also.length) h += '<h3>Same record also found as</h3><ul>' + r.also.map(function (x) { return '<li>' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc((SRC_SHORT[x.src] || x.src) + ' ' + (x.type || '') + ' ' + x.id) + '</a>' : esc(x.src + ' ' + x.id)) + '</li>'; }).join('') + '</ul>';
    $('shBody').innerHTML = h; $('sheet').hidden = false; $('sheet').setAttribute('data-id', id); $('shStar').className = 'star big' + (WATCH[id] ? ' on' : ''); $('shStar').innerHTML = WATCH[id] ? '&#9733;' : '&#9734;';
    document.body.style.overflow = 'hidden'; $('shClose').focus();
    if (S.mode === 'road') initWhatIf(r);
  }
  function closeSheet() { $('sheet').hidden = true; document.body.style.overflow = ''; }


  // ---------- roadway: construction cost base + what-if ----------
  var TYPE_OPTS = [['', 'Choose a type'], ['newloc', 'New location'], ['widen', 'Widening (added lanes)'], ['recon', 'Reconstruction'], ['rehab', 'Rehabilitation / overlay']];
  function costSectionHtml(r) {
    var c = r.cost || {}, h = '<h3>Construction cost base <span class="hint">(not a fee; never used by any fee filter)</span></h3>';
    if (c.stated) return h + '<div class="money cost"><span class="lbl">STATED by the source (project / construction cost)</span><b>' + esc(M.fmtMoneyFull(c.stated.v)) + '</b><div>Source field: ' + esc(c.stated.field) + (c.stated.asOf ? ' · date: ' + esc(M.fmtDate(c.stated.asOf)) : '') + '</div>' + (c.stated.ctx ? '<div class="hint">"…' + esc(c.stated.ctx) + '…"</div>' : '') + '</div>';
    var e = c.est;
    h += '<div class="money est"><span class="lbl">' + esc(CO.LABEL) + '</span>' + (e && e.base ? '<b>' + esc(M.fmtMoney(e.low)) + ' to ' + esc(M.fmtMoney(e.high)) + '</b><div>Low / base / high; base ' + esc(M.fmtMoneyFull(Math.round(e.base))) + '. Computed here from the scope the source gives, with Texas bid-tab unit prices. Change anything below.</div>' : '<b style="font-size:16px">Insufficient scope</b><div>' + esc(e ? e.reason : 'The source gives no usable length or project type.') + ' Enter the scope below to try a what-if.</div>') + '</div>';
    var ev = (c.scope && c.scope.evidence) || [];
    h += '<p class="note" style="margin:6px 0">Scope read from the source text: ' + (ev.length ? esc(ev.join('; ')) : 'nothing usable (no length, lane count or project type found)') + '.</p><div id="whatif"></div>';
    return h;
  }
  function wiDefaults(r) {
    var sc = (r.cost && r.cost.scope) || {}, e = r.cost && r.cost.est && r.cost.est.inputs, d = {};
    if (e) return Object.assign({}, e);
    d.type = sc.type && sc.type !== 'unsupported' ? sc.type : ''; d.lengthMi = sc.lengthMi || ''; d.lanes = d.type === 'widen' ? (sc.lanesAdded || '') : (sc.lanesTotal || sc.lanesAdded || ''); if (sc.section) d.section = sc.section; return d;
  }
  function inp(id, label, val, extra) { return '<label class="wi"><span>' + esc(label) + '</span><input type="number" inputmode="decimal" step="any" min="0" data-wi="' + id + '" value="' + esc(val === undefined || val === null ? '' : val) + '"' + (extra || '') + '></label>'; }
  function initWhatIf(r) {
    var host = $('whatif'); if (!host) return;
    if (!PRICES) { host.innerHTML = '<p class="note">Unit prices (data/cost-prices.json) did not load, so no estimate can be computed.</p>'; return; }
    var d = Object.assign({}, CO.DEFAULTS, wiDefaults(r)); host.setAttribute('data-rec', r.id);
    var typeSel = '<label class="wi"><span>Project type</span><select data-wi="type">' + TYPE_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + (d.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
    var secSel = '<label class="wi"><span>Drainage section</span><select data-wi="section"><option value="rural"' + (d.section === 'rural' ? ' selected' : '') + '>Rural: ditches and cross culverts</option><option value="urban"' + (d.section === 'urban' ? ' selected' : '') + '>Urban: curb, inlets, storm sewer</option></select></label>';
    var basisSel = '<label class="wi"><span>Unit price basis</span><select data-wi="basis"><option value="statewide"' + (d.basis === 'statewide' ? ' selected' : '') + '>Texas statewide average</option><option value="houston"' + (d.basis === 'houston' ? ' selected' : '') + '>Houston average (where available)</option></select></label>';
    var A = CO.ASSUMED_NOTE;
    host.innerHTML = '<h4>What-if (' + esc(CO.LABEL) + ')</h4><div class="wigrid">' + typeSel + inp('lengthMi', 'Length (miles)', d.lengthMi) + inp('lanes', d.type === 'widen' ? 'Lanes ADDED' : 'Total lanes', d.lanes) + secSel + basisSel + '</div>' +
      '<details class="wiasm"><summary>Assumptions (all editable, all labeled Assumed)</summary><div class="wigrid">' + inp('trafficControlPct', 'Traffic control %', d.trafficControlPct) + inp('mobilizationPct', 'Mobilization %', d.mobilizationPct) + inp('contingencyLowPct', 'Contingency % (low)', d.contingencyLowPct) + inp('contingencyBasePct', 'Contingency % (base)', d.contingencyBasePct) + inp('contingencyHighPct', 'Contingency % (high)', d.contingencyHighPct) + inp('priceLowPct', 'Unit price band, low −%', d.priceLowPct) + inp('priceHighPct', 'Unit price band, high +%', d.priceHighPct) + inp('escalationPct', 'Escalation % (your input, default 0)', d.escalationPct) + inp('laneWidthFt', 'Lane width (ft)', d.laneWidthFt) + inp('shoulderFt', 'Shoulder width (ft, each side)', d.shoulderFt) + inp('crossDrainsPerMile', 'Cross culverts per mile (rural)', d.crossDrainsPerMile) + inp('fillHeightFt', 'Average fill height (ft)', d.fillHeightFt) + '</div><ul class="note"><li>Traffic control: ' + esc(A.trafficControlPct) + '</li><li>Mobilization: ' + esc(A.mobilizationPct) + '</li><li>Contingency: ' + esc(A.contingencyBasePct) + '</li><li>Price band: ' + esc(A.priceLowPct) + '</li><li>Escalation: ' + esc(A.escalationPct) + '</li></ul></details><div id="wiOut"></div>';
    runWhatIf(false);
  }
  function wiRead() {
    var o = {}, ov = {}; document.querySelectorAll('#whatif [data-wi]').forEach(function (el) { var k = el.getAttribute('data-wi'); o[k] = el.value; });
    document.querySelectorAll('#whatif [data-ovr]').forEach(function (el) { if (el.value !== '') ov[el.getAttribute('data-ovr')] = el.value; });
    return { inp: o, ovr: ov };
  }
  function runWhatIf(onlyNumbers) {
    var out = $('wiOut'); if (!out || !PRICES) return;
    var v = wiRead(), e = CO.estimate(v.inp, PRICES.rows, v.ovr);
    var lanesLbl = document.querySelector('#whatif [data-wi="lanes"]'); if (lanesLbl) lanesLbl.previousElementSibling.textContent = v.inp.type === 'widen' ? 'Lanes ADDED' : 'Total lanes';
    if (e.status !== 'estimated') { out.innerHTML = '<div class="money est"><b style="font-size:16px">Insufficient scope</b><div>' + esc(e.reason) + '</div></div>'; return; }
    var fm = function (x) { return x === null || x === undefined ? 'n/a' : '$' + Math.round(x).toLocaleString('en-US'); };
    if (onlyNumbers) { e.lines.forEach(function (l) { var c = document.getElementById('wa-' + l.code); if (c) c.textContent = fm(l.amount); }); }
    else {
      var rows = e.lines.map(function (l) { return '<div class="wiln"><div><b>' + esc(l.code) + '</b> ' + esc(l.desc) + (l.note ? '<br><small>' + esc(l.note) + '</small>' : '') + '</div><div class="wiq"><span>' + Math.round(l.qty).toLocaleString('en-US') + ' ' + esc(l.unit) + '</span> × $<input type="number" inputmode="decimal" step="any" min="0" data-ovr="' + esc(l.code) + '" value="' + esc(v.ovr[l.code] || '') + '" placeholder="' + (l.price === null ? 'n/a' : l.price.toFixed(2)) + '" aria-label="Unit price override for ' + esc(l.code) + '"> = <b id="wa-' + esc(l.code) + '">' + fm(l.amount) + '</b></div><small class="wis">' + esc(l.priceSrc) + (l.n ? ', n=' + l.n : '') + '</small></div>'; }).join('');
      out.innerHTML = '<div>' + rows + '</div><div id="wiTot"></div><p class="note">' + esc(e.priceNote) + ' Unit prices are editable per line (leave blank to use the bid-tab average). Quantities come from the typical section assumed above, not from design plans.</p>';
    }
    var sc = e.scenarios, A = e.assumptions, g = sc.base.groups;
    $('wiTot').innerHTML = '<table class="t wit"><tbody><tr><td>Earthwork (base)</td><td class="r">' + fm(g.earth) + '</td></tr><tr><td>Pavement (base)</td><td class="r">' + fm(g.pavement) + '</td></tr><tr><td>Drainage items (base)</td><td class="r">' + fm(g.drainage) + '</td></tr><tr><td>Other items (base)</td><td class="r">' + fm(g.other) + '</td></tr><tr><td>Direct subtotal (base)</td><td class="r">' + fm(sc.base.direct) + '</td></tr><tr><td>Traffic control ' + A.trafficControlPct + '% (Assumed)</td><td class="r">' + fm(sc.base.trafficControl) + '</td></tr><tr><td>Mobilization ' + A.mobilizationPct + '% (Assumed)</td><td class="r">' + fm(sc.base.mobilization) + '</td></tr><tr><td>Contingency ' + A.contingencyBasePct + '% (Assumed)</td><td class="r">' + fm(sc.base.contingency) + '</td></tr><tr><td>Escalation ' + A.escalationPct + '% (input)</td><td class="r">' + fm(sc.base.escalation) + '</td></tr></tbody></table><div class="money est"><span class="lbl">' + esc(CO.LABEL) + '</span><b>Low ' + fm(e.low) + ' · Base ' + fm(e.base) + ' · High ' + fm(e.high) + '</b><div>Low = unit prices −' + A.priceLowPct + '% and contingency ' + A.contingencyLowPct + '%; High = +' + A.priceHighPct + '% and ' + A.contingencyHighPct + '%. Planning level, Texas prices, price year of the bid tabs, escalation as entered.</div></div>';
  }

  // ---------- master render ----------
  function renderModes() {
    document.querySelectorAll('#modes [data-mode]').forEach(function (b) { var on = b.getAttribute('data-mode') === S.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $('btnLive').hidden = S.mode === 'road'; $('liveNote').hidden = S.mode === 'road';
  }
  function setMode(m) {
    if (m === 'road' && !DATA_R) { toast('The roadway data file did not load.'); return; }
    S.mode = m; SCOPES = m === 'road' ? SCOPES_R : SCOPES_W; DATA = m === 'road' ? DATA_R : DATA_W; RECS = DATA.records || []; ASOF = DATA.asOfDate;
    S.scope = m === 'road' ? 'drain' : 'opp'; S.rows = 50; S.tlMonth = null; S.f = { q: '', states: [], agencies: [], statuses: [], sectors: [], sources: [], feeMin: null, costMin: null }; $('q').value = '';
    $('bannerTxt').innerHTML = m === 'road' ? '<b>Roadway + drainage, consultant engineering only.</b> Confirmed = the source states a <b>drainage-specific fee strictly over $5M</b>. A separate bucket lists a <b>total roadway fee over $20M</b> when the scope names drainage (the drainage share is unknown and never estimated). Construction cost is either stated by the source or an estimate labeled <b>Estimate (not from source)</b>; it never affects a fee test.' : '<b>Fee &gt; $20M as stated by the source, engineering consultants only.</b> Most agencies publish no fee before award, so counts are small and true; nothing is padded or estimated.';
    try { history.replaceState(null, '', m === 'road' ? '#road' : location.pathname + location.search); } catch (e) { /* ignore */ }
    renderHow(); renderFresh(); render(); window.scrollTo(0, 0);
  }
  function render() {
    var list = scoped();
    renderModes(); renderScopes(); renderKpis(list); renderFilters();
    if (S.tab === 'map') renderMap(list); else if (S.tab === 'list') renderList(list); else if (S.tab === 'timeline') renderTimeline(list); else if (S.tab === 'break') renderBreak(list); else renderData();
  }
  function setTab(t) {
    S.tab = t; ['map', 'list', 'timeline', 'break', 'data'].forEach(function (k) { $('v-' + k).hidden = k !== t; });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.setAttribute('aria-current', b.getAttribute('data-tab') === t ? 'page' : 'false'); });
    render(); window.scrollTo(0, 0);
  }
  function toggle(arr, k) { var i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); else arr.push(k); }

  // ---------- CSV ----------
  function exportCsv() {
    var list = M.sortRecords(scoped(), S.sort); if (!list.length) { toast('Nothing to export in this view.'); return; }
    var blob = new Blob(['\ufeff' + (S.mode === 'road' ? RW.toCSVRoadway(list, ASOF) : M.toCSV(list, ASOF))], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'national-radar-' + (S.mode === 'road' ? 'roadway-' : '') + S.scope + '-' + ASOF + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Exported ' + list.length + ' record(s).');
  }

  // ---------- live refresh (CORS-open sources only: NYC and Chicago Socrata, USAspending) ----------
  function getJ(url, opt) { return fetch(url, opt).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function liveRefresh() {
    var btn = $('btnLive'), asOf = todayCentral(); btn.disabled = true; btn.textContent = 'Refreshing…';
    var since = M.addMonths(asOf, -24), jobs = [], res = {};
    jobs.push(getJ('https://data.cityofnewyork.us/resource/dg92-zbpx.json?' + new URLSearchParams({ $where: "section_name='Procurement' AND type_of_notice_description='Award' AND category_description='Construction Related Services' AND contract_amount>20000000 AND start_date>'" + since + "'", $limit: '5000', $order: 'start_date DESC' })).then(function (rows) { res.nyc = rows.map(M.normNyc).filter(Boolean); }));
    jobs.push(getJ('https://data.cityofchicago.org/resource/rsxa-ify5.json?' + new URLSearchParams({ $where: "award_amount>20000000 AND (end_date>'" + asOf + "' OR approval_date>'" + since + "')", $limit: '5000', $order: 'award_amount DESC' })).then(function (rows) { var best = {}; rows.forEach(function (r) { var k = r.purchase_order_contract_number; if (!best[k] || +(r.revision_number || 0) > +(best[k].revision_number || 0)) best[k] = r; }); res.chicago = Object.keys(best).map(function (k) { return M.normChicago(best[k]); }).filter(Boolean); }));
    var fields = ['Award ID', 'Recipient Name', 'Award Amount', 'Total Outlays', 'Description', 'Start Date', 'End Date', 'Awarding Agency', 'Awarding Sub Agency', 'NAICS', 'PSC', 'Place of Performance State Code', 'Place of Performance Country Code', 'generated_internal_id', 'Contract Award Type', 'Base Obligation Date'];
    var kw = ['drainage', 'stormwater', 'storm water', 'flood', 'wastewater', 'sewer', 'hydrologic', 'hydraulic', 'levee', 'dam safety', 'coastal', 'watershed', 'reservoir', 'water treatment', 'water resources', 'civil works', 'water supply', 'water system', 'water infrastructure'];
    jobs.push(getJ('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filters: { award_type_codes: ['A', 'B', 'C', 'D'], time_period: [{ start_date: M.addMonths(asOf, -60), end_date: asOf }], award_amounts: [{ lower_bound: M.FEE_THRESHOLD }], keywords: kw, psc_codes: { require: [['Service', 'C']] } }, fields: fields, limit: 100, page: 1, sort: 'Award Amount', order: 'desc' }) }).then(function (j) { res.usaspending = (j.results || []).map(function (r) { return M.normUsa(r, null); }).filter(Boolean); }));
    Promise.all(jobs.map(function (p) { return p.catch(function (e) { return { err: e.message }; }); })).then(function (out) {
      var failed = out.filter(function (x) { return x && x.err; }).length, kept = [];
      Object.keys(res).forEach(function (src) { res[src].forEach(function (c) { var ev = M.evaluate(c, { asOf: asOf }); if (ev.bucket !== 'excluded') kept.push(M.toRecord(c, ev, asOf)); }); });
      var answered = Object.keys(res), before = RECS.length; RECS = M.dedupe(RECS.concat(kept)); var added = RECS.length - before;
      LIVE.at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      $('liveNote').textContent = 'Live refresh at ' + LIVE.at + ': ' + answered.length + ' of 3 live sources answered (' + (answered.join(', ') || 'none') + '). ' + kept.length + ' record(s) passed the rules; ' + added + ' of them are new compared with the snapshot (already-known records stay as the snapshot has them). Only awards come from live sources, and the live USAspending query is limited to contracts (no detail lookup), so the build snapshot stays the complete picture.' + (failed ? ' ' + failed + ' source(s) failed.' : '');
      renderFresh(); render(); toast('Live awards refreshed.');
    }).catch(function (e) { toast('Live refresh failed: ' + e.message); }).then(function () { btn.disabled = false; btn.textContent = 'Refresh live awards'; });
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-mode],[data-scope],[data-star],[data-open],[data-f],[data-fee],[data-cost],[data-month],[data-st],[data-tab]'); if (!t) return;
    if (t.hasAttribute('data-mode')) { setMode(t.getAttribute('data-mode')); return; }
    if (t.hasAttribute('data-star')) { var id = t.getAttribute('data-star'); if (WATCH[id]) delete WATCH[id]; else WATCH[id] = true; saveWatch(); render(); return; }
    if (t.hasAttribute('data-open')) { openSheet(t.getAttribute('data-open')); return; }
    if (t.hasAttribute('data-scope')) { S.scope = t.getAttribute('data-scope'); S.rows = 50; S.tlMonth = null; render(); return; }
    if (t.hasAttribute('data-tab')) { setTab(t.getAttribute('data-tab')); return; }
    if (t.hasAttribute('data-month')) { var m = t.getAttribute('data-month'); S.tlMonth = S.tlMonth === m ? null : m; render(); return; }
    if (t.hasAttribute('data-fee')) { var v = t.getAttribute('data-fee'); S.f.feeMin = v === 'null' ? null : +v; render(); return; }
    if (t.hasAttribute('data-cost')) { var c = t.getAttribute('data-cost'); S.f.costMin = c === 'null' ? null : +c; render(); return; }
    if (t.hasAttribute('data-f')) { toggle(S.f[t.getAttribute('data-f')], t.getAttribute('data-k')); render(); return; }
    if (t.hasAttribute('data-st')) { toggle(S.f.states, t.getAttribute('data-st')); render(); }
  });
  $('shClose').addEventListener('click', closeSheet); $('shBg').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
  $('shStar').addEventListener('click', function () { var id = $('sheet').getAttribute('data-id'); if (WATCH[id]) delete WATCH[id]; else WATCH[id] = true; saveWatch(); $('shStar').className = 'star big' + (WATCH[id] ? ' on' : ''); $('shStar').innerHTML = WATCH[id] ? '&#9733;' : '&#9734;'; render(); });
  $('shBody').addEventListener('input', function (e) { if (!e.target.closest('#whatif')) return; if (e.target.hasAttribute('data-ovr')) runWhatIf(true); else runWhatIf(false); });
  $('q').addEventListener('input', function () { S.f.q = this.value.trim(); S.rows = 50; render(); });
  $('sort').addEventListener('change', function () { S.sort = this.value; render(); });
  $('btnMoreRows').addEventListener('click', function () { S.rows += 50; render(); });
  $('btnMore').addEventListener('click', function () { var o = $('adv').hidden; $('adv').hidden = !o; this.setAttribute('aria-expanded', String(o)); });
  $('btnHow').addEventListener('click', function () { var o = $('how').hidden; $('how').hidden = !o; this.setAttribute('aria-expanded', String(o)); });
  $('btnCsv').addEventListener('click', exportCsv); $('btnLive').addEventListener('click', liveRefresh);
  $('btnClear').addEventListener('click', function () { S.f = { q: '', states: [], agencies: [], statuses: [], sectors: [], sources: [], feeMin: null, costMin: null }; $('q').value = ''; render(); });

  // ---------- start ----------
  function loadJ(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  Promise.all([loadJ('data/national.json'), loadJ('data/roadway.json').catch(function () { return null; }), loadJ('data/cost-prices.json').catch(function () { return null; })]).then(function (x) {
    DATA_W = x[0]; DATA_R = x[1]; PRICES = x[2]; DATA = DATA_W; RECS = DATA.records || []; ASOF = DATA.asOfDate; renderHow(); renderFresh(); render();
    if (location.hash === '#road' && DATA_R) setMode('road');
  }).catch(function (e) { $('freshTxt').textContent = 'Could not load data/national.json (' + e.message + '). Open the app once while online so it can be saved for offline use.'; $('freshDot').className = 'dot bad'; });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
