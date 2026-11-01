import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { TournamentStatusEnum } from '@Types/tournamentTypes';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';
import fs from 'fs';

// constants and types
import type { Applicant, SanctioningPolicy } from '@Types/sanctioningTypes';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';

/*
 * The CODES schema's TournamentStatusEnum accepts every status the engine writes: activation from
 * sanctioning writes ACTIVE, and setTournamentStatus accepts every TournamentStatusEnum value.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', 'utf8'));
const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
ajv.addSchema(schema, 'tournament');
const validateRecord = ajv.compile({ $ref: 'tournament' });

const applicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Tennis Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};
const policy: SanctioningPolicy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };

describe('tournamentStatus and the CODES schema', () => {
  it('declares every TournamentStatusEnum value', () => {
    expect([...schema.definitions.TournamentStatusEnum.enum].sort()).toEqual(
      Object.values(TournamentStatusEnum).sort(),
    );
  });

  it('accepts the whole record activation from sanctioning produces', () => {
    sanctioningEngine.reset();
    const proposal = {
      tournamentName: 'Status 2027',
      proposedStartDate: '2027-06-01',
      proposedEndDate: '2027-06-07',
      events: [{ eventName: "Men's Singles", eventType: SINGLES_EVENT, gender: MALE, drawSize: 32 }],
    };
    sanctioningEngine.executionQueue([
      { method: 'createSanctioningRecord', params: { governingBodyId: 'gov-001', applicant, proposal } },
      { method: 'submitApplication', params: { sanctioningPolicy: policy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);
    const activation: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: policy });
    expect(activation.success).toEqual(true);
    expect(activation.tournamentRecord.tournamentStatus).toEqual(TournamentStatusEnum.ACTIVE);

    const valid = validateRecord(activation.tournamentRecord);
    expect(validateRecord.errors ?? []).toEqual([]);
    expect(valid).toEqual(true);
  });

  it.each(Object.values(TournamentStatusEnum))('accepts a record set to %s', (status) => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const result: any = tournamentEngine.setTournamentStatus({ status });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentStatus).toEqual(status);
    const valid = validateRecord(tournamentRecord);
    expect(validateRecord.errors ?? []).toEqual([]);
    expect(valid).toEqual(true);
  });
});
