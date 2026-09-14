import { visualizeScheduledMatchUps } from '@Tests/testHarness/testUtilities/visualizeScheduledMatchUps';
import { getScheduledRoundsDetails } from '@Query/matchUps/scheduling/getScheduledRoundsDetails';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';

const u16MS = 'U16 Male Singles';
const showGlobalLog = false;
const d220101 = '2022-01-01';
const d220107 = '2022-01-07';

it('Can split rounds across multiple venues', () => {
  const startDate = d220101;
  const endDate = d220107;
  const firstVenueId = 'first';
  const secondVenueId = 'second';
  const venueProfiles = [
    {
      venueId: firstVenueId,
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 4,
    },
    {
      venueId: secondVenueId,
      venueName: 'venue 2',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 2,
    },
  ];

  const drawProfiles = [
    {
      participantsCount: 32,
      drawName: u16MS,
      drawId: 'idM16',
      idPrefix: 'M16',
      drawSize: 32,
    },
  ];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: firstVenueId,
          rounds: [
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-16',
              roundSegment: { segmentNumber: 1, segmentsCount: 2 },
            },
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-8',
              roundSegment: { segmentNumber: 1, segmentsCount: 2 },
            },
          ],
        },
        {
          venueId: secondVenueId,
          rounds: [
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-16',
              roundSegment: { segmentNumber: 2, segmentsCount: 2 },
            },
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-8',
              roundSegment: { segmentNumber: 2, segmentsCount: 2 },
            },
          ],
        },
      ],
    },
  ];

  const result = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(result.tournamentRecord);

  const { extension } = tournamentEngine.findExtension({
    name: APPLIED_POLICIES,
    discover: true, // discover extension on tournamentRecord or any passed parameters
  });
  expect(extension.name).toEqual(APPLIED_POLICIES);

  const { schedulingProfile: attachedSchedulingProfile } = tournamentEngine.getSchedulingProfile();

  expect(attachedSchedulingProfile[0].venues[0].rounds[0].roundNumber).toEqual(1);
  expect(attachedSchedulingProfile[0].venues[1].rounds[0].roundNumber).toEqual(1);
  expect(attachedSchedulingProfile[0].venues[0].rounds[0].roundSegment.segmentNumber).toEqual(1);
  expect(attachedSchedulingProfile[0].venues[1].rounds[0].roundSegment.segmentNumber).toEqual(2);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);

  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });
});

it('Can split rounds across multiple venues', () => {
  const startDate = d220101;
  const endDate = d220107;
  const firstVenueId = 'first';
  const secondVenueId = 'second';
  const venueProfiles = [
    {
      venueId: firstVenueId,
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 4,
    },
    {
      venueId: secondVenueId,
      venueName: 'venue 2',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 2,
    },
  ];

  const drawProfiles = [
    {
      participantsCount: 32,
      drawName: u16MS,
      drawId: 'idM16',
      idPrefix: 'M16',
      drawSize: 32,
    },
  ];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: firstVenueId,
          rounds: [
            {
              winnerFinishingPositionRange: '1-16',
              drawId: 'idM16',
            },
          ],
        },
        {
          venueId: secondVenueId,
          rounds: [
            {
              winnerFinishingPositionRange: '1-8',
              drawId: 'idM16',
            },
          ],
        },
      ],
    },
  ];

  const result = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(result.tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);

  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

  expect(Object.keys(result.schedulerResult.matchUpScheduleTimes).length).toEqual(24);
  expect(result.schedulerResult.skippedScheduleTimes[startDate].second.length).toEqual(0);
  expect(result.schedulerResult.scheduleTimesRemaining[startDate].first.length).toEqual(14);
  expect(result.schedulerResult.scheduleTimesRemaining[startDate].second.length).toEqual(7);
});

it('Can split rounds with multiple BYEs', () => {
  const secondVenueId = 'second';
  const firstVenueId = 'first';
  const startDate = d220101;
  const endDate = d220107;
  const venueProfiles = [
    {
      venueId: firstVenueId,
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 4,
    },
    {
      venueId: secondVenueId,
      venueName: 'venue 2',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 2,
    },
  ];

  const drawProfiles = [
    {
      participantsCount: 18,
      drawName: u16MS,
      drawId: 'idM16',
      idPrefix: 'M16',
      drawSize: 32,
    },
  ];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: firstVenueId,
          rounds: [
            {
              roundSegment: { segmentNumber: 1, segmentsCount: 2 },
              winnerFinishingPositionRange: '1-16',
              drawId: 'idM16',
            },
          ],
        },
        {
          venueId: secondVenueId,
          rounds: [
            {
              roundSegment: { segmentNumber: 2, segmentsCount: 2 },
              winnerFinishingPositionRange: '1-16',
              drawId: 'idM16',
            },
          ],
        },
      ],
    },
  ];

  const result = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(result.tournamentRecord);

  const { extension } = tournamentEngine.findExtension({
    name: APPLIED_POLICIES,
    discover: true, // discover extension on tournamentRecord or any passed parameters
  });
  expect(extension.name).toEqual(APPLIED_POLICIES);

  const { schedulingProfile: attachedSchedulingProfile } = tournamentEngine.getSchedulingProfile();

  const venues = attachedSchedulingProfile[0].venues;
  expect(venues[0].rounds[0].roundSegment.segmentNumber).toEqual(1);
  expect(venues[1].rounds[0].roundSegment.segmentNumber).toEqual(2);
  expect(venues[0].rounds[0].roundNumber).toEqual(1);
  expect(venues[1].rounds[0].roundNumber).toEqual(1);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps[0].schedule.venueId).not.toEqual(scheduledMatchUps[1].schedule.venueId);
  expect(scheduledMatchUps.length).toEqual(2);

  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

  const { tournamentRecords } = tournamentEngine.getState();

  for (const index of [0, 1]) {
    const { scheduledRoundsDetails } = getScheduledRoundsDetails({
      tournamentRecords,
      rounds: venues[index].rounds,
    });
    expect(scheduledRoundsDetails?.[0].matchUpIds.length).toEqual(1);
  }
});
