import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

/**
 * A TEAM FIRST_MATCH_LOSER_CONSOLATION draw of 8 with DOMINANT_DUO (two singles and a doubles; two rubbers win the
 * dual). Every round 1 dual is won 3-0, so every round 2 loser has a prior win and both consolation slots fed from
 * round 2 are reserved with a BYE. Clearing a round 2 result must leave those reservations standing.
 *
 * The round 2 winner takes its round 1 dual either with a WALKOVER on its first rubber or with all three scored.
 * The dual is COMPLETED and won by the same side either way, so the consolation must read the same either way.
 */
function clearRoundTwo({ walkoverRubber }: { walkoverRubber: boolean }) {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: FIRST_MATCH_LOSER_CONSOLATION, tieFormatName: 'DOMINANT_DUO', eventType: TEAM_EVENT, drawSize: 8 },
    ],
    setState: true,
  });
  let result: any = tournamentEngine.generateLineUps({
    scaleAccessor: { scaleType: RANKING, scaleName: 'U18' },
    useDefaultEventRanking: true,
    attach: true,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const duals = (stage: string, roundNumber: number) =>
    matchUps().filter((m) => m.matchUpType === TEAM_MATCHUP && m.stage === stage && m.roundNumber === roundNumber);
  const playDual = (matchUpId: string, winningSide: number, walkoverFirst = false) => {
    matchUps()
      .filter((m) => m.matchUpTieId === matchUpId)
      .forEach((rubber, index) => {
        const scoreString = rubber.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1';
        const outcome =
          walkoverFirst && index === 0
            ? { matchUpStatus: WALKOVER, winningSide }
            : mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide }).outcome;
        const result = tournamentEngine.setMatchUpStatus({ matchUpId: rubber.matchUpId, outcome, drawId });
        expect(result.success).toEqual(true);
      });
  };

  const [firstDual, ...otherDuals] = duals(MAIN, 1);
  playDual(firstDual.matchUpId, 1, walkoverRubber);
  for (const dual of otherDuals) playDual(dual.matchUpId, 1);
  expect(matchUps().find((m) => m.matchUpId === firstDual.matchUpId).matchUpStatus).toEqual(COMPLETED);

  // round 2: the first dual's winner beats an opponent that won its own round 1 dual
  const winnerDrawPosition = firstDual.drawPositions[0];
  const roundTwoDual = duals(MAIN, 2).find((m) => m.drawPositions?.includes(winnerDrawPosition));
  const winningSide = roundTwoDual.sides.find((side) => side.drawPosition === winnerDrawPosition).sideNumber;
  playDual(roundTwoDual.matchUpId, winningSide);

  const consolationAssignments = () => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const consolation = drawDefinition.structures.find(({ stage }) => stage === CONSOLATION);
    return consolation.positionAssignments.map(({ drawPosition, participantId, bye }) => ({
      drawPosition,
      occupant: (bye && 'BYE') || (participantId && 'participant') || undefined,
    }));
  };
  const before = consolationAssignments();

  result = tournamentEngine.resetScorecard({ matchUpId: roundTwoDual.matchUpId, drawId });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const inconsistencies = (getDrawInconsistencies({ drawDefinition, drawId }) as any).inconsistencies ?? [];
  return { before, after: consolationAssignments(), inconsistencies };
}

it('clearing round 2 keeps the reserved consolation BYEs (all rubbers scored)', () => {
  const { before, after, inconsistencies } = clearRoundTwo({ walkoverRubber: false });
  expect(before.filter(({ occupant }) => occupant === 'BYE')).toHaveLength(2);
  expect(after).toEqual(before);
  expect(inconsistencies).toEqual([]);
});

it('a WALKOVER rubber is not a walkover dual: clearing round 2 keeps the reserved consolation BYEs', () => {
  const { before, after, inconsistencies } = clearRoundTwo({ walkoverRubber: true });
  expect(before.filter(({ occupant }) => occupant === 'BYE')).toHaveLength(2);
  expect(after).toEqual(before);
  expect(inconsistencies).toEqual([]);
});
