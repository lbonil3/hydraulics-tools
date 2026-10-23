(function (root) {
  function renderProfile(el, analyzed, pathNodeIds) {
    if (!el) return;
    el.innerHTML = '<p class="viz-empty">HGL profile loading…</p>';
  }
  function pathFromOutfall(analyzed, endNodeId) {
    return [];
  }
  const API = { renderProfile: renderProfile, pathFromOutfall: pathFromOutfall };
  if (typeof module !== 'undefined') module.exports = API;
  else root.StormViz = API;
})(typeof window !== 'undefined' ? window : globalThis);
