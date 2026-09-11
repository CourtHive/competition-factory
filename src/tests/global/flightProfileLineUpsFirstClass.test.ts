/**
 * CODES Phase 3 — first-class promotion of `flightProfile` (on Event /
 * DrawDefinition) and `lineUps` (on DrawDefinition).
 *
 * The existing test fleet keeps its LEGACY assertions via the vitest
 * setupFiles pin; these tests own the new behavior.
 */
import { describe, expect, it } from 'vitest';

import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { setSchemaWriteMode } from '@Global/state/globalState';
import { findExtension } from '@Acquire/findExtension';

// constants and types
import { BRIDGE, LEGACY, NATIVE, SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import { FLIGHT_PROFILE, LINEUPS } from '@Constants/extensionConstants';

describe.each([NATIVE, BRIDGE, LEGACY] as SchemaWriteMode[])('flightProfile + lineUps routing (mode=%s)', (mode) => {
  function assertSurfaces(element: any, attribute: string, name: string, expected: any) {
    const firstClass = element[attribute];
    const ext = findExtension({ element, name }).extension;
    if (mode === NATIVE) {
      expect(firstClass).toEqual(expected);
      expect(ext).toBeUndefined();
    } else if (mode === BRIDGE) {
      expect(firstClass).toEqual(expected);
      expect(ext?.value).toEqual(expected);
    } else {
      expect(firstClass).toBeUndefined();
      expect(ext?.value).toEqual(expected);
    }
  }

  it('flightProfile on event', () => {
    setSchemaWriteMode(mode);
    const event: any = { eventId: 'e1' };
    const profile = { flights: [{ drawId: 'd1', flightNumber: 1 }] };
    setFirstClassOrExtension({ element: event, attribute: 'flightProfile', name: FLIGHT_PROFILE, value: profile });
    assertSurfaces(event, 'flightProfile', FLIGHT_PROFILE, profile);
  });

  it('lineUps on drawDefinition', () => {
    setSchemaWriteMode(mode);
    const drawDefinition: any = { drawId: 'd1' };
    const lineUps = { 'team-1': [{ participantId: 'p1' }] };
    setFirstClassOrExtension({
      element: drawDefinition,
      attribute: 'lineUps',
      name: LINEUPS,
      value: lineUps,
    });
    assertSurfaces(drawDefinition, 'lineUps', LINEUPS, lineUps);
  });

  it('flightProfile removal via undefined value', () => {
    setSchemaWriteMode(mode);
    const event: any = { eventId: 'e1' };
    setFirstClassOrExtension({
      element: event,
      attribute: 'flightProfile',
      name: FLIGHT_PROFILE,
      value: { flights: [] },
    });
    setFirstClassOrExtension({
      element: event,
      attribute: 'flightProfile',
      name: FLIGHT_PROFILE,
      value: undefined,
    });
    expect(event.flightProfile).toBeUndefined();
    const ext = findExtension({ element: event, name: FLIGHT_PROFILE }).extension;
    expect(ext).toBeUndefined();
  });
});

describe('Read symmetry — firstClassOrExtension', () => {
  it.each([NATIVE, BRIDGE, LEGACY] as SchemaWriteMode[])('mode=%s reads flightProfile', (mode) => {
    setSchemaWriteMode(mode);
    const event: any = { eventId: 'e1' };
    const profile = { flights: [{ drawId: 'd1', flightNumber: 1 }] };
    setFirstClassOrExtension({ element: event, attribute: 'flightProfile', name: FLIGHT_PROFILE, value: profile });
    expect(firstClassOrExtension({ element: event, attribute: 'flightProfile', name: FLIGHT_PROFILE })).toEqual(
      profile,
    );
  });

  it.each([NATIVE, BRIDGE, LEGACY] as SchemaWriteMode[])('mode=%s reads lineUps', (mode) => {
    setSchemaWriteMode(mode);
    const drawDefinition: any = { drawId: 'd1' };
    const lineUps = { 'team-1': [{ participantId: 'p1' }] };
    setFirstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS, value: lineUps });
    expect(firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS })).toEqual(lineUps);
  });
});
