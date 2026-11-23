import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { processAccessors } from '@Query/drawDefinition/processAccessors';
import { intersection } from '@Tools/arrays';

export function getConflicts({ tournamentRecord, structureId, keysToTest, drawId }) {
  const matchUps = allTournamentMatchUps({
    contextFilters: { drawIds: [drawId], structureIds: [structureId] },
    matchUpFilters: { roundNumbers: [1] },
    tournamentRecord,
  }).matchUps;

  const sideParticipants = matchUps?.map(({ sides }) =>
    sides?.map((s) =>
      keysToTest.flatMap(({ key }) => processAccessors({ accessors: key.split('.'), value: s.participant })),
    ),
  );

  const conflicts = sideParticipants
    ?.map((pairing) => pairing && intersection(pairing[0], pairing[1]).length)
    .filter(Boolean);

  return { conflicts, sideParticipants };
}
