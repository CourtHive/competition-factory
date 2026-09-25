import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A PRODUCED EXIT MUST CARRY WHEN THE OPPONENT IS ALREADY THERE.
 *
 * `carryExitOnward`'s occupancy guard asked whether the target held ANY participant:
 *
 * ```ts
 * if (nextWinnerMatchUp.sides?.some((side) => side.participantId) || isAnyExit(...)) return SUCCESS;
 * ```
 *
 * It is side-blind. The participant it finds is routinely on the side OPPOSITE the arriving exit —
 * they advanced from the previous round of the same structure and have nothing to do with the slot
 * the exit is travelling to. `arrivalSideNumber` is computed eleven lines above it and was never
 * consulted, and this is the only refusal in that function that logs no `decision`, so every trace of
 * it goes silent after the stamp.
 *
 * `progressExitStatus` RULE 2 states the intended behaviour: *the side WITHOUT the exit wins, and it
 * wins even while still empty, because it is the side that will receive the eventual opponent.* Here
 * that side is not even empty — the opponent has already arrived.
 *
 * CA, 2026-09-25, on COMPASS 16/14: *"I believe that an advanced propagated WALKOVER not carrying a
 * participant encountering a participant at WEST|2|1 SHOULD advance the encountered participant to
 * WEST|3|1, and that this is a bug or an incomplete bit of logic."*
 *
 * ## Why the winner is awarded HERE and not left to the arrival
 *
 * `carryExitOnward` otherwise writes `winningSide: undefined` deliberately (CA, 2026-09-20), on the
 * stated understanding that *"the winningSide will display the checkmark once a participant
 * arrives."* That reasoning has an unstated precondition — that the opponent has NOT yet arrived.
 * When they are already in place there is no future arrival to resolve anything, and leaving it
 * unresolved produces a `WALKOVER` with a participant and no winner: a matchUp that is still stuck
 * AND invisible to `getStructureInconsistencies`, whose stall test requires `TO_BE_PLAYED`. So the
 * already-arrived case is awarded at carry time and the not-yet-arrived case is left alone.
 */
describe('a produced exit carries when the opponent has already arrived', () => {
  const occupants = (matchUp: any) => (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);

  const find = (drawId: string, key: string) => {
    const [structureName, roundNumber, roundPosition] = key.split('|');
    const result: any = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
    const matchUp = result.matchUps.find(
      (candidate: any) =>
        candidate.structureName === structureName &&
        candidate.roundNumber === Number(roundNumber) &&
        candidate.roundPosition === Number(roundPosition),
    );
    expect(matchUp, key).toBeDefined();
    return matchUp;
  };

  const score = (drawId: string, key: string) => {
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome,
      matchUpId: find(drawId, key).matchUpId,
      drawId,
    });
    expect(result.error, key).toBeUndefined();
  };

  const doubleWalkover = (drawId: string, key: string) => {
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: find(drawId, key).matchUpId,
      drawId,
    });
    expect(result.error, key).toBeUndefined();
  };

  /**
   * CA's reproduction: a fresh COMPASS 16/14 with the DOUBLE_WALKOVER entered LAST, so `West|2|1`
   * already holds the `West|1|2` winner on drawPosition 3 while the exit is travelling to
   * drawPosition 2.
   */
  it('COMPASS 16/14 — carries into a target whose OTHER side is occupied, and advances that participant', () => {
    const drawId = 'side-blind-compass';
    setSubscriptions({});
    const generated: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId }],
      nonRandom: 20223109,
      setState: true,
    });
    expect(generated.drawIds).toContain(drawId);

    for (const key of ['East|1|3', 'East|1|4']) score(drawId, key);
    score(drawId, 'West|1|2');

    // the fixture must be the shape the assertion depends on: occupied on ONE side only, and it must
    // be the side the exit is NOT arriving at
    const before = find(drawId, 'West|2|1');
    expect(before.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(before.drawPositions).toEqual([2, 3]);
    expect(occupants(before)).toHaveLength(1);
    expect(occupants(before)[0].sideNumber).toEqual(2);
    const waiting = occupants(before)[0].participantId;

    doubleWalkover(drawId, 'East|1|2');

    const after = find(drawId, 'West|2|1');
    expect(after.matchUpStatus).toEqual(WALKOVER);
    // RULE 2 — the side WITHOUT the exit wins
    expect(after.winningSide).toEqual(2);

    // and they are advanced onward rather than left sitting in a decided matchUp
    const next = find(drawId, 'West|3|1');
    expect(occupants(next).map((s: any) => s.participantId)).toContain(waiting);
  });

  /** The same guard reached from the other direction: OLYMPIC 8/6 with the opponent advanced first. */
  it('OLYMPIC 8/6 — reaches the same state with the opponent advanced FIRST', () => {
    const drawId = 'side-blind-olympic';
    setSubscriptions({});
    const generated: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: OLYMPIC, drawSize: 8, participantsCount: 6 }],
      nonRandom: 1,
      setState: true,
    });
    expect(generated.drawIds).toContain(drawId);

    score(drawId, 'East|1|3');
    doubleWalkover(drawId, 'East|1|2');

    const west21 = find(drawId, 'West|2|1');
    expect(west21.matchUpStatus).toEqual(WALKOVER);
    expect(west21.winningSide).toEqual(2);
  });

  /**
   * THE NOT-YET-ARRIVED CASE MUST STAY UNRESOLVED. Guards the narrowing above from over-reaching: with
   * the exit entered FIRST the opponent has not arrived, and `carryExitOnward` must still decline to
   * award a winner so the arrival mechanism decides it.
   */
  it('OLYMPIC 8/6 — awards nobody when the opponent has NOT yet arrived', () => {
    const drawId = 'side-blind-olympic-pending';
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: OLYMPIC, drawSize: 8, participantsCount: 6 }],
      nonRandom: 1,
      setState: true,
    });

    doubleWalkover(drawId, 'East|1|2');

    const west21 = find(drawId, 'West|2|1');
    expect(west21.matchUpStatus).toEqual(WALKOVER);
    expect(west21.winningSide).toBeUndefined();
    expect(occupants(west21)).toHaveLength(0);
  });

  /**
   * ORDER INDEPENDENCE, which is the property this whole surface kept failing.
   *
   * Entering the exit FIRST and entering it LAST must reach the same draw. Asserted on the MATERIAL
   * facts — status, winner, who occupies which side, and who advanced — rather than on a deep equality
   * of the stored objects, because two REPRESENTATIONAL differences remain and neither is this fix's
   * business:
   *
   *  - `matchUpStatusCodes` come back in object form down the cascade path and in string form down the
   *    arrival path (`["WALKOVER"]`), so one draw can hold both shapes. Measured in CA's own TMX
   *    export, where `East|2|1` carries objects and `West|2|1` carries a string.
   *  - a lone drawPosition is `[3]` on one path and `[3, null]` on the other.
   *
   * Pinning those here would pin the inconsistency. They are recorded as separate findings; this test
   * guards the behaviour.
   */
  it('reaches the same draw whether the exit is entered first or last', () => {
    const material = (exitLast: boolean) => {
      const drawId = `side-blind-order-${exitLast ? 'last' : 'first'}`;
      setSubscriptions({});
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId }],
        nonRandom: 20223109,
        setState: true,
      });
      const rest = () => {
        for (const key of ['East|1|3', 'East|1|4']) score(drawId, key);
        score(drawId, 'West|1|2');
      };
      if (exitLast) {
        rest();
        doubleWalkover(drawId, 'East|1|2');
      } else {
        doubleWalkover(drawId, 'East|1|2');
        rest();
      }
      return ['West|1|1', 'West|2|1', 'West|3|1', 'Southwest|1|1'].map((key) => {
        const matchUp = find(drawId, key);
        return {
          key,
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide ?? null,
          occupants: occupants(matchUp).map((side: any) => `s${side.sideNumber}@dp${side.drawPosition}`),
        };
      });
    };

    const exitLast = material(true);
    const exitFirst = material(false);
    // control: the comparison must be over something non-trivial
    expect(exitLast).toHaveLength(4);
    expect(exitLast.some((row) => row.winningSide)).toEqual(true);
    expect(exitFirst).toEqual(exitLast);
  });

  it('leaves the draw internally consistent', () => {
    for (const order of ['exit-last', 'exit-first']) {
      const drawId = `side-blind-integrity-${order}`;
      setSubscriptions({});
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawId, drawType: OLYMPIC, drawSize: 8, participantsCount: 6 }],
        nonRandom: 1,
        setState: true,
      });
      if (order === 'exit-last') {
        score(drawId, 'East|1|3');
        doubleWalkover(drawId, 'East|1|2');
      } else {
        doubleWalkover(drawId, 'East|1|2');
        score(drawId, 'East|1|3');
      }
      const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
      expect(integrity.inconsistencies, order).toEqual([]);
    }
  });
});
