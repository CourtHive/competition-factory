# F-018 · An invalid participant creates the participant list

**Verified.** A newly created tournament has no participant list. The first invalid participant submission initializes the list before rejecting the missing participant type.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal                        | Source test                                               |
| ------------------------------ | --------------------------------------------------------- |
| `ERR_INVALID_PARTICIPANT_TYPE` | `src/tests/mutations/participants/addParticipant.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-018/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
