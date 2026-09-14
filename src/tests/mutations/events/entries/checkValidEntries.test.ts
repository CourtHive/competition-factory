import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import { INVALID_ENTRIES, INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';

it('can validate entries', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 8, gender: MALE }, // order is important here
      { drawSize: 2, gender: FEMALE },
    ],
  });
  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.gender).toEqual(MALE);

  result = tournamentEngine.checkValidEntries({ event });
  expect(result.success).toEqual(true);

  const femaleParticipants = tournamentEngine.getParticipants({
    participantFilters: { genders: [FEMALE] },
  }).participants;

  expect(femaleParticipants.map((participant) => participant.person.sex)).toEqual([FEMALE, FEMALE]);

  const femaleParticipantIds = femaleParticipants.map(xa('participantId'));

  result = tournamentEngine.addEventEntries({
    participantIds: femaleParticipantIds,
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(result.context.mismatchedGender.length).toEqual(femaleParticipantIds.length);

  result = tournamentEngine.addEventEntries({
    participantIds: femaleParticipantIds,
    enforceGender: false,
    eventId,
  });
  expect(result.success).toEqual(true);

  event = tournamentEngine.getEvent({ eventId }).event;
  result = tournamentEngine.checkValidEntries({ event });
  expect(result.error).toEqual(INVALID_ENTRIES);

  result = tournamentEngine.checkValidEntries({ event, enforceGender: false });
  expect(result.success).toEqual(true);
  expect(result.valid).toEqual(true);

  let policyDefinitions = {
    [POLICY_TYPE_MATCHUP_ACTIONS]: { participants: { enforceGender: true } },
  };
  result = tournamentEngine.checkValidEntries({
    enforceGender: false,
    policyDefinitions,
    event,
  });
  expect(result.success).toEqual(true);
  expect(result.valid).toEqual(true);

  result = tournamentEngine.checkValidEntries({
    policyDefinitions,
    event,
  });
  expect(result.error).toEqual(INVALID_ENTRIES);

  policyDefinitions = {
    [POLICY_TYPE_MATCHUP_ACTIONS]: { participants: { enforceGender: false } },
  };
  result = tournamentEngine.checkValidEntries({
    policyDefinitions,
    event,
  });
  expect(result.success).toEqual(true);
  expect(result.valid).toEqual(true);
});
