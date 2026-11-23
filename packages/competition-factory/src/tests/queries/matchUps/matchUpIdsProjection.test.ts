import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, vi } from 'vitest';

// constants and types
import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';

// A matchUpIds filter used to be applied after every matchUp in the structure was hydrated, so asking for
// one matchUp cost as much as asking for all of them (assessment 2026-10-16 H4). Only the named matchUps,
// and the duals their lines belong to, are hydrated now. The result must be exactly what the unfiltered
// query returns for the same ids.

const calls = vi.hoisted(() => ({ addMatchUpContext: 0 }));

vi.mock('@Query/matchUps/addMatchUpContext', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    addMatchUpContext: (params) => {
      calls.addMatchUpContext += 1;
      return actual.addMatchUpContext(params);
    },
  };
});

const scenarios = [
  { label: 'single elimination', drawProfiles: [{ drawSize: 32 }] },
  { label: 'consolation', drawProfiles: [{ drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION }] },
  { label: 'round robin', drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN }] },
  { label: 'doubles', drawProfiles: [{ drawSize: 16, eventType: DOUBLES }] },
  { label: 'TEAM', drawProfiles: [{ drawSize: 8, eventType: TEAM }] },
];

function idSets(matchUps: any[]) {
  const ids = matchUps.map(({ matchUpId }) => matchUpId);
  const line = matchUps.find(({ matchUpTieId }) => matchUpTieId);
  const sets: string[][] = [[ids[0]], [ids[1], ids.at(-1), ids[Math.floor(ids.length / 2)]], ['not-a-matchUpId']];
  if (line) sets.push([line.matchUpId], [line.matchUpTieId], [line.matchUpId, line.matchUpTieId]);
  return sets;
}

test.each(scenarios)(
  '$label: a matchUpIds filter returns exactly the unfiltered hydration of those ids',
  ({ drawProfiles }) => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles, completeAllMatchUps: true });
    const all: any = allTournamentMatchUps({ tournamentRecord }).matchUps;

    for (const matchUpIds of idSets(all)) {
      const expected = all.filter(({ matchUpId }) => matchUpIds.includes(matchUpId));
      const filtered: any = allTournamentMatchUps({ tournamentRecord, matchUpFilters: { matchUpIds } }).matchUps;
      expect(filtered).toEqual(expected);
    }
  },
);

test('only the named matchUps are hydrated, and a named line hydrates its dual', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 32 }] });
  const all: any = allTournamentMatchUps({ tournamentRecord }).matchUps;
  expect(all.length).toEqual(31);

  calls.addMatchUpContext = 0;
  allTournamentMatchUps({ tournamentRecord, matchUpFilters: { matchUpIds: [all[0].matchUpId, all[5].matchUpId] } });
  expect(calls.addMatchUpContext).toEqual(2);

  const team = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, eventType: TEAM }] });
  const teamMatchUps: any = allTournamentMatchUps({ tournamentRecord: team.tournamentRecord }).matchUps;
  const line = teamMatchUps.find(({ matchUpTieId }) => matchUpTieId);

  calls.addMatchUpContext = 0;
  const result: any = allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [line.matchUpId] },
    tournamentRecord: team.tournamentRecord,
  }).matchUps;
  expect(result.map(({ matchUpId }) => matchUpId)).toEqual([line.matchUpId]);
  // one dual of the draw's duals; its lines are hydrated inside it, by recursion the mock cannot see
  expect(teamMatchUps.filter(({ matchUpTieId }) => !matchUpTieId).length).toBeGreaterThan(1);
  expect(calls.addMatchUpContext).toEqual(1);
});

test('roundMatchUps follows the filtered matchUps, as before', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 16 }] });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structure = drawDefinition.structures[0];
  const roundTwo = structure.matchUps.filter(({ roundNumber }) => roundNumber === 2).map(({ matchUpId }) => matchUpId);

  const result: any = getAllStructureMatchUps({
    matchUpFilters: { matchUpIds: roundTwo },
    event: tournamentRecord.events[0],
    tournamentRecord,
    inContext: true,
    drawDefinition,
    structure,
  });
  expect(Object.keys(result.roundMatchUps)).toEqual(['2']);
  expect(result.roundMatchUps[2].map(({ matchUpId }) => matchUpId).toSorted((a, b) => a.localeCompare(b))).toEqual(
    roundTwo.toSorted((a, b) => a.localeCompare(b)),
  );
});
