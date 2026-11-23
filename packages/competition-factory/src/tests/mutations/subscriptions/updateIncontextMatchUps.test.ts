import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { it, expect } from 'vitest';

// constants
import { MODIFY_MATCHUP, UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';

it('supports subscriptions to fully hydrated matchUps', () => {
  const inContextMatchUpNotifications: any[] = [];
  const matchUpNotifications: any[] = [];
  let notificationsCounter = 0;

  const subscriptions = {
    [UPDATE_INCONTEXT_MATCHUP]: (results) => {
      inContextMatchUpNotifications.push(...results);
      notificationsCounter += 1;
    },
    [MODIFY_MATCHUP]: (results) => {
      matchUpNotifications.push(...results);
      notificationsCounter += 1;
    },
  };
  setSubscriptions({ subscriptions });

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  expect(notificationsCounter).toEqual(2);

  expect(inContextMatchUpNotifications.length).toEqual(matchUpNotifications.length);
  expect(inContextMatchUpNotifications[0].inContextMatchUp.sides[0].participant).toBeDefined();
});
