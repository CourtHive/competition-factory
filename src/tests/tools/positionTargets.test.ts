import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import * as tools from '@Assemblies/tools';
import { describe, expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';

/**
 * `tools.positionTargets` answers where a matchUp's loser goes — the geometry setMatchUpStatus follows — for an ingest
 * tool placing a participant its source left out (a loser who declined a consolation, recorded as a bye).
 */
describe('tools.positionTargets', () => {
  it('names the consolation position a first-round loser feeds, where the engine then places them', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 }],
      setState: true,
      nonRandom: 1,
    });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { matchUps: inContextDrawMatchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const source = inContextDrawMatchUps.find((m) => m.stage === MAIN && m.roundNumber === 1 && m.roundPosition === 3);

    let result: any = tools.positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId: source.matchUpId });
    expect(result.error).toBeUndefined();
    const { loserMatchUp, loserTargetDrawPosition } = result.targetMatchUps;
    expect(loserMatchUp.stage).toEqual(CONSOLATION);
    expect(loserMatchUp.drawPositions).toContain(loserTargetDrawPosition);

    const loserId = source.sides.find((side) => side.sideNumber === 2).participantId;
    result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1, sets: [{ setNumber: 1, side1Score: 6, side2Score: 0, winningSide: 1 }] },
      matchUpId: source.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const consolation = tournamentEngine
      .getEvent({ drawId })
      .drawDefinition.structures.find((s) => s.structureId === loserMatchUp.structureId);
    const seated = consolation.positionAssignments.find((a) => a.drawPosition === loserTargetDrawPosition);
    expect(seated.participantId).toEqual(loserId);
  });
});
