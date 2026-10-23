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
