/**
 * Bulk branch-coverage tests (batch 2) for 25 files below 70% branch coverage.
 * Each describe block targets specific uncovered conditional paths.
 */
import { getValidModifyAssignedPairAction } from '@Query/drawDefinition/positionActions/getValidModifyAssignedPairAction';
import { getEventAlternateParticipantIds } from '@Query/drawDefinition/matchUpActions/getEventAlternateParticipantids';
import { hydrateRoundNames } from '@Assemblies/generators/drawDefinitions/generateDrawDefinition/hydrateRoundNames';
import { generateAdHocRounds } from '@Assemblies/generators/drawDefinitions/drawTypes/adHoc/generateAdHocRounds';
import { resetVoluntaryConsolationStructure } from '@Mutate/drawDefinitions/resetVoluntaryConsolationStructure';
import { getScheduledCourtMatchUps, getScheduledVenueMatchUps } from '@Query/venues/getScheduledCourtMatchUps';
import { organizeDrawPositionOptions } from '@Query/drawDefinition/avoidance/organizeDrawPositionOptions';
import { removeMatchUpCourtAssignment } from '@Mutate/matchUps/schedule/removeMatchUpCourtAssignment';
import { getCourtsAvailableAtPeriodStart } from '@Query/venues/getCourtsAvailableAtPeriodStart';
import { getParticipantEventDetails } from '@Query/participants/getParticipantEventDetails';
import { getCompetitionParticipants } from '@Query/participants/getCompetitionParticipants';
import { removeSeededParticipant } from '@Mutate/drawDefinitions/removeSeededParticipant';
import { getRandomQualifierList } from '@Query/drawDefinition/getRandomQualifierList';
import { getPersonRequests } from '@Query/matchUps/scheduling/getPersonRequests';
import { autoSeeding } from '@Assemblies/generators/drawDefinitions/autoSeeding';
import { getSwapOptions } from '@Query/drawDefinition/avoidance/getSwapOptions';
import { removeEntry } from '@Mutate/drawDefinitions/entryGovernor/removeEntry';
import { refreshEventDrawOrder } from '@Mutate/events/refreshEventDrawOrder';
import { updateTeamLineUp } from '@Mutate/drawDefinitions/updateTeamLineUp';
import { publicFindParticipant } from '@Acquire/publicFindParticipant';
import { getStageEntries } from '@Query/drawDefinition/getStageEntries';
import { getEventProperties } from '@Query/event/getEventProperties';
import { validDrawPositions } from '@Validators/validDrawPositions';
import { mapNumbersToIndexes } from '@Tools/mapNumbersToIndexes';
import { setDevContext } from '@Global/state/globalState';
import { getCourts } from '@Query/venues/getCourts';
import { expect, it, describe } from 'vitest';

import {
  INVALID_VALUES,
  MISSING_COURT_ID,
  MISSING_DRAW_DEFINITION,
  MISSING_EVENT,
  MISSING_MAIN_STRUCTURE,
  MISSING_MATCHUPS,
  MISSING_PARTICIPANT_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VALUE,
  NOT_FOUND,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// ----------------------------------------------------------------
// 1. getRandomQualifierList — 2 uncovered branches
// ----------------------------------------------------------------
describe('getRandomQualifierList branch coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    const result: any = getRandomQualifierList({ drawDefinition: undefined as any });
    expect(result.error).toBeDefined();
  });

  it('returns error when no main structure found', () => {
    const result: any = getRandomQualifierList({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
    });
    expect(result.error).toEqual(MISSING_MAIN_STRUCTURE);
  });
});

// ----------------------------------------------------------------
// 2. getSwapOptions — 2 uncovered branches
// ----------------------------------------------------------------
describe('getSwapOptions branch coverage', () => {
  it('returns empty when avoidanceConflicts is empty', () => {
    const result = getSwapOptions({
      positionedParticipants: [],
      potentialDrawPositions: [1, 2],
      drawPositionGroups: [[1, 2]],
      avoidanceConflicts: [],
      isRoundRobin: false,
    });
    expect(result).toEqual([]);
  });

  it('filters out undefined when no conflict-free positions exist', () => {
    // conflicts involve positions that overlap with potentialDrawPositions
    const result = getSwapOptions({
      positionedParticipants: [
        { drawPosition: 1, values: ['a'] },
        { drawPosition: 2, values: ['a'] },
      ],
      potentialDrawPositions: [1, 2],
      drawPositionGroups: [[1, 2]],
      avoidanceConflicts: [[{ drawPosition: 1 }, { drawPosition: 2 }]],
      isRoundRobin: false,
    });
    // no swap options since all positions are in the conflict
    expect(Array.isArray(result)).toBe(true);
  });
});

// ----------------------------------------------------------------
// 3. getEventAlternateParticipantIds — 2 uncovered branches
// ----------------------------------------------------------------
describe('getEventAlternateParticipantIds branch coverage', () => {
  it('returns empty array when no entries match ALTERNATE status', () => {
    const result = getEventAlternateParticipantIds({
      eventEntries: [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' }],
      structure: { stage: 'MAIN', stageSequence: 1 },
    });
    expect(result).toEqual([]);
  });

  it('returns empty array when eventEntries is empty', () => {
    const result = getEventAlternateParticipantIds({
      eventEntries: [],
      structure: { stage: 'MAIN', stageSequence: 1 },
    });
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 4. hydrateRoundNames — 2 uncovered branches
// ----------------------------------------------------------------
describe('hydrateRoundNames branch coverage', () => {
  it('handles drawDefinition with no structures', () => {
    const drawDefinition = { drawId: 'd1' } as any;
    const result = hydrateRoundNames({ drawDefinition, appliedPolicies: {} });
    expect(result.drawDefinition).toBe(drawDefinition);
  });

  it('handles structures with matchUps having no roundNumber', () => {
    const drawDefinition = {
      drawId: 'd1',
      structures: [
        {
          structureId: 's1',
          matchUps: [{ matchUpId: 'm1' }], // no roundNumber
        },
      ],
    } as any;
    const result = hydrateRoundNames({ drawDefinition, appliedPolicies: {} });
    expect(result.drawDefinition).toBe(drawDefinition);
  });
});

// ----------------------------------------------------------------
// 5. autoSeeding — 3 uncovered branches
// ----------------------------------------------------------------
describe('autoSeeding branch coverage', () => {
  it('returns error when event is missing', () => {
    const result = autoSeeding({
      tournamentRecord: {} as any,
      drawDefinition: {} as any,
      policyDefinitions: {},
      scaleAttributes: {},
      scaleName: 'test',
      drawSize: 8,
      drawId: 'd1',
      event: undefined as any,
      stage: 'MAIN' as any,
      sortDescending: false,
      scaleSortMethod: undefined,
    });
    expect(result.error).toBeDefined();
  });

  it('returns INVALID_VALUES when no stageEntries or seedsCount', () => {
    // Provide a valid event with no entries => seedsCount will be 0
    const policyDefinitions = {
      seeding: {
        seedsCountThresholds: [{ drawSize: 8, minimumParticipantCount: 4, seedsCount: 2 }],
      },
    };
    const result = autoSeeding({
      tournamentRecord: {} as any,
      drawDefinition: { entries: [] } as any,
      policyDefinitions,
      scaleAttributes: {},
      scaleName: 'test',
      drawSize: 8,
      drawId: 'd1',
      event: { eventId: 'e1', entries: [] } as any,
      stage: 'MAIN' as any,
      sortDescending: false,
      scaleSortMethod: undefined,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

// ----------------------------------------------------------------
// 6. resetVoluntaryConsolationStructure — 3 uncovered branches
// ----------------------------------------------------------------
describe('resetVoluntaryConsolationStructure branch coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = resetVoluntaryConsolationStructure({
      tournamentRecord: {} as any,
      drawDefinition: undefined as any,
      resetEntries: false,
      event: undefined,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when no VOLUNTARY_CONSOLATION structure found', () => {
    const result = resetVoluntaryConsolationStructure({
      tournamentRecord: {} as any,
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      resetEntries: false,
      event: undefined,
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('resets entries when resetEntries is true', () => {
    const drawDefinition = {
      drawId: 'd1',
      entries: [
        { participantId: 'p1', entryStage: 'VOLUNTARY_CONSOLATION' },
        { participantId: 'p2', entryStage: 'MAIN' },
      ],
      structures: [
        {
          structureId: 's1',
          stage: 'VOLUNTARY_CONSOLATION',
          positionAssignments: [{ drawPosition: 1, participantId: 'p1' }],
          seedAssignments: [],
          matchUps: [{ matchUpId: 'm1' }],
        },
      ],
    } as any;
    const result: any = resetVoluntaryConsolationStructure({
      tournamentRecord: { tournamentId: 't1' } as any,
      drawDefinition,
      resetEntries: true,
      event: { eventId: 'e1' },
    });
    expect(result.success).toBe(true);
    expect(drawDefinition.entries.length).toBe(1);
    expect(drawDefinition.entries[0].participantId).toBe('p2');
  });
});

// ----------------------------------------------------------------
// 7. updateTeamLineUp — 3 uncovered branches
// ----------------------------------------------------------------
describe('updateTeamLineUp branch coverage', () => {
  it('returns error when drawDefinition is not an object', () => {
    const result: any = updateTeamLineUp({
      drawDefinition: 'bad' as any,
      participantId: 'p1',
      tieFormat: {} as any,
      lineUp: [],
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when participantId is not a string', () => {
    const result: any = updateTeamLineUp({
      drawDefinition: { drawId: 'd1' } as any,
      participantId: undefined as any,
      tieFormat: {} as any,
      lineUp: [],
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  });

  it('returns validation error when lineUp is not an array', () => {
    const result: any = updateTeamLineUp({
      drawDefinition: { drawId: 'd1' } as any,
      participantId: 'p1',
      tieFormat: {} as any,
      lineUp: 'bad' as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

// ----------------------------------------------------------------
// 8. getValidModifyAssignedPairAction — 3 uncovered branches
// ----------------------------------------------------------------
describe('getValidModifyAssignedPairAction branch coverage', () => {
  it('returns empty object when no available individual participants', () => {
    const result: any = getValidModifyAssignedPairAction({
      tournamentParticipants: [],
      returnParticipants: false,
      drawPosition: 1,
      participant: { participantId: 'p1', individualParticipantIds: [] },
      drawId: 'd1',
      event: { entries: [] },
    });
    expect(result).toEqual({});
  });

  it('returns action when UNGROUPED entries exist and returnParticipants is false', () => {
    const result: any = getValidModifyAssignedPairAction({
      tournamentParticipants: [{ participantId: 'ip1' }],
      returnParticipants: false,
      drawPosition: 1,
      participant: { participantId: 'pair1', individualParticipantIds: ['ip2'] },
      drawId: 'd1',
      event: { entries: [{ participantId: 'ip1', entryStatus: 'UNGROUPED' }] },
    });
    expect(result.validModifyAssignedPairAction).toBeDefined();
  });

  it('returns action with participant objects when returnParticipants is true', () => {
    const result: any = getValidModifyAssignedPairAction({
      tournamentParticipants: [
        { participantId: 'ip1', participantName: 'P1' },
        { participantId: 'ip2', participantName: 'P2' },
      ],
      returnParticipants: true,
      drawPosition: 1,
      participant: { participantId: 'pair1', individualParticipantIds: ['ip2'] },
      drawId: 'd1',
      event: { entries: [{ participantId: 'ip1', entryStatus: 'UNGROUPED' }] },
    });
    expect(result.validModifyAssignedPairAction).toBeDefined();
    expect(result.validModifyAssignedPairAction.availableIndividualParticipants).toBeDefined();
    expect(result.validModifyAssignedPairAction.existingIndividualParticipants).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 9. getCourtsAvailableAtPeriodStart — 3 uncovered branches
// ----------------------------------------------------------------
describe('getCourtsAvailableAtPeriodStart branch coverage', () => {
  it('returns error when required params missing', () => {
    const result: any = getCourtsAvailableAtPeriodStart({
      averageMatchUpMinutes: 90,
      periodStart: undefined as any,
      courts: [],
      date: '2024-01-01',
    });
    expect(result.error).toBeDefined();
  });

  it('returns error when courts is not an array', () => {
    const result: any = getCourtsAvailableAtPeriodStart({
      averageMatchUpMinutes: 90,
      periodStart: '08:00',
      courts: 'bad' as any,
      date: '2024-01-01',
    });
    expect(result.error).toBeDefined();
  });

  it('returns zero available courts when courts have no dateAvailability', () => {
    const result: any = getCourtsAvailableAtPeriodStart({
      averageMatchUpMinutes: 90,
      periodStart: '08:00',
      courts: [{ courtId: 'c1' }],
      date: '2024-01-01',
    });
    expect(result.availableToScheduleCount).toBe(0);
  });
});

// ----------------------------------------------------------------
// 10. generateAdHocRounds — 3 uncovered branches
// ----------------------------------------------------------------
describe('generateAdHocRounds branch coverage', () => {
  it('returns error when drawDefinition has no entries (getParticipantIds fails)', () => {
    const result: any = generateAdHocRounds({
      drawDefinition: { drawId: 'd1', entries: [] } as any,
      roundsCount: 50,
      restrictRoundsCount: true,
      event: { eventId: 'e1' } as any,
    });
    expect(result.error).toBeDefined();
  });

  it('returns empty matchUps for zero rounds', () => {
    const result: any = generateAdHocRounds({
      drawDefinition: {
        drawId: 'd1',
        entries: [
          { participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' },
          { participantId: 'p2', entryStatus: 'DIRECT_ACCEPTANCE' },
        ],
        structures: [{ structureId: 's1', matchUps: [] }],
      } as any,
      roundsCount: 0,
      event: { eventId: 'e1' } as any,
    });
    expect(result.matchUps).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 11. organizeDrawPositionOptions — 4 uncovered branches
// ----------------------------------------------------------------
describe('organizeDrawPositionOptions branch coverage', () => {
  it('handles round robin path', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: [],
      participantIdGroups: {},
      positionAssignments: [],
      drawPositionChunks: [[[1, 2, 3]]],
      unfilledPositions: [1, 2, 3],
      isRoundRobin: true,
    });
    expect(result.unassigned).toBeDefined();
    expect(result.unpaired).toBeDefined();
    expect(result.pairedNoConflict).toBeDefined();
  });

  it('handles elimination path', () => {
    const result = organizeDrawPositionOptions({
      selectedParticipantGroups: [],
      participantIdGroups: {},
      positionAssignments: [],
      drawPositionChunks: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      unfilledPositions: [1, 2, 3, 4],
      isRoundRobin: false,
    });
    expect(result.unassigned).toBeDefined();
    expect(result.unpaired).toBeDefined();
    expect(result.pairedNoConflict).toBeDefined();
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
  });
});

// ----------------------------------------------------------------
// 12. getPersonRequests — 4 uncovered branches
// ----------------------------------------------------------------
describe('getPersonRequests branch coverage', () => {
  it('returns error when tournamentRecords is missing', () => {
    const result = getPersonRequests({ tournamentRecords: undefined as any });
    expect(result.error).toBeDefined();
  });

  it('returns empty personRequests when no extensions exist', () => {
    const result = getPersonRequests({
      tournamentRecords: {
        t1: { tournamentId: 't1' } as any,
      },
    });
    expect(result.personRequests).toEqual({});
  });

  it('filters by requestType when provided', () => {
    const result = getPersonRequests({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          extensions: [
            {
              name: 'personRequests',
              value: [
                {
                  personId: 'person1',
                  requests: [
                    { requestType: 'DO_NOT_SCHEDULE', date: '2024-01-01' },
                    { requestType: 'OTHER', date: '2024-01-02' },
                  ],
                },
              ],
            },
          ],
        } as any,
      },
      requestType: 'DO_NOT_SCHEDULE',
    });
    expect(result.personRequests?.['person1']?.length).toBe(1);
  });

  it('merges requests across multiple tournament records', () => {
    const result = getPersonRequests({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          extensions: [
            {
              name: 'personRequests',
              value: [{ personId: 'person1', requests: [{ requestType: 'A' }] }],
            },
          ],
        } as any,
        t2: {
          tournamentId: 't2',
          extensions: [
            {
              name: 'personRequests',
              value: [{ personId: 'person1', requests: [{ requestType: 'B' }] }],
            },
          ],
        } as any,
      },
    });
    expect(result.personRequests?.['person1']?.length).toBe(2);
  });
});

// ----------------------------------------------------------------
// 13. mapNumbersToIndexes — 4 uncovered branches
// ----------------------------------------------------------------
describe('mapNumbersToIndexes branch coverage', () => {
  it('maps identical arrays', () => {
    const result = mapNumbersToIndexes([0, 1, 2], [0, 1, 2]);
    expect(result).toHaveLength(3);
  });

  it('handles items not found in indexArray (else branch)', () => {
    const result = mapNumbersToIndexes([10, 20, 30], [99, 88, 77]);
    expect(result).toHaveLength(3);
  });

  it('handles duplicates in randNumberArray', () => {
    const result = mapNumbersToIndexes([0, 1, 2, 3], [1, 1, 2, 3]);
    expect(result).toHaveLength(4);
  });

  it('handles empty arrays', () => {
    const result = mapNumbersToIndexes([], []);
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 14. getScheduledCourtMatchUps / getScheduledVenueMatchUps — 4 uncovered branches
// ----------------------------------------------------------------
describe('getScheduledCourtMatchUps branch coverage', () => {
  it('returns error when tournamentRecord missing and no venueMatchUps', () => {
    const result = getScheduledCourtMatchUps({
      tournamentRecord: undefined as any,
      courtId: 'c1',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when courtId missing', () => {
    const result = getScheduledCourtMatchUps({
      tournamentRecord: { tournamentId: 't1' } as any,
      courtId: undefined as any,
    });
    expect(result.error).toEqual(MISSING_COURT_ID);
  });

  it('uses venueMatchUps when provided (early return path)', () => {
    const result = getScheduledCourtMatchUps({
      tournamentRecord: { tournamentId: 't1' } as any,
      venueMatchUps: [],
      courtId: 'c1',
    });
    expect(result.matchUps).toEqual([]);
  });
});

describe('getScheduledVenueMatchUps branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = getScheduledVenueMatchUps({
      tournamentRecord: undefined as any,
      venueId: 'v1',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when venueId is missing', () => {
    const result = getScheduledVenueMatchUps({
      tournamentRecord: { tournamentId: 't1' } as any,
      venueId: undefined as any,
    });
    expect(result.error).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 15. removeMatchUpCourtAssignment — 5 uncovered branches
// ----------------------------------------------------------------
describe('removeMatchUpCourtAssignment branch coverage', () => {
  it('returns error when tournamentRecords is missing', () => {
    const result = removeMatchUpCourtAssignment({});
    expect(result.error).toBeDefined();
  });

  it('returns error when tournamentRecord not found for tournamentId', () => {
    const result = removeMatchUpCourtAssignment({
      tournamentRecords: { t1: { tournamentId: 't1' } },
      tournamentId: 'nonexistent',
      matchUpId: 'm1',
      drawId: 'd1',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when drawDefinition not found', () => {
    const result = removeMatchUpCourtAssignment({
      tournamentRecords: { t1: { tournamentId: 't1', events: [] } },
      tournamentId: 't1',
      matchUpId: 'm1',
      drawId: 'nonexistent',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });
});

// ----------------------------------------------------------------
// 16. getParticipantEventDetails — 4 uncovered branches
// ----------------------------------------------------------------
describe('getParticipantEventDetails branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = getParticipantEventDetails({
      tournamentRecord: undefined as any,
      participantId: 'p1',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when participantId is missing', () => {
    const result = getParticipantEventDetails({
      tournamentRecord: { tournamentId: 't1' } as any,
      participantId: undefined as any,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  });

  it('returns empty eventDetails when no events match', () => {
    const result = getParticipantEventDetails({
      tournamentRecord: {
        tournamentId: 't1',
        participants: [],
        events: [{ eventId: 'e1', entries: [{ participantId: 'other' }] }],
      } as any,
      participantId: 'p1',
    });
    expect(result.eventDetails).toEqual([]);
  });

  it('finds events via TEAM/PAIR participant membership', () => {
    const result = getParticipantEventDetails({
      tournamentRecord: {
        tournamentId: 't1',
        participants: [{ participantId: 'team1', participantType: 'TEAM', individualParticipantIds: ['p1'] }],
        events: [{ eventId: 'e1', eventName: 'E1', entries: [{ participantId: 'team1' }] }],
      } as any,
      participantId: 'p1',
    });
    expect(result.eventDetails?.length).toBe(1);
    expect(result.eventDetails?.[0].eventId).toBe('e1');
  });
});

// ----------------------------------------------------------------
// 17. publicFindParticipant — 5 uncovered branches
// ----------------------------------------------------------------
describe('publicFindParticipant branch coverage', () => {
  it('returns error when neither participantId nor personId is a string', () => {
    const result = publicFindParticipant({});
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns participant when found by participantId in tournamentRecord', () => {
    const result = publicFindParticipant({
      tournamentRecord: {
        tournamentId: 't1',
        participants: [{ participantId: 'p1', participantName: 'Test' }],
      } as any,
      participantId: 'p1',
    });
    expect(result.participant).toBeDefined();
    expect(result.tournamentId).toBe('t1');
  });

  it('returns undefined participant when not found', () => {
    const result = publicFindParticipant({
      tournamentRecords: {
        t1: { tournamentId: 't1', participants: [] } as any,
      },
      participantId: 'nonexistent',
    });
    expect(result.participant).toBeUndefined();
  });

  it('searches by personId', () => {
    const result = publicFindParticipant({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          participants: [{ participantId: 'p1', person: { personId: 'per1' } }],
        } as any,
      },
      personId: 'per1',
    });
    expect(result.participant).toBeDefined();
  });

  it('uses empty object when no tournamentRecords or tournamentRecord', () => {
    const result = publicFindParticipant({ participantId: 'p1' });
    expect(result.participant).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// 18. getCompetitionParticipants — 4 uncovered branches
// ----------------------------------------------------------------
describe('getCompetitionParticipants branch coverage', () => {
  it('returns error when tournamentRecords is not an object', () => {
    const result = getCompetitionParticipants({ tournamentRecords: undefined });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('returns error when tournamentRecords is empty object', () => {
    const result = getCompetitionParticipants({ tournamentRecords: {} });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('returns participants from a single tournament record', () => {
    const result = getCompetitionParticipants({
      tournamentRecords: {
        t1: {
          tournamentId: 't1',
          participants: [{ participantId: 'p1', participantName: 'Test' }],
        },
      },
    });
    expect(result.participants?.length).toBeGreaterThanOrEqual(1);
  });
});

// ----------------------------------------------------------------
// 19. refreshEventDrawOrder — 4 uncovered branches
// ----------------------------------------------------------------
describe('refreshEventDrawOrder branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = refreshEventDrawOrder({ tournamentRecord: undefined, event: {} });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when event is missing', () => {
    const result = refreshEventDrawOrder({ tournamentRecord: { tournamentId: 't1' }, event: undefined });
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('handles event with no drawDefinitions', () => {
    const result = refreshEventDrawOrder({
      tournamentRecord: { tournamentId: 't1' },
      event: { eventId: 'e1' },
    });
    expect(result.error).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// 20. getCourts — 4 uncovered branches
// ----------------------------------------------------------------
describe('getCourts branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = getCourts({ tournamentRecord: undefined, venueId: undefined, venueIds: undefined });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns all courts when no venueId or venueIds filter', () => {
    const result = getCourts({
      tournamentRecord: {
        venues: [
          { venueId: 'v1', courts: [{ courtId: 'c1' }] },
          { venueId: 'v2', courts: [{ courtId: 'c2' }] },
        ],
      },
      venueId: undefined,
      venueIds: undefined,
    });
    expect(result.courts?.length).toBe(2);
  });

  it('filters by venueId', () => {
    const result = getCourts({
      tournamentRecord: {
        venues: [
          { venueId: 'v1', courts: [{ courtId: 'c1' }] },
          { venueId: 'v2', courts: [{ courtId: 'c2' }] },
        ],
      },
      venueId: 'v1',
      venueIds: undefined,
    });
    expect(result.courts?.length).toBe(1);
    expect(result.courts[0].courtId).toBe('c1');
  });

  it('filters by venueIds array', () => {
    const result = getCourts({
      tournamentRecord: {
        venues: [
          { venueId: 'v1', courts: [{ courtId: 'c1' }] },
          { venueId: 'v2', courts: [{ courtId: 'c2' }] },
          { venueId: 'v3', courts: [{ courtId: 'c3' }] },
        ],
      },
      venueId: undefined,
      venueIds: ['v1', 'v3'],
    });
    expect(result.courts?.length).toBe(2);
  });
});

// ----------------------------------------------------------------
// 21. getStageEntries — 5 uncovered branches
// ----------------------------------------------------------------
describe('getStageEntries branch coverage', () => {
  it('returns entries from event when no drawId', () => {
    const result = getStageEntries({
      drawDefinition: { drawId: 'd1' } as any,
      event: { entries: [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE', entryStage: 'MAIN' }] } as any,
    });
    expect(result.entries.length).toBe(1);
  });

  it('uses flight drawEntries when drawId matches a flight', () => {
    const result = getStageEntries({
      drawDefinition: { drawId: 'd1' } as any,
      drawId: 'd1',
      event: {
        entries: [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' }],
        extensions: [
          {
            name: 'flightProfile',
            value: {
              flights: [{ drawId: 'd1', drawEntries: [{ participantId: 'p2', entryStatus: 'DIRECT_ACCEPTANCE' }] }],
            },
          },
        ],
      } as any,
    });
    expect(result.entries).toEqual([{ participantId: 'p2', entryStatus: 'DIRECT_ACCEPTANCE' }]);
  });

  it('uses drawDefinition.entries when drawId does not match a flight', () => {
    const result = getStageEntries({
      drawDefinition: {
        drawId: 'd1',
        entries: [{ participantId: 'p3', entryStatus: 'DIRECT_ACCEPTANCE' }],
      } as any,
      drawId: 'd2',
      event: {
        entries: [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' }],
      } as any,
    });
    expect(result.entries).toEqual([{ participantId: 'p3', entryStatus: 'DIRECT_ACCEPTANCE' }]);
  });

  it('filters by entryStatuses', () => {
    const result = getStageEntries({
      drawDefinition: { drawId: 'd1' } as any,
      entryStatuses: ['ALTERNATE'] as any,
      selected: false,
      event: {
        entries: [
          { participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' },
          { participantId: 'p2', entryStatus: 'ALTERNATE' },
        ],
      } as any,
    });
    expect(result.stageEntries.length).toBe(1);
    expect(result.stageEntries[0].participantId).toBe('p2');
  });

  it('filters by stage', () => {
    const result = getStageEntries({
      drawDefinition: { drawId: 'd1' } as any,
      stage: 'QUALIFYING',
      selected: false,
      event: {
        entries: [
          { participantId: 'p1', entryStage: 'MAIN' },
          { participantId: 'p2', entryStage: 'QUALIFYING' },
        ],
      } as any,
    });
    expect(result.stageEntries.length).toBe(1);
    expect(result.stageEntries[0].participantId).toBe('p2');
  });
});

// ----------------------------------------------------------------
// 22. getEventProperties — 5 uncovered branches
// ----------------------------------------------------------------
describe('getEventProperties branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = getEventProperties({ tournamentRecord: undefined, event: {} });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when event is missing', () => {
    const result = getEventProperties({ tournamentRecord: { tournamentId: 't1' }, event: undefined });
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns empty scale attributes when no participants match entries', () => {
    const result = getEventProperties({
      tournamentRecord: { tournamentId: 't1', participants: [] },
      event: { eventId: 'e1', entries: [{ participantId: 'p1' }] },
    });
    expect(result.entryScaleAttributes).toEqual([]);
  });

  it('returns scale attributes for entered participants', () => {
    const result = getEventProperties({
      tournamentRecord: {
        tournamentId: 't1',
        participants: [{ participantId: 'p1', participantName: 'Test' }],
      },
      event: { eventId: 'e1', entries: [{ participantId: 'p1' }], category: { categoryName: 'U18' } },
    });
    expect(result.entryScaleAttributes?.length).toBe(1);
    expect(result.entryScaleAttributes[0].participantId).toBe('p1');
  });
});

// ----------------------------------------------------------------
// 23. removeSeededParticipant — 5 uncovered branches
// ----------------------------------------------------------------
describe('removeSeededParticipant branch coverage', () => {
  it('returns error when tournamentRecord is missing', () => {
    const result = removeSeededParticipant({
      tournamentRecord: undefined as any,
      drawDefinition: {} as any,
      participantId: 'p1',
      structureId: 's1',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when drawDefinition is missing', () => {
    const result = removeSeededParticipant({
      tournamentRecord: {} as any,
      drawDefinition: undefined as any,
      participantId: 'p1',
      structureId: 's1',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when structure is not found', () => {
    const result = removeSeededParticipant({
      tournamentRecord: {} as any,
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      participantId: 'p1',
      structureId: 'nonexistent',
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('returns error for invalid structure stage', () => {
    const result = removeSeededParticipant({
      tournamentRecord: {} as any,
      drawDefinition: {
        drawId: 'd1',
        structures: [{ structureId: 's1', stage: 'CONSOLATION', stageSequence: 1 }],
      } as any,
      participantId: 'p1',
      structureId: 's1',
    });
    expect(result.error).toBeDefined();
  });

  it('returns NOT_FOUND when participant is not seeded', () => {
    const result = removeSeededParticipant({
      tournamentRecord: {} as any,
      drawDefinition: {
        drawId: 'd1',
        structures: [
          {
            structureId: 's1',
            stage: 'MAIN',
            stageSequence: 1,
            seedAssignments: [{ seedNumber: 1, participantId: 'other' }],
          },
        ],
      } as any,
      participantId: 'p1',
      structureId: 's1',
    });
    expect(result.error).toEqual(NOT_FOUND);
  });
});

// ----------------------------------------------------------------
// 24. removeEntry — 5 uncovered branches
// ----------------------------------------------------------------
describe('removeEntry branch coverage', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = removeEntry({
      drawDefinition: undefined as any,
      participantId: 'p1',
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when participantId is missing', () => {
    const result = removeEntry({
      drawDefinition: { drawId: 'd1' } as any,
      participantId: undefined as any,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  });

  it('removes entry from drawDefinition entries', () => {
    const drawDefinition = {
      drawId: 'd1',
      structures: [],
      entries: [
        { participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' },
        { participantId: 'p2', entryStatus: 'DIRECT_ACCEPTANCE' },
      ],
    } as any;
    const result: any = removeEntry({ drawDefinition, participantId: 'p1' });
    expect(result.success).toBe(true);
    expect(drawDefinition.entries.find((e) => e.participantId === 'p1')).toBeUndefined();
  });

  it('skips refreshEntryPositions when autoEntryPositions is false', () => {
    const drawDefinition = {
      drawId: 'd1',
      structures: [],
      entries: [{ participantId: 'p1', entryStatus: 'DIRECT_ACCEPTANCE' }],
    } as any;
    const result: any = removeEntry({ drawDefinition, participantId: 'p1', autoEntryPositions: false });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 25. validDrawPositions — 5 uncovered branches
// ----------------------------------------------------------------
describe('validDrawPositions branch coverage', () => {
  it('returns error when matchUps is missing', () => {
    const result = validDrawPositions({ matchUps: undefined });
    expect(result.error).toEqual(MISSING_MATCHUPS);
  });

  it('returns true for valid draw positions', () => {
    const result = validDrawPositions({
      matchUps: [{ drawPositions: [1, 2] }, { drawPositions: [3, 4] }],
    });
    expect(result).toBe(true);
  });

  it('returns false when drawPositions is not an array', () => {
    const result = validDrawPositions({
      matchUps: [{ drawPositions: 'bad' }],
    });
    expect(result).toBe(false);
  });

  it('returns false for invalid (NaN) draw positions', () => {
    const result = validDrawPositions({
      matchUps: [{ drawPositions: [Number.NaN, 2] }],
    });
    expect(result).toBe(false);
  });

  it('exercises devContext logging branch', () => {
    setDevContext(true);
    const result = validDrawPositions({
      matchUps: [
        { drawPositions: [1, 2] },
        { drawPositions: 'not-array' }, // triggers console.log for non-array
      ],
    });
    setDevContext(false);
    expect(result).toBe(false);
  });

  it('exercises devContext with invalid drawPosition value', () => {
    setDevContext(true);
    const result = validDrawPositions({
      matchUps: [{ drawPositions: [Number.NaN] }],
    });
    setDevContext(false);
    expect(result).toBe(false);
  });
});
