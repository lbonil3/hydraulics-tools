/* Project Tracker v2 (testing mode: plain JSON in localStorage, no login).
   Storage keys: pm.data.v2 (project JSON), pm.ui.v2 (view prefs). Old encrypted v1 vault (pm.vault.v1) is only read for one-time migration. */
(function () {
  'use strict';
  const C = window.PMCrypto, M = window.PMModel;
  const KEY = 'pm.data.v2', UIKEY = 'pm.ui.v2', OLDKEY = 'pm.vault.v1';
  const BACKUP_DAYS = 14;
  const $ = (s, r) => (r || document).querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';

  let st = null;
  const ui = Object.assign({ view: 'tree', timeline: true, theme: null, collapsed: {}, cols: null, sort: { key: 'sub', dir: 'asc' }, rail: true, links: true, linkSel: false, branch: 'both', group: '', vf: { sub: '', discipline: '', owner: '' } },
    safeJSON(localStorage.getItem(UIKEY)) || {});
  const filt = { status: '', owner: '', discipline: '', q: '', sub: '', milestone: '', kind: '', when: '', flag: '' };
  let sel = null; // { type, id }
  let view = { x: 40, y: 40, k: 1 };
  let firstFit = true;
  let impactKey = null; // node key whose impact (upstream/downstream) is highlighted

  function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function saveUI() { localStorage.setItem(UIKEY, JSON.stringify({ view: ui.view, timeline: ui.timeline, theme: ui.theme, collapsed: ui.collapsed, cols: ui.cols, sort: ui.sort, links: ui.links, linkSel: ui.linkSel, branch: ui.branch, group: ui.group, lastRoad: ui.lastRoad, vf: ui.vf })); }

  /* ---------- DOM helpers (textContent only) ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === '_link') el._link = v;
      else if (k === 'class') el.className = v;
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  function s(tag, attrs) { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); return el; }
  function field(label, input, hint) {
    if (!input.id) input.id = 'f' + M.uid();
    return h('div', { class: 'f' }, h('label', { for: input.id }, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
  }
  function select(opts, value, attrs) {
    return h('select', attrs, opts.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value == null ? '' : value) }, t); }));
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), 3200); }
  function slug(x) { return String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function fmtFt(n) { return Math.round(n).toLocaleString() + ' ft'; }
  function initials(name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join(''); }
  function ring(pct, size) {
    size = size || 44;
    const r = size / 2 - 4, c = 2 * Math.PI * r;
    const svg = s('svg', { class: 'ring', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': Math.round(pct) + '% complete' });
    svg.append(s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-bg' }));
    const fg = s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-fg', 'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - pct / 100), transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' });
    svg.append(fg);
    const tx = s('text', { x: '50%', y: '50%', 'dominant-baseline': 'central', 'text-anchor': 'middle', class: 'ring-tx' });
    tx.textContent = Math.round(pct) + '%';
    svg.append(tx);
    return svg;
  }
  function bar(pct, label) { return h('div', { class: 'bar' }, h('progress', { max: 100, value: pct, 'aria-label': label }), h('span', {}, Math.round(pct) + '%')); }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function scaleOpts(withInherit, inheritLabel) {
    const o = st.settings.scales.map((r) => [String(r.scale), r.scale + ' scale (1" = ' + r.scale + "') · " + r.ft.toLocaleString() + ' ft/sheet']);
    return withInherit ? [['', inheritLabel]].concat(o) : o;
  }
  /* scale picker: preset select + custom number */
  function scalePicker(value, inheritLabel, onInput) {
    const known = st.settings.scales.some((r) => Number(r.scale) === Number(value));
    const opts = scaleOpts(inheritLabel != null, inheritLabel).concat([['custom', 'Custom scale…']]);
    const sel = select(opts, value == null || value === '' ? '' : known ? String(value) : 'custom', { 'aria-label': 'Plan scale' });
    const num = h('input', { type: 'number', min: 1, step: 'any', value: known || value == null ? '' : value, 'aria-label': 'Custom scale (feet per inch)', placeholder: 'e.g. 30', class: 'custom-scale' });
    num.hidden = sel.value !== 'custom';
    const get = () => (sel.value === 'custom' ? (Number(num.value) > 0 ? Number(num.value) : null) : sel.value === '' ? null : Number(sel.value));
    sel.addEventListener('change', () => { num.hidden = sel.value !== 'custom'; if (!num.hidden) num.focus(); onInput && onInput(get()); });
    num.addEventListener('input', () => onInput && onInput(get()));
    const wrap = h('div', { class: 'scalepick' }, sel, num);
    wrap.get = get;
    return wrap;
  }

  /* ---------- persistence ---------- */
  function load() {
    const raw = safeJSON(localStorage.getItem(KEY));
    if (raw) { try { return M.migrate(raw); } catch (e) { toast('Stored data could not be read: ' + e.message); } }
    return null;
  }
  let saveTm = null, dirty = false;
  function save() {
    dirty = true;
    clearTimeout(saveTm);
    saveTm = setTimeout(flush, 150);
    $('#saved').textContent = 'Saving…';
  }
  function flush() {
    clearTimeout(saveTm);
    if (!st) return;
    dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(st)); $('#saved').textContent = 'Saved on this device'; }
    catch (e) { $('#saved').textContent = 'Save failed'; toast('Save failed: ' + e.message); }
  }
  const flushIfDirty = () => { if (dirty) flush(); };
  window.addEventListener('beforeunload', flushIfDirty);
  window.addEventListener('pagehide', flushIfDirty);
  function commit(fn, opts) {
    let r;
    try { r = fn(); } catch (e) { toast(e.message); return undefined; }
    save();
    if (!opts || opts.render !== false) renderAll();
    return r;
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    const dark = ui.theme ? ui.theme === 'dark' : window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#themeBtn').setAttribute('aria-pressed', String(dark));
  }

  /* ---------- filters ---------- */
  function sheetMatches(r) { return M.filterRows([r], { status: filt.status, owner: filt.owner, discipline: filt.discipline, q: filt.q, flag: filt.flag, st }).length === 1; }
  function filtersActive() { return !!(filt.status || filt.owner || filt.discipline || filt.q || filt.flag); }
  function fillFilterSelects() {
    const owners = [...new Set(st.staff.map((x) => x.name).concat(M.allSheets(st).map((r) => r.sh.owner).filter(Boolean)))].sort();
    const set = (id, opts, v) => { const el = $(id); el.replaceChildren(...select(opts, v).children); el.value = v; };
    set('#fStatus', [['', 'All statuses']].concat(M.STATUSES), filt.status);
    set('#fOwner', [['', 'All owners'], ['(unassigned)', 'Unassigned']].concat(owners), filt.owner);
    set('#fDisc', [['', 'Drainage + SWP3'], 'Drainage', 'SWP3'], filt.discipline);
    set('#fFlag', [['', 'All sheets'], ['update', '⟳ Needs update'], ['blocked', '⛓ Blocked'], ['ready', '▶ Ready to start'], ['linked', '↔ Has connectors']], filt.flag);
  }

  /* ---------- render ---------- */
  function renderAll() {
    $('#appTitle').textContent = st.project.name || 'Project Tracker';
    fillFilterSelects();
    renderRail();
    $('#treeWrap').hidden = ui.view !== 'tree';
    $('#listWrap').hidden = ui.view !== 'list';
    for (const v of VIEWS) { const w = $('#' + v + 'Wrap'); if (w && v !== 'tree' && v !== 'list') w.hidden = ui.view !== v; $('#v' + v[0].toUpperCase() + v.slice(1)).setAttribute('aria-pressed', String(ui.view === v)); }
    $('#tlBtn').setAttribute('aria-pressed', String(ui.timeline));
    for (const [id, v] of [['#bBoth', 'both'], ['#bDr', 'Drainage'], ['#bSw', 'SWP3']]) $(id).setAttribute('aria-pressed', String((ui.branch || 'both') === v));
    $('#timeline').hidden = !ui.timeline;
    if (ui.view === 'tree') renderTree(); else if (ui.view === 'week') renderWeek(); else if (ui.view === 'board') renderBoard(); else renderList();
    if (ui.timeline) renderTimeline();
    renderDrawer();
  }

  /* ----- v2.7 'This week' + shared view filters (sub-project / discipline / owner) ----- */
  const VIEWS = ['tree', 'list', 'week', 'board'];
  function ownersList() { return [...new Set(st.staff.map((x) => x.name).concat(M.allSheets(st).map((r) => r.sh.owner).filter(Boolean)))].sort(); }
  function viewFilters(pfx) {
    const vf = ui.vf = Object.assign({ sub: '', discipline: '', owner: '' }, ui.vf);
    if (vf.sub && !st.subs.some((x) => x.id === vf.sub)) vf.sub = '';
    const mk = (k, label, opts) => { const el = select(opts, vf[k], { id: pfx + k[0].toUpperCase() + k.slice(1), 'aria-label': label }); el.addEventListener('change', () => { vf[k] = el.value; saveUI(); renderAll(); }); return el; };
    return h('div', { class: 'vfbar' },
      mk('sub', 'Sub-project', [['', 'All sub-projects']].concat(st.subs.map((x) => [x.id, x.code + ' · ' + x.name]))),
      mk('discipline', 'Discipline', [['', 'Drainage + SWP3'], 'Drainage', 'SWP3']),
      mk('owner', 'Owner', [['', 'All owners'], ['(unassigned)', 'Unassigned']].concat(ownersList())),
      vf.sub || vf.discipline || vf.owner ? h('button', { type: 'button', class: 'btn sec sm', onclick: () => { ui.vf = { sub: '', discipline: '', owner: '' }; saveUI(); renderAll(); } }, 'Clear') : null);
  }
  function sheetCard(r, extra, attrs) {
    const sh = r.sh, today = M.todayISO();
    return h('button', Object.assign({ type: 'button', class: 'scard st-' + slug(sh.status) + (sel && sel.type === 'sheet' && sel.id === sh.id ? ' sel' : ''), 'data-id': sh.id, onclick: () => select_('sheet', sh.id) }, attrs || {}),
      h('span', { class: 'sc-top' }, h('span', { class: 'code' }, r.sub.code), h('span', { class: 'chip ' + DINFO[sh.discipline].cls }, DINFO[sh.discipline].short), sh.number ? h('span', { class: 'muted' }, '#' + sh.number) : null),
      h('span', { class: 'sc-title' }, sh.title),
      h('span', { class: 'sc-meta muted' }, M.segLabel(r.seg)),
      h('span', { class: 'sc-meta' }, h('span', { class: 'dot st-' + slug(sh.status) }), sh.status,
        sh.due ? h('span', { class: M.isOverdue(sh, today) ? 'bad' : '' }, ' · due ' + sh.due) : null, ' · ', sh.owner || h('i', { class: 'muted' }, 'unassigned')),
      extra ? h('span', { class: 'sc-why' }, extra) : null);
  }
  function renderWeek() {
    const w = M.weekView(st, ui.vf), today = M.todayISO();
    const lbl = (refs) => refs.map((x) => M.refLabel(st, x)).join(', ');
    const B = [['overdue', 'Overdue', 'bad', 'Past due and not done', null],
      ['due7', 'Due in the next 7 days', 'warn', 'Through ' + M.addDays(today, 7), null],
      ['blocked', 'Blocked', 'bad', 'Waiting on unfinished prerequisites', (r) => '⛓ by ' + lbl(r.by)],
      ['update', 'Needs update', 'upd', 'A linked sheet was revised', (r) => '⟳ from ' + lbl(r.from)],
      ['ready', 'Ready to start', 'ok', 'Not started, nothing blocking, prerequisites done or due within 14 days', () => '▶ ready']];
    $('#weekWrap').replaceChildren(h('div', { class: 'vhead' }, h('h2', {}, 'This week'), h('span', { class: 'muted' }, 'Week of ' + today), viewFilters('wk')),
      h('div', { class: 'wkgrid' }, B.map(([k, t, cls, sub, why]) => h('section', { class: 'wkcol ' + cls, id: 'wk-' + k },
        h('h3', {}, t, h('span', { class: 'cnt' }, String(w[k].length))), h('p', { class: 'muted small' }, sub),
        w[k].length ? w[k].map((r) => sheetCard(r, why && why(r))) : h('p', { class: 'muted empty' }, 'Nothing here 🎉')))));
  }

  /* ----- v2.8 status board (kanban) ----- */
  function moveStatus(id, status) {
    const hit = M.findSheet(st, id); if (!hit || hit.sh.status === status) return;
    commit(() => { M.updateSheet(st, id, { status }); M.log(st, hit.sh.title + ' → ' + status); });
    toast(hit.sh.title + ' → ' + status);
    setTimeout(() => { const c = document.querySelector('.bcard[data-id="' + id + '"] .scard'); if (c) c.focus(); }, 0);
  }
  function renderBoard() {
    const vf = ui.vf || {};
    const rows = M.filterRows(M.allSheets(st), { sub: vf.sub, discipline: vf.discipline, owner: vf.owner, q: filt.q });
    const card = (r) => {
      const i = M.STATUSES.indexOf(r.sh.status);
      return h('div', { class: 'bcard', 'data-id': r.sh.id },
        h('span', { class: 'grip', title: 'Drag to another column', 'aria-hidden': 'true' }, '⠿'),
        sheetCard(r, null, { 'aria-label': r.sh.title + ', ' + r.sh.status + '. Alt+Left/Right moves status.',
          onkeydown: (e) => { if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); const j = i + (e.key === 'ArrowLeft' ? -1 : 1); if (j >= 0 && j < 4) moveStatus(r.sh.id, M.STATUSES[j]); } } }),
        h('span', { class: 'bmove' },
          i > 0 ? h('button', { type: 'button', class: 'ibtn sm', 'aria-label': 'Move to ' + M.STATUSES[i - 1], title: '← ' + M.STATUSES[i - 1], onclick: () => moveStatus(r.sh.id, M.STATUSES[i - 1]) }, '‹') : null,
          i < 3 ? h('button', { type: 'button', class: 'ibtn sm', 'aria-label': 'Move to ' + M.STATUSES[i + 1], title: M.STATUSES[i + 1] + ' →', onclick: () => moveStatus(r.sh.id, M.STATUSES[i + 1]) }, '›') : null));
    };
    const wrap = $('#boardWrap');
    wrap.replaceChildren(h('div', { class: 'vhead' }, h('h2', {}, 'Status board'), h('span', { class: 'muted' }, plural(rows.length, 'sheet') + ' · drag a card to change its status'), viewFilters('bd')),
      h('div', { class: 'board' }, M.STATUSES.map((stt) => { const rs = rows.filter((r) => r.sh.status === stt);
        return h('section', { class: 'bcol st-' + slug(stt), 'data-status': stt, 'aria-label': stt },
          h('h3', {}, h('span', { class: 'dot' }), stt, h('span', { class: 'cnt' }, String(rs.length))),
          h('div', { class: 'bcards' }, rs.length ? rs.map(card) : h('p', { class: 'muted empty' }, 'No sheets'))); })));
  }
  /* pointer drag (mouse anywhere on a card; touch via the grip so the board still scrolls) */
  (function boardDrag() {
    let d = null;
    document.addEventListener('pointerdown', (e) => {
      const c = e.target.closest && e.target.closest('#boardWrap .bcard');
      if (!c || e.button > 0 || e.target.closest('.bmove')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
      d = { id: c.dataset.id, el: c, x: e.clientX, y: e.clientY, on: false };
      if (e.pointerType !== 'mouse') e.preventDefault();
    });
    document.addEventListener('pointermove', (e) => {
      if (!d) return;
      if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      if (!d.on) { d.on = true; const r = d.el.getBoundingClientRect(); d.g = d.el.cloneNode(true); d.g.classList.add('ghost'); d.g.style.width = r.width + 'px'; d.ox = d.x - r.left; d.oy = d.y - r.top; document.body.append(d.g); d.el.classList.add('dragging'); }
      d.g.style.left = (e.clientX - d.ox) + 'px'; d.g.style.top = (e.clientY - d.oy) + 'px';
      const col = colAt(e.clientX, e.clientY);
      document.querySelectorAll('.bcol.over').forEach((x) => { if (x !== col) x.classList.remove('over'); }); if (col) col.classList.add('over');
    });
    const colAt = (x, y) => { const t = document.elementFromPoint(x, y); return t && t.closest ? t.closest('.bcol') : null; };
    const end = (e) => {
      if (!d) return; const dd = d; d = null;
      if (!dd.on) return;
      dd.g.remove(); dd.el.classList.remove('dragging'); document.querySelectorAll('.bcol.over').forEach((x) => x.classList.remove('over'));
      const col = e.type === 'pointerup' ? colAt(e.clientX, e.clientY) : null;
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; window.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', stop, true), 50);
      if (col) moveStatus(dd.id, col.dataset.status);
    };
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  })();

  /* ----- overview rail ----- */
  function renderRail() {
    const S = M.summary(st);
    const PP = M.ppSummary(st);
    const F = M.flags(st);
    const o = S.overall;
    const days = st.lastBackup ? (Date.now() - Date.parse(st.lastBackup)) / 864e5 : Infinity;
    const kpi = (n, l, cls, on) => h('button', { type: 'button', class: 'kpi ' + (cls || ''), onclick: on }, h('b', {}, n), h('span', {}, l));
    const toList = (f) => () => { Object.assign(filt, { status: '', owner: '', discipline: '', q: '', sub: '', milestone: '', kind: '', when: '', flag: '' }, f); $('#q').value = filt.q; ui.view = 'list'; saveUI(); renderAll(); };
    $('#rail').replaceChildren(...[
      M.allNumberIssues(st).length ? h('div', { class: 'warnbox', id: 'numRail' }, '⚠ ' + plural(M.allNumberIssues(st).length, 'sheet') + ' with duplicate / out-of-range numbers. ', h('button', { type: 'button', class: 'link', onclick: () => openSettings('nums') }, 'Review')) : null,
      days > BACKUP_DAYS ? h('div', { class: 'warnbox' }, st.lastBackup ? 'Last backup ' + Math.floor(days) + ' days ago. ' : 'No backup yet. ', h('button', { type: 'button', class: 'link', onclick: openSettings }, 'Export backup')) : null,
      h('section', { class: 'panel hero' }, ring(o.pct, 84),
        h('div', {}, h('div', { class: 'big' }, o.pct + '%'), h('div', { class: 'muted' }, 'weighted progress'), h('div', { class: 'muted' }, o.done + ' of ' + o.total + ' sheets done'))),
      h('section', { class: 'kpis' },
        kpi(o.total, 'Sheets', '', toList({})),
        kpi(PP.total, 'PP sheets · DR ' + PP.byDisc.Drainage + ' / SW ' + PP.byDisc.SWP3, 'accent', openPP),
        kpi(S.overdue.length, 'Overdue', S.overdue.length ? 'bad' : '', toList({ when: 'overdue' })),
        kpi(S.upcoming.length, 'Due ≤ 14 days', S.upcoming.length ? 'warn' : '', toList({ when: 'upcoming' })),
        kpi(o.hoursActual + ' / ' + o.hoursBudget, 'Hours act / bud', o.hoursBudget && o.hoursActual > o.hoursBudget ? 'bad' : '', openStaff),
        kpi(fmtFt(PP.length), 'Total length', '', null)),
      h('section', { class: 'panel' }, h('h3', {}, 'Sub-projects'),
        S.subs.map((x) => {
          const pp = PP.bySub.find((b) => b.sub === x.sub);
          return h('div', { class: 'subblock' }, h('button', { type: 'button', class: 'subline', onclick: () => { select_('sub', x.sub.id); focusNode('sub:' + x.sub.id); } },
            h('span', { class: 'code' }, x.sub.code), h('span', { class: 'grow' }, h('span', { class: 'nm' }, x.sub.name), bar(x.pct, 'Progress ' + x.sub.name)),
            h('span', { class: 'pp', title: 'PP sheets' }, pp.total + ' PP')),
            DISCS.map((d) => { const b = M.branchStats(st, x.sub, d); return h('button', { type: 'button', class: 'discline ' + DINFO[d].cls, 'data-disc': d, onclick: () => { openBranch(x.sub.id, d); saveUI(); renderTree(); select_('disc', x.sub.id + ':' + d); focusNode('disc:' + x.sub.id + ':' + d); } },
              h('span', { class: 'chip ' + DINFO[d].cls }, DINFO[d].short), h('span', { class: 'grow' }, bar(b.pct, x.sub.code + ' ' + d + ' progress')), h('span', { class: 'muted' }, b.total + ' sh · ' + b.pp + ' PP')); }));
        })),
      h('section', { class: 'panel' }, h('h3', {}, 'Build order'),
        h('div', { class: 'chain', id: 'buildChain' }, M.orderedSubs(st).map((sub, i) => [i ? h('span', { class: 'arr', 'aria-hidden': 'true' }, '→') : null,
          h('button', { type: 'button', class: 'code', title: sub.name + ' (built #' + (i + 1) + ')', onclick: () => { select_('sub', sub.id); focusNode('sub:' + sub.id); } }, sub.code)]).flat().filter(Boolean)),
        h('button', { type: 'button', class: 'link', onclick: () => openSettings('order') }, 'Change build order')),
      refPanel('Needs update', F.update.map((x) => ({ ref: x.ref, why: 'from ' + x.from.map((r) => M.refLabel(st, r)).join(', ') })), 'upd', 'update'),
      refPanel('Blocked', F.blocked.map((x) => ({ ref: x.ref, why: 'by ' + x.by.map((r) => M.refLabel(st, r)).join(', ') })), 'bad', 'blocked'),
      refPanel('Ready to start', F.ready.map((x) => ({ ref: x.ref, why: 'prerequisites done' })), 'ok', 'ready'),
      listPanel('Overdue', S.overdue, 'bad'),
      listPanel('Upcoming (14 days)', S.upcoming, 'warn'),
      h('section', { class: 'panel' }, h('h3', {}, 'Milestones'),
        S.milestones.length ? S.milestones.map((m) => h('button', { type: 'button', class: 'msline', onclick: toList({ milestone: m.m.id }) },
          h('span', { class: 'grow' }, h('span', { class: 'nm' }, m.m.name + (m.m.date ? ' · ' + m.m.date : '')), bar(m.pct, m.m.name)), h('span', { class: 'muted' }, m.total + ' sh'))) : h('p', { class: 'muted' }, 'None'),
        h('button', { type: 'button', class: 'link', onclick: openMilestones }, 'Manage milestones')),
      h('section', { class: 'panel' }, h('h3', {}, 'Recent activity'),
        st.log.length ? h('ol', { class: 'log' }, st.log.slice(0, 8).map((l) => h('li', {}, h('time', { datetime: l.t }, new Date(l.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), ' ', l.msg))) : h('p', { class: 'muted' }, 'Nothing yet.'))].filter(Boolean));
  }
  function revealRef(ref) {
    const r = M.resolve(st, ref);
    if (!r) return;
    ui.collapsed['sub:' + r.sub.id] = false; if (r.t === 'sheet') { setSeg(r.seg.id, false); openBranch(r.sub.id, r.sh.discipline); } else DISCS.forEach((d) => openBranch(r.sub.id, d)); saveUI();
    if (ui.view !== 'tree') { ui.view = 'tree'; saveUI(); }
    renderAll(); select_(r.t, ref.id);
    setTimeout(() => focusNode(M.rk(ref)), 20);
  }
  function refPanel(title, items, cls, flag) {
    return h('section', { class: 'panel', 'data-panel': flag }, h('h3', {}, title + ' (' + items.length + ')'),
      items.length ? h('ul', { class: 'mini' }, items.slice(0, 6).map((x) => h('li', {}, h('button', { type: 'button', class: 'link ' + cls, onclick: () => revealRef(x.ref) }, M.refLabel(st, x.ref)),
        h('small', { class: 'muted' }, ' ' + x.why)))) : h('p', { class: 'muted' }, 'None'),
      items.length ? h('button', { type: 'button', class: 'link', onclick: () => { Object.assign(filt, { flag }); ui.view = 'list'; saveUI(); renderAll(); } }, 'Show in list') : null);
  }
  function listPanel(title, rows, cls) {
    return h('section', { class: 'panel' }, h('h3', {}, title + ' (' + rows.length + ')'),
      rows.length ? h('ul', { class: 'mini' }, rows.slice(0, 6).map((r) => h('li', {}, h('button', { type: 'button', class: 'link ' + cls, onclick: () => { select_('sheet', r.sh.id); revealSheet(r); } },
        r.sub.code + ' · ' + r.sh.title), h('small', { class: 'muted' }, ' ' + r.sh.due + (r.sh.owner ? ' · ' + r.sh.owner : ''))))) : h('p', { class: 'muted' }, 'None'));
  }

  /* ----- tree ----- */
  const COLX = [0, 290, 590, 900, 1250];
  const W = { root: 250, sub: 260, disc: 260, seg: 300, sheet: 320 };
  const H = { root: 112, sub: 108, disc: 96, seg: 118, sheet: 56 };
  const GAP = 10;
  function isCollapsed(key, def) { return key in ui.collapsed ? ui.collapsed[key] : def; }
  const DISCS = ['Drainage', 'SWP3'];
  const DINFO = { Drainage: { cls: 'dr', icon: '≋', short: 'DR', label: 'Drainage' }, SWP3: { cls: 'sw', icon: '❖', short: 'SW', label: 'SWP3' } };
  function shownDiscs() { return ui.branch === 'Drainage' || ui.branch === 'SWP3' ? [ui.branch] : DISCS; }
  /* a segment has one collapse state per branch ('seg:<id>@<disc>'); 'seg:<id>' sets both */
  function setSeg(id, v) { ui.collapsed['seg:' + id] = v; for (const d of DISCS) delete ui.collapsed['seg:' + id + '@' + d]; }
  function segCollapsed(id, d) { const k = 'seg:' + id + '@' + d; return k in ui.collapsed ? ui.collapsed[k] : isCollapsed('seg:' + id, true); }
  function openBranch(subId, d) { ui.collapsed['disc:' + subId + ':' + d] = false; if (!shownDiscs().includes(d)) ui.branch = 'both'; }
  function keyQuery(key) { return /^seg:[^@]+$/.test(key) ? '.node[data-key^="' + key + '@"]' : '.node[data-key="' + key + '"]'; }
  function buildTree() {
    const root = { key: 'root', type: 'root', depth: 0, kids: [] };
    for (const sub of st.subs) {
      const sn = { key: 'sub:' + sub.id, type: 'sub', sub, depth: 1, kids: [] };
      sn.collapsed = isCollapsed(sn.key, false);
      for (const d of shownDiscs()) {
        const dn = { key: 'disc:' + sub.id + ':' + d, type: 'disc', sub, disc: d, depth: 2, kids: [] };
        dn.collapsed = isCollapsed(dn.key, false);
        for (const seg of sub.segments) {
          const gn = { key: 'seg:' + seg.id + '@' + d, type: 'seg', sub, seg, disc: d, depth: 3, kids: [] };
          gn.collapsed = segCollapsed(seg.id, d);
          for (const sh of seg.sheets) if (sh.discipline === d) gn.kids.push({ key: 'sheet:' + sh.id, type: 'sheet', sub, seg, sh, disc: d, depth: 4, kids: [] });
          dn.kids.push(gn);
        }
        sn.kids.push(dn);
      }
      root.kids.push(sn);
    }
    let cursor = 0;
    const out = [];
    (function lay(n) {
      out.push(n);
      const kids = n.collapsed ? [] : n.kids;
      n.x = COLX[n.depth]; n.w = W[n.type]; n.h = H[n.type];
      if (!kids.length) { n.y = cursor; cursor += n.h + GAP; return; }
      kids.forEach(lay);
      const first = kids[0], last = kids[kids.length - 1];
      n.y = Math.max((first.y + first.h / 2 + last.y + last.h / 2) / 2 - n.h / 2, 0);
      n.vis = kids;
    })(root);
    return out;
  }
  function nodeMatch(n) {
    if (!filtersActive()) return { dim: false, hit: false };
    const sheets = n.type === 'sheet' ? [n] : n.type === 'seg' ? n.seg.sheets.filter((sh) => sh.discipline === n.disc).map((sh) => ({ sub: n.sub, seg: n.seg, sh })) :
      n.type === 'disc' ? n.sub.segments.flatMap((seg) => seg.sheets.filter((sh) => sh.discipline === n.disc).map((sh) => ({ sub: n.sub, seg, sh }))) :
      n.type === 'sub' ? n.sub.segments.flatMap((seg) => seg.sheets.map((sh) => ({ sub: n.sub, seg, sh }))) : M.allSheets(st);
    const rows = n.type === 'sheet' ? [{ sub: n.sub, seg: n.seg, sh: n.sh }] : sheets;
    const any = rows.some(sheetMatches);
    const q = filt.q.trim().toLowerCase();
    const selfHit = !!q && (n.type === 'disc' ? n.disc.toLowerCase().includes(q) : n.type === 'seg' ? (n.seg.name + ' ' + n.seg.road).toLowerCase().includes(q) : n.type === 'sub' ? (n.sub.code + ' ' + n.sub.name).toLowerCase().includes(q) : n.type === 'sheet' ? any : false);
    const onlyQ = !filt.status && !filt.owner && !filt.discipline && !filt.flag;
    return { dim: !(any || (selfHit && onlyQ)), hit: selfHit && (n.type !== 'sheet' || any) };
  }
  function renderTree() {
    const nodes = buildTree();
    const edges = $('#edges');
    const box = $('#nodes');
    edges.replaceChildren();
    let maxX = 0, maxY = 0;
    const els = [];
    for (const n of nodes) {
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
      for (const c of n.vis || []) {
        const x1 = n.x + n.w, y1 = n.y + n.h / 2, x2 = c.x, y2 = c.y + c.h / 2, mx = (x1 + x2) / 2;
        const m = nodeMatch(c);
        edges.append(s('path', { d: 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ',' + mx + ' ' + y2 + ',' + x2 + ' ' + y2, class: 'edge' + (m.dim ? ' dim' : '') + (c.type === 'sheet' ? ' st-' + slug(c.sh.status) : '') }));
      }
      els.push(nodeEl(n));
    }
    edges.setAttribute('width', maxX + 40); edges.setAttribute('height', maxY + 40);
    box.replaceChildren(...els);
    lastNodes = nodes;
    drawLinks(nodes, maxX, maxY);
    $('#stage').dataset.w = maxX; $('#stage').dataset.h = maxY; $('#stage').dataset.ry = nodes[0].y + nodes[0].h / 2;
    if (firstFit) { firstFit = false; requestAnimationFrame(() => fit(true)); } else applyView();
  }
  let lastNodes = [];
  /* endpoint: the node itself, or its nearest visible ancestor when collapsed */
  function nodeFor(map, ref) {
    const r = M.resolve(st, ref);
    if (!r) return null;
    if (r.t === 'sheet') { const d = r.sh.discipline; return map.get('sheet:' + r.sh.id) || map.get('seg:' + r.seg.id + '@' + d) || map.get('disc:' + r.sub.id + ':' + d) || map.get('sub:' + r.sub.id) || null; }
    /* a whole-segment connector attaches to its Drainage branch copy (or SWP3 when only that branch is shown) */
    for (const d of DISCS) { const n = map.get('seg:' + r.seg.id + '@' + d); if (n) return n; }
    for (const d of DISCS) { const n = map.get('disc:' + r.sub.id + ':' + d); if (n) return n; }
    return map.get('sub:' + r.sub.id) || null;
  }
  function selKey() { return sel ? (sel.type === 'root' ? 'root' : sel.type + ':' + sel.id) : null; }
  function drawLinks(nodes, maxX, maxY) {
    const svg = $('#links'), g = $('#linkG');
    g.replaceChildren();
    svg.setAttribute('width', maxX + 400); svg.setAttribute('height', maxY + 60);
    $('#lkBtn').setAttribute('aria-pressed', String(ui.links));
    $('#lkSelBtn').setAttribute('aria-pressed', String(ui.linkSel));
    svg.classList.toggle('off', !ui.links);
    const map = new Map(nodes.map((n) => [n.key, n]));
    const sk = selKey();
    const imp = impactKey ? M.impact(st, impactKey.split(':').length === 2 ? { t: impactKey.split(':')[0], id: impactKey.split(':')[1] } : null) : null;
    document.querySelectorAll('.node.imp-up, .node.imp-down, .node.imp-self').forEach((e) => e.classList.remove('imp-up', 'imp-down', 'imp-self'));
    if (imp) {
      const mark = (k, c) => { const n = nodeFor(map, { t: k.split(':')[0], id: k.split(':')[1] }); const el = n && document.querySelector('.node[data-key="' + n.key + '"]'); if (el) el.classList.add(c); };
      imp.up.forEach((k) => mark(k, 'imp-up')); imp.down.forEach((k) => mark(k, 'imp-down')); mark(impactKey, 'imp-self');
    }
    const fan = new Map();
    for (const l of st.links) {
      const a = nodeFor(map, l.src), b = nodeFor(map, l.dst);
      if (!a || !b || a === b) continue;
      const related = sk && (M.rk(l.src) === sk || M.rk(l.dst) === sk || a.key === sk || b.key === sk);
      const inImpact = imp && ([M.rk(l.src), M.rk(l.dst)].every((k) => k === impactKey || imp.up.has(k) || imp.down.has(k)));
      if (ui.linkSel && !related && !inImpact) continue;
      /* both ends leave from the right side, past the node buttons; arc bulges right by distance */
      const n = (fan.get(a.key) || 0) + 1; fan.set(a.key, n);
      const x1 = a.x + a.w + 16, y1 = a.y + a.h / 2 + Math.min(n, 4) * 3 - 6, x2 = b.x + b.w + 16, y2 = b.y + b.h / 2;
      const bulge = 50 + Math.min(260, Math.abs(y2 - y1) * 0.18) + Math.abs(x2 - x1) * 0.1;
      const cx = Math.max(x1, x2) + bulge;
      const cls = ['lnk', M.isCross(st, l) ? 'cross' : 'same', l.kind === 'update' ? 'upd' : 'dep'];
      if (M.wrongWay(st, l)) cls.push('wrong');
      if (M.revCount(st, l.src) > (l.ack || 0)) cls.push('stale');
      if (related || inImpact) cls.push('on');
      const path = s('path', { d: 'M' + x1 + ' ' + y1 + ' C' + cx + ' ' + y1 + ',' + cx + ' ' + y2 + ',' + x2 + ' ' + y2, class: cls.join(' '), 'marker-end': 'url(#arw)', 'data-a': a.key, 'data-b': b.key, 'data-id': l.id });
      const t = s('title'); t.textContent = M.refLabel(st, l.src) + (l.kind === 'dep' ? '  →  needed first by  →  ' : '  →  update  →  ') + M.refLabel(st, l.dst); path.append(t);
      g.append(path);
    }
  }
  function hoverLinks(key, on) {
    document.querySelectorAll('#linkG path').forEach((p) => { if (p.dataset.a === key || p.dataset.b === key) p.classList.toggle('hov', on); });
  }
  /* drag from a node's connector handle onto another node to link them (target depends on source) */
  function startLinkDrag(e, n, ref, handleEl) {
    e.preventDefault(); e.stopPropagation();
    const line = $('#dragLine');
    const stage = $('#stage');
    const toStage = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left) / view.k, y: (cy - r.top) / view.k }; };
    const x0 = n.x + n.w, y0 = n.y + n.h;
    const handle = handleEl || e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch (ex) { /* synthetic */ }
    document.body.classList.add('linking');
    let over = null;
    const move = (ev) => {
      const p = toStage(ev.clientX, ev.clientY);
      line.setAttribute('d', 'M' + x0 + ' ' + y0 + ' L' + p.x + ' ' + p.y);
      const t = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest && x.closest('.node')).find((x) => x && /^(sheet|seg):/.test(x.dataset.key) && x.dataset.key.split('@')[0] !== n.key.split('@')[0]);
      if (over && over !== t) over.classList.remove('droptarget');
      over = t || null; if (over) over.classList.add('droptarget');
    };
    const up = (ev) => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      if (ev.type !== 'pointercancel') move(ev);
      line.setAttribute('d', ''); document.body.classList.remove('linking');
      if (over) {
        over.classList.remove('droptarget');
        const [t, id] = over.dataset.key.split('@')[0].split(':');
        const r = commit(() => M.addLink(st, ref, { t, id }, 'dep'));
        if (r) toast('Connected: ' + M.refLabel(st, { t, id }) + ' depends on ' + M.refLabel(st, ref) + '.' + (r.warns.length ? ' ⚠ ' + r.warns.join(' ') : ' Change the kind in the drawer.'));
      }
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  }
  function toggleBtn(n) {
    if (!n.kids.length && n.type !== 'sub') return null;
    return h('button', { type: 'button', class: 'nbtn tog', 'aria-expanded': String(!n.collapsed), 'aria-label': (n.collapsed ? 'Expand ' : 'Collapse ') + nodeLabel(n),
      onclick: (e) => { e.stopPropagation(); ui.collapsed[n.key] = !n.collapsed; saveUI(); renderTree(); } }, (n.collapsed ? '▸ ' : '▾ ') + n.kids.length);
  }
  function addBtn(n, label, fn) { return h('button', { type: 'button', class: 'nbtn add', 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); fn(); } }, '+'); }
  function nodeLabel(n) { return n.type === 'root' ? st.project.name : n.type === 'sub' ? 'Sub-project ' + n.sub.code : n.type === 'disc' ? n.sub.code + ' ' + n.disc + ' branch' : n.type === 'seg' ? n.disc + ' segment ' + n.seg.name : 'sheet ' + n.sh.title; }
  function nodeEl(n) {
    const m = nodeMatch(n);
    const today = M.todayISO();
    let body;
    if (n.type === 'root') {
      const p = M.progress(M.allSheets(st).map((r) => r.sh));
      body = [ring(p.pct, 56), h('div', { class: 'nb' }, h('div', { class: 'nt' }, st.project.name), h('div', { class: 'ns' }, p.total + ' sheets · ' + M.ppSummary(st).total + ' PP'), h('div', { class: 'ns chainmini' }, 'Build: ' + M.orderedSubs(st).map((x) => x.code).join(' → ')))];
    } else if (n.type === 'sub') {
      const sheets = n.sub.segments.flatMap((g) => g.sheets);
      const p = M.progress(sheets);
      const pp = M.ppSummary(st).bySub.find((b) => b.sub === n.sub);
      const od = sheets.filter((x) => M.isOverdue(x, today)).length;
      body = [h('span', { class: 'code lg' }, n.sub.code, h('small', { class: 'ord', title: 'Build order' }, '#' + (M.orderedSubs(st).indexOf(n.sub) + 1))), h('div', { class: 'nb' }, h('div', { class: 'nt' }, n.sub.name),
        h('div', { class: 'ns' }, plural(n.sub.segments.length, 'segment') + ' · ' + fmtFt(pp.length)),
        h('div', { class: 'ns' }, pp.total + ' PP @ ' + n.sub.scale + ' scale'),
        h('div', { class: 'ns dmix' }, DISCS.map((d) => { const b = M.branchStats(st, n.sub, d); return h('span', { class: 'dm ' + DINFO[d].cls, title: d + ': ' + Math.round(b.pct) + '% · ' + b.total + ' sheets · ' + b.pp + ' PP' }, DINFO[d].short + ' ' + Math.round(b.pct) + '%'); }),
          od ? h('span', { class: 'flag' }, '⚑ ' + od) : null)), ring(p.pct, 46)];
    } else if (n.type === 'disc') {
      const b = M.branchStats(st, n.sub, n.disc, null, today);
      const I = DINFO[n.disc];
      body = [h('span', { class: 'dicon ' + I.cls, 'aria-hidden': 'true' }, I.icon), h('div', { class: 'nb' }, h('div', { class: 'nt' }, n.sub.code + ' · ' + I.label),
        h('div', { class: 'ns' }, plural(b.total, 'sheet') + ' · ', h('b', {}, b.pp + ' PP')),
        h('div', { class: 'nrow' }, b.overdue ? h('span', { class: 'flag', title: 'Overdue' }, '⚑ ' + b.overdue) : null,
          b.blocked ? h('span', { class: 'fl fl-blk', title: 'Blocked sheets' }, '⛓ ' + b.blocked) : null,
          b.update ? h('span', { class: 'fl fl-upd', title: 'Sheets needing update' }, '⟳ ' + b.update) : null,
          !b.overdue && !b.blocked && !b.update ? h('span', { class: 'ns' }, b.done + ' done') : null)), ring(b.pct, 44)];
    } else if (n.type === 'seg') {
      const dsheets = n.seg.sheets.filter((x) => x.discipline === n.disc);
      const p = M.progress(dsheets);
      const pp = M.segPP(st, n.sub, n.seg, { discipline: n.disc });
      const od = dsheets.filter((x) => M.isOverdue(x, today)).length;
      const owners = [...new Set(dsheets.map((x) => x.owner).filter(Boolean))];
      const gref = { t: 'seg', id: n.seg.id };
      const gb = M.isDone(st, gref) ? 0 : M.blockers(st, gref).length, gu = M.needsUpdate(st, gref).length;
      const inner = dsheets.map((x) => ({ t: 'sheet', id: x.id }));
      const ib = inner.filter((r) => M.resolve(st, r).sh.status !== 'Done' && M.blockers(st, r).length).length, iu = inner.filter((r) => M.needsUpdate(st, r).length).length;
      body = [h('div', { class: 'nb' }, h('div', { class: 'nt' }, n.seg.road),
        h('div', { class: 'ns mono' }, M.formatStation(n.seg.start) + ' → ' + M.formatStation(n.seg.end) + ' · ' + fmtFt(pp.length)),
        h('div', { class: 'ns' }, M.segScale(n.sub, n.seg) + ' scale · ', h('b', { title: pp.series.map((x) => x.series.name + ': ' + x.count).join(', ') || 'No enabled ' + n.disc + ' series' }, pp.total + ' ' + DINFO[n.disc].short + ' PP'), ' · ' + plural(dsheets.length, 'sheet')),
        h('div', { class: 'nrow' }, bar(p.pct, 'Progress ' + n.seg.name), od ? h('span', { class: 'flag' }, '⚑ ' + od) : null,
          gb || ib ? h('span', { class: 'fl fl-blk', title: 'Blocked items' }, '⛓' + (gb ? ' seg' : '') + (ib ? ' ' + ib : '')) : null,
          gu || iu ? h('span', { class: 'fl fl-upd', title: 'Items needing update' }, '⟳' + (gu ? ' seg' : '') + (iu ? ' ' + iu : '')) : null,
          h('span', { class: 'avs' }, owners.slice(0, 4).map((o) => h('span', { class: 'av', title: o }, initials(o))))))];
    } else {
      const sh = n.sh;
      const od = M.isOverdue(sh, today);
      const ref = { t: 'sheet', id: sh.id };
      const blocked = sh.status === 'Done' ? 0 : M.blockers(st, ref).length;
      const upd = M.needsUpdate(st, ref).length;
      const nl = M.linksOf(st, ref);
      body = [h('span', { class: 'chip ' + (sh.discipline === 'SWP3' ? 'sw' : 'dr'), title: sh.discipline }, sh.discipline === 'SWP3' ? 'SW' : 'DR'),
        h('div', { class: 'nb' }, h('div', { class: 'nt sm' }, sh.title),
          h('div', { class: 'ns' }, h('span', { class: 'dot' }), sh.status + (sh.pct && sh.status !== 'Done' ? ' · ' + sh.pct + '%' : '') + (sh.due ? ' · ' + sh.due : '') + (sh.gen ? ' · PP' : '')),
          blocked || upd ? h('div', { class: 'nflags' }, blocked ? h('span', { class: 'fl fl-blk', title: 'Blocked by ' + blocked + ' unfinished prerequisite(s)' }, '⛓ Blocked by ' + blocked) : null,
            upd ? h('span', { class: 'fl fl-upd', title: 'An upstream item changed' }, '⟳ Update needed') : null) : null),
        nl.in.length + nl.out.length ? h('span', { class: 'lkcount', title: nl.in.length + ' in, ' + nl.out.length + ' out' }, '↔' + (nl.in.length + nl.out.length)) : null,
        od ? h('span', { class: 'flag', title: 'Overdue' }, '⚑') : null,
        sh.owner ? h('span', { class: 'av', title: sh.owner }, initials(sh.owner)) : h('span', { class: 'av none', title: 'Unassigned' }, '–')];
    }
    const id = n.type === 'root' ? 'root' : n.type === 'sub' ? n.sub.id : n.type === 'disc' ? n.sub.id + ':' + n.disc : n.type === 'seg' ? n.seg.id : n.sh.id;
    const selected = sel && (sel.type === n.type && sel.id === id && (n.type !== 'seg' || !sel.disc || sel.disc === n.disc) || (n.type === 'root' && sel.type === 'root'));
    const el = h('div', { class: 'node n-' + n.type + (n.disc ? ' d-' + DINFO[n.disc].cls : '') + (n.type === 'sheet' ? ' st-' + slug(n.sh.status) : '') + (m.dim ? ' dim' : '') + (m.hit ? ' hit' : '') + (selected ? ' sel' : ''),
      tabindex: 0, role: 'button', 'data-key': n.key, 'aria-label': nodeLabel(n),
      onclick: () => select_(n.type, id, n.disc),
      onmouseenter: () => hoverLinks(n.key, true), onmouseleave: () => hoverLinks(n.key, false),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select_(n.type, id, n.disc); } } },
    body, h('div', { class: 'nacts' },
      n.type === 'sub' ? addBtn(n, 'Add segment to ' + n.sub.code, () => { select_('sub', n.sub.id); setTimeout(() => { const i = $('#addSegRoad'); if (i) i.focus(); }, 30); }) : null,
      n.type === 'disc' ? addBtn(n, 'Add segment to ' + n.sub.code + ' (shared by both branches)', () => { select_('sub', n.sub.id); setTimeout(() => { const i = $('#addSegRoad'); if (i) i.focus(); }, 30); }) : null,
      n.type === 'seg' ? addBtn(n, 'Add ' + n.disc + ' sheet to ' + n.seg.name, () => { ui.collapsed[n.key] = false; select_('seg', n.seg.id, n.disc); setTimeout(() => { const i = $('#addSheetTitle'); if (i) i.focus(); }, 30); }) : null,
      toggleBtn(n)),
    n.type === 'sheet' || n.type === 'seg' ? h('span', { class: 'handle', role: 'button', tabindex: -1, title: 'Drag onto another sheet or segment: it will depend on this one', 'aria-label': 'Connector handle for ' + nodeLabel(n),
      onpointerdown: (e) => startLinkDrag(e, n, { t: n.type, id }), _link: { n, ref: { t: n.type, id } }, onclick: (e) => { e.stopPropagation(); select_(n.type, id); setTimeout(() => { const i = $('#lkSearch'); if (i) i.focus(); }, 30); } }) : null);
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
    return el;
  }
  function applyView() { $('#stage').style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')'; }
  /* Fit: whole tree on screen. readable=true (first view): fit width only, never below 0.75 zoom, top aligned. */
  function fit(readable) {
    const vp = $('#viewport').getBoundingClientRect();
    const w = Number($('#stage').dataset.w) + 60, hh = Number($('#stage').dataset.h) + 40;
    if (!vp.width) return;
    const kw = (vp.width - 40) / w, kh = (vp.height - 90) / hh;
    view.k = readable === true ? Math.max(0.55, Math.min(1, kw, kh)) : Math.max(0.15, Math.min(1.1, kw, kh));
    view.x = Math.max(20, (vp.width - w * view.k) / 2);
    if (hh * view.k <= vp.height - 90) view.y = Math.max(20, (vp.height - 70 - hh * view.k) / 2);
    else view.y = (vp.height - 70) / 2 - Number($('#stage').dataset.ry || 0) * view.k; /* centre on the project root */
    applyView();
  }
  function zoomAt(f, cx, cy) {
    const k = Math.max(0.15, Math.min(2.5, view.k * f));
    view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k;
    applyView();
  }
  function focusNode(key) {
    if (ui.view !== 'tree') return;
    const el = document.querySelector(keyQuery(key));
    if (!el) return;
    const vp = $('#viewport').getBoundingClientRect();
    const x = parseFloat(el.style.left) + parseFloat(el.style.width) / 2, y = parseFloat(el.style.top) + parseFloat(el.style.height) / 2;
    view.x = vp.width / 2 - x * view.k; view.y = vp.height / 2 - y * view.k;
    $('#stage').classList.add('anim'); applyView(); setTimeout(() => $('#stage').classList.remove('anim'), 350);
    el.focus({ preventScroll: true });
  }
  function revealSheet(r) {
    ui.collapsed['sub:' + r.sub.id] = false; setSeg(r.seg.id, false); openBranch(r.sub.id, r.sh.discipline); saveUI();
    renderAll();
    setTimeout(() => focusNode('sheet:' + r.sh.id), 20);
  }
  /* pan / zoom / pinch */
  (function panzoom() {
    const vp = $('#viewport');
    const pts = new Map();
    let last = null, pinch = null, moved = 0;
    /* touch screens retarget presses on small targets: a press within 20px of a connector handle starts a link drag */
    vp.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('.handle, button, input, select, textarea')) return;
      let best = null, bd = 21;
      for (const hd of vp.querySelectorAll('.handle')) {
        const r = hd.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (d < bd) { bd = d; best = hd; }
      }
      if (best && best._link) startLinkDrag(e, best._link.n, best._link.ref, best);
    }, true);
    vp.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input, select, textarea, .handle')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      vp.setPointerCapture(e.pointerId);
      moved = 0;
      if (pts.size === 1) last = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = vp.getBoundingClientRect();
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.d = d; moved += 10;
      } else if (last) {
        view.x += e.clientX - last.x; view.y += e.clientY - last.y; moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY }; applyView();
        if (moved > 4) vp.classList.add('grabbing');
      }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { last = null; vp.classList.remove('grabbing'); } };
    vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
    /* a drag should not count as a click on a node */
    vp.addEventListener('click', (e) => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
    vp.addEventListener('wheel', (e) => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    vp.addEventListener('keydown', (e) => {
      if (e.target !== vp) return;
      const step = 60;
      if (e.key === 'ArrowLeft') view.x += step; else if (e.key === 'ArrowRight') view.x -= step; else if (e.key === 'ArrowUp') view.y += step; else if (e.key === 'ArrowDown') view.y -= step;
      else if (e.key === '+' || e.key === '=') zoomAt(1.2, vp.clientWidth / 2, vp.clientHeight / 2); else if (e.key === '-') zoomAt(1 / 1.2, vp.clientWidth / 2, vp.clientHeight / 2); else return;
      e.preventDefault(); applyView();
    });
  })();

  /* ----- station timeline ----- */
  function renderTimeline() {
    const segs = st.subs.flatMap((sub) => sub.segments.map((seg) => ({ sub, seg })));
    const box = $('#timeline');
    if (!segs.length) { box.replaceChildren(h('div', { class: 'tl-empty muted' }, 'Station timeline — add segments to see them by station range.')); return; }
    const lo = Math.floor(Math.min(...segs.map((x) => x.seg.start)) / 500) * 500;
    const hi = Math.ceil(Math.max(...segs.map((x) => x.seg.end)) / 500) * 500 || lo + 500;
    const span = hi - lo || 1;
    const stepRaw = span / 8;
    const step = [100, 200, 500, 1000, 2000, 5000, 10000].find((v) => v >= stepRaw) || 20000;
    const axis = h('div', { class: 'tl-axis' });
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { const t = h('span', { class: 'tick' }, M.formatStation(v)); t.style.left = ((v - lo) / span * 100) + '%'; axis.append(t); }
    box.replaceChildren(...[h('div', { class: 'tl-head' }, h('b', {}, 'Station timeline'), h('span', { class: 'muted' }, ' colour = progress · click a segment')),
      h('div', { class: 'tl-row' }, h('span', { class: 'tl-lbl' }), axis),
      st.subs.flatMap((sub) => shownDiscs().map((d, di) => h('div', { class: 'tl-row lane ' + DINFO[d].cls + (di ? ' lane2' : '') }, h('span', { class: 'tl-lbl' }, di ? null : h('span', { class: 'code' }, sub.code), h('span', { class: 'chip ' + DINFO[d].cls, title: d }, DINFO[d].short)),
        h('div', { class: 'tl-track' }, sub.segments.map((seg) => {
          const g = M.branchStats(st, sub, d, seg);
          const p = g.pct;
          const pp = g.pp;
          const b = h('button', { type: 'button', class: 'tl-seg p' + Math.min(4, Math.floor(p / 25)) + (sel && sel.id === seg.id && (!sel.disc || sel.disc === d) ? ' sel' : ''),
            title: sub.code + ' · ' + d + ' · ' + seg.name + '\n' + M.formatStation(seg.start) + ' – ' + M.formatStation(seg.end) + ' · ' + fmtFt(seg.end - seg.start) + ' · ' + pp + ' ' + DINFO[d].short + ' PP · ' + g.total + ' sheets · ' + Math.round(p) + '%',
            'aria-label': d + ' segment ' + seg.name + ', ' + Math.round(p) + '% complete',
            onclick: () => { openBranch(sub.id, d); select_('seg', seg.id, d); renderTree(); focusNode('seg:' + seg.id + '@' + d); } }, h('span', {}, seg.name));
          b.style.left = ((seg.start - lo) / span * 100) + '%'; b.style.width = Math.max(0.6, (seg.end - seg.start) / span * 100) + '%';
          return b;
        })))))].flat());
  }

  /* ----- list (dense table) ----- */
  const COLS = [
    { k: 'sub', l: 'Sub', get: (r) => r.sub.code },
    { k: 'seg', l: 'Segment', get: (r) => r.seg.name },
    { k: 'number', l: 'No.', get: (r) => r.sh.number, edit: 'text' },
    { k: 'title', l: 'Sheet', get: (r) => r.sh.title, edit: 'text', wide: true },
    { k: 'series', l: 'Series', get: (r) => r.sh.series },
    { k: 'discipline', l: 'Disc.', get: (r) => r.sh.discipline, edit: 'disc' },
    { k: 'range', l: 'Sheet stations', get: (r) => (r.sh.gen ? r.sh.gen.start : r.seg.start), show: (r) => (r.sh.gen ? M.formatStation(r.sh.gen.start) + '–' + M.formatStation(r.sh.gen.end) : '') },
    { k: 'status', l: 'Status', get: (r) => M.STATUSES.indexOf(r.sh.status), edit: 'status' },
    { k: 'pct', l: '%', get: (r) => Number(r.sh.pct) || 0, edit: 'num' },
    { k: 'owner', l: 'Owner', get: (r) => r.sh.owner, edit: 'owner' },
    { k: 'due', l: 'Due', get: (r) => r.sh.due, edit: 'date' },
    { k: 'milestone', l: 'Milestone', get: (r) => { const m = st.milestones.find((x) => x.id === r.sh.milestone); return m ? m.name : ''; }, edit: 'ms' },
    { k: 'hoursBudget', l: 'Hrs bud', get: (r) => Number(r.sh.hoursBudget) || 0, edit: 'num' },
    { k: 'hoursActual', l: 'Hrs act', get: (r) => Number(r.sh.hoursActual) || 0, edit: 'num' },
    { k: 'qc', l: 'QC', get: (r) => st.settings.qcSteps.filter((q) => r.sh.qc && r.sh.qc[q]).length, show: (r) => st.settings.qcSteps.filter((q) => r.sh.qc && r.sh.qc[q]).length + '/' + st.settings.qcSteps.length },
    { k: 'deps', l: 'Links', get: (r) => M.blockedBy(st, r.sh).length * 100 + M.needsUpdate(st, { t: 'sheet', id: r.sh.id }).length, show: (r) => {
      const ref = { t: 'sheet', id: r.sh.id }, lo = M.linksOf(st, ref), b = r.sh.status === 'Done' ? 0 : M.blockers(st, ref).length, u = M.needsUpdate(st, ref).length;
      return [b ? '⛓ ' + b : '', u ? '⟳ update' : '', lo.in.length + lo.out.length && !b && !u ? '↔ ' + (lo.in.length + lo.out.length) : ''].filter(Boolean).join(' '); } },
    { k: 'notes', l: 'Notes', get: (r) => r.sh.notes, edit: 'text' },
  ];
  const DEFAULT_COLS = ['sub', 'seg', 'number', 'title', 'discipline', 'range', 'status', 'pct', 'owner', 'due', 'milestone', 'hoursBudget', 'hoursActual', 'qc', 'deps'];
  function ownerOpts(cur) {
    const o = [['', '—']].concat(st.staff.map((x) => [x.name, x.name]));
    if (cur && !st.staff.some((x) => x.name === cur)) o.push([cur, cur]);
    return o.concat([['__new', '+ New person…']]);
  }
  function onOwner(selEl, sh, after) {
    let v = selEl.value;
    if (v === '__new') { v = (prompt('New staff name') || '').trim(); if (!v) { selEl.value = sh.owner; return; } }
    commit(() => M.updateSheet(st, sh.id, { owner: v }), { render: false });
    after && after();
  }
  function cellEditor(c, r, refresh) {
    const sh = r.sh;
    const lab = c.l + ' for ' + sh.title;
    const upd = (f) => { commit(() => M.updateSheet(st, sh.id, f), { render: false }); refresh(); };
    if (c.edit === 'text') { const iss = c.k === 'number' ? M.numberIssues(st, sh) : []; const i = h('input', { value: sh[c.k] || '', 'aria-label': lab, class: 'c-' + c.k + (iss.length ? ' numbad' : ''), title: iss.join(' · ') || null, placeholder: c.k === 'number' ? M.suggestNumber(st, sh) || '' : null }); i.addEventListener('change', () => upd({ [c.k]: i.value })); return i; }
    if (c.edit === 'num') { const i = h('input', { type: 'number', min: 0, max: c.k === 'pct' ? 100 : null, step: c.k === 'pct' ? 5 : 0.5, value: sh[c.k] || 0, 'aria-label': lab, class: 'num' }); i.addEventListener('change', () => upd({ [c.k]: i.value || 0 })); return i; }
    if (c.edit === 'date') { const i = h('input', { type: 'date', value: sh.due, 'aria-label': lab }); i.addEventListener('change', () => upd({ due: i.value })); return i; }
    if (c.edit === 'status') { const i = select(M.STATUSES, sh.status, { 'aria-label': lab, class: 'stsel st-' + slug(sh.status) }); i.addEventListener('change', () => upd({ status: i.value })); return i; }
    if (c.edit === 'disc') { const i = select(M.DISCIPLINES, sh.discipline, { 'aria-label': lab }); i.addEventListener('change', () => upd({ discipline: i.value })); return i; }
    if (c.edit === 'ms') { const i = select([['', '—']].concat(st.milestones.map((m) => [m.id, m.name])), sh.milestone, { 'aria-label': lab }); i.addEventListener('change', () => upd({ milestone: i.value })); return i; }
    if (c.edit === 'owner') { const i = select(ownerOpts(sh.owner), sh.owner, { 'aria-label': lab }); i.addEventListener('change', () => { onOwner(i, sh); refresh(); }); return i; }
    return null;
  }
  function renderList() {
    const cols = COLS.filter((c) => (ui.cols || DEFAULT_COLS).includes(c.k));
    const all = M.allSheets(st);
    let rows = M.filterRows(all, Object.assign({}, filt, { st }));
    const sc = COLS.find((c) => c.k === ui.sort.key) || COLS[0];
    rows = M.sortRows(rows, sc.k, ui.sort.dir, (r) => sc.get(r));
    const wrap = $('#listWrap');
    const refresh = () => { renderRail(); if (ui.timeline) renderTimeline(); renderDrawer(); };
    const thead = h('thead', {}, h('tr', {}, cols.map((c) => {
      const on = ui.sort.key === c.k;
      return h('th', { scope: 'col', class: c.wide ? 'wide' : '', 'aria-sort': on ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', { type: 'button', class: 'sort', onclick: () => { ui.sort = { key: c.k, dir: on && ui.sort.dir === 'asc' ? 'desc' : 'asc' }; saveUI(); renderList(); } }, c.l, on ? (ui.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''));
    })));
    if (ui.group) rows = rows.map((r, i) => ({ r, i })).sort((a, b) => M.subOrder(st, a.r.sub) - M.subOrder(st, b.r.sub) || DISCS.indexOf(a.r.sh.discipline) - DISCS.indexOf(b.r.sh.discipline) || a.i - b.i).map((x) => x.r);
    const grpRow = (r) => { const g = rows.filter((x) => x.sub === r.sub && x.sh.discipline === r.sh.discipline); const p = M.progress(g.map((x) => x.sh));
      return h('tr', { class: 'grp ' + DINFO[r.sh.discipline].cls }, h('th', { colspan: cols.length, scope: 'rowgroup' }, h('span', { class: 'code' }, r.sub.code), ' ', h('span', { class: 'chip ' + DINFO[r.sh.discipline].cls }, DINFO[r.sh.discipline].short), ' ' + r.sub.name + ' · ' + r.sh.discipline + ' — ' + plural(g.length, 'sheet') + ' · ' + Math.round(p.pct) + '%')); };
    const tbody = h('tbody', {}, rows.map((r, i) => [ui.group && (!i || rows[i - 1].sub !== r.sub || rows[i - 1].sh.discipline !== r.sh.discipline) ? grpRow(r) : null, h('tr', { tabindex: 0, 'data-id': r.sh.id, class: (M.isOverdue(r.sh, M.todayISO()) ? 'od ' : '') + (sel && sel.id === r.sh.id ? 'sel' : ''),
      onkeydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'TR') { e.preventDefault(); select_('sheet', r.sh.id); } } },
    cols.map((c, ci) => h('td', { class: c.wide ? 'wide' : '' , 'data-col': ci }, c.edit ? cellEditor(c, r, refresh) : c.k === 'title' ? null : (c.show ? c.show(r) : c.get(r))) ),
    )]));
    tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr && tr.dataset.id && !e.target.closest('input,select,button')) select_('sheet', tr.dataset.id); });
    tbody.addEventListener('keydown', (e) => {
      if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const t = e.target;
      if (t.tagName === 'SELECT' && !e.altKey) return; /* native select keys; Alt+Arrow moves rows */
      const tr = t.closest('tr'); const td = t.closest('td');
      let next = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
      while (next && next.classList.contains('grp')) next = e.key === 'ArrowDown' ? next.nextElementSibling : next.previousElementSibling;
      if (!next) return;
      e.preventDefault();
      const target = td && t !== tr ? next.children[td.dataset.col].querySelector('input,select') : next;
      (target || next).focus();
    });
    const views = select([['', 'Saved views…']].concat(st.views.map((v) => [v.id, v.name])), '', { 'aria-label': 'Saved views' });
    views.addEventListener('change', () => { const v = st.views.find((x) => x.id === views.value); if (v) { Object.assign(filt, { status: '', owner: '', discipline: '', q: '', sub: '', milestone: '', kind: '', when: '' }, v.filt); if (v.sort) ui.sort = v.sort; $('#q').value = filt.q; renderAll(); } });
    const fsel = (k, opts, lab) => { const e = select(opts, filt[k], { 'aria-label': lab }); e.addEventListener('change', () => { filt[k] = e.value; if (k === 'discipline') renderAll(); else renderList(); }); return e; };
    wrap.replaceChildren(...[
      h('div', { class: 'listbar' },
        fsel('sub', [['', 'All sub-projects']].concat(st.subs.map((x) => [x.id, x.code + ' · ' + x.name])), 'Sub-project'),
        fsel('discipline', [['', 'Drainage + SWP3'], ['Drainage', 'Drainage only'], ['SWP3', 'SWP3 only']], 'Discipline'),
        (() => { const g = select([['', 'No grouping'], ['subdisc', 'Group: sub-project › discipline']], ui.group, { 'aria-label': 'Grouping', id: 'groupSel' }); g.addEventListener('change', () => { ui.group = g.value; saveUI(); renderList(); }); return g; })(),
        fsel('kind', [['', 'All sheets'], ['pp', 'PP (generated)'], ['other', 'Other sheets']], 'Sheet kind'),
        fsel('when', [['', 'Any date'], ['open', 'Open only'], ['overdue', 'Overdue'], ['upcoming', 'Due ≤ 14 days']], 'Due'),
        fsel('milestone', [['', 'All milestones'], ['(none)', 'No milestone']].concat(st.milestones.map((m) => [m.id, m.name])), 'Milestone'),
        views,
        h('button', { type: 'button', class: 'btn sec sm', onclick: () => { const n = prompt('Name this view'); if (n) commit(() => M.saveView(st, n, filt, { sort: ui.sort })); } }, 'Save view'),
        st.views.length ? h('button', { type: 'button', class: 'btn sec sm', onclick: () => { const v = st.views.find((x) => x.id === views.value); if (!v) return toast('Pick a saved view first.'); commit(() => { st.views = st.views.filter((x) => x !== v); }); } }, 'Delete view') : null,
        h('details', { class: 'colmenu' }, h('summary', { class: 'btn sec sm' }, 'Columns'),
          h('div', { class: 'colpop' }, COLS.map((c) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: (ui.cols || DEFAULT_COLS).includes(c.k),
            onchange: (e) => { const set = new Set(ui.cols || DEFAULT_COLS); if (e.target.checked) set.add(c.k); else set.delete(c.k); ui.cols = COLS.map((x) => x.k).filter((k) => set.has(k)); saveUI(); renderList(); } }), ' ' + c.l)))),
        h('span', { class: 'grow' }),
        h('span', { class: 'muted', 'aria-live': 'polite' }, rows.length + ' of ' + all.length + ' sheets'),
        h('button', { type: 'button', class: 'btn sec sm', onclick: () => download('pm-sheets-' + M.todayISO() + '.csv', '\ufeff' + M.toCSV(st, rows), 'text/csv') }, 'CSV (filtered)'),
        h('button', { type: 'button', class: 'btn sec sm', onclick: () => download('pm-dependencies-' + M.todayISO() + '.csv', '\ufeff' + M.depsCSV(st), 'text/csv') }, 'Dependencies CSV'),
        h('button', { type: 'button', class: 'btn sec sm', onclick: () => download('pm-pp-summary-' + M.todayISO() + '.csv', '\ufeff' + M.ppCSV(st), 'text/csv') }, 'PP summary CSV')),
      h('div', { class: 'tablebox' }, h('table', { class: 'grid' }, thead, tbody)),
      rows.length ? null : h('p', { class: 'muted pad' }, all.length ? 'No sheets match the filters.' : 'No sheets yet. Use the tree: + on a sub-project adds a segment, + on a segment adds sheets.')].filter(Boolean));
  }

  /* ----- drawer ----- */
  function select_(type, id, disc) {
    sel = { type, id, disc: disc || (type === 'disc' ? id.split(':')[1] : sel && sel.type === type && sel.id === id ? sel.disc : null) };
    if (type === 'sheet' && window.innerWidth < 900) { /* mobile: drawer as sheet */ }
    renderDrawer();
    document.querySelectorAll('.node.sel, .grid tr.sel, .tl-seg.sel').forEach((e) => e.classList.remove('sel'));
    const key = type === 'root' ? 'root' : type + ':' + id;
    document.querySelectorAll(type === 'seg' && sel.disc ? '.node[data-key="seg:' + id + '@' + sel.disc + '"]' : keyQuery(key)).forEach((n) => n.classList.add('sel'));
    if (impactKey && impactKey !== key) impactKey = null;
    if (ui.view === 'tree' && lastNodes.length) drawLinks(lastNodes, Number($('#stage').dataset.w), Number($('#stage').dataset.h));
    const tr = document.querySelector('.grid tr[data-id="' + id + '"]'); if (tr) tr.classList.add('sel');
  }
  function closeDrawer() { sel = null; impactKey = null; renderDrawer(); if (lastNodes.length && ui.view === 'tree') drawLinks(lastNodes, Number($('#stage').dataset.w), Number($('#stage').dataset.h)); document.querySelectorAll('.sel').forEach((e) => e.classList.remove('sel')); }
  function renderDrawer() {
    const d = $('#drawer');
    let content = null;
    if (sel) {
      if (sel.type === 'root') content = rootDrawer();
      else if (sel.type === 'sub') { const sub = M.findSub(st, sel.id); content = sub && subDrawer(sub); }
      else if (sel.type === 'seg') { const hit = M.findSeg(st, sel.id); content = hit && segDrawer(hit); }
      else if (sel.type === 'disc') { const [sid, d] = sel.id.split(':'); const sub = M.findSub(st, sid); content = sub && discDrawer(sub, d); }
      else if (sel.type === 'sheet') { const hit = M.findSheet(st, sel.id); content = hit && sheetDrawer(hit); }
    }
    if (!content) { sel = null; d.hidden = true; $('#layout').classList.remove('drawer-open'); d.replaceChildren(); return; }
    const scroll = d.scrollTop;
    const had = !d.hidden;
    d.hidden = false; $('#layout').classList.add('drawer-open');
    d.replaceChildren(h('div', { class: 'dhead' }, h('span', { class: 'dkind' }, ({ root: 'Project', sub: 'Sub-project', disc: 'Discipline branch', seg: 'Segment', sheet: 'Sheet' }[sel.type] + (sel.type === 'seg' && sel.disc ? ' · ' + sel.disc + ' branch' : ''))),
      h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Close details', onclick: closeDrawer }, '×')), content);
    if (had) d.scrollTop = scroll;
  }
  function rootDrawer() {
    const n = h('input', { value: st.project.name, 'aria-label': 'Project name' });
    n.addEventListener('change', () => commit(() => { st.project.name = n.value.trim() || st.project.name; }));
    const PP = M.ppSummary(st);
    return h('div', { class: 'dbody' }, h('h2', {}, st.project.name), field('Project name', n),
      h('p', { class: 'muted' }, M.allSheets(st).length + ' sheets · ' + PP.total + ' PP sheets calculated · ' + fmtFt(PP.length) + ' of segments'),
      h('button', { type: 'button', class: 'btn sec', onclick: openPP }, 'Open PP sheet calculator'));
  }
  function ppLine(sub, seg) {
    const p = M.segPP(st, sub, seg);
    return h('span', {}, fmtFt(p.length) + ' → ', p.series.map((x, i) => [i ? ' + ' : '', h('b', {}, x.count), ' ' + x.series.name + ' @' + x.scale + ' (' + x.ft + ' ft/sh)']), ' = ', h('b', {}, p.total + ' PP'));
  }
  function segFields(sub, seg, onSaved) {
    const ids = seg ? '' : 'addSeg';
    const road = h('input', { id: ids ? 'addSegRoad' : null, value: seg ? seg.road : (ui.lastRoad || ''), placeholder: 'e.g. FM 1960', list: 'roadList', autocomplete: 'off', required: true });
    const roadList = h('datalist', { id: 'roadList' }, M.roads(st).map((r) => h('option', { value: r })));
    const label = h('p', { class: 'muted seglabel' });
    const a = h('input', { value: seg ? M.formatStation(seg.start) : '', placeholder: '10+00', autocomplete: 'off', class: 'mono' });
    const b = h('input', { value: seg ? M.formatStation(seg.end) : '', placeholder: '25+50', autocomplete: 'off', class: 'mono' });
    const live = h('div', { class: 'live', 'aria-live': 'polite' });
    const msg = h('p', { class: 'err', role: 'alert' });
    const sp = scalePicker(seg ? seg.scale : null, 'Sub-project default (' + sub.scale + ' scale)', upd);
    function upd() {
      const s1 = M.parseStation(a.value), s2 = M.parseStation(b.value);
      label.textContent = 'Label: ' + (road.value.trim() || '<Road>') + ' Sta ' + (Number.isFinite(s1) ? M.formatStation(s1) : '…') + '–' + (Number.isFinite(s2) ? M.formatStation(s2) : '…');
      if (!Number.isFinite(s1) || !Number.isFinite(s2) || s2 <= s1) { live.textContent = 'Enter stations like 10+00 and 25+50 to see the PP sheet count.'; return; }
      const tmp = { id: seg ? seg.id : 'tmp', start: s1, end: s2, scale: sp.get() };
      live.replaceChildren(h('span', { class: 'muted' }, 'Live: '), ppLine(sub, tmp));
    }
    a.addEventListener('input', upd); b.addEventListener('input', upd); road.addEventListener('input', upd);
    upd();
    return h('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      const f = { road: road.value, start: a.value, end: b.value, scale: sp.get() };
      try {
        const r = seg ? M.updateSegment(st, seg.id, f) : M.addSegment(st, sub.id, f);
        ui.lastRoad = r.seg.road; saveUI();
        save();
        toast((seg ? 'Segment saved.' : 'Segment added.') + (r.warns.length ? ' Warning: ' + r.warns.join(' ') : ''));
        onSaved(r.seg);
      } catch (ex) { msg.textContent = ex.message; }
    } }, field('Road name', road), roadList, h('div', { class: 'g2' }, field('Start station', a), field('End station', b)), field('Plan scale', sp), label, live, msg,
    h('button', { class: 'btn', type: 'submit' }, seg ? 'Save segment' : 'Add segment'));
  }
  function subDrawer(sub) {
    const name = h('input', { value: sub.name, 'aria-label': 'Sub-project name' });
    name.addEventListener('change', () => commit(() => { sub.name = name.value.trim() || sub.name; }));
    const sp = scalePicker(sub.scale, null, (v) => { if (v) commit(() => { sub.scale = v; M.log(st, sub.code + ' default scale → ' + v); }); });
    const pp = M.ppSummary(st).bySub.find((b) => b.sub === sub);
    const p = M.progress(sub.segments.flatMap((g) => g.sheets));
    return h('div', { class: 'dbody' },
      h('h2', {}, h('span', { class: 'code' }, sub.code), ' ', sub.name),
      h('div', { class: 'statrow' }, ring(p.pct, 54), h('div', {}, h('div', {}, plural(sub.segments.length, 'segment') + ' · ' + fmtFt(pp.length)), h('div', {}, h('b', {}, pp.total + ' PP sheets'), ' at current scales'))),
      field('Name', name), field('Default plan scale for segments', sp, 'Segments inherit this unless they set their own scale.'),
      h('h3', {}, 'Segments'),
      sub.segments.length ? h('ul', { class: 'dlist' }, sub.segments.map((seg) => h('li', {}, h('button', { type: 'button', class: 'rowbtn', onclick: () => { select_('seg', seg.id); focusNode('seg:' + seg.id); } },
        h('span', { class: 'mono' }, M.formatStation(seg.start) + '–' + M.formatStation(seg.end)), h('span', { class: 'grow' }, ' ' + seg.name), h('b', {}, M.segPP(st, sub, seg).total + ' PP'))))) : h('p', { class: 'muted' }, 'No segments yet.'),
      h('h3', {}, 'Add segment'),
      segFields(sub, null, (seg) => { ui.collapsed['sub:' + sub.id] = false; renderAll(); select_('seg', seg.id); }),
      h('details', { class: 'tpls' }, h('summary', {}, 'Standard (non-PP) sheet set for ' + sub.code + ' (' + sub.templates.length + ')'),
        h('ul', { class: 'dlist' }, sub.templates.map((t) => {
          const ti = h('input', { value: t.title, 'aria-label': 'Template title' }); ti.addEventListener('change', () => commit(() => M.updateTemplate(st, sub.id, t.id, { title: ti.value })));
          const di = select(M.DISCIPLINES, t.discipline, { 'aria-label': 'Template discipline' }); di.addEventListener('change', () => commit(() => M.updateTemplate(st, sub.id, t.id, { discipline: di.value })));
          return h('li', { class: 'tplrow' }, ti, di,
            h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Duplicate template ' + t.title, onclick: () => commit(() => M.duplicateTemplate(st, sub.id, t.id)) }, '⧉'),
            h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Delete template ' + t.title, onclick: () => commit(() => M.deleteTemplate(st, sub.id, t.id)) }, '×'));
        })),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sec sm', onclick: () => commit(() => M.addTemplate(st, sub.id, { title: 'New sheet', discipline: 'Drainage' })) }, '+ Template'),
          h('button', { type: 'button', class: 'btn sec sm', onclick: () => { if (confirm('Reset ' + sub.code + ' templates to defaults?')) commit(() => M.resetTemplates(st, sub.id)); } }, 'Reset defaults'))));
  }
  /* generate PP sheets for one segment; disc = 'Drainage' | 'SWP3' | null (both) */
  function genPP(seg, disc) {
    const pl = M.planGenerate(st, seg.id, disc ? { discipline: disc } : undefined);
    let rm = false;
    if (pl.removeTouched.length) rm = confirm(pl.removeTouched.length + ' generated PP sheet(s) beyond the new count have your edits (status, owner, notes…):\n\n' + pl.removeTouched.map((x) => '• ' + x.title).join('\n') + '\n\nOK = delete them too. Cancel = keep them.');
    const r = commit(() => M.applyGenerate(st, seg.id, pl, { removeTouched: rm }));
    if (disc) ui.collapsed['seg:' + seg.id + '@' + disc] = false; else setSeg(seg.id, false);
    saveUI(); renderAll();
    if (r) toast((disc ? disc + ' ' : '') + 'PP sheets: ' + r.created + ' new, ' + r.updated + ' updated, ' + r.removed + ' removed' + (r.keptTouched ? ', ' + r.keptTouched + ' edited kept' : '') + '.');
    return r;
  }
  function discDrawer(sub, d) {
    const b = M.branchStats(st, sub, d);
    const I = DINFO[d];
    return h('div', { class: 'dbody' },
      h('p', { class: 'crumb' }, h('button', { type: 'button', class: 'link', onclick: () => select_('sub', sub.id) }, sub.code + ' · ' + sub.name)),
      h('h2', {}, h('span', { class: 'dicon ' + I.cls }, I.icon), ' ' + sub.code + ' · ' + d),
      h('div', { class: 'statrow' }, ring(b.pct, 54), h('div', {}, h('div', {}, plural(b.total, 'sheet') + ' · ' + b.done + ' done'), h('div', {}, h('b', {}, b.pp + ' ' + d + ' PP sheets'), ' (' + st.settings.series.filter((x) => x.enabled && x.discipline === d).map((x) => x.name).join(', ') + ')'),
        h('div', {}, [b.overdue ? '⚑ ' + b.overdue + ' overdue' : '', b.blocked ? '⛓ ' + b.blocked + ' blocked' : '', b.update ? '⟳ ' + b.update + ' need update' : ''].filter(Boolean).join(' · ')))),
      h('h3', {}, 'Segments (shared with the ' + (d === 'SWP3' ? 'Drainage' : 'SWP3') + ' branch)'),
      sub.segments.length ? h('ul', { class: 'dlist' }, sub.segments.map((seg) => { const g = M.branchStats(st, sub, d, seg); return h('li', {}, h('button', { type: 'button', class: 'rowbtn', onclick: () => { select_('seg', seg.id, d); focusNode('seg:' + seg.id + '@' + d); } },
        h('span', { class: 'mono' }, M.formatStation(seg.start) + '–' + M.formatStation(seg.end)), h('span', { class: 'grow' }, ' ' + seg.name + ' · ' + g.total + ' sh · ' + Math.round(g.pct) + '%'), h('b', {}, g.pp + ' PP'))); })) : h('p', { class: 'muted' }, 'No segments yet — add one on the sub-project; it appears in both branches.'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', id: 'genBranchBtn', disabled: !sub.segments.length, onclick: () => { let n = 0; for (const seg of sub.segments) { const pl = M.planGenerate(st, seg.id, { discipline: d }); if (pl.create.length + pl.update.length + pl.remove.length + pl.removeTouched.length) { genPP(seg, d); n++; } } if (!n) toast(d + ' PP sheets already up to date.'); } }, 'Generate ' + d + ' PP for all segments'),
        h('button', { type: 'button', class: 'btn sec', onclick: () => { select_('sub', sub.id); setTimeout(() => { const i = $('#addSegRoad'); if (i) i.focus(); }, 30); } }, '+ Segment')));
  }
  function segDrawer({ sub, seg }) {
    const p = M.progress(seg.sheets);
    const bd = select([['', 'All disciplines'], ['Drainage', 'Drainage only'], ['SWP3', 'SWP3 only']], (sel && sel.disc) || '', { 'aria-label': 'Which standard sheets' });
    const bo = select([['', 'Owner: none']].concat(st.staff.map((x) => x.name)), '', { 'aria-label': 'Owner for added sheets' });
    const bm = select([['', 'Milestone: none']].concat(st.milestones.map((m) => [m.id, m.name])), '', { 'aria-label': 'Milestone for added sheets' });
    const bdue = h('input', { type: 'date', 'aria-label': 'Due date for added sheets' });
    const nt = h('input', { id: 'addSheetTitle', placeholder: 'Sheet title', 'aria-label': 'New sheet title', list: 'tplList' });
    const nd = select(M.DISCIPLINES, (sel && sel.disc) || 'Drainage', { 'aria-label': 'New sheet discipline', id: 'addSheetDisc' });
    const plan = M.planGenerate(st, seg.id);
    const pending = plan.create.length + plan.update.length + plan.remove.length + plan.removeTouched.length;
    return h('div', { class: 'dbody' },
      h('h2', {}, seg.name), h('p', { class: 'mono muted' }, sub.code + ' · Sta ' + M.formatStation(seg.start) + ' to ' + M.formatStation(seg.end) + ''),
      h('div', { class: 'statrow' }, ring(p.pct, 54), h('div', {}, ppLine(sub, seg))),
      h('section', { class: 'box' }, h('h3', {}, 'PP sheets'),
        h('p', { class: 'muted' }, pending ? 'Generate creates ' + plan.create.length + ', updates ' + plan.update.length + ', removes ' + (plan.remove.length + plan.removeTouched.length) + ' generated sheet(s). Your other sheets are never touched.' : 'Generated PP sheets are up to date (' + plan.unchanged + ').'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', id: 'genBtn', disabled: !pending, onclick: () => genPP(seg, null) }, 'Generate PP sheets (both)'),
          DISCS.map((d) => { const pl = M.planGenerate(st, seg.id, { discipline: d }); const n = pl.create.length + pl.update.length + pl.remove.length + pl.removeTouched.length;
            return h('button', { type: 'button', class: 'btn sec ' + DINFO[d].cls, id: 'gen' + DINFO[d].short, disabled: !n, title: n ? n + ' change(s) for ' + d + ' series' : d + ' PP sheets up to date', onclick: () => genPP(seg, d) }, DINFO[d].short + ' only' + (n ? ' (' + n + ')' : ' ✓'));
          }))),
      h('details', {}, h('summary', {}, 'Edit segment (stations, scale)'), segFields(sub, seg, () => renderAll()),
        h('button', { type: 'button', class: 'btn danger sm', onclick: () => { if (confirm('Delete segment “' + seg.name + '” and its ' + seg.sheets.length + ' sheets?')) { commit(() => M.deleteSegment(st, seg.id)); closeDrawer(); } } }, 'Delete segment')),
      h('section', { class: 'box' }, h('h3', {}, 'Add sheets'),
        h('form', { class: 'g2', onsubmit: (e) => { e.preventDefault(); const a = commit(() => M.bulkAddTemplates(st, seg.id, { discipline: bd.value, owner: bo.value, due: bdue.value, milestone: bm.value })) || []; toast(a.length ? 'Added ' + a.length + ' standard sheets.' : 'Standard sheets already on this segment.'); } },
          bd, bo, bm, bdue, h('button', { class: 'btn sec', type: 'submit' }, 'Add standard set')),
        h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); if (!nt.value.trim()) return; const shx = commit(() => M.addSheet(st, seg.id, { title: nt.value, discipline: nd.value })); setSeg(seg.id, false); saveUI(); renderAll(); if (shx) { const i = $('#addSheetTitle'); if (i) i.focus(); } } },
          nt, nd, h('button', { class: 'btn', type: 'submit' }, 'Add')),
        h('datalist', { id: 'tplList' }, sub.templates.map((t) => h('option', { value: t.title })))),
      connectorsBox({ t: 'seg', id: seg.id }),
      h('h3', {}, 'Sheets (' + seg.sheets.length + ')'),
      h('ul', { class: 'dlist' }, seg.sheets.map((sh) => h('li', {}, h('button', { type: 'button', class: 'rowbtn st-' + slug(sh.status), onclick: () => select_('sheet', sh.id) },
        h('span', { class: 'chip ' + (sh.discipline === 'SWP3' ? 'sw' : 'dr') }, sh.discipline === 'SWP3' ? 'SW' : 'DR'), h('span', { class: 'grow' }, ' ' + sh.title), h('span', { class: 'stpill' }, sh.status))))));
  }
  let pickState = { key: null, q: '', open: false, kind: 'dep', dir: 'in' };
  function connectorsBox(ref) {
    const lo = M.linksOf(st, ref);
    const key = M.rk(ref);
    const row = (l, dir) => {
      const other = dir === 'in' ? l.src : l.dst;
      const stale = M.revCount(st, l.src) > (l.ack || 0);
      const verb = dir === 'in' ? (l.kind === 'dep' ? 'Depends on' : 'Update from') : (l.kind === 'dep' ? 'Needed first by' : 'Updates');
      return h('li', { class: 'lkrow ' + (M.isCross(st, l) ? 'cross' : 'same') },
        h('span', { class: 'lkverb' + (l.kind === 'update' ? ' upd' : '') }, verb),
        h('button', { type: 'button', class: 'link grow', onclick: () => revealRef(other) }, M.refLabel(st, other)),
        dir === 'in' && l.kind === 'dep' ? h('span', { class: M.isDone(st, l.src) ? 'ok' : 'bad' }, M.isDone(st, l.src) ? '✓ done' : '⛓ open') : null,
        stale && dir === 'in' ? h('span', { class: 'fl fl-upd' }, '⟳') : null,
        M.wrongWay(st, l) ? h('span', { class: 'fl fl-wrong', title: 'Points against the build order' }, '⚠ upstream') : null,
        h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove connector to ' + M.refLabel(st, other), onclick: () => commit(() => M.removeLink(st, l.id)) }, '×'));
    };
    const need = M.needsUpdate(st, ref);
    const I = M.impact(st, ref);
    if (pickState.key !== key) pickState = { key, q: '', open: false, kind: 'dep', dir: 'in' };
    const q = h('input', { value: pickState.q, id: 'lkSearch', type: 'search', placeholder: 'Search any sub-project, segment or sheet…', autocomplete: 'off', 'aria-label': 'Find item to connect' });
    const kind = select([['dep', 'Depends on (must be done first)'], ['update', 'Update needed when it changes']], pickState.kind, { id: 'lkKind', 'aria-label': 'Connector kind', onchange: (e) => { pickState.kind = e.target.value; } });
    const dir = select([['in', 'Picked item → this (this waits / updates)'], ['out', 'This → picked item (picked waits / updates)']], pickState.dir, { id: 'lkDir', 'aria-label': 'Direction', onchange: (e) => { pickState.dir = e.target.value; } });
    const res = h('ul', { class: 'lkres', id: 'lkRes', role: 'listbox', 'aria-label': 'Matching items' });
    const fill = () => {
      const t = q.value.trim().toLowerCase();
      const cand = M.allRefs(st).filter((r) => M.rk(r) !== key).map((r) => ({ r, x: M.resolve(st, r) }))
        .filter(({ x }) => !t || (x.sub.code + ' ' + x.sub.name + ' ' + x.seg.name + ' ' + (x.t === 'sheet' ? x.sh.title + ' ' + x.sh.number : 'segment')).toLowerCase().includes(t));
      res.replaceChildren(...cand.slice(0, 40).map(({ r, x }) => h('li', {}, h('button', { type: 'button', class: 'rowbtn', role: 'option', onclick: () => {
        const [a, b] = dir.value === 'in' ? [r, ref] : [ref, r];
        const out = commit(() => M.addLink(st, a, b, kind.value));
        if (out) toast('Connector added.' + (out.warns.length ? ' ⚠ ' + out.warns.join(' ') : ''));
        setTimeout(() => { const i = $('#lkSearch'); if (i) i.focus(); }, 20);
      } }, h('span', { class: 'code' }, x.sub.code), h('span', { class: 'grow' }, ' ' + x.seg.name + (x.t === 'sheet' ? ' · ' + x.sh.title : ' (whole segment)')),
        x.t === 'sheet' ? h('span', { class: 'stpill' }, x.sh.status) : null))));
      if (cand.length > 40) res.append(h('li', { class: 'muted' }, (cand.length - 40) + ' more — keep typing'));
    };
    q.addEventListener('input', () => { pickState.q = q.value; fill(); });
    const pick = h('details', { class: 'lkadd', open: pickState.open }, h('summary', {}, '+ Add connector'), h('div', { class: 'stack' }, kind, dir, q, res));
    pick.addEventListener('toggle', () => { pickState.open = pick.open; if (pick.open) fill(); });
    if (pickState.open) fill();
    const rn = h('input', { id: 'revNote', placeholder: 'What changed? (optional)', 'aria-label': 'Revision note' });
    const rd = h('input', { type: 'date', value: M.todayISO(), 'aria-label': 'Revision date' });
    const obj = M.resolve(st, ref).obj;
    return h('section', { class: 'box conn', id: 'connBox' }, h('h3', {}, 'Connectors (' + (lo.in.length + lo.out.length) + ')'),
      need.length ? h('div', { class: 'updbox' }, h('b', {}, '⟳ Update needed'), ' — changed upstream: ' + need.map((l) => M.refLabel(st, l.src)).join(', ') + ' ',
        h('button', { type: 'button', class: 'btn sm', id: 'markUpdBtn', onclick: () => { const n = commit(() => M.markUpdated(st, ref)); if (n) toast('Marked updated.'); } }, 'Mark updated')) : null,
      lo.in.length + lo.out.length ? h('ul', { class: 'dlist lklist' }, lo.in.map((l) => row(l, 'in')).concat(lo.out.map((l) => row(l, 'out')))) : h('p', { class: 'muted' }, 'No connectors. Link this to items in any sub-project, or drag the ● handle on the tree.'),
      pick,
      h('div', { class: 'row revrow' }, rn, rd, h('button', { type: 'button', class: 'btn sec sm', id: 'markRevBtn', onclick: () => { commit(() => M.markRevised(st, ref, rn.value, rd.value ? rd.value + 'T12:00:00' : null)); toast(lo.out.length ? 'Revision recorded; ' + lo.out.length + ' linked item(s) flagged “Update needed”.' : 'Revision recorded.'); } }, 'Mark revised')),
      (obj.revs || []).length ? h('p', { class: 'muted' }, 'Revisions: ' + obj.revs.length + ' · last ' + obj.revs[obj.revs.length - 1].t.slice(0, 10) + (obj.revs[obj.revs.length - 1].note ? ' — ' + obj.revs[obj.revs.length - 1].note : '')) : null,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec sm', id: 'impactBtn', 'aria-pressed': String(impactKey === key), onclick: () => {
        impactKey = impactKey === key ? null : key;
        if (impactKey && !ui.links) ui.links = true;
        renderAll();
      } }, impactKey === key ? 'Hide impact' : 'Show impact'), h('span', { class: 'muted', id: 'impactCounts' }, I.up.size + ' upstream · ' + I.down.size + ' downstream')));
  }
  function numberField(sh, input) {
    const r = M.rangeFor(st, sh), sug = M.suggestNumber(st, sh), iss = M.numberIssues(st, sh);
    if (iss.length) input.classList.add('numbad');
    return h('div', { class: 'f' }, h('label', { for: input.id }, 'Sheet number'), input,
      h('small', { class: 'muted', id: 'numHint' }, r ? r.label + ': ' + r.from + '–' + r.to : 'No range set',
        sug && String(sh.number).trim() !== sug ? [' · next free ', h('b', {}, sug), ' ', h('button', { type: 'button', class: 'link', id: 'useNum', onclick: () => commit(() => M.updateSheet(st, sh.id, { number: sug })) }, 'Use')] : null),
      iss.length ? h('small', { class: 'err', id: 'numWarn', role: 'alert' }, '⚠ ' + iss.join(' · ')) : null);
  }
  function sheetDrawer({ sub, seg, sh }) {
    const up = (f) => commit(() => M.updateSheet(st, sh.id, f));
    const inp = (k, attrs) => { const i = h('input', Object.assign({ value: sh[k] == null ? '' : sh[k] }, attrs || {})); i.addEventListener('change', () => up({ [k]: i.type === 'number' ? Number(i.value) || 0 : i.value })); return i; };
    const status = select(M.STATUSES, sh.status, { class: 'stsel st-' + slug(sh.status) }); status.addEventListener('change', () => up({ status: status.value }));
    const disc = select(M.DISCIPLINES, sh.discipline); disc.addEventListener('change', () => up({ discipline: disc.value }));
    const owner = select(ownerOpts(sh.owner), sh.owner); owner.addEventListener('change', () => { onOwner(owner, sh); renderAll(); });
    const ms = select([['', '—']].concat(st.milestones.map((m) => [m.id, m.name + (m.date ? ' (' + m.date + ')' : '')])), sh.milestone); ms.addEventListener('change', () => up({ milestone: ms.value }));
    const pct = h('input', { type: 'range', min: 0, max: 100, step: 5, value: sh.pct || 0, 'aria-label': '% complete' });
    const pctOut = h('output', {}, (sh.pct || 0) + '%');
    pct.addEventListener('input', () => { pctOut.textContent = pct.value + '%'; });
    pct.addEventListener('change', () => up({ pct: Number(pct.value) }));
    const notes = h('textarea', { rows: 4 }); notes.value = sh.notes || ''; notes.addEventListener('change', () => up({ notes: notes.value }));
    const blocked = sh.status === 'Done' ? [] : M.blockers(st, { t: 'sheet', id: sh.id });
    return h('div', { class: 'dbody' },
      h('p', { class: 'crumb' }, h('button', { type: 'button', class: 'link', onclick: () => select_('sub', sub.id) }, sub.code), ' › ', h('button', { type: 'button', class: 'link', onclick: () => select_('seg', seg.id) }, seg.name)),
      field('Title', inp('title')),
      sh.gen ? h('p', { class: 'pill' }, 'Generated PP sheet ' + sh.gen.idx + ' of ' + sh.gen.of + ' · Sta ' + M.formatStation(sh.gen.start) + ' to ' + M.formatStation(sh.gen.end) + ' (' + fmtFt(sh.gen.end - sh.gen.start) + ')') : null,
      blocked.length ? h('p', { class: 'warnbox', id: 'blockedMsg' }, '⛓ Blocked by ' + blocked.length + ': ' + blocked.map((r) => M.refLabel(st, r)).join(', ')) : null,
      h('div', { class: 'g2' }, field('Status', status), field('Owner', owner), field('Due date', inp('due', { type: 'date' })), field('Milestone', ms),
        field('Discipline', disc), numberField(sh, inp('number', { placeholder: 'e.g. 12', id: 'shNum' })), field('Series', inp('series', { placeholder: 'e.g. Drainage Plan & Profile' })),
        h('div', { class: 'f' }, h('label', { for: pct.id = 'pct' + sh.id }, '% complete'), h('div', { class: 'rangebox' }, pct, pctOut)),
        field('Hours budget', inp('hoursBudget', { type: 'number', min: 0, step: 0.5 })), field('Hours actual', inp('hoursActual', { type: 'number', min: 0, step: 0.5 }))),
      h('fieldset', { class: 'qc' }, h('legend', {}, 'QC checklist'),
        st.settings.qcSteps.map((q) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!(sh.qc && sh.qc[q]), onchange: (e) => up({ qc: Object.assign({}, sh.qc, { [q]: e.target.checked }) }) }), ' ' + q))),
      connectorsBox({ t: 'sheet', id: sh.id }),
      field('Notes', notes),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sec', onclick: () => { const c = commit(() => M.duplicateSheet(st, sh.id)); if (c) select_('sheet', c.id); } }, 'Duplicate'),
        h('button', { type: 'button', class: 'btn danger', onclick: () => { if (confirm('Delete sheet “' + sh.title + '”?')) { commit(() => M.deleteSheet(st, sh.id)); select_('seg', seg.id); } } }, 'Delete')));
  }

  /* ---------- modals ---------- */
  let lastFocus = null;
  function openModal(title, body) {
    lastFocus = document.activeElement;
    $('#modalTitle').textContent = title;
    $('#modalBody').replaceChildren(body);
    $('#modal').hidden = false;
    setTimeout(() => { const f = $('#modalBody').querySelector('input,select,button,textarea'); (f || $('#modalClose')).focus(); }, 20);
  }
  function closeModal() { $('#modal').hidden = true; $('#modalBody').replaceChildren(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function openPP() {
    const what = {};
    const body = h('div', {});
    const draw = () => {
      const cur = M.ppSummary(st), W = M.ppSummary(st, { subScale: what });
      body.replaceChildren(
        h('p', { class: 'muted' }, 'PP sheets = ceil(segment length ÷ feet per sheet)' + (st.settings.overlapFt ? ' with ' + st.settings.overlapFt + ' ft overlap' : ', no overlap') + ', for each enabled series (' + st.settings.series.filter((x) => x.enabled).map((x) => x.name).join(', ') + '). What-if changes are not saved unless you apply them.'),
        h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ['Sub-project', 'Segments', 'Length', 'Default scale', 'What-if scale', 'DR PP', 'SW PP', 'PP now', 'PP what-if'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, st.subs.map((sub, i) => {
            const ws = select([['', 'same (' + sub.scale + ')']].concat(scaleOpts(false)), what[sub.id] || '', { 'aria-label': 'What-if scale for ' + sub.code });
            ws.addEventListener('change', () => { if (ws.value) what[sub.id] = Number(ws.value); else delete what[sub.id]; draw(); });
            const a = cur.bySub[i].total, b = W.bySub[i].total;
            return h('tr', {}, h('th', { scope: 'row' }, sub.code + ' · ' + sub.name), h('td', {}, sub.segments.length), h('td', {}, fmtFt(cur.bySub[i].length)), h('td', {}, sub.scale), h('td', {}, ws),
              h('td', { class: 'dr-c' }, cur.bySub[i].disc.Drainage), h('td', { class: 'sw-c' }, cur.bySub[i].disc.SWP3), h('td', {}, a), h('td', { class: b !== a ? 'chg' : '' }, b, b !== a ? ' (' + (b > a ? '+' : '') + (b - a) + ')' : ''));
          })),
          h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Project'), h('td', {}), h('td', {}, fmtFt(cur.length)), h('td', {}), h('td', {}), h('td', { id: 'ppDr' }, h('b', {}, cur.byDisc.Drainage)), h('td', { id: 'ppSw' }, h('b', {}, cur.byDisc.SWP3)), h('td', {}, h('b', {}, cur.total)), h('td', {}, h('b', { id: 'ppWhatIf' }, W.total))))),
        h('p', { class: 'muted' }, 'Segments with their own scale, and series with a fixed scale, are not changed by the what-if.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', disabled: !Object.keys(what).length, onclick: () => { commit(() => { for (const [id, v] of Object.entries(what)) { const sub = M.findSub(st, id); sub.scale = v; M.log(st, sub.code + ' default scale → ' + v + ' (from calculator)'); } }); toast('Default scales applied. Use “Generate PP sheets” on segments to update sheet entries.'); openPP(); } }, 'Apply what-if scales'),
          h('button', { type: 'button', class: 'btn sec', onclick: () => download('pm-pp-summary-' + M.todayISO() + '.csv', '\ufeff' + M.ppCSV(st, { subScale: what }), 'text/csv') }, 'Export PP summary CSV'),
          h('button', { type: 'button', class: 'btn sec', onclick: () => { closeModal(); openSettings(); } }, 'Edit scale table')));
    };
    draw();
    openModal('PP sheet calculator', body);
  }
  function openIndex() {
    const nt = h('input', { placeholder: 'Sheet title (e.g. Utility Conflict Sheet)', 'aria-label': 'New sheet index title', id: 'idxNew' });
    const nd = select([['', 'Discipline: auto']].concat(M.DISCIPLINES), '', { 'aria-label': 'New sheet index discipline' });
    const scope = select([['', 'Both disciplines'], ['Drainage', 'Drainage only'], ['SWP3', 'SWP3 only']], '', { 'aria-label': 'Apply which disciplines', id: 'idxScope' });
    const err = h('p', { class: 'err', role: 'alert' });
    const info = h('p', { class: 'muted', id: 'idxPlan' });
    const upd = () => { const P = M.planIndex(st, { discipline: scope.value || null }); info.textContent = P.count ? 'Apply adds ' + plural(P.count, 'sheet') + ' across ' + plural(P.segments, 'segment') + '. Sheets a segment already has (same title) are skipped.' : 'Every segment already has these sheets.'; };
    scope.addEventListener('change', upd);
    const segs = st.subs.reduce((a, x) => a + x.segments.length, 0);
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'One sheet list for the whole project. Apply it to every road segment in A–D at once; it never removes or duplicates sheets. PP sheets come from the length-based series (Generate PP).'),
      h('ol', { class: 'dlist idx' }, st.index.map((t, i) => {
        const ti = h('input', { value: t.title, 'aria-label': 'Index sheet title ' + (i + 1) }); ti.addEventListener('change', () => { try { M.updateIndexItem(st, t.id, { title: ti.value }); save(); } catch (e) { err.textContent = e.message; } });
        const di = select(M.DISCIPLINES, t.discipline, { 'aria-label': 'Index sheet discipline ' + (i + 1) }); di.addEventListener('change', () => { commit(() => M.updateIndexItem(st, t.id, { discipline: di.value }), { render: false }); openIndex(); });
        return h('li', { class: 'idxrow' }, h('span', { class: 'chip ' + (t.discipline === 'SWP3' ? 'sw' : 'dr') }, t.discipline === 'SWP3' ? 'SW' : 'DR'), ti, di,
          h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + t.title + ' up', disabled: !i, onclick: () => { commit(() => M.moveIndexItem(st, t.id, -1), { render: false }); openIndex(); } }, '↑'),
          h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove ' + t.title + ' from index', onclick: () => { commit(() => M.removeIndexItem(st, t.id), { render: false }); openIndex(); } }, '×'));
      })),
      h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); err.textContent = ''; try { M.addIndexItem(st, { title: nt.value, discipline: nd.value }); save(); openIndex(); setTimeout(() => $('#idxNew') && $('#idxNew').focus(), 30); } catch (ex) { err.textContent = ex.message; } } }, nt, nd, h('button', { class: 'btn sec', type: 'submit' }, 'Add')),
      err,
      h('div', { class: 'box' }, h('h3', {}, 'Apply to all roads / sub-projects'), h('div', { class: 'row' }, scope,
        h('button', { type: 'button', class: 'btn', id: 'applyIdxBtn', disabled: !segs, onclick: () => {
          const P = M.planIndex(st, { discipline: scope.value || null });
          if (!P.count) { toast('Nothing to add — every segment already has these sheets.'); return; }
          if (!confirm('Add ' + plural(P.count, 'sheet') + ' to ' + plural(P.segments, 'segment') + '? Existing sheets are skipped.')) return;
          const n = commit(() => M.applyIndex(st, { discipline: scope.value || null })); toast('Added ' + plural(n || 0, 'sheet') + ' from the sheet index.'); openIndex();
        } }, 'Apply to all segments')), info,
        h('button', { type: 'button', class: 'btn sec sm', id: 'idxTplBtn', onclick: () => { if (confirm('Replace every sub-project’s standard sheet set (used by “Add standard set”) with this index? Existing sheets are not touched.')) { commit(() => M.indexToTemplates(st)); toast('Index copied to all sub-projects.'); } } }, 'Use as every sub-project’s standard set')));
    upd();
    openModal('Project sheet index', body);
  }
  function openStaff() {
    const S = M.summary(st);
    const nn = h('input', { placeholder: 'Name', 'aria-label': 'New staff name' });
    const nr = h('input', { placeholder: 'Role (e.g. EIT, CADD, PE)', 'aria-label': 'New staff role' });
    const body = h('div', {},
      h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ['Name', 'Role', 'Open', 'Overdue', 'Done', 'Hours bud', 'Hours act', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, S.workload.map((w) => {
          const person = st.staff.find((x) => x.name === w.owner);
          const role = person ? h('input', { value: person.role || '', 'aria-label': 'Role of ' + w.owner, onchange: (e) => { commit(() => { person.role = e.target.value; }); } }) : h('span', { class: 'muted' }, '—');
          const max = Math.max(1, ...S.workload.map((x) => x.open));
          const b = h('span', { class: 'wbar' }); b.style.width = (w.open / max * 100) + '%';
          return h('tr', {}, h('th', { scope: 'row' }, w.owner), h('td', {}, role), h('td', {}, h('span', { class: 'wcell' }, b, h('span', {}, w.open))), h('td', { class: w.overdue ? 'bad' : '' }, w.overdue), h('td', {}, w.done),
            h('td', {}, w.hoursBudget), h('td', { class: w.hoursBudget && w.hoursActual > w.hoursBudget ? 'bad' : '' }, w.hoursActual),
            h('td', {}, person ? h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove ' + w.owner, onclick: () => { commit(() => M.removeStaff(st, w.owner)); openStaff(); } }, '×') : null));
        }))),
      h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); if (!nn.value.trim()) return; commit(() => M.addStaff(st, nn.value, nr.value)); openStaff(); } }, nn, nr, h('button', { class: 'btn', type: 'submit' }, 'Add person')));
    openModal('Staff & workload', body);
  }
  function openMilestones() {
    const S = M.summary(st);
    const nn = h('input', { placeholder: 'e.g. 30% submittal', 'aria-label': 'New milestone name' });
    const nd = h('input', { type: 'date', 'aria-label': 'New milestone date' });
    const body = h('div', {},
      h('ul', { class: 'dlist' }, S.milestones.map((m) => {
        const n = h('input', { value: m.m.name, 'aria-label': 'Milestone name', onchange: (e) => commit(() => { m.m.name = e.target.value.trim() || m.m.name; }) });
        const d = h('input', { type: 'date', value: m.m.date, 'aria-label': 'Milestone date', onchange: (e) => { commit(() => { m.m.date = e.target.value; M.sortMilestones(st); }); openMilestones(); } });
        const late = m.m.date && m.m.date < M.todayISO() && m.done < m.total;
        return h('li', { class: 'msrow' }, n, d, h('div', { class: 'grow' }, bar(m.pct, m.m.name), h('small', { class: late ? 'bad' : 'muted' }, m.total + ' sheets · ' + M.STATUSES.map((x) => m.counts[x] + ' ' + x.toLowerCase()).join(', ') + (late ? ' · date passed' : ''))),
          h('button', { type: 'button', class: 'btn sec sm', onclick: () => { closeModal(); Object.assign(filt, { milestone: m.m.id }); ui.view = 'list'; saveUI(); renderAll(); } }, 'Sheets'),
          h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Delete milestone ' + m.m.name, onclick: () => { if (confirm('Delete milestone ' + m.m.name + '? Sheets keep everything else.')) { commit(() => M.removeMilestone(st, m.m.id)); openMilestones(); } } }, '×'));
      })),
      h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); commit(() => M.addMilestone(st, nn.value, nd.value)); openMilestones(); } }, nn, nd, h('button', { class: 'btn', type: 'submit' }, 'Add milestone')));
    openModal('Milestones', body);
  }
  function numberingSection() {
    const ov = M.rangeOverlaps(st), iss = M.allNumberIssues(st);
    const nt = h('input', { placeholder: 'Sheet title (e.g. Culvert Layout)', 'aria-label': 'Sheet title for new range', list: 'tplList2' });
    const nf = h('input', { type: 'number', min: 0, placeholder: 'From', 'aria-label': 'Range from', class: 'num' });
    const nto = h('input', { type: 'number', min: 0, placeholder: 'To', 'aria-label': 'Range to', class: 'num' });
    const set = (r, k) => (e) => { try { M.setRange(st, r.key, { [k]: e.target.value }); save(); openSettings('nums'); } catch (ex) { toast(ex.message); e.target.value = r[k]; } };
    return h('section', { id: 'numSec' }, h('h3', {}, 'Sheet number ranges'),
      h('p', { class: 'muted' }, 'Per series or sheet type. The sheet drawer suggests the next free number; duplicates and numbers outside the range are flagged.'),
      h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ['Sheets', 'From', 'To', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, st.settings.numbering.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.label),
          h('td', {}, h('input', { type: 'number', min: 0, value: r.from, class: 'num', 'aria-label': r.label + ' from', onchange: set(r, 'from') })),
          h('td', {}, h('input', { type: 'number', min: 0, value: r.to, class: 'num', 'aria-label': r.label + ' to', onchange: set(r, 'to') })),
          h('td', {}, /^disc:/.test(r.key) ? null : h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove range ' + r.label, onclick: () => { commit(() => M.removeRange(st, r.key)); openSettings('nums'); } }, '×')))))),
      h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); try { M.addRange(st, nt.value, nf.value, nto.value); save(); openSettings('nums'); } catch (ex) { toast(ex.message); } } }, nt, nf, nto, h('button', { class: 'btn sec', type: 'submit' }, 'Add range')),
      h('datalist', { id: 'tplList2' }, (st.index || []).map((t) => h('option', { value: t.title }))),
      ov.length ? h('p', { class: 'warnbox' }, 'Overlapping ranges: ' + ov.join('; ')) : null,
      h('p', { class: iss.length ? 'err' : 'muted', id: 'numIssues' }, iss.length ? '⚠ ' + plural(iss.length, 'sheet') + ' with number issues: ' + iss.slice(0, 5).map((x) => x.r.sub.code + ' ' + x.r.sh.title + ' (' + x.r.sh.number + ')').join(', ') + (iss.length > 5 ? '…' : '') : 'No duplicate or out-of-range numbers.'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sec', id: 'fillNums', onclick: () => { const n = commit(() => M.autoNumber(st)); toast('Numbered ' + plural(n || 0, 'sheet') + '.'); openSettings('nums'); } }, 'Fill empty numbers'),
        h('button', { type: 'button', class: 'btn sec', id: 'renumAll', onclick: () => { if (confirm('Renumber ALL sheets from the ranges (in build order and station order)? This replaces existing sheet numbers.')) { const n = commit(() => M.autoNumber(st, { all: true })); toast('Renumbered ' + plural(n || 0, 'sheet') + '.'); openSettings('nums'); } } }, 'Renumber all')));
  }
  function openSettings(focus) {
    const sc = h('input', { type: 'number', min: 1, step: 'any', placeholder: 'Scale (e.g. 30)', 'aria-label': 'New scale' });
    const ft = h('input', { type: 'number', min: 1, step: 'any', placeholder: 'Feet per sheet', 'aria-label': 'Feet per sheet for new scale' });
    sc.addEventListener('input', () => { if (!ft.value && Number(sc.value) > 0) ft.placeholder = (Number(sc.value) * 12) + ' (12 in × scale)'; });
    const ov = h('input', { type: 'number', min: 0, step: 10, value: st.settings.overlapFt, 'aria-label': 'Overlap feet between consecutive PP sheets' });
    ov.addEventListener('change', () => commit(() => { const v = Math.max(0, Number(ov.value) || 0); st.settings.overlapFt = v; M.log(st, 'PP overlap → ' + v + ' ft'); }));
    const qc = h('textarea', { rows: 4, 'aria-label': 'QC steps, one per line' }); qc.value = st.settings.qcSteps.join('\n');
    qc.addEventListener('change', () => commit(() => { st.settings.qcSteps = qc.value.split('\n').map((x) => x.trim()).filter(Boolean); }));
    const impFile = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Backup file' });
    const impPass = h('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Passphrase (only for old encrypted backups)' });
    const impErr = h('p', { class: 'err', role: 'alert' });
    const hasOld = !!localStorage.getItem(OLDKEY);
    const body = h('div', { class: 'settings' },
      h('section', {}, h('h3', {}, 'Plan scale → feet per sheet'),
        h('p', { class: 'muted' }, '1 in = scale ft, and a sheet covers 12 in of length by default. Edit if your sheet layout differs.'),
        h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Scale'), h('th', { scope: 'col' }, 'Feet per sheet'), h('th', {}))),
          h('tbody', {}, st.settings.scales.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.scale + ' scale'),
            h('td', {}, h('input', { type: 'number', min: 1, step: 'any', value: r.ft, 'aria-label': 'Feet per sheet at ' + r.scale + ' scale', onchange: (e) => { commit(() => { M.setScale(st, r.scale, e.target.value); M.log(st, r.scale + ' scale → ' + e.target.value + ' ft/sheet'); }); } })),
            h('td', {}, h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove ' + r.scale + ' scale', onclick: () => { commit(() => M.removeScale(st, r.scale)); openSettings(); } }, '×')))))),
        h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); commit(() => M.setScale(st, sc.value, ft.value || Number(sc.value) * 12)); openSettings(); } }, sc, ft, h('button', { class: 'btn sec', type: 'submit' }, 'Add / update scale')),
        field('Overlap between consecutive PP sheets (ft)', ov, '0 = no match-line overlap (sheet count = ceil(length ÷ ft per sheet)).')),
      h('section', {}, h('h3', {}, 'PP sheet series'),
        h('p', { class: 'muted' }, 'Each enabled series is counted per segment by the same rule. Fixed scale overrides the segment scale for that series.'),
        h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ['On', 'Series name', 'Discipline', 'Scale'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, st.settings.series.map((se) => {
            const nm = h('input', { value: se.name, 'aria-label': 'Series name', onchange: (e) => commit(() => { se.name = e.target.value.trim() || se.name; }) });
            const di = select(M.DISCIPLINES, se.discipline, { 'aria-label': 'Series discipline', onchange: (e) => commit(() => { se.discipline = e.target.value; }) });
            const sp = select([['', 'Segment scale']].concat(scaleOpts(false)), se.scale == null ? '' : String(se.scale), { 'aria-label': 'Series scale', onchange: (e) => commit(() => { se.scale = e.target.value ? Number(e.target.value) : null; }) });
            return h('tr', {}, h('td', {}, h('input', { type: 'checkbox', checked: se.enabled, 'aria-label': 'Enable ' + se.name, onchange: (e) => commit(() => { se.enabled = e.target.checked; }) })), h('td', {}, nm), h('td', {}, di), h('td', {}, sp));
          })))),
      h('section', { id: 'orderSec' }, h('h3', {}, 'Build order'),
        h('p', { class: 'muted' }, 'Sub-projects are built in this order. A connector pointing from a later sub-project to an earlier one is flagged “upstream”.'),
        h('ol', { class: 'dlist order' }, M.orderedSubs(st).map((sub, i, arr) => {
          const ids = arr.map((x) => x.id);
          const move = (d) => { const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; commit(() => M.setOrder(st, ids)); openSettings('order'); };
          const num = h('input', { type: 'number', min: 1, max: arr.length, value: i + 1, class: 'num', 'aria-label': 'Build position of ' + sub.code, onchange: (e) => {
            const to = Math.max(1, Math.min(arr.length, Number(e.target.value) || i + 1)) - 1; ids.splice(i, 1); ids.splice(to, 0, sub.id); commit(() => M.setOrder(st, ids)); openSettings('order'); } });
          return h('li', { class: 'ordrow' }, num, h('span', { class: 'code' }, sub.code), h('span', { class: 'grow' }, ' ' + sub.name),
            h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + sub.code + ' earlier', disabled: i === 0, onclick: () => move(-1) }, '↑'),
            h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + sub.code + ' later', disabled: i === arr.length - 1, onclick: () => move(1) }, '↓'));
        }))),
      h('section', {}, h('h3', {}, 'Standard sheet templates'), h('p', { class: 'muted' }, 'Each sub-project has its own editable list (open a sub-project → “Standard (non-PP) sheet set”). Resetting changes the template lists only — sheets already on segments are not touched.'),
        h('button', { type: 'button', class: 'btn sec', id: 'resetAllTpl', onclick: () => { if (confirm('Reset the standard sheet templates of ALL sub-projects to the defaults?\n\nExisting sheets on segments are not changed.')) { commit(() => M.resetAllTemplates(st)); toast('Templates reset to defaults.'); } } }, 'Reset all templates to defaults')),
      numberingSection(),
      h('section', {}, h('h3', {}, 'QC checklist steps'), qc),
      h('section', {}, h('h3', {}, 'Backup & export'),
        h('p', {}, 'Last backup: ', h('b', { id: 'lastBackup' }, st.lastBackup ? new Date(st.lastBackup).toLocaleString() : 'never')),
        h('p', { class: 'warnbox' }, 'Testing mode: backups and data are plain JSON (not encrypted). Clearing browser data erases the project — keep backups.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', id: 'exportBtn', onclick: () => { st.lastBackup = new Date().toISOString(); download('pm-backup-' + M.todayISO() + '.json', JSON.stringify(M.backupFile(st), null, 1), 'application/json'); flush(); renderAll(); openSettings(); toast('Backup downloaded.'); } }, 'Export backup (JSON)'),
          h('button', { type: 'button', class: 'btn sec', onclick: () => download('pm-sheets-' + M.todayISO() + '.csv', '\ufeff' + M.toCSV(st, M.allSheets(st)), 'text/csv') }, 'All sheets CSV'),
          h('button', { type: 'button', class: 'btn sec', onclick: () => download('pm-pp-summary-' + M.todayISO() + '.csv', '\ufeff' + M.ppCSV(st), 'text/csv') }, 'PP summary CSV'),
          h('button', { type: 'button', class: 'btn sec', id: 'depsCsvBtn', onclick: () => download('pm-dependencies-' + M.todayISO() + '.csv', '\ufeff' + M.depsCSV(st), 'text/csv') }, 'Dependencies CSV')),
        h('form', { class: 'stack imp', onsubmit: async (e) => {
          e.preventDefault(); impErr.textContent = '';
          if (!impFile.files[0]) { impErr.textContent = 'Choose a backup file.'; return; }
          try {
            const obj = JSON.parse(await impFile.files[0].text());
            let data;
            if (obj.fmt === 'pm-backup') {
              if (!impPass.value) { impErr.textContent = 'This is an old encrypted backup — enter its passphrase.'; return; }
              data = M.migrate((await C.open(impPass.value, obj, 'backup')).data);
            } else data = M.readBackup(obj);
            impPass.value = '';
            if (!confirm('Replace ALL current data (' + M.allSheets(st).length + ' sheets) with this backup (' + M.allSheets(data).length + ' sheets, “' + data.project.name + '”)?')) return;
            st = data; M.log(st, 'Imported backup'); flush(); closeModal(); closeDrawer(); firstFit = true; renderAll(); toast('Backup imported.');
          } catch (ex) { impErr.textContent = ex.code === 'DECRYPT' ? 'Wrong passphrase for this backup (or the file was modified).' : 'Could not import: ' + ex.message; }
        } }, h('h3', {}, 'Import backup'), field('Backup file (v2 JSON, or old encrypted v1 backup)', impFile), field('Passphrase (old encrypted backups only)', impPass), impErr, h('button', { class: 'btn sec', type: 'submit' }, 'Import…'))),
      hasOld ? h('section', {}, h('h3', {}, 'Old encrypted v1 data'), h('p', { class: 'muted' }, 'An encrypted v1 vault is still stored in this browser.'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec', onclick: () => { closeModal(); migrationPanel(true); } }, 'Import it again…'),
          h('button', { type: 'button', class: 'btn danger', onclick: () => { if (confirm('Delete the old encrypted vault from this browser? Current data is not affected.')) { localStorage.removeItem(OLDKEY); openSettings(); } } }, 'Delete old vault'))) : null,
      h('section', {}, h('h3', {}, 'Keyboard'), h('ul', { class: 'keys' }, [['/', 'Search'], ['n', 'Add (segment / sheet in the open drawer)'], ['l', 'Toggle Tree / List'], ['t', 'Toggle timeline'], ['f', 'Fit tree to screen'], ['c', 'Show / hide connectors'], ['d', 'Light / dark'], ['Esc', 'Close drawer or dialog'], ['Enter', 'Open the focused node or row'], ['↑ ↓', 'Move between rows in the list (Alt+↑↓ in dropdowns)'], ['Arrows, + −', 'Pan / zoom when the tree has focus']].map(([k, v]) => h('li', {}, h('kbd', {}, k), ' ' + v)))),
      h('section', {}, h('h3', {}, 'Activity log'), h('ol', { class: 'log long' }, st.log.slice(0, 200).map((l) => h('li', {}, h('time', { datetime: l.t }, new Date(l.t).toLocaleString()), ' ', l.msg)))),
      h('section', {}, h('h3', {}, 'Danger zone'), h('button', { type: 'button', class: 'btn danger', onclick: () => { if (prompt('Type ERASE to delete all project data in this browser.') === 'ERASE') { localStorage.removeItem(KEY); st = M.newState(); flush(); closeModal(); closeDrawer(); renderAll(); } } }, 'Erase all data')));
    openModal('Settings, backup & export', body);
    if (focus === 'nums') setTimeout(() => { const o = $('#numSec'); if (o) o.scrollIntoView({ block: 'start' }); }, 40);
    if (focus === 'order') setTimeout(() => { const o = $('#orderSec'); if (o) { o.scrollIntoView({ block: 'start' }); const i = o.querySelector('input'); if (i) i.focus({ preventScroll: true }); } }, 40);
  }
  /* one-time import of the encrypted v1 vault */
  function migrationPanel(again) {
    const p = h('input', { type: 'password', autocomplete: 'current-password', id: 'migPass' });
    const err = h('p', { class: 'err', role: 'alert' });
    const btn = h('button', { class: 'btn', type: 'submit' }, 'Unlock & import');
    const body = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; btn.textContent = 'Decrypting…';
      try {
        const env = safeJSON(localStorage.getItem(OLDKEY));
        const data = M.migrate((await C.open(p.value, env, 'vault')).data);
        p.value = '';
        if (again && !confirm('Replace current data with the old vault contents?')) { btn.disabled = false; btn.textContent = 'Unlock & import'; return; }
        st = data; flush(); closeModal(); firstFit = true; renderAll(); toast('Imported ' + M.allSheets(st).length + ' sheets from the encrypted v1 data.');
      } catch (ex) { btn.disabled = false; btn.textContent = 'Unlock & import'; p.value = ''; p.focus(); err.textContent = ex.code === 'DECRYPT' ? 'Wrong passphrase. Try again.' : 'Could not import: ' + ex.message; }
    } },
    h('p', {}, 'This browser has project data from the earlier encrypted version. Enter its passphrase once to import it into the new (unencrypted, testing-mode) store. The passphrase is used only here and is not saved.'),
    field('v1 passphrase', p), err,
    h('div', { class: 'row' }, btn, again ? null : h('button', { type: 'button', class: 'btn sec', id: 'migSkip', onclick: () => { flush(); closeModal(); toast('Started an empty project. You can import the old data later in Settings.'); } }, 'Start empty instead')));
    openModal('Import your encrypted v1 data', body);
  }

  /* ---------- wiring ---------- */
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#vTree').addEventListener('click', () => { ui.view = 'tree'; saveUI(); renderAll(); });
  $('#vList').addEventListener('click', () => { ui.view = 'list'; saveUI(); renderAll(); });
  $('#vBoard').addEventListener('click', () => { ui.view = 'board'; saveUI(); renderAll(); });
  $('#vWeek').addEventListener('click', () => { ui.view = 'week'; saveUI(); renderAll(); });
  $('#tlBtn').addEventListener('click', () => { ui.timeline = !ui.timeline; saveUI(); renderAll(); });
  $('#ppBtn').addEventListener('click', openPP);
  $('#msBtn').addEventListener('click', openMilestones);
  $('#staffBtn').addEventListener('click', openStaff);
  $('#setBtn').addEventListener('click', openSettings);
  $('#themeBtn').addEventListener('click', () => { ui.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; saveUI(); applyTheme(); });
  $('#zIn').addEventListener('click', () => { const v = $('#viewport'); zoomAt(1.25, v.clientWidth / 2, v.clientHeight / 2); });
  $('#zOut').addEventListener('click', () => { const v = $('#viewport'); zoomAt(0.8, v.clientWidth / 2, v.clientHeight / 2); });
  $('#zFit').addEventListener('click', () => fit());
  $('#xAll').addEventListener('click', () => { for (const sub of st.subs) { ui.collapsed['sub:' + sub.id] = false; DISCS.forEach((d) => { ui.collapsed['disc:' + sub.id + ':' + d] = false; }); for (const g of sub.segments) setSeg(g.id, false); } saveUI(); renderTree(); fit(); });
  $('#cAll').addEventListener('click', () => { for (const sub of st.subs) { ui.collapsed['sub:' + sub.id] = false; DISCS.forEach((d) => { ui.collapsed['disc:' + sub.id + ':' + d] = false; }); for (const g of sub.segments) setSeg(g.id, true); } saveUI(); renderTree(); fit(); });
  $('#railBtn').addEventListener('click', () => { const open = !document.body.classList.contains('rail-open'); document.body.classList.toggle('rail-open', open); $('#railBtn').setAttribute('aria-expanded', String(open)); });
  let qTm;
  $('#q').addEventListener('input', () => {
    clearTimeout(qTm);
    qTm = setTimeout(() => {
      filt.q = $('#q').value;
      if (filt.q.trim()) for (const r of M.filterRows(M.allSheets(st), { q: filt.q })) { ui.collapsed['sub:' + r.sub.id] = false; ui.collapsed['disc:' + r.sub.id + ':' + r.sh.discipline] = false; setSeg(r.seg.id, false); }
      renderAll();
    }, 120);
  });
  for (const [id, v] of [['#bBoth', 'both'], ['#bDr', 'Drainage'], ['#bSw', 'SWP3']]) $(id).addEventListener('click', () => { ui.branch = v; saveUI(); renderAll(); });
  $('#idxBtn').addEventListener('click', openIndex);
  $('#lkBtn').addEventListener('click', () => { ui.links = !ui.links; saveUI(); renderTree(); });
  $('#lkSelBtn').addEventListener('click', () => { ui.linkSel = !ui.linkSel; if (ui.linkSel) ui.links = true; saveUI(); renderTree(); });
  for (const [id, k] of [['#fStatus', 'status'], ['#fOwner', 'owner'], ['#fDisc', 'discipline'], ['#fFlag', 'flag']]) $(id).addEventListener('change', (e) => { filt[k] = e.target.value; renderAll(); });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (sel) closeDrawer(); else if (typing) document.activeElement.blur(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !$('#modal').hidden) return;
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
    else if (e.key === 'l') { ui.view = ui.view === 'tree' ? 'list' : 'tree'; saveUI(); renderAll(); }
    else if (e.key === 't') { ui.timeline = !ui.timeline; saveUI(); renderAll(); }
    else if (e.key === 'f') fit();
    else if (e.key === 'c') $('#lkBtn').click();
    else if (e.key === 'd') $('#themeBtn').click();
    else if (e.key === '?') openSettings();
    else if (e.key === 'n') {
      e.preventDefault();
      if (sel && (sel.type === 'seg' || sel.type === 'sheet')) { const id = sel.type === 'seg' ? sel.id : M.findSheet(st, sel.id).seg.id; select_('seg', id); setTimeout(() => $('#addSheetTitle') && $('#addSheetTitle').focus(), 20); }
      else { select_('sub', sel && sel.type === 'sub' ? sel.id : st.subs[0].id); setTimeout(() => $('#addSegRoad') && $('#addSegRoad').focus(), 20); }
    }
  });
  window.addEventListener('resize', () => { if (ui.view === 'tree') applyView(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { st = M.migrate(JSON.parse(e.newValue)); renderAll(); } });

  /* ---------- start ---------- */
  applyTheme();
  st = load();
  const needMigration = !st && !!localStorage.getItem(OLDKEY);
  if (!st) st = M.newState();
  renderAll();
  if (needMigration) migrationPanel(false); else flush();
})();
