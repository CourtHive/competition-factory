# F-013 · A refused court deletion removes an earlier court

**Verified.** One public call names a real court followed by an unknown ID. The real court disappears before the error is returned. The existing suite expressly expects the earlier deletion, so changing this behavior also requires updating that compatibility test.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal               | Source test                                       |
| --------------------- | ------------------------------------------------- |
| `ERR_NOT_FOUND_COURT` | `src/tests/mutations/venues/deleteCourts.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-013/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
