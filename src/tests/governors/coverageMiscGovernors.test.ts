// Coverage tests for untested methods across event, schedule, matchUp,
// participant, and sanctioning governors.

// Mutate
import { getMatchUpsToSchedule } from '@Mutate/matchUps/schedule/scheduleMatchUps/getMatchUpsToSchedule';
import { addFlight } from '@Mutate/events/addFlight';

// Query
import { querySanctioningRecord } from '@Query/sanctioning/getSanctioningRecord';
import { checkMatchUpIsComplete } from '@Query/matchUp/checkMatchUpIsComplete';
import { getScaleValues } from '@Query/participant/getScaleValues';

// Validators
import { validateCategory } from '@Validators/validateCategory';

// Engines
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// Testing
import { describe, expect, it } from 'vitest';

// Constants
import { INVALID_VALUES, MISSING_EVENT, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { COMPLETED, RETIRED, WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RATING, SCALE } from '@Constants/scaleConstants';

// ----------------------------------------------------------------
// Event Governor
// ----------------------------------------------------------------
describe('addFlight', () => {
  it('returns MISSING_EVENT when event is missing', () => {
    let result: any = addFlight({ drawId: 'd1', drawName: 'Flight 1' } as any);
    expect(result.error).toBe(MISSING_EVENT);
  });

  it('returns MISSING_VALUE when drawName is missing', () => {
    let result: any = addFlight({ event: { eventId: 'e1' }, drawId: 'd1' } as any);
    expect(result.error).toBe(MISSING_VALUE);
  });

  it('adds a flight to an event', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const event = tournamentRecord.events[0];

    let result: any = addFlight({
      drawName: 'Flight 2',
      drawId: 'flight-2',
      event,
    });
    expect(result.success).toBe(true);
  });

  it('returns INVALID_VALUES when drawEntries contain unknown participants', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const event = tournamentRecord.events[0];

    let result: any = addFlight({
      drawEntries: [{ participantId: 'unknown-pid' }],
      drawName: 'Flight Bad',
      drawId: 'flight-bad',
      event,
    });
    expect(result.error).toBe(INVALID_VALUES);
  });
});

describe('validateCategory', () => {
  it('returns error for non-object category', () => {
    let result: any = validateCategory({ category: 'not-an-object' });
    expect(result.error).toBe(INVALID_VALUES);
  });

  it('validates a category with categoryName', () => {
    let result: any = validateCategory({
      category: { categoryName: 'U18' },
    });
    expect(result.error).toBeUndefined();
  });

  it('validates a category with ageCategoryCode', () => {
    let result: any = validateCategory({
      category: { ageCategoryCode: '18U' },
    });
    expect(result.error).toBeUndefined();
  });

  it('returns error for invalid ratingMax', () => {
    let result: any = validateCategory({
      category: { categoryName: 'Open', ratingMax: 'not-a-number' },
    });
    expect(result.error).toBe(INVALID_VALUES);
  });

  it('returns error for invalid ratingMin', () => {
    let result: any = validateCategory({
      category: { categoryName: 'Open', ratingMin: 'not-a-number' },
    });
    expect(result.error).toBe(INVALID_VALUES);
  });

  it('accepts numeric ratingMin and ratingMax', () => {
    let result: any = validateCategory({
      category: { categoryName: 'Open', ratingMin: 1, ratingMax: 5 },
    });
    expect(result.error).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// Schedule Governor
// ----------------------------------------------------------------
describe('getMatchUpsToSchedule', () => {
  it('filters out completed and BYE matchUps', () => {
    const matchUps = [
      { matchUpId: 'm1', matchUpStatus: COMPLETED },
      { matchUpId: 'm2', matchUpStatus: BYE },
      { matchUpId: 'm3', matchUpStatus: RETIRED },
      { matchUpId: 'm4', matchUpStatus: WALKOVER },
      { matchUpId: 'm5' }, // pending
    ];
    const orderedMatchUpIds = ['m1', 'm2', 'm3', 'm4', 'm5'];

    const { matchUpsToSchedule } = getMatchUpsToSchedule({ matchUps, orderedMatchUpIds });
    expect(matchUpsToSchedule).toBeDefined();
    expect(matchUpsToSchedule!.length).toBe(1);
    expect(matchUpsToSchedule![0].matchUpId).toBe('m5');
  });

  it('filters out matchUps with winningSide', () => {
    const matchUps = [{ matchUpId: 'm1', winningSide: 1 }, { matchUpId: 'm2' }];
    const orderedMatchUpIds = ['m1', 'm2'];

    const { matchUpsToSchedule } = getMatchUpsToSchedule({ matchUps, orderedMatchUpIds });
    expect(matchUpsToSchedule!.length).toBe(1);
    expect(matchUpsToSchedule![0].matchUpId).toBe('m2');
  });

  it('returns only matchUps in orderedMatchUpIds', () => {
    const matchUps = [{ matchUpId: 'm1' }, { matchUpId: 'm2' }, { matchUpId: 'm3' }];
    const orderedMatchUpIds = ['m2'];

    const { matchUpsToSchedule } = getMatchUpsToSchedule({ matchUps, orderedMatchUpIds });
    expect(matchUpsToSchedule!.length).toBe(1);
    expect(matchUpsToSchedule![0].matchUpId).toBe('m2');
  });

  it('includes completed matchUps when scheduleCompletedMatchUps is true', () => {
    const matchUps = [{ matchUpId: 'm1', matchUpStatus: COMPLETED }, { matchUpId: 'm2' }];
    const orderedMatchUpIds = ['m1', 'm2'];

    const { matchUpsToSchedule } = getMatchUpsToSchedule({
      scheduleCompletedMatchUps: true,
      orderedMatchUpIds,
      matchUps,
    });
    expect(matchUpsToSchedule!.length).toBe(2);
  });
});

describe('publicFindCourt', () => {
  it('finds a court by courtId', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 3, venueId: 'v1' }],
      setState: true,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const courtId = tournamentRecord.venues[0].courts[0].courtId;

    let result: any = tournamentEngine.publicFindCourt({ courtId });
    expect(result.success).toBe(true);
    expect(result.court).toBeDefined();
    expect(result.venue).toBeDefined();
  });

  it('returns error for unknown courtId', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 1, venueId: 'v1' }],
      setState: true,
    });

    let result: any = tournamentEngine.publicFindCourt({ courtId: 'nonexistent' });
    expect(result.error).toBeDefined();
  });
});

// ----------------------------------------------------------------
// MatchUp Governor
// ----------------------------------------------------------------
describe('checkMatchUpIsComplete', () => {
  it('returns false when matchUp is undefined', () => {
    expect(checkMatchUpIsComplete({ matchUp: undefined })).toBe(false);
  });

  it('returns truthy when matchUp has winningSide', () => {
    expect(checkMatchUpIsComplete({ matchUp: { winningSide: 1 } })).toBeTruthy();
  });

  it('returns true when matchUp has COMPLETED status', () => {
    expect(checkMatchUpIsComplete({ matchUp: { matchUpStatus: COMPLETED } })).toBe(true);
  });

  it('returns true when matchUp has RETIRED status', () => {
    expect(checkMatchUpIsComplete({ matchUp: { matchUpStatus: RETIRED } })).toBe(true);
  });

  it('returns falsy for pending matchUp', () => {
    expect(checkMatchUpIsComplete({ matchUp: { matchUpStatus: undefined } })).toBeFalsy();
  });
});

// ----------------------------------------------------------------
// Participant Governor
// ----------------------------------------------------------------
describe('getScaleValues', () => {
  it('returns empty scales when participant has no timeItems', () => {
    let result: any = getScaleValues({ participant: { participantId: 'p1' } });
    expect(result.success).toBe(true);
    expect(result.ratings).toEqual({});
    expect(result.rankings).toEqual({});
    expect(result.seedings).toEqual({});
  });

  it('extracts rating scale values from participant timeItems', () => {
    const participant = {
      participantId: 'p1',
      timeItems: [
        {
          itemType: `${SCALE}.${RATING}.${SINGLES_EVENT}.WTN`,
          itemValue: 35.5,
          itemDate: '2026-01-01',
        },
      ],
    };

    let result: any = getScaleValues({ participant });
    expect(result.success).toBe(true);
    expect(result.ratings).toBeDefined();
    expect(result.ratings[SINGLES_EVENT]).toBeDefined();
    expect(result.ratings[SINGLES_EVENT].length).toBeGreaterThan(0);
    expect(result.ratings[SINGLES_EVENT][0].scaleValue).toBe(35.5);
    expect(result.ratings[SINGLES_EVENT][0].scaleName).toBe('WTN');
  });
});

// ----------------------------------------------------------------
// Sanctioning Governor
// ----------------------------------------------------------------
describe('querySanctioningRecord', () => {
  it('returns error when sanctioningRecord is missing', () => {
    let result: any = querySanctioningRecord({});
    expect(result.error).toBe(MISSING_SANCTIONING_RECORD);
  });

  it('returns a deep copy of the sanctioning record', () => {
    const sanctioningRecord = {
      sanctioningBody: 'ITF',
      status: 'DRAFT',
      proposal: { tournamentName: 'Test Open' },
    };

    let result: any = querySanctioningRecord({ sanctioningRecord } as any);
    expect(result.success).toBe(true);
    expect(result.sanctioningRecord).toBeDefined();
    expect(result.sanctioningRecord.sanctioningBody).toBe('ITF');
    // Verify it's a deep copy (not the same reference)
    expect(result.sanctioningRecord).not.toBe(sanctioningRecord);
  });
});
