import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { globalState } from '../../..';
import { expect, it } from 'vitest';

// constants
import { UNPUBLISH_TOURNAMENT } from '@Constants/topicConstants';

function setupSubscription() {
  const notifications: any[] = [];
  globalState.setSubscriptions({
    subscriptions: {
      [UNPUBLISH_TOURNAMENT]: (notices) => {
        notifications.push(...notices);
      },
    },
  });
  return notifications;
}

it('fires UNPUBLISH_TOURNAMENT when single published event is unpublished', () => {
  const notifications = setupSubscription();

  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  tournamentEngine.publishEvent({ eventId });
  expect(notifications.length).toEqual(0);

  tournamentEngine.unPublishEvent({ eventId });
  expect(notifications.length).toEqual(1);
  expect(notifications[0].tournamentId).toBeDefined();
});

it('does NOT fire when one of two published events is unpublished, fires on second', () => {
  const notifications = setupSubscription();

  const {
    eventIds: [eventId1, eventId2],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }],
    setState: true,
  });

  tournamentEngine.publishEvent({ eventId: eventId1 });
  tournamentEngine.publishEvent({ eventId: eventId2 });
  expect(notifications.length).toEqual(0);

  tournamentEngine.unPublishEvent({ eventId: eventId1 });
  expect(notifications.length).toEqual(0);

  tournamentEngine.unPublishEvent({ eventId: eventId2 });
  expect(notifications.length).toEqual(1);
});

it('fires UNPUBLISH_TOURNAMENT when published OOP is unpublished', () => {
  const notifications = setupSubscription();

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  tournamentEngine.publishOrderOfPlay();
  expect(notifications.length).toEqual(0);

  tournamentEngine.unPublishOrderOfPlay();
  expect(notifications.length).toEqual(1);
  expect(notifications[0].tournamentId).toBeDefined();
});

it('fires UNPUBLISH_TOURNAMENT when published participants are unpublished', () => {
  const notifications = setupSubscription();

  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
    setState: true,
  });

  tournamentEngine.publishParticipants();
  expect(notifications.length).toEqual(0);

  tournamentEngine.unPublishParticipants();
  expect(notifications.length).toEqual(1);
  expect(notifications[0].tournamentId).toBeDefined();
});

it('does NOT fire until both event and OOP are unpublished', () => {
  const notifications = setupSubscription();

  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  tournamentEngine.publishEvent({ eventId });
  tournamentEngine.publishOrderOfPlay();
  expect(notifications.length).toEqual(0);

  tournamentEngine.unPublishEvent({ eventId });
  expect(notifications.length).toEqual(0);

  tournamentEngine.unPublishOrderOfPlay();
  expect(notifications.length).toEqual(1);
});
