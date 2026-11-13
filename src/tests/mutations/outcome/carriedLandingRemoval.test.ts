import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * 2c-1 (outcome v2, 2026-11-13 2c ruling): under `doubleExitPropagateBye: false`, a carried exit converges (RULE 4) at a
 * landing that links its loser on. COMPASS 16/13, seed 20512801: `East|2|1`'s walkover carries its loser into
 * `North|1|1` (awarded to the empty side) and on into `Northwest|1|1`; `East|2|2`'s walkover then carries into
 * `North|1|1`'s other side. v1 removes the landing's directed participants (`removeDirectedParticipants`: the score
 * reset, the exit the landing produced withdrawn, the first carrier's seat cleared with no notice), then serves the
 * landing's loser link on the reread targets (`handleLoserMatchUp`), and merges the arriving provenance last.
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

const drawId = 'carried-landing-removal';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

afterEach(() => {
  setOutcomePipeline();
  setSubscriptions({ subscriptions: {} });
});

function score(matchUpId: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({ propagateExitStatus: true, matchUpId, outcome, drawId });
  expect(result.error).toBeUndefined();
}

type Step = [string, any];
type Scenario = { config: any; setup: () => void; measured: Step };

/** COMPASS 16/13: every contested `East|1|x` won by side 1, then `East|2|1`'s walkover carries its loser on twice */
const SERVED: Scenario = {
  config: { participantsCount: 13, propagateExitStatus: true, drawSize: 16, drawType: COMPASS, seed: 20512801 },
  setup: () => {
    const firstRound = getDrawMatchUps(drawId).filter(
      (m: any) =>
        m.structureName === 'East' && m.roundNumber === 1 && m.sides?.every((side: any) => side.participantId),
    );
    for (const matchUp of firstRound) score(matchUp.matchUpId, { winningSide: 1 });
    score(find('East|2|1').matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 });
  },
  measured: ['East|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
};

/**
 * COMPASS 32/31 (seed 20551581, `anExitThatDeliveredNobodyIsNoOrigin` entered last to first): `East|1|16`'s DEFAULTED
 * carries its loser into West and on; `East|1|15`'s then converges at that landing, whose first carrier was placed past
 * the loser matchUp, in a further structure, where `removeDirectedLoser` releases them (rows 5a–5e), which the removal
 * does not model: the call stays v1's. Every call the suite brings to that certificate (13) is refused by the loser
 * link's dispatch too (the seat still held), so the certificate is the second guard on each, not the only one
 */
const ONWARD: Scenario = {
  config: { participantsCount: 31, propagateExitStatus: true, drawSize: 32, drawType: COMPASS, seed: 20551581 },
  setup: () => score(find('East|1|16').matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }),
  measured: ['East|1|15', { matchUpStatus: DEFAULTED, winningSide: 1 }],
};

function play(mode: OutcomePipelineMode, { config, setup, measured }: Scenario) {
  setOutcomePipeline(mode);
  setSubscriptions({ subscriptions: {} });
  expect(prepareDraw(config, drawId, policyDefinitions)).toEqual(true);
  setup();

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
  score(find(measured[0]).matchUpId, measured[1]);
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
        // v1 stamps a result `setMatchUpState` writes (`applyScoredTime`); the value is the clock's, its presence is not
        scored: !!m.schedule?.scoredTime,
        sides: m.sides?.map((side: any) => [side.sideNumber, side.participantId, side.drawPosition, side.bye]),
      }),
    )
    .sort((a, b) => a.localeCompare(b));
  return { draw, notices: notices.toSorted((a, b) => a.localeCompare(b)), cascades: entries.cascades };
}

it('a carried exit converging at a landing that links its loser on is planned by v2 as v1 removes and serves it', () => {
  const v1 = play('v1', SERVED);
  const v2 = play('v2', SERVED);

  expect(v2.draw).toEqual(v1.draw);
  expect(v1.notices.length).toBeGreaterThan(0);
  // every notice v1 makes, with the event and the tournament each names; the carrier's cleared seat announces nothing
  expect(v2.notices).toEqual(v1.notices);
  // v1 cascades through `doubleExitAdvancement`; under v2 the call is planned and v1 never runs
  expect(v1.cascades).toBeGreaterThan(0);
  expect(v2.cascades).toEqual(0);
});

it('a landing whose first carrier went on past its loser matchUp is not removed by v2: the call stays v1s', () => {
  const v1 = play('v1', ONWARD);
  const v2 = play('v2', ONWARD);

  expect(v2.draw).toEqual(v1.draw);
  expect(v2.notices).toEqual(v1.notices);
  // refused (the removal's certificate: the carrier placed past the loser matchUp), so v1's cascade runs under v2 too
  expect(v1.cascades).toBeGreaterThan(0);
  expect(v2.cascades).toEqual(v1.cascades);
});
