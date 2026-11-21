# F-008 · A refused bulk outcome leaves an earlier winner

**Verified.** The first outcome succeeds. A later round has no participants and refuses its winner. The single bulk API call leaves the first result in the draw. The source test explicitly asserts that prefix with rollback off.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal                      | Source test                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| `ERR_INVALID_MATCHUP_STATUS` | `src/tests/mutations/events/bulkMatchUpStatusUpdateRefusals.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-008/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
