import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants types and fixtures
import { DrawDefinition, Event, MatchUp, Structure, TieFormat } from '@Types/tournamentTypes';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

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
      /**
       * THE PROJECTION MIRRORS THE WRITE. A line entered as a bare `{ winningSide }` — no score, no
       * status — is recorded COMPLETED with that winner (`applyMatchUpValues`: `winningSide && COMPLETED`),
       * and `updateTieMatchUpScore` then counts it. This read the same outcome as a CLEAR, projected the
       * dual undecided, and `directParticipants` — gated on the projected winner changing — never
       * advanced the dual's winner: COMPLETED 2-0 with nobody in the next round, WINNER_NOT_ADVANCED on
       * every one of the TEAM matrix's 240 line-level cells on first contact (2026-10-01). Only an
       * outcome with NO winner and no score and no status is a clear.
       */
      if (!winningSide && !checkScoreHasValue({ score }) && !matchUpStatus) {
        Object.assign(tieMatchUp, { ...toBePlayed });
      } else if (matchUpStatus) {
        tieMatchUp.matchUpStatus = matchUpStatus;
      } else if (winningSide) {
        tieMatchUp.matchUpStatus = COMPLETED;
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
