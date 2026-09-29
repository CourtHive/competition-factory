import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

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
  it('a re-derived origin that seats a real winner voids the exit it stamped downstream', () => {
    play(
      [
        ['Main|2|1', { winningSide: 1 }],
        ['Backdraw|3|1', { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main|2|2', { winningSide: 2 }],
        ['Main|3|1', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
        ['Main|3|1', { winningSide: 2 }],
      ],
      { participantsCount: 4, nonRandom: 9301605 },
    );

    const backdrawFinal: any = find('Backdraw|4|1');
    const mainFinal: any = find('Main|4|1');

    // the origin re-derived to a single exit with a winner…
    expect(backdrawFinal.winningSide).toEqual(1);
    // …so the carried exit it had stamped is gone, and the Main final holds two arrivals and no exit
    expect(mainFinal.sideExitProvenance).toBeUndefined();
    expect(mainFinal.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(mainFinal.winningSide).toBeUndefined();

    expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).toEqual([]);
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
