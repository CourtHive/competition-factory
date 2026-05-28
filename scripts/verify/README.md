# Factory verification suite

`pnpm verify` is the gate before every publish. It chains 12 checks that together cover compile, runtime, dist integrity, consumer impact, and security awareness. If any link in the chain fails, the suite exits non-zero and `prepublishOnly` blocks the release.

## What each check catches

| Step                 | Catches                                                                                                                                                                                                                                                                                                                    | Cost   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `verify:types`       | type errors anywhere in `src`                                                                                                                                                                                                                                                                                              | ~3 s   |
| `verify:lint`        | style + cognitive-complexity violations; zero-warnings rule                                                                                                                                                                                                                                                                | ~5 s   |
| `verify:coverage`    | regressions below `95/95/83/95` statements/functions/branches/lines                                                                                                                                                                                                                                                        | ~100 s |
| `verify:server`      | NestJS-style server tests (`pnpm test:server` alias for `jest`)                                                                                                                                                                                                                                                            | ~12 s  |
| `verify:shakeable`   | (NOT IN CHAIN) `agadoo` can't parse esbuild's minified output (acorn syntax error). The pre-existing `pnpm shakeable` script suffers the same — was pointed at a non-existent file so silently no-op'd. Leaving the script in place for manual runs; tree-shake validation needs a different tool. Tracked as a follow-up. | n/a    |
| `verify:audit`       | high or critical `pnpm audit` advisories                                                                                                                                                                                                                                                                                   | ~5 s   |
| `verify:build`       | the full prod build produces `dist/` (run after the above so a tiny lint/type fix re-runs the cheap stuff first)                                                                                                                                                                                                           | ~13 s  |
| `verify:runtime`     | "compiles but doesn't run" — CJS + ESM smoke against the built dist                                                                                                                                                                                                                                                        | ~3 s   |
| `verify:bundle-size` | a file in `dist/` grew beyond +10 % vs baseline                                                                                                                                                                                                                                                                            | ~1 s   |
| `verify:surface`     | a public export was removed (breaking) or signature drifted                                                                                                                                                                                                                                                                | ~1 s   |
| `verify:pack`        | the published `.d.ts` references an internal path that didn't get packed; runtime `require()` smoke after `npm install` of the tarball                                                                                                                                                                                     | ~30 s  |
| `verify:ecosystem`   | downstream consumer tests pass against the in-tree factory                                                                                                                                                                                                                                                                 | ~60 s  |

Total: ~4 minutes warm. The chain is ordered so cheap fail-fast checks run first.

## When to run

| Situation                                       | Command                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Quick sanity during a session                   | `pnpm check-types && pnpm lint`                                                              |
| Before a commit that touches the public surface | `pnpm verify:types && pnpm verify:surface && pnpm verify:pack`                               |
| Before publish (anything)                       | `pnpm verify` — happens automatically via `prepublishOnly`                                   |
| Investigating a regression                      | `pnpm verify:ecosystem --only=TMX,courthive-public` (single repo at a time)                  |
| Updating a baseline after intentional changes   | `pnpm verify:surface -- --update-baseline` or `pnpm verify:bundle-size -- --update-baseline` |

## Baselines

Two artifacts live under `scripts/verify/baseline/`:

- **`surface.txt`** — sorted list of every public export name. Surface drift is computed by set diff against this file. Regenerate after intentional surface changes with `pnpm verify:surface -- --update-baseline`.
- **`bundle-size.json`** — `{ rawBytes, gzipBytes }` per published file. Growth-budget is +10 % per file by default; override with `--budget=N` (decimal).

Both baselines are tracked in git so the budget travels with the code.

## Modes worth knowing

### `verify:surface` against npm

By default the baseline is the local `surface.txt`. To compare against a real published version:

```sh
node scripts/verify/surface.mjs --baseline=npm           # vs @latest
node scripts/verify/surface.mjs --baseline=npm@4.2.0     # vs a specific tag
```

This is the right mode for "did my upcoming release break a previously published surface?"

### `verify:ecosystem` filtering

```sh
node scripts/verify/ecosystem.mjs --only=TMX,courthive-public
node scripts/verify/ecosystem.mjs --skip=tidyScore
node scripts/verify/ecosystem.mjs --build-factory      # rebuild dist before sweeping
```

### `verify:pack` debugging

If a packaged-tarball failure isn't immediately reproducible:

```sh
VERIFY_PACK_KEEP=1 pnpm verify:pack
```

leaves the staged directory in `/tmp` so you can inspect what was actually installed + what `tsc` saw.

## CI

`.github/workflows/verify.yml` runs the full suite on every PR + push to main, across the Node version matrix declared in `package.json#engines.node`. Failures block merge; the surface and bundle-size baselines participate in the same diff so updates are reviewable.

## Adding a new check

1. Add a script at `scripts/verify/<name>.mjs`. Follow the convention: `[verify:<name>] ${msg}` for logs, exit 1 on failure with a clear "what to do" line.
2. Wire it into `package.json#scripts` as `verify:<name>` and append to the `verify` chain.
3. Document it in the table at the top of this file.
4. If it introduces a baseline file, save it under `scripts/verify/baseline/` and add a `--update-baseline` flag for intentional changes.
