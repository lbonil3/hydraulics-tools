(function (root) {
  function resolvePrice(row) {
    const hn = Number(row.houston_n) || 0;
    const sn = Number(row.statewide_n) || 0;
    if (hn > 0 && row.houston_avg != null && !Number.isNaN(Number(row.houston_avg))) {
      return { price: Number(row.houston_avg), n: hn, source: 'Houston' };
    }
    if (sn > 0 && row.statewide_avg != null && !Number.isNaN(Number(row.statewide_avg))) {
      return { price: Number(row.statewide_avg), n: sn, source: 'Statewide' };
    }
    return { price: null, n: null, source: null };
  }

  function filterRows(rows, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return rows.slice();
    return rows.filter(function (r) {
      const code = String(r.bid_code || '').toLowerCase();
      const desc = String(r.description || '').toLowerCase();
      return code.indexOf(q) !== -1 || desc.indexOf(q) !== -1;
    });
  }

  function formatMoney(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function itemFromBidCode(bidCode) {
    const m = String(bidCode || '').match(/^(\d{3})/);
    return m ? m[1] : null;
  }

  function groupByItem(rows) {
    const map = Object.create(null);
    (rows || []).forEach(function (r) {
      const item = itemFromBidCode(r.bid_code);
      if (!item) return;
      if (!map[item]) map[item] = [];
      map[item].push(r);
    });
    return Object.keys(map)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (item) { return { item: item, rows: map[item] }; });
  }

  function specPdfUrl(item) {
    return 'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s' +
      String(item) + '.pdf';
  }

  function barPercents(houstonAvg, statewideAvg) {
    const h = houstonAvg == null || Number.isNaN(Number(houstonAvg)) ? null : Number(houstonAvg);
    const s = statewideAvg == null || Number.isNaN(Number(statewideAvg)) ? null : Number(statewideAvg);
    const max = Math.max(h == null ? 0 : h, s == null ? 0 : s);
    if (max <= 0) return { houston: 0, statewide: 0 };
    return {
      houston: h == null ? 0 : Math.round((h / max) * 100),
      statewide: s == null ? 0 : Math.round((s / max) * 100)
    };
  }

  const api = {
    resolvePrice: resolvePrice,
    filterRows: filterRows,
    formatMoney: formatMoney,
    itemFromBidCode: itemFromBidCode,
    groupByItem: groupByItem,
    specPdfUrl: specPdfUrl,
    barPercents: barPercents
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BidCostLookup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
