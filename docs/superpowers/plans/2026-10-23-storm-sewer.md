# Storm Sewer Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/storm/` — phone-friendly branched storm sewer network tables with node Qin rollup, Manning conveyance/friction, HEC-22 structure losses, upstream HGL from outfall TW, Suggest size, and an SVG HGL profile.

**Architecture:** Pure network hydraulics in `storm/calc.js` (tree topology → accumulate Q → conveyance/hf → structure loss → HGL walk → suggestSize). `storm/table.js` owns nodes/pipes tables, localStorage `storm-network-v1`, toolbar, and `refreshViz`. `storm/viz.js` draws SVG only from analyzed network + selected path. Reuse `Culvert.geom` / `Culvert.MANNING` / `Culvert.normal` from `culvert/calc.js` for circular/box section properties; no chart library, no map canvas.

**Tech Stack:** Vanilla JS IIFE + CommonJS tests, SVG, localStorage storm-network-v1

## Global Constraints
- iPhone-friendly: toolbar controls ≥44px on touch (`mobile.css`).
- Color family `#1f4e79`.
- TxDOT HDM first; HEC-22 / FHWA when HDM has no value, labeled.
- Author commits as Luis Bonilla `<lbonil3@users.noreply.github.com>`; do not push (controller publishes).
- No chart library; no map canvas; no Drainage/Tc handoff in v1.

## File map

| File | Role |
|------|------|
| `storm/calc.js` | emptyNode/emptyPipe, accumulate, conveyance, hf, structureLoss, analyzeNetwork, suggestSize, exampleNetwork, STANDARD_SIZES |
| `storm/test.js` | Node tests: accumulate, conveyance/hf, HGL branched, suggestSize, viz smoke |
| `storm/table.js` | Tables, persistence, toolbar, selection, refreshViz |
| `storm/viz.js` | HGL profile SVG (`renderProfile`, `pathFromOutfall`) |
| `storm/index.html` | Shell: header, toolbar, nodes+pipes, results, `#viz`, Sources |
| `storm/style.css` / `mobile.css` / `mobile.js` | Layout, selection, sticky viz, 44px touch |
| `index.html` + `scripts/check-home.js` | Home card **Storm Sewer** after Drainage Studio |

## Intentional v1 simplifications (locked)

1. **Shapes:** Circular and box are fully computed. Other HDM-listed conduit shapes (`ellip`, `parch`, …) are accepted as `shape` keys but `sectionProps` returns a clear `err` until a size table + `Culvert.makeSection` / `sectionFromHY8` path is wired; Suggest size only walks circular/box lists.
2. **Friction:** `hf` uses **full-flow** Manning section properties at design Q (standard storm-sewer sizing practice). Part-full velocity is reported via `Culvert.normal` when Q ≤ Qfull; otherwise velocity = Q/Afull (surcharged).
3. **HEC-22 structure loss:** Access-hole / junction form `Hs = K·Vout²/(2g)` with K from deflection angle bands (HEC-22 approximate access-hole K). Full relative-energy-loss correction set (CD, Cd, CQ, Cp, CB) is **out of v1**; defaults documented in Sources card.
4. **Freeboard:** Pass when `HGLup ≤ rim`. TxDOT HDM does not publish a universal storm-sewer freeboard in the numbers we use; check is labeled HEC-22 / engineering when HDM has no value.
5. **Topology:** Directed tree into one outfall (one outgoing pipe per node). Cycles and multiple outfalls are validation errors, not solved.

---

### Task 1: calc — accumulate Q + empty helpers + tests

**Files:**
- Create: `storm/calc.js`
- Create: `storm/test.js`

**Interfaces:**
- Consumes: nothing (pure)
- Produces:
  - `emptyNode(partial?) → Node`
  - `emptyPipe(partial?) → Pipe`
  - `validateTopology(nodes, pipes) → { ok: boolean, errors: string[], outfallId: string|null }`
  - `accumulate(nodes, pipes) → { pipes: Pipe[], nodeQinThru: Object<string,number>, errors: string[] }`
  - Node: `{ id, name, kind, rim, invert, Qin, ahDiameter, bendDeg }`
  - Pipe: `{ id, fromId, toId, shape, diameter, span, rise, n, length, ieUp, ieDn }` plus computed fields left null until later tasks

- [ ] **Step 1: Create failing tests** `storm/test.js`:

```js
const assert = require('assert');
const C = require('./calc.js');

function branched() {
  const of = C.emptyNode({ id: 'of', name: 'OF', kind: 'outfall', rim: 102, invert: 90, Qin: 0 });
  const mh1 = C.emptyNode({ id: 'mh1', name: 'MH-1', kind: 'manhole', rim: 105, invert: 94, Qin: 5 });
  const in2 = C.emptyNode({ id: 'in2', name: 'IN-2', kind: 'inlet', rim: 106, invert: 96, Qin: 3 });
  const in3 = C.emptyNode({ id: 'in3', name: 'IN-3', kind: 'inlet', rim: 107, invert: 97, Qin: 2 });
  const pMain = C.emptyPipe({
    id: 'p1', fromId: 'mh1', toId: 'of', shape: 'circular', diameter: 2, n: 0.013,
    length: 200, ieUp: 94, ieDn: 90
  });
  const pLatA = C.emptyPipe({
    id: 'p2', fromId: 'in2', toId: 'mh1', shape: 'circular', diameter: 1.5, n: 0.013,
    length: 100, ieUp: 96, ieDn: 94.2
  });
  const pLatB = C.emptyPipe({
    id: 'p3', fromId: 'in3', toId: 'mh1', shape: 'circular', diameter: 1.25, n: 0.013,
    length: 80, ieUp: 97, ieDn: 94.5
  });
  return { nodes: [of, mh1, in2, in3], pipes: [pMain, pLatA, pLatB] };
}

const top = C.validateTopology(branched().nodes, branched().pipes);
assert.strictEqual(top.ok, true);
assert.strictEqual(top.outfallId, 'of');

const acc = C.accumulate(branched().nodes, branched().pipes);
const byId = Object.fromEntries(acc.pipes.map(function (p) { return [p.id, p]; }));
assert.ok(Math.abs(byId.p2.Q - 3) < 1e-9);
assert.ok(Math.abs(byId.p3.Q - 2) < 1e-9);
assert.ok(Math.abs(byId.p1.Q - 10) < 1e-9); // 5+3+2
assert.ok(Math.abs(acc.nodeQinThru.mh1 - 10) < 1e-9);
assert.ok(Math.abs(acc.nodeQinThru.of - 10) < 1e-9);

const dup = branched();
dup.nodes.push(C.emptyNode({ id: 'of2', name: 'OF2', kind: 'outfall', rim: 100, invert: 88, Qin: 0 }));
assert.strictEqual(C.validateTopology(dup.nodes, dup.pipes).ok, false);

const cycle = branched();
cycle.pipes.push(C.emptyPipe({
  id: 'bad', fromId: 'of', toId: 'in2', shape: 'circular', diameter: 1, n: 0.013,
  length: 10, ieUp: 90, ieDn: 95
}));
assert.strictEqual(C.validateTopology(cycle.nodes, cycle.pipes).ok, false);

console.log('ok');
```

- [ ] **Step 2: Run** `node storm/test.js` — expect FAIL (cannot find module `./calc.js` or missing exports).

- [ ] **Step 3: Implement** `storm/calc.js`:

```js
(function (root) {
  const KM = 1.486;
  const G = 32.174;

  function uid(prefix) {
    return (prefix || 'id') + Math.random().toString(36).slice(2, 9);
  }

  function emptyNode(partial) {
    return Object.assign({
      id: uid('n'),
      name: '',
      kind: 'manhole', // outfall | manhole | junction | inlet
      rim: null,
      invert: null,
      Qin: 0,
      ahDiameter: null, // access-hole diameter ft; default 4 when used later
      bendDeg: null     // deflection deg; null → defaults by kind
    }, partial || {});
  }

  function emptyPipe(partial) {
    return Object.assign({
      id: uid('p'),
      fromId: '',
      toId: '',
      shape: 'circular', // circular | box | (other HDM keys stubbed later)
      diameter: null,    // ft (circular)
      span: null,        // ft (box)
      rise: null,        // ft (box)
      n: 0.013,
      length: null,
      ieUp: null,
      ieDn: null,
      Q: null,
      Qfull: null,
      V: null,
      hf: null,
      HGLup: null,
      HGLdn: null,
      surcharge: null,
      passCap: null,
      passHgl: null,
      err: null
    }, partial || {});
  }

  function validateTopology(nodes, pipes) {
    const errors = [];
    const byId = Object.create(null);
    (nodes || []).forEach(function (n) {
      if (!n || !n.id) { errors.push('Node missing id'); return; }
      if (byId[n.id]) errors.push('Duplicate node id ' + n.id);
      byId[n.id] = n;
    });
    const outfalls = (nodes || []).filter(function (n) { return n.kind === 'outfall'; });
    let outfallId = outfalls.length === 1 ? outfalls[0].id : null;
    if (outfalls.length === 0) {
      const outgoing = Object.create(null);
      (pipes || []).forEach(function (p) { outgoing[p.fromId] = true; });
      const sinks = (nodes || []).filter(function (n) { return !outgoing[n.id]; });
      if (sinks.length === 1) outfallId = sinks[0].id;
      else errors.push('Missing outfall (need exactly one kind:outfall or one sink)');
    } else if (outfalls.length > 1) {
      errors.push('Duplicate outfall');
    }
    const outCount = Object.create(null);
    (pipes || []).forEach(function (p) {
      if (!byId[p.fromId] || !byId[p.toId]) errors.push('Pipe ' + p.id + ' bad endpoint');
      outCount[p.fromId] = (outCount[p.fromId] || 0) + 1;
      if (outCount[p.fromId] > 1) errors.push('Node ' + p.fromId + ' has multiple outgoing pipes');
    });
    const children = Object.create(null);
    (pipes || []).forEach(function (p) {
      (children[p.toId] = children[p.toId] || []).push(p.fromId);
    });
    if (outfallId) {
      const seen = Object.create(null);
      const stack = Object.create(null);
      function dfs(id) {
        if (stack[id]) { errors.push('Cycle involving ' + id); return; }
        if (seen[id]) return;
        stack[id] = true;
        (children[id] || []).forEach(dfs);
        stack[id] = false;
        seen[id] = true;
      }
      dfs(outfallId);
      (nodes || []).forEach(function (n) {
        if (!seen[n.id] && (pipes || []).some(function (p) {
          return p.fromId === n.id || p.toId === n.id;
        })) {
          errors.push('Node ' + n.id + ' not connected to outfall');
        }
      });
    }
    return { ok: errors.length === 0, errors: errors, outfallId: outfallId };
  }

  function accumulate(nodes, pipes) {
    const top = validateTopology(nodes, pipes);
    if (!top.ok) {
      return {
        pipes: (pipes || []).map(function (p) {
          return Object.assign({}, p, { Q: null, err: top.errors[0] });
        }),
        nodeQinThru: {},
        errors: top.errors.slice()
      };
    }
    const qLocal = Object.create(null);
    (nodes || []).forEach(function (n) { qLocal[n.id] = Number(n.Qin) || 0; });
    const children = Object.create(null);
    (pipes || []).forEach(function (p) {
      (children[p.toId] = children[p.toId] || []).push(p);
    });
    const nodeQinThru = Object.create(null);
    const pipeQ = Object.create(null);
    function thru(nodeId) {
      if (nodeQinThru[nodeId] != null) return nodeQinThru[nodeId];
      let sum = qLocal[nodeId] || 0;
      (children[nodeId] || []).forEach(function (p) {
        const q = thru(p.fromId);
        pipeQ[p.id] = q;
        sum += q;
      });
      nodeQinThru[nodeId] = sum;
      return sum;
    }
    thru(top.outfallId);
    const outPipes = (pipes || []).map(function (p) {
      return Object.assign({}, p, {
        Q: pipeQ[p.id] != null ? pipeQ[p.id] : null,
        err: null
      });
    });
    return { pipes: outPipes, nodeQinThru: nodeQinThru, errors: [] };
  }

  const API = {
    KM: KM, G: G, emptyNode: emptyNode, emptyPipe: emptyPipe,
    validateTopology: validateTopology, accumulate: accumulate
  };
  if (typeof module !== 'undefined') module.exports = API;
  else root.StormCalc = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run** `node storm/test.js` — expect `ok`.

- [ ] **Step 5: Commit**

```bash
git add storm/calc.js storm/test.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(storm): accumulate Q + topology helpers"
```

---

### Task 2: calc — conveyance + friction hf

**Files:**
- Modify: `storm/calc.js`
- Modify: `storm/test.js`

**Interfaces:**
- Consumes: `Culvert.geom(shape, B, D, y)`, `Culvert.MANNING`, `Culvert.normal` via `require('../culvert/calc.js').Culvert` (Node) or `window.Culvert` (browser)
- Produces:
  - `STANDARD_SIZES` — `{ circularIn: number[], boxFt: [span,rise][] }` with comment citing common RCP / TxDOT-commercial steps
  - `sectionProps(pipe) → { shapeKey, B, D, A, P, R, err }`
  - `slopeOf(pipe) → number|null` — `(ieUp - ieDn) / length`
  - `fullFlowCapacity(pipe) → number|null` — Manning Qfull cfs
  - `frictionHf(pipe, Q) → number|null` — hf ft using full-flow A,R
  - `conveyPipe(pipe) → Pipe` — fills Qfull, V, hf (needs pipe.Q set), passCap
  - `getCulvert() → Culvert|null`

- [ ] **Step 1: Append failing tests** before `console.log('ok')` in `storm/test.js`:

```js
// --- conveyance + hf ---
const circ = C.emptyPipe({
  id: 'c', fromId: 'a', toId: 'b', shape: 'circular', diameter: 2, n: 0.013,
  length: 200, ieUp: 100, ieDn: 99, Q: 10
});
const props = C.sectionProps(circ);
assert.ok(Math.abs(props.A - Math.PI) < 1e-9); // π·1²
assert.ok(Math.abs(props.R - 0.5) < 1e-9);     // D/4
const S = C.slopeOf(circ);
assert.ok(Math.abs(S - 0.005) < 1e-12);
const Qf = C.fullFlowCapacity(circ);
assert.ok(Qf > 10); // 24 in @ 0.5% concrete should carry >10 cfs
const hf = C.frictionHf(circ, 10);
assert.ok(hf > 0 && hf < 200);
const conv = C.conveyPipe(Object.assign({}, circ, { Q: 10 }));
assert.ok(conv.Qfull > 0);
assert.strictEqual(conv.passCap, true);
assert.ok(conv.hf > 0);

const box = C.emptyPipe({
  id: 'bx', shape: 'box', span: 3, rise: 2, n: 0.013, length: 100,
  ieUp: 50, ieDn: 49.5, Q: 20
});
assert.ok(C.fullFlowCapacity(box) > 0);
assert.ok(C.STANDARD_SIZES.circularIn.indexOf(24) >= 0);
assert.ok(C.STANDARD_SIZES.boxFt.some(function (s) { return s[0] === 3 && s[1] === 2; }));

const stub = C.sectionProps(C.emptyPipe({ shape: 'ellip', span: 3, rise: 2 }));
assert.ok(stub.err); // v1 stub for non circular/box
```

- [ ] **Step 2: Run** `node storm/test.js` — expect FAIL (missing `sectionProps` / `STANDARD_SIZES`).

- [ ] **Step 3: Extend** `storm/calc.js` — after `accumulate`, before `const API`, add:

```js
  function getCulvert() {
    if (typeof root !== 'undefined' && root.Culvert) return root.Culvert;
    if (typeof require !== 'undefined') {
      try {
        const mod = require('../culvert/calc.js');
        return mod.Culvert || mod;
      } catch (e) { return null; }
    }
    return null;
  }

  // Common commercial RCP diameters (inches) and box span×rise (ft).
  // TxDOT HDM storm sewer sizing uses manufacturer / standard increments; cite in Sources.
  const STANDARD_SIZES = {
    circularIn: [12, 15, 18, 21, 24, 27, 30, 36, 42, 48, 54, 60, 66, 72],
    boxFt: [
      [2, 2], [3, 2], [3, 3], [4, 2], [4, 3], [4, 4],
      [5, 3], [5, 4], [5, 5], [6, 3], [6, 4], [6, 5], [6, 6],
      [7, 4], [7, 5], [7, 6], [8, 4], [8, 5], [8, 6], [8, 8]
    ]
  };

  function sectionProps(pipe) {
    const shape = pipe.shape || 'circular';
    if (shape === 'circular') {
      const D = Number(pipe.diameter);
      if (!(D > 0)) {
        return { shapeKey: 'circular', B: null, D: null, A: null, P: null, R: null, err: 'Need diameter' };
      }
      const Culvert = getCulvert();
      if (Culvert && Culvert.geom) {
        const g = Culvert.geom('circular', D, D, D);
        const P = Math.PI * D;
        return { shapeKey: 'circular', B: D, D: D, A: g.A, P: P, R: g.A / P, err: null };
      }
      const A = Math.PI * D * D / 4;
      const P = Math.PI * D;
      return { shapeKey: 'circular', B: D, D: D, A: A, P: P, R: A / P, err: null };
    }
    if (shape === 'box') {
      const B = Number(pipe.span);
      const D = Number(pipe.rise);
      if (!(B > 0) || !(D > 0)) {
        return { shapeKey: 'box', B: B, D: D, A: null, P: null, R: null, err: 'Need span×rise' };
      }
      const Culvert = getCulvert();
      if (Culvert && Culvert.geom) {
        const g = Culvert.geom('box', B, D, D);
        const P = 2 * (B + D);
        return { shapeKey: 'box', B: B, D: D, A: g.A, P: P, R: g.A / P, err: null };
      }
      const A = B * D;
      const P = 2 * (B + D);
      return { shapeKey: 'box', B: B, D: D, A: A, P: P, R: A / P, err: null };
    }
    // Other HDM shapes (ellip, parch, …): stub in v1 — wire Culvert.makeSection / sectionFromHY8 later
    return {
      shapeKey: shape, B: null, D: null, A: null, P: null, R: null,
      err: 'Shape "' + shape + '" not computed in v1 (use circular or box)'
    };
  }

  function slopeOf(pipe) {
    const L = Number(pipe.length);
    if (!(L > 0) || pipe.ieUp == null || pipe.ieDn == null) return null;
    return (Number(pipe.ieUp) - Number(pipe.ieDn)) / L;
  }

  function fullFlowCapacity(pipe) {
    const sp = sectionProps(pipe);
    if (sp.err || !(sp.A > 0) || !(sp.R > 0)) return null;
    const n = Number(pipe.n);
    const S = slopeOf(pipe);
    if (!(n > 0) || !(S > 0)) return null;
    return (KM / n) * sp.A * Math.pow(sp.R, 2 / 3) * Math.sqrt(S);
  }

  function frictionHf(pipe, Q) {
    const sp = sectionProps(pipe);
    const L = Number(pipe.length);
    const n = Number(pipe.n);
    const q = Number(Q);
    if (sp.err || !(sp.A > 0) || !(sp.R > 0) || !(L > 0) || !(n > 0) || !(q >= 0)) return null;
    if (q === 0) return 0;
    const Sf = Math.pow((n * q) / (KM * sp.A * Math.pow(sp.R, 2 / 3)), 2);
    return Sf * L;
  }

  function conveyPipe(pipe) {
    const out = Object.assign({}, pipe, { err: pipe.err || null });
    const sp = sectionProps(out);
    if (sp.err) {
      out.err = sp.err;
      out.Qfull = out.V = out.hf = null;
      out.passCap = null;
      return out;
    }
    out.Qfull = fullFlowCapacity(out);
    const Q = out.Q == null ? null : Number(out.Q);
    out.hf = Q == null ? null : frictionHf(out, Q);
    if (Q == null || !(sp.A > 0)) {
      out.V = null;
    } else if (out.Qfull != null && Q <= out.Qfull) {
      const Culvert = getCulvert();
      const S = slopeOf(out);
      if (Culvert && Culvert.normal && S > 0 && Q > 0) {
        const yn = Culvert.normal(sp.shapeKey, sp.B, sp.D, Q, Number(out.n), S, KM);
        if (Number.isFinite(yn) && yn > 0) {
          const g = Culvert.geom(sp.shapeKey, sp.B, sp.D, yn);
          out.V = Q / g.A;
        } else {
          out.V = Q / sp.A;
        }
      } else {
        out.V = Q / sp.A;
      }
    } else {
      out.V = Q / sp.A;
    }
    out.passCap = out.Qfull != null && Q != null ? Q <= out.Qfull + 1e-9 : null;
    return out;
  }
```

Export: add `STANDARD_SIZES, sectionProps, slopeOf, fullFlowCapacity, frictionHf, conveyPipe, getCulvert` to `API`.

- [ ] **Step 4: Run** `node storm/test.js` — expect `ok`.

- [ ] **Step 5: Commit**

```bash
git add storm/calc.js storm/test.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(storm): Manning conveyance and friction hf"
```

---

### Task 3: calc — HEC-22 structure loss + HGL upstream walk

**Files:**
- Modify: `storm/calc.js`
- Modify: `storm/test.js`

**Interfaces:**
- Consumes: `accumulate`, `conveyPipe`, `frictionHf`, `sectionProps`, `G`
- Produces:
  - `DEFAULTS` — `{ ahDiameterFt: 4, freeboardFt: 0, KbyAngle: [...] }` documented
  - `KfromTheta(thetaDeg) → number`
  - `structureK(node, inflowPipes, outflowPipe) → { K, thetaDeg, note }`
  - `structureLoss(node, inflowPipes, outflowPipe, Qout, Vout) → { Hs, K, note }`
  - `analyzeNetwork(nodes, pipes, outfallTw) → { nodes, pipes, outfallId, networkQ, worstSurcharge, passCount, failCount, errors, warnings }`
    - Each pipe gains `HGLup`, `HGLdn`, `hf`, `HsAtUp`, `surcharge`, `passHgl`, `passCap`
    - Each node gains `HGL`, `Hs`, `surcharge`

**HEC-22 method (locked for v1):** Access-hole / junction energy loss (approximate form):

`Hs = K * Vout^2 / (2g)` with `g = 32.174 ft/s²`.

K from deflection angle θ (degrees) between principal inflow and outflow (absolute):

| |θ| band | K |
|-----------|---|
| ≤ 22.5 | 0.10 |
| ≤ 45 | 0.30 |
| ≤ 60 | 0.50 |
| ≤ 90 | 0.80 |
| > 90 | 1.00 |

When `node.bendDeg` is null: `kind === 'junction'` with ≥2 inflows → θ=90 (K=0.80); otherwise θ=0 (K=0.10). Outfall Hs=0. Label in Sources: approximate HEC-22 access-hole K; full CD·Cd·CQ·Cp·CB relative method out of v1.

HGL walk:
1. If `outfallTw == null` → no HGL (nulls); do not invent TW.
2. At outfall node: `HGL = outfallTw`.
3. For each pipe walking upstream: `HGLdn = HGL_at_toNode`; `HGLup = HGLdn + hf + Hs_at_fromNode`.
4. Surcharge when node HGL > rim (+ `DEFAULTS.freeboardFt`, currently 0).

- [ ] **Step 1: Append failing tests** before `console.log('ok')`:

```js
// --- HGL + structure loss ---
const net = branched();
const tw = 91.5;
const analyzed = C.analyzeNetwork(net.nodes, net.pipes, tw);
assert.strictEqual(analyzed.errors.length, 0);
assert.ok(Math.abs(analyzed.networkQ - 10) < 1e-9);
const p1 = analyzed.pipes.find(function (p) { return p.id === 'p1'; });
const p2 = analyzed.pipes.find(function (p) { return p.id === 'p2'; });
assert.ok(p1.HGLdn != null);
assert.ok(Math.abs(p1.HGLdn - tw) < 1e-9);
assert.ok(p1.HGLup > p1.HGLdn);
assert.ok(p2.HGLup > p2.HGLdn);
const mh = analyzed.nodes.find(function (n) { return n.id === 'mh1'; });
assert.ok(mh.HGL != null);
assert.ok(mh.HGL >= p1.HGLup - 1e-9);

const noTw = C.analyzeNetwork(net.nodes, net.pipes, null);
assert.ok(noTw.pipes.every(function (p) { return p.HGLup == null; }));

const sk = C.structureK(
  C.emptyNode({ id: 'j', kind: 'junction', bendDeg: 90 }),
  [p2], p1
);
assert.ok(Math.abs(sk.K - 0.80) < 1e-9);
```

- [ ] **Step 2: Run** `node storm/test.js` — expect FAIL (missing `analyzeNetwork`).

- [ ] **Step 3: Implement** in `storm/calc.js` before `const API`:

```js
  const DEFAULTS = {
    ahDiameterFt: 4,
    freeboardFt: 0, // HDM has no universal freeboard here; HGL ≤ rim (labeled)
    KbyAngle: [
      { maxDeg: 22.5, K: 0.10 },
      { maxDeg: 45, K: 0.30 },
      { maxDeg: 60, K: 0.50 },
      { maxDeg: 90, K: 0.80 },
      { maxDeg: Infinity, K: 1.00 }
    ]
  };

  function KfromTheta(thetaDeg) {
    const t = Math.abs(Number(thetaDeg) || 0);
    for (let i = 0; i < DEFAULTS.KbyAngle.length; i++) {
      if (t <= DEFAULTS.KbyAngle[i].maxDeg) return DEFAULTS.KbyAngle[i].K;
    }
    return 1;
  }

  function structureK(node, inflowPipes, outflowPipe) {
    if (!node || node.kind === 'outfall') {
      return { K: 0, thetaDeg: 0, note: 'outfall' };
    }
    let theta = node.bendDeg;
    let note = 'bendDeg entered';
    if (theta == null || theta === '') {
      const nIn = (inflowPipes || []).length;
      if (node.kind === 'junction' && nIn >= 2) {
        theta = 90;
        note = 'default θ=90° junction (≥2 inflows); HEC-22 approx K';
      } else {
        theta = 0;
        note = 'default θ=0° inline; HEC-22 approx K';
      }
    }
    return { K: KfromTheta(theta), thetaDeg: Number(theta), note: note };
  }

  function structureLoss(node, inflowPipes, outflowPipe, Qout, Vout) {
    const sk = structureK(node, inflowPipes, outflowPipe);
    const V = Number(Vout);
    if (!(V > 0) || sk.K === 0) return { Hs: 0, K: sk.K, note: sk.note };
    return { Hs: sk.K * (V * V) / (2 * G), K: sk.K, note: sk.note };
  }

  function analyzeNetwork(nodes, pipes, outfallTw) {
    const warnings = [];
    const top = validateTopology(nodes, pipes);
    if (!top.ok) {
      return {
        nodes: (nodes || []).map(function (n) { return Object.assign({}, n); }),
        pipes: (pipes || []).map(function (p) { return Object.assign({}, p); }),
        outfallId: top.outfallId,
        networkQ: null,
        worstSurcharge: null,
        passCount: 0,
        failCount: 0,
        errors: top.errors.slice(),
        warnings: warnings
      };
    }
    const acc = accumulate(nodes, pipes);
    const nodeById = Object.create(null);
    (nodes || []).forEach(function (n) {
      nodeById[n.id] = Object.assign({}, n, { HGL: null, Hs: null, surcharge: null });
    });
    let worked = acc.pipes.map(function (p) { return conveyPipe(p); });
    const pipeById = Object.create(null);
    worked.forEach(function (p) { pipeById[p.id] = p; });

    const inflowsOf = Object.create(null);
    worked.forEach(function (p) {
      (inflowsOf[p.toId] = inflowsOf[p.toId] || []).push(p);
    });

    const tw = outfallTw == null || outfallTw === '' ? null : Number(outfallTw);
    if (tw == null || !Number.isFinite(tw)) {
      warnings.push('Set outfall water-surface elevation (TW) to compute HGL');
      worked = worked.map(function (p) {
        return Object.assign({}, p, {
          HGLup: null, HGLdn: null, HsAtUp: null, surcharge: null, passHgl: null
        });
      });
    } else {
      nodeById[top.outfallId].HGL = tw;
      nodeById[top.outfallId].Hs = 0;
      nodeById[top.outfallId].surcharge =
        nodeById[top.outfallId].rim != null ? tw > Number(nodeById[top.outfallId].rim) : null;

      const pending = worked.slice();
      let guard = 0;
      while (pending.length && guard++ < 10000) {
        let progressed = false;
        for (let i = 0; i < pending.length; i++) {
          const p = pending[i];
          const dn = nodeById[p.toId];
          if (dn.HGL == null) continue;
          const up = nodeById[p.fromId];
          const sp = sectionProps(p);
          const Vout = p.V != null ? p.V : (sp.A > 0 && p.Q != null ? p.Q / sp.A : 0);
          const loss = structureLoss(up, inflowsOf[p.fromId] || [], p, p.Q, Vout);
          const hf = p.hf != null ? p.hf : 0;
          const HGLdn = dn.HGL;
          const HGLup = HGLdn + hf + loss.Hs;
          up.HGL = HGLup;
          up.Hs = loss.Hs;
          up.surcharge = up.rim != null ? HGLup > Number(up.rim) + DEFAULTS.freeboardFt : null;
          pipeById[p.id] = Object.assign({}, p, {
            HGLdn: HGLdn,
            HGLup: HGLup,
            HsAtUp: loss.Hs,
            surcharge: up.surcharge,
            passHgl: up.surcharge == null ? null : !up.surcharge
          });
          pending.splice(i, 1);
          i--;
          progressed = true;
        }
        if (!progressed) break;
      }
      worked = worked.map(function (p) { return pipeById[p.id] || p; });
    }

    let passCount = 0, failCount = 0, worst = null;
    worked.forEach(function (p) {
      if (p.passCap == null && p.passHgl == null) return;
      const capOk = p.passCap !== false;
      const hglOk = p.passHgl !== false;
      if (capOk && hglOk) passCount++;
      else failCount++;
    });
    Object.keys(nodeById).forEach(function (id) {
      const n = nodeById[id];
      if (n.surcharge && n.HGL != null && n.rim != null) {
        const s = n.HGL - Number(n.rim);
        if (worst == null || s > worst) worst = s;
      }
    });

    return {
      nodes: (nodes || []).map(function (n) { return nodeById[n.id]; }),
      pipes: worked,
      outfallId: top.outfallId,
      networkQ: acc.nodeQinThru[top.outfallId] != null ? acc.nodeQinThru[top.outfallId] : null,
      worstSurcharge: worst,
      passCount: passCount,
      failCount: failCount,
      errors: [],
      warnings: warnings
    };
  }
```

Export: add `DEFAULTS, structureK, structureLoss, analyzeNetwork, KfromTheta` to `API`.

- [ ] **Step 4: Run** `node storm/test.js` — expect `ok`.

- [ ] **Step 5: Commit**

```bash
git add storm/calc.js storm/test.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(storm): HEC-22 structure loss + upstream HGL walk"
```

---

### Task 4: calc — suggestSize

**Files:**
- Modify: `storm/calc.js`
- Modify: `storm/test.js`

**Interfaces:**
- Consumes: `STANDARD_SIZES`, `analyzeNetwork`, `sectionProps`
- Produces:
  - `nextSize(pipe) → Pipe|null` — next larger standard size same shape (null if already max / unsupported)
  - `pipePassing(analyzed, pipeId) → boolean`
  - `suggestSizePipe(nodes, pipes, outfallTw, pipeId) → { nodes, pipes, changed: boolean, pipeId, steps }`
  - `suggestSizesAll(nodes, pipes, outfallTw) → { nodes, pipes, changed: boolean, resized: string[] }`
  - `exampleNetwork() → { version, outfallTw, nodes, pipes }`
  - `isNetworkEmpty(nodes, pipes) → boolean`
  - Criteria per step: after re-analyze, pipe has `passCap === true` and upstream node not surcharged. Does not change connectivity.

- [ ] **Step 1: Append failing tests** before `console.log('ok')`:

```js
// --- suggestSize ---
const small = branched();
small.pipes = small.pipes.map(function (p) {
  if (p.id === 'p1') return Object.assign({}, p, { diameter: 1.0 }); // 12 in undersized for 10 cfs
  return p;
});
const sug = C.suggestSizePipe(small.nodes, small.pipes, 91.5, 'p1');
assert.ok(sug.changed);
const resized = sug.pipes.find(function (p) { return p.id === 'p1'; });
assert.ok(resized.diameter > 1.0);
const re = C.analyzeNetwork(sug.nodes, sug.pipes, 91.5);
const p1b = re.pipes.find(function (p) { return p.id === 'p1'; });
assert.strictEqual(p1b.passCap, true);

const nxt = C.nextSize(C.emptyPipe({ shape: 'circular', diameter: 2 })); // 24 in → 27 in
assert.ok(Math.abs(nxt.diameter - 27 / 12) < 1e-9);

const ex = C.exampleNetwork();
assert.strictEqual(ex.version, 1);
assert.ok(ex.outfallTw != null);
assert.ok(ex.nodes.length >= 4 && ex.pipes.length >= 3);
```

- [ ] **Step 2: Run** `node storm/test.js` — expect FAIL.

- [ ] **Step 3: Implement** before `const API`:

```js
  function nextSize(pipe) {
    if (!pipe) return null;
    if (pipe.shape === 'circular' || !pipe.shape) {
      const dIn = Math.round(Number(pipe.diameter) * 12);
      const list = STANDARD_SIZES.circularIn;
      let idx = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i] > dIn + 1e-9) { idx = i; break; }
        if (Math.abs(list[i] - dIn) < 1e-9) { idx = i + 1; break; }
      }
      if (idx < 0 || idx >= list.length) return null;
      return Object.assign({}, pipe, { diameter: list[idx] / 12, span: null, rise: null });
    }
    if (pipe.shape === 'box') {
      const B = Number(pipe.span);
      const D = Number(pipe.rise);
      const list = STANDARD_SIZES.boxFt;
      let found = false;
      for (let i = 0; i < list.length; i++) {
        if (!found) {
          if (Math.abs(list[i][0] - B) < 1e-9 && Math.abs(list[i][1] - D) < 1e-9) {
            found = true;
            continue;
          }
          if (list[i][0] * list[i][1] > B * D + 1e-9) {
            return Object.assign({}, pipe, { span: list[i][0], rise: list[i][1], diameter: null });
          }
        } else {
          return Object.assign({}, pipe, { span: list[i][0], rise: list[i][1], diameter: null });
        }
      }
      return null;
    }
    return null;
  }

  function pipePassing(analyzed, pipeId) {
    const p = analyzed.pipes.find(function (x) { return x.id === pipeId; });
    if (!p) return false;
    const up = analyzed.nodes.find(function (n) { return n.id === p.fromId; });
    const capOk = p.passCap === true;
    const hglOk = up && up.rim != null ? up.surcharge === false : p.passCap === true;
    return capOk && hglOk;
  }

  function suggestSizePipe(nodes, pipes, outfallTw, pipeId) {
    let cur = (pipes || []).map(function (p) { return Object.assign({}, p); });
    const ns = (nodes || []).map(function (n) { return Object.assign({}, n); });
    let steps = 0;
    let changed = false;
    const maxSteps = 30;
    while (steps++ < maxSteps) {
      const an = analyzeNetwork(ns, cur, outfallTw);
      if (pipePassing(an, pipeId)) {
        return { nodes: an.nodes, pipes: an.pipes, changed: changed, pipeId: pipeId, steps: steps - 1 };
      }
      const idx = cur.findIndex(function (p) { return p.id === pipeId; });
      if (idx < 0) break;
      const bigger = nextSize(cur[idx]);
      if (!bigger) {
        return { nodes: an.nodes, pipes: an.pipes, changed: changed, pipeId: pipeId, steps: steps - 1 };
      }
      cur[idx] = bigger;
      changed = true;
    }
    const finalAn = analyzeNetwork(ns, cur, outfallTw);
    return { nodes: finalAn.nodes, pipes: finalAn.pipes, changed: changed, pipeId: pipeId, steps: steps };
  }

  function suggestSizesAll(nodes, pipes, outfallTw) {
    let curP = (pipes || []).map(function (p) { return Object.assign({}, p); });
    const curN = (nodes || []).map(function (n) { return Object.assign({}, n); });
    const resized = [];
    let changed = false;
    let guard = 0;
    while (guard++ < 50) {
      const an = analyzeNetwork(curN, curP, outfallTw);
      const failing = an.pipes.filter(function (p) {
        return !pipePassing(an, p.id) && (p.shape === 'circular' || p.shape === 'box');
      });
      if (!failing.length) {
        return { nodes: an.nodes, pipes: an.pipes, changed: changed, resized: resized };
      }
      let any = false;
      failing.forEach(function (fp) {
        const idx = curP.findIndex(function (p) { return p.id === fp.id; });
        const bigger = nextSize(curP[idx]);
        if (bigger) {
          curP[idx] = bigger;
          if (resized.indexOf(fp.id) < 0) resized.push(fp.id);
          any = true;
          changed = true;
        }
      });
      if (!any) {
        const last = analyzeNetwork(curN, curP, outfallTw);
        return { nodes: last.nodes, pipes: last.pipes, changed: changed, resized: resized };
      }
    }
    const last = analyzeNetwork(curN, curP, outfallTw);
    return { nodes: last.nodes, pipes: last.pipes, changed: changed, resized: resized };
  }

  function exampleNetwork() {
    const of = emptyNode({ id: 'of', name: 'OF', kind: 'outfall', rim: 102, invert: 90, Qin: 0 });
    const mh1 = emptyNode({ id: 'mh1', name: 'MH-1', kind: 'manhole', rim: 105, invert: 94, Qin: 5, bendDeg: 0 });
    const in2 = emptyNode({ id: 'in2', name: 'IN-2', kind: 'inlet', rim: 106, invert: 96, Qin: 3 });
    const in3 = emptyNode({ id: 'in3', name: 'IN-3', kind: 'inlet', rim: 107, invert: 97, Qin: 2 });
    const exPipes = [
      emptyPipe({
        id: 'p1', fromId: 'mh1', toId: 'of', shape: 'circular', diameter: 1.5, n: 0.013,
        length: 200, ieUp: 94, ieDn: 90
      }),
      emptyPipe({
        id: 'p2', fromId: 'in2', toId: 'mh1', shape: 'circular', diameter: 1.25, n: 0.013,
        length: 100, ieUp: 96, ieDn: 94.2
      }),
      emptyPipe({
        id: 'p3', fromId: 'in3', toId: 'mh1', shape: 'circular', diameter: 1.0, n: 0.013,
        length: 80, ieUp: 97, ieDn: 94.5
      })
    ];
    return { version: 1, outfallTw: 91.5, nodes: [of, mh1, in2, in3], pipes: exPipes };
  }

  function isNetworkEmpty(nodes, pipes) {
    const n = nodes || [];
    const p = pipes || [];
    if (p.length > 0) return false;
    if (n.length === 0) return true;
    if (n.length === 1 && (!n[0].Qin || Number(n[0].Qin) === 0) && n[0].kind === 'outfall') return true;
    return n.every(function (x) {
      return (!x.Qin || Number(x.Qin) === 0) && (x.name === '' || x.name == null);
    }) && p.length === 0;
  }
```

Export: add `nextSize, suggestSizePipe, suggestSizesAll, exampleNetwork, isNetworkEmpty, pipePassing` to `API`.

- [ ] **Step 4: Run** `node storm/test.js` — expect `ok`.

- [ ] **Step 5: Commit**

```bash
git add storm/calc.js storm/test.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(storm): suggestSize standard circular/box steps"
```

---

### Task 5: UI shell — tables, persistence, toolbar stubs, selection

**Files:**
- Create: `storm/index.html`
- Create: `storm/style.css`
- Create: `storm/mobile.css`
- Create: `storm/mobile.js`
- Create: `storm/table.js`
- Create: `storm/viz.js` (stub only)

**Interfaces:**
- Consumes: `StormCalc` API from Tasks 1–4; `window.Culvert` via script tag `../culvert/calc.js`
- Produces: localStorage key `storm-network-v1` payload `{ version:1, outfallTw, nodes, pipes, selectedNodeId, selectedPipeId, pathEndNodeId }`; DOM ids: `nodesGrid`, `pipesGrid`, `viz`, `profileSvg`, `outfallTw`, `pathEnd`, `results`, toolbar buttons

- [ ] **Step 1: Create** `storm/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#1f4e79">
  <title>Storm Sewer – network + HGL</title>
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="mobile.css">
  <link rel="stylesheet" href="../home-btn.css">
</head>
<body>
<header>
  <a class="homebtn" href="../" aria-label="Back to Hydraulics Tools home">← Home</a>
  <h1>Storm Sewer</h1>
  <span>Branched network checker and sizer. Design Q at nodes (auto-sum on pipes). HGL from outfall TW upstream with HEC-22 structure losses. TxDOT HDM first; HEC-22 when HDM has no number (labeled).</span>
</header>
<div class="toolbar">
  <button type="button" id="addNode">Add node</button>
  <button type="button" id="addPipe">Add pipe</button>
  <button type="button" id="loadExample">Load example</button>
  <button type="button" id="suggestSizes">Suggest sizes</button>
  <button type="button" id="deleteSelected" class="danger">Delete</button>
  <label class="tw">Outfall TW (ft)
    <input id="outfallTw" type="number" inputmode="decimal" step="any" placeholder="elev">
  </label>
</div>
<div id="results" class="results" aria-live="polite"></div>
<div class="layout">
  <div class="tables">
    <h2 class="tbl-title">Nodes</h2>
    <div class="wrap"><table id="nodesGrid"></table></div>
    <h2 class="tbl-title">Pipes</h2>
    <div class="wrap"><table id="pipesGrid"></table></div>
  </div>
  <div id="viz" class="viz">
    <div class="viz-card">
      <h2>HGL profile</h2>
      <label class="path-pick">Path end
        <select id="pathEnd"></select>
      </label>
      <div id="profileSvg" class="viz-svg"></div>
    </div>
  </div>
</div>
<p class="cite" id="sources">
  Sources: TxDOT Hydraulic Design Manual — storm sewer / conduit criteria (as implemented).
  FHWA HEC-22 (Urban Drainage Design Manual) — access-hole / junction loss Hs = K V²/(2g) with approximate K by deflection angle (full relative-energy-loss factors out of v1); labeled where HDM has no number.
  Geometry / Manning: Culvert Studio helpers (<code>Culvert.geom</code>, <code>Culvert.normal</code>, <code>Culvert.MANNING</code>).
  Freeboard: HGL ≤ rim (DEFAULTS.freeboardFt = 0) — HDM universal freeboard not applied; engineering check labeled.
  Standard sizes: common RCP diameters and box span×rise increments in <code>STANDARD_SIZES</code>.
</p>
<script src="../culvert/calc.js"></script>
<script src="calc.js"></script>
<script src="viz.js"></script>
<script src="table.js"></script>
<script src="mobile.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create** `storm/style.css`:

```css
*{box-sizing:border-box}
body{margin:0;font:14px system-ui,sans-serif;background:#f3f5f8;color:#1d2733}
header{background:#1f4e79;color:#fff;padding:10px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{margin:0;font-size:20px}
header span{opacity:.85;flex:1;min-width:200px;font-size:13px;line-height:1.35}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;background:#fff;border-bottom:1px solid #d5dce5}
.toolbar button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:6px 14px;border-radius:6px;border:1px solid #1f4e79;background:#1f4e79;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer}
.toolbar button:hover{background:#163a5c}
.toolbar button.danger{background:#fff;color:#c0392b;border-color:#c0392b}
.toolbar button#loadExample{background:#fff;color:#1f4e79}
.toolbar .tw{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:13px;color:#556}
.toolbar .tw input{width:88px;padding:4px 8px;border:1px solid #c9d2dd;border-radius:6px;font-size:14px;min-height:36px}
.results{padding:8px 14px;background:#eaf1f8;border-bottom:1px solid #d5dce5;font-size:13px;color:#1f4e79;display:flex;flex-wrap:wrap;gap:12px 18px}
.results .bad{color:#a93226;font-weight:600}
.results .ok{color:#1e6b34;font-weight:600}
.tbl-title{margin:12px 14px 4px;font-size:15px;color:#1f4e79}
.wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:0 0 12px;background:#fff;margin:0 0 8px}
#nodesGrid,#pipesGrid{border-collapse:collapse;width:max-content;min-width:100%;font-size:12.5px}
#nodesGrid thead th,#pipesGrid thead th{position:sticky;top:0;z-index:2;background:#1f4e79;color:#fff;font-weight:600;padding:8px 6px;border:1px solid #163a5c;white-space:nowrap;text-align:center}
#nodesGrid tbody td,#pipesGrid tbody td{border:1px solid #e3e8ef;padding:2px;vertical-align:middle;white-space:nowrap}
#nodesGrid tbody tr:nth-child(even),#pipesGrid tbody tr:nth-child(even){background:#f8fafc}
#nodesGrid input,#nodesGrid select,#pipesGrid input,#pipesGrid select{width:100%;min-width:56px;border:0;background:transparent;padding:4px 5px;font:inherit}
#nodesGrid input:focus,#pipesGrid input:focus,#nodesGrid select:focus,#pipesGrid select:focus{outline:2px solid #1f4e79;outline-offset:-2px;background:#fff}
td.in{background:#fff4e0}
td.out{background:#eef5ff;text-align:right;padding:4px 6px}
td.out.ok{background:#e8f7ec;color:#1e6b34;font-weight:600}
td.out.bad{background:#fdecea;color:#a93226;font-weight:600}
#nodesGrid tbody tr.selected,#pipesGrid tbody tr.selected{outline:2px solid #1f4e79;outline-offset:-2px;background:#eaf1f8}
.viz{display:flex;flex-direction:column;gap:12px;padding:12px 14px;background:#f3f5f8}
.viz-card{background:#fff;border:1px solid #d5dce5;border-radius:10px;padding:10px 12px}
.viz-card h2{margin:0 0 8px;font-size:15px;color:#1f4e79}
.viz-svg{min-height:180px;width:100%}
.viz-svg svg{width:100%;height:auto;display:block}
.path-pick{display:flex;align-items:center;gap:8px;font-size:13px;color:#556;margin-bottom:8px}
.path-pick select{min-height:36px;font-size:14px}
.cite{font-size:12px;color:#556;padding:8px 14px 20px;line-height:1.45;max-width:960px}
@media (min-width:900px){
  .layout{display:grid;grid-template-columns:1fr minmax(300px,380px);align-items:start}
  .layout .tables{grid-column:1}
  .layout .viz{grid-column:2;position:sticky;top:8px;max-height:calc(100vh - 16px);overflow:auto}
}
```

- [ ] **Step 3: Create** `storm/mobile.css`:

```css
html{-webkit-text-size-adjust:100%}
@media (max-width:700px){
  body{font-size:15px;padding-bottom:env(safe-area-inset-bottom)}
  header{padding:calc(8px + env(safe-area-inset-top)) 12px 8px;gap:6px}
  header h1{font-size:18px}
  header span{flex:1 1 100%;font-size:12px}
  .toolbar{padding:8px 10px;gap:8px}
  .toolbar button{min-height:44px;font-size:16px;padding:8px 14px}
  .toolbar .tw{margin-left:0;width:100%;font-size:14px}
  .toolbar .tw input{min-height:44px;font-size:16px;width:110px;padding:6px 10px}
  #nodesGrid,#pipesGrid{font-size:13px}
  #nodesGrid input,#nodesGrid select,#pipesGrid input,#pipesGrid select{min-height:44px;font-size:16px;padding:6px 8px;min-width:72px}
  .path-pick select{min-height:44px;font-size:16px}
  .cite{padding:8px 12px 24px;font-size:12.5px}
}
@media (hover:none),(pointer:coarse){
  .toolbar button{touch-action:manipulation;min-height:44px;font-size:16px}
  #nodesGrid input,#nodesGrid select,#pipesGrid input,#pipesGrid select,.toolbar .tw input,.path-pick select{min-height:44px;font-size:16px}
}
```

- [ ] **Step 4: Create** `storm/mobile.js`:

```js
(function () {
  // Reserved for future tap helpers; keeps parity with ditch-table/mobile.js include.
})();
```

- [ ] **Step 5: Create stub** `storm/viz.js`:

```js
(function (root) {
  function renderProfile(el, analyzed, pathNodeIds) {
    if (!el) return;
    el.innerHTML = '<p class="viz-empty">HGL profile loading…</p>';
  }
  function pathFromOutfall(analyzed, endNodeId) {
    return [];
  }
  const API = { renderProfile: renderProfile, pathFromOutfall: pathFromOutfall };
  if (typeof module !== 'undefined') module.exports = API;
  else root.StormViz = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 6: Create** `storm/table.js`:

```js
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
```

- [ ] **Step 7: Smoke**

```bash
node storm/test.js
node -e "require('./storm/viz.js'); const fs=require('fs'); const h=fs.readFileSync('storm/index.html','utf8'); if(!/storm-network-v1/.test(fs.readFileSync('storm/table.js','utf8'))) process.exit(1); if(!/Add node/.test(h)||!/viz\.js/.test(h)) process.exit(1); console.log('ok');"
```

Expected: `ok` twice.

- [ ] **Step 8: Commit**

```bash
git add storm/index.html storm/style.css storm/mobile.css storm/mobile.js storm/table.js storm/viz.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(storm): UI shell tables, persistence, toolbar"
```

---

### Task 6: viz HGL profile + wire refresh

**Files:**
- Modify: `storm/viz.js` (replace stubs)
- Modify: `storm/test.js` (append Node smoke via fake el)

**Interfaces:**
- Consumes: `analyzed` from `analyzeNetwork`; `pathEndNodeId`
- Produces:
  - `pathFromOutfall(analyzed, endNodeId) → string[]` node ids from outfall → end (inclusive)
  - `pipesAlong(analyzed, pathNodeIds) → Pipe[]`
  - `renderProfile(el, analyzed, pathNodeIds)` — SVG: ground/rim, pipe invert + crown, HGL; empty states when TW null or path incomplete; colors `#1f4e79` family

- [ ] **Step 1: Append smoke test** before `console.log('ok')` in `storm/test.js`:

```js
// --- viz path + svg smoke ---
const V = require('./viz.js');
const demo = C.analyzeNetwork(C.exampleNetwork().nodes, C.exampleNetwork().pipes, 91.5);
const pathIds = V.pathFromOutfall(demo, 'in2');
assert.ok(pathIds.indexOf('of') >= 0);
assert.ok(pathIds.indexOf('mh1') >= 0 && pathIds.indexOf('in2') >= 0);
assert.strictEqual(pathIds[0], 'of');
const el = { innerHTML: '' };
V.renderProfile(el, demo, pathIds);
assert.ok(/svg/i.test(el.innerHTML));
assert.ok(/path/i.test(el.innerHTML));
const emptyEl = { innerHTML: '' };
V.renderProfile(emptyEl, C.analyzeNetwork(C.exampleNetwork().nodes, C.exampleNetwork().pipes, null), pathIds);
assert.ok(/TW|outfall|water-surface|empty/i.test(emptyEl.innerHTML));
```

- [ ] **Step 2: Run** `node storm/test.js` — expect FAIL on path/svg assertions.

- [ ] **Step 3: Replace** `storm/viz.js` with:

```js
(function (root) {
  function pathFromOutfall(analyzed, endNodeId) {
    if (!analyzed || !analyzed.outfallId || !endNodeId) return [];
    const parent = Object.create(null);
    (analyzed.pipes || []).forEach(function (p) {
      parent[p.fromId] = p.toId;
    });
    const up = [];
    let cur = endNodeId;
    const guard = Object.create(null);
    while (cur && !guard[cur]) {
      guard[cur] = true;
      up.push(cur);
      if (cur === analyzed.outfallId) break;
      cur = parent[cur];
    }
    if (up[up.length - 1] !== analyzed.outfallId) return [];
    return up.reverse();
  }

  function pipesAlong(analyzed, pathNodeIds) {
    const out = [];
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const dn = pathNodeIds[i];
      const up = pathNodeIds[i + 1];
      const p = (analyzed.pipes || []).find(function (x) {
        return x.fromId === up && x.toId === dn;
      });
      if (p) out.push(p);
    }
    return out;
  }

  function crownOf(p) {
    if (p.shape === 'box') return Number(p.rise) || 0;
    return Number(p.diameter) || 0;
  }

  function renderProfile(el, analyzed, pathNodeIds) {
    if (!el) return;
    if (!analyzed) {
      el.innerHTML = '<p class="viz-empty">No network</p>';
      return;
    }
    if (analyzed.warnings && analyzed.warnings.some(function (w) { return /TW|outfall/i.test(w); }) &&
        (analyzed.pipes || []).every(function (p) { return p.HGLup == null; })) {
      el.innerHTML = '<p class="viz-empty">Set outfall water-surface elevation (TW) to draw HGL</p>';
      return;
    }
    pathNodeIds = pathNodeIds || [];
    if (pathNodeIds.length < 2) {
      el.innerHTML = '<p class="viz-empty">Select a path end node to sketch the profile</p>';
      return;
    }
    const segs = pipesAlong(analyzed, pathNodeIds);
    if (!segs.length) {
      el.innerHTML = '<p class="viz-empty">Incomplete connectivity along selected path</p>';
      return;
    }
    const nodeById = Object.create(null);
    (analyzed.nodes || []).forEach(function (n) { nodeById[n.id] = n; });

    let x = 0;
    const inv = [];
    const crown = [];
    const rim = [];
    const hgl = [];
    const labels = [];
    const of = nodeById[pathNodeIds[0]];
    inv.push({ x: 0, y: of && of.invert != null ? Number(of.invert) : segs[0].ieDn });
    rim.push({ x: 0, y: of && of.rim != null ? Number(of.rim) : null });
    hgl.push({
      x: 0,
      y: of && of.HGL != null ? Number(of.HGL) : (segs[0].HGLdn != null ? Number(segs[0].HGLdn) : null)
    });
    crown.push({ x: 0, y: inv[0].y != null ? inv[0].y + crownOf(segs[0]) : null });
    labels.push({ x: 0, name: (of && of.name) || pathNodeIds[0] });

    segs.forEach(function (p) {
      const L = Number(p.length) || 0;
      x += L;
      const upN = nodeById[p.fromId];
      inv.push({
        x: x,
        y: p.ieUp != null ? Number(p.ieUp) : (upN && upN.invert != null ? Number(upN.invert) : null)
      });
      crown.push({ x: x, y: inv[inv.length - 1].y != null ? inv[inv.length - 1].y + crownOf(p) : null });
      rim.push({ x: x, y: upN && upN.rim != null ? Number(upN.rim) : null });
      hgl.push({
        x: x,
        y: p.HGLup != null ? Number(p.HGLup) : (upN && upN.HGL != null ? Number(upN.HGL) : null)
      });
      labels.push({ x: x, name: (upN && upN.name) || p.fromId });
    });

    const ys = [];
    [inv, crown, rim, hgl].forEach(function (arr) {
      arr.forEach(function (pt) {
        if (pt.y != null && Number.isFinite(pt.y)) ys.push(pt.y);
      });
    });
    if (!ys.length) {
      el.innerHTML = '<p class="viz-empty">Enter invert / rim elevations to see the profile</p>';
      return;
    }
    let xmin = 0, xmax = x, ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    if (ymax - ymin < 0.5) { ymax += 0.25; ymin -= 0.25; }
    const W = 360, H = 200, padL = 44, padR = 12, padT = 28, padB = 36;
    const sx = function (v) {
      return padL + ((v - xmin) / Math.max(xmax - xmin, 1e-6)) * (W - padL - padR);
    };
    const sy = function (v) {
      return H - padB - ((v - ymin) / Math.max(ymax - ymin, 1e-6)) * (H - padT - padB);
    };
    function poly(arr, stroke, width, dash) {
      const pts = arr.filter(function (pt) { return pt.y != null; });
      if (pts.length < 2) return '';
      let d = 'M' + sx(pts[0].x) + ',' + sy(pts[0].y);
      for (let i = 1; i < pts.length; i++) d += ' L' + sx(pts[i].x) + ',' + sy(pts[i].y);
      return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + width + '"' +
        (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
    }
    const legend =
      '<text x="' + padL + '" y="14" font-size="11" fill="#1f4e79">Invert</text>' +
      '<line x1="' + (padL + 40) + '" y1="10" x2="' + (padL + 62) + '" y2="10" stroke="#1f4e79" stroke-width="2"/>' +
      '<text x="' + (padL + 70) + '" y="14" font-size="11" fill="#6b7280">Crown</text>' +
      '<line x1="' + (padL + 112) + '" y1="10" x2="' + (padL + 134) + '" y2="10" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<text x="' + (padL + 142) + '" y="14" font-size="11" fill="#2b6ea3">HGL</text>' +
      '<line x1="' + (padL + 172) + '" y1="10" x2="' + (padL + 194) + '" y2="10" stroke="#4a9fe0" stroke-width="2.5"/>' +
      '<text x="' + (padL + 202) + '" y="14" font-size="11" fill="#15803d">Rim</text>' +
      '<line x1="' + (padL + 230) + '" y1="10" x2="' + (padL + 252) + '" y2="10" stroke="#15803d" stroke-width="1.5" stroke-dasharray="2 2"/>';
    const lab = labels.map(function (L) {
      return '<text x="' + sx(L.x) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#556">' +
        String(L.name).replace(/</g, '') + '</text>';
    }).join('');
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Storm sewer HGL profile">' +
      legend +
      poly(rim, '#15803d', 1.5, '2 2') +
      poly(crown, '#6b7280', 1.5, '4 3') +
      poly(inv, '#1f4e79', 2) +
      poly(hgl, '#4a9fe0', 2.5) +
      lab +
      '</svg>';
  }

  const API = { renderProfile: renderProfile, pathFromOutfall: pathFromOutfall, pipesAlong: pipesAlong };
  if (typeof module !== 'undefined') module.exports = API;
  else root.StormViz = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run** `node storm/test.js` — expect `ok`.

- [ ] **Step 5: Commit**

```bash
git add storm/viz.js storm/test.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(storm): SVG HGL profile along selected path"
```

---

### Task 7: Load example + home card + check-home.js + controller publish checklist

**Files:**
- Modify: `index.html` (insert Storm Sewer card after Drainage Studio)
- Modify: `scripts/check-home.js`
- Modify: `home.css` (`.tool-storm` accent)
- Verify: `storm/calc.js` `exampleNetwork` + `table.js` `onLoadExample` (shipped in Tasks 4–5)

**Interfaces:**
- Consumes: existing home card markup pattern
- Produces: card order Tc → Drainage → **Storm Sewer** → Ditch → Culvert; `node scripts/check-home.js` → `ok`

- [ ] **Step 1: Replace** `scripts/check-home.js` with:

```js
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
let bad = 0;
const fail = (m) => { console.error(m); bad++; };
if (!html.includes('Drainage Studio')) fail('missing hero title Drainage Studio');
if (!html.includes('home.css')) fail('missing home.css link');
const hrefs = [
  'rational/index.html',
  'drainage/index.html',
  'storm/index.html',
  'ditch-table/index.html',
  'culvert/index.html',
];
const classes = ['tool-tc', 'tool-drainage', 'tool-storm', 'tool-ditch', 'tool-culvert'];
for (const h of hrefs) {
  if (!html.includes('href="' + h + '"')) fail('missing href ' + h);
}
for (const c of classes) {
  if (!html.includes(c)) fail('missing class ' + c);
}
const idx = hrefs.map((h) => html.indexOf('href="' + h + '"'));
for (let k = 1; k < idx.length; k++) {
  if (idx[k] < idx[k - 1]) fail('wrong card order near ' + hrefs[k]);
}
for (const name of ['Tc Studio', 'Drainage Studio', 'Storm Sewer', 'Ditch', 'Culvert Studio']) {
  if (!html.includes(name)) fail('missing label ' + name);
}
if (html.includes('Ditch Studio') || html.includes('Ditch Table')) fail('old separate ditch cards still present');
if (html.includes('href="ditch/index.html"')) fail('home still links to ditch/index.html');
if (bad) process.exit(1);
console.log('ok');
```

- [ ] **Step 2: Run** `node scripts/check-home.js` — expect FAIL (missing storm card).

- [ ] **Step 3: Insert card** in `index.html` immediately after the Drainage Studio `</a>` and before the Ditch card:

```html
  <a class="tool tool-storm" href="storm/index.html">
    <div class="accent" aria-hidden="true"></div>
    <div class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 10h16"/>
        <path d="M6 10v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>
        <path d="M9 7v3M15 7v3"/>
        <circle cx="12" cy="14" r="1.5"/>
      </svg>
    </div>
    <div class="body">
      <h2>Storm Sewer</h2>
      <p>Network table, HGL profile, suggest size</p>
      <span class="chip">TxDOT HDM · HEC-22</span>
    </div>
  </a>
```

- [ ] **Step 4: Add** `.tool-storm` colors in `home.css` (after `.tool-drainage` rules):

```css
.tool-storm .accent{background:#0e7490}
.tool-storm .icon{background:#cffafe;color:#0e7490}
```

- [ ] **Step 5: Run checks**

```bash
node scripts/check-home.js
node storm/test.js
```

Expected: `ok` / `ok`.

Manual: phone-width — Load example; edit Qin; see pipe Q + profile update; Suggest sizes grows deliberate undersize.

- [ ] **Step 6: Commit**

```bash
git add index.html home.css scripts/check-home.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(home): Storm Sewer card after Drainage Studio"
```

- [ ] **Step 7: Controller publish checklist** (do not push from agent)

- Re-run `node storm/test.js` → `ok`
- Re-run `node scripts/check-home.js` → `ok`
- Report SHAs; controller pushes `main` and waits for Pages
- Spot-check `/storm/` on phone-width after Pages deploy

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Branched topology + one outfall validation | 1 |
| Design Q at nodes; pipe Q = upstream Qin sum | 1 |
| Persist `storm-network-v1` | 5 |
| Node / Pipe fields (incl. HEC-22 extras bendDeg, ahDiameter) | 1 + 5 |
| Manning conveyance circular + box; reuse `Culvert.geom` / `normal` / `MANNING` | 2 |
| Other HDM shapes stub with clear err (v1 simplification) | 2 |
| Friction hf | 2 |
| HEC-22 structure loss Hs=K V²/2g + documented defaults | 3 |
| HGL from outfall TW upstream; null TW empty state | 3 |
| Surcharge when HGL > rim (freeboard 0, labeled) | 3 |
| Suggest size standard steps; re-analyze; no layout change | 4 |
| UI: header, toolbar ≥44px, nodes+pipes tables, results strip | 5 |
| Selection + Delete | 5 |
| SVG HGL profile path selection; colors `#1f4e79` | 6 |
| Load example branched + confirm if non-empty | 4 + 5 + 7 |
| Home card after Drainage; `check-home.js` order | 7 |
| Sources card TxDOT HDM / HEC-22 / Culvert helpers | 5 |
| `node storm/test.js` → `ok` | 1–4, 6 |
| Out of v1: map canvas, Drainage/Tc handoff, pumps, unsteady, PDF | (excluded) |

## Self-review notes

- Spec “pipe shapes: full HDM set” → Task 2 implements circular+box fully and stubs others with explicit `err` (listed under Intentional v1 simplifications).
- Spec “HEC-22 from structure geometry” → Task 3 uses bendDeg + kind defaults; `ahDiameter` stored for future full relative method but not required in K lookup in v1.
- Spec path default “longest path or path through selected pipe” → Task 5 sets `pathEndNodeId` from selected node/pipe; Task 6 walks outfall→end.
- No unfinished placeholders remain; interfaces named consistently (`analyzeNetwork`, `suggestSizesAll`, `pathFromOutfall`, `renderProfile`).
- Home order matches spec: Storm Sewer **after** Drainage Studio (before Ditch / Culvert).
