# F-015 · An invalid scale date creates participant time items

**Verified.** The player has no time-item array before a rating with an invalid calendar date is submitted. Validation returns the date error after creating the field.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal            | Source test                                               |
| ------------------ | --------------------------------------------------------- |
| `ERR_INVALID_DATE` | `src/tests/mutations/participants/dateValidation.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-015/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
