import { writeAssignmentResults } from '@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { exchangeMatchUpPositions } from '@Mutate/matchUps/drawPositions/swapWinnerLoser';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { scoredTimeAction } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { getCapturedStamps } from '@Global/state/globalState';
import { isAnyExit } from '@Validators/isExit';
import { nowIso } from '@Tools/clock';
import {
  mergeSideExitProvenance,
  setSideExitProvenance,
  blankSideExitCode,
  clearResolvedSideExitProvenance,
  clearSideExitProvenance,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { completedMatchUpStatuses, BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';
import type {
  DrawDefinition,
  MatchUp,
  MatchUpSchedule,
  MatchUpStatusCodeElement,
  MatchUpStatusUnion,
  PositionAssignment,
  Score,
  SideExitProvenance,
  Structure,
  TallyResult,
  TeamCompetitor,
} from '@Types/tournamentTypes';

/**
 * The outcome pipeline, v2: the ops a plan is made of, and the one reducer that folds them (executor plan § 3.3, S1).
 *
 * An op says what a stored object holds once the call has written. The vocabulary is closed and is what the spec and
 * a port share. The REDUCER folds each op into a stored-shape draw: the overlay, the `differential` shadow apply and
 * (from S2) apply itself all use it, so what a plan says and what lands are one thing.
 *
 * The reducer decides nothing: it does not branch on draw state and raises no refusals. Whether an op is the right
 * one is the planner's question; the allowlist (`plan.ts`) admits only shapes whose every write is an op here.
 *
 * Ops grow by slice. S1 holds the result of the matchUp and the stamps: what a call that touches only its own
 * matchUp writes (measured 2026-10-24: status, score, winner, codes, `schedule.scoredTime`, and `updatedAt`).
 *
 * STAMPS ARE F2 (i): one per TOUCHED entity per call, the matchUp, its own structure and the draw. v1 keeps the same
 * rule for the draw and its matchUps (`drawNotifications.ts` `stampUpdatedAt`), and `differential` compares those by
 * value. v1's matchUp notice still stamps every top-level structure, so structure stamps are left out of that comparison
 * (CA, 2026-10-24, a temporary blind spot; see `shadow.ts`) and held to F2 (i) by v2's own tests.
 */
export type OutcomeOp =
  | {
      op: 'setMatchUpResult';
      /** The source writer resets through toBePlayed, including own undefined keys. */
      resetsScore?: true;
      /** The source writer assigns an own undefined winner. */
      removesWinningSide?: true;
      /** The pending produced exit lost its winner key in the settle pass after a retained BYE relay. */
      deletesWinningSide?: true;
      /** The unlinked qualifying-final removal returns an own undefined qualifierRemoved field. */
      returnsQualifierRemoved?: true;
      /** A relabel first withdraws the existing carry, clearing provenance, codes and winner before re-entry. */
      withdrawsCarry?: true;
      matchUpId: string;
      matchUpStatus: MatchUpStatusUnion;
      winningSide?: 1 | 2;
      score?: Score;
      /** a new format; absent keeps the one the matchUp stores */
      matchUpFormat?: string;
      matchUpStatusCodes?: MatchUpStatusCodeElement[];
      /**
       * false where v1 writes the result outside `setMatchUpState`, so its `applyScoredTime` does not run and the
       * schedule is left as it is: a double exit's produced exit (`doubleExitAdvancement` → `modifyMatchUpScore`)
       */
      stampsScoredTime?: false;
      /** the retained origin and all its onward consequences are explicitly planned (S7) */
      retainedExitPlanned?: true;
      /**
       * false where v1 writes the result with neither the tournament nor the event (a produced exit recorded beside a BYE
       * and carried on, `stampExitOnByeHeldLoserTarget`, `carryExitOnward`): the notice names neither, and the matchUp in
       * context is read without the tournament
       */
      announcesContext?: false;
      /** A later actual score writer restores event/tournament identity after a quiet unwind (S7 certified relay). */
      restoresNoticeIdentity?: true;
      /**
       * true where v1's notice names the tournament and the event but the matchUp it defers in context is read without
       * the tournament: a produced exit landed past a BYE-held matchUp beyond the first (`carryExitOnward`, S7)
       */
      inContextBare?: true;
      /**
       * the writer v1's notice names where a settle pass makes the write: a carry withdrawn off the loser's matchUp by a
       * relabel, whose last emission is `reconcileScoredTimes` taking its `scoredTime` (S6); a convergence an unwind
       * dissolved, written again as it stands by `settleRederivedDoubleExits` after the call's own write (S6 tail);
       * a produced exit awarded on placement (`assignMatchUpDrawPosition`, without an in-context notice), or its stale
       * relay copy reset by `withdrawProducedExits` (S7); an empty final reservation's `advanceWinner` notice does not
       * defer another score callback
       */
      announcedAs?:
        | 'reconcileScoredTimes'
        | 'settleRederivedDoubleExit'
        | 'assignMatchUpDrawPosition'
        | 'withdrawProducedExits'
        | 'advanceWinner';
      /**
       * a TEAM dual's write after its line's result (S7), `updateTieMatchUpScore`'s: the sides it ensures and the
       * tieFormat it copies on, each present only where it changes the stored value. v1 returns the write as the
       * call's `tieMatchUpResult`, but for a line's result removed or a line cleared (`unreturned`: v1's
       * `removeDirectedParticipants` returns none, nor its clear of a line still to be played)
       */
      dualTally?: { sides?: unknown[]; tieFormat?: unknown; clearsTieFormatId?: true; unreturned?: true };
      /**
       * a TEAM dual's own call (S7): the sides `ensureSideLineUps` writes before the result (their line-ups from the
       * draw's), present only where they change the stored ones. Unlike a line's `dualTally`, the call returns no
       * `tieMatchUpResult`
       */
      ensuredSides?: unknown[];
      /** a TEAM dual's own call that disables auto-calc (`true`) or enables it (`null`, removed), as v1 stores it (S7) */
      disableAutoCalc?: true | null;
      /**
       * the call's notes, written onto its own matchUp with the result as v1's `addNotes` writes them inside
       * `modifyMatchUpScore` (S7, `notesReason`: the clean routes only; a double exit's or a TEAM call's are deferred)
       */
      notes?: string;
    }
  | {
      op: 'setMatchUpDrawPositions';
      /** A re-key before the score write leaves the winner's own key alone. */
      preservesWinningSide?: true;
      /** A released result writes an own undefined score before its subsequent reset. */
      clearsScore?: true;
      matchUpId: string;
      /** the positions placed in the matchUp, as v1 stores them: numbers, ascending */
      drawPositions: number[];
      /**
       * the position taken back out, when one is: the result goes with the participant, so the matchUp's score goes
       * too (v1's `removeSubsequentRoundsParticipant`, S4)
       */
      removedDrawPosition?: number;
      /** The removed awardee leaves a separately certified pending foreign exit; position removal supplies its notice. */
      withdrawsPendingAward?: true;
      /**
       * the position placed in by the same write, when one is: a changed winner replacing the old one (S4); a loser gone
       * on through a BYE into the matchUp an unwind left holding their position (S7), whose notice is then the last
       */
      placedDrawPosition?: number;
      /**
       * false where v1 announces the placement with no event or tournament: the winner a double exit's produced exit is
       * awarded to, sent on by `doubleExitAdvancement` (S5). The write is the same; only the notice's ids differ
       */
      announcesContext?: false;
      /**
       * a position advanced through a BYE a double exit placed (`doubleExitAdvancement`'s advance, S5): announced as
       * `advanceWinner`, with no event, and the matchUp it joins written with no score
       */
      advancesThroughBye?: true;
      /**
       * with `advancesThroughBye`: the advance is a settle pass's (`reconcileByeAdvancements`, a seat an unwind freed
       * beside a standing BYE, S6 tail), or the participant a held exit is awarded to going on (`directWinner`, S7),
       * which v1 announces with the event
       */
      announcesEvent?: true;
      /**
       * the BYE whose withdrawal takes the position back out (S6, an unwind's `removeDirectedBye`): announced as v1's
       * `clearDrawPosition` announces it, `removeDrawPosition-<that BYE's drawPosition>`, with neither event nor tournament
       */
      withdrawnByePosition?: number;
      /**
       * with `withdrawnByePosition`: the matchUp held a pending exit the withdrawn BYE had carried a position into (a
       * passage's landing, S7), which goes with the position as v1's `updateMatchUpStatusAfterRemoval` takes it: to be
       * played, its provenance removed (a pending exit holds no winner, score or codes to take)
       */
      clearsPendingExit?: true;
      /**
       * an awarded produced copy withdrawn as its relay's BYE goes (S7): keep the legitimate occupant and blank score,
       * reset the result and remove its provenance before the arriving loser is planned
       */
      withdrawsProducedExit?: true;
      /**
       * the position of a participant awarded a carried exit, taken back out of the matchUp they went on into when the
       * carry is withdrawn by a relabel (S6 tail, v1's `relabelWithoutDirection`): announced as `releaseAdvancedDrawPosition`,
       * with the event; the matchUp's score is left as it is (there is none: a result there keeps the carry)
       */
      releasedDrawPosition?: number;
      /**
       * the placement seats a loser beside a carried exit that decides the matchUp for them (RULE 2 on arrival, a seat an
       * unwind freed and re-derived to the carry, S7): v1's `assignDrawPosition` re-derives its status codes with the
       * assignment (`progressExitStatus`: `[]`, nothing carried on this side) and announces the matchUp as the assignment
       */
      rederivesCodes?: true;
    }
  | {
      op: 'assignPosition';
      /** The assignment announces at an explicit return boundary after its nested arrivals. */
      announcesAssignments?: false;
      structureId: string;
      drawPosition: number;
      /** the participant placed at the drawPosition's stored assignment (a loser fed across a link) */
      participantId: string;
    }
  | {
      op: 'exchangeDrawPositions';
      /**
       * a swap's relabel in a later round of its structure (S4): the two positions exchanged in the matchUp and sorted,
       * a decided matchUp's winner carried across the re-sort with its score and side facts (v1's
       * `exchangeMatchUpPositions`, the same function)
       */
      matchUpId: string;
      structureId: string;
      /** the old winner's position */
      positionA: number;
      /** the old loser's position, when they held one */
      positionB?: number;
    }
  | {
      op: 'relabelPosition';
      /**
       * a swap's relabel downstream (S4): the seat's occupant changes identity, nothing else; v1 announces and stamps
       * nothing for it (`swapWinnerLoser`)
       */
      structureId: string;
      drawPosition: number;
      participantId: string;
    }
  | {
      op: 'clearPosition';
      /** a loser taken back out of the structure a link placed them in (S4): their seat emptied */
      structureId: string;
      drawPosition: number;
      /** whose seat it was: their seed entry in that structure goes with them (v1's `removeDirectedLoser`) */
      participantId: string;
    }
  | {
      op: 'setMatchUpStatusCodes';
      /** An equal re-derivation allocates fresh codes but emits no notice. */
      quiet?: true;
      /** a matchUp's status codes re-derived from its provenance (a loser taken back out of it, S4) */
      matchUpId: string;
      matchUpStatusCodes: MatchUpStatusCodeElement[];
    }
  | {
      op: 'mergeSideExitProvenance';
      /**
       * a side's exit provenance merged into what the matchUp carries, through v1's `mergeSideExitProvenance` (which
       * admits it): a carried exit's entry on the side its carrier arrived at (S5, `progressExitStatus`)
       */
      matchUpId: string;
      provenance: SideExitProvenance;
      /** a carry recorded beside a BYE announces itself after any earlier quiet result write */
      announcedAs?: 'progressExitStatus' | 'refreshArrivals' | 'refreshArrivalsFrom';
    }
  | {
      op: 'setSideExitProvenance';
      /**
       * a matchUp's exit provenance replaced by what an unwind leaves, through v1's `setSideExitProvenance`: absent (or
       * empty), the field is removed (a cleared double exit's produced exit, its origin withdrawn, S6)
       */
      matchUpId: string;
      provenance?: SideExitProvenance;
      /** A carry removed beside a BYE announces that provenance write without rewriting the BYE's result. */
      announcedAs?: 'relabelLoserExit' | 'withdrawDisplacedCarry';
      /** The displaced carrier takes the reason on this side with its provenance. */
      blankExitSide?: 1 | 2;
      announcesEvent?: false;
    }
  | {
      op: 'announcePositionAssignments';
      /** Recursive withdrawal returns without tournament context. */
      announcesTournament?: false;
      /** Return-time notice: nested BYE assignments announce before their parent. No state write. */
      structureId: string;
      announcesEvent?: false;
    }
  | {
      op: 'assignBye';
      /** A converging result withdrew the prior loser before the BYE service places this seat. */
      clearsDisplacedPosition?: true;
      /** The matchUp whose assignment is cleared before the BYE is placed. */
      matchUpId?: string;
      /** False when a separate return-time op announces this placement. */
      announcesAssignments?: false;
      /** a FIRST_MATCHUP reservation (S3): the consolation seat a loser who has won can never fill */
      structureId: string;
      drawPosition: number;
      /** the marker `assignDrawPositionBye` writes for a propagation placement, so a withdrawal can recognise it */
      byeFromPropagation: true;
      /**
       * false where v1 announces the structure's assignments with no event: a seat a produced exit leaves unfillable
       * (S5). The notice keeps an event an earlier placement in the same structure announced (`preserveNoticeIdentity`)
       */
      announcesEvent?: false;
    }
  | {
      op: 'setMatchUpBye';
      /** The direct BYE service preserves this field; result-writer paths clear it. */
      preservesOrderOfFinish?: true;
      /** the matchUp the reserved seat is in: BYE, its score and winner removed (v1's `setMatchUpStatusBYE`) */
      matchUpId: string;
      /** false where v1 announces it with no event: a seat a produced exit leaves unfillable (S5) */
      announcesEvent?: false;
    }
  | {
      op: 'withdrawBye';
      /** Quiet own-key writes made by positionClear even where status and seats do not change. */
      clearedWinnerIds?: string[];
      /**
       * an unwind's `removeDirectedBye` on a seat (S6): the stored assignment's BYE and its propagation marker removed,
       * where one stands; the structure's assignments announced with neither event nor tournament either way
       */
      structureId: string;
      drawPosition: number;
      /**
       * false where v1 announces no assignments for it: a BYE its round-1 loser cascade takes back
       * (`handleLoserMatchUpRemoval` → `drawPositionRemovals`, S6 tail, the unwind walk)
       */
      announcesAssignments?: false;
    }
  | {
      op: 'clearMatchUpBye';
      /**
       * the matchUp a withdrawn BYE stood in, to be played again (S6), announced as `removeDrawPosition-<drawPosition>`
       * with neither event nor tournament
       */
      matchUpId: string;
      drawPosition: number;
      /**
       * a carried exit standing on the other side once the BYE goes (S7): the matchUp is re-derived to it as v1's
       * `updateMatchUpStatusAfterRemoval` re-derives it, the exit's status, awarded to the side without it (a carried exit
       * keeps its award on an empty seat), its provenance kept; a produced exit instead stays pending with no winningSide
       */
      rederived?: { matchUpStatus: MatchUpStatusUnion; winningSide?: 1 | 2 };
      /** the relayed copy converged onward: its surviving origin is retained by the unwind's separate ops */
      retainedOnwardMatchUpId?: string;
      /** A final retains the actual carrier's award while this relay's produced copy is withdrawn (S7 clear or certified plain winner). */
      retainedCarriedAward?: {
        matchUpId: string;
        carrierDrawPosition: number;
        participantId: string;
        matchUpStatus: MatchUpStatusUnion;
        provenance: SideExitProvenance;
      };
    }
  | {
      op: 'setParticipantResults';
      /** a round robin's group or an ad hoc structure: its assignments take the tallies (`writeAssignmentResults`) */
      structureId: string;
      /** each participant's tally after the call, as `tallyParticipantResults` gives it */
      participantResults: { [participantId: string]: TallyResult };
      /**
       * an ad hoc structure's assignments, rebuilt first as v1's `updateTallyIfNeeded` rebuilds them: one per
       * participant its matchUps hold, in the order they appear, holding nothing else
       */
      participantIds?: string[];
    }
  | {
      op: 'setSideLineUp';
      /**
       * a TEAM dual a team is directed into (S7): the team's line-up on its side, as v1 writes it, the winning team's
       * by `propagateLineUp` (`directWinner`), the losing team's by `propagateLoserLineUp` (`directLoser`) and, past a BYE,
       * on the dual beyond by its assignment (`updateSideLineUp`, from the draw's line-ups). The matchUp's
       * sides are made, numbered 1 and 2, keeping what each held, and the line-up set on this one
       */
      matchUpId: string;
      sideNumber: number;
      lineUp: unknown;
      /** the v1 writer that announces it (`updateSideLineUp`'s context is spelled so) */
      announcedAs:
        'directWinner' | 'directLoser' | 'updateSidLineUp' | 'removeDirectedLoser' | 'assignDrawPositionBye-TEAM';
      /** C21: delete the line-up on an existing stored side, preserving the sides array. */
      clearsLineUp?: true;
      /** false when the coalesced notice has no event; a standing award retains its assignment's identity */
      announcesEvent?: false;
    }
  | {
      op: 'setMatchUpSchedule';
      /**
       * the schedule a call carries, as v1's `addMatchUpScheduleItems` writes it on the matchUp (S7): the whole stored
       * `schedule` after the write, which the plan reads by running that writer on a copy of the matchUp. Ordered before
       * the call's result, as v1 writes the schedule before `applyScoredTime` stamps onto it
       */
      matchUpId: string;
      schedule: MatchUpSchedule;
    }
  | {
      op: 'setOrderOfFinish';
      /**
       * a TEAM dual's line's place in its collection's finishing order (`orderOfFinish`): absent, removed. Planned per
       * line whose number a line's write changes (the line itself, and the later lines of a cleared one), after that
       * line's result and before the dual's, as v1's `modifyMatchUpScore` writes them
       */
      matchUpId: string;
      orderOfFinish?: number;
    }
  | { op: 'clearMatchUpScoredTime'; matchUpId: string }
  | { op: 'stampUpdatedAt'; entity: 'matchUp' | 'structure' | 'drawDefinition'; id: string };

/** the op vocabulary as a literal union, which `verify:outcome-spec` holds to the spec; checked against `OutcomeOp` */
export type OutcomeOpName =
  | 'setMatchUpResult'
  | 'setMatchUpDrawPositions'
  | 'exchangeDrawPositions'
  | 'relabelPosition'
  | 'assignPosition'
  | 'clearPosition'
  | 'setMatchUpStatusCodes'
  | 'mergeSideExitProvenance'
  | 'setSideExitProvenance'
  | 'assignBye'
  | 'announcePositionAssignments'
  | 'setMatchUpBye'
  | 'withdrawBye'
  | 'clearMatchUpBye'
  | 'setParticipantResults'
  | 'setSideLineUp'
  | 'setMatchUpSchedule'
  | 'clearMatchUpScoredTime'
  | 'setOrderOfFinish'
  | 'stampUpdatedAt';
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const opNamesMatch: Same<OutcomeOpName, OutcomeOp['op']> = true;
export const OUTCOME_OP_NAMES_MATCH = opNamesMatch;

/** Cleanup is terminal; ordinary writer classification must see only the preceding program. */
export function splitScoredTimeCleanup(ops: OutcomeOp[]) {
  const start = ops.findIndex((op) => op.op === 'clearMatchUpScoredTime');
  const prefix = start < 0 ? ops : ops.slice(0, start);
  const suffix = start < 0 ? [] : ops.slice(start);
  if (suffix.some((op) => op.op !== 'clearMatchUpScoredTime' && op.op !== 'stampUpdatedAt'))
    throw new Error('scored-time cleanup must be terminal');
  const cleanup = suffix.filter((op): op is OpOf<'clearMatchUpScoredTime'> => op.op === 'clearMatchUpScoredTime');
  return { prefix, cleanup };
}

/**
 * F2 (i), CA 2026-10-19: one stamp per touched entity per call. The call's captured instant T (`nowIso()` reads it
 * inside an engine call), or the previous stamp + 1 ms when that is already T or later, so a stamp always moves on.
 */
export function nextStamp(previous: string | Date | undefined, now: string = nowIso()): string {
  // Match v1's epoch comparison, including Date objects, offsets and an invalid prior stamp.
  const previousMs = typeof previous === 'string' ? new Date(previous).getTime() : previous?.getTime();
  const currentMs = new Date(now).getTime();
  const next =
    previousMs !== undefined && !Number.isNaN(previousMs) && currentMs <= previousMs ? previousMs + 1 : currentMs;
  return new Date(next).toISOString();
}

type Stamped = { updatedAt?: string | Date };

/** Unknown temporal values belong to the projection cursor, never to stored or hydrated records. */
export type TemporalProjection = { scoredTimes: Set<string>; updatedAt: Set<string> };
type FoldContext = {
  stampedBefore?: Set<string>;
  temporal?: TemporalProjection;
  phase?: 'ordinary-result' | 'ordinary-arrival';
  /** Native execution retains v1's input aliases; standalone folds and planning overlays copy their plan inputs. */
  bindResultInputs?: true;
  pendingScoredTimes?: Map<MatchUp, string>;
  pendingSchedules?: Map<MatchUp, MatchUpSchedule>;
};

/**
 * Once per call, as v1 (`drawNotifications.ts` `stampUpdatedAt`): an entity this engine call has already stamped keeps
 * its stamp. `stampedBefore` names those the live call stamped before the plan was folded, which a COPY of the draw
 * cannot tell from the call's ledger; the ledger itself covers the live draw.
 */
function stamp(target: Stamped | undefined, key: string, { stampedBefore, temporal }: FoldContext) {
  const stamped = getCapturedStamps();
  if (target && !stampedBefore?.has(key) && !stamped?.has(target)) {
    if (temporal) {
      temporal.updatedAt.add(key);
      return;
    }
    target.updatedAt = nextStamp(target.updatedAt);
    stamped?.add(target);
  }
}

/**
 * The draw's entities this engine call has already stamped, as `entity:id` keys. An `executionQueue`, or a
 * competition call over several records, can stamp the draw before this `setMatchUpStatus` runs; a shadow copy of the
 * draw cannot see that, so the keys are read from the live draw before v1 writes.
 */
export function stampedInThisCall(drawDefinition?: DrawDefinition): Set<string> {
  const keys = new Set<string>();
  const stamped = getCapturedStamps();
  if (!stamped || !drawDefinition) return keys;
  if (stamped.has(drawDefinition)) keys.add(`drawDefinition:${drawDefinition.drawId}`);
  const { matchUps, structures } = indexDraw(drawDefinition);
  for (const [structureId, structure] of structures) if (stamped.has(structure)) keys.add(`structure:${structureId}`);
  for (const [matchUpId, matchUp] of matchUps) if (stamped.has(matchUp)) keys.add(`matchUp:${matchUpId}`);
  return keys;
}

function setMatchUpResult(matchUp: MatchUp, op: Extract<OutcomeOp, { op: 'setMatchUpResult' }>, context: FoldContext) {
  const { phase, bindResultInputs } = context;
  const ordinary = phase === 'ordinary-result';
  if (op.withdrawsCarry) {
    clearSideExitProvenance(matchUp);
    matchUp.matchUpStatusCodes = [];
    delete matchUp.winningSide;
  }
  if (op.disableAutoCalc !== undefined)
    setFirstClassOrExtension({
      element: matchUp,
      attribute: 'disableAutoCalc',
      name: DISABLE_AUTO_CALC,
      value: op.disableAutoCalc,
    });
  // a dual's sides and tieFormat as `updateTieMatchUpScore` rewrites them before its tally (S7)
  if (op.dualTally?.sides) matchUp.sides = structuredClone(op.dualTally.sides) as MatchUp['sides'];
  if (op.ensuredSides) matchUp.sides = structuredClone(op.ensuredSides) as MatchUp['sides'];
  if (op.dualTally?.tieFormat) matchUp.tieFormat = structuredClone(op.dualTally.tieFormat) as MatchUp['tieFormat'];
  if (op.dualTally?.clearsTieFormatId) matchUp.tieFormatId = undefined;
  if (op.resetsScore) resetResult(matchUp, op.matchUpStatus, bindResultInputs);
  if (op.score) matchUp.score = ordinary || bindResultInputs ? op.score : structuredClone(op.score);
  matchUp.matchUpStatus = op.matchUpStatus;
  clearOrderOfFinishUnlessCompleted(matchUp);
  setResultFormatAndCodes(matchUp, op, ordinary, !!bindResultInputs);
  clearResolvedSideExitProvenance(matchUp);
  if (op.deletesWinningSide) delete matchUp.winningSide;
  else if (op.winningSide) matchUp.winningSide = op.winningSide;
  else if (op.removesWinningSide) matchUp.winningSide = undefined;
  else if (
    (op.announcedAs === 'reconcileScoredTimes' && op.matchUpStatus !== BYE) ||
    op.announcedAs === 'withdrawProducedExits'
  )
    delete matchUp.winningSide;
  else if (bindResultInputs) {
    if (matchUp.winningSide) matchUp.winningSide = undefined;
  } else if (!op.resetsScore) delete matchUp.winningSide;
  if (op.notes) matchUp.notes = op.notes;
  if (op.stampsScoredTime === false) return;
  applyResultScoredTime(matchUp, context);
}

/** A native result's schedule lands after finishing order and its result notice's stamp. */
function applyResultScoredTime(
  matchUp: MatchUp,
  { temporal, pendingScoredTimes, pendingSchedules }: FoldContext,
): void {
  const pending = pendingScoredTimes?.has(matchUp);
  const action = scoredTimeAction(matchUp, pending || temporal?.scoredTimes.has(matchUp.matchUpId));
  if (action === 'initialize') {
    if (temporal) {
      matchUp.schedule ??= {};
      temporal.scoredTimes.add(matchUp.matchUpId);
    } else if (
      pendingScoredTimes &&
      (matchUp.collectionId || !Object.hasOwn(matchUp, 'updatedAt') || pendingSchedules?.has(matchUp))
    )
      pendingScoredTimes.set(matchUp, nowIso());
    else {
      matchUp.schedule ??= {};
      matchUp.schedule.scoredTime = nowIso();
    }
  } else if (action === 'clear') {
    pendingScoredTimes?.delete(matchUp);
    temporal?.scoredTimes.delete(matchUp.matchUpId);
    if (matchUp.schedule) delete matchUp.schedule.scoredTime;
  }
}

/** The score-reset writer retains the fixture's own keys and rescues the standing format/provenance. */
function resetResult(matchUp: MatchUp, matchUpStatus: MatchUpStatusUnion, bindResultInputs?: true): void {
  const provenance = isAnyExit(matchUpStatus) ? matchUp.sideExitProvenance : undefined;
  const format = matchUp.matchUpFormat;
  Object.assign(matchUp, bindResultInputs ? toBePlayed : structuredClone(toBePlayed));
  if (provenance) matchUp.sideExitProvenance = provenance;
  if (format) matchUp.matchUpFormat = format;
}

function setResultFormatAndCodes(
  matchUp: MatchUp,
  op: Extract<OutcomeOp, { op: 'setMatchUpResult' }>,
  ordinary = false,
  bindResultInputs = false,
) {
  if (op.matchUpFormat) matchUp.matchUpFormat = op.matchUpFormat;
  if (op.matchUpStatusCodes) {
    matchUp.matchUpStatusCodes =
      ordinary || bindResultInputs ? op.matchUpStatusCodes : structuredClone(op.matchUpStatusCodes);
    if (ordinary && !op.matchUpStatusCodes.length) {
      delete matchUp.matchUpStatusCode;
      delete matchUp.sideStatusCodes;
    }
  }
}

/**
 * The draw's matchUps (a round robin's groups included) and its top-level structures, by id. A walk of what this draw
 * holds, not `getMatchUpsMap`: the draw folded into is a shadow COPY in `differential`, so there is no map of it to
 * reuse, and the pipeline's own map (the one build `verify:hydrations` holds to v1) is not rebuilt.
 */
function indexDraw(drawDefinition: DrawDefinition) {
  const matchUps = new Map<string, MatchUp>();
  const structureOf = new Map<string, string>();
  const structures = new Map<string, Structure>();
  // a round robin's groups, by id: the structures a tally is written in
  const groups = new Map<string, Structure>();
  const visit = (structure: Structure) => {
    for (const matchUp of matchUpsOf(structure) ?? []) {
      // a TEAM dual's lines are stored inside it, and written where they are (S7)
      for (const stored of [matchUp, ...(matchUp.tieMatchUps ?? [])]) {
        matchUps.set(stored.matchUpId, stored);
        structureOf.set(stored.matchUpId, structure.structureId);
      }
    }
    for (const child of structuresOf(structure) ?? []) {
      groups.set(child.structureId, child);
      visit(child);
    }
  };
  for (const structure of drawDefinition.structures ?? []) {
    structures.set(structure.structureId, structure);
    visit(structure);
  }
  return { matchUps, structureOf, structures, groups };
}

type DrawIndex = ReturnType<typeof indexDraw>;
type OpOf<K extends OutcomeOp['op']> = Extract<OutcomeOp, { op: K }>;
type Folded = { error?: string };

function foldMatchUpWrite(
  op: OpOf<'setMatchUpResult'> | OpOf<'setMatchUpDrawPositions'>,
  { matchUps, structureOf }: DrawIndex,
  drawDefinition: DrawDefinition,
  context: FoldContext,
): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `${op.op}: no matchUp ${op.matchUpId}` };
  if (op.op === 'setMatchUpResult') setMatchUpResult(matchUp, op, context);
  // through the one writer, which normalises the positions and re-keys a side's facts if an occupant changes side
  else {
    // v1's advance through a BYE (`assignDrawPositionBye`) writes the matchUp it advances into with no score, as a
    // removal does: a blank one a cleared result left there goes with it
    // The position writer assigns score below, after its own winner write.
    setMatchUpDrawPositions({
      structureId: structureOf.get(op.matchUpId),
      drawPositions: op.drawPositions,
      drawDefinition,
      matchUp,
    });
    // the pending exit the matchUp held goes with the position (v1's `updateMatchUpStatusAfterRemoval`, S7); a pending
    // exit has no winner, score or codes to take (`ownCarryAlone`)
    if (op.clearsPendingExit) {
      matchUp.matchUpStatus = TO_BE_PLAYED;
      setSideExitProvenance({ matchUp, provenance: undefined });
    }
    if (op.withdrawsPendingAward) delete matchUp.winningSide;
    if (op.withdrawsProducedExit) {
      matchUp.matchUpStatus = TO_BE_PLAYED;
      matchUp.winningSide = undefined;
      setSideExitProvenance({ matchUp, provenance: undefined });
      clearOrderOfFinishUnlessCompleted(matchUp);
    }
    // the arrival that decides the matchUp by the carried exit beside it: its codes re-derived (`progressExitStatus`)
    if (op.rederivesCodes) matchUp.matchUpStatusCodes = [];
    // The ordinary arrival writes this own key, observable before its notice reads the caller's clock.
    if (op.advancesThroughBye) matchUp.score = undefined;
    // A plain onward release leaves the result keys alone; its later reset inserts its own undefined winner.
    if (!op.preservesWinningSide && !op.releasedDrawPosition && !matchUp.winningSide) matchUp.winningSide = undefined;
    if (op.removedDrawPosition || op.clearsScore) matchUp.score = undefined;
  }
  return {};
}

function foldAssignPosition(op: OpOf<'assignPosition'> | OpOf<'relabelPosition'>, { structures }: DrawIndex): Folded {
  const assignment = positionAssignmentsOf(structures.get(op.structureId))?.find(
    (candidate) => candidate.drawPosition === op.drawPosition,
  );
  if (!assignment) return { error: `assignPosition: no drawPosition ${op.drawPosition} in ${op.structureId}` };
  assignment.participantId = op.participantId;
  return {};
}

function foldExchange(
  op: OpOf<'exchangeDrawPositions'>,
  { matchUps }: DrawIndex,
  drawDefinition: DrawDefinition,
): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `exchangeDrawPositions: no matchUp ${op.matchUpId}` };
  exchangeMatchUpPositions({
    structureId: op.structureId,
    positionA: op.positionA,
    positionB: op.positionB,
    drawDefinition,
    matchUp,
  });
  return {};
}

function foldClearPosition(op: OpOf<'clearPosition'>, { structures }: DrawIndex): Folded {
  const structure = structures.get(op.structureId);
  const assignment = positionAssignmentsOf(structure)?.find((candidate) => candidate.drawPosition === op.drawPosition);
  if (!structure || !assignment)
    return { error: `clearPosition: no drawPosition ${op.drawPosition} in ${op.structureId}` };
  delete assignment.participantId;
  // as v1 writes it: the structure's seeds without the participant, an absent list written empty
  Object.assign(structure, {
    seedAssignments: (structure.seedAssignments ?? []).filter(
      ({ participantId }) => participantId !== op.participantId,
    ),
  });
  return {};
}

function foldSideLineUp(op: OpOf<'setSideLineUp'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `setSideLineUp: no matchUp ${op.matchUpId}` };
  if (op.clearsLineUp) {
    const target = matchUp.sides?.find((side) => side.sideNumber === op.sideNumber);
    if (target) delete target.lineUp;
    return {};
  }
  const lineUp = structuredClone(op.lineUp) as TeamCompetitor[];
  matchUp.sides = [1, 2].map((sideNumber) => ({
    ...(matchUp.sides?.find((each) => each.sideNumber === sideNumber) ?? {}),
    sideNumber,
  }));
  const target = matchUp.sides.find(({ sideNumber }) => sideNumber === op.sideNumber);
  if (target) target.lineUp = lineUp;
  return {};
}

function foldOrderOfFinish(op: OpOf<'setOrderOfFinish'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `setOrderOfFinish: no matchUp ${op.matchUpId}` };
  if (op.orderOfFinish === undefined) delete matchUp.orderOfFinish;
  else matchUp.orderOfFinish = op.orderOfFinish;
  return {};
}

function foldSchedule(
  op: OpOf<'setMatchUpSchedule'> | OpOf<'clearMatchUpScoredTime'>,
  { matchUps }: DrawIndex,
  { temporal, pendingSchedules }: FoldContext,
): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `${op.op}: no matchUp ${op.matchUpId}` };
  temporal?.scoredTimes.delete(op.matchUpId);
  if (op.op === 'setMatchUpSchedule') {
    const schedule = structuredClone(op.schedule);
    // The public writer adds a new schedule after its outcome, before the scored-time write.
    if (pendingSchedules && !Object.hasOwn(matchUp, 'schedule')) pendingSchedules.set(matchUp, schedule);
    else matchUp.schedule = schedule;
  } else if (matchUp.schedule) delete matchUp.schedule.scoredTime;
  return {};
}

function foldStatusCodes(op: OpOf<'setMatchUpStatusCodes'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `setMatchUpStatusCodes: no matchUp ${op.matchUpId}` };
  matchUp.matchUpStatusCodes = structuredClone(op.matchUpStatusCodes);
  return {};
}

function foldProvenance(op: OpOf<'mergeSideExitProvenance'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `mergeSideExitProvenance: no matchUp ${op.matchUpId}` };
  mergeSideExitProvenance({ matchUp, provenance: structuredClone(op.provenance) });
  return {};
}

function foldSetProvenance(op: OpOf<'setSideExitProvenance'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `setSideExitProvenance: no matchUp ${op.matchUpId}` };
  setSideExitProvenance({ matchUp, provenance: op.provenance && structuredClone(op.provenance) });
  if (op.blankExitSide) blankSideExitCode(matchUp, op.blankExitSide);
  return {};
}

function foldAssignBye(op: OpOf<'assignBye'>, { structures, groups, matchUps }: DrawIndex): Folded {
  const positionAssignments = positionAssignmentsOf(structures.get(op.structureId) ?? groups.get(op.structureId));
  if (!positionAssignments) return { error: `assignBye: no structure ${op.structureId}` };
  let assignment = positionAssignments.find((candidate) => candidate.drawPosition === op.drawPosition);
  // as `assignDrawPositionBye`: a position the matchUps name but the assignments do not is added
  if (!assignment) {
    assignment = { drawPosition: op.drawPosition };
    positionAssignments.push(assignment);
  }
  if (op.clearsDisplacedPosition && assignment.participantId) {
    delete assignment.participantId;
    const matchUp = op.matchUpId && matchUps.get(op.matchUpId);
    if (matchUp) delete matchUp.winningSide;
  }
  assignment.bye = true;
  assignment.participantId = undefined;
  assignment.byeFromPropagation = true;
  return {};
}

function foldSetMatchUpBye(op: OpOf<'setMatchUpBye'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `setMatchUpBye: no matchUp ${op.matchUpId}` };
  Object.assign(matchUp, { matchUpStatus: BYE, score: undefined, winningSide: undefined });
  if (!op.preservesOrderOfFinish) clearOrderOfFinishUnlessCompleted(matchUp);
  return {};
}

function foldWithdrawBye(op: OpOf<'withdrawBye'>, { structures, groups, matchUps }: DrawIndex): Folded {
  const positionAssignments = positionAssignmentsOf(structures.get(op.structureId) ?? groups.get(op.structureId));
  const assignment = positionAssignments?.find((candidate) => candidate.drawPosition === op.drawPosition);
  if (!assignment) return { error: `withdrawBye: no drawPosition ${op.drawPosition} in ${op.structureId}` };
  for (const id of op.clearedWinnerIds ?? []) {
    const matchUp = matchUps.get(id);
    if (!matchUp) return { error: `withdrawBye: no matchUp ${id}` };
    matchUp.winningSide = undefined;
  }
  delete assignment.bye;
  delete assignment.byeFromPropagation;
  if (assignment.participantId === undefined) delete assignment.participantId;
  return {};
}

function foldClearMatchUpBye(op: OpOf<'clearMatchUpBye'>, { matchUps }: DrawIndex): Folded {
  const matchUp = matchUps.get(op.matchUpId);
  if (!matchUp) return { error: `clearMatchUpBye: no matchUp ${op.matchUpId}` };
  matchUp.matchUpStatus = op.rederived?.matchUpStatus ?? TO_BE_PLAYED;
  matchUp.winningSide = op.rederived?.winningSide;
  // positionClear clears the side record before restoring the retained entry, so its own key moves last.
  const retained = op.rederived && matchUp.sideExitProvenance ? { ...matchUp.sideExitProvenance } : undefined;
  clearSideExitProvenance(matchUp);
  if (retained) setSideExitProvenance({ matchUp, provenance: retained });
  clearResolvedSideExitProvenance(matchUp);
  clearOrderOfFinishUnlessCompleted(matchUp);
  return {};
}

// a matchUp that is no longer complete has no place in its cohort's order of finish (`setOrderOfFinish`); v1 clears it
// in modifyMatchUpScore, so the two pipelines write the same record
function clearOrderOfFinishUnlessCompleted(matchUp: MatchUp): void {
  if (!completedMatchUpStatuses.includes(matchUp.matchUpStatus as MatchUpStatusUnion)) delete matchUp.orderOfFinish;
}

function foldParticipantResults(op: OpOf<'setParticipantResults'>, { groups, structures }: DrawIndex): Folded {
  const structure = groups.get(op.structureId) ?? structures.get(op.structureId);
  if (structure && op.participantIds)
    Object.assign(structure, {
      positionAssignments: op.participantIds.map((participantId) => ({ participantId }) as PositionAssignment),
    });
  const positionAssignments = positionAssignmentsOf(structure);
  if (!positionAssignments) return { error: `setParticipantResults: no group ${op.structureId}` };
  writeAssignmentResults({ positionAssignments, participantResults: op.participantResults });
  return {};
}

function foldStamp(
  op: OpOf<'stampUpdatedAt'>,
  { matchUps, structures }: DrawIndex,
  drawDefinition: DrawDefinition,
  context: FoldContext,
): Folded {
  if (op.entity === 'drawDefinition') {
    if (op.id !== drawDefinition.drawId) return { error: `stampUpdatedAt: not this draw ${op.id}` };
    stamp(drawDefinition as Stamped, `drawDefinition:${op.id}`, context);
    return {};
  }
  const target = op.entity === 'matchUp' ? matchUps.get(op.id) : structures.get(op.id);
  if (!target) return { error: `stampUpdatedAt: no ${op.entity} ${op.id}` };
  stamp(target as Stamped, `${op.entity}:${op.id}`, context);
  if (op.entity === 'matchUp') flushScoredTime(target as MatchUp, context);
  return {};
}

/**
 * Fold `ops`, in order, into `drawDefinition`: the live stored draw, or a stored-shape copy of it. Ids resolve against
 * the draw given, never against a hydrated copy. An op naming something the draw does not hold is a planner defect,
 * returned rather than ignored, so a shadow apply cannot pass by writing nothing.
 */
export function applyOutcomeOps(
  drawDefinition: DrawDefinition,
  ops: OutcomeOp[],
  stampedBefore?: Set<string>,
  effects: Omit<FoldContext, 'stampedBefore'> = {},
): Folded {
  const index = indexDraw(drawDefinition);
  const context: FoldContext = {
    ...effects,
    stampedBefore,
    ...(effects.bindResultInputs ? { pendingScoredTimes: new Map(), pendingSchedules: new Map() } : {}),
  };
  for (const op of ops) {
    const folded = foldOne(op, index, drawDefinition, context);
    if (folded.error) return folded;
  }
  for (const matchUp of new Set([
    ...(context.pendingScoredTimes?.keys() ?? []),
    ...(context.pendingSchedules?.keys() ?? []),
  ]))
    flushScoredTime(matchUp, context);
  return {};
}

function foldOne(op: OutcomeOp, index: DrawIndex, drawDefinition: DrawDefinition, context: FoldContext): Folded {
  switch (op.op) {
    case 'setMatchUpResult':
    case 'setMatchUpDrawPositions':
      return foldMatchUpWrite(op, index, drawDefinition, context);
    case 'assignPosition':
    case 'relabelPosition':
      return foldAssignPosition(op, index);
    case 'exchangeDrawPositions':
      return foldExchange(op, index, drawDefinition);
    case 'clearPosition':
      return foldClearPosition(op, index);
    case 'setMatchUpStatusCodes':
      return foldStatusCodes(op, index);
    case 'mergeSideExitProvenance':
      return foldProvenance(op, index);
    case 'setSideExitProvenance':
      return foldSetProvenance(op, index);
    case 'announcePositionAssignments':
      return {};
    case 'assignBye':
      return foldAssignBye(op, index);
    case 'setMatchUpBye':
      return foldSetMatchUpBye(op, index);
    case 'withdrawBye':
      return foldWithdrawBye(op, index);
    case 'clearMatchUpBye':
      return foldClearMatchUpBye(op, index);
    case 'setParticipantResults':
      return foldParticipantResults(op, index);
    case 'setSideLineUp':
      return foldSideLineUp(op, index);
    case 'setMatchUpSchedule':
    case 'clearMatchUpScoredTime':
      return foldSchedule(op, index, context);
    case 'setOrderOfFinish':
      return foldOrderOfFinish(op, index);
    default:
      return foldStamp(op, index, drawDefinition, context);
  }
}

/** Flush at the result writer's stamp; a remaining unstamped result flushes when its fold completes. */
function flushScoredTime(matchUp: MatchUp, { pendingScoredTimes, pendingSchedules }: FoldContext): void {
  const schedule = pendingSchedules?.get(matchUp);
  if (schedule) {
    matchUp.schedule = schedule;
    pendingSchedules?.delete(matchUp);
  }
  const scoredTime = pendingScoredTimes?.get(matchUp);
  if (scoredTime === undefined) return;
  matchUp.schedule ??= {};
  matchUp.schedule.scoredTime = scoredTime;
  pendingScoredTimes?.delete(matchUp);
}
