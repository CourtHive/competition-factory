import { mocksEngine } from '@Assemblies/engines/mock';
import competitionEngine from '@Engines/syncEngine';
import { addDays } from '@Tools/dateTime';
import { expect, it } from 'vitest';

// constants
import { CURTIS_CONSOLATION, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';

it('can generate tournament rounds and profileRounds', () => {
  let result = competitionEngine.getRounds();
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);

  const startDate = '2022-02-02';
  const venueProfiles = [
    {
      venueName: 'Club Courts',
      venueAbbreviation: 'CC',
      startTime: '08:00',
      venueId: 'venueId',
      endTime: '20:00',
      courtsCount: 6,
    },
  ];
  const drawProfiles = [
    { drawId: 'd1', drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF },
    { drawId: 'd2', drawSize: 32, drawType: CURTIS_CONSOLATION },
  ];

  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: venueProfiles[0].venueId,
          rounds: [
            {
              roundSegment: { segmentNumber: 1, segmentsCount: 2 },
              winnerFinishingPositionRange: '1-16',
              drawId: 'd2',
            },
            {
              roundSegment: { segmentNumber: 2, segmentsCount: 2 },
              winnerFinishingPositionRange: '1-16',
              drawId: 'd2',
            },
            { drawId: 'd2', winnerFinishingPositionRange: '1-8' },
          ],
        },
      ],
    },
  ];
  result = mocksEngine.generateTournamentRecord({
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
  });
  expect(result.success).toEqual(true);

  const { tournamentRecord } = result;

  result = competitionEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  result = competitionEngine.getRounds();
  expect(result.success).toEqual(true);
  expect(result.rounds.length).toEqual(18);

  result = competitionEngine.getRounds({ withSplitRounds: true });
  expect(result.success).toEqual(true);
  expect(result.rounds.length).toEqual(19); // one of the rounds is now split
  const segmentedRounds = result.rounds.filter((r) => r.segmentsCount);
  expect(segmentedRounds.length).toEqual(2);
  expect(result.rounds[0].id).toBeUndefined();
  result = competitionEngine.getRounds({ withRoundId: true });
  expect(result.rounds[0].id).not.toBeUndefined();

  const ronundPositions = segmentedRounds.map(({ matchUps }) => matchUps.map(({ roundPosition }) => roundPosition));
  expect(ronundPositions).toEqual([
    [1, 2, 3, 4, 5, 6, 7, 8],
    [9, 10, 11, 12, 13, 14, 15, 16],
  ]);

  result = competitionEngine.getProfileRounds();
  expect(result.profileRounds.length).toEqual(3);
  expect(Object.keys(result.segmentedRounds).length).toEqual(1);

  result = competitionEngine.getRounds({
    excludeScheduleDateProfileRounds: startDate,
    withSplitRounds: true,
  });
  expect(result.success).toEqual(true);
  // when excluding rounds scheduled on a specific date, 3 will be filtered out
  expect(result.rounds.length).toEqual(16);
});

it('can filter out rounds which are not relevant to specified venueId', () => {
  const venueProfiles = [
    {
      venueName: 'Club Courts',
      venueAbbreviation: 'CC',
      startTime: '08:00',
      venueId: 'venueId',
      endTime: '20:00',
      courtsCount: 6,
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawId: 'd1' }],
    venueProfiles,
  });
  let result = competitionEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  result = competitionEngine.getRounds();
  expect(result.excludedRounds.length).toEqual(0);
  expect(result.rounds.length).toEqual(3);

  result = competitionEngine.getRounds({ venueId: 'fakeId' });
  expect(result.excludedRounds.length).toEqual(3);
  expect(result.rounds.length).toEqual(0);

  result = competitionEngine.getRounds({ venueId: 'venueId' });
  expect(result.excludedRounds.length).toEqual(0);
  expect(result.rounds.length).toEqual(3);

  const { startDate, endDate } = tournamentRecord;
  const dateBefore = addDays(startDate, -1);
  const dateAfter = addDays(endDate, 1);

  result = competitionEngine.getRounds({ scheduleDate: startDate });
  expect(result.excludedRounds.length).toEqual(0);
  expect(result.rounds.length).toEqual(3);
  result = competitionEngine.getRounds({ scheduleDate: endDate });
  expect(result.excludedRounds.length).toEqual(0);
  expect(result.rounds.length).toEqual(3);
  result = competitionEngine.getRounds({ scheduleDate: dateBefore });
  expect(result.excludedRounds.length).toEqual(3);
  expect(result.rounds.length).toEqual(0);
  result = competitionEngine.getRounds({ scheduleDate: dateAfter });
  expect(result.excludedRounds.length).toEqual(3);
  expect(result.rounds.length).toEqual(0);
});
