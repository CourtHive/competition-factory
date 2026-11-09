import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { captureShadow, compareShadow } from '@Mutate/matchUps/outcome/shadow';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setClock, withCapturedClock } from '@Tools/clock';
import { afterEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import mocksEngine from '@Assemblies/engines/mock';
import {
  deleteNotices,
  getCapturedClock,
  getCapturedStamps,
  getNoticeBuffer,
  setOutcomePipeline,
  setSubscriptions,
} from '@Global/state/globalState';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

const observed = vi.hoisted(() => ({ v1: 0, fault: false, noNoticeSnapshot: false, plans: [] as any[] }));
vi.mock('@Global/state/globalState', async (load) => {
  const original = await load<typeof import('@Global/state/globalState')>();
  return { ...original, getNoticeState: () => (observed.noNoticeSnapshot ? undefined : original.getNoticeState()) };
});
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (load) => {
  const original: any = await load();
  return {
    ...original,
    setMatchUpState: (...args: any[]) => {
      observed.v1++;
      return original.setMatchUpState(...args);
    },
  };
});
vi.mock('@Mutate/matchUps/outcome/plan', async (load) => {
  const original: any = await load();
  return {
    ...original,
    planOutcome: (...args: any[]) => {
      const plan = original.planOutcome(...args);
      observed.plans.push(plan);
      return plan;
    },
  };
});
vi.mock('@Mutate/matchUps/outcome/ops', async (load) => {
  const original: any = await load();
  return {
    ...original,
    applyOutcomeOps: (draw: any, ops: any[], ...rest: any[]) => {
      const result = original.applyOutcomeOps(draw, ops, ...rest);
      if (observed.fault) draw.drawName = 'wrong shadow draw';
      return result;
    },
  };
});

const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
const SCOPES = [
  'draw-only',
  'event-only',
  'detached-record',
  'detached-event',
  'record-only',
  'held-draw-detached-event',
  'held',
] as const;
type Scope = (typeof SCOPES)[number];
const epoch = Date.parse('2026-01-01T00:00:00.000Z');
const outcome = (complete: boolean) => {
  const { outcome: result } = generateOutcomeFromScoreString({
    scoreString: complete ? '6-1 6-2' : '3-2',
    matchUpFormat: 'SET3-S:6/TB7',
    matchUpStatus: complete ? COMPLETED : IN_PROGRESS,
  });
  return complete ? result : { ...result, winningSide: undefined };
};

afterEach(() => {
  observed.fault = false;
  observed.noNoticeSnapshot = false;
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
  setClock();
});

function fixture(scope: Scope) {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock(epoch - 86400000);
  const generated = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    drawProfiles: [{ drawSize: 4, drawId: 'd' }],
    setState: true,
  });
  const record = generated.tournamentRecord;
  const event = record.events[0];
  const heldDraw = event.drawDefinitions[0];
  const drawDefinition = ['held', 'record-only', 'held-draw-detached-event'].includes(scope)
    ? heldDraw
    : structuredClone(heldDraw);
  const contextEvent =
    scope === 'detached-record' || scope === 'held'
      ? event
      : { ...structuredClone(event), drawDefinitions: [drawDefinition] };
  const suppliedEvent = ['draw-only', 'record-only'].includes(scope) ? undefined : contextEvent;
  const tournamentRecord = [
    'detached-record',
    'detached-event',
    'record-only',
    'held-draw-detached-event',
    'held',
  ].includes(scope)
    ? record
    : undefined;
  const matchUpId = drawDefinition.structures[0].matchUps.find((matchUp: any) => matchUp.roundNumber === 1).matchUpId;
  deleteNotices();
  return { args: { drawDefinition, event: suppliedEvent, tournamentRecord, matchUpId }, record };
}

function play(mode: OutcomePipelineMode, scope: Scope, complete = true, captured = true) {
  const { args, record } = fixture(scope);
  const untouched = !['held', 'record-only', 'held-draw-detached-event'].includes(scope)
    ? canonicalJson(record)
    : undefined;
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => {
          for (const payload of payloads) notices.push(`${topic} ${canonicalJson(payload)}`);
        },
      ]),
    ),
  });
  let reads = 0;
  setClock(() => epoch + ++reads * 100);
  setOutcomePipeline(mode);
  observed.v1 = 0;
  observed.plans = [];
  resetDifferentialTally();
  const run = () => {
    let result: any = setMatchUpStatus({ ...args, outcome: outcome(complete) });
    notifySubscribers();
    const { stack: _stack, ...returned } = result;
    return returned;
  };
  const result = captured ? withCapturedClock(run) : run();
  if (untouched) expect(canonicalJson(record)).toEqual(untouched);
  expect(getCapturedClock()).toBeUndefined();
  expect(getCapturedStamps()).toBeUndefined();
  return {
    result,
    notices,
    reads,
    roots: canonicalJson({
      drawDefinition: args.drawDefinition,
      event: args.event,
      tournamentRecord: args.tournamentRecord,
    }),
    v1: observed.v1,
    plans: observed.plans,
    tally: getDifferentialTally(),
  };
}

it.each(SCOPES)('%s: v2 owns the captured write with identical delivered payloads and order', (scope) => {
  const v1 = play('v1', scope);
  const v2 = play('v2', scope);
  expect(v1.result).toMatchObject({ success: true });
  expect(v1.v1).toEqual(1);
  expect(v1.notices.length).toBeGreaterThan(0);
  expect(v2.v1).toEqual(0);
  expect(v2.plans.some((plan) => plan.ops?.length)).toEqual(true);
  expect(v1.reads).toEqual(1);
  expect(v2.reads).toEqual(v1.reads);
  expect(v2.result).toEqual(v1.result);
  expect(v2.roots).toEqual(v1.roots);
  expect(v2.notices).toEqual(v1.notices);
});

it.each(SCOPES)('%s: differential compares the draw, view and subscribed notices', (scope) => {
  const actual = play('differential', scope, false);
  expect(actual.result).toMatchObject({ success: true });
  for (const key of ['shadow:applied', 'shadow:notices', 'view']) {
    expect(actual.tally[key]).toEqual({ compared: 1, deferred: 0 });
  }
});

it.each(SCOPES)(
  '%s: an uncaptured ordinary result is owned with the same clock reads and delivered notices',
  (scope) => {
    const v1 = play('v1', scope, true, false);
    const v2 = play('v2', scope, true, false);
    expect(v1.reads).toBeGreaterThan(1);
    expect(v2.v1).toEqual(0);
    expect(v2.plans[0]?.ops?.length).toBeGreaterThan(0);
    expect(v2.reads).toEqual(v1.reads);
    expect(v2.roots).toEqual(v1.roots);
    expect(v2.result).toEqual(v1.result);
    expect(v2.notices).toEqual(v1.notices);
  },
);

it('a wrong detached shadow diverges and restores the original draw objects', () => {
  const { args, record } = fixture('detached-record');
  const before = canonicalJson({ args, record });
  const matchUps = args.drawDefinition.structures[0].matchUps;
  const first = matchUps.find((matchUp: any) => matchUp.matchUpId === args.matchUpId);
  setClock(epoch);
  setOutcomePipeline('differential');
  observed.fault = true;
  expect(() => withCapturedClock(() => setMatchUpStatus({ ...args, outcome: outcome(false) }))).toThrow(
    /shadow-applied.*drawName/,
  );
  expect(canonicalJson({ args, record })).toEqual(before);
  expect(args.drawDefinition.structures[0].matchUps).toBe(matchUps);
  expect(matchUps.find((matchUp: any) => matchUp.matchUpId === args.matchUpId)).toBe(first);
  expect(first.matchUpStatus).toEqual(TO_BE_PLAYED);
});

it('a captured partial score is owned with identical delivered notices', () => {
  const v1 = play('v1', 'draw-only', false);
  const v2 = play('v2', 'draw-only', false);
  expect(v1.result).toMatchObject({ success: true });
  expect(v1.v1).toEqual(1);
  expect(v2.v1).toEqual(0);
  expect(v2.reads).toEqual(1);
  expect(v2.result).toEqual(v1.result);
  expect(v2.roots).toEqual(v1.roots);
  expect(v2.notices).toEqual(v1.notices);
});

it.each(['drawDefinition', 'event', 'tournamentRecord'] as const)(
  'the shadow compares the supplied %s, even when the event is detached from a record holding the draw',
  (root) => {
    const { args } = fixture('held-draw-detached-event');
    const before = captureShadow(args);
    (args[root] as any).unexpectedWrite = true;
    const result = compareShadow({ before, current: args, ops: [] });
    expect(result.equal).toEqual(false);
    if (!result.equal) expect(result.path).toContain('unexpectedWrite');
  },
);

function throwPrefix(mode: OutcomePipelineMode, throwAt: number) {
  const { args } = fixture('draw-only');
  const first = args.drawDefinition.structures[0].matchUps[0];
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => {
          payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`));
        },
      ]),
    ),
  });
  let reads = 0;
  setClock(() => {
    if (++reads === throwAt) throw new Error('direct clock failure');
    return epoch + reads * 100;
  });
  setOutcomePipeline(mode);
  observed.plans = [];
  let thrown: string | undefined;
  try {
    setMatchUpStatus({ ...args, outcome: outcome(true) });
  } catch (error) {
    thrown = String(error);
  }
  const roots = canonicalJson(args.drawDefinition);
  const buffered = getNoticeBuffer()?.map(({ topic, key }) => ({ topic, key }));
  // Observe the surviving prefix after the call has thrown, without changing the caller's clock reads.
  setClock(epoch);
  notifySubscribers();
  expect(args.drawDefinition.structures[0].matchUps[0]).toBe(first);
  expect(getCapturedClock()).toBeUndefined();
  expect(getCapturedStamps()).toBeUndefined();
  return { roots, buffered, notices, reads, thrown, plans: observed.plans };
}

it('every owned direct clock throw prefix preserves identical writes and delivered notices', () => {
  const successful = play('v1', 'draw-only', true, false);
  expect(successful.reads).toEqual(7);
  for (let read = 1; read <= successful.reads; read++) {
    const v1 = throwPrefix('v1', read);
    const v2 = throwPrefix('v2', read);
    expect(v1.thrown).toContain('direct clock failure');
    expect(v1.reads).toEqual(read);
    expect(v2.plans[0]?.ops?.length).toBeGreaterThan(0);
    expect({ ...v2, plans: [] }).toEqual(v1);
  }
});

it('a rejected captured boundary never enters either outcome writer', () => {
  const { args } = fixture('draw-only');
  const before = canonicalJson(args.drawDefinition);
  observed.v1 = 0;
  observed.plans = [];
  setOutcomePipeline('v2');
  setClock(() => {
    throw new Error('boundary clock failure');
  });
  const entered = vi.fn(() => setMatchUpStatus({ ...args, outcome: outcome(true) }));
  let result: any = withCapturedClock(entered);
  expect(result.error.code).toEqual('ERR_INVALID_DATE');
  expect(entered).not.toHaveBeenCalled();
  expect(observed.v1).toEqual(0);
  expect(observed.plans).toEqual([]);
  expect(canonicalJson(args.drawDefinition)).toEqual(before);
  expect(getNoticeBuffer() ?? []).toEqual([]);
  expect(getCapturedClock()).toBeUndefined();
  expect(getCapturedStamps()).toBeUndefined();
});

function nestedWrites(mode: OutcomePipelineMode, omitLaterEvent = false) {
  const { args } = fixture(omitLaterEvent ? 'event-only' : 'draw-only');
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => {
          payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`));
        },
      ]),
    ),
  });
  let reads = 0;
  setClock(() => epoch + ++reads * 100);
  setOutcomePipeline(mode);
  observed.v1 = 0;
  const results: any[] = [];
  withCapturedClock(() => {
    for (const scoreString of ['3-2', '4-2']) {
      if (omitLaterEvent && scoreString === '4-2') args.event = undefined;
      const score = generateOutcomeFromScoreString({ scoreString }).outcome.score;
      withCapturedClock(() => {
        const { stack: _stack, ...result }: any = setMatchUpStatus({
          ...args,
          outcome: { matchUpStatus: IN_PROGRESS, score },
        });
        results.push(result);
      });
    }
    // Both calls share the existing buffer: the second overwrites notices and deferred payloads from the first.
    notifySubscribers();
  });
  expect(getCapturedClock()).toBeUndefined();
  expect(getCapturedStamps()).toBeUndefined();
  return { roots: canonicalJson(args.drawDefinition), notices, reads, results, v1: observed.v1 };
}

it('nested capture reuses the instant and preserves overwritten buffers through deferred delivery', () => {
  const v1 = nestedWrites('v1');
  const v2 = nestedWrites('v2');
  expect(v1.results.every((result) => result.success)).toEqual(true);
  expect(v1.reads).toEqual(1);
  expect(v1.v1).toEqual(2);
  expect(v2.v1).toEqual(0);
  expect({ ...v2, v1: 2 }).toEqual(v1);
});

it('an eventless later call retains the earlier buffered event identity under differential', () => {
  const v1 = nestedWrites('v1', true);
  const v2 = nestedWrites('v2', true);
  expect({ ...v2, v1: 2 }).toEqual(v1);
  const differential = nestedWrites('differential', true);
  expect(differential).toEqual(v1);
});

it.each(SCOPES)('%s: uncaptured differential replay adds no clock reads and checks the completed view', (scope) => {
  const v1 = play('v1', scope, true, false);
  const compared = play('differential', scope, true, false);
  expect(compared.reads).toBe(v1.reads);
  expect(compared.result).toEqual(v1.result);
  expect(compared.roots).toEqual(v1.roots);
  expect(compared.notices).toEqual(v1.notices);
  for (const key of ['shadow:applied', 'shadow:notices', 'view'])
    expect(compared.tally[key]).toEqual({ compared: 1, deferred: 0 });
});

it('an uncaptured partial score remains owed without a complete temporal program', () => {
  const v1 = play('v1', 'draw-only', false, false);
  const v2 = play('v2', 'draw-only', false, false);
  expect(v2.v1).toBe(1);
  expect(v2.reads).toBe(v1.reads);
  expect(v2.result).toEqual(v1.result);
  expect(v2.roots).toEqual(v1.roots);
  expect(v2.notices).toEqual(v1.notices);
});

it('an uncaptured provider without notice snapshots remains owed with v1 parity', () => {
  observed.noNoticeSnapshot = true;
  const v1 = play('v1', 'draw-only', true, false);
  const v2 = play('v2', 'draw-only', true, false);
  expect(v2.v1).toBe(1);
  expect(v2.reads).toBe(v1.reads);
  expect(v2.result).toEqual(v1.result);
  expect(v2.roots).toEqual(v1.roots);
  expect(v2.notices).toEqual(v1.notices);
});
