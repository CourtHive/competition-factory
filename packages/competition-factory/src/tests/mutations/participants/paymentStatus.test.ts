import { modifyParticipantsPaymentStatus } from '@Mutate/participants/modifyParticipantsPaymentStatus';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import queryEngine from '@Engines/queryEngine';
import { expect, it } from 'vitest';

// constants
import { PAID, UNPAID, PARTIAL, WAIVED, REFUNDED, PAYMENT_STATUS } from '@Constants/participantConstants';
import {
  INVALID_VALUES,
  MISSING_PARTICIPANTS,
  MISSING_PARTICIPANT_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it('can set and read participant payment status across all enum values', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();
  const { participantId } = participants[0];

  let result: any = queryEngine.getParticipantPaymentStatus({ participantId });
  expect(result).toBeUndefined();

  result = tournamentEngine.modifyParticipantsPaymentStatus({
    // participantIds: [participantId],
    paymentState: PAID,
  });
  expect(result.error).toEqual(MISSING_VALUE);

  result = tournamentEngine.modifyParticipantsPaymentStatus({
    participantIds: ['foo'],
    paymentState: PAID,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  for (const state of [PAID, UNPAID, PARTIAL, WAIVED, REFUNDED]) {
    result = tournamentEngine.modifyParticipantsPaymentStatus({
      participantIds: [participantId],
      paymentState: state,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.getParticipantPaymentStatus({ participantId });
    expect(result).toEqual(state);
  }

  result = tournamentEngine.getParticipantPaymentStatus({});
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

  result = tournamentEngine.getParticipantPaymentStatus({ participantId: 'unknownId' });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

  const { timeItem, previousItems } = tournamentEngine.getTimeItem({
    returnPreviousValues: true,
    itemType: PAYMENT_STATUS,
    participantId,
  });
  expect(previousItems.length).toEqual(4);
  expect(timeItem.itemValue).toEqual(REFUNDED);
});

it('returns error when tournamentRecord is missing', () => {
  const result = modifyParticipantsPaymentStatus({
    tournamentRecord: undefined,
    participantIds: ['p1'],
    paymentState: PAID,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('returns error for invalid paymentState', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();
  const { participantId } = participants[0];

  const result = tournamentEngine.modifyParticipantsPaymentStatus({
    participantIds: [participantId],
    paymentState: 'INVALID_STATE',
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.paymentState).toEqual('INVALID_STATE');
});

it('returns error when tournament has no participants', () => {
  const result = modifyParticipantsPaymentStatus({
    tournamentRecord: { tournamentId: 't1', participants: [] } as any,
    participantIds: ['p1'],
    paymentState: PAID,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANTS);
});

it('returns error when tournament participants is undefined', () => {
  const result = modifyParticipantsPaymentStatus({
    tournamentRecord: { tournamentId: 't1' } as any,
    participantIds: ['p1'],
    paymentState: PAID,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANTS);
});
