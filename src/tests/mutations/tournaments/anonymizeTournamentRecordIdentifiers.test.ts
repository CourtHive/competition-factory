import { anonymizeTournamentRecord } from '@Generators/tournamentRecords/anonymizeTournamentRecord';
import { getTournamentInconsistencies } from '@Query/tournaments/getTournamentInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { createSeededRandom } from '@Tools/prng';
import { describe, expect, it } from 'vitest';

// constants and types
import type { PresenceAttestation } from '@Types/presenceTypes';
import { TEAM } from '@Constants/eventConstants';

function visit(node: unknown, fn: (key: string, value: unknown) => void) {
  if (Array.isArray(node)) node.forEach((value) => visit(value, fn));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      fn(key, value);
      visit(value, fn);
    }
  }
}

function generatedTeam() {
  return mocksEngine.generateTournamentRecord({
    setState: true,
    nonRandom: 93731,
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    drawProfiles: [{ eventType: TEAM, drawSize: 4 }],
  }).tournamentRecord;
}

describe('anonymized defined identifiers', () => {
  it('remaps dangling winner and loser edges consistently without inventing a matchUp', () => {
    const original = structuredClone(generatedTeam());
    const missing = 'missing-match-private';
    original.matchUps = [
      { matchUpId: 'first-private', winnerMatchUpId: missing, loserMatchUpId: missing },
      { matchUpId: 'second-private', loserMatchUpId: missing },
    ];
    let result: any = anonymizeTournamentRecord({ tournamentRecord: original, random: createSeededRandom(17) });
    if (!('tournamentRecord' in result)) throw new Error('anonymization failed');
    expect(result.success).toBe(true);
    const matches = result.tournamentRecord.matchUps ?? [];
    expect(matches).toHaveLength(2);
    expect(matches[0].winnerMatchUpId).not.toBe(missing);
    expect(matches[0].winnerMatchUpId).toBe(matches[0].loserMatchUpId);
    expect(matches[1].loserMatchUpId).toBe(matches[0].winnerMatchUpId);
    expect(JSON.stringify(result.tournamentRecord)).not.toContain(missing);
  });

  it('replaces composite collection definitions and every tie/line-up reference without changing results', () => {
    const original = structuredClone(generatedTeam());
    const collections = new Set<string>();
    visit(original, (key, value) => {
      if (key === 'collectionDefinitions' && Array.isArray(value))
        for (const collection of value) collections.add(collection.collectionId);
    });
    expect(collections.size).toBeGreaterThan(0);
    const before = JSON.stringify(original);
    let result: any = anonymizeTournamentRecord({
      tournamentRecord: structuredClone(original),
      random: createSeededRandom(42),
    });
    expect(result.success).toBe(true);
    const record = result.tournamentRecord;
    const serialized = JSON.stringify(record);
    for (const id of collections) expect(serialized).not.toContain(id);
    expect(serialized).not.toContain(original.events[0].eventId);

    const remappedCollections = new Set<string>();
    let references = 0;
    visit(record, (key, value) => {
      if (key === 'collectionDefinitions' && Array.isArray(value))
        for (const collection of value) remappedCollections.add(collection.collectionId);
    });
    visit(record, (key, value) => {
      if (key === 'collectionId') {
        expect(typeof value === 'string' && remappedCollections.has(value)).toBe(true);
        references += 1;
      }
    });
    expect(references).toBeGreaterThan(remappedCollections.size);
    expect(remappedCollections.size).toBe(collections.size);
    const originalScan = getTournamentInconsistencies({ tournamentRecord: original });
    const copyScan = getTournamentInconsistencies({ tournamentRecord: record });
    expect(originalScan.valid).toBe(true);
    expect(copyScan.valid).toBe(true);
    expect(originalScan.inconsistencies).toEqual([]);
    expect(copyScan.inconsistencies).toEqual([]);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('remaps presence fact IDs and references while preserving state, time and subjects', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      nonRandom: 197,
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      drawProfiles: [{ drawSize: 4 }],
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const matchUp = matchUps.find((value: { sides?: { participantId?: string }[] }) => value.sides?.[0]?.participantId);
    expect(matchUp).toBeDefined();
    let result: any = tournamentEngine.checkInParticipant({
      participantId: matchUp.sides[0].participantId,
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
    });
    expect(result.success).toBe(true);
    result = tournamentEngine.modifyParticipantsSignInStatus({
      participantIds: [matchUp.sides[0].participantId],
      signInState: 'SIGNED_IN',
    });
    expect(result.success).toBe(true);
    const original = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const facts: PresenceAttestation[] = [];
    visit(original, (key, value) => {
      if ((key === 'presence' || key === 'checkIns') && Array.isArray(value)) facts.push(...value);
    });
    expect(facts.length).toBe(2);
    original.extensions = [{ name: 'identifierAudit', value: { [facts[0].attestationId]: facts[1].attestationId } }];
    result = anonymizeTournamentRecord({
      tournamentRecord: structuredClone(original),
      keepExtensions: ['identifierAudit'],
      random: createSeededRandom(119),
    });
    expect(result.success).toBe(true);
    const record = result.tournamentRecord;
    const anonymizedFacts: PresenceAttestation[] = [];
    visit(record, (key, value) => {
      if ((key === 'presence' || key === 'checkIns') && Array.isArray(value)) anonymizedFacts.push(...value);
    });
    for (const [index, fact] of facts.entries()) {
      expect(JSON.stringify(record)).not.toContain(fact.attestationId);
      expect(anonymizedFacts[index].state).toBe(fact.state);
      expect(anonymizedFacts[index].occurredAt).toBe(fact.occurredAt);
      expect(
        record.participants.some(
          (participant: { participantId: string }) =>
            participant.participantId === anonymizedFacts[index].participantId,
        ),
      ).toBe(true);
    }
    expect(record.extensions[0].value).toEqual({
      [anonymizedFacts[0].attestationId]: anonymizedFacts[1].attestationId,
    });
  });

  it('remaps named tie-format definitions and pointers at multiple scopes', () => {
    const original = structuredClone(generatedTeam());
    const oldId = 'original-format-private-001';
    const format = original.events[0].tieFormat ?? original.events[0].drawDefinitions[0].tieFormat;
    expect(format).toBeDefined();
    format.tieFormatId = oldId;
    original.tieFormats = [structuredClone(format)];
    original.events[0].tieFormatId = oldId;
    let result: any = anonymizeTournamentRecord({ tournamentRecord: original, random: createSeededRandom(10) });
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.tournamentRecord)).not.toContain(oldId);
    expect(result.tournamentRecord.events[0].tieFormatId).toBe(result.tournamentRecord.tieFormats[0].tieFormatId);
  });

  it('remaps repeated definitions consistently and reproduces them with the same seed', () => {
    const original = structuredClone(generatedTeam());
    const format = original.events[0].tieFormat ?? original.events[0].drawDefinitions[0].tieFormat;
    original.tieFormats = [structuredClone(format), structuredClone(format)];
    let result: any = anonymizeTournamentRecord({
      tournamentRecord: structuredClone(original),
      random: createSeededRandom(61),
    });
    let repeat: any = anonymizeTournamentRecord({
      tournamentRecord: structuredClone(original),
      random: createSeededRandom(61),
    });
    expect(result.success).toBe(true);
    expect(repeat.success).toBe(true);
    expect({ ...result.tournamentRecord, createdAt: undefined }).toEqual({
      ...repeat.tournamentRecord,
      createdAt: undefined,
    });
    expect(result.tournamentRecord.tieFormats[0]).toEqual(result.tournamentRecord.tieFormats[1]);
  });

  it('does not turn empty optional identifiers or blank scores into new identifiers', () => {
    const original = structuredClone(generatedTeam());
    original.venues = [{ venueId: 'venue-private', courts: [{ courtId: '', courtName: 'Unset court' }] }];
    original.matchUps = [
      { matchUpId: 'match-private', score: { scoreStringSide1: '', scoreStringSide2: '' }, schedule: { courtId: '' } },
    ];
    let result: any = anonymizeTournamentRecord({ tournamentRecord: original, random: createSeededRandom(15) });
    expect(result.success).toBe(true);
    expect(result.tournamentRecord.matchUps[0].score.scoreStringSide1).toBe('');
    expect(result.tournamentRecord.matchUps[0].score.scoreStringSide2).toBe('');
    expect(result.tournamentRecord.matchUps[0].schedule.courtId).toBe('');
  });
});
