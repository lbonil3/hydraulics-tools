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
| `pm-v2.6` / `pm-v2.6-final` | Sheet-number ranges |
| `pm-v2.7` / `pm-v2.7-final` | This-week view |
| `pm-v2.8` / `pm-v2.8-final` | Status board |
| `pm-v2.9` / `pm-v2.9-final` | Undo / redo |
| `pm-v2.10` / `pm-v2.10-final` | Print status report |
| `pm-v2.11` / `pm-v2.11-final` | Collapse branches |
| `pm-v2.12` / `pm-v2.12-final` | Stations editor |
| `pm-v2.13` / `pm-v2.13-final` | Split / merge segments |
| `pm-v2.14` / `pm-v2.14-final` | Copy road to sub-project |
| `pm-v2.15` / `pm-v2.15-final` | Quick-add + command palette |
| `pm-v2.16` / `pm-v2.16-final` | Multi-select + bulk edit |
| `pm-v2.17` / `pm-v2.17-final` | Recently changed + remembered filters |
| `pm-v2.18` / `pm-v2.18-final` | Shortcut help + empty-state hints |
| `pm-v2.19` / `pm-v2.19-final` | Report narrative + notes |
| `pm-v2.20` | PM v2.20 CSV import |
| `pm-v3.2` / `pm-v3.2-final` | Roads as tree branches, sheets with station ranges (before: `pm-v3.2-pre` = `pm-v3.1-final`) |
| `pm-v3.3` / `pm-v3.3-final` | Professional printed status report (before: `pm-pre-report`) |

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

## v2.7

| Commit | Change |
|---|---|
| 6069c86 | This-week view |

Undo: `git revert --no-edit 6069c86` and push, or `git checkout pm-v2.6-final -- pm`, commit, push.
No data changes; adds ui pref pm.ui.v2.vf (view filters).

## v2.8

| Commit | Change |
|---|---|
| 334c565 | Status board |

Undo: `git revert --no-edit 334c565` and push, or `git checkout pm-v2.7-final -- pm`, commit, push.
No schema change; status moves are normal sheet edits (logged).

## v2.9

| Commit | Change |
|---|---|
| f88f29b | Undo / redo |

Undo: `git revert --no-edit f88f29b` and push, or `git checkout pm-v2.8-final -- pm`, commit, push.
No schema change; history is in memory only (cleared on reload).

## v2.10

| Commit | Change |
|---|---|
| 5f76fb7 | Print status report |

Undo: `git revert --no-edit 5f76fb7` and push, or `git checkout pm-v2.9-final -- pm`, commit, push.
No data changes.

## v2.11

| Commit | Change |
|---|---|
| 46569d2 | Collapse branches |

Undo: `git revert --no-edit 46569d2` and push, or `git checkout pm-v2.10-final -- pm`, commit, push.
No data changes; collapse state stays in pm.ui.v2.collapsed (adds 'root' key).

## v2.12

| Commit | Change |
|---|---|
| f8a5389 | Stations editor |

Undo: `git revert --no-edit f8a5389` and push, or `git checkout pm-v2.11-final -- pm`, commit, push.
Adds optional seg.reverse; station parser also accepts plain feet (1000). Timeline UI removed, no data removed.

## v2.13

| Commit | Change |
|---|---|
| 7531470 | Split / merge segments |

Undo: `git revert --no-edit 7531470` and push, or `git checkout pm-v2.12-final -- pm`, commit, push.
No schema change.

## v2.14

| Commit | Change |
|---|---|
| 9cedcc4 | Copy road to sub-project |

Undo: `git revert --no-edit 9cedcc4` and push, or `git checkout pm-v2.13-final -- pm`, commit, push.
No schema change.

## v2.15

| Commit | Change |
|---|---|
| 1589f1f | Quick-add + command palette |

Undo: `git revert --no-edit 1589f1f` and push, or `git checkout pm-v2.14-final -- pm`, commit, push.
No schema change; adds ui pref lastScale.

## v2.16

| Commit | Change |
|---|---|
| 1daff27 | Multi-select + bulk edit |

Undo: `git revert --no-edit 1daff27` and push, or `git checkout pm-v2.15-final -- pm`, commit, push.
No schema change.

## v2.17

| Commit | Change |
|---|---|
| cad65df | Recently changed + remembered filters |

Undo: `git revert --no-edit cad65df` and push, or `git checkout pm-v2.16-final -- pm`, commit, push.
Log entries gain an optional ref {t,id}; ui pref gains filt.

## v2.18

| Commit | Change |
|---|---|
| 164844b | Shortcut help + empty-state hints |

Undo: `git revert --no-edit 164844b` and push, or `git checkout pm-v2.17-final -- pm`, commit, push.
No data changes.

## v2.19

| Commit | Change |
|---|---|
| 42d957d | Report narrative + notes |

Undo: `git revert --no-edit 42d957d` and push, or `git checkout pm-v2.18-final -- pm`, commit, push.
Adds st.reportNotes {} (filled on load); generated text never stored.

## v2.20

| Commit | Change |
|---|---|
| e74b1eb | PM v2.20 CSV import |

Undo: `git revert --no-edit e74b1eb` and push, or `git checkout pm-v2.19-final -- pm`, commit, push.
No data migration; import is local only

## v3.0 (sections restructure)

Tags: pm-v3-pre (last v2 state), pm-v3.0, pm-v3.0-final.

| Commit | Change |
|---|---|
| a4d0e6a | pm v3.0 (part 4): e2e for v3 from a v2 fixture |
| 1669693 | pm v3.0 (part 3): v3 styles and labels |
| 75a69cf | pm v3.0 (part 2): app UI for sections, roads, migration notice, settings editor |
| 51152d2 | pm v3.0 (part 1): sections model, road entries, v2→v3 migration, tests |

Undo (code): `git checkout pm-v3-pre -- pm`, commit, push (no force).
Data: v3 writes pm.data.v3 / pm.ui.v3 only. pm.data.v2 is never modified, and a copy is kept in pm.data.v2.pre-v3-backup, so the v2 app reopens with the old data. Edits made in v3 are not carried back to v2. Settings → Old v2 data can download the v2 JSON.

## v3.1 (rename sub-projects)

Tags: pm-v3.0-final (before), pm-v3.1, pm-v3.1-final.

| Commit | Change |
|---|---|
| 2fb5b5e | pm v3.1: e2e for sub-project rename |
| 0acb564 | pm v3.1: rename styles |
| 2332ec4 | pm v3.1: rename sub-projects on the tree, in the details panel and in Settings |
| 6d1f1aa | pm v3.1: sub-project display names (renameSub, checks, names in logs/CSV/report), tests |
| 0abeba2 | Bid Estimator: ROLLBACK note for plot appendix |
| d3da100 | Bid Estimator: print report appendix with per-item plots (B/W-safe), reference line, Include plot appendix toggle |

Undo (code): `git checkout pm-v3.0-final -- pm`, commit, push (no force).
Data: no schema change. Names live in the existing subs[].name field of pm.data.v3; v3.0 shows the custom names too. id, letter (code) and order are never changed by a rename.

## v3.2 (roads and sheet station ranges in the tree)

Tags: pm-v3.2-pre (= pm-v3.1-final, before), pm-v3.2, pm-v3.2-final.

| Commit | Change |
|---|---|
| 20c7b6f | pm v3.2 (part 4): e2e for road branches, ranges, overrides and v3.1→v3.2 migration |
| 513bb8c | pm v3.2 (part 3): road/sheet level styles and tree level options |
| 219f029 | pm v3.2 (part 2): road and sheet-range branches, drawers, palette, list/board ranges, migration notice |
| b87198e | pm v3.2 (part 1): road groups, per-sheet station ranges, overrides, warnings, upgrade, CSV stations, tests |

Undo (code): `git checkout pm-v3.1-final -- pm`, commit, push (no force).
Data: same key pm.data.v3. Before the upgrade the untouched v3.1 data is copied to pm.data.v3.pre-v3.2-backup (download from the notice or Settings). To go back fully, restore the code and put the backup back: `localStorage.setItem('pm.data.v3', localStorage.getItem('pm.data.v3.pre-v3.2-backup'))`. v3.1 code ignores the new `sta` / `v32` fields, so keeping v3.2 data also works.

## v3.3 (professional printed report)

Tags: pm-pre-report (before), pm-v3.3, pm-v3.3-final.

| Commit | Change |
|---|---|
| 1fc1c37 | pm v3.3 (part 4): e2e for printed report and PDF output |
| 88b1c46 | pm v3.3 (part 3): print stylesheet: page header/footer, page numbers, B/W chips, Letter/A4, page breaks |
| 624200c | pm v3.3 (part 2): printed report layout and report settings |
| e2e5d74 | pm v3.3 (part 1): printable report data (printReport, report meta), tests |

Undo (code): `git checkout pm-pre-report -- pm`, commit, push (no force).
Data: no schema change. Optional fields project.report {preparedFor, preparedBy, scope, reportNo} in pm.data.v3 and ui.rpt in pm.ui.v3; older versions ignore them.

## v3.4 bullet report

| Commit | Change |
|---|---|
| dadef38 | pm v3.4: e2e for the bullet report and Letter/A4 PDFs |
| 1f9613e | pm v3.4: bullet report (takeaways, attention, next steps, branch/sub bullets, road sub-lists, dependency pairs, workload detail) + Use bullet summaries toggle, print CSS |
| 472adf9 | pm v3.4: cap attention lists with + n more |
| 941c40b | pm v3.4: report outline model (takeaways, attention, next steps, branch bullets, roads, dependency pairs) + tests |

Undo: `git revert --no-edit pm-pre-bullets..pm-v3.4-final` then push (no force), or `git checkout pm-pre-bullets -- pm` and commit.
Data model and storage unchanged (M.reportOutline is derived only). UI setting `ui.rpt.bullets` (default on) picks bullets vs the v3.3 paragraph style.
