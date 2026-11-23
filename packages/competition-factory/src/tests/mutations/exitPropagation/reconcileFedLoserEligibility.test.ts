import { reconcileFedLoserEligibility } from '@Mutate/matchUps/drawPositions/reconcileFedLoserEligibility';
import { generateDraw, playForward } from '@Tests/testHarness/exitPropagation/routeComparison';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, COMPASS, LOSER, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';

/**
 * The link-condition reconciliation, exercised on each of its branches.
 *
 * A winner change is a RELABEL — nothing placed, nothing removed. Exactly one thing can contradict
 * that, and it is link-defined: `FIRST_MATCHUP` makes entry conditional on the ARRIVING participant
 * (zero prior scored wins), so a flip can change who is ELIGIBLE rather than merely who lost. This
 * step reconciles that, and only that.
 *
 * Its early returns matter as much as its action, because each one is a claim that a case needs NO
 * reconciliation — and a wrong early return would silently skip a correction rather than fail.
 */

const SEED = 7001;

function context(drawType: string, drawSize: number, participantsCount: number, structureName: string) {
  const drawId = `reconcile-${drawType}-${participantsCount}`;
  generateDraw(drawType, drawId, drawSize, SEED, participantsCount);
  playForward(drawId);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure: any = drawDefinition.structures.find((item: any) => item.structureName === structureName);
  expect(structure, `${structureName} not found`).toBeDefined();
  return { drawDefinition, structure, drawId };
}

const snapshot = (drawDefinition: any) =>
  JSON.stringify((drawDefinition.structures ?? []).map((structure: any) => structure.positionAssignments ?? []));

describe('reconcileFedLoserEligibility', () => {
  it('is a no-op when the link carries NO condition — every other link feeds unconditionally', () => {
    const { drawDefinition, structure } = context(COMPASS, 16, 16, 'East');
    const loserTargetLink: any = drawDefinition.links?.find(
      (link: any) => link.linkType === LOSER && link.source.structureId === structure.structureId,
    );
    expect(loserTargetLink, 'COMPASS emits a loser link').toBeDefined();
    // CONTROL: the premise of this case — COMPASS emits no linkCondition at all.
    expect(loserTargetLink.linkCondition).toBeUndefined();

    const before = snapshot(drawDefinition);
    const result: any = reconcileFedLoserEligibility({
      loserDrawPosition: 1,
      drawDefinition,
      loserTargetLink,
      structure,
    });
    expect(result?.error).toBeUndefined();
    expect(snapshot(drawDefinition), 'an unconditional link was reconciled').toEqual(before);
  });

  it('is a no-op when there is no loser link at all', () => {
    const { drawDefinition, structure } = context(COMPASS, 16, 16, 'East');
    const before = snapshot(drawDefinition);

    const result: any = reconcileFedLoserEligibility({
      loserDrawPosition: 1,
      loserTargetLink: undefined,
      drawDefinition,
      structure,
    });
    expect(result?.error).toBeUndefined();
    expect(snapshot(drawDefinition)).toEqual(before);
  });

  it('is a no-op when the link names no target structure', () => {
    const { drawDefinition, structure } = context(FIRST_MATCH_LOSER_CONSOLATION, 16, 13, 'Main');
    const before = snapshot(drawDefinition);

    const result: any = reconcileFedLoserEligibility({
      loserTargetLink: { linkType: LOSER, linkCondition: FIRST_MATCHUP, source: {}, target: {} } as any,
      loserDrawPosition: 1,
      drawDefinition,
      structure,
    });
    expect(result?.error).toBeUndefined();
    expect(snapshot(drawDefinition)).toEqual(before);
  });

  it('is a no-op when the drawPosition holds nobody', () => {
    const { drawDefinition, structure } = context(FIRST_MATCH_LOSER_CONSOLATION, 16, 13, 'Main');
    const loserTargetLink: any = drawDefinition.links?.find(
      (link: any) => link.linkCondition === FIRST_MATCHUP && link.source.structureId === structure.structureId,
    );
    expect(loserTargetLink, 'FMLC emits a FIRST_MATCHUP link').toBeDefined();

    const occupied = (structure.positionAssignments ?? []).map((assignment: any) => assignment.drawPosition);
    const vacant = Math.max(...occupied) + 50; // a drawPosition that exists nowhere
    const before = snapshot(drawDefinition);

    const result: any = reconcileFedLoserEligibility({
      loserDrawPosition: vacant,
      drawDefinition,
      loserTargetLink,
      structure,
    });
    expect(result?.error).toBeUndefined();
    expect(snapshot(drawDefinition)).toEqual(before);
  });

  it('is a no-op for an ELIGIBLE occupant — a first-match loser belongs in the consolation', () => {
    const { drawDefinition, structure } = context(FIRST_MATCH_LOSER_CONSOLATION, 16, 16, 'Main');
    const loserTargetLink: any = drawDefinition.links?.find(
      (link: any) => link.linkCondition === FIRST_MATCHUP && link.source.structureId === structure.structureId,
    );
    expect(loserTargetLink).toBeDefined();

    // A round-1 loser has zero prior scored wins, so is eligible by definition.
    const firstRoundLoserPosition = 2;
    const before = snapshot(drawDefinition);

    const result: any = reconcileFedLoserEligibility({
      loserDrawPosition: firstRoundLoserPosition,
      drawDefinition,
      loserTargetLink,
      structure,
    });
    expect(result?.error).toBeUndefined();
    expect(snapshot(drawDefinition), 'an eligible participant was displaced').toEqual(before);
  });
});
