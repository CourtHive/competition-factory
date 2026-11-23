import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../../..';
import { expect, test } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

test('Consolation WO/WO advancing fed BYE', () => {
  // prettier-ignore
  const outcomes = [
    { drawPositions: [1, 2], scoreString: '6-1 6-2', winningSide: 1 },
    { drawPositions: [3, 4], scoreString: '6-1 6-2', winningSide: 1 },
    { drawPositions: [5, 6], scoreString: '6-1 6-2', winningSide: 1 },
    { drawPositions: [7, 8], scoreString: '6-1 6-2', winningSide: 1 },
    { stage: CONSOLATION, scoreString: '6-1 6-2', winningSide: 1 },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, outcomes }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { completedMatchUps, upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(5);

  const targetMatchUp = upcomingMatchUps.find(
    ({ stage, roundNumber, roundPosition }) => stage === CONSOLATION && roundNumber === 1 && roundPosition === 2,
  );
  expect(targetMatchUp.drawPositions).toEqual([7, 8]);
  const bothSidesAsigned = targetMatchUp.sides.every((side) => side.participant);
  expect(bothSidesAsigned).toEqual(true);
  expect(targetMatchUp.readyToScore).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      matchUpStatuses: [DOUBLE_WALKOVER, WALKOVER, BYE],
      stages: [CONSOLATION],
    },
  });
  expect(matchUps.length).toEqual(2);
  expect(matchUps.map(({ roundPosition }) => roundPosition)).toEqual([1, 2]);

  const { matchUpId, drawId } = targetMatchUp;
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      matchUpStatuses: [DOUBLE_WALKOVER, WALKOVER, BYE],
      stages: [CONSOLATION],
    },
  }));
  /**
   * TWO BYEs, NOT ONE, and the test now says WHICH matchUp holds what.
   *
   * This asserted a SORTED BAG of statuses — `['BYE', 'DOUBLE_WALKOVER', 'WALKOVER', 'WALKOVER']` —
   * which cannot tell you where any of them sits. Naming the coordinates is why the change is
   * legible: `Consolation|2|1` was the `WALKOVER` and is now a `BYE`.
   *
   * It is BYE-held: drawPositions [1, 5], and drawPosition 1 carries a draw BYE. CA, 2026-09-20:
   * *"a propagated exit encountering a BYE should be advanced. In both cases the BYE remains a
   * BYE."* The exit no longer overwrites it.
   *
   * THE ADVANCEMENT IS UNCHANGED, which is the point of this test and the reason the rule costs
   * nothing here: drawPosition 5 holds a real participant alongside that BYE, and they advance
   * THROUGH it — `Consolation|3|1` is their walkover, and round 4 below still finds them at
   * drawPosition 5. That is CA's other half — *"an advancing participant encountering a BYE should
   * always be advanced"* — and it was never in question.
   */
  const statusAt = (roundNumber: number, roundPosition: number) =>
    matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition)?.matchUpStatus;

  expect(statusAt(1, 2)).toEqual(DOUBLE_WALKOVER);
  expect(statusAt(2, 1)).toEqual(BYE);
  expect(statusAt(2, 2)).toEqual(BYE);
  expect(statusAt(3, 1)).toEqual(WALKOVER);
  // CONTROL: the filter must actually have returned those four and nothing else
  expect(matchUps.length).toEqual(4);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [CONSOLATION],
      roundNumbers: [4],
    },
  }));

  const advancedSide = matchUps[0].sides.find(getParticipantId);
  expect(advancedSide.drawPosition).toEqual(5);
});
