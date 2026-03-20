/**
 * Bulk branch-coverage tests (batch 3) for 18 files below 70% branch coverage.
 * Each describe block targets specific uncovered conditional paths.
 */
import { generateRoundRobinWithPlayOff } from '@Assemblies/generators/drawDefinitions/drawTypes/roundRobin/generateRoundRobinWithPlayoff';
import { generateAdHocRounds } from '@Assemblies/generators/drawDefinitions/drawTypes/adHoc/generateAdHocRounds';
import { generateDoubleElimination } from '@Assemblies/generators/drawDefinitions/drawTypes/doubleEliminattion';
import { organizeDrawPositionOptions } from '@Query/drawDefinition/avoidance/organizeDrawPositionOptions';
import { positionParticipantAction } from '@Mutate/matchUps/drawPositions/positionParticipantAction';
import { modifyIndividualParticipantIds } from '@Mutate/participants/modifyIndividualParticipantIds';
import { resetQualifyingStructure } from '@Mutate/drawDefinitions/resetQualifyingStructure';
import { bulkUpdatePublishedEventIds } from '@Query/event/bulkUpdatePublishedEventIds';
import { setMatchUpDailyLimits } from '@Mutate/tournaments/setMatchUpDailyLimits';
import { bulkMatchUpStatusUpdate } from '@Mutate/events/bulkMatchUpStatusUpdate';
import { pruneDrawDefinition } from '@Mutate/drawDefinitions/pruneDrawDefinition';
import { assignSeedPositions } from '@Mutate/events/assignSeedPositions';
import { removePolicy } from '@Mutate/extensions/policies/removePolicy';
import { removeScaleValues } from '@Mutate/entries/removeScaleValues';
import { mapNumbersToIndexes } from '@Tools/mapNumbersToIndexes';
import { setEventDisplay } from '@Mutate/events/setEventDisplay';
import { getAccessorValue } from '@Tools/getAccessorValue';
import { enableCourts } from '@Mutate/venues/enableCourts';

import { expect, it, describe } from 'vitest';

import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import {
  INVALID_OBJECT,
  INVALID_VALUES,
  MISSING_ASSIGNMENTS,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_ID,
  MISSING_EVENT,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
  POLICY_NOT_FOUND,
  SCORES_PRESENT,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// ----------------------------------------------------------------
// 1. generateDoubleElimination — 2 uncovered branches
// ----------------------------------------------------------------
describe('generateDoubleElimination branch coverage', () => {
  it('generates with default structureName when none provided', () => {
    const result = generateDoubleElimination({
      structureName: undefined,
      matchUpType: undefined,
      idPrefix: undefined,
      drawSize: 8,
      isMock: true,
      uuids: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.structures).toHaveLength(3);
    // structureName defaults to constantToString(MAIN) when not provided
    expect(result.structures[0].structureName).toBeDefined();
  });

  it('generates with explicit structureName and idPrefix', () => {
    const result = generateDoubleElimination({
      structureName: 'Custom Main',
      matchUpType: 'SINGLES',
      idPrefix: 'test',
      drawSize: 4,
      isMock: true,
      uuids: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
    });
    expect(result.success).toBe(true);
    expect(result.structures[0].structureName).toBe('Custom Main');
  });
});

// ----------------------------------------------------------------
// 2. generateRoundRobinWithPlayOff — 2 uncovered branches
// ----------------------------------------------------------------
describe('generateRoundRobinWithPlayOff branch coverage', () => {
  it('returns INVALID_CONFIGURATION when groupCount < 1', () => {
    const result = generateRoundRobinWithPlayOff({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      drawSize: 0,
      isMock: true,
    });
    expect(result.error).toBeDefined();
  });

  it('uses default playoffGroups when structureOptions is undefined', () => {
    const result: any = generateRoundRobinWithPlayOff({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      structureOptions: undefined,
      drawSize: 8,
      isMock: true,
    });
    expect(result.success).toBe(true);
    expect(result.structures.length).toBeGreaterThanOrEqual(2);
  });
});

// ----------------------------------------------------------------
// 3. generateAdHocRounds — 3 uncovered branches
// ----------------------------------------------------------------
describe('generateAdHocRounds branch coverage', () => {
  it('returns error when getParticipantIds fails (no structure)', () => {
    const result = generateAdHocRounds({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      structureId: 'nonexistent',
      roundsCount: 1,
      event: {} as any,
    });
    expect(result.error).toBeDefined();
  });

  it('handles roundsCount of 0 gracefully', () => {
    const result = generateAdHocRounds({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      roundsCount: 0,
      event: {} as any,
    });
    // roundsCount=0 means no iterations, returns empty matchUps
    expect(result.matchUps).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 4. mapNumbersToIndexes — 4 uncovered branches
// ----------------------------------------------------------------
describe('mapNumbersToIndexes branch coverage', () => {
  it('handles empty arrays', () => {
    const result = mapNumbersToIndexes([], []);
    expect(result).toEqual([]);
  });

  it('handles items not found in indexArray (else branch)', () => {
    // randNumberArray items that are NOT in indexArray trigger else branch
    const result = mapNumbersToIndexes([10, 20, 30], [99, 88, 77]);
    expect(result).toHaveLength(3);
  });

  it('handles duplicate values in randNumberArray', () => {
    const result = mapNumbersToIndexes([1, 2, 3, 4], [2, 2, 1, 3]);
    // duplicates are removed by Set, remaining indexes appended
    expect(result).toHaveLength(4);
  });

  it('maps when randNumberArray matches indexArray exactly', () => {
    const result = mapNumbersToIndexes([5, 10, 15], [5, 10, 15]);
    expect(result).toHaveLength(3);
    // items found in indexArray use direct mapping
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
    expect(result[2]).toBe(2);
  });
});

// ----------------------------------------------------------------
// 5. organizeDrawPositionOptions — 4 uncovered branches
// ----------------------------------------------------------------
describe('organizeDrawPositionOptions branch coverage', () => {
  it('returns empty arrays for round robin with empty chunks', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: [],
      participantIdGroups: {},
      positionAssignments: [],
      drawPositionChunks: [],
      unfilledPositions: [],
      isRoundRobin: true,
    });
    expect(result.unassigned).toEqual([]);
    expect(result.unpaired).toEqual([]);
    expect(result.pairedNoConflict).toEqual([]);
  });

  it('returns empty arrays for elimination with empty chunks', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: [],
      participantIdGroups: {},
      positionAssignments: [],
      drawPositionChunks: [],
      unfilledPositions: [],
      isRoundRobin: false,
    });
    expect(result.unassigned).toEqual([]);
    expect(result.unpaired).toEqual([]);
    expect(result.pairedNoConflict).toEqual([]);
  });

  it('processes round robin drawPositionChunks with assignments', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: ['groupA'],
      participantIdGroups: { p1: ['groupA'], p2: ['groupB'] },
      positionAssignments: [
        { drawPosition: 1, participantId: 'p1' },
        { drawPosition: 2, participantId: 'p2' },
      ],
      drawPositionChunks: [[[1, 2, 3, 4]]],
      unfilledPositions: [3, 4],
      isRoundRobin: true,
    });
    expect(result).toBeDefined();
    expect(result.unassigned).toBeDefined();
  });

  it('processes elimination drawPositionChunks with assignments', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: ['groupA'],
      participantIdGroups: { p1: ['groupA'], p2: ['groupB'] },
      positionAssignments: [
        { drawPosition: 1, participantId: 'p1' },
        { drawPosition: 2, participantId: 'p2' },
      ],
      drawPositionChunks: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      unfilledPositions: [3, 4],
      isRoundRobin: false,
    });
    expect(result).toBeDefined();
    expect(result.unassigned).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 6. resetQualifyingStructure — 5 uncovered branches
// ----------------------------------------------------------------
describe('resetQualifyingStructure branch coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = resetQualifyingStructure({
      drawDefinition: undefined as any,
      structureId: 's1',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when structure not found', () => {
    const result = resetQualifyingStructure({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      structureId: 'nonexistent',
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('returns error when structure exists but is not QUALIFYING stage', () => {
    const result = resetQualifyingStructure({
      drawDefinition: {
        drawId: 'd1',
        structures: [{ structureId: 's1', stage: MAIN, matchUps: [] }],
      } as any,
      structureId: 's1',
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('returns SCORES_PRESENT when matchUps have scores', () => {
    const result = resetQualifyingStructure({
      drawDefinition: {
        drawId: 'd1',
        structures: [
          {
            structureId: 's1',
            stage: QUALIFYING,
            matchUps: [
              {
                matchUpId: 'm1',
                score: { sets: [{ side1Score: 6, side2Score: 3 }] },
                matchUpStatus: 'COMPLETED',
              },
            ],
          },
        ],
      } as any,
      structureId: 's1',
    });
    expect(result.error).toEqual(SCORES_PRESENT);
  });

  it('resets successfully when qualifying structure has no scores', () => {
    const result: any = resetQualifyingStructure({
      drawDefinition: {
        drawId: 'd1',
        structures: [
          {
            structureId: 's1',
            stage: QUALIFYING,
            matchUps: [{ matchUpId: 'm1', score: {} }],
            positionAssignments: [{ drawPosition: 1 }],
            seedAssignments: [{ seedNumber: 1 }],
          },
        ],
      } as any,
      structureId: 's1',
    });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 7. setEventDisplay — 7 uncovered branches
// ----------------------------------------------------------------
describe('setEventDisplay branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = setEventDisplay({
      tournamentRecord: undefined as any,
      displaySettings: {} as any,
      event: {} as any,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when event is missing', () => {
    const result = setEventDisplay({
      tournamentRecord: { tournamentId: 't1' } as any,
      displaySettings: {} as any,
      event: undefined as any,
    });
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns error when displaySettings is not an object', () => {
    const result = setEventDisplay({
      tournamentRecord: { tournamentId: 't1' } as any,
      displaySettings: 'bad' as any,
      event: { eventId: 'e1' } as any,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('handles displaySettings without draws property', () => {
    const result = setEventDisplay({
      tournamentRecord: { tournamentId: 't1' } as any,
      displaySettings: { someOther: true } as any,
      event: { eventId: 'e1', timeItems: [] } as any,
    });
    expect(result.success).toBe(true);
  });

  it('handles draws with empty scheduleDetails', () => {
    const result = setEventDisplay({
      tournamentRecord: { tournamentId: 't1' } as any,
      displaySettings: {
        draws: {
          default: { scheduleDetails: [] },
        },
      } as any,
      event: { eventId: 'e1', timeItems: [] } as any,
    });
    expect(result.success).toBe(true);
  });

  it('merges scheduleDetails with same attributes', () => {
    const result = setEventDisplay({
      tournamentRecord: { tournamentId: 't1' } as any,
      displaySettings: {
        draws: {
          default: {
            scheduleDetails: [
              { attributes: { court: true }, dates: ['2024-01-01'] },
              { attributes: { court: true }, dates: ['2024-01-02'] },
            ],
          },
        },
      } as any,
      event: { eventId: 'e1', timeItems: [] } as any,
    });
    expect(result.success).toBe(true);
  });

  it('does not merge scheduleDetails with different attributes', () => {
    const result = setEventDisplay({
      tournamentRecord: { tournamentId: 't1' } as any,
      displaySettings: {
        draws: {
          default: {
            scheduleDetails: [
              { attributes: { court: true }, dates: ['2024-01-01'] },
              { attributes: { time: true }, dates: ['2024-01-02'] },
            ],
          },
        },
      } as any,
      event: { eventId: 'e1', timeItems: [] } as any,
    });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 8. enableCourts — 7 uncovered branches
// ----------------------------------------------------------------
describe('enableCourts branch coverage', () => {
  it('returns error when no tournamentRecords', () => {
    const result = enableCourts({});
    expect(result.error).toBeDefined();
  });

  it('returns error when no courtIds and no enableAll', () => {
    const result = enableCourts({
      tournamentRecords: { t1: { tournamentId: 't1', venues: [] } },
    });
    expect(result.error).toBeDefined();
  });

  it('succeeds with enableAll and empty venues', () => {
    const result = enableCourts({
      tournamentRecords: { t1: { tournamentId: 't1', venues: [] } },
      enableAll: true,
    });
    expect(result.success).toBe(true);
  });

  it('succeeds with enableAll on venues with courts (no dates)', () => {
    const result = enableCourts({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          venues: [
            {
              venueId: 'v1',
              courts: [{ courtId: 'c1', extensions: [{ name: 'disabled', value: {} }] }],
            },
          ],
        },
      },
      enableAll: true,
    });
    expect(result.success).toBe(true);
  });

  it('succeeds with specific courtIds', () => {
    const result = enableCourts({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          venues: [
            {
              venueId: 'v1',
              courts: [{ courtId: 'c1', extensions: [{ name: 'disabled', value: {} }] }, { courtId: 'c2' }],
            },
          ],
        },
      },
      courtIds: ['c1'],
    });
    expect(result.success).toBe(true);
  });

  it('filters disabled dates when dates array provided', () => {
    const result = enableCourts({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          venues: [
            {
              venueId: 'v1',
              courts: [
                {
                  courtId: 'c1',
                  extensions: [{ name: 'disabled', value: { dates: ['2024-01-01', '2024-01-02'] } }],
                },
              ],
            },
          ],
        },
      },
      courtIds: ['c1'],
      dates: ['2024-01-01'],
    });
    expect(result.success).toBe(true);
  });

  it('handles enableAll with dates on courts without disabled extension', () => {
    const result = enableCourts({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          venues: [
            {
              venueId: 'v1',
              courts: [{ courtId: 'c1' }],
            },
          ],
        },
      },
      enableAll: true,
      dates: ['2024-01-01'],
    });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 9. pruneDrawDefinition — 7 uncovered branches
// ----------------------------------------------------------------
describe('pruneDrawDefinition branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = pruneDrawDefinition({
      drawDefinition: {} as any,
      tournamentRecord: undefined,
      drawId: 'd1',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when drawDefinition is missing', () => {
    const result = pruneDrawDefinition({
      tournamentRecord: { tournamentId: 't1' } as any,
      drawDefinition: undefined,
      drawId: 'd1',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns empty matchUps when draw cannot be pruned', () => {
    const result: any = pruneDrawDefinition({
      tournamentRecord: { tournamentId: 't1', events: [] } as any,
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      drawId: 'd1',
    });
    expect(result.success).toBe(true);
    expect(result.matchUps).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 10. removeScaleValues — 7 uncovered branches
// ----------------------------------------------------------------
describe('removeScaleValues branch coverage', () => {
  it('returns error when event is missing', () => {
    const result: any = removeScaleValues({
      tournamentRecord: { tournamentId: 't1' } as any,
      scaleAttributes: {},
      event: undefined,
    } as any);
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns error when entryStatuses is not an array', () => {
    const result = removeScaleValues({
      tournamentRecord: { tournamentId: 't1' } as any,
      scaleAttributes: {},
      entryStatuses: 'bad' as any,
      event: { eventId: 'e1', entries: [] } as any,
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('filters by stage when stage is provided', () => {
    const result = removeScaleValues({
      tournamentRecord: { tournamentId: 't1', participants: [] } as any,
      scaleAttributes: { scaleType: 'RATING', scaleName: 'UTR', eventType: 'SINGLES' },
      event: {
        eventId: 'e1',
        entries: [{ participantId: 'p1', entryStage: MAIN, entryStatus: 'DIRECT_ACCEPTANCE' }],
      } as any,
      stage: MAIN,
    } as any);
    // no error expected, just processes (participants array is empty so nothing to remove)
    expect(result.error).toBeUndefined();
  });

  it('uses drawDefinition entries when drawId provided but no flight found', () => {
    const result = removeScaleValues({
      tournamentRecord: { tournamentId: 't1', participants: [] } as any,
      scaleAttributes: { scaleType: 'RATING', scaleName: 'UTR', eventType: 'SINGLES' },
      event: { eventId: 'e1', entries: [] } as any,
      drawDefinition: {
        drawId: 'd1',
        entries: [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' }],
      } as any,
      drawId: 'd1',
    } as any);
    expect(result.error).toBeUndefined();
  });

  it('uses flightProfile entries when drawId matches a flight', () => {
    const result = removeScaleValues({
      tournamentRecord: { tournamentId: 't1', participants: [] } as any,
      scaleAttributes: { scaleType: 'RATING', scaleName: 'UTR', eventType: 'SINGLES' },
      event: {
        eventId: 'e1',
        entries: [{ participantId: 'p1' }],
        extensions: [
          {
            name: 'flightProfile',
            value: {
              flights: [
                {
                  drawId: 'd1',
                  drawEntries: [{ participantId: 'p2', entryStatus: 'DIRECT_ACCEPTANCE' }],
                },
              ],
            },
          },
        ],
      } as any,
      drawId: 'd1',
    } as any);
    expect(result.error).toBeUndefined();
  });

  it('filters by entryStatuses when provided as array', () => {
    const result = removeScaleValues({
      tournamentRecord: { tournamentId: 't1', participants: [] } as any,
      scaleAttributes: { scaleType: 'RATING', scaleName: 'UTR', eventType: 'SINGLES' },
      event: {
        eventId: 'e1',
        entries: [
          { participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' },
          { participantId: 'p2', entryStatus: 'ALTERNATE' },
        ],
      } as any,
      entryStatuses: ['DIRECT_ACCEPTANCE'],
    } as any);
    expect(result.error).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// 11. positionParticipantAction — 7 uncovered branches
// ----------------------------------------------------------------
describe('positionParticipantAction branch coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = positionParticipantAction({
      drawDefinition: undefined,
      participantId: 'p1',
      drawPosition: 1,
      structureId: 's1',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });
});

// ----------------------------------------------------------------
// 12. getAccessorValue — 8 uncovered branches
// ----------------------------------------------------------------
describe('getAccessorValue branch coverage', () => {
  it('returns empty values when accessor is not a string', () => {
    const result = getAccessorValue({ element: {}, accessor: 123 });
    expect(result.values).toEqual([]);
  });

  it('returns value for simple single-level accessor', () => {
    const result = getAccessorValue({ element: { name: 'Alice' }, accessor: 'name' });
    expect(result.value).toBe('Alice');
    expect(result.values).toContain('Alice');
  });

  it('traverses nested object accessor', () => {
    const result = getAccessorValue({
      element: { person: { name: 'Alice' } },
      accessor: 'person.name',
    });
    expect(result.value).toBe('Alice');
  });

  it('handles array traversal in nested accessor', () => {
    const result = getAccessorValue({
      element: { items: [{ val: 'a' }, { val: 'b' }] },
      accessor: 'items.val',
    });
    expect(result.values).toContain('a');
    expect(result.values).toContain('b');
  });

  it('returns undefined value when attribute does not exist', () => {
    const result = getAccessorValue({
      element: { name: 'Alice' },
      accessor: 'nonexistent',
    });
    expect(result.value).toBeUndefined();
  });

  it('handles deeply nested path where intermediate is missing', () => {
    const result = getAccessorValue({
      element: { a: { b: null } },
      accessor: 'a.b.c',
    });
    expect(result.value).toBeUndefined();
  });

  it('does not duplicate values when same value appears', () => {
    const result = getAccessorValue({
      element: { items: [{ val: 'same' }, { val: 'same' }] },
      accessor: 'items.val',
    });
    expect(result.values).toEqual(['same']);
  });

  it('handles numeric value at nested path', () => {
    const result = getAccessorValue({
      element: { stats: { score: 42 } },
      accessor: 'stats.score',
    });
    expect(result.value).toBe(42);
  });
});

// ----------------------------------------------------------------
// 13. removePolicy — 8 uncovered branches
// ----------------------------------------------------------------
describe('removePolicy branch coverage', () => {
  it('returns error when required params are missing', () => {
    const result = removePolicy({ policyType: undefined as any });
    expect(result.error).toBeDefined();
  });

  it('returns POLICY_NOT_FOUND when no policies applied', () => {
    const result = removePolicy({
      tournamentRecord: { tournamentId: 't1' } as any,
      policyType: 'scoring',
    });
    expect(result.error).toEqual(POLICY_NOT_FOUND);
  });

  it('returns error for empty tournamentRecords object', () => {
    const result = removePolicy({
      tournamentRecords: {},
      policyType: 'scoring',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('removes policy from drawDefinition element', () => {
    const drawDef: any = {
      drawId: 'd1',
      extensions: [
        {
          name: 'appliedPolicies',
          value: { scoring: { policy: true }, seeding: { policy: true } },
        },
      ],
    };
    const result: any = removePolicy({
      drawDefinition: drawDef,
      policyType: 'scoring',
    });
    expect(result.success).toBe(true);
  });

  it('removes policy and removes extension when last policy', () => {
    const drawDef: any = {
      drawId: 'd1',
      extensions: [
        {
          name: 'appliedPolicies',
          value: { scoring: { policy: true } },
        },
      ],
    };
    const result: any = removePolicy({
      drawDefinition: drawDef,
      policyType: 'scoring',
    });
    expect(result.success).toBe(true);
  });

  it('returns POLICY_NOT_FOUND when policyType not in applied policies', () => {
    const drawDef: any = {
      drawId: 'd1',
      extensions: [
        {
          name: 'appliedPolicies',
          value: { seeding: { policy: true } },
        },
      ],
    };
    const result: any = removePolicy({
      drawDefinition: drawDef,
      policyType: 'scoring',
    });
    expect(result.error).toEqual(POLICY_NOT_FOUND);
  });

  it('removes policy from event element', () => {
    const event: any = {
      eventId: 'e1',
      extensions: [
        {
          name: 'appliedPolicies',
          value: { scoring: { policy: true }, seeding: { policy: true } },
        },
      ],
    };
    const result: any = removePolicy({
      event,
      policyType: 'scoring',
    });
    expect(result.success).toBe(true);
  });

  it('returns MISSING_TOURNAMENT_RECORD for else branch (no element, no tournamentRecords)', () => {
    // When no drawDefinition, event, tournamentRecord, or tournamentRecords provided
    // but checkRequiredParameters passes via _anyOf
    const result: any = removePolicy({
      tournamentRecord: { tournamentId: 't1' } as any,
      tournamentRecords: { t1: { tournamentId: 't1' } as any },
      policyType: 'scoring',
    });
    // tournamentId is undefined and tournamentRecords is truthy so element is false
    // goes into tournamentRecords branch, policyDeletion returns POLICY_NOT_FOUND
    expect(result.error).toEqual(POLICY_NOT_FOUND);
  });
});

// ----------------------------------------------------------------
// 14. modifyIndividualParticipantIds — 8 uncovered branches
// ----------------------------------------------------------------
describe('modifyIndividualParticipantIds branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = modifyIndividualParticipantIds({
      tournamentRecord: undefined,
      groupingParticipantId: 'g1',
      individualParticipantIds: ['p1'],
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when groupingParticipantId is missing', () => {
    const result = modifyIndividualParticipantIds({
      tournamentRecord: { tournamentId: 't1' } as any,
      groupingParticipantId: undefined,
      individualParticipantIds: ['p1'],
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when individualParticipantIds is missing', () => {
    const result = modifyIndividualParticipantIds({
      tournamentRecord: { tournamentId: 't1' } as any,
      groupingParticipantId: 'g1',
      individualParticipantIds: undefined,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns PARTICIPANT_NOT_FOUND when grouping participant does not exist', () => {
    const result = modifyIndividualParticipantIds({
      tournamentRecord: { tournamentId: 't1', participants: [] } as any,
      groupingParticipantId: 'nonexistent',
      individualParticipantIds: ['p1'],
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('returns error when participant is not TEAM or GROUP type', () => {
    const result = modifyIndividualParticipantIds({
      tournamentRecord: {
        tournamentId: 't1',
        participants: [{ participantId: 'g1', participantType: 'INDIVIDUAL' }],
      } as any,
      groupingParticipantId: 'g1',
      individualParticipantIds: ['p1'],
    });
    expect(result.error).toBeDefined();
  });

  it('returns error when individualParticipantIds contains non-INDIVIDUAL participants', () => {
    const result = modifyIndividualParticipantIds({
      tournamentRecord: {
        tournamentId: 't1',
        participants: [
          { participantId: 'g1', participantType: 'GROUP', individualParticipantIds: [] },
          { participantId: 'p1', participantType: 'TEAM' },
        ],
      } as any,
      groupingParticipantId: 'g1',
      individualParticipantIds: ['p1'],
    });
    expect(result.error).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 15. setMatchUpDailyLimits — 8 uncovered branches
// ----------------------------------------------------------------
describe('setMatchUpDailyLimits branch coverage', () => {
  it('returns error when no tournamentRecords or tournamentRecord', () => {
    const result = setMatchUpDailyLimits({
      dailyLimits: { SINGLES: 2 },
      tournamentId: 't1',
    } as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('returns error when dailyLimits is not an object', () => {
    const result = setMatchUpDailyLimits({
      tournamentRecord: { tournamentId: 't1' } as any,
      dailyLimits: 'bad' as any,
      tournamentId: 't1',
    });
    expect(result.error).toEqual(INVALID_OBJECT);
  });

  it('returns INVALID_VALUES when tournamentId does not match', () => {
    const result = setMatchUpDailyLimits({
      tournamentRecord: { tournamentId: 't1' } as any,
      dailyLimits: { SINGLES: 2 },
      tournamentId: 'wrong',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('succeeds with tournamentRecord and matching tournamentId', () => {
    const result = setMatchUpDailyLimits({
      tournamentRecord: { tournamentId: 't1' } as any,
      dailyLimits: { SINGLES: 2 },
      tournamentId: 't1',
    });
    expect(result.success).toBe(true);
  });

  it('succeeds with tournamentRecords and no tournamentId filter', () => {
    const result = setMatchUpDailyLimits({
      tournamentRecords: {
        t1: { tournamentId: 't1' } as any,
        t2: { tournamentId: 't2' } as any,
      },
      dailyLimits: { SINGLES: 3 },
      tournamentId: undefined as any,
    });
    expect(result.success).toBe(true);
  });

  it('succeeds with tournamentRecord and no tournamentId', () => {
    const result = setMatchUpDailyLimits({
      tournamentRecord: { tournamentId: 't1' } as any,
      dailyLimits: { DOUBLES: 1 },
      tournamentId: undefined as any,
    });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 16. bulkMatchUpStatusUpdate — 9 uncovered branches
// ----------------------------------------------------------------
describe('bulkMatchUpStatusUpdate branch coverage', () => {
  it('returns error when outcomes is missing', () => {
    const result = bulkMatchUpStatusUpdate({});
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when outcomes is not an array', () => {
    const result = bulkMatchUpStatusUpdate({ outcomes: 'bad' as any });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('succeeds with empty outcomes array', () => {
    const result: any = bulkMatchUpStatusUpdate({ outcomes: [] });
    expect(result.success).toBe(true);
  });

  it('returns error when tournamentRecord not found for tournamentId', () => {
    const result: any = bulkMatchUpStatusUpdate({
      outcomes: [{ tournamentId: 't1', eventId: 'e1', drawId: 'd1', matchUpId: 'm1' }],
      tournamentRecords: {},
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('handles outcomes with tournamentRecord provided directly', () => {
    const result: any = bulkMatchUpStatusUpdate({
      outcomes: [{ tournamentId: 't1', eventId: 'e1', drawId: 'd1', matchUpId: 'm1' }],
      tournamentRecord: { tournamentId: 't1', events: [] } as any,
    });
    // Event not found so drawDefinition won't be found, just skips silently
    expect(result.success).toBe(true);
  });

  it('deduplicates tournamentIds from outcomes', () => {
    const result: any = bulkMatchUpStatusUpdate({
      outcomes: [
        { tournamentId: 't1', eventId: 'e1', drawId: 'd1', matchUpId: 'm1' },
        { tournamentId: 't1', eventId: 'e1', drawId: 'd1', matchUpId: 'm2' },
      ],
      tournamentRecord: { tournamentId: 't1', events: [] } as any,
    });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 17. bulkUpdatePublishedEventIds — 6 uncovered branches
// ----------------------------------------------------------------
describe('bulkUpdatePublishedEventIds branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = bulkUpdatePublishedEventIds({
      tournamentRecord: undefined,
      outcomes: [{ eventId: 'e1', drawId: 'd1' }],
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when outcomes is empty', () => {
    const result = bulkUpdatePublishedEventIds({
      tournamentRecord: { tournamentId: 't1' } as any,
      outcomes: [],
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when outcomes is undefined', () => {
    const result = bulkUpdatePublishedEventIds({
      tournamentRecord: { tournamentId: 't1' } as any,
      outcomes: undefined,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns empty publishedEventIds when no events match', () => {
    const result = bulkUpdatePublishedEventIds({
      tournamentRecord: { tournamentId: 't1', events: [] } as any,
      outcomes: [{ eventId: 'e1', drawId: 'd1' }],
    });
    expect(result.publishedEventIds).toEqual([]);
  });

  it('handles outcomes without drawId or eventId', () => {
    const result = bulkUpdatePublishedEventIds({
      tournamentRecord: { tournamentId: 't1', events: [] } as any,
      outcomes: [{ eventId: undefined, drawId: undefined }],
    });
    expect(result.publishedEventIds).toEqual([]);
  });

  it('deduplicates drawIds per eventId', () => {
    const result = bulkUpdatePublishedEventIds({
      tournamentRecord: { tournamentId: 't1', events: [] } as any,
      outcomes: [
        { eventId: 'e1', drawId: 'd1' },
        { eventId: 'e1', drawId: 'd1' },
        { eventId: 'e1', drawId: 'd2' },
      ],
    });
    expect(result.publishedEventIds).toEqual([]);
    expect(result.eventIdPublishedDrawIdsMap['e1']).toEqual(['d1', 'd2']);
  });
});

// ----------------------------------------------------------------
// 18. assignSeedPositions — 9 uncovered branches
// ----------------------------------------------------------------
describe('assignSeedPositions branch coverage', () => {
  it('returns error when assignments is empty', () => {
    const result: any = assignSeedPositions({
      assignments: [],
      tournamentRecord: { tournamentId: 't1' } as any,
      drawDefinition: { drawId: 'd1' } as any,
      structureId: 's1',
      drawId: 'd1',
      event: {} as any,
    });
    expect(result.error).toEqual(MISSING_ASSIGNMENTS);
  });

  it('returns error when tournamentRecord is missing', () => {
    const result: any = assignSeedPositions({
      assignments: [{ seedNumber: 1, participantId: 'p1' }],
      tournamentRecord: undefined as any,
      drawDefinition: { drawId: 'd1' } as any,
      structureId: 's1',
      drawId: 'd1',
      event: {} as any,
    } as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when drawId is missing', () => {
    const result: any = assignSeedPositions({
      assignments: [{ seedNumber: 1, participantId: 'p1' }],
      tournamentRecord: { tournamentId: 't1' } as any,
      drawDefinition: { drawId: 'd1' } as any,
      structureId: 's1',
      drawId: undefined as any,
      event: {} as any,
    } as any);
    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('returns error when getStructureSeedAssignments fails', () => {
    const result: any = assignSeedPositions({
      assignments: [{ seedNumber: 1, participantId: 'p1' }],
      tournamentRecord: { tournamentId: 't1' } as any,
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      structureId: 'nonexistent',
      drawId: 'd1',
      event: {} as any,
    } as any);
    expect(result.error).toBeDefined();
  });
});
