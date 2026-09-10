import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { getLadderOrdering } from '@Query/ladder/getLadderPolicy';
import { addTimeItem } from '@Mutate/timeItems/addTimeItem';
import { isLadder } from '@Query/drawDefinition/isLadder';

import { LADDER_PARTICIPANT_REMOVED, RANK } from '@Constants/ladderConstants';
import { RANKING } from '@Constants/scaleConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';

type RemoveArgs = {
  /** Why — recorded, because a manual override with no reason is indistinguishable from a mistake. */
  reason?: string;
  removedAt: string;
  participantId: string;
  tournamentRecord?: any;
  drawDefinition: any;
  structureId?: string;
  event?: any;
};

/**
 * Removes a participant from a ladder by hand, closing everyone below up one rank.
 *
 * WHY THIS EXISTS. Lapse consequences are evaluated only when a challenge resolves (D8), so someone
 * nobody challenges never lapses and keeps their position indefinitely — which is the right default,
 * since they have denied nobody. But it leaves no automatic route for the extenuating case: a member
 * who has left the club, is injured for a season, or has died. An operator must always be able to
 * act where policy deliberately does not.
 *
 * This is the ONLY position mutation not driven by a challenge, and it stays explicit rather than
 * being modelled as an automatic consequence — precisely so it cannot fire on its own.
 */
export function removeLadderParticipant(params: RemoveArgs): ResultType & { vacatedPosition?: number } {
  const { participantId, removedAt, drawDefinition, reason } = params;

  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) return { error: INVALID_VALUES, info: 'requires a LADDER drawType' };
  if (!participantId) return { error: INVALID_VALUES, info: 'participantId is required' };
  if (!removedAt) return { error: INVALID_VALUES, info: 'removedAt is required' };

  const structureId = params.structureId ?? drawDefinition.structures?.[0]?.structureId;
  const structure = drawDefinition.structures?.find((s: any) => s.structureId === structureId);
  if (!structure) return { error: INVALID_VALUES, info: 'structure not found' };

  const assignments = structure.positionAssignments ?? [];
  const target = assignments.find((a: any) => a.participantId === participantId);
  if (!target) return { error: PARTICIPANT_NOT_FOUND };

  const vacatedPosition = target.drawPosition;
  structure.positionAssignments = assignments.filter((a: any) => a.participantId !== participantId);

  const touched: any[] = [];
  // Close the gap: a ladder with a hole in it is not a ranking. Only meaningful under RANK — a
  // RATING ladder's positions are a projection and will be recomputed from the scale.
  if (getLadderOrdering({ ...params, structure }) === RANK) {
    for (const assignment of structure.positionAssignments) {
      if (assignment.drawPosition > vacatedPosition) {
        assignment.drawPosition -= 1;
        touched.push(assignment);
      }
    }
  }

  addTimeItem({
    timeItem: { itemType: LADDER_PARTICIPANT_REMOVED, itemValue: { participantId, reason }, itemDate: removedAt },
    element: structure,
  });

  if (params.tournamentRecord) {
    for (const assignment of touched) {
      setParticipantScaleItem({
        scaleItem: {
          scaleType: RANKING,
          scaleName: drawDefinition.drawId,
          scaleValue: assignment.drawPosition,
          scaleDate: removedAt,
        },
        participantId: assignment.participantId,
        tournamentRecord: params.tournamentRecord,
      });
    }
  }

  return { ...SUCCESS, vacatedPosition };
}
