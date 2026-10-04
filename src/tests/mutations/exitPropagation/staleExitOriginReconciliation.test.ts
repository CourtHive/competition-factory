import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * Punch-list **P40**: a carried exit whose ORIGIN has stopped being a double exit and now delivers a
 * winner is no longer describing anything. `reconcileStaleExitOrigins` withdraws it at the end of the
 * mutation, which is the only point at which the question can be answered — see its docblock for the
 * two corrections whose timings pull in opposite directions.
 *
 * Both scenarios here are shrunk census reproductions and they are a MATCHED PAIR: the same rule must
 * withdraw in the first and retain in the second. Any implementation that gets one right by looking at
 * the source's winningSide alone, or by looking at its occupancy before the mutation settles, fails the
 * other. Three did.
 */
describe('a carried exit is withdrawn when its origin stops being a double exit and delivers a winner', () => {
  const drawId = 'stale-origin';
  const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
  const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const find = (k: string) => matchUps().find((m: any) => key(m) === k);

  function play(steps: [string, any][], { participantsCount, nonRandom }: any) {
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount, drawId }],
      setState: true,
      nonRandom,
    });
    for (const [k, outcome] of steps) {
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: find(k).matchUpId,
        propagateExitStatus: true,
        outcome,
        drawId,
      });
      expect(result.error, k).toBeUndefined();
    }
  }

  // DE window seed 9301605. `Backdraw|4|1` is a DOUBLE_DEFAULT that loses one of its two origins when
  // the Main semifinal is re-scored; it re-derives to a DEFAULTED whose winner is REAL AND SEATED, so
  // the WALKOVER it had stamped on `Main|4|1` is void. Leaving it advanced the LOSING participant into
  // the Decider, which `getDrawInconsistencies` reports as WINNING_SIDE_ADVANCEMENT_MISMATCH.
  //
  // `Backdraw|4|1` holds a COMPACTED single drawPosition here, so this also pins
  // `getWinningSideDrawPosition` resolving a side structurally rather than by array index.
  //
  // REFUSED AT ITS SECOND STEP since CA's 2026-10-04 ruling: `Backdraw|3|1` holds one participant and a
  // seat `Main|3|1`'s loser has not reached, and a DIRECT double exit needs both seats reached (*"How can
  // three entities arrive in one matchUp which can only hold two drawPositions?"*). P40 was measured on
  // Main|2|1 ws1, Backdraw|3|1 DOUBLE_DEFAULT, Main|2|2 ws2, Main|3|1 WALKOVER ws1, Main|3|1 ws2; that
  // sequence is now unreachable, and the refusal is what is asserted. Whether a stale origin can arise from legal steps is open (OUTCOME_PIPELINE_OPEN
  // _QUESTIONS.md, F3).
  it('a re-derived origin that seats a real winner voids the exit it stamped downstream', () => {
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 4, drawId }],
      setState: true,
      nonRandom: 9301605,
    });
    const first: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find('Main|2|1').matchUpId,
      outcome: { winningSide: 1 },
      propagateExitStatus: true,
      drawId,
    });
    expect(first.error).toBeUndefined();
    const refused: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find('Backdraw|3|1').matchUpId,
      outcome: { matchUpStatus: 'DOUBLE_DEFAULT' },
      propagateExitStatus: true,
      drawId,
    });
    expect(refused.error?.code).toEqual('ERR_INVALID_MATCHUP_STATUS');
  });

  // DE window seed 9303412, the counter-case. `Backdraw|2|2` also drops one origin and also re-derives
  // to a single exit with a winningSide — but its winning seat becomes a BYE later in the same
  // mutation, so it is a PENDING exit, not an advancement, and the walkover it stamped on
  // `Backdraw|3|1` is STILL TRUE. Asking occupancy before the mutation settles withdraws it and leaves
  // the semifinal undecided with both sides filled.
  it('a re-derived origin whose winning seat becomes a BYE keeps the exit it stamped', () => {
    play(
      [
        ['Main|1|3', { winningSide: 2 }],
        ['Main|2|2', { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Main|1|2', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
        ['Main|2|2', { matchUpStatus: 'DOUBLE_WALKOVER' }],
      ],
      { participantsCount: 6, nonRandom: 9303412 },
    );

    const semi: any = find('Backdraw|3|1');
    // the exit is retained, and it is on the side the cascade delivered it to
    expect(Object.keys(semi.sideExitProvenance ?? {})).toEqual(['2']);
    expect(semi.winningSide).toEqual(1);
    expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).toEqual([]);
  });
});
