/* TxDOT Precertification helper — UI. Vanilla JS, data in localStorage only (precert.data.v1). */
(function () {
  'use strict';
  var M = window.PCM, UIKEY = 'precert.ui.v1';
  var C = null, IX = {}, st = load(), ui = loadUI();
  var $ = function (s) { return document.querySelector(s); };

  function h(tag, attrs) {
    var el = document.createElement(tag), kids = [].slice.call(arguments, 2);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (function add(list) { list.forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) add(c); else el.append(c.nodeType ? c : String(c)); }); })(kids);
    return el;
  }
  function load() { try { var r = localStorage.getItem(M.KEY); if (r) return M.normalize(JSON.parse(r)); } catch (e) { /* fall through */ } return M.newState(); }
  function loadUI() { var u = {}; try { u = JSON.parse(localStorage.getItem(UIKEY) || '{}') || {}; } catch (e) { u = {}; } return Object.assign({ tab: 'profile', theme: 'light', hydroOnly: true, q: '', cat: '' }, u); }
  function saveUI() { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (e) { /* private mode */ } }
  var saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(M.KEY, JSON.stringify(st)); $('#saved').textContent = 'Saved on this device'; } catch (e) { toast('Could not save on this device (storage full or private mode).'); } }, 150); }
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3200); }
  function applyTheme() { document.documentElement.dataset.theme = ui.theme; var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = ui.theme === 'dark' ? '#0f172a' : '#f8fafc'; }

  /* ---------- small widgets ---------- */
  function field(label, obj, key, opts) {
    opts = opts || {};
    var id = 'f-' + (opts.id || key) + '-' + (obj.id || 'p');
    var inp = opts.area ? h('textarea', { id: id, rows: opts.rows || 3, placeholder: opts.ph || '' }) : h('input', { id: id, type: opts.type || 'text', placeholder: opts.ph || '', inputmode: opts.mode || null, autocomplete: 'off' });
    inp.value = obj[key] || '';
    inp.addEventListener('input', function () { obj[key] = inp.value; save(); if (opts.onInput) opts.onInput(inp.value, inp); });
    return h('label', { class: 'f' + (opts.wide ? ' wide' : '') }, h('span', {}, label), inp, opts.hint ? h('small', { class: 'muted' }, opts.hint) : null);
  }
  function bar(pct, label) { return h('span', { class: 'meter', role: 'img', 'aria-label': label || (pct + '%') }, h('i', { class: 'w' + Math.round(pct / 10) * 10 })); }
  function copy(text, what) {
    var done = function () { toast((what || 'Text') + ' copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, fb);
    fb();
    function fb() { var ta = h('textarea', { class: 'offscreen', 'aria-hidden': 'true' }); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select the text and copy it.'); } ta.remove(); }
  }
  function download(name, text, type) { var a = h('a', { download: name }), u = URL.createObjectURL(new Blob([text], { type: type })); a.href = u; document.body.append(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500); }
  function catLabel(code) { var c = IX[code]; return code + (c ? ' ' + c.name : ''); }
  function catSelect(id, onPick, onlyTargets) {
    var s = h('select', { id: id, 'aria-label': 'Work category' }, h('option', { value: '' }, onlyTargets ? 'Add a work category…' : 'Choose a work category…'));
    var codes = onlyTargets && st.targets.length ? st.targets : C.categories.map(function (c) { return c.code; });
    if (onlyTargets && st.targets.length) s.append(h('optgroup', { label: 'My categories' }, st.targets.map(function (k) { return h('option', { value: k }, catLabel(k)); })));
    C.groups.forEach(function (g) { var cs = C.categories.filter(function (c) { return c.group === g.group; }); s.append(h('optgroup', { label: 'Group ' + g.group + ' ' + g.name }, cs.map(function (c) { return h('option', { value: c.code }, c.code + ' ' + c.name); }))); });
    void codes;
    s.addEventListener('change', function () { if (s.value) onPick(s.value); });
    return s;
  }


  /* ---------- v1.1 example mode (fictional data; real data is backed up first) ---------- */
  function backupRaw() { try { return localStorage.getItem(M.PRE_EXAMPLE_KEY); } catch (e) { return null; } }
  function persistNow() { clearTimeout(saveT); try { localStorage.setItem(M.KEY, JSON.stringify(st)); } catch (e) { toast('Could not save on this device.'); } }
  function loadExample() {
    if (M.isExampleState(st)) { toast('The example is already loaded.'); return; }
    if (M.hasRealData(st)) {
      if (!confirm('Load the fictional example? Your current data is saved first as a backup on this device (' + M.PRE_EXAMPLE_KEY + ') and you can restore it with "Restore my data" or "Clear example".')) return;
      try { localStorage.setItem(M.PRE_EXAMPLE_KEY, JSON.stringify(st)); } catch (e) { toast('Could not back up your data — example not loaded.'); return; }
    }
    st = M.exampleState(); persistNow(); ui.tab = ui.tab === 'sources' ? 'profile' : ui.tab; saveUI(); render(); toast('Example loaded — fictional data, replace with your own.');
  }
  function mergeBack(base, extra) {
    var ids = {}; base.projects.forEach(function (p) { ids[p.id] = 1; });
    extra.projects.forEach(function (p) { if (!ids[p.id]) base.projects.push(p); });
    ['degrees', 'certs'].forEach(function (k) { var have = {}; base[k].forEach(function (x) { have[x.id] = 1; }); extra[k].forEach(function (x) { if (!have[x.id]) base[k].push(x); }); });
    extra.targets.forEach(function (c) { if (base.targets.indexOf(c) < 0) base.targets.push(c); });
    return base;
  }
  function clearEx() {
    var raw = backupRaw(), cleared = M.clearExample(st), kept = cleared.projects.length;
    if (!confirm('Remove the example records?' + (raw ? ' Your backed-up data comes back.' : '') + (kept ? ' Records you added yourself stay.' : ''))) return;
    if (raw) { try { st = mergeBack(M.normalize(JSON.parse(raw)), cleared); } catch (e) { st = cleared; } localStorage.removeItem(M.PRE_EXAMPLE_KEY); } else st = cleared;
    persistNow(); render(); toast('Example cleared.');
  }
  function restoreMine() {
    var raw = backupRaw(); if (!raw) return;
    if (!confirm('Restore your data from before the example? The example (and anything typed into it) is replaced.')) return;
    try { st = M.normalize(JSON.parse(raw)); } catch (e) { toast('Backup could not be read.'); return; }
    localStorage.removeItem(M.PRE_EXAMPLE_KEY); persistNow(); render(); toast('Your data is restored.');
  }
  function exampleChrome() {
    var on = M.isExampleState(st), b = $('#exBanner');
    b.hidden = !on; $('#exRestore').hidden = !backupRaw(); document.body.classList.toggle('isex', on);
    var eb = $('#exBtn'); eb.textContent = on ? 'Clear example' : 'Load example'; eb.dataset.mode = on ? 'clear' : 'load';
  }
  function exampleCard() {
    if (M.isExampleState(st) || M.hasRealData(st)) return null;
    return h('section', { class: 'card excard', id: 'exStart' }, h('h2', {}, 'New here? See a filled-in example'), h('p', { class: 'muted' }, 'Loads a fictional engineer (Alex Example, P.E.), a fictional firm and three fictional drainage projects with sample write-ups for 10.1.1, 10.2.1, 4.2.1 and 10.8.1, so you can see how coverage, readiness and export work. Nothing in it is real experience.'),
      h('button', { type: 'button', class: 'btn', id: 'exLoad2', onclick: loadExample }, 'Load example'));
  }

  /* ---------- 1. profile ---------- */
  function renderProfile() {
    var P = st.profile, ssnW = h('p', { class: 'warn', id: 'ssnWarn', hidden: !M.looksLikeSSN(P.personnelNo) }, '⚠ This looks like a Social Security number. Use the employee number your firm assigns, never an SSN.');
    return [exampleCard(),
      h('section', { class: 'card' }, h('h2', {}, 'Employee'),
        h('div', { class: 'grid' }, field('First name *', P, 'first'), field('Middle name', P, 'middle'), field('Last name *', P, 'last'), field('Firm name *', P, 'firm'), field('Firm sequence number *', P, 'firmSeq', { mode: 'numeric' }), field('Branch number', P, 'branch'),
          field('Field of expertise', P, 'expertise', { ph: 'e.g. engineer' }), field('Employment status *', P, 'employment'),
          field('Employee personnel number (assigned by your firm)', P, 'personnelNo', { id: 'pno', hint: 'Do NOT enter a Social Security number.', onInput: function (v) { ssnW.hidden = !M.looksLikeSSN(v); } }),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'formerTx', checked: P.formerTxdot, onchange: function (e) { P.formerTxdot = e.target.checked; save(); } }), 'Former TxDOT employee')),
        h('p', { class: 'warn soft' }, '⚠ Never enter your SSN anywhere in this tool. TxDOT asks for a personnel number assigned within your firm.'), ssnW),
      h('section', { class: 'card' }, h('h2', {}, 'Licensure'),
        h('div', { class: 'grid' }, field('P.E. license number', P, 'peNumber'), field('State', P, 'peState'), field('Issue date', P, 'peDate', { type: 'date' })),
        h('p', { class: 'muted' }, 'In CCIS a license is entered as a certification (type Professional Engineer, code 100000, issuing agency e.g. TBPELS).')),
      listCard('Degrees', st.degrees, function () { return { id: M.uid(), type: '', field: '', school: '', date: '' }; }, function (d) { return [field('Degree type', d, 'type', { ph: 'B.S., M.S.' }), field('Field', d, 'field', { ph: 'Civil engineering' }), field('School', d, 'school'), field('Date', d, 'date', { type: 'date' })]; }, 'addDegree'),
      listCard('Certifications and training', st.certs, function () { return { id: M.uid(), kind: 'cert', type: '', code: '', number: '', agency: '', issue: '', exp: '', completion: '', category: '', note: '' }; }, certFields, 'addCert',
        h('p', { class: 'muted' }, 'Training certificates must be uploaded in CCIS for work categories ' + M.TRAINING_UPLOAD.join(', ') + ' — each as a separate PDF named Last.First.category.YYYY-MM-DD.PDF. This tool does not store files; keep the PDFs on your device.'))
    ];
  }
  function certFields(c) {
    var fn = h('p', { class: 'muted fname' });
    var upd = function () { fn.textContent = c.kind === 'training' && c.category ? 'PDF name for CCIS: ' + M.certFileName(st, c) + (M.needsTraining(c.category) ? '' : ' (this category does not require a training upload — do not upload unrequired certificates)') : ''; };
    var kind = h('select', { 'aria-label': 'Kind', onchange: function (e) { c.kind = e.target.value; save(); upd(); } }, h('option', { value: 'cert' }, 'Certification'), h('option', { value: 'license' }, 'License'), h('option', { value: 'training' }, 'Required training'));
    kind.value = c.kind;
    var cat = h('select', { 'aria-label': 'Work category', onchange: function (e) { c.category = e.target.value; save(); upd(); } }, h('option', { value: '' }, '—'), M.TRAINING_UPLOAD.map(function (k) { return h('option', { value: k }, '⚑ ' + catLabel(k)); }));
    cat.value = c.category; upd();
    return [h('label', { class: 'f' }, h('span', {}, 'Kind'), kind), field('Type', c, 'type', { ph: 'P.E., CFM, NHI 130055…' }), field('Number', c, 'number'), field('Issuing agency', c, 'agency', { ph: 'TBPELS, ASFPM, NHI' }),
      field('Issue date', c, 'issue', { type: 'date' }), field('Expiration', c, 'exp', { type: 'date' }), field('Completion (training)', c, 'completion', { type: 'date', onInput: upd }), h('label', { class: 'f' }, h('span', {}, 'For work category'), cat),
      field('PDF / notes', c, 'note', { ph: 'Where the PDF is kept, course hours…', wide: true }), fn];
  }
  function listCard(title, arr, make, fields, addId, extra) {
    var box = h('div', { class: 'items' });
    var draw = function () { box.replaceChildren.apply(box, arr.map(function (x, i) { return h('div', { class: 'item' }, h('div', { class: 'grid' }, fields(x)), h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { if (confirm('Remove this entry?')) { arr.splice(i, 1); save(); draw(); } } }, 'Remove')); })); if (!arr.length) box.append(h('p', { class: 'muted' }, 'None yet.')); };
    draw();
    return h('section', { class: 'card' }, h('h2', {}, title), extra || null, box, h('button', { type: 'button', class: 'btn', id: addId, onclick: function () { arr.push(make()); save(); draw(); } }, '+ Add'));
  }

  /* ---------- write-up editor for one project entry ---------- */
  function entryEditor(p, e) {
    var c = IX[e.code]; if (!c) return h('p', { class: 'warn' }, 'Unknown category ' + e.code);
    var ta = h('textarea', { rows: 6, class: 'wtext', 'data-entry': e.id, 'aria-label': 'Description of work for ' + e.code, placeholder: 'Describe the work YOU performed on this project for ' + c.name + '. Start with "I designed / I analyzed / I computed …".' });
    ta.value = e.text;
    var stat = h('div', { class: 'wstat' });
    var upd = function () { var n = M.words(ta.value), b = M.blanksLeft(ta.value); stat.replaceChildren(h('span', {}, n + ' words · ' + ta.value.length + ' characters'), h('span', { class: M.firstPerson(ta.value) ? 'ok' : 'bad' }, M.firstPerson(ta.value) ? '✓ first person' : '✗ no "I designed / I computed…" yet'), b ? h('span', { class: 'bad' }, b + ' blank(s) to fill') : ''); };
    ta.addEventListener('input', function () { e.text = ta.value; save(); upd(); }); upd();
    var items = M.checklist(c);
    return h('div', { class: 'entry', 'data-code': e.code },
      h('div', { class: 'ehead' }, h('b', {}, catLabel(e.code)), e.isExample ? h('span', { class: 'tag extag' }, 'SAMPLE TEXT') : null, M.needsTraining(e.code) ? h('span', { class: 'tag warnt' }, '⚑ training upload') : null,
        h('span', { class: 'sp' }), h('button', { type: 'button', class: 'btn ghost sm tpl', onclick: function () { if (ta.value.trim() && !confirm('Add the fill-in template below your text?')) return; ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + M.template(c); e.text = ta.value; save(); upd(); ta.focus(); } }, 'Insert template'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { copy(e.text, 'Description of work'); } }, 'Copy'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { if (!confirm('Remove ' + e.code + ' from this project?')) return; p.cats.splice(p.cats.indexOf(e), 1); save(); render(); } }, 'Remove')),
      ta, stat,
      h('fieldset', { class: 'covers' }, h('legend', {}, 'This write-up addresses:'), items.map(function (it) {
        return h('label', { class: 'chk ' + it.kind }, h('input', { type: 'checkbox', 'data-item': it.id, checked: e.covers.indexOf(it.id) >= 0, onchange: function (ev) { M.toggleCover(st, p.id, e.id, it.id, ev.target.checked); save(); } }), h('span', {}, it.kind === 'scope' ? h('i', {}, 'Scope: ') : h('b', {}, 'Requirement: '), it.text)); })));
  }

  /* ---------- 2. projects ---------- */
  function renderProjects() {
    var list = st.projects.map(function (p, i) {
      return h('section', { class: 'card proj', 'data-project': p.id },
        h('div', { class: 'ehead' }, h('h2', {}, 'Project ' + (i + 1) + (p.name ? ': ' + p.name : '')), p.isExample ? h('span', { class: 'tag extag' }, 'EXAMPLE') : null, h('span', { class: 'sp' }),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { copy(M.projectText(st, p, C), 'Project'); } }, 'Copy for CCIS'),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { if (confirm('Delete this project and its write-ups?')) { st.projects.splice(st.projects.indexOf(p), 1); save(); render(); } } }, 'Delete')),
        h('div', { class: 'grid' }, field('Project name', p, 'name', { id: 'pname' }), field('Begin date', p, 'begin', { type: 'date', id: 'pbeg' }), field('End date', p, 'end', { type: 'date', id: 'pend' }), field('Location', p, 'location', { id: 'ploc' }),
          field('Estimated project fees ($)', p, 'fees', { mode: 'decimal', id: 'pfee' }), field('Estimated construction cost ($)', p, 'cost', { mode: 'decimal', id: 'pcost' }), field('General description', p, 'desc', { area: true, wide: true, id: 'pdesc' })),
        h('h3', {}, 'Work categories on this project'),
        p.cats.length ? p.cats.map(function (e) { return entryEditor(p, e); }) : h('p', { class: 'muted' }, 'No work categories yet.'),
        catSelect('addCat-' + p.id, function (code) { M.addEntry(st, p.id, code, C); save(); render(); }, true));
    });
    return [h('div', { class: 'bar' }, h('p', { class: 'muted' }, 'Mirrors CCIS "Add Project": project details, then each work category with a description of the work you performed. Overlapping project periods are not counted twice.'),
      h('button', { type: 'button', class: 'btn', id: 'addProject', onclick: function () { M.addProject(st); save(); render(); } }, '+ Add project')), list.length ? list : h('p', { class: 'empty' }, 'No projects yet. Add the projects that show your experience in the categories you want.')];
  }

  /* ---------- 3. categories + write-up helper ---------- */
  function renderCats() {
    var q = h('input', { type: 'search', id: 'catQ', placeholder: 'Search categories (e.g. hydraulic, 10.2.1)', value: ui.q, autocomplete: 'off' });
    var only = h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'hydroOnly', checked: ui.hydroOnly }), 'Drainage / hydraulics related only');
    var tree = h('div', { class: 'ctree', id: 'catTree' });
    var draw = function () {
      var s = ui.q.toLowerCase();
      tree.replaceChildren.apply(tree, C.groups.map(function (g) {
        var cs = C.categories.filter(function (c) { return c.group === g.group && (!ui.hydroOnly || M.isHydro(c)) && (!s || (c.code + ' ' + c.name + ' ' + c.description).toLowerCase().indexOf(s) >= 0); });
        if (!cs.length) return null;
        return h('details', { class: 'grp', open: !!(s || ui.hydroOnly) }, h('summary', {}, h('b', {}, 'Group ' + g.group), ' ' + g.name, h('span', { class: 'cnt' }, String(cs.length))),
          h('ul', {}, cs.map(function (c) { var on = st.targets.indexOf(c.code) >= 0; return h('li', { class: on ? 'on' : '' }, h('button', { type: 'button', class: 'cbtn', 'data-code': c.code, onclick: function () { ui.cat = c.code; saveUI(); render(); } }, h('code', {}, c.code), ' ' + c.name, M.needsTraining(c.code) ? h('span', { class: 'tag warnt' }, '⚑ training') : null, on ? h('span', { class: 'tag okt' }, '✓ mine') : null)); })));
      }).filter(Boolean));
      if (!tree.children.length) tree.append(h('p', { class: 'muted' }, 'No category matches.'));
    };
    q.addEventListener('input', function () { ui.q = q.value; saveUI(); draw(); });
    only.querySelector('input').addEventListener('change', function (e) { ui.hydroOnly = e.target.checked; saveUI(); draw(); });
    draw();
    return [h('div', { class: 'two' }, h('section', { class: 'card' }, h('h2', {}, 'Work categories'), h('p', { class: 'muted' }, C.categories.length + ' categories from TxDOT\'s list dated ' + C.docDate + ' (verified ' + C.verified + ').'), q, only, tree),
      h('section', { class: 'card helper', id: 'helper' }, ui.cat && IX[ui.cat] ? helper(IX[ui.cat]) : h('p', { class: 'muted' }, 'Pick a category to see its requirements, a write-up guide and your coverage.')))];
  }
  function helper(c) {
    var on = st.targets.indexOf(c.code) >= 0, cv = M.coverage(st, c);
    var pick = h('select', { id: 'entryProj', 'aria-label': 'Project' }, h('option', { value: '' }, 'Add a write-up on project…'), st.projects.map(function (p, i) { return h('option', { value: p.id }, p.name || 'Project ' + (i + 1)); }), h('option', { value: '__new' }, '+ New project'));
    pick.addEventListener('change', function () { var pid = pick.value; if (!pid) return; if (pid === '__new') pid = M.addProject(st).id; M.addEntry(st, pid, c.code, C); save(); render(); });
    return [h('div', { class: 'ehead' }, h('h2', {}, c.code + ' ' + c.name), h('span', { class: 'sp' }),
        h('button', { type: 'button', class: 'btn' + (on ? ' ghost' : ''), id: 'targetBtn', onclick: function () { if (on) st.targets.splice(st.targets.indexOf(c.code), 1); else st.targets.push(c.code); save(); render(); } }, on ? '✓ In my categories' : '+ Apply for this category')),
      h('p', { class: 'muted' }, 'Group ' + c.group + ' · ' + (C.groups.filter(function (g) { return g.group === c.group; })[0] || {}).name),
      h('p', {}, c.description || 'No description in TxDOT\'s list — confirm on TxDOT\'s page.'),
      h('h3', {}, 'Qualification requirements (TxDOT text)'),
      h('ul', { class: 'reqs' }, c.requirements.map(function (r) { return h('li', { class: r.head ? 'head' : '' }, r.text); })),
      M.minYears(c) ? h('p', {}, 'Minimum experience stated: ' + M.minYears(c) + ' years · your project dates show ~' + cv.years + ' years (overlaps counted once; estimate).') : null,
      M.needsTraining(c.code) ? h('p', { class: 'warn soft' }, '⚑ Training certificate(s) must be uploaded in CCIS for this category, one PDF each, named Last.First.' + c.code + '.YYYY-MM-DD.PDF.') : null,
      h('h3', {}, 'Coverage'), h('div', { class: 'cov' }, bar(cv.pct), h('b', { id: 'covPct' }, cv.reqDone + ' / ' + cv.reqTotal + ' requirements addressed')),
      h('ul', { class: 'covl' }, cv.rows.map(function (r) { return h('li', { class: r.by.length ? 'ok' : r.item.kind === 'req' ? 'gap' : 'opt' }, (r.by.length ? '✓ ' : r.item.kind === 'req' ? '✗ ' : '○ ') + r.item.text, r.by.length ? h('span', { class: 'muted' }, ' — ' + r.by.map(function (x) { return x.p.name || 'Untitled project'; }).join(', ')) : null); })),
      h('h3', {}, 'How to write it (TxDOT tips)'), h('ul', { class: 'tips' }, M.WRITE_TIPS.map(function (t) { return h('li', {}, t); })),
      h('p', { class: 'muted' }, 'The template only has blanks (____). Describe only work you actually did; the tool never writes experience for you.'),
      h('h3', {}, 'Your write-ups'), cv.entries.length ? cv.entries.map(function (x) { return h('div', {}, h('p', { class: 'pn' }, x.p.name || 'Untitled project'), entryEditor(x.p, x.e)); }) : h('p', { class: 'muted' }, 'None yet.'), pick];
  }

  /* ---------- 4. readiness tree ---------- */
  function renderReady() {
    var R = M.readiness(st, C);
    if (!R.length) return h('p', { class: 'empty' }, 'Choose the work categories you want (Work categories tab, "+ Apply for this category") to see your readiness.');
    return [h('p', { class: 'muted' }, 'Category → requirements → projects that support them. Red items are gaps to close before you submit in CCIS.'),
      h('ul', { class: 'tree', id: 'readyTree' }, R.map(function (r) {
        return h('li', { class: 'tcat ' + (r.ready ? 'ok' : 'gap') }, h('div', { class: 'node' }, h('b', {}, r.cat.code + ' ' + r.cat.name), h('span', { class: 'sp' }), bar(r.pct), h('span', { class: 'tag ' + (r.ready ? 'okt' : 'badt') }, r.ready ? 'Ready' : r.gaps.length + ' gap' + (r.gaps.length === 1 ? '' : 's'))),
          h('ul', {}, r.rows.filter(function (x) { return x.item.kind === 'req'; }).map(function (x) {
            return h('li', { class: x.by.length ? 'ok' : 'gap' }, h('div', { class: 'node' }, (x.by.length ? '✓ ' : '✗ ') + x.item.text),
              x.by.length ? h('ul', {}, x.by.map(function (y) { return h('li', { class: 'proj' }, h('div', { class: 'node pnode' }, '▣ ' + (y.p.name || 'Untitled project') + (y.p.begin ? ' (' + y.p.begin.slice(0, 4) + '–' + (y.p.end || 'now').slice(0, 4) + ')' : ''))); })) : null);
          }), r.minYears ? h('li', { class: r.years >= r.minYears ? 'ok' : 'gap' }, h('div', { class: 'node' }, (r.years >= r.minYears ? '✓ ' : '✗ ') + 'Experience: ~' + r.years + ' of ' + r.minYears + ' years in project dates')) : null),
          r.gaps.length ? h('ul', { class: 'gaps' }, r.gaps.map(function (g) { return h('li', {}, g); })) : null);
      }))];
  }

  /* ---------- 5. CCIS steps ---------- */
  function renderCCIS() {
    var P = M.ccisProgress(st);
    return [h('section', { class: 'card' }, h('h2', {}, 'CCIS step by step'), h('div', { class: 'cov' }, bar(P.done / P.total * 100), h('b', { id: 'ccisPct' }, P.done + ' / ' + P.total + ' steps done')),
      h('p', {}, 'Official page: ', h('a', { href: 'https://www.txdot.gov/business/peps/become-precertified.html', target: '_blank', rel: 'noopener noreferrer' }, 'TxDOT — Become precertified'), '. Questions: PEPS CCIS Precert Administrator, peps_ccis_precert@txdot.gov.'),
      h('ol', { class: 'steps' }, M.CCIS_STEPS.map(function (s) { return h('li', { class: st.ccis[s.id] ? 'done' : '' }, h('label', { class: 'chk' }, h('input', { type: 'checkbox', 'data-step': s.id, checked: !!st.ccis[s.id], onchange: function (e) { if (e.target.checked) st.ccis[s.id] = true; else delete st.ccis[s.id]; save(); render(); } }), h('span', {}, h('b', {}, s.title), h('br'), s.text))); })))];
  }

  /* ---------- 6. export: copy / share / download / print (works on phones) ---------- */
  function printableHTML() {
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Precertification worksheet</title><style>body{font:14px/1.5 Arial,Helvetica,sans-serif;max-width:800px;margin:16px auto;padding:0 12px;color:#000}pre{white-space:pre-wrap;font:inherit}h1{font-size:18px}.n{font-size:12px;color:#444}</style></head><body><h1>TxDOT precertification worksheet</h1><p class="n">Personal helper output, not an official TxDOT form. Verify on txdot.gov. Use your browser\'s Share or Print menu to save as PDF.</p><pre>' + esc(M.summaryText(st, C)) + '</pre></body></html>';
  }
  function fillPrint() {
    var R = M.readiness(st, C), P = st.profile;
    $('#printOut').replaceChildren(M.isExampleState(st) ? h('p', { class: 'pwm' }, M.EXAMPLE_HEAD) : null, h('h1', {}, 'TxDOT precertification worksheet'), h('p', { class: 'pm' }, [P.first, P.middle, P.last].filter(Boolean).join(' ') + (P.firm ? ' · ' + P.firm : '') + ' · generated ' + M.today() + ' · personal helper, not an official TxDOT form'),
      R.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Category', 'Requirements', 'Projects', 'Status'].map(function (x) { return h('th', {}, x); }))), h('tbody', {}, R.map(function (r) { return h('tr', {}, h('td', {}, r.cat.code + ' ' + r.cat.name), h('td', {}, r.reqDone + ' / ' + r.reqTotal), h('td', {}, String(r.entries.length)), h('td', {}, r.ready ? 'Ready' : r.gaps.length + ' gap(s)')); }))) : null,
      h('pre', {}, M.summaryText(st, C)));
  }
  function renderExport() {
    var txt = M.summaryText(st, C);
    var file = h('input', { type: 'file', id: 'importFile', accept: 'application/json,.json', class: 'offscreen' });
    file.addEventListener('change', function () { var f = file.files[0]; if (!f) return; f.text().then(function (t) { var n; try { n = M.importJSON(t); } catch (e) { toast('Not a valid backup: ' + e.message); return; } if (!confirm('Replace the data on this device with this backup (' + n.projects.length + ' projects)?')) return; st = n; localStorage.setItem(M.KEY, JSON.stringify(st)); toast('Backup restored.'); render(); }); });
    var canShare = !!navigator.share;
    return [h('section', { class: 'card' }, h('h2', {}, 'Summary for CCIS'),
      h('div', { class: 'btns' },
        h('button', { type: 'button', class: 'btn', id: 'copyAll', onclick: function () { copy(txt, 'Summary'); } }, 'Copy all text'),
        canShare ? h('button', { type: 'button', class: 'btn', id: 'shareBtn', onclick: function () { navigator.share({ title: 'Precertification worksheet', text: txt }).catch(function () {}); } }, 'Share…') : null,
        h('button', { type: 'button', class: 'btn', id: 'dlTxt', onclick: function () { download('precert-worksheet-' + (M.isExampleState(st) ? 'EXAMPLE-' : '') + M.today() + '.txt', txt, 'text/plain'); toast('Text file downloaded.'); } }, 'Download .txt'),
        h('button', { type: 'button', class: 'btn', id: 'dlHtml', onclick: function () { download('precert-worksheet-' + M.today() + '.html', printableHTML(), 'text/html'); toast('Printable page downloaded — open it and use Share › Print / Save to PDF.'); } }, 'Download printable page'),
        h('button', { type: 'button', class: 'btn', id: 'printBtn', onclick: function () { fillPrint(); if (typeof window.print === 'function') { try { window.print(); } catch (e) { toast('Printing is not available here — use Download printable page.'); } } else toast('Printing is not available here — use Download printable page.'); } }, 'Print / Save PDF')),
      h('p', { class: 'muted' }, 'On a phone, if Print does nothing (for example in a home-screen app), use Share or Download printable page and print from there.'),
      h('pre', { class: 'preview', id: 'summaryPre' }, txt)),
      h('section', { class: 'card' }, h('h2', {}, 'Backup'), h('p', { class: 'muted' }, 'Your data lives only in this browser (' + M.KEY + '). Export a backup regularly.'),
        h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn', id: 'exportJson', onclick: function () { download('precert-backup-' + (M.isExampleState(st) ? 'EXAMPLE-' : '') + M.today() + '.json', M.exportJSON(st), 'application/json'); toast('Backup downloaded.'); } }, 'Export JSON backup'),
          h('button', { type: 'button', class: 'btn ghost', id: 'importBtn', onclick: function () { file.click(); } }, 'Import backup…'), file))];
  }

  /* ---------- 7. sources ---------- */
  function renderSources() {
    var S = [['TxDOT — Become precertified (eligibility, CCIS access, annual renewal Jan 1 – Mar 31)', 'https://www.txdot.gov/business/peps/become-precertified.html'],
      ['Precertification Work Categories (dated ' + C.docDate + '; source of the category list and requirements)', C.source],
      ['Precertification handout (process, 60-day review)', 'https://www.txdot.gov/content/dam/docs/division/ppd/precert/precert-handout.docx'],
      ['Precertification application form (fields mirrored here)', 'https://www.txdot.gov/content/dam/docs/division/ppd/precert/precertification-application-form.docx'],
      ['Personal certification type codes', 'https://www.txdot.gov/content/dam/docs/division/ppd/precert/precert-personal-certification-list.docx'],
      ['Training certificate submittal requirements (separate PDFs, file naming)', 'https://www.txdot.gov/content/dam/docs/division/ppd/precert/precert-training-cert-submittal.docx'],
      ['Training requirement FAQs for work categories 3.7.1 and 4.7.1', 'https://www.txdot.gov/content/dam/docs/division/ppd/precert/precert-training-requirement-faqs-work-categories.docx'],
      ['PEPS fireside chat, Feb 2, 2024 — new CCIS in Salesforce (steps, description-of-work tips)', 'https://www.txdot.gov/content/dam/docs/division/ppd/fireside-chats/2024/2024-02-02-presentation.pdf'],
      ['CCIS help guide (legacy CCIS, before the 2024 Salesforce system)', 'https://www.dot.state.tx.us/des/ccis/userguide.pdf'],
      ['43 TAC Chapter 9, Subchapter C, Rule 9.33 (precertification rule; text via Cornell LII)', 'https://www.law.cornell.edu/regulations/texas/43-Tex-Admin-Code-SS-9-33']];
    return h('section', { class: 'card' }, h('h2', {}, 'Sources'), h('p', {}, C.note), h('ul', { class: 'src' }, S.map(function (s) { return h('li', {}, h('a', { href: s[1], target: '_blank', rel: 'noopener noreferrer' }, s[0])); })),
      h('h2', {}, 'Disclaimer'), h('p', {}, 'This is an informational helper, not an official TxDOT system, and not affiliated with TxDOT. Requirements can change; verify everything against TxDOT\'s current pages before you submit in CCIS. The tool handles no sign-in or credentials. Your data stays in this browser\'s local storage; nothing is sent anywhere.'),
      h('p', { class: 'muted' }, 'If a requirement is unclear or missing here, confirm on TxDOT\'s page. Contact: peps_ccis_precert@txdot.gov · 512-960-5271.'));
  }

  /* ---------- shell ---------- */
  var R = { profile: renderProfile, projects: renderProjects, cats: renderCats, ready: renderReady, ccis: renderCCIS, export: renderExport, sources: renderSources };
  function render() {
    if (!R[ui.tab]) ui.tab = 'profile';
    document.querySelectorAll('.tabs [data-tab]').forEach(function (b) { var on = b.dataset.tab === ui.tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.classList.toggle('on', on); });
    var main = $('#main'), y = window.scrollY; main.replaceChildren.apply(main, [R[ui.tab]()].flat(4).filter(Boolean)); main.dataset.tab = ui.tab;
    window.scrollTo(0, y); fillPrint(); exampleChrome();
  }
  document.querySelectorAll('.tabs [data-tab]').forEach(function (b) { b.addEventListener('click', function () { ui.tab = b.dataset.tab; saveUI(); render(); window.scrollTo(0, 0); }); });
  $('#themeBtn').addEventListener('click', function () { ui.theme = ui.theme === 'dark' ? 'light' : 'dark'; saveUI(); applyTheme(); });
  window.addEventListener('beforeprint', fillPrint);
  $('#exBtn').addEventListener('click', function () { if (M.isExampleState(st)) clearEx(); else loadExample(); });
  $('#exClear').addEventListener('click', clearEx); $('#exRestore').addEventListener('click', restoreMine);
  applyTheme();
  fetch('categories.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { C = d; IX = M.catIndex(C); render(); }).catch(function (e) { $('#main').replaceChildren(h('p', { class: 'warn' }, 'Could not load the work categories (' + e.message + '). Reload the page.')); });
})();
