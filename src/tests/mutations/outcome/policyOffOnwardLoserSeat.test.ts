import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * PR-A (outcome v2, 2026-11-13 L2 ruling §1): under `doubleExitPropagateBye: false`, a double exit whose produced exit
 * converges in the next matchUp, the converged exit producing on into a matchUp that links its loser on. v1 places the
 * BYE on that onward matchUp's loser seat whatever the policy (`advanceByeToLoserMatchUp`, DEA:1050–1063); v2 used to
 * refuse it under the policy off (`producedConvergence.ts`'s onward target) and now plans it.
 *
 * Found by a seeded sweep (`randomConfig(103)`, FEED_IN_CHAMPIONSHIP 32/31, the policy off, 60 generated steps): the
 * sixth step is the first call v2 owns only with this change.
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

const drawId = 'policy-off-onward-loser-seat';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

const STEPS: [string, any][] = [
  ['Main|1|5', { winningSide: 2 }],
  ['Main|1|4', { winningSide: 1 }],
  ['Main|1|16', { winningSide: 1 }],
  ['Main|1|8', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|12', { winningSide: 2 }],
];

afterEach(() => {
  setOutcomePipeline();
  setSubscriptions({ subscriptions: {} });
});

function play(mode: OutcomePipelineMode) {
  setOutcomePipeline(mode);
  setSubscriptions({ subscriptions: {} });
  const config = { participantsCount: 31, propagateExitStatus: true, drawSize: 32, drawType: FEED_IN_CHAMPIONSHIP };
  expect(prepareDraw({ ...config, seed: 103 } as any, drawId, policyDefinitions)).toEqual(true);
  for (const [k, outcome] of STEPS)
    tournamentEngine.setMatchUpStatus({ matchUpId: find(k).matchUpId, propagateExitStatus: true, outcome, drawId });

  const notices: string[] = [];
  const record = (topic: string) => (payloads: any[]) =>
    notices.push(
      ...payloads.map((payload) =>
        JSON.stringify([
          topic,
          payload.matchUp?.matchUpId ?? payload.structureId,
          payload.eventId,
          payload.tournamentId,
        ]),
      ),
    );
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: record(MODIFY_MATCHUP),
      [MODIFY_POSITION_ASSIGNMENTS]: record(MODIFY_POSITION_ASSIGNMENTS),
    },
  });
  entries.cascades = 0;
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: find('Main|1|7').matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(result.error).toBeUndefined();
  const draw = getDrawMatchUps(drawId)
    .map(
      ({
        matchUpId,
        matchUpStatus,
        winningSide,
        drawPositions,
        sideExitProvenance,
        score,
        matchUpStatusCodes,
        sides,
      }) =>
        JSON.stringify({
          matchUpId,
          matchUpStatus,
          winningSide,
          drawPositions,
          sideExitProvenance,
          score,
          matchUpStatusCodes,
          sides: sides?.map((side: any) => [side.sideNumber, side.participantId, side.drawPosition, side.bye]),
        }),
    )
    .sort((a, b) => a.localeCompare(b));
  return { draw, notices: notices.toSorted((a, b) => a.localeCompare(b)), cascades: entries.cascades };
}

it('a policy-off produced convergence places its onward loser-seat BYE as v1 does, planned by v2', () => {
  const v1 = play('v1');
  const v2 = play('v2');

  expect(v2.draw).toEqual(v1.draw);
  expect(v1.notices.length).toBeGreaterThan(0);
  expect(v2.notices).toEqual(v1.notices);
  // v1 cascades through `doubleExitAdvancement`; under v2 the call is planned and v1 never runs
  expect(v1.cascades).toBeGreaterThan(0);
  expect(v2.cascades).toEqual(0);
});
