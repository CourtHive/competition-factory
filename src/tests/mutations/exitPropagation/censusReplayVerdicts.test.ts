import { replayPerStepIntegrity } from '@Tests/testHarness/exitPropagation/perStepIntegrity';
import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { replay } from '@Tests/testHarness/exitPropagation/sweep';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';

const config = { drawType: SINGLE_ELIMINATION, propagateExitStatus: true, participantsCount: 8, drawSize: 8, seed: 42 };
const step = { structureName: 'Main', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 1 } };

beforeEach(() => setSubscriptions({}));
afterEach(() => vi.restoreAllMocks());

it('a refused build is build-failed rather than clean', () => {
  vi.spyOn(mocksEngine, 'generateTournamentRecord').mockReturnValue({ error: INVALID_VALUES });
  const result = replay(config, [step], 'build-failed');
  expect(result.verdict).toEqual('build-failed');
  expect(result.complete).toEqual(false);
  expect(result.counts).toMatchObject({ buildFailed: 1, attempted: 0, checked: 0, unvisited: 1 });
  expect(result.findings[0].property).toEqual('DRAW_BUILD_FAILED');
});

it('a thrown build is accounted for without escaping or reporting clean', () => {
  vi.spyOn(mocksEngine, 'generateTournamentRecord').mockImplementation(() => {
    throw new Error('planted build failure');
  });
  const result = replay(config, [], 'build-thrown');
  expect(result.verdict).toEqual('build-failed');
  expect(result.counts.buildFailed).toEqual(1);
  expect(result.findings[0].property).toEqual('GENERATION_THROW');
});

it.each([
  { reason: 'coordinate-missing', invalid: { ...step, roundNumber: 99 } },
  { reason: 'not-scoreable', invalid: { ...step, roundNumber: 2 } },
])('reports $reason as lost coverage, not a complete clean replay', ({ reason, invalid }) => {
  const result = replay(config, [invalid], 'skipped', undefined, undefined, { relational: false });
  expect(result.verdict).toEqual('clean');
  expect(result.complete).toEqual(false);
  expect(result.counts).toMatchObject({
    attempted: 0,
    accepted: 0,
    checked: 0,
    skipped: 1,
    skippedWithReason: { [reason]: 1 },
    unvisited: 0,
  });
});

it('counts actual calls and checks for a completed schedule', () => {
  const result = replay(config, [step], 'accepted', undefined, undefined, { relational: false });
  expect(result).toMatchObject({
    verdict: 'clean',
    complete: true,
    findings: [],
    counts: {
      plannedScheduleSteps: 1,
      scheduleAttempted: 1,
      attempted: 1,
      accepted: 1,
      refused: 0,
      thrown: 0,
      checked: 1,
      skipped: 0,
    },
  });
});

it('counts refused calls separately from accepted calls', () => {
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockReturnValue({ error: INVALID_VALUES });
  const result = replay(config, [step], 'refused', undefined, undefined, { relational: false });
  expect(result).toMatchObject({
    verdict: 'clean',
    complete: true,
    counts: { attempted: 1, accepted: 0, refused: 1, checked: 1 },
  });
});

it('a thrown mutation is failed and leaves subsequent scheduled work unvisited', () => {
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation(() => {
    throw new Error('planted mutation failure');
  });
  const result = replay(config, [step, step], 'thrown');
  expect(result).toMatchObject({
    verdict: 'failed',
    complete: false,
    counts: { attempted: 1, accepted: 0, refused: 0, thrown: 1, checked: 1, unvisited: 1 },
  });
  expect(result.findings[0].property).toEqual('NO_EXCEPTION_ESCAPES');
});

it('includes relational second applies and clears in execution counts', () => {
  const result = replay(config, [], 'relational');
  expect(result).toMatchObject({
    verdict: 'clean',
    complete: true,
    counts: { attempted: 15, accepted: 15, checked: 15 },
    coverage: { forward: 9, secondApply: 3, clear: 3 },
  });
});

it('per-step integrity uses the stored policy and catches a fault conditional on policy-off', () => {
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  let planted = 0;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params) => {
    let result: any = setMatchUpStatus(params);
    const { tournamentRecord } = tournamentEngine.getTournament();
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const policies = getAppliedPolicies({ tournamentRecord, event, drawDefinition }).appliedPolicies;
    if (policies?.[POLICY_TYPE_PROGRESSION]?.doubleExitPropagateBye === false) {
      const next = drawDefinition.structures[0].matchUps.find(
        (matchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
      );
      next.drawPositions = [];
      tournamentEngine.setState(tournamentRecord);
      planted += 1;
    }
    return result;
  });
  const control = replayPerStepIntegrity({ config, steps: [step], drawId: 'policy-control' });
  expect(control.perStep).toEqual([]);
  expect(planted).toEqual(0);
  const result = replayPerStepIntegrity({
    config,
    steps: [step],
    drawId: 'policy-off',
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
  });
  expect(planted).toEqual(1);
  expect(result.perStep).toHaveLength(1);
  expect(result.perStep[0].inconsistencies.some((issue) => issue.issueType === 'WINNER_NOT_ADVANCED')).toEqual(true);
  expect(result.replay.counts.accepted).toEqual(1);
  expect(result.replay.verdict).toEqual('failed');
});

it('a transient per-step inconsistency stays failed even when the final draw is clean', () => {
  const nextOf = (record: Tournament) =>
    record.events![0].drawDefinitions![0].structures![0].matchUps!.find(
      (matchUp: MatchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
    )!;
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  let calls = 0;
  let savedPositions: number[] = [];
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params) => {
    calls += 1;
    if (calls === 2) {
      const { tournamentRecord } = tournamentEngine.getTournament();
      nextOf(tournamentRecord).drawPositions = savedPositions;
      tournamentEngine.setState(tournamentRecord);
    }
    let result: any = setMatchUpStatus(params);
    if (calls === 1) {
      const { tournamentRecord } = tournamentEngine.getTournament();
      savedPositions = [...nextOf(tournamentRecord).drawPositions!];
      nextOf(tournamentRecord).drawPositions = [];
      tournamentEngine.setState(tournamentRecord);
    }
    return result;
  });
  const result = replayPerStepIntegrity({ config, steps: [step, { ...step, roundPosition: 2 }], drawId: 'transient' });
  expect(result.perStep).toHaveLength(1);
  expect(result.finalInconsistencies).toEqual([]);
  expect(result.replay.verdict).toEqual('failed');
  expect(result.replay.counts.checked).toEqual(2);
});

it('stall counting preserves a missing schedule as a build failure', () => {
  const result = replayStalls({ scenario: { seed: 42, config }, drawId: 'missing-stall-schedule', catchThrows: true });
  expect(result.stalls).toBeUndefined();
  expect(result.replay.verdict).toEqual('build-failed');
  expect(result.replay.counts.buildFailed).toEqual(1);
  expect(result.replay.findings[0].property).toEqual('SCHEDULE_MISSING');
});
