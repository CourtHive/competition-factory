import { setSchemaWriteMode } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import Ajv from 'ajv';
import {
  migrateTournamentRecord,
  SANCTION_CONSTRAINTS_NOT_PROMOTED,
} from '@Mutate/tournaments/migrateTournamentRecord';

// constants
import { NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { BRIDGE, LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { WILDCARD } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

/**
 * SANCTION CONSTRAINTS LIVE ON THE SANCTION, AND A PROVIDER DEFINES THEM (CA, 2026-11-02).
 *
 * The limits a sanctioning provider's rules set for a tournament (`drawSize`, `maxWildcards`, `maxAlternates`,
 * `maxQualifiers` per matched event) were a free-standing `sanctioningConstraints` extension that said nothing about
 * whose rules they were. They are now `sanction.constraints`, and `definedBy.providerId` is required. The provider
 * resolves its rules into these limits where applications are reviewed; the factory validates and enforces them.
 * Older records keep working: the extension is still read, and `migrateTournamentRecord` promotes it.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));
const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => {
  if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
  return !Number.isNaN(Date.parse(dateTime));
});
addFormats(ajv);
const validateRecord = ajv.compile(schema);

const PROVIDER = { providerId: 'provider-1', organisationName: 'Provider One' };
const CONSTRAINTS = {
  definedBy: PROVIDER,
  source: { policyName: 'Provider Sanctioning', policyVersion: '2026' },
  events: [{ match: { eventType: SINGLES_EVENT }, maxWildcards: 2, maxAlternates: 2 }],
};
const SANCTION = {
  decision: 'APPROVED',
  authority: { organisationId: 'provider-1', organisationName: 'Provider One' },
};

afterEach(() => setSchemaWriteMode(NATIVE));

/** A sanctioned tournament with a SINGLES event holding five direct entries and three wildcards. */
function sanctionedEvent({ sanction = SANCTION as any } = {}) {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Sanctioned Singles', eventType: SINGLES_EVENT }],
    participantsProfile: { participantsCount: 16 },
  });
  if (sanction) tournamentRecord.sanction = sanction;
  tournamentEngine.setState(tournamentRecord);
  const participantIds = tournamentEngine.getParticipants().participants.map((p) => p.participantId);
  let result: any = tournamentEngine.addEventEntries({ participantIds: participantIds.slice(0, 5), eventId });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({
    participantIds: participantIds.slice(5, 8),
    entryStatus: WILDCARD,
    eventId,
  });
  expect(result.success).toEqual(true);
  return { eventId };
}

const record = () => tournamentEngine.getTournament().tournamentRecord;
const legacyExtension = () => record().extensions?.find((extension) => extension.name === SANCTIONING_CONSTRAINTS);

describe('setSanctionConstraints', () => {
  it('stores the limits on the sanction, the record validates, and generation enforces them', () => {
    const { eventId } = sanctionedEvent();
    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    // CONTROL: unconstrained, the three wildcards are accepted
    expect(result.success).toEqual(true);

    result = tournamentEngine.setSanctionConstraints({ constraints: CONSTRAINTS });
    expect(result.success).toEqual(true);
    expect(record().sanction?.constraints).toEqual(CONSTRAINTS);
    expect(legacyExtension()).toBeUndefined();
    expect(validateRecord(record()), ajv.errorsText(validateRecord.errors)).toEqual(true);

    result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context).toMatchObject({ entryStatus: WILDCARD, limit: 2, count: 3 });
  });

  it('removes the limits when given none', () => {
    sanctionedEvent();
    tournamentEngine.setSanctionConstraints({ constraints: CONSTRAINTS });
    const result: any = tournamentEngine.setSanctionConstraints({ constraints: null });
    expect(result.success).toEqual(true);
    expect(record().sanction?.constraints).toBeUndefined();
  });

  it('BRIDGE writes the sanction and mirrors the legacy extension; LEGACY writes only the extension', () => {
    sanctionedEvent();
    setSchemaWriteMode(BRIDGE);
    let result: any = tournamentEngine.setSanctionConstraints({ constraints: CONSTRAINTS });
    expect(result.success).toEqual(true);
    expect(record().sanction?.constraints).toEqual(CONSTRAINTS);
    expect(legacyExtension()?.value).toEqual({
      events: [{ eventType: SINGLES_EVENT, maxWildcards: 2, maxAlternates: 2 }],
    });

    sanctionedEvent();
    setSchemaWriteMode(LEGACY);
    result = tournamentEngine.setSanctionConstraints({ constraints: CONSTRAINTS });
    expect(result.success).toEqual(true);
    expect(record().sanction?.constraints).toBeUndefined();
    expect(legacyExtension()?.value.events[0].maxWildcards).toEqual(2);
  });

  it.each([
    ['no definedBy', { events: [] }],
    ['an empty providerId', { definedBy: { providerId: ' ' }, events: [] }],
    ['no events', { definedBy: PROVIDER }],
    ['an unknown attribute', { ...CONSTRAINTS, rules: [] }],
    ['an event with no eventType', { definedBy: PROVIDER, events: [{ match: {}, maxWildcards: 1 }] }],
    ['an unknown event type', { definedBy: PROVIDER, events: [{ match: { eventType: 'MIXED' } }] }],
    ['a negative limit', { definedBy: PROVIDER, events: [{ match: { eventType: SINGLES_EVENT }, maxWildcards: -1 }] }],
    ['a fractional limit', { definedBy: PROVIDER, events: [{ match: { eventType: SINGLES_EVENT }, drawSize: 7.5 }] }],
  ])('refuses constraints with %s, writing nothing', (_, constraints) => {
    sanctionedEvent();
    const result: any = tournamentEngine.setSanctionConstraints({ constraints });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(record().sanction?.constraints).toBeUndefined();
    // and the schema agrees
    expect(validateRecord({ ...record(), sanction: { ...SANCTION, constraints } })).toEqual(false);
  });

  it('refuses a tournament with no sanction', () => {
    sanctionedEvent({ sanction: null });
    const result: any = tournamentEngine.setSanctionConstraints({ constraints: CONSTRAINTS });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(record().sanction).toBeUndefined();
  });
});

describe('the legacy extension', () => {
  const LEGACY_VALUE = { events: [{ eventType: SINGLES_EVENT, maxWildcards: 2 }] };

  it('is still read, and the sanction wins when both are present', () => {
    const { eventId } = sanctionedEvent();
    let result: any = tournamentEngine.addTournamentExtension({
      extension: { name: SANCTIONING_CONSTRAINTS, value: LEGACY_VALUE },
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);

    // the sanction's own limits allow three wildcards and, held beside the extension, they govern
    const tournamentRecord = record();
    tournamentRecord.sanction = {
      ...tournamentRecord.sanction,
      constraints: { definedBy: PROVIDER, events: [{ match: { eventType: SINGLES_EVENT }, maxWildcards: 3 }] },
    };
    tournamentEngine.setState(tournamentRecord);
    expect(legacyExtension()?.value).toEqual(LEGACY_VALUE);
    result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    expect(result.success).toEqual(true);
  });

  it('migrates onto the sanction, defined by the sanction authority', () => {
    sanctionedEvent();
    tournamentEngine.addTournamentExtension({
      extension: {
        name: SANCTIONING_CONSTRAINTS,
        value: { events: [{ eventType: SINGLES_EVENT, category: { categoryName: 'U18' }, maxWildcards: 2 }] },
      },
    });
    const tournamentRecord = record();
    const result: any = migrateTournamentRecord({ tournamentRecord });
    expect(result.success).toEqual(true);
    expect(tournamentRecord.sanction?.constraints).toEqual({
      definedBy: { providerId: 'provider-1', organisationName: 'Provider One' },
      events: [{ match: { eventType: SINGLES_EVENT, categoryName: 'U18' }, maxWildcards: 2 }],
    });
    expect(tournamentRecord.extensions?.some((extension) => extension.name === SANCTIONING_CONSTRAINTS)).toEqual(false);
    expect(result.warnings).toBeUndefined();
  });

  it.each([
    ['no sanction', null],
    ['a sanction with no authority', { decision: 'APPROVED' }],
  ])('is left in place, with a warning, on a record with %s', (_, sanction) => {
    sanctionedEvent({ sanction });
    tournamentEngine.addTournamentExtension({ extension: { name: SANCTIONING_CONSTRAINTS, value: LEGACY_VALUE } });
    const tournamentRecord = record();
    const result: any = migrateTournamentRecord({ tournamentRecord });
    expect(result.success).toEqual(true);
    expect(result.warnings?.map(({ code }) => code)).toEqual([SANCTION_CONSTRAINTS_NOT_PROMOTED]);
    expect(tournamentRecord.extensions?.find((extension) => extension.name === SANCTIONING_CONSTRAINTS)?.value).toEqual(
      LEGACY_VALUE,
    );
    expect(tournamentRecord.sanction?.constraints).toBeUndefined();
  });
});
