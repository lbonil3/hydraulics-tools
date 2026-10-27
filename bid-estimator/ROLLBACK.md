# Bid Estimator — how to go back

Every version is tagged. Going back never needs a force push: you either revert commits
(adds new "undo" commits) or restore the files from a tag and commit that.

| Tag | Commit | What it is |
|---|---|---|
| `bid-estimator-v1` | 9728237 | First live version (no unbalanced-bid flags) |
| `bid-estimator-v1.1` | 35e343a | + "Possibly unbalanced" flags (flagged, never removed) |
| `bid-estimator-v2-base` | (this file's commit) | Same as v1.1 plus this note; base for the v2 batch |

## Undo one change (recommended)

Each v2 improvement is its own commit (listed below once pushed). To undo just one:

```
git pull
git revert --no-edit <sha>        # e.g. the "unit conversions" commit
git push origin main
```

## Go back to a tagged version (files only)

Restores the Bid Estimator (and the files it touched) exactly as they were at the tag,
as a new commit on top of main:

```
git pull
TAG=bid-estimator-v1.1            # or bid-estimator-v1 / bid-estimator-v2-base
git rm -r -q --cached bid-estimator && rm -rf bid-estimator
git checkout "$TAG" -- bid-estimator bid-cost/app.js bid-cost/style.css bid-cost/test.js index.html home.css scripts/check-home.js
git commit -m "Bid Estimator: restore $TAG"
git push origin main
```

(`git rm` + `rm -rf` first so files added after the tag are removed too.)

To go back to before the Bid Estimator existed at all, revert its commits:
`git revert --no-edit <newest-sha> ... 9728237` (newest first).
