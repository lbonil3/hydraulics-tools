/* Design tab: list of controls, then a detail page. On a wide screen both stay open. */
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
  function wide() {
    return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  }
  function listHtml() {
    var h = '<div class="card guideintro"><h2>Erosion and sediment controls</h2>' +
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
      '<div class="measure-grid"><div class="measure-figs"><figure class="fig">' + m.svg +
      '<figcaption>Schematic. Not a standard detail. Dimensions are on the current TxDOT sheet.</figcaption></figure></div>' +
      '<div class="measure-copy"><p class="lede">' + esc(m.what) + '</p>' +
      bullets('When and where', m.where) +
      bullets('Install', m.install) +
      bullets('Maintenance', m.maintain) +
      bullets('Common mistakes', m.mistakes) +
      '<p class="confirm">' + esc(m.confirm) + '</p></div></div>' +
      '<button type="button" class="btn sec block" data-back="1">All controls</button></article>';
  }
  function placeholderHtml() {
    return '<article class="card measure-empty"><h2>Pick a control</h2><p class="lede">The list stays on the left. Open one to see the sketch, where it belongs, and what usually goes wrong.</p></article>';
  }
  function render() {
    var pane = document.getElementById('paneDesign');
    if (!pane || !A || A.ui.tab !== 'design') return;
    var id = idFromHash();
    if (!id && wide() && (location.hash === '#design' || location.hash === '')) {
      location.replace('#design/silt-fence');
      return;
    }
    var item = G.byId(id);
    document.body.setAttribute('data-measure', item ? item.id : '');
    if (!pane.querySelector('.design-shell')) {
      pane.innerHTML = '<div class="design-shell"><div class="design-list" data-built="1">' + listHtml() + '</div><div class="design-detail"></div></div>';
    }
    var list = pane.querySelector('.design-list');
    Array.prototype.forEach.call(list.querySelectorAll('.mrow'), function (b) {
      var on = item && b.getAttribute('data-measure') === item.id;
      b.classList.toggle('on', !!on);
      if (on) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    var detail = pane.querySelector('.design-detail');
    var shown = detail.getAttribute('data-id') || '';
    var next = item ? item.id : '';
    if (shown !== next) {
      detail.innerHTML = item ? detailHtml(item) : placeholderHtml();
      detail.setAttribute('data-id', next);
      if (item) {
        var t = document.getElementById('measureTitle');
        if (t && !wide()) { t.setAttribute('tabindex', '-1'); t.focus(); }
      }
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
    window.addEventListener('resize', function () {
      if (A.ui.tab === 'design') render();
    });
    if (A.ui.tab === 'design') render();
  }
  window.SwpDesignUI = { init: init, render: render };
  if (window.SwpApp) window.SwpDesignUI.init(window.SwpApp);
})();
