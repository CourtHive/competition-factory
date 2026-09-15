import { findByCoord, generateDraw, playForward } from '@Tests/testHarness/exitPropagation/routeComparison';
import { getDrawDefinition, getDrawMatchUps, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DRAW_POSITION_ACTIVE } from '@Constants/errorConditionConstants';

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
