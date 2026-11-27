import { getOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { DEAD_RUBBER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';

/**
 * `reconcileDecider` RETURNS THE ERROR OF THE WRITE IT MAKES.
 *
 * It was a bare call in a function that returned nothing. If the write to the decider failed, the
 * decider stayed as it was and `setMatchUpStatus` reported success — the caller was told the draw
 * was settled when it was not.
 *
 * ## This is FAULT INJECTION, and that is all it is
 *
 * The write is made to fail by replacing `modifyMatchUpScore`. Nothing in ordinary play makes it
 * fail here: the matchUp is handed to it directly. Over the 600 matrix cells under both policies —
 * 1,200 draws played to exhaustion — the engine returns NO error at all, so this test says nothing
 * about what the engine does in play. It pins one thing: IF the write fails, the caller hears of it.
 *
 * ## A KNOWN V1 RESIDUAL, not the design
 *
 * It does not assert the draw is unchanged, because v1 cannot yet provide it. By the time the decider is reconciled the
 * final has been scored, so a failure here is a refusal-after-write, which the rule (a method's error leaves the record
 * unchanged on a direct call, without `rollbackOnError`) forbids. The cascade builds in no snapshot or restore to hide
 * it. The decider's write cannot be asked before the final's (what it writes depends on the final's settled result), so
 * `reconcileDeciders` is on the outcome v2 executor plan's "v1 errors handed to v2" list: v2 must plan it as a refusal.
 * Its `positionTargets` error, the other one it can return, is impossible since a malformed round link anywhere in the
 * draw is refused before the first write (outcome-pipeline.md § 2 row 21). What this test pins is that the error is
 * never swallowed behind a success. Under v2 the call is run whole on a copy first, the same write fails there, and
 * the copy's refusal is the call's: v1 is not asked to write the stored record, so the record assertion holds.
 */

const forced = vi.hoisted(() => ({ context: undefined as string | undefined, hits: 0 }));
const FORCED_ERROR = { code: 'ERR_FORCED', message: 'forced by the test' };

vi.mock('@Mutate/matchUps/score/modifyMatchUpScore', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { inDraftWrites } = await import('@Global/state/withDraftWrites');
  return {
    ...actual,
    modifyMatchUpScore: (params: any) => {
      if (forced.context && params?.context === forced.context) {
        // v2 reads v1's write on a copy first, where the same write fails and its refusal is the call's (under v2);
        // the hit counted is one on the stored record, which only v1 and differential make
        if (!inDraftWrites()) forced.hits += 1;
        return { error: FORCED_ERROR };
      }
      return actual.modifyMatchUpScore(params);
    },
  };
});

/**
 * THE SAME FAULT, IN THE OUTCOME PIPELINE v2. Since BATCH 1 v2 owns the Main final's first entry: it seats the Decider and
 * settles it by ops, and never reaches the writer above. Its own write of the Decider is the settle op, and what can
 * fail there is the FOLD of that op. `forced.fold` makes it fail, after the ops before it have been folded.
 *
 * v2 folds a plan into the working view's COPIES before it writes the stored draw (`overlay.ts`, copy before write), so
 * the failure is met there: v2 gives the call up with the stored draw untouched, and it is written whole by whoever
 * takes it (v1, until v1 is retired; a refusal after). That is the rule this file's v1 case cannot provide.
 */
const fold = vi.hoisted(() => ({ on: false, working: 0, stored: 0 }));
vi.mock('@Mutate/matchUps/outcome/ops', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    applyOutcomeOps: (drawDefinition: any, ops: OutcomeOp[], stampedBefore: any, effects: any) => {
      const at = ops.findIndex((op) => op.op === 'setMatchUpResult' && op.matchUpStatus === 'DEAD_RUBBER');
      if (!fold.on || at < 0) return actual.applyOutcomeOps(drawDefinition, ops, stampedBefore, effects);
      // the stored apply binds the result's inputs (`applyOwnedPlan`); every other fold is of a copy
      if (effects?.bindResultInputs) fold.stored += 1;
      else fold.working += 1;
      const before = actual.applyOutcomeOps(drawDefinition, ops.slice(0, at), stampedBefore, effects);
      return before.error ? before : { error: 'forced by the test' };
    },
  };
});

afterEach(() => {
  forced.context = undefined;
  forced.hits = 0;
  Object.assign(fold, { on: false, working: 0, stored: 0 });
});

const DRAW_ID = 'decider-error';
const allMatchUps = (): any[] => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
const final = () => allMatchUps().find((matchUp) => matchUp.structureName === 'Main' && matchUp.roundNumber === 4);
const decider = () => allMatchUps().find((matchUp) => matchUp.structureName === 'Decider');

function playToTheFinal() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawType: DOUBLE_ELIMINATION, drawSize: 8 }],
    nonRandom: 7001,
    setState: true,
  });
  for (let guard = 0; guard < 40; guard++) {
    const next = allMatchUps().find(
      (matchUp) =>
        matchUp.matchUpId !== final().matchUpId &&
        matchUp.structureName !== 'Decider' &&
        matchUp.matchUpStatus === TO_BE_PLAYED &&
        !matchUp.winningSide &&
        (matchUp.sides ?? []).filter((side: any) => side.participantId).length === 2,
    );
    if (!next) break;
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: next.matchUpId,
      outcome: { winningSide: 1 },
      drawId: DRAW_ID,
    });
    expect(result.success).toEqual(true);
  }
  // CONTROL: the final is ready to be scored and the decider has not been settled
  expect((final().sides ?? []).filter((side: any) => side.participantId).length).toEqual(2);
  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
}

it('settles the decider and reports success when the write succeeds', () => {
  playToTheFinal();
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: final().matchUpId,
    outcome: { winningSide: 1 },
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);
  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);
  // CONTROL on the injection: with nothing forced, nothing was intercepted
  expect(forced.hits).toEqual(0);
});

it('returns the error when the write to the decider fails (v1 residual: the final stays scored)', () => {
  playToTheFinal();
  // every writer of the Decider is made to fail: v1's, and v2's fold of its settle op
  forced.context = 'reconcileDecider';
  fold.on = true;
  const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  const v2 = getOutcomePipeline() === OUTCOME_PIPELINE_V2;

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: final().matchUpId,
    outcome: { winningSide: 1 },
    drawId: DRAW_ID,
  });

  // CONTROL: the write was attempted, and it was the one made to fail: on the stored record by v1, on the copy by v2
  expect(forced.hits).toEqual(v2 ? 0 : 1);
  expect(result.success).toBeUndefined();
  expect(result.error).toEqual(FORCED_ERROR);
  // under v2 the refusal is met before any write: the final is not scored
  if (v2) expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  // v2 met its own failure first, on the copy, and never wrote the stored draw
  expect(fold.working).toEqual(getOutcomePipeline() === OUTCOME_PIPELINE_V1 ? 0 : 1);
  expect(fold.stored).toEqual(0);
});

it('v2: a settle op that cannot be folded is met on the working copy, and the stored draw is written whole', () => {
  playToTheFinal();
  const score = () =>
    tournamentEngine.setMatchUpStatus({ matchUpId: final().matchUpId, outcome: { winningSide: 1 }, drawId: DRAW_ID });
  const drawNow = () => {
    const draw = tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
    const timeless = (key: string, value: unknown) => (key === 'updatedAt' || key === 'scoredTime' ? undefined : value);
    return JSON.stringify(draw, timeless);
  };

  // the twin: the same record, the same call, nothing forced
  const before = tournamentEngine.getTournament().tournamentRecord;
  let result: any = score();
  expect(result.success).toEqual(true);
  const unforced = drawNow();
  tournamentEngine.setState(before);

  fold.on = true;
  result = score();
  // CONTROL: the fold was attempted and failed, once, on a copy; the stored draw never took the plan in part
  // (under v1 nothing is planned, so nothing is folded: the call is v1's, whole either way)
  expect(fold.working).toEqual(getOutcomePipeline() === OUTCOME_PIPELINE_V1 ? 0 : 1);
  expect(fold.stored).toEqual(0);
  // never a success over a draw half written: the call is whole, as the unforced one leaves it
  expect(result.success).toEqual(true);
  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);
  expect(drawNow()).toEqual(unforced);
});
