import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

test('pruneDrawDefinition prunes draw with partially assigned positions and outcomes', () => {
  const drawSize = 16;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        participantsCount: 8,
        automated: false,
        drawSize,
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [mainStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: MAIN,
    stageSequence: 1,
  });

  // Place 8 participants in first 8 positions
  const structureSelectedParticipantIds = drawDefinition.entries
    .filter((entry) => STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus))
    .map(({ participantId }) => participantId);

  structureSelectedParticipantIds.forEach((participantId, index) => {
    const drawPosition = index + 1;
    tournamentEngine.assignDrawPosition({
      structureId: mainStructure.structureId,
      participantId,
      drawPosition,
      drawId,
    });
  });

  // Complete some first round matchUps to create active rounds
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  const firstRoundMatchUps = roundMatchUps?.[1] ?? [];

  // Complete the first few first-round matches that have two participants assigned
  const completableMatchUps = firstRoundMatchUps.filter(
    (m) => m.drawPositions?.length === 2 && m.drawPositions.every(Boolean),
  );

  for (const matchUp of completableMatchUps.slice(0, 2)) {
    const { outcome } = mocksEngine.generateOutcome();
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Verify the draw can be pruned
  const analysisResult = tournamentEngine.analyzeDraws();
  const { drawsAnalysis } = analysisResult;

  // Now prune - this exercises the uncovered block
  const pruneResult = tournamentEngine.pruneDrawDefinition({ drawId });
  expect(pruneResult.success).toEqual(true);

  // If canBePruned, we should get back relevant matchUps
  if (drawsAnalysis.canBePruned.includes(drawId)) {
    expect(pruneResult.matchUps.length).toBeGreaterThan(0);
    // The pruned matchUps should only include active round matchUps
    expect(pruneResult.matchUps.length).toBeLessThan(matchUps.length);
  }
});

test('pruneDrawDefinition with matchPlay draw remaps positions', () => {
  const drawSize = 32;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        participantsCount: 10,
        automated: false,
        drawSize,
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [mainStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: MAIN,
    stageSequence: 1,
  });

  const structureSelectedParticipantIds = drawDefinition.entries
    .filter((entry) => STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus))
    .map(({ participantId }) => participantId);

  // Place participants in sequential positions
  structureSelectedParticipantIds.forEach((participantId, index) => {
    const drawPosition = index + 1;
    tournamentEngine.assignDrawPosition({
      structureId: mainStructure.structureId,
      participantId,
      drawPosition,
      drawId,
    });
  });

  // Complete first round matches to trigger matchPlay detection
  let { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps();
  const { roundMatchUps } = getRoundMatchUps({ matchUps: allMatchUps });
  const firstRoundMatchUps = (roundMatchUps?.[1] ?? []).filter(
    (m) => m.drawPositions?.length === 2 && m.drawPositions.every(Boolean),
  );

  for (const matchUp of firstRoundMatchUps) {
    const { outcome } = mocksEngine.generateOutcome();
    tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
  }

  // Prune with matchPlayDrawPositions: true (default)
  let result = tournamentEngine.pruneDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  // Prune with matchPlayDrawPositions: false
  // Reset state and try again
  const { tournamentRecord } = tournamentEngine.getTournament();
  tournamentEngine.setState(tournamentRecord);

  result = tournamentEngine.pruneDrawDefinition({ drawId, matchPlayDrawPositions: false });
  expect(result.success).toEqual(true);
});
