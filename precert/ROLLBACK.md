# TxDOT Precertification (`/precert/`) — how to go back

Going back never needs a force push: restore files from a tag and commit, or revert commits.

| Tag | What it is |
|---|---|
| `precert-pre` / `home-pre-precert` | main just before the tool and its home card (bddc4c6) |
| `precert-v1` / `precert-v1-final` | First version of `/precert/` plus the home card |

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
