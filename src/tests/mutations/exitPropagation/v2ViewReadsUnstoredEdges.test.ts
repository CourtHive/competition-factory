import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { addGoesTo, hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * THE v2 VIEW SEES A DRAW'S EDGES WHETHER OR NOT THE DRAW STORES THEM, AND WRITES NONE (outcome v2 S0).
 *
 * The view used to hydrate with `nextMatchUps: true`, which v1 dropped as costly and unread; S0 drops it from the
 * view too. But it did one thing the view needs: it put `winnerMatchUpId` / `loserMatchUpId` on the hydrated copies
 * of a draw stored WITHOUT them. v1 writes such a draw's edges before deciding (`ensureGoesTo`, onto its own view as
 * well), and its guards read `winnerMatchUpId` on that view (`relabelLoserExit`, under `correctionKindChange`). v2
 * decides first, and writes nothing, so it takes the same edges onto its copy alone: `addGoesTo({ inContextOnly })`.
 */

function stripEdges(drawDefinition: any) {
  for (const structure of drawDefinition.structures)
    for (const matchUp of structure.matchUps ?? []) {
      delete matchUp.winnerMatchUpId;
      delete matchUp.loserMatchUpId;
    }
}

const generate = () =>
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 13, drawId: 'edges' }],
    nonRandom: 7,
  }).tournamentRecord;

describe('addGoesTo inContextOnly', () => {
  it('puts the edges a stored draw would hold on the hydrated copies, and writes nothing stored', () => {
    const intact = generate().events[0].drawDefinitions[0];
    const drawDefinition = structuredClone(intact);
    stripEdges(drawDefinition);
    // CONTROL: the copy really is a draw without its edges
    expect(hasStoredGoesTo({ drawDefinition })).toEqual(false);
    const before = JSON.stringify(drawDefinition);

    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    const result = addGoesTo({ inContextDrawMatchUps, drawDefinition, matchUpsMap, inContextOnly: true });
    expect(result.error).toBeUndefined();

    expect(JSON.stringify(drawDefinition), 'the stored draw is unchanged').toEqual(before);
    const stored = new Map(getMatchUpsMap({ drawDefinition: intact }).drawMatchUps.map((m) => [m.matchUpId, m]));
    let edges = 0;
    for (const matchUp of inContextDrawMatchUps) {
      const original = stored.get(matchUp.matchUpId);
      expect(matchUp.winnerMatchUpId, matchUp.matchUpId).toEqual(original?.winnerMatchUpId);
      expect(matchUp.loserMatchUpId, matchUp.matchUpId).toEqual(original?.loserMatchUpId);
      if (original?.winnerMatchUpId || original?.loserMatchUpId) edges += 1;
    }
    // CONTROL: a COMPASS draw of 16 has edges in every direction it plays
    expect(edges).toBeGreaterThan(20);
  });
});

/**
 * The case the view-equivalence probe found (S0, 2026-10-23): the P52 correction of
 * `aResultPastAConvergencesByeFixesTheKind.test.ts` (census 21027128, COMPASS 32/27), made as the FIRST call on a
 * record that holds those results but stores no edges, as an imported record may. v1 writes the edges, then refuses
 * the change of kind (`CANNOT_CHANGE_OUTCOME`). A view without them misses the recorded result past the convergence's
 * BYE and accepts, which `differential` reports as a divergence.
 */
describe('a correction refused by a recorded result, on a record that stores no edges', () => {
  afterEach(() => {
    delete process.env.ALLOW_CHANGE_PROPAGATION;
  });

  type Step = [string, any];
  const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
  const config = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 21027128 };
  const steps: Step[] = [
    ['East|1|14', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['East|1|7', { winningSide: 1 }],
    ['East|1|8', { winningSide: 2 }],
    ['East|1|9', { winningSide: 1 }],
    ['East|1|13', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['East|1|10', { winningSide: 2 }],
    ['East|1|13', { winningSide: 1 }],
    ['West|1|5', { winningSide: 2 }],
    ['West|1|4', { winningSide: 1 }],
    ['South|3|1', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }],
  ];
  const enter = (drawId: string, [key, outcome]: Step) => {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    return observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
  };

  it('is refused under differential, with v2 agreeing', () => {
    process.env.ALLOW_CHANGE_PROPAGATION = '1';
    setSubscriptions({});
    const drawId = 'unstored-edges-kind';
    expect(prepareDraw(config, drawId)).toEqual(true);
    for (const step of steps) expect(enter(drawId, step).thrown).toBeUndefined();

    // the record as an import would hold it: the results, and no edges
    const { tournamentRecord } = tournamentEngine.getTournament();
    stripEdges(tournamentRecord.events[0].drawDefinitions[0]);
    // CONTROL: the record loaded really stores no edges
    expect(hasStoredGoesTo({ drawDefinition: tournamentRecord.events[0].drawDefinitions[0] })).toEqual(false);
    tournamentEngine.setState(tournamentRecord);

    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    const corrected = enter(drawId, ['East|1|13', { winningSide: 1 }]);
    expect(corrected.thrown, 'v2 and v1 disagree').toBeUndefined();
    expect(corrected.error?.code).toEqual(CANNOT_CHANGE_OUTCOME.code);
  });
});
