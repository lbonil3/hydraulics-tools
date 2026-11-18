# Culvert Studio — how to go back

The live site is GitHub Pages from `main`. These notes are only about `/culvert/`.
Do not revert other tools unless a commit also touched a shared file (the Rational handoff lives in `culvert/flows.js`).

| Tag to cut when this ships | What it is |
|---|---|
| `culvert-v1` | Culvert Studio as it was on `main` before v2 (equal barrels, one outlet-control headwater, fixed 1.2 / 15 ft/s checks) |
| `culvert-v2` | Units preserved across the US/SI toggle, both outlet-control headwaters, one criteria object, dissimilar barrels, CMP n by corrugation, HEC-14 scour note, engineering graphics |

## Undo v2 (files only)

```
git revert --no-edit <v2-commit-shas-newest-first>
node culvert/test.js
```

Saved projects from v2 (`version: 2`, `criteria`, `extras`) still open in v1: unknown fields are ignored. v1 will not convert units or show the HDS-5 full-flow headwater.

## Undo the auto-size / checks / profile-particle work

```
git revert --no-edit <that-commit-sha>
node culvert/test.js
```

That work adds `culvert/design.js`, `culvert/designui.js` and `culvert/particles.js`, and bumps the service worker cache to `culvert-studio-v4`. Revert those commits together so `index.html` does not keep a script tag for a deleted file. The isometric view is not part of this work and stays removed.

New form fields (`blockage`, `freeboard`, `minCover`, `sedOn`, `Qsed`, `fishOn`, `Qfish`) are stored with the project because every field is saved. Older Culvert Studio ignores unknown fields. Debris, sediment and fish passage stay off unless the user turns them on. Undo/redo is memory only and is not saved.

## What v2 stores

Optional `criteria` and `extras` on the project JSON, plus `culvert.criteria`, `culvert.extras` and `culvert.units` in localStorage. Older code ignores them.
