import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { compileTemporalPhases } from '@Mutate/matchUps/outcome/apply';
import { prepareTemporalShadow } from '@Mutate/matchUps/outcome/shadow';
import { takeVerificationFailures } from '@Mutate/matchUps/outcome/differential';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { deleteNotices, getOutcomePipeline, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';

const control = vi.hoisted(() => ({
  active: false,
  phases: 0,
  proveCompiler: false,
  fault: '',
  replay: false,
  liveError: undefined as unknown,
}));

// This tests the oracle independently of admission: a real v1 entry against a certified ordinary final program.
vi.mock('@Mutate/matchUps/outcome/decide', async (load) => {
  const original = await load<typeof import('@Mutate/matchUps/outcome/decide')>();
  return {
    ...original,
    decideOutcomeV2: (args: Parameters<typeof original.decideOutcomeV2>[0]) => {
      if (!control.active || getOutcomePipeline() !== 'differential') return original.decideOutcomeV2(args);
      const view = buildOutcomeView(args);
      const result: OutcomeOp = {
        op: 'setMatchUpResult',
        matchUpId: args.request.matchUpId!,
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
        score: args.request.score,
        matchUpStatusCodes: args.request.matchUpStatusCodes ?? [],
        ...(args.request.matchUpFormat ? { matchUpFormat: args.request.matchUpFormat } : {}),
      };
      const ops: OutcomeOp[] = [
        result,
        { op: 'stampUpdatedAt', entity: 'matchUp', id: args.request.matchUpId! },
        { op: 'stampUpdatedAt', entity: 'structure', id: view.targets.source.structureId! },
        { op: 'stampUpdatedAt', entity: 'drawDefinition', id: args.drawDefinition!.drawId },
      ];
      const phases = compileTemporalPhases({ args, view, route: 'winner', ops });
      expect(phases).toBeDefined();
      if (control.proveCompiler) {
        const wrongTarget = ops.map((op, index) => (index === 1 ? { ...op, id: 'foreign' } : op));
        const reordered = [ops[0], ops[2], ops[1], ops[3]];
        const quiet = [{ ...result, announcedAs: 'foreign' }, ...ops.slice(1)];
        for (const candidate of [ops.slice(0, -1), [...ops, ops.at(-1)!], wrongTarget, reordered, quiet])
          expect(compileTemporalPhases({ args, view, route: 'winner', ops: candidate as OutcomeOp[] })).toBeUndefined();
      }
      const shadow = prepareTemporalShadow(args, phases!, 'direction');
      expect(shadow).toBeDefined();
      return {
        runV1: <T>(run: () => T) =>
          shadow!(() => {
            try {
              return run();
            } catch (error) {
              control.liveError = error;
              throw error;
            }
          }),
      };
    },
  };
});

vi.mock('@Tools/clock', async (load) => {
  const original = await load<typeof import('@Tools/clock')>();
  return {
    ...original,
    observeClockReads: (...[observe, run, errors]: Parameters<typeof original.observeClockReads>) =>
      original.observeClockReads(
        (effect) => {
          if (control.fault === 'observer-before') throw new Error('collector before');
          const complete = observe(effect);
          return (reading) => {
            complete(reading);
            if (control.fault === 'observer-after') throw new Error('collector after');
          };
        },
        run,
        errors,
      ),
  };
});

vi.mock('@Mutate/matchUps/outcome/apply', async (load) => {
  const original = await load<typeof import('@Mutate/matchUps/outcome/apply')>();
  return {
    ...original,
    applyTemporalPhases: (...args: Parameters<typeof original.applyTemporalPhases>) => {
      control.phases++;
      const effects = args[3];
      if (control.fault === 'target' && effects) {
        const read = effects.notices.readClock;
        effects.notices.readClock = (effect) => read({ ...effect, target: { ...effect.target } });
      }
      if (control.fault === 'drop-notice' && effects) effects.notices.addNotice = () => undefined;
      if (control.fault === 'prefix-transient' && effects) {
        const read = effects.notices.readClock;
        let first = true;
        effects.notices.readClock = (effect) => {
          if (!first) return read(effect);
          first = false;
          const saved = Object.getOwnPropertyDescriptor(effect.target, 'matchUpStatus');
          Object.defineProperty(effect.target, 'matchUpStatus', { value: 'DEFAULTED', configurable: true });
          try {
            return read(effect);
          } finally {
            if (saved) Object.defineProperty(effect.target, 'matchUpStatus', saved);
            else Reflect.deleteProperty(effect.target, 'matchUpStatus');
          }
        };
      }
      if (control.fault === 'score-alias') args[1].result.score = structuredClone(args[1].result.score);
      control.replay = true;
      try {
        const result = original.applyTemporalPhases(...args);
        if (control.fault === 'extra-read')
          effects?.notices.readClock({ kind: 'updatedAt', target: args[0].drawDefinition! });
        if (control.fault === 'leak') setSubscriptions({ subscriptions: { 'temporal-leak': () => undefined } });
        if (control.fault === 'return-error') return { error: 'Invalid values' };
        if (control.fault === 'return-payload') return { ...result, unexpected: true };
        return result;
      } finally {
        control.replay = false;
      }
    },
  };
});

vi.mock('@Mutate/notifications/drawNotifications', async (load) => {
  const original = await load<typeof import('@Mutate/notifications/drawNotifications')>();
  return {
    ...original,
    deferredQuery: (...[query, args]: Parameters<typeof original.deferredQuery>) => {
      if (
        control.replay &&
        control.fault === 'deferred' &&
        args &&
        typeof args === 'object' &&
        'drawDefinition' in args
      )
        args = { ...args, drawDefinition: structuredClone(args.drawDefinition) };
      return original.deferredQuery(query, args);
    },
  };
});

afterEach(() => {
  control.active = false;
  control.replay = false;
  control.fault = '';
  control.proveCompiler = false;
  control.liveError = undefined;
  setClock();
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
});

function play(
  fault = '',
  throwAt = 0,
  surface = '',
  actualAdmission = false,
  mode: 'differential' | 'v2' = 'differential',
) {
  control.active = false;
  setOutcomePipeline('v1');
  setClock('2026-01-01T00:00:00.000Z');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ nonRandom: 1, drawProfiles: [{ drawSize: 2 }] });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const matchUp = drawDefinition.structures[0].matchUps[0];
  const date = new Date(surface === 'invalid-date' ? Number.NaN : Date.parse('2025-01-01T00:00:00Z'));
  let callbacks = 0;
  const set = new Set([date]);
  const map = new Map([['date', date]]);
  if (surface === 'methods') {
    Object.defineProperty(date, 'getTime', {
      value: () => {
        callbacks++;
        return 0;
      },
    });
    Object.defineProperty(set, Symbol.iterator, {
      value: function* () {
        callbacks++;
        yield date;
      },
    });
    Object.defineProperty(map, Symbol.iterator, {
      value: function* () {
        callbacks++;
        yield ['date', date];
      },
    });
  }
  if (surface === 'invalid-date') {
    matchUp.updatedAt = new Date(Number.NaN);
    drawDefinition.updatedAt = new Date(Number.NaN);
  }
  const sparse = new Array<unknown>(2);
  sparse[1] = 1;
  drawDefinition.extensions = [
    {
      name: 'replay-aliases',
      value: {
        first: date,
        again: date,
        set,
        map,
        empty: Object.assign(Object.create(null), { value: undefined }),
        sparse,
      },
    },
  ];
  const { outcome } = generateOutcomeFromScoreString({ scoreString: '6-1 6-2', matchUpFormat: 'SET3-S:6/TB7' });
  deleteNotices();
  setSubscriptions({
    subscriptions: Object.fromEntries(
      ['modifyMatchUp', 'modifyDrawDefinition', 'updateInContextMatchUp'].map((topic) => [topic, () => undefined]),
    ),
  });
  let reads = 0;
  setClock(() => {
    reads++;
    if (reads === throwAt) throw new Error('live clock failure');
    return Date.parse('2026-01-02T00:00:00Z') + reads;
  });
  control.fault = fault;
  control.active = !actualAdmission;
  control.phases = 0;
  setOutcomePipeline(mode);
  let result: unknown, error: unknown;
  try {
    result = setMatchUpStatus({ tournamentRecord, drawDefinition, matchUpId: matchUp.matchUpId, outcome });
  } catch (caught) {
    error = caught;
  }
  return {
    result,
    error,
    reads,
    matchUp,
    callbacks,
    phases: control.phases,
    failures: takeVerificationFailures(),
    liveError: control.liveError,
  };
}

it('replays a real v1 final with shared Date, Set, Map, null-prototype and sparse-array values', () => {
  const played = play();
  expect(played.error).toBeUndefined();
  expect(played.result).toMatchObject({ success: true });
  expect(played.reads).toBe(4);
  expect(played.failures).toEqual([]);
});

for (const fault of [
  'observer-before',
  'observer-after',
  'target',
  'drop-notice',
  'score-alias',
  'deferred',
  'prefix-transient',
]) {
  it(`makes ${fault} independently fatal after a successful live continuation`, () => {
    const played = play(fault);
    expect(played.reads).toBe(4);
    expect(played.error).toMatchObject({ name: 'OutcomePipelineDivergence' });
    expect(played.failures).toHaveLength(1);
  });
  for (const throwAt of [1, 2, 3, 4])
    it(`retains the original throw at ${throwAt} despite ${fault}`, () => {
      const played = play(fault, throwAt);
      expect(played.reads).toBe(throwAt);
      expect(played.error).toBe(played.liveError);
      expect(played.error).toMatchObject({ message: 'the configured clock threw: live clock failure' });
      expect(played.matchUp.winningSide).toBe(1);
      expect(played.failures).toHaveLength(1);
    });
}

for (const fault of ['extra-read', 'leak', 'return-error', 'return-payload'])
  it(`rejects ${fault} after an otherwise matching replay`, () => {
    const played = play(fault);
    expect(played.reads).toBe(4);
    expect(played.error).toMatchObject({ name: 'OutcomePipelineDivergence' });
    expect(played.failures).toHaveLength(1);
  });

for (const surface of ['invalid-date', 'methods'])
  it(`preserves ${surface} without executing caller callbacks in planning or replay`, () => {
    const played = play('', 0, surface);
    expect(played.error).toBeUndefined();
    expect(played.result).toMatchObject({ success: true });
    expect(played.reads).toBe(4);
    expect(played.callbacks).toBe(0);
    expect(played.failures).toEqual([]);
  });

it.each(['differential', 'v2'] as const)('%s normal admission does not invoke custom value methods', (mode) => {
  const played = play('', 0, 'methods', true, mode);
  expect(played.phases).toBe(1);
  expect(played.error).toBeUndefined();
  expect(played.result).toMatchObject({ success: true });
  expect(played.callbacks).toBe(0);
  expect(played.failures).toEqual([]);
});

it('the phase compiler consumes every stamp and refuses foreign, reordered or quiet effects', () => {
  control.proveCompiler = true;
  const played = play();
  expect(played.error).toBeUndefined();
  expect(played.result).toMatchObject({ success: true });
  expect(played.failures).toEqual([]);
});
