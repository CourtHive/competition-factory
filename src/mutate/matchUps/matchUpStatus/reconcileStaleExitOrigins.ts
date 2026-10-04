import { getSideExitProvenance, withdrawProducedExits } from './sideExitProvenance';
import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { applyWithdrawnExits } from './applyWithdrawnExits';
import { findStructure } from '@Acquire/findStructure';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MatchUpsMap } from '@Types/factoryTypes';

/**
 * Withdraw carried exits whose ORIGIN has stopped being a double exit, unless its winning seat is a BYE.
 *
 * ## The question, and why it is asked here
 *
 * A `sideExitProvenance` entry records where a side's exit came from: `previousMatchUpStatus` is the
 * ORIGIN's status at the time — a DOUBLE exit, for a carried one — and `sourceMatchUpId` names it.
 * A correction can leave that record describing something that is no longer true. When a converged
 * double exit loses one of its two origins it RE-DERIVES to a single exit with a winner, and if that
 * winner is real and seated then what it sends downstream is an ADVANCEMENT, not an exit. Every
 * carried exit it had stamped is then void.
 *
 * `withdrawProducedExits` cannot decide this, and the reason is timing rather than logic. It runs
 * inside `removeDirectedParticipants`, deliberately BEFORE the link-directed removals, and occupancy
 * of the re-derived winner's seat is not settled until the whole mutation has run. Both directions
 * were measured on 2026-09-28 and they pull opposite ways:
 *
 *  - `byeAdvancesIntoPendingDoubleExit` §"the exiting side arriving through a BYE leaves the walkover
 *    pending for the other side": the seat is occupied when the withdrawal runs and is EMPTIED later
 *    in the same mutation, becoming a BYE. Deciding early withdrew a walkover that was still true.
 *  - `crossStructureWinnerPositions` DE window seed 9301605 (punch-list P40): the seat is empty when
 *    the withdrawal runs and is FILLED later, by the new result being directed. Deciding early — even
 *    after the removals — left `Main|4|1` holding an entry claiming a `DOUBLE_WALKOVER` at
 *    `Backdraw|4|1` while that matchUp was `DEFAULTED` with a winner, and the stale answer advanced
 *    the LOSING participant into the Decider.
 *
 * So the question is asked once, at the end of the mutation, against settled state. It needs no
 * record of what happened — only the draw — which is what makes it safe to run there: it is a
 * fixpoint over a property of the stored data, and it is idempotent.
 *
 * A source that is no longer a double exit and whose winning seat is a BYE leaves its entries alone:
 * those exits are still true, carried through the BYE by the exiting side's occupant. Any other state of
 * the source — a seated winner, an empty winning seat, no winner at all — voids them (`winnerSeatIsBye`).
 */
export function reconcileStaleExitOrigins({
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  event?: Event;
}): void {
  if (!drawDefinition) return;

  // `setMatchUpStatus` only carries a `matchUpsMap` in its result context on the exit-propagation
  // path — measured absent on four of five submissions of the P40 sequence, including the one that
  // matters. Building it here rather than trusting the context is what makes the reconciliation run
  // on every mutation; the map is a view over the same stored matchUps, so writes through it land.
  const resolvedMap = matchUpsMap?.drawMatchUps?.length ? matchUpsMap : getMatchUpsMap({ drawDefinition });
  if (!resolvedMap?.drawMatchUps?.length) return;

  // the chain cannot be longer than the draw, so this is a fixpoint with a structural bound rather
  // than a `while (true)` that trusts the data to terminate
  let guard = resolvedMap.drawMatchUps.length + 1;

  while (guard-- > 0) {
    const staleOrigins = getStaleOrigins({ drawDefinition, matchUpsMap: resolvedMap });
    if (!staleOrigins.length) return;

    for (const sourceMatchUpId of staleOrigins) {
      const withdrawnExits = withdrawProducedExits({
        mappedMatchUps: resolvedMap.mappedMatchUps,
        sourceMatchUpId,
        drawDefinition,
      });
      applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap: resolvedMap, event });
    }
  }
}

/** The sourceMatchUpIds named by a carried-exit entry which no longer describe their source. */
function getStaleOrigins({
  drawDefinition,
  matchUpsMap,
}: {
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
}): string[] {
  // A stored matchUp carries no `structureId` of its own — it is the KEY it is filed under. The
  // structure has to travel with the matchUp because a drawPosition is only meaningful within one.
  const byId = new Map<string, { matchUp: MatchUp; structureId: string }>();
  for (const [structureId, value] of Object.entries(matchUpsMap.mappedMatchUps ?? {})) {
    for (const matchUp of value?.matchUps ?? []) byId.set(matchUp.matchUpId, { matchUp, structureId });
  }

  const staleOrigins = new Set<string>();

  for (const { matchUp } of byId.values()) {
    const provenance = getSideExitProvenance({ matchUp });
    if (!provenance) continue;

    for (const sideNumber of [1, 2] as const) {
      const entry = provenance[sideNumber];
      const sourceMatchUpId = entry?.sourceMatchUpId;
      // DELIVERED, NOT MERELY ARRIVED: only an entry whose origin was a DOUBLE exit records a carried
      // exit. One naming a single exit or a COMPLETED records that this side's occupant arrived having
      // WON one upstream, which no re-derivation of the source can falsify.
      if (!sourceMatchUpId || !isDoubleExit(entry?.previousMatchUpStatus)) continue;
      if (staleOrigins.has(sourceMatchUpId)) continue;

      const source = byId.get(sourceMatchUpId);
      if (!source || isDoubleExit(source.matchUp.matchUpStatus)) continue;
      if (!winnerSeatIsBye({ ...source, drawDefinition })) staleOrigins.add(sourceMatchUpId);
    }
  }

  return [...staleOrigins];
}

/**
 * Is this matchUp's winning seat a BYE? The one shape in which a former double exit's downstream entries
 * stay true once it is no longer a double exit.
 *
 * A BYE in the winner's seat advances nobody: whoever moves on is the EXITING side's occupant passing
 * through it, carrying the exit with them, so what was stamped downstream still describes them
 * (`byeAdvancesIntoPendingDoubleExit`). Any other state voids those entries:
 *
 *  - a seated winner receives an ADVANCEMENT, not an exit (P40, census DE 9301605);
 *  - an EMPTY winning seat, or no winner at all — a pending single exit, or a matchUp that reverted to
 *    undecided — sends nothing downstream until somebody arrives. These were read as "delivers nobody"
 *    and kept, so a convergence that lost an origin, or reverted, left the exit it had produced standing
 *    a round further on, waiting for an arrival on its EXITING side (census w1 9000562, after a
 *    converged origin was cleared: MONOTONIC_DECISION).
 */
function winnerSeatIsBye({
  drawDefinition,
  structureId,
  matchUp,
}: {
  drawDefinition: DrawDefinition;
  structureId: string;
  matchUp: MatchUp;
}): boolean {
  const drawPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
  if (drawPosition === undefined) return false;

  // A drawPosition is unique WITHIN A STRUCTURE and carries no meaning across structures, so the
  // assignments are scoped by structureId before the position is compared.
  const { structure } = findStructure({ structureId, drawDefinition });
  return !!structure?.positionAssignments?.find((a) => a.drawPosition === drawPosition)?.bye;
}
