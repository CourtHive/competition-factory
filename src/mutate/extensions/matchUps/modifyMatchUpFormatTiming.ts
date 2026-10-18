import { firstClassGroupLeafOrExtension, setGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { groupLeafFingerprint, modifyTournamentDetailNotice } from '@Mutate/tournaments/tournamentDetailNotice';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { findEvent } from '@Acquire/findEvent';

// constants
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EVENT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

export function modifyMatchUpFormatTiming(params) {
  const { matchUpFormat, recoveryTimes, averageTimes, tournamentId, eventId } = params;

  const tournamentRecords =
    params?.tournamentRecords ??
    (params?.tournamentRecord && {
      [params.tournamentRecord.tournamentId]: params.tournamentRecord,
    }) ??
    {};

  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  const tournamentIds = Object.keys(tournamentRecords).filter(
    (currentTournamentId) => !tournamentId || tournamentId === currentTournamentId,
  );

  if (tournamentId && !tournamentIds.includes(tournamentId)) return { error: INVALID_VALUES };

  // With an `eventId` only the records that hold the event are written, and the event is found before anything is.
  // Each record was written on its own: with several loaded, every record lacking the event had its TOURNAMENT-level
  // timing changed, and an event found in none returned EVENT_NOT_FOUND after those writes (CA 2026-10-18: a bug).
  const targets = tournamentIds
    .map((currentTournamentId) => {
      const tournamentRecord = tournamentRecords[currentTournamentId];
      return { tournamentRecord, event: eventId ? findEvent({ tournamentRecord, eventId }).event : undefined };
    })
    .filter(({ event }) => !eventId || event);
  if (eventId && !targets.length) return { error: EVENT_NOT_FOUND };

  for (const { tournamentRecord, event } of targets) {
    const result = modifyTiming({
      tournamentRecord,
      event,

      matchUpFormat,
      averageTimes,
      recoveryTimes,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

function modifyTiming({ tournamentRecord, recoveryTimes, matchUpFormat, averageTimes, event }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (averageTimes && !Array.isArray(averageTimes)) return { error: INVALID_VALUES };
  if (recoveryTimes && !Array.isArray(recoveryTimes)) return { error: INVALID_VALUES };

  const name = SCHEDULE_TIMING;

  if (event) {
    const { extension } = findExtension({ element: event, name });
    const eventScheduling = extension?.value ?? {};
    const value = modifyScheduling({
      ...eventScheduling,
      matchUpFormat,
      averageTimes,
      recoveryTimes,
    });
    const before = JSON.stringify(extension?.value);
    addExtension({ element: event, extension: { name, value } });
    if (JSON.stringify(value) !== before) {
      modifyEventNotice({ tournamentId: tournamentRecord.tournamentId, event });
    }
  } else {
    // CODES: tournament-level SCHEDULE_TIMING → tournamentRecord.scheduling.timing
    const tournamentScheduling =
      firstClassGroupLeafOrExtension({
        element: tournamentRecord,
        groupAttribute: 'scheduling',
        leafAttribute: 'timing',
        name,
      }) ?? {};
    const value = modifyScheduling({
      ...tournamentScheduling,
      matchUpFormat,
      averageTimes,
      recoveryTimes,
    });
    const surface = { element: tournamentRecord, groupAttribute: 'scheduling', leafAttribute: 'timing', name };
    const before = groupLeafFingerprint(surface);
    setGroupLeafOrExtension({ ...surface, value });
    if (groupLeafFingerprint(surface) !== before) {
      modifyTournamentDetailNotice({ tournamentRecord, detail: { scheduleTiming: value } });
    }
  }

  return { ...SUCCESS };
}

function modifyScheduling(params) {
  const { matchUpRecoveryTimes = [], matchUpAverageTimes = [], matchUpFormat } = params;

  let { averageTimes: formatAverageTimes, recoveryTimes: formatRecoveryTimes } = params;

  // don't allow modification without categoryName
  formatAverageTimes = (formatAverageTimes ?? []).filter(
    (averageTime) => averageTime?.categoryNames?.length || averageTime?.categoryTypes?.length,
  );
  // if there are formatAverageTimes specified...
  const updatedMatchUpAverageTimes =
    formatAverageTimes?.length &&
    matchUpAverageTimes
      .map((definition) =>
        // filter out any existing definitions for this matchUpFormat
        definition?.matchUpFormatCodes.includes(matchUpFormat)
          ? {
              ...definition,
              matchUpFormatCodes: definition.matchUpFormatCodes?.filter((code) => code !== matchUpFormat),
            }
          : definition,
      )
      // filter out any definitions that no longer have matchUpFormatCodes
      .filter(({ matchUpFormatCodes }) => matchUpFormatCodes?.length)
      .concat({
        matchUpFormatCodes: [matchUpFormat],
        averageTimes: formatAverageTimes,
      });

  // don't allow modification without categoryName
  formatRecoveryTimes = (formatRecoveryTimes ?? []).filter(
    (recoveryTime) => recoveryTime?.categoryNames?.length || recoveryTime?.categoryTypes?.length,
  );
  // if there are formatRecoveryTimes specified...
  const updatedMatchUpRecoveryTimes =
    formatRecoveryTimes?.length &&
    matchUpRecoveryTimes
      .map((definition) =>
        // filter out any existing definitions for this matchUpFormat
        definition?.matchUpFormatCodes.includes(matchUpFormat)
          ? {
              ...definition,
              matchUpFormatCodes: definition.matchUpFormatCodes?.filter((code) => code !== matchUpFormat),
            }
          : definition,
      )
      // filter out any definitions that no longer have matchUpFormatCodes OR averageTimes
      // recoveryTimes can be keyed to averageTimes instead of matchUpFormats...
      .filter(({ matchUpFormatCodes, averageTimes }) => matchUpFormatCodes?.length || averageTimes)
      .concat({
        matchUpFormatCodes: [matchUpFormat],
        recoveryTimes: formatRecoveryTimes,
      });

  return {
    matchUpAverageTimes: (updatedMatchUpAverageTimes?.length && updatedMatchUpAverageTimes) || matchUpAverageTimes,
    matchUpRecoveryTimes: (updatedMatchUpRecoveryTimes?.length && updatedMatchUpRecoveryTimes) || matchUpRecoveryTimes,
  };
}
