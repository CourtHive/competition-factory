import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { MODIFIED_FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';

/**
 * A PENDING exit owes no advancement, and the integrity checker must not demand one.
 *
 * ## The shape
 *
 * `progressExitStatus` RULE 2 awards a carried exit to the side WITHOUT the exit and writes that
 * award BEFORE anyone arrives. So an exit can legitimately stand with a `winningSide` while its
 * opposing slot has not been fed at all — no drawPosition, no participant, no BYE. `Main|3|4` below
 * is exactly that: `DEFAULTED`, `winningSide: 1`, `drawPositions: [26]`.
 *
 * `getStructureInconsistencies` reported `WINNER_NOT_ADVANCED` on it — "the winning-side participant
 * did not advance into its next matchUp within the structure". It was the largest remaining class in
 * the exit-cascade census: **7 seeds across FIC, SE, two MFIC and three DE, an identical seed set on
 * both propagation arms**, so nothing to do with `allowChangePropagation`.
 *
 * ## The engine is right and the checker was wrong, which is not where this started
 *
 * The obvious reading is that the cascade stops one hop short, and making it advance does close all
 * seven. **It also OPENS four DOUBLE_ELIMINATION seeds with `WINNING_SIDE_ADVANCEMENT_MISMATCH`**,
 * and that is the finding: `winningSide` is POSITIONAL. While one drawPosition is present it names
 * that participant; the moment the real opponent arrives the array re-sorts and the same
 * `winningSide` names the OTHER one. Advancing on the strength of the provisional value pushed a
 * participant across a link and left the advancement naming the loser once the array moved.
 *
 * CA's rule already says so: *a pending exit is resolved by an ARRIVING PARTICIPANT on the
 * non-exiting side; a position holding nobody arriving resolves nothing and must leave the exit
 * pending.* So the reservation must stay a reservation, and the checker's demand was the defect.
 *
 * The exclusion is keyed on the UNFED LOSING SLOT rather than on `sideExitProvenance`, because one
 * of the seven (MFIC `Consolation|3|1`) carries no provenance at all. It mirrors `EXIT_WITHOUT_LOSER`
 * in the same file, which already requires `loserSide?.drawPosition` before it will flag.
 *
 * ## Why these two cases
 *
 * SINGLE_ELIMINATION has NO links, so it proves the shape is ordinary within-structure advancement
 * rather than anything about consolation feeds or crossing a structure. MFIC is the one that carries
 * no provenance, so it is what stops a provenance-keyed exclusion looking sufficient. Both are census
 * seeds shrunk on the `WINNER_NOT_ADVANCED` issueType (`shrinkIssue`): 9100215 from 30 steps to 3,
 * 9100572 from 30 to 8.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };

const CASES: {
  name: string;
  drawType: string;
  drawSize: number;
  participantsCount: number;
  nonRandom: number;
  pending: { structureName: string; roundNumber: number; roundPosition: number };
  steps: Step[];
}[] = [
  {
    name: 'single elimination — a pending exit with one drawPosition, in a draw with no links at all',
    drawType: SINGLE_ELIMINATION,
    drawSize: 32,
    participantsCount: 29,
    nonRandom: 9100215,
    pending: { structureName: 'Main', roundNumber: 3, roundPosition: 4 },
    steps: [
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 13,
        outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 7, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 14, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ],
  },
  {
    name: 'modified feed-in championship — the same shape carrying NO sideExitProvenance',
    drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
    drawSize: 16,
    participantsCount: 16,
    nonRandom: 9100572,
    pending: { structureName: 'Consolation', roundNumber: 3, roundPosition: 1 },
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 8, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 1, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 3,
        outcome: {
          matchUpStatus: RETIRED,
          winningSide: 1,
          score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
        },
      },
      { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
      { structureName: 'Consolation', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
    ],
  },
];

const drawMatchUps = (drawId: string): any[] =>
  tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];

test.each(CASES)('$name', ({ drawType, drawSize, participantsCount, nonRandom, pending, steps }) => {
  setSubscriptions({});
  const drawId = `pending-exit-${nonRandom}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
    nonRandom,
    setState: true,
  });

  // CONTROL: the draw must exist, or every assertion below is about nothing.
  expect(drawMatchUps(drawId).length).toBeGreaterThan(0);

  steps.forEach((step, index) => {
    const target = drawMatchUps(drawId).find(
      (matchUp: any) =>
        matchUp.structureName === step.structureName &&
        matchUp.roundNumber === step.roundNumber &&
        matchUp.roundPosition === step.roundPosition,
    );
    // CONTROL: a coordinate naming no matchUp would skip the step that builds the state.
    expect(target, `step ${index + 1} names no matchUp`).toBeTruthy();
    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      propagateExitStatus: true,
      drawId,
    });
  });

  const target = drawMatchUps(drawId).find(
    (matchUp: any) =>
      matchUp.structureName === pending.structureName &&
      matchUp.roundNumber === pending.roundNumber &&
      matchUp.roundPosition === pending.roundPosition,
  );

  /**
   * CONTROL, and the load-bearing one: the state these steps exist to produce must actually be
   * there. Without this the test passes on any draw where nothing happened — which is precisely how
   * a replay whose fixtures have drifted reports "consistent".
   */
  expect(target, 'the pending matchUp does not exist').toBeTruthy();
  expect(target.matchUpStatus, 'expected an exit status').toMatch(/WALKOVER|DEFAULTED/);
  expect(target.winningSide, 'expected a reserved winningSide').toBeTruthy();
  expect(target.drawPositions?.filter(Boolean), 'expected exactly one drawPosition').toHaveLength(1);
  const loserSide = (target.sides ?? []).find((side: any) => side.sideNumber !== target.winningSide);
  expect(loserSide?.drawPosition, 'expected the losing slot to be unfed').toBeUndefined();

  // The pending exit owes nothing: the draw is consistent with its winner still sitting in it.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
  expect((integrity?.inconsistencies ?? []).map((entry: any) => entry.issueType)).toEqual([]);
});
