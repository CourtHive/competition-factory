/**
 * Observers of the engines' entry points, for test harnesses (the refusal invariant): a direct call and a queue on each
 * engine, and each directive a queue runs. An entry point reads its observer once per call. With none installed it runs
 * as it always has; with one, it hands the observer the call, and the observer runs it (synchronously, at most once) by
 * re-entering the entry point past the check.
 *
 * Installed, not module-mocked: the PR tier's shared test project keeps a worker's modules across files, and a
 * setup-file `vi.mock` does not replace a module an earlier file has already loaded, so the harness went unseen.
 */
type InvokeObserver = <T>(args: unknown, run: () => T) => T;
type QueueObserver = <T>(directives: unknown, rollbackOnError: boolean | undefined, run: () => T) => T;
type DirectiveObserver = <T>(methodName: string, run: () => T) => T;

export const engineBoundaryObservers: {
  asyncInvoke?: InvokeObserver;
  asyncQueue?: QueueObserver;
  directive?: DirectiveObserver;
  invoke?: InvokeObserver;
  queue?: QueueObserver;
} = {};
