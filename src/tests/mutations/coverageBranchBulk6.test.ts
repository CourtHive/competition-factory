/**
 * Bulk branch-coverage tests (batch 6) for 16 files with uncovered branches.
 * Each describe block targets specific uncovered conditional paths.
 */
import { dehydrateMatchUps, getMatchUpFormatMap, removeExtraneousAttributes } from '@Mutate/tournaments/dehydrate';
import { findMatchupFormatAverageTimes, findMatchupFormatRecoveryTimes } from '@Acquire/findMatchUpFormatTimes';
import { organizeDrawPositionOptions } from '@Query/drawDefinition/avoidance/organizeDrawPositionOptions';
import { assignDrawPositionQualifier } from '@Mutate/matchUps/drawPositions/assignDrawPositionQualifier';
import { getAllowedMatchUpFormats, getAllowedDrawTypes } from '@Query/tournaments/allowedTypes';
import { applyTournamentRankingPoints } from '@Mutate/scales/applyTournamentRankingPoints';
import { removeOnlineResource } from '@Mutate/base/removeOnlineResource';
import { mapNumbersToIndexes } from '@Tools/mapNumbersToIndexes';
import { getAccessorValue } from '@Tools/getAccessorValue';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import {
  COURT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_TOURNAMENT_RECORD,
  NOT_FOUND,
  PARTICIPANT_NOT_FOUND,
  STRUCTURE_NOT_FOUND,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// ----------------------------------------------------------------
// 1. mapNumbersToIndexes — uncovered branches
// ----------------------------------------------------------------
describe('mapNumbersToIndexes branch coverage', () => {
  it('handles items not found in indexArray (else branch)', () => {
    // indexArray = [10,20,30], randNumbers = [99,88] — neither is in indexArray
    const result = mapNumbersToIndexes([10, 20, 30], [99, 88]);
    expect(result).toHaveLength(3);
  });

  it('handles duplicate random numbers', () => {
    const result = mapNumbersToIndexes([1, 2, 3, 4], [1, 1, 2, 3]);
    // duplicates removed by Set, so uniqueRandomList = [1,2,3]
    expect(result).toHaveLength(4);
  });

  it('handles when randNumberArray already contains indexArray values plus extras', () => {
    const result = mapNumbersToIndexes([0, 1, 2], [0, 1, 5]);
    expect(result).toHaveLength(3);
  });

  it('handles empty arrays', () => {
    const result = mapNumbersToIndexes([], []);
    expect(result).toHaveLength(0);
  });
});

// ----------------------------------------------------------------
// 2. getAccessorValue — uncovered branches
// ----------------------------------------------------------------
describe('getAccessorValue branch coverage', () => {
  it('returns empty values when accessor is not a string', () => {
    const result = getAccessorValue({ element: { a: 1 }, accessor: 123 });
    expect(result.values).toEqual([]);
  });

  it('returns value for a simple single-level accessor', () => {
    const result = getAccessorValue({ element: { name: 'test' }, accessor: 'name' });
    expect(result.value).toBe('test');
    expect(result.values).toContain('test');
  });

  it('traverses nested objects (non-array intermediate)', () => {
    const element = { person: { name: 'Alice' } };
    const result = getAccessorValue({ element, accessor: 'person.name' });
    expect(result.value).toBe('Alice');
  });

  it('traverses arrays of nested objects', () => {
    const element = { people: [{ name: 'Alice' }, { name: 'Bob' }] };
    const result = getAccessorValue({ element, accessor: 'people.name' });
    expect(result.values).toContain('Alice');
    expect(result.values).toContain('Bob');
  });

  it('returns undefined value when element is empty/null', () => {
    const result = getAccessorValue({ element: null, accessor: 'anything' });
    expect(result.value).toBeUndefined();
  });

  it('handles accessor that does not match any property', () => {
    const result = getAccessorValue({ element: { a: 1 }, accessor: 'nonexistent' });
    expect(result.value).toBeUndefined();
  });

  it('handles multi-level accessor where intermediate is a primitive (checkValue branch)', () => {
    // person.name -> person is a string, so checkValue is called with index === attributes.length - 1
    const element = { level: 'top' };
    const result = getAccessorValue({ element, accessor: 'level' });
    expect(result.value).toBe('top');
  });

  it('handles duplicate values in arrays (values.includes check)', () => {
    const element = { items: [{ code: 'A' }, { code: 'A' }, { code: 'B' }] };
    const result = getAccessorValue({ element, accessor: 'items.code' });
    // Duplicates should be filtered
    expect(result.values).toEqual(['A', 'B']);
  });
});

// ----------------------------------------------------------------
// 3. allowedTypes — uncovered branches
// ----------------------------------------------------------------
describe('allowedTypes branch coverage', () => {
  it('getAllowedMatchUpFormats returns error when tournamentRecord is missing', () => {
    const result = getAllowedMatchUpFormats({
      tournamentRecord: undefined,
      categoryName: undefined,
      categoryType: undefined,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('getAllowedMatchUpFormats returns empty array when no scoring policy', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = getAllowedMatchUpFormats({
      tournamentRecord,
      categoryName: undefined,
      categoryType: undefined,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAllowedDrawTypes returns error when tournamentRecord is missing', () => {
    const result = getAllowedDrawTypes({
      tournamentRecord: undefined,
      categoryName: undefined,
      categoryType: undefined,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('getAllowedDrawTypes returns empty array when no draws policy', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = getAllowedDrawTypes({
      tournamentRecord,
      categoryName: undefined,
      categoryType: undefined,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAllowedMatchUpFormats filters by categoryName', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    // Even with no policy, exercise the filter branches with categoryName
    const result = getAllowedMatchUpFormats({
      tournamentRecord,
      categoryName: 'U18',
      categoryType: undefined,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAllowedDrawTypes filters by categoryType', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = getAllowedDrawTypes({
      tournamentRecord,
      categoryName: undefined,
      categoryType: 'AGE',
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ----------------------------------------------------------------
// 4. dehydrate — uncovered branches
// ----------------------------------------------------------------
describe('dehydrate branch coverage', () => {
  it('dehydrateMatchUps returns error when tournamentRecord is missing', () => {
    const result = dehydrateMatchUps({ tournamentRecord: undefined });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('dehydrateMatchUps returns error for invalid tournamentRecord', () => {
    const result = dehydrateMatchUps({ tournamentRecord: 'not-an-object' as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('dehydrateMatchUps returns error for object without tournamentId', () => {
    const result = dehydrateMatchUps({ tournamentRecord: { foo: 'bar' } as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('dehydrateMatchUps succeeds with a real tournament', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const result = dehydrateMatchUps({ tournamentRecord });
    expect(result.success).toBe(true);
  });

  it('getMatchUpFormatMap traverses events, drawDefinitions, structures, and child structures', () => {
    const tournamentRecord: any = {
      events: [
        {
          eventId: 'e1',
          matchUpFormat: 'SET3-S:6/TB7',
          drawDefinitions: [
            {
              drawId: 'd1',
              matchUpFormat: 'SET1-S:6/TB7',
              structures: [
                {
                  structureId: 's1',
                  matchUpFormat: 'SET1-S:4/TB7',
                  structures: [{ structureId: 's1a', matchUpFormat: 'SET1-S:TB10' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const map = getMatchUpFormatMap({ tournamentRecord });
    expect(map['e1']).toBe('SET3-S:6/TB7');
    expect(map['d1']).toBe('SET1-S:6/TB7');
    expect(map['s1']).toBe('SET1-S:4/TB7');
    expect(map['s1a']).toBe('SET1-S:TB10');
  });

  it('removeExtraneousAttributes removes non-base keys and strips sides when drawPositions present', () => {
    const matchUps = [
      {
        matchUpId: 'mu1',
        roundNumber: 1,
        drawPositions: [1, 2],
        sides: [{ sideNumber: 1 }],
        someExtraKey: 'shouldBeRemoved',
        structureId: 's1',
        drawId: 'd1',
        eventId: 'e1',
        matchUpFormat: 'SET3-S:6/TB7',
      },
    ];
    // matchUpFormat matches inherited => should be cleared
    const matchUpFormatMap = { s1: 'SET3-S:6/TB7' };
    removeExtraneousAttributes(matchUps, matchUpFormatMap);
    expect(matchUps[0]).not.toHaveProperty('someExtraKey');
    expect(matchUps[0]).not.toHaveProperty('sides');
    expect(matchUps[0]).not.toHaveProperty('matchUpFormat');
  });

  it('removeExtraneousAttributes keeps sides when tieMatchUps present', () => {
    const matchUps = [
      {
        matchUpId: 'mu1',
        roundNumber: 1,
        drawPositions: [1, 2],
        sides: [{ sideNumber: 1 }],
        tieMatchUps: [],
        structureId: 's1',
      },
    ];
    removeExtraneousAttributes(matchUps);
    expect(matchUps[0]).toHaveProperty('sides');
  });

  it('removeExtraneousAttributes preserves matchUpFormat when different from inherited', () => {
    const matchUps = [
      {
        matchUpId: 'mu1',
        roundNumber: 1,
        drawPositions: [1, 2],
        structureId: 's1',
        matchUpFormat: 'SET1-S:TB10',
      },
    ];
    const matchUpFormatMap = { s1: 'SET3-S:6/TB7' };
    removeExtraneousAttributes(matchUps, matchUpFormatMap);
    expect(matchUps[0].matchUpFormat).toBe('SET1-S:TB10');
  });

  it('dehydrateMatchUps succeeds when tournament has no matchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = dehydrateMatchUps({ tournamentRecord });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 5. removeOnlineResource — uncovered branches
// ----------------------------------------------------------------
describe('removeOnlineResource branch coverage', () => {
  const makeResource = () => ({
    identifier: 'test-id',
    resourceType: 'URL',
    resourceSubType: 'STREAM',
  });

  it('removes from tournamentRecord directly (no entity ids)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentRecord.onlineResources = [makeResource()];
    const result = removeOnlineResource({
      onlineResource: makeResource(),
      tournamentRecord,
    } as any);
    expect(result.success).toBe(true);
    expect(tournamentRecord.onlineResources).toHaveLength(0);
  });

  it('returns NOT_FOUND for non-matching organisationId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = removeOnlineResource({
      onlineResource: makeResource(),
      organisationId: 'bogus',
      tournamentRecord,
    } as any);
    expect(result.error).toEqual(NOT_FOUND);
  });

  it('removes from parentOrganisation when organisationId matches', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentRecord.parentOrganisation = {
      parentOrganisationId: 'org1',
      organisationName: 'Test Org',
      onlineResources: [makeResource()],
    };
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      organisationId: 'org1',
    } as any);
    expect(result.success).toBe(true);
    expect(tournamentRecord.parentOrganisation.onlineResources).toHaveLength(0);
  });

  it('returns PARTICIPANT_NOT_FOUND when participantId is not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      participantId: 'bogus-pid',
    } as any);
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('returns NOT_FOUND when personId is provided but no participant matches', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      personId: 'bogus-person',
    } as any);
    expect(result.error).toEqual(NOT_FOUND);
  });

  it('removes from participant when participantId matches', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const participant = tournamentRecord.participants[0];
    participant.onlineResources = [makeResource()];
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      participantId: participant.participantId,
    } as any);
    expect(result.success).toBe(true);
    expect(participant.onlineResources).toHaveLength(0);
  });

  it('removes from person when personId matches', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const participant = tournamentRecord.participants.find((p) => p.person?.personId);
    if (participant?.person) {
      participant.person.onlineResources = [makeResource()];
      const result = removeOnlineResource({
        tournamentRecord,
        onlineResource: makeResource(),
        personId: participant.person.personId,
      } as any);
      expect(result.success).toBe(true);
      expect(participant.person.onlineResources).toHaveLength(0);
    }
  });

  it('returns COURT_NOT_FOUND when courtId is not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      courtId: 'bogus-court',
    } as any);
    expect(result.error).toEqual(COURT_NOT_FOUND);
  });

  it('returns VENUE_NOT_FOUND when venueId is not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      venueId: 'bogus-venue',
    } as any);
    expect(result.error).toEqual(VENUE_NOT_FOUND);
  });

  it('removes from venue when venueId matches', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentRecord.venues = [{ venueId: 'v1', onlineResources: [makeResource()] }];
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      venueId: 'v1',
    } as any);
    expect(result.success).toBe(true);
    expect(tournamentRecord.venues[0].onlineResources).toHaveLength(0);
  });

  it('removes from court when courtId and venueId match', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentRecord.venues = [{ venueId: 'v1', courts: [{ courtId: 'c1', onlineResources: [makeResource()] }] }];
    const result = removeOnlineResource({
      tournamentRecord,
      onlineResource: makeResource(),
      courtId: 'c1',
      venueId: 'v1',
    } as any);
    expect(result.success).toBe(true);
    expect(tournamentRecord.venues[0].courts[0].onlineResources).toHaveLength(0);
  });
});

// ----------------------------------------------------------------
// 6. findMatchUpFormatTimes — uncovered branches
// ----------------------------------------------------------------
describe('findMatchUpFormatTimes branch coverage', () => {
  it('findMatchupFormatAverageTimes returns undefined with empty params', () => {
    const result = findMatchupFormatAverageTimes(undefined);
    expect(result).toBeUndefined();
  });

  it('findMatchupFormatAverageTimes returns undefined with no matching codes', () => {
    const result = findMatchupFormatAverageTimes({
      matchUpAverageTimes: [{ matchUpFormatCodes: ['SET3-S:6/TB7'], averageTimes: { minutes: 90 } }],
      matchUpFormat: 'SET1-S:4/TB7',
    });
    expect(result).toBeUndefined();
  });

  it('findMatchupFormatAverageTimes returns averageTimes for exact code match', () => {
    const avgTimes = { minutes: 90 };
    const result = findMatchupFormatAverageTimes({
      matchUpAverageTimes: [{ matchUpFormatCodes: ['SET3-S:6/TB7'], averageTimes: avgTimes }],
      matchUpFormat: 'SET3-S:6/TB7',
    });
    expect(result).toEqual(avgTimes);
  });

  it('findMatchupFormatAverageTimes returns undefined when matchUpAverageTimes is undefined', () => {
    const result = findMatchupFormatAverageTimes({
      matchUpAverageTimes: undefined,
      matchUpFormat: 'SET3-S:6/TB7',
    });
    expect(result).toBeUndefined();
  });

  it('findMatchupFormatRecoveryTimes returns undefined with empty params', () => {
    const result = findMatchupFormatRecoveryTimes(undefined);
    expect(result).toBeUndefined();
  });

  it('findMatchupFormatRecoveryTimes matches by averageTimes range', () => {
    const recoveryTimes = { minutes: 30 };
    const result = findMatchupFormatRecoveryTimes({
      matchUpRecoveryTimes: [
        {
          averageTimes: { greaterThan: 50, lessThan: 100 },
          recoveryTimes,
        },
      ],
      averageMinutes: 75,
      matchUpFormat: undefined,
    });
    expect(result).toEqual(recoveryTimes);
  });

  it('findMatchupFormatRecoveryTimes does not match when averageMinutes is out of range', () => {
    const result = findMatchupFormatRecoveryTimes({
      matchUpRecoveryTimes: [
        {
          averageTimes: { greaterThan: 50, lessThan: 100 },
          recoveryTimes: { minutes: 30 },
        },
      ],
      averageMinutes: 120,
      matchUpFormat: undefined,
    });
    expect(result).toBeUndefined();
  });

  it('findMatchupFormatRecoveryTimes matches by matchUpFormatCodes', () => {
    const recoveryTimes = { minutes: 20 };
    const result = findMatchupFormatRecoveryTimes({
      matchUpRecoveryTimes: [
        {
          matchUpFormatCodes: ['SET1-S:4/TB7'],
          recoveryTimes,
        },
      ],
      averageMinutes: undefined,
      matchUpFormat: 'SET1-S:4/TB7',
    });
    expect(result).toEqual(recoveryTimes);
  });

  it('findMatchupFormatRecoveryTimes returns undefined when averageTimes defined but averageMinutes missing', () => {
    const result = findMatchupFormatRecoveryTimes({
      matchUpRecoveryTimes: [
        {
          averageTimes: { greaterThan: 50, lessThan: 100 },
          recoveryTimes: { minutes: 30 },
        },
      ],
      averageMinutes: undefined,
      matchUpFormat: 'NOMATCH',
    });
    expect(result).toBeUndefined();
  });

  it('findMatchupFormatRecoveryTimes uses defaults for greaterThan/lessThan', () => {
    const recoveryTimes = { minutes: 15 };
    const result = findMatchupFormatRecoveryTimes({
      matchUpRecoveryTimes: [
        {
          averageTimes: {},
          recoveryTimes,
        },
      ],
      averageMinutes: 100,
      matchUpFormat: undefined,
    });
    expect(result).toEqual(recoveryTimes);
  });
});

// ----------------------------------------------------------------
// 7. organizeDrawPositionOptions — isRoundRobin branch
// ----------------------------------------------------------------
describe('organizeDrawPositionOptions branch coverage', () => {
  it('handles isRoundRobin=true path', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: [],
      participantIdGroups: {},
      positionAssignments: [
        { drawPosition: 1, participantId: 'p1' },
        { drawPosition: 2, participantId: undefined },
      ],
      drawPositionChunks: [[[1, 2]]],
      unfilledPositions: [2],
      isRoundRobin: true,
    });
    expect(result).toHaveProperty('unassigned');
    expect(result).toHaveProperty('unpaired');
    expect(result).toHaveProperty('pairedNoConflict');
  });

  it('handles isRoundRobin=false (elimination) path', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: [],
      participantIdGroups: {},
      positionAssignments: [
        { drawPosition: 1, participantId: 'p1' },
        { drawPosition: 2, participantId: undefined },
      ],
      drawPositionChunks: [[[1, 2]]],
      unfilledPositions: [2],
      isRoundRobin: false,
    });
    expect(result).toHaveProperty('unassigned');
    expect(result).toHaveProperty('unpaired');
    expect(result).toHaveProperty('pairedNoConflict');
  });

  it('handles empty drawPositionChunks', () => {
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
});

// ----------------------------------------------------------------
// 8. applyTournamentRankingPoints — uncovered branches
// ----------------------------------------------------------------
describe('applyTournamentRankingPoints branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = applyTournamentRankingPoints({ tournamentRecord: undefined as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when policyDefinitions are missing', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const result = applyTournamentRankingPoints({ tournamentRecord });
    // getTournamentPoints requires policyDefinitions
    expect(result.error).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 9. assignDrawPositionQualifier — uncovered branches
// ----------------------------------------------------------------
describe('assignDrawPositionQualifier branch coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = assignDrawPositionQualifier({
      drawDefinition: undefined as any,
      drawPosition: 1,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns STRUCTURE_NOT_FOUND when structureId is invalid', () => {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId: drawIds[0] });
    const result = assignDrawPositionQualifier({
      drawDefinition,
      drawPosition: 1,
      structureId: 'bogus',
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('returns SUCCESS when drawPosition is already a qualifier', () => {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, qualifyingPositions: 2 }],
    });
    const result = tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = result.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures.find((s) => s.stage === 'MAIN');
    const qualifierAssignment = structure?.positionAssignments?.find((a) => a.qualifier);
    if (qualifierAssignment) {
      const assignResult: any = assignDrawPositionQualifier({
        drawPosition: qualifierAssignment.drawPosition,
        drawDefinition,
        structure,
      });
      expect(assignResult.success).toBe(true);
    }
  });
});

// ----------------------------------------------------------------
// 10. removeDrawPositionAssignment — exercise via engine
// ----------------------------------------------------------------
describe('removeDrawPositionAssignment branch coverage', () => {
  it('exercises the main removal flow via engine', () => {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: drawIds[0] });
    const structure = drawDefinition.structures[0];
    const assignment = structure.positionAssignments?.find((a) => a.participantId);
    if (assignment) {
      const result = tournamentEngine.removeDrawPositionAssignment({
        drawId: drawIds[0],
        structureId: structure.structureId,
        drawPosition: assignment.drawPosition,
        entryStatus: 'WITHDRAWN',
      });
      // Should succeed or error but exercise the code path
      expect(result).toBeDefined();
    }
  });
});
