import { generatePrivacyFixture, GROUP_PARTICIPANT_ID, STAFF_PARTICIPANT_ID } from '@Tests/testHarness/privacyFixture';
import { participantPolicyHash, publicParticipantDocuments } from '@Query/readModel/publicParticipant';
import { POLICY_PRIVACY_DEFAULT } from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { getParticipants } from '@Query/participants/getParticipants';
import { readModel } from '../../../index';
import { expect, it, describe } from 'vitest';

// constants
import { MISSING_POLICY_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';
import { PAIR } from '@Constants/participantConstants';

// The fixture saturates every attribute the default policy denies, adds a GROUP and an
// OFFICIAL, and rates the singles players. Its record is the input; the engine state it
// sets is not used here.
const { tournamentRecord } = generatePrivacyFixture();

function documentsUnder(policyDefinitions: any = POLICY_PRIVACY_DEFAULT) {
  return publicParticipantDocuments({ tournamentRecord, policyDefinitions }) as any;
}

describe('publicParticipantDocuments', () => {
  it('is exposed on readModel', () => {
    expect(readModel.publicParticipantDocuments).toBe(publicParticipantDocuments);
    expect(readModel.participantPolicyHash).toBe(participantPolicyHash);
  });

  it('holds exactly what getParticipants emits for each competitor under the same policy', () => {
    const { documents } = documentsUnder();
    const { participants } = getParticipants({
      policyDefinitions: POLICY_PRIVACY_DEFAULT,
      withScaleValues: true,
      tournamentRecord,
    });
    const emitted = Object.fromEntries(
      (participants ?? []).map((participant) => [participant.participantId, participant]),
    );

    expect(documents.length).toBeGreaterThan(0);
    for (const document of documents) {
      expect(document.participant).toEqual(emitted[document.participantId]);
    }
  });

  it('carries scale values, which exist only after hydration', () => {
    const { documents } = documentsUnder();
    const rated = documents.filter((document) => Object.keys(document.participant.ratings ?? {}).length);
    expect(rated.length).toBeGreaterThan(0);
  });

  it('includes competitors only: no GROUP, no official', () => {
    const ids = documentsUnder().documents.map((document) => document.participantId);
    expect(ids).not.toContain(GROUP_PARTICIPANT_ID);
    expect(ids).not.toContain(STAFF_PARTICIPANT_ID);

    const competitors = tournamentRecord.participants?.filter(
      (participant) => ![GROUP_PARTICIPANT_ID, STAFF_PARTICIPANT_ID].includes(participant.participantId),
    );
    expect(ids.length).toEqual(competitors?.length);
  });

  it('is flat: a PAIR carries ids, never nested individuals', () => {
    const { documents, policyHash } = documentsUnder();
    const pair = documents.find((document) => document.participant.participantType === PAIR);
    expect(pair.participant.individualParticipantIds).toHaveLength(2);
    expect(pair.participant.individualParticipants).toBeUndefined();
    for (const document of documents) {
      expect(document.policyHash).toEqual(policyHash);
      expect(document.participantId).toEqual(document.participant.participantId);
    }
  });

  it('removes the presence attester whatever the policy allows', () => {
    const record = structuredClone(tournamentRecord);
    const individual: any = record.participants?.find(
      (participant) => participant.person && participant.participantId !== STAFF_PARTICIPANT_ID,
    );
    individual.presence = [
      { presenceStatus: 'PRESENT', attributedTo: { attributionType: 'DECLARED', name: 'A. Desk', telephone: '555' } },
    ];
    const policyDefinitions = {
      [POLICY_TYPE_PARTICIPANT]: { participant: { participantId: true, presence: true } },
    };
    const { documents } = publicParticipantDocuments({ tournamentRecord: record, policyDefinitions }) as any;
    const document = documents.find((document) => document.participantId === individual.participantId);
    expect(document.participant.presence[0].presenceStatus).toEqual('PRESENT');
    expect(document.participant.presence[0].attributedTo).toBeUndefined();
  });

  it('does not mutate the record', () => {
    const before = structuredClone(tournamentRecord);
    documentsUnder();
    expect(tournamentRecord).toEqual(before);
  });

  it('fails closed without a participant template', () => {
    expect(publicParticipantDocuments({ tournamentRecord }).error).toEqual(MISSING_POLICY_DEFINITION);
    expect(documentsUnder({ [POLICY_TYPE_PARTICIPANT]: { policyName: 'no template' } }).error).toEqual(
      MISSING_POLICY_DEFINITION,
    );
    expect(documentsUnder({ [POLICY_TYPE_PARTICIPANT]: { policyName: 'no template' } }).documents).toBeUndefined();
    expect(publicParticipantDocuments({ policyDefinitions: POLICY_PRIVACY_DEFAULT }).error).toEqual(
      MISSING_TOURNAMENT_RECORD,
    );
  });
});

describe('participantPolicyHash', () => {
  const template = POLICY_PRIVACY_DEFAULT[POLICY_TYPE_PARTICIPANT].participant;

  it('is stable, versioned and independent of key order and policy name', () => {
    const hash = participantPolicyHash(POLICY_PRIVACY_DEFAULT);
    expect(hash).toMatch(/^pp1:[0-9a-f]{14}$/);
    expect(participantPolicyHash(structuredClone(POLICY_PRIVACY_DEFAULT))).toEqual(hash);

    const reversed = Object.fromEntries(Object.entries(template).reverse());
    const renamed = { [POLICY_TYPE_PARTICIPANT]: { policyName: 'renamed', participant: reversed } };
    expect(participantPolicyHash(renamed)).toEqual(hash);
  });

  it('changes when any value changes, at any depth', () => {
    const hash = participantPolicyHash(POLICY_PRIVACY_DEFAULT);
    const widened = structuredClone(POLICY_PRIVACY_DEFAULT);
    widened[POLICY_TYPE_PARTICIPANT].participant.person.sex = true;
    expect(participantPolicyHash(widened)).not.toEqual(hash);

    const nested = structuredClone(POLICY_PRIVACY_DEFAULT);
    nested[POLICY_TYPE_PARTICIPANT].participant.individualParticipants.person.sex = true;
    expect(participantPolicyHash(nested)).not.toEqual(participantPolicyHash(widened));
    expect(participantPolicyHash(nested)).not.toEqual(hash);

    const listed = { [POLICY_TYPE_PARTICIPANT]: { participant: { participantStatus: ['ACTIVE'] } } };
    const relisted = { [POLICY_TYPE_PARTICIPANT]: { participant: { participantStatus: ['ACTIVE', 'WITHDRAWN'] } } };
    expect(participantPolicyHash(listed)).not.toEqual(participantPolicyHash(relisted));
  });

  it('is undefined without a template', () => {
    expect(participantPolicyHash()).toBeUndefined();
    expect(participantPolicyHash({})).toBeUndefined();
  });
});
