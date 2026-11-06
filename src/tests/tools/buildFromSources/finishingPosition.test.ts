import { buildFromSources } from '@Generators/ingestion/buildFromSources/buildFromSources';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import * as tools from '@Assemblies/tools';
import { describe, expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN, ROUND_OUTCOME } from '@Constants/drawDefinitionConstants';

/**
 * A rebuilt structure keeps the finishingPosition its source states.
 *
 * The builders never copied it, so every rebuilt elimination structure lost ROUND_OUTCOME, which is what tells the
 * engine to follow a structure's links round by round: `positionTargets` named no target for a loser. Found 2026-11-06
 * placing a loser who declined a consolation.
 */
describe('buildFromSources: finishingPosition', () => {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 }],
    setState: true,
    nonRandom: 1,
  });
  const { eventData } = tournamentEngine.getEventData({ eventId });
  const { record } = buildFromSources([eventData]);

  it('carries ROUND_OUTCOME onto every rebuilt structure that states it', () => {
    const original = tournamentEngine.getEvent({ drawId }).drawDefinition;
    expect(original.structures.every((s) => s.finishingPosition === ROUND_OUTCOME)).toEqual(true);
    const rebuilt = record.events[0].drawDefinitions[0];
    expect(rebuilt.structures.map((s) => s.finishingPosition)).toEqual(original.structures.map(() => ROUND_OUTCOME));
  });

  it('so the engine follows the rebuilt links: positionTargets names a first-round loser its consolation slot', () => {
    tournamentEngine.setState(record);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const { matchUps: inContextDrawMatchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const source = inContextDrawMatchUps.find((m) => m.stage === MAIN && m.roundNumber === 1);
    const result: any = tools.positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId: source.matchUpId });
    expect(result.targetMatchUps.loserTargetDrawPosition).toBeGreaterThan(0);
  });
});
