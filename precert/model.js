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

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function str(v, n) { return String(v == null ? '' : v).slice(0, n || 4000); }

  function newState() {
    return { schema: SCHEMA, created: new Date().toISOString(),
      profile: { first: '', middle: '', last: '', firm: '', firmSeq: '', personnelNo: '', branch: '', expertise: '', employment: 'Employed', formerTxdot: false, peNumber: '', peState: 'TX', peDate: '' },
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
    var my = minYears(c), y = years(st, c.code);
    if (my && y < my) gaps.push('Experience in project dates: ' + y + ' of ' + my + ' years (estimate; overlaps counted once).');
    if (/Professional Engineer/i.test(c.requirements.map(function (r) { return r.text; }).join(' ')) && !st.profile.peNumber) gaps.push('Requirement mentions a Professional Engineer: add your P.E. license in My profile.');
    if (/Certified Floodplain Manager|\bCFM\b/.test(c.requirements.map(function (r) { return r.text; }).join(' ')) && !st.certs.some(function (x) { return /CFM|Floodplain/i.test(x.type || ''); })) gaps.push('Requirement mentions a Certified Floodplain Manager (CFM): add the certification.');
    if (needsTraining(c.code) && !trainingFor(st, c.code).length) gaps.push('Training certificate required: add the training (as a separate PDF upload in CCIS).');
    return { cat: c, rows: rows, reqTotal: req.length, reqDone: done, pct: req.length ? Math.round(done / req.length * 100) : 0, entries: es, years: y, minYears: my, gaps: gaps, ready: !gaps.length };
  }
  function readiness(st, C) { var ix = catIndex(C); return st.targets.filter(function (k) { return ix[k]; }).map(function (k) { return coverage(st, ix[k]); }); }
  function ccisProgress(st) { var n = CCIS_STEPS.filter(function (s) { return st.ccis[s.id]; }).length; return { done: n, total: CCIS_STEPS.length }; }

  /* ---- export ---- */
  function money(v) { var n = Number(String(v || '').replace(/[$,\s]/g, '')); return v === '' || v == null ? '' : isFinite(n) ? '$' + n.toLocaleString('en-US') : String(v); }
  function projectText(st, p, C) {
    var ix = C ? catIndex(C) : {};
    var L = ['Project name: ' + p.name, 'Project begin date: ' + (p.begin || ''), 'End date: ' + (p.end || ''), 'Project location: ' + p.location, 'Estimated project fees: ' + money(p.fees), 'Estimated construction cost: ' + money(p.cost), 'Project general description: ' + p.desc];
    p.cats.forEach(function (e) { var c = ix[e.code]; L.push('', 'Work group: ' + (c ? c.group : e.code.split('.')[0]) + '   Work category: ' + e.code + (c ? ' ' + c.name : ''), 'Work category description: ' + e.text); });
    return L.join('\n');
  }
  function summaryText(st, C) {
    var P = st.profile, L = ['TxDOT precertification worksheet (personal helper, not an official TxDOT form)', 'Generated ' + new Date().toISOString().slice(0, 10), '',
      'Employee: ' + [P.first, P.middle, P.last].filter(Boolean).join(' '), 'Firm: ' + P.firm + (P.firmSeq ? ' (sequence ' + P.firmSeq + ')' : ''), 'Personnel number (firm-assigned): ' + P.personnelNo, 'Field of expertise: ' + P.expertise, 'Former TxDOT employee: ' + (P.formerTxdot ? 'Y' : 'N'),
      'P.E.: ' + [P.peNumber, P.peState, P.peDate].filter(Boolean).join(' · ')];
    if (st.degrees.length) { L.push('', 'DEGREES'); st.degrees.forEach(function (d) { L.push('- ' + [d.type, d.field, d.school, d.date].filter(Boolean).join(', ')); }); }
    if (st.certs.length) { L.push('', 'CERTIFICATIONS / TRAINING'); st.certs.forEach(function (c) { L.push('- ' + [c.type, c.number, c.agency, c.issue && 'issued ' + c.issue, c.exp && 'expires ' + c.exp, c.completion && 'completed ' + c.completion, c.category && 'for ' + c.category].filter(Boolean).join(', ')); }); }
    var R = C ? readiness(st, C) : [];
    if (R.length) { L.push('', 'WORK CATEGORIES'); R.forEach(function (r) { L.push('- ' + r.cat.code + ' ' + r.cat.name + ': ' + r.reqDone + '/' + r.reqTotal + ' requirements addressed, ' + r.entries.length + ' project entr' + (r.entries.length === 1 ? 'y' : 'ies') + (r.minYears ? ', ~' + r.years + ' of ' + r.minYears + ' yr' : '') + (r.ready ? ' — ready to enter' : ' — ' + r.gaps.length + ' gap(s)')); }); }
    st.projects.forEach(function (p, i) { L.push('', 'PROJECT ' + (i + 1), projectText(st, p, C)); });
    return L.join('\n');
  }
  function exportJSON(st) { return JSON.stringify({ app: 'txdot-precert-helper', schema: SCHEMA, exported: new Date().toISOString(), data: st }, null, 1); }
  function normalize(d) {
    var s = newState();
    if (!d || typeof d !== 'object') throw new Error('Not a backup file');
    Object.keys(s.profile).forEach(function (k) { if (d.profile && k in d.profile) s.profile[k] = k === 'formerTxdot' ? !!d.profile[k] : str(d.profile[k], 200); });
    s.degrees = (Array.isArray(d.degrees) ? d.degrees : []).map(function (x) { return { id: str(x.id || uid(), 40), type: str(x.type, 100), field: str(x.field, 200), school: str(x.school, 200), date: str(x.date, 20) }; });
    s.certs = (Array.isArray(d.certs) ? d.certs : []).map(function (x) { return { id: str(x.id || uid(), 40), kind: x.kind === 'training' ? 'training' : x.kind === 'license' ? 'license' : 'cert', type: str(x.type, 200), code: str(x.code, 20), number: str(x.number, 100), agency: str(x.agency, 200), issue: str(x.issue, 20), exp: str(x.exp, 20), completion: str(x.completion, 20), category: str(x.category, 20), note: str(x.note, 1000) }; });
    s.projects = (Array.isArray(d.projects) ? d.projects : []).map(function (p) { return { id: str(p.id || uid(), 40), name: str(p.name, 300), begin: str(p.begin, 20), end: str(p.end, 20), location: str(p.location, 300), desc: str(p.desc, 20000), fees: str(p.fees, 40), cost: str(p.cost, 40),
      cats: (Array.isArray(p.cats) ? p.cats : []).map(function (e) { return { id: str(e.id || uid(), 40), code: str(e.code, 20), text: str(e.text, 20000), covers: (Array.isArray(e.covers) ? e.covers : []).map(function (c) { return str(c, 10); }) }; }) }; });
    s.targets = (Array.isArray(d.targets) ? d.targets : []).map(function (c) { return str(c, 20); }).filter(function (c, i, a) { return /^\d+\.\d+\.\d+$/.test(c) && a.indexOf(c) === i; });
    CCIS_STEPS.forEach(function (x) { if (d.ccis && d.ccis[x.id]) s.ccis[x.id] = true; });
    s.created = str(d.created || s.created, 40);
    return s;
  }
  function importJSON(text) { var o = JSON.parse(text); return normalize(o && o.data ? o.data : o); }

  var api = { SCHEMA: SCHEMA, KEY: KEY, TRAINING_UPLOAD: TRAINING_UPLOAD, CCIS_STEPS: CCIS_STEPS, WRITE_TIPS: WRITE_TIPS, uid: uid, clone: clone, newState: newState, looksLikeSSN: looksLikeSSN, catIndex: catIndex, isHydro: isHydro, needsTraining: needsTraining, minYears: minYears,
    scopeItems: scopeItems, checklist: checklist, template: template, words: words, firstPerson: firstPerson, blanksLeft: blanksLeft, addProject: addProject, findProject: findProject, addEntry: addEntry, entries: entries, toggleCover: toggleCover, years: years,
    trainingFor: trainingFor, certFileName: certFileName, coverage: coverage, readiness: readiness, ccisProgress: ccisProgress, projectText: projectText, summaryText: summaryText, exportJSON: exportJSON, importJSON: importJSON, normalize: normalize, money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PCM = api;
})(this);
