import * as carry from '@Mutate/matchUps/drawPositions/carryEmptiedSeatsPastByes';
import * as bye from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { getTournamentRecord } from '@Global/state/globalState';
import { afterEach, expect, test, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { MISSING_DRAW_POSITION } from '@Constants/errorConditionConstants';

// A refused mutation must leave the record exactly as it found it, on a DIRECT call: no rollbackOnError,
// no snapshot/restore. The record is copied before the call and compared after it. Each inner failure is
// injected at its one call site.
const recordCopy = () => structuredClone(getTournamentRecord(tournamentEngine.getTournamentId()));

afterEach(() => {
  vi.restoreAllMocks();
});

// an 8 draw with 6 participants: BYEs at 2 and 7, nothing played
function setup() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId, positionAssignments } = drawDefinition.structures[0];
  const byePosition = positionAssignments.find((assignment) => assignment.bye).drawPosition;
  const participantPosition = positionAssignments.find(
    (assignment) => assignment.participantId && Math.abs(assignment.drawPosition - byePosition) > 1,
  ).drawPosition;
  return { drawId, structureId, byePosition, participantPosition };
}

test('a swap whose BYE placement fails returns the failure, with the record unchanged', () => {
  const { drawId, structureId, byePosition, participantPosition } = setup();

  // the swap's BYE placement on the participant's former seat fails; every other BYE placement is real
  const assignDrawPositionBye = bye.assignDrawPositionBye;
  vi.spyOn(bye, 'assignDrawPositionBye').mockImplementation((args) =>
    args.drawPosition === participantPosition ? { error: MISSING_DRAW_POSITION } : assignDrawPositionBye(args),
  );

  const before = recordCopy();
  const result: any = tournamentEngine.swapDrawPositionAssignments({
    drawPositions: [byePosition, participantPosition],
    structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_DRAW_POSITION);
  expect(recordCopy()).toEqual(before);
});

test('a removal whose carry past BYEs fails returns the failure, with the record unchanged', () => {
  const { drawId, structureId, participantPosition } = setup();

  vi.spyOn(carry, 'carryEmptiedSeatsPastByes').mockReturnValue({ error: MISSING_DRAW_POSITION });

  const before = recordCopy();
  const result: any = tournamentEngine.removeDrawPositionAssignment({
    drawPosition: participantPosition,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_DRAW_POSITION);
  expect(recordCopy()).toEqual(before);
});

test('a swap that succeeds writes the same draw a composed swap would', () => {
  const { drawId, structureId, byePosition, participantPosition } = setup();
  const result: any = tournamentEngine.swapDrawPositionAssignments({
    drawPositions: [byePosition, participantPosition],
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  const { positionAssignments } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  expect(positionAssignments.find(({ drawPosition }) => drawPosition === participantPosition).bye).toEqual(true);
  expect(positionAssignments.find(({ drawPosition }) => drawPosition === byePosition).participantId).toBeDefined();
});
