const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('home.css', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
let bad = 0;
const fail = (m) => { console.error(m); bad++; };

if (!/<title>Hydraulics Tools<\/title>/.test(html)) fail('document title should be Hydraulics Tools');
if (!/<h1>Hydraulics Tools<\/h1>/.test(html)) fail('page heading should be Hydraulics Tools');
if (/<h1>[^<]*Drainage Studio/.test(html)) fail('page heading still collides with Drainage Studio');
if (!/apple-mobile-web-app-title" content="Hydraulics Tools"/.test(html)) fail('apple web app title should be Hydraulics Tools');
if (!html.includes('home.css')) fail('missing home.css link');
if (!html.includes("Luis's Hydraulics Tools")) fail('missing eyebrow');
if (!html.includes('TxDOT-first roadside hydrology')) fail('missing subtitle');
if (!html.includes('Engineering aids — verify results with your own judgment.')) fail('missing footer disclaimer');
if (manifest.name !== 'Hydraulics Tools') fail('manifest name should be Hydraulics Tools, got ' + manifest.name);
if (manifest.short_name !== 'Hydraulics Tools') fail('manifest short_name should be Hydraulics Tools, got ' + manifest.short_name);
if (/<(input|form)\b/i.test(html)) fail('home should not add search or forms');
if (/recently/i.test(html)) fail('home should not add a recently-used section');

const groups = [
  { title: 'Design', hrefs: ['rational/index.html', 'drainage/index.html', 'storm/index.html', 'ditch-table/index.html', 'culvert/index.html'] },
  { title: 'Estimating', hrefs: ['bid-cost/index.html', 'pse-tracker/index.html'] },
  { title: 'Pursuits &amp; compliance', hrefs: ['capture-terminal/index.html', 'opportunity-radar/index.html', 'national-radar/index.html', 'swp3-builder/index.html', 'swp3-game/index.html'] },
];
const hrefs = groups.flatMap((g) => g.hrefs);
const classes = ['tool-tc', 'tool-drainage', 'tool-storm', 'tool-bid-cost', 'tool-ditch', 'tool-culvert', 'tool-pse', 'tool-capture', 'tool-radar', 'tool-national', 'tool-swp3', 'tool-swp3-game'];
const names = ['Tc Studio', 'Drainage Studio', 'Storm Sewer', 'Bid Cost', 'Ditch', 'Culvert Studio', 'PS&amp;E Tracker', 'Capture Terminal', 'Opportunity Radar', 'National Radar', 'SWP3 Builder', 'SWP3 Designer (Game)'];

let cursor = 0;
for (const g of groups) {
  const h = html.indexOf('>' + g.title + '<', cursor);
  if (h < 0) { fail('missing group heading ' + g.title); continue; }
  cursor = h;
  for (const href of g.hrefs) {
    const i = html.indexOf('href="' + href + '"', cursor);
    if (i < 0) fail('missing or misordered href ' + href + ' in ' + g.title);
    else cursor = i;
  }
}
for (const c of classes) {
  if (!html.includes(c)) fail('missing class ' + c);
}
for (const name of names) {
  if (!html.includes(name)) fail('missing label ' + name);
}
if (html.includes('Ditch Studio') || html.includes('Ditch Table')) fail('old separate ditch cards still present');
if (html.includes('href="ditch/index.html"')) fail('home still links to ditch/index.html');

/* Tools whose own code keeps the user's records in localStorage. */
const localData = new Set([
  'storm/index.html',
  'ditch-table/index.html',
  'culvert/index.html',
  'pse-tracker/index.html',
  'capture-terminal/index.html',
  'swp3-builder/index.html',
]);
const cards = [...html.matchAll(/<a class="tool [^"]+" href="([^"]+)">([\s\S]*?)<\/a>/g)];
if (cards.length !== hrefs.length) fail('expected ' + hrefs.length + ' tool cards, found ' + cards.length);
const seen = new Set();
for (const card of cards) {
  const href = card[1];
  const body = card[2];
  seen.add(href);
  const desc = body.match(/<p>([^<]*)<\/p>/);
  if (!desc) fail(href + ' missing one-line description');
  else {
    const words = desc[1].trim().split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 8) fail(href + ' description should be 8 words or fewer, got ' + words.length + ': ' + desc[1]);
  }
  const marked = body.includes('Data stays on this device');
  if (localData.has(href) && !marked) fail(href + ' should be marked data stays on this device');
  if (!localData.has(href) && marked) fail(href + ' should not be marked data stays on this device');
}
for (const href of hrefs) {
  if (!seen.has(href)) fail('card parser missed ' + href);
}

if (!/grid-template-columns:[^;{]*repeat\(\s*2\s*,/.test(css)) fail('home.css should use a two-column card grid');
if (!/min-height:\s*44px/.test(css)) fail('home.css should keep a 44px minimum tap target');

if (bad) process.exit(1);
console.log('ok');
