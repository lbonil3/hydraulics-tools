/* TxDOT Precertification helper: the single "Next step" line, from the readiness / years / write-up checks (pure, testable). */
(function (root) {
  'use strict';
  function nextStep(st, C, M, Q) {
    var P = st.profile, ix = M.catIndex(C);
    if (!String(P.first).trim() || !String(P.last).trim()) return { text: 'Add your first and last name in My profile.', tab: 'profile', focus: !String(P.first).trim() ? 'f-first-p' : 'f-last-p' };
    if (!st.targets.length) return { text: 'Choose the work categories you want to apply for.', tab: 'cats', focus: 'catQ' };
    if (!st.projects.length) return { text: 'Add a project that shows your experience in ' + st.targets[0] + '.', tab: 'projects', focus: 'addProject' };
    var R = M.readiness(st, C);
    for (var i = 0; i < R.length; i++) { var r = R[i], k = r.cat.code;
      if (!r.entries.length) return { text: k + ': no project includes this category yet — add it to a project you worked on.', tab: 'projects' };
      for (var j = 0; j < r.entries.length; j++) { var x = r.entries[j], q = Q.check(x.e.text, M.checklist(r.cat), x.e.covers);
        if (q.light === 'red') return { text: k + ' on ' + (x.p.name || 'Untitled project') + ': ' + (q.flags[0] ? q.flags[0].msg : 'write-up not ready') + (q.hints[0] ? ' ' + q.hints[0] : ''), tab: 'projects', project: x.p.id, entry: x.e.id }; }
      var miss = r.rows.filter(function (y) { return y.item.kind === 'req' && !y.by.length; })[0];
      if (miss) return { text: k + ': address the requirement "' + miss.item.text.slice(0, 110) + (miss.item.text.length > 110 ? '…' : '') + '" in a write-up and tick it.', tab: 'projects', project: r.entries[0].p.id, entry: r.entries[0].e.id };
      if (r.yearsCheck.status === 'fail') return { text: k + ': ' + r.yearsCheck.msg + ' Add the dates of other projects where you did this work (only real experience).', tab: 'ready' };
    }
    var ck = M.formCheck(st, C);
    if (ck.missing.length) return { text: 'TxDOT form: fill the mandatory field ' + ck.missing[0] + '.', tab: 'form' };
    for (i = 0; i < R.length; i++) { if (R[i].yearsCheck.status === 'unknown') return { text: R[i].cat.code + ': ' + R[i].yearsCheck.msg, tab: 'ready' }; }
    for (i = 0; i < R.length; i++) { for (j = 0; j < R[i].entries.length; j++) { x = R[i].entries[j]; q = Q.check(x.e.text, M.checklist(R[i].cat), x.e.covers); if (q.light === 'amber') return { text: R[i].cat.code + ' on ' + (x.p.name || 'Untitled project') + ': ' + (q.hints[0] || 'add detail.'), tab: 'projects', project: x.p.id, entry: x.e.id }; } }
    var g = R.filter(function (r) { return !r.ready; })[0];
    if (g) return { text: g.cat.code + ': ' + g.gaps[0], tab: /profile|P\.E\./.test(g.gaps[0]) ? 'profile' : 'ready', focus: /P\.E\./.test(g.gaps[0]) ? 'f-peNumber-p' : null };
    return { text: 'All checks pass — download the filled TxDOT form and enter it in CCIS.', tab: 'form', done: true };
  }
  var api = { nextStep: nextStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PCG = api;
})(this);
