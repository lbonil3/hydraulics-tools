# PM (private project manager) — how to go back

Every version is tagged. Going back never needs a force push: you either revert commits
(adds new "undo" commits) or restore files from a tag and commit that.

| Tag | What it is |
|---|---|
| `pm-pre` | main just before the PM tool was added (no `/pm/` folder) |
| `pm-v1` | First live version of `/pm/` (no home card) |
| `pm-v1.1` / `pm-v1.1-final` | + "Project Tracker" card on the home page (last encrypted, passphrase-login version) |
| `pm-v2` / `pm-v2-final` | Testing mode (no login, plain JSON), tree UI, PP sheet counts (last version before connectors) |
| `pm-v2.1` / `pm-v2.1-final` | + Connectors between sheets/segments in any sub-project, build order, update-needed, blocked/ready, impact |
| `pm-v2.2` / `pm-v2.2-final` | + Drainage / SWP3 branches under each sub-project |
| `pm-v2.3` / `pm-v2.3-final` | + Add segment with road + stations only (auto label) |
| `pm-v2.4` / `pm-v2.4-final` | + Updated default sheet templates (Drainage + SWP3), Reset all templates |
| `pm-v2.5` / `pm-v2.5-final` | + Project sheet index, bulk-apply to all segments |
| `pm-v2.6` | Sheet-number ranges |

Up to `pm-v1` the PM tool only added files under `pm/`. `pm-v1.1` adds a home card in
`index.html`, `home.css` and `scripts/check-home.js` (commit bc54383).

## Commits

| Change | Commit |
|---|---|
| 1 Crypto + data model + Node tests | 86097f1 |
| 2 App UI (lock, dashboard, views, backup, auto-lock) | 1b22d59 |
| 3 Headless-Chrome end-to-end test | 49c61fd |
| 4 This note | 38b1667 |
| 5 Home card (Project Tracker) | bc54383 |

## Undo one change

```
git pull
git revert --no-edit <sha>
node pm/test.js                  # must print ok
node scripts/check-home.js       # must print ok
git push origin main
```

## Remove only the home card (keep /pm/ working, unlisted)

```
git pull
git revert --no-edit bc54383
node scripts/check-home.js       # must print ok
git push origin main
```

## Remove the PM tool completely (back to `pm-pre`)

```
git pull
git revert --no-edit bc54383     # home card first
git rm -r -q pm
git commit -m "PM: remove (back to pm-pre)"
git push origin main
```

or revert its commits, newest first: `git revert --no-edit <newest-sha> ... 86097f1`.

## Go back to a tagged PM version (files only)

```
git pull
TAG=pm-v1
git rm -r -q --cached pm && rm -rf pm
git checkout "$TAG" -- pm
git commit -m "PM: restore $TAG"
git push origin main
```

## Your data is not in git

Project data lives only in the browser that created it (encrypted in `localStorage`,
key `pm.vault.v1`). Rolling back code does not delete or change it. A future version that
changes the data format must keep reading `schema: 1` vaults and backups. Before any
upgrade or rollback, export an encrypted backup from Settings.

## v2 (testing mode) commits

| Change | Commit |
|---|---|
| v2 data model + tests | 177d916 |
| No-login testing mode + tree UI | af3abfb |
| v2 end-to-end test | 4e6b79a |
| Home badge "Testing" | 88d38bf |
| This section | (the commit that adds it) |

### Bring the login / encryption back

v2 stores data as plain JSON in `localStorage['pm.data.v2']`. The v1 encrypted code is still in
`pm/crypto.js`, but the v1 UI is not. To go back to the encrypted, passphrase-login version:

1. In v2, open Settings and click **Export backup (JSON)** so you have the current data.
2. Restore the v1 files:
   ```
   git pull
   git rm -r -q --cached pm && rm -rf pm
   git checkout pm-v1.1-final -- pm index.html
   git commit -m "PM: restore encrypted v1.1 (pm-v1.1-final)"
   git push origin main
   ```
3. v1 can't read v2 data. Re-enter the data, or ask for a small v2-to-v1 importer. The old
   encrypted vault (`pm.vault.v1`) stays in the browser unless you deleted it in v2's Settings.
   v1 opens it again with its old passphrase.

To undo only the badge change, run `git revert --no-edit 88d38bf`.

## v2.1 (connectors) commits

| Commit | Change |
|---|---|
| 11f2e09 | Model: global `links`, build order, cycle check, wrong-direction warning, revisions, update-needed, blocked/ready, impact, dependencies CSV, migration of old `sheet.deps` + tests |
| 29ccf02 | UI: connector arrows on the tree, drag handle, drawer picker, flags, rail lists, build-order editor, impact view |
| d722836 | e2e test for connectors |

Undo just v2.1 (keeps v2): `git revert --no-edit d722836 29ccf02 11f2e09` then push, or restore files:

```
git checkout pm-v2-final -- pm
git commit -m "pm: back to v2 (no connectors)" && git push
```

Data note: v2.1 converts old v2 "Depends on" lists into connectors (`links`) the first time it loads.
If you go back to v2 with data saved by v2.1, v2 ignores `links` (connectors and revisions are simply
not shown; sheets, segments and statuses are unaffected). Export a backup before rolling back.

## v2.2 (Drainage / SWP3 branches) commits

| Commit | Change |
|---|---|
| f20b91b | Model: discipline default by keywords, per-discipline stats / PP counts / generate, discipline in PP CSV + tests |
| 533e3da | UI: two branches per sub-project, overview per discipline, timeline lanes, list grouping, PP calc split, branch toggle |
| 45ebfab | e2e test for branches |

Undo just v2.2 (keeps v2.1): `git revert --no-edit 45ebfab 533e3da f20b91b` then push, or:

```
git checkout pm-v2.1-final -- pm
git commit -m "pm: back to v2.1 (no discipline branches)" && git push
```

Data note: v2.2 does not change the data format. Segments are still stored once per sub-project and
shown under both branches; it only fills in a missing sheet discipline (SWP3 / erosion / stormwater
keywords → SWP3, else Drainage). Going back to v2.1 keeps everything.

## v2.3 (road-only segments)

| Commit | Change |
|---|---|
| 8811171 | Add-segment form: road + start/end (+ scale); label auto "<Road> Sta <start>–<end>"; migration; tests + e2e |

Undo: `git revert --no-edit 8811171` and push, or `git checkout pm-v2.2-final -- pm`, commit, push.
Data note: on first load v2.3 rewrites each segment's `name` to the auto label (a segment with only a
name gets it as its road). v2.2 still opens this data; segment titles then show the auto label.
Export a backup first if you want the old names.

## v2.4

| Commit | Change |
|---|---|
| b901a56 | + Updated default sheet templates (Drainage + SWP3), Reset all templates |

Undo: `git revert --no-edit b901a56` and push, or `git checkout pm-v2.3-final -- pm`, commit, push.
Data note: only new projects and template resets get the new list; existing templates and sheets are untouched.

## v2.5

| Commit | Change |
|---|---|
| bd2df3e | + Project sheet index, bulk-apply to all segments |

Undo: `git revert --no-edit bd2df3e` and push, or `git checkout pm-v2.4-final -- pm`, commit, push.
Data note: adds `index` to the data (older data gets the default list). Rolling back ignores it; applied sheets stay.

## v2.6

| Commit | Change |
|---|---|
| 40c38a5 | Sheet-number ranges |

Undo: `git revert --no-edit 40c38a5` and push, or `git checkout pm-v2.5-final -- pm`, commit, push.
Adds settings.numbering (defaults filled on load); existing sheet numbers untouched unless 'Fill empty'/'Renumber all' used
