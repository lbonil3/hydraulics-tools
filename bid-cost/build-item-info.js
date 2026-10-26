#!/usr/bin/env node
/**
 * Build bid-cost/item-info.json: Item -> { title, summary, source }.
 * Official titles + summaries come from page 1 of each TxDOT 2024 Standard
 * Specification PDF (Item title line + "1. DESCRIPTION" text, first 1-2 sentences).
 * Items with no 2024 standard spec PDF get a generic "no 2024 standard spec" title and a
 * summary listing only their top bid-code descriptions (source "bid-data").
 * Usage: node bid-cost/build-item-info.js [cacheDir]   (needs curl + pdftotext)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('./lookup.js');
const dir = __dirname;
const cache = process.argv[2] || path.join(require('os').tmpdir(), 'txdot-specs-2024');
fs.mkdirSync(cache, { recursive: true });
const rows = require('./prices.json').rows;
const items = [...new Set(rows.map(r => L.itemFromBidCode(r.bid_code)))].sort();

function shorten(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const sents = t.match(/[^.]+\.(\s|$)/g) || [t];
  let out = sents[0].trim();
  if (out.length < 90 && sents[1]) out += ' ' + sents[1].trim();
  if (out.length > 240) out = out.slice(0, 237).replace(/\s+\S*$/, '') + '…';
  return out;
}

function fromSpec(item) {
  const pdf = path.join(cache, 's' + item + '.pdf');
  if (!fs.existsSync(pdf) || !fs.statSync(pdf).size) {
    execFileSync('curl', ['-skf', '-o', pdf, L.specPdfUrl(item)]);
  }
  const txt = execFileSync('pdftotext', ['-l', '2', pdf, '-'], { encoding: 'utf8' });
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
  const i = lines.findIndex(s => s === 'Item ' + item);
  if (i < 0) return null;
  const title = [];
  let j = i + 1;
  while (j < lines.length && !/^1\.$/.test(lines[j]) && !/^1\.\s/.test(lines[j]) && lines[j] !== 'DESCRIPTION') title.push(lines[j++]);
  while (j < lines.length && lines[j] !== 'DESCRIPTION' && !/DESCRIPTION$/.test(lines[j])) j++;
  const desc = [];
  for (j++; j < lines.length && !/^2\.(\s|$)/.test(lines[j]) && !/^2024 Specifications$/.test(lines[j]); j++) desc.push(lines[j]);
  if (!title.length) return null;
  return { title: title.join(' '), summary: desc.length ? shorten(desc.join(' ')) : undefined, source: 'spec-2024' };
}

function fromData(item) {
  // No official 2024 standard spec: do not invent a title. Report only what the
  // bid data says (most common descriptions), marked as such in the UI.
  const counts = {};
  rows.filter(r => L.itemFromBidCode(r.bid_code) === item).forEach(r => {
    const d = String(r.description || '').replace(/\s+/g, ' ').trim();
    if (d) counts[d] = (counts[d] || 0) + 1;
  });
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : 1)).slice(0, 2);
  if (!top.length) return null;
  return { title: 'Special/project item (no 2024 standard spec)', summary: 'Bid codes include: ' + top.join('; ') + '.', source: 'bid-data' };
}

const out = {};
let nSpec = 0, nData = 0;
items.forEach(item => {
  let e = null;
  if (L.hasSpecPdf(item)) { try { e = fromSpec(item); } catch (err) { e = null; } }
  if (e) nSpec++; else { e = fromData(item); if (e) nData++; }
  if (e) out[item] = e;
});
fs.writeFileSync(path.join(dir, 'item-info.json'), JSON.stringify({
  meta: { source: 'TxDOT 2024 Standard Specifications, ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/', note: 'source "bid-data" = title derived from bid-code descriptions; no official spec' },
  items: out
}, null, 1));
console.log('items', items.length, 'spec', nSpec, 'bid-data', nData);
