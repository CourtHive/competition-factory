import { withoutSettleTelemetry } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import {
  drawMatchUps,
  drawStructures,
  nothingChanged,
  objectsOf,
  readBefore,
  recordedOps,
  shapeOf,
  stampCopies,
  withNoticeMarks,
} from './recordedDiff';
import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { hasStaleScoredTime } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { withClockSourceReader, type ClockSourceReading } from '@Tools/clock';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { withAmbientRandomSource } from '@Tools/prng';
import { cloneState, restoreState } from '@Tools/cloneState';
import { stampedInThisCall } from '../ops';
import { Recording } from '../recording';

// constants and types
import type { BuildViewArgs, RecordCopy } from '../types';
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import type { OutcomeOp } from '../ops';

/**
 * RECORDED, THE WHOLE CALL (batch 3): a call the planners abstain from is read off v1's own write. Everything
 * `setMatchUpStatus` does once the call is accepted (`runV1`: the missing edges, `setMatchUpState` and all under it,
 * exit propagation, the settle passes) runs on a COPY of the record, with the call's own parameters, and what it
 * changed in the draw is returned as the recorded ops (`recordedDiff.ts`), with what it returned. The plan has no other
 * ops. Nothing here touches the stored record or the engine's notice state.
 *
 * Undefined, and the call stays v1's, wherever the copy's run is not known to be carried whole by those ops: more than
 * one tournament record; v1 returned an error or threw; it wrote outside the draw, changed the call's own parameters,
 * or added or moved a matchUp or a structure, a round robin's group or a dual's line among them; it buffered a notice
 * apply could not raise again; or its result holds an object of the copy whose stored counterpart is not known to
 * read as it does (`returnedOnStored`).
 *
 * A run whose forward settle STOPPED AT ITS BOUND is recorded as it stopped (CA, 2026-11-18): v1 succeeds there,
 * leaves what the pass did not reach for the next call, and says so in its `FORWARD_SETTLE_EXHAUSTED` warning, which
 * is in what the call returns. The program says so too (`forwardExhausted`), and is asked for no proof.
 *
 * A TEAM dual's call and a line's are recorded as any (batch 4b). v1 writes the line, its dual's tally
 * (`updateTieMatchUpScore`), the dual's own direction where the line decides or un-decides it, and the line-ups it
 * carries onto the next duals' sides and the draw's `lineUps` extension: all of it in the draw, so all of it ops.
 */
export type RecordedCall = {
  ops: OutcomeOp[];
  written: ResultType;
  /** asked only where a settle predicate finds work on `ops`: whether the passes themselves do (`settledOnCopy`) */
  provesSettled?: () => boolean;
};

/**
 * every structure and matchUp of the draw, where it stands; and the list each dual holds its lines in, which a recorded
 * dual keeps (`MATCHUP_CHILDREN`): a run that replaces it is not carried
 */
const placed = (drawDefinition: DrawDefinition): object[] => [
  ...drawStructures(drawDefinition),
  ...drawMatchUps(drawDefinition).flatMap((matchUp) =>
    matchUp.tieMatchUps ? [matchUp, matchUp.tieMatchUps] : [matchUp],
  ),
];

/**
 * v1's forward settle stopped at its bound (`settleForwardConsequences`, `PASS_LIMIT`): it warns, naming a matchUp it
 * did not reach, and leaves the rest of what the pass owes to the next call's settle
 */
const stoppedForward = (written: ResultType) =>
  !!written.warnings?.some((warning) => warning.code === FORWARD_SETTLE_EXHAUSTED);

/** the recorded program of a run that stopped there, saying so (`ops.ts` `announceRecorded.forwardExhausted`) */
const exhaustedProgram = (ops: OutcomeOp[]): OutcomeOp[] =>
  ops.map((op) => (op.op === 'announceRecorded' ? { ...op, forwardExhausted: true } : op));

/** every object under `root`, itself among them */
function objectsUnder(root: object): Set<object> {
  const found = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || found.has(value)) return;
    found.add(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(root);
  return found;
}

/**
 * v1's result, as v1 returns it on the STORED record. v1 on the copy returns objects of the copy where on the stored
 * record it returns the stored ones: a line's `tieMatchUpResult` carries its dual's own score where the dual's
 * tieFormat declares its score REPORTED (`updateTieMatchUpScore`). Each object of the copy the result holds is
 * replaced, where the run's own objects hold it (the result, and whatever the run built for it), by the stored object
 * it was copied from (`originals`): the object v1 holds there on the stored record, since v1 does to the stored record
 * what it did to the copy.
 *
 * That stored object is returned only where it will read as the copy's does. Either it does already, and holds the
 * stored counterparts of what the copy's holds: the run wrote nothing in it. Or the copy's is still in the draw, in
 * a matchUp, a structure or the draw's own fields, which the recorded ops replace: apply makes the stored object what
 * the copy's is, the same object (`Recording.mirror`). False, and the recording is not made, where neither holds: an
 * object the run changed and took out of the draw, or one outside the draw that does not read as its stored
 * counterpart (the event and the tournament record hold the draw, so they read as changed wherever the draw is).
 */
function returnedOnStored(written: ResultType, originals: WeakMap<object, object>, drawDefinition: DrawDefinition) {
  const storedOf = (held: object) => originals.get(held) ?? held;
  const reads = (copied: object, stored: object) => {
    if (shapeOf(copied) !== shapeOf(stored)) return false;
    const under = objectsOf(stored);
    return objectsOf(copied).every((held, at) => storedOf(held) === under[at]);
  };
  let inDraw: Set<object> | undefined;
  const replaced: [holder: Record<string, unknown>, key: string, stored: object][] = [];
  const seen = new Set<object>();
  const visit = (holder: Record<string, unknown>): boolean => {
    if (seen.has(holder)) return true;
    seen.add(holder);
    for (const [key, held] of Object.entries(holder)) {
      if (!held || typeof held !== 'object') continue;
      const stored = originals.get(held);
      // an object the run made, or the call's own (its score): v1 holds the very same on the stored record
      if (!stored) {
        if (!visit(held as Record<string, unknown>)) return false;
        continue;
      }
      if (!reads(held, stored)) {
        inDraw ??= objectsUnder(drawDefinition);
        if (!inDraw.has(held)) return false;
      }
      replaced.push([holder, key, stored]);
    }
    return true;
  };
  if (!visit(written as Record<string, unknown>)) return false;
  for (const [holder, key, stored] of replaced) holder[key] = stored;
  return true;
}

export function recordWholeCall(args: BuildViewArgs, sampledStamps?: Set<string>): RecordedCall | undefined {
  const { writeOnCopy, request } = args;
  if (!args.drawDefinition || !writeOnCopy) return undefined;
  const stampedBefore = sampledStamps ?? stampedInThisCall(args.drawDefinition);
  const requested = JSON.stringify(request);
  const kept = cloneState(request);
  const { copy, originals } = cloneState({
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    event: args.event,
  });
  const { tournamentRecord, drawDefinition, event } = copy as RecordCopy;
  const outside = () =>
    JSON.stringify({ tournamentRecord, event }, (_key, value) => (value === drawDefinition ? 0 : value));
  stampCopies(drawDefinition, stampedBefore);
  const recorded = withNoticeMarks((readMarks) =>
    withDraftWrites(() =>
      withoutSettleTelemetry(() => {
        // where every object of the copy stands as v1 is about to find it (`recording.ts`)
        const recording = new Recording(drawDefinition);
        const before = {
          ...readBefore(drawDefinition),
          placed: placed(drawDefinition),
          outside: outside(),
        };
        const ran = runOnCopy(args, { tournamentRecord, drawDefinition, event });
        if (!ran || ran.error) return undefined;
        const after = placed(drawDefinition);
        const moved = after.length !== before.placed.length || after.some((entity, at) => entity !== before.placed[at]);
        if (moved || outside() !== before.outside) return undefined;
        // a scored time v1 left stale is one the plan's own cleanup would clear (`finalizePlan`)
        if (after.some((entity) => hasStaleScoredTime(entity as MatchUp))) return undefined;
        const ops = recordedOps({ drawDefinition, recording, before, marks: readMarks() });
        // last: the ops are read off the copy as the run left it, before the result is given the stored objects
        if (!ops || !returnedOnStored(ran, originals, drawDefinition)) return undefined;
        // stopped at the forward bound: what the pass left is v1's to leave, and running it again would do the rest
        if (stoppedForward(ran)) return { ops: exhaustedProgram(ops), written: ran };
        const provesSettled = () => settledOnCopy(args, { tournamentRecord, drawDefinition, event }, outside);
        return { ops, written: ran, provesSettled };
      }),
    ),
  );
  if (JSON.stringify(request) === requested) return recorded;
  // v1 wrote into the call's own parameters, which the stored record's write is handed next: they are put back
  restoreState(kept);
  return undefined;
}

/**
 * THE FIXPOINT, PROVED ON THE COPY. A has-work predicate (`settleWork.ts`) reads the working view a program leaves and
 * may find work where the pass it stands for has none: it is an approximation, kept on the safe side. Where one finds
 * work on a recording, the passes themselves are asked: the settle passes (`settleAfterWrite`) run once more on the
 * copy as v1's run left it, with the readings taken of it as it then stands, as the next call's settle would take them
 * (the same answer was measured with the readings v1's own run was handed). True only if that run changes NOTHING
 * AT ALL, by the measure the recorder takes of a change (`nothingChanged`: every entity's own fields and the objects
 * that hold them, so no field and no stamp; no notice buffered), and returns no error and no warning, stops at no
 * bound, adds or moves no entity, writes nothing outside the draw or into the call's parameters, marks no tournament
 * or topic modified, and reads neither the clock nor the random source. Then v1's write is settled: the passes have
 * no work on it, whatever a predicate says.
 *
 * The run is handed neither source: a read is answered with a placeholder and counted, and the proof fails. So the
 * instants and the draws the copy's first run kept are the call's, and v1 on the stored record is handed exactly
 * those (`replayedInstants.ts`, `replayedDraws.ts`). False changes nothing either: the recording is dropped, as it was.
 */
function settledOnCopy(args: BuildViewArgs, copy: RecordCopy, outside: () => string): boolean {
  const settle = args.settleOnCopy;
  if (!settle) return false;
  const requested = JSON.stringify(args.request);
  return withNoticeMarks((readMarks) =>
    withDraftWrites(() =>
      withoutSettleTelemetry(() => {
        const before = { ...readBefore(copy.drawDefinition), placed: placed(copy.drawDefinition), outside: outside() };
        let reads = 0;
        const unread: ClockSourceReading = { ms: 0 };
        let again: ReturnType<typeof settle>;
        try {
          again = withClockSourceReader(
            () => ((reads += 1), unread),
            () =>
              withAmbientRandomSource(
                () => ((reads += 1), 0),
                () => settle(copy),
              ),
          );
        } catch {
          return false;
        }
        if (!again || again.error || again.exhausted || again.warnings?.length || reads) return false;
        const after = placed(copy.drawDefinition);
        if (after.length !== before.placed.length || after.some((entity, at) => entity !== before.placed[at]))
          return false;
        if (outside() !== before.outside || JSON.stringify(args.request) !== requested) return false;
        const marks = readMarks();
        if (marks?.tournamentIds.length || marks?.topics.length) return false;
        return nothingChanged(copy.drawDefinition, before);
      }),
    ),
  );
}

/** a throw is v1's to make on the stored record, as it makes it today */
function runOnCopy(args: BuildViewArgs, copy: RecordCopy) {
  try {
    return args.writeOnCopy?.(copy);
  } catch {
    return undefined;
  }
}
