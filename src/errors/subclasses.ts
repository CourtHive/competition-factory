/**
 * Concrete `FactoryError` subclasses for the highest-frequency error codes
 * in the factory codebase. Survey of `src/mutate` + `src/query` returns:
 *
 *   INVALID_VALUES                265   InvalidValuesError
 *   MISSING_TOURNAMENT_RECORD      94   MissingTournamentRecordError
 *   MISSING_DRAW_DEFINITION        86   MissingDrawDefinitionError
 *   MISSING_VALUE                  59   MissingValueError
 *   MISSING_SANCTIONING_RECORD     32   MissingSanctioningRecordError
 *   PARTICIPANT_NOT_FOUND          31   ParticipantNotFoundError
 *   MISSING_TOURNAMENT_RECORDS     31   MissingTournamentRecordsError
 *   STRUCTURE_NOT_FOUND            29   StructureNotFoundError
 *   MISSING_OFFICIAL_RECORD        22   MissingOfficialRecordError
 *   INVALID_DATE                   22   InvalidDateError
 *   MISSING_EVENT                  21   MissingEventError
 *   MATCHUP_NOT_FOUND              20   MatchUpNotFoundError
 *   EVENT_NOT_FOUND                11   EventNotFoundError
 *
 * Together these cover ~720 of the ~937 return sites (~77%). Codes outside
 * this list still get a `FactoryError` instance from the registry — they
 * just don't have a dedicated `instanceof`-able subclass yet. Add more as
 * the catch-side ergonomics warrant.
 *
 * Message text mirrors the legacy constants from `errorConditionConstants`
 * so consumers that pattern-match on `error.message` are unaffected. The
 * `code` strings are byte-for-byte identical to the legacy `code` field.
 */
import { FactoryError, FactoryErrorOptions } from './FactoryError';

// Sentinel codes — must stay identical to the legacy constants in
// `src/constants/errorConditionConstants.ts` so the registry round-trips and
// downstream consumers' `error.code === 'ERR_MISSING_TOURNAMENT'` checks
// keep working.
export class MissingTournamentRecordError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_MISSING_TOURNAMENT', 'Missing tournamentRecord', opts);
  }
}

export class MissingTournamentRecordsError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_MISSING_TOURNAMENTS', 'Missing tournamentRecords', opts);
  }
}

export class MissingDrawDefinitionError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_MISSING_DRAWDEF', 'Missing drawDefinition', opts);
  }
}

export class MissingEventError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_MISSING_EVENT_ID', 'Missing event / eventId', opts);
  }
}

export class MissingValueError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_MISSING_VALUE', 'Missing value', opts);
  }
}

export class MissingSanctioningRecordError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_MISSING_SANCTIONING_RECORD', 'Missing sanctioningRecord', opts);
  }
}

export class MissingOfficialRecordError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_MISSING_OFFICIAL_RECORD', 'Missing officialRecord', opts);
  }
}

export class InvalidValuesError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_INVALID_VALUES', 'Invalid values', opts);
  }
}

export class InvalidDateError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_INVALID_DATE', 'Invalid Date', opts);
  }
}

export class ParticipantNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_NOT_FOUND_PARTICIPANT', 'Participant Not Found', opts);
  }
}

export class StructureNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_NOT_FOUND_STRUCTURE', 'structure not found', opts);
  }
}

export class MatchUpNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_NOT_FOUND_MATCHUP', 'matchUp not found', opts);
  }
}

export class EventNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super('ERR_NOT_FOUND_EVENT', 'Event not found', opts);
  }
}
