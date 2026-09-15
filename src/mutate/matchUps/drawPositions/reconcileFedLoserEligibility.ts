import { structureAssignedDrawPositions, getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';

// constants and types
import { DrawDefinition, DrawLink, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type ReconcileFedLoserEligibilityArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  loserTargetLink?: DrawLink;
  loserDrawPosition: number;
  structure: Structure;
  event?: Event;
};

/**
 * After a result changes, the participant fed by a LOSER link may no longer be ELIGIBLE for it.
 *
 * ## Why this is not part of the swap
 *
 * Changing a winner is a RELABEL: the two participants keep their drawPositions in the structure
 * they played in, and in every structure downstream the occupant's identity changes. Nothing is
 * placed and nothing is removed — a swap has no placement decision to make, because the position
 * and its binding already exist.
 *
 * **Exactly one thing can break that symmetry, and it is link-defined.** `FIRST_MATCHUP` is the only
 * `linkCondition` the engine emits, and it makes entry conditional on the arriving participant
 * rather than on the position: a loser feeds the target only on zero prior scored wins. So a flip
 * can change WHO IS ELIGIBLE, not merely who lost, and the relabel alone would write a participant
 * into a structure they cannot enter. Measured on census seed 9000349 — a participant with one
 * scored win in Main R1 replaced one whose round-1 BYE made the flipped matchUp genuinely their
 * first.
 *
 * That consequence is a property of the LINK, not of the swap, so it lives here. The swap stays a
 * pure relabel and this step reconciles the one condition that can contradict it.
 *
 * ## It is a STATE check, not a transition check
 *
 * It asks "is the participant now occupying this fed position eligible to be there?" — so it needs
 * no knowledge of what changed, and it must run AFTER the new result is applied. That ordering also
 * removes a subtlety the in-swap version carried: it had to count wins over PRIOR ROUNDS ONLY,
 * because it ran before the new `winningSide` was written and would otherwise have counted the very
 * win being taken away. Once the result is applied, the shared predicate over the whole structure is
 * simply correct.
 *
 * `isFedLoserEligible` is shared with `directLoser` and with `getDrawInconsistencies`, so the
 * placement path, the integrity scan and this reconciliation cannot drift apart.
 */
export function reconcileFedLoserEligibility({
  loserDrawPosition,
  tournamentRecord,
  loserTargetLink,
  drawDefinition,
  structure,
  event,
}: ReconcileFedLoserEligibilityArgs): ResultType {
  // Every other link feeds unconditionally, so there is nothing a relabel could contradict.
  if (loserTargetLink?.linkCondition !== FIRST_MATCHUP) return { ...SUCCESS };

  const targetStructureId = loserTargetLink.target?.structureId;
  if (!targetStructureId) return { ...SUCCESS };

  const { matchUps: sourceMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    structure,
    event,
  });

  if (isFedLoserEligible({ sourceMatchUps: sourceMatchUps ?? [], loserDrawPosition, loserTargetLink })) {
    return { ...SUCCESS };
  }

  const { positionAssignments: sourcePositionAssignments } = structureAssignedDrawPositions({
    structureId: structure.structureId,
    drawDefinition,
  });
  const loserParticipantId = sourcePositionAssignments?.find(
    (assignment) => assignment.drawPosition === loserDrawPosition,
  )?.participantId;
  if (!loserParticipantId) return { ...SUCCESS };

  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId: targetStructureId });
  const assignment = positionAssignments?.find(({ participantId }) => participantId === loserParticipantId);
  if (!assignment) return { ...SUCCESS };

  // The slot reverts to what `directLoser` would have put there for this participant on this link:
  // a BYE marked as propagation-produced, so removal can later tell it from a structural BYE.
  delete assignment.participantId;
  assignDrawPositionBye({
    drawPosition: assignment.drawPosition,
    structureId: targetStructureId,
    byeFromPropagation: true,
    tournamentRecord,
    drawDefinition,
    event,
  });

  return { ...SUCCESS };
}
