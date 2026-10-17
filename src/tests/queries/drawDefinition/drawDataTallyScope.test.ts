import { POLICY_ROUND_ROBIN_TALLY_TOC } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_TOC';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, vi } from 'vitest';

// constants
import {
  AD_HOC,
  COMPASS,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

// getDrawData tallied every structure EXCEPT a round robin under refreshResults: it ran the round robin tally on
// elimination structures, where it ranks hundreds of participants nothing reads, and returned the stored tally for
// the round robins it was designed for ("cannot refresh for round robins"). It now tallies the structures the score
// path keeps a tally for (round robin groups, ad hoc, lucky) and never an elimination structure.

const tallies = vi.hoisted(() => ({ count: 0 }));

vi.mock('@Query/matchUps/roundRobinTally/tallyParticipantResults', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    tallyParticipantResults: (params) => {
      tallies.count += 1;
      return actual.tallyParticipantResults(params);
    },
  };
});

const refresh = { refreshResults: true, allParticipantResults: true };

function completedDraw(drawProfile: any) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [drawProfile],
    completeAllMatchUps: true,
    setState: true,
  });
  return drawId;
}

test.each([SINGLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION, COMPASS])(
  'a %s draw is not tallied, however results are requested',
  (drawType) => {
    const drawId = completedDraw({ drawSize: 32, drawType });
    tallies.count = 0;
    const { structures } = tournamentEngine.getDrawData({ drawId, ...refresh, pressureRating: true });
    expect(tallies.count).toEqual(0);
    structures.forEach((structure) => {
      expect(structure.participantResults.length).toBeGreaterThan(0);
      structure.participantResults.forEach(({ participantResult }) => expect(participantResult).toBeUndefined());
      expect(structure.report).toBeUndefined();
    });
  },
);

test('a round robin is refreshed group by group and agrees with the stored tally', () => {
  const drawId = completedDraw({ drawSize: 16, drawType: ROUND_ROBIN, structureOptions: { groupSize: 4 } });
  const stored = tournamentEngine.getDrawData({ drawId }).structures[0].participantResults;

  tallies.count = 0;
  const refreshed = tournamentEngine.getDrawData({ drawId, refreshResults: true }).structures[0];
  expect(tallies.count).toEqual(4); // one per group
  expect(refreshed.participantResults).toEqual(stored);
  expect(refreshed.report?.length).toBeGreaterThan(0);
});

test('a refresh reads the matchUps, not a stored tally that has gone stale', () => {
  const drawId = completedDraw({ drawSize: 8, drawType: ROUND_ROBIN, structureOptions: { groupSize: 4 } });
  const expected = tournamentEngine.getDrawData({ drawId }).structures[0].participantResults;

  // a stale stored tally: the record says one participant won 99 matchUps
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const [assignment] = getPositionAssignments({ structure: drawDefinition.structures[0] }).positionAssignments ?? [];
  const record: any = tournamentEngine.getTournament().tournamentRecord;
  const storedAssignment = record.events[0].drawDefinitions[0].structures[0].structures
    .flatMap((group) => group.positionAssignments)
    .find((pa) => pa.participantId === assignment.participantId);
  storedAssignment.tally = { ...storedAssignment.tally, matchUpsWon: 99 };
  tournamentEngine.setState(record);

  const read = (params) =>
    tournamentEngine
      .getDrawData({ drawId, ...params })
      .structures[0].participantResults.find((pr) => pr.participantId === assignment.participantId).participantResult;
  expect(read({}).matchUpsWon).toEqual(99);
  expect(read({ refreshResults: true })).toEqual(
    expected.find((pr) => pr.participantId === assignment.participantId).participantResult,
  );
});

test('a refresh applies the tally policy attached to the draw, as the stored tally does', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN, structureOptions: { groupSize: 4 } }],
    policyDefinitions: POLICY_ROUND_ROBIN_TALLY_TOC,
    completeAllMatchUps: true,
    setState: true,
  });
  const stored = tournamentEngine.getDrawData({ drawId }).structures[0].participantResults;
  const refreshed = tournamentEngine.getDrawData({ drawId, refreshResults: true }).structures[0].participantResults;
  expect(refreshed).toEqual(stored);
});

test('round robin groups are tallied and their playoff is not', () => {
  const drawId = completedDraw({ drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF });
  tallies.count = 0;
  const { structures } = tournamentEngine.getDrawData({ drawId, ...refresh });
  const [groups, ...playoffs] = structures;
  expect(tallies.count).toEqual(4);
  expect(groups.participantResults.every(({ participantResult }) => participantResult)).toEqual(true);
  expect(playoffs.length).toBeGreaterThan(0);
  playoffs.forEach((playoff) =>
    playoff.participantResults.forEach(({ participantResult }) => expect(participantResult).toBeUndefined()),
  );
});

test('an ad hoc structure is still tallied', () => {
  const drawId = completedDraw({ drawSize: 8, drawType: AD_HOC, roundsCount: 3 });
  tallies.count = 0;
  const { structures } = tournamentEngine.getDrawData({ drawId, ...refresh, pressureRating: true });
  expect(tallies.count).toEqual(1);
  const results = structures[0].participantResults.map(({ participantResult }) => participantResult);
  expect(results.filter(Boolean).length).toEqual(8);
});
