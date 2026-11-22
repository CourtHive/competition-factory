# F-011 · An invalid round stays in its scheduling profile

**Verified.** The writer appends a round to a stored venue before the profile validator rejects its draw reference. The rejected round remains in the profile.

Each input is a single public method call on a captured pre-call record. On the F-007 candidate based on factory dev `c4a629c135`, all three pipeline modes returned the listed refusal, with the full stored record changed for direct calls and rollback-off queues. Each rollback-on control restored the record. The compressed fixtures include the exact directive, refusal, changed JSON paths and pre-call record.

| Refusal              | Source test                                                       |
| -------------------- | ----------------------------------------------------------------- |
| `ERR_INVALID_VALUES` | `src/tests/mutations/scheduling/updatedSchedulingProfile.test.ts` |

Run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-011/vitest.config.mts`. The unchanged-record assertion fails with rollback off until the writer is hardened. This is an evidence PR for controlling-agent review.
