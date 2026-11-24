// Standalone primitives and the sync engine share the same root call state, even when the engine loads later.
type CallState = {
  capturedClock?: number;
  capturedCompetitionClock?: number;
  capturedStamps?: WeakSet<object>;
  callRandomSource?: () => number;
};

export const rootCallState: CallState = {};

export function callAccessFor(current: () => CallState) {
  return {
    getCapturedClock: () => current().capturedClock,
    setCapturedClock(ms?: number) {
      current().capturedClock = ms;
    },
    getCapturedCompetitionClock: () => current().capturedCompetitionClock,
    setCapturedCompetitionClock(ms?: number) {
      current().capturedCompetitionClock = ms;
    },
    getCapturedStamps: () => current().capturedStamps,
    setCapturedStamps(stamps?: WeakSet<object>) {
      current().capturedStamps = stamps;
    },
    getCallRandomSource: () => current().callRandomSource,
    setCallRandomSource(source?: () => number) {
      current().callRandomSource = source;
    },
  };
}

type CallAccess = Partial<ReturnType<typeof callAccessFor>>;
export let callRuntime: CallAccess = callAccessFor(() => rootCallState);

// Retain the provider as the method receiver. Missing hooks on a custom provider must stay absent.
export function installCallRuntime(provider: CallAccess) {
  callRuntime = provider;
}
