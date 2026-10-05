import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { validateScore } from '@Validators/validateScore';
import { expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * AN `exactly` FORMAT IS DECIDED ONLY ONCE EVERY SET IS PLAYED.
 *
 * CA, 2026-10-05, on `SET9X-S:T10`: *"All nine must be played."* `analyzeMatchUp` resolved a winner as
 * soon as one side reached `setsToWin` — five straight bolts read as side 1 — while `validateScore`
 * refused that same score. courthive-components gates Submit on `calculatedWinningSide`, so the card
 * offered a result the engine then refused. Reaching `setsToWin` early is a lead, not a win.
 */
const NINE_BOLTS = 'SET9X-S:T10';
const bolt = (setNumber: number) => ({ setNumber, side1Score: 22, side2Score: 21, winningSide: 1 });
const straight = (count: number) => Array.from({ length: count }, (_unused, index) => bolt(index + 1));
const winnerOf = (sets: any[]) =>
  analyzeMatchUp({ matchUp: { score: { sets }, matchUpFormat: NINE_BOLTS }, matchUpFormat: NINE_BOLTS })
    .calculatedWinningSide;
const engineAccepts = (sets: any[]) =>
  !validateScore({ score: { sets }, matchUpFormat: NINE_BOLTS, matchUpStatus: COMPLETED, winningSide: 1 }).error;

it('names no winner while bolts remain, however one-sided the score', () => {
  for (const played of [1, 4, 5, 6, 8]) expect(winnerOf(straight(played))).toBeUndefined();
});

it('names the winner once the ninth bolt is in', () => {
  // CONTROL: the same one-sided run resolves as soon as it is complete
  expect(winnerOf(straight(9))).toEqual(1);
});

it('agrees with validateScore at every count: a winner exactly when the engine would record the score', () => {
  for (let played = 1; played <= 9; played++) {
    const sets = straight(played);
    expect(winnerOf(sets) !== undefined).toEqual(engineAccepts(sets));
  }
});
