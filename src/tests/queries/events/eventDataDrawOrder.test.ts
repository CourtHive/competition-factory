import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// the public views read an event's draws from getEventData: they follow the order a director set, not the order the
// draws were added in
it('lists drawsData in drawOrder, under both payload profiles', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }, { drawSize: 4 }] }],
    setState: true,
  });

  const drawIdsOf = (drawsProfile?: string) =>
    tournamentEngine
      .getEventData({ eventId, ...(drawsProfile && { drawsProfile }) })
      .eventData.drawsData.map(({ drawId }) => drawId);
  const stored = tournamentEngine.getEvent({ eventId }).event.drawDefinitions.map(({ drawId }) => drawId);
  expect(stored.length).toEqual(3);
  expect(drawIdsOf()).toEqual(stored);

  const reordered = [stored[2], stored[0], stored[1]];
  const orderedDrawIdsMap = Object.fromEntries(reordered.map((drawId, index) => [drawId, index + 1]));
  const result: any = tournamentEngine.updateDrawIdsOrder({ eventId, orderedDrawIdsMap });
  expect(result.success).toEqual(true);

  // the record keeps its array; the views follow drawOrder
  expect(tournamentEngine.getEvent({ eventId }).event.drawDefinitions.map(({ drawId }) => drawId)).toEqual(stored);
  expect(drawIdsOf()).toEqual(reordered);
  expect(drawIdsOf('STUBS')).toEqual(reordered);
});
