import { calculatePressureRatings } from '@Query/matchUps/roundRobinTally/calculatePressureRatings';
import { getParticipantIdFinishingPositions } from '@Query/drawDefinition/finishingPositions';
import { getSourceDrawPositionRanges } from '@Query/matchUps/getSourceDrawPositionRanges';
import { countSets, countGames } from '@Query/matchUps/roundRobinTally/scoreCounters';
import { generateOutcome } from '@Assemblies/generators/mocks/generateOutcome';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and fixtures
import { DEFAULTED, RETIRED, WALKOVER, SUSPENDED, INCOMPLETE } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SINGLES } from '@Constants/matchUpTypes';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
} from '@Constants/drawDefinitionConstants';

// ============================================================================
// 1. setTournamentDates — uncovered lines 54-55 (endDate < startDate),
//    85-86 (event.startDate > endDate), 91 (event.endDate < startDate),
//    108-116 (activeDates removal with scheduled matchUps)
// ============================================================================
describe('setTournamentDates uncovered branches', () => {
  it('returns INVALID_VALUES when endDate is before startDate', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    // Line 54: endDate < startDate
    let result: any = tournamentEngine.setTournamentDates({
      startDate: '2025-06-15',
      endDate: '2025-06-10',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('coerces event dates when tournament dates shrink past event dates', () => {
    const startDate = '2025-06-01';
    const endDate = '2025-06-30';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      tournamentAttributes: { startDate, endDate },
    });

    // Manually set event dates that will be outside the new range
    const event = tournamentRecord.events[0];
    event.startDate = '2025-06-25';
    event.endDate = '2025-06-28';

    tournamentEngine.setState(tournamentRecord);

    // Shrink tournament endDate so event.startDate > new endDate => line 85-86
    let result: any = tournamentEngine.setTournamentDates({
      endDate: '2025-06-20',
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord: updated } = tournamentEngine.getTournament();
    const updatedEvent = updated.events[0];
    expect(new Date(updatedEvent.startDate).getTime()).toBeLessThanOrEqual(new Date('2025-06-20').getTime());
  });

  it('coerces event.endDate when tournament startDate moves past event.endDate', () => {
    const startDate = '2025-06-01';
    const endDate = '2025-06-30';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      tournamentAttributes: { startDate, endDate },
    });

    // Set event dates so event.endDate < new startDate => line 90-91
    const event = tournamentRecord.events[0];
    event.startDate = '2025-06-02';
    event.endDate = '2025-06-05';

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setTournamentDates({
      startDate: '2025-06-10',
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord: updated } = tournamentEngine.getTournament();
    const updatedEvent = updated.events[0];
    expect(new Date(updatedEvent.endDate).getTime()).toBeGreaterThanOrEqual(new Date('2025-06-10').getTime());
  });

  it('handles activeDates removal with previously set activeDates', () => {
    const startDate = '2025-06-01';
    const endDate = '2025-06-10';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      tournamentAttributes: { startDate, endDate },
    });

    // Set activeDates on the record and use setState to load it
    tournamentRecord.activeDates = ['2025-06-01', '2025-06-02', '2025-06-03'];
    tournamentEngine.setState(tournamentRecord);

    // Remove one activeDate — exercises lines 105-126 (removedDates path)
    // The activeDates must be within [startDate, endDate]
    let result: any = tournamentEngine.setTournamentDates({
      activeDates: ['2025-06-01', '2025-06-03'],
      startDate: '2025-06-01',
      endDate: '2025-06-10',
    });
    expect(result.success).toEqual(true);
  });

  it('returns datesAdded and datesRemoved when dates change', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { startDate: '2025-06-01', endDate: '2025-06-05' },
    });
    tournamentEngine.setState(tournamentRecord);

    // Extend the end date — this should produce datesAdded
    let result: any = tournamentEngine.setTournamentDates({
      startDate: '2025-06-01',
      endDate: '2025-06-10',
    });
    expect(result.success).toEqual(true);
    expect(result.datesAdded).toBeDefined();
    expect(result.datesRemoved).toBeDefined();
  });
});

// ============================================================================
// 2. generateOutcome — uncovered lines 176-178 (aggregate unbounded adjustment),
//    246 (timed incomplete with completed status), 277 (outs incomplete with completed status),
//    394-399 (adjustAggregateBounded increment loop)
// ============================================================================
describe('generateOutcome uncovered branches', () => {
  it('generates outcomes with SUSPENDED matchUpStatus in profile', () => {
    // Exercising line 112 with SUSPENDED status
    let foundSuspended = false;
    for (let i = 0; i < 100; i++) {
      let result: any = generateOutcome({
        matchUpStatusProfile: { [SUSPENDED]: 100 },
        matchUpFormat: FORMAT_STANDARD,
      });
      expect(result.outcome).toBeDefined();
      if (result.outcome.matchUpStatus === SUSPENDED) {
        expect(result.outcome.score).toBeDefined();
        foundSuspended = true;
        break;
      }
    }
    expect(foundSuspended).toBe(true);
  });

  it('generates outcomes with INCOMPLETE matchUpStatus in profile', () => {
    let foundIncomplete = false;
    for (let i = 0; i < 100; i++) {
      let result: any = generateOutcome({
        matchUpStatusProfile: { [INCOMPLETE]: 100 },
        matchUpFormat: FORMAT_STANDARD,
      });
      expect(result.outcome).toBeDefined();
      if (result.outcome.matchUpStatus === INCOMPLETE) {
        expect(result.outcome.score).toBeDefined();
        foundIncomplete = true;
        break;
      }
    }
    expect(foundIncomplete).toBe(true);
  });

  it('generates outcomes with outs-based format to cover outs incomplete path', () => {
    // Outs-based format with RETIRED status exercises incomplete at outs branch (lines 273-280)
    let foundRetired = false;
    for (let i = 0; i < 100; i++) {
      let result: any = generateOutcome({
        matchUpStatusProfile: { [RETIRED]: 100 },
        matchUpFormat: 'SET1-S:O3',
      });
      expect(result.outcome).toBeDefined();
      if (result.outcome.matchUpStatus === RETIRED) {
        expect(result.outcome.winningSide).toBeDefined();
        foundRetired = true;
        break;
      }
    }
    expect(foundRetired).toBe(true);
  });

  it('generates outcomes with aggregate outs format and forced winningSide', () => {
    // Aggregate outs format with winningSide forced
    // Exercises aggregate scoring path + adjustment branches (lines 155-188)
    for (let i = 0; i < 30; i++) {
      let result: any = generateOutcome({
        matchUpFormat: 'SET3XA-S:O3',
        winningSide: 1,
      });
      if (result.error) continue;
      expect(result.outcome).toBeDefined();
      if (result.outcome.winningSide) {
        expect(result.outcome.winningSide).toEqual(1);
      }
    }
  });

  it('generates outcomes with aggregate outs format without forced winningSide', () => {
    // Exercises aggregate scoring path where winningSide is determined by totals
    for (let i = 0; i < 30; i++) {
      let result: any = generateOutcome({
        matchUpFormat: 'SET3XA-S:O3',
      });
      if (result.error) continue;
      expect(result.outcome).toBeDefined();
    }
  });

  it('exercises adjustAggregateBounded with outs-based aggregate and winningSide 2', () => {
    // Outs-based aggregate: SET3XA-S:O3 — maxSetScore = outs * 3 = 9
    // With winningSide = 2 to force the wrong-side-leads branch and bounded adjustment
    for (let i = 0; i < 50; i++) {
      let result: any = generateOutcome({
        matchUpFormat: 'SET3XA-S:O3',
        winningSide: 2,
      });
      if (result.error) continue;
      expect(result.outcome).toBeDefined();
    }
  });

  it('generates outcomes with timed format and DEFAULTED with score', () => {
    // Timed format with DEFAULTED to exercise timed incomplete path (lines 242-250)
    for (let i = 0; i < 50; i++) {
      let result: any = generateOutcome({
        matchUpStatusProfile: { [DEFAULTED]: 100 },
        matchUpFormat: 'SET1-S:T20',
        defaultWithScorePercent: 100,
      });
      expect(result.outcome).toBeDefined();
    }
  });
});

// ============================================================================
// 3. calculatePressureRatings — uncovered lines 16-26
//    (the main body when both sides have SINGLES ratings)
// ============================================================================
describe('calculatePressureRatings with actual ratings', () => {
  it('calculates pressure ratings when both sides have WTN SINGLES ratings', () => {
    // Use WTN ratings so getConvertedRating returns { convertedRating: ... }
    // (ELO short-circuits and returns the raw object without convertedRating key)
    const participantResults: any = {
      p1: { pressureScores: [], ratingVariation: [] },
      p2: { pressureScores: [], ratingVariation: [] },
    };

    const sides = [
      {
        sideNumber: 1,
        participantId: 'p1',
        participant: {
          ratings: {
            [SINGLES]: [{ scaleName: 'WTN', scaleValue: { wtnRating: 20 } }],
          },
        },
      },
      {
        sideNumber: 2,
        participantId: 'p2',
        participant: {
          ratings: {
            [SINGLES]: [{ scaleName: 'WTN', scaleValue: { wtnRating: 30 } }],
          },
        },
      },
    ];

    const score = {
      sets: [
        { side1Score: 6, side2Score: 3 },
        { side1Score: 6, side2Score: 4 },
      ],
    };

    // This should enter the if block at line 15 and execute lines 16-26
    calculatePressureRatings({ participantResults, sides, score });

    // Verify pressure scores were pushed
    expect(participantResults.p1.pressureScores.length).toBeGreaterThan(0);
    expect(participantResults.p2.pressureScores.length).toBeGreaterThan(0);
    expect(participantResults.p1.ratingVariation.length).toBeGreaterThan(0);
    expect(participantResults.p2.ratingVariation.length).toBeGreaterThan(0);
  });

  it('calculates pressure with large rating gap using UTR ratings', () => {
    const participantResults: any = {
      p1: { pressureScores: [], ratingVariation: [] },
      p2: { pressureScores: [], ratingVariation: [] },
    };

    const sides = [
      {
        sideNumber: 1,
        participantId: 'p1',
        participant: {
          ratings: {
            [SINGLES]: [{ scaleName: 'UTR', scaleValue: { utrRating: 14 } }],
          },
        },
      },
      {
        sideNumber: 2,
        participantId: 'p2',
        participant: {
          ratings: {
            [SINGLES]: [{ scaleName: 'UTR', scaleValue: { utrRating: 6 } }],
          },
        },
      },
    ];

    const score = {
      sets: [
        { side1Score: 6, side2Score: 1 },
        { side1Score: 6, side2Score: 0 },
      ],
    };

    calculatePressureRatings({ participantResults, sides, score });
    expect(participantResults.p1.pressureScores.length).toEqual(1);
    expect(participantResults.p2.pressureScores.length).toEqual(1);
    expect(Math.abs(participantResults.p1.ratingVariation[0])).toBeGreaterThan(0);
    expect(Math.abs(participantResults.p2.ratingVariation[0])).toBeGreaterThan(0);
  });
});

// ============================================================================
// 4. scoreCounters — uncovered lines 116-121 (getComplement function in
//    RETIRED countGames path) and lines 135-138 (loserLeadSet adjustment)
// ============================================================================
describe('scoreCounters uncovered branches', () => {
  it('countGames with RETIRED status exercises getComplement and loserLeadSet branches', () => {
    // Loser (side 2) led in incomplete set before retirement
    const score = {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 5 }, // incomplete set - loser leads
      ],
    };

    let result: any = countGames({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: RETIRED,
      winningSide: 1,
      score,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[1]).toBeGreaterThanOrEqual(0);
  });

  it('countGames RETIRED with loser having setsToWin triggers complement logic', () => {
    // In best-of-3, setsToWin = 2. Force the loserLeadSet > setsTally branch
    const score = {
      sets: [
        { setNumber: 1, side1Score: 4, side2Score: 6, winningSide: 2 },
        { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 3, side1Score: 2, side2Score: 4 }, // incomplete - loser leads again
      ],
    };

    let result: any = countGames({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: RETIRED,
      winningSide: 1,
      score,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBeGreaterThanOrEqual(0);
  });

  it('countGames RETIRED with gamesCreditForRetirements policy', () => {
    const score = {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 2, side2Score: 3 }, // incomplete set
      ],
    };

    let result: any = countGames({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: RETIRED,
      tallyPolicy: { gamesCreditForRetirements: true },
      winningSide: 1,
      score,
    });
    expect(Array.isArray(result)).toBe(true);
    // With gamesCreditForRetirements, winner should get credited
    expect(result[0]).toBeGreaterThanOrEqual(6);
  });

  it('countSets with WALKOVER and setsCreditForWalkovers', () => {
    let result: any = countSets({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: WALKOVER,
      tallyPolicy: { setsCreditForWalkovers: true },
      winningSide: 1,
      score: { sets: [] },
    });
    expect(result[0]).toEqual(2); // setsToWin for best of 3
    expect(result[1]).toEqual(0);
  });

  it('countSets with DEFAULTED and setsCreditForDefaults', () => {
    let result: any = countSets({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: DEFAULTED,
      tallyPolicy: { setsCreditForDefaults: true },
      winningSide: 2,
      score: { sets: [] },
    });
    expect(result[0]).toEqual(0);
    expect(result[1]).toEqual(2);
  });

  it('countGames with WALKOVER and gamesCreditForWalkovers', () => {
    let result: any = countGames({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: WALKOVER,
      tallyPolicy: { gamesCreditForWalkovers: true },
      winningSide: 1,
      score: { sets: [] },
    });
    expect(result[0]).toEqual(12); // setsToWin * gamesForSet = 2 * 6
    expect(result[1]).toEqual(0);
  });

  it('countGames with DEFAULTED and gamesCreditForDefaults', () => {
    let result: any = countGames({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: DEFAULTED,
      tallyPolicy: { gamesCreditForDefaults: true },
      winningSide: 2,
      score: { sets: [] },
    });
    expect(result[0]).toEqual(0);
    expect(result[1]).toEqual(12);
  });

  it('countSets RETIRED where loser has setsToWin so last set is subtracted', () => {
    const score = {
      sets: [
        { setNumber: 1, side1Score: 4, side2Score: 6, winningSide: 2 },
        { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
        { setNumber: 3, side1Score: 6, side2Score: 4, winningSide: 2 },
      ],
    };

    let result: any = countSets({
      matchUpFormat: FORMAT_STANDARD,
      matchUpStatus: RETIRED,
      winningSide: 1,
      score,
    });
    // Side 2 (loser) had 2 sets won but last is subtracted since count == setsToWin
    expect(result[1]).toEqual(1);
  });
});

// ============================================================================
// 5. getSourceDrawPositionRanges — uncovered lines 90-99
//    (positionInterleave branch)
// ============================================================================
describe('getSourceDrawPositionRanges additional coverage', () => {
  it('works with FMLC draw getting consolation source ranges', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const consolationStructure = drawDefinition.structures.find((s: any) => s.stage === 'CONSOLATION');
    expect(consolationStructure).toBeDefined();

    const matchUpsMap = tournamentEngine.getMatchUpsMap({ drawId });

    let result: any = getSourceDrawPositionRanges({
      structureId: consolationStructure.structureId,
      drawDefinition,
      matchUpsMap,
    });
    expect(result.sourceDrawPositionRanges).toBeDefined();
    expect(Object.keys(result.sourceDrawPositionRanges).length).toBeGreaterThan(0);
  });

  it('returns error for non-consolation structure', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === 'MAIN');
    const matchUpsMap = tournamentEngine.getMatchUpsMap({ drawId });

    let result: any = getSourceDrawPositionRanges({
      structureId: mainStructure.structureId,
      drawDefinition,
      matchUpsMap,
    });
    expect(result.error).toBeDefined();
  });

  it('handles larger draw with multiple feed rounds', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const consolationStructure = drawDefinition.structures.find((s: any) => s.stage === 'CONSOLATION');
    const matchUpsMap = tournamentEngine.getMatchUpsMap({ drawId });

    let result: any = getSourceDrawPositionRanges({
      structureId: consolationStructure.structureId,
      drawDefinition,
      matchUpsMap,
    });
    expect(result.sourceDrawPositionRanges).toBeDefined();
    expect(Object.keys(result.sourceDrawPositionRanges).length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// 6. finishingPositions — uncovered lines 122 (playoffStructure lookup),
//    125 (getDevContext), 141-156 (containerFinishingPosition with playoff)
// ============================================================================
describe('finishingPositions uncovered branches', () => {
  it('RR without playoff gets container-based finishing positions', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    let result: any = tournamentEngine.getParticipantIdFinishingPositions({ drawId });
    expect(result).toBeDefined();
    const entries = Object.keys(result);
    expect(entries.length).toEqual(8);

    entries.forEach((participantId) => {
      const data = result[participantId];
      expect(data.finishingPositionRange).toBeDefined();
      expect(data.relevantMatchUps).toBeDefined();
    });
  });

  it('RR with playoff exercises playoff structure branch', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          structureOptions: {
            groupSize: 4,
            playoffGroups: [{ finishingPositions: [1, 2], structureName: 'Playoff' }],
          },
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    let result: any = tournamentEngine.getParticipantIdFinishingPositions({ drawId });
    expect(result).toBeDefined();
    const entries = Object.keys(result);
    expect(entries.length).toBeGreaterThanOrEqual(8);
  });

  it('single bracket RR (drawPositionsCount === bracketSize)', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    let result: any = tournamentEngine.getParticipantIdFinishingPositions({ drawId });
    expect(result).toBeDefined();
    const entries = Object.keys(result);
    expect(entries.length).toEqual(4);

    entries.forEach((participantId) => {
      const data = result[participantId];
      expect(data.finishingPositionRange).toBeDefined();
      if (data.finishingPositionRange) {
        expect(data.finishingPositionRange.length).toEqual(2);
      }
    });
  });

  it('handles missing drawDefinition', () => {
    let result: any = getParticipantIdFinishingPositions({
      drawDefinition: undefined as any,
      tournamentRecord: {} as any,
    });
    expect(result.error).toBeDefined();
  });

  it('multi-bracket RR without playoff returns finishing positions', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 12,
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    let result: any = tournamentEngine.getParticipantIdFinishingPositions({ drawId });
    expect(result).toBeDefined();
    const entries = Object.keys(result);
    expect(entries.length).toEqual(12);
  });
});
