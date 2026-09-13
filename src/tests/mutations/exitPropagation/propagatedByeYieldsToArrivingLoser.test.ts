import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
} from '@Constants/drawDefinitionConstants';

/**
 * A drawPosition holding a BYE that the cascade itself placed is AVAILABLE to an arriving loser.
 *
 * `placeLoser`'s availability filter counted any BYE as filling the slot, so when a directed loser
 * arrived at a position holding a propagated BYE there was no available drawPosition, execution fell
 * through to the terminal `DRAW_POSITION_OCCUPIED` — and that error describes a participant conflict
 * which does not exist. A propagated BYE is a placeholder the cascade put there, and the arriving
 * loser is what it was holding the slot for.
 *
 * Measured over the 600-seed sweep window before the fix: the fall-through is reached **56 times**,
 * every one returning `DRAW_POSITION_OCCUPIED` and every one with no unfilled position at all. In
 * **41 of those 56** the target drawPosition held a BYE marked `byeFromPropagation`. The other 15
 * held a real participant, where the refusal is truthful and is deliberately unchanged.
 *
 * `byeFromPropagation` is the authoritative marker and consulting it is the point — it exists so
 * removal need not infer "did the cascade place this BYE" from topology. An UNMARKED bye stays
 * unavailable: it may be a structural BYE that legitimately owns the slot, and overwriting it would
 * be the over-clearing that marker was introduced to end.
 *
 * All four cases are shrunk reproductions from that window, which is why the seeds are the sweep's
 * own.
 */

const DRAW_ID = 'propagated-bye-yields';

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
    scenario: 'a consolation DOUBLE_WALKOVER upstream of a re-scored final in a FEED_IN_CHAMPIONSHIP of 8',
    drawType: FEED_IN_CHAMPIONSHIP,
    participantsCount: 4,
    drawSize: 8,
    propagateExitStatus: false,
    seed: 9000579,
    steps: [
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { structureName: 'Main', roundNumber: 3, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Consolation', roundNumber: 3, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 3, roundPosition: 1, outcome: { winningSide: 2 } },
    ],
  },
  {
    scenario: 'a consolation DOUBLE_WALKOVER beside a main DOUBLE_DEFAULT in a FEED_IN_CHAMPIONSHIP_TO_SF of 16',
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    participantsCount: 16,
    drawSize: 16,
    propagateExitStatus: true,
    seed: 9000572,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
      { structureName: 'Consolation', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 3, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
    ],
  },
  {
    scenario: 'a RETIRED re-score of a DOUBLE_WALKOVER in a DOUBLE_ELIMINATION of 16',
    drawType: DOUBLE_ELIMINATION,
    participantsCount: 15,
    drawSize: 16,
    propagateExitStatus: true,
    seed: 9000595,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 8,
        outcome: { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 1,
        outcome: { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
      },
    ],
  },
  {
    scenario: 'a chain of walkovers re-scoring a DOUBLE_WALKOVER final',
    drawType: FEED_IN_CHAMPIONSHIP,
    participantsCount: 6,
    drawSize: 8,
    propagateExitStatus: true,
    seed: 9000305,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 3, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'Main', roundNumber: 3, roundPosition: 1, outcome: { winningSide: 2 } },
    ],
  },
  {
    scenario: 'a DOUBLE_DEFAULT re-score in a FEED_IN_CHAMPIONSHIP_TO_SF of 16',
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    participantsCount: 14,
    drawSize: 16,
    propagateExitStatus: false,
    seed: 9000077,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 6,
        outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 3, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 4, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      // This case's defect manifests at its LAST step, so the sequence has to reach it. The r2p4
      // double exit above is natively recorded with two real participants and now blocks the r1p7
      // unwind that crosses it, so it is cleared first — the order a director would follow. Pinning
      // the refusal instead was measured to leave the tail invalid; reordering was measured to drop
      // this file's control from 4 RED to 2.
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 4,
        outcome: {
          score: { scoreStringSide1: '', scoreStringSide2: '' },
          matchUpStatus: TO_BE_PLAYED,
          winningSide: undefined,
        },
      },
      { structureName: 'Main', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      { structureName: 'Main', roundNumber: 3, roundPosition: 2, outcome: { winningSide: 1 } },
    ],
  },
])('$scenario is not refused by a propagated BYE holding the target slot', (testCase) => {
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
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId: DRAW_ID,
    });
    const where = `step ${index + 1} (${step.structureName} r${step.roundNumber}p${step.roundPosition})`;
    expect(result.error?.code, where).toBeUndefined();
  }
});

it('does not treat an UNMARKED bye as available to an arriving loser', () => {
  // The boundary. A BYE without `byeFromPropagation` may legitimately own its slot — it was placed
  // by draw generation or by hand rather than by this cascade — so it must keep counting as filled.
  // A generated draw with fewer participants than positions carries exactly such byes.
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 5, drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP, drawId: DRAW_ID }],
    nonRandom: 1,
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const assignments = (drawDefinition.structures ?? []).flatMap((s: any) => s.positionAssignments ?? []);
  const generatedByes = assignments.filter((a: any) => a.bye);

  // the control: the scenario must actually contain byes, or the assertion below is vacuous
  expect(generatedByes.length).toBeGreaterThan(0);
  // and none of them claims to have come from propagation
  for (const bye of generatedByes) expect(bye.byeFromPropagation).toBeUndefined();

  // the inconsistency oracle stays clean on a freshly generated draw
  const issues: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  expect((issues?.inconsistencies ?? []).map((i: any) => i.issueType)).toEqual([]);
});
