import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants types and fixtures
import { DrawDefinition, Event, MatchUp, Structure, TieFormat } from '@Types/tournamentTypes';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { HydratedMatchUp } from '@Types/hydrated';
import { MatchUpsMap } from '@Types/factoryTypes';

type GetProjectedDualWinningSideArgs = {
  drawDefinition?: DrawDefinition;
  dualMatchUp: HydratedMatchUp;
  matchUpsMap?: MatchUpsMap;
  matchUpStatus?: string;
  tieFormat?: TieFormat;
  structure?: Structure;
  winningSide?: number;
  matchUp: MatchUp;
  event?: Event;
  score?: any;
};
export function getProjectedDualWinningSide({
  drawDefinition,
  matchUpStatus,
  matchUpsMap,
  winningSide,
  dualMatchUp,
  tieFormat,
  structure,
  matchUp,
  event,
  score,
}: GetProjectedDualWinningSideArgs) {
  const projectedDualMatchUp = makeDeepCopy(dualMatchUp, undefined, true);
  for (const tieMatchUp of projectedDualMatchUp?.tieMatchUps ?? []) {
    if (tieMatchUp.matchUpId === matchUp.matchUpId) {
      tieMatchUp.winningSide = winningSide;
      tieMatchUp.score = score;
      if (!checkScoreHasValue({ score }) && !matchUpStatus) {
        Object.assign(tieMatchUp, { ...toBePlayed });
      } else if (matchUpStatus) {
        tieMatchUp.matchUpStatus = matchUpStatus;
      }
    }
  }

  tieFormat = tieFormat ?? resolveTieFormat({ matchUp, structure, drawDefinition, event })?.tieFormat;

  const { winningSide: projectedWinningSide } = generateTieMatchUpScore({
    matchUp: projectedDualMatchUp,
    drawDefinition,
    matchUpsMap,
    structure,
    tieFormat,
    event,
  });

  return { projectedWinningSide };
}
