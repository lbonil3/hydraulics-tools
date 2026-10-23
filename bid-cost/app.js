(function () {
  const L = window.BidCostLookup;
  const sectionsEl = document.getElementById('sections');
  const search = document.getElementById('search');
  const count = document.getElementById('count');
  const metaLine = document.getElementById('metaLine');
  let allRows = [];
  let detailMap = null;
  const openItems = Object.create(null); // item -> true when user toggled open
  const bodyCache = Object.create(null); // item -> { sig, html }
  let rowsByItem = Object.create(null); // item -> rows for current filter

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function rowHtml(r) {
    const x = L.resolvePrice(r);
    if (x.price == null) return '';
    const bars = L.barPercents(r.houston_avg, r.statewide_avg);
    const d = L.resolveDetail(detailMap, r.bid_code);
    const detailCell = d
      ? '<a class="detail-link" href="' + escapeHtml(d.url) +
        '" target="_blank" rel="noopener noreferrer" title="' +
        escapeHtml(d.source + ' · ' + d.label) + '">' + escapeHtml(d.label) + '</a>'
      : '';
    return '<tr>' +
      '<td>' + escapeHtml(r.bid_code) + '</td>' +
      '<td>' + escapeHtml(r.description) + '</td>' +
      '<td>' + escapeHtml(r.unit) + '</td>' +
      '<td>' + L.formatMoney(x.price) + '</td>' +
      '<td>' + (x.n == null ? '—' : String(x.n)) + '</td>' +
      '<td>' + escapeHtml(x.source || '—') + '</td>' +
      '<td class="detail-cell">' + detailCell + '</td>' +
      '<td class="price-bars" title="Houston vs Statewide">' +
        '<span class="bar houston" style="width:' + bars.houston + '%"></span>' +
        '<span class="bar statewide" style="width:' + bars.statewide + '%"></span>' +
      '</td>' +
      '</tr>';
  }

  function rowsSignature(rows) {
    // Include map-loaded bit so late detail-map.json refresh invalidates cache
    return (detailMap ? '1' : '0') + '\0' + rows.map(function (r) { return r.bid_code; }).join('\0');
  }

  function tableHtml(rows) {
    return '<table><thead><tr>' +
      '<th>Bid code</th><th>Description</th><th>Unit</th><th>Avg</th><th>n</th><th>Source</th><th>Detail</th><th>H / SW</th>' +
      '</tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table>';
  }

  function getBodyHtml(item, rows) {
    const sig = rowsSignature(rows);
    const cached = bodyCache[item];
    if (cached && cached.sig === sig) return cached.html;
    const html = tableHtml(rows);
    bodyCache[item] = { sig: sig, html: html };
    return html;
  }

  function ensureBodyFilled(section) {
    const body = section.querySelector('.item-body');
    if (!body || body.getAttribute('data-filled') === '1') return;
    const item = section.getAttribute('data-item');
    const rows = rowsByItem[item];
    if (!rows) return;
    body.innerHTML = getBodyHtml(item, rows);
    body.setAttribute('data-filled', '1');
  }

  function render(filtered) {
    const withPrice = filtered.filter(function (r) {
      return L.resolvePrice(r).price != null;
    });
    const groups = L.groupByItem(withPrice);
    const q = String(search.value || '').trim();
    count.textContent = withPrice.length + ' code' + (withPrice.length === 1 ? '' : 's') +
      ' · ' + groups.length + ' item' + (groups.length === 1 ? '' : 's');

    rowsByItem = Object.create(null);
    if (!groups.length) {
      sectionsEl.innerHTML = '<p class="empty">No matches</p>';
      return;
    }

    groups.forEach(function (g) {
      rowsByItem[g.item] = g.rows;
    });

    sectionsEl.innerHTML = groups.map(function (g) {
      const forceOpen = !!q || openItems[g.item];
      const bodyInner = forceOpen ? getBodyHtml(g.item, g.rows) : '';
      const spec = L.specPdfUrl(g.item);
      return '<section class="item-section' + (forceOpen ? ' open' : '') + '" data-item="' + escapeHtml(g.item) + '">' +
        '<div class="item-header-row" style="display:flex;align-items:stretch">' +
          '<button type="button" class="item-header" aria-expanded="' + (forceOpen ? 'true' : 'false') + '">' +
            '<span class="item-id">Item ' + escapeHtml(g.item) + '</span>' +
            '<span class="item-count">' + g.rows.length + '</span>' +
          '</button>' +
          '<a class="spec-link" href="' + escapeHtml(spec) + '" target="_blank" rel="noopener noreferrer">Spec</a>' +
        '</div>' +
        '<div class="item-body"' + (forceOpen ? ' data-filled="1"' : '') + '>' + bodyInner + '</div>' +
      '</section>';
    }).join('');
  }

  function onSearch() {
    render(L.filterRows(allRows, search.value));
  }

  function maybeRender() {
    if (allRows.length) onSearch();
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
    if (open) {
      openItems[item] = true;
      ensureBodyFilled(section);
    } else {
      delete openItems[item];
    }
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
      maybeRender();
    })
    .catch(function (err) {
      metaLine.textContent = 'Could not load prices.json';
      console.error(err);
    });

  fetch('./detail-map.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      detailMap = data;
      maybeRender();
    })
    .catch(function () {
      detailMap = null;
    });

  search.addEventListener('input', onSearch);
})();
