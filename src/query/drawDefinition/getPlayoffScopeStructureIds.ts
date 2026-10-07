import { findStructure } from '@Acquire/findStructure';

// constants and types
import { LOSER, POSITION, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

type GetPlayoffScopeStructureIdsArgs = {
  drawDefinition: DrawDefinition;
  structureId?: string;
};

/**
 * The structures whose finishing positions count as "played off" when asking what a structure can
 * still play off.
 *
 * Finishing positions are numbers scoped to a chain of structures, not to the draw: a 64 qualifying's
 * round-1 losers finish 33–64 in the QUALIFYING chain, while a 64 main's consolation plays off 33–64
 * in the MAIN chain. `getPositionsPlayedOff` defaults to every non-qualifying structure, which is the
 * right scope for a MAIN-stage source but hides a qualifying structure's rounds whenever a main-side
 * structure happens to own the same numbers (an FMLC 64 main hid the qualifying's round 1).
 *
 * For a QUALIFYING source the scope is the structure itself plus everything reached from it over
 * LOSER and POSITION links — its own playoffs and consolations. WINNER links are not followed: they
 * advance participants into the next stage and play off nothing of the source. For every other source
 * `undefined` is returned so callers keep the historical draw-wide default.
 */
export function getPlayoffScopeStructureIds({
  drawDefinition,
  structureId,
}: GetPlayoffScopeStructureIdsArgs): string[] | undefined {
  if (!structureId) return undefined;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (structure?.stage !== QUALIFYING) return undefined;

  const scope = new Set<string>([structureId]);
  const links = drawDefinition.links ?? [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const link of links) {
      if (link.linkType !== LOSER && link.linkType !== POSITION) continue;
      const sourceId = link.source?.structureId;
      const targetId = link.target?.structureId;
      if (sourceId && targetId && scope.has(sourceId) && !scope.has(targetId)) {
        scope.add(targetId);
        grew = true;
      }
    }
  }

  return [...scope];
}
