import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * PR-B (outcome v2, 2026-11-13 L2 ruling §§2–4): under `doubleExitPropagateBye: false`, two first-round double walkovers
 * in COMPASS 16 (seed 9000230). The second converges in West, whose winner produces on into a matchUp linking its loser
 * (F3: the onward loser-seat BYE, `advanceByeToLoserMatchUp`); the convergence's loser seat holds a propagated BYE, which
 * gives way (`removeDirectedBye`, DEA:3076) and the link is served again (L2), its exit dispatched on the caller's
 * channel (F2). The reclaim reaches past the seat's matchUp: v1's round-1 loser cascade (`handleLoserMatchUpRemoval`,
 * positionClear.ts:1239) is handed no event, so it announces the matchUp it clears with none, and F3 announces it again
 * later in the call, with none either.
 *
 * Owned only with the reclaimed channel's certificate, the walk's event scope and F3 together; while the walk named every
 * visit its removal made, v2 named that matchUp's notice with the event (the subscribe-all differential's divergence).
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

const drawId = 'reclaimed-dispatch-convergence';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false, propagateExitStatus: true } };

afterEach(() => {
  setOutcomePipeline();
  setSubscriptions({ subscriptions: {} });
});

function play(mode: OutcomePipelineMode) {
  setOutcomePipeline(mode);
  setSubscriptions({ subscriptions: {} });
  const config = { participantsCount: 16, propagateExitStatus: true, drawSize: 16, drawType: COMPASS };
  expect(prepareDraw({ ...config, seed: 9000230 } as any, drawId, policyDefinitions)).toEqual(true);
  const first: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: find('East|1|1').matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(first.error).toBeUndefined();

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
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: find('East|1|2').matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(result.error).toBeUndefined();
  const draw = getDrawMatchUps(drawId)
    .map((m: any) =>
      JSON.stringify({
        matchUpId: m.matchUpId,
        matchUpStatus: m.matchUpStatus,
        winningSide: m.winningSide,
        drawPositions: m.drawPositions,
        sideExitProvenance: m.sideExitProvenance,
        score: m.score,
        matchUpStatusCodes: m.matchUpStatusCodes,
        sides: m.sides?.map((side: any) => [side.sideNumber, side.participantId, side.drawPosition, side.bye]),
      }),
    )
    .sort((a, b) => a.localeCompare(b));
  return { draw, notices: notices.toSorted((a, b) => a.localeCompare(b)), cascades: entries.cascades };
}

it('a convergence whose reclaim reaches past its seat is planned by v2 as v1 writes and announces it', () => {
  const v1 = play('v1');
  const v2 = play('v2');

  expect(v2.draw).toEqual(v1.draw);
  expect(v1.notices.length).toBeGreaterThan(0);
  // every notice v1 makes, with the event and the tournament each names
  expect(v2.notices).toEqual(v1.notices);
  // v1 cascades through `doubleExitAdvancement`; under v2 the call is planned and v1 never runs
  expect(v1.cascades).toBeGreaterThan(0);
  expect(v2.cascades).toEqual(0);
});
