import { settleUnlessIdle, takePrecheckDivergences } from '@Mutate/matchUps/matchUpStatus/indexPrecheck';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * A SETTLE PASS ASKS ITS DETECTOR OF THE STRUCTURAL INDEX BEFORE IT HYDRATES (`indexPrecheck.ts`; the v1 win, executor
 * plan § 3.1.1). Skipped only where the index answers and finds no work; held to a hydration in `differential`, where
 * a disagreement is a divergence raised at compare, with the call restored.
 */
const plant = vi.hoisted(() => ({ onTake: 0, takes: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/indexPrecheck', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // the take numbered `onTake` returns a planted disagreement: in one differential call the first take is the call's
    // start (which clears) and the second its compare
    takePrecheckDivergences: () => {
      const taken = actual.takePrecheckDivergences();
      plant.takes += 1;
      if (plant.takes !== plant.onTake) return taken;
      return [{ site: 'reconcileByeAdvancements', index: 'null', hydrated: '{"matchUpId":"m"}' }, ...taken];
    },
  };
});

afterEach(() => {
  plant.onTake = 0;
  plant.takes = 0;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  takePrecheckDivergences();
});

function draw(drawProfile: Record<string, unknown> = { drawSize: 8 }) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
  return { drawDefinition: tournamentRecord.events[0].drawDefinitions[0], drawId };
}

describe('settleUnlessIdle', () => {
  const settle = (drawDefinition: any, detect: (matchUps: any[]) => unknown, run = vi.fn(() => 'ran')) => ({
    result: settleUnlessIdle({ drawDefinition, site: 's', detect, run, idle: 'idle' }),
    run,
  });

  it('returns idle without running the pass where the index finds no work; runs it where it finds work', () => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1); // pinned: the suite may run under OUTCOME_PIPELINE=differential
    const { drawDefinition } = draw();
    for (const nothing of [undefined, []]) {
      const { result, run } = settle(drawDefinition, () => nothing);
      expect(result).toEqual('idle');
      expect(run).not.toHaveBeenCalled();
    }
    for (const work of [{ matchUpId: 'm' }, ['m']]) {
      const { result, run } = settle(drawDefinition, () => work);
      expect(result).toEqual('ran');
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  // S7: the index covers a TEAM draw (a dual, its lines nested and listed), so its passes idle on it too
  it('asks the index of a TEAM draw too: idle where the detector finds nothing, its lines among what it reads', () => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    const { drawDefinition } = draw({ drawSize: 4, eventType: TEAM_EVENT });
    const detect = vi.fn<(matchUps: any[]) => undefined>(() => undefined);
    const { result } = settle(drawDefinition, detect);
    expect(result).toEqual('idle');
    expect(detect).toHaveBeenCalledTimes(1);
    const read = detect.mock.calls[0][0];
    // CONTROL: the duals and their lines were indexed, not an empty array
    expect(read.filter((matchUp: any) => matchUp.tieMatchUps).length).toEqual(3);
    expect(read.filter((matchUp: any) => matchUp.collectionId).length).toBeGreaterThan(0);
  });

  it('differential AGREEMENT: a detector that finds work on a hydration but not on the index is recorded', () => {
    const { drawDefinition } = draw();
    // every hydrated matchUp has a round name; no index entry carries one
    const detect = (matchUps: any[]) => matchUps.find((matchUp) => matchUp.roundName);
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    expect(settle(drawDefinition, detect).result).toEqual('idle');
    expect(takePrecheckDivergences()).toEqual([]);

    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    settle(drawDefinition, detect);
    expect(takePrecheckDivergences()).toEqual([expect.objectContaining({ site: 's', index: 'null' })]);
  });

  it('differential COMPLETENESS: the pass runs anyway, and one that writes where the index said idle is recorded', () => {
    const { drawDefinition } = draw();
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    // a pass that writes, under a detector that finds nothing anywhere
    const writes = vi.fn(() => {
      drawDefinition.drawName = 'written by a pass the detector called idle';
      return 'ran';
    });
    expect(settle(drawDefinition, () => undefined, writes).result).toEqual('ran');
    expect(writes).toHaveBeenCalledTimes(1);
    expect(takePrecheckDivergences()).toEqual([{ site: 's', index: 'idle', hydrated: 'the pass wrote' }]);
    // CONTROL: an idle pass that writes nothing is not recorded
    settle(drawDefinition, () => undefined);
    expect(takePrecheckDivergences()).toEqual([]);
  });
});

describe('differential: a recorded disagreement is a divergence at compare, and the call changes nothing', () => {
  useEngineCatch();

  it('thrown as precheck:<site>, the record restored', () => {
    const { drawId } = draw();
    const { matchUpId } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps[0];
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    plant.takes = 0;
    plant.onTake = 2;
    const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
    expect(result.error).toMatch(/v2 precheck:reconcileByeAdvancements index found null/);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);

    // CONTROL: the same call with nothing planted writes
    plant.takes = 0;
    plant.onTake = 0;
    expect((tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }) as any).success).toEqual(true);
  });
});
