import { inDraftWrites } from '@Global/state/withDraftWrites';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import syncProvider from '@Global/state/syncGlobalState';
import requestState from '@Server/providers/factory/engines/asyncGlobalState';
import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import {
  getProvider,
  setStateProvider,
  getOutcomePipeline,
  setOutcomePipeline,
  DEFERRED_PAYLOAD,
} from '@Global/state/globalState';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { setClock } from '@Tools/clock';
import { expect, it, vi } from 'vitest';

import type { DrawDefinition, MatchUp, Tournament } from '@Types/tournamentTypes';

const observed = vi.hoisted(() => ({ native: 0, whole: 0, legacy: 0, baseline: false, forbidWhole: false }));
// Only the extra phase compiler is disabled in the reference arm. The public
// entry then runs its real whole recorder on a fresh graph and provider scope.
vi.mock('@Mutate/matchUps/outcome/apply', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/apply')>();
  return {
    ...actual,
    compileTemporalPhases: (...args: Parameters<typeof actual.compileTemporalPhases>) =>
      observed.baseline && args[1] ? undefined : actual.compileTemporalPhases(...args),
  };
});
vi.mock('@Mutate/matchUps/outcome/plan/feedInRelay', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/feedInRelay')>();
  return {
    ...actual,
    feedInRelay: (...args: Parameters<typeof actual.feedInRelay>) => {
      const result = actual.feedInRelay(...args);
      if (result?.ops) observed.native++;
      return result;
    },
  };
});
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  return {
    ...actual,
    recordWholeCall: (...args: Parameters<typeof actual.recordWholeCall>) => {
      if (observed.forbidWhole) throw new Error('unexpected whole recorder on native relay');
      observed.whole++;
      return actual.recordWholeCall(...args);
    },
  };
});
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/matchUpStatus/setMatchUpState')>();
  return {
    ...actual,
    setMatchUpState: (...args: Parameters<typeof actual.setMatchUpState>) => {
      observed.legacy++;
      return actual.setMatchUpState(...args);
    },
  };
});

function fixture() {
  const matchUps: MatchUp[] = [
    {
      matchUpId: 'first-left',
      roundNumber: 1,
      roundPosition: 1,
      matchUpStatus: 'BYE',
      drawPositions: [4, 5],
      winnerMatchUpId: 'left',
    },
    {
      matchUpId: 'first-right',
      roundNumber: 1,
      roundPosition: 2,
      matchUpStatus: 'BYE',
      drawPositions: [6, 7],
      winnerMatchUpId: 'source',
    },
    {
      matchUpId: 'left',
      roundNumber: 2,
      roundPosition: 1,
      matchUpStatus: 'BYE',
      drawPositions: [2, 5],
      winnerMatchUpId: 'relay',
    },
    {
      matchUpId: 'source',
      roundNumber: 2,
      roundPosition: 2,
      matchUpStatus: 'TO_BE_PLAYED',
      drawPositions: [3, 7],
      winnerMatchUpId: 'relay',
    },
    {
      matchUpId: 'relay',
      roundNumber: 3,
      roundPosition: 1,
      matchUpStatus: 'BYE',
      drawPositions: [2],
      winnerMatchUpId: 'onward',
    },
    { matchUpId: 'onward', roundNumber: 4, roundPosition: 1, matchUpStatus: 'TO_BE_PLAYED', drawPositions: [1] },
  ];
  const drawDefinition: DrawDefinition = {
    drawId: 'feed-in',
    drawType: 'FEED_IN_CHAMPIONSHIP',
    matchUpFormat: 'SET3-S:6/TB7',
    matchUpType: 'SINGLES',
    structures: [
      {
        structureId: 'consolation',
        stage: 'CONSOLATION',
        stageSequence: 1,
        finishingPosition: 'ROUND_OUTCOME',
        matchUps,
        positionAssignments: [1, 2, 3, 4, 5, 6, 7].map((drawPosition) =>
          [1, 3, 7].includes(drawPosition)
            ? { drawPosition, participantId: 'p' + drawPosition }
            : { drawPosition, bye: true },
        ),
      },
    ],
  };
  const tournamentRecord: Tournament = {
    tournamentId: 't',
    participants: [1, 3, 7].map((n) => ({ participantId: 'p' + n, participantType: 'INDIVIDUAL' })),
  };
  return {
    drawDefinition,
    tournamentRecord,
    matchUpId: 'source',
    matchUpFormat: drawDefinition.matchUpFormat,
    outcome: {
      winningSide: 1,
      matchUpStatus: 'COMPLETED',
      score: {
        scoreStringSide1: '6-1 6-2',
        scoreStringSide2: '1-6 2-6',
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
        ],
      },
    },
  };
}

type Surface = 'sync' | 'async';
type Change = 'ordinary' | 'pre-stamped' | 'stale' | 'getter-stale' | 'outside' | 'live-parent';
async function measure(
  surface: Surface,
  change: Change,
  baseline: boolean,
  mode: 'v1' | 'v2' | 'differential',
  fixed = false,
) {
  const base = surface === 'async' ? requestState : syncProvider;
  const params = fixture();
  if (change === 'outside')
    Object.assign(params.tournamentRecord, {
      retained: params.drawDefinition.structures![0].matchUps![3],
    });
  const attempt = async () => {
    await Promise.resolve();
    const scope = base.getDeliveryScope(),
      old = { ...scope },
      provider = getProvider(),
      previous = getOutcomePipeline();
    const calls: unknown[] = [],
      notices: unknown[] = [],
      deliveries: unknown[] = [];
    let held: DrawDefinition | undefined;
    let ticks = 0;
    let insertedStale = false;
    const graph = (x: unknown) => JSON.stringify(objectGraph(x));
    class ObservedStamps extends WeakSet<object> {
      override add(o: object) {
        if (o !== params.drawDefinition && 'drawId' in o && o.drawId === params.drawDefinition.drawId)
          held = o as DrawDefinition;
        return super.add(o);
      }
    }
    const proxy = new Proxy(base, {
      get(target, key, receiver) {
        const method = Reflect.get(target, key, receiver);
        if (typeof method !== 'function') return method;
        return (...args: unknown[]) => {
          calls.push([key, inDraftWrites(), held && graph(held)]);
          if (change === 'getter-stale' && key === 'getCapturedStamps' && !insertedStale) {
            // The provider owns this live record separately. No notice payload is modified.
            params.drawDefinition.structures![0].matchUps![0].schedule = { scoredTime: '2026-11-01T12:00:00.000Z' };
            insertedStale = true;
          }
          if (change === 'live-parent' && key === 'addNotice' && inDraftWrites() && !insertedStale) {
            Object.assign(params.drawDefinition, { notes: 'changed in provider' });
            Object.assign(params.drawDefinition.structures![0], { notes: 'changed in provider' });
            insertedStale = true;
          }
          if (key === 'addNotice') {
            const notice = args[0] as { topic: string; key?: string; payload: Record<string, unknown> };
            const build = notice.payload[DEFERRED_PAYLOAD];
            notices.push([
              notice.topic,
              notice.key,
              inDraftWrites(),
              graph([params.drawDefinition, notice.payload]),
              typeof build === 'function' ? graph(build()) : undefined,
            ]);
          }
          return Reflect.apply(method, target, args);
        };
      },
    });
    try {
      setStateProvider(proxy);
      setOutcomePipeline(mode);
      const subscribed = ['modifyMatchUp', 'modifyDrawDefinition', 'updateInContextMatchUp'];
      Object.assign(scope, {
        tournamentRecords: { t: params.tournamentRecord },
        tournamentId: 't',
        subscriptions: Object.fromEntries(
          subscribed.map((topic) => [topic, (value: unknown) => deliveries.push([topic, graph(value)])]),
        ),
        notices: [{ topic: 'modifyMatchUp', key: 'old', payload: { older: true } }],
        modified: true,
        modifiedTopics: new Set(['modifyDrawDefinition', 'modifyMatchUp']),
        modifiedTournamentIds: new Set(['previous', 't']),
        disableNotifications: false,
        capturedClock: undefined,
        capturedStamps: new ObservedStamps(
          change === 'live-parent'
            ? [params.drawDefinition, params.drawDefinition.structures![0]]
            : change === 'pre-stamped'
              ? [params.drawDefinition]
              : [],
        ),
        callRandomSource: undefined,
      });
      const matches = params.drawDefinition.structures![0].matchUps!;
      if (change === 'stale') matches[0].schedule = { scoredTime: '2026-11-01T12:00:00.000Z' };
      setClock(fixed ? 1794139200000 : () => 1794139200000 + 17 * ++ticks + calls.length);
      Object.assign(observed, { baseline, native: 0, legacy: 0, whole: 0 });
      calls.length = 0;
      const result = setMatchUpStatus(params);
      if (!('stack' in result)) throw new Error('missing public result stack');
      const { stack, ...material } = result;
      expect(Array.isArray(stack)).toBe(true);
      expect(material.success).toBe(true);
      if (change === 'ordinary')
        expect(matches.slice(-2).map((m) => m.drawPositions)).toEqual([
          [2, 3],
          [1, 3],
        ]);
      notifySubscribers();
      const route = { native: observed.native, whole: observed.whole, legacy: observed.legacy };
      return {
        route,
        effects: {
          calls,
          notices,
          deliveries,
          material,
          stored: graph(params),
          ticks,
          ids: [...scope.modifiedTournamentIds!],
          topics: [...scope.modifiedTopics!],
          buffer: graph(scope.notices),
        },
      };
    } finally {
      setOutcomePipeline(previous);
      setClock();
      setStateProvider(provider);
      Object.assign(scope, old);
      observed.baseline = false;
    }
  };
  return surface === 'async' ? requestState.runWithInstanceState(attempt) : attempt();
}

it.each(['sync', 'async'] as const)(
  'keeps both draft placements, passive provider reads and delivery order on %s',
  async (surface) => {
    for (const mode of ['v2', 'differential'] as const)
      for (const change of ['ordinary', 'pre-stamped'] as const) {
        const reference = await measure(surface, change, true, mode);
        const native = await measure(surface, change, false, mode);
        expect(reference.route.whole).toBe(1);
        expect(native.route).toEqual({ native: 1, whole: 0, legacy: mode === 'v2' ? 0 : 1 });
        expect(native.effects).toEqual(reference.effects);
      }
  },
);

it('declines the same two destinations when an unrelated scored time requires a settle write', async () => {
  const reference = await measure('sync', 'stale', true, 'v2');
  const candidate = await measure('sync', 'stale', false, 'v2');
  expect(candidate.route).toEqual({ native: 0, whole: 1, legacy: 1 });
  expect(candidate.effects).toEqual(reference.effects);
});

it('continues the recorder in place if a clock getter changes the live preimage', async () => {
  const reference = await measure('sync', 'getter-stale', true, 'v2');
  const candidate = await measure('sync', 'getter-stale', false, 'v2');
  expect(candidate.route).toEqual({ native: 0, whole: 1, legacy: 1 });
  expect(candidate.effects).toEqual(reference.effects);
});

it('keeps independently held changes to pre-stamped parents during a draft notice', async () => {
  const reference = await measure('async', 'live-parent', true, 'v2');
  const candidate = await measure('async', 'live-parent', false, 'v2');
  expect(candidate.effects).toEqual(reference.effects);
});
it('uses the original recorder when an external field retains the source match', async () => {
  const reference = await measure('sync', 'outside', true, 'v2');
  const candidate = await measure('sync', 'outside', false, 'v2');
  expect(candidate.route).toEqual(reference.route);
  expect(candidate.effects).toEqual(reference.effects);
});

it('matches the v1 graph and material return with the whole recorder disabled', async () => {
  observed.forbidWhole = true;
  try {
    const v1 = await measure('sync', 'ordinary', false, 'v1', true);
    for (const mode of ['v2', 'differential'] as const) {
      const result = await measure('sync', 'ordinary', false, mode, true);
      expect(result.route).toEqual({ native: 1, whole: 0, legacy: mode === 'differential' ? 1 : 0 });
      expect(result.effects.material).toEqual(v1.effects.material);
      expect(result.effects.stored).toEqual(v1.effects.stored);
    }
  } finally {
    observed.forbidWhole = false;
  }
});
