#!/usr/bin/env node
/* Manual check (the form compares the bundled template by SHA-256; the categories list by its date line, else Last-Modified): has TxDOT published a newer Precertification Work Categories list or Application Form?
   Usage:  node scripts/refresh-precert-data.js            (report only; exit 0 = unchanged, 2 = changed/needs review, 1 = error)
           node scripts/refresh-precert-data.js --save DIR (also save the fetched .docx files to DIR for review)
   It fetches the two official .docx files, reads the Last-Modified header and the first MM/DD/YYYY date line inside each
   document, and compares them with the dates stored in precert/model.js (REF) and precert/categories.json.
   It changes nothing in the repo. To update, follow "Updating reference data" in precert/ROLLBACK.md. Needs Node 18+. */
'use strict';
const fs = require('fs'), path = require('path');
const M = require('../precert/model.js'), D = require('../precert/docx.js'), C = require('../precert/categories.json');
const save = process.argv.indexOf('--save') >= 0 ? process.argv[process.argv.indexOf('--save') + 1] : null;
const items = [
  { name: 'Work categories', url: M.REF.categoriesUrl, stored: M.REF.categoriesDate, json: C.docDate },
  { name: 'Application form', url: M.REF.formUrl, stored: M.REF.formDate, sha: require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../precert/form-template.docx'))).digest('hex') }
];
function docDate(buf) {
  const MON = 'january february march april may june july august september october november december'.split(' ');
  const xml = D.unzip(new Uint8Array(buf)).filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f.name)).sort((a, b) => (a.name === 'word/document.xml' ? -1 : 1)).map((f) => new TextDecoder().decode(f.data)).join(' ');
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  let m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text); if (m) return m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[3];
  m = new RegExp('\\b(' + MON.join('|') + ')\\s+(\\d{1,2}),\\s*(\\d{4})', 'i').exec(text); if (m) return String(MON.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[3];
  return null;
}
const lmDate = (lm) => { const d = lm && new Date(lm); return d && isFinite(d) ? String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear() : null; };
(async () => {
  let changed = false;
  console.log('Stored: ' + M.refLine() + ' (' + M.refAge().days + ' days ago)');
  for (const it of items) {
    const r = await fetch(it.url, { headers: { 'user-agent': 'hydraulics-tools precert refresh check' } });
    if (!r.ok) throw new Error(it.name + ': HTTP ' + r.status + ' for ' + it.url);
    const buf = Buffer.from(await r.arrayBuffer()), lm = r.headers.get('last-modified'), d = docDate(buf);
    const sha = require('crypto').createHash('sha256').update(buf).digest('hex');
    const same = it.sha ? it.sha === sha : (d || lmDate(lm)) === it.stored && (it.json == null || it.json === it.stored);
    if (!same) changed = true;
    console.log('\n' + it.name + '\n  url: ' + it.url + '\n  Last-Modified: ' + (lm || '(none)') + '\n  date line in document: ' + (d || '(not found)') + '\n  stored date: ' + it.stored + (it.json && it.json !== it.stored ? ' (categories.json says ' + it.json + ')' : '') + (it.sha ? '\n  bundled template matches: ' + (it.sha === sha ? 'yes' : 'NO') : '') + '\n  => ' + (same ? 'unchanged' : 'CHANGED — review and update (see precert/ROLLBACK.md)'));
    if (save) { fs.mkdirSync(save, { recursive: true }); fs.writeFileSync(path.join(save, path.basename(it.url)), buf); }
  }
  process.exit(changed ? 2 : 0);
})().catch((e) => { console.error('refresh check failed:', e.message); process.exit(1); });
