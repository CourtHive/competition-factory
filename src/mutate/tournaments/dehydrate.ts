import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

import { SUCCESS } from '@Constants/resultConstants';
import { ErrorType, INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

export function dehydrateMatchUps({ tournamentRecord }): {
  success?: boolean;
  error?: ErrorType;
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (typeof tournamentRecord !== 'object' || !tournamentRecord.tournamentId) return { error: INVALID_VALUES };

  const { matchUps } = allTournamentMatchUps({
    tournamentRecord,
    inContext: false,
  });

  if (matchUps?.length) {
    const matchUpFormatMap = getMatchUpFormatMap({ tournamentRecord });
    removeExtraneousAttributes(matchUps, matchUpFormatMap);
  }

  return { ...SUCCESS };
}

export function getMatchUpFormatMap({ tournamentRecord }) {
  const matchUpFormatMap = {};

  for (const event of tournamentRecord.events ?? []) {
    if (event.matchUpFormat) matchUpFormatMap[event.eventId] = event.matchUpFormat;

    for (const drawDefinition of event.drawDefinitions ?? []) {
      if (drawDefinition.matchUpFormat) matchUpFormatMap[drawDefinition.drawId] = drawDefinition.matchUpFormat;

      for (const structure of drawDefinition.structures ?? []) {
        if (structure.matchUpFormat) matchUpFormatMap[structure.structureId] = structure.matchUpFormat;
        for (const childStructure of structure.structures ?? []) {
          if (childStructure.matchUpFormat) matchUpFormatMap[childStructure.structureId] = childStructure.matchUpFormat;
        }
      }
    }
  }

  return matchUpFormatMap;
}

const baseAttributeKeys = [
  'collectionId',
  'collectionPosition',
  'drawPositions',
  'extensions',
  'finishingPositionRange',
  'finishingRound',
  'isMock',
  'matchUpId',
  'matchUpStatus',
  'matchUpStatusCodes',
  'orderOfFinish',
  'processCodes',
  'roundNumber',
  'tieFormat',
  'tieMatchUps',
  'roundPosition',
  'score',
  'sides', // can be removed only if drawPositions is present and is not a TEAM matchUp
  'winnerMatchUpId',
  'loserMatchUpId',
  'matchUpDuration',
  'winningSide',
];

export function removeExtraneousAttributes(matchUps, matchUpFormatMap = {}) {
  for (const matchUp of matchUps) {
    const { structureId, drawId, eventId } = matchUp;
    const inheritedMatchUpFormat =
      matchUpFormatMap[structureId] || matchUpFormatMap[drawId] || matchUpFormatMap[eventId];

    const matchUpFormat = matchUp.matchUpFormat === inheritedMatchUpFormat ? undefined : matchUp.matchUpFormat;

    for (const key of Object.keys(matchUp)) {
      if (!baseAttributeKeys.includes(key)) delete matchUp[key];
    }

    if (matchUp.sides && matchUp.drawPositions && !matchUp.tieMatchUps) {
      delete matchUp.sides;
    }

    if (matchUpFormat) matchUp.matchUpFormat = matchUpFormat;
  }
}
