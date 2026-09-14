import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it('can determine containedStructures for tournamentRecords, events, and drawDefinitions', () => {
  const drawProfiles = [
    {
      drawType: ROUND_ROBIN,
      drawSize: 32,
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });

  validate(getContainedStructures({ tournamentRecord }));
  validate(getContainedStructures({ drawDefinition }));
  validate(getContainedStructures({ event }));

  function validate(result) {
    const { containedStructures, containerStructures } = result;
    const containerStructureIds = Object.keys(containedStructures);
    const containedStructureIds = Object.keys(containerStructures);
    expect(containerStructureIds.length).toEqual(1);
    expect(containedStructureIds.length).toEqual(8);
    expect(containedStructures[containerStructureIds[0]].length).toEqual(8);
    containedStructureIds.forEach((structureId) =>
      expect(containerStructures[structureId]).toEqual(containerStructureIds[0]),
    );
  }
});
