/* TxDOT Precertification helper: write-up QUALITY checker (deterministic text checks; never writes experience for you). */
(function (root) {
  'use strict';
  var VERBS = /\bI\s+(designed|analy[sz]ed|computed|calculated|prepared|modell?ed|developed|performed|evaluated|reviewed|managed|led|sized|checked|determined|delineated|coordinated|ran|built|created|estimated|selected|routed|inspected|wrote|produced|verified|applied|used)\b/gi;
  var METHODS = [[/rational method/i, 'Rational Method'], [/hec-?ras/i, 'HEC-RAS'], [/hec-?hms/i, 'HEC-HMS'], [/hec-?18|hec-?22|hds-?5|hec-?\d+/i, 'FHWA HEC/HDS circulars'], [/hydraulic design manual|\bhdm\b/i, 'TxDOT Hydraulic Design Manual'], [/hy-?8\b/i, 'HY-8'], [/storm ?cad|bentley|openflows|geopak|winstorm|culvertmaster|flowmaster/i, 'StormCAD / Bentley / other software'],
    [/roadway design manual/i, 'TxDOT Roadway Design Manual'], [/\bfema\b|\bc?lomr\b|\bnfip\b/i, 'FEMA'], [/permit|section 404|\b404\b|\bnwp\b|swp3|tpdes|\bms4\b/i, 'permits'], [/\bnrcs\b|\bscs\b|unit hydrograph|\batlas 14\b|\bnoaa\b/i, 'NRCS / Atlas 14'], [/\baashto\b|\bfhwa\b|\bastm\b|\bdrainage criteria\b|criteria manual/i, 'AASHTO / FHWA / criteria manual'], [/\bswmm\b|\bxpswmm\b|\binfoworks\b|\bicpr\b|\bmike\b|\btuflow\b|\bsrh-?2d\b|\bcivil ?3d\b|\bmicrostation\b/i, 'other model / software']];
  var QTY = /\b\d[\d,.]*\s*(?:-?\s*(?:year|yr)\b|ft\b|feet\b|foot\b|in\b|inch(?:es)?\b|"|cfs\b|acres?\b|ac\b|mi(?:les?)?\b|lf\b|linear feet\b|sq\.?\s?(?:ft|mi)|%|percent\b|mph\b|cy\b|tons?\b|inlets?\b|culverts?\b|lanes?\b|ponds?\b|crossings?\b|sheets?\b)|\b\d+\s*[x×]\s*\d+\b|\$\s?\d/i;
  var STOP = 'which their there these those shall other about within under including includes include associated category firm must employ employs professional engineer engineers minimum years experience demonstrated tasks following performing provide providing state federal analysis design designs perform related least'.split(' ');
  function terms(text) { var w = String(text).toLowerCase().replace(/\(.*?\)/g, ' ').match(/[a-z][a-z/-]{4,}/g) || []; return w.filter(function (x, i) { return STOP.indexOf(x) < 0 && w.indexOf(x) === i; }); }
  function has(text, term) { var stem = term.replace(/(ing|ed|es|s|ion|ions|al)$/, '').slice(0, 7); return stem.length >= 4 && text.indexOf(stem) >= 0; }
  /* items = PCM.checklist(category); covers = ids the user ticked (the tick always overrides the term match) */
  function check(text, items, covers) {
    var t = String(text || ''), low = t.toLowerCase(), n = (t.trim().match(/\S+/g) || []).length, flags = [], hints = [], score = 100;
    var verbs = (t.match(VERBS) || []).length, methods = METHODS.filter(function (m) { return m[0].test(t); }).map(function (m) { return m[1]; });
    var qty = QTY.test(t), blanks = (t.match(/_{3,}/g) || []).length, sample = /SAMPLE TEXT/.test(t);
    var add = function (id, sev, msg, hint, pts) { flags.push({ id: id, sev: sev, msg: msg }); if (hint) hints.push(hint); score -= pts; };
    if (!t.trim()) return { score: 0, light: 'red', words: 0, verbs: 0, methods: [], flags: [{ id: 'empty', sev: 'red', msg: 'No description of work yet.' }], hints: ['Describe the work YOU performed on this project for this category.'], reqs: (items || []).filter(function (i) { return i.kind === 'req'; }).map(function (i) { return { id: i.id, text: i.text, auto: false, ticked: (covers || []).indexOf(i.id) >= 0, matched: [] }; }) };
    if (sample) add('sample', 'red', 'SAMPLE TEXT is still present.', 'Replace the sample text with your own work.', 50);
    if (blanks) add('blanks', 'red', blanks + ' template blank(s) "____" still present.', 'Fill in or delete every "____" blank.', 30);
    if (n < 40) add('short', n < 20 ? 'red' : 'amber', 'Very short (' + n + ' words).', 'Add detail about what you analyzed, how, and the result (aim for 80–250 words).', n < 20 ? 30 : 20);
    else if (n < 80) add('short', 'amber', 'Short (' + n + ' words).', 'Add detail about the steps you performed and the decisions you made.', 10);
    if (!verbs) add('verbs', 'amber', 'No first-person action verbs ("I designed", "I computed", …).', 'Write in the first person: "I designed …", "I computed …", "I analyzed …".', 20);
    if (!methods.length) add('methods', 'amber', 'No methods, standards or software named.', 'Add detail about the methods, standards and software you used (e.g. Rational Method, HEC-RAS, HEC-HMS, HY-8, TxDOT Hydraulic Design Manual, FEMA, permits).', 15);
    if (!qty) add('qty', 'amber', 'No quantities or sizes.', 'Add detail about quantities and sizes (e.g. design frequency, drainage area in acres, pipe/box sizes, length in feet, flows in cfs).', 10);
    var reqs = (items || []).filter(function (i) { return i.kind === 'req'; }).map(function (i) {
      var tt = terms(i.text), m = tt.filter(function (x) { return has(low, x); }), need = Math.max(1, Math.ceil(tt.length * 0.34));
      return { id: i.id, text: i.text, terms: tt, matched: m, auto: tt.length ? m.length >= need : false, ticked: (covers || []).indexOf(i.id) >= 0 };
    });
    reqs.forEach(function (r) { if (!r.auto && !r.ticked) { var miss = r.terms.filter(function (x) { return r.matched.indexOf(x) < 0; }).slice(0, 5); hints.push('Add detail about: ' + (miss.length ? miss.join(', ') : 'this requirement') + ' — "' + r.text.slice(0, 90) + (r.text.length > 90 ? '…' : '') + '"'); score -= Math.round(20 / reqs.length); } });
    score = Math.max(0, Math.min(100, score));
    var red = flags.some(function (f) { return f.sev === 'red'; }), light = red || score < 50 ? 'red' : score < 80 ? 'amber' : 'green';
    return { score: score, light: light, words: n, verbs: verbs, methods: methods, quantities: qty, flags: flags, hints: hints, reqs: reqs };
  }
  var api = { check: check, terms: terms, METHODS: METHODS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PCQ = api;
})(this);
