import type { FormatStructure, OvertimeScoreContext, ScoringPeriod, SetScore } from '@Types/scoring/types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

export type OvertimeLayout = { regulationCount: number; overtimeCount: number | 'unlimited'; finalDecider: boolean };

export function overtimeLayout(format: FormatStructure): OvertimeLayout | undefined {
  return format.overtimeFormat
    ? {
        regulationCount: format.exactly ?? format.bestOf ?? 1,
        overtimeCount: format.overtimeFormat.count,
        finalDecider: !!format.finalSetFormat,
      }
    : undefined;
}

/** One producer of relative period labels for the reducer, persisted record and query views. */
export function scoringPeriod(layout: OvertimeLayout, setNumber: number): ScoringPeriod | undefined {
  if (setNumber <= layout.regulationCount) return { phase: 'REGULATION', periodNumber: setNumber };
  const periodNumber = setNumber - layout.regulationCount;
  if (layout.overtimeCount === 'unlimited' || periodNumber <= layout.overtimeCount)
    return { phase: 'OVERTIME', periodNumber };
  return layout.finalDecider && periodNumber === layout.overtimeCount + 1
    ? { phase: 'DECIDER', periodNumber: 1 }
    : undefined;
}

export const segmentClosed = (set: SetScore): boolean => set.winningSide !== undefined || !!set.segmentComplete;

/** A race records its running/final points separately from the game won. */
function units(set?: SetScore): [number, number] {
  if (!set) return [0, 0];
  // the engine flags a race isTiebreakOnly; a static score's decider carries only its tiebreak points
  const tiebreakOnly =
    set.isTiebreakOnly ||
    (set.side1Score === undefined &&
      set.side2Score === undefined &&
      (set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined));
  return tiebreakOnly
    ? [
        set.side1TiebreakScore ?? set.side1GameScores?.at(-1) ?? set.side1Score ?? 0,
        set.side2TiebreakScore ?? set.side2GameScores?.at(-1) ?? set.side2Score ?? 0,
      ]
    : [set.side1Score ?? 0, set.side2Score ?? 0];
}

export function overtimeScoreContext(
  format: FormatStructure,
  sets: SetScore[],
  status: string,
): OvertimeScoreContext | undefined {
  const layout = overtimeLayout(format);
  if (!layout) return undefined;
  const finalNumber =
    layout.overtimeCount === 'unlimited' || !layout.finalDecider
      ? undefined
      : layout.regulationCount + layout.overtimeCount + 1;
  const counted = finalNumber === undefined ? sets : sets.filter((set) => set.setNumber < finalNumber);
  const aggregateScore = counted.reduce<[number, number]>(
    (sum, set) => {
      const score = units(set);
      return [sum[0] + score[0], sum[1] + score[1]];
    },
    [0, 0],
  );
  const last = sets.at(-1);
  const setNumber = last ? last.setNumber + (status !== COMPLETED && segmentClosed(last) ? 1 : 0) : 1;
  const period = scoringPeriod(layout, setNumber);
  if (!period) return undefined;
  return {
    ...period,
    aggregateScore,
    ...(period.phase === 'DECIDER' ? { decidingScore: units(sets.find((set) => set.setNumber === finalNumber)) } : {}),
    ...(status === COMPLETED ? { decidedIn: period.phase } : {}),
  };
}

const METHOD_LABELS: Record<string, string> = {
  SHOOTOUT: 'Shootout',
  COMPETITION_RULE: 'Competition rule',
  LOTS: 'Lots',
  OFFICIAL_DECISION: 'Official decision',
};

/**
 * A completed result's legible string, side 1 first unless `perspective` is 1 (CA, 2026-11-04): the aggregate, then
 * how it was decided. Decided in regulation reads as the plain aggregate, as every sport writes it; a level finish
 * says so; a result decided externally names its method. A result in progress reads as the live scoreboard.
 */
export function overtimeResultString(context: OvertimeScoreContext, perspective?: number): string {
  if (!context.decidedIn) return overtimeScoreString(context, perspective);
  const pair = (scores: [number, number]) => (perspective === 1 ? [...scores].reverse() : scores).join('-');
  const aggregate = pair(context.aggregateScore);
  const level = context.aggregateScore[0] === context.aggregateScore[1];
  if (context.decidedIn === 'EXTERNAL') {
    const by = context.decidedBy;
    const label = (by && METHOD_LABELS[by.method]) ?? 'Decided';
    return `${aggregate} (${label}${by?.tally ? `: ${pair(by.tally)}` : ''})`;
  }
  if (context.decidedIn === 'DECIDER') return overtimeScoreString(context, perspective);
  if (context.decidedIn === 'REGULATION') return level ? `${aggregate} (drawn)` : aggregate;
  return `${aggregate} (OT ${context.periodNumber}${level ? ', drawn' : ''})`;
}

export function overtimeScoreString(context: OvertimeScoreContext, perspective?: number): string {
  const pair = (scores: [number, number]) => (perspective === 1 ? [...scores].reverse() : scores).join('-');
  let phase = context.decidedIn ? 'Regulation' : `Regulation ${context.periodNumber}`;
  if (context.phase === 'OVERTIME') phase = `OT ${context.periodNumber}`;
  if (context.phase === 'DECIDER') phase = `Decider: ${pair(context.decidingScore ?? [0, 0])}`;
  return `${pair(context.aggregateScore)} (${phase})`;
}
