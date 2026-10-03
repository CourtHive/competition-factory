import { canonicalHash, canonicalObject } from './hash';
import tournamentEngine from '@Engines/syncEngine';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { applyPatch } from './applyPatch';

export type Mismatch = { step: number; expected: string; actual: string; result?: unknown };

/**
 * The READER contract: apply each step's patch to the previous state and check the hash.
 * This is what a consumer with no engine (the Rust reader) does; it proves the patches and hashes
 * are self-consistent without running anything.
 */
export function replayAsReader(scenario: any): Mismatch[] {
  const mismatches: Mismatch[] = [];
  let state: any = scenario.initial.record;
  const initialHash = canonicalHash(state);
  if (initialHash !== scenario.initial.hash)
    mismatches.push({ step: -1, expected: scenario.initial.hash, actual: initialHash });
  scenario.steps.forEach((step: any, index: number) => {
    state = applyPatch(state, step.patch);
    const hash = canonicalHash(state);
    if (hash !== step.hash) mismatches.push({ step: index, expected: step.hash, actual: hash });
  });
  return mismatches;
}

/**
 * The PORT contract: start from the initial record, run each directive through an engine, hash the
 * state after, compare. Here the engine is the TypeScript one, which also makes this the
 * regression pin: a behaviour change moves a hash.
 */
export function replayThroughEngine(scenario: any): Mismatch[] {
  const mismatches: Mismatch[] = [];
  setRandomSource(scenario.seed);
  let base = Date.parse(scenario.clock);
  let ticks = 0;
  const tickMs = typeof scenario.clockTickMs === 'number' ? scenario.clockTickMs : 0;
  // a fixed clock is a ticking clock with a zero tick; a step with its own base restarts there
  setClock(() => new Date(base + ticks++ * tickMs));
  const restore = (step: any) => {
    if (typeof step.seed === 'number') setRandomSource(step.seed);
    if (step.clockAt) {
      base = Date.parse(step.clockAt);
      ticks = 0;
    }
  };
  try {
    tournamentEngine.reset();
    tournamentEngine.setState(scenario.initial.record);
    const initialHash = canonicalHash(canonicalObject(tournamentEngine.getTournament().tournamentRecord));
    if (initialHash !== scenario.initial.hash)
      mismatches.push({ step: -1, expected: scenario.initial.hash, actual: initialHash });
    scenario.steps.forEach((step: any, index: number) => {
      restore(step);
      const outcome: any = tournamentEngine.executionQueue([step.directive]);
      const result = outcome?.error ? { error: outcome.error.code ?? String(outcome.error) } : { success: true };
      const hash = canonicalHash(canonicalObject(tournamentEngine.getTournament().tournamentRecord));
      const sameResult = (result as any).error === step.result.error && (result as any).success === step.result.success;
      if (hash !== step.hash || !sameResult)
        mismatches.push({ step: index, expected: step.hash, actual: hash, result });
    });
  } finally {
    setRandomSource();
    setClock();
  }
  return mismatches;
}
