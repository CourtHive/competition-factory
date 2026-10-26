import { directAdapter, kernelOperations, serializedAdapter, validateCases } from './kernel';
import type { KernelAdapter, KernelCase, KernelOperation, KernelResult } from './kernel';
import { batchedAdapter, externalAdapter, stdioCommand } from './externalAdapter';
import scoringReduceCases from './cases/scoringReduce.json';
import schedulingViewCases from './cases/schedulingView.json';
import schedulingGridCases from './cases/schedulingGrid.json';
import schedulingCases from './cases/scheduling.json';
import { canonicalJson } from '@Tools/canonicalJson';
import grammarCases from './cases/grammar.json';
import scoringCases from './cases/scoring.json';
import { describe, expect, it } from 'vitest';
import timeCases from './cases/time.json';

/**
 * Language-neutral kernel cases, run through this implementation's adapters. Each expectation was authored from
 * the rule it names (the minimum-points rule, the matchUpFormat grammar), not recorded from the engine, so a case
 * can catch this implementation being wrong, and a second implementation can run the same file through its own
 * adapter. The deliberately wrong adapters at the end prove the cases can tell a wrong answer from a right one.
 *
 * Besides the in-process adapters, every case runs through the EXTERNAL protocol (`externalAdapter.ts`): this
 * implementation bundled and run as its own process (`stdio.ts`), one batch per run. `KERNEL_EXTERNAL_ADAPTER=<command>`
 * adds any other implementation that speaks the protocol.
 */
const cases = [
  ...scoringCases,
  ...scoringReduceCases,
  ...grammarCases,
  ...schedulingCases,
  ...schedulingViewCases,
  ...schedulingGridCases,
  ...timeCases,
] as KernelCase[];
const requests = cases.map(({ operation, input }) => ({ operation, input }));

const externalCommand = process.env.KERNEL_EXTERNAL_ADAPTER;
const adapters = [
  directAdapter(),
  serializedAdapter(),
  batchedAdapter(externalAdapter(stdioCommand(), 'stdio'), requests),
  ...(externalCommand ? [batchedAdapter(externalAdapter(externalCommand), requests)] : []),
];

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

  it('every code a parse case names stringifies back to its canonical form', () => {
    const parsed = grammarCases.filter((c) => c.operation === 'kernel.format.parse@1' && c.expected.kind === 'value');
    expect(parsed.length).toBeGreaterThan(3);
    for (const c of parsed) {
      const { value } = adapter.invoke('kernel.format.parse@1', c.input) as { value: unknown };
      const code = adapter.invoke('kernel.format.stringify@1', { formatStructure: value });
      expect(code).toEqual(adapter.invoke('kernel.format.canonical@1', c.input));
      expect(code).toMatchObject({ kind: 'value' });
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

describe('the external protocol', () => {
  it('answers a failed command, or a missing answer, with an exception for every request: never a value', () => {
    const [request] = requests;
    expect(
      externalAdapter('exit 3')
        .invokeAll([request, request])
        .map(({ kind }) => kind),
    ).toEqual(['exception', 'exception']);
    // the commands read their stdin before answering: one that exits without reading it races the write (EPIPE), which
    // is still an exception, but not the one this case names
    expect(externalAdapter('cat > /dev/null').invoke(request.operation, request.input)).toEqual({
      kind: 'exception',
      message: 'no answer for request 0',
    });
    expect(externalAdapter('cat > /dev/null; echo nope').invoke(request.operation, request.input)).toEqual({
      kind: 'exception',
      message: 'answer 0 is not JSON',
    });
  });
});

describe('negative controls: the cases reject a wrong implementation', () => {
  const scheduling = schedulingCases as KernelCase[];
  const time = timeCases as KernelCase[];
  const scoring = scoringCases as KernelCase[];
  const grammar = grammarCases as KernelCase[];

  it('a lenient clock (anything that starts like a time, kept as written) fails exactly the cases § 9.9 refuses', () => {
    const tidy = kernelOperations['kernel.time.tidy@1'];
    const lenient: KernelOperation = {
      ...tidy,
      run: (input) => {
        const result = tidy.run(input);
        const time = String(input.time);
        return result.kind === 'error' && /^\s*-?\d+:\d/.test(time) ? { kind: 'value', value: time } : result;
      },
    };
    const wrong = directAdapter({ ...kernelOperations, 'kernel.time.tidy@1': lenient });
    expect(failures(wrong, time).map((c) => c.caseId)).toEqual([
      'clock.tidy.single-digit-minute.v2',
      'clock.tidy.sixty-minutes.v2',
      'clock.tidy.negative-hour.v2',
      'clock.tidy.zulu-refused.v2',
      'clock.tidy.leading-space-refused.v2',
      'clock.tidy.meridiem-out-of-range.v1',
      'clock.tidy.trailing-text.v1',
      'clock.tidy.hour-24.v1',
    ]);
  });

  it('a within-day add that wraps past midnight fails exactly the midnight cases', () => {
    const wraps: KernelOperation = {
      ...kernelOperations['kernel.time.addWithinDay@1'],
      run: (input) => kernelOperations['kernel.time.addWrapping@1'].run(input),
    };
    const wrong = directAdapter({ ...kernelOperations, 'kernel.time.addWithinDay@1': wraps });
    expect(failures(wrong, time).map((c) => c.caseId)).toEqual([
      'clock.add-within-day.at-midnight.v1',
      'clock.add-within-day.past-midnight.v1',
      'clock.add-within-day.negative.v1',
      'clock.add-within-day.not-a-time.v1',
    ]);
  });

  it('a planner that ignores the played order fails the played-order case, and only it', () => {
    const plan = kernelOperations['kernel.scheduling.plan@2'];
    const ignoresPlayedOrder: KernelOperation = {
      ...plan,
      run: (input) => plan.run({ ...input, view: { ...(input.view as object), playedOrderFacts: {} } }),
    };
    const wrong = directAdapter({ ...kernelOperations, 'kernel.scheduling.plan@2': ignoresPlayedOrder });
    expect(failures(wrong, scheduling).map((c) => c.caseId)).toEqual([
      'scheduling.plan.played-source-on-a-later-date.v1',
    ]);
  });

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

  it("a reducer that ignores a point's value and the competition's server rule fails exactly those cases", () => {
    const reduce = kernelOperations['kernel.scoring.reduce@1'];
    const unitsAndAlternation: KernelOperation = {
      ...reduce,
      run: (input) => {
        const {
          pointMultipliers: _multipliers,
          competitionFormat: _competition,
          ...configuration
        } = (input.configuration ?? {}) as Record<string, unknown>;
        const timeline = (input.timeline as any[]).map(({ data, ...entry }) => {
          const { scoreValue: _value, ...rest } = data ?? {};
          return { ...entry, data: rest };
        });
        return reduce.run({ configuration, timeline });
      },
    };
    const wrong = directAdapter({ ...kernelOperations, 'kernel.scoring.reduce@1': unitsAndAlternation });
    expect(failures(wrong, scoringReduceCases as KernelCase[]).map((c) => c.caseId)).toEqual([
      'scoring.reduce.point-values.v1',
      'scoring.reduce.winner-serves.v1',
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

  it('a lenient parse (trimmed, empty sections and numberless tiebreaks dropped) fails exactly the closed readings', () => {
    const parse = kernelOperations['kernel.format.parse@1'];
    const lenient: KernelOperation = {
      ...parse,
      run: (input) => {
        const code = String(input.matchUpFormat)
          .trim()
          .replace(/-F:$/, '')
          .replaceAll(/\/TB(?=-|$)/g, '');
        return parse.run({ matchUpFormat: code });
      },
    };
    const wrong = directAdapter({ ...kernelOperations, 'kernel.format.parse@1': lenient });
    expect(failures(wrong, grammar).map((c) => c.caseId)).toEqual([
      'grammar.parse.trailing-space.v1',
      'grammar.parse.leading-space.v1',
      'grammar.parse.empty-final-section.v1',
      'grammar.parse.tiebreak-with-no-number.v1',
      'grammar.parse.final-tiebreak-with-no-number.v1',
    ]);
  });

  it('the right implementation fails none, through either adapter', () => {
    for (const adapter of adapters) expect(failures(adapter, cases)).toEqual([]);
  });
});
