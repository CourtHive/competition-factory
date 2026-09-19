import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DECLARED_ATTRIBUTION } from '@Constants/presenceConstants';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import { SIGNED_IN } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * A presence log holds BOTH a participantId that must be remapped and an attester who may not be in
 * the record at all. The anonymiser's other scrubs all walk `participants` and `person`, so neither
 * obligation is met by anything already there.
 */
it('remaps presence subjects and drops the declared attester', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
  });
  tournamentEngine.setState(tournamentRecord, false);

  const matchUp = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps[0];
  const { matchUpId } = matchUp;
  const individualParticipantId = matchUp.sides[0].participant.individualParticipants[0].participantId;

  const attributedTo = {
    attributionType: DECLARED_ATTRIBUTION,
    relationship: ContactRelationshipEnum.PARENT,
    emailAddress: 'parent@example.com',
    telephone: '+1 555 0100',
    name: 'A. Guardian',
  };

  tournamentEngine.checkInParticipant({
    participantId: individualParticipantId,
    attributedTo,
    matchUpId,
    drawId,
  });
  tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [individualParticipantId],
    signInState: SIGNED_IN,
    attributedTo,
  });

  // anonymizeTournamentRecord mutates in place and returns only a result envelope
  const anonymized = tournamentEngine.getTournament().tournamentRecord;
  const result: any = tournamentEngine.anonymizeTournamentRecord({ tournamentRecord: anonymized });
  expect(result.success).toEqual(true);

  const serialized = JSON.stringify(anonymized);

  // the attester was never a Participant, so nothing else in the anonymiser would have touched them
  expect(serialized).not.toContain('A. Guardian');
  expect(serialized).not.toContain('+1 555 0100');
  expect(serialized).not.toContain('parent@example.com');

  // and the SUBJECT must be remapped, not left pointing at the original person
  expect(serialized).not.toContain(individualParticipantId);

  const anonParticipantIds = new Set(anonymized.participants.map((p: any) => p.participantId));

  const anonMatchUps = anonymized.events
    .flatMap((e: any) => e.drawDefinitions ?? [])
    .flatMap((d: any) => d.structures ?? [])
    .flatMap((s: any) => s.matchUps ?? []);
  const checkIns = anonMatchUps.flatMap((m: any) => m.checkIns ?? []);

  expect(checkIns.length).toBeGreaterThan(0);
  for (const attestation of checkIns) {
    expect(attestation.attributedTo).toBeUndefined();
    // a remapped id that is not a real participant would dangle just as badly as the original
    expect(anonParticipantIds.has(attestation.participantId)).toEqual(true);
  }

  const presence = anonymized.participants.flatMap((p: any) => p.presence ?? []);
  expect(presence.length).toBeGreaterThan(0);
  for (const attestation of presence) {
    expect(attestation.attributedTo).toBeUndefined();
    expect(anonParticipantIds.has(attestation.participantId)).toEqual(true);
  }
});
