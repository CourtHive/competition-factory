import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { SINGLES_MATCHUP, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

/**
 * A REFUSED CALL TAKES NO HYDRATION (outcome v2 executor plan § 3.1.1 and § 3.6, CA 2026-10-24: "even when hydration is
 * required for the subscriptions/notifications, it should happen AFTER the mutation succeeds so that it NEVER happens
 * when an ERROR is being returned"). Under `v2` the view decides on the structural index, so a refusal the draw decides
 * is returned having asked for no in-context matchUp at all. Counted on the hydration exports, as the cost curve counts.
 */
const hydrations = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Query/matchUps/drawMatchUps', async (importOriginal) => {
  const actual: any = await importOriginal();
  const counted =
    (original: (...args: any[]) => any) =>
    (...args: any[]) => {
      if (args[0]?.inContext || args[0]?.nextMatchUps) hydrations.count += 1;
      return original(...args);
    };
  return {
    ...actual,
    getAllDrawMatchUps: counted(actual.getAllDrawMatchUps),
    getDrawMatchUps: counted(actual.getDrawMatchUps),
  };
});

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({});
});

/** a round-2 matchUp with nobody in it, given a winner: refused because the draw says it has no participants */
function refusedCall(mode: OutcomePipelineMode, drawProfile: Record<string, unknown> = { drawSize: 8 }) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
  const { matchUpId } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundNumbers: [2], matchUpTypes: [SINGLES_MATCHUP, TEAM_MATCHUP] },
  }).matchUps[0];
  setOutcomePipeline(mode);
  hydrations.count = 0;
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
    matchUpId,
    drawId,
  });
  return { result, hydrations: hydrations.count };
}

it('under v2, a refusal the draw decides is returned with no hydration', () => {
  const v2 = refusedCall(OUTCOME_PIPELINE_V2);
  expect(v2.result.error).toBeDefined();
  expect(v2.hydrations).toEqual(0);
});

it('CONTROL: the counter counts. v1 refuses the same call, and hydrates to do it', () => {
  const v1 = refusedCall(OUTCOME_PIPELINE_V1);
  const v2 = refusedCall(OUTCOME_PIPELINE_V2);
  expect(v1.result.error?.code).toEqual(v2.result.error?.code);
  expect(v1.hydrations).toBeGreaterThan(0);
});

it('a TEAM draw, which the index does not cover yet, still hydrates its view: the known exception', () => {
  const team = refusedCall(OUTCOME_PIPELINE_V2, { drawSize: 4, eventType: TEAM_EVENT });
  expect(team.result.error).toBeDefined();
  expect(team.hydrations).toBeGreaterThan(0);
});
