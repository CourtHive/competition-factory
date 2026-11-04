import { overtimeScoreVerdict } from '@Validators/overtimeScore';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

const F1 = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1'; // two halves, an exact two-period block, then a decider
const F2 = 'QTR4XA-S:T12P-O:U/T5P'; // unlimited periods, compared at each period end
const F3 = 'PER3XA-S:T20P-O:USD/T20P'; // unlimited sudden-death periods
const F4 = 'PER3XA-S:T20P-O:1SD/T5P-F:TB1'; // one sudden-death period, then a decider
const F5 = 'HAL2XA-S:T40P-O:1/T10P'; // one period; may finish level

const t = (side1Score: number, side2Score: number) => ({ side1Score, side2Score });
const tb = (side1TiebreakScore: number, side2TiebreakScore: number) => ({ side1TiebreakScore, side2TiebreakScore });
const verdict = (
  matchUpFormat: string,
  sets: any[],
  matchUpStatus: MatchUpStatusUnion,
  winningSide?: number,
  decidedIn?: string,
) => overtimeScoreVerdict({ matchUpFormat, matchUpStatus, winningSide, decidedIn, sets: numbered(sets) });
const numbered = (sets: any[]) => sets.map((set, i) => ({ setNumber: i + 1, ...set }));

it('does not apply to a format without overtime', () => {
  expect(verdict('SET3XA-S:T10', [t(1, 0)], COMPLETED, 1)).toEqual({ applies: false });
});

it.each([
  {
    label: 'F1 decided by the decider after a level block',
    f: F1,
    sets: [t(1, 0), t(0, 1), t(0, 0), t(0, 0), tb(1, 0)],
    w: 1,
  },
  { label: 'F1 decided in the exact block', f: F1, sets: [t(1, 0), t(0, 1), t(1, 0), t(0, 0)], w: 1 },
  { label: 'F1 decider 4-3 after a 1-1 block', f: F1, sets: [t(1, 0), t(0, 1), t(1, 1), t(1, 1), tb(4, 3)], w: 1 },
  { label: 'F2 decided in OT2', f: F2, sets: [t(25, 25), t(25, 25), t(25, 25), t(25, 25), t(10, 10), t(12, 8)], w: 1 },
  {
    label: 'F3 decided by a sudden-death goal in OT2',
    f: F3,
    sets: [t(1, 0), t(0, 1), t(1, 1), t(0, 0), t(1, 0)],
    w: 1,
  },
  {
    label: 'F4 decider after a scoreless SD period',
    f: F4,
    sets: [t(1, 0), t(0, 1), t(0, 0), t(0, 0), tb(1, 0)],
    w: 1,
  },
  { label: 'F5 finishes level after its period', f: F5, sets: [t(1, 0), t(0, 1), t(0, 0)], w: undefined },
  { label: 'F5 decided in regulation', f: F5, sets: [t(2, 0), t(0, 1)], w: 1 },
])('valid: $label', ({ f, sets, w }) => {
  expect(verdict(f, sets, COMPLETED, w)).toMatchObject({ applies: true, valid: true });
});

it.each([
  { label: 'F1 overtime after a decided regulation', f: F1, sets: [t(1, 0), t(1, 0), t(1, 0), t(0, 0)], w: 1 },
  { label: 'F1 a decider after an unequal block', f: F1, sets: [t(1, 0), t(0, 1), t(1, 0), t(0, 0), tb(0, 1)], w: 2 },
  { label: 'F1 level regulation, completed without overtime', f: F1, sets: [t(1, 0), t(0, 1)], w: undefined },
  {
    label: 'F2 overtime after a decided regulation',
    f: F2,
    sets: [t(25, 20), t(25, 25), t(25, 25), t(25, 20), t(5, 3)],
    w: 1,
  },
  {
    label: 'F2 level, completed: unlimited overtime must produce a winner',
    f: F2,
    sets: [t(25, 25), t(25, 25), t(25, 25), t(25, 25)],
    w: undefined,
  },
  { label: 'F3 both sides scored in a sudden-death period', f: F3, sets: [t(1, 0), t(0, 1), t(1, 1), t(2, 1)], w: 1 },
  { label: 'F5 level, completed without its period', f: F5, sets: [t(1, 0), t(0, 1)], w: undefined },
  {
    label: 'F2 the winner is not the side the score decides',
    f: F2,
    sets: [t(25, 25), t(25, 25), t(25, 25), t(25, 25), t(12, 8)],
    w: 2,
  },
])('invalid: $label', ({ f, sets, w }) => {
  expect(verdict(f, sets, COMPLETED, w)).toMatchObject({ applies: true, valid: false });
});

it('in progress: a lead in an open overtime period is not a decision', () => {
  const sets = [t(25, 25), t(25, 25), t(25, 25), t(25, 25), t(2, 0)];
  expect(verdict(F2, sets, IN_PROGRESS)).toMatchObject({ applies: true, valid: true });
});

it('in progress: the last regulation period still open is not a decision', () => {
  expect(verdict(F2, [t(25, 20), t(25, 25), t(25, 25), t(25, 20)], IN_PROGRESS)).toMatchObject({ valid: true });
});

it('in progress: an overtime period opened after a decided regulation is refused', () => {
  const sets = [t(25, 20), t(25, 25), t(25, 25), t(25, 20), t(0, 0)];
  expect(verdict(F2, sets, IN_PROGRESS)).toMatchObject({ valid: false });
});

it('a result decided externally may carry a winner on a level score (standings slice 2)', () => {
  expect(verdict(F5, [t(1, 0), t(0, 1), t(0, 0)], COMPLETED, 1, 'EXTERNAL')).toMatchObject({ valid: true });
});
