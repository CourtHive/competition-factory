import { ScoringEngine } from '@Assemblies/governors/scoreGovernor/generate';
import { expect, it, vi } from 'vitest';

it('uses the instance clock for creation, actions and reset, and preserves an explicit action timestamp', () => {
  const stamp = (n: number) => new Date(n * 1000).toISOString();
  let reads = 0;
  const clock = vi.fn(() => stamp(++reads));
  const engine = new ScoringEngine({ matchUpId: 'clock-test', clock });
  expect(engine.getState().createdAt).toBe(stamp(1));
  engine.addPoint({ winner: 0, timestamp: stamp(50) });
  expect(engine.getState().history?.points?.[0].timestamp).toBe(stamp(50));
  expect(clock).toHaveBeenCalledTimes(1);
  engine.addPoint({ winner: 1 });
  expect(engine.getState().history?.points?.[1].timestamp).toBe(stamp(2));
  engine.reset();
  expect(engine.getState().createdAt).toBe(stamp(3));
  expect(clock).toHaveBeenCalledTimes(3);
});
