import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { indexed, storedLoserId } from './planShared';
import { withdrawnExitReset } from './unwindPath';
import { removalCertified } from './landingRemoval';

// constants and types
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import type { OutcomeView } from '../types';
import type { OutcomeOp } from '../ops';

export type CarrySource = { drawDefinition?: DrawDefinition; matchUpId?: string };

/**
 * C27: a cleared single exit whose loser carried it across the link, the carry still pending there: the loser matchUp
 * holds the exit this matchUp produced, awarded to the side opposite the carrier with nobody (and no BYE) there yet.
 * v1's `removeDirectedParticipants` takes back the exits the matchUp produced first (`withdrawProducedExits` →
 * `applyWithdrawnExits`: the loser matchUp back to be played, its provenance gone, its `scoredTime` standing), then the
 * winner's position (`removeDirectedWinner`), then the carrier's seat (`removeDirectedLoser`). Certified as 2c-1's
 * landing removal is (`removalCertified`): the loser matchUp the only one this matchUp's provenance reaches, the carrier
 * gone nowhere past it. Undefined, the call v1's, otherwise. Planned on the cleared route (`removedOps`) and on a result
 * turned double exit (`resultToDoubleExit`), whose removal is the same `removeDirectedParticipants`.
 */
export function pendingCarryWithdrawal(view: OutcomeView, carry?: CarrySource): string | undefined {
  const { targets } = view;
  if (!carry?.drawDefinition || !carry.matchUpId) return undefined;
  const { loserMatchUpId, loserStructureId, loserTargetDrawPosition, loserTargetSeat } = targets;
  if (!loserMatchUpId || !loserStructureId || !loserTargetDrawPosition || targets.loserLink?.linkCondition)
    return undefined;
  const carrier = storedLoserId(view);
  if (!carrier || loserTargetSeat?.participantId !== carrier || loserTargetSeat.opponentBye) return undefined;
  if (targets.loserMatchUpStatus !== WALKOVER && targets.loserMatchUpStatus !== DEFAULTED) return undefined;
  if (!targets.loserMatchUpCarriesSourceExit) return undefined;
  const source = indexed(view, carry.matchUpId);
  const loserMatchUp = indexed(view, loserMatchUpId);
  if (!source || !loserMatchUp || loserMatchUp.structureId === source.structureId || loserMatchUp.collectionId)
    return undefined;
  // the carrier's entry the loser matchUp's only provenance
  const entries = Object.values(getSideExitProvenance({ matchUp: loserMatchUp }) ?? {}).filter(
    (entry): entry is SideExitProvenanceEntry => !!entry,
  );
  if (entries.length !== 1 || entries[0]?.sourceMatchUpId !== carry.matchUpId) return undefined;
  const certified = removalCertified(
    view,
    carry.drawDefinition,
    source,
    loserMatchUp,
    loserTargetDrawPosition,
    carrier,
  );
  return certified ? loserMatchUpId : undefined;
}

/** the pending carry withdrawn, ahead of the winner's and the carrier's removal (v1's order) */
export function pendingCarryOps(view: OutcomeView, carry?: CarrySource): OutcomeOp[] {
  const loserMatchUpId = pendingCarryWithdrawal(view, carry);
  return loserMatchUpId ? withdrawnExitReset(loserMatchUpId, { keepsScoredTime: true }) : [];
}
