import { getTeamLineUp } from '@Query/drawDefinition/getTeamLineUp';

import { INVALID_VALUES } from '@Constants/errorConditionConstants';

export function removeCollectionAssignments({
  collectionPosition,
  teamParticipantId,
  dualMatchUpSide,
  drawDefinition,
  participantIds,
  collectionId,
}) {
  if (!collectionId || !collectionPosition || !Array.isArray(participantIds))
    return {
      modifiedLineUp: dualMatchUpSide?.lineUp ?? [],
      error: INVALID_VALUES,
    };

  const lineUp =
    dualMatchUpSide?.lineUp ||
    getTeamLineUp({
      participantId: teamParticipantId,
      drawDefinition,
    })?.lineUp;

  const previousParticipantIds: string[] = [];
  const assignmentsRemoved: any[] = [];

  const modifiedLineUp =
    lineUp
      ?.map((teamCompetitor) => {
        // don't modify an individual team competitor unless it appears in participantIds
        if (!participantIds.includes(teamCompetitor.participantId)) {
          return teamCompetitor;
        }

        const collectionAssignments = teamCompetitor.collectionAssignments?.filter((assignment) => {
          const target =
            assignment.collectionId === collectionId && assignment.collectionPosition === collectionPosition;
          if (target) {
            if (assignment.previousParticipantId) {
              previousParticipantIds.push(assignment.previousParticipantId);
            }
            assignmentsRemoved.push({
              participantId: teamCompetitor.participantId,
              ...assignment,
            });
          }
          return !target;
        });
        return {
          participantId: teamCompetitor.participantId,
          collectionAssignments,
        };
      })
      .filter(Boolean) ?? [];

  return { modifiedLineUp, assignmentsRemoved, previousParticipantIds };
}
