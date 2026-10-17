import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

// getDrawData held `report` once per draw and assigned it only in the structures it tallied, so a structure
// it does not tally inherited the report of the one before it: under refreshResults, a ROUND_ROBIN main
// returned its qualifying structure's report.

test('a structure that is not tallied carries no report of another structure', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }],
        drawType: ROUND_ROBIN,
        drawSize: 16,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { structures } = tournamentEngine.getDrawData({ drawId, refreshResults: true });
  const [qualifying, main] = structures;
  expect(qualifying.stage).toEqual('QUALIFYING');
  expect(qualifying.report?.length).toBeGreaterThan(0);

  expect(main.stage).toEqual('MAIN');
  expect(main.report).toBeUndefined();
});
