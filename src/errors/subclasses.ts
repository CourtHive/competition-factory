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
 * Code and message are read from the constants each subclass stands for,
 * so they cannot drift from the legacy `{ code, message }` objects: the
 * registry round-trips, and a consumer's `error.code` check sees the same
 * code either way.
 */
import { FactoryError, FactoryErrorOptions } from './FactoryError';

// constants
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import {
  EVENT_NOT_FOUND,
  INVALID_DATE,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_EVENT,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

export class MissingTournamentRecordError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MISSING_TOURNAMENT_RECORD.code, MISSING_TOURNAMENT_RECORD.message, opts);
  }
}

export class MissingTournamentRecordsError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MISSING_TOURNAMENT_RECORDS.code, MISSING_TOURNAMENT_RECORDS.message, opts);
  }
}

export class MissingDrawDefinitionError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MISSING_DRAW_DEFINITION.code, MISSING_DRAW_DEFINITION.message, opts);
  }
}

export class MissingEventError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MISSING_EVENT.code, MISSING_EVENT.message, opts);
  }
}

export class MissingValueError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MISSING_VALUE.code, MISSING_VALUE.message, opts);
  }
}

export class MissingSanctioningRecordError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MISSING_SANCTIONING_RECORD.code, MISSING_SANCTIONING_RECORD.message, opts);
  }
}

export class MissingOfficialRecordError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MISSING_OFFICIAL_RECORD.code, MISSING_OFFICIAL_RECORD.message, opts);
  }
}

export class InvalidValuesError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(INVALID_VALUES.code, INVALID_VALUES.message, opts);
  }
}

export class InvalidDateError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(INVALID_DATE.code, INVALID_DATE.message, opts);
  }
}

export class ParticipantNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(PARTICIPANT_NOT_FOUND.code, PARTICIPANT_NOT_FOUND.message, opts);
  }
}

export class StructureNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(STRUCTURE_NOT_FOUND.code, STRUCTURE_NOT_FOUND.message, opts);
  }
}

export class MatchUpNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(MATCHUP_NOT_FOUND.code, MATCHUP_NOT_FOUND.message, opts);
  }
}

export class EventNotFoundError extends FactoryError {
  constructor(opts?: FactoryErrorOptions) {
    super(EVENT_NOT_FOUND.code, EVENT_NOT_FOUND.message, opts);
  }
}
