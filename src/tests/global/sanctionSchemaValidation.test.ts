import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import Ajv from 'ajv';

/**
 * The sanction instance model, validated as a SCHEMA rather than only as a TypeScript type.
 *
 * `schemaValidation.test.ts` validates the 16 TODS files in `testHarness` — and **not one of them
 * carries a `sanction`, `sanctions`, `tournamentTier` or `eventTier`.** So it would have reported
 * green over this change having exercised none of it. That is why these fixtures exist: without
 * them the schema definitions added here are asserted, not tested.
 *
 * Each negative case below is the SAME record as the positive one with a single field made wrong,
 * so a failure localizes to that field rather than to "the fixture is malformed".
 */

const ajv = new Ajv({ allowUnionTypes: true, verbose: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => {
  if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
  return !Number.isNaN(Date.parse(dateTime));
});
addFormats(ajv);

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));
const validate = ajv.compile(schema);

/** A record exercising every branch of the sanction model, shaped like real captured data. */
const sanctioned = () => ({
  tournamentId: 'schema-sanction-fixture',
  tournamentName: 'Sanction Schema Fixture',
  startDate: '2026-07-27',
  endDate: '2026-08-03',
  tournamentTier: { system: 'USTA', value: 'Level 2', numericRank: 2 },
  sanction: {
    decision: 'APPROVED',
    recognition: 'UNSANCTIONED',
    classification: { system: 'USTA', value: 'Unsanctioned' },
    authority: {
      organisationAbbreviation: 'USTA',
      organisationName: 'United States Tennis Association',
      organisationId: 'usta',
      role: 'NATIONAL',
      regionCode: 'N00',
    },
    approvalChain: [
      { organisationName: 'National', role: 'NATIONAL', regionCode: 'N00' },
      { organisationName: 'Southern', role: 'SECTION', regionCode: '070' },
      { organisationName: 'Georgia', role: 'DISTRICT', regionCode: '034' },
    ],
    decisionRecord: { decidedAt: '2025-05-17T00:40:41.294Z', decidedByName: 'A District Official', appealable: true },
    confers: { rankingEligible: false, insured: true },
    ruleset: { edition: '2026', enforcement: 'ENFORCE', appliedRules: ['R1', 'R2'] },
    identifiers: [{ organisationId: 'usta', identifier: '26-93384', identifierType: 'USTA_TOURNAMENT_NUMBER' }],
    fees: [
      { feeKind: 'SANCTION', fee: { amount: 4000, currencyCode: 'USD', unit: 'MINOR' } },
      {
        feeKind: 'HEAD_TAX',
        fee: { amount: 500, currencyCode: 'USD', unit: 'MINOR' },
        perParticipant: true,
        maximum: { amount: 25000, currencyCode: 'USD', unit: 'MINOR' },
      },
    ],
    submissionWindow: { from: '2025-01-01', to: '2025-06-01', timeZone: 'America/New_York' },
  },
});

const errorText = () => ajv.errorsText(validate.errors, { dataVar: 'record' });

describe('sanction instance model — the schema now says something', () => {
  it('accepts a fully-populated sanction', () => {
    const valid = validate(sanctioned());
    if (!valid) throw new Error(errorText());
    expect(valid).toBe(true);
  });

  it('accepts multiple sanctions — dual sanctioning is real', () => {
    const record: any = sanctioned();
    record.sanctions = [record.sanction, { decision: 'APPROVED', recognition: 'RECOGNISED' }];
    expect(validate(record)).toBe(true);
  });

  it('REJECTS an unknown decision — this is what {"type":"object"} used to accept', () => {
    const record: any = sanctioned();
    record.sanction.decision = 'BANANA';
    expect(validate(record)).toBe(false);
    expect(errorText()).toContain('decision');
  });

  it('REJECTS a non-string recognition', () => {
    const record: any = sanctioned();
    record.sanction.recognition = 42;
    expect(validate(record)).toBe(false);
  });

  it('REJECTS an unknown authority role', () => {
    const record: any = sanctioned();
    record.sanction.authority.role = 'SUPREME_LEADER';
    expect(validate(record)).toBe(false);
  });

  it('REJECTS a fee amount with no unit — the money rule holds inside the sanction too', () => {
    const record: any = sanctioned();
    delete record.sanction.fees[0].fee.unit;
    expect(validate(record)).toBe(false);
  });

  it('REJECTS a misspelled field rather than silently keeping it', () => {
    const record: any = sanctioned();
    record.sanction.recognitionn = 'SANCTIONED';
    expect(validate(record)).toBe(false);
  });

  it('REJECTS an identifier with no identifier value', () => {
    const record: any = sanctioned();
    delete record.sanction.identifiers[0].identifier;
    expect(validate(record)).toBe(false);
  });

  it('REJECTS a tier with no system', () => {
    const record: any = sanctioned();
    delete record.tournamentTier.system;
    expect(validate(record)).toBe(false);
  });

  it('accepts an event-grain sanction and tier', () => {
    const record: any = sanctioned();
    record.events = [
      {
        eventId: 'e1',
        eventName: 'Open Singles',
        eventTier: { system: 'USTA', value: 'Level 2' },
        sanction: { decision: 'APPROVED', recognition: 'SANCTIONED' },
      },
    ];
    const valid = validate(record);
    if (!valid) throw new Error(errorText());
    expect(valid).toBe(true);
  });
});
