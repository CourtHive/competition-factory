import { enterValues, scoreMatchUp } from './primitives';
import { expect, it } from 'vitest';

// Fixtures
import { FORMAT_STANDARD_NOAD } from '@Fixtures/scoring/matchUpFormats';

/**
 * `SET3-S:6NOAD` is an advantage set with no-advantage GAMES. The games rule does not shorten the set:
 * a 5 completes to a 7, a 6 wants its tiebreak, and a 5-6 names no winner. These three pinned `6-5` as a
 * finished set until 2026-10-01 — `NOAD` read as a one-game SET margin, which is `WB1`'s job. Settled
 * by CA; grammar and sources in `Mentat/statuses/2026-10-01-noad-at-three-levels-and-the-one-game-set.md`.
 */
it('handles set scoring with NoAD', () => {
  const matchUpFormat = FORMAT_STANDARD_NOAD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: '5' },
    { lowSide: 2, value: '5' },
  ];
  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-5 7-5`);

  expect(matchUp.score?.sets.length).toEqual(2);
  expect(matchUp.winningSide).toEqual(1);
});

it('handles set scoring with NoAD when incomplete score', () => {
  const matchUpFormat = FORMAT_STANDARD_NOAD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 2, value: '5' }];
  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-5`);
  expect(matchUp.score.sets[0].winningSide).toEqual(1);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-`);
  expect(matchUp.score.sets[0].winningSide).toBeUndefined();
  // a 6 against a 7 is six-all decided by a tiebreak, whose points are now wanted
  ({ matchUp } = scoreMatchUp({ value: '6', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-6(`);
  expect(matchUp.score.sets[0].winningSide).toBeUndefined();
  ({ matchUp } = scoreMatchUp({ value: '2', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-6(2`);
  expect(matchUp.score.sets[0].winningSide).toBeUndefined();
});

it('handles set scoring with NoAD when incomplete score and low score on side1 is setTo - 1', () => {
  const matchUpFormat = FORMAT_STANDARD_NOAD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 1, value: '5' }];
  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-7`);
  expect(matchUp.score.sets[0].winningSide).toEqual(2);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-`);
  expect(matchUp.winningSide).toBeUndefined();
  // 5-6 is a set still being played: accepted as a score, but nobody has won it
  ({ matchUp } = scoreMatchUp({ value: '6', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-6`);
  expect(matchUp.score.sets[0].winningSide).toBeUndefined();
  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-`);
  expect(matchUp.winningSide).toBeUndefined();
  // and a 7 against the 5 is the set, won by two
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '7', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-7`);
  expect(matchUp.score.sets[0].winningSide).toEqual(2);
});
