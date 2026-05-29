export { FactoryError, type FactoryErrorOptions } from './FactoryError';
export {
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
export { constructFactoryError } from './codeRegistry';
// `getSuggestions` is auto-seeded with defaults for the highest-fan-in
// codes (see `suggestions.ts`). Consumers can override / extend via
// `registerSuggestions(code, factoryFn)`.
export { registerSuggestions, getSuggestions } from './suggestions';
