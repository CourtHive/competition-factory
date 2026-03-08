import { getRelevantParticipantIdsMap } from '@Query/participants/getRelevantParticipantIdsMap';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';

it('returns error when no tournamentRecord or tournamentRecords provided', () => {
  const result = getRelevantParticipantIdsMap({
    processParticipantId: undefined,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('returns error when tournamentRecord is not an object', () => {
  const result = getRelevantParticipantIdsMap({
    tournamentRecord: 'invalid' as any,
    processParticipantId: undefined,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('builds map for individual participants from a single tournamentRecord', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
  });

  const result = getRelevantParticipantIdsMap({
    tournamentRecord,
    processParticipantId: undefined,
  });
  expect(result.error).toBeUndefined();
  expect(result.relevantParticipantIdsMap).toBeDefined();

  const map = result.relevantParticipantIdsMap;
  const participantIds = Object.keys(map);
  expect(participantIds.length).toEqual(8);

  // For individual participants, the map entry should include only themselves
  for (const participantId of participantIds) {
    const entries = map[participantId];
    expect(entries.length).toEqual(1);
    expect(entries[0].relevantParticipantId).toEqual(participantId);
    expect(entries[0].participantType).toEqual(INDIVIDUAL);
  }
});

it('builds map for pair participants including individual references', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 4 },
  });

  const result = getRelevantParticipantIdsMap({
    tournamentRecord,
    processParticipantId: undefined,
  });
  expect(result.error).toBeUndefined();

  const map = result.relevantParticipantIdsMap;
  const allParticipants = tournamentRecord.participants ?? [];
  const pairParticipants = allParticipants.filter((p) => p.participantType === PAIR);
  const individualParticipants = allParticipants.filter((p) => p.participantType === INDIVIDUAL);

  // Should have entries for all participants (pairs + individuals)
  expect(Object.keys(map).length).toEqual(allParticipants.length);

  // Each pair participant should reference its individual members + itself
  for (const pair of pairParticipants) {
    const entries = map[pair.participantId];
    expect(entries.length).toEqual(3); // 2 individuals + self
    const relevantIds = entries.map((e) => e.relevantParticipantId);
    expect(relevantIds).toContain(pair.participantId);
    for (const indId of pair.individualParticipantIds ?? []) {
      expect(relevantIds).toContain(indId);
    }

    // Individual references should have INDIVIDUAL participantType
    const individualEntries = entries.filter((e) => e.relevantParticipantId !== pair.participantId);
    for (const entry of individualEntries) {
      expect(entry.participantType).toEqual(INDIVIDUAL);
    }

    // Self-reference should have PAIR participantType
    const selfEntry = entries.find((e) => e.relevantParticipantId === pair.participantId);
    expect(selfEntry?.participantType).toEqual(PAIR);
  }

  // Each individual participant should only reference itself
  for (const ind of individualParticipants) {
    const entries = map[ind.participantId];
    expect(entries.length).toEqual(1);
    expect(entries[0].relevantParticipantId).toEqual(ind.participantId);
  }
});

it('calls processParticipantId for each participant when provided', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 5 },
  });

  const processedIds: string[] = [];
  const result = getRelevantParticipantIdsMap({
    processParticipantId: (id: string) => processedIds.push(id),
    tournamentRecord,
  });
  expect(result.error).toBeUndefined();
  expect(processedIds.length).toEqual(5);

  const allParticipantIds = (tournamentRecord.participants ?? []).map((p) => p.participantId);
  for (const id of allParticipantIds) {
    expect(processedIds).toContain(id);
  }
});

it('does not call processParticipantId when it is not a function', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 3 },
  });

  // Should not throw when processParticipantId is not a function
  const result = getRelevantParticipantIdsMap({
    processParticipantId: 'notAFunction',
    tournamentRecord,
  });
  expect(result.error).toBeUndefined();
  expect(Object.keys(result.relevantParticipantIdsMap).length).toEqual(3);
});

it('works with tournamentRecords (multiple tournaments)', () => {
  const { tournamentRecord: record1 } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 3 },
  });
  const { tournamentRecord: record2 } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4 },
  });

  const tournamentRecords = {
    [record1.tournamentId]: record1,
    [record2.tournamentId]: record2,
  };

  const result = getRelevantParticipantIdsMap({
    tournamentRecords,
    processParticipantId: undefined,
  });
  expect(result.error).toBeUndefined();
  expect(Object.keys(result.relevantParticipantIdsMap).length).toEqual(7);
});

it('handles tournament record with no participants', () => {
  const result = getRelevantParticipantIdsMap({
    tournamentRecord: { participants: [] } as any,
    processParticipantId: undefined,
  });
  expect(result.error).toBeUndefined();
  expect(Object.keys(result.relevantParticipantIdsMap).length).toEqual(0);
});
