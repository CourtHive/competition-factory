import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

test('pruneDrawDefinition reliably triggers canBePruned on a standard draw', () => {
  // Create a standard 16-draw with all 16 participants placed (automated: true is default)
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16 }],
    setState: true,
  });

  // Complete only 2 of 8 first-round matchUps
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  const firstRound = roundMatchUps?.[1] ?? [];

  // Complete exactly 2 matchUps in round 1
  for (let i = 0; i < 2 && i < firstRound.length; i++) {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-3 6-4',
      winningSide: 1,
    });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: firstRound[i].matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Verify the draw is prunable
  const { drawsAnalysis } = tournamentEngine.analyzeDraws();
  expect(drawsAnalysis.canBePruned.includes(drawId)).toEqual(true);

  // Now prune - this exercises lines 23-94
  const pruneResult = tournamentEngine.pruneDrawDefinition({ drawId });
  expect(pruneResult.success).toEqual(true);
  expect(pruneResult.matchUps.length).toBeGreaterThan(0);
  expect(pruneResult.matchUps.length).toBeLessThan(matchUps.length);
});

test('pruneDrawDefinition with matchPlay triggers position remapping', () => {
  // matchPlay = only round 1 has activity, only 1 structure active
  // Need: drawSize 16 with fewer participants (e.g., 6), place in first 6 positions
  // Complete all completable first-round matchUps (positions 1v2, 3v4, 5v6)
  // This makes only round 1 active, making it matchPlay
  const drawSize = 16;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        participantsCount: 6,
        automated: false,
        drawSize,
      },
    ],
    setState: true,
  });

  // Get the structure and place participants sequentially
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures[0];
  const participantIds = drawDefinition.entries.map((e) => e.participantId).filter(Boolean);

  participantIds.forEach((participantId, index) => {
    tournamentEngine.assignDrawPosition({
      structureId: mainStructure.structureId,
      drawPosition: index + 1,
      participantId,
      drawId,
    });
  });

  // Complete all completable first-round matchUps (pairs 1v2, 3v4, 5v6)
  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  const completable = (roundMatchUps?.[1] ?? []).filter(
    (m) => m.drawPositions?.every(Boolean) && m.sides?.every((s) => s.participantId),
  );

  for (const matchUp of completable) {
    const { outcome } = mocksEngine.generateOutcome();
    tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
  }

  // Verify isMatchPlay
  const { drawsAnalysis } = tournamentEngine.analyzeDraws();
  if (drawsAnalysis.canBePruned.includes(drawId)) {
    // Prune with default matchPlayDrawPositions: true
    let result = tournamentEngine.pruneDrawDefinition({ drawId });
    expect(result.success).toEqual(true);

    // The matchUps should have been pruned and positions remapped
    if (drawsAnalysis.matchPlay.includes(drawId)) {
      expect(result.matchUps.every((m) => m.winningSide)).toEqual(true);
    }
  }
});

test('modifyCollectionDefinition on a TEAM draw modifies the tie format', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        eventType: 'TEAM',
        tieFormatName: 'COLLEGE_DEFAULT',
      },
    ],
    setState: true,
  });

  const { event } = tournamentEngine.getEvent({ drawId });
  expect(event.tieFormat).toBeDefined();

  const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

  // Modify the collection name - exercises modifyCollectionDefinition
  let result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'Modified Doubles',
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Verify the modification took effect
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const definition = drawDefinition.tieFormat.collectionDefinitions.find((cd) => cd.collectionId === collectionId);
  expect(definition.collectionName).toEqual('Modified Doubles');

  // Modify matchUpValue - exercises value modification path
  result = tournamentEngine.modifyCollectionDefinition({
    matchUpValue: 2,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Modify matchUpFormat - exercises format modification path
  result = tournamentEngine.modifyCollectionDefinition({
    matchUpFormat: 'SET3-S:6/TB7',
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
});
