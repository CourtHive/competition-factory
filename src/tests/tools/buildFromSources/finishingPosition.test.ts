import { buildFromSources } from '@Generators/ingestion/buildFromSources/buildFromSources';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import * as tools from '@Assemblies/tools';
import { describe, expect, it } from 'vitest';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  ROUND_OUTCOME,
  WIN_RATIO,
  AD_HOC,
  MAIN,
} from '@Constants/drawDefinitionConstants';

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

  // Older exports state no finishingPosition at all: the generators' own rule fills it.
  const unstated = (drawProfile: any) => {
    const {
      eventIds: [id],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [drawProfile],
      completeAllMatchUps: true,
      setState: true,
    });
    const { eventData: projected } = tournamentEngine.getEventData({ eventId: id });
    const strip = (structures: any[] = []) =>
      structures.forEach((s) => (delete s.finishingPosition, strip(s.structures)));
    projected.drawsData.forEach((draw) => strip(draw.structures));
    const rebuilt = buildFromSources([projected]).record.events[0].drawDefinitions[0];
    const all = (structures: any[] = []): any[] => structures.flatMap((s) => [s, ...all(s.structures)]);
    return all(rebuilt.structures).map((s) => [s.stage, s.structureType ?? 'ITEM', s.finishingPosition]);
  };

  it('fills an unstated finishingPosition as the factory generates it: elimination by ROUND_OUTCOME', () => {
    const structures = unstated({ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 });
    expect(structures.length).toBeGreaterThan(1);
    expect(structures.every(([, , fp]) => fp === ROUND_OUTCOME)).toEqual(true);
  });

  it('a round robin, container and groups, by WIN_RATIO, and the playoff it feeds by ROUND_OUTCOME', () => {
    const structures = unstated({ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 8 });
    const main = structures.filter(([stage]) => stage === MAIN);
    expect(main.length).toBeGreaterThan(1);
    expect(main.every(([, , fp]) => fp === WIN_RATIO)).toEqual(true);
    expect(structures.filter(([stage]) => stage !== MAIN).every(([, , fp]) => fp === ROUND_OUTCOME)).toEqual(true);
  });

  it('an AD_HOC draw by WIN_RATIO', () => {
    expect(unstated({ drawType: AD_HOC, drawSize: 4, roundsCount: 1 })).toEqual([[MAIN, 'ITEM', WIN_RATIO]]);
  });
});
