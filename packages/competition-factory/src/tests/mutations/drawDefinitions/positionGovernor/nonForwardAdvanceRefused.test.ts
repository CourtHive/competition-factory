import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { INVALID_MATCHUP } from '@Constants/errorConditionConstants';

/**
 * BYE advancement moves forward: to a later round of the same structure, or into another structure.
 *
 * A record built outside the factory can repeat matchUpIds. Advancement re-reads its target by id,
 * so a round-2 matchUp sharing a round-1 matchUp's id resolved back to round 1, and placing a BYE
 * recursed until the stack overflowed. The engine now refuses it (see refuseNonForwardAdvance).
 */
useEngineCatch(); // what a consumer sees: the engine catches the throw and returns { error }

function unpositionedDraw(repeatId: boolean) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, automated: false }], nonRandom: 1 });
  const [structure] = tournamentRecord.events[0].drawDefinitions[0].structures;
  const firstOfRound = (roundNumber: number) =>
    structure.matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === 1);
  // the round-2 matchUp that drawPositions 1 and 2 advance into takes the id of their round-1 matchUp
  if (repeatId) firstOfRound(2).matchUpId = firstOfRound(1).matchUpId;
  tournamentEngine.setState(tournamentRecord);
  return { drawId, structureId: structure.structureId };
}

it('a BYE in a record whose round-2 matchUp repeats a round-1 matchUpId is refused, not recursed', () => {
  const { drawId, structureId } = unpositionedDraw(true);
  const result: any = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, bye: true });
  expect(result.error).toContain(INVALID_MATCHUP.code);
  expect(result.error).toContain('not unique');
});

it('the same BYE in the same draw with unique ids advances as before', () => {
  const { drawId, structureId } = unpositionedDraw(false);
  const result: any = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, bye: true });
  expect(result.success).toEqual(true);
});
