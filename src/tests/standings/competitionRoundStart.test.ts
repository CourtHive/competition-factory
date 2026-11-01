import { deriveCompetitionState } from '@Query/drawDefinition/competition/deriveCompetitionState';
import { POLICY_COMPETITION_STANDARD } from '@Fixtures/policies/POLICY_COMPETITION_STANDARD';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';

/**
 * C6 (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 2, ruled 2026-11-01): under PER_ROUND every result of a round is
 * expected from the form ratings at the START of the round, as the competition policy documents. It differs from
 * applying results one after another only for a participant who plays more than once in a round, so A plays twice.
 */

const policy = (processingGranularity: 'PER_ROUND' | 'PER_MATCHUP') => ({
  ...POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION],
  processingGranularity,
  ratingPolicy: {
    ...POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION].ratingPolicy,
    dynamicFormRating: { enabled: true, kFactor: 32, logisticScale: 400 },
  },
});

const matchUp = (matchUpId: string, a: string, b: string, games: [number, number][], winningSide: 1 | 2) => ({
  sides: [
    { sideNumber: 1, participantId: a },
    { sideNumber: 2, participantId: b },
  ],
  score: { sets: games.map(([side1Score, side2Score], i) => ({ setNumber: i + 1, side1Score, side2Score })) },
  roundNumber: 1,
  winningSide,
  matchUpId,
});

// round 1: A beats B 6-0 6-0, and loses to C 4-6 4-6
const BEAT_B = matchUp(
  'ab',
  'A',
  'B',
  [
    [6, 0],
    [6, 0],
  ],
  1,
);
const LOST_TO_C = matchUp(
  'ac',
  'A',
  'C',
  [
    [4, 6],
    [4, 6],
  ],
  2,
);

const baseline = (participantId: string) => ({
  participantId,
  baselineRating: 1500,
  dynamicFormRating: 1500,
  pressureRating: 0,
  roundsPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  totalPointsWon: 0,
  totalPointsLost: 0,
  ratingHistory: [],
});

function derive(granularity: 'PER_ROUND' | 'PER_MATCHUP', matchUps: any[]) {
  return deriveCompetitionState({
    competitionPolicy: policy(granularity) as any,
    competitionState: {
      participantStates: { A: baseline('A'), B: baseline('B'), C: baseline('C') },
      roundStates: { 1: { roundNumber: 1, processed: true } },
    },
    drawDefinition: { drawId: 'd', structures: [{ structureId: 's', matchUps }] } as any,
  });
}

describe('C6: PER_ROUND rates a round from the ratings at its start', () => {
  it('A plays twice: both expectations come from the round start, so the order the results are listed in is moot', () => {
    const forwards = derive('PER_ROUND', [BEAT_B, LOST_TO_C]);
    const backwards = derive('PER_ROUND', [LOST_TO_C, BEAT_B]);
    expect(backwards.participantStates.A.dynamicFormRating).toBeCloseTo(
      forwards.participantStates.A.dynamicFormRating,
      10,
    );

    // all at 1500, so each expectation is one half: A moves by K x (actual - 1/2) for each result, summed
    const [first, second] = forwards.participantStates.A.ratingHistory.map(({ actualOutput }) => actualOutput);
    expect(forwards.participantStates.A.dynamicFormRating).toBeCloseTo(
      1500 + 32 * (first - 0.5) + 32 * (second - 0.5),
      10,
    );
    expect(first).toBeGreaterThan(0.5);
    expect(second).toBeLessThan(0.5);
  });

  it('PER_MATCHUP still applies results one after another, so for A the order does matter', () => {
    const forwards = derive('PER_MATCHUP', [BEAT_B, LOST_TO_C]);
    const backwards = derive('PER_MATCHUP', [LOST_TO_C, BEAT_B]);
    expect(backwards.participantStates.A.dynamicFormRating).not.toBeCloseTo(
      forwards.participantStates.A.dynamicFormRating,
      6,
    );
  });

  it('a participant who plays once in the round gets the same rating either way', () => {
    const perRound = derive('PER_ROUND', [BEAT_B, LOST_TO_C]);
    const perMatchUp = derive('PER_MATCHUP', [BEAT_B, LOST_TO_C]);
    expect(perRound.participantStates.B.dynamicFormRating).toBeCloseTo(
      perMatchUp.participantStates.B.dynamicFormRating,
      10,
    );
  });
});
