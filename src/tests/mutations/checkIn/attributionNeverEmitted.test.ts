import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DECLARED_ATTRIBUTION } from '@Constants/presenceConstants';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import { SIGNED_IN } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * D-PRIV — `attributedTo` never leaves the engine through a BULK emission, whatever the privacy
 * policy says and whatever publish state is in force.
 *
 * The threat is not a participant's own data: a DECLARED attester is somebody who is **not in the
 * record at all**, so no privacy policy describes them and no `isPublic` flag covers them. And
 * `getParticipants` is fail-open by construction — `if (!template) return source` — while the public
 * participants route supplies no policy, so protection that depends on a policy is protection that is
 * absent exactly where it matters.
 */
const ATTESTER = {
  attributionType: DECLARED_ATTRIBUTION,
  relationship: ContactRelationshipEnum.PARENT,
  emailAddress: 'parent@example.com',
  telephone: '+1 555 0100',
  name: 'A. Guardian',
};

function seeded() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
  });
  tournamentEngine.setState(tournamentRecord, false);

  const matchUp = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps[0];
  const participantId = matchUp.sides[0].participant.individualParticipants[0].participantId;

  tournamentEngine.checkInParticipant({
    matchUpId: matchUp.matchUpId,
    attributedTo: ATTESTER,
    participantId,
    drawId,
  });
  tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: [participantId],
    attributedTo: ATTESTER,
    signInState: SIGNED_IN,
  });

  return { drawId, participantId, matchUpId: matchUp.matchUpId };
}

function assertNoAttester(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain('A. Guardian');
  expect(serialized).not.toContain('+1 555 0100');
  expect(serialized).not.toContain('parent@example.com');
  expect(serialized).not.toContain('attributedTo');
}

it('omits the attester from getParticipants when NO privacy policy is supplied', () => {
  seeded();

  // the fail-open path: no policyDefinitions at all, which is what the public route does
  const result: any = tournamentEngine.getParticipants({ withMatchUps: true });

  assertNoAttester(result.participants);
  assertNoAttester(result.participantMap);
  assertNoAttester(result.matchUps);
});

it('omits the attester from nested individualParticipants', () => {
  seeded();

  // a second emission of the same people, sourced from the UNFILTERED map — stripping only the top
  // level would leave every doubles player's attester intact
  const result: any = tournamentEngine.getParticipants({ withIndividualParticipants: true });

  const nested = result.participants.flatMap((p: any) => p.individualParticipants ?? []);
  expect(nested.length).toBeGreaterThan(0);
  assertNoAttester(nested);
});

it('omits the attester from hydrated matchUps', () => {
  const { matchUpId } = seeded();

  const { matchUp }: any = tournamentEngine.findMatchUp({ inContext: true, matchUpId });
  expect(matchUp.checkIns.length).toBeGreaterThan(0);

  const { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  assertNoAttester(matchUps);
});

it('still reports WHO was present and WHEN — only the attester is withheld', () => {
  const { participantId } = seeded();

  const result: any = tournamentEngine.getParticipants({});
  const participant = result.participants.find((p: any) => p.participantId === participantId);

  expect(participant.presence.length).toEqual(1);
  expect(participant.presence[0].state).toEqual(SIGNED_IN);
  expect(participant.presence[0].occurredAt).toBeTruthy();
  expect(participant.presence[0].attributedTo).toBeUndefined();
});

it('returns the attester through the dedicated query, which a caller must ask for by name', () => {
  const { participantId } = seeded();

  const history: any = tournamentEngine.getParticipantPresenceHistory({ participantId });

  // the one read that carries it, so a server has a single method to gate on permissions
  expect(history.presence[0].attributedTo.name).toEqual('A. Guardian');
  expect(history.presence[0].attributedTo.relationship).toEqual(ContactRelationshipEnum.PARENT);
});
