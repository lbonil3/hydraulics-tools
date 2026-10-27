# National Radar

Big consultant engineering opportunities for drainage, stormwater, flood, hydraulics, water and wastewater, in all states.
Phone-first static page (vanilla JS, no build step, works offline).

## The rule

A record is **confirmed** only if all of these hold, using what the source itself states:

1. Consultant engineering / A-E services (NAICS 541330, 541370, or 541620/541690 with engineering words; or an A-E list by definition). Never construction or supplies.
2. Drainage / stormwater / flood / hydraulics / coastal / water / wastewater wording (keyword match, labeled inferred).
3. A fee-type figure stated by the source that is **strictly greater than $20,000,000** ($20,000,000.00 fails, $20,000,000.01 passes).
4. Still upcoming or open. Awards go to **Awards / competitors**; awards ending within 18 months go to **Recompete watch** (inferred).

A project or construction cost is never a fee. It is shown as "project cost (not fee)". Nothing is estimated from construction cost.
Uncertain records go to **Needs review**; open or upcoming water-sector engineering notices that state no fee go to **Fee not stated**.

## Files

| File | What |
| --- | --- |
| model.js | rules, normalizers, dedupe, filters, CSV (shared by the browser, the build script and the tests) |
| app.js, index.html, style.css | the UI |
| proj.js, us-geo.js | map projection and state outlines (US Census TIGERweb, public domain) |
| sources.js | text for sources tested but not used, and the rules in plain words |
| data/national.json | the snapshot, written by scripts/build-national.js |
| workflow/refresh-national.yml | daily refresh; copy to .github/workflows/ to install |
| test.js | node national-radar/test.js |

## Refreshing

node scripts/build-national.js (Node 20, no dependencies, about 3 minutes; the Acquisition Gateway forecast API is slow and has taken up to 16 minutes).
It downloads the public SAM.gov extract (about 210 MB, ETag-cached in scripts/.cache-national/, which is git-ignored).
If one source fails, its previous records are kept and marked stale.

Optional: a SAM_API_KEY secret switches on the SAM.gov API path (the adapter is not written yet; the public extract is used).
