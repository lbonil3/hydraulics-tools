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
| roadway.js | the Roadway + drainage lane: rules, extra normalizers, tab filters, CSV (the water rules in model.js are untouched) |
| cost.js | construction cost base: scope parser and line-by-line estimator (display only) |
| data/roadway.json, data/cost-prices.json | roadway snapshot; subset of bid-cost/prices.json used by cost.js |
| test.js, test-roadway.js | node national-radar/test.js (runs both) |

## Refreshing

node scripts/build-national.js (Node 20, no dependencies, about 3 minutes; the Acquisition Gateway forecast API is slow and has taken up to 16 minutes).
It downloads the public SAM.gov extract (about 210 MB, ETag-cached in scripts/.cache-national/, which is git-ignored).
If one source fails, its previous records are kept and marked stale.

Optional: a SAM_API_KEY secret switches on the SAM.gov API path (the adapter is not written yet; the public extract is used).

## Roadway + drainage lane (second mode, `#road`)

A separate switch at the top. The water / drainage > $20M rules above are unchanged.

- **Drainage fee > $5M** (confirmed): consultant engineering on a roadway / highway / bridge / corridor project where the SOURCE states a drainage-specific fee (a drainage discipline row, a drainage-titled contract, a subaward line item), strictly greater than $5,000,000.
- **Roadway fee stated (drainage share not stated)**: only a TOTAL roadway engineering fee is stated, strictly greater than $20,000,000, and the scope text names drainage / hydraulics / stormwater / storm drain / culvert / flood. Labeled "total fee, drainage share unknown". No drainage share is ever estimated.
- **Needs review**: a drainage figure found only by text parsing, weak roadway or engineering signals, or a stormwater program / permit-support contract.
- **Awards / competitors**: awarded or closed records, never mixed with upcoming/open.
- **Construction cost base** (display and CSV only): *stated* when the source gives a construction cost (field name and date shown); otherwise an *estimate* computed from the length, lane count and type the source text gives, using TxDOT low-bid averages from `bid-cost/prices.json` (Texas prices) and a typical section; otherwise *insufficient scope*. Every estimate is labeled **Estimate (not from source)**, shown as low / base / high with every quantity and unit price. Traffic control, mobilization, contingency, unit price band and the section assumptions are editable and labeled Assumed (TxDOT guidance states no fixed percentages). Escalation is a user input, default 0. Each record has an editable what-if form (type, length, lanes, drainage section, price basis, assumptions, per-line unit price overrides). Bridges, interchanges and intersections are never estimated.
- An estimated cost never feeds the $5M or $20M tests or any filter (tests in `test-roadway.js`).
- An "illustrative fee check" (design fee as a percent of construction cost) is NOT included: the published sources found (MassDOT, NCDOT, FHWA) give single ranges, not citable curves.
- Extra roadway-only sources: USAspending prime awards with drainage wording (>= $5M), USAspending subawards (>= $5M, drainage wording), WSDOT Projected Design Opportunities. Every source the water lane reads (SAM, TxDOT, Caltrans, NYC, Chicago, DHS, Acquisition Gateway) is also evaluated against the roadway rules. Sources tested but not built in are listed in the Data tab.
- NYC and Chicago are still read with their $20M floor, so a city drainage line item between $5M and $20M would not be seen from them.
