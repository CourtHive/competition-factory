import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { getConflicts } from './testGetConflicts';

it('can separate team members in an elimination structure', () => {
  // first create a tournament with a team event to mock teams with # of players
  const drawProfiles = [{ drawSize: 8, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }];
  const eventProfiles = [{ eventType: SINGLES_EVENT }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const teamParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
  }).participants;
  expect(teamParticipants.length).toEqual(8);

  const individualParticipantIds = teamParticipants.flatMap(({ individualParticipantIds }) =>
    individualParticipantIds.slice(0, 4),
  );
  expect(individualParticipantIds.length).toEqual(32);

  const singlesEvent = tournamentRecord.events.find(({ eventType }) => eventType === SINGLES_EVENT);

  const result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    eventId: singlesEvent.eventId,
  });
  expect(result.success).toEqual(true);

  const policyAttributes = [{ directive: 'teamParticipants' }];

  const avoidancePolicy = {
    roundsToSeparate: undefined,
    targetDivisions: undefined,
    policyAttributes,
  };
  const policyDefinitions = { [POLICY_TYPE_AVOIDANCE]: avoidancePolicy };

  const drawDefinition = tournamentEngine.generateDrawDefinition({
    eventId: singlesEvent.eventId,
    policyDefinitions,
  }).drawDefinition;
  expect(drawDefinition.entries.length).toEqual(32);

  const addResult = tournamentEngine.addDrawDefinition({
    eventId: singlesEvent.eventId,
    drawDefinition,
  });
  expect(addResult.success).toEqual(true);

  const individualParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantIds: individualParticipantIds },
    withGroupings: true,
  }).participants;
  expect(individualParticipants.length).toEqual(32);

  const structureId = drawDefinition.structures[0].structureId;
  const keysToTest = [{ key: 'teams.participantName' }];
  const { conflicts, sideParticipants } = getConflicts({
    tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
    drawId: drawDefinition.drawId,
    structureId,
    keysToTest,
  });
  expect(conflicts?.length).toEqual(0);
  expect(sideParticipants?.length).toEqual(16);
});
