import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP } from '@Constants/topicConstants';
import { IN_PROGRESS, SUSPENDED } from '@Constants/matchUpStatusConstants';

/**
 * THE S1 SHADOW APPLY SEES WHAT IT IS SHOWN, AND FAILS WHEN THE PLAN IS WRONG (outcome v2 executor plan § 6 S1).
 *
 * In `differential`, a complete plan is folded into the record as it stood before v1 ran and compared with what v1
 * wrote. "Zero divergences" proves something only if a wrong plan is caught: the second test plants a fault in the
 * reducer (`setMatchUpResult` writes the wrong status) and the same call must throw, naming the field.
 */
const planted = { fault: false, notice: false };

vi.mock('@Mutate/matchUps/outcome/ops', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    applyOutcomeOps: (drawDefinition: any, ops: any[]) =>
      actual.applyOutcomeOps(
        drawDefinition,
        planted.fault
          ? ops.map((op) => (op.op === 'setMatchUpResult' ? { ...op, matchUpStatus: SUSPENDED } : op))
          : ops,
      ),
  };
});

vi.mock('@Mutate/matchUps/outcome/shadow', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // the planted notice fault: the plan forgets the notice for the call's own matchUp
    plannedNotices: (args: any) => {
      const notices: Set<string> = actual.plannedNotices(args);
      if (planted.notice) notices.delete(`${MODIFY_MATCHUP}|${args.matchUpId}`);
      return notices;
    },
  };
});

afterEach(() => {
  planted.fault = false;
  planted.notice = false;
  setSubscriptions({});
});

function scoreInProgress() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
  const first = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
  const { outcome } = generateOutcomeFromScoreString({ scoreString: '3-2', matchUpStatus: IN_PROGRESS });
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  resetDifferentialTally();
  return () => tournamentEngine.setMatchUpStatus({ matchUpId: first.matchUpId, outcome, drawId: 'd' });
}

it('an in-progress score is shadow-applied and agrees with what v1 wrote', () => {
  const result: any = scoreInProgress()();
  expect(result.error).toBeUndefined();
  expect(getDifferentialTally()['shadow:applied']).toEqual({ compared: 1, deferred: 0 });
});

it('a wrong plan is a divergence, and the record is left as it was', () => {
  const enter = scoreInProgress();
  planted.fault = true;
  expect(enter).toThrow(
    /shadow-applied 4 ops: \/events\/0\/drawDefinitions\/0\/structures\/0\/matchUps\/\d+\/matchUpStatus/,
  );
  // an error changes nothing: the divergence restores the record v1 wrote into
  const first = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
  expect(first.matchUpStatus).not.toEqual(IN_PROGRESS);
});

it('the notices v1 publishes are the ones the plan implies, and a missing one is a divergence', () => {
  const enter = scoreInProgress();
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: () => undefined, [MODIFY_DRAW_DEFINITION]: () => undefined } });
  expect((enter() as any).error).toBeUndefined();
  expect(getDifferentialTally()['shadow:notices']).toEqual({ compared: 1, deferred: 0 });

  const again = scoreInProgress();
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: () => undefined } });
  planted.notice = true;
  expect(again).toThrow(/notices modifyMatchUp\|/);
});
