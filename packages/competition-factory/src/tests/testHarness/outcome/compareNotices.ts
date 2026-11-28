import { EVENT_COMPARED, NO_EVENT } from '@Tests/testHarness/outcome/plannedNotices';

/**
 * What a call added to the notice buffer, deduplicated by topic and key, on the topics someone receives, against the
 * notices a plan implies (`plannedNotices`); a `modifyMatchUp` or `modifyPositionAssignments` whose payload names no
 * event is marked as `plannedNotices` marks it. Test-only.
 */
export function compareNotices({
  planned,
  added,
  topics,
}: {
  added: { topic?: string; key?: string; payload?: { eventId?: string } }[];
  planned: Set<string>;
  topics: string[];
}): { equal: true } | { equal: false; v1: string; v2: string } {
  const subscribed = new Set(topics);
  const received = (notice: string) => subscribed.has(notice.split('|')[0]);
  const keyed = (notice: (typeof added)[number]) =>
    `${notice.topic}|${notice.key}${EVENT_COMPARED.has(notice.topic ?? '') && !notice.payload?.eventId ? NO_EVENT : ''}`;
  const v1 = [...new Set(added.map(keyed))].filter(received).sort();
  const v2 = [...planned].filter(received).sort();
  if (JSON.stringify(v1) === JSON.stringify(v2)) return { equal: true };
  const only = (a: string[], b: string[]) => a.filter((notice) => !b.includes(notice)).join(', ') || 'nothing more';
  return { equal: false, v1: `notices ${only(v1, v2)}`, v2: `planned ${only(v2, v1)}` };
}
