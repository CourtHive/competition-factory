import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * Shrink ONE census seed's schedule on a SPECIFIC defect. INERT unless `ISSUE` is set.
 *
 *   ISSUE=WINNER_NOT_ADVANCED SEED=9100555 SCHEDULES_IN=…/sched-w2.jsonl OUT=/tmp/shrunk.json \
 *     npx vitest run src/tests/mutations/exitPropagation/shrinkIssue.test.ts
 *
 * `sweep.ts`'s `shrink` keeps a candidate if it fails the same PROPERTY, and `DRAW_INCONSISTENCY` is
 * one property covering every issueType. On 2026-09-17 that drifted TWICE onto a pre-existing
 * two-step DOUBLE_ELIMINATION `DROPPED_PROGRESSION` — a reproduction of the wrong defect, which then
 * passed on the old code and looked like a failed falsification. This keeps a candidate only when
 * the FIRST inconsistency any step produces is the named issueType, checked after every step.
 *
 * `ISSUE=DECIDER_STALE` is a property rather than an issueType: a participant assigned in a
 * DOUBLE_ELIMINATION Decider who is not in the Main final. `getDrawInconsistencies` does not detect it.
 */
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
test.skipIf(!process.env.ISSUE)(
  'shrink by issueType',
  () => {
    const scenario = fs
      .readFileSync(process.env.SCHEDULES_IN as string, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .find((r: any) => r.seed === Number(process.env.SEED));
    const fails = (steps: Step[]) => {
      setSubscriptions({});
      const drawId = 'shrink-issue';
      prepareDraw(scenario.config, drawId);
      (globalThis as any).__seat = undefined;
      for (const step of steps) {
        const target = getDrawMatchUps(drawId).find((m: any) => key(m) === key(step));
        if (!target) continue;
        observeMutation({
          propagateExitStatus: scenario.config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        if (process.env.ISSUE === 'DE_FINAL_SEAT') {
          const seat = (m: any) => m?.sides?.find((x: any) => x.sideNumber === m.winningSide)?.participantId;
          const final = getDrawMatchUps(drawId).find((m: any) => m.structureName === 'Main' && m.roundNumber === 4);
          const now = seat(final);
          if ((globalThis as any).__seat && !now && final?.winningSide) return true;
          (globalThis as any).__seat = now;
          continue;
        }
        if (process.env.ISSUE === 'DECIDER_STALE') {
          const dd = getDrawDefinition(drawId);
          const decider = dd.structures.find((x: any) => x.structureName === 'Decider');
          const mainFinal = getDrawMatchUps(drawId).find(
            (m: any) =>
              m.structureName === 'Main' &&
              m.feedRound &&
              !getDrawMatchUps(drawId).some((n: any) => n.structureName === 'Main' && n.roundNumber > m.roundNumber),
          );
          const finalIds = (mainFinal?.sides ?? []).map((x: any) => x.participantId).filter(Boolean);
          if (
            (decider?.positionAssignments ?? []).some(
              (a: any) => a.participantId && !finalIds.includes(a.participantId),
            )
          )
            return true;
          continue;
        }
        const inc: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
        if ((inc?.inconsistencies ?? []).some((i: any) => i.issueType === process.env.ISSUE)) return true;
        if ((inc?.inconsistencies ?? []).length) return false; // a different defect first: not this one
      }
      return false;
    };
    let steps: Step[] = scenario.steps;
    expect(fails(steps)).toBe(true);
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < steps.length; i++) {
        const candidate = steps.filter((_, j) => j !== i);
        if (fails(candidate)) {
          steps = candidate;
          progress = true;
          break;
        }
      }
    }
    fs.writeFileSync(process.env.OUT as string, JSON.stringify({ config: scenario.config, steps }, null, 1));
  },
  600000,
);
