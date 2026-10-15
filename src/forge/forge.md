# The Forge

The Forge holds the developer-facing facades layered over the engines: `dryRun`, `explain`, `unwrap` / `unwrapOr`, `generatePatch`, the query (`engine.q`) and build (`engine.build`) facades, `inspect`, and the typed event bus (`on` / `once` / `off` / `waitFor`). It is production code: these are exported from the package root (`src/index.ts`) and attached to every engine by `engineStart`.
