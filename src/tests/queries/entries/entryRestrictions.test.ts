import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import Ajv from 'ajv';

import { getParticipantEligibility } from '@Query/entries/getParticipantEligibility';
import type { Event, Participant, Tournament } from '@Types/tournamentTypes';

/**
 * A6 and A8.
 *
 * The point of A6 is not the type — it is that an unevaluable restriction reaches the eligibility
 * answer as `indeterminate` instead of being silently ignored. A restriction nothing reads is
 * inert, and inert is worse than absent because it looks like coverage.
 */

const tournamentRecord = {
  tournamentId: 't',
  startDate: '2026-06-01',
  endDate: '2026-06-07',
} as unknown as Tournament;

const participant = {
  participantId: 'p',
  participantType: 'INDIVIDUAL',
  person: { birthDate: '2010-03-04' },
} as unknown as Participant;

const u18 = { categoryName: 'U18', ageMax: 17 };

describe('entry restrictions reach the eligibility answer', () => {
  it('an event with no restrictions is unaffected', () => {
    const event = { eventId: 'e', category: u18 } as unknown as Event;
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(true);
    expect(result.indeterminate).toBe(false);
    expect(result.undeterminedRestrictions).toBeUndefined();
  });

  it('an undecidable RESIDENCY restriction makes the answer indeterminate, not a refusal', () => {
    // The participant satisfies every category rule. The honest answer is "cannot tell", because
    // CODES holds no section roster — not "no", and not "yes".
    const event = {
      eventId: 'e',
      category: u18,
      entryRestrictions: [{ type: 'RESIDENCY', organisationId: 'usta-southern' }],
    } as unknown as Event;
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(false);
    expect(result.indeterminate).toBe(true);
    expect(result.undeterminedRestrictions).toHaveLength(1);
    expect(result.undeterminedRestrictions[0].type).toBe('RESIDENCY');
  });

  it('absence of evaluable means undecidable — it does NOT mean satisfied', () => {
    // Defaulting the other way would answer "you may enter" on a rule nothing checked.
    const event = {
      eventId: 'e',
      category: u18,
      entryRestrictions: [{ type: 'MEMBERSHIP', organisationId: 'ita', membershipCategory: 'PLAYER' }],
    } as unknown as Event;
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.indeterminate).toBe(true);
  });

  it('a restriction a producer has resolved does not cloud the answer', () => {
    const event = {
      eventId: 'e',
      category: u18,
      entryRestrictions: [{ type: 'MEMBERSHIP', organisationId: 'ita', evaluable: true }],
    } as unknown as Event;
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(true);
    expect(result.indeterminate).toBe(false);
  });

  it('restrictions apply to an event with NO category — an open-age event can still be closed', () => {
    const event = {
      eventId: 'e',
      entryRestrictions: [{ type: 'RESIDENCY', organisationId: 'usta-southern' }],
    } as unknown as Event;
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.indeterminate).toBe(true);
    expect(result.undeterminedRestrictions).toHaveLength(1);
  });

  it('a real category breach stays a refusal — an unevaluable restriction does not soften it', () => {
    const tooOld = { ...participant, person: { birthDate: '2000-03-04' } } as unknown as Participant;
    const event = {
      eventId: 'e',
      category: u18,
      entryRestrictions: [{ type: 'RESIDENCY' }],
    } as unknown as Event;
    const result: any = getParticipantEligibility({ participant: tooOld, event, tournamentRecord });
    expect(result.eligible).toBe(false);
    expect(result.indeterminate).toBe(false); // the age breach is decided, so the answer is "no"
    expect(result.rejectionReasons[0].type).toBe('age');
  });
});

/**
 * Schema cover. `schemaValidation.test.ts` validates the 16 harness TODS files and none carries an
 * `entryRestrictions` or a `cancelledAt`, so it is silent on this change — the same gap that made
 * the sanction sweep need its own fixtures.
 */
describe('A6 + A8 schema', () => {
  const ajv = new Ajv({ allowUnionTypes: true, verbose: true, allErrors: true });
  ajv.addFormat('date-time', (dateTime: any) => {
    if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
    return !Number.isNaN(Date.parse(dateTime));
  });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));
  const validate = ajv.compile(schema);

  const record = () => ({
    tournamentId: 'a6-a8-fixture',
    tournamentName: 'Restrictions Fixture',
    tournamentStatus: 'CANCELLED',
    cancelledAt: '2026-05-01T12:00:00.000Z',
    cancellationReason: 'Insufficient entries',
    events: [
      {
        eventId: 'e1',
        eventName: 'Level 4 Closed Singles',
        cancelledAt: '2026-05-01T12:00:00.000Z',
        cancellationReason: 'Merged into the open draw',
        entryRestrictions: [
          {
            type: 'RESIDENCY',
            organisationId: 'usta-southern',
            description: 'Open to Southern Section residents',
            evaluable: false,
          },
          { type: 'MEMBERSHIP', organisationId: 'ita', membershipCategory: 'PLAYER' },
        ],
      },
    ],
  });

  it('accepts restrictions and cancellation provenance', () => {
    const valid = validate(record());
    if (!valid) throw new Error(ajv.errorsText(validate.errors, { dataVar: 'record' }));
    expect(valid).toBe(true);
  });

  it('REJECTS an unknown restriction type', () => {
    const r: any = record();
    r.events[0].entryRestrictions[0].type = 'VIBES';
    expect(validate(r)).toBe(false);
  });

  it('REJECTS a restriction with no type', () => {
    const r: any = record();
    delete r.events[0].entryRestrictions[0].type;
    expect(validate(r)).toBe(false);
  });

  it('REJECTS a misspelled restriction field rather than keeping it', () => {
    const r: any = record();
    r.events[0].entryRestrictions[0].evaluible = true;
    expect(validate(r)).toBe(false);
  });
});
