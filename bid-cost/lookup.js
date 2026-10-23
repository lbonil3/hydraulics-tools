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

  const api = { resolvePrice: resolvePrice, filterRows: filterRows, formatMoney: formatMoney };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BidCostLookup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
