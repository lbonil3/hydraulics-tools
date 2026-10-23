(function () {
  const L = window.BidCostLookup;
  const tbody = document.getElementById('tbody');
  const search = document.getElementById('search');
  const count = document.getElementById('count');
  const metaLine = document.getElementById('metaLine');
  let allRows = [];
  const PAGE = 200; // initial paint + grow on scroll if needed; or render filtered capped

  function render(rows) {
    const resolved = rows.map(function (r) {
      const x = L.resolvePrice(r);
      return { r: r, x: x };
    }).filter(function (o) { return o.x.price != null; });

    count.textContent = resolved.length + ' item' + (resolved.length === 1 ? '' : 's');
    const slice = resolved.slice(0, PAGE);
    const html = slice.map(function (o) {
      return '<tr>' +
        '<td>' + escapeHtml(o.r.bid_code) + '</td>' +
        '<td>' + escapeHtml(o.r.description) + '</td>' +
        '<td>' + escapeHtml(o.r.unit) + '</td>' +
        '<td>' + L.formatMoney(o.x.price) + '</td>' +
        '<td>' + (o.x.n == null ? '—' : String(o.x.n)) + '</td>' +
        '<td>' + escapeHtml(o.x.source || '—') + '</td>' +
        '</tr>';
    }).join('');
    tbody.innerHTML = html || '<tr><td colspan="6">No matches</td></tr>';
    if (resolved.length > PAGE) {
      count.textContent += ' (showing first ' + PAGE + ' — refine search)';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function onSearch() {
    const q = search.value;
    let base = allRows;
    if (!String(q || '').trim()) {
      base = allRows.filter(function (r) { return (Number(r.houston_n) || 0) > 0; });
    }
    render(L.filterRows(base, q));
  }

  fetch('./prices.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      allRows = data.rows || [];
      const m = data.meta || {};
      metaLine.textContent =
        'Data accessed ' + (m.accessed || '—') +
        '. Lettings ' + (m.let_date_min || '—') + ' → ' + (m.let_date_max || '—') +
        '. Houston first; statewide fallback labeled.';
      onSearch();
    })
    .catch(function (err) {
      metaLine.textContent = 'Could not load prices.json';
      console.error(err);
    });

  search.addEventListener('input', onSearch);
})();
