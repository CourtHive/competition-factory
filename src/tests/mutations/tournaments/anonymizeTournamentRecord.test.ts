import { findExtension } from '@Acquire/findExtension';
import mocksEngine from '@Assemblies/engines/mock';
import { intersection } from '@Tools/arrays';
import { expect, it, test } from 'vitest';
import fs from 'fs';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
} from '@Constants/drawDefinitionConstants';

const mockProfiles = [
  { drawProfiles: [{ drawSize: 32, drawType: MODIFIED_FEED_IN_CHAMPIONSHIP }] },
  { drawProfiles: [{ drawSize: 32, drawType: FIRST_ROUND_LOSER_CONSOLATION }] },
  { drawProfiles: [{ drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION }] },
  { drawProfiles: [{ drawSize: 32, drawType: FEED_IN_CHAMPIONSHIP_TO_SF }] },
  { drawProfiles: [{ drawSize: 32, drawType: ROUND_ROBIN_WITH_PLAYOFF }] },
  { drawProfiles: [{ drawSize: 32, drawType: CURTIS_CONSOLATION }] },
  { drawProfiles: [{ drawSize: 32, drawType: ROUND_ROBIN }] },
  { drawProfiles: [{ drawSize: 32, drawType: COMPASS }] },
  { drawProfiles: [{ drawSize: 48, drawType: FEED_IN }] },
];

test('anonymizeTournamentRecord error conditions', () => {
  const result = mocksEngine.anonymizeTournamentRecord();
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

test.each(mockProfiles)('it can anonymize tournamentRecords', (mockProfile) => {
  const tournamentName = 'Demo Tournament';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    ...mockProfile,
    tournamentName,
  });

  const originalPersons = tournamentRecord.participants.map((participant) => participant.person);

  const originalEventEntries = tournamentRecord.events[0].entries.map(({ participantId }) => participantId);
  const originalDrawEntries = tournamentRecord.events[0].drawDefinitions[0].entries.map(
    ({ participantId }) => participantId,
  );

  let { extension: flightProfile } = findExtension({
    element: tournamentRecord.events[0],
    name: FLIGHT_PROFILE,
  });

  const originalFlightEntries = flightProfile?.value.flights[0].drawEntries.map(({ participantId }) => participantId);

  expect(tournamentRecord.tournamentName).toEqual(tournamentName);
  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  expect(tournamentRecord.tournamentName.split(':')[0]).toEqual(`Anonymized`);

  const generatedPersons = tournamentRecord.participants.map((participant) => participant.person);

  const originalPersonIds = originalPersons.map(({ personId }) => personId);
  const generatedPersonIds = generatedPersons.map(({ personId }) => personId);
  expect(intersection(originalPersonIds, generatedPersonIds).length).toEqual(0);

  const eventEntries = tournamentRecord.events[0].entries.map(({ participantId }) => participantId);
  expect(intersection(originalEventEntries, eventEntries).length).toEqual(0);

  const drawEntries = tournamentRecord.events[0].drawDefinitions[0].entries.map(({ participantId }) => participantId);
  expect(intersection(originalDrawEntries, drawEntries).length).toEqual(0);

  ({ extension: flightProfile } = findExtension({
    element: tournamentRecord.events[0],
    name: FLIGHT_PROFILE,
  }));
  const flightEntries = flightProfile?.value.flights[0].drawEntries.map(({ participantId }) => participantId);
  expect(intersection(originalFlightEntries, flightEntries).length).toEqual(0);
});

test('parentOrganisation is deleted by default', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });
  tournamentRecord.parentOrganisation = { organisationId: 'real-provider', organisationName: 'Real Provider Ltd' };

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);
  expect(tournamentRecord.parentOrganisation).toBeUndefined();
});

test('parentOrganisation override is attached when provided', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });
  tournamentRecord.parentOrganisation = { organisationId: 'real-provider', organisationName: 'Real Provider Ltd' };

  const mockProvider = { organisationId: 'mock-provider-1', organisationName: 'Mock Provider 1' };
  const result = mocksEngine.anonymizeTournamentRecord({
    tournamentRecord,
    parentOrganisation: mockProvider,
  });
  expect(result.success).toEqual(true);
  expect(tournamentRecord.parentOrganisation).toEqual(mockProvider);
});

test('multi-tournament pipeline: same real provider maps to same mock provider across records', () => {
  const realProviderA = { organisationId: 'real-A', organisationName: 'Real A' };
  const realProviderB = { organisationId: 'real-B', organisationName: 'Real B' };

  const tournaments = [
    { real: realProviderA },
    { real: realProviderA },
    { real: realProviderB },
    { real: realProviderA },
  ].map(({ real }) => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    tournamentRecord.parentOrganisation = real;
    return tournamentRecord;
  });

  // Caller-side map keeps one mock provider per real provider id so that
  // anonymized "tournaments by provider" grouping queries still group correctly.
  const providerMap = new Map<string, { organisationId: string; organisationName: string }>();
  let nextMock = 0;
  for (const tr of tournaments) {
    const realId = tr.parentOrganisation?.organisationId;
    if (realId && !providerMap.has(realId)) {
      nextMock += 1;
      providerMap.set(realId, { organisationId: `mock-${nextMock}`, organisationName: `Mock ${nextMock}` });
    }
    mocksEngine.anonymizeTournamentRecord({
      tournamentRecord: tr,
      parentOrganisation: realId ? providerMap.get(realId) : undefined,
    });
  }

  const groups = tournaments.reduce<Record<string, number>>((acc, tr) => {
    const id = tr.parentOrganisation?.organisationId ?? 'none';
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
  expect(groups['mock-1']).toEqual(3);
  expect(groups['mock-2']).toEqual(1);
  // Real provider ids must not have leaked through.
  expect(groups['real-A']).toBeUndefined();
  expect(groups['real-B']).toBeUndefined();
});

const sourcePath = './src/tests/testHarness';
const filenames = fs.readdirSync(sourcePath).filter(
  (filename) => filename.indexOf('.tods.json') > 0 && filename.indexOf('.8') > 0, // skip v0.8
);

it.each(filenames)('can anonymize TODS files in the testHarness directory', (filename) => {
  const tournamentRecord = JSON.parse(
    fs.readFileSync(`./src/global/testHarness/${filename}`, {
      encoding: 'utf8',
    }),
  );

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);
});
