import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { POSITION_ACTIONS } from '@Constants/extensionConstants';

it('records position action telemetry on a draw definition that has no structures array', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, automated: false }],
  });

  // the caller supplies the structure; the draw definition itself lists none
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structure = drawDefinition.structures[0];
  const { drawPosition } = structure.positionAssignments.find(({ participantId, bye }) => !participantId && !bye);
  delete drawDefinition.structures;
  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.assignDrawPositionBye({
    structureId: structure.structureId,
    isPositionAction: true,
    drawPosition,
    structure,
    drawId,
  });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);

  const { drawDefinition: updated } = tournamentEngine.getEvent({ drawId });
  const telemetry = updated.extensions.find(({ name }) => name === POSITION_ACTIONS);
  // no MAIN structure to snapshot, so the action is the only record
  expect(telemetry.value.map(({ name }) => name)).toEqual(['assignDrawPositionBye']);
});
