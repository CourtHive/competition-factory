// Types
import { PositionAssignment, SeedAssignment } from '@Types/tournamentTypes';
import { HydratedSide } from '@Types/hydrated';

export function getSide({
  drawPositionCollectionAssignment,
  sideNumberCollectionAssignment,
  positionAssignments,
  hasFedDrawPosition,
  displaySideNumber,
  seedAssignments,
  drawPosition,
  sideNumber,
}: {
  positionAssignments: PositionAssignment[];
  drawPositionCollectionAssignment?: any;
  sideNumberCollectionAssignment?: any;
  seedAssignments?: SeedAssignment[];
  hasFedDrawPosition?: boolean;
  displaySideNumber: number;
  drawPosition?: number;
  sideNumber: number;
}) {
  const assignment = positionAssignments.find(
    (assignment) => assignment.drawPosition && assignment.drawPosition === drawPosition,
  );
  const dpc = drawPosition && drawPositionCollectionAssignment;
  const snc = sideNumber && sideNumberCollectionAssignment;
  const participantId = dpc ? dpc[drawPosition]?.participantId : assignment?.participantId;

  const sideValue = assignment
    ? getSideValue({
        displaySideNumber,
        seedAssignments,
        participantId,
        assignment,
        sideNumber,
      })
    : { ...snc?.[sideNumber] };

  /**
   * These mark the SLOT, not the participant — `participantFed` is true of an empty fed side that is
   * still waiting, and `getAvailablePlayoffProfiles` reads exactly that shape
   * (`participantFed && !participantId`). The names predate the distinction and are published, so
   * they are kept; what changed is the fact they are derived from.
   *
   * This used to read `feedRound`, which is the SIDE-ORDERING inference (matchUpsCount equality) and
   * is true of one round that reserves no slot at all: `DOUBLE_ELIMINATION`'s Main final, fed by a
   * WINNER link from the Backdraw at a drawPosition its arrival already holds. Every Main final in
   * every double elimination therefore published an empty side 1 as `participantFed` for a slot that
   * does not exist — the fed-vs-advanced pair in `documentation/docs/concepts/draw-positions.md` § 4a
   * says both of its positions are ADVANCED.
   *
   * `hasFedDrawPosition` is the reserved-slot fact. See `getRoundMatchUps` for how it is derived and
   * `getWinnerLinkRoundNumbers` for the measurement behind it.
   */
  if (hasFedDrawPosition) {
    if (sideNumber === 1) {
      Object.assign(sideValue, { participantFed: true });
    } else {
      Object.assign(sideValue, { participantAdvanced: true });
    }
  }

  if (drawPosition && dpc) {
    const teamParticipant = dpc[drawPosition]?.teamParticipant;
    const participant = dpc[drawPosition]?.participant;
    const substitutions = dpc[drawPosition]?.substitutions;
    if (participant) sideValue.participant = participant;
    if (substitutions) sideValue.substitutions = substitutions;
    if (teamParticipant) sideValue.teamParticipant = teamParticipant;
  }

  return sideValue;
}

function getSideValue({ displaySideNumber, seedAssignments, participantId, assignment, sideNumber }) {
  const side: HydratedSide = {
    drawPosition: assignment.drawPosition,
    displaySideNumber,
    sideNumber,
  };
  if (participantId) {
    const seeding = getSeeding({ seedAssignments, participantId });
    Object.assign(side, seeding, { participantId });
    if (seeding?.seedNumber && seeding?.seedValue === '') {
      // if an empty string is returned, use a tilde to indicate a seed assignment has been removed
      side.seedValue = '~';
    }
  } else if (assignment.bye) {
    Object.assign(side, { bye: true });
  }

  if (assignment.qualifier) {
    Object.assign(side, { qualifier: true });
  }

  return side;
}

function getSeeding({ seedAssignments, participantId }) {
  return seedAssignments?.find((assignment) => !assignment.seedProxy && assignment.participantId === participantId);
}
