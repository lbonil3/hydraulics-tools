# SWP3 Designer — rules and sources

Priority: TxDOT first, then EPA/FHWA (EPA used for the concrete washout only), then clearly labeled **game rule**.
Game rules are simplified for play; follow TxDOT/TCEQ requirements for real plans.

Verified sources (read 2026-10-26):
- **TxDOT 2024 Standard Specifications, Item 506** "Temporary Erosion, Sedimentation, and Environmental Controls" — ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s506.pdf
- **TxDOT standard sheet EC(1)-16** Temporary Erosion, Sediment and Water Pollution Control Measures — Fence & Vertical Tracking — ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/ec116.pdf
- **EC(2)-16** Rock Filter Dams — .../standard/roadway/ec216.pdf
- **EC(3)-16** Construction Exits — .../standard/roadway/ec316.pdf
- **EC(9)-16** Erosion Control Log — .../standard/roadway/ec916.pdf
- **EPA Stormwater BMP fact sheet "Concrete Washout"** — epa.gov/sites/default/files/2020-02/documents/concretewashout.pdf (read 2026-10-26): washout facilities "should not be placed within 50 feet of storm drains, open ditches, or waterbodies".
- **TxDOT Bid Tabulations** (data.texas.gov dataset de7b-7dna), statewide low-bid averages, lets 2024-09 to 2026-10, as compiled in `../bid-cost/prices.json`.

Not used (not verified here): TxDOT Hydraulic Design Manual and the Storm Water Management Guidelines for Construction Activities — no numbers taken from them.

| Rule in game | Value | Basis |
|---|---|---|
| Tile size | 50 ft × 50 ft (0.0574 ac) | game rule |
| Design storm on forecast | 2-yr | TxDOT EC(1)-16 and EC(2)-16 usage guidelines: "A 2 year storm frequency may be used to calculate the flow rate" |
| Silt fence for sheet (overland) flow, near downstream perimeter, along contour | — | TxDOT EC(1)-16 usage guidelines; Item 506.4.4.8 (intercept sediment from sheet flow) |
| Silt fence max drainage area | 2 ac (fails "overtopped" above) | TxDOT EC(1)-16: "not recommended to control erosion from a drainage area larger than 2 acres" |
| Silt fence flow-through rate | 100 GPM/ft² (shown on card, not simulated) | TxDOT EC(1)-16 |
| Silt fence posts | 6–8 ft spacing, 18 in. embed (card only) | TxDOT Item 506.4.4.8.1 |
| Silt fence in a ditch = undercut | — | game rule (concentrated flow; EC(1) says use it for overland runoff, Item 506 says no splices in concentrated flow areas) |
| Silt fence trap efficiency | 85% ok / 5% failed | game rule |
| Rock filter dam height | 18 in. (Types 1 & 2) | TxDOT Item 506.4.4.1; EC(2)-16 |
| Rock filter dam top width / side slopes | ≥ 2 ft / 2:1 or flatter (6:1 in safety zone) (card only) | Item 506.4.4.1; EC(2)-16 note 4 |
| Dam type used for ditches | Type 2 (18 in., wire mesh) | EC(2)-16: Type 2 may be used in ditches and at dike or swale outlets |
| Type 1 drainage area | ≤ 5 ac recommended (card only) | EC(2)-16 |
| Type 1 high velocity | not for ~8 ft/s or more (card only) | EC(2)-16 |
| Type 3 | 36 in., stream flow, secured to stream bed (card only) | EC(2)-16 |
| Dam spacing = dam height ÷ ditch slope | 18 in. at 1.5% → 100 ft | game rule (common check-dam practice: downstream dam top level with upstream dam toe; not found on EC(2)-16) |
| Dam blowout | ditch slope > 6% | game rule (stand-in for EC(2) velocity note) |
| Dam trap | 75% ok / 35% spacing too wide / 10% on sheet flow (wasted) | game rule |
| Any dam in the creek = violation | −25 score | game rule (EC(2) allows Type 3 in streams when shown on plans; game keeps the creek off-limits) |
| Inlet protection (erosion control logs at inlets) | drainage area ≤ 5 ac | TxDOT EC(9)-16 "Log Traps: drainage area should not exceed 5 acres"; logs at drop/curb inlets |
| Inlet protection trap | 60% ok / 15% overtopped | game rule |
| Construction exit | ≥ 14 ft one-way / 20 ft two-way; Type 1 ≥ 8 in. deep crushed aggregate | TxDOT Item 506.4.4.1 |
| Construction exit length | not less than 50 ft | TxDOT EC(3)-16 Type 1 note 1 |
| Missing exit tracked mud | 15 units × storm factor | game rule |
| Stabilization timing | initiate within 14 days after work stops (card only) | TxDOT Item 506.4.3.2 (TPDES CGP TXR150000) |
| Seed + mulch erosion factor | grows in: 80% of bare soil on 1st storm, 60% on 2nd, 40% after (each Rain Check = 1 storm) | game rule |
| Sediment basin storage | 3,600 cf per acre drained (required volume shown and checked) | TxDOT Item 506.4.4.5.1 (required where ≥ 10 ac disturbed at one time) |
| Basin block capacity | 10,800 cf (= 3 ac at 3,600 cf/ac); undersized above that (storm-adjusted) | game rule |
| Basin placement | low point collecting ≥ 0.75 ac, not creek (violation), not road/inlet | game rule |
| Basin trap | 85% ok / 20% undersized | game rule |
| Basin cost | $15,990 = 400 CY × ~$39.98/CY | TxDOT bid tabs "EARTHWORK (EROSN & SEDMT CONT, IN VEH)" unit price; quantity is game rule |
| Concrete washout distance | ≥ 50 ft from storm drains, open ditches, waterbodies (game: no inlet/ditch/creek tile within 1 tile, diagonals included) | EPA Concrete Washout BMP fact sheet (no TxDOT number verified) |
| Concrete washout load / cost | missing or too-close washout adds 12 × storm factor; $650 | game rule |
| Storm scaling | drainage area × storm factor (10-yr = 1.5) for thresholds | game rule |
| Erosion per tile | bare soil 1, grass 0.03, ditch 0.6, road 0; × storm × (0.5 + slope%/4) | game rule |
| Score | 90 × min(1, reduction/90%) + 10 × budget left − penalties | game rule |
| Costs per block | fence $285 (50 LF × ~$5.71); rock dam $985 (20 LF × ~$49.27 Ty 2); inlet logs $150 (20 LF × ~$7.29 12-in. log); exit $3,430 (111 SY × ~$30.87 Ty 1); seed+mulch $280 (278 SY × ~$1.01) | TxDOT bid tabs (unit prices); quantities per block are game rules |

## Level 3 tuning (game rules)
- Inlet catchment narrowed to 3 road columns (≈ 2.6 ac; 3.9 ac storm-adjusted in the surprise 10-yr), so properly placed inlet protection holds under the 5 ac EC(9)-16 guideline.
- East swale (x = 15–17) collects ≈ 1.4 ac (2.15 ac storm-adjusted): a fence at its toe is fine at the 2-yr forecast but overtopped in the 10-yr (> 2 ac, EC(1)-16). Fixes: a fence upslope in the swale, or a sediment basin at the toe.
- Concrete pour on site: a washout is required (EPA 50 ft siting).
- Budget $26,000 (fits a basin plan). Tests prove two distinct 3-star plans and that a naive fence row is not 3 stars.

## Sandbox (game rules)
| Item | Value | Basis |
|---|---|---|
| Storm sizes | 2-yr ×1.0 (3.5 in), 5-yr ×1.25 (4.5 in), 10-yr ×1.5 (5.5 in), 25-yr ×1.9 (7.0 in) | **game values** — not TxDOT/NOAA rainfall data |
| Terrain edits | ±1 ft per tap, heights clamped −20…80 ft; paint grass/pad/ditch/road/creek/inlet/access | game rule |
| Budget | $50,000 | game rule |
| Save | localStorage key `swp3-game-sandbox-v1` (site, storm, concrete flag, controls) | — |

## Levels 4–7, solutions and stacking (v4)

| Item | Value | Basis |
|---|---|---|
| L4 phased pad + haul road | ridge splits flow; fence both toes, exit, washout ≥ 50 ft | TxDOT EC(1)-16, Item 506; EPA concrete washout fact sheet |
| L5 cut slope + ditch chain | ditch 1.4% / 2.8% / 7%; dams spaced 1.5 ft ÷ slope; no dams above 6% | TxDOT EC(2)-16; spacing and 6% blowout are **game rules** |
| L6 urban inlets | inlet protection ≤ 5 ac; overloaded inlet needs upstream fence | TxDOT EC(9)-16 |
| L7 big site | ≥ 10 disturbed ac in a common drainage needs a basin sized 3,600 cf/ac | TxDOT Item 506.4.4.5.1 (TCEQ CGP) |
| Basin stacking | up to 3 basin blocks per tile add capacity (10,800 cf each) | **game rule** |
| Solutions | stored in solutions.js; node test requires 3 stars on every level | — |
| Weather surprise | L4/L7 actual 5-yr, L6 actual 10-yr vs 2-yr forecast | **game rule** (teaches margin) |

## v5 BMPs: diversion dike, erosion control blanket, pipe slope drain + outlet protection (level 8)

Sources were read directly on 2026-10-26 from ftp.txdot.gov. The standard sheets are image-only PDFs and were read by rendering them.
- EC(4)-16 Dikes: <https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/ec416.pdf>
- EC(7)-16 Temporary Pipe Slope Drains: <https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/ec716.pdf>
- TxDOT Standard Specifications (2014 book, spec-book-1114.pdf), Items 169, 432, 506: <https://ftp.txdot.gov/pub/txdot-info/des/spec-book-1114.pdf>. The 2024 book could not be retrieved, so section numbers may differ there.

| Rule in game | Value | Basis |
|---|---|---|
| Dike drainage area | ≤ 5 ac, else overtopped | **TxDOT EC(4)-16** Dike usage guidelines: "The drainage area contributing runoff to a dike should not exceed 5 acres." |
| Dike purpose / outlet | intercept run-on and divert around unstabilized areas; outlet to stabilized area | **TxDOT EC(4)-16**; **Item 506.4.4.5.1** (dikes/swales "to prevent runoff spillover or to divert runoff") |
| Dike section (cost basis) | 18 in. min height, 2 ft min top width | **TxDOT EC(4)-16** typical dike configuration |
| Dike spacing | 100 ft (>10%), 200 ft (5–10%), 300 ft (<5%) | **TxDOT EC(4)-16**. Shown on the info card but **not checked by the sim** |
| Dike on bare soil = wasted; diverted area leaves the grid | — | **game rule** |
| Blanket classes | Class 1 Type A/B: slopes 3:1 or flatter; Type C/D: steeper than 3:1; Class 2 = channel liners | **TxDOT Item 169.2.1–2.2** |
| Blanket placement | within 24 hr after seeding | **TxDOT Item 169.3** |
| Steep threshold | slope > 1/3 (3:1) | from **Item 169** Type C/D split |
| Seed alone on > 3:1 washes out (90%); blanket = 15% of bare soil; silt fence on > 3:1 undercut | — | **game rule** |
| PSD size table | 12 in. 0.5 ac, 18 in. 1.5 ac, 21 in. 2.5 ac, 24 in. 3.5 ac, 30 in. 5.0 ac | **TxDOT EC(7)-16** design criteria |
| PSD max drainage area | 5 ac; 25-yr storm may be used for flow rate | **TxDOT EC(7)-16** usage guidelines. The game uses the level's storm factor, not a 25-yr storm |
| PSD details | inlet slope ≥ 3%; embankment ≥ 12 in. above pipe; hold-downs ≤ 10 ft | **EC(7)-16** notes; **Item 506.4.4.2** |
| Outlet protection | concrete/rubble riprap energy dissipator, 6 × dia long, 3 × dia wide | **EC(7)-16** Detail A; **Item 506.4.4.2** (riprap per **Item 432**) |
| Gully (concentrated flow > 0.5 ac on bare slope > 3:1), scour without apron | gullyRate 30, scour 40 per ac | **game rule** |
| Costs | dike $555 = Item 506 earthwork $39.98/CY × 13.9 CY; blanket $450 = 169 Cl 1 Ty C $1.62/SY × 278 SY (1 bid only); riprap $875 = 432 stone Ty R dry 18 in. $218.75/CY × 4 CY; pipe drain $1,800 = **game cost** | TxDOT bid tabs (data.texas.gov, lets 2024-09 → 2026-10) |
| Level 8 | dikes needed (6.0 → 3.2 ac at PSD), PSD + apron needed, blankets needed for 3 stars | tests in test.js |

## v6: rendering quality tiers (no rule changes)
Low/Medium/High draw tiles at 64×32 / 96×48 / 128×64 px. Game logic and picking stay in 64×32 base units, and the geometry is snapped so it scales exactly. Node tests check that art and picking agree at all three sizes on every level.

## v7: floating turbidity curtain (level 9)

Source, read directly 2026-10-26: **TxDOT Special Specification 5129, Floating Turbidity Barrier** (08-21, statewide; replaced void SS5048): <https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2014/spec/ss5129.pdf>

| Rule in game | Value | Basis |
|---|---|---|
| Max current | 5 ft/s; faster water = washed out | **TxDOT SS5129 §1**: "enough for a flow condition where the velocity of flow may reach 5 ft. per second (or a current of approximately 3 knots)" |
| Deploy before work | a curtain placed after a storm already ran = "late" (40% trap, fails 3 stars) | **TxDOT SS5129 §3**: "Place the FTB before commencement of any work that could impact the area of concern." The 40% is a **game rule** |
| Closed enclosure | ends tied to the bank; any gap to open water = violation | **TxDOT SS5129 §3**: "When located adjacent to a shoreline or bank, the ends of the curtain will be secured to fully enclose the area" |
| Ballast / anchoring | chain ballast, anchors, mooring buoys (shown in sprite) | **TxDOT SS5129 §2.6–2.8, §3** |
| Materials (info card) | 18–22 oz PVC-coated nylon, bright yellow/orange, ≥ 6 in. freeboard, 5/16 in. chain, lighted buoys 100 ft o.c. when shown | **TxDOT SS5129 §2** |
| Max depth 6 ft | standard 5 ft skirt reaching within about 1 ft of the bottom | **game rule**. The "within 1 ft of the bottom" practice comes from a TxDOT/TTI sediment-control report (ROSAP 73230, secondary). It is not in SS5129 |
| Only on water tiles; wasted on land, on the work tile, or with no in-water work | — | **game rule** |
| Trap 90%; in-water work load 25 per tile per storm; contains runoff entering the enclosed water | — | **game rule** |
| Cost $1,250 per 50 LF | — | **game cost**. SS5129 pays per LF (furnish/install, remove), but the bid data has no statewide average |
| Level 9 water | cove 3–4 ft at ≤ 0.8 ft/s, 8–9 ft hole at the cove mouth, main channel 5 ft at 6.5 ft/s | level design (game values) |
