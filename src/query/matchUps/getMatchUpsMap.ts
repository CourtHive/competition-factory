import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';
import { MappedMatchUps, MatchUpsMap } from '@Types/factoryTypes';

type GetMatchUpsMapArgs = {
  drawDefinition?: DrawDefinition;
  structure?: Structure;
};

export function getMatchUpsMap({ drawDefinition, structure }: GetMatchUpsMapArgs): MatchUpsMap {
  const mappedMatchUps: MappedMatchUps = {};
  const drawMatchUps: MatchUp[] = [];

  (drawDefinition?.structures ?? [structure])
    .filter((structure) => structure && typeof structure === 'object')
    .forEach((structure) => {
      if (!structure) return;
      const { structureId, matchUps, structures } = structure;
      const isRoundRobin = Array.isArray(structures);
      if (!isRoundRobin) {
        const filteredMatchUps = matchUps;
        mappedMatchUps[structureId] = {
          matchUps: filteredMatchUps,
          itemStructureIds: [],
        };
        filteredMatchUps?.forEach((matchUp) => {
          drawMatchUps.push(matchUp);
          if (matchUp.tieMatchUps) drawMatchUps.push(...matchUp.tieMatchUps);
        });
      } else if (isRoundRobin) {
        structures.forEach((itemStructure) => {
          const { structureName } = itemStructure;
          const filteredMatchUps = itemStructure.matchUps;

          mappedMatchUps[itemStructure.structureId] = {
            matchUps: filteredMatchUps,
            itemStructureIds: [],
            structureName,
          };
          if (filteredMatchUps) {
            drawMatchUps.push(...filteredMatchUps);
            filteredMatchUps.forEach((matchUp) => {
              if (matchUp.tieMatchUps) drawMatchUps.push(...matchUp.tieMatchUps);
            });
          }
          if (!mappedMatchUps[structureId])
            mappedMatchUps[structureId] = {
              itemStructureIds: [],
              matchUps: [],
            };
          if (!mappedMatchUps[structureId].itemStructureIds) mappedMatchUps[structureId].itemStructureIds = [];
          mappedMatchUps[structureId].itemStructureIds.push(itemStructure.structureId);
        });
      }
    });

  return { mappedMatchUps, drawMatchUps };
}

type GetMappedStructureMatchUpsArgs = {
  matchUpsMap?: MatchUpsMap;
  mappedMatchUps?: any;
  structureId: string;
  inContext?: boolean;
};
export function getMappedStructureMatchUps({
  mappedMatchUps,
  matchUpsMap,
  structureId,
  inContext,
}: GetMappedStructureMatchUpsArgs) {
  mappedMatchUps = matchUpsMap?.mappedMatchUps ?? mappedMatchUps;
  const structureMatchUpsMap = mappedMatchUps[structureId];
  const itemStructureMatchUps = (structureMatchUpsMap?.itemStructureIds ?? [])
    .map((itemStructureId) => {
      const { matchUps, structureName } = mappedMatchUps[itemStructureId];
      if (inContext) {
        return matchUps.map((matchUp) => {
          return Object.assign(makeDeepCopy(matchUp, true, true), {
            containerStructureId: structureId,
            structureId: itemStructureId,
            structureName,
          });
        });
      } else {
        return matchUps;
      }
    })
    .flat();

  return (structureMatchUpsMap?.matchUps ?? []).concat(...itemStructureMatchUps);
}
