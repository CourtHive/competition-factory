import { generateSchedule, prepareDraw, randomConfig } from '@Tests/testHarness/exitPropagation/sweep';
import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import { isAnyExit } from '@Validators/isExit';
import { expect, it } from 'vitest';

// constants
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * **A matchUp holding a BYE stays a BYE when a withdrawal re-derives it** (CA, 2026-09-20 and
 * 2026-10-02: the BYE remains a BYE).
 *
 * Sweep seed 6161873 (COMPASS): a South first-round BYE matchUp held a carried exit's provenance on its
 * BYE side and another on the side its loser occupied. Clearing the West result that had sent that loser
 * withdrew their entry, and `withdrawFromMatchUp` re-derived the matchUp from the entry that remained: a
 * WALKOVER awarded to the now-empty side, beside the BYE. Nothing reported it in v1;
 * the v2 pipeline's held-exit invariant caught it under `OUTCOME_PIPELINE=differential`.
 *
 * `deriveExitStateFromProvenance` leaves a BYE to its caller, which has the structure; the withdrawal
 * now asks it. Every step of the schedule is checked: no matchUp ends a step labelled an exit beside a
 * BYE with nobody opposite.
 */
it('no withdrawal re-derives a BYE matchUp into an exit beside the BYE', () => {
  setSubscriptions({});
  const config = randomConfig(6161873);
  const drawId = 'bye-holder';
  expect(prepareDraw(config, drawId)).toEqual(true);
  const steps = generateSchedule(config, drawId, 30);
  expect(prepareDraw(config, drawId)).toEqual(true);

  const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
  const offences: string[] = [];
  let applied = 0;
  for (const [index, step] of steps.entries()) {
    const target = getDrawMatchUps(drawId).find((m: any) => key(m) === key(step));
    if (!target) continue;
    observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    applied += 1;
    for (const matchUp of getDrawMatchUps(drawId)) {
      const sides = matchUp.sides ?? [];
      const byeSide = sides.some((side: any) => side.bye);
      const nobodyOpposite = sides.filter((side: any) => side.participantId).length === 0;
      if (isAnyExit(matchUp.matchUpStatus) && byeSide && nobodyOpposite)
        offences.push(`step ${index + 1}: ${key(matchUp)} ${matchUp.matchUpStatus} beside a ${BYE}`);
    }
  }
  // the control: the schedule ran
  expect(applied).toBeGreaterThan(20);
  expect(offences).toEqual([]);
}, 180_000);
