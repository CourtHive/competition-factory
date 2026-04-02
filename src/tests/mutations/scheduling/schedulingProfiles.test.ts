import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

import { INVALID_DATE, INVALID_VALUES, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';

const d220101 = '2022-01-01';
const d220203 = '2022-01-03';

test.each([tournamentEngine])('it can set scheulingProfile', async (competitionEngine) => {
  const drawProfiles = [{ drawSize: 16 }];
  const venueProfiles = [
    { venueName: 'venue 1', courtsCount: 4 },
    { venueName: 'venue 2', courtsCount: 8 },
  ];
  const { tournamentRecord: firstRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    venueProfiles,
    startDate: d220101,
    endDate: '2022-01-07',
  });
  const { tournamentRecord: secondRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2022-01-02',
    endDate: '2022-01-10',
  });
  competitionEngine.setState([firstRecord, secondRecord]);

  const { startDate, endDate } = competitionEngine.getCompetitionDateRange();
  expect(startDate).toEqual(d220101);
  expect(endDate).toEqual('2022-01-10');

  const { venues, venueIds } = competitionEngine.getCompetitionVenues();
  expect(venues.length).toEqual(2);
  expect(venueIds.length).toEqual(2);

  const { matchUps } = competitionEngine.allCompetitionMatchUps();
  const { tournamentId, eventId, drawId, structureId, roundNumber } = matchUps[0];

  let result = competitionEngine.validateSchedulingProfile({
    schedulingProfile: [
      {
        scheduleDate: d220203,
        venues: [
          {
            venueId: venueIds[0],
            rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber }],
          },
        ],
      },
    ],
  });
  expect(result.valid).toEqual(true);

  result = competitionEngine.validateSchedulingProfile({
    schedulingProfile: [
      {
        scheduleDate: d220203,
        venues: [
          {
            venueId: venueIds[0],
            rounds: [
              {
                tournamentId,
                eventId,
                drawId,
                structureId,
                roundNumber,
                roundSegment: {},
              },
            ],
          },
        ],
      },
    ],
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = competitionEngine.validateSchedulingProfile({
    schedulingProfile: [
      {
        scheduleDate: d220203,
        venues: [
          {
            venueId: venueIds[0],
            rounds: [
              {
                tournamentId,
                eventId,
                drawId,
                structureId,
                roundNumber,
                roundSegment: { segmentNumber: 1, segmentsCount: 4 },
              },
            ],
          },
        ],
      },
    ],
  });
  expect(result.valid).toEqual(true);

  result = competitionEngine.validateSchedulingProfile({
    schedulingProfile: [
      {
        scheduleDate: d220203,
        venues: [
          {
            venueId: venueIds[0],
            rounds: [
              {
                tournamentId,
                eventId,
                drawId,
                structureId,
                roundNumber,
                roundSegment: { segmentNumber: 1, segmentsCount: 3 }, // segmentsCount must be power of 2
              },
            ],
          },
        ],
      },
    ],
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = competitionEngine.validateSchedulingProfile({
    schedulingProfile: [
      {
        scheduleDate: d220203,
        venues: [
          {
            venueId: venueIds[0],
            rounds: [
              {
                tournamentId,
                eventId,
                drawId,
                structureId,
                roundNumber,
                roundSegment: { segmentNumber: 5, segmentsCount: 4 }, // segmentNumber must be less than segmentsCount
              },
            ],
          },
        ],
      },
    ],
  });
  expect(result.error).toEqual(INVALID_VALUES);

  let { schedulingProfile } = competitionEngine.getSchedulingProfile();
  expect(schedulingProfile).toEqual([]);

  result = competitionEngine.addSchedulingProfileRound({
    round: { drawId: 'drawId' },
    scheduleDate: d220203,
    venueId: venueIds[0],
  });
  expect(result.error).toEqual(INVALID_VALUES);

  let modifications, issues;
  ({ schedulingProfile, modifications, issues } = competitionEngine.getSchedulingProfile());

  expect(schedulingProfile).toEqual([]);
  expect(modifications).toEqual(0);
  expect(issues).toEqual(undefined);

  result = competitionEngine.addSchedulingProfileRound({
    round: { eventId, drawId },
    scheduleDate: '2022-01-13',
    venueId: venueIds[0],
  });
  expect(result.error).toEqual(INVALID_DATE);

  result = competitionEngine.addSchedulingProfileRound({
    round: { eventId, drawId },
    scheduleDate: d220203,
    venueId: venueIds[0],
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = competitionEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber },
    scheduleDate: d220203,
    venueId: venueIds[0],
  });
  expect(result.success).toEqual(true);

  ({ schedulingProfile } = competitionEngine.getSchedulingProfile());

  result = competitionEngine.validateSchedulingProfile({ schedulingProfile });
  expect(result.valid).toEqual(true);

  // undefined { schedulingProfile } will remove all relevant extensions
  result = competitionEngine.setSchedulingProfile({});
  expect(result.success).toEqual(true);

  result = competitionEngine.setSchedulingProfile({ schedulingProfile: {} });
  expect(result.error).toEqual(INVALID_VALUES);

  result = competitionEngine.setSchedulingProfile({ schedulingProfile: [] });
  expect(result.success).toEqual(true);

  result = competitionEngine.getVenuesAndCourts();
  expect(result.venues.length).toEqual(2);
  expect(result.courts.length).toEqual(12);

  result = tournamentEngine.setTournamentId(firstRecord.tournamentId);
  expect(result.success).toEqual(true);

  result = tournamentEngine.deleteVenues();
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.deleteVenues({});
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.deleteVenues({ venueIds: 'foo' });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.deleteVenues({ venueIds: [] });
  expect(result.success).toEqual(true);
  result = tournamentEngine.deleteVenues({ venueIds });
  expect(result.success).toEqual(true);

  result = competitionEngine.getVenuesAndCourts();
  expect(result.venues.length).toEqual(0);
  expect(result.courts.length).toEqual(0);

  result = tournamentEngine.setSchedulingProfile({});
  expect(result.success).toEqual(true);

  result = tournamentEngine.setSchedulingProfile({ schedulingProfile: {} });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.setSchedulingProfile({ schedulingProfile: [] });
  expect(result.success).toEqual(true);
});

test.each([tournamentEngine])(
  'validateSchedulingProfile can identify invalid schedulingProfiles',
  async (competitionEngine) => {
    const venueProfiles = [
      { venueName: 'venue 1', courtsCount: 4 },
      { venueName: 'venue 2', courtsCount: 8 },
    ];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles,
      startDate: d220101,
      endDate: '2022-01-07',
    });
    competitionEngine.setState(tournamentRecord);
    const { venueIds } = competitionEngine.getCompetitionVenues();

    let result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: {},
    });
    expect(result.valid).toEqual(false);

    result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: [],
    });
    expect(result.valid).toEqual(true);

    result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: [[]],
    });
    expect(result.valid).toEqual(false);

    result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: [{ scheduleDate: d220203, venues: [] }],
    });
    expect(result.valid).toEqual(true);

    result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: [{ scheduleDate: d220203, venues: [{}] }],
    });
    expect(result.valid).toEqual(false);

    result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: [{ scheduleDate: d220203, venues: [{ rounds: [] }] }],
    });
    expect(result.valid).toEqual(false);

    result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: d220203,
          venues: [{ venueId: venueIds[0], rounds: [] }],
        },
      ],
    });
    expect(result.valid).toEqual(true);

    result = competitionEngine.validateSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: d220203,
          venues: [{ venueId: 'bogusId', rounds: [] }],
        },
      ],
    });
    expect(result.error).toEqual(VENUE_NOT_FOUND);
    expect(result.valid).toEqual(false);
  },
);
