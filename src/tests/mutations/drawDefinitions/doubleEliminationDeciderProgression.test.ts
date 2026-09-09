/**
 * Regression cover for the DOUBLE_ELIMINATION Main-final -> Decider progression.
 *
 * A double-exit cascade in the Backdraw can leave the Main final with only one real participant:
 * the undefeated main-bracket winner, waiting on a Backdraw winner who will now never arrive. The
 * engine resolves that as a walkover, and two independent defects made the result wrong.
 *
 *  1. `getExitWinningSide` answered "which side is this drawPosition" with the topology proxy
 *     `feedRound => 1`. On the Main final the fed slot IS side 1, so the walkover was awarded to
 *     the empty side and the only participant in the match was recorded as the LOSER.
 *  2. `advanceDrawPosition` advanced a winner only when the winner target was in the SAME
 *     structure. The Decider is a different structure reached over a WINNER link, so the branch
 *     fell through silently and the winner never appeared in it.
 *
 * Together they produced a draw the repo's own `getDrawInconsistencies` reports as
 * DROPPED_PROGRESSION. Both are asserted here, and each fails on its own if either fix is reverted.
 */
import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

describe('getExitWinningSide — a fed round does not imply side 1', () => {
  it('resolves the side from the matchUp when the advancing position is NOT the fed one', () => {
    const matchUpId = 'm1';
    // The shape of a DOUBLE_ELIMINATION Main final mid-cascade: the fed slot (side 1) is still
    // empty and the position being advanced (side 2) came from the previous round of this
    // structure. `feedRound => 1` would hand the walkover to the side holding nobody.
    const inContextDrawMatchUps: any[] = [
      {
        matchUpId,
        feedRound: true,
        drawPositions: [9],
        sides: [{ sideNumber: 2, drawPosition: 9, participantId: 'p9' }],
      },
    ];
    expect(getExitWinningSide({ inContextDrawMatchUps, drawPosition: 9, matchUpId })).toEqual(2);
  });

  it('still answers 1 when no side carries the drawPosition (proxy retained as a fallback)', () => {
    const matchUpId = 'm1';
    const inContextDrawMatchUps: any[] = [{ matchUpId, feedRound: true, drawPositions: [9], sides: [] }];
    expect(getExitWinningSide({ inContextDrawMatchUps, drawPosition: 9, matchUpId })).toEqual(1);
  });
});

describe.each([DOUBLE_WALKOVER, DOUBLE_DEFAULT])(
  'DOUBLE_ELIMINATION 16 — %s cascade into the Main final',
  (exitStatus) => {
    it.each([true, false])('directs the walkover winner into the Decider (propagate=%s)', (propagateExitStatus) => {
      setSubscriptions({});
      const drawId = `decider-progression-${exitStatus}-${propagateExitStatus}`;
      // nonRandom seeds mocksEngine's placement. 97 is the seed the exit-propagation matrix uses
      // for this cell, so this test and the matrix drive the identical draw.
      const { drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawId, drawType: DOUBLE_ELIMINATION, drawSize: 16, participantsCount: 16 }],
        nonRandom: 97,
        setState: true,
      });
      expect(drawIds).toContain(drawId);

      const outcome = { matchUpStatus: exitStatus };
      const target = nextPlayable(drawId);
      step({ propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });
      playForward({ propagateExitStatus, exitOutcome: outcome, drawId });

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureNamed = (name: string) => drawDefinition.structures.find((s: any) => s.structureName === name);
      const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });

      const mainStructureId = structureNamed('Main').structureId;
      const mainFinal: any = matchUps.find(
        (m: any) => m.structureId === mainStructureId && m.roundNumber === 5 && m.roundPosition === 1,
      );

      // the cascade leaves exactly one real participant in the final — the fed slot never fills
      const occupied = (mainFinal.sides ?? []).filter((side: any) => side.participantId);
      expect(occupied).toHaveLength(1);

      // the walkover goes to the side that HOLDS someone, never to the empty fed slot
      expect(mainFinal.winningSide).toEqual(occupied[0].sideNumber);

      // and that winner is directed across the WINNER link into the Decider
      const deciderParticipantIds = (structureNamed('Decider').positionAssignments ?? [])
        .map((assignment: any) => assignment.participantId)
        .filter(Boolean);
      expect(deciderParticipantIds).toContain(occupied[0].participantId);

      // the repo's own integrity checker agrees the draw is whole
      const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
      expect(integrity.inconsistencies).toEqual([]);
    });
  },
);
