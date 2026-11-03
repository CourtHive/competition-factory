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
  return set.isTiebreakOnly
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

export function overtimeScoreString(context: OvertimeScoreContext, perspective?: number): string {
  const pair = (scores: [number, number]) => (perspective === 1 ? [...scores].reverse() : scores).join('-');
  let phase = context.decidedIn ? 'Regulation' : `Regulation ${context.periodNumber}`;
  if (context.phase === 'OVERTIME') phase = `OT ${context.periodNumber}`;
  if (context.phase === 'DECIDER') phase = `Decider: ${pair(context.decidingScore ?? [0, 0])}`;
  return `${pair(context.aggregateScore)} (${phase})`;
}
