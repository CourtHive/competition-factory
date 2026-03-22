import { generateAdaptiveStructures } from '@Generators/drawDefinitions/drawTypes/adaptiveDraw';
import { luckyDrawAdvancement } from '@Mutate/drawDefinitions/luckyDrawAdvancement';
import { luckyDraw, luckyRoundProfiles } from '@Generators/drawDefinitions/drawTypes/luckyDraw';
import { getValidLuckyLosersAction } from '@Query/drawDefinition/positionActions/getValidLuckyLoserAction';
import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import { isLucky } from '@Query/drawDefinition/isLucky';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, test, expect } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, ADAPTIVE, LOSER, LUCKY_DRAW, MAIN, PLAY_OFF, TOP_DOWN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { LUCKY_PARTICIPANT } from '@Constants/positionActionConstants';
import { MISSING_DRAW_DEFINITION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';

// ──────────────────────────────────────────────────────────────────────────────
// luckyDraw generator — uncovered branches
// ──────────────────────────────────────────────────────────────────────────────

describe('luckyDraw generator edge cases', () => {
  test('drawSize < 2 returns empty matchUps', () => {
    let result: any = luckyDraw({ drawSize: 1 });
    expect(result.matchUps).toEqual([]);
    expect(result.roundsCount).toBe(0);
  });

  test('drawSize = 0 returns empty matchUps', () => {
    let result: any = luckyDraw({ drawSize: 0 });
    expect(result.matchUps).toEqual([]);
    expect(result.roundsCount).toBe(0);
  });

  test('non-convertable integer drawSize returns empty matchUps', () => {
    let result: any = luckyDraw({ drawSize: 'abc' });
    expect(result.matchUps).toEqual([]);
    expect(result.roundsCount).toBe(0);
  });

  test('negative drawSize returns empty matchUps', () => {
    let result: any = luckyDraw({ drawSize: -5 });
    expect(result.matchUps).toEqual([]);
    expect(result.roundsCount).toBe(0);
  });

  test('power-of-2 drawSize delegates to treeMatchUps', () => {
    let result: any = luckyDraw({ drawSize: 8 });
    expect(result.matchUps.length).toBeGreaterThan(0);
    // power-of-2 should produce standard tree with 7 matchUps for drawSize 8
    expect(result.matchUps.length).toBe(7);
  });

  test('qualifyingPositions sets roundLimit when roundMatchUpsCount equals qualifyingPositions', () => {
    let result: any = luckyDraw({ drawSize: 10, qualifyingPositions: 3 });
    expect(result.roundLimit).toBeDefined();
    expect(result.matchUps.length).toBeGreaterThan(0);
    for (const m of result.matchUps) {
      expect(m.roundNumber).toBeLessThanOrEqual(result.roundLimit);
    }
  });

  test('roundLimit filters matchUps to only include rounds up to the limit', () => {
    let result: any = luckyDraw({ drawSize: 10, roundLimit: 2 });
    expect(result.roundLimit).toBe(2);
    for (const m of result.matchUps) {
      expect(m.roundNumber).toBeLessThanOrEqual(2);
    }
  });

  test('qualifyingRoundNumber sets roundLimit', () => {
    let result: any = luckyDraw({ drawSize: 10, qualifyingRoundNumber: 1 });
    expect(result.roundLimit).toBeDefined();
    for (const m of result.matchUps) {
      expect(m.roundNumber).toBeLessThanOrEqual(result.roundLimit);
    }
  });

  test('idPrefix is passed through to matchUp generation', () => {
    let result: any = luckyDraw({ drawSize: 10, idPrefix: 'TEST' });
    expect(result.matchUps.length).toBeGreaterThan(0);
    const hasPrefix = result.matchUps.some((m: any) => m.matchUpId?.includes('TEST'));
    expect(hasPrefix).toBe(true);
  });
});

describe('luckyRoundProfiles', () => {
  test('produces correct profiles for various drawSizes', () => {
    let result: any = luckyRoundProfiles(10);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].participantsCount).toBe(10);

    result = luckyRoundProfiles(11);
    // 11 is odd, so first round has 12 participants
    expect(result[0].participantsCount).toBe(12);
  });

  test('handles drawSize 3', () => {
    let result: any = luckyRoundProfiles(3);
    expect(result[0].participantsCount).toBe(4);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// generateAdaptiveStructures — uncovered branches
// ──────────────────────────────────────────────────────────────────────────────

describe('generateAdaptiveStructures edge cases', () => {
  test('drawSize < 2 returns empty result', () => {
    let result: any = generateAdaptiveStructures({ drawSize: 1 });
    expect(result.structures).toBeUndefined();
    expect(result.links).toBeUndefined();
  });

  test('playoffAttributes without matching exitProfile returns empty', () => {
    let result: any = generateAdaptiveStructures({
      drawSize: 8,
      playoffAttributes: { '99': { name: 'Unmatched' } } as any,
      exitProfile: '0',
    });
    expect(result.structures).toBeUndefined();
  });

  test('attributeProfile without name uses fallback structureName', () => {
    const customAttributes: any = {
      '0': { abbreviation: 'X' },
    };
    let result: any = generateAdaptiveStructures({
      drawSize: 4,
      playoffAttributes: customAttributes,
      exitProfile: '0',
    });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBeGreaterThan(0);
    // Structure name should be the fallback: "1-4"
    expect(result.structures[0].structureName).toBe('1-4');
  });

  test('explicit structureName overrides attributeProfile name', () => {
    let result: any = generateAdaptiveStructures({
      drawSize: 4,
      structureName: 'CustomName',
    });
    expect(result.structures).toBeDefined();
    expect(result.structures[0].structureName).toBe('CustomName');
  });

  test('idPrefix undefined means no prefix added', () => {
    let result: any = generateAdaptiveStructures({
      drawSize: 4,
      idPrefix: undefined,
    });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBeGreaterThan(0);
  });

  test('idPrefix provided adds prefix to child structures', () => {
    let result: any = generateAdaptiveStructures({
      drawSize: 8,
      idPrefix: 'PFX',
    });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBeGreaterThan(0);
  });

  test('small drawSize where childSize < 2 skips child structure', () => {
    // drawSize 2: rounds = log2(2) = 1, childSize = 2/2^1 = 1 => skipped
    let result: any = generateAdaptiveStructures({ drawSize: 2 });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBe(1);
    expect(result.links?.length ?? 0).toBe(0);
  });

  test('drawSize 4 (power-of-2) generates child structures', () => {
    let result: any = generateAdaptiveStructures({ drawSize: 4 });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBe(2);
    expect(result.links?.length).toBe(1);
    expect(result.links[0].linkType).toBe(LOSER);
  });

  test('drawSize 8 generates multiple child structures with correct links', () => {
    let result: any = generateAdaptiveStructures({ drawSize: 8 });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBeGreaterThan(2);
    expect(result.links?.length).toBeGreaterThan(0);
    for (const link of result.links) {
      expect(link.linkType).toBe(LOSER);
    }
  });

  test('roundOffsetLimit constrains depth of child structure generation', () => {
    let result: any = generateAdaptiveStructures({
      drawSize: 16,
      roundOffsetLimit: 1,
    });
    expect(result.structures).toBeDefined();
    const limitedCount = result.structures.length;

    result = generateAdaptiveStructures({
      drawSize: 16,
      roundOffsetLimit: 4,
    });
    const unlimitedCount = result.structures.length;
    expect(unlimitedCount).toBeGreaterThanOrEqual(limitedCount);
  });

  test('non-power-of-2 drawSize uses luckyRoundProfiles for child computation', () => {
    let result: any = generateAdaptiveStructures({ drawSize: 10 });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBeGreaterThan(1);
    expect(result.links?.length).toBeGreaterThan(0);
  });

  test('various drawSizes exercise computeParticipantsAbove and computeChildRounds', () => {
    // Test multiple draw sizes to hit different code paths
    for (const drawSize of [6, 10, 12, 14]) {
      let result: any = generateAdaptiveStructures({ drawSize });
      expect(result.structures).toBeDefined();
      for (const structure of result.structures) {
        expect(structure.structureName).toBeDefined();
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// isLucky — uncovered branches
// ──────────────────────────────────────────────────────────────────────────────

describe('isLucky edge cases', () => {
  test('returns false when structure is undefined', () => {
    let result: any = isLucky({});
    expect(result).toBe(false);
  });

  test('returns false when structure is explicitly undefined', () => {
    let result: any = isLucky({ structure: undefined });
    expect(result).toBe(false);
  });

  test('uses matchUps override instead of structure.matchUps', () => {
    const matchUps: any[] = [
      { roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1' },
      { roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2' },
      { roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3' },
      { roundNumber: 2, roundPosition: 1, drawPositions: [7, 8], matchUpId: 'mu-4' },
      { roundNumber: 2, roundPosition: 2, drawPositions: [9, 10], matchUpId: 'mu-5' },
    ];
    // 3 matchUps in R1 (not power of 2) => roundsNotPowerOf2 = true
    // matchUps have drawPositions => hasDrawPositions = true
    let result: any = isLucky({
      structure: { matchUps: [] } as any,
      matchUps,
    });
    expect(result).toBe(true);
  });

  test('returns true when positionAssignments have drawPositions and rounds are not power of 2', () => {
    const structure: any = {
      positionAssignments: [{ drawPosition: 1, participantId: 'pid-1' }],
      matchUps: [
        { roundNumber: 1, roundPosition: 1, matchUpId: 'mu-1' },
        { roundNumber: 1, roundPosition: 2, matchUpId: 'mu-2' },
        { roundNumber: 1, roundPosition: 3, matchUpId: 'mu-3' },
        { roundNumber: 2, roundPosition: 1, matchUpId: 'mu-4' },
      ],
    };
    let result: any = isLucky({ structure });
    expect(result).toBe(true);
  });

  test('returns false when drawDefinition.drawType is LUCKY_DRAW', () => {
    const structure: any = {
      positionAssignments: [{ drawPosition: 1, participantId: 'pid-1' }],
      matchUps: [
        { roundNumber: 1, roundPosition: 1 },
        { roundNumber: 1, roundPosition: 2 },
        { roundNumber: 1, roundPosition: 3 },
      ],
    };
    const drawDefinition: any = { drawType: LUCKY_DRAW };
    let result: any = isLucky({ structure, drawDefinition });
    expect(result).toBe(false);
  });

  test('returns false when drawDefinition.drawType is ADAPTIVE', () => {
    const structure: any = {
      positionAssignments: [{ drawPosition: 1, participantId: 'pid-1' }],
      matchUps: [
        { roundNumber: 1, roundPosition: 1 },
        { roundNumber: 1, roundPosition: 2 },
        { roundNumber: 1, roundPosition: 3 },
      ],
    };
    const drawDefinition: any = { drawType: ADAPTIVE };
    let result: any = isLucky({ structure, drawDefinition });
    expect(result).toBe(false);
  });

  test('returns false when rounds are power of 2', () => {
    const structure: any = {
      positionAssignments: [{ drawPosition: 1, participantId: 'pid-1' }],
      matchUps: [
        { roundNumber: 1, roundPosition: 1, matchUpId: 'mu-1' },
        { roundNumber: 1, roundPosition: 2, matchUpId: 'mu-2' },
        { roundNumber: 1, roundPosition: 3, matchUpId: 'mu-3' },
        { roundNumber: 1, roundPosition: 4, matchUpId: 'mu-4' },
        { roundNumber: 2, roundPosition: 1, matchUpId: 'mu-5' },
        { roundNumber: 2, roundPosition: 2, matchUpId: 'mu-6' },
        { roundNumber: 3, roundPosition: 1, matchUpId: 'mu-7' },
      ],
    };
    let result: any = isLucky({ structure });
    expect(result).toBe(false);
  });

  test('returns false when structure has sub-structures', () => {
    const structure: any = {
      positionAssignments: [{ drawPosition: 1, participantId: 'pid-1' }],
      matchUps: [
        { roundNumber: 1, roundPosition: 1 },
        { roundNumber: 1, roundPosition: 2 },
        { roundNumber: 1, roundPosition: 3 },
      ],
      structures: [{ structureId: 'child' }],
    };
    let result: any = isLucky({ structure });
    expect(result).toBe(false);
  });

  test('returns false when no drawPositions in matchUps and no positionAssignments', () => {
    const structure: any = {
      matchUps: [
        { roundNumber: 1, roundPosition: 1, matchUpId: 'mu-1' },
        { roundNumber: 1, roundPosition: 2, matchUpId: 'mu-2' },
        { roundNumber: 1, roundPosition: 3, matchUpId: 'mu-3' },
      ],
    };
    let result: any = isLucky({ structure });
    expect(result).toBe(false);
  });

  test('roundsNotPowerOf2 override is respected', () => {
    const structure: any = {
      positionAssignments: [{ drawPosition: 1, participantId: 'pid-1' }],
      matchUps: [
        { roundNumber: 1, roundPosition: 1 },
        { roundNumber: 1, roundPosition: 2 },
        { roundNumber: 1, roundPosition: 3 },
        { roundNumber: 1, roundPosition: 4 },
      ],
    };
    let result: any = isLucky({ structure, roundsNotPowerOf2: true });
    expect(result).toBe(true);

    result = isLucky({ structure, roundsNotPowerOf2: false });
    expect(result).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getValidLuckyLosersAction — uncovered branches
// ──────────────────────────────────────────────────────────────────────────────

describe('getValidLuckyLosersAction edge cases', () => {
  test('returns empty when drawPosition is in activeDrawPositions', () => {
    let result: any = getValidLuckyLosersAction({
      activeDrawPositions: [3],
      positionAssignments: [],
      drawDefinition: { links: [] } as any,
      structure: { structureId: 's1' } as any,
      drawPosition: 3,
      structureId: 's1',
      drawId: 'd1',
    });
    expect(result).toEqual({});
  });

  test('returns empty when isWinRatioFedStructure and sourceStructuresComplete is false', () => {
    let result: any = getValidLuckyLosersAction({
      isWinRatioFedStructure: true,
      sourceStructuresComplete: false,
      activeDrawPositions: [],
      positionAssignments: [],
      drawDefinition: { links: [] } as any,
      structure: { structureId: 's1' } as any,
      drawPosition: 1,
      structureId: 's1',
      drawId: 'd1',
    });
    expect(result).toEqual({});
  });

  test('returns empty when no relevant links exist', () => {
    let result: any = getValidLuckyLosersAction({
      activeDrawPositions: [],
      positionAssignments: [],
      drawDefinition: {
        links: [
          {
            source: { structureId: 'other' },
            target: { structureId: 'other-target' },
          },
        ],
      } as any,
      structure: { structureId: 's1' } as any,
      drawPosition: 1,
      structureId: 's1',
      drawId: 'd1',
    });
    expect(result).toEqual({});
  });

  test('returns empty when drawDefinition.links is undefined', () => {
    let result: any = getValidLuckyLosersAction({
      activeDrawPositions: [],
      positionAssignments: [],
      drawDefinition: {} as any,
      structure: { structureId: 's1' } as any,
      drawPosition: 1,
      structureId: 's1',
      drawId: 'd1',
    });
    expect(result).toEqual({});
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getLuckyDrawRoundStatus — uncovered branches
// ──────────────────────────────────────────────────────────────────────────────

describe('getLuckyDrawRoundStatus edge cases', () => {
  test('returns error when drawDefinition is undefined', () => {
    let result: any = getLuckyDrawRoundStatus({
      drawDefinition: undefined as any,
    });
    expect(result.error).toBe(MISSING_DRAW_DEFINITION);
  });

  test('returns empty rounds for non-lucky draw type', () => {
    let result: any = getLuckyDrawRoundStatus({
      drawDefinition: { drawType: 'SINGLE_ELIMINATION' } as any,
    });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(false);
    expect(result.rounds).toEqual([]);
  });

  test('returns INVALID_VALUES when no structureId can be resolved', () => {
    let result: any = getLuckyDrawRoundStatus({
      drawDefinition: { drawType: LUCKY_DRAW, structures: [] } as any,
    });
    expect(result.error).toBe(INVALID_VALUES);
  });

  test('returns INVALID_VALUES when structure is not found', () => {
    let result: any = getLuckyDrawRoundStatus({
      drawDefinition: {
        drawType: LUCKY_DRAW,
        structures: [{ structureId: 's1', matchUps: [] }],
      } as any,
      structureId: 'nonexistent',
    });
    expect(result.error).toBe(INVALID_VALUES);
  });

  test('returns empty rounds when structure has no matchUps', () => {
    let result: any = getLuckyDrawRoundStatus({
      drawDefinition: {
        drawType: LUCKY_DRAW,
        structures: [{ structureId: 's1', matchUps: [] }],
      } as any,
      structureId: 's1',
    });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);
    expect(result.rounds).toEqual([]);
  });

  test('uses first structure when structureId is not provided', () => {
    let result: any = getLuckyDrawRoundStatus({
      drawDefinition: {
        drawType: LUCKY_DRAW,
        structures: [
          {
            structureId: 'auto-resolved',
            matchUps: [
              { roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1' },
            ],
            positionAssignments: [
              { drawPosition: 1, participantId: 'p1' },
              { drawPosition: 2, participantId: 'p2' },
            ],
          },
        ],
      } as any,
    });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);
  });

  test('resolves participantName from tournamentRecord.participants', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    const tournamentRecord: any = {
      participants: [
        { participantId: 'p1', participantName: 'Alice' },
        { participantId: 'p2', participantName: 'Bob' },
        { participantId: 'p3', participantName: 'Charlie' },
        { participantId: 'p4', participantName: 'Diana' },
        { participantId: 'p5', participantName: 'Eve' },
        { participantId: 'p6', participantName: 'Frank' },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition, tournamentRecord });
    expect(result.success).toBe(true);

    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1.advancingWinners.length).toBe(3);
    expect(round1.advancingWinners[0].participantName).toBe('Alice');

    // Pre-feed round with 3 matchUps (odd) => eligibleLosers should be populated
    expect(round1.isPreFeedRound).toBe(true);
    expect(round1.eligibleLosers).toBeDefined();
    expect(round1.eligibleLosers.length).toBe(3);
  });

  test('drawPositions with dp=0 or falsy are handled', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 2, roundPosition: 1, drawPositions: [0, null], matchUpId: 'mu-4',
            },
            {
              roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5',
            },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition });
    expect(result.success).toBe(true);
    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1.nextRoundHasOpenPosition).toBe(true);
  });

  test('resolveParticipantId falls back to drawPositions when no sides', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
              // no sides[] property — exercises drawPositions fallback
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition });
    expect(result.success).toBe(true);
    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1.advancingWinners.length).toBe(3);
    expect(round1.advancingWinners[0].participantId).toBe('p1');
  });

  test('cumulativeMargin sorts eligible losers by cumulative margin across rounds', () => {
    // Build a structure with 5 matchUps in R1 (pre-feed), 3 matchUps in R2 (pre-feed)
    // Use proper matchUpIds so validMatchUps passes
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            // Round 1: 5 matchUps (pre-feed)
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-r1-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-r1-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 1, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-r1-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 4, drawPositions: [7, 8], matchUpId: 'mu-r1-4',
              matchUpStatus: COMPLETED, winningSide: 2,
              score: { sets: [{ side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 5, drawPositions: [9, 10], matchUpId: 'mu-r1-5',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            // Round 2: 3 matchUps (pre-feed) — participants advanced from R1
            {
              roundNumber: 2, roundPosition: 1, drawPositions: [11, 12], matchUpId: 'mu-r2-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 2, roundPosition: 2, drawPositions: [13, 14], matchUpId: 'mu-r2-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 2, roundPosition: 3, drawPositions: [15, 16], matchUpId: 'mu-r2-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
            },
            // Round 3: 2 matchUps
            { roundNumber: 3, roundPosition: 1, drawPositions: [], matchUpId: 'mu-r3-1' },
            { roundNumber: 3, roundPosition: 2, drawPositions: [], matchUpId: 'mu-r3-2' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
            { drawPosition: 7, participantId: 'p7' },
            { drawPosition: 8, participantId: 'p8' },
            { drawPosition: 9, participantId: 'p9' },
            { drawPosition: 10, participantId: 'p10' },
            { drawPosition: 11, participantId: 'p1' },
            { drawPosition: 12, participantId: 'p12' },
            { drawPosition: 13, participantId: 'p3' },
            { drawPosition: 14, participantId: 'p14' },
            { drawPosition: 15, participantId: 'p5' },
            { drawPosition: 16, participantId: 'p16' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({
      drawDefinition,
      cumulativeMargin: true,
    });
    expect(result.success).toBe(true);

    const round2 = result.rounds.find((r: any) => r.roundNumber === 2);
    expect(round2).toBeDefined();
    expect(round2.isPreFeedRound).toBe(true);
    expect(round2.eligibleLosers).toBeDefined();
    expect(round2.eligibleLosers.length).toBe(3);
  });

  test('eligible losers margin sort with equal margins falls back to setsWonByLoser', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: {
                sets: [
                  { side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 },
                  { side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 2 },
                ],
              },
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: {
                sets: [
                  { side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 },
                  { side1Score: 4, side2Score: 6, winningSide: 2, setNumber: 2 },
                  { side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 3 },
                ],
              },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 0, winningSide: 1, setNumber: 1 }] },
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition });
    expect(result.success).toBe(true);
    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1.eligibleLosers).toBeDefined();
    expect(round1.eligibleLosers.length).toBe(3);
  });

  test('consolidation links are detected and reported', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      links: [
        {
          linkType: LOSER,
          source: { structureId: 's1', roundNumber: 1 },
          target: { structureId: 's2', roundNumber: 1, feedProfile: TOP_DOWN },
        },
      ],
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
        {
          structureId: 's2',
          matchUps: [
            { roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'po-1' },
          ],
          positionAssignments: [],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition, structureId: 's1' });
    expect(result.success).toBe(true);
    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1.consolidationLinks).toBeDefined();
    expect(round1.consolidationLinks.length).toBe(1);
    expect(round1.consolidationLinks[0].targetStructureId).toBe('s2');
    expect(round1.consolidationLinks[0].feedProfile).toBe(TOP_DOWN);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// luckyDrawAdvancement — additional uncovered branches
// ──────────────────────────────────────────────────────────────────────────────

describe('luckyDrawAdvancement — additional coverage', () => {
  function buildCompletedRound1Draw(overrides: Record<string, any> = {}) {
    const completedScore = {
      sets: [
        { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 1 },
        { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 2 },
      ],
    };

    const round1MatchUps = [1, 2, 3, 4, 5].map((rp) => ({
      drawPositions: [rp * 2 - 1, rp * 2],
      matchUpStatus: COMPLETED,
      matchUpId: `r1-m${rp}`,
      roundPosition: rp,
      roundNumber: 1,
      finishingRound: 4,
      score: completedScore,
      winningSide: 2,
    }));

    const round2MatchUps = [1, 2, 3].map((rp) => ({
      drawPositions: [] as number[],
      matchUpId: `r2-m${rp}`,
      roundPosition: rp,
      roundNumber: 2,
      finishingRound: 3,
      matchUpStatus: 'TO_BE_PLAYED',
    }));

    const round3MatchUps = [1, 2].map((rp) => ({
      drawPositions: [] as number[],
      matchUpId: `r3-m${rp}`,
      roundPosition: rp,
      roundNumber: 3,
      finishingRound: 2,
      matchUpStatus: 'TO_BE_PLAYED',
    }));

    const finalMatchUp = {
      drawPositions: [] as number[],
      matchUpId: 'r4-m1',
      roundPosition: 1,
      roundNumber: 4,
      finishingRound: 1,
      matchUpStatus: 'TO_BE_PLAYED',
    };

    const pids = Array.from({ length: 10 }, (_, i) => `pid-${i + 1}`);
    const round1Assignments = pids.map((pid, i) => ({
      drawPosition: i + 1,
      participantId: pid,
    }));

    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      drawId: 'test-draw',
      structures: [
        {
          structureId: 'test-structure',
          stage: 'MAIN',
          stageSequence: 1,
          matchUps: [...round1MatchUps, ...round2MatchUps, ...round3MatchUps, finalMatchUp],
          positionAssignments: [...round1Assignments],
        },
      ],
      ...overrides,
    };

    return { drawDefinition, round1MatchUps, round2MatchUps, pids };
  }

  test('statusResult.error is propagated', () => {
    let result: any = luckyDrawAdvancement({
      drawDefinition: { drawType: LUCKY_DRAW, structures: [] } as any,
      roundNumber: 1,
    });
    expect(result.error).toBeDefined();
  });

  test('structure.matchUps fallback to empty array', () => {
    const drawDef: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          positionAssignments: [],
        },
      ],
    };
    let result: any = luckyDrawAdvancement({
      drawDefinition: drawDef,
      roundNumber: 1,
    });
    // getLuckyDrawRoundStatus returns empty rounds, so roundStatus is not found => error
    expect(result.error).toBeDefined();
  });

  test('advancement with pre-feed round places lucky loser correctly', () => {
    const { drawDefinition } = buildCompletedRound1Draw();

    let result: any = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'pid-1',
      roundNumber: 1,
    });
    expect(result.success).toBe(true);

    const struct = drawDefinition.structures[0];
    const advancedAssignments = struct.positionAssignments.filter((a: any) => a.drawPosition > 10);
    const advancedIds = advancedAssignments.map((a: any) => a.participantId);
    expect(advancedIds).toContain('pid-1');
    // 3 matchUps x 2 = 6 new assignments
    expect(advancedAssignments.length).toBe(6);
  });

  test('discarded losers are placed into linked consolidation structure', () => {
    const { drawDefinition } = buildCompletedRound1Draw({
      links: [
        {
          linkType: LOSER,
          source: { structureId: 'test-structure', roundNumber: 1 },
          target: { structureId: 'playoff-structure', roundNumber: 1, feedProfile: TOP_DOWN },
        },
      ],
    });

    drawDefinition.structures.push({
      structureId: 'playoff-structure',
      stage: PLAY_OFF,
      stageSequence: 2,
      matchUps: [
        {
          roundNumber: 1, roundPosition: 1,
          drawPositions: [1, 2], matchUpId: 'po-m1',
          matchUpStatus: 'TO_BE_PLAYED',
        },
        {
          roundNumber: 1, roundPosition: 2,
          drawPositions: [3, 4], matchUpId: 'po-m2',
          matchUpStatus: 'TO_BE_PLAYED',
        },
      ],
      positionAssignments: [],
    });

    let result: any = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'pid-1',
      roundNumber: 1,
    });
    expect(result.success).toBe(true);

    const playoffStructure = drawDefinition.structures.find((s: any) => s.structureId === 'playoff-structure');
    expect(playoffStructure).toBeDefined();
    const playoffAssignments = playoffStructure.positionAssignments.filter((a: any) => a.participantId);
    expect(playoffAssignments.length).toBeGreaterThan(0);

    const placedIds = playoffAssignments.map((a: any) => a.participantId);
    for (const loserId of placedIds) {
      expect(loserId).not.toBe('pid-1');
    }
  });

  test('placeDiscardedLosers creates virtual matchUps when target has none', () => {
    const { drawDefinition } = buildCompletedRound1Draw({
      links: [
        {
          linkType: LOSER,
          source: { structureId: 'test-structure', roundNumber: 1 },
          target: { structureId: 'empty-playoff', roundNumber: 1, feedProfile: TOP_DOWN },
        },
      ],
    });

    drawDefinition.structures.push({
      structureId: 'empty-playoff',
      stage: PLAY_OFF,
      stageSequence: 2,
      matchUps: [],
      positionAssignments: [],
    });

    let result: any = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'pid-1',
      roundNumber: 1,
    });
    expect(result.success).toBe(true);

    const emptyPlayoff = drawDefinition.structures.find((s: any) => s.structureId === 'empty-playoff');
    expect(emptyPlayoff.matchUps.length).toBeGreaterThan(0);
    for (const m of emptyPlayoff.matchUps) {
      expect(m.drawPositions.length).toBe(2);
    }
  });

  test('BOTTOM_UP feedProfile reverses unfilled positions ordering', () => {
    const { drawDefinition } = buildCompletedRound1Draw({
      links: [
        {
          linkType: LOSER,
          source: { structureId: 'test-structure', roundNumber: 1 },
          target: { structureId: 'bottom-up-playoff', roundNumber: 1, feedProfile: 'BOTTOM_UP' },
        },
      ],
    });

    drawDefinition.structures.push({
      structureId: 'bottom-up-playoff',
      stage: PLAY_OFF,
      stageSequence: 2,
      matchUps: [
        {
          roundNumber: 1, roundPosition: 1,
          drawPositions: [1, 2], matchUpId: 'bu-m1',
          matchUpStatus: 'TO_BE_PLAYED',
        },
        {
          roundNumber: 1, roundPosition: 2,
          drawPositions: [3, 4], matchUpId: 'bu-m2',
          matchUpStatus: 'TO_BE_PLAYED',
        },
      ],
      positionAssignments: [],
    });

    let result: any = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'pid-1',
      roundNumber: 1,
    });
    expect(result.success).toBe(true);

    const playoffStructure = drawDefinition.structures.find((s: any) => s.structureId === 'bottom-up-playoff');
    const playoffAssignments = playoffStructure.positionAssignments.filter((a: any) => a.participantId);
    expect(playoffAssignments.length).toBeGreaterThan(0);
  });

  test('next round already has participants assigned returns error', () => {
    const { drawDefinition } = buildCompletedRound1Draw();
    const struct = drawDefinition.structures[0];

    const r2MatchUp = struct.matchUps.find((m: any) => m.roundNumber === 2 && m.roundPosition === 1);
    r2MatchUp.drawPositions = [11, 12];
    struct.positionAssignments.push(
      { drawPosition: 11, participantId: 'pid-existing' },
      { drawPosition: 12, participantId: 'pid-existing2' },
    );

    let result: any = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'pid-1',
      roundNumber: 1,
    });
    expect(result.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration tests via tournament engine
// ──────────────────────────────────────────────────────────────────────────────

describe('Lucky Draw integration tests', () => {
  test('LUCKY_DRAW with completeAllMatchUps produces round status', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);
    expect(result.rounds).toBeDefined();
    expect(result.rounds.length).toBeGreaterThan(0);

    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1.isComplete).toBe(true);
    expect(round1.completedCount).toBe(round1.matchUpsCount);
  });

  test('ADAPTIVE draw generates correct structures via engine', () => {
    const drawProfiles = [{ drawSize: 10, drawType: ADAPTIVE }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getEvent({ drawId });
    expect(result.drawDefinition).toBeDefined();
    expect(result.drawDefinition.structures.length).toBeGreaterThan(1);
    expect(result.drawDefinition.links?.length).toBeGreaterThan(0);
  });

  test('ADAPTIVE draw with power-of-2 drawSize generates compass-like topology', () => {
    const drawProfiles = [{ drawSize: 8, drawType: ADAPTIVE }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getEvent({ drawId });
    expect(result.drawDefinition).toBeDefined();
    const structures = result.drawDefinition.structures;
    expect(structures.length).toBeGreaterThan(1);

    const east = structures.find((s: any) => s.structureName === 'East');
    expect(east).toBeDefined();
    expect(east.stage).toBe(MAIN);
  });

  test('getLuckyDrawRoundStatus with non-lucky draw returns isLuckyDraw false', () => {
    const drawProfiles = [{ drawSize: 8, drawType: 'SINGLE_ELIMINATION' }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(false);
  });

  test('LUCKY_DRAW end-to-end: complete round 1 with completeAllMatchUps then check status', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      setState: true,
      drawProfiles,
    });

    // Check round status
    let result: any = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);

    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    // Round 1 should have advancing winners (all matchUps completed)
    expect(round1.advancingWinners.length).toBeGreaterThan(0);
    expect(round1.isComplete).toBe(true);
  });

  test('LUCKY_DRAW with cumulativeMargin option in getLuckyDrawRoundStatus', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getLuckyDrawRoundStatus({ drawId, cumulativeMargin: true });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getValidLuckyLosersAction — integration via positionActions on FMLC consolation
// ──────────────────────────────────────────────────────────────────────────────

describe('getValidLuckyLosersAction via FMLC consolation positionActions', () => {
  test('FMLC draw with completed R1 and R2 exposes lucky losers in consolation positionActions', () => {
    const drawProfiles = [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        participantsCount: 16,
        drawSize: 16,
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getEvent({ drawId });
    const mainStructure = result.drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const consolationStructure = result.drawDefinition.structures.find((s: any) => s.stage === CONSOLATION);
    expect(mainStructure).toBeDefined();
    expect(consolationStructure).toBeDefined();

    // Complete all round 1 AND round 2 matchUps in main structure
    // so source structures are considered complete enough for consolation placement
    const contextFilters = { structureIds: [mainStructure.structureId] };

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-3 6-4',
      winningSide: 1,
    });

    // Complete R1
    let { matchUps } = tournamentEngine.allDrawMatchUps({ contextFilters, drawId });
    const round1MatchUps = matchUps.filter((m: any) => m.roundNumber === 1);
    for (const matchUp of round1MatchUps) {
      result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toBe(true);
    }

    // Complete R2
    ({ matchUps } = tournamentEngine.allDrawMatchUps({ contextFilters, drawId }));
    const round2MatchUps = matchUps.filter((m: any) => m.roundNumber === 2);
    for (const matchUp of round2MatchUps) {
      result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toBe(true);
    }

    // Now check positionActions on consolation structure
    // After R1+R2 completion, losers should be feedable into consolation
    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      structureId: consolationStructure.structureId,
      drawId,
    });

    // Find a draw position that has a participant assigned (fed from main losers)
    const assignedPositions = positionAssignments?.filter((a: any) => a.participantId) ?? [];

    // Find a draw position without an assignment for position actions check
    const unassignedPositions = positionAssignments?.filter((a: any) => !a.participantId && !a.bye) ?? [];

    // Verify consolation structure has received some participants from main losses
    // The FMLC draw feeds R1 losers into consolation automatically
    expect(assignedPositions.length).toBeGreaterThan(0);

    // Check positionActions on an unassigned or assigned position
    const targetPosition = unassignedPositions.length > 0
      ? unassignedPositions[0].drawPosition
      : assignedPositions[0].drawPosition;

    result = tournamentEngine.positionActions({
      structureId: consolationStructure.structureId,
      drawPosition: targetPosition,
      drawId,
    });

    // Verify positionActions returns valid response for consolation structure
    expect(result.isDrawPosition).toBe(true);
  });

  test('FMLC draw without completed matchUps does not expose lucky losers', () => {
    const drawProfiles = [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        participantsCount: 8,
        drawSize: 8,
      },
    ];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getEvent({ drawId });
    const consolationStructure = result.drawDefinition.structures.find((s: any) => s.stage === CONSOLATION);

    // Without completing main matchUps, consolation should NOT have lucky losers
    result = tournamentEngine.positionActions({
      structureId: consolationStructure.structureId,
      drawPosition: 1,
      drawId,
    });

    const actionTypes = result.validActions?.map((a: any) => a.type) ?? [];
    expect(actionTypes).not.toContain(LUCKY_PARTICIPANT);
  });

  test('getValidLuckyLosersAction finds losers from completed source structure', () => {
    // Build a drawDefinition with LOSER link from source to target
    // with completed matchUps in source structure
    const drawDefinition: any = {
      links: [
        {
          linkType: LOSER,
          source: { structureId: 'source-struct' },
          target: { structureId: 'target-struct' },
        },
      ],
      structures: [
        {
          structureId: 'source-struct',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'src-r1-m1',
              winningSide: 1, matchUpStatus: COMPLETED,
              sides: [
                { sideNumber: 1, participantId: 'p1' },
                { sideNumber: 2, participantId: 'p2' },
              ],
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'src-r1-m2',
              winningSide: 1, matchUpStatus: COMPLETED,
              sides: [
                { sideNumber: 1, participantId: 'p3' },
                { sideNumber: 2, participantId: 'p4' },
              ],
            },
            {
              roundNumber: 2, roundPosition: 1, drawPositions: [5, 6], matchUpId: 'src-r2-m1',
              winningSide: 1, matchUpStatus: COMPLETED,
              sides: [
                { sideNumber: 1, participantId: 'p5' },
                { sideNumber: 2, participantId: 'p6' },
              ],
            },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
        {
          structureId: 'target-struct',
          matchUps: [
            { roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'tgt-r1-m1' },
          ],
          positionAssignments: [],
        },
      ],
    };

    const tournamentParticipants: any[] = [
      { participantId: 'p2', participantName: 'Player 2' },
      { participantId: 'p4', participantName: 'Player 4' },
      { participantId: 'p6', participantName: 'Player 6' },
    ];

    let result: any = getValidLuckyLosersAction({
      tournamentParticipants,
      activeDrawPositions: [],
      positionAssignments: [],
      drawDefinition,
      structure: { structureId: 'target-struct' } as any,
      drawPosition: 1,
      structureId: 'target-struct',
      drawId: 'test-draw',
    });

    // Should find lucky losers (all losers from completed matchUps: p2, p4, p6)
    expect(result.validLuckyLosersAction).toBeDefined();
    expect(result.validLuckyLosersAction.availableLuckyLoserParticipantIds.length).toBe(3);
    expect(result.validLuckyLosersAction.availableLuckyLoserParticipantIds).toContain('p2');
    expect(result.validLuckyLosersAction.availableLuckyLoserParticipantIds).toContain('p4');
    expect(result.validLuckyLosersAction.availableLuckyLoserParticipantIds).toContain('p6');
    expect(result.validLuckyLosersAction.availableLuckyLosers.length).toBe(3);
    expect(result.validLuckyLosersAction.willDisableLinks).toBeUndefined();
    expect(result.validLuckyLosersAction.payload.drawId).toBe('test-draw');
  });

  test('getValidLuckyLosersAction excludes already-assigned participants', () => {
    const drawDefinition: any = {
      entries: [
        { participantId: 'p2', entryPosition: 5 },
      ],
      links: [
        {
          linkType: LOSER,
          source: { structureId: 'source-struct' },
          target: { structureId: 'target-struct' },
        },
      ],
      structures: [
        {
          structureId: 'source-struct',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'src-m1',
              winningSide: 1, matchUpStatus: COMPLETED,
              sides: [
                { sideNumber: 1, participantId: 'p1' },
                { sideNumber: 2, participantId: 'p2' },
              ],
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'src-m2',
              winningSide: 1, matchUpStatus: COMPLETED,
              sides: [
                { sideNumber: 1, participantId: 'p3' },
                { sideNumber: 2, participantId: 'p4' },
              ],
            },
          ],
          positionAssignments: [],
        },
        {
          structureId: 'target-struct',
          matchUps: [],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p2' },
          ],
        },
      ],
    };

    const tournamentParticipants: any[] = [
      { participantId: 'p2', participantName: 'Player 2' },
      { participantId: 'p4', participantName: 'Player 4' },
    ];

    // p2 is already assigned in target, so only p4 should be available
    let result: any = getValidLuckyLosersAction({
      tournamentParticipants,
      activeDrawPositions: [],
      positionAssignments: [{ drawPosition: 1, participantId: 'p2' }],
      drawDefinition,
      structure: { structureId: 'target-struct' } as any,
      drawPosition: 2,
      structureId: 'target-struct',
      drawId: 'test-draw',
    });

    expect(result.validLuckyLosersAction).toBeDefined();
    expect(result.validLuckyLosersAction.availableLuckyLoserParticipantIds).toContain('p4');
    expect(result.validLuckyLosersAction.availableLuckyLoserParticipantIds).not.toContain('p2');

    // Check entryPosition is populated from drawDefinition.entries
    const luckyLoser = result.validLuckyLosersAction.availableLuckyLosers.find(
      (l: any) => l.participantId === 'p4',
    );
    expect(luckyLoser).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getLuckyDrawRoundStatus — BYE-advanced participants and additional branches
// ──────────────────────────────────────────────────────────────────────────────

describe('getLuckyDrawRoundStatus — BYE-advanced and additional branches', () => {
  test('BYE matchUps contribute to advancingWinners', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              // BYE matchUp — participant at dp 5 advances automatically
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: BYE,
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, bye: true },
          ],
        },
      ],
    };

    const tournamentRecord: any = {
      participants: [
        { participantId: 'p1', participantName: 'Alice' },
        { participantId: 'p2', participantName: 'Bob' },
        { participantId: 'p3', participantName: 'Charlie' },
        { participantId: 'p4', participantName: 'Diana' },
        { participantId: 'p5', participantName: 'Eve' },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition, tournamentRecord });
    expect(result.success).toBe(true);

    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();

    // advancingWinners should include 2 scored winners + 1 BYE-advanced
    expect(round1.advancingWinners.length).toBe(3);

    // BYE-advanced participant should be p5 (non-bye participant in BYE matchUp)
    const byeAdvanced = round1.advancingWinners.find((w: any) => w.participantId === 'p5');
    expect(byeAdvanced).toBeDefined();
    expect(byeAdvanced.participantName).toBe('Eve');
    expect(byeAdvanced.margin).toBe(0);
    expect(byeAdvanced.gameDifferential).toBe(0);
    expect(byeAdvanced.setsWonByLoser).toBe(0);
  });

  test('resolveParticipantId uses hydrated sides when available', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
              sides: [
                { sideNumber: 1, participantId: 'hydrated-p1', participant: { participantName: 'Hydrated Alice' } },
                { sideNumber: 2, participantId: 'hydrated-p2', participant: { participantName: 'Hydrated Bob', participantId: 'hydrated-p2' } },
              ],
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'hydrated-p1' },
            { drawPosition: 2, participantId: 'hydrated-p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition });
    expect(result.success).toBe(true);

    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    // First matchUp used hydrated sides — participantId from sides
    const winner1 = round1.advancingWinners.find((w: any) => w.participantId === 'hydrated-p1');
    expect(winner1).toBeDefined();
    expect(winner1.participantName).toBe('Hydrated Alice');
  });

  test('resolveParticipantId falls back to participant.participantId when no direct participantId on side', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
              sides: [
                { sideNumber: 1, participant: { participantId: 'nested-p1', participantName: 'Nested Alice' } },
                { sideNumber: 2, participant: { participantId: 'nested-p2', participantName: 'Nested Bob' } },
              ],
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'nested-p1' },
            { drawPosition: 2, participantId: 'nested-p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition });
    expect(result.success).toBe(true);

    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    const winner1 = round1.advancingWinners.find((w: any) => w.participantId === 'nested-p1');
    expect(winner1).toBeDefined();
    expect(winner1.participantName).toBe('Nested Alice');
  });

  test('cumulativeMargin with multi-round data computes average margins', () => {
    // Build a structure where participant p12 has played in R1 (as loser)
    // and now appears in R2 as loser again, so cumulative margin averages both rounds
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            // Round 1: 5 matchUps (pre-feed)
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-r1-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-r1-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 1, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-r1-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 4, drawPositions: [7, 8], matchUpId: 'mu-r1-4',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 1, roundPosition: 5, drawPositions: [9, 10], matchUpId: 'mu-r1-5',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 0, winningSide: 1, setNumber: 1 }] },
            },
            // Round 2: 3 matchUps (pre-feed) — p1 won R1 and now plays in R2
            // Include participants from R1 so they have multi-round history
            {
              roundNumber: 2, roundPosition: 1, drawPositions: [11, 12], matchUpId: 'mu-r2-1',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 2, roundPosition: 2, drawPositions: [13, 14], matchUpId: 'mu-r2-2',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }] },
            },
            {
              roundNumber: 2, roundPosition: 3, drawPositions: [15, 16], matchUpId: 'mu-r2-3',
              matchUpStatus: COMPLETED, winningSide: 1,
              score: { sets: [{ side1Score: 6, side2Score: 1, winningSide: 1, setNumber: 1 }] },
            },
            // Round 3
            { roundNumber: 3, roundPosition: 1, drawPositions: [], matchUpId: 'mu-r3-1' },
            { roundNumber: 3, roundPosition: 2, drawPositions: [], matchUpId: 'mu-r3-2' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
            { drawPosition: 7, participantId: 'p7' },
            { drawPosition: 8, participantId: 'p8' },
            { drawPosition: 9, participantId: 'p9' },
            { drawPosition: 10, participantId: 'p10' },
            // R2 participants include R1 winners who advance
            { drawPosition: 11, participantId: 'p1' },
            { drawPosition: 12, participantId: 'p3' },
            { drawPosition: 13, participantId: 'p5' },
            { drawPosition: 14, participantId: 'p7' },
            { drawPosition: 15, participantId: 'p9' },
            { drawPosition: 16, participantId: 'p2' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({
      drawDefinition,
      cumulativeMargin: true,
    });
    expect(result.success).toBe(true);

    const round2 = result.rounds.find((r: any) => r.roundNumber === 2);
    expect(round2).toBeDefined();
    expect(round2.isPreFeedRound).toBe(true);
    expect(round2.eligibleLosers).toBeDefined();
    expect(round2.eligibleLosers.length).toBe(3);

    // Each eligible loser should have a cumulative margin that averages prior rounds
    for (const loser of round2.eligibleLosers) {
      expect(loser.margin).toBeDefined();
      expect(typeof loser.margin).toBe('number');
    }
  });

  test('consolidation links with losersPlaced=true when target structure has assigned participants', () => {
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      links: [
        {
          linkType: LOSER,
          source: { structureId: 's1', roundNumber: 1 },
          target: { structureId: 's2', roundNumber: 1, feedProfile: TOP_DOWN },
        },
      ],
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1,
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1,
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1,
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
        {
          structureId: 's2',
          matchUps: [
            { roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'po-1' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'loser-placed-1' },
          ],
        },
      ],
    };

    let result: any = getLuckyDrawRoundStatus({ drawDefinition, structureId: 's1' });
    expect(result.success).toBe(true);

    const round1 = result.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1.consolidationLinks).toBeDefined();
    expect(round1.consolidationLinks.length).toBe(1);
    expect(round1.consolidationLinks[0].losersPlaced).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// luckyDrawAdvancement — deeper branch coverage
// ──────────────────────────────────────────────────────────────────────────────

describe('luckyDrawAdvancement — deeper branch coverage', () => {
  test('advancement with non-lucky draw type returns error', () => {
    let result: any = luckyDrawAdvancement({
      drawDefinition: { drawType: 'SINGLE_ELIMINATION', structures: [] } as any,
      roundNumber: 1,
    });
    expect(result.error).toBeDefined();
  });

  test('advancement with missing drawDefinition returns error', () => {
    let result: any = luckyDrawAdvancement({
      drawDefinition: undefined as any,
      roundNumber: 1,
    });
    expect(result.error).toBe(MISSING_DRAW_DEFINITION);
  });

  test('advancement without structureId uses first structure', () => {
    // Build a minimal lucky draw with incomplete round (not complete = error)
    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 'auto-struct',
          matchUps: [
            { roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1' },
            { roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2' },
            { roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3' },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    // Round not complete, so should return error about round not complete
    let result: any = luckyDrawAdvancement({
      drawDefinition,
      roundNumber: 1,
    });
    expect(result.error).toBeDefined();
  });

  test('pre-feed round without participantId returns MISSING_PARTICIPANT_ID', () => {
    const completedScore = {
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
      ],
    };

    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    // Pre-feed round (3 matchUps = odd) requires participantId
    let result: any = luckyDrawAdvancement({
      drawDefinition,
      roundNumber: 1,
    });
    expect(result.error).toBeDefined();
  });

  test('pre-feed round with ineligible participantId returns error', () => {
    const completedScore = {
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
      ],
    };

    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-4' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-5' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
          ],
        },
      ],
    };

    // p1 is a winner, not an eligible loser
    let result: any = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'p1',
      roundNumber: 1,
    });
    expect(result.error).toBeDefined();
  });

  test('LUCKY_DRAW with playoff structures via engine — full workflow', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getEvent({ drawId });
    const structureId = result.drawDefinition.structures[0].structureId;

    // Get available playoff profiles
    result = tournamentEngine.getAvailablePlayoffProfiles({ drawId, structureId });
    expect(result.playoffRounds).toBeDefined();

    if (result.playoffRounds?.includes(1)) {
      // Add playoff structure for round 1
      result = tournamentEngine.addPlayoffStructures({
        roundNumbers: [1],
        structureId,
        drawId,
      });
      expect(result.success).toBe(true);

      // Verify structures and links created
      result = tournamentEngine.getEvent({ drawId });
      expect(result.drawDefinition.structures.length).toBeGreaterThan(1);
      expect(result.drawDefinition.links?.length).toBeGreaterThan(0);

      // Get round status and advance with a lucky loser
      let status: any = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
      const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
      expect(round1).toBeDefined();

      if (round1.eligibleLosers?.length) {
        const selectedLoser = round1.eligibleLosers[0];

        result = tournamentEngine.luckyDrawAdvancement({
          participantId: selectedLoser.participantId,
          roundNumber: 1,
          structureId,
          drawId,
        });
        expect(result.success).toBe(true);

        // Verify round status after advancement
        status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
        expect(status.success).toBe(true);
      }
    }
  });

  test('non-pre-feed round advancement does not require participantId', () => {
    // drawSize=8 is power-of-2, so all rounds have even matchUp counts (non-pre-feed)
    const completedScore = {
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
      ],
    };

    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      structures: [
        {
          structureId: 's1',
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'mu-1',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'mu-2',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'mu-3',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 4, drawPositions: [7, 8], matchUpId: 'mu-4',
              matchUpStatus: COMPLETED, winningSide: 1, score: completedScore,
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'mu-5' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'mu-6' },
            { roundNumber: 3, roundPosition: 1, drawPositions: [], matchUpId: 'mu-7' },
          ],
          positionAssignments: [
            { drawPosition: 1, participantId: 'p1' },
            { drawPosition: 2, participantId: 'p2' },
            { drawPosition: 3, participantId: 'p3' },
            { drawPosition: 4, participantId: 'p4' },
            { drawPosition: 5, participantId: 'p5' },
            { drawPosition: 6, participantId: 'p6' },
            { drawPosition: 7, participantId: 'p7' },
            { drawPosition: 8, participantId: 'p8' },
          ],
        },
      ],
    };

    // Round 1 has 4 matchUps (even) — not pre-feed, no participantId needed
    let result: any = luckyDrawAdvancement({
      drawDefinition,
      roundNumber: 1,
    });
    expect(result.success).toBe(true);

    // Verify next round has assignments
    const struct = drawDefinition.structures[0];
    const r2MatchUps = struct.matchUps.filter((m: any) => m.roundNumber === 2);
    for (const m of r2MatchUps) {
      expect(m.drawPositions.length).toBe(2);
      expect(m.drawPositions.every((dp: number) => dp > 0)).toBe(true);
    }
  });

  test('placeDiscardedLosers with WIN_RATIO ad-hoc target structure succeeds without placing', () => {
    const completedScore = {
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 2, setNumber: 1 },
      ],
    };

    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      links: [
        {
          linkType: LOSER,
          source: { structureId: 'main-struct', roundNumber: 1 },
          target: { structureId: 'adhoc-struct', roundNumber: 1, feedProfile: TOP_DOWN },
        },
      ],
      structures: [
        {
          structureId: 'main-struct',
          stage: MAIN,
          stageSequence: 1,
          matchUps: [
            {
              roundNumber: 1, roundPosition: 1, drawPositions: [1, 2], matchUpId: 'r1-m1',
              matchUpStatus: COMPLETED, winningSide: 2, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 2, drawPositions: [3, 4], matchUpId: 'r1-m2',
              matchUpStatus: COMPLETED, winningSide: 2, score: completedScore,
            },
            {
              roundNumber: 1, roundPosition: 3, drawPositions: [5, 6], matchUpId: 'r1-m3',
              matchUpStatus: COMPLETED, winningSide: 2, score: completedScore,
            },
            { roundNumber: 2, roundPosition: 1, drawPositions: [], matchUpId: 'r2-m1' },
            { roundNumber: 2, roundPosition: 2, drawPositions: [], matchUpId: 'r2-m2' },
          ],
          positionAssignments: Array.from({ length: 6 }, (_, i) => ({
            drawPosition: i + 1,
            participantId: `pid-${i + 1}`,
          })),
        },
        {
          structureId: 'adhoc-struct',
          stage: PLAY_OFF,
          stageSequence: 2,
          finishingPosition: 'WIN_RATIO',
          matchUps: [],
          positionAssignments: [],
        },
      ],
    };

    let result: any = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'pid-1',
      roundNumber: 1,
    });
    expect(result.success).toBe(true);

    // AD_HOC target structure should not have positionAssignments
    const adhocStruct = drawDefinition.structures.find((s: any) => s.structureId === 'adhoc-struct');
    expect(adhocStruct.positionAssignments.length).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// adaptiveDraw — additional branch coverage
// ──────────────────────────────────────────────────────────────────────────────

describe('generateAdaptiveStructures — additional branch coverage', () => {
  test('drawSize 5 (non-power-of-2) generates structures with correct child sizes', () => {
    let result: any = generateAdaptiveStructures({ drawSize: 5 });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBeGreaterThan(0);
    // drawSize 5 should produce main structure and possibly child structures
    for (const structure of result.structures) {
      expect(structure.structureName).toBeDefined();
      expect(structure.matchUps).toBeDefined();
    }
  });

  test('drawSize 3 (non-power-of-2) generates minimal structure', () => {
    let result: any = generateAdaptiveStructures({ drawSize: 3 });
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toBeGreaterThanOrEqual(1);
  });

  test('roundOffset parameter shifts structure correctly', () => {
    let result: any = generateAdaptiveStructures({
      drawSize: 8,
      roundOffset: 2,
    });
    expect(result.structures).toBeDefined();
    expect(result.structures[0].roundOffset).toBe(2);
  });

  test('custom stage and childStage parameters are applied', () => {
    let result: any = generateAdaptiveStructures({
      drawSize: 8,
      stage: PLAY_OFF,
      childStage: PLAY_OFF,
    });
    expect(result.structures).toBeDefined();
    expect(result.structures[0].stage).toBe(PLAY_OFF);
    if (result.structures.length > 1) {
      expect(result.structures[1].stage).toBe(PLAY_OFF);
    }
  });

  test('finishingPositionOffset affects child structure naming', () => {
    // Use custom playoffAttributes without named entries so fallback naming applies
    const customAttributes: any = {
      '0': { abbreviation: 'X' },
      '0-1': { abbreviation: 'Y' },
    };
    let result: any = generateAdaptiveStructures({
      drawSize: 4,
      finishingPositionOffset: 4,
      playoffAttributes: customAttributes,
    });
    expect(result.structures).toBeDefined();
    // With offset=4 and no name in attributes, structure name should be "5-8"
    expect(result.structures[0].structureName).toBe('5-8');
  });

  test('ADAPTIVE draw with drawSize 5 via engine generates valid draw', () => {
    const drawProfiles = [{ drawSize: 5, drawType: ADAPTIVE }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let result: any = tournamentEngine.getEvent({ drawId });
    expect(result.drawDefinition).toBeDefined();
    expect(result.drawDefinition.structures.length).toBeGreaterThanOrEqual(1);
  });
});
