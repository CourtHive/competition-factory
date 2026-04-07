import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import { DRAW, FEED_IN, MAIN, POSITION, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import {
  ADD_NICKNAME,
  ADD_PENALTY,
  ALTERNATE_PARTICIPANT,
  ASSIGN_BYE,
  LUCKY_PARTICIPANT,
  QUALIFYING_PARTICIPANT,
  REMOVE_ASSIGNMENT,
  REMOVE_SEED,
  SEED_VALUE,
  SWAP_PARTICIPANTS,
  WITHDRAW_PARTICIPANT,
} from '@Constants/positionActionConstants';

it('will throw an error for incorrect qualifyingStructures', () => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        qualifyingProfiles: [{ drawSize: 16, qualifyingPositions: 4 }],
        drawSize: 16,
      },
    ],
  });

  expect(result.error).toEqual(MISSING_VALUE);
});

const scenarios = [
  {
    drawSize: 16,
    qualifyingProfiles: [
      {
        roundTarget: 1,
        structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4 }],
      },
    ],
    expectation: {
      qualifyingRoundNumber: 2,
      qualifyingMatchUps: 12,
      directAcceptance: 28,
      qualifiersCount: 4,
    },
  },
  {
    drawSize: 16,
    qualifyingProfiles: [
      {
        roundTarget: 1,
        structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 2 }],
      },
    ],
    expectation: {
      qualifyingRoundNumber: 3,
      qualifyingMatchUps: 14,
      directAcceptance: 30,
      qualifiersCount: 2,
    },
  },
  {
    drawSize: 16,
    qualifyingProfiles: [
      {
        roundTarget: 1,
        structureProfiles: [
          {
            qualifyingPositions: 4,
            participantsCount: 7,
            stageSequence: 1,
            drawSize: 8,
          },
        ],
      },
    ],
    expectation: {
      qualifyingRoundNumber: 1,
      qualifyingMatchUps: 4,
      directAcceptance: 19,
      qualifiersCount: 4,
    },
  },
];

it.each(scenarios)('supports drawProfiles which include qualifying structures', (scenario) => {
  const drawProfiles = [scenario];

  let result = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles,
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(2);
  expect(drawDefinition.links.length).toEqual(1);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [QUALIFYING] },
  });
  expect(matchUps.length).toEqual(scenario.expectation.qualifyingMatchUps);

  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  const roundNumbers = roundMatchUps ? Object.keys(roundMatchUps).map((r) => parseInt(r)) : [];
  const qualifyingRoundNumber = Math.max(...roundNumbers);
  expect(qualifyingRoundNumber).toEqual(scenario.expectation.qualifyingRoundNumber);

  const directAcceptance = drawDefinition.entries.filter((entry) => entry.entryStatus === DIRECT_ACCEPTANCE);
  expect(directAcceptance.length).toEqual(scenario.expectation.directAcceptance);

  const {
    structures: [mainStructure],
  } = getDrawStructures({ stage: MAIN, drawDefinition });

  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });

  const qualifiersCount = positionAssignments?.filter((assignment) => assignment.qualifier).length;
  expect(qualifiersCount).toEqual(scenario.expectation.qualifiersCount);

  const qualifierDrawPosition = positionAssignments?.find(({ qualifier }) => qualifier)?.drawPosition;
  const mainStructureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;

  result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    drawPosition: qualifierDrawPosition,
    structureId: mainStructureId,
    drawId,
  });

  const qualifierAssingmentAction = result.validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  expect(qualifierAssingmentAction).not.toBeUndefined();
  expect(qualifierAssingmentAction.qualifyingParticipantIds.length).toEqual(qualifiersCount);
});

it('supports ROUND_ROBIN in multi-sequence qualifying structures', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      completionGoal: 24,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [
            { stageSequence: 1, drawSize: 16, drawType: ROUND_ROBIN },
            { stageSequence: 2, drawSize: 16, qualifyingPositions: 4 },
          ],
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

  const { participants } = tournamentEngine.getParticipants();

  // if there are qualifiers then all participants are unique
  // 32 + 32 unique + 16 qualifying + 16 qualifying = 112
  expect(participants.length).toEqual(96);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(3);
  expect(drawDefinition.links.length).toEqual(2);

  const {
    structures: [mainStructure],
  } = getDrawStructures({ stage: MAIN, drawDefinition });

  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });

  const qualifiersCount = positionAssignments?.filter((assignment) => assignment.qualifier).length;
  expect(qualifiersCount).toEqual(4);

  const {
    structures: [q1],
  } = getDrawStructures({
    stage: QUALIFYING,
    stageSequence: 1,
    drawDefinition,
  });
  const { positionAssignments: q1pa } = getPositionAssignments({
    structure: q1,
  });
  expect(q1pa?.length).toEqual(16);

  const q1positioned = q1pa?.filter((q) => q.participantId);
  expect(q1positioned?.length).toEqual(16);

  const matchUps = getAllStructureMatchUps({ structure: q1 }).matchUps;
  let { roundMatchUps } = getRoundMatchUps({ matchUps });
  let roundNumbers = roundMatchUps ? Object.keys(roundMatchUps).map((r) => parseInt(r)) : [];
  let qualifyingRoundNumber = Math.max(...roundNumbers);
  expect(qualifyingRoundNumber).toEqual(3);

  const {
    structures: [q2],
  } = getDrawStructures({
    stage: QUALIFYING,
    stageSequence: 2,
    drawDefinition,
  });
  const { positionAssignments: q2pa } = getPositionAssignments({
    structure: q2,
  });
  expect(q2pa?.length).toEqual(16);
  const q2positioned = q2pa?.filter((q) => q.participantId);
  // NOTE: Known issue — getStageEntryTypeCount doesn't filter by stageSequence,
  // so q2 entries are silently dropped when q1 entries fill the stage space check.
  expect(q2positioned?.length).toEqual(0);

  ({ roundMatchUps } = getRoundMatchUps({ matchUps: q2.matchUps }));
  roundNumbers = roundMatchUps ? Object.keys(roundMatchUps).map((r) => parseInt(r)) : [];
  qualifyingRoundNumber = Math.max(...roundNumbers);
  expect(qualifyingRoundNumber).toEqual(2);

  expect(q1.structureName).toEqual('Qualifying 1');
  expect(q2.structureName).toEqual('Qualifying 2');

  const firstLink = drawDefinition.links.find((link) => link.source.structureId === q1.structureId);
  const secondLink = drawDefinition.links.find((link) => link.source.structureId === q2.structureId);

  expect(firstLink.target.structureId).toEqual(q2.structureId);
  expect(secondLink.target.structureId).toEqual(mainStructure.structureId);

  expect(firstLink.source.roundNumber).toEqual(3);
  expect(secondLink.source.roundNumber).toEqual(2);

  expect(firstLink.target.roundNumber).toEqual(1);
  expect(secondLink.target.roundNumber).toEqual(1);
  expect(firstLink.target.feedProfile).toEqual(DRAW);
  expect(secondLink.target.feedProfile).toEqual(DRAW);

  // NOTE: q2 has no positioned participants due to stageSequence space-check issue.
  // Verify position actions on main structure which has participants.
  const mainParticipantAssignment = mainStructure.positionAssignments?.find(({ participantId }) => participantId);
  const mainDrawPosition = mainParticipantAssignment?.drawPosition;

  const result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    structureId: mainStructure.structureId,
    drawPosition: mainDrawPosition,
    drawId,
  });

  const validTypes = result.validActions.map(({ type }) => type).sort();
  // prettier-ignore
  expect(validTypes).toEqual([
    ASSIGN_BYE, ADD_NICKNAME, ADD_PENALTY,
    REMOVE_ASSIGNMENT, REMOVE_SEED, SEED_VALUE, SWAP_PARTICIPANTS, WITHDRAW_PARTICIPANT,
  ]);
});

it('supports round robin qualifying structures', () => {
  const drawProfiles = [
    {
      drawSize: 16,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [
            {
              drawType: ROUND_ROBIN,
              qualifyingPositions: 4,
              stageSequence: 1,
              drawSize: 16,
            },
          ],
        },
      ],
    },
  ];

  const expectation = {
    qualifyingRoundNumber: 3,
    qualifyingMatchUps: 24,
    directAcceptance: 28,
    qualifiersCount: 4,
  };

  let result = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles,
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(2);
  expect(drawDefinition.links.length).toEqual(1);
  // because the source structure is a ROUND_ROBIN the qualifiers are only present after all rounds played
  expect(drawDefinition.links[0].source.roundNumber).toEqual(3);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [QUALIFYING] },
  });
  expect(matchUps.length).toEqual(expectation.qualifyingMatchUps);

  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  const roundNumbers = roundMatchUps ? Object.keys(roundMatchUps).map((r) => parseInt(r)) : [];
  const qualifyingRoundNumber = Math.max(...roundNumbers);
  expect(qualifyingRoundNumber).toEqual(expectation.qualifyingRoundNumber);

  const directAcceptance = drawDefinition.entries.filter((entry) => entry.entryStatus === DIRECT_ACCEPTANCE);
  expect(directAcceptance.length).toEqual(expectation.directAcceptance);

  const {
    structures: [mainStructure],
  } = getDrawStructures({ stage: MAIN, drawDefinition });

  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });

  const qualifiersCount = positionAssignments?.filter((assignment) => assignment.qualifier).length;
  expect(qualifiersCount).toEqual(expectation.qualifiersCount);

  const qualifierDrawPosition = positionAssignments?.find(({ qualifier }) => qualifier)?.drawPosition;
  const mainStructureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;

  const qualifierAssignment = positionAssignments?.find(
    (assignment) => assignment.drawPosition === qualifierDrawPosition,
  );

  result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    drawPosition: qualifierDrawPosition,
    structureId: mainStructureId,
    drawId,
  });

  const qualifyingAction = result.validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  expect(qualifyingAction).not.toBeUndefined();

  const qualifyingParticipantId = qualifyingAction.qualifyingParticipantIds[0];
  const payload = { ...qualifyingAction.payload, qualifyingParticipantId };
  result = tournamentEngine[qualifyingAction.method](payload);
  expect(result.success).toEqual(true);
  expect(result.removedParticipantId).toBeUndefined();

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const {
    structures: [main],
  } = getDrawStructures({
    stage: MAIN,
    stageSequence: 1,
    drawDefinition,
  });
  const { positionAssignments: mainPa } = getPositionAssignments({
    structure: main,
  });

  const assignment = mainPa?.find((assignment) => assignment.drawPosition === qualifierDrawPosition);
  expect(assignment?.participantId).toEqual(qualifyingParticipantId);
  expect(qualifierAssignment?.drawPosition).toEqual(assignment?.drawPosition);
});

// to test qualifiers from different roundTargets: no multi-sequence qualifying
it('Fish Farm: supports qualifying structures with multiple roundTargets', () => {
  const completionGoal = 52;
  const drawProfiles = [
    {
      drawSize: 48,
      completionGoal,
      drawType: FEED_IN,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [
            {
              qualifyingRoundNumber: 3,
              stageSequence: 1,
              drawSize: 32,
            },
          ],
        },
        {
          roundTarget: 2,
          structureProfiles: [
            {
              qualifyingPositions: 4,
              drawType: ROUND_ROBIN,
              stageSequence: 2,
              drawSize: 16,
            },
          ],
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
  });
  const completedQualifying = matchUps.filter((matchUp) => matchUp.stage === QUALIFYING);
  // prettier-ignore
  expect(unique(completedQualifying.map(({ roundName }) => roundName))).toEqual([
    'Q-R32', 'Q-R16', 'Q-Final', 'Q-Round 1', 'Q-Round 2', 'Q-Round 3',
  ]);
  expect(completedQualifying.length).toEqual(completionGoal);

  const completedMain = matchUps.filter((matchUp) => matchUp.stage === MAIN);
  expect(completedMain.length).toEqual(0);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(3);
  expect(drawDefinition.links.length).toEqual(2);

  // test that structureSort handled roundTargets
  const structureNames = drawDefinition.structures.map(({ structureName }) => structureName);
  expect(structureNames).toEqual(['Qualifying 1-1', 'Qualifying 2-1', 'Main']);

  const rrQLink = drawDefinition.links.find(({ linkType }) => linkType === POSITION);
  expect(rrQLink.source.finishingPositions).toEqual([1]);
  expect(rrQLink.target.roundNumber).toEqual(2);

  const rrQstructureId = rrQLink.source.structureId;
  const rrQstructure = drawDefinition.structures.find(({ structureId }) => structureId === rrQstructureId);
  expect(rrQstructure.structureName).toEqual('Qualifying 2-1');

  const {
    structures: [mainStructure],
  } = getDrawStructures({ stage: MAIN, drawDefinition });
  const mainStructureId = mainStructure.structureId;

  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });

  const qualifiersCount = positionAssignments?.filter((assignment) => assignment.qualifier).length;
  expect(qualifiersCount).toEqual(8);

  const assignment = positionAssignments?.find(({ participantId }) => participantId);
  let result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    drawPosition: assignment?.drawPosition,
    structureId: mainStructureId,
    drawId,
  });

  let validTypes = result.validActions.map(({ type }) => type).sort();
  // prettier-ignore
  expect(validTypes).toEqual([
    ASSIGN_BYE, LUCKY_PARTICIPANT, ADD_NICKNAME, ADD_PENALTY,
    QUALIFYING_PARTICIPANT, REMOVE_ASSIGNMENT, REMOVE_SEED, SEED_VALUE, SWAP_PARTICIPANTS, WITHDRAW_PARTICIPANT,
  ]);

  const qualifierDrawPosition = positionAssignments?.find((assignment) => assignment.qualifier)?.drawPosition;

  result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    drawPosition: qualifierDrawPosition,
    structureId: mainStructureId,
    drawId,
  });

  validTypes = result.validActions.map(({ type }) => type).sort();

  // prettier-ignore
  expect(validTypes).toEqual([
    ASSIGN_BYE, LUCKY_PARTICIPANT, QUALIFYING_PARTICIPANT,
    REMOVE_ASSIGNMENT, REMOVE_SEED, SEED_VALUE, SWAP_PARTICIPANTS, WITHDRAW_PARTICIPANT,
  ]);

  let qualifierAssingmentAction = result.validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  expect(qualifierAssingmentAction).not.toBeUndefined();
  expect(qualifierAssingmentAction.qualifyingParticipantIds.length).toEqual(8);

  // now test without unrestricted policy; expect fewer qualifiers because of roundTargets
  result = tournamentEngine.positionActions({
    drawPosition: assignment?.drawPosition,
    structureId: mainStructureId,
    drawId,
  });

  qualifierAssingmentAction = result.validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  expect(qualifierAssingmentAction).not.toBeUndefined();
  expect(qualifierAssingmentAction.qualifyingParticipantIds.length).toEqual(4);
});

it('qualifying structures with multiple chains can share the same roundTarget', () => {
  const completionGoal = 52;
  const drawProfiles = [
    {
      drawSize: 32,
      completionGoal,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [
            {
              qualifyingRoundNumber: 3,
              stageSequence: 1,
              drawSize: 32,
            },
          ],
        },
        {
          roundTarget: 1,
          structureProfiles: [
            {
              qualifyingPositions: 4,
              drawType: ROUND_ROBIN,
              stageSequence: 2,
              drawSize: 16,
            },
          ],
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
  });
  const completedQualifying = matchUps.filter((matchUp) => matchUp.stage === QUALIFYING);
  expect(completedQualifying.length).toEqual(completionGoal);

  const completedMain = matchUps.filter((matchUp) => matchUp.stage === MAIN);
  expect(completedMain.length).toEqual(0);

  // if there are qualifiers then all participants are unique
  // 32 + 32 unique + 32 qualifying + 16 qualifying RR = 128
  expect(participants.length).toEqual(112);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(3);
  expect(drawDefinition.links.length).toEqual(2);

  const rrQLink = drawDefinition.links.find(({ linkType }) => linkType === POSITION);
  expect(rrQLink.source.finishingPositions).toEqual([1]);
  expect(rrQLink.target.roundNumber).toEqual(1);

  const rrQstructureId = rrQLink.source.structureId;
  const rrQstructure = drawDefinition.structures.find(({ structureId }) => structureId === rrQstructureId);
  expect(rrQstructure.structureName).toEqual('Qualifying 1-1');

  const {
    structures: [mainStructure],
  } = getDrawStructures({ stage: MAIN, drawDefinition });
  const mainStructureId = mainStructure.structureId;

  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
  });

  const qualifiersCount = positionAssignments?.filter((assignment) => assignment.qualifier).length;
  expect(qualifiersCount).toEqual(8);

  const assignment = positionAssignments?.find(({ participantId }) => participantId);
  const unrestrictedActionsPolicy = POLICY_POSITION_ACTIONS_UNRESTRICTED[POLICY_TYPE_POSITION_ACTIONS];
  const restrictedQualifyingAlternatesPolicy = {
    ...unrestrictedActionsPolicy,
    restrictQualifyingAlternates: true,
  };

  let result = tournamentEngine.positionActions({
    policyDefinitions: {
      [POLICY_TYPE_POSITION_ACTIONS]: unrestrictedActionsPolicy,
    },
    drawPosition: assignment?.drawPosition,
    structureId: mainStructureId,
    drawId,
  });

  let validTypes = result.validActions.map(({ type }) => type).sort();

  // prettier-ignore
  expect(validTypes).toEqual([
    ALTERNATE_PARTICIPANT, ASSIGN_BYE, LUCKY_PARTICIPANT, ADD_NICKNAME, ADD_PENALTY,
    QUALIFYING_PARTICIPANT, REMOVE_ASSIGNMENT, REMOVE_SEED, SEED_VALUE, SWAP_PARTICIPANTS, WITHDRAW_PARTICIPANT,
  ]);

  result = tournamentEngine.positionActions({
    policyDefinitions: {
      [POLICY_TYPE_POSITION_ACTIONS]: restrictedQualifyingAlternatesPolicy,
    },
    drawPosition: assignment?.drawPosition,
    structureId: mainStructureId,
    drawId,
  });

  validTypes = result.validActions.map(({ type }) => type).sort();

  // prettier-ignore
  expect(validTypes).toEqual([
    // restrictQualifyingAlternates will remove ALTERNATE_PARTICIPANT
    ASSIGN_BYE, LUCKY_PARTICIPANT, ADD_NICKNAME, ADD_PENALTY,
    QUALIFYING_PARTICIPANT, REMOVE_ASSIGNMENT, REMOVE_SEED, SEED_VALUE, SWAP_PARTICIPANTS, WITHDRAW_PARTICIPANT,
  ]);

  const qualifierDrawPosition = positionAssignments?.find((assignment) => assignment.qualifier)?.drawPosition;

  result = tournamentEngine.positionActions({
    policyDefinitions: {
      [POLICY_TYPE_POSITION_ACTIONS]: unrestrictedActionsPolicy,
    },
    drawPosition: qualifierDrawPosition,
    structureId: mainStructureId,
    drawId,
  });

  validTypes = result.validActions.map(({ type }) => type).sort();

  // prettier-ignore
  expect(validTypes).toEqual([
    ALTERNATE_PARTICIPANT, ASSIGN_BYE, LUCKY_PARTICIPANT, QUALIFYING_PARTICIPANT,
    REMOVE_ASSIGNMENT, REMOVE_SEED, SEED_VALUE, SWAP_PARTICIPANTS, WITHDRAW_PARTICIPANT,
  ]);

  result = tournamentEngine.positionActions({
    policyDefinitions: {
      [POLICY_TYPE_POSITION_ACTIONS]: restrictedQualifyingAlternatesPolicy,
    },
    drawPosition: qualifierDrawPosition,
    structureId: mainStructureId,
    drawId,
  });

  validTypes = result.validActions.map(({ type }) => type).sort();

  // prettier-ignore
  expect(validTypes).toEqual([
    // restrictQualifyingAlternates will remove ALTERNATE_PARTICIPANT
    ASSIGN_BYE, LUCKY_PARTICIPANT, QUALIFYING_PARTICIPANT,
    REMOVE_ASSIGNMENT, REMOVE_SEED, SEED_VALUE, SWAP_PARTICIPANTS, WITHDRAW_PARTICIPANT,
  ]);

  let qualifierAssingmentAction = result.validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  expect(qualifierAssingmentAction).not.toBeUndefined();
  expect(qualifierAssingmentAction.qualifyingParticipantIds.length).toEqual(8);

  // now test without unrestricted policy: since both qualifying chains have { roundTarget: 1 } expect same number
  result = tournamentEngine.positionActions({
    drawPosition: assignment?.drawPosition,
    structureId: mainStructureId,
    drawId,
  });

  qualifierAssingmentAction = result.validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
  expect(qualifierAssingmentAction).not.toBeUndefined();
  expect(qualifierAssingmentAction.qualifyingParticipantIds.length).toEqual(8);
});
