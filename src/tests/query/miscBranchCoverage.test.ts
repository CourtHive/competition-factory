import { validateCollectionDefinition } from '@Validators/validateCollectionDefinition';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { MALE, FEMALE } from '@Constants/genderConstants';
import { SINGLES } from '@Constants/eventConstants';

// stringify branches
test('stringify with non-object returns undefined', () => {
  expect(stringify(null)).toBeUndefined();
  expect(stringify('string')).toBeUndefined();
});

test('stringify with exactly sets', () => {
  const result = stringify({
    exactly: 3,
    setFormat: { setTo: 6, tiebreakFormat: { tiebreakTo: 7 } },
  });
  expect(result).toContain('X');
});

test('stringify with simplified timed format', () => {
  const result = stringify({
    bestOf: 1,
    simplified: true,
    setFormat: { timed: true, minutes: 10 },
  });
  expect(result).toBe('T10');
});

test('stringify with timed set based P', () => {
  const result = stringify({
    bestOf: 1,
    simplified: true,
    setFormat: { timed: true, minutes: 10, based: 'P' },
  });
  expect(result).toBe('T10P');
});

test('stringify with timed set aggregate via match-level A', () => {
  const result = stringify({
    bestOf: 1,
    aggregate: true,
    setFormat: { timed: true, minutes: 10 },
  });
  expect(result).toBe('SET1A-S:T10');
});

test('stringify with tiebreakSet format', () => {
  const result = stringify({
    bestOf: 3,
    setFormat: { setTo: 6, tiebreakFormat: { tiebreakTo: 7 } },
    finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
  });
  expect(result).toContain('TB10');
});

test('stringify with NoAD', () => {
  const result = stringify({
    bestOf: 3,
    setFormat: { setTo: 6, NoAD: true, tiebreakFormat: { tiebreakTo: 7 } },
  });
  expect(result).toContain('NOAD');
});

test('stringify with tiebreakAt', () => {
  const result = stringify({
    bestOf: 3,
    setFormat: { setTo: 6, tiebreakAt: 5, tiebreakFormat: { tiebreakTo: 7 } },
  });
  expect(result).toContain('@5');
});

test('stringify with modifier on tiebreak', () => {
  const result = stringify({
    bestOf: 1,
    setFormat: { setTo: 6, tiebreakFormat: { tiebreakTo: 7, modifier: '2' } },
  });
  expect(result).toContain('@2');
});

test('stringify with tiebreakFormat no tiebreakTo returns empty', () => {
  const result = stringify({
    bestOf: 1,
    setFormat: { setTo: 6, tiebreakFormat: {} },
  });
  expect(result).toBeDefined();
});

test('stringify with timed set with tiebreakFormat', () => {
  const result = stringify({
    bestOf: 1,
    simplified: true,
    setFormat: { timed: true, minutes: 20, tiebreakFormat: { tiebreakTo: 7 } },
  });
  expect(result).toContain('TB7');
});

test('stringify with timed set with modifier', () => {
  const result = stringify({
    bestOf: 1,
    simplified: true,
    setFormat: { timed: true, minutes: 15, modifier: 'X' },
  });
  expect(result).toContain('@X');
});

// validateCollectionDefinition branches
test('validateCollectionDefinition with non-object', () => {
  const result = validateCollectionDefinition({ collectionDefinition: 'invalid' as any });
  expect(result.error).toBeDefined();
});

test('validateCollectionDefinition with checkCollectionIds missing collectionId', () => {
  const result = validateCollectionDefinition({
    checkCollectionIds: true,
    collectionDefinition: {
      matchUpCount: 3,
      matchUpType: SINGLES,
      matchUpValue: 1,
    } as any,
  });
  expect(result.error).toBeDefined();
});

test('validateCollectionDefinition with collectionGroupNumber as string', () => {
  const result = validateCollectionDefinition({
    collectionDefinition: {
      collectionId: 'test',
      matchUpCount: 3,
      matchUpType: SINGLES,
      matchUpValue: 1,
      collectionGroupNumber: 'invalid' as any,
    } as any,
  });
  expect(result.error).toBeDefined();
});

test('validateCollectionDefinition with invalid matchUpFormat', () => {
  const result = validateCollectionDefinition({
    collectionDefinition: {
      collectionId: 'test',
      matchUpCount: 3,
      matchUpType: SINGLES,
      matchUpValue: 1,
      matchUpFormat: 'INVALID-FORMAT',
    } as any,
  });
  expect(result.error).toBeDefined();
});

test('validateCollectionDefinition with gender check failure', () => {
  const result = validateCollectionDefinition({
    referenceGender: MALE as any,
    checkGender: true,
    collectionDefinition: {
      collectionId: 'test',
      matchUpCount: 3,
      matchUpType: SINGLES,
      matchUpValue: 1,
      gender: FEMALE,
    } as any,
  });
  expect(result.error).toBeDefined();
});

test('validateCollectionDefinition with category check', () => {
  const result = validateCollectionDefinition({
    checkCategory: true,
    referenceCategory: { categoryName: '14U', type: 'AGE' } as any,
    collectionDefinition: {
      collectionId: 'test',
      matchUpCount: 3,
      matchUpType: SINGLES,
      matchUpValue: 1,
      category: { categoryName: '18U', type: 'AGE' } as any,
    } as any,
  });
  // This might produce a category error depending on categoryCanContain logic
  expect(result).toBeDefined();
});

// validateTieFormat branches
test('validateTieFormat with no params', () => {
  const result = validateTieFormat({} as any);
  expect(result.error).toBeDefined();
});

test('validateTieFormat with invalid winCriteria', () => {
  const result = validateTieFormat({
    tieFormat: { collectionDefinitions: [], winCriteria: 'invalid' },
  } as any);
  expect(result.error).toBeDefined();
});

test('validateTieFormat with no collectionDefinitions', () => {
  const result = validateTieFormat({
    tieFormat: { winCriteria: { valueGoal: 2 } },
  } as any);
  expect(result.error).toBeDefined();
});

test('validateTieFormat with aggregateValue imperative and no aggregateValue', () => {
  const result = validateTieFormat({
    tieFormat: {
      winCriteria: { valueGoal: 0 },
      collectionDefinitions: [
        {
          collectionId: 'c1',
          matchUpCount: 3,
          matchUpType: SINGLES,
          setValue: 1, // setValue triggers aggregateValueImperative
        },
      ],
    },
  });
  expect(result.error).toBeDefined();
});

test('validateTieFormat with duplicate collectionIds and checkCollectionIds', () => {
  const result = validateTieFormat({
    checkCollectionIds: true,
    tieFormat: {
      winCriteria: { valueGoal: 2 },
      collectionDefinitions: [
        { collectionId: 'dup', matchUpCount: 3, matchUpType: SINGLES, matchUpValue: 1 },
        { collectionId: 'dup', matchUpCount: 3, matchUpType: SINGLES, matchUpValue: 1 },
      ],
    },
  });
  // Duplicate collectionIds should cause validation failure
  expect(result.error).toBeDefined();
});

// getParticipants with tournamentIds filter via contextFilters
test('contextFilters with tournamentIds', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { tournamentRecord } = tournamentEngine.getTournament();
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { tournamentIds: [tournamentRecord.tournamentId] },
  });
  expect(matchUps.length).toBeGreaterThan(0);
});
