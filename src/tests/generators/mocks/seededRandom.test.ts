import { mocksEngine } from '@Assemblies/engines/mock';
import { createSeededRandom } from '@Tools/prng';
import { shuffleArray } from '@Tools/arrays';
import { it, expect, test } from 'vitest';

test('createSeededRandom produces deterministic sequences', () => {
  const rng1 = createSeededRandom(42);
  const rng2 = createSeededRandom(42);
  const seq1 = Array.from({ length: 100 }, () => rng1());
  const seq2 = Array.from({ length: 100 }, () => rng2());
  expect(seq1).toEqual(seq2);
});

test('different seeds produce different sequences', () => {
  const rng1 = createSeededRandom(42);
  const rng2 = createSeededRandom(99);
  const seq1 = Array.from({ length: 20 }, () => rng1());
  const seq2 = Array.from({ length: 20 }, () => rng2());
  expect(seq1).not.toEqual(seq2);
});

test('shuffleArray is deterministic with seeded random', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const result1 = shuffleArray(arr, createSeededRandom(1));
  const result2 = shuffleArray(arr, createSeededRandom(1));
  expect(result1).toEqual(result2);
});

test('generateTournamentRecord is deterministic with nonRandom seed', () => {
  const params = {
    nonRandom: 42,
    setState: true,
    drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
  };

  let result: any = mocksEngine.generateTournamentRecord(params);
  const record1 = result.tournamentRecord;

  result = mocksEngine.generateTournamentRecord(params);
  const record2 = result.tournamentRecord;

  // Participant IDs should be identical (seeded UUID generation)
  const ids1 = record1.participants.map((p) => p.participantId).sort();
  const ids2 = record2.participants.map((p) => p.participantId).sort();
  expect(ids1).toEqual(ids2);

  // Participant names and order should be identical
  const names1 = record1.participants.map((p) => p.participantName).sort();
  const names2 = record2.participants.map((p) => p.participantName).sort();
  expect(names1).toEqual(names2);

  // Draw position assignments should be identical (same participantIds at same positions)
  const draw1 = record1.events[0].drawDefinitions[0];
  const draw2 = record2.events[0].drawDefinitions[0];
  const assignments1 = draw1.structures[0].positionAssignments
    .map((a) => `${a.drawPosition}:${a.participantId || (a.bye ? 'BYE' : '')}`)
    .sort();
  const assignments2 = draw2.structures[0].positionAssignments
    .map((a) => `${a.drawPosition}:${a.participantId || (a.bye ? 'BYE' : '')}`)
    .sort();
  expect(assignments1).toEqual(assignments2);
});

it('produces different results with different seeds', () => {
  const params1 = {
    nonRandom: 42,
    setState: true,
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  };
  const params2 = {
    nonRandom: 99,
    setState: true,
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  };

  let result: any = mocksEngine.generateTournamentRecord(params1);
  const names1 = result.tournamentRecord.participants.map((p) => p.participantName).sort();

  result = mocksEngine.generateTournamentRecord(params2);
  const names2 = result.tournamentRecord.participants.map((p) => p.participantName).sort();

  expect(names1).not.toEqual(names2);
});

test('deterministic with completeAllMatchUps', () => {
  const params = {
    nonRandom: 7,
    setState: true,
    completeAllMatchUps: true,
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
  };

  let result: any = mocksEngine.generateTournamentRecord(params);
  const draw1 = result.tournamentRecord.events[0].drawDefinitions[0];
  const matchUps1 = draw1.structures[0].matchUps.map((m) => ({
    roundPosition: m.roundPosition,
    roundNumber: m.roundNumber,
    winningSide: m.winningSide,
    score: m.score,
  }));

  result = mocksEngine.generateTournamentRecord(params);
  const draw2 = result.tournamentRecord.events[0].drawDefinitions[0];
  const matchUps2 = draw2.structures[0].matchUps.map((m) => ({
    roundPosition: m.roundPosition,
    roundNumber: m.roundNumber,
    winningSide: m.winningSide,
    score: m.score,
  }));

  expect(matchUps1).toEqual(matchUps2);
});

test('without nonRandom, results vary between calls', () => {
  const params = {
    setState: true,
    drawProfiles: [{ drawSize: 16, participantsCount: 16 }],
  };

  let result: any = mocksEngine.generateTournamentRecord(params);
  const names1 = result.tournamentRecord.participants.map((p) => p.participantName);

  result = mocksEngine.generateTournamentRecord(params);
  const names2 = result.tournamentRecord.participants.map((p) => p.participantName);

  // With 16 random participants, it's astronomically unlikely to get the same order twice
  expect(names1).not.toEqual(names2);
});
