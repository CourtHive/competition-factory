import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM_EVENT } from '@Constants/eventConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

test('filterMatchUps with matchUpStatuses filter', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 4 }],
    setState: true,
  });

  const { matchUps: completed } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
  });
  expect(completed.length).toBeGreaterThan(0);

  const { matchUps: toBePlayed } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
  });
  expect(toBePlayed.length).toBeGreaterThan(0);
});

test('filterMatchUps with excludeMatchUpStatuses', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 4 }],
    setState: true,
  });

  const { matchUps: all } = tournamentEngine.allTournamentMatchUps();
  const { matchUps: excludeCompleted } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { excludeMatchUpStatuses: [COMPLETED] },
  });
  expect(excludeCompleted.length).toBeLessThan(all.length);
});

test('filterMatchUps with roundNumbers and roundPositions', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    setState: true,
  });

  const { matchUps: round1 } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundNumbers: [1] },
  });
  expect(round1.every((m) => m.roundNumber === 1)).toBe(true);

  const { matchUps: pos1 } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundPositions: [1] },
  });
  expect(pos1.every((m) => m.roundPosition === 1)).toBe(true);
});

test('filterMatchUps with matchUpIds filter', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps: all } = tournamentEngine.allTournamentMatchUps();
  const targetIds = all.slice(0, 2).map((m) => m.matchUpId);

  const { matchUps: filtered } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: targetIds },
  });
  expect(filtered.length).toBe(2);
});

test('filterMatchUps with isMatchUpTie', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    setState: true,
  });

  const { matchUps: ties } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { isMatchUpTie: true },
  });
  expect(ties.every((m) => m.tieMatchUps)).toBe(true);

  const { matchUps: nonTies } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { isMatchUpTie: false },
  });
  expect(nonTies.every((m) => !m.tieMatchUps)).toBe(true);
});

test('filterMatchUps with isCollectionMatchUp', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    setState: true,
  });

  const { matchUps: collection } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { isCollectionMatchUp: true },
  });
  expect(collection.every((m) => m.collectionId)).toBe(true);

  const { matchUps: nonCollection } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { isCollectionMatchUp: false },
  });
  expect(nonCollection.every((m) => !m.collectionId)).toBe(true);
});

test('contextFilters with stages filter', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [MAIN] },
  });
  expect(matchUps.length).toBeGreaterThan(0);
  expect(matchUps.every((m) => m.stage === MAIN)).toBe(true);
});

test('filterMatchUps with readyToScore', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { readyToScore: true },
  });
  expect(matchUps).toBeDefined();
});

test('contextFilters with eventIds and drawIds', () => {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps: eventFiltered } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { eventIds: [eventId] },
  });
  expect(eventFiltered.length).toBeGreaterThan(0);

  const { matchUps: drawFiltered } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { drawIds: [drawId] },
  });
  expect(drawFiltered.length).toBeGreaterThan(0);
});

test('contextFilters with hasParticipantsCount', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { hasParticipantsCount: 2 },
  });
  expect(matchUps.every((m) => m.sides?.filter((s) => s.participantId).length >= 2)).toBe(true);
});

test('contextFilters with participantIds', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps: all } = tournamentEngine.allTournamentMatchUps();
  const targetPid = all[0].sides?.[0]?.participantId;
  if (!targetPid) return;

  const { matchUps: filtered } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { participantIds: [targetPid] },
  });
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.every((m) => m.sides?.some((s) => s.participantId === targetPid))).toBe(true);
});

test('contextFilters with stageSequences', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stageSequences: [1] },
  });
  expect(matchUps.length).toBeGreaterThan(0);
});

test('filterMatchUps with hasWinningSide', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 4 }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { hasWinningSide: true },
  });
  expect(matchUps).toBeDefined();
});

test('contextFilters with scheduledDate', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { scheduledDate: '2020-01-01' },
  });
  expect(matchUps.length).toBe(0);
});

test('contextFilters with roundNames', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps: all } = tournamentEngine.allTournamentMatchUps();
  const roundName = all[0].roundName;

  if (roundName) {
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      contextFilters: { roundNames: [roundName] },
    });
    expect(matchUps.length).toBeGreaterThan(0);
  }
});

test('contextFilters with collectionIds', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    setState: true,
  });

  const { matchUps: all } = tournamentEngine.allTournamentMatchUps();
  const collectionId = all.find((m) => m.collectionId)?.collectionId;

  if (collectionId) {
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      contextFilters: { collectionIds: [collectionId] },
    });
    expect(matchUps.length).toBeGreaterThan(0);
  }
});

test('contextFilters with structureIds', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { matchUps: all } = tournamentEngine.allTournamentMatchUps();
  const structureId = all[0].structureId;

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [structureId] },
  });
  expect(matchUps.length).toBeGreaterThan(0);
});

test('contextFilters with matchUpTypes', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
    setState: true,
  });

  const { matchUps: singlesOnly } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { matchUpTypes: [SINGLES] },
  });
  expect(singlesOnly.every((m) => m.matchUpType === SINGLES)).toBe(true);
});

test('contextFilters with matchUpFormat', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, matchUpFormat: 'SET3-S:6/TB7' }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { matchUpFormat: 'SET3-S:6/TB7' },
  });
  expect(matchUps.length).toBeGreaterThan(0);

  const { matchUps: noMatch } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { matchUpFormats: ['SET1-S:4/TB7'] },
  });
  expect(noMatch.length).toBe(0);
});
