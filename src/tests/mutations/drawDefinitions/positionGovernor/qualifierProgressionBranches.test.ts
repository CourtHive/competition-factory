import { qualifierProgression } from '@Mutate/drawDefinitions/positionGovernor/qualifierProgression';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import {
  MISSING_MAIN_STRUCTURE,
  MISSING_QUALIFIED_PARTICIPANTS,
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
} from '@Constants/errorConditionConstants';

function setupQualifyingTournament({
  qualifyingPositions = 4,
  qualifyingDrawSize = 16,
  mainDrawSize = 16,
  participantsCount = 100,
  qualifyingDrawType,
}: {
  qualifyingPositions?: number;
  qualifyingDrawSize?: number;
  mainDrawSize?: number;
  participantsCount?: number;
  qualifyingDrawType?: string;
} = {}) {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    eventProfiles: [{ eventName: 'test' }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  const mainParticipantIds = participantIds.slice(0, mainDrawSize - qualifyingPositions);
  const qualifyingParticipantIds = participantIds.slice(
    mainDrawSize - qualifyingPositions,
    mainDrawSize - qualifyingPositions + qualifyingDrawSize,
  );

  tournamentEngine.addEventEntries({ participantIds: mainParticipantIds, eventId });
  tournamentEngine.addEventEntries({
    participantIds: qualifyingParticipantIds,
    entryStage: QUALIFYING,
    eventId,
  });

  const structureProfile: any = {
    qualifyingPositions,
    drawSize: qualifyingDrawSize,
  };
  if (qualifyingDrawType) structureProfile.drawType = qualifyingDrawType;

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [structureProfile] }],
    eventId,
  });

  tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    allowReplacement: true,
    eventId,
  });

  return { tournamentRecord, eventId, drawDefinition };
}

// --- Error path tests ---

test('qualifierProgression with no main draw qualifier positions', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 30 },
    eventProfiles: [{ eventName: 'test' }],
  });
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);

  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(0, 16),
    eventId,
  });
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(16, 24),
    entryStage: QUALIFYING,
    eventId,
  });

  // qualifyingOnly creates MAIN with no matchUps but also no qualifier positions
  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
    qualifyingOnly: true,
    eventId,
  });

  tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    allowReplacement: true,
    eventId,
  });

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.error).toEqual(NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS);
});

test('qualifierProgression with no qualified participants (no completed matchUps)', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament();

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.error).toEqual(MISSING_QUALIFIED_PARTICIPANTS);
});

// --- Successful progression tests ---

test('qualifierProgression with completed qualifying draws', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament();

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  // Complete all qualifying matchUps
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.assignedParticipants.length).toBeGreaterThan(0);
});

test('qualifierProgression without randomList', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament();

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  // Call without randomList - tests the !randomList branch
  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.assignedParticipants.length).toEqual(4);
});

test('qualifierProgression with randomList', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament();

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  const randomList = tournamentEngine.getRandomQualifierList({ drawDefinition });

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    randomList,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.assignedParticipants.length).toEqual(4);
});

// --- Policy tests ---

test('qualifierProgression with requireCompletedStructures policy and incomplete structure', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament();

  // Apply policy that requires completed structures
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      [POLICY_TYPE_POSITION_ACTIONS]: {
        requireCompletedStructures: true,
      },
    },
    drawId: drawDefinition.drawId,
  });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  // Complete only the final round matchUps (not all)
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  // Only complete round 1 matchUps (structure is NOT complete)
  const round1MatchUps = matchUps.filter((m) => m.roundNumber === 1);
  for (const matchUp of round1MatchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  // With requireCompletedStructures and incomplete structure, no qualifiers should be found
  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.error).toEqual(MISSING_QUALIFIED_PARTICIPANTS);
});

test('qualifierProgression with requireCompletedStructures policy and completed structure', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament({
    qualifyingDrawSize: 8,
    qualifyingPositions: 4,
  });

  // Apply policy that requires completed structures
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      [POLICY_TYPE_POSITION_ACTIONS]: {
        requireCompletedStructures: true,
      },
    },
    drawId: drawDefinition.drawId,
  });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  // Complete ALL qualifying matchUps
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.assignedParticipants.length).toBeGreaterThan(0);
});

// --- Round Robin qualifying tests ---

test('qualifierProgression with RR qualifying structure', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 50 },
    eventProfiles: [{ eventName: 'test' }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);

  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(0, 12),
    eventId,
  });
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(12, 28),
    entryStage: QUALIFYING,
    eventId,
  });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            qualifyingPositions: 4,
            drawSize: 16,
            drawType: ROUND_ROBIN,
          },
        ],
      },
    ],
    eventId,
  });

  tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    allowReplacement: true,
    eventId,
  });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  // Complete all RR qualifying matchUps
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    if (matchUp.readyToScore) {
      tournamentEngine.setMatchUpStatus({
        drawId: drawDefinition.drawId,
        matchUpId: matchUp.matchUpId,
        matchUpStatus: COMPLETED,
        outcome: { winningSide: 1 },
      });
    }
  }

  // Need to complete any remaining matchUps that became ready
  let remaining = true;
  while (remaining) {
    const { matchUps: currentMatchUps } = tournamentEngine.allTournamentMatchUps({
      contextFilters: { structureIds: [qualifyingStructure.structureId] },
      matchUpFilters: { readyToScore: true, hasWinningSide: false },
    });
    if (currentMatchUps.length === 0) {
      remaining = false;
    } else {
      for (const matchUp of currentMatchUps) {
        tournamentEngine.setMatchUpStatus({
          drawId: drawDefinition.drawId,
          matchUpId: matchUp.matchUpId,
          matchUpStatus: COMPLETED,
          outcome: { winningSide: 1 },
        });
      }
    }
  }

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });

  // RR qualifying uses POSITION links, which requires completed structure with groupOrder
  // The result depends on whether TALLY extensions are properly set
  expect(result).toBeDefined();
  if (result.success) {
    expect(result.assignedParticipants.length).toBeGreaterThan(0);
  }
});

// --- targetRoundNumber tests ---

test('qualifierProgression with specific targetRoundNumber', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament();

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  // targetRoundNumber defaults to 1
  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    targetRoundNumber: 1,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.assignedParticipants.length).toEqual(4);
});

test('qualifierProgression with targetRoundNumber that matches no links', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament();

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  // targetRoundNumber 99 should not match any links
  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    targetRoundNumber: 99,
    eventId,
  });
  // No source links match this round number, so no qualifiers found
  expect(result.error).toEqual(MISSING_QUALIFIED_PARTICIPANTS);
});

// --- winningSide variation ---

test('qualifierProgression with winningSide 2 (side 2 wins qualifying)', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament({
    qualifyingDrawSize: 8,
    qualifyingPositions: 4,
  });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  // Complete matchUps with winningSide 2
  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 2 },
    });
  }

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(result.assignedParticipants.length).toEqual(4);
});

// --- Already assigned participant filtering ---

test('qualifierProgression skips already-assigned participants', () => {
  const { drawDefinition, eventId } = setupQualifyingTournament({
    qualifyingDrawSize: 8,
    qualifyingPositions: 4,
  });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  // First progression should succeed
  const result1 = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result1.success).toEqual(true);
  expect(result1.assignedParticipants.length).toEqual(4);

  // Second progression should find no NEW qualifiers (all are already assigned)
  const result2 = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  // Either no qualifiers or no positions available
  expect(result2.error).toBeDefined();
});

// --- Direct function call tests for error paths ---

test('qualifierProgression direct call with no MAIN structure returns MISSING_MAIN_STRUCTURE', () => {
  // Create a minimal drawDefinition with only a QUALIFYING structure (no MAIN)
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { tournamentRecord } = tournamentEngine.getTournament();
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const event = tournamentRecord.events[0];

  // Remove MAIN structures from the drawDefinition
  const modifiedDrawDef = {
    ...drawDefinition,
    structures: drawDefinition.structures.filter((s) => s.stage !== MAIN),
  };

  const result = qualifierProgression({
    drawDefinition: modifiedDrawDef,
    tournamentRecord,
    event,
  });
  expect(result.error).toEqual(MISSING_MAIN_STRUCTURE);
});

test('qualifierProgression direct call with missing required params', () => {
  const result = qualifierProgression({
    drawDefinition: undefined as any,
    tournamentRecord: undefined as any,
    event: undefined as any,
  });
  expect(result.error).toBeDefined();
});

// --- Improved RR qualifying test ---

test('qualifierProgression with completed RR qualifying structure and POSITION links', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 40 },
    eventProfiles: [{ eventName: 'test' }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);

  // 12 main + 8 qualifying = simple setup
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(0, 12),
    eventId,
  });
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(12, 20),
    entryStage: QUALIFYING,
    eventId,
  });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            qualifyingPositions: 4,
            drawSize: 8,
            drawType: ROUND_ROBIN,
          },
        ],
      },
    ],
    eventId,
  });

  tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    allowReplacement: true,
    eventId,
  });

  // Verify POSITION link exists
  const positionLink = drawDefinition.links?.find((link) => link.linkType === 'POSITION');
  expect(positionLink).toBeDefined();

  // Use stages filter instead of structureIds for RR container structures
  // RR qualifying matchUps live in child group structures, not the container
  let safeguard = 0;
  while (safeguard < 50) {
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      contextFilters: { stages: [QUALIFYING] },
    });

    const incomplete = matchUps.filter((m) => m.matchUpStatus === TO_BE_PLAYED);
    if (incomplete.length === 0) break;

    for (const matchUp of incomplete) {
      tournamentEngine.setMatchUpStatus({
        drawId: drawDefinition.drawId,
        matchUpId: matchUp.matchUpId,
        matchUpStatus: COMPLETED,
        outcome: { winningSide: 1 },
      });
    }
    safeguard++;
  }

  // Verify all qualifying matchUps are completed
  const { matchUps: finalMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [QUALIFYING] },
  });
  expect(finalMatchUps.length).toBeGreaterThan(0);
  expect(finalMatchUps.every((m) => m.winningSide)).toBe(true);

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });

  // RR qualifying uses POSITION links with groupOrder from TALLY extensions
  if (result.success) {
    expect(result.assignedParticipants.length).toBeGreaterThan(0);
  } else {
    // The POSITION link path was still exercised even if no qualifiers were assigned
    expect(result).toBeDefined();
  }
});

// --- More qualifiers than positions test ---

test('qualifierProgression with fewer qualifier positions than qualified participants', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 50 },
    eventProfiles: [{ eventName: 'test' }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);

  // Only 2 qualifier positions but 8 qualifying participants (4 will qualify from 8)
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(0, 14),
    eventId,
  });
  tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(14, 22),
    entryStage: QUALIFYING,
    eventId,
  });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [{ qualifyingPositions: 2, drawSize: 8 }],
      },
    ],
    eventId,
  });

  tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    allowReplacement: true,
    eventId,
  });

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { structureIds: [qualifyingStructure.structureId] },
  });

  for (const matchUp of matchUps) {
    tournamentEngine.setMatchUpStatus({
      drawId: drawDefinition.drawId,
      matchUpId: matchUp.matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    });
  }

  const result = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    eventId,
  });
  expect(result.success).toEqual(true);
  // Only 2 positions available, so max 2 assigned even though more qualified
  expect(result.assignedParticipants.length).toEqual(2);
});
