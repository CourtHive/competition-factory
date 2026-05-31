import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

type SetPracticeDefaultCapacityArgs = {
  tournamentRecord: Tournament;
  defaultCapacity: number | null;
  disableNotice?: boolean;
};

/**
 * Sets the tournament-wide default capacity that applies to PRACTICE
 * bookings that don't carry their own per-block `booking.capacity`.
 *
 * Conventions:
 *   `null` — unlimited (also clears the field outright)
 *   `0`    — closed (no participant can claim a slot)
 *   positive integer — cap on simultaneous CONFIRMED registrations
 *
 * The setting lives at `Tournament.scheduling.practice.defaultCapacity`
 * (nested under the existing CODES first-class scheduling group leaf).
 */
export function setPracticeDefaultCapacity({
  tournamentRecord,
  defaultCapacity,
  disableNotice,
}: SetPracticeDefaultCapacityArgs): ResultType {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  const isInvalid =
    defaultCapacity !== null &&
    (typeof defaultCapacity !== 'number' || !Number.isInteger(defaultCapacity) || defaultCapacity < 0);
  if (isInvalid) {
    return { error: INVALID_VALUES, info: 'defaultCapacity must be a non-negative integer or null' };
  }

  tournamentRecord.scheduling ??= {};
  tournamentRecord.scheduling.practice ??= {};
  tournamentRecord.scheduling.practice.defaultCapacity = defaultCapacity;

  if (!disableNotice) {
    addNotice({
      payload: { tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_TOURNAMENT_DETAIL,
      key: tournamentRecord.tournamentId,
    });
  }

  return { ...SUCCESS };
}
