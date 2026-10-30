import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { cameDownLoserLink } from './cameDownLoserLink';
import { isDoubleExit } from '@Validators/isExit';

// types
import type {
  MatchUpStatusUnion,
  PositionAssignment,
  SideExitProvenance,
  DrawDefinition,
  MatchUp,
} from '@Types/tournamentTypes';

/**
 * A PRODUCED exit has no winningSide until a participant arrives (CA, 2026-09-20); a CARRIED exit keeps its
 * winningSide on an empty seat (exit-propagation.md). `deriveExitStateFromProvenance` awards the other side either
 * way, so the award stands here only for a carried exit or a seat that holds a participant. Census de 9302775
 * (DE 16/11): a produced DEFAULTED retained on `Backdraw|3|2` side 1 was otherwise won by an empty dp 7.
 */
export function awardStands({
  rederived,
  retained,
  positionAssignments,
  targetMatchUp,
  drawDefinition,
  structureId,
}: {
  rederived: { matchUpStatus: MatchUpStatusUnion; winningSide?: number };
  positionAssignments: PositionAssignment[];
  retained?: SideExitProvenance;
  drawDefinition: DrawDefinition;
  targetMatchUp: MatchUp;
  structureId: string;
}): boolean {
  const { winningSide } = rederived;
  if (!winningSide) return true;
  const exitEntry = retained?.[3 - winningSide];
  if (!isDoubleExit(exitEntry?.previousMatchUpStatus)) return true;
  // an exit that came straight down its source's LOSER link keeps its award to the seat that will receive the next
  // arrival, as direct entry writes it (`exitStatusClearing` 2.3; `removeDoubleExit`'s `producedAwardStands`). Taken
  // back here, a BYE withdrawn from that seat left the exit pending, and the held exit beside the next BYE read its
  // target's other feeder as delivering nobody (census run 19, COMPASS 32/32 policy-off 20834212: `Southeast|1|2`)
  if (cameDownLoserLink({ drawDefinition, targetMatchUp, sourceMatchUpId: exitEntry?.sourceMatchUpId })) return true;
  const drawPosition = getSideDrawPosition({
    matchUp: { ...targetMatchUp, sides: undefined },
    sideNumber: winningSide,
    drawDefinition,
    structureId,
  });
  const assignment = positionAssignments.find((candidate) => candidate.drawPosition === drawPosition);
  return !!(assignment?.participantId || assignment?.qualifier);
}
