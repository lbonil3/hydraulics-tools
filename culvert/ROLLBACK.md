# Culvert Studio — how to go back

The live site is GitHub Pages from `main`. These notes are only about `/culvert/`.
Do not revert other tools unless a commit also touched a shared file (the Rational handoff lives in `culvert/flows.js`).

| Tag to cut when this ships | What it is |
|---|---|
| `culvert-v1` | Culvert Studio as it was on `main` before v2 (equal barrels, one outlet-control headwater, fixed 1.2 / 15 ft/s checks) |
| `culvert-v2` | Units preserved across the US/SI toggle, both outlet-control headwaters, one criteria object, dissimilar barrels, CMP n by corrugation, HEC-14 scour note, engineering graphics. The later 3D commit on the same branch replaces the SVG isometric with a lazy-loaded three.js view |

## Undo v2 (files only)

```
git revert --no-edit <v2-commit-shas-newest-first>
node culvert/test.js
```

Saved projects from v2 (`version: 2`, `criteria`, `extras`) still open in v1: unknown fields are ignored. v1 will not convert units or show the HDS-5 full-flow headwater.

## What v2 stores

Optional `criteria` and `extras` on the project JSON, plus `culvert.criteria`, `culvert.extras` and `culvert.units` in localStorage. Older code ignores them.
