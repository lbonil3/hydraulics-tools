/* SWP3 Builder shell. Summary and Design only. Saved projects stay in localStorage under the same key. */
(function () {
  'use strict';
  var M = window.SwpModel, D = window.SwpData;
  var KEY = 'swp3-builder.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = M.esc;

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.projects) || !s.projects.length) {
      var p = M.newProject({ name: 'My TxDOT project' });
      return { projects: [p], activeId: p.id };
    }
    s.projects = s.projects.map(M.sanitizeProject).filter(Boolean);
    if (!s.projects.length) s.projects = [M.newProject({})];
    if (!s.projects.some(function (x) { return x.id === s.activeId; })) s.activeId = s.projects[0].id;
    return s;
  }
  var state = load();
  function tabFromHash() {
    var h = location.hash || '';
    if (h === '#design' || h.indexOf('#design/') === 0) return 'design';
    return 'summary';
  }
  var ui = { tab: tabFromHash() };
  var saveFailed = false;
  function save() {
    var p = cur(); if (p) p.updated = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify({ projects: state.projects, activeId: state.activeId }));
      saveFailed = false;
    } catch (e) {
      if (!saveFailed) toast('Could not save on this device (storage full or blocked).');
      saveFailed = true;
    }
  }
  function cur() { return state.projects.filter(function (p) { return p.id === state.activeId; })[0]; }
  var toastT;
  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function fileName(p, ext) {
    return (p.name || 'swp3').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) + '-swp3.' + ext;
  }
  function download(name, data, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function printHtml(html) {
    var pa = $('#printArea'); if (!pa) return;
    pa.innerHTML = html;
    var done = function () { pa.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { try { window.print(); } catch (e) { toast('Printing is not available here.'); } }, 60);
  }
  function renderProjSel() {
    var s = $('#projSel'); if (!s) return;
    s.innerHTML = state.projects.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === state.activeId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }
  function render() {
    renderProjSel();
    document.body.setAttribute('data-tab', ui.tab);
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      var on = b.getAttribute('data-t') === ui.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    if (ui.tab === 'design') { if (window.SwpDesignUI) window.SwpDesignUI.render(); }
    else if (window.SwpSummaryUI) window.SwpSummaryUI.render();
  }
  function setTab(t, fromHash) {
    ui.tab = t === 'design' ? 'design' : 'summary';
    if (!fromHash) {
      var next = ui.tab === 'design' ? (location.hash.indexOf('#design/') === 0 ? location.hash : '#design') : '#summary';
      if (location.hash !== next) history.pushState(null, '', next);
    }
    render();
    window.scrollTo(0, 0);
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'projSel') {
      state.activeId = e.target.value;
      save();
      render();
    }
  });
  document.addEventListener('click', function (e) {
    var tb = e.target.closest('#tabs button');
    if (!tb) return;
    var t = tb.getAttribute('data-t');
    if (t === 'design' && ui.tab === 'design' && location.hash.indexOf('#design/') === 0) {
      location.hash = '#design';
      return;
    }
    setTab(t);
  });
  window.addEventListener('hashchange', function () { setTab(tabFromHash(), true); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.SwpApp = {
    cur: cur, save: save, toast: toast, printHtml: printHtml, download: download, render: render,
    ui: ui, esc: esc, M: M, D: D, fileName: fileName, setTab: setTab
  };
  render();
  if (window.SwpDesignUI) window.SwpDesignUI.init(window.SwpApp);
  if (window.SwpSummaryUI) window.SwpSummaryUI.init(window.SwpApp);
})();
