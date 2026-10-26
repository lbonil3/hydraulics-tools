# Bid Cost — example links (design)

**Date:** 2026-10-26
**Status:** Implemented
**Tool:** `/bid-cost/`
**Parent:** `2026-10-23-bid-cost-standard-details-design.md`

## Goal

Help a Houston-area drainage engineer see what a bid code is, in one tap. Each mapped item or code gets the kind of example that explains it best: a field photo, a real TxDOT letting plan or estimate sheet, or an official Hydraulic Design Manual figure. The link is labeled by that type.

## Decisions

| Topic | Choice |
|--------|--------|
| Approach | Static `examples.json`. No runtime scrape. |
| Placement | Item examples on the **item header**, next to Spec. Code examples on a full-width row under that bid code, so the tap target stays at the left edge on a phone instead of in a new column past Detail. |
| Inheritance | None. A code with no `by_code` entry shows an empty Examples cell even when its item has header links. An item with no `by_item` entry shows no header examples. |
| Coverage | Common drainage items first, plus a few bid items that show up on almost every Houston letting. Not every code. |
| Missing map or bad link | No control. Prices, Spec, and Detail still work. |
| Link text | The type (`Photo`, `Plan sheet`, `Past project`, `Figure`, `Bid tab`). A second link of the same type may add a short qualifier (`Photo · inlet`) that starts with the type. |
| Tap target | Same family as Spec and Detail: underlined `#1f4e79`, at least 44px tall. On a phone the header row wraps so the links sit on their own line. |

Detail sheets stay on the Detail column. Examples do not replace them.

## Data

`bid-cost/examples.json`:

```json
{
  "meta": { "accessed": "YYYY-MM-DD", "extend": "…" },
  "by_item": {
    "464": [
      { "type": "Photo", "url": "https://…", "title": "What the photo shows" }
    ]
  },
  "by_code": {
    "466-7177": [
      { "type": "Past project", "url": "https://….pdf#page=14", "title": "Which letting and code" }
    ]
  }
}
```

`resolveItemExamples(map, item)` and `resolveExamples(map, bidCode)` return `[]` for a null map, an unknown key, or a link that is not `https`, has an unknown type, has an empty title, or has a label that does not start with its type.

`#page=` on a plan PDF opens that page in viewers that support it. The file URL itself is the letting plan set.

## How to extend

1. Pick the item (header) or the exact bid code (row). Use the item when one example explains every code under it. Use the code when the sizes or types look different, or when you have a letting that actually bid that code.
2. Choose one type:
   - **Photo** — the built item in the field.
   - **Plan sheet** — a page of a real TxDOT plan set that draws it. Record the PDF page.
   - **Past project** — the estimate sheet (or another letting document) that lists that code.
   - **Figure** — an official drawing, such as a Hydraulic Design Manual figure, when a field photo or plan callout is not available.
   - **Bid tab** — a real bid-tabulation page that prices the code. Do not label an estimate sheet as a bid tab.
3. Open the URL. Keep it only if it returns HTTP 200 and the page is about that item. Prefer `https`. Do not add a link you could not open.
4. Add `{ "type", "url", "title" }` under `by_item` or `by_code`. Set `label` only when two links share a type.
5. Run `node bid-cost/test.js`.

The map is hand-curated. It is not rebuilt from `prices.json`.

## What was hard to source

- Itemized bid-tab PDFs. Monthly files on `ftp.dot.state.tx.us/.../bidtab/` are zip archives of text, and the current dashboard has no stable per-project PDF. Estimate sheets in the letting plan set are used as **Past project** instead. No **Bid tab** links are shipped in v1.
- Field photos of a TxDOT safety end treatment, a concrete headwall or wingwall, and in-ground corrugated metal pipe. Commons results for metal pipe included a manufacturer logo, which was rejected. Items 467 and 460 use Hydraulic Design Manual figures.
- A storm-sewer plan-and-profile that proposes RCP, inlets, and safety end treatments. The Houston sets checked in this pass were bridge, erosion-repair, and riprap jobs. The pipe drawing that verified is an existing 36-inch RCP callout on FM 359 at Jones Creek.

## Testing

- Resolver: null map, unknown code, empty list, item examples not copied onto codes, invalid type / `http` / empty title / bad label dropped, label defaults to the type.
- Shipped file: priority items have at least one valid link; `466-7177` points at CSJ `0050-06-108`; a known unmapped code is empty.
- UI source: `examples.json` is fetched, header uses `resolveItemExamples`, rows use `resolveExamples`, and `.example-link` is at least 44px tall.
