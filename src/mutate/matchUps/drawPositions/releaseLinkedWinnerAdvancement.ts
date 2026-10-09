import { modifyMatchUpNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { releaseAdvancedDrawPosition } from './releaseAdvancedDrawPosition';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';

type ReleaseLinkedWinnerAdvancementArgs = {
  /** who left, when the caller has already emptied their assignment and the source can no longer say */
  participantId?: string;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  /** read only when `participantId` is not given: the source position whose occupant is released */
  drawPosition?: number;
  /** the link to release across; a LOSER link's placement comes back the same way (default WINNER) */
  linkType?: typeof WINNER | typeof LOSER;
  structureId: string;
  roundNumber: number;
  event?: Event;
};

/**
 * A drawPosition just left a matchUp that is the SOURCE round of a WINNER link — so whatever it
 * carried across that link comes back out of the target structure too.
 *
 * Every position release in the engine is structure-local: `removeSubsequentRoundsParticipant`,
 * `releaseAdvancedDrawPosition` and `positionClear`'s own round walk each take a position out of
 * the rounds of ONE structure. That is complete inside a structure and incomplete at its edge. DOUBLE_ELIMINATION's Backdraw final feeds the Main final
 * across a WINNER link, and a Backdraw finalist can reach the Main final without that final being
 * played — through a BYE, or a pending exit. Take them back out of the Backdraw final and, until
 * this, they stayed in the Main final, where the next Backdraw winner was refused
 * `ERR_EXISTING_POSITION_ASSIGNMENT` over a draw the source write had already changed. The same
 * stranding through `positionClear` — a corrected double exit withdrawing the BYE that had carried
 * the finalist across — was 2 of `correctionDivergenceDeep`'s first 9 severe cells (2026-09-30).
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
 *
 * ## The four paths that stopped at the link — 2026-10-05
 *
 * Traced on the DOUBLE_ELIMINATION grand-final family of the frozen census (nine seeds failing
 * `ERR_EXISTING_POSITION_ASSIGNMENT` after mutating; `Mentat/planning/EXIT_CASCADE_DE_GRAND_FINAL_AND_SIDE_KEY_DESIGN.md`):
 *
 *  - **A**: the target round was decided by a produced exit awarded to the leaving participant's seat, and the
 *    release keeps a decided matchUp's array. The release is told the occupant left (`occupantLeaving`), so it
 *    holds the exit open for the next arrival and takes back the award (a produced exit names no empty seat).
 *  - **B**: a withdrawn carry released the finalist inside the Backdraw only. Every structure-local release now
 *    follows the links out of the rounds it released (`releaseAdvancedDrawPositionAcrossLinks`).
 *  - **C**: the Backdraw FINAL was un-decided, and the withdrawal releases from the round after it, which is
 *    across the link. `applyWithdrawnExits` now asks the link at the withdrawn round itself.
 *  - **D**: the finalist was removed from the structure with their seat keeping its BYE advancement, so no
 *    release ran; and `positionClear` emptied the assignment before this function read it. The callers pass
 *    `participantId` and release across every WINNER link out of the structure.
 *
 * A grand final is reached only across a link, so on `dev` none of these ever reached it.
 * */
export function releaseLinkedWinnerAdvancement({
  participantId,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  linkType = WINNER,
  structureId,
  roundNumber,
  event,
}: ReleaseLinkedWinnerAdvancementArgs) {
  const link = drawDefinition.links?.find(
    (candidate) =>
      candidate.linkType === linkType &&
      candidate.source.structureId === structureId &&
      candidate.source.roundNumber === roundNumber,
  );
  const targetRoundNumber = link?.target.roundNumber;
  if (!link || !targetRoundNumber) return;

  const { structure: sourceStructure } = findStructure({ drawDefinition, structureId });
  const { structure: targetStructure } = findStructure({ drawDefinition, structureId: link.target.structureId });
  if (!sourceStructure || !targetStructure) return;

  const resolvedParticipantId =
    participantId ??
    getPositionAssignments({
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
  // ...unless that prior-round matchUp was decided AGAINST the position: DOUBLE_ELIMINATION's Backdraw winner re-enters
  // the Main final under their own Main position, which is present in the Main semi-final they LOST there (census de
  // 9305625: the finalist stayed in the Main final after the Backdraw final they had won by a stale produced exit was
  // un-decided). Present and undecided, or present and won, is an advance within the structure; present and lost is
  // the link's.
  const prior = targetMatchUps.find(
    (matchUp) => matchUp.roundNumber === targetRoundNumber - 1 && matchUp.drawPositions?.includes(targetDrawPosition),
  );
  const priorWinner =
    prior?.winningSide &&
    getWinningSideDrawPosition({ drawDefinition, structureId: targetStructure.structureId, matchUp: prior });
  const advancedWithinTarget = !!prior && (!prior.winningSide || priorWinner === targetDrawPosition);
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
    const assignment = positionAssignmentsOf(targetStructure)?.find(
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

  releaseAdvancedDrawPositionAcrossLinks({
    structureId: targetStructure.structureId,
    fromRoundNumber: targetRoundNumber,
    drawPosition: targetDrawPosition,
    matchUpsMap: resolvedMap,
    occupantLeaving: true,
    tournamentRecord,
    drawDefinition,
    event,
  });
}

/**
 * `releaseAdvancedDrawPosition`, then the same release across every WINNER link out of a round it released.
 *
 * The release is structure-local; a link is not. A position taken back out of a link's SOURCE round has, by
 * definition, stopped winning that round, so whatever the link carried for it comes back too: the grand final,
 * and from there the Decider. Links run forward, so this recursion ends.
 */
export function releaseAdvancedDrawPositionAcrossLinks({
  participantId,
  ...args
}: Parameters<typeof releaseAdvancedDrawPosition>[0] & { participantId?: string }) {
  const result = releaseAdvancedDrawPosition(args);
  // a BYE position released from a matchUp takes with it what advanced past that BYE (census w2 9100211: the BYE's
  // reservation left `Consolation|3|2`, and the participant who had passed it stayed in `4|1`, ADVANCED_FROM_UNDECIDED)
  for (const { roundNumber, remaining } of result.vacatedByes) {
    for (const drawPosition of remaining) {
      releaseAdvancedDrawPositionAcrossLinks({
        ...args,
        participantId,
        drawPosition,
        fromRoundNumber: roundNumber + 1,
      });
    }
  }
  for (const roundNumber of result.releasedRoundNumbers) {
    releaseLinkedWinnerAdvancement({
      participantId,
      tournamentRecord: args.tournamentRecord,
      drawDefinition: args.drawDefinition,
      drawPosition: args.drawPosition,
      matchUpsMap: args.matchUpsMap,
      structureId: args.structureId,
      event: args.event,
      roundNumber,
    });
  }
  return result;
}

/**
 * A participant has left a structure: release whatever any WINNER link out of it carried for them.
 *
 * For a removal that runs no round release at all, because the seat keeps its BYE advancement (P46): the
 * participant leaves, the seat stays advanced, and nothing asked the link (mode D, census de 9304251). The
 * participant is named by the caller, which has already emptied their assignment. Each link releases only
 * what it fed (see `releaseLinkedWinnerAdvancement`), so asking a link that carried nothing is a no-op.
 */
export function releaseAcrossWinnerLinks({
  tournamentRecord,
  drawDefinition,
  participantId,
  drawPosition,
  matchUpsMap,
  structureId,
  event,
}: Omit<ReleaseLinkedWinnerAdvancementArgs, 'roundNumber'> & { participantId: string }) {
  for (const link of drawDefinition.links ?? []) {
    if (link.linkType !== WINNER || link.source.structureId !== structureId || !link.source.roundNumber) continue;
    releaseLinkedWinnerAdvancement({
      roundNumber: link.source.roundNumber,
      tournamentRecord,
      drawDefinition,
      participantId,
      drawPosition,
      matchUpsMap,
      structureId,
      event,
    });
  }
}
