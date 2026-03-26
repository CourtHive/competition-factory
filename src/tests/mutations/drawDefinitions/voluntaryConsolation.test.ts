import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Constants
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { EXISTING_STRUCTURE } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { DOUBLES } from '@Constants/eventConstants';
import { SINGLES } from '@Constants/matchUpTypes';

it('can generate a draw with voluntary consolation stage', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, voluntaryConsolation: {} }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(2);

  const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    matchUpsLimit: 1,
    drawId,
  });
  expect(eligibleParticipants.length).toEqual(16);

  const eligileParticipantIds = eligibleParticipants.map(({ participantId }) => participantId);

  let result = tournamentEngine.addDrawEntries({
    participantIds: eligileParticipantIds,
    entryStage: VOLUNTARY_CONSOLATION,
    entryStatus: DIRECT_ACCEPTANCE,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;

  const vcstageEntries = drawDefinition.entries.filter((e) => e.entryStage === VOLUNTARY_CONSOLATION);

  expect(vcstageEntries.length).toEqual(16);

  result = tournamentEngine.generateVoluntaryConsolation({
    automated: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.links.length).toEqual(0);
  expect(result.structures.length).toEqual(1);

  tournamentEngine.attachConsolationStructures({ structures: result.structures, links: result.links, drawId });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [VOLUNTARY_CONSOLATION] },
  });
  expect(matchUps.length).toEqual(15);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const { positionAssignments } = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(positionAssignments.length).toEqual(16);
  const assignedPositions = positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedPositions.length).toEqual(16);

  result = tournamentEngine.resetVoluntaryConsolationStructure({
    drawId,
  });
  expect(result.success).toEqual(true);

  let voluntaryConsolationEntries = drawDefinition.entries.filter(
    (entry) => entry.entryStage === VOLUNTARY_CONSOLATION,
  );
  expect(voluntaryConsolationEntries.length).toEqual(16);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const voluntaryStructure = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(voluntaryStructure.matchUpType).toEqual(SINGLES);
  expect(voluntaryStructure.matchUps.length).toEqual(0);
  expect(voluntaryStructure.seedAssignments.length).toEqual(0);
  expect(voluntaryStructure.positionAssignments.length).toEqual(0);

  result = tournamentEngine.resetVoluntaryConsolationStructure({
    resetEntries: true,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  voluntaryConsolationEntries = drawDefinition.entries.filter((entry) => entry.entryStage === VOLUNTARY_CONSOLATION);
  expect(voluntaryConsolationEntries.length).toEqual(0);
});

it('can generate a DOUBLES draw with voluntary consolation stage', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, eventType: DOUBLES, voluntaryConsolation: {} }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(2);

  const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    matchUpsLimit: 1,
    drawId,
  });
  expect(eligibleParticipants.length).toEqual(16);

  const eligileParticipantIds = eligibleParticipants.map(({ participantId }) => participantId);

  let result = tournamentEngine.addDrawEntries({
    participantIds: eligileParticipantIds,
    entryStage: VOLUNTARY_CONSOLATION,
    entryStatus: DIRECT_ACCEPTANCE,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;

  const vcstageEntries = drawDefinition.entries.filter((e) => e.entryStage === VOLUNTARY_CONSOLATION);

  expect(vcstageEntries.length).toEqual(16);

  result = tournamentEngine.generateVoluntaryConsolation({
    automated: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.links.length).toEqual(0);
  expect(result.structures.length).toEqual(1);

  tournamentEngine.attachConsolationStructures({ structures: result.structures, links: result.links, drawId });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [VOLUNTARY_CONSOLATION] },
  });
  expect(matchUps.length).toEqual(15);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const { positionAssignments } = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(positionAssignments.length).toEqual(16);
  const assignedPositions = positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedPositions.length).toEqual(16);

  result = tournamentEngine.resetVoluntaryConsolationStructure({
    drawId,
  });
  expect(result.success).toEqual(true);

  let voluntaryConsolationEntries = drawDefinition.entries.filter(
    (entry) => entry.entryStage === VOLUNTARY_CONSOLATION,
  );
  expect(voluntaryConsolationEntries.length).toEqual(16);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const voluntaryStructure = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(voluntaryStructure.matchUpType).toEqual(DOUBLES);
  expect(voluntaryStructure.matchUps.length).toEqual(0);
  expect(voluntaryStructure.seedAssignments.length).toEqual(0);
  expect(voluntaryStructure.positionAssignments.length).toEqual(0);

  result = tournamentEngine.resetVoluntaryConsolationStructure({
    resetEntries: true,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  voluntaryConsolationEntries = drawDefinition.entries.filter((entry) => entry.entryStage === VOLUNTARY_CONSOLATION);
  expect(voluntaryConsolationEntries.length).toEqual(0);
});

it('can generate a draw with voluntary consolation stage and delay attachment', () => {
  let notificationsCounter = 0;
  const subscriptions = {
    modifyDrawDefinition: () => {
      notificationsCounter += 1;
    },
  };
  let result = setSubscriptions({ subscriptions });
  expect(result.success).toEqual(true);

  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        voluntaryConsolation: { structureName: 'Voluntary Consolation' },
        drawSize: 32,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(2);

  const { flightProfile } = tournamentEngine.getFlightProfile({ eventId });

  const mainEntries = flightProfile.flights.find((flight) => flight.flightNumber === 1).drawEntries;
  const consolationParticipantIds = mainEntries.map(({ participantId }) => participantId);

  result = tournamentEngine.addDrawEntries({
    participantIds: consolationParticipantIds,
    entryStage: VOLUNTARY_CONSOLATION,
    entryStatus: DIRECT_ACCEPTANCE,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;

  const vcstageEntries = drawDefinition.entries.filter((e) => e.entryStage === VOLUNTARY_CONSOLATION);

  expect(vcstageEntries.length).toEqual(32);

  result = tournamentEngine.generateVoluntaryConsolation({
    automated: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.links.length).toEqual(0);
  expect(result.structures.length).toEqual(1);

  let { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [VOLUNTARY_CONSOLATION] },
  });
  expect(matchUps.length).toEqual(0);

  expect(notificationsCounter).toEqual(3);
  tournamentEngine.attachConsolationStructures({
    structures: result.structures,
    links: result.links,
    drawId,
  });
  expect(notificationsCounter).toEqual(4);

  matchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [VOLUNTARY_CONSOLATION] },
  }).matchUps;
  expect(matchUps.length).toEqual(31);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const { positionAssignments } = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(positionAssignments.length).toEqual(32);
  const assignedPositions = positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedPositions.length).toEqual(32);

  result = tournamentEngine.getDrawData({ drawId });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getEventData({ eventId });
  expect(result.eventData.drawsData[0].structures.length).toEqual(2);
});

it('can generate a draw with voluntary consolation stage with 5 entries', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, voluntaryConsolation: {} }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(2);

  const { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    matchUpsLimit: 1,
    drawId,
  });
  expect(eligibleParticipants.length).toEqual(16);

  const eligileParticipantIds = eligibleParticipants.map(({ participantId }) => participantId).slice(0, 5);

  let result = tournamentEngine.addDrawEntries({
    participantIds: eligileParticipantIds,
    entryStage: VOLUNTARY_CONSOLATION,
    entryStatus: DIRECT_ACCEPTANCE,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;

  const vcstageEntries = drawDefinition.entries.filter((e) => e.entryStage === VOLUNTARY_CONSOLATION);

  expect(vcstageEntries.length).toEqual(5);

  result = tournamentEngine.generateVoluntaryConsolation({
    automated: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.links.length).toEqual(0);
  expect(result.structures.length).toEqual(1);

  tournamentEngine.attachConsolationStructures({ structures: result.structures, links: result.links, drawId });

  result = tournamentEngine.generateVoluntaryConsolation({
    automated: true,
    drawId,
  });
  expect(result.error).toEqual(EXISTING_STRUCTURE);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [VOLUNTARY_CONSOLATION] },
  });
  expect(matchUps.length).toEqual(7);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const { positionAssignments } = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(positionAssignments.length).toEqual(8);
  const assignedPositions = positionAssignments.filter(({ participantId }) => participantId);
  expect(assignedPositions.length).toEqual(5);

  result = tournamentEngine.resetVoluntaryConsolationStructure({
    drawId,
  });
  expect(result.success).toEqual(true);

  let voluntaryConsolationEntries = drawDefinition.entries.filter(
    (entry) => entry.entryStage === VOLUNTARY_CONSOLATION,
  );
  expect(voluntaryConsolationEntries.length).toEqual(5);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const voluntaryStructure = drawDefinition.structures.find(({ stage }) => stage === VOLUNTARY_CONSOLATION);
  expect(voluntaryStructure.matchUps.length).toEqual(0);
  expect(voluntaryStructure.seedAssignments.length).toEqual(0);
  expect(voluntaryStructure.positionAssignments.length).toEqual(0);

  result = tournamentEngine.resetVoluntaryConsolationStructure({
    resetEntries: true,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  voluntaryConsolationEntries = drawDefinition.entries.filter((entry) => entry.entryStage === VOLUNTARY_CONSOLATION);
  expect(voluntaryConsolationEntries.length).toEqual(0);
});
