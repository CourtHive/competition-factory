import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { generateMatchUpOutcome } from '@Tests/helpers/generateMatchUpOutcome';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { generateRange, intersection } from '@Tools/arrays';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants and fixtures
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  MAIN,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

const scenarios = [
  {
    drawProfile: {
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      structureOptions: { groupSize: 4 },
      drawSize: 32,
    },
    completeAllMatchUps: true,
    allPositionsAssigned: true,
    playoffGroups: [
      {
        finishingPositions: [2, 3],
        structureName: 'Silver',
        drawType: COMPASS,
      },
    ],
    expectation: {
      initialStructuresCount: 2,
      totalStructuresCount: 10, // original 2 plus 8 for COMPASS
      playoffFinishingPositionRanges: [
        {
          finishingPositions: [9, 10, 11, 12, 13, 14, 15, 16],
          finishingPositionRange: '9-16',
          finishingPosition: 2,
        },
        {
          finishingPositions: [17, 18, 19, 20, 21, 22, 23, 24],
          finishingPositionRange: '17-24',
          finishingPosition: 3,
        },
        {
          finishingPositions: [25, 26, 27, 28, 29, 30, 31, 32],
          finishingPositionRange: '25-32',
          finishingPosition: 4,
        },
      ],
    },
  },
  {
    drawProfile: {
      structureOptions: { groupSize: 4 },
      drawType: ROUND_ROBIN,
      drawSize: 8,
    },
    allPositionsAssigned: true,
    completeAllMatchUps: true,
    playoffGroups: [
      {
        structureName: '3-4 Playoff',
        drawType: SINGLE_ELIMINATION,
        finishingPositions: [1],
      },
    ],
    expectation: {
      totalStructuresCount: 2,
      playoffFinishingPositionRanges: [
        {
          finishingPositionRange: '1-2',
          finishingPositions: [1, 2],
          finishingPosition: 1,
        },
        {
          finishingPositionRange: '3-4',
          finishingPositions: [3, 4],
          finishingPosition: 2,
        },
        {
          finishingPositionRange: '5-6',
          finishingPositions: [5, 6],
          finishingPosition: 3,
        },
        {
          finishingPositionRange: '7-8',
          finishingPositions: [7, 8],
          finishingPosition: 4,
        },
      ],
    },
  },
  {
    drawProfile: {
      structureOptions: { groupSize: 3 },
      drawType: ROUND_ROBIN,
      completionGoal: 11,
      drawSize: 12,
    },
    allPositionsAssigned: false,
    completeAllMatchUps: false,
    playoffGroups: [
      {
        drawType: SINGLE_ELIMINATION,
        structureName: '1-4 Playoff',
        finishingPositions: [1],
      },
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        structureName: '5-8 Playoff',
        finishingPositions: [2],
      },
      {
        structureName: '5-8 Playoff',
        finishingPositions: [3],
        drawType: ROUND_ROBIN,
      },
    ],
    expectation: {
      totalStructuresCount: 5,
      playoffFinishingPositionRanges: [
        {
          finishingPositions: [1, 2, 3, 4],
          finishingPositionRange: '1-4',
          finishingPosition: 1,
        },
        {
          finishingPositions: [5, 6, 7, 8],
          finishingPositionRange: '5-8',
          finishingPosition: 2,
        },
        {
          finishingPositions: [9, 10, 11, 12],
          finishingPositionRange: '9-12',
          finishingPosition: 3,
        },
      ],
    },
  },
  {
    drawProfile: {
      structureOptions: { groupSize: 3 },
      drawType: ROUND_ROBIN,
      completionGoal: 11,
      drawSize: 12,
    },
    allPositionsAssigned: false,
    completeAllMatchUps: false,
    playoffGroups: [
      {
        finishingPositions: [1],
        drawType: COMPASS,
      },
      {
        drawType: FEED_IN_CHAMPIONSHIP,
        finishingPositions: [2],
      },
      {
        drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
        finishingPositions: [3],
      },
    ],
    expectation: {
      totalStructuresCount: 7,
      playoffFinishingPositionRanges: [
        {
          finishingPositions: [1, 2, 3, 4],
          finishingPositionRange: '1-4',
          finishingPosition: 1,
        },
        {
          finishingPositions: [5, 6, 7, 8],
          finishingPositionRange: '5-8',
          finishingPosition: 2,
        },
        {
          finishingPositions: [9, 10, 11, 12],
          finishingPositionRange: '9-12',
          finishingPosition: 3,
        },
      ],
    },
  },
  {
    drawProfile: {
      structureOptions: { groupSize: 3 },
      drawType: ROUND_ROBIN,
      completionGoal: 0,
      drawSize: 128,
    },
    allPositionsAssigned: false,
    completeAllMatchUps: false,
    playoffGroups: [
      {
        playoffAttributes: {
          '1-43': { name: '1-43 Playoff', abbreviation: 'P1-43' },
          '0-1': { name: 'C1', abbreviation: 'C1' },
          '0-3': { name: 'C2', abbreviation: 'C2' },
          '3-4': { name: '3-4 Playoff', abbreviation: 'P3-4' },
        },
        playoffStructureNameBase: 'One',
        drawType: CURTIS_CONSOLATION,
        finishingPositions: [1],
      },
      {
        playoffStructureNameBase: 'Two',
        structureName: '44-86 Playoff',
        drawType: CURTIS_CONSOLATION,
        finishingPositions: [2],
        structureNameMap: {
          'Consolation 1': 'C1',
          'Consolation 2': 'C2',
          'Play Off': 'PO',
        },
      },
      {
        playoffStructureNameBase: 'Three',
        structureName: '87-128 Playoff',
        drawType: CURTIS_CONSOLATION,
        finishingPositions: [3],
        roundOffsetLimit: 2,
        structureNameMap: {
          'Consolation 1': 'C1',
          'Consolation 2': 'C2',
          'Play Off': 'PO',
        },
      },
    ],
    expectation: {
      initialStructuresCount: 1,
      totalStructuresCount: 13,
      playoffFinishingPositionRanges: [
        {
          finishingPositions: generateRange(1, 44),
          finishingPositionRange: '1-43',
          finishingPosition: 1,
        },
        {
          finishingPositions: generateRange(44, 87),
          finishingPositionRange: '44-86',
          finishingPosition: 2,
        },
        {
          finishingPositions: generateRange(87, 129),
          finishingPositionRange: '87-128',
          finishingPosition: 3,
        },
      ],
      structureNames: [
        '1-43 Playoff',
        'One C1',
        'One C2',
        'One 3-4 Playoff',
        '44-86 Playoff',
        'Two C1',
        'Two C2',
        'Two PO',
        '87-128 Playoff',
        'Three C1',
        'Three C2',
        'Three PO',
      ],
    },
  },
];

it.each(scenarios)('can determine available playoff rounds for ROUND_ROBIN structures', (scenario) => {
  const { playoffGroups, allPositionsAssigned, completeAllMatchUps, drawProfile, expectation } = scenario;

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [drawProfile],
    completeAllMatchUps,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;

  result = tournamentEngine.devContext(true).getAvailablePlayoffProfiles({ drawId });

  if (expectation) {
    expect(result.availablePlayoffProfiles[0].playoffFinishingPositionRanges).toEqual(
      expectation.playoffFinishingPositionRanges,
    );
  }

  // calling with structureId returns scoped values
  result = tournamentEngine.getAvailablePlayoffProfiles({
    structureId: mainStructureId,
    drawId,
  });
  expect(result.playoffFinishingPositionRanges).toEqual(expectation.playoffFinishingPositionRanges);
  const availableFinishingPositions = result.playoffFinishingPositionRanges.map(
    ({ finishingPosition }) => finishingPosition,
  );

  result = tournamentEngine.generateAndPopulatePlayoffStructures({
    structureId: mainStructureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_VALUE);
  expect(result.info).not.toBeUndefined();

  const invalidFinishingPosition = Math.max(...availableFinishingPositions, 0) + 1;
  result = tournamentEngine.generateAndPopulatePlayoffStructures({
    playoffGroups: [{ finishingPositions: [invalidFinishingPosition] }],
    structureId: mainStructureId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  // if { completeAllMatchUps: true } then the playoffStructures are already generated and populated
  if (playoffGroups && !completeAllMatchUps) {
    result = tournamentEngine.generateAndPopulatePlayoffStructures({
      structureId: mainStructureId,
      playoffGroups,
      drawId,
    });
    expect(result.success).toEqual(true);

    // result.structures[0] is the first of the new structures generated
    expect(result.structures[0].positionAssignments.every(({ participantId }) => participantId)).toEqual(
      allPositionsAssigned,
    );

    if (expectation.totalStructuresCount) {
      expect(result.drawDefinition.structures.length).toEqual(expectation.totalStructuresCount);
    }

    const { structures, links, matchUpModifications } = result;
    if (expectation.structureNames) {
      expect(structures.map(xa('structureName'))).toEqual(expectation.structureNames);
    }
    result = tournamentEngine.attachPlayoffStructures({
      matchUpModifications,
      structures,
      drawId,
      links,
    });
    expect(result.addedStructureIds.length).toEqual(
      expectation.totalStructuresCount - (expectation.initialStructuresCount ?? 1),
    );
    expect(result.success).toEqual(true);
  }

  if (!completeAllMatchUps && drawProfile.completionGoal) {
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const mainMatchUps = matchUps.filter((m) => m.stage === MAIN);

    // when not all matchUps are completed, expecting all but one MAIN matchUp to be completed
    expect(mainMatchUps.length - mainMatchUps.filter((m) => m.matchUpStatus === COMPLETED).length).toEqual(1);

    drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    let thisStructureIsCompleted = isCompletedStructure({
      structureId: mainStructureId,
      drawDefinition,
    });
    expect(thisStructureIsCompleted).toEqual(false);

    const matchUpsToComplete = mainMatchUps.filter((m) => m.matchUpStatus === TO_BE_PLAYED);
    expect(matchUpsToComplete.length).toEqual(1);

    const setValues = [
      [6, 0],
      [6, 0],
    ];
    const outcome = generateMatchUpOutcome({
      matchUpFormat: FORMAT_STANDARD,
      setValues,
    });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUpsToComplete[0].matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    thisStructureIsCompleted = isCompletedStructure({
      structureId: mainStructureId,
      drawDefinition,
    });
    expect(thisStructureIsCompleted).toEqual(true);

    result = tournamentEngine.automatedPlayoffPositioning({
      structureId: mainStructureId,
      applyPositioning: false,
      drawId,
    });
    expect(result.success).toEqual(true);

    const { structurePositionAssignments } = result;

    const s1pa = structurePositionAssignments[0].positionAssignments.map(xa('participantId'));
    const s2pa = structurePositionAssignments[1].positionAssignments.map(xa('participantId'));
    const s3pa = structurePositionAssignments[2].positionAssignments.map(xa('participantId'));

    // ensure that there is no overlap in the positionAssignments for each playoff
    expect(intersection(s1pa, s2pa).length).toEqual(0);
    expect(intersection(s1pa, s3pa).length).toEqual(0);
    expect(intersection(s2pa, s3pa).length).toEqual(0);

    drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;

    structurePositionAssignments.forEach((pa) => {
      const s1 = drawDefinition.structures.find((s) => s.structureId === pa.structureId);
      const s1pa = getPositionAssignments({
        structure: s1,
      }).positionAssignments;
      expect(s1pa?.map(xa('participantId')).filter(Boolean)).toEqual([]);
    });

    result = tournamentEngine.setPositionAssignments({
      structurePositionAssignments,
      drawId,
    });
    expect(result.success).toEqual(true);

    drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    structurePositionAssignments.forEach((pa) => {
      const s1 = drawDefinition.structures.find((s) => s.structureId === pa.structureId);
      const s1pa = getPositionAssignments({
        structure: s1,
      }).positionAssignments;
      expect(s1pa?.map(xa('participantId')).filter(Boolean).length).toEqual(4);
    });
  }
});
