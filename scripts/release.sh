#!/usr/bin/env bash
# Interactive release script for prettier-plugin-tsql and prettier-plugin-postgresql.
#
# Releasing through Changesets is several steps that are easy to get out of order
# or forget: push main, wait for CI, wait for the Release workflow to refresh the
# "Version Packages" PR, merge it, wait for the next Release run to stage the new
# versions on npm, then approve each staged version with 2FA. This script does all
# of it:
#
#   - checks first: clean main, gh and npm logged in;
#   - one question, up front: shows what would ship (package, old -> new version,
#     and each changeset's summary) and asks to proceed;
#   - then runs unattended: push main if needed, wait for CI's tests, wait for the
#     Version Packages PR, check its versions match the plan, merge it, wait for
#     the Release run that stages the versions on npm;
#   - and ends with the one step that can't be automated by design: approving each
#     staged version (npm opens a browser tab for 2FA), then checks the versions
#     are live and fast-forwards your local main.
#
# Run it again after an interruption: it picks up where things stand (an open
# Version Packages PR, or staged versions still waiting for approval).
#
# Run this yourself in your own terminal, not through an AI coding agent: it pushes
# main, merges a PR and publishes to npm, and the approvals need your 2FA.
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
    -h|--help) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'Unknown option: %s (try --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

VERSION_BRANCH="changeset-release/main"
REGISTRY="https://registry.npmjs.org"

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

# Runs a command that changes something (push, merge, approve) — or, with --dry-run,
# just says what it would have run.
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

# Waits for workflow $1's run on commit $2 to finish and succeed. Watches the run
# while it's in progress; dies if it fails or never starts.
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

# The published (non-private) workspace packages' names.
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

# ---------------------------------------------------------------------------
# 1. Preconditions
# ---------------------------------------------------------------------------

bold "prettier-sql release"
$DRY_RUN && warn "Dry run: nothing will be pushed, merged or published."
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

if ! NPM_USER="$(npm whoami --registry "$REGISTRY" 2>/dev/null)"; then
  info "Not logged in to npm — logging in now (approving staged versions needs it)..."
  if $DRY_RUN; then
    warn "Skipping npm login in a dry run."
  else
    npm login --registry "$REGISTRY"
    NPM_USER="$(npm whoami --registry "$REGISTRY")"
  fi
fi
[[ -n "${NPM_USER:-}" ]] && info "npm user: ${NPM_USER}"

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
# 2. Work out what would ship, and ask — the only question
# ---------------------------------------------------------------------------

PLAN_JSON="$(mktemp)"
trap 'rm -f "$PLAN_JSON"' EXIT
pnpm --silent changeset status --output="$PLAN_JSON" >/dev/null 2>&1 || true
PUBLISHABLE="$(publishable_packages | tr '\n' ' ')"

# "name old new" per package that has a version bump and is published
PLAN="$(node -e '
  const fs = require("fs");
  const [file, publishable] = process.argv.slice(1);
  const names = new Set(publishable.trim().split(/\s+/));
  let status = {};
  try { status = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  for (const r of status.releases ?? [])
    if (r.type !== "none" && names.has(r.name)) console.log(`${r.name} ${r.oldVersion} ${r.newVersion}`);
' "$PLAN_JSON" "$PUBLISHABLE")"

if [[ -z "$PLAN" ]]; then
  # Nothing pending. Maybe a previous run staged versions that were never approved:
  # look through the last few Release runs for staged versions not yet on npm.
  PENDING_APPROVAL=""
  for run in $(gh run list --workflow release.yml --branch main --status success --limit 5 \
      --json databaseId -q '.[].databaseId' 2>/dev/null || true); do
    while read -r spec id; do
      [[ -z "$spec" ]] && continue
      grep -q "^${spec} " <<<"$PENDING_APPROVAL" && continue
      is_published "$spec" || PENDING_APPROVAL+="${spec} ${id}"$'\n'
    done <<<"$(staged_from_run "$run")"
  done
  if [[ -z "$PENDING_APPROVAL" ]]; then
    info "Nothing to release: no pending changesets and no staged versions waiting for approval."
    info "Add a changeset for your change with 'pnpm changeset', commit it, then run this again."
    exit 0
  fi
  echo "Staged on npm but not yet approved:"
  while read -r spec _; do [[ -n "$spec" ]] && echo "  - ${spec}"; done <<<"$PENDING_APPROVAL"
  echo
  ask_yn "Approve and publish them now?" n || { echo "Aborted."; exit 0; }
  STAGED="$PENDING_APPROVAL"
else
  echo "Will release:"
  while read -r name old new; do
    printf '  - %-28s %s -> \033[1m%s\033[0m\n' "$name" "$old" "$new"
  done <<<"$PLAN"
  echo
  echo "Changesets (full text in the Version Packages PR):"
  node -e '
    const status = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const cs of status.changesets ?? []) console.log(`  * ${cs.summary.trim().split("\n")[0].replace(/^- /, "")}`);
  ' "$PLAN_JSON"
  echo
  (( AHEAD > 0 )) && info "Your local main is ${AHEAD} commit(s) ahead of origin; they'll be pushed first."
  info "At the end, npm asks you to approve each version with 2FA in the browser."
  echo
  ask_yn "Release?" n || { echo "Aborted."; exit 0; }
  echo
  info "The rest runs on its own until the 2FA approvals, and stops if CI fails."

  # -------------------------------------------------------------------------
  # 3. Push main and wait for CI
  # -------------------------------------------------------------------------

  if (( AHEAD > 0 )); then
    echo
    info "Pushing main..."
    act git push origin main
  fi

  if $DRY_RUN && (( AHEAD > 0 )); then
    warn "Dry run: stopping here, since the commits above were not pushed for CI to test."
    exit 0
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
  while read -r name _ new; do
    dir="$(grep -l "\"name\": \"${name}\"" packages/*/package.json | head -1)"
    pr_version="$(gh api "repos/${REPO}/contents/${dir}?ref=${VERSION_BRANCH}" -q .content | base64 --decode \
      | node -e 'let s=""; process.stdin.on("data", d => s += d).on("end", () => console.log(JSON.parse(s).version))')"
    [[ "$pr_version" == "$new" ]] \
      || die "Version Packages PR #${PR} has ${name} ${pr_version}, but the plan was ${new}. Re-run this script."
  done <<<"$PLAN"
  info "Version Packages PR #${PR} matches the plan."

  echo
  info "Merging PR #${PR}..."
  act gh pr merge "$PR" --merge
  if $DRY_RUN; then
    warn "Dry run: stopping here — nothing was merged, so nothing gets staged."
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
  done <<<"$PLAN"
fi

# ---------------------------------------------------------------------------
# 6. Approve each staged version (2FA), then check it's live
# ---------------------------------------------------------------------------

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
    is_published "$spec" && info "  ${spec} ✓" || warn "  ${spec} isn't visible on npm yet — check https://www.npmjs.com/package/${spec%@*}"
  done <<<"$STAGED"

  git pull --quiet --ff-only origin main && info "Local main updated."
fi

echo
bold "Done."
