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

// --- HGL lower bound (Important 1) + surcharged full-flow Hs (Important 2) ---
const lowTwNet = branched();
const lowTw = C.analyzeNetwork(lowTwNet.nodes, lowTwNet.pipes, 85); // well below inverts
assert.strictEqual(lowTw.errors.length, 0);
lowTw.pipes.forEach(function (p) {
  if (p.HGLup == null || !Number.isFinite(p.HGLup)) return;
  assert.ok(
    p.HGLup >= Number(p.ieUp) - 1e-6,
    'pipe ' + p.id + ' HGLup=' + p.HGLup + ' below ieUp=' + p.ieUp
  );
});
assert.ok(
  lowTw.warnings.some(function (w) { return /HGL raised|lower bound/i.test(w); }),
  'expected HGL floor warning'
);

// Q > Qfull → surcharged path: no throw; passHgl/surcharge set; Hs finite via full-flow V
const surNet = branched();
// Shrink main so Q=10 exceeds Qfull; high TW so HGL walks without needing floor only
surNet.pipes = surNet.pipes.map(function (p) {
  if (p.id !== 'p1') return p;
  return Object.assign({}, p, { diameter: 0.75, length: 200, ieUp: 94, ieDn: 90 });
});
const surAnalyzed = C.analyzeNetwork(surNet.nodes, surNet.pipes, 93);
assert.strictEqual(surAnalyzed.errors.length, 0);
const surP1 = surAnalyzed.pipes.find(function (p) { return p.id === 'p1'; });
assert.ok(surP1.Qfull != null && surP1.Q > surP1.Qfull, 'expect Q>Qfull on p1');
assert.ok(Number.isFinite(surP1.HsAtUp), 'HsAtUp finite under surcharge');
assert.ok(surP1.passHgl !== undefined);
assert.ok(surP1.surcharge !== undefined);
const mhSur = surAnalyzed.nodes.find(function (n) { return n.id === 'mh1'; });
assert.ok(mhSur.Hs != null && Number.isFinite(mhSur.Hs));
// Full-flow V path: Hs should match K·(Q/Afull)²/(2g) for manhole default θ=0 → K=0.10
const spSur = C.sectionProps(surP1);
const Vfull = surP1.Q / spSur.A;
const skSur = C.structureK(mhSur, [surAnalyzed.pipes.find(function (p) { return p.id === 'p2'; }), surAnalyzed.pipes.find(function (p) { return p.id === 'p3'; })], surP1);
const HsExpect = skSur.K * (Vfull * Vfull) / (2 * C.G);
assert.ok(Math.abs(mhSur.Hs - HsExpect) < 1e-6, 'Hs should use full-flow V when surcharged');

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

console.log('ok');
