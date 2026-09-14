import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import POLICY_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { SINGLES } from '@Constants/matchUpTypes';
import { WTN } from '@Constants/ratingConstants';

test('ratings values should be present on tournamentParticipants in getEventData', () => {
  const startDate = '2022-02-02';
  const drawId = 'mockDrawId';

  const venueProfiles = [
    {
      venueId: 'e8e4c0b0-216c-426f-bba2-18e16caa74b8', // ensure consistent venueId for courts shared across tournaments
      venueName: 'Club Courts',
      venueAbbreviation: 'CC',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 6,
    },
  ];

  const drawProfiles = [
    {
      eventName: `WTN 14-19 SINGLES`,
      category: { ratingType: 'WTN', ratingMin: 14, ratingMax: 19.99 },
      generate: true,
      drawSize: 4,
      drawId,
    },
  ];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: venueProfiles[0].venueId,
          rounds: [{ drawId, winnerFinishingPositionRange: '1-2' }],
        },
      ],
    },
  ];
  const personExtensions = [
    { name: 'districtCode', value: 'Z' },
    { name: 'sectionCode', value: '123' },
  ];
  const participantsProfile = {
    withScaleValues: true,
    personExtensions,
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    scheduleCompletedMatchUps: true,
    completeAllMatchUps: true,
    participantsProfile,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  let mockedMatchUp = tournamentEngine.allTournamentMatchUps({
    participantsProfile,
    tournamentRecord,
  }).matchUps?.[0];

  expect(mockedMatchUp.sides[0].participant.ratings[SINGLES][0].scaleName).toEqual(WTN);

  ({
    matchUps: [mockedMatchUp],
  } = tournamentEngine.allTournamentMatchUps({ tournamentRecord }));

  expect(mockedMatchUp.sides[0].participant.ratings).toBeUndefined();

  let { eventData, participants } = tournamentEngine.getEventData({ tournamentRecord, eventId });
  expect(eventData.drawsData[0].structures[0].roundMatchUps[1][0].sides[0].participant.ratings).not.toBeUndefined();
  expect(eventData.drawsData[0].structures[0].roundMatchUps[1][0].sides[0].participant.timeItems).not.toBeUndefined();
  expect(participants.every(({ person }) => !!person.addresses)).toEqual(true);

  // default privacy policy filters out timeItems and ratings
  ({ eventData, participants } = tournamentEngine.getEventData({
    policyDefinitions: POLICY_PRIVACY_DEFAULT,
    tournamentRecord,
    eventId,
  }));
  expect(eventData.drawsData[0].structures[0].roundMatchUps[1][0].sides[0].participant.ratings).toBeDefined();
  expect(eventData.drawsData[0].structures[0].roundMatchUps[1][0].sides[0].participant.timeItems).toBeUndefined();
  expect(participants.every(({ person }) => !person.addresses)).toEqual(true);

  tournamentEngine.setState(tournamentRecord);
  let result = tournamentEngine.competitionScheduleMatchUps({ participantsProfile, hydrateParticipants: false });
  expect(result.completedMatchUps[0].sides[0].participantId).toBeDefined();
  expect(result.completedMatchUps[0].sides[0].participant.participantId).toBeUndefined();
  result = tournamentEngine.competitionScheduleMatchUps({ participantsProfile, hydrateParticipants: true });
  expect(result.completedMatchUps[0].sides[0].participant.ratings.SINGLES[0].scaleName).toEqual(WTN);

  const eventScaleValues = tournamentEngine.getEvents({
    withScaleValues: true,
  }).eventScaleValues;
  const wtnStats = eventScaleValues[eventId].ratingsStats.WTN;
  const statKeys = Object.keys(wtnStats);
  expect(statKeys.toSorted((a, b) => a.localeCompare(b))).toEqual(['avg', 'max', 'median', 'min']);
  const statValues = Object.values(wtnStats);
  expect(statValues.length).toEqual(4);
  expect(statValues.every((value) => typeof value === 'number')).toEqual(true);
  expect(eventScaleValues[eventId].ratings.WTN.length).toEqual(4);
});
