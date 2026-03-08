import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, WALKOVER, DEFAULTED, RETIRED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('getParticipantResults coverage', () => {
  it('handles matchUps with cancelled statuses (no winningSide)', () => {
    const result = getParticipantResults({
      matchUps: [
        {
          matchUpStatus: COMPLETED,
          winningSide: undefined,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: { sets: [] },
        } as any,
      ],
    });
    expect(result.participantResults).toBeDefined();
    expect(result.participantResults['p1']?.matchUpsCancelled).toBe(1);
    expect(result.participantResults['p2']?.matchUpsCancelled).toBe(1);
  });

  it('counts walkovers, defaults, and retirements correctly', () => {
    const result = getParticipantResults({
      matchUps: [
        {
          matchUpStatus: WALKOVER,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: { sets: [] },
        } as any,
        {
          matchUpStatus: DEFAULTED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p3' },
          ],
          score: { sets: [] },
        } as any,
        {
          matchUpStatus: RETIRED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p4' },
          ],
          score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] },
        } as any,
      ],
    });

    expect(result.participantResults['p2']?.walkovers).toBe(1);
    expect(result.participantResults['p3']?.defaults).toBe(1);
    expect(result.participantResults['p4']?.retirements).toBe(1);
    expect(result.participantResults['p1']?.matchUpsWon).toBe(3);
  });

  it('processes sets and games tallies', () => {
    const result = getParticipantResults({
      matchUps: [
        {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: {
            sets: [
              { side1Score: 6, side2Score: 3, winningSide: 1 },
              { side1Score: 6, side2Score: 4, winningSide: 1 },
            ],
          },
        } as any,
      ],
    });

    expect(result.participantResults['p1']?.setsWon).toBe(2);
    expect(result.participantResults['p1']?.setsLost).toBe(0);
    expect(result.participantResults['p1']?.gamesWon).toBe(12);
    expect(result.participantResults['p1']?.gamesLost).toBe(7);
    expect(result.participantResults['p2']?.setsWon).toBe(0);
    expect(result.participantResults['p2']?.setsLost).toBe(2);
  });

  it('handles excludeMatchUpStatuses tally policy', () => {
    const result = getParticipantResults({
      matchUps: [
        {
          matchUpStatus: WALKOVER,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: { sets: [] },
        } as any,
        {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] },
        } as any,
      ],
      tallyPolicy: { excludeMatchUpStatuses: [WALKOVER] },
    });

    // WALKOVER should be excluded
    expect(result.participantResults['p1']?.matchUpsWon).toBe(1);
  });

  it('filters by participantIds when provided', () => {
    const result = getParticipantResults({
      matchUps: [
        {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] },
        } as any,
        {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p3' },
          ],
          score: { sets: [{ side1Score: 6, side2Score: 4, winningSide: 1 }] },
        } as any,
      ],
      participantIds: ['p1', 'p2'], // only include matchUps with both p1 and p2
    });

    // Only the p1 vs p2 matchUp should be counted
    expect(result.participantResults['p1']?.matchUpsWon).toBe(1);
    expect(result.participantResults['p3']).toBeUndefined();
  });

  it('handles TEAM matchUps with tieMatchUps', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4, drawType: ROUND_ROBIN }],
      completeAllMatchUps: true,
      randomWinningSide: true,
      policyDefinitions,
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUps = matchUps.filter((m) => m.tieMatchUps?.length);

    if (teamMatchUps.length) {
      const result = getParticipantResults({
        matchUps: teamMatchUps,
      });
      expect(result.participantResults).toBeDefined();
      // With TEAM matchUps, tieMatchUps tally should have been processed
      const ids = Object.keys(result.participantResults);
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it('handles score without sets gracefully', () => {
    const result = getParticipantResults({
      matchUps: [
        {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: {}, // no sets
        } as any,
      ],
    });
    expect(result.participantResults['p1']?.matchUpsWon).toBe(1);
    expect(result.participantResults['p1']?.setsWon).toBe(0);
  });

  it('tracks victories and defeats arrays', () => {
    const result = getParticipantResults({
      matchUps: [
        {
          matchUpStatus: COMPLETED,
          winningSide: 1,
          sides: [
            { sideNumber: 1, participantId: 'p1' },
            { sideNumber: 2, participantId: 'p2' },
          ],
          score: { sets: [{ side1Score: 6, side2Score: 3, winningSide: 1 }] },
        } as any,
      ],
    });

    expect(result.participantResults['p1']?.victories).toContain('p2');
    expect(result.participantResults['p2']?.defeats).toContain('p1');
  });
});
