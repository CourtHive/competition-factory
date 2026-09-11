import { getParticipants } from '@Query/participants/getParticipants';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { GROUP, INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';

it('can create group participants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  let participantAddCounter = 0;
  let result = setSubscriptions({
    subscriptions: {
      [ADD_PARTICIPANTS]: () => {
        participantAddCounter += 1;
      },
    },
  });
  expect(result.success).toEqual(true);

  tournamentEngine.setState(tournamentRecord);
  const individualParticipants =
    getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
      tournamentRecord,
    }).participants ?? [];

  const [participant1, participant2] = individualParticipants;

  const individualParticipantIds = [participant1.participantId, participant2.participantId];
  result = tournamentEngine.createGroupParticipant({
    individualParticipantIds,
  });
  expect(result.error).not.toBeUndefined();

  const groupName = 'Group Name';
  result = tournamentEngine.createGroupParticipant({
    individualParticipantIds: 'not an array',
    groupName,
  });
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.createGroupParticipant({
    individualParticipantIds: ['bogusId'],
    groupName,
  });
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.createGroupParticipant({
    individualParticipantIds,
    groupName,
  });
  expect(result.success).toEqual(true);
  expect(participantAddCounter).toBeGreaterThan(0);

  const { tournamentRecord: updatedTournamentRecord } = tournamentEngine.getTournament();
  const { participants: groupParticipants } = getParticipants({
    tournamentRecord: updatedTournamentRecord,
    participantFilters: { participantTypes: [GROUP] },
  });

  expect(groupParticipants?.length).toEqual(1);
});

/**
 * F4 — creating one group used to fire ADD_PARTICIPANTS **twice**.
 *
 * `createGroupParticipant` called `addParticipant` (which emits) and then emitted a second,
 * hand-rolled notice with an identical payload, so every subscriber did double work per group.
 *
 * Two things make this easy to test WRONGLY, and both were hit while writing it:
 *
 * 1. The test above cannot catch it — `expect(participantAddCounter).toBeGreaterThan(0)` is satisfied
 *    by 1 and by 2 alike, which is exactly how the duplicate survived.
 * 2. Counting SUBSCRIBER CALLS cannot catch it either. Subscribers are invoked **once per flush** with
 *    an **array** of payloads, so the duplicate reads as `callbackCalls: 1, payloads: [2]` — measured.
 *    A first draft of this test counted callbacks, passed, and stayed passing when the bug was put
 *    back. It proved nothing.
 *
 * So this counts PAYLOADS, and pairs the assertion with a control — a single ordinary
 * `addParticipants` call, which must produce exactly one — so a probe that silently counts nothing
 * cannot be mistaken for a fix.
 */
it('fires ADD_PARTICIPANTS exactly ONCE per group created', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ participantsCount: 4 });
  tournamentEngine.setState(tournamentRecord);

  let payloadCount = 0;
  setSubscriptions({
    subscriptions: {
      [ADD_PARTICIPANTS]: (payloads: any) => {
        payloadCount += Array.isArray(payloads) ? payloads.length : 1;
      },
    },
  });

  const individualParticipantIds = (
    getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
      tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
    }).participants ?? []
  )
    .slice(0, 2)
    .map(({ participantId }) => participantId);

  // CONTROL: one ordinary participant addition emits exactly one notice, so the counter is known to
  // count — a probe that reported 1 because it never fired would prove nothing.
  const controlResult = tournamentEngine.addParticipants({
    participants: [
      {
        // `participantRole` is required — `addParticipant` refuses a role-less participant.
        participantId: 'control-individual',
        participantName: 'Control',
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
        person: { standardGivenName: 'Con', standardFamilyName: 'Trol' },
      },
    ],
  });
  expect(controlResult.success).toEqual(true);
  expect(payloadCount).toEqual(1);

  payloadCount = 0;
  const result = tournamentEngine.createGroupParticipant({
    groupName: 'Notice Count Group',
    individualParticipantIds,
  });
  expect(result.success).toEqual(true);

  // The assertion. Measured against the pre-fix code this was 2.
  expect(payloadCount).toEqual(1);
});
