import { buildFromSources } from '@Generators/ingestion/buildFromSources/buildFromSources';
import { getTournamentInconsistencies } from '@Query/tournaments/getTournamentInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { Tournament } from '@Types/tournamentTypes';

/**
 * A rebuilt AD_HOC draw keeps its entries.
 *
 * An AD_HOC structure positions nobody: its participants are on its matchUps' sides. buildFromSources read a draw's
 * entries from positionAssignments alone, so every AD_HOC draw it rebuilt had NONE — found 2026-11-06 ingesting
 * published single-match draws as AD_HOC.
 */
describe('buildFromSources: AD_HOC draw entries', () => {
  const generate = () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: AD_HOC, drawSize: 8, roundsCount: 2, completeAllMatchUps: true }],
      setState: true,
      nonRandom: 1,
    });
    const original = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const { eventData } = tournamentEngine.getEventData({ eventId });
    return { original, eventData };
  };

  it('enters every participant its matchUps carry', () => {
    const { original, eventData } = generate();
    const { record } = buildFromSources([eventData]);
    const [draw] = record.events[0].drawDefinitions;

    const played = new Set(
      original.structures.flatMap((s) => s.matchUps.flatMap((m) => m.sides.map((side) => side.participantId))),
    );
    expect(played.size).toEqual(8);
    expect(new Set(draw.entries.map((entry) => entry.participantId))).toEqual(played);
    expect(new Set(record.events[0].entries.map((entry) => entry.participantId))).toEqual(played);
  });

  it('keeps the participants on the sides, and reads back with no error-severity finding', () => {
    const { eventData } = generate();
    const { record } = buildFromSources([eventData]);
    const [structure] = record.events[0].drawDefinitions[0].structures;

    expect(structure.matchUps.every((m) => m.sides.every((side) => side.participantId))).toEqual(true);
    const { inconsistencies = [] } = getTournamentInconsistencies({ tournamentRecord: record as Tournament }) as any;
    expect(inconsistencies.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
