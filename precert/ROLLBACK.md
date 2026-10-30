# TxDOT Precertification (`/precert/`) — how to go back

Going back never needs a force push: restore files from a tag and commit, or revert commits.

| Tag | What it is |
|---|---|
| `precert-pre` / `home-pre-precert` | main just before the tool and its home card (bddc4c6) |
| `precert-v1` / `precert-v1-final` | First version of `/precert/` plus the home card |
| `precert-pre-example` | = precert-v1-final (87f3299), before example mode |
| `precert-v1.1` / `precert-v1.1-final` | Fictional example mode (Load / Clear example, banner, watermark) |

| Commit | Change |
|---|---|
| c566e56 | home: TxDOT Precertification card; check-home covers it |
| d21460e | precert: headless Chrome e2e |
| 69e7c18 | precert: app UI |
| 9541320 | precert: local report dates, skip empty certification lines |
| 8f01f55 | precert: model and unit tests |
| f6c3935 | precert: TxDOT work categories data |

## Remove only the home card (keep /precert/ reachable by URL)

    git checkout home-pre-precert -- index.html home.css scripts/check-home.js
    git commit -m "home: remove TxDOT Precertification card" && git push

## Remove the tool completely

    git checkout home-pre-precert -- index.html home.css scripts/check-home.js
    git rm -r precert
    git commit -m "Remove TxDOT Precertification tool" && git push

## Data

Everything lives in the browser: `precert.data.v1` (profile, projects, write-ups, CCIS ticks) and `precert.ui.v1` (tab, theme).
Removing the code does not delete it; export a JSON backup from the Export tab first if you want to keep it.

## Updating the work categories

`precert/categories.json` was extracted from TxDOT's Precertification Work Categories document (dated 08/25/2026,
https://www.txdot.gov/content/dam/docs/division/ppd/precert/precert-work-categories.docx), verified 2026-10-29.
When TxDOT publishes a new list, regenerate the file and update `docDate` / `verified`.

## v1.1 example mode

| Commit | Change |
|---|---|
| 874b28a | precert v1.1: e2e for example mode |
| 3f422d8 | precert v1.1: Load / Clear example, banner, Restore my data, watermarked exports |
| 5f28009 | precert v1.1: example data model and tests |

Undo (keeps v1): `git revert --no-edit precert-pre-example..precert-v1.1-final` then push (no force),
or `git checkout precert-pre-example -- precert` and commit.
Data: the example lives in `precert.data.v1` with `example: true` and `isExample` flags; real data is copied to
`precert.data.v1.pre-example` before loading and put back by "Clear example" / "Restore my data". v1 ignores the flags.

## v1.2 filled TxDOT form

| Commit | Change |
|---|---|
| f2a4b58 | precert v1.2: e2e for the TxDOT form outputs |
| 2e633e9 | precert v1.2: TxDOT form tab, checklist, .docx / print / share / copy, new inputs |
| 36203dc | precert: form data model (CCIS dates, mapping, mandatory check, form text) + tests |
| b7520ac | precert: bundle official form template (09/18/2026) and in-browser docx filler |

Undo (keeps v1.1): `git revert --no-edit precert-pre-form..precert-v1.2-final` then push (no force),
or `git checkout precert-pre-form -- precert` and commit.
Template: `precert/form-template.docx` is a byte-identical copy of
https://www.txdot.gov/content/dam/docs/division/ppd/precert/precertification-application-form.docx (form dated 09/18/2026).
When TxDOT revises the form, replace the file and re-run `node precert/test.js` (the docx round-trip test checks the fill).
Data: new optional fields (profile.employeeSeq, profile.peAgency, cert.degreeType/trainingType/trainingDate) default to ''
on load; v1.1 ignores them, so rolling back loses nothing else.

## v1.3 suggestions, years check, write-up quality, reference-data notice

| Commit | Change |
|---|---|
| 1a04739 | precert v1.3: e2e for suggestions, years check, quality, reference line |
| 61c8abf | precert v1.3: short write-ups never rate green |
| b97c351 | precert v1.3: reference-data dates, age notice + Check for updates link, manual refresh script |
| 06a11de | precert v1.3: write-up quality checker (flags, traffic light, requirement term match, hints) + tests |
| 80999bb | precert v1.3: years-of-experience check per category (parsed minimum, overlaps once, Readiness + form warnings) + tests |
| b6c44e7 | precert v1.3: suggest work categories from project text (keyword scoring, why, one-tap add) + tests |

Undo (keeps v1.2): `git revert --no-edit precert-pre-v13..precert-v1.3-final` then push (no force),
or `git checkout precert-pre-v13 -- precert scripts/refresh-precert-data.js` and commit.
New files: precert/suggest.js (keyword rules per category, PCS), precert/quality.js (write-up checks, PCQ),
scripts/refresh-precert-data.js. Data: `ref` (reference dates) is added to saved data on load; older versions ignore it.

## Updating reference data (TxDOT publishes a new list or form)

1. `node scripts/refresh-precert-data.js --save /tmp/precert-new` (Node 18+). Exit 0 = unchanged, 2 = changed, 1 = error.
   It compares the categories document's date line (or Last-Modified) with `REF.categoriesDate` / categories.json `docDate`,
   and the form's SHA-256 with precert/form-template.docx. It changes nothing.
2. Form changed: copy the new .docx to precert/form-template.docx, update `REF.formDate` in precert/model.js and the
   date in formText/formNodes labels, run `node precert/test.js` (docx round trip) and fix label mappings in docx.js if the layout changed.
3. Categories changed: regenerate precert/categories.json (docDate, verified), update `REF.categoriesDate`.
4. Set `REF.verified` to the check date (the in-app notice turns amber after 90 days), run tests + e2e, commit, push.
No GitHub Action is used (the repo has no workflows); run the script by hand.

## v1.4 interface

| Commit | Change |
|---|---|
| 3a0143d | precert v1.4: e2e for the interface changes (menu, tabs, tour, cards, editor, jump, contrast) |
| 2fa1a32 | precert v1.4: collapsed project cards, Next step bar, side-by-side / full-screen editor, tap-to-fix form fields, tour, tap targets, dark contrast |
| 461590e | precert v1.4: Next step guide model (readiness, years, write-up quality, form) + tests |
| 80103da | precert v1.4: header menu (example, theme, tour), one slim notice bar, live saved indicator, phone bottom tab bar with More |

Undo (keeps v1.3): `git revert --no-edit precert-pre-v14..precert-v1.4-final` then push (no force),
or `git checkout precert-pre-v14 -- precert` and commit.
New file: precert/guide.js (Next step, PCG). UI-only state in `precert.ui.v1`: `tour` (0–3 or 'done'), `openProj`; no change to saved data.
