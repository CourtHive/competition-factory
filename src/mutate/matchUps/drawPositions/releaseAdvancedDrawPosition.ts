import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { bringCarryHome, carryLeavingWith } from '@Mutate/matchUps/drawPositions/carryHome';
import { withdrawByeSeats } from '@Mutate/matchUps/matchUpStatus/applyWithdrawnExits';
import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { awardStands } from './positionClear';
import {
  deriveExitStateFromProvenance,
  getSideExitProvenance,
  withdrawArrivalFrom,
  withdrawRelayedExit,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

const RELEASABLE_STATUSES: (string | undefined)[] = [undefined, TO_BE_PLAYED, BYE];

type ReleaseAdvancedDrawPositionArgs = {
  /** the BYE this position passed has been taken back (`releaseHoldersByeFromTarget`): a matchUp onward decided only by
   *  the carry leaving with the position, for a seat nobody holds, is released with it */
  passedByeReleased?: boolean;
  /** the participant in this position has left it (see `releaseLinkedWinnerAdvancement`), so an exit awarded to
   *  their seat is held open for whoever arrives next, as it is for `withdrawingExit` */
  occupantLeaving?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  withdrawingExit?: boolean;
  matchUpsMap?: MatchUpsMap;
  fromRoundNumber: number;
  drawPosition: number;
  structureId: string;
  event?: Event;
};

/**
 * Drop a drawPosition from the matchUps that hold it only by ADVANCEMENT.
 *
 * Emptying a `positionAssignment` is only half of a removal. The drawPosition is still carried by
 * every matchUp the participant had advanced into, and `getUpdatedDrawPositions` can only claim a
 * slot that is `undefined` in the array — so a position left behind blocks that slot permanently and
 * the next arrival is refused with DRAW_POSITION_ASSIGNED for a matchUp that is, in substance, half
 * empty. This makes `drawPositions` mean "positions this matchUp actually holds".
 *
 * Two scopes keep it from removing a position that is load-bearing, and both were measured rather
 * than assumed:
 *
 *  1. **The round where the position FIRST appears is never touched.** That matchUp owns the slot
 *     structurally — a feed round awaiting its arrival legitimately holds a position whose
 *     assignment is still vacant, and releasing it would break the arrival path. Measured over the
 *     600-seed sweep window: of the vacant slots seen at a refusal, 38 were exactly this case.
 *
 *  3. **A position advanced by a BYE is never released.** A BYE advancement is not a result — CA,
 *     2026-09-21, the same ruling `resetDrawDefinition` was corrected under in #4944 — so undoing a
 *     result must leave it exactly where the POSITIONING put it. Without this, clearing a result
 *     that fed a participant into a structure also destroyed the BYE advancement that had been
 *     there since generation: measured on COMPASS 16/14 `nonRandom: 20223109`, where `West|2|1`
 *     holds `[2, null]` in a freshly generated draw because `West|1|1` is a BYE, and a
 *     win-then-clear at `East|1|2` left it `[]`. Scoring the same outcome WITHOUT the intervening
 *     clear left it `[2, null]`, so the same draw reached two different states by two routes.
 *
 *  2. **Only an UNDECIDED matchUp releases a slot.** `drawPositions` is POSITIONAL — the index
 *     carries the side — while `getUpdatedDrawPositions` sorts and compacts, so removing a position
 *     and re-adding it inside the same mutation is not identity-preserving. A re-score directs a new
 *     loser into the SAME seat, and on a matchUp that already records an outcome the round-trip
 *     rewrote its `winningSide`. A matchUp with a recorded result therefore keeps its array; only
 *     TO_BE_PLAYED and BYE, with no winningSide, release.
 *
 * What survives is stored alone (`normalizeDrawPositions`); its side is read structurally, so
 * compacting it does not move it.
 */
export function releaseAdvancedDrawPosition({
  passedByeReleased,
  occupantLeaving,
  tournamentRecord,
  fromRoundNumber,
  withdrawingExit,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  structureId,
  event,
}: ReleaseAdvancedDrawPositionArgs): {
  success: boolean;
  releasedRoundNumbers: number[];
  /** the matchUps a BYE position was released from, with the positions still in them: they advanced past that BYE */
  vacatedByes: { roundNumber: number; remaining: number[] }[];
} {
  const resolvedMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const matchUps = resolvedMap?.mappedMatchUps?.[structureId]?.matchUps ?? [];
  const { initialRoundNumber } = getInitialRoundNumber({ drawPosition, matchUps });

  // BYE-ness is read from the positionAssignment, never from matchUpStatus, which a cascade may
  // already have overwritten — CA's ruling of 2026-09-20, and the trap named in #4944.
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  const byeDrawPositions = new Set(
    (positionAssignments ?? []).filter(({ bye }) => bye).map(({ drawPosition: position }) => position),
  );

  const releasable = (
    matchUp: (typeof matchUps)[number],
  ): matchUp is (typeof matchUps)[number] & { roundNumber: number } =>
    matchUp.roundNumber !== undefined &&
    matchUp.roundNumber >= fromRoundNumber &&
    matchUp.roundNumber !== initialRoundNumber &&
    !!matchUp.drawPositions?.includes(drawPosition);
  // WHETHER A SEAT IS HELD OPEN FOR AN ARRIVAL IS ALSO ASKED OF THE DRAW BEFORE THIS PASS TAKES ANYTHING, for the one
  // case the pass cannot answer itself. It reads which position holds the winning side, and a lone position's side is
  // read through the feeder that delivered it, which this same pass may already have released. Census de 9301596
  // (DOUBLE_ELIMINATION 16/13): dp 12, BYE-advanced from `Backdraw|4|2` and awarded `Backdraw|5|1` by a convergence's
  // produced exit, was released from `4|2` first; `5|1`'s side then read nothing, the award was not seen as one, and
  // the participant stayed in `5|1`, advanced out of a feeder that no longer held them (ADVANCED_FROM_UNDECIDED). Only
  // where that read now comes back empty does the earlier answer stand: asked up front throughout, it released a
  // Backdraw matchUp decided by a carried exit (census de 9300487, `anArrivalOnTheExitingSideTakesNothing`).
  const heldOpen = new Set(
    withdrawingExit || occupantLeaving
      ? matchUps
          .filter(releasable)
          .filter((matchUp) => awaitsArrivalOnSide({ drawDefinition, structureId, drawPosition, matchUp, matchUps }))
          .map((matchUp) => matchUp.matchUpId)
      : [],
  );

  // the exit the released participant carried into each round, read up front for the same reason: its side is read
  // through the feeder that delivered the position, which this pass releases first (see the carry home, below)
  const carriesLeaving = new Map(
    matchUps.filter(releasable).map((matchUp) => [
      matchUp.matchUpId,
      carryLeavingWith({
        positionAssignments: positionAssignments ?? [],
        drawDefinition,
        drawPosition,
        structureId,
        matchUp,
      }),
    ]),
  );

  // ...and the feeder that delivered the position into each round, for the same reason: it is released first
  const deliveredBy = new Map(
    matchUps
      .filter(releasable)
      .map((matchUp) => [matchUp.matchUpId, latestFeeder({ drawPosition, matchUps, matchUp })?.matchUpId]),
  );

  const releasedRoundNumbers: number[] = [];
  const vacatedByes: { roundNumber: number; remaining: number[] }[] = [];
  const withdrawnAwards: string[] = [];
  for (const matchUp of matchUps) {
    if (!releasable(matchUp)) continue;
    const heldOpenForArrival =
      (withdrawingExit || occupantLeaving) &&
      (awaitsArrivalOnSide({ drawDefinition, structureId, drawPosition, matchUp, matchUps }) ||
        (heldOpen.has(matchUp.matchUpId) && !getWinningSideDrawPosition({ drawDefinition, structureId, matchUp })));
    // A PENDING exit is undecided: "a produced exit has no winningSide until a participant arrives" (CA, 2026-09-20).
    // Scope 2 read its exit status as a recorded result and kept the array, so a reservation advanced into it past a
    // BYE stayed when the exit that made it was withdrawn: census 20278127 (FIRST_MATCH_LOSER_CONSOLATION 16/16,
    // `doubleExitPropagateBye: false`), dp 7 — an empty fed seat RULE 2 had awarded `Consolation|1|2` — left `2|2` and
    // not `3|1`, where a produced walkover waited; the walkover then arriving opposite could not converge with it, and
    // the seat it fed waited forever (`aReservationGoesPastTheByeItCrossed`). The exit itself stands, for whoever arrives.
    // A double exit is no result either: it advances nobody, so a position advanced into one is taken back too (census
    // S8 policy-off, FEED_IN_CHAMPIONSHIP 16/11 21123326: a double exit's own dp 9 left `Consolation|4|1` and stayed in
    // `5|1`, past `4|1`'s BYE, and the next arrival there was refused after a write;
    // `aDoubleExitsOwnPositionLeavesEveryRoundItReached`).
    const pendingExit = withdrawingExit && !matchUp.winningSide && isAnyExit(matchUp.matchUpStatus);
    // ...and, once the BYE this position passed has been taken back, a matchUp decided ONLY by the carry leaving with it
    // is no result of its own: RULE 2 awarded the seat opposite because this occupant arrived carrying an exit. The carry
    // goes home below and the position with it (census F2, FEED_IN_CHAMPIONSHIP_TO_SF 16/16, 20501324: `Consolation|4|1`
    // DEFAULTED for its empty fed seat by the default Jane carried past a BYE that has since gone). The award stays where
    // the seat opposite is held: whoever holds it may have gone on from it, and the BYE is taken back only because the
    // holder's exit is being sent on, where it meets the carry and the convergence produces into this matchUp for that
    // same seat. Kept out, the carrier stood here beside the produced exit, the matchUp a round on read both, and the
    // forward order decided which (census A1 wave 3 R11b: FEED_IN_CHAMPIONSHIP_TO_SF 16 21089693, CURTIS_CONSOLATION 16
    // 21143807, MODIFIED_FEED_IN_CHAMPIONSHIP 16 21046667: `aPasserComesBackWhenTheHoldersByeGoes`).
    // So too when the occupant LEAVES the structure that sent them across a link (`occupantLeaving`) and the award names
    // a seat nobody holds, so nobody can have gone on from it (Phase C closure gate, openings policy off, 2026-10-25,
    // DOUBLE_ELIMINATION 8/4 21157227: a carrier taken back out of the Backdraw final stayed in the grand final, a
    // walkover won by its emptied seat, and the next Backdraw champion was refused there;
    // `aCarrierLeavingTheBackdrawLeavesTheGrandFinal`).
    const awardedPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
    const decidedByLeavingCarry =
      (passedByeReleased || (occupantLeaving && !awardedPosition)) &&
      !!matchUp.winningSide &&
      !!carriesLeaving.get(matchUp.matchUpId) &&
      awardedPosition !== drawPosition;
    if (
      !heldOpenForArrival &&
      !pendingExit &&
      !decidedByLeavingCarry &&
      (matchUp.winningSide || !RELEASABLE_STATUSES.includes(matchUp.matchUpStatus))
    )
      continue;
    if (advancedByBye({ byeDrawPositions, drawPosition, matchUps, matchUp })) continue;
    if (
      !withdrawingExit &&
      advancedByProducedExit({
        positionAssignments: positionAssignments ?? [],
        occupantLeaving,
        drawDefinition,
        drawPosition,
        structureId,
        matchUps,
        matchUp,
      })
    ) {
      continue;
    }

    const carry = carriesLeaving.get(matchUp.matchUpId);

    // Removal, not substitution: mapping a position to `undefined` preserves ascending order.
    // Any writer that SUBSTITUTES must re-sort — see the canonical statement in
    // `getOrderedDrawPositions`. Settled through `normalizeDrawPositions`, which keeps a hole
    // beside a survivor and collapses an all-holes result to `[]`.
    // ...and the participant who stays can change side as the seat empties: `setMatchUpDrawPositions` moves what
    // is recorded by side with them.
    setMatchUpDrawPositions({
      drawPositions: (matchUp.drawPositions ?? []).map((position) =>
        position === drawPosition ? undefined : position,
      ),
      drawDefinition,
      structureId,
      matchUp,
    });
    releasedRoundNumbers.push(matchUp.roundNumber);
    // A RELEASED POSITION TAKES ITS ARRIVAL WITH IT. The record that its occupant won their way here names the feeder
    // that delivered them, and that feeder is undecided again once the position goes; left behind, the record named a
    // source that had sent nobody (census A1 case 25, FIRST_MATCH_LOSER_CONSOLATION 16/13 20483283 `on`: a double
    // walkover at `Main|2|4` and its clear took dp 3 out of `Consolation|4|1` and left `Consolation|3|2`'s arrival on
    // side 2, ARRIVAL_TRUE). Provenance "records where each side came from" (exit-propagation.md), so a side nobody
    // came to has no record.
    withdrawArrivalFrom({ sourceMatchUpId: deliveredBy.get(matchUp.matchUpId), matchUp });

    if (byeDrawPositions.has(drawPosition)) {
      // whoever stayed advanced past this BYE on its strength (`yieldSquattingPropagatedBye`), and comes back with it —
      // the caller's to release, since it crosses rounds and links (`releaseAdvancedDrawPositionAcrossLinks`)
      const remaining = (matchUp.drawPositions ?? []).filter((position): position is number => !!position);
      vacatedByes.push({ roundNumber: matchUp.roundNumber, remaining });
      // and the BYE label went with the BYE position: what remains is the exit the matchUp still records, or undecided
      if (matchUp.matchUpStatus === BYE && !remaining.some((position) => byeDrawPositions.has(position))) {
        matchUp.matchUpStatus =
          deriveExitStateFromProvenance(getSideExitProvenance({ matchUp }))?.matchUpStatus ?? TO_BE_PLAYED;
      }
    }

    // A PRODUCED exit has no winningSide until a participant arrives (CA, 2026-09-20). Its award was read off the
    // participant who stood in this seat, so with the seat empty again the award goes with them; the exit stands,
    // pending. A CARRIED exit keeps its winningSide on an empty seat by design (exit-propagation.md).
    if (heldOpenForArrival && awardedByProducedExit({ drawPosition, matchUps, matchUp })) {
      matchUp.winningSide = undefined;
      withdrawnAwards.push(matchUp.matchUpId);
    }

    /**
     * A CARRY GOES HOME WITH ITS CARRIER (P53). An exit carried past BYEs is written where the carrier lands; when a
     * BYE they passed is withdrawn, this release takes them back out of the rounds the BYE had moved them through — and
     * the carry stayed behind, a decided exit over an empty seat that the next arrival "lost" (census de 9300487:
     * Hedges' default, carried past two BYEs into `Backdraw|3|1`, stayed there when `Main|1|6`'s double walkover was
     * re-scored and he went back to `Backdraw|1|2`). `removeSubsequentRoundsParticipant` brings a carry home on the
     * removal path (P50); this is the release path. The carrier's own side only: an exit carried by the OPPONENT keeps
     * its winningSide on the emptied seat, as above.
     */
    if (carry?.sourceMatchUpId) {
      withdrawRelayedExit({ sourceMatchUpId: carry.sourceMatchUpId, drawDefinition, structureId, matchUp });
      bringCarryHome({ carry, from: matchUp, drawPosition, matchUps, drawDefinition, structureId });
    }

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'releaseAdvancedDrawPosition',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
    });
  }

  // ...and so does the BYE the award sent over its loser link for a loser who is nobody (P39): a pending exit sends
  // nothing there, as on the other paths that take an award back (`anUndoneAwardTakesBackItsLoserSeatBye`). Census run
  // 19, COMPASS 16/13 20849541 policy off: re-scoring `East|1|3` from a walkover took `West|1|2`'s winner out of
  // `West|2|1`, whose award over `East|1|2`'s produced walkover went and left `Southwest|1|1` dp 1 a BYE nothing owed
  // (`aRederivedConvergenceKeepsTheByeClaimsOfOthers`). Withdrawn once the pass is done, so a seat it clears cannot
  // move a matchUp this pass is still reading
  for (const claimantMatchUpId of withdrawnAwards) {
    withdrawByeSeats({ claimantMatchUpId, tournamentRecord, drawDefinition, matchUpsMap: resolvedMap, event });
  }

  return { ...SUCCESS, releasedRoundNumbers, vacatedByes };
}

/** the exit standing against this seat came from a double exit (produced), not with a participant (carried) */
function awardedByProducedExit({ drawPosition, matchUps, matchUp }): boolean {
  const delivered = latestFeeder({ drawPosition, matchUps, matchUp })?.matchUpId;
  const against = Object.values(getSideExitProvenance({ matchUp }) ?? {}).filter(
    (entry: any) => isExit(entry?.matchUpStatus) && !!entry?.sourceMatchUpId && entry.sourceMatchUpId !== delivered,
  );
  return against.length > 0 && against.every((entry: any) => isDoubleExit(entry?.previousMatchUpStatus));
}

/**
 * A matchUp whose winningSide is an exit's AWARD to the seat this position sits in, not a result of its own.
 *
 * Scope 2 keeps a decided matchUp's array, because a re-score that removes and re-adds a position inside one
 * mutation rewrote its winningSide. A matchUp decided ONLY by an exit carried in on the OTHER side is not that:
 * its winningSide names the seat, and "the side yet to arrive wins, even while still empty" (exit-propagation.md,
 * the pending exit). When a withdrawal takes back the exit that advanced this position into that seat, the seat
 * is empty again and the exit stands, pending, for whoever arrives there next.
 *
 * Measured 2026-10-04, census w2 9100343 (OLYMPIC 16/11): `East|1|4` WALKOVER carried its loser's exit into
 * `West|2|1`, whose winner advanced to `West|3|1`, already DEFAULTED towards that seat by an exit carried from
 * `East|1|5`. Re-scoring `East|1|4` to the other winner withdrew the walkover at `West|2|1` and left the winner
 * in `West|3|1`, advanced out of an undecided matchUp; the next result there was refused.
 *
 * WHOSE exit it is, is read from the entry's SOURCE, never from its side key. Sides re-sort by drawPosition
 * once a participant arrives, so an exit stamped on an empty seat can end up keyed to the side the winner now
 * holds (census w1 9000477, COMPASS 32/29: `South|3|1` WALKOVER won by side 1, its produced exit's entry also
 * keyed side 1). An entry the winner brought with them names the matchUp that delivered their drawPosition; an
 * exit carried or produced for the other seat names any other source.
 */
function awaitsArrivalOnSide({ drawDefinition, structureId, drawPosition, matchUp, matchUps }): boolean {
  if (!isExit(matchUp.matchUpStatus) || !matchUp.winningSide || matchUp.score?.scoreStringSide1) return false;
  if (getWinningSideDrawPosition({ drawDefinition, structureId, matchUp }) !== drawPosition) return false;
  const delivered = latestFeeder({ drawPosition, matchUps, matchUp })?.matchUpId;
  return Object.values(getSideExitProvenance({ matchUp }) ?? {}).some(
    (entry: any) => isExit(entry?.matchUpStatus) && !!entry?.sourceMatchUpId && entry.sourceMatchUpId !== delivered,
  );
}

/** the latest earlier round in this structure that holds the drawPosition: the matchUp that delivered it here */
function latestFeeder({ drawPosition, matchUps, matchUp }) {
  const feeders = matchUps.filter(
    (candidate) =>
      candidate.roundNumber !== undefined &&
      candidate.roundNumber < (matchUp.roundNumber as number) &&
      candidate.drawPositions?.includes(drawPosition),
  );
  if (!feeders.length) return undefined;
  return feeders.reduce((latest, candidate) =>
    (candidate.roundNumber as number) > (latest.roundNumber as number) ? candidate : latest,
  );
}

/**
 * Did this drawPosition reach this matchUp without a match being played?
 *
 * The feeder is the LATEST earlier round in this structure that holds the position — structure-local
 * like every other release in the engine, and derived from round containment rather than
 * `winnerMatchUpId`, which the raw matchUps this function mutates do not carry.
 *
 * A feeder holding a BYE drawPosition advanced its survivor structurally, so what it delivered is
 * positioning rather than a result. Consecutive bye rounds fall out for free: every feeder in the
 * chain holds a BYE, so every round of the chain is skipped. A position that BYE-advanced and then
 * won a real match is NOT protected beyond that match — its next feeder holds no BYE, and releasing
 * there is exactly what undoing that result should do.
 */
function advancedByBye({ byeDrawPositions, drawPosition, matchUps, matchUp }): boolean {
  const feeder = latestFeeder({ drawPosition, matchUps, matchUp });
  if (!feeder) return false;
  const byes = (feeder.drawPositions ?? []).filter((position) => byeDrawPositions.has(position));
  // The BYE's OWN position advances only beside another BYE (`advanceWinner`: a BYE stays put and its opponent moves).
  // Found alone in a later round, it was advanced as an EMPTY seat — the reservation a pending produced exit makes for
  // whoever falls through — and the BYE landed in it afterwards. That advance is the exit's, and goes with it
  // (census 20178071).
  return byeDrawPositions.has(drawPosition) ? byes.length === 2 : byes.length > 0;
}

/**
 * Did a PRODUCED EXIT advance this drawPosition, rather than anybody sitting in it?
 *
 * A double exit delivers an exit into one side of its loser target, and the target's OTHER seat wins
 * it — before anyone has arrived there. That seat is advanced at once, so the advancement belongs to
 * the produced exit and not to whoever later occupies the seat. Removing the occupant is therefore
 * not a reason to take it back, for the same reason a BYE advancement is not: neither is a result of
 * the match being undone.
 *
 * Measured 2026-09-28, FIRST_ROUND_LOSER_CONSOLATION 8/8 `nonRandom: 9000230`. With `Main|1|1` a
 * DOUBLE_WALKOVER, scoring `Main|1|2` and then CLEARING it did not return the draw to where it was:
 *
 * ```text
 * [D1]               Consolation|2|1  TO_BE_PLAYED dp=2
 * [D1, S2, clear 2]  Consolation|2|1  TO_BE_PLAYED dp=-
 * ```
 *
 * The feeder is identified exactly as `advancedByBye` identifies it. It advanced this position on
 * its own account when it is a single exit whose WINNING side holds the position and whose other
 * side carries a DELIVERED double exit — asked of provenance, not of the status alone, because a
 * walkover a referee recorded awards its winner too and that one IS a result.
 *
 * `withdrawingExit` opts out: `applyWithdrawnExits` releases precisely this advancement, because
 * there the produced exit itself is what is being taken back.
 */
function advancedByProducedExit({
  positionAssignments,
  occupantLeaving,
  drawDefinition,
  drawPosition,
  structureId,
  matchUps,
  matchUp,
}): boolean {
  const feeder = latestFeeder({ drawPosition, matchUps, matchUp });
  if (!feeder) return false;
  if (!isExit(feeder.matchUpStatus) || !feeder.winningSide) return false;
  if (getWinningSideDrawPosition({ drawDefinition, structureId, matchUp: feeder }) !== drawPosition) return false;

  const provenance = getSideExitProvenance({ matchUp: feeder });
  if (!isDoubleExit(provenance?.[3 - feeder.winningSide]?.previousMatchUpStatus)) return false;
  // PROTOTYPE (census A1 int2 dpws): the advance is the produced exit's only while its award would stand with the seat
  // empty; an award read off the occupant who is leaving is taken back (`withdrawAwardsToEmptiedSeats`), and the
  // position it advanced goes with it
  if (!occupantLeaving) return true;
  return awardStands({
    rederived: { matchUpStatus: feeder.matchUpStatus, winningSide: feeder.winningSide },
    retained: provenance,
    targetMatchUp: feeder,
    positionAssignments,
    drawDefinition,
    structureId,
  });
}
