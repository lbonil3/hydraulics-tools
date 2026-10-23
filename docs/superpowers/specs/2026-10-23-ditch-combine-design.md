# Combine Ditch Studio + Ditch Table — Design Spec

**Date:** 2026-10-23  
**Status:** Approved (table-primary)  
**Decision:** Ditch Table is the main tool; Single section opens from a button inside it.

## Behavior

1. **Primary URL:** `/ditch-table/` — station table (Add Row, Goal Seek) remains the default UI.
2. **Single section:** Toolbar button **Single section** opens the existing Ditch Studio UI (capacity, lining, drawings) at `/ditch/studio.html` (same app/calc assets as today’s studio).
3. **Redirect:** `/ditch/` (`ditch/index.html`) redirects to `../ditch-table/` so old Home/bookmarks land on the table.
4. **Studio chrome:** `studio.html` keeps Home to hub; add **Back to table** → `../ditch-table/`.
5. **Home page:** One **Ditch** card → `ditch-table/index.html` (remove separate Ditch Studio and Ditch Table cards). Update `scripts/check-home.js` accordingly (four tools + one ditch, or five names with single ditch href).
6. **Tc Studio** “Send to ditch” if any: point at ditch-table when practical; otherwise leave and note.

## Out of scope

- Rewriting lining/HEC-15 UI into the table grid
- Deleting studio calc code
- Changing table Goal Seek behavior

## Done when

- Table is default; Single section reachable; `/ditch/` redirects; one home card; smoke tests pass; live on Pages.
