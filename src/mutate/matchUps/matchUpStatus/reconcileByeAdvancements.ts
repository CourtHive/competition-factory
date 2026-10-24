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
    const owed = findOwedByeAdvance(inContextDrawMatchUps);
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

/**
 * THE PASS'S DETECTOR: the first advance a BYE still owes, read from a hydration of the draw. The pass acts on it; v2's
 * has-work predicate (`outcome/settleWork.ts`) asks it of the working view, so the two cannot drift.
 */
export function findOwedByeAdvance(
  inContextDrawMatchUps: HydratedMatchUp[],
): { matchUpId: string; drawPosition: number } | undefined {
  const byId = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  return inContextDrawMatchUps
    .map((matchUp) => owedAdvance(matchUp, byId) ?? owedSeatAdvance(matchUp, byId, inContextDrawMatchUps))
    .find(Boolean);
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

/**
 * The EMPTY seat a BYE matchUp still owes its next matchUp. A BYE advances its opponent's drawPosition when it lands,
 * occupied or not (`assignDrawPositionBye`), so whoever reaches that seat later is already one round on. A matchUp that
 * held two BYEs sent one BYE on instead; when one of them is withdrawn, the release takes back the BYE's advancement
 * and nothing advanced the seat now opposite the BYE that stays (census A1 residue R7, COMPASS 32/30 policy-off
 * 20694910: `East|1|3`'s double walkover re-scored took back the BYE it had put in `Northwest|1|1`, and dp 1 never
 * reached `Northwest|2|1`, where every entry order of the standing results puts it; `theSeatLeftOppositeAByeGoesOn`).
 *
 * Only a structural seat, one no earlier round of the structure holds: a position advanced into this round is a
 * reservation, and is its own matchUp's to send on. A seat a BYE carried into this round is structural as well: the BYE
 * there advanced it as this one would (census A1 wave 3 G4, MODIFIED_FEED_IN_CHAMPIONSHIP 32/27 21029862: dp 23,
 * carried into `Consolation|2|8` by `Consolation|1|8`'s BYE, never reached `Consolation|3|4` when the BYE opposite it in
 * `2|8` stayed and the other went; `aSeatAByeCarriedInGoesOnPastTheNextBye`).
 */
function owedSeatAdvance(
  matchUp: HydratedMatchUp,
  byId: Map<string, HydratedMatchUp>,
  inContextDrawMatchUps: HydratedMatchUp[],
): { matchUpId: string; drawPosition: number } | undefined {
  const { sides, winnerMatchUpId, matchUpId } = matchUp;
  if (!sides || !winnerMatchUpId) return undefined;
  if (sides.filter((side) => side?.bye).length !== 1) return undefined;
  const seat = sides.find((side) => side && !side.bye);
  const drawPosition = seat?.drawPosition;
  if (!drawPosition || seat.participantId || seat.qualifier) return undefined;
  const next = byId.get(winnerMatchUpId);
  if (!next || next.structureId !== matchUp.structureId) return undefined;
  const held = (next.drawPositions ?? []).filter(Boolean);
  if (held.length >= 2 || held.includes(drawPosition)) return undefined;
  // a seat a BYE carried into this round is structural too: the BYE opposite it there advanced it as this one does
  const advancedHere = inContextDrawMatchUps.some(
    (other) =>
      other.structureId === matchUp.structureId &&
      (other.roundNumber ?? 0) < (matchUp.roundNumber ?? 0) &&
      (other.drawPositions ?? []).includes(drawPosition) &&
      !carriedByBye(other, drawPosition),
  );
  return advancedHere ? undefined : { matchUpId, drawPosition };
}

/** `drawPosition` stands empty opposite a BYE in `matchUp`, and that BYE advanced it */
function carriedByBye(matchUp: HydratedMatchUp, drawPosition: number): boolean {
  const seat = matchUp.sides?.find((side) => side?.drawPosition === drawPosition);
  const opposite = matchUp.sides?.find((side) => side && side.drawPosition !== drawPosition);
  return !!seat && !seat.participantId && !seat.qualifier && !seat.bye && !!opposite?.bye;
}
