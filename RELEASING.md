# Releasing

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning
and publishing `prettier-plugin-tsql` and `prettier-plugin-postgresql` independently.
`@prettier-sql/core` is private and never published.

## Cutting a release: `pnpm release`

Once changesets for your changes are committed (see below), run this in your own
terminal:

```bash
pnpm release
```

It shows what would ship — each package's old and new version, and the changesets —
and asks once whether to go ahead. Then it runs on its own: pushes `main` if needed,
waits for CI's tests, waits for the Release workflow to refresh the Version Packages
PR, checks the PR bumps exactly what it showed you, merges it, and waits for the
Release run that stages the new versions on npm. It finishes with the one step that
can't be automated: approving each staged version (npm opens a browser tab for 2FA).
Then it checks the versions are live and fast-forwards your local `main`.

It also asks whether to publish the **VS Code extension** (`PickyCode.prettier-sql`),
which bundles both plugins — its users only get plugin fixes once it's republished.
If you say yes, the script adds a changeset for the extension (so its version bump and
changelog ride in the same Version Packages PR), and after the npm approvals it builds
the plugins, packages the extension with them bundled, and publishes it with `vsce`.

The first time, it needs a one-time Marketplace setup (the script prints these steps
and prompts for the token when `vsce` isn't logged in):

1. Create the publisher `PickyCode` at <https://marketplace.visualstudio.com/manage>.
2. Create a personal access token at <https://dev.azure.com> with organization
   *All accessible organizations* and scope *Marketplace → Manage*.

- `pnpm release --dry-run` shows what would happen and changes nothing.
- If it's interrupted, run it again: it picks up from an open Version Packages PR, or
  offers to approve versions that were staged but never approved, or to publish an
  extension version that isn't on the Marketplace yet.
- Run it yourself, not through an AI agent: it pushes, merges and publishes, and the
  approvals need your 2FA.

Everything below explains what the script automates.

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
| `pnpm release` | The interactive release (`scripts/release.sh`) — see [Cutting a release](#cutting-a-release-pnpm-release) |
| `pnpm release:manual` | Publish from your machine, bypassing CI (`scripts/release.mjs`): checks npm login (prompts `npm login` if needed) → `changeset version` (skipped if there are no pending changesets) → build → `changeset publish` |

CI does not run `changeset publish` — it runs `scripts/stage-publish.mjs` after the
Version Packages PR is merged. `pnpm release:manual` and `pnpm release:publish` publish
directly (not staged), using your own npm login and 2FA; they're the fallback for
publishing outside CI, and safe to re-run after a failed publish, since
`changeset publish` skips versions that are already on npm.

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
