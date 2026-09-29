import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
import {
  getStructureInconsistencies,
  UNCOLLAPSED_CONVERGENCE,
} from '@Query/drawDefinition/getStructureInconsistencies';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';

/**
 * WHAT AN AUDIT IS ASKED OF, and what it says when it is asked of nothing.
 *
 * TMX's draw audit passes a `structureId`, and a client can call with whatever it holds. These pin
 * the edges of the question rather than any one rule.
 */

const DRAW_ID = 'scope';

function generate() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, idPrefix: 'm' }],
    setState: true,
  });
  return tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition as any;
}

const storedMatchUp = (drawDefinition: any, matchUpId: string) =>
  drawDefinition.structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);

it('refuses to audit without a draw', () => {
  const result: any = getStructureInconsistencies({} as any);
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('reports two exits delivered into a single exit as an UNCOLLAPSED_CONVERGENCE, and as an error', () => {
  const drawDefinition = generate();
  const [main] = drawDefinition.structures;
  const target = main.matchUps.find((matchUp: any) => matchUp.roundNumber === 2);

  // CONTROL: a fresh draw has nothing to report
  expect((getStructureInconsistencies({ drawDefinition }) as any).inconsistencies ?? []).toEqual([]);

  // both sides record an exit DELIVERED by a double exit, and the matchUp says it is a single one
  const stored = storedMatchUp(drawDefinition, target.matchUpId);
  stored.matchUpStatus = WALKOVER;
  stored.winningSide = 1;
  stored.sideExitProvenance = {
    1: { previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sourceMatchUpId: 'a' },
    2: { previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sourceMatchUpId: 'b' },
  };

  const result: any = getStructureInconsistencies({ drawDefinition });
  const found = (result.inconsistencies ?? []).filter((finding: any) => finding.issueType === UNCOLLAPSED_CONVERGENCE);
  expect(found.map((finding: any) => finding.matchUpId)).toEqual([target.matchUpId]);
  expect(result.valid).toEqual(false);
});

it('reports only the structure it was asked about', () => {
  const drawDefinition = generate();
  const [main, consolation] = drawDefinition.structures;

  // the same defect planted in the MAIN structure
  const stored = main.matchUps.find((matchUp: any) => matchUp.roundNumber === 2);
  stored.matchUpStatus = WALKOVER;
  stored.winningSide = 1;
  stored.sideExitProvenance = {
    1: { previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sourceMatchUpId: 'a' },
    2: { previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sourceMatchUpId: 'b' },
  };

  const asked = (structureId: string) =>
    ((getStructureInconsistencies({ drawDefinition, structureId }) as any).inconsistencies ?? []).map(
      (finding: any) => finding.structureId,
    );

  // CONTROL: asked of Main, it is found
  expect(asked(main.structureId).length).toBeGreaterThan(0);
  expect(asked(main.structureId).every((structureId: string) => structureId === main.structureId)).toEqual(true);
  // asked of the Consolation, it is not
  expect(asked(consolation.structureId)).toEqual([]);
});
