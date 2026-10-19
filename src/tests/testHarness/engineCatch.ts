import { getProvider, setStateProvider } from '@Global/state/globalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { afterAll, beforeAll, vi } from 'vitest';

/**
 * A TEST SEES EVERY THROW.
 *
 * Outside `devContext` the engines catch whatever a method throws, log it as `ERROR {…}` and return
 * `{ error }`. In a test that hides real crashes: a TypeError deep in a mutation comes back looking
 * like an ordinary refusal, and a test that does not inspect the result passes. Measured 2026-10-06,
 * two production crashes passed the suite that way (`publishOrderOfPlay` for a second status,
 * `removeDirectedParticipants` in a TEAM double elimination).
 *
 * `devContext` is not the switch for this. Besides rethrowing it changes what the engine produces
 * (link `structureName`s, `splitEntries`, the global log), so the suite would test something else.
 * The catch path already delegates to the state provider's `handleCaughtError`; the test provider
 * below is the sync provider with that one method rethrowing. Production is unchanged.
 */
export const rethrowingStateProvider = {
  ...syncGlobalState,
  handleCaughtError: ({ err }: { err: unknown }) => {
    throw err;
  },
};

/**
 * A test of the catch path expects the provider's `ERROR {…}` log line: it is the outcome under test, not a
 * finding. While the enclosing `describe` (or file) runs, `console.log` calls tagged `'ERROR'` are dropped;
 * every other console output still prints. Use it beside any provider that catches (sync or async).
 */
export function useQuietCaughtErrors(): void {
  let logSpy: ReturnType<typeof vi.spyOn> | undefined;
  beforeAll(() => {
    const log = console.log.bind(console);
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      if (args[0] !== 'ERROR') log(...args);
    });
  });
  afterAll(() => {
    logSpy?.mockRestore();
  });
}

/**
 * For a test of the catch path itself: run the enclosing `describe` (or file) under the default
 * sync provider, which catches, logs and returns `{ error }`, and put the provider back afterwards.
 * Its expected `ERROR {…}` log lines are dropped (see `useQuietCaughtErrors`).
 */
export function useEngineCatch(): void {
  let previous: any;
  useQuietCaughtErrors();
  beforeAll(() => {
    previous = getProvider();
    setStateProvider(syncGlobalState);
  });
  afterAll(() => {
    setStateProvider(previous);
  });
}
