import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';

const startDate = '2024-01-15';
const schedule = { scheduledDate: startDate, scheduledTime: '10:00' };

const scheduleOf = (matchUpId: string) =>
  tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpIds: [matchUpId] } }).matchUps[0].schedule;

it('B4: a { matchUpId, schedule } detail without a tournamentId is scheduled, not dropped in silence', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, idPrefix: 'm' }],
    endDate: startDate,
    setState: true,
    startDate,
  });

  // the documented detail shape; it used to be filtered out by tournamentId and return success with scheduled: 0
  const result = tournamentEngine.bulkScheduleMatchUps({ matchUpDetails: [{ matchUpId: 'm-1-1', schedule }] });
  expect(result.success).toEqual(true);
  expect(result.scheduled).toEqual(1);
  expect(result.notFoundMatchUpIds).toBeUndefined();
  expect(result.skippedMatchUpIds).toBeUndefined();
  expect(scheduleOf('m-1-1').scheduledTime).toEqual('10:00');
});

it('B4: a detail is found in the tournament that holds it when several are in state', () => {
  const first = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, idPrefix: 'a' }],
    endDate: startDate,
    startDate,
  }).tournamentRecord;
  const second = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, idPrefix: 'b' }],
    endDate: startDate,
    startDate,
  }).tournamentRecord;
  tournamentEngine.setState([first, second]);

  const result = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: [
      { matchUpId: 'a-1-1', schedule },
      { matchUpId: 'b-1-2', schedule },
    ],
  });
  expect(result.scheduled).toEqual(2);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps({ matchUpFilters: { matchUpIds: ['a-1-1', 'b-1-2'] } });
  const scheduled = matchUps
    .map(({ matchUpId, tournamentId, schedule }) => [matchUpId, tournamentId, schedule.scheduledTime])
    .sort((a, b) => a[0].localeCompare(b[0]));
  expect(scheduled).toEqual([
    ['a-1-1', first.tournamentId, '10:00'],
    ['b-1-2', second.tournamentId, '10:00'],
  ]);
});

it('B4: what is not scheduled is reported: BYE and completed are skipped, unknown ids are not found', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, participantsCount: 3, idPrefix: 'm' }],
    endDate: startDate,
    setState: true,
    startDate,
  });
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const byeMatchUpId = matchUps.find(({ matchUpStatus }) => matchUpStatus === BYE).matchUpId;
  const playedMatchUpId = matchUps.find(({ matchUpStatus }) => matchUpStatus !== BYE).matchUpId;

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });
  const completion = tournamentEngine.setMatchUpStatus({ outcome, matchUpId: playedMatchUpId, drawId });
  expect(completion.success).toEqual(true);

  const result = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: [
      { matchUpId: byeMatchUpId, schedule },
      { matchUpId: playedMatchUpId, schedule },
      { matchUpId: 'm-2-1', schedule },
      { matchUpId: 'bogus', schedule },
      { matchUpId: 'm-2-1', tournamentId: 'bogus', schedule },
    ],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduled).toEqual(1);
  // a BYE and a completed matchUp are deliberately not scheduled, and are now named
  expect([...result.skippedMatchUpIds].sort((a, b) => a.localeCompare(b))).toEqual(
    [byeMatchUpId, playedMatchUpId].sort((a, b) => a.localeCompare(b)),
  );
  // a matchUpId no tournament holds, and a detail naming a tournament not in state
  expect(result.notFoundMatchUpIds).toEqual(['bogus', 'm-2-1']);
  expect(scheduleOf(byeMatchUpId).scheduledTime).toBeUndefined();
  expect(scheduleOf('m-2-1').scheduledTime).toEqual('10:00');
});

it('B4: matchUpIds handed to bulkScheduleTournamentMatchUps report skips and misses the same way', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, participantsCount: 3, idPrefix: 'm' }],
    endDate: startDate,
    setState: true,
    startDate,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const byeMatchUpId = matchUps.find(({ matchUpStatus }) => matchUpStatus === BYE).matchUpId;

  const result = tournamentEngine.bulkScheduleTournamentMatchUps({
    matchUpIds: [byeMatchUpId, 'm-2-1', 'bogus'],
    schedule,
  });
  expect(result.success).toEqual(true);
  expect(result.scheduled).toEqual(1);
  expect(result.skippedMatchUpIds).toEqual([byeMatchUpId]);
  expect(result.notFoundMatchUpIds).toEqual(['bogus']);
});
