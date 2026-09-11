import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// Constants
import { CONTAINER, MAIN, ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { HydratedParticipant } from '@Types/hydrated';
import { TALLY } from '@Constants/extensionConstants';

test('single RR group (drawSize 4), all matchUps complete: exact finishing positions', () => {
  const drawSize = 4;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: ROUND_ROBIN }],
    completeAllMatchUps: true,
    randomWinningSide: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const { participantMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  const hydratedParticipants: HydratedParticipant[] = Object.values(participantMap);
  const drawParticipants = hydratedParticipants.filter((p) => p.draws[drawId]);

  // Each participant in a single RR bracket should have an exact finishing position [n, n]
  for (const participant of drawParticipants) {
    const { finishingPositionRange } = participant.draws[drawId];
    expect(finishingPositionRange).toBeDefined();
    expect(finishingPositionRange[0]).toEqual(finishingPositionRange[1]);
    expect(finishingPositionRange[0]).toBeGreaterThanOrEqual(1);
    expect(finishingPositionRange[0]).toBeLessThanOrEqual(drawSize);
  }

  // All positions 1 through drawSize should be represented
  const positions = drawParticipants.map((p) => p.draws[drawId].finishingPositionRange[0]).sort((a, b) => a - b);
  expect(positions).toEqual([1, 2, 3, 4]);
});

test('multiple RR groups (drawSize 16), all matchUps complete, no playoff: bounded by bracketsCount', () => {
  const drawSize = 16;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: ROUND_ROBIN }],
    completeAllMatchUps: true,
    randomWinningSide: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const { participantMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  const hydratedParticipants: HydratedParticipant[] = Object.values(participantMap);
  const drawParticipants = hydratedParticipants.filter((p) => p.draws[drawId]);

  expect(drawParticipants.length).toEqual(drawSize);

  // With 4 groups of 4, each participant should have a range bounded by bracketsCount
  for (const participant of drawParticipants) {
    const { finishingPositionRange } = participant.draws[drawId];
    expect(finishingPositionRange).toBeDefined();
    // Range should NOT be [1, drawSize] (that's the bug we're fixing)
    const rangeSpan = Math.abs(finishingPositionRange[1] - finishingPositionRange[0]);
    expect(rangeSpan).toBeLessThan(drawSize - 1);
    // For multiple brackets without playoff, range should be [1, bracketsCount]
    expect(finishingPositionRange).toEqual([1, 4]);
  }
});

test('ROUND_ROBIN_WITH_PLAYOFF, all matchUps complete: advancing vs non-advancing ranges', () => {
  const drawSize = 16;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: ROUND_ROBIN_WITH_PLAYOFF }],
    completeAllMatchUps: true,
    randomWinningSide: true,
  });

  tournamentEngine.setState(tournamentRecord);

  const { participantMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  const hydratedParticipants: HydratedParticipant[] = Object.values(participantMap);
  const drawParticipants = hydratedParticipants.filter((p) => p.draws[drawId]);

  expect(drawParticipants.length).toEqual(drawSize);

  // In an RR with playoff, participants should NOT all have [1, drawSize]
  const allHaveFullRange = drawParticipants.every((p) => {
    const range = p.draws[drawId].finishingPositionRange;
    return range[0] === 1 && range[1] === drawSize;
  });
  expect(allHaveFullRange).toBe(false);

  // Verify all participants have defined finishing positions
  for (const participant of drawParticipants) {
    const { finishingPositionRange } = participant.draws[drawId];
    expect(finishingPositionRange).toBeDefined();
    expect(finishingPositionRange[0]).toBeGreaterThanOrEqual(1);
    expect(finishingPositionRange[1]).toBeLessThanOrEqual(drawSize);
  }
});

test('partially complete RR bracket: provisionalOrder is used', () => {
  const drawSize = 4;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: ROUND_ROBIN }],
    // Don't complete all matchUps - leave some incomplete
  });

  tournamentEngine.setState(tournamentRecord);

  // Complete only the first matchUp
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstMatchUp = matchUps[0];
  tournamentEngine.setMatchUpStatus({
    matchUpId: firstMatchUp.matchUpId,
    outcome: { winningSide: 1 },
    drawId,
  });

  const { participantMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  const hydratedParticipants: HydratedParticipant[] = Object.values(participantMap);
  const drawParticipants = hydratedParticipants.filter((p) => p.draws[drawId]);

  // With partial completion, participants involved in the completed matchUp get
  // tally-derived exact [n, n] positions, while others keep their default range.
  const participantsWithRange = drawParticipants.filter((p) => p.draws[drawId].finishingPositionRange);
  expect(participantsWithRange.length).toBeGreaterThan(0);

  // At least some participants should have exact positions from provisionalOrder
  const exactPositions = participantsWithRange.filter((p) => {
    const range = p.draws[drawId].finishingPositionRange;
    return range[0] === range[1];
  });
  expect(exactPositions.length).toBeGreaterThan(0);

  for (const participant of participantsWithRange) {
    const { finishingPositionRange } = participant.draws[drawId];
    expect(finishingPositionRange[0]).toBeGreaterThanOrEqual(1);
    expect(finishingPositionRange[1]).toBeLessThanOrEqual(drawSize);
  }
});

test('consistency: getParticipantIdFinishingPositions and getParticipants produce matching results', () => {
  const drawSize = 4;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: ROUND_ROBIN }],
    completeAllMatchUps: true,
    randomWinningSide: true,
  });

  tournamentEngine.setState(tournamentRecord);

  // Get finishing positions via the existing method
  const finishingPositions = tournamentEngine.getParticipantIdFinishingPositions({ drawId });

  // Get finishing positions via getParticipants with ranking profile
  const { participantMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  // Compare results for each participant
  for (const [participantId, fpData] of Object.entries(finishingPositions) as [string, any][]) {
    if (!fpData.finishingPositionRange) continue;
    const drawData = participantMap[participantId]?.draws?.[drawId];
    if (!drawData?.finishingPositionRange) continue;

    expect(drawData.finishingPositionRange).toEqual(fpData.finishingPositionRange);
  }
});

// Helper: generates a 32-draw ROUND_ROBIN_WITH_PLAYOFF and manually applies outcomes
// including DOUBLE_WALKOVER/DOUBLE_DEFAULT in specific groups to create ties.
// 32 players → 8 groups of 4 → 6 matchUps per group → 48 RR matchUps total.
// Group 1: drawPositions [1,2,3,4], Group 2: [5,6,7,8], etc.
function generateRRWithPlayoffAndDoubleExits() {
  // Generate the tournament without completing matchUps
  const drawSize = 32;
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType: ROUND_ROBIN_WITH_PLAYOFF }],
  });

  tournamentEngine.setState(tournamentRecord);

  // Get all RR matchUps (MAIN stage, no roundPosition = RR group matchUps)
  const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [MAIN] },
  });

  // Only get group matchUps (those with containerStructureId)
  const groupMatchUps = allMatchUps.filter((m) => m.containerStructureId);

  // Organize by group (by sorted drawPositions pair's first element range)
  // Groups: [1-4], [5-8], [9-12], [13-16], [17-20], [21-24], [25-28], [29-32]
  const getGroupIndex = (matchUp) => Math.floor((Math.min(...matchUp.drawPositions) - 1) / 4);

  const groups: any[][] = Array.from({ length: 8 }, () => []);
  for (const matchUp of groupMatchUps) {
    const groupIdx = getGroupIndex(matchUp);
    groups[groupIdx].push(matchUp);
  }

  // Complete groups 3-8 normally with side 1 winning (no ties)
  for (let g = 2; g < 8; g++) {
    for (const matchUp of groups[g]) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: 1 },
        drawId,
      });
    }
  }

  // Group 1 (drawPositions 1-4): Create a DOUBLE_WALKOVER between positions 1 & 2,
  // then complete other matchUps normally. This means positions 1 & 2 each get
  // one cancelled matchUp, potentially creating a tie.
  // 6 matchUps: [1v2, 1v3, 1v4, 2v3, 2v4, 3v4]
  const g1 = groups[0];
  for (const matchUp of g1) {
    const [dp1, dp2] = matchUp.drawPositions;
    if (dp1 === 1 && dp2 === 2) {
      // DOUBLE_WALKOVER: no winner
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        drawId,
      });
    } else {
      // All other pairings: winningSide 1
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: 1 },
        drawId,
      });
    }
  }
  // Results in Group 1: pos1 beats 3,4 (2 wins, 0 losses + 1 cancelled)
  //                      pos2 beats 3,4 (2 wins, 0 losses + 1 cancelled)
  //                      pos3 loses to all (0 wins, 3 losses)
  //                      pos4 loses to all (0 wins, 3 losses)
  // → pos1 and pos2 are TIED at 2 wins each

  // Group 2 (drawPositions 5-8): Create a DOUBLE_DEFAULT between positions 5 & 6
  const g2 = groups[1];
  for (const matchUp of g2) {
    const [dp1, dp2] = matchUp.drawPositions;
    if (dp1 === 5 && dp2 === 6) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { matchUpStatus: DOUBLE_DEFAULT },
        drawId,
      });
    } else {
      // All other pairings: winningSide 1
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: 1 },
        drawId,
      });
    }
  }
  // Results in Group 2: pos5 beats 7,8 (2 wins + 1 cancelled) — TIED with pos6
  //                      pos6 beats 7,8 (2 wins + 1 cancelled) — TIED with pos5

  return { drawId, drawSize, groups };
}

test('RR_WITH_PLAYOFF drawSize 32 with DOUBLE_WALKOVER/DOUBLE_DEFAULT ties: without subOrder', () => {
  const { drawId, drawSize } = generateRRWithPlayoffAndDoubleExits();

  // Get the draw structure to inspect tally results
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(
    (s) => s.structureType === CONTAINER && s.stage === MAIN && s.stageSequence === 1,
  );
  const group1Structure = mainStructure.structures[0];
  const { positionAssignments: g1Assignments } = getPositionAssignments({
    structure: group1Structure,
  });

  // Verify ties exist in group 1 tally results
  const tallyResults = g1Assignments
    ?.map((a) => {
      const tally = firstClassOrExtension({ element: a, attribute: 'tally', name: TALLY });
      return { drawPosition: a.drawPosition, tally };
    })
    .filter((r) => r.tally);

  // The top two participants (drawPositions 1 & 2) should be tied
  const tiedParticipants = tallyResults?.filter((r) => r.tally?.ties);
  expect(tiedParticipants?.length).toBeGreaterThanOrEqual(2);

  // Now check finishing positions from getParticipants
  const { participantMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  const hydratedParticipants: HydratedParticipant[] = Object.values(participantMap);
  const drawParticipants = hydratedParticipants.filter((p) => p.draws[drawId]);
  expect(drawParticipants.length).toEqual(drawSize);

  // All participants should have finishing positions (not the old [1, drawSize] default)
  for (const participant of drawParticipants) {
    const { finishingPositionRange } = participant.draws[drawId];
    expect(finishingPositionRange).toBeDefined();
    expect(finishingPositionRange[0]).toBeGreaterThanOrEqual(1);
    expect(finishingPositionRange[1]).toBeLessThanOrEqual(drawSize);
  }

  // Tied participants (with same groupOrder) should have the same finishing position range
  // since their ties are unresolved without subOrder
  const group1ParticipantIds = g1Assignments?.filter((a) => a.participantId).map((a) => a.participantId) as string[];

  const group1Ranges = group1ParticipantIds.map((pid) => ({
    participantId: pid,
    range: participantMap[pid]?.draws[drawId]?.finishingPositionRange,
  }));

  // The tied participants (top 2 in group 1) should share the same range
  // since they have the same groupOrder without subOrder
  const tiedRanges = group1Ranges.filter((r) => {
    const tally = tallyResults?.find(
      (t) => g1Assignments?.find((a) => a.drawPosition === t.drawPosition)?.participantId === r.participantId,
    )?.tally;
    return tally?.ties;
  });

  if (tiedRanges.length >= 2) {
    // All tied participants should have equal ranges
    const firstRange = tiedRanges[0].range;
    for (const tied of tiedRanges) {
      expect(tied.range).toEqual(firstRange);
    }
  }
});

test('RR_WITH_PLAYOFF drawSize 32 with ties resolved by subOrder', () => {
  const { drawId, drawSize } = generateRRWithPlayoffAndDoubleExits();

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(
    (s) => s.structureType === CONTAINER && s.stage === MAIN && s.stageSequence === 1,
  );

  // Get group 1 structure and its tied participants
  const group1Structure = mainStructure.structures[0];
  const structureId = group1Structure.structureId;
  const { positionAssignments: g1Assignments } = getPositionAssignments({
    structure: group1Structure,
  });

  // Find tied participants by checking tally extensions
  const tiedDrawPositions =
    g1Assignments
      ?.map((a) => {
        const tally = firstClassOrExtension({ element: a, attribute: 'tally', name: TALLY });
        return { drawPosition: a.drawPosition, participantId: a.participantId, tally };
      })
      .filter((r) => r.tally?.ties)
      .map((r) => r.drawPosition) || [];

  expect(tiedDrawPositions.length).toBeGreaterThanOrEqual(2);

  // Get finishing positions BEFORE subOrder
  tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  // Set subOrder to resolve ties in group 1 — assign unique subOrders to tied positions
  for (let i = 0; i < tiedDrawPositions.length; i++) {
    const result = tournamentEngine.setSubOrder({
      drawPosition: tiedDrawPositions[i],
      subOrder: i + 1,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Get finishing positions AFTER subOrder
  const { participantMap: afterMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  // Verify that the tied participants now have distinct groupOrders
  const group1ParticipantIds = g1Assignments
    ?.filter((a) => tiedDrawPositions.includes(a.drawPosition))
    .map((a) => a.participantId) as string[];

  // After subOrder, tied participants should have differentiated finishing positions
  const afterRanges = group1ParticipantIds.map((pid) => afterMap[pid]?.draws[drawId]?.finishingPositionRange);

  // The ranges should not all be identical (subOrder should differentiate them)
  const allSame = afterRanges.every((r) => r?.[0] === afterRanges[0]?.[0] && r?.[1] === afterRanges[0]?.[1]);
  expect(allSame).toBe(false);

  // Also verify group 2 (DOUBLE_DEFAULT) tied participants
  const group2Structure = mainStructure.structures[1];
  const structureId2 = group2Structure.structureId;
  const { positionAssignments: g2Assignments } = getPositionAssignments({
    structure: group2Structure,
  });

  const g2TiedDrawPositions =
    g2Assignments
      ?.map((a) => {
        const tally = firstClassOrExtension({ element: a, attribute: 'tally', name: TALLY });
        return { drawPosition: a.drawPosition, participantId: a.participantId, tally };
      })
      .filter((r) => r.tally?.ties)
      .map((r) => r.drawPosition) || [];

  // Resolve group 2 ties with subOrder
  for (let i = 0; i < g2TiedDrawPositions.length; i++) {
    const result = tournamentEngine.setSubOrder({
      drawPosition: g2TiedDrawPositions[i],
      subOrder: i + 1,
      structureId: structureId2,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Verify group 2 ranges are now differentiated
  const { participantMap: finalMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });

  const g2ParticipantIds = g2Assignments
    ?.filter((a) => g2TiedDrawPositions.includes(a.drawPosition))
    .map((a) => a.participantId) as string[];

  const g2AfterRanges = g2ParticipantIds.map((pid) => finalMap[pid]?.draws[drawId]?.finishingPositionRange);

  if (g2AfterRanges.length >= 2) {
    const g2AllSame = g2AfterRanges.every((r) => r?.[0] === g2AfterRanges[0]?.[0] && r?.[1] === g2AfterRanges[0]?.[1]);
    expect(g2AllSame).toBe(false);
  }

  // Verify all participants still have valid ranges
  const hydratedParticipants: HydratedParticipant[] = Object.values(finalMap);
  const drawParticipants = hydratedParticipants.filter((p) => p.draws[drawId]);
  for (const participant of drawParticipants) {
    const { finishingPositionRange } = participant.draws[drawId];
    expect(finishingPositionRange).toBeDefined();
    expect(finishingPositionRange[0]).toBeGreaterThanOrEqual(1);
    expect(finishingPositionRange[1]).toBeLessThanOrEqual(drawSize);
  }
});
