# Releasing

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning
and publishing `prettier-plugin-tsql` and `prettier-plugin-postgresql` independently.
`@prettier-sql/core` is private and never published.

## The normal flow (do this after any user-facing change)

1. **Describe the change** — from the repo root:

   ```bash
   pnpm changeset
   ```

   It asks which package(s) changed and whether it's a `patch` / `minor` / `major`
   bump, then writes a file like `.changeset/funny-words-here.md`. Edit that file's
   body if you want a better changelog entry than what you typed at the prompt.

2. **Commit the changeset file** alongside your code change, in the same PR:

   ```bash
   git add .changeset/*.md
   git commit -m "..."
   ```

3. **Merge to `main`.** That's it — steps 4 and 5 below happen in CI automatically.

## What CI does after that (`.github/workflows/release.yml`)

Every push to `main` runs the release workflow:

- **If there are unreleased changesets** (files in `.changeset/`), the
  [changesets/action](https://github.com/changesets/action) bot opens or updates a PR
  titled **"Version Packages"**. That PR bumps `package.json` versions, writes
  `CHANGELOG.md` entries, and deletes the consumed changeset files. It does *not*
  publish anything yet.
- **When you merge that "Version Packages" PR**, the next workflow run finds no
  pending changesets and instead runs `pnpm release` (see below) to actually publish
  to npm.

So day-to-day, publishing is just: write a changeset, merge your PR, then later merge
the auto-generated "Version Packages" PR whenever you're ready to cut a release.

## The scripts (`package.json`)

| Script | What it does |
|---|---|
| `pnpm changeset` | Interactive — describe a change (step 1 above) |
| `pnpm release:version` | `changeset version` — consumes changesets into version bumps + changelogs, no publish |
| `pnpm release:publish` | Builds all packages, then `changeset publish` |
| `pnpm release` | The full local one-shot: checks npm login (prompts `npm login` if needed) → `changeset version` → build → `changeset publish` |

`pnpm release` is what CI's release workflow runs for you after the Version Packages
PR is merged. You normally never run it yourself — it's there as a manual fallback if
you ever need to publish outside CI.

## ⚠️ Known gap: NPM_TOKEN is not configured

`.github/workflows/release.yml` doesn't set `NODE_AUTH_TOKEN` (or any npm auth) for
the publish step, and `gh secret list` shows no `NPM_TOKEN` secret exists in this repo.
**This means the CI publish step will currently fail to authenticate with npm.**

To fix:

1. Generate a Granular Access Token at npmjs.com (Account → Access Tokens),
   scoped read+write to `prettier-plugin-tsql` and `prettier-plugin-postgresql`.
2. Add it as a repo secret: Settings → Secrets and variables → Actions → `NPM_TOKEN`.
3. Add `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the `changesets/action` step's
   `env:` block in `.github/workflows/release.yml` (alongside the existing
   `GITHUB_TOKEN`).

Until then, publishing only works via the manual `pnpm release` path, run locally
after `npm login` with an account that has publish rights to both packages.
