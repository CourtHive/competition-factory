import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * Regression guard for the removal of the `isByeAdvancedBye` / `priorPair` block in
 * advanceWinner (assignDrawPositionBye.ts).
 *
 * INVARIANT: advanceWinner only ever advances a WINNER (a real surviving side), never
 * a BYE. BYE cascades — including the very common case of a BYE propagating into a
 * matchUp whose other slot is also a BYE — are dispatched through advanceDrawPosition's
 * own BYE branch, NOT through advanceWinner. The removed block guarded a state
 * (advancing a BYE whose source pair was also a BYE) that is structurally unreachable:
 * only one call site supplies `sourceDrawPositions`, and by the time a second BYE of a
 * would-be double-BYE matchUp is placed, the first BYE has already advanced its mate
 * forward — so the double-BYE matchUp is never itself the furthest-advancement target.
 *
 * These scenarios saturate draws with BYEs (auto + heavy manual placement) and assert
 * that every resulting structure is internally consistent. If a future refactor ever
 * routes a BYE through advanceWinner (breaking the invariant), the defensive guard drops
 * an advancement or the cascade mis-places a position — either way getStructureInconsistencies
 * flags it here.
 */
describe('advanceWinner never advances a BYE (bye-into-bye cascade integrity)', () => {
  it('auto-generated high-bye single-elim + FMLC draws stay structurally consistent', () => {
    for (const drawSize of [8, 16, 32]) {
      for (const participantsCount of [2, 3, 4, 5, 7]) {
        for (const drawType of [SINGLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION]) {
          const drawId = `hb-${drawType}-${drawSize}-${participantsCount}`;
          mocksEngine.generateTournamentRecord({
            drawProfiles: [{ drawId, drawSize, participantsCount, drawType }],
            setState: true,
          });
          const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
          expect(result.valid, `${drawId}: ${JSON.stringify(result.inconsistencies)}`).toEqual(true);
          expect(result.inconsistencies).toEqual([]);
        }
      }
    }
  }, 60000);

  it('manual placement of a BYE that propagates into further BYEs resolves downstream to BYE', () => {
    // Empty 8-draw; place BYEs on positions 1..4 so R1M1 [1,2] and R1M2 [3,4] are both
    // BYE-vs-BYE and both feed R2M1 — the exact "BYE propagates into a BYE-paired slot".
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 2, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    const drawId = drawIds[0];
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    for (const drawPosition of [1, 2, 3, 4]) {
      const result: any = tournamentEngine.assignDrawPositionBye({ drawPosition, structureId, drawId });
      expect(result.success, `assignBye ${drawPosition}: ${result.error}`).toEqual(true);
    }

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const r2m1 = matchUps.find((m: any) => m.roundNumber === 2 && m.roundPosition === 1);
    // the double-BYE feeders must collapse the fed matchUp to a BYE
    expect(r2m1?.matchUpStatus).toEqual(BYE);

    expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);
  });

  it('manual full-draw BYE saturation (all-but-two positions) stays consistent', () => {
    for (const drawSize of [8, 16, 32]) {
      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize, participantsCount: 2, automated: false }],
      });
      tournamentEngine.setState(tournamentRecord);
      const drawId = drawIds[0];
      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;
      for (let dp = drawSize; dp >= 1; dp--) {
        tournamentEngine.assignDrawPositionBye({ drawPosition: dp, structureId, drawId });
      }
      const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
      expect(result.valid, `size ${drawSize}: ${JSON.stringify(result.inconsistencies)}`).toEqual(true);
    }
  });
});
