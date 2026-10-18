import { setDevContext, setOutcomePipeline, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import syncGlobalState from '@Global/state/syncGlobalState';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';
import asyncEngine from '@Engines/asyncEngine';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * WHAT A DIVERGENCE LEAVES BEHIND (CA, 2026-10-15: "after a divergence throws, is the record left with v1's writes,
 * partially written, or rolled back?"). Stated in outcome-pipeline.md § 7.1.
 *
 * Under `differential`, v2 plans and never writes. v1 runs and writes, and only then does `compare` throw
 * `OutcomePipelineDivergence`, either after v1's complete write (the final compare) or on one of v1's refusal paths,
 * where a refusal changes nothing. So a divergence is never half-written by the pipeline: the record holds v1's
 * complete result or nothing. From there the divergence is an ordinary throw, under the engine contract every thrown
 * method has (asyncWrapperContract.test.ts, item 5):
 *
 *   - with `rollbackOnError`, the record is restored;
 *   - without it, v1's write stays; the result is an error and nothing is notified;
 *   - under devContext the divergence is rethrown, after the same restore.
 *
 * A divergence is forced here by stubbing `compareDecisions`, so each case asserts the engine's handling of a real
 * `OutcomePipelineDivergence` thrown from its real call site, after v1's real write.
 */

const force = vi.hoisted(() => ({ diverge: false }));
vi.mock('@Mutate/matchUps/outcome/differential', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    compareDecisions: (...args: any[]) =>
      force.diverge ? { agree: false, v1: 'ok', v2: 'forced' } : original.compareDecisions(...args),
  };
});

afterEach(() => {
  force.diverge = false;
  setDevContext(false);
  setSubscriptions({});
});

function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
  tournamentEngine.setState(tournamentRecord);
  const { matchUpId } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps[0];
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  return { tournamentRecord, drawId, matchUpId, outcome };
}

const winnerOf = (matchUpId: string) =>
  tournamentEngine.findMatchUp({ matchUpId, inContext: false }).matchUp?.winningSide;

function watchModified() {
  const modified: string[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (notices: any[]) => notices.forEach((notice) => modified.push(notice.matchUp?.matchUpId)),
    },
  });
  return modified;
}

const DIVERGENCE = /^outcome pipeline divergence on .*: v1 ok, v2 forced$/;

describe('differential: a divergence is an ordinary throw, after v1 has written', () => {
  useEngineCatch();

  it('positive control: the same call without a divergence writes and notifies', () => {
    const { drawId, matchUpId, outcome } = setup();
    const modified = watchModified();
    const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
    expect(result.success).toEqual(true);
    expect(winnerOf(matchUpId)).toEqual(1);
    expect(modified).toContain(matchUpId);
  });

  for (const via of ['direct', 'executionQueue'] as const) {
    const call = (params: any, rollbackOnError: boolean) =>
      via === 'direct'
        ? tournamentEngine.setMatchUpStatus({ ...params, rollbackOnError })
        : tournamentEngine.executionQueue([{ method: 'setMatchUpStatus', params }], rollbackOnError);

    it(`${via}, with rollbackOnError: the record is restored and nothing is notified`, () => {
      const { drawId, matchUpId, outcome } = setup();
      const modified = watchModified();
      force.diverge = true;
      const result: any = call({ drawId, matchUpId, outcome }, true);
      force.diverge = false;
      expect(result.error).toMatch(DIVERGENCE);
      expect(winnerOf(matchUpId)).toBeUndefined();
      expect(modified).toEqual([]);
    });

    it(`${via}, without rollbackOnError: v1's write stays, the result is an error, nothing is notified`, () => {
      const { drawId, matchUpId, outcome } = setup();
      const modified = watchModified();
      force.diverge = true;
      const result: any = call({ drawId, matchUpId, outcome }, false);
      force.diverge = false;
      expect(result.error).toMatch(DIVERGENCE);
      expect(winnerOf(matchUpId)).toEqual(1);
      expect(modified).toEqual([]);
    });
  }

  for (const rollbackOnError of [true, false]) {
    it(`devContext, rollbackOnError ${rollbackOnError}: the divergence is rethrown, restored only when asked`, () => {
      const { drawId, matchUpId, outcome } = setup();
      setDevContext(true);
      force.diverge = true;
      expect(() => tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, rollbackOnError })).toThrow(
        DIVERGENCE,
      );
      force.diverge = false;
      setDevContext(false);
      expect(winnerOf(matchUpId)).toEqual(rollbackOnError ? undefined : 1);
    });
  }

  it('async engine: the same, per request context', async () => {
    const { tournamentRecord, drawId, matchUpId, outcome } = setup();
    setStateProvider(asyncGlobalState);
    try {
      asyncEngine.importMethods(governors);
      for (const rollbackOnError of [true, false]) {
        await asyncGlobalState.runWithInstanceState(async () => {
          await asyncEngine.setState(structuredClone(tournamentRecord));
          setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
          force.diverge = true;
          const result: any = await asyncEngine.setMatchUpStatus({ drawId, matchUpId, outcome, rollbackOnError });
          force.diverge = false;
          expect(result.error).toMatch(DIVERGENCE);
          const { matchUp } = await asyncEngine.findMatchUp({ matchUpId, inContext: false });
          expect(matchUp?.winningSide).toEqual(rollbackOnError ? undefined : 1);
        });
      }
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
