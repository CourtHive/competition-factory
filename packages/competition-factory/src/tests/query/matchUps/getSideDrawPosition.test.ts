import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * `getSideDrawPosition` names the drawPosition a matchUp holds on one side — by order while both are
 * present, and by side, never by index, while the array is compacted to one. A SINGLE_ELIMINATION 8
 * with one BYE has a second-round matchUp holding exactly one position, which is the shape that matters.
 */
const drawId = 'side-draw-position';
const setup = () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, participantsCount: 7, drawId }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const inContext = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  return { drawDefinition, structure, inContext };
};

it('answers nothing without a side, or where the matchUp holds no position', () => {
  const { drawDefinition, structure, inContext } = setup();
  const final = inContext.find((m: any) => m.roundNumber === 3);
  const args = { drawDefinition, structureId: structure.structureId };
  expect(getSideDrawPosition({ ...args, matchUp: final, sideNumber: undefined })).toBeUndefined();
  expect(getSideDrawPosition({ ...args, matchUp: final, sideNumber: 1 })).toBeUndefined();
});

it('reads by order when both positions are present', () => {
  const { drawDefinition, structure, inContext } = setup();
  const first = inContext.find((m: any) => m.roundNumber === 1 && m.drawPositions.filter(Boolean).length === 2);
  const args = { drawDefinition, structureId: structure.structureId, matchUp: first };
  const ordered = [...first.drawPositions].sort((a: number, b: number) => a - b);
  expect(getSideDrawPosition({ ...args, sideNumber: 1 })).toEqual(ordered[0]);
  expect(getSideDrawPosition({ ...args, sideNumber: 2 })).toEqual(ordered[1]);
});

it('with one position present, binds it by side — from hydrated sides, or structurally from the stored matchUp', () => {
  const { drawDefinition, structure, inContext } = setup();
  const lone = inContext.find((m: any) => m.roundNumber === 2 && m.drawPositions.filter(Boolean).length === 1);
  const occupied = lone.sides.find((side: any) => side.drawPosition);
  const vacantSide = 3 - occupied.sideNumber;
  const args = { drawDefinition, structureId: structure.structureId };

  expect(getSideDrawPosition({ ...args, matchUp: lone, sideNumber: occupied.sideNumber })).toEqual(
    occupied.drawPosition,
  );
  expect(getSideDrawPosition({ ...args, matchUp: lone, sideNumber: vacantSide })).toBeUndefined();

  // the stored matchUp has no `sides`: the round profile resolves the same binding
  const stored = structure.matchUps.find((m: any) => m.matchUpId === lone.matchUpId);
  expect(stored.sides).toBeUndefined();
  expect(getSideDrawPosition({ ...args, matchUp: stored, sideNumber: occupied.sideNumber })).toEqual(
    occupied.drawPosition,
  );
  expect(getSideDrawPosition({ ...args, matchUp: stored, sideNumber: vacantSide })).toBeUndefined();
});
