import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * **P29 — the player who did not appear wins the walkover.**
 *
 * A produced exit whose only occupant is on one side is awarded to the OTHER side, which is vacant. The
 * participant who is actually there loses a matchUp against nobody.
 *
 * ## Why these four cells, and why they are the smallest available reproduction
 *
 * The punch-list entry reproduces on a frozen census window (seed 9100426), which is expensive to
 * stand up and reads a `sideExitProvenance` to identify the exiting side. These four are inside the
 * repo's own matrix, found 2026-09-26 by asking *which* side won over all 600 cells at their own
 * seeds: 926 decided one-occupant matchUps award the occupant and **4** award the vacant seat. All four
 * are the same coordinate, `Consolation|6|1` of `FEED_IN_CHAMPIONSHIP 16/16`, across the full 2x2 of
 * exit status x `propagateExitStatus`.
 *
 * Two properties make them the right reproduction rather than merely a smaller one:
 *
 *  - **16/16 has no BYEs**, so nothing here depends on a BYE interaction.
 *  - **They pass the suite today.** `exitPropagationMatrix` does not look at which side an exit was
 *    awarded to, and neither does `getDrawInconsistencies`, so this state is currently reported by
 *    nothing at all.
 *
 * The assertion is deliberately about OCCUPANCY rather than provenance. "The winner is the side with no
 * participant in it" needs no provenance read to be wrong, so the test cannot be quieted by a change to
 * what `sideExitProvenance` records — the failure mode that made `isPropagatedExit` a status test
 * wearing the provenance name (**P3**).
 *
 * ## Three families, because the award was wrong in two shapes and only one of them is visible
 *
 * The first four cells are the REALIZED defect: a participant arrives and loses. The other two are the
 * same defect LATENT — the draw ends before anyone arrives, so the wrong winner sits in a matchUp
 * holding nobody, and the first participant to arrive there would lose. Measured 2026-09-26 by diffing
 * the terminal state of all 600 matrix cells before and after the fix: **17 cells change, all in the
 * same direction** — 4 realized (`FEED_IN_CHAMPIONSHIP 16/16`), 11 `FIRST_MATCH_LOSER_CONSOLATION` and
 * 2 `DOUBLE_ELIMINATION`, and in every one the award moves off a side holding **no drawPosition at
 * all** onto the side that holds one:
 *
 *   FMLC 8/7     Consolation|3|1  sides [{s1 dp4}, {no dp}]  ws 2 -> 1
 *   DE 16/13     Backdraw|3|2     sides [{no dp}, {s2 dp15}] ws 1 -> 2
 *
 * Note the two go OPPOSITE ways, which is why the test asserts a property rather than a value: the
 * defect is not "side 2 wins too often", it is that the side identification was positional.
 */
const CELLS = [
  {
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize: 16,
    participantsCount: 16,
    exitStatus: DOUBLE_WALKOVER,
    propagateExitStatus: true,
    seed: 397,
  },
  {
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize: 16,
    participantsCount: 16,
    exitStatus: DOUBLE_WALKOVER,
    propagateExitStatus: false,
    seed: 398,
  },
  {
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize: 16,
    participantsCount: 16,
    exitStatus: DOUBLE_DEFAULT,
    propagateExitStatus: true,
    seed: 399,
  },
  {
    drawType: FEED_IN_CHAMPIONSHIP,
    drawSize: 16,
    participantsCount: 16,
    exitStatus: DOUBLE_DEFAULT,
    propagateExitStatus: false,
    seed: 400,
  },
  {
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawSize: 8,
    participantsCount: 7,
    exitStatus: DOUBLE_WALKOVER,
    propagateExitStatus: true,
    seed: 217,
  },
  {
    drawType: DOUBLE_ELIMINATION,
    drawSize: 16,
    participantsCount: 13,
    exitStatus: DOUBLE_WALKOVER,
    propagateExitStatus: true,
    seed: 117,
  },
];

const occupantsOf = (matchUp: any) => (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);

it.each(CELLS)(
  '$drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus never awards a produced exit to a seat nobody can occupy',
  ({ drawType, drawSize, participantsCount, exitStatus, propagateExitStatus, seed }) => {
    setSubscriptions({});
    const drawId = `exit-award-${seed}`;
    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType, drawSize, participantsCount }],
      nonRandom: seed,
      setState: true,
    });
    expect(drawIds).toContain(drawId);

    // the matrix's own schedule: the exit on the first playable matchUp, then every third step
    const outcome = { matchUpStatus: exitStatus };
    const target = nextPlayable(drawId);
    expect(target?.matchUpId).toBeDefined();
    step({ propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });
    playForward({ propagateExitStatus, exitOutcome: outcome, drawId });

    const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });

    // CONTROL: without this the assertion below passes vacuously on an empty or still-playable draw
    const playable = matchUps.filter(
      (m: any) =>
        !m.winningSide && (!m.matchUpStatus || m.matchUpStatus === 'TO_BE_PLAYED') && occupantsOf(m).length === 2,
    );
    expect(matchUps.length).toBeGreaterThan(0);
    expect(playable.length).toEqual(0);

    // THE PROPERTY, over the whole draw rather than only the known coordinate: a decided matchUp
    // holding exactly one participant must have been won BY that participant.
    const misawarded = matchUps
      .filter((m: any) => m.winningSide && occupantsOf(m).length === 1 && !(m.sides ?? []).some((s: any) => s?.bye))
      .filter((m: any) => occupantsOf(m)[0].sideNumber !== m.winningSide)
      .map(
        (m: any) =>
          `${m.structureName}|${m.roundNumber}|${m.roundPosition} ${m.matchUpStatus} ws=${m.winningSide} ` +
          `occupant=side ${occupantsOf(m)[0].sideNumber} drawPositions=${JSON.stringify(m.drawPositions)}`,
      );

    expect(misawarded).toEqual([]);

    /**
     * THE SAME PROPERTY FOR A MATCHUP NOBODY HAS REACHED YET, which the assertion above cannot see
     * because it requires an occupant. A decided matchUp may not award a side that holds **no
     * drawPosition** while the other side holds one: there is nothing there to win, and the position
     * that does exist is the one a participant either occupies or is still travelling to.
     *
     * Stated on drawPositions rather than on the array's shape — `draw-positions.md` rule 5 — by
     * reading each side's own `drawPosition`, so `[4, null]` and `[4]` are the same state to this test.
     */
    const awardedToAPositionlessSide = matchUps
      .filter((m: any) => m.winningSide && !(m.sides ?? []).some((s: any) => s?.bye))
      .filter((m: any) => {
        const sideOf = (n: number) => (m.sides ?? []).find((s: any) => s?.sideNumber === n);
        const winner = sideOf(m.winningSide);
        const loser = sideOf(3 - m.winningSide);
        return !winner?.drawPosition && !!loser?.drawPosition;
      })
      .map(
        (m: any) =>
          `${m.structureName}|${m.roundNumber}|${m.roundPosition} ${m.matchUpStatus} ws=${m.winningSide} ` +
          `sides=${JSON.stringify((m.sides ?? []).map((s: any) => s?.drawPosition ?? null))}`,
      );

    expect(awardedToAPositionlessSide).toEqual([]);
  },
);
