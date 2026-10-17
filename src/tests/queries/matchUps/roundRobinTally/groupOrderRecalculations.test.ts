import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, vi } from 'vitest';

// getGroupOrder's sub-sort recalculated participant results once per tie group and directive. An unscoped
// recalculation (idsFilter: false) counts every matchUp and differs only by its grouping total, and an elimination
// draw ties hundreds of participants: one tally of a 512 draw made 809 identical full recalculations of all 511
// matchUps. Each distinct recalculation is now made once per group order.

const calls = vi.hoisted(() => ({ list: [] as { participantIds?: string[]; groupingTotal?: string }[] }));

vi.mock('@Query/matchUps/roundRobinTally/getParticipantResults', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getParticipantResults: (params) => {
      calls.list.push({ participantIds: params.participantIds, groupingTotal: params.groupingTotal });
      return actual.getParticipantResults(params);
    },
  };
});

function completedMatchUps(drawSize: number) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize }],
    completeAllMatchUps: true,
    setState: true,
  });
  return tournamentEngine.allTournamentMatchUps().matchUps;
}

test('a tally asks each distinct recalculation once', () => {
  const matchUps = completedMatchUps(64);

  calls.list = [];
  const result = tallyParticipantResults({ matchUps, generateReport: true });
  expect(result.order?.length).toEqual(64);

  const keys = calls.list.map(({ participantIds, groupingTotal }) =>
    [
      groupingTotal || '',
      ...(Array.isArray(participantIds) ? participantIds : []).toSorted((a, b) => a.localeCompare(b)),
    ].join('|'),
  );
  // the top-level tally and the group order's first unscoped recalculation are the only repeat
  const unscoped = calls.list.filter(({ participantIds }) => !participantIds?.length);
  expect(unscoped.length).toBeLessThanOrEqual(2);
  expect(keys.length - new Set(keys).size).toBeLessThanOrEqual(1);
  expect(calls.list.length).toBeLessThan(matchUps.length);
  // completing the fixture draw is the slow part, and under coverage beside other suites it outran 30s
}, 120_000);
