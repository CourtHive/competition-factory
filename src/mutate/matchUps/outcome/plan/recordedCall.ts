import { withoutSettleTelemetry } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { drawMatchUps, drawStructures, readBefore, recordedOps, stampCopies, withNoticeMarks } from './recordedDiff';
import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { hasStaleScoredTime } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { withDraftWrites } from '@Global/state/withDraftWrites';
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
 * one tournament record; v1 returned an error, threw, or stopped its forward settle at the bound; it wrote outside the
 * draw, changed the call's own parameters, or added or moved a matchUp or a structure, a round robin's group or a
 * dual's line among them; it buffered a notice apply could not raise again; or its result holds an object of the copy.
 *
 * A TEAM dual's call and a line's are recorded as any (batch 4b). v1 writes the line, its dual's tally
 * (`updateTieMatchUpScore`), the dual's own direction where the line decides or un-decides it, and the line-ups it
 * carries onto the next duals' sides and the draw's `lineUps` extension: all of it in the draw, so all of it ops.
 */
export type RecordedCall = { ops: OutcomeOp[]; written: ResultType };

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

/** v1's forward settle stopped at its bound: it warns, and leaves work this plan would not show */
const unsettled = (written: ResultType) =>
  !!written.warnings?.some((warning) => warning.code === FORWARD_SETTLE_EXHAUSTED);

function holdsCopy(recording: Recording, written: unknown): boolean {
  const seen = new Set<object>();
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    return recording.holds(value) || Object.values(value).some(visit);
  };
  return visit(written);
}

export function recordWholeCall(args: BuildViewArgs): RecordedCall | undefined {
  const { writeOnCopy, request } = args;
  if (!args.drawDefinition || !writeOnCopy) return undefined;
  const stampedBefore = stampedInThisCall(args.drawDefinition);
  const requested = JSON.stringify(request);
  const kept = cloneState(request);
  const { copy } = cloneState({
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
        if (!ran || ran.error || unsettled(ran)) return undefined;
        const after = placed(drawDefinition);
        const moved = after.length !== before.placed.length || after.some((entity, at) => entity !== before.placed[at]);
        if (moved || outside() !== before.outside) return undefined;
        if (holdsCopy(recording, ran)) return undefined;
        // a scored time v1 left stale is one the plan's own cleanup would clear (`finalizePlan`)
        if (after.some((entity) => hasStaleScoredTime(entity as MatchUp))) return undefined;
        const ops = recordedOps({ drawDefinition, recording, before, marks: readMarks() });
        return ops && { ops, written: ran };
      }),
    ),
  );
  if (JSON.stringify(request) === requested) return recorded;
  // v1 wrote into the call's own parameters, which the stored record's write is handed next: they are put back
  restoreState(kept);
  return undefined;
}

/** a throw is v1's to make on the stored record, as it makes it today */
function runOnCopy(args: BuildViewArgs, copy: RecordCopy) {
  try {
    return args.writeOnCopy?.(copy);
  } catch {
    return undefined;
  }
}
