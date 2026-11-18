import { deleteNotices, setCapturedClock, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { findTarget, R1, TOPICS, cleared, walkover, won } from '@Tests/testHarness/outcome/directionFixtures';
import { completeDrawMatchUps } from '@Assemblies/generators/simulation/completeDrawMatchUps';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replayedInstants } from '@Tools/replayedInstants';
import { createSeededRandom, withRandomSource } from '@Tools/prng';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { nowMs, setClock, withCapturedClock } from '@Tools/clock';

// constants and types
import type { Step, Target } from '@Tests/testHarness/outcome/directionFixtures';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOUBLE_WALKOVER, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import type { Tournament } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/eventConstants';
import {
  AD_HOC,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

// counts v1's matchUp writes on the stored record (`directionCounter.ts`: a write to a recorded call's copy is not one)
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

// CONTROL: with `refuse` set no recording is made, and the call's answer is the abstention it had before (`clock`)
const recorder = vi.hoisted(() => ({ refuse: false, inexact: false }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) =>
    recorder.refuse ? undefined : actual.recordWholeCall(args);
  return { ...actual, recordWholeCall };
});

// FAULT: with `inexact` set, v1's run on the stored record is said to have read the clock another number of times
vi.mock('@Tools/replayedInstants', async (original) => {
  const actual = await original<typeof import('@Tools/replayedInstants')>();
  const replayedInstants: typeof actual.replayedInstants = () => {
    const instants = actual.replayedInstants();
    return { ...instants, exact: () => !recorder.inexact && instants.exact() };
  };
  return { ...actual, replayedInstants };
});

/**
 * A CALL WITH NO CAPTURED INSTANT IS RECORDED WITH THE INSTANTS IT READ (CA, 2026-11-18, `tools/replayedInstants.ts`).
 *
 * Outside an engine call nothing captures the clock: every stamp v1 writes reads the source where it is written, so
 * a source that advances gives each entity its own instant, and a source that fails leaves the writes made before it.
 * A call the ordered temporal executor does not certify abstained `clock`. Here it is read off v1's whole write on a
 * copy of the record: the copy's run reads the source as v1 does, the recorded ops hold what it was given, and v1 on
 * the stored record (`differential`, or a recording refused or thrown out of) is handed the same readings in order.
 *
 * Each row is a caller family of the abstention. It is first played with no recording (CONTROL: v1 writes the stored
 * record under `v2`, and `differential` counts the abstention); then recorded: under `v2` v1 is not asked to write the
 * stored record, and in every mode the source is read exactly as often as v1 alone reads it, and the record is left as
 * v1 leaves it object for object, each `updatedAt` and `scoredTime` at v1's own instant, with v1's notices and result.
 */

const EPOCH = Date.parse('2026-11-17T00:00:00.000Z');
const FIXED = '2026-11-01T00:00:00.000Z';

type Scope = 'held' | 'draw-only' | 'no-ledger' | 'generator';
type Row = {
  drawProfile: Record<string, unknown>;
  setup?: Step[];
  step: Step;
  scope?: Scope;
  /** a TEAM draw's line-ups are generated, so its lines can be scored */
  lineUps?: boolean;
};

const RR = (nth: number): Target => ({ roundNumber: 1, nth });
const SE_8 = { drawType: SINGLE_ELIMINATION, drawSize: 8 };
const partial = {
  matchUpStatus: IN_PROGRESS,
  score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] },
};

const ROWS: [string, Row][] = [
  // the planners' own `clock`: a group's tally and its result stamp the same entities, and there is no ledger
  [
    'a round robin result',
    { drawProfile: { drawType: ROUND_ROBIN, drawSize: 4 }, step: { target: RR(0), outcome: won(1) } },
  ],
  [
    'a round robin result, a captured instant with no stamp ledger',
    {
      drawProfile: { drawType: ROUND_ROBIN, drawSize: 4 },
      step: { target: RR(0), outcome: won(1) },
      scope: 'no-ledger',
    },
  ],
  [
    'an ad hoc result',
    {
      drawProfile: { drawType: AD_HOC, drawSize: 8, automated: true, roundsCount: 2 },
      step: { target: RR(0), outcome: won(1) },
    },
  ],
  // programs the ordered temporal executor does not certify
  ['a partial score', { drawProfile: SE_8, step: { target: R1(1), outcome: partial } }],
  [
    'a partial score, the draw alone',
    { drawProfile: SE_8, step: { target: R1(1), outcome: partial }, scope: 'draw-only' },
  ],
  [
    'a result cleared, its winner taken back',
    { drawProfile: SE_8, setup: [{ target: R1(1), outcome: won(1) }], step: { target: R1(1), outcome: cleared } },
  ],
  [
    'a winner changed',
    { drawProfile: SE_8, setup: [{ target: R1(1), outcome: won(1) }], step: { target: R1(1), outcome: won(2) } },
  ],
  ['a walkover', { drawProfile: SE_8, step: { target: R1(1), outcome: walkover(1) } }],
  ['a double walkover', { drawProfile: SE_8, step: { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } } }],
  [
    'a result whose loser is directed',
    {
      drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 },
      step: { target: R1(1, 'Main'), outcome: won(1) },
    },
  ],
  [
    'a TEAM line',
    {
      drawProfile: { drawType: SINGLE_ELIMINATION, drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO },
      step: { target: { roundNumber: 1, roundPosition: 1, singlesLine: 0 }, outcome: won(1) },
      lineUps: true,
    },
  ],
];

function prepare({ drawProfile, setup = [], step, lineUps }: Row) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock(FIXED);
  setSubscriptions({ subscriptions: {} });
  const generated = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  expect(generated.success, JSON.stringify(generated)).toEqual(true);
  if (lineUps)
    expect(
      tournamentEngine.generateLineUps({ drawId: 'd', attach: true, useDefaultEventRanking: true }).success,
    ).toEqual(true);
  for (const { target, outcome, params } of setup) {
    const result = tournamentEngine.setMatchUpStatus({
      outcome: structuredClone(outcome),
      matchUpId: findTarget(target),
      drawId: 'd',
      ...params,
    });
    expect(result.success, JSON.stringify(result)).toEqual(true);
  }
  const matchUpId = findTarget(step.target);
  const prepared: Tournament = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  return { prepared, matchUpId, step };
}

/**
 * the call made directly, outside every engine, on a fresh copy of the prepared record: the source advances 100 ms at
 * each read (so no two reads give one instant), and fails at read `failAt`, by throwing or with an invalid instant
 */
function direct(
  mode: OutcomePipelineMode,
  { prepared, matchUpId, step }: ReturnType<typeof prepare>,
  { scope = 'held', failAt, invalid }: { scope?: Scope; failAt?: number; invalid?: boolean } = {},
) {
  const roots: Tournament = structuredClone(prepared);
  const event = roots.events?.[0] as NonNullable<Tournament['events']>[number];
  const drawDefinition = event.drawDefinitions?.[0] as any;
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`)),
      ]),
    ),
  });
  let reads = 0;
  setClock(() => {
    reads += 1;
    if (reads === failAt && invalid) return Number.NaN;
    if (reads === failAt) throw new Error(`the source failed at read ${reads}`);
    return EPOCH + reads * 100;
  });
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  let returned: any;
  let thrown: string | undefined;
  try {
    if (scope === 'no-ledger') setCapturedClock(EPOCH);
    returned = setMatchUpStatus({
      tournamentRecord: scope === 'draw-only' ? undefined : roots,
      event: scope === 'draw-only' ? undefined : event,
      outcome: structuredClone(step.outcome),
      drawDefinition,
      matchUpId,
      ...step.params,
    } as any);
  } catch (error) {
    thrown = String(error);
  } finally {
    setCapturedClock(undefined);
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
  }
  const taken = reads;
  setClock(FIXED);
  notifySubscribers();
  const { stack: _stack, ...result } = returned ?? {};
  return {
    result,
    thrown,
    notices,
    reads: taken,
    v1Writes: v1Writes.count,
    record: canonicalJson(roots),
    // which objects are one object, the call's result among them (it can hold objects of the record)
    graph: objectGraph([toBePlayed.matchUpStatusCodes, toBePlayed.score, roots, result]),
  };
}

const tally = (key: string) => {
  const entry = getDifferentialTally()[key];
  return (entry?.compared ?? 0) + (entry?.deferred ?? 0);
};
const tallies = () => ({ abstained: tally('shadow:abstain:clock'), applied: tally('shadow:applied') });

afterEach(() => {
  recorder.refuse = false;
  recorder.inexact = false;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setCapturedClock(undefined);
  deleteNotices();
  setClock();
});

describe('a call with no captured instant that abstained `clock` is recorded whole, at the instants v1 read', () => {
  it.each(ROWS)('%s', (_label, row) => {
    const fixture = prepare(row);
    const scope = row.scope;
    const v1 = direct(OUTCOME_PIPELINE_V1, fixture, { scope });
    expect(v1.result.success, JSON.stringify(v1.result)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    // an uncaptured call reads the source at each stamp; inside a captured instant it is not read at all
    if (scope === 'no-ledger') expect(v1.reads).toEqual(0);
    else expect(v1.reads).toBeGreaterThan(1);

    // CONTROL: without the recording the call is v1's, for `clock`
    const before = tallies();
    recorder.refuse = true;
    const owed = direct(OUTCOME_PIPELINE_V2, fixture, { scope });
    expect(owed.v1Writes).toBeGreaterThan(0);
    direct(OUTCOME_PIPELINE_DIFFERENTIAL, fixture, { scope });
    expect(tallies()).toEqual({ abstained: before.abstained + 1, applied: before.applied });
    recorder.refuse = false;

    const compared = direct(OUTCOME_PIPELINE_DIFFERENTIAL, fixture, { scope });
    expect(tallies()).toEqual({ abstained: before.abstained + 1, applied: before.applied + 1 });
    const v2 = direct(OUTCOME_PIPELINE_V2, fixture, { scope });
    expect(v2.v1Writes).toEqual(0);
    for (const actual of [owed, compared, v2]) {
      expect(actual.thrown).toBeUndefined();
      expect(actual.reads).toEqual(v1.reads);
      expect(actual.result).toEqual(v1.result);
      expect(actual.record).toEqual(v1.record);
      expect(actual.graph).toEqual(v1.graph);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});

it('differential diverges, and puts the record back, where v1 read the clock another number of times than its copy', () => {
  const fixture = prepare(ROWS[0][1]);
  const v1 = direct(OUTCOME_PIPELINE_V1, fixture);
  expect(direct(OUTCOME_PIPELINE_DIFFERENTIAL, fixture).record).toEqual(v1.record);
  recorder.inexact = true;
  const diverged = direct(OUTCOME_PIPELINE_DIFFERENTIAL, fixture);
  expect(diverged.thrown).toContain('the copy read it another number of times');
  expect(diverged.record).toEqual(canonicalJson(fixture.prepared));
  expect(diverged.notices).toEqual([]);
  // the fault is differential's to find: v2 asks nothing of a run it does not make
  expect(direct(OUTCOME_PIPELINE_V2, fixture).record).toEqual(v1.record);
});

describe('a source that fails leaves, in every mode, what v1 leaves: the writes before the read, and the error', () => {
  const FAILING = ROWS.filter(([label]) =>
    ['a round robin result', 'a result cleared, its winner taken back', 'a result whose loser is directed'].includes(
      label,
    ),
  );
  it.each(FAILING.flatMap(([label, row]) => [false, true].map((invalid) => [label, invalid, row] as const)))(
    '%s (an invalid instant: %s)',
    (_label, invalid, row) => {
      const fixture = prepare(row);
      const { reads } = direct(OUTCOME_PIPELINE_V1, fixture);
      // every read v1 makes, and one past them: a failure the call never reaches
      for (let failAt = 1; failAt <= reads + 1; failAt++) {
        const v1 = direct(OUTCOME_PIPELINE_V1, fixture, { failAt, invalid });
        expect(!!v1.thrown).toEqual(failAt <= reads);
        expect(v1.reads).toEqual(Math.min(failAt, reads));
        for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
          const actual = direct(mode, fixture, { failAt, invalid });
          // the failed call is v1's (its recording is not made); the call past every read is recorded
          if (mode === OUTCOME_PIPELINE_V2) expect(actual.v1Writes > 0).toEqual(failAt <= reads);
          expect({ ...actual, v1Writes: 0 }, `${mode} failing at ${failAt}`).toEqual({ ...v1, v1Writes: 0 });
        }
      }
    },
  );
});

describe('the generator called as a bare function, with no engine around it', () => {
  it.each([ROUND_ROBIN, SINGLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION])(
    '%s: every completion is v2’s, and the draw is the one v1 leaves',
    (drawType) => {
      const run = (mode: OutcomePipelineMode) => {
        setOutcomePipeline(OUTCOME_PIPELINE_V1);
        setClock(FIXED);
        setSubscriptions({ subscriptions: {} });
        const { tournamentRecord } = mocksEngine.generateTournamentRecord({
          drawProfiles: [{ drawType, drawSize: 8, drawId: 'd' }],
          nonRandom: 1,
        });
        const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
        let reads = 0;
        setClock(() => EPOCH + ++reads * 100);
        setOutcomePipeline(mode);
        v1Writes.count = 0;
        // the scores it draws are the seed's, whatever ran before
        const result = withRandomSource(createSeededRandom(11), () =>
          completeDrawMatchUps({ drawDefinition, randomWinningSide: false } as any),
        );
        setOutcomePipeline(OUTCOME_PIPELINE_V1);
        setClock(FIXED);
        expect(result.success, JSON.stringify(result)).toEqual(true);
        return {
          reads,
          v1Writes: v1Writes.count,
          draw: canonicalJson(drawDefinition),
          graph: objectGraph(drawDefinition),
        };
      };
      const v1 = run(OUTCOME_PIPELINE_V1);
      expect(v1.v1Writes).toBeGreaterThan(0);
      expect(v1.reads).toBeGreaterThan(0);
      const compared = run(OUTCOME_PIPELINE_DIFFERENTIAL);
      const v2 = run(OUTCOME_PIPELINE_V2);
      expect(v2.v1Writes).toEqual(0);
      for (const actual of [compared, v2]) expect({ ...actual, v1Writes: 0 }).toEqual({ ...v1, v1Writes: 0 });
    },
  );
});

describe('replayedInstants: one call’s clock readings, read once and replayed to every run', () => {
  const ticking = () => {
    let reads = 0;
    setClock(() => EPOCH + ++reads);
    return () => reads;
  };

  it('hands a later run the readings an earlier one took, and reads the source only past their end', () => {
    const reads = ticking();
    const instants = replayedInstants();
    expect(instants.record(() => [nowMs(), nowMs()])).toEqual([EPOCH + 1, EPOCH + 2]);
    expect(instants.exact()).toEqual(false);
    expect(instants.replay(() => [nowMs(), nowMs()])).toEqual([EPOCH + 1, EPOCH + 2]);
    expect(reads()).toEqual(2);
    expect(instants.exact()).toEqual(true);
    // a longer run reads on, a shorter one leaves readings unread: neither is exact
    expect(instants.replay(() => [nowMs(), nowMs(), nowMs()])).toEqual([EPOCH + 1, EPOCH + 2, EPOCH + 3]);
    expect(reads()).toEqual(3);
    expect(instants.exact()).toEqual(false);
    expect(instants.replay(() => nowMs())).toEqual(EPOCH + 1);
    expect(instants.exact()).toEqual(false);
    // outside a run the source is read as ever
    expect(nowMs()).toEqual(EPOCH + 4);
  });

  it('with no recorded run, a replay reads the source as it always did', () => {
    const reads = ticking();
    const instants = replayedInstants();
    expect(instants.replay(() => nowMs())).toEqual(EPOCH + 1);
    expect(instants.replay(() => nowMs())).toEqual(EPOCH + 2);
    expect(reads()).toEqual(2);
  });

  it('refuses again, at the same read, a reading the source refused', () => {
    let reads = 0;
    setClock(() => {
      if (++reads === 2) throw new Error('no time');
      return EPOCH + reads;
    });
    const instants = replayedInstants();
    const run = () => {
      const first = nowMs();
      try {
        nowMs();
      } catch (error) {
        return [first, String(error)];
      }
      return [first];
    };
    const recorded = instants.record(run);
    expect(recorded).toEqual([EPOCH + 1, 'Error: the configured clock threw: no time']);
    expect(instants.replay(run)).toEqual(recorded);
    expect(reads).toEqual(2);
  });

  it('keeps nothing inside a captured instant, and keeps the read that captures one', () => {
    const reads = ticking();
    const captured = replayedInstants();
    withCapturedClock(() => {
      expect(captured.record(() => nowMs())).toEqual(EPOCH + 1);
      expect(captured.replay(() => nowMs())).toEqual(EPOCH + 1);
    });
    expect(reads()).toEqual(1);
    expect(captured.exact()).toEqual(true);
    const capturing = replayedInstants();
    expect(capturing.record(() => withCapturedClock((instant) => [instant, nowMs()]))).toEqual([EPOCH + 2, EPOCH + 2]);
    expect(capturing.replay(() => withCapturedClock((instant) => [instant, nowMs()]))).toEqual([EPOCH + 2, EPOCH + 2]);
    expect(reads()).toEqual(2);
  });

  it('nests: an inner call’s readings are the outer run’s, in its order', () => {
    const reads = ticking();
    const outer = replayedInstants();
    const call = () => {
      const inner = replayedInstants();
      const first = nowMs();
      const copied = inner.record(() => nowMs());
      return [first, copied, inner.replay(() => nowMs()), nowMs()];
    };
    const recorded = outer.record(call);
    expect(recorded).toEqual([EPOCH + 1, EPOCH + 2, EPOCH + 2, EPOCH + 3]);
    expect(outer.replay(call)).toEqual(recorded);
    expect(reads()).toEqual(3);
  });
});
