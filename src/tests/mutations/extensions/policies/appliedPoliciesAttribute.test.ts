import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import { setSchemaWriteMode, setSubscriptions } from '@Global/state/globalState';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import Ajv from 'ajv';

// constants
import { POLICY_TYPE_AVOIDANCE, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { BRIDGE, LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';

/**
 * APPLIED POLICIES ARE A FIRST-CLASS ATTRIBUTE (CODES).
 *
 * Tournament, Event, DrawDefinition and Structure hold their own policies as `appliedPolicies`. The legacy
 * `appliedPolicies` extension is still read when an element has no attribute, and `migrateTournamentRecord` promotes it.
 * Writes follow the schema write mode: NATIVE writes the attribute and removes a stale extension, BRIDGE writes both,
 * LEGACY writes the extension only.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));
const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => {
  if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
  return !Number.isNaN(Date.parse(dateTime));
});
addFormats(ajv);
const validateRecord = ajv.compile(schema);

const scoring = (policyName: string) => ({
  [POLICY_TYPE_SCORING]: { policyName, requireParticipantsForScoring: false },
});
const avoidance = { [POLICY_TYPE_AVOIDANCE]: { policyAttributes: [{ key: 'person.nationalityCode' }] } };
const extensionOf = (element: any) =>
  (element?.extensions ?? []).find((extension: any) => extension?.name === APPLIED_POLICIES);
const record = () => tournamentEngine.getTournament().tournamentRecord;

afterEach(() => {
  setSchemaWriteMode(NATIVE);
  setSubscriptions({ subscriptions: {} });
});

describe('writes, by schema write mode', () => {
  it('NATIVE writes the attribute at tournament, event and draw level, and the record validates', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    let result: any = tournamentEngine.attachPolicies({ policyDefinitions: scoring('tournament') });
    expect(result.success).toEqual(true);
    result = tournamentEngine.attachPolicies({ policyDefinitions: scoring('event'), eventId });
    expect(result.success).toEqual(true);
    result = tournamentEngine.attachPolicies({ policyDefinitions: avoidance, drawId });
    expect(result.success).toEqual(true);

    const tournamentRecord = record();
    const event = tournamentRecord.events?.[0];
    const drawDefinition = event?.drawDefinitions?.[0];
    expect(tournamentRecord.appliedPolicies?.[POLICY_TYPE_SCORING]?.policyName).toEqual('tournament');
    expect(event?.appliedPolicies?.[POLICY_TYPE_SCORING]?.policyName).toEqual('event');
    expect(drawDefinition?.appliedPolicies?.[POLICY_TYPE_AVOIDANCE]).toBeDefined();
    for (const element of [tournamentRecord, event, drawDefinition]) expect(extensionOf(element)).toBeUndefined();
    expect(validateRecord(tournamentRecord), ajv.errorsText(validateRecord.errors)).toEqual(true);

    // reads resolve draw over event over tournament, as before
    const { appliedPolicies } = tournamentEngine.getAppliedPolicies({ drawId });
    expect(appliedPolicies?.[POLICY_TYPE_SCORING]?.policyName).toEqual('event');
    expect(appliedPolicies?.[POLICY_TYPE_AVOIDANCE]).toBeDefined();
  });

  it('NATIVE carries a legacy extension onto the attribute and removes it', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentRecord.extensions = [{ name: APPLIED_POLICIES, value: scoring('legacy') }];
    tournamentEngine.setState(tournamentRecord);
    const result: any = tournamentEngine.attachPolicies({ policyDefinitions: avoidance });
    expect(result.success).toEqual(true);
    expect(Object.keys(record().appliedPolicies ?? {}).toSorted()).toEqual(
      [POLICY_TYPE_AVOIDANCE, POLICY_TYPE_SCORING].toSorted(),
    );
    expect(extensionOf(record())).toBeUndefined();
  });

  it('BRIDGE writes the attribute and mirrors the extension; LEGACY writes the extension only', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    setSchemaWriteMode(BRIDGE);
    let result: any = tournamentEngine.attachPolicies({ policyDefinitions: scoring('bridge') });
    expect(result.success).toEqual(true);
    expect(record().appliedPolicies?.[POLICY_TYPE_SCORING]?.policyName).toEqual('bridge');
    expect(extensionOf(record())?.value?.[POLICY_TYPE_SCORING]?.policyName).toEqual('bridge');

    mocksEngine.generateTournamentRecord({ setState: true });
    setSchemaWriteMode(LEGACY);
    result = tournamentEngine.attachPolicies({ policyDefinitions: scoring('legacy') });
    expect(result.success).toEqual(true);
    expect(record().appliedPolicies).toBeUndefined();
    expect(extensionOf(record())?.value?.[POLICY_TYPE_SCORING]?.policyName).toEqual('legacy');
    expect(tournamentEngine.findPolicy({ policyType: POLICY_TYPE_SCORING }).policy?.policyName).toEqual('legacy');
  });

  it('removePolicy removes from the attribute, and removes the attribute with its last policy', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    tournamentEngine.attachPolicies({ policyDefinitions: { ...scoring('a'), ...avoidance } });
    let result: any = tournamentEngine.removePolicy({ policyType: POLICY_TYPE_SCORING });
    expect(result.success).toEqual(true);
    expect(Object.keys(record().appliedPolicies ?? {})).toEqual([POLICY_TYPE_AVOIDANCE]);
    result = tournamentEngine.removePolicy({ policyType: POLICY_TYPE_AVOIDANCE });
    expect(result.success).toEqual(true);
    expect(record().appliedPolicies).toBeUndefined();
    expect(extensionOf(record())).toBeUndefined();
  });

  it('the tournament detail notice carries the attribute', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const details: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_TOURNAMENT_DETAIL]: (notices: any[]) => details.push(...notices) } });
    tournamentEngine.attachPolicies({ policyDefinitions: scoring('noticed') });
    expect(details.at(-1)?.appliedPolicies?.[POLICY_TYPE_SCORING]?.policyName).toEqual('noticed');
  });
});

describe('reads and migration', () => {
  /** A record holding its policies only as extensions, at all four levels, as a record written before CODES. */
  function legacyRecord() {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    const event: any = tournamentRecord.events?.[0];
    const drawDefinition: any = event.drawDefinitions[0];
    const structure: any = drawDefinition.structures[0];
    for (const element of [tournamentRecord as any, event, drawDefinition, structure]) delete element.appliedPolicies;
    tournamentRecord.extensions = [{ name: APPLIED_POLICIES, value: scoring('tournament') }];
    event.extensions = [{ name: APPLIED_POLICIES, value: scoring('event') }];
    drawDefinition.extensions = [{ name: APPLIED_POLICIES, value: scoring('draw') }];
    structure.extensions = [{ name: APPLIED_POLICIES, value: scoring('structure') }];
    return { tournamentRecord, event, drawDefinition, structure };
  }

  it('the extension is read when an element has no attribute, and the attribute wins when both are present', () => {
    const { tournamentRecord, event, drawDefinition, structure } = legacyRecord();
    let policies = getAppliedPolicies({ tournamentRecord, event, drawDefinition, structure }).appliedPolicies;
    expect(policies?.[POLICY_TYPE_SCORING]?.policyName).toEqual('structure');

    structure.appliedPolicies = scoring('attribute');
    policies = getAppliedPolicies({ tournamentRecord, event, drawDefinition, structure }).appliedPolicies;
    expect(policies?.[POLICY_TYPE_SCORING]?.policyName).toEqual('attribute');
  });

  it('migrateTournamentRecord promotes the extension at all four levels', () => {
    const { tournamentRecord, event, drawDefinition, structure } = legacyRecord();
    const result: any = migrateTournamentRecord({ tournamentRecord });
    expect(result.success).toEqual(true);
    const names = [tournamentRecord, event, drawDefinition, structure].map(
      (element: any) => element.appliedPolicies?.[POLICY_TYPE_SCORING]?.policyName,
    );
    expect(names).toEqual(['tournament', 'event', 'draw', 'structure']);
    for (const element of [tournamentRecord, event, drawDefinition, structure])
      expect(extensionOf(element)).toBeUndefined();
    expect(validateRecord(tournamentRecord), ajv.errorsText(validateRecord.errors)).toEqual(true);
  });
});
