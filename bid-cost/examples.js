/**
 * In-tool examples for drainage bid codes.
 * Diagrams are inline SVG. Payment notes follow the TxDOT 2024 spec items.
 * Prices shown with an example are aggregate columns from the CSV extracts,
 * not individual projects. See code-examples.json meta.extend.
 */
(function (root) {
  const L = root.BidCostLookup;
  if (!L) return;

  const FONT = 'font-family="system-ui,sans-serif"';
  const SAMPLE_GAP = 'This extract has no project name, county, per-bid quantity, or per-bid letting date. ' +
    'Dates, when shown, are the letting window for the whole file (data/_meta.json), and quantity is the total quantity behind that average, not one bid. ' +
    'build-prices.js keeps a single average per code; min, median, and max are the other columns already in the Houston or statewide CSV. ' +
    'To show real bid lines, keep project_name or project_id, county, bid_item_quantity, and project_actual_let_date on each rank-1 row before averaging.';

  function xml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function asList(value) {
    if (!value) return null;
    return Array.isArray(value) ? value : [value];
  }

  function hasAll(desc, value) {
    const list = asList(value);
    if (!list) return true;
    return list.every(function (w) { return desc.indexOf(String(w).toUpperCase()) !== -1; });
  }

  function hasAny(desc, value) {
    const list = asList(value);
    if (!list) return false;
    return list.some(function (w) { return desc.indexOf(String(w).toUpperCase()) !== -1; });
  }

  function ruleOk(rule) {
    return !!(rule && rule.diagram && rule.unit_how && Array.isArray(rule.included) && Array.isArray(rule.separate));
  }

  function resolveExample(catalog, bidCode, description) {
    if (!catalog || !Array.isArray(catalog.rules)) return null;
    const m = String(bidCode || '').match(/^(\d{3})-/);
    const item = m ? m[1] : null;
    if (!item) return null;
    const desc = String(description || '').toUpperCase();
    for (let i = 0; i < catalog.rules.length; i++) {
      const rule = catalog.rules[i];
      if (String(rule.item) !== item) continue;
      if (!ruleOk(rule)) continue;
      if (!hasAll(desc, rule.when)) continue;
      if (rule.when_any && !hasAny(desc, rule.when_any)) continue;
      if (rule.unless && hasAny(desc, rule.unless)) continue;
      return {
        id: rule.id || String(rule.item),
        item: item,
        diagram: rule.diagram,
        unit_how: rule.unit_how,
        included: rule.included.slice(),
        separate: rule.separate.slice(),
        spec: rule.spec || ''
      };
    }
    return null;
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  function fact(stat, label, price) {
    return {
      label: label,
      price: price,
      project: null,
      county: null,
      bid_qty: null,
      total_qty: num(stat.total_qty),
      unit: stat.unit || '',
      n: Number(stat.n),
      geography: stat.side || null,
      let_date_min: stat.let_date_min || null,
      let_date_max: stat.let_date_max || null,
      let_scope: 'dataset'
    };
  }

  function sampleFacts(stat) {
    if (!stat || !(Number(stat.n) > 0)) return { lines: [], gap: SAMPLE_GAP };
    const n = Number(stat.n);
    const min = num(stat.min);
    const med = num(stat.median);
    const max = num(stat.max);
    if (min == null) return { lines: [], gap: SAMPLE_GAP };
    if (n === 1 || (min === med && med === max)) {
      return {
        lines: [fact(stat, n === 1 ? 'Only low-bid unit price in this extract' : 'Low-bid unit prices in this extract are the same', min)],
        gap: SAMPLE_GAP
      };
    }
    if (n === 2) {
      return {
        lines: [
          fact(stat, 'Lower of the two low-bid unit prices', min),
          fact(stat, 'Higher of the two low-bid unit prices', max)
        ],
        gap: SAMPLE_GAP
      };
    }
    const lines = [];
    if (min != null) lines.push(fact(stat, 'Lowest low-bid unit price', min));
    if (med != null) lines.push(fact(stat, 'Median low-bid unit price', med));
    if (max != null) lines.push(fact(stat, 'Highest low-bid unit price', max));
    return { lines: lines.slice(0, 3), gap: SAMPLE_GAP };
  }

  function tx(x, y, s, fill, size) {
    return '<text x="' + x + '" y="' + y + '" ' + FONT + ' font-size="' + (size || 12) + '" fill="' + (fill || '#1d2733') + '">' + xml(s) + '</text>';
  }

  function frame(unit, title, body, showSeparate) {
    return '<svg viewBox="0 0 360 210" role="img">' +
      '<title>' + xml(title) + '</title>' +
      '<rect width="360" height="210" fill="#f4f7fb"/>' +
      tx(12, 22, 'Unit: ' + (unit || '—'), '#1f4e79', 14).replace('font-size="14"', 'font-size="14" font-weight="700"') +
      body +
      '<line x1="16" y1="188" x2="344" y2="188" stroke="#d5dce5"/>' +
      tx(12, 204, 'Shaded = this price', '#1f4e79', 11) +
      (showSeparate ? tx(168, 204, 'Dashed = other item', '#8a5a00', 11) : '') +
      '</svg>';
  }

  function ground() {
    return '<line x1="24" y1="162" x2="336" y2="162" stroke="#6b7c8a" stroke-width="2"/>';
  }

  function pipeShape(dashed) {
    const style = dashed
      ? 'fill="none" stroke="#c47b12" stroke-dasharray="4 3"'
      : 'fill="#c5d8ee" stroke="#1f4e79"';
    return '<circle cx="180" cy="136" r="22" ' + style + ' stroke-width="3"/>';
  }

  function trench(dashed) {
    const style = dashed
      ? 'fill="none" stroke="#c47b12" stroke-dasharray="5 4"'
      : 'fill="#c5d8ee" stroke="#1f4e79"';
    return '<path d="M84 162 L124 96 L246 96 L286 162 Z" ' + style + ' stroke-width="2"/>';
  }

  const DRAW = {
    rcp: function (unit) {
      return frame(unit, 'Round concrete pipe. The pipe is this price. The trench is another item.',
        trench(true) + tx(118, 88, 'trench is Item 400', '#8a5a00', 11) +
        pipeShape(false) + tx(164, 140, 'pipe', '#1f4e79', 12) + ground(), true);
    },
    cmp: function (unit) {
      return frame(unit, 'Corrugated metal pipe. The pipe is this price. The trench is another item.',
        trench(true) + tx(118, 88, 'trench is Item 400', '#8a5a00', 11) +
        '<ellipse cx="180" cy="136" rx="28" ry="18" fill="#c5d8ee" stroke="#1f4e79" stroke-width="3"/>' +
        '<path d="M160 136 l6 -6 l6 6 l6 -6 l6 6 l6 -6" fill="none" stroke="#1f4e79" stroke-width="1.5"/>' +
        tx(158, 118, 'CMP', '#1f4e79', 12) + ground(), true);
    },
    thermo: function (unit) {
      return frame(unit, 'Thermoplastic pipe. The pipe is this price. The trench is another item.',
        trench(true) + tx(118, 88, 'trench is Item 400', '#8a5a00', 11) +
        '<rect x="150" y="122" width="60" height="28" rx="10" fill="#c5d8ee" stroke="#1f4e79" stroke-width="3"/>' +
        tx(158, 141, 'pipe', '#1f4e79', 12) + ground(), true);
    },
    box: function (unit) {
      return frame(unit, 'Concrete box culvert. The box is this price. The trench is another item.',
        trench(true) + tx(118, 88, 'trench is Item 400', '#8a5a00', 11) +
        '<rect x="132" y="112" width="96" height="40" fill="#c5d8ee" stroke="#1f4e79" stroke-width="3"/>' +
        '<line x1="180" y1="112" x2="180" y2="152" stroke="#1f4e79"/>' +
        tx(158, 136, 'box', '#1f4e79', 12) + ground(), true);
    },
    'drain-pipe': function (unit) {
      return frame(unit, 'Drain pipe. Excavation and backfill are included in this price.',
        trench(false) + pipeShape(false) + tx(150, 88, 'trench included', '#1f4e79', 11) + ground(), false);
    },
    'struct-ex-pipe': function (unit) {
      return frame(unit, 'Structural excavation around a pipe. The trench is this price. The pipe is another item.',
        trench(false) + pipeShape(true) + tx(150, 88, 'this CY', '#1f4e79', 12) +
        tx(158, 140, 'pipe', '#8a5a00', 11) + ground(), true);
    },
    'struct-ex-box': function (unit) {
      return frame(unit, 'Structural excavation around a box. The trench is this price. The box is another item.',
        trench(false) +
        '<rect x="140" y="116" width="80" height="32" fill="none" stroke="#c47b12" stroke-width="2" stroke-dasharray="4 3"/>' +
        tx(150, 88, 'this CY', '#1f4e79', 12) + tx(164, 136, 'box', '#8a5a00', 11) + ground(), true);
    },
    'struct-ex-bridge': function (unit) {
      return frame(unit, 'Structural excavation at a bridge footing. The pit is this price.',
        '<path d="M120 162 L140 108 L230 108 L250 162 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<rect x="150" y="78" width="70" height="30" fill="none" stroke="#c47b12" stroke-width="2" stroke-dasharray="4 3"/>' +
        tx(156, 98, 'footing', '#8a5a00', 11) + tx(156, 140, 'this CY', '#1f4e79', 12) + ground(), true);
    },
    'struct-ex': function (unit) {
      return frame(unit, 'Structural excavation. The pit is this price.',
        '<path d="M110 162 L140 100 L230 100 L260 162 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(150, 136, 'this CY', '#1f4e79', 12) + ground(), false);
    },
    'cement-bkfl': function (unit) {
      return frame(unit, 'Cement-stabilized backfill around a structure.',
        trench(true) +
        '<path d="M124 150 L150 118 L210 118 L236 150 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        pipeShape(true) + tx(128, 88, 'stabilized fill', '#1f4e79', 12) + ground(), true);
    },
    'cut-pav': function (unit) {
      return frame(unit, 'Cut and restore pavement. The patch is this price.',
        '<rect x="40" y="118" width="280" height="28" fill="#d9dee5" stroke="#6b7c8a"/>' +
        '<rect x="130" y="112" width="100" height="40" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(152, 136, 'patch SY', '#1f4e79', 12) +
        '<path d="M150 152 L170 170 L210 170 L230 152" fill="none" stroke="#c47b12" stroke-dasharray="4 3"/>' +
        tx(148, 184, 'earth below is structural excavation', '#8a5a00', 11), true);
    },
    'backfill-other': function (unit) {
      return frame(unit, 'Special backfill bid under Item 400.',
        trench(true) +
        '<path d="M124 158 L150 120 L220 120 L246 158 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(142, 144, 'this fill', '#1f4e79', 12) + ground(), true);
    },
    'trench-protect': function (unit) {
      return frame(unit, 'Trench excavation protection along a pipe trench.',
        trench(true) + pipeShape(true) +
        '<rect x="126" y="100" width="12" height="62" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<rect x="222" y="100" width="12" height="62" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<line x1="132" y1="112" x2="222" y2="112" stroke="#1f4e79" stroke-width="3"/>' +
        tx(108, 84, 'shield, paid by the foot', '#1f4e79', 12) + ground(), true);
    },
    shoring: function (unit) {
      return frame(unit, 'Temporary special shoring. The face area is this price.',
        '<rect x="150" y="70" width="16" height="92" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M166 78 L230 110 L230 162 L166 162" fill="#e7eef6" stroke="#6b7c8a"/>' +
        tx(176, 100, 'this SF', '#1f4e79', 12) +
        tx(40, 120, 'ground held back', '#556', 11) + ground(), false);
    },
    'riprap-stone': function (unit) {
      return frame(unit, 'Stone riprap on a slope, paid by the cubic yard in place.',
        '<path d="M40 150 L150 78 L300 78 L300 150 Z" fill="#e7eef6" stroke="#6b7c8a"/>' +
        '<circle cx="90" cy="136" r="10" fill="#c5d8ee" stroke="#1f4e79"/><circle cx="118" cy="118" r="11" fill="#c5d8ee" stroke="#1f4e79"/>' +
        '<circle cx="148" cy="102" r="10" fill="#c5d8ee" stroke="#1f4e79"/><circle cx="176" cy="90" r="9" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(200, 120, 'stone CY', '#1f4e79', 12) + ground(), false);
    },
    'riprap-conc': function (unit) {
      return frame(unit, 'Concrete riprap on a slope, paid by the cubic yard in place.',
        '<path d="M48 150 L160 84 L310 84 L250 150 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(150, 128, 'concrete CY', '#1f4e79', 12) + ground(), false);
    },
    'riprap-bed': function (unit) {
      return frame(unit, 'Bedding under stone riprap. The bedding layer is this price.',
        '<path d="M50 128 L170 78 L300 78 L220 128 Z" fill="none" stroke="#c47b12" stroke-dasharray="4 3"/>' +
        '<path d="M50 150 L170 128 L300 128 L250 150 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(188, 100, 'riprap cover', '#8a5a00', 11) + tx(150, 146, 'bedding CY', '#1f4e79', 12) + ground(), true);
    },
    'riprap-mow': function (unit) {
      return frame(unit, 'Concrete mow strip, paid by the cubic yard in place.',
        '<rect x="70" y="128" width="210" height="22" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(120, 144, 'mow strip CY', '#1f4e79', 12) + ground(), false);
    },
    'riprap-flume': function (unit) {
      return frame(unit, 'Concrete riprap flume, paid by the cubic yard in place.',
        '<path d="M70 70 L120 150 L250 150 L290 70" fill="none" stroke="#1f4e79" stroke-width="8"/>' +
        '<path d="M90 78 L128 142 L240 142 L274 78 Z" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(140, 120, 'flume CY', '#1f4e79', 12) + ground(), false);
    },
    gabion: function (unit) {
      return frame(unit, 'Stone-filled gabion basket.',
        '<rect x="110" y="100" width="140" height="58" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M110 100 h140 M110 120 h140 M110 140 h140 M140 100 v58 M180 100 v58 M220 100 v58" fill="none" stroke="#1f4e79"/>' +
        tx(146, 90, 'basket CY', '#1f4e79', 12) + ground(), false);
    },
    'gabion-mat': function (unit) {
      return frame(unit, 'Gabion mattress on a slope.',
        '<path d="M40 150 L150 90 L320 90 L250 150 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M80 140 L160 100 M120 146 L190 102 M160 150 L230 104" fill="none" stroke="#1f4e79"/>' +
        tx(180, 130, 'mattress', '#1f4e79', 12) + ground(), false);
    },
    inlet: function (unit) {
      return frame(unit, 'Curb inlet, paid by each complete inlet or stage.',
        '<rect x="40" y="96" width="200" height="18" fill="#d9dee5"/>' +
        '<rect x="150" y="80" width="28" height="40" fill="#9aa8b5"/>' +
        '<rect x="168" y="114" width="90" height="48" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M178 114 h70 M188 114 v10 M208 114 v10 M228 114 v10" stroke="#1f4e79" fill="none"/>' +
        tx(176, 144, 'inlet EA', '#1f4e79', 12) + ground(), false);
    },
    manhole: function (unit) {
      return frame(unit, 'Manhole, paid by each complete manhole or stage.',
        '<rect x="150" y="88" width="60" height="14" rx="6" fill="#9aa8b5" stroke="#1f4e79"/>' +
        '<rect x="160" y="102" width="40" height="58" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(150, 78, 'manhole EA', '#1f4e79', 12) + ground(), false);
    },
    junction: function (unit) {
      return frame(unit, 'Junction box, paid by each.',
        '<rect x="120" y="96" width="120" height="64" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M40 120 h80 M240 120 h80 M180 96 v-20" fill="none" stroke="#c47b12" stroke-width="4" stroke-dasharray="0"/>' +
        '<line x1="40" y1="120" x2="120" y2="120" stroke="#c47b12" stroke-width="6" stroke-dasharray="6 4"/>' +
        '<line x1="240" y1="136" x2="320" y2="136" stroke="#c47b12" stroke-width="6" stroke-dasharray="6 4"/>' +
        tx(142, 132, 'box EA', '#1f4e79', 12) + tx(40, 112, 'pipes', '#8a5a00', 11) + ground(), true);
    },
    headwall: function (unit) {
      return frame(unit, 'Headwall at the end of a pipe, paid by each end.',
        pipeShape(true) +
        '<rect x="168" y="100" width="22" height="62" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(198, 120, 'headwall EA', '#1f4e79', 12) + tx(120, 112, 'pipe', '#8a5a00', 11) + ground(), true);
    },
    wingwall: function (unit) {
      return frame(unit, 'Wingwalls at the end of a culvert, paid by each end in this extract.',
        '<rect x="150" y="118" width="70" height="36" fill="none" stroke="#c47b12" stroke-dasharray="4 3"/>' +
        '<path d="M150 118 L90 150 L110 162 L168 130 Z" fill="#c5d8ee" stroke="#1f4e79"/>' +
        '<path d="M220 118 L280 150 L260 162 L202 130 Z" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(118, 100, 'wings EA', '#1f4e79', 12) + tx(162, 140, 'barrel', '#8a5a00', 11) + ground(), true);
    },
    set: function (unit) {
      return frame(unit, 'Safety end treatment. The sloped end is this price.',
        '<rect x="36" y="124" width="70" height="22" fill="none" stroke="#c47b12" stroke-dasharray="4 3"/>' +
        '<path d="M100 110 L210 162 L100 162 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<line x1="130" y1="140" x2="168" y2="156" stroke="#1f4e79"/><line x1="146" y1="132" x2="184" y2="150" stroke="#1f4e79"/>' +
        tx(40, 116, 'pipe', '#8a5a00', 11) + tx(214, 140, 'SET EA', '#1f4e79', 12) + ground(), true);
    },
    runners: function (unit) {
      return frame(unit, 'Pipe runners across an existing pipe end.',
        '<ellipse cx="170" cy="120" rx="36" ry="28" fill="none" stroke="#c47b12" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<line x1="146" y1="108" x2="194" y2="108" stroke="#1f4e79" stroke-width="4"/>' +
        '<line x1="140" y1="120" x2="200" y2="120" stroke="#1f4e79" stroke-width="4"/>' +
        '<line x1="146" y1="132" x2="194" y2="132" stroke="#1f4e79" stroke-width="4"/>' +
        tx(40, 120, 'pipe end', '#8a5a00', 11) + tx(214, 124, 'runners EA', '#1f4e79', 12) + ground(), true);
    },
    grate: function (unit) {
      return frame(unit, 'Frame and grate only, when it is not part of a complete inlet.',
        '<rect x="110" y="108" width="80" height="50" fill="none" stroke="#c47b12" stroke-dasharray="4 3"/>' +
        '<rect x="124" y="96" width="110" height="28" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M140 96 v28 M160 96 v28 M180 96 v28 M200 96 v28" stroke="#1f4e79"/>' +
        tx(124, 88, 'grate EA', '#1f4e79', 12) + tx(200, 140, 'inlet box', '#8a5a00', 11) + ground(), true);
    },
    relay: function (unit) {
      return frame(unit, 'Remove a pipe and re-lay it. The re-laid pipe is this price. The new trench bedding is another item.',
        '<circle cx="90" cy="120" r="16" fill="none" stroke="#c47b12" stroke-dasharray="3 3"/>' +
        '<path d="M112 120 H150" stroke="#1f4e79" marker-end=""/>' +
        '<line x1="120" y1="120" x2="155" y2="120" stroke="#1f4e79" stroke-width="2"/>' +
        '<polygon points="155,114 168,120 155,126" fill="#1f4e79"/>' +
        '<circle cx="210" cy="136" r="20" fill="#c5d8ee" stroke="#1f4e79" stroke-width="3"/>' +
        tx(40, 100, 'old location', '#8a5a00', 11) + tx(176, 112, 're-laid LF', '#1f4e79', 12) + ground(), true);
    },
    'trench-drain': function (unit) {
      return frame(unit, 'Trench drain. The drain, grate, and its excavation are this price.',
        '<rect x="40" y="108" width="280" height="16" fill="#d9dee5"/>' +
        '<rect x="150" y="100" width="70" height="48" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M160 100 h50 M168 100 v12 M184 100 v12 M200 100 v12" stroke="#1f4e79"/>' +
        tx(158, 140, 'drain LF', '#1f4e79', 12) + ground(), false);
    },
    'slot-drain': function (unit) {
      return frame(unit, 'Slotted drain along the pavement.',
        '<rect x="40" y="120" width="280" height="20" fill="#d9dee5"/>' +
        '<rect x="70" y="126" width="220" height="6" fill="#c5d8ee" stroke="#1f4e79"/>' +
        '<circle cx="180" cy="148" r="12" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(120, 112, 'slot LF', '#1f4e79', 12) + ground(), false);
    },
    'jack-pipe': function (unit) {
      return frame(unit, 'Pipe jacked, bored, or tunneled. Excavation for that run is included.',
        '<rect x="40" y="70" width="280" height="36" fill="#d9dee5"/>' +
        tx(150, 92, 'road', '#556', 11) +
        '<rect x="70" y="128" width="220" height="22" rx="10" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(130, 170, 'jacked pipe LF, trench included', '#1f4e79', 12), false);
    },
    'jack-box': function (unit) {
      return frame(unit, 'Box jacked or tunneled. Excavation for that run is included.',
        '<rect x="40" y="70" width="280" height="36" fill="#d9dee5"/>' +
        '<rect x="80" y="124" width="200" height="32" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(140, 146, 'jacked box LF', '#1f4e79', 12), false);
    },
    adjust: function (unit) {
      return frame(unit, 'Adjust or cap an existing manhole or inlet.',
        '<rect x="155" y="110" width="50" height="52" fill="none" stroke="#c47b12" stroke-dasharray="4 3"/>' +
        '<rect x="148" y="86" width="64" height="18" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M180 86 v-16" stroke="#1f4e79" stroke-width="2"/>' +
        tx(40, 100, 'raise the top', '#1f4e79', 12) + tx(214, 140, 'existing', '#8a5a00', 11) + ground(), true);
    },
    clean: function (unit) {
      return frame(unit, 'Clean an existing culvert. Debris removal is this price.',
        '<rect x="70" y="110" width="180" height="40" fill="none" stroke="#c47b12" stroke-width="3"/>' +
        '<ellipse cx="200" cy="132" rx="22" ry="12" fill="#c5d8ee" stroke="#1f4e79"/>' +
        '<path d="M230 126 l28 -8" stroke="#1f4e79" stroke-width="2"/>' +
        tx(40, 100, 'debris out', '#1f4e79', 12) + tx(78, 134, 'culvert stays', '#8a5a00', 11) + ground(), true);
    },
    remove: function (unit) {
      return frame(unit, 'Remove the drainage structure named on this bid.',
        '<rect x="120" y="100" width="90" height="50" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M130 108 L200 146 M200 108 L130 146" stroke="#1f4e79" stroke-width="2"/>' +
        '<path d="M214 124 h40" stroke="#1f4e79" stroke-width="2"/>' +
        '<polygon points="254,118 270,124 254,130" fill="#1f4e79"/>' +
        tx(40, 90, 'remove, haul, backfill hole', '#1f4e79', 12) + ground(), false);
    },
    'silt-fence': function (unit) {
      return frame(unit, 'Temporary sediment-control fence, paid by the foot.',
        '<line x1="80" y1="150" x2="80" y2="90" stroke="#1f4e79" stroke-width="3"/>' +
        '<line x1="250" y1="150" x2="250" y2="90" stroke="#1f4e79" stroke-width="3"/>' +
        '<path d="M80 96 h170 v40 h-170 Z" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(110, 120, 'fence LF', '#1f4e79', 12) + ground(), false);
    },
    'rock-dam': function (unit) {
      return frame(unit, 'Rock filter dam across a ditch.',
        '<path d="M40 120 L40 162 L320 162 L320 120" fill="#e7eef6" stroke="#6b7c8a"/>' +
        '<path d="M120 162 L160 110 L230 110 L270 162 Z" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(150, 146, 'dam', '#1f4e79', 12) + ground(), false);
    },
    'ec-log': function (unit) {
      return frame(unit, 'Biodegradable erosion-control log, paid by the foot.',
        '<rect x="70" y="128" width="210" height="22" rx="11" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<line x1="100" y1="150" x2="90" y2="168" stroke="#1f4e79"/><line x1="240" y1="150" x2="250" y2="168" stroke="#1f4e79"/>' +
        tx(130, 120, 'log LF', '#1f4e79', 12) + ground(), false);
    },
    sandbag: function (unit) {
      return frame(unit, 'Sandbags for erosion control.',
        '<rect x="80" y="130" width="46" height="22" rx="4" fill="#c5d8ee" stroke="#1f4e79"/>' +
        '<rect x="132" y="118" width="46" height="22" rx="4" fill="#c5d8ee" stroke="#1f4e79"/>' +
        '<rect x="184" y="130" width="46" height="22" rx="4" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(110, 108, 'bags', '#1f4e79', 12) + ground(), false);
    },
    'paved-flume': function (unit) {
      return frame(unit, 'Temporary paved flume, paid by the square yard.',
        '<path d="M80 70 L130 150 L240 150 L280 70" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        tx(130, 120, 'flume SY', '#1f4e79', 12) + ground(), false);
    },
    'con-exit': function (unit) {
      return frame(unit, 'Construction exit, paid by the square yard when it is a bid item.',
        '<rect x="70" y="120" width="200" height="36" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<circle cx="120" cy="112" r="8" fill="none" stroke="#1f4e79"/><circle cx="210" cy="112" r="8" fill="none" stroke="#1f4e79"/>' +
        tx(120, 142, 'exit SY', '#1f4e79', 12) + ground(), false);
    },
    'perim-fence': function (unit) {
      return frame(unit, 'Construction perimeter fence, paid by the foot.',
        '<line x1="60" y1="150" x2="60" y2="80" stroke="#1f4e79" stroke-width="3"/>' +
        '<line x1="160" y1="150" x2="160" y2="80" stroke="#1f4e79" stroke-width="3"/>' +
        '<line x1="260" y1="150" x2="260" y2="80" stroke="#1f4e79" stroke-width="3"/>' +
        '<line x1="60" y1="100" x2="260" y2="100" stroke="#1f4e79"/><line x1="60" y1="120" x2="260" y2="120" stroke="#1f4e79"/>' +
        tx(90, 72, 'perimeter LF', '#1f4e79', 12) + ground(), false);
    },
    'ec-earth': function (unit) {
      return frame(unit, 'Earthwork for erosion and sediment control, paid by the cubic yard.',
        '<path d="M50 150 L110 110 L180 150 Z" fill="#c5d8ee" stroke="#1f4e79"/>' +
        '<path d="M190 150 L250 100 L320 150 Z" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(70, 96, 'excavate or embank CY', '#1f4e79', 12) + ground(), false);
    },
    'ec-hours': function (unit) {
      return frame(unit, 'Equipment hours for erosion and sediment control.',
        '<circle cx="100" cy="120" r="28" fill="#c5d8ee" stroke="#1f4e79" stroke-width="2"/>' +
        '<line x1="100" y1="120" x2="100" y2="102" stroke="#1f4e79" stroke-width="2"/>' +
        '<line x1="100" y1="120" x2="114" y2="128" stroke="#1f4e79" stroke-width="2"/>' +
        '<rect x="160" y="100" width="140" height="40" fill="#c5d8ee" stroke="#1f4e79"/>' +
        tx(176, 126, 'machine HR', '#1f4e79', 12), false);
    },
    unknown: function (unit) {
      return frame(unit, 'No diagram', tx(40, 110, 'No diagram for this code', '#1f4e79', 14), false);
    }
  };

  function exampleSvg(kind, unit) {
    const draw = DRAW[kind] || DRAW.unknown;
    return draw(unit || '—');
  }

  function examplePanelHtml(example, unit, facts) {
    if (!example) return '';
    const gap = (facts && facts.gap) || SAMPLE_GAP;
    const lines = (facts && facts.lines) || [];
    const unitText = unit || '—';
    function items(list) {
      return (list || []).map(function (s) { return '<li>' + xml(s) + '</li>'; }).join('');
    }
    let body = '';
    lines.forEach(function (line) {
      const qty = line.total_qty == null ? '—' : String(line.total_qty) + (line.unit ? ' ' + line.unit : '');
      const letting = line.let_date_min && line.let_date_max
        ? line.let_date_min + ' → ' + line.let_date_max + ' (whole extract)'
        : 'not stored per bid';
      body += '<tr><td>' + xml(line.label) + '</td><td>' + L.formatMoney(line.price) + '</td><td>' +
        xml(line.geography || '—') + '</td><td>' + xml(line.n) + '</td><td>' + xml(qty) + '</td><td>' +
        xml(letting) + '</td></tr>';
    });
    const table = body
      ? '<table class="example-samples"><caption>Prices stored for this code. These are summary prices from the extract, not three projects.</caption><thead><tr>' +
        '<th>What</th><th>Unit price</th><th>Extract</th><th>n</th><th>Total qty</th><th>Letting window</th>' +
        '</tr></thead><tbody>' + body + '</tbody></table>'
      : '<p>No min, median, or max price is stored for this code.</p>';
    return exampleSvg(example.diagram, unitText) +
      '<p><strong>Bid unit: ' + xml(unitText) + '.</strong> ' + xml(example.unit_how) + '</p>' +
      '<p><strong>In this price</strong></p><ul>' + items(example.included) + '</ul>' +
      '<p><strong>Paid separately</strong></p><ul>' + items(example.separate) + '</ul>' +
      (example.spec ? '<p class="example-spec">' + xml(example.spec) + '</p>' : '') +
      table +
      '<p class="example-gap">' + xml(gap) + '</p>' +
      '<p class="example-missing">Project: not in this repo. County: not in this repo. Quantity for one bid: not in this repo.</p>';
  }

  L.resolveExample = resolveExample;
  L.sampleFacts = sampleFacts;
  L.exampleSvg = exampleSvg;
  L.examplePanelHtml = examplePanelHtml;
})(typeof globalThis !== 'undefined' ? globalThis : this);
