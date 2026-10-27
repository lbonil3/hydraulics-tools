/* National Radar UI. Vanilla JS, no build. Reads data/national.json (a snapshot built by scripts/build-national.js).
   Every record already carries the rule that included it, the source field of each dollar figure, and a source link. */
(function () {
  'use strict';
  var M = window.NationalModel, G = window.US_GEO, TX = window.NATIONAL_TEXT || { notUsed: [], rules: [] };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SRC_SHORT = { 'sam': 'SAM.gov', 'usaspending': 'USAspending', 'txdot-pcl': 'TxDOT projected contracts', 'nyc': 'NYC City Record', 'chicago': 'Chicago contracts', 'dhs-apfs': 'DHS forecast (APFS)', 'ag-forecast': 'Acquisition Gateway forecasts', 'caltrans-lar': 'Caltrans A&E look-ahead', 'caltrans-awards': 'Caltrans A&E awards' };
  var SCOPES = [
    { id: 'opp', label: 'Upcoming & open', sub: 'confirmed, fee > $20M' },
    { id: 'review', label: 'Needs review', sub: 'uncertain, not confirmed' },
    { id: 'nofee', label: 'Fee not stated', sub: 'open/upcoming, no fee' },
    { id: 'recompete', label: 'Recompete watch', sub: 'inferred from end dates' },
    { id: 'awards', label: 'Awards / competitors', sub: 'awarded or closed' },
    { id: 'watch', label: 'Watchlist', sub: 'starred on this device' }
  ];
  var COLOR = { opp: '#34d399', review: '#fbbf24', nofee: '#94a3b8', award: '#7cb7ff', closed: '#64748b', recompete: '#fb7185' };
  var STATUS_LABEL = { open: 'Open', upcoming: 'Upcoming', awarded: 'Awarded' };
  var EXCL_LABEL = { 'not-engineering': 'Not an engineering-services notice (NAICS / PSC)', 'construction-naics': 'Construction NAICS (23xxxx)', 'construction-title': 'Title reads as a construction contract', 'no-sector': 'No drainage / water / wastewater / flood / coastal wording', 'no-stated-fee': 'No fee stated by the source', 'project-cost-only': 'Only a project or construction cost stated (never counts as a fee)', 'fee-not-above-20m': 'Stated fee is $20,000,000 or less', 'deadline-passed': 'Response date already passed', 'outside-us': 'Place of performance outside the US', 'non-civil-context': 'Title looks non-civil (vessel, ESPC, cyber and similar)', 'stale-no-deadline': 'No deadline and posted over 12 months ago', 'award-older-than-24-months': 'Award older than 24 months', 'closed-older-than-12-months': 'Closed more than 12 months ago', 'notice-type-not-used': 'Notice type not used (justification, amendment only, etc.)', 'not-active-status': 'Not an active status', 'status-unknown': 'Status unknown' };

  var DATA = null, RECS = [], ASOF = '', LIVE = {};
  var WATCH = {}; try { WATCH = JSON.parse(localStorage.getItem('nr.watch') || '{}') || {}; } catch (e) { WATCH = {}; }
  var S = { scope: 'opp', tab: 'map', sort: 'fee', rows: 50, tlMonth: null, f: { q: '', states: [], agencies: [], statuses: [], sectors: [], sources: [], feeMin: null, costMin: null } };
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
  function scoped(scope, skip) { return M.filterRecords(RECS, filterFor(scope || S.scope, S.f, skip), WATCH); }
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
    if (r.recompete) t.push('<span class="tag inf">Recompete (inferred)</span>');
    (r.sectors || []).forEach(function (s) { t.push('<span class="tag inf" title="Inferred from keywords">' + esc(M.sectorLabel(s)) + '</span>'); });
    if (r.also && r.also.length) t.push('<span class="tag">+' + r.also.length + ' same record</span>');
    return t.join('');
  }
  function colorOf(r) { return r.recompete && S.scope === 'recompete' ? COLOR.recompete : COLOR[r.bucket] || '#64748b'; }
  function cardHtml(r) {
    var money;
    if (r.amt) money = '<span class="lbl">' + esc(moneyLabel(r.amt)) + '</span><span class="big">' + esc(M.fmtMoneyFull(r.amt.v)) + '</span>';
    else money = '<span class="lbl">No fee stated by the source</span>' + (r.projectCost ? '<span class="big" style="font-size:16px">project cost (not fee): ' + esc(M.fmtMoney(r.projectCost.v)) + '</span><span class="lbl">' + esc(r.projectCost.field) + '</span>' : '');
    var where = [r.agency, r.subagency && r.subagency !== r.agency ? r.subagency : null, r.city ? r.city + ', ' + (r.state || '') : r.state ? (M.STATE_NAMES[r.state] || r.state) : 'state not stated'].filter(Boolean).join(' · ');
    return '<div class="card" style="--c:' + colorOf(r) + '"><button type="button" class="star' + (WATCH[r.id] ? ' on' : '') + '" data-star="' + esc(r.id) + '" aria-label="' + (WATCH[r.id] ? 'Remove from watchlist' : 'Add to watchlist') + '">' + (WATCH[r.id] ? '&#9733;' : '&#9734;') + '</button>' +
      '<button type="button" class="b" data-open="' + esc(r.id) + '">' + money + '<span class="t">' + esc(r.title) + '</span><span class="m"><span>' + esc(where) + '</span></span><span class="m"><span>' + esc(dateText(r)) + '</span><span>' + esc(SRC_SHORT[r.src] || r.src) + '</span></span><span>' + tagsFor(r) + '</span></button></div>';
  }
  function cardsInto(el, list, emptyHtml) {
    el.innerHTML = list.length ? list.map(cardHtml).join('') : (emptyHtml || '');
  }
  function emptyScopeHtml() {
    var counts = {}; SCOPES.forEach(function (s) { counts[s.id] = scoped(s.id).length; });
    var filtered = activeCount() > 0;
    if (filtered && RECS.length) return '<div class="empty"><b>Nothing matches these filters in this tab.</b> Clear filters to see the full tab.</div>';
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
    $('freshTxt').textContent = 'Snapshot as of ' + M.fmtDate(DATA.asOfDate) + ' (built ' + gen.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + ', ' + (age < 1 ? 'today' : Math.floor(age) + ' day' + (Math.floor(age) === 1 ? '' : 's') + ' old') + ')' + (bad.length ? '. ' + bad.length + ' source(s) stale or failed.' : '.') + (LIVE.at ? ' Live awards refreshed ' + LIVE.at + '.' : '') + ' Fee filter: strictly > $20M, as stated by the source.';
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
    chipSet('fSector', 'sectors', itemsFor('sectors', function (r) { return r.sectors || []; }, function (k) { return M.sectorLabel(k); }), f.sectors);
    chipSet('fSource', 'sources', itemsFor('sources', function (r) { return r.src; }, function (k) { return SRC_SHORT[k] || k; }), f.sources);
    var fees = [[null, 'Any'], [20e6, '> $20M'], [50e6, '> $50M'], [100e6, '> $100M'], [250e6, '> $250M'], [500e6, '> $500M']];
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
    bars('bSector', 'sectors', group(list, function (r) { return r.sectors || []; }), function (k) { return M.sectorLabel(k); }, true);
    bars('bSource', 'sources', group(list, function (r) { return r.src; }), function (k) { return SRC_SHORT[k] || k; }, true);
  }

  // ---------- data quality ----------
  function td(v) { return '<td>' + (v === undefined || v === null ? '0' : esc(typeof v === 'number' ? v.toLocaleString('en-US') : v)) + '</td>'; }
  function renderData() {
    if (!DATA) return;
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
    $('how').innerHTML = '<p>' + TX.rules.join('</p><p>') + '</p><p><b>Not counted:</b> construction contracts, supply contracts, project or construction costs standing in for a fee, fees estimated by percentage, and anything outside the United States.</p>';
  }

  // ---------- detail sheet ----------
  function openSheet(id) {
    var r = RECS.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var h = '<h2>' + esc(r.title) + '</h2><div>' + tagsFor(r) + '</div>';
    if (r.url) h += '<a class="srclink" href="' + esc(r.url) + '" target="_blank" rel="noopener">Open the source record</a>';
    h += '<h3>Dollar figures</h3>';
    if (r.amt) h += '<div class="money"><span class="lbl">Stated fee / value (decides the fee rule)</span><b>' + esc(M.fmtMoneyFull(r.amt.v)) + '</b><div>' + esc(moneyLabel(r.amt)) + '</div>' + (r.amt.ctx ? '<div class="hint">"…' + esc(r.amt.ctx) + '…"</div>' : '') + '</div>';
    else h += '<div class="money"><b style="font-size:16px">No fee stated by the source</b></div>';
    (r.amts || []).filter(function (a) { return a.kind !== 'project_cost' && !(r.amt && a.v === r.amt.v && a.kind === r.amt.kind); }).forEach(function (a) { h += '<div class="money"><span class="lbl">Other figure</span><b style="font-size:17px">' + esc(M.fmtMoneyFull(a.v)) + '</b><div>' + esc(moneyLabel(a)) + '</div>' + (a.ctx ? '<div class="hint">"…' + esc(a.ctx) + '…"</div>' : '') + '</div>'; });
    if (r.projectCost) h += '<div class="money cost"><span class="lbl">Project cost (NOT a fee, never used for the fee rule)</span><b style="font-size:17px">' + esc(M.fmtMoneyFull(r.projectCost.v)) + '</b><div>' + esc(r.projectCost.field) + '</div>' + (r.projectCost.ctx ? '<div class="hint">"…' + esc(r.projectCost.ctx) + '…"</div>' : '') + '</div>';
    h += '<h3>Why it is in this list (the exact rules)</h3><ul>' + (r.rules || []).map(function (x) { return '<li>' + esc(x.t) + '</li>'; }).join('') + '</ul>';
    if (r.review && r.review.length) h += '<h3>Why it needs review</h3><ul>' + r.review.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (r.bucket === 'nofee') h += '<h3>Why it is under "Fee not stated"</h3><p class="note" style="margin:0">Engineering notice with a water-sector title that is open or upcoming, but the source states no fee. It is not counted as over $20M.</p>';
    h += '<h3>Details</h3><dl>' + [['Status', (STATUS_LABEL[r.status] || r.status) + ' · ' + (r.noticeLabel || r.noticeType || '')], ['Agency', [r.agency, r.subagency, r.office].filter(Boolean).join(' / ')], ['Place', [r.city, r.state].filter(Boolean).join(', ') || 'not stated'], ['Dates', dateText(r)], ['Awardee', r.awardee], ['Award #', r.awardNum], ['Solicitation #', r.solNum], ['NAICS / PSC', [r.naics, r.psc].filter(Boolean).join(' / ')], ['Sector (inferred)', (r.sectors || []).map(M.sectorLabel).join(', ')], ['Source', SRC_SHORT[r.src] || r.src], ['Snapshot as of', ASOF]].filter(function (x) { return x[1]; }).map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>';
    var fk = Object.keys(r.fields || {}).filter(function (k) { return r.fields[k] !== '' && r.fields[k] !== null && r.fields[k] !== undefined; });
    if (fk.length) h += '<h3>All source fields</h3><dl>' + fk.map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(r.fields[k]) + '</dd>'; }).join('') + '</dl>';
    if (r.desc) h += '<h3>Description (from the source, shortened)</h3><p style="font-size:13px;overflow-wrap:anywhere">' + esc(r.desc) + '</p>';
    if (r.also && r.also.length) h += '<h3>Same record also found as</h3><ul>' + r.also.map(function (x) { return '<li>' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc((SRC_SHORT[x.src] || x.src) + ' ' + (x.type || '') + ' ' + x.id) + '</a>' : esc(x.src + ' ' + x.id)) + '</li>'; }).join('') + '</ul>';
    $('shBody').innerHTML = h; $('sheet').hidden = false; $('sheet').setAttribute('data-id', id); $('shStar').className = 'star big' + (WATCH[id] ? ' on' : ''); $('shStar').innerHTML = WATCH[id] ? '&#9733;' : '&#9734;';
    document.body.style.overflow = 'hidden'; $('shClose').focus();
  }
  function closeSheet() { $('sheet').hidden = true; document.body.style.overflow = ''; }

  // ---------- master render ----------
  function render() {
    var list = scoped();
    renderScopes(); renderKpis(list); renderFilters();
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
    var blob = new Blob(['\ufeff' + M.toCSV(list, ASOF)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'national-radar-' + S.scope + '-' + ASOF + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
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
    var t = e.target.closest('[data-scope],[data-star],[data-open],[data-f],[data-fee],[data-cost],[data-month],[data-st],[data-tab]'); if (!t) return;
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
  $('q').addEventListener('input', function () { S.f.q = this.value.trim(); S.rows = 50; render(); });
  $('sort').addEventListener('change', function () { S.sort = this.value; render(); });
  $('btnMoreRows').addEventListener('click', function () { S.rows += 50; render(); });
  $('btnMore').addEventListener('click', function () { var o = $('adv').hidden; $('adv').hidden = !o; this.setAttribute('aria-expanded', String(o)); });
  $('btnHow').addEventListener('click', function () { var o = $('how').hidden; $('how').hidden = !o; this.setAttribute('aria-expanded', String(o)); });
  $('btnCsv').addEventListener('click', exportCsv); $('btnLive').addEventListener('click', liveRefresh);
  $('btnClear').addEventListener('click', function () { S.f = { q: '', states: [], agencies: [], statuses: [], sectors: [], sources: [], feeMin: null, costMin: null }; $('q').value = ''; render(); });

  // ---------- start ----------
  fetch('data/national.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
    DATA = d; RECS = d.records || []; ASOF = d.asOfDate; renderHow(); renderFresh(); render();
  }).catch(function (e) { $('freshTxt').textContent = 'Could not load data/national.json (' + e.message + '). Open the app once while online so it can be saved for offline use.'; $('freshDot').className = 'dot bad'; });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
