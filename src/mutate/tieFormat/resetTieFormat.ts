import { addMatchUpsNotice, deleteMatchUpsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { generateCollectionMatchUps } from '@Assemblies/generators/drawDefinitions/tieMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { resolveFromParameters } from '@Helpers/parameters/resolveFromParameters';
import { removeOrphanedTieFormats } from '@Mutate/tieFormat/writeTieFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpId } from '@Functions/global/extractors';

// constants and types
import { ERROR, MATCHUP, MATCHUP_ID, PARAM, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { INVALID_MATCHUP, NOT_FOUND } from '@Constants/errorConditionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

/**
 * remove the tieFormat from a TEAM matchUp if there is a tieFormat further up the hierarchy
 * modify the matchUp's tieMatchUps to correspond to the tieFormat found further up the hierarchy
 */

type ResetTieFormatArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  matchUpId: string;
  uuids?: string[];
  event?: Event;
};
export function resetTieFormat(params: ResetTieFormatArgs): ResultType & {
  deletedMatchUpIds?: string[];
  newMatchUps?: MatchUp[];
  success?: boolean;
} {
  const stack = 'resetTieFormat';
  const { drawDefinition, event, uuids } = params;

  const paramCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true, [MATCHUP_ID]: true }], stack);
  if (paramCheck.error) return paramCheck;

  const resolutions = resolveFromParameters(params, [{ [PARAM]: MATCHUP }]);
  if (resolutions[ERROR]) return resolutions;

  const tournamentId = params.tournamentRecord?.tournamentId;

  const { matchUp, structure } = resolutions?.matchUp ?? {};

  if (!matchUp?.tieMatchUps)
    return decorateResult({
      result: { error: INVALID_MATCHUP },
      info: 'Must be a TEAM matchUp',
      stack,
    });

  // if there is no tieFormat (inline or referenced) there is nothing to do
  if (!matchUp.tieFormat && !matchUp.tieFormatId) return { ...SUCCESS };

  const tieFormat = resolveTieFormat({
    structure,
    drawDefinition,
    event,
  })?.tieFormat;

  if (!tieFormat)
    return decorateResult({
      result: { error: NOT_FOUND },
      info: 'No inherited tieFormat',
      stack,
    });

  const deletedMatchUpIds: string[] = [];
  const collectionIds: string[] = [];
  const tieMatchUps: any[] = [];
  const newMatchUps: any[] = [];

  for (const collectionDefinition of tieFormat.collectionDefinitions) {
    // delete any matchUp.tieMatchUps that are not found in the ancestor tieFormat collectionDefinitions
    const { matchUpCount, collectionId } = collectionDefinition;
    collectionIds.push(collectionId);

    const existingCollectionMatchUps = (matchUp.tieMatchUps ?? []).filter(
      (matchUp) => matchUp.collectionId === collectionId,
    );

    if (existingCollectionMatchUps.length > matchUpCount) {
      // sort by matchUpStatus to prioritize active or completed matchUpsA
      existingCollectionMatchUps.sort(
        (a, b) => (a.matchUpStatus === TO_BE_PLAYED ? 1 : 0) - (b.matchUpStatus === TO_BE_PLAYED ? 1 : 0),
      );
      tieMatchUps.push(...existingCollectionMatchUps.slice(0, matchUpCount));
      deletedMatchUpIds.push(...existingCollectionMatchUps.slice(3).map(getMatchUpId));
    } else {
      tieMatchUps.push(...existingCollectionMatchUps);

      if (existingCollectionMatchUps.length < matchUpCount) {
        const matchUpsLimit = matchUpCount - existingCollectionMatchUps.length;
        const matchUps = generateCollectionMatchUps({
          collectionDefinition,
          matchUpsLimit,
          matchUp,
          uuids,
        });
        newMatchUps.push(...matchUps);
      }
    }
  }

  for (const tieMatchUp of matchUp?.tieMatchUps ?? []) {
    if (tieMatchUp.collectionId && !collectionIds.includes(tieMatchUp.collectionId))
      deletedMatchUpIds.push(tieMatchUp.matchUpId);
  }

  if (newMatchUps.length) {
    tieMatchUps.push(...newMatchUps);
    addMatchUpsNotice({
      eventId: event?.eventId,
      matchUps: newMatchUps,
      drawDefinition,
      tournamentId,
    });
  }

  if (deletedMatchUpIds.length) {
    deleteMatchUpsNotice({
      matchUpIds: deletedMatchUpIds,
      eventId: event?.eventId,
      drawDefinition,
      tournamentId,
    });
  }

  if (matchUp) {
    matchUp.tieMatchUps = tieMatchUps;
    matchUp.tieFormatId = undefined;
    matchUp.tieFormat = undefined;

    // clean up orphaned entries in event.tieFormats[]
    if (event) removeOrphanedTieFormats({ event });

    modifyMatchUpNotice({
      structureId: structure?.structureId,
      eventId: event?.eventId,
      context: stack,
      drawDefinition,
      tournamentId,
      matchUp,
    });
  }

  return { ...SUCCESS, newMatchUps, deletedMatchUpIds };
}
