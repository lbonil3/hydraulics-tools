const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
let bad = 0;
const fail = (m) => { console.error(m); bad++; };
if (!html.includes('Drainage Studio')) fail('missing hero title Drainage Studio');
if (!html.includes('home.css')) fail('missing home.css link');
const hrefs = [
  'rational/index.html',
  'drainage/index.html',
  'ditch/index.html',
  'ditch-table/index.html',
  'culvert/index.html',
];
const classes = ['tool-tc', 'tool-drainage', 'tool-ditch', 'tool-table', 'tool-culvert'];
for (const h of hrefs) {
  if (!html.includes('href="' + h + '"')) fail('missing href ' + h);
}
for (const c of classes) {
  if (!html.includes(c)) fail('missing class ' + c);
}
const idx = hrefs.map((h) => html.indexOf('href="' + h + '"'));
for (let k = 1; k < idx.length; k++) {
  if (idx[k] < idx[k - 1]) fail('wrong card order near ' + hrefs[k]);
}
for (const name of ['Tc Studio', 'Ditch Studio', 'Ditch Table', 'Culvert Studio']) {
  if (!html.includes(name)) fail('missing label ' + name);
}
if (bad) process.exit(1);
console.log('ok');
