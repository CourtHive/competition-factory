import { drawMatchUps, drawStructures, readBefore, recordedOps, stampCopies, withNoticeMarks } from './recordedDiff';
import { withoutSettleTelemetry } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { getOutcomePipeline } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { replayedInstants } from '@Tools/replayedInstants';
import { replayedDraws } from '@Tools/replayedDraws';
import { cloneState } from '@Tools/cloneState';
import { stampedInThisCall } from '../ops';
import { applyOwnedPlan } from '../apply';
import { Recording } from '../recording';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import type { ResultType } from '@Types/factoryTypes';
import type { OutcomeOp } from '../ops';

/** the records one unit's write is made on: the stored ones, or the copy a unit is planned on */
export type UnitRecords = { tournamentRecord: Tournament; drawDefinition: DrawDefinition; event?: Event };

/**
 * ONE UNIT OF A BULK OUTCOME OR AN AD HOC RESET, OWNED WHOLE. A unit is one bulk
 * outcome, or the reset of one ad hoc matchUp: its scorecard, its line-ups, its blank outcome and its side removals.
 *
 * Planned on a COPY of the record, as the recorder plans a call it has no native plan for (`recordedCall.ts`): the
 * unit's writers run on the copy, and what they changed in the draw is read off it as ops (`recordedDiff.ts`). A unit
 * the copy refuses is returned refused, and the stored record is untouched: a refusal raised after one of the unit's
 * writes, on a TEAM line-up or a later outcome of the unit, is met on the copy. An accepted unit's ops are applied to
 * the stored draw by the outcome reducer (`applyOwnedPlan`), which looks nothing up, validates nothing and reads no
 * clock. The unit's notices are raised again in their order (`announceRecorded`), and its stamps are the instants
 * the copy took, as data.
 *
 * `rehearsed`: the copy accepted the unit, but its write is not carried by ops (it wrote outside the draw, or added or
 * moved a matchUp or a structure). The unit then runs on the stored record with the copy's random draws and clock
 * readings, so it makes the same choices and stamps the same instants. `thrown`: a programming error on the copy, met
 * again on the stored record (a programming error is fixed, not masked). Both are counted (`takeUnitTally`).
 */
export type PlannedUnit =
  | { refused: ResultType }
  | { ops: OutcomeOp[]; result: ResultType; records: UnitRecords; matchUpId: string }
  | { rehearsed: true; run: () => ResultType };

export type UnitRun = (records: UnitRecords) => ResultType;

const tally = { native: 0, owned: 0, refused: 0, rehearsed: 0 };

/**
 * how many units v2 decided as one call (`native`: refused or written by v2's own decision), and how many were owned as
 * ops, refused on their copy, or rehearsed, since the last read; for the gate's tests
 */
export function takeUnitTally() {
  const taken = { ...tally };
  tally.native = tally.owned = tally.refused = tally.rehearsed = 0;
  return taken;
}

/** every structure and matchUp of the draw, where it stands, and the list each dual holds its lines in */
const placed = (drawDefinition: DrawDefinition): object[] => [
  ...drawStructures(drawDefinition),
  ...drawMatchUps(drawDefinition).flatMap((matchUp) =>
    matchUp.tieMatchUps ? [matchUp, matchUp.tieMatchUps] : [matchUp],
  ),
];

export function planUnit({ records, matchUpId, run }: { records: UnitRecords; matchUpId: string; run: UnitRun }) {
  const stampedBefore = stampedInThisCall(records.drawDefinition);
  const draws = replayedDraws();
  const instants = replayedInstants();
  const { copy } = cloneState(records);
  const { tournamentRecord, drawDefinition, event } = copy;
  const outside = () =>
    JSON.stringify({ tournamentRecord, event }, (_key, value) => (value === drawDefinition ? 0 : value));
  // run again on the stored record: with the copy's draws and instants, its settle passes counted once
  const rehearsed = (): PlannedUnit => {
    tally.rehearsed += 1;
    return {
      rehearsed: true,
      run: () => draws.replay(() => instants.replay(() => withoutSettleTelemetry(() => run(records)))),
    };
  };
  stampCopies(drawDefinition, stampedBefore);
  let threw = false;
  const planned = withNoticeMarks((readMarks) =>
    withDraftWrites((): PlannedUnit | undefined => {
      const recording = new Recording(drawDefinition);
      const before = { ...readBefore(drawDefinition), placed: placed(drawDefinition), outside: outside() };
      let ran: ResultType | undefined;
      try {
        ran = draws.record(() => instants.record(() => run(copy)));
      } catch {
        threw = true;
        return undefined;
      }
      if (!ran) return undefined;
      if (ran.error) return { refused: ran };
      const after = placed(drawDefinition);
      const moved = after.length !== before.placed.length || after.some((entity, at) => entity !== before.placed[at]);
      if (moved || outside() !== before.outside) return undefined;
      const ops = recordedOps({ drawDefinition, recording, before, marks: readMarks() });
      return ops ? { ops, result: ran, records, matchUpId } : undefined;
    }),
  );
  if (threw) return { rehearsed: true, run: () => run(records) } as PlannedUnit;
  if (!planned) return rehearsed();
  if ('refused' in planned) tally.refused += 1;
  else tally.owned += 1;
  return planned;
}

/** an accepted unit, written: its ops folded into the stored draw, or its rehearsed run on the stored record */
export function applyUnit(planned: Exclude<PlannedUnit, { refused: ResultType }>): ResultType {
  if ('rehearsed' in planned) return planned.run();
  const { records, matchUpId, ops, result } = planned;
  const { tournamentRecord, drawDefinition, event } = records;
  const applied = applyOwnedPlan({
    args: {
      matchUpsMap: getMatchUpsMap({ drawDefinition }),
      request: { matchUpId, flags: { propagateRetirementAsExit: false } },
      tournamentRecord,
      drawDefinition,
      event,
    },
    shape: 'local',
    ops,
  });
  return applied.error ? applied : result;
}

/** the call a unit is when v2 can decide it as one: handed `bound`, it returns `bound.unowned` unwritten where v2 neither
 * refuses nor owns it (`setMatchUpStatus` `bound`) */
export type DirectUnit = (bound: { unowned: ResultType }) => ResultType;

/**
 * ONE UNIT, AT THE COST OF ONE CALL WHERE v2 DECIDES IT. Under `v2` a unit that is one outcome call is first made as that
 * call on the stored record, with `bound`: v2 refuses before its first write (its refusals are planned against the
 * read-only view) or writes a plan it owns (native ops, or a whole-call recording read off a copy), exactly as a single
 * `setMatchUpStatus` does. Only a call v2 would leave to v1 is handed back unwritten, and the unit is then planned whole
 * on a copy (`planUnit`). Under `v1` and `differential` every unit is planned on a copy, so v1's own writers never write
 * the stored record from a unit.
 */
export function decideUnit({
  records,
  matchUpId,
  direct,
  run,
}: {
  records: UnitRecords;
  matchUpId: string;
  direct?: DirectUnit;
  run: UnitRun;
}): ResultType {
  if (direct && getOutcomePipeline() === OUTCOME_PIPELINE_V2) {
    const bound = { unowned: {} as ResultType };
    const result = direct(bound);
    if (result !== bound.unowned) {
      tally.native += 1;
      return result;
    }
  }
  const planned = planUnit({ records, matchUpId, run });
  return 'refused' in planned ? planned.refused : applyUnit(planned);
}
