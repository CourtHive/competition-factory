import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, vi } from 'vitest';

// constants and types
import {
  COMPASS,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * 1b (outcome v2 loser-seat transition): under `doubleExitPropagateBye: false` a double exit whose loser seat meets the
 * pending exit an earlier double exit produced there converges it (v1's `handleEmptyExitLoser`), produces on from it
 * (`advanceConvergedWinner`, its own advanced position taken back first), and meets the pending exit its winner target
 * holds. Where a converged matchUp links its loser on, v2 serves that link as v1 does (L2).
 */

const entries = vi.hoisted(() => ({ sources: [] as string[] }));

vi.mock('@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doubleExitAdvancement: (args: any) => {
      entries.sources.push(args.targetData?.matchUp?.matchUpId);
      return actual.doubleExitAdvancement(args);
    },
  };
});

const drawId = 'pending-exit-convergence';

function scoreTwo(
  mode: OutcomePipelineMode,
  drawType: string,
  structureName: string,
  first: string[],
  second: string[],
  participantsCount = 8,
) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize: 8, participantsCount, drawId }],
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
    nonRandom: 9000230,
  });
  // a tournament loaded beside the draw, held live: a call stamps it only where a notice names no tournament
  const { tournamentRecord: bystander } = mocksEngine.generateTournamentRecord({ nonRandom: 9000231 });
  tournamentEngine.setState([tournamentRecord, bystander], false);
  tournamentEngine.setTournamentId(tournamentRecord.tournamentId);
  setOutcomePipeline(mode);
  const stamped: boolean[] = [];
  const all = () => tournamentEngine.allTournamentMatchUps({ inContext: false }).matchUps ?? [];
  const find = ([roundPosition]: string[]) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps?.find(
        (m) => m.structureName === structureName && m.roundNumber === 1 && m.roundPosition === Number(roundPosition),
      )?.matchUpId;
  const results = [first, second].map((step) => {
    entries.sources = [];
    delete bystander.factory;
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: step[1] },
      matchUpId: find(step),
      drawId,
    });
    stamped.push(!!bystander.factory);
    return { success: !!result.success, cascaded: entries.sources.length };
  });
  const draw = all()
    .map(({ matchUpId, matchUpStatus, winningSide, drawPositions, sideExitProvenance, score, matchUpStatusCodes }) =>
      JSON.stringify({
        matchUpId,
        matchUpStatus,
        winningSide,
        drawPositions,
        sideExitProvenance,
        score,
        matchUpStatusCodes,
      }),
    )
    .sort();
  return { results, draw, stamped };
}

const flavours = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((a) => [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((b) => [a, b]));
const orders = [
  ['1', '2'],
  ['2', '1'],
];
const cases = flavours.flatMap(([a, b]) => orders.map(([p, q]) => ({ first: [p, a], second: [q, b] })));

it.each(cases)('v2 converges the pending exit and produces on from it: $first then $second', ({ first, second }) => {
  const v1 = scoreTwo('v1', FIRST_ROUND_LOSER_CONSOLATION, 'Main', first, second);
  const v2 = scoreTwo('v2', FIRST_ROUND_LOSER_CONSOLATION, 'Main', first, second);
  const differential = scoreTwo('differential', FIRST_ROUND_LOSER_CONSOLATION, 'Main', first, second);
  expect(v1.results.every((result) => result.success)).toBe(true);
  // the second double exit is planned by v2: v1's cascade is never entered
  expect(v2.results[1]).toEqual({ success: true, cascaded: 0 });
  expect(v1.results[1].cascaded).toBeGreaterThan(0);
  expect(v2.draw).toEqual(v1.draw);
  expect(differential.draw).toEqual(v1.draw);
  expect(v2.stamped).toEqual(v1.stamped);
});

// L2: the converged loser matchUp's own loser link (`serveConvergedLoserLink`: the propagated BYE reclaimed, the exit
// produced there) and the landing's, served at its re-entry (`reclaimSingleExitBye`, then `handleLoserMatchUp`)
it.each(cases)("v2 serves the converged landings' loser links: COMPASS $first then $second", ({ first, second }) => {
  const v1 = scoreTwo('v1', COMPASS, 'East', first, second);
  const v2 = scoreTwo('v2', COMPASS, 'East', first, second);
  const differential = scoreTwo('differential', COMPASS, 'East', first, second);
  expect(v1.results.every((result) => result.success)).toBe(true);
  expect(v2.results[1]).toEqual({ success: true, cascaded: 0 });
  expect(v1.results[1].cascaded).toBeGreaterThan(0);
  expect(v2.draw).toEqual(v1.draw);
  expect(differential.draw).toEqual(v1.draw);
  // the reclaim names the tournament as v1's removal does, so the record beside it is left unstamped
  expect(v1.stamped[1]).toBe(false);
  expect(v2.stamped).toEqual(v1.stamped);
});

// 1c: the converged winner's held carry. Under FIRST_MATCH_LOSER_CONSOLATION 8/7 the consolation's feed round holds a BYE
// on its fed seat, so the converged matchUp's produced exit passes it (`advanceConvergedWinner` onto a BYE-held target,
// then `advanceByeAdvancedDrawPosition`), as a call's own double exit passes a BYE-held matchUp (`byeHeldProduced`)
const heldCases = flavours.flatMap(([a, b]) =>
  [
    ['3', '4'],
    ['4', '3'],
  ].map(([p, q]) => ({ first: [p, a], second: [q, b] })),
);
it.each(heldCases)('v2 carries the converged exit past the held BYE: $first then $second', ({ first, second }) => {
  // subscribed, so the differential compares the notices too (a notice's event and tournament)
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: () => undefined } });
  const v1 = scoreTwo('v1', FIRST_MATCH_LOSER_CONSOLATION, 'Main', first, second, 7);
  const v2 = scoreTwo('v2', FIRST_MATCH_LOSER_CONSOLATION, 'Main', first, second, 7);
  const differential = scoreTwo('differential', FIRST_MATCH_LOSER_CONSOLATION, 'Main', first, second, 7);
  expect(v1.results.every((result) => result.success)).toBe(true);
  expect(v2.results[1]).toEqual({ success: true, cascaded: 0 });
  expect(v1.results[1].cascaded).toBeGreaterThan(0);
  expect(v2.draw).toEqual(v1.draw);
  expect(differential.draw).toEqual(v1.draw);
  expect(v2.stamped).toEqual(v1.stamped);
});
