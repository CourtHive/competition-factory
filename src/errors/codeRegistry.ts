/**
 * Code → `FactoryError` subclass registry.
 *
 * Lets the upcoming `unwrap()` helper map a legacy `{ error: { code } }`
 * envelope back into the matching typed `FactoryError` subclass when it
 * throws. Consumers can then `if (e instanceof MissingTournamentRecordError)`
 * even when the producing method returned the legacy POJO shape.
 *
 * Codes outside the registry fall back to the base `FactoryError`. Add
 * subclasses to `subclasses.ts` and register them here as catch-side
 * ergonomics demand.
 */
import {
  EventNotFoundError,
  InvalidDateError,
  InvalidValuesError,
  MatchUpNotFoundError,
  MissingDrawDefinitionError,
  MissingEventError,
  MissingOfficialRecordError,
  MissingSanctioningRecordError,
  MissingTournamentRecordError,
  MissingTournamentRecordsError,
  MissingValueError,
  ParticipantNotFoundError,
  StructureNotFoundError,
} from './subclasses';
import { FactoryError, type FactoryErrorOptions } from './FactoryError';

type FactoryErrorConstructor = new (opts?: FactoryErrorOptions) => FactoryError;

const registry: Record<string, FactoryErrorConstructor> = {
  ERR_MISSING_TOURNAMENT: MissingTournamentRecordError,
  ERR_MISSING_TOURNAMENTS: MissingTournamentRecordsError,
  ERR_MISSING_DRAWDEF: MissingDrawDefinitionError,
  ERR_MISSING_EVENT_ID: MissingEventError,
  ERR_MISSING_VALUE: MissingValueError,
  ERR_MISSING_SANCTIONING_RECORD: MissingSanctioningRecordError,
  ERR_MISSING_OFFICIAL_RECORD: MissingOfficialRecordError,
  ERR_INVALID_VALUES: InvalidValuesError,
  ERR_INVALID_DATE: InvalidDateError,
  ERR_NOT_FOUND_PARTICIPANT: ParticipantNotFoundError,
  ERR_NOT_FOUND_STRUCTURE: StructureNotFoundError,
  ERR_NOT_FOUND_MATCHUP: MatchUpNotFoundError,
  ERR_NOT_FOUND_EVENT: EventNotFoundError,
};

/**
 * Construct the typed `FactoryError` subclass for a given code. Falls back
 * to the base `FactoryError` if no concrete subclass is registered, using
 * the supplied `message` as-is (typically the legacy constant's `message`).
 */
export function constructFactoryError(code: string, message: string, opts?: FactoryErrorOptions): FactoryError {
  const Ctor = registry[code];
  if (Ctor) return new Ctor(opts);
  return new FactoryError(code, message, opts);
}
