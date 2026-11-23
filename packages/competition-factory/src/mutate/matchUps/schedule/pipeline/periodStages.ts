import { getMatchUpId } from '@Functions/global/extractors';
import { timeStringMinutes } from '@Tools/dateTime';

// constants and types
import { ScheduleTimesResult } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import type { VenuePlan } from './view';

/**
 * A venue's slots when its rounds are planned with different period lengths (scheduling-pipeline.md § 4, step 2).
 *
 * A round's period is the call's `periodLength`, else the period the round states (its own, else its scheduling
 * policy's default), else the one the venue's average minutes derive. Consecutive rounds with the same period form a
 * STAGE. Each stage's slots are Garman slots on its own grid (from the venue's opening, every `L` minutes), and the
 * stages hand over in profile order:
 *
 * - a stage takes as many slots as it has matchUps to place (the last stage takes every slot left);
 * - the next stage's slots are those of its own grid at or after the last slot the stage before took (the HAND-OVER), and
 *   only those past the number of slots already handed out: Garman's count of matchUps expected by a time is cumulative,
 *   so the venue never has more matchUps started by any time than the grid then in force projects.
 *
 * With one period across the venue (always, when the call states one) the slots are exactly the venue's single Garman
 * slots, as they were before rounds' periods were read.
 */

/** the period the venue's slots are first computed with: the call's, else the first round to place anything states */
export function venueBasePeriodLength(venue: VenuePlan, periodLength?: number): number | undefined {
  if (periodLength !== undefined) return periodLength;
  return venue.rounds.find((round) => round.minutes && round.matchUpIds.length)?.statedPeriodLength;
}

type StagedScheduleTimesArgs = {
  venue: VenuePlan;
  /** the call's period: when stated, every round takes it, and the venue has one stage */
  periodLength?: number;
  matchUpsToSchedule: HydratedMatchUp[];
  basePeriodLength?: number;
  baseScheduleTimes: ScheduleTimesResult[];
  /** the venue's Garman slots with a given period (undefined: the period its average minutes derive) */
  scheduleTimesFor: (periodLength?: number) => ScheduleTimesResult[];
};

type Stage = { periodLength?: number; count: number };

export function stagedScheduleTimes({
  baseScheduleTimes,
  matchUpsToSchedule,
  scheduleTimesFor,
  basePeriodLength,
  periodLength,
  venue,
}: StagedScheduleTimesArgs): ScheduleTimesResult[] {
  if (periodLength !== undefined) return baseScheduleTimes;

  const toSchedule = new Set(matchUpsToSchedule.map(getMatchUpId));
  const stages: Stage[] = [];
  for (const round of venue.rounds) {
    const count = round.matchUpIds.filter((matchUpId) => toSchedule.has(matchUpId)).length;
    if (!count) continue;
    const last = stages.at(-1);
    if (last && last.periodLength === round.statedPeriodLength) {
      last.count += count;
    } else {
      stages.push({ periodLength: round.statedPeriodLength, count });
    }
  }
  if (stages.every((stage) => stage.periodLength === basePeriodLength)) return baseScheduleTimes;

  const grids = new Map<number | undefined, ScheduleTimesResult[]>([[basePeriodLength, baseScheduleTimes]]);
  const staged: ScheduleTimesResult[] = [];
  let handOverMinutes = 0;
  for (const [index, stage] of stages.entries()) {
    let grid = grids.get(stage.periodLength);
    if (!grid) {
      grid = scheduleTimesFor(stage.periodLength);
      grids.set(stage.periodLength, grid);
    }
    const remaining = grid
      .slice(staged.length)
      .filter(({ scheduleTime }) => timeStringMinutes(scheduleTime) >= handOverMinutes);
    const taken = index === stages.length - 1 ? remaining : remaining.slice(0, stage.count);
    const lastTaken = taken.at(-1);
    if (lastTaken) handOverMinutes = timeStringMinutes(lastTaken.scheduleTime);
    staged.push(...taken);
  }
  return staged;
}
