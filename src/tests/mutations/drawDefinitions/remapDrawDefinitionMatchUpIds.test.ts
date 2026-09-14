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
} from '@Constants/drawDefinitionConstants';

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

describe('remapDrawDefinitionMatchUpIds', () => {
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
      expect(result.error).toBeDefined();
    });

    test('returns error for empty targetMatchUpIds', () => {
      let result: any = remapDrawDefinitionMatchUpIds({
        targetMatchUpIds: [],
        drawDefinition: { structures: [] } as any,
      });
      expect(result.error).toBeDefined();
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
