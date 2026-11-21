# F-012 · An invalid timing edit removes a category

**Verified.** With an existing timing override, a request supplies neither average nor recovery minutes. The writer filters the stored category list before returning its invalid-values error.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal              | Source test                                              |
| -------------------- | -------------------------------------------------------- |
| `ERR_INVALID_VALUES` | `src/tests/mutations/notifications/noticeBatchB.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-012/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
