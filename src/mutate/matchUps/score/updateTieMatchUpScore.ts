import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { ensureSideLineUps } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { isActiveMatchUp } from '@Query/matchUp/activeMatchUp';
import { findTournamentId } from '@Acquire/findTournamentId';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { COMPLETED, completedMatchUpStatuses, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { PolicyDefinitions, TournamentRecords, MatchUpsMap } from '@Types/factoryTypes';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_MATCHUP,
  MATCHUP_NOT_FOUND,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

type UpdateTieMatchUpScoreArgs = {
  tournamentRecords?: TournamentRecords;
  appliedPolicies?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  exitWhenNoValues?: boolean;
  matchUpsMap?: MatchUpsMap;
  matchUpStatus?: string;
  tournamentId?: string;
  removeScore?: boolean;
  matchUpId: string;
  event?: Event;
};
export function updateTieMatchUpScore(params: UpdateTieMatchUpScoreArgs): {
  removeWinningSide?: boolean;
  tieFormatRemoved?: boolean;
  winningSide?: number;
  error?: ErrorType;
  success?: boolean;
  score?: any;
} {
  const { exitWhenNoValues, drawDefinition, matchUpStatus, removeScore, matchUpsMap, matchUpId, event } = params;

  const tournamentRecords =
    params.tournamentRecords ||
    (params.tournamentRecord && {
      [params.tournamentRecord?.tournamentId]: params.tournamentRecord,
    }) ||
    {};

  const tournamentId = params.tournamentId || params.tournamentRecord?.tournamentId;
  tournamentRecords && findTournamentId({ tournamentRecords, ...params });
  const tournamentRecord = tournamentId && tournamentRecords[tournamentId];
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const result = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (result.error) return result;
  if (!result.matchUp) return { error: MATCHUP_NOT_FOUND };

  const { matchUp, structure } = result;

  if (!matchUp.tieMatchUps) return { error: INVALID_MATCHUP };

  ensureSideLineUps({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    dualMatchUp: matchUp,
    drawDefinition,
  });

  const disableAutoCalc = firstClassOrExtension({
    element: matchUp,
    attribute: 'disableAutoCalc',
    name: DISABLE_AUTO_CALC,
  });

  if (disableAutoCalc) {
    if (!removeScore) {
      return { ...SUCCESS, score: matchUp.score };
    } else {
      setFirstClassOrExtension({
        element: matchUp,
        attribute: 'disableAutoCalc',
        name: DISABLE_AUTO_CALC,
        value: undefined,
      });
    }
  }

  const tieFormat = resolveTieFormat({
    drawDefinition,
    structure,
    matchUp,
    event,
  })?.tieFormat;

  matchUp.tieFormat = copyTieFormat(tieFormat);

  const scoreResult = generateTieMatchUpScore({
    drawDefinition,
    matchUpsMap,
    structure,
    matchUp,
    event,
  });

  const { winningSide, set, scoreStringSide1, scoreStringSide2 } = scoreResult;

  const setHasValue = set?.side1Score || set?.side2Score;
  if (exitWhenNoValues && !matchUp.score && !setHasValue) {
    return { ...SUCCESS };
  }

  const scoreObject = {
    scoreStringSide1,
    scoreStringSide2,
    sets: set ? [set] : [],
  };

  const hasWinner = winningSide && [1, 2].includes(winningSide);
  const newMatchUpStatus =
    (hasWinner && COMPLETED) ||
    (isActiveMatchUp({
      matchUpStatus: matchUpStatus ?? matchUp.matchUpStatus,
      tieMatchUps: matchUp.tieMatchUps,
      winningSide: matchUp.winningSide,
      score: scoreObject,
    }) &&
      IN_PROGRESS) ||
    TO_BE_PLAYED;

  const removeWinningSide = !!(matchUp.winningSide && !hasWinner);
  const hasResults = matchUp.tieMatchUps.find(
    ({ score, winningSide, matchUpStatus }) =>
      (score?.sets?.length && (score.sets[0].side1Score || score.sets[0].side2Score)) ||
      (matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus)) ||
      winningSide,
  );

  let tieFormatRemoved;

  if (matchUp.tieFormat && !hasWinner && !hasResults) {
    // if matchUp.tieFormat is equivalent to hierarchical tieFormat, remove
    const inheritedTieFormat = resolveTieFormat({
      drawDefinition,
      structure,
      event,
    })?.tieFormat;

    if (inheritedTieFormat && JSON.stringify(tieFormat) === JSON.stringify(inheritedTieFormat)) {
      matchUp.tieFormatId = undefined;
      matchUp.tieFormat = undefined;
      tieFormatRemoved = true;
    }
  }

  modifyMatchUpScore({
    appliedPolicies: params.appliedPolicies,
    matchUpStatus: newMatchUpStatus,
    score: scoreObject,
    removeWinningSide,
    tournamentRecord,
    drawDefinition,
    removeScore,
    winningSide,
    matchUpId,
    matchUp,
    event,
  });

  return {
    ...SUCCESS,
    score: scoreObject,
    removeWinningSide,
    tieFormatRemoved,
    winningSide,
  };
}
