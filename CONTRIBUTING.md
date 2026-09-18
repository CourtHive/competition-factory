# Contributing to tods-competition-factory

Thanks for wanting to improve the Competition Factory. This is an MIT-licensed public repository:
**you do not need write access to contribute.** Fork it, push a branch to your fork, and open a pull
request. There is no CLA to sign.

Small, focused fixes are welcome and are the easiest kind of PR to review. If you are planning
something larger — a new draw type, a change to an engine's public surface, a new policy — please
open an issue first so the design can be agreed before you spend time on it.

## The short version

```bash
gh repo fork CourtHive/competition-factory --clone   # or fork in the UI and clone your fork
cd competition-factory
corepack enable                                      # provides the pinned pnpm
pnpm install
git checkout -b fix/short-description origin/dev     # branch off dev, NOT master
# …make your change, add a test…
pnpm check-types && pnpm lint && pnpm format && pnpm test --run
git commit -m "fix: describe the fix, not the file"
git push -u origin fix/short-description
gh pr create --base dev                              # PR against dev
```

Two things trip up first-time contributors, and neither is guessable from the outside: **PRs target
`dev`**, and **the PR title must be a conventional-commit subject**. Both are explained below.

## Branch off `dev`, not `master`

`dev` is this repository's integration branch. `master` advances only at checkpoints, when `dev` is
merged into it, and a release exists only when the `chore: release X.Y.Z` PR that release-please
maintains against `master` is merged.

So: **branch from `origin/dev` and open your PR against `dev`.** A PR aimed at `master` is not lost
— it will just be asked to retarget.

The full verification gate runs on every PR regardless of base branch, so you get the same CI signal
either way.

## Commit messages and PR titles

This repository releases with [release-please](https://github.com/googleapis/release-please), which
reads [conventional commits](https://www.conventionalcommits.org/) to decide the next version and
build the changelog. Use a type prefix on the subject:

| Prefix                         | Use for            | Release effect |
| ------------------------------ | ------------------ | -------------- |
| `fix:`                         | a bug fix          | patch          |
| `feat:`                        | new functionality  | minor          |
| `docs:`                        | documentation only | none           |
| `test:`                        | tests only         | none           |
| `refactor:`, `chore:`, `perf:` | everything else    | none           |

PRs are commonly squash-merged with **the PR title as the commit subject**, so give the PR itself a
conventional-commit title — not just the individual commits.

A breaking change additionally needs a `BREAKING CHANGE:` footer _and_ an entry in the migration
guide (see below).

Please do not add AI attribution trailers (`Co-Authored-By: Claude`, "Generated with…") to commits or
source files.

## Local development

Requirements: **Node >= 22** and **pnpm**, which `corepack enable` provides at the version pinned in
`package.json`. **Never run `npm install`** — it corrupts the pnpm-managed store and rewrites the
lockfile.

```bash
pnpm install
pnpm build          # rollup + esbuild → dist/
pnpm start          # rollup watch mode
pnpm test           # vitest, watch mode
pnpm test --run     # single run
pnpm tui            # vitest interactive UI
pnpm check-types    # tsc --noEmit
pnpm lint           # eslint, zero warnings tolerated
pnpm lint:fix       # eslint with auto-fix
pnpm format         # prettier --write over the formatted target set
pnpm coverage       # coverage report (thresholds 95/95/85/95)
```

Before pushing, this is usually enough:

```bash
pnpm check-types && pnpm lint && pnpm format && pnpm test --run
```

To reproduce the whole CI gate locally — slower, but it is exactly what the PR must pass:

```bash
pnpm verify
```

(`pnpm verify:all` adds an ecosystem sweep against sibling CourtHive checkouts. It is a maintainer
tool and is not run in CI; you do not need it.)

A Husky pre-commit hook runs `lint-staged` plus a type check, so staged files are linted and
formatted on commit.

## Tests

The suite is large (13,000+ tests) and a PR that changes behaviour is expected to carry a test.

- Unit tests live **beside the code** as `*.test.ts`.
- Broader integration and scenario suites live under `src/tests/`, organized by area.
- `mocksEngine` is the house way to build tournament state for a test — `mocksEngine.generateTournamentRecord({ ..., setState: true })` — rather than hand-assembling records.
- Where a test reassigns a result across successive engine calls, the house pattern is
  `let result: any = …` (`prefer-const` is off to permit it). Where a test calls once and never
  reassigns, `const` is correct — the pattern is not a blanket rule.
- Coverage thresholds are enforced at **95% statements / 95% branches / 85% functions / 95% lines**.
  Never lower a threshold to make a run pass; add the missing test instead.

Run a single file with `pnpm test --run path/to/file.test.ts`.

## What CI checks

`verify.yml` runs on every pull request (Node 24; pushes to `master` additionally run Node 22). Most
steps are the ordinary ones — types, lint, format, tests, coverage, build. These are the few that
surprise people:

- **`verify:generated`** — several enum, engine-method and request-shape files are generated from
  source. If you hand-edit one side, this fails with the `pnpm gen:…` command to run. Run it and
  commit the result.
- **`verify:format`** — Prettier is checked over `src/**` _and_ `documentation/docs/**`. Running
  `pnpm format` fixes it.
- **`verify:migration-coverage`** — any commit carrying a breaking change must have its PR number
  present in `documentation/docs/migration-<next major>.0.0.md`. The guide is hand-maintained and is
  the authoritative list of breaking changes.
- **`verify:docs-imports` / `verify:docs-methods`** — every import and every engine method shown in
  the documentation must resolve and exist against the built package. If you rename something public,
  the docs have to move with it.
- **`verify:surface`**, **`verify:shakeable`**, **`verify:bundle-size`** — the published API surface,
  tree-shakeability and bundle size are all pinned. An unintended export or a new runtime dependency
  will show up here.

The package has **zero runtime dependencies**, deliberately — it is a supply-chain guarantee to
everyone who installs it. A PR that adds one will be declined unless there is no alternative.

If this is your first contribution to the repository, GitHub may hold the workflow run until a
maintainer approves it. That is normal; the run will start once approved.

## Documentation

Prose documentation is a Docusaurus site under `documentation/`, which is **its own pnpm install
root** — a root `pnpm install` does not install it.

```bash
cd documentation
pnpm install
pnpm start          # local docs server on :3030
```

`docs.yml` builds the site on PRs that touch `documentation/`, with broken links treated as errors.

## Code style

- **TypeScript strict mode** is on.
- **Zero lint warnings** — `pnpm lint` runs with `--max-warnings 0`.
- **Cognitive complexity** is capped at 30 (`sonarjs/cognitive-complexity`).
- Prefer `globalThis` over `window`; always pass an explicit comparator to `.sort()`.
- Match the conventions of the file you are editing.

## Reporting a bug without a PR

Open an issue with a minimal reproduction — ideally a `mocksEngine` snippet that produces the
tournament state, and the engine call that returns the wrong result. A reproduction in that form can
usually be turned straight into a regression test.

## Security

Please do not open a public issue for a suspected vulnerability. Email
[charles@courthive.com](mailto:charles@courthive.com) instead.

---

By contributing, you agree that your contributions are licensed under the repository's
[MIT license](./LICENSE).
