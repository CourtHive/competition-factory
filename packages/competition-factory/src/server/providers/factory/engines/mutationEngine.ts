import { globalState, tournamentEngineAsync } from '../../../..';
import * as governors from '@Assemblies/governors';
import asyncGlobalState from './asyncGlobalState';

// Once, at startup (see documentation/docs/engines/hosting-on-a-server.md):
// register the governors globally, so executionQueue resolves directives by name under the async provider,
// then install the async provider. Each request runs inside runWithMutationScope, never at module scope.
globalState.setStateMethods(governors, true, 1, true);
globalState.setStateProvider(asyncGlobalState);

export function getMutationEngine() {
  return tournamentEngineAsync;
}

/** Runs `fn` in its own request state: records, subscriptions and notices never reach a sibling request. */
export function runWithMutationScope<T>(fn: () => Promise<T>): Promise<T> {
  return asyncGlobalState.runWithInstanceState(fn);
}
