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
 * partially written, or rolled back?"; CA, 2026-10-18: "In setMatchUpStatus there should be nothing changed if an
 * error is returned"). Stated in outcome-pipeline.md § 7.1.
 *
 * Under `differential`, v2 plans and never writes. v1 runs and writes, and only then does `compare` throw
 * `OutcomePipelineDivergence`. Before it throws, `compare` writes back what the call touched (the tournament, the
 * draw and the event, captured before v1 ran) and the notice buffer. So a divergence changes nothing, on every path:
 *
 *   - with or without `rollbackOnError`, directly or inside `executionQueue`, the record is as it was;
 *   - nothing is notified;
 *   - under devContext the divergence is rethrown, over the same unchanged record.
 *
 * A divergence is forced here by stubbing `compareDecisions`, so each case asserts the handling of a real
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
const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);

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

describe('differential: a divergence changes nothing', () => {
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

    for (const rollbackOnError of [true, false]) {
      it(`${via}, rollbackOnError ${rollbackOnError}: the record is unchanged and nothing is notified`, () => {
        const { drawId, matchUpId, outcome } = setup();
        const before = recordNow();
        const modified = watchModified();
        force.diverge = true;
        const result: any = call({ drawId, matchUpId, outcome }, rollbackOnError);
        force.diverge = false;
        expect(result.error).toMatch(DIVERGENCE);
        expect(winnerOf(matchUpId)).toBeUndefined();
        expect(recordNow()).toEqual(before);
        expect(modified).toEqual([]);
      });
    }
  }

  for (const rollbackOnError of [true, false]) {
    it(`devContext, rollbackOnError ${rollbackOnError}: the divergence is rethrown over an unchanged record`, () => {
      const { drawId, matchUpId, outcome } = setup();
      const before = recordNow();
      setDevContext(true);
      force.diverge = true;
      expect(() => tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, rollbackOnError })).toThrow(
        DIVERGENCE,
      );
      force.diverge = false;
      setDevContext(false);
      expect(winnerOf(matchUpId)).toBeUndefined();
      expect(recordNow()).toEqual(before);
    });
  }

  it('a provider without the optional setMutationStatus: the flag is cleared, so the record is still not stamped', () => {
    const { drawId, matchUpId, outcome } = setup();
    const before = recordNow();
    setStateProvider({ ...syncGlobalState, setMutationStatus: undefined });
    try {
      force.diverge = true;
      const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
      force.diverge = false;
      expect(result.error).toMatch(DIVERGENCE);
    } finally {
      setStateProvider(syncGlobalState);
    }
    expect(recordNow()).toEqual(before);
  });

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
          expect(matchUp?.winningSide).toBeUndefined();
        });
      }
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
