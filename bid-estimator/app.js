(function () {
  'use strict';
  const E = window.BidEstimator;
  const C = window.BidEstimatorCharts;
  const STORE = 'bidEstimator.items.v1';
  const $ = function (id) { return document.getElementById(id); };
  const els = { search: $('codeSearch'), suggest: $('suggest'), picked: $('picked'), qty: $('qty'), qtyUnit: $('qtyUnit'),
    scope: $('scope'), add: $('addBtn'), msg: $('formMsg'), tab: $('tabWrap'), cards: $('cards'), meta: $('metaLine'), method: $('methodData') };
  let idx = null, itemInfo = null, ctx = null, houstonIdx = -1;
  const shards = Object.create(null); // item -> Promise<shard>
  let items = load();               // [{id, code, qty, scope}]
  const results = Object.create(null); // id -> estimate result
  let picked = null;                // index row
  let sugRows = [], sugActive = -1;
  let openId = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function load() { try { const a = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.code; }) : []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(items.map(function (i) { return { id: i.id, code: i.code, qty: i.qty, scope: i.scope }; }))); } catch (e) { /* private mode */ } }
  function newId() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function toast(t) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  function copyText(text, label) {
    const done = function () { toast(label + ' copied'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select the text manually'); }
      ta.remove();
    }
  }
  function itemOf(code) { return String(code).split('-')[0]; }
  function rowFor(code) { return idx ? idx.index.find(function (r) { return r[0] === code; }) : null; }
  function shard(code) {
    const it = itemOf(code);
    if (!shards[it]) {
      shards[it] = fetch('data/items/' + encodeURIComponent(it) + '.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
      }).catch(function (e) { delete shards[it]; throw e; });
    }
    return shards[it];
  }

  // ---------- search ----------
  function renderSuggest() {
    const q = els.search.value;
    sugRows = idx ? E.search(idx.index, q, itemInfo, 25) : [];
    sugActive = sugRows.length ? 0 : -1;
    if (!q.trim() || !sugRows.length) {
      els.suggest.hidden = true; els.search.setAttribute('aria-expanded', 'false');
      if (q.trim() && idx) els.suggest.innerHTML = '';
      return;
    }
    els.suggest.innerHTML = sugRows.map(function (r, i) {
      return '<li role="option" id="sg' + i + '" data-i="' + i + '" aria-selected="' + (i === sugActive) + '"><span class="s-code">' + esc(r[0]) +
        '</span><span class="s-desc">' + esc(r[1]) + ' <small>(' + esc(r[2]) + ')</small></span><span class="s-n">' + r[3] + ' bids' + (r[4] ? ' · ' + r[4] + ' Hou' : '') + '</span></li>';
    }).join('');
    els.suggest.hidden = false; els.search.setAttribute('aria-expanded', 'true');
    els.search.setAttribute('aria-activedescendant', 'sg0');
  }
  function setActive(i) {
    sugActive = Math.max(0, Math.min(sugRows.length - 1, i));
    els.suggest.querySelectorAll('li').forEach(function (li, j) { li.setAttribute('aria-selected', String(j === sugActive)); if (j === sugActive) li.scrollIntoView({ block: 'nearest' }); });
    els.search.setAttribute('aria-activedescendant', 'sg' + sugActive);
  }
  function pick(r) {
    picked = r;
    els.search.value = r[0] + ' ' + r[1];
    els.suggest.hidden = true; els.search.setAttribute('aria-expanded', 'false');
    els.picked.textContent = r[0] + ' · ' + r[1] + ' · unit ' + r[2] + ' · ' + r[3] + ' low bids statewide, ' + r[4] + ' Houston';
    els.qtyUnit.textContent = '(' + r[2] + ')';
    els.msg.textContent = '';
    els.qty.focus();
  }
  els.search.addEventListener('input', function () { picked = null; els.picked.textContent = ''; els.qtyUnit.textContent = ''; renderSuggest(); });
  els.search.addEventListener('keydown', function (ev) {
    if (els.suggest.hidden) { if (ev.key === 'Enter') { ev.preventDefault(); addFromForm(); } return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(sugActive + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(sugActive - 1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (sugRows[sugActive]) pick(sugRows[sugActive]); }
    else if (ev.key === 'Escape') { els.suggest.hidden = true; els.search.setAttribute('aria-expanded', 'false'); }
  });
  els.suggest.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  els.suggest.addEventListener('click', function (ev) {
    const li = ev.target.closest('li'); if (li) pick(sugRows[Number(li.getAttribute('data-i'))]);
  });
  els.search.addEventListener('blur', function () { setTimeout(function () { els.suggest.hidden = true; els.search.setAttribute('aria-expanded', 'false'); }, 150); });
  els.qty.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); addFromForm(); } });

  function addFromForm() {
    if (!picked) {
      const m = /^\s*(\d{3,4}-\d{4})\b/.exec(els.search.value);
      const r = m && rowFor(m[1]);
      if (r) picked = r;
      else if (sugRows.length === 1) picked = sugRows[0];
    }
    if (!picked) { els.msg.textContent = 'Pick a bid code from the list first.'; els.search.focus(); return; }
    const q = Number(els.qty.value);
    if (!(q > 0)) { els.msg.textContent = 'Enter a quantity greater than zero.'; els.qty.focus(); return; }
    addItem(picked[0], q, els.scope.value);
    els.search.value = ''; els.qty.value = ''; els.picked.textContent = ''; els.qtyUnit.textContent = ''; picked = null;
    els.msg.textContent = '';
  }
  els.add.addEventListener('click', addFromForm);

  function addItem(code, qty, scope) {
    const it = { id: newId(), code: code, qty: qty, scope: scope || 'auto' };
    items.push(it); openId = it.id; save();
    return compute(it).then(function () {
      renderAll();
      const card = document.getElementById('card-' + it.id);
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function compute(it) {
    return shard(it.code).then(function (sh) {
      const e = sh.codes[it.code];
      results[it.id] = e ? E.estimate(Object.assign({ code: it.code }, e), it.qty, ctx, { scope: it.scope })
        : { ok: false, reason: 'Bid code ' + it.code + ' is not in the data.' };
    }).catch(function () { results[it.id] = { ok: false, reason: 'Could not load data for ' + it.code + '.' }; });
  }

  // ---------- render ----------
  function lineRows() { return items.map(function (it) { return E.lineRow(it, results[it.id]); }); }
  function renderTable() {
    if (!items.length) { els.tab.innerHTML = '<p class="empty-tab">No items yet. Search a bid code above, enter a quantity and press Add item.</p>'; return; }
    const rows = lineRows();
    let total = 0;
    const body = items.map(function (it, i) {
      const r = rows[i], res = results[it.id];
      total += r.extension || 0;
      return '<tr data-id="' + it.id + '"><td class="c-code code">' + esc(it.code) + '</td><td class="c-desc desc">' + esc(r.desc) + '</td><td class="c-unit">' + esc(r.unit) + '</td>' +
        '<td class="c-qty num"><input class="qty-in" type="number" inputmode="decimal" min="0" step="any" value="' + esc(it.qty) + '" aria-label="Quantity for ' + esc(it.code) + '"><span class="m-unit"> ' + esc(r.unit) + '</span></td>' +
        '<td class="c-price num" data-k="Unit price"><b>' + E.fmtMoney(r.unit_price) + '</b></td>' +
        '<td class="c-range num" data-k="Range">' + (res && res.ok ? E.fmtMoney(r.low) + '–' + E.fmtMoney(r.high) : '—') + '</td>' +
        '<td class="c-ext num" data-k="Extension">' + E.fmtMoney(r.extension) + '</td>' +
        '<td class="c-conf">' + (res && res.ok ? '<span class="conf conf-' + res.confidence + '">' + res.confidence + '</span>' : esc(res ? res.reason : '…')) + '</td>' +
        '<td class="c-del"><button type="button" class="btn small ghost del" aria-label="Remove ' + esc(it.code) + '">✕</button></td></tr>';
    }).join('');
    els.tab.innerHTML = '<table class="bidtab"><thead><tr><th>Code</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num hide-sm">Range</th><th class="num">Extension</th><th>Conf.</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>' +
      body + '</tbody><tfoot><tr><td colspan="4" class="tot-l">Total (' + items.length + ' item' + (items.length === 1 ? '' : 's') + ')</td><td></td><td></td><td class="num tot">' + E.fmtMoney(total) + '</td><td colspan="2"></td></tr></tfoot></table>';
  }

  function statsTable(res) {
    const sw = res.stats;
    const row = function (k, v) { return '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; };
    const f = E.fmtMoney;
    return '<table class="stats-table"><tbody>' +
      row('Bids / projects (' + esc(res.scopeLabel) + ')', sw.n + ' / ' + sw.n_projects) +
      row('Let dates', esc(sw.date_min + ' → ' + sw.date_max)) +
      row('Min · p10 · p25', f(sw.min) + ' · ' + f(sw.p10) + ' · ' + f(sw.p25)) +
      row('Median · mean · qty-weighted', f(sw.median) + ' · ' + f(sw.mean) + ' · ' + f(sw.wmean)) +
      row('p75 · p90 · max', f(sw.p75) + ' · ' + f(sw.p90) + ' · ' + f(sw.max)) +
      row('Quantity min · median · max', E.fmtQty(sw.qty_min) + ' · ' + E.fmtQty(sw.qty_median) + ' · ' + E.fmtQty(sw.qty_max) + ' ' + esc(res.unit)) +
      row('Bands small · medium · large (median, n)', [sw.bands.small, sw.bands.medium, sw.bands.large].map(function (b) { return f(b.median) + ' (' + b.n + ')'; }).join(' · ')) +
      row('Log-log fit slope · R² · p · n', sw.regression.slope == null ? '—' : sw.regression.slope + ' · ' + sw.regression.r2 + ' · ' + sw.regression.p + ' · ' + sw.regression.n + (sw.regression.significant ? '' : ' (not significant)')) +
      row('Engineer\'s estimate median · low/EE', sw.ee_n ? f(sw.ee_median) + ' · ' + Math.round(sw.low_to_ee_median * 100) + '%' : '—') +
      row('Price trend per year', sw.trend ? sw.trend.pct_per_year + '% (p=' + sw.trend.p + (sw.trend.significant ? '' : ', not significant') + ')' : 'too few bids') +
      row('Far outliers', String(sw.outliers)) +
      '</tbody></table>';
  }

  function cardHtml(it) {
    const res = results[it.id];
    if (!res) return '';
    if (!res.ok) return '<article class="card" id="card-' + it.id + '"><h3>' + esc(it.code) + '</h3><p>' + esc(res.reason) + '</p></article>';
    const info = itemInfo && itemInfo.items ? itemInfo.items[itemOf(it.code)] : null;
    return '<article class="card" id="card-' + it.id + '" data-id="' + it.id + '">' +
      '<div class="card-head"><div><h3>' + esc(res.code) + ' · ' + esc(res.desc) + '</h3>' +
      '<p class="sub">' + (info ? 'Item ' + esc(itemOf(it.code)) + ' · ' + esc(info.title) + ' · ' : '') + E.fmtQty(res.qty) + ' ' + esc(res.unit) + ' · ' + esc(res.scopeLabel) + '</p></div>' +
      '<div><span class="conf conf-' + res.confidence + '">' + res.confidence + ' confidence</span>' + (res.extrapolated ? '<span class="extrap">Extrapolated beyond data</span>' : '') + '</div></div>' +
      '<div class="nums">' +
        '<div><span class="k">Low</span><span class="v">' + E.fmtMoney(res.low) + '</span><span class="t">' + E.fmtMoney(res.total.low) + '</span></div>' +
        '<div class="mid"><span class="k">Suggested / ' + esc(res.unit) + '</span><span class="v">' + E.fmtMoney(res.mid) + '</span><span class="t">Total ' + E.fmtMoney(res.total.mid) + '</span></div>' +
        '<div><span class="k">High</span><span class="v">' + E.fmtMoney(res.high) + '</span><span class="t">' + E.fmtMoney(res.total.high) + '</span></div>' +
        '<div><span class="k">Bids used</span><span class="v">' + res.stats.n + '</span><span class="t">' + res.neighbors + ' similar-size</span></div>' +
      '</div>' +
      (res.warnings.length ? '<ul class="warn">' + res.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="backup"><span class="lbl">Suggested wording for your backup</span><p class="sentence">' + esc(res.sentence) + '</p>' +
      '<button type="button" class="btn small copy-sentence">Copy backup sentence</button></div>' +
      '<ul class="comments">' + res.comments.map(function (c) { const i = c.indexOf(': '); return '<li>' + (i > 0 && i < 30 ? '<b>' + esc(c.slice(0, i)) + ':</b> ' + esc(c.slice(i + 2)) : esc(c)) + '</li>'; }).join('') + '</ul>' +
      '<div class="charts"><div>' + C.scatter(res, houstonIdx, chartOpts()) +
      '<p class="legend"><i style="background:#2563eb"></i>low bid <i style="background:#ea580c"></i>Houston <i style="background:#1f4e79;opacity:.3;border-radius:2px"></i>suggested range <i style="background:#b45309"></i>your qty / suggested</p></div>' +
      '<div>' + C.boxplot(res, chartOpts()) + '<p class="legend">▲ suggested ' + E.fmtMoney(res.mid) + ' · shaded = your range ' + E.fmtMoney(res.low) + '–' + E.fmtMoney(res.high) + '. Box = middle half of low bids (' + E.fmtMoney(res.p25) + '–' + E.fmtMoney(res.p75) + '), line = median ' + E.fmtMoney(res.p50) + ', whiskers = 10th–90th percentile, dots = each low bid.</p>' +
      '<details class="more"><summary>Statistics</summary>' + statsTable(res) + '</details></div></div>' +
      '</article>';
  }
  function chartOpts() { return window.innerWidth < 700 ? { width: 360, height: 240 } : { width: 560, height: 260 }; }
  function renderCards() { els.cards.innerHTML = items.slice().reverse().map(cardHtml).join(''); }
  function renderAll() { renderTable(); renderCards(); }

  els.tab.addEventListener('change', function (ev) {
    const inp = ev.target.closest('.qty-in'); if (!inp) return;
    const tr = inp.closest('tr'); const it = items.find(function (x) { return x.id === tr.getAttribute('data-id'); });
    const q = Number(inp.value);
    if (!it || !(q > 0)) { inp.value = it ? it.qty : ''; return; }
    it.qty = q; save(); compute(it).then(renderAll);
  });
  els.tab.addEventListener('click', function (ev) {
    const del = ev.target.closest('.del'); if (!del) return;
    const id = del.closest('tr').getAttribute('data-id');
    items = items.filter(function (x) { return x.id !== id; }); delete results[id]; save(); renderAll();
  });
  els.cards.addEventListener('click', function (ev) {
    const b = ev.target.closest('.copy-sentence'); if (!b) return;
    const res = results[b.closest('.card').getAttribute('data-id')];
    if (res && res.ok) copyText(res.sentence, 'Backup sentence');
  });
  $('copyTable').addEventListener('click', function () {
    if (!items.length) return toast('Nothing to copy yet');
    copyText(E.toTSV(lineRows()), 'Table');
  });
  $('downloadCsv').addEventListener('click', function () {
    if (!items.length) return toast('Nothing to export yet');
    const blob = new Blob(['\ufeff' + E.toCSV(lineRows())], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bid-estimate-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('clearAll').addEventListener('click', function () {
    if (!items.length || !window.confirm('Remove all ' + items.length + ' items?')) return;
    items = []; save(); renderAll();
  });

  // ---------- boot ----------
  Promise.all([
    fetch('data/index.json').then(function (r) { return r.json(); }),
    fetch('../bid-cost/item-info.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (v) {
    idx = v[0]; itemInfo = v[1];
    houstonIdx = idx.districts.indexOf('Houston');
    ctx = { districts: idx.districts, counties: idx.counties, pooled_slope: idx.pooled_slope, data_date_max: idx.meta.let_date_max };
    const m = idx.meta;
    els.meta.textContent = 'Data accessed ' + m.accessed + '. Lettings ' + m.let_date_min + ' → ' + m.let_date_max + ' (all the dataset holds). ' +
      m.rows_used.toLocaleString('en-US') + ' low bids, ' + m.codes.toLocaleString('en-US') + ' bid codes.';
    els.method.textContent = 'Data: ' + m.rows_used.toLocaleString('en-US') + ' low-bid rows for ' + m.codes.toLocaleString('en-US') + ' bid codes, lettings ' + m.let_date_min + ' to ' + m.let_date_max +
      ' (the dataset has no earlier years), accessed ' + m.accessed + '. Typical price-vs-quantity slope across ' + idx.pooled_slope.n + ' codes with a significant fit: ' + idx.pooled_slope.slope +
      ' (middle half ' + idx.pooled_slope.p25 + ' to ' + idx.pooled_slope.p75 + '), i.e. about ' + Math.round((1 - Math.pow(10, idx.pooled_slope.slope)) * 100) + '% lower unit price per 10x quantity. Because it comes only from codes where the fit was significant, it may overstate the typical discount; it is labeled assumed wherever it is used.';
    const q = E.parseQuery(location.search);
    const pending = items.map(compute);
    if (q.code) {
      const r = rowFor(q.code);
      if (r && q.qty > 0) {
        const dup = items.find(function (x) { return x.code === q.code && Number(x.qty) === q.qty; });
        if (!dup) pending.push(addItem(q.code, q.qty, q.scope || 'auto'));
      } else if (r) { pick(r); }
      else els.msg.textContent = 'Bid code ' + q.code + ' from the link is not in the data.';
      if (history.replaceState) history.replaceState(null, '', location.pathname);
    }
    return Promise.all(pending).then(renderAll);
  }).catch(function (e) {
    els.meta.textContent = 'Could not load bid data.'; console.error(e);
  });
  renderTable();
})();
