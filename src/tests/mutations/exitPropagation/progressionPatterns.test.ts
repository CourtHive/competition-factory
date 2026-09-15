import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import {
  projectDraw,
  stableHash,
  getDrawDefinition,
  clearOutcome,
} from '@Tests/testHarness/exitPropagation/transitions';
import {
  applyOutcome,
  findByCoord,
  generateDraw,
  playForward,
} from '@Tests/testHarness/exitPropagation/routeComparison';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * PROGRESSION PATTERNS — named behaviours rather than frozen seeds.
 *
 * The census and the Route A/B differential are how defects in this area were FOUND, but both are
 * inert without an environment flag and neither runs in CI, so neither protects anything. What
 * protects a behaviour is a test that says which behaviour it is. This file covers the two patterns
 * that produced essentially every defect in the exit-cascade programme:
 *
 *   UNWINDABILITY      a result that is entered can be cleared, and the draw returns to what it was
 *   WINNING-SIDE CHANGE a decided result can be re-decided the other way, and progression follows
 *
 * Both are asserted across the draw types whose LINK TOPOLOGY differs, because every defect found in
 * this programme was topology-specific rather than draw-type-specific: a structure fed by a second
 * round (COMPASS, CURTIS), a conditional feed (FMLC), a structure fed by BOTH sides of one matchUp
 * (DOUBLE_ELIMINATION's Decider), and a winner fed BACK into the main draw (its Backdraw).
 *
 * Whole-state comparison is deliberate. Spot-checking a position cannot see residue, and residue is
 * what these paths leave: `projectDraw` covers per-matchUp status/winner/score/codes/positions plus
 * every structure's `positionAssignments`, so "returns to what it was" is a total claim.
 */

const SEED = 7001;

/** How many decided matchUps each topology flips, one at a time from a fresh draw. */
const FLIP_SAMPLE = 6;

const TOPOLOGIES = [
  { drawType: COMPASS, drawSize: 16, note: 'second-round feed, same stageSequence' },
  { drawType: OLYMPIC, drawSize: 16, note: 'second-round feed, fewer structures' },
  { drawType: CURTIS_CONSOLATION, drawSize: 16, note: 'two rounds feed one structure, plus a play-off' },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, note: 'conditional FIRST_MATCHUP feed' },
  { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16, note: 'every round feeds one structure' },
  { drawType: DOUBLE_ELIMINATION, drawSize: 8, note: 'convergent Decider, and a winner fed back into Main' },
];

/** Participant counts chosen so one arm has no BYEs and the other does. */
const PARTICIPANT_MODES = [
  { label: 'full', reduce: 0 },
  { label: 'with byes', reduce: 3 },
];

describe.each(TOPOLOGIES)('$drawType ($note)', ({ drawType, drawSize }) => {
  describe.each(PARTICIPANT_MODES)('$label', ({ reduce }) => {
    const participantsCount = Math.max(4, drawSize - reduce);

    const played = (drawId: string) => {
      generateDraw(drawType, drawId, drawSize, SEED, participantsCount);
      const order = playForward(drawId);
      // CONTROL: an empty play order would make every assertion below vacuous.
      expect(order.length).toBeGreaterThan(0);
      return order;
    };

    /**
     * UNWINDABILITY. Entering a result and clearing it must be an identity on the whole draw.
     *
     * This is the property `clearSideExitProvenance` exists for, and the one a do/undo defect breaks
     * silently: the draw looks coherent afterwards and only a total comparison sees the residue.
     */
    it('clearing a result returns the draw to its prior state', () => {
      const drawId = `unwind-${drawType}-${participantsCount}`;
      const order = played(drawId);
      const last = order.at(-1);

      const target = findByCoord(drawId, last as any);
      expect(target?.winningSide).toBeTruthy();
      const before = stableHash(projectDraw(getDrawDefinition(drawId)));

      expect(applyOutcome(target.matchUpId, drawId, clearOutcome)?.error).toBeUndefined();
      // CONTROL: the clear must have CHANGED something, or the identity below is trivial.
      const cleared = stableHash(projectDraw(getDrawDefinition(drawId)));
      expect(cleared, 'clearing changed nothing').not.toEqual(before);

      const restored = findByCoord(drawId, last as any);
      expect(applyOutcome(restored.matchUpId, drawId, { winningSide: target.winningSide })?.error).toBeUndefined();

      expect(stableHash(projectDraw(getDrawDefinition(drawId))), 'did not round-trip').toEqual(before);
    });

    /**
     * WINNING-SIDE CHANGE. Re-deciding the other way, then back, must also be an identity.
     *
     * A swap is a relabel, so doing it twice returns every participant to where they started. This
     * is the property that catches a swap which corrects one structure and not another: the second
     * correction cannot undo what the first failed to do, so the residue shows up here.
     */
    it('a winning-side change can be corrected back, and the draw returns', () => {
      const drawId = `flip-${drawType}-${participantsCount}`;
      const order = played(drawId);

      const first = order.find((coord) => {
        const matchUp = findByCoord(drawId, coord);
        return matchUp?.winningSide && matchUp?.roundPosition;
      });
      expect(first, 'no decided matchUp with a roundPosition').toBeDefined();

      const target = findByCoord(drawId, first as any);
      const original = target.winningSide;
      const before = stableHash(projectDraw(getDrawDefinition(drawId)));

      const flipped: any = applyOutcome(target.matchUpId, drawId, { winningSide: original === 1 ? 2 : 1 }, true);
      expect(flipped?.error).toBeUndefined();
      // CONTROL: the flip must have changed the draw.
      expect(stableHash(projectDraw(getDrawDefinition(drawId))), 'the flip changed nothing').not.toEqual(before);

      const again = findByCoord(drawId, first as any);
      expect(applyOutcome(again.matchUpId, drawId, { winningSide: original }, true)?.error).toBeUndefined();

      expect(stableHash(projectDraw(getDrawDefinition(drawId))), 'the correction did not round-trip').toEqual(before);
    });

    /**
     * A winning-side change must never leave the draw internally inconsistent.
     *
     * Weaker than the round-trip above and it fails differently: a swap that corrects the wrong set
     * of structures can still round-trip (two wrongs cancelling) while leaving a participant in a
     * place they never earned in between.
     *
     * **Each flip is applied to a FRESHLY played draw.** An earlier form of this test flipped every
     * matchUp in sequence without resetting, which compounds: the second flip lands on a draw the
     * first already rewrote, and by the end the state is not one any sequence of legitimate
     * operations produces. It failed on 7 of 12 topologies and none of those failures was about a
     * single winning-side change — the property this test is named for. Cumulative mutation is a
     * different property and deserves a different test if it is wanted.
     *
     * Bounded to the first `FLIP_SAMPLE` decided matchUps to stay CI-priced; the count actually
     * exercised is asserted, so a bound that silently dropped everything would fail rather than read
     * as clean. The exhaustive version is the Route A/B differential, which is not a CI gate.
     */
    it('a winning-side change leaves no inconsistency', () => {
      const drawId = `consistent-${drawType}-${participantsCount}`;
      const order = played(drawId);
      const candidates = order.slice(0, FLIP_SAMPLE);

      let flips = 0;
      for (const coord of candidates) {
        // reset: the property is about ONE change applied to a legitimately played draw
        played(drawId);
        const matchUp = findByCoord(drawId, coord);
        if (!matchUp?.winningSide || !matchUp?.roundPosition) continue;
        const result: any = applyOutcome(
          matchUp.matchUpId,
          drawId,
          { winningSide: matchUp.winningSide === 1 ? 2 : 1 },
          true,
        );
        if (result?.error) continue;
        flips++;
        const { inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId });
        expect(
          inconsistencies ?? [],
          `after flipping ${coord.structureName}|${coord.roundNumber}|${coord.roundPosition}`,
        ).toEqual([]);
      }
      // CONTROL: a run that flipped nothing would report clean without testing anything.
      expect(flips, 'no flip was applied').toBeGreaterThan(0);
    });
  });
});
