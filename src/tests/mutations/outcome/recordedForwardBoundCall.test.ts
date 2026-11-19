import { expectRecordedWhole, playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
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

// CONTROL: with `refuse` set no recording is made, and the call's answer is the abstention its planners returned
const recorder = vi.hoisted(() => ({ refuse: false }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) =>
    recorder.refuse ? undefined : actual.recordWholeCall(args);
  return { ...actual, recordWholeCall };
});

afterEach(() => {
  recorder.refuse = false;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

/**
 * A CALL WHOSE FORWARD SETTLE STOPS AT ITS BOUND IS RECORDED WHOLE, AS IT STOPPED (CA, 2026-11-18;
 * `outcome/plan/recordedCall.ts`, `announceRecorded.forwardExhausted`).
 *
 * v1's forward settle acts on one owed answer per pass and stops after 64 passes (`settleForwardConsequences`,
 * `PASS_LIMIT`). A call that stops there succeeds, leaves the rest for the next call's settle, and returns a
 * `FORWARD_SETTLE_EXHAUSTED` warning naming a matchUp it did not reach. The recorder used to discard such a run, and the
 * call stayed v1's. It is v2's now: the recorded ops are v1's write as it stopped, the call returns v1's result, the
 * warning in it, and the forward pass's predicate is not asked of the program (what it finds is what v1 leaves).
 *
 * No play owes 64 forward answers at once, so the record is written by hand, as
 * `aForwardSettleStoppedAtItsBoundSaysSo` writes it: a SINGLE_ELIMINATION 256 with every first-round matchUp decided
 * and every second-round matchUp emptied of its drawPositions owes 128 winner advances. Re-scoring one first-round
 * matchUp advances its own winner; the settle places 64 more and stops.
 */

const DRAW_ID = 'forward-bound';
const structureOf = (record: any) => record.events[0].drawDefinitions[0].structures[0];
const firstRound = (record: any) => structureOf(record).matchUps.filter((matchUp: any) => matchUp.roundNumber === 1);
const advanced = (record: any) =>
  structureOf(record)
    .matchUps.filter((matchUp: any) => matchUp.roundNumber === 2)
    .reduce((count: number, matchUp: any) => count + (matchUp.drawPositions ?? []).filter(Boolean).length, 0);
const rescored = (matchUp: any) => ({
  outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: matchUp.winningSide })
    .outcome,
  matchUpId: matchUp.matchUpId,
  drawId: DRAW_ID,
});
const exhausted = (result: any) =>
  (result.warnings ?? []).filter((warning: any) => warning.code === FORWARD_SETTLE_EXHAUSTED);

/** the hand-written record, and the first-round matchUps the calls re-score */
const owing = (calls: number) => {
  let later: Record<string, unknown>[] = [];
  const prepared = prepareCall(() => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 256, drawId: DRAW_ID, completionGoal: 128 }],
      nonRandom: 1,
    });
    for (const matchUp of structureOf(tournamentRecord).matchUps)
      if (matchUp.roundNumber === 2) matchUp.drawPositions = [];
    expect(tournamentEngine.setState(tournamentRecord).success).toEqual(true);
    expect(advanced(tournamentRecord)).toEqual(0);
    const [first, ...rest] = firstRound(tournamentRecord).slice(0, calls).map(rescored);
    later = rest;
    return first;
  });
  return { prepared, later };
};

describe('a call whose forward settle stops at its bound is recorded whole', () => {
  it('the planners abstain `route`, and v2 leaves the record, the notices and the result v1 leaves, the warning among them', () => {
    const { prepared } = owing(1);
    const v1 = expectRecordedWhole(prepared, 'route', recorder);
    // CONTROL: v1 stopped at the bound: it warns of one matchUp, having placed the call's winner and 64 more
    expect(exhausted(v1.result)).toHaveLength(1);
    expect(exhausted(v1.result)[0].matchUpIds).toHaveLength(1);
    expect(advanced(JSON.parse(v1.record))).toEqual(65);

    // the matchUp it names is one whose winner was not reached, in every mode
    const v2 = playCall(OUTCOME_PIPELINE_V2, prepared);
    expect(v2.v1Writes).toEqual(0);
    expect(exhausted(v2.result)).toEqual(exhausted(v1.result));
    const record = JSON.parse(v2.record);
    const owed = firstRound(record).find((matchUp: any) => matchUp.matchUpId === exhausted(v2.result)[0].matchUpIds[0]);
    const next = structureOf(record).matchUps.find((matchUp: any) => matchUp.matchUpId === owed.winnerMatchUpId);
    expect(owed.winningSide).toBeDefined();
    expect(next.drawPositions ?? []).not.toContain(owed.drawPositions[owed.winningSide - 1]);
  }, 180_000);

  it('the next call settles what the bound left, in every mode, and leaves what v1 leaves', () => {
    const { prepared, later } = owing(2);
    // both calls on one record, each in `mode`: the stopped call first, then the one that settles the rest
    const play = (mode: OutcomePipelineMode) => {
      const stopped = playCall(mode, prepared);
      setOutcomePipeline(mode);
      v1Writes.count = 0;
      const { stack: _stack, ...result }: any = tournamentEngine.setMatchUpStatus(structuredClone(later[0]));
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      const record = canonicalJson(tournamentEngine.getTournament().tournamentRecord);
      return { stopped: stopped.result, result, record, v1Writes: v1Writes.count };
    };
    const v1 = play(OUTCOME_PIPELINE_V1);
    // CONTROL: the first call stopped at the bound, the second settled the rest and warns of nothing
    expect(exhausted(v1.stopped)).toHaveLength(1);
    expect(v1.result.success).toEqual(true);
    expect(exhausted(v1.result)).toEqual([]);
    expect(advanced(JSON.parse(v1.record))).toEqual(128);

    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const actual = play(mode);
      expect({ ...actual, v1Writes: 0 }).toEqual({ ...v1, v1Writes: 0 });
    }
  }, 180_000);
});
