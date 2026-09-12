import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';

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

  for (const matchUp of matchUps) {
    if (matchUp.roundNumber === undefined || matchUp.roundNumber < fromRoundNumber) continue;
    if (matchUp.roundNumber === initialRoundNumber) continue;
    if (!matchUp.drawPositions?.includes(drawPosition)) continue;
    if (matchUp.winningSide || !RELEASABLE_STATUSES.includes(matchUp.matchUpStatus)) continue;

    matchUp.drawPositions = (matchUp.drawPositions ?? []).map((position) =>
      position === drawPosition ? undefined : position,
    ) as number[];

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
