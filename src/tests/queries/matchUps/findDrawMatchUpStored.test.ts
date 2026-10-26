import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  AD_HOC,
  COMPASS,
  CURTIS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  LUCKY_DRAW,
  OLYMPIC,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
} from '@Constants/drawDefinitionConstants';

/**
 * Out of context, `findDrawMatchUp` reads the stored matchUp from the matchUps map instead of the structure's read.
 * For every matchUp of every draw shape, a dual's lines and a round robin's groups included, it must return the very
 * object the structure's read returned, from the same structure: callers write to it.
 */
function readThroughStructures(drawDefinition: any, matchUpId: string) {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  for (const structure of drawDefinition.structures) {
    const { matchUps } = getAllStructureMatchUps({ drawDefinition, structure, matchUpsMap, inContext: false });
    const matchUp = matchUps.find((candidate: any) => candidate.matchUpId === matchUpId);
    if (matchUp) return { matchUp, structureId: structure.structureId };
  }
  return {};
}

describe('an out-of-context lookup returns the stored matchUp the structure read returned', () => {
  it.each([
    ['single elimination', { drawSize: 32 }],
    ['feed-in championship', { drawSize: 32, drawType: FEED_IN_CHAMPIONSHIP }],
    ['compass', { drawSize: 32, drawType: COMPASS }],
    ['olympic', { drawSize: 16, drawType: OLYMPIC }],
    ['curtis', { drawSize: 32, drawType: CURTIS }],
    ['first match loser', { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    ['double elimination', { drawSize: 16, drawType: DOUBLE_ELIMINATION }],
    ['round robin', { drawSize: 16, drawType: ROUND_ROBIN }],
    ['round robin with playoff', { drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF }],
    ['lucky draw', { drawSize: 11, drawType: LUCKY_DRAW }],
    ['ad hoc', { drawSize: 8, drawType: AD_HOC, automated: true, roundsCount: 3 }],
    ['team', { drawSize: 8, eventType: TEAM_EVENT }],
  ])('%s', (_, drawProfile) => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const matchUpIds = tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } })
      .matchUps.map(({ matchUpId }) => matchUpId);
    expect(matchUpIds.length).toBeGreaterThan(0);
    for (const matchUpId of matchUpIds) {
      const expected = readThroughStructures(drawDefinition, matchUpId);
      const found = findDrawMatchUp({ drawDefinition, matchUpId });
      expect(expected.matchUp).toBeDefined();
      expect({ matchUpId, same: found.matchUp === expected.matchUp }).toEqual({ matchUpId, same: true });
      expect(found.structure?.structureId).toEqual(expected.structureId);
    }
    expect(findDrawMatchUp({ drawDefinition, matchUpId: 'not-a-matchUp' }).error).toBeDefined();
  });
});
