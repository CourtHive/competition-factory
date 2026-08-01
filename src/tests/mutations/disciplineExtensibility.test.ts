import { getDisciplineProfile, registerDisciplineProfile } from '@Fixtures/disciplines/disciplineProfiles';
import { normalizeDiscipline, isKnownDiscipline, isDisciplineAllowed } from '@Helpers/coercedDiscipline';
import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import { disciplines } from '@Constants/disciplineConstants';

// Phase 0 — normalization + curated known-set + drift guard.
test('normalizeDiscipline canonicalizes casing and separators; open values pass through', () => {
  expect(normalizeDiscipline('tennis')).toEqual('TENNIS');
  expect(normalizeDiscipline('beach volleyball')).toEqual('BEACH_VOLLEYBALL');
  expect(normalizeDiscipline('beach-tennis')).toEqual('BEACH_TENNIS');
  expect(normalizeDiscipline('  Padel ')).toEqual('PADEL');
  expect(normalizeDiscipline('BEACH_VOLLEYBALL')).toEqual('BEACH_VOLLEYBALL');
  // open vocabulary: an unknown-but-well-formed value is normalized, never rejected
  expect(normalizeDiscipline('table tennis')).toEqual('TABLE_TENNIS');
  // non-strings + empty pass through unchanged
  expect(normalizeDiscipline(undefined)).toBeUndefined();
  expect(normalizeDiscipline('')).toEqual('');
});

test('isKnownDiscipline recognizes the curated set; rejects typos and unknowns', () => {
  for (const d of [
    'TENNIS',
    'BEACH_TENNIS',
    'WHEELCHAIR_TENNIS',
    'PADEL',
    'PICKLEBALL',
    'VOLLEYBALL',
    'BEACH_VOLLEYBALL',
  ]) {
    expect(isKnownDiscipline(d)).toBe(true);
  }
  expect(isKnownDiscipline('beach volleyball')).toBe(true); // normalized, then matched
  expect(isKnownDiscipline('BEACH_VOLLEYBAL')).toBe(false); // typo — missing final L
  expect(isKnownDiscipline('CRICKET')).toBe(false); // unknown (not in curated set)
  expect(isKnownDiscipline(undefined)).toBe(false);
});

// Guards the type↔schema drift that opened this workstream: the TS known set must include
// every discipline the published schema historically enumerated.
test('known set includes the schema-enumerated racquet disciplines (drift guard)', () => {
  for (const d of ['TENNIS', 'BEACH_TENNIS', 'WHEELCHAIR_TENNIS', 'PADEL', 'PICKLEBALL']) {
    expect(disciplines).toContain(d);
  }
});

// Phase 2 — policy gate + normalize-on-write.
test('isDisciplineAllowed: empty/absent whitelist allows all; whitelist matches normalization-insensitively', () => {
  expect(isDisciplineAllowed('VOLLEYBALL')).toBe(true); // no whitelist → unconstrained
  expect(isDisciplineAllowed('VOLLEYBALL', [])).toBe(true); // empty whitelist → unconstrained
  expect(isDisciplineAllowed('beach volleyball', ['BEACH_VOLLEYBALL', 'TENNIS'])).toBe(true); // normalized match
  expect(isDisciplineAllowed('VOLLEYBALL', ['TENNIS', 'PADEL'])).toBe(false); // not in whitelist
});

test('addEvent normalizes an open discipline on write', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  let result: any = tournamentEngine.addEvent({ event: { eventName: 'Beach VB', discipline: 'beach volleyball' } });
  expect(result.success).toEqual(true);
  // stored canonically despite the lower-case / space-separated input
  expect(result.event.discipline).toEqual('BEACH_VOLLEYBALL');

  const { event }: any = tournamentEngine.getEvent({ eventId: result.event.eventId });
  expect(event.discipline).toEqual('BEACH_VOLLEYBALL');
});

// Phase 3 — discipline -> sport-profile registry.
test('getDisciplineProfile resolves built-ins (normalization-insensitive); unknown -> undefined', () => {
  const tennis = getDisciplineProfile({ discipline: 'tennis' });
  expect(tennis?.matchUpTypes).toEqual(['SINGLES', 'DOUBLES']);
  expect(tennis?.defaultMatchUpFormat).toEqual('SET3-S:6/TB7');

  // resolved via normalization of a space-separated input
  expect(getDisciplineProfile({ discipline: 'beach volleyball' })?.matchUpTypes).toEqual(['DOUBLES']);

  // open vocabulary: a discipline with no registered profile is a normal undefined, not an error
  expect(getDisciplineProfile({ discipline: 'CRICKET' })).toBeUndefined();
});

test('registerDisciplineProfile adds/overrides a profile at runtime', () => {
  registerDisciplineProfile({
    discipline: 'test squash',
    matchUpTypes: ['SINGLES'],
    defaultMatchUpFormat: 'SET5-S:11NOAD',
  });
  const profile = getDisciplineProfile({ discipline: 'TEST_SQUASH' });
  expect(profile?.discipline).toEqual('TEST_SQUASH'); // key normalized on registration
  expect(profile?.matchUpTypes).toEqual(['SINGLES']);
  expect(profile?.defaultMatchUpFormat).toEqual('SET5-S:11NOAD');
});
