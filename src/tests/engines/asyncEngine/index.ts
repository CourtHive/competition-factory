import * as governors from '@Assemblies/governors';
import async from '@Assemblies/engines/async';

/**
// NOTE: This is an example of how to use asyncEngine with asyncGlobalState
// (asyncGlobalStateIsolation.test.ts exercises it under vitest)
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setStateProvider } from '@Global/state/globalState';
setStateProvider(asyncGlobalState);
 */

const asyncEngine = async(true);
asyncEngine.importMethods(governors, true, 1);

export const competitionEngineAsync = asyncEngine;
export const tournamentEngineAsync = asyncEngine;
export default asyncEngine;
