import { modifyParticipantsSignInStatus } from '@Mutate/participants/modifyParticipantsSignInStatus';
import { legacyMode } from '@Tests/testHarness/legacyMode';

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

  // CODES 7.0.0 — the history is the first-class `presence` log, not SIGN_IN_STATUS timeItems.
  // The legacy storage shape is asserted in the legacyMode block below rather than dropped.
  let presence: any = tournamentEngine.getParticipantPresenceHistory({ participantId }).presence;
  expect(presence.length).toEqual(1);
  expect(presence.at(-1).state).toEqual(SIGNED_IN);

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

  // three appended facts: in, out, in — the log keeps every one
  presence = tournamentEngine.getParticipantPresenceHistory({ participantId }).presence;
  expect(presence.length).toEqual(3);
  expect(presence.map((a: any) => a.state)).toEqual([SIGNED_IN, SIGNED_OUT, SIGNED_IN]);
});

legacyMode('sign-in status storage shape', () => {
  it('writes SIGN_IN_STATUS timeItems readable through getTimeItem', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
    });
    tournamentEngine.setState(tournamentRecord);
    const participantId = tournamentRecord.participants[0].participantId;

    tournamentEngine.modifyParticipantsSignInStatus({ participantIds: [participantId], signInState: SIGNED_IN });

    const { timeItem, previousItems }: any = tournamentEngine.getTimeItem({
      returnPreviousValues: true,
      itemType: SIGN_IN_STATUS,
      participantId,
    });
    expect(previousItems.length).toEqual(0);
    expect(timeItem.itemValue).toEqual(SIGNED_IN);
  });
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
