import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { removeExtension } from '../extensions/removeExtension';
import { addExtension } from '../extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';

// constants
import { COURT_IDS, TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { DISABLED } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function enableCourts(params) {
  const tournamentRecords = resolveTournamentRecords(params);
  const paramsToCheck: any[] = [{ [TOURNAMENT_RECORDS]: true }];
  !params.enableAll && paramsToCheck.push({ [COURT_IDS]: true });
  const paramCheck = checkRequiredParameters(params, paramsToCheck);
  if (paramCheck.error) return paramCheck;

  const { enableAll, courtIds, dates } = params;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    courtsEnable({ tournamentRecord, courtIds, enableAll, dates });
  }

  return { ...SUCCESS };
}

function courtsEnable({ tournamentRecord, courtIds, enableAll, dates }) {
  for (const venue of tournamentRecord.venues ?? []) {
    for (const court of venue.courts ?? []) {
      if (enableAll || courtIds?.includes(court.courtId))
        if (Array.isArray(dates)) {
          const { extension } = findExtension({
            element: court,
            name: DISABLED,
          });

          if (extension) {
            const value = extension.value;
            if (Array.isArray(value.dates)) {
              value.dates = value.dates.filter((date) => !dates.includes(date));
            }
            addExtension({
              extension: { name: DISABLED, value },
              creationTime: false,
              element: court,
            });
          }
        } else {
          removeExtension({ element: court, name: DISABLED });
        }
    }
  }

  return { ...SUCCESS };
}
