import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';

/**
 * THE INDEX ORACLE (outcome v2 executor plan § 3.1.1, S2). Under `differential`, every call's structural index is
 * compared with the view's hydration of the same draw, before any reader moves onto the index; a field the index
 * derives wrongly is a divergence keyed `index:<field>`, and the call changes nothing (outcome-pipeline.md § 7.1).
 *
 * A defect is planted here by corrupting the index the oracle is handed, so the case asserts that the oracle is wired
 * into the call and reports the field. Each planted case pins `OUTCOME_PIPELINE_V1` afterwards.
 */
const plant = vi.hoisted(() => ({ field: undefined as undefined | 'roundPosition' | 'sideDrawPosition' }));
vi.mock('@Query/matchUps/structuralIndex', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    buildStructuralIndex: (...args: any[]) => {
      const index = original.buildStructuralIndex(...args);
      const target = index.matchUps.find((matchUp: any) => matchUp.roundNumber === 2);
      if (plant.field === 'roundPosition' && target) target.roundPosition = 99;
      if (plant.field === 'sideDrawPosition' && target)
        target.sides = target.sides.map((side: any) => ({ ...side, drawPosition: 99 }));
      return index;
    },
  };
});

afterEach(() => {
  plant.field = undefined;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({});
});

function scoreFirstRound() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });
  const { matchUpId } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps[0];
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
  return { result, before, tournamentRecord };
}

describe('differential: the index is held to the hydration', () => {
  useEngineCatch();

  it('positive control: an honest index agrees, and the call writes', () => {
    const { result } = scoreFirstRound();
    expect(result.success).toEqual(true);
  });

  it.each([
    ['roundPosition', /v2 index:roundPosition /],
    ['sideDrawPosition', /v2 index:sides /],
  ] as const)('a planted %s is a divergence, and the call changes nothing', (field, reported) => {
    plant.field = field;
    const { result, before } = scoreFirstRound();
    expect(result.error).toMatch(/^outcome pipeline divergence on /);
    expect(result.error).toMatch(reported);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  });
});
