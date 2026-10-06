import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { LUCKY_DRAW, MAIN } from '@Constants/drawDefinitionConstants';
import {
  INSUFFICIENT_DRAW_POSITIONS,
  LUCKY_DRAW_BYE_LIMIT,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// an 8 draw with 2 qualifier positions and 6 direct acceptances, nothing placed;
// a BYE placed by hand leaves 7 positions for 8 entries, so positioning fails part-way:
// the qualifiers are placed, then the direct acceptances cannot all be seated
function setupOverfullMain() {
  const drawProfiles = [
    {
      qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }],
      automated: false,
      drawSize: 8,
    },
  ];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles, setState: true });

  const getMain = () =>
    tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((structure) => structure.stage === MAIN);
  const { structureId } = getMain();

  const result = tournamentEngine.assignDrawPositionBye({ drawId, structureId, drawPosition: 1 });
  expect(result.success).toEqual(true);

  return { drawId, structureId, getMain };
}

test('automated positioning that fails part-way returns an error, not success', () => {
  const { drawId, structureId } = setupOverfullMain();

  const result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  expect(result.success).toBeUndefined();
});

test('automated positioning of a structure that does not exist returns an error', () => {
  const { drawId } = setupOverfullMain();

  const result = tournamentEngine.automatedPositioning({ drawId, structureId: 'unknown' });
  expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  expect(result.success).toBeUndefined();
});

test('a part-way positioning failure is rolled back when the caller asks for rollbackOnError', () => {
  const { drawId, structureId, getMain } = setupOverfullMain();

  const result = tournamentEngine.executionQueue(
    [{ method: 'automatedPositioning', params: { drawId, structureId } }],
    true,
  );
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  expect(result.rolledBack).toEqual(true);

  // the qualifiers placed before the failure are gone; only the hand-placed BYE remains
  const { positionAssignments } = getMain();
  expect(positionAssignments.filter((assignment) => assignment.qualifier).length).toEqual(0);
  expect(positionAssignments.filter((assignment) => assignment.bye).map(({ drawPosition }) => drawPosition)).toEqual([
    1,
  ]);
});

test('a failing positioning leaves the shared error constant untouched', () => {
  const { drawId, structureId } = setupOverfullMain();

  let result: any = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);

  // the error is reported inside a result; the constant itself gains no stack and no success flag
  expect(Object.keys(INSUFFICIENT_DRAW_POSITIONS).sort((a, b) => a.localeCompare(b))).toEqual(['code', 'message']);
});

test('a LUCKY_DRAW that would need more than one BYE is refused', () => {
  // a LUCKY_DRAW of 5 has 6 drawPositions; 4 participants would need 2 BYEs
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 5, drawType: LUCKY_DRAW, participantsCount: 4 }],
  });
  expect(result.error).toEqual(LUCKY_DRAW_BYE_LIMIT);
});
