/* Minimal vanilla-JS zip reader (stored + deflate via a small built-in inflater) and zip writer (stored, CRC-32),
   plus the filler that writes values into TxDOT's official Precertification Application Form (form-template.docx).
   Works in the browser (window.PCDOCX) and in Node (module.exports). No external libraries, no network. */
(function (root) {
  'use strict';
  /* ---------- inflate (RFC 1951), compact implementation ---------- */
  function inflateRaw(src) {
    var out = new Uint8Array(Math.max(1024, src.length * 4)), op = 0, bp = 0, bb = 0, bc = 0;
    function need(n) { if (op + n > out.length) { var o = new Uint8Array(Math.max(out.length * 2, op + n)); o.set(out); out = o; } }
    function bits(n) { while (bc < n) { if (bp >= src.length) throw new Error('inflate: unexpected end'); bb |= src[bp++] << bc; bc += 8; } var v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v; }
    function build(lengths) { var max = 0, i; for (i = 0; i < lengths.length; i++) if (lengths[i] > max) max = lengths[i];
      var count = new Uint16Array(max + 1), offs = new Uint16Array(max + 2), sym = new Uint16Array(lengths.length);
      for (i = 0; i < lengths.length; i++) count[lengths[i]]++; count[0] = 0;
      for (i = 1; i <= max; i++) offs[i + 1] = offs[i] + count[i];
      for (i = 0; i < lengths.length; i++) if (lengths[i]) sym[offs[lengths[i]]++] = i;
      return { count: count, sym: sym, max: max }; }
    function decode(t) { var code = 0, first = 0, index = 0; for (var len = 1; len <= t.max; len++) { code |= bits(1); var c = t.count[len]; if (code - c < first) return t.sym[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; } throw new Error('inflate: bad code'); }
    var LB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258], LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
    var DB = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577], DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
    var fixL = null, fixD = null;
    function block(lt, dt) { for (;;) { var s = decode(lt); if (s < 256) { need(1); out[op++] = s; } else if (s === 256) return; else { s -= 257; if (s >= 29) throw new Error('inflate: bad length'); var len = LB[s] + bits(LE[s]), ds = decode(dt), dist = DB[ds] + bits(DE[ds]); if (dist > op) throw new Error('inflate: bad distance'); need(len); for (var k = 0; k < len; k++) { out[op] = out[op - dist]; op++; } } } }
    var last;
    do {
      last = bits(1); var type = bits(2);
      if (type === 0) { bb = 0; bc = 0; if (bp + 4 > src.length) throw new Error('inflate: bad stored'); var L = src[bp] | (src[bp + 1] << 8); bp += 4; need(L); out.set(src.subarray(bp, bp + L), op); op += L; bp += L; }
      else if (type === 1) { if (!fixL) { var l = new Uint8Array(288), i; for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8; fixL = build(l); var d = new Uint8Array(30); d.fill(5); fixD = build(d); } block(fixL, fixD); }
      else if (type === 2) {
        var hl = bits(5) + 257, hd = bits(5) + 1, hc = bits(4) + 4, ORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], cl = new Uint8Array(19), j;
        for (j = 0; j < hc; j++) cl[ORD[j]] = bits(3);
        var ct = build(cl), lens = new Uint8Array(hl + hd), n = 0;
        while (n < hl + hd) { var sym = decode(ct); if (sym < 16) lens[n++] = sym; else { var rep, val = 0; if (sym === 16) { if (!n) throw new Error('inflate: bad repeat'); val = lens[n - 1]; rep = 3 + bits(2); } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7); while (rep--) lens[n++] = val; } }
        block(build(lens.subarray(0, hl)), build(lens.subarray(hl)));
      } else throw new Error('inflate: bad block type');
    } while (!last);
    return out.subarray(0, op);
  }
  /* ---------- CRC-32 ---------- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /* ---------- zip read / write ---------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function unzip(buf) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), e = b.length - 22;
    while (e >= 0 && u32(b, e) !== 0x06054b50) e--; if (e < 0) throw new Error('Not a zip file');
    var n = u16(b, e + 10), p = u32(b, e + 16), files = [];
    for (var i = 0; i < n; i++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('Bad zip directory');
      var method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lo = u32(b, p + 42);
      var name = dec(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      var ds = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28), raw = b.subarray(ds, ds + csize);
      files.push({ name: name, data: method === 0 ? raw.slice() : method === 8 ? inflateRaw(raw).slice() : (function () { throw new Error('Unsupported zip method ' + method); })() });
    }
    return files;
  }
  function zip(files) {
    var parts = [], cen = [], off = 0, now = new Date(), dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(), tm = (now.getHours() << 11) | (now.getMinutes() << 5);
    files.forEach(function (f) {
      var nm = enc(f.name), d = f.data, c = crc32(d), h = new Uint8Array(30 + nm.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true); v.setUint16(10, tm, true); v.setUint16(12, dt, true);
      v.setUint32(14, c, true); v.setUint32(18, d.length, true); v.setUint32(22, d.length, true); v.setUint16(26, nm.length, true); h.set(nm, 30);
      var ch = new Uint8Array(46 + nm.length), w = new DataView(ch.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true); w.setUint16(12, tm, true); w.setUint16(14, dt, true);
      w.setUint32(16, c, true); w.setUint32(20, d.length, true); w.setUint32(24, d.length, true); w.setUint16(28, nm.length, true); w.setUint32(42, off, true); ch.set(nm, 46);
      parts.push(h, d); cen.push(ch); off += h.length + d.length;
    });
    var cs = cen.reduce(function (a, x) { return a + x.length; }, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
    var all = parts.concat(cen, [end]), out = new Uint8Array(all.reduce(function (a, x) { return a + x.length; }, 0)), o = 0;
    all.forEach(function (x) { out.set(x, o); o += x.length; }); return out;
  }
  function enc(s) { return new TextEncoder().encode(s); }
  function dec(b) { return new TextDecoder('utf-8').decode(b); }

  /* ---------- filling the official form ---------- */
  function xesc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function textOf(el) { return (el.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
  function splitBody(xml) {
    var a = xml.indexOf('<w:body>') + 8, z = xml.lastIndexOf('</w:body>'), body = xml.slice(a, z), els = [], re = /<w:p[ >][\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:sectPr[\s\S]*?<\/w:sectPr>/g, m;
    while ((m = re.exec(body))) els.push(m[0]);
    if (els.join('').length !== body.replace(/^\s+|\s+$/g, '').length) throw new Error('Unexpected form structure (template changed?)');
    return { head: xml.slice(0, a), els: els, tail: xml.slice(z) };
  }
  /* put values into the underlined blanks of a label line: each slot = first underlined tab run after a piece of label text */
  function fillSlots(p, values) {
    var re = /<w:r[ >][\s\S]*?<\/w:r>/g, m, slot = 0, seenText = false, out = '', last = 0;
    while ((m = re.exec(p))) {
      var r = m[0], hasT = /<w:t(?: [^>]*)?>[^<]*\S[^<]*<\/w:t>/.test(r), ul = /<w:u w:val="single"\/>/.test(r) && /<w:tab\/>/.test(r);
      if (hasT && !ul) { seenText = true; continue; }
      if (ul && seenText && slot < values.length) {
        var v = values[slot++]; seenText = false;
        if (v == null || v === '') continue;
        var rpr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || ['<w:rPr><w:u w:val="single"/></w:rPr>'])[0];
        out += p.slice(last, m.index) + '<w:r>' + rpr.replace('<w:u w:val="single"/>', '<w:b/><w:u w:val="single"/>') + '<w:t xml:space="preserve"> ' + xesc(v) + ' </w:t></w:r>';
        last = m.index;
      }
    }
    return out + p.slice(last);
  }
  function textParas(tpl, text) {
    var ppr = (tpl.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0].replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
    return String(text || '').split(/\r?\n/).map(function (line) { return '<w:p>' + ppr + '<w:r><w:t xml:space="preserve">' + xesc(line) + '</w:t></w:r></w:p>'; });
  }
  function cellFill(tc, v) { if (!v) return tc; return tc.replace(/(<w:p[ >][\s\S]*?)(<\/w:p>)/, function (m, a, b) { return a + '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + xesc(v) + '</w:t></w:r>' + b; }); }
  function fillTable(tbl, rows) {
    var trs = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g); var head = trs[0], body = trs.slice(1), tpl = body[body.length - 1];
    while (body.length < rows.length) body.push(tpl);
    var filled = body.map(function (tr, i) { var vals = rows[i] || []; var k = 0; return tr.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, function (tc) { return cellFill(tc, vals[k++]); }); });
    var a = tbl.indexOf(trs[0]), z = tbl.lastIndexOf(trs[trs.length - 1]) + trs[trs.length - 1].length;
    return tbl.slice(0, a) + head + filled.join('') + tbl.slice(z);
  }
  function findIdx(els, rx, from) { for (var i = from || 0; i < els.length; i++) if (rx.test(textOf(els[i]))) return i; return -1; }
  /* F = model.formData(); returns the new document.xml */
  function fillForm(xml, F) {
    var S = splitBody(xml), E = S.els, T = function (i) { return textOf(E[i]); };
    var line = function (rx, vals) { var i = findIdx(E, rx); if (i < 0) throw new Error('Form field not found: ' + rx); E[i] = fillSlots(E[i], vals); };
    line(/^Firm name\*/, [F.firm.name]); line(/^Firm sequence number\*/, [F.firm.seq]);
    line(/^First name\*/, [F.emp.first]); line(/^Middle name/, [F.emp.middle]); line(/^Last name\*/, [F.emp.last]);
    line(/^Personnel number/, [F.emp.personnelNo]); line(/^Branch number/, [F.emp.branch]); line(/^Employee Expertise/, [F.emp.expertise]);
    line(/^Former TxDOT employee\?/, F.emp.formerTxdot === true ? ['X', ''] : F.emp.formerTxdot === false ? ['', 'X'] : ['', '']);
    line(/^Employment status\*/, [F.emp.employment]); line(/^Employee sequence number/, [F.emp.seq]);
    /* precertification tables: one row per group, its categories across the 4 cells */
    var t1 = findIdx(E, /^Work Group\*/), t2 = findIdx(E, /^Work Category\*/);
    var rowsG = [], rowsC = [];
    F.precerts.forEach(function (g) { for (var i = 0; i < g.cats.length; i += 4) { rowsG.push([String(g.group)]); rowsC.push(g.cats.slice(i, i + 4)); } });
    E[t1] = fillTable(E[t1], rowsG); E[t2] = fillTable(E[t2], rowsC);
    /* certifications: Certification 1 block repeated / trimmed */
    var c1 = findIdx(E, /^Certification 1$/), pj = findIdx(E, /^Employee Projects$/);
    var cEnd = findIdx(E, /^Certification 2$/), certTpl = E.slice(c1, cEnd);
    var certs = (F.certs.length ? F.certs : [null]).map(function (c, n) {
      return certTpl.map(function (el, k) {
        var t = textOf(el);
        if (k === 0) return el.replace(/>Certification 1</, '>Certification ' + (n + 1) + '<').replace(/(<w:t(?: [^>]*)?>)1(<\/w:t>)/, '$1' + (n + 1) + '$2');
        if (!c) return el;
        var map = [[/^Work category/, c.category], [/^Degree type/, c.degreeType], [/^Training type/, c.trainingType], [/^Certification training date/, c.trainingDate], [/^Personnel\/laboratory/, c.certType], [/^Issue date/, c.issue], [/^Expiration date/, c.exp], [/^Completion date/, c.completion], [/^Employee certification number/, c.number], [/^Issuing agency/, c.agency]];
        for (var q = 0; q < map.length; q++) if (map[q][0].test(t)) return fillSlots(el, [map[q][1]]);
        return el;
      });
    });
    /* the block before "Employee Projects" (heading / notes) stays; locate the last cert block end = index of last element before the projects heading's preceding notes */
    var lastCertStart = -1; for (var i = c1; i < pj; i++) if (/^Certification \d+$/.test(T(i))) lastCertStart = i;
    var lastCertEnd = lastCertStart + certTpl.length;
    /* projects */
    var p1 = findIdx(E, /^Project 1$/), p2 = findIdx(E, /^Project 2$/), wg = findIdx(E, /^Work group/, p1);
    var projHead = E.slice(p1, wg), catTpl = E.slice(wg, wg + 5);
    var lastPStart = -1; for (i = p1; i < E.length; i++) if (/^Project \d+$/.test(T(i))) lastPStart = i;
    var sect = E.length - 1; while (sect > 0 && !/^<w:sectPr/.test(E[sect])) sect--;
    var projects = (F.projects.length ? F.projects : [null]).map(function (p, n) {
      var head = projHead.map(function (el, k) {
        var t = textOf(el);
        if (k === 0) return el.replace(/(<w:t(?: [^>]*)?>)([^<]*?)1(<\/w:t>)/, '$1$2' + (n + 1) + '$3');
        if (!p) return el;
        if (/^Project name/.test(t)) return fillSlots(el, [p.name]);
        if (/^Project begin date/.test(t)) return fillSlots(el, [p.begin, p.end]);
        if (/^Project location/.test(t)) return fillSlots(el, [p.location]);
        if (/^Estimated project fees/.test(t)) return fillSlots(el, [p.fees]);
        if (/^Estimated construction cost/.test(t)) return fillSlots(el, [p.cost]);
        return el;
      });
      if (p && p.desc) { var di = -1; head.forEach(function (el, k) { if (/^Project general description/.test(textOf(el))) di = k; }); if (di >= 0 && head[di + 1] && !textOf(head[di + 1]).trim()) head.splice.apply(head, [di + 1, 1].concat(textParas(head[di + 1], p.desc))); }
      var cats = (p && p.cats.length ? p.cats : [null]).map(function (c) {
        var blk = catTpl.slice(); if (!c) return blk;
        blk[0] = fillSlots(blk[0], [String(c.group), c.code]);
        if (c.text) blk.splice.apply(blk, [2, 3].concat(textParas(blk[2], c.text)));
        return blk;
      });
      return head.concat([].concat.apply([], cats));
    });
    var pre = E.slice(0, c1), mid = E.slice(lastCertEnd, p1), endEls = E.slice(sect);
    /* keep page-break paragraph between sections if present right before "Employee Projects" */
    var outEls = pre.concat([].concat.apply([], certs), mid, [].concat.apply([], projects.map(function (x, n) { return n ? [pageBreak()].concat(x) : x; })), endEls);
    if (F.example) outEls.splice(1, 0, exampleBanner(F.example));
    return S.head + outEls.join('') + S.tail;
  }
  function pageBreak() { return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; }
  function exampleBanner(t) { return '<w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="12" w:space="2" w:color="000000"/><w:bottom w:val="single" w:sz="12" w:space="2" w:color="000000"/></w:pBdr></w:pPr><w:r><w:rPr><w:b/><w:color w:val="B91C1C"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">' + xesc(t) + '</w:t></w:r></w:p>'; }
  /* build a filled .docx (Uint8Array) from the template bytes */
  function buildDocx(templateBytes, F) {
    var files = unzip(templateBytes), doc = files.filter(function (f) { return f.name === 'word/document.xml'; })[0];
    if (!doc) throw new Error('Template has no word/document.xml');
    doc.data = enc(fillForm(dec(doc.data), F));
    var core = files.filter(function (f) { return f.name === 'docProps/core.xml'; })[0];
    if (core) core.data = enc(dec(core.data).replace(/<dc:title>[^<]*<\/dc:title>/, '<dc:title>' + xesc((F.example ? 'EXAMPLE — ' : '') + 'Precertification Application Form (filled by TxDOT Precertification helper)') + '</dc:title>'));
    return zip(files);
  }
  var api = { inflateRaw: inflateRaw, crc32: crc32, unzip: unzip, zip: zip, fillForm: fillForm, fillSlots: fillSlots, buildDocx: buildDocx, textOf: textOf, splitBody: splitBody };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PCDOCX = api;
})(this);
