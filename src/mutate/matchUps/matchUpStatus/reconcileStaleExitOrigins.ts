import { getSideExitProvenance, withdrawProducedExits, withdrawRelayedExit } from './sideExitProvenance';
import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { applyWithdrawnExits } from './applyWithdrawnExits';
import { findStructure } from '@Acquire/findStructure';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MatchUpsMap } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';

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
    const staleRelays = staleOrigins.length ? [] : getStaleRelays({ drawDefinition, matchUpsMap: resolvedMap });
    if (!staleOrigins.length && !staleRelays.length) return;

    for (const { matchUp, structureId, sourceMatchUpId } of staleRelays) {
      const withdrawnExits = withdrawRelayedExit({ matchUp, structureId, sourceMatchUpId, drawDefinition });
      applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap: resolvedMap, event });
    }

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

type Relay = { matchUp: MatchUp; structureId: string; sourceMatchUpId: string };

/**
 * Entries carried past a BYE that has since gone, while their source is STILL a double exit.
 *
 * A double exit's produced exit lands on its winner target, or its loser target, and travels on from there only
 * through BYEs (`doubleExitAdvancement`'s `carryExitOnward`: "a propagated exit encountering a BYE should be
 * advanced", CA 2026-09-20). Every hop keeps the ORIGIN's id, so `getStaleOrigins` cannot see a broken hop: the
 * origin is still a double exit. When the BYE a hop passed through is withdrawn, the exit comes to rest there,
 * and the entry beyond it describes an exit that never reached it. Census de 9300866 (DE 16/15): `Backdraw|1|3`'s
 * walkover passed the BYE on `Backdraw|2|3` into `Backdraw|3|2`; re-scoring `Main|1|6` from a double walkover took
 * that BYE back, and `Backdraw|3|2` kept the walkover, which the arriving participant then won.
 *
 * So an entry stands only where the exit can still reach it: at a direct target of its source, or past a run of
 * matchUps each still holding a BYE.
 */
function getStaleRelays({
  drawDefinition,
  matchUpsMap,
}: {
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
}): Relay[] {
  const byId = new Map<string, { matchUp: MatchUp; structureId: string }>();
  for (const [structureId, value] of Object.entries(matchUpsMap.mappedMatchUps ?? {})) {
    for (const matchUp of value?.matchUps ?? []) byId.set(matchUp.matchUpId, { matchUp, structureId });
  }

  const candidates: Relay[] = [];
  for (const { matchUp, structureId } of byId.values()) {
    const provenance = getSideExitProvenance({ matchUp });
    for (const sideNumber of [1, 2] as const) {
      const entry = provenance?.[sideNumber];
      const sourceMatchUpId = entry?.sourceMatchUpId;
      if (!sourceMatchUpId || !isDoubleExit(entry?.previousMatchUpStatus)) continue;
      if (!isDoubleExit(byId.get(sourceMatchUpId)?.matchUp.matchUpStatus)) continue;
      candidates.push({ matchUp, structureId, sourceMatchUpId });
    }
  }
  if (!candidates.length) return [];

  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
  const targetsOf = (matchUpId: string) =>
    positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId })?.targetMatchUps ?? {};
  const holdsBye = (matchUpId: string) => {
    const known = byId.get(matchUpId);
    if (!known) return false;
    if (known.matchUp.matchUpStatus === BYE) return true;
    const { structure } = findStructure({ structureId: known.structureId, drawDefinition });
    const positions = known.matchUp.drawPositions ?? [];
    return !!structure?.positionAssignments?.some((a) => a.bye && positions.includes(a.drawPosition));
  };

  return candidates.filter(({ matchUp, sourceMatchUpId }) => {
    const { winnerMatchUp, loserMatchUp } = targetsOf(sourceMatchUpId);
    const reached = new Set<string>();
    let frontier = [winnerMatchUp?.matchUpId, loserMatchUp?.matchUpId].filter((id): id is string => !!id);
    // a winner chain is no longer than the draw
    for (let guard = byId.size; frontier.length && guard > 0; guard -= 1) {
      const next: string[] = [];
      for (const matchUpId of frontier) {
        if (matchUpId === matchUp.matchUpId) return false;
        if (reached.has(matchUpId) || !holdsBye(matchUpId)) continue;
        reached.add(matchUpId);
        const onward = targetsOf(matchUpId).winnerMatchUp?.matchUpId;
        if (onward) next.push(onward);
      }
      frontier = next;
    }
    return true;
  });
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
