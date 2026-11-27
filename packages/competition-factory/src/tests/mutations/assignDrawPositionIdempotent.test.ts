import { tournamentEngine } from '@Engines/syncEngine';
import { defined } from '@Tests/helpers/defined';
import mocksEngine from '@Assemblies/engines/mock';
import { defined } from '@Tests/helpers/defined';
import { expect, test } from 'vitest';

// constants
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/eventConstants';

// the first structure's assignments, read back from engine state
function storedAssignments(tournamentId: string) {
  const record = defined(tournamentEngine.getState().tournamentRecords[tournamentId], 'record');
  const draw = defined(defined(record.events, 'events')[0].drawDefinitions, 'draws')[0];
  return defined(defined(draw.structures, 'structures')[0].positionAssignments, 'positionAssignments');
}

// Re-asserting the SAME participant at the SAME drawPosition must be an idempotent
// no-op success — not an error. This is what unblocks bulk re-syncs / retries (e.g.
// an integration re-pushing an already-populated draw). The conflict guard must still
// fire when the same participant is targeted at a DIFFERENT position.
test('assignDrawPosition is idempotent for the same participant at the same drawPosition', () => {
  tournamentEngine.reset();
  const gen = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        eventType: SINGLES,
        drawProfiles: [{ drawSize: 4, automated: false }],
      },
    ],
    setState: true,
  });
  expect(gen.success).toEqual(true);

  const drawId = gen.drawIds[0];
  const drawDefinition = defined(
    defined(gen.tournamentRecord.events, 'events')[0].drawDefinitions,
    'drawDefinitions',
  )[0];
  const structureId = defined(drawDefinition.structures, 'structures')[0].structureId;
  const participantId = defined(defined(gen.tournamentRecord.events, 'events')[0].entries, 'entries')[0].participantId;

  // first placement succeeds
  let result: any = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, participantId });
  expect(result.success).toEqual(true);

  // re-asserting the exact same assignment is a no-op success (idempotent), not an error
  result = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, participantId });
  expect(result.success).toEqual(true);
  expect(result.error).toBeUndefined();

  // the participant is still at drawPosition 1 exactly once (no duplication)
  const assignments = storedAssignments(gen.tournamentRecord.tournamentId);
  const held = assignments.filter((a) => a.participantId === participantId);
  expect(held).toHaveLength(1);
  expect(held[0].drawPosition).toEqual(1);

  // conflict guard preserved: the same participant at a DIFFERENT (empty) position still errors
  result = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 2, participantId });
  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
});

// The actual production path: an integration re-pushes the full, already-correct
// position set as an executionQueue batch with rollbackOnError. Pre-fix, the first
// already-placed participant errored and rolled back the ENTIRE batch (observed with
// a provider's 128-method re-sync). Post-fix, each re-assertion is a no-op and the
// batch commits.
test('a re-asserting executionQueue batch commits instead of rolling back', async () => {
  tournamentEngine.reset();
  const gen = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: SINGLES }], // automated → positions assigned
    setState: true,
  });
  expect(gen.success).toEqual(true);

  const drawId = gen.drawIds[0];
  const structure = defined(
    defined(defined(gen.tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0].structures,
    'structures',
  )[0];
  const structureId = structure.structureId;
  const assigned = defined(structure.positionAssignments, 'positionAssignments').filter((a: any) => a.participantId);
  expect(assigned.length).toBeGreaterThan(0);

  // re-push every already-correct assignment (mirrors the integration re-sync)
  const methods = assigned.map((a: any) => ({
    method: 'assignDrawPosition',
    params: { drawId, structureId, drawPosition: a.drawPosition, participantId: a.participantId },
  }));

  let result: any = await tournamentEngine.executionQueue(methods, true); // rollbackOnError
  expect(result.success).toEqual(true);
  expect(result.rolledBack).not.toEqual(true);

  // nothing rolled back — the draw is still fully assigned
  const after = storedAssignments(gen.tournamentRecord.tournamentId).filter((a) => a.participantId);
  expect(after.length).toEqual(assigned.length);
});
