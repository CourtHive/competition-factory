import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

test('voluntaryConsolation with allEntries considers all entered participants', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
    setState: true,
  });

  // allEntries: true, requirePlay: false, requireLoss: false triggers the considerEntered path
  const { eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    requirePlay: false,
    requireLoss: false,
    allEntries: true,
    drawId,
  });

  // All 16 entered participants should be eligible (no matches played)
  expect(eligibleParticipants.length).toEqual(16);
  expect(losingParticipantIds.length).toEqual(0);
});

test('voluntaryConsolation allEntries with completed matches still returns all entries', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    setState: true,
  });

  const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    requirePlay: false,
    requireLoss: false,
    allEntries: true,
    drawId,
  });

  // All 8 participants should be eligible regardless of play/loss
  expect(eligibleParticipants.length).toEqual(8);
});

test('voluntaryConsolation allEntries with includeEventParticipants uses event entries', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 4 }, { drawSize: 16 }],
      },
    ],
    setState: true,
  });

  const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    includeEventParticipants: true,
    requirePlay: false,
    requireLoss: false,
    allEntries: true,
    drawId,
  });

  // Should consider all event entries (16 participants), not just draw entries (4)
  expect(eligibleParticipants.length).toEqual(16);
});
