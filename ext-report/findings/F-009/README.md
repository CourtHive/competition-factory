# F-009 · A refused ad hoc reset clears an earlier match

**Verified.** A request names a valid scored match before an unknown match ID. The reset clears the first result before returning the missing-match error.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal                 | Source test                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `ERR_NOT_FOUND_MATCHUP` | `src/tests/mutations/outcome/resetAdHocSelectorEntry.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-009/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
