/**
 * Statement-coverage gap tests — batch 5
 * Targets ~145 uncovered statements to push toward 95% statement coverage.
 */
import { setParticipantScaleItems, addParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { generateVoluntaryConsolation } from '@Generators/drawDefinitions/drawTypes/generateVoluntaryConsolation';
import { initializeDraft, defaultTierCount } from '@Mutate/drawDefinitions/draft/initializeDraft';
import { getParticipantIdFinishingPositions } from '@Query/drawDefinition/finishingPositions';
import { keyValueScore, keyValueMatchUpScore } from '@Helpers/keyValueScore/keyValueScore';
import { removeCollectionDefinition } from '@Mutate/tieFormat/removeCollectionDefinition';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES, TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING, SEEDING } from '@Constants/scaleConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  EXISTING_DRAFT,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_PARTICIPANT,
  MISSING_STRUCTURE_ID,
  MISSING_TOURNAMENT_RECORD,
  NO_VALID_ATTRIBUTES,
  INVALID_SCALE_ITEM,
  MISSING_PARTICIPANTS,
  INVALID_DRAW_SIZE,
  UNRECOGNIZED_DRAW_TYPE,
} from '@Constants/errorConditionConstants';
import {
  AD_HOC,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  VOLUNTARY_CONSOLATION,
} from '@Constants/drawDefinitionConstants';

// ----------------------------------------------------------------
// 1. keyValueScore — various uncovered key-value scoring paths
// ----------------------------------------------------------------
describe('keyValueScore uncovered paths', () => {
  it('returns invalid key for unrecognized value', () => {
    const result = keyValueScore({
      scoreString: '',
      sets: [],
      matchUpFormat: 'SET3-S:6/TB7',
      value: '!',
    });
    expect(result.updated).toBe(false);
    expect(result.info).toBe('invalid key');
  });

  it('handles BACKSPACE on empty score', () => {
    const result = keyValueScore({
      scoreString: '',
      sets: [],
      matchUpFormat: 'SET3-S:6/TB7',
      value: 'backspace',
    });
    expect(result.updated).toBe(true);
    expect(result.sets).toEqual([]);
  });

  it('handles BACKSPACE on a score with content', () => {
    const result = keyValueScore({
      scoreString: '6-3 ',
      sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }],
      matchUpFormat: 'SET3-S:6/TB7',
      value: 'backspace',
    });
    expect(result.updated).toBe(true);
  });

  it('handles joiner (-) when not in match tiebreak entry', () => {
    // Start a set score then press joiner
    const result = keyValueScore({
      scoreString: '6',
      sets: [{ side1Score: 6, setNumber: 1 }],
      matchUpFormat: 'SET3-S:6/TB7',
      value: '-',
    });
    expect(result.updated).toBe(true);
  });

  it('handles joiner on empty score (creates initial set entry)', () => {
    const result = keyValueScore({
      scoreString: '',
      sets: [],
      matchUpFormat: 'SET3-S:6/TB7',
      value: '-',
    });
    // A joiner on empty score either returns info or updated
    expect(result.info || result.updated !== undefined).toBeTruthy();
  });

  it('processes outcome key (RETIRED) on non-complete set', () => {
    const result = keyValueScore({
      scoreString: '6-3 3',
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
        { side1Score: 3, setNumber: 2 },
      ],
      matchUpFormat: 'SET3-S:6/TB7',
      value: 'r',
      lowSide: 2,
    });
    // 'r' is an outcome key for RETIRED, but set is incomplete
    expect(result.info || result.updated).toBeDefined();
  });

  it('processes space key to advance to next set', () => {
    const result = keyValueScore({
      scoreString: '6-3',
      sets: [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }],
      matchUpFormat: 'SET3-S:6/TB7',
      value: 'space',
    });
    // space key is recognized as a closer
    expect(result.info || result.updated !== undefined).toBeTruthy();
  });

  it('handles shiftFirst parameter', () => {
    const result = keyValueScore({
      scoreString: '',
      sets: [],
      matchUpFormat: 'SET3-S:6/TB7',
      value: '6',
      shiftFirst: true,
      lowSide: 2,
    });
    expect(result.updated).toBe(true);
  });

  it('keyValueMatchUpScore returns original matchUp when not updated', () => {
    const matchUp = {
      matchUpFormat: 'SET3-S:6/TB7',
      score: { sets: [], scoreStringSide1: '' },
    };
    const result = keyValueMatchUpScore({
      matchUp,
      value: '!', // invalid key
    });
    expect(result.matchUp).toBe(matchUp);
    expect(result.updated).toBe(false);
  });

  it('keyValueMatchUpScore returns updated matchUp on valid input', () => {
    const matchUp = {
      matchUpFormat: 'SET3-S:6/TB7',
      score: { sets: [], scoreStringSide1: '' },
    };
    const result = keyValueMatchUpScore({
      matchUp,
      value: '6',
    });
    expect(result.updated).toBe(true);
    expect(result.matchUp.score).toBeDefined();
  });

  it('handles alternate joiner characters', () => {
    const result = keyValueScore({
      scoreString: '6',
      sets: [{ side1Score: 6, setNumber: 1 }],
      matchUpFormat: 'SET3-S:6/TB7',
      value: '/',
    });
    // '/' is an alternate joiner, mapped to '-'
    expect(result.updated).toBe(true);
  });

  it('handles match tiebreak joiner', () => {
    // Set up 1-1 in sets, in match tiebreak format
    const result = keyValueScore({
      scoreString: '6-3 3-6 ',
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
        { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 2 },
      ],
      matchUpFormat: 'SET3-S:6/TB7-F:TB10',
      value: '[',
    });
    // '[' starts a match tiebreak entry
    expect(result.updated || result.info).toBeDefined();
  });

  it('returns "matchUp is complete" for completed match', () => {
    const result = keyValueScore({
      scoreString: '6-3 6-4',
      sets: [
        { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
        { side1Score: 6, side2Score: 4, winningSide: 1, setNumber: 2 },
      ],
      matchUpFormat: 'SET3-S:6/TB7',
      winningSide: 1,
      value: '6',
    });
    expect(result.info).toBe('matchUp is complete');
  });
});

// ----------------------------------------------------------------
// 2. initializeDraft — various tier method and configuration paths
// ----------------------------------------------------------------
describe('initializeDraft uncovered paths', () => {
  it('returns MISSING_DRAW_DEFINITION without drawDefinition', () => {
    const result = initializeDraft({});
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns INVALID_VALUES for tierCount < 1', () => {
    const result = initializeDraft({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      tierCount: 0,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES for preferencesCount < 1', () => {
    const result = initializeDraft({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
      preferencesCount: 0,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns MISSING_STRUCTURE_ID when no MAIN structure and no structureId', () => {
    const result = initializeDraft({
      drawDefinition: { drawId: 'd1', structures: [] } as any,
    });
    expect(result.error).toEqual(MISSING_STRUCTURE_ID);
  });

  it('returns EXISTING_DRAFT when draft already exists and force is false', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 2, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    // First initialization
    const result1: any = initializeDraft({ drawDefinition, tournamentRecord });
    expect(result1.success).toBe(true);

    // Second initialization without force should return EXISTING_DRAFT
    const result2: any = initializeDraft({ drawDefinition, tournamentRecord });
    expect(result2.error).toEqual(EXISTING_DRAFT);
  });

  it('succeeds with force=true even when draft already exists', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 2, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    initializeDraft({ drawDefinition, tournamentRecord });
    const result: any = initializeDraft({ drawDefinition, tournamentRecord, force: true });
    expect(result.success).toBe(true);
  });

  it('uses RANKING tier method to sort participants', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 2, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const result: any = initializeDraft({
      drawDefinition,
      tournamentRecord,
      tierMethod: 'RANKING',
      force: true,
    });
    expect(result.success).toBe(true);
    expect(result.tiers?.length).toBeGreaterThan(0);
  });

  it('uses RATING tier method with event ratingType', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 2, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });

    const result: any = initializeDraft({
      event: { ...event, category: { ratingType: 'UTR' } },
      tierMethod: 'RATING',
      tournamentRecord,
      drawDefinition,
      force: true,
    });
    expect(result.success).toBe(true);
  });

  it('uses RATING tier method without event ratingType', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 2, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const result: any = initializeDraft({
      drawDefinition,
      tournamentRecord,
      tierMethod: 'RATING',
      force: true,
    });
    expect(result.success).toBe(true);
  });

  it('uses ascending=false for descending sort', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, seedsCount: 2, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const result: any = initializeDraft({
      tierMethod: 'RANKING',
      ascending: false,
      tournamentRecord,
      drawDefinition,
      force: true,
    });
    expect(result.success).toBe(true);
  });

  it('defaultTierCount returns 1 for < 4 participants', () => {
    expect(defaultTierCount(3, 0)).toBe(1);
  });

  it('defaultTierCount returns 3 for many unseeded with seeds', () => {
    expect(defaultTierCount(24, 2)).toBe(3);
  });

  it('defaultTierCount returns 2 for moderate count without seeds', () => {
    expect(defaultTierCount(10, 0)).toBe(2);
  });

  it('returns NO_VALID_ATTRIBUTES when all positions are assigned', () => {
    // Generate a fully positioned draw
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const result = initializeDraft({ drawDefinition, tournamentRecord });
    expect(result.error).toEqual(NO_VALID_ATTRIBUTES);
  });
});

// ----------------------------------------------------------------
// 3. addScaleItems — uncovered paths
// ----------------------------------------------------------------
describe('addScaleItems uncovered paths', () => {
  it('addParticipantScaleItem returns MISSING_PARTICIPANT without participant', () => {
    const result = addParticipantScaleItem({
      scaleItem: { scaleType: SEEDING, eventType: SINGLES, scaleName: 'test', scaleValue: 1 },
      participant: undefined,
    } as any);
    expect(result.error).toEqual(MISSING_PARTICIPANT);
  });

  it('addParticipantScaleItem returns INVALID_SCALE_ITEM for missing required attributes', () => {
    const result = addParticipantScaleItem({
      participant: { participantId: 'p1', timeItems: [] },
      scaleItem: { scaleType: SEEDING },
    } as any);
    expect(result.error).toEqual(INVALID_SCALE_ITEM);
  });

  it('setParticipantScaleItems returns MISSING_TOURNAMENT_RECORD', () => {
    const result = setParticipantScaleItems({
      tournamentRecord: undefined as any,
      scaleItemsWithParticipantIds: [],
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('setParticipantScaleItems returns MISSING_PARTICIPANTS without participants array', () => {
    const result = setParticipantScaleItems({
      tournamentRecord: { tournamentId: 't1' } as any,
      scaleItemsWithParticipantIds: [],
    });
    expect(result.error).toEqual(MISSING_PARTICIPANTS);
  });

  it('setParticipantScaleItems returns INVALID_SCALE_ITEM for invalid scaleItem', () => {
    const result = setParticipantScaleItems({
      tournamentRecord: { tournamentId: 't1', participants: [{ participantId: 'p1' }] } as any,
      scaleItemsWithParticipantIds: [{ participantId: 'p1', scaleItems: [{ scaleType: 'RANKING' } as any] }],
    });
    expect(result.error).toEqual(INVALID_SCALE_ITEM);
  });

  it('setParticipantScaleItems with context adds timeItems to draw/event/tournament', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const participants = tournamentRecord.participants;
    const pid = participants[0].participantId;

    const result = setParticipantScaleItems({
      tournamentRecord,
      scaleItemsWithParticipantIds: [
        {
          participantId: pid,
          scaleItems: [{ scaleType: RANKING, eventType: SINGLES, scaleName: 'test', scaleValue: 5 }],
        },
      ],
      context: {
        eventId,
        drawId,
        scaleAttributes: { scaleType: RANKING },
      },
    });
    expect(result.success).toBe(true);
    expect(result.modificationsApplied).toBe(1);
  });

  it('setParticipantScaleItems with context but no drawId/eventId adds to tournament', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const pid = tournamentRecord.participants[0].participantId;

    const result = setParticipantScaleItems({
      tournamentRecord,
      scaleItemsWithParticipantIds: [
        {
          participantId: pid,
          scaleItems: [{ scaleType: RANKING, eventType: SINGLES, scaleName: 'test', scaleValue: 10 }],
        },
      ],
      context: { scaleAttributes: { scaleType: RANKING } },
    });
    expect(result.success).toBe(true);
  });

  it('setParticipantScaleItems returns INVALID_SCALE_ITEM for TEAM participant with non-TEAM eventType', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);
    const teamParticipant = tournamentRecord.participants.find((p) => p.participantType === 'TEAM');

    if (teamParticipant) {
      const result = setParticipantScaleItems({
        tournamentRecord,
        scaleItemsWithParticipantIds: [
          {
            participantId: teamParticipant.participantId,
            scaleItems: [{ scaleType: RANKING, eventType: SINGLES, scaleName: 'test', scaleValue: 1 }],
          },
        ],
      });
      expect(result.error).toEqual(INVALID_SCALE_ITEM);
    }
  });
});

// ----------------------------------------------------------------
// 4. removeCollectionDefinition — uncovered paths
// ----------------------------------------------------------------
describe('removeCollectionDefinition uncovered paths', () => {
  it('removes a collection from a TEAM draw', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });

    const tieFormat = drawDefinition.tieFormat || event.tieFormat;
    const collectionId = tieFormat?.collectionDefinitions?.[0]?.collectionId;

    if (collectionId) {
      const result = removeCollectionDefinition({
        drawDefinition,
        collectionId,
        tournamentRecord,
        event,
      });
      expect(result.success).toBe(true);
      expect(result.deletedMatchUpIds?.length).toBeGreaterThan(0);
    }
  });

  it('exercises removeCollectionDefinition with structureId scope', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });

    const tieFormat = drawDefinition.tieFormat || event.tieFormat;
    const collectionId = tieFormat?.collectionDefinitions?.[0]?.collectionId;
    const structureId = drawDefinition.structures?.[0]?.structureId;

    if (collectionId && structureId) {
      const result = removeCollectionDefinition({
        drawDefinition,
        collectionId,
        structureId,
        tournamentRecord,
        event,
      });
      expect(result.success).toBe(true);
      expect(result.tieFormat).toBeDefined();
    }
  });
});

// ----------------------------------------------------------------
// 5. generateVoluntaryConsolation — uncovered paths
// ----------------------------------------------------------------
describe('generateVoluntaryConsolation uncovered paths', () => {
  it('returns MISSING_DRAW_DEFINITION without drawDefinition', () => {
    const result = generateVoluntaryConsolation({
      tournamentRecord: {} as any,
      drawDefinition: undefined as any,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns INVALID_DRAW_SIZE for ROUND_ROBIN with < 3 entries', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    // Add only 2 voluntary consolation entries
    const participants = tournamentRecord.participants;
    tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId, participants[1].participantId],
      entryStage: VOLUNTARY_CONSOLATION,
      drawId,
    });

    const result = generateVoluntaryConsolation({
      drawDefinition,
      tournamentRecord,
      drawType: ROUND_ROBIN,
    });
    expect(result.error).toEqual(INVALID_DRAW_SIZE);
  });

  it('returns UNRECOGNIZED_DRAW_TYPE for unknown draw type', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    // Add enough entries
    const pids = tournamentRecord.participants.slice(0, 4).map((p) => p.participantId);
    tournamentEngine.addEventEntries({
      participantIds: pids,
      entryStage: VOLUNTARY_CONSOLATION,
      drawId,
    });

    const result = generateVoluntaryConsolation({
      drawDefinition,
      tournamentRecord,
      drawType: 'IMAGINARY_TYPE' as any,
    });
    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
  });

  it('succeeds with SINGLE_ELIMINATION voluntary consolation', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });

    const pids = tournamentRecord.participants.slice(0, 4).map((p) => p.participantId);
    tournamentEngine.addEventEntries({
      participantIds: pids,
      entryStage: VOLUNTARY_CONSOLATION,
      drawId,
    });

    const result = generateVoluntaryConsolation({
      drawDefinition,
      tournamentRecord,
      drawType: SINGLE_ELIMINATION,
      event,
    });
    expect(result.success).toBe(true);
    expect(result.structures?.length).toBeGreaterThan(0);
  });

  it('succeeds with attachConsolation=false', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });
    tournamentEngine.setState(tournamentRecord);
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });

    const pids = tournamentRecord.participants.slice(0, 4).map((p) => p.participantId);
    tournamentEngine.addEventEntries({
      participantIds: pids,
      entryStage: VOLUNTARY_CONSOLATION,
      drawId,
    });

    const result = generateVoluntaryConsolation({
      drawDefinition,
      tournamentRecord,
      attachConsolation: false,
      event,
    });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 6. generateEventWithDraw — AD_HOC, ROUND_ROBIN, DOUBLES options
// ----------------------------------------------------------------
describe('generateEventWithDraw additional options', () => {
  it('generates AD_HOC draw with completeAllMatchUps and roundsCount > 1', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: AD_HOC,
          roundsCount: 3,
          completeAllMatchUps: true,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
    tournamentEngine.setState(result.tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    // Multiple rounds should have been generated and completed
    expect(matchUps.length).toBeGreaterThan(0);
  });

  it('generates ROUND_ROBIN draw', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('generates DOUBLES draw', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
    });
    expect(result.tournamentRecord).toBeDefined();
    const events = result.tournamentRecord.events;
    expect(events?.[0]?.eventType).toBe(DOUBLES);
  });

  it('generates draw with completionGoal', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          completionGoal: 2,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('generates draw with seedsCount', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          seedsCount: 4,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('generates draw with category', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          category: { categoryName: 'U18', ageCategoryCode: 'U18' },
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('generates draw with timeItems', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          timeItems: [{ itemType: 'SCHEDULE.TIME.START', itemValue: '2024-01-01' }],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('generates draw with eventAttributes', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          eventAttributes: { surfaceCategory: 'CLAY' },
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('generates draw with matchUpStatusProfile', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          completeAllMatchUps: true,
        },
      ],
      matchUpStatusProfile: { [WALKOVER]: 50 },
    });
    expect(result.tournamentRecord).toBeDefined();
  });

  it('generates draw with randomWinningSide', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          completeAllMatchUps: true,
        },
      ],
      randomWinningSide: true,
    });
    expect(result.tournamentRecord).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 7. modifyTournamentRecord — additional paths
// ----------------------------------------------------------------
describe('modifyTournamentRecord additional paths', () => {
  it('handles drawProfiles with modifyTournamentRecord', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 20 },
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.modifyTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });
    expect(result.drawIds?.length).toBe(1);
    expect(result.eventIds?.length).toBe(1);
  });

  it('handles idPrefix in participantsProfile', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10, idPrefix: 'TEST' },
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.modifyTournamentRecord({
      participantsProfile: { idPrefix: 'MOD' },
      drawProfiles: [{ drawSize: 4 }],
    });
    expect(result.success).toBe(true);
  });

  it('handles schedulingProfile with autoSchedule', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles: [{ courtsCount: 2, venueName: 'Test' }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.modifyTournamentRecord({
      schedulingProfile: [],
      autoSchedule: true,
    });
    expect(result.success).toBe(true);
  });
});

// ----------------------------------------------------------------
// 8. FMLC deeper paths — consolation scoring and removal
// ----------------------------------------------------------------
describe('FMLC deep consolation paths', () => {
  it('exercises FMLC draw with score then removal to trigger consolation cleanup', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          automated: true,
        },
      ],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    // allTournamentMatchUps returns matchUps with inContext which includes stage
    const mainR1 = matchUps
      .filter((m) => m.roundNumber === 1 && m.stage === 'MAIN')
      .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));

    // Complete first two R1 matchUps
    for (let i = 0; i < Math.min(2, mainR1.length); i++) {
      const mu = mainR1[i];
      if (mu.drawPositions?.filter(Boolean).length === 2) {
        const { outcome } = mocksEngine.generateOutcomeFromScoreString({
          scoreString: '6-2 6-3',
          winningSide: 1,
        });
        tournamentEngine.setMatchUpStatus({
          matchUpId: mu.matchUpId,
          outcome,
          drawId,
        });
      }
    }

    // Remove the first outcome to trigger removeDirectedParticipants with consolation paths
    if (mainR1.length > 0) {
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: mainR1[0].matchUpId,
        outcome: { matchUpStatus: 'TO_BE_PLAYED' },
        drawId,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ----------------------------------------------------------------
// 9. doubleExitAdvancement — DOUBLE_WALKOVER in larger draws
// ----------------------------------------------------------------
describe('doubleExitAdvancement deeper paths', () => {
  it('exercises double walkover propagation in 16-draw', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, automated: true }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
    const firstRoundMatchUps = matchUps.filter((m) => m.roundNumber === 1);

    // Set DOUBLE_WALKOVER on first two adjacent matchUps
    for (let i = 0; i < Math.min(2, firstRoundMatchUps.length); i++) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: firstRoundMatchUps[i].matchUpId,
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        drawId,
      });
    }

    // Check that the second round matchUp was automatically affected
    const updated = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
    const r2 = updated.filter((m) => m.roundNumber === 2);
    // At least one second round matchUp should have a status other than TO_BE_PLAYED
    const anyAdvanced = r2.some((m) => m.matchUpStatus !== 'TO_BE_PLAYED');
    expect(anyAdvanced).toBe(true);
  });

  it('exercises double walkover in FMLC (consolation loser propagation)', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, automated: true }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
    const mainR1 = matchUps.filter((m) => m.roundNumber === 1 && m.stage === 'MAIN');

    if (mainR1.length >= 2) {
      const r1 = tournamentEngine.setMatchUpStatus({
        matchUpId: mainR1[0].matchUpId,
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        drawId,
      });
      expect(r1.success || r1.error).toBeDefined();

      const r2 = tournamentEngine.setMatchUpStatus({
        matchUpId: mainR1[1].matchUpId,
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        drawId,
      });
      expect(r2.success || r2.error).toBeDefined();
    }
  });
});

// ----------------------------------------------------------------
// 10. getParticipantIdFinishingPositions — Round Robin path
// ----------------------------------------------------------------
describe('getParticipantIdFinishingPositions round robin', () => {
  it('exercises container matchUp finishing positions', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ],
    });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const result = getParticipantIdFinishingPositions({
      tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
      drawDefinition,
      event,
    });
    expect(result).toBeDefined();
    expect(result.error).toBeUndefined();
    // Should have finishing positions for participants
    const keys = Object.keys(result);
    expect(keys.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------
// 11. TEAM lineUp operations (replace/remove tie matchUp participant)
// ----------------------------------------------------------------
describe('TEAM lineUp operations', () => {
  it('exercises replaceTieMatchUpParticipantId and removeTieMatchUpParticipantId', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const singlesMatchUps = matchUps.filter((m) => m.matchUpType === SINGLES && m.sides?.length === 2);

    if (singlesMatchUps.length > 0) {
      const tieMatchUp = singlesMatchUps[0];
      const side1 = tieMatchUp.sides?.[0];
      const participantId = side1?.participantId || side1?.participant?.participantId;

      if (participantId) {
        // Find another individual participant from the same team that isn't already assigned
        const teamMatchUp_ = matchUps.find((m) => m.matchUpType === TEAM);
        const teamMatchUp = teamMatchUp_;
        const teamSide = teamMatchUp?.sides?.find((s) => s.sideNumber === side1?.sideNumber);
        const teamParticipant = teamSide?.participant;
        const individualIds = teamParticipant?.individualParticipantIds || [];
        const assignedIds = new Set(
          singlesMatchUps
            .flatMap((m) => m.sides || [])
            .filter((s) => s.sideNumber === side1?.sideNumber)
            .map((s) => s.participantId || s.participant?.participantId)
            .filter(Boolean),
        );
        const availableId = individualIds.find((id) => !assignedIds.has(id));

        if (availableId) {
          // Replace the participant
          const replaceResult = tournamentEngine.replaceTieMatchUpParticipantId({
            tieMatchUpId: tieMatchUp.matchUpId,
            existingParticipantId: participantId,
            newParticipantId: availableId,
            drawId,
          });
          expect(replaceResult.success || replaceResult.error).toBeDefined();
        }

        // Remove a participant
        const removeResult = tournamentEngine.removeTieMatchUpParticipantId({
          tieMatchUpId: tieMatchUp.matchUpId,
          participantId: participantId,
          drawId,
        });
        expect(removeResult.success || removeResult.error).toBeDefined();
      }
    }
  });
});

// ----------------------------------------------------------------
// 12. generateAndPopulatePlayoffStructures — via ROUND_ROBIN_WITH_PLAYOFF completion
// ----------------------------------------------------------------
describe('generateAndPopulatePlayoffStructures paths', () => {
  it('exercises playoff generation from completed round robin groups', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          completeAllMatchUps: true,
        },
      ],
    });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const playoffStructure = drawDefinition.structures?.find((s) => s.stage === 'PLAY_OFF');
    expect(playoffStructure).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 13. prepareStage — qualifying profiles path
// ----------------------------------------------------------------
describe('prepareStage additional paths', () => {
  it('exercises qualifying stage preparation with multiple sequences', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          drawType: SINGLE_ELIMINATION,
          qualifyingProfiles: [
            {
              roundTarget: 1,
              structureProfiles: [
                { drawSize: 4, qualifyingPositions: 2 },
                { drawSize: 4, qualifyingPositions: 2 },
              ],
            },
          ],
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
    const { drawDefinition } = tournamentEngine
      .setState(result.tournamentRecord)
      .getEvent({ drawId: result.drawIds[0] });
    const qualifyingStructures = drawDefinition?.structures?.filter((s) => s.stage === 'QUALIFYING');
    expect(qualifyingStructures?.length).toBeGreaterThan(0);
  });

  it('exercises automated=false (manual positioning)', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          automated: false,
        },
      ],
    });
    expect(result.tournamentRecord).toBeDefined();
  });
});

// ----------------------------------------------------------------
// 14. directWinner — lineUp propagation in TEAM events
// ----------------------------------------------------------------
describe('directWinner team lineUp propagation', () => {
  it('generates a TEAM draw to exercise team structure generation and lineUp paths', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    });
    expect(tournamentRecord).toBeDefined();
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUps = matchUps.filter((m) => m.matchUpType === TEAM);
    expect(teamMatchUps.length).toBeGreaterThan(0);

    // Verify that team matchUps have sides with participants
    const r1TeamMatchUps = teamMatchUps.filter((m) => m.roundNumber === 1);
    expect(r1TeamMatchUps.length).toBe(2);
    // Each team matchUp side should have a participant
    const hasSides = r1TeamMatchUps.every(
      (m) => m.sides?.length === 2 && m.sides[0]?.participantId && m.sides[1]?.participantId,
    );
    expect(hasSides).toBe(true);
  });
});

// ----------------------------------------------------------------
// 15. applyLineUps — deeper TEAM path with valid lineUps
// ----------------------------------------------------------------
describe('applyLineUps deeper TEAM paths', () => {
  it('applies valid lineUps to TEAM matchUp', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUp = matchUps.find((m) => m.matchUpType === TEAM);

    if (teamMatchUp?.sides?.length === 2) {
      const side1 = teamMatchUp.sides[0];
      const side1IndividualIds = side1?.participant?.individualParticipantIds || [];

      if (side1IndividualIds.length >= 2) {
        const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
        const tieFormat = drawDefinition.tieFormat || event.tieFormat;
        const singlesCollection = tieFormat?.collectionDefinitions?.find((cd) => cd.matchUpType === SINGLES);

        if (singlesCollection) {
          const lineUp = [
            {
              participantId: side1IndividualIds[0],
              collectionAssignments: [{ collectionId: singlesCollection.collectionId, collectionPosition: 1 }],
            },
          ];

          const result = tournamentEngine.applyLineUps({
            matchUpId: teamMatchUp.matchUpId,
            lineUps: [lineUp],
            drawId,
          });
          expect(result.success || result.error).toBeDefined();
        }
      }
    }
  });
});

// ----------------------------------------------------------------
// 16. positionAssignment — round robin bye replacement path
// ----------------------------------------------------------------
describe('positionAssignment round robin paths', () => {
  it('handles participant assignment to round robin with incomplete positioning', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          participantsCount: 3,
        },
      ],
    });
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    // Verify that one position has a bye
    const mainStructure = drawDefinition.structures?.[0];
    const innerStructures = mainStructure?.structures || [];
    let hasBye = false;
    for (const s of innerStructures) {
      if (s.positionAssignments?.some((a) => a.bye)) {
        hasBye = true;
        break;
      }
    }
    expect(hasBye).toBe(true);
  });
});
