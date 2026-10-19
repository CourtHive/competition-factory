import { conforms } from '../../testHarness/scoringConformance/conformance';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * Conformance: combined rally totals (Americano / Mexicano), `SET1-S:P{n}[DP|WB2]`.
 * Every expected outcome below is written from the format definition it cites, not recorded from the
 * engine. The definition is the authority:
 *
 * - documentation/docs/codes/matchup-format.mdx, "Combined Rally Totals": "SET1-S:P32 represents one
 *   segment ending when both sides' rally scores total 32. P32DP adds a deciding rally only after a
 *   tied base segment; P32WB2 continues from that tie until a two-point margin. An unequal result at
 *   the base total is complete under every variant. Plain P32 permits a completed 16–16 without a
 *   winner."
 * - documentation/docs/scoring-engine/format-support.md, "Rotating-Partner Rally Totals": "Each rally
 *   increments side1Score or side2Score … A tied result uses COMPLETED without winningSide"; "Input
 *   Levels": combined point total — point yes, game no.
 */

const rallies = (side1: number, side2: number) => '1'.repeat(side1) + '2'.repeat(side2);

describe('bestOf | combined(ALLOW) — SET1-S:P32, P31, P4: the segment ends at the combined total', () => {
  it('engine-defined: SET1-S:P32 — 31 rallies are not the total; the segment is open', () => {
    conforms('SET1-S:P32', rallies(20, 11), { sets: [[20, 11]], complete: false });
  });

  it('engine-defined: SET1-S:P32 — an unequal result at 32 rallies is complete with a winner', () => {
    conforms('SET1-S:P32', rallies(20, 12), { sets: [[20, 12]], winningSide: 1, complete: true });
  });

  it('engine-defined: SET1-S:P32 — 16–16 is a completed tie without a winner', () => {
    conforms('SET1-S:P32', '12'.repeat(16), { sets: [[16, 16]], complete: true });
  });

  it('engine-defined: SET1-S:P32 — a rally after the total changes nothing', () => {
    conforms('SET1-S:P32', `${rallies(20, 12)} 2`, { sets: [[20, 12]], winningSide: 1, complete: true });
  });

  it('engine-defined: SET1-S:P31 — an odd total cannot end level', () => {
    conforms('SET1-S:P31', `${'12'.repeat(15)} 2`, { sets: [[15, 16]], winningSide: 2, complete: true });
  });

  it('engine-defined: SET1-S:P4 — 2–2 is a completed tie; 3–1 a win', () => {
    conforms('SET1-S:P4', '1122', { sets: [[2, 2]], complete: true });
    conforms('SET1-S:P4', '1211', { sets: [[3, 1]], winningSide: 1, complete: true });
  });

  it('engine-defined: input levels — a combined total takes points and sets, never games', () => {
    expect(new ScoringEngine({ matchUpFormat: 'SET1-S:P32' }).getInputLevels()).toEqual({
      point: true,
      game: false,
      set: true,
    });
  });
});

describe('bestOf | combined(DECIDING_POINT) — SET1-S:P32DP, P4DP: a tie takes one deciding rally', () => {
  it('engine-defined: SET1-S:P32DP — 16–16 is not complete; the next rally decides', () => {
    conforms('SET1-S:P32DP', '12'.repeat(16), { sets: [[16, 16]], complete: false });
    conforms('SET1-S:P32DP', `${'12'.repeat(16)} 2`, { sets: [[16, 17]], winningSide: 2, complete: true });
  });

  it('engine-defined: SET1-S:P32DP — an unequal result at the base total needs no deciding rally', () => {
    conforms('SET1-S:P32DP', `${rallies(17, 15)} 1`, { sets: [[17, 15]], winningSide: 1, complete: true });
  });

  it('engine-defined: SET1-S:P4DP — 2–2, then one rally', () => {
    conforms('SET1-S:P4DP', '1221', { sets: [[2, 2]], complete: false });
    conforms('SET1-S:P4DP', '1221 1', { sets: [[3, 2]], winningSide: 1, complete: true });
  });
});

describe('bestOf | combined(WIN_BY_MARGIN) — SET1-S:P32WB2: a tie plays on to a two-point margin', () => {
  const format = 'SET1-S:P32WB2';
  const TIED = '12'.repeat(16);

  it('engine-defined: 16–16, then 17–17, is not complete', () => {
    conforms(format, `${TIED} 12`, { sets: [[17, 17]], complete: false });
  });

  it('engine-defined: a one-point margin past the tie is not enough', () => {
    conforms(format, `${TIED} 1`, { sets: [[17, 16]], complete: false });
  });

  it('engine-defined: two clear after the tie completes the segment', () => {
    conforms(format, `${TIED} 12 11`, { sets: [[19, 17]], winningSide: 1, complete: true });
  });

  it('engine-defined: an unequal result at 32 rallies is complete with no margin rule applied', () => {
    conforms(format, rallies(17, 15), { sets: [[17, 15]], winningSide: 1, complete: true });
  });
});
