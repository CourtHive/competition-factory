import { getTournamentRecord } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { LUCKY_DRAW, MAIN } from '@Constants/drawDefinitionConstants';
import {
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
  INSUFFICIENT_DRAW_POSITIONS,
  LUCKY_DRAW_BYE_LIMIT,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

const recordCopy = () => structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));

// an 8 draw with 2 qualifier positions and 6 direct acceptances, nothing placed;
// a BYE placed by hand leaves 7 positions for 8 entries, so positioning cannot succeed:
// seating them would place the qualifiers and then fail on the direct acceptances
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

test('a positioning that cannot seat everyone is refused before anything is placed', () => {
  const { drawId, structureId, getMain } = setupOverfullMain();

  // a DIRECT call — no executionQueue, no rollbackOnError: the refusal itself leaves the record as it was
  const before = recordCopy();
  const result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  expect(recordCopy()).toEqual(before);

  // no qualifier was placed; only the hand-placed BYE is there
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

test('qualifiers with no round to land in are refused before anything is placed', () => {
  const { drawId, structureId, getMain } = setupOverfullMain();
  // seats 1-7 hold BYEs: one open seat for two qualifiers
  for (const drawPosition of [2, 3, 4, 5, 6, 7]) {
    expect(tournamentEngine.assignDrawPositionBye({ drawId, structureId, drawPosition }).success).toEqual(true);
  }
  expect(getMain().positionAssignments.filter(({ bye }) => bye).length).toEqual(7);

  const before = recordCopy();
  const result = tournamentEngine.automatedPositioning({ drawId, structureId });
  expect(result.error).toEqual(NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS);
  expect(recordCopy()).toEqual(before);
});
