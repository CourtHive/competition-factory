import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { findExtension } from '@Acquire/findExtension';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { MISSING_DRAW_POSITION, MISSING_STRUCTURE_ID } from '@Constants/errorConditionConstants';
import { FORMAT_SHORT_SETS, FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';
import { TALLY } from '@Constants/extensionConstants';

it('can recalculate participantResults when outcomes are removed', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      participantsCount: 4,
      drawType: ROUND_ROBIN,
      outcomes: [
        {
          drawPositions: [1, 2],
          scoreString: '6-1 6-2',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  let mainStructure = drawDefinition.structures[0];

  const adm = tournamentEngine.allDrawMatchUps({
    inContext: true,
    drawId,
  });
  let matchUps = adm.matchUps;
  const matchUpsMap = adm.matchUpsMap;
  expect([matchUps.length, matchUpsMap.drawMatchUps.length]).toEqual([6, 6]);
  let { participantResults } = tallyParticipantResults({ matchUps });
  expect(Object.keys(participantResults).length).toEqual(2);

  Object.values(participantResults).forEach((pr: any) => {
    expect(pr.groupOrder).toBeUndefined();
    expect(pr.provisionalOrder).not.toBeUndefined();
  });

  let { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });
  let dp1 = getDrawPositionTally({ positionAssignments, drawPosition: 1 });
  expect(dp1.result).toEqual('1/0');

  // now remove the one matchUp outcome
  const { matchUpId } = matchUps.find(({ drawPositions }) => intersection(drawPositions, [1, 2]).length === 2);
  const result = tournamentEngine.setMatchUpStatus({
    outcome: toBePlayed,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allDrawMatchUps({
    inContext: true,
    drawId,
  }));
  ({ participantResults } = tallyParticipantResults({
    matchUps,
  }));

  expect(Object.keys(participantResults).length).toEqual(0);
  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  mainStructure = drawDefinition.structures[0];
  ({ positionAssignments } = tournamentEngine.getPositionAssignments({
    structure: mainStructure,
  }));
  dp1 = getDrawPositionTally({ positionAssignments, drawPosition: 1 });
  expect(dp1).toBeUndefined();
});

it('calculate participantResult values are present for all drawPositions', () => {
  const drawProfiles = [
    {
      drawSize: 3,
      eventType: SINGLES,
      participantsCount: 3,
      matchUpFormat: FORMAT_STANDARD,
      drawType: ROUND_ROBIN,
      outcomes: [
        {
          roundNumber: 1,
          structureOrder: 1,
          scoreString: '6-2 6-2',
          matchUpFormat: FORMAT_STANDARD,
          winningSide: 1,
        },
        {
          roundNumber: 2,
          structureOrder: 1,
          scoreString: '6-2 6-2',
          matchUpFormat: FORMAT_STANDARD,
          winningSide: 2,
        },
        {
          roundNumber: 3,
          structureOrder: 1,
          scoreString: '6-2 3-6 [10-3]',
          matchUpFormat: FORMAT_STANDARD,
          winningSide: 2,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { matchUps } = tournamentEngine.allDrawMatchUps({
    inContext: true,
    drawId,
  });
  const mainStructure = drawDefinition.structures[0];

  mainStructure.structures.forEach((structure) => {
    const { structureId } = structure;

    const structureMatchUps = matchUps.filter((matchUp) => matchUp.structureId === structureId);
    const matchUpFormat = structureMatchUps.find(({ matchUpFormat }) => matchUpFormat)?.matchUpFormat;

    const { participantResults } = tallyParticipantResults({
      matchUps: structureMatchUps,
      matchUpFormat,
    });

    Object.values(participantResults).forEach((result: any) => {
      expect(isNaN(result.gamesWon)).toEqual(false);
      expect(isNaN(result.matchUpsWon)).toEqual(false);
      expect(isNaN(result.matchUpsLost)).toEqual(false);
      expect(isNaN(result.matchUpsCancelled)).toEqual(false);
      expect(isNaN(result.setsWon)).toEqual(false);
      expect(isNaN(result.setsLost)).toEqual(false);
      expect(isNaN(result.gamesWon)).toEqual(false);
      expect(isNaN(result.gamesLost)).toEqual(false);
      expect(isNaN(result.pointsWon)).toEqual(false);
      expect(isNaN(result.pointsLost)).toEqual(false);
      expect(isNaN(result.setsPct)).toEqual(false);
      expect(isNaN(result.matchUpsPct)).toEqual(false);
      expect(isNaN(result.gamesPct)).toEqual(false);
      expect(isNaN(result.pointsPct)).toEqual(false);
      expect(isNaN(result.groupOrder)).toEqual(false);
    });
  });
});

it('properly calculates short sets', () => {
  const drawProfiles = [
    {
      drawSize: 5,
      eventType: SINGLES,
      participantsCount: 5,
      matchUpFormat: FORMAT_SHORT_SETS,
      drawType: ROUND_ROBIN,
      structureOptions: { groupSize: 5 },
      outcomes: [
        {
          drawPositions: [1, 2],
          scoreString: '4-0 4-1',
          winningSide: 2,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures[0];
  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });

  const dp1 = getDrawPositionTally({ positionAssignments, drawPosition: 1 });
  expect(dp1.setsWon).toEqual(0);
  expect(dp1.setsLost).toEqual(2);
  expect(dp1.gamesWon).toEqual(1);
  expect(dp1.gamesLost).toEqual(8);
  expect(dp1.matchUpsWon).toEqual(0);
  expect(dp1.matchUpsLost).toEqual(1);
  expect(dp1.result).toEqual('0/1');
});

const shortSets3rdTB = 'SET3-S:4/TB7-F:TB7';

it('properly orders round robin participants; drawSize: 5, SET3-S:4/TB7-F:TB7', () => {
  const drawProfiles = [
    {
      drawSize: 5,
      eventType: SINGLES,
      participantsCount: 5,
      matchUpFormat: shortSets3rdTB,
      drawType: ROUND_ROBIN,
      structureOptions: { groupSize: 5 },
      outcomes: [
        {
          drawPositions: [1, 2],
          scoreString: '4-0 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [1, 3],
          scoreString: '4-1 4-2',
          winningSide: 2,
        },
        {
          drawPositions: [1, 4],
          scoreString: '4-0 5-4(2)',
          winningSide: 2,
        },
        {
          drawPositions: [1, 5],
          scoreString: '4-0 4-0',
          winningSide: 2,
        },
        {
          drawPositions: [2, 3],
          scoreString: '4-1 2-4 [7-5]',
          winningSide: 1,
        },
        {
          drawPositions: [2, 4],
          scoreString: '4-1 4-2',
          winningSide: 1,
        },
        {
          drawPositions: [2, 5],
          scoreString: '4-1 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [3, 4],
          scoreString: '4-1 5-3',
          winningSide: 1,
        },
        {
          drawPositions: [3, 5],
          scoreString: '4-1 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [4, 5],
          scoreString: '4-0 4-2',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const expectations = [
    {
      drawPosition: 1,
      expectation: {
        groupOrder: 5,
        rankOrder: 5,
        setsWon: 0,
        setsLost: 8,
        gamesWon: 8,
        gamesLost: 33,
      },
    },
    {
      drawPosition: 2,
      expectation: {
        groupOrder: 2,
        rankOrder: 2,
        setsWon: 6,
        setsLost: 3,
        gamesWon: 25,
        gamesLost: 17,
      },
    },
    {
      drawPosition: 3,
      expectation: {
        groupOrder: 3,
        rankOrder: 3,
        setsWon: 5,
        setsLost: 4,
        gamesWon: 24,
        gamesLost: 22,
      },
    },
    {
      drawPosition: 4,
      expectation: {
        groupOrder: 4,
        rankOrder: 4,
        setsWon: 4,
        setsLost: 4,
        gamesWon: 24,
        gamesLost: 23,
      },
    },
    {
      drawPosition: 5,
      expectation: {
        groupOrder: 1,
        rankOrder: 1,
        setsWon: 6,
        setsLost: 2,
        gamesWon: 26,
        gamesLost: 12,
      },
    },
  ];

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures[0];
  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });

  const { eventData } = tournamentEngine.getEventData({ drawId });
  const participantResults = eventData.drawsData[0].structures[0].participantResults;

  // check the expectations against both the positionAssignments for the structure
  // and the eventData payload that is intended for presentation
  expectations.forEach(({ drawPosition, expectation }) => {
    const assignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);
    const participantResult = findExtension({
      element: assignment,
      name: TALLY,
    }).extension?.value;
    const eventParticipantResult = participantResults.find(
      (result) => result.drawPosition === drawPosition,
    ).participantResult;
    Object.keys(expectation).forEach((key) => {
      expect(participantResult[key]).toEqual(expectation[key]);
      expect(eventParticipantResult[key]).toEqual(expectation[key]);
    });
  });
});

it('RR Format Standard tally test', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      eventType: SINGLES,
      participantsCount: 4,
      matchUpFormat: FORMAT_STANDARD,
      drawType: ROUND_ROBIN,
      outcomes: [
        {
          drawPositions: [1, 2],
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          drawPositions: [1, 3],
          scoreString: '6-1 6-1',
          winningSide: 2,
        },
        {
          drawPositions: [1, 4],
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
      ],
    },
  ];

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { structureId } = drawDefinition.structures[0];
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    drawId,
    structureId,
  });
  const dp1 = getDrawPositionTally({
    positionAssignments,
    drawPosition: 1,
  });
  expect(dp1.setsWon).toEqual(4);
  expect(dp1.setsLost).toEqual(2);
  expect(dp1.gamesWon).toEqual(26);
  expect(dp1.gamesLost).toEqual(16);
  expect(dp1.matchUpsWon).toEqual(2);
  expect(dp1.matchUpsLost).toEqual(1);
  expect(dp1.ties).toBeUndefined();
  expect(dp1.result).toEqual('2/1');

  const dp2 = getDrawPositionTally({
    positionAssignments,
    drawPosition: 2,
  });
  expect(dp2.setsWon).toEqual(0);
  expect(dp2.setsLost).toEqual(2);
  expect(dp2.gamesWon).toEqual(2);
  expect(dp2.gamesLost).toEqual(12);
  expect(dp2.matchUpsWon).toEqual(0);
  expect(dp2.matchUpsLost).toEqual(1);
  expect(dp2.ties).toEqual(2);
  expect(dp2.result).toEqual('0/1');

  const dp3 = getDrawPositionTally({
    positionAssignments,
    drawPosition: 3,
  });
  expect(dp3.setsWon).toEqual(2);
  expect(dp3.setsLost).toEqual(0);
  expect(dp3.gamesWon).toEqual(12);
  expect(dp3.gamesLost).toEqual(2);
  expect(dp3.matchUpsWon).toEqual(1);
  expect(dp3.matchUpsLost).toEqual(0);
  expect(dp3.ties).toBeUndefined();
  expect(dp3.result).toEqual('1/0');
});

function getDrawPositionTally({ positionAssignments, drawPosition }) {
  return positionAssignments
    .find((assignment) => assignment.drawPosition === drawPosition)
    .extensions.find(({ name }) => name === TALLY)?.value;
}

it('recognize when participants are tied with position order', () => {
  const drawProfiles = [
    {
      drawSize: 5,
      eventType: SINGLES,
      participantsCount: 5,
      matchUpFormat: FORMAT_STANDARD,
      drawType: ROUND_ROBIN,
      structureOptions: { groupSize: 5 },
      outcomes: [
        {
          drawPositions: [1, 2],
          scoreString: '6-0 6-0',
          winningSide: 1,
        },
        {
          drawPositions: [1, 3],
          scoreString: '6-0 6-0',
          winningSide: 1,
        },
        {
          drawPositions: [1, 4],
          scoreString: '6-0 6-0',
          winningSide: 2,
        },
        {
          drawPositions: [1, 5],
          scoreString: '6-0 6-0',
          winningSide: 2,
        },
        {
          drawPositions: [2, 3],
          scoreString: '6-0 6-0',
          winningSide: 2,
        },
        {
          drawPositions: [2, 4],
          scoreString: '6-0 6-0',
          winningSide: 1,
        },
        {
          drawPositions: [2, 5],
          scoreString: '6-0 6-0',
          winningSide: 1,
        },
        {
          drawPositions: [3, 4],
          scoreString: '6-0 6-0',
          winningSide: 1,
        },
        {
          drawPositions: [3, 5],
          scoreString: '6-0 6-0',
          winningSide: 2,
        },
        {
          drawPositions: [4, 5],
          scoreString: '6-0 6-0',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  let structure = drawDefinition.structures[0];
  const mainStructureId = structure.structureId;
  const { structureId } = structure.structures[0];
  let { positionAssignments } = getPositionAssignments({
    structure,
  });

  let { eventData } = tournamentEngine.getEventData({ drawId });
  let participantResults = eventData.drawsData[0].structures[0].participantResults;

  // check the expectations against both the positionAssignments for the structure
  // and the eventData payload that is intended for presentation
  positionAssignments?.forEach((assignment) => {
    const { drawPosition } = assignment;
    const result = participantResults.find((result) => result.drawPosition === drawPosition).participantResult;
    const participantResult = findExtension({
      element: assignment,
      name: TALLY,
    }).extension?.value;

    const { ties, matchUpsWon, matchUpsLost, setsWon, setsLost, gamesWon, gamesLost, groupOrder, rankOrder } =
      participantResult;

    const check = [ties, matchUpsWon, matchUpsLost, setsWon, setsLost, gamesWon, gamesLost, groupOrder, rankOrder];

    expect(check).toEqual([5, 2, 2, 4, 4, 24, 24, 1, 1]);

    // check that the results in eventData are equivalent
    expect(result).toEqual(participantResult);
  });

  let result = tournamentEngine.setSubOrder({
    drawPosition: 1,
    subOrder: 2,
    drawId,
  });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = tournamentEngine.setSubOrder({
    subOrder: 2,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_DRAW_POSITION);

  result = tournamentEngine.setSubOrder({
    structureId: mainStructureId,
    drawPosition: 1,
    subOrder: 2,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setSubOrder({
    drawPosition: 2,
    subOrder: 3,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setSubOrder({
    drawPosition: 3,
    subOrder: 4,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setSubOrder({
    drawPosition: 4,
    subOrder: 5,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ eventData } = tournamentEngine.getEventData({ drawId }));
  participantResults = eventData.drawsData[0].structures[0].participantResults;

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  structure = drawDefinition.structures[0];
  ({ positionAssignments } = getPositionAssignments({
    structure,
  }));

  const tally = findExtension({
    element: positionAssignments?.[0],
    name: TALLY,
  }).extension?.value;
  expect(tally.subOrder).toEqual(participantResults[0].participantResult.subOrder);

  const groupOrders: any[] = [];
  positionAssignments?.forEach((assignment) => {
    const { drawPosition } = assignment;
    const result = participantResults.find((result) => result.drawPosition === drawPosition).participantResult;
    const participantResult = findExtension({
      element: assignment,
      name: TALLY,
    }).extension?.value;

    const { ties, matchUpsWon, matchUpsLost, setsWon, setsLost, gamesWon, gamesLost, groupOrder, rankOrder } =
      participantResult;
    groupOrders.push(groupOrder);

    const check = [ties, matchUpsWon, matchUpsLost, setsWon, setsLost, gamesWon, gamesLost, rankOrder];

    expect(check).toEqual([5, 2, 2, 4, 4, 24, 24, 1]);

    // check that the results in eventData are equivalent
    expect(result).toEqual(participantResult);
  });
  expect(groupOrders).toEqual([2, 3, 4, 5, 1]);
});

it('properly handles walkovers in calculating participant positions', () => {
  // the default tallyPolicy tallyDirectives pushes a participant who is tied with other participants
  // but has defaulted/walkedover/retired to the last position in the group
  // in this scenario there are three participants with a 3/1 match record; the participant who
  // walked over is last in the group, #3 of the 5 total participants; the remaining participants
  // with 3/1 win/loss record are then ordered by the head to head.
  const drawProfiles = [
    {
      drawSize: 5,
      eventType: SINGLES,
      participantsCount: 5,
      matchUpFormat: shortSets3rdTB,
      drawType: ROUND_ROBIN,
      structureOptions: { groupSize: 5 },
      outcomes: [
        {
          drawPositions: [1, 2],
          scoreString: '4-1 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [1, 3],
          scoreString: '4-3 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [1, 4],
          scoreString: '4-1 4-3',
          winningSide: 1,
        },
        {
          drawPositions: [1, 5],
          scoreString: '4-3 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [2, 3],
          scoreString: '4-2 3-4 [7-5]',
          winningSide: 1,
        },
        {
          drawPositions: [2, 4],
          scoreString: '1-0 RET',
          matchUpStatus: RETIRED,
          winningSide: 1,
        },
        {
          drawPositions: [2, 5],
          scoreString: '4-1 4-0',
          winningSide: 2,
        },
        {
          drawPositions: [3, 4],
          scoreString: '4-1 4-1',
          winningSide: 1,
        },
        {
          drawPositions: [3, 5],
          scoreString: 'WO',
          matchUpStatus: WALKOVER,
          winningSide: 1,
        },
        {
          drawPositions: [4, 5],
          scoreString: '4-3 4-0',
          winningSide: 2,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const { positionAssignments } = getPositionAssignments({
    structure,
  });

  const expectations = [
    { result: '1/3', groupOrder: 4, rankOrder: 4 },
    { result: '3/1', groupOrder: 1, rankOrder: 1 },
    { result: '3/1', groupOrder: 2, rankOrder: 2 },
    { result: '0/4', groupOrder: 5, rankOrder: 5 },
    { result: '3/1', groupOrder: 3, rankOrder: 3 },
  ];

  positionAssignments?.forEach((assignment, i) => {
    const participantResult = findExtension({
      element: assignment,
      name: TALLY,
    }).extension?.value;

    expect(assignment.drawPosition).toEqual(i + 1);
    const expectation = expectations[i];
    Object.keys(expectation).forEach((key) => {
      expect(participantResult[key]).toEqual(expectation[key]);
    });
  });
});

it('properly handles DEFAULTS in calculating participant positions', () => {
  // the default tallyPolicy tallyDirectives pushes a participant who is tied with other participants
  // but has defaulted/walkedover/retired to the last position in the group
  // in this scenario there are three participants with a 3/1 match record; the participant who
  // walked over is last in the group, #3 of the 5 total participants; the remaining participants
  // with 3/1 win/loss record are then ordered by the head to head.
  const drawProfiles = [
    {
      drawSize: 5,
      eventType: SINGLES,
      participantsCount: 5,
      matchUpFormat: shortSets3rdTB,
      drawType: ROUND_ROBIN,
      structureOptions: { groupSize: 5 },
      outcomes: [
        {
          drawPositions: [1, 2],
          scoreString: '4-1 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [1, 3],
          scoreString: '4-3 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [1, 4],
          scoreString: '4-1 4-3',
          winningSide: 1,
        },
        {
          drawPositions: [1, 5],
          scoreString: '4-3 4-1',
          winningSide: 2,
        },
        {
          drawPositions: [2, 3],
          scoreString: '4-2 3-4 [7-5]',
          winningSide: 1,
        },
        {
          drawPositions: [2, 4],
          matchUpStatus: DEFAULTED,
          winningSide: 1,
        },
        {
          drawPositions: [2, 5],
          scoreString: '4-1 4-0',
          winningSide: 2,
        },
        {
          drawPositions: [3, 4],
          scoreString: '4-1 4-1',
          winningSide: 1,
        },
        {
          drawPositions: [3, 5],
          matchUpStatus: DEFAULTED,
          winningSide: 1,
        },
        {
          drawPositions: [4, 5],
          scoreString: '4-3 4-0',
          winningSide: 2,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const { positionAssignments } = getPositionAssignments({
    structure,
  });

  const expectations = [
    { result: '1/3', groupOrder: 4 },
    { result: '3/1', groupOrder: 1 },
    { result: '3/1', groupOrder: 2 },
    { result: '0/4', groupOrder: 5 },
    { result: '3/1', groupOrder: 3 },
  ];

  positionAssignments?.forEach((assignment, i) => {
    const participantResult = findExtension({
      element: assignment,
      name: TALLY,
    }).extension?.value;

    expect(assignment.drawPosition).toEqual(i + 1);
    const expectation = expectations[i];
    Object.keys(expectation).forEach((key) => {
      expect(participantResult[key]).toEqual(expectation[key]);
    });
  });
});

it('recognize when TEAM participants are tied with position order', () => {
  const drawProfiles = [
    {
      drawSize: 5,
      eventType: TEAM,
      participantsCount: 5,
      drawType: ROUND_ROBIN,
      tieFormatName: DOMINANT_DUO,
      structureOptions: { groupSize: 5 },
      outcomes: [
        {
          matchUpStatus: WALKOVER,
          drawPositions: [1, 2],
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [1, 3],
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [1, 4],
          winningSide: 2,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [1, 5],
          winningSide: 2,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [2, 3],
          winningSide: 2,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [2, 4],
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [2, 5],
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [3, 4],
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [3, 5],
          winningSide: 2,
        },
        {
          matchUpStatus: WALKOVER,
          drawPositions: [4, 5],
          winningSide: 1,
        },
      ],
    },
  ];
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  let structure = drawDefinition.structures[0];
  const mainStructureId = structure.structureId;
  const { structureId } = structure.structures[0];
  let { positionAssignments } = getPositionAssignments({
    structure,
  });

  let { eventData } = tournamentEngine.getEventData({ drawId });
  let participantResults = eventData.drawsData[0].structures[0].participantResults;

  // check the expectations against both the positionAssignments for the structure
  // and the eventData payload that is intended for presentation
  positionAssignments?.forEach((assignment) => {
    const { drawPosition } = assignment;
    const result = participantResults.find((result) => result.drawPosition === drawPosition).participantResult;
    const participantResult = findExtension({
      element: assignment,
      name: TALLY,
    }).extension?.value;

    // check that the results in eventData are equivalent
    expect(result).toEqual(participantResult);
  });

  result = tournamentEngine.setSubOrder({
    drawPosition: 1,
    subOrder: 2,
    drawId,
  });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = tournamentEngine.setSubOrder({
    subOrder: 2,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_DRAW_POSITION);

  result = tournamentEngine.setSubOrder({
    structureId: mainStructureId,
    drawPosition: 1,
    subOrder: 2,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setSubOrder({
    drawPosition: 2,
    subOrder: 3,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setSubOrder({
    drawPosition: 3,
    subOrder: 1,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ eventData } = tournamentEngine.getEventData({ drawId }));
  participantResults = eventData.drawsData[0].structures[0].participantResults;

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  structure = drawDefinition.structures[0];
  ({ positionAssignments } = getPositionAssignments({
    structure,
  }));

  const tally = findExtension({
    element: positionAssignments?.[0],
    name: TALLY,
  }).extension?.value;
  expect(tally.subOrder).toEqual(participantResults[0].participantResult.subOrder);
});
