import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { intersection } from '@Tools/arrays';

// types
import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type GetTargetMatchUpsArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition?: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structure: Structure;
  assignments?: any;
};
export function getTargetMatchUps({
  inContextDrawMatchUps,
  drawDefinition,
  assignments,
  matchUpsMap,
  structure,
}: GetTargetMatchUpsArgs) {
  // to support ROUND_ROBIN contained structures
  const containedStructures = getContainedStructures({
    drawDefinition,
  })?.containedStructures;

  const targetStructureIds = containedStructures?.[structure.structureId]?.map(({ structureId }) => structureId) ?? [];

  targetStructureIds.push(structure?.structureId);

  const drawPositions = assignments?.map(({ drawPosition }) => drawPosition) ?? [];

  // find all matchUps in the specified structure which contain the target drawPositions
  const targetMatchUps =
    inContextDrawMatchUps?.filter(
      (matchUp) =>
        targetStructureIds.includes(matchUp.structureId) &&
        intersection(matchUp.drawPositions ?? [], drawPositions).length,
    ) ?? [];

  const targetMatchUpIds = targetMatchUps.map(({ matchUpId }) => matchUpId);
  const matchUps = matchUpsMap?.drawMatchUps?.filter((matchUp) => targetMatchUpIds.includes(matchUp.matchUpId)) ?? [];

  return { drawPositions, matchUps, targetMatchUps };
}
