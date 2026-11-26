import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { storedGraph, storedRecord } from '@Tests/testHarness/outcome/objectGraph';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { TOPICS } from '@Tests/testHarness/outcome/directionFixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { createSeededRandom } from '@Tools/prng';
import { setClock } from '@Tools/clock';

// constants and types
import { DOMINANT_DUO, LAVER_CUP, USTA_COLLEGE } from '@Constants/tieFormatConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { MISSING_ASSIGNMENTS } from '@Constants/errorConditionConstants';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
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

// every recording asked for, and whether it was made
const recorder = vi.hoisted(() => ({ asked: 0, made: 0 }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) => {
    recorder.asked += 1;
    const recorded = actual.recordWholeCall(args);
    if (recorded) recorder.made += 1;
    return recorded;
  };
  return { ...actual, recordWholeCall };
});

/**
 * RECORDED, THE WHOLE CALL, FOR A TEAM DUAL OR LINE (batch 4b). The scenarios the planners abstain from, each with its
 * reason, are in `ownedTeamLineWrites.test.ts`. Here: what a recorded dual and its lines leave when they are written
 * together, call after call; the stamps a recorded line tells the call's ledger of; and what is still v1's.
 */

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const won = (winningSide: number, scoreString = '6-1 6-1') =>
  generateOutcomeFromScoreString({ scoreString, winningSide }).outcome;

type Call = { matchUpId: string; outcome: Record<string, unknown>; params?: Record<string, unknown> };

/** a TEAM draw under v1, its line-ups attached unless `bare` */
function generate(
  drawProfile: Record<string, unknown>,
  { bare, nonRandom = 1 }: { bare?: true; nonRandom?: number } = {},
) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, ...drawProfile, drawId: 'd' }],
    setState: true,
    nonRandom,
  });
  if (bare) return;
  expect(tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success).toEqual(
    true,
  );
}

const stored = () => structuredClone(tournamentEngine.getTournament().tournamentRecord) as Tournament;

const duals = () =>
  tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps.filter((m: any) => m.tieMatchUps);

const singles = (dual: any) => dual.tieMatchUps.filter((line: any) => line.matchUpType === 'SINGLES');

/** the calls from a copy of `prepared`, each its own engine call, or all in one (`queued`) */
function play(mode: OutcomePipelineMode, prepared: Tournament, calls: Call[], queued = false) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  tournamentEngine.setState(structuredClone(prepared));
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
  setOutcomePipeline(mode);
  setClock('2026-10-25T00:01:00.000Z');
  v1Writes.count = 0;
  recorder.asked = 0;
  recorder.made = 0;
  const methods = calls.map(({ matchUpId, outcome, params }) => ({
    params: { drawId: 'd', matchUpId, outcome: structuredClone(outcome), ...params },
    method: 'setMatchUpStatus',
  }));
  const results = queued
    ? [tournamentEngine.executionQueue(methods)]
    : methods.map(({ params }) => tournamentEngine.setMatchUpStatus(params));
  // v1's `stack` names its own functions: not compared, as nowhere else
  const returned = results.map(({ stack: _stack, ...result }: any) => {
    for (const each of result.results ?? []) delete each.stack;
    return result;
  });
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    // the stored record and the results object for object: a result can hold objects of the record
    graph: storedGraph(queued ? undefined : returned),
    results: canonicalJson(returned),
    v1Writes: v1Writes.count,
    asked: recorder.asked,
    made: recorder.made,
    notices,
  };
}

describe('a recorded line tells the ledger of its own stamp', () => {
  // The first call clears the dual's only line result: the planners abstain (`team`: the dual is left holding no
  // result), and the call is recorded, the line and its dual each by an op of its own. The second call, in the same
  // engine call, scores that line again: a stamp is once per entity per engine call, so the line keeps the stamp the
  // first call gave it. A dual's op that carried its lines with it stamped the line unseen, and the line was stamped
  // twice
  it('one engine call writing a line twice stamps it once', () => {
    generate({ drawSize: 4, drawType: SINGLE_ELIMINATION, tieFormatName: USTA_COLLEGE });
    const line = singles(duals()[0])[0];
    expect(
      tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: line.matchUpId, outcome: won(1) }).success,
    ).toEqual(true);
    const prepared = stored();
    const calls: Call[] = [
      { matchUpId: line.matchUpId, outcome: { matchUpStatus: TO_BE_PLAYED } },
      { matchUpId: line.matchUpId, outcome: won(2) },
    ];
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, calls, true);
    expect(JSON.parse(v1.results)[0].results.map((result: any) => result.success)).toEqual([true, true]);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode, prepared, calls, true);
      // the clear is recorded; the line's first result is one the planners write
      expect([actual.asked, actual.made]).toEqual([1, 1]);
      if (mode === OUTCOME_PIPELINE_V2) expect(actual.v1Writes).toEqual(0);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(actual.graph).toEqual(v1.graph);
    }
  });
});

/**
 * v1 returns a line's call its dual's tally (`tieMatchUpResult`). Where the dual's tieFormat declares its score
 * REPORTED, nothing is derived from the lines and the tally is the dual's own stored score: the very object. On the
 * copy that is the copy's object, and the recorded call returns the stored one (`returnedOnStored`).
 */
describe("a recorded line's result holds its dual's stored score, the very object", () => {
  // the stored dual itself, not the copy a query returns
  const storedDual = (matchUpId: string) =>
    storedRecord().events?.[0].drawDefinitions?.[0].structures?.[0].matchUps?.find(
      (matchUp) => matchUp.matchUpId === matchUpId,
    ) as MatchUp;

  it('a line of a dual whose tieFormat declares its score REPORTED', () => {
    generate({ drawSize: 4, drawType: SINGLE_ELIMINATION, tieFormatName: USTA_COLLEGE });
    const dual = duals()[0];
    const [first, second] = singles(dual);
    const { matchUpId } = dual;
    expect(
      tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: first.matchUpId, outcome: won(1) }).success,
    ).toEqual(true);
    const prepared = stored();
    const reported = prepared.events?.[0].drawDefinitions?.[0].structures?.[0].matchUps?.find(
      (matchUp) => matchUp.matchUpId === matchUpId,
    );
    // CONTROL: the dual stores its own tieFormat (copied on at its first line), which now declares a reported score
    expect(!!reported?.tieFormat).toEqual(true);
    Object.assign(reported?.tieFormat ?? {}, { scoreSource: 'REPORTED' });

    const calls: Call[] = [{ matchUpId: second.matchUpId, outcome: won(2) }];
    for (const mode of [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const) {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      tournamentEngine.setState(structuredClone(prepared), false);
      const held = storedDual(matchUpId).score;
      expect(held).toBeDefined();
      setOutcomePipeline(mode);
      setClock('2026-10-25T00:01:00.000Z');
      recorder.made = 0;
      v1Writes.count = 0;
      const result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', ...calls[0] });
      expect(result.success).toEqual(true);
      // the dual's score is the object it was, and the result holds it
      expect(storedDual(matchUpId).score).toBe(held);
      expect(result.tieMatchUpResult.score).toBe(held);
      if (mode === OUTCOME_PIPELINE_V2) expect([recorder.made, v1Writes.count]).toEqual([1, 0]);
    }
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, calls);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode, prepared, calls);
      expect([actual.asked, actual.made]).toEqual([1, 1]);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(actual.graph).toEqual(v1.graph);
    }
  });
});

describe("a TEAM call v1 refuses on the copy is not recorded, and is v1's", () => {
  // a line with no line-up assigned can be made a double exit, and v1 refuses the result entered over it
  it('a result entered over a double exit on a line with no line-up assigned (ERR_MISSING_ASSIGNMENTS)', () => {
    generate({ drawSize: 4, drawType: SINGLE_ELIMINATION, tieFormatName: USTA_COLLEGE }, { bare: true });
    const line = singles(duals()[0])[0];
    const doubleExit = { matchUpStatus: DOUBLE_WALKOVER };
    expect(
      tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: line.matchUpId, outcome: doubleExit }).success,
    ).toEqual(true);
    const prepared = stored();
    const calls: Call[] = [{ matchUpId: line.matchUpId, outcome: won(1) }];
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, calls);
    expect(JSON.parse(v1.results)[0].error.code).toEqual(MISSING_ASSIGNMENTS.code);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode, prepared, calls);
      // asked for (the planners abstain), and not made: v1's error on the copy is v1's answer, made on the stored record
      expect([actual.asked, actual.made]).toEqual([1, 0]);
      expect(actual.v1Writes).toEqual(v1.v1Writes);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(actual.graph).toEqual(v1.graph);
    }
  });

  // the same line never touched: the planners would plan its first result, and v1 refuses it before any write
  it.each([
    ['a winner alone', { winningSide: 1 }],
    ['a WALKOVER', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ])('%s on a line to be played with no line-up assigned (ERR_MISSING_ASSIGNMENTS)', (_label, outcome) => {
    generate({ drawSize: 4, drawType: SINGLE_ELIMINATION, tieFormatName: DOMINANT_DUO }, { bare: true });
    const line = singles(duals()[0])[0];
    const prepared = stored();
    const calls: Call[] = [{ matchUpId: line.matchUpId, outcome }];
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, calls);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode, prepared, calls);
      expect([actual.asked, actual.made]).toEqual([1, 0]);
      expect(JSON.parse(actual.results)[0].error.code).toEqual(MISSING_ASSIGNMENTS.code);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(actual.graph).toEqual(v1.graph);
    }
  });

  // v1's `validToScore` lets these through: v2 answers as v1 does
  it.each([
    ['one side assigned, a single exit', { matchUpStatus: DEFAULTED, winningSide: 1 }, undefined, true],
    ['no side assigned, the scoring policy not requiring participants', { winningSide: 1 }, false, false],
  ])('%s is accepted', (_label, outcome, requireParticipantsForScoring, oneSide) => {
    generate({ drawSize: 4, drawType: SINGLE_ELIMINATION, tieFormatName: DOMINANT_DUO }, { bare: true });
    if (requireParticipantsForScoring === false)
      tournamentEngine.attachPolicies({
        policyDefinitions: { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } },
      });
    const dual = duals()[0];
    const line = singles(dual)[0];
    if (oneSide) {
      const [individualParticipantId] = dual.sides[0].participant.individualParticipantIds;
      expect(
        tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId: line.matchUpId,
          drawId: 'd',
        }).success,
      ).toEqual(true);
    }
    const prepared = stored();
    const calls: Call[] = [{ matchUpId: line.matchUpId, outcome }];
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, calls);
    expect(JSON.parse(v1.results)[0].success).toEqual(true);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode, prepared, calls);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(actual.graph).toEqual(v1.graph);
    }
  });
});

/**
 * A line's double exit names no winner, so it is never routed `line-score`. On a dual decided by its own call (an exit,
 * or a winner alone) the lines then project no winner, and the dual keeps its winner (class 4): v1
 * writes the line and leaves the dual, and what it directed, as they stand. The planners abstain (`team`); the call is
 * recorded whole. (Before this rule v1 took the dual's winner back out of the next dual and tallied it in progress.)
 */
describe("a line's double exit on a dual decided by its own call is recorded, and the dual keeps its winner", () => {
  const nextDual = (record: string, matchUpId: string) =>
    JSON.parse(record).events[0].drawDefinitions[0].structures[0].matchUps.find(
      (matchUp: MatchUp) => matchUp.matchUpId === matchUpId,
    );

  it.each([
    [DOUBLE_DEFAULT, { matchUpStatus: DEFAULTED, winningSide: 2 }],
    [DOUBLE_WALKOVER, { matchUpStatus: DEFAULTED, winningSide: 2 }],
    [DOUBLE_WALKOVER, { matchUpStatus: WALKOVER, winningSide: 1 }],
    [DOUBLE_DEFAULT, { winningSide: 2 }],
  ])('a line %s on a dual decided by %j', (matchUpStatus, decided) => {
    generate({ drawSize: 4, drawType: SINGLE_ELIMINATION, tieFormatName: DOMINANT_DUO });
    const dual = duals().find((each: any) => each.roundNumber === 1);
    expect(
      tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: dual.matchUpId, outcome: decided }).success,
    ).toEqual(true);
    const prepared = stored();
    const calls: Call[] = [{ matchUpId: dual.tieMatchUps[0].matchUpId, outcome: { matchUpStatus } }];
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, calls);
    expect(JSON.parse(v1.results)[0].success).toEqual(true);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode, prepared, calls);
      expect([actual.asked, actual.made]).toEqual([1, 1]);
      if (mode === OUTCOME_PIPELINE_V2) expect(actual.v1Writes).toEqual(0);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(actual.graph).toEqual(v1.graph);
      // the dual keeps its winner, and that winner stands in the next dual
      expect(nextDual(actual.record, dual.matchUpId).winningSide).toEqual(decided.winningSide);
      expect((nextDual(actual.record, dual.winnerMatchUpId).drawPositions ?? []).filter(Boolean).length).toEqual(1);
    }
  });

  // the next dual holds the exit a neighbouring dual's own double exit produced there, awarded to this dual's winner:
  // the dual keeps its winner (class 4), so the award stands
  it("a line's double exit on a dual decided by its own call, its winner awarded a produced exit in the next dual", () => {
    generate({ drawSize: 8, drawType: SINGLE_ELIMINATION, tieFormatName: USTA_COLLEGE });
    const [, , third, fourth] = duals().filter((each: any) => each.roundNumber === 1);
    for (const [matchUpId, outcome] of [
      [third.matchUpId, { matchUpStatus: DOUBLE_DEFAULT }],
      [fourth.matchUpId, { winningSide: 2 }],
    ] as const)
      expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome }).success).toEqual(true);
    const prepared = stored();
    const calls: Call[] = [{ matchUpId: fourth.tieMatchUps[5].matchUpId, outcome: { matchUpStatus: DOUBLE_WALKOVER } }];
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, calls);
    expect(JSON.parse(v1.results)[0].success).toEqual(true);
    expect(nextDual(v1.record, fourth.matchUpId).winningSide).toEqual(2);
    expect((nextDual(v1.record, fourth.winnerMatchUpId).drawPositions ?? []).filter(Boolean).length).toEqual(1);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode, prepared, calls);
      expect([actual.asked, actual.made]).toEqual([1, 1]);
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
      expect(actual.graph).toEqual(v1.graph);
    }
  });
});

/**
 * A SEEDED WALK. Calls on duals and on lines, one after another: scores, bare winners, clears, single and double
 * exits, retirements, auto-calc switched off and on, exits carried or not. Each call is played from the record v1
 * leaves before it, under v1 and under v2. Wherever a recording was asked for (the planners abstained, or planned ops
 * that leave settle work), v2 leaves what v1 leaves: the stored record object for object (which objects are one object,
 * a dual's sides and line-ups, its lines, the draw's line-ups among them), the result, with the objects of the record
 * it holds, and the notices. A call the planners write whole is not this file's.
 */
const WALKS: [string, Record<string, unknown>, number][] = [
  ['SINGLE_ELIMINATION 8, USTA_COLLEGE', { drawSize: 8, tieFormatName: USTA_COLLEGE }, 1],
  ['SINGLE_ELIMINATION 8 of 7, LAVER_CUP', { drawSize: 8, participantsCount: 7, tieFormatName: LAVER_CUP }, 2],
  ['ROUND_ROBIN 4, USTA_COLLEGE', { drawSize: 4, drawType: ROUND_ROBIN, tieFormatName: USTA_COLLEGE }, 3],
  ['ROUND_ROBIN_WITH_PLAYOFF 8', { drawSize: 8, drawType: ROUND_ROBIN_WITH_PLAYOFF, tieFormatName: DOMINANT_DUO }, 4],
  ['FEED_IN_CHAMPIONSHIP 8', { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP, tieFormatName: DOMINANT_DUO }, 5],
  [
    'FIRST_MATCH_LOSER_CONSOLATION 8 of 6',
    { drawSize: 8, participantsCount: 6, drawType: FIRST_MATCH_LOSER_CONSOLATION, tieFormatName: DOMINANT_DUO },
    6,
  ],
  ['COMPASS 8', { drawSize: 8, drawType: COMPASS, tieFormatName: DOMINANT_DUO }, 7],
  ['DOUBLE_ELIMINATION 8', { drawSize: 8, drawType: DOUBLE_ELIMINATION, tieFormatName: DOMINANT_DUO }, 8],
];

const CLEARED = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

/** the walk's next call, on the draw as it stands */
function nextCall(random: () => number): Call {
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const side = pick([1, 2]);
  const all = duals();
  const structureNames = [...new Set(all.map((dual: any) => dual.structureName))];
  const structureName = pick(structureNames);
  const dual: any = pick(all.filter((each: any) => each.structureName === structureName));
  const carried = random() < 0.4 ? { propagateExitStatus: true } : {};
  const exits = [
    { matchUpStatus: WALKOVER, winningSide: side },
    { matchUpStatus: DEFAULTED, winningSide: side },
    { matchUpStatus: DOUBLE_WALKOVER },
    { matchUpStatus: DOUBLE_DEFAULT },
    { ...won(side, '6-1 2-1'), matchUpStatus: RETIRED },
  ];
  if (random() < 0.55) {
    const outcome = pick([won(side), won(side), won(side), won(side), { winningSide: side }, CLEARED, ...exits]);
    return { matchUpId: pick<any>(dual.tieMatchUps).matchUpId, outcome, params: carried };
  }
  const outcome = pick([
    { winningSide: side },
    { winningSide: side },
    CLEARED,
    { matchUpStatus: TO_BE_PLAYED },
    ...exits,
  ]);
  const flags = pick([
    {},
    {},
    {},
    { disableAutoCalc: true },
    { enableAutoCalc: true },
    { allowChangePropagation: true },
  ]);
  return { matchUpId: dual.matchUpId, outcome, params: { ...carried, ...flags } };
}

describe("along a seeded walk of a TEAM draw, a call a recording is asked for leaves what v1's write leaves", () => {
  it.each(WALKS)('%s', (_label, drawProfile, seed) => {
    generate(drawProfile, { nonRandom: seed });
    const random = createSeededRandom(seed);
    let record = stored();
    const total = { asked: 0, made: 0, owned: 0 };
    // 160 steps (was 120): a dual's exit awarded to its present team against a claimed empty seat is now refused
    // (option D), which shortened the DOUBLE_ELIMINATION 8 walk to 19 recordings made, under its floor of 20
    for (let step = 0; step < 160; step++) {
      tournamentEngine.setState(structuredClone(record));
      const call = nextCall(random);
      const v1 = play(OUTCOME_PIPELINE_V1, record, [call]);
      const next = stored();
      const v2 = play(OUTCOME_PIPELINE_V2, record, [call]);
      record = next;
      if (!v2.asked) continue;
      const context = `step ${step}: ${JSON.stringify(call)}`;
      expect(v2.results, context).toEqual(v1.results);
      expect(v2.record, context).toEqual(v1.record);
      expect(v2.notices, context).toEqual(v1.notices);
      expect(v2.graph, context).toEqual(v1.graph);
      total.asked += 1;
      total.made += v2.made;
      if (v2.made && !v2.v1Writes) total.owned += 1;
    }
    // the walk reaches what it is for: recordings asked for, made, and applied with v1 not asked
    expect(total.made).toBeGreaterThanOrEqual(20);
    expect(total.owned).toBeGreaterThanOrEqual(20);
  });
});

describe.each([DEFAULTED, WALKOVER, RETIRED])('replacing a stored %s', (matchUpStatus) => {
  for (const matchUpType of ['SINGLES', 'DOUBLES']) {
    for (const winningSide of [1, 2]) {
      it.each([true, false])(`on a ${matchUpType} line with side ${winningSide} winning, decisive=%s`, (decisive) => {
        generate({ drawSize: 2, tieFormatName: DOMINANT_DUO }, { bare: true });
        const prepared = stored();
        const dual = prepared.events![0].drawDefinitions![0].structures![0].matchUps![0];
        const line = dual.tieMatchUps!.find((m) => m.matchUpType === matchUpType)!;
        const oldWinner = 3 - winningSide;
        Object.assign(line, { matchUpStatus, winningSide: oldWinner });
        if (decisive) {
          // Split the other two points. The correction now hands a decided dual to the other side.
          dual
            .tieMatchUps!.filter((m) => m !== line)
            .forEach((m, i) => Object.assign(m, { matchUpStatus: WALKOVER, winningSide: i + 1 }));
        }
        const points = [1, 2].map((side) => Number(decisive) + Number(side === oldWinner));
        Object.assign(dual, {
          ...(decisive && { winningSide: oldWinner }),
          matchUpStatus: decisive ? 'COMPLETED' : 'IN_PROGRESS',
          score: {
            scoreStringSide1: points.join('-'),
            scoreStringSide2: [...points].reverse().join('-'),
            sets: [{ setNumber: 1, side1Score: points[0], side2Score: points[1] }],
          },
        });
        const directive = {
          method: 'setMatchUpStatus',
          params: {
            drawId: 'd',
            matchUpId: line.matchUpId,
            outcome: won(winningSide, matchUpType === 'DOUBLES' ? '8-1' : '6-1 6-1'),
          },
        };
        for (const mode of [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
          setOutcomePipeline(mode);
          expect(tournamentEngine.setState(structuredClone(prepared)).success).toBe(true);
          const before = canonicalJson(stored());
          const refused = tournamentEngine.executionQueue([structuredClone(directive)], false);
          expect(refused.error?.code).toBe(MISSING_ASSIGNMENTS.code);
          expect(canonicalJson(stored()) === before).toBe(true);

          // The same stored outcome and score correction, this time with both line-ups attached.
          expect(
            tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
          ).toBe(true);
          const accepted = tournamentEngine.executionQueue([structuredClone(directive)], false);
          expect(accepted.success).toBe(true);
          const corrected = duals()[0];
          expect(corrected.tieMatchUps.find((m) => m.matchUpId === line.matchUpId).winningSide).toBe(winningSide);
          expect(corrected.winningSide).toBe(decisive ? winningSide : undefined);
        }
      });
    }
  }
});
