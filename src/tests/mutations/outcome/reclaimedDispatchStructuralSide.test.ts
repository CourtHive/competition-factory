import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * PR-B refusal (outcome v2, 2026-11-13 L2 ruling §2): a reclaimed loser link whose stale channel reads otherwise than the
 * cursor, and whose loser matchUp gives the walkover's side only through its sides (no feed round, and no structural side
 * for the loser target position once its sides are set aside). v1 resolves that side on the stale channel (DEA:522–530);
 * v2 cannot read it there, so the call stays v1's (OLYMPIC 32 under `doubleExitPropagateBye: false`, seed 21036479:
 * `East|1|10` then `East|1|9`, both double walkovers, from `aByeAdvanceIsAskedOfTheMatchUpAsItStands`'s first order).
 * Of the reclaimed channel's refusals, this is the only one the suite, the double-exit sweep and the TEAM arms reach.
 */

const entries = vi.hoisted(() => ({ cascades: 0 }));

vi.mock('@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doubleExitAdvancement: (args: any) => {
      entries.cascades += 1;
      return actual.doubleExitAdvancement(args);
    },
  };
});

type Step = [string, any];
const drawId = 'reclaimed-dispatch-structural-side';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const CONFIG = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 21036479 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
// the converged double walkover, then the one whose reclaimed loser link is refused
const FIRST: Step = ['East|1|10', { matchUpStatus: DOUBLE_WALKOVER }];
const MEASURED: Step = ['East|1|9', { matchUpStatus: DOUBLE_WALKOVER }];

afterEach(() => {
  setOutcomePipeline();
  setSubscriptions({ subscriptions: {} });
});

function apply([k, outcome]: Step) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(k).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  expect(result.error).toBeUndefined();
}

function play(mode: OutcomePipelineMode) {
  setOutcomePipeline(mode);
  setSubscriptions({ subscriptions: {} });
  expect(prepareDraw(CONFIG as any, drawId, POLICY)).toEqual(true);
  apply(FIRST);
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (payloads: any[]) =>
        notices.push(...payloads.map((p) => JSON.stringify([p.matchUp?.matchUpId, p.eventId, p.tournamentId]))),
    },
  });
  entries.cascades = 0;
  apply(MEASURED);
  const draw = getDrawMatchUps(drawId)
    .map((m: any) =>
      JSON.stringify([m.matchUpId, m.matchUpStatus, m.winningSide, m.drawPositions, m.sideExitProvenance]),
    )
    .sort((a, b) => a.localeCompare(b));
  return { draw, notices: notices.toSorted((a, b) => a.localeCompare(b)), cascades: entries.cascades };
}

it('a reclaimed loser link whose walkover side reads only on the stale channel stays v1s', () => {
  const v1 = play('v1');
  const v2 = play('v2');
  expect(v2.draw).toEqual(v1.draw);
  expect(v2.notices).toEqual(v1.notices);
  // v2 refuses the call, so v1's cascade runs under v2 too
  expect(v1.cascades).toBeGreaterThan(0);
  expect(v2.cascades).toEqual(v1.cascades);
});
