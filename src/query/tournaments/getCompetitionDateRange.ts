import { getTournamentInfo } from './getTournamentInfo';
import { extractDate } from '@Tools/dateTime';

import { ErrorType, MISSING_DATE, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { isObject } from '@Tools/objects';

export function getCompetitionDateRange({ tournamentRecords }: { tournamentRecords: TournamentRecords }): {
  startDate?: string;
  endDate?: string;
  error?: ErrorType;
} {
  if (!isObject(tournamentRecords)) return { error: MISSING_TOURNAMENT_RECORDS };
  const tournamentIds = Object.keys(tournamentRecords ?? {});
  // '' when a record's date does not parse: falsy, so it is replaced by the next record's date
  type DateRange = { startDate: Date | '' | undefined; endDate: Date | '' | undefined };
  const dateRange: DateRange = tournamentIds.reduce(
    (dateRange: DateRange, tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      // a record is present for every key, so tournamentInfo is too
      const { startDate, endDate } = getTournamentInfo({ tournamentRecord }).tournamentInfo!;

      const extractedStart = startDate && extractDate(startDate);
      const dateOfStart = extractedStart && new Date(extractedStart);
      if (!dateRange.startDate || (dateOfStart && dateOfStart < dateRange.startDate)) {
        dateRange.startDate = dateOfStart;
      }

      const extractedEnd = endDate && extractDate(endDate);
      const dateOfEnd = extractedEnd && new Date(extractedEnd);
      if (!dateRange.endDate || (dateOfEnd && dateOfEnd > dateRange.endDate)) {
        dateRange.endDate = dateOfEnd;
      }

      return dateRange;
    },
    { startDate: undefined, endDate: undefined } as DateRange,
  );

  const startDate = dateRange.startDate && extractDate(dateRange.startDate.toISOString());
  const endDate = dateRange.endDate && extractDate(dateRange.endDate.toISOString());

  if (!startDate || !endDate) return { error: MISSING_DATE };

  return { startDate, endDate };
}
