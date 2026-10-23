(function (root) {
  function renderSection(el, row) {
    if (!el) return;
    el.innerHTML = row
      ? '<p class="viz-empty">Section sketch loading…</p>'
      : '<p class="viz-empty">Select a row</p>';
  }
  function renderProfile(el, rows) {
    if (!el) return;
    el.innerHTML = '<p class="viz-empty">Profile sketch loading…</p>';
  }
  const API = { renderSection, renderProfile };
  if (typeof module !== 'undefined') module.exports = API;
  else root.DitchTableViz = API;
})(typeof window !== 'undefined' ? window : globalThis);
