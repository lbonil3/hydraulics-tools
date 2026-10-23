(function () {
  const C = window.StormCalc;
  const LS_KEY = 'storm-network-v1';
  let nodes = [];
  let pipes = [];
  let outfallTw = null;
  let selectedNodeId = null;
  let selectedPipeId = null;
  let pathEndNodeId = null;
  let analyzed = null;

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function save() {
    const payload = {
      version: 1,
      outfallTw: outfallTw,
      nodes: nodes.map(function (n) {
        return {
          id: n.id, name: n.name, kind: n.kind, rim: n.rim, invert: n.invert,
          Qin: n.Qin, ahDiameter: n.ahDiameter, bendDeg: n.bendDeg
        };
      }),
      pipes: pipes.map(function (p) {
        return {
          id: p.id, fromId: p.fromId, toId: p.toId, shape: p.shape,
          diameter: p.diameter, span: p.span, rise: p.rise, n: p.n,
          length: p.length, ieUp: p.ieUp, ieDn: p.ieDn
        };
      }),
      selectedNodeId: selectedNodeId,
      selectedPipeId: selectedPipeId,
      pathEndNodeId: pathEndNodeId
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (e) {}
  }

  function recompute() {
    analyzed = C.analyzeNetwork(nodes, pipes, outfallTw);
    nodes = analyzed.nodes;
    pipes = analyzed.pipes;
  }

  function fmt(v, d) {
    if (v == null || !Number.isFinite(Number(v))) return '';
    return Number(v).toFixed(d == null ? 2 : d);
  }

  function refreshResults() {
    const el = document.getElementById('results');
    if (!el || !analyzed) return;
    if (analyzed.errors && analyzed.errors.length) {
      el.innerHTML = '<span class="bad">' + analyzed.errors.join('; ') + '</span>';
      return;
    }
    const parts = [];
    parts.push('<span>Network Q @ outfall: <b>' + fmt(analyzed.networkQ, 2) + '</b> cfs</span>');
    if (analyzed.worstSurcharge != null) {
      parts.push('<span class="bad">Worst surcharge: ' + fmt(analyzed.worstSurcharge, 2) + ' ft over rim</span>');
    } else {
      parts.push('<span class="ok">No surcharge flagged</span>');
    }
    parts.push('<span>Pass ' + analyzed.passCount + ' · Fail ' + analyzed.failCount + '</span>');
    (analyzed.warnings || []).forEach(function (w) {
      parts.push('<span>' + w + '</span>');
    });
    el.innerHTML = parts.join('');
  }

  function refreshPathSelect() {
    const sel = document.getElementById('pathEnd');
    if (!sel) return;
    const opts = nodes.filter(function (n) { return n.kind !== 'outfall'; });
    sel.innerHTML = opts.map(function (n) {
      return '<option value="' + n.id + '"' + (n.id === pathEndNodeId ? ' selected' : '') + '>' +
        (n.name || n.id) + '</option>';
    }).join('');
    if (!pathEndNodeId && opts[0]) pathEndNodeId = opts[0].id;
  }

  function refreshViz() {
    const V = window.StormViz;
    if (!V || !analyzed) return;
    const el = document.getElementById('profileSvg');
    const pathIds = V.pathFromOutfall(analyzed, pathEndNodeId);
    V.renderProfile(el, analyzed, pathIds);
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function renderNodes() {
    const grid = document.getElementById('nodesGrid');
    const cols = [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'kind', label: 'Kind', kind: 'select', opts: ['outfall', 'manhole', 'junction', 'inlet'] },
      { key: 'rim', label: 'Rim', kind: 'num' },
      { key: 'invert', label: 'Invert', kind: 'num' },
      { key: 'Qin', label: 'Qin cfs', kind: 'num' },
      { key: 'bendDeg', label: 'Bend°', kind: 'num' },
      { key: 'HGL', label: 'HGL', kind: 'out' },
      { key: 'surcharge', label: 'Surch.', kind: 'flag' }
    ];
    grid.innerHTML =
      '<thead><tr>' + cols.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + nodes.map(function (n) {
        const sel = n.id === selectedNodeId ? ' selected' : '';
        const cells = cols.map(function (c) {
          if (c.kind === 'out') return '<td class="out">' + fmt(n[c.key], 2) + '</td>';
          if (c.kind === 'flag') {
            const bad = n.surcharge === true;
            return '<td class="out ' + (n.surcharge == null ? '' : bad ? 'bad' : 'ok') + '">' +
              (n.surcharge == null ? '' : bad ? 'YES' : 'ok') + '</td>';
          }
          if (c.kind === 'select') {
            return '<td class="in"><select data-n="' + n.id + '" data-k="' + c.key + '">' +
              c.opts.map(function (o) {
                return '<option value="' + o + '"' + (n[c.key] === o ? ' selected' : '') + '>' + o + '</option>';
              }).join('') + '</select></td>';
          }
          const v = n[c.key] == null ? '' : n[c.key];
          return '<td class="in"><input data-n="' + n.id + '" data-k="' + c.key + '" value="' + escapeAttr(v) + '"></td>';
        }).join('');
        return '<tr data-node-id="' + n.id + '" class="' + sel.trim() + '">' + cells + '</tr>';
      }).join('') + '</tbody>';
  }

  function renderPipes() {
    const grid = document.getElementById('pipesGrid');
    const cols = [
      { key: 'fromId', label: 'From', kind: 'node' },
      { key: 'toId', label: 'To', kind: 'node' },
      { key: 'shape', label: 'Shape', kind: 'select', opts: ['circular', 'box'] },
      { key: 'diameter', label: 'Dia ft', kind: 'num' },
      { key: 'span', label: 'Span', kind: 'num' },
      { key: 'rise', label: 'Rise', kind: 'num' },
      { key: 'n', label: 'n', kind: 'num' },
      { key: 'length', label: 'L ft', kind: 'num' },
      { key: 'ieUp', label: 'IE up', kind: 'num' },
      { key: 'ieDn', label: 'IE dn', kind: 'num' },
      { key: 'Q', label: 'Q', kind: 'out' },
      { key: 'Qfull', label: 'Qfull', kind: 'out' },
      { key: 'hf', label: 'hf', kind: 'out' },
      { key: 'HGLup', label: 'HGLup', kind: 'out' },
      { key: 'passCap', label: 'Cap', kind: 'flag' },
      { key: 'passHgl', label: 'HGL', kind: 'flag' }
    ];
    grid.innerHTML =
      '<thead><tr>' + cols.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + pipes.map(function (p) {
        const sel = p.id === selectedPipeId ? ' selected' : '';
        const cells = cols.map(function (c) {
          if (c.kind === 'out') return '<td class="out">' + fmt(p[c.key], 2) + '</td>';
          if (c.kind === 'flag') {
            const v = p[c.key];
            return '<td class="out ' + (v == null ? '' : v ? 'ok' : 'bad') + '">' +
              (v == null ? '' : v ? 'ok' : 'FAIL') + '</td>';
          }
          if (c.kind === 'node') {
            return '<td class="in"><select data-p="' + p.id + '" data-k="' + c.key + '">' +
              nodes.map(function (n) {
                return '<option value="' + n.id + '"' + (p[c.key] === n.id ? ' selected' : '') + '>' +
                  (n.name || n.id) + '</option>';
              }).join('') + '</select></td>';
          }
          if (c.kind === 'select') {
            return '<td class="in"><select data-p="' + p.id + '" data-k="' + c.key + '">' +
              c.opts.map(function (o) {
                return '<option value="' + o + '"' + (p[c.key] === o ? ' selected' : '') + '>' + o + '</option>';
              }).join('') + '</select></td>';
          }
          const v = p[c.key] == null ? '' : p[c.key];
          return '<td class="in"><input data-p="' + p.id + '" data-k="' + c.key + '" value="' + escapeAttr(v) + '"></td>';
        }).join('');
        return '<tr data-pipe-id="' + p.id + '" class="' + sel.trim() + '">' + cells + '</tr>';
      }).join('') + '</tbody>';
  }

  function render() {
    recompute();
    renderNodes();
    renderPipes();
    refreshResults();
    refreshPathSelect();
    refreshViz();
  }

  function onAddNode() {
    const n = C.emptyNode({ name: 'N' + (nodes.length + 1), kind: 'manhole' });
    nodes.push(n);
    selectedNodeId = n.id;
    save(); render();
  }

  function onAddPipe() {
    if (nodes.length < 2) {
      alert('Add at least two nodes before adding a pipe.');
      return;
    }
    const from = selectedNodeId && nodes.some(function (n) { return n.id === selectedNodeId; })
      ? selectedNodeId : nodes[0].id;
    const of = nodes.find(function (n) { return n.kind === 'outfall'; });
    const to = of && of.id !== from ? of.id : (nodes.find(function (n) { return n.id !== from; }) || nodes[0]).id;
    const p = C.emptyPipe({
      fromId: from, toId: to, shape: 'circular', diameter: 2, n: 0.013, length: 100,
      ieUp: null, ieDn: null
    });
    pipes.push(p);
    selectedPipeId = p.id;
    save(); render();
  }

  function onDelete() {
    if (selectedPipeId) {
      pipes = pipes.filter(function (p) { return p.id !== selectedPipeId; });
      selectedPipeId = null;
      save(); render();
      return;
    }
    if (selectedNodeId) {
      const id = selectedNodeId;
      if (pipes.some(function (p) { return p.fromId === id || p.toId === id; })) {
        if (!confirm('Delete node and all connected pipes?')) return;
        pipes = pipes.filter(function (p) { return p.fromId !== id && p.toId !== id; });
      }
      nodes = nodes.filter(function (n) { return n.id !== id; });
      selectedNodeId = null;
      save(); render();
    }
  }

  function onSuggest() {
    const res = C.suggestSizesAll(nodes, pipes, outfallTw);
    nodes = res.nodes;
    pipes = res.pipes;
    save(); render();
  }

  function onLoadExample() {
    if (!C.isNetworkEmpty(nodes, pipes)) {
      if (!confirm('Replace your network with the branched example?')) return;
    }
    const ex = C.exampleNetwork();
    nodes = ex.nodes;
    pipes = ex.pipes;
    outfallTw = ex.outfallTw;
    selectedNodeId = nodes[1] ? nodes[1].id : null;
    selectedPipeId = pipes[0] ? pipes[0].id : null;
    pathEndNodeId = nodes[2] ? nodes[2].id : null;
    document.getElementById('outfallTw').value = outfallTw;
    save(); render();
  }

  function parseNum(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(String(raw).trim());
    return Number.isFinite(n) ? n : null;
  }

  function init() {
    const data = load();
    if (data && data.version === 1 && Array.isArray(data.nodes)) {
      nodes = data.nodes.map(function (n) { return C.emptyNode(n); });
      pipes = (data.pipes || []).map(function (p) { return C.emptyPipe(p); });
      outfallTw = data.outfallTw;
      selectedNodeId = data.selectedNodeId || null;
      selectedPipeId = data.selectedPipeId || null;
      pathEndNodeId = data.pathEndNodeId || null;
    } else {
      const of = C.emptyNode({ name: 'OF', kind: 'outfall', rim: 100, invert: 90, Qin: 0 });
      nodes = [of];
      pipes = [];
      outfallTw = null;
    }
    const twEl = document.getElementById('outfallTw');
    if (twEl) twEl.value = outfallTw == null ? '' : outfallTw;
    render();
    save();
  }

  document.getElementById('addNode').addEventListener('click', onAddNode);
  document.getElementById('addPipe').addEventListener('click', onAddPipe);
  document.getElementById('deleteSelected').addEventListener('click', onDelete);
  document.getElementById('suggestSizes').addEventListener('click', onSuggest);
  document.getElementById('loadExample').addEventListener('click', onLoadExample);
  document.getElementById('outfallTw').addEventListener('change', function (e) {
    outfallTw = parseNum(e.target.value);
    save(); render();
  });
  document.getElementById('pathEnd').addEventListener('change', function (e) {
    pathEndNodeId = e.target.value;
    save(); refreshViz();
  });

  document.getElementById('nodesGrid').addEventListener('change', function (e) {
    const t = e.target;
    if (!t.dataset.n) return;
    const n = nodes.find(function (x) { return x.id === t.dataset.n; });
    if (!n) return;
    const k = t.dataset.k;
    if (k === 'name' || k === 'kind') n[k] = t.value;
    else n[k] = parseNum(t.value);
    save(); render();
  });
  document.getElementById('nodesGrid').addEventListener('click', function (e) {
    const tr = e.target.closest('tr[data-node-id]');
    if (!tr) return;
    selectedNodeId = tr.getAttribute('data-node-id');
    selectedPipeId = null;
    pathEndNodeId = selectedNodeId;
    save(); render();
  });

  document.getElementById('pipesGrid').addEventListener('change', function (e) {
    const t = e.target;
    if (!t.dataset.p) return;
    const p = pipes.find(function (x) { return x.id === t.dataset.p; });
    if (!p) return;
    const k = t.dataset.k;
    if (k === 'fromId' || k === 'toId' || k === 'shape') p[k] = t.value;
    else p[k] = parseNum(t.value);
    save(); render();
  });
  document.getElementById('pipesGrid').addEventListener('click', function (e) {
    const tr = e.target.closest('tr[data-pipe-id]');
    if (!tr) return;
    selectedPipeId = tr.getAttribute('data-pipe-id');
    selectedNodeId = null;
    const p = pipes.find(function (x) { return x.id === selectedPipeId; });
    if (p) pathEndNodeId = p.fromId;
    save(); render();
  });

  init();
})();
