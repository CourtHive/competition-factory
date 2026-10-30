import { byeSeatPositionsOwedTo, byeSeatStands } from './feederSendsNobody';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionAssignmentsOf } from '@Acquire/structureMembers';

// constants and types
import type { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';

/** `clearDrawPosition`, handed in by the caller (the release chain passes it down) */
export type ClearDrawPosition = typeof clearDrawPosition;

/**
 * Withdraw a matchUp's BYE claims, clearing each propagated BYE seat no other claim still holds. A claim in `keepAt`
 * (the claimant's own loser target, where its BYE is still owed) is left standing.
 *
 * The seat is cleared by the `clearDrawPosition` the caller hands in. Clearing a position releases what it advanced
 * across links (`releaseLinkedWinnerAdvancement`), whose release withdraws BYE seats in turn: the recursion is real,
 * and passing the clearer keeps it out of the module graph (no import cycle between these modules).
 */
export function withdrawByeSeats({
  clearDrawPosition,
  claimantMatchUpId,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  keepAt,
  event,
}: {
  clearDrawPosition: ClearDrawPosition;
  tournamentRecord?: Tournament;
  keepAt?: string;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  claimantMatchUpId: string;
  event?: Event;
}) {
  const claimant = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === claimantMatchUpId);
  const claimantIsBye = claimant?.matchUpStatus === BYE;
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord, event, drawDefinition });
  // the seats this matchUp is the reason for, read from the draw before anything is withdrawn
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
  const owed = byeSeatPositionsOwedTo({ inContextDrawMatchUps, drawDefinition, matchUpId: claimantMatchUpId });

  if (claimantIsBye) return;

  const withdrawn = new Set([claimantMatchUpId]);
  for (const { matchUp, structureId, drawPosition } of owed) {
    if (matchUp.matchUpId === keepAt) continue;
    const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === structureId);
    const assignment = positionAssignmentsOf(structure)?.find((entry) => entry.drawPosition === drawPosition);
    if (!assignment?.bye || !assignment.byeFromPropagation) continue;
    // the BYE stays while its seat's feeder, read from the draw, still sends nobody (`byeSeatStands`); the claimant is
    // judged as its withdrawal leaves it
    if (byeSeatStands({ withdrawn, appliedPolicies, drawDefinition, drawPosition, matchUpsMap, structureId })) continue;
    clearDrawPosition({ tournamentRecord, drawDefinition, structureId, drawPosition, matchUpsMap, event });
  }
}
