import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/eventConstants';

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
  const drawDefinition = gen.tournamentRecord.events[0].drawDefinitions[0];
  const structureId = drawDefinition.structures[0].structureId;
  const participantId = gen.tournamentRecord.events[0].entries[0].participantId;

  // first placement succeeds
  let result: any = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, participantId });
  expect(result.success).toEqual(true);

  // re-asserting the exact same assignment is a no-op success (idempotent), not an error
  result = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, participantId });
  expect(result.success).toEqual(true);
  expect(result.error).toBeUndefined();

  // the participant is still at drawPosition 1 exactly once (no duplication)
  const assignments: any[] =
    tournamentEngine.getState().tournamentRecords[gen.tournamentRecord.tournamentId].events[0].drawDefinitions[0]
      .structures[0].positionAssignments;
  const held = assignments.filter((a) => a.participantId === participantId);
  expect(held).toHaveLength(1);
  expect(held[0].drawPosition).toEqual(1);

  // conflict guard preserved: the same participant at a DIFFERENT (empty) position still errors
  result = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 2, participantId });
  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
});
