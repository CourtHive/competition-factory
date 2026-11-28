import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POSITION_ACTIONS } from '@Constants/extensionConstants';

it('records position action telemetry on a draw definition that has no structures array', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, automated: false }],
  });

  // the engine's own caller supplies the structure to the writer; the draw definition itself lists none
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structure = drawDefinition.structures[0];
  const { drawPosition } = structure.positionAssignments.find(({ participantId, bye }) => !participantId && !bye);
  delete drawDefinition.structures;
  tournamentEngine.setState(tournamentRecord, false);

  // a public call takes ids, never the structure
  const refused: any = tournamentEngine.assignDrawPositionBye({
    structureId: structure.structureId,
    drawPosition,
    structure,
    drawId,
  });
  expect(refused.error).toEqual(INVALID_VALUES);

  const result = assignDrawPositionBye({
    tournamentRecord,
    event: tournamentRecord.events[0],
    structureId: structure.structureId,
    isPositionAction: true,
    drawDefinition,
    drawPosition,
    structure,
  });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);

  const { drawDefinition: updated } = tournamentEngine.getEvent({ drawId });
  const telemetry = updated.extensions.find(({ name }) => name === POSITION_ACTIONS);
  // no MAIN structure to snapshot, so the action is the only record
  expect(telemetry.value.map(({ name }) => name)).toEqual(['assignDrawPositionBye']);
});
