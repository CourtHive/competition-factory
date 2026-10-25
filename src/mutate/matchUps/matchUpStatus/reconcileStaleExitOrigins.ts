import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { applyWithdrawnExits } from './applyWithdrawnExits';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { findStructure } from '@Acquire/findStructure';
import { settleUnlessIdle } from './indexPrecheck';
import {
  carriedExitStatus,
  getSideExitProvenance,
  withdrawProducedExits,
  withdrawRelayedExit,
} from './sideExitProvenance';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

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
}): (ResultType & { rederived?: string[] }) | undefined {
  if (!drawDefinition) return undefined;
  // `setMatchUpStatus` only carries a `matchUpsMap` in its result context on the exit-propagation
  // path — measured absent on four of five submissions of the P40 sequence, including the one that
  // matters. Building it here rather than trusting the context is what makes the reconciliation run
  // on every mutation; the map is a view over the same stored matchUps, so writes through it land.
  const resolvedMap = matchUpsMap?.drawMatchUps?.length ? matchUpsMap : getMatchUpsMap({ drawDefinition });
  if (!resolvedMap?.drawMatchUps?.length) return undefined;

  // nothing stale on the structural index: the relays' hydration would find the same, and write nothing
  return settleUnlessIdle({
    detect: (inContextDrawMatchUps) =>
      hasStaleExitOrigins({ inContextDrawMatchUps, drawDefinition, matchUpsMap: resolvedMap }),
    run: () => withdrawStaleExits({ tournamentRecord, drawDefinition, matchUpsMap: resolvedMap, event }),
    site: 'reconcileStaleExitOrigins',
    idle: undefined,
    drawDefinition,
  });
}

function withdrawStaleExits({
  tournamentRecord,
  drawDefinition,
  matchUpsMap: resolvedMap,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
}): (ResultType & { rederived?: string[] }) | undefined {
  // the matchUps this reconciliation re-derived from a double exit to a single one: the caller settles those again
  const rederived: string[] = [];

  // the chain cannot be longer than the draw, so this is a fixpoint with a structural bound rather
  // than a `while (true)` that trusts the data to terminate
  let guard = resolvedMap.drawMatchUps.length + 1;

  while (guard-- > 0) {
    const staleOrigins = getStaleOrigins({ drawDefinition, matchUpsMap: resolvedMap });
    const relays = staleOrigins.length
      ? { staleRelays: [] }
      : getStaleRelays({ drawDefinition, matchUpsMap: resolvedMap });
    if (relays.error) return relays;
    const staleRelays = relays.staleRelays ?? [];
    if (!staleOrigins.length && !staleRelays.length) return rederived.length ? { rederived } : undefined;

    for (const { matchUp, structureId, sourceMatchUpId } of staleRelays) {
      const withdrawnExits = withdrawRelayedExit({ matchUp, structureId, sourceMatchUpId, drawDefinition });
      rederived.push(
        ...withdrawnExits.filter((withdrawn) => withdrawn.rederived).map((withdrawn) => withdrawn.matchUpId),
      );
      applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap: resolvedMap, event });
    }

    for (const sourceMatchUpId of staleOrigins) {
      const withdrawnExits = withdrawProducedExits({
        mappedMatchUps: resolvedMap.mappedMatchUps,
        sourceMatchUpId,
        drawDefinition,
      });
      rederived.push(
        ...withdrawnExits.filter((withdrawn) => withdrawn.rederived).map((withdrawn) => withdrawn.matchUpId),
      );
      applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap: resolvedMap, event });
    }
  }
  return rederived.length ? { rederived } : undefined;
}

/**
 * THE PASS'S DETECTOR: a stale origin or a stale relay in the draw. The loop above acts on them; v2's has-work predicate
 * (`outcome/settleWork.ts`) asks it of the working view, so the two cannot drift. An error reading a relay is work: the
 * pass would return it.
 */
export function hasStaleExitOrigins({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
}: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
}): boolean {
  if (getStaleOrigins({ drawDefinition, matchUpsMap }).length) return true;
  const relays = getStaleRelays({ inContextDrawMatchUps, drawDefinition, matchUpsMap });
  return !!relays.error || !!relays.staleRelays?.length;
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
  inContextDrawMatchUps: given,
  drawDefinition,
  matchUpsMap,
}: {
  /** a hydration of this draw already taken (the working view's), so none is taken here */
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
}): ResultType & { staleRelays?: Relay[] } {
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
  if (!candidates.length) return { staleRelays: [] };

  const inContextDrawMatchUps =
    given ?? getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
  // a source whose links cannot be read refuses the reconciliation; it is never read as "reaches nothing"
  let refused: ResultType | undefined;
  const targetsOf = (matchUpId: string) => {
    const targetData = positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId });
    if (targetData.error) refused ??= decorateResult({ result: targetData, stack: 'reconcileStaleExitOrigins' });
    return targetData.targetMatchUps ?? {};
  };
  const holdsBye = (matchUpId: string) => {
    const known = byId.get(matchUpId);
    if (!known) return false;
    if (known.matchUp.matchUpStatus === BYE) return true;
    const { structure } = findStructure({ structureId: known.structureId, drawDefinition });
    const positions = known.matchUp.drawPositions ?? [];
    return !!positionAssignmentsOf(structure)?.some((a) => a.bye && positions.includes(a.drawPosition));
  };

  const staleRelays = candidates.filter(({ matchUp, sourceMatchUpId }) => {
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
  return refused ?? { staleRelays: [...staleRelays, ...strandedCarries({ inContextDrawMatchUps, byId })] };
}

/**
 * A CARRIED exit — a participant's own walkover or default, sent on as their loss — stands only where its carrier
 * stands. It is written in the loser seat they land in, and in each matchUp they are carried into past a BYE, always
 * beside them. When a BYE they passed is taken back and they come home, a copy left where they no longer stand describes
 * nobody, and decides that matchUp for whoever arrives there next (census run 18, MODIFIED_FEED_IN_CHAMPIONSHIP 16/14
 * seed 20685332: a walkover carried past `Consolation|1|3` and `2|3` stayed in `3|2` when `Main|1|5`'s double walkover
 * was relabelled and its loser took the BYE's seat; that loser then won `3|2` on the stale walkover and reached `4|1`
 * beside the participant `3|2` had already sent there — TWO_POSITIONS_FROM_ONE_FEEDER).
 */
function strandedCarries({
  inContextDrawMatchUps,
  byId,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  byId: Map<string, { matchUp: MatchUp; structureId: string }>;
}): Relay[] {
  const hydrated = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const stranded: Relay[] = [];
  for (const { matchUp, structureId } of byId.values()) {
    if (matchUp.collectionId) continue;
    const provenance = getSideExitProvenance({ matchUp });
    for (const sideNumber of [1, 2] as const) {
      const entry = provenance?.[sideNumber];
      const sourceMatchUpId = entry?.sourceMatchUpId;
      if (!sourceMatchUpId || !carriedExitStatus(entry) || isDoubleExit(entry?.previousMatchUpStatus)) continue;
      const source = hydrated.get(sourceMatchUpId);
      if (!source || !isExit(source.matchUpStatus) || !source.winningSide || source.collectionId) continue;
      const carrierId = source.sides?.find((side) => side.sideNumber === 3 - (source.winningSide ?? 0))?.participantId;
      if (!carrierId) continue;
      const here = hydrated.get(matchUp.matchUpId);
      if (here?.sides?.some((side) => side.participantId === carrierId)) continue;
      stranded.push({ matchUp, structureId, sourceMatchUpId });
    }
  }
  return stranded;
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
  return !!positionAssignmentsOf(structure)?.find((a) => a.drawPosition === drawPosition)?.bye;
}
