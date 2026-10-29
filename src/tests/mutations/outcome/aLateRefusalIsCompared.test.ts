import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { MUTATION_LOCKED } from '@Constants/errorConditionConstants';

/**
 * A REFUSAL AFTER THE SETTLE PASSES IS COMPARED (outcome v2 executor plan § 5, Phase C prerequisite 3).
 *
 * `setMatchUpStatus` refuses at six points after its write. The first three (exit propagation, the write itself,
 * `settleExitOrigins`) handed the refusal to `v2.compare`; the three after them (`settleDraw`,
 * `settleForwardConsequences`, and the carry past a BYE the forward settle placed) became refusals on 2026-10-18
 * (#5606) and returned without it, so under `differential` a refusal there was never set against v2's plan.
 *
 * Each case plants a refusal at one site, on a first-round score v2 plans as a success. An unlisted code is a
 * divergence; a code in `APPLY_STAGE_CODES` is tallied as a deferred refusal. On a divergence, `differential`'s
 * comparison writes back the record it captured before v1 ran: a clean-up of the comparison harness, not a rollback,
 * and nothing v2 relies on, since v2 decides every refusal before its first op.
 *
 * Under `v1` the call is refused as before, and the write it came after stays. That is why no step here may fail
 * (outcome-pipeline.md § 6, "A settle step has no failure to report"), and a divergence here is a finding against it.
 */
type Site = 'settleDraw' | 'forward' | 'carryAfterForward';
const planted = vi.hoisted(() => ({ site: undefined as string | undefined, code: 'ERR_PLANTED', forwardRan: false }));
const plantedError = () => ({ error: { code: planted.code, message: 'planted' } });

vi.mock('@Mutate/matchUps/matchUpStatus/reconcileDecider', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    reconcileDeciders: (args: any) => (planted.site === 'settleDraw' ? plantedError() : actual.reconcileDeciders(args)),
  };
});

vi.mock('@Mutate/matchUps/matchUpStatus/settleForwardConsequences', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    settleForwardConsequences: (args: any) => {
      if (planted.site === 'forward') return plantedError();
      const result = actual.settleForwardConsequences(args);
      if (planted.site !== 'carryAfterForward') return result;
      planted.forwardRan = true;
      return { ...result, settled: true }; // so the carry past a late BYE is asked again
    },
  };
});

vi.mock('@Mutate/matchUps/matchUpStatus/reconcileCarriesPastByes', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // only the ask after the forward settle: `settleDraw` asks it first
    reconcileCarriesPastByes: (args: any) =>
      planted.site === 'carryAfterForward' && planted.forwardRan
        ? plantedError()
        : actual.reconcileCarriesPastByes(args),
  };
});

afterEach(() => {
  Object.assign(planted, { site: undefined, code: 'ERR_PLANTED', forwardRan: false });
  setSubscriptions({});
});

function scoreFirstRound(pipeline: OutcomePipelineMode) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
  const first = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  setOutcomePipeline(pipeline);
  resetDifferentialTally();
  return {
    matchUpId: first.matchUpId,
    enter: () => tournamentEngine.setMatchUpStatus({ ...first, outcome, drawId: 'd' }),
  };
}

const winningSideOf = (matchUpId: string) =>
  tournamentEngine.findMatchUp({ drawId: 'd', matchUpId }).matchUp.winningSide;

describe.each<Site>(['settleDraw', 'forward', 'carryAfterForward'])('a refusal planted at %s', (site) => {
  it('is refused under v1, over the write it came after', () => {
    const { matchUpId, enter } = scoreFirstRound(OUTCOME_PIPELINE_V1);
    planted.site = site;
    const result: any = enter();
    expect(result.error?.code).toEqual('ERR_PLANTED');
    // why outcome-pipeline.md § 6 requires a settle step to be unable to fail: there is no rollback
    expect(winningSideOf(matchUpId)).toEqual(1);
  });

  it('is a divergence under differential: v2 planned the success, v1 refused it', () => {
    const { matchUpId, enter } = scoreFirstRound(OUTCOME_PIPELINE_DIFFERENTIAL);
    planted.site = site;
    expect(enter).toThrow(/v1 ERR_PLANTED, v2 ok/);
    expect(winningSideOf(matchUpId)).toBeUndefined();
  });

  it('is a deferred refusal under differential when its code is an apply-stage code', () => {
    const { enter } = scoreFirstRound(OUTCOME_PIPELINE_DIFFERENTIAL);
    Object.assign(planted, { site, code: MUTATION_LOCKED.code });
    expect((enter() as any).error?.code).toEqual(MUTATION_LOCKED.code);
    expect(getDifferentialTally().refusal).toEqual({ compared: 0, deferred: 1 });
  });
});
