# F-016 · A refused BYE placement changes the draw

**Verified.** A hand-built draw repeats a first-round match ID in round two. BYE advancement detects the invalid forward link after modifying the stored draw.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal                                                                                                                                                                | Source test                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ERR_INVALID_MATCHUP: advancing from f621a7ae-3a51-4576-adbc-25af3cb3f298 (round 1) resolves to round 1 of the same structure; the record's matchUpIds are not unique` | `src/tests/mutations/drawDefinitions/positionGovernor/nonForwardAdvanceRefused.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-016/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
