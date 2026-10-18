import { directAdapter, kernelOperations, serializedAdapter, validateCases } from './kernel';
import type { KernelAdapter, KernelCase, KernelOperation, KernelResult } from './kernel';
import { canonicalJson } from '@Tools/canonicalJson';
import grammarCases from './cases/grammar.json';
import scoringCases from './cases/scoring.json';
import { describe, expect, it } from 'vitest';

/**
 * Language-neutral kernel cases, run through this implementation's adapters. Each expectation was authored from
 * the rule it names (the minimum-points rule, the matchUpFormat grammar), not recorded from the engine, so a case
 * can catch this implementation being wrong, and a second implementation can run the same file through its own
 * adapter. The deliberately wrong adapters at the end prove the cases can tell a wrong answer from a right one.
 */
const cases = [...scoringCases, ...grammarCases] as KernelCase[];
const adapters = [directAdapter(), serializedAdapter()];

// What a case pins: a value exactly; an error or a refusal by its code or reason (any detail is diagnostic).
function observed(result: KernelResult) {
  if (result.kind === 'value') return { kind: 'value', value: result.value };
  if (result.kind === 'error') return { kind: 'error', code: result.code };
  if (result.kind === 'refused') return { kind: 'refused', reason: result.reason };
  return { kind: 'exception', message: result.message };
}

function failures(adapter: KernelAdapter, subset: KernelCase[]) {
  return subset.filter((c) => {
    const actual = observed(adapter.invoke(c.operation, c.input));
    return canonicalJson(actual) !== canonicalJson(observed(c.expected)); // key order is not part of a value
  });
}

describe('kernel case files', () => {
  it('are well-formed: stable unique ids, registered operations, known result kinds', () => {
    expect(cases.length).toBeGreaterThan(20);
    expect(validateCases(cases)).toEqual([]);
  });

  it('the validator rejects malformed cases', () => {
    const bad = [
      { caseId: 'no-version', operation: 'kernel.format.parse@1', input: {}, expected: { kind: 'value', value: 1 } },
      { caseId: 'a.b.v1', operation: 'kernel.nope@1', input: {}, expected: { kind: 'value', value: 1 } },
      { caseId: 'a.b.v1', operation: 'kernel.format.parse@1', input: {}, expected: { kind: 'maybe' } },
      { caseId: 'a.c.v1', operation: 'kernel.format.parse@1', input: {}, expected: { kind: 'exception', message: '' } },
    ] as unknown as KernelCase[];
    expect(validateCases(bad)).toEqual([
      'no-version: caseId must look like domain.name.v1',
      'a.b.v1: unknown operation kernel.nope@1',
      'a.b.v1: duplicate caseId',
      'a.b.v1: expected.kind must be one of value,error,refused,exception',
      'a.c.v1: an exception is never an expected outcome',
    ]);
  });
});

describe.each(adapters)('$name adapter', (adapter) => {
  it.each(cases)('$caseId', (c) => {
    expect(observed(adapter.invoke(c.operation, c.input))).toEqual(observed(c.expected));
  });

  it('refuses an operation the registry does not list, and input that is not an object', () => {
    expect(adapter.invoke('kernel.scoring.pointsToMatch@1', {})).toEqual({
      kind: 'refused',
      reason: 'UNKNOWN_OPERATION',
      detail: 'kernel.scoring.pointsToMatch@1',
    });
    expect(adapter.invoke('toString', {})).toMatchObject({ kind: 'refused', reason: 'UNKNOWN_OPERATION' });
    expect(adapter.invoke('kernel.format.parse@1', ['SET3-S:6/TB7'])).toMatchObject({
      kind: 'refused',
      reason: 'INVALID_INPUT',
    });
  });

  it('every canonical code a parse case names stringifies back to itself', () => {
    const parsed = grammarCases.filter((c) => c.operation === 'kernel.format.parse@1' && c.expected.kind === 'value');
    expect(parsed.length).toBeGreaterThan(3);
    for (const c of parsed) {
      const { value } = adapter.invoke('kernel.format.parse@1', c.input) as { value: unknown };
      const code = adapter.invoke('kernel.format.stringify@1', { formatStructure: value });
      expect(code).toEqual({ kind: 'value', value: c.input.matchUpFormat });
    }
  });
});

describe('the seam', () => {
  it('reports a thrown implementation as an exception, never as a value or an expected error', () => {
    const throwing: KernelOperation = {
      capability: 'scoring',
      validate: () => undefined,
      run: () => {
        throw new Error('boom');
      },
    };
    const adapter = serializedAdapter({ 'kernel.test.throws@1': throwing });
    expect(adapter.invoke('kernel.test.throws@1', {})).toEqual({ kind: 'exception', message: 'boom' });
  });

  it('the serialized adapter is a real boundary: what JSON cannot carry does not arrive', () => {
    const leaky: KernelOperation = {
      capability: 'scoring',
      validate: () => undefined,
      run: () => ({ kind: 'value', value: { kept: 1, dropped: undefined, when: new Date(0) } }),
    };
    const registry = { 'kernel.test.leaky@1': leaky };
    expect(directAdapter(registry).invoke('kernel.test.leaky@1', {})).toEqual({
      kind: 'value',
      value: { kept: 1, dropped: undefined, when: new Date(0) },
    });
    const crossed = serializedAdapter(registry).invoke('kernel.test.leaky@1', {}) as { value: object };
    expect(crossed.value).toStrictEqual({ kept: 1, when: '1970-01-01T00:00:00.000Z' });
  });

  it('is a closed registry: frozen, and holds only versioned kernel operations', () => {
    expect(Object.isFrozen(kernelOperations)).toBe(true);
    for (const name of Object.keys(kernelOperations)) expect(name).toMatch(/^kernel\.[a-z]+\.[A-Za-z]+@\d+$/);
  });
});

describe('negative controls: the cases reject a wrong implementation', () => {
  const scoring = scoringCases as KernelCase[];
  const grammar = grammarCases as KernelCase[];

  it('the pre-fix points-to-game rule (trailing side needs target minus its points, or 2 at deuce) fails', () => {
    const underCount: KernelOperation = {
      ...kernelOperations['kernel.scoring.pointsToGame@1'],
      run: (input) => {
        const right = kernelOperations['kernel.scoring.pointsToGame@1'].run(input);
        if (right.kind !== 'value') return right;
        const [a, b] = input.points as [number, number];
        const trailing = (mine: number, opp: number, n: number) => (mine < opp ? Math.min(n, 2) : n);
        const [n1, n2] = right.value as [number, number];
        return { kind: 'value', value: [trailing(a, b, n1), trailing(b, a, n2)] };
      },
    };
    const wrong = directAdapter({ ...kernelOperations, 'kernel.scoring.pointsToGame@1': underCount });
    expect(failures(wrong, scoring).map((c) => c.caseId)).toEqual([
      'scoring.points-to-game.tb7.one-behind.v1',
      'scoring.points-to-game.tb7.two-behind.v1',
      'scoring.points-to-game.tiebreak-only.one-behind.v1',
      'scoring.points-to-game.standard.fifteen-forty.v1',
      'scoring.points-to-game.standard.advantage-out.v1',
      'scoring.points-to-game.noad.fifteen-forty.v1',
    ]);
  });

  it('a stringify that drops NOAD fails', () => {
    const dropsNoAD: KernelOperation = {
      ...kernelOperations['kernel.format.stringify@1'],
      run: (input) => {
        const result = kernelOperations['kernel.format.stringify@1'].run(input);
        return result.kind === 'value' ? { kind: 'value', value: String(result.value).replace('NOAD', '') } : result;
      },
    };
    const wrong = serializedAdapter({ ...kernelOperations, 'kernel.format.stringify@1': dropsNoAD });
    expect(failures(wrong, grammar).map((c) => c.caseId)).toEqual(['grammar.stringify.noad-best-of-5.v1']);
  });

  it('the right implementation fails none, through either adapter', () => {
    for (const adapter of adapters) expect(failures(adapter, cases)).toEqual([]);
  });
});
