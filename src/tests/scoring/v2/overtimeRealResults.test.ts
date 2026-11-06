import { createContext, initialState, reduce, step } from '@Scoring/kernel/reduce';
import collection from '../../fixtures/overtime/officialResults.json';
import { describe, expect, it } from 'vitest';

import type { ScoringState, TimelineEntry } from '@Scoring/kernel/types';

const OPTIONS = { allowOvertime: true };
const END: TimelineEntry = { type: 'endSegment', data: {} };
type Fixture = (typeof collection.results)[number];
const total = ([side1Score, side2Score]: number[]): TimelineEntry => ({
  type: 'set',
  data: { side1Score, side2Score },
});
const totals = (fixture: Fixture): TimelineEntry[] => fixture.periods.map((period) => total(period.score));
const aggregate = (state: ScoringState) => [
  state.sets.reduce((n, set) => n + set.side1Score, 0),
  state.sets.reduce((n, set) => n + set.side2Score, 0),
];

function expectResult(fixture: Fixture, state: ScoringState) {
  expect(state.matchUpStatus, fixture.id).toBe('COMPLETED');
  expect(aggregate(state), fixture.id).toEqual(fixture.playedScore);
  expect(
    state.sets.map((set) => [set.side1Score, set.side2Score]),
    fixture.id,
  ).toEqual(fixture.periods.map((period) => period.score));
  const expectedWinner = fixture.scope === 'full' ? (fixture.officialWinner ?? undefined) : undefined;
  expect(state.winningSide, fixture.id).toBe(expectedWinner);
}

/** Actual ordered goals for hockey/football. NBA point order is synthetic input parity, not play-by-play. */
function replayScoring(fixture: Fixture) {
  const context = createContext({ matchUpFormat: fixture.format }, OPTIONS);
  let state = initialState();
  for (const [index, period] of fixture.periods.entries()) {
    const goals =
      period.goals ??
      period.score.flatMap((score, side) =>
        Array.from({ length: score }, () => ({ side: side + 1, at: 'synthetic order from period totals' })),
      );
    if (!goals.length) {
      const result = step(context, state, total([0, 0]));
      expect(result.outcome).toEqual({ recorded: true });
      state = result.state;
      continue;
    }
    for (const goal of goals) {
      const result = step(context, state, { type: 'point', data: { winner: goal.side === 1 ? 0 : 1 } });
      expect(result.outcome, `${fixture.id} period ${index + 1}, ${goal.at}`).toEqual({ recorded: true });
      state = result.state;
      const overtime = index >= fixture.regulationPeriods;
      expect(state.matchUpStatus).toBe(overtime && fixture.mode === 'suddenDeath' ? 'COMPLETED' : 'IN_PROGRESS');
    }
    // Sudden death ends at the goal. Timed periods require the explicit period-end input.
    if (state.matchUpStatus !== 'COMPLETED') {
      const result = step(context, state, END);
      expect(result.outcome).toEqual({ recorded: true });
      state = result.state;
    }
  }
  return state;
}

describe('official overtime result collections, retrieved 2026-11-03 (offline)', () => {
  it('keeps independent published results consistent with period totals, without adding shootout scores', () => {
    expect(collection.results).toHaveLength(22);
    expect(new Set(collection.results.map((fixture) => fixture.id)).size).toBe(22);
    for (const fixture of collection.results) {
      const played = [0, 1].map((side) => fixture.periods.reduce((sum, period) => sum + period.score[side], 0));
      expect(played, fixture.id).toEqual(fixture.playedScore);
      expect(fixture.sourceUrls.length).toBeGreaterThan(0);
      if (fixture.scope === 'full') expect(played, fixture.id).toEqual(fixture.officialScore);
      else expect(played[0], fixture.id).toBe(played[1]);
      for (const period of fixture.periods) {
        if (period.goals === null) continue;
        expect([1, 2].map((side) => period.goals!.filter((goal) => goal.side === side).length)).toEqual(period.score);
      }
    }
  });

  it.each(collection.results)('$id: reproduces published period totals and the covered result', (fixture) => {
    const timeline = totals(fixture);
    const result = reduce({ matchUpFormat: fixture.format }, timeline, OPTIONS);
    expect(result.outcomes).toEqual(timeline.map(() => ({ recorded: true })));
    expectResult(fixture, result.state);
    // Every recorded period before the final one must remain reachable, even when an exact block has a lead.
    for (let end = 1; end < timeline.length; end++) {
      const prefix = reduce({ matchUpFormat: fixture.format }, timeline.slice(0, end), OPTIONS);
      expect(prefix.state.matchUpStatus, `${fixture.id} after period ${end}`).toBe('IN_PROGRESS');
    }
  });

  it.each(collection.results)(
    '$id: goal/point replay agrees, with period-end versus sudden-death boundaries',
    (fixture) => {
      expectResult(fixture, replayScoring(fixture));
    },
  );

  it.each(collection.results.filter((fixture) => fixture.scope === 'throughOvertime'))(
    '$id: stops coverage before the unsupported shootout and preserves the published overall winner separately',
    (fixture) => {
      const state = reduce({ matchUpFormat: fixture.format }, totals(fixture), OPTIONS).state;
      expect(state.winningSide).toBeUndefined();
      expect(fixture.officialWinner).not.toBeNull();
      expect(aggregate(state)).toEqual(fixture.playedScore);
      if (fixture.id.startsWith('nhl-')) expect(fixture.officialScore).not.toEqual(fixture.playedScore);
      else expect(fixture.shootoutScore).toEqual([4, 5]);
    },
  );

  it('Belgium-USA 2014 fails to reproduce the 2-1 result if exactly-two is incorrectly treated as a ceiling', () => {
    const fixture = collection.results.find((fixture) => fixture.id === 'football-2014-bel-usa')!;
    const wrong = reduce({ matchUpFormat: fixture.format.replace('2X/', '2/') }, totals(fixture), OPTIONS);
    expect(aggregate(wrong.state)).toEqual([2, 0]);
    expect(wrong.outcomes.at(-1)).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(aggregate(wrong.state)).not.toEqual(fixture.officialScore);
  });

  it('the 1996 NHL ties require the finite ceiling; unlimited overtime leaves them in progress', () => {
    for (const fixture of collection.results.filter((fixture) => fixture.id.startsWith('nhl-1996'))) {
      const wrong = reduce({ matchUpFormat: fixture.format.replace('1SD/', 'USD/') }, totals(fixture), OPTIONS);
      expect(wrong.state.matchUpStatus).toBe('IN_PROGRESS');
      expect(wrong.state.winningSide).toBeUndefined();
    }
  });

  it('golden and silver goals use different completion boundaries, rather than treating every football extra time as exact', () => {
    for (const [id, afterGoal] of [
      ['football-2000-fra-ita', 'COMPLETED'],
      ['football-2004-gre-cze', 'IN_PROGRESS'],
    ]) {
      const fixture = collection.results.find((fixture) => fixture.id === id)!;
      const regulation = totals(fixture).slice(0, 2);
      const result = reduce(
        { matchUpFormat: fixture.format },
        [...regulation, { type: 'point', data: { winner: 0 } }],
        OPTIONS,
      );
      expect(result.state.matchUpStatus).toBe(afterGoal);
    }
  });
});
