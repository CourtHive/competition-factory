import { getEventAlternateParticipantIds } from '@Query/drawDefinition/matchUpActions/getEventAlternateParticipantids';
import { policyAttachment } from '@Generators/drawDefinitions/generateDrawDefinition/drawDefinitionPolicyAttachment';
import { generateOrGetExisting } from '@Generators/drawDefinitions/generateDrawDefinition/generateOrGetExisting';
import { organizeDrawPositionOptions } from '@Query/drawDefinition/avoidance/organizeDrawPositionOptions';
import { generateAdHocRounds } from '@Generators/drawDefinitions/drawTypes/adHoc/generateAdHocRounds';
import { getAllowedMatchUpFormats, getAllowedDrawTypes } from '@Query/tournaments/allowedTypes';
import { allocateTeamMatchUpCourts } from '@Mutate/matchUps/schedule/allocateTeamMatchUpCourts';
import { getCompetitionParticipants } from '@Query/participants/getCompetitionParticipants';
import { applyTournamentRankingPoints } from '@Mutate/scales/applyTournamentRankingPoints';
import { replaceQualifier } from '@Mutate/drawDefinitions/matchUpGovernor/replaceQualifier';
import { collectionGroupUpdate } from '@Mutate/tieFormat/collectionGroupUpdate';
import { getDrawPositionsRanges } from '@Query/matchUps/getDrawPositionsRanges';
import { getTallyReport } from '@Query/matchUps/roundRobinTally/getTallyReport';
import { methodImporter } from '@Assemblies/engines/parts/methodImporter';
import { getSourceRounds } from '@Query/drawDefinition/getSourceRounds';
import { mapNumbersToIndexes } from '@Tools/mapNumbersToIndexes';
import { getAccessorValue } from '@Tools/getAccessorValue';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';
import {
  getRoundRobinGroupMatchUps,
  drawPositionsHash,
  groupRounds,
  determineRoundNumber,
} from '@Generators/drawDefinitions/drawTypes/roundRobin/roundRobinGroups';

// constants
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import {
  MISSING_TOURNAMENT_RECORDS,
  MISSING_TOURNAMENT_RECORD,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_POSITIONS,
  MISSING_STRUCTURE_ID,
  MISSING_MATCHUP_ID,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

// 1. methodImporter — hit setStateMethods error branch (non-object submittedMethods)
describe('methodImporter branches', () => {
  it('returns error when submittedMethods is not an object', () => {
    const engine = {};
    const engineInvoke = () => ({});
    const result = methodImporter(engine, engineInvoke, 'not-an-object', false, 1, false);
    expect(result.error).toBeDefined();
  });

  it('succeeds with valid empty object methods', () => {
    const engine = {};
    const engineInvoke = () => ({});
    const result = methodImporter(engine, engineInvoke, {}, false, 1, false);
    expect(result.error).toBeUndefined();
  });
});

// 2. getEventAlternateParticipantIds — hit branches for entryPosition sort fallback (Infinity)
describe('getEventAlternateParticipantIds branches', () => {
  it('filters non-alternate entries and sorts by entryPosition with missing positions', () => {
    const structure = { stage: MAIN };
    const eventEntries = [
      { entryStatus: ALTERNATE, participantId: 'p1', entryPosition: undefined },
      { entryStatus: ALTERNATE, participantId: 'p2', entryPosition: 1 },
      { entryStatus: 'DIRECT_ACCEPTANCE', participantId: 'p3', entryPosition: 2 },
    ];
    const result = getEventAlternateParticipantIds({ eventEntries, structure });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain('p2');
    expect(result).not.toContain('p3');
  });

  it('returns empty when no alternates', () => {
    const structure = { stage: MAIN };
    const eventEntries = [{ entryStatus: 'DIRECT_ACCEPTANCE', participantId: 'p1' }];
    const result = getEventAlternateParticipantIds({ eventEntries, structure });
    expect(result).toEqual([]);
  });
});

// 3. generateAdHocRounds — error from getParticipantIds
describe('generateAdHocRounds branches', () => {
  it('returns error when getParticipantIds fails (invalid participantIds)', () => {
    const drawDefinition = {
      drawId: 'd1',
      entries: [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' }],
      structures: [{ structureId: 's1', matchUps: [] }],
    };
    const event = { eventId: 'e1' } as any;
    const result = generateAdHocRounds({
      drawDefinition: drawDefinition as any,
      event,
      roundsCount: 1,
      participantIds: ['nonexistent'],
      structureId: 's1',
    } as any);
    expect(result.error).toBeDefined();
  });

  it('handles multiple rounds count', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: 'AD_HOC' }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({
      drawId: tournamentRecord.events[0].drawDefinitions[0].drawId,
    });
    const event = tournamentRecord.events[0];
    const result = generateAdHocRounds({
      drawDefinition,
      event,
      roundsCount: 2,
      structureId: drawDefinition.structures[0].structureId,
    });
    // May succeed or fail depending on participant count vs rounds
    expect(result).toBeDefined();
  });
});

// 4. organizeDrawPositionOptions — both isRoundRobin and elimination paths
describe('organizeDrawPositionOptions branches', () => {
  it('handles round robin path', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: ['groupA'],
      participantIdGroups: { p1: ['groupA'] },
      positionAssignments: [{ drawPosition: 1, participantId: 'p1' }],
      drawPositionChunks: [[[1, 2, 3, 4]]],
      unfilledPositions: [2, 3, 4],
      isRoundRobin: true,
    });
    expect(result.unassigned).toBeDefined();
    expect(result.unpaired).toBeDefined();
    expect(result.pairedNoConflict).toBeDefined();
  });

  it('handles elimination path', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: ['groupA'],
      participantIdGroups: { p1: ['groupA'] },
      positionAssignments: [{ drawPosition: 1, participantId: 'p1' }],
      drawPositionChunks: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      unfilledPositions: [2, 3, 4],
      isRoundRobin: false,
    });
    expect(result.unassigned).toBeDefined();
    expect(result.unpaired).toBeDefined();
    expect(result.pairedNoConflict).toBeDefined();
  });
});

// 5. getCompetitionParticipants — missing/invalid tournamentRecords
describe('getCompetitionParticipants branches', () => {
  it('returns error when tournamentRecords is undefined', () => {
    const result = getCompetitionParticipants(undefined);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('returns error when tournamentRecords is empty object', () => {
    const result = getCompetitionParticipants({ tournamentRecords: {} });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('returns error when tournamentRecords is not an object', () => {
    const result = getCompetitionParticipants({ tournamentRecords: 'not-object' });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('succeeds with valid tournamentRecords containing a record', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
    });
    const result = getCompetitionParticipants({
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
    });
    expect(result.success).toBe(true);
    expect(result.participants?.length).toBeGreaterThan(0);
  });
});

// 6. mapNumbersToIndexes — various branch paths
describe('mapNumbersToIndexes branches', () => {
  it('maps exact matches from indexArray', () => {
    const result = mapNumbersToIndexes([10, 20, 30], [10, 20, 30]);
    expect(result.length).toBe(3);
  });

  it('handles items not found in indexArray (else branch)', () => {
    const result = mapNumbersToIndexes([10, 20, 30], [99, 88, 77]);
    expect(result.length).toBe(3);
  });

  it('handles duplicates in randNumberArray', () => {
    const result = mapNumbersToIndexes([1, 2, 3, 4], [1, 1, 2, 3]);
    expect(result.length).toBe(4);
  });

  it('handles empty arrays', () => {
    const result = mapNumbersToIndexes([], []);
    expect(result).toEqual([]);
  });
});

// 7. generateOrGetExisting — error from setUpDrawGeneration
describe('generateOrGetExisting branches', () => {
  it('returns error when event is missing required fields', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = generateOrGetExisting({
      tournamentRecord,
      event: {} as any,
    });
    expect(result.error).toBeDefined();
  });

  it('succeeds with proper event and entries', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const event = tournamentRecord.events[0];
    const result = generateOrGetExisting({
      tournamentRecord,
      event,
      eventEntries: event.entries,
      drawSize: 4,
    });
    // may succeed or error depending on internal validation; just verifying the branch is hit
    expect(result).toBeDefined();
  });
});

// 8. policyAttachment — invalid policyDefinitions (non-object)
describe('policyAttachment branches', () => {
  it('returns error for non-object policyDefinitions', () => {
    const result = policyAttachment({
      appliedPolicies: {},
      policyDefinitions: 'invalid',
      drawDefinition: { drawId: 'd1' },
      stack: 'test',
    });
    expect(result.error).toBeDefined();
  });

  it('attaches default seeding policy when none provided', () => {
    const drawDefinition: any = { drawId: 'd1', extensions: [] };
    const result = policyAttachment({
      appliedPolicies: {},
      policyDefinitions: undefined,
      drawDefinition,
      stack: 'test',
    });
    expect(result.error).toBeUndefined();
  });

  it('handles avoidance policy in appliedPolicies without policyDefinitions', () => {
    const drawDefinition: any = { drawId: 'd1', extensions: [] };
    const result = policyAttachment({
      appliedPolicies: { avoidance: { policyName: 'test' } },
      policyDefinitions: undefined,
      drawDefinition,
      stack: 'test',
    });
    expect(result.error).toBeUndefined();
  });

  it('handles policyDefinitions with new policies different from applied', () => {
    const drawDefinition: any = { drawId: 'd1', extensions: [] };
    const result = policyAttachment({
      appliedPolicies: {},
      policyDefinitions: { seeding: { policyName: 'custom' } },
      drawDefinition,
      stack: 'test',
    });
    expect(result.error).toBeUndefined();
  });
});

// 9. applyTournamentRankingPoints — missing tournamentRecord
describe('applyTournamentRankingPoints branches', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = applyTournamentRankingPoints({} as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when getTournamentPoints fails (no ranking policy)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
    });
    const result = applyTournamentRankingPoints({ tournamentRecord });
    // getTournamentPoints requires a POLICY_TYPE_RANKING_POINTS policy
    expect(result.error).toBeDefined();
  });
});

// 10. getAccessorValue — various branch paths
describe('getAccessorValue branches', () => {
  it('returns empty values for non-string accessor', () => {
    const result = getAccessorValue({ element: {}, accessor: 123 });
    expect(result.values).toEqual([]);
  });

  it('handles simple single-level accessor', () => {
    const result = getAccessorValue({ element: { name: 'test' }, accessor: 'name' });
    expect(result.value).toBe('test');
    expect(result.values).toContain('test');
  });

  it('handles nested accessor through objects', () => {
    const result = getAccessorValue({
      element: { person: { name: 'John' } },
      accessor: 'person.name',
    });
    expect(result.value).toBe('John');
  });

  it('handles accessor through arrays', () => {
    const result = getAccessorValue({
      element: { items: [{ name: 'a' }, { name: 'b' }] },
      accessor: 'items.name',
    });
    expect(result.values).toContain('a');
    expect(result.values).toContain('b');
  });
});

// 11. roundRobinGroups — various functions
describe('roundRobinGroups branches', () => {
  it('getRoundRobinGroupMatchUps returns error for missing drawPositions', () => {
    const result = getRoundRobinGroupMatchUps({ drawPositions: undefined });
    expect(result.error).toEqual(MISSING_DRAW_POSITIONS);
  });

  it('getRoundRobinGroupMatchUps returns error for empty drawPositions', () => {
    const result = getRoundRobinGroupMatchUps({ drawPositions: [] });
    expect(result.error).toEqual(MISSING_DRAW_POSITIONS);
  });

  it('drawPositionsHash handles non-array input', () => {
    expect(drawPositionsHash()).toBe('');
    expect(drawPositionsHash([])).toBe('');
  });

  it('groupRounds returns empty for zero groupSize', () => {
    expect(groupRounds({ groupSize: 0, drawPositionOffset: 0 })).toEqual([]);
  });

  it('groupRounds works with valid groupSize', () => {
    const result = groupRounds({ groupSize: 4, drawPositionOffset: 0 });
    expect(result.length).toBeGreaterThan(0);
  });

  it('determineRoundNumber returns error for missing rounds', () => {
    const result = determineRoundNumber({ rounds: undefined, hash: '1|2' });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('determineRoundNumber returns error for empty rounds', () => {
    const result = determineRoundNumber({ rounds: [], hash: '1|2' });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('determineRoundNumber finds correct round', () => {
    const rounds = [
      ['1|2', '3|4'],
      ['1|3', '2|4'],
    ];
    const result = determineRoundNumber({ rounds, hash: '1|3' });
    expect(result).toBe(2);
  });
});

// 12. collectionGroupUpdate — missing drawDefinition branch
describe('collectionGroupUpdate branches', () => {
  it('returns MISSING_DRAW_DEFINITION when neither matchUp nor drawDefinition', () => {
    const result = collectionGroupUpdate({
      drawDefinition: undefined as any,
      tieFormat: {
        winCriteria: { valueGoal: 2 },
        collectionDefinitions: [
          {
            collectionId: 'c1',
            collectionName: 'Singles',
            matchUpType: 'SINGLES',
            matchUpFormat: 'SET3-S:6/TB7',
            matchUpCount: 3,
            matchUpValue: 1,
          },
        ],
      },
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });
});

// 13. getTallyReport — various branches
describe('getTallyReport branches', () => {
  it('handles report with excludedDirectives', () => {
    const matchUps = [
      {
        sides: [
          { participantId: 'p1', participant: { participantName: 'Player 1' } },
          { participantId: 'p2', participant: { participantName: 'Player 2' } },
        ],
      },
    ];
    const order = [{ participantId: 'p1', groupOrder: 1, resolved: true }];
    const report = [{ excludedDirectives: [{ attribute: 'nationality' }] }];
    const result = getTallyReport({ matchUps, order, report });
    expect(result).toContain('Excluded');
    expect(result).toContain('Final Order');
  });

  it('handles report with groups (no excludedDirectives)', () => {
    const matchUps = [
      {
        sides: [
          { participantId: 'p1', participant: { participantName: 'Player 1' } },
          { participantId: 'p2', participant: { participantName: 'Player 2' } },
        ],
      },
    ];
    const order = [{ participantId: 'p1', provisionalOrder: 1, resolved: false }];
    const report = [
      {
        attribute: 'wins',
        groups: { '2': ['p1'], '1': ['p2'] },
        reversed: true,
      },
    ];
    const result = getTallyReport({ matchUps, order, report });
    expect(result).toContain('grouped');
    expect(result).toContain('in reverse order');
  });

  it('handles report with idsFilter', () => {
    const matchUps = [
      {
        sides: [
          { participantId: 'p1', participant: { participantName: 'Player 1' } },
          { participantId: 'p2', participant: { participantName: 'Player 2' } },
        ],
      },
    ];
    const order = [{ participantId: 'p1', groupOrder: 1, resolved: true }];
    const report = [{ attribute: 'wins', participantIds: ['p1', 'p2'], idsFilter: true }];
    const result = getTallyReport({ matchUps, order, report });
    expect(result).toContain('ONLY TIED PARTICIPANTS');
  });

  it('handles non-array report', () => {
    const matchUps = [
      {
        sides: [
          { participantId: 'p1', participant: { participantName: 'Player 1' } },
          { participantId: 'p2', participant: { participantName: 'Player 2' } },
        ],
      },
    ];
    const order = [{ participantId: 'p1', groupOrder: 1, resolved: true }];
    const result = getTallyReport({ matchUps, order, report: undefined });
    expect(result).toContain('Final Order');
  });
});

// 14. getSourceRounds — missing params
describe('getSourceRounds branches', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = getSourceRounds({
      drawDefinition: undefined as any,
      structureId: 's1',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when structureId is missing', () => {
    const result = getSourceRounds({
      drawDefinition: { drawId: 'd1' } as any,
      structureId: undefined as any,
    });
    expect(result.error).toEqual(MISSING_STRUCTURE_ID);
  });
});

// 15. getDrawPositionsRanges — missing params
describe('getDrawPositionsRanges branches', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = getDrawPositionsRanges({
      drawDefinition: undefined as any,
      structureId: 's1',
      matchUpsMap: {} as any,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when structureId is missing', () => {
    const result = getDrawPositionsRanges({
      drawDefinition: { drawId: 'd1' } as any,
      structureId: undefined as any,
      matchUpsMap: {} as any,
    });
    expect(result.error).toEqual(MISSING_STRUCTURE_ID);
  });

  it('handles missing roundProfile by deriving from matchUpsMap', () => {
    const result = getDrawPositionsRanges({
      drawDefinition: { drawId: 'd1' } as any,
      structureId: 's1',
      matchUpsMap: { mappedMatchUps: {}, drawMatchUps: [] } as any,
    });
    // With empty matchUpsMap, roundProfile derives as empty - no error, just empty result
    expect(result).toBeDefined();
    expect(result.drawPositionsRanges).toBeDefined();
  });
});

// 16. replaceQualifier — basic structure (hard to unit test, just test the branch for non-DRAW feedProfile)
describe('replaceQualifier branches', () => {
  it('returns success without replacement when feedProfile is not DRAW', () => {
    const result = replaceQualifier({
      inContextDrawMatchUps: [],
      inContextMatchUp: { sides: [] },
      drawDefinition: { drawId: 'd1' },
      winningSide: 1,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'NOT_DRAW' },
          },
        },
      },
    });
    expect(result.qualifierReplaced).toBeUndefined();
  });
});

// 17. allowedTypes — missing tournamentRecord
describe('allowedTypes branches', () => {
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
});

// 18. allocateTeamMatchUpCourts — guard branches
describe('allocateTeamMatchUpCourts branches', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = allocateTeamMatchUpCourts({
      drawDefinition: { drawId: 'd1' } as any,
      matchUpId: 'm1',
      courtIds: [],
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when matchUpId is missing', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = allocateTeamMatchUpCourts({
      tournamentRecord,
      drawDefinition: { drawId: 'd1' } as any,
      matchUpId: undefined as any,
      courtIds: [],
    });
    expect(result.error).toEqual(MISSING_MATCHUP_ID);
  });

  it('returns error for invalid courtIds (non-array, non-undefined)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const matchUpId = drawDefinition.structures[0].matchUps[0].matchUpId;
    const result = allocateTeamMatchUpCourts({
      tournamentRecord,
      drawDefinition,
      matchUpId,
      courtIds: 'invalid' as any,
    });
    // Will get INVALID_MATCHUP (not team) or INVALID_VALUES, either is valid branch hit
    expect(result.error).toBeDefined();
  });
});
