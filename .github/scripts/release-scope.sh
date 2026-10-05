#!/usr/bin/env bash
# Release-path scope: is this PR on the release path, changing nothing but version files?
#
# Two PRs make up the release path, and neither carries code:
#   (a) release-please's PR into `master` (head `release-please--*`);
#   (b) the back-merge PR, `master` -> `dev`, which merges the release commit back after a publish
#       (factory/CLAUDE.md; CA, 2026-10-02).
# Both change only the files release-please writes. The tree under them was verified when it
# landed, so a version-only diff skips the heavy gates while every job still reports its check.
# Decided by the DIFF, not the branch name: either PR touching anything else gets the full run.
# Extends #5169(factory)'s Release-PR scope step to the back-merge; courthive-components #644 carries
# the same script. Only a PR from this repository qualifies: a fork's branch name proves nothing.
#
# Prints `light=true|false`, and appends it to $GITHUB_OUTPUT when that is set.
# Inputs (env): EVENT_NAME, HEAD_REF, BASE_REF, HEAD_REPO, REPO. The diff is FROM..TO, by default
# HEAD^1..HEAD: a pull_request checkout is the PR's merge commit, whose first parent is the base
# tip, so that diff is exactly what the PR brings in. The checkout needs `fetch-depth: 2` or more.
#
# Test against history (a release commit is light, a code commit is not):
#   EVENT_NAME=pull_request HEAD_REF=release-please--x BASE_REF=master HEAD_REPO=r REPO=r \
#     FROM=<sha>^ TO=<sha> bash .github/scripts/release-scope.sh
set -euo pipefail

RELEASE_BRANCH=master
# Exactly the files release-please writes in this repo; scripts/verify/verified-release.mjs checks the
# release commit against the same three.
VERSION_FILES=(package.json CHANGELOG.md .release-please-manifest.json)
# Of those, the package manifests, in which only the "version" line may change.
PACKAGE_JSONS=(package.json)

FROM=${FROM:-HEAD^1}
TO=${TO:-HEAD}
LIGHT=false

release_path=false
if [ "${EVENT_NAME:-}" = pull_request ] && [ "${HEAD_REPO:-}" = "${REPO:-}" ]; then
  case "${HEAD_REF:-}" in
    release-please--*) [ "${BASE_REF:-}" = "$RELEASE_BRANCH" ] && release_path=true ;;
    "$RELEASE_BRANCH") [ "${BASE_REF:-}" = dev ] && release_path=true ;;
  esac
fi

if [ "$release_path" = true ]; then
  CHANGED=$(git diff --name-only "$FROM" "$TO")
  OUTSIDE=$(grep -vxF -f <(printf '%s\n' "${VERSION_FILES[@]}") <<<"$CHANGED" || true)
  NOT_VERSION=$(git diff -U0 "$FROM" "$TO" -- "${PACKAGE_JSONS[@]}" |
    grep -E '^[-+][^-+]' | grep -vE '^[-+][[:space:]]*"version":' || true)
  if [ -n "$CHANGED" ] && [ -z "$OUTSIDE" ] && [ -z "$NOT_VERSION" ]; then LIGHT=true; fi
  echo "release-path PR ${HEAD_REF} -> ${BASE_REF}; changed:"
  printf '  %s\n' $CHANGED
  [ -n "$OUTSIDE" ] && echo "outside the version files: $(echo $OUTSIDE)"
  [ -n "$NOT_VERSION" ] && echo "package.json changes beyond \"version\":" && echo "$NOT_VERSION"
fi

echo "light=$LIGHT"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "light=$LIGHT" >>"$GITHUB_OUTPUT"; fi
if [ "$LIGHT" = true ]; then
  echo "::notice::Release-path PR changing version files only: coverage shards, merge and slow gates skipped."
fi
