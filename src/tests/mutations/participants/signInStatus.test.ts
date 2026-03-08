import { modifyParticipantsSignInStatus } from '@Mutate/participants/modifyParticipantsSignInStatus';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import queryEngine from '@Engines/queryEngine';
import { expect, it } from 'vitest';

// constants
import { SIGNED_IN, SIGNED_OUT, SIGN_IN_STATUS } from '@Constants/participantConstants';
import {
  INVALID_VALUES,
  MISSING_PARTICIPANTS,
  MISSING_PARTICIPANT_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it('can sign participants in and out', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();

  const { participantId } = participants[0];

  let result = queryEngine.getParticipantSignInStatus({
    participantId,
  });
  expect(result).toBeUndefined();

  result = tournamentEngine.modifyParticipantsSignInStatus({
    // participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  expect(result.error).toEqual(MISSING_VALUE);

  result = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: ['foo'],
    signInState: SIGNED_IN,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getParticipantSignInStatus({
    participantId,
  });
  expect(result).toEqual(SIGNED_IN);

  result = tournamentEngine.getParticipantSignInStatus({});
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

  result = tournamentEngine.getParticipantSignInStatus({
    participantId: 'unknownId',
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

  let { timeItem, previousItems } = tournamentEngine.getTimeItem({
    returnPreviousValues: true,
    itemType: SIGN_IN_STATUS,
    participantId,
  });
  expect(previousItems.length).toEqual(0);
  expect(timeItem.itemValue).toEqual(SIGNED_IN);

  result = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [participantId],
    signInState: SIGNED_OUT,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getParticipantSignInStatus({
    participantId,
  });
  expect(result).toEqual(SIGNED_IN);

  ({ timeItem, previousItems } = tournamentEngine.getTimeItem({
    returnPreviousValues: true,
    itemType: SIGN_IN_STATUS,
    participantId,
  }));
  expect(previousItems.length).toEqual(2);
  expect(timeItem.itemValue).toEqual(SIGNED_IN);
});

it('returns error when tournamentRecord is missing', () => {
  const result = modifyParticipantsSignInStatus({
    tournamentRecord: undefined,
    participantIds: ['p1'],
    signInState: SIGNED_IN,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('returns error for invalid signInState', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();
  const { participantId } = participants[0];

  const result = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [participantId],
    signInState: 'INVALID_STATE',
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.signInState).toEqual('INVALID_STATE');
});

it('returns error when tournament has no participants', () => {
  const result = modifyParticipantsSignInStatus({
    tournamentRecord: { tournamentId: 't1', participants: [] } as any,
    participantIds: ['p1'],
    signInState: SIGNED_IN,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANTS);
});

it('returns error when tournament participants is undefined', () => {
  const result = modifyParticipantsSignInStatus({
    tournamentRecord: { tournamentId: 't1' } as any,
    participantIds: ['p1'],
    signInState: SIGNED_IN,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANTS);
});
