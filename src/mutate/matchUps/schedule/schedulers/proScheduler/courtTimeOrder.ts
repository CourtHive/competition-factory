import { matchUpWillNeverBePlayed } from '@Mutate/matchUps/schedule/byeScheduling';
import { extractTime, timeStringMinutes } from '@Tools/plainTime';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { CANCELLED, DEAD_RUBBER, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * Outcomes that put nobody on the court. Broader than `matchUpWillNeverBePlayed`, which counts a BYE and
 * an exit the cascade produced but deliberately not a walkover a director recorded: for "is this slot
 * held?" that is the director's own act, but for "did this match use court time?" a recorded walkover
 * used none either. DEFAULTED, DOUBLE_DEFAULT and ABANDONED are left out of this list: each can come
 * after play has begun (a propagated DEFAULTED is caught by `matchUpWillNeverBePlayed`).
 */
const NO_COURT_TIME = new Set<string>([WALKOVER, DOUBLE_WALKOVER, CANCELLED, DEAD_RUBBER]);

export function usesNoCourtTime(matchUp: HydratedMatchUp): boolean {
  return (!!matchUp.matchUpStatus && NO_COURT_TIME.has(matchUp.matchUpStatus)) || matchUpWillNeverBePlayed({ matchUp });
}

export type CourtTimeOrderConflict = {
  /** The later-courtOrder matchUp whose time is not after the one before it. */
  matchUpId: string;
  /** The lower-courtOrder matchUp it is out of order with. */
  earlierMatchUpId: string;
};

type Slot = { matchUpId: string; order: number; minutes: number };

/**
 * A court's scheduled times out of step with its order of play: a later `courtOrder` holding a time equal
 * to or earlier than the matchUp before it on the same court and date. The grid sequences by
 * `courtOrder`, so this never breaks the grid, but it reads wrong on a printed order of play and usually
 * means the times need recalculating (a matchUp dragged with its time, which travels with it).
 *
 * Adjacent comparison, so each break in the order is reported once. A matchUp without a court, an order
 * or a readable time is skipped without breaking the chain, as is one that uses no court time (a walkover
 * at 08:00 frees the court for the next 08:00 matchUp: a production report, 2026-10-11). Two matchUps in the SAME
 * `courtOrder` are a double booking, which `proConflicts` reports itself.
 */
export function courtTimeOrderConflicts(matchUps: HydratedMatchUp[]): CourtTimeOrderConflict[] {
  const byCourt = new Map<string, Slot[]>();
  for (const matchUp of matchUps) {
    const { courtId, courtOrder, scheduledDate, scheduledTime } = matchUp.schedule ?? {};
    const time = extractTime(scheduledTime);
    const order = ensureInt(courtOrder);
    if (!courtId || !time || !order || usesNoCourtTime(matchUp)) continue;

    const key = `${courtId}|${scheduledDate ?? ''}`;
    const slots = byCourt.get(key) ?? [];
    slots.push({ matchUpId: matchUp.matchUpId, order, minutes: timeStringMinutes(time) });
    byCourt.set(key, slots);
  }

  const conflicts: CourtTimeOrderConflict[] = [];
  for (const slots of byCourt.values()) {
    slots.sort((a, b) => a.order - b.order);
    for (let index = 1; index < slots.length; index += 1) {
      const [previous, current] = [slots[index - 1], slots[index]];
      if (current.order !== previous.order && current.minutes <= previous.minutes) {
        conflicts.push({ matchUpId: current.matchUpId, earlierMatchUpId: previous.matchUpId });
      }
    }
  }
  return conflicts;
}
