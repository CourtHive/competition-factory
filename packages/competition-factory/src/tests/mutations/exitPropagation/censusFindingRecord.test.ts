import { replay } from '@Tests/testHarness/exitPropagation/sweep';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import {
  censusArm,
  findingLocation,
  findingProvenance,
  harnessRevision,
} from '@Tests/testHarness/exitPropagation/findingRecord';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Tournament } from '@Types/tournamentTypes';

/**
 * Census plan A6: a finding names the call that failed and the first field that differed, so it reproduces without a
 * reader re-deriving them. A relational probe runs five calls, each from the scheduled state: monotonicity's apply (1),
 * idempotence's first and second applies (2, 3), and the round trip's apply and clear (4, 5).
 */
const config = { drawType: SINGLE_ELIMINATION, propagateExitStatus: true, participantsCount: 8, drawSize: 8, seed: 42 };
const step = { structureName: 'Main', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 1 } };
const firstProbe = {
  structureName: 'Main',
  roundNumber: 1,
  roundPosition: 1,
  outcome: { matchUpStatus: DOUBLE_WALKOVER },
};
const drawOf = (record: Tournament) => record.events![0].drawDefinitions![0];

beforeEach(() => setSubscriptions({}));
afterEach(() => vi.restoreAllMocks());

/** Refuse the `nth` call after writing `notes`, a field the projection omits. */
function refuseAfterWritingOn(nth: number) {
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  let calls = 0;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params) => {
    calls += 1;
    if (calls !== nth) return setMatchUpStatus(params);
    const { tournamentRecord } = tournamentEngine.getTournament();
    drawOf(tournamentRecord).structures![0].matchUps![0].notes = 'planted';
    tournamentEngine.setState(tournamentRecord);
    return { error: INVALID_VALUES };
  });
}

it.each([
  { nth: 1, stage: 'forward' },
  { nth: 3, stage: 'second-apply' },
  { nth: 5, stage: 'clear' },
])('a refusal that wrote on relational call $nth names the $stage stage, the probe and the field', ({ nth, stage }) => {
  refuseAfterWritingOn(nth);
  const [finding] = replay(config, [], `record-${stage}`).findings;
  expect(finding).toMatchObject({ property: 'ERROR_IMPLIES_NO_MUTATION', stage, probe: firstProbe });
  expect(finding.firstDivergence).toMatch(/^\/events\/0\/drawDefinitions\/0\/.*\/notes$/);
  expect(findingLocation(finding)).toEqual({ stage, firstDivergence: finding.firstDivergence });
});

it('a refusal that wrote during the schedule names the step and carries no probe', () => {
  refuseAfterWritingOn(2);
  const steps = [step, { ...step, roundPosition: 2 }];
  const result = replay(config, steps, 'record-schedule', undefined, undefined, { stopOnFailure: false });
  const [finding] = result.findings;
  expect(finding).toMatchObject({ property: 'ERROR_IMPLIES_NO_MUTATION', stage: 'schedule', step: 1 });
  expect(finding.probe).toBeUndefined();
  expect(finding.firstDivergence).toMatch(/\/notes$/);
});

it('a clear that leaves a residue names the first field the round trip did not restore', () => {
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  let calls = 0;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params) => {
    calls += 1;
    let result: any = setMatchUpStatus(params);
    if (calls === 5) {
      const { tournamentRecord } = tournamentEngine.getTournament();
      // a matchUp the probe never touched keeps a result after the clear
      const bystander = drawOf(tournamentRecord).structures![0].matchUps!.find(
        (matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 4,
      )!;
      bystander.winningSide = 2;
      tournamentEngine.setState(tournamentRecord);
    }
    return result;
  });
  const finding = replay(config, [], 'record-residue').findings.find(({ property }) => property === 'DO_UNDO_IDENTITY');
  expect(finding).toMatchObject({ stage: 'clear', probe: firstProbe });
  const [change] = finding!.changes!;
  expect(finding!.firstDivergence).toEqual(`${change.at} ${change.field}`);
  expect(change).toMatchObject({ at: 'Main|1|4', field: 'winningSide' });
});

it('a build failure is the build stage', () => {
  const result = replay(config, [], 'record-build', undefined, undefined, {
    preparationFailure: { property: 'SCHEDULE_MISSING', matchUpId: '-', detail: 'planted' },
  });
  expect(findingLocation(result.findings[0])).toEqual({ stage: 'build' });
});

it.each([
  { env: {}, arm: 'off' },
  { env: { ALLOW_CHANGE_PROPAGATION: '1' }, arm: 'on' },
  { env: { PROPAGATE_BYE: '0' }, arm: 'policyoff' },
  { env: { PROPAGATE_BYE: '1' }, arm: 'policyon' },
  { env: { ALLOW_CHANGE_PROPAGATION: '1', PROPAGATE_BYE: '0' }, arm: 'on+policyoff' },
  { env: { CENSUS_ARM: 'pol', PROPAGATE_BYE: '0' }, arm: 'pol' },
])('the arm is read from the variables the workers set: $arm', ({ env, arm }) => {
  expect(censusArm(env)).toEqual(arm);
});

it('provenance names the policy and both revisions, with null where they are unknown', () => {
  const harness = harnessRevision();
  expect(harness).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
  const policyDefinitions = { progression: { doubleExitPropagateBye: false } };
  expect(findingProvenance({ policyDefinitions, sourceRevision: 'abc', arm: 'policyoff' })).toEqual({
    arm: 'policyoff',
    policyDefinitions,
    revisions: { source: 'abc', harness },
  });
  expect(findingProvenance({ arm: 'off' })).toEqual({
    arm: 'off',
    policyDefinitions: null,
    revisions: { source: null, harness },
  });
});
