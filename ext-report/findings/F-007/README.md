# F-007 · A refused scheduling call leaves a start time

**VERIFIED on factory dev `d6ab459200`.** A director submits a start of 09:00 and a resume of 08:00 in one `addMatchUpScheduleItems` directive. The engine returns `ERR_INVALID_RESUME_TIME`. With rollback off, the record gains a `SCHEDULE.TIME.START` item of 09:00. With rollback on, the complete record remains identical. All three outcome modes give these results.

The post-#6489 harvest contains two one-step scenarios from `src/tests/mutations/scheduling/scheduleMatchUps.test.ts`, “can schedule many attributes at once”, in the native and legacy source configurations. Each captured a successful patch adding the start time alongside the error. The executable reduction creates two entrants, one match and no prior schedule. It uses the real engine and a fixed clock. Each rollback control starts with a fresh tournament.

Run the following from the factory root. Three rollback-off cases fail the unchanged-record assertion. Three rollback-on controls pass.

```sh
TZ=UTC pnpm exec vitest run --config ext-report/findings/F-007/vitest.config.mts
```

**For review.** The schedule setter can leave a start time visible to a direct integrator even though the submitted schedule was rejected. This call is independent of the TEAM correction and the outcome selector. Recommend a separate scheduling hardening change that validates the complete schedule before applying its first time item. The general refusal invariant should continue to surface the defect until fixed.
