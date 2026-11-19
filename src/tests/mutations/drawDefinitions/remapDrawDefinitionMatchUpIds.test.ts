/**
 * Tests for remapDrawDefinitionMatchUpIds — remap specific matchUpIds on a
 * generated draw using targeted assignments by roundNumber, roundPosition,
 * and optional structure fingerprint (stage, stageSequence, exitProfile, structureId).
 */
import { remapDrawDefinitionMatchUpIds } from '@Mutate/drawDefinitions/remapDrawDefinitionMatchUpIds';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, test, expect } from 'vitest';

// constants and types
import { TargetMatchUpId } from '@Types/factoryTypes';
import {
  SINGLE_ELIMINATION,
  MAIN,
  CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  COMPASS,
  PLAY_OFF,
  ROUND_ROBIN_WITH_PLAYOFF,
} from '@Constants/drawDefinitionConstants';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';

/** Collect all matchUps across all structures (including nested RR groups) */
function allMatchUps(drawDefinition: any): any[] {
  let result: any = [];
  for (const structure of drawDefinition.structures ?? []) {
    result = result.concat(structure.matchUps ?? []);
    for (const child of structure.structures ?? []) {
      result = result.concat(child.matchUps ?? []);
    }
  }
  return result;
}

function generateDraw({ drawType, drawSize, eventId }: { drawType: string; drawSize: number; eventId: string }) {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: eventId, participantsProfile: { participantsCount: drawSize } }],
    setState: true,
  });
  const result: any = tournamentEngine.generateDrawDefinition({ drawType, drawSize, eventId });
  expect(result.success).toEqual(true);
  return result.drawDefinition;
}

function matchUpIdsOf(drawDefinition: any): string[] {
  return allMatchUps(drawDefinition).flatMap((m) => [m.matchUpId, ...(m.tieMatchUps ?? []).map((t) => t.matchUpId)]);
}

describe('remapDrawDefinitionMatchUpIds', () => {
  describe('target scoping', () => {
    test('a target without a structure selector matches only the FIRST structure (COMPASS 32)', () => {
      const drawDefinition = generateDraw({ drawType: COMPASS, drawSize: 32, eventId: 'remap-compass-32' });
      // every one of the eight compass structures has a R1P1 matchUp
      const withR1P1 = drawDefinition.structures.filter((s) =>
        s.matchUps.some((m) => m.roundNumber === 1 && m.roundPosition === 1),
      );
      expect(withR1P1.length).toEqual(8);

      const result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [{ matchUpId: 'ext-r1p1', roundNumber: 1, roundPosition: 1 }],
        drawDefinition,
      });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(1);

      const ids = matchUpIdsOf(drawDefinition);
      expect(ids.filter((id) => id === 'ext-r1p1').length).toEqual(1);
      expect(new Set(ids).size).toEqual(ids.length);

      // the first structure in draw order (East) received the id
      const [first] = drawDefinition.structures;
      expect(first.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1).matchUpId).toEqual('ext-r1p1');
    });

    test('a structure selector still reaches a later structure alongside an unscoped target', () => {
      const drawDefinition = generateDraw({ drawType: COMPASS, drawSize: 32, eventId: 'remap-compass-mixed' });
      const result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [
          { matchUpId: 'ext-east', roundNumber: 1, roundPosition: 1 },
          { matchUpId: 'ext-west', roundNumber: 1, roundPosition: 1, exitProfile: '0-1' },
        ],
        drawDefinition,
      });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(2);
      const west = drawDefinition.structures.find((s) => s.structureName === 'West');
      expect(west.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1).matchUpId).toEqual('ext-west');
      const ids = matchUpIdsOf(drawDefinition);
      expect(new Set(ids).size).toEqual(ids.length);
    });

    test('refuses before writing when one matchUpId is given to two targets', () => {
      const drawDefinition = generateDraw({ drawType: COMPASS, drawSize: 32, eventId: 'remap-dup-id' });
      const before = matchUpIdsOf(drawDefinition);
      const result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [
          { matchUpId: 'ext-dup', roundNumber: 1, roundPosition: 1, exitProfile: '0' },
          { matchUpId: 'ext-dup', roundNumber: 1, roundPosition: 1, exitProfile: '0-1' },
        ],
        drawDefinition,
      });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(matchUpIdsOf(drawDefinition)).toEqual(before);
    });

    test('refuses before writing when two targets resolve to the same matchUp', () => {
      const drawDefinition = generateDraw({ drawType: COMPASS, drawSize: 32, eventId: 'remap-dup-matchup' });
      const before = matchUpIdsOf(drawDefinition);
      const result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [
          { matchUpId: 'ext-a', roundNumber: 1, roundPosition: 1 },
          { matchUpId: 'ext-b', roundNumber: 1, roundPosition: 1, stage: MAIN },
        ],
        drawDefinition,
      });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(matchUpIdsOf(drawDefinition)).toEqual(before);
    });

    test('refuses before writing when a target id is already held by an untargeted matchUp', () => {
      const drawDefinition = generateDraw({ drawType: SINGLE_ELIMINATION, drawSize: 8, eventId: 'remap-collide' });
      const before = matchUpIdsOf(drawDefinition);
      const r1p2 = allMatchUps(drawDefinition).find((m) => m.roundNumber === 1 && m.roundPosition === 2);
      const result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [{ matchUpId: r1p2.matchUpId, roundNumber: 1, roundPosition: 1 }],
        drawDefinition,
      });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(matchUpIdsOf(drawDefinition)).toEqual(before);
    });

    test('generateDrawDefinition surfaces a refused remap instead of ignoring it', () => {
      const eventId = 'gen-remap-refused';
      mocksEngine.generateTournamentRecord({
        eventProfiles: [{ eventId, eventName: eventId, participantsProfile: { participantsCount: 8 } }],
        setState: true,
      });
      const result: any = tournamentEngine.generateDrawDefinition({
        targetMatchUpIds: [
          { matchUpId: 'ext-dup', roundNumber: 1, roundPosition: 1 },
          { matchUpId: 'ext-dup', roundNumber: 1, roundPosition: 2 },
        ],
        drawType: SINGLE_ELIMINATION,
        drawSize: 8,
        eventId,
      });
      expect(result.error).toEqual(INVALID_VALUES);
    });
  });

  describe('round robin with playoff (reference page example)', () => {
    test('group matchUps carry no roundPosition, so only the playoff target remaps', () => {
      const drawDefinition = generateDraw({ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 16, eventId: 'remap-rr' });
      const container = drawDefinition.structures.find((s) => s.stage === MAIN);
      const groupMatchUps = container.structures.flatMap((g) => g.matchUps);
      expect(groupMatchUps.length).toBeGreaterThan(0);
      // the fact the reference page must reflect: group matchUps have roundNumber + drawPositions only
      expect(groupMatchUps.every((m) => m.roundPosition === undefined && m.drawPositions?.length === 2)).toEqual(true);

      const result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [{ matchUpId: 'playoff-r1p1', roundNumber: 1, roundPosition: 1, stage: PLAY_OFF }],
        drawDefinition,
      });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(1);
      const playoff = drawDefinition.structures.find((s) => s.stage === PLAY_OFF);
      expect(playoff.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1).matchUpId).toEqual(
        'playoff-r1p1',
      );
    });
  });

  describe('standalone function', () => {
    test('remaps targeted matchUps in a single elimination draw', () => {
      const drawSize = 8;
      const eventId = 'remap-se';

      mocksEngine.generateTournamentRecord({
        eventProfiles: [{ eventId, eventName: 'Remap SE', participantsProfile: { participantsCount: drawSize } }],
        setState: true,
      });

      let result: any = tournamentEngine.generateDrawDefinition({
        drawType: SINGLE_ELIMINATION,
        drawSize,
        eventId,
      });
      expect(result.success).toEqual(true);
      const { drawDefinition } = result;

      const targetMatchUpIds: TargetMatchUpId[] = [
        { matchUpId: 'custom-r1-p1', roundNumber: 1, roundPosition: 1 },
        { matchUpId: 'custom-r1-p3', roundNumber: 1, roundPosition: 3 },
        { matchUpId: 'custom-final', roundNumber: 3, roundPosition: 1 },
      ];

      result = remapDrawDefinitionMatchUpIds({ targetMatchUpIds, drawDefinition });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(3);

      const matchUps = allMatchUps(drawDefinition);
      expect(matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1).matchUpId).toEqual('custom-r1-p1');
      expect(matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 3).matchUpId).toEqual('custom-r1-p3');
      expect(matchUps.find((m) => m.roundNumber === 3 && m.roundPosition === 1).matchUpId).toEqual('custom-final');

      // Untargeted matchUps should be unchanged (not 'custom-...')
      const r1p2 = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 2);
      expect(r1p2.matchUpId).not.toContain('custom');
    });

    test('updates winnerMatchUpId cross-references after remap', () => {
      const drawSize = 4;
      const eventId = 'remap-xref';

      mocksEngine.generateTournamentRecord({
        eventProfiles: [{ eventId, eventName: 'Remap XRef', participantsProfile: { participantsCount: drawSize } }],
        setState: true,
      });

      let result: any = tournamentEngine.generateDrawDefinition({
        drawType: SINGLE_ELIMINATION,
        idPrefix: 'det',
        drawSize,
        eventId,
      });
      expect(result.success).toEqual(true);
      const { drawDefinition } = result;

      // With idPrefix='det', matchUpIds are 'det-{round}-{pos}'
      // The final matchUp is 'det-2-1'; semi-finals are 'det-1-1' and 'det-1-2'
      // Semi-finals should have winnerMatchUpId pointing to the final

      // Remap the final
      const targetMatchUpIds: TargetMatchUpId[] = [{ matchUpId: 'new-final', roundNumber: 2, roundPosition: 1 }];

      result = remapDrawDefinitionMatchUpIds({ targetMatchUpIds, drawDefinition });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(1);

      const matchUps = allMatchUps(drawDefinition);
      const final = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1);
      expect(final.matchUpId).toEqual('new-final');

      // Semi-final winnerMatchUpId references should be updated
      const semi1 = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1);
      const semi2 = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 2);
      if (semi1.winnerMatchUpId) expect(semi1.winnerMatchUpId).toEqual('new-final');
      if (semi2.winnerMatchUpId) expect(semi2.winnerMatchUpId).toEqual('new-final');
    });

    test('targets by stage in FIRST_MATCH_LOSER_CONSOLATION', () => {
      const drawSize = 8;
      const eventId = 'remap-fmlc';

      mocksEngine.generateTournamentRecord({
        eventProfiles: [{ eventId, eventName: 'Remap FMLC', participantsProfile: { participantsCount: drawSize } }],
        setState: true,
      });

      let result: any = tournamentEngine.generateDrawDefinition({
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        drawSize,
        eventId,
      });
      expect(result.success).toEqual(true);
      const { drawDefinition } = result;

      // Target a consolation matchUp specifically
      const consolationStructure = drawDefinition.structures.find((s) => s.stage === CONSOLATION);
      expect(consolationStructure).toBeDefined();

      const consolationMatchUp = consolationStructure.matchUps[0];
      const targetMatchUpIds: TargetMatchUpId[] = [
        {
          matchUpId: 'consolation-custom',
          roundNumber: consolationMatchUp.roundNumber,
          roundPosition: consolationMatchUp.roundPosition,
          stage: CONSOLATION,
        },
      ];

      result = remapDrawDefinitionMatchUpIds({ targetMatchUpIds, drawDefinition });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(1);

      // Verify the consolation matchUp was remapped
      const remapped = consolationStructure.matchUps.find((m) => m.matchUpId === 'consolation-custom');
      expect(remapped).toBeDefined();

      // Verify no MAIN matchUps were affected
      const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
      const mainIds = mainStructure.matchUps.map((m) => m.matchUpId);
      expect(mainIds).not.toContain('consolation-custom');
    });

    test('targets by exitProfile in compass-like draw', () => {
      const drawSize = 8;
      const eventId = 'remap-compass';

      mocksEngine.generateTournamentRecord({
        eventProfiles: [{ eventId, eventName: 'Remap Compass', participantsProfile: { participantsCount: drawSize } }],
        setState: true,
      });

      let result: any = tournamentEngine.generateDrawDefinition({
        drawType: SINGLE_ELIMINATION,
        drawSize,
        eventId,
        withPlayoffs: {
          roundProfiles: [{ 1: 1 }],
          playoffAttributes: {
            '0-1': { name: 'West', abbreviation: 'W' },
          },
        },
      });
      expect(result.success).toEqual(true);
      const { drawDefinition } = result;

      // Find the West (playoff) structure
      const westStructure = drawDefinition.structures.find((s) => s.structureName === 'West');
      expect(westStructure).toBeDefined();
      expect(westStructure.matchUps.length).toBeGreaterThan(0);

      // Target a matchUp in West by exitProfile '0-1'
      const targetMatchUpIds: TargetMatchUpId[] = [
        { matchUpId: 'west-r1-p1', roundNumber: 1, roundPosition: 1, exitProfile: '0-1' },
      ];

      result = remapDrawDefinitionMatchUpIds({ targetMatchUpIds, drawDefinition });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(1);

      const remapped = westStructure.matchUps.find((m) => m.matchUpId === 'west-r1-p1');
      expect(remapped).toBeDefined();

      // MAIN structure R1P1 should NOT have been remapped
      const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN && s.stageSequence === 1);
      const mainR1P1 = mainStructure.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1);
      expect(mainR1P1.matchUpId).not.toEqual('west-r1-p1');
    });

    test('no-op when matchUpId already matches target', () => {
      const drawSize = 4;
      const eventId = 'remap-noop';

      mocksEngine.generateTournamentRecord({
        eventProfiles: [{ eventId, eventName: 'Remap NoOp', participantsProfile: { participantsCount: drawSize } }],
        setState: true,
      });

      let result: any = tournamentEngine.generateDrawDefinition({
        drawType: SINGLE_ELIMINATION,
        idPrefix: 'det',
        drawSize,
        eventId,
      });
      const { drawDefinition } = result;

      // Target with the ID that already exists
      const targetMatchUpIds: TargetMatchUpId[] = [{ matchUpId: 'det-1-1', roundNumber: 1, roundPosition: 1 }];

      result = remapDrawDefinitionMatchUpIds({ targetMatchUpIds, drawDefinition });
      expect(result.success).toEqual(true);
      expect(result.remappedCount).toEqual(0);
    });

    test('returns error for missing drawDefinition', () => {
      const result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [{ matchUpId: 'x', roundNumber: 1, roundPosition: 1 }],
        drawDefinition: undefined as any,
      });
      expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
    });

    test('returns error for empty targetMatchUpIds', () => {
      let result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [],
        drawDefinition: { structures: [] } as any,
      });
      expect(result.error).toEqual(INVALID_VALUES);
    });
  });

  describe('via generateDrawDefinition param', () => {
    test('targetMatchUpIds remaps during generation', () => {
      const drawSize = 8;
      const eventId = 'gen-remap';

      mocksEngine.generateTournamentRecord({
        eventProfiles: [{ eventId, eventName: 'Gen Remap', participantsProfile: { participantsCount: drawSize } }],
        setState: true,
      });

      const targetMatchUpIds: TargetMatchUpId[] = [
        { matchUpId: 'imported-r1-p1', roundNumber: 1, roundPosition: 1 },
        { matchUpId: 'imported-r1-p2', roundNumber: 1, roundPosition: 2 },
        { matchUpId: 'imported-r2-p1', roundNumber: 2, roundPosition: 1 },
        { matchUpId: 'imported-final', roundNumber: 3, roundPosition: 1 },
      ];

      let result: any = tournamentEngine.generateDrawDefinition({
        drawType: SINGLE_ELIMINATION,
        targetMatchUpIds,
        drawSize,
        eventId,
      });
      expect(result.success).toEqual(true);

      const matchUps = allMatchUps(result.drawDefinition);
      expect(matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1).matchUpId).toEqual('imported-r1-p1');
      expect(matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 2).matchUpId).toEqual('imported-r1-p2');
      expect(matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1).matchUpId).toEqual('imported-r2-p1');
      expect(matchUps.find((m) => m.roundNumber === 3 && m.roundPosition === 1).matchUpId).toEqual('imported-final');

      // Untargeted matchUps remain with generated IDs
      const r1p3 = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 3);
      expect(r1p3.matchUpId).not.toContain('imported');
    });
  });
});
