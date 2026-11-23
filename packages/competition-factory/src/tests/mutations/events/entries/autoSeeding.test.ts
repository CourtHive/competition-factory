import { participantScaleItem } from '@Query/participant/participantScaleItem';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants, fixtures and types
import { RANKING, RATING, SEEDING } from '@Constants/scaleConstants';
import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { MISSING_EVENT } from '@Constants/errorConditionConstants';
import { ADD_SCALE_ITEMS } from '@Constants/topicConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { ScaleAttributes } from '@Types/factoryTypes';
import { WTN } from '@Constants/ratingConstants';

it('can autoSeed by Rankings', () => {
  const eventId = 'seededEventId';
  const drawId = 'seededDrawId';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, eventId, drawSize: 32, category: { categoryName: 'U18' } }],
    participantsProfile: { idPrefix: 'p' },
  });

  tournamentEngine.setState(tournamentRecord);
  let tournamentParticipants = tournamentEngine.getParticipants().participants;

  const scaleDate = '2021-01-01';
  const scaleValuesRating = [3.3, 4.4, 5.5, 1.1, 2.2, 6.6, 7.7, 8.8, 10.1, 9.9];
  const scaleValuesRanking = [100, 90, 80, 30, 20, 10, 70, 60, 50, 40];
  const scaleItemsWithParticipantIds = tournamentParticipants.map((participant, index) => {
    const { participantId } = participant;
    const scaleItems = [
      {
        scaleValue: scaleValuesRating[index],
        eventType: SINGLES_EVENT,
        scaleType: RATING,
        scaleName: WTN,
        scaleDate,
      },
      {
        scaleValue: scaleValuesRanking[index],
        eventType: SINGLES_EVENT,
        scaleType: RANKING,
        scaleName: 'U18',
        scaleDate,
      },
    ];

    return { participantId, scaleItems };
  });

  let scaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RATING,
    scaleName: WTN,
  };
  let result = tournamentEngine.setParticipantScaleItems({
    context: { scaleAttributes, eventId },
    scaleItemsWithParticipantIds,
  });
  expect(result.success).toEqual(true);

  let { timeItem } = tournamentEngine.getEventTimeItem({
    itemType: ADD_SCALE_ITEMS,
    eventId,
  });
  expect(timeItem.itemType).toEqual(ADD_SCALE_ITEMS);
  expect(timeItem.itemValue.scaleAttributes.scaleType).toEqual(RATING);
  timeItem = tournamentEngine.getEventTimeItem({
    itemType: ADD_SCALE_ITEMS,
    itemSubTypes: [SEEDING],
    eventId,
  }).timeItem;
  expect(timeItem).toBeUndefined();

  result = tournamentEngine.autoSeeding({
    policyDefinitions: SEEDING_USTA,
    sortDescending: true,
    scaleName: 'U18',
    scaleAttributes,
    eventId,
  });
  let scaleValues = result.scaleItemsWithParticipantIds
    .map(({ scaleItems }) => scaleItems[0].scaleValue)
    .filter(Boolean);
  expect(scaleValues).toEqual([8, 7, 6, 5, 4, 3, 1, 2]);

  const seedingScaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: SEEDING,
    scaleName: 'U18',
  };
  result = tournamentEngine.setParticipantScaleItems({
    scaleItemsWithParticipantIds: result.scaleItemsWithParticipantIds,
    context: {
      scaleBasis: { ...scaleAttributes, scaleDate },
      scaleAttributes: seedingScaleAttributes,
      eventId,
    },
  });
  expect(result.success).toEqual(true);

  timeItem = tournamentEngine.getEventTimeItem({
    itemType: ADD_SCALE_ITEMS,
    eventId,
  }).timeItem;
  expect(timeItem.itemType).toEqual(ADD_SCALE_ITEMS);
  expect(timeItem.itemValue.scaleAttributes.scaleType).toEqual(SEEDING);
  expect(timeItem.itemValue.scaleBasis.scaleType).toEqual(RATING);
  timeItem = tournamentEngine.getEventTimeItem({
    itemType: ADD_SCALE_ITEMS,
    itemSubTypes: [SEEDING],
    eventId,
  }).timeItem;
  expect(timeItem.itemValue.scaleBasis.scaleType).toEqual(RATING);

  let { scaledEntries } = tournamentEngine.getScaledEntries({
    scaleAttributes: seedingScaleAttributes,
    eventId,
  });

  tournamentParticipants = tournamentEngine.getParticipants({
    withSeeding: true,
    withEvents: true,
  }).participants;

  let seedingScaleValues = tournamentParticipants
    .map((participant) => {
      const { scaleItem } = participantScaleItem({
        scaleAttributes: seedingScaleAttributes,
        participant,
      });
      const seedValue = participant.events[0].seedValue;
      const scaleValue = scaleItem ? scaleItem.scaleValue : undefined;
      return seedValue || scaleValue ? { seedValue, scaleValue } : undefined;
    })
    .filter(Boolean);

  expect(seedingScaleValues.length).toEqual(8);

  // check that a timeItem was added
  // can range from 3-4 depending on whether an equivalent value was generated (won't add new timeItem)
  expect(tournamentParticipants[0].timeItems.length).toBeGreaterThanOrEqual(3);
  expect(scaledEntries.length).toEqual(8);

  tournamentParticipants = tournamentEngine.getParticipants({
    usePublishState: true,
    withSeeding: true,
    withEvents: true,
  }).participants;

  seedingScaleValues = tournamentParticipants.map((participant) => participant.events[0].seedValue).filter(Boolean);

  // when { usePublishState: true } seedValues are not added if eventSeeding not published
  expect(seedingScaleValues.length).toEqual(0);

  result = tournamentEngine.publishEventSeeding({ eventId });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getPublishState({ eventId });
  expect(result.publishState.status.publishedSeeding.published).toEqual(true);

  tournamentParticipants = tournamentEngine.getParticipants({
    usePublishState: true,
    withSeeding: true,
    withEvents: true,
  }).participants;

  seedingScaleValues = tournamentParticipants.map((participant) => participant.events[0].seedValue).filter(Boolean);

  // when { usePublishState: true } seedValues are added when eventSeeding is published
  // BUT just because someone was seeded for the event doesn't mean they were seeded for the draw
  expect(unique(seedingScaleValues).length).toEqual(8);

  const { participants } = tournamentEngine.getParticipants({
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });
  seedingScaleValues = participants.map((participant) => participant.events[0].seedValue).filter(Boolean);
  expect(unique(seedingScaleValues).length).toEqual(8);

  // event was seeded AFTER the draw was made, so there is no seeding for the draw
  const drawSeedingScaleValues = participants.map((participant) => participant.draws[0].seedValue).filter(Boolean);
  expect(unique(drawSeedingScaleValues).length).toEqual(0);

  // now unPublish and test again
  result = tournamentEngine.unPublishEventSeeding({ eventId });
  expect(result.success).toEqual(true);

  tournamentParticipants = tournamentEngine.getParticipants({
    usePublishState: true,
    withSeeding: true,
    withEvents: true,
  }).participants;

  seedingScaleValues = tournamentParticipants.map((participant) => participant.events[0].seedValue).filter(Boolean);

  // when { usePublishState: true } seedValues are not added if eventSeeding not published
  expect(seedingScaleValues.length).toEqual(0);

  // now test that { sortDescending: false } sorts the other way
  result = tournamentEngine.autoSeeding({
    policyDefinitions: SEEDING_USTA,
    sortDescending: false,
    scaleName: 'U18',
    scaleAttributes,
    eventId,
  });
  scaleValues = result.scaleItemsWithParticipantIds.map(({ scaleItems }) => scaleItems[0].scaleValue).filter(Boolean);
  expect(scaleValues).toEqual([3, 4, 5, 1, 2, 6, 7, 8]);
  result = tournamentEngine.setParticipantScaleItems({
    scaleItemsWithParticipantIds: result.scaleItemsWithParticipantIds,
  });
  expect(result.success).toEqual(true);

  // now test seeding by ranking
  scaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RANKING,
    scaleName: 'U18',
  };
  result = tournamentEngine.autoSeeding({
    policyDefinitions: SEEDING_USTA,
    scaleName: 'U18',
    scaleAttributes,
    eventId,
  });
  scaleValues = result.scaleItemsWithParticipantIds.map(({ scaleItems }) => scaleItems[0].scaleValue).filter(Boolean);
  expect(scaleValues).toEqual([8, 3, 2, 1, 7, 6, 5, 4]);
  result = tournamentEngine.setParticipantScaleItems({
    scaleItemsWithParticipantIds: result.scaleItemsWithParticipantIds,
  });
  expect(result.success).toEqual(true);

  const newScaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: SEEDING,
    scaleName: 'U18',
  };
  ({ scaledEntries } = tournamentEngine.getScaledEntries({
    scaleAttributes: newScaleAttributes,
    eventId,
  }));
  expect(scaledEntries.length).toEqual(8);

  tournamentParticipants = tournamentEngine.getParticipants().participants;

  // check that a timeItem was added
  // can range from 4-6 depending on whether an equivalent value was generated (won't add new timeItem)
  expect(tournamentParticipants[0].timeItems.length).toBeGreaterThanOrEqual(4);

  result = tournamentEngine.removeSeeding({ scaleName: 'U18' });
  expect(result.error).toEqual(MISSING_EVENT);

  result = tournamentEngine.removeSeeding({
    scaleName: 'U18',
    eventId,
  });
  expect(result.success).toEqual(true);

  // check that all seeding timeItems were removed
  tournamentParticipants = tournamentEngine.getParticipants().participants;
  // can be 2-3 based on whether the initial value for ranking was 100
  expect(tournamentParticipants[0].timeItems.length).toBeGreaterThanOrEqual(2);

  result = tournamentEngine.removeSeeding({
    scaleName: 'U18',
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // now remove the flightProfile so that subsequent call can fall through to drawDefinition.entries
  result = tournamentEngine.removeEventExtension({
    name: 'flightProfile',
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeSeeding({
    scaleName: 'U18',
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const eventScaleValues = tournamentEngine.devContext(true).getEvents({
    withScaleValues: true,
  }).eventScaleValues;

  expect(eventScaleValues.seededEventId.ranking.U18.length).toEqual(10);
  expect(eventScaleValues.seededEventId.draws.seededDrawId.ranking.U18.length).toEqual(10);
});
