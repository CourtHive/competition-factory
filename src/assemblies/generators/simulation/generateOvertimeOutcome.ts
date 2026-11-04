import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { randomInt, weightedRandom } from '@Tools/math';

// constants and types
import type { MatchUpStatusUnion, Set as SetType } from '@Types/tournamentTypes';
import type { MatchRule, SegmentRule } from '@Assemblies/engines/scoring/v2/format';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import type { ParsedFormat } from '@Helpers/matchUpFormatCode/parse';

type Side = 1 | 2;
// a level timed period closes level: the engine marks it, as the static verdict reads it
type PeriodSet = SetType & { segmentComplete?: boolean };
type Phase = 'REGULATION' | 'OVERTIME' | 'DECIDER';

type OvertimeOutcomeParams = {
  matchUpStatus: MatchUpStatusUnion;
  parsedFormat: ParsedFormat;
  pointsPerMinute: number;
  random?: () => number;
  incompleteAt?: number;
  matchUpFormat: string;
  winningSide?: number;
  rule: MatchRule;
};

/**
 * An overtime format's outcome, played as the scoring engine plays it (overtime activation S3): regulation, then
 * overtime periods, then the decider, every set numbered in order and stamped with its phase by the write path.
 *
 * Where the result is decided is drawn first (regulation most often, the decider least), then each phase is
 * scored to arrive there: level phases before it, the winner ahead in it. A level finish is never generated, as
 * for every other aggregate format: whether one is legal depends on the structure. A sudden-death period ends on
 * its first score. An unfinished outcome stops inside regulation.
 */
export function generateOvertimeOutcome(params: OvertimeOutcomeParams) {
  const { matchUpFormat, matchUpStatus, incompleteAt, random } = params;
  const winner = (params.winningSide as Side | undefined) ?? (randomInt(1, 2, random) as Side);

  const sets = incompleteAt ? unfinishedRegulation(params, incompleteAt) : playedSets(params, winner);
  const finished = !incompleteAt || completedMatchUpStatuses.includes(matchUpStatus);
  const winningSide = finished ? winner : undefined;

  const { score } = matchUpScore({ matchUpFormat, matchUpStatus, winningSide, score: { sets } });
  return { outcome: { winningSide, matchUpStatus, score } };
}

function playedSets(params: OvertimeOutcomeParams, winner: Side): PeriodSet[] {
  const { rule, random } = params;
  const overtime = rule.overtime!;
  const phase = decidingPhase(rule, random);

  const regulation = regulationPeriods(params);
  if (phase === 'REGULATION') favor(regulation, winner, random);
  else level(regulation, random);

  const periods: [number, number][] = [];
  if (phase !== 'REGULATION') {
    const finite = overtime.count !== 'unlimited';
    let decisive = 0; // the decider follows a block of level periods
    if (phase === 'OVERTIME') {
      if (overtime.exactly) decisive = overtime.count as number;
      else decisive = randomInt(1, finite ? (overtime.count as number) : 3, random);
    }
    const played = phase === 'DECIDER' ? (overtime.count as number) : decisive;
    for (let period = 1; period <= played; period++) {
      periods.push(
        period === decisive ? overtimePeriod(params, winner, random) : levelOvertimePeriod(params, overtime, random),
      );
    }
  }

  const scored = [...regulation, ...periods].map(([side1Score, side2Score], i) =>
    timedSet(i + 1, side1Score, side2Score),
  );
  if (phase === 'DECIDER') scored.push(deciderSet(params, rule.final!, scored.length + 1, winner));
  return scored;
}

function decidingPhase(rule: MatchRule, random?: () => number): Phase {
  const draw = randomInt(1, 100, random);
  const decider = rule.final && rule.overtime!.count !== 'unlimited';
  if (draw <= 60) return 'REGULATION';
  return decider && draw > 85 ? 'DECIDER' : 'OVERTIME';
}

function unfinishedRegulation(params: OvertimeOutcomeParams, incompleteAt: number): PeriodSet[] {
  return regulationPeriods(params)
    .slice(0, incompleteAt)
    .map(([side1Score, side2Score], i) => {
      const set = timedSet(i + 1, side1Score, side2Score);
      if (i + 1 < incompleteAt) return set;
      // the period in play when the match stopped has no winner
      return { setNumber: set.setNumber, side1Score, side2Score };
    });
}

function regulationPeriods({ rule, parsedFormat, pointsPerMinute, random }: OvertimeOutcomeParams) {
  const minutes = parsedFormat.setFormat?.minutes ?? 0;
  return Array.from({ length: rule.n }, () => timedScores(minutes, pointsPerMinute, random));
}

/** a timed period's scores, whole numbers either side of the expected total */
function timedScores(minutes: number, pointsPerMinute: number, random?: () => number): [number, number] {
  const expected = Math.round(minutes * pointsPerMinute);
  const variation = Math.round(expected * 0.2);
  const total = Math.max(0, expected + (randomInt(0, 1, random) ? variation : -variation));
  const side1Score = total ? weightedRandom(total, 2, undefined, random) : 0;
  return [side1Score, total - side1Score];
}

const totals = (periods: [number, number][]) => periods.reduce((sum, [a, b]) => [sum[0] + a, sum[1] + b], [0, 0]);

/** the winner ahead on aggregate: the periods mirrored when the loser leads, one more unit when level */
function favor(periods: [number, number][], winner: Side, random?: () => number) {
  const [a, b] = totals(periods);
  if ((winner === 1 && b > a) || (winner === 2 && a > b)) periods.forEach((period) => period.reverse());
  if (a === b) periods[randomInt(0, periods.length - 1, random)][winner - 1] += 1;
}

/** the aggregate level: the trailing side's difference added to one period */
function level(periods: [number, number][], random?: () => number) {
  const [a, b] = totals(periods);
  if (a === b) return;
  periods[randomInt(0, periods.length - 1, random)][a > b ? 1 : 0] += Math.abs(a - b);
}

function overtimePeriod(
  { rule, parsedFormat, pointsPerMinute }: OvertimeOutcomeParams,
  winner: Side,
  random?: () => number,
): [number, number] {
  if (rule.overtime!.suddenDeath) return winner === 1 ? [1, 0] : [0, 1];
  const scores = timedScores(parsedFormat.overtimeFormat?.setFormat.minutes ?? 0, pointsPerMinute, random);
  favor([scores], winner, random);
  return scores;
}

function levelOvertimePeriod(
  { parsedFormat, pointsPerMinute }: OvertimeOutcomeParams,
  overtime: NonNullable<MatchRule['overtime']>,
  random?: () => number,
): [number, number] {
  if (overtime.suddenDeath) return [0, 0];
  const minutes = parsedFormat.overtimeFormat?.setFormat.minutes ?? 0;
  const each = randomInt(0, Math.floor(Math.round(minutes * pointsPerMinute) / 2), random);
  return [each, each];
}

/** a closed timed period: an unequal one has a winner, a level one closed level */
function timedSet(setNumber: number, side1Score: number, side2Score: number): PeriodSet {
  if (side1Score === side2Score) return { setNumber, side1Score, side2Score, segmentComplete: true };
  return { setNumber, side1Score, side2Score, winningSide: side1Score > side2Score ? 1 : 2 };
}

function deciderSet(params: OvertimeOutcomeParams, final: SegmentRule, setNumber: number, winner: Side): PeriodSet {
  const { parsedFormat, pointsPerMinute, random } = params;
  if (final.kind === 'shootout') {
    const [won, lost] = shootoutTally(final.rounds, random);
    const [side1Score, side2Score] = winner === 1 ? [won, lost] : [lost, won];
    return { setNumber, side1Score, side2Score, winningSide: winner };
  }
  if (final.kind === 'tiebreakOnly') {
    const { to, margin } = final.race;
    // a race ends at its target, or past it by exactly the margin
    const loser = randomInt(0, margin === 1 ? to - 1 : to + 1, random);
    const won = loser <= to - margin ? to : loser + margin;
    const [side1TiebreakScore, side2TiebreakScore] = winner === 1 ? [won, loser] : [loser, won];
    return { setNumber, side1TiebreakScore, side2TiebreakScore, winningSide: winner };
  }
  const scores = timedScores(parsedFormat.finalSetFormat?.minutes ?? 0, pointsPerMinute, random);
  favor([scores], winner, random);
  return timedSet(setNumber, scores[0], scores[1]);
}

/** a shootout's tally, winner first: one in five level through the rounds and won by one in sudden death */
function shootoutTally(rounds: number, random?: () => number): [number, number] {
  if (randomInt(1, 5, random) === 1) {
    const level = randomInt(0, rounds, random);
    return [level + 1, level];
  }
  const won = randomInt(Math.ceil(rounds / 2), rounds, random);
  return [won, randomInt(0, won - 1, random)];
}
