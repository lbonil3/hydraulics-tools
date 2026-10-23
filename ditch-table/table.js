(function () {
  const M = window.DitchTableModel;
  const LS_KEY = 'ditch-table-v1';
  const grid = document.getElementById('grid');
  const stormEl = document.getElementById('stormLabel');

  /** @type {ReturnType<typeof M.emptyRow>[]} */
  let rows = [];

  const COLS = [
    { key: 'staFrom', label: 'Sta From', kind: 'in', type: 'text' },
    { key: 'staTo', label: 'Sta To', kind: 'in', type: 'text' },
    { key: 'offFrom', label: 'Off From', kind: 'in', type: 'text' },
    { key: 'offTo', label: 'Off To', kind: 'in', type: 'text' },
    { key: 'flFrom', label: 'FL From', kind: 'in', type: 'number' },
    { key: 'flTo', label: 'FL To', kind: 'in', type: 'number' },
    { key: 'length', label: 'Length', kind: 'in', type: 'number' },
    { key: 'Z1', label: 'Z1', kind: 'in', type: 'number' },
    { key: 'B', label: 'B', kind: 'in', type: 'number' },
    { key: 'Z2', label: 'Z2', kind: 'in', type: 'number' },
    { key: 'gradePct', label: 'Grade %', kind: 'in', type: 'number', field: 'grade' },
    { key: 'Dd', label: 'Dd', kind: 'in', type: 'number' },
    { key: 'topW', label: 'Top W', kind: 'out', fmt: 2 },
    { key: 'n', label: 'n', kind: 'in', type: 'number' },
    { key: 'flowDepth', label: 'Flow Depth', kind: 'out', fmt: 3 },
    { key: 'area', label: 'A', kind: 'out', fmt: 3 },
    { key: 'P', label: 'P', kind: 'out', fmt: 3 },
    { key: 'R', label: 'R', kind: 'out', fmt: 3 },
    { key: 'V', label: 'V', kind: 'out', fmt: 3 },
    { key: 'velHead', label: 'Vel Head', kind: 'out', fmt: 3 },
    { key: 'Q', label: 'Q', kind: 'in', type: 'number' },
    { key: 'Qfull', label: 'Qfull', kind: 'out', fmt: 2, pass: 'passCap' },
    { key: 'comment', label: 'Comment', kind: 'in', type: 'text' },
    { key: 'shear', label: 'Shear', kind: 'out', fmt: 3 },
    { key: 'topElevDS', label: 'Top Elev DS', kind: 'out', fmt: 2 },
    { key: 'WSEL', label: 'WSEL', kind: 'out', fmt: 2 },
    { key: 'freeboard', label: 'Freeboard', kind: 'out', fmt: 3, pass: 'passFb' }
  ];

  function fmt(v, digits) {
    if (v == null || !Number.isFinite(v)) return '';
    return Number(v).toFixed(digits);
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function save() {
    const payload = {
      stormLabel: stormEl.value || '5-YR',
      rows: rows
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (_) { /* quota / private mode */ }
  }

  function recomputeAll() {
    rows = rows.map(function (r) { return M.computeRow(r); });
  }

  function init() {
    const data = load();
    if (data && Array.isArray(data.rows) && data.rows.length) {
      if (data.stormLabel) stormEl.value = data.stormLabel;
      rows = data.rows.map(function (r) { return M.computeRow(r); });
    } else {
      rows = [M.computeRow(M.emptyRow())];
    }
    render();
    save();
  }

  function render() {
    const thead = '<thead><tr>' +
      COLS.map(function (c) { return '<th scope="col">' + c.label + '</th>'; }).join('') +
      '<th scope="col"></th></tr></thead>';

    const body = rows.map(function (row, idx) {
      const cells = COLS.map(function (c) {
        if (c.kind === 'in') {
          let val = '';
          if (c.key === 'gradePct') {
            val = row.grade != null && Number.isFinite(row.grade) ? fmt(row.grade * 100, 3) : '';
          } else if (row[c.key] == null) {
            val = '';
          } else {
            val = String(row[c.key]);
          }
          const numCls = c.type === 'number' ? ' num' : '';
          return '<td class="in' + numCls + '"><input data-id="' + row.id + '" data-key="' + c.key +
            '" type="' + (c.type === 'number' ? 'text' : 'text') + '" inputmode="' +
            (c.type === 'number' ? 'decimal' : 'text') + '" value="' + escapeAttr(val) + '"></td>';
        }
        let cls = 'out';
        if (c.pass && row[c.pass] === true) cls += ' ok';
        if (c.pass && row[c.pass] === false) cls += ' bad';
        const text = fmt(row[c.key], c.fmt);
        return '<td class="' + cls + '">' + escapeHtml(text) + '</td>';
      }).join('');
      const err = row.err ? '<span class="err-hint" title="' + escapeAttr(row.err) + '">⚠</span> ' : '';
      const acts = '<td class="act">' + err +
        '<button type="button" class="gs" data-gs="' + row.id + '" aria-label="Goal Seek row">GS</button> ' +
        '<button type="button" class="del" data-del="' + row.id + '" aria-label="Delete row">Delete</button></td>';
      return '<tr data-idx="' + idx + '">' + cells + acts + '</tr>';
    }).join('');

    grid.innerHTML = thead + '<tbody>' + body + '</tbody>';
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function findRow(id) {
    for (let i = 0; i < rows.length; i++) if (rows[i].id === id) return i;
    return -1;
  }

  function parseNum(str) {
    if (str == null || String(str).trim() === '') return null;
    const n = Number(String(str).trim());
    return Number.isFinite(n) ? n : null;
  }

  function onInputChange(id, key, raw) {
    const i = findRow(id);
    if (i < 0) return;
    const row = Object.assign({}, rows[i]);

    if (key === 'gradePct') {
      const pct = parseNum(raw);
      row.grade = pct == null ? null : pct / 100;
      row.gradeOverride = true;
    } else if (key === 'staFrom' || key === 'staTo' || key === 'offFrom' || key === 'offTo' || key === 'comment') {
      row[key] = raw;
    } else {
      row[key] = parseNum(raw);
      if (key === 'flFrom' || key === 'flTo' || key === 'length') {
        if (!row.gradeOverride) {
          row.grade = M.gradeFromElevs(row.flFrom, row.flTo, row.length);
        }
      }
    }

    // Keep existing flowDepth until Goal Seek; computeRow preserves it when present.
    rows[i] = M.computeRow(row);
    save();
    render();
  }

  function addRow() {
    const prev = rows.length ? rows[rows.length - 1] : undefined;
    rows.push(M.emptyRow(prev));
    recomputeAll();
    save();
    render();
  }

  function deleteRow(id) {
    const i = findRow(id);
    if (i < 0) return;
    rows.splice(i, 1);
    if (!rows.length) rows.push(M.emptyRow());
    recomputeAll();
    save();
    render();
  }

  function clearAll() {
    if (!confirm('Clear the entire table? This cannot be undone.')) return;
    rows = [M.computeRow(M.emptyRow())];
    save();
    render();
  }

  function goalSeekOne(id) {
    const i = findRow(id);
    if (i < 0) return;
    rows[i] = M.goalSeekRow(rows[i]);
    save();
    render();
  }

  function goalSeekAll() {
    rows = rows.map(function (r) { return M.goalSeekRow(r); });
    save();
    render();
  }

  document.getElementById('addRow').addEventListener('click', addRow);
  document.getElementById('clearAll').addEventListener('click', clearAll);
  document.getElementById('goalSeekAll').addEventListener('click', goalSeekAll);

  stormEl.addEventListener('change', save);
  stormEl.addEventListener('input', save);

  grid.addEventListener('change', function (e) {
    const t = e.target;
    if (t && t.matches('input[data-id][data-key]')) {
      onInputChange(t.getAttribute('data-id'), t.getAttribute('data-key'), t.value);
    }
  });
  grid.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.matches('input[data-id][data-key]')) {
      e.target.blur();
    }
  });
  grid.addEventListener('click', function (e) {
    const gs = e.target.closest('[data-gs]');
    if (gs) {
      goalSeekOne(gs.getAttribute('data-gs'));
      return;
    }
    const btn = e.target.closest('[data-del]');
    if (btn) deleteRow(btn.getAttribute('data-del'));
  });

  init();
})();
