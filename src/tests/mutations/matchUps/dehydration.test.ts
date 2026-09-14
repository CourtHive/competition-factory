import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as tools from '@Assemblies/tools';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it('can dehydrate matchUps in tournamentRecords', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }, { drawSize: 8, drawType: ROUND_ROBIN }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const unhydratedMatchUps = allTournamentMatchUps({
    tournamentRecord,
    inContext: false,
  }).matchUps;

  const allUnhydrated = unhydratedMatchUps?.every(
    (matchUp) => matchUp.matchUpFormat && !matchUp.eventName && !matchUp.sides && matchUp.score,
  );

  expect(allUnhydrated).toEqual(true);

  // hydrate matchUps in tournamentRecord
  for (const event of tournamentRecord.events || []) {
    for (const drawDefinition of event.drawDefinitions || []) {
      for (const structure of drawDefinition.structures || []) {
        const matchUpIds = structure.matchUps?.map(({ matchUpId }) => matchUpId);

        if (matchUpIds) {
          structure.matchUps = matchUps.filter(({ matchUpId }) => matchUpIds.includes(matchUpId));
        }

        // check for contained structures
        for (const childStructure of structure.structures || []) {
          const matchUpIds = childStructure.matchUps?.map(({ matchUpId }) => matchUpId);
          childStructure.matchUps = matchUps.filter(({ matchUpId }) => matchUpIds.includes(matchUpId));
        }
      }
    }
  }

  const hydratedMatchUps = allTournamentMatchUps({
    tournamentRecord,
    inContext: false,
  }).matchUps;

  const allHydrated = hydratedMatchUps?.every(
    (matchUp) => matchUp.matchUpFormat && matchUp.eventName && matchUp.sides && matchUp.score,
  );

  expect(allHydrated).toEqual(true);

  let matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

  expect(matchUp.sides).not.toBeUndefined();
  expect(matchUp.eventName).not.toBeUndefined();

  const result = tools.dehydrateMatchUps({ tournamentRecord });
  expect(result.success).toEqual(true);

  matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

  expect(matchUp.winningSide).not.toBeUndefined();
  expect(matchUp.matchUpFormat).toBeUndefined(); // removed because inherited matchUpFormat was identical
  expect(matchUp.score).not.toBeUndefined();
  expect(matchUp.eventName).toBeUndefined();
  expect(matchUp.sides).toBeUndefined();

  tournamentEngine.setState(tournamentRecord);

  const newlyHydratedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  const allNewlyHydrated = newlyHydratedMatchUps.every(
    (matchUp) => matchUp.matchUpFormat && matchUp.winningSide && matchUp.eventName && matchUp.sides && matchUp.score,
  );

  expect(allNewlyHydrated).toEqual(true);
});
