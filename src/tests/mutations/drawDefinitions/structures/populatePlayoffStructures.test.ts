import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const scenarios = [
  {
    playoffAttributes: { '0-1': { name: 'Silver', abbreviation: 'S' } },
    roundProfiles: [{ '1': 1 }],
  },
];

it.each(scenarios)('will populate playoffStructures fed by MAIN first round', (scenario) => {
  const participantsCount = 10;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        participantsCount,
        completionGoal: 6,
        drawSize: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(drawDefinition.entries.length).toEqual(participantsCount);

  expect(drawDefinition.structures.length).toEqual(1);

  const structureId = drawDefinition.structures[0].structureId;
  const positionAssignments = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  }).positionAssignments;

  const byesCount = positionAssignments.filter(({ bye }) => bye).length;
  expect(byesCount).toEqual(6);

  const generateMethod = {
    method: 'generateAndPopulatePlayoffStructures',
    params: {
      playoffStructureNameBase: 'Playoff',
      structureId,
      ...scenario,
      drawId,
    },
  };

  const m1Result = tournamentEngine.executionQueue([generateMethod]);
  expect(m1Result.success).toEqual(true);

  const { links, structures, matchUpModifications } = m1Result.results[0];

  const filledAssignments = structures[0].positionAssignments.filter(({ bye, participantId }) => bye || participantId);
  expect(structures[0].positionAssignments.length).toEqual(8);
  expect(filledAssignments.length).toEqual(8);

  const attachMethod = {
    method: 'attachPlayoffStructures',
    params: {
      matchUpModifications,
      structures,
      drawId,
      links,
    },
  };
  const m2Result = tournamentEngine.executionQueue([attachMethod]);
  expect(m2Result.success).toEqual(true);
});
