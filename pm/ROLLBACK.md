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

## v3.20 (report font)

The Report view has a Report font control beside Report type. The same choice is used by the status report, the engineering report, and the work description, on screen and in the printed PDF. It is saved in pm.ui.v3 on this browser. It is not stored in the project.

Source Sans is the default: Source Sans 3 for the body and the tables, Source Serif 4 for the headings, with tabular figures in the tables. Inter uses that one family throughout. IBM Plex uses IBM Plex Sans, and the figures in the tables are IBM Plex Mono. Calibri uses Calibri for the body and Cambria for the headings. When those are not installed it falls back to Carlito and Caladea, then Arial and Georgia.

The open fonts are woff2 files in pm/fonts, under the SIL Open Font License (the OFL files sit next to them). The page does not request them from a font host, so the reports keep their font offline and on GitHub Pages.

## v3.19 (engineering report subtotals)

The engineering report adds a subtotal only where a table has more than one row in a group. Sheets by package: a section subtotal when a section has more than one group, the All sections row for each package, an All packages row when the same section appears in more than one package, and the Total at the bottom. Sheets and Carry-on sheets both add up. Those cross-package rows are another way of reading the same sheets, so the Total is the sum of the package rows only.

Detention ponds and special junction boxes get a subtotal for a sub-project that has more than one, plus a total when the table has more than one row. Drainage laterals and bridge deck items get a total when more than one row is listed, and a bridge item that appears in more than one package gets its own subtotal. Each standards table gets a total when it lists more than one standard.

Subtotal rows are bold and shaded on screen and in the printed report. A one-row group has no subtotal.

## v3.18 (carry-ons stay in their group and count as sheets)

A sheet carried into a later package is shown in that package under the same section and the same sub-group as the original: the same pond name, junction box, road, trunk line, or drainage-area-map road. If that package already has the group, the carried sheet sits in it, ordered by sheet number. If it does not, the group is shown with the original’s name. Renaming the original pond renames that group. Flat sections, such as laterals, bridge deck, and standards, keep the carried sheet in the section with the other sheets, ordered by sheet number, rather than in a separate carried list.

A carried sheet counts as a sheet in every package that has it: the package total, the section and group counts, progress, and the per-package numbers in the status report, the engineering report, and the work description. Adding the packages counts it again. Reports that mention unique plan sheets label that figure separately.

The engineering report’s sheets-by-package table has a Carry-on sheets column. Each section, and each group inside a section, shows how many of its sheets are carried on. Each package has an All sections row, and a Total row adds the carry-on sheets across packages. The Sheets column includes the carry-ons.

## v3.17 (find carry-ons)

Find carry-ons scans every package, in the project’s package order, for a sheet in a later package that repeats a sheet from an earlier one. Nothing is linked until you click. The strongest match wins: the same standard name (a pick-list name or the same custom title, with “(1 of 2)” kept paired), then the same road with overlapping stations on a plan and profile, trunk line, or drainage area map, then the same pond or junction box name and sheet, then the same sheet title in the same section. A match is Exact when the names or titles are the same, and Likely when the road and stations overlap but the titles differ.

Link as carry-on turns that later sheet into a carry-on of the original and keeps its status, owner, due date, notes, and QC. The title and sheet number then follow the original. Ignore hides that pair until Reset ignored. Link all exact matches asks first and leaves the likely ones for review. Sheets that are already carry-ons are skipped. Older projects have no ignore list until you ignore a suggestion.

## v3.16 (engineering report detail)

The engineering report still only restates what is entered in the tracker. Bracketed placeholders stay where an engineer has to supply a value.

Proposed Drainage Improvements lists each detention pond by name, with its Layout, Cross Sections, and Geometric Layout sheets, grouped by sub-project. Special junction boxes are listed one by one, with 3 sheets each. Drainage laterals and the three bridge deck sections are counted per sub-project.

Deliverables adds a standards table for Drainage and one for SWP3. A name from the pick-list is marked Pick list. Any other sheet in a standards section is marked Custom. A standard that spans “(1 of 2)” and “(2 of 2)” is one row with a sheet count of 2. The row names the sub-projects that use it, and notes a later package that carries it on.

Scope of Work adds a table of sheets per package, discipline, and section. The sheet count is the sheets that start in that package. A carry-on is noted in its own column and is not counted again in the project totals.

The copy-as-text output includes the same headings, lists, and tables as the printed report.

## v3.15 (pond names, carry-on sheets, work description)

Detention ponds can be named. The name starts as Pond 1, Pond 2, and so on, and it is written into sheet titles that have not been edited by hand. Changing the pond count keeps names already entered; a new pond gets the next default name. A blank name goes back to Pond N. Older projects get the default names when they are opened.

A later package can carry on a sheet that started in an earlier package. The later package gets its own entry, with its own status, owner, due date, notes, and QC. The title and sheet number stay with the original and update when that original changes. The later entry is marked carried from that package, and the original shows which packages carry it. The chain is every package that carries that same original, in package order (A → B → C). Each package’s sheet list includes its own entry. Project-wide totals count the sheet once. Removing the carry-on leaves the original in place. Deleting the original removes the carry-on entries too. Saved projects have no carry-on links until someone adds one.

The work description is a third report, beside the status report and the engineering report. It says what each package will cover: branches and sections, roads and stations, counts of laterals, ponds, junction boxes and other sheets, standard names, and which sheets a package carries on from another. It does not report status counts or percent complete. It prints and copies as text the same way as the other reports.

## v3.14 (copy trunk lines from another branch)

On a sub-project’s Trunkline section, “Copy trunk lines from another branch” copies every trunk line road (name, stations, scale, alignment) and its generated sheets from another sub-project in the same project. The copies are new records. Changing one does not change the other. Sheet status on a copy starts at Not started; an edited title is kept. If this branch already has trunk lines, the app asks before appending and the notice says they were appended. The source list is other sub-projects that already have trunk lines. SWP3 has no Trunkline section, so it is not a source. Nothing is stored beyond the new roads and sheets, so older projects load unchanged.

## v3.13 (drainage standards from the plan-set index)

The Drainage Standards pick-list is the sheet names from the plan-set index, in that order. HCFCD-ISD-25 (HOU), C&DD-24 (HOU), PSL, and SW-0 each add two sheets, titled “(1 of 2)” and “(2 of 2)”. Sheets already saved under an older title, including a single sheet titled PSL, are left as they are. The SWP3 EC(1)-16 … EC(9)-16 list is unchanged.

## v3.12 (Bridge Deck Drain Details by count)

Bridge Deck Drain Details takes a sheet count, with no road. Same pattern as Bridge Deck Drawing Details, Bridge Deck Drain Summary, Standards, and Drainage Laterals. Existing sheets in that section are kept; setting a count adopts a sheet titled like the section and leaves any other sheets in place.

Standards sections also offer a pick-list of TxDOT standard sheets (`STANDARD_SHEETS` in `pm/model.js`). Drainage Standards shows only the drainage names; SWP3 Standard Details shows only the EC sheets. A picked name becomes the sheet title. The free-text add and the sheet count stay. The list is not stored in the project, so older projects are unchanged.

## v3.11 (ponds, laterals, junction boxes, optional counts)

Detention is one branch: each pond is Layout, Cross Sections, and Geometric Layout (2 sheets). The old Detention Basin Layout and Detention Basin Cross Section sections are folded into it on load. Drainage laterals are a sheet count (double-banked profiles, no road). Special junction boxes are a count of boxes, 3 sheets each. Bridge Deck Drawing Details, Bridge Deck Drain Summary, and Standards can also be entered as a sheet count. Saved projects keep sheet status, owners, notes, and edited titles; generated lateral sheets become counted sheets.

## v3.4 bullet report

| Commit | Change |
|---|---|
| dadef38 | pm v3.4: e2e for the bullet report and Letter/A4 PDFs |
| 1f9613e | pm v3.4: bullet report (takeaways, attention, next steps, branch/sub bullets, road sub-lists, dependency pairs, workload detail) + Use bullet summaries toggle, print CSS |
| 472adf9 | pm v3.4: cap attention lists with + n more |
| 941c40b | pm v3.4: report outline model (takeaways, attention, next steps, branch bullets, roads, dependency pairs) + tests |

Undo: `git revert --no-edit pm-pre-bullets..pm-v3.4-final` then push (no force), or `git checkout pm-pre-bullets -- pm` and commit.
Data model and storage unchanged (M.reportOutline is derived only). UI setting `ui.rpt.bullets` (default on) picks bullets vs the v3.3 paragraph style.
