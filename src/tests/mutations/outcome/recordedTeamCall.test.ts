import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { storedGraph } from '@Tests/testHarness/outcome/objectGraph';
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
import type { Tournament } from '@Types/tournamentTypes';
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
    for (let step = 0; step < 120; step++) {
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
