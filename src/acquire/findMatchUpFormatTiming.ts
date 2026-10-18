import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { isWellFormedMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { findEvent } from './findEvent';

// constants and types
import { UNRECOGNIZED_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';
import { Tournament, EventTypeUnion } from '@Types/tournamentTypes';

type FindMatchUpFormatTiming = {
  tournamentRecords: { [key: string]: Tournament };
  defaultRecoveryMinutes?: number;
  defaultAverageMinutes?: number;
  matchUpFormat: string;
  categoryName?: string;
  categoryType?: string;
  tournamentId: string;
  eventType?: EventTypeUnion;
  eventId?: string;
};
export function findMatchUpFormatTiming({
  defaultRecoveryMinutes = 0,
  defaultAverageMinutes,
  tournamentRecords,
  matchUpFormat,
  categoryName,
  categoryType,
  tournamentId,
  eventType,
  eventId,
}: FindMatchUpFormatTiming) {
  if (!isWellFormedMatchUpFormat({ matchUpFormat })) return { error: UNRECOGNIZED_MATCHUP_FORMAT };

  const tournamentIds = Object.keys(tournamentRecords).filter(
    (currentTournamentId) => !tournamentId || currentTournamentId === tournamentId,
  );

  let timing;
  tournamentIds.forEach((currentTournamentId) => {
    if (timing) return;
    const tournamentRecord = tournamentRecords[currentTournamentId];
    const event = eventId ? findEvent({ tournamentRecord, eventId })?.event : undefined;
    timing = getMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat,
      categoryName,
      categoryType,
      eventType,
      event,
    });
    return timing?.averageMinutes || timing?.recoveryMinutes;
  });

  return {
    recoveryMinutes: timing?.recoveryMinutes || defaultRecoveryMinutes,
    averageMinutes: timing?.averageMinutes || defaultAverageMinutes,
    typeChangeRecoveryMinutes: timing?.typeChangeRecoveryMinutes || timing?.recoveryMinutes || defaultRecoveryMinutes,
  };
}
