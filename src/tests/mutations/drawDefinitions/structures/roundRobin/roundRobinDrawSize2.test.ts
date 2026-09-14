import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

it('will generate SINGLE_ELIMINATION when drawSize: 2', () => {
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 2 }],
  });
  expect(result.success).toEqual(true);
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(drawDefinition.drawType).toEqual(SINGLE_ELIMINATION);
});
