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

  /** itemInfo (optional): item-info.json; also matches Item title/summary. */
  function filterRows(rows, query, itemInfo) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return rows.slice();
    const items = (itemInfo && itemInfo.items) || null;
    const itemHit = Object.create(null);
    return rows.filter(function (r) {
      const code = String(r.bid_code || '').toLowerCase();
      const desc = String(r.description || '').toLowerCase();
      if (code.indexOf(q) !== -1 || desc.indexOf(q) !== -1) return true;
      if (!items) return false;
      const it = itemFromBidCode(r.bid_code);
      if (!(it in itemHit)) {
        const e = items[it];
        itemHit[it] = !!e && ((e.title || '') + ' ' + (e.summary || '')).toLowerCase().indexOf(q) !== -1;
      }
      return itemHit[it];
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

  function resolveDetail(map, bidCode) {
    if (!map || !map.by_code) return null;
    const entry = map.by_code[String(bidCode || '')];
    if (!entry) return null;
    const hou = entry.houston_url && String(entry.houston_url).trim();
    const sw = entry.statewide_url && String(entry.statewide_url).trim();
    const label = (entry.label && String(entry.label).trim()) || 'Detail';
    if (hou) return { url: hou, source: 'Houston', label: label };
    if (sw) return { url: sw, source: 'Statewide', label: label };
    return null;
  }
  /**
   * Items with a 2024 standard spec PDF listed in the official directory
   * https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/ (accessed 2026-10-23).
   * 8xx and other non-listed Items are excluded (no verified spec URL).
   */
  const SPEC_ITEMS = new Set('001 002 003 004 005 006 007 008 009 010 100 103 104 105 106 110 112 132 134 150 152 154 156 158 160 161 162 164 166 168 169 170 180 192 193 194 204 210 216 247 250 251 260 275 276 290 291 292 295 300 301 302 305 310 314 315 316 320 330 334 341 342 344 346 347 348 350 351 354 356 358 360 361 400 401 402 403 404 405 406 407 409 410 411 416 419 420 421 422 423 424 425 426 427 429 431 432 434 438 439 440 441 442 445 446 447 448 449 450 451 454 458 459 460 462 464 465 466 467 468 471 472 474 476 479 480 481 483 490 491 492 495 496 499 500 502 503 504 505 506 508 510 512 514 520 527 528 529 530 531 533 536 538 540 542 543 544 545 550 552 556 560 585 610 613 614 616 617 618 619 620 621 623 624 625 627 628 636 644 647 650 654 656 658 662 666 667 668 672 677 678 680 681 682 684 685 686 687 688 690 700 712 713 720 721 730 731 734 735 738 740 745 751 752 760 764 770 771 772 774 776 777 778 780 784 785 786 787 788 790'.split(' '));

  function hasSpecPdf(item) {
    return SPEC_ITEMS.has(String(item || ''));
  }

  /** Sheet if mapped, else Item spec PDF (if verified), else null. */
  function detailOrSpec(map, bidCode) {
    const d = resolveDetail(map, bidCode);
    if (d) return Object.assign({ kind: 'sheet' }, d);
    const item = String(bidCode || '').slice(0, 3);
    if (!/^\d{3}$/.test(item) || !hasSpecPdf(item)) return null;
    return {
      kind: 'spec',
      url: specPdfUrl(item),
      source: 'Spec',
      label: 'Spec',
      title: 'No standard sheet; spec only'
    };
  }

  /**
   * Example links (photo, plan sheet, past project, figure, bid tab).
   * by_code is the bid-code row; by_item is the item header. No inheritance:
   * a code with no entry shows nothing even when its item has examples.
   */
  const EXAMPLE_TYPES = {
    Photo: 1,
    'Past project': 1,
    'Plan sheet': 1,
    Figure: 1,
    'Bid tab': 1
  };

  function normalizeExample(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const type = String(entry.type || '').trim();
    const url = String(entry.url || '').trim();
    const title = String(entry.title || '').trim();
    if (!EXAMPLE_TYPES[type]) return null;
    if (!/^https:\/\//.test(url)) return null;
    if (!title) return null;
    const label = String(entry.label || '').trim() || type;
    if (label !== type && label.indexOf(type) !== 0) return null;
    return { type: type, url: url, title: title, label: label };
  }

  function exampleList(map, bucket, key) {
    if (!map || !map[bucket] || key == null || key === '') return [];
    const raw = map[bucket][String(key)];
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach(function (entry) {
      const n = normalizeExample(entry);
      if (n) out.push(n);
    });
    return out;
  }

  /** Code-row examples. Missing map, missing code, or no valid links → []. */
  function resolveExamples(map, bidCode) {
    return exampleList(map, 'by_code', bidCode);
  }

  /** Item-header examples. Missing map or item → []. */
  function resolveItemExamples(map, item) {
    return exampleList(map, 'by_item', item);
  }

  const api = {
    resolveDetail: resolveDetail,
    detailOrSpec: detailOrSpec,
    hasSpecPdf: hasSpecPdf,
    resolveExamples: resolveExamples,
    resolveItemExamples: resolveItemExamples,

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
