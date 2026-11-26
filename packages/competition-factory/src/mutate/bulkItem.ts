/**
 * One item of a bulk mutation, planned and applied as its own unit (per-item atomicity, ruling 7). A refused item
 * leaves the record as it found it; an item that succeeds stays written whatever later items do.
 *
 * Returns `run()` unchanged. The boundary exists so the refusal invariant can attribute each write to the item that
 * made it: a successful item owns its writes, and a refused item must have made none. A harness observes it through
 * `setBulkItemObserver`, not a module mock, which a worker that shares modules across files would not apply.
 */
type BulkItemObserver = <T>(run: () => T) => T;
let observer: BulkItemObserver | undefined;

export function bulkItem<T>(run: () => T): T {
  return observer ? observer(run) : run();
}

/** For test harnesses (the refusal invariant): observe every bulk item. Without an argument, stop observing. */
export function setBulkItemObserver(next?: BulkItemObserver): void {
  observer = next;
}
