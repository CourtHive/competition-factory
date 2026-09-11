/**
 * Suggestions registry — code → suggestion-factory.
 *
 * Each entry is a function that receives the error's `context` payload and
 * returns an array of actionable next-step strings. Resolution is lazy: the
 * `FactoryError.suggestions` getter only invokes the factory when the
 * getter is read, so production paths that never inspect suggestions pay
 * zero cost.
 *
 * Defaults for the highest-fan-in codes are seeded into the registry below;
 * the seeded entries cover ~660 of the ~937 `return { error: CONST }` sites
 * in mutate/query (~70%). Extend by calling `registerSuggestions(code, fn)`.
 *
 * Why seeded here (not a side-effect import): `package.json` declares
 * `sideEffects: false` for tree-shaking, so a separate
 * `defaultSuggestions.ts` whose only purpose is to register would be
 * dropped by the bundler. Inlining keeps the defaults reachable through
 * the same module the registry lives in.
 */

type SuggestionFactory = (context?: Record<string, any>) => string[];

const registry = new Map<string, SuggestionFactory>([
  [
    'ERR_MISSING_TOURNAMENT',
    () => [
      'Call tournamentEngine.setState({ tournamentRecord }) before this method.',
      'Or pass `tournamentRecord` directly in the method params.',
    ],
  ],
  [
    'ERR_MISSING_TOURNAMENTS',
    () => [
      'Call tournamentEngine.setState({ tournamentRecords }) before this method.',
      'Or pass `tournamentRecords` directly in the method params.',
    ],
  ],
  [
    'ERR_MISSING_DRAWDEF',
    () => [
      'Pass `drawId` in the method params — the engine will resolve drawDefinition from state.',
      'Or check that the tournament actually contains the expected drawDefinition.',
    ],
  ],
  [
    'ERR_MISSING_EVENT_ID',
    () => ['Pass `eventId` in the method params.', 'Or pass `event` directly (the resolved Event object).'],
  ],
  [
    'ERR_MISSING_VALUE',
    (ctx) => {
      const key = ctx && typeof ctx === 'object' && 'key' in ctx ? String((ctx as any).key) : undefined;
      return key
        ? [`A required parameter \`${key}\` is missing — check the method signature.`]
        : ['A required parameter is missing — check the method signature for required fields.'];
    },
  ],
  [
    'ERR_INVALID_VALUES',
    (ctx) => {
      const fields = ctx && typeof ctx === 'object' ? Object.keys(ctx) : [];
      return fields.length
        ? [`Check value(s) for: ${fields.join(', ')}. Confirm types and ranges match the method signature.`]
        : ['Check the value(s) passed match the expected types and ranges declared by the method.'];
    },
  ],
  [
    'ERR_INVALID_DATE',
    () => [
      'Use ISO 8601 format: `YYYY-MM-DD` for dates, full ISO timestamp for date-times.',
      'Confirm the date is within the tournament `startDate` / `endDate` window if scheduling.',
    ],
  ],
  [
    'ERR_NOT_FOUND_PARTICIPANT',
    () => [
      'Confirm the participantId exists in `tournamentRecord.participants`.',
      'Participants are auto-added when registered via `addParticipants`; manual draws may need explicit add.',
    ],
  ],
  [
    'ERR_NOT_FOUND_STRUCTURE',
    () => [
      'Pass a valid `structureId` from `drawDefinition.structures[].structureId`.',
      'The structure may have been removed by an earlier mutation; re-read drawDefinition after.',
    ],
  ],
  [
    'ERR_NOT_FOUND_MATCHUP',
    () => [
      'Pass a valid `matchUpId` from the structure / tieMatchUps the matchUp belongs to.',
      'Adhoc matchUps need to be added via `addAdHocMatchUps` before they can be looked up.',
    ],
  ],
  [
    'ERR_NOT_FOUND_EVENT',
    () => [
      'Pass a valid `eventId` from `tournamentRecord.events[].eventId`.',
      'Event may have been deleted by an earlier mutation; re-read events after.',
    ],
  ],
  [
    'ERR_MISSING_SANCTIONING_RECORD',
    () => [
      'Initialize the sanctioning record via the sanctioning engine before this call.',
      'Or pass `sanctioningRecord` directly in the params.',
    ],
  ],
  [
    'ERR_MISSING_OFFICIAL_RECORD',
    () => [
      'Initialize the officiating record via the officiating engine before this call.',
      'Or pass `officialRecord` directly in the params.',
    ],
  ],
  [
    'ENGINE_RETURNED_UNDEFINED',
    () => [
      'The engine method returned no result. Check that state is loaded (call `setState` first).',
      'Or confirm the method name exists on the engine (typos surface here).',
    ],
  ],
]);

export function registerSuggestions(code: string, factory: SuggestionFactory): void {
  registry.set(code, factory);
}

export function getSuggestions(code: string, context?: Record<string, any>): string[] {
  const factory = registry.get(code);
  if (!factory) return [];
  try {
    return factory(context) ?? [];
  } catch {
    // A suggestion factory throwing must never break error propagation —
    // the consumer reading `.suggestions` is already handling an error.
    return [];
  }
}
