import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { deleteNotices } from '@Global/state/globalState';

/**
 * A REFUSED QUEUE WITHOUT ROLLBACK that announces nothing: no directive committed before the refusal, or the refusing
 * method threw (mutation-engines.md § Transaction Pattern). Writes that stay are a modification, so the record is
 * stamped at THIS queue's instant; then the buffer is emptied. Left as it was, both carried over to the next successful
 * call, which delivered the refused queue's notices as its own and stamped the record at its own instant. A queue that
 * kept committed work announces it instead. The refusal carries `results`, the directives that were applied, so a
 * caller can see what persisted.
 */
export function keepWrites(timeStamp: number) {
  getMutationStatus({ timeStamp });
  deleteNotices();
}
