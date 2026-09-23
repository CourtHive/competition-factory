import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INCOMPATIBLE_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { IN_PROGRESS, COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * `checkCompletedRevertGuard` judges an EXISTING result under the format that result was RECORDED
 * under — never under a format arriving on the same call.
 *
 * The guard refuses to revert a COMPLETED matchUp carrying a *validated winning score* to a live
 * status (IN_PROGRESS / SUSPENDED) when no replacement outcome is supplied, because that would
 * silently strip the result and un-advance the draw. Whether the stored score IS a validated
 * winning outcome is a question about a matchUpFormat — and which one it asks about is the subject
 * of this file.
 *
 * ## Why this needed pinning
 *
 * Until #4964, `setMatchUpStatus` WROTE an incoming `matchUpFormat` onto the matchUp before
 * delegating to `setMatchUpState`. So by the time this guard read `matchUp.matchUpFormat`, it was
 * already the incoming one — the guard asked "is the stored score decisive under the format the
 * CALLER just sent?" That was never intended; it was a side effect of the write ordering.
 *
 * #4964 removed that write, so the guard now reads the genuinely stored format. **That is a
 * behaviour change, and nothing in a 13469-test suite pinned either side of it** — which is why CA
 * asked for these. Sibling precedence, deliberately opposite, is pinned in
 * `rejectedOutcomeKeepsMatchUpFormat.test.ts`: the two guards that analyze the INCOMING score
 * (`validateScore`, `checkImpliedCompletionGuard`) DO prefer the incoming format.
 */

const STORED_FORMAT = 'SET3-S:6/TB7'; // best of 3 — the draw default
const LONGER_FORMAT = 'SET5-S:6/TB7'; // best of 5 — two sets is NOT decisive under this

/** A completed matchUp carrying a validated two-set win, recorded under the draw's own format. */
function completedScenario() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 8, outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 }] },
    ],
    setState: true,
  });
  const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
  const matchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);

  const current = () =>
    tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUp.matchUpId);

  return { drawId, matchUpId: matchUp.matchUpId, current };
}

it('refuses to revert a validated COMPLETED result to a live status', () => {
  const { drawId, matchUpId, current } = completedScenario();
  expect(current()?.matchUpStatus).toEqual(COMPLETED);

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: IN_PROGRESS },
    matchUpId,
    drawId,
  });

  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  expect(current()?.matchUpStatus).toEqual(COMPLETED);
  expect(current()?.winningSide).toEqual(1);
});

/**
 * THE DISCRIMINATING CASE — this is the one that fails under the pre-#4964 ordering.
 *
 * The stored `6-1 6-1` is decisive under the STORED best-of-3 and NOT decisive under the incoming
 * best-of-5. So:
 *   - reading the STORED format (current, correct): a validated outcome -> REFUSE.
 *   - reading the INCOMING format (what the removed write caused): not a validated outcome ->
 *     guard stands down -> the revert is ALLOWED and a recorded result is stripped.
 *
 * A caller could therefore have erased a completed result by attaching a longer matchUpFormat to
 * the same request.
 */
it('judges the stored result under the STORED format, not one arriving on the same call', () => {
  const { drawId, matchUpId, current } = completedScenario();

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: IN_PROGRESS },
    matchUpFormat: LONGER_FORMAT,
    matchUpId,
    drawId,
  });

  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);

  // the result survives ...
  expect(current()?.matchUpStatus).toEqual(COMPLETED);
  expect(current()?.winningSide).toEqual(1);
  // ... and so does its format: a refused call writes nothing at all (#4964)
  expect(current()?.matchUpFormat).toEqual(STORED_FORMAT);
});

/**
 * The guard's own escape hatch must keep working — it refuses a BARE revert, not a correction.
 * Without this, "refuses everything" would pass the two tests above.
 */
it('allows the revert when a replacement outcome is supplied', () => {
  const { drawId, matchUpId, current } = completedScenario();

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: {
      matchUpStatus: IN_PROGRESS,
      score: { sets: [{ side1Score: 4, side2Score: 3, setNumber: 1 }] },
    },
    matchUpId,
    drawId,
  });

  expect(result.error).toBeUndefined();
  expect(current()?.matchUpStatus).toEqual(IN_PROGRESS);
});
