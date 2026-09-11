import { generateMatchUpOutcome } from '@Tests/helpers/generateMatchUpOutcome';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { setsValues } from './roundRobinSetsValues';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

import { MAIN, PLAY_OFF, POSITION, WATERFALL, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { policyComposer } from '@Global/policyComposer';
import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import { ASSIGN_BYE, ASSIGN_PARTICIPANT, REMOVE_ASSIGNMENT } from '@Constants/positionActionConstants';
import POLICY_SEEDING_DEFAULT from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { LUCKY_LOSER } from '@Constants/entryStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import { SINGLES } from '@Constants/eventConstants';

const goldFlight = 'Gold Flight';

// `POLICY_SEEDING_NATIONAL` used to supply this. It was ITF seeding with one key omitted, and the
// composer says so in a way a fixture never could: leaving `validSeedPositions` unset is what keeps
// manual seed placement inside a valid seed block.
const SEEDING_POSITIONS_ENFORCED = policyComposer(POLICY_TYPE_SEEDING)
  .extend(POLICY_SEEDING_ITF)
  .unset('validSeedPositions')
  .set('policyName', 'ITF SEEDING, POSITIONS ENFORCED')
  .build();

it('disables placement actions for Round Robin Playoffs until all groups are complete', () => {
  const drawSize = 16;
  const groupSize = 4;
  const groupsCount = drawSize / groupSize;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const playoffStructuresCount = 4;
  const structureOptions = {
    groupSize,
    playoffGroups: [
      { finishingPositions: [1], structureName: goldFlight },
      { finishingPositions: [2], structureName: 'Silver Flight' },
      { finishingPositions: [3], structureName: 'Bronze Flight' },
      { finishingPositions: [4], structureName: 'Green Flight' },
    ],
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: drawSize },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'Round Robin w/ Playoffs',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent, success } = result;
  const { eventId } = createdEvent;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const matchUpFormat = FORMAT_STANDARD;
  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seedingProfile: { positioning: WATERFALL },
    structureOptions,
    matchUpFormat,
    drawType,
    drawSize,
    eventId,
  });
  const { drawId } = drawDefinition;

  expect(drawDefinition.links.length).toEqual(playoffStructuresCount);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  expect(mainStructure.structures.length).toEqual(groupsCount);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(4);

  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  expect(playoffStructures.length).toEqual(4);
  expect(playoffStructures[0].positionAssignments.length).toEqual(4);

  const playoffStructureIds = playoffStructures.map((structure) => structure.structureId);

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  const drawPosition = 1;
  result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    structureId: playoffStructureIds[0],
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toEqual(0);

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.includes(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  const completeStructures = (structure, structureOrder) => {
    const values = setsValues[structureOrder];
    const structureMatchUps = structure.matchUps;
    structureMatchUps.forEach((matchUp, matchUpIndex) => {
      const { matchUpId } = matchUp;
      const setValues = values[matchUpIndex];
      const outcome = generateMatchUpOutcome({
        matchUpFormat,
        setValues,
      });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
  };

  mainStructure.structures.slice(0, 2).forEach((structure, structureOrder) => {
    completeStructures(structure, structureOrder);
  });
  result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    structureId: playoffStructureIds[0],
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).toEqual(0);
  mainStructure.structures.slice(2).forEach((structure, structureOrder) => {
    completeStructures(structure, structureOrder + 2);
  });

  playoffStructures.forEach((structure) => {
    const { structureId } = structure;
    // position participants
    tournamentEngine.automatedPositioning({
      structureId,
      drawId,
    });
  });

  result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    structureId: playoffStructureIds[0],
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).not.toEqual(0);
});

it('Playoff drawPosition assignment includes group winners who lost no matchUps', () => {
  const drawSize = 8;
  const groupSize = 4;
  const groupsCount = drawSize / groupSize;
  const structureOptions = {
    playoffGroups: [{ finishingPositions: [1], structureName: goldFlight }],
    groupSize,
  };

  const drawProfiles = [
    {
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      participantsCount: drawSize,
      eventType: SINGLES,
      structureOptions,
      drawSize,
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: drawSize },
    // possible to specify score string with which to complete all matchUps
    completeAllMatchUps: '6-1 6-1', // in this case we want side 1 to always win
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  expect(mainStructure.structures.length).toEqual(groupsCount);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(4);

  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  expect(playoffStructures.length).toEqual(1);
  expect(playoffStructures[0].positionAssignments.length).toEqual(2);

  const playoffStructureIds = playoffStructures.map((structure) => structure.structureId);

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.includes(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  const { positionAssignments } = getPositionAssignments({
    structure: mainStructure,
    drawDefinition,
  });

  const firstAssignment = positionAssignments?.[0];
  const firstTally = firstClassOrExtension({ element: firstAssignment, attribute: 'tally', name: TALLY });
  expect(firstTally.matchUpsWon).toEqual(3);
  expect(firstTally.matchUpsLost).toEqual(0);
  const participantId = firstAssignment?.participantId;

  const structureId = playoffStructureIds[0];
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { structureIds: [structureId] },
  });
  expect(matchUps.length).toEqual(1);
  const { matchUpId } = matchUps[0];
  let result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    outcome: toBePlayed,
  });
  expect(result.success).toEqual(true);

  // first test with POLICY_SEEDING_DEFAULT included in policyDefinitions
  let drawPosition = 1;
  let policyDefinitions: any = {
    ...POLICY_POSITION_ACTIONS_UNRESTRICTED,
    ...POLICY_SEEDING_DEFAULT,
  };
  result = tournamentEngine.positionActions({
    structureId: playoffStructureIds[0],
    policyDefinitions,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).not.toEqual(0);

  let validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(LUCKY_LOSER)).toEqual(false);
  expect(validActionTypes.includes(ASSIGN_BYE)).toEqual(true);

  drawPosition = 2;
  result = tournamentEngine.positionActions({
    structureId: playoffStructureIds[0],
    policyDefinitions,
    drawPosition,
    drawId,
  });

  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(LUCKY_LOSER)).toEqual(false);
  expect(validActionTypes.includes(ASSIGN_BYE)).toEqual(true);
  expect(validActionTypes.includes(REMOVE_ASSIGNMENT)).toEqual(true);

  // remove one assignment to test available actions
  const { method, payload } = result.validActions.find(({ type }) => type === REMOVE_ASSIGNMENT);
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);

  result = tournamentEngine.positionActions({
    structureId: playoffStructureIds[0],
    policyDefinitions,
    drawPosition,
    drawId,
  });
  const assignmentAction = result.validActions.find(({ type }) => type === ASSIGN_PARTICIPANT);

  // expect that a participant who losts no matchUps is available for placement
  expect(assignmentAction.availableParticipantIds.includes(participantId)).toEqual(true);
  expect(assignmentAction.availableParticipantIds.length).toEqual(7);

  // now test with seed position enforced (default behavior)
  drawPosition = 1;
  policyDefinitions = POLICY_POSITION_ACTIONS_UNRESTRICTED;
  result = tournamentEngine.positionActions({
    drawId,
    structureId: playoffStructureIds[0],
    drawPosition,
    policyDefinitions,
  });
  expect(result.validActions.length).not.toEqual(0);

  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(LUCKY_LOSER)).toEqual(false);
  expect(intersection(validActionTypes, [REMOVE_ASSIGNMENT, ASSIGN_BYE]).length).toEqual(2);

  drawPosition = 2;
  result = tournamentEngine.positionActions({
    drawId,
    structureId: playoffStructureIds[0],
    drawPosition,
    policyDefinitions,
  });

  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(LUCKY_LOSER)).toEqual(false);
  expect(intersection(validActionTypes, [ASSIGN_PARTICIPANT, ASSIGN_BYE]).length).toEqual(2);
});

it('Playoff drawPosition assignment includes group winners who lost no matchUps', () => {
  const drawSize = 16;
  const groupSize = 4;
  const groupsCount = drawSize / groupSize;
  const structureOptions = {
    playoffGroups: [{ finishingPositions: [1], structureName: goldFlight }],
    groupSize,
  };

  const drawProfiles = [
    {
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      participantsCount: drawSize,
      eventType: SINGLES,
      structureOptions,
      drawSize,
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: drawSize },
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  expect(mainStructure.structures.length).toEqual(groupsCount);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(4);

  const matchUpFormat = FORMAT_STANDARD;
  const completeStructures = (structure, structureOrder) => {
    const values = setsValues[structureOrder];
    const structureMatchUps = structure.matchUps;
    structureMatchUps.forEach((matchUp, matchUpIndex) => {
      const { matchUpId } = matchUp;
      const setValues = values[matchUpIndex];
      const outcome = generateMatchUpOutcome({
        matchUpFormat,
        setValues,
      });
      const result = tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome,
      });
      expect(result.success).toEqual(true);
    });
  };

  mainStructure.structures.forEach((structure, structureOrder) => {
    completeStructures(structure, structureOrder);
  });

  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  expect(playoffStructures.length).toEqual(1);
  expect(playoffStructures[0].positionAssignments.length).toEqual(4);

  const playoffStructureIds = playoffStructures.map((structure) => structure.structureId);

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.includes(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  let result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const structureId = playoffStructureIds[0];
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { structureIds: [structureId] },
  });
  expect(matchUps.length).toEqual(3);

  // now test with seed position enforced (default behavior)
  let drawPosition = 1;
  const policyDefinitions = {
    ...POLICY_POSITION_ACTIONS_UNRESTRICTED,
    ...SEEDING_POSITIONS_ENFORCED,
  };
  result = tournamentEngine.positionActions({
    structureId: playoffStructureIds[0],
    policyDefinitions,
    drawPosition,
    drawId,
  });
  expect(result.validActions.length).not.toEqual(0);

  let validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(ASSIGN_BYE)).toEqual(true);

  drawPosition = 2;
  result = tournamentEngine.positionActions({
    structureId: playoffStructureIds[0],
    policyDefinitions,
    drawPosition,
    drawId,
  });

  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(ASSIGN_BYE)).toEqual(true);
  expect(validActionTypes.includes(REMOVE_ASSIGNMENT)).toEqual(true);

  // remove one assignment to test available actions
  let { method, payload } = result.validActions.find(({ type }) => type === REMOVE_ASSIGNMENT);
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);

  drawPosition = 3;
  result = tournamentEngine.positionActions({
    structureId: playoffStructureIds[0],
    policyDefinitions,
    drawPosition,
    drawId,
  });

  validActionTypes = result.validActions.map(({ type }) => type);
  expect(validActionTypes.includes(ASSIGN_BYE)).toEqual(true);
  expect(validActionTypes.includes(REMOVE_ASSIGNMENT)).toEqual(true);

  // remove one assignment to test available actions
  ({ method, payload } = result.validActions.find(({ type }) => type === REMOVE_ASSIGNMENT));
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);

  result = tournamentEngine.positionActions({
    structureId: playoffStructureIds[0],
    policyDefinitions,
    drawPosition,
    drawId,
  });
  const participantsAvailable = result.validActions.find(
    (action) => action.type === ASSIGN_PARTICIPANT,
  ).participantsAvailable;
  expect(participantsAvailable.length).toEqual(2);
});
