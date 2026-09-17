import { modifyMatchUpNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { releaseAdvancedDrawPosition } from './releaseAdvancedDrawPosition';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { WINNER } from '@Constants/drawDefinitionConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';

type ReleaseLinkedWinnerAdvancementArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  drawPosition: number;
  structureId: string;
  roundNumber: number;
  event?: Event;
};

/**
 * A drawPosition just left a matchUp that is the SOURCE round of a WINNER link — so whatever it
 * carried across that link comes back out of the target structure too.
 *
 * Every position release in the engine is structure-local: `removeSubsequentRoundsParticipant` and
 * `releaseAdvancedDrawPosition` walk the rounds of ONE structure. That is complete inside a
 * structure and incomplete at its edge. DOUBLE_ELIMINATION's Backdraw final feeds the Main final
 * across a WINNER link, and a Backdraw finalist can reach the Main final without that final being
 * played — through a BYE, or a pending exit. Take them back out of the Backdraw final and, until
 * this, they stayed in the Main final, where the next Backdraw winner was refused
 * `ERR_EXISTING_POSITION_ASSIGNMENT` over a draw the source write had already changed.
 *
 * ## Numbering
 *
 * A drawPosition is a number in one structure. The participant is resolved from the SOURCE
 * structure's assignments and then located by THEIR position in the target; see
 * `advanceIntoWinnerMatchUp` for the placement half of the same rule.
 *
 * ## Only a FED position is released
 *
 * The target round can hold the participant's position for two reasons, and only one of them is
 * this link. A position present in the target structure's PRIOR round advanced within that structure
 * and is not ours to take; a position absent from it arrived across the link. That is the fed vs
 * advanced rule published in `documentation/docs/concepts/draw-positions.md`, applied as stated.
 * */
export function releaseLinkedWinnerAdvancement({
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  structureId,
  roundNumber,
  event,
}: ReleaseLinkedWinnerAdvancementArgs) {
  const link = drawDefinition.links?.find(
    (candidate) =>
      candidate.linkType === WINNER &&
      candidate.source.structureId === structureId &&
      candidate.source.roundNumber === roundNumber,
  );
  const targetRoundNumber = link?.target.roundNumber;
  if (!link || !targetRoundNumber) return;

  const { structure: sourceStructure } = findStructure({ drawDefinition, structureId });
  const { structure: targetStructure } = findStructure({ drawDefinition, structureId: link.target.structureId });
  if (!sourceStructure || !targetStructure) return;

  const resolvedParticipantId = getPositionAssignments({
    drawDefinition,
    structure: sourceStructure,
  }).positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition)?.participantId;
  if (!resolvedParticipantId) return;

  const targetDrawPosition = getPositionAssignments({
    structure: targetStructure,
    drawDefinition,
  }).positionAssignments?.find((assignment) => assignment.participantId === resolvedParticipantId)?.drawPosition;
  if (!targetDrawPosition) return;

  const resolvedMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const targetMatchUps = resolvedMap?.mappedMatchUps?.[targetStructure.structureId]?.matchUps ?? [];
  const advancedWithinTarget = targetMatchUps.some(
    (matchUp) => matchUp.roundNumber === targetRoundNumber - 1 && matchUp.drawPositions?.includes(targetDrawPosition),
  );
  if (advancedWithinTarget) return;

  /**
   * A link whose target round is where the position FIRST appears places by ASSIGNMENT, not by
   * advancement: DOUBLE_ELIMINATION's Decider, fed by `Main r4 --WINNER--> Decider r1`, holds its two
   * positions from generation and receives participants onto them. There is nothing to strip from a
   * matchUp — `releaseAdvancedDrawPosition` rightly never touches a position's initial round — so the
   * participant is taken off the ASSIGNMENT instead, and only while the matchUp it sits in is
   * undecided. Census window 9300001 seed 9301605: the Main final's winner was flipped away and stayed
   * assigned in the Decider, which then refused the Main final's real loser.
   */
  const { initialRoundNumber } = getInitialRoundNumber({ drawPosition: targetDrawPosition, matchUps: targetMatchUps });
  if (initialRoundNumber === targetRoundNumber) {
    const holder = targetMatchUps.find(
      (matchUp) => matchUp.roundNumber === targetRoundNumber && matchUp.drawPositions?.includes(targetDrawPosition),
    );
    const undecided = holder && !holder.winningSide && [undefined, TO_BE_PLAYED, BYE].includes(holder.matchUpStatus);
    const assignment = targetStructure.positionAssignments?.find(
      (candidate) => candidate.drawPosition === targetDrawPosition,
    );
    if (!undecided || !assignment?.participantId) return;

    delete assignment.participantId;
    modifyPositionAssignmentsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      structure: targetStructure,
      drawDefinition,
      event,
    });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'releaseLinkedWinnerAdvancement',
      eventId: event?.eventId,
      matchUp: holder,
      drawDefinition,
      event,
    });
    return;
  }

  releaseAdvancedDrawPosition({
    structureId: targetStructure.structureId,
    fromRoundNumber: targetRoundNumber,
    drawPosition: targetDrawPosition,
    matchUpsMap: resolvedMap,
    tournamentRecord,
    drawDefinition,
    event,
  });
}
