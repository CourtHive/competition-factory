import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A consolation seat whose arrived loser is removed and replaced with a BYE is marked `disableLinks`, so its feeder's
 * loser is no longer sent there. `resetDrawDefinition` keeps that BYE (it empties only the seats results filled) and
 * used to clear its marker: the BYE then sat unmarked on a seat the link feeds, and once the draw was replayed the
 * consolation matchUp's second loser was refused with ERR_OCCUPIED_DRAW_POSITION. The marker now stays with the BYE.
 */

const played = (winningSide: 1 | 2) => ({
  score: {
    sets: [1, 2].map((setNumber) => ({
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
      setNumber,
    })),
  },
  winningSide,
});

it('a reset keeps the disabled links of a BYE placed by hand, and the draw replays', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8 }],
    setState: true,
  });
  const consolation = () => tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition.structures[1];
  const firstRound = (roundPosition: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find(
        (m: any) => m.structureName === 'Main' && m.roundNumber === 1 && m.roundPosition === roundPosition,
      );
  const score = (roundPosition: number) =>
    tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: firstRound(roundPosition).matchUpId,
      outcome: played(1),
    });

  expect(score(1).success).toEqual(true);
  expect(score(2).success).toEqual(true);
  const seat = consolation().positionAssignments.find((assignment: any) => assignment.participantId).drawPosition;
  const removed = tournamentEngine.removeDrawPositionAssignment({
    structureId: consolation().structureId,
    drawPosition: seat,
    replaceWithBye: true,
    drawId: 'd',
  });
  expect(removed.success).toEqual(true);

  expect(tournamentEngine.resetDrawDefinition({ drawId: 'd' }).success).toEqual(true);
  const byeSeat = consolation().positionAssignments.find((assignment: any) => assignment.drawPosition === seat);
  expect(byeSeat).toMatchObject({ bye: true, disableLinks: true });

  // replayed: both results are accepted, and the second loser takes the open seat beside the BYE
  expect(score(1).success).toEqual(true);
  expect(score(2).success).toEqual(true);
  expect(consolation().positionAssignments.filter((assignment: any) => assignment.participantId).length).toEqual(1);
  const errors = (tournamentEngine.getDrawInconsistencies({ drawId: 'd' }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.severity === 'error',
  );
  expect(errors).toEqual([]);
});
