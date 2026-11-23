import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const scenarios = [
  { drawSize: 128, participantsCount: 116, seedsCount: 32 },
  { drawSize: 64, participantsCount: 58, seedsCount: 16 },
  { drawSize: 32, participantsCount: 26, seedsCount: 6 },
];

it.each(scenarios)('will evenly distribute BYEs in large seeded structures', (scenario) => {
  const { drawSize, participantsCount, seedsCount } = scenario;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, participantsCount, seedsCount }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const positionAssignments = drawDefinition.structures[0].positionAssignments;
  const byeAssignments = positionAssignments.filter(({ bye }) => bye);
  expect(byeAssignments.length).toEqual(drawSize - participantsCount);

  const midPoint = drawSize / 2;
  const splitbyeAssignments = byeAssignments.reduce(
    (split, assignment) => {
      const index = assignment.drawPosition <= midPoint ? 0 : 1;
      split[index].push(assignment);
      return split;
    },
    [[], []],
  );
  expect(splitbyeAssignments[0].length).toEqual(splitbyeAssignments[1].length);
});
