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
 * For a test of the catch path itself: run the enclosing `describe` (or file) under the default
 * sync provider, which catches, logs and returns `{ error }`, and put the provider back afterwards.
 *
 * Such a test expects the catch, so the provider's `ERROR {…}` log line is the expected outcome, not
 * a finding; it is dropped while the provider is installed. Any other console output still prints.
 */
export function useEngineCatch(): void {
  let previous: any;
  let logSpy: ReturnType<typeof vi.spyOn> | undefined;
  beforeAll(() => {
    previous = getProvider();
    setStateProvider(syncGlobalState);
    const log = console.log.bind(console);
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      if (args[0] !== 'ERROR') log(...args);
    });
  });
  afterAll(() => {
    logSpy?.mockRestore();
    setStateProvider(previous);
  });
}
