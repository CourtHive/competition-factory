import { visualizeScheduledMatchUps } from '@Tests/testHarness/testUtilities/visualizeScheduledMatchUps';
import { extractTime, timeStringMinutes } from '@Tools/dateTime';
import { getParticipantId } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';

const showGlobalLog = false;

it.each([
  {
    startTime: '08:00',
    endTime: '19:00',
    courtsCount: 4,
    matchUpFormatA: FORMAT_STANDARD,
    matchUpFormatB: FORMAT_STANDARD,
    iterations: 1,
  },
  {
    startTime: '08:00',
    endTime: '19:00',
    courtsCount: 4,
    matchUpFormatA: FORMAT_STANDARD,
    matchUpFormatB: 'SET3-S:4/TB7-F:TB7',
    iterations: 4,
  },
])('can schedule iteratively', ({ startTime, endTime, courtsCount, matchUpFormatA, matchUpFormatB, iterations }) => {
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const venueProfiles = [
    {
      venueId: 'venueId',
      courtsCount,
      startTime,
      endTime,
    },
  ];

  const drawProfiles = [
    {
      drawSize: 4,
      drawName: 'A',
      idPrefix: 'A',
      drawId: 'firstDraw',
      uniqueParticipants: true,
      matchUpFormat: matchUpFormatA,
      drawExtensions: [],
    },
    {
      drawSize: 4,
      drawName: 'B',
      idPrefix: 'B',
      drawId: 'secondDraw',
      matchUpFormat: matchUpFormatB,
    },
  ];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: 'venueId',
          rounds: [
            { drawId: 'firstDraw', winnerFinishingPositionRange: '1-2' },
            { drawId: 'secondDraw', winnerFinishingPositionRange: '1-2' },
          ],
        },
      ],
    },
  ];

  const {
    drawIds,
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    tournamentExtensions: [],
    tournamentAttributes: {},
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);
  const { tournamentId } = tournamentRecord;

  let { matchUps } = tournamentEngine.allCompetitionMatchUps();
  let scheduledMatchUps = matchUps.filter(hasSchedule);
  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

  // add second round of each draw to scheduling profile
  for (const drawId of drawIds) {
    const {
      event: { eventId },
      drawDefinition: {
        structures: [{ structureId }],
      },
    } = tournamentEngine.getEvent({ drawId });
    const result = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
      scheduleDate: startDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  }

  tournamentEngine.devContext({ virtual: true });
  // Scheduled Profile Rounds ##############################
  const result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
    garmanSinglePass: false,
  });
  expect(result.success).toEqual(true);
  if (result.iterations) expect(result.iterations).toEqual(iterations);
  expect(result.scheduledDates).toEqual([startDate]);
  // #######################################################

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);
  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

  // get the participantIds for each draw
  const drawEnteredParticipantIds: string[] = [];
  for (const drawId of drawIds) {
    const {
      drawDefinition: { entries: drawEntries },
    } = tournamentEngine.getEvent({ drawId });
    drawEnteredParticipantIds.push(drawEntries.map(getParticipantId));
  }
  // expect the two draws to have unique participants
  expect(intersection(drawEnteredParticipantIds[0], drawEnteredParticipantIds[1]).length).toEqual(0);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);

  const roundMap = scheduledMatchUps
    .map(({ roundNumber, roundPosition, drawName, schedule }) => [
      extractTime(schedule.scheduledTime),
      roundNumber,
      roundPosition,
      drawName,
    ])
    .sort((a, b) => timeStringMinutes(a[0]) - timeStringMinutes(b[0]));
  expect(roundMap.length).toEqual(scheduledMatchUps.length);
  // console.log(roundMap); // useful for eye-balling

  const { participants: competitionParticipants, participantIdsWithConflicts } =
    tournamentEngine.getCompetitionParticipants({
      withScheduleItems: true,
      withMatchUps: true,
      inContext: true,
    });
  expect(participantIdsWithConflicts.length).toEqual(0);
  expect(competitionParticipants.length).toEqual(8);
});

it.each([
  {
    startTime: '08:00',
    endTime: '19:00',
    courtsCount: 4,
    iterations: 1,
  },
])(
  'can schedule multiple venues iteratively fill first venue before second',
  ({ startTime, endTime, courtsCount, iterations }) => {
    const startDate = '2022-01-01';
    const endDate = '2022-01-07';
    const venueProfiles = [
      {
        venueId: 'venue1',
        courtsCount,
        startTime,
        endTime,
      },
      {
        venueId: 'venue2',
        courtsCount,
        startTime,
        endTime,
      },
    ];

    const drawProfiles = [
      {
        drawSize: 32,
        drawName: 'A',
        idPrefix: 'A',
        drawId: 'firstDraw',
        uniqueParticipants: true,
      },
      {
        drawSize: 32,
        drawName: 'B',
        idPrefix: 'B',
        drawId: 'secondDraw',
        uniqueParticipants: true,
      },
    ];
    const schedulingProfile = [
      {
        scheduleDate: startDate,
        venues: [
          {
            venueId: 'venue1',
            rounds: [
              { drawId: 'firstDraw', winnerFinishingPositionRange: '1-16' },
              { drawId: 'firstDraw', winnerFinishingPositionRange: '1-8' },
            ],
          },
        ],
      },
    ];

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      autoSchedule: true,
      schedulingProfile,
      venueProfiles,
      drawProfiles,
      startDate,
      endDate,
    });

    tournamentEngine.setState(tournamentRecord);
    const { tournamentId } = tournamentRecord;

    let { matchUps } = tournamentEngine.allCompetitionMatchUps();
    let scheduledMatchUps = matchUps.filter(hasSchedule);
    visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

    // add second round of each draw to scheduling profile
    const {
      event: { eventId },
      drawDefinition: {
        structures: [{ structureId }],
      },
    } = tournamentEngine.getEvent({ drawId: 'secondDraw' });
    let result = tournamentEngine.addSchedulingProfileRound({
      scheduleDate: startDate,
      venueId: 'venue2',
      round: {
        tournamentId,
        eventId,
        drawId: 'secondDraw',
        structureId,
        roundNumber: 1,
      },
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addSchedulingProfileRound({
      scheduleDate: startDate,
      venueId: 'venue2',
      round: {
        tournamentId,
        eventId,
        drawId: 'secondDraw',
        structureId,
        roundNumber: 2,
      },
    });
    expect(result.success).toEqual(true);

    tournamentEngine.devContext({ virtual: true });
    // Scheduled Profile Rounds ##############################
    result = tournamentEngine.scheduleProfileRounds({
      scheduleDates: [startDate],
      garmanSinglePass: false,
    });
    expect(result.success).toEqual(true);
    if (result.iterations) expect(result.iterations).toEqual(iterations);
    expect(result.scheduledDates).toEqual([startDate]);
    // #######################################################

    ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
    scheduledMatchUps = matchUps.filter(hasSchedule);
    visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

    expect(Object.values(result.matchUpScheduleTimes).length).toEqual(48);
  },
);
