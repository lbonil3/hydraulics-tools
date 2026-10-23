(function () {
  const L = window.BidCostLookup;
  const sectionsEl = document.getElementById('sections');
  const search = document.getElementById('search');
  const count = document.getElementById('count');
  const metaLine = document.getElementById('metaLine');
  let allRows = [];
  const openItems = Object.create(null); // item -> true when user toggled open

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function rowHtml(r) {
    const x = L.resolvePrice(r);
    if (x.price == null) return '';
    const bars = L.barPercents(r.houston_avg, r.statewide_avg);
    return '<tr>' +
      '<td>' + escapeHtml(r.bid_code) + '</td>' +
      '<td>' + escapeHtml(r.description) + '</td>' +
      '<td>' + escapeHtml(r.unit) + '</td>' +
      '<td>' + L.formatMoney(x.price) + '</td>' +
      '<td>' + (x.n == null ? '—' : String(x.n)) + '</td>' +
      '<td>' + escapeHtml(x.source || '—') + '</td>' +
      '<td class="price-bars" title="Houston vs Statewide">' +
        '<span class="bar houston" style="width:' + bars.houston + '%"></span>' +
        '<span class="bar statewide" style="width:' + bars.statewide + '%"></span>' +
      '</td>' +
      '</tr>';
  }

  function render(filtered) {
    const withPrice = filtered.filter(function (r) {
      return L.resolvePrice(r).price != null;
    });
    const groups = L.groupByItem(withPrice);
    const q = String(search.value || '').trim();
    count.textContent = withPrice.length + ' code' + (withPrice.length === 1 ? '' : 's') +
      ' · ' + groups.length + ' item' + (groups.length === 1 ? '' : 's');

    if (!groups.length) {
      sectionsEl.innerHTML = '<p class="empty">No matches</p>';
      return;
    }

    sectionsEl.innerHTML = groups.map(function (g) {
      const forceOpen = !!q || openItems[g.item];
      const rowsHtml = g.rows.map(rowHtml).join('');
      const spec = L.specPdfUrl(g.item);
      return '<section class="item-section' + (forceOpen ? ' open' : '') + '" data-item="' + escapeHtml(g.item) + '">' +
        '<div class="item-header-row" style="display:flex;align-items:stretch">' +
          '<button type="button" class="item-header" aria-expanded="' + (forceOpen ? 'true' : 'false') + '">' +
            '<span class="item-id">Item ' + escapeHtml(g.item) + '</span>' +
            '<span class="item-count">' + g.rows.length + '</span>' +
          '</button>' +
          '<a class="spec-link" href="' + escapeHtml(spec) + '" target="_blank" rel="noopener noreferrer">Spec</a>' +
        '</div>' +
        '<div class="item-body">' +
          '<table><thead><tr>' +
            '<th>Bid code</th><th>Description</th><th>Unit</th><th>Avg</th><th>n</th><th>Source</th><th>H / SW</th>' +
          '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
        '</div>' +
      '</section>';
    }).join('');
  }

  function onSearch() {
    render(L.filterRows(allRows, search.value));
  }

  sectionsEl.addEventListener('click', function (ev) {
    const btn = ev.target.closest('.item-header');
    if (!btn) return;
    const section = btn.closest('.item-section');
    if (!section) return;
    const item = section.getAttribute('data-item');
    const open = !section.classList.contains('open');
    section.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) openItems[item] = true;
    else delete openItems[item];
  });

  fetch('./prices.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      allRows = data.rows || [];
      const m = data.meta || {};
      metaLine.textContent =
        'Data accessed ' + (m.accessed || '—') +
        '. Lettings ' + (m.let_date_min || '—') + ' → ' + (m.let_date_max || '—') +
        '. All codes by Spec Item; Houston price first, statewide fallback labeled.';
      onSearch();
    })
    .catch(function (err) {
      metaLine.textContent = 'Could not load prices.json';
      console.error(err);
    });

  search.addEventListener('input', onSearch);
})();
