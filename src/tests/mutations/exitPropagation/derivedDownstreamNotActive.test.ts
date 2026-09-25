import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A DERIVED DOWNSTREAM RESULT MUST NOT BLOCK UNWINDING THE THING THAT DERIVED IT.
 *
 * CA, 2026-09-25, unable to clear a `DOUBLE_WALKOVER` in TMX: *"we can see that it is an advanced
 * propagated WALKOVER where there is no participant that walkedover so the fact that there is a
 * winningSide there and not one further downstream means it should be clearable"* — and, on the
 * mechanism: *"I don't think `{ allowChangePropagation: true }` should be relevant in the case of
 * clearing a DOUBLE_WALKOVER whose downstream produced/propagated/advanced WALKOVERs are not genuinely
 * blocked by genuinely active (as opposed to advanced active) positions."*
 *
 * So the distinction is **genuinely active** — somebody PLAYED there — versus **advanced active** —
 * propagation moved somebody there. A flag is not the mechanism.
 *
 * `isActiveDownstream` already draws exactly that distinction, and already states the principle:
 * *"a status blocks only when it was earned at this matchUp, never when it was propagated into it."*
 * It applies it on the LOSER path, via `isPropagatedExit`:
 *
 * ```ts
 * const loserMatchUpExit = isLoserMatchUpWO && !propagatedLoserParticipant && isPropagatedExit({ matchUp: loserMatchUp });
 * ```
 *
 * On the WINNER path it does not. `winnerSideResolved` asks only whether a participant OCCUPIES the
 * winning side, so a walkover the cascade produced blocks the unwind of the cascade that produced it.
 */
describe('a propagated exit downstream does not make the source unclearable', () => {
  const drawId = 'derived-downstream';

  const find = (key: string) => {
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

  const build = () => {
    setSubscriptions({});
    const generated: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId }],
      nonRandom: 20223109,
      setState: true,
    });
    expect(generated.drawIds).toContain(drawId);

    const enter = (key: string, outcome: any) => {
      const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: find(key).matchUpId, outcome, drawId });
      expect(result.error, key).toBeUndefined();
    };
    enter('East|1|2', { matchUpStatus: DOUBLE_WALKOVER });
    for (const key of ['East|1|3', 'East|1|4']) {
      enter(key, generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome);
    }
    enter('West|1|2', generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome);
  };

  // the fixture must be the shape the argument rests on, or the assertions below prove nothing:
  // West|2|1 must be a DERIVED walkover whose winning side holds a real participant
  it('sets up a derived walkover whose winning side is occupied', () => {
    build();
    const west21 = find('West|2|1');
    expect(west21.matchUpStatus).toEqual(WALKOVER);
    expect(west21.winningSide).toBeDefined();
    const winner = (west21.sides ?? []).find((side: any) => side.sideNumber === west21.winningSide);
    expect(winner?.participantId).toBeDefined();
    // and it is DERIVED — provenance records the exit that was carried into it
    expect(Object.keys(west21.sideExitProvenance ?? {}).length).toBeGreaterThan(0);
    // nothing beyond it has been decided
    expect(find('West|3|1').winningSide).toBeUndefined();
  });

  it('clears the DOUBLE_WALKOVER, because everything downstream of it is derived', () => {
    build();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { score: { sets: [] }, matchUpStatus: TO_BE_PLAYED },
      matchUpId: find('East|1|2').matchUpId,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(find('East|1|2').matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  /**
   * `allowChangePropagation` is NOT the mechanism — CA ruled that explicitly. The clear must succeed
   * without it, so this asserts the same thing with the flag absent, which the test above already
   * does, AND that passing it changes nothing.
   */
  it('does not depend on allowChangePropagation', () => {
    build();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { score: { sets: [] }, matchUpStatus: TO_BE_PLAYED },
      matchUpId: find('East|1|2').matchUpId,
      allowChangePropagation: true,
      drawId,
    });
    expect(result.error).toBeUndefined();
  });

  /**
   * ⚠️ THE BLOCKER, and the reason this branch is parked rather than opened as a PR.
   *
   * Permitting the clear is correct, but the unwind that follows it is incomplete. The carried
   * walkover at `West|2|1` is reset — status and codes both — yet the onward advancement its winner
   * made into `West|3|1` is NOT taken back. `West|3|1` keeps `drawPositions: [3]` and the
   * participant, so somebody sits in West round 3 having won nothing.
   *
   * Measured, and it is NOT a pre-existing dev defect: clearing `West|2|1` DIRECTLY on unmodified
   * `dev` unwinds correctly — `West|3|1` returns to `drawPositions: undefined` with no occupant. The
   * leak appears only when the clear happens at the SOURCE, which is the path this change opens.
   *
   * Located: `removeDoubleExit`'s `removeLinkedWinner` opens `if (!winnerTargetLink) return`, so it
   * takes back ACROSS-link advancement only. `West|2|1 -> West|3|1` is intra-structure, which that
   * function's own docblock assigns to `conditionallyRemoveDrawPosition`'s same-structure branch — and
   * that branch is not reached for a carried walkover during a source unwind.
   *
   * `getDrawInconsistencies` reports `valid: true` throughout, so nothing else catches it. This test
   * is therefore the gate: it must pass before the guard change ships.
   */
  it('unwinds the onward advancement when the clear is permitted', () => {
    build();
    const before = find('West|3|1');
    // control: the advancement must actually have happened, or there is nothing to unwind
    expect((before.sides ?? []).filter((side: any) => side.participantId && !side.bye)).toHaveLength(1);

    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { score: { sets: [] }, matchUpStatus: TO_BE_PLAYED },
      matchUpId: find('East|1|2').matchUpId,
      drawId,
    });
    expect(result.error).toBeUndefined();

    // West|2|1 no longer has a winner, so nobody may still be advanced beyond it
    expect(find('West|2|1').winningSide).toBeUndefined();
    const after = find('West|3|1');
    expect((after.sides ?? []).filter((side: any) => side.participantId && !side.bye)).toHaveLength(0);
  });

  /**
   * THE GUARD MUST STILL REFUSE when something downstream was genuinely PLAYED. Without this the
   * change is indistinguishable from deleting the protection: `West|3|1` is the matchUp the derived
   * walkover feeds, and once two participants have contested it, unwinding the source would strip a
   * real result.
   */
  it('still refuses when a downstream matchUp has genuinely been played', () => {
    build();

    // Fill West's lower half so West|3|1 acquires a SECOND participant and can actually be played.
    // West|1|3 is fed by East|1|5 and East|1|6 losers; West|1|4 is a BYE fed by East|1|7's loser.
    for (const key of ['East|1|5', 'East|1|6', 'East|1|7']) {
      const result: any = tournamentEngine.setMatchUpStatus({
        outcome: generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome,
        matchUpId: find(key).matchUpId,
        drawId,
      });
      expect(result.error, key).toBeUndefined();
    }
    for (const key of ['West|1|3', 'West|2|2']) {
      const result: any = tournamentEngine.setMatchUpStatus({
        outcome: generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome,
        matchUpId: find(key).matchUpId,
        drawId,
      });
      expect(result.error, key).toBeUndefined();
    }

    // CONTROL: West|3|1 must now hold TWO participants, or "genuinely played" cannot be constructed
    const west31 = find('West|3|1');
    expect((west31.sides ?? []).filter((side: any) => side.participantId && !side.bye)).toHaveLength(2);

    const played: any = tournamentEngine.setMatchUpStatus({
      outcome: generateOutcomeFromScoreString({ scoreString: '6-4 6-4', winningSide: 1 }).outcome,
      matchUpId: west31.matchUpId,
      drawId,
    });
    expect(played.error).toBeUndefined();
    expect(find('West|3|1').winningSide).toEqual(1);

    // NOW the unwind must be refused: a real contested result sits downstream of the exit
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { score: { sets: [] }, matchUpStatus: TO_BE_PLAYED },
      matchUpId: find('East|1|2').matchUpId,
      drawId,
    });
    expect(result.error).toBeDefined();
  });
});
