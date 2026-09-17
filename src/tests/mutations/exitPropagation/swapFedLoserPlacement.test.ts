import { findByCoord, generateDraw, playForward } from '@Tests/testHarness/exitPropagation/routeComparison';
import { clearOutcome, getDrawDefinition, getDrawMatchUps, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { getInvariantViolations } from '@Tests/testHarness/exitPropagation/invariants';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DRAW_POSITION_ACTIVE } from '@Constants/errorConditionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * A flip that makes an ELIGIBLE loser must PLACE them in the first-match consolation.
 *
 * `swapWinnerLoser` is a relabel: it exchanges two identities in every structure the flipped matchUp
 * feeds. That is sufficient wherever both identities are already present — and a `FIRST_MATCHUP`
 * link is exactly where one of them is not. When the previous loser was withheld by the link
 * condition, `directLoser` placed a BYE instead of them, so there is no assignment to relabel; both
 * lookups miss, the relabel is a no-op, and a loser the feed rule ADMITS is left out of the
 * structure that should hold them. `getDrawInconsistencies` reports it as DROPPED_PROGRESSION.
 *
 * It is the exact mirror of the ineligible-but-present defect closed in #4875(factory), which added
 * the removal direction and no placement one.
 *
 * ## The two outcomes, and why the second is not a shortfall
 *
 * A placement DISPLACES the BYE standing in the slot, and the engine refuses to clear a drawPosition
 * that is ACTIVE — one that has advanced by winning, or is paired with one that has. So:
 *
 *  - consolation slot QUIET  -> the participant is placed (the in-progress draw, and the case the
 *    census reaches: 15 of its 20 first-match-consolation seeds)
 *  - consolation slot PLAYED ON -> refused, WITHOUT MUTATING. Unwinding the consolation results to
 *    make room is the director's workflow (clear, re-score, re-enter), not something a re-score
 *    is entitled to do behind the operator's back.
 *
 * The refusal being ATOMIC is the whole point of asking before writing: the same refusal arriving
 * after `swapWinnerLoser` had applied the new result is the `ERROR_IMPLIES_NO_MUTATION` shape, and
 * it is strictly worse than either outcome it sits between.
 *
 * `participantsCount` is REDUCED on purpose throughout. A full draw has no BYEs, so the link
 * condition can never withhold a placement and none of this can arise — a test run only at
 * `participantsCount === drawSize` passes whether the code is fixed or not.
 */
describe('a flipped result reconciles a newly eligible fed loser', () => {
  const drawSize = 16;
  const seed = 7001;

  const consolationHolds = (drawId: string, participantId: string): boolean => {
    const consolation = getDrawDefinition(drawId).structures?.find(
      (structure: any) => structure.structureName === 'Consolation',
    );
    return (consolation?.positionAssignments ?? []).some(
      (assignment: any) => assignment.participantId === participantId,
    );
  };

  const droppedProgressions = (drawId: string): any[] => {
    const drawDefinition = getDrawDefinition(drawId);
    const result: any = getDrawInconsistencies({ drawDefinition, drawId });
    return (result.inconsistencies ?? []).filter((inc: any) => inc.issueType === 'DROPPED_PROGRESSION');
  };

  const flip = (drawId: string, target: any) =>
    tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: target.winningSide === 1 ? 2 : 1 },
      allowChangePropagation: true,
      matchUpId: target.matchUpId,
      drawId,
    });

  /**
   * Play the MAIN structure only, and only as far as the target round.
   *
   * `playForward` plays the whole draw including the consolation, which leaves every fed slot
   * already advanced — so a draw prepared that way can only ever exercise the refusal. Stopping at
   * the main draw is what produces the quiet slot the placement needs, and it is also the realistic
   * state: a consolation is not usually finished before a main-draw result is corrected.
   */
  const playMainThrough = (drawId: string, throughRoundNumber: number): void => {
    let guard = 0;
    while (guard++ < 100) {
      const playable = getDrawMatchUps(drawId)
        .filter(
          (matchUp: any) =>
            matchUp.structureName === 'Main' &&
            matchUp.roundNumber <= throughRoundNumber &&
            !matchUp.winningSide &&
            matchUp.roundPosition &&
            (matchUp.sides ?? []).filter((side: any) => side?.participantId).length === 2,
        )
        .sort((a: any, b: any) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition);
      if (!playable.length) break;
      if (
        tournamentEngine.setMatchUpStatus({ outcome: { winningSide: 1 }, matchUpId: playable[0].matchUpId, drawId })
          ?.error
      )
        break;
    }
  };

  it('places the new loser into a quiet slot the link condition had withheld', () => {
    const drawId = 'swap-fed-loser-quiet';
    generateDraw(FIRST_MATCH_LOSER_CONSOLATION, drawId, drawSize, seed, 13);
    playMainThrough(drawId, 2);

    const target = findByCoord(drawId, { structureName: 'Main', roundNumber: 2, roundPosition: 1 });
    expect(target?.winningSide).toBeTruthy(); // control: the flip needs a decided matchUp

    const newLoserParticipantId = target.sides.find(
      (side: any) => side.sideNumber === target.winningSide,
    )?.participantId;
    expect(newLoserParticipantId).toBeTruthy();
    // control: absent before the flip — they had not lost yet, so nothing has fed them anywhere
    expect(consolationHolds(drawId, newLoserParticipantId)).toEqual(false);
    // control: the defect needs a WITHHELD placement — the slot holds a BYE, not the previous loser
    expect(droppedProgressions(drawId)).toEqual([]);

    const result: any = flip(drawId, target);

    expect(result.error).toBeUndefined();
    expect(consolationHolds(drawId, newLoserParticipantId)).toEqual(true);
    expect(droppedProgressions(drawId)).toEqual([]);
  });

  it('refuses WITHOUT MUTATING when the slot has already played on', () => {
    const drawId = 'swap-fed-loser-active';
    generateDraw(FIRST_MATCH_LOSER_CONSOLATION, drawId, drawSize, seed, 13);
    playForward(drawId); // the whole draw, consolation included — every fed slot has advanced

    const target = findByCoord(drawId, { structureName: 'Main', roundNumber: 2, roundPosition: 1 });
    expect(target?.winningSide).toBeTruthy();

    const before = hash(getDrawDefinition(drawId));
    const result: any = flip(drawId, target);
    const after = hash(getDrawDefinition(drawId));

    expect(result.error).toEqual(DRAW_POSITION_ACTIVE);
    expect(after).toEqual(before);
  });

  it('leaves no dropped progression behind for any flip in the draw', () => {
    const drawId = 'swap-fed-loser-sweep';
    generateDraw(FIRST_MATCH_LOSER_CONSOLATION, drawId, drawSize, seed, 13);
    const playOrder = playForward(drawId);
    expect(playOrder.length).toBeGreaterThan(0); // control: an unplayed draw would flip nothing

    const offenders: string[] = [];
    let flipsApplied = 0;
    for (const coord of playOrder) {
      // Each flip is measured on its OWN draw. Flipping cumulatively compounds into states no
      // legitimate sequence produces, which reports failures about the schedule rather than the
      // property.
      generateDraw(FIRST_MATCH_LOSER_CONSOLATION, drawId, drawSize, seed, 13);
      playForward(drawId);
      const target = findByCoord(drawId, coord);
      if (!target?.winningSide) continue;
      const before = hash(getDrawDefinition(drawId));
      const result: any = flip(drawId, target);
      const label = `${coord.structureName}|${coord.roundNumber}|${coord.roundPosition}`;
      if (result.error) {
        // A refusal is an allowed outcome; a refusal that WROTE is not.
        if (hash(getDrawDefinition(drawId)) !== before) offenders.push(`${label} mutated-then-refused`);
        continue;
      }
      flipsApplied++;
      if (droppedProgressions(drawId).length) offenders.push(`${label} dropped-progression`);
    }

    expect(flipsApplied).toBeGreaterThan(0); // control: all-refused would pass vacuously
    expect(offenders).toEqual([]);
  });
});

/**
 * A BYE cannot be recorded as having WON — not even for an instant, and not anywhere downstream.
 *
 * When a flip makes the fed loser INELIGIBLE, they must leave the consolation. Emptying their
 * assignment is only half of that: they may have played on from it, and those results then stand
 * over a drawPosition that now holds a BYE. `getDrawInconsistencies` rates the result clean and the
 * census never scored it, which is how `Consolation|2|3` came to sit at COMPLETED with winningSide 1
 * over sides `[BYE, participant]` — and how the BYE went on to "win" `Consolation|3|2` too.
 *
 * The rule is the engine's own. `getExitWinningSide`: *"A BYE draw position can never be the winning
 * side."*
 *
 * Asserted through `getInvariantViolations` rather than by hand so the production behaviour and the
 * sweep instrument cannot drift apart — the same rule that fails this test is the one the census and
 * the 480k sweep report.
 */
describe('a BYE is never recorded as a winner', () => {
  const drawSize = 16;
  const participantsCount = 13;
  const seed = 7001;

  const setup = (drawId: string) => {
    generateDraw(FIRST_MATCH_LOSER_CONSOLATION, drawId, drawSize, seed, participantsCount);
    return playForward(drawId);
  };

  const residueViolations = (drawId: string): any[] =>
    getInvariantViolations({
      matchUps: getDrawMatchUps(drawId),
      drawDefinition: getDrawDefinition(drawId),
    }).filter((violation: any) =>
      ['BYE_WON', 'UNDECIDED_WITH_WINNING_SIDE', 'UNDECIDED_WITH_SCORE'].includes(violation.rule),
    );

  /**
   * CA, 2026-09-17: a flip is refused when propagation cannot proceed with equivalence. The flip makes
   * the consolation loser INELIGIBLE, so the results they recorded there cannot be inherited by the
   * new loser — and they were played. Until then the flip succeeded and withdrew those results; it is
   * now refused, over an untouched draw. With nothing played there, see the next case.
   */
  it('refuses a flip that would have to withdraw what an ineligible loser won here', () => {
    const drawId = 'bye-never-wins';
    setup(drawId);
    const coord = { structureName: 'Main', roundNumber: 2, roundPosition: 3 };
    const target = findByCoord(drawId, coord);
    expect(target?.winningSide).toBeTruthy(); // control: the flip needs a decided matchUp

    // control: the consolation matchUp fed by this one is DECIDED before the flip
    const fedBefore = findByCoord(drawId, { structureName: 'Consolation', roundNumber: 2, roundPosition: 3 });
    expect(fedBefore?.winningSide).toBeTruthy();

    const before = hash(getDrawDefinition(drawId));
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: target.winningSide === 1 ? 2 : 1 },
      allowChangePropagation: true,
      matchUpId: target.matchUpId,
      drawId,
    });
    expect(result.error).toEqual(DRAW_POSITION_ACTIVE);
    expect(hash(getDrawDefinition(drawId))).toEqual(before);
    expect(residueViolations(drawId)).toEqual([]);
  });

  it('with nothing played in the consolation, the same flip proceeds and the slot reverts to a BYE', () => {
    const drawId = 'bye-never-wins-unplayed';
    setup(drawId);
    const consolation = (roundNumber: number, roundPosition: number) =>
      findByCoord(drawId, { structureName: 'Consolation', roundNumber, roundPosition });
    // clear the consolation, latest round first, so nothing downstream of the fed slot is active
    const decided = getDrawMatchUps(drawId)
      .filter((matchUp: any) => matchUp.structureName === 'Consolation' && matchUp.winningSide)
      .sort((x: any, y: any) => y.roundNumber - x.roundNumber);
    for (const matchUp of decided) {
      const cleared: any = tournamentEngine.setMatchUpStatus({
        outcome: clearOutcome,
        matchUpId: matchUp.matchUpId,
        drawId,
      });
      expect(cleared.error, `clearing Consolation|${matchUp.roundNumber}|${matchUp.roundPosition}`).toBeUndefined();
    }
    expect(consolation(2, 3)?.winningSide).toBeUndefined(); // control

    const target = findByCoord(drawId, { structureName: 'Main', roundNumber: 2, roundPosition: 3 });
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: target.winningSide === 1 ? 2 : 1 },
      allowChangePropagation: true,
      matchUpId: target.matchUpId,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(consolation(2, 3).matchUpStatus).toEqual(BYE);
    expect(residueViolations(drawId)).toEqual([]);
  });

  it('leaves no BYE holding a result after any flip in the draw', () => {
    const drawId = 'bye-never-wins-sweep';
    const playOrder = setup(drawId);
    expect(playOrder.length).toBeGreaterThan(0); // control: an unplayed draw would flip nothing

    const offenders: string[] = [];
    let flipsApplied = 0;
    for (const coord of playOrder) {
      setup(drawId); // each flip on its own draw — cumulative flips compound into unreachable states
      const target = findByCoord(drawId, coord);
      if (!target?.winningSide) continue;
      const result: any = tournamentEngine.setMatchUpStatus({
        outcome: { winningSide: target.winningSide === 1 ? 2 : 1 },
        allowChangePropagation: true,
        matchUpId: target.matchUpId,
        drawId,
      });
      if (result.error) continue;
      flipsApplied++;
      for (const violation of residueViolations(drawId)) {
        offenders.push(`${coord.structureName}|${coord.roundNumber}|${coord.roundPosition} ${violation.rule}`);
      }
    }

    expect(flipsApplied).toBeGreaterThan(0); // control: all-refused would pass vacuously
    expect(offenders).toEqual([]);
  });
});
