import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, test, describe } from 'vitest';

// constants
import { INCOMPATIBLE_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { COMPLETED, IN_PROGRESS, RETIRED, SUSPENDED } from '@Constants/matchUpStatusConstants';

const drawId = 'drawId';
const matchUpId = 'm-1-1';

const completedOutcome = {
  score: {
    sets: [
      { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
      { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
    ],
    scoreStringSide1: '6-2 6-3',
    scoreStringSide2: '2-6 3-6',
  },
  winningSide: 1,
  matchUpStatus: COMPLETED,
};

// A semifinal-like matchUp whose winner has NOT yet played downstream — so the
// existing activeDownstream guard does NOT fire, and only the new revert guard
// protects the completed result. This mirrors the production incident.
function seedCompletedMatchUp() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
    setState: true,
  });
  const result: any = tournamentEngine.setMatchUpStatus({ outcome: completedOutcome, matchUpId, drawId });
  expect(result.success).toEqual(true);
}

describe('COMPLETED → live-status revert guard', () => {
  test('blocks reverting a validated COMPLETED matchUp to IN_PROGRESS', () => {
    seedCompletedMatchUp();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: IN_PROGRESS },
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);

    // the completed result must be untouched
    const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toEqual(1);
  });

  test('blocks reverting a validated COMPLETED matchUp to SUSPENDED', () => {
    seedCompletedMatchUp();
    const result: any = tournamentEngine.setMatchUpStatus({ outcome: { matchUpStatus: SUSPENDED }, matchUpId, drawId });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  test('allows re-submitting a completed outcome (correction path is not blocked)', () => {
    seedCompletedMatchUp();
    const result: any = tournamentEngine.setMatchUpStatus({ outcome: completedOutcome, matchUpId, drawId });
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
    const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp.winningSide).toEqual(1);
  });

  test('allows reverting a RETIRED matchUp (incomplete score) to IN_PROGRESS', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });
    const retiredOutcome = {
      score: {
        sets: [{ setNumber: 1, side1Score: 3, side2Score: 1 }],
        scoreStringSide1: '3-1',
        scoreStringSide2: '1-3',
      },
      winningSide: 1,
      matchUpStatus: RETIRED,
    };
    const setup: any = tournamentEngine.setMatchUpStatus({ outcome: retiredOutcome, matchUpId, drawId });
    expect(setup.success).toEqual(true);

    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: IN_PROGRESS },
      matchUpId,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
  });
});

function freshDraw() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
    setState: true,
  });
}

describe('score-implies-completion guard', () => {
  test('rejects a decisive score submitted with IN_PROGRESS', () => {
    freshDraw();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { score: completedOutcome.score, matchUpStatus: IN_PROGRESS },
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  test('rejects an explicit winningSide submitted with IN_PROGRESS', () => {
    freshDraw();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1, matchUpStatus: IN_PROGRESS },
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  });

  test('allows a non-decisive in-progress score (one set of a best-of-3)', () => {
    freshDraw();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: {
          sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }],
          scoreStringSide1: '6-4',
          scoreStringSide2: '4-6',
        },
        matchUpStatus: IN_PROGRESS,
      },
      matchUpId,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
    const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId });
    expect(matchUp.matchUpStatus).toEqual(IN_PROGRESS);
  });
});
