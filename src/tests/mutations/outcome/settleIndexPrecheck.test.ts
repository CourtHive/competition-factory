import { nothingToSettle, takePrecheckDivergences } from '@Mutate/matchUps/matchUpStatus/indexPrecheck';
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

describe('nothingToSettle', () => {
  it('is true where the index answers and the detector finds no work; false where it finds work', () => {
    const { drawDefinition } = draw();
    expect(nothingToSettle({ drawDefinition, site: 's', detect: () => undefined })).toEqual(true);
    expect(nothingToSettle({ drawDefinition, site: 's', detect: () => [] })).toEqual(true);
    expect(nothingToSettle({ drawDefinition, site: 's', detect: () => ({ matchUpId: 'm' }) })).toEqual(false);
    expect(nothingToSettle({ drawDefinition, site: 's', detect: () => ['m'] })).toEqual(false);
  });

  it('is false on a draw the index does not cover (TEAM): the pass hydrates as before', () => {
    const { drawDefinition } = draw({ drawSize: 4, eventType: TEAM_EVENT });
    const detect = vi.fn(() => undefined);
    expect(nothingToSettle({ drawDefinition, site: 's', detect })).toEqual(false);
    expect(detect).not.toHaveBeenCalled();
  });

  it('asks the detector of the index, which carries no round name, and of a hydration only in differential', () => {
    const { drawDefinition } = draw();
    // a detector that would find work on a hydration only: every hydrated matchUp has a round name
    const detect = (matchUps: any[]) => matchUps.find((matchUp) => matchUp.roundName);
    // pinned: the suite may run under OUTCOME_PIPELINE=differential
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    expect(nothingToSettle({ drawDefinition, site: 'planted', detect })).toEqual(true);
    expect(takePrecheckDivergences()).toEqual([]);

    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    expect(nothingToSettle({ drawDefinition, site: 'planted', detect })).toEqual(true);
    const [recorded] = takePrecheckDivergences();
    expect(recorded).toMatchObject({ site: 'planted', index: 'null' });
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
