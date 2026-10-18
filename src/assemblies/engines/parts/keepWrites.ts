import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { deleteNotices } from '@Global/state/globalState';

/**
 * A REFUSED QUEUE WITHOUT ROLLBACK keeps the writes of the directives before the refusal, and delivers no notices for
 * any of them (mutation-engines.md § Transaction Pattern; CA's D2, 2026-10-18). The writes are a modification, so the
 * record is stamped at THIS queue's instant; then the buffer is emptied. Left as it was, both carried over to the next
 * successful call, which delivered the refused queue's notices as its own and stamped the record at its own instant.
 * The refusal carries `results`, the directives that were applied, so a caller can see what persisted.
 */
export function keepWrites(timeStamp: number) {
  getMutationStatus({ timeStamp });
  deleteNotices();
}
