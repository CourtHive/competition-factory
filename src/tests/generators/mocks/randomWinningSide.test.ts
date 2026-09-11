import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { instanceCount } from '@Tools/arrays';
import { it, expect } from 'vitest';

import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SINGLES } from '@Constants/eventConstants';
import {
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

it.each([
  [SINGLE_ELIMINATION, 16],
  [FEED_IN_CHAMPIONSHIP, 32],
  [ROUND_ROBIN, 16, { groupSize: 4 }],
  [ROUND_ROBIN, 16, { groupSize: 5 }],
  [FIRST_MATCH_LOSER_CONSOLATION, 32],
  [ROUND_ROBIN_WITH_PLAYOFF, 16, { groupSize: 4 }],
  [ROUND_ROBIN_WITH_PLAYOFF, 16, { groupSize: 5 }],
])('can complete matchUps with randomWinningSide', (drawType, drawSize, structureOptions = undefined) => {
  const { matchUps } = generateScenario({
    structureOptions,
    drawType,
    drawSize,
  });

  const winningSides = matchUps.map(({ winningSide }) => winningSide);
  const completed = matchUps.filter(({ winningSide }) => winningSide);
  const instances = instanceCount(winningSides);
  expect(instances[1] + instances[2]).toEqual(completed.length);
});

function generateScenario({ drawSize, structureOptions, drawType }) {
  const drawProfiles = [
    {
      drawSize,
      eventType: SINGLES,
      participantsCount: drawSize,
      matchUpFormat: FORMAT_STANDARD,
      structureOptions,
      drawType,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    randomWinningSide: true,
    drawProfiles,
  });

  const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return { drawDefinition, matchUps };
}
