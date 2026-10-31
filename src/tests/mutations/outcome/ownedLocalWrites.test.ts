import { deleteNotices, setOutcomePipeline, setSchemaWriteMode, setSubscriptions } from '@Global/state/globalState';
import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { DOUBLE_WALKOVER, IN_PROGRESS, SUSPENDED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { BRIDGE, NATIVE, type SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

/**
 * S2: v2 OWNS THE LOCAL WRITE (outcome v2 executor plan § 6 S2; F1 (a), fail-closed). Under `v2`, a call whose complete
 * plan touches only its own matchUp, with no winner before or after, no exit, nothing directed, no tally and no settle
 * work, is written by v2 (`outcome/apply.ts`) and v1's writer is not asked.
 *
 * The claim is equality: the same steps from the same record, under a fixed clock, leave the same record, raise the same
 * notices (payloads included) and return the same results under `v1` and under `v2`. Ownership is asserted separately,
 * by counting v1's writer, so a `v2` that quietly fell back to v1 cannot pass as owning.
 */
const v1Writes = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

const hydrations = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Query/matchUps/drawMatchUps', async (importOriginal) => {
  const actual: any = await importOriginal();
  const counted =
    (original: (...args: any[]) => any) =>
    (...args: any[]) => {
      if (args[0]?.inContext || args[0]?.nextMatchUps) hydrations.count += 1;
      return original(...args);
    };
  return {
    ...actual,
    getAllDrawMatchUps: counted(actual.getAllDrawMatchUps),
    getDrawMatchUps: counted(actual.getDrawMatchUps),
  };
});

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSchemaWriteMode(NATIVE);
  // `setSubscriptions({})` clears nothing (it is refused, MISSING_VALUE): an empty map is what clears
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
const inProgress = (scoreString: string) =>
  generateOutcomeFromScoreString({ scoreString, matchUpStatus: IN_PROGRESS }).outcome;

type Step = (matchUpId: string) => Record<string, unknown>;
const SHAPES: [string, Step[]][] = [
  ['an in-progress score', [() => ({ outcome: inProgress('3-2') })]],
  ['an in-progress score, corrected', [() => ({ outcome: inProgress('3-2') }), () => ({ outcome: inProgress('4-2') })]],
  [
    'a suspended match',
    [() => ({ outcome: generateOutcomeFromScoreString({ scoreString: '3-2', matchUpStatus: SUSPENDED }).outcome })],
  ],
  [
    'an in-progress score cleared',
    [() => ({ outcome: inProgress('3-2') }), () => ({ outcome: { matchUpStatus: TO_BE_PLAYED, score: undefined } })],
  ],
  ['a format change with a live score', [() => ({ outcome: inProgress('6-3 2-1'), matchUpFormat: 'SET5-S:6/TB7' })]],
  // the second call changes nothing but stamps: owned since S2 (F2 (i) stamps each touched entity once, as v1 does)
  ['the same score submitted twice', [() => ({ outcome: inProgress('3-2') }), () => ({ outcome: inProgress('3-2') })]],
  // S7: a schedule carried with the outcome, written as v1's writer writes it, before `scoredTime` is stamped onto it
  [
    'an in-progress score with a schedule',
    [() => ({ outcome: inProgress('3-2'), schedule: { scheduledDate: startDate(), scheduledTime: '10:00' } })],
  ],
  [
    'a schedule changed with a score correction',
    [
      () => ({ outcome: inProgress('3-2'), schedule: { scheduledDate: startDate(), scheduledTime: '10:00' } }),
      () => ({ outcome: inProgress('4-2'), schedule: { scheduledTime: '11:30', courtOrder: 2 } }),
    ],
  ],
  ['a winner with a schedule', [() => ({ outcome: { winningSide: 1 }, schedule: { scheduledDate: startDate() } })]],
  [
    'a result turned into a double exit, carrying a schedule',
    [
      () => ({ outcome: { matchUpStatus: WALKOVER, winningSide: 1 } }),
      () => ({ outcome: { matchUpStatus: DOUBLE_WALKOVER }, schedule: { scheduledDate: startDate() } }),
    ],
  ],
];

/** the tournament's first day, which a scheduled date must fall on or after */
function startDate() {
  return tournamentEngine.getTournament().tournamentRecord.startDate;
}

/** the steps on a first-round matchUp, from a fresh record, every topic subscribed and the clock fixed */
function play(mode: OutcomePipelineMode, steps: Step[], writeMode: SchemaWriteMode = NATIVE) {
  setSchemaWriteMode(writeMode);
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
  // what generating the record raised is not the call's: nobody was subscribed, so it would ride out with the first call
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((p) => notices.push(`${topic} ${canonicalJson(p)}`)),
      ]),
    ),
  });
  const { matchUpId } = tournamentEngine.allDrawMatchUps({ drawId: 'd', matchUpFilters: { roundNumbers: [1] } })
    .matchUps[0];
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  const results = steps.map((step, i) => {
    setClock(`2026-10-25T00:0${i + 1}:00.000Z`);
    return tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, ...step(matchUpId) });
  });
  return {
    // canonical: key order is not part of a record, and the reducer writes a matchUp's fields in its own order
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    v1Writes: v1Writes.count,
    notices,
    // a result's `stack` is the trail of the functions that answered it, which differ by construction
    results: results.map(({ stack: _stack, ...result }: any) => result),
  };
}

describe('under v2, a local write is v2s, and leaves exactly what v1 leaves', () => {
  it.each(SHAPES)('%s', (_label, steps) => {
    const v1 = play(OUTCOME_PIPELINE_V1, steps);
    const v2 = play(OUTCOME_PIPELINE_V2, steps);
    // CONTROL: v1 wrote through its own writer, and each step succeeded
    expect(v1.v1Writes).toEqual(steps.length);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.notices.length).toBeGreaterThan(0);

    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('a result turned into a double exit is v2s (S6)', () => {
  it('an exit corrected to a double exit: v2 writes the correction, and leaves what v1 leaves', () => {
    const walkover = { matchUpStatus: WALKOVER, winningSide: 1 };
    const doubleWalkover = { matchUpStatus: DOUBLE_WALKOVER };
    const steps = [() => ({ outcome: walkover }), () => ({ outcome: doubleWalkover })];
    const v1 = play(OUTCOME_PIPELINE_V1, steps);
    const v2 = play(OUTCOME_PIPELINE_V2, steps);
    expect(v1.v1Writes).toEqual(2);
    expect(v2.results.every((result: any) => result.success)).toEqual(true);
    // the walkover is v2's (S5) and so is the correction (`completed-to-double-exit`)
    expect(v2.v1Writes).toEqual(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    expect(v2.results).toEqual(v1.results);
  });
});

describe('what v2 does not own goes to v1, whole', () => {
  it('a schedule v1 refuses (a time that does not parse): v2 abstains, and v1 refuses it (S7)', () => {
    const steps: Step[] = [() => ({ outcome: { winningSide: 1 }, schedule: { scheduledTime: 'not a time' } })];
    const v1 = play(OUTCOME_PIPELINE_V1, steps);
    const v2 = play(OUTCOME_PIPELINE_V2, steps);
    expect(v1.results[0].error).toBeDefined();
    expect(v2.v1Writes).toEqual(1);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });

  it('a double exit asked for again, carrying a schedule: v1 writes the schedule alone, so v2 abstains (S7)', () => {
    const steps: Step[] = [
      () => ({ outcome: { matchUpStatus: DOUBLE_WALKOVER } }),
      () => ({ outcome: { matchUpStatus: DOUBLE_WALKOVER }, schedule: { scheduledDate: startDate() } }),
    ];
    const v1 = play(OUTCOME_PIPELINE_V1, steps);
    const v2 = play(OUTCOME_PIPELINE_V2, steps);
    expect(v2.v1Writes).toEqual(1);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });

  it('a schedule carrying a start and an end time: v1 writes them as timeItems, so v2 abstains (S7)', () => {
    const steps: Step[] = [() => ({ outcome: { winningSide: 1 }, schedule: { startTime: '10:00', endTime: '11:00' } })];
    const v1 = play(OUTCOME_PIPELINE_V1, steps);
    const v2 = play(OUTCOME_PIPELINE_V2, steps);
    expect(v2.v1Writes).toEqual(1);
    expect(v2.record).toEqual(v1.record);
  });

  it('BRIDGE: v1 writes `scoredTime` as a timeItem too, which the reducer does not, so v2 abstains', () => {
    const v1 = play(OUTCOME_PIPELINE_V1, SHAPES[0][1], BRIDGE);
    const v2 = play(OUTCOME_PIPELINE_V2, SHAPES[0][1], BRIDGE);
    expect(v2.v1Writes).toEqual(1);
    expect(v2.record).toEqual(v1.record);
  });
});

it('a schedule out of played order with the next matchUp: v1 refuses it against the stored draw, so v2 abstains (S7)', () => {
  const run = (mode: OutcomePipelineMode) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:00:00.000Z');
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawId: 'd' }],
      nonRandom: 1,
      setState: true,
    });
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true });
    const feeder = matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
    const next = matchUps.find((matchUp: any) => matchUp.matchUpId === feeder.winnerMatchUpId);
    const scheduledDate = startDate();
    tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate, scheduledTime: '10:00' },
      matchUpId: next.matchUpId,
      drawId: 'd',
    });
    setOutcomePipeline(mode);
    v1Writes.count = 0;
    const result: any = tournamentEngine.setMatchUpStatus({
      schedule: { scheduledDate, scheduledTime: '12:00' },
      matchUpId: feeder.matchUpId,
      outcome: { winningSide: 1 },
      drawId: 'd',
    });
    const { stack: _stack, ...answer } = result;
    return {
      answer,
      v1Writes: v1Writes.count,
      record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    };
  };
  const v1 = run(OUTCOME_PIPELINE_V1);
  const v2 = run(OUTCOME_PIPELINE_V2);
  expect(v1.answer.error).toBeDefined();
  expect(v2.v1Writes).toEqual(1);
  expect(v2.answer).toEqual(v1.answer);
  expect(v2.record).toEqual(v1.record);
});

it('an owned write takes no hydration when no one subscribes to the in-context matchUp', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: () => undefined } });
  const { matchUpId } = tournamentEngine.allDrawMatchUps({ drawId: 'd', matchUpFilters: { roundNumbers: [1] } })
    .matchUps[0];
  setOutcomePipeline(OUTCOME_PIPELINE_V2);
  v1Writes.count = 0;
  hydrations.count = 0;
  const result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: inProgress('3-2') });
  expect(result.success).toEqual(true);
  expect(v1Writes.count).toEqual(0);
  expect(hydrations.count).toEqual(0);
  // CONTROL: v1 hydrates for the same call
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  hydrations.count = 0;
  tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: inProgress('4-2') });
  expect(hydrations.count).toBeGreaterThan(0);
});

it('a result turned into a double exit takes no hydration: the double exit is planned on the working view (S6)', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: () => undefined } });
  const { matchUpId } = tournamentEngine.allDrawMatchUps({ drawId: 'd', matchUpFilters: { roundNumbers: [1] } })
    .matchUps[0];
  tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } });
  setOutcomePipeline(OUTCOME_PIPELINE_V2);
  v1Writes.count = 0;
  hydrations.count = 0;
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId: 'd',
    matchUpId,
  });
  expect(result.success).toEqual(true);
  expect(v1Writes.count).toEqual(0);
  expect(hydrations.count).toEqual(0);
});
