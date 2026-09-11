import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, describe } from 'vitest';

// constants
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import { SINGLES } from '@Constants/eventConstants';
import { GEM_SCORE } from '@Constants/tallyConstants';
import {
  AD_HOC,
  COMPASS,
  DRAW,
  FEED_IN_CHAMPIONSHIP,
  MAIN,
  PLAY_OFF,
  POSITION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

// =========================================================================
// Helpers
// =========================================================================

/**
 * Generate a tournament with a ROUND_ROBIN_WITH_PLAYOFF draw, complete all RR matchUps,
 * and return the key objects for assertions.
 */
function generateCompletedRRWithPlayoff({
  structureOptions,
  drawSize = 16,
}: {
  structureOptions: any;
  drawSize?: number;
}) {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles: [
      {
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        matchUpFormat: FORMAT_STANDARD,
        participantsCount: drawSize,
        eventType: SINGLES,
        structureOptions,
        drawSize,
      },
    ],
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
  const playoffStructures = drawDefinition.structures.filter((s: any) => s.stage === PLAY_OFF);
  const positioningLinks = drawDefinition.links.filter((l: any) => l.linkType === POSITION);

  return { drawId, drawDefinition, mainStructure, playoffStructures, positioningLinks };
}

/**
 * Collect group finishing positions from the main RR structure.
 * Returns a map: { [groupOrder]: participantId[] }
 */
function getGroupFinishingPositions(mainStructure: any) {
  const finishingPositionGroups: Record<number, string[]> = {};
  const rrGroups = mainStructure?.structures ?? [];

  rrGroups.forEach((group: any) => {
    (group.positionAssignments ?? []).forEach((assignment: any) => {
      const tally = firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY });
      if (tally?.groupOrder && assignment.participantId) {
        if (!finishingPositionGroups[tally.groupOrder]) finishingPositionGroups[tally.groupOrder] = [];
        finishingPositionGroups[tally.groupOrder].push(assignment.participantId);
      }
    });
  });

  return finishingPositionGroups;
}

/**
 * Verify that a playoff structure has the expected participants assigned,
 * based on the POSITION link's finishingPositions and the RR group results.
 */
function verifyPlayoffParticipants({
  finishingPositionGroups,
  positioningLinks,
  drawDefinition,
  structure,
  groupsCount,
}: any) {
  const { positionAssignments } = getPositionAssignments({
    structureId: structure.structureId,
    drawDefinition,
  });
  const assignedParticipants = positionAssignments?.filter((pa: any) => pa.participantId) ?? [];

  const positioningLink = positioningLinks.find((link: any) => link.target.structureId === structure.structureId);

  if (!positioningLink) return { assignedParticipants, positioningLink: undefined };

  const finishingPositions = positioningLink.source.finishingPositions;
  const bestOf = positioningLink.source.bestOf;

  if (bestOf) {
    // With bestOf, the total assigned should equal bestOf count
    expect(assignedParticipants.length).toEqual(bestOf);
  } else {
    // Standard: groupsCount * finishingPositions.length
    const expectedCount = groupsCount * finishingPositions.length;
    expect(assignedParticipants.length).toEqual(expectedCount);
  }

  // All assigned participants should come from the expected finishing position groups
  // (for bestOf, some may come from adjacent positions)
  const playoffParticipantIds = assignedParticipants.map((pa: any) => pa.participantId);
  const expectedFromPositions = new Set(
    finishingPositions.flatMap((pos: number) => finishingPositionGroups[pos] ?? []),
  );

  // At minimum, all participants from the guaranteed positions should be present
  const guaranteedCount = groupsCount * finishingPositions.length;
  const fromGuaranteed = playoffParticipantIds.filter((id: string) => expectedFromPositions.has(id));

  if (bestOf) {
    // For bestOf, at least the guaranteed participants should be present
    expect(fromGuaranteed.length).toBeGreaterThanOrEqual(Math.min(guaranteedCount, bestOf));
  } else {
    expect(fromGuaranteed.length).toEqual(guaranteedCount);
  }

  return { assignedParticipants, positioningLink };
}

// =========================================================================
// SINGLE_ELIMINATION playoff tests
// =========================================================================

describe('RR with SINGLE_ELIMINATION playoffs', () => {
  test('group winners only: finishingPositions [1]', () => {
    const { drawDefinition, mainStructure, playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            structureName: 'Gold',
            drawType: SINGLE_ELIMINATION,
          },
        ],
      },
    });

    expect(playoffStructures.length).toEqual(1);
    expect(playoffStructures[0].structureName).toEqual('Gold');

    // Link should point to finishing position [1]
    expect(positioningLinks.length).toEqual(1);
    expect(positioningLinks[0].source.finishingPositions).toMatchObject([1]);
    expect(positioningLinks[0].target.feedProfile).toEqual(DRAW);

    // 4 groups of 4, position [1] => 4 participants in playoff
    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);
    verifyPlayoffParticipants({
      structure: playoffStructures[0],
      finishingPositionGroups,
      positioningLinks,
      drawDefinition,
      groupsCount: 4,
    });

    // All matchUps should be completed (mocks completes everything)
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.every((m: any) => m.matchUpStatus === COMPLETED)).toEqual(true);
  });

  test('multiple group positions: finishingPositions [1, 2]', () => {
    const { drawDefinition, mainStructure, playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1, 2],
            structureName: 'Championship',
            drawType: SINGLE_ELIMINATION,
          },
        ],
      },
    });

    expect(playoffStructures.length).toEqual(1);
    expect(positioningLinks[0].source.finishingPositions).toMatchObject([1, 2]);

    // 4 groups × 2 positions = 8 participants
    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);
    verifyPlayoffParticipants({
      structure: playoffStructures[0],
      finishingPositionGroups,
      positioningLinks,
      drawDefinition,
      groupsCount: 4,
    });
  });

  test('bestOf: group winners + best 2nd-place finishers', () => {
    const { drawDefinition, mainStructure, playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            bestOf: 6,
            rankBy: GEM_SCORE,
            structureName: 'Championship',
            drawType: SINGLE_ELIMINATION,
          },
        ],
      },
    });

    expect(playoffStructures.length).toEqual(1);
    expect(positioningLinks[0].source.finishingPositions).toMatchObject([1]);
    expect(positioningLinks[0].source.bestOf).toEqual(6);
    expect(positioningLinks[0].source.rankBy).toEqual(GEM_SCORE);

    // 4 group winners + 2 best 2nd-place = 6 participants
    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);
    const { assignedParticipants } = verifyPlayoffParticipants({
      structure: playoffStructures[0],
      finishingPositionGroups,
      positioningLinks,
      drawDefinition,
      groupsCount: 4,
    });

    // Verify all 4 group winners are present
    const groupWinnerIds = finishingPositionGroups[1] ?? [];
    expect(groupWinnerIds.length).toEqual(4);
    const playoffIds = assignedParticipants.map((pa: any) => pa.participantId);
    groupWinnerIds.forEach((id: string) => expect(playoffIds).toContain(id));

    // Exactly 2 from 2nd place
    const secondPlaceIds = finishingPositionGroups[2] ?? [];
    const secondPlaceInPlayoff = secondPlaceIds.filter((id: string) => playoffIds.includes(id));
    expect(secondPlaceInPlayoff.length).toEqual(2);
  });

  test('all positions: finishingPositions [1, 2, 3, 4]', () => {
    const { drawDefinition, mainStructure, playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            structureName: 'Gold',
            drawType: SINGLE_ELIMINATION,
          },
          {
            finishingPositions: [2],
            structureName: 'Silver',
            drawType: SINGLE_ELIMINATION,
          },
          {
            finishingPositions: [3],
            structureName: 'Bronze',
            drawType: SINGLE_ELIMINATION,
          },
          {
            finishingPositions: [4],
            structureName: 'Green',
            drawType: SINGLE_ELIMINATION,
          },
        ],
      },
    });

    expect(playoffStructures.length).toEqual(4);
    expect(positioningLinks.length).toEqual(4);

    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);

    playoffStructures.forEach((structure: any) => {
      verifyPlayoffParticipants({
        finishingPositionGroups,
        positioningLinks,
        drawDefinition,
        groupsCount: 4,
        structure,
      });
    });

    // All 16 participants should be accounted for across all playoff structures
    const allPlayoffIds = playoffStructures.flatMap((s: any) => {
      const { positionAssignments } = getPositionAssignments({
        structureId: s.structureId,
        drawDefinition,
      });
      return (positionAssignments ?? []).filter((pa: any) => pa.participantId).map((pa: any) => pa.participantId);
    });
    const uniqueIds = new Set(allPlayoffIds);
    expect(uniqueIds.size).toEqual(16);
  });
});

// =========================================================================
// AD_HOC playoff tests
// =========================================================================

describe('RR with AD_HOC playoffs', () => {
  test('group winners only: finishingPositions [1] with drawMatic', () => {
    // AD_HOC structures have no draw positions — participants go directly to drawMatic.
    // We verify the link, get group winners from the tally, and feed them to drawMatic.
    const drawId = 'adhoc-test-1';
    const structureOptions = {
      groupSize: 4,
      playoffGroups: [
        {
          finishingPositions: [1],
          structureName: 'Ad Hoc Playoff',
          drawType: AD_HOC,
        },
      ],
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 16,
          eventType: SINGLES,
          structureOptions,
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const playoffStructure = drawDefinition.structures.find((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructure).toBeDefined();
    expect(playoffStructure.structureName).toEqual('Ad Hoc Playoff');

    // Verify POSITION link
    const positionLink = drawDefinition.links.find(
      (l: any) => l.linkType === POSITION && l.target.structureId === playoffStructure.structureId,
    );
    expect(positionLink).toBeDefined();
    expect(positionLink.source.finishingPositions).toMatchObject([1]);

    // Get group winners from tally
    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);
    const groupWinnerIds = finishingPositionGroups[1] ?? [];
    expect(groupWinnerIds.length).toEqual(4);

    // drawMatic generates rounds for AD_HOC
    const drawMaticResult = tournamentEngine.drawMatic({
      structureId: playoffStructure.structureId,
      participantIds: groupWinnerIds,
      roundsCount: 1,
      drawId,
    });

    expect(drawMaticResult.matchUps).toBeDefined();
    expect(drawMaticResult.matchUps.length).toEqual(2); // 4 participants => 2 matchUps
  });

  test('multiple group positions: finishingPositions [1, 2] with drawMatic', () => {
    const drawId = 'adhoc-test-2';
    const structureOptions = {
      groupSize: 4,
      playoffGroups: [
        {
          finishingPositions: [1, 2],
          structureName: 'Ad Hoc Top Half',
          drawType: AD_HOC,
        },
      ],
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 16,
          eventType: SINGLES,
          structureOptions,
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const playoffStructure = drawDefinition.structures.find((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructure).toBeDefined();

    const positionLink = drawDefinition.links.find(
      (l: any) => l.linkType === POSITION && l.target.structureId === playoffStructure.structureId,
    );
    expect(positionLink.source.finishingPositions).toMatchObject([1, 2]);

    // Get participants from positions 1 and 2
    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);
    const participantIds = [...(finishingPositionGroups[1] ?? []), ...(finishingPositionGroups[2] ?? [])];
    expect(participantIds.length).toEqual(8); // 4 groups × 2 positions

    const drawMaticResult = tournamentEngine.drawMatic({
      structureId: playoffStructure.structureId,
      participantIds,
      roundsCount: 1,
      drawId,
    });

    expect(drawMaticResult.matchUps).toBeDefined();
    expect(drawMaticResult.matchUps.length).toEqual(4); // 8 participants => 4 matchUps
  });

  test('all positions: finishingPositions [1, 2, 3, 4] with drawMatic', () => {
    const drawId = 'adhoc-test-all';
    const structureOptions = {
      groupSize: 4,
      playoffGroups: [
        {
          finishingPositions: [1, 2, 3, 4],
          structureName: 'Everyone Playoff',
          drawType: AD_HOC,
        },
      ],
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 16,
          eventType: SINGLES,
          structureOptions,
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const playoffStructure = drawDefinition.structures.find((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructure).toBeDefined();

    // Get all participants from all positions
    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);
    const participantIds = [1, 2, 3, 4].flatMap((pos) => finishingPositionGroups[pos] ?? []);
    expect(participantIds.length).toEqual(16);

    const drawMaticResult = tournamentEngine.drawMatic({
      structureId: playoffStructure.structureId,
      participantIds,
      roundsCount: 1,
      drawId,
    });

    expect(drawMaticResult.matchUps).toBeDefined();
    expect(drawMaticResult.matchUps.length).toEqual(8); // 16 participants => 8 matchUps
  });
});

// =========================================================================
// ROUND_ROBIN playoff tests
// =========================================================================

describe('RR with ROUND_ROBIN playoffs', () => {
  test('group winners only: finishingPositions [1]', () => {
    const { playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            structureName: 'RR Playoff',
            drawType: ROUND_ROBIN,
            structureOptions: { groupSize: 4 },
          },
        ],
      },
    });

    // RR playoff creates a container structure with sub-structures
    expect(playoffStructures.length).toBeGreaterThanOrEqual(1);

    // Find the playoff container (it's the one at PLAY_OFF stage)
    const playoffContainer = playoffStructures.find((s: any) => s.structureName === 'RR Playoff');
    expect(playoffContainer).toBeDefined();

    // Verify POSITION link
    expect(positioningLinks.length).toBeGreaterThanOrEqual(1);
    const link = positioningLinks.find((l: any) => l.target.structureId === playoffContainer.structureId);
    expect(link).toBeDefined();
    expect(link.source.finishingPositions).toMatchObject([1]);
  });

  test('multiple group positions: finishingPositions [1, 2]', () => {
    const { playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1, 2],
            structureName: 'RR Championship',
            drawType: ROUND_ROBIN,
            structureOptions: { groupSize: 4 },
          },
        ],
      },
    });

    const playoffContainer = playoffStructures.find((s: any) => s.structureName === 'RR Championship');
    expect(playoffContainer).toBeDefined();

    const link = positioningLinks.find((l: any) => l.target.structureId === playoffContainer.structureId);
    expect(link).toBeDefined();
    expect(link.source.finishingPositions).toMatchObject([1, 2]);
  });
});

// =========================================================================
// FEED_IN_CHAMPIONSHIP playoff tests
// =========================================================================

describe('RR with FEED_IN_CHAMPIONSHIP playoffs', () => {
  test('group winners only: finishingPositions [1]', () => {
    // FIC generates a main elimination structure (stage: PLAY_OFF) + consolation (stage: CONSOLATION).
    // With 4 groups of 4, position [1] yields 4 participants => drawSize 4.
    // The consolation is created when drawSize > 2.
    const { drawDefinition, playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            structureName: 'FIC Playoff',
            drawType: FEED_IN_CHAMPIONSHIP,
          },
        ],
      },
    });

    // playoffStructures only includes stage === PLAY_OFF; consolation has stage === CONSOLATION
    expect(playoffStructures.length).toBeGreaterThanOrEqual(1);

    // The FIC main playoff structure
    const ficMain = playoffStructures.find((s: any) => s.structureName === 'FIC Playoff');
    expect(ficMain).toBeDefined();

    // FIC consolation has stage: CONSOLATION, so count non-MAIN structures
    const nonMainStructures = drawDefinition.structures.filter((s: any) => s.stage !== MAIN);
    // With drawSize 4 (>2), we get main FIC + consolation = 2 non-MAIN structures
    expect(nonMainStructures.length).toBeGreaterThanOrEqual(2);

    // There should be a POSITION link from the RR main to the FIC
    const posLink = positioningLinks.find((l: any) => l.target.structureId === ficMain.structureId);
    expect(posLink).toBeDefined();
    expect(posLink.source.finishingPositions).toMatchObject([1]);
    expect(posLink.target.feedProfile).toEqual(DRAW);

    // Verify participants are positioned (4 group winners from 4 groups)
    const { positionAssignments } = getPositionAssignments({
      structureId: ficMain.structureId,
      drawDefinition,
    });
    const assignedParticipants = positionAssignments?.filter((pa: any) => pa.participantId) ?? [];
    expect(assignedParticipants.length).toEqual(4);
  });

  test('multiple group positions: finishingPositions [1, 2]', () => {
    const { playoffStructures, positioningLinks, drawDefinition } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1, 2],
            structureName: 'FIC Championship',
            drawType: FEED_IN_CHAMPIONSHIP,
          },
        ],
      },
    });

    const ficMain = playoffStructures.find((s: any) => s.structureName === 'FIC Championship');
    expect(ficMain).toBeDefined();

    const posLink = positioningLinks.find((l: any) => l.target.structureId === ficMain.structureId);
    expect(posLink.source.finishingPositions).toMatchObject([1, 2]);

    // 4 groups × 2 = 8 participants
    const { positionAssignments } = getPositionAssignments({
      structureId: ficMain.structureId,
      drawDefinition,
    });
    const assignedParticipants = positionAssignments?.filter((pa: any) => pa.participantId) ?? [];
    expect(assignedParticipants.length).toEqual(8);
  });

  test('all positions: finishingPositions [1, 2, 3, 4] — each FIC generates structures', () => {
    const { playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            structureName: 'Gold FIC',
            drawType: FEED_IN_CHAMPIONSHIP,
          },
          {
            finishingPositions: [2],
            structureName: 'Silver FIC',
            drawType: FEED_IN_CHAMPIONSHIP,
          },
          {
            finishingPositions: [3],
            structureName: 'Bronze FIC',
            drawType: FEED_IN_CHAMPIONSHIP,
          },
          {
            finishingPositions: [4],
            structureName: 'Green FIC',
            drawType: FEED_IN_CHAMPIONSHIP,
          },
        ],
      },
    });

    // Each FIC with 4 participants (drawSize 4) generates at least 1 structure;
    // total playoff structures depend on draw size thresholds
    expect(playoffStructures.length).toBeGreaterThanOrEqual(4);
    expect(positioningLinks.length).toEqual(4);

    // Verify each POSITION link targets a different structure
    const targetIds = new Set(positioningLinks.map((l: any) => l.target.structureId));
    expect(targetIds.size).toEqual(4);

    // Each position link should have the correct finishing positions
    positioningLinks.forEach((link: any) => {
      expect(link.source.finishingPositions.length).toEqual(1);
    });
  });
});

// =========================================================================
// COMPASS playoff tests
// =========================================================================

describe('RR with COMPASS playoffs', () => {
  test('group winners only: finishingPositions [1] — uses 32 draw for full compass', () => {
    // COMPASS needs drawSize >= 8 for the full N/S/E/W structure set.
    // Use 32 draw (8 groups of 4) so position [1] yields 8 participants.
    const { playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      drawSize: 32,
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            structureName: 'Compass Playoff',
            drawType: COMPASS,
          },
        ],
      },
    });

    // COMPASS with 8 participants generates multiple structures (N, S, E, W, etc.)
    expect(playoffStructures.length).toBeGreaterThanOrEqual(4);

    // Find the main compass structure via the POSITION link
    expect(positioningLinks.length).toBeGreaterThanOrEqual(1);
    const posLink = positioningLinks.find((l: any) => l.source.finishingPositions?.includes(1));
    expect(posLink).toBeDefined();
    expect(posLink.source.finishingPositions).toMatchObject([1]);
    expect(posLink.target.feedProfile).toEqual(DRAW);
  });

  test('multiple group positions: finishingPositions [1, 2]', () => {
    // 4 groups × 2 = 8 participants, enough for full COMPASS
    const { playoffStructures, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1, 2],
            structureName: 'Compass Championship',
            drawType: COMPASS,
          },
        ],
      },
    });

    expect(playoffStructures.length).toBeGreaterThanOrEqual(4);

    const posLink = positioningLinks.find((l: any) => l.source.finishingPositions?.length === 2);
    expect(posLink).toBeDefined();
    expect(posLink.source.finishingPositions).toMatchObject([1, 2]);
  });
});

// =========================================================================
// Mixed playoff types: combining different draw types in the same event
// =========================================================================

describe('Mixed playoff draw types', () => {
  test('SE for 1st, AD_HOC for 2nd, ROUND_ROBIN for 3rd, FIC for 4th', () => {
    const drawId = 'mixed-playoffs';
    const structureOptions = {
      groupSize: 4,
      playoffGroups: [
        {
          finishingPositions: [1],
          structureName: 'Gold SE',
          drawType: SINGLE_ELIMINATION,
        },
        {
          finishingPositions: [2],
          structureName: 'Silver Ad Hoc',
          drawType: AD_HOC,
        },
        {
          finishingPositions: [3],
          structureName: 'Bronze RR',
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
        },
        {
          finishingPositions: [4],
          structureName: 'Green FIC',
          drawType: FEED_IN_CHAMPIONSHIP,
        },
      ],
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 16,
          eventType: SINGLES,
          structureOptions,
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const positioningLinks = drawDefinition.links.filter((l: any) => l.linkType === POSITION);

    // Should have 4 POSITION links
    expect(positioningLinks.length).toEqual(4);

    // Each link should target a different structure with correct finishing positions
    const finishingPositionsSets = positioningLinks.map((l: any) => l.source.finishingPositions);
    expect(finishingPositionsSets).toContainEqual([1]);
    expect(finishingPositionsSets).toContainEqual([2]);
    expect(finishingPositionsSets).toContainEqual([3]);
    expect(finishingPositionsSets).toContainEqual([4]);

    // Find the Gold SE structure and verify it has correct participants
    const goldLink = positioningLinks.find((l: any) => l.source.finishingPositions[0] === 1);
    const goldStructure = drawDefinition.structures.find((s: any) => s.structureId === goldLink.target.structureId);
    expect(goldStructure).toBeDefined();

    const goldAssignments = getPositionAssignments({
      structureId: goldStructure.structureId,
      drawDefinition,
    }).positionAssignments;
    const goldParticipants = goldAssignments?.filter((pa: any) => pa.participantId) ?? [];
    expect(goldParticipants.length).toEqual(4);
  });

  test('COMPASS for top half, SE for bottom half', () => {
    const { drawDefinition, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1, 2],
            structureName: 'Top Compass',
            drawType: COMPASS,
          },
          {
            finishingPositions: [3, 4],
            structureName: 'Bottom SE',
            drawType: SINGLE_ELIMINATION,
          },
        ],
      },
    });

    expect(positioningLinks.length).toEqual(2);

    // Compass link
    const compassLink = positioningLinks.find(
      (l: any) => l.source.finishingPositions.includes(1) && l.source.finishingPositions.includes(2),
    );
    expect(compassLink).toBeDefined();

    // SE link
    const seLink = positioningLinks.find(
      (l: any) => l.source.finishingPositions.includes(3) && l.source.finishingPositions.includes(4),
    );
    expect(seLink).toBeDefined();

    // Bottom SE should have 8 participants (4 groups × 2 positions)
    const bottomStructure = drawDefinition.structures.find((s: any) => s.structureId === seLink.target.structureId);
    const { positionAssignments } = getPositionAssignments({
      structureId: bottomStructure.structureId,
      drawDefinition,
    });
    const assigned = positionAssignments?.filter((pa: any) => pa.participantId) ?? [];
    expect(assigned.length).toEqual(8);
  });
});

// =========================================================================
// generateAndPopulatePlayoffStructures — post-hoc playoff creation
// =========================================================================

describe('Post-hoc playoff creation with generateAndPopulatePlayoffStructures', () => {
  test('add SE playoff to completed ROUND_ROBIN draw', () => {
    const drawId = 'posthoc-se';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 16,
          eventType: SINGLES,
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures.find((s: any) => s.stage === MAIN).structureId;

    // Generate playoff for position [1] winners
    const result = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [
        {
          finishingPositions: [1],
          structureName: 'Championship',
          drawType: SINGLE_ELIMINATION,
        },
      ],
      structureId: mainStructureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structures.length).toBeGreaterThanOrEqual(1);

    // Verify participants are populated
    const playoffStructure = result.structures[0];
    const assignedParticipants = playoffStructure.positionAssignments.filter((pa: any) => pa.participantId);
    expect(assignedParticipants.length).toEqual(4);

    // Attach the structures
    const attachResult = tournamentEngine.attachPlayoffStructures({
      matchUpModifications: result.matchUpModifications,
      structures: result.structures,
      links: result.links,
      drawId,
    });
    expect(attachResult.success).toEqual(true);

    // Verify final draw has the playoff
    const { drawDefinition: finalDraw } = tournamentEngine.getEvent({ drawId });
    const playoffStructures = finalDraw.structures.filter((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toBeGreaterThanOrEqual(1);
  });

  test('add COMPASS playoff post-hoc — uses 32 draw for full compass', () => {
    // COMPASS needs drawSize >= 8; use 32 draw (8 groups) so position [1] yields 8 participants
    const drawId = 'posthoc-compass';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 32,
          eventType: SINGLES,
          drawSize: 32,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures.find((s: any) => s.stage === MAIN).structureId;

    const result = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [
        {
          finishingPositions: [1],
          drawType: COMPASS,
        },
      ],
      structureId: mainStructureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // COMPASS with 8 participants generates multiple structures
    expect(result.structures.length).toBeGreaterThanOrEqual(4);

    const attachResult = tournamentEngine.attachPlayoffStructures({
      matchUpModifications: result.matchUpModifications,
      structures: result.structures,
      links: result.links,
      drawId,
    });
    expect(attachResult.success).toEqual(true);
  });

  test('add FIC playoff post-hoc', () => {
    const drawId = 'posthoc-fic';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 16,
          eventType: SINGLES,
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures.find((s: any) => s.stage === MAIN).structureId;

    const result = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [
        {
          finishingPositions: [1],
          structureName: 'FIC Playoff',
          drawType: FEED_IN_CHAMPIONSHIP,
        },
      ],
      structureId: mainStructureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // FIC generates main + consolation
    expect(result.structures.length).toBeGreaterThanOrEqual(2);

    const attachResult = tournamentEngine.attachPlayoffStructures({
      matchUpModifications: result.matchUpModifications,
      structures: result.structures,
      links: result.links,
      drawId,
    });
    expect(attachResult.success).toEqual(true);
  });

  test('add AD_HOC playoff post-hoc with drawMatic', () => {
    const drawId = 'posthoc-adhoc';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
          matchUpFormat: FORMAT_STANDARD,
          participantsCount: 16,
          eventType: SINGLES,
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const mainStructureId = mainStructure.structureId;

    const result = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [
        {
          finishingPositions: [1],
          structureName: 'Ad Hoc Playoff',
          drawType: AD_HOC,
        },
      ],
      structureId: mainStructureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const attachResult = tournamentEngine.attachPlayoffStructures({
      matchUpModifications: result.matchUpModifications,
      structures: result.structures,
      links: result.links,
      drawId,
    });
    expect(attachResult.success).toEqual(true);

    // AD_HOC structures have no draw positions, so automatedPlayoffPositioning
    // won't place participants. Instead, get group winners from the tally
    // and use drawMatic directly.
    const { drawDefinition: updatedDraw } = tournamentEngine.getEvent({ drawId });
    const updatedMain = updatedDraw.structures.find((s: any) => s.stage === MAIN);
    const finishingPositionGroups = getGroupFinishingPositions(updatedMain);
    const groupWinnerIds = finishingPositionGroups[1] ?? [];
    expect(groupWinnerIds.length).toEqual(4);

    const adHocStructure = updatedDraw.structures.find(
      (s: any) => s.stage === PLAY_OFF && s.structureName === 'Ad Hoc Playoff',
    );
    expect(adHocStructure).toBeDefined();

    // Use drawMatic to generate matchUps
    const drawMaticResult = tournamentEngine.drawMatic({
      structureId: adHocStructure.structureId,
      participantIds: groupWinnerIds,
      roundsCount: 1,
      drawId,
    });
    expect(drawMaticResult.matchUps).toBeDefined();
    expect(drawMaticResult.matchUps.length).toEqual(2); // 4 participants => 2 matchUps
  });
});

// =========================================================================
// automatedPlayoffPositioning verification
// =========================================================================

describe('automatedPlayoffPositioning correctness', () => {
  test('generateAndPopulatePlayoffStructures returns pre-populated structures', () => {
    // generateAndPopulatePlayoffStructures both generates AND populates in one call.
    // After attaching, the structures already have participants assigned.
    const drawId = 'auto-pos-test';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN,
          structureOptions: { groupSize: 4 },
          drawSize: 16,
          drawId,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures.find((s: any) => s.stage === MAIN).structureId;

    // Generate and populate playoff structures for positions 1, 2, and 3
    const genResult = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffGroups: [
        { finishingPositions: [1], structureName: 'Gold', drawType: SINGLE_ELIMINATION },
        { finishingPositions: [2], structureName: 'Silver', drawType: SINGLE_ELIMINATION },
        { finishingPositions: [3], structureName: 'Bronze', drawType: SINGLE_ELIMINATION },
      ],
      structureId: mainStructureId,
      drawId,
    });
    expect(genResult.success).toEqual(true);
    expect(genResult.structures.length).toEqual(3);

    // Each generated structure should already have 4 participants populated
    genResult.structures.forEach((structure: any) => {
      const assigned = structure.positionAssignments.filter((pa: any) => pa.participantId);
      expect(assigned.length).toEqual(4);
    });

    // No overlap between structures
    const allIds = genResult.structures.flatMap((s: any) =>
      s.positionAssignments.filter((pa: any) => pa.participantId).map((pa: any) => pa.participantId),
    );
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toEqual(12); // 3 structures × 4 participants

    // Attach the structures
    const attachResult = tournamentEngine.attachPlayoffStructures({
      matchUpModifications: genResult.matchUpModifications,
      structures: genResult.structures,
      links: genResult.links,
      drawId,
    });
    expect(attachResult.success).toEqual(true);

    // After attaching, verify the draw has the playoff structures
    const { drawDefinition: finalDraw } = tournamentEngine.getEvent({ drawId });
    const playoffStructures = finalDraw.structures.filter((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toEqual(3);
  });

  test('bestOf playoff positions correct number of participants', () => {
    const { drawDefinition, mainStructure, playoffStructures } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          {
            finishingPositions: [1],
            bestOf: 6,
            rankBy: GEM_SCORE,
            structureName: 'Championship',
          },
        ],
      },
    });

    const { positionAssignments } = getPositionAssignments({
      structureId: playoffStructures[0].structureId,
      drawDefinition,
    });
    const assignedParticipants = positionAssignments?.filter((pa: any) => pa.participantId) ?? [];

    // bestOf: 6 means exactly 6 participants should be positioned
    expect(assignedParticipants.length).toEqual(6);

    // 4 should be group winners, 2 should be best 2nd-place finishers
    const finishingPositionGroups = getGroupFinishingPositions(mainStructure);
    const groupWinnerIds = finishingPositionGroups[1] ?? [];
    const secondPlaceIds = finishingPositionGroups[2] ?? [];

    const playoffIds = new Set(assignedParticipants.map((pa: any) => pa.participantId));
    const winnersInPlayoff = groupWinnerIds.filter((id: string) => playoffIds.has(id));
    const secondInPlayoff = secondPlaceIds.filter((id: string) => playoffIds.has(id));

    expect(winnersInPlayoff.length).toEqual(4);
    expect(secondInPlayoff.length).toEqual(2);
  });
});

// =========================================================================
// Edge cases and structure verification
// =========================================================================

describe('Structure and link verification', () => {
  test('all POSITION links source from the MAIN RR structure', () => {
    const { mainStructure, positioningLinks } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          { finishingPositions: [1], structureName: 'Gold', drawType: SINGLE_ELIMINATION },
          { finishingPositions: [2], structureName: 'Silver', drawType: FEED_IN_CHAMPIONSHIP },
          { finishingPositions: [3], structureName: 'Bronze', drawType: COMPASS },
        ],
      },
    });

    positioningLinks.forEach((link: any) => {
      expect(link.source.structureId).toEqual(mainStructure.structureId);
      expect(link.linkType).toEqual(POSITION);
      expect(link.target.roundNumber).toEqual(1);
      expect(link.target.feedProfile).toEqual(DRAW);
    });
  });

  test('no participant appears in multiple playoff structures', () => {
    const { drawDefinition, playoffStructures } = generateCompletedRRWithPlayoff({
      structureOptions: {
        groupSize: 4,
        playoffGroups: [
          { finishingPositions: [1], structureName: 'Gold', drawType: SINGLE_ELIMINATION },
          { finishingPositions: [2], structureName: 'Silver', drawType: SINGLE_ELIMINATION },
          { finishingPositions: [3], structureName: 'Bronze', drawType: SINGLE_ELIMINATION },
          { finishingPositions: [4], structureName: 'Green', drawType: SINGLE_ELIMINATION },
        ],
      },
    });

    const allPlayoffParticipantIds: string[] = [];
    playoffStructures.forEach((structure: any) => {
      const { positionAssignments } = getPositionAssignments({
        structureId: structure.structureId,
        drawDefinition,
      });
      const participantIds = (positionAssignments ?? [])
        .filter((pa: any) => pa.participantId)
        .map((pa: any) => pa.participantId);
      allPlayoffParticipantIds.push(...participantIds);
    });

    const uniqueIds = new Set(allPlayoffParticipantIds);
    expect(uniqueIds.size).toEqual(allPlayoffParticipantIds.length);
    expect(uniqueIds.size).toEqual(16);
  });
});
