import { ENGINE_DEFAULT_POLICIES, engineDefaultHashInput } from '@Fixtures/policies/engineDefaultPolicies';
import { createTournamentRecord } from '@Generators/tournamentRecords/createTournamentRecord';
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { defaultsHash, defaultsHashes } from '@Fixtures/policies/defaultsHash';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { getDefaultsDrift } from '@Query/tournaments/getDefaultsDrift';
import { getFactoryStamp } from '@Query/tournaments/getFactoryStamp';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { legacyMode } from '@Tests/testHarness/legacyMode';
import { canonicalJson } from '@Tools/canonicalJson';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import * as factory from '../../../../index';
import { createHash } from 'crypto';

// constants and types
import { POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCHEDULING, POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { EXISTING_POLICY_TYPE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { SanctioningPolicy } from '@Types/sanctioningTypes';
import { SINGLES_EVENT } from '@Constants/eventConstants';

/**
 * A RECORD THAT PINS NO POLICY OF A TYPE RECORDS WHICH ENGINE DEFAULTS IT RELIES ON.
 *
 * A policy that differs from the engine default is pinned onto the record by its full value. A policy type the
 * record leaves to the engine follows the running factory's default, which a later release may change. The defaults
 * stamp (`factory.defaultsHash`, `factory.defaultsHashes`: build-time content hashes) makes that change detectable:
 * `getDefaultsDrift` names the unpinned policy types whose defaults differ from the ones stamped.
 */

const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 16);
const stampOf = (tournamentRecord: any) => getFactoryStamp({ tournamentRecord });

describe('the build-time hash', () => {
  it('is the canonical content hash of each policy the engine falls back to', () => {
    const recomputed = Object.fromEntries(
      Object.keys(ENGINE_DEFAULT_POLICIES)
        .sort()
        .map((policyType) => [policyType, hash(engineDefaultHashInput(policyType))]),
    );
    expect(defaultsHashes).toEqual(recomputed);
    expect(defaultsHash).toEqual(hash(recomputed));
    expect(defaultsHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashes a single-default type over its bare definition, so a holder of a policy can compare it', () => {
    expect(defaultsHashes[POLICY_TYPE_SCHEDULING]).toEqual(hash(POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING]));
    // a provider-neutral preset the engine never reads is not a default the record relies on
    expect(defaultsHashes[POLICY_TYPE_PROGRESSION]).toBeUndefined();
  });

  it('is exported, with the hashes frozen', () => {
    expect(factory.defaultsHash).toEqual(defaultsHash);
    expect(factory.defaultsHashes).toEqual(defaultsHashes);
    expect(Object.isFrozen(factory.defaultsHashes)).toEqual(true);
  });
});

describe('creation stamps the defaults', () => {
  it('a new tournament carries the stamp beside the creating factory', () => {
    tournamentEngine.newTournamentRecord({ startDate: '2026-11-26', endDate: '2026-11-27' });
    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.factory).toMatchObject({ createdVersion: factoryVersion(), defaultsHash, defaultsHashes });
    // a copy: no record shares the module's constant
    expect(tournamentRecord.factory.defaultsHashes).not.toBe(defaultsHashes);
    expect(Object.isFrozen(tournamentRecord.factory.defaultsHashes)).toEqual(false);
  });

  it('a generated tournament carries it too', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    expect(stampOf(tournamentRecord).defaultsHash).toEqual(defaultsHash);
  });

  it('a factory stamp the caller supplies is history: it is not backfilled', () => {
    const factoryStamp = { createdVersion: '7.0.0', version: '7.0.0', timeStamp: 1 };
    const tournamentRecord = createTournamentRecord({ tournamentName: 'Old', factory: factoryStamp });
    expect(tournamentRecord.factory).toEqual(factoryStamp);
  });

  it('a tournament activated from sanctioning carries the creation stamp', () => {
    const policy: SanctioningPolicy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };
    sanctioningEngine.reset();
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: { organisationId: 'org-001', organisationName: 'Club', contactName: 'A', contactEmail: 'a@b.c' },
          proposal: {
            tournamentName: 'Sanctioned',
            proposedStartDate: '2027-06-01',
            proposedEndDate: '2027-06-07',
            events: [{ eventName: 'Singles', eventType: SINGLES_EVENT }],
          },
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: policy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);
    const activation: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: policy });
    sanctioningEngine.reset();
    expect(activation.success).toEqual(true);
    expect(stampOf(activation.tournamentRecord)).toMatchObject({
      createdVersion: factoryVersion(),
      defaultsHash,
      defaultsHashes,
    });
  });

  legacyMode('a legacy-mode record', () => {
    it('carries the stamp in its factory extension', () => {
      const tournamentRecord = createTournamentRecord({ tournamentName: 'Legacy' });
      expect(tournamentRecord.factory).toBeUndefined();
      const extension = tournamentRecord.extensions.find(({ name }) => name === 'factory');
      expect(extension.value).toMatchObject({ defaultsHash, defaultsHashes });
      expect(getDefaultsDrift({ tournamentRecord })).toMatchObject({ success: true, defaultsDrift: [] });
    });
  });
});

describe('attachPolicies stamps a record that carries no stamp', () => {
  const seeding = {
    [POLICY_TYPE_SEEDING]: { policyName: 'CLUB_SEEDING', policyVersion: '1.0.0', duplicateSeedNumbers: false },
  };

  it('stamps an unstamped record and keeps the pinned policy with its name and version', () => {
    const tournamentRecord: any = { tournamentId: 'unstamped' };
    const result: any = attachPolicies({ tournamentRecord, policyDefinitions: seeding });
    expect(result.success).toEqual(true);
    expect(stampOf(tournamentRecord)).toEqual({ defaultsHash, defaultsHashes });
    expect(tournamentRecord.appliedPolicies[POLICY_TYPE_SEEDING]).toEqual(seeding[POLICY_TYPE_SEEDING]);
  });

  it('keeps a stamp already on file, and the rest of the factory stamp', () => {
    const older = { version: '7.40.0', defaultsHash: '0000000000000000', defaultsHashes: { seeding: '0' } };
    const tournamentRecord: any = { tournamentId: 'stamped', factory: { ...older } };
    expect(attachPolicies({ tournamentRecord, policyDefinitions: seeding }).success).toEqual(true);
    expect(tournamentRecord.factory).toEqual(older);
  });

  it('adds the defaults to a factory stamp written before they existed', () => {
    const tournamentRecord: any = {
      tournamentId: 'versioned',
      factory: { createdVersion: '7.40.0', version: '7.41.0' },
    };
    expect(attachPolicies({ tournamentRecord, policyDefinitions: seeding }).success).toEqual(true);
    expect(tournamentRecord.factory).toEqual({
      createdVersion: '7.40.0',
      version: '7.41.0',
      defaultsHash,
      defaultsHashes,
    });
  });

  it('stamps the tournament when the policy is attached to an event', () => {
    const tournamentRecord: any = { tournamentId: 'event-level', events: [{ eventId: 'e1' }] };
    const event = tournamentRecord.events[0];
    expect(attachPolicies({ tournamentRecord, event, policyDefinitions: seeding }).success).toEqual(true);
    expect(stampOf(tournamentRecord).defaultsHash).toEqual(defaultsHash);
    expect(event.appliedPolicies[POLICY_TYPE_SEEDING]).toBeDefined();
  });

  it('stamps every record a multi-record attach writes, and none it refuses', () => {
    const tournamentRecords: any = { a: { tournamentId: 'a' }, b: { tournamentId: 'b' } };
    expect(attachPolicies({ tournamentRecords, policyDefinitions: seeding }).success).toEqual(true);
    expect(stampOf(tournamentRecords.a).defaultsHash).toEqual(defaultsHash);
    expect(stampOf(tournamentRecords.b).defaultsHash).toEqual(defaultsHash);

    const held: any = { tournamentId: 'held', appliedPolicies: { ...seeding } };
    expect(attachPolicies({ tournamentRecord: held, policyDefinitions: seeding }).error).toEqual(EXISTING_POLICY_TYPE);
    expect(held.factory).toBeUndefined();
  });

  it('refuses a policy whose version is not a string, and writes nothing', () => {
    const tournamentRecord: any = { tournamentId: 'refused' };
    const policyDefinitions = { [POLICY_TYPE_SEEDING]: { policyVersion: 2, duplicateSeedNumbers: false } };
    expect(attachPolicies({ tournamentRecord, policyDefinitions }).error).toEqual(INVALID_VALUES);
    expect(tournamentRecord).toEqual({ tournamentId: 'refused' });
  });

  it('through the engine, the stamp survives the write that refreshes the version', () => {
    tournamentEngine.setState({ tournamentId: 'engine', factory: { createdVersion: '7.0.0', version: '7.0.0' } });
    expect(tournamentEngine.attachPolicies({ policyDefinitions: seeding }).success).toEqual(true);
    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(stampOf(tournamentRecord)).toMatchObject({
      createdVersion: '7.0.0',
      version: factoryVersion(),
      defaultsHash,
    });
  });
});

describe('getDefaultsDrift', () => {
  const stamped = (factoryStamp: any, appliedPolicies?: any) =>
    ({ tournamentId: 'drift', factory: factoryStamp, ...(appliedPolicies ? { appliedPolicies } : {}) }) as any;

  it('cannot say for a record that carries no stamp', () => {
    const result = getDefaultsDrift({ tournamentRecord: { tournamentId: 'bare' } as any });
    expect(result).toEqual({ success: true, defaultsHash });
    expect(result.defaultsDrift).toBeUndefined();
  });

  it('reports nothing when the defaults are those stamped', () => {
    const tournamentRecord = stamped({ defaultsHash, defaultsHashes });
    expect(getDefaultsDrift({ tournamentRecord })).toEqual({
      success: true,
      defaultsHash,
      stampedDefaultsHash: defaultsHash,
      defaultsDrift: [],
    });
  });

  it('names the policy types whose defaults changed', () => {
    const tournamentRecord = stamped({
      defaultsHash: 'ffffffffffffffff',
      defaultsHashes: { ...defaultsHashes, scheduling: 'ffffffffffffffff', seeding: 'eeeeeeeeeeeeeeee' },
    });
    expect(getDefaultsDrift({ tournamentRecord })).toMatchObject({
      stampedDefaultsHash: 'ffffffffffffffff',
      defaultsDrift: [POLICY_TYPE_SCHEDULING, POLICY_TYPE_SEEDING],
    });
  });

  it('leaves out a type the tournament pins: a pinned policy is stored in full and does not drift', () => {
    const tournamentRecord = stamped(
      { defaultsHash: 'ffffffffffffffff', defaultsHashes: { ...defaultsHashes, scheduling: 'f', seeding: 'e' } },
      { [POLICY_TYPE_SCHEDULING]: POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING] },
    );
    expect(getDefaultsDrift({ tournamentRecord }).defaultsDrift).toEqual([POLICY_TYPE_SEEDING]);
  });

  it('reports a default added or retired since the stamp', () => {
    const { seeding: _seeding, ...withoutSeeding } = defaultsHashes;
    const tournamentRecord = stamped({ defaultsHash: 'f', defaultsHashes: { ...withoutSeeding, retired: 'a' } });
    expect(getDefaultsDrift({ tournamentRecord }).defaultsDrift).toEqual(['retired', POLICY_TYPE_SEEDING]);
  });

  it('reports every unpinned type when the stamp has no per-type hashes', () => {
    const tournamentRecord = stamped({ defaultsHash: 'f' }, { [POLICY_TYPE_SEEDING]: { duplicateSeedNumbers: true } });
    const expected = Object.keys(defaultsHashes)
      .filter((policyType) => policyType !== POLICY_TYPE_SEEDING)
      .sort((a, b) => a.localeCompare(b));
    expect(getDefaultsDrift({ tournamentRecord }).defaultsDrift).toEqual(expected);
  });

  it('reads a legacy factory extension the same way', () => {
    const tournamentRecord: any = {
      tournamentId: 'legacy',
      extensions: [
        { name: 'factory', value: { defaultsHash: 'f', defaultsHashes: { ...defaultsHashes, ladder: 'x' } } },
      ],
    };
    expect(getDefaultsDrift({ tournamentRecord }).defaultsDrift).toEqual(['ladder']);
  });

  it('is an engine query that changes nothing', () => {
    tournamentEngine.newTournamentRecord({});
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const result: any = tournamentEngine.getDefaultsDrift();
    expect(result).toMatchObject({ success: true, defaultsDrift: [] });
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
    expect(getDefaultsDrift().error).toBeDefined();
  });
});
