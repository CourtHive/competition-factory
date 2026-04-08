import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getRoundMatchUps } from '../matchUps/getRoundMatchUps';

// constants and types
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type IsLuckyArgs = {
  drawDefinition?: DrawDefinition;
  matchUps?: HydratedMatchUp[];
  roundsNotPowerOf2?: boolean;
  structure?: Structure;
};
export function isLucky({ roundsNotPowerOf2, drawDefinition, structure, matchUps }: IsLuckyArgs) {
  if (!structure) return false;

  // Qualifying structures are never lucky draws even if rounds aren't power of 2
  if (structure.stage === QUALIFYING) return false;

  matchUps = matchUps ?? structure.matchUps ?? [];
  roundsNotPowerOf2 = roundsNotPowerOf2 ?? getRoundMatchUps({ matchUps }).roundsNotPowerOf2;

  const hasDrawPositions =
    !!structure.positionAssignments?.find(({ drawPosition }) => drawPosition) ||
    !!matchUps?.find(({ drawPositions }) => drawPositions?.length);

  return (
    (!drawDefinition?.drawType || !isLuckyBasedDraw(drawDefinition.drawType)) &&
    !structure?.structures &&
    roundsNotPowerOf2 &&
    hasDrawPositions
  );
}
