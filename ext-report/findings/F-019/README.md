# F-019 · A ratings refusal advances the tournament timestamp

The public scale engine accepts caller-supplied match-ups for a participant ratings update. The existing ratings contract test supplies a singles result whose last side names a TEAM. Writing that rating returns `ERR_INVALID_SCALE_ITEM`. The writer restores participant time items. The engine still stamps the tournament on exit.

The complete rollback-off invariant detected the change at factory dev `c4a629c135` with the #6500 instrumentation. The factory stamp can compare equal if both calls read the same clock tick. For reproducibility the fixture retains its original factory stamp and the test provides a distinct fixed clock for the refused call. The pre-call mutation flag was clear. Six direct or one-item queue rollback-off controls changed only `/factory/timeStamp`. Three rollback-on queue controls restored the complete record. See [the nine observations](controls.json).

To reproduce on the reviewed engine, copy this directory into the factory checkout and run `TZ=UTC pnpm exec vitest run --config ext-report/findings/F-019/vitest.config.mts`. Expect three failures with rollback disabled and three passes with rollback enabled. The current product test checks that participants have no new ELO values. The standing invariant also checks the stored stamp.
