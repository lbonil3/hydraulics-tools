# SWP3 Designer — rules and sources

Priority: TxDOT first, then EPA/FHWA (none used yet), then clearly labeled **game rule**.
Game rules are simplified for play; follow TxDOT/TCEQ requirements for real plans.

Verified sources (read 2026-10-26):
- **TxDOT 2024 Standard Specifications, Item 506** "Temporary Erosion, Sedimentation, and Environmental Controls" — ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s506.pdf
- **TxDOT standard sheet EC(1)-16** Temporary Erosion, Sediment and Water Pollution Control Measures — Fence & Vertical Tracking — ftp.txdot.gov/pub/txdot-info/cmd/cserve/standard/roadway/ec116.pdf
- **EC(2)-16** Rock Filter Dams — .../standard/roadway/ec216.pdf
- **EC(3)-16** Construction Exits — .../standard/roadway/ec316.pdf
- **EC(9)-16** Erosion Control Log — .../standard/roadway/ec916.pdf
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
| Seed + mulch erosion factor | 40% of bare soil, immediate | game rule |
| Sediment basin | 3,600 cf per acre drained for ≥ 10 disturbed acres (not in game yet) | TxDOT Item 506.4.4.5.1 |
| Storm scaling | drainage area × storm factor (10-yr = 1.5) for thresholds | game rule |
| Erosion per tile | bare soil 1, grass 0.03, ditch 0.6, road 0; × storm × (0.5 + slope%/4) | game rule |
| Score | 90 × min(1, reduction/90%) + 10 × budget left − penalties | game rule |
| Costs per block | fence $285 (50 LF × ~$5.71); rock dam $985 (20 LF × ~$49.27 Ty 2); inlet logs $150 (20 LF × ~$7.29 12-in. log); exit $3,430 (111 SY × ~$30.87 Ty 1); seed+mulch $280 (278 SY × ~$1.01) | TxDOT bid tabs (unit prices); quantities per block are game rules |
