/* Project Tracker v3.20: report font choices.
   A display preference only. It is not project data and it is not written into pm.data.v3.
   Browser: window.PMReportFont. Node: require('./reportfont.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMReportFont = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FONTS = [
    {
      id: 'source',
      name: 'Source Sans',
      note: 'Source Sans 3 for the body, Source Serif 4 for headings, tabular figures in tables',
      body: '"Source Sans 3", sans-serif',
      heading: '"Source Serif 4", Georgia, serif',
      num: '"Source Sans 3", sans-serif',
    },
    {
      id: 'inter',
      name: 'Inter',
      note: 'Inter for the body, the headings, and the tables',
      body: 'Inter, sans-serif',
      heading: 'Inter, sans-serif',
      num: 'Inter, sans-serif',
    },
    {
      id: 'plex',
      name: 'IBM Plex',
      note: 'IBM Plex Sans, with IBM Plex Mono for the figures in tables',
      body: '"IBM Plex Sans", sans-serif',
      heading: '"IBM Plex Sans", sans-serif',
      num: '"IBM Plex Figures", "IBM Plex Sans", sans-serif',
    },
    {
      id: 'calibri',
      name: 'Calibri',
      note: 'Calibri and Cambria. Falls back to Carlito and Caladea, then Arial and Georgia',
      body: 'Calibri, Carlito, Arial, sans-serif',
      heading: 'Cambria, Caladea, Georgia, serif',
      num: 'Calibri, Carlito, Arial, sans-serif',
    },
  ];
  function reportFont(id) {
    return FONTS.find((f) => f.id === id) || FONTS[0];
  }
  return { FONTS, reportFont, DEFAULT: 'source' };
});
