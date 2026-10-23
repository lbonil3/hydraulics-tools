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

  const API = {
    KM: KM, G: G, emptyNode: emptyNode, emptyPipe: emptyPipe,
    validateTopology: validateTopology, accumulate: accumulate,
    STANDARD_SIZES: STANDARD_SIZES, sectionProps: sectionProps, slopeOf: slopeOf,
    fullFlowCapacity: fullFlowCapacity, frictionHf: frictionHf, conveyPipe: conveyPipe,
    getCulvert: getCulvert
  };
  if (typeof module !== 'undefined') module.exports = API;
  else root.StormCalc = API;
})(typeof window !== 'undefined' ? window : globalThis);
