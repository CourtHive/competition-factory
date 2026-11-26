import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { OutcomePipelineDivergence } from '@Mutate/matchUps/outcome/differential';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  ABANDONED,
  CANCELLED,
  COMPLETED,
  INCOMPLETE,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A WRITE THAT SUBMITS NO REASON KEEPS THE REASONS THAT STILL DESCRIBE ITS RESULT; THE EXPLICIT CLEAR REMOVES THEM.
 *
 * A result entered with reasons stores them where attribution is explicit: `sideStatusCodes` for a side's exit,
 * `matchUpStatusCode` for a status that attributes to nobody. A later call on the same matchUp that submits none keeps
 * them where they still describe what it writes: the status takes a reason, and the side a reason names still exited.
 * `clearStatusCodes` removes them whatever is written.
 *
 * The claim is equality as well: the same two calls from the same record leave the same record, raise the same notices
 * and return the same results under `v1` and `v2`, and `differential` finds nothing to raise.
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

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  // `setSubscriptions({})` clears nothing (it is refused, MISSING_VALUE): an empty map is what clears
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS];
const blank = { scoreStringSide1: '', scoreStringSide2: '' };
const played = {
  scoreStringSide1: '3-2',
  scoreStringSide2: '2-3',
  sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }],
};

type Outcome = Record<string, unknown>;
const ENTERED: [string, Outcome][] = [
  ['a WALKOVER with a reason', { matchUpStatus: WALKOVER, winningSide: 1, sideStatusCodes: { 2: 'W1' } }],
  ['a DEFAULTED with a reason', { matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 2: 'DM' } }],
  ['a RETIRED with a reason', { matchUpStatus: RETIRED, winningSide: 1, sideStatusCodes: { 2: 'RJ' }, score: played }],
  ['a DOUBLE_WALKOVER with reasons', { matchUpStatus: DOUBLE_WALKOVER, sideStatusCodes: { 1: 'WOWO', 2: 'WOWO' } }],
  ['a DOUBLE_DEFAULT with reasons', { matchUpStatus: DOUBLE_DEFAULT, sideStatusCodes: { 1: 'DM', 2: 'DM' } }],
  ['an ABANDONED with a reason', { matchUpStatus: ABANDONED, matchUpStatusCode: 'X1' }],
];
/** the second call, and the status and winner it leaves (what the kept reasons are read against) */
const THEN: [string, Outcome, { matchUpStatus: string; winningSide?: number }][] = [
  [
    'cleared with the explicit clear',
    { matchUpStatus: TO_BE_PLAYED, score: blank, clearStatusCodes: true },
    { matchUpStatus: TO_BE_PLAYED },
  ],
  ['cleared with no reason', { matchUpStatus: TO_BE_PLAYED, score: blank }, { matchUpStatus: TO_BE_PLAYED }],
  [
    'a WALKOVER re-entered with the explicit clear',
    { matchUpStatus: WALKOVER, winningSide: 1, clearStatusCodes: true },
    { matchUpStatus: WALKOVER, winningSide: 1 },
  ],
  [
    'a WALKOVER re-entered with no reason',
    { matchUpStatus: WALKOVER, winningSide: 1 },
    { matchUpStatus: WALKOVER, winningSide: 1 },
  ],
  [
    'a WALKOVER for the other side',
    { matchUpStatus: WALKOVER, winningSide: 2 },
    { matchUpStatus: WALKOVER, winningSide: 2 },
  ],
  [
    'a DEFAULTED with no reason',
    { matchUpStatus: DEFAULTED, winningSide: 1 },
    { matchUpStatus: DEFAULTED, winningSide: 1 },
  ],
  ['a winner with no reason', { winningSide: 1 }, { matchUpStatus: COMPLETED, winningSide: 1 }],
  [
    'the other winner with the explicit clear',
    { winningSide: 2, clearStatusCodes: true },
    { matchUpStatus: COMPLETED, winningSide: 2 },
  ],
  ['a live score with no reason', { matchUpStatus: IN_PROGRESS, score: played }, { matchUpStatus: IN_PROGRESS }],
  ['a DOUBLE_WALKOVER with no reason', { matchUpStatus: DOUBLE_WALKOVER }, { matchUpStatus: DOUBLE_WALKOVER }],
];

/** the reasons the second call leaves, by the rule stated above, independently of the engine */
function expectedReasons(first: Outcome, second: Outcome, after: { matchUpStatus: string; winningSide?: number }) {
  if (second.clearStatusCodes) return {};
  const { matchUpStatus, winningSide } = after;
  if ([ABANDONED, CANCELLED, INCOMPLETE].includes(matchUpStatus))
    return first.matchUpStatusCode ? { matchUpStatusCode: first.matchUpStatusCode } : {};
  let exiting: number[] = [];
  if ([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus)) exiting = [1, 2];
  else if ([WALKOVER, DEFAULTED, RETIRED].includes(matchUpStatus) && winningSide) exiting = [3 - winningSide];
  const held = (first.sideStatusCodes ?? {}) as Record<number, string>;
  const kept = Object.fromEntries(exiting.filter((side) => held[side]).map((side) => [side, held[side]]));
  return Object.keys(kept).length ? { sideStatusCodes: kept } : {};
}

/** the two calls on a first-round matchUp, from a fresh record, under a fixed clock */
function play(mode: OutcomePipelineMode, outcomes: Outcome[]) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
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
  let divergence: string | undefined;
  const results: any[] = [];
  try {
    outcomes.forEach((outcome, i) => {
      setClock(`2026-10-25T00:0${i + 1}:00.000Z`);
      results.push(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome }));
    });
  } catch (error) {
    if (!(error instanceof OutcomePipelineDivergence)) throw error;
    divergence = error.message;
  }
  const record = tournamentEngine.getTournament().tournamentRecord;
  const matchUp = tournamentEngine.findMatchUp({ drawId: 'd', matchUpId, inContext: false }).matchUp;
  return {
    record: canonicalJson(record),
    reasons: {
      ...(matchUp.sideStatusCodes ? { sideStatusCodes: matchUp.sideStatusCodes } : {}),
      ...(matchUp.matchUpStatusCode ? { matchUpStatusCode: matchUp.matchUpStatusCode } : {}),
    },
    positional: 'matchUpStatusCodes' in matchUp,
    v1Writes: v1Writes.count,
    results: results.map(({ stack: _stack, ...result }: any) => result),
    divergence,
    notices,
  };
}

describe.each(ENTERED)('%s, then', (_entered, first) => {
  it.each(THEN)('%s: v2 leaves what v1 leaves', (_then, second, after) => {
    const v1 = play(OUTCOME_PIPELINE_V1, [first, second]);
    const v2 = play(OUTCOME_PIPELINE_V2, [first, second]);
    const differential = play(OUTCOME_PIPELINE_DIFFERENTIAL, [first, second]);
    // CONTROL: both calls succeeded, and v1 wrote each through its own writer
    expect(v1.results.map((result: any) => result.success)).toEqual([true, true]);
    expect(v1.v1Writes).toEqual(2);
    expect(v1.reasons).toEqual(expectedReasons(first, second, after));
    expect(v1.positional).toEqual(false);

    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    expect(differential.divergence).toBeUndefined();
    expect(differential.record).toEqual(v1.record);
  });
});

describe('a second call that submits no reason is v2s own', () => {
  it.each(
    // an ABANDONED re-entered as an exit is v1's for reasons of its own
    ENTERED.filter(([, first]) => first.matchUpStatus !== ABANDONED).flatMap(([entered, first]) =>
      THEN.filter(([label]) =>
        ['a WALKOVER re-entered with no reason', 'a winner with no reason', 'cleared with the explicit clear'].includes(
          label,
        ),
      ).map(([then, second, after]) => [`${entered}, then ${then}`, first, second, after] as const),
    ),
  )('%s', (_label, first, second, after) => {
    const v2 = play(OUTCOME_PIPELINE_V2, [first as Outcome, second as Outcome]);
    // only the first call, which submits reasons, is v1's (`status-codes`): the second is planned
    expect(v2.v1Writes).toEqual(1);
    expect(v2.reasons).toEqual(expectedReasons(first as Outcome, second as Outcome, after as any));
  });
});
