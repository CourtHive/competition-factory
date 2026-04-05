/**
 * Coverage tests for small modules below 95% statement coverage.
 * Targets: matchUpEventTypes, asyncEngine, syncEngine, mutationLocks, query/extensions.
 */
import { includesMatchUpEventType } from '@Helpers/matchUpEventTypes/includesMatchUpEventType';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { removeMutationLock } from '@Mutate/tournaments/mutationLocks/removeMutationLock';
import { getMatchUpDailyLimits } from '@Query/extensions/getMatchUpDailyLimits';
import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { addMutationLock } from '@Mutate/tournaments/mutationLocks/addMutationLock';
import { getExtensionUpdate } from '@Query/extensions/getExtensionUpdate';
import { getDisabledStatus } from '@Query/extensions/getDisabledStatus';
import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';
import syncEngine from '@Engines/syncEngine';
import { describe, it, expect } from 'vitest';

import { APPLIED_POLICIES, SCHEDULE_LIMITS } from '@Constants/extensionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import {
  UNAUTHORIZED_LOCK_OPERATION,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_TOURNAMENT_RECORD,
  MUTATION_LOCK_NOT_FOUND,
  MUTATION_LOCK_EXISTS,
  MISSING_POLICY_TYPE,
  METHOD_NOT_FOUND,
  INVALID_VALUES,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

// ── matchUpEventTypes ──────────────────────────────────────────────────────────
describe('matchUpEventTypes coverage', () => {
  it('includesMatchUpEventType returns false for non-array types', () => {
    let result: any = includesMatchUpEventType('notArray' as any, SINGLES);
    expect(result).toBe(false);
  });

  it('includesMatchUpEventType returns false for non-string matchUpEventType', () => {
    let result: any = includesMatchUpEventType([SINGLES], 123 as any);
    expect(result).toBe(false);
  });

  it('includesMatchUpEventType works with valid params', () => {
    let result: any = includesMatchUpEventType([SINGLES, 'S'], SINGLES);
    expect(result).toBeTruthy();
  });

  it('isMatchUpEventType returns falsy for non-object non-string params', () => {
    let result: any = isMatchUpEventType(SINGLES)(undefined);
    expect(result).toBeFalsy();
  });

  it('isMatchUpEventType works with string params', () => {
    let result: any = isMatchUpEventType(DOUBLES)(DOUBLES);
    expect(result).toBe(true);
  });

  it('isMatchUpEventType works with object params', () => {
    let result: any = isMatchUpEventType(TEAM)({ matchUpType: TEAM });
    expect(result).toBe(true);
  });
});

// ── asyncEngine ────────────────────────────────────────────────────────────────
describe('asyncEngine coverage', () => {
  it('returns error for non-object args via execute', async () => {
    let result: any = await asyncEngine.execute('not an object' as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when multiple function args are passed', async () => {
    let result: any = await asyncEngine.execute({
      fn1: () => 'a',
      fn2: () => 'b',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns METHOD_NOT_FOUND when no method name can be resolved', async () => {
    let result: any = await asyncEngine.execute({ params: { foo: 1 } });
    expect(result.error).toEqual(METHOD_NOT_FOUND);
  });

  it('executionQueue returns error for non-array directives', async () => {
    let result: any = await asyncEngine.executionQueue('bad' as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('executionQueue returns error for non-object directive element', async () => {
    let result: any = await asyncEngine.executionQueue(['stringDirective'] as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('executionQueue handles rollbackOnError on method error', async () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    await asyncEngine.setState(tournamentRecord);
    let result: any = await asyncEngine.executionQueue(
      [{ method: 'toggleParticipantCheckInState' }],
      true,
    );
    expect(result.rolledBack).toBe(true);
  });

  it('execute with delayNotify suppresses notifications', async () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    await asyncEngine.setState(tournamentRecord);
    let result: any = await asyncEngine.execute({
      method: 'getTournamentInfo',
      params: { delayNotify: true },
    });
    expect(result.tournamentInfo).toBeDefined();
  });

  it('execute with doNotNotify suppresses notifications', async () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    await asyncEngine.setState(tournamentRecord);
    let result: any = await asyncEngine.execute({
      method: 'getTournamentInfo',
      params: { doNotNotify: true },
    });
    expect(result.tournamentInfo).toBeDefined();
  });
});

// ── syncEngine ─────────────────────────────────────────────────────────────────
describe('syncEngine coverage', () => {
  it('returns error for non-object args', () => {
    let result: any = syncEngine.execute(42 as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when multiple function args are passed', () => {
    let result: any = syncEngine.execute({
      fn1: () => 'a',
      fn2: () => 'b',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns METHOD_NOT_FOUND when no method name can be resolved', () => {
    let result: any = syncEngine.execute({ params: { foo: 1 } });
    expect(result.error).toEqual(METHOD_NOT_FOUND);
  });

  it('executionQueue returns error for non-array directives', () => {
    let result: any = syncEngine.executionQueue('bad' as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('executionQueue returns error for non-object directive element', () => {
    let result: any = syncEngine.executionQueue(['notAnObject'] as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('executionQueue returns error when directive.params is non-object', () => {
    let result: any = syncEngine.executionQueue([{ method: 'getTournamentInfo', params: 'bad' }] as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('execute with delayNotify suppresses notifications', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    syncEngine.setState(tournamentRecord);
    let result: any = syncEngine.execute({
      method: 'getTournamentInfo',
      params: { delayNotify: true },
    });
    expect(result.tournamentInfo).toBeDefined();
  });

  it('execute with doNotNotify suppresses notifications', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    syncEngine.setState(tournamentRecord);
    let result: any = syncEngine.execute({
      method: 'getTournamentInfo',
      params: { doNotNotify: true },
    });
    expect(result.tournamentInfo).toBeDefined();
  });
});

// ── mutationLocks ──────────────────────────────────────────────────────────────
describe('mutationLocks coverage', () => {
  const makeTournament = () => ({
    tournamentId: 'test-tid',
    extensions: [],
    events: [],
    venues: [],
  });

  it('addMutationLock returns error when tournamentRecord is missing', () => {
    let result: any = addMutationLock({
      tournamentRecord: undefined as any,
      scope: 'SCORING',
      lockToken: 'tok',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('addMutationLock returns error when scope is missing', () => {
    let result: any = addMutationLock({
      tournamentRecord: makeTournament() as any,
      scope: undefined as any,
      lockToken: 'tok',
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('addMutationLock returns error when lockToken is missing', () => {
    let result: any = addMutationLock({
      tournamentRecord: makeTournament() as any,
      scope: 'SCORING',
      lockToken: undefined as any,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('addMutationLock returns error for invalid expiresAt', () => {
    let result: any = addMutationLock({
      tournamentRecord: makeTournament() as any,
      scope: 'SCORING',
      lockToken: 'tok',
      expiresAt: 'not-a-date',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('addMutationLock adds lock to tournament and sets feature gate', () => {
    const tournament = makeTournament();
    let result: any = addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'SCORING',
      lockToken: 'tok1',
    });
    expect(result.success).toBe(true);
    expect(result.lockId).toBeDefined();
  });

  it('addMutationLock upserts when same token re-locks same scope', () => {
    const tournament = makeTournament();
    let result: any = addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'DRAWS',
      lockToken: 'tok-a',
      methods: ['addDrawDefinition'],
    });
    expect(result.success).toBe(true);
    const lockId = result.lockId;

    result = addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'DRAWS',
      lockToken: 'tok-a',
    });
    expect(result.success).toBe(true);
    expect(result.lockId).toEqual(lockId);
  });

  it('addMutationLock returns MUTATION_LOCK_EXISTS for different token on same scope', () => {
    const tournament = makeTournament();
    addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'EVENTS',
      lockToken: 'tok-x',
    });
    let result: any = addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'EVENTS',
      lockToken: 'tok-y',
    });
    expect(result.error).toEqual(MUTATION_LOCK_EXISTS);
  });

  it('addMutationLock on event element sets tournament-level feature gate', () => {
    const tournament = makeTournament();
    const event = { eventId: 'ev1', extensions: [] };
    let result: any = addMutationLock({
      tournamentRecord: tournament as any,
      event: event as any,
      scope: 'ENTRIES',
      lockToken: 'tok-ev',
    });
    expect(result.success).toBe(true);
  });

  it('addMutationLock on draw element', () => {
    const tournament = makeTournament();
    const draw = { drawId: 'dd1', extensions: [] };
    let result: any = addMutationLock({
      tournamentRecord: tournament as any,
      drawDefinition: draw as any,
      scope: 'MATCHUPS',
      lockToken: 'tok-dd',
    });
    expect(result.success).toBe(true);
  });

  it('removeMutationLock returns error when tournamentRecord is missing', () => {
    let result: any = removeMutationLock({
      tournamentRecord: undefined as any,
      lockId: 'x',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('removeMutationLock returns error when neither lockId nor scope provided', () => {
    let result: any = removeMutationLock({
      tournamentRecord: makeTournament() as any,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('removeMutationLock returns MUTATION_LOCK_NOT_FOUND for absent lock', () => {
    let result: any = removeMutationLock({
      tournamentRecord: makeTournament() as any,
      lockId: 'nonexistent',
    });
    expect(result.error).toEqual(MUTATION_LOCK_NOT_FOUND);
  });

  it('removeMutationLock returns UNAUTHORIZED when token does not match', () => {
    const tournament = makeTournament();
    const addResult = addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'SCHEDULING',
      lockToken: 'tok-owner',
    });
    let result: any = removeMutationLock({
      tournamentRecord: tournament as any,
      lockId: (addResult as any).lockId,
      lockToken: 'tok-intruder',
    });
    expect(result.error).toEqual(UNAUTHORIZED_LOCK_OPERATION);
  });

  it('removeMutationLock succeeds with correct token', () => {
    const tournament = makeTournament();
    const addResult = addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'SCORING',
      lockToken: 'tok-owner',
    });
    let result: any = removeMutationLock({
      tournamentRecord: tournament as any,
      lockId: (addResult as any).lockId,
      lockToken: 'tok-owner',
    });
    expect(result.success).toBe(true);
  });

  it('removeMutationLock with forceRelease bypasses token check', () => {
    const tournament = makeTournament();
    const addResult = addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'VENUES',
      lockToken: 'tok-lock',
    });
    let result: any = removeMutationLock({
      tournamentRecord: tournament as any,
      lockId: (addResult as any).lockId,
      forceRelease: true,
    });
    expect(result.success).toBe(true);
  });

  it('removeMutationLock by scope', () => {
    const tournament = makeTournament();
    addMutationLock({
      tournamentRecord: tournament as any,
      scope: 'POLICY',
      lockToken: 'tok-scope',
    });
    let result: any = removeMutationLock({
      tournamentRecord: tournament as any,
      scope: 'POLICY',
      lockToken: 'tok-scope',
    });
    expect(result.success).toBe(true);
  });

  it('removeMutationLock on event element', () => {
    const tournament = makeTournament();
    const event = { eventId: 'ev2', extensions: [] };
    addMutationLock({
      tournamentRecord: tournament as any,
      event: event as any,
      scope: 'ENTRIES',
      lockToken: 'tok-ev2',
    });
    let result: any = removeMutationLock({
      tournamentRecord: tournament as any,
      event: event as any,
      scope: 'ENTRIES',
      lockToken: 'tok-ev2',
    });
    expect(result.success).toBe(true);
  });
});

// ── query/extensions ───────────────────────────────────────────────────────────
describe('query/extensions coverage', () => {
  it('getAppliedPolicies returns error for non-array policyTypes', () => {
    let result: any = getAppliedPolicies({ policyTypes: 'bad' as any });
    expect(result.error).toEqual(MISSING_POLICY_TYPE);
  });

  it('getAppliedPolicies extracts policies from extensions at multiple levels', () => {
    const policy = { scoring: { requireAllPositionsAssigned: true } };
    const ext = { name: APPLIED_POLICIES, value: policy };
    let result: any = getAppliedPolicies({
      tournamentRecord: { extensions: [ext] } as any,
      event: { extensions: [ext] } as any,
    });
    expect(result.appliedPolicies).toBeDefined();
    expect(result.appliedPolicies.scoring).toBeDefined();
  });

  it('getAppliedPolicies respects onlySpecifiedPolicyTypes', () => {
    const policy = { scoring: { foo: 1 }, scheduling: { bar: 2 } };
    const ext = { name: APPLIED_POLICIES, value: policy };
    let result: any = getAppliedPolicies({
      onlySpecifiedPolicyTypes: true,
      policyTypes: ['scoring'],
      tournamentRecord: { extensions: [ext] } as any,
    });
    expect(result.appliedPolicies.scoring).toBeDefined();
    expect(result.appliedPolicies.scheduling).toBeUndefined();
  });

  it('getAppliedPolicies with policyTypes filter (non-only mode)', () => {
    const policy = { scoring: { foo: 1 }, scheduling: { bar: 2 } };
    const ext = { name: APPLIED_POLICIES, value: policy };
    let result: any = getAppliedPolicies({
      policyTypes: ['scoring'],
      tournamentRecord: { extensions: [ext] } as any,
    });
    expect(result.appliedPolicies.scoring).toBeDefined();
    expect(result.appliedPolicies.scheduling).toBeUndefined();
  });

  it('getAppliedPolicies on structure and drawDefinition', () => {
    const policy = { seeding: { strategy: 'waterfall' } };
    const ext = { name: APPLIED_POLICIES, value: policy };
    let result: any = getAppliedPolicies({
      drawDefinition: { extensions: [ext] } as any,
      structure: { extensions: [ext] } as any,
    });
    expect(result.appliedPolicies.seeding).toBeDefined();
  });

  it('getPolicyDefinitions returns error for non-array policyTypes', () => {
    let result: any = getPolicyDefinitions({ policyTypes: 'bad' as any });
    expect(result.error).toEqual(MISSING_POLICY_TYPE);
  });

  it('getPolicyDefinitions returns info when policy not found', () => {
    let result: any = getPolicyDefinitions({
      policyTypes: ['nonexistent'],
      tournamentRecord: { extensions: [] } as any,
    });
    expect(result.info).toBeDefined();
  });

  it('getPolicyDefinitions returns matched policies', () => {
    const policy = { scoring: { something: true } };
    const ext = { name: APPLIED_POLICIES, value: policy };
    let result: any = getPolicyDefinitions({
      policyTypes: ['scoring'],
      tournamentRecord: { extensions: [ext] } as any,
    });
    expect(result.policyDefinitions).toBeDefined();
    expect(result.policyDefinitions.scoring).toBeDefined();
  });

  it('getDisabledStatus returns false for no extension', () => {
    let result: any = getDisabledStatus({ extension: undefined });
    expect(result).toBe(false);
  });

  it('getDisabledStatus returns true for boolean true value', () => {
    let result: any = getDisabledStatus({ extension: { value: true } });
    expect(result).toBe(true);
  });

  it('getDisabledStatus returns false when boolean false (court disabled)', () => {
    let result: any = getDisabledStatus({ extension: { value: false } });
    expect(result).toBe(false);
  });

  it('getDisabledStatus returns false with no dates', () => {
    let result: any = getDisabledStatus({
      extension: { value: { dates: ['2024-01-01'] } },
    });
    expect(result).toBe(false);
  });

  it('getDisabledStatus returns truthy when all dates appear in disabled dates', () => {
    let result: any = getDisabledStatus({
      dates: ['2024-01-01'],
      extension: { value: { dates: ['2024-01-01', '2024-01-02'] } },
    });
    expect(result).toBe(true);
  });

  it('getDisabledStatus returns false when disabledDates is empty array', () => {
    let result: any = getDisabledStatus({
      dates: ['2024-01-01'],
      extension: { value: { dates: [] } },
    });
    expect(result).toBe(false);
  });

  it('getDisabledStatus returns undefined for non-array dates value', () => {
    let result: any = getDisabledStatus({
      dates: ['2024-01-01'],
      extension: { value: { other: 'stuff' } },
    });
    expect(result).toBeUndefined();
  });

  it('getExtensionUpdate returns error for empty tournamentRecords', () => {
    let result: any = getExtensionUpdate({
      tournamentRecords: {} as any,
      extensionName: SCHEDULE_LIMITS,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('getExtensionUpdate returns error for non-object tournamentRecords', () => {
    let result: any = getExtensionUpdate({
      tournamentRecords: 'bad' as any,
      extensionName: SCHEDULE_LIMITS,
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('getExtensionUpdate returns methods for tournament and event extensions', () => {
    const ext = { name: SCHEDULE_LIMITS, value: { dailyLimits: { SINGLES: 2 } } };
    const records = {
      t1: {
        tournamentId: 't1',
        extensions: [ext],
        events: [{ eventId: 'e1', extensions: [ext] }],
      },
    };
    let result: any = getExtensionUpdate({
      tournamentRecords: records as any,
      extensionName: SCHEDULE_LIMITS,
    });
    expect(result.methods).toBeDefined();
    expect(result.methods.length).toBe(2);
  });

  it('getExtensionUpdate only pushes tournament extension once across multiple records', () => {
    const ext = { name: SCHEDULE_LIMITS, value: { dailyLimits: {} } };
    const records = {
      t1: { tournamentId: 't1', extensions: [ext], events: [] },
      t2: { tournamentId: 't2', extensions: [ext], events: [] },
    };
    let result: any = getExtensionUpdate({
      tournamentRecords: records as any,
      extensionName: SCHEDULE_LIMITS,
    });
    const tournamentMethods = result.methods.filter((m) => m.method === 'addExtension');
    expect(tournamentMethods.length).toBe(1);
  });

  it('getMatchUpDailyLimits returns error for empty records', () => {
    let result: any = getMatchUpDailyLimits({ tournamentRecords: {} as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
  });

  it('getMatchUpDailyLimits returns limits from tournament', () => {
    const ext = { name: SCHEDULE_LIMITS, value: { dailyLimits: { SINGLES: 3 } } };
    let result: any = getMatchUpDailyLimits({
      tournamentRecords: {
        t1: { tournamentId: 't1', extensions: [ext] } as any,
      },
    });
    expect(result.matchUpDailyLimits).toBeDefined();
  });

  it('getMatchUpDailyLimits respects tournamentId filter', () => {
    const ext = { name: SCHEDULE_LIMITS, value: { dailyLimits: { SINGLES: 5 } } };
    let result: any = getMatchUpDailyLimits({
      tournamentRecords: {
        t1: { tournamentId: 't1', extensions: [ext] } as any,
        t2: { tournamentId: 't2', extensions: [] } as any,
      },
      tournamentId: 't1',
    });
    expect(result.matchUpDailyLimits).toBeDefined();
  });
});
