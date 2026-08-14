import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

test('getPredictiveAccuracy with no tournamentRecord and no matchUps returns error', () => {
  const result = tournamentEngine.getPredictiveAccuracy({
    scaleName: 'WTN',
    matchUpType: SINGLES,
  });
  expect(result.error).toBeDefined();
});

test('getPredictiveAccuracy with invalid matchUpType returns error', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: 'INVALID' as any,
    scaleName: 'WTN',
  });
  expect(result.error).toBeDefined();
});

test('getPredictiveAccuracy with invalid matchUps returns error', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  const result = tournamentEngine.getPredictiveAccuracy({
    matchUps: 'notAnArray' as any,
    scaleName: 'WTN',
  });
  expect(result.error).toBeDefined();
});

test('getPredictiveAccuracy with completed matchUps', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: SINGLES,
    scaleName: 'WTN',
  });
  expect(result.success).toBe(true);
  expect(result.accuracy).toBeDefined();
  expect(result.relevantMatchUps).toBeDefined();
});

test('getPredictiveAccuracy with drawId filter', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    scaleName: 'WTN',
    drawId,
  });
  expect(result.success).toBe(true);
});

test('getPredictiveAccuracy with eventId filter', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    scaleName: 'WTN',
    eventId,
  });
  expect(result.success).toBe(true);
});

test('getPredictiveAccuracy with zoneMargin', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: SINGLES,
    scaleName: 'WTN',
    zoneMargin: 3,
  });
  expect(result.success).toBe(true);
  expect(result.zoneData).toBeDefined();
  expect(result.zoneDistribution).toBeDefined();
});

test('getPredictiveAccuracy with excludeMargin', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: SINGLES,
    scaleName: 'WTN',
    excludeMargin: 0.5,
  });
  expect(result.success).toBe(true);
  // Some matchUps should be excluded based on margin
  expect(result.accuracy).toBeDefined();
});

test('getPredictiveAccuracy with ascending true', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: SINGLES,
    scaleName: 'WTN',
    ascending: true,
  });
  expect(result.success).toBe(true);
});

test('getPredictiveAccuracy with zoneDoubling for DOUBLES', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 16,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: DOUBLES,
    scaleName: 'WTN',
    zoneDoubling: true,
    zoneMargin: 3,
  });
  expect(result.success).toBe(true);
  // zoneDoubling should double the margin for DOUBLES
  expect(result.zoneData).toBeDefined();
});

test('getPredictiveAccuracy with hasContext matchUps and drawId filter', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  // Get matchUps with context
  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  const result = tournamentEngine.getPredictiveAccuracy({
    scaleName: 'WTN',
    matchUps,
    drawId,
  });
  expect(result.success).toBe(true);
});

test('getPredictiveAccuracy with hasContext matchUps and eventId filter', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  const result = tournamentEngine.getPredictiveAccuracy({
    scaleName: 'WTN',
    matchUps,
    eventId,
  });
  expect(result.success).toBe(true);
});

test('getPredictiveAccuracy with zonePct', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  // zonePct is a PERCENT of the scale range: WTN spans |40 - 1| = 39, so 20% === a margin of 7.8.
  // Asserting the resolved margin (and the equivalence with the explicit form) rather than only
  // `success`: the previous version passed both before and after a 100x precedence bug, because it
  // never looked at a value.
  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: SINGLES,
    scaleName: 'WTN',
    zonePct: 20,
  });
  expect(result.success).toBe(true);
  expect(result.zoneMargin).toBeCloseTo(7.8, 6);

  const explicit = tournamentEngine.getPredictiveAccuracy({
    matchUpType: SINGLES,
    scaleName: 'WTN',
    zoneMargin: 7.8,
  });
  expect(explicit.zoneMargin).toBeCloseTo(7.8, 6);
  // the percent form and the equivalent absolute form must select the same matchUps
  expect(result.zoneData?.length).toEqual(explicit.zoneData?.length);
  expect(result.nonZone).toEqual(explicit.nonZone);
});

test('getPredictiveAccuracy with exclusionRule', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    exclusionRule: { valueAccessor: 'confidence', range: [0, 50] },
    matchUpType: SINGLES,
    scaleName: 'WTN',
    ascending: true,
    valueAccessor: 'wtnRating',
    zoneMargin: 3,
  });
  expect(result.success).toBe(true);
});

test('getPredictiveAccuracy with bad exclusionRule logs error', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, completionGoal: 7 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    exclusionRule: { valueAccessor: 'confidence' }, // missing range
    matchUpType: SINGLES,
    scaleName: 'WTN',
  });
  expect(result.success).toBe(true);
  // Should have error in accuracy
  expect(result.accuracy.error).toBeDefined();
});

test('getPredictiveAccuracy with empty matchUps array', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const result = tournamentEngine.getPredictiveAccuracy({
    matchUpType: SINGLES,
    scaleName: 'WTN',
    matchUps: [],
  });
  expect(result.success).toBe(true);
  expect(result.relevantMatchUps.length).toBe(0);
});

test('getPredictiveAccuracy with drawId but no drawDefinition returns empty matchUps', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // Get matchUps without context
  const result = tournamentEngine.getPredictiveAccuracy({
    scaleName: 'WTN',
    drawId: 'nonexistent-draw-id',
  });
  expect(result.success).toBe(true);
  expect(result.relevantMatchUps.length).toBe(0);
});
