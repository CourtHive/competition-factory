import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A double exit that was EARNED at a matchUp is ACTIVE downstream. One that was CARRIED there is not.
 *
 * `isActiveDownstream` decides whether the cascade may unwind around what lies below a matchUp, and
 * both of its activity tests open with `matchUp?.winningSide`:
 *
 *     (loserMatchUp?.winningSide && !loserMatchUpExit) ||
 *     (winnerMatchUp?.winningSide && winnerDrawPositionsCount === 2 && …)
 *
 * A `DOUBLE_WALKOVER` or `DOUBLE_DEFAULT` never carries a `winningSide` — neither side advances — so
 * no double exit could satisfy either test however real it was. It was invisible to the guard BY
 * CONSTRUCTION, and the cascade unwound around genuine results, refusing later and elsewhere after
 * it had already written state.
 *
 * TWO conditions separate a real result from a derived one, and the fix requires both:
 *
 *  1. **Two occupied sides.** A double exit with one occupant or none is the PENDING shape the
 *     cascade deposits ahead of an arrival — see `pendingDoubleExitNotActive.test.ts`, whose
 *     invariant this must not disturb. The second test below is the boundary against it.
 *  2. **At least one side NOT carried by propagation.** A CONVERGENCE — two propagated exits
 *     arriving from different sources and collapsing — has two occupants who never played it, and
 *     `sideExitProvenance` records both sides as carried. Unwinding the upstream it derives from
 *     must stay permitted, which is what `propagatedByeYieldsToArrivingLoser.test.ts` still proves.
 *
 * WHAT THE FIX CHANGES, precisely: not whether these sequences succeed — a genuine result downstream
 * SHOULD refuse an unwind that crosses it, and a director can clear that result first — but WHEN the
 * refusal happens. The guard now sees the contested double exit and refuses before any write, where
 * before the cascade unwound around it and failed later with the draw already mutated. So the
 * property asserted here is atomicity, which is what the census counts as
 * `ERROR_IMPLIES_NO_MUTATION`.
 *
 * Measured over the 600-seed window at `dev` `711ad2147`, frozen schedules, per-seed isolated:
 * **12 seeds closed, 1 new.**
 *
 * Every case below is a sweep reproduction, shrunk, verified to reproduce STANDALONE with the same
 * error code, and then verified to DISCRIMINATE — RED on `dev`, green here. Three further seeds the
 * census closes were shrunk and discarded rather than kept as decoration: 9000223's shrink is green
 * on `dev` already, and 9000009's and 9000155's shrinks fail on BOTH trees, exhibiting a defect this
 * change does not close. A shrinker preserves only the PROPERTY, so a shrunk case is evidence for a
 * fix only once it has been shown to turn.
 */

const DRAW_ID = 'contested-double-exit';

function target({ structureName, roundNumber, roundPosition }: any) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );
}

it.each([
  {
    scenario: 'a consolation DOUBLE_WALKOVER beneath a re-scored main in a FIRST_MATCH_LOSER_CONSOLATION of 16',
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    participantsCount: 11,
    drawSize: 16,
    propagateExitStatus: false,
    seed: 9000014,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 3, outcome: { winningSide: 1 } },
      { structureName: 'Consolation', roundNumber: 2, roundPosition: 3, outcome: { winningSide: 1 } },
      { structureName: 'Consolation', roundNumber: 2, roundPosition: 4, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 4, outcome: { winningSide: 2 } },
    ],
  },
  {
    scenario: 'an East DOUBLE_DEFAULT re-scored beneath a DOUBLE_WALKOVER in a COMPASS of 8',
    drawType: COMPASS,
    participantsCount: 7,
    drawSize: 8,
    propagateExitStatus: false,
    seed: 9000316,
    steps: [
      { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 4,
        outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
      },
      { structureName: 'East', roundNumber: 2, roundPosition: 1, outcome: { winningSide: 1 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ],
  },
  {
    scenario: 'a Backdraw DOUBLE_WALKOVER beneath a re-scored main in a DOUBLE_ELIMINATION of 8',
    drawType: DOUBLE_ELIMINATION,
    participantsCount: 8,
    drawSize: 8,
    propagateExitStatus: false,
    seed: 9000358,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'Backdraw', roundNumber: 1, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Backdraw', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
      { structureName: 'Backdraw', roundNumber: 3, roundPosition: 1, outcome: { winningSide: 1 } },
    ],
  },
])('$scenario refuses ATOMICALLY or not at all', (testCase) => {
  const { participantsCount, propagateExitStatus, drawType, drawSize, seed, steps } = testCase;

  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId: DRAW_ID }],
    nonRandom: seed,
    setState: true,
  });

  for (const [index, step] of steps.entries()) {
    const matchUp = target(step);
    expect(matchUp?.matchUpId, `step ${index + 1} target missing`).toBeDefined();

    const before = hash(getDrawDefinition(DRAW_ID));
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId: DRAW_ID,
    });
    const after = hash(getDrawDefinition(DRAW_ID));

    if (result.error) {
      expect(
        after,
        `step ${index + 1} (${step.structureName} r${step.roundNumber}p${step.roundPosition}) ` +
          `returned ${result.error.code} after mutating the draw`,
      ).toEqual(before);
      return;
    }
  }

  // CONTROL, not the regression assertion: the committed oracle must stay clean, so the fix cannot
  // buy atomicity back with a worse draw.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect((inconsistencies?.inconsistencies ?? []).map((issue: any) => issue.issueType)).toEqual([]);
});

it('a double exit with only one occupant is still not active', () => {
  // The boundary against condition 1. A propagated exit the cascade deposited ahead of an arrival
  // has a single occupant and must stay transparent, or it blocks the arrival it is waiting for —
  // the failure `pendingDoubleExitNotActive.test.ts` was written to prevent.
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 6, drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP, drawId: DRAW_ID }],
    nonRandom: 9000155,
    setState: true,
  });

  const first = target({ structureName: 'Main', roundNumber: 2, roundPosition: 2 });
  const seeded: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: first.matchUpId,
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(seeded.error).toBeUndefined();

  // the control: the propagated exit this creates must really have fewer than two occupants, or the
  // assertion below is about nothing
  const propagated = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.filter(
      (matchUp: any) =>
        [DOUBLE_WALKOVER, WALKOVER].includes(matchUp.matchUpStatus) &&
        (matchUp.sides ?? []).filter((side: any) => side?.participantId).length < 2,
    );
  expect(propagated.length).toBeGreaterThan(0);

  const upstream = target({ structureName: 'Main', roundNumber: 1, roundPosition: 2 });
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: upstream.matchUpId,
    outcome: { winningSide: 1 },
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.error?.code).toBeUndefined();
});
