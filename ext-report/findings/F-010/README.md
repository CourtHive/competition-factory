# F-010 · A refused TEAM replacement modifies the line-up

**Verified.** The replacement writer can change a dual side or its line-up before rejecting the replacement participant, pair or substitution. The three inputs cover the shared individual, invalid pair and duplicate line-up cases.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal                             | Source test                                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `ERR_SHARED_INDIVIDUAL_PARTICIPANT` | `src/tests/mutations/participants/team/onePlayerOneTeam.test.ts` |
| `ERR_INVALID_PARTICIPANT_IDS`       | `src/tests/mutations/matchUps/tieMatchUpLineUpEdges.test.ts`     |
| `ERR_INVALID_VALUES`                | `src/tests/mutations/matchUps/tieMatchUpLineUpEdges.test.ts`     |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-010/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
