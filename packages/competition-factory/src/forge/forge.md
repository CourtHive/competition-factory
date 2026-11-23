# The Forge

The Forge holds the developer-facing facades layered over the engines: `dryRun`, `explain`, `unwrap` / `unwrapOr`, `generatePatch`, the query (`engine.q`) and build (`engine.build`) facades, `inspect`, and the typed event bus (`on` / `once` / `off` / `waitFor`). It is production code: these are exported from the package root (`src/index.ts`) and attached to every engine by `engineStart`.

## Request scope of q, build and inspect

On the synchronous engine, `q` calls the corresponding engine query when invoked. A successful query exposes the underlying payload with its existing copy semantics. Array-valued fallbacks for missing or failed queries come from the shared query registry. Treat those fallbacks as read-only. A caller that mutates one can change what later callers receive for that query, even in another request scope. Builders keep draft data on each builder instance. `toRequest()` and `toDirectives()` prepare commands, and `create()` runs the engine's execution queue against the state active at that call.

The typed async engine exposes `inspect()` synchronously. Use its awaited governor methods and `executionQueue` for queries and writes. The synchronous `q` and `build` facades assume an immediate result envelope and are omitted from the typed async interface.

With the example async provider installed, scope each request with `runWithInstanceState`. Record IDs, counts and provider subscriptions in `inspect()` come from the active scope. The inspection also reports process-wide schema and audit settings, global subscription topic names and the current diagnostic configuration. An object-valued `devContext` refers to that configuration and should be treated as read-only.

Two paired Button runs tested allocating a fresh empty array on a missing query after choosing the fallback policy at facade creation. When callers retained the returned arrays, the change added 4.4 ns and 0.6 ns per call in the two runs. The existing fallback behavior is retained for this qualification.

The overlapping-request regression uses two scoped records, stages separate builders before yielding, commits both requests and checks each caller's query results, inspection counts and visible topics. [Request isolation tests](./helpersContext.test.ts)
