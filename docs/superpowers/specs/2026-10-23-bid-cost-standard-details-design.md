# Bid Cost — Standard Detail PDF links (design)

**Date:** 2026-10-23  
**Status:** Approved (approach A)  
**Tool:** `/bid-cost/` (extends v2)  
**Parent:** `2026-10-23-bid-cost-v2-sections-design.md`

## Goal

On Bid Cost, show a **Standard Detail** PDF link on each **bid-code row** when a mapping exists — **Houston District first**, then statewide Design Division if Houston has none. Unmapped rows show no Detail link (no dead links).

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Approach | Static `detail-map.json` + row link (A), not index-only (B) or live fetch (C) |
| Catalog order | Houston District standards first; statewide Design Division fallback |
| Placement | **Per bid-code row** when mapped (not Item header) |
| Coverage v1 | All codes we can **reasonably** map from those indexes (+ curated fills); not every catalog code |
| Missing map | No Detail control (blank cell / omit link) |
| Spec link | Unchanged on Item header |
| Offline | Map ships with the site; no runtime scrape |

## Layout

- Expanded Item table gains a **Detail** column (after Source or after H/SW — prefer after Source for scan order: price context then docs).
- Cell content: link text `Detail` (or short sheet id if one code maps to one known acronym), `target="_blank"` `rel="noopener noreferrer"`.
- Tap target ≥44px height on phone (same family as Spec link styles, scaled for table cell).
- Item header keeps **Spec** only; do not add Detail there in v1.

## Data

### Shipped file

- `bid-cost/detail-map.json` (or nested under existing data folder), shape:

```json
{
  "meta": {
    "accessed": "YYYY-MM-DD",
    "houston_index": "https://www.dot.state.tx.us/hou/specinfo/specs.htm",
    "statewide_note": "Design Division roadway / bridge standards on ftp.txdot.gov"
  },
  "by_code": {
    "465-6001": {
      "houston_url": "https://…/….pdf",
      "statewide_url": null,
      "label": "HIL-C-25"
    }
  }
}
```

- Keys are full `bid_code` strings matching `prices.json`.
- Either URL may be null; resolver prefers `houston_url` when non-empty, else `statewide_url`.
- Optional `label` for link title / aria (sheet acronym); default link text `Detail`.

### Lookup

```text
resolveDetail(bid_code) → { url, source: 'Houston'|'Statewide', label } | null
```

1. Look up `by_code[bid_code]`.
2. If `houston_url` → use it, source Houston.
3. Else if `statewide_url` → use it, source Statewide.
4. Else → null (no link).

Unit tests cover these four paths (incl. missing key).

### Build / refresh

- Document a small build or curation path (script and/or hand-edited JSON) fed by:
  - Houston District standards page (`hou/specinfo/specs.htm` and PDF links thereon)
  - Statewide Design Division standard lists on `ftp.txdot.gov` / `dot.state.tx.us` roadway standards
- Mapping is many-to-one or many-to-few: several bid codes may share one sheet; one code may only have statewide.
- v1 does **not** require 100% of `prices.json` codes; “reasonably map” = codes with a clear sheet from those sources. Expand map in later commits without UI changes.
- Not run on page load.

## Behavior

1. Load `detail-map.json` alongside `prices.json` (or embed map fetch in same boot).
2. When rendering a row, if `resolveDetail` returns a URL → render Detail link; else empty cell.
3. Fail soft: if map file 404 / parse error → all Detail cells empty; prices still work; meta can note “detail map unavailable.”

## Out of scope (v1)

- Live scrape of TxDOT on the phone
- Detail link on Item header
- Multiple Detail links per row (pick primary Houston-or-statewide single URL)
- DGN / MicroStation downloads
- Districts other than Houston for the “local” slot
- Guaranteeing every bid code has a sheet

## Testing

- `resolveDetail` Houston / statewide / both / neither / unknown code.
- UI: mapped row has link; unmapped has none; Spec header unchanged.
- Existing lookup + accordion tests still pass.

## Success

- Luis opens a mapped drainage code and gets a Houston (or statewide) standard detail PDF in one tap.
- Unmapped codes stay clean with no 404 links.
- Spec Item PDFs remain on the accordion header.
