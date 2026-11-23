import tournamentEngine from '@Engines/syncEngine';
import { expect } from 'vitest';

// constants
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';

export function assignIndividualParticipants(params) {
  const { doublesMatchUpCount, singlesMatchUpCount, teamParticipants, drawDefinition, teamMatchUps } = params;
  const { positionAssignments } = drawDefinition.structures[0];
  const { drawId } = drawDefinition;

  const findAssignment = (participantId) => {
    return positionAssignments.find((assignment) => assignment.participantId === participantId);
  };
  const assignSinglesParticipants = (singlesMatchUp, i) => {
    const tieMatchUpId = singlesMatchUp.matchUpId;
    singlesMatchUp.sides.forEach((side) => {
      const { drawPosition } = side;

      const teamParticipant = teamParticipants.find((teamParticipant) => {
        const assignment = findAssignment(teamParticipant.participantId);
        return assignment.drawPosition === drawPosition;
      });
      if (teamParticipant) {
        const individualParticipantId = teamParticipant.individualParticipantIds[i];
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
      }
    });
  };

  const assignDoublesParticipants = (doublesMatchUp, i) => {
    const tieMatchUpId = doublesMatchUp.matchUpId;
    doublesMatchUp.sides.forEach((side) => {
      const { drawPosition } = side;
      const teamParticipant = teamParticipants.find((teamParticipant) => {
        const assignment = findAssignment(teamParticipant.participantId);
        return assignment.drawPosition === drawPosition;
      });
      if (teamParticipant) {
        const individualParticipantIds = teamParticipant.individualParticipantIds.slice(i * 2, i * 2 + 2);
        individualParticipantIds.forEach((individualParticipantId) => {
          const result = tournamentEngine.assignTieMatchUpParticipantId({
            participantId: individualParticipantId,
            tieMatchUpId,
            drawId,
          });
          expect(result.success).toEqual(true);
        });
      }
    });
  };

  const assignParticipants = (dualMatchUp) => {
    // assign team participants to singlesG matchUps
    const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES_MATCHUP);
    singlesMatchUps.slice(0, singlesMatchUpCount ?? singlesMatchUps.length).forEach(assignSinglesParticipants);

    // assign team participants to doubles matchUps
    const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES_MATCHUP);
    doublesMatchUps.slice(0, doublesMatchUpCount ?? doublesMatchUps.length).forEach(assignDoublesParticipants);
  };

  // assign individual participants to all first round East matchUps
  teamMatchUps.forEach(assignParticipants);
}
