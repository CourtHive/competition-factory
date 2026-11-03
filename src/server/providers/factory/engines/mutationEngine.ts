import { asyncEngine, globalState } from '../../../..';
import * as governors from '@Assemblies/governors';
import asyncGlobalState from './asyncGlobalState';

globalState.setStateProvider(asyncGlobalState);
asyncGlobalState.createInstanceState();

export function getMutationEngine() {
  const engineAsync = asyncEngine();
  if (!('importMethods' in engineAsync)) {
    throw new Error('Could not initialize async factory engine', { cause: engineAsync.error });
  }
  engineAsync.importMethods(governors, true, 1);
  globalState.setSubscriptions({ subscriptions: {} });

  return engineAsync;
}
