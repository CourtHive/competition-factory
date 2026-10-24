import { directWinner } from '@Mutate/matchUps/drawPositions/drawPositionPlacement';
import { recordSettleEvent } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isRoundWinnerLink } from '@Query/drawDefinition/linkTraversal';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import type { DrawDefinition, DrawLink, Event, Tournament } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';

/**
 * Direct every participant who DECIDED a round feeding another structure over a WINNER link, and is not there yet.
 *
 * The complement of `reconcileLinkAdvancements`, which releases a participant standing across a link out of a matchUp
 * with no result. This places one who earned the crossing and never made it. The BYE cascade's `advanceDrawPosition`
 * advances only within a structure, so a participant who wins a structure's FINAL by ARRIVING into a pending exit —
 * a result decided as a consequence of a mutation elsewhere — was awarded it and left there.
 *
 * Census 20023278 (DOUBLE_ELIMINATION 8/8, forward play): `Backdraw|1|1`'s double default relays its produced exit
 * past a BYE; the Backdraw's last participant wins `Backdraw|3|1` and then `Backdraw|4|1`, the Backdraw final, where
 * the Main semi-final's defaulted loser was waiting, and was never seated in the Main final. Its undefeated finalist
 * waited alone.
 *
 * Read from settled state and idempotent: a participant already seated in the target matchUp is left alone.
 */
export function reconcileMissedLinkAdvancements({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
}): ResultType | undefined {
  const winnerLinks = (drawDefinition?.links ?? []).filter(
    (link) => isRoundWinnerLink(link, drawDefinition) && link.target?.structureId !== link.source?.structureId,
  );
  if (!drawDefinition || !winnerLinks.length) return undefined;

  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];

  for (const missed of findMissedLinkAdvancements({ drawDefinition, inContextDrawMatchUps })) {
    const { matchUp, winningDrawPosition, winnerMatchUp, winnerMatchUpDrawPositionIndex, winnerTargetLink } = missed;
    const directed = directWinner({
      sourceMatchUpStatus: matchUp.matchUpStatus,
      sourceMatchUpId: matchUp.matchUpId,
      winnerMatchUpDrawPositionIndex,
      projectedWinningSide: undefined,
      dualMatchUp: undefined,
      inContextDrawMatchUps,
      winningDrawPosition,
      tournamentRecord,
      winnerTargetLink,
      drawDefinition,
      winnerMatchUp,
      matchUpsMap,
      event,
    });
    // returned, not dropped (Phase C prerequisite 2, CA 2026-10-24): never reached on ~97,000 census schedules, and
    // still recorded for the census when it is
    if (directed?.error) {
      recordSettleEvent({
        kind: 'dropped-error',
        site: 'reconcileMissedLinkAdvancements',
        detail: `${matchUp.matchUpId}: ${directed.error.code ?? directed.error}`,
      });
      return directed;
    }
  }
  return undefined;
}

/**
 * THE PASS'S DETECTOR: every decided feeder of a winner link whose winner is not seated in the matchUp the link sends
 * them to, read from one hydration. The pass directs each; v2's has-work predicate (`outcome/settleWork.ts`) asks it of
 * the working view, so the two cannot drift.
 */
export function findMissedLinkAdvancements({
  inContextDrawMatchUps,
  drawDefinition,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
}) {
  const missed: {
    winnerMatchUpDrawPositionIndex?: number;
    winnerMatchUp: HydratedMatchUp;
    winningDrawPosition: number;
    winnerTargetLink: DrawLink;
    matchUp: HydratedMatchUp;
  }[] = [];
  const winnerLinks = (drawDefinition.links ?? []).filter(
    (link) => isRoundWinnerLink(link, drawDefinition) && link.target?.structureId !== link.source?.structureId,
  );
  for (const link of winnerLinks) {
    const { structureId, roundNumber } = link.source ?? {};
    const targetStructure = findStructure({ drawDefinition, structureId: link.target?.structureId })?.structure;
    const sourceStructure = findStructure({ drawDefinition, structureId })?.structure;
    if (!targetStructure || !sourceStructure) continue;
    const sourceAssignments = getPositionAssignments({ structure: sourceStructure }).positionAssignments ?? [];

    const decided = inContextDrawMatchUps.filter(
      (matchUp) =>
        matchUp.structureId === structureId &&
        matchUp.roundNumber === roundNumber &&
        !matchUp.collectionId &&
        matchUp.winningSide,
    );
    for (const matchUp of decided) {
      const winningDrawPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
      const assignment = sourceAssignments.find((candidate) => candidate.drawPosition === winningDrawPosition);
      const participantId = assignment?.participantId;
      if (!winningDrawPosition || !participantId || assignment?.bye) continue;

      const targetData = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
      const { winnerMatchUp, winnerMatchUpDrawPositionIndex } = targetData?.targetMatchUps ?? {};
      const { winnerTargetLink } = targetData?.targetLinks ?? {};
      if (!winnerMatchUp || !winnerTargetLink || winnerMatchUp.structureId === structureId) continue;
      // seated in the matchUp the link sends them to — NOT merely present in its structure: a DOUBLE_ELIMINATION
      // Backdraw champion already holds a Main drawPosition from the round they lost there
      if (winnerMatchUp.sides?.some((side) => side?.participantId === participantId)) continue;
      missed.push({ matchUp, winningDrawPosition, winnerMatchUp, winnerMatchUpDrawPositionIndex, winnerTargetLink });
    }
  }
  return missed;
}
