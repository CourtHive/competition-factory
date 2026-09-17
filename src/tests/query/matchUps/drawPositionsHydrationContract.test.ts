import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  FEED_IN_CHAMPIONSHIP_TO_SF,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';

/**
 * The published contract for `drawPositions` on an inContext matchUp, pinned in both directions.
 *
 * `addMatchUpContext` hydrates through `definedAttributes(obj, undefined, true)`, whose third
 * argument DROPS EMPTY ARRAYS. So a matchUp storing `drawPositions: []` is published with **no
 * `drawPositions` key at all** — and that is not an edge case introduced by any recent change: it
 * is what generation already produces for every matchUp nobody has reached yet, which is most of
 * the draw. The first test measures exactly that, so the claim is a number rather than an assertion
 * about intent.
 *
 * The consequence worth stating plainly for consumers: **an absent `drawPositions` is the ordinary
 * shape of an unplayed matchUp, and `sides` is length 2 regardless.** Nothing downstream needs the
 * array to decide how many sides a matchUp has, and code that reads `matchUp.drawPositions.map(...)`
 * unguarded was already reachable before this file existed.
 *
 * The second test pins the other half: a MIXED array — a hole beside a survivor — is NOT collapsed.
 * `drawPositions` is positional, and `[undefined, 5]` keeping its hole is what holds 5 on side 2.
 * Only an array of nothing but holes settles to `[]`; see `normalizeDrawPositions`.
 */

function collectStructures(structures: any[], collected: any[] = []): any[] {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
  return collected;
}

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

it.each([SINGLE_ELIMINATION, DOUBLE_ELIMINATION, FEED_IN_CHAMPIONSHIP_TO_SF, COMPASS])(
  'a generated %s draw already stores `[]` and publishes NO drawPositions key for unreached matchUps',
  (drawType) => {
    const drawId = `hydration-${drawType}`;
    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, participantsCount: 16, drawType, drawId }],
      nonRandom: 1,
      setState: true,
    });
    expect(drawIds).toContain(drawId);

    const drawDefinition = tournamentEngine.getEvent({ drawId })?.drawDefinition;
    const storedEmpty = new Set<string>();
    for (const structure of collectStructures(drawDefinition?.structures ?? [])) {
      for (const matchUp of structure.matchUps ?? []) {
        const drawPositions = matchUp.drawPositions;
        expect(Array.isArray(drawPositions)).toEqual(true);
        // the shape this whole workstream exists to forbid, asserted at generation too
        expect(drawPositions.length && !drawPositions.some(Boolean)).toBeFalsy();
        if (!drawPositions.length) storedEmpty.add(matchUp.matchUpId);
      }
    }

    // the control: a draw with no empty arrays would make every assertion below vacuous
    expect(storedEmpty.size).toBeGreaterThan(0);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    expect(matchUps?.length).toBeGreaterThan(0);

    for (const matchUp of matchUps ?? []) {
      // sides never depend on it — always two, whether or not the key is published
      expect(matchUp.sides?.length).toEqual(2);

      if (storedEmpty.has(matchUp.matchUpId)) {
        expect('drawPositions' in matchUp).toEqual(false);
      } else {
        expect(matchUp.drawPositions?.length).toBeGreaterThan(0);
      }
    }
  },
);

it('a MIXED drawPositions array keeps its hole through hydration — the hole is the side binding', () => {
  const drawId = 'hydration-mixed';
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 27, drawSize: 32, drawType: FEED_IN_CHAMPIONSHIP_TO_SF, drawId }],
    nonRandom: 9000408,
    setState: true,
  });
  expect(drawIds).toContain(drawId);
  setSubscriptions({});

  // Seed 9000408's minimal reproduction: a double exit entered and then cleared. It empties both
  // sides of one downstream feed target (which settles to `[]`) and ONE side of others (which keep
  // their hole). Both shapes therefore occur in the same draw.
  const steps = [
    { coordinate: 'Main|2|1', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    {
      coordinate: 'Main|2|1',
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    },
  ];

  let applied = 0;
  for (const step of steps) {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const target = matchUps.find((matchUp: any) => coordinates(matchUp) === step.coordinate);
    if (!target) continue;
    tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    applied++;
  }
  expect(applied).toEqual(steps.length);

  const drawDefinition = tournamentEngine.getEvent({ drawId })?.drawDefinition;
  const mixedIds = new Set<string>();
  const emptiedIds = new Set<string>();
  for (const structure of collectStructures(drawDefinition?.structures ?? [])) {
    for (const matchUp of structure.matchUps ?? []) {
      const drawPositions = matchUp.drawPositions ?? [];
      expect(drawPositions.length && !drawPositions.some(Boolean)).toBeFalsy();
      if (drawPositions.some(Boolean) && drawPositions.some((drawPosition: any) => !drawPosition)) {
        mixedIds.add(matchUp.matchUpId);
      }
      if (Array.isArray(matchUp.drawPositions) && !matchUp.drawPositions.length) emptiedIds.add(matchUp.matchUpId);
    }
  }

  // controls: both shapes were actually produced, so neither branch below is vacuous
  expect(mixedIds.size).toBeGreaterThan(0);
  expect(emptiedIds.size).toBeGreaterThan(0);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  for (const matchUp of matchUps ?? []) {
    if (mixedIds.has(matchUp.matchUpId)) {
      // the key survives, the hole survives, and it is still at its original index
      expect(matchUp.drawPositions?.length).toEqual(2);
      expect(matchUp.drawPositions.filter(Boolean).length).toEqual(1);
    }
    if (emptiedIds.has(matchUp.matchUpId)) {
      expect('drawPositions' in matchUp).toEqual(false);
    }
    expect(matchUp.sides?.length).toEqual(2);
  }
});
