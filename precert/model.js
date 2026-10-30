/* TxDOT Precertification helper: data model (no DOM). Works in the browser (window.PCM) and in Node (module.exports). */
(function (root) {
  'use strict';
  var SCHEMA = 1, KEY = 'precert.data.v1';
  /* Work categories whose certificates must be uploaded in CCIS (TxDOT application form and training-certificate submittal guidance). */
  var TRAINING_UPLOAD = ['3.7.1', '4.7.1', '6.1.1', '6.1.2', '6.2.1', '6.2.2', '6.3.1', '6.3.2'];
  var HYDRO_RX = /storm|drain|hydraul|hydrolog|flood|culvert|detention|scour|pump station|water quality|swp3|stormwater|floodplain|channel/i;
  /* CCIS flow from TxDOT's Become-precertified page, Precertification handout and the Feb 2024 PEPS fireside chat. */
  var CCIS_STEPS = [
    { id: 'access', title: 'Get CCIS access', text: 'Open CCIS (Salesforce) from TxDOT\'s Become precertified page and use "New User" to submit a self-registration request. TxDOT approves new users; you then get an email to set your password (reset every 60 days).' },
    { id: 'categories', title: 'Pick your work categories', text: 'Review the Precertification Work Categories list; you must meet all requirements listed for each category you apply for.' },
    { id: 'form', title: 'Fill in the application form', text: 'The employee seeking precertification completes TxDOT\'s Precertification Application Form (this tool mirrors its fields).' },
    { id: 'employee', title: 'Add the employee', text: 'Firm Information › firm › Related › Employees › New: status Employed, names, personnel number assigned by the firm (do not use SSN), field of expertise, former TxDOT employee Y/N, Save.' },
    { id: 'precert', title: 'Create the precertification', text: 'Firm Information › firm › Related › Precertifications › New: choose the employee, the work group and the work category, Save. One record per category.' },
    { id: 'certs', title: 'Add certifications', text: 'Employee Related tab › Add Certification: licensure, degrees, and required training. Upload each required training certificate as a separate PDF (only for 3.7.1, 4.7.1, 6.1.1, 6.1.2, 6.2.1, 6.2.2, 6.3.1, 6.3.2).' },
    { id: 'projects', title: 'Add projects with categories', text: 'Employee Related tab › Add Project: name, begin/end dates, location, general description, estimated fees, estimated construction cost; Next; then for each work category the group, category and a description of the work you performed.' },
    { id: 'submit', title: 'Submit for approval', text: 'Firm Related tab › Precertifications › open the precertification › Submit for Approval › Submit. Status becomes "Submitted for Review".' },
    { id: 'review', title: 'Allow 60 days for review', text: 'TxDOT tries to finish within 21 days but firms must allow 60 days. You get an email with the decision; if denied, address the denial comments and reapply.' },
    { id: 'renew', title: 'Annual firm renewal (Jan 1 – Mar 31)', text: 'The firm renews every year between January 1 and March 31 (Account Renewal in CCIS). Update precertification information whenever the firm or employee information changes.' }
  ];
  var WRITE_TIPS = [
    'Refer to the work category description and qualification requirements.',
    'Address every specific qualification requirement.',
    'Write in the first person: "I designed", "I analyzed", "I computed".',
    'Give enough detail to show knowledge and competence, e.g. "I computed the runoff using the Rational Method considering …".'
  ];

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function str(v, n) { return String(v == null ? '' : v).slice(0, n || 4000); }

  function newState() {
    return { schema: SCHEMA, created: new Date().toISOString(),
      profile: { first: '', middle: '', last: '', firm: '', firmSeq: '', personnelNo: '', branch: '', expertise: '', employment: 'Employed', formerTxdot: false, peNumber: '', peState: 'TX', peDate: '', employeeSeq: '', peAgency: '' },
      degrees: [], certs: [], projects: [], targets: [], ccis: {} };
  }

  /* SSN guard: TxDOT says the personnel number is assigned by the firm; never an SSN */
  function looksLikeSSN(v) { return /(^|\D)\d{3}-\d{2}-\d{4}(\D|$)/.test(String(v || '')) || /^\s*\d{9}\s*$/.test(String(v || '')); }

  /* ---- categories ---- */
  function catIndex(C) { var m = {}; (C.categories || []).forEach(function (c) { m[c.code] = c; }); return m; }
  function isHydro(c) { return HYDRO_RX.test(c.name + ' ' + c.description); }
  function needsTraining(code) { return TRAINING_UPLOAD.indexOf(code) >= 0; }
  function minYears(c) {
    var W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }, best = 0;
    c.requirements.forEach(function (r) { var m = /(?:minimum of |with |least )(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+years?/i.exec(r.text); if (m) { var n = W[m[1].toLowerCase()] || Number(m[1]); if (n > best) best = n; } });
    return best;
  }
  /* checklist: each requirement line (not the "The firm must employ:" lead-ins) + optional scope items from the description */
  /* scope items = the category description sentences, verbatim (optional aids; TxDOT asks you to address the requirements) */
  function scopeItems(c) {
    return String(c.description || '').replace(/\s+/g, ' ').split(/(?<=\.)\s+(?=[A-Z])/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 8; }).slice(0, 8);
  }
  function checklist(c) {
    var out = [];
    c.requirements.forEach(function (r, i) { if (!r.head) out.push({ id: 'r' + i, kind: 'req', text: r.text }); });
    scopeItems(c).forEach(function (s, i) { out.push({ id: 's' + i, kind: 'scope', text: s }); });
    return out;
  }
  /* fill-in template: blanks only, nothing invented */
  function template(c) {
    var L = ['[Your role, e.g. design engineer / project engineer] on this project for ' + c.name + ' (' + c.code + ').'];
    scopeItems(c).slice(0, 5).forEach(function (s) { L.push('[' + s.replace(/^This category (also )?includes:?\s*/i, 'Scope: ').replace(/\.$/, '') + ']', 'I ____ (designed / analyzed / computed / prepared) ____ for ____ using ____ (method, software, TxDOT manual), considering ____.'); });
    if (!scopeItems(c).length) L.push('I ____ (designed / analyzed / computed / prepared) ____ using ____, considering ____.');
    L.push('I ____ (checked / sealed / coordinated) ____ with ____ (agency / reviewer); result: ____.');
    return L.join('\n');
  }
  function words(t) { return (String(t || '').trim().match(/\S+/g) || []).length; }
  function firstPerson(t) { return /\bI\s+(designed|analyzed|analysed|computed|calculated|prepared|modeled|modelled|developed|performed|evaluated|reviewed|managed|led|sized|checked|determined|delineated|coordinated)\b/i.test(String(t || '')); }
  function blanksLeft(t) { return (String(t || '').match(/_{3,}/g) || []).length; }

  /* ---- projects ---- */
  function addProject(st, f) { var p = Object.assign({ id: uid(), name: '', begin: '', end: '', location: '', desc: '', fees: '', cost: '', cats: [] }, f || {}); st.projects.push(p); return p; }
  function findProject(st, id) { return st.projects.filter(function (p) { return p.id === id; })[0] || null; }
  function addEntry(st, pid, code, C) {
    var p = findProject(st, pid); if (!p) throw new Error('No such project');
    if (C && !catIndex(C)[code]) throw new Error('Unknown work category ' + code);
    var e = { id: uid(), code: code, text: '', covers: [] }; p.cats.push(e);
    if (st.targets.indexOf(code) < 0) st.targets.push(code);
    return e;
  }
  function entries(st, code) { var out = []; st.projects.forEach(function (p) { p.cats.forEach(function (e) { if (!code || e.code === code) out.push({ p: p, e: e }); }); }); return out; }
  function toggleCover(st, pid, eid, itemId, on) {
    var p = findProject(st, pid), e = p && p.cats.filter(function (x) { return x.id === eid; })[0]; if (!e) throw new Error('No such entry');
    var i = e.covers.indexOf(itemId); if (on && i < 0) e.covers.push(itemId); if (!on && i >= 0) e.covers.splice(i, 1);
  }
  /* experience in a category: project spans merged so overlapping periods are not counted twice (application form note) */
  function years(st, code) {
    var iv = entries(st, code).map(function (x) { return [Date.parse(x.p.begin), Date.parse(x.p.end || new Date().toISOString().slice(0, 10))]; }).filter(function (a) { return isFinite(a[0]) && isFinite(a[1]) && a[1] > a[0]; }).sort(function (a, b) { return a[0] - b[0]; });
    var tot = 0, cur = null;
    iv.forEach(function (a) { if (!cur || a[0] > cur[1]) { if (cur) tot += cur[1] - cur[0]; cur = a.slice(); } else cur[1] = Math.max(cur[1], a[1]); });
    if (cur) tot += cur[1] - cur[0];
    return Math.round(tot / (365.25 * 864e5) * 10) / 10;
  }
  /* minimum years parsed from the requirement wording; reliable only when every "year" mention parsed */
  var YW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15 };
  function parseMinYears(c) {
    var found = [], mentions = 0;
    (c.requirements || []).forEach(function (r) {
      var t = String(r.text), re = /(?:minimum of |minimum |with |at least |least )(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|\d+)\s+(?:\(\d+\)\s+)?years?/gi, m;
      mentions += (t.match(/\byears?\b/gi) || []).length;
      while ((m = re.exec(t))) found.push(YW[m[1].toLowerCase()] || Number(m[1]));
    });
    if (!mentions) return { years: 0, status: 'none', phrases: 0 };
    if (!found.length) return { years: 0, status: 'unclear', phrases: mentions };
    return { years: Math.max.apply(null, found), status: found.length >= mentions ? 'ok' : 'unclear', phrases: mentions, all: found };
  }
  /* years-of-experience check for one category: only projects that include it, overlaps counted once (form note 2) */
  function yearsCheck(st, c) {
    var P = parseMinYears(c), es = entries(st, c.code), found = years(st, c.code);
    var projects = es.map(function (x) { var ok = isFinite(Date.parse(x.p.begin)); return { id: x.p.id, name: x.p.name || 'Untitled project', begin: x.p.begin, end: x.p.end, dated: ok }; });
    var undated = projects.filter(function (p) { return !p.dated; }).length, status, msg;
    if (P.status !== 'ok') { status = 'unknown'; msg = P.status === 'none' ? 'No minimum years found in the requirement text — confirm on TxDOT\'s page.' : 'Minimum years could not be read reliably from the requirement text — confirm on TxDOT\'s page.'; }
    else if (found >= P.years) { status = 'pass'; msg = '~' + found + ' of ' + P.years + ' years in project dates (overlaps counted once).'; }
    else if (undated) { status = 'unknown'; msg = '~' + found + ' of ' + P.years + ' years; ' + undated + ' project(s) in this category have no begin date.'; }
    else { status = 'fail'; msg = '~' + found + ' of ' + P.years + ' years in project dates (overlaps counted once).'; }
    return { code: c.code, required: P.status === 'ok' ? P.years : null, parse: P.status, found: found, status: status, msg: msg, pct: P.status === 'ok' && P.years ? Math.min(100, Math.round(found / P.years * 100)) : 0, projects: projects };
  }
  function trainingFor(st, code) { return st.certs.filter(function (c) { return c.category === code && (c.kind === 'training'); }); }
  function certFileName(st, cert) {
    var P = st.profile, d = cert.completion || cert.issue || 'YYYY-MM-DD';
    return [P.last || 'Last', P.first || 'First', cert.category || 'X.X.X', d].join('.').replace(/\s+/g, '') + '.PDF';
  }
  /* coverage of one category: every checklist item with the entries that address it */
  function coverage(st, c) {
    var items = checklist(c), es = entries(st, c.code);
    var rows = items.map(function (it) { return { item: it, by: es.filter(function (x) { return x.e.covers.indexOf(it.id) >= 0; }) }; });
    var req = rows.filter(function (r) { return r.item.kind === 'req'; });
    var done = req.filter(function (r) { return r.by.length; }).length;
    var gaps = [];
    req.forEach(function (r) { if (!r.by.length) gaps.push('Requirement not addressed: ' + r.item.text); });
    if (!es.length) gaps.push('No project describes work in this category yet.');
    es.forEach(function (x) { if (!x.e.text.trim()) gaps.push((x.p.name || 'Untitled project') + ': description of work is empty.'); else { if (!firstPerson(x.e.text)) gaps.push((x.p.name || 'Untitled project') + ': no first-person phrase ("I designed", "I computed" …).'); if (blanksLeft(x.e.text)) gaps.push((x.p.name || 'Untitled project') + ': ' + blanksLeft(x.e.text) + ' template blank(s) not filled.'); } });
    var my = minYears(c), y = years(st, c.code), yc = yearsCheck(st, c);
    if (yc.status === 'fail') gaps.push('Experience in project dates: ' + yc.found + ' of ' + yc.required + ' years (estimate; overlaps counted once).');
    if (/Professional Engineer/i.test(c.requirements.map(function (r) { return r.text; }).join(' ')) && !st.profile.peNumber) gaps.push('Requirement mentions a Professional Engineer: add your P.E. license in My profile.');
    if (/Certified Floodplain Manager|\bCFM\b/.test(c.requirements.map(function (r) { return r.text; }).join(' ')) && !st.certs.some(function (x) { return /CFM|Floodplain/i.test(x.type || ''); })) gaps.push('Requirement mentions a Certified Floodplain Manager (CFM): add the certification.');
    if (needsTraining(c.code) && !trainingFor(st, c.code).length) gaps.push('Training certificate required: add the training (as a separate PDF upload in CCIS).');
    return { cat: c, rows: rows, reqTotal: req.length, reqDone: done, pct: req.length ? Math.round(done / req.length * 100) : 0, entries: es, years: y, minYears: my, gaps: gaps, yearsCheck: yc, ready: !gaps.length };
  }
  function readiness(st, C) { var ix = catIndex(C); return st.targets.filter(function (k) { return ix[k]; }).map(function (k) { return coverage(st, ix[k]); }); }
  function ccisProgress(st) { var n = CCIS_STEPS.filter(function (s) { return st.ccis[s.id]; }).length; return { done: n, total: CCIS_STEPS.length }; }


  /* ---- v1.1 EXAMPLE mode: entirely fictional sample data, every record flagged isExample ---- */
  var PRE_EXAMPLE_KEY = 'precert.data.v1.pre-example';
  var SAMPLE = 'SAMPLE TEXT — replace with your own work. ';
  function exampleState() {
    var st = newState(); st.example = true;
    st.profile = { first: 'Alex', middle: '', last: 'Example', firm: 'Example Engineering Co. (fictional)', firmSeq: '000000', personnelNo: 'EX-0001', branch: '01', expertise: 'Engineer', employment: 'Employed', formerTxdot: false, peNumber: 'EXAMPLE-000000', peState: 'TX', peDate: '2014-06-01', employeeSeq: '', peAgency: 'TBPELS', isExample: true };
    st.degrees = [{ id: 'ex-deg1', type: 'B.S.', field: 'Civil Engineering', school: 'Example State University (fictional)', date: '2009-05-15', isExample: true },
      { id: 'ex-deg2', type: 'M.S.', field: 'Water Resources Engineering', school: 'Example State University (fictional)', date: '2011-05-15', isExample: true }];
    st.certs = [{ id: 'ex-c1', kind: 'license', type: 'Professional Engineer (P.E.)', code: '100000', number: 'EXAMPLE-000000', agency: 'TBPELS', issue: '2014-06-01', exp: '', completion: '', category: '', note: 'EXAMPLE — not a real license', isExample: true },
      { id: 'ex-c2', kind: 'cert', type: 'Hydraulic design short course (example)', code: '132000', number: 'EX-TRN-01', agency: 'Example Training Provider', issue: '2019-03-12', exp: '', completion: '2019-03-12', category: '', note: 'EXAMPLE certificate', isExample: true },
      { id: 'ex-c3', kind: 'cert', type: 'Storm drain modeling workshop (example)', code: '132000', number: 'EX-TRN-02', agency: 'Example Training Provider', issue: '2022-10-05', exp: '', completion: '2022-10-05', category: '', note: 'EXAMPLE certificate', isExample: true }];
    var P = function (f, cats) { return Object.assign({ id: f.id, isExample: true, cats: cats.map(function (c, i) { return { id: f.id + '-' + i, code: c[0], text: SAMPLE + c[1], covers: c[2], isExample: true }; }) }, f); };
    st.projects = [
      P({ id: 'ex-p1', name: 'EXAMPLE: FM 0000 widening (fictional)', begin: '2015-02-01', end: '2018-08-31', location: 'Example County, TX (fictional)', desc: SAMPLE + 'Widening of a two-lane rural road to a four-lane curbed section, about 3 miles, with a new storm drain system and roadside channels.', fees: '1200000', cost: '38000000' }, [
        ['10.2.1', 'I designed the storm drain system (inlets, laterals and trunk line) following the TxDOT Hydraulic Design Manual. I computed inlet spacing and gutter spread for the design frequency, sized the pipes and computed the hydraulic grade line with storm drain software, and designed the roadside channels and outfalls. I prepared the drainage plan and profile sheets and coordinated the state/federal permit documentation with the environmental team.', ['r0', 's0']],
        ['4.2.1', 'I designed the roadway horizontal and vertical alignment and typical sections, prepared the roadway plan and profile sheets, and coordinated the drainage design, utility relocations, stormwater permit and traffic control plans for the widening.', ['r0']]]),
      P({ id: 'ex-p2', name: 'EXAMPLE: SH 000 culvert replacement (fictional)', begin: '2018-09-01', end: '2021-03-31', location: 'Example County, TX (fictional)', desc: SAMPLE + 'Replacement of an undersized box culvert under a state highway, including hydrology for the contributing watershed and a detention pond.', fees: '450000', cost: '6500000' }, [
        ['10.1.1', 'I delineated the watershed and computed the runoff using a unit hydrograph method, considering land use, soils and rainfall depths for the design frequencies. I routed the hydrographs through the existing channel and the proposed detention pond.', ['r0', 's0']],
        ['10.2.1', 'I analyzed the existing and proposed culverts with culvert analysis software, designed the new box culvert and its headwalls, checked the outlet velocity, and designed the detention pond outlet structure.', ['s1']]]),
      P({ id: 'ex-p3', name: 'EXAMPLE: Example Creek hydrologic and floodplain study (fictional)', begin: '2021-04-01', end: '2024-12-31', location: 'Example City, TX (fictional)', desc: SAMPLE + 'Hydrologic and hydraulic study of a creek crossing a planned roadway, with a draft map revision submittal.', fees: '300000', cost: '' }, [
        ['10.1.1', 'I computed the existing and proposed peak flows with a hydrologic model, considering sub-basin parameters and channel routing, and compared them with the effective study.', ['r0']],
        ['10.8.1', 'I developed the existing and proposed floodway models and prepared the draft map revision (CLOMR) exhibits. (Example: this category still shows a gap — no CFM certification is entered.)', []]])
    ];
    st.targets = ['10.1.1', '10.2.1', '4.2.1', '10.8.1'];
    st.ccis = { access: true, categories: true, form: true, employee: true };
    return st;
  }
  function isExampleState(st) { return !!(st && (st.example || (st.profile && st.profile.isExample) || st.projects.some(function (p) { return p.isExample; }))); }
  function hasRealData(st) {
    if (!st) return false; var P = st.profile || {};
    var realProfile = !P.isExample && ['first', 'last', 'firm', 'peNumber', 'personnelNo'].some(function (k) { return String(P[k] || '').trim(); });
    var realRec = function (a) { return (a || []).some(function (x) { return !x.isExample; }); };
    return realProfile || realRec(st.degrees) || realRec(st.certs) || realRec(st.projects) || st.projects.some(function (p) { return p.cats.some(function (e) { return !e.isExample; }); });
  }
  /* remove only example records; anything you added while the example was loaded stays */
  function clearExample(st) {
    var s = clone(st);
    if (s.profile.isExample) s.profile = newState().profile;
    s.degrees = s.degrees.filter(function (x) { return !x.isExample; }); s.certs = s.certs.filter(function (x) { return !x.isExample; });
    s.projects = s.projects.filter(function (p) { return !p.isExample || p.cats.some(function (e) { return !e.isExample; }); }).map(function (p) { p.cats = p.cats.filter(function (e) { return !e.isExample; }); if (p.isExample) { p.isExample = false; } return p; });
    var used = {}; s.projects.forEach(function (p) { p.cats.forEach(function (e) { used[e.code] = 1; }); });
    s.targets = s.targets.filter(function (k) { return used[k]; });
    if (st.example) s.ccis = {};
    delete s.example;
    return s;
  }
  var EXAMPLE_HEAD = '*** EXAMPLE DATA — fictional, not real experience. Replace with your own before using. ***';


  /* ---- v1.2 TxDOT Precertification Application Form (form dated 09/18/2026) ---- */
  function fmtDate(iso, yy) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return String(iso || '');
    return m[2] + '/' + m[3] + '/' + (yy ? m[1].slice(2) : m[1]);
  }
  function fullName(P) { return [P.first, P.middle, P.last].filter(Boolean).join(' '); }
  /* certification blocks: licence from the profile (unless already listed), degrees, then certifications / training */
  function formCerts(st) {
    var P = st.profile, out = [];
    var hasLic = st.certs.some(function (c) { return c.kind === 'license' && c.number && c.number === P.peNumber; });
    if (P.peNumber && !hasLic) out.push({ src: 'profile', category: '', degreeType: '', trainingType: 'engineering', trainingDate: '', certType: 'P.E.', issue: fmtDate(P.peDate, true), exp: '', completion: '', number: P.peNumber, agency: P.peAgency || (String(P.peState).toUpperCase() === 'TX' ? 'TBPELS' : '') });
    st.degrees.forEach(function (d) { out.push({ src: 'degree', category: '', degreeType: d.type, trainingType: d.field, trainingDate: '', certType: '', issue: fmtDate(d.date, true), exp: '', completion: '', number: '', agency: d.school }); });
    st.certs.forEach(function (c) { out.push({ src: c.kind, category: c.category, degreeType: c.degreeType || '', trainingType: c.trainingType || '', trainingDate: fmtDate(c.trainingDate, false), certType: c.type, issue: fmtDate(c.issue, true), exp: fmtDate(c.exp, true), completion: fmtDate(c.completion, true), number: c.number, agency: c.agency }); });
    return out;
  }
  function formData(st, C) {
    var P = st.profile, ix = C ? catIndex(C) : {}, groups = {};
    var codes = st.targets.slice(); st.projects.forEach(function (p) { p.cats.forEach(function (e) { if (codes.indexOf(e.code) < 0) codes.push(e.code); }); });
    codes.sort(function (a, b) { var x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; })
      .forEach(function (k) { var g = Number(k.split('.')[0]); (groups[g] = groups[g] || []).push(k); });
    return {
      example: isExampleState(st) ? EXAMPLE_HEAD : '',
      firm: { name: P.firm, seq: P.firmSeq },
      emp: { first: P.first, middle: P.middle, last: P.last, personnelNo: P.personnelNo, branch: P.branch, expertise: P.expertise, formerTxdot: !!P.formerTxdot, employment: P.employment, seq: P.employeeSeq || '' },
      precerts: Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).map(function (g) { return { group: g, cats: groups[g] }; }),
      certs: formCerts(st),
      projects: st.projects.map(function (p) { return { name: p.name, begin: fmtDate(p.begin, false), end: fmtDate(p.end, false), location: p.location, fees: money(p.fees), cost: money(p.cost), desc: p.desc,
        cats: p.cats.map(function (e) { return { group: Number(e.code.split('.')[0]), code: e.code, name: ix[e.code] ? ix[e.code].name : '', text: e.text }; }) }; })
    };
  }
  /* mandatory (*) fields of the form + helpful warnings */
  function formCheck(st, C) {
    var F = formData(st, C), miss = [], warn = [];
    [['Firm name*', F.firm.name], ['Firm sequence number*', F.firm.seq], ['First name*', F.emp.first], ['Last name*', F.emp.last], ['Employment status*', F.emp.employment]].forEach(function (x) { if (!String(x[1] || '').trim()) miss.push(x[0]); });
    if (!F.precerts.length) miss.push('Work Group* and Work Category* (choose at least one category)');
    if (looksLikeSSN(F.emp.personnelNo)) warn.push('Personnel number looks like an SSN — use the number your firm assigns.');
    if (!F.projects.length) warn.push('No projects entered.');
    F.projects.forEach(function (p, i) { var n = 'Project ' + (i + 1) + (p.name ? ' (' + p.name + ')' : ''); if (!p.name) warn.push(n + ': project name is blank.'); if (!p.cats.length) warn.push(n + ': no work category.'); p.cats.forEach(function (c) { if (!String(c.text || '').trim()) warn.push(n + ': ' + c.code + ' work category description is blank.'); if (blanksLeft(c.text)) warn.push(n + ': ' + c.code + ' description still has template blanks.'); }); });
    F.precerts.forEach(function (g) { g.cats.forEach(function (k) { if (needsTraining(k) && !st.certs.some(function (c) { return c.category === k; })) warn.push(k + ': training certificate required (upload each as a separate PDF in CCIS).'); }); });
    var ix = C ? catIndex(C) : {};
    F.precerts.forEach(function (g) { g.cats.forEach(function (k) { if (!ix[k]) return; var y = yearsCheck(st, ix[k]); if (y.status !== 'pass') warn.push(k + ' experience: ' + (y.status === 'fail' ? 'below minimum — ' : 'unknown — ') + y.msg); }); });
    if (F.certs.length > 10) warn.push(F.certs.length + ' certifications: the form shows 10, more may be added (the generated form lists all).');
    if (F.projects.some(function (p) { return p.cats.length > 5; })) warn.push('A project has more than five categories: the form shows five, more may be added (the generated form lists all).');
    return { missing: miss, warnings: warn, ok: !miss.length };
  }
  /* copy-as-text with the form's labels verbatim */
  function formText(st, C) {
    var F = formData(st, C), b = function (v) { return String(v == null ? '' : v).trim() || '(not entered)'; }, L = [];
    if (F.example) L.push(F.example);
    L.push('Precertification Application Form (TxDOT form dated 09/18/2026) — filled by a personal helper; enter this information into CCIS. Nothing is submitted by this tool.', '',
      'Firm Identification', 'Firm name*: ' + b(F.firm.name), 'Firm sequence number*: ' + b(F.firm.seq), '',
      'Employee Details', 'First name*: ' + b(F.emp.first), 'Middle name (if applicable): ' + b(F.emp.middle), 'Last name*: ' + b(F.emp.last),
      'Personnel number (Employee # assigned by firm): ' + b(F.emp.personnelNo), 'Branch number (Employee’s base branch): ' + b(F.emp.branch),
      'Employee Expertise (Ex. engineer, surveyor, technician, etc.): ' + b(F.emp.expertise), 'Former TxDOT employee? ' + (F.emp.formerTxdot ? 'Yes' : 'No'),
      'Employment status*: ' + b(F.emp.employment), 'Employee sequence number (if unknown, leave blank): ' + b(F.emp.seq), '', 'Precertifications in this Application');
    F.precerts.forEach(function (g) { L.push('Work Group*: ' + g.group + '   Work Category*: ' + g.cats.join(', ')); }); if (!F.precerts.length) L.push('(not entered)');
    L.push('', 'Employee Certifications');
    F.certs.forEach(function (c, i) { L.push('Certification ' + (i + 1), 'Work category (If applicable): ' + b(c.category), 'Degree type (ex. B.S., M.S.): ' + b(c.degreeType), 'Training type (ex. engineering, surveying, architecture): ' + b(c.trainingType),
      'Certification training date (format: MM/DD/YYYY): ' + b(c.trainingDate), 'Personnel/laboratory certification type (ex. P.E., CFM, RPLS, Hot Mix-Level IB): ' + b(c.certType), 'Issue date (format: MM/DD/YY): ' + b(c.issue),
      'Expiration date (format: MM/DD/YY): ' + b(c.exp), 'Completion date (for training) (format: MM/DD/YY): ' + b(c.completion), 'Employee certification number (ex. license/registration number): ' + b(c.number), 'Issuing agency name (ex. TBPELS, TBAE, Florida PE board, National Highway Institute): ' + b(c.agency), ''); });
    L.push('Employee Projects');
    F.projects.forEach(function (p, i) { L.push('Project ' + (i + 1), 'Project name: ' + b(p.name), 'Project begin date: ' + b(p.begin) + '   End date: ' + b(p.end), 'Project location: ' + b(p.location), 'Estimated project fees: ' + b(p.fees), 'Estimated construction cost: ' + b(p.cost), 'Project general description**: ' + b(p.desc));
      p.cats.forEach(function (c) { L.push('Work group: ' + c.group + '   Work category: ' + c.code + (c.name ? ' (' + c.name + ')' : ''), "Work category description** (describe applicant's work as it pertains to the category): " + b(c.text)); }); L.push(''); });
    return L.join('\n');
  }

  /* ---- export ---- */
  function money(v) { var n = Number(String(v || '').replace(/[$,\s]/g, '')); return v === '' || v == null ? '' : isFinite(n) ? '$' + n.toLocaleString('en-US') : String(v); }
  function projectText(st, p, C) {
    var ix = C ? catIndex(C) : {};
    var L = ['Project name: ' + p.name, 'Project begin date: ' + (p.begin || ''), 'End date: ' + (p.end || ''), 'Project location: ' + p.location, 'Estimated project fees: ' + money(p.fees), 'Estimated construction cost: ' + money(p.cost), 'Project general description: ' + p.desc];
    if (p.isExample) L.unshift(EXAMPLE_HEAD);
    p.cats.forEach(function (e) { var c = ix[e.code]; L.push('', 'Work group: ' + (c ? c.group : e.code.split('.')[0]) + '   Work category: ' + e.code + (c ? ' ' + c.name : ''), 'Work category description: ' + e.text); });
    return L.join('\n');
  }
  function summaryText(st, C) {
    var P = st.profile, L = (isExampleState(st) ? [EXAMPLE_HEAD] : []).concat(['TxDOT precertification worksheet (personal helper, not an official TxDOT form)', 'Generated ' + today(), '',
      'Employee: ' + [P.first, P.middle, P.last].filter(Boolean).join(' '), 'Firm: ' + P.firm + (P.firmSeq ? ' (sequence ' + P.firmSeq + ')' : ''), 'Personnel number (firm-assigned): ' + P.personnelNo, 'Field of expertise: ' + P.expertise, 'Former TxDOT employee: ' + (P.formerTxdot ? 'Y' : 'N'),
      'P.E.: ' + [P.peNumber, P.peState, P.peDate].filter(Boolean).join(' · ')]);
    if (st.degrees.length) { L.push('', 'DEGREES'); st.degrees.forEach(function (d) { L.push('- ' + [d.type, d.field, d.school, d.date].filter(Boolean).join(', ')); }); }
    if (st.certs.some(function (c) { return c.type || c.number; })) { L.push('', 'CERTIFICATIONS / TRAINING'); st.certs.forEach(function (c) { var t = [c.type, c.number, c.agency, c.issue && 'issued ' + c.issue, c.exp && 'expires ' + c.exp, c.completion && 'completed ' + c.completion, c.category && 'for ' + c.category].filter(Boolean).join(', '); if (t) L.push('- ' + t); }); }
    var R = C ? readiness(st, C) : [];
    if (R.length) { L.push('', 'WORK CATEGORIES'); R.forEach(function (r) { L.push('- ' + r.cat.code + ' ' + r.cat.name + ': ' + r.reqDone + '/' + r.reqTotal + ' requirements addressed, ' + r.entries.length + ' project entr' + (r.entries.length === 1 ? 'y' : 'ies') + (r.minYears ? ', ~' + r.years + ' of ' + r.minYears + ' yr' : '') + (r.ready ? ' — ready to enter' : ' — ' + r.gaps.length + ' gap(s)')); }); }
    st.projects.forEach(function (p, i) { L.push('', 'PROJECT ' + (i + 1), projectText(st, p, C).replace(EXAMPLE_HEAD + '\n', '')); });
    return L.join('\n');
  }
  function exportJSON(st) { return JSON.stringify({ app: 'txdot-precert-helper', schema: SCHEMA, example: isExampleState(st) ? EXAMPLE_HEAD : undefined, exported: new Date().toISOString(), data: st }, null, 1); }
  function normalize(d) {
    var s = newState();
    if (!d || typeof d !== 'object') throw new Error('Not a backup file');
    Object.keys(s.profile).forEach(function (k) { if (d.profile && k in d.profile) s.profile[k] = k === 'formerTxdot' ? !!d.profile[k] : str(d.profile[k], 200); });
    var fx = function (o, x) { if (x && x.isExample) o.isExample = true; return o; };
    if (d.profile && d.profile.isExample) s.profile.isExample = true;
    if (d.example) s.example = true;
    s.degrees = (Array.isArray(d.degrees) ? d.degrees : []).map(function (x) { return fx({ id: str(x.id || uid(), 40), type: str(x.type, 100), field: str(x.field, 200), school: str(x.school, 200), date: str(x.date, 20) }, x); });
    s.certs = (Array.isArray(d.certs) ? d.certs : []).map(function (x) { return fx({ id: str(x.id || uid(), 40), kind: x.kind === 'training' ? 'training' : x.kind === 'license' ? 'license' : 'cert', type: str(x.type, 200), code: str(x.code, 20), number: str(x.number, 100), agency: str(x.agency, 200), issue: str(x.issue, 20), exp: str(x.exp, 20), completion: str(x.completion, 20), category: str(x.category, 20), note: str(x.note, 1000), degreeType: str(x.degreeType, 60), trainingType: str(x.trainingType, 100), trainingDate: str(x.trainingDate, 20) }, x); });
    s.projects = (Array.isArray(d.projects) ? d.projects : []).map(function (p) { return fx({ id: str(p.id || uid(), 40), name: str(p.name, 300), begin: str(p.begin, 20), end: str(p.end, 20), location: str(p.location, 300), desc: str(p.desc, 20000), fees: str(p.fees, 40), cost: str(p.cost, 40),
      cats: (Array.isArray(p.cats) ? p.cats : []).map(function (e) { return fx({ id: str(e.id || uid(), 40), code: str(e.code, 20), text: str(e.text, 20000), covers: (Array.isArray(e.covers) ? e.covers : []).map(function (c) { return str(c, 10); }) }, e); }) }, p); });
    s.targets = (Array.isArray(d.targets) ? d.targets : []).map(function (c) { return str(c, 20); }).filter(function (c, i, a) { return /^\d+\.\d+\.\d+$/.test(c) && a.indexOf(c) === i; });
    CCIS_STEPS.forEach(function (x) { if (d.ccis && d.ccis[x.id]) s.ccis[x.id] = true; });
    s.created = str(d.created || s.created, 40);
    return s;
  }
  function importJSON(text) { var o = JSON.parse(text); return normalize(o && o.data ? o.data : o); }

  var api = { parseMinYears: parseMinYears, yearsCheck: yearsCheck, fmtDate: fmtDate, fullName: fullName, formCerts: formCerts, formData: formData, formCheck: formCheck, formText: formText, PRE_EXAMPLE_KEY: PRE_EXAMPLE_KEY, EXAMPLE_HEAD: EXAMPLE_HEAD, exampleState: exampleState, isExampleState: isExampleState, hasRealData: hasRealData, clearExample: clearExample, today: today, SCHEMA: SCHEMA, KEY: KEY, TRAINING_UPLOAD: TRAINING_UPLOAD, CCIS_STEPS: CCIS_STEPS, WRITE_TIPS: WRITE_TIPS, uid: uid, clone: clone, newState: newState, looksLikeSSN: looksLikeSSN, catIndex: catIndex, isHydro: isHydro, needsTraining: needsTraining, minYears: minYears,
    scopeItems: scopeItems, checklist: checklist, template: template, words: words, firstPerson: firstPerson, blanksLeft: blanksLeft, addProject: addProject, findProject: findProject, addEntry: addEntry, entries: entries, toggleCover: toggleCover, years: years,
    trainingFor: trainingFor, certFileName: certFileName, coverage: coverage, readiness: readiness, ccisProgress: ccisProgress, projectText: projectText, summaryText: summaryText, exportJSON: exportJSON, importJSON: importJSON, normalize: normalize, money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PCM = api;
})(this);
