import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { RoundMatchUpsResult, getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import { MatchUpsMap } from '@Types/factoryTypes';

type GetStructureRoundProfileArgs = {
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structureId: string;
};

export function getStructureRoundProfile({
  drawDefinition,
  matchUpsMap,
  structureId,
}: GetStructureRoundProfileArgs): RoundMatchUpsResult & {
  matchUps?: MatchUp[];
  matchUpsMap?: any;
} {
  const result = findStructure({
    drawDefinition,
    structureId,
  });
  if (result.error) return decorateResult({ result });

  // DEV-NOTE cannot pass drawDefinition parameter in this scenario; callstack error
  const { matchUps } = getAllStructureMatchUps({
    structure: result.structure,
    matchUpsMap,
  });

  return { ...getRoundMatchUps({ matchUps }), matchUps, matchUpsMap };
}
