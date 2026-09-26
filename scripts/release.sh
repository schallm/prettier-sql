#!/usr/bin/env bash
# Interactive release script: prettier-plugin-tsql and prettier-plugin-postgresql on
# npm, and optionally the VS Code extension (PickyCode.prettier-sql) that bundles them.
#
# Releasing through Changesets is several steps that are easy to get out of order
# or forget: push main, wait for CI, wait for the Release workflow to refresh the
# "Version Packages" PR, merge it, wait for the next Release run to stage the new
# versions on npm, approve each with 2FA — and then rebuild and publish the VS Code
# extension so its users get the fixes too. This script does all of it:
#
#   - checks first: clean main, gh / npm (and vsce, for the extension) logged in;
#   - questions up front: shows what would ship (package, old -> new version, and
#     each changeset) and asks to proceed, and whether to publish the extension;
#   - then runs unattended: adds the extension's changeset, pushes main, waits for
#     CI's tests, waits for the Version Packages PR, checks its versions match the
#     plan, merges it, waits for the Release run that stages the versions on npm;
#   - approving each staged version is the one step that can't be automated by
#     design (npm opens a browser tab for 2FA); then it checks the versions are
#     live, fast-forwards your local main, and builds and publishes the extension.
#
# Run it again after an interruption: it picks up where things stand (an open
# Version Packages PR, staged versions still waiting for approval, or an extension
# version that isn't on the Marketplace yet).
#
# Run this yourself in your own terminal, not through an AI coding agent: it pushes
# main, merges a PR and publishes to npm and the Marketplace, and needs your 2FA.
#
#   pnpm release              # the whole release
#   pnpm release --dry-run    # show what would happen; changes nothing
#
# Requires: git, gh (authenticated), npm >= 11.10 (for `npm stage`), node, pnpm.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'Unknown option: %s (try --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

VERSION_BRANCH="changeset-release/main"
REGISTRY="https://registry.npmjs.org"
EXT_DIR="extensions/vscode-sql"
EXT_PACKAGE="prettier-sql" # the extension's workspace package name (private: never on npm)

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!!\033[0m %s\n' "$1"; }
die()  { printf '\033[31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

ask_yn() {
  local prompt="$1" default="${2:-n}" reply
  local hint="y/N"
  [[ "$default" == "y" ]] && hint="Y/n"
  while :; do
    read -r -p "$prompt [$hint] " reply || reply=""
    reply="${reply:-$default}"
    [[ "$reply" =~ ^[Yy]$ ]] && return 0
    [[ "$reply" =~ ^[Nn]$ ]] && return 1
    echo "  Please answer y or n."
  done
}

# Runs a command that changes something (push, merge, approve, publish) — or, with
# --dry-run, just says what it would have run.
act() {
  if $DRY_RUN; then
    printf '\033[35m[dry run]\033[0m would run: %s\n' "$*"
  else
    "$@"
  fi
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Waits for workflow $1's run on commit $2 to finish and succeed, leaving its id in
# RUN_ID. Watches the run while it's in progress; dies if it fails or never starts.
wait_for_run() {
  local workflow="$1" sha="$2" label="$3" deadline=$((SECONDS + 180)) run status conclusion
  info "Waiting for ${label} on ${sha:0:8}..."
  while :; do
    run="$(gh run list --workflow "$workflow" --commit "$sha" --limit 1 \
      --json databaseId,status,conclusion -q '.[0] | "\(.databaseId) \(.status) \(.conclusion)"' 2>/dev/null || true)"
    if [[ -n "$run" ]]; then
      read -r RUN_ID status conclusion <<<"$run"
      if [[ "$status" != "completed" ]]; then
        gh run watch "$RUN_ID" --interval 10 >/dev/null 2>&1 || true
        continue
      fi
      [[ "$conclusion" == "success" ]] && { info "  ${label} passed"; return 0; }
      die "${label} failed on ${sha:0:8} (${conclusion}) — nothing further was done:
  $(gh run view "$RUN_ID" --json url -q .url)"
    fi
    (( SECONDS >= deadline )) && die "No ${label} run appeared for ${sha:0:8}. Check the Actions tab."
    sleep 5 # a run for a just-pushed commit can take a few seconds to appear
  done
}

# Prints "name@version id" for each version the Release run $1 staged.
staged_from_run() {
  gh run view "$1" --log 2>/dev/null \
    | sed -nE 's/.*\+ ([^ ]+@[0-9][^ ]*) \(staged with id ([0-9a-f-]+)\).*/\1 \2/p' \
    | sort -u
}

is_published() {
  [[ "$(npm view "$1" version --registry "$REGISTRY" --prefer-online 2>/dev/null || true)" == "${1##*@}" ]]
}

# The published (non-private) npm packages' names.
publishable_packages() {
  node -e '
    const fs = require("fs");
    for (const dir of fs.readdirSync("packages")) {
      const p = `packages/${dir}/package.json`;
      if (!fs.existsSync(p)) continue;
      const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!pkg.private) console.log(pkg.name);
    }'
}

# package.json field $2 of the workspace package in directory $1.
pkg_field() { node -p "require('./$1/package.json').$2"; }

# The directory of workspace package $1 (packages/* or extensions/*).
pkg_dir() {
  local p
  for p in packages/*/package.json extensions/*/package.json; do
    [[ "$(node -p "require('./$p').name")" == "$1" ]] && { dirname "$p"; return 0; }
  done
  return 1
}

EXT_ID="$(pkg_field "$EXT_DIR" publisher).$(pkg_field "$EXT_DIR" name)"
EXT_PUBLISHER="$(pkg_field "$EXT_DIR" publisher)"

# The extension's latest version on the VS Code Marketplace, or nothing if it has
# never been published.
marketplace_version() {
  curl -fsS -X POST "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery" \
    -H "Content-Type: application/json" -H "Accept: application/json;api-version=7.2-preview.1" \
    -d "{\"filters\":[{\"criteria\":[{\"filterType\":7,\"value\":\"${EXT_ID}\"}]}],\"flags\":1}" 2>/dev/null \
    | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try { console.log(JSON.parse(s).results[0].extensions[0].versions[0].version); } catch {}
      })' || true
}

vsce() { (cd "$EXT_DIR" && npx --yes @vscode/vsce "$@"); }

# Makes sure vsce can publish as the extension's publisher, logging in if needed.
ensure_vsce_login() {
  vsce verify-pat "$EXT_PUBLISHER" >/dev/null 2>&1 && { info "vsce can publish as ${EXT_PUBLISHER}"; return 0; }
  warn "vsce is not logged in as publisher '${EXT_PUBLISHER}'."
  echo "  One-time setup, if you haven't done it:"
  echo "    1. Create the publisher '${EXT_PUBLISHER}': https://marketplace.visualstudio.com/manage"
  echo "    2. Create a personal access token at https://dev.azure.com (any organization,"
  echo "       'All accessible organizations', scope Marketplace > Manage)."
  echo "  Then paste the token at the prompt below."
  if $DRY_RUN; then warn "Skipping vsce login in a dry run."; return 0; fi
  vsce login "$EXT_PUBLISHER"
  vsce verify-pat "$EXT_PUBLISHER" >/dev/null 2>&1 || die "vsce still can't publish as ${EXT_PUBLISHER}."
}

# Builds the plugins, packages the extension with them bundled, and publishes it.
publish_extension() {
  local version vsix
  version="$(pkg_field "$EXT_DIR" version)"
  vsix="${EXT_DIR}/${EXT_PACKAGE}-${version}.vsix"
  echo
  bold "Publishing the VS Code extension ${EXT_ID} ${version}"
  info "Bundles $(for d in packages/plugin-*; do printf '%s@%s ' "$(pkg_field "$d" name)" "$(pkg_field "$d" version)"; done)"
  act pnpm install --frozen-lockfile
  act pnpm --filter "./packages/**" --sequential build
  # pack.mjs swaps the symlinked bundled/node_modules for real files, runs vsce package
  # and restores the symlinks — so publish the .vsix it built, not the folder.
  act node "${EXT_DIR}/scripts/pack.mjs"
  if $DRY_RUN; then
    printf '\033[35m[dry run]\033[0m would run: vsce publish --packagePath %s\n' "$(basename "$vsix")"
  else
    [[ -f "$vsix" ]] || die "Packaging didn't produce ${vsix}."
    vsce publish --packagePath "$(basename "$vsix")"
    info "  published: https://marketplace.visualstudio.com/items?itemName=${EXT_ID}"
  fi
}

# ---------------------------------------------------------------------------
# 1. Preconditions
# ---------------------------------------------------------------------------

bold "prettier-sql release"
$DRY_RUN && warn "Dry run: nothing will be committed, pushed, merged or published."
echo

if [[ -n "$(git status --porcelain)" ]]; then
  $DRY_RUN || die "Working copy is not clean. Commit or stash first:
$(git status --short)"
  warn "Working copy is not clean (a real release would stop here)."
fi
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || die "Not on main. Releases go out from main."

command -v gh >/dev/null 2>&1 || die "The gh CLI is required. Install it and run 'gh auth login'."
gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run 'gh auth login' first."
npm stage --help >/dev/null 2>&1 || die "This npm has no 'npm stage' command. Update npm: npm install -g npm@latest"

git fetch --quiet origin main
HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$HEAD_SHA" != "$(git rev-parse origin/main)" ]]; then
  git merge-base --is-ancestor origin/main HEAD \
    || die "Local main is behind or has diverged from origin/main. Run 'git pull' first."
  AHEAD="$(git rev-list --count origin/main..HEAD)"
else
  AHEAD=0
fi

# ---------------------------------------------------------------------------
# 2. Work out what would ship, and ask — every question comes here
# ---------------------------------------------------------------------------

PLAN_JSON="$(mktemp)"
trap 'rm -f "$PLAN_JSON"' EXIT
pnpm --silent changeset status --output="$PLAN_JSON" >/dev/null 2>&1 || true

# "name old new" for each package with a pending version bump, among $1 (space-separated names)
planned_bumps() {
  node -e '
    const fs = require("fs");
    const [file, wanted] = process.argv.slice(1);
    const names = new Set(wanted.trim().split(/\s+/));
    let status = {};
    try { status = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    for (const r of status.releases ?? [])
      if (r.type !== "none" && names.has(r.name)) console.log(`${r.name} ${r.oldVersion} ${r.newVersion}`);
  ' "$PLAN_JSON" "$1"
}

NPM_PLAN="$(planned_bumps "$(publishable_packages | tr '\n' ' ')")"
EXT_PLAN="$(planned_bumps "$EXT_PACKAGE")" # set when a pending changeset already bumps the extension
DO_EXT=false
ADD_EXT_CHANGESET=false
STAGED=""

if [[ -n "$NPM_PLAN" ]]; then
  # ----- A new release -------------------------------------------------------
  echo "Will release to npm:"
  while read -r name old new; do
    printf '  - %-28s %s -> \033[1m%s\033[0m\n' "$name" "$old" "$new"
  done <<<"$NPM_PLAN"
  echo
  echo "Changesets (full text in the Version Packages PR):"
  node -e '
    const status = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const cs of status.changesets ?? []) console.log(`  * ${cs.summary.trim().split("\n")[0].replace(/^- /, "")}`);
  ' "$PLAN_JSON"
  echo

  # The extension bundles the plugins, so its users only get these fixes once it's
  # republished. Its version bump and changelog ride in the same Version Packages PR.
  if [[ -n "$EXT_PLAN" ]]; then
    read -r _ ext_old ext_new <<<"$EXT_PLAN"
  else
    ext_old="$(pkg_field "$EXT_DIR" version)"
    ext_new="$(node -p "const [a, b, c] = '${ext_old}'.split('.').map(Number); [a, b, c + 1].join('.')")"
  fi
  ask_yn "Also publish the VS Code extension (${EXT_ID} ${ext_old} -> ${ext_new})?" n && DO_EXT=true
  if $DO_EXT && [[ -z "$EXT_PLAN" ]]; then
    ADD_EXT_CHANGESET=true
    EXT_PLAN="${EXT_PACKAGE} ${ext_old} ${ext_new}"
  fi
  echo

  (( AHEAD > 0 )) && info "Your local main is ${AHEAD} commit(s) ahead of origin; they'll be pushed first."
  info "Near the end, npm asks you to approve each version with 2FA in the browser."
  echo
  ask_yn "Release?" n || { echo "Aborted."; exit 0; }
else
  # ----- Nothing pending: resume an interrupted release ----------------------
  # Staged versions that were never approved: look through the last few Release runs.
  PENDING_APPROVAL=""
  for run in $(gh run list --workflow release.yml --branch main --status success --limit 5 \
      --json databaseId -q '.[].databaseId' 2>/dev/null || true); do
    while read -r spec id; do
      [[ -z "$spec" ]] && continue
      grep -q "^${spec} " <<<"$PENDING_APPROVAL" && continue
      is_published "$spec" || PENDING_APPROVAL+="${spec} ${id}"$'\n'
    done <<<"$(staged_from_run "$run")"
  done
  # An extension version committed on main but not yet on the Marketplace.
  EXT_LOCAL="$(pkg_field "$EXT_DIR" version)"
  EXT_PUBLISHED="$(marketplace_version)"

  if [[ -z "$PENDING_APPROVAL" && "$EXT_LOCAL" == "$EXT_PUBLISHED" ]]; then
    info "Nothing to release: no pending changesets, no staged versions waiting for approval,"
    info "and ${EXT_ID} ${EXT_LOCAL} is already on the Marketplace."
    info "Add a changeset for your change with 'pnpm changeset', commit it, then run this again."
    exit 0
  fi
  if [[ -n "$PENDING_APPROVAL" ]]; then
    echo "Staged on npm but not yet approved:"
    while read -r spec _; do [[ -n "$spec" ]] && echo "  - ${spec}"; done <<<"$PENDING_APPROVAL"
    echo
    ask_yn "Approve and publish them now?" y && STAGED="$PENDING_APPROVAL"
  fi
  if [[ "$EXT_LOCAL" != "$EXT_PUBLISHED" ]]; then
    ask_yn "Publish the VS Code extension ${EXT_ID} ${EXT_LOCAL} (Marketplace has ${EXT_PUBLISHED:-none})?" n && DO_EXT=true
  fi
  [[ -n "$STAGED" ]] || $DO_EXT || { echo "Nothing selected."; exit 0; }
fi

# Log in to everything now, while someone is at the keyboard.
echo
if [[ -n "$NPM_PLAN" || -n "$STAGED" ]]; then
  if NPM_USER="$(npm whoami --registry "$REGISTRY" 2>/dev/null)"; then
    info "npm user: ${NPM_USER}"
  elif $DRY_RUN; then
    warn "Not logged in to npm (a real release would run 'npm login' here)."
  else
    info "Logging in to npm (approving staged versions needs it)..."
    npm login --registry "$REGISTRY"
  fi
fi
$DO_EXT && ensure_vsce_login

echo
info "That's everything — the rest runs on its own until the 2FA approvals, and stops if CI fails."

if [[ -n "$NPM_PLAN" ]]; then
  # -------------------------------------------------------------------------
  # 3. Add the extension's changeset, push main and wait for CI
  # -------------------------------------------------------------------------

  if $ADD_EXT_CHANGESET; then
    bundles="$(for d in packages/plugin-*; do
      name="$(pkg_field "$d" name)"
      new="$(awk -v n="$name" '$1 == n { print $3 }' <<<"$NPM_PLAN")"
      printf '%s %s, ' "$name" "${new:-$(pkg_field "$d" version)}"
    done)"
    changeset=".changeset/vscode-extension-${ext_new}.md"
    echo
    info "Adding ${changeset} for the extension..."
    if $DRY_RUN; then
      printf '\033[35m[dry run]\033[0m would create %s and commit it\n' "$changeset"
    else
      printf -- '---\n"%s": patch\n---\n\nBundles %s.\n' "$EXT_PACKAGE" "${bundles%, }" >"$changeset"
      git add "$changeset"
      git commit --quiet -m "chore: add changeset for VS Code extension ${ext_new}"
      HEAD_SHA="$(git rev-parse HEAD)"
      AHEAD=$((AHEAD + 1))
    fi
  fi

  if (( AHEAD > 0 )); then
    echo
    info "Pushing main..."
    act git push origin main
    if $DRY_RUN; then
      warn "Dry run: stopping here, since nothing was pushed for CI to test."
      exit 0
    fi
  fi

  echo
  wait_for_run ci.yml "$HEAD_SHA" "CI (tests)"
  wait_for_run release.yml "$HEAD_SHA" "the Release run (refreshes the Version Packages PR)"

  # -------------------------------------------------------------------------
  # 4. Check and merge the Version Packages PR
  # -------------------------------------------------------------------------

  PR="$(gh pr list --head "$VERSION_BRANCH" --state open --json number -q '.[0].number' 2>/dev/null || true)"
  [[ -n "$PR" ]] || die "No open Version Packages PR (branch ${VERSION_BRANCH}). Check the Release run's log."

  # The PR must bump exactly what was shown above — anything else means main moved
  # or someone edited the PR since the plan was made.
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
  EXPECTED="$NPM_PLAN"
  $DO_EXT && ! $DRY_RUN && EXPECTED+=$'\n'"$EXT_PLAN"
  while read -r name _ new; do
    [[ -z "$name" ]] && continue
    dir="$(pkg_dir "$name")" || die "No workspace package named ${name}."
    pr_version="$(gh api "repos/${REPO}/contents/${dir}/package.json?ref=${VERSION_BRANCH}" -q .content | base64 --decode \
      | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s).version))')"
    [[ "$pr_version" == "$new" ]] \
      || die "Version Packages PR #${PR} has ${name} ${pr_version}, but the plan was ${new}. Re-run this script."
  done <<<"$EXPECTED"
  info "Version Packages PR #${PR} matches the plan."

  echo
  info "Merging PR #${PR}..."
  act gh pr merge "$PR" --merge
  if $DRY_RUN; then
    warn "Dry run: stopping here — nothing was merged, so nothing gets staged."
    $DO_EXT && publish_extension
    exit 0
  fi
  MERGE_SHA="$(gh pr view "$PR" --json mergeCommit -q .mergeCommit.oid)"

  # -------------------------------------------------------------------------
  # 5. Wait for the Release run that stages the new versions on npm
  # -------------------------------------------------------------------------

  echo
  wait_for_run release.yml "$MERGE_SHA" "the Release run (stages the new versions on npm)"
  STAGED="$(staged_from_run "$RUN_ID")"
  [[ -n "$STAGED" ]] || die "The Release run staged nothing — check its log: $(gh run view "$RUN_ID" --json url -q .url)"
  while read -r name _ new; do
    grep -q "^${name}@${new} " <<<"$STAGED" \
      || die "${name}@${new} wasn't staged — check the Release run's log: $(gh run view "$RUN_ID" --json url -q .url)"
  done <<<"$NPM_PLAN"
fi

# ---------------------------------------------------------------------------
# 6. Approve each staged version (2FA), then check it's live
# ---------------------------------------------------------------------------

if [[ -n "$STAGED" ]]; then
  echo
  bold "Approve each version — npm opens a browser tab for 2FA:"
  while read -r spec id; do
    [[ -z "$spec" ]] && continue
    echo
    info "Approving ${spec}..."
    act npm stage approve "$id" --registry "$REGISTRY" </dev/tty
  done <<<"$STAGED"

  if ! $DRY_RUN; then
    echo
    info "Checking the new versions are live on npm..."
    while read -r spec _; do
      [[ -z "$spec" ]] && continue
      for _ in $(seq 1 30); do is_published "$spec" && break; sleep 2; done
      if is_published "$spec"; then info "  ${spec} ✓"; else warn "  ${spec} isn't visible on npm yet — check https://www.npmjs.com/package/${spec%@*}"; fi
    done <<<"$STAGED"
  fi
fi

if ! $DRY_RUN; then
  git pull --quiet --ff-only origin main && info "Local main is up to date."
fi

# ---------------------------------------------------------------------------
# 7. Build and publish the VS Code extension
# ---------------------------------------------------------------------------

$DO_EXT && publish_extension

echo
bold "Done."
