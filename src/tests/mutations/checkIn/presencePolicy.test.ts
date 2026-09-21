import { validatePresenceAttribution, getPresenceExpectation } from '@Query/participant/presencePolicy';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import { DECLARED_ATTRIBUTION, PARTICIPANT_ATTRIBUTION } from '@Constants/presenceConstants';
import { INVALID_ATTRIBUTION } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SANCTIONING } from '@Constants/policyConstants';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import type { PresenceRules } from '@Types/presencePolicyTypes';
import { SIGNED_IN } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * D4h option B — presence expectation per (role x fact), three-valued, with attribution validity as a
 * third axis and `byCategory` carrying the U10 allowance.
 *
 * The load-bearing rule these specs exist to hold: **`required` never blocks.** It is a policy value
 * that surfaces read, not an instruction the factory enforces. Only `onInvalid: 'reject'` refuses a
 * write, and it refuses on WHO ATTESTED rather than on whether presence was expected.
 */
const U10_RULES: PresenceRules = {
  COMPETITOR: {
    signIn: { expectation: 'advisory' },
    matchCheckIn: {
      expectation: 'required',
      attribution: {
        allow: [PARTICIPANT_ATTRIBUTION, DECLARED_ATTRIBUTION],
        allowedRelationships: [ContactRelationshipEnum.SELF],
        byCategory: [
          {
            ageCategoryCode: 'U10',
            allowedRelationships: [
              ContactRelationshipEnum.SELF,
              ContactRelationshipEnum.PARENT,
              ContactRelationshipEnum.GUARDIAN,
              ContactRelationshipEnum.CHAPERONE,
            ],
          },
        ],
        onInvalid: 'reject',
      },
    },
  },
  OFFICIAL: {
    signIn: { expectation: 'required' },
    matchCheckIn: { expectation: 'notUsed' },
  },
};

function seeded({ presence, ageCategoryCode }: { presence?: PresenceRules; ageCategoryCode?: string } = {}) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES, category: ageCategoryCode ? { ageCategoryCode } : undefined }],
  });

  if (presence) {
    tournamentRecord.extensions = [
      ...(tournamentRecord.extensions ?? []),
      {
        name: 'appliedPolicies',
        value: { [POLICY_TYPE_SANCTIONING]: { policyName: 'test', presence } },
      },
    ];
  }

  tournamentEngine.setState(tournamentRecord, false);

  const matchUp = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps[0];
  const participantId = matchUp.sides[0].participant.individualParticipants[0].participantId;
  return { drawId, matchUpId: matchUp.matchUpId, participantId, tournamentRecord };
}

it('reports the expectation without enforcing it', () => {
  const { tournamentRecord, participantId } = seeded({ presence: U10_RULES });
  const participant = tournamentRecord.participants.find((p: any) => p.participantId === participantId);

  const expectation: any = getPresenceExpectation({ tournamentRecord, participant, fact: 'matchCheckIn' });
  expect(expectation.expectation).toEqual('required');
  expect(expectation.declared).toEqual(true);
  expect(expectation.role).toEqual('COMPETITOR');
});

it('distinguishes "notUsed" from "nobody said" — the ambiguity D4h exists to remove', () => {
  const declared = seeded({ presence: U10_RULES });
  const official = declared.tournamentRecord.participants[0];
  official.participantRole = 'OFFICIAL';

  const notUsed: any = getPresenceExpectation({
    tournamentRecord: declared.tournamentRecord,
    participant: official,
    fact: 'matchCheckIn',
  });
  expect(notUsed.expectation).toEqual('notUsed');
  expect(notUsed.declared).toEqual(true);

  // a tournament with no sanctioning policy has not declared `notUsed` — it has declared NOTHING, and
  // a client's heuristic is still the best answer available for it
  const silent = seeded();
  const undeclared: any = getPresenceExpectation({
    tournamentRecord: silent.tournamentRecord,
    participant: silent.tournamentRecord.participants[0],
    fact: 'matchCheckIn',
  });
  expect(undeclared.declared).toEqual(false);
  expect(undeclared.expectation).toBeUndefined();
});

it('treats a participant with no role as a COMPETITOR', () => {
  const { tournamentRecord } = seeded({ presence: U10_RULES });
  const roleless = { participantId: 'p-legacy' };

  const expectation: any = getPresenceExpectation({ tournamentRecord, participant: roleless, fact: 'matchCheckIn' });
  // an absent role means a player from an older record, never a person with no part to play
  expect(expectation.role).toEqual('COMPETITOR');
  expect(expectation.expectation).toEqual('required');
});

it('permits a PARENT at a U10 event and refuses one otherwise', () => {
  const parent = {
    attributionType: DECLARED_ATTRIBUTION,
    relationship: ContactRelationshipEnum.PARENT,
    name: 'A. Guardian',
  } as any;

  const openEvent = seeded({ presence: U10_RULES });
  const openResult: any = validatePresenceAttribution({
    tournamentRecord: openEvent.tournamentRecord,
    participant: openEvent.tournamentRecord.participants[0],
    fact: 'matchCheckIn',
    attributedTo: parent,
  });
  expect(openResult.valid).toEqual(false);
  expect(openResult.reason).toContain('PARENT');

  const juniorEvent = seeded({ presence: U10_RULES, ageCategoryCode: 'U10' });
  const juniorResult: any = validatePresenceAttribution({
    tournamentRecord: juniorEvent.tournamentRecord,
    participant: juniorEvent.tournamentRecord.participants[0],
    event: juniorEvent.tournamentRecord.events[0],
    fact: 'matchCheckIn',
    attributedTo: parent,
  });
  expect(juniorResult.valid).toEqual(true);
  expect(juniorResult.categoryApplied).toEqual('U10');
});

it('refuses an attester who states no relationship when the policy enumerates them', () => {
  const { tournamentRecord } = seeded({ presence: U10_RULES });

  const result: any = validatePresenceAttribution({
    attributedTo: { attributionType: DECLARED_ATTRIBUTION, name: 'Somebody' } as any,
    participant: tournamentRecord.participants[0],
    fact: 'matchCheckIn',
    tournamentRecord,
  });

  // a policy enumerating who may attest is not satisfied by an attester declining to say which they are
  expect(result.valid).toEqual(false);
  expect(result.reason).toContain('no relationship');
});

it('is silent where nothing is declared', () => {
  const { tournamentRecord } = seeded();

  const result: any = validatePresenceAttribution({
    attributedTo: { attributionType: DECLARED_ATTRIBUTION, name: 'Anyone' } as any,
    participant: tournamentRecord.participants[0],
    fact: 'matchCheckIn',
    tournamentRecord,
  });

  expect(result.valid).toEqual(true);
  expect(result.declared).toEqual(false);
  expect(result.onInvalid).toEqual('record');
});

it("does NOT block a check-in because presence is 'required'", () => {
  const { drawId, matchUpId, participantId } = seeded({ presence: U10_RULES });

  // `required`, no attester supplied at all — and it still succeeds. A hard block here is what teaches
  // operators to check everybody in at 9am, which destroys the signal (D4d).
  const result: any = tournamentEngine.checkInParticipant({ participantId, matchUpId, drawId });
  expect(result).toMatchObject(SUCCESS);
});

it("blocks only on the attester, and only when onInvalid is 'reject'", () => {
  const { drawId, matchUpId, participantId } = seeded({ presence: U10_RULES });

  const rejected: any = tournamentEngine.checkInParticipant({
    attributedTo: {
      attributionType: DECLARED_ATTRIBUTION,
      relationship: ContactRelationshipEnum.PARENT,
      name: 'A. Guardian',
    },
    participantId,
    matchUpId,
    drawId,
  });
  // an open event under these rules permits SELF only
  expect(rejected.error).toEqual(INVALID_ATTRIBUTION);

  const accepted: any = tournamentEngine.checkInParticipant({
    attributedTo: {
      attributionType: DECLARED_ATTRIBUTION,
      relationship: ContactRelationshipEnum.SELF,
      name: 'The Player',
    },
    participantId,
    matchUpId,
    drawId,
  });
  expect(accepted).toMatchObject(SUCCESS);
});

it('records rather than refuses under the default onInvalid', () => {
  const recordRules: PresenceRules = {
    COMPETITOR: {
      matchCheckIn: { attribution: { allowedRelationships: [ContactRelationshipEnum.SELF] } },
    },
  };
  const { drawId, matchUpId, participantId } = seeded({ presence: recordRules });

  const result: any = tournamentEngine.checkInParticipant({
    attributedTo: {
      attributionType: DECLARED_ATTRIBUTION,
      relationship: ContactRelationshipEnum.PARENT,
      name: 'A. Guardian',
    },
    participantId,
    matchUpId,
    drawId,
  });

  // an unexpected attester is still a recorded fact; refusing by default would teach operators to
  // leave attribution blank, which is worse than recording one the policy did not expect
  expect(result).toMatchObject(SUCCESS);
});

it('applies the sign-in rule without a category, which sign-in cannot have', () => {
  const rules: PresenceRules = {
    COMPETITOR: {
      signIn: {
        expectation: 'advisory',
        attribution: { allowedRelationships: [ContactRelationshipEnum.SELF], onInvalid: 'reject' },
      },
    },
  };
  const { tournamentRecord, participantId } = seeded({ presence: rules });

  const rejected: any = tournamentEngine.modifyParticipantsSignInStatus({
    attributedTo: {
      attributionType: DECLARED_ATTRIBUTION,
      relationship: ContactRelationshipEnum.PARENT,
      name: 'A. Guardian',
    },
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  expect(rejected.error).toEqual(INVALID_ATTRIBUTION);

  const accepted: any = tournamentEngine.modifyParticipantsSignInStatus({
    attributedTo: {
      attributionType: PARTICIPANT_ATTRIBUTION,
      participantId,
      relationship: ContactRelationshipEnum.SELF,
    },
    participantIds: [participantId],
    signInState: SIGNED_IN,
  });
  expect(accepted).toMatchObject(SUCCESS);
  expect(tournamentRecord).toBeTruthy();
});
