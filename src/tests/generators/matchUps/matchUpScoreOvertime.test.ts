import { generateOutcomeFromScoreString } from '@Assemblies/generators/simulation/generateOutcomeFromScoreString';
import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { annotateScoreSets } from '@Query/matchUps/addMatchUpContext';
import { parseScoreString } from '@Scoring/parse/parseScoreString';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

// The write path stamps an overtime score itself (overtime activation S2): a score entered in the dialog reached
// setMatchUpStatus with no phase and no score.overtime, though only the engine's own records carried them.
const F1 = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1';
const F2 = 'QTR4XA-S:T12P-O:U/T5P';
const F5 = 'HAL2XA-S:T40P-O:1/T10P';

const t = (setNumber: number, side1Score: number, side2Score: number, winningSide?: number) => ({
  setNumber,
  side1Score,
  side2Score,
  ...(winningSide ? { winningSide } : {}),
});
const tb = (setNumber: number, side1TiebreakScore: number, side2TiebreakScore: number, winningSide: number) => ({
  setNumber,
  side1TiebreakScore,
  side2TiebreakScore,
  winningSide,
});

const write = (matchUpFormat: string, sets: any[], matchUpStatus: string, winningSide?: number, overtime?: any) =>
  matchUpScore({ matchUpFormat, matchUpStatus, winningSide, score: { sets, ...(overtime ? { overtime } : {}) } }).score;

it('stamps each set with its phase and period', () => {
  const score = write(F1, [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0), t(4, 0, 0), tb(5, 4, 3, 1)], COMPLETED, 1);
  expect(score.sets.map(({ phase, periodNumber }) => [phase, periodNumber])).toEqual([
    ['REGULATION', 1],
    ['REGULATION', 2],
    ['OVERTIME', 1],
    ['OVERTIME', 2],
    ['DECIDER', 1],
  ]);
});

it.each([
  {
    label: 'F1 decided by the decider',
    f: F1,
    sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0), t(4, 0, 0), tb(5, 4, 3, 1)],
    w: 1,
    overtime: { aggregateScore: [1, 1], decidingScore: [4, 3], decidedIn: 'DECIDER' },
    display: '1-1 (Decider: 4-3)',
  },
  {
    label: 'F2 decided in OT2',
    f: F2,
    sets: [t(1, 25, 25), t(2, 25, 25), t(3, 25, 25), t(4, 25, 25), t(5, 10, 10), t(6, 12, 8, 1)],
    w: 1,
    overtime: { aggregateScore: [122, 118], decidedIn: 'OVERTIME', periodNumber: 2 },
    display: '122-118 (OT 2)',
  },
  {
    label: 'F5 finished level after its period',
    f: F5,
    sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0)],
    w: undefined,
    overtime: { aggregateScore: [1, 1], decidedIn: 'OVERTIME' },
    display: '1-1 (OT 1, drawn)',
  },
  {
    label: 'F5 decided in regulation',
    f: F5,
    sets: [t(1, 2, 0, 1), t(2, 0, 1, 2)],
    w: 1,
    overtime: { aggregateScore: [2, 1], decidedIn: 'REGULATION' },
    display: '2-1',
  },
])('writes score.overtime and its display string: $label', ({ f, sets, w, overtime, display }) => {
  const score = write(f, sets, COMPLETED, w);
  expect(score.overtime).toMatchObject({ ...overtime, scoreString: display });
});

it('in progress, the display string is the live scoreboard and no decidedIn is written', () => {
  const sets = [t(1, 25, 25), t(2, 25, 25), t(3, 25, 25), t(4, 25, 25), t(5, 2, 0)];
  const score = write(F2, sets, IN_PROGRESS);
  expect(score.overtime.decidedIn).toBeUndefined();
  expect(score.overtime.scoreString).toEqual('102-100 (OT 1)');
});

it('keeps a result decided externally: decidedIn EXTERNAL and its decidedBy survive the write', () => {
  const decidedBy = { method: 'SHOOTOUT', tally: [4, 3] };
  const score = write(F5, [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0)], COMPLETED, 1, {
    decidedIn: 'EXTERNAL',
    decidedBy,
  });
  expect(score.overtime).toMatchObject({ aggregateScore: [1, 1], decidedIn: 'EXTERNAL', decidedBy });
  expect(score.overtime.scoreString).toEqual('1-1 (Shootout: 4-3)');
});

it('the stored per-period string still round-trips through parseScoreString (CA ruling: the stored string is lossless)', () => {
  for (const [f, sets, w] of [
    [F1, [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0), t(4, 0, 0), tb(5, 4, 3, 1)], 1],
    [F2, [t(1, 25, 25), t(2, 25, 25), t(3, 25, 25), t(4, 25, 25), t(5, 10, 10), t(6, 12, 8, 1)], 1],
    [F5, [t(1, 1, 0, 1), t(2, 0, 1, 2), t(3, 0, 0)], undefined],
  ] as const) {
    const score = write(f, [...sets], COMPLETED, w);
    const parsed = parseScoreString({ scoreString: score.scoreStringSide1, matchUpFormat: f });
    expect(
      parsed.map((set: any) => [set.side1Score ?? set.side1TiebreakScore, set.side2Score ?? set.side2TiebreakScore]),
    ).toEqual(
      sets.map((set: any) => [set.side1Score ?? set.side1TiebreakScore, set.side2Score ?? set.side2TiebreakScore]),
    );
  }
});

it('a format without overtime is written as before: no phase, no score.overtime', () => {
  const score = write('SET3XA-S:T10', [t(1, 3, 2, 1), t(2, 1, 1), t(3, 0, 2, 2)], COMPLETED, 2);
  expect(score.overtime).toBeUndefined();
  expect(score.sets.every((set: any) => set.phase === undefined)).toEqual(true);
});

it('generateOutcomeFromScoreString refuses a labelled scoreboard string rather than building NaN sets', () => {
  const result: any = generateOutcomeFromScoreString({ scoreString: '1-1 (Decider: 4-3)', matchUpFormat: F1 });
  expect(result.error).toBeDefined();
});

it('annotateScoreSets reads each set by its own setNumber, not its position', () => {
  const matchUp: any = { score: { sets: [t(1, 1, 0, 1), t(2, 0, 1, 2), tb(5, 4, 3, 1)] } };
  annotateScoreSets(matchUp, F1);
  expect(matchUp.score.sets.at(-1).tiebreakSet).toEqual(true);
  expect(matchUp.score.sets[0].tiebreakSet).toBeUndefined();
});
