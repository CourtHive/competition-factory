/**
 * INTENNSE Showdown: TEAM event with timed collectionDefinition formats.
 *
 * Verifies that completeAllMatchUps generates scores matching each
 * collection's matchUpFormat (SET2XA-S:T10 for singles, SET1A-S:T10
 * for doubles) rather than falling back to the top-level format.
 *
 * Singles: SET2XA-S:T10  → exactly 2 timed sets, aggregate winner
 * Doubles: SET1A-S:T10   → exactly 1 timed set
 */
import { parse } from '@Helpers/matchUpFormatCode/parse';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, it, expect } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';

const SINGLES_FORMAT = 'SET2XA-S:T10';
const DOUBLES_FORMAT = 'SET1A-S:T10';

const intennseCollections = [
  {
    collectionId: 'intennse-ms',
    collectionName: "Men's Singles",
    matchUpType: SINGLES,
    matchUpCount: 2,
    matchUpFormat: SINGLES_FORMAT,
    scoreValue: 1,
    gender: MALE,
    category: { categoryName: 'MS' },
  },
  {
    collectionId: 'intennse-ws',
    collectionName: "Women's Singles",
    matchUpType: SINGLES,
    matchUpCount: 2,
    matchUpFormat: SINGLES_FORMAT,
    scoreValue: 1,
    gender: FEMALE,
    category: { categoryName: 'WS' },
  },
  {
    collectionId: 'intennse-md',
    collectionName: "Men's Doubles",
    matchUpType: DOUBLES,
    matchUpCount: 1,
    matchUpFormat: DOUBLES_FORMAT,
    scoreValue: 1,
    gender: MALE,
    category: { categoryName: 'MD' },
  },
  {
    collectionId: 'intennse-wd',
    collectionName: "Women's Doubles",
    matchUpType: DOUBLES,
    matchUpCount: 1,
    matchUpFormat: DOUBLES_FORMAT,
    scoreValue: 1,
    gender: FEMALE,
    category: { categoryName: 'WD' },
  },
  {
    collectionId: 'intennse-xd',
    collectionName: 'Mixed Doubles',
    matchUpType: DOUBLES,
    matchUpCount: 1,
    matchUpFormat: DOUBLES_FORMAT,
    scoreValue: 1,
    gender: MIXED,
    category: { categoryName: 'XD' },
  },
];

/**
 * Validate that a matchUp's score conforms to the structural expectations
 * of its parsed matchUpFormat.
 */
function validateTimedScore(matchUp) {
  const { matchUpFormat, score, winningSide, matchUpId } = matchUp;
  const parsed = parse(matchUpFormat);
  expect(parsed, `parse failed for ${matchUpFormat} on ${matchUpId}`).toBeDefined();
  if (!parsed) return; // narrow type after assertion

  const { exactly, bestOf, setFormat } = parsed;
  const { sets } = score;

  // Expected set count: `exactly` when defined, otherwise `bestOf`
  // (parse treats SET1A as bestOf:1 since exactly-1 === bestOf-1)
  const expectedSets = exactly ?? bestOf;
  expect(sets.length, `set count for ${matchUpId}`).toBe(expectedSets);

  // Each set must be timed with reasonable point totals
  const { timed, minutes } = setFormat ?? {};
  expect(timed, `setFormat.timed for ${matchUpFormat}`).toBe(true);

  for (const set of sets) {
    expect(typeof set.side1Score, `side1Score type on ${matchUpId} set ${set.setNumber}`).toBe('number');
    expect(typeof set.side2Score, `side2Score type on ${matchUpId} set ${set.setNumber}`).toBe('number');

    // Timed scores are point totals (at ~2.5 ppm, a 10-min set ≈ 25 total points ± variation).
    // Traditional game scores would sum to at most ~14 (7-7). Require > 14 to distinguish.
    const total = set.side1Score + set.side2Score;
    expect(total, `total points on ${matchUpId} set ${set.setNumber}`).toBeGreaterThan(14);

    // Upper bound: generous ceiling at 4× the expected total
    const expectedTotal = minutes * 2.5;
    expect(total, `total points ceiling on ${matchUpId} set ${set.setNumber}`).toBeLessThan(expectedTotal * 4);

    // Timed sets never produce tiebreak scores
    expect(set.side1TiebreakScore).toBeUndefined();
    expect(set.side2TiebreakScore).toBeUndefined();
  }

  // For aggregate formats the winner has the higher total across all sets
  if (parsed.aggregate) {
    const side1Total = sets.reduce((sum, s) => sum + s.side1Score, 0);
    const side2Total = sets.reduce((sum, s) => sum + s.side2Score, 0);
    if (winningSide === 1) {
      expect(side1Total, `aggregate winner side1 on ${matchUpId}`).toBeGreaterThan(side2Total);
    } else {
      expect(side2Total, `aggregate winner side2 on ${matchUpId}`).toBeGreaterThan(side1Total);
    }
  }
}

describe('INTENNSE TEAM timed format completion', () => {
  it('completed tieMatchUps have scores matching their collection-defined timed format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0, idPrefix: 'in-fmt' },
      tournamentName: 'INTENNSE Format Validation',
      completeAllMatchUps: true,
      drawProfiles: [
        {
          eventType: TEAM,
          drawType: SINGLE_ELIMINATION,
          drawSize: 2,
          teamNames: ['The Authentics', 'Cauldron'],
          teamGenders: { MALE: 3, FEMALE: 3 },
          tieFormat: {
            tieFormatName: 'INTENNSE',
            winCriteria: { aggregateValue: true },
            collectionDefinitions: intennseCollections,
          },
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const tieMatchUps = matchUps.filter((m) => m.collectionId);

    // All 7 collection matchUps must exist
    expect(tieMatchUps.length).toBe(7);

    // Every tieMatchUp must carry the format from its collection, not a fallback
    const singlesMatchUps = tieMatchUps.filter((m) => m.matchUpFormat === SINGLES_FORMAT);
    const doublesMatchUps = tieMatchUps.filter((m) => m.matchUpFormat === DOUBLES_FORMAT);
    expect(singlesMatchUps.length).toBe(4);
    expect(doublesMatchUps.length).toBe(3);

    // Only matchUps that received participants can be completed
    const completedTieMatchUps = tieMatchUps.filter((m) => m.winningSide);
    expect(completedTieMatchUps.length).toBeGreaterThanOrEqual(1);

    // --- core assertion: every completed score matches the timed format ---
    for (const m of completedTieMatchUps) {
      validateTimedScore(m);
    }
  });

  it('runs the format check across multiple iterations for statistical confidence', () => {
    // Random score generation means a single run could pass by luck.
    // 10 iterations makes false-positive from game-based scores extremely unlikely.
    for (let i = 0; i < 10; i++) {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        participantsProfile: { participantsCount: 0, idPrefix: `iter-${i}` },
        completeAllMatchUps: true,
        drawProfiles: [
          {
            eventType: TEAM,
            drawType: SINGLE_ELIMINATION,
            drawSize: 2,
            teamGenders: { MALE: 3, FEMALE: 3 },
            tieFormat: {
              tieFormatName: 'INTENNSE',
              winCriteria: { aggregateValue: true },
              collectionDefinitions: intennseCollections,
            },
          },
        ],
      });

      tournamentEngine.setState(tournamentRecord);
      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      const completed = matchUps.filter((m) => m.collectionId && m.winningSide);

      for (const m of completed) {
        validateTimedScore(m);
      }
    }
  });

  it('non-TEAM draws are unaffected — top-level matchUpFormat still applies', () => {
    const standardFormat = 'SET3-S:6/TB7';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles: [{ drawSize: 8, matchUpFormat: standardFormat }],
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completed = matchUps.filter((m) => m.winningSide);
    expect(completed.length).toBeGreaterThan(0);

    const parsed = parse(standardFormat);
    expect(parsed).toBeDefined();
    if (!parsed) return;

    const { bestOf, setFormat } = parsed;

    for (const m of completed) {
      const { sets } = m.score;
      expect(sets.length).toBeGreaterThanOrEqual(2);
      expect(sets.length).toBeLessThanOrEqual(bestOf!);

      for (const set of sets) {
        // Game-based scores: winner reaches setTo (6) or setTo+1 (7 with tiebreak)
        const high = Math.max(set.side1Score, set.side2Score);
        expect(high).toBeGreaterThanOrEqual(setFormat!.setTo);
        expect(high).toBeLessThanOrEqual(setFormat!.setTo + 1);

        // No raw point totals > 14 (which timed sets would produce)
        expect(set.side1Score + set.side2Score).toBeLessThanOrEqual(14);
      }
    }
  });
});
