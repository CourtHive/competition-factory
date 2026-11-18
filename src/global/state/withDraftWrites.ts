import {
  cycleModifiedTournamentIds,
  restoreMutationStatus,
  cycleModifiedTopics,
  readMutationStatus,
  getNoticeBuffer,
  setNoticeBuffer,
  markModified,
} from '@Global/state/globalState';
import { UNANNOUNCED_WRITE, UNNAMED_TOURNAMENT } from '@Global/state/noticeIdentity';

/**
 * Runs `fn`, which writes to a DRAFT (a copy its caller made: a what-if view, a structure not yet attached), and
 * discards what those writes announced. The mutate helpers a draft is built with buffer notices and mark the
 * tournament modified as they go. Neither belongs to the engine state: left in place, the engine delivers the
 * notices to subscribers after any successful call, naming entities that do not exist, and stamps the loaded record
 * as modified though nothing in it changed.
 *
 * The notice buffer, the modified flag and the tournaments and topics it names are put back as they were before `fn`
 * ran, so an enclosing call's own notices and marks survive, in their order. A draft that names no tournament marks
 * every loaded record (`UNNAMED_TOURNAMENT`): left in place, a call that wrote one record stamped them all. A provider
 * that cannot expose its buffer or set its flag back degrades as rollback does (`setNoticeBuffer`,
 * `restoreMutationStatus`): it loses the enclosing call's notices rather than delivering the draft's.
 */
export function withDraftWrites<T>(fn: () => T): T {
  const notices = getNoticeBuffer();
  const modified = readMutationStatus();
  const marks = takeMarks();
  remark(marks);
  restoreMutationStatus(modified);
  drafts += 1;
  try {
    return fn();
  } finally {
    drafts -= 1;
    setNoticeBuffer(notices);
    if (marks) takeMarks();
    remark(marks);
    restoreMutationStatus(modified);
  }
}

type Marks = { tournamentIds: string[]; topics: string[] };

/**
 * The tournaments and topics marked modified so far, cleared as they are read. `undefined` from a provider without
 * the optional hooks, which keeps its marks as before.
 */
function takeMarks(): Marks | undefined {
  const tournamentIds = cycleModifiedTournamentIds();
  const topics = cycleModifiedTopics();
  return tournamentIds && topics ? { tournamentIds: [...tournamentIds], topics: [...topics] } : undefined;
}

/**
 * marks again, in their order, what `takeMarks` read. Every mark names a tournament and a topic together
 * (`appendNotice`, `markModified`), so the shorter list's last name is repeated, which adds nothing to a set.
 */
function remark(marks?: Marks) {
  if (!marks?.tournamentIds.length || !marks.topics.length) return;
  const named = (value: string | undefined, unnamed: string) => (value === unnamed ? undefined : value);
  const { tournamentIds, topics } = marks;
  for (let at = 0; at < Math.max(tournamentIds.length, topics.length); at++)
    markModified(
      named(tournamentIds[Math.min(at, tournamentIds.length - 1)], UNNAMED_TOURNAMENT),
      named(topics[Math.min(at, topics.length - 1)], UNANNOUNCED_WRITE),
    );
}

let drafts = 0;

/** True while `withDraftWrites` runs: a writer called now writes a draft, not the record (a test's write counter asks). */
export function inDraftWrites() {
  return drafts > 0;
}
