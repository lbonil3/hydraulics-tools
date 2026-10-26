/* SWP3 Builder UI. Logic: model.js. Data and sources: data.js. */
(function () {
  'use strict';
  var M = window.SwpModel, D = window.SwpData;
  var KEY = 'swp3-builder.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = M.esc, bd = M.badgeHtml;

  /* ---------- state ---------- */
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || !Array.isArray(s.projects) || !s.projects.length) {
      var p = M.newProject({ name: 'My TxDOT project' });
      return { projects: [p], activeId: p.id };
    }
    s.projects = s.projects.map(M.sanitizeProject).filter(Boolean);
    if (!s.projects.length) s.projects = [M.newProject({})];
    if (!s.projects.some(function (x) { return x.id === s.activeId; })) s.activeId = s.projects[0].id;
    return s;
  }
  var state = load();
  var ui = { tab: 'project', bmpView: 'suggested', openBmp: {}, outline: null };
  var saveFailed = false;
  function save() {
    var p = cur(); if (p) p.updated = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify({ projects: state.projects, activeId: state.activeId })); saveFailed = false; }
    catch (e) { if (!saveFailed) toast('Could not save on this device (storage full or blocked).'); saveFailed = true; }
  }
  function cur() { return state.projects.filter(function (p) { return p.id === state.activeId; })[0]; }
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function fileName(p, ext) { return (p.name || 'swp3').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) + '-swp3.' + ext; }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function printHtml(html) {
    var pa = $('#printArea'); pa.innerHTML = html;
    var done = function () { pa.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { try { window.print(); } catch (e) { toast('Printing is not available here.'); } }, 60);
  }

  /* ---------- tiny form helpers ---------- */
  function fld(label, key, opts) {
    opts = opts || {}; var f = cur().form, v = f[key] == null ? '' : f[key];
    var type = opts.type || 'text', extra = opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '';
    if (type === 'number') extra += ' inputmode="decimal"';
    var input = opts.area ? '<textarea data-f="' + key + '"' + extra + '>' + esc(v) + '</textarea>'
      : '<input type="' + (type === 'number' ? 'text' : type) + '" data-f="' + key + '" value="' + esc(v) + '"' + extra + '>';
    return '<label class="f"><span>' + esc(label) + '</span>' + input + (opts.help ? '<small class="help">' + opts.help + '</small>' : '') + '</label>';
  }
  function sel(label, key, options, help) {
    var v = cur().form[key];
    return '<label class="f"><span>' + esc(label) + '</span><select data-f="' + key + '">' + options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + (help ? '<small class="help">' + help + '</small>' : '') + '</label>';
  }
  function chk(label, key, group) {
    var f = cur().form, on = group ? !!(f[group] && f[group][key]) : !!f[key];
    return '<label class="chk"><input type="checkbox" data-f="' + key + '"' + (group ? ' data-g="' + group + '"' : '') + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }
  function details(title, open, inner, id) { return '<details class="sec" data-sec="' + id + '"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary><div class="secbody">' + inner + '</div></details>'; }
  var YN = [['unknown', 'Not determined yet'], ['yes', 'Yes'], ['no', 'No']];

  /* ---------- header ---------- */
  function renderProjSel() {
    var s = $('#projSel');
    s.innerHTML = state.projects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === state.activeId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
  }

  /* ---------- Project pane ---------- */
  var openSecs = { s1: true };
  function renderProject() {
    var p = cur(), f = p.form, h = '';
    h += '<div class="card"><label class="f"><span>Project name</span><input type="text" id="pname" value="' + esc(p.name) + '"></label>' +
      '<div class="livesum" id="liveSum" role="status"></div></div>';
    h += details('1. Project and parties', true,
      sel('Project type', 'type', D.PROJECT_TYPES.map(function (t) { return [t.key, t.label]; }), 'TxDOT is the primary standard. Other types still use TxDOT BMP details, with the permit as the floor.') +
      (f.type === 'txdot' ? '<div class="grid2">' + fld('CSJ(s)', 'csj') + fld('Highway / roadway', 'highway') + '</div>' : '') +
      fld('Owner / operator with control of plans (TxDOT District/Area Office, city, developer)', 'owner') +
      fld('Contractor (day-to-day operational control)', 'contractor') +
      fld('Secondary operator (optional)', 'secondary') +
      '<div class="grid2">' + fld('County', 'county') + fld('City (blank if unincorporated)', 'city') + '</div>' +
      fld('Project limits (from / to)', 'limits', { area: true }) +
      '<div class="grid2">' + fld('Begin lat, long', 'coordsBegin', { ph: '29.76, -95.37' }) + fld('End lat, long', 'coordsEnd') + '</div>' +
      fld('Nature of the construction activity', 'nature', { area: true, ph: 'e.g. Widen roadway, replace culverts, add storm sewer' }), 's1');
    h += details('2. Acreage and permit basis', true,
      '<div class="grid2">' + fld('Disturbed acres', 'acres', { type: 'number' }) + fld('Support-activity acres', 'supportAcres', { type: 'number', help: 'Staging, borrow, batch plant, wash areas' }) + '</div>' +
      chk('Part of a larger common plan of development or sale', 'commonPlan') +
      (f.commonPlan ? fld('Total acres of the larger common plan', 'planAcres', { type: 'number', help: 'Discrete projects 1/4 mile or more apart with undisturbed land between can be treated separately (permit Part I.B).' }) : '') +
      chk('Routine maintenance only (same line, grade and capacity)', 'routine') +
      fld('Largest area disturbed at one time in one common drainage location (acres)', 'openAcres', { type: 'number', help: 'Drives the 10-acre sediment basin test and trap sizing. Your phasing assumption.' }), 's2');
    h += details('3. Receiving water, impairment and Edwards', false,
      fld('Nearest receiving water / stream', 'receiving') +
      fld('Flow path to first TCEQ classified segment', 'segment', { help: 'TxDOT Summary Sheet 1.11: use the TCEQ Surface Water Quality Segment Viewer.' }) +
      fld('MS4 operator(s) receiving discharge (names and addresses)', 'ms4', { area: true }) +
      sel('Discharges to a 303(d) impaired water or a TMDL area?', 'tmdl', YN) +
      (f.tmdl === 'yes' ? fld('Explain: pollutant of concern, TMDL / I-Plan', 'tmdlNote', { area: true }) : '') +
      sel('Edwards Aquifer recharge or contributing zone?', 'edwards', YN, M.edwardsCounty(f) ? 'This county is one of the Edwards counties named in the permit and TxDOT guidance. Only the mapped zone is regulated.' : '') +
      (f.edwards === 'yes' ? fld('Explain: WPAP / Contributing Zone plan status', 'edwardsNote', { area: true }) : ''), 's3');
    h += details('4. Soils, slopes and rainfall', false,
      fld('Soil types', 'soils', { area: true, ph: 'e.g. Beaumont clay (from USDA Web Soil Survey)' }) +
      '<div class="grid2">' + fld('Steepest slope (H in H:1V)', 'steepest', { type: 'number', help: '3 = 3H:1V' }) + '<div>' + chk('Soils erosive (your judgment)', 'erosive') + '</div></div>' +
      fld('Rainfall / erosion factors (your entries)', 'rainNote', { area: true, ph: 'e.g. R factor, 2-yr 24-hr depth. Not computed by this tool.' }), 's4');
    h += details('5. Activities on this site', false, '<p class="muted small">Checked items turn on the matching required BMPs.</p>' + D.ACTIVITIES.map(function (a) { return chk(a.label, a.key, 'act'); }).join(''), 's5');
    h += details('6. Allowable non-stormwater discharges', false, D.NSD.map(function (a) { return chk(a.label, a.key, 'nsd'); }).join(''), 's6');
    h += details('7. Schedule and phases', false,
      '<div class="grid2">' + fld('Anticipated start', 'start', { type: 'date' }) + fld('Anticipated completion', 'end', { type: 'date' }) + '</div>' +
      f.phases.map(function (ph) {
        return '<div class="phase" data-ph="' + esc(ph.id) + '"><div class="grid2"><label class="f"><span>Phase</span><input type="text" data-p="name" value="' + esc(ph.name) + '"></label><label class="f"><span>Acres</span><input type="text" inputmode="decimal" data-p="acres" value="' + esc(ph.acres) + '"></label></div>' +
          '<div class="grid2"><label class="f"><span>Start</span><input type="date" data-p="start" value="' + esc(ph.start) + '"></label><label class="f"><span>End</span><input type="date" data-p="end" value="' + esc(ph.end) + '"></label></div>' +
          '<button type="button" class="btn danger sm" data-act="delphase">Remove phase</button></div>';
      }).join('') + '<button type="button" class="btn sec block" data-act="addphase">+ Add phase</button>', 's7');
    h += details('8. Feasibility notes, permanent controls, dewatering', false,
      chk('Sediment basin required but not feasible', 'basinInfeasible') + (f.basinInfeasible ? fld('Why not feasible (the permit requires you to document it)', 'basinWhy', { area: true }) : '') +
      chk('Vegetated buffer not feasible next to surface water', 'bufferInfeasible') + (f.bufferInfeasible ? fld('Why not feasible', 'bufferWhy', { area: true }) : '') +
      fld('Permanent stormwater controls (with stationing)', 'permanentNote', { area: true }) +
      fld('Dewatering locations / discharge method', 'dewaterNote', { area: true }), 's8');
    var pane = $('#paneProject');
    pane.innerHTML = h;
    Array.prototype.forEach.call(pane.querySelectorAll('details.sec'), function (d) { if (openSecs[d.getAttribute('data-sec')]) d.open = true; });
    liveSummary();
  }
  function liveSummary() {
    var p = cur(), perm = M.permitDetermination(p.form), el = $('#liveSum'); if (!el) return;
    var cls = perm.tier === 'large' ? 'bad' : perm.tier === 'small' ? 'mid' : perm.tier === 'none' || perm.tier === 'exempt' ? 'ok' : 'info';
    el.innerHTML = '<span class="pill ' + cls + '">' + esc(perm.label) + '</span> <span class="muted small">' + esc(perm.headline) + '</span>';
  }
  function onFormInput(e) {
    var t = e.target, p = cur(), f = p.form;
    if (t.id === 'pname') { p.name = t.value || 'Untitled'; save(); renderProjSel(); return; }
    var ph = t.closest && t.closest('[data-ph]');
    if (ph && t.getAttribute('data-p')) { var o = f.phases.filter(function (x) { return x.id === ph.getAttribute('data-ph'); })[0]; if (o) o[t.getAttribute('data-p')] = t.value; save(); return; }
    var k = t.getAttribute('data-f'); if (!k) return;
    var g = t.getAttribute('data-g'), val = t.type === 'checkbox' ? t.checked : t.value;
    if (g) { f[g][k] = val; } else {
      f[k] = val;
      if (k === 'type' && ['d7', 'd14', 'd14lin'].indexOf(f.inspMode) >= 0) f.inspMode = val === 'txdot' ? 'd7' : (val === 'linear' ? 'd14lin' : 'd14');
    }
    save(); liveSummary();
    if (t.type === 'checkbox' || t.tagName === 'SELECT') { if (/^(commonPlan|basinInfeasible|bufferInfeasible|tmdl|edwards|type)$/.test(k)) { rememberOpen(); renderProject(); } }
  }
  function rememberOpen() { Array.prototype.forEach.call(document.querySelectorAll('#paneProject details.sec'), function (d) { openSecs[d.getAttribute('data-sec')] = d.open; }); }

  /* ---------- Permit pane ---------- */
  function renderPermit() {
    var p = cur(), f = p.form, perm = M.permitDetermination(f), t = perm.totals, h = '';
    var cls = perm.tier === 'large' ? 'bad' : perm.tier === 'small' ? 'mid' : perm.tier === 'none' || perm.tier === 'exempt' ? 'ok' : 'info';
    h += '<div class="card"><h2>Permit determination</h2><div class="verdict ' + cls + '"><b>' + esc(perm.label) + '</b><div>' + esc(perm.headline) + '</div></div>' +
      '<p class="muted small">Disturbed ' + M.fix(t.disturbed) + ' ac + support ' + M.fix(t.support) + ' ac = ' + M.fix(t.total) + ' ac' + (f.commonPlan ? '; common plan ' + M.fix(t.plan) + ' ac' : '') + '. Basis: ' + perm.basis.map(function (b) { return bd(b[0]) + esc(b[1]); }).join(' ') + '</p>' +
      '<p class="muted small">' + bd('TCEQ') + 'Permit: ' + esc(D.PERMIT.title) + ', effective ' + esc(D.PERMIT.effective) + ', expires ' + esc(D.PERMIT.expires) + '.</p></div>';
    if (perm.steps.length) h += '<div class="card"><h3>What to file and post</h3><ol class="steps">' + perm.steps.map(function (s) { return '<li>' + bd(s[0]) + esc(s[1]) + '</li>'; }).join('') + '</ol></div>';
    var dl = M.deadlines(f, perm);
    if (dl.length) h += '<div class="card"><h3>Dates from your start date</h3>' + dl.map(function (d) { return '<div class="dl"><b>' + esc(d.date ? M.fmtDate(d.date) : 'After final stabilization') + '</b><div>' + esc(d.label) + '<div class="muted small">' + bd(d.b) + esc(d.ref) + '</div></div></div>'; }).join('') + '</div>';
    else if (perm.tier === 'large' || perm.tier === 'small') h += '<div class="card"><p class="muted">Enter an anticipated start date on the Project tab to see deadlines.</p></div>';
    if (perm.notes.length) h += '<div class="card"><h3>Also check</h3><ul class="notes">' + perm.notes.map(function (n) { return '<li>' + bd(n[0]) + esc(n[1]) + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="card"><h3>Sediment basin test</h3>' + basinHtml(f) + '</div>';
    $('#panePermit').innerHTML = h;
  }
  function basinHtml(f) {
    var b = M.basinCheck(f);
    if (b.open == null) return '<p class="muted">Enter the largest area disturbed at one time (Project tab, section 2).</p>';
    return '<div class="verdict ' + (b.required ? 'bad' : 'ok') + '"><b>' + (b.required ? 'Basin required where feasible' : 'Basin not required (under 10 acres)') + '</b></div><ul class="notes">' + b.notes.map(function (n) { return '<li>' + bd(n[0]) + esc(n[1]) + '</li>'; }).join('') + '</ul>';
  }

  /* ---------- BMP pane ---------- */
  function renderBmps() {
    var p = cur(), f = p.form, rec = M.recommendBmps(f), ids = M.selectedIds(f, p.sel), h = '';
    var warns = M.checkSelection(f, p.sel), flags = M.flagsFor(f, p.sel), seal = M.sealFlags(f, p.sel);
    h += '<div class="card"><h2>BMP library</h2><p class="muted small">Pick the controls that apply. Pills show what your inputs trigger: <span class="pill bad">Required</span> <span class="pill mid">Suggested</span> <span class="pill">Optional</span>. Tick state is yours to change.</p>' +
      '<div class="row"><button type="button" class="btn sec" data-act="applysug">Apply suggestions</button><button type="button" class="btn sec" data-act="clearbmp">Clear all</button></div>' +
      '<div class="seg" role="tablist"><button type="button" data-view="suggested"' + (ui.bmpView === 'suggested' ? ' class="on"' : '') + '>Suggested + selected</button><button type="button" data-view="all"' + (ui.bmpView === 'all' ? ' class="on"' : '') + '>All ' + D.BMPS.length + '</button></div></div>';
    if (warns.length) h += '<div class="warnbox"><b>Check your selection</b><ul>' + warns.map(function (w) { return '<li>' + bd(w.b) + esc(w.t) + '</li>'; }).join('') + '</ul></div>';
    if (seal.length) h += '<div class="warnbox">' + bd('TXDOT') + 'A P.E. seal on the Summary Sheets may be needed: ' + esc(seal.join(' ')) + '</div>';
    Object.keys(D.CATS).forEach(function (cat) {
      var items = D.BMPS.filter(function (b) { return b.cat === cat; }).filter(function (b) { return ui.bmpView === 'all' || rec[b.id].level !== 'optional' || ids.indexOf(b.id) >= 0; });
      if (!items.length) return;
      h += '<div class="grp">' + esc(D.CATS[cat]) + '</div>';
      items.forEach(function (b) { h += bmpCard(b, rec[b.id], ids.indexOf(b.id) >= 0); });
    });
    if (flags.length) {
      h += '<div class="card"><h3>Where TxDOT guidance and the permit differ</h3><p class="muted small">The permit wins. Shown for the BMPs you selected.</p>' + flags.map(function (x) {
        return '<div class="flag"><b>' + esc(x.title) + '</b><p>' + bd('TXDOT') + esc(x.txdot) + '</p><p>' + bd('TCEQ') + esc(x.tceq) + '</p><p class="res"><b>' + esc(x.resolution) + '</b></p></div>'; }).join('') + '</div>';
    }
    $('#paneBmps').innerHTML = h;
  }
  function lines(arr) { return arr && arr.length ? '<ul>' + arr.map(function (x) { return '<li>' + bd(x[0]) + esc(x[1]) + '</li>'; }).join('') + '</ul>' : '<p class="muted small">None recorded.</p>'; }
  function bmpCard(b, r, on) {
    var open = !!ui.openBmp[b.id], lv = r.level === 'required' ? '<span class="pill bad">Required</span>' : r.level === 'recommended' ? '<span class="pill mid">Suggested</span>' : '<span class="pill">Optional</span>';
    var h = '<div class="bmp' + (open ? ' open' : '') + '" data-bmp="' + b.id + '"><div class="bh"><label class="tick"><input type="checkbox" data-bmpck="' + b.id + '"' + (on ? ' checked' : '') + '><span class="sr">Use ' + esc(b.name) + '</span></label>' +
      '<button type="button" class="bt" data-act="togbmp"><span class="nm">' + esc(b.name) + '</span><span class="meta">' + lv + ' ' + bd(b.badge) + (b.ec ? '<span class="ec">' + esc(b.ec) + '</span>' : '') + '<span class="ec">' + (b.tp === 'T' ? 'Temporary' : b.tp === 'P' ? 'Permanent' : 'Temp / perm') + '</span></span></button></div>';
    if (open) {
      h += '<div class="bd2">' + (r.why.length ? '<h4>Why it shows up</h4>' + lines(r.why) : '') +
        '<h4>Purpose</h4>' + lines(b.purpose) + '<h4>Where to use</h4>' + lines(b.where) + '<h4>Install</h4>' + lines(b.install) + '<h4>Maintain</h4>' + lines(b.maint) + '<h4>Inspection triggers</h4>' + lines(b.triggers) +
        (b.designUrl || b.inspUrl ? '<p class="small">' + (b.designUrl ? '<a href="' + esc(b.designUrl) + '" target="_blank" rel="noopener noreferrer">TxDOT design fact sheet</a>' : '') + (b.inspUrl ? ' &middot; <a href="' + esc(b.inspUrl) + '" target="_blank" rel="noopener noreferrer">TxDOT inspection job aid</a>' : '') + '</p>' : '') +
        (b.seal ? '<p class="small">' + bd('TXDOT') + 'Calculations or an infeasibility finding for this BMP can trigger a P.E. seal on the SWP3 Summary Sheets.</p>' : '') + '</div>';
    }
    return h + '</div>';
  }

  /* ---------- Outline pane ---------- */
  function renderOutline() {
    var p = cur(), secs = M.generateOutline(p);
    $('#paneOutline').innerHTML = '<div class="card"><h2>Draft SWP3 outline</h2><div class="draftbar">' + esc(M.DISCLAIMER) + '</div>' +
      '<p class="muted small">Order follows the permit SWP3 elements (Part III.F) with TxDOT Summary Sheet/Binder references. Blanks are for you to fill in. Re-opens with your latest entries each time.</p>' +
      '<div class="row"><button class="btn" data-act="printoutline" type="button">Print / Save PDF</button><button class="btn sec" data-act="mdoutline" type="button">Markdown</button><button class="btn sec" data-act="docoutline" type="button">Word (.doc)</button></div></div>' +
      '<div class="doc outline">' + secs.map(function (s) { return '<details class="osec"' + (s.n <= 1 ? ' open' : '') + '><summary>' + s.n + '. ' + esc(s.title) + '</summary><p class="refs">' + s.refs.map(function (r) { return bd(r[0]) + esc(r[1]); }).join(' ') + '</p>' + M.blocksToHtml(s.blocks) + '</details>'; }).join('') + '</div>';
  }

  /* ---------- Inspect pane ---------- */
  function renderInspect() {
    var p = cur(), f = p.form, plan = M.inspectionPlan(f), h = '';
    var last = p.inspLog.map(function (x) { return x.date; }).sort().pop() || '';
    var due = M.inspectionDue(f.inspMode, last, p.rainLog, M.todayStr());
    h += '<div class="card"><h2>Inspection schedule</h2>' +
      '<label class="f"><span>Schedule</span><select id="inspMode">' + Object.keys(M.INSP_MODES).map(function (k) { return '<option value="' + k + '"' + (k === f.inspMode ? ' selected' : '') + '>' + esc(M.INSP_MODES[k].label) + '</option>'; }).join('') + '</select></label>' +
      '<div class="verdict ' + (due.overdue ? 'bad' : due.due ? 'ok' : 'info') + '"><b>' + (due.due ? (due.overdue ? 'Overdue since ' : 'Next inspection due ') + esc(M.fmtDate(due.due)) : 'No inspection logged') + '</b><div>' + esc(due.reason) + (due.daysLeft != null ? ' (' + (due.daysLeft < 0 ? Math.abs(due.daysLeft) + ' days late' : due.daysLeft === 0 ? 'today' : due.daysLeft + ' days left') + ')' : '') + '</div></div>' +
      '<ul class="notes">' + plan.rules.map(function (r) { return '<li>' + bd(r[0]) + esc(r[1]) + '</li>'; }).join('') + '</ul>' +
      '<div class="row"><button class="btn" data-act="printcheck" type="button">Print inspection checklist</button></div></div>';
    h += '<div class="card"><h3>Log an inspection</h3><div class="grid2"><label class="f"><span>Date</span><input type="date" id="inDate" value="' + M.todayStr() + '"></label><label class="f"><span>Inspector</span><input type="text" id="inBy"></label></div>' +
      '<label class="f"><span>Notes (deficiencies, corrective actions)</span><textarea id="inNotes"></textarea></label><button type="button" class="btn block" data-act="addinsp">Save inspection</button>' +
      p.inspLog.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 30).map(function (x) { return '<div class="logrow" data-id="' + esc(x.id) + '"><div><b>' + esc(M.fmtDate(x.date)) + '</b> ' + esc(x.by) + '<div class="muted small">' + esc(x.notes) + '</div></div><button class="x" data-act="delinsp" aria-label="Delete inspection">&times;</button></div>'; }).join('') + '</div>';
    h += '<div class="card"><h3>Rain log</h3><p class="muted small">Enter the date a storm ended and total inches. Storms of 0.5 in. or more start the 24-hour inspection clock for the 14-day schedules.</p><div class="grid2"><label class="f"><span>Date storm ended</span><input type="date" id="rnDate" value="' + M.todayStr() + '"></label><label class="f"><span>Rain (in.)</span><input type="text" inputmode="decimal" id="rnIn"></label></div><button type="button" class="btn block" data-act="addrain">Add rain</button>' +
      p.rainLog.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 30).map(function (x) { return '<div class="logrow" data-id="' + esc(x.id) + '"><div><b>' + esc(M.fmtDate(x.date)) + '</b> ' + esc(M.fix(x.inches, 2)) + ' in.' + (x.inches >= 0.5 ? ' <span class="pill bad">0.5 in. or more</span>' : '') + '</div><button class="x" data-act="delrain" aria-label="Delete rain entry">&times;</button></div>'; }).join('') + '</div>';
    $('#paneInspect').innerHTML = h;
  }

  /* ---------- More pane ---------- */
  function renderMore() {
    var h = '<div class="card"><h2>Projects</h2>' + state.projects.map(function (p) { return '<div class="projrow"><div class="nm"><b>' + esc(p.name) + '</b>' + (p.id === state.activeId ? ' <span class="pill ok">Open</span>' : '') + '<div class="muted small">' + esc(M.typeLabel(p.form.type)) + ' &middot; ' + esc(p.form.acres || '?') + ' ac</div></div><div class="row2"><button class="btn sec sm" data-act="openproj" data-id="' + esc(p.id) + '">Open</button><button class="btn danger sm" data-act="delproj" data-id="' + esc(p.id) + '">Delete</button></div></div>'; }).join('') +
      '<div class="row"><button class="btn" data-act="newproj" type="button">+ New project</button><button class="btn sec" data-act="dupproj" type="button">Duplicate current</button></div></div>';
    h += '<div class="card"><h2>Save and load</h2><p class="muted small">Data stays on this device (browser storage). Save a JSON file to back it up or move it to another device.</p><div class="row"><button class="btn" data-act="savejson" type="button">Save all (JSON)</button><label class="btn sec" for="loadjson">Load JSON</label><input type="file" id="loadjson" accept="application/json,.json" class="sr"></div></div>';
    h += '<div class="card"><h2>Sources</h2><div class="draftbar">' + esc(M.DISCLAIMER) + '</div><p class="muted small">' + bd('TCEQ') + 'Permit version used: ' + esc(D.PERMIT.title) + ', effective ' + esc(D.PERMIT.effective) + ', expires ' + esc(D.PERMIT.expires) + '. Check TCEQ for a newer permit.</p>' +
      '<p class="muted small"><b>Read</b> = the document was opened and the cited content checked while building this tool. <b>Link only</b> = the page exists but its content was not fully read.</p>' +
      '<p class="muted small">Precedence: TxDOT first. The TCEQ permit is the floor and wins where TxDOT is less strict. Houston, Harris County and iSWM are secondary. ' + bd('ROT') + 'and ' + bd('ASSUMED') + 'mark rule-of-thumb and user-assumption items.</p><ul class="srcs">' +
      Object.keys(D.SOURCES).map(function (k) { var s = D.SOURCES[k]; return '<li>' + bd(s.badge) + '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a> <span class="pill ' + (s.status === 'read' ? 'ok' : 'mid') + '">' + (s.status === 'read' ? 'Read' : 'Link only') + '</span><div class="muted small">' + esc(s.note || '') + '</div></li>'; }).join('') + '</ul></div>';
    h += '<div class="card"><h3>Limits</h3><ul class="notes"><li>Not a design tool: it does not size basins from rainfall, compute R-factors or replace the engineer.</li><li>Does not file anything with TCEQ or TxDOT.</li><li>Not modeled: low-erosion-potential auto-authorization (Appendix A), the Low Rainfall Erosivity Waiver, sites with concrete batch plants (Part V), and local plan review.</li><li>Houston Stormwater Management Handbook and Harris County regulation text were not read.</li></ul></div>';
    $('#paneMore').innerHTML = h;
  }

  /* ---------- render / events ---------- */
  function render() {
    renderProjSel();
    var t = ui.tab; document.body.setAttribute('data-tab', t);
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
    if (t === 'project') renderProject(); else if (t === 'permit') renderPermit(); else if (t === 'bmps') renderBmps();
    else if (t === 'outline') renderOutline(); else if (t === 'inspect') renderInspect(); else renderMore();
  }
  function setTab(t) { if (ui.tab === 'project') rememberOpen(); ui.tab = t; render(); window.scrollTo(0, 0); }

  document.addEventListener('input', function (e) { if (e.target.closest('#paneProject')) onFormInput(e); });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.closest('#paneProject')) { onFormInput(e); return; }
    if (t.id === 'projSel') { state.activeId = t.value; save(); render(); return; }
    if (t.hasAttribute && t.hasAttribute('data-bmpck')) { var p = cur(); p.sel[t.getAttribute('data-bmpck')] = t.checked; save(); var y = window.scrollY; renderBmps(); window.scrollTo(0, y); return; }
    if (t.id === 'inspMode') { cur().form.inspMode = t.value; save(); renderInspect(); return; }
    if (t.id === 'loadjson' && t.files && t.files[0]) {
      var rd = new FileReader();
      rd.onload = function () { var r = M.restore(String(rd.result), state); if (r.ok) save(); toast(r.msg); if (r.ok) { ui.tab = 'project'; render(); } };
      rd.readAsText(t.files[0]); t.value = '';
    }
  });
  document.addEventListener('click', function (e) {
    var tb = e.target.closest('#tabs button'); if (tb) { setTab(tb.getAttribute('data-t')); return; }
    var vw = e.target.closest('.seg button'); if (vw) { ui.bmpView = vw.getAttribute('data-view'); renderBmps(); return; }
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), p = cur(), f = p.form;
    if (act === 'addphase') { f.phases.push({ id: M.uid('ph'), name: '', start: '', end: '', acres: '' }); save(); rememberOpen(); openSecs.s7 = true; renderProject(); }
    else if (act === 'delphase') { var id = b.closest('[data-ph]').getAttribute('data-ph'); f.phases = f.phases.filter(function (x) { return x.id !== id; }); save(); rememberOpen(); renderProject(); }
    else if (act === 'applysug') { M.applySuggestions(p); save(); renderBmps(); toast('Suggestions applied.'); }
    else if (act === 'clearbmp') { D.BMPS.forEach(function (x) { p.sel[x.id] = false; }); save(); renderBmps(); }
    else if (act === 'togbmp') { var bid = b.closest('[data-bmp]').getAttribute('data-bmp'); ui.openBmp[bid] = !ui.openBmp[bid]; var yy = window.scrollY; renderBmps(); window.scrollTo(0, yy); }
    else if (act === 'printoutline') printHtml(M.outlineToHtml(p, M.generateOutline(p)));
    else if (act === 'mdoutline') download(fileName(p, 'md'), M.outlineToMarkdown(p, M.generateOutline(p)), 'text/markdown');
    else if (act === 'docoutline') download(fileName(p, 'doc'), M.outlineToDoc(p, M.generateOutline(p)), 'application/msword');
    else if (act === 'printcheck') printHtml(M.checklistToHtml(p));
    else if (act === 'addinsp') {
      var d = $('#inDate').value; if (!M.isoOk(d)) { toast('Pick a date.'); return; }
      p.inspLog.push({ id: M.uid('i'), date: d, kind: 'routine', by: $('#inBy').value.trim(), notes: $('#inNotes').value.trim() }); save(); renderInspect(); toast('Inspection saved.');
    }
    else if (act === 'delinsp') { var iid = b.closest('[data-id]').getAttribute('data-id'); p.inspLog = p.inspLog.filter(function (x) { return x.id !== iid; }); save(); renderInspect(); }
    else if (act === 'addrain') {
      var rd = $('#rnDate').value, inch = M.num($('#rnIn').value); if (!M.isoOk(rd) || inch == null || inch < 0) { toast('Enter a date and rainfall in inches.'); return; }
      p.rainLog.push({ id: M.uid('r'), date: rd, inches: inch }); save(); renderInspect();
    }
    else if (act === 'delrain') { var rid = b.closest('[data-id]').getAttribute('data-id'); p.rainLog = p.rainLog.filter(function (x) { return x.id !== rid; }); save(); renderInspect(); }
    else if (act === 'newproj') { var np = M.newProject({ name: 'New TxDOT project' }); state.projects.push(np); state.activeId = np.id; save(); ui.tab = 'project'; render(); toast('New project created.'); }
    else if (act === 'dupproj') { var cp = M.sanitizeProject(JSON.parse(JSON.stringify(p))); cp.id = M.uid('p'); cp.name = p.name + ' (copy)'; state.projects.push(cp); state.activeId = cp.id; save(); render(); toast('Duplicated.'); }
    else if (act === 'openproj') { state.activeId = b.getAttribute('data-id'); save(); ui.tab = 'project'; render(); }
    else if (act === 'delproj') {
      var did = b.getAttribute('data-id'), dp = state.projects.filter(function (x) { return x.id === did; })[0];
      if (!dp || !window.confirm('Delete "' + dp.name + '"? This cannot be undone.')) return;
      state.projects = state.projects.filter(function (x) { return x.id !== did; });
      if (!state.projects.length) state.projects.push(M.newProject({ name: 'My TxDOT project' }));
      if (state.activeId === did) state.activeId = state.projects[0].id;
      save(); render();
    }
    else if (act === 'savejson') download('swp3-builder-backup-' + M.todayStr() + '.json', M.backup(state), 'application/json');
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  render();
})();
