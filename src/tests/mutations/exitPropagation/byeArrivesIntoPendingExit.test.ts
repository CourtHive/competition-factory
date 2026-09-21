import { getInvariantViolations } from '@Tests/testHarness/exitPropagation/invariants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A BYE arriving into the slot a propagated exit is WAITING ON must not become its winner.
 *
 * `progressExitStatus` RULE 2 awards a carried walkover to the side WITHOUT the exit — the empty
 * slot that will receive whoever falls through from elsewhere — and writes that award BEFORE anyone
 * arrives. It is a legitimate shape, and `getStructureInconsistencies` says so in as many words:
 * *"A PENDING propagated exit legitimately has an empty winner slot."*
 *
 * The hole is what arrives. When it is a BYE, nobody ever will: the pending exit can never resolve
 * and the matchUp stands recorded as the BYE having won. `getExitWinningSide` states the rule this
 * breaks outright — *"A BYE draw position can never be the winning side."*
 *
 * RULE 1 already gives the answer for the case where the BYE is there FIRST — *"opponent is a BYE:
 * the participant advances through it… so this matchUp stays a BYE"*. `assignDrawPositionBye` now
 * reaches the same conclusion when the BYE arrives LAST: every earlier matchUp in the position's
 * chain that had awarded its result TO that position becomes a BYE with no winner. Scoped to the
 * awarded side, so a BYE on the LOSING side — a participant advancing past it, or an exit against an
 * emptied position — is left exactly as it is.
 *
 * ## The cases are generated, not recorded
 *
 * Each case is a `mocksEngine` draw plus the handful of real `setMatchUpStatus` submissions that
 * produce the state — no stored scenario file. They were found by the exit-propagation sweep and
 * then reduced with its shrinker, which took 30 random steps down to the three or four that
 * actually matter; what survives is written out here as the outcomes a scorer would enter.
 *
 * `nonRandom` is the determinism knob and is load-bearing: BYE PLACEMENT is what these cases turn
 * on, and it is decided at generation. `participantsCount` is reduced below `drawSize` for the same
 * reason — a full draw has no BYEs and none of this can arise, so a case run at
 * `participantsCount === drawSize` would pass whether the code is fixed or not. COMPASS and
 * DOUBLE_ELIMINATION are the exceptions and are deliberately kept FULL (16/16 and 8/8): there the
 * BYE is produced by the cascade rather than by the draw, which is a different route to the same
 * state — and for DOUBLE_ELIMINATION it is the only route, since a full Main generates no BYE at all
 * (`draw-positions.md` §4a).
 *
 * Six draw types, because the defect is in the shared BYE-placement chain rather than in any one
 * topology. Before this fix the sweep reported the state on 47 seeds across the two 600-seed census
 * windows, split evenly across both propagation arms.
 *
 * ## Why DOUBLE_ELIMINATION was added afterwards
 *
 * The first five cases were written against the two general 600-seed windows, which hold only ~70
 * DOUBLE_ELIMINATION seeds each — so the draw type most prone to cross-structure defects contributed
 * no case. Re-measured 2026-09-17 against the DE-only window committed later
 * (`fixtures/exit-propagation-census/sched-de.jsonl`, 563 seeds): with the correction suppressed the
 * class reproduces on **18 of 563 flag-OFF and 19 of 563 flag-ON, every one DOUBLE_ELIMINATION**,
 * against 8/6 and 15/15 on the two general windows. The case below is seed 9303124 shrunk to four
 * steps on `BYE_WON` (`shrinkIssue`, `ISSUE=INVARIANT:BYE_WON`).
 */
describe('a BYE arriving into a pending propagated exit', () => {
  type Submission = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };

  const CASES: {
    name: string;
    drawType: string;
    drawSize: number;
    participantsCount: number;
    nonRandom: number;
    propagateExitStatus: boolean;
    submissions: Submission[];
  }[] = [
    {
      name: 'feed-in championship — a double default feeds a consolation slot already emptied',
      drawType: FEED_IN_CHAMPIONSHIP,
      drawSize: 16,
      participantsCount: 13,
      nonRandom: 9000118,
      propagateExitStatus: false,
      submissions: [
        { structureName: 'Main', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 1 } },
        { structureName: 'Main', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 2 } },
        { structureName: 'Consolation', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
        { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      ],
    },
    {
      name: 'curtis consolation — a double walkover behind an already-propagated walkover',
      drawType: CURTIS_CONSOLATION,
      drawSize: 16,
      participantsCount: 11,
      nonRandom: 9000151,
      propagateExitStatus: true,
      submissions: [
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 7,
          outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
        },
        {
          structureName: 'Main',
          roundNumber: 2,
          roundPosition: 1,
          outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
        },
        { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
    },
    {
      name: 'modified feed-in championship — a second-round double default at drawSize 32',
      drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
      drawSize: 32,
      participantsCount: 27,
      nonRandom: 9000200,
      propagateExitStatus: true,
      submissions: [
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 4,
          outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
        },
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 3,
          outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
        },
        { structureName: 'Main', roundNumber: 1, roundPosition: 13, outcome: { winningSide: 1 } },
        { structureName: 'Main', roundNumber: 2, roundPosition: 7, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      ],
    },
    {
      name: 'compass — a cascade-placed BYE, in a draw that generated none',
      drawType: COMPASS,
      drawSize: 16,
      participantsCount: 16,
      nonRandom: 9000384,
      propagateExitStatus: true,
      submissions: [
        { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
        { structureName: 'West', roundNumber: 1, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
    },
    {
      name: 'double elimination — a cascade-placed BYE, in a draw whose Main generates none',
      drawType: DOUBLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 8,
      nonRandom: 9303124,
      propagateExitStatus: true,
      submissions: [
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 1,
          outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
        },
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 2,
          outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
        },
        { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
        { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
    },
    {
      name: 'first-match loser consolation — a double default re-scored, then a second-round default',
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 32,
      participantsCount: 31,
      nonRandom: 9000448,
      propagateExitStatus: true,
      submissions: [
        { structureName: 'Main', roundNumber: 1, roundPosition: 16, outcome: { winningSide: 2 } },
        { structureName: 'Main', roundNumber: 1, roundPosition: 15, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
        {
          structureName: 'Main',
          roundNumber: 1,
          roundPosition: 15,
          outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
        },
        {
          structureName: 'Main',
          roundNumber: 2,
          roundPosition: 8,
          outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
        },
      ],
    },
  ];

  const drawMatchUps = (drawId: string): any[] =>
    tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];

  const byeWonViolations = (drawId: string): any[] => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    return getInvariantViolations({ matchUps: drawMatchUps(drawId), drawDefinition }).filter(
      (violation: any) => violation.rule === 'BYE_WON',
    );
  };

  it.each(CASES)('$name', ({ drawType, drawSize, participantsCount, nonRandom, propagateExitStatus, submissions }) => {
    setSubscriptions({});
    const drawId = `bye-pending-${nonRandom}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
      nonRandom,
      setState: true,
    });

    // CONTROL: the draw must exist and be unplayed, or every assertion below is about nothing.
    expect(drawMatchUps(drawId).length).toBeGreaterThan(0);
    expect(byeWonViolations(drawId)).toEqual([]);

    const offences: string[] = [];
    submissions.forEach((submission, index) => {
      const target = drawMatchUps(drawId).find(
        (matchUp: any) =>
          matchUp.structureName === submission.structureName &&
          matchUp.roundNumber === submission.roundNumber &&
          matchUp.roundPosition === submission.roundPosition,
      );
      // CONTROL: a coordinate that no longer names a matchUp would silently skip the submission
      // that produces the state, and the case would pass by doing nothing.
      expect(target, `submission ${index + 1} names no matchUp`).toBeTruthy();

      tournamentEngine.setMatchUpStatus({
        matchUpId: target.matchUpId,
        outcome: submission.outcome,
        propagateExitStatus,
        drawId,
      });

      /**
       * Checked after EVERY submission, not once at the end.
       *
       * The state is transient in most of these cases — a later submission happens to overwrite the
       * matchUp, so an end-of-run assertion sees a clean draw and passes whether the code is fixed
       * or not. Measured while writing this file: of five cases, an end-state check reproduced ONE.
       * A draw is not allowed to pass THROUGH this state on its way to a tidy one; any consumer
       * reading between two submissions sees a BYE credited with a win.
       */
      for (const violation of byeWonViolations(drawId)) {
        offences.push(`after submission ${index + 1}: ${violation.detail}`);
      }
    });

    expect(offences).toEqual([]);
  });
});
