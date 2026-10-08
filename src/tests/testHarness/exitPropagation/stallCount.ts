import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';

export type StallScenario = { seed: number; config: any; steps: any[]; policyDefinitions?: any };

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
  const { allowChangePropagation, scenario, catchThrows, drawId } = params;
  const { config, steps } = scenario;
  setSubscriptions({});
  if (!prepareDraw(config, drawId, scenario.policyDefinitions ?? params.policyDefinitions)) return undefined;

  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === key(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    const setStatus = () =>
      tournamentEngine.setMatchUpStatus({
        ...(allowChangePropagation ? { allowChangePropagation: true } : {}),
        propagateExitStatus: config.propagateExitStatus,
        matchUpId: target.matchUpId,
        outcome: step.outcome,
        drawId,
      });
    if (!catchThrows) {
      setStatus();
      continue;
    }
    try {
      setStatus();
    } catch {
      // the census reports the exception; the end state is still asked
    }
  }

  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? [];
  const matchUps = getDrawMatchUps(drawId);
  return inconsistencies
    .filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION)
    .map((stall: any) => key(matchUps.find((matchUp: any) => matchUp.matchUpId === stall.matchUpId) ?? {}));
}
