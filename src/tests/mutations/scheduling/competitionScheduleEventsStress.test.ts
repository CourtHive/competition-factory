import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

test('mocksEngine can autoschedule', () => {
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
  const participantsProfile = { personExtensions };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    scheduleCompletedMatchUps: true,
    completeAllMatchUps: true,
    participantsProfile,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
  });

  const {
    matchUps: [mockedMatchUp],
  } = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps();

  expect(Object.keys(mockedMatchUp.schedule).length).toBeGreaterThan(0);
});

test('competitionScheduelMatchUps supports hydrateParticipants: false', () => {
  const startDate = '2022-02-02';
  const drawId = 'mockDrawId';
  const drawSize = 128;

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
      drawSize,
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
  const participantsProfile = { personExtensions };

  mocksEngine.generateTournamentRecord({
    scheduleCompletedMatchUps: true,
    completeAllMatchUps: true,
    participantsProfile,
    autoSchedule: true,
    schedulingProfile,
    setState: true,
    venueProfiles,
    drawProfiles,
    startDate,
  });
  let result = tournamentEngine.competitionScheduleMatchUps({ hydrateParticipants: true });
  expect(result.completedMatchUps[0].sides[0].participantId).toBeDefined();
  expect(result.mappedParticipants).toBeUndefined();
  const expectedParticipant = result.completedMatchUps[0].sides[0].participant;

  result = tournamentEngine.competitionScheduleMatchUps({
    participantsProfile: { withDraws: true },
    hydrateParticipants: false,
  });
  expect(Object.keys(result.mappedParticipants).length).toEqual(drawSize);
  expect(result.completedMatchUps[0].sides[0].participantId).toBeDefined();
  const side = result.completedMatchUps[0].sides[0];
  const mappedParticipant = Object.assign(result.mappedParticipants[side.participantId], side.participant);
  expect(expectedParticipant).toEqual(mappedParticipant);
  // ~32s under CI coverage, against the 30s default (2026-10-03, master)
}, 180_000);
