import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/eventConstants';

it('can auto schedule Round Robin draws respecting daily limits', () => {
  const venueProfiles = [
    {
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 8,
    },
  ];

  const eventProfiles = [
    {
      eventName: 'Event Test',
      eventType: SINGLES,
      drawProfiles: [
        {
          drawSize: 16,
          drawType: ROUND_ROBIN,
        },
      ],
    },
  ];
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
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });

  const { tournamentId } = tournamentRecord;

  // add first round of draw to scheduling profile
  const {
    event: { eventId },
    drawDefinition,
  } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [{ structureId }],
  } = drawDefinition;

  let result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  // add second round of draw to scheduling profile
  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  // add third round of draw to scheduling profile
  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 3 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledDates).toEqual([startDate]);
  expect(result.overLimitMatchUpIds[startDate].length).toEqual(8);
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(16);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(16);

  const roundNumbers = scheduledMatchUps.reduce(
    (rn, matchUp) => (rn.includes(matchUp.roundNumber) ? rn : rn.concat(matchUp.roundNumber)),
    [],
  );
  expect(roundNumbers).toEqual([1, 2]);
});

it('can auto schedule Round Robin draws without daily limits', () => {
  const venueProfiles = [
    {
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 8,
    },
  ];

  const eventProfiles = [
    {
      eventName: 'Event Test',
      eventType: SINGLES,
      drawProfiles: [
        {
          drawSize: 16,
          drawType: ROUND_ROBIN,
        },
      ],
    },
  ];
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

  // add first round of draw to scheduling profile
  const {
    event: { eventId },
    drawDefinition,
  } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [{ structureId }],
  } = drawDefinition;

  let result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  // add second round of draw to scheduling profile
  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  // add third round of draw to scheduling profile
  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 3 },
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
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(24);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(24);

  const roundNumbers = scheduledMatchUps.reduce(
    (rn, matchUp) => (rn.includes(matchUp.roundNumber) ? rn : rn.concat(matchUp.roundNumber)),
    [],
  );
  expect(roundNumbers).toEqual([1, 2, 3]);
});
