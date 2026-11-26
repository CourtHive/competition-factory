/**
 * One-time deprecation warnings for inputs that name a catalogue entry: a named tie format or a ratings preset.
 *
 * Named catalogue formats and ratings presets leave the core in 8.0.0, so an input that names one stops resolving
 * there. In 7.x the name still resolves and nothing else changes: the warning is emitted once per process for each
 * input, the first time that input is given a name, and every later use costs one flag read. A name that matches a
 * tieFormat the record already holds is a label, not a catalogue lookup, and is not warned about.
 *
 * Under Node the warning is a `DeprecationWarning` with the code `FACTORY_CATALOGUE_NAME`, so `--no-deprecation`,
 * `NODE_NO_WARNINGS` and `process.on('warning')` apply to it; elsewhere it goes to `console.warn`.
 */

const GUIDE = 'https://courthive.github.io/competition-factory/docs/migration-8.0.0#named-catalogue-inputs';
export const CATALOGUE_NAME_WARNING_CODE = 'FACTORY_CATALOGUE_NAME';

const TIE_FORMAT = 'pass a `tieFormat` object instead';
const RATINGS = 'pass the ratings policy object instead';

/** Each input that can name a catalogue entry: where it is read, and what replaces it in 8.0.0. */
export const CATALOGUE_NAME_INPUTS = {
  addEvent: { input: 'addEvent `event.tieFormatName`', replacement: TIE_FORMAT },
  generateDrawDefinition: { input: 'generateDrawDefinition `tieFormatName`', replacement: TIE_FORMAT },
  generateEventsFromTieFormat: { input: 'generateEventsFromTieFormat `tieFormatName`', replacement: TIE_FORMAT },
  mocksProfile: { input: 'a mocksEngine profile `tieFormatName`', replacement: TIE_FORMAT },
  eventBuilder: { input: 'an EventBuilder `team()` / `tieFormat()` string', replacement: TIE_FORMAT },
  ratingsPreset: { input: 'a `ratingsPolicy` preset name', replacement: RATINGS },
} as const;

export type CatalogueNameInput = keyof typeof CATALOGUE_NAME_INPUTS;

/** Node's `process`, where there is one: only `emitWarning` is read. */
type WarningHost = { emitWarning?: (message: string, options: { type: string; code: string }) => void };

const warned: { [input in CatalogueNameInput]?: true } = {};
let attributedTo: CatalogueNameInput | undefined;

/**
 * Runs `fn` with every tie format name it resolves attributed to `input`: for a caller's name that the factory passes on
 * to another input (a mocks profile's `tieFormatName` reaching generateDrawDefinition), so the warning names the input
 * the caller used. A ratings preset name keeps its own input.
 */
export function attributeCatalogueNames<T>(input: CatalogueNameInput, fn: () => T): T {
  const prior = attributedTo;
  attributedTo = input;
  try {
    return fn();
  } finally {
    attributedTo = prior;
  }
}

/** Warns, once per process for each input, that `name` was resolved from the catalogue. */
export function warnCatalogueName(used: CatalogueNameInput, name: string): void {
  const input = attributedTo && CATALOGUE_NAME_INPUTS[used].replacement === TIE_FORMAT ? attributedTo : used;
  if (warned[input]) return;
  warned[input] = true;
  const { input: where, replacement } = CATALOGUE_NAME_INPUTS[input];
  const message =
    `${where} '${name}' asks for a catalogue entry by name. Named catalogue entries leave the core in 8.0.0, where ` +
    `the name no longer resolves: ${replacement}. Names keep working in 7.x. See ${GUIDE}`;
  const host = (globalThis as { process?: WarningHost }).process;
  if (typeof host?.emitWarning === 'function') {
    host.emitWarning(message, { type: 'DeprecationWarning', code: CATALOGUE_NAME_WARNING_CODE });
  } else {
    console.warn(`[DeprecationWarning] ${message}`);
  }
}

/** Test support: forget which inputs have warned, so the next use of each warns again. */
export function resetCatalogueNameWarnings(): void {
  for (const input of Object.keys(warned)) delete warned[input as CatalogueNameInput];
}
