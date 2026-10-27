# Storm Designer — rules and sources

Every check the game scores, and where it comes from. **Basis** is one of:

- **TxDOT**: TxDOT Hydraulic Design Manual (HDM), September 2019 revision, checked against the manual text.
- **FHWA**: FHWA HEC-22 (Urban Drainage Design Manual, 3rd ed.) or HEC-15 (Design of Roadside Channels with Flexible Linings, 3rd ed.), as implemented in this repo's tools.
- **Game rule**: a simplification made so the puzzle stays readable. Not a design criterion; don't use it on a real job.

The math is the repo's own tool code, loaded at runtime (not copied): `drainage/calc.js` (DR), `storm/calc.js` (StormCalc), `culvert/calc.js` (Culvert), `rational/calc.js` (Tc / IDF). The bid prices come from `bid-cost/prices.json` (statewide low-bid averages).

## Hydrology

| Rule in the game | Value | Basis | Source |
|---|---|---|---|
| Peak flow Q = C i A (rational method) | per tile, accumulated downhill | TxDOT | HDM Ch.4 Sec.12, Eq 4-20 |
| Rainfall intensity i = b/(Tc+d)^e | Harris County EBDLKUP-2019 e, b, d for 2–100 yr | TxDOT | HDM Eq 4-21; `rational/idf-data.js` |
| Minimum time of concentration | 10 min | TxDOT | HDM Ch.4 Sec.12 (`TC_MIN` in rational/calc.js) |
| Pre-development Tc (detention levels) | Kerby (overland) + Kirpich (channel) | TxDOT | HDM Eq 4-14, 4-15 (rational/calc.js) |
| Runoff C: lawn .15, park .15, house lot .45, pavement .90 | value picked inside the HDM range | TxDOT | HDM Table 4-10 |
| Design storm: streets/inlets/sewer 10-yr, culvert 25-yr, detention 25-yr | | TxDOT | HDM Table 4-2 (design AEP by facility type) |
| 100-yr (1% AEP) check in level 8: no house floods | | TxDOT | HDM Table 4-2 note: evaluate all facilities for the 1% AEP event |
| 50-ft tiles, flow goes to the lowest neighbour (D4) | | Game rule | |

## Streets and inlets

| Rule in the game | Value | Basis | Source |
|---|---|---|---|
| Gutter spread T from Manning (Izzard) | n 0.016, Sx 0.02 | FHWA / TxDOT | HEC-22 Eq 4-2; HDM Eq 10-1; DR.gutter |
| Allowable spread | 12 ft (keep one lane passable) | TxDOT (simplified) | HDM Ch.10 Sec.4 ponding guidance; the 12-ft number is the game's |
| Crowned street: each gutter carries half the flow | Q/2 | Game rule | |
| Depth over the 6-in curb = fail | 0.5 ft | Game rule | |
| Curb inlet on grade: interception and bypass | TxDOT method, PCO 5/9.5/14 ft, 3-in depression | TxDOT | HDM Eq 10-5 … 10-13; DR.curbGrade; drainage/txdot-inlets.js |
| Bypass leaving the last inlet ≤ 0.5 cfs | | Game rule (Luis's office target) | |
| Inlets at every low point; sag inlet weir/orifice | | TxDOT / FHWA | HDM Ch.10 Sec.4 (inlets at all sags); HEC-22 Eq 7.16–7.19, HDM Eq 10-17; DR.curbSagDepth |
| Road runoff onto a house lot = flooded lot | | Game rule | |
| Flattest gutter slope used | 0.2% | Game rule | |

## Storm sewer

| Rule in the game | Value | Basis | Source |
|---|---|---|---|
| Pipe capacity flowing full, RCP n 0.013 | Manning | TxDOT / FHWA | HDM Ch.10 Sec.2; StormCalc |
| HGL by friction + junction losses; surcharge if HGL above the rim | | FHWA | HEC-22 Ch.7 energy losses (approx. K), StormCalc.analyzeNetwork |
| Velocity 3–12 ft/s (warning only) | | TxDOT | HDM Ch.10 Sec.2 (f) |
| Cover ≥ 3 ft where possible (warning only) | | TxDOT | HDM Ch.10 Sec.2 |
| Crowns match at junctions | | FHWA practice | HEC-22 |
| Pipes laid at the slope that gives 3 ft/s full; min 0.1%, max 2% to the outfall | | Game rule (layout) | |
| Sizes 18–72 in, never smaller downstream | | TxDOT | HDM Ch.10 Sec.2 |
| Utility line: a pipe may not cross the marked tiles | | Game rule | |
| Pipe must reach the outfall/pond; inlets must be connected | | Game rule | |

## Ditches (HEC-15)

| Rule in the game | Value | Basis | Source |
|---|---|---|---|
| Normal depth, Manning trapezoid | 2-ft bottom, 3:1 sides, 2 ft deep | TxDOT / game section | HDM Eq 6-3, DR.chanDepth; the section is the game's |
| Freeboard ≥ 0.5 ft | | Game rule (Luis's ditch-table check) | |
| Shear τ = γ d S vs permissible | grass (Retardance D) 0.60, mat 2.0, 6-in riprap 2.5 lb/sf, concrete unlimited | FHWA / TxDOT | HEC-15 Eq 2.3 and permissible-shear tables; HDM Ch.7 shear table |
| Ditch tile entering the creek uses the upstream slope | protected outfall | Game rule | |

## Culverts

| Rule in the game | Value | Basis | Source |
|---|---|---|---|
| Headwater, inlet and outlet control, RCP n 0.012, 80 ft long | | FHWA | HDS-5 nomographs/equations via culvert/calc.js |
| Headwater at the design flow below the road edge | 25-yr | TxDOT | HDM Ch.8 Sec.2 Allowable Headwater |
| Mid-level budget cut in level 6 | | Game rule (surprise) | |

## Detention

| Rule in the game | Value | Basis | Source |
|---|---|---|---|
| Post-development peak ≤ pre-development peak (25-yr) | | TxDOT | HDM Ch.10 Sec.3 (storage facilities); local Harris County practice |
| Modified-rational inflow hydrograph, storage-indication routing | | FHWA | HEC-22 Ch.10 |
| Orifice C 0.6, weir C 3.0 | | FHWA | HEC-22 Ch.10 typical coefficients |
| Pond 4 ft deep, weir crest at 3 ft, block = 50×50 ft | | Game rule | |
| Pond must include the marked outfall tile | | Game rule | |

## Costs (bid items)

| Element | Price | Basis |
|---|---|---|
| RCP (CL III) 18–72 in | Item 464 statewide low-bid average $/LF | bid-cost/prices.json |
| Curb inlet PCO 5 ft | Item 465 $8,557 each (pair per tile) | bid-cost/prices.json |
| Manhole 48 in | Item 465 $7,939 | bid-cost/prices.json |
| Channel excavation | Item 110 $27/CY | bid-cost/prices.json |
| Soil retention blanket / riprap / conc. lining | Items 169, 432 | bid-cost/prices.json |
| Headwall | Item 466 $13,273 each end | bid-cost/prices.json |
| Inlet extension $2,500, outlet structure $8,000, grass seeding $300 | | Game costs |

## Scoring (game rule)

Score = 100 − 14 per failed check − 4 per warning, minus a penalty when the plan uses over 80% of the budget. 3★ = no failures and a score of 80 or more; 2★ = at most one failure and 55 or more; 1★ = 25 or more.
