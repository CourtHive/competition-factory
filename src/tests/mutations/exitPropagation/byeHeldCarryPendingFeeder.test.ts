import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A produced exit must carry past a BYE-held loser target when the OPPONENT'S FEEDER IS STILL
 * PENDING.
 *
 * CA, 2026-09-24, driving OLYMPIC 8 with 6 participants in TMX: *"the produced WALKOVER propagates
 * to WEST|1|1 and encounters a BYE and SHOULD then propagate to WEST|2|1, but it does not."*
 *
 * At `nonRandom: 1` the draw places East BYEs at drawPositions 2 and 7, West BYEs at 1 and 4:
 *
 * ```text
 * West 1|1  BYE  dps=[1,2]  [s1:BYE@1  s2:-@2]   <- dp2 is where East|1|2's loser would arrive
 * West 1|2  BYE  dps=[3,4]  [s1:-@3    s2:BYE@4] <- dp3 is where East|1|3's loser arrives
 * West 2|1  TO_BE_PLAYED  dps=[2,3]
 * ```
 *
 * A `DOUBLE_WALKOVER` at `East|1|2` produces no loser, so West dp2 can never fill. The exit IS
 * recorded on `West|1|1` by `stampExitOnByeHeldLoserTarget` and then has to keep travelling.
 *
 * ## Why it did not
 *
 * `opponentFeederCanDeliver` asked whether `West|2|1`'s other feeder — `West|1|2` — could still
 * deliver, and answered no: it holds no participant and its `matchUpStatus` IS `BYE`. But that
 * status is a fact about drawPosition 4 being a draw BYE, NOT about the matchUp being finished:
 * drawPosition 3 is unassigned and still awaiting `East|1|3`'s loser. It is PENDING, and it does
 * deliver two steps later.
 *
 * The predicate conflated "can never deliver" with "has not delivered yet" — the same conflation
 * recorded at `directLoser.ts`' `if (!loserParticipantId) return SUCCESS` and at the centre of the
 * `STALLED_POSITION` work, where "undecided with one participant" describes both a stall and a
 * legitimately pending matchUp.
 *
 * ## What this file asserts, and what it deliberately does not
 *
 * `carryExitOnward` never awards a `winningSide` (CA, 2026-09-20), on the understanding that the
 * side is read off the arriving drawPosition once the opponent's match is played. **Measured
 * 2026-09-24: for this shape it never is** — so the carry is asserted by the STATUS and the
 * provenance codes, and the two behaviours that remain broken are declared as `it.todo` with their
 * causes rather than asserted as if they worked. See the notes on each.
 */
describe('a produced exit carries past a BYE-held target when the opponent feeder is pending', () => {
  const generate = (drawId: string) => {
    setSubscriptions({});
    const result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: OLYMPIC, drawSize: 8, participantsCount: 6 }],
      nonRandom: 1,
      setState: true,
    });
    expect(result.drawIds).toContain(drawId);
  };

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

  const doubleWalkover = (drawId: string) => {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(drawId, 'East|1|2').matchUpId,
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      drawId,
    });
    expect(result.error).toBeUndefined();
  };

  const playEast13 = (drawId: string) => {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(drawId, 'East|1|3').matchUpId,
      outcome: generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
  };

  // the fixture must be the shape the scenario describes, or the assertions below prove nothing
  it('places the BYEs the scenario depends on', () => {
    const drawId = 'carry-pending-fixture';
    generate(drawId);
    const west11 = find(drawId, 'West|1|1');
    const west12 = find(drawId, 'West|1|2');
    expect(west11.drawPositions).toEqual([1, 2]);
    expect(west12.drawPositions).toEqual([3, 4]);
    expect((west11.sides ?? []).filter((side: any) => side.bye).map((side: any) => side.drawPosition)).toEqual([1]);
    expect((west12.sides ?? []).filter((side: any) => side.bye).map((side: any) => side.drawPosition)).toEqual([4]);
    expect(find(drawId, 'West|2|1').drawPositions).toEqual([2, 3]);
  });

  it('carries the exit to West|2|1 with the exit entered FIRST', () => {
    const drawId = 'carry-pending-exit-first';
    generate(drawId);
    doubleWalkover(drawId);

    // the intermediate BYE still records where the exit went, and stays a BYE
    const west11 = find(drawId, 'West|1|1');
    expect(west11.matchUpStatus).toEqual(BYE);
    expect(west11.winningSide).toBeUndefined();

    // THE FIX: the exit does not stop at the BYE
    const west21 = find(drawId, 'West|2|1');
    expect(west21.matchUpStatus).toEqual(WALKOVER);
    expect(west21.matchUpStatusCodes?.length).toBeGreaterThan(0);

    // the exit survives the opponent's arrival rather than being reverted to TO_BE_PLAYED
    playEast13(drawId);
    const settled = find(drawId, 'West|2|1');
    expect(settled.matchUpStatus).toEqual(WALKOVER);
    expect((settled.sides ?? []).filter((side: any) => side.participantId)).toHaveLength(1);
  });

  /**
   * REMAINING GAP 1 — the deferred winner is never awarded.
   *
   * `carryExitOnward` writes `winningSide: undefined` deliberately (CA, 2026-09-20: *"that is
   * unnecessary if the winningSide will display the checkmark once a participant arrives"*). For
   * this shape it never arrives. `advanceWinner` in `assignDrawPositionBye.ts` has two resolution
   * branches and both miss it: `arrivalIntoProvenanceOnlyExit` requires
   * `!existingDrawPositions?.length`, and `West|2|1` carries `dps=[2,3]` from generation; the
   * sibling branch requires a truthy `winningSide`, which a carried exit never has. Dropping that
   * requirement alone was measured to change nothing, so the arrival path needs its own diagnosis.
   */
  it.todo('awards the walkover to the arriving participant — West|2|1 winningSide 2');

  /**
   * REMAINING GAP 2 — the other entry order is blocked by a different guard.
   *
   * With `East|1|3` played first, the participant is already at drawPosition 3 when the exit
   * arrives, and `carryExitOnward`'s side-blind participant check
   * (`doubleExitAdvancement.ts:1437`) refuses although the participant sits on the side OPPOSITE the
   * arriving exit. That is the separately-tracked Step 2 defect; narrowing it is known to be
   * insufficient on its own, and delegating to `conditionallyAdvanceDrawPosition` is the documented
   * parity answer.
   */
  it.todo('reaches the same state with the opponent advanced FIRST');

  // A REGRESSION GUARD, NOT EVIDENCE OF THE FIX: this passed before the change too, because
  // `getDrawInconsistencies` reported the un-carried state as valid. It is here to catch the fix
  // introducing an inconsistency, which is the realistic hazard of writing an exit somewhere new.
  it('does not make the draw inconsistent in either order', () => {
    for (const order of ['exit-first', 'opponent-first']) {
      const drawId = `carry-pending-integrity-${order}`;
      generate(drawId);
      if (order === 'exit-first') {
        doubleWalkover(drawId);
        playEast13(drawId);
      } else {
        playEast13(drawId);
        doubleWalkover(drawId);
      }
      const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
      expect(integrity.inconsistencies, order).toEqual([]);
    }
  });
});
