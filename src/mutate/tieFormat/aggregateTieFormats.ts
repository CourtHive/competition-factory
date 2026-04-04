import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { UUID } from '@Tools/UUID';

// constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type AggreateTieFormatsArgs = {
  tournamentRecord: Tournament;
};
export function aggregateTieFormats({
  tournamentRecord,
}: AggreateTieFormatsArgs): ResultType & { addedCount?: number } {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  let addedCount = 0;

  for (const event of tournamentRecord.events ?? []) {
    const tieFormats = event.tieFormats ?? [];

    const checkTieFormat = (obj) => {
      if (!obj.tieFormat) return;

      let identifiedTieFormatId;
      for (const tieFormat of tieFormats) {
        const different = compareTieFormats({
          descendant: obj.tieFormat,
          ancestor: tieFormat,
        }).different;
        if (!different) identifiedTieFormatId = tieFormat.tieFormatId;
      }

      if (identifiedTieFormatId) {
        obj.tieFormatId = identifiedTieFormatId;
        delete obj.tieFormat;
      } else {
        const newTieFormat = makeDeepCopy(obj.tieFormat, undefined, true);
        newTieFormat.tieFormatId ??= UUID();

        obj.tieFormatId = newTieFormat.tieFormatId;
        delete obj.tieFormat;

        tieFormats.push(newTieFormat);
        addedCount += 1;
      }
    };

    checkTieFormat(event);

    for (const drawDefinition of event.drawDefinitions ?? []) {
      checkTieFormat(drawDefinition);
      for (const structure of drawDefinition.structures ?? []) {
        checkTieFormat(structure);
      }
    }

    const setTieFormatId = (matchUpId, tieFormatId) => {
      const matchUp = eventMatchUpResult.matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
      if (matchUp) {
        matchUp.tieFormatId = tieFormatId;
        delete matchUp.tieFormat;
        modifyMatchUpNotice({
          tournamentId: tournamentRecord?.tournamentId,
          eventId: event.eventId,
          matchUp,
        });
      }
    };
    const addNewTieFormat = (inContextMatchUp) => {
      const newTieFormat = makeDeepCopy(inContextMatchUp.tieFormat, undefined, true);
      newTieFormat.tieFormatId ??= UUID();
      tieFormats.push(newTieFormat);
      addedCount += 1;

      setTieFormatId(inContextMatchUp.matchUpId, newTieFormat.tieFormatId);
    };

    const eventMatchUpResult = allEventMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
      event,
    });

    const inContextMatchUps = eventMatchUpResult.matchUps ?? [];

    for (const inContextMatchUp of inContextMatchUps) {
      let identifiedTieFormatId;
      for (const tieFormat of tieFormats) {
        const different =
          inContextMatchUp.tieFormat &&
          compareTieFormats({
            descendant: inContextMatchUp.tieFormat,
            ancestor: tieFormat,
          }).different;
        if (!different) identifiedTieFormatId = tieFormat.tieFormatId;
      }
      if (identifiedTieFormatId) {
        setTieFormatId(inContextMatchUp.matchUpId, identifiedTieFormatId);
      } else {
        addNewTieFormat(inContextMatchUp);
      }
    }
    if (tieFormats.length) event.tieFormats = tieFormats;
  }

  return { ...SUCCESS, addedCount };
}
