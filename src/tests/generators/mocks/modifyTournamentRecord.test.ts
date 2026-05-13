import { getFlightProfile } from '@Query/event/getFlightProfile';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { COMPASS, CURTIS_CONSOLATION, FEED_IN_CHAMPIONSHIP, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { PAIR } from '@Constants/participantConstants';

test('modifyTournamentRecord error conditions', () => {
  const result = mocksEngine.modifyTournamentRecord();
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

test('mocksEngine can modify existing tournamentRecords', () => {
  // prettier-ignore
  let eventProfiles: any[] = [{ eventName: `Boy's U16 Doubles`, eventType: DOUBLES, gender: MALE }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles,
  });

  expect(tournamentRecord.participants.length).toEqual(0);

  // prettier-ignore
  eventProfiles = [{ eventName: `Boy's U16 Doubles`, drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }] }];
  const result = mocksEngine
    .setDeepCopy(false)
    .devContext({ makeDeepCopy: true, iterations: 4 }) // in this case setting { iterations: 3 } will result in logging
    .modifyTournamentRecord({
      tournamentRecord,
      eventProfiles,
    });
  expect(result.success).toEqual(true);
  expect(result.drawIds.length).toEqual(1);
  expect(tournamentRecord.participants.length).toEqual(12); // 4 * 3 = 12
});

test('mocksEngine can modify existing tournamentRecords and complete SOME matchUps', () => {
  // prettier-ignore
  let eventProfiles: any[] = [{ eventName: `Boy's U16 Doubles`, gender: MALE }];
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles,
  });

  expect(tournamentRecord.participants.length).toEqual(0);

  // prettier-ignore
  eventProfiles = [{ eventIndex: 0, drawProfiles: [{ drawSize: 16, completionGoal: 8 }] }];
  let result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles,
  });
  expect(result.success).toEqual(true);
  expect(result.drawIds.length).toEqual(1);
  expect(tournamentRecord.participants.length).toEqual(16);

  tournamentEngine.setState(tournamentRecord);

  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(8);

  eventProfiles = [{ eventIndex: 0, publish: true }];
  result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles,
  });
  expect(result.success).toEqual(true);

  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ eventId });

  const publishStatus = event.timeItems.find((timeItem) => timeItem.itemType === `${PUBLISH}.${STATUS}`);

  expect(publishStatus).not.toBeUndefined();
});

test('mocksEngine can modify existing tournamentRecords', () => {
  let eventProfiles: any[] = [
    { eventName: `Gentlemen's O50 Doubles`, eventType: DOUBLES, gender: MALE },
    { eventName: `Boy's U16 Doubles`, eventType: DOUBLES, gender: MALE },
    { eventName: `Boy's U16 Singles`, eventType: SINGLES, gender: MALE },
    { eventName: `Girl's U16 Doubles`, eventType: DOUBLES, gender: FEMALE },
    { eventName: `Girl's U16 Singles`, eventType: SINGLES, gender: FEMALE },
  ];
  const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    eventProfiles,
  });

  expect(tournamentRecord.participants.length).toEqual(0);

  // prettier-ignore
  const participantsProfile = { participantsCount: 20, participantType: PAIR };
  let result = mocksEngine.modifyTournamentRecord({
    participantsProfile,
    tournamentRecord,
  });
  expect(result.success).toEqual(true);

  expect(tournamentRecord.participants.length).toEqual(60); // 20 DOUBLES participants + 40 SINGLES participants

  // prettier-ignore
  eventProfiles = [
    { eventName: `Boy's U16 Doubles`, drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN }] },
    { eventName: `Boy's U16 Singles`, drawProfiles: [{ drawSize: 32, drawType: COMPASS }] },
    { eventName: `Girl's U16 Doubles`, drawProfiles: [{ drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP }] },
    { eventName: `Girl's U16 Singles`, drawProfiles: [{ drawSize: 32, drawType: CURTIS_CONSOLATION }] },
  ];
  result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles,
  });
  expect(result.success).toEqual(true);
  expect(result.drawIds.length).toEqual(4);

  expect(tournamentRecord.participants.length).toEqual(220); // 16 * 3 + 32 + 16 * 3 + 32 + 60 = 124 + 96 = 220

  // prettier-ignore
  eventProfiles = [
    { eventId: eventIds[0], drawProfiles: [{ drawSize: 4 }] },
  ];
  result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles,
  });
  expect(result.success).toEqual(true);
  expect(result.drawIds.length).toEqual(1);

  let event = tournamentRecord.events[0];
  let { flightProfile } = getFlightProfile({ event });
  expect(flightProfile.flights.length).toEqual(1);

  expect(tournamentRecord.participants.length).toEqual(232); // 220 + 3 * 4 = 232

  // prettier-ignore
  eventProfiles = [
    { eventId: eventIds[0], drawProfiles: [{ drawSize: 8, drawId: 'foo' }] },
  ];
  result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles,
  });
  expect(result.success).toEqual(true);
  expect(result.drawIds.length).toEqual(1);

  event = tournamentRecord.events[0];
  ({ flightProfile } = getFlightProfile({ event }));
  expect(flightProfile.flights.length).toEqual(2);

  expect(tournamentRecord.participants.length).toEqual(256); // 232 + 3 * 8 = 256

  result = mocksEngine.modifyTournamentRecord({ tournamentRecord });
  expect(result.totalParticipantsCount).toEqual(288);
  expect(result.drawIds.length).toEqual(0);
  expect(result.success).toEqual(true);

  result = mocksEngine.modifyTournamentRecord({
    participantsProfile: { idPrefix: 'new', participantsCount: 10 },
    tournamentRecord,
  });
  expect(result.success).toEqual(true);
  expect(result.totalParticipantsCount).toEqual(298);
});

test('mocksEngine can modify existing tournamentRecords by adding events', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
  });

  // prettier-ignore
  const eventProfiles = [{ eventName: `Boy's U16 Doubles`, eventType: DOUBLES, gender: MALE }];
  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles,
  });
  expect(result.success).toEqual(true);
});

test('mocksEngine can modify existing tournamentRecords by adding events', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
  });

  // prettier-ignore
  const eventProfiles = [{ eventName: `Boy's U16 Doubles`, drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }] }];
  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    eventProfiles,
  });
  expect(result.totalParticipantsCount).toEqual(4);
  expect(result.success).toEqual(true);
});

test('mocksEngine can modify existing tournamentRecords with drawProfiles', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
  });

  const drawProfiles = [{ drawId: 'd1', drawSize: 4, drawType: ROUND_ROBIN }];

  const result = mocksEngine.modifyTournamentRecord({
    tournamentRecord,
    drawProfiles,
  });
  expect(result.totalParticipantsCount).toEqual(4);
  expect(result.success).toEqual(true);
});

test('mocksEngine can modify existing tournamentRecords with drawProfiles', () => {
  const startDate = '2022-09-01';
  const venueId = 'venueId';
  const venueProfiles = [{ venueId, courtsCount: 40 }];
  const drawProfiles = [{ drawId: 'd1', drawSize: 4 }];
  // Pin scheduling to legacy 90/0 timing. POLICY_SCHEDULING_DEFAULT is now
  // the implicit fallback; its added recovery would push the third matchUp
  // from 08:30 to 09:30 and break the expected stagger.
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles,
    startDate,
    policyDefinitions: {
      scheduling: {
        defaultTimes: {
          averageTimes: [{ minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 0 } }],
        },
      },
    },
  });

  const { rounds } = tournamentEngine.setState(tournamentRecord).getRounds();
  const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }];

  const result = mocksEngine.modifyTournamentRecord({
    autoSchedule: true,
    schedulingProfile,
    tournamentRecord,
    drawProfiles,
  });
  expect(result.success).toEqual(true);
  expect(Object.values(result.schedulerResult.matchUpScheduleTimes)).toEqual(['07:00', '07:00', '08:30']);
});
