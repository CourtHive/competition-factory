import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import { matchUpsOf, positionAssignmentsOf } from '@Acquire/structureMembers';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import {
  deriveExitStateFromProvenance,
  mergeSideExitProvenance,
  carriedExitStatus,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { DrawDefinition, MatchUp, PositionAssignment, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/** the carried exit recorded on `drawPosition`'s side of a matchUp, read structurally, or by the one carried entry */
export function carriedEntryAt({
  positionAssignments,
  drawDefinition,
  drawPosition,
  structureId,
  matchUp,
}: {
  positionAssignments: PositionAssignment[];
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId: string;
  matchUp: MatchUp;
}) {
  const provenance = matchUp.sideExitProvenance;
  // a carry belongs to a participant: a BYE's position carries nothing, and a produced exit (a double exit's, with no
  // participant behind it) is not a carry and stays where the double exit put it (`aRemovedByeKeepsTheOtherSidesExit`)
  const held = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  if (!provenance || !held?.participantId) return undefined;
  const sideNumber = getDrawPositionSideNumber({
    matchUp: { ...matchUp, sides: undefined },
    drawPosition,
    drawDefinition,
    structureId,
  });
  const carried = ([1, 2] as const).filter(
    (side) => carriedExitStatus(provenance[side]) && !isDoubleExit(provenance[side]?.previousMatchUpStatus),
  );
  const structural = carried.find((side) => side === sideNumber);
  // read off the side when it can be; otherwise the carry is the one this position's participant brought, identified
  // by its source: a carry belongs to the loser of the matchUp it came from. "The one carried entry" alone handed a
  // participant brought back past a withdrawn BYE the carry of the participant opposite, and the matchUp they came
  // home to read two exits (census run 19, OLYMPIC 32/29 20779675 and COMPASS 32/31 20865978, policy off)
  const side =
    structural ??
    carried.find((carriedSide) =>
      sourceHeld({ drawDefinition, participantId: held.participantId, entry: provenance[carriedSide] }),
    );
  return side ? provenance[side] : undefined;
}

/** the participant stood in the matchUp an entry names as its source, and so is the one who carried its exit on */
function sourceHeld({
  drawDefinition,
  participantId,
  entry,
}: {
  entry?: SideExitProvenanceEntry;
  drawDefinition: DrawDefinition;
  participantId?: string;
}): boolean {
  if (!participantId || !entry?.sourceMatchUpId) return false;
  for (const structure of drawDefinition.structures ?? []) {
    const source = matchUpsOf(structure)?.find((matchUp) => matchUp.matchUpId === entry.sourceMatchUpId);
    if (!source) continue;
    const positions = new Set((source.drawPositions ?? []).filter(Boolean));
    return !!positionAssignmentsOf(structure)?.some(
      (assignment) => positions.has(assignment.drawPosition) && assignment.participantId === participantId,
    );
  }
  return false;
}

/**
 * A CARRY COMES HOME WITH ITS CARRIER. Since #5331 an exit carried past a BYE is written where the carrier lands, so
 * when the BYE that advanced them is withdrawn and the removal above takes the later-round position back, the only
 * record of the exit went with it — and the carrier, back in the matchUp the BYE had moved them out of, met whoever
 * arrived there as an ordinary participant: P50, census 20057285 (FIRST_ROUND_LOSER_CONSOLATION 8/8, on arm): two
 * walkover losers met in `Consolation|1|1` and one of them WON it, where the rules converge them (RULE 4). A carry
 * whose onward matchUp was decided came back by another route (`reconcileCarriesPastByes`, from an origin record the
 * BYE cascade had left); a PENDING one had no origin anywhere once the landing was cleared.
 *
 * Home is the matchUp the carrier returns to: the highest earlier round in this structure still holding the position.
 * Only while the carry's source still stands as an exit: a source re-scored as a played win is WITHDRAWING the carry,
 * and it must not be re-seated (`aRelabelWithdrawsACarryFromAByeHeldMatchUp`, `sideFactsFollowTheSeat`).
 */
export function bringCarryHome({
  drawDefinition,
  drawPosition,
  structureId,
  matchUps,
  carry,
  from,
}: {
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId: string;
  matchUps: MatchUp[];
  carry: SideExitProvenanceEntry;
  from: MatchUp;
}) {
  const source = getMatchUpsMap({ drawDefinition }).drawMatchUps.find((m) => m.matchUpId === carry.sourceMatchUpId);
  if (!source || !isAnyExit(source.matchUpStatus)) return;
  const home = matchUps
    .filter((m) => (m.roundNumber ?? 0) < (from.roundNumber ?? 0) && m.drawPositions?.includes(drawPosition))
    .sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0))[0];
  if (!home) return;
  const homeSide = getDrawPositionSideNumber({
    matchUp: { ...home, sides: undefined },
    drawPosition,
    drawDefinition,
    structureId,
  });
  if (!homeSide || carriedExitStatus(home.sideExitProvenance?.[homeSide])) return;
  mergeSideExitProvenance({ matchUp: home, provenance: { [homeSide]: { ...carry } } });
  // and the state the carrier's arrival would have written had the BYE never stood here: RULE 2, the exit pending,
  // the side without it winning even while empty. `progressExitStatus` reads the STATUS to tell RULE 4 from RULE 2
  // (P37: the provenance read re-routes convergences it has nothing to do with), so an undecided home with a carried
  // exit on record would meet the next arrival as a played match. A BYE-held or decided home is left as it stands.
  if (home.matchUpStatus === TO_BE_PLAYED) {
    const derived = deriveExitStateFromProvenance(home.sideExitProvenance);
    if (derived) {
      home.matchUpStatus = derived.matchUpStatus;
      home.winningSide = derived.winningSide;
    }
  }
}

/**
 * The carried exit a position takes with it when it is RELEASED from a later round: the entry on its own side,
 * structurally, carried by the participant who holds it (not produced by a double exit). See `releaseAdvancedDrawPosition`.
 */
export function carryLeavingWith({
  positionAssignments,
  drawDefinition,
  drawPosition,
  structureId,
  matchUp,
}: {
  positionAssignments: PositionAssignment[];
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId: string;
  matchUp: MatchUp;
}): SideExitProvenanceEntry | undefined {
  const held = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  if (!held?.participantId || !matchUp.sideExitProvenance) return undefined;
  const side = getDrawPositionSideNumber({
    matchUp: { ...matchUp, sides: undefined },
    drawPosition,
    drawDefinition,
    structureId,
  });
  const entry = side === 1 || side === 2 ? matchUp.sideExitProvenance[side] : undefined;
  if (!entry?.sourceMatchUpId || !carriedExitStatus(entry) || isDoubleExit(entry.previousMatchUpStatus))
    return undefined;
  return entry;
}
