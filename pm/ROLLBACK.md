# PM (private project manager) — how to go back

Every version is tagged. Going back never needs a force push: you either revert commits
(adds new "undo" commits) or restore files from a tag and commit that.

| Tag | What it is |
|---|---|
| `pm-pre` | main just before the PM tool was added (no `/pm/` folder) |
| `pm-v1` | First live version of `/pm/` |

The PM tool only adds files under `pm/`. It does not touch the home page, `index.html`,
`home.css`, `scripts/check-home.js` or any other tool, so removing it cannot break them.

## Commits

| Change | Commit |
|---|---|
| 1 Crypto + data model + Node tests | 86097f1 |
| 2 App UI (lock, dashboard, views, backup, auto-lock) | 1b22d59 |
| 3 Headless-Chrome end-to-end test | 49c61fd |
| 4 This note | (the commit that adds this file) |

## Undo one change

```
git pull
git revert --no-edit <sha>
node pm/test.js                  # must print ok
node scripts/check-home.js       # must print ok
git push origin main
```

## Remove the PM tool completely (back to `pm-pre`)

```
git pull
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
