import { normalizeDrawPositions } from '@Mutate/matchUps/drawPositions/normalizeDrawPositions';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

const RELEASABLE_STATUSES: (string | undefined)[] = [undefined, TO_BE_PLAYED, BYE];

type ReleaseAdvancedDrawPositionArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
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
    if (matchUp.winningSide || !RELEASABLE_STATUSES.includes(matchUp.matchUpStatus)) continue;
    if (advancedByBye({ byeDrawPositions, drawPosition, matchUps, matchUp })) continue;

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
