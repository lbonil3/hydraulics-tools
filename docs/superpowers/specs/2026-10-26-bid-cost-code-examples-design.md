# Bid Cost — in-tool drainage examples (design)

**Date:** 2026-10-26  
**Tool:** `/bid-cost/`  
**Parent:** `2026-10-23-bid-cost-v2-sections-design.md`

## Goal

When a drainage bid-code row is expanded, show what the bid is and what the unit price covers. Use a small inline diagram and plain language from the TxDOT 2024 spec item. Show up to three prices that are actually stored for that code. Do not link out to photos, plan sheets, or other example pages. Spec and Detail links stay as they are.

An earlier pass put external example links on the page. Those links did not show the bid, so this pass does not use them and does not read that file.

## What the user sees

On a drainage code, under the price row, a full-width **Example** button (44px tall, same blue underline family as Spec). It sticks to the left edge when the table scrolls sideways. Opening it does not collapse the Item and does not follow a link.

The panel shows:

1. An inline SVG. Shaded parts are this price. Dashed parts are paid on another item. The bid unit is printed on the drawing (`Unit: LF`, `Unit: EA`, and so on).
2. How that unit is measured, in the words of the 2024 spec.
3. **In this price** and **Paid separately**.
4. The spec article the sentences come from, as text. The existing Spec button still opens the PDF.
5. Up to three prices from the extract, labeled as summaries, plus a note that project, county, per-bid quantity, and per-bid letting date are not in the repo.

Codes with no rule show nothing new. If `code-examples.json` or `code-example-samples.json` fails to load, prices, Spec, and Detail still work. A diagram name with no drawing shows “No diagram” and the unit, rather than a blank or a thrown error.

## Drainage set

Every code in these items:

402, 403, 432, 459, 460, 462, 464, 465, 466, 467, 468, 471, 472, 474, 476, 480, 481, 506.

Partial items:

| Item | Included | Left out |
| --- | --- | --- |
| 400 | Structural excavation (including pipe, box, and bridge), cement-stabilized backfill, cut-and-restore pavement, sand backfill, rock backfill | Shaft, launch, adit, tunnel, and tee excavation |
| 479 | Manholes and inlets, including caps | Water, sanitary, electric, utility, meter, and valve adjustments |
| 496 | Pipe, box culvert, inlet, manhole, junction box, headwall, wingwall, safety end treatment, driveway culvert, riprap, gabion, drainage flume | Bridges and other non-drainage removals |

Item 401 (flowable backfill) is named in the “paid separately” notes. It does not have its own diagram in this pass. Gabions (459), thermoplastic pipe (468), frames and grates (471), re-laid pipe (472), linear drains (474), jacking or boring (476), culvert cleaning (480), and drain pipe (481) are in the set because the bid data treats them as drainage structures next to the items above.

Payment sentences were taken from the 2024 standard-spec PDFs (Measurement and Payment) on 2026-10-26. Two places the spec is easy to misread, and the panel says both:

- Items 460, 462, and 464 pay for the pipe or box. Excavation, bedding, and backfill are Item 400. Item 464 also lists “shaping the bed” in the pipe price.
- Item 481 is the opposite: excavation and backfill are subsidiary to the pipe. Item 465, 466, and 467 include excavation and backfill in their own prices, unless Item 400 is also a pay item (Item 400.5.1).
- Item 476 and Item 474 include the excavation for that bid. Open-cut pipe does not.

Sand backfill and rock backfill are bid under Item 400, but the 2024 payment articles do not name those two descriptions. The panel says that, and points at 400.5.2 for special backfill materials, instead of inventing a measurement rule.

## Data

`bid-cost/code-examples.json` holds the rules. `bid-cost/examples.js` draws the SVG and builds the panel. `bid-cost/code-example-samples.json` holds the numbers, rebuilt by `node bid-cost/build-example-samples.js`.

A rule:

```json
{
  "id": "464",
  "item": "464",
  "when": "optional phrase the description must contain",
  "when_any": ["optional", "any one of these"],
  "unless": ["skip if any of these match"],
  "diagram": "rcp",
  "unit_how": "How the spec measures this bid.",
  "included": ["What the price pays for."],
  "separate": ["What is another bid."],
  "spec": "TxDOT 2024 Standard Specifications, Item 464, Measurement and Payment."
}
```

The first matching rule wins. The bid code must be `NNN-` plus the rest (Item 402 is `402-6001`, not `4021-6001`). Special specs that only share the first three digits stay unmapped. Match is case-insensitive against the bid description. `when` requires every phrase. There is no runtime fetch and no external image.

### Prices that are actually in the repo

`prices.json` and the CSVs in `bid-cost/data/` store one row per bid code:

`n_observations`, `total_qty`, `avg_unit_price`, `median_unit_price`, `min_unit_price`, `max_unit_price`, `weighted_avg_unit_price`.

`data/_meta.json` has one letting window for the whole extract (`min_date` 2024-09-06, `max_date` 2026-10-22), not a date per code.

There is no project name, county, per-bid quantity, or letting date. The panel does not invent them. For a code with Houston `n > 0`, the sample file uses the Houston row; otherwise the statewide row. The panel shows:

- 1 observation, or min = median = max: that one price.
- 2 observations: the lower and the higher.
- 3 or more: lowest, median, and highest.

The average is already in the price table, so it is not repeated as a fourth “line.” The letting column says the dates are the whole extract.

### How to keep real bid lines later

`build-prices.js` collapses each code to an average. The source dataset is Texas Open Data Bid Tabulations `de7b-7dna`. A rank-1 row there can carry at least:

- `project_name`, `project_id`, `control_section_job_csj`
- `county`, `district_division`
- `bid_item_quantity`, `bid_item_unit_price_amount`, `measurement_unit`
- `project_actual_let_date`
- `bid_code`, `bid_rank_sequence_number`

The CSVs checked into `bid-cost/data/` do not include those columns. To show three real bids:

1. Extract low-bidder rows (`bid_rank_sequence_number` = 1) without averaging them away.
2. Keep the fields above on each row.
3. Write a sibling file of up to three rows per code (for example the three newest `project_actual_let_date` values in Houston, else statewide).
4. Teach `sampleFacts` to copy `project`, `county`, `bid_qty`, and a bid-level letting date, and set `let_scope` to `bid` instead of `dataset`.

Until that extract exists, do not type project names or prices by hand.

## How to add another item category

1. Read that item’s 2024 Measurement and Payment text. Do not guess what is included.
2. Append rules to `code-examples.json`. Specific descriptions first, then the item-wide rule. Use `unless` when only some codes in the item belong in the set.
3. Reuse a `diagram` key from `examples.js` when the picture still fits. Add a `DRAW` function only when the shape is different. Keep it inline SVG: no `<image>`, no `http` URLs.
4. Run `node bid-cost/build-example-samples.js`.
5. Add a check in `bid-cost/test.js` that a real code resolves, a code outside the set does not, and the sample min/median/max match the CSV.
6. Run `node bid-cost/test.js`.

Pavement, traffic, and bridge items other than the Item 400 bridge excavation row are out of this pass on purpose.

## Tests

`node bid-cost/test.js` covers lookup fallback, spec gating, item info, detail links, and the example rules: missing catalog, non-drainage codes, pipe versus pipe-runner, removal of pipe versus removal of a bridge, one/two/three summary prices, no invented project fields, SVG without external assets, and shipped samples matching the CSV.
