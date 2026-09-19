import { getParticipantSignInStatus } from '@Query/participant/signInStatus';
import { legacyMode } from '@Tests/testHarness/legacyMode';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SIGNED_IN, SIGNED_OUT, SIGN_IN_STATUS } from '@Constants/participantConstants';
import { UNSUPPORTED_IN_LEGACY_MODE } from '@Constants/errorConditionConstants';
import { DECLARED_ATTRIBUTION } from '@Constants/presenceConstants';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

function fixture(localTimeZone?: string) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4 },
  });
  if (localTimeZone) tournamentRecord.localTimeZone = localTimeZone;
  tournamentEngine.setState(tournamentRecord, false);
  const participantId = tournamentRecord.participants[0].participantId;
  return { tournamentRecord, participantId };
}

const readParticipant = (participantId: string) =>
  tournamentEngine.getTournament().tournamentRecord.participants.find((p: any) => p.participantId === participantId);

it('stores sign-in as a first-class attestation, not a timeItem', () => {
  const { participantId } = fixture();

  const result: any = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  expect(result).toMatchObject(SUCCESS);

  const participant = readParticipant(participantId);
  expect(participant.presence.length).toEqual(1);
  expect(participant.presence[0].state).toEqual(SIGNED_IN);
  // the subject is the participant the log hangs on, and it is named explicitly on the entry
  expect(participant.presence[0].participantId).toEqual(participantId);
  expect((participant.timeItems ?? []).filter((t: any) => t.itemType === SIGN_IN_STATUS)).toEqual([]);

  // the derived latest-value reader is unchanged for every existing consumer
  expect(
    getParticipantSignInStatus({ tournamentRecord: tournamentEngine.getTournament().tournamentRecord, participantId }),
  ).toEqual(SIGNED_IN);
});

it('appends rather than overwrites, so the arrival survives the departure', () => {
  const { participantId } = fixture();

  tournamentEngine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-17T13:00:00.000Z',
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  tournamentEngine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-17T22:00:00.000Z',
    participantIds: [participantId],
    signInState: SIGNED_OUT,
  });

  const participant = readParticipant(participantId);
  expect(participant.presence.length).toEqual(2);
  expect(participant.presence.map((a: any) => a.state)).toEqual([SIGNED_IN, SIGNED_OUT]);
});

it('answers "was this person here on that day" from the history', () => {
  const { participantId } = fixture('UTC');
  const engine = tournamentEngine;

  engine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-17T13:00:00.000Z',
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  engine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-17T22:00:00.000Z',
    participantIds: [participantId],
    signInState: SIGNED_OUT,
  });
  engine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-18T13:00:00.000Z',
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });

  // present on the 18th
  expect(engine.getParticipantSignedInOnDate({ participantId, date: '2026-09-18' }).signedIn).toEqual(true);

  // signed in AND out on the 17th — the last action of that day was leaving, so NOT present
  expect(engine.getParticipantSignedInOnDate({ participantId, date: '2026-09-17' }).signedIn).toEqual(false);

  // a day with no entry is false, and means "not signed in on this date" — never "signed out"
  const quiet: any = engine.getParticipantSignedInOnDate({ participantId, date: '2026-09-16' });
  expect(quiet.signedIn).toEqual(false);
  expect(quiet.entries).toEqual([]);

  // the LATEST-value reader cannot answer this: it still reports SIGNED_IN for every date
  expect(
    getParticipantSignInStatus({ tournamentRecord: engine.getTournament().tournamentRecord, participantId }),
  ).toEqual(SIGNED_IN);
});

it('resolves the calendar day in the venue zone, and reports which zone it used', () => {
  const { participantId } = fixture('America/New_York');

  // 01:00Z on the 18th is 21:00 on the 17th in New York. A UTC day boundary would file this under the
  // wrong day — the exact bug TMX shipped and fixed in #1352/#1355.
  tournamentEngine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-18T01:00:00.000Z',
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });

  const zoned: any = tournamentEngine.getParticipantSignedInOnDate({ participantId, date: '2026-09-17' });
  expect(zoned.signedIn).toEqual(true);
  expect(zoned.timeZone).toEqual('America/New_York');
  expect(zoned.zoneSource).toEqual('tournament');

  expect(tournamentEngine.getParticipantSignedInOnDate({ participantId, date: '2026-09-18' }).signedIn).toEqual(false);
});

it('declares when no zone could be resolved rather than pretending UTC is the venue', () => {
  const { participantId } = fixture();

  tournamentEngine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-18T01:00:00.000Z',
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });

  const result: any = tournamentEngine.getParticipantSignedInOnDate({ participantId, date: '2026-09-18' });
  expect(result.signedIn).toEqual(true);
  // the one case where the answer can be wrong is the one case where it says so
  expect(result.zoneSource).toEqual('none');
  expect(result.timeZone).toBeUndefined();
});

it('lists everyone still signed in, role-agnostically, for the end-of-day close', () => {
  const { tournamentRecord } = fixture('UTC');
  const [a, b] = tournamentRecord.participants.map((p: any) => p.participantId);

  tournamentEngine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-18T13:00:00.000Z',
    participantIds: [a, b],
    signInState: SIGNED_IN,
  });
  tournamentEngine.modifyParticipantsSignInStatus({
    occurredAt: '2026-09-18T18:00:00.000Z',
    participantIds: [b],
    signInState: SIGNED_OUT,
  });

  const result: any = tournamentEngine.getParticipantsStillSignedInOnDate({ date: '2026-09-18' });
  expect(result.participantIds).toEqual([a]);
});

it('records who attested the sign-in', () => {
  const { participantId } = fixture();

  tournamentEngine.modifyParticipantsSignInStatus({
    attributedTo: {
      attributionType: DECLARED_ATTRIBUTION,
      relationship: ContactRelationshipEnum.GUARDIAN,
      name: 'R. Okonkwo',
    },
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });

  const [attestation] = readParticipant(participantId).presence;
  expect(attestation.participantId).toEqual(participantId);
  expect(attestation.attributedTo.relationship).toEqual(ContactRelationshipEnum.GUARDIAN);
});

it('reads a pre-promotion participant whose sign-ins are still timeItems', () => {
  const { tournamentRecord, participantId } = fixture('UTC');

  const participant = tournamentRecord.participants.find((p: any) => p.participantId === participantId);
  participant.timeItems = [
    { itemType: SIGN_IN_STATUS, itemValue: SIGNED_IN, createdAt: '2026-09-17T13:00:00.000Z' },
    { itemType: SIGN_IN_STATUS, itemValue: SIGNED_OUT, createdAt: '2026-09-17T22:00:00.000Z' },
  ];
  tournamentEngine.setState(tournamentRecord, false);

  // the legacy timeItem names no subject — the accessor supplies it from the element it hangs on
  const history: any = tournamentEngine.getParticipantPresenceHistory({ participantId });
  expect(history.presence.map((a: any) => a.state)).toEqual([SIGNED_IN, SIGNED_OUT]);
  expect(history.presence.every((a: any) => a.participantId === participantId)).toEqual(true);

  expect(tournamentEngine.getParticipantSignedInOnDate({ participantId, date: '2026-09-17' }).signedIn).toEqual(false);
});

it('promotes a legacy sign-in log through migrateTournamentRecord', () => {
  const { tournamentRecord, participantId } = fixture();

  const participant = tournamentRecord.participants.find((p: any) => p.participantId === participantId);
  participant.timeItems = [
    { itemType: SIGN_IN_STATUS, itemValue: SIGNED_IN, createdAt: '2023-09-29T13:00:00.000Z' },
    { itemType: SIGN_IN_STATUS, itemValue: SIGNED_OUT, createdAt: '2023-09-29T22:00:00.000Z' },
  ];
  tournamentEngine.setState(tournamentRecord, false);

  const result: any = tournamentEngine.migrateTournamentRecord({ tournamentRecord });
  expect(result.promoted.participantPresence).toEqual(2);

  const migrated = tournamentRecord.participants.find((p: any) => p.participantId === participantId);
  expect(migrated.presence.map((a: any) => a.state)).toEqual([SIGNED_IN, SIGNED_OUT]);
  expect(migrated.presence[0].occurredAt).toEqual('2023-09-29T13:00:00.000Z');
  expect(migrated.timeItems.filter((t: any) => t.itemType === SIGN_IN_STATUS)).toEqual([]);
});

legacyMode('sign-in attribution cannot be represented by a timeItem', () => {
  it('refuses an attributed sign-in rather than dropping the attester', () => {
    const { participantId } = fixture();

    const result: any = tournamentEngine.modifyParticipantsSignInStatus({
      attributedTo: { attributionType: DECLARED_ATTRIBUTION, name: 'A. Desk' },
      participantIds: [participantId],
      signInState: SIGNED_IN,
    });

    expect(result.error).toEqual(UNSUPPORTED_IN_LEGACY_MODE);
  });

  it('still writes an unattributed sign-in as a legacy timeItem', () => {
    const { participantId } = fixture();

    const result: any = tournamentEngine.modifyParticipantsSignInStatus({
      participantIds: [participantId],
      signInState: SIGNED_IN,
    });
    expect(result).toMatchObject(SUCCESS);

    const participant = readParticipant(participantId);
    expect(participant.timeItems.filter((t: any) => t.itemType === SIGN_IN_STATUS).length).toEqual(1);
    expect(participant.timeItems.find((t: any) => t.itemType === SIGN_IN_STATUS).itemValue).toEqual(SIGNED_IN);
  });
});
