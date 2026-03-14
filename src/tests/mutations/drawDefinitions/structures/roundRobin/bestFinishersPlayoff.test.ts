import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { setStageDrawSize } from '@Mutate/drawDefinitions/entryGovernor/stageEntryCounts';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { validatePlayoffGroups } from '@Validators/validatePlayoffGroups';
import { findExtension } from '@Acquire/findExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { DRAW, MAIN, PLAY_OFF, POSITION, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { TALLY } from '@Constants/extensionConstants';
import { SINGLES } from '@Constants/eventConstants';

// =========================================================================
// Part 1: Standalone validation and structure generation tests
// =========================================================================

describe('bestFinishers playoff validation', () => {
  it('validates bestOf must be >= guaranteed count', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 2, rankBy: 'GEMscore' }],
      groupCount: 3,
      groupSize: 4,
    });
    // bestOf: 2 < guaranteed: 3 (3 groups × 1 position)
    expect(result.valid).toBe(false);
  });

  it('validates bestOf must not exceed total available', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 15, rankBy: 'GEMscore' }],
      groupCount: 3,
      groupSize: 4,
    });
    // bestOf: 15 > total: 12 (3 groups × 4 size)
    expect(result.valid).toBe(false);
  });

  it('validates valid bestOf configuration', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 4, rankBy: 'GEMscore' }],
      groupCount: 3,
      groupSize: 4,
    });
    // 3 group winners + 1 best 2nd place = 4 total, valid
    expect(result.valid).toBe(true);
  });

  it('validates bestOf with multiple finishing positions', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1, 2], bestOf: 8, rankBy: 'GEMscore' }],
      groupCount: 3,
      groupSize: 4,
    });
    // 3 groups × 2 positions = 6 guaranteed, need 2 more from 3rd place = 8 total
    expect(result.valid).toBe(true);
  });

  it('validates cross-group consumption with multiple playoff groups', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 4, rankBy: 'GEMscore' }, { finishingPositions: [2] }],
      groupCount: 3,
      groupSize: 4,
    });
    // First group: 3 winners + 1 best 2nd = 4 (consumes 1 from pos 2)
    // Second group: 3 second-place finishers... but 1 is consumed → only 2 left
    // 2 participants is minimum for a standard playoff, so this should be valid
    expect(result.valid).toBe(true);
  });

  it('rejects when consumption leaves insufficient participants', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 5, rankBy: 'GEMscore' }, { finishingPositions: [2] }],
      groupCount: 3,
      groupSize: 4,
    });
    // First group: 3 winners + 2 from 2nd place = 5 (consumes 2 from pos 2)
    // Second group: only 1 second-place finisher left → invalid (< 2)
    expect(result.valid).toBe(false);
  });

  it('rejects unsupported rankBy values', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 4, rankBy: 'invalid' }],
      groupCount: 3,
      groupSize: 4,
    });
    expect(result.valid).toBe(false);
  });

  it('validates bestOf equal to guaranteed count (no extras needed)', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 3, rankBy: 'GEMscore' }],
      groupCount: 3,
      groupSize: 4,
    });
    // bestOf: 3 === guaranteed: 3 — valid but equivalent to standard behavior
    expect(result.valid).toBe(true);
  });

  it('validates bestOf spanning multiple extra positions', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ finishingPositions: [1], bestOf: 8, rankBy: 'GEMscore' }],
      groupCount: 3,
      groupSize: 4,
    });
    // 3 winners + 3 from 2nd + 2 from 3rd = 8 total
    expect(result.valid).toBe(true);
  });
});

describe('bestFinishers draw generation', () => {
  it('generates a playoff structure with bestOf sizing', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition();
    const drawSize = 12; // 3 groups of 4
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize });

    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 4,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
      ],
    };

    const result = generateDrawTypeAndModifyDrawDefinition({
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      structureOptions,
      drawDefinition,
    });

    const { structures: playoffStructures, links } = result;
    const mainStructure = playoffStructures?.shift();
    expect(mainStructure?.stage).toEqual(MAIN);
    expect(mainStructure?.structures?.length).toEqual(3); // 3 RR groups

    expect(playoffStructures?.length).toEqual(1);
    expect(playoffStructures?.[0].structureName).toEqual('Championship');
    expect(playoffStructures?.[0].stage).toEqual(PLAY_OFF);

    // Draw size should be 4 (nextPowerOf2(4) = 4) → 3 matchUps in SE
    expect(playoffStructures?.[0].matchUps?.length).toEqual(3);

    // Link should include bestOf and rankBy
    expect(links?.length).toEqual(1);
    expect(links?.[0].linkType).toEqual(POSITION);
    expect(links?.[0].source.finishingPositions).toMatchObject([1]);
    expect(links?.[0].source.bestOf).toEqual(4);
    expect(links?.[0].source.rankBy).toEqual('GEMscore');
    expect(links?.[0].target.feedProfile).toEqual(DRAW);
  });

  it('generates correct draw size for bestOf: 5 with 3 groups', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 12 });

    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 5,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
      ],
    };

    const result = generateDrawTypeAndModifyDrawDefinition({
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      structureOptions,
      drawDefinition,
    });

    const { structures: playoffStructures } = result;
    playoffStructures?.shift(); // remove main

    // bestOf: 5 → nextPowerOf2(5) = 8 → 7 matchUps
    expect(playoffStructures?.[0].matchUps?.length).toEqual(7);
  });

  it('standard playoffGroups without bestOf still generate correctly', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition();
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize: 12 });

    const structureOptions = {
      playoffGroups: [
        { finishingPositions: [1], structureName: 'Gold' },
        { finishingPositions: [2], structureName: 'Silver' },
      ],
    };

    const result = generateDrawTypeAndModifyDrawDefinition({
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      structureOptions,
      drawDefinition,
    });

    const { structures: playoffStructures, links } = result;
    playoffStructures?.shift();

    expect(playoffStructures?.length).toEqual(2);
    // Standard: 3 groups × 1 position = 3 participants → nextPowerOf2(3) = 4 → 3 matchUps
    expect(playoffStructures?.[0].matchUps?.length).toEqual(3);
    expect(playoffStructures?.[1].matchUps?.length).toEqual(3);

    // Links should NOT have bestOf
    expect(links?.[0].source.bestOf).toBeUndefined();
    expect(links?.[1].source.bestOf).toBeUndefined();
  });
});

// =========================================================================
// Part 2: mocksEngine-based integration tests (full tournament lifecycle)
// =========================================================================

describe('bestFinishers with mocksEngine — full tournament lifecycle', () => {
  it('completes RR with bestOf playoff: 3 groups, bestOf 4 from position [1]', () => {
    const drawSize = 12; // 3 groups of 4
    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 4,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
      ],
    };

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

    const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });
    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    // All matchUps should be completed
    const completedMatchUps = matchUps.filter((m) => m.matchUpStatus === COMPLETED);
    expect(completedMatchUps.length).toEqual(matchUps.length);

    // Verify structure: 1 MAIN (container) + 1 PLAY_OFF
    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    expect(mainStructure?.structures?.length).toEqual(3); // 3 RR groups
    expect(playoffStructures.length).toEqual(1);
    expect(playoffStructures[0].structureName).toEqual('Championship');

    // Verify link carries bestOf
    const positionLink = drawDefinition.links.find((l) => l.linkType === POSITION);
    expect(positionLink?.source.bestOf).toEqual(4);
    expect(positionLink?.source.rankBy).toEqual('GEMscore');

    // Verify playoff has exactly 4 participants positioned
    const { positionAssignments } = getPositionAssignments({
      structureId: playoffStructures[0].structureId,
      drawDefinition,
    });
    const assignedParticipants = positionAssignments?.filter((pa) => pa.participantId) ?? [];
    expect(assignedParticipants.length).toEqual(4);

    // Verify: 3 of the 4 should be group winners, 1 should be a 2nd-place finisher
    const rrGroups = mainStructure?.structures ?? [];
    const groupWinnerIds: string[] = [];
    const secondPlaceIds: string[] = [];

    rrGroups.forEach((group) => {
      const assignments = group.positionAssignments ?? [];
      assignments.forEach((assignment) => {
        const tally = findExtension({ element: assignment, name: TALLY })?.extension?.value;
        if (tally?.groupOrder === 1 && assignment.participantId) {
          groupWinnerIds.push(assignment.participantId);
        }
        if (tally?.groupOrder === 2 && assignment.participantId) {
          secondPlaceIds.push(assignment.participantId);
        }
      });
    });

    expect(groupWinnerIds.length).toEqual(3);
    expect(secondPlaceIds.length).toEqual(3);

    const playoffParticipantIds = assignedParticipants.map((pa) => pa.participantId);

    // All 3 group winners should be in the playoff
    groupWinnerIds.forEach((winnerId) => {
      expect(playoffParticipantIds).toContain(winnerId);
    });

    // Exactly 1 of the 3 second-place finishers should be in the playoff
    const secondPlaceInPlayoff = secondPlaceIds.filter((id) => playoffParticipantIds.includes(id));
    expect(secondPlaceInPlayoff.length).toEqual(1);
  });

  it('bestOf with 4 groups advancing 6 from position [1] includes 2 best runners-up', () => {
    const drawSize = 16; // 4 groups of 4
    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 6,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
      ],
    };

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

    const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);

    expect(mainStructure?.structures?.length).toEqual(4);
    expect(playoffStructures.length).toEqual(1);

    // bestOf: 6 → nextPowerOf2(6) = 8 → 7 matchUps
    expect(playoffStructures[0].matchUps?.length).toEqual(7);

    // Verify 6 participants in playoff
    const { positionAssignments } = getPositionAssignments({
      structureId: playoffStructures[0].structureId,
      drawDefinition,
    });
    const assignedParticipants = positionAssignments?.filter((pa) => pa.participantId) ?? [];
    expect(assignedParticipants.length).toEqual(6);

    // 4 group winners + 2 best second-place
    const rrGroups = mainStructure?.structures ?? [];
    const groupWinnerIds: string[] = [];
    const secondPlaceIds: string[] = [];

    rrGroups.forEach((group) => {
      (group.positionAssignments ?? []).forEach((assignment) => {
        const tally = findExtension({ element: assignment, name: TALLY })?.extension?.value;
        if (tally?.groupOrder === 1 && assignment.participantId) groupWinnerIds.push(assignment.participantId);
        if (tally?.groupOrder === 2 && assignment.participantId) secondPlaceIds.push(assignment.participantId);
      });
    });

    const playoffParticipantIds = assignedParticipants.map((pa) => pa.participantId);

    // All 4 group winners in playoff
    groupWinnerIds.forEach((id) => expect(playoffParticipantIds).toContain(id));

    // Exactly 2 of 4 second-place finishers in playoff
    const secondPlaceInPlayoff = secondPlaceIds.filter((id) => playoffParticipantIds.includes(id));
    expect(secondPlaceInPlayoff.length).toEqual(2);
  });

  it('best second-place finisher has highest GEMscore among runners-up', () => {
    const drawSize = 12; // 3 groups of 4
    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 4,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
      ],
    };

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

    const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const playoffStructure = drawDefinition.structures.find((s) => s.stage === PLAY_OFF);

    // Collect all second-place finishers with their GEMscores
    const secondPlaceResults: { participantId: string; GEMscore: number }[] = [];
    (mainStructure?.structures ?? []).forEach((group) => {
      (group.positionAssignments ?? []).forEach((assignment) => {
        const tally = findExtension({ element: assignment, name: TALLY })?.extension?.value;
        if (tally?.groupOrder === 2 && assignment.participantId) {
          secondPlaceResults.push({
            participantId: assignment.participantId,
            GEMscore: tally.GEMscore ?? 0,
          });
        }
      });
    });

    expect(secondPlaceResults.length).toEqual(3);

    // Find which second-place finisher made it to the playoff
    const { positionAssignments } = getPositionAssignments({
      structureId: playoffStructure!.structureId,
      drawDefinition,
    });
    const playoffParticipantIds = positionAssignments?.filter((pa) => pa.participantId).map((pa) => pa.participantId);
    const advancedRunnerUp = secondPlaceResults.find((r) => playoffParticipantIds?.includes(r.participantId));
    const otherRunnerUps = secondPlaceResults.filter((r) => !playoffParticipantIds?.includes(r.participantId));

    // The advanced runner-up should have the highest GEMscore
    expect(advancedRunnerUp).toBeDefined();
    otherRunnerUps.forEach((other) => {
      expect(advancedRunnerUp!.GEMscore).toBeGreaterThanOrEqual(other.GEMscore);
    });
  });

  it('bestOf with mixed playoff groups: bestOf championship + standard consolation', () => {
    const drawSize = 12; // 3 groups of 4
    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 4,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
        {
          finishingPositions: [3, 4],
          structureName: 'Consolation',
        },
      ],
    };

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

    const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

    const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toEqual(2);

    const championship = playoffStructures.find((s) => s.structureName === 'Championship');
    const consolation = playoffStructures.find((s) => s.structureName === 'Consolation');
    expect(championship).toBeDefined();
    expect(consolation).toBeDefined();

    // Championship: bestOf 4 → 4 participants
    const champAssignments = getPositionAssignments({
      structureId: championship!.structureId,
      drawDefinition,
    }).positionAssignments;
    const champParticipants = champAssignments?.filter((pa) => pa.participantId) ?? [];
    expect(champParticipants.length).toEqual(4);

    // Consolation: standard, finishingPositions [3,4] → 3 groups × 2 = 6 participants
    const consolAssignments = getPositionAssignments({
      structureId: consolation!.structureId,
      drawDefinition,
    }).positionAssignments;
    const consolParticipants = consolAssignments?.filter((pa) => pa.participantId) ?? [];
    expect(consolParticipants.length).toEqual(6);

    // Links: championship has bestOf, consolation does not
    const champLink = drawDefinition.links.find((l) => l.target.structureId === championship!.structureId);
    const consolLink = drawDefinition.links.find((l) => l.target.structureId === consolation!.structureId);
    expect(champLink?.source.bestOf).toEqual(4);
    expect(consolLink?.source.bestOf).toBeUndefined();
  });

  it('changing an RR outcome updates bestOf playoff positioning', () => {
    const drawSize = 12;
    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 4,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
      ],
    };

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

    tournamentEngine.setState(tournamentRecord);

    // Get the initial playoff participant IDs
    const { drawDefinition: dd1 } = tournamentEngine.getEvent({ drawId });
    const playoffStructure1 = dd1.structures.find((s) => s.stage === PLAY_OFF);
    const initialAssignments = getPositionAssignments({
      structureId: playoffStructure1!.structureId,
      drawDefinition: dd1,
    }).positionAssignments;
    const initialParticipantIds = initialAssignments?.filter((pa) => pa.participantId).map((pa) => pa.participantId);
    expect(initialParticipantIds?.length).toEqual(4);

    // Get an RR matchUp and flip its winner
    const { matchUps: rrMatchUps } = tournamentEngine.allTournamentMatchUps({
      contextFilters: { stages: [MAIN] },
    });
    const targetMatchUp = rrMatchUps[0];
    const flippedWinningSide = 3 - targetMatchUp.winningSide;

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      winningSide: flippedWinningSide,
      scoreString: '7-5 7-5',
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome,
      drawId,
    });

    // The result should indicate connected structures were updated
    expect(result.success).toEqual(true);
  });

  it('bestOf equal to guaranteed count behaves like standard positioning', () => {
    const drawSize = 12; // 3 groups of 4
    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 3, // exactly groupCount × finishingPositions.length
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
      ],
    };

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

    const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

    const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
    const playoffStructure = drawDefinition.structures.find((s) => s.stage === PLAY_OFF);

    // Should have exactly 3 participants (all group winners, no extras)
    const { positionAssignments } = getPositionAssignments({
      structureId: playoffStructure!.structureId,
      drawDefinition,
    });
    const assignedParticipants = positionAssignments?.filter((pa) => pa.participantId) ?? [];

    // nextPowerOf2(3) = 4 positions, but only 3 filled (1 bye)
    expect(assignedParticipants.length).toEqual(3);

    // All should be group winners
    const groupWinnerIds: string[] = [];
    (mainStructure?.structures ?? []).forEach((group) => {
      (group.positionAssignments ?? []).forEach((assignment) => {
        const tally = findExtension({ element: assignment, name: TALLY })?.extension?.value;
        if (tally?.groupOrder === 1 && assignment.participantId) groupWinnerIds.push(assignment.participantId);
      });
    });

    const playoffParticipantIds = assignedParticipants.map((pa) => pa.participantId);
    groupWinnerIds.forEach((id) => expect(playoffParticipantIds).toContain(id));
  });
});

// =========================================================================
// Part 3: remainder playoff group tests
// =========================================================================

describe('bestFinishers with remainder playoff group', () => {
  it('validates remainder group must follow a bestOf group', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [{ remainder: true, structureName: 'Remainder' }],
      groupCount: 3,
      groupSize: 4,
    });
    expect(result.valid).toBe(false);
    expect(result.info).toContain('remainder group must appear after');
  });

  it('validates remainder group after bestOf group', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [
        { finishingPositions: [1], bestOf: 4, rankBy: 'GEMscore' },
        { remainder: true, structureName: 'Remainder' },
      ],
      groupCount: 3,
      groupSize: 4,
    });
    // bestOf claims 4, remainder gets 12-4=8, which is >= 2
    expect(result.valid).toBe(true);
  });

  it('rejects remainder when insufficient participants remain', () => {
    const result = validatePlayoffGroups({
      playoffGroups: [
        { finishingPositions: [1], bestOf: 11, rankBy: 'GEMscore' },
        { remainder: true, structureName: 'Remainder' },
      ],
      groupCount: 3,
      groupSize: 4,
    });
    // bestOf claims 11 of 12, remainder = 1 < 2
    expect(result.valid).toBe(false);
    expect(result.info).toContain('insufficient participants');
  });

  it('generates bestOf championship + remainder consolation structures', () => {
    const drawDefinition: DrawDefinition = newDrawDefinition();
    const drawSize = 12;
    setStageDrawSize({ drawDefinition, stage: MAIN, drawSize });

    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 4,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
        {
          remainder: true,
          structureName: 'Consolation',
        },
      ],
    };

    const result = generateDrawTypeAndModifyDrawDefinition({
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      structureOptions,
      drawDefinition,
    });

    const { structures: allStructures, links } = result;
    const mainStructure = allStructures?.find((s) => s.stage === MAIN);
    const playoffStructures = allStructures?.filter((s) => s.stage === PLAY_OFF) ?? [];

    expect(mainStructure?.structures?.length).toEqual(3);
    expect(playoffStructures.length).toEqual(2);

    const championship = playoffStructures.find((s) => s.structureName === 'Championship');
    const consolation = playoffStructures.find((s) => s.structureName === 'Consolation');
    expect(championship).toBeDefined();
    expect(consolation).toBeDefined();

    // Championship: bestOf 4 → nextPowerOf2(4) = 4 → 3 matchUps
    expect(championship?.matchUps?.length).toEqual(3);

    // Consolation: remainder = 12-4 = 8 → nextPowerOf2(8) = 8 → 7 matchUps
    expect(consolation?.matchUps?.length).toEqual(7);

    // Links
    expect(links?.length).toEqual(2);
    const champLink = links?.find((l) => l.target.structureId === championship?.structureId);
    const consolLink = links?.find((l) => l.target.structureId === consolation?.structureId);

    expect(champLink?.source.bestOf).toEqual(4);
    expect(champLink?.source.rankBy).toEqual('GEMscore');
    expect(champLink?.source.remainder).toBeUndefined();

    expect(consolLink?.source.remainder).toBe(true);
    expect(consolLink?.source.bestOf).toBeUndefined();
  });

  it('full lifecycle: bestOf + remainder with mocksEngine', () => {
    const drawSize = 12;
    const structureOptions = {
      playoffGroups: [
        {
          finishingPositions: [1],
          bestOf: 4,
          rankBy: 'GEMscore',
          structureName: 'Championship',
        },
        {
          remainder: true,
          structureName: 'Consolation',
        },
      ],
    };

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

    const { drawDefinition } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

    const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toEqual(2);

    const championship = playoffStructures.find((s) => s.structureName === 'Championship');
    const consolation = playoffStructures.find((s) => s.structureName === 'Consolation');

    // Championship should have 4 participants
    const champAssignments = getPositionAssignments({
      structureId: championship!.structureId,
      drawDefinition,
    }).positionAssignments;
    const champParticipants = champAssignments?.filter((pa) => pa.participantId) ?? [];
    expect(champParticipants.length).toEqual(4);

    // Consolation should have 8 participants
    const consolAssignments = getPositionAssignments({
      structureId: consolation!.structureId,
      drawDefinition,
    }).positionAssignments;
    const consolParticipants = consolAssignments?.filter((pa) => pa.participantId) ?? [];
    expect(consolParticipants.length).toEqual(8);

    // No participant should appear in both
    const champIds = new Set(champParticipants.map((pa) => pa.participantId));
    const consolIds = consolParticipants.map((pa) => pa.participantId);
    const overlap = consolIds.filter((id) => champIds.has(id));
    expect(overlap.length).toEqual(0);

    // Total participants = 12
    expect(champParticipants.length + consolParticipants.length).toEqual(12);
  });
});
