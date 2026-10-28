import { describe, expect, test } from 'vitest';

import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { setClock } from '@Tools/clock';

// constants
import { ADD_MATCHUPS } from '@Constants/topicConstants';

/**
 * What a write stores does not depend on whether it is announced, nor on who is listening (building-a-tournament.md
 * § 7, the two defects).
 */
describe('building writes do not depend on notices', () => {
  test('a draw replaced with suppressNotifications is stored', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const replacement = { ...makeDeepCopy(drawDefinition, false, true), drawName: 'Replaced' };

    const result: any = tournamentEngine.addDrawDefinition({
      drawDefinition: replacement,
      suppressNotifications: true,
      allowReplacement: true,
      eventId,
    });
    expect(result.success).toEqual(true);
    // the replacement sat inside the notification guard: the call succeeded and kept the old draw
    expect(tournamentEngine.getEvent({ drawId }).drawDefinition.drawName).toEqual('Replaced');
  });

  test('addEvent stores the same matchUp stamps with or without a subscriber', () => {
    const stored = (subscribed: boolean) => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
      const event = makeDeepCopy(tournamentRecord.events[0], false, true);
      delete tournamentRecord.events;
      for (const structure of event.drawDefinitions[0].structures) {
        for (const matchUp of structure.matchUps) delete matchUp.updatedAt;
      }
      tournamentEngine.reset();
      tournamentEngine.setState(tournamentRecord);
      setSubscriptions({ subscriptions: subscribed ? { [ADD_MATCHUPS]: () => undefined } : {} });
      setClock('2026-10-30T09:00:00.000Z');
      // an event that arrives with its draw (internalUse): its matchUps are announced, and stamped
      const result: any = tournamentEngine.addEvent({ event, internalUse: true });
      setClock();
      setSubscriptions({ subscriptions: {} });
      expect(result.success).toEqual(true);
      const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: false }).matchUps;
      return matchUps.map(({ matchUpId, updatedAt }) => [matchUpId, updatedAt]);
    };

    const withSubscriber = stored(true);
    expect(withSubscriber.every(([, updatedAt]) => updatedAt === '2026-10-30T09:00:00.000Z')).toEqual(true);
    // gated on the subscription, the same call left the matchUps unstamped
    expect(stored(false).map(([, updatedAt]) => updatedAt)).toEqual(withSubscriber.map(([, updatedAt]) => updatedAt));
  });
});
