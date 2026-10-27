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
