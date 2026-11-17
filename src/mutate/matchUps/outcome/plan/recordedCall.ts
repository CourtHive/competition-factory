import { withoutSettleTelemetry } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { drawMatchUps, readBefore, recordedOps, stampCopies, withNoticeMarks } from './recordedDiff';
import { structuresOf } from '@Helpers/drawTopology/structureMembers';
import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { cloneState, restoreState } from '@Tools/cloneState';
import { stampedInThisCall } from '../ops';
import { Recording } from '../recording';

// constants and types
import type { BuildViewArgs, OutcomeView, RecordCopy } from '../types';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import type { OutcomeOp } from '../ops';

/**
 * RECORDED, THE WHOLE CALL (batch 3): a call the planners abstain from is read off v1's own write. Everything
 * `setMatchUpStatus` does once the call is accepted (`runV1`: the missing edges, `setMatchUpState` and all under it,
 * exit propagation, the settle passes) runs on a COPY of the record, with the call's own parameters, and what it
 * changed in the draw is returned as the recorded ops (`recordedDiff.ts`), with what it returned. The plan has no other
 * ops. Nothing here touches the stored record or the engine's notice state.
 *
 * Undefined, and the call stays v1's, wherever the copy's run is not known to be carried whole by those ops: a TEAM
 * dual or line; more than one tournament record; v1 returned an error, threw, or stopped its forward settle at the
 * bound; it wrote outside the draw, changed the call's own parameters, added or moved a matchUp or a structure, or
 * wrote a round robin group's own fields; it buffered a notice apply could not raise again; or its result holds an
 * object of the copy.
 */
export type RecordedCall = { ops: OutcomeOp[]; written: ResultType };

/** a draw's nested structures (a round robin's groups), whose own fields no recorded op carries */
function nestedState(drawDefinition: DrawDefinition): string {
  const nested = (drawDefinition.structures ?? []).flatMap((structure) => structuresOf(structure) ?? []);
  return JSON.stringify(nested, (key, value) => (key === 'matchUps' ? 0 : value));
}

const placed = (drawDefinition: DrawDefinition) => [
  ...(drawDefinition.structures ?? []),
  ...drawMatchUps(drawDefinition),
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

export function recordWholeCall(args: BuildViewArgs, view: OutcomeView): RecordedCall | undefined {
  const { writeOnCopy, request } = args;
  if (!args.drawDefinition || !writeOnCopy || view.isTeam || view.line) return undefined;
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
          nested: nestedState(drawDefinition),
          placed: placed(drawDefinition),
          outside: outside(),
        };
        const ran = runOnCopy(args, { tournamentRecord, drawDefinition, event });
        if (!ran || ran.error || unsettled(ran)) return undefined;
        const after = placed(drawDefinition);
        const moved = after.length !== before.placed.length || after.some((entity, at) => entity !== before.placed[at]);
        if (moved || outside() !== before.outside || nestedState(drawDefinition) !== before.nested) return undefined;
        if (holdsCopy(recording, ran)) return undefined;
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
