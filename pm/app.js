/* PM app: UI + encrypted persistence. Only storage key: localStorage['pm.vault.v1'] (ciphertext envelope). */
(function () {
  'use strict';
  const C = window.PMCrypto, M = window.PMModel;
  const KEY = 'pm.vault.v1';
  const BACKUP_DAYS = 14;
  const $ = (s, r) => (r || document).querySelector(s);

  let st = null;        // decrypted state (memory only while unlocked)
  let vk = null;        // { key, salt, iter }  key is a non-extractable CryptoKey
  let lastAct = Date.now();
  let saving = Promise.resolve();
  const filt = { status: '', owner: '', discipline: '', sub: '', q: '', overdue: false };

  /* ---------- tiny DOM helper (textContent only; never innerHTML with data) ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  function field(label, input, hint) {
    const id = input.id || (input.id = 'f' + M.uid());
    return h('div', { class: 'f' }, h('label', { for: id }, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
  }
  function select(opts, value, attrs) {
    return h('select', attrs, opts.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: v === value }, t);
    }));
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => t.classList.remove('on'), 3500);
  }
  function bar(pct, label) {
    return h('div', { class: 'bar' }, h('progress', { max: 100, value: pct, 'aria-label': label }), h('span', { class: 'pct' }, Math.round(pct) + '%'));
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function slug(s) { return String(s).toLowerCase().replace(/\s+/g, '-'); }
  function stBadge(s) { return h('span', { class: 'badge s-' + slug(s) }, s); }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- persistence ---------- */
  function readEnv() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save() {
    if (!st || !vk) return saving;
    const snap = JSON.parse(JSON.stringify(st));
    const k = vk;
    saving = saving.then(async () => {
      const env = await C.sealWithKey(k.key, k.salt, k.iter, snap, 'vault');
      if (vk === k) localStorage.setItem(KEY, JSON.stringify(env));
    }).catch((e) => toast('Save failed: ' + e.message));
    return saving;
  }
  function commit(fn) {
    try { const r = fn(); save(); return r; } catch (e) { toast(e.message); return undefined; }
  }

  /* ---------- lock / unlock ---------- */
  function showLock(msg) {
    document.body.classList.add('locked');
    $('#view').hidden = true; $('#view').replaceChildren();
    $('#nav').hidden = true; $('#lockBtn').hidden = true;
    $('#lock').hidden = false;
    const env = readEnv();
    const body = $('#lockBody');
    const err = h('p', { class: 'err', role: 'alert', 'aria-live': 'assertive' }, msg || '');
    if (!env) {
      $('#lockTitle').textContent = 'Set a passphrase';
      const p1 = h('input', { type: 'password', autocomplete: 'new-password', 'aria-describedby': 'passHint' });
      const p2 = h('input', { type: 'password', autocomplete: 'new-password', required: true });
      const f = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const issues = C.passIssues(p1.value, p2.value);
        if (issues.length) { err.textContent = issues.join(' '); return; }
        busy(f, true, 'Encrypting…');
        const fresh = M.newState();
        const r = await C.seal(p1.value, fresh, 'vault');
        p1.value = p2.value = '';
        localStorage.setItem(KEY, JSON.stringify(r.env));
        vk = { key: r.key, salt: r.salt, iter: r.iter };
        st = fresh;
        enter();
      } },
      h('p', { class: 'muted', id: 'passHint' }, 'First run on this device. Choose a passphrase of at least ' + C.MIN_PASS + ' characters — a short sentence of 4+ random words is strong and memorable.'),
      field('New passphrase', p1), field('Confirm passphrase', p2),
      h('p', { class: 'warn' }, 'There is no recovery. If you forget the passphrase, the data cannot be decrypted by anyone.'),
      err, h('button', { class: 'btn block', type: 'submit' }, 'Create encrypted project'));
      body.replaceChildren(f, restoreForm());
      p1.focus();
    } else {
      $('#lockTitle').textContent = 'Unlock';
      const p = h('input', { type: 'password', autocomplete: 'current-password', required: true });
      const f = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        busy(f, true, 'Unlocking…');
        try {
          const r = await C.open(p.value, readEnv(), 'vault');
          st = M.normalize(r.data);
          vk = { key: r.key, salt: r.salt, iter: r.iter };
          p.value = '';
          enter();
        } catch (ex) {
          busy(f, false);
          p.value = ''; p.focus();
          err.textContent = ex.code === 'DECRYPT' ? 'Wrong passphrase. Try again.' : 'Could not unlock: ' + ex.message;
        }
      } }, field('Passphrase', p), err, h('button', { class: 'btn block', type: 'submit' }, 'Unlock'));
      body.replaceChildren(f);
      p.focus();
    }
  }
  function busy(form, on, label) {
    const b = form.querySelector('button[type=submit]');
    if (!b.dataset.t) b.dataset.t = b.textContent;
    b.disabled = on; b.textContent = on ? label : b.dataset.t;
  }
  function restoreForm() {
    const file = h('input', { type: 'file', accept: '.json,application/json' });
    const p = h('input', { type: 'password', autocomplete: 'off' });
    const err = h('p', { class: 'err', role: 'alert' });
    const f = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      if (!file.files[0]) { err.textContent = 'Choose a backup file.'; return; }
      busy(f, true, 'Decrypting…');
      try {
        const env = JSON.parse(await file.files[0].text());
        const r = await C.open(p.value, env, 'backup');
        st = M.normalize(r.data);
        vk = { key: r.key, salt: r.salt, iter: r.iter };
        p.value = '';
        await save();
        enter();
        toast('Backup restored. Your passphrase is the one used for that backup.');
      } catch (ex) {
        busy(f, false);
        err.textContent = ex.code === 'DECRYPT' ? 'Wrong passphrase for this backup (or the file was modified).' : 'Could not read backup: ' + ex.message;
      }
    } }, field('Backup file', file), field('Backup passphrase', p), err, h('button', { class: 'btn sec block', type: 'submit' }, 'Restore'));
    return h('details', { class: 'restore' }, h('summary', {}, 'Restore from an encrypted backup instead'), f);
  }
  function lock(reason) {
    st = null; vk = null;
    showLock(reason || '');
  }
  function enter() {
    document.body.classList.remove('locked');
    $('#lock').hidden = true; $('#lockBody').replaceChildren();
    $('#view').hidden = false; $('#nav').hidden = false; $('#lockBtn').hidden = false;
    lastAct = Date.now();
    route();
  }

  /* ---------- auto-lock ---------- */
  ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    if (st && Date.now() - lastAct > (Number(st.settings.autoLockMin) || 5) * 60000) lock('Locked after inactivity.');
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && st && st.settings.lockOnHide) lock('Locked when the tab was hidden.');
  });
  $('#lockBtn').addEventListener('click', () => lock('Locked.'));

  /* ---------- routing ---------- */
  window.addEventListener('hashchange', route);
  function route() {
    if (!st) return;
    const [, a, b] = (location.hash || '#/').slice(1).split('/');
    let view, nav = a || 'dash';
    if (a === 'sub' && M.findSub(st, b)) { view = subView(M.findSub(st, b)); nav = 'subs'; }
    else if (a === 'seg' && M.findSeg(st, b)) { view = segView(M.findSeg(st, b)); nav = 'subs'; }
    else if (a === 'subs') view = subsView();
    else if (a === 'table') view = tableView();
    else if (a === 'settings') view = settingsView();
    else { view = dashView(); nav = 'dash'; }
    document.querySelectorAll('#nav a').forEach((x) => x.classList.toggle('on', x.dataset.nav === nav));
    $('#appTitle').textContent = st.project.name || 'Project Manager';
    const v = $('#view');
    const y = v.dataset.route === location.hash ? window.scrollY : 0;
    v.dataset.route = location.hash;
    v.replaceChildren(...[backupBanner(), view].filter(Boolean));
    window.scrollTo(0, y);
  }
  function rerender() { route(); }

  function backupBanner() {
    const days = st.lastBackup ? (Date.now() - Date.parse(st.lastBackup)) / 864e5 : Infinity;
    if (days <= BACKUP_DAYS) return null;
    return h('div', { class: 'banner', role: 'note' },
      st.lastBackup ? 'Last encrypted backup was ' + Math.floor(days) + ' days ago. ' : 'No encrypted backup yet. ',
      'Clearing browser data erases everything. ', h('a', { href: '#/settings' }, 'Export a backup'));
  }

  /* ---------- views ---------- */
  function dashView() {
    const S = M.summary(st);
    const o = S.overall;
    return h('div', {},
      h('section', { class: 'card' },
        h('h2', {}, 'Overall progress'),
        bar(o.pct, 'Overall progress'),
        h('p', { class: 'muted' }, o.total + ' sheets · ' + o.done + ' done (' + o.donePct + '%). Weighted: In progress 40%, In review 80%, Done 100%.'),
        h('div', { class: 'counts' }, M.STATUSES.map((s) => h('a', { class: 'count s-' + slug(s), href: '#/table', onclick: () => { resetFilt(); filt.status = s; } },
          h('b', {}, o.counts[s]), h('span', {}, s))))),
      h('section', { class: 'card' },
        h('h2', {}, 'Sub-projects'),
        h('ul', { class: 'plain' }, S.subs.map((x) => h('li', { class: 'subrow' },
          h('a', { href: '#/sub/' + x.sub.id, class: 'subname' }, h('span', { class: 'code' }, x.sub.code), x.sub.name),
          bar(x.pct, 'Progress ' + x.sub.name),
          h('small', { class: 'muted' }, plural(x.sub.segments.length, 'segment') + ' · ' + x.total + ' sheets · ' + x.done + ' done'))))),
      h('section', { class: 'card' },
        h('h2', {}, 'Overdue sheets (' + S.overdue.length + ')'),
        S.overdue.length ? h('ul', { class: 'plain' }, S.overdue.slice(0, 15).map((r) => h('li', { class: 'odrow' },
          h('a', { href: '#/seg/' + r.seg.id }, r.sub.code + ' · ' + r.seg.name + ' — ' + r.sh.title),
          h('small', { class: 'over' }, ' due ' + r.sh.due + (r.sh.owner ? ' · ' + r.sh.owner : '') + ' · ' + r.sh.status))))
          : h('p', { class: 'muted' }, 'Nothing overdue.'),
        S.overdue.length > 15 ? h('a', { href: '#/table', onclick: () => { resetFilt(); filt.overdue = true; } }, 'See all overdue') : null),
      h('section', { class: 'card' },
        h('h2', {}, 'Workload by owner'),
        S.workload.length ? h('table', { class: 'wl' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Owner'), h('th', { scope: 'col' }, 'Open'), h('th', { scope: 'col' }, 'Overdue'), h('th', { scope: 'col' }, 'Done'))),
          h('tbody', {}, S.workload.map((w) => h('tr', {},
            h('th', { scope: 'row' }, h('a', { href: '#/table', onclick: () => { resetFilt(); filt.owner = w.owner; } }, w.owner)),
            h('td', {}, w.open), h('td', { class: w.overdue ? 'over' : '' }, w.overdue), h('td', {}, w.done)))))
          : h('p', { class: 'muted' }, 'No sheets yet. Open a sub-project to add segments and sheets.')));
  }
  function resetFilt() { Object.assign(filt, { status: '', owner: '', discipline: '', sub: '', q: '', overdue: false }); }

  function subsView() {
    return h('div', {}, st.subs.map((sub) => {
      const p = M.progress(sub.segments.flatMap((s) => s.sheets));
      return h('a', { class: 'card linkcard', href: '#/sub/' + sub.id },
        h('h2', {}, h('span', { class: 'code' }, sub.code), sub.name), bar(p.pct, 'Progress ' + sub.name),
        h('small', { class: 'muted' }, plural(sub.segments.length, 'segment') + ' · ' + p.total + ' sheets'));
    }));
  }

  function segForm(sub, seg, onDone) {
    const name = h('input', { value: seg ? seg.name : '', required: true, placeholder: 'e.g. Mainlane north' });
    const road = h('input', { value: seg ? seg.road : '', placeholder: 'e.g. FM 1960' });
    const a = h('input', { value: seg ? M.formatStation(seg.start) : '', required: true, placeholder: '10+00', inputmode: 'decimal', autocomplete: 'off' });
    const b = h('input', { value: seg ? M.formatStation(seg.end) : '', required: true, placeholder: '25+50', inputmode: 'decimal', autocomplete: 'off' });
    const msg = h('p', { class: 'err', role: 'alert' });
    return h('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      const f = { name: name.value, road: road.value, start: a.value, end: b.value };
      try {
        const r = seg ? M.updateSegment(st, seg.id, f) : M.addSegment(st, sub.id, f);
        save();
        if (r.warns.length) toast('Saved. Warning: ' + r.warns.join(' '));
        else toast(seg ? 'Segment updated.' : 'Segment added.');
        onDone(r.seg);
      } catch (ex) { msg.textContent = ex.message; }
    } }, h('div', { class: 'grid2' }, field('Segment name', name), field('Road', road), field('Start station', a, 'Format 10+00'), field('End station', b, 'Format 25+50')),
    msg, h('button', { class: 'btn', type: 'submit' }, seg ? 'Save segment' : 'Add segment'));
  }

  function subView(sub) {
    const all = sub.segments.flatMap((s) => s.sheets);
    const p = M.progress(all);
    const nameIn = h('input', { value: sub.name, 'aria-label': 'Sub-project name', onchange: () => commit(() => { sub.name = nameIn.value.trim() || sub.name; }) });
    return h('div', {},
      h('p', { class: 'crumb' }, h('a', { href: '#/subs' }, 'Sub-projects'), ' › ', sub.code),
      h('section', { class: 'card' },
        h('h2', {}, h('span', { class: 'code' }, sub.code), sub.name),
        field('Name', nameIn),
        bar(p.pct, 'Progress ' + sub.name),
        h('p', { class: 'muted' }, M.STATUSES.map((s) => s + ': ' + p.counts[s]).join(' · '))),
      h('section', { class: 'card' },
        h('h2', {}, 'Stations / segments (' + sub.segments.length + ')'),
        sub.segments.length ? h('ul', { class: 'plain segs' }, sub.segments.map((seg) => {
          const sp = M.progress(seg.sheets);
          const w = M.overlaps(seg, sub.segments);
          return h('li', {}, h('a', { class: 'segrow', href: '#/seg/' + seg.id },
            h('span', { class: 'sta' }, M.formatStation(seg.start) + ' – ' + M.formatStation(seg.end)),
            h('span', { class: 'segname' }, seg.name + (seg.road ? ' · ' + seg.road : '')),
            bar(sp.pct, 'Progress ' + seg.name),
            h('small', { class: 'muted' }, seg.sheets.length + ' sheets · ' + Math.round(seg.end - seg.start).toLocaleString() + ' ft' + (w.length ? ' · ⚠ overlaps ' + w.map((x) => x.name).join(', ') : ''))));
        })) : h('p', { class: 'muted' }, 'No segments yet.'),
        h('details', { class: 'add', open: !sub.segments.length }, h('summary', {}, '+ Add segment'), segForm(sub, null, (seg) => { location.hash = '#/seg/' + seg.id; }))),
      templatesCard(sub));
  }

  function templatesCard(sub) {
    const title = h('input', { placeholder: 'Sheet title', 'aria-label': 'New template title' });
    const disc = select(M.DISCIPLINES, 'Drainage', { 'aria-label': 'New template discipline' });
    return h('section', { class: 'card' },
      h('details', {}, h('summary', {}, h('h2', { class: 'inl' }, 'Standard sheet set for ' + sub.code + ' (' + sub.templates.length + ')')),
        h('p', { class: 'muted' }, 'Used by “Add standard sheet set” on each segment. Edits apply to this sub-project only.'),
        h('ul', { class: 'plain tpls' }, sub.templates.map((t) => {
          const ti = h('input', { value: t.title, 'aria-label': 'Template title', onchange: () => commit(() => M.updateTemplate(st, sub.id, t.id, { title: ti.value })) });
          const di = select(M.DISCIPLINES, t.discipline, { 'aria-label': 'Template discipline', onchange: () => commit(() => M.updateTemplate(st, sub.id, t.id, { discipline: di.value })) });
          return h('li', { class: 'tpl' }, ti, di,
            h('button', { type: 'button', class: 'btn sec sm', 'aria-label': 'Duplicate template ' + t.title, onclick: () => { commit(() => M.duplicateTemplate(st, sub.id, t.id)); rerender(); } }, 'Duplicate'),
            h('button', { type: 'button', class: 'btn danger sm', 'aria-label': 'Delete template ' + t.title, onclick: () => { commit(() => M.deleteTemplate(st, sub.id, t.id)); rerender(); } }, 'Delete'));
        })),
        h('form', { class: 'tpl', onsubmit: (e) => { e.preventDefault(); if (!title.value.trim()) return; commit(() => M.addTemplate(st, sub.id, { title: title.value, discipline: disc.value })); rerender(); } },
          title, disc, h('button', { class: 'btn sm', type: 'submit' }, 'Add')),
        h('button', { type: 'button', class: 'btn sec sm', onclick: () => { if (confirm('Replace ' + sub.code + "'s sheet set with the defaults?")) { commit(() => M.resetTemplates(st, sub.id)); rerender(); } } }, 'Reset to defaults')));
  }

  function ownerSelect(sh, onChange) {
    const opts = [['', '(unassigned)']].concat(st.staff.map((s) => [s, s]));
    if (sh.owner && !st.staff.includes(sh.owner)) opts.push([sh.owner, sh.owner]);
    opts.push(['__new', '+ New person…']);
    const s = select(opts, sh.owner, { 'aria-label': 'Owner of ' + sh.title });
    s.addEventListener('change', () => {
      let v = s.value;
      if (v === '__new') {
        v = (prompt('Staff name') || '').trim();
        if (!v) { s.value = sh.owner; return; }
      }
      commit(() => { M.addStaff(st, v); M.updateSheet(st, sh.id, { owner: v }); });
      onChange(true);
    });
    return s;
  }

  function sheetRow(r, ctx, onChange) {
    const sh = r.sh;
    const status = select(M.STATUSES, sh.status, { 'aria-label': 'Status of ' + sh.title, class: 'stsel s-' + slug(sh.status) });
    status.addEventListener('change', () => { commit(() => M.updateSheet(st, sh.id, { status: status.value })); status.className = 'stsel s-' + slug(status.value); onChange(); });
    const due = h('input', { type: 'date', value: sh.due, 'aria-label': 'Due date of ' + sh.title, onchange: () => { commit(() => M.updateSheet(st, sh.id, { due: due.value })); onChange(); } });
    const notes = h('textarea', { 'aria-label': 'Notes for ' + sh.title, rows: 2, placeholder: 'Notes', onchange: () => commit(() => M.updateSheet(st, sh.id, { notes: notes.value })) });
    notes.value = sh.notes || '';
    const title = h('input', { class: 'ttl', value: sh.title, 'aria-label': 'Sheet title', onchange: () => commit(() => M.updateSheet(st, sh.id, { title: title.value.trim() || sh.title })) });
    const disc = select(M.DISCIPLINES, sh.discipline, { 'aria-label': 'Discipline of ' + sh.title, onchange: () => { commit(() => M.updateSheet(st, sh.id, { discipline: disc.value })); onChange(); } });
    const over = M.isOverdue(sh, M.todayISO());
    return h('li', { class: 'sheet' + (over ? ' overdue' : '') + (sh.status === 'Done' ? ' done' : ''), 'data-id': sh.id },
      ctx ? h('a', { class: 'ctx', href: '#/seg/' + r.seg.id }, r.sub.code + ' · ' + r.seg.name + ' (' + M.formatStation(r.seg.start) + '–' + M.formatStation(r.seg.end) + ')') : null,
      h('div', { class: 'srow' },
        h('div', { class: 'c-title' }, title, over ? h('small', { class: 'over' }, 'Overdue') : null),
        h('div', { class: 'c-st' }, status),
        h('div', { class: 'c-own' }, ownerSelect(sh, onChange)),
        h('div', { class: 'c-due' }, due),
        h('div', { class: 'c-disc' }, disc)),
      h('div', { class: 'srow2' }, notes,
        h('div', { class: 'acts' },
          h('button', { type: 'button', class: 'btn sec sm', 'aria-label': 'Duplicate ' + sh.title, onclick: () => { commit(() => M.duplicateSheet(st, sh.id)); onChange(true); } }, 'Duplicate'),
          h('button', { type: 'button', class: 'btn danger sm', 'aria-label': 'Delete ' + sh.title, onclick: () => { if (confirm('Delete sheet “' + sh.title + '”?')) { commit(() => M.deleteSheet(st, sh.id)); onChange(true); } } }, 'Delete'))));
  }

  function segView(hit) {
    const { sub, seg } = hit;
    const p = M.progress(seg.sheets);
    const progBox = h('div', {}, bar(p.pct, 'Progress ' + seg.name), h('p', { class: 'muted' }, M.STATUSES.map((s) => s + ': ' + p.counts[s]).join(' · ')));
    const refresh = (full) => {
      if (full) return rerender();
      const q = M.progress(seg.sheets);
      progBox.replaceChildren(bar(q.pct, 'Progress ' + seg.name), h('p', { class: 'muted' }, M.STATUSES.map((s) => s + ': ' + q.counts[s]).join(' · ')));
    };
    const nt = h('input', { placeholder: 'Sheet title', 'aria-label': 'New sheet title', list: 'tplList' });
    const nd = select(M.DISCIPLINES, 'Drainage', { 'aria-label': 'New sheet discipline' });
    const bdisc = select([['', 'All disciplines'], ['Drainage', 'Drainage only'], ['SWP3', 'SWP3 only']], '', { 'aria-label': 'Which standard sheets' });
    const bown = select([['', '(unassigned)']].concat(st.staff), '', { 'aria-label': 'Owner for added sheets' });
    const bdue = h('input', { type: 'date', 'aria-label': 'Due date for added sheets' });
    return h('div', {},
      h('p', { class: 'crumb' }, h('a', { href: '#/subs' }, 'Sub-projects'), ' › ', h('a', { href: '#/sub/' + sub.id }, sub.code), ' › ', seg.name),
      h('section', { class: 'card' },
        h('h2', {}, seg.name),
        h('p', { class: 'sta big' }, 'Sta ' + M.formatStation(seg.start) + ' to ' + M.formatStation(seg.end) + (seg.road ? ' · ' + seg.road : '') + ' · ' + Math.round(seg.end - seg.start).toLocaleString() + ' ft'),
        progBox,
        h('details', {}, h('summary', {}, 'Edit segment'), segForm(sub, seg, () => rerender()),
          h('button', { type: 'button', class: 'btn danger sm', onclick: () => { if (confirm('Delete segment “' + seg.name + '” and its ' + seg.sheets.length + ' sheets?')) { commit(() => M.deleteSegment(st, seg.id)); location.hash = '#/sub/' + sub.id; } } }, 'Delete segment'))),
      h('section', { class: 'card' },
        h('h2', {}, 'Sheets (' + seg.sheets.length + ')'),
        h('form', { class: 'bulk', onsubmit: (e) => {
          e.preventDefault();
          const added = commit(() => M.bulkAddTemplates(st, seg.id, { discipline: bdisc.value, owner: bown.value, due: bdue.value })) || [];
          toast(added.length ? 'Added ' + added.length + ' standard sheets.' : 'All standard sheets are already on this segment.');
          rerender();
        } }, h('b', {}, 'Add standard sheet set'), bdisc, bown, bdue, h('button', { class: 'btn', type: 'submit' }, 'Add set')),
        seg.sheets.length ? h('ul', { class: 'plain sheets' }, seg.sheets.map((sh) => sheetRow({ sub, seg, sh }, false, refresh)))
          : h('p', { class: 'muted' }, 'No sheets yet — add the standard set above or one at a time below.'),
        h('datalist', { id: 'tplList' }, sub.templates.map((t) => h('option', { value: t.title }))),
        h('form', { class: 'tpl', onsubmit: (e) => {
          e.preventDefault();
          if (!nt.value.trim()) return;
          commit(() => M.addSheet(st, seg.id, { title: nt.value, discipline: nd.value }));
          rerender();
        } }, nt, nd, h('button', { class: 'btn sm', type: 'submit' }, 'Add sheet'))));
  }

  function tableView() {
    const rows = M.allSheets(st);
    const owners = [['', 'All'], ['(unassigned)', '(unassigned)']].concat([...new Set(st.staff.concat(rows.map((r) => r.sh.owner).filter(Boolean)))].sort().map((o) => [o, o]));
    const list = h('ul', { class: 'plain sheets table' });
    const count = h('p', { class: 'muted', 'aria-live': 'polite' });
    const draw = () => {
      const out = M.filterRows(rows, filt);
      count.textContent = out.length + ' of ' + rows.length + ' sheets';
      list.replaceChildren(...out.map((r) => sheetRow(r, true, (full) => { if (full) rerender(); })));
    };
    const ctl = (el, k) => { el.addEventListener(el.type === 'search' ? 'input' : 'change', () => { filt[k] = el.type === 'checkbox' ? el.checked : el.value; draw(); }); return el; };
    const view = h('div', {},
      h('section', { class: 'card' },
        h('h2', {}, 'All sheets — A to D'),
        h('div', { class: 'filters' },
          field('Search', ctl(h('input', { type: 'search', value: filt.q, placeholder: 'Title, segment, road, notes…' }), 'q')),
          field('Status', ctl(select([['', 'All']].concat(M.STATUSES), filt.status), 'status')),
          field('Owner', ctl(select(owners, filt.owner), 'owner')),
          field('Discipline', ctl(select([['', 'All'], 'Drainage', 'SWP3'], filt.discipline), 'discipline')),
          field('Sub-project', ctl(select([['', 'A–D']].concat(st.subs.map((s) => [s.id, s.code + ' · ' + s.name])), filt.sub), 'sub')),
          h('label', { class: 'chk' }, ctl(h('input', { type: 'checkbox', checked: filt.overdue }), 'overdue'), ' Overdue only')),
        h('div', { class: 'row' }, count,
          h('button', { type: 'button', class: 'btn sec', onclick: () => {
            if (!confirm('The CSV file is NOT encrypted. Anyone who gets the file can read it. Export the ' + M.filterRows(rows, filt).length + ' filtered sheets anyway?')) return;
            download('pm-sheets-' + M.todayISO() + '.csv', '\ufeff' + M.toCSV(M.filterRows(rows, filt)), 'text/csv');
          } }, 'Export CSV (unencrypted)'))),
      list);
    draw();
    return view;
  }

  function settingsView() {
    const pn = h('input', { value: st.project.name, onchange: () => { commit(() => { st.project.name = pn.value.trim() || st.project.name; }); rerender(); } });
    const al = h('input', { type: 'number', min: 1, max: 240, step: 1, value: st.settings.autoLockMin, inputmode: 'numeric',
      onchange: () => { const v = Math.min(240, Math.max(1, Math.round(Number(al.value) || 5))); al.value = v; commit(() => { st.settings.autoLockMin = v; }); } });
    const oh = h('input', { type: 'checkbox', checked: !!st.settings.lockOnHide, onchange: () => commit(() => { st.settings.lockOnHide = oh.checked; }) });
    const staffIn = h('input', { placeholder: 'Name', 'aria-label': 'New staff name' });
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const n1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const n2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const cpErr = h('p', { class: 'err', role: 'alert' });
    const impFile = h('input', { type: 'file', accept: '.json,application/json' });
    const impPass = h('input', { type: 'password', autocomplete: 'off' });
    const impErr = h('p', { class: 'err', role: 'alert' });
    const lb = st.lastBackup ? new Date(st.lastBackup).toLocaleString() : 'never';
    return h('div', {},
      h('section', { class: 'card' }, h('h2', {}, 'Backup'),
        h('p', {}, 'Last backup: ', h('b', { id: 'lastBackup' }, lb)),
        h('p', { class: 'warn' }, 'The backup file is encrypted with your current passphrase. If you forget the passphrase, the backup cannot be opened — by you or anyone.'),
        h('button', { type: 'button', class: 'btn', id: 'exportBtn', onclick: async () => {
          st.lastBackup = new Date().toISOString();
          const env = await C.sealWithKey(vk.key, vk.salt, vk.iter, st, 'backup');
          download('pm-backup-' + M.todayISO() + '.json', JSON.stringify(env), 'application/json');
          await save();
          toast('Encrypted backup downloaded. Keep it somewhere safe (e.g. OneDrive or a USB drive).');
          rerender();
        } }, 'Export encrypted backup'),
        h('form', { class: 'stack imp', onsubmit: async (e) => {
          e.preventDefault();
          impErr.textContent = '';
          if (!impFile.files[0]) { impErr.textContent = 'Choose a backup file.'; return; }
          busy(e.target, true, 'Decrypting…');
          try {
            const r = await C.open(impPass.value, JSON.parse(await impFile.files[0].text()), 'backup');
            const data = M.normalize(r.data);
            const n = M.allSheets(data).length;
            busy(e.target, false);
            if (!confirm('Replace ALL current data (' + M.allSheets(st).length + ' sheets) with this backup (' + n + ' sheets, “' + data.project.name + '”)? This cannot be undone.')) return;
            st = data;
            impPass.value = '';
            await save();
            toast('Backup imported. It is now encrypted with your current passphrase.');
            location.hash = '#/';
            rerender();
          } catch (ex) {
            busy(e.target, false);
            impErr.textContent = ex.code === 'DECRYPT' ? 'Wrong passphrase for this backup (or the file was modified).' : 'Could not import: ' + ex.message;
          }
        } }, h('h3', {}, 'Import backup'), field('Backup file', impFile), field('Passphrase used for that backup', impPass), impErr,
          h('button', { class: 'btn sec', type: 'submit' }, 'Decrypt and import…'))),
      h('section', { class: 'card' }, h('h2', {}, 'Project'), field('Project name', pn)),
      h('section', { class: 'card' }, h('h2', {}, 'Staff list'),
        h('p', { class: 'muted' }, 'Names offered in the Owner dropdowns.'),
        h('ul', { class: 'plain staff' }, st.staff.map((s) => h('li', {}, h('span', {}, s),
          h('button', { type: 'button', class: 'btn danger sm', 'aria-label': 'Remove ' + s, onclick: () => { commit(() => M.removeStaff(st, s)); rerender(); } }, 'Remove')))),
        h('form', { class: 'tpl', onsubmit: (e) => { e.preventDefault(); commit(() => M.addStaff(st, staffIn.value)); rerender(); } }, staffIn, h('button', { class: 'btn sm', type: 'submit' }, 'Add'))),
      h('section', { class: 'card' }, h('h2', {}, 'Security'),
        field('Auto-lock after (minutes of inactivity)', al),
        h('label', { class: 'chk' }, oh, ' Also lock when this tab is hidden or the phone is locked'),
        h('form', { class: 'stack', onsubmit: async (e) => {
          e.preventDefault();
          cpErr.textContent = '';
          const issues = C.passIssues(n1.value, n2.value);
          if (issues.length) { cpErr.textContent = issues.join(' '); return; }
          busy(e.target, true, 'Re-encrypting…');
          try {
            await C.open(cur.value, readEnv(), 'vault');
            await saving;
            const r = await C.seal(n1.value, st, 'vault');
            localStorage.setItem(KEY, JSON.stringify(r.env));
            vk = { key: r.key, salt: r.salt, iter: r.iter };
            cur.value = n1.value = n2.value = '';
            busy(e.target, false);
            toast('Passphrase changed. Older backups still need the old passphrase — export a new backup.');
          } catch (ex) {
            busy(e.target, false);
            cpErr.textContent = ex.code === 'DECRYPT' ? 'Current passphrase is wrong.' : ex.message;
          }
        } }, h('h3', {}, 'Change passphrase'), field('Current passphrase', cur), field('New passphrase', n1, 'At least ' + C.MIN_PASS + ' characters'), field('Confirm new passphrase', n2), cpErr,
          h('button', { class: 'btn sec', type: 'submit' }, 'Change passphrase'))),
      h('section', { class: 'card' }, h('h2', {}, 'What this protects'),
        h('ul', {},
          h('li', {}, 'Everything is encrypted on this device with your passphrase (AES-GCM 256, key from PBKDF2-SHA-256, ' + C.ITER.toLocaleString() + ' rounds, random salt, new IV every save). Nothing is stored in plain text and nothing is sent over the network.'),
          h('li', {}, 'It protects against someone opening this page or reading browser storage without the passphrase.'),
          h('li', {}, 'It does NOT protect against clearing browser data, losing the device, or Safari evicting site data after weeks unused — only an exported backup protects against that.'),
          h('li', {}, 'While unlocked, data is readable on screen and in memory. Lock when stepping away.'),
          h('li', {}, 'CSV exports are plain text.')),
        h('button', { type: 'button', class: 'btn danger', onclick: () => {
          if (prompt('Type ERASE to permanently delete the encrypted project from this browser.') === 'ERASE') { localStorage.removeItem(KEY); lock('All data erased from this browser.'); }
        } }, 'Erase all data on this device')));
  }

  showLock();
})();
