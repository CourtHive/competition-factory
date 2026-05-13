import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { DISABLED } from '@Constants/extensionConstants';

it('can disable and enable courts and venues', () => {
  const startDate = '2022-09-24';
  const endDate = '2022-09-28';

  const venueProfiles = [
    { venueId: 'venueId1', courtsCount: 4 },
    { venueId: 'venueId2', courtsCount: 8 },
  ];
  let { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId: 'drawId1', drawSize: 32 },
      { drawId: 'drawId2', drawSize: 32 },
    ],
    venueProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);
  // Pin scheduling to legacy 90/0 timing. POLICY_SCHEDULING_DEFAULT is now
  // the implicit fallback; its longer recoveries and daily limits would
  // reduce how many matchUps fit per day below the test's >= 50 threshold.
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      scheduling: {
        defaultTimes: {
          averageTimes: [{ minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 0 } }],
        },
      },
    },
  });

  const { rounds } = tournamentEngine.getRounds();
  const draw1rounds = rounds.filter(({ drawId }) => drawId === 'drawId1');
  const draw2rounds = rounds.filter(({ drawId }) => drawId === 'drawId2');
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        { venueId: 'venueId1', rounds: draw1rounds },
        { venueId: 'venueId2', rounds: draw2rounds },
      ],
    },
  ];

  let result = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds();
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allCompetitionMatchUps();
  let scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toBeGreaterThanOrEqual(50);
  result = tournamentEngine.clearScheduledMatchUps();
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(0);

  result = tournamentEngine.getVenuesAndCourts();
  expect([result.courts.length, result.venues.length]).toEqual([12, 2]);
  const courtIds = result.courts.map(({ courtId }) => courtId);

  result = tournamentEngine.disableVenues({ venueIds: ['venueId1'] });
  expect(result.success).toEqual(true);
  tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  expect(tournamentRecord.venues[0].extensions[0].name).toEqual(DISABLED);
  result = tournamentEngine.getVenuesAndCourts({ ignoreDisabled: true });
  expect([result.courts.length, result.venues.length]).toEqual([8, 1]);

  result = tournamentEngine.enableVenues({ venueIds: ['venueId1'] });
  expect(result.success).toEqual(true);
  tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  expect(tournamentRecord.venues[0].extensions).toEqual([]);

  result = tournamentEngine.disableVenues({ venueIds: ['venueId1'] });
  expect(result.success).toEqual(true);
  tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  expect(tournamentRecord.venues[0].extensions[0].name).toEqual(DISABLED);

  result = tournamentEngine.scheduleProfileRounds();
  expect(result.success).toEqual(true);
  matchUps = tournamentEngine.allCompetitionMatchUps().matchUps;
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toBeLessThan(40);

  result = tournamentEngine.enableVenues({ enableAll: true });
  expect(result.success).toEqual(true);
  tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  expect(tournamentRecord.venues[0].extensions.length).toEqual(0);

  result = tournamentEngine.clearScheduledMatchUps();
  expect(result.success).toEqual(true);
  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(0);

  const targetCourtIds = courtIds.filter((_, i) => i % 2);
  result = tournamentEngine.disableCourts({ courtIds: targetCourtIds });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
  });
  expect([result.courts.length, result.venues.length]).toEqual([6, 2]);

  result = tournamentEngine.scheduleProfileRounds();
  expect(result.success).toEqual(true);
  matchUps = tournamentEngine.allCompetitionMatchUps().matchUps;
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toBeLessThan(50);

  result = tournamentEngine.getVenuesAndCourts();
  expect([result.courts.length, result.venues.length]).toEqual([12, 2]);
  let disabledCourts = result.courts.filter((court) => court.extensions?.length);
  expect(disabledCourts.length).toEqual(6);

  result = tournamentEngine.enableCourts({ enableAll: true });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getVenuesAndCourts();
  expect([result.courts.length, result.venues.length]).toEqual([12, 2]);
  disabledCourts = result.courts.filter((court) => court.extensions?.length);
  expect(disabledCourts.length).toEqual(0);

  result.courts.forEach((court) => expect(court.dateAvailability.length).toEqual(6));

  result = tournamentEngine.getVenuesAndCourts();
  expect([result.courts.length, result.venues.length]).toEqual([12, 2]);
  disabledCourts = result.courts.filter((court) => court.extensions?.length);
  expect(disabledCourts.length).toEqual(0);

  result.courts.forEach((court) => expect(court.dateAvailability.length).toEqual(6));

  result = tournamentEngine.disableCourts({
    dates: [startDate, endDate],
    courtIds: targetCourtIds,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
  });
  result.courts.forEach((court) => {
    if (targetCourtIds.includes(court.courtId)) {
      expect(court.dateAvailability.length).toEqual(3);
    } else {
      expect(court.dateAvailability.length).toEqual(6);
    }
  });

  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
  });
  result.courts.forEach((court) => {
    if (targetCourtIds.includes(court.courtId)) {
      expect(court.dateAvailability.length).toEqual(3);
    } else {
      expect(court.dateAvailability.length).toEqual(6);
    }
  });

  // specifying a date with ignoreDisabled will filter out courts which have no dateAvailability for given date
  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
    dates: [startDate],
  });
  expect([result.courts.length, result.venues.length]).toEqual([6, 2]);
  let dateAvailabilityCounts = result.courts.map((court) => court.dateAvailability.length);
  expect(dateAvailabilityCounts).toEqual([6, 6, 6, 6, 6, 6]);

  // re-enable startDate
  result = tournamentEngine.enableCourts({
    dates: [startDate],
    enableAll: true,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
  });
  expect([result.courts.length, result.venues.length]).toEqual([12, 2]);
  dateAvailabilityCounts = result.courts.map((court) => court.dateAvailability.length);
  expect(dateAvailabilityCounts).toEqual([6, 4, 6, 4, 6, 4, 6, 4, 6, 4, 6, 4]);

  // re-enable endDate
  result = tournamentEngine.enableCourts({
    dates: [endDate],
    enableAll: true,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
  });
  dateAvailabilityCounts = result.courts.map((court) => court.dateAvailability.length);
  expect(dateAvailabilityCounts).toEqual([6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5]);

  result = tournamentEngine.disableCourts({
    courtIds: targetCourtIds,
    dates: [startDate],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
  });
  dateAvailabilityCounts = result.courts.map((court) => court.dateAvailability.length);
  expect(dateAvailabilityCounts).toEqual([6, 4, 6, 4, 6, 4, 6, 4, 6, 4, 6, 4]);

  // finally re-enable all courts
  result = tournamentEngine.enableCourts({ enableAll: true });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getVenuesAndCourts({
    ignoreDisabled: true,
  });
  result.courts.forEach((court) => {
    expect(court.dateAvailability.length).toEqual(6);
  });
});
