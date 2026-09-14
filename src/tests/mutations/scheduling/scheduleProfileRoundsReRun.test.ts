import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { AUTO_SCHEDULING_AUDIT } from '@Constants/auditConstants';

it('can auto schedule Round Robin draws respecting daily limits', () => {
  const venueProfiles = [
    {
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 8,
    },
  ];

  const eventProfiles = [{ drawProfiles: [{ drawSize: 16, idPrefix: 'R' }] }];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const {
    drawIds: [drawId],
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
  });

  const { tournamentId } = tournamentRecord;

  const {
    event: { eventId },
    drawDefinition,
  } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [{ structureId }],
  } = drawDefinition;

  // add first round of draw to scheduling profile
  let result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledDates).toEqual([startDate]);
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(8);

  let { matchUps } = tournamentEngine.allCompetitionMatchUps();
  let scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(8);

  let roundNumbers = scheduledMatchUps.reduce(
    (rn, matchUp) => (rn.includes(matchUp.roundNumber) ? rn : rn.concat(matchUp.roundNumber)),
    [],
  );
  expect(roundNumbers).toEqual([1]);

  // add second round of draw to scheduling profile
  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledDates).toEqual([startDate]);
  expect(result.overLimitMatchUpIds[startDate].length).toEqual(0);
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(4);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(12);

  roundNumbers = scheduledMatchUps.reduce(
    (rn, matchUp) => (rn.includes(matchUp.roundNumber) ? rn : rn.concat(matchUp.roundNumber)),
    [],
  );
  expect(roundNumbers).toEqual([1, 2]);

  const { tournamentRecord: tournament } = tournamentEngine.getTournament();
  const schedulingTimeItem = tournament.timeItems.filter(({ itemType }) => itemType === AUTO_SCHEDULING_AUDIT);
  expect(schedulingTimeItem.length).toEqual(2);
});
