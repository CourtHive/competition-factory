# F-014 · A rejected court edit changes the venue

**Verified.** The request changes venue attributes and submits courts that cannot be accepted. Invalid availability and deletion of a scheduled court both leave earlier venue edits behind.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal                  | Source test                                        |
| ------------------------ | -------------------------------------------------- |
| `ERR_SCHEDULED_MATCHUPS` | `src/tests/mutations/venues/courtDeletion.test.ts` |
| `ERR_INVALID_TIME`       | `src/tests/mutations/venues/modifyVenue.test.ts`   |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-014/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
