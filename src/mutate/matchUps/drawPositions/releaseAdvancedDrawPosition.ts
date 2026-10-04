import { normalizeDrawPositions } from '@Mutate/matchUps/drawPositions/normalizeDrawPositions';
import { getSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

const RELEASABLE_STATUSES: (string | undefined)[] = [undefined, TO_BE_PLAYED, BYE];

type ReleaseAdvancedDrawPositionArgs = {
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
 * The hole is preserved rather than compacted, for the same positional reason: closing it would
 * shift the surviving position onto the other side.
 */
export function releaseAdvancedDrawPosition({
  tournamentRecord,
  fromRoundNumber,
  withdrawingExit,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  structureId,
  event,
}: ReleaseAdvancedDrawPositionArgs) {
  const resolvedMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const matchUps = resolvedMap?.mappedMatchUps?.[structureId]?.matchUps ?? [];
  const { initialRoundNumber } = getInitialRoundNumber({ drawPosition, matchUps });

  // BYE-ness is read from the positionAssignment, never from matchUpStatus, which a cascade may
  // already have overwritten — CA's ruling of 2026-09-20, and the trap named in #4944.
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  const byeDrawPositions = new Set(
    (positionAssignments ?? []).filter(({ bye }) => bye).map(({ drawPosition: position }) => position),
  );

  for (const matchUp of matchUps) {
    if (matchUp.roundNumber === undefined || matchUp.roundNumber < fromRoundNumber) continue;
    if (matchUp.roundNumber === initialRoundNumber) continue;
    if (!matchUp.drawPositions?.includes(drawPosition)) continue;
    const heldOpenForArrival =
      withdrawingExit && awaitsArrivalOnSide({ drawDefinition, structureId, drawPosition, matchUp });
    if (!heldOpenForArrival && (matchUp.winningSide || !RELEASABLE_STATUSES.includes(matchUp.matchUpStatus))) continue;
    if (advancedByBye({ byeDrawPositions, drawPosition, matchUps, matchUp })) continue;
    if (!withdrawingExit && advancedByProducedExit({ drawDefinition, structureId, drawPosition, matchUps, matchUp })) {
      continue;
    }

    // Removal, not substitution: mapping a position to `undefined` preserves ascending order.
    // Any writer that SUBSTITUTES must re-sort — see the canonical statement in
    // `getOrderedDrawPositions`. Settled through `normalizeDrawPositions`, which keeps a hole
    // beside a survivor and collapses an all-holes result to `[]`.
    matchUp.drawPositions = normalizeDrawPositions(
      (matchUp.drawPositions ?? []).map((position) => (position === drawPosition ? undefined : position)),
    );

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'releaseAdvancedDrawPosition',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
    });
  }

  return { ...SUCCESS };
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
 */
function awaitsArrivalOnSide({ drawDefinition, structureId, drawPosition, matchUp }): boolean {
  if (!isExit(matchUp.matchUpStatus) || !matchUp.winningSide || matchUp.score?.scoreStringSide1) return false;
  if (getWinningSideDrawPosition({ drawDefinition, structureId, matchUp }) !== drawPosition) return false;
  const provenance = getSideExitProvenance({ matchUp });
  return isExit(provenance?.[3 - matchUp.winningSide]?.matchUpStatus);
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
  const roundNumber = matchUp.roundNumber as number;
  const feeders = matchUps.filter(
    (candidate) =>
      candidate.roundNumber !== undefined &&
      candidate.roundNumber < roundNumber &&
      candidate.drawPositions?.includes(drawPosition),
  );
  if (!feeders.length) return false;

  const feeder = feeders.reduce((latest, candidate) =>
    (candidate.roundNumber as number) > (latest.roundNumber as number) ? candidate : latest,
  );
  return (feeder.drawPositions ?? []).some((position) => byeDrawPositions.has(position));
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
function advancedByProducedExit({ drawDefinition, structureId, drawPosition, matchUps, matchUp }): boolean {
  const roundNumber = matchUp.roundNumber as number;
  const feeders = matchUps.filter(
    (candidate) =>
      candidate.roundNumber !== undefined &&
      candidate.roundNumber < roundNumber &&
      candidate.drawPositions?.includes(drawPosition),
  );
  if (!feeders.length) return false;

  const feeder = feeders.reduce((latest, candidate) =>
    (candidate.roundNumber as number) > (latest.roundNumber as number) ? candidate : latest,
  );
  if (!isExit(feeder.matchUpStatus) || !feeder.winningSide) return false;
  if (getWinningSideDrawPosition({ drawDefinition, structureId, matchUp: feeder }) !== drawPosition) return false;

  const provenance = getSideExitProvenance({ matchUp: feeder });
  return isDoubleExit(provenance?.[3 - feeder.winningSide]?.previousMatchUpStatus);
}
