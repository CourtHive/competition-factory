import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { it, expect } from 'vitest';

// constants
import { COMPASS } from '@Constants/drawDefinitionConstants';

const scenarios = [
  { drawType: COMPASS, stageSequences: [1], roundsOfPlay: [1, 2, 3, 4, 5] },
  { drawType: COMPASS, stageSequences: [2], roundsOfPlay: [2, 3, 4, 5] },
  { drawType: COMPASS, stageSequences: [3], roundsOfPlay: [3, 4, 5] },
];
it.each(scenarios)('calculates roundOfPlay for inContext matchUps', (scenario) => {
  const { drawType, stageSequences, roundsOfPlay } = scenario;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType }],
  });

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stageSequences },
  }).matchUps;
  expect(unique(matchUps.map((m) => m.roundOfPlay))).toEqual(roundsOfPlay);
});
