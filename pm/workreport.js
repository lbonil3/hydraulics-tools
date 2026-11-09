/* Project Tracker v3.18: work description. What each package will cover, derived from the tracker.
   A carried sheet is described inside the same pond, road, box, or section as its original, and it counts in that package.
   Not a status report: no percent complete, no status counts. Browser: window.PMWork. Node: require('./workreport.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.PMWork = factory(root.PMModel);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  function pl(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function list(a) {
    const xs = a.filter(Boolean);
    return xs.length < 2 ? (xs[0] || '') : xs.length === 2 ? xs[0] + ' and ' + xs[1] : xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1];
  }
  function staRoad(r) { return r.road + (M.hasSta(r) ? ' (Sta ' + M.formatStation(r.start) + ' to ' + M.formatStation(r.end) + ')' : ''); }
  function own(g) { return (g.sheets || []).filter((s) => !M.isCarryOn(s)); }
  function pkgHead(sub) { return 'Package ' + sub.code + (M.subCustom(sub) ? ' (' + M.subName(sub) + ')' : ''); }
  function packageText(st, sub) {
    const bits = [];
    const trunk = M.secOf(sub, 'dr-trunk');
    if (trunk && M.roadsOf(sub, trunk).length) bits.push('drainage trunk lines along ' + list(M.roadsOf(sub, trunk).map(staRoad)));
    const pp = M.secOf(sub, 'dr-pp');
    if (pp && M.roadsOf(sub, pp).length) bits.push('drainage plan and profile along ' + list(M.roadsOf(sub, pp).map(staRoad)));
    const lat = M.secOf(sub, 'dr-lat');
    const latN = lat ? lat.sheets.length : 0;
    if (latN) bits.push(pl(latN, 'drainage lateral sheet'));
    const det = M.secOf(sub, 'dr-det');
    if (det) {
      const gs = M.viewUnitGroups(st, det).filter((g) => g.sheets.length);
      if (gs.length) bits.push(pl(gs.length, 'detention pond') + ' (' + list(gs.map((g) => g.name)) + ') with layout, cross sections and geometric layouts');
    }
    const jb = M.secOf(sub, 'dr-jb');
    if (jb) {
      const gs = M.viewUnitGroups(st, jb).filter((g) => g.sheets.length);
      if (gs.length) bits.push(pl(gs.length, 'special junction box', 'special junction boxes'));
    }
    const covered = new Set(['dr-trunk', 'dr-pp', 'dr-lat', 'dr-det', 'dr-jb', 'dr-std']);
    for (const g of M.sectionsOf(sub, 'Drainage')) {
      if (covered.has(g.key)) continue;
      const n = own(g).length;
      if (n) bits.push(g.title.toLowerCase() + ' (' + pl(n, 'sheet') + ')');
    }
    const std = M.secOf(sub, 'dr-std');
    if (std) {
      const names = own(std).map((s) => s.title).filter(Boolean);
      if (names.length) bits.push('drainage standards ' + list(names.slice(0, 12)) + (names.length > 12 ? ', and ' + (names.length - 12) + ' more' : ''));
    }
    for (const g of M.sectionsOf(sub, 'SWP3')) {
      const n = own(g).length;
      if (!n) continue;
      if (M.isPPSec(g) && M.roadsOf(sub, g).length) bits.push('SWP3 layout along ' + list(M.roadsOf(sub, g).map(staRoad)));
      else if (g.key === 'sw-std') bits.push('SWP3 standard details ' + list(own(g).map((s) => s.title).filter(Boolean).slice(0, 8)));
      else bits.push(g.title + ' (' + pl(n, 'sheet') + ')');
    }
    const carries = M.allSheets(st).filter((r) => r.sub === sub && M.isCarryOn(r.sh));
    if (carries.length) {
      bits.push('carries on and updates ' + list(carries.map((r) => {
        const o = M.carryOrigin(st, r.sh);
        return '“' + (o ? o.sh.title : r.sh.title) + '” from Package ' + (o ? o.sub.code : '?');
      })));
    }
    const outgoing = M.allSheets(st).filter((r) => r.sub === sub && !M.isCarryOn(r.sh) && M.carriersOf(st, r.sh.id).length);
    if (outgoing.length) {
      bits.push('carried forward: ' + list(outgoing.map((r) => '“' + r.sh.title + '” by ' + list(M.carriersOf(st, r.sh.id).map((c) => 'Package ' + c.sub.code)))));
    }
    const local = M.allSheets(st).filter((r) => r.sub === sub).length;
    if (!bits.length) return { code: sub.code, label: M.subLabel(sub), text: pkgHead(sub) + ' has no plan work entered yet.', sheets: 0, carried: 0 };
    const tail = local ? ' That is ' + pl(local, 'sheet') + ' in this package' + (carries.length ? ', including ' + pl(carries.length, 'sheet') + ' carried on from another package' : '') + '.' : '';
    return { code: sub.code, label: M.subLabel(sub), text: pkgHead(sub) + ': ' + bits.join('; ') + '.' + tail, sheets: local, carried: carries.length };
  }
  function relations(st) {
    const lines = [];
    for (const r of M.allSheets(st)) {
      if (M.isCarryOn(r.sh)) continue;
      const cs = M.carriersOf(st, r.sh.id);
      if (!cs.length) continue;
      lines.push(list(cs.map((c) => 'Package ' + c.sub.code)) + ' carries on and updates “' + r.sh.title + '” from Package ' + r.sub.code);
    }
    return lines;
  }
  function build(st) {
    const subs = M.orderedSubs(st);
    const packages = subs.map((s) => packageText(st, s));
    const allN = M.allSheets(st).length;
    const uniq = M.allSheets(st).filter((r) => !M.isCarryOn(r.sh)).length;
    const rel = relations(st);
    const intro = (st.project.name ? st.project.name + ' is' : 'This project is') + ' organized into ' + pl(subs.length, 'package') + ': ' + list(subs.map((s) => s.code + (M.subCustom(s) ? ' (' + M.subName(s) + ')' : ''))) + '. ' +
      'Each package below is the plan work entered for it: the branches, the sections, and what each one covers. ' +
      (allN ? 'There are ' + pl(allN, 'plan sheet') + ' across the packages. A carried sheet counts in each package that has it' + (uniq !== allN ? ' (' + pl(uniq, 'unique plan sheet') + ')' : '') + '. ' : 'No plan sheets are entered yet. ') +
      (rel.length ? rel.join('. ') + '.' : 'No package carries a sheet forward from another.');
    return { intro, packages, relations: rel };
  }
  function text(st) {
    const b = build(st);
    return [b.intro, ''].concat(b.packages.map((p) => p.text)).join('\n\n');
  }
  return { build, text };
});
