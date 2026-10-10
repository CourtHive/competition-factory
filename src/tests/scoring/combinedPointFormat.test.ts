import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { setOutcomePipeline } from '@Global/state/globalState';
import { analyzeScore } from '@Query/matchUp/analyzeScore';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants and types
import type { RotatingPartnerScoringVariant } from '@Types/rotatingPartnerScoring';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';

afterEach(() => setOutcomePipeline());

it.each([
  { code: 'SET1-S:P32', variant: { tieResolution: 'ALLOW' } },
  { code: 'SET1-S:P32DP', variant: { tieResolution: 'DECIDING_POINT' } },
  { code: 'SET1-S:P32WB2', variant: { tieResolution: 'WIN_BY_MARGIN', winningMargin: 2 } },
  { code: 'SET1-S:P31', variant: { tieResolution: 'ALLOW' } },
])('round-trips $code', ({ code, variant }) => {
  const parsed = parse(code);
  expect(parsed?.setFormat).toMatchObject(variant);
  expect(stringify(parsed)).toBe(code);
});

it.each([
  'SET1-S:P0',
  'SET1-S:P032',
  'SET1-S:P32WB1',
  'SET1-S:P32DPWB2',
  'SET3-S:P32',
  'SET1A-S:P32',
  'SET1-S:P32-G:TN3D',
  'SET1-S:P32-M:T20',
  'SET1-S:P32-F:TB1',
  'SET3-S:6/TB7-F:P32',
  'HAL1-S:P32',
  'SET1-S:P9007199254740992',
])('refuses unsupported or malformed %s', (code) => expect(parse(code)).toBeUndefined());

it.each([
  { code: 'SET1-S:P32', a: 17, b: 15, complete: true, winner: 1 },
  { code: 'SET1-S:P32', a: 16, b: 16, complete: true, winner: undefined },
  { code: 'SET1-S:P32', a: 10, b: 15, complete: false, winner: undefined },
  { code: 'SET1-S:P32DP', a: 16, b: 16, complete: false, winner: undefined },
  { code: 'SET1-S:P32DP', a: 16, b: 17, complete: true, winner: 2 },
  { code: 'SET1-S:P32WB2', a: 17, b: 16, complete: false, winner: undefined },
  { code: 'SET1-S:P32WB2', a: 18, b: 16, complete: true, winner: 1 },
])('completion/analysis/validator agree on $code $a–$b', ({ code, a, b, complete, winner }) => {
  const set = { setNumber: 1, side1Score: a, side2Score: b, winningSide: winner };
  expect(checkSetIsComplete({ set, matchUpFormat: code })).toBe(complete);
  expect(validateMatchUpScore([set], code, complete ? 'COMPLETED' : 'IN_PROGRESS').isValid).toBe(true);
  expect(
    analyzeScore({
      score: { sets: [set] },
      matchUpFormat: code,
      winningSide: winner,
      matchUpStatus: complete ? 'COMPLETED' : 'IN_PROGRESS',
    }).valid,
  ).toBe(true);
  expect(
    analyzeMatchUp({ matchUp: { matchUpFormat: code, score: { sets: [set] }, winningSide: winner } }),
  ).toMatchObject({ isCompletedMatchUp: complete, calculatedWinningSide: winner });
});

it.each([
  { side1Score: 17, side2Score: 16 },
  { side1Score: -1, side2Score: 33 },
  { side1Score: 16.5, side2Score: 15.5 },
  { side1Score: 16, side2Score: 16, winningSide: 1 },
  { side1Score: 17, side2Score: 15, side1TiebreakScore: 1, side2TiebreakScore: 0 },
])('refuses invalid fixed-total set %j', (set) => {
  const contract = { combinedPointTotal: 32, tieResolution: 'ALLOW' as const };
  expect(analyzeCombinedPointSet(set, contract).valid).toBe(false);
});

function setup(variant: RotatingPartnerScoringVariant = { tieResolution: 'ALLOW' }) {
  const ids = ['a', 'b', 'c', 'd'];
  const draw: DrawDefinition = {
    drawId: 'd',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: ids.map((participantId) => ({ participantId, entryStatus: 'DIRECT_ACCEPTANCE' })),
    structures: [{ structureId: 's', matchUps: [] }],
    competitionProfile: {
      version: 1,
      format: 'AMERICANO',
      entrantScope: 'INDIVIDUAL',
      matchUpType: 'DOUBLES',
      scoring: { combinedPointTotal: 32, selectedVariant: variant },
      standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
      pairing: { seed: 42, algorithmVersion: 1 },
      completion: { kind: 'PARTNERSHIP_COVERAGE' },
    },
  };
  const record: Tournament = {
    tournamentId: 't',
    participants: ids.map((participantId) => ({
      participantId,
      participantType: 'INDIVIDUAL',
      participantRole: 'COMPETITOR',
      participantName: participantId,
    })),
    events: [
      {
        eventId: 'e',
        eventType: 'DOUBLES',
        entries: ids.map((participantId) => ({ participantId, entryStatus: 'UNGROUPED' })),
        drawDefinitions: [draw],
      },
    ],
  };
  tournamentEngine.setState(record);
  const preview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 1 });
  const applied = tournamentEngine.generateRotatingPartnerRound({
    drawId: 'd',
    roundNumber: 1,
    requestId: 'r1',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  });
  expect(applied.error).toBeUndefined();
  return { drawId: 'd', matchUpId: applied.matchUps![0].matchUpId };
}

it.each(['v1', 'v2', 'differential'] as const)(
  'materialized match accepts a completed 16–16 without a winner (%s)',
  (pipeline) => {
    setOutcomePipeline(pipeline);
    const context = setup();
    const outcome = { matchUpStatus: 'COMPLETED', score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } };
    expect(tournamentEngine.setMatchUpStatus({ ...context, outcome }).error).toBeUndefined();
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.find((matchUp) => matchUp.matchUpId === context.matchUpId)).toMatchObject({
      matchUpStatus: 'COMPLETED',
      matchUpFormat: 'SET1-S:P32',
      score: { sets: [{ side1Score: 16, side2Score: 16 }] },
    });
    expect(matchUps.find((matchUp) => matchUp.matchUpId === context.matchUpId).winningSide).toBeUndefined();
  },
);

it('winner-to-tie correction removes the former winner', () => {
  const context = setup();
  expect(
    tournamentEngine.setMatchUpStatus({
      ...context,
      outcome: {
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
        score: { sets: [{ setNumber: 1, side1Score: 17, side2Score: 15, winningSide: 1 }] },
      },
    }).error,
  ).toBeUndefined();
  expect(
    tournamentEngine.setMatchUpStatus({
      ...context,
      outcome: { matchUpStatus: 'COMPLETED', score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } },
    }).error,
  ).toBeUndefined();
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const corrected = matchUps.find((matchUp) => matchUp.matchUpId === context.matchUpId);
  expect(corrected.winningSide).toBeUndefined();
  expect(corrected.score.sets).toMatchObject([{ side1Score: 16, side2Score: 16 }]);
});

it('saved rules refuse tied completion and format overrides even with validation disabled', () => {
  const context = setup({ tieResolution: 'DECIDING_POINT' });
  const before = structuredClone(tournamentEngine.getTournament().tournamentRecord.events);
  const outcome = { matchUpStatus: 'COMPLETED', score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } };
  expect(tournamentEngine.setMatchUpStatus({ ...context, outcome, disableScoreValidation: true }).error).toBeTruthy();
  expect(tournamentEngine.setMatchUpState({ ...context, ...outcome, disableScoreValidation: true }).error).toBeTruthy();
  expect(tournamentEngine.setMatchUpStatus({ ...context, outcome, matchUpFormat: 'SET1-S:P32' }).error).toBeTruthy();
  expect(tournamentEngine.getTournament().tournamentRecord.events).toEqual(before);
  expect(
    tournamentEngine.setMatchUpStatus({
      ...context,
      outcome: {
        matchUpStatus: 'COMPLETED',
        winningSide: 2,
        score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 17, winningSide: 2 }] },
      },
    }).error,
  ).toBeUndefined();
});

it.each([
  { code: 'SET1-S:P32', extra: [], a: 16, b: 16, winner: undefined },
  { code: 'SET1-S:P32DP', extra: [1], a: 16, b: 17, winner: 2 },
  { code: 'SET1-S:P32WB2', extra: [0, 1, 1, 1], a: 17, b: 19, winner: 2 },
])('live scoring completes and undo/redo replays $code', ({ code, extra, a, b, winner }) => {
  const engine = new ScoringEngine({ matchUpFormat: code });
  for (let i = 0; i < 16; i++) {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
  }
  for (const side of extra) engine.addPoint({ winner: side as 0 | 1 });
  expect(engine.getState()).toMatchObject({
    matchUpStatus: 'COMPLETED',
    score: { sets: [{ side1Score: a, side2Score: b }] },
  });
  expect(engine.getState().winningSide).toBe(winner);
  expect(engine.getScore()).toMatchObject({ points: [a, b], games: [0, 0], scoreString: `${a}-${b}` });
  expect(engine.getScoreboard()).toBe(`${a}-${b}`);
  const completed = engine.getState();
  engine.addPoint({ winner: 0 });
  expect(engine.getState()).toEqual(completed);
  engine.undo();
  expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
  engine.redo();
  expect(engine.getState().score).toEqual(completed.score);
  expect(engine.getState().winningSide).toBe(winner);
});

it('live tie emits no fabricated winner or tennis-game events', () => {
  let games = 0;
  let winners = 0;
  let ties = 0;
  const engine = new ScoringEngine({
    matchUpFormat: 'SET1-S:P4',
    eventHandlers: {
      onGameComplete: () => games++,
      onMatchComplete: () => winners++,
      onMatchTie: () => ties++,
    },
  });
  [0, 1, 0, 1].forEach((winner) => engine.addPoint({ winner: winner as 0 | 1 }));
  expect({ games, winners, ties }).toEqual({ games: 0, winners: 0, ties: 1 });
});

it('live deciding point is displayed numerically, with policy-aware match-point information', () => {
  const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:P4DP' });
  [0, 1, 0, 1].forEach((winner) => engine.addPoint({ winner: winner as 0 | 1 }));
  expect(engine.getScore()).toMatchObject({
    points: [2, 2],
    pointDisplay: ['2', '2'],
    situation: { isGoldenPoint: true, isMatchPoint: true, isGamePoint: false },
  });
  engine.addPoint({ winningSide: 2, serverSideNumber: 1, timestamp: '2026-10-10T12:00:00Z' });
  expect(engine.getState()).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 2 });
  expect(engine.getState().history?.points.at(-1)).toMatchObject({
    winner: 1,
    server: 0,
    timestamp: '2026-10-10T12:00:00Z',
  });
});

it('initial rally totals resume live scoring and invalid replacements leave state unchanged', () => {
  const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:P32DP' });
  engine.setInitialScore({ sets: [{ side1Score: 16, side2Score: 16 }] });
  expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
  engine.addPoint({ winner: 0 });
  expect(engine.getState()).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 1 });
  engine.undo();
  expect(engine.getState()).toMatchObject({
    matchUpStatus: 'IN_PROGRESS',
    score: { sets: [{ side1Score: 16, side2Score: 16 }] },
  });
  const before = engine.getState();
  expect(() => engine.setInitialScore({ sets: [{ side1Score: 18, side2Score: 16 }] })).toThrow();
  expect(engine.getState()).toEqual(before);
  expect(() => engine.addGame({ winner: 0 })).toThrow();
  expect(() => engine.endSegment()).toThrow();
  expect(engine.getState()).toEqual(before);
});

it('whole-segment entry infers a winner or a completed tie and refuses a second segment', () => {
  const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:P32' });
  engine.addSet({ side1Score: 16, side2Score: 16 });
  expect(engine.getState()).toMatchObject({ matchUpStatus: 'COMPLETED' });
  expect(engine.getState().winningSide).toBeUndefined();
  const before = engine.getState();
  expect(() => engine.addSet({ side1Score: 17, side2Score: 15 })).toThrow();
  expect(engine.getState()).toEqual(before);
  engine.undo();
  engine.addSet({ side1Score: 17, side2Score: 15 });
  expect(engine.getState()).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 1 });
});

it.each(['v1', 'v2', 'differential'] as const)(
  'a partial manual score stays in progress when status is omitted (%s)',
  (pipeline) => {
    setOutcomePipeline(pipeline);
    const context = setup();
    expect(
      tournamentEngine.setMatchUpStatus({
        ...context,
        outcome: { score: { sets: [{ setNumber: 1, side1Score: 10, side2Score: 12 }] } },
      }).error,
    ).toBeUndefined();
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.find((matchUp) => matchUp.matchUpId === context.matchUpId)).toMatchObject({
      matchUpStatus: 'IN_PROGRESS',
      score: { sets: [{ side1Score: 10, side2Score: 12 }] },
    });
  },
);

it.each(['v1', 'v2', 'differential'] as const)(
  'a rotating score-only clear returns to TO_BE_PLAYED (%s)',
  (pipeline) => {
    setOutcomePipeline(pipeline);
    const context = setup();
    expect(
      tournamentEngine.setMatchUpStatus({
        ...context,
        outcome: { score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] } },
      }).error,
    ).toBeUndefined();
    expect(tournamentEngine.setMatchUpStatus({ ...context, outcome: { score: { sets: [] } } }).error).toBeUndefined();
    const current = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find((matchUp) => matchUp.matchUpId === context.matchUpId);
    expect(current.matchUpStatus).toBe('TO_BE_PLAYED');
    expect(current.winningSide).toBeUndefined();
    expect(current.score?.sets?.length ?? 0).toBe(0);
  },
);
