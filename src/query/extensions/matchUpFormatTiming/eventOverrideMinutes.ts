import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * An event's own matchUpFormat timing override, as the lines read it.
 *
 * `modifyEventMatchUpFormatTiming` keyed a TEAM event's override by the event's type (`minutes: { TEAM: n }`). It now
 * writes `default`: the override is already scoped to the event and the format, so it times whichever line plays that
 * format, and a line is timed by its own type or the default, never by a TEAM figure (CA 2026-11-20). An override
 * stored before that change still means "this event's minutes for this format": it is read as the default. Only the
 * event's own override is read this way; a scheduling policy's TEAM key is never a line's minutes.
 */
export function eventOverrideMinutes<T extends { minutes?: Record<string, any> } | undefined>(timing: T): T {
  const minutes = timing?.minutes;
  if (!minutes || minutes[TEAM_EVENT] === undefined || minutes.default !== undefined) return timing;
  const { [TEAM_EVENT]: teamMinutes, ...rest } = minutes;
  return { ...timing, minutes: { ...rest, default: teamMinutes } } as T;
}
