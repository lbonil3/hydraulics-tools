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
