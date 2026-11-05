import { restoreMutationStatus, readMutationStatus, getNoticeBuffer, setNoticeBuffer } from '@Global/state/globalState';

/**
 * Runs `fn`, which writes to a DRAFT (a copy its caller made: a what-if view, a structure not yet attached), and
 * discards what those writes announced. The mutate helpers a draft is built with buffer notices and mark the
 * tournament modified as they go. Neither belongs to the engine state: left in place, the engine delivers the
 * notices to subscribers after any successful call, naming entities that do not exist, and stamps the loaded record
 * as modified though nothing in it changed.
 *
 * The notice buffer and the modified flag are put back as they were before `fn` ran, so an enclosing call's own
 * notices and flag survive. A provider that cannot expose its buffer or set its flag back degrades as rollback does
 * (`setNoticeBuffer`, `restoreMutationStatus`): it loses the enclosing call's notices rather than delivering the draft's.
 */
export function withDraftWrites<T>(fn: () => T): T {
  const notices = getNoticeBuffer();
  const modified = readMutationStatus();
  try {
    return fn();
  } finally {
    setNoticeBuffer(notices);
    restoreMutationStatus(modified);
  }
}
