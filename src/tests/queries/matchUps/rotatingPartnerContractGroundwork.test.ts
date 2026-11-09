import { getRotatingPartnerScoringPolicy } from '@Query/drawDefinition/getRotatingPartnerScoringPolicy';
import tournamentSchema from '@Global/schema/tournament.schema.json';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';
import {
  resolveRotatingPartnerScoringConfiguration,
  isRotatingPartnerScoringConfiguration,
  isRotatingPartnerScoringPolicyWithTimed,
  normalizeRotatingPartnerScoreContract,
  rotatingPartnerContractFormat,
} from '@Helpers/rotatingPartners/scoringContract';

// constants and types
import type { RotatingPartnerScoringPolicyWithTimed } from '@Types/rotatingPartnerTimed';
import type { RotatingPartnerTallyPolicy } from '@Types/rotatingPartnerTally';
import type { CompetitionProfile } from '@Types/competitionProfile';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';

const allow = { tieResolution: 'ALLOW' } as const;
const deciding = { tieResolution: 'DECIDING_POINT' } as const;
const margin = { tieResolution: 'WIN_BY_MARGIN', winningMargin: 2 } as const;
const combinedPolicy = { defaultVariant: allow, permittedVariants: [allow, deciding, margin] };
const policy: RotatingPartnerScoringPolicyWithTimed = {
  ...combinedPolicy,
  timed: { defaultVariant: allow, permittedVariants: [allow, deciding], permittedMinutes: [12, 15, 20] },
};
const tallyPolicy: RotatingPartnerTallyPolicy = {
  version: 1,
  decidingPoints: 'INCLUDE',
  overtimePoints: 'INCLUDE',
  statusTreatments: {},
};
const timed = { kind: 'TIMED', minutes: 15 } as const;
const timedContract = { ...timed, ...allow };
const validate = (definition: string) =>
  new Ajv().compile({
    $ref: `#/definitions/${definition}`,
    definitions: tournamentSchema.definitions,
  });
const configurationSchema = validate('CompetitionProfileScoring');
const contractSchema = validate('RotatingPartnerScoreContract');
const policySchema = validate('RotatingPartnerScoringPolicy');
const currentProfileSchema = addFormats(new Ajv({ allowUnionTypes: true })).compile({
  $ref: '#/definitions/CompetitionProfile',
  definitions: tournamentSchema.definitions,
});
const resolve = (scoring: unknown, configuredPolicy: unknown = policy, tally: unknown = tallyPolicy) =>
  resolveRotatingPartnerScoringConfiguration({ scoring, policy: configuredPolicy, tallyPolicy: tally });

describe('canonical scoring configuration and JSON shape', () => {
  it.each([
    { combinedPointTotal: 24 },
    { kind: 'COMBINED_POINTS', combinedPointTotal: 24, selectedVariant: margin },
    timed,
    { ...timed, selectedVariant: deciding },
    { ...timed, minutes: Number.MAX_SAFE_INTEGER },
  ])('accepts %j without changing it', (scoring) => {
    const before = structuredClone(scoring);
    expect(isRotatingPartnerScoringConfiguration(scoring)).toBe(true);
    expect(configurationSchema(scoring)).toBe(true);
    expect(scoring).toEqual(before);
  });

  it.each([
    null,
    [],
    {},
    { minutes: 15 },
    { ...timed, kind: 'UNKNOWN' },
    { ...timed, combinedPointTotal: 24 },
    { ...timed, winningMargin: 2 },
    { ...timed, selectedVariant: margin },
    { ...timed, selectedVariant: { ...deciding, winningMargin: 2 } },
    { ...timed, selectedVariant: null },
    { ...timed, extra: true },
    { kind: 'COMBINED_POINTS' },
    { combinedPointTotal: 24, minutes: 15 },
    ...[0, -1, 1.5, '15', Number.MAX_SAFE_INTEGER + 1].map((minutes) => ({ ...timed, minutes })),
  ])('refuses malformed configuration %j in runtime and schema', (scoring) => {
    expect(isRotatingPartnerScoringConfiguration(scoring)).toBe(false);
    expect(configurationSchema(scoring)).toBe(false);
    expect(resolve(scoring).error).toBe(INVALID_VALUES);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined])(
    'refuses non-JSON minutes %s before serialization',
    (minutes) => {
      expect(isRotatingPartnerScoringConfiguration({ ...timed, minutes })).toBe(false);
    },
  );
});

describe('saved contracts and format ownership', () => {
  it.each([
    [allow, 'SET1-S:P24'],
    [deciding, 'SET1-S:P24DP'],
    [margin, 'SET1-S:P24WB2'],
  ])('normalizes historical and explicit combined-point kinds identically: %j', (variant, format) => {
    const historical = { combinedPointTotal: 24, ...variant };
    const explicit = { ...historical, kind: 'COMBINED_POINTS' };
    for (const value of [historical, explicit]) {
      expect(contractSchema(value)).toBe(true);
      expect(normalizeRotatingPartnerScoreContract(value)).toEqual(historical);
      expect(rotatingPartnerContractFormat(value)).toBe(format);
    }
    expect(explicit.kind).toBe('COMBINED_POINTS');
    expect(historical).not.toHaveProperty('kind');
  });

  it.each([
    [allow, 'SET1-S:T15P'],
    [deciding, 'SET1-S:T15P/TB1'],
  ])('uses the code clock and existing grammar for %j', (variant, format) => {
    const saved = { ...timed, ...variant };
    expect(contractSchema(saved)).toBe(true);
    expect(rotatingPartnerContractFormat(saved)).toBe(format);
    expect(parse(format)?.setFormat?.minutes).toBe(15);
    expect(parse(format)?.setFormat?.based).toBe('P');
    // Exercise the persisted JSON boundary, not an in-memory clone.
    const wire = JSON.stringify(saved);
    expect(normalizeRotatingPartnerScoreContract(JSON.parse(wire))).toEqual(saved);
    expect(rotatingPartnerContractFormat({ ...saved, minutes: 20 })).not.toBe(format);
  });

  it('reads a saved timed choice independently of a later policy refusal', () => {
    expect(resolve(timed, combinedPolicy).error).toBe(INVALID_VALUES);
    expect(normalizeRotatingPartnerScoreContract(timedContract)).toEqual(timedContract);
    expect(rotatingPartnerContractFormat(timedContract)).toBe('SET1-S:T15P');
  });

  it.each([
    null,
    [],
    {},
    timed,
    { ...timedContract, minutes: 0 },
    { ...timedContract, combinedPointTotal: 24 },
    { ...timedContract, winningMargin: 2 },
    { ...timed, ...margin },
    { ...timedContract, phase: 'DECIDER' },
    { combinedPointTotal: 24 },
    { combinedPointTotal: 24, ...allow, minutes: 15 },
    { combinedPointTotal: 24, ...margin, winningMargin: 1 },
    { combinedPointTotal: 24, ...allow, kind: 'UNKNOWN' },
  ])('refuses an invalid saved contract %j', (value) => {
    expect(contractSchema(value)).toBe(false);
    expect(normalizeRotatingPartnerScoreContract(value)).toBeUndefined();
    expect(rotatingPartnerContractFormat(value)).toBeUndefined();
  });
});

describe('explicit policy enablement and tally compatibility', () => {
  it.each([combinedPolicy, policy])('accepts the structural policy %j', (configured) => {
    expect(policySchema(configured)).toBe(true);
    expect(isRotatingPartnerScoringPolicyWithTimed(configured)).toBe(true);
  });

  it('does not invent a policy when governing rules are absent', () => {
    expect(resolveRotatingPartnerScoringConfiguration({ scoring: timed, policy: undefined, tallyPolicy }).error).toBe(
      INVALID_VALUES,
    );
  });

  it('requires timed opt-in and preserves combined-point resolution', () => {
    expect(resolve(timed, combinedPolicy)).toMatchObject({
      error: INVALID_VALUES,
      info: 'timed rotating-partner scoring is not enabled',
    });
    for (const selectedVariant of [allow, deciding, margin]) {
      const scoring = { combinedPointTotal: 24, selectedVariant };
      expect(resolve(scoring, combinedPolicy).contract).toEqual({ combinedPointTotal: 24, ...selectedVariant });
      expect(resolve({ ...scoring, kind: 'COMBINED_POINTS' }, combinedPolicy).contract).toEqual(
        resolve(scoring, combinedPolicy).contract,
      );
    }
  });

  it('uses separate timed defaults and permitted variants; enforces durations', () => {
    const locked = {
      ...combinedPolicy,
      timed: { defaultVariant: deciding, permittedVariants: [deciding], permittedMinutes: [15] },
    };
    expect(resolve(timed, locked)).toMatchObject({
      success: true,
      selectionLocked: true,
      contract: { ...timed, ...deciding },
    });
    expect(resolve({ ...timed, selectedVariant: allow }, locked).info).toBe('scoring variant is not permitted');
    expect(resolve({ ...timed, minutes: 16 }).info).toBe('timed minutes are not permitted');
    expect(
      resolve(
        { ...timed, minutes: 16 },
        { ...combinedPolicy, timed: { defaultVariant: allow, permittedVariants: [allow] } },
      ).contract,
    ).toEqual({ ...timedContract, minutes: 16 });
    expect(resolve({ combinedPointTotal: 24 }, { ...policy, permittedPointTotals: [32] }).info).toBe(
      'combined point total is not permitted',
    );
  });

  it('refuses deciding-point exclusion and requires an intact tally policy', () => {
    const excluded = { ...tallyPolicy, decidingPoints: 'EXCLUDE' };
    expect(resolve({ ...timed, selectedVariant: deciding }, policy, excluded)).toMatchObject({
      error: INVALID_VALUES,
      info: 'timed deciding-point exclusion requires decided-result evidence',
    });
    expect(resolve(timed, policy, excluded).contract).toEqual(timedContract);
    expect(resolve(timed, policy, { ...tallyPolicy, overtimePoints: 'EXCLUDE' }).contract).toEqual(timedContract);
    expect(
      resolve({ ...timed, selectedVariant: deciding }, policy, { ...tallyPolicy, overtimePoints: 'EXCLUDE' }).contract,
    ).toEqual({ ...timed, ...deciding });
    expect(resolve({ combinedPointTotal: 24, selectedVariant: deciding }, policy, excluded).contract).toEqual({
      combinedPointTotal: 24,
      ...deciding,
    });
    expect(resolveRotatingPartnerScoringConfiguration({ scoring: timed, policy, tallyPolicy: undefined }).error).toBe(
      INVALID_VALUES,
    );
    expect(resolve(timed, policy, { ...tallyPolicy, decidingPoints: undefined }).error).toBe(INVALID_VALUES);
  });

  it.each([
    null,
    {},
    { ...policy, extra: true },
    { ...policy, timed: null },
    { ...policy, timed: {} },
    { ...policy, timed: { ...policy.timed, permittedVariants: [] } },
    { ...policy, timed: { ...policy.timed, permittedVariants: [allow, allow] } },
    { ...policy, timed: { defaultVariant: margin, permittedVariants: [margin] } },
    ...[[], [15, 15], [0], [1.5], [Number.MAX_SAFE_INTEGER + 1]].map((permittedMinutes) => ({
      ...policy,
      timed: { ...policy.timed, permittedMinutes },
    })),
  ])('refuses malformed governing policy %j', (configured) => {
    expect(policySchema(configured)).toBe(false);
    expect(isRotatingPartnerScoringPolicyWithTimed(configured)).toBe(false);
    expect(resolve(timed, configured).error).toBe(INVALID_VALUES);
  });

  it('checks relational membership in addition to the structural schema', () => {
    for (const configured of [
      { ...policy, defaultVariant: margin, permittedVariants: [allow] },
      { ...policy, timed: { defaultVariant: deciding, permittedVariants: [allow] } },
    ]) {
      expect(policySchema(configured)).toBe(true);
      expect(isRotatingPartnerScoringPolicyWithTimed(configured)).toBe(false);
    }
    expect(isRotatingPartnerScoringPolicyWithTimed({ ...policy, timed: undefined })).toBe(false);
  });

  it('does not mutate or alias inputs', () => {
    const before = structuredClone({ policy, tallyPolicy, timed });
    const resolved = resolve(timed);
    expect(resolved.selectionLocked).toBe(false);
    if (resolved.contract && 'minutes' in resolved.contract) resolved.contract.minutes = 999;
    expect({ policy, tallyPolicy, timed }).toEqual(before);
    expect(resolve(timed).contract).toEqual(timedContract);
  });
});

function draw(): DrawDefinition {
  return {
    drawId: 'contract-boundary',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    structures: [],
    competitionProfile: {
      version: 1,
      format: 'AMERICANO',
      entrantScope: 'INDIVIDUAL',
      matchUpType: 'DOUBLES',
      scoring: { combinedPointTotal: 24 },
      standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
      pairing: { seed: 42, algorithmVersion: 1 },
      completion: { kind: 'PARTNERSHIP_COVERAGE' },
    },
  };
}

describe('public activation and explicit policy enablement', () => {
  it('accepts timed policy without changing the existing combined-point choice', () => {
    const drawDefinition = draw();
    drawDefinition.extensions = [
      { name: APPLIED_POLICIES, value: { scoring: { rotatingPartners: { AMERICANO: policy } } } },
    ];
    expect(getRotatingPartnerScoringPolicy({ drawDefinition }).contract).toEqual({ combinedPointTotal: 24, ...allow });
  });

  it('matches the shipped query for every combined-point choice', () => {
    for (const selectedVariant of [allow, deciding, margin]) {
      const drawDefinition = draw();
      expect(resolve({ combinedPointTotal: 24, selectedVariant }, combinedPolicy).contract).toEqual(
        getRotatingPartnerScoringPolicy({ drawDefinition, selectedVariant }).contract,
      );
    }
  });

  it('admits timed profile JSON but refuses an unenabled timed write atomically', () => {
    const drawDefinition = draw();
    const tournamentRecord = {
      tournamentId: 'groundwork',
      events: [{ eventId: 'event', eventType: 'DOUBLES' as const, drawDefinitions: [drawDefinition] }],
    };
    const proposed = { ...drawDefinition.competitionProfile, scoring: timed };
    expect(currentProfileSchema(proposed)).toBe(true);
    expect(tournamentEngine.setState(tournamentRecord).success).toBe(true);
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    expect(
      tournamentEngine.setCompetitionProfile({
        drawId: drawDefinition.drawId,
        competitionProfile: proposed as CompetitionProfile,
      }).error,
    ).toBe(INVALID_VALUES);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  });
});
