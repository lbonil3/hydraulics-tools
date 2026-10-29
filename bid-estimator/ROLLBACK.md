# Bid Estimator — how to go back

Every version is tagged. Going back never needs a force push: you either revert commits
(adds new "undo" commits) or restore the files from a tag and commit that.

| Tag | Commit | What it is |
|---|---|---|
| `bid-estimator-v1` | 9728237 | First live version (no unbalanced-bid flags) |
| `bid-estimator-v1.1` | 35e343a | + "Possibly unbalanced" flags (flagged, never removed) |
| `bid-estimator-v2-base` | 3deec6a | Same as v1.1 plus this note; base for the v2 batch |
| `bid-estimator-v2` | (tag on the commit that adds this table row) | All six v2 improvements |

## Undo one change (recommended)

Each v2 improvement is its own commit:

| Change | Commit |
|---|---|
| 1 Grouped quantity slope (shrinkage) | ac894b1 |
| 2 Escalation (FHWA NHCCI + user %/yr) | 9e3dd18, fix 8316d27 |
| 3 Unit conversions | 2981213 |
| 4 "Often bid with" | 9042747 |
| 5 Notes + print summary | fcf0c1a |
| 6 Project size context | 4d7fa8e |

To undo just one:

```
git pull
git revert --no-edit <sha>        # e.g. 2981213 for unit conversions (for item 2 revert 8316d27 then 9e3dd18)
node bid-estimator/test.js        # must print ok
git push origin main
```

The six commits touch the same files (estimator.js, app.js, the regenerated data), so
reverting an older one can stop with a conflict. If that happens, run `git revert --abort`
and either revert the newer commits too (newest first), or use the tag restore below.

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

## Print plot appendix (d3da100)

Tags: be-pre-appendix (before), be-v-appendix (after).
Undo: `git revert --no-edit d3da100` and push, or `git checkout be-pre-appendix -- bid-estimator`, commit, push.
No data changes. Adds optional setting printAppx (bidEstimator.settings.v1), ignored by older versions.
