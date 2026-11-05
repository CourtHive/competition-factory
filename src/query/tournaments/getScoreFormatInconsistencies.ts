import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { validateScore } from '@Scoring/analysis/validateScore';
import { Inconsistency } from '@Query/integrity/inconsistency';
import { definedAttributes } from '@Tools/definedAttributes';

// constants and types
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';

//  - MATCHUP_SCORE_INVALID_FOR_FORMAT: a stored score its matchUp's effective format cannot produce, by the same
//    `validateScore` that refuses such a score when it is written. A score can be stored that way legitimately (an
//    import or a correction passed `disableScoreValidation`, or it predates the rule that now refuses it), so this is
//    reported and never makes `valid` false. One per matchUp. Not asked of a TEAM matchUp, whose score is the dual's
//    tally, nor of a score with no resolvable format, which no rule can judge. (warning)
export const MATCHUP_SCORE_INVALID_FOR_FORMAT = 'MATCHUP_SCORE_INVALID_FOR_FORMAT';

export function getScoreFormatInconsistencies(tournamentRecord: Tournament): Partial<Inconsistency>[] {
  const { matchUps = [] } = allTournamentMatchUps({ tournamentRecord, inContext: true }) as {
    matchUps?: HydratedMatchUp[];
  };

  return matchUps.flatMap((matchUp) => {
    const { matchUpFormat, matchUpStatus, winningSide, score } = matchUp;
    if (matchUp.matchUpType === TEAM || !matchUpFormat || !score?.sets?.length) return [];

    const result = validateScore({ matchUpFormat, matchUpStatus, winningSide, score });
    if (!result.error) return [];

    const { eventId, drawId, structureId, matchUpId } = matchUp;
    const scoreString = score.scoreStringSide1 ?? JSON.stringify(score.sets);
    const info = typeof result.info === 'string' ? result.info : undefined;
    const reason = info ? `: ${info}` : '';
    return [
      {
        issueType: MATCHUP_SCORE_INVALID_FOR_FORMAT,
        severity: 'warning',
        scope: structureId ? 'STRUCTURE' : 'TOURNAMENT',
        ...definedAttributes({ eventId, drawId, structureId, matchUpId }),
        message: `score ${scoreString} is invalid for ${matchUpFormat}${reason}`,
        ...definedAttributes({ matchUpFormat, matchUpStatus, code: result.error?.code, info }),
      },
    ];
  });
}
