import { drawPlayedOrderFacts, wasPlayed } from '@Mutate/matchUps/schedule/scheduleItems/playedOrder';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { COMPASS, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * `drawPlayedOrderFacts` reads the stored matchUps before it builds the draw's: a draw nobody has played in has no
 * facts. The stored scan must agree with the built one on every draw shape: a round robin's groups are nested
 * structures, and a TEAM draw's played matchUps may be its tie matchUps only.
 */
function drawDefinitionOf(drawId: string) {
  return tournamentEngine.getEvent({ drawId }).drawDefinition;
}

const builtScanPlayed = (drawDefinition: any) =>
  (allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? []).some(wasPlayed);

describe('the stored scan agrees with the built one on whether a draw was played', () => {
  it.each([
    ['single elimination', { drawSize: 16 }],
    ['compass', { drawSize: 32, drawType: COMPASS }],
    ['round robin', { drawSize: 16, drawType: ROUND_ROBIN }],
  ])('%s', (_, drawProfile) => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
    expect(drawPlayedOrderFacts(drawDefinitionOf(drawId))).toBeUndefined();
    expect(builtScanPlayed(drawDefinitionOf(drawId))).toEqual(false);

    // one matchUp played: a tie matchUp in a TEAM draw, a group matchUp in a round robin
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } });
    const target = matchUps.find((m: any) => m.sides?.every((side: any) => side.participantId) && !m.tieMatchUps);
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome });
    expect(result.success).toEqual(true);

    const drawDefinition = drawDefinitionOf(drawId);
    expect(builtScanPlayed(drawDefinition)).toEqual(true);
    expect(drawPlayedOrderFacts(drawDefinition)?.[target.matchUpId]?.played).toEqual(true);
  });

  it('team: played only in one of its tie matchUps', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
      setState: true,
    });
    const drawDefinition = drawDefinitionOf(drawId);
    expect(drawPlayedOrderFacts(drawDefinition)).toBeUndefined();

    // stored data only: one tie matchUp completed with a score, its team matchUp still unplayed
    const [tieMatchUp] = drawDefinition.structures[0].matchUps[0].tieMatchUps;
    Object.assign(tieMatchUp, {
      score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 }], scoreStringSide1: '6-1' },
      matchUpStatus: 'COMPLETED',
      winningSide: 1,
    });
    expect(builtScanPlayed(drawDefinition)).toEqual(true);
    expect(drawPlayedOrderFacts(drawDefinition)?.[tieMatchUp.matchUpId]?.played).toEqual(true);
  });
});
