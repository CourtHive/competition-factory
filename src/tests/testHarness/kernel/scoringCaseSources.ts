import { normativeReduction } from './normativeReduction';
import { overTheWire } from './kernel';

// types
import type { ScoringConfiguration, TimelineEntry } from '@Assemblies/engines/scoring/v2/types';
import type { KernelCase } from './kernel';

/**
 * The authored `kernel.scoring.reduce@1` cases: one short timeline per rule of `scoring-engine-spec.md`, small enough
 * that the whole reduction can be read and checked by hand. Each source states its rule as CLAIMS on the reduction,
 * written from the rule (a game is four points, two clear; the receiver of the last game serves next), and the case is
 * written only if the reduction meets them. The case file then pins the whole projection, so a change anywhere in it
 * is a reviewed change to `cases/scoringReduce.json` (`KERNEL_SCORING_CASES=write`).
 */
type Reduction = ReturnType<typeof normativeReduction>;
type Source = {
  caseId: string;
  note: string;
  configuration?: ScoringConfiguration;
  timeline: TimelineEntry[];
  claims: (reduction: Reduction) => void;
};

/** points, one character each: `1` or `2` for the side that won it; spaces are ignored */
function points(spec: string, data: Record<string, unknown> = {}): TimelineEntry[] {
  return [...spec.replaceAll(' ', '')].map((side) => ({
    type: 'point',
    data: { winner: side === '1' ? 0 : 1, ...data },
  }));
}
/** games won to love, one character each */
const loveGames = (spec: string) =>
  [...spec.replaceAll(' ', '')].map((side) => (side === '1' ? '1111' : '2222')).join('');
const games = (spec: string): TimelineEntry[] =>
  [...spec].map((side) => ({ type: 'game', data: { winner: side === '1' ? 0 : 1 } }));

function expectEqual(actual: unknown, expected: unknown, claim: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`claim "${claim}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const totals = (reduction: Reduction) => reduction.sets.map((set) => [set.side1Score, set.side2Score]);
const outcomes = (reduction: Reduction) => reduction.outcomes;

const STANDARD = { matchUpFormat: 'SET3-S:6/TB7' };

export const scoringCaseSources: Source[] = [
  {
    caseId: 'scoring.reduce.empty-timeline.v1',
    note: 'No entries: the match is to be played, no set is open, and side 1 is due to serve (§ 1.2, § 10.4).',
    configuration: STANDARD,
    timeline: [],
    claims: (r) => {
      expectEqual(r.matchUpStatus, 'TO_BE_PLAYED', 'nothing played');
      expectEqual(r.sets, [], 'no set open');
      expectEqual(r.server?.side, 0, 'side 1 serves first');
    },
  },
  {
    caseId: 'scoring.reduce.love-game.v1',
    note: 'Four straight points win a game (ITF Rule 5); the receiver serves the next game (Rule 9).',
    configuration: STANDARD,
    timeline: points('1111'),
    claims: (r) => {
      expectEqual(totals(r), [[1, 0]], 'one game to side 1');
      expectEqual(r.matchUpStatus, 'IN_PROGRESS', 'in progress');
      expectEqual(r.server, { side: 1, derived: true }, 'side 2 serves the second game');
      expectEqual(
        r.points.map((point) => point.score),
        ['15-0', '30-0', '40-0', '0-0'],
        'the calls of a love game; the game point reads 0-0 (§ 11.1)',
      );
    },
  },
  {
    caseId: 'scoring.reduce.advantage-not-a-game.v1',
    note: 'From deuce a game needs two consecutive points: at advantage there is no game yet (Rule 5).',
    configuration: STANDARD,
    timeline: points('111222 1'),
    claims: (r) => {
      expectEqual(totals(r), [[0, 0]], 'no game yet');
      expectEqual(r.game?.pointsPlayed, 7, 'seven points in the game in play');
    },
  },
  {
    caseId: 'scoring.reduce.no-ad-deciding-point.v1',
    note: 'No-advantage scoring: at deuce the next point wins the game (Appendix VI).',
    configuration: { matchUpFormat: 'SET3-S:6NOAD/TB7' },
    timeline: points('111222 2'),
    claims: (r) => expectEqual(totals(r), [[0, 1]], 'the deciding point wins the game'),
  },
  {
    caseId: 'scoring.reduce.tiebreak-at-six-all.v1',
    note: 'At six games all a tie-break, first to seven by two, decides the set 7-6 (Rule 5(b), Rule 6).',
    configuration: STANDARD,
    timeline: points(`${loveGames('121212121212')} 1111111`),
    claims: (r) => {
      expectEqual(totals(r), [[7, 6]], 'the set 7-6');
      expectEqual([r.sets[0].side1TiebreakScore, r.sets[0].side2TiebreakScore], [7, 0], 'the tie-break 7-0');
      expectEqual(r.sets[0].winningSide, 1, 'side 1 won the set');
    },
  },
  {
    caseId: 'scoring.reduce.straight-sets-and-after.v1',
    note:
      'Two sets of six love win a best-of-three match (Rule 7); a point after completion is ignored, not ' +
      'refused (§ 2.1, ignored 2).',
    configuration: STANDARD,
    timeline: points(`${loveGames('111111')} ${loveGames('111111')} 2`),
    claims: (r) => {
      expectEqual(
        totals(r),
        [
          [6, 0],
          [6, 0],
        ],
        'two sets to love',
      );
      expectEqual([r.matchUpStatus, r.winningSide], ['COMPLETED', 1], 'side 1 won the match');
      expectEqual(outcomes(r).at(-1), { ignored: 'MATCH_COMPLETED' }, 'the point after is ignored');
      expectEqual(r.server?.derived, false, 'a completed match derives no server (§ 10.4)');
    },
  },
  {
    caseId: 'scoring.reduce.point-without-a-winner.v1',
    note: 'A point that names no winner is ignored (§ 2.1, ignored 1); one that names a side 3 is refused (§ 2.1).',
    configuration: STANDARD,
    timeline: [{ type: 'point', data: {} }, { type: 'point', data: { winningSide: 3 } }, ...points('1')],
    claims: (r) => {
      expectEqual(
        outcomes(r),
        [{ ignored: 'NO_WINNER' }, { refused: 'ERR_INVALID_VALUES' }, 'recorded'],
        'ignored, refused, recorded',
      );
      expectEqual(r.points.length, 1, 'one point scored');
    },
  },
  {
    caseId: 'scoring.reduce.both-side-spellings.v1',
    note: 'A side may be named 0-based (`winner`) or 1-based (`winningSide`); both name the same side (§ 1.3).',
    configuration: STANDARD,
    timeline: [
      { type: 'point', data: { winner: 1 } },
      { type: 'point', data: { winningSide: 2 } },
      { type: 'point', data: { winner: 0, winningSide: 2 } },
    ],
    claims: (r) => {
      expectEqual(
        r.points.map((point) => point.winner),
        [1, 1],
        'both spellings name side 2',
      );
      expectEqual(outcomes(r)[2], { refused: 'ERR_INVALID_VALUES' }, 'spellings that disagree are refused');
    },
  },
  {
    caseId: 'scoring.reduce.games-build-a-set.v1',
    note: 'Whole games entered by `game` build a set as points do: six games to four wins it (§ 2.2, Rule 6).',
    configuration: STANDARD,
    timeline: games('1212121211'),
    claims: (r) => {
      expectEqual(totals(r), [[6, 4]], 'the set 6-4');
      expectEqual(r.points, [], 'no points recorded');
    },
  },
  {
    caseId: 'scoring.reduce.set-totals-decide-the-match.v1',
    note: 'Set totals entered by `set` close each set and decide the match (§ 2.3, § 9).',
    configuration: STANDARD,
    timeline: [
      { type: 'set', data: { side1Score: 6, side2Score: 3 } },
      { type: 'set', data: { side1Score: 4, side2Score: 6 } },
      { type: 'set', data: { side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 5 } },
    ],
    claims: (r) => {
      expectEqual(
        totals(r),
        [
          [6, 3],
          [4, 6],
          [7, 6],
        ],
        'three sets',
      );
      expectEqual([r.matchUpStatus, r.winningSide], ['COMPLETED', 1], 'side 1 won two sets to one');
    },
  },
  {
    caseId: 'scoring.reduce.baseline-then-play.v1',
    note:
      'A late-start baseline sets the score before play (§ 2.5); points then play on from it: 5-4 and a love game ' +
      'make 6-4.',
    configuration: STANDARD,
    timeline: [{ type: 'setInitialScore', data: { sets: [{ side1Score: 5, side2Score: 4 }] } }, ...points('1111')],
    claims: (r) => expectEqual(totals(r), [[6, 4]], 'the set 6-4'),
  },
  {
    caseId: 'scoring.reduce.server-correction.v1',
    note:
      'A `setServer` before the first point names side 2 to serve; the receiver of each game serves the next ' +
      '(§ 2.6, § 10.6).',
    configuration: STANDARD,
    timeline: [{ type: 'setServer', data: { side: 1 } }, ...points('1111 1')],
    claims: (r) => {
      expectEqual(
        r.points.map((point) => point.server),
        [1, 1, 1, 1, 0],
        'side 2 serves the first game, side 1 the second',
      );
    },
  },
  {
    caseId: 'scoring.reduce.tiebreak-only.v1',
    note: 'A tiebreak-only set (`S:TB10`) is a race to ten points, two clear (§ 5).',
    configuration: { matchUpFormat: 'SET1-S:TB10' },
    timeline: points('111111111 222222222 12 12'),
    claims: (r) => {
      expectEqual(r.matchUpStatus, 'IN_PROGRESS', 'not decided at 11-11');
      expectEqual(r.game?.score, [11, 11], 'the race at 11-11');
    },
  },
  {
    caseId: 'scoring.reduce.timed-segment-ends.v1',
    note:
      'A timed segment scored in points (`S:T10P`) plays until the host ends it (§ 6.4); `endSegment` closes it ' +
      'with the side ahead winning it.',
    configuration: { matchUpFormat: 'SET1-S:T10P' },
    timeline: [...points('1121'), { type: 'endSegment', data: {} }],
    claims: (r) => {
      expectEqual(totals(r), [[3, 1]], 'three points to one');
      expectEqual([r.matchUpStatus, r.winningSide], ['COMPLETED', 1], 'side 1 won the segment and the match');
    },
  },
  {
    caseId: 'scoring.reduce.end-segment-refused-on-a-standard-set.v1',
    note: '`endSegment` ends timed segments only: on a standard set it is refused and changes nothing (§ 2.4).',
    configuration: STANDARD,
    timeline: [...points('11'), { type: 'endSegment', data: {} }],
    claims: (r) => expectEqual(outcomes(r), ['recorded', 'recorded', { refused: 'ERR_INVALID_VALUES' }], 'refused'),
  },
  {
    caseId: 'scoring.reduce.unparseable-format.v1',
    note:
      'A format that does not parse refuses every action that scores or names a server, and records the rest ' +
      '(§ 1.1, § 2): an annotation is kept. No server is reported.',
    configuration: { matchUpFormat: 'NOT-A-FORMAT' },
    timeline: [...points('1'), { type: 'annotation', data: { text: 'rain' } }],
    claims: (r) => {
      expectEqual(outcomes(r), [{ refused: 'ERR_INVALID_VALUES' }, 'recorded'], 'the point refused, the note kept');
      expectEqual(r.server, undefined, 'no server');
    },
  },
  {
    caseId: 'scoring.reduce.unknown-entry-type.v1',
    note: 'An entry of a type the reducer does not know is kept in place and not replayed (§ 12.1).',
    configuration: STANDARD,
    timeline: [{ type: 'videoReview', data: { outcome: 'upheld' } }, ...points('1')],
    claims: (r) => expectEqual(outcomes(r), ['recorded', 'recorded'], 'both recorded'),
  },
  {
    caseId: 'scoring.reduce.challenge.v1',
    note: 'A `challenge` names side 1 or 2 and changes no score; side 3 is refused (§ 2.8).',
    configuration: STANDARD,
    timeline: [
      { type: 'challenge', data: { sideNumber: 1 } },
      { type: 'challenge', data: { sideNumber: 3 } },
    ],
    claims: (r) => expectEqual(outcomes(r), ['recorded', { refused: 'ERR_INVALID_VALUES' }], 'recorded, refused'),
  },
  {
    caseId: 'scoring.reduce.consecutive-points-game.v1',
    note: 'A consecutive-points game (`G:3C`) is won by the first side to win three points in a row (§ 4.1 rule 4).',
    configuration: { matchUpFormat: 'SET3-S:6/TB7-G:3C' },
    timeline: points('1121 222'),
    claims: (r) => expectEqual(totals(r), [[0, 1]], 'side 2 won three in a row'),
  },
  {
    caseId: 'scoring.reduce.final-set-match-tiebreak.v1',
    note: 'At a set all, a final match tie-break (`F:TB10`) decides the match, first to ten by two (Appendix VI).',
    configuration: { matchUpFormat: 'SET3-S:6/TB7-F:TB10' },
    timeline: points(`${loveGames('111111')} ${loveGames('222222')} 1111111111`),
    claims: (r) => {
      expectEqual([r.matchUpStatus, r.winningSide], ['COMPLETED', 1], 'the match tie-break decides it');
      expectEqual(r.sets.length, 3, 'three sets');
    },
  },
  {
    caseId: 'scoring.reduce.point-values.v1',
    note:
      'Where points are units (a timed segment in points) a point carries its `scoreValue`, and a multiplier gives ' +
      'one to a point by its result (§ 5 rule 5).',
    configuration: {
      matchUpFormat: 'SET1-S:T10P',
      pointMultipliers: [{ condition: { results: ['Ace'] }, value: 2 }],
    },
    timeline: [
      { type: 'point', data: { winner: 0, scoreValue: 3 } },
      { type: 'point', data: { winner: 1, result: 'Ace' } },
      { type: 'point', data: { winner: 1 } },
    ],
    claims: (r) => expectEqual(totals(r), [[3, 3]], 'three each: 3, then 2 and 1'),
  },
  {
    caseId: 'scoring.reduce.winner-serves.v1',
    note:
      "Under the competition's winner-serves rule the side that won the last point serves the next, even inside a " +
      'game of a standard set, where service would otherwise stay with one side for the game (§ 10.7).',
    configuration: { matchUpFormat: 'SET3-S:6/TB7', competitionFormat: { serverRule: 'WINNER_SERVES' } },
    timeline: points('1221'),
    claims: (r) => {
      expectEqual(
        r.points.map((point) => point.server),
        [0, 0, 1, 1],
        'side 1 serves, then the winner of each point',
      );
      expectEqual(r.server?.side, 0, 'side 1 won the last point and serves next');
    },
  },
];

export function authoredScoringCases(): KernelCase[] {
  return scoringCaseSources.map(({ caseId, note, configuration, timeline, claims }) => {
    const input = { ...(configuration ? { configuration } : {}), timeline };
    // the reduction a second implementation receives: the input as it crosses the JSON wire
    const reduction = normativeReduction(overTheWire(configuration ?? {}), overTheWire(timeline));
    claims(reduction);
    return {
      caseId,
      operation: 'kernel.scoring.reduce@1',
      input,
      expected: { kind: 'value', value: overTheWire(reduction) },
      note,
    };
  });
}
