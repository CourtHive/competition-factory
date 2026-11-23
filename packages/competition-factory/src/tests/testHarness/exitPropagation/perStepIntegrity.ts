import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { scenarioPreparationFailure } from './replayTypes';
import { getDrawDefinition } from './transitions';
import { replay } from './sweep';

// constants and types
import type { Inconsistency } from '@Query/integrity/inconsistency';
import type { ScenarioConfig, Step } from './sweep';
import type { ReplayResult } from './replayTypes';

export type IntegrityStep = { index: number; step: Step; inconsistencies: Inconsistency[] };

const inconsistenciesNow = (drawId: string): Inconsistency[] => {
  const result = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  return result.valid === false ? (result.inconsistencies ?? []) : [];
};

/** Uses the census's policy-aware executor, but inspects every completed step and never runs probes. */
export function replayPerStepIntegrity({
  config,
  steps,
  drawId,
  policyDefinitions,
  onFinding,
  generationThrow,
}: {
  config: ScenarioConfig;
  steps?: Step[];
  generationThrow?: string;
  drawId: string;
  policyDefinitions?: any;
  onFinding?: (step: IntegrityStep) => void;
}): { replay: ReplayResult; perStep: IntegrityStep[]; finalInconsistencies: Inconsistency[] } {
  const perStep: IntegrityStep[] = [];
  const result = replay(config, steps ?? [], drawId, policyDefinitions, undefined, {
    preparationFailure: scenarioPreparationFailure({ steps, generationThrow }),
    relational: false,
    stopOnFailure: false,
    onStep: ({ index, step, observation }) => {
      if (!observation) return;
      const inconsistencies = inconsistenciesNow(drawId);
      if (!inconsistencies.length) return;
      const finding = { index, step, inconsistencies };
      perStep.push(finding);
      onFinding?.(finding);
    },
  });
  if (perStep.length) {
    if (result.verdict === 'clean') result.verdict = 'failed';
    result.findings.push({
      property: 'PER_STEP_DRAW_INCONSISTENCY',
      matchUpId: '-',
      detail: JSON.stringify({ step: perStep[0].index + 1, inconsistencies: perStep[0].inconsistencies }),
    });
  }
  return {
    replay: result,
    perStep,
    finalInconsistencies: result.verdict === 'build-failed' ? [] : inconsistenciesNow(drawId),
  };
}
