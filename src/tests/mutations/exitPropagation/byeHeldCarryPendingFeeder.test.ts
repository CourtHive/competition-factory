import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, OLYMPIC } from '@Constants/drawDefinitionConstants';

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
  it('awards the walkover to the arriving participant, and advances them', () => {
    const drawId = 'carry-pending-award';
    generate(drawId);
    doubleWalkover(drawId);

    // the carry has happened and is deliberately unresolved — nobody has arrived yet
    const pending = find(drawId, 'West|2|1');
    expect(pending.matchUpStatus).toEqual(WALKOVER);
    expect(pending.winningSide).toBeUndefined();

    playEast13(drawId);

    // the arrival resolves it: the side that did NOT carry the exit wins
    const settled = find(drawId, 'West|2|1');
    expect(settled.matchUpStatus).toEqual(WALKOVER);
    expect(settled.winningSide).toEqual(2);

    // the winner is the participant who arrived, not the empty exiting side
    const winnerId = (settled.sides ?? []).find((side: any) => side.sideNumber === settled.winningSide)?.participantId;
    expect(winnerId).toBeDefined();

    // NB: `West|2|1` is the FINAL of West in OLYMPIC 8 — there is no `West|3|1` to advance into, so
    // onward advancement is asserted on COMPASS 16/14 below, which has the extra round.
  });

  /**
   * The same resolution on a draw with a round AFTER the resolved matchUp, so the onward advancement
   * is observable. COMPASS 16/14 is CA's own reproduction; here the exit is entered FIRST and the
   * opponent arrives later, which is the gap-1 order.
   */
  it('COMPASS 16/14 — the resolved winner advances onward', () => {
    const drawId = 'carry-pending-compass';
    setSubscriptions({});
    const generated: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId }],
      nonRandom: 20223109,
      setState: true,
    });
    expect(generated.drawIds).toContain(drawId);

    const enter = (key: string, outcome: any) => {
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: find(drawId, key).matchUpId,
        outcome,
        drawId,
      });
      expect(result.error, key).toBeUndefined();
    };

    enter('East|1|2', { matchUpStatus: DOUBLE_WALKOVER });
    for (const key of ['East|1|3', 'East|1|4']) {
      enter(key, generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome);
    }
    enter('West|1|2', generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome);

    const settled = find(drawId, 'West|2|1');
    expect(settled.matchUpStatus).toEqual(WALKOVER);
    expect(settled.winningSide).toBeDefined();
    const winnerId = (settled.sides ?? []).find((side: any) => side.sideNumber === settled.winningSide)?.participantId;
    expect(winnerId).toBeDefined();

    const next = find(drawId, 'West|3|1');
    expect((next.sides ?? []).map((side: any) => side.participantId)).toContain(winnerId);
  });

  // The reversed entry order — the opponent already in place when the exit arrives — was the
  // separately-tracked side-blind guard at `doubleExitAdvancement.ts:1437`. It is fixed, and asserted
  // in `sideBlindExitCarry.test.ts` rather than duplicated here.

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
