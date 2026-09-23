import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CANNOT_CHANGE_WINNING_SIDE, INVALID_TIME } from '@Constants/errorConditionConstants';

/**
 * A REFUSED `setMatchUpStatus` must not leave the `schedule` it was given.
 *
 * `setMatchUpStatus` accepts a `schedule` alongside an outcome, and `resolveAndApplyOutcome` applied
 * it at the TOP — above the branch that can refuse. Measured on `dev` 2026-09-23: a winningSide
 * change refused with `ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE` (stack
 * `winningSideWithDownstreamDependencies`) still wrote `scheduledDate`, `scheduledTime`,
 * `isoDateString` and `courtOrder`, and kept them.
 *
 * Moving the apply below the dispatch would not have been enough on its own: `applyScheduleTiming`
 * and `applyScheduleAssignments` interleave validate-and-write per attribute, so a malformed value
 * would then have errored over an outcome that had already landed — the same defect, inverted.
 * Hence `validateOnly`, and hence the third test here, which is the one that would catch a
 * regression to the naive fix.
 *
 * The malformed value is `'25:99'` rather than something obviously junk: `validTimeValue` is
 * permissive enough that `'not-a-time'` is ACCEPTED (measured — it returns true), so a test built on
 * that string asserts nothing. An out-of-range clock time is what it actually refuses.
 *
 * The exit-propagation harness could not catch any of this: `observeMutation` passes only
 * `{ propagateExitStatus, matchUpId, drawId, outcome }`, so `schedule` is never sampled.
 */

function scenario() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        outcomes: [
          { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
          { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-1', winningSide: 1 },
          { roundNumber: 2, roundPosition: 1, scoreString: '6-2 6-2', winningSide: 1 },
        ],
      },
    ],
    setState: true,
  });
  const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
  // R1P1 has an active downstream result, so a winningSide change is refused
  const matchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);

  const scheduleOf = () =>
    tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUp.matchUpId)?.schedule ??
    {};

  return { drawId, matchUpId: matchUp.matchUpId, scheduleOf };
}

// two sets — the draw's default format is best-of-3, so one set is not a decisive outcome
const WINNING_SETS = [
  { side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 },
  { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 2 },
];

const LOSING_OUTCOME = {
  winningSide: 2,
  score: {
    sets: [
      { side1Score: 1, side2Score: 6, winningSide: 2, setNumber: 1 },
      { side1Score: 2, side2Score: 6, winningSide: 2, setNumber: 2 },
    ],
  },
};

it('leaves the schedule untouched when the outcome is refused', () => {
  const { drawId, matchUpId, scheduleOf } = scenario();
  expect(scheduleOf().scheduledTime).toBeUndefined();

  const result: any = tournamentEngine.setMatchUpStatus({
    schedule: { scheduledTime: '2026-09-23T08:00', courtOrder: 3 },
    outcome: LOSING_OUTCOME,
    matchUpId,
    drawId,
  });

  expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);

  const after = scheduleOf();
  expect(after.scheduledTime).toBeUndefined();
  expect(after.scheduledDate).toBeUndefined();
  expect(after.courtOrder).toBeUndefined();
});

it('still applies the schedule when the outcome is accepted', () => {
  const { drawId, matchUpId, scheduleOf } = scenario();

  const result: any = tournamentEngine.setMatchUpStatus({
    schedule: { scheduledTime: '2026-09-23T08:00', courtOrder: 3 },
    outcome: { winningSide: 1, score: { sets: WINNING_SETS } },
    matchUpId,
    drawId,
  });

  expect(result.error).toBeUndefined();
  const after = scheduleOf();
  expect(after.scheduledTime).toEqual('2026-09-23T08:00');
  expect(after.courtOrder).toEqual(3);
});

/**
 * The regression guard for the NAIVE fix. Move the apply below the dispatch without a pure
 * validation pass and this is what breaks: the outcome lands, then the malformed time errors —
 * an error returned over a draw the same call just changed.
 */
it('refuses a malformed schedule without applying the outcome it accompanied', () => {
  const { drawId, matchUpId, scheduleOf } = scenario();

  const result: any = tournamentEngine.setMatchUpStatus({
    schedule: { scheduledTime: '25:99' },
    // an outcome that WOULD be accepted on its own
    outcome: { winningSide: 1, score: { sets: WINNING_SETS } },
    matchUpId,
    drawId,
  });

  expect(result.error).toEqual(INVALID_TIME);
  expect(scheduleOf().scheduledTime).toBeUndefined();

  // the outcome must not have landed either — the existing result is untouched
  const matchUp: any = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUpId);
  expect(matchUp.score?.scoreStringSide1).toEqual('6-1 6-1');
});
