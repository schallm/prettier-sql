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
  pending changesets and instead runs `scripts/stage-publish.mjs` (after building all
  packages), which **stages** each new version on npm. Staged versions aren't public
  until you approve them — see [Approving a staged release](#approving-a-staged-release).

So day-to-day, publishing is just: write a changeset, merge your PR, then later merge
the auto-generated "Version Packages" PR whenever you're ready to cut a release, and
approve the staged versions on npm.

## The scripts (`package.json`)

| Script | What it does |
|---|---|
| `pnpm changeset` | Interactive — describe a change (step 1 above) |
| `pnpm release:version` | `changeset version` — consumes changesets into version bumps + changelogs, no publish |
| `pnpm release:publish` | Builds all packages, then `changeset publish` |
| `pnpm release` | The full local one-shot: checks npm login (prompts `npm login` if needed) → `changeset version` → build → `changeset publish` |

CI does not run `pnpm release` or `changeset publish` — it runs
`scripts/stage-publish.mjs` after the Version Packages PR is merged. The local scripts
publish directly (not staged), using your own npm login and 2FA. `pnpm release` is the manual fallback for publishing outside CI.
Since `@changesets/cli` 3.0, `changeset version` exits 1 when there are no pending
changesets, so `pnpm release` stops right there if everything is already versioned. In
that case (e.g. re-running after a failed publish) use `pnpm release:publish` instead.

## npm authentication: trusted publishing + staged releases

CI has no npm token. Both packages have an npm **trusted publisher** for
`schallm/prettier-sql` / `release.yml`, so the workflow authenticates via GitHub OIDC
(`id-token: write`). Those trusted publishers are **stage-only**: they allow
`npm stage publish` but not `npm publish`, so a compromised CI run can't push a
release live without a maintainer's 2FA.

Check the configuration with (prompts for 2FA):

```bash
npm trust list prettier-plugin-tsql
npm trust list prettier-plugin-postgresql
```

Each should show one `github` entry for `schallm/prettier-sql`, `release.yml`, with
`permissions: stage publish` only.

### Approving a staged release

After the Version Packages PR is merged and the workflow succeeds, the new versions
are staged but **not public yet**. Approve each one with 2FA, either on the package's
page on npmjs.com, or from the CLI:

```bash
npm stage list prettier-plugin-tsql
npm stage approve <stage-id>
```

(`npm stage reject <stage-id>` discards one; `npm stage download <stage-id>` fetches
the tarball for inspection.) The GitHub release and `name@version` git tag are created
when the version is staged, before approval.

### Re-running a failed release

`scripts/stage-publish.mjs` skips versions already published to npm, but it can't
tell whether a version is already *staged*. If a run staged one package and failed on
the other, re-running it will fail on the already-staged one too. Either approve or
reject the staged version first, or stage the remaining package by hand.
