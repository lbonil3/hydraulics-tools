# National Radar

Phone-first static page (vanilla JS, no build step, works offline). Three views of the same public feeds, selected by the buttons under the banner:

- **PS&E / H&H, fee > $5M (default).** Consultant engineering services for PS&E / final design and hydrology and hydraulics (drainage, stormwater, floodplain, culverts, storm drains, coastal and resilience, water and wastewater design), all states, whose SOURCE states a fee or contract value. The threshold is an editable control (default strictly greater than $5,000,000, a one-tap "include exactly" toggle, and a visible note listing records at exactly the cutoff). Tabs: All, Upcoming / open, Forecast, Awarded, **Large projects, fee not published**, **Design-build**, Watchlist.
- **Preset: water, fee > $20M** and **Preset: roadway + drainage**: the two earlier, stricter lanes (below), unchanged.

## PS&E / H&H lens (`pse.js`, `data/pse.json`)

- **Badges, not gates.** `Confirmed` = engineering classification from a structured code or category, scope words in the title, amount from a structured field, status open / upcoming / forecast / awarded. Everything else that passes the scope and amount tests is shown as `Unconfirmed` with the reasons: `Text-parsed` (amount read from free text), `Inferred sector` (scope words only in the description), `Range lower bound`, `Status unclear`, `Closed`, `Exactly $5M`. The "Hide unconfirmed" and "Hide text-parsed" buttons narrow the list. Sorted by confidence, then fee.
- **Threshold semantics.** The data keeps stated amounts of $5,000,000 or more; the screen threshold is applied with strict `>` (or `>=` with the toggle). Amounts are what the source states; nothing is estimated.
- **Large projects, fee not published.** TxDOT Project Information projects in stage PE or PS&E with a stated construction cost over $25M (kept in data) whose text names drainage / H&H words, plus open or forecast engineering notices that state a project cost but no fee. Default screen threshold $50M = $5M / 10%, using the 6% to 10% design-fee range in the Arkansas State Highway and Transportation Department Design-Build Procurement Manual, Appendix H (Sept 2015). The "Illustrative fee range" on those cards is labeled Estimate, cites that source, and is never read by a fee filter.
- **Design-build.** Design-build, progressive design-build, CMGC / CM-at-risk and P3 / CDA procurements and awards with a civil, drainage or roadway scope (SAM extract, USAspending, TxDOT Project Information, DHS and Acquisition Gateway forecasts). The only dollar figure is the design-build contract value or estimated project cost, which includes construction: it is shown as "NOT a design fee" and never reaches a fee filter. A design fee or design portion stated separately in the text becomes its own Unconfirmed, Text-parsed fee record. A stipend is shown, not counted. Role (DB prime vs design subconsultant to a DB team) is inferred from NAICS and wording, and labeled so.
- **Advance notices, fee not stated (tab).** Early leads from agency forecasts and projected-advertisement lists, before a solicitation is issued: WSSC Water (MD, HTML table, states a projected contract value), Colorado DOT (tentative advertisement schedule), Louisiana DOTD (projected advertisements), DC OCP (PASS Forecast, ArcGIS open data) and County of San Diego (procurement forecast, Socrata). Only WSSC states a dollar figure. A record with no stated figure, or a stated figure under $5M, goes to this tab, is never given an `amt`, and so can never be tested by (or included in) a fee filter; the under-$5M WSSC figure is display-only. A WSSC value of $5M or more is a normal fee record. Month-only dates stay `YYYY-MM`; quarters stay as the source's text. Normalizers live in `advance.js` (not loaded by the browser) and are tested against real-row fixtures in `test-fixtures/`. Sources checked and rejected are listed on the Data tab ("Sources tested, not used"): VDOT (robots.txt disallows all), MnDOT (robots.txt would not load), NJDOT / USACE / ADOT / TDOT (403 to scripts), PDF-only forecasts, Toho Water (budget column is not a fee), Philadelphia (unstable file URL, all rows under $5M), commercial aggregators.
- **Exclusions kept.** Construction contracts and supplies, construction management / inspection / program-support / IT services (no design), non-civil contexts, outside the US. Counts per reason are on the Data tab ("Excluded: construction" and others).
- **Sources added for this lens:** USAspending prime awards and IDIQ ceilings (base_and_all_options from the award detail), USAspending design-build awards, NYC City Record and Chicago contracts at a $5M floor, City of Austin Professional Services master agreements, TxDOT Project Information. All older sources (SAM extract, TxDOT Projected Contracts, DHS APFS, Acquisition Gateway, Caltrans, WSDOT) feed this lens too.
- `node national-radar/test-pse.js` covers strict `>` vs `>=`, the exact-$5M note, badge logic, hide-unconfirmed, and that design-build values and project costs never satisfy a fee filter.

## Earlier water lane (preset)

### The rule

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
| pse.js, test-pse.js | PS&E / H&H lens, design-build and pipeline evaluator, filters, CSV; tests |
| advance.js, test-advance.js, test-fixtures/ | normalizers for the advance-notice sources (WSSC, CDOT, LA DOTD, DC PASS, San Diego County) and their tests with fixtures |
| data/pse.json | the PS&E / H&H snapshot (fee, design-build and large-project records, per-source counts) |
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
