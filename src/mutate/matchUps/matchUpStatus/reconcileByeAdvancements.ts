import { advanceDrawPosition } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';

/**
 * Advance every participant standing opposite a BYE whose next matchUp, in the same structure, has a seat for them and
 * no result — and does not hold them yet.
 *
 * A BYE advances its opponent structurally the moment it lands (`assignDrawPositionBye` → `advanceDrawPosition`). The
 * next seat can be taken at that moment and free once the mutation has settled: a pending produced exit's reservation
 * stands there until the exit that made it is withdrawn, which `settleRederivedDoubleExits` does at the end of the
 * mutation, after the BYE has landed and found the seat full. Census 20178071 (FEED_IN_CHAMPIONSHIP 8/7): re-scoring
 * `Main|1|3` as a double walkover put a BYE opposite `Consolation|2|1`'s occupant while `3|1` still held the dissolved
 * convergence's reservation; the reservation then went, and the occupant stayed behind (BYE_ADVANCEMENT_MISSING).
 *
 * The question is `getByeAdvancementInconsistency`'s, asked of the settled draw, and the answer is the forward path's
 * own: `advanceDrawPosition`, from the BYE matchUp. Cross-structure feeds are `reconcileMissedLinkAdvancements`'. A
 * next matchUp with both seats taken is left alone — what stands there is not this reconciliation's to move; a pending
 * exit standing over one seat awaits exactly this arrival. Idempotent: a participant already seated is left alone.
 */
export function reconcileByeAdvancements({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
}): ResultType | undefined {
  if (!drawDefinition) return undefined;
  // each advance seats one participant; bounded as a draw is
  for (let pass = 0; pass < 32; pass += 1) {
    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    const byId = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
    const owed = inContextDrawMatchUps.map((matchUp) => owedAdvance(matchUp, byId)).find(Boolean);
    if (!owed) return undefined;
    const result = advanceDrawPosition({
      drawPositionToAdvance: owed.drawPosition,
      matchUpId: owed.matchUpId,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (result?.error) return result;
  }
  return undefined;
}

/** the participant a BYE matchUp still owes its next matchUp, where that matchUp has a seat for them and no result */
function owedAdvance(
  matchUp: HydratedMatchUp,
  byId: Map<string, HydratedMatchUp>,
): { matchUpId: string; drawPosition: number } | undefined {
  const { sides, winnerMatchUpId, matchUpId } = matchUp;
  if (!sides || !winnerMatchUpId) return undefined;
  const byeSides = sides.filter((side) => side?.bye);
  const participantSides = sides.filter((side) => side?.participantId && !side.bye);
  if (byeSides.length !== 1 || participantSides.length !== 1) return undefined;

  const next = byId.get(winnerMatchUpId);
  if (!next || next.structureId !== matchUp.structureId) return undefined;
  const { participantId, drawPosition } = participantSides[0];
  if (!drawPosition || (next.sides ?? []).some((side) => side?.participantId === participantId)) return undefined;
  // a seat for them: a pending exit standing there awaits exactly this arrival, and is theirs to take or carry past
  if ((next.drawPositions ?? []).filter(Boolean).length >= 2) return undefined;
  return { matchUpId, drawPosition };
}
