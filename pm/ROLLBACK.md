# PM (private project manager) — how to go back

Every version is tagged. Going back never needs a force push: you either revert commits
(adds new "undo" commits) or restore files from a tag and commit that.

| Tag | What it is |
|---|---|
| `pm-pre` | main just before the PM tool was added (no `/pm/` folder) |
| `pm-v1` | First live version of `/pm/` (no home card) |
| `pm-v1.1` / `pm-v1.1-final` | + "Project Tracker" card on the home page (last encrypted, passphrase-login version) |
| `pm-v2` | Testing mode (no login, plain JSON), tree UI, PP sheet counts |

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
