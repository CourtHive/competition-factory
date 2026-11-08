import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { relabelCarryReason, withdrawnReason } from './carriedExit';
import { freshByeCarry } from '../direction';
import {
  APPLY_VALUES,
  REMOVE_DIRECTED,
  SINGLE_EXITS,
  directedBothSides,
  directsElsewhere,
  exitWriteIsV1s,
} from './planShared';

// constants and types
import { BYE, IN_PROGRESS, RETIRED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import type { ExitReasonArgs, MatchUpWrite, OutcomeView, Route } from '../types';
import type { OutcomeOp } from '../ops';

/**
 * A stored single exit or played result corrected on the winner's route (S6): cleared, re-entered, relabelled or given
 * to the other side, where neither side carries anything on.
 */

// These three functions are admission gates run before the S4 detectors (`exitReason`, then `shapeReason`), and the
// order is load-bearing (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 8): `reenteredReason` takes
// `loser.withdrawn` straight to `withdrawnReason` and has no label guard of its own, so `correctedSingleExit`
// refusing a withdrawal whose write is a single exit is what keeps a same-label re-entry over a standing carry v1's.
// The guard lives here because `withdrawnCarry` reports a withdrawal whenever the direction carries nothing, which is
// wider than v1's `validExitToPropagate`; moving it into `withdrawnCarry` would let v2 own a non-propagating
// retirement's withdrawal and is a separate slice. The `apply-values` and `swap` loser checks (`relabelledExit`) and
// the winner-route ones (`reenteredReason`) are not the same test: they answer `refreshArrivals` differently and
// split on `propagateExitStatus` off. Verified with a retirement flag flipped between entry and re-entry on
// FEED_IN_CHAMPIONSHIP 16: v1 withdraws, both routes here abstain `exit`.
/**
 * S6: a single exit cleared back to be played. Where it carried nothing on, v1 takes it back as it takes back a played
 * result (`removeDirectedParticipants`): the winner out of the next matchUp and the loser out of the seat their link
 * fed, with the same writes and notices. So it is the removal shape (`removalReason`), whose checks keep anything the
 * exit carried v1's: provenance or a carried status in the loser's target, a BYE gone through beside it, and this
 * matchUp's own side provenance (`provenance`).
 */
export function clearedSingleExit(view: OutcomeView, route?: Route, write?: MatchUpWrite): boolean {
  const { existing } = view;
  // a dual decided by its own exit, un-decided by a line (`undecidingLineOps`, S7): v1's tally writes the dual as its
  // lines leave it, in progress or to be played, the winner removed (`updateTieMatchUpScore`); only a dual's tally
  // writes IN_PROGRESS here
  const cleared = write?.matchUpStatus === TO_BE_PLAYED || write?.matchUpStatus === IN_PROGRESS;
  return (
    route === REMOVE_DIRECTED &&
    SINGLE_EXITS.has(existing.matchUpStatus) &&
    !!existing.winningSide &&
    cleared &&
    !write?.winningSide
  );
}

/**
 * S6: a stored single exit or played result corrected on the winner's route to a single exit or a played result, one
 * side of it an exit, where neither carries anything on: re-entered, relabelled (a WALKOVER as a DEFAULTED, an exit as
 * a played result and the reverse) or given to the other side. v1 directs a single exit that carries nothing as it
 * directs a played result (probed: the same writes and notices), so it takes S4's re-entered and changed-winner shapes
 * (`reenteredReason`, `changedWinnerReason`), whose checks keep v1's what the stored exit carried: provenance or a
 * carried status in a target, a BYE beside the loser, and this matchUp's own side provenance (`provenance`). A loser
 * the new exit would carry across their link is v1's here; a DEFAULTED under `incompleteAssignmentsOnDefault` too.
 */
export function correctedSingleExit(args: ExitReasonArgs): boolean {
  const { request, view, route, write, direction } = args;
  const { existing } = view;
  if (route !== 'winner' || !existing.winningSide || !directedBothSides(view, write)) return false;
  if (exitWriteIsV1s(request, view, write)) return false;
  if (directsElsewhere(direction)) return false;
  const loser = direction?.loser;
  // the same winner relabelled an exit its loser carries across their link: the carry lands where they stand
  // (`relabelCarryReason`)
  const relabelCarry = !!loser?.exit && write.winningSide === existing.winningSide;
  // ...or relabelled a played result, the carry withdrawn off the loser's matchUp (F2, `withdrawnReason`)
  const withdrawal =
    !!loser?.withdrawn &&
    !loser.withdrawn.loserWins &&
    !SINGLE_EXITS.has(write.matchUpStatus) &&
    write.winningSide === existing.winningSide;
  return !(
    (loser?.exit && !relabelCarry) ||
    (loser?.withdrawn && !withdrawal) ||
    loser?.carriedPast ||
    loser?.converged
  );
}

/**
 * S6 tail: a single exit relabelled where its winner already stands (the `apply-values` route: the same winner, downstream
 * active): a stored exit or played result re-entered as an exit or a played result, one side of it an exit. v1 writes the
 * matchUp as it writes a played result there (`applyMatchUpValues`) and directs nothing again; under `propagateExitStatus`
 * the carry follows the label where the loser stands (`relabelWithoutDirection`): to an exit it is carried onto the
 * loser's matchUp as a fresh carry lands (`relabelCarryReason`, `carriedOps`); away from one it is withdrawn, the awardee's
 * position released from the matchUp they went on into (`withdrawnReason`, `withdrawnOps`); the same exit again leaves
 * the carry as it is, and the other exit rewrites it in place (`heldCarryStands`, read as the exit it is). Stay v1's: a
 * carry the awardee or the carrier has played on from, a carry that converged or was carried past, a loser kept out, and a
 * DEFAULTED under `incompleteAssignmentsOnDefault`. `applyValuesReason` then vets the write itself.
 */
export function relabelledExit(args: ExitReasonArgs): boolean {
  const { request, view, write, direction } = args;
  const { existing } = view;
  if (!write?.winningSide || !existing.winningSide) return false;
  if (args.route === 'swap' ? write.winningSide === existing.winningSide : write.winningSide !== existing.winningSide)
    return false;
  if (!directedBothSides(view, write)) return false;
  if (exitWriteIsV1s(request, view, write)) return false;
  if (directsElsewhere(direction)) return false;
  // a swap's direction names the new winner, whose path the relabel exchanges (`swapOps`); a relabel places nobody
  if (direction?.winner && args.route !== 'swap') return false;
  // a status that changes is refreshed on the arrivals the first entry sent on (v1's `refreshArrivals`): v1's
  if (arrivalsRefreshed(view, request.matchUpId, write.matchUpStatus) && !refreshedArrivalOps(args)) return false;
  const loser = direction?.loser;
  // no link: the write alone
  if (!loser) return true;
  if (loser.carriedPast || loser.converged || loser.bye || !loser.arrives) return false;
  if (loser.exit) return !relabelCarryReason(view, write);
  if (loser.withdrawn)
    return (
      !loser.withdrawn.loserWins && !SINGLE_EXITS.has(write.matchUpStatus) && !withdrawnReason(view, loser.withdrawn)
    );
  // nothing carried or withdrawn: the write alone, where no propagation is asked, or the loser's matchUp holds nothing
  // (a carry recorded past a BYE, or an exit standing there, is settled by v1 where the direction planned neither)
  const { targets } = view;
  if (!request.flags.propagateExitStatus) return true;
  // C24: a non-propagating retirement of a played source has no carry to withdraw past the BYE.
  if (write.matchUpStatus === RETIRED && !request.flags.propagateRetirementAsExit && freshByeCarry(view)) return true;
  return (
    targets.loserMatchUpStatus === TO_BE_PLAYED &&
    !targets.loserMatchUpHasResult &&
    !targets.loserMatchUpCarriesExit &&
    !targets.loserMatchUpCarriesSourceExit &&
    !targets.loserTargetSeat?.opponentBye &&
    !targets.loserMatchUpRecord?.provenance
  );
}

/** C23: v1 refreshes native arrival origins after the source result, preserving every other field. */
export function refreshedArrivalOps(args: ExitReasonArgs): OutcomeOp[] | undefined {
  const { view, request, write, route, drawDefinition } = args;
  if (route !== APPLY_VALUES && route !== 'swap') return [];
  if (!write?.matchUpStatus || !request.matchUpId) return [];
  if (!SINGLE_EXITS.has(write.matchUpStatus) && !SINGLE_EXITS.has(view.existing.matchUpStatus)) return [];
  const arrivals = (view.inContextDrawMatchUps ?? []).filter((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some(
      (entry) =>
        entry?.sourceMatchUpId === request.matchUpId &&
        !carriedExitStatus(entry) &&
        !!entry.previousMatchUpStatus &&
        entry.previousMatchUpStatus !== write.matchUpStatus,
    ),
  );
  if (!arrivals.length) return [];
  const structureId = view.targets.source.structureId;
  const structure = drawDefinition?.structures?.find((candidate) => candidate.structureId === structureId);
  if (
    view.isTeam ||
    view.line ||
    !structure ||
    structuresOf(structure)?.length ||
    arrivals.some((matchUp) => matchUp.structureId !== structureId || matchUp.matchUpStatus === BYE)
  )
    return undefined;
  const arrivalIds = new Set(arrivals.map((matchUp) => matchUp.matchUpId));
  const stored = (matchUpsOf(structure) ?? []).filter((matchUp) => arrivalIds.has(matchUp.matchUpId));
  if (stored.length !== arrivals.length) return undefined;
  const ops: OutcomeOp[] = [];
  for (const matchUp of stored) {
    const provenance: SideExitProvenance = {};
    for (const side of [1, 2] as const) {
      const entry = matchUp.sideExitProvenance?.[side];
      if (
        entry?.sourceMatchUpId === request.matchUpId &&
        !carriedExitStatus(entry) &&
        entry.previousMatchUpStatus &&
        entry.previousMatchUpStatus !== write.matchUpStatus
      )
        provenance[side] = { ...entry, previousMatchUpStatus: write.matchUpStatus };
    }
    if (
      !Object.keys(provenance).length ||
      matchUp.matchUpStatus === BYE ||
      Object.values(matchUp.sideExitProvenance ?? {}).some(
        (entry) =>
          entry.sourceMatchUpId === request.matchUpId &&
          !carriedExitStatus(entry) &&
          entry.previousMatchUpStatus !== view.existing.matchUpStatus,
      )
    )
      return undefined;
    ops.push(
      {
        op: 'mergeSideExitProvenance',
        matchUpId: matchUp.matchUpId,
        provenance,
        announcedAs: route === 'swap' ? 'refreshArrivalsFrom' : 'refreshArrivals',
      },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUp.matchUpId },
      { op: 'stampUpdatedAt', entity: 'structure', id: structure.structureId },
    );
  }
  return ops;
}

/** an arrival entry naming this matchUp (how a side got where it is) records a status the relabel would change */
function arrivalsRefreshed(
  view: OutcomeView,
  matchUpId: string | undefined,
  matchUpStatus?: MatchUpStatusUnion,
): boolean {
  if (!matchUpId) return false;
  return (view.inContextDrawMatchUps ?? []).some((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some(
      (entry) =>
        entry?.sourceMatchUpId === matchUpId &&
        !carriedExitStatus(entry) &&
        !!entry.previousMatchUpStatus &&
        entry.previousMatchUpStatus !== matchUpStatus,
    ),
  );
}
