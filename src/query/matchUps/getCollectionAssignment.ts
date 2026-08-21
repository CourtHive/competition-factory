import { getCollectionPositionAssignments } from '@Query/hierarchical/tieFormats/getCollectionPositionAssignments';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { getTeamLineUp } from '@Query/drawDefinition/getTeamLineUp';
import { attributeFilter } from '@Tools/attributeFilter';

// constants and types
import { DrawDefinition, Participant, PositionAssignment } from '@Types/tournamentTypes';
import { ParticipantMap, Substitution } from '@Types/factoryTypes';
import { DOUBLES } from '@Constants/matchUpTypes';

type GetDrawPositionCollectionAssignmentArgs = {
  positionAssignments: PositionAssignment[];
  tournamentParticipants?: Participant[];
  /** `participant` template of a supplied participant privacy policy; undefined means no filtering. */
  participantTemplate?: any;
  participantMap?: ParticipantMap;
  drawDefinition?: DrawDefinition;
  collectionPosition?: number;
  drawPositions?: number[];
  collectionId: string;
  matchUpType?: string;
  sideLineUps?: any;
};

type TeamCollectionAssignment = {
  [key: string]: {
    substitutions: Substitution[];
    teamParticipant: Participant;
    participantId?: string;
  };
};

export function getCollectionAssignment({
  tournamentParticipants,
  positionAssignments,
  participantTemplate,
  collectionPosition,
  drawPositions = [],
  participantMap,
  drawDefinition,
  collectionId,
  sideLineUps,
  matchUpType,
}: GetDrawPositionCollectionAssignmentArgs): {
  drawPositionCollectionAssignment?: TeamCollectionAssignment;
  sideNumberCollectionAssignment?: TeamCollectionAssignment;
} {
  if (!collectionId || !collectionPosition) return {};

  // `teamParticipant` lands on `sides[].teamParticipant` of every tie matchUp. Two of the three ways
  // it is resolved below reach straight into the RAW participant (`participantMap`, then a scan of
  // `tournamentParticipants`), so without this it carried `penalties`, `timeItems` and everything else
  // the policy denies — on the same hydrated matchUps whose `sides[].participant` was filtered
  // correctly beside it.
  const filterTeamParticipant = (teamParticipant) =>
    participantTemplate && teamParticipant
      ? attributeFilter({ source: teamParticipant, template: participantTemplate })
      : teamParticipant;

  const getAssignment = ({ attribute, lineUp, teamParticipant: rawTeamParticipant }) => {
    const teamParticipant = filterTeamParticipant(rawTeamParticipant);
    const { assignedParticipantIds, substitutions } = getCollectionPositionAssignments({
      collectionPosition,
      collectionId,
      lineUp,
    });
    if (matchUpType === DOUBLES) {
      if (assignedParticipantIds?.length <= 2) {
        const pairedParticipantId = participantMap?.[assignedParticipantIds[0]]?.pairIdMap?.[assignedParticipantIds[1]];
        const pairedParticipant = pairedParticipantId && participantMap[pairedParticipantId]?.participant;
        const participant =
          pairedParticipant ||
          // resort to brute force
          getPairedParticipant({
            participantIds: assignedParticipantIds,
            tournamentParticipants,
          }).participant;

        const participantId = participant?.participantId;
        return {
          [attribute]: { participantId, teamParticipant, substitutions },
        };
      } else if (assignedParticipantIds?.length > 2) {
        return { [attribute]: { teamParticipant, substitutions } };
      }
    } else {
      const participantId = assignedParticipantIds?.[0];

      return (
        participantId && {
          [attribute]: { participantId, teamParticipant, substitutions },
        }
      );
    }
    return undefined;
  };

  if (!drawPositions?.length) {
    const sideNumberCollectionAssignment =
      sideLineUps
        ?.map((side) => {
          const { teamParticipant, sideNumber } = side;
          const lineUp =
            side.lineUp || getTeamLineUp({ participantId: teamParticipant.teamParticipantId, drawDefinition })?.lineUp;

          return getAssignment({ attribute: sideNumber, lineUp, teamParticipant });
        })
        .filter(Boolean) ?? {};
    return { sideNumberCollectionAssignment: Object.assign({}, ...sideNumberCollectionAssignment) };
  }

  const drawPositionCollectionAssignment: any =
    drawPositions
      ?.map((drawPosition) => {
        const teamParticipantId = positionAssignments.find(
          (assignment) => assignment.drawPosition === drawPosition,
        )?.participantId;

        const side = sideLineUps?.find((lineUp) => lineUp?.drawPosition === drawPosition);

        const teamParticipant =
          side?.teamParticipant ||
          (teamParticipantId && participantMap?.[teamParticipantId]?.participant) ||
          tournamentParticipants?.find(({ participantId }) => participantId === teamParticipantId);

        const lineUp =
          side?.lineUp ||
          getTeamLineUp({
            participantId: teamParticipantId,
            drawDefinition,
          })?.lineUp;
        return getAssignment({ attribute: drawPosition, lineUp, teamParticipant });
      })
      .filter(Boolean) ?? {};

  return { drawPositionCollectionAssignment: Object.assign({}, ...drawPositionCollectionAssignment) };
}
