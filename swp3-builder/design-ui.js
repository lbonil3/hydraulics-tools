/* Design tab: phone list of erosion and sediment controls, then a detail page. */
(function () {
  'use strict';
  var A, G = window.SwpGuide;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function idFromHash() {
    var m = /^#design\/([a-z0-9-]+)$/.exec(location.hash || '');
    return m ? m[1] : '';
  }
  function listHtml() {
    var h = '<div class="card"><h2>Erosion and sediment controls</h2>' +
      '<p class="lede">A field guide to the controls used on Texas road jobs: what each one does, where it belongs, and what usually goes wrong. Sketches are not to scale. Dimensions stay on the current TxDOT sheet.</p></div>';
    G.CATS.forEach(function (c) {
      var items = G.inCat(c.id);
      if (!items.length) return;
      h += '<h3 class="cat">' + esc(c.title) + '</h3><p class="catblurb">' + esc(c.blurb) + '</p><div class="mlist">';
      items.forEach(function (m) {
        h += '<button type="button" class="mrow" data-measure="' + esc(m.id) + '"><span class="nm">' + esc(m.name) + '</span><span class="bl">' + esc(m.one) + '</span></button>';
      });
      h += '</div>';
    });
    return h;
  }
  function bullets(title, arr) {
    if (!arr || !arr.length) return '';
    return '<h3>' + esc(title) + '</h3><ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }
  function detailHtml(m) {
    return '<button type="button" class="back" data-back="1">All controls</button>' +
      '<article class="card measure"><p class="sheet">' + esc(m.sheet) + '</p><h2 id="measureTitle">' + esc(m.name) + '</h2>' +
      '<p class="lede">' + esc(m.what) + '</p>' +
      '<figure class="fig">' + m.svg + '<figcaption>Schematic. Not a standard detail.</figcaption></figure>' +
      bullets('When and where', m.where) +
      bullets('Install', m.install) +
      bullets('Maintenance', m.maintain) +
      bullets('Common mistakes', m.mistakes) +
      '<p class="confirm">' + esc(m.confirm) + '</p>' +
      '<button type="button" class="btn sec block" data-back="1">All controls</button></article>';
  }
  function render() {
    var pane = document.getElementById('paneDesign');
    if (!pane || !A || A.ui.tab !== 'design') return;
    var item = G.byId(idFromHash());
    pane.innerHTML = item ? detailHtml(item) : listHtml();
    if (item) {
      var t = document.getElementById('measureTitle');
      if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
    }
  }
  function onClick(e) {
    var b = e.target.closest('[data-measure], [data-back]');
    if (!b || !b.closest('#paneDesign')) return;
    if (b.hasAttribute('data-back')) location.hash = '#design';
    else location.hash = '#design/' + b.getAttribute('data-measure');
  }
  function init(app) {
    if (A) return;
    A = app;
    document.getElementById('paneDesign').addEventListener('click', onClick);
    if (A.ui.tab === 'design') render();
  }
  window.SwpDesignUI = { init: init, render: render };
  if (window.SwpApp) window.SwpDesignUI.init(window.SwpApp);
})();
