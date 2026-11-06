import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { DELETED_DRAW_IDS } from '@Constants/topicConstants';

/**
 * The DELETED_DRAW_IDS notice from deleteDrawDefinitions names the draw's tournament and event, as the same notice
 * from deleteEvents does (NOC-714). It carried only the drawId, so a subscriber holding several tournaments could not
 * tell which event had lost the draw.
 */
afterEach(() => setSubscriptions({ subscriptions: {} }));

it('deleteDrawDefinitions notices carry tournamentId and eventId', () => {
  const delivered: any[] = [];
  setSubscriptions({ subscriptions: { [DELETED_DRAW_IDS]: (payload) => delivered.push(...payload) } });

  const {
    tournamentRecord: { tournamentId },
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ drawProfiles: [{ drawSize: 4 }] }],
    setState: true,
  });

  const result = tournamentEngine.deleteDrawDefinitions({ eventId, drawIds: [drawId] });
  expect(result.success).toEqual(true);
  expect(delivered).toEqual([{ drawId, eventId, tournamentId }]);
});
