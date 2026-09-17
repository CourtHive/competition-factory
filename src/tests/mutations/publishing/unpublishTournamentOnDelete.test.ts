import { isTournamentPublished } from '@Query/publishing/isTournamentPublished';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { globalState } from '../../..';
import { expect, it } from 'vitest';

// constants
import { UNPUBLISH_TOURNAMENT } from '@Constants/topicConstants';

/**
 * Deleting the last published draw or event unpublishes a tournament without any unpublish call.
 *
 * Consumers keep a published flag per tournament and refresh it on UNPUBLISH_TOURNAMENT (the server's
 * read-model producer does not refresh the tournament row on a draw or event delete), so a delete
 * that flips the roll-up must announce it — and a delete that does NOT flip it must stay silent, or
 * the notice stops meaning anything.
 */

function subscribe() {
  const notifications: any[] = [];
  globalState.setSubscriptions({
    subscriptions: { [UNPUBLISH_TOURNAMENT]: (notices) => notifications.push(...notices) },
  });
  return notifications;
}

function published(): boolean {
  return isTournamentPublished(tournamentEngine.getTournament().tournamentRecord);
}

it('fires when the only published draw is deleted with autoPublish disabled', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  tournamentEngine.publishEvent({ eventId });
  expect(published()).toBe(true);

  const notifications = subscribe();
  const result = tournamentEngine.deleteDrawDefinitions({ eventId, drawIds: [drawId], autoPublish: false });

  expect(result.success).toBe(true);
  expect(published()).toBe(false);
  expect(notifications).toHaveLength(1);
  expect(notifications[0].tournamentId).toBeDefined();
});

it('fires when the only published draw is deleted with autoPublish at its default', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  tournamentEngine.publishEvent({ eventId });

  const notifications = subscribe();
  tournamentEngine.deleteDrawDefinitions({ eventId, drawIds: [drawId] });

  expect(published()).toBe(false);
  expect(notifications).toHaveLength(1);
});

it('does NOT fire when another event still has a published draw', () => {
  const {
    eventIds: [eventId1, eventId2],
    drawIds: [drawId1],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }], setState: true });
  tournamentEngine.publishEvent({ eventId: eventId1 });
  tournamentEngine.publishEvent({ eventId: eventId2 });

  const notifications = subscribe();
  tournamentEngine.deleteDrawDefinitions({ eventId: eventId1, drawIds: [drawId1], autoPublish: false });

  expect(published()).toBe(true);
  expect(notifications).toHaveLength(0);
});

it('does NOT fire when the order of play is still published', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  tournamentEngine.publishEvent({ eventId });
  tournamentEngine.publishOrderOfPlay();

  const notifications = subscribe();
  tournamentEngine.deleteDrawDefinitions({ eventId, drawIds: [drawId], autoPublish: false });

  expect(published()).toBe(true);
  expect(notifications).toHaveLength(0);
});

it('does NOT fire when deleting a draw from a tournament that was never published', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });

  const notifications = subscribe();
  const result = tournamentEngine.deleteDrawDefinitions({ eventId, drawIds: [drawId], autoPublish: false });

  expect(result.success).toBe(true);
  expect(notifications).toHaveLength(0);
});

it('fires when the only event with a published draw is deleted', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  tournamentEngine.publishEvent({ eventId });

  const notifications = subscribe();
  const result = tournamentEngine.deleteEvents({ eventIds: [eventId] });

  expect(result.success).toBe(true);
  expect(published()).toBe(false);
  expect(notifications).toHaveLength(1);
});

it('does NOT fire when a remaining event is still published', () => {
  const {
    eventIds: [eventId1, eventId2],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }], setState: true });
  tournamentEngine.publishEvent({ eventId: eventId1 });
  tournamentEngine.publishEvent({ eventId: eventId2 });

  const notifications = subscribe();
  tournamentEngine.deleteEvents({ eventIds: [eventId1] });

  expect(published()).toBe(true);
  expect(notifications).toHaveLength(0);
});
