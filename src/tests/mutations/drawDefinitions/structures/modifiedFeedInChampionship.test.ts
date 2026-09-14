import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MFIC } from '@Constants/drawDefinitionConstants';

it('will not feed main final in MFIC with drawSize 4', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: MFIC, drawSize: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.links.length).toEqual(1);
  expect(drawDefinition.structures[1].matchUps.length).toEqual(1);
});

it('will feed only 2nd round for MFIC with drawSize 8', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: MFIC, drawSize: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.links.length).toEqual(2);
  expect(drawDefinition.structures[1].matchUps.length).toEqual(5);
});

it('will feed only 2nd round for MFIC with drawSize 16', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: MFIC, drawSize: 16 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.links.length).toEqual(2);
  expect(drawDefinition.structures[1].matchUps.length).toEqual(11);
});
