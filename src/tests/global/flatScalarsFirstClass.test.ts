/**
 * CODES Phase 4 — first-class promotion of flat scalar / object extensions:
 *   - `factory` (Tournament)
 *   - `delegatedOutcome` (MatchUp)
 *   - `disableAutoCalc` (MatchUp)
 *   - `disableLinks` (PositionAssignment)
 *   - `disabled` (Venue, Court)
 *   - `roundTarget` (Entry, Structure)
 *   - `draftState` (DrawDefinition)
 *   - `competitionState` (DrawDefinition)
 *
 * `linkedTournamentIds` is intentionally NOT in Phase 4 — its legacy extension
 * value is `{tournamentIds: string[]}` while the CODES first-class shape would
 * be a flat `string[]`. That shape translation is deferred to Phase 7's
 * `migrateTournamentRecord` utility.
 */
import { describe, expect, it } from 'vitest';

import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { setSchemaWriteMode } from '@Global/state/globalState';
import { findExtension } from '@Acquire/findExtension';

// constants and types
import { DUAL, LEGACY, NATIVE, SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import {
  COMPETITION_STATE,
  DELEGATED_OUTCOME,
  DISABLE_AUTO_CALC,
  DISABLE_LINKS,
  DISABLED,
  DRAFT_STATE,
  FACTORY,
  ROUND_TARGET,
} from '@Constants/extensionConstants';

type Promotion = { name: string; attribute: string; value: any };

const promotions: Promotion[] = [
  { name: FACTORY, attribute: 'factory', value: { version: '5.0.0-alpha.0' } },
  { name: DELEGATED_OUTCOME, attribute: 'delegatedOutcome', value: { winningSide: 1 } },
  { name: DISABLE_AUTO_CALC, attribute: 'disableAutoCalc', value: true },
  { name: DISABLE_LINKS, attribute: 'disableLinks', value: true },
  { name: DISABLED, attribute: 'disabled', value: true },
  { name: DISABLED, attribute: 'disabled', value: { dates: ['2026-01-05'] } },
  { name: ROUND_TARGET, attribute: 'roundTarget', value: 2 },
  { name: DRAFT_STATE, attribute: 'draftState', value: { status: 'COLLECTING_PREFERENCES' } },
  { name: COMPETITION_STATE, attribute: 'competitionState', value: { roundStates: {} } },
];

describe.each([NATIVE, DUAL, LEGACY] as SchemaWriteMode[])('flat scalar routing (mode=%s)', (mode) => {
  it.each(promotions)('$attribute', ({ name, attribute, value }) => {
    setSchemaWriteMode(mode);
    const element: any = {};
    setFirstClassOrExtension({ element, attribute, name, value });

    const ext = findExtension({ element, name }).extension;
    if (mode === NATIVE) {
      expect(element[attribute]).toEqual(value);
      expect(ext).toBeUndefined();
    } else if (mode === DUAL) {
      expect(element[attribute]).toEqual(value);
      expect(ext?.value).toEqual(value);
    } else {
      expect(element[attribute]).toBeUndefined();
      expect(ext?.value).toEqual(value);
    }
  });
});

describe('Read symmetry', () => {
  it.each(promotions)('mode-agnostic read for $attribute', ({ name, attribute, value }) => {
    for (const mode of [NATIVE, DUAL, LEGACY] as SchemaWriteMode[]) {
      setSchemaWriteMode(mode);
      const element: any = {};
      setFirstClassOrExtension({ element, attribute, name, value });
      expect(firstClassOrExtension({ element, attribute, name })).toEqual(value);
    }
  });
});

describe('Undefined-value removal', () => {
  it.each(promotions)('clears both surfaces for $attribute', ({ name, attribute, value }) => {
    setSchemaWriteMode(DUAL);
    const element: any = {};
    setFirstClassOrExtension({ element, attribute, name, value });
    expect(element[attribute]).toEqual(value);

    setFirstClassOrExtension({ element, attribute, name, value: undefined });
    expect(element[attribute]).toBeUndefined();
    const ext = findExtension({ element, name }).extension;
    expect(ext).toBeUndefined();
  });
});
