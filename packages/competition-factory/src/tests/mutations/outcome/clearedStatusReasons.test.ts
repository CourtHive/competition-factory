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
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * THE REASONS A MATCHUP KEEPS GO WHEN ITS WRITE IS HANDED CODES NAMING NONE (spec § 4 rule 3).
 *
 * A result entered with status codes stores its reason where attribution is explicit: `sideStatusCodes` for a side's
 * exit, `matchUpStatusCode` for a status that attributes to nobody. v1's write splits whatever array it is handed, so an
 * array with no reason in it (`[]`, the call's own, or the one the winner route always passes) deletes both; a write
 * handed no array leaves them standing. v2 planned the display array alone and kept the reasons.
 *
 * The claim is equality: the same two calls from the same record leave the same record, raise the same notices and
 * return the same results under `v1` and `v2`, and `differential` finds nothing to raise. Ownership is asserted
 * separately, by counting v1's writer, for the clears, re-entries and winners v2 plans.
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
  ['a WALKOVER with a reason', { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['W1'] }],
  ['a DEFAULTED with a reason', { matchUpStatus: DEFAULTED, winningSide: 1, matchUpStatusCodes: ['DM'] }],
  ['a RETIRED with a reason', { matchUpStatus: RETIRED, winningSide: 1, matchUpStatusCodes: ['RJ'], score: played }],
  ['a DOUBLE_WALKOVER with reasons', { matchUpStatus: DOUBLE_WALKOVER, matchUpStatusCodes: ['WOWO', 'WOWO'] }],
  ['a DOUBLE_DEFAULT with reasons', { matchUpStatus: DOUBLE_DEFAULT, matchUpStatusCodes: ['DM', 'DM'] }],
  ['an ABANDONED with a reason', { matchUpStatus: ABANDONED, matchUpStatusCodes: ['X1'] }],
];
/** the second call, and whether v1's write is handed an array (so the kept reasons go) */
const THEN: [string, Outcome, boolean][] = [
  ['cleared with codes []', { matchUpStatus: TO_BE_PLAYED, score: blank, matchUpStatusCodes: [] }, true],
  ['cleared with codes omitted', { matchUpStatus: TO_BE_PLAYED, score: blank }, false],
  ['cleared with codes undefined', { matchUpStatus: TO_BE_PLAYED, score: blank, matchUpStatusCodes: undefined }, false],
  ['a WALKOVER re-entered with codes []', { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: [] }, true],
  ['a WALKOVER re-entered with codes omitted', { matchUpStatus: WALKOVER, winningSide: 1 }, true],
  ['a WALKOVER for the other side', { matchUpStatus: WALKOVER, winningSide: 2 }, true],
  ['a DEFAULTED with codes omitted', { matchUpStatus: DEFAULTED, winningSide: 1 }, true],
  ['a winner with codes omitted', { winningSide: 1 }, true],
  ['the other winner with codes []', { winningSide: 2, matchUpStatusCodes: [] }, true],
  ['a live score with codes omitted', { matchUpStatus: IN_PROGRESS, score: played }, false],
  ['a live score with codes []', { matchUpStatus: IN_PROGRESS, score: played, matchUpStatusCodes: [] }, true],
  ['a DOUBLE_WALKOVER with codes omitted', { matchUpStatus: DOUBLE_WALKOVER }, false],
];

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
    keepsReasons: 'sideStatusCodes' in matchUp || 'matchUpStatusCode' in matchUp,
    v1Writes: v1Writes.count,
    results: results.map(({ stack: _stack, ...result }: any) => result),
    divergence,
    notices,
  };
}

describe.each(ENTERED)('%s, then', (_entered, first) => {
  it.each(THEN)('%s: v2 leaves what v1 leaves', (_then, second, handedCodes) => {
    const v1 = play(OUTCOME_PIPELINE_V1, [first, second]);
    const v2 = play(OUTCOME_PIPELINE_V2, [first, second]);
    const differential = play(OUTCOME_PIPELINE_DIFFERENTIAL, [first, second]);
    // CONTROL: both calls succeeded, and v1 wrote each through its own writer
    expect(v1.results.map((result: any) => result.success)).toEqual([true, true]);
    expect(v1.v1Writes).toEqual(2);
    // a write handed an array naming no reason deletes what was kept
    if (handedCodes) expect(v1.keepsReasons).toEqual(false);

    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    expect(differential.divergence).toBeUndefined();
    expect(differential.record).toEqual(v1.record);
  });
});

describe('the write that deletes the kept reasons is v2s own', () => {
  const exits = ENTERED.filter(([, first]) => first.matchUpStatus !== ABANDONED);
  const deleting = THEN.filter(([label]) =>
    ['cleared with codes []', 'a WALKOVER re-entered with codes []', 'a winner with codes omitted'].includes(label),
  );
  it.each(
    exits.flatMap(([entered, first]) => deleting.map(([then, second]) => [`${entered}, then ${then}`, first, second])),
  )('%s', (_label, first, second) => {
    const v2 = play(OUTCOME_PIPELINE_V2, [first as Outcome, second as Outcome]);
    // only the first call, which carries the client's codes, is v1's (`status-codes`): the second is planned
    expect(v2.v1Writes).toEqual(1);
    expect(v2.keepsReasons).toEqual(false);
  });
});
