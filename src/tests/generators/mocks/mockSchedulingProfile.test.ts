import { visualizeScheduledMatchUps } from '@Tests/testHarness/testUtilities/visualizeScheduledMatchUps';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { extractDate } from '@Tools/dateTime';
import { expect, it } from 'vitest';

// Fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';

it('can schedule all matchUps in first round with only drawId', () => {
  const venueId = 'venueId';
  const drawId = 'drawId';

  const startTime = '08:00';
  const endTime = '20:00';

  const drawProfiles = [{ idPrefix: 'm', drawId, drawSize: 32 }];
  const startDate = extractDate(new Date().toISOString());

  const venueProfiles = [
    {
      courtNames: ['One', 'Two', 'Three'],
      courtIds: ['c1', 'c2', 'c3'],
      venueAbbreviation: 'VNU',
      venueName: 'Venue',
      courtsCount: 8,
      startTime,
      endTime,
      venueId,
    },
  ];

  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId,
          rounds: [
            { drawId, roundNumber: 1 },
            { drawId, roundNumber: 2 },
          ],
        },
      ],
    },
  ];

  const { schedulerResult } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    autoSchedule: true,
    schedulingProfile,
    setState: true,
    venueProfiles,
    drawProfiles,
    startDate,
  });

  expect(Object.values(schedulerResult.matchUpScheduleTimes).length).toEqual(24);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps();
  const scheduledMatchUps = matchUps?.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(24);
  const schedule = scheduledMatchUps[0].schedule;
  expect(schedule.venueAbbreviation).toEqual('VNU');

  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog: false });
});
