import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * `getDrawPositionSideNumber` names the side a matchUp's drawPosition is on — the inverse of
 * `getSideDrawPosition`, replacing the inverse idiom `drawPositions.indexOf(drawPosition) + 1`.
 *
 * The idiom is only sound while both positions are present. A matchUp awaiting its second participant
 * stores the one it has at index 0 WHATEVER its side, so the idiom calls a side-2 arrival side 1. The
 * shape that exposes it: a SINGLE_ELIMINATION 4 where only the SECOND first-round matchUp is decided, so
 * the final holds one position, fed from below — side 2.
 */
const drawId = 'draw-position-side-number';
const setup = () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4, drawId }],
    setState: true,
  });
  const lower = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 2);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: lower.matchUpId, outcome });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const inContext = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  return { drawDefinition, structure, inContext };
};

it('answers nothing without a drawPosition, or for one the matchUp does not hold', () => {
  const { drawDefinition, structure, inContext } = setup();
  const final = inContext.find((m: any) => m.roundNumber === 2);
  const args = { drawDefinition, structureId: structure.structureId, matchUp: final };
  expect(getDrawPositionSideNumber({ ...args, drawPosition: undefined })).toBeUndefined();
  expect(getDrawPositionSideNumber({ ...args, drawPosition: 1 })).toBeUndefined();
});

it('reads by order when both positions are present — the same answer as the index idiom', () => {
  const { drawDefinition, structure, inContext } = setup();
  const first = inContext.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
  const args = { drawDefinition, structureId: structure.structureId, matchUp: first };
  for (const drawPosition of first.drawPositions) {
    expect(getDrawPositionSideNumber({ ...args, drawPosition })).toEqual(first.drawPositions.indexOf(drawPosition) + 1);
  }
});

it('with one position present, binds it by side — where the index idiom calls a side-2 arrival side 1', () => {
  const { drawDefinition, structure, inContext } = setup();
  const final = inContext.find((m: any) => m.roundNumber === 2);
  const occupied = final.sides.find((side: any) => side.drawPosition);
  // CONTROL: the shape is the one that matters — a lone position, on side 2, stored at index 0
  expect(final.drawPositions.filter(Boolean)).toHaveLength(1);
  expect(occupied.sideNumber).toEqual(2);
  const stored = structure.matchUps.find((m: any) => m.matchUpId === final.matchUpId);
  expect(stored.drawPositions.filter(Boolean).indexOf(occupied.drawPosition) + 1).toEqual(1);

  const args = { drawDefinition, structureId: structure.structureId, drawPosition: occupied.drawPosition };
  // hydrated: from `sides`
  expect(getDrawPositionSideNumber({ ...args, matchUp: final })).toEqual(2);
  // stored: no `sides`, so the round profile resolves the same binding
  expect(stored.sides).toBeUndefined();
  expect(getDrawPositionSideNumber({ ...args, matchUp: stored })).toEqual(2);
});
