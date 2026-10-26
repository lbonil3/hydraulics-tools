(function () {
  const L = window.BidCostLookup;
  const sectionsEl = document.getElementById('sections');
  const search = document.getElementById('search');
  const count = document.getElementById('count');
  const metaLine = document.getElementById('metaLine');
  let allRows = [];
  let detailMap = null;
  let itemInfo = null;
  let exampleCatalog = null;
  let exampleSamples = null;
  const openItems = Object.create(null); // item -> true when user toggled open
  const bodyCache = Object.create(null); // item -> { sig, html }
  let rowsByItem = Object.create(null); // item -> rows for current filter
  let openExample = null; // { code, unit, desc } while the shared sheet is open
  let exampleReturnFocus = null;
  const exampleSheet = document.getElementById('exampleSheet');
  const examplePanel = document.getElementById('examplePanel');
  const exampleTitle = document.getElementById('exampleSheetTitle');
  const exampleClose = exampleSheet ? exampleSheet.querySelector('.example-close') : null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function rowHtml(r) {
    const x = L.resolvePrice(r);
    if (x.price == null) return '';
    const bars = L.barPercents(r.houston_avg, r.statewide_avg);
    const d = L.detailOrSpec(detailMap, r.bid_code);
    let detailCell = '';
    if (d && d.kind === 'spec') {
      detailCell = '<a class="detail-link spec-link" href="' + escapeHtml(d.url) +
        '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(d.title) + '">Spec</a>';
    } else if (d) {
      detailCell = '<a class="detail-link" href="' + escapeHtml(d.url) +
        '" target="_blank" rel="noopener noreferrer" title="' +
        escapeHtml(d.source + ' · ' + d.label + (/\(assumed\)$/.test(d.label) ? ' · assumed sheet, verify type' : '')) + '">' + escapeHtml(d.label) + '</a>';
    }
    if (L.resolveExample(exampleCatalog, r.bid_code, r.description)) {
      detailCell = '<span class="detail-actions">' + detailCell +
        '<button type="button" class="example-toggle" aria-expanded="false" aria-haspopup="dialog" aria-controls="exampleSheetDialog" data-code="' +
        escapeHtml(r.bid_code) + '" data-unit="' + escapeHtml(r.unit || '') +
        '" data-desc="' + escapeHtml(r.description || '') + '" aria-label="Example of ' + escapeHtml(r.bid_code) +
        '">Example</button></span>';
    }
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
    return (detailMap ? '1' : '0') + (exampleCatalog ? 'e' : '_') + (exampleSamples ? 's' : '_') +
      '\0' + rows.map(function (r) { return r.bid_code; }).join('\0');
  }

  function fillExample(code, unit, desc) {
    const ex = L.resolveExample(exampleCatalog, code, desc);
    if (!ex || !examplePanel) return false;
    const stat = exampleSamples && exampleSamples.by_code ? exampleSamples.by_code[code] : null;
    examplePanel.innerHTML = L.examplePanelHtml(ex, unit, L.sampleFacts(stat));
    if (exampleTitle) exampleTitle.textContent = 'Example · ' + code;
    return true;
  }

  function setExampleExpanded(code) {
    const buttons = sectionsEl.querySelectorAll('.example-toggle');
    for (let i = 0; i < buttons.length; i++) {
      const on = !!code && buttons[i].getAttribute('data-code') === code;
      buttons[i].setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  }

  function closeExample() {
    if (!exampleSheet || exampleSheet.hidden) {
      openExample = null;
      return;
    }
    exampleSheet.hidden = true;
    document.body.classList.remove('example-open');
    openExample = null;
    setExampleExpanded(null);
    const back = exampleReturnFocus;
    exampleReturnFocus = null;
    if (back && document.contains(back)) back.focus();
  }

  function openExampleFromButton(btn) {
    const code = btn.getAttribute('data-code');
    const unit = btn.getAttribute('data-unit') || '';
    const desc = btn.getAttribute('data-desc') || '';
    if (openExample && openExample.code === code && exampleSheet && !exampleSheet.hidden) {
      exampleReturnFocus = btn;
      closeExample();
      return;
    }
    if (!fillExample(code, unit, desc)) return;
    openExample = { code: code, unit: unit, desc: desc };
    exampleReturnFocus = btn;
    exampleSheet.hidden = false;
    document.body.classList.add('example-open');
    setExampleExpanded(code);
    if (exampleClose) exampleClose.focus();
  }

  function syncOpenExample(rows) {
    if (!openExample) return;
    const still = rows.some(function (r) { return r.bid_code === openExample.code; });
    if (!still) {
      closeExample();
      return;
    }
    fillExample(openExample.code, openExample.unit, openExample.desc);
    setExampleExpanded(openExample.code);
  }

  function tableHtml(rows) {
    return '<table><thead><tr>' +
      '<th>Bid code</th><th>Description</th><th>Unit</th><th>Avg</th><th>n</th><th>Source</th><th>Detail</th><th>H / SW</th>' +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return rowHtml(r);
      }).join('') + '</tbody></table>';
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
    if (openExample) setExampleExpanded(openExample.code);
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
      syncOpenExample(withPrice);
      return;
    }

    groups.forEach(function (g) {
      rowsByItem[g.item] = g.rows;
    });

    sectionsEl.innerHTML = groups.map(function (g) {
      const forceOpen = !!q || openItems[g.item];
      const bodyInner = forceOpen ? getBodyHtml(g.item, g.rows) : '';
      const info = itemInfo && itemInfo.items ? itemInfo.items[g.item] : null;
      const spec = L.hasSpecPdf(g.item) ? L.specPdfUrl(g.item) : null;
      return '<section class="item-section' + (forceOpen ? ' open' : '') + '" data-item="' + escapeHtml(g.item) + '">' +
        '<div class="item-header-row" style="display:flex;align-items:stretch">' +
          '<button type="button" class="item-header" aria-expanded="' + (forceOpen ? 'true' : 'false') + '">' +
            '<span class="item-text">' +
              '<span class="item-id">' + escapeHtml(g.item) + (info ? ' · ' + escapeHtml(info.title) : '') + '</span>' +
              (info && info.summary ? '<span class="item-summary' + (info.source === 'bid-data' ? ' item-summary-data' : '') + '">' + escapeHtml(info.summary) + '</span>' : '') +
            '</span>' +
            '<span class="item-count">' + g.rows.length + '</span>' +
          '</button>' +
          (spec ? '<a class="spec-link" href="' + escapeHtml(spec) + '" target="_blank" rel="noopener noreferrer">Spec</a>' : '') +
        '</div>' +
        '<div class="item-body"' + (forceOpen ? ' data-filled="1"' : '') + '>' + bodyInner + '</div>' +
      '</section>';
    }).join('');
    syncOpenExample(withPrice);
  }

  function onSearch() {
    render(L.filterRows(allRows, search.value, itemInfo));
  }

  function maybeRender() {
    if (allRows.length) onSearch();
  }

  sectionsEl.addEventListener('click', function (ev) {
    const exBtn = ev.target.closest('.example-toggle');
    if (exBtn) {
      openExampleFromButton(exBtn);
      return;
    }
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

  fetch('./item-info.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      itemInfo = data;
      maybeRender();
    })
    .catch(function () {
      itemInfo = null;
    });

  fetch('./code-examples.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      exampleCatalog = data && data.rules ? data : null;
      maybeRender();
    })
    .catch(function () {
      exampleCatalog = null;
    });

  fetch('./code-example-samples.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      exampleSamples = data && data.by_code ? data : null;
      maybeRender();
    })
    .catch(function () {
      exampleSamples = null;
    });

  if (exampleSheet) {
    exampleSheet.addEventListener('click', function (ev) {
      if (ev.target.closest('.example-close') || ev.target.closest('.example-backdrop')) closeExample();
    });
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || !exampleSheet || exampleSheet.hidden) return;
    ev.preventDefault();
    closeExample();
  });

  search.addEventListener('input', onSearch);
})();
