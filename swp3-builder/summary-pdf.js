/* SWP3 Builder: writes the draw plan from summary.js onto the official TxDOT SWP3 Summary Sheet PDF with pdf-lib (vendored, runs offline in the browser and in Node).
 * The official sheets are flat PDFs (no form fields), so text and check marks are drawn at the measured positions in summary-layout.js.
 * build(PDFLib, srcBytes, plan, opts) -> Promise<{ bytes, warnings }>. srcBytes = null makes a values-only PDF (no TxDOT artwork). */
(function (root) {
  var isNode = typeof module !== 'undefined' && module.exports;
  var S = isNode ? require('./summary.js') : root.SwpSummary;
  var INK = [0.04, 0.12, 0.42];

  function build(PDFLib, srcBytes, plan, opts) {
    opts = opts || {};
    var rgb = PDFLib.rgb, ink = rgb(INK[0], INK[1], INK[2]), white = rgb(1, 1, 1), black = rgb(0, 0, 0);
    var warnings = [];
    var prom = srcBytes ? PDFLib.PDFDocument.load(srcBytes, { updateMetadata: false }) : PDFLib.PDFDocument.create();
    return prom.then(function (doc) {
      return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
        var pages;
        if (!srcBytes) { doc.addPage([1224, 792]); doc.addPage([1224, 792]); }
        pages = doc.getPages();
        if (pages.length < 2) throw new Error('This PDF has ' + pages.length + ' page(s); the TxDOT SWP3 Summary Sheet has 2.');
        var cache = {};
        function safe(t) {
          t = String(t).replace(/[\u2013\u2014\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2265/g, '>=').replace(/\u2264/g, '<=').replace(/\u2022/g, '*').replace(/\s+/g, ' ');
          var out = '';
          for (var i = 0; i < t.length; i++) { var ch = t[i]; if (cache[ch] === undefined) { try { font.encodeText(ch); cache[ch] = ch; } catch (e) { cache[ch] = '?'; } } out += cache[ch]; }
          return out;
        }
        var measure = function (t, s) { return font.widthOfTextAtSize(t, s); };
        function box(p) { var b = pages[p - 1].getCropBox ? pages[p - 1].getCropBox() : pages[p - 1].getMediaBox(); return b; }
        function Y(p, y) { var b = box(p); return b.y + b.height - y; }
        function X(p, x) { return box(p).x + x; }
        function line(p, x0, y0, x1, y1, w) { pages[p - 1].drawLine({ start: { x: X(p, x0), y: Y(p, y0) }, end: { x: X(p, x1), y: Y(p, y1) }, thickness: w, color: black }); }
        function txt(p, t, x, yBase, size) { pages[p - 1].drawText(t, { x: X(p, x), y: Y(p, yBase), size: size, font: font, color: ink }); }
        function rectFill(p, x0, y0, x1, y1) { pages[p - 1].drawRectangle({ x: X(p, x0), y: Y(p, y1), width: x1 - x0, height: y1 - y0, color: white, borderWidth: 0 }); }
        function warn(id, msg) { warnings.push({ id: id, msg: msg }); }

        plan.ops.forEach(function (o) {
          var p = o.p;
          if (o.k === 'x') {
            if (o.pre) { rectFill(p, o.x - 1.8, o.y - 1.4, o.x + o.w + 1.8, o.y + o.h + 1.4); pages[p - 1].drawRectangle({ x: X(p, o.x), y: Y(p, o.y + o.h), width: o.w, height: o.h, borderColor: black, borderWidth: 0.6 }); }
            if (o.on) { var x0 = o.x - 0.8, x1 = o.x + o.w + 0.8, y0 = o.y + 0.7, y1 = o.y + o.h - 0.7; line(p, x0, y0, x1, y1, 1.1); line(p, x0, y1, x1, y0, 1.1); }
          } else if (o.k === 'text') {
            var t = safe(o.text), f = S.fitLines(measure, t, [o.x1 - o.x0 - 3], 1, o.size, 5.5);
            if (f.truncated) warn(o.id, 'Text is too long for its line and was cut off.');
            if (f.lines[0]) txt(p, f.lines[0], o.x0 + 1.5, o.y - 1.7, f.size);
          } else if (o.k === 'para') {
            var ws = o.lines.map(function (l) { return l.x1 - l.x0 - 3; }), g = S.fitLines(measure, safe(o.text), ws, o.lines.length, o.size, 5.5);
            if (g.truncated) warn(o.id, 'Text is too long for the lines on the sheet and was cut off.');
            g.lines.forEach(function (ln, i) { txt(p, ln, o.lines[i].x0 + 1.5, o.lines[i].y - 1.7, g.size); });
          } else if (o.k === 'cell') {
            var c = S.fitLines(measure, safe(o.text), [o.x1 - o.x0 - 2], 1, o.size, 4.5);
            if (c.truncated) warn(o.id, 'Text is too long for its title-block box and was cut off.');
            if (c.lines[0]) { var w = measure(c.lines[0], c.size); txt(p, c.lines[0], o.x0 + (o.x1 - o.x0 - w) / 2, (o.y0 + o.y1) / 2 + c.size * 0.34, c.size); }
          } else if (o.k === 'box') {
            var W = o.x1 - o.x0, H = o.y1 - o.y0, size = o.size, res = null;
            for (; size >= 5.5; size -= 0.25) { var ml = Math.floor(H / (size * 1.15)); if (ml < 1) continue; res = S.fitLines(measure, safe(o.text), [W], ml, size, size); if (!res.truncated) break; }
            if (!res || res.truncated) { size = 5.5; res = S.fitLines(measure, safe(o.text), [W], Math.max(1, Math.floor(H / (size * 1.15))), size, size); warn(o.id, 'Text is too long for its cell and was cut off.'); }
            res.lines.forEach(function (ln, i) { txt(p, ln, o.x0, o.y0 + size * 0.95 + i * size * 1.15, size); });
          } else if (o.k === 'wipe') { rectFill(p, o.x0, o.y0, o.x1, o.y1); }
        });
        if (!srcBytes && opts.footer !== false) [1, 2].forEach(function (p) { txt(p, 'SWP3 Builder values-only overlay. Contains no TxDOT artwork. Draft for engineer review; not signed or sealed.', 40, 786, 6); });
        doc.setProducer('SWP3 Builder (pdf-lib)'); doc.setSubject('Draft filled from SWP3 Builder. Not signed or sealed.');
        return doc.save().then(function (bytes) { return { bytes: bytes, warnings: warnings }; });
      });
    });
  }

  /* SHA-256 as hex (browser crypto.subtle or Node crypto) */
  function sha256(bytes) {
    if (isNode) { return Promise.resolve(require('crypto').createHash('sha256').update(Buffer.from(bytes)).digest('hex')); }
    return crypto.subtle.digest('SHA-256', bytes).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  var api = { build: build, sha256: sha256 };
  if (isNode) module.exports = api;
  root.SwpSummaryPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
