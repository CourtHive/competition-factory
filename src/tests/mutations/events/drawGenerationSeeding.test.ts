import { getEliminationDrawSize } from '@Query/participants/getEliminationDrawSize';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { MISSING_DRAW_SIZE, UNRECOGNIZED_DRAW_TYPE } from '@Constants/errorConditionConstants';
import POLICY_AVOIDANCE_COUNTRY from '@Fixtures/policies/POLICY_AVOIDANCE_COUNTRY';
import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SPLIT_WATERFALL } from '@Constants/flightConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SEEDING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

const TEST_EVENT = 'Test Event';
const d200606 = '2020-06-06';

it('can sort entries by scaleAttributes when generatingflighProfiles', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = TEST_EVENT;
  const event = { eventName, category: { categoryName: 'U18' } };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  let tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;
  const participantIds = tournamentParticipants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8];
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleType: SEEDING,
      eventType: SINGLES,
      scaleDate: d200606,
      scaleName: 'U18',
      scaleValue,
    };
    const participantId = participantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  const scaleAttributes = {
    scaleType: SEEDING,
    eventType: SINGLES,
    scaleName: 'U18',
  };
  participantIds.forEach((participantId, index) => {
    const { scaleItem } = tournamentEngine.getParticipantScaleItem({
      scaleAttributes,
      participantId,
    });
    if (scaleValues[index]) expect(scaleItem.scaleValue).toEqual(scaleValues[index]);

    const result = tournamentEngine.getParticipantScaleItem({
      scaleAttributes,
      participantId,
    });

    expect(result.tournamentId).toEqual(tournamentRecord.tournamentId);

    if (scaleValues[index]) expect(result.scaleItem.scaleValue).toEqual(scaleValues[index]);
  });

  const { flightProfile } = tournamentEngine.generateFlightProfile({
    splitMethod: SPLIT_WATERFALL,
    attachFlightProfile: true,
    scaleAttributes,
    flightsCount: 2,
    eventId,
  });

  const drawDefinitions: any[] = [];
  flightProfile.flights?.forEach((flight) => {
    const participantsCount = flight.drawEntries.length;
    const { drawSize } = getEliminationDrawSize({
      participantsCount,
    });
    const { seedsCount } = tournamentEngine.getSeedsCount({
      policyDefinitions: SEEDING_USTA,
      participantsCount,
      drawSize,
    });
    result = tournamentEngine.generateDrawDefinition({
      drawEntries: flight.drawEntries,
      drawId: flight.drawId,
      seedsCount,
      eventId,
    });
    const drawDefinition = result.drawDefinition;
    drawDefinitions.push(drawDefinition);

    expect(drawDefinition.structures[0].seedLimit).toEqual(seedsCount);
    expect(drawDefinition.structures[0].seedAssignments.length).toEqual(seedsCount);
    expect(drawDefinition.structures[0].seedAssignments.map(({ seedValue }) => seedValue)).toEqual([1, 2, 3, 4]);

    result = tournamentEngine.getEntriesAndSeedsCount({
      policyDefinitions: SEEDING_USTA,
      drawId: flight.drawId,
      eventId,
    });
    expect(result.seedsCount).toEqual(seedsCount);
    expect(result.entries.length).toEqual(drawSize);
    expect(result.stageEntries.length).toEqual(drawSize);

    result = tournamentEngine.getEntriesAndSeedsCount({
      policyDefinitions: SEEDING_USTA,
      drawId: flight.drawId,
    });
    expect(result.entries.length).toEqual(16);

    result = tournamentEngine.getEntriesAndSeedsCount({
      policyDefinitions: SEEDING_USTA,
      eventId,
    });
    expect(result.entries.length).toEqual(32);

    result = tournamentEngine.getEntriesAndSeedsCount({
      policyDefinitions: SEEDING_USTA,
      stage: QUALIFYING,
      eventId,
    });
    expect(result.error).toEqual(MISSING_DRAW_SIZE);
  });

  tournamentEngine.getParticipants({
    withDraws: true,
  });

  for (const drawDefinition of drawDefinitions) {
    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(result.success).toEqual(true);
  }

  tournamentParticipants = tournamentEngine.getParticipants({
    withSeeding: true,
    withDraws: true,
  }).participants;

  const seedAssignments = tournamentParticipants
    .map((participant) => participant.draws?.[0].seedAssignments.MAIN)
    .filter(Boolean)
    .sort();

  const seedValues = seedAssignments.map((assignment) => assignment.seedValue);
  // we have 2 flights...
  expect(seedValues).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
});

it('can constrain seedsCount by policyDefinitions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = TEST_EVENT;
  const ageCategoryCode = 'U18';
  const event = { eventName, category: { ageCategoryCode } };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;
  const participantIds = tournamentParticipants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8];
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleName: ageCategoryCode,
      scaleType: SEEDING,
      eventType: SINGLES,
      scaleDate: d200606,
      scaleValue,
    };
    const participantId = participantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  const participantsCount = 32;
  const drawSize = 32;

  const { seedsCount } = tournamentEngine.getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount,
    drawSize,
  });

  let { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seedingProfile: { groupSeedingThreshold: 5 },
    seedsCount: 100, // this is in excess of policy limit and above drawSize and stageEntries #
    drawSize,
    eventId,
  });

  expect(drawDefinition.structures[0].seedAssignments.map(({ seedValue }) => seedValue)).toEqual([
    1, 2, 3, 4, 5, 5, 5, 5,
  ]);
  expect(drawDefinition.structures[0].seedLimit).toEqual(seedsCount);

  drawDefinition = tournamentEngine.generateDrawDefinition({
    seedingProfile: { groupSeedingThreshold: 3 },
    seedsCount: 100, // this is in excess of policy limit and above drawSize and stageEntries #
    drawSize,
    eventId,
  }).drawDefinition;

  expect(drawDefinition.structures[0].seedAssignments.map(({ seedValue }) => seedValue)).toEqual([
    1, 2, 3, 3, 5, 5, 5, 5,
  ]);
  expect(drawDefinition.structures[0].seedLimit).toEqual(seedsCount);
});

it('can constrain seedsCount by policyDefinitions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = TEST_EVENT;
  const ageCategoryCode = 'U18';
  const event = { eventName, category: { ageCategoryCode } };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;
  const participantIds = tournamentParticipants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const scaleValues = [1, 2, 3, 3, 5, 5, 5, 5];
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleName: ageCategoryCode,
      scaleType: SEEDING,
      eventType: SINGLES,
      scaleDate: d200606,
      scaleValue,
    };
    const participantId = participantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  const drawSize = 32;
  const participantsCount = 32;

  const { seedsCount } = tournamentEngine.getSeedsCount({
    policyDefinitions: SEEDING_USTA,
    participantsCount,
    drawSize,
  });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seedsCount: 100, // this is in excess of policy limit and above drawSize and stageEntries #
    drawSize,
    eventId,
  });

  expect(drawDefinition.structures[0].seedAssignments.map(({ seedValue }) => seedValue)).toEqual([
    1, 2, 3, 3, 5, 5, 5, 5,
  ]);
  expect(drawDefinition.structures[0].seedLimit).toEqual(seedsCount);
});

it('can define seeds using seededParticipants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = TEST_EVENT;
  const ageCategoryCode = 'U18';
  const event = { eventName, category: { ageCategoryCode } };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const policyDefinitions = POLICY_AVOIDANCE_COUNTRY;
  result = tournamentEngine.attachPolicies({ policyDefinitions, eventId });
  expect(result.success).toEqual(true);

  const tournamentParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;
  const participantIds = tournamentParticipants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const seededParticipants = participantIds.slice(0, 8).map((participantId, i) => ({
    participantId,
    seedNumber: 8 - i,
    seedValue: 8 - i,
  }));

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seededParticipants,
    drawSize: 32,
    eventId,
  });
  expect(drawDefinition.structures[0].seedLimit).toEqual(8);

  // code coverage
  result = tournamentEngine.generateDrawDefinition({
    drawType: 'Bogus Draw Type',
    drawSize: 32,
    eventId,
  });
  expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
});
