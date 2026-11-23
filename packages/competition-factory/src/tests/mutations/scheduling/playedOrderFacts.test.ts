import { drawPlayedOrderFacts } from '@Mutate/matchUps/schedule/scheduleItems/playedOrder';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { COMPASS, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * `drawPlayedOrderFacts` reads the stored matchUps before it builds the draw's: a draw with nothing placed has no
 * facts (since CA 2026-10-30 an unplayed placement orders too, so "placed", not "played", is what the scan looks for).
 * The stored scan must agree with the built one on every draw shape: a round robin's groups are nested structures, and
 * a TEAM draw's placed matchUps may be its tie matchUps only.
 */
function drawDefinitionOf(drawId: string) {
  return tournamentEngine.getEvent({ drawId }).drawDefinition;
}

const builtScanPlaced = (drawDefinition: any) =>
  (allDrawMatchUps({ drawDefinition, inContext: false }).matchUps ?? []).some(
    (matchUp) => !!scheduledMatchUpDate({ matchUp }).scheduledDate,
  );

describe('the stored scan agrees with the built one on whether a draw has anything placed', () => {
  it.each([
    ['single elimination', { drawSize: 16 }],
    ['compass', { drawSize: 32, drawType: COMPASS }],
    ['round robin', { drawSize: 16, drawType: ROUND_ROBIN }],
  ])('%s', (_, drawProfile) => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
    expect(drawPlayedOrderFacts(drawDefinitionOf(drawId))).toBeUndefined();
    expect(builtScanPlaced(drawDefinitionOf(drawId))).toEqual(false);

    // a batch placing several of its matchUps is judged against itself, so it has facts whatever is stored
    expect(drawPlayedOrderFacts(drawDefinitionOf(drawId), { batched: true })).toBeDefined();

    // one matchUp placed, and not played: a group matchUp in a round robin
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } });
    const target = matchUps.find((m: any) => m.sides?.every((side: any) => side.participantId) && !m.tieMatchUps);
    const { startDate } = tournamentEngine.getTournament().tournamentRecord;
    const result = tournamentEngine.addMatchUpScheduledDate({
      matchUpId: target.matchUpId,
      scheduledDate: startDate,
      drawId,
    });
    expect(result.success).toEqual(true);

    const drawDefinition = drawDefinitionOf(drawId);
    expect(builtScanPlaced(drawDefinition)).toEqual(true);
    const facts = drawPlayedOrderFacts(drawDefinition)?.[target.matchUpId];
    expect(facts?.scheduledDate).toEqual(startDate);
    expect(facts?.played).toEqual(false);
  });

  it('team: placed only in one of its tie matchUps', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
      setState: true,
    });
    const drawDefinition = drawDefinitionOf(drawId);
    expect(drawPlayedOrderFacts(drawDefinition)).toBeUndefined();

    // stored data only: one tie matchUp placed, its team matchUp not
    const [tieMatchUp] = drawDefinition.structures[0].matchUps[0].tieMatchUps;
    Object.assign(tieMatchUp, { schedule: { scheduledDate: '2026-10-01' } });
    expect(builtScanPlaced(drawDefinition)).toEqual(true);
    expect(drawPlayedOrderFacts(drawDefinition)?.[tieMatchUp.matchUpId]?.scheduledDate).toEqual('2026-10-01');
  });
});
