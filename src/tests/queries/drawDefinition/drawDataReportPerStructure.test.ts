import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';

// getDrawData held `report` once per draw and assigned it only in the structures it tallied, so a structure
// it does not tally inherited the report of the one before it (first seen as a ROUND_ROBIN main returning its
// qualifying structure's report). Round robins are tallied and elimination structures are not, so the case that
// can leak is a round robin followed by its playoff.

test('a structure that is not tallied carries no report of another structure', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16 }],
    completeAllMatchUps: true,
    setState: true,
  });

  const { structures } = tournamentEngine.getDrawData({ drawId, refreshResults: true });
  const [groups, ...playoffs] = structures;
  expect(groups.report?.length).toBeGreaterThan(0);

  expect(playoffs.length).toBeGreaterThan(0);
  playoffs.forEach((playoff) => expect(playoff.report).toBeUndefined());
});
