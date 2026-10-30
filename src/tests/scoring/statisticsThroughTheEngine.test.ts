import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

// every result a point can record, on first and second serves, with a breakpoint and a hand: the engine's statistics
// read its own history, so each category is counted from points the engine recorded
const PLAYED: Record<string, unknown>[] = [
  { winner: 0, result: 'Ace', serve: 1 },
  { winner: 1, result: 'Double Fault', serve: 2 },
  { winner: 0, result: 'Serve Winner', serve: 2 },
  { winner: 1, result: 'Return Winner', serve: 1, hand: 'Forehand' },
  { winner: 0, result: 'Winner', serve: 1, hand: 'Backhand' },
  { winner: 1, result: 'Unforced Error', serve: 1 },
  { winner: 1, result: 'Forced Error', serve: 2, breakpoint: true },
  { winner: 0, result: 'Forced Error', serve: 1 },
  { winner: 0, result: 'Unforced Error', serve: 2, breakpoint: true },
  { winner: 0 },
  { winner: 0, result: 'Ace', serve: 1 },
];

const valueOf = (stats: any, category: string) =>
  stats.calculated.find((stat: any) => stat.category === category)?.teams.map((team: any) => team.value);

describe('statistics through the engine', () => {
  it('counts each recorded result in its own categories', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const point of PLAYED) engine.addPoint(point as any);
    const stats = engine.getStatistics();

    expect(valueOf(stats, 'Aces')).toEqual([2, 0]);
    expect(valueOf(stats, 'Double Faults')).toEqual([1, 0]);
    // a forced error counts against the side that lost the point, never as unforced (S12)
    expect(valueOf(stats, 'Forced Errors')).toEqual([1, 1]);
    expect(valueOf(stats, 'Unforced Errors')).toEqual([1, 1]);
    expect(valueOf(stats, 'Winners')).toEqual([4, 1]);
    expect(valueOf(stats, 'Total Points Won')).toEqual([7, 4]);
    expect(stats.counters.teams[0].Backhand).toHaveLength(1);
    expect(stats.counters.teams[1].Forehand).toHaveLength(1);
    expect(stats.summary?.totalPoints).toEqual(11);
  });

  it('filters by set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const point of PLAYED) engine.addPoint(point as any);
    expect(engine.getStatistics({ setFilter: 1 }).summary?.totalPoints).toEqual(0);
    expect(engine.getStatistics({ setFilter: 0 }).summary?.totalPoints).toEqual(11);
  });
});
