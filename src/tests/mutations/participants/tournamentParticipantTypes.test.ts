import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

import { GROUP, INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

it('can generate TEAMs from attributes', () => {
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 64 }],
  });
  tournamentEngine.setState(result.tournamentRecord);

  let participantsCount = tournamentEngine.getParticipants().participants.length;
  expect(participantsCount).toEqual(64);

  result = tournamentEngine.createTeamsFromParticipantAttributes({
    accessor: 'person.addresses.city',
    addParticipants: false,
  });

  participantsCount = tournamentEngine.getParticipants().participants.length;
  expect(participantsCount).toEqual(64);

  expect(result.success).toEqual(true);
  expect(result.newParticipants.length).toBeGreaterThan(0);
  expect(result.participantsAdded).toBeUndefined();

  result = tournamentEngine.createTeamsFromParticipantAttributes({
    accessor: 'person.addresses.city',
  });

  participantsCount = tournamentEngine.getParticipants().participants.length;
  expect(participantsCount).toBeGreaterThan(64);

  expect(result.participantsAdded).toBeGreaterThan(0);
  expect(result.newParticipants).toBeUndefined();
});

it('can generate TEAM events', () => {
  const personExtensions = [{ name: 'districtCode', value: 'Z' }];
  const nationalityCodesCount = 10;
  const participantsCount = 32;
  const participantsProfile = {
    participantType: PAIR,
    nationalityCodesCount,
    participantsCount,
    personExtensions,
  };

  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: participantsCount, eventType: DOUBLES }],
    participantsProfile,
  });

  tournamentEngine.setState(result.tournamentRecord);

  const groupsToGenerate = 6;
  const participantsPerGroup = 10;
  const schoolResponsibility = 'school';

  result = tournamentEngine.createTeamsFromParticipantAttributes({
    personAttribute: 'nationalityCode',
  });
  expect(result.success).toEqual(true);

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  expect(individualParticipants.length).toEqual(64);

  generateRange(0, groupsToGenerate).forEach((index) => {
    const individualParticipantIds = individualParticipants
      .slice(participantsPerGroup * index, participantsPerGroup * (index + 1))
      .map(getParticipantId);

    result = tournamentEngine.createGroupParticipant({
      participantRoleResponsibilities: [schoolResponsibility],
      groupName: `School ${index + 1}`,
      individualParticipantIds,
    });
  });

  const { participants: groupTournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [GROUP] },
  });
  expect(groupTournamentParticipants.length).toEqual(groupsToGenerate);

  expect(groupTournamentParticipants[0].individualParticipantIds.length).toEqual(participantsPerGroup);

  const { participants: pairTournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  expect(pairTournamentParticipants.length).toEqual(participantsCount);

  const { participants: teamTournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(teamTournamentParticipants.length).toEqual(10);

  let { participants: inContextIdividualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    inContext: true,
  });

  expect(inContextIdividualParticipants[0].person.extensions).toEqual(personExtensions);

  let mappedMatchUps;
  ({ participants: inContextIdividualParticipants, mappedMatchUps } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    withIndividualParticipants: true,
    convertExtensions: true,
    withStatistics: true,
    withGroupings: true,
    withMatchUps: true,
    withEvents: false,
    withDraws: false,
  }));

  expect(inContextIdividualParticipants[0].person._districtCode).toEqual('Z');
  const matchUpId = inContextIdividualParticipants[0].matchUps[0].matchUpId;
  expect(matchUpId).toBeDefined();
  expect(mappedMatchUps[matchUpId].tournamentId).toBeDefined();

  const individualsInGroups = inContextIdividualParticipants.filter(
    (participant) => participant.groupParticipantIds.length,
  );
  expect(individualsInGroups.length).toEqual(60);

  const individualsInTeams = inContextIdividualParticipants.filter(
    (participant) => participant.teamParticipantIds.length,
  );
  expect(individualsInTeams.length).toEqual(64);
  const individualsInPairs = inContextIdividualParticipants.filter(
    (participant) => participant.pairParticipantIds.length,
  );
  expect(individualsInPairs.length).toEqual(64);

  const { participants: participantsWithResponsibilities } = tournamentEngine.getParticipants({
    participantFilters: {
      participantRoleResponsibilities: [schoolResponsibility],
    },
  });

  expect(participantsWithResponsibilities.length).toEqual(groupsToGenerate);

  const responsibilityGroupNameMapping = Object.assign(
    {},
    ...participantsWithResponsibilities.map(({ participantId, participantName }) => ({
      [participantId]: participantName,
    })),
  );

  individualsInGroups.forEach((participant) => {
    participant.groupParticipantIds.forEach((groupParticipantId) => {
      expect(responsibilityGroupNameMapping[groupParticipantId]).not.toBeUndefined();
    });
  });
});
