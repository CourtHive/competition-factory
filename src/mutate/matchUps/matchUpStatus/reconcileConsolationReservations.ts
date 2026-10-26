import { firstRoundFeedersWon, propagateConsolationBye } from '@Mutate/matchUps/drawPositions/drawPositionPlacement';
import { getMappedStructureMatchUps, getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { findStructure } from '@Acquire/findStructure';
import { settleUnlessIdle } from './indexPrecheck';
import { isAnyExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, DrawLink, Event, MatchUp, PositionAssignment, Tournament } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * Ask the `FIRST_MATCHUP` reservation of every UNDECIDED matchUp whose loser feeds over such a link, on the draw as it
 * stands once a mutation has settled.
 *
 * `propagateConsolationBye` places that reservation — a BYE in the fed consolation seat once both first-round feeders
 * have produced a scored win, because whoever loses next will have one and may not enter — and withdraws it when a
 * correction takes such a win back. It is asked only on the WINNER-ADVANCEMENT path, so a correction that changes a
 * first-round result without directing its winner again never reaches it: a WALKOVER re-scored as a played win by the
 * same winner, or a winner flipped by the change-propagation relabel. The seat was then left as the previous result
 * had it, and a draw whose round-2 matchUp later became a double exit left the consolation participant waiting on a
 * seat nobody could fill.
 *
 * Census 20030739 (FIRST_MATCH_LOSER_CONSOLATION 8/8, `allowChangePropagation`): `Main|1|1` re-scored from a WALKOVER
 * to a played result left `Consolation|2|1` without the BYE forward play places; `Main|2|1`'s double walkover then
 * stalled `Consolation|2|1` and `Consolation|3|1`.
 *
 * The rule is the existing one, called rather than restated. Only matchUps it would be asked of on the forward path
 * are asked: two drawPositions, no result, no exit standing on them. A decided matchUp's loser is `directLoser`'s.
 * Idempotent: a reservation in place is left alone, and only a propagated BYE is withdrawn.
 */
export function reconcileConsolationReservations({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
}): (ResultType & { withdrawn?: boolean }) | undefined {
  const links = (drawDefinition?.links ?? []).filter((link) => link.linkCondition === FIRST_MATCHUP);
  if (!drawDefinition || !links.length) return undefined;
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  // no reservation owed or stale on the structural index: the pass's hydration would find the same, and write nothing
  return settleUnlessIdle({
    detect: (inContextDrawMatchUps) => findReservationWork({ inContextDrawMatchUps, drawDefinition, matchUpsMap }),
    run: () => reconcileReservations({ tournamentRecord, drawDefinition, matchUpsMap, event, links }),
    site: 'reconcileConsolationReservations',
    idle: undefined,
    drawDefinition,
  });
}

function reconcileReservations({
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
  links,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
  links: DrawLink[];
}): (ResultType & { withdrawn?: boolean }) | undefined {
  const reservationsBefore = reservedSeats({ drawDefinition, links });

  // the wrapper's map: built immediately before, with no write between, so the same view over the stored matchUps
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];

  for (const link of links) {
    const { structureId, roundNumber } = link.source ?? {};
    const structure = findStructure({ drawDefinition, structureId })?.structure;
    if (!structure || !structureId) continue;
    const positionAssignments = getPositionAssignments({ structure }).positionAssignments ?? [];

    const structureMatchUps = getMappedStructureMatchUps({ matchUpsMap, structureId });
    const undecided = structureMatchUps.filter(
      (matchUp: MatchUp) =>
        matchUp.roundNumber === roundNumber &&
        !matchUp.collectionId &&
        !matchUp.winningSide &&
        matchUp.matchUpStatus !== BYE &&
        !isAnyExit(matchUp.matchUpStatus) &&
        (matchUp.drawPositions ?? []).filter(Boolean).length === 2,
    );
    for (const matchUp of undecided) {
      const targetData = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
      const { loserMatchUp, loserTargetDrawPosition } = targetData?.targetMatchUps ?? {};
      const { loserTargetLink } = targetData?.targetLinks ?? {};
      if (!loserMatchUp || loserTargetDrawPosition === undefined) continue;
      const isByeMatchUp = positionAssignments.some(
        (assignment) => assignment.bye && matchUp.drawPositions?.includes(assignment.drawPosition),
      );

      const result = propagateConsolationBye({
        updatedDrawPositions: matchUp.drawPositions,
        loserTargetDrawPosition,
        tournamentRecord,
        loserTargetLink,
        drawDefinition,
        structureId,
        isByeMatchUp,
        loserMatchUp,
        matchUpsMap,
        event,
      });
      if (result?.error) return result;
    }

    // A matchUp a correction has left with ONE drawPosition is not asked above, yet a reservation placed while both its
    // feeders had scored wins may still stand at its loser's seat. It stands only on both wins, so it goes.
    const partial = structureMatchUps.filter(
      (matchUp: MatchUp) =>
        matchUp.roundNumber === roundNumber &&
        !matchUp.collectionId &&
        !matchUp.winningSide &&
        matchUp.matchUpStatus !== BYE &&
        !isAnyExit(matchUp.matchUpStatus) &&
        (matchUp.drawPositions ?? []).filter(Boolean).length < 2,
    );
    for (const matchUp of partial) {
      const withdrawn = withdrawStaleReservation({
        inContextDrawMatchUps,
        structureMatchUps,
        tournamentRecord,
        drawDefinition,
        structureId,
        matchUpsMap,
        matchUp,
        event,
      });
      if (withdrawn?.error) return withdrawn;
    }
  }
  const reservationsAfter = new Set(reservedSeats({ drawDefinition, links }));
  return reservationsBefore.some((seat) => !reservationsAfter.has(seat)) ? { withdrawn: true } : undefined;
}

/**
 * THE PASS'S DETECTOR: the fed seats whose reservation the pass would place or withdraw, as `structureId|drawPosition`,
 * each decided as the pass decides it. A matchUp with two drawPositions and no result owes a reservation when both its
 * first-round feeders hold a scored win and its loser's seat holds no BYE (`propagateConsolationBye`), and has a stale
 * one when they do not and the seat holds a propagated BYE; a matchUp a correction left with one drawPosition has a
 * stale one when its feeders, asked by `winnerMatchUpId`, do not both hold a scored win (`withdrawStaleReservation`).
 * The v1 settle precheck (`indexPrecheck.ts`) and v2's has-work predicate (`outcome/settleWork.ts`) both ask it.
 */
export function findReservationWork({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
}): string[] {
  const work: string[] = [];
  const links = (drawDefinition.links ?? []).filter((link) => link.linkCondition === FIRST_MATCHUP);
  for (const link of links) {
    const { structureId, roundNumber } = link.source ?? {};
    const structure = findStructure({ drawDefinition, structureId })?.structure;
    if (!structure || !structureId) continue;
    const positionAssignments = getPositionAssignments({ structure }).positionAssignments ?? [];
    const structureMatchUps = getMappedStructureMatchUps({ matchUpsMap, structureId });
    const open = structureMatchUps.filter(
      (matchUp: MatchUp) =>
        matchUp.roundNumber === roundNumber &&
        !matchUp.collectionId &&
        !matchUp.winningSide &&
        matchUp.matchUpStatus !== BYE &&
        !isAnyExit(matchUp.matchUpStatus),
    );
    for (const matchUp of open) {
      const key = seatWork({
        matchUp,
        structureMatchUps,
        positionAssignments,
        inContextDrawMatchUps,
        drawDefinition,
        matchUpsMap,
        structureId,
      });
      if (key) work.push(key);
    }
  }
  return work;
}

/** the seat one open matchUp's reservation would be placed in or withdrawn from, as the pass decides it; else undefined */
function seatWork({
  inContextDrawMatchUps,
  positionAssignments,
  structureMatchUps,
  drawDefinition,
  matchUpsMap,
  structureId,
  matchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  positionAssignments: PositionAssignment[];
  drawDefinition: DrawDefinition;
  structureMatchUps: MatchUp[];
  matchUpsMap: MatchUpsMap;
  structureId: string;
  matchUp: MatchUp;
}): string | undefined {
  const targetData = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
  const { loserMatchUp, loserTargetDrawPosition } = targetData?.targetMatchUps ?? {};
  const { loserTargetLink } = targetData?.targetLinks ?? {};
  if (!loserMatchUp || loserTargetDrawPosition === undefined) return undefined;
  const seat = (
    getPositionAssignments({ drawDefinition, structureId: loserMatchUp.structureId }).positionAssignments ?? []
  ).find((assignment) => assignment.drawPosition === loserTargetDrawPosition);
  const reserved = !!seat?.bye && !!seat.byeFromPropagation;
  const key = `${loserMatchUp.structureId}|${loserTargetDrawPosition}`;
  const positions = (matchUp.drawPositions ?? []).filter(Boolean);
  if (positions.length === 2) {
    const isByeMatchUp = positionAssignments.some(
      (assignment) => assignment.bye && matchUp.drawPositions?.includes(assignment.drawPosition),
    );
    if (isByeMatchUp || loserTargetLink?.linkCondition !== FIRST_MATCHUP) return undefined;
    const won = firstRoundFeedersWon({ drawPositions: positions, structureId, matchUpsMap });
    return (won && !seat?.bye) || (!won && reserved) ? key : undefined;
  }
  if (!reserved) return undefined;
  const feederPositions = structureMatchUps
    .filter((feeder) => feeder.winnerMatchUpId === matchUp.matchUpId)
    .flatMap((feeder) => feeder.drawPositions ?? [])
    .filter(Boolean);
  if (feederPositions.length < 2) return undefined;
  return firstRoundFeedersWon({ drawPositions: feederPositions, structureId, matchUpsMap }) ? undefined : key;
}

/** The propagated BYEs standing in the seats `FIRST_MATCHUP` links feed, as `structureId|drawPosition` */
function reservedSeats({ drawDefinition, links }: { drawDefinition: DrawDefinition; links: DrawLink[] }): string[] {
  const targetStructureIds = new Set(links.map((link) => link.target?.structureId).filter(Boolean));
  return [...targetStructureIds].flatMap((structureId) =>
    (getPositionAssignments({ drawDefinition, structureId }).positionAssignments ?? [])
      .filter((assignment) => assignment.bye && assignment.byeFromPropagation)
      .map((assignment) => `${structureId}|${assignment.drawPosition}`),
  );
}

/**
 * The reservation at a round-2 matchUp's loser seat, asked of its first-round FEEDERS (by `winnerMatchUpId`), not of the
 * drawPositions it holds now: with a feeder's result taken back it holds one, and `firstRoundFeedersWon` asked of that
 * one would read the remaining scored win as the whole answer. Census run-17 baseline, F3: FIRST_MATCH_LOSER_CONSOLATION
 * 16/15 seed 20714203 — `Main|1|5` cleared and `Main|1|6` corrected from RETIRED to WALKOVER left `Consolation|2|3`'s
 * reservation BYE standing; forward play never places it, and a later result took it back as an un-decided BYE.
 */
function withdrawStaleReservation({
  inContextDrawMatchUps,
  structureMatchUps,
  tournamentRecord,
  drawDefinition,
  structureId,
  matchUpsMap,
  matchUp,
  event,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  structureMatchUps: MatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureId: string;
  matchUpsMap: MatchUpsMap;
  matchUp: MatchUp;
  event?: Event;
}): ResultType | undefined {
  const targetData = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
  const { loserMatchUp, loserTargetDrawPosition } = targetData?.targetMatchUps ?? {};
  if (!loserMatchUp || loserTargetDrawPosition === undefined) return undefined;
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId: loserMatchUp.structureId });
  const reserved = positionAssignments?.find((assignment) => assignment.drawPosition === loserTargetDrawPosition);
  if (!reserved?.bye || !reserved.byeFromPropagation) return undefined;

  const feederPositions = structureMatchUps
    .filter((feeder) => feeder.winnerMatchUpId === matchUp.matchUpId)
    .flatMap((feeder) => feeder.drawPositions ?? [])
    .filter(Boolean);
  if (feederPositions.length < 2) return undefined;
  if (firstRoundFeedersWon({ drawPositions: feederPositions, structureId, matchUpsMap })) return undefined;

  return clearDrawPosition({
    drawPosition: loserTargetDrawPosition,
    structureId: loserMatchUp.structureId,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  });
}
