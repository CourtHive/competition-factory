import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { scenarioPreparationFailure } from './replayTypes';
import type { ReplayResult } from './replayTypes';

export type StallScenario = {
  seed: number;
  config: any;
  steps?: any[];
  generationThrow?: string;
  policyDefinitions?: any;
};

type StallReplay = {
  allowChangePropagation?: boolean;
  scenario: StallScenario;
  catchThrows?: boolean;
  policyDefinitions?: any;
  drawId: string;
};

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

/**
 * THE STALLS AT A SCHEDULE'S END STATE, counted directly: every step is replayed and the finished draw is asked.
 *
 * The census reports only a seed's FIRST failing property, so a seed that fails something else earlier reads there as
 * "no stall". `STALLED_POSITION` is filtered by issue type, whatever its severity, so this holds before and after its
 * promotion to `error`. A step targets its coordinate, and only while that matchUp holds two participants — the
 * census's replay. A scenario's own `policyDefinitions` (a policy-arm schedule records the policy it was emitted under)
 * wins over the one passed. Returns the coordinate (`structureName|roundNumber|roundPosition`) of each stalled matchUp,
 * or `undefined` when the draw cannot be built.
 *
 * `catchThrows` is for the instrument: an exception is the census's to report, and the end state is still asked. The
 * ratchets leave it off, so a step that throws fails them.
 */
export function stallsAfterSchedule(params: StallReplay): string[] | undefined {
  const result = replayStalls(params);
  if (
    !params.catchThrows &&
    (result.replay.counts.thrown ||
      result.replay.findings.some((finding) => finding.property === 'ERROR_IMPLIES_NO_MUTATION'))
  )
    throw new Error(result.replay.findings[0]?.detail ?? 'stall replay mutation failed');
  return result.stalls;
}

/** Structured instrument result: failed builds and skipped work are never counted as completed draws. */
export function replayStalls(params: StallReplay): { stalls?: string[]; replay: ReplayResult } {
  const { allowChangePropagation, scenario, catchThrows, drawId } = params;
  const { config, steps } = scenario;
  setSubscriptions({});
  const result = replay(
    config,
    steps ?? [],
    drawId,
    scenario.policyDefinitions ?? params.policyDefinitions,
    undefined,
    {
      preparationFailure: scenarioPreparationFailure(scenario),
      relational: false,
      stopOnFailure: !catchThrows,
      allowChangePropagation: allowChangePropagation ?? false,
    },
  );
  if (result.verdict === 'build-failed') return { replay: result };

  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? [];
  const matchUps = getDrawMatchUps(drawId);
  const stalls = inconsistencies
    .filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION)
    .map((stall: any) => key(matchUps.find((matchUp: any) => matchUp.matchUpId === stall.matchUpId) ?? {}));
  return { stalls, replay: result };
}
