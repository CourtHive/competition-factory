import { POLICY_TYPE_LADDER, POLICY_TYPE_SCHEDULING, policyConstants } from '@Constants/policyConstants';
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { policies } from '@Fixtures/policies';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import ts from 'typescript';
import fs from 'fs-extra';
import Ajv from 'ajv';

/**
 * THE CODES SCHEMA DESCRIBES POLICIES.
 *
 * Policies are stored in an element's `appliedPolicies` extension, whose `value` the schema leaves
 * unconstrained, so until now no schema node described a policy at all: the scheduling policy's
 * `defaultPeriodLength` existed only in the TypeScript type and the docs. `PolicyDefinitions` and the
 * per-policy definitions describe that value. No record definition references them yet (storage is
 * unchanged), so these tests validate policies directly, and prove that records still validate.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));

function compile() {
  const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
  ajv.addFormat('date-time', (dateTime: any) => {
    if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
    return !Number.isNaN(Date.parse(dateTime));
  });
  addFormats(ajv);
  ajv.addSchema(schema, 'codes');
  const definition = (name: string) => {
    const validate = ajv.getSchema(`codes#/definitions/${name}`);
    if (!validate) throw new Error(`no definition ${name}`);
    return validate;
  };
  return { ajv, definition, record: ajv.compile(schema) };
}

const { ajv, definition, record } = compile();
const validatePolicies = definition('PolicyDefinitions');
const validateScheduling = definition('SchedulingPolicy');

function errorsOf(validate: any, value: any): string | undefined {
  return validate(value) ? undefined : ajv.errorsText(validate.errors);
}

/**
 * Each element's applied policies in a record, in either CODES form (the first-class `appliedPolicies` attribute, or
 * the `appliedPolicies` extension on older records), with where they were found.
 */
function appliedPoliciesIn(value: any, path = ''): { path: string; policies: any }[] {
  const found: { path: string; policies: any }[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...appliedPoliciesIn(item, `${path}[${index}]`)));
  } else if (value && typeof value === 'object') {
    if (value.appliedPolicies && typeof value.appliedPolicies === 'object')
      found.push({ path: path || '(root)', policies: value.appliedPolicies });
    for (const extension of Array.isArray(value.extensions) ? value.extensions : []) {
      if (extension?.name === APPLIED_POLICIES) found.push({ path: path || '(root)', policies: extension.value });
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'extensions' && key !== 'appliedPolicies') found.push(...appliedPoliciesIn(child, `${path}.${key}`));
    }
  }
  return found;
}

/**
 * The policy types the factory defines. `POLICY_TYPE_LADDER` is a real policy type (`getLadderPolicy` reads it and
 * `POLICY_LADDER_DEFAULT` is bundled) that the `policyConstants` object and `ValidPolicyTypes` omit, so it is added here.
 */
const policyTypes = [...new Set<string>([...Object.values(policyConstants), POLICY_TYPE_LADDER])].toSorted((a, b) =>
  a.localeCompare(b, 'en'),
);

describe('PolicyDefinitions', () => {
  it('has one key per policy type the factory defines, and no other', () => {
    const keys = Object.keys(schema.definitions.PolicyDefinitions.properties);
    expect(keys.toSorted((a, b) => a.localeCompare(b, 'en'))).toEqual(policyTypes);
    expect(schema.definitions.PolicyDefinitions.additionalProperties).toEqual(false);
  });

  it('accepts every bundled policy fixture keyed by policy type', () => {
    const keyed = Object.entries<any>(policies).filter(([, fixture]) =>
      Object.keys(fixture).every((key) => policyTypes.includes(key)),
    );
    // CONTROL: the modelled policy types are among those checked
    const checkedTypes = new Set(keyed.flatMap(([, fixture]) => Object.keys(fixture)));
    expect([...checkedTypes]).toEqual(expect.arrayContaining(['scheduling', 'seeding', 'competition']));
    expect(keyed.length).toBeGreaterThan(20);

    const failures = keyed
      .map(([name, fixture]) => [name, errorsOf(validatePolicies, fixture)])
      .filter(([, errors]) => errors);
    expect(failures).toEqual([]);
  });

  it('rejects a policy type it does not define', () => {
    expect(validatePolicies({ notAPolicyType: {} })).toEqual(false);
  });

  it('rejects a modelled policy carrying a member its type does not declare', () => {
    const seeding = { ...POLICY_SEEDING_ITF.seeding, seedingPolicyTypo: true };
    expect(validatePolicies({ seeding })).toEqual(false);
    expect(validatePolicies({ seeding: POLICY_SEEDING_ITF.seeding })).toEqual(true);
  });
});

describe('SchedulingPolicy', () => {
  const sample = { ...POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING], defaultPeriodLength: 15 };

  it('accepts the default policy, the no-daily-limits policy and a defaultPeriodLength', () => {
    expect(errorsOf(validateScheduling, POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING])).toBeUndefined();
    expect(errorsOf(validateScheduling, POLICY_SCHEDULING_NO_DAILY_LIMITS[POLICY_TYPE_SCHEDULING])).toBeUndefined();
    expect(errorsOf(validateScheduling, sample)).toBeUndefined();
    expect(errorsOf(validateScheduling, { defaultPeriodLength: 7.5 })).toBeUndefined();
  });

  it('accepts every documented member', () => {
    const documented = {
      policyName: 'Documented',
      allowModificationWhenMatchUpsScheduled: { courts: true, venues: false },
      defaultTimes: {
        averageTimes: [{ categoryNames: ['U12'], minutes: { default: 45, DOUBLES: 40, TEAM: 50 } }],
        recoveryTimes: [
          {
            categoryTypes: ['JUNIOR'],
            minutes: { default: 60, SINGLES_DOUBLES: 30, DOUBLES_SINGLES: 45 },
            byPlayedMinutes: [{ upTo: 60, minutes: 30 }, { minutes: 90 }],
          },
        ],
        overnightTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 720 } }],
        transitMinutes: 30,
      },
      defaultPeriodLength: 30,
      defaultDailyLimits: { SINGLES: 2, DOUBLES: 2, TEAM: 1, total: 3 },
      matchUpAverageTimes: [{ matchUpFormatCodes: ['SET1-S:TB10'], averageTimes: [{ minutes: { default: 10 } }] }],
      matchUpRecoveryTimes: [{ matchUpFormatCodes: ['SET1-S:TB10'], recoveryTimes: [{ minutes: { default: 15 } }] }],
      matchUpDailyLimits: [{ participantId: 'p1', SINGLES: 1, total: 2 }],
    };
    expect(errorsOf(validateScheduling, documented)).toBeUndefined();
  });

  it.each([
    ['zero', 0],
    ['negative', -15],
    ['a string', '30'],
    ['null', null],
    ['an object', { minutes: 30 }],
  ])('rejects a defaultPeriodLength that is %s', (_, defaultPeriodLength) => {
    expect(validateScheduling({ ...sample, defaultPeriodLength })).toEqual(false);
    expect(JSON.stringify(validateScheduling.errors)).toContain('defaultPeriodLength');
    // the same policy, wrapped as policies are stored, is rejected too
    expect(validatePolicies({ [POLICY_TYPE_SCHEDULING]: { ...sample, defaultPeriodLength } })).toEqual(false);
  });

  it('rejects malformed timing, one field at a time', () => {
    const cases = [
      { defaultTimes: { averageTimes: [{ categoryNames: [] }] } }, // minutes is required
      { defaultTimes: { averageTimes: [{ minutes: { default: -1 } }] } },
      { defaultTimes: { averageTimes: [{ minutes: { MIXED: 30 } }] } },
      { matchUpAverageTimes: [{ averageTimes: [{ minutes: { default: 30 } }] }] }, // matchUpFormatCodes required
      { matchUpDailyLimits: [{ SINGLES: 1 }] }, // participantId required
      { defaultDailyLimits: { singles: 2 } },
      { allowModificationWhenMatchUpsScheduled: { courts: 'yes' } },
    ];
    // CONTROL: the shape each case breaks is accepted when well formed
    expect(validateScheduling({ defaultTimes: { averageTimes: [{ minutes: { default: 30 } }] } })).toEqual(true);
    for (const policy of cases) expect(validateScheduling(policy), JSON.stringify(policy)).toEqual(false);
  });
});

/**
 * The schema and the TypeScript types are two declarations of one shape; each modelled policy's
 * definition lists exactly the members its type declares, in both directions.
 */
describe('the policy definitions match their TypeScript types', () => {
  const PAIRS: [file: string, typeName: string, definitionName: string][] = [
    ['./src/types/factoryTypes.ts', 'SchedulingPolicy', 'SchedulingPolicy'],
    ['./src/types/factoryTypes.ts', 'SchedulingMinutes', 'SchedulingMinutes'],
    ['./src/types/factoryTypes.ts', 'SchedulingCategoryTimes', 'SchedulingCategoryTimes'],
    ['./src/types/factoryTypes.ts', 'SchedulingRecoveryBand', 'SchedulingRecoveryBand'],
    ['./src/types/factoryTypes.ts', 'SchedulingRecoveryTimes', 'SchedulingRecoveryTimes'],
    ['./src/types/factoryTypes.ts', 'SchedulingDefaultTimes', 'SchedulingDefaultTimes'],
    ['./src/types/factoryTypes.ts', 'SchedulingFormatAverageTimes', 'SchedulingFormatAverageTimes'],
    ['./src/types/factoryTypes.ts', 'SchedulingFormatRecoveryTimes', 'SchedulingFormatRecoveryTimes'],
    ['./src/types/factoryTypes.ts', 'SchedulingDailyLimits', 'SchedulingDailyLimits'],
    ['./src/types/factoryTypes.ts', 'SchedulingParticipantDailyLimits', 'SchedulingParticipantDailyLimits'],
    ['./src/types/factoryTypes.ts', 'SeedingPolicy', 'SeedingPolicy'],
    ['./src/types/factoryTypes.ts', 'SeedsCountThreshold', 'SeedsCountThreshold'],
    ['./src/types/factoryTypes.ts', 'SeedingProfile', 'SeedingProfile'],
    ['./src/types/factoryTypes.ts', 'PolicySeedingProfile', 'PolicySeedingProfile'],
    ['./src/types/factoryTypes.ts', 'AdditionalSeedsAllowance', 'AdditionalSeedsAllowance'],
    ['./src/types/competitionPolicyTypes.ts', 'CompetitionPolicy', 'CompetitionPolicy'],
  ];

  const files = [...new Set(PAIRS.map(([file]) => file))];
  const program = ts.createProgram(files, { strict: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();

  function typedProperties(file: string, typeName: string): string[] | undefined {
    let properties: string[] | undefined;
    program.getSourceFile(file)?.forEachChild((node) => {
      if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name.text === typeName) {
        properties = checker.getPropertiesOfType(checker.getTypeAtLocation(node.name)).map(({ name }) => name);
      }
    });
    return properties?.toSorted((a, b) => a.localeCompare(b, 'en'));
  }

  it.each(PAIRS)('%s %s declares the members of #/definitions/%s', (file, typeName, definitionName) => {
    const typed = typedProperties(file, typeName);
    // CONTROL: the type was found and has members, so the comparison is not vacuous
    expect(typed?.length).toBeGreaterThan(0);
    const declared = Object.keys(schema.definitions[definitionName].properties).toSorted((a, b) =>
      a.localeCompare(b, 'en'),
    );
    expect(declared).toEqual(typed);
    expect(schema.definitions[definitionName].additionalProperties).toEqual(false);
  });
});

/**
 * Policies as records hold them: the TODS harness records, and policies the engine attaches. These
 * are the values a first-class attribute would carry, so they are the evidence it could be closed.
 */
describe('stored policies', () => {
  const harness = './src/tests/testHarness';
  const recordFiles = fs.readdirSync(harness).filter((file: string) => file.endsWith('.json'));

  /**
   * Members real records carry that no reader uses. `seedBlocks` predates `seedsCountThresholds` and
   * nothing reads it; it is legacy data, not a CODES concept, so the definition rightly rejects it.
   */
  const LEGACY: Record<string, string[]> = {
    'tournamentOne.codes.json': ['seedBlocks'],
  };

  it('every applied policy in the harness records validates, except the known legacy members', () => {
    let checked = 0;
    const failures: string[] = [];
    const legacyFound: Record<string, string[]> = {};
    for (const file of recordFiles) {
      const tournamentRecord = JSON.parse(fs.readFileSync(`${harness}/${file}`, { encoding: 'utf8' }));
      for (const { path, policies: stored } of appliedPoliciesIn(tournamentRecord)) {
        checked += 1;
        if (validatePolicies(stored)) continue;
        const unexpected = (validatePolicies.errors ?? []).filter(
          (error: any) =>
            !(error.keyword === 'additionalProperties' && LEGACY[file]?.includes(error.params?.additionalProperty)),
        );
        for (const error of validatePolicies.errors ?? []) {
          if (error.keyword === 'additionalProperties' && LEGACY[file]?.includes(error.params?.additionalProperty)) {
            legacyFound[file] = [...new Set([...(legacyFound[file] ?? []), error.params.additionalProperty])];
          }
        }
        if (unexpected.length) failures.push(`${file} ${path}: ${ajv.errorsText(unexpected)}`);
      }
    }
    // CONTROL: the harness holds applied policies, so the loop validated something
    expect(checked).toBeGreaterThan(20);
    expect(failures).toEqual([]);
    // the legacy exemption is not stale: each listed member is still found
    expect(legacyFound).toEqual(LEGACY);
  });

  it('the harness records still validate as records', () => {
    const failures = recordFiles
      .map((file: string) => {
        const tournamentRecord = JSON.parse(fs.readFileSync(`${harness}/${file}`, { encoding: 'utf8' }));
        return record(tournamentRecord) ? undefined : `${file}: ${ajv.errorsText(record.errors)}`;
      })
      .filter(Boolean);
    // the harness's own schema suite decides which records are expected to validate; this test
    // only proves the policy definitions changed nothing: no failure may mention a policy
    expect(failures.filter((failure) => /olic/.test(failure ?? ''))).toEqual([]);
  });

  it('policies attached through the engine validate, and so does the record holding them', () => {
    const scheduling = { ...POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING], defaultPeriodLength: 20 };
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd1', drawSize: 16, seedsCount: 4, policyDefinitions: POLICY_SEEDING_ITF }],
      policyDefinitions: { [POLICY_TYPE_SCHEDULING]: scheduling },
      setState: true,
    });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const stored = appliedPoliciesIn(tournamentRecord);
    // CONTROL: the tournament's scheduling policy and the draw's seeding policy are both stored
    expect(stored.map(({ policies: applied }) => Object.keys(applied)).flat()).toEqual(
      expect.arrayContaining([POLICY_TYPE_SCHEDULING, 'seeding']),
    );
    for (const { path, policies: applied } of stored) expect(errorsOf(validatePolicies, applied), path).toBeUndefined();

    const { appliedPolicies } = tournamentEngine.getAppliedPolicies({ drawId: 'd1' });
    expect(appliedPolicies?.[POLICY_TYPE_SCHEDULING]?.defaultPeriodLength).toEqual(20);
    expect(errorsOf(validatePolicies, appliedPolicies)).toBeUndefined();

    expect(errorsOf(record, tournamentRecord)).toBeUndefined();
  });
});
