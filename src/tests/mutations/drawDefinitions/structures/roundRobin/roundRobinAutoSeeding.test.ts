import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants and fixtures
import { MAIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { RANKING, RATING } from '@Constants/scaleConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { WTN } from '@Constants/ratingConstants';

it('can autoSeed by Rankings and then generate Round Robin', () => {
  const participantsCount = 32;
  const startDate = '2023-01-01';
  const categoryName = 'U18';

  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Auto Seeded', category: { categoryName } }],
    participantsProfile: { participantsCount },
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);
  let { participants } = tournamentEngine.getParticipants();

  const participantIds = participants.map(getParticipantId);

  tournamentEngine.addEventEntries({
    participantIds,
    eventId,
  });

  const scaleValuesRating = [3.3, 4.4, 5.5, 1.1, 2.2, 6.6, 7.7, 8.8, 10.1, 9.9];
  const scaleValuesRanking = [100, 90, 80, 30, 20, 10, 70, 60, 50, 40];
  const scaleItemsWithParticipantIds = participantIds.map((participantId, index) => {
    const scaleItems = [
      {
        scaleValue: scaleValuesRating[index],
        eventType: SINGLES_EVENT,
        scaleDate: startDate,
        scaleType: RATING,
        scaleName: WTN,
      },
      {
        scaleValue: scaleValuesRanking[index],
        eventType: SINGLES_EVENT,
        scaleName: categoryName,
        scaleDate: startDate,
        scaleType: RANKING,
      },
    ];

    return { participantId, scaleItems };
  });

  let result = tournamentEngine.setParticipantScaleItems({
    scaleItemsWithParticipantIds,
  });
  expect(result.success).toEqual(true);

  let scaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleName: categoryName,
    scaleType: RANKING,
  };
  result = tournamentEngine.autoSeeding({
    policyDefinitions: SEEDING_USTA,
    sortDescending: true,
    scaleAttributes,
    eventId,
  });

  expect(result.scaleItemsWithParticipantIds.length).toEqual(32);
  result = tournamentEngine.setParticipantScaleItems(result);
  expect(result.success).toEqual(true);

  scaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RATING,
    scaleName: WTN,
  };
  result = tournamentEngine.autoSeeding({
    policyDefinitions: SEEDING_USTA,
    sortDescending: true,
    scaleAttributes,
    eventId,
  });

  expect(result.scaleItemsWithParticipantIds.length).toEqual(32);
  result = tournamentEngine.setParticipantScaleItems(result);
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(participantsCount);

  participants = tournamentEngine.getParticipants({
    withScaleValues: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  }).participants;

  let seededParticipants = participants.filter(({ events }) => events?.[0]?.seedValue);

  expect(seededParticipants[0].events.length).toEqual(1);
  expect(seededParticipants[0].draws.length).toEqual(0);
  expect(seededParticipants.length).toEqual(8);

  expect(seededParticipants[0].events[0].seedValue).not.toBeUndefined();
  // there are no seedAssignments because no draws have been generated from the event with seeding
  expect(seededParticipants[0].events[0].seedAssignments).toBeUndefined();

  const seededParticipantIds = seededParticipants.map(xa('participantId'));

  let seedsCount = 0; // without seedsCount seedValue will disappear
  result = tournamentEngine.generateDrawDefinition({
    drawSize: participantsCount,
    drawType: ROUND_ROBIN,
    drawId: 'drawId',
    automated: true,
    seedsCount,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  let p = tournamentEngine.getParticipants({
    withScaleValues: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });

  // IMPORTANT: participantMap contains object values for events, draws & etc.
  expect(typeof p.participantMap[seededParticipantIds[0]].events).toEqual('object');
  expect(Array.isArray(p.participantMap[seededParticipantIds[0]].events)).toEqual(false);

  // IMPORTANT: participants contains arrays for events, draws & etc.
  expect(Array.isArray(p.participants.find((pt) => pt.participantId === seededParticipantIds[0]).events)).toEqual(true);

  // the event was seeded
  seededParticipants = p.participants.filter(({ events }) => events?.[0]?.seedValue);
  expect(seededParticipants.length).toEqual(8);

  // but the draw generation specified seedsCount=0 so no seedAssignments were created
  seededParticipants = p.participants.filter(({ draws }) => draws?.[0]?.seedValue);
  expect(seededParticipants.length).toEqual(seedsCount);

  seedsCount = 8; // without seedsCount seedValue will disappear
  result = tournamentEngine.generateDrawDefinition({
    drawSize: participantsCount,
    drawType: ROUND_ROBIN,
    drawId: 'drawId',
    automated: true,
    seedsCount,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    allowReplacement: true,
    eventId,
  });
  expect(result.success).toEqual(true);

  p = tournamentEngine.getParticipants({
    withScaleValues: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });

  seededParticipants = p.participants.filter(({ events }) => events?.[0]?.seedValue);
  expect(seededParticipants.length).toEqual(seedsCount);

  seededParticipants = p.participants.filter(({ seedings }) => seedings);
  expect(seededParticipants[0].draws[0].seedAssignments[MAIN].seedValue).toBeDefined();
  expect(seededParticipants[0].events[0].seedAssignments[MAIN].seedValue).toBeDefined();
});
