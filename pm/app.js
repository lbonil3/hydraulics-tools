/* Project Tracker v3 (testing mode: plain JSON in localStorage, no login).
   Storage keys: pm.data.v3 (project JSON), pm.ui.v3 (view prefs).
   v2 data (pm.data.v2) is never modified: on first v3 start it is copied to pm.data.v2.pre-v3-backup and migrated into pm.data.v3.
   Old encrypted v1 vault (pm.vault.v1) is only read for one-time migration. */
(function () {
  'use strict';
  const C = window.PMCrypto, M = window.PMModel;
  const KEY = 'pm.data.v3', UIKEY = 'pm.ui.v3', OLDKEY = 'pm.vault.v1', V2KEY = 'pm.data.v2', V2BAK = 'pm.data.v2.pre-v3-backup', V2UI = 'pm.ui.v2', V31BAK = 'pm.data.v3.pre-v3.2-backup';
  const BACKUP_DAYS = 14;
  const $ = (s, r) => (r || document).querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';

  let st = null;
  let pendingMig32 = null; /* { raw, info } while the v3.1 → v3.2 notice is open: nothing is written until Continue */
  let pendingMig = null; /* { raw, info } while the v2 → v3 migration notice is open: nothing is written until it is acknowledged */
  const ui = Object.assign({ view: 'tree', timeline: true, theme: null, collapsed: {}, cols: null, sort: { key: 'sub', dir: 'asc' }, rail: true, links: true, linkSel: false, branch: 'both', group: '', vf: { sub: '', discipline: '', owner: '' } },
    (() => { const u = safeJSON(localStorage.getItem(UIKEY)); if (u) return u; const o = safeJSON(localStorage.getItem(V2UI)); if (!o) return {}; delete o.collapsed; if (Array.isArray(o.cols)) o.cols = o.cols.flatMap((k) => (k === 'seg' ? ['section', 'road'] : [k])); if (o.sort && o.sort.key === 'seg') o.sort.key = 'section'; if (o.filt) o.filt.q = ''; return o; })());
  const filt = Object.assign({ status: '', owner: '', discipline: '', q: '', sub: '', milestone: '', kind: '', when: '', flag: '', section: '' }, ui.filt || {}); /* filters remembered */
  let sel = null; // { type, id }
  let view = { x: 40, y: 40, k: 1 };
  let firstFit = true;
  let impactKey = null; // node key whose impact (upstream/downstream) is highlighted

  function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function saveUI() { localStorage.setItem(UIKEY, JSON.stringify({ view: ui.view, timeline: ui.timeline, theme: ui.theme, collapsed: ui.collapsed, cols: ui.cols, sort: ui.sort, links: ui.links, linkSel: ui.linkSel, branch: ui.branch, group: ui.group, lastRoad: ui.lastRoad, lastScale: ui.lastScale, vf: ui.vf, rpt: ui.rpt, filt })); }

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
  function plural(n, w) { return n + ' ' + (n === 1 ? w : w.replace(/([^aeiou])y$/, '$1ie') + 's'); }
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
    if (raw) {
      try {
        const need32 = raw.schema === 3 && !raw.v32;
        const s3 = M.migrate(raw);
        if (need32) {
          const rawStr = localStorage.getItem(KEY);
          if (!localStorage.getItem(V31BAK)) localStorage.setItem(V31BAK, rawStr); /* untouched copy of the v3.1 data */
          const info = M.upgrade32(s3); if (info) pendingMig32 = { raw: rawStr, info };
        }
        return s3;
      } catch (e) { toast('Stored data could not be read: ' + e.message); }
    }
    const old = localStorage.getItem(V2KEY);
    if (old && safeJSON(old)) {
      try {
        if (!localStorage.getItem(V2BAK)) localStorage.setItem(V2BAK, old); /* untouched copy of the v2 data */
        const s3 = M.migrate(JSON.parse(old));
        pendingMig = { raw: old, info: s3.migration || null };
        return s3;
      } catch (e) { toast('Your v2 data could not be converted (' + e.message + '). It is left untouched.'); }
    }
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
    if (!st || pendingMig || pendingMig32) return;
    dirty = false;
    const json = JSON.stringify(st);
    track(json);
    try { localStorage.setItem(KEY, json); $('#saved').textContent = 'Saved on this device'; }
    catch (e) { $('#saved').textContent = 'Save failed'; toast('Save failed: ' + e.message); }
  }
  /* ---------- v2.9 undo / redo: whole-project snapshots taken at each save, quick bursts (typing) coalesced ---------- */
  const hist = M.history(50, 800);
  let hardEdit = false;
  function track(json) { if (hist.record(json, { hard: hardEdit })) histButtons(); hardEdit = false; }
  function histButtons() { const u = $('#undoBtn'), r = $('#redoBtn'); if (!u) return; u.disabled = !hist.undo.length; r.disabled = !hist.redo.length; u.title = 'Undo (Ctrl/Cmd+Z) · ' + hist.undo.length + ' step' + (hist.undo.length === 1 ? '' : 's'); r.title = 'Redo (Ctrl/Cmd+Shift+Z) · ' + hist.redo.length; }
  function lastMsg(json) { try { const l = JSON.parse(json).log; return l && l[0] ? l[0].msg + '\u0000' + l[0].t : ''; } catch (e) { return ''; } }
  function travel(dir) {
    if (dirty) flush();
    const from = dir < 0 ? hist.undo : hist.redo, to = dir < 0 ? hist.redo : hist.undo;
    if (!from.length) { toast(dir < 0 ? 'Nothing to undo.' : 'Nothing to redo.'); return; }
    const a = lastMsg(hist.cur), b = lastMsg(from[from.length - 1]); const what = a !== b ? (dir < 0 ? a : b) : '';
    hist.step(dir);
    st = M.migrate(JSON.parse(hist.cur));
    try { localStorage.setItem(KEY, hist.cur); $('#saved').textContent = 'Saved on this device'; } catch (e) { toast('Save failed: ' + e.message); }
    if (sel && !(sel.type === 'sheet' ? M.findSheet(st, sel.id) : sel.type === 'seg' ? M.findSeg(st, sel.id) : sel.type === 'road' ? M.findRoad(st, sel.id) : true)) sel = null;
    renderAll(); histButtons();
    toast((dir < 0 ? 'Undid' : 'Redid') + (what ? ': ' + what.split('\u0000')[0] : '') + ' · ' + hist.undo.length + ' more to undo');
  }
  const flushIfDirty = () => { if (dirty) flush(); };
  window.addEventListener('beforeunload', (e) => { flushIfDirty(); if (dirty || pendingImport) { e.preventDefault(); e.returnValue = ''; } });
  let pendingImport = false;
  window.addEventListener('pagehide', flushIfDirty);
  function commit(fn, opts) {
    let r;
    try { r = fn(); } catch (e) { toast(e.message); return undefined; }
    try { M.syncPP(st); } catch (e) { /* keep the edit even if a recount fails */ }
    hardEdit = true;
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
    if (!VIEWS.includes(ui.view)) ui.view = 'tree';
    saveUI();
    $('#appTitle').textContent = st.project.name || 'Project Tracker';
    fillFilterSelects();
    renderRail();
    $('#treeWrap').hidden = ui.view !== 'tree';
    $('#listWrap').hidden = ui.view !== 'list';
    for (const v of VIEWS) { const w = $('#' + v + 'Wrap'); if (w && v !== 'tree' && v !== 'list') w.hidden = ui.view !== v; $('#v' + v[0].toUpperCase() + v.slice(1)).setAttribute('aria-pressed', String(ui.view === v)); }
    for (const [id, v] of [['#bBoth', 'both'], ['#bDr', 'Drainage'], ['#bSw', 'SWP3']]) $(id).setAttribute('aria-pressed', String((ui.branch || 'both') === v));
    if (ui.view === 'tree') renderTree(); else if (ui.view === 'week') renderWeek(); else if (ui.view === 'board') renderBoard(); else if (ui.view === 'stations') renderStations(); else if (ui.view === 'report') renderReportView(); else renderList();
    renderDrawer();
    renderBulk();
  }

  /* ----- v2.7 'This week' + shared view filters (sub-project / discipline / owner) ----- */
  const VIEWS = ['tree', 'list', 'week', 'board', 'stations', 'report'];
  function ownersList() { return [...new Set(st.staff.map((x) => x.name).concat(M.allSheets(st).map((r) => r.sh.owner).filter(Boolean)))].sort(); }
  function viewFilters(pfx) {
    const vf = ui.vf = Object.assign({ sub: '', discipline: '', owner: '' }, ui.vf);
    if (vf.sub && !st.subs.some((x) => x.id === vf.sub)) vf.sub = '';
    const mk = (k, label, opts) => { const el = select(opts, vf[k], { id: pfx + k[0].toUpperCase() + k.slice(1), 'aria-label': label }); el.addEventListener('change', () => { vf[k] = el.value; saveUI(); renderAll(); }); return el; };
    return h('div', { class: 'vfbar' },
      mk('sub', 'Sub-project', [['', 'All sub-projects']].concat(st.subs.map((x) => [x.id, M.subLabel(x)]))),
      mk('discipline', 'Discipline', [['', 'Drainage + SWP3'], 'Drainage', 'SWP3']),
      mk('owner', 'Owner', [['', 'All owners'], ['(unassigned)', 'Unassigned']].concat(ownersList())),
      vf.sub || vf.discipline || vf.owner ? h('button', { type: 'button', class: 'btn sec sm', onclick: () => { ui.vf = { sub: '', discipline: '', owner: '' }; saveUI(); renderAll(); } }, 'Clear') : null);
  }
  function sheetCard(r, extra, attrs) {
    const sh = r.sh, today = M.todayISO();
    return h('button', Object.assign({ type: 'button', class: 'scard st-' + slug(sh.status) + (sel && sel.type === 'sheet' && sel.id === sh.id ? ' sel' : '') + (msel.has(sh.id) ? ' msel' : ''), 'data-id': sh.id, 'aria-pressed': msel.size ? String(msel.has(sh.id)) : null,
      onclick: (e) => { if (e.shiftKey || e.ctrlKey || e.metaKey || (msel.size && ui.view === 'board')) { pickSheet(sh.id, e.shiftKey ? 'range' : 'toggle', [...document.querySelectorAll('.scard[data-id]')].map((x) => x.dataset.id)); return; } select_('sheet', sh.id); } }, attrs || {}),
      h('span', { class: 'sc-top' }, h('span', { class: 'code', title: M.subName(r.sub) }, r.sub.code), h('span', { class: 'chip ' + DINFO[sh.discipline].cls }, DINFO[sh.discipline].short), sh.number ? h('span', { class: 'muted' }, '#' + sh.number) : null),
      h('span', { class: 'sc-title' }, sh.title),
      h('span', { class: 'sc-meta muted' }, r.seg.title + (rowRoad(r) ? ' · ' + rowRoad(r) : '') + (M.sheetRange(sh) ? ' · Sta ' + staTxt(M.sheetRange(sh)) : '')),
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

  /* ----- v3.3 printable status report (engineering deliverable layout) ----- */
  const RPT_DEF = { paper: 'letter', detail: true, deps: true, workload: true, recent: true, summary: true };
  function rptOpts() { ui.rpt = ui.rpt && typeof ui.rpt === 'object' ? ui.rpt : {}; for (const k in RPT_DEF) if (!(k in ui.rpt)) ui.rpt[k] = RPT_DEF[k]; return ui.rpt; }
  const ST_SYM = { 'Not started': '○', 'In progress': '◔', 'In review': '◑', Done: '●' };
  function rchip(s) { return h('span', { class: 'rchip s-' + String(s).toLowerCase().replace(/\s+/g, '-') }, (ST_SYM[s] || '') + ' ' + s); }
  function rbar(p) { return h('span', { class: 'rbar' }, h('i', { 'data-w': Math.round(p) })); }
  function renderReport() {
    const P = M.printReport(st), R = P.R, O = rptOpts(), MAX = 12;
    const pct = (x) => Math.round(x) + '%';
    const blank = (v, ph) => v ? h('span', {}, v) : h('span', { class: 'rblank' }, ph);
    const subsAll = M.orderedSubs(st);
    const scope = P.meta.scope || 'Drainage and SWP3 (stormwater pollution prevention) plan sheets for ' + subsAll.map((s) => M.subLabel(s)).join(', ') + '.';
    let secNo = 0; const toc = [];
    const H2 = (t, id) => { secNo++; toc.push([secNo, t, id]); return h('h2', { id: 'rp-' + id }, h('span', { class: 'rnum' }, secNo + '.'), ' ' + t); };
    const tbl = (cls, head, rows) => h('table', { class: 'rtab ' + (cls || '') }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows));
    const none = (t) => h('p', { class: 'rm' }, t || 'None.');
    const more = (n, cols) => n > MAX ? h('tr', { class: 'rmore' }, h('td', { colspan: cols }, '+ ' + (n - MAX) + ' more (see the app)')) : null;
    const nt = (t) => t ? h('p', { class: 'rnotep' }, h('b', {}, 'Notes: '), t) : null;
    const sheetLine = (x) => (x.sh.gen ? 'PP ' + x.sh.gen.idx + ' of ' + x.sh.gen.of : x.sh.title);
    const sheetRow = (x) => h('tr', {}, h('td', {}, sheetLine(x)), h('td', { class: 'rnumc' }, x.sh.number ? String(x.sh.number) : '—'),
      h('td', { class: 'rnw' }, x.range ? M.formatStation(x.range.start) + ' – ' + M.formatStation(x.range.end) + (x.sh.sta ? ' *' : '') : '—'),
      h('td', {}, rchip(x.sh.status)), h('td', {}, x.sh.owner || '—'), h('td', { class: 'rnw' }, x.sh.due || '—'));
    const SHEAD = ['Sheet', 'No.', 'Station range', 'Status', 'Owner', 'Due'];

    const body = [];
    /* cover / title block */
    body.push(h('div', { class: 'rcover' },
      h('div', { class: 'rband' }, h('span', {}, 'Drainage & SWP3 Design'), h('span', {}, 'Progress Status Report')),
      h('h1', {}, R.project.name || 'Project'),
      h('dl', { class: 'rmeta' },
        h('dt', {}, 'Report date'), h('dd', {}, R.today),
        h('dt', {}, 'Report no.'), h('dd', {}, blank(P.meta.reportNo, '—')),
        h('dt', {}, 'Prepared for'), h('dd', {}, blank(P.meta.preparedFor, '________________________')),
        h('dt', {}, 'Prepared by'), h('dd', {}, blank(P.meta.preparedBy, '________________________')),
        h('dt', { class: 'rwide' }, 'Scope'), h('dd', { class: 'rwide' }, scope))));
    const tocBox = h('nav', { class: 'rtoc' }); body.push(tocBox);

    /* 1 executive summary */
    const upd = P.deps.update.length;
    const kp = (v, l, bad) => h('div', { class: 'rk' + (bad ? ' rbad' : '') }, h('b', {}, String(v)), h('span', {}, l));
    body.push(h('section', { class: 'rsec' }, H2('Executive summary', 'exec'),
      h('div', { class: 'rkpis' },
        h('div', { class: 'rk rk-main' }, h('b', {}, pct(R.overall.pct)), h('span', {}, 'overall complete (weighted)'), rbar(R.overall.pct)),
        kp(R.overall.done + ' / ' + R.overall.total, 'sheets done'),
        kp(R.pp.total, 'PP sheets · DR ' + R.pp.byDisc.Drainage + ' / SW ' + R.pp.byDisc.SWP3),
        kp(R.overdue.length, 'overdue', R.overdue.length), kp(R.blocked.length, 'blocked', R.blocked.length), kp(upd, 'need update', upd), kp(R.due7.length, 'due in 7 days')),
      tbl('rstat', ['Status', 'Sheets', 'Share'], M.STATUSES.map((x) => h('tr', {}, h('td', {}, rchip(x)), h('td', { class: 'rnumc' }, String(R.counts[x])), h('td', {}, rbar(R.overall.total ? R.counts[x] / R.overall.total * 100 : 0), R.overall.total ? pct(R.counts[x] / R.overall.total * 100) : '—')))),
      h('p', { class: 'rlead' }, P.N.project), nt(P.N.note)));

    /* 2 progress by sub-project */
    body.push(h('section', { class: 'rsec' }, H2('Progress by sub-project', 'subs'),
      tbl('rprog', ['Sub-project', 'Overall', 'Drainage', '', 'SWP3', '', 'PP', 'Overdue', 'Blocked'], R.subs.map((x) => { const [d, w] = x.discs; return h('tr', {}, h('td', {}, h('b', {}, M.subLabel(x.sub))), h('td', { class: 'rnumc' }, pct(x.pct)),
        h('td', { class: 'rnw' }, d.done + ' / ' + d.total), h('td', { class: 'rnw' }, rbar(d.pct), pct(d.pct)), h('td', { class: 'rnw' }, w.done + ' / ' + w.total), h('td', { class: 'rnw' }, rbar(w.pct), pct(w.pct)),
        h('td', { class: 'rnumc' }, String(x.pp)), h('td', { class: 'rnumc' }, String(d.overdue + w.overdue)), h('td', { class: 'rnumc' }, String(d.blocked + w.blocked))); }))));

    /* 3–4 written summary per branch and sub-project */
    for (const D of P.N.discs) {
      const T = P.tree.find((t) => t.disc === D.disc);
      body.push(h('section', { class: 'rsec rnarr ' + DINFO[D.disc].cls }, H2(D.disc + ' summary', 'sum-' + DINFO[D.disc].cls),
        h('p', { class: 'rlead' }, D.text), nt(D.note),
        D.subs.map((x) => { const S = T.subs.find((y) => y.sub === x.sub).stats;
          return h('div', { class: 'rsub' }, h('h3', {}, h('span', { class: 'rcode' }, x.sub.code), ' ' + M.subName(x.sub), h('span', { class: 'rh3m' }, D.disc + ' · ' + pct(S.pct) + ' · ' + S.done + ' / ' + S.total + ' sheets' + (S.pp ? ' · ' + S.pp + ' PP' : ''))),
            h('p', {}, x.text.replace(/^[^—]*— \w+: /, '')), nt(x.note),
            x.secs.length ? h('ul', { class: 'rsecs' }, x.secs.map((y) => h('li', {}, y.text || y.sec.title, y.note ? h('span', { class: 'rnotep' }, ' Notes: ' + y.note) : null))) : null); })));
    }

    /* 5 sheet detail in v3 order: discipline → sub-project → section → road → sheets */
    if (O.detail) body.push(h('section', { class: 'rsec rdetail' }, H2('Sheet detail by section', 'detail'),
      h('p', { class: 'rm' }, 'Order: discipline › sub-project › section › road. Station ranges marked * were set by hand.'),
      P.tree.map((T) => h('div', { class: 'rdisc ' + DINFO[T.disc].cls }, h('h3', { class: 'rdh' }, T.disc),
        T.subs.map((S) => { const secs = S.secs.filter((x) => x.total || x.roads.length), empty = S.secs.filter((x) => !x.total && !x.roads.length);
          return h('div', { class: 'rdsub' }, h('h4', {}, M.subLabel(S.sub) + ' — ' + T.disc, h('span', { class: 'rh3m' }, pct(S.stats.pct) + ' · ' + S.stats.done + ' / ' + S.stats.total)),
            secs.length ? secs.map((x) => h('div', { class: 'rdsec' }, h('h5', {}, x.sec.title, h('span', { class: 'rh3m' }, x.done + ' / ' + x.total + ' done · ' + pct(x.pct) + (x.pp ? ' · ' + x.ppTotal + ' PP' : ''))),
              tbl('rsheets', SHEAD, [].concat(
                x.roads.flatMap((g) => [h('tr', { class: 'rroad' }, h('td', { colspan: 6 }, h('b', {}, g.name), ' · Sta ' + g.spans.join(', ') + ' · ' + g.pp + ' PP'))].concat(g.sheets.length ? g.sheets.map(sheetRow) : [h('tr', {}, h('td', { colspan: 6, class: 'rm' }, 'No sheets yet'))])),
                x.roads.length && x.other.length ? [h('tr', { class: 'rroad' }, h('td', { colspan: 6 }, h('b', {}, 'Other sheets')))] : [],
                x.other.map(sheetRow))))) : none('No sheets yet.'),
            empty.length ? h('p', { class: 'rm' }, 'Not started: ' + empty.map((x) => x.sec.title).join(', ') + '.') : null); })))));

    /* 6 schedule */
    const dueRow = (r) => h('tr', {}, h('td', {}, M.subTag(r.sub) + ' · ' + DINFO[r.sh.discipline].short), h('td', {}, (r.sh.number ? '#' + r.sh.number + ' ' : '') + r.sh.title), h('td', { class: 'rnw' }, r.sh.due), h('td', {}, r.sh.owner || '—'), h('td', {}, rchip(r.sh.status)));
    const DH = ['Part', 'Sheet', 'Due', 'Owner', 'Status'];
    body.push(h('section', { class: 'rsec' }, H2('Schedule', 'sched'),
      h('h3', {}, 'Milestones'), R.milestones.length ? tbl('', ['Milestone', 'Date', 'Sheets done', 'Progress'], R.milestones.map((m) => h('tr', { class: m.late ? 'rbad' : '' }, h('td', {}, m.m.name + (m.late ? ' (late)' : '')), h('td', { class: 'rnw' }, m.m.date || '—'), h('td', { class: 'rnumc' }, m.done + ' / ' + m.total), h('td', { class: 'rnw' }, rbar(m.pct), pct(m.pct))))) : none('No milestones set.'),
      h('h3', {}, 'Overdue (' + R.overdue.length + ')'), R.overdue.length ? tbl('', DH, R.overdue.slice(0, MAX).map(dueRow).concat([more(R.overdue.length, 5)])) : none('Nothing overdue.'),
      h('h3', {}, 'Due in the next 7 days (' + R.due7.length + ')'), R.due7.length ? tbl('', DH, R.due7.slice(0, MAX).map(dueRow).concat([more(R.due7.length, 5)])) : none('Nothing due in the next 7 days.')));

    /* 7 dependencies */
    if (O.deps) body.push(h('section', { class: 'rsec' }, H2('Dependencies and updates', 'deps'),
      h('h3', {}, 'Blocked (' + P.deps.blocked.length + ')'), P.deps.blocked.length ? tbl('', ['Item', 'Waiting on'], P.deps.blocked.slice(0, MAX).map((x) => h('tr', {}, h('td', {}, x.item), h('td', {}, x.by.join('; ')))).concat([more(P.deps.blocked.length, 2)])) : none('Nothing blocked.'),
      h('h3', {}, 'Needs update after a linked revision (' + upd + ')'), upd ? tbl('', ['Item', 'Changed upstream'], P.deps.update.slice(0, MAX).map((x) => h('tr', {}, h('td', {}, x.item), h('td', {}, x.from.join('; ')))).concat([more(upd, 2)])) : none('No updates needed.'),
      P.deps.ready.length ? h('p', {}, h('b', {}, 'Ready to start: '), P.deps.ready.slice(0, MAX).join('; ') + (P.deps.ready.length > MAX ? ' (+' + (P.deps.ready.length - MAX) + ' more)' : '')) : null));

    /* 8 workload */
    if (O.workload) body.push(h('section', { class: 'rsec' }, H2('Owner workload', 'work'),
      P.workload.length ? tbl('rwork', ['Owner', 'Sheets', 'Open'].concat(M.STATUSES.map((s) => (ST_SYM[s] + ' ' + s)), ['Overdue', 'Due 7 d', 'Hours act / bud']), P.workload.map((w) => h('tr', { class: w.overdue ? 'rbad' : '' }, h('td', {}, h('b', {}, w.owner)), h('td', { class: 'rnumc' }, String(w.total)), h('td', { class: 'rnumc' }, String(w.open)),
        M.STATUSES.map((s) => h('td', { class: 'rnumc' }, String(w.by[s]))), h('td', { class: 'rnumc' }, String(w.overdue)), h('td', { class: 'rnumc' }, String(w.due7)), h('td', { class: 'rnumc' }, w.hb || w.ha ? w.ha + ' / ' + w.hb : '—')))) : none('No sheets yet.')));

    /* 9 recent changes */
    if (O.recent) body.push(h('section', { class: 'rsec' }, H2('Recently changed', 'recent'),
      P.recent.length ? tbl('', ['When', 'Item', 'Change'], P.recent.map((c) => h('tr', {}, h('td', { class: 'rnw' }, c.t ? new Date(c.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'), h('td', {}, c.item), h('td', {}, c.msg || '')))) : none('No changes logged yet.')));

    body.push(h('p', { class: 'rend rm' }, 'End of report · generated on this device by Project Tracker, ' + new Date().toLocaleString() + '. Data never leaves the browser.'));
    if (toc.length > 4) tocBox.replaceChildren(h('h2', {}, 'Contents'), h('ol', {}, toc.map(([n, t]) => h('li', {}, t)))); else tocBox.remove();

    $('#report').className = 'report ' + (O.paper === 'a4' ? 'pg-a4' : 'pg-letter');
    $('#report').replaceChildren(h('table', { class: 'rpage' },
      h('thead', {}, h('tr', {}, h('td', {}, h('div', { class: 'rrun' }, h('b', {}, R.project.name || 'Project'), h('span', {}, 'Drainage & SWP3 status report · as of ' + R.today))))),
      h('tbody', {}, h('tr', {}, h('td', {}, body)))));
    /* bar widths via CSS classes (CSP: no inline styles needed) */
    document.querySelectorAll('#report .rbar i').forEach((i) => { i.className = 'w' + Math.round(Number(i.dataset.w) / 10) * 10; });
  }

  /* ----- command palette (Ctrl/Cmd+K) ----- */
  function paletteItems() {
    const go = (v) => () => { ui.view = v; saveUI(); renderAll(); };
    const A = [
      ['Go to Tree', go('tree'), 'view'], ['Go to List', go('list'), 'view table'], ['Go to This week', go('week'), 'view overdue due'], ['Go to Status board', go('board'), 'view kanban'], ['Go to Stations table', go('stations'), 'view edit stations roads'], ['Go to Report (narrative)', go('report'), 'summary write-up notes'], ['Copy report narrative', () => copyText(M.narrativeText(st)), 'clipboard summary'],
      ['Undo', () => travel(-1), 'ctrl z'], ['Redo', () => travel(1), 'ctrl shift z'], ['Print status report', () => $('#printBtn').click(), 'pdf'],
      ['Open Settings', () => openSettings(), 'backup export import'], ['Edit section lists', () => openSettings('secs'), 'sections rename reorder add remove'], ['Import CSV (roads / sheets)', () => openCSV(), 'upload excel spreadsheet populate'], ['Download CSV template', () => download('pm-import-template.csv', M.csvTemplate(), 'text/csv'), 'import'], ['Sheet index', openIndex, ''], ['PP sheet calculator', openPP, ''], ['Milestones', openMilestones, ''], ['Staff & workload', openStaff, 'owners'],
      ['Expand all', () => { ui.view = 'tree'; renderAll(); $('#xAll').click(); }, 'tree'], ['Collapse all', () => { ui.view = 'tree'; renderAll(); $('#cAll').click(); }, 'tree'], ['Toggle dark mode', () => $('#themeBtn').click(), 'theme light'],
      ['Keyboard shortcuts', () => openKeys(), 'help ?']].map(([label, run, kw]) => ({ label, run, kw, kind: 'Action', rank: 2 }));
    const toTree = (subId, d, secId, sel1) => () => { ui.view = 'tree'; if (subId) openBranch(subId, d, secId); else { ui.collapsed.root = false; ui.collapsed['dtop:' + d] = false; } saveUI(); renderAll(); sel1(); };
    for (const d of DISCS) A.push({ label: d, hint: 'discipline · A–D', kind: 'Discipline', rank: 1, run: toTree(null, d, null, () => { select_('dtop', d); focusNode('dtop:' + d); }) });
    for (const sub of st.subs) {
      A.push({ label: M.subLabel(sub), kind: 'Sub-project', run: () => select_('sub', sub.id) });
      for (const d of DISCS) {
        A.push({ label: M.subTag(sub) + ' · ' + d, hint: M.subName(sub), kind: 'Branch', run: toTree(sub.id, d, null, () => { select_('disc', sub.id + ':' + d); focusNode('disc:' + sub.id + ':' + d); }) });
        A.push({ label: 'Add sheet to ' + M.subTag(sub) + ' · ' + d, kind: 'Action', kw: 'new quick add', run: toTree(sub.id, d, null, () => { select_('disc', sub.id + ':' + d); focusAdd('qaTitle'); }) });
        for (const seg of M.sectionsOf(sub, d)) {
          const pp = M.isPPSec(seg);
          A.push({ label: M.subTag(sub) + ' · ' + seg.title, hint: d + ' section · ' + plural(seg.sheets.length, 'sheet') + (pp ? ' · ' + M.segPP(st, sub, seg).total + ' PP' : ''), kind: 'Section', rank: 1, run: toTree(sub.id, d, seg.id, () => { select_('seg', seg.id); focusNode('seg:' + seg.id); }) });
          if (pp) A.push({ label: 'Add road to ' + M.subTag(sub) + ' · ' + seg.title, kind: 'Action', kw: 'new road entry', run: toTree(sub.id, d, seg.id, () => { select_('seg', seg.id); focusAdd('addRoadName'); }) });
          for (const road of pp ? M.roadsOf(sub, seg) : []) A.push({ label: road.name, hint: M.subTag(sub) + ' · ' + seg.title + (M.hasSta(road) ? ' · ' + fmtFt(M.segLength(road)) + ' · ' + M.segPP(st, sub, road).total + ' PP' : ' · no stations yet'), kind: 'Road', rank: 1, kw: M.hasSta(road) ? 'sta ' + M.formatStation(road.start) + ' ' + M.formatStation(road.end) : '', run: toTree(sub.id, d, seg.id, () => { select_('road', road.id); focusNode(M.rgKey(seg, road.road)); }) });
          for (const sh of seg.sheets) { const rd = M.sheetRoad(st, sub, sh); A.push({ label: sh.title, hint: M.subTag(sub) + ' · ' + seg.title + (rd ? ' · ' + rd : '') + (M.sheetRange(sh) ? ' · ' + staTxt(M.sheetRange(sh)) : '') + (sh.number ? ' · #' + sh.number : '') + ' · ' + sh.status, kw: sh.owner + ' ' + rd + (M.sheetRange(sh) ? ' sta ' + M.formatStation(M.sheetRange(sh).start) + ' ' + M.formatStation(M.sheetRange(sh).end) + ' ' + M.rangeText(M.sheetRange(sh)) : ''), kind: 'Sheet', run: () => { select_('sheet', sh.id); if (ui.view === 'tree') revealSheet({ sub, seg, sh }); } }); }
        }
      }
    }
    return A;
  }
  function openPalette() {
    if ($('#cmdk')) return;
    const items = paletteItems(); let cur = 0, res = [];
    const q = h('input', { id: 'cmdkQ', type: 'search', placeholder: 'Jump to a road, sheet or action…', 'aria-label': 'Command palette search', autocomplete: 'off', role: 'combobox', 'aria-controls': 'cmdkList', 'aria-expanded': 'true' });
    const list = h('div', { id: 'cmdkList', role: 'listbox' });
    const prev = document.activeElement;
    const close = () => { box.remove(); if (prev && prev.focus) prev.focus(); };
    const run = (it) => { close(); try { it.run(); } catch (e) { toast(e.message); } };
    const draw = () => {
      res = M.paletteSearch(items, q.value, 40); cur = Math.min(cur, Math.max(0, res.length - 1));
      list.replaceChildren(...(res.length ? res.map((it, i) => h('button', { type: 'button', role: 'option', class: 'cmdi' + (i === cur ? ' on' : ''), 'aria-selected': String(i === cur), onclick: () => run(it), onmousemove: () => { if (cur !== i) { cur = i; draw(); } } },
        h('span', { class: 'ck' }, it.kind), h('span', { class: 'cl' }, it.label), it.hint ? h('span', { class: 'ch muted' }, it.hint) : null)) : [h('p', { class: 'muted empty' }, 'No matches.')]));
      const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    q.addEventListener('input', () => { cur = 0; draw(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(res.length - 1, cur + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (res[cur]) run(res[cur]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    const box = h('div', { id: 'cmdk', class: 'cmdk', onclick: (e) => { if (e.target.id === 'cmdk') close(); } }, h('div', { class: 'cmdk-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, q, list, h('p', { class: 'muted small cmdk-foot' }, '↑↓ to move · Enter to open · Esc to close · Ctrl/Cmd+K anywhere')));
    document.body.append(box); draw(); q.focus();
  }

  /* ----- v2.16 multi-select + bulk edit (List and Board) ----- */
  const msel = new Set(); let mAnchor = null;
  function pickSheet(id, mode, order) {
    try { window.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    if (mode === 'range' && mAnchor && order.includes(mAnchor)) { const [i, j] = [order.indexOf(mAnchor), order.indexOf(id)].sort((x, y) => x - y); order.slice(i, j + 1).forEach((x) => msel.add(x)); }
    else { msel.has(id) ? msel.delete(id) : msel.add(id); mAnchor = id; }
    if (ui.view === 'list') renderList(); else if (ui.view === 'board') renderBoard(); else if (ui.view === 'week') renderWeek();
    renderBulk();
  }
  function renderBulk() {
    for (const id of [...msel]) if (!M.findSheet(st, id)) msel.delete(id);
    let bar = $('#bulkBar');
    if (!msel.size || !['list', 'board'].includes(ui.view)) { if (bar) bar.remove(); return; }
    const ids = [...msel];
    const ap = (f, what) => { const n = commit(() => M.bulkUpdate(st, ids, f)); if (n) toast(what + ' on ' + plural(n, 'sheet') + '. Undo with Ctrl+Z.'); };
    const mk = (id, label, opts, k) => { const e = select(opts, '', { id, 'aria-label': label }); e.addEventListener('change', () => { if (e.value === '') return; ap({ [k]: e.value === '(none)' ? '' : e.value }, label + ' → ' + e.selectedOptions[0].textContent); }); return e; };
    const due = h('input', { type: 'date', id: 'bkDue', 'aria-label': 'Set due date' });
    due.addEventListener('change', () => ap({ due: due.value }, 'Due → ' + (due.value || '(none)')));
    const nb = h('div', { id: 'bulkBar', class: 'bulkbar', role: 'region', 'aria-label': 'Bulk edit selected sheets' },
      h('b', {}, plural(ids.length, 'sheet') + ' selected'),
      mk('bkStatus', 'Status', [['', 'Status…']].concat(M.STATUSES), 'status'),
      mk('bkOwner', 'Owner', [['', 'Owner…'], ['(none)', 'Unassigned']].concat(ownersList()), 'owner'),
      due,
      mk('bkDisc', 'Discipline', [['', 'Discipline…'], 'Drainage', 'SWP3'], 'discipline'),
      (() => { const e = select([['', 'Move to section…']].concat(secKeyOpts()), '', { id: 'bkSec', 'aria-label': 'Move to section' }); e.addEventListener('change', () => { if (!e.value) return; ap({ sec: M.secOf(st.subs[0], e.value).id }, 'Section → ' + e.selectedOptions[0].textContent); }); return e; })(),
      h('button', { type: 'button', class: 'btn danger sm', id: 'bkDel', onclick: () => { if (!confirm('Delete ' + plural(ids.length, 'sheet') + '? You can undo with Ctrl+Z.')) return; const n = commit(() => M.bulkDelete(st, ids)); msel.clear(); renderBulk(); if (n) toast('Deleted ' + plural(n, 'sheet') + '. Undo with Ctrl+Z.'); } }, 'Delete'),
      h('button', { type: 'button', class: 'btn sec sm', id: 'bkClear', onclick: () => { msel.clear(); renderAll(); } }, 'Clear'));
    if (bar) bar.replaceWith(nb); else document.body.append(nb);
  }

  /* ----- v2.18 shortcut help ----- */
  const KEYS = [['Ctrl/Cmd + K', 'Command palette: jump to any section, road, sheet or action'], ['/', 'Search'], ['?', 'This shortcut help'], ['n', 'Add: a road in a P&P section, a sheet in other sections, quick-add in a sub-project branch'], ['Shift + Enter', 'Add road and start the next one (add-road form)'], ['l', 'Toggle Tree / List'], ['1 – 6', 'Tree / List / Week / Board / Stations / Report'], ['f', 'Fit tree to screen'], ['c', 'Show / hide connectors'], ['d', 'Light / dark'], ['Ctrl/Cmd + Z', 'Undo'], ['Ctrl/Cmd + Shift + Z, Ctrl + Y', 'Redo'], ['Esc', 'Close drawer or dialog · clear multi-select'], ['Enter / Space', 'Open the focused node or row'], ['← →', 'Collapse / expand the focused tree node'], ['Shift / Ctrl + click', 'Multi-select sheets in List and Board'], ['Alt + ← →', 'Move a board card to the previous / next status'], ['↑ ↓', 'Move between rows in the list (Alt+↑↓ in dropdowns)'], ['Arrows, + −', 'Pan / zoom when the tree has focus']];
  function openKeys() { openModal('Keyboard shortcuts', h('div', { id: 'keysHelp' }, h('ul', { class: 'keys' }, KEYS.map(([k, v]) => h('li', {}, h('kbd', {}, k), ' ' + v))), h('p', { class: 'muted small' }, 'Shortcuts are ignored while you type in a field (except Ctrl/Cmd+K).'))); }

  /* ----- v2.19 Report view: generated narrative + editable notes per part ----- */
  function copyText(t) {
    const done = () => toast('Narrative copied to the clipboard.');
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(done, () => fallback());
    fallback();
    function fallback() { const ta = h('textarea', { 'aria-hidden': 'true', class: 'offscreen' }); ta.value = t; document.body.append(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select the text and copy manually.'); } ta.remove(); }
  }
  function noteBox(key, val, label) {
    const ta = h('textarea', { class: 'rnote', 'data-key': key, rows: 2, placeholder: 'Your notes for ' + label + ' (saved, printed, never overwritten)…', 'aria-label': 'Notes for ' + label, value: val || '' });
    ta.value = val || '';
    ta.addEventListener('input', () => { M.setReportNote(st, key, ta.value); save(); });
    return ta;
  }
  function rptSettings() {
    const O = rptOpts(), m = M.reportMeta(st);
    const fld = (id, k, label, ph) => h('label', { class: 'f' }, h('span', {}, label), h('input', { id, type: 'text', value: m[k], placeholder: ph, maxlength: 200, onchange: (e) => { commit(() => M.setReportMeta(st, k, e.target.value)); } }));
    const chk = (id, k, label) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', id, checked: !!O[k], onchange: (e) => { O[k] = e.target.checked; saveUI(); } }), label);
    const paper = h('select', { id: 'rpPaper', 'aria-label': 'Paper size', onchange: (e) => { O.paper = e.target.value; saveUI(); } }, h('option', { value: 'letter' }, 'US Letter'), h('option', { value: 'a4' }, 'A4'));
    paper.value = O.paper;
    return h('section', { class: 'npart rpset', id: 'rptSet' }, h('h3', {}, 'Printed report'),
      h('div', { class: 'rpgrid' }, fld('rpFor', 'preparedFor', 'Prepared for', 'e.g. TxDOT Houston District'), fld('rpBy', 'preparedBy', 'Prepared by', 'Name, firm'),
        fld('rpNo', 'reportNo', 'Report no.', 'e.g. 07'), fld('rpScope', 'scope', 'Scope', 'Leave blank for the default scope sentence'),
        h('label', { class: 'f' }, h('span', {}, 'Paper'), paper)),
      h('div', { class: 'rpchk' }, chk('rpDetail', 'detail', 'Sheet detail by section'), chk('rpDeps', 'deps', 'Dependencies'), chk('rpWork', 'workload', 'Owner workload'), chk('rpRecent', 'recent', 'Recently changed')));
  }
  function renderReportView() {
    const N = M.narrative(st);
    $('#reportWrap').replaceChildren(h('div', { class: 'vhead' }, h('h2', {}, 'Project report'), h('span', { class: 'muted' }, 'Generated from the data as of ' + N.today + ' · your notes are kept separately'),
        h('span', { class: 'vfbar' }, h('button', { type: 'button', class: 'btn sec sm', id: 'copyNarr', onclick: () => copyText(M.narrativeText(st)) }, '⧉ Copy narrative'), h('button', { type: 'button', class: 'btn sm', onclick: () => $('#printBtn').click() }, '⎙ Print report'))),
      rptSettings(),
      h('article', { class: 'narr' },
        h('section', { class: 'npart', id: 'narrProject' }, h('h3', {}, 'Project summary'), h('p', { class: 'gen' }, N.project), noteBox('project', N.note, 'the project')),
        N.discs.map((D) => h('section', { class: 'npart ndtop ' + DINFO[D.disc].cls, 'data-disc': D.disc }, h('h3', {}, h('span', { class: 'chip ' + DINFO[D.disc].cls }, DINFO[D.disc].short), ' ' + D.disc), h('p', { class: 'gen' }, D.text), noteBox('dtop:' + D.disc, D.note, D.disc),
          D.subs.map((x) => h('div', { class: 'ndisc ' + DINFO[D.disc].cls, 'data-sub': x.sub.code }, h('h4', {}, h('span', { class: 'code', title: M.subName(x.sub) }, x.sub.code), ' ' + M.subName(x.sub) + ' · ' + D.disc), h('p', { class: 'gen' }, x.text.replace(/^[^—]*— \w+: /, '')), noteBox(x.key, x.note, M.subTag(x.sub) + ' ' + D.disc),
            x.secs.length ? h('ul', { class: 'nsecs' }, x.secs.map((y) => h('li', { 'data-sec': y.sec.key }, h('span', { class: 'gen' }, y.text || y.sec.title + ': no sheets yet.'), noteBox('sec:' + y.sec.id, y.note, M.subTag(x.sub) + ' · ' + y.sec.title)))) : null))))));
  }

  /* ----- v2.20 CSV import (file, drag-and-drop or pasted TSV) ----- */
  function openCSV(initial) {
    const S = { text: initial || '', header: true, map: null, mode: 'merge', defaults: true, skipBad: true };
    const ta = h('textarea', { id: 'csvText', rows: 4, placeholder: 'Paste rows from Excel here (with the header row), or choose / drop a .csv file', 'aria-label': 'CSV or TSV text' });
    ta.value = S.text;
    const file = h('input', { type: 'file', id: 'csvFile', accept: '.csv,.tsv,.txt,text/csv', 'aria-label': 'CSV file' });
    const out = h('div', { id: 'csvOut' });
    const readFile = (f) => { const r = new FileReader(); r.onload = () => { ta.value = S.text = String(r.result); S.map = null; draw(); }; r.readAsText(f); };
    file.addEventListener('change', () => { if (file.files[0]) readFile(file.files[0]); });
    ta.addEventListener('input', () => { S.text = ta.value; S.map = null; clearTimeout(ta.tm); ta.tm = setTimeout(draw, 250); });
    const drop = h('div', { class: 'dropzone', id: 'csvDrop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) readFile(f); } },
      h('b', {}, 'Drop a CSV here'), ' or ', file);
    function draw() {
      const P = M.parseCSV(S.text);
      if (!P.rows.length) { out.replaceChildren(h('p', { class: 'muted' }, 'Columns recognised: ' + M.CSV_FIELDS.map((f) => f[1]).join(', ') + '. One row = a road entry (road, no sheet title) for a Plan & Profile section, or a sheet. The Section column says where it goes; without it, road rows go to Drainage P&P / SWP3 Layout and sheets to the closest section by title — so old v2 CSVs still import.')); return; }
      const head = S.header ? P.rows[0] : P.rows[0].map((_, i) => 'Column ' + (i + 1));
      if (!S.map) S.map = S.header ? M.detectMapping(head) : {};
      const body = S.header ? P.rows.slice(1) : P.rows;
      const plan = M.planCSV(st, body, S.map, { mode: S.mode, defaults: S.defaults });
      const mapUI = h('div', { class: 'csvmap', id: 'csvMap' }, M.CSV_FIELDS.map(([k, label]) => { const e = select([['', '— not used —']].concat(head.map((x, i) => [String(i), x || 'Column ' + (i + 1)])), k in S.map ? String(S.map[k]) : '', { 'aria-label': 'Column for ' + label, 'data-field': k });
        e.addEventListener('change', () => { if (e.value === '') delete S.map[k]; else S.map[k] = Number(e.value); draw(); }); return h('label', { class: 'f' }, h('span', {}, label), e); }));
      const opt = (id, label, key, val) => { const i = h('input', { type: key === 'mode' ? 'radio' : 'checkbox', name: key === 'mode' ? 'csvMode' : null, id, checked: key === 'mode' ? S.mode === val : !!S[key] }); i.addEventListener('change', () => { if (key === 'mode') S.mode = val; else S[key] = i.checked; if (key === 'header') S.map = null; draw(); }); return h('label', { class: 'chk' }, i, ' ' + label); };
      const sm = plan.summary;
      const rowsUI = h('div', { class: 'tablewrap csvprev' }, h('table', { class: 'grid compact', id: 'csvPreview' }, h('thead', {}, h('tr', {}, ['#', 'Result', 'Sub', 'Section', 'Road', 'Stations', 'Sheet', 'Status / owner / due', 'Checks'].map((x) => h('th', {}, x)))),
        h('tbody', {}, plan.items.map((it) => h('tr', { class: it.errors.length ? 'cerr' : it.warns.length ? 'cwarn' : '' }, h('td', {}, String(it.line)),
          h('td', {}, it.errors.length ? (S.skipBad ? 'skip' : 'error') : it.skip ? 'keep existing' : it.kind === 'road' ? (it.groups.every((g) => g.existing) ? 'existing road' : 'new road' + (it.groups.length > 1 ? ' ×' + it.groups.length : '')) : it.kind === 'pp' ? 'PP sheet' : 'sheet'),
          h('td', {}, it.f.sub ? M.subTag(it.f.sub) : '?'), h('td', { class: 'small' }, it.groups && it.groups.length > 1 ? it.groups.map((g) => g.sdef.title).join(' + ') : it.f.sec ? it.f.sec.title : ''), h('td', {}, it.f.road), h('td', { class: 'mono' }, Number.isFinite(it.f.start) ? M.formatStation(it.f.start) + '–' + M.formatStation(it.f.end) : ''),
          h('td', {}, it.f.title || (it.kind === 'pp' ? it.f.series + ' #' + it.f.ppidx : '')), h('td', {}, [it.f.status, it.f.owner, it.f.due].filter(Boolean).join(' · ')),
          h('td', { class: 'small' }, it.errors.map((x) => h('div', { class: 'err' }, '✖ ' + x)), it.warns.map((x) => h('div', { class: 'warn' }, '⚠ ' + x))))))));
      const btn = h('button', { type: 'button', class: 'btn', id: 'csvImport', disabled: (!S.skipBad && sm.errors) || sm.rows === sm.errors, onclick: () => {
        const made = commit(() => M.applyCSV(st, plan, { skipBad: S.skipBad }));
        if (made) { closeModal(); ui.collapsed.root = false; DISCS.forEach((d) => { ui.collapsed['dtop:' + d] = false; }); saveUI(); renderAll(); toast('Imported: ' + made.roads + ' road entries, ' + made.sheets + ' sheets, ' + made.pp + ' PP sheets, ' + made.links + ' links. Undo with Ctrl+Z.'); }
      } }, 'Import ' + (sm.rows - (S.skipBad ? sm.errors : 0)) + ' rows');
      out.replaceChildren(h('div', { class: 'row' }, opt('csvHeader', 'First row is a header', 'header'), opt('csvMerge', 'Merge into matching existing roads', 'mode', 'merge'), opt('csvNew', 'Add as new roads', 'mode', 'new'), opt('csvDefaults', 'Add the standard sheet set + PP sheets for imported roads', 'defaults'), opt('csvSkip', 'Skip rows with errors', 'skipBad')),
        h('details', { open: !S.header || Object.keys(S.map).length < 3 }, h('summary', {}, 'Column mapping (' + Object.keys(S.map).length + ' of ' + M.CSV_FIELDS.length + ' matched)'), mapUI),
        h('p', { id: 'csvSummary', class: sm.errors ? 'warnbox' : 'muted' }, sm.rows + ' rows: ' + sm.newRoads + ' new roads, ' + sm.mergedRoads + ' merged into existing, ' + sm.sheets + ' sheets' + (sm.ppRows ? ', ' + sm.ppRows + ' PP rows' : '') + (sm.skipped ? ', ' + sm.skipped + ' existing sheets kept as is' : '') + ' · ' + sm.errors + ' with errors, ' + sm.warnings + ' with warnings. Nothing existing is overwritten.'),
        rowsUI, h('div', { class: 'row' }, btn));
    }
    openModal('Import CSV', h('div', { class: 'stack csvimp' },
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec sm', id: 'csvTpl', onclick: () => download('pm-import-template.csv', M.csvTemplate(), 'text/csv') }, '⤓ Download template'),
        h('button', { type: 'button', class: 'btn sec sm', id: 'csvExport', onclick: () => download('pm-roads-sheets-' + M.todayISO() + '.csv', M.exportImportCSV(st), 'text/csv') }, '⤓ Current data as importable CSV'),
        h('span', { class: 'muted small' }, 'Stays on this device — nothing is uploaded.')),
      drop, ta, out));
    draw();
  }

  /* ----- overview rail ----- */
  function renderRail() {
    const S = M.summary(st);
    const PP = M.ppSummary(st);
    const F = M.flags(st);
    const o = S.overall;
    const days = st.lastBackup ? (Date.now() - Date.parse(st.lastBackup)) / 864e5 : Infinity;
    const kpi = (n, l, cls, on) => h('button', { type: 'button', class: 'kpi ' + (cls || ''), onclick: on }, h('b', {}, n), h('span', {}, l));
    const toList = (f) => () => { Object.assign(filt, { status: '', owner: '', discipline: '', q: '', sub: '', milestone: '', kind: '', when: '', flag: '', section: '' }, f); $('#q').value = filt.q; ui.view = 'list'; saveUI(); renderAll(); };
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
      h('section', { class: 'panel' }, h('h3', {}, 'Disciplines'),
        DISCS.map((d) => {
          const D = M.discStats(st, d);
          return h('div', { class: 'subblock', 'data-disc': d }, h('button', { type: 'button', class: 'subline', onclick: () => { ui.collapsed.root = false; ui.collapsed['dtop:' + d] = false; if (!shownDiscs().includes(d)) ui.branch = 'both'; saveUI(); renderTree(); select_('dtop', d); focusNode('dtop:' + d); } },
            h('span', { class: 'chip ' + DINFO[d].cls }, DINFO[d].short), h('span', { class: 'grow' }, h('span', { class: 'nm' }, d), bar(D.pct, 'Progress ' + d)),
            h('span', { class: 'pp', title: 'PP sheets' }, D.pp + ' PP')),
            M.orderedSubs(st).map((sub) => { const b = M.branchStats(st, sub, d); return h('button', { type: 'button', class: 'discline ' + DINFO[d].cls, 'data-disc': d, 'data-sub': sub.code, onclick: () => { openBranch(sub.id, d); saveUI(); renderTree(); select_('disc', sub.id + ':' + d); focusNode('disc:' + sub.id + ':' + d); } },
              h('span', { class: 'code' }, sub.code), h('span', { class: 'grow' }, bar(b.pct, M.subTag(sub) + ' ' + d + ' progress')), h('span', { class: 'muted' }, b.total + ' sh · ' + b.pp + ' PP')); }));
        })),
      h('section', { class: 'panel' }, h('h3', {}, 'Build order'),
        h('div', { class: 'chain', id: 'buildChain' }, M.orderedSubs(st).map((sub, i) => [i ? h('span', { class: 'arr', 'aria-hidden': 'true' }, '→') : null,
          h('button', { type: 'button', class: 'code', title: M.subName(sub) + ' (built #' + (i + 1) + ')', onclick: () => select_('sub', sub.id) }, sub.code)]).flat().filter(Boolean)),
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
      (() => { const rc = M.recentChanges(st, 6); return h('section', { class: 'panel', id: 'recentPanel' }, h('h3', {}, 'Recently changed'),
        rc.length ? h('ul', { class: 'mini' }, rc.map((x) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => { if (x.ref.t === 'sheet') { select_('sheet', x.ref.id); revealSheet(x.r); } else revealRef(x.ref); } },
          (x.r.sub ? M.subTag(x.r.sub) + ' · ' : '') + (x.ref.t === 'sheet' ? x.r.sh.title : x.ref.t === 'road' ? x.r.name : x.r.seg.title)), h('small', { class: 'muted' }, ' ' + new Date(x.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · ' + x.msg.replace(/^.*?: /, ''))))) : h('p', { class: 'muted' }, 'Edits to sheets, sections and roads will show here.')); })(),
      h('section', { class: 'panel' }, h('h3', {}, 'Recent activity'),
        st.log.length ? h('ol', { class: 'log' }, st.log.slice(0, 8).map((l) => h('li', {}, h('time', { datetime: l.t }, new Date(l.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), ' ', l.msg))) : h('p', { class: 'muted' }, 'Nothing yet.'))].filter(Boolean));
  }
  function revealRef(ref) {
    const r = M.resolve(st, ref);
    if (!r) return;
    const bk = r.t === 'sheet' ? sheetBranchKey(r.sub, r.seg, r.sh) : r.t === 'road' ? M.rgKey(r.seg, r.road.road) : null;
    openBranch(r.sub.id, r.seg.discipline, r.t === 'sheet' || r.t === 'road' ? r.seg.id : null, r.t === 'sheet' ? bk : null); saveUI();
    if (ui.view !== 'tree') { ui.view = 'tree'; saveUI(); }
    renderAll(); select_(r.t, ref.id);
    setTimeout(() => focusNode(r.t === 'sheet' ? 'sheet:' + ref.id : bk || 'seg:' + r.seg.id), 20);
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
        M.subTag(r.sub) + ' · ' + r.sh.title), h('small', { class: 'muted' }, ' ' + r.sh.due + (r.sh.owner ? ' · ' + r.sh.owner : ''))))) : h('p', { class: 'muted' }, 'None'));
  }

  /* ----- tree (v3): Project → Drainage / SWP3 → sub-projects A–D → sections → sheets. Road entries are data inside P&P sections, not nodes. ----- */
  const COLX = [0, 280, 560, 860, 1200, 1530];
  const W = { root: 250, dtop: 250, disc: 270, seg: 310, sheet: 320, road: 290, oth: 290 };
  const H = { root: 112, dtop: 100, disc: 92, seg: 70, segpp: 104, sheet: 56, road: 88, oth: 56 };
  const GAP = 10;
  function isCollapsed(key, def) { return key in ui.collapsed ? ui.collapsed[key] : def; }
  const DISCS = ['Drainage', 'SWP3'];
  const DINFO = { Drainage: { cls: 'dr', icon: '≋', short: 'DR', label: 'Drainage' }, SWP3: { cls: 'sw', icon: '❖', short: 'SW', label: 'SWP3' } };
  function shownDiscs() { return ui.branch === 'Drainage' || ui.branch === 'SWP3' ? [ui.branch] : DISCS; }
  function setSeg(id, v) { ui.collapsed['seg:' + id] = v; }
  /* open the path to a sub-project branch (and optionally one section) */
  function openBranch(subId, d, secId, rgk) { ui.collapsed.root = false; ui.collapsed['dtop:' + d] = false; ui.collapsed['disc:' + subId + ':' + d] = false; if (secId) ui.collapsed['seg:' + secId] = false; if (rgk) ui.collapsed[rgk] = false; if (!shownDiscs().includes(d)) ui.branch = 'both'; }
  function keyQuery(key) { return '.node[data-key="' + key + '"]'; }
  function rowRoad(r) { return M.sheetRoad(st, r.sub, r.sh); }
  /* v3.2: tree key of the road branch (or "Other sheets") a sheet of a road section hangs under; null for other sections */
  function sheetBranchKey(sub, seg, sh) { if (!M.isPPSec(seg)) return null; const g = M.sheetGroupSlug(sub, seg, sh); return g ? 'rd:' + seg.id + ':' + g : 'oth:' + seg.id; }
  function roadBranchKey(hit) { return hit && hit.sec ? M.rgKey(hit.sec, hit.road.road) : null; }
  function staTxt(rg) { return rg ? M.formatStation(rg.start) + ' – ' + M.formatStation(rg.end) : 'no range'; }
  function bigProject() { return M.allSheets(st).length > 80; }
  function buildTree() {
    const root = { key: 'root', type: 'root', depth: 0, kids: [], collapsed: isCollapsed('root', false) };
    const big = bigProject();
    for (const d of shownDiscs()) {
      const tn = { key: 'dtop:' + d, type: 'dtop', disc: d, depth: 1, kids: [], collapsed: isCollapsed('dtop:' + d, false) };
      for (const sub of M.orderedSubs(st)) {
        const dn = { key: 'disc:' + sub.id + ':' + d, type: 'disc', sub, disc: d, depth: 2, kids: [] };
        dn.collapsed = isCollapsed(dn.key, true);
        for (const seg of M.sectionsOf(sub, d)) {
          const gn = { key: 'seg:' + seg.id, type: 'seg', sub, seg, disc: d, depth: 3, kids: [], pp: M.isPPSec(seg) };
          gn.collapsed = isCollapsed(gn.key, true);
          if (gn.pp) {
            for (const g of M.roadGroups(sub, seg)) {
              const rn = { key: g.key, type: 'road', sub, seg, g, disc: d, depth: 4, kids: [] };
              rn.collapsed = isCollapsed(g.key, big);
              for (const sh of M.sheetsOfGroup(sub, seg, g)) rn.kids.push({ key: 'sheet:' + sh.id, type: 'sheet', sub, seg, sh, g, disc: d, depth: 5, kids: [] });
              gn.kids.push(rn);
            }
            const oth = M.otherSheets(sub, seg);
            if (oth.length) { const on = { key: 'oth:' + seg.id, type: 'oth', sub, seg, disc: d, depth: 4, kids: [] }; on.collapsed = isCollapsed(on.key, big); for (const sh of oth) on.kids.push({ key: 'sheet:' + sh.id, type: 'sheet', sub, seg, sh, disc: d, depth: 5, kids: [] }); gn.kids.push(on); }
          } else for (const sh of seg.sheets) gn.kids.push({ key: 'sheet:' + sh.id, type: 'sheet', sub, seg, sh, disc: d, depth: 4, kids: [] });
          dn.kids.push(gn);
        }
        tn.kids.push(dn);
      }
      root.kids.push(tn);
    }
    let cursor = 0;
    const out = [];
    (function lay(n) {
      out.push(n);
      const kids = n.collapsed ? [] : n.kids;
      n.x = COLX[n.depth]; n.w = W[n.type]; n.h = n.type === 'seg' && n.pp ? H.segpp : H[n.type];
      if (!kids.length) { n.y = cursor; cursor += n.h + GAP; return; }
      kids.forEach(lay);
      const first = kids[0], last = kids[kids.length - 1];
      n.y = Math.max((first.y + first.h / 2 + last.y + last.h / 2) / 2 - n.h / 2, 0);
      n.vis = kids;
    })(root);
    return out;
  }
  function nodeRows(n) {
    if (n.type === 'sheet') return [{ sub: n.sub, seg: n.seg, sh: n.sh }];
    if (n.type === 'seg') return n.seg.sheets.map((sh) => ({ sub: n.sub, seg: n.seg, sh }));
    if (n.type === 'road') return M.sheetsOfGroup(n.sub, n.seg, n.g).map((sh) => ({ sub: n.sub, seg: n.seg, sh }));
    if (n.type === 'oth') return M.otherSheets(n.sub, n.seg).map((sh) => ({ sub: n.sub, seg: n.seg, sh }));
    if (n.type === 'disc') return M.sectionsOf(n.sub, n.disc).flatMap((seg) => seg.sheets.map((sh) => ({ sub: n.sub, seg, sh })));
    if (n.type === 'dtop') return M.allSheets(st).filter((r) => r.seg.discipline === n.disc);
    return M.allSheets(st);
  }
  function nodeMatch(n) {
    if (!filtersActive()) return { dim: false, hit: false };
    const rows = nodeRows(n);
    const any = rows.some(sheetMatches);
    const q = filt.q.trim().toLowerCase();
    const roadTxt = n.type === 'seg' ? M.roadsOf(n.sub, n.seg).map((r) => r.name).join(' ') : '';
    const selfHit = !!q && (n.type === 'dtop' ? n.disc.toLowerCase().includes(q) : n.type === 'disc' ? (M.subLabel(n.sub) + ' ' + n.disc).toLowerCase().includes(q) : n.type === 'seg' ? (n.seg.title + ' ' + roadTxt).toLowerCase().includes(q) : n.type === 'road' ? (n.g.name + ' ' + n.g.entries.map((r) => r.name).join(' ')).toLowerCase().includes(q) : n.type === 'sheet' ? any : false);
    const onlyQ = !filt.status && !filt.owner && !filt.discipline && !filt.flag;
    return { dim: !(any || (selfHit && onlyQ)), hit: selfHit && (n.type !== 'sheet' || any) };
  }
  function renderTree() {
    const empty = !st.subs.some((x) => x.roads.length || x.segments.some((g) => g.sheets.length));
    let eh = $('#emptyHint');
    if (empty && !eh) {
      const first = M.orderedSubs(st)[0], pp = M.secOf(first, 'dr-pp') || first.segments.find(M.isPPSec);
      eh = h('div', { id: 'emptyHint', class: 'emptyhint' }, h('b', {}, 'Start here'),
        h('p', {}, 'Each discipline has sub-projects A–D, and each of those has the drainage sections. Open a section and press ', h('b', {}, '+'), ' to add sheets. In a Plan & Profile section you only type the road name; stations can come later. ', h('kbd', {}, 'Ctrl/Cmd+K'), ' jumps anywhere, ', h('kbd', {}, '?'), ' shows shortcuts.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sm', id: 'emptyStd', onclick: () => { const n = commit(() => st.subs.reduce((a, s) => a + M.addStandardSet(st, s.id).length, 0)); if (n) { for (const s of st.subs) DISCS.forEach((d) => openBranch(s.id, d)); saveUI(); renderAll(); toast('Added ' + plural(n, 'standard sheet') + ' (one per section) to A–D. Undo with Ctrl+Z.'); } } }, '+ Standard sheet set for A–D'),
          pp ? h('button', { type: 'button', class: 'btn sec sm', id: 'emptyRoad', onclick: () => { openBranch(first.id, pp.discipline, pp.id); saveUI(); renderAll(); select_('seg', pp.id); setTimeout(() => { const i = $('#addRoadName'); if (i) i.focus(); }, 30); } }, '+ Road in ' + first.code + ' · ' + pp.title) : null));
      $('#treeWrap').append(eh);
    } else if (!empty && eh) eh.remove();
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
  /* endpoint: the node itself, or its nearest visible ancestor when collapsed. Road entries attach to their section. */
  function nodeFor(map, ref) {
    const r = M.resolve(st, ref);
    if (!r) return null;
    const d = r.seg.discipline;
    const bk = r.t === 'sheet' ? sheetBranchKey(r.sub, r.seg, r.sh) : r.t === 'road' ? M.rgKey(r.seg, r.road.road) : null;
    return (r.t === 'sheet' && map.get('sheet:' + r.sh.id)) || (bk && map.get(bk)) || map.get('seg:' + r.seg.id) || map.get('disc:' + r.sub.id + ':' + d) || map.get('dtop:' + d) || map.get('root') || null;
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
  /* drag from a node's connector handle onto another sheet or section to link them (target depends on source) */
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
      const t = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest && x.closest('.node')).find((x) => x && /^(sheet|seg):/.test(x.dataset.key) && x.dataset.key !== n.key);
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
        const [t, id] = over.dataset.key.split(':');
        const r = commit(() => M.addLink(st, ref, { t, id }, 'dep'));
        if (r) toast('Connected: ' + M.refLabel(st, { t, id }) + ' depends on ' + M.refLabel(st, ref) + '.' + (r.warns.length ? ' ⚠ ' + r.warns.join(' ') : ' Change the kind in the drawer.'));
      }
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  }
  function hiddenCount(n) { let k = 0, sh = 0; (function walk(x) { for (const c of x.kids) { k++; if (c.type === 'sheet') sh++; walk(c); } })(n); return { k, sh }; }
  function toggleNode(n, v) { ui.collapsed[n.key] = v == null ? !n.collapsed : v; saveUI(); renderTree(); setTimeout(() => { const e = document.querySelector('.node[data-key="' + n.key + '"]'); if (e) e.focus({ preventScroll: true }); }, 0); }
  function toggleBtn(n) {
    if (!n.kids.length) return null;
    const hc = hiddenCount(n);
    const badge = n.collapsed ? (hc.sh && hc.sh !== n.kids.length ? n.kids.length + ' · ' + hc.sh + ' sh' : String(n.kids.length || 0)) : String(n.kids.length);
    return h('button', { type: 'button', class: 'nbtn tog' + (n.collapsed ? ' closed' : ''), 'aria-expanded': String(!n.collapsed), 'aria-label': (n.collapsed ? 'Expand ' : 'Collapse ') + nodeLabel(n) + (n.collapsed ? ' (' + hc.k + ' hidden items, ' + hc.sh + ' sheets)' : ''),
      title: n.collapsed ? 'Expand · ' + hc.k + ' hidden (' + hc.sh + ' sheets)' : 'Collapse',
      onclick: (e) => { e.stopPropagation(); toggleNode(n); } }, h('span', { class: 'chev', 'aria-hidden': 'true' }, n.collapsed ? '▸' : '▾'), ' ' + badge);
  }
  function setLevel(L) { ui.collapsed = M.collapseLevel(st, L); saveUI(); renderTree(); fit(); }
  function focusSel() {
    if (!sel || sel.type === 'root') return;
    let p = null;
    if (sel.type === 'dtop') p = { disc: sel.id };
    else if (sel.type === 'sub') p = { sub: sel.id };
    else if (sel.type === 'disc') { const [sid, d] = sel.id.split(':'); p = { sub: sid, disc: d }; }
    else if (sel.type === 'seg') { const r = M.findSeg(st, sel.id); p = r && { sub: r.sub.id, seg: sel.id, disc: r.seg.discipline }; }
    else if (sel.type === 'road') { const r = M.findRoad(st, sel.id); p = r && { sub: r.sub.id, seg: r.sec.id, disc: r.sec.discipline, rg: roadBranchKey(r) }; }
    else if (sel.type === 'sheet') { const r = M.findSheet(st, sel.id); p = r && { sub: r.sub.id, seg: r.seg.id, disc: r.seg.discipline, rg: sheetBranchKey(r.sub, r.seg, r.sh) }; }
    if (!p) return;
    ui.collapsed = M.focusBranch(st, p); if (p.disc && !shownDiscs().includes(p.disc)) ui.branch = 'both';
    if (ui.view !== 'tree') ui.view = 'tree';
    saveUI(); renderAll(); fit(); toast('Focused this branch · others collapsed');
  }
  function addBtn(n, label, fn) { return h('button', { type: 'button', class: 'nbtn add', 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); fn(); } }, '+'); }
  function nodeLabel(n) { return n.type === 'root' ? st.project.name : n.type === 'dtop' ? n.disc + ' branch' : n.type === 'disc' ? n.disc + ' sub-project ' + M.subTag(n.sub) : n.type === 'seg' ? M.subTag(n.sub) + ' ' + n.disc + ' section ' + n.seg.title : n.type === 'road' ? 'road ' + n.g.name + ' in ' + n.seg.title : n.type === 'oth' ? 'other sheets in ' + n.seg.title : 'sheet ' + n.sh.title + (n.depth === 5 ? ' ' + staTxt(M.sheetRange(n.sh)) : ''); }
  function flagRow(b, extra) {
    return h('div', { class: 'nrow' }, b.overdue ? h('span', { class: 'flag', title: 'Overdue' }, '⚑ ' + b.overdue) : null,
      b.blocked ? h('span', { class: 'fl fl-blk', title: 'Blocked sheets' }, '⛓ ' + b.blocked) : null,
      b.update ? h('span', { class: 'fl fl-upd', title: 'Sheets needing update' }, '⟳ ' + b.update) : null,
      extra || (!b.overdue && !b.blocked && !b.update ? h('span', { class: 'ns' }, b.done + ' done') : null));
  }
  function focusAdd(id) { setTimeout(() => { const i = $('#' + id); if (i) i.focus(); }, 30); }
  function nodeEl(n) {
    const m = nodeMatch(n);
    const today = M.todayISO();
    let body;
    if (n.type === 'root') {
      const p = M.progress(M.allSheets(st).map((r) => r.sh));
      body = [ring(p.pct, 56), h('div', { class: 'nb' }, h('div', { class: 'nt' }, st.project.name), h('div', { class: 'ns' }, p.total + ' sheets · ' + M.ppSummary(st).total + ' PP'), h('div', { class: 'ns chainmini' }, 'Build: ' + M.orderedSubs(st).map((x) => x.code).join(' → ')))];
    } else if (n.type === 'dtop') {
      const b = M.discStats(st, n.disc, today), I = DINFO[n.disc];
      body = [h('span', { class: 'dicon lg ' + I.cls, 'aria-hidden': 'true' }, I.icon), h('div', { class: 'nb' }, h('div', { class: 'nt' }, I.label),
        h('div', { class: 'ns' }, plural(b.total, 'sheet') + ' · ', h('b', {}, b.pp + ' PP'), ' · ' + plural(M.sectionsOf(st.subs[0], n.disc).length, 'section')),
        h('div', { class: 'ns dmix' }, M.orderedSubs(st).map((sub) => { const x = M.branchStats(st, sub, n.disc, null, today); return h('span', { class: 'dm ' + I.cls, title: sub.code + ': ' + Math.round(x.pct) + '% · ' + x.total + ' sheets · ' + x.pp + ' PP' }, sub.code + ' ' + Math.round(x.pct) + '%'); })),
        flagRow(b)), ring(b.pct, 46)];
    } else if (n.type === 'disc') {
      const b = M.branchStats(st, n.sub, n.disc, null, today);
      body = [h('span', { class: 'code lg' }, n.sub.code, h('small', { class: 'ord', title: 'Build order' }, '#' + (M.orderedSubs(st).indexOf(n.sub) + 1))), h('div', { class: 'nb' }, h('div', { class: 'nt', title: M.subName(n.sub) + ' — double-click to rename', ondblclick: (e) => { e.stopPropagation(); startTreeRename(e.currentTarget, n.sub); } }, h('span', { class: 'ntx' }, M.subName(n.sub)),
        h('button', { type: 'button', class: 'nren', title: 'Rename sub-project ' + n.sub.code, 'aria-label': 'Rename sub-project ' + n.sub.code, onclick: (e) => { e.stopPropagation(); startTreeRename(e.currentTarget.parentNode, n.sub); } }, '✎')),
        h('div', { class: 'ns' }, plural(b.total, 'sheet') + ' · ', h('b', {}, b.pp + ' PP'), b.roads ? ' · ' + plural(b.roads, 'road') : ''),
        flagRow(b)), ring(b.pct, 44)];
    } else if (n.type === 'seg') {
      const b = M.branchStats(st, n.sub, n.disc, n.seg, today);
      const owners = [...new Set(n.seg.sheets.map((x) => x.owner).filter(Boolean))];
      const gref = { t: 'seg', id: n.seg.id };
      const gb = M.isDone(st, gref) ? 0 : M.blockers(st, gref).length, gu = M.needsUpdate(st, gref).length;
      const rs = n.pp ? M.roadsOf(n.sub, n.seg) : [];
      body = [h('div', { class: 'nb' }, h('div', { class: 'nt sm' }, n.seg.title),
        n.pp ? h('div', { class: 'ns' }, h('b', {}, b.pp + ' PP'), ' · ' + plural(rs.length, 'road') + ' · ' + plural(b.total, 'sheet')) : h('div', { class: 'ns' }, b.total ? plural(b.total, 'sheet') + ' · ' + b.done + ' done' : 'No sheets yet'),
        n.pp ? h('div', { class: 'ns roadsmini', title: rs.map((r) => r.name).join('\n') }, rs.length ? rs.slice(0, 2).map((r) => r.road).join(', ') + (rs.length > 2 ? ' +' + (rs.length - 2) : '') : 'No roads yet — + adds one') : null,
        h('div', { class: 'nrow' }, b.total ? bar(b.pct, 'Progress ' + n.seg.title) : null, b.overdue ? h('span', { class: 'flag' }, '⚑ ' + b.overdue) : null,
          gb || b.blocked ? h('span', { class: 'fl fl-blk', title: 'Blocked items' }, '⛓' + (gb ? ' sec' : '') + (b.blocked ? ' ' + b.blocked : '')) : null,
          gu || b.update ? h('span', { class: 'fl fl-upd', title: 'Items needing update' }, '⟳' + (gu ? ' sec' : '') + (b.update ? ' ' + b.update : '')) : null,
          h('span', { class: 'avs' }, owners.slice(0, 3).map((o) => h('span', { class: 'av', title: o }, initials(o))))))];
    } else if (n.type === 'road') {
      const shs = n.kids.map((k) => k.sh), p = M.progress(shs), es = n.g.entries;
      const pp = es.reduce((a, r) => a + (M.hasSta(r) ? M.segPP(st, n.sub, r).total : 0), 0), len = es.reduce((a, r) => a + M.segLength(r), 0);
      const scales = [...new Set(es.map((r) => M.segScale(n.sub, r)))];
      const warns = M.rangeWarnings(st, n.sub, n.seg).filter((w) => shs.some((x) => x.id === w.sheet));
      body = [h('span', { class: 'rdicon', 'aria-hidden': 'true' }, '⛕'), h('div', { class: 'nb' }, h('div', { class: 'nt sm', title: n.g.name }, n.g.name),
        h('div', { class: 'ns' }, h('b', {}, pp + ' PP'), ' · ' + (len ? fmtFt(len) + ' · ' : '') + scales.map((x) => x + ' scale').join('/') + (es.length > 1 ? ' · ' + es.length + ' ranges' : '')),
        h('div', { class: 'ns rranges mono', title: es.map((r) => r.name).join('\n') }, es.map((r) => M.hasSta(r) ? M.formatStation(r.start) + '–' + M.formatStation(r.end) : 'no stations yet').join(', ')),
        h('div', { class: 'nrow' }, shs.length ? bar(p.pct, 'Progress ' + n.g.name) : h('span', { class: 'ns' }, 'No sheets yet'), warns.length ? h('span', { class: 'fl fl-upd', title: warns.map((w) => w.msg).join('\n') }, '⚠ ' + warns.length) : null)), ring(p.pct, 40)];
    } else if (n.type === 'oth') {
      const shs = n.kids.map((k) => k.sh), p = M.progress(shs);
      body = [h('div', { class: 'nb' }, h('div', { class: 'nt sm' }, 'Other sheets'), h('div', { class: 'ns' }, plural(shs.length, 'sheet') + ' · no road · ' + p.done + ' done'))];
    } else {
      const sh = n.sh;
      const od = M.isOverdue(sh, today);
      const ref = { t: 'sheet', id: sh.id };
      const blocked = sh.status === 'Done' ? 0 : M.blockers(st, ref).length;
      const upd = M.needsUpdate(st, ref).length;
      const nl = M.linksOf(st, ref);
      const road = M.sheetRoad(st, n.sub, sh);
      body = [h('span', { class: 'chip ' + DINFO[n.disc].cls, title: n.disc }, DINFO[n.disc].short),
        n.depth === 5 ? (() => { const rg = M.sheetRange(sh), sc = M.sheetScale(st, n.sub, sh);
          return h('div', { class: 'nb' }, h('div', { class: 'nt sm' + (rg ? ' sta' : ''), title: sh.title }, sh.gen ? 'PP ' + sh.gen.idx + ': ' + (rg ? 'STA ' + staTxt(rg) : 'no range') + (rg && rg.manual ? ' ✎' : '') : sh.title),
            h('div', { class: 'ns' }, h('span', { class: 'dot' }), sh.status + (sh.number ? ' · #' + sh.number : '') + (sh.gen ? '' : ' · ' + (rg ? 'STA ' + staTxt(rg) : 'no range')) + (sc ? ' · ' + sc + ' scale' : '') + (sh.due ? ' · ' + sh.due : '')),
            blocked || upd ? h('div', { class: 'nflags' }, blocked ? h('span', { class: 'fl fl-blk', title: 'Blocked by ' + blocked + ' unfinished prerequisite(s)' }, '⛓ Blocked by ' + blocked) : null,
              upd ? h('span', { class: 'fl fl-upd', title: 'An upstream item changed' }, '⟳ Update needed') : null) : null); })() :
        h('div', { class: 'nb' }, h('div', { class: 'nt sm' }, sh.title),
          h('div', { class: 'ns' }, h('span', { class: 'dot' }), sh.status + (sh.pct && sh.status !== 'Done' ? ' · ' + sh.pct + '%' : '') + (sh.due ? ' · ' + sh.due : '') + (sh.gen ? ' · PP' : road ? ' · ' + road : '')),
          blocked || upd ? h('div', { class: 'nflags' }, blocked ? h('span', { class: 'fl fl-blk', title: 'Blocked by ' + blocked + ' unfinished prerequisite(s)' }, '⛓ Blocked by ' + blocked) : null,
            upd ? h('span', { class: 'fl fl-upd', title: 'An upstream item changed' }, '⟳ Update needed') : null) : null),
        nl.in.length + nl.out.length ? h('span', { class: 'lkcount', title: nl.in.length + ' in, ' + nl.out.length + ' out' }, '↔' + (nl.in.length + nl.out.length)) : null,
        od ? h('span', { class: 'flag', title: 'Overdue' }, '⚑') : null,
        sh.owner ? h('span', { class: 'av', title: sh.owner }, initials(sh.owner)) : h('span', { class: 'av none', title: 'Unassigned' }, '–')];
    }
    const id = n.type === 'root' ? 'root' : n.type === 'dtop' ? n.disc : n.type === 'disc' ? n.sub.id + ':' + n.disc : n.type === 'seg' || n.type === 'oth' ? n.seg.id : n.type === 'road' ? n.g.entries[0].id : n.sh.id;
    const stype = n.type === 'oth' ? 'seg' : n.type;
    const selected = sel && ((n.type !== 'oth' && sel.type === n.type && sel.id === id) || (n.type === 'road' && sel.type === 'road' && n.g.entries.some((r) => r.id === sel.id)));
    const el = h('div', { class: 'node n-' + n.type + (n.pp ? ' n-pp' : '') + (n.collapsed && n.kids.length ? ' collapsed' : '') + (n.disc ? ' d-' + DINFO[n.disc].cls : '') + (n.type === 'sheet' ? ' st-' + slug(n.sh.status) : '') + (n.type === 'seg' && !n.seg.sheets.length && !(n.pp && M.roadsOf(n.sub, n.seg).length) ? ' empty' : '') + (m.dim ? ' dim' : '') + (m.hit ? ' hit' : '') + (selected ? ' sel' : ''),
      tabindex: 0, role: 'button', 'data-key': n.key, 'aria-label': nodeLabel(n),
      onclick: () => select_(stype, id),
      onmouseenter: () => hoverLinks(n.key, true), onmouseleave: () => hoverLinks(n.key, false),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select_(stype, id); }
        else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && n.kids.length && !e.altKey) { e.preventDefault(); e.stopPropagation(); if ((e.key === 'ArrowLeft') !== !!n.collapsed) toggleNode(n, e.key === 'ArrowLeft'); } } },
    body, h('div', { class: 'nacts' },
      n.type === 'disc' ? addBtn(n, 'Add a sheet to ' + M.subTag(n.sub) + ' ' + n.disc + ' (pick the section)', () => { select_('disc', id); focusAdd('qaTitle'); }) : null,
      n.type === 'seg' ? addBtn(n, n.pp ? 'Add a road to ' + M.subTag(n.sub) + ' · ' + n.seg.title + ' (road name only)' : 'Add a sheet to ' + M.subTag(n.sub) + ' · ' + n.seg.title, () => { ui.collapsed[n.key] = false; saveUI(); select_('seg', n.seg.id); focusAdd(n.pp ? 'addRoadName' : 'addSheetTitle'); }) : null,
      toggleBtn(n)),
    n.type === 'sheet' || n.type === 'seg' ? h('span', { class: 'handle', role: 'button', tabindex: -1, title: 'Drag onto another sheet or section: it will depend on this one', 'aria-label': 'Connector handle for ' + nodeLabel(n),
      onpointerdown: (e) => startLinkDrag(e, n, { t: n.type, id }), _link: { n, ref: { t: n.type, id } }, onclick: (e) => { e.stopPropagation(); select_(n.type, id); focusAdd('lkSearch'); } }) : null);
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
    return el;
  }
  function applyView() { $('#stage').style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')'; }
  /* Fit: whole tree on screen. readable=true (first view): fit width only, never below 0.55 zoom, top aligned. */
  function fit(readable) {
    const vp = $('#viewport').getBoundingClientRect();
    const w = Number($('#stage').dataset.w) + 60, hh = Number($('#stage').dataset.h) + 40;
    if (!vp.width) return;
    const kw = (vp.width - 40) / w, kh = (vp.height - 90) / hh;
    view.k = readable === true ? Math.max(0.55, Math.min(1, kw, kh)) : Math.max(0.15, Math.min(1.1, kw, kh));
    view.x = Math.max(20, (vp.width - w * view.k) / 2);
    if (hh * view.k <= vp.height - 90) view.y = Math.max(20, (vp.height - 70 - hh * view.k) / 2);
    else view.y = (vp.height - 70) / 2 - Number($('#stage').dataset.ry || 0) * view.k;
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
    openBranch(r.sub.id, r.seg.discipline, r.seg.id, sheetBranchKey(r.sub, r.seg, r.sh)); saveUI();
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

  /* ----- list (dense table) ----- */
  const secIndex = (r) => r.sub.segments.indexOf(r.seg);
  const COLS = [
    { k: 'sub', l: 'Sub', get: (r) => M.subTag(r.sub) },
    { k: 'discipline', l: 'Disc.', get: (r) => r.sh.discipline, edit: 'disc' },
    { k: 'section', l: 'Section', get: (r) => DISCS.indexOf(r.seg.discipline) * 1000 + secIndex(r), show: (r) => r.seg.title, edit: 'sec' },
    { k: 'road', l: 'Road', get: (r) => rowRoad(r), edit: 'road' },
    { k: 'number', l: 'No.', get: (r) => r.sh.number, edit: 'text' },
    { k: 'title', l: 'Sheet', get: (r) => r.sh.title, edit: 'text', wide: true },
    { k: 'series', l: 'Series', get: (r) => r.sh.series },
    { k: 'range', l: 'Station range', get: (r) => { const g = M.sheetRange(r.sh); return g ? g.start : -1; }, show: (r) => { const g = M.sheetRange(r.sh); return g ? M.formatStation(g.start) + '–' + M.formatStation(g.end) + (g.manual ? ' ✎' : '') : ''; } },
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
  const DEFAULT_COLS = ['sub', 'discipline', 'section', 'road', 'number', 'title', 'range', 'status', 'pct', 'owner', 'due', 'milestone', 'hoursBudget', 'hoursActual', 'qc', 'deps'];
  /* every section of one sub-project as select options (grouped label) */
  function secOpts(sub, disc) { return (disc ? M.sectionsOf(sub, disc) : DISCS.flatMap((d) => M.sectionsOf(sub, d))).map((g) => [g.id, (disc ? '' : DINFO[g.discipline].short + ' · ') + g.title]); }
  function secKeyOpts(disc) { return (disc ? [disc] : DISCS).flatMap((d) => M.secDefs(st, d).map((x) => [x.key, (disc ? '' : DINFO[d].short + ' · ') + x.title])); }
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
    if (c.edit === 'disc') { if (sh.gen) return h('span', {}, sh.discipline); const i = select(M.DISCIPLINES, sh.discipline, { 'aria-label': lab }); i.addEventListener('change', () => { commit(() => M.updateSheet(st, sh.id, { discipline: i.value })); }); return i; }
    if (c.edit === 'ms') { const i = select([['', '—']].concat(st.milestones.map((m) => [m.id, m.name])), sh.milestone, { 'aria-label': lab }); i.addEventListener('change', () => upd({ milestone: i.value })); return i; }
    if (c.edit === 'owner') { const i = select(ownerOpts(sh.owner), sh.owner, { 'aria-label': lab }); i.addEventListener('change', () => { onOwner(i, sh); refresh(); }); return i; }
    if (c.edit === 'sec') { if (sh.gen) return h('span', { title: 'Generated PP sheets stay in their section' }, r.seg.title); const i = select(secOpts(r.sub), r.seg.id, { 'aria-label': lab, class: 'c-sec' }); i.addEventListener('change', () => { commit(() => M.updateSheet(st, sh.id, { sec: i.value })); }); return i; }
    if (c.edit === 'road') { if (sh.gen) return h('span', {}, rowRoad(r)); const i = h('input', { value: sh.road || '', 'aria-label': lab, list: 'roadListL', class: 'c-road', autocomplete: 'off' }); i.addEventListener('change', () => upd({ road: i.value })); return i; }
    return null;
  }
  function renderList() {
    const cols = COLS.filter((c) => (ui.cols || DEFAULT_COLS).includes(c.k));
    const all = M.allSheets(st);
    let rows = M.filterRows(all, Object.assign({}, filt, { st }));
    const sc = COLS.find((c) => c.k === ui.sort.key) || COLS[0];
    rows = M.sortRows(rows, sc.k, ui.sort.dir, (r) => sc.get(r));
    const wrap = $('#listWrap');
    const refresh = () => { renderRail(); renderDrawer(); };
    const visIds = rows.map((r) => r.sh.id);
    const allOn = visIds.length && visIds.every((id) => msel.has(id));
    const thead = h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'selcol' }, h('input', { type: 'checkbox', id: 'selAll', 'aria-label': 'Select all shown sheets', checked: !!allOn, onchange: (e) => { visIds.forEach((id) => e.target.checked ? msel.add(id) : msel.delete(id)); renderList(); renderBulk(); } })), cols.map((c) => {
      const on = ui.sort.key === c.k;
      return h('th', { scope: 'col', class: c.wide ? 'wide' : '', 'aria-sort': on ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', { type: 'button', class: 'sort', onclick: () => { ui.sort = { key: c.k, dir: on && ui.sort.dir === 'asc' ? 'desc' : 'asc' }; saveUI(); renderList(); } }, c.l, on ? (ui.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''));
    })));
    if (ui.group) rows = rows.map((r, i) => ({ r, i })).sort((a, b) => DISCS.indexOf(a.r.seg.discipline) - DISCS.indexOf(b.r.seg.discipline) || M.subOrder(st, a.r.sub) - M.subOrder(st, b.r.sub) || secIndex(a.r) - secIndex(b.r) || a.i - b.i).map((x) => x.r);
    const grpRow = (r) => { const g = rows.filter((x) => x.seg === r.seg); const p = M.progress(g.map((x) => x.sh)); const d = r.seg.discipline;
      return h('tr', { class: 'grp ' + DINFO[d].cls }, h('th', { colspan: cols.length + 1, scope: 'rowgroup' }, h('span', { class: 'chip ' + DINFO[d].cls }, DINFO[d].short), ' ', h('span', { class: 'code' }, r.sub.code), ' ' + (M.subCustom(r.sub) ? M.subName(r.sub) + ' · ' : '') + r.seg.title + (M.isPPSec(r.seg) ? ' · ' + M.segPP(st, r.sub, r.seg).total + ' PP · roads: ' + (M.roadsOf(r.sub, r.seg).map((x) => x.road).join(', ') || 'none') : '') + ' — ' + plural(g.length, 'sheet') + ' · ' + Math.round(p.pct) + '%')); };
    const tbody = h('tbody', {}, rows.map((r, i) => [ui.group && (!i || rows[i - 1].seg !== r.seg) ? grpRow(r) : null, h('tr', { tabindex: 0, 'data-id': r.sh.id, class: (M.isOverdue(r.sh, M.todayISO()) ? 'od ' : '') + (msel.has(r.sh.id) ? 'msel ' : '') + (sel && sel.id === r.sh.id ? 'sel' : ''),
      onkeydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'TR') { e.preventDefault(); select_('sheet', r.sh.id); } } },
    h('td', { class: 'selcol' }, h('input', { type: 'checkbox', class: 'rsel', 'aria-label': 'Select ' + r.sh.title, checked: msel.has(r.sh.id), onclick: (e) => { e.stopPropagation(); pickSheet(r.sh.id, e.shiftKey ? 'range' : 'toggle', visIds); } })),
    cols.map((c, ci) => h('td', { class: c.wide ? 'wide' : '' , 'data-col': ci }, c.edit ? cellEditor(c, r, refresh) : c.k === 'title' ? null : (c.show ? c.show(r) : c.get(r))) ),
    )]));
    tbody.addEventListener('mousedown', (e) => { if (e.shiftKey && !e.target.closest('input,select,textarea')) e.preventDefault(); });
    tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (!tr || !tr.dataset.id || e.target.closest('input,select,button')) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { e.preventDefault(); pickSheet(tr.dataset.id, e.shiftKey ? 'range' : 'toggle', visIds); return; }
      select_('sheet', tr.dataset.id); });
    tbody.addEventListener('keydown', (e) => {
      if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const t = e.target;
      if (t.tagName === 'SELECT' && !e.altKey) return; /* native select keys; Alt+Arrow moves rows */
      const tr = t.closest('tr'); const td = t.closest('td');
      let next = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
      while (next && next.classList.contains('grp')) next = e.key === 'ArrowDown' ? next.nextElementSibling : next.previousElementSibling;
      if (!next) return;
      e.preventDefault();
      const target = td && t !== tr ? (next.querySelector('td[data-col="' + td.dataset.col + '"]') || next.children[0]).querySelector('input,select') : next;
      (target || next).focus();
    });
    const views = select([['', 'Saved views…']].concat(st.views.map((v) => [v.id, v.name])), '', { 'aria-label': 'Saved views' });
    views.addEventListener('change', () => { const v = st.views.find((x) => x.id === views.value); if (v) { Object.assign(filt, { status: '', owner: '', discipline: '', q: '', sub: '', milestone: '', kind: '', when: '', section: '' }, v.filt); if (v.sort) ui.sort = v.sort; $('#q').value = filt.q; renderAll(); } });
    const fsel = (k, opts, lab) => { const e = select(opts, filt[k], { 'aria-label': lab, 'data-f': k }); e.addEventListener('change', () => { filt[k] = e.value; if (k === 'discipline') { const sd = filt.section && M.secDef(st, filt.section); if (filt.discipline && sd && sd.discipline !== filt.discipline) filt.section = ''; renderAll(); } else renderList(); }); return e; };
    wrap.replaceChildren(...[
      h('div', { class: 'listbar' },
        fsel('sub', [['', 'All sub-projects']].concat(st.subs.map((x) => [x.id, M.subLabel(x)])), 'Sub-project'),
        fsel('discipline', [['', 'Drainage + SWP3'], ['Drainage', 'Drainage only'], ['SWP3', 'SWP3 only']], 'Discipline'),
        (() => { const g = select([['', 'No grouping'], ['subdisc', 'Group: discipline › sub-project › section']], ui.group, { 'aria-label': 'Grouping', id: 'groupSel' }); g.addEventListener('change', () => { ui.group = g.value; saveUI(); renderList(); }); return g; })(),
        fsel('section', [['', 'All sections']].concat(secKeyOpts(filt.discipline || null)), 'Section'),
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
      rows.length ? null : h('p', { class: 'muted pad' }, all.length ? 'No sheets match the filters.' : 'No sheets yet. In the tree, open a section and press + (or use + Standard sheets on a branch).'), h('datalist', { id: 'roadListL' }, M.roads(st).map((x) => h('option', { value: x })))].filter(Boolean));
  }

  /* ----- drawer ----- */
  function select_(type, id) {
    sel = { type, id };
    renderDrawer();
    document.querySelectorAll('.node.sel, .grid tr.sel, .tl-seg.sel').forEach((e) => e.classList.remove('sel'));
    let key = type === 'root' ? 'root' : type + ':' + id;
    if (type === 'road') { const r = M.findRoad(st, id); if (r && r.sec) key = roadBranchKey(r); }
    document.querySelectorAll(keyQuery(key)).forEach((n) => n.classList.add('sel'));
    if (impactKey && impactKey !== type + ':' + id) impactKey = null;
    if (ui.view === 'tree' && lastNodes.length) drawLinks(lastNodes, Number($('#stage').dataset.w), Number($('#stage').dataset.h));
    const tr = document.querySelector('.grid tr[data-id="' + id + '"]'); if (tr) tr.classList.add('sel');
  }
  function closeDrawer() { sel = null; impactKey = null; renderDrawer(); if (lastNodes.length && ui.view === 'tree') drawLinks(lastNodes, Number($('#stage').dataset.w), Number($('#stage').dataset.h)); document.querySelectorAll('.sel').forEach((e) => e.classList.remove('sel')); }
  const DKIND = { root: 'Project', dtop: 'Discipline', sub: 'Sub-project', disc: 'Sub-project branch', seg: 'Section', road: 'Road entry', sheet: 'Sheet' };
  function renderDrawer() {
    const d = $('#drawer');
    let content = null;
    if (sel) {
      if (sel.type === 'root') content = rootDrawer();
      else if (sel.type === 'dtop') content = DISCS.includes(sel.id) && dtopDrawer(sel.id);
      else if (sel.type === 'sub') { const sub = M.findSub(st, sel.id); content = sub && subDrawer(sub); }
      else if (sel.type === 'seg') { const hit = M.findSeg(st, sel.id); content = hit && segDrawer(hit); }
      else if (sel.type === 'road') { const hit = M.findRoad(st, sel.id); content = hit && hit.sec && roadDrawer(hit); }
      else if (sel.type === 'disc') { const [sid, dd] = sel.id.split(':'); const sub = M.findSub(st, sid); content = sub && DISCS.includes(dd) && discDrawer(sub, dd); }
      else if (sel.type === 'sheet') { const hit = M.findSheet(st, sel.id); content = hit && sheetDrawer(hit); }
    }
    if (!content) { sel = null; d.hidden = true; $('#layout').classList.remove('drawer-open'); d.replaceChildren(); return; }
    const scroll = d.scrollTop;
    const had = !d.hidden;
    d.hidden = false; $('#layout').classList.add('drawer-open');
    d.replaceChildren(h('div', { class: 'dhead' }, h('span', { class: 'dkind' }, DKIND[sel.type]),
      sel.type !== 'root' ? h('button', { type: 'button', class: 'btn sec sm', id: 'focusBranch', title: 'Collapse all other branches and keep this one open', onclick: focusSel }, '◎ Focus branch') : null,
      h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Close details', onclick: closeDrawer }, '×')), content);
    if (had) d.scrollTop = scroll;
  }
  function crumb(parts) { return h('p', { class: 'crumb' }, parts.map(([label, fn], i) => [i ? ' › ' : '', fn ? h('button', { type: 'button', class: 'link', onclick: fn }, label) : h('span', {}, label)])); }
  const toDisc = (sub, d) => () => { openBranch(sub.id, d); saveUI(); renderTree(); select_('disc', sub.id + ':' + d); };
  const toSeg = (seg) => () => select_('seg', seg.id);
  function rootDrawer() {
    const n = h('input', { value: st.project.name, 'aria-label': 'Project name' });
    n.addEventListener('change', () => commit(() => { st.project.name = n.value.trim() || st.project.name; }));
    const PP = M.ppSummary(st);
    return h('div', { class: 'dbody' }, h('h2', {}, st.project.name), field('Project name', n),
      h('p', { class: 'muted' }, M.allSheets(st).length + ' sheets · ' + PP.total + ' PP sheets from ' + plural(M.allRoads(st).length, 'road entry') + ' · ' + fmtFt(PP.length) + ' of road'),
      h('h3', {}, 'Disciplines'),
      h('ul', { class: 'dlist' }, DISCS.map((d) => { const b = M.discStats(st, d); return h('li', {}, h('button', { type: 'button', class: 'rowbtn', onclick: () => select_('dtop', d) }, h('span', { class: 'chip ' + DINFO[d].cls }, DINFO[d].short), h('span', { class: 'grow' }, ' ' + d + ' · ' + b.total + ' sh · ' + Math.round(b.pct) + '%'), h('b', {}, b.pp + ' PP'))); })),
      h('h3', {}, 'Sub-projects'),
      h('ul', { class: 'dlist' }, M.orderedSubs(st).map((sub) => h('li', {}, h('button', { type: 'button', class: 'rowbtn', onclick: () => select_('sub', sub.id) }, h('span', { class: 'code' }, sub.code), h('span', { class: 'grow' }, ' ' + M.subName(sub)), h('b', {}, M.ppSummary(st).bySub.find((b) => b.sub === sub).total + ' PP'))))),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec', onclick: openPP }, 'PP sheet calculator'), h('button', { type: 'button', class: 'btn sec', onclick: () => openSettings('secs') }, 'Edit section lists')));
  }
  /* PP line for a section (sum of its roads) or one road entry */
  function ppLine(sub, x) {
    const p = M.segPP(st, sub, x);
    if (x.kind === 'section') { const rs = p.roads || []; return h('span', {}, rs.length ? [plural(rs.length, 'road') + ' · ' + fmtFt(p.length) + ' → ', h('b', {}, p.total + ' PP')] : 'No road entries yet'); }
    if (!M.hasSta(x)) return h('span', { class: 'muted' }, 'No stations yet — PP is counted once start and end are entered.');
    const s0 = p.series[0];
    return h('span', {}, fmtFt(p.length) + ' at ' + s0.scale + ' scale (' + s0.ft + ' ft/sheet) = ', h('b', {}, p.total + ' PP'));
  }
  function dtopDrawer(d) {
    const b = M.discStats(st, d), I = DINFO[d];
    const defs = M.secDefs(st, d);
    return h('div', { class: 'dbody' },
      h('h2', {}, h('span', { class: 'dicon ' + I.cls }, I.icon), ' ' + d),
      h('div', { class: 'statrow' }, ring(b.pct, 54), h('div', {}, h('div', {}, plural(b.total, 'sheet') + ' · ' + b.done + ' done'), h('div', {}, h('b', {}, b.pp + ' PP sheets'), ' from ' + plural(b.roads, 'road entry')),
        h('div', {}, [b.overdue ? '⚑ ' + b.overdue + ' overdue' : '', b.blocked ? '⛓ ' + b.blocked + ' blocked' : '', b.update ? '⟳ ' + b.update + ' need update' : ''].filter(Boolean).join(' · ')))),
      h('h3', {}, 'Sub-projects'),
      h('ul', { class: 'dlist' }, M.orderedSubs(st).map((sub) => { const x = M.branchStats(st, sub, d); return h('li', {}, h('button', { type: 'button', class: 'rowbtn', onclick: toDisc(sub, d) }, h('span', { class: 'code' }, sub.code), h('span', { class: 'grow' }, ' ' + M.subName(sub) + ' · ' + x.total + ' sh · ' + Math.round(x.pct) + '%'), h('b', {}, x.pp + ' PP'))); })),
      h('h3', {}, 'Sections (A–D combined)'),
      h('div', { class: 'tablewrap' }, h('table', { class: 'grid compact', id: 'dtopSecs' }, h('thead', {}, h('tr', {}, ['Section', 'Sheets', 'Done', 'PP', 'Roads'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, defs.map((def) => { const xs = st.subs.map((sub) => M.secOf(sub, def.key)).filter(Boolean); const sh = xs.flatMap((g) => g.sheets);
          return h('tr', {}, h('th', { scope: 'row' }, def.title), h('td', {}, String(sh.length)), h('td', {}, String(sh.filter((q) => q.status === 'Done').length)),
            h('td', {}, def.series ? String(xs.reduce((a, g) => a + M.segPP(st, M.findSeg(st, g.id).sub, g).total, 0)) : '—'), h('td', {}, def.series ? String(st.subs.reduce((a, sub) => a + M.roadsOf(sub, M.secOf(sub, def.key)).length, 0)) : '—')); })))),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sec', id: 'stdAll', onclick: () => { const n = commit(() => st.subs.reduce((a, s) => a + M.addStandardSet(st, s.id, { discipline: d }).length, 0)); toast(n ? 'Added ' + plural(n, 'standard sheet') + ' to A–D ' + d + '.' : 'Every ' + d + ' section already has its standard sheet.'); } }, '+ Standard ' + d + ' sheets for A–D'),
        h('button', { type: 'button', class: 'btn sec', onclick: () => genAll(d) }, 'Generate ' + d + ' PP for A–D'),
        h('button', { type: 'button', class: 'btn sec', onclick: () => openSettings('secs') }, 'Edit ' + d + ' sections')));
  }
  /* v3.1: rename a sub-project (display name only; id, letter and build order unchanged). Enter saves, Esc cancels. */
  function subNameEditor(sub, opts) {
    opts = opts || {};
    const inp = h('input', { value: M.subName(sub), maxlength: 60, class: 'subname-in' + (opts.cls ? ' ' + opts.cls : ''), 'aria-label': 'Name of sub-project ' + sub.code, spellcheck: 'false' });
    const err = h('span', { class: 'err small subname-err', role: 'alert' });
    let done = false;
    const check = () => { const c = M.checkSubName(st, sub.id, inp.value); err.textContent = c.ok ? '' : c.error; inp.toggleAttribute('aria-invalid', !c.ok); return c; };
    const save = () => {
      if (done) return true;
      const c = check(); if (!c.ok) { inp.focus(); return false; }
      done = true;
      if (c.name !== M.subName(sub)) { const old = M.subName(sub); commit(() => M.renameSub(st, sub.id, c.name)); toast('Renamed ' + old + ' → ' + c.name + '. Undo with Ctrl+Z.'); }
      else if (opts.onCancel) opts.onCancel();
      return true;
    };
    const cancel = () => { done = true; inp.value = M.subName(sub); err.textContent = ''; inp.removeAttribute('aria-invalid'); if (opts.onCancel) opts.onCancel(); };
    inp.addEventListener('focus', () => { done = false; });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); if (opts.blurOnCancel) inp.blur(); } });
    inp.addEventListener('input', check);
    inp.addEventListener('blur', () => { if (!done && !save()) cancel(); });
    ['click', 'dblclick', 'pointerdown'].forEach((t) => inp.addEventListener(t, (e) => e.stopPropagation()));
    return { inp, err, el: h('span', { class: 'subname-ed' }, inp, err) };
  }
  function startTreeRename(nt, sub) {
    const ed = subNameEditor(sub, { onCancel: () => renderTree() });
    nt.replaceChildren(ed.el); nt.classList.add('editing'); ed.inp.focus(); ed.inp.select();
  }
  function subDrawer(sub) {
    const ned = subNameEditor(sub, { blurOnCancel: true }); ned.inp.id = 'subName';
    const name = ned.el;
    const sp = scalePicker(sub.scale, null, (v) => { if (v) commit(() => { sub.scale = v; M.log(st, M.subTag(sub) + ' default scale → ' + v); }); });
    const pp = M.ppSummary(st).bySub.find((b) => b.sub === sub);
    const p = M.progress(sub.segments.flatMap((g) => g.sheets));
    return h('div', { class: 'dbody' },
      h('h2', {}, h('span', { class: 'code' }, sub.code), ' ', M.subName(sub)),
      h('div', { class: 'statrow' }, ring(p.pct, 54), h('div', {}, h('div', {}, plural(sub.roads.length, 'road entry') + ' · ' + fmtFt(pp.length)), h('div', {}, h('b', {}, pp.total + ' PP sheets'), ' at current scales'))),
      field('Name', name, 'Shown everywhere instead of “Sub-project ' + sub.code + '”. The letter ' + sub.code + ' and the build order stay the same. Enter saves, Esc cancels.'), field('Default plan scale for road entries', sp, 'Road entries use this unless they set their own scale.'),
      h('h3', {}, 'Branches'),
      h('ul', { class: 'dlist' }, DISCS.map((d) => { const b = M.branchStats(st, sub, d); return h('li', {}, h('button', { type: 'button', class: 'rowbtn', onclick: toDisc(sub, d) }, h('span', { class: 'chip ' + DINFO[d].cls }, DINFO[d].short), h('span', { class: 'grow' }, ' ' + M.subTag(sub) + ' · ' + d + ' · ' + b.total + ' sh · ' + Math.round(b.pct) + '%'), h('b', {}, b.pp + ' PP'))); })),
      h('details', { class: 'tpls' }, h('summary', {}, 'Standard (non-PP) sheet set for ' + M.subTag(sub) + ' (' + sub.templates.length + ')'),
        h('p', { class: 'muted small' }, '“+ Standard sheets” adds each of these to its section (skipping titles the section already has).'),
        h('ul', { class: 'dlist' }, sub.templates.map((t) => {
          const ti = h('input', { value: t.title, 'aria-label': 'Template title' }); ti.addEventListener('change', () => commit(() => M.updateTemplate(st, sub.id, t.id, { title: ti.value })));
          const si = select(secKeyOpts(), t.sec || '', { 'aria-label': 'Template section' }); si.addEventListener('change', () => commit(() => M.updateTemplate(st, sub.id, t.id, { sec: si.value })));
          return h('li', { class: 'tplrow' }, ti, si,
            h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Duplicate template ' + t.title, onclick: () => commit(() => M.duplicateTemplate(st, sub.id, t.id)) }, '⧉'),
            h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Delete template ' + t.title, onclick: () => commit(() => M.deleteTemplate(st, sub.id, t.id)) }, '×'));
        })),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sec sm', onclick: () => commit(() => M.addTemplate(st, sub.id, { title: 'New sheet', sec: 'dr-std' })) }, '+ Template'),
          h('button', { type: 'button', class: 'btn sec sm', onclick: () => { if (confirm('Reset ' + M.subTag(sub) + ' templates to defaults?')) commit(() => M.resetTemplates(st, sub.id)); } }, 'Reset defaults'),
          h('button', { type: 'button', class: 'btn sm', id: 'subStd', onclick: () => { const a = commit(() => M.addStandardSet(st, sub.id)) || []; toast(a.length ? 'Added ' + plural(a.length, 'sheet') + ' to ' + M.subTag(sub) + '.' : 'Every section already has these sheets.'); } }, '+ Standard sheets for ' + sub.code))));
  }
  /* generate PP sheets: one road entry, one section, or a whole discipline */
  function askTouched(pl) { return pl.removeTouched.length ? confirm(pl.removeTouched.length + ' generated PP sheet(s) beyond the new count have your edits (status, owner, notes…):\n\n' + pl.removeTouched.map((x) => '• ' + x.title).join('\n') + '\n\nOK = delete them too. Cancel = keep them.') : false; }
  function genRoad(road) {
    const pl = M.planGenerate(st, road.id), rm = askTouched(pl);
    const r = commit(() => M.applyGenerate(st, road.id, pl, { removeTouched: rm }));
    const hit = M.findRoad(st, road.id); if (hit) setSeg(hit.sec.id, false); saveUI(); renderAll();
    if (r) toast('PP sheets for ' + road.name + ': ' + r.created + ' new, ' + r.updated + ' updated, ' + r.removed + ' removed' + (r.keptTouched ? ', ' + r.keptTouched + ' edited kept' : '') + '.');
    return r;
  }
  function genSection(sec) {
    const P = M.planSection(st, sec.id);
    if (!M.pendingCount(P)) { toast(sec.title + ': PP sheets already up to date.'); return null; }
    const rm = askTouched(P);
    const r = commit(() => M.generateSection(st, sec.id, { removeTouched: rm }));
    setSeg(sec.id, false); saveUI(); renderAll();
    if (r) toast(sec.title + ' PP sheets: ' + r.created + ' new, ' + r.updated + ' updated, ' + r.removed + ' removed' + (r.keptTouched ? ', ' + r.keptTouched + ' edited kept' : '') + '.');
    return r;
  }
  function genAll(d, subs) {
    const secs = (subs || st.subs).flatMap((sub) => M.sectionsOf(sub, d).filter(M.isPPSec));
    const plans = secs.map((g) => M.planSection(st, g.id)).filter((P) => M.pendingCount(P));
    if (!plans.length) { toast(d + ' PP sheets already up to date.'); return; }
    const touched = plans.flatMap((P) => P.removeTouched);
    const rm = touched.length ? confirm(touched.length + ' generated PP sheet(s) beyond the new count have your edits.\n\nOK = delete them too. Cancel = keep them.') : false;
    const tot = commit(() => secs.reduce((a, g) => { const r = M.generateSection(st, g.id, { removeTouched: rm }); a.created += r.created; a.updated += r.updated; a.removed += r.removed; return a; }, { created: 0, updated: 0, removed: 0 }));
    if (tot) toast(d + ' PP sheets: ' + tot.created + ' new, ' + tot.updated + ' updated, ' + tot.removed + ' removed.');
  }
  function discDrawer(sub, d) {
    const b = M.branchStats(st, sub, d);
    const secs = M.sectionsOf(sub, d);
    const qt = h('input', { id: 'qaTitle', placeholder: 'Sheet title', 'aria-label': 'New sheet title', list: 'qaList', autocomplete: 'off' });
    const qs = select([['', 'Section: pick from the title']].concat(secOpts(sub, d)), '', { id: 'qaSec', 'aria-label': 'Section for the new sheet' });
    const hint = h('small', { class: 'muted', id: 'qaHint' });
    const guess = () => { const k = M.mapSection(st, qt.value || '', d), def = M.secDef(st, k); hint.textContent = qt.value.trim() ? (qs.value ? '' : '→ goes to ' + (def ? def.title : (d === 'SWP3' ? 'Other SWP3' : 'Other Drainage'))) : ''; };
    qt.addEventListener('input', guess); qs.addEventListener('change', guess);
    return h('div', { class: 'dbody' },
      crumb([[d, () => select_('dtop', d)], [M.subLabel(sub), () => select_('sub', sub.id)]]),
      h('h2', {}, h('span', { class: 'dicon ' + DINFO[d].cls }, DINFO[d].icon), ' ' + M.subTag(sub) + ' · ' + d),
      h('div', { class: 'statrow' }, ring(b.pct, 54), h('div', {}, h('div', {}, plural(b.total, 'sheet') + ' · ' + b.done + ' done'), h('div', {}, h('b', {}, b.pp + ' PP sheets'), ' from ' + plural(b.roads, 'road entry')),
        h('div', {}, [b.overdue ? '⚑ ' + b.overdue + ' overdue' : '', b.blocked ? '⛓ ' + b.blocked + ' blocked' : '', b.update ? '⟳ ' + b.update + ' need update' : ''].filter(Boolean).join(' · ')))),
      h('section', { class: 'box' }, h('h3', {}, 'Quick add sheet'),
        h('form', { class: 'stack', id: 'qaForm', onsubmit: (e) => { e.preventDefault(); const t = qt.value.trim(); if (!t) return;
          let secId = qs.value; if (!secId) { const k = M.mapSection(st, t, d); const x = commit(() => { M.ensureSection(st, k); return M.addSheet(st, M.secOf(sub, k).id, { title: t }); }); if (x) done(x); return; }
          const x = commit(() => M.addSheet(st, secId, { title: t })); if (x) done(x);
          function done(x) { const hit = M.findSheet(st, x.id); setSeg(hit.seg.id, false); openBranch(sub.id, d); saveUI(); renderAll(); toast('Added “' + x.title + '” to ' + hit.seg.title + '.'); const i = $('#qaTitle'); if (i) i.focus(); } } },
          h('div', { class: 'addrow' }, qt, h('button', { class: 'btn', type: 'submit' }, 'Add')), qs, hint,
          h('datalist', { id: 'qaList' }, sub.templates.filter((t) => (M.secDef(st, t.sec) || {}).discipline === d).map((t) => h('option', { value: t.title }))))),
      h('h3', {}, 'Sections'),
      h('ul', { class: 'dlist secs' }, secs.map((g) => { const x = M.branchStats(st, sub, d, g); const pp = M.isPPSec(g);
        return h('li', {}, h('button', { type: 'button', class: 'rowbtn' + (x.total || x.roads ? '' : ' empty'), onclick: () => { setSeg(g.id, false); saveUI(); renderTree(); select_('seg', g.id); } },
          h('span', { class: 'grow' }, g.title), h('span', { class: 'muted small' }, x.total ? x.done + '/' + x.total + ' sh' : pp ? '' : '—'), pp ? h('b', {}, ' ' + x.pp + ' PP · ' + plural(x.roads, 'road')) : null)); })),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sec', id: 'discStd', onclick: () => { const a = commit(() => M.addStandardSet(st, sub.id, { discipline: d })) || []; toast(a.length ? 'Added ' + plural(a.length, 'standard sheet') + ' (one per section).' : 'Every section already has its standard sheet.'); } }, '+ Standard ' + d + ' sheets'),
        h('button', { type: 'button', class: 'btn sec', id: 'genBranchBtn', onclick: () => genAll(d, [sub]) }, 'Generate ' + d + ' PP')));
  }
  /* road entries of a P&P section: one row each, inline road / start / end / scale editing */
  function roadTable(sub, sec, only) {
    const rs = M.roadsOf(sub, sec).filter((r) => !only || only.includes(r));
    const save1 = (road, k, v, inp) => { const r = commit(() => M.applyStationRows(st, [{ roadId: road.id, [k]: v }])); if (!r && inp) inp.classList.add('numbad'); else if (r && r.warns.length) toast('⚠ ' + r.warns[0]); };
    const cell = (road, k) => {
      const v = k === 'road' ? road.road : k === 'scale' ? (road.scale == null ? '' : road.scale) : M.formatStation(road[k]);
      const inp = h('input', { class: 'scell' + (k !== 'road' ? ' mono' : ''), value: String(v), 'aria-label': road.road + ' ' + k, placeholder: k === 'scale' ? String(sub.scale) : k === 'road' ? '' : k === 'start' ? '10+00' : '25+50', 'data-k': k });
      inp.addEventListener('change', () => { const val = inp.value.trim(); if (k === 'road' && !val) { inp.value = String(v); return; } if ((k === 'start' || k === 'end') && val && !Number.isFinite(M.parseStation(val))) { inp.classList.add('numbad'); toast('Station must look like 10+00, 1000 or 10+00.50'); return; }
        if (k === 'start' || k === 'end') { /* both stations or neither: wait for the other one */
          const tr = inp.closest('tr'), o = tr.querySelector('input[data-k="' + (k === 'start' ? 'end' : 'start') + '"]').value.trim();
          if (!!val !== !!o) { inp.classList.remove('numbad'); toast('Now enter the ' + (k === 'start' ? 'end' : 'start') + ' station.'); return; }
          const r = commit(() => M.applyStationRows(st, [{ roadId: road.id, start: k === 'start' ? val : o, end: k === 'end' ? val : o }])); if (!r) inp.classList.add('numbad'); else if (r.warns.length) toast('⚠ ' + r.warns[0]); return;
        }
        save1(road, k, k === 'scale' && !val ? '' : val, inp); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.dispatchEvent(new Event('change')); } });
      return h('td', {}, inp);
    };
    return rs.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'grid compact roadtab', id: 'roadTable' },
      h('thead', {}, h('tr', {}, ['Road', 'Start', 'End', 'Scale', 'PP', ''].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rs.map((road) => { const p = M.segPP(st, sub, road); const pend = M.pendingCount(M.planGenerate(st, road.id));
        return h('tr', { 'data-road': road.id }, cell(road, 'road'), cell(road, 'start'), cell(road, 'end'), cell(road, 'scale'),
          h('td', {}, M.hasSta(road) ? h('b', {}, String(p.total)) : h('span', { class: 'muted', title: 'Enter stations to count PP sheets' }, '—'), pend && M.hasSta(road) ? h('span', { class: 'warn', title: 'PP sheets not generated / out of date' }, ' ⟳') : null),
          h('td', {}, h('button', { type: 'button', class: 'link', 'aria-label': 'Open road ' + road.name, onclick: () => select_('road', road.id) }, 'Open'))); })),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', colspan: 4 }, 'Section total'), h('td', { id: 'secPP' }, h('b', {}, String(M.segPP(st, sub, sec).total))), h('td', {}))))) : h('p', { class: 'muted' }, 'No road entries yet.');
  }
  function addRoadForm(sub, sec) {
    const nm = h('input', { id: 'addRoadName', placeholder: 'Road name, e.g. FM 1960', 'aria-label': 'Road name', list: 'roadList', autocomplete: 'off', value: '' });
    const a = h('input', { id: 'addRoadStart', class: 'mono', placeholder: 'Start (optional)', 'aria-label': 'Start station (optional)', autocomplete: 'off' });
    const b = h('input', { id: 'addRoadEnd', class: 'mono', placeholder: 'End (optional)', 'aria-label': 'End station (optional)', autocomplete: 'off' });
    const msg = h('p', { class: 'err', role: 'alert' });
    let chain = false;
    return h('form', { class: 'stack', id: 'addRoadForm', onkeydown: (e) => { if (e.key === 'Enter' && e.shiftKey && e.target.tagName === 'INPUT') { e.preventDefault(); chain = true; e.currentTarget.requestSubmit(); } }, onsubmit: (e) => {
      e.preventDefault(); msg.textContent = '';
      try {
        const r = M.addRoad(st, sec.id, { road: nm.value, start: a.value, end: b.value });
        ui.lastRoad = r.road.road; saveUI(); hardEdit = true; save(); setSeg(sec.id, false);
        toast('Road added to ' + sec.title + ': ' + r.road.name + (r.warns.length ? ' · ⚠ ' + r.warns.join(' ') : '') + (M.hasSta(r.road) ? ' · ' + M.segPP(st, sub, r.road).total + ' PP' : ' · add stations when you have them'));
        renderAll();
        if (chain) { chain = false; setTimeout(() => { const s1 = $('#addRoadStart'), n1 = $('#addRoadName'); if (n1) n1.value = r.road.road; if (s1 && M.hasSta(r.road)) { s1.value = M.formatStation(r.road.end); $('#addRoadEnd').focus(); } else if (n1) { n1.value = ''; n1.focus(); } }, 30); }
        else setTimeout(() => { const n1 = $('#addRoadName'); if (n1) n1.focus(); }, 30);
      } catch (ex) { msg.textContent = ex.message; }
    } }, h('div', { class: 'addrow' }, nm, h('button', { class: 'btn', type: 'submit', id: 'addRoadBtn' }, 'Add road')),
      h('details', { class: 'small' }, h('summary', {}, 'Stations now (optional)'), h('div', { class: 'g2' }, a, b)),
      h('datalist', { id: 'roadList' }, M.roads(st).map((r) => h('option', { value: r }))), msg,
      h('small', { class: 'muted' }, 'Only the road name is needed. Shift+Enter adds and starts the next one.'));
  }
  function segDrawer({ sub, seg }) {
    const d = seg.discipline, pp = M.isPPSec(seg);
    const p = M.progress(seg.sheets);
    const bo = select([['', 'Owner: none']].concat(st.staff.map((x) => x.name)), '', { 'aria-label': 'Owner for added sheets' });
    const bm = select([['', 'Milestone: none']].concat(st.milestones.map((m) => [m.id, m.name])), '', { 'aria-label': 'Milestone for added sheets' });
    const bdue = h('input', { type: 'date', 'aria-label': 'Due date for added sheets' });
    const nt = h('input', { id: 'addSheetTitle', placeholder: 'Sheet title', 'aria-label': 'New sheet title', list: 'tplList' });
    const nr = h('input', { id: 'addSheetRoad', placeholder: 'Road (optional tag)', 'aria-label': 'Road tag for the new sheet', list: 'roadList3', autocomplete: 'off' });
    const tpls = sub.templates.filter((t) => t.sec === seg.key);
    const P = pp ? M.planSection(st, seg.id) : null, pending = P ? M.pendingCount(P) : 0;
    return h('div', { class: 'dbody' },
      crumb([[d, () => select_('dtop', d)], [M.subLabel(sub), toDisc(sub, d)]]),
      h('h2', {}, seg.title),
      h('div', { class: 'statrow' }, ring(p.pct, 54), h('div', {}, h('div', {}, plural(seg.sheets.length, 'sheet') + ' · ' + p.done + ' done'), pp ? h('div', { id: 'secPPLine' }, ppLine(sub, seg)) : null)),
      pp ? h('section', { class: 'box', id: 'roadsBox' }, h('h3', {}, 'Roads in this section'),
        h('p', { class: 'muted small' }, 'PP sheets = ceil(length ÷ feet per sheet): 20 scale = 240 ft, 40 = 480, 50 = 600, 100 = 1,200 ft per sheet. Edit the cells directly.'),
        roadTable(sub, seg), addRoadForm(sub, seg),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', id: 'genBtn', disabled: !pending, onclick: () => genSection(seg) }, pending ? 'Generate PP sheets (' + pending + ' change' + (pending === 1 ? '' : 's') + ')' : 'PP sheets up to date ✓'))) : null,
      h('section', { class: 'box' }, h('h3', {}, pp ? 'Other sheets in this section' : 'Add sheets'),
        h('form', { class: 'addrow', id: 'addSheetForm', onsubmit: (e) => { e.preventDefault(); if (!nt.value.trim()) return; const shx = commit(() => M.addSheet(st, seg.id, { title: nt.value, road: nr.value })); setSeg(seg.id, false); saveUI(); renderAll(); if (shx) { toast('Added “' + shx.title + '”.'); const i = $('#addSheetTitle'); if (i) i.focus(); } } },
          nt, nr, h('button', { class: 'btn', type: 'submit' }, 'Add')),
        h('datalist', { id: 'tplList' }, tpls.concat(st.index.filter((t) => t.sec === seg.key)).map((t) => h('option', { value: t.title }))),
        h('datalist', { id: 'roadList3' }, M.roads(st).map((r) => h('option', { value: r }))),
        tpls.length ? h('form', { class: 'g2', onsubmit: (e) => { e.preventDefault(); const a = commit(() => M.bulkAddTemplates(st, seg.id, { owner: bo.value, due: bdue.value, milestone: bm.value })) || []; toast(a.length ? 'Added ' + plural(a.length, 'standard sheet') + '.' : 'The standard sheets are already here.'); } },
          bo, bm, bdue, h('button', { class: 'btn sec', type: 'submit', id: 'secStd' }, '+ Standard: ' + tpls.map((t) => t.title).join(', '))) : null),
      connectorsBox({ t: 'seg', id: seg.id }),
      h('h3', {}, 'Sheets (' + seg.sheets.length + ')'),
      seg.sheets.length ? h('ul', { class: 'dlist' }, seg.sheets.map((sh) => h('li', {}, h('button', { type: 'button', class: 'rowbtn st-' + slug(sh.status), onclick: () => select_('sheet', sh.id) },
        h('span', { class: 'grow' }, sh.title), M.sheetRoad(st, sub, sh) && !sh.gen ? h('span', { class: 'muted small' }, M.sheetRoad(st, sub, sh) + ' ') : null, h('span', { class: 'stpill' }, sh.status))))) : h('p', { class: 'muted' }, 'No sheets yet.'));
  }
  /* v2.12 stations editor (on a road entry): inline start/end, live validation/length/PP, regenerate preview + confirm, shift, reverse */
  function planText(pv) {
    const P = pv.plan, L = [];
    if (P.create.length) L.push('Create ' + P.create.length + ': ' + P.create.join('; '));
    if (P.update.length) L.push('Update ' + P.update.length + ': ' + P.update.join('; '));
    if (P.remove.length) L.push('Remove ' + P.remove.length + ' (unedited): ' + P.remove.join('; '));
    if (P.keep.length) L.push('Keep ' + P.keep.length + ' extra edited sheet(s): ' + P.keep.join('; '));
    return L;
  }
  function stationsBox(sub, seg) {
    const road = h('input', { id: 'stRoad', value: seg.road, list: 'roadList2', autocomplete: 'off' });
    const a = h('input', { id: 'stStart', class: 'mono', value: M.formatStation(seg.start), autocomplete: 'off', placeholder: '10+00 or 1000' });
    const b = h('input', { id: 'stEnd', class: 'mono', value: M.formatStation(seg.end), autocomplete: 'off', placeholder: '25+50' });
    const rev = h('input', { type: 'checkbox', id: 'stRev', checked: !!seg.reverse });
    const sp = scalePicker(seg.scale, 'Sub-project default (' + sub.scale + ' scale)', upd);
    const live = h('div', { class: 'live', id: 'stLive', 'aria-live': 'polite' }), warn = h('div', { id: 'stWarn' }), btn = h('button', { class: 'btn', type: 'submit', id: 'stSave' }, 'Save stations');
    const f = () => ({ road: road.value, start: a.value, end: b.value, scale: sp.get(), reverse: rev.checked });
    let pv = null;
    function upd() {
      try { pv = M.previewStations(st, seg.id, f()); } catch (e) { pv = { errs: [e.message] }; }
      [a, b].forEach((x) => x.classList.toggle('numbad', !!x.value.trim() && !Number.isFinite(M.parseStation(x.value))));
      if (pv.errs.length) { live.replaceChildren(h('p', { class: 'err' }, pv.errs.join(' '))); warn.replaceChildren(); btn.disabled = true; return; }
      const sa = a.value.trim() ? M.parseStation(a.value) : null, sb = b.value.trim() ? M.parseStation(b.value) : null;
      const changed = sa !== seg.start || sb !== seg.end || road.value.trim() !== seg.road || rev.checked !== !!seg.reverse || String(sp.get() == null ? '' : sp.get()) !== String(seg.scale == null ? '' : seg.scale);
      btn.disabled = !changed;
      live.replaceChildren(sa == null ? h('div', { class: 'muted' }, 'No stations yet — PP sheets are counted once start and end are entered.') : h('div', {}, h('b', {}, fmtFt(pv.length)), ' · ', h('b', {}, String(pv.count)), ' PP'),
        changed && pv.hasGen ? h('ul', { class: 'small plan', id: 'stPlan' }, planText(pv).length ? planText(pv).map((x) => h('li', {}, x)) : h('li', {}, 'Generated PP sheets stay the same.')) : '');
      warn.replaceChildren(...pv.warns.map((w) => h('p', { class: 'warnbox' }, '⚠ ' + w)));
    }
    [a, b, road].forEach((x) => x.addEventListener('input', upd)); rev.addEventListener('change', upd);
    setTimeout(upd, 0);
    const off = h('input', { id: 'stOff', class: 'mono', placeholder: '+100 or -50', 'aria-label': 'Shift offset (feet)', autocomplete: 'off' });
    return h('section', { class: 'box', id: 'stBox' }, h('h3', {}, 'Stations'),
      h('form', { class: 'stack', onsubmit: (e) => {
        e.preventDefault(); upd(); if (!pv || pv.errs.length) return;
        const L = pv.hasGen ? planText(pv) : [];
        if (L.length && !confirm('Update stations and regenerate PP sheets?\n\n' + L.join('\n') + '\n\nSheets you edited are kept.')) return;
        const r = commit(() => M.setStations(st, seg.id, f(), { regen: !!L.length }));
        if (r) { ui.lastRoad = r.road.road; saveUI(); toast('Stations saved: ' + r.road.name + (r.gen ? ' · PP ' + r.gen.created + ' new, ' + r.gen.updated + ' updated, ' + r.gen.removed + ' removed' : '') + (r.warns.length ? ' · ⚠ ' + r.warns[0] : '')); }
      } }, field('Road', road), h('datalist', { id: 'roadList2' }, M.roads(st).map((r) => h('option', { value: r }))),
        h('div', { class: 'g2' }, field('Start station', a, '10+00, 1000 or 10+00.50'), field('End station', b)),
        field('Plan scale', sp), h('label', { class: 'chk' }, rev, ' Reverse direction (PP 1 starts at the end station)'), live, warn, btn),
      M.hasSta(seg) ? h('form', { class: 'addrow', onsubmit: (e) => {
        e.preventDefault(); const d = Number(String(off.value).replace(/\s/g, '')); if (!Number.isFinite(d) || !d) return toast('Enter an offset in feet, e.g. +100 or -50.');
        if (!confirm('Shift ' + seg.name + ' by ' + (d > 0 ? '+' : '') + d + ' ft? Generated PP sheet ranges shift too.')) return;
        commit(() => M.shiftStations(st, seg.id, d)); toast('Shifted by ' + (d > 0 ? '+' : '') + d + ' ft.');
      } }, off, h('button', { type: 'submit', class: 'btn sec', id: 'stShift' }, 'Shift road')) : null,
      M.hasSta(seg) ? splitMerge(sub, seg) : null, copyBox(sub, seg));
  }
  function copyBox(sub, seg) {
    const to = select(st.subs.filter((x) => x !== sub).map((x) => [x.id, 'to ' + M.subLabel(x)]), '', { id: 'cpTo', 'aria-label': 'Copy to sub-project' });
    const ws = h('input', { type: 'checkbox', id: 'cpSheets', checked: true });
    return h('form', { class: 'addrow cprow', onsubmit: (e) => {
      e.preventDefault(); const r = commit(() => M.copySegment(st, seg.id, to.value, { sheets: ws.checked }));
      if (r) { const tsub = M.findSub(st, to.value); const hit = M.findRoad(st, r.road.id); openBranch(tsub.id, hit.sec.discipline, hit.sec.id); saveUI(); renderTree(); toast('Copied to ' + M.subTag(tsub) + ' · ' + hit.sec.title + (r.sheets ? ' with ' + r.sheets + ' PP sheets (Not started)' : '') + (r.warns.length ? ' · ⚠ ' + r.warns[0] : '.')); }
    } }, to, h('label', { class: 'chk' }, ws, ' with PP sheets'), h('button', { type: 'submit', class: 'btn sec', id: 'cpBtn' }, '⧉ Copy road'));
  }
  function splitMerge(sub, seg) {
    const at = h('input', { id: 'spAt', class: 'mono', placeholder: 'Split at e.g. ' + M.formatStation(Math.round((seg.start + seg.end) / 200) * 100), 'aria-label': 'Split at station', autocomplete: 'off' });
    const nb = M.touching(st, seg.id);
    return h('div', { class: 'stack' },
      h('form', { class: 'addrow', onsubmit: (e) => {
        e.preventDefault(); const x = M.parseStation(at.value);
        if (!(x > seg.start && x < seg.end)) return toast('Split station must be between ' + M.formatStation(seg.start) + ' and ' + M.formatStation(seg.end) + '.');
        if (!confirm('Split ' + seg.name + ' at ' + M.formatStation(x) + '?\n\nGenerated PP sheets go to the part that contains them.')) return;
        const r = commit(() => M.splitSegment(st, seg.id, x)); if (r) toast('Split into ' + r.a.name + ' and ' + r.b.name + '. Undo with Ctrl+Z.');
      } }, at, h('button', { type: 'submit', class: 'btn sec', id: 'spBtn' }, '✂ Split')),
      nb.length ? h('div', { class: 'row' }, nb.map((o) => h('button', { type: 'button', class: 'btn sec sm mergebtn', onclick: () => {
        if (!confirm('Merge ' + seg.name + ' with ' + o.name + '? PP sheets of both are combined and renumbered.')) return;
        const a = commit(() => M.mergeSegments(st, seg.id, o.id)); if (a) { select_('road', a.id); toast('Merged into ' + a.name + '. Undo with Ctrl+Z.'); }
      } }, '⇔ Merge with ' + M.formatStation(o.start) + '–' + M.formatStation(o.end)))) : null);
  }
  /* v3.2: per-sheet station ranges of one road branch — computed from the road, editable, reset to computed */
  function staEditor(sh, opts) {
    const rg = M.sheetRange(sh), c = M.computedRange(sh);
    const a = h('input', { class: 'scell mono', value: rg ? M.formatStation(rg.start) : '', placeholder: c ? M.formatStation(c.start) : '10+00', 'aria-label': 'Start station of ' + sh.title, 'data-k': 'a', id: opts && opts.ids ? 'shStaA' : null });
    const b = h('input', { class: 'scell mono', value: rg ? M.formatStation(rg.end) : '', placeholder: c ? M.formatStation(c.end) : '22+00', 'aria-label': 'End station of ' + sh.title, 'data-k': 'b', id: opts && opts.ids ? 'shStaB' : null });
    const go = () => {
      const va = a.value.trim(), vb = b.value.trim();
      if (!!va !== !!vb) { toast('Now enter the ' + (va ? 'end' : 'start') + ' station.'); return; }
      if (rg && va === M.formatStation(rg.start) && vb === M.formatStation(rg.end)) return;
      const r = commit(() => M.setSheetRange(st, sh.id, va, vb));
      if (r) toast((va ? 'Station range ' + va + ' – ' + vb : 'Station range cleared') + (r.warns.length ? ' · ⚠ ' + r.warns[0].replace(/\.$/, '') : '') + '. Undo with Ctrl+Z.');
    };
    [a, b].forEach((x) => { x.addEventListener('change', go); x.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }); });
    const reset = rg && rg.manual && c ? h('button', { type: 'button', class: 'btn sec sm', id: opts && opts.ids ? 'shStaReset' : null, title: 'Back to the computed range ' + M.formatStation(c.start) + ' – ' + M.formatStation(c.end), onclick: () => { commit(() => M.resetSheetRange(st, sh.id)); toast('Reset to computed ' + M.formatStation(c.start) + ' – ' + M.formatStation(c.end) + '.'); } }, '↺ Reset to computed') : null;
    return { a, b, reset, rg, c };
  }
  function sheetRangesBox(sub, sec, sheets) {
    const W2 = M.rangeWarnings(st, sub, sec).filter((w) => sheets.some((x) => x.id === w.sheet));
    return h('section', { class: 'box', id: 'rgBox' }, h('h3', {}, 'Sheets on this road (' + sheets.length + ')'),
      h('p', { class: 'muted small' }, 'Each PP sheet starts where the previous one ends: ' + st.settings.scales.map((x) => x.scale + ' scale = ' + x.ft + ' ft').join(', ') + '. The last sheet is shorter. Type a range to override one sheet; ↺ puts it back.'),
      sheets.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'grid compact rgtab', id: 'rgTable' },
        h('thead', {}, h('tr', {}, ['Sheet', 'Start', 'End', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, sheets.map((sh) => { const e = staEditor(sh); return h('tr', { 'data-sheet': sh.id, class: 'st-' + slug(sh.status) + (e.rg && e.rg.manual ? ' manual' : '') },
          h('td', {}, h('button', { type: 'button', class: 'link', onclick: () => select_('sheet', sh.id) }, sh.gen ? 'PP ' + sh.gen.idx : sh.title), h('span', { class: 'stpill' }, sh.status)),
          h('td', {}, e.a), h('td', {}, e.b), h('td', {}, e.reset || (e.rg ? h('span', { class: 'muted small' }, e.rg.manual ? 'manual' : 'computed') : h('span', { class: 'muted small' }, 'no range')))); })))) : h('p', { class: 'muted' }, 'No sheets yet. Enter the road stations and the PP sheets appear here.'),
      W2.length ? h('div', { id: 'rgWarn' }, W2.map((w) => h('p', { class: 'warnbox' }, '⚠ ' + w.msg))) : null);
  }
  function roadDrawer({ sub, road, sec }) {
    const pl = M.planGenerate(st, road.id), pend = M.pendingCount(pl);
    const gen = sec.sheets.filter((x) => x.gen && x.gen.road === road.id);
    const grp = M.roadGroups(sub, sec).find((g) => g.entries.includes(road));
    const gsheets = grp ? M.sheetsOfGroup(sub, sec, grp) : gen;
    return h('div', { class: 'dbody' },
      crumb([[sec.discipline, () => select_('dtop', sec.discipline)], [M.subTag(sub), toDisc(sub, sec.discipline)], [sec.title, toSeg(sec)]]),
      h('h2', {}, grp ? grp.name : road.name), h('div', { class: 'statrow' }, h('div', {}, ppLine(sub, road))),
      h('section', { class: 'box', id: 'roadsBox' }, h('h3', {}, grp && grp.entries.length > 1 ? 'Station ranges of this road (' + grp.entries.length + ')' : 'Road entry'),
        roadTable(sub, sec, grp ? grp.entries : [road]),
        grp && grp.entries.length > 1 ? h('div', { class: 'row' }, grp.entries.map((r) => h('button', { type: 'button', class: 'btn sm ' + (r === road ? '' : 'sec'), 'aria-pressed': String(r === road), onclick: () => select_('road', r.id) }, r.name))) : null),
      sheetRangesBox(sub, sec, gsheets),
      h('section', { class: 'box' }, h('h3', {}, 'PP sheets'),
        h('p', { class: 'muted' }, !M.hasSta(road) ? 'Enter stations to count and generate PP sheets.' : pend ? 'Generate creates ' + pl.create.length + ', updates ' + pl.update.length + ', removes ' + (pl.remove.length + pl.removeTouched.length) + ' generated sheet(s). Other sheets are never touched.' : 'Generated PP sheets are up to date (' + pl.unchanged + ').'),
        h('button', { type: 'button', class: 'btn', id: 'genRoadBtn', disabled: !pend, onclick: () => genRoad(road) }, 'Generate PP sheets for this road')),
      stationsBox(sub, road),
      connectorsBox({ t: 'road', id: road.id }),
      h('button', { type: 'button', class: 'btn danger sm', id: 'delRoad', onclick: () => { if (confirm('Delete road entry “' + road.name + '”' + (gen.length ? ' and its ' + plural(gen.length, 'generated PP sheet') : '') + '? Other sheets are kept.')) { commit(() => M.deleteRoad(st, road.id)); select_('seg', sec.id); } } }, 'Delete road entry'));
  }
  let pickState = { key: null, q: '', open: false, kind: 'dep', dir: 'in' };
  function refText(x) { return x.t === 'sheet' ? x.sh.title + ' ' + x.sh.number + ' ' + M.sheetRoad(st, x.sub, x.sh) : x.t === 'road' ? x.name + ' road' : 'section'; }
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
    const q = h('input', { value: pickState.q, id: 'lkSearch', type: 'search', placeholder: 'Search any sub-project, section, road or sheet…', autocomplete: 'off', 'aria-label': 'Find item to connect' });
    const kind = select([['dep', 'Depends on (must be done first)'], ['update', 'Update needed when it changes']], pickState.kind, { id: 'lkKind', 'aria-label': 'Connector kind', onchange: (e) => { pickState.kind = e.target.value; } });
    const dir = select([['in', 'Picked item → this (this waits / updates)'], ['out', 'This → picked item (picked waits / updates)']], pickState.dir, { id: 'lkDir', 'aria-label': 'Direction', onchange: (e) => { pickState.dir = e.target.value; } });
    const res = h('ul', { class: 'lkres', id: 'lkRes', role: 'listbox', 'aria-label': 'Matching items' });
    const fill = () => {
      const t = q.value.trim().toLowerCase();
      const cand = M.allRefs(st).filter((r) => M.rk(r) !== key).map((r) => ({ r, x: M.resolve(st, r) })).filter(({ x }) => x)
        .filter(({ x }) => !t || (M.subLabel(x.sub) + ' ' + x.seg.discipline + ' ' + x.seg.title + ' ' + refText(x)).toLowerCase().includes(t));
      res.replaceChildren(...cand.slice(0, 40).map(({ r, x }) => h('li', {}, h('button', { type: 'button', class: 'rowbtn', role: 'option', onclick: () => {
        const [a, b] = dir.value === 'in' ? [r, ref] : [ref, r];
        const out = commit(() => M.addLink(st, a, b, kind.value));
        if (out) toast('Connector added.' + (out.warns.length ? ' ⚠ ' + out.warns.join(' ') : ''));
        setTimeout(() => { const i = $('#lkSearch'); if (i) i.focus(); }, 20);
      } }, h('span', { class: 'code', title: M.subName(x.sub) }, x.sub.code), h('span', { class: 'grow' }, ' ' + x.seg.title + (x.t === 'sheet' ? ' · ' + x.sh.title : x.t === 'road' ? ' · road ' + x.name : ' (whole section)')),
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
    const disc = select(M.DISCIPLINES, sh.discipline, { id: 'shDisc', disabled: !!sh.gen }); disc.addEventListener('change', () => { up({ discipline: disc.value }); const x = M.findSheet(st, sh.id); if (x) toast('Moved to ' + x.seg.discipline + ' · ' + x.seg.title + '.'); });
    const secSel = select(secOpts(sub), seg.id, { id: 'shSec', disabled: !!sh.gen, title: sh.gen ? 'Generated PP sheets stay in their section' : null }); secSel.addEventListener('change', () => { up({ sec: secSel.value }); toast('Moved to ' + M.findSheet(st, sh.id).seg.title + '.'); });
    const roadIn = h('input', { id: 'shRoad', value: M.sheetRoad(st, sub, sh), list: 'roadList4', autocomplete: 'off', placeholder: 'optional', disabled: !!sh.gen });
    roadIn.addEventListener('change', () => up({ road: roadIn.value }));
    const owner = select(ownerOpts(sh.owner), sh.owner); owner.addEventListener('change', () => { onOwner(owner, sh); renderAll(); });
    const ms = select([['', '—']].concat(st.milestones.map((m) => [m.id, m.name + (m.date ? ' (' + m.date + ')' : '')])), sh.milestone); ms.addEventListener('change', () => up({ milestone: ms.value }));
    const pct = h('input', { type: 'range', min: 0, max: 100, step: 5, value: sh.pct || 0, 'aria-label': '% complete' });
    const pctOut = h('output', {}, (sh.pct || 0) + '%');
    pct.addEventListener('input', () => { pctOut.textContent = pct.value + '%'; });
    pct.addEventListener('change', () => up({ pct: Number(pct.value) }));
    const notes = h('textarea', { rows: 4 }); notes.value = sh.notes || ''; notes.addEventListener('change', () => up({ notes: notes.value }));
    const blocked = sh.status === 'Done' ? [] : M.blockers(st, { t: 'sheet', id: sh.id });
    const groad = sh.gen && M.findRoad(st, sh.gen.road);
    return h('div', { class: 'dbody' },
      crumb([[seg.discipline, () => select_('dtop', seg.discipline)], [M.subTag(sub), toDisc(sub, seg.discipline)], [seg.title, toSeg(seg)]].concat(groad ? [[groad.road.name, () => select_('road', groad.road.id)]] : [])),
      field('Title', inp('title')),
      sh.gen ? h('p', { class: 'pill' }, 'Generated PP sheet ' + sh.gen.idx + ' of ' + sh.gen.of + (M.sheetScale(st, sub, sh) ? ' · ' + M.sheetScale(st, sub, sh) + ' scale' : '')) : null,
      M.isPPSec(seg) ? (() => { const e = staEditor(sh, { ids: true }); const ws = M.rangeWarnings(st, sub, seg).filter((w) => w.sheet === sh.id);
        return h('section', { class: 'box', id: 'shStaBox' }, h('h3', {}, 'Station range'),
          h('div', { class: 'g2' }, field('Start station', e.a), field('End station', e.b)),
          h('p', { class: 'muted small', id: 'shStaHint' }, e.rg ? (e.rg.manual ? 'Manual range' + (e.c ? ' (computed ' + M.formatStation(e.c.start) + ' – ' + M.formatStation(e.c.end) + ')' : '') : 'Computed from the road stations and scale') + ' · ' + fmtFt(e.rg.end - e.rg.start) : 'No range' + (sh.gen ? '' : ' — optional for sheets you added yourself'), ' ', e.reset),
          ws.map((w) => h('p', { class: 'warnbox' }, '⚠ ' + w.msg))); })() : null,
      blocked.length ? h('p', { class: 'warnbox', id: 'blockedMsg' }, '⛓ Blocked by ' + blocked.length + ': ' + blocked.map((r) => M.refLabel(st, r)).join(', ')) : null,
      h('div', { class: 'g2' }, field('Status', status), field('Owner', owner), field('Due date', inp('due', { type: 'date' })), field('Milestone', ms),
        field('Section', secSel), field('Road', roadIn), h('datalist', { id: 'roadList4' }, M.roads(st).map((r) => h('option', { value: r }))),
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
  /* Stations table view (Excel-like: Enter navigation, paste TSV rows) — every road entry of every P&P section */
  const SCOLS = ['road', 'start', 'end', 'scale'];
  function renderStations() {
    const segs = [];
    for (const d of DISCS) for (const sub of M.orderedSubs(st)) for (const sec of M.sectionsOf(sub, d).filter(M.isPPSec)) for (const road of M.roadsOf(sub, sec)) segs.push({ sub, sec, seg: road });
    const wrap = $('#stationsWrap');
    const save1 = (seg, k, v) => { const r = commit(() => M.applyStationRows(st, [{ roadId: seg.id, [k]: v }])); if (r && r.warns.length) toast('⚠ ' + r.warns[0]); };
    const cell = (x, k, ri, ci) => {
      const v = k === 'road' ? x.seg.road : k === 'scale' ? (x.seg.scale == null ? '' : x.seg.scale) : M.formatStation(x.seg[k]);
      const inp = h('input', { class: 'scell' + (k !== 'road' ? ' mono' : ''), value: String(v), 'data-r': ri, 'data-c': ci, 'aria-label': M.subTag(x.sub) + ' ' + x.sec.title + ' ' + x.seg.name + ' ' + k, placeholder: k === 'scale' ? String(x.sub.scale) : '' });
      inp.addEventListener('change', () => { const val = inp.value.trim(); if (k === 'road' && !val) { inp.value = String(v); return; } if ((k === 'start' || k === 'end') && val && !Number.isFinite(M.parseStation(val))) { inp.classList.add('numbad'); toast('Station must look like 10+00, 1000 or 10+00.50'); return; }
        if (k === 'start' || k === 'end') { const o = inp.closest('tr').querySelector('.scell[data-c="' + (k === 'start' ? 2 : 1) + '"]').value.trim(); if (!!val !== !!o) { toast('Now enter the ' + (k === 'start' ? 'end' : 'start') + ' station.'); return; }
          const r = commit(() => M.applyStationRows(st, [{ roadId: x.seg.id, start: k === 'start' ? val : o, end: k === 'end' ? val : o }])); if (r && r.warns.length) toast('⚠ ' + r.warns[0]); return; }
        save1(x.seg, k, k === 'scale' && !val ? '' : val); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.dispatchEvent(new Event('change')); setTimeout(() => { const m = $('#stationsWrap .scell[data-r="' + (ri + (e.shiftKey ? -1 : 1)) + '"][data-c="' + ci + '"]'); if (m) { m.focus(); m.select(); } }, 0); } });
      inp.addEventListener('paste', (e) => {
        const t = (e.clipboardData || window.clipboardData).getData('text'); if (!/[\t\n]/.test(t)) return;
        e.preventDefault(); const rows = M.parseTSV(t);
        const out = rows.map((cols, i) => { const tgt = segs[ri + i]; const o = tgt ? { roadId: tgt.seg.id } : { secId: (segs[ri] || segs[segs.length - 1]).sec.id }; cols.forEach((c, j) => { const kk = SCOLS[ci + j]; if (kk) o[kk] = c; }); return o; });
        const added = out.filter((o) => !o.roadId).length;
        if (added && !confirm('Paste ' + rows.length + ' rows: update ' + (rows.length - added) + ' and add ' + added + ' new road entr' + (added === 1 ? 'y' : 'ies') + ' to ' + (segs[ri] || segs[segs.length - 1]).sec.title + '?')) return;
        const r = commit(() => M.applyStationRows(st, out)); if (r) toast('Pasted: ' + r.updated + ' updated, ' + r.added + ' added' + (r.warns.length ? ' · ⚠ ' + r.warns[0] : '') + '. Undo with Ctrl+Z.');
      });
      return h('td', {}, inp);
    };
    wrap.replaceChildren(h('div', { class: 'vhead' }, h('h2', {}, 'Stations'), h('span', { class: 'muted' }, 'Road entries of the Plan & Profile sections · edit cells directly · Enter to move · paste rows from Excel (Road, Start, End, Scale)')),
      segs.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'grid stable', id: 'stTable' },
        h('thead', {}, h('tr', {}, ['Sub', 'Section', 'Road', 'Start', 'End', 'Scale', 'Length', 'PP', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, segs.map((x, ri) => { const pend = M.hasSta(x.seg) ? M.pendingCount(M.planGenerate(st, x.seg.id)) : 0; const ov = M.hasSta(x.seg) ? M.overlaps(x.seg, segs.filter((o) => o.sec.key === x.sec.key).map((o) => o.seg)) : [];
          return h('tr', { class: ov.length ? 'ovl' : '' }, h('td', {}, h('span', { class: 'code', title: M.subName(x.sub) }, x.sub.code)), h('td', { class: 'small' }, h('span', { class: 'chip ' + DINFO[x.sec.discipline].cls }, DINFO[x.sec.discipline].short), ' ' + x.sec.title), SCOLS.map((k, ci) => cell(x, k, ri, ci)),
            h('td', { class: 'mono' }, M.hasSta(x.seg) ? fmtFt(M.segLength(x.seg)) : '—'), h('td', {}, M.hasSta(x.seg) ? String(M.segPP(st, x.sub, x.seg).total) : '—'),
            h('td', {}, ov.length ? h('span', { class: 'warn', title: 'Overlaps ' + ov.map((o) => o.name).join(', ') }, '⚠ overlap ') : null,
              pend ? h('button', { type: 'button', class: 'btn sec sm', onclick: () => genRoad(x.seg) }, '⟳ Generate PP') : null,
              h('button', { type: 'button', class: 'link', onclick: () => { select_('road', x.seg.id); } }, 'Open'))); })))) :
        h('p', { class: 'muted empty' }, 'No road entries yet. Open a Plan & Profile section (Drainage P&P, Trunkline P&P, Drainage Laterals or SWP3 Layout) and add a road by name.'));
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
  function closeModal() { pendingImport = false; if (pendingMig && migrationNotice.done) { migrationNotice.done(); return; } if (pendingMig32 && migrationNotice32.done) { migrationNotice32.done(); return; } $('#modal').hidden = true; $('#modalBody').replaceChildren(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function openPP() {
    const what = {};
    const body = h('div', {});
    const draw = () => {
      const cur = M.ppSummary(st), W = M.ppSummary(st, { subScale: what });
      const ppDefs = DISCS.flatMap((d) => M.secDefs(st, d).filter((x) => x.series));
      body.replaceChildren(
        h('p', { class: 'muted' }, 'PP sheets = ceil(road length ÷ feet per sheet)' + (st.settings.overlapFt ? ' with ' + st.settings.overlapFt + ' ft overlap' : ', no overlap') + ', for every road entry in the Plan & Profile sections (' + ppDefs.map((x) => x.title).join(', ') + '). Feet per sheet: ' + st.settings.scales.map((r) => r.scale + ' = ' + r.ft.toLocaleString()).join(', ') + '. What-if changes are not saved unless you apply them.'),
        h('div', { class: 'tablewrap' }, h('table', { class: 'grid compact', id: 'ppTable' }, h('thead', {}, h('tr', {}, ['Sub-project', 'Roads', 'Length', 'Default scale', 'What-if scale', 'DR PP', 'SW PP', 'PP now', 'PP what-if'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, st.subs.map((sub, i) => {
            const ws = select([['', 'same (' + sub.scale + ')']].concat(scaleOpts(false)), what[sub.id] || '', { 'aria-label': 'What-if scale for ' + M.subTag(sub) });
            ws.addEventListener('change', () => { if (ws.value) what[sub.id] = Number(ws.value); else delete what[sub.id]; draw(); });
            const a = cur.bySub[i].total, b = W.bySub[i].total;
            return h('tr', {}, h('th', { scope: 'row' }, M.subLabel(sub)), h('td', {}, sub.roads.length), h('td', {}, fmtFt(cur.bySub[i].length)), h('td', {}, sub.scale), h('td', {}, ws),
              h('td', { class: 'dr-c' }, cur.bySub[i].disc.Drainage), h('td', { class: 'sw-c' }, cur.bySub[i].disc.SWP3), h('td', {}, a), h('td', { class: b !== a ? 'chg' : '' }, b, b !== a ? ' (' + (b > a ? '+' : '') + (b - a) + ')' : ''));
          })),
          h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Project'), h('td', {}, M.allRoads(st).length), h('td', {}, fmtFt(cur.length)), h('td', {}), h('td', {}), h('td', { id: 'ppDr' }, h('b', {}, cur.byDisc.Drainage)), h('td', { id: 'ppSw' }, h('b', {}, cur.byDisc.SWP3)), h('td', {}, h('b', {}, cur.total)), h('td', {}, h('b', { id: 'ppWhatIf' }, W.total)))))),
        h('h3', {}, 'By section'),
        h('div', { class: 'tablewrap' }, h('table', { class: 'grid compact', id: 'ppSecTable' }, h('thead', {}, h('tr', {}, ['Section'].concat(st.subs.map((x) => M.subTag(x)), ['Total']).map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, ppDefs.map((def) => { const n = st.subs.map((sub) => { const g = M.secOf(sub, def.key); return g ? M.segPP(st, sub, g, { subScale: what }).total : 0; });
            return h('tr', {}, h('th', { scope: 'row' }, h('span', { class: 'chip ' + DINFO[def.discipline].cls }, DINFO[def.discipline].short), ' ' + def.title), n.map((x) => h('td', {}, String(x))), h('td', {}, h('b', {}, String(n.reduce((a, b) => a + b, 0))))); })))),
        h('p', { class: 'muted' }, 'Road entries with their own scale are not changed by the what-if.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', disabled: !Object.keys(what).length, onclick: () => { commit(() => { for (const [id, v] of Object.entries(what)) { const sub = M.findSub(st, id); sub.scale = v; M.log(st, M.subTag(sub) + ' default scale → ' + v + ' (from calculator)'); } }); toast('Default scales applied. Use “Generate PP sheets” in the P&P sections to update sheet entries.'); openPP(); } }, 'Apply what-if scales'),
          h('button', { type: 'button', class: 'btn sec', onclick: () => download('pm-pp-summary-' + M.todayISO() + '.csv', '\ufeff' + M.ppCSV(st, { subScale: what }), 'text/csv') }, 'Export PP summary CSV'),
          h('button', { type: 'button', class: 'btn sec', onclick: () => { closeModal(); openSettings(); } }, 'Edit scale table')));
    };
    draw();
    openModal('PP sheet calculator', body);
  }
  function openIndex() {
    const nt = h('input', { placeholder: 'Sheet title (e.g. Utility Conflict Sheet)', 'aria-label': 'New sheet index title', id: 'idxNew' });
    const nd = select([['', 'Section: pick from the title']].concat(secKeyOpts()), '', { 'aria-label': 'New sheet index section' });
    const scope = select([['', 'Both disciplines'], ['Drainage', 'Drainage only'], ['SWP3', 'SWP3 only']], '', { 'aria-label': 'Apply which disciplines', id: 'idxScope' });
    const err = h('p', { class: 'err', role: 'alert' });
    const info = h('p', { class: 'muted', id: 'idxPlan' });
    const upd = () => { const P = M.planIndex(st, { discipline: scope.value || null }); info.textContent = P.count ? 'Apply adds ' + plural(P.count, 'sheet') + ' across ' + plural(P.sections, 'section') + ' in A–D. Sheets a section already has (same title) are skipped.' : 'Every section already has these sheets.'; };
    scope.addEventListener('change', upd);
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'One sheet list for the whole project. Each item belongs to a section; Apply adds it to that section in every sub-project A–D. It never removes or duplicates sheets. PP sheets come from the road entries (Generate PP).'),
      h('ol', { class: 'dlist idx' }, st.index.map((t, i) => {
        const ti = h('input', { value: t.title, 'aria-label': 'Index sheet title ' + (i + 1) }); ti.addEventListener('change', () => { try { M.updateIndexItem(st, t.id, { title: ti.value }); save(); } catch (e) { err.textContent = e.message; } });
        const di = select(secKeyOpts(), t.sec || '', { 'aria-label': 'Index sheet section ' + (i + 1) }); di.addEventListener('change', () => { commit(() => M.updateIndexItem(st, t.id, { sec: di.value }), { render: false }); openIndex(); });
        return h('li', { class: 'idxrow' }, h('span', { class: 'chip ' + (t.discipline === 'SWP3' ? 'sw' : 'dr') }, t.discipline === 'SWP3' ? 'SW' : 'DR'), ti, di,
          h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + t.title + ' up', disabled: !i, onclick: () => { commit(() => M.moveIndexItem(st, t.id, -1), { render: false }); openIndex(); } }, '↑'),
          h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove ' + t.title + ' from index', onclick: () => { commit(() => M.removeIndexItem(st, t.id), { render: false }); openIndex(); } }, '×'));
      })),
      h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); err.textContent = ''; try { M.addIndexItem(st, { title: nt.value, sec: nd.value || null }); save(); openIndex(); setTimeout(() => $('#idxNew') && $('#idxNew').focus(), 30); } catch (ex) { err.textContent = ex.message; } } }, nt, nd, h('button', { class: 'btn sec', type: 'submit' }, 'Add')),
      err,
      h('div', { class: 'box' }, h('h3', {}, 'Apply to every sub-project'), h('div', { class: 'row' }, scope,
        h('button', { type: 'button', class: 'btn', id: 'applyIdxBtn', onclick: () => {
          const P = M.planIndex(st, { discipline: scope.value || null });
          if (!P.count) { toast('Nothing to add — every section already has these sheets.'); return; }
          if (!confirm('Add ' + plural(P.count, 'sheet') + ' to ' + plural(P.sections, 'section') + '? Existing sheets are skipped.')) return;
          const n = commit(() => M.applyIndex(st, { discipline: scope.value || null })); toast('Added ' + plural(n || 0, 'sheet') + ' from the sheet index.'); openIndex();
        } }, 'Apply to A–D')), info,
        h('button', { type: 'button', class: 'btn sec sm', id: 'idxTplBtn', onclick: () => { if (confirm('Replace every sub-project’s standard sheet set (used by “+ Standard sheets”) with this index? Existing sheets are not touched.')) { commit(() => M.indexToTemplates(st)); toast('Index copied to all sub-projects.'); } } }, 'Use as every sub-project’s standard set')));
    upd();
    openModal('Project sheet index', body);
  }
  /* v3 section lists (per discipline): add, rename, reorder, remove, roads on/off */
  function sectionsSection() {
    const err = h('p', { class: 'err', role: 'alert', id: 'secErr' });
    const reopen = () => { openSettings('secs'); };
    const run = (fn, msg) => { err.textContent = ''; try { fn(); hardEdit = true; save(); renderAll(); if (msg) toast(msg); reopen(); } catch (e) { err.textContent = e.message; toast(e.message); } };
    return h('section', { id: 'secSec' }, h('h3', {}, 'Sections'),
      h('p', { class: 'muted' }, 'The section list of each discipline, used by every sub-project A–D. Rename, reorder, add or remove (only empty sections can be removed). “Roads” marks a Plan & Profile section: it takes road entries and counts PP sheets from their stations.'),
      DISCS.map((d) => { const defs = M.secDefs(st, d);
        const nt = h('input', { placeholder: 'New ' + d + ' section', 'aria-label': 'New ' + d + ' section title', id: 'secNew' + DINFO[d].short });
        const np = h('input', { type: 'checkbox', 'aria-label': 'New section takes road entries' });
        return h('div', { class: 'secedit', 'data-disc': d }, h('h4', {}, h('span', { class: 'chip ' + DINFO[d].cls }, DINFO[d].short), ' ' + d + ' (' + defs.length + ')'),
          h('ol', { class: 'dlist secs' }, defs.map((x, i) => {
            const nm = h('input', { value: x.title, 'aria-label': 'Section name ' + x.title });
            nm.addEventListener('change', () => run(() => M.renameSectionDef(st, x.key, nm.value), 'Section renamed.'));
            const use = M.sectionInUse(st, x.key);
            return h('li', { class: 'secrow' }, h('span', { class: 'muted small num' }, String(i + 1)), nm,
              h('label', { class: 'chk small', title: 'Plan & Profile section: takes road entries and counts PP sheets' }, h('input', { type: 'checkbox', checked: !!x.series, 'aria-label': 'Roads in ' + x.title, onchange: (e) => run(() => M.setSectionPP(st, x.key, e.target.checked)) }), ' Roads'),
              h('span', { class: 'muted small' }, use ? use + ' in use' : 'empty'),
              h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + x.title + ' up', disabled: !i, onclick: () => run(() => M.moveSectionDef(st, x.key, -1)) }, '↑'),
              h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + x.title + ' down', disabled: i === defs.length - 1, onclick: () => run(() => M.moveSectionDef(st, x.key, 1)) }, '↓'),
              h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove section ' + x.title, onclick: () => { if (confirm('Remove section “' + x.title + '” from A–D?')) run(() => M.removeSectionDef(st, x.key), 'Section removed.'); } }, '×'));
          })),
          h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); if (!nt.value.trim()) return; run(() => { const def = M.addSectionDef(st, { title: nt.value, discipline: d }); if (np.checked) M.setSectionPP(st, def.key, true); }, 'Section added to A–D.'); } }, nt, h('label', { class: 'chk small' }, np, ' Roads'), h('button', { class: 'btn sec', type: 'submit' }, 'Add section')));
      }), err);
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
      h('p', { class: 'muted' }, 'Per section (key sec:…), P&P series or sheet title, with a fallback per discipline. The sheet drawer suggests the next free number; duplicates and numbers outside the range are flagged.'),
      h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ['Sheets', 'From', 'To', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, st.settings.numbering.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.label),
          h('td', {}, h('input', { type: 'number', min: 0, value: r.from, class: 'num', 'aria-label': r.label + ' from', onchange: set(r, 'from') })),
          h('td', {}, h('input', { type: 'number', min: 0, value: r.to, class: 'num', 'aria-label': r.label + ' to', onchange: set(r, 'to') })),
          h('td', {}, /^disc:/.test(r.key) ? null : h('button', { type: 'button', class: 'ibtn danger', 'aria-label': 'Remove range ' + r.label, onclick: () => { commit(() => M.removeRange(st, r.key)); openSettings('nums'); } }, '×')))))),
      h('form', { class: 'addrow', onsubmit: (e) => { e.preventDefault(); try { M.addRange(st, nt.value, nf.value, nto.value); save(); openSettings('nums'); } catch (ex) { toast(ex.message); } } }, nt, nf, nto, h('button', { class: 'btn sec', type: 'submit' }, 'Add range')),
      h('datalist', { id: 'tplList2' }, (st.index || []).map((t) => h('option', { value: t.title }))),
      ov.length ? h('p', { class: 'warnbox' }, 'Overlapping ranges: ' + ov.join('; ')) : null,
      h('p', { class: iss.length ? 'err' : 'muted', id: 'numIssues' }, iss.length ? '⚠ ' + plural(iss.length, 'sheet') + ' with number issues: ' + iss.slice(0, 5).map((x) => M.subTag(x.r.sub) + ' ' + x.r.sh.title + ' (' + x.r.sh.number + ')').join(', ') + (iss.length > 5 ? '…' : '') : 'No duplicate or out-of-range numbers.'),
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
    const impFile = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Backup file', onchange: (e) => { pendingImport = !!(e.target.files && e.target.files.length); } });
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
      sectionsSection(),
      h('section', { id: 'orderSec' }, h('h3', {}, 'Build order'), h('p', { class: 'muted small' }, 'Rename a sub-project here or on the tree (double-click its name or ✎). Enter saves, Esc cancels. The letter and build position do not change.'),
        h('p', { class: 'muted' }, 'Sub-projects are built in this order. A connector pointing from a later sub-project to an earlier one is flagged “upstream”.'),
        h('ol', { class: 'dlist order' }, M.orderedSubs(st).map((sub, i, arr) => {
          const ids = arr.map((x) => x.id);
          const move = (d) => { const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; commit(() => M.setOrder(st, ids)); openSettings('order'); };
          const num = h('input', { type: 'number', min: 1, max: arr.length, value: i + 1, class: 'num', 'aria-label': 'Build position of ' + M.subTag(sub), onchange: (e) => {
            const to = Math.max(1, Math.min(arr.length, Number(e.target.value) || i + 1)) - 1; ids.splice(i, 1); ids.splice(to, 0, sub.id); commit(() => M.setOrder(st, ids)); openSettings('order'); } });
          return h('li', { class: 'ordrow' }, num, h('span', { class: 'code' }, sub.code), h('span', { class: 'grow' }, subNameEditor(sub, { blurOnCancel: true }).el),
            h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + M.subTag(sub) + ' earlier', disabled: i === 0, onclick: () => move(-1) }, '↑'),
            h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Move ' + M.subTag(sub) + ' later', disabled: i === arr.length - 1, onclick: () => move(1) }, '↓'));
        }))),
      h('section', {}, h('h3', {}, 'Standard sheet templates'), h('p', { class: 'muted' }, 'Each sub-project has its own editable list (open a sub-project → “Standard (non-PP) sheet set”). Each template belongs to a section. Resetting changes the template lists only — sheets already in sections are not touched.'),
        h('button', { type: 'button', class: 'btn sec', id: 'resetAllTpl', onclick: () => { if (confirm('Reset the standard sheet templates of ALL sub-projects to the defaults?\n\nExisting sheets are not changed.')) { commit(() => M.resetAllTemplates(st)); toast('Templates reset to defaults.'); } } }, 'Reset all templates to defaults')),
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
            st = data; M.log(st, 'Imported backup'); hardEdit = true; pendingImport = false; flush(); closeModal(); closeDrawer(); firstFit = true; renderAll(); toast('Backup imported.');
          } catch (ex) { impErr.textContent = ex.code === 'DECRYPT' ? 'Wrong passphrase for this backup (or the file was modified).' : 'Could not import: ' + ex.message; }
        } }, h('h3', {}, 'Import backup'), field('Backup file (v3 or v2 JSON, or old encrypted v1 backup)', impFile), field('Passphrase (old encrypted backups only)', impPass), impErr, h('button', { class: 'btn sec', type: 'submit' }, 'Import…'))),
      hasOld ? h('section', {}, h('h3', {}, 'Old encrypted v1 data'), h('p', { class: 'muted' }, 'An encrypted v1 vault is still stored in this browser.'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec', onclick: () => { closeModal(); migrationPanel(true); } }, 'Import it again…'),
          h('button', { type: 'button', class: 'btn danger', onclick: () => { if (confirm('Delete the old encrypted vault from this browser? Current data is not affected.')) { localStorage.removeItem(OLDKEY); openSettings(); } } }, 'Delete old vault'))) : null,
      localStorage.getItem(V31BAK) ? h('section', { id: 'v31Sec' }, h('h3', {}, 'v3.1 data (before roads in the tree)'), h('p', { class: 'muted' }, 'Kept untouched in pm.data.v3.pre-v3.2-backup' + (st.v32 && st.v32.at ? ' (upgraded ' + new Date(st.v32.at).toLocaleString() + ')' : '') + '.'), h('button', { type: 'button', class: 'btn sec', id: 'v31Dl', onclick: v31Download }, '⤓ Download v3.1 data')) : null,
      localStorage.getItem(V2BAK) || localStorage.getItem(V2KEY) ? h('section', { id: 'v2Sec' }, h('h3', {}, 'Old v2 data'), h('p', { class: 'muted' }, 'The data from before v3 (road-based tree) is kept untouched in this browser (pm.data.v2, copy in pm.data.v2.pre-v3-backup). v3 never changes it.' + (st.migration ? ' Converted ' + new Date(st.migration.at).toLocaleString() + ': ' + st.migration.sheets + ' sheets, ' + st.migration.roads + ' road entries, ' + st.migration.other + ' sheets to “Other”.' : '')),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec', id: 'v2Dl', onclick: v2Download }, '⤓ Download old v2 data'))) : null,
      h('section', {}, h('h3', {}, 'Keyboard'), h('ul', { class: 'keys' }, KEYS.map(([k, v]) => h('li', {}, h('kbd', {}, k), ' ' + v)))),
      h('section', {}, h('h3', {}, 'Activity log'), h('ol', { class: 'log long' }, st.log.slice(0, 200).map((l) => h('li', {}, h('time', { datetime: l.t }, new Date(l.t).toLocaleString()), ' ', l.msg)))),
      h('section', {}, h('h3', {}, 'Danger zone'), h('button', { type: 'button', class: 'btn danger', onclick: () => { if (prompt('Type ERASE to delete all project data in this browser.') === 'ERASE') { localStorage.removeItem(KEY); st = M.newState(); flush(); closeModal(); closeDrawer(); renderAll(); } } }, 'Erase all data')));
    openModal('Settings, backup & export', body);
    if (focus === 'secs') setTimeout(() => { const o = $('#secSec'); if (o) o.scrollIntoView({ block: 'start' }); }, 40);
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
        st = data; hardEdit = true; flush(); closeModal(); firstFit = true; renderAll(); toast('Imported ' + M.allSheets(st).length + ' sheets from the encrypted v1 data.');
      } catch (ex) { btn.disabled = false; btn.textContent = 'Unlock & import'; p.value = ''; p.focus(); err.textContent = ex.code === 'DECRYPT' ? 'Wrong passphrase. Try again.' : 'Could not import: ' + ex.message; }
    } },
    h('p', {}, 'This browser has project data from the earlier encrypted version. Enter its passphrase once to import it into the new (unencrypted, testing-mode) store. The passphrase is used only here and is not saved.'),
    field('v1 passphrase', p), err,
    h('div', { class: 'row' }, btn, again ? null : h('button', { type: 'button', class: 'btn sec', id: 'migSkip', onclick: () => { flush(); closeModal(); toast('Started an empty project. You can import the old data later in Settings.'); } }, 'Start empty instead')));
    openModal('Import your encrypted v1 data', body);
  }

  /* v2 → v3: shown once, before anything is written. The v2 data stays in pm.data.v2 and a copy in pm.data.v2.pre-v3-backup. */
  function v2Download() { const raw = (pendingMig && pendingMig.raw) || localStorage.getItem(V2BAK) || localStorage.getItem(V2KEY); if (!raw) return toast('No v2 data found.'); download('pm-v2-data-before-v3-' + M.todayISO() + '.json', raw, 'application/json'); toast('Old v2 data downloaded.'); }
  function migrationNotice() {
    const I = pendingMig.info || {};
    const by = Object.entries(I.bySection || {});
    const done = () => { if (!pendingMig) return; pendingMig = null; hardEdit = true; flush(); closeModal(); renderAll(); toast('v3 is ready. Your v2 data is kept as a backup in this browser (Settings → Old v2 data).'); };
    const body = h('div', { class: 'stack', id: 'migV3' },
      h('p', {}, 'The tracker now splits each discipline (Drainage, SWP3) into sub-projects A–D and then into drainage sections, instead of roads. Your data was converted; nothing was deleted.'),
      h('ul', {}, h('li', {}, plural(I.sheets || 0, 'sheet') + ' kept with their status, owner, dates, notes and links.'),
        h('li', {}, plural(I.segments || 0, 'road segment') + ' became ' + plural(I.roads || 0, 'road entry') + ' in the Plan & Profile sections (their stations and scale count the PP sheets).'),
        h('li', {}, plural(I.generated || 0, 'generated PP sheet') + ' moved to their P&P section; other sheets went to the closest section by title' + (I.other ? ', and ' + plural(I.other, 'sheet') + ' with no match went to “Other”' : '') + '.'),
        I.segLinks ? h('li', {}, plural(I.segLinks, 'whole-road connector') + ' now point to the road’s Drainage Plan & Profile section.') : null),
      by.length ? h('details', {}, h('summary', {}, 'Where the sheets went'), h('table', { class: 'grid compact' }, h('tbody', {}, by.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, String(v))))))) : null,
      h('p', { class: 'warnbox' }, 'Before continuing you can download the old data. It is also kept in this browser, untouched.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec', id: 'migDl', onclick: v2Download }, '⤓ Download old data (v2 JSON)'), h('button', { type: 'button', class: 'btn', id: 'migGo', onclick: done }, 'Continue')));
    openModal('Project Tracker v3: new structure', body);
    migrationNotice.done = done;
  }

  /* v3.1 → v3.2: roads become tree branches and every PP sheet gets its station range. Same key; the v3.1 data is copied to pm.data.v3.pre-v3.2-backup first. */
  function v31Download() { const raw = (pendingMig32 && pendingMig32.raw) || localStorage.getItem(V31BAK); if (!raw) return toast('No v3.1 backup found.'); download('pm-v3.1-data-before-v3.2-' + M.todayISO() + '.json', raw, 'application/json'); toast('v3.1 data downloaded.'); }
  function migrationNotice32() {
    const I = pendingMig32.info || {};
    const done = () => { if (!pendingMig32) return; pendingMig32 = null; hardEdit = true; flush(); closeModal(); renderAll(); toast('v3.2 is ready. Your v3.1 data is kept as a backup in this browser (Settings → v3.1 data).'); };
    const body = h('div', { class: 'stack', id: 'migV32' },
      h('p', {}, 'In the Plan & Profile sections (and any section with road entries) each road is now its own branch, with its sheets and their station ranges under it. Nothing was deleted.'),
      h('ul', {}, h('li', {}, plural(I.groups || 0, 'road') + ' (' + plural(I.roads || 0, 'road entry') + ') became tree branches.'),
        h('li', {}, plural(I.pp || 0, 'PP sheet') + ' now show their station range (start at the road start, one sheet length each, last one shorter)' + (I.updated ? '; ' + I.updated + ' had an out-of-date range and were refreshed' : '') + '. Status, owner, dates, notes and links are kept.'),
        I.created || I.removed ? h('li', {}, 'PP count brought in line with the road stations: ' + (I.created || 0) + ' added, ' + (I.removed || 0) + ' unedited extra removed (edited ones are always kept).') : null,
        h('li', {}, (((I.manualInRoad || 0) + (I.manualOther || 0)) === 1 ? '1 sheet you added yourself' : ((I.manualInRoad || 0) + (I.manualOther || 0)) + ' sheets you added yourselves') + ' in road sections: ' + (I.manualInRoad || 0) + ' sit under their road (tagged with the road name), ' + (I.manualOther || 0) + ' under “Other sheets”. They have no range until you type one.')),
      h('p', { class: 'warnbox' }, 'Before continuing you can download the v3.1 data. It is also kept in this browser (pm.data.v3.pre-v3.2-backup).'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sec', id: 'mig32Dl', onclick: v31Download }, '⤓ Download v3.1 data (JSON)'), h('button', { type: 'button', class: 'btn', id: 'mig32Go', onclick: done }, 'Continue')));
    openModal('Project Tracker v3.2: roads in the tree', body);
    migrationNotice32.done = done;
  }

  /* ---------- wiring ---------- */
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#vTree').addEventListener('click', () => { ui.view = 'tree'; saveUI(); renderAll(); });
  $('#vList').addEventListener('click', () => { ui.view = 'list'; saveUI(); renderAll(); });
  $('#vReport').addEventListener('click', () => { ui.view = 'report'; saveUI(); renderAll(); });
  $('#vStations').addEventListener('click', () => { ui.view = 'stations'; saveUI(); renderAll(); });
  $('#vBoard').addEventListener('click', () => { ui.view = 'board'; saveUI(); renderAll(); });
  $('#vWeek').addEventListener('click', () => { ui.view = 'week'; saveUI(); renderAll(); });
  $('#ppBtn').addEventListener('click', openPP);
  $('#msBtn').addEventListener('click', openMilestones);
  $('#staffBtn').addEventListener('click', openStaff);
  $('#setBtn').addEventListener('click', openSettings);
  $('#printBtn').addEventListener('click', () => { renderReport(); window.print(); });
  window.addEventListener('beforeprint', renderReport);
  $('#themeBtn').addEventListener('click', () => { ui.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; saveUI(); applyTheme(); });
  $('#zIn').addEventListener('click', () => { const v = $('#viewport'); zoomAt(1.25, v.clientWidth / 2, v.clientHeight / 2); });
  $('#zOut').addEventListener('click', () => { const v = $('#viewport'); zoomAt(0.8, v.clientWidth / 2, v.clientHeight / 2); });
  $('#zFit').addEventListener('click', () => fit());
  $('#xAll').addEventListener('click', () => { ui.collapsed = M.collapseLevel(st, 5); saveUI(); renderTree(); fit(); });
  $('#cAll').addEventListener('click', () => setLevel(2));
  $('#lvlSel').addEventListener('change', (e) => { if (e.target.value !== '') setLevel(Number(e.target.value)); e.target.value = ''; });
  $('#railBtn').addEventListener('click', () => { const open = !document.body.classList.contains('rail-open'); document.body.classList.toggle('rail-open', open); $('#railBtn').setAttribute('aria-expanded', String(open)); });
  let qTm;
  $('#q').addEventListener('input', () => {
    clearTimeout(qTm);
    qTm = setTimeout(() => {
      filt.q = $('#q').value;
      if (filt.q.trim()) { for (const r of M.filterRows(M.allSheets(st), { q: filt.q })) openBranch(r.sub.id, r.seg.discipline, r.seg.id); const q = filt.q.trim().toLowerCase(); for (const sub of st.subs) for (const rd of sub.roads) if (rd.name.toLowerCase().includes(q)) { const g = sub.segments.find((x) => x.id === rd.sec); if (g) openBranch(sub.id, g.discipline, g.id); } }
      renderAll();
    }, 120);
  });
  for (const [id, v] of [['#bBoth', 'both'], ['#bDr', 'Drainage'], ['#bSw', 'SWP3']]) $(id).addEventListener('click', () => { ui.branch = v; saveUI(); renderAll(); });
  $('#idxBtn').addEventListener('click', openIndex);
  $('#csvBtn').addEventListener('click', () => openCSV());
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f || !/\.(csv|tsv|txt)$/i.test(f.name) || e.defaultPrevented) return; e.preventDefault(); const r = new FileReader(); r.onload = () => openCSV(String(r.result)); r.readAsText(f); });
  $('#lkBtn').addEventListener('click', () => { ui.links = !ui.links; saveUI(); renderTree(); });
  $('#lkSelBtn').addEventListener('click', () => { ui.linkSel = !ui.linkSel; if (ui.linkSel) ui.links = true; saveUI(); renderTree(); });
  for (const [id, k] of [['#fStatus', 'status'], ['#fOwner', 'owner'], ['#fDisc', 'discipline'], ['#fFlag', 'flag']]) $(id).addEventListener('change', (e) => { filt[k] = e.target.value; renderAll(); });
  $('#undoBtn').addEventListener('click', () => travel(-1));
  $('#redoBtn').addEventListener('click', () => travel(1));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key || '').toLowerCase() === 'k') { e.preventDefault(); if ($('#cmdk')) $('#cmdk').remove(); else openPalette(); }
  });
  $('#cmdkBtn').addEventListener('click', openPalette);
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase(), tg = document.activeElement && document.activeElement.tagName;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'y') && !/INPUT|TEXTAREA|SELECT/.test(tg) && $('#modal').hidden) {
      e.preventDefault(); travel(k === 'y' || e.shiftKey ? 1 : -1);
    }
  });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === 'Escape' && msel.size && $('#modal').hidden && !sel) { msel.clear(); renderAll(); return; }
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (sel) closeDrawer(); else if (typing) document.activeElement.blur(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !$('#modal').hidden) return;
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
    else if (e.key === 'l') { ui.view = ui.view === 'tree' ? 'list' : 'tree'; saveUI(); renderAll(); }
    else if (e.key === 'f') fit();
    else if (e.key === 'c') $('#lkBtn').click();
    else if (e.key === 'd') $('#themeBtn').click();
    else if (e.key === '?') openKeys();
    else if (/^[1-6]$/.test(e.key)) { ui.view = VIEWS[Number(e.key) - 1]; saveUI(); renderAll(); }
    else if (e.key === 'n') {
      e.preventDefault();
      if (sel && (sel.type === 'seg' || sel.type === 'sheet' || sel.type === 'road')) {
        const g = sel.type === 'seg' ? M.findSeg(st, sel.id).seg : sel.type === 'road' ? M.findRoad(st, sel.id).sec : M.findSheet(st, sel.id).seg;
        select_('seg', g.id); focusAdd(M.isPPSec(g) && sel.type !== 'sheet' ? 'addRoadName' : 'addSheetTitle');
      } else {
        const sub = sel && sel.type === 'sub' ? M.findSub(st, sel.id) : sel && sel.type === 'disc' ? M.findSub(st, sel.id.split(':')[0]) : M.orderedSubs(st)[0];
        const d = sel && sel.type === 'disc' ? sel.id.split(':')[1] : sel && sel.type === 'dtop' ? sel.id : 'Drainage';
        openBranch(sub.id, d); saveUI(); renderTree(); select_('disc', sub.id + ':' + d); focusAdd('qaTitle');
      }
    }
  });
  window.addEventListener('resize', () => { if (ui.view === 'tree') applyView(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { st = M.migrate(JSON.parse(e.newValue)); hist.cur = e.newValue; renderAll(); } });

  /* ---------- start ---------- */
  applyTheme();
  st = load();
  const needMigration = !st && !!localStorage.getItem(OLDKEY);
  if (!st) st = M.newState();
  $('#q').value = filt.q || '';
  renderAll();
  if (pendingMig) migrationNotice(); else if (pendingMig32) migrationNotice32(); else if (needMigration) migrationPanel(false); else flush();
})();
