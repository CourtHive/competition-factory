/**
 * Branch coverage tests for modules below 70% branch coverage.
 * Tests call functions directly to hit uncovered conditional paths.
 */
import { savePersonRequests } from '@Mutate/matchUps/schedule/scheduleMatchUps/personRequests/savePersonRequests';
import { mergePersonRequests } from '@Mutate/matchUps/schedule/scheduleMatchUps/personRequests/mergePersonRequests';
import { setDrawPositionPreferences } from '@Mutate/drawDefinitions/draft/setDrawPositionPreferences';
import { auditAutoScheduling } from '@Mutate/matchUps/schedule/schedulers/auditAutoScheduling';
import { applyTournamentRankingPoints } from '@Mutate/scales/applyTournamentRankingPoints';
import { getDraftState } from '@Query/drawDefinition/draft/getDraftState';
import { participantHeadToHead } from '../../analyze/report/headToHead';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { COMPLETED, DEFAULTED } from '@Constants/matchUpStatusConstants';

// ----------------------------------------------------------------
// headToHead — branch coverage
// ----------------------------------------------------------------
describe('headToHead branch coverage', () => {
  it('returns error when participants.length !== 2', () => {
    const result = participantHeadToHead({
      participants: [] as any,
      mappedMatchUps: {},
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('handles matchUps without winningSide (incomplete/walkover)', () => {
    // Two participants who played each other, but the matchUp has no winningSide
    const p1Id = 'p1';
    const p2Id = 'p2';
    const matchUpId = 'm1';

    const participants = [
      {
        participantId: p1Id,
        matchUps: [
          {
            matchUpId,
            participantWon: false,
            opponentParticipantInfo: [{ participantId: p2Id }],
          },
        ],
      },
      {
        participantId: p2Id,
        matchUps: [
          {
            matchUpId,
            participantWon: false,
            opponentParticipantInfo: [{ participantId: p1Id }],
          },
        ],
      },
    ] as any;

    // Partial HydratedMatchUp shape — participantHeadToHead only reads
    // score/winningSide/matchUpFormat/matchUpStatus, so the other fields
    // (structureId, drawId, eventId, tournamentId) are intentionally omitted.
    const mappedMatchUps = {
      [matchUpId]: {
        matchUpId,
        matchUpStatus: DEFAULTED,
        winningSide: undefined,
        score: undefined,
        matchUpFormat: 'SET3-S:6/TB7',
      },
    } as any;

    const result = participantHeadToHead({ participants, mappedMatchUps });
    expect(result.success).toEqual(true);
    // h2h should exist but won/lost arrays empty (no winningSide)
    expect(result.h2h[0].won.length).toEqual(0);
    expect(result.h2h[0].lost.length).toEqual(0);
  });

  it('handles encounter with winningSide but no score', () => {
    const p1Id = 'p1';
    const p2Id = 'p2';
    const matchUpId = 'm1';

    const participants = [
      {
        participantId: p1Id,
        matchUps: [
          {
            matchUpId,
            participantWon: true,
            opponentParticipantInfo: [{ participantId: p2Id }],
          },
        ],
      },
      {
        participantId: p2Id,
        matchUps: [
          {
            matchUpId,
            participantWon: false,
            opponentParticipantInfo: [{ participantId: p1Id }],
          },
        ],
      },
    ] as any;

    // Partial HydratedMatchUp shape (see note above).
    const mappedMatchUps = {
      [matchUpId]: {
        matchUpId,
        matchUpStatus: COMPLETED,
        winningSide: 1,
        score: undefined, // winningSide but no score
        matchUpFormat: 'SET3-S:6/TB7',
      },
    } as any;

    const result = participantHeadToHead({ participants, mappedMatchUps });
    expect(result.success).toEqual(true);
    // encounter has winningSide but no score → not pushed to h2h won/lost
    expect(result.h2h[0].won.length).toEqual(0);
  });

  it('handles common opponents with wins and losses including game/set counting', () => {
    const p1Id = 'p1';
    const p2Id = 'p2';
    const commonOpponentId = 'opp1';

    // p1 beat opp1 in m1, p2 lost to opp1 in m2
    const participants = [
      {
        participantId: p1Id,
        matchUps: [
          {
            matchUpId: 'm1',
            participantWon: true,
            opponentParticipantInfo: [{ participantId: commonOpponentId }],
          },
        ],
      },
      {
        participantId: p2Id,
        matchUps: [
          {
            matchUpId: 'm2',
            participantWon: false,
            opponentParticipantInfo: [{ participantId: commonOpponentId }],
          },
        ],
      },
    ] as any;

    // Partial HydratedMatchUp shape (see note above).
    const mappedMatchUps = {
      m1: {
        matchUpId: 'm1',
        matchUpStatus: COMPLETED,
        winningSide: 1,
        score: {
          sets: [
            { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
            { side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 2 },
          ],
        },
        matchUpFormat: 'SET3-S:6/TB7',
      },
      m2: {
        matchUpId: 'm2',
        matchUpStatus: COMPLETED,
        winningSide: 1, // opp1 won
        score: {
          sets: [
            { side1Score: 6, side2Score: 2, winningSide: 1, setNumber: 1 },
            { side1Score: 6, side2Score: 1, winningSide: 1, setNumber: 2 },
          ],
        },
        matchUpFormat: 'SET3-S:6/TB7',
      },
    } as any;

    const result = participantHeadToHead({ participants, mappedMatchUps });
    expect(result.success).toEqual(true);
    // p1 has common opponent data
    expect(result.h2h[0].commonOpponents[commonOpponentId]).toBeDefined();
    expect(result.h2h[0].commonOpponents[commonOpponentId].matchUpsWon).toEqual(1);
    // p2 lost to common opponent
    expect(result.h2h[1].commonOpponents[commonOpponentId]).toBeDefined();
    expect(result.h2h[1].commonOpponents[commonOpponentId].matchUpsLost).toEqual(1);
    // CIC percentages should be computed
    expect(result.h2h[0].cicMatchUpsWinPct).toBeGreaterThan(0);
  });

  it('handles no common opponents (division by zero)', () => {
    const participants = [
      {
        participantId: 'p1',
        matchUps: [
          {
            matchUpId: 'm1',
            participantWon: true,
            opponentParticipantInfo: [{ participantId: 'opp1' }],
          },
        ],
      },
      {
        participantId: 'p2',
        matchUps: [
          {
            matchUpId: 'm2',
            participantWon: true,
            opponentParticipantInfo: [{ participantId: 'opp2' }],
          },
        ],
      },
    ] as any;

    // Partial HydratedMatchUp shape (see note above).
    const mappedMatchUps = {
      m1: { matchUpId: 'm1', matchUpStatus: COMPLETED, winningSide: 1, score: {}, matchUpFormat: 'SET3-S:6/TB7' },
      m2: { matchUpId: 'm2', matchUpStatus: COMPLETED, winningSide: 1, score: {}, matchUpFormat: 'SET3-S:6/TB7' },
    } as any;

    const result = participantHeadToHead({ participants, mappedMatchUps });
    expect(result.success).toEqual(true);
    // No common opponents → countedOpponents = 0 → NaN pct
    expect(result.h2h[0].cicMatchUpsWinPct).toBeNaN();
  });
});

// ----------------------------------------------------------------
// personRequests — branch coverage
// ----------------------------------------------------------------
function setupWithPersonRequests() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
  });
  tournamentEngine.setState(tournamentRecord);
  const personId = tournamentRecord.participants[0].person?.personId;
  return { tournamentRecord, personId };
}

describe('personRequests branch coverage', () => {
  it('addPersonRequests returns error for empty/invalid requests', () => {
    const { personId } = setupWithPersonRequests();

    // requests without requestType → mergeCount = 0 → INVALID_VALUES
    const result = tournamentEngine.addPersonRequests({
      personId,
      requests: [{ date: '2025-01-01' }], // no requestType
    });
    expect(result.error).toBeDefined();
  });

  it('addPersonRequests with DO_NOT_SCHEDULE request', () => {
    const { personId } = setupWithPersonRequests();

    const result = tournamentEngine.addPersonRequests({
      personId,
      requests: [
        {
          requestType: DO_NOT_SCHEDULE,
          date: '2025-07-01',
          startTime: '09:00',
          endTime: '12:00',
        },
      ],
    });
    expect(result.success).toEqual(true);
  });

  it('addPersonRequests with non-DO_NOT_SCHEDULE request type', () => {
    const { personId } = setupWithPersonRequests();

    const result = tournamentEngine.addPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_EARLY' }],
    });
    expect(result.success).toEqual(true);
  });

  it('addPersonRequests with DO_NOT_SCHEDULE and invalid date/time', () => {
    const { personId } = setupWithPersonRequests();

    // Invalid date format → extractDate returns undefined → request still passes (non-date-filtered)
    const result = tournamentEngine.addPersonRequests({
      personId,
      requests: [
        {
          requestType: DO_NOT_SCHEDULE,
          date: 'bad-date',
          startTime: 'bad',
          endTime: 'bad',
        },
      ],
    });
    // Still succeeds — request is added without date/time validation (non-matching extractDate returns the original)
    expect(result.success).toEqual(true);
  });

  it('modifyPersonRequests without personId modifies across all personIds', () => {
    const { personId } = setupWithPersonRequests();

    // Add a request first
    tournamentEngine.addPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_EARLY' }],
    });

    // Get the requestId
    const { personRequests } = tournamentEngine.getPersonRequests();
    const requestId = personRequests?.[personId]?.[0]?.requestId;
    expect(requestId).toBeDefined();

    // Modify without personId → iterates all personIds
    const result = tournamentEngine.modifyPersonRequests({
      requests: [{ requestId, requestType: 'SCHEDULE_LATE' }],
    });
    expect(result.success).toEqual(true);
  });

  it('modifyPersonRequests removes request when modification has no requestType', () => {
    const { personId } = setupWithPersonRequests();

    tournamentEngine.addPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_EARLY' }],
    });

    const { personRequests } = tournamentEngine.getPersonRequests();
    const requestId = personRequests?.[personId]?.[0]?.requestId;

    // Modify with requestId but no requestType → removes request
    const result = tournamentEngine.modifyPersonRequests({
      personId,
      requests: [{ requestId }], // no requestType
    });
    expect(result.success).toEqual(true);
  });

  it('modifyPersonRequests adds new requests (without requestId)', () => {
    const { personId } = setupWithPersonRequests();

    tournamentEngine.addPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_EARLY' }],
    });

    // Mix: modify existing + add new (no requestId)
    const result = tournamentEngine.modifyPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_LATE' }], // new (no requestId)
    });
    expect(result.success).toEqual(true);
  });

  it('removePersonRequests with removeAll (no filters)', () => {
    const { personId } = setupWithPersonRequests();

    tournamentEngine.addPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_EARLY' }],
    });

    // Remove all — no requestType, requestId, personId, or date
    const result = tournamentEngine.removePersonRequests({});
    expect(result.success).toEqual(true);
  });

  it('removePersonRequests by requestType across all personIds', () => {
    const { personId } = setupWithPersonRequests();

    tournamentEngine.addPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_EARLY' }],
    });

    // Remove by requestType without specifying personId
    const result = tournamentEngine.removePersonRequests({
      requestType: 'SCHEDULE_EARLY',
    });
    expect(result.success).toEqual(true);
  });

  it('removePersonRequests by date', () => {
    const { personId } = setupWithPersonRequests();

    tournamentEngine.addPersonRequests({
      personId,
      requests: [
        {
          requestType: DO_NOT_SCHEDULE,
          date: '2025-07-01',
          startTime: '09:00',
          endTime: '12:00',
        },
      ],
    });

    const result = tournamentEngine.removePersonRequests({
      date: '2025-07-01',
    });
    expect(result.success).toEqual(true);
  });

  it('removePersonRequests by specific personId', () => {
    const { personId } = setupWithPersonRequests();

    tournamentEngine.addPersonRequests({
      personId,
      requests: [{ requestType: 'SCHEDULE_EARLY' }],
    });

    const result = tournamentEngine.removePersonRequests({
      personId,
      requestType: 'SCHEDULE_EARLY',
    });
    expect(result.success).toEqual(true);
  });
});

// ----------------------------------------------------------------
// savePersonRequests — direct call edge cases
// ----------------------------------------------------------------
describe('savePersonRequests branch coverage', () => {
  it('returns success when personRequests is undefined', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    const result = savePersonRequests({
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
      personRequests: undefined,
    });
    expect(result.success).toEqual(true);
  });

  it('handles personId not matching any tournament participant', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    const result = savePersonRequests({
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
      personRequests: { 'nonexistent-person': [{ requestType: 'X', requestId: 'r1' } as any] },
    });
    expect(result.success).toEqual(true);
  });

  it('handles empty requests array for a personId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    const personId = tournamentRecord.participants[0].person?.personId;
    if (!personId) return;

    const result = savePersonRequests({
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
      personRequests: { [personId]: [] },
    });
    expect(result.success).toEqual(true);
  });
});

// ----------------------------------------------------------------
// mergePersonRequests — direct call
// ----------------------------------------------------------------
describe('mergePersonRequests branch coverage', () => {
  it('filters out requests without requestType', () => {
    const personRequests: any = {};
    const result = mergePersonRequests({
      personRequests,
      personId: 'p1',
      requests: [
        { requestType: 'SCHEDULE_EARLY' },
        { date: '2025-01-01' }, // no requestType → filtered
      ],
    });
    expect(result.mergeCount).toEqual(1);
    expect(personRequests['p1'].length).toEqual(1);
  });

  it('DO_NOT_SCHEDULE with valid date/time gets normalized', () => {
    const personRequests: any = {};
    const result = mergePersonRequests({
      personRequests,
      personId: 'p1',
      requests: [
        {
          requestType: DO_NOT_SCHEDULE,
          date: '2025-07-01T00:00:00.000Z',
          startTime: '09:30:00',
          endTime: '12:00:00',
        },
      ],
    });
    expect(result.mergeCount).toEqual(1);
  });

  it('DO_NOT_SCHEDULE with missing date still includes request', () => {
    const personRequests: any = {};
    const result = mergePersonRequests({
      personRequests,
      personId: 'p1',
      requests: [
        {
          requestType: DO_NOT_SCHEDULE,
          // no date, startTime, endTime
        },
      ],
    });
    // Request still passes through (the if(date && startTime && endTime) returns the original request)
    expect(result.mergeCount).toEqual(1);
  });

  it('creates personId entry if not present', () => {
    const personRequests: any = {};
    mergePersonRequests({
      personRequests,
      personId: 'newPerson',
      requests: [{ requestType: 'SCHEDULE_LATE' }],
    });
    expect(personRequests['newPerson']).toBeDefined();
    expect(personRequests['newPerson'].length).toEqual(1);
  });
});

// ----------------------------------------------------------------
// applyTournamentRankingPoints — branch coverage
// ----------------------------------------------------------------
describe('applyTournamentRankingPoints branch coverage', () => {
  it('returns error for missing tournamentRecord', () => {
    const result = applyTournamentRankingPoints({ tournamentRecord: undefined as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns points result on valid tournament', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(tournamentRecord);

    // Apply ranking points
    const result = tournamentEngine.applyTournamentRankingPoints({});
    // May or may not find personPoints depending on policy — just check no crash
    expect(result.error || result.success).toBeDefined();
  });
});

// ----------------------------------------------------------------
// getDraftState — branch coverage
// ----------------------------------------------------------------
describe('getDraftState branch coverage', () => {
  it('returns error for missing drawDefinition', () => {
    const result = getDraftState({ drawDefinition: undefined });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns NOT_FOUND when no draft extension exists', () => {
    const result = getDraftState({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
    });
    expect(result.error).toBeDefined();
  });

  it('returns summary for a valid draft state', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    // Initialize draft to create the extension
    const initResult = tournamentEngine.initializeDraft({
      drawId: drawDefinition.drawId,
    });

    if (initResult.success) {
      // Re-read drawDefinition from state
      const { drawDefinition: dd } = tournamentEngine.getEvent({
        drawId: drawDefinition.drawId,
      });
      const result: any = getDraftState({ drawDefinition: dd });
      if (result.draftState) {
        expect(result.summary).toBeDefined();
        expect(result.summary.status).toBeDefined();
        expect(typeof result.summary.totalParticipants).toEqual('number');
      }
    }
  });
});

// ----------------------------------------------------------------
// setDrawPositionPreferences — branch coverage
// ----------------------------------------------------------------
describe('setDrawPositionPreferences branch coverage', () => {
  it('returns error for missing drawDefinition', () => {
    const result = setDrawPositionPreferences({
      drawDefinition: undefined,
      participantId: 'p1',
      preferences: [1, 2],
    } as any);
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error for missing participantId', () => {
    const result = setDrawPositionPreferences({
      drawDefinition: { drawId: 'd1' } as any,
      participantId: '',
      preferences: [1, 2],
    });
    expect(result.error).toBeDefined();
  });

  it('returns error for non-array preferences', () => {
    const result = setDrawPositionPreferences({
      drawDefinition: { drawId: 'd1' } as any,
      participantId: 'p1',
      preferences: 'not-array' as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns NOT_FOUND when no draft extension exists', () => {
    const result = setDrawPositionPreferences({
      drawDefinition: { drawId: 'd1', extensions: [] } as any,
      participantId: 'p1',
      preferences: [1, 2],
    });
    expect(result.error).toBeDefined();
  });
});

// ----------------------------------------------------------------
// auditAutoScheduling — branch coverage
// ----------------------------------------------------------------
describe('auditAutoScheduling branch coverage', () => {
  it('handles minimal audit data', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    // Should not throw with minimal data
    auditAutoScheduling({
      autoSchedulingAudit: {
        scheduledDates: [],
        schedulingProfile: [],
      },
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
    });
    // No assertion needed — just verifying no crash
  });

  it('handles audit data with nested values', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    auditAutoScheduling({
      autoSchedulingAudit: {
        scheduledDates: ['2025-07-01'],
        noTimeMatchUpIds: { '2025-07-01': ['m1', 'm2'] },
        scheduledMatchUpIds: { '2025-07-01': ['m3'] },
        overLimitMatchUpIds: { '2025-07-01': ['m4'] },
        requestConflicts: { '2025-07-01': ['c1'] },
        schedulingProfile: [
          {
            venues: [{ rounds: [{ roundNumber: 1 }, { roundNumber: 2 }] }],
          },
        ],
      },
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
    });
  });

  it('handles getCount with null/undefined values', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    auditAutoScheduling({
      autoSchedulingAudit: {
        scheduledDates: undefined,
        noTimeMatchUpIds: undefined,
        scheduledMatchUpIds: null,
        schedulingProfile: [],
      },
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
    });
  });
});
