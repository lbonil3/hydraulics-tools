/* TxDOT Precertification helper: deterministic category SUGGESTIONS from a project's own text (no network, no AI).
   Keyword/phrase scoring only. Suggestions are hints to confirm against TxDOT's requirement wording, never a determination. */
(function (root) {
  'use strict';
  /* [regex, weight, label shown in "why"] per category; weight 3 = phrase that names the category's work, 1–2 = supporting term */
  var RULES = {
    '10.1.1': [[/\bhydrolog(y|ic|ical)\b/, 3, 'hydrology'], [/rainfall[- ]runoff|runoff (computation|calculation|analysis)|computed (the )?runoff/, 3, 'rainfall/runoff'], [/rational method/, 3, 'Rational Method'], [/hec-?hms/, 3, 'HEC-HMS'], [/\bnrcs\b|\bscs\b|unit hydrograph|\bhydrograph/, 2, 'hydrograph / NRCS'], [/\brouting\b|routed/, 2, 'routing'], [/stream ?ga(u)?ge/, 3, 'stream gauge'], [/drainage area|watershed|delineat/, 1, 'drainage areas / watershed'], [/peak (flow|discharge)|design (storm|frequency)|\b\d+-year\b/, 1, 'design frequency / peak flow']],
    '10.2.1': [[/storm (drain|sewer)/, 3, 'storm drain'], [/\binlets?\b/, 2, 'inlets'], [/culverts?\b/, 3, 'culverts'], [/hy-?8\b/, 3, 'HY-8'], [/roadside (channel|ditch)|\bditch(es)?\b/, 2, 'roadside channels'], [/detention/, 2, 'detention'], [/water quality/, 2, 'water quality'], [/hydraulic grade line|\bhgl\b/, 2, 'hydraulic grade line'], [/gutter spread|\bspread\b/, 1, 'spread'], [/storm ?cad|bentley|geopak drainage|openflows|winstorm/, 2, 'storm drain software'], [/hydraulic design manual/, 2, 'TxDOT Hydraulic Design Manual'], [/\boutfalls?\b|laterals?\b|trunk ?line/, 1, 'outfalls / laterals']],
    '10.3.1': [[/bridge hydraulic|hydraulics? (of|for) (the )?bridge|bridge (over|crossing)/, 3, 'bridge hydraulics'], [/hec-?ras/, 2, 'HEC-RAS'], [/\bbridge\b/, 1, 'bridge'], [/waterway|floodplain/, 1, 'waterway / floodplain'], [/channel (modification|realignment)/, 2, 'channel modification'], [/freeboard|backwater/, 2, 'freeboard / backwater']],
    '10.4.1': [[/pump station/, 3, 'pump station'], [/mass curve|wet well|pump (selection|configuration|sizing)/, 3, 'pump sizing / mass curve'], [/discharge line|force main/, 2, 'discharge lines']],
    '10.5.1': [[/\bscour\b/, 3, 'scour'], [/sediment transport|\bhec-?18\b|stream stability/, 2, 'sediment / HEC-18']],
    '10.6.1': [[/coastal|tidal|\btides?\b|\bwave(s)?\b|shoreline|revetment|storm surge|overwash/, 3, 'coastal / tidal']],
    '10.7.1': [[/riverine|stream restoration|stream stability|\bgeomorph|river (training|stabiliz)/, 3, 'riverine / stream stability'], [/hec-?ras/, 1, 'HEC-RAS'], [/bank (stabiliz|protection)|\briprap\b/, 2, 'bank stabilization']],
    '10.8.1': [[/\bfema\b/, 3, 'FEMA'], [/\bc?lomr\b|map revision/, 3, 'CLOMR / LOMR'], [/floodway|no[- ]rise|flood ?insurance|\bfirm panel|\bnfip\b/, 3, 'floodway / no-rise / NFIP'], [/floodplain (permit|administrator|development)/, 2, 'floodplain permit'], [/hec-?ras/, 1, 'HEC-RAS']],
    '4.2.1': [[/roadway design|road(way)? (widening|reconstruction|rehabilitation)|widen(ing|ed)/, 3, 'roadway design / widening'], [/(horizontal|vertical) alignment|typical sections?|plan and profile|geometric/, 2, 'alignment / typical sections'], [/roadway design manual/, 2, 'TxDOT Roadway Design Manual'], [/utility relocation|traffic control|maintenance of traffic/, 1, 'utilities / traffic control'], [/resurfac|capacity improvement|\blanes?\b|\bcurb/, 1, 'lanes / resurfacing']],
    '2.4.1': [[/nationwide permit|\bnwp\b|pre-?construction notification|\bpcn\b/, 3, 'Nationwide Permit / PCN'], [/usace|corps of engineers/, 1, 'USACE']],
    '2.4.2': [[/section 404|\b404\b|clean water act|wetland (delineation|mitigation)|individual permit/, 3, 'CWA Section 404 / wetlands'], [/\bmitigation\b/, 1, 'mitigation'], [/usace|corps of engineers/, 1, 'USACE']],
    '2.4.3': [[/coast guard|general bridge act|section 10\b|rivers and harbors|navigable/, 3, 'USCG / Section 10 / navigable waters'], [/usace|corps of engineers/, 1, 'USACE']]
  };
  var MIN = 3;
  function projectText(p) { return [p.name, p.desc].concat((p.cats || []).map(function (e) { return e.text; })).join(' \n ').toLowerCase().replace(/sample text — replace with your own work\.?/g, ' '); }
  /* returns [{code, name, score, why:[labels]}] best first, excluding categories already on the project */
  function suggest(p, C, opts) {
    opts = opts || {}; var txt = projectText(p), have = (p.cats || []).map(function (e) { return e.code; }), ix = {};
    (C.categories || []).forEach(function (c) { ix[c.code] = c; });
    var out = [];
    Object.keys(RULES).forEach(function (code) {
      if (!ix[code] || (!opts.includeExisting && have.indexOf(code) >= 0)) return;
      var score = 0, why = [];
      RULES[code].forEach(function (r) { var m = r[0].exec(txt); if (m) { score += r[1]; why.push(r[2] + ' (“' + m[0] + '”)'); } });
      /* requirement-phrase bonus: distinctive words of the category name found in the text */
      var nameHits = String(ix[code].name).toLowerCase().replace(/\(.*?\)/g, ' ').match(/[a-z]{6,}/g) || [];
      nameHits = nameHits.filter(function (w, i, a) { return a.indexOf(w) === i && ['design', 'federal', 'regulations', 'permits', 'including', 'analysis', 'evaluations'].indexOf(w) < 0 && txt.indexOf(w) >= 0; });
      if (nameHits.length) { score += nameHits.length; why.push('category name words: ' + nameHits.join(', ')); }
      if (score >= MIN) out.push({ code: code, name: ix[code].name, group: ix[code].group, score: score, why: why });
    });
    return out.sort(function (a, b) { return b.score - a.score || (a.code < b.code ? -1 : 1); }).slice(0, opts.max || 6);
  }
  var NOTE = 'Suggestions come from keywords in this project\'s own text. They are not a determination that you qualify — confirm each against TxDOT\'s requirement wording before adding it.';
  var api = { RULES: RULES, suggest: suggest, projectText: projectText, NOTE: NOTE, MIN: MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PCS = api;
})(this);
