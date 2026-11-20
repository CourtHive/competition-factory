import { generateTieMatchUpScore } from '@Query/matchUp/tieMatchUpScore/generateTieMatchUpScore';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants types and fixtures
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  DrawDefinition,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  Score,
  Structure,
  TieFormat,
} from '@Types/tournamentTypes';

type GetProjectedDualWinningSideArgs = {
  drawDefinition?: DrawDefinition;
  dualMatchUp: HydratedMatchUp;
  matchUpsMap?: MatchUpsMap;
  matchUpStatus?: MatchUpStatusUnion;
  tieFormat?: TieFormat;
  structure?: Structure;
  winningSide?: number;
  matchUp: MatchUp;
  event?: Event;
  score?: Score;
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
      /**
       * A WINNER NAMED WITH NO SCORE KEEPS THE SCORE THE LINE HOLDS, as the write keeps it (`modifyMatchUpScore`: the
       * score is replaced only by one the call brings, and blanked only by a walkover). The projection gave the line
       * the call's score, none, so a dual tallied by games or sets (`aggregateValue`, `scoreValue`, `setValue`) was
       * projected without the line's: its projected score was not the one `updateTieMatchUpScore` then wrote, and a
       * winner entered again on a line of a decided dual projected the dual level or lost (found by the record soak,
       * 2026-11-18: a dual stored 29-43 projected 26-37).
       */
      const keepsScore = !!winningSide && !score && matchUpStatus !== WALKOVER;
      tieMatchUp.score = keepsScore ? tieMatchUp.score : score;
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

  const {
    winningSide: projectedWinningSide,
    scoreStringSide1,
    scoreStringSide2,
    set,
  } = generateTieMatchUpScore({
    matchUp: projectedDualMatchUp,
    drawDefinition,
    matchUpsMap,
    structure,
    tieFormat,
    event,
  });

  // the dual's score as `updateTieMatchUpScore` writes it from the same tally: the outcome view plans that write (S7)
  const projectedScore = { scoreStringSide1, scoreStringSide2, sets: set ? [set] : [] };
  return { projectedWinningSide, projectedScore, projectedTieMatchUps: projectedDualMatchUp?.tieMatchUps };
}
