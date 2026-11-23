import { advanceDrawPosition } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

/**
 * AN EMPTIED SEAT BESIDE A BYE IS CARRIED ON AS FAR AS GENERATION WOULD CARRY IT — punch-list P47.
 *
 * Generation advances a seat through every BYE it faces: a seat whose opponent is a BYE is in the
 * next round, and if its opponent THERE is a BYE it is in the round after. A director's removal
 * empties seats — the one named, and loser-fed seats in a connected structure whose BYE went with
 * it — and since P46 (#5053) an emptied seat keeps the advancement it already had. But it was not
 * carried FURTHER: when the removal took away the BYE a seat had been advancing past, and that seat
 * now faces a different BYE, it stayed where it was.
 *
 * Measured on `transitiveByeRemovalFIC.test.ts` (FEED_IN_CHAMPIONSHIP 8, every Main seat a BYE,
 * alternates on 3 and 7, then Main seat 4 removed): consolation seat 5 is emptied and stays in
 * round 2 against seat 2's BYE. Generation of the same occupancy puts it in round 3.
 *
 * Asked of the SETTLED draw, once, at the end of the director's action — the shape `settleHeldExits`
 * takes for the same reason: the seats this concerns are emptied transitively, inside the removal,
 * and asking at each clear would decide on a half-finished draw. Only EMPTY seats: a seat holding a
 * participant beside an unadvanced BYE would be a different defect, and is not touched here.
 */
export function carryEmptiedSeatsPastByes({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
}): ResultType {
  if (isLuckyBasedDraw(drawDefinition?.drawType)) return { ...SUCCESS };

  // a seat is carried from a matchUp at most once, so a carry that does not land cannot spin here
  const tried = new Set<string>();
  for (let pass = 0; pass < 64; pass++) {
    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    const seat = findEmptySeatFacingBye({ drawDefinition, matchUpsMap, tried });
    if (!seat) break;
    tried.add(`${seat.matchUpId}|${seat.drawPosition}`);

    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    const result = advanceDrawPosition({
      drawPositionToAdvance: seat.drawPosition,
      matchUpId: seat.matchUpId,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (result?.error) return result;
  }

  return { ...SUCCESS };
}

function findEmptySeatFacingBye({ drawDefinition, matchUpsMap, tried }) {
  for (const structure of drawDefinition.structures ?? []) {
    // a round robin has no next round to carry a seat into
    if (structure.structures) continue;

    const assignmentOf = new Map<number, any>(
      (structure.positionAssignments ?? []).map((assignment) => [assignment.drawPosition, assignment]),
    );
    const isBye = (drawPosition) => !!assignmentOf.get(drawPosition)?.bye;
    const isEmpty = (drawPosition) => {
      const assignment = assignmentOf.get(drawPosition);
      return !!assignment && !assignment.participantId && !assignment.bye && !assignment.qualifier;
    };

    const matchUps = matchUpsMap.mappedMatchUps[structure.structureId]?.matchUps ?? [];
    const byId = new Map<string, any>(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));

    for (const matchUp of matchUps) {
      const drawPositions = (matchUp.drawPositions ?? []).filter(Boolean);
      if (drawPositions.length !== 2 || matchUp.winningSide) continue;

      const [first, second] = drawPositions;
      const seat = (isEmpty(first) && isBye(second) && first) || (isEmpty(second) && isBye(first) && second);
      if (!seat || tried.has(`${matchUp.matchUpId}|${seat}`)) continue;

      // carried within the structure only, and only into a slot that is still open
      const winnerMatchUp = matchUp.winnerMatchUpId && byId.get(matchUp.winnerMatchUpId);
      if (!winnerMatchUp) continue;
      const held = (winnerMatchUp.drawPositions ?? []).filter(Boolean);
      if (held.includes(seat) || held.length === 2) continue;

      return { matchUpId: matchUp.matchUpId, drawPosition: seat };
    }
  }
  return undefined;
}
