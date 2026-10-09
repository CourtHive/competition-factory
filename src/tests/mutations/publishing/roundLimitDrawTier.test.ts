import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { AD_HOC } from '@Constants/drawDefinitionConstants';

/**
 * A published `roundLimit` withholds an AD_HOC structure's later rounds from EVERY public tier.
 *
 * It was applied in `getEventData` alone. courthive-public loads an event with
 * `drawsProfile: 'STUBS'` and then each draw through `drawdata` (`getDrawData`), so a round a director
 * hid was public anyway. Found by the Guidon publishing journey (CFS + TMX + courthive-public).
 */

function adHocWithRoundLimit(roundLimit?: number) {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: AD_HOC, drawSize: 8, roundsCount: 3, automated: true }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  const structureDetail = roundLimit === undefined ? { published: true } : { published: true, roundLimit };
  const result: any = tournamentEngine.publishEvent({
    drawDetails: { [drawId]: { structureDetails: { [structureId]: structureDetail } } },
    eventId,
  });
  expect(result.success).toEqual(true);
  return { drawId, eventId, structureId };
}

const rounds = (structure: any) => Object.keys(structure?.roundMatchUps ?? {});

describe('roundLimit on every tier', () => {
  it('getDrawData withholds rounds beyond the limit', () => {
    const { drawId } = adHocWithRoundLimit(2);
    // control: unfiltered, all three rounds exist
    expect(rounds(tournamentEngine.getDrawData({ drawId }).structures[0])).toEqual(['1', '2', '3']);
    const published = tournamentEngine.getDrawData({ drawId, usePublishState: true });
    expect(rounds(published.structures[0])).toEqual(['1', '2']);
    expect(Object.keys(published.structures[0].roundProfile)).toEqual(['1', '2']);
  });

  it('getStructureData withholds them too', () => {
    const { drawId, structureId } = adHocWithRoundLimit(2);
    const { structure } = tournamentEngine.getStructureData({ drawId, structureId, usePublishState: true });
    expect(rounds(structure)).toEqual(['1', '2']);
  });

  it('getEventData is unchanged: full and stub profiles agree with the draw tier', () => {
    const { eventId, drawId } = adHocWithRoundLimit(1);
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(rounds(eventData.drawsData[0].structures[0])).toEqual(['1']);
    expect(rounds(tournamentEngine.getDrawData({ drawId, usePublishState: true }).structures[0])).toEqual(['1']);
  });

  it('no roundLimit publishes every round', () => {
    const { drawId } = adHocWithRoundLimit();
    expect(rounds(tournamentEngine.getDrawData({ drawId, usePublishState: true }).structures[0])).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
});
